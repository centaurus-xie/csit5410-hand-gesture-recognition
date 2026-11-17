# Pilot baseline — 2026-11-13

Source: https://github.com/ardamavi/Sign-Language-Digits-Dataset (Apache-2.0; see upstream attribution and license). Cite Mavi (2020), A New Dataset and Proposed Convolutional Neural Network Architecture for Classification of American Sign Language Digits. Local folders are a project-specific relabeling, not validated HKSL.

## Scope and protocol

Classes: 0, 1, 2, 3, 4, 5, 8, unknown. Both 3 variants merged; two undefined folders mapped to unknown. Excluded 6/7/9 placeholders (33/3/3 images) and unprocessed inputs. No participant IDs inferred.

2,062 input images; 1,647 extracted; 415 failed. No-hand/two-hand/invalid images are excluded and logged. Metrics are conditional on extraction success, not end-to-end accuracy.

Fixed seed 42, stratified image split 70/15/15; same split for six fixed configurations. No hyperparameter tuning. Participant overlap and near-duplicate leakage are possible: these results DO NOT measure unseen-person generalization. Unknown comprises only two known pose families, not arbitrary unknown gestures.

| Model | Features | Validation accuracy | Test accuracy | Test macro-F1 |
|---|---|---:|---:|---:|
| svm | coordinates | 0.9960 | 0.9919 | 0.9902 |
| mlp | coordinates | 0.9960 | 0.9960 | 0.9945 |
| svm | geometry | 1.0000 | 0.9919 | 0.9915 |
| mlp | geometry | 0.9879 | 0.9919 | 0.9906 |
| svm | combined | 0.9960 | 0.9879 | 0.9859 |
| mlp | combined | 1.0000 | 0.9919 | 0.9908 |

## Reproduce

Run from repository root: `.venv/bin/python scripts/train_pilot.py`. Outputs are ignored under `artifacts/pilot/`: extracted samples, failure log, exact split paths, metrics and all six models. MLP directories include browser classifier JSON and parity fixtures.

For the demo, load `artifacts/pilot/mlp-combined/classifier.json` manually. Chosen among MLPs by validation accuracy, not test score. Python/browser parity max error: 2.22e-16. No audio recordings bundled.

Next: review failed extraction by class; gather independently identified new participants for all eight classes; freeze the model and evaluate the complete camera pipeline, including detection failures and unknown rejection. Do not tune against this new final test set.
