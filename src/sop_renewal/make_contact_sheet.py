from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    files = sorted(
        file_path
        for pattern in ("*.png", "*.jpg", "*.jpeg")
        for file_path in args.input_dir.glob(pattern)
    )
    columns = 4
    cell_width, cell_height = 540, 360
    rows = math.ceil(len(files) / columns)
    canvas = Image.new(
        "RGB",
        (columns * cell_width, rows * cell_height),
        "white",
    )
    draw = ImageDraw.Draw(canvas)
    for index, file_path in enumerate(files):
        image = Image.open(file_path).convert("RGB")
        thumbnail = ImageOps.contain(image, (520, 330))
        left = (index % columns) * cell_width
        top = (index // columns) * cell_height
        draw.text((left + 5, top + 3), file_path.stem, fill="black")
        canvas.paste(thumbnail, (left + 10, top + 22))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, quality=88)


if __name__ == "__main__":
    main()
