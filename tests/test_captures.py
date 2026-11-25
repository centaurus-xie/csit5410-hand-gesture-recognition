import json
from uuid import uuid4
import pytest
from gesture.captures import store, read_captures
from gesture.features import FEATURE_VERSION
from test_features import points


def test_project_save_retry_and_split(tmp_path):
    db = tmp_path/'digits.sqlite3'
    row = dict(schema_version=1, feature_version=FEATURE_VERSION, sample_id=str(uuid4()), person_id='p1', session_id='s1', source_id='webcam-stable-digit', dataset_split='train', created_at='now', predicted_label='9', model_name='test',confidence=.91, label='6',handedness='Right', world_landmarks=points(),thumbnail='browser-only')
    store(row, db)
    store(row, db)
    [saved] = read_captures(db)
    assert (saved['label'],saved['predicted_label']) == ('6','9')
    assert 'thumbnail' not in saved
    with pytest.raises(ValueError,match='another split'):
        store(dict(row,sample_id=str(uuid4()),dataset_split='test'),db)
    with pytest.raises(ValueError,match='different data'):
        store(dict(row,label='1'),db)


def test_correct_saved_label(tmp_path):
    db = tmp_path/'digits.sqlite3'
    row = dict(schema_version=1,feature_version=FEATURE_VERSION,sample_id=str(uuid4()),person_id='p1',session_id='s1',source_id='webcam',dataset_split='train',created_at='now',label='6',handedness='Right',world_landmarks=points())
    store(row, db)
    updated = dict(row,label='9',previous_label='6')
    store(updated, db)
    store(updated, db)
    assert [r['label'] for r in read_captures(db)] == ['9']
    with pytest.raises(ValueError,match='different data'):
        store(dict(updated,label='4'), db)
