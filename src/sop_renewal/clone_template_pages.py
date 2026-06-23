from __future__ import annotations

import argparse
import copy
import json
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types"


def resolve(base: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), target))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--page-spec", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--template-sheet", default="洗衣机SOP")
    args = parser.parse_args()

    page_spec = json.loads(args.page_spec.read_text(encoding="utf-8"))
    page_names = [
        item["name"] if isinstance(item, dict) else item
        for item in page_spec
    ]
    if not page_names:
        raise ValueError("page spec is empty")

    with zipfile.ZipFile(args.template) as source:
        workbook = ET.fromstring(source.read("xl/workbook.xml"))
        workbook_rels = ET.fromstring(
            source.read("xl/_rels/workbook.xml.rels")
        )
        content_types = ET.fromstring(source.read("[Content_Types].xml"))

        rel_targets = {
            rel.attrib["Id"]: resolve(
                "xl/workbook.xml", rel.attrib["Target"]
            )
            for rel in workbook_rels
        }
        sheets = workbook.find(f"{{{MAIN}}}sheets")
        template_sheet = next(
            sheet
            for sheet in sheets
            if sheet.attrib["name"] == args.template_sheet
        )
        template_path = rel_targets[template_sheet.attrib[f"{{{REL}}}id"]]
        template_root = ET.fromstring(source.read(template_path))
        drawing = template_root.find(f"{{{MAIN}}}drawing")
        if drawing is not None:
            template_root.remove(drawing)
        template_bytes = ET.tostring(
            template_root,
            encoding="utf-8",
            xml_declaration=True,
        )

        retained = [
            copy.deepcopy(sheet)
            for sheet in sheets
            if sheet.attrib["name"] in {"冲突审核", "处理日志"}
        ]
        for sheet in list(sheets):
            sheets.remove(sheet)

        existing_sheet_numbers = [
            int(match.group(1))
            for name in source.namelist()
            if (match := re.fullmatch(r"xl/worksheets/sheet(\d+)\.xml", name))
        ]
        next_sheet_number = max(existing_sheet_numbers, default=0) + 1
        existing_sheet_ids = [
            int(sheet.attrib["sheetId"])
            for sheet in retained
        ]
        next_sheet_id = max(existing_sheet_ids, default=0) + 1

        extra_files: dict[str, bytes] = {}
        for index, page_name in enumerate(page_names):
            sheet_number = next_sheet_number + index
            sheet_id = next_sheet_id + index
            relationship_id = f"rIdSopPage{index + 1}"
            part_name = f"xl/worksheets/sheet{sheet_number}.xml"
            sheets.append(
                ET.Element(
                    f"{{{MAIN}}}sheet",
                    {
                        "name": page_name[:31],
                        "sheetId": str(sheet_id),
                        f"{{{REL}}}id": relationship_id,
                    },
                )
            )
            ET.SubElement(
                workbook_rels,
                f"{{{PACKAGE_REL}}}Relationship",
                {
                    "Id": relationship_id,
                    "Type": (
                        "http://schemas.openxmlformats.org/officeDocument/"
                        "2006/relationships/worksheet"
                    ),
                    "Target": f"worksheets/sheet{sheet_number}.xml",
                },
            )
            ET.SubElement(
                content_types,
                f"{{{CONTENT_TYPES}}}Override",
                {
                    "PartName": f"/{part_name}",
                    "ContentType": (
                        "application/vnd.openxmlformats-officedocument."
                        "spreadsheetml.worksheet+xml"
                    ),
                },
            )
            extra_files[part_name] = template_bytes

        for sheet in retained:
            sheets.append(sheet)

        ET.register_namespace("", CONTENT_TYPES)
        content_types_bytes = ET.tostring(
            content_types, encoding="utf-8", xml_declaration=True
        )
        replacements = {
            "xl/workbook.xml": ET.tostring(
                workbook, encoding="utf-8", xml_declaration=True
            ),
            "xl/_rels/workbook.xml.rels": ET.tostring(
                workbook_rels, encoding="utf-8", xml_declaration=True
            ),
            "[Content_Types].xml": content_types_bytes,
        }

        args.output.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(args.output, "w") as destination:
            for item in source.infolist():
                payload = replacements.get(item.filename)
                if payload is None:
                    payload = source.read(item.filename)
                destination.writestr(item, payload)
            for name, payload in extra_files.items():
                destination.writestr(name, payload)


if __name__ == "__main__":
    main()
