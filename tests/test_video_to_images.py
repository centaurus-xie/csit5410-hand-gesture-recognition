"""Real-video regression checks; runnable with unittest or pytest."""
import csv
import runpy
import tempfile
import unittest
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError as exc:
    raise unittest.SkipTest("Install the project's images extra to test video extraction") from exc

extract_video = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "scripts" / "video_to_images.py")
)["extract_video"]


class VideoExtractionTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix="csit5410-video-test-")
        self.addCleanup(self.scratch.cleanup)
        self.folder = Path(self.scratch.name)
        video_folder = self.folder / "中文视频 空格"
        video_folder.mkdir()
        self.video = video_folder / "手势6.avi"
        writer = cv2.VideoWriter(str(self.video), cv2.VideoWriter_fourcc(*"MJPG"), 20, (96, 64))
        if not writer.isOpened():
            self.skipTest("MJPG video encoder unavailable")
        try:
            for index in range(40):
                frame = np.zeros((64, 96, 3), dtype=np.uint8)
                frame[:, :, 0] = index * 5
                frame[:, :, 1] = 100
                writer.write(frame)
        finally:
            writer.release()

    def convert(self, **options):
        return extract_video(
            self.video, self.folder / "中文输出", label="6", **options,
        )

    def rows(self, result):
        with Path(result["manifest"]).open(encoding="utf-8", newline="") as stream:
            return list(csv.DictReader(stream))

    def test_default_ten_per_second_and_direct_output(self):
        output = self.folder / "中文输出"
        output.mkdir()
        sentinel = output / "existing.txt"
        sentinel.write_text("keep me", encoding="utf-8")
        result = self.convert()
        samples = self.rows(result)
        self.assertEqual(result["saved_images"], 20)
        self.assertEqual([int(row["frame_index"]) for row in samples], list(range(0, 40, 2)))
        self.assertEqual([float(row["timestamp_sec"]) for row in samples], [n / 10 for n in range(20)])
        self.assertEqual(Path(result["output_dir"]), output)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep me")
        self.assertFalse(any(path.is_dir() for path in output.iterdir()))
        for row in samples:
            path = Path(result["manifest"]).parent / row["image_path"]
            self.assertEqual(path.parent, output)
            frame = cv2.imdecode(np.frombuffer(path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
            self.assertEqual(frame.shape, (100, 100, 3))
            self.assertEqual((row["width"], row["height"]), ("100", "100"))
            self.assertEqual((row["source_width"], row["source_height"]), ("96", "64"))
            self.assertLess(abs(frame[:, :, 0].mean() - int(row["frame_index"]) * 5), 8)
            self.assertEqual(row["label"], "6")
            self.assertNotIn("person_id", row)
            self.assertNotIn("session_id", row)
            self.assertEqual(row["source_id"], "self-collected")

    def test_start_and_exclusive_end(self):
        samples = self.rows(self.convert(sample_fps=2, start=.25, end=1.4))
        self.assertEqual([int(row["frame_index"]) for row in samples], [5, 15, 25])
        self.assertEqual([float(row["timestamp_sec"]) for row in samples], [.25, .75, 1.25])

    def test_rerun_and_high_sampling_rate_do_not_overwrite_or_duplicate(self):
        first = self.convert(sample_fps=50)
        second = self.convert(sample_fps=50)
        self.assertEqual(first["output_dir"], second["output_dir"])
        self.assertNotEqual(first["manifest"], second["manifest"])
        self.assertEqual(first["saved_images"], 40)
        self.assertEqual(second["saved_images"], 40)
        a, b = self.rows(first), self.rows(second)
        self.assertEqual(len({row["frame_index"] for row in a}), 40)
        self.assertTrue({row["sample_id"] for row in a}.isdisjoint(row["sample_id"] for row in b))
        self.assertTrue({row["image_path"] for row in a}.isdisjoint(row["image_path"] for row in b))
        self.assertTrue(Path(first["manifest"]).is_file())

    def test_invalid_time_parameters_write_nothing(self):
        for options in [
            {"sample_fps": 0}, {"sample_fps": float("nan")}, {"start": -1},
            {"start": 1, "end": 1}, {"end": float("inf")},
        ]:
            with self.subTest(options=options), self.assertRaises(ValueError):
                self.convert(**options)
        self.assertFalse((self.folder / "中文输出").exists())

    def test_out_of_range_window_write_nothing(self):
        with self.assertRaisesRegex(ValueError, "没有抽到图片"):
            self.convert(start=10)
        self.assertFalse((self.folder / "中文输出").exists())

    def test_rejects_unsupported_labels(self):
        for label in ["-1", "10", "11"]:
            with self.subTest(label=label), self.assertRaises(ValueError):
                extract_video(self.video, self.folder / "output", label=label)
        self.assertFalse((self.folder / "output").exists())

    def test_zero_and_nine_labels_are_saved_correctly(self):
        for label in ["0", "9"]:
            with self.subTest(label=label):
                result = extract_video(self.video, self.folder / label, label=label)
                self.assertEqual(result["saved_images"], 20)
                self.assertTrue(all(row["label"] == label for row in self.rows(result)))

    def test_custom_and_original_sizes(self):
        for size, expected in [("80*40", (40, 80)), ("original", (64, 96))]:
            with self.subTest(size=size):
                result = self.convert(size=size)
                row = self.rows(result)[0]
                path = Path(result["output_dir"]) / row["image_path"]
                frame = cv2.imdecode(np.frombuffer(path.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
                self.assertEqual(frame.shape[:2], expected)
                self.assertEqual((int(row["height"]), int(row["width"])), expected)

    def test_invalid_size_writes_nothing(self):
        for size in ["", "100", "0x100", "100x-1", "100x100x100"]:
            with self.subTest(size=size), self.assertRaises(ValueError):
                self.convert(size=size)
        self.assertFalse((self.folder / "中文输出").exists())


if __name__ == "__main__":
    unittest.main()
