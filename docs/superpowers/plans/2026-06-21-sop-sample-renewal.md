# SOP 单样例版式焕新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将旧版“安装减震器螺栓”岗位转换为新版 SOP 单样例，完整保留关键工艺内容和有效图片，并输出精简冲突表与处理日志。

**Architecture:** 使用 Python 只读解析旧版 OOXML，生成可审计的中间 JSON 和原图；使用 JavaScript 与 `@oai/artifact-tool` 导入新版模板、动态规划步骤区域并生成最终 `.xlsx`。所有输出另存，不覆盖源文件；视觉核验只进行一次完整检查和一次必要修正。

**Tech Stack:** Bundled Python 3、Python 标准库、Pillow、Node.js、`@oai/artifact-tool`、Node `node:test`、Computer Use（最终 Excel 视觉检查）

---

## 文件结构

```text
E:\AI\SOP\
├─ src\
│  └─ sop_renewal\
│     ├─ extract_sample.py          # 解析旧版字段、文本框、图片和页面信息
│     ├─ sample_rules.mjs           # 样例字段映射、文字规范化和冲突规则
│     ├─ layout_planner.mjs         # 步骤空间估算和动态槽位规划
│     └─ build_sample.mjs           # 唯一工作簿生成入口
├─ tests\
│  └─ sop_renewal\
│     ├─ test_extract_sample.py
│     ├─ sample_rules.test.mjs
│     └─ layout_planner.test.mjs
├─ .codex-work\
│  └─ sop-sample\
│     ├─ extracted\
│     ├─ sample-source.json
│     └─ node_modules               # 指向 bundled node_modules 的 junction
└─ outputs\
   └─ sop-sample-renewal\
      └─ 安装减震器螺栓_新版SOP_样例.xlsx
```

不创建删除脚本，不执行递归删除。重复运行时覆盖明确的单个中间文件和最终样例文件。

## Task 1: 建立样例运行目录和基线测试

**Files:**

- Create: `E:\AI\SOP\tests\sop_renewal\sample_rules.test.mjs`
- Create: `E:\AI\SOP\tests\sop_renewal\layout_planner.test.mjs`

- [ ] **Step 1: 建立运行目录和依赖 junction**

Run:

```powershell
New-Item -ItemType Directory -Force "E:\AI\SOP\src\sop_renewal" | Out-Null
New-Item -ItemType Directory -Force "E:\AI\SOP\tests\sop_renewal" | Out-Null
New-Item -ItemType Directory -Force "E:\AI\SOP\.codex-work\sop-sample\extracted" | Out-Null
New-Item -ItemType Directory -Force "E:\AI\SOP\outputs\sop-sample-renewal" | Out-Null
New-Item -ItemType Junction -Path "E:\AI\SOP\.codex-work\sop-sample\node_modules" -Target "C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
```

Expected: 所有目录存在，`node_modules` 指向 bundled runtime；不修改 runtime 目录。

- [ ] **Step 2: 写入规则基线测试**

```js
// E:\AI\SOP\tests\sop_renewal\sample_rules.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSampleModel,
  normalizeUnitText,
} from "../../src/sop_renewal/sample_rules.mjs";

test("normalizes unit punctuation without changing the torque value", () => {
  assert.equal(normalizeUnitText("减震器螺栓力矩：20-25N.m"), "减震器螺栓力矩：20–25 N·m");
});

test("keeps old process-critical values when the completed case conflicts", () => {
  const model = buildSampleModel({
    old: {
      jobName: "紧固减震器螺栓",
      jobCode: "GT-HZ03",
      taktTime: "15s",
      people: 1,
      materialName: "减震器螺栓M10*43.5",
      materialQty: 2,
      toolName: "ETV DS72-30-10电枪",
      toolQty: 1,
      torque: "20-25N.m",
      stepGroups: [],
    },
    completedCase: {
      jobName: "吊筒",
      toolName: "固定扭矩气动枪",
      torque: null,
    },
  });

  assert.equal(model.header.jobName, "紧固减震器螺栓");
  assert.equal(model.tools[0].name, "ETV DS72-30-10电枪");
  assert.equal(model.qualityRequirements[0], "减震器螺栓力矩：20–25 N·m");
  assert.deepEqual(
    model.conflicts.map((item) => item.type),
    ["岗位名称冲突", "工具名称冲突", "关键参数缺失"],
  );
});
```

