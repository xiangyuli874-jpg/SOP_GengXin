import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { fromExtractedSource } from "./sample_rules.mjs";
import { planLayout } from "./layout_planner.mjs";

const ROOT = "E:/AI/SOP";
const TEMPLATE = `${ROOT}/新版洗衣机SOP标准格式.xlsx`;
const SOURCE_JSON = `${ROOT}/.codex-work/sop-sample/sample-source.json`;
const DEFAULT_OUTPUT =
  `${ROOT}/outputs/sop-sample-renewal/安装减震器螺栓_新版SOP_样例.xlsx`;
const PYTHON =
  "C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const PRINT_SETTINGS_SCRIPT =
  `${ROOT}/src/sop_renewal/preserve_print_settings.py`;
const execFileAsync = promisify(execFile);

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

export function fitWithin(box, ratio) {
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

function fillHeader(sheet, model) {
  sheet.getRange("I5").values = [[model.header.productName]];
  sheet.getRange("N5").values = [[model.header.line]];
  sheet.getRange("P5").values = [[model.header.jobName]];
  sheet.getRange("U5").values = [[model.header.jobCode]];
  sheet.getRange("X5").values = [[model.header.people]];
  sheet.getRange("Z5").values = [[model.header.taktTime]];
  sheet.getRange("AB5").values = [[model.header.fileNumber]];
  sheet.getRange("AG5").values = [[model.header.revision]];
  sheet.getRange("AG5:AH5").format.numberFormat = "0";
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
  for (const cell of [
    "B10",
    "C10",
    "I10",
    "J10",
    "P10",
    "Q10",
    "W10",
    "X10",
    "B23",
    "C23",
    "I23",
    "J23",
    "P23",
    "Q23",
    "W23",
    "X23",
    "I21",
    "I22",
    "W21",
    "W22",
    "I34",
    "I35",
  ]) {
    sheet.getRange(cell).clear({ applyTo: "contents" });
  }

  for (const range of [
    "C10:H11",
    "I10:I11",
    "J10:O11",
    "Q10:V11",
    "W10:W11",
    "X10:AC11",
    "B12:H20",
    "I12:O20",
    "P12:V20",
    "W12:AC20",
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
  ]) {
    sheet.getRange(range).unmerge();
  }

  for (const range of [
    "C10:O11",
    "Q10:AC11",
    "B12:O20",
    "P12:AC20",
    "C23:AC24",
    "B25:AC33",
  ]) {
    sheet.getRange(range).merge();
  }
}

function imageBoxes(slot, imageCount) {
  if (slot === "top-full") {
    return [
      { row: 11, col: 2, widthPx: 330, heightPx: 215 },
      { row: 11, col: 15, widthPx: 330, heightPx: 215 },
      { row: 17, col: 2, widthPx: 330, heightPx: 165 },
      { row: 17, col: 15, widthPx: 330, heightPx: 165 },
    ].slice(0, imageCount);
  }
  if (slot.imageRange === "B12:O20") {
    return [
      { row: 11, col: 1, widthPx: 245, heightPx: 205 },
      { row: 11, col: 8, widthPx: 245, heightPx: 205 },
    ].slice(0, imageCount);
  }
  if (slot.imageRange === "P12:AC20") {
    return [
      { row: 11, col: 15, widthPx: 245, heightPx: 205 },
      { row: 11, col: 22, widthPx: 245, heightPx: 205 },
    ].slice(0, imageCount);
  }
  return [
    { row: 24, col: 4, widthPx: 650, heightPx: 210 },
    { row: 24, col: 1, widthPx: 310, heightPx: 210 },
    { row: 24, col: 10, widthPx: 310, heightPx: 210 },
    { row: 24, col: 19, widthPx: 310, heightPx: 210 },
  ].slice(imageCount === 1 ? 0 : 1, imageCount === 1 ? 1 : imageCount + 1);
}

function fillStepControlAreas(sheet, steps) {
  const [first, second, third] = steps;
  sheet.getRange("B21").values = [["控制点："]];
  sheet.getRange("B22").values = [["质量要求："]];
  sheet.getRange("P21").values = [["控制点："]];
  sheet.getRange("P22").values = [["质量要求："]];
  sheet.getRange("B34").values = [["控制点："]];
  sheet.getRange("B35").values = [["质量要求："]];

  if (first) {
    sheet.getRange("I21").values = [[first.controlPoints.join("；")]];
    sheet.getRange("I22").values = [[first.qualityRequirements.join("；")]];
  }
  if (second) {
    sheet.getRange("W21").values = [[second.controlPoints.join("；")]];
    sheet.getRange("W22").values = [[second.qualityRequirements.join("；")]];
  }
  if (third) {
    sheet.getRange("I34").values = [[third.controlPoints.join("；")]];
    sheet.getRange("I35").values = [[third.qualityRequirements.join("；")]];
  }
}

function applyInspectionBorder(sheet, step) {
  const ranges = {
    1: "B10:O22",
    2: "P10:AC22",
    3: "B23:AC35",
  };
  const colors = {
    self: "#FF0000",
    mutual: "#00B0F0",
  };
  const range = ranges[step.id];
  const color = colors[step.inspectionType];
  if (!range || !color) return;
  sheet.getRange(range).format.borders = {
    preset: "outside",
    style: "medium",
    color,
  };
}

async function fillSteps(sheet, model) {
  const layout = planLayout(model.steps);
  if (layout.pages.length !== 1) {
    throw new Error("单样例超出一页；必须先实现模板分页复制再继续");
  }

  const steps = layout.pages[0].steps;
  for (const step of steps) {
    const slot = step.slot;
    if (slot === "top-full") {
      sheet.getRange("B10:B11").merge();
      sheet.getRange("C10:AC11").merge();
      sheet.getRange("B10").values = [[step.id]];
      sheet.getRange("C10").values = [[step.text]];
    } else {
      sheet.getRange(slot.numberCell).values = [[step.id]];
      sheet.getRange(slot.textCell).values = [[step.text]];
    }

    const boxes = imageBoxes(slot, step.images.length);
    for (let index = 0; index < step.images.length; index += 1) {
      const box = boxes[index];
      if (!box) {
        throw new Error(`步骤${step.id}图片数量超过当前槽位容量`);
      }
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
    applyInspectionBorder(sheet, step);
  }
  fillStepControlAreas(sheet, steps);
}

function buildConflictSheet(workbook, model) {
  const sheet = workbook.worksheets.getOrAdd("冲突审核");
  sheet.getRange("A1:I1").values = [[
    "岗位",
    "步骤",
    "冲突类型",
    "旧版值",
    "案例值",
    "自动采用值",
    "风险说明",
    "最终采用值",
    "处理指令",
  ]];
  sheet.getRange(`A2:I${model.conflicts.length + 1}`).values =
    model.conflicts.map((item) => [
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
  sheet.getRange(`A1:I${model.conflicts.length + 1}`).format.borders = {
    preset: "all",
    style: "thin",
    color: "#808080",
  };
  sheet.getRange("A1:I20").format.columnWidth = 18;
  sheet.getRange("D1:G20").format.columnWidth = 28;
  sheet.getRange(`A1:I${model.conflicts.length + 1}`).format.wrapText = true;
}

function buildLogSheet(workbook, model) {
  const sheet = workbook.worksheets.getOrAdd("处理日志");
  sheet.getRange("A1:C1").values = [["序号", "处理类型", "说明"]];
  sheet.getRange(`A2:C${model.log.length + 1}`).values =
    model.log.map((text, index) => [index + 1, "自动处理", text]);
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

export async function buildSample({
  outputPath = DEFAULT_OUTPUT,
  templatePath = TEMPLATE,
  sourceJsonPath = SOURCE_JSON,
} = {}) {
  const source = JSON.parse(await fs.readFile(sourceJsonPath, "utf8"));
  const model = fromExtractedSource(source);
  const workbook = await SpreadsheetFile.importXlsx(
    await FileBlob.load(templatePath),
  );
  const sheet = workbook.worksheets.getItem("洗衣机SOP");

  prepareStepArea(sheet);
  fillHeader(sheet, model);
  fillResources(sheet, model);
  await fillSteps(sheet, model);
  buildConflictSheet(workbook, model);
  buildLogSheet(workbook, model);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const rawOutputPath =
    `${ROOT}/.codex-work/sop-sample/artifact-export-${path.basename(outputPath)}`;
  const result = await SpreadsheetFile.exportXlsx(workbook);
  await result.save(rawOutputPath);
  await execFileAsync(PYTHON, [
    PRINT_SETTINGS_SCRIPT,
    "--template",
    templatePath,
    "--input",
    rawOutputPath,
    "--output",
    outputPath,
    "--checkmarks",
    Object.entries(model.tags)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(","),
  ]);
  return { outputPath, workbook, model };
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { outputPath } = await buildSample();
  console.log(outputPath);
}
