# Single-hand isolated sign extension

Keep the number recognizer as the default. Reserve a separate **Sign words** mode for a vocabulary of three to five isolated single-hand Hong Kong Sign Language signs. Open this mode once a trained sequence model and recordings are available.

## Classroom vocabulary

Use the following single-hand variants as filming references. The active hand can be framed on its own throughout each sign. Use the same variant for each signer.

| Class | Hong Kong Sign Language reference | Cue to capture |
| --- | --- | --- |
| `thank_you` | [多謝](https://ldlhku.github.io/HKU-HKSLLEX/video/small/HKSLLEX-2023-00000457-Thankyou.mp4) | Thumb gesture and its movement |
| `next_time` | [下次](https://ldlhku.github.io/HKU-HKSLLEX/video/small/HKSLLEX-2023-00000865-Nexttime.mp4) | Handshape and short wrist movement |
| `bye` | [再見](https://ldlhku.github.io/HKU-HKSLLEX/video/small/HKSLLEX-2023-00001620-Bye.mp4) | Open palm and waving motion |

Record a few pilot clips per class before the full shoot. Use a fixed camera and a wide enough frame to keep the fingertips and wrist visible throughout the action. The face and head can stay out of frame. Record each sign separately with a short pause at the start and end. Keep signer IDs for held-out evaluation and include still poses and incidental motions as unknown examples.

## Extension interface

- **Capture:** One clip per attempt, one sign per clip, with a manual start and stop. Save participant and session IDs, sign and variant IDs, frame timestamps, handedness, and both image and world landmarks. Mark missing frames explicitly. Reject clips with a second hand.
- **Model:** Use only the active hand landmarks and timestamps. Combine wrist-normalized hand shape and palm orientation with the image-space wrist trajectory relative to that clip's starting wrist position, scaled by hand size. Compare a single-frame baseline with a small temporal classifier using the same participant splits.
- **Result:** Return the predicted sign ID or unknown for each manually delimited clip. The demonstration can play 「多謝，下次見！」 when the confirmed sequence is `thank_you → next_time → bye`. Treat this as a fixed spoken phrase assembled from isolated predictions. Evaluate idle and transitional motion as well.

## Run the local pipeline

Create `data/signs/manifest.csv` and place your videos beside it under `videos/`.
Every row describes one complete clip. Filenames are relative to the CSV.

```csv
clip_id,video_path,person_id,label
p01-thank-you-01,videos/p01_thank_you_01.mp4,p01,thank_you
p01-next-time-01,videos/p01_next_time_01.mp4,p01,next_time
p01-bye-01,videos/p01_bye_01.mp4,p01,bye
p01-other-01,videos/p01_unknown_01.mp4,p01,unknown
```

```sh
.venv/bin/python -m gesture.signs extract data/signs/manifest.csv --output artifacts/signs/clips.jsonl
.venv/bin/python -m gesture.signs train artifacts/signs/clips.jsonl --output artifacts/signs/model
```

Open **Recognize a sign clip** and choose `artifacts/signs/model/classifier.json`
as the sign model. The panel accepts a local video file or a live clip delimited
by **Start sign** and **Finish sign** after starting the camera. To load a model
automatically on page open, copy it to `web/public/models/signs.json`.

Training holds out signers and requires all labels in both partitions. For a
pipeline trial with only one or two signers, add `--fit-only` to train without
reporting accuracy. The extractor logs rejected clips separately. An invalid
clip is rejected before model prediction. Use clips with incidental hand motion
for `unknown` training examples.

The three HKU videos are linked for reference. The lab's
[terms](https://raw.githubusercontent.com/ldlhku/HKU-HKSLLEX/main/LICENSE)
require express written permission for educational and research use of the
database. Use locally recorded clips for training unless that permission
has been obtained.

On macOS, run `npm run audio:generate -- --phrase-only` once to prepare the
sentence for the **Speak sentence** button. Python/browser feature and
prediction parity can be checked with
`node --import tsx scripts/check-sign-parity.mjs artifacts/signs/model`.
