from __future__ import annotations

import argparse
import copy
import posixpath
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
DRAW = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
ART = "http://schemas.openxmlformats.org/drawingml/2006/main"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
TAGS = ("printOptions", "pageMargins", "pageSetup")
LABEL_TEXTS = (
    "本岗位为关键工序，请严格按SOP操作",
    "操作前请佩戴静电手环，并确保接地良好",
    "每完成一步请检查外观，确保无划伤、无污渍",
    "注意节拍控制，避免影响整线效率",
)
CHECKMARK_COLUMNS = {
    "keyPost": 8,
    "esdProtection": 18,
    "visualInspection": 27,
    "operationBottleneck": 38,
}


def resolve(base: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), target))


def drawing_parts(
    book: zipfile.ZipFile,
    sheet_xml: str,
) -> tuple[str, str]:
    sheet_root = ET.fromstring(book.read(sheet_xml))
    drawing_ref = sheet_root.find(f"{{{MAIN}}}drawing")
    sheet_rels_path = posixpath.join(
        posixpath.dirname(sheet_xml),
        "_rels",
        posixpath.basename(sheet_xml) + ".rels",
    )
    sheet_rels = ET.fromstring(book.read(sheet_rels_path))
    targets = {
        item.attrib["Id"]: resolve(sheet_xml, item.attrib["Target"])
        for item in sheet_rels
    }
    drawing_xml = targets[drawing_ref.attrib[f"{{{REL}}}id"]]
    drawing_rels_xml = posixpath.join(
        posixpath.dirname(drawing_xml),
        "_rels",
        posixpath.basename(drawing_xml) + ".rels",
    )
    return drawing_xml, drawing_rels_xml


def remap_non_visual_ids(anchor: ET.Element, start: int) -> int:
    current = start
    for node in anchor.findall(f".//{{{DRAW}}}cNvPr"):
        node.attrib["id"] = str(current)
        node.attrib["name"] = f"SOP保留对象 {current}"
        current += 1
    return current


def restore_template_visuals(
    template: zipfile.ZipFile,
    source: zipfile.ZipFile,
    sheet_xml: str,
    checkmarks: set[str],
) -> tuple[dict[str, bytes], str, str]:
    template_drawing_xml, template_drawing_rels_xml = drawing_parts(
        template, sheet_xml
    )
    output_drawing_xml, output_drawing_rels_xml = drawing_parts(source, sheet_xml)
    template_drawing = ET.fromstring(template.read(template_drawing_xml))
    template_rels = ET.fromstring(template.read(template_drawing_rels_xml))
    template_targets = {
        item.attrib["Id"]: resolve(template_drawing_xml, item.attrib["Target"])
        for item in template_rels
    }
    output_drawing = ET.fromstring(source.read(output_drawing_xml))
    output_rels = ET.fromstring(source.read(output_drawing_rels_xml))

    added_files: dict[str, bytes] = {}
    next_object_id = 9000
    label_index = 0
    for anchor in list(template_drawing):
        text = "".join(
            node.text or "" for node in anchor.findall(f".//{{{ART}}}t")
        )
        if text not in LABEL_TEXTS:
            continue
        cloned = copy.deepcopy(anchor)
        next_object_id = remap_non_visual_ids(cloned, next_object_id)
        for blip in cloned.findall(f".//{{{ART}}}blip"):
            old_id = blip.attrib[f"{{{REL}}}embed"]
            source_media = template_targets[old_id]
            target_media = f"xl/media/sop_label_{label_index + 1}.png"
            relationship_id = f"rIdSopLabel{label_index + 1}"
            blip.attrib[f"{{{REL}}}embed"] = relationship_id
            ET.SubElement(
                output_rels,
                f"{{{PACKAGE_REL}}}Relationship",
                {
                    "Id": relationship_id,
                    "Type": (
                        "http://schemas.openxmlformats.org/officeDocument/"
                        "2006/relationships/image"
                    ),
                    "Target": f"../media/{posixpath.basename(target_media)}",
                },
            )
            added_files[target_media] = template.read(source_media)
        output_drawing.append(cloned)
        label_index += 1

    template_sheet1_drawing = ET.fromstring(
        template.read("xl/drawings/drawing1.xml")
    )
    template_sheet1_rels = ET.fromstring(
        template.read("xl/drawings/_rels/drawing1.xml.rels")
    )
    sheet1_targets = {
        item.attrib["Id"]: resolve(
            "xl/drawings/drawing1.xml", item.attrib["Target"]
        )
        for item in template_sheet1_rels
    }
    checkmark_template = None
    for anchor in list(template_sheet1_drawing):
        blip = anchor.find(f".//{{{ART}}}blip")
        if blip is None:
            continue
        if sheet1_targets.get(blip.attrib.get(f"{{{REL}}}embed")) == (
            "xl/media/image6.png"
        ):
            checkmark_template = anchor
            break

    if checkmark_template is not None:
        checkmark_media = "xl/media/sop_checkmark.png"
        checkmark_rel_id = "rIdSopCheckmark"
        ET.SubElement(
            output_rels,
            f"{{{PACKAGE_REL}}}Relationship",
            {
                "Id": checkmark_rel_id,
                "Type": (
                    "http://schemas.openxmlformats.org/officeDocument/"
                    "2006/relationships/image"
                ),
                "Target": "../media/sop_checkmark.png",
            },
        )
        added_files[checkmark_media] = template.read("xl/media/image6.png")
        for tag_name, column in CHECKMARK_COLUMNS.items():
            if tag_name not in checkmarks:
                continue
            cloned = copy.deepcopy(checkmark_template)
            next_object_id = remap_non_visual_ids(cloned, next_object_id)
            cloned.find(f"{{{DRAW}}}from/{{{DRAW}}}col").text = str(column)
            cloned.find(f"{{{DRAW}}}to/{{{DRAW}}}col").text = str(column + 1)
            blip = cloned.find(f".//{{{ART}}}blip")
            blip.attrib[f"{{{REL}}}embed"] = checkmark_rel_id
            output_drawing.append(cloned)

    added_files[output_drawing_xml] = ET.tostring(
        output_drawing, encoding="utf-8", xml_declaration=True
    )
    added_files[output_drawing_rels_xml] = ET.tostring(
        output_rels, encoding="utf-8", xml_declaration=True
    )
    return added_files, output_drawing_xml, output_drawing_rels_xml


