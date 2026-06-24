from __future__ import annotations

import argparse
import base64
import copy
import json
import posixpath
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from preserve_print_settings import (
    ART,
    CHECKMARK_COLUMNS,
    DRAW,
    LABEL_TEXTS,
    MAIN,
    PACKAGE_REL,
    REL,
    TAGS,
    drawing_parts,
    remap_non_visual_ids,
    replace_child,
    resolve,
)

CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types"

GENERATED_CHECKMARK_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAAAoklEQVR4nO3WwQ2A"
    "IAwFUPgLsYyrOIWruEwnwhOJIVBKLY0x9qSJ/ge1GmPOOXgWXLXwgwsKnwDTuXdH"
    "P1q/FqnCaDviMpDbWYHhibkMDVUtxcrdUYWZgFwrWwWP5yYCRyvXYF2whPVCtVgT"
    "rMNG5zNYE2zdJBkMCcZ+aWamT4qxQzMTYvZakACdXRieBGq6AMlF9+ByrG15/H8T"
    "rQvmiW8DL6JpWDgQ3Eh3AAAAAElFTkSuQmCC"
)


def sheet_paths(book: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(book.read("xl/workbook.xml"))
    relationships = ET.fromstring(
        book.read("xl/_rels/workbook.xml.rels")
    )
    targets = {
        item.attrib["Id"]: resolve("xl/workbook.xml", item.attrib["Target"])
        for item in relationships
    }
    sheets = workbook.find(f"{{{MAIN}}}sheets")
    return {
        sheet.attrib["name"]: targets[sheet.attrib[f"{{{REL}}}id"]]
        for sheet in sheets
    }


def template_visuals(
    template: zipfile.ZipFile,
    template_sheet_xml: str,
) -> tuple[
    list[ET.Element],
    list[ET.Element],
    dict[str, str],
    ET.Element | None,
    str | None,
]:
    drawing_xml, drawing_rels_xml = drawing_parts(
        template, template_sheet_xml
    )
    drawing = ET.fromstring(template.read(drawing_xml))
    relationships = ET.fromstring(template.read(drawing_rels_xml))
    targets = {
        item.attrib["Id"]: resolve(drawing_xml, item.attrib["Target"])
        for item in relationships
    }
    labels = []
    legend_boxes = []
    checkmark = None
    checkmark_media = None
    for anchor in list(drawing):
        text = "".join(
            node.text or "" for node in anchor.findall(f".//{{{ART}}}t")
        )
        start = anchor.find(f"{{{DRAW}}}from")
        picture = anchor.find(f"{{{DRAW}}}pic")
        if start is not None and picture is not None:
            row = int(start.find(f"{{{DRAW}}}row").text)
            col = int(start.find(f"{{{DRAW}}}col").text)
            if (row, col) == (3, 1):
                labels.append(anchor)
        if text in LABEL_TEXTS:
            labels.append(anchor)
        shape = anchor.find(f"{{{DRAW}}}sp")
        if start is not None and shape is not None and not text:
            row = int(start.find(f"{{{DRAW}}}row").text)
            col = int(start.find(f"{{{DRAW}}}col").text)
            if (row, col) in {(32, 31), (32, 35)}:
                legend_boxes.append(anchor)
        blip = anchor.find(f".//{{{ART}}}blip")
        if blip is not None:
            media = targets.get(blip.attrib.get(f"{{{REL}}}embed"))
            if (
                media
                and posixpath.basename(media)
                in {"image6.png", "sop_checkmark.png"}
            ):
                checkmark = anchor
                checkmark_media = media
    return labels, legend_boxes, targets, checkmark, checkmark_media


def set_anchor_position(anchor: ET.Element, row: int, col: int) -> None:
    start = anchor.find(f"{{{DRAW}}}from")
    end = anchor.find(f"{{{DRAW}}}to")
    if start is None:
        return
    start.find(f"{{{DRAW}}}row").text = str(row)
    start.find(f"{{{DRAW}}}col").text = str(col)
    if end is not None:
        end.find(f"{{{DRAW}}}row").text = str(row + 1)
        end.find(f"{{{DRAW}}}col").text = str(col + 1)
    for marker in (start, end):
        if marker is None:
            continue
        row_offset = marker.find(f"{{{DRAW}}}rowOff")
        col_offset = marker.find(f"{{{DRAW}}}colOff")
        if row_offset is not None:
            row_offset.text = "0"
        if col_offset is not None:
            col_offset.text = "0"


def set_checkmark_anchor(anchor: ET.Element, row: int, col: int) -> None:
    """Place a generated checkmark inside the template checkbox.

    The blank template has no checked image to copy, so the fallback may clone a
    larger picture anchor (for example the TCL logo).  Force the cloned anchor to
    a compact one-cell image anchor so it cannot inherit that larger size.
    """

    set_anchor_position(anchor, row, col)
    start = anchor.find(f"{{{DRAW}}}from")
    if start is None:
        return

    anchor.tag = f"{{{DRAW}}}oneCellAnchor"
    anchor.attrib.clear()
    end = anchor.find(f"{{{DRAW}}}to")
    if end is not None:
        anchor.remove(end)

    extent = anchor.find(f"{{{DRAW}}}ext")
    if extent is None:
        extent = ET.Element(f"{{{DRAW}}}ext")
        children = list(anchor)
        from_index = children.index(start)
        anchor.insert(from_index + 1, extent)
    extent.attrib["cx"] = str(24 * 9525)
    extent.attrib["cy"] = str(24 * 9525)

    row_offset = start.find(f"{{{DRAW}}}rowOff")
    col_offset = start.find(f"{{{DRAW}}}colOff")
    if row_offset is not None:
        row_offset.text = str(2 * 9525)
    if col_offset is not None:
        col_offset.text = str(3 * 9525)


def ensure_media_content_types(
    content_types: ET.Element,
    package_names: set[str],
    added_names: set[str],
) -> None:
    extensions = {
        Path(name).suffix.lower().lstrip(".")
        for name in package_names | added_names
        if name.startswith("xl/media/")
    }
    defaults = {
        item.attrib.get("Extension")
        for item in content_types
        if item.tag == f"{{{CONTENT_TYPES}}}Default"
    }
    required = {
        "jpeg": "image/jpeg",
        "jpg": "image/jpeg",
        "png": "image/png",
    }
    for extension, content_type in required.items():
        if extension in extensions and extension not in defaults:
            ET.SubElement(
                content_types,
                f"{{{CONTENT_TYPES}}}Default",
                {
                    "Extension": extension,
                    "ContentType": content_type,
                },
            )


def add_visuals(
    template: zipfile.ZipFile,
    checkmark_template_book: zipfile.ZipFile,
    source: zipfile.ZipFile,
    output_sheet_xml: str,
    page_index: int,
    tags: dict[str, bool],
    labels: list[ET.Element],
    legend_boxes: list[ET.Element],
    template_targets: dict[str, str],
    checkmark_template: ET.Element | None,
    checkmark_source_media: str | None,
) -> dict[str, bytes]:
    output_drawing_xml, output_drawing_rels_xml = drawing_parts(
        source, output_sheet_xml
    )
    output_drawing = ET.fromstring(source.read(output_drawing_xml))
    output_rels = ET.fromstring(source.read(output_drawing_rels_xml))
    added: dict[str, bytes] = {}
    next_object_id = 10000 + page_index * 100

    for label_index, anchor in enumerate(labels, start=1):
        cloned = copy.deepcopy(anchor)
        next_object_id = remap_non_visual_ids(cloned, next_object_id)
        for image_index, blip in enumerate(
            cloned.findall(f".//{{{ART}}}blip"),
            start=1,
        ):
            old_id = blip.attrib[f"{{{REL}}}embed"]
            source_media = template_targets[old_id]
            suffix = Path(source_media).suffix
            media_name = (
                f"sop_p{page_index}_label{label_index}_{image_index}{suffix}"
            )
            media_path = f"xl/media/{media_name}"
            relationship_id = (
                f"rIdSopP{page_index}L{label_index}I{image_index}"
            )
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
                    "Target": f"../media/{media_name}",
                },
            )
            added[media_path] = template.read(source_media)
        output_drawing.append(cloned)

    for anchor in legend_boxes:
        cloned = copy.deepcopy(anchor)
        next_object_id = remap_non_visual_ids(cloned, next_object_id)
        output_drawing.append(cloned)

    if checkmark_template is not None or any(
        tags.get(tag_name) for tag_name in CHECKMARK_COLUMNS
    ):
        media_name = f"sop_p{page_index}_checkmark.png"
        relationship_id = f"rIdSopP{page_index}Checkmark"
        ET.SubElement(
            output_rels,
            f"{{{PACKAGE_REL}}}Relationship",
            {
                "Id": relationship_id,
                "Type": (
                    "http://schemas.openxmlformats.org/officeDocument/"
                    "2006/relationships/image"
                ),
                "Target": f"../media/{media_name}",
            },
        )
        if checkmark_template is not None and checkmark_source_media:
            added[f"xl/media/{media_name}"] = checkmark_template_book.read(
                checkmark_source_media
            )
        else:
            added[f"xl/media/{media_name}"] = GENERATED_CHECKMARK_PNG
            checkmark_template = next(
                (
                    anchor
                    for anchor in list(output_drawing)
                    if anchor.find(f"{{{DRAW}}}pic") is not None
                    and anchor.find(f"{{{DRAW}}}from") is not None
                ),
                None,
            )
        if checkmark_template is None:
            return added
        for tag_name, column in CHECKMARK_COLUMNS.items():
            if not tags.get(tag_name):
                continue
            cloned = copy.deepcopy(checkmark_template)
            next_object_id = remap_non_visual_ids(cloned, next_object_id)
            set_checkmark_anchor(cloned, 6, column)
            cloned.find(f".//{{{ART}}}blip").attrib[
                f"{{{REL}}}embed"
            ] = relationship_id
            output_drawing.append(cloned)

    added[output_drawing_xml] = ET.tostring(
        output_drawing, encoding="utf-8", xml_declaration=True
    )
    added[output_drawing_rels_xml] = ET.tostring(
        output_rels, encoding="utf-8", xml_declaration=True
    )
    return added


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--page-spec", type=Path, required=True)
    parser.add_argument("--template-sheet", default="洗衣机SOP")
    parser.add_argument("--visual-sheet", default="洗衣机SOP")
    parser.add_argument("--checkmark-template", type=Path)
    args = parser.parse_args()

    page_spec = json.loads(args.page_spec.read_text(encoding="utf-8"))
    with zipfile.ZipFile(args.template) as template:
        template_sheet_xml = sheet_paths(template)[args.template_sheet]
        template_root = ET.fromstring(template.read(template_sheet_xml))
        settings = {
            tag: template_root.find(f"{{{MAIN}}}{tag}")
            for tag in TAGS
        }
        visual_sheet_xml = sheet_paths(template)[args.visual_sheet]
        (
            labels,
            legend_boxes,
            targets,
            checkmark,
            checkmark_media,
        ) = template_visuals(
            template, visual_sheet_xml
        )
        checkmark_template_book = template
        if (
            checkmark is None
            and args.checkmark_template
            and args.checkmark_template.exists()
        ):
            checkmark_template_book = zipfile.ZipFile(
                args.checkmark_template
            )
            fallback_visual_sheet_xml = sheet_paths(
                checkmark_template_book
            )[args.visual_sheet]
            (
                _fallback_labels,
                _fallback_legend_boxes,
                fallback_targets,
                checkmark,
                checkmark_media,
            ) = template_visuals(
                checkmark_template_book,
                fallback_visual_sheet_xml,
            )
            targets = {**targets, **fallback_targets}

        with zipfile.ZipFile(args.input) as source:
            output_paths = sheet_paths(source)
            replacements: dict[str, bytes] = {}
            package_names = set(source.namelist())
            for page_index, page in enumerate(page_spec, start=1):
                output_sheet_xml = output_paths[page["name"]]
                root = ET.fromstring(source.read(output_sheet_xml))
                sheet_pr = root.find(f"{{{MAIN}}}sheetPr")
                if sheet_pr is not None:
                    tab_color = sheet_pr.find(f"{{{MAIN}}}tabColor")
                    if tab_color is not None:
                        sheet_pr.remove(tab_color)
                for tag in TAGS:
                    replace_child(root, tag, settings[tag])
                replacements[output_sheet_xml] = ET.tostring(
                    root, encoding="utf-8", xml_declaration=True
                )
                replacements.update(
                    add_visuals(
                        template,
                        checkmark_template_book,
                        source,
                        output_sheet_xml,
                        page_index,
                        page["tags"],
                        labels,
                        legend_boxes,
                        targets,
                        checkmark,
                        checkmark_media,
                    )
                )

            for output_sheet_xml in output_paths.values():
                payload = replacements.get(
                    output_sheet_xml,
                    source.read(output_sheet_xml),
                )
                root = ET.fromstring(payload)
                sheet_pr = root.find(f"{{{MAIN}}}sheetPr")
                if sheet_pr is not None:
                    tab_color = sheet_pr.find(f"{{{MAIN}}}tabColor")
                    if tab_color is not None:
                        sheet_pr.remove(tab_color)
                replacements[output_sheet_xml] = ET.tostring(
                    root, encoding="utf-8", xml_declaration=True
                )

            content_types = ET.fromstring(source.read("[Content_Types].xml"))
            ensure_media_content_types(
                content_types,
                package_names,
                set(replacements),
            )
            ET.register_namespace("", CONTENT_TYPES)
            replacements["[Content_Types].xml"] = ET.tostring(
                content_types, encoding="utf-8", xml_declaration=True
            )

            args.output.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(args.output, "w") as destination:
                for item in source.infolist():
                    payload = replacements.pop(
                        item.filename,
                        source.read(item.filename),
                    )
                    destination.writestr(item, payload)
                for name, payload in replacements.items():
                    destination.writestr(name, payload)
        if checkmark_template_book is not template:
            checkmark_template_book.close()


if __name__ == "__main__":
    main()
