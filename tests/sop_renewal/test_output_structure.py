import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

OUTPUT = Path(r"E:\AI\SOP\outputs\sop-sample-renewal\安装减震器螺栓_新版SOP_样例.xlsx")
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
ART = "http://schemas.openxmlformats.org/drawingml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def column_number(text: str) -> int:
    value = 0
    for char in text:
        value = value * 26 + ord(char) - ord("A") + 1
    return value


def bounds(reference: str) -> tuple[int, int, int, int]:
    start, end = reference.split(":")

    def cell(value: str) -> tuple[int, int]:
        letters = "".join(char for char in value if char.isalpha())
        digits = "".join(char for char in value if char.isdigit())
        return int(digits), column_number(letters)

    row1, col1 = cell(start)
    row2, col2 = cell(end)
    return row1, col1, row2, col2


def overlaps(left: tuple[int, int, int, int], right: tuple[int, int, int, int]) -> bool:
    return not (
        left[2] < right[0]
        or right[2] < left[0]
        or left[3] < right[1]
        or right[3] < left[1]
    )


class OutputStructureTest(unittest.TestCase):
    def test_generated_sheet_has_no_overlapping_merged_ranges(self):
        with zipfile.ZipFile(OUTPUT) as book:
            root = ET.fromstring(book.read("xl/worksheets/sheet2.xml"))
        references = [
            item.attrib["ref"]
            for item in root.findall(f".//{{{MAIN}}}mergeCell")
        ]
        collisions = []
        for index, left in enumerate(references):
            for right in references[index + 1 :]:
                if overlaps(bounds(left), bounds(right)):
                    collisions.append((left, right))
        self.assertEqual(collisions, [])

    def test_generated_sheet_preserves_template_page_settings(self):
        with zipfile.ZipFile(OUTPUT) as book:
            root = ET.fromstring(book.read("xl/worksheets/sheet2.xml"))
        print_options = root.find(f"{{{MAIN}}}printOptions")
        page_margins = root.find(f"{{{MAIN}}}pageMargins")
        page_setup = root.find(f"{{{MAIN}}}pageSetup")

        self.assertEqual(
            print_options.attrib,
            {"horizontalCentered": "1", "verticalCentered": "1"},
        )
        self.assertEqual(page_setup.attrib["paperSize"], "8")
        self.assertEqual(page_setup.attrib["orientation"], "landscape")
        self.assertEqual(page_setup.attrib["scale"], "87")
        self.assertEqual(page_margins.attrib["left"], "0.39370078740157499")
        self.assertEqual(page_margins.attrib["right"], "0.39370078740157499")
        self.assertEqual(page_margins.attrib["top"], "0")
        self.assertEqual(page_margins.attrib["bottom"], "0")

    def test_generated_sheet_restores_four_labels_and_expected_checkmarks(self):
        with zipfile.ZipFile(OUTPUT) as book:
            drawing = ET.fromstring(book.read("xl/drawings/drawing2.xml"))
            rels = ET.fromstring(
                book.read("xl/drawings/_rels/drawing2.xml.rels")
            )
        relationship_targets = {
            item.attrib["Id"]: item.attrib["Target"]
            for item in rels
        }
        texts = [
            "".join(
                node.text or ""
                for node in anchor.findall(f".//{{{ART}}}t")
            )
            for anchor in list(drawing)
        ]
        for expected in (
            "本岗位为关键工序，请严格按SOP操作",
            "操作前请佩戴静电手环，并确保接地良好",
            "每完成一步请检查外观，确保无划伤、无污渍",
            "注意节拍控制，避免影响整线效率",
        ):
            self.assertIn(expected, texts)

        checkmark_columns = []
        for anchor in list(drawing):
            blip = anchor.find(f".//{{{ART}}}blip")
            if blip is None:
                continue
            target = relationship_targets.get(blip.attrib.get(f"{{{REL}}}embed"), "")
            if target.endswith("sop_checkmark.png"):
                start = anchor.find(f"{{{DRAW}}}from")
                checkmark_columns.append(
                    int(start.find(f"{{{DRAW}}}col").text)
                )
        self.assertEqual(sorted(checkmark_columns), [8, 27])


if __name__ == "__main__":
    unittest.main()