- [ ] **Step 3: 写入布局基线测试**

```js
// E:\AI\SOP\tests\sop_renewal\layout_planner.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { planLayout } from "../../src/sop_renewal/layout_planner.mjs";

test("keeps multiple images from one action in one step region", () => {
  const plan = planLayout([
    { id: 1, text: "拿取并检查螺栓", images: [{ ratio: 1.3 }, { ratio: 1.1 }] },
    { id: 2, text: "安装减震器并插入螺栓", images: [{ ratio: 0.76 }, { ratio: 1.14 }] },
    { id: 3, text: "紧固并检查", images: [{ ratio: 1.08 }] },
  ]);

  assert.equal(plan.pages.length, 1);
  assert.deepEqual(plan.pages[0].steps.map((step) => step.id), [1, 2, 3]);
  assert.equal(plan.pages[0].steps[0].imageCount, 2);
  assert.equal(plan.pages[0].steps[1].imageCount, 2);
});

test("adds a page instead of shrinking images below the minimum capacity", () => {
  const steps = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1,
    text: `步骤${index + 1}`,
    images: [{ ratio: 1.2 }, { ratio: 1.2 }, { ratio: 1.2 }],
  }));
  const plan = planLayout(steps);
  assert.equal(plan.pages.length > 1, true);
  assert.deepEqual(
    plan.pages.flatMap((page) => page.steps.map((step) => step.id)),
    [1, 2, 3, 4, 5, 6, 7],
  );
});
```

- [ ] **Step 4: 运行测试并确认按预期失败**

Run:

```powershell
& "C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test "E:\AI\SOP\tests\sop_renewal\sample_rules.test.mjs" "E:\AI\SOP\tests\sop_renewal\layout_planner.test.mjs"
```

Expected: FAIL，提示 `sample_rules.mjs` 或 `layout_planner.mjs` 尚不存在。

## Task 2: 实现旧版样例解析器

**Files:**

- Create: `E:\AI\SOP\src\sop_renewal\extract_sample.py`
- Create: `E:\AI\SOP\tests\sop_renewal\test_extract_sample.py`

- [ ] **Step 1: 写入解析器测试**

```python
# E:\AI\SOP\tests\sop_renewal\test_extract_sample.py
import json
import subprocess
import unittest
from pathlib import Path

PYTHON = Path(r"C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe")
SCRIPT = Path(r"E:\AI\SOP\src\sop_renewal\extract_sample.py")
SOURCE = Path(r"E:\AI\SOP\旧版滚筒关键岗位SOP.xlsx")
OUTPUT = Path(r"E:\AI\SOP\.codex-work\sop-sample\sample-source.json")
IMAGE_DIR = Path(r"E:\AI\SOP\.codex-work\sop-sample\extracted")


class ExtractSampleTest(unittest.TestCase):
    def test_extracts_process_critical_fields_and_operation_images(self):
        subprocess.run(
            [
                str(PYTHON),
                str(SCRIPT),
                "--input",
                str(SOURCE),
                "--sheet",
                "安装减震器螺栓",
                "--output",
                str(OUTPUT),
                "--image-dir",
                str(IMAGE_DIR),
            ],
            check=True,
        )
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(data["job_name"], "紧固减震器螺栓")
        self.assertEqual(data["job_code"], "GT-HZ03")
        self.assertEqual(data["takt_time"], "15s")
        self.assertEqual(data["people"], 1)
        self.assertEqual(data["material"]["name"], "减震器螺栓M10*43.5")
        self.assertEqual(data["material"]["qty"], 2)
        self.assertEqual(data["tool"]["name"], "ETV DS72-30-10电枪")
        self.assertEqual(data["torque"], "20-25N.m")
        self.assertGreaterEqual(len(data["operation_images"]), 5)
        self.assertTrue(all(Path(item["path"]).exists() for item in data["operation_images"]))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
& "C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m unittest "E:\AI\SOP\tests\sop_renewal\test_extract_sample.py" -v
```

