# Local model artifacts

Training writes `model.joblib` and `metrics.json` to the chosen output directory. Never load an untrusted joblib file. MLP training also exports `classifier.json` for the browser and `parity.json` for checking browser/Python probabilities. SVM is an offline comparison baseline and is not browser-exported in this phase.

No trained number classifier is included. Only the pretrained MediaPipe landmark detector is downloaded by `npm run assets`.
