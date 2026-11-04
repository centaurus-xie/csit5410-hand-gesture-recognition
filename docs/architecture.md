# Feature and model contracts

## Coordinate convention

Both runtimes use MediaPipe **world landmarks**, never a mixture of normalized image X/Y and relative image Z. Preview rendering uses image landmarks only. Inference input is unmirrored camera data; CSS alone mirrors the preview. Keep the same detector conventions for imported images.

`world-single-v1` subtracts wrist (index 0), divides by wrist-to-middle-MCP distance (index 9), and reflects the X coordinate for a reported Left hand. It does not remove camera-frame rotation. Invalid/degenerate geometry is rejected. MediaPipe's estimated 3D positions are not calibrated depth measurements.

Feature order:

1. Coordinates: points 0–20, each X, Y, Z (63 values).
2. Geometry: two interior joint angles per finger (thumb to pinky), normalized by pi (10); adjacent non-thumb finger direction angles / pi (3); thumb-tip distances to index/middle/ring/pinky tips (4); unit cross-product normal from wrist→index MCP and wrist→pinky MCP (3).
3. Combined: coordinates then geometry (83).

An interior joint angle of 1 means straight. The UI shows `1 - mean(angle)` as a bend indicator. This is a geometric proxy, not an anatomical joint-angle measurement. The normal's orientation follows the canonicalized point ordering.

## Model artifact

The browser accepts multiclass ReLU MLPs exported by `gesture-train --classifier mlp`, with at least three classes, a matching feature version, finite scaler parameters, and compatible layer dimensions. It applies the train-fitted StandardScaler, hidden ReLU layers, then softmax. `scripts/check-model-parity.mjs` compares predictions with saved Python validation outputs. SVM stays offline in phase 1.

## Prediction gate

A supported numeric prediction needs score >= 0.8 and an unchanged label for 600 ms. A held label produces one event. Changing to another stable label allows another event; 350 ms without an eligible prediction rearms the same label. These constants are uncalibrated prototype defaults. Scores are not guaranteed probabilities of correctness, and rejection is not a complete open-set detector.

## Privacy and persistence

Camera frames stay in the browser. No server receives them. Landmarks and sample metadata are held in memory until JSONL export; leaving the page loses unsaved samples. The page warns before leaving if samples exist, even if they have already been exported. Model files are loaded locally through a file picker. Audio files are served from the local app. Initial package/model installation requires network access.