Expected: FAIL，提示 `extract_sample.py` 不存在。

- [ ] **Step 3: 实现 OOXML 解析器**

实现要求：

```python
# E:\AI\SOP\src\sop_renewal\extract_sample.py
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
            text = "".join(node.text or "" for node in inline.findall(f".//{{{MAIN}}}t"))
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
        posixpath.dirname(sheet_path), "_rels", posixpath.basename(sheet_path) + ".rels"
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
        if picture is not None:
            blip = picture.find("xdr:blipFill/a:blip", NS)
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
            text = "".join(node.text or "" for node in shape.findall(".//a:t", NS)).strip()
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
        if item["row"] <= 23 and not re.fullmatch(r"[①②③④⑤]", item["text"])
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
        "operation_images": sorted(operation_images, key=lambda item: (item["row"], item["col"])),
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
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 运行解析测试**

Run:

```powershell
& "C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m unittest "E:\AI\SOP\tests\sop_renewal\test_extract_sample.py" -v
```

Expected: PASS；生成 `sample-source.json` 和至少 5 张作业区图片。

## Task 3: 实现样例规则和精简冲突检测

**Files:**

- Create: `E:\AI\SOP\src\sop_renewal\sample_rules.mjs`

- [ ] **Step 1: 实现文字规范化、步骤分组和冲突规则**

```js
// E:\AI\SOP\src\sop_renewal\sample_rules.mjs
export function normalizeUnitText(text) {
  return String(text)
    .replace(/(\d+)\s*-\s*(\d+)\s*N[.·]m/gi, "$1–$2 N·m")
    .replace(/\s+/g, " ")
    .trim();
}

function imageRatios(images) {
  return images.map((image) => ({
    ...image,
    ratio: image.ratio ?? image.width / image.height,
  }));
}

export function buildSampleModel({ old, completedCase }) {
  const conflicts = [];
  if (completedCase.jobName && completedCase.jobName !== old.jobName) {
    conflicts.push({
      type: "岗位名称冲突",
      oldValue: old.jobName,
      caseValue: completedCase.jobName,
      adoptedValue: old.jobName,
      risk: "案例岗位名称与旧版工序名称不一致",
    });
  }
  if (completedCase.toolName && completedCase.toolName !== old.toolName) {
    conflicts.push({
      type: "工具名称冲突",
      oldValue: old.toolName,
      caseValue: completedCase.toolName,
      adoptedValue: old.toolName,
      risk: "工具类型变化可能影响工艺",
    });
  }
  if (old.torque && !completedCase.torque) {
    conflicts.push({
      type: "关键参数缺失",
      oldValue: old.torque,
      caseValue: "",
      adoptedValue: normalizeUnitText(old.torque),
      risk: "案例未保留旧版关键力矩",
    });
  }

  const images = imageRatios(old.operationImages ?? []);
  const steps = [
    {
      id: 1,
      text: "拿取减震器螺栓，检查型号、涂层和螺纹状态，确认无锈蚀、无损伤。",
      images: images.slice(0, 2),
      controlPoints: ["减震器螺栓型号正确。"],
      qualityRequirements: [],
    },
    {
      id: 2,
      text: "对齐减震器螺栓孔与箱体固定孔，将螺栓完全穿入安装孔；操作时避免直接握拿减震器钢管，防止蹭掉润滑油。",
      images: images.slice(2, 4),
      controlPoints: ["安装方向正确，螺栓孔与固定孔准确对齐。"],
      qualityRequirements: ["减震器连接无异常、无脱节。"],
    },
    {
      id: 3,
      text: "使用电枪紧固减震器螺栓，检查螺栓紧固状态。",
      images: images.slice(4),
      controlPoints: ["螺栓紧固到位，无漏打、滑丝。"],
      qualityRequirements: [normalizeUnitText(`减震器螺栓力矩：${old.torque}`)],
    },
  ].filter((step) => step.images.length || step.text);

  return {
    header: {
      productName: old.productName,
      line: "A",
      jobName: old.jobName,
      jobCode: old.jobCode,
      people: old.people,
      taktTime: old.taktTime,
      fileNumber: old.fileNumber,
      revision: 1,
      effectiveDateSerial: old.effectiveDateSerial,
    },
    tools: [{ name: old.toolName, qty: old.toolQty, setting: normalizeUnitText(old.torque) }],
    materials: [{ name: old.materialName, qty: old.materialQty }],
    steps,
    qualityRequirements: [normalizeUnitText(`减震器螺栓力矩：${old.torque}`)],
    conflicts,
    log: [
      "旧版工艺内容优先于已完成案例。",
      "标点和单位格式已规范化，参数数值未改变。",
      "同一动作的多张图片保持在同一步骤区域。",
    ],
  };
}

