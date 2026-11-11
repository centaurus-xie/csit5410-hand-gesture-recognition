# Phase 1 report — 30 October 2026

## Outcome

A working local scaffold is ready for data collection and model experiments on `dev/yr-xie`. No commit or push was performed. There is no trained real-world number recognizer or bundled Cantonese recording yet.

## Implemented

- TypeScript/Vite browser workbench with local camera processing and MediaPipe landmarks.
- CPU hand tracking, mirrored preview, camera start/stop, and visible error states.
- Single-hand acceptance; multiple detected hands are rejected rather than silently selecting one.
- Shared feature contract: 63 normalized coordinates, 20 geometric features, or their 83-dimensional concatenation.
- Geometric features: 10 joint angles, 3 adjacent-finger direction angles, 4 normalized thumb-to-fingertip distances, and a 3-component palm normal.
- Left-hand reflection normalization while retaining canonical camera-frame orientation.
- Manual JSONL sample export with participant, session, source, label, and raw world landmarks.
- Image manifest extraction CLI with per-image failure records.
- SVM baseline and small MLP training with explicit participant-disjoint train/validation/test sets.
- Validation/test reports: accuracy, macro-F1, per-class scores, and confusion matrices.
- JSON MLP export and browser inference with scaler parameters and schema validation.
- Prototype 600 ms stability gate and 350 ms release rearm to suppress duplicate speech events.
- Cantonese MP3 playback interface, manual control, opt-in automatic playback, and missing-file feedback.
- npm lockfile, Python project configuration, local Python 3.12 virtual environment, and an exact local dependency snapshot.

## Verification completed

| Check | Result |
| --- | --- |
| TypeScript type check and production build | Passed |
| TypeScript tests | 6 passed: invariance, handedness reflection, bad geometry, stability, duplicate suppression, malformed models |
| Python tests | 3 passed: browser/Python feature parity, degenerate input rejection, participant overlap rejection |
| Synthetic SVM and MLP training smoke runs | Passed; synthetic metrics are not project results |
| Exported MLP Python/browser probability parity | Maximum absolute difference approximately 3.3e-16 |
| Desktop and mobile browser layout | Inspected screenshots; no horizontal overflow at 390 px |
| Chrome simulated camera | Local WASM/model loaded; no-hand state and stop control passed |
| Invalid classifier file | Rejected with visible feedback |
| Python MediaPipe CPU inference | Empty image correctly returned zero hands outside the sandbox |
| Git whitespace check | Passed |

Synthetic training artifacts are ignored under `artifacts/smoke/`; they are not loaded by default or shipped as a usable classifier. Browser tests used a simulated video source, not the user's physical camera. Real hand capture, successful numeric classification, and audible playback still require manual checks with data and recordings.

## Environment caveats

- Tested with macOS arm64, Node 25.9.0, Python 3.12.14, MediaPipe 0.10.21, and scikit-learn 1.9.1.
- The published MediaPipe 0.10.21 macOS wheel installs and runs locally, but its internal WHEEL metadata reports an x86_64 tag. `pip check` therefore reports that MediaPipe is unsupported on this arm64 platform. No metadata was patched. Runtime CPU inference passed; resolve this packaging warning before calling the environment fully portable.
- Sandboxed Python MediaPipe initialization could not create a graphics context. The same CPU inference succeeded with normal local execution. This affects sandbox verification, not an established claim about other machines.
- Python dependencies are range-constrained in `pyproject.toml`; `requirements-macos-py312.txt` is a local snapshot rather than a universal lockfile.
- Inference currently runs on the browser main thread at a target maximum of about 15 Hz. This is not a measured performance guarantee; a worker can follow if UI responsiveness requires it.

## Next stage

1. Approve the actual 1–10 hand shapes; resolve whether any require two hands.
2. Select permitted image data and create a manifest with honest subject metadata.
3. Inspect detection failures and feature distributions before training.
4. Run coordinate-only, geometry-only, and combined ablations with identical splits.
5. Test on unseen participants and non-target poses; calibrate rejection and hold thresholds on validation data.
6. Add ten Cantonese recordings and test playback on target browsers.
7. Measure end-to-end latency and false/repeated triggers with real hands.

## Team handoff

- Data owner: `data/README.md`, image manifest, gesture specification, participant splits.
- Model owner: `src/gesture/`, feature ablations, model artifacts, evaluation.
- Product owner: `web/`, camera UI, classifier loading, Cantonese playback, user testing.

Suggested commit title: `feat: scaffold static gesture workbench and training pipeline`
