# Local data

Images and generated samples are ignored by Git. Do not add a dataset until its source and reuse conditions are verified.

Image extraction accepts a CSV manifest with these required columns:

```csv
sample_id,image_path,person_id,session_id,source_id,label
capture-001,images/example.jpg,p01,s01,self-collected,1
```

This row is a format example, not an included image. Paths are relative to the manifest. Labels are `1` through `10`, or `unknown` for an intentionally labelled non-target pose. Never fabricate participant IDs for unknown people; acquire independently identified samples for participant-based evaluation. IDs must be globally unique across imported datasets. All augmented variants of a source image must stay with that participant in one split.

The extractor writes JSONL containing 21 world-coordinate points, handedness, metadata, `schema_version: 1`, and `feature_version: world-single-v1`. A sidecar `.failures.json` records failed images. Webcam exports use the same schema. Keep original images when available; browser capture currently exports coordinates only.

Create `splits.json` explicitly, for example:

```json
{"train":["p01","p02","p03"],"val":["p04"],"test":["p05"]}
```

All three sets must be disjoint and cover the same classes; no random frame split is provided. Keep train/val/test fixed for all ablations. The CLI reports validation and test metrics together: finalize experiment choices on validation data before using test results for the report.
