from __future__ import annotations

import posixpath
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(r"E:\AI\SOP")
OUTPUT = (
    ROOT
    / "outputs"
    / "普通8kg及以下产品前总装SOP_新版_修正版.xlsx"
)
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
DRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"


def resolve(base: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), target))


class BatchRevisionStructureTest(unittest.TestCase):
    def setUp(self) -> None:
        self.book = zipfile.ZipFile(OUTPUT)
        workbook = ET.fromstring(self.book.read("xl/workbook.xml"))
        rels = ET.fromstring(self.book.read("xl/_rels/workbook.xml.rels"))
        targets = {
            rel.attrib["Id"]: resolve("xl/workbook.xml", rel.attrib["Target"])
            for rel in rels
        }
        self.sheets = {
            sheet.attrib["name"]: targets[sheet.attrib[f"{{{REL}}}id"]]
            for sheet in workbook.find(f"{{{MAIN}}}sheets")
        }
        self.sop_sheets = {
            name: path
            for name, path in self.sheets.items()
            if name not in {"冲突审核", "处理日志"}
        }

    def tearDown(self) -> None:
        self.book.close()

    def test_sop_tabs_have_no_color(self) -> None:
        for name, sheet_path in self.sop_sheets.items():
            root = ET.fromstring(self.book.read(sheet_path))
            tab_color = root.find(
                f"{{{MAIN}}}sheetPr/{{{MAIN}}}tabColor"
            )
            self.assertIsNone(tab_color, name)

    def test_each_sop_page_has_red_and_blue_operation_legend_boxes(self) -> None:
        for name, sheet_path in self.sop_sheets.items():
            root = ET.fromstring(self.book.read(sheet_path))
            drawing_ref = root.find(f"{{{MAIN}}}drawing")
            self.assertIsNotNone(drawing_ref, name)
            rels_path = posixpath.join(
                posixpath.dirname(sheet_path),
                "_rels",
                posixpath.basename(sheet_path) + ".rels",
            )
            rels = ET.fromstring(self.book.read(rels_path))
            targets = {
                rel.attrib["Id"]: resolve(sheet_path, rel.attrib["Target"])
                for rel in rels
            }
            drawing_path = targets[drawing_ref.attrib[f"{{{REL}}}id"]]
            drawing = ET.fromstring(self.book.read(drawing_path))
            anchors = {
                (
                    int(anchor.find(f"{{{DRAW}}}from/{{{DRAW}}}row").text),
                    int(anchor.find(f"{{{DRAW}}}from/{{{DRAW}}}col").text),
                )
                for anchor in list(drawing)
                if anchor.find(f"{{{DRAW}}}sp") is not None
                and anchor.find(f"{{{DRAW}}}from") is not None
            }
            self.assertIn((32, 31), anchors, name)
            self.assertIn((32, 35), anchors, name)

    def test_each_sop_page_has_tcl_logo(self) -> None:
        for name, sheet_path in self.sop_sheets.items():
            root = ET.fromstring(self.book.read(sheet_path))
            drawing_ref = root.find(f"{{{MAIN}}}drawing")
            self.assertIsNotNone(drawing_ref, name)
            rels_path = posixpath.join(
                posixpath.dirname(sheet_path),
                "_rels",
                posixpath.basename(sheet_path) + ".rels",
            )
            rels = ET.fromstring(self.book.read(rels_path))
            targets = {
                rel.attrib["Id"]: resolve(sheet_path, rel.attrib["Target"])
                for rel in rels
            }
            drawing_path = targets[drawing_ref.attrib[f"{{{REL}}}id"]]
            drawing = ET.fromstring(self.book.read(drawing_path))
            picture_anchors = {
                (
                    int(anchor.find(f"{{{DRAW}}}from/{{{DRAW}}}row").text),
                    int(anchor.find(f"{{{DRAW}}}from/{{{DRAW}}}col").text),
                )
                for anchor in list(drawing)
                if anchor.find(f"{{{DRAW}}}pic") is not None
                and anchor.find(f"{{{DRAW}}}from") is not None
            }
            self.assertIn((3, 1), picture_anchors, name)

    def test_key_post_and_visual_checkmarks_follow_rules(self) -> None:
        visual_jobs = {
            "GT-QZ01箱体外观检查",
            "GT-QZ02箱体扫码上线",
            "GT-QZ02插接线孔",
            "GT-QZ04卡装C面扎带扣",
            "GT-QZ06安装排水管",
            "GT-QZ07紧固排水管",
            "GT-QZ09紧固前门上卡扣",
            "GT-QZ10紧固前门下卡扣",
            "GT-QZ13安装电源线",
            "GT-QZ17紧固电源线",
            "GT-QZ18吊筒",
            "GT-QZ19装筒",
        }
        for name, sheet_path in self.sop_sheets.items():
            root = ET.fromstring(self.book.read(sheet_path))
            drawing_ref = root.find(f"{{{MAIN}}}drawing")
            rels_path = posixpath.join(
                posixpath.dirname(sheet_path),
                "_rels",
                posixpath.basename(sheet_path) + ".rels",
            )
            rels = ET.fromstring(self.book.read(rels_path))
            targets = {
                rel.attrib["Id"]: resolve(sheet_path, rel.attrib["Target"])
                for rel in rels
            }
            drawing_path = targets[drawing_ref.attrib[f"{{{REL}}}id"]]
            drawing = ET.fromstring(self.book.read(drawing_path))
            picture_anchors = {
                (
                    int(anchor.find(f"{{{DRAW}}}from/{{{DRAW}}}row").text),
                    int(anchor.find(f"{{{DRAW}}}from/{{{DRAW}}}col").text),
                )
                for anchor in list(drawing)
                if anchor.find(f"{{{DRAW}}}pic") is not None
                and anchor.find(f"{{{DRAW}}}from") is not None
            }
            self.assertEqual((6, 8) in picture_anchors, name == "GT-QZ18吊筒")
            self.assertEqual((6, 27) in picture_anchors, name in visual_jobs)

    def test_control_and_quality_text_share_the_same_merged_row(self) -> None:
        sheet_path = self.sheets["GT-QZ02箱体扫码上线"]
        root = ET.fromstring(self.book.read(sheet_path))
        merges = {
            node.attrib["ref"]
            for node in root.findall(
                f"{{{MAIN}}}mergeCells/{{{MAIN}}}mergeCell"
            )
        }
        self.assertIn("B21:O21", merges)
        self.assertIn("B22:O22", merges)
        self.assertIn("P21:AC21", merges)
        self.assertIn("P22:AC22", merges)
        for forbidden in ("B21:AC21", "B22:AC22", "B34:AC34", "B35:AC35"):
            self.assertNotIn(forbidden, merges)

    def test_no_step_uses_full_four_slot_row_merge(self) -> None:
        forbidden = {
            "B10:AC22",
            "B12:AC20",
            "B21:AC21",
            "B22:AC22",
            "B23:AC35",
            "B25:AC33",
            "B34:AC34",
            "B35:AC35",
        }
        for name, sheet_path in self.sop_sheets.items():
            root = ET.fromstring(self.book.read(sheet_path))
            merges = {
                node.attrib["ref"]
                for node in root.findall(
                    f"{{{MAIN}}}mergeCells/{{{MAIN}}}mergeCell"
                )
            }
            self.assertFalse(forbidden & merges, name)

    def test_first_job_keeps_first_step_operation_picture(self) -> None:
        sheet_path = self.sheets["GT-QZ01箱体外观检查"]
        root = ET.fromstring(self.book.read(sheet_path))
        drawing_ref = root.find(f"{{{MAIN}}}drawing")
        rels_path = posixpath.join(
            posixpath.dirname(sheet_path),
            "_rels",
            posixpath.basename(sheet_path) + ".rels",
        )
        rels = ET.fromstring(self.book.read(rels_path))
        targets = {
            rel.attrib["Id"]: resolve(sheet_path, rel.attrib["Target"])
            for rel in rels
        }
        drawing_path = targets[drawing_ref.attrib[f"{{{REL}}}id"]]
        drawing = ET.fromstring(self.book.read(drawing_path))
        picture_anchors = {
            (
                int(anchor.find(f"{{{DRAW}}}from/{{{DRAW}}}row").text),
                int(anchor.find(f"{{{DRAW}}}from/{{{DRAW}}}col").text),
            )
            for anchor in list(drawing)
            if anchor.find(f"{{{DRAW}}}pic") is not None
            and anchor.find(f"{{{DRAW}}}from") is not None
        }
        self.assertIn((11, 1), picture_anchors)

    def test_unused_bottom_area_keeps_template_grid(self) -> None:
        sheet_path = self.sheets["GT-QZ01箱体外观检查"]
        root = ET.fromstring(self.book.read(sheet_path))
        merges = {
            node.attrib["ref"]
            for node in root.findall(
                f"{{{MAIN}}}mergeCells/{{{MAIN}}}mergeCell"
            )
        }
        self.assertNotIn("B23:AC35", merges)
        for expected in (
            "B23:B24",
            "C23:H24",
            "I23:I24",
            "J23:O24",
            "P23:P24",
            "Q23:V24",
            "W23:W24",
            "X23:AC24",
            "B25:H33",
            "I25:O33",
            "P25:V33",
            "W25:AC33",
        ):
            self.assertIn(expected, merges)


if __name__ == "__main__":
    unittest.main()
