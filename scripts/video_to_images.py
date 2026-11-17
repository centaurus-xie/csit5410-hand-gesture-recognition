"""从单一静态手势的视频中抽帧；在 PyCharm 直接运行可打开填写窗口。"""
from __future__ import annotations

import argparse
import csv
import json
import math
import queue
import sys
import threading
import uuid
from contextlib import ExitStack
from pathlib import Path


LABELS = tuple(str(n) for n in range(10)) + ("unknown",)
FIELDS = (
    "sample_id", "image_path", "source_id", "label",
    "video_id", "frame_index", "timestamp_sec", "timestamp_source",
    "width", "height", "source_width", "source_height",
)


def parse_size(value: str) -> tuple[int, int] | None:
    text = value.strip().lower().replace("×", "x").replace("*", "x")
    if text in {"original", "原尺寸"}:
        return None
    try:
        width, height = (int(part.strip()) for part in text.split("x"))
    except ValueError:
        raise ValueError("图片尺寸请填写宽x高，例如 100x100；保留原尺寸请填 original 或 原尺寸。") from None
    if width <= 0 or height <= 0:
        raise ValueError("图片宽度和高度必须大于 0。")
    return width, height


def extract_video(
    video: Path, output: Path, *, label: str,
    sample_fps: float = 10.0, start: float = 0.0, end: float | None = None,
    source_id: str = "self-collected", size: str = "100x100",
) -> dict:
    """Sample sequentially using decoded timestamps, with FPS as a fallback.

    The time window is [start, end). Images default to 100x100 pixels.
    Images are saved directly in the selected folder with unique filenames.
    """
    import cv2

    video = Path(video).expanduser().resolve()
    output = Path(output).expanduser().resolve()
    if not video.is_file():
        raise ValueError(f"视频不存在：{video}")
    if label not in LABELS:
        raise ValueError("手势标签只能是 0–9 或 unknown。")
    target_size = parse_size(size)
    if not math.isfinite(sample_fps) or sample_fps <= 0:
        raise ValueError("每秒抽帧数必须大于 0。")
    if not math.isfinite(start) or start < 0:
        raise ValueError("开始时间必须是大于或等于 0 的秒数。")
    if end is not None and (not math.isfinite(end) or end <= start):
        raise ValueError("结束时间必须大于开始时间；不填写表示直到视频结束。")

    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        cap.release()
        raise ValueError("无法打开视频。可尝试将手机视频导出为 H.264 编码的 MP4。")
    fps = float(cap.get(cv2.CAP_PROP_FPS))
    interval = 1.0 / sample_fps
    video_id = "video-" + uuid.uuid4().hex
    file_prefix = video_id[:18]
    manifest_path = output / f"frames_{file_prefix}.csv"
    saved = 0
    frame_index = 0
    next_time = start
    previous_pts = -1.0
    previous_time = -1.0
    fallback_count = 0
    writer = None
    first_time = last_time = None

    try:
        with ExitStack() as stack:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                pts = float(cap.get(cv2.CAP_PROP_POS_MSEC)) / 1000.0
                if math.isfinite(pts) and pts >= 0 and pts > previous_pts and pts > previous_time:
                    timestamp = pts
                    timestamp_source = "decoder"
                elif math.isfinite(fps) and fps > 0:
                    timestamp = frame_index / fps
                    timestamp_source = "fps-estimate"
                else:
                    raise ValueError("视频没有可用的时间戳或帧率，请先导出为普通 MP4。")
                if math.isfinite(pts):
                    previous_pts = pts
                # A backend can return repeated/invalid timestamps after a seek or codec error.
                if timestamp < previous_time:
                    raise ValueError("视频时间戳倒退，请先转码为普通 MP4 再抽帧。")
                previous_time = timestamp
                if end is not None and timestamp >= end - 1e-9:
                    break
                if timestamp + 1e-9 >= next_time:
                    if writer is None:
                        output.mkdir(parents=True, exist_ok=True)
                        stream = stack.enter_context(manifest_path.open("x", newline="", encoding="utf-8"))
                        writer = csv.DictWriter(stream, fieldnames=FIELDS)
                        writer.writeheader()
                    sample_id = f"{video_id}-f{frame_index:08d}"
                    relative = Path(f"{file_prefix}_f{frame_index:08d}.jpg")
                    source_height, source_width = frame.shape[:2]
                    if target_size is not None:
                        interpolation = (
                            cv2.INTER_AREA
                            if target_size[0] <= source_width and target_size[1] <= source_height
                            else cv2.INTER_LINEAR
                        )
                        frame = cv2.resize(frame, target_size, interpolation=interpolation)
                    encoded_ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
                    if not encoded_ok:
                        raise OSError(f"第 {frame_index} 帧保存失败。")
                    # Python's file API also supports Chinese output directories on Windows.
                    with (output / relative).open("xb") as image_file:
                        image_file.write(encoded.tobytes())
                    writer.writerow({
                        "sample_id": sample_id, "image_path": relative.as_posix(),
                        "source_id": source_id, "label": label, "video_id": video_id,
                        "frame_index": frame_index, "timestamp_sec": f"{timestamp:.6f}",
                        "timestamp_source": timestamp_source,
                        "width": frame.shape[1], "height": frame.shape[0],
                        "source_width": source_width, "source_height": source_height,
                    })
                    fallback_count += timestamp_source == "fps-estimate"
                    first_time = timestamp if first_time is None else first_time
                    last_time = timestamp
                    saved += 1
                    # Select each decoded frame at most once, even above the video's FPS.
                    next_time = start + (math.floor((timestamp - start + 1e-9) / interval) + 1) * interval
                frame_index += 1
    except Exception as exc:
        if writer is not None:
            (output / f"INCOMPLETE_{file_prefix}.txt").write_text(
                f"转换中断，已保存 {saved} 张；请检查后再使用。\n{exc}\n", encoding="utf-8",
            )
        raise
    finally:
        cap.release()

    if not saved:
        raise ValueError("所选时间范围内没有抽到图片，请检查视频及开始/结束秒数。")
    result = {
        "output_dir": str(output), "manifest": str(manifest_path),
        "source_video": str(video), "video_id": video_id, "saved_images": saved,
        "label": label,
        "image_size": f"{target_size[0]}x{target_size[1]}" if target_size else "original",
        "resize_mode": "stretch" if target_size else "original",
        "sample_fps": sample_fps, "start_seconds": start, "end_seconds": end,
        "reported_video_fps": fps if math.isfinite(fps) else None,
        "first_timestamp_sec": first_time, "last_timestamp_sec": last_time,
        "fps_estimated_samples": fallback_count,
    }
    (output / f"info_{file_prefix}.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8",
    )
    return result


