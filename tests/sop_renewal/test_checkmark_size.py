from __future__ import annotations

import posixpath
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(r"E:\AI\SOP")
OUTPUT = next((ROOT / "outputs").glob("*_新版_修正版.xlsx"))
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
DRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
ART = "http://schemas.openxmlformats.org/drawingml/2006/main"


def resolve(base: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), target))


class CheckmarkSizeTest(unittest.TestCase):
    def test_checkmarks_fit_inside_template_checkbox(self) -> None:
        with zipfile.ZipFile(OUTPUT) as book:
            workbook = ET.fromstring(book.read("xl/workbook.xml"))
            workbook_rels = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
            workbook_targets = {
                rel.attrib["Id"]: resolve("xl/workbook.xml", rel.attrib["Target"])
                for rel in workbook_rels
            }
            checked_count = 0

            for sheet in workbook.find(f"{{{MAIN}}}sheets"):
                sheet_path = workbook_targets[sheet.attrib[f"{{{REL}}}id"]]
                root = ET.fromstring(book.read(sheet_path))
                drawing_ref = root.find(f"{{{MAIN}}}drawing")
                if drawing_ref is None:
                    continue

                sheet_rels_path = posixpath.join(
                    posixpath.dirname(sheet_path),
                    "_rels",
                    posixpath.basename(sheet_path) + ".rels",
                )
                sheet_rels = ET.fromstring(book.read(sheet_rels_path))
                sheet_targets = {
                    rel.attrib["Id"]: resolve(sheet_path, rel.attrib["Target"])
                    for rel in sheet_rels
                }
                drawing_path = sheet_targets[drawing_ref.attrib[f"{{{REL}}}id"]]
                drawing = ET.fromstring(book.read(drawing_path))
                drawing_rels_path = posixpath.join(
                    posixpath.dirname(drawing_path),
                    "_rels",
                    posixpath.basename(drawing_path) + ".rels",
                )
                drawing_rels = ET.fromstring(book.read(drawing_rels_path))
                drawing_targets = {
                    rel.attrib["Id"]: resolve(drawing_path, rel.attrib["Target"])
                    for rel in drawing_rels
                }

                for anchor in drawing:
                    blip = anchor.find(f".//{{{ART}}}blip")
                    start = anchor.find(f"{{{DRAW}}}from")
                    if blip is None or start is None:
                        continue
                    media = posixpath.basename(
                        drawing_targets.get(
                            blip.attrib.get(f"{{{REL}}}embed"),
                            "",
                        )
                    )
                    if "checkmark" not in media:
                        continue

                    checked_count += 1
                    row = int(start.find(f"{{{DRAW}}}row").text)
                    col = int(start.find(f"{{{DRAW}}}col").text)
                    extent = anchor.find(f"{{{DRAW}}}ext")
                    self.assertEqual(row, 6)
                    self.assertIn(col, {8, 18, 27, 38})
                    self.assertTrue(anchor.tag.endswith("oneCellAnchor"))
                    self.assertIsNone(anchor.find(f"{{{DRAW}}}to"))
                    self.assertIsNotNone(extent)
                    self.assertLessEqual(int(extent.attrib["cx"]), 24 * 9525)
                    self.assertLessEqual(int(extent.attrib["cy"]), 24 * 9525)

            self.assertGreater(checked_count, 0)


if __name__ == "__main__":
    unittest.main()
