"""Train a digit candidate on the frozen image split plus locally reviewed landmarks."""
import json
from collections import Counter
from pathlib import Path
import numpy as np
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import accuracy_score, f1_score
from gesture.captures import read_captures, ROOT
from gesture.features import features
from gesture.train import export_mlp


def train(base, rows, output, representation="combined"):
    def vector(row):
        cached = row.get("features", {})
        if representation in cached:
            return cached[representation]
        return features(row["world_landmarks"],row["handedness"])[representation].tolist()
    images = {r['path']:r for r in json.loads((base/'samples.json').read_text())}
    splits = json.loads((base/'split_paths.json').read_text())
    data = {s:[(vector(images[p]), images[p]['label']) for p in splits[s]] for s in ('train','val','test')}
    local = {s:[] for s in data}
    for r in rows:
        local[r['dataset_split']].append((vector(r),r['label']))
    if not local['train']:
        raise ValueError('Confirm at least one Training sample in the app first.')
    x,y = zip(*(data['train'] + local['train']))
    model = make_pipeline(StandardScaler(), MLPClassifier(hidden_layer_sizes=(64,32),max_iter=500,random_state=42)).fit(np.asarray(x),y)
    metrics = {'local_counts':dict(Counter(r['dataset_split'] for r in rows)), 'image_train':len(data['train'])}
    for split in ('val','test'):
        for name, records in [('image',data[split]),('local',local[split])]:
            if records:
                vectors, labels = zip(*records)
                pred = model.predict(np.asarray(vectors))
                metrics[f'{name}_{split}'] = {'n':len(labels),'accuracy':accuracy_score(labels,pred),'macro_f1':f1_score(labels,pred,average='macro',zero_division=0)}
    output.mkdir(parents=True,exist_ok=True)
    vectors = [v for v,_ in data['val'][:10]]
    for name, obj in [('classifier',export_mlp(model,representation)),('metrics',metrics),('parity',{'vectors':vectors,'probabilities':model.predict_proba(vectors).tolist()})]:
        (output/f'{name}.json').write_text(json.dumps(obj,indent=2,allow_nan=False))
    print(json.dumps(metrics,indent=2))

if __name__ == '__main__':
    base = ROOT/'artifacts/digits-0-9'
    if not (base/'split_paths.json').exists() or not (base/'samples.json').exists():
        raise SystemExit('Prepare the base image data with scripts/train_pilot.py --expanded first.')
    try:
        rows = read_captures()
        for representation in ('combined','shape'):
            train(base, rows, ROOT/f'artifacts/digits-reviewed/mlp-{representation}', representation)
    except ValueError as exc:
        raise SystemExit(str(exc))
