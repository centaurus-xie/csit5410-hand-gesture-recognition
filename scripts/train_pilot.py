"""Exploratory image-level baseline; NOT participant-independent evaluation.
Run: .venv/bin/python scripts/train_pilot.py
"""
import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
import joblib
import numpy as np
from PIL import Image, ImageOps
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix
from gesture.features import features
from gesture.train import export_mlp

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'artifacts/pilot'
MAPPING = {**{str(i): str(i) for i in range(6)}, '3_vertion1':'3', '3_vertion2':'3', '8_hk':'8', 'undefind_gesture1':'unknown', 'undefind_gesture2':'unknown'}

def split_photo_groups(records, mapping):
 # Partition originals before augmentation. Only training uses transformed copies.
 by_label = defaultdict(set)
 by_variant = defaultdict(set)
 for row in records:
  if row['original']:
   by_label[row['label']].add(row['photo_group'])
   by_variant[row['variant']].add(row['photo_group'])
 rng = np.random.default_rng(42)
 assignment = {}
 for label in sorted(set(mapping.values())):
  groups = sorted(by_label[label])
  if len(groups) < 3:
   raise ValueError(f'{label}: need at least three usable originals, found {len(groups)}')
  variants = [sorted(by_variant[folder]) for folder in sorted(mapping)
              if mapping[folder] == label and by_variant[folder]]
  # Reserve holdouts per variant when each variant has enough originals.
  # Keep tiny variants in training if another variant can supply both holdouts.
  if not any(len(variant) >= 3 for variant in variants):
   variants = [groups]
  for variant in variants:
   rng.shuffle(variant)
   holdout = max(1, round(len(variant) * .15)) if len(variant) >= 3 else 0
   for index, group in enumerate(variant):
    assignment[group] = 'test' if index < holdout else 'val' if index < 2 * holdout else 'train'
 return {split: np.array([
  i for i, row in enumerate(records)
  if assignment.get(row['photo_group']) == split and (split == 'train' or row['original'])
 ], dtype=int) for split in ('train', 'val', 'test')}

