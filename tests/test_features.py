import json
import subprocess
from pathlib import Path
import numpy as np
import pytest
from gesture.features import features
from gesture.train import load_splits

ROOT=Path(__file__).resolve().parents[1]
def points():
    return [{'x':np.sin(i*.7)*.04,'y':i*.01,'z':np.cos(i*.3)*.01} for i in range(21)]

def test_python_browser_feature_parity(tmp_path):
    p=points()
    path=tmp_path/'points.json'
    path.write_text(json.dumps(p))
    code="import {features} from './web/src/features.ts'; import fs from 'node:fs'; console.log(JSON.stringify(features(JSON.parse(fs.readFileSync(process.argv[1],'utf8')),'Right').combined));"
    result=subprocess.run(['node','--import','tsx','--input-type=module','-e',code,str(path)],cwd=ROOT,capture_output=True,text=True,check=True)
    np.testing.assert_allclose(features(p,'Right')['combined'],json.loads(result.stdout),atol=1e-10)

def test_degenerate_rejected():
    with pytest.raises(ValueError):
        features([{'x':0,'y':0,'z':0}]*21,'Right')

def test_split_leakage_rejected(tmp_path):
    with pytest.raises(ValueError,match='overlap'):
        load_splits(tmp_path/'absent',{'train':['p1'],'val':['p1'],'test':['p2']},'combined')
