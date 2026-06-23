from __future__ import annotations

import argparse
import hashlib
import io
import json
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
DRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
ART = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS = {"m": MAIN, "xdr": DRAW, "a": ART}


def resolve(base: str, target: str) -> str:
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), target))


def load_sheet_path(book: zipfile.ZipFile, sheet_name: str) -> str:
    workbook = ET.fromstring(book.read("xl/workbook.xml"))
    relationships = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
    targets = {
        item.attrib["Id"]: resolve("xl/workbook.xml", item.attrib["Target"])
        for item in relationships
    }
    for sheet in workbook.find(f"{{{MAIN}}}sheets"):
        if sheet.attrib["name"] == sheet_name:
            return targets[sheet.attrib[f"{{{REL}}}id"]]
    raise ValueError(f"找不到工作表：{sheet_name}")


def shared_strings(book: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in book.namelist():
        return []
    root = ET.fromstring(book.read("xl/sharedStrings.xml"))
    return [
        "".join(node.text or "" for node in item.findall(f".//{{{MAIN}}}t"))
        for item in root
    ]


def cell_values(root: ET.Element, strings: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for cell in root.findall(f".//{{{MAIN}}}c"):
        value = cell.find(f"{{{MAIN}}}v")
        inline = cell.find(f"{{{MAIN}}}is")
        text = None
        if cell.attrib.get("t") == "s" and value is not None:
            text = strings[int(value.text)]
        elif inline is not None:
            text = "".join(
                node.text or "" for node in inline.findall(f".//{{{MAIN}}}t")
            )
        elif value is not None:
            text = value.text
        if text not in (None, ""):
            values[cell.attrib["r"]] = text
    return values


def extract_drawings(
    book: zipfile.ZipFile,
    sheet_path: str,
    sheet_root: ET.Element,
    image_dir: Path,
) -> tuple[list[dict], list[dict]]:
    drawing_ref = sheet_root.find(f"{{{MAIN}}}drawing")
    if drawing_ref is None:
        return [], []

    sheet_rels_path = posixpath.join(
        posixpath.dirname(sheet_path),
        "_rels",
        posixpath.basename(sheet_path) + ".rels",
    )
    sheet_rels = ET.fromstring(book.read(sheet_rels_path))
    sheet_targets = {
        item.attrib["Id"]: resolve(sheet_path, item.attrib["Target"])
        for item in sheet_rels
    }
    drawing_path = sheet_targets[drawing_ref.attrib[f"{{{REL}}}id"]]
    drawing_root = ET.fromstring(book.read(drawing_path))
    drawing_rels_path = posixpath.join(
        posixpath.dirname(drawing_path),
        "_rels",
        posixpath.basename(drawing_path) + ".rels",
    )
    drawing_rels = ET.fromstring(book.read(drawing_rels_path))
    drawing_targets = {
        item.attrib["Id"]: resolve(drawing_path, item.attrib["Target"])
        for item in drawing_rels
    }

    image_dir.mkdir(parents=True, exist_ok=True)
    images: list[dict] = []
    text_boxes: list[dict] = []
    for anchor in list(drawing_root):
        start = anchor.find("xdr:from", NS)
        if start is None:
            continue
        row = int(start.find("xdr:row", NS).text)
        col = int(start.find("xdr:col", NS).text)
        picture = anchor.find("xdr:pic", NS)
        shape = anchor.find("xdr:sp", NS)
        blip = anchor.find(".//a:blip", NS)
        if blip is not None:
            media_path = drawing_targets[blip.attrib[f"{{{REL}}}embed"]]
            payload = book.read(media_path)
            suffix = Path(media_path).suffix.lower()
            digest = hashlib.sha256(payload).hexdigest()
            output_path = image_dir / f"{digest[:16]}{suffix}"
            output_path.write_bytes(payload)
            with Image.open(io.BytesIO(payload)) as image:
                width, height = image.size
            images.append(
                {
                    "row": row,
                    "col": col,
                    "sha256": digest,
                    "path": str(output_path),
                    "source_media": media_path,
                    "width": width,
                    "height": height,
                }
            )
        elif shape is not None:
            text = "".join(
                node.text or "" for node in shape.findall(".//a:t", NS)
            ).strip()
            if text:
                text_boxes.append({"row": row, "col": col, "text": text})
    return images, text_boxes


def parse_integer(value: str) -> int:
    return int(float(value))


def extract(input_path: Path, sheet_name: str, image_dir: Path) -> dict:
    with zipfile.ZipFile(input_path) as book:
        sheet_path = load_sheet_path(book, sheet_name)
        root = ET.fromstring(book.read(sheet_path))
        cells = cell_values(root, shared_strings(book))
        images, text_boxes = extract_drawings(book, sheet_path, root, image_dir)

    operation_images = [
        item
        for item in images
        if item["row"] <= 19
        and item["col"] < 19
        and not (item["row"] == 0 and item["col"] == 0)
    ]
    operation_text = [
        item["text"]
        for item in text_boxes
        if item["row"] <= 23
        and not re.fullmatch(r"[①②③④⑤]", item["text"])
    ]
    torque_match = re.search(r"(\d+\s*-\s*\d+\s*N[.·]m)", cells.get("AE16", ""))

    return {
        "source_file": str(input_path),
        "source_sheet": sheet_name,
        "job_name": cells["I3"],
        "job_code": cells["Q3"],
        "product_name": cells["Q2"],
        "takt_time": cells["Z2"],
        "people": parse_integer(cells["Z3"]),
        "file_number": cells["Q1"],
        "effective_date_serial": cells["Z1"],
        "material": {"name": cells["AE3"], "qty": parse_integer(cells["AI3"])},
        "tool": {"name": cells["AE10"], "qty": parse_integer(cells["AI10"])},
        "torque": torque_match.group(1).replace(" ", "") if torque_match else None,
        "job_requirements": [
            cells[address]
            for address in ("AE14", "AE15", "AE16", "AE17")
            if address in cells
        ],
        "mutual_check": [
            cells[address] for address in ("AE20", "AE21") if address in cells
        ],
        "hazards": [
            {"risk": cells["B26"], "effect": cells["N26"]},
            {"risk": cells["B27"], "effect": cells["N27"]},
            {"risk": cells["B28"], "effect": cells["N28"]},
        ],
        "operation_text": operation_text,
        "operation_images": sorted(
            operation_images, key=lambda item: (item["row"], item["col"])
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--sheet", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--image-dir", type=Path, required=True)
    args = parser.parse_args()
    result = extract(args.input, args.sheet, args.image_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