export function fromExtractedSource(source) {
  return buildSampleModel({
    old: {
      jobName: source.job_name,
      jobCode: source.job_code,
      productName: source.product_name,
      taktTime: source.takt_time,
      people: source.people,
      fileNumber: source.file_number,
      effectiveDateSerial: source.effective_date_serial,
      materialName: source.material.name,
      materialQty: source.material.qty,
      toolName: source.tool.name,
      toolQty: source.tool.qty,
      torque: source.torque,
      operationImages: source.operation_images,
    },
    completedCase: {
      jobName: "吊筒",
      toolName: "固定扭矩气动枪",
      torque: null,
    },
  });
}
```

- [ ] **Step 2: 运行规则测试**

Run:

```powershell
& "C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test "E:\AI\SOP\tests\sop_renewal\sample_rules.test.mjs"
```

Expected: PASS。

## Task 4: 实现动态布局规划器

**Files:**

- Create: `E:\AI\SOP\src\sop_renewal\layout_planner.mjs`

- [ ] **Step 1: 实现容量估算和分页**

```js
// E:\AI\SOP\src\sop_renewal\layout_planner.mjs
const TOP_LEFT = {
  textCell: "C10",
  imageRange: "B12:O20",
  numberCell: "B10",
};
const TOP_RIGHT = {
  textCell: "Q10",
  imageRange: "P12:AC20",
  numberCell: "P10",
};
const BOTTOM_FULL = {
  textCell: "C23",
  imageRange: "B25:AC33",
  numberCell: "B23",
};

function demand(step) {
  const imageDemand = Math.max(1, step.images.length);
  const textDemand = Math.max(1, Math.ceil(step.text.length / 50));
  return imageDemand + textDemand * 0.4;
}

export function planLayout(steps) {
  const pages = [];
  let remaining = [...steps];

  while (remaining.length) {
    const page = { steps: [] };
    const first = remaining.shift();
    const second = remaining[0];

    if (demand(first) > 3.5) {
      page.steps.push({ ...first, imageCount: first.images.length, slot: "top-full" });
    } else {
      page.steps.push({ ...first, imageCount: first.images.length, slot: TOP_LEFT });
      if (second && demand(second) <= 3.5) {
        remaining.shift();
        page.steps.push({ ...second, imageCount: second.images.length, slot: TOP_RIGHT });
      }
    }

    if (remaining.length) {
      const third = remaining.shift();
      page.steps.push({ ...third, imageCount: third.images.length, slot: BOTTOM_FULL });
    }
    pages.push(page);
  }

  return { pages };
}
```

- [ ] **Step 2: 运行布局测试**

Run:

```powershell
& "C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test "E:\AI\SOP\tests\sop_renewal\layout_planner.test.mjs"
```

Expected: PASS。

## Task 5: 使用新版模板生成单样例工作簿

**Files:**

- Create: `E:\AI\SOP\src\sop_renewal\build_sample.mjs`

- [ ] **Step 1: 编写唯一生成入口**

生成器必须：

- 导入 `新版洗衣机SOP标准格式.xlsx`。
- 使用模板中的 `洗衣机SOP` 工作表。
- 只修改目标字段和作业步骤区域。
- 保留模板原有字体、边框、列宽、行高和页面设置。
- 新增 `冲突审核` 和 `处理日志` 两个简洁工作表。
- 通过 `@oai/artifact-tool` 插图和导出。

```js
// E:\AI\SOP\src\sop_renewal\build_sample.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { fromExtractedSource } from "./sample_rules.mjs";
import { planLayout } from "./layout_planner.mjs";

