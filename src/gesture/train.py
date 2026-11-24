"""Fit a classifier with explicit, disjoint participant splits; export browser MLP."""
import argparse
import json
import warnings
from pathlib import Path
import joblib
import numpy as np
from sklearn.exceptions import ConvergenceWarning
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from .features import FEATURE_VERSION, features

VALID_LABELS = {str(i) for i in range(0,11)} | {'unknown'}

def load_splits(path, splits, feature_set):
    groups = {key:set(splits.get(key,[])) for key in ('train','val','test')}
    if any(not g for g in groups.values()):
        raise ValueError('Every split must contain participant IDs')
    if any(groups[a]&groups[b] for a,b in (('train','val'),('train','test'),('val','test'))):
        raise ValueError('Participants overlap between splits')
    data = {key:[] for key in groups}
    seen = set()
    for line in Path(path).read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get('feature_version') != FEATURE_VERSION or row.get('schema_version') != 1:
            raise ValueError('Incompatible sample schema or feature version')
        sample = row.get('sample_id')
        if not sample or sample in seen:
            raise ValueError('Missing or duplicate sample_id')
        seen.add(sample)
        if row.get('label') not in VALID_LABELS or not row.get('session_id') or not row.get('source_id'):
            raise ValueError('Invalid label or missing sample metadata')
        matches = [key for key,g in groups.items() if row.get('person_id') in g]
        if len(matches) != 1:
            raise ValueError(f'Participant {row.get("person_id")} missing from split configuration')
        if 'dataset_split' in row and row['dataset_split'] != matches[0]:
            raise ValueError(f'Recorded dataset split conflicts with participant split for {sample}')
        data[matches[0]].append((features(row['world_landmarks'],row['handedness'])[feature_set], row['label']))
    if any(not rows for rows in data.values()):
        raise ValueError('Every split must have usable samples')
    classes = {v[1] for v in data['train']}
    if len(classes) < 3:
        raise ValueError('At least three training classes are required for multiclass export')
    for key in ('val','test'):
        if {v[1] for v in data[key]} != classes:
            raise ValueError(f'{key} must cover exactly the training classes')
    return {key:(np.stack([v[0] for v in rows]), np.array([v[1] for v in rows])) for key,rows in data.items()}

def export_mlp(pipeline, feature_set):
    scaler, model = pipeline.steps[0][1], pipeline.steps[1][1]
    return {'feature_version':FEATURE_VERSION,'feature_set':feature_set,'classes':model.classes_.tolist(),
            'mean':scaler.mean_.tolist(),'scale':scaler.scale_.tolist(),
            'weights':[w.tolist() for w in model.coefs_],'biases':[b.tolist() for b in model.intercepts_]}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('samples',type=Path)
    parser.add_argument('--splits',type=Path,required=True)
    parser.add_argument('--features',choices=['coordinates','geometry','combined'],default='combined')
    parser.add_argument('--classifier',choices=['svm','mlp'],default='svm')
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    split_spec = json.loads(args.splits.read_text())
    data = load_splits(args.samples,split_spec,args.features)
    estimator = SVC(C=1,kernel='rbf') if args.classifier=='svm' else MLPClassifier(hidden_layer_sizes=(64,32),activation='relu',solver='adam',max_iter=500,random_state=42,early_stopping=False)
    pipeline = make_pipeline(StandardScaler(),estimator)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always',ConvergenceWarning)
        pipeline.fit(*data['train'])
    args.output.mkdir(parents=True,exist_ok=True)
    joblib.dump(pipeline,args.output/'model.joblib')
    labels = estimator.classes_.tolist()
    report = {'feature_version':FEATURE_VERSION,'feature_set':args.features,'classifier':args.classifier,'splits':split_spec,'classes':labels,'training_warnings':[str(w.message) for w in caught]}
    for key in ('val','test'):
        x,y = data[key]
        prediction = pipeline.predict(x)
        report[key] = {'samples':len(y),'accuracy':float(accuracy_score(y,prediction)),'macro_f1':float(f1_score(y,prediction,average='macro',zero_division=0)),
                       'confusion_matrix':confusion_matrix(y,prediction,labels=labels).tolist(),'classification_report':classification_report(y,prediction,labels=labels,output_dict=True,zero_division=0)}
    report['counts']={key:len(y) for key,(_,y) in data.items()}
    (args.output/'metrics.json').write_text(json.dumps(report,indent=2))
    if args.classifier=='mlp':
        (args.output/'classifier.json').write_text(json.dumps(export_mlp(pipeline,args.features),allow_nan=False))
        # Fixed validation vectors allow the browser implementation to be parity-tested.
        x = data['val'][0][:10]
        (args.output/'parity.json').write_text(json.dumps({'vectors':x.tolist(),'probabilities':pipeline.predict_proba(x).tolist()}))
    print(f'Wrote model and evaluation to {args.output}; test metrics are for final reporting, not tuning.')

if __name__ == '__main__':
    main()
