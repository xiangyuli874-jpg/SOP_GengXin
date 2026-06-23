from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from extract_sample import (
    MAIN,
    cell_values,
    extract,
    extract_drawings,
    load_sheet_path,
    shared_strings,
)


def sheet_names(input_path: Path) -> list[str]:
    with zipfile.ZipFile(input_path) as book:
        root = ET.fromstring(book.read("xl/workbook.xml"))
    return [
        sheet.attrib["name"]
        for sheet in root.find(f"{{{MAIN}}}sheets")
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--image-dir", type=Path, required=True)
    args = parser.parse_args()

    results = []
    for index, name in enumerate(sheet_names(args.input), start=1):
        with zipfile.ZipFile(args.input) as book:
            sheet_path = load_sheet_path(book, name)
            root = ET.fromstring(book.read(sheet_path))
            cells = cell_values(root, shared_strings(book))
            images, text_boxes = extract_drawings(
                book,
                sheet_path,
                root,
                args.image_dir / f"{index:02d}",
            )
        try:
            item = extract(args.input, name, args.image_dir / f"{index:02d}")
            item["source_index"] = index
            item["error"] = None
        except Exception as exc:
            item = {
                "source_index": index,
                "source_sheet": name,
                "error": f"{type(exc).__name__}: {exc}",
            }
        item["raw_cells"] = cells
        item["raw_images"] = images
        item["raw_text_boxes"] = text_boxes
        results.append(item)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("序号\t工作表\t岗位名称\t图片\t文字框\t错误")
    for item in results:
        print(
            f"{item['source_index']}\t{item['source_sheet']}\t"
            f"{item.get('job_name', '')}\t"
            f"{len(item.get('operation_images', []))}\t"
            f"{len(item.get('operation_text', []))}\t"
            f"{item.get('error') or ''}"
        )


if __name__ == "__main__":
    main()
