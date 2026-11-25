"""Local reviewed landmarks shared by the webcam UI and the digit trainer."""
import json
import math
import sqlite3
import sys
from pathlib import Path
from uuid import UUID
from .features import FEATURE_VERSION, features

ROOT = Path(__file__).resolve().parents[2]
DATABASE = ROOT / 'data/local-captures/digits.sqlite3'
LABELS = {*map(str, range(11)), 'unknown'}


def store(row, database=DATABASE):
    UUID(row['sample_id'])
    if row['schema_version'] != 1 or row['feature_version'] != FEATURE_VERSION:
        raise ValueError('Unsupported landmark format')
    if row['label'] not in LABELS or row['dataset_split'] not in ('train', 'val', 'test'):
        raise ValueError('Invalid digit label or dataset split')
    for field in ('person_id', 'session_id'):
        if not isinstance(row[field], str) or not 1 <= len(row[field].strip()) <= 40:
            raise ValueError('Set participant and session before saving')
        row[field] = row[field].strip()
    keys = ['schema_version', 'feature_version', 'sample_id', 'person_id', 'session_id', 'source_id', 'created_at', 'dataset_split', 'label', 'handedness', 'world_landmarks']
    if row['source_id'] == 'webcam-stable-digit':
        if row['predicted_label'] not in LABELS or not 0 <= row['confidence'] <= 1:
            raise ValueError('Invalid prediction')
        keys += ['predicted_label', 'confidence', 'model_name']
    elif row['source_id'] != 'webcam':
        raise ValueError('Unknown capture source')
    for point in row['world_landmarks']:
        if set(point) != {'x','y','z'} or not all(math.isfinite(v) for v in point.values()):
            raise ValueError('Invalid world landmarks')
    features(row['world_landmarks'], row['handedness'])
    payload = json.dumps({k:row[k] for k in keys}, sort_keys=True, allow_nan=False)
    database.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database) as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY, person TEXT, split TEXT, payload TEXT)')
        old = db.execute('SELECT payload FROM captures WHERE id=?', (row['sample_id'],)).fetchone()
        if old and old[0] != payload:
            previous = json.loads(old[0])
            if (row.get('previous_label') != previous['label']
                    or dict(previous, label=row['label']) != json.loads(payload)):
                raise ValueError('Sample ID already saved with different data')
            db.execute('UPDATE captures SET payload=? WHERE id=?', (payload,row['sample_id']))
        if db.execute('SELECT 1 FROM captures WHERE person=? AND split<>?', (row['person_id'],row['dataset_split'])).fetchone():
            raise ValueError('This participant already belongs to another split. Use their original split.')
        db.execute('INSERT OR IGNORE INTO captures VALUES (?,?,?,?)', (row['sample_id'],row['person_id'],row['dataset_split'],payload))


def read_captures(database=DATABASE):
    if not database.exists():
        return []
    with sqlite3.connect(f'{database.as_uri()}?mode=ro', uri=True) as db:
        return [json.loads(payload) for payload, in db.execute('SELECT payload FROM captures ORDER BY id')]


if __name__ == '__main__':
    try:
        store(json.load(sys.stdin))
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(2)
