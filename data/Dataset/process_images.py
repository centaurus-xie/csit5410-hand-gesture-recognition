"""把输入照片居中裁成正方形，再缩放到 100×100。

默认每张图只输出一张。加上 --augment 时，额外输出固定的小旋转、
亮度、对比度、缩放和平移版本。不做翻转、大角度旋转或手部检测。
"""
import argparse
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

SIZE = 100
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
ROOT = Path(__file__).resolve().parent
DEFAULT_INPUT = ROOT / "unprocessed_origin_input"
DEFAULT_OUTPUT = ROOT / "processed_output"


def center_square(image):
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def prepare(path):
    image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    return center_square(image)


def downscale(image):
    return image.resize((SIZE, SIZE), Image.Resampling.BOX)


def corner_color(image):
    return image.getpixel((0, 0))


def rotate(image, degrees):
    return image.rotate(
        degrees,
        resample=Image.Resampling.BICUBIC,
        expand=False,
        fillcolor=corner_color(image),
    )


def scale(image, factor):
    width, height = image.size
    resized = image.resize(
        (max(1, int(width * factor)), max(1, int(height * factor))),
        Image.Resampling.BICUBIC,
    )
    if factor >= 1:
        left = (resized.width - width) // 2
        top = (resized.height - height) // 2
        return resized.crop((left, top, left + width, top + height))
    canvas = Image.new("RGB", (width, height), corner_color(image))
    canvas.paste(resized, ((width - resized.width) // 2, (height - resized.height) // 2))
    return canvas


def shift(image, fraction):
    width, height = image.size
    dx = int(width * fraction)
    dy = int(height * fraction)
    canvas = Image.new("RGB", (width, height), corner_color(image))
    canvas.paste(image, (dx, dy))
    return canvas


def variants(image):
    return {
        "rot-12": rotate(image, -12),
        "rot+12": rotate(image, 12),
        "bright-15": ImageEnhance.Brightness(image).enhance(0.85),
        "bright+15": ImageEnhance.Brightness(image).enhance(1.15),
        "contrast-10": ImageEnhance.Contrast(image).enhance(0.9),
        "contrast+10": ImageEnhance.Contrast(image).enhance(1.1),
        "scale090": scale(image, 0.9),
        "scale110": scale(image, 1.1),
        "shift-6": shift(image, -0.06),
        "shift+6": shift(image, 0.06),
    }


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    downscale(image).save(path, quality=95)


def images_under(root):
    return sorted(
        path for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in EXTS
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--augment", action="store_true", help="每张原图额外输出 10 张加强图")
    args = parser.parse_args()
    if not args.input.is_dir():
        raise SystemExit(f"找不到输入目录: {args.input}")

    sources = images_under(args.input)
    if not sources:
        raise SystemExit(f"输入目录里没有照片: {args.input}")

    written = 0
    for source in sources:
        relative = source.relative_to(args.input)
        destination = args.output / relative.with_suffix(".jpg")
        try:
            square = prepare(source)
        except (OSError, ValueError) as exc:
            print(f"跳过 {relative}: {exc}")
            continue
        save(square, destination)
        written += 1
        if args.augment:
            for name, image in variants(square).items():
                augmented = destination.with_name(f"{destination.stem}__{name}.jpg")
                save(image, augmented)
                written += 1
    print(f"输入 {len(sources)} 张，输出 {written} 张到 {args.output}")


if __name__ == "__main__":
    main()
