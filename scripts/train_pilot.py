"""Exploratory image-level baseline; NOT participant-independent evaluation.
Run: .venv/bin/python scripts/train_pilot.py
"""
import hashlib
import json
from collections import Counter
from pathlib import Path
import joblib
import numpy as np
from PIL import Image, ImageOps
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode
from sklearn.model_selection import train_test_split
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

def main():
 OUT.mkdir(parents=True, exist_ok=True)
 records, failures, seen = [], [], set()
 options=HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(ROOT/'web/public/models/hand_landmarker.task'),delegate=BaseOptions.Delegate.CPU),running_mode=RunningMode.IMAGE,num_hands=2,min_hand_detection_confidence=.6,min_hand_presence_confidence=.6)
 with HandLandmarker.create_from_options(options) as detector:
  for folder,label in MAPPING.items():
   for path in sorted((ROOT/'data/Dataset'/folder).glob('*')):
    if path.suffix.lower() not in ('.jpg','.jpeg','.png'): continue
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
     records.append(dict(path=str(path.relative_to(ROOT)),label=label,variant=folder,sha256=digest,person_id=None,world_landmarks=points,handedness=hand,features={k:v.tolist() for k,v in fs.items()}))
    except (ValueError,RuntimeError,OSError) as e: failures.append(dict(path=str(path.relative_to(ROOT)),error=str(e)))
   print(folder, len(records), 'usable so far',flush=True)
 (OUT/'samples.json').write_text(json.dumps(records))
 (OUT/'failures.json').write_text(json.dumps(failures,indent=2))
 y=np.array([r['label'] for r in records]); ids=np.arange(len(y))
 train,rest=train_test_split(ids,test_size=.3,stratify=y,random_state=42)
 val,test=train_test_split(rest,test_size=.5,stratify=y[rest],random_state=42)
 splits={'train':train,'val':val,'test':test}
 (OUT/'split_paths.json').write_text(json.dumps({k:[records[i]['path'] for i in v] for k,v in splits.items()},indent=2))
 summary={'protocol':'Exploratory stratified image split 70/15/15, seed 42; participant identities unavailable; NOT subject-independent. Near duplicates may remain. No hyperparameter tuning.','mapping':MAPPING,'extracted':len(records),'failed':len(failures),'class_counts':dict(Counter(y)),'experiments':[]}
 for feature_set in ('coordinates','geometry','combined'):
  x=np.array([r['features'][feature_set] for r in records])
  for name,estimator in [('svm',SVC(C=1,kernel='rbf')),('mlp',MLPClassifier(hidden_layer_sizes=(64,32),max_iter=500,random_state=42))]:
   model=make_pipeline(StandardScaler(),estimator); model.fit(x[train],y[train])
   dest=OUT/f'{name}-{feature_set}';dest.mkdir(exist_ok=True)
   joblib.dump(model,dest/'model.joblib')
   result={'classifier':name,'features':feature_set,'classes':estimator.classes_.tolist()}
   for key,idx in [('val',val),('test',test)]:
    pred=model.predict(x[idx]);result[key]={'n':len(idx),'accuracy':accuracy_score(y[idx],pred),'macro_f1':f1_score(y[idx],pred,average='macro'),'confusion_matrix':confusion_matrix(y[idx],pred,labels=estimator.classes_).tolist()}
   if name=='mlp':
    (dest/'classifier.json').write_text(json.dumps(export_mlp(model,feature_set)))
    (dest/'parity.json').write_text(json.dumps({'vectors':x[val][:10].tolist(),'probabilities':model.predict_proba(x[val][:10]).tolist()}))
   summary['experiments'].append(result)
 (OUT/'metrics.json').write_text(json.dumps(summary,indent=2))
 print(json.dumps(summary,indent=2))
if __name__=='__main__': main()
