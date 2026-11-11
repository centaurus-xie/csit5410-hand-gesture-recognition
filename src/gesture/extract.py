"""Extract single-hand world landmarks from an explicitly labelled image manifest."""
import argparse
import csv
import json
from pathlib import Path
from .features import FEATURE_VERSION, features

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--model', type=Path, default=Path('web/public/models/hand_landmarker.task'))
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    with args.manifest.open(newline='') as f:
        reader = csv.DictReader(f)
        required = {'sample_id','image_path','person_id','session_id','source_id','label'}
        if not required.issubset(reader.fieldnames or []):
            parser.error(f'Manifest needs columns: {sorted(required)}')
        rows = list(reader)
    ids = [r['sample_id'] for r in rows]
    if len(set(ids)) != len(ids):
        parser.error('Duplicate sample_id in manifest')
    valid_labels = {str(n) for n in range(1,11)} | {'unknown'}
    if any(not all(r[k].strip() for k in required) or r['label'] not in valid_labels for r in rows):
        parser.error('Metadata must be nonempty; labels must be 1–10 or unknown')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    options = vision.HandLandmarkerOptions(base_options=python.BaseOptions(model_asset_path=str(args.model),delegate=python.BaseOptions.Delegate.CPU),num_hands=2,running_mode=vision.RunningMode.IMAGE,min_hand_detection_confidence=.6,min_hand_presence_confidence=.6)
    failures = []
    success = 0
    with vision.HandLandmarker.create_from_options(options) as detector, args.output.open('w') as out:
        for row in rows:
            try:
                path = Path(row['image_path'])
                if not path.is_absolute():
                    path = args.manifest.parent/path
                image = mp.Image.create_from_file(str(path))
                result = detector.detect(image)
                if len(result.hand_world_landmarks) != 1:
                    raise ValueError(f'Expected one hand, detected {len(result.hand_world_landmarks)}')
                hand = result.handedness[0][0].category_name
                points = [{'x':p.x,'y':p.y,'z':p.z} for p in result.hand_world_landmarks[0]]
                features(points, hand)
                record = {**row,'schema_version':1,'feature_version':FEATURE_VERSION,'handedness':hand,'world_landmarks':points}
                out.write(json.dumps(record,allow_nan=False)+'\n')
                success += 1
            except (ValueError, RuntimeError, OSError) as exc:
                failures.append({**row,'error':str(exc)})
    report = {'total':len(rows),'extracted':success,'failed':len(failures),'failures':failures}
    args.output.with_suffix('.failures.json').write_text(json.dumps(report,indent=2))
    print(f'Extracted {success}/{len(rows)} images; see {args.output.with_suffix(".failures.json")}')
    if not success:
        raise SystemExit('No usable samples extracted')

if __name__ == '__main__':
    main()