const ROOT = "E:/AI/SOP";
const TEMPLATE = `${ROOT}/新版洗衣机SOP标准格式.xlsx`;
const SOURCE_JSON = `${ROOT}/.codex-work/sop-sample/sample-source.json`;
const OUTPUT = `${ROOT}/outputs/sop-sample-renewal/安装减震器螺栓_新版SOP_样例.xlsx`;

function mimeType(filePath) {
  const suffix = path.extname(filePath).toLowerCase();
  if (suffix === ".png") return "image/png";
  if (suffix === ".jpg" || suffix === ".jpeg") return "image/jpeg";
  throw new Error(`不支持的图片格式：${suffix}`);
}

async function dataUrl(filePath) {
  const bytes = await fs.readFile(filePath);
  return `data:${mimeType(filePath)};base64,${bytes.toString("base64")}`;
}

function fillHeader(sheet, model) {
  sheet.getRange("I5").values = [[model.header.productName]];
  sheet.getRange("N5").values = [[model.header.line]];
  sheet.getRange("P5").values = [[model.header.jobName]];
  sheet.getRange("U5").values = [[model.header.jobCode]];
  sheet.getRange("X5").values = [[model.header.people]];
  sheet.getRange("Z5").values = [[model.header.taktTime]];
  sheet.getRange("AB5").values = [[model.header.fileNumber]];
  sheet.getRange("AG5").values = [[model.header.revision]];
  sheet.getRange("AL4").values = [[Number(model.header.effectiveDateSerial)]];
  sheet.getRange("AL5").values = [[Number(model.header.effectiveDateSerial)]];
  sheet.getRange("AL4:AN5").format.numberFormat = "yyyy-mm-dd";
}

function fillResources(sheet, model) {
  sheet.getRange("AE11").values = [[1]];
  sheet.getRange("AF11").values = [[model.tools[0].name]];
  sheet.getRange("AI11").values = [[model.tools[0].qty]];
  sheet.getRange("AJ11").values = [[model.tools[0].setting]];
  sheet.getRange("AE20").values = [[1]];
  sheet.getRange("AF20").values = [[model.materials[0].name]];
  sheet.getRange("AM20").values = [[model.materials[0].qty]];
}

function prepareStepArea(sheet) {
  for (const range of [
    "B10:AC33",
  ]) {
    sheet.getRange(range).clear({ applyTo: "contents" });
  }
  for (const range of [
    "C10:O11",
    "Q10:AC11",
    "B12:O20",
    "P12:AC20",
    "C23:AC24",
    "B25:AC33",
  ]) {
    sheet.getRange(range).unmerge();
    sheet.getRange(range).merge();
  }
}

function imageAnchors(slot, imageCount) {
  if (slot === "top-full") {
    return [
      { row: 11, col: 1, widthPx: 360, heightPx: 220 },
      { row: 11, col: 15, widthPx: 360, heightPx: 220 },
      { row: 17, col: 1, widthPx: 360, heightPx: 170 },
      { row: 17, col: 15, widthPx: 360, heightPx: 170 },
    ].slice(0, imageCount);
  }
  const range = typeof slot === "string" ? slot : slot.imageRange;
  if (range === "B12:O20") {
    return [
      { row: 11, col: 1, widthPx: 250, heightPx: 210 },
      { row: 11, col: 8, widthPx: 250, heightPx: 210 },
    ].slice(0, imageCount);
  }
  if (range === "P12:AC20") {
    return [
      { row: 11, col: 15, widthPx: 250, heightPx: 210 },
      { row: 11, col: 22, widthPx: 250, heightPx: 210 },
    ].slice(0, imageCount);
  }
  return [
    { row: 24, col: 1, widthPx: 310, heightPx: 215 },
    { row: 24, col: 10, widthPx: 310, heightPx: 215 },
    { row: 24, col: 19, widthPx: 310, heightPx: 215 },
  ].slice(0, imageCount);
}

function fitWithin(box, ratio) {
  let widthPx = box.widthPx;
  let heightPx = Math.round(widthPx / ratio);
  if (heightPx > box.heightPx) {
    heightPx = box.heightPx;
    widthPx = Math.round(heightPx * ratio);
  }
  return {
    ...box,
    widthPx,
    heightPx,
    colOffsetPx: Math.round((box.widthPx - widthPx) / 2),
    rowOffsetPx: Math.round((box.heightPx - heightPx) / 2),
  };
}

