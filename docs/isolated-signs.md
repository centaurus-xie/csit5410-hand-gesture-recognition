# Single-hand isolated sign extension

Keep the number recognizer as the default. Reserve a separate **Sign words** mode for a vocabulary of three to five isolated single-hand Hong Kong Sign Language signs. Open this mode once a trained sequence model and recordings are available.

## Candidate vocabulary

Screen **你好 (Hello)**, **多謝 (Thank you)** and **再見 (Goodbye)** first for a greeting-and-farewell demo. Screen **我 (Me)** and **你 (You)** as alternatives. These are candidate meanings, not verified single-hand variants. Review demonstration videos in the [CUHK Hong Kong Sign Language Browser](https://www.cslds.org/hkslbrowser/tc/database/) with an HKSL user. Keep variants that are distinguishable from one hand alone without needing face or body landmarks. In particular, check whether 我 and 你 depend on a body-relative pointing target. Record the variant ID or reference link before filming.

## Extension interface

- **Capture:** One clip per attempt, one sign per clip, with a manual start and stop. Save participant and session IDs, sign and variant IDs, frame timestamps, handedness, and both image and world landmarks. Mark missing frames explicitly. Reject clips with a second hand.
- **Model:** Keep separate model files for digits and signs. Use wrist-normalized hand shape plus image-space wrist motion relative to its start position, scaled by hand size. Compare a single-frame baseline with a small GRU on the same participant splits.
- **Result:** Return a sign ID or unknown. Map sign IDs to display text and separate speech clips for Cantonese, English and Mandarin. Include idle and transitional motion in evaluation.
