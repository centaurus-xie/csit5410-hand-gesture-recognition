"""Single-hand video extraction and isolated-sign training."""

import argparse
import csv
import json
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .features import features

VERSION = "single-hand-motion-v1"
LABELS = {"thank_you", "next_time", "bye", "unknown"}
TARGETS = LABELS - {"unknown"}
STEPS = 16
FRAME_SIZE = 22
SAMPLE_HZ = 12
MAX_SECONDS = 12
MIN_CONFIDENCE = 0.8


def motion_frame(time, image, world, hand, aspect):
    """Keep a 2D wrist position and hand scale in aspect-corrected image units."""
    wrist = image[0]
    middle = image[9]
    wrist_xy = [wrist["x"] * aspect, wrist["y"]]
    palm_size = np.hypot((middle["x"] - wrist["x"]) * aspect, middle["y"] - wrist["y"])
    return {
        "time": time,
        "hand": hand,
        "wrist": wrist_xy,
        "palm_size": float(palm_size),
        "geometry": features(world, hand)["geometry"].tolist(),
    }


def motion_vector(frames, sampled_count):
    """Interpolate shape, orientation and wrist displacement at fixed times."""
    if len(frames) < 5 or len(frames) < 0.55 * sampled_count:
        raise ValueError("Too few frames with a visible hand")
    hand = frames[0]["hand"]
    if hand not in {"Left", "Right"} or any(frame["hand"] != hand for frame in frames):
        raise ValueError("Hand tracking switched sides during the clip")
    times = np.array([frame["time"] for frame in frames], dtype=float)
    gaps = np.diff(times)
    if not np.isfinite(times).all() or times[-1] - times[0] < 0.25 or np.any((gaps <= 0) | (gaps > .35)):
        raise ValueError("Keep one hand visible during the full motion")
    wrist = np.array([frame["wrist"] for frame in frames], dtype=float)
    scales = np.array([frame["palm_size"] for frame in frames], dtype=float)
    if not np.isfinite(scales).all() or np.any(scales < 1e-6):
        raise ValueError("Hand is too small to estimate its motion")
    reference_size = np.median(scales)
    displacement = (wrist - wrist[0]) / reference_size
    if hand == "Left":
        displacement[:, 0] *= -1
    values = np.column_stack(([frame["geometry"] for frame in frames], displacement))
    if values.shape != (len(frames), FRAME_SIZE) or not np.isfinite(values).all():
        raise ValueError("Invalid motion features")
    grid = np.linspace(times[0], times[-1], STEPS)
    return np.stack([np.interp(grid, times, col) for col in values.T], axis=1).ravel()


def landmark_dicts(points):
    return [{"x": point.x, "y": point.y, "z": point.z} for point in points]


def extract_clip(path, options, max_seconds):
    import cv2
    import mediapipe as mp
    from mediapipe.tasks.python import vision

    capture = cv2.VideoCapture(str(path))
    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        if not capture.isOpened() or not np.isfinite(fps) or fps <= 0:
            raise ValueError("Cannot read video or its frame rate")
        frames, index, sampled = [], 0, 0
        interval = max(1, int(np.ceil(fps / SAMPLE_HZ)))
        with vision.HandLandmarker.create_from_options(options) as detector:
            while True:
                success, image = capture.read()
                if not success:
                    break
                time = index / fps
                if time >= max_seconds:
                    raise ValueError(f"Clip exceeds {max_seconds} seconds")
                index += 1
                if (index - 1) % interval:
                    continue
                sampled += 1
                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                result = detector.detect_for_video(
                    mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), round(time * 1000)
                )
                if len(result.hand_landmarks) > 1:
                    raise ValueError("Two hands detected")
                if not result.hand_landmarks or not result.hand_world_landmarks or not result.handedness:
                    continue
                try:
                    frame = motion_frame(
                        time, landmark_dicts(result.hand_landmarks[0]), landmark_dicts(result.hand_world_landmarks[0]),
                        result.handedness[0][0].category_name, rgb.shape[1] / rgb.shape[0],
                    )
                except ValueError:
                    continue
                frames.append(frame)
        return motion_vector(frames, sampled), frames, sampled
    finally:
        capture.release()


def extract(args):
    from mediapipe.tasks.python import BaseOptions, vision

    options = vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(args.landmarker), delegate=BaseOptions.Delegate.CPU),
        running_mode=vision.RunningMode.VIDEO, num_hands=2,
        min_hand_detection_confidence=.6, min_hand_presence_confidence=.6,
    )
    with args.manifest.open(newline="", encoding="utf-8-sig") as stream:
        reader = csv.DictReader(stream)
        if not {"clip_id", "video_path", "person_id", "label"}.issubset(reader.fieldnames or []):
            raise ValueError("CSV requires clip_id,video_path,person_id,label")
        rows = list(reader)
    ids = [row["clip_id"].strip() for row in rows]
    paths = [(args.manifest.parent / row["video_path"].strip()).resolve() for row in rows]
    if not rows or len(set(ids)) != len(ids) or len(set(paths)) != len(paths):
        raise ValueError("Provide distinct clip IDs and video files")
    records, failures = [], []
    for row, path in zip(rows, paths):
        if row["label"] not in LABELS or not row["person_id"].strip() or not row["clip_id"].strip():
            raise ValueError("Each clip requires a known label, clip ID and signer ID")
        try:
            vector, frames, sampled = extract_clip(path, options, MAX_SECONDS)
        except ValueError as error:
            failures.append({"clip_id": row["clip_id"], "reason": str(error)})
            continue
        records.append({**row, "feature_version": VERSION, "vector": vector.tolist(),
                        "frames": frames, "sampled_count": sampled})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    report_path = args.output.with_suffix(".failures.json")
    report_path.write_text(json.dumps(failures, indent=2))
    if not records:
        raise ValueError(f"No usable clips. See {report_path}")
    args.output.write_text("".join(json.dumps(record, allow_nan=False) + "\n" for record in records))
    print(f"Extracted {len(records)}/{len(rows)} clips. Failures: {report_path}")