def replace_child(root: ET.Element, tag: str, source: ET.Element | None) -> None:
    existing = root.find(f"{{{MAIN}}}{tag}")
    if existing is not None:
        root.remove(existing)
    if source is None:
        return
    cloned = copy.deepcopy(source)
    if tag == "pageSetup":
        cloned.attrib.pop(f"{{{REL}}}id", None)

    order = [
        "sheetPr",
        "dimension",
        "sheetViews",
        "sheetFormatPr",
        "cols",
        "sheetData",
        "sheetCalcPr",
        "sheetProtection",
        "protectedRanges",
        "scenarios",
        "autoFilter",
        "sortState",
        "dataConsolidate",
        "customSheetViews",
        "mergeCells",
        "phoneticPr",
        "conditionalFormatting",
        "dataValidations",
        "hyperlinks",
        "printOptions",
        "pageMargins",
        "pageSetup",
        "headerFooter",
        "rowBreaks",
        "colBreaks",
        "customProperties",
        "cellWatches",
        "ignoredErrors",
        "smartTags",
        "drawing",
        "legacyDrawing",
        "legacyDrawingHF",
        "picture",
        "oleObjects",
        "controls",
        "webPublishItems",
        "tableParts",
        "extLst",
    ]
    desired_index = order.index(tag)
    insert_at = len(root)
    for index, child in enumerate(root):
        local_name = child.tag.rsplit("}", 1)[-1]
        if local_name in order and order.index(local_name) > desired_index:
            insert_at = index
            break
    root.insert(insert_at, cloned)


def preserve(
    template_path: Path,
    input_path: Path,
    output_path: Path,
    sheet_xml: str,
    checkmarks: set[str],
) -> None:
    with zipfile.ZipFile(template_path) as template:
        template_root = ET.fromstring(template.read(sheet_xml))
        settings = {
            tag: template_root.find(f"{{{MAIN}}}{tag}")
            for tag in TAGS
        }

        with zipfile.ZipFile(input_path) as source:
            visual_files, _, _ = restore_template_visuals(
                template,
                source,
                sheet_xml,
                checkmarks,
            )

    with zipfile.ZipFile(input_path) as source:
        output_root = ET.fromstring(source.read(sheet_xml))
        for tag in TAGS:
            replace_child(output_root, tag, settings[tag])
        modified_xml = ET.tostring(
            output_root,
            encoding="utf-8",
            xml_declaration=True,
        )

        with zipfile.ZipFile(output_path, "w") as destination:
            for item in source.infolist():
                if item.filename in visual_files:
                    payload = visual_files.pop(item.filename)
                    destination.writestr(item, payload)
                    continue
                payload = (
                    modified_xml
                    if item.filename == sheet_xml
                    else source.read(item.filename)
                )
                destination.writestr(item, payload)
            for filename, payload in visual_files.items():
                destination.writestr(filename, payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--sheet-xml",
        default="xl/worksheets/sheet2.xml",
    )
    parser.add_argument("--checkmarks", default="")
    args = parser.parse_args()
    preserve(
        args.template,
        args.input,
        args.output,
        args.sheet_xml,
        {item for item in args.checkmarks.split(",") if item},
    )


if __name__ == "__main__":
    main()