def main():
 parser = argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--expanded', action='store_true', help='Include locally collected 6, 7 and 9')
 parser.add_argument('--variants', type=Path,
                     help='JSON mapping additional dataset folder names to digit labels')
 parser.add_argument('--reuse-samples', action='store_true', help='Train from the previously extracted samples for this mode')
 args = parser.parse_args()
 mapping = dict(MAPPING)
 if args.expanded:
  mapping.update({f'{digit}_need_to_make': digit for digit in ('6', '7', '9')})
 if args.variants:
  if args.reuse_samples:
   parser.error('Extract fresh samples when using --variants')
  try:
   extra = json.loads(args.variants.read_text())
  except (OSError, ValueError) as exc:
   parser.error(f'Invalid variant file: {exc}')
  if not isinstance(extra, dict) or not extra:
   parser.error('Variant file must be a nonempty JSON object')
  dataset = ROOT / 'data/Dataset'
  for folder, label in extra.items():
   if (folder in mapping or not folder or folder.startswith('.')
       or Path(folder).name != folder or not (dataset / folder).is_dir()):
    parser.error(f'Expected a new folder inside data/Dataset: {folder!r}')
   if label not in [str(n) for n in range(11)] + ['unknown']:
    parser.error(f'Invalid digit label for {folder!r}: {label!r}')
  mapping.update(extra)
 if args.variants:
  out = OUT.with_name('digits-variants')
 else:
  out = OUT.with_name('digits-0-9') if args.expanded else OUT
 out.mkdir(parents=True, exist_ok=True)
 samples_path = out / 'samples.json'
 failures_path = out / 'failures.json'
 if args.reuse_samples:
  if not samples_path.is_file() or not failures_path.is_file():
   parser.error(f'No saved extraction in {out}; run without --reuse-samples first')
  records = json.loads(samples_path.read_text())
  failures = json.loads(failures_path.read_text())
  if any(mapping.get(row.get('variant')) != row.get('label') for row in records):
   parser.error('Saved samples do not match the requested label mapping')
 else:
  records, failures, seen = [], [], set()
  options=HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(ROOT/'web/public/models/hand_landmarker.task'),delegate=BaseOptions.Delegate.CPU),running_mode=RunningMode.IMAGE,num_hands=2,min_hand_detection_confidence=.6,min_hand_presence_confidence=.6)
  with HandLandmarker.create_from_options(options) as detector:
   for folder,label in mapping.items():
    for path in sorted((ROOT/'data/Dataset'/folder).glob('*')):
     if path.suffix.lower() not in ('.jpg','.jpeg','.png'): continue
     original = '__' not in path.stem
     photo_group = f"{folder}/{path.stem.split('__', 1)[0]}"
     try:
      with Image.open(path) as im: pixels=np.asarray(ImageOps.exif_transpose(im).convert('RGB')).copy()
      digest=hashlib.sha256(pixels.tobytes()).hexdigest()
      if digest in seen: raise ValueError('Duplicate decoded pixels')
      seen.add(digest)
      result=detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=pixels))
      if len(result.hand_world_landmarks)!=1: raise ValueError(f'Hands detected: {len(result.hand_world_landmarks)}')
      points=[dict(x=p.x,y=p.y,z=p.z) for p in result.hand_world_landmarks[0]]
      hand=result.handedness[0][0].category_name
      fs=features(points,hand)
      records.append(dict(path=str(path.relative_to(ROOT)),label=label,variant=folder,photo_group=photo_group,original=original,sha256=digest,person_id=None,world_landmarks=points,handedness=hand,features={k:v.tolist() for k,v in fs.items()}))
     except (ValueError,RuntimeError,OSError) as e: failures.append(dict(path=str(path.relative_to(ROOT)),error=str(e)))
    print(folder, len(records), 'usable so far',flush=True)
  (out/'samples.json').write_text(json.dumps(records))
  (out/'failures.json').write_text(json.dumps(failures,indent=2))
 y=np.array([r['label'] for r in records])
 splits = split_photo_groups(records, mapping)
 train, val = splits['train'], splits['val']
 (out/'split_paths.json').write_text(json.dumps({k:[records[i]['path'] for i in v] for k,v in splits.items()},indent=2))
 summary={'protocol':'Exploratory grouped split by original photo, stratified by variant where possible, approximately 70/15/15 (seed 42). Validation and test use originals only; training may use augmentation. Participant identities unavailable; NOT subject-independent.','mapping':mapping,'extracted':len(records),'failed':len(failures),'class_counts':dict(Counter(y)),'experiments':[]}
 for feature_set in ('coordinates','geometry','combined'):
  x=np.array([r['features'][feature_set] for r in records])
  for name,estimator in [('svm',SVC(C=1,kernel='rbf')),('mlp',MLPClassifier(hidden_layer_sizes=(64,32),max_iter=500,random_state=42))]:
   model=make_pipeline(StandardScaler(),estimator); model.fit(x[train],y[train])
   dest=out/f'{name}-{feature_set}';dest.mkdir(exist_ok=True)
   joblib.dump(model,dest/'model.joblib')
   result={'classifier':name,'features':feature_set,'classes':estimator.classes_.tolist()}
   for key in ('val', 'test'):
    idx = splits[key]
    pred=model.predict(x[idx]);result[key]={'n':len(idx),'accuracy':accuracy_score(y[idx],pred),'macro_f1':f1_score(y[idx],pred,average='macro'),'class_counts':dict(Counter(y[idx])),'confusion_matrix':confusion_matrix(y[idx],pred,labels=estimator.classes_).tolist()}
    by_variant = {}
    for i, correct in zip(idx, pred == y[idx]):
     variant = records[i]['variant']
     counts = by_variant.setdefault(variant, {'samples': 0, 'correct': 0})
     counts['samples'] += 1
     counts['correct'] += int(correct)
    result[key]['by_variant'] = by_variant
   if name=='mlp':
    (dest/'classifier.json').write_text(json.dumps(export_mlp(model,feature_set)))
    (dest/'parity.json').write_text(json.dumps({'vectors':x[val][:10].tolist(),'probabilities':model.predict_proba(x[val][:10]).tolist()}))
   summary['experiments'].append(result)
 (out/'metrics.json').write_text(json.dumps(summary,indent=2))
 print(json.dumps(summary,indent=2))
if __name__=='__main__': main()