def train(args):
    records = [json.loads(line) for line in args.samples.read_text().splitlines() if line.strip()]
    ids = [record.get("clip_id") for record in records]
    if not records or not all(ids) or len(ids) != len(set(ids)):
        raise ValueError("Training requires uniquely identified extracted clips")
    if any(record["feature_version"] != VERSION or record["label"] not in LABELS
           or not record["person_id"].strip() for record in records):
        raise ValueError("Invalid sign samples")
    vectors = np.array([record["vector"] for record in records], dtype=float)
    if vectors.shape != (len(records), STEPS * FRAME_SIZE) or not np.isfinite(vectors).all():
        raise ValueError("Invalid sign feature vectors")
    labels = np.array([record["label"] for record in records])
    people = np.array([record["person_id"].strip() for record in records])
    if not TARGETS <= set(labels):
        raise ValueError("Training requires clips for all three target signs")
    if args.fit_only:
        train_indices = np.arange(len(records))
        evaluation = {}
    else:
        from sklearn.model_selection import GroupShuffleSplit

        # Choose a deterministic whole-signer split with class coverage on both sides.
        if len(set(people)) < 3:
            raise ValueError("Provide at least three signers for a held-out evaluation, or use --fit-only")
        for train_indices, test_indices in GroupShuffleSplit(
            n_splits=40, test_size=.25, random_state=42,
        ).split(vectors, labels, people):
            if set(labels[train_indices]) == set(labels[test_indices]) == set(labels):
                break
        else:
            raise ValueError("No signer-disjoint split covers every class on both sides")
        evaluation = {"held_out_signers": sorted(set(people[test_indices]))}
    pipeline = make_pipeline(
        StandardScaler(), MLPClassifier(hidden_layer_sizes=(32,), max_iter=500, random_state=42)
    )
    pipeline.fit(vectors[train_indices], labels[train_indices])
    scaler, classifier = pipeline.steps[0][1], pipeline.steps[1][1]
    classes = classifier.classes_.tolist()
    if not args.fit_only:
        expected = labels[test_indices]
        predicted = pipeline.predict(vectors[test_indices])
        evaluation["report"] = classification_report(expected, predicted, labels=classes,
                                                      output_dict=True, zero_division=0)
        evaluation["confusion_matrix"] = confusion_matrix(expected, predicted, labels=classes).tolist()
        middle_frame_start = (STEPS // 2) * FRAME_SIZE
        middle_geometry = vectors[:, middle_frame_start:middle_frame_start + 20]
        baseline = make_pipeline(
            StandardScaler(), MLPClassifier(hidden_layer_sizes=(32,), max_iter=500, random_state=42)
        )
        baseline.fit(middle_geometry[train_indices], labels[train_indices])
        baseline_predictions = baseline.predict(middle_geometry[test_indices])
        evaluation["single_frame_report"] = classification_report(
            expected, baseline_predictions, labels=classes, output_dict=True, zero_division=0,
        )
    args.output.mkdir(parents=True, exist_ok=True)
    model = {
        "feature_version": VERSION, "classes": classes, "threshold": MIN_CONFIDENCE,
        "mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist(),
        "weights": [layer.tolist() for layer in classifier.coefs_],
        "biases": [layer.tolist() for layer in classifier.intercepts_],
    }
    report = {"fit_only": args.fit_only, "training_clips_by_label": dict(Counter(labels[train_indices])),
              "training_signers": sorted(set(people[train_indices])), **evaluation}
    (args.output / "classifier.json").write_text(json.dumps(model, allow_nan=False))
    (args.output / "metrics.json").write_text(json.dumps(report, indent=2))
    example_indices = train_indices[:3]
    examples = vectors[example_indices]
    (args.output / "parity.json").write_text(json.dumps({
        "vectors": examples.tolist(),
        "probabilities": pipeline.predict_proba(examples).tolist(),
        "clips": [{"frames": records[i].get("frames"), "sampled_count": records[i].get("sampled_count")}
                  for i in example_indices],
    }))
    joblib.dump(pipeline, args.output / "model.joblib")
    print(f"Trained {len(classes)} classes from {len(train_indices)} clips. Output: {args.output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(required=True)
    extraction = commands.add_parser("extract")
    extraction.add_argument("manifest", type=Path)
    extraction.add_argument("--output", type=Path, required=True)
    extraction.add_argument("--landmarker", type=Path, default=Path("web/public/models/hand_landmarker.task"))
    extraction.set_defaults(run=extract)
    training = commands.add_parser("train")
    training.add_argument("samples", type=Path)
    training.add_argument("--output", type=Path, required=True)
    training.add_argument("--fit-only", action="store_true", help="Fit all clips without reporting accuracy")
    training.set_defaults(run=train)
    args = parser.parse_args()
    try:
        args.run(args)
    except RuntimeError as error:
        if "NSOpenGLPixelFormat" in str(error):
            parser.exit(1, "MediaPipe could not initialize graphics. Run extraction in your macOS Terminal.\n")
        raise
    except (ValueError, OSError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