async function fillSteps(sheet, model) {
  const layout = planLayout(model.steps);
  if (layout.pages.length !== 1) {
    throw new Error("单样例超出一页；必须先实现模板分页复制再继续");
  }
  for (const step of layout.pages[0].steps) {
    const slot = step.slot;
    if (slot === "top-full") {
      sheet.getRange("B10:AC11").unmerge();
      sheet.getRange("B10:B11").merge();
      sheet.getRange("C10:AC11").merge();
      sheet.getRange("B10").values = [[step.id]];
      sheet.getRange("C10:AC11").values = [[step.text]];
    } else {
      sheet.getRange(slot.numberCell).values = [[step.id]];
      sheet.getRange(slot.textCell).values = [[step.text]];
    }

    const anchors = imageAnchors(slot, step.images.length);
    for (let index = 0; index < step.images.length; index += 1) {
      const box = anchors[index];
      if (!box) throw new Error(`步骤${step.id}图片数量超过当前槽位容量`);
      const anchor = fitWithin(box, step.images[index].ratio);
      sheet.images.add({
        dataUrl: await dataUrl(step.images[index].path),
        anchor: {
          from: {
            row: anchor.row,
            col: anchor.col,
            rowOffsetPx: anchor.rowOffsetPx,
            colOffsetPx: anchor.colOffsetPx,
          },
          extent: { widthPx: anchor.widthPx, heightPx: anchor.heightPx },
        },
      });
    }
  }

  const controls = model.steps.flatMap((step) => step.controlPoints);
  const quality = model.steps.flatMap((step) => step.qualityRequirements);
  sheet.getRange("B34").values = [[`控制点：${controls.join("；")}`]];
  sheet.getRange("B35").values = [[`质量要求：${quality.join("；")}`]];
}

function buildConflictSheet(workbook, model) {
  const sheet = workbook.worksheets.getOrAdd("冲突审核");
  sheet.getRange("A1:I1").values = [[
    "岗位", "步骤", "冲突类型", "旧版值", "案例值",
    "自动采用值", "风险说明", "最终采用值", "处理指令",
  ]];
  sheet.getRange("A2:I4").values = model.conflicts.map((item) => [
    model.header.jobName,
    "",
    item.type,
    item.oldValue,
    item.caseValue,
    item.adoptedValue,
    item.risk,
    "",
    "",
  ]);
  sheet.getRange("A1:I1").format = {
    fill: "#F4B183",
    font: { bold: true, color: "#000000" },
    wrapText: true,
  };
  sheet.getRange("A1:I4").format.borders = {
    preset: "all",
    style: "thin",
    color: "#808080",
  };
  sheet.getRange("A1:I20").format.columnWidth = 18;
  sheet.getRange("D1:G20").format.columnWidth = 28;
  sheet.getRange("A1:I4").format.wrapText = true;
}

function buildLogSheet(workbook, model) {
  const sheet = workbook.worksheets.getOrAdd("处理日志");
  sheet.getRange("A1:C1").values = [["序号", "处理类型", "说明"]];
  sheet.getRange(`A2:C${model.log.length + 1}`).values = model.log.map((text, index) => [
    index + 1,
    "自动处理",
    text,
  ]);
  sheet.getRange("A1:C1").format = {
    fill: "#BDD7EE",
    font: { bold: true },
  };
  sheet.getRange(`A1:C${model.log.length + 1}`).format.borders = {
    preset: "all",
    style: "thin",
    color: "#808080",
  };
  sheet.getRange("A1:A20").format.columnWidth = 8;
  sheet.getRange("B1:B20").format.columnWidth = 14;
  sheet.getRange("C1:C20").format.columnWidth = 70;
  sheet.getRange("C1:C20").format.wrapText = true;
}