def launch_gui() -> None:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.title("CSIT5410 · 视频转手势图片")
    root.resizable(False, False)
    panel = ttk.Frame(root, padding=18)
    panel.grid()
    ttk.Label(panel, text="一段视频只拍一种手势；先用开始/结束秒数排除切换动作。", wraplength=580).grid(
        row=0, column=0, columnspan=3, sticky="w", pady=(0, 12),
    )
    defaults = {
        "video": "", "output": "", "label": "0",
        "sample_fps": "10", "size": "100x100", "start": "0", "end": "",
    }
    values = {key: tk.StringVar(value=value) for key, value in defaults.items()}
    fields = [
        ("视频文件", "video"), ("输出文件夹", "output"), ("手势标签（0–9 / unknown）", "label"),
        ("每秒提取几张", "sample_fps"), ("图片尺寸（宽x高 / 原尺寸）", "size"),
        ("开始秒数", "start"), ("结束秒数（留空到末尾）", "end"),
    ]
    for row, (caption, key) in enumerate(fields, 1):
        ttk.Label(panel, text=caption).grid(row=row, column=0, sticky="w", padx=(0, 12), pady=4)
        if key == "label":
            field = ttk.Combobox(panel, textvariable=values[key], values=LABELS, state="readonly", width=45)
        else:
            field = ttk.Entry(panel, textvariable=values[key], width=48)
        field.grid(row=row, column=1, sticky="ew", pady=4)

    def browse_video():
        path = filedialog.askopenfilename(title="选择手势视频", filetypes=[
            ("视频文件", "*.mp4 *.mov *.avi *.mkv *.m4v *.MP4 *.MOV *.AVI"), ("所有文件", "*"),
        ])
        if path:
            values["video"].set(path)

    def browse_output():
        path = filedialog.askdirectory(title="选择图片保存位置", mustexist=False)
        if path:
            values["output"].set(path)

    ttk.Button(panel, text="选择…", command=browse_video).grid(row=1, column=2, padx=(8, 0))
    ttk.Button(panel, text="选择…", command=browse_output).grid(row=2, column=2, padx=(8, 0))
    status = tk.StringVar(value="默认 100×100 像素、每秒 10 张；图片直接存到选择的文件夹。")
    ttk.Label(panel, textvariable=status, wraplength=600).grid(row=9, column=0, columnspan=3, sticky="w", pady=10)
    results = queue.Queue()

    def poll():
        try:
            result = results.get_nowait()
        except queue.Empty:
            root.after(150, poll)
            return
        button.configure(state="normal")
        if isinstance(result, Exception):
            status.set("转换失败，请检查输入。")
            messagebox.showerror("转换失败", str(result))
        else:
            status.set(f"完成：{result['saved_images']} 张图片。")
            messagebox.showinfo("转换完成", f"已提取 {result['saved_images']} 张图片，直接保存在：\n\n{result['output_dir']}\n\n可在文件夹中查看和筛选图片。")

    def start():
        try:
            if not values["video"].get().strip() or not values["output"].get().strip():
                raise ValueError("请先选择视频文件和输出文件夹。")
            options = {"label": values["label"].get().strip(), "size": values["size"].get().strip()}
            parse_size(options["size"])
            options.update(sample_fps=float(values["sample_fps"].get()), start=float(values["start"].get()))
            options["end"] = float(values["end"].get()) if values["end"].get().strip() else None
            video, output = Path(values["video"].get()), Path(values["output"].get())
        except ValueError as exc:
            messagebox.showerror("请检查输入", str(exc))
            return
        button.configure(state="disabled")
        status.set("正在转换，请等待…")

        def worker():
            try:
                results.put(extract_video(video, output, **options))
            except ImportError:
                results.put(ValueError('缺少 OpenCV，请在当前解释器环境安装：\npython -m pip install "opencv-contrib-python>=4.8,<4.12"'))
            except Exception as exc:
                results.put(exc)

        threading.Thread(target=worker, daemon=True).start()
        root.after(150, poll)

    def close():
        if str(button["state"]) == "disabled":
            messagebox.showinfo("正在转换", "请等当前视频转换结束后再关闭窗口。")
        else:
            root.destroy()

    button = ttk.Button(panel, text="开始提取图片", command=start)
    button.grid(row=8, column=0, columnspan=3, pady=(12, 0))
    root.protocol("WM_DELETE_WINDOW", close)
    root.mainloop()


def main() -> None:
    if len(sys.argv) == 1:
        launch_gui()
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path, help="视频路径；一段视频对应一种静态手势")
    parser.add_argument("--output", type=Path, required=True, help="图片直接保存到此文件夹")
    parser.add_argument("--label", required=True, choices=LABELS)
    parser.add_argument("--sample-fps", type=float, default=10.0, help="每秒最多取几张，默认 10")
    parser.add_argument("--size", default="100x100", help="图片宽x高，默认 100x100；填 original 保留原尺寸")
    parser.add_argument("--start", type=float, default=0.0, help="开始秒数，默认 0")
    parser.add_argument("--end", type=float, help="结束秒数，不包含该时刻；留空直到视频结束")
    parser.add_argument("--source-id", default="self-collected")
    args = parser.parse_args()
    try:
        result = extract_video(**vars(args))
    except ImportError:
        parser.exit(1, '缺少 OpenCV，请运行：python -m pip install "opencv-contrib-python>=4.8,<4.12"\n')
    except (ValueError, OSError) as exc:
        parser.exit(1, f"转换失败：{exc}\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
