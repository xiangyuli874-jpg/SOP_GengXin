# SOP_GengXin

Excel SOP renewal toolkit for converting legacy washing-machine SOP workbooks into the newer standard workbook format.

This repository contains the conversion scripts, layout rules, preservation utilities, verification tests, and design notes used for the SOP renewal workflow.

## Current Scope

- Parse legacy `.xlsx` SOP sheets, including cell values, drawing anchors, text boxes, and embedded operation images.
- Build structured SOP models with job header fields, materials, tools, operation steps, control points, quality requirements, and conflict notes.
- Generate single-sample and batch renewed SOP workbooks from the standard template.
- Preserve template-level visuals and print settings after workbook export.
- Keep TCL logos, operation legend boxes, checkmark images, media relationships, and workbook content types intact.
- Generate conflict review and processing log sheets for traceability.

## Latest Updates

- Added robust generated checkmark placement so fallback checkmarks are compact `oneCellAnchor` images and do not inherit large logo dimensions.
- Added media content type completion for workbook packages, including `jpeg`, `jpg`, and `png` defaults.
- Added structure tests for JPEG content types, TCL logo preservation, operation legend boxes, checkmark placement, and generated checkmark size.
- Improved extraction/preservation behavior for missing SOP fields and drawing anchors.

## Repository Layout

```text
docs/
  superpowers/
    plans/      Design and implementation planning records
    specs/      SOP renewal design notes

src/sop_renewal/
  analyze_batch.py              Batch workbook extraction
  batch_rules.mjs               Batch SOP modeling and rule application
  build_batch.mjs               Batch workbook generation entry point
  build_sample.mjs              Single-sample workbook generation entry point
  clone_template_pages.py       Template page cloning
  extract_sample.py             Single-sheet extraction
  layout_planner.mjs            Dynamic step layout planning
  preserve_batch.py             Batch workbook visual/media preservation
  preserve_print_settings.py    Sample workbook print/visual preservation
  sample_rules.mjs              Sample SOP modeling rules
  verify_batch.mjs              Batch output preview and formula scan

tests/sop_renewal/
  *.test.mjs                    Node.js unit tests
  test_*.py                     Python workbook structure tests

outputs/
  Generated workbooks and previews; ignored by Git
```

## Git-Ignored Local Artifacts

The repository intentionally excludes local/generated artifacts:

- `node_modules/`
- `.codex-work/`
- `outputs/`
- `__pycache__/`
- `*.pyc`
- Excel temporary lock files such as `~$*.xlsx`

The source workbook `普通8kg及以下产品前总装SOP.xlsx` is tracked because it is part of the current project input.

## Running

The scripts currently use absolute paths from the local SOP workspace. Before running on another machine, update the hard-coded paths in the entry scripts or keep the same workspace layout.

Single-sample generation:

```powershell
node src/sop_renewal/build_sample.mjs
```

Batch generation:

```powershell
node src/sop_renewal/build_batch.mjs
```

Batch verification preview/formula scan:

```powershell
node src/sop_renewal/verify_batch.mjs
```

## Testing

Node.js tests:

```powershell
node --test tests/sop_renewal/*.test.mjs
```

Python structure tests can be run with either `unittest` or `pytest` after generating the expected output workbook:

```powershell
python -m unittest discover tests/sop_renewal
```

Some tests depend on generated files under `outputs/` and on local template workbooks that are not committed.

## Notes

- Generated output files are not committed; regenerate them from the scripts when needed.
- The conversion logic favors preserving original process content and key parameters over copying conflicting values from reference examples.
- Conflict and processing-log sheets are generated so manual review remains focused on high-risk differences.