async function main() {
  const source = JSON.parse(await fs.readFile(SOURCE_JSON, "utf8"));
  const model = fromExtractedSource(source);
  const templateBlob = await FileBlob.load(TEMPLATE);
  const workbook = await SpreadsheetFile.importXlsx(templateBlob);
  const sheet = workbook.worksheets.getItem("洗衣机SOP");

  prepareStepArea(sheet);
  fillHeader(sheet, model);
  fillResources(sheet, model);
  await fillSteps(sheet, model);
  buildConflictSheet(workbook, model);
  buildLogSheet(workbook, model);

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  const result = await SpreadsheetFile.exportXlsx(workbook);
  await result.save(OUTPUT);
  console.log(OUTPUT);
}

await main();
```

- [ ] **Step 2: 运行生成器**

Run:

```powershell
Set-Location "E:\AI\SOP\.codex-work\sop-sample"
& "C:\Users\lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "E:\AI\SOP\src\sop_renewal\build_sample.mjs"
```

Expected: 生成 `E:\AI\SOP\outputs\sop-sample-renewal\安装减震器螺栓_新版SOP_样例.xlsx`，不修改三份源工作簿。

## Task 6: 内容和视觉验证

**Files:**

- Modify only if required: `E:\AI\SOP\src\sop_renewal\build_sample.mjs`

- [ ] **Step 1: 使用 artifact-tool 检查关键范围**

在生成器末尾临时加入或通过独立 Node 检查：

```js
const check = await workbook.inspect({
  kind: "table",
  range: "洗衣机SOP!B2:AN36",
  include: "values,formulas",
  tableMaxRows: 36,
  tableMaxCols: 40,
  maxChars: 12000,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "样例公式错误扫描",
});
console.log(errors.ndjson);
```

Expected:

- 岗位名称为“紧固减震器螺栓”。
- 工具为“ETV DS72-30-10电枪”。
- 物料为“减震器螺栓M10*43.5”，数量 2。
- 质量要求包含“20–25 N·m”。
- 无公式错误。

- [ ] **Step 2: 渲染所有工作表进行一次视觉检查**

```js
for (const sheetName of ["洗衣机SOP", "冲突审核", "处理日志"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1.4,
    format: "png",
  });
  await fs.writeFile(
    `${ROOT}/.codex-work/sop-sample/${sheetName}.png`,
    new Uint8Array(await preview.arrayBuffer()),
  );
}
```

Expected:

- SOP 主表无图片拉伸、遮挡或文本截断。
- 同一动作的多张图片在同一区域。
- 固定右侧区域未被覆盖。
- 冲突审核表只有 3 个高风险项。
- 日志简短可读。

- [ ] **Step 3: 使用 Excel 打开最终文件并检查打印效果**

通过 Computer Use 打开最终样例并检查：

- 页面布局为 A3 横向。
- 打印区域包含完整 SOP。
- 页面缩放没有截断作业区或右侧固定区域。
- 步骤编号为 1、2、3，顺序连续。

只在发现明确缺陷时修改 `build_sample.mjs` 并重跑一次；不进行无意义的多轮微调。

- [ ] **Step 4: 完成验收记录**

验收结果应记录：

```text
步骤完整：通过/不通过
图片完整：通过/不通过
关键参数：通过/不通过
动态布局：通过/不通过
固定区域：通过/不通过
打印检查：通过/不通过
高风险冲突数量：3
```

## Task 7: 用户审核和批量阶段门槛

**Files:**

- Final artifact: `E:\AI\SOP\outputs\sop-sample-renewal\安装减震器螺栓_新版SOP_样例.xlsx`

- [ ] **Step 1: 向用户交付单样例**

只交付最终 `.xlsx`，说明：

- 已自动保留旧版关键参数。
- 冲突审核表只保留 3 个高风险项。
- 当前尚未执行批量转换。

- [ ] **Step 2: 收集一次集中反馈**

用户可直接指出：

- 图片归属或顺序错误。
- 文字规范化不合适。
- 某项冲突应采用的最终值。
- 动态布局需要调整的位置。

- [ ] **Step 3: 满足批量扩展条件**

只有以下条件满足后才编写批量处理计划：

- 用户确认样例内容方向。
- 用户确认图片清晰度和布局。
- 用户确认冲突表工作方式。
- 样例关键参数、步骤和图片无遗漏。

本计划不包含批量转换实现。
