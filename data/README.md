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

### Preparing new gesture variants

Put raw photos outside the training folders. Keep the whole hand within the central square.
From the repository root, prepare a variant folder with:

```sh
.venv/bin/python data/Dataset/process_images.py \
  --input data/raw/6_back --output data/Dataset/6_back --augment
```

Without `--augment`, this creates only the centered 100×100 JPEG. With it, each
original gets ten derivatives with a `__<transform>` suffix. Use distinct
original filenames within each input directory and a fresh output folder.
Capture the palm and back of the hand separately. Image-plane rotation and
mirroring cannot recover the opposite side.

To train multiple named variants as the same digit, save
`{"6_back":"6"}` in `data/variants.json`. The existing 6 folder and this new
one both train as label 6. The variant name remains available in the
validation and test breakdown. Use several independent originals per side.

```sh
.venv/bin/python scripts/train_pilot.py --expanded --variants data/variants.json
node --import tsx scripts/check-model-parity.mjs artifacts/digits-variants/mlp-combined
npm run model:publish -- artifacts/digits-variants/mlp-combined/classifier.json
```

For future isolated words, use the same sign ID for verified equivalent
variants and preserve a separate variant ID in the clip manifest. This
image classifier supports digit labels. See the [isolated sign spec](../docs/isolated-signs.md)
for the separate video model.
