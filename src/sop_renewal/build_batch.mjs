import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { buildBatchModel } from "./batch_rules.mjs";
import { planLayout } from "./layout_planner.mjs";

const ROOT = "E:/AI/SOP";
const INPUT = `${ROOT}/普通8kg及以下产品前总装SOP.xlsx`;
const TEMPLATE =
  "E:/A_IE_xiangyu/（A）工艺文件/SOP换新格式/新版洗衣机SOP标准格式.xlsx";
const CHECKMARK_TEMPLATE =
  `${ROOT}/outputs/sop-sample-renewal/安装减震器螺栓_新版SOP_样例.xlsx`;
const WORK = `${ROOT}/.codex-work/sop-batch`;
const SOURCE_JSON = `${WORK}/source.json`;
const KEY_POST_LIST =
  "E:/A_IE_xiangyu/（A）工艺文件/SOP换新格式/滚筒关键岗位清单.xlsx";
const PAGE_SPEC = `${WORK}/page-spec.json`;
const BASE_WORKBOOK = `${WORK}/batch-base.xlsx`;
const RAW_OUTPUT = `${WORK}/batch-artifact-export.xlsx`;
const OUTPUT =
  `${ROOT}/outputs/普通8kg及以下产品前总装SOP_新版_修正版.xlsx`;
const PYTHON =
  "C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const execFileAsync = promisify(execFile);
const PROCESS_NAME = "前总装";
const VISUAL_INSPECTION_JOBS = new Set([
  "箱体外观检查",
  "箱体扫码上线",
  "插接线孔",
  "卡装C面扎带扣",
  "安装排水管",
  "紧固排水管",
  "紧固前门上卡扣",
  "紧固前门下卡扣",
  "安装电源线",
  "紧固电源线",
  "吊筒",
  "装筒",
]);

function mimeType(filePath) {
  const suffix = path.extname(filePath).toLowerCase();
  if (suffix === ".png") return "image/png";
  if (suffix === ".jpg" || suffix === ".jpeg") return "image/jpeg";
  if (suffix === ".bmp") return "image/bmp";
  throw new Error(`不支持的图片格式：${suffix}`);
}

async function dataUrl(filePath) {
  const bytes = await fs.readFile(filePath);
  return `data:${mimeType(filePath)};base64,${bytes.toString("base64")}`;
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

function pageName(sourceSheet, pageIndex, pageCount) {
  if (pageCount === 1) return sourceSheet.slice(0, 31);
  const suffix = `-${pageIndex + 1}`;
  return `${sourceSheet.slice(0, 31 - suffix.length)}${suffix}`;
}

function makePageSpecs(models) {
  const pages = [];
  for (const model of models) {
    const layout = planLayout(model.steps);
    layout.pages.forEach((page, index) => {
      pages.push({
        name: pageName(model.sourceSheet, index, layout.pages.length),
        sourceSheet: model.sourceSheet,
        sourceIndex: model.sourceIndex,
        tags: model.tags,
        model,
        steps: page.steps,
        pageIndex: index + 1,
        pageCount: layout.pages.length,
      });
    });
  }
  return pages;
}

function fillHeader(sheet, model) {
  const header = model.header;
  sheet.getRange("I5").values = [[header.productName]];
  sheet.getRange("N5").values = [[header.line]];
  sheet.getRange("P5").values = [[header.jobName]];
  sheet.getRange("U5").values = [[header.jobCode]];
  sheet.getRange("X5").values = [[header.people]];
  sheet.getRange("Z5").values = [[header.taktTime]];
  sheet.getRange("AB5").values = [[header.fileNumber]];
  sheet.getRange("AG5").values = [[header.revision]];
  sheet.getRange("AG5:AH5").format.numberFormat = "0";
  if (header.effectiveDateSerial) {
    sheet.getRange("AL4").values = [[header.effectiveDateSerial]];
    sheet.getRange("AL5").values = [[header.effectiveDateSerial]];
  }
  sheet.getRange("AL4:AN5").format.numberFormat = "yyyy-mm-dd";
  sheet.getRange("I5:AN5").format.font = {
    name: "微软雅黑",
    bold: true,
    size: 12,
  };
}

function fillResources(sheet, model) {
  sheet.getRange("AE11:AN17").clear({ applyTo: "contents" });
  sheet.getRange("AE20:AN25").clear({ applyTo: "contents" });
  model.tools.slice(0, 6).forEach((item, index) => {
    const row = 11 + index;
    sheet.getRange(`AE${row}`).values = [[index + 1]];
    sheet.getRange(`AF${row}`).values = [[item.name]];
    sheet.getRange(`AI${row}`).values = [[item.qty]];
    sheet.getRange(`AJ${row}`).values = [[item.setting]];
  });
  sheet.getRange("AE11:AN17").format.font = {
    name: "微软雅黑",
    size: 11,
  };
  model.materials.slice(0, 6).forEach((item, index) => {
    const row = 20 + index;
    sheet.getRange(`AE${row}`).values = [[index + 1]];
    sheet.getRange(`AF${row}`).values = [[item.name]];
    sheet.getRange(`AM${row}`).values = [[item.qty]];
  });
  sheet.getRange("AE20:AN25").format.font = {
    name: "微软雅黑",
    size: 10,
  };
}

const SLOT_CONFIG = {
  top1: {
    number: "B10:B11",
    text: "C10:H11",
    image: "B12:H20",
    control: "B21:H21",
    quality: "B22:H22",
    outer: "B10:H22",
    imageBox: { row: 11, col: 1, widthPx: 155, heightPx: 205 },
  },
  top2: {
    number: "I10:I11",
    text: "J10:O11",
    image: "I12:O20",
    control: "I21:O21",
    quality: "I22:O22",
    outer: "I10:O22",
    imageBox: { row: 11, col: 8, widthPx: 155, heightPx: 205 },
  },
  top3: {
    number: "P10:P11",
    text: "Q10:V11",
    image: "P12:V20",
    control: "P21:V21",
    quality: "P22:V22",
    outer: "P10:V22",
    imageBox: { row: 11, col: 15, widthPx: 155, heightPx: 205 },
  },
  top4: {
    number: "W10:W11",
    text: "X10:AC11",
    image: "W12:AC20",
    control: "W21:AC21",
    quality: "W22:AC22",
    outer: "W10:AC22",
    imageBox: { row: 11, col: 22, widthPx: 155, heightPx: 205 },
  },
  bottom5: {
    number: "B23:B24",
    text: "C23:H24",
    image: "B25:H33",
    control: "B34:H34",
    quality: "B35:H35",
    outer: "B23:H35",
    imageBox: { row: 24, col: 1, widthPx: 155, heightPx: 205 },
  },
  bottom6: {
    number: "I23:I24",
    text: "J23:O24",
    image: "I25:O33",
    control: "I34:O34",
    quality: "I35:O35",
    outer: "I23:O35",
    imageBox: { row: 24, col: 8, widthPx: 155, heightPx: 205 },
  },
  bottom7: {
    number: "P23:P24",
    text: "Q23:V24",
    image: "P25:V33",
    control: "P34:V34",
    quality: "P35:V35",
    outer: "P23:V35",
    imageBox: { row: 24, col: 15, widthPx: 155, heightPx: 205 },
  },
  bottom8: {
    number: "W23:W24",
    text: "X23:AC24",
    image: "W25:AC33",
    control: "W34:AC34",
    quality: "W35:AC35",
    outer: "W23:AC35",
    imageBox: { row: 24, col: 22, widthPx: 155, heightPx: 205 },
  },
  top12: {
    number: "B10:B11",
    text: "C10:O11",
    image: "B12:O20",
    control: "B21:O21",
    quality: "B22:O22",
    outer: "B10:O22",
    imageBox: { row: 11, col: 1, widthPx: 320, heightPx: 205 },
  },
  top34: {
    number: "P10:P11",
    text: "Q10:AC11",
    image: "P12:AC20",
    control: "P21:AC21",
    quality: "P22:AC22",
    outer: "P10:AC22",
    imageBox: { row: 11, col: 15, widthPx: 320, heightPx: 205 },
  },
  bottom56: {
    number: "B23:B24",
    text: "C23:O24",
    image: "B25:O33",
    control: "B34:O34",
    quality: "B35:O35",
    outer: "B23:O35",
    imageBox: { row: 24, col: 1, widthPx: 320, heightPx: 205 },
  },
  bottom78: {
    number: "P23:P24",
    text: "Q23:AC24",
    image: "P25:AC33",
    control: "P34:AC34",
    quality: "P35:AC35",
    outer: "P23:AC35",
    imageBox: { row: 24, col: 15, widthPx: 320, heightPx: 205 },
  },
};

function slotKey(step) {
  return step.slot.key;
}

function prepareStepArea(sheet) {
  sheet.getRange("B10:AC35").unmerge();
  sheet.getRange("B10:AC35").clear({ applyTo: "contents" });
  restoreBlankStepGrid(sheet);
}

function mergeAndStyleSlot(sheet, config) {
  sheet.getRange(config.outer).unmerge();
  sheet.getRange(config.outer).clear({ applyTo: "contents" });
  for (const range of [
    config.number,
    config.text,
    config.image,
    config.control,
    config.quality,
  ]) {
    sheet.getRange(range).merge();
  }
  sheet.getRange(config.outer).format.fill = "#FFFFFF";
  sheet.getRange(config.outer).format.borders = {
    preset: "all",
    style: "dotted",
    color: "#000000",
  };
  sheet.getRange(config.text).format.wrapText = true;
  sheet.getRange(config.control).format.wrapText = true;
  sheet.getRange(config.quality).format.wrapText = true;
  sheet.getRange(config.number).format.font = {
    name: "微软雅黑",
    bold: true,
    size: 14,
  };
  sheet.getRange(config.text).format.font = {
    name: "微软雅黑",
    size: 11,
  };
  sheet.getRange(config.control).format.font = {
    name: "微软雅黑",
    color: "#FF0000",
    bold: false,
    size: 11,
  };
  sheet.getRange(config.quality).format.font = {
    name: "微软雅黑",
    color: "#FF0000",
    bold: false,
    size: 11,
  };
}

function boxesFor(config, count) {
  if (!count) return [];
  const { row, col, widthPx, heightPx } = config.imageBox;
  if (config.imageBox.widthPx <= 160) {
    return [
      { row, col, widthPx, heightPx },
    ].slice(0, count);
  }
  if (count === 1) {
    return [{ row, col, widthPx, heightPx }];
  }
  if (count === 2) {
    return [
      { row, col, widthPx: 155, heightPx },
      { row, col: col + 7, widthPx: 155, heightPx },
    ];
  }
  if (count === 3) {
    return [
      { row, col, widthPx: 102, heightPx },
      { row, col: col + 5, widthPx: 102, heightPx },
      { row, col: col + 10, widthPx: 102, heightPx },
    ];
  }
  return [
    { row, col, widthPx: 155, heightPx: 100 },
    { row, col: col + 7, widthPx: 155, heightPx: 100 },
    { row: row + 4, col, widthPx: 155, heightPx: 100 },
    { row: row + 4, col: col + 7, widthPx: 155, heightPx: 100 },
  ].slice(0, count);
}

function applyInspectionBorder(sheet, config, type) {
  const color = type === "self"
    ? "#FF0000"
    : type === "mutual"
      ? "#00B0F0"
      : null;
  if (!color) return;
  sheet.getRange(config.outer).format.borders = {
    preset: "outside",
    style: "medium",
    color,
  };
}

function adjustRequirementRowHeight(sheet, range, textLength) {
  if (textLength > 80) {
    sheet.getRange(range).format.rowHeight = 36;
  } else if (textLength > 40) {
    sheet.getRange(range).format.rowHeight = 27;
  }
}

async function fillPage(sheet, page) {
  sheet.deleteAllDrawings();
  prepareStepArea(sheet);
  fillHeader(sheet, page.model);
  fillResources(sheet, page.model);

  for (const step of page.steps) {
    const key = slotKey(step);
    const config = SLOT_CONFIG[key];
    mergeAndStyleSlot(sheet, config);
    sheet.getRange(config.number).values = [[step.id]];
    sheet.getRange(config.number).format.font = {
      name: "微软雅黑",
      bold: true,
      size: 14,
    };
    sheet.getRange(config.text).values = [[step.text]];
    sheet.getRange(config.text).format.font = {
      name: "微软雅黑",
      size: step.text.length > 150 ? 10 : 11,
    };
    sheet.getRange(config.control).values = [[
      `控制点：${step.controlPoints.join("；")}`,
    ]];
    sheet.getRange(config.quality).values = [[
      `质量要求：${step.qualityRequirements.join("；")}`,
    ]];
    adjustRequirementRowHeight(
      sheet,
      config.control,
      step.controlPoints.join("；").length,
    );
    adjustRequirementRowHeight(
      sheet,
      config.quality,
      step.qualityRequirements.join("；").length,
    );

    const boxes = boxesFor(config, step.images.length);
    for (let index = 0; index < step.images.length; index += 1) {
      const box = boxes[index];
      if (!box) {
        throw new Error(
          `${page.name} 步骤${step.id}图片数量超出当前版面容量`,
        );
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
          extent: {
            widthPx: anchor.widthPx,
            heightPx: anchor.heightPx,
          },
        },
      });
    }
    applyInspectionBorder(sheet, config, step.inspectionType);
  }
}

function restoreBlankStepGrid(sheet) {
  const ranges = [
    "B10:B11",
    "C10:H11",
    "I10:I11",
    "J10:O11",
    "P10:P11",
    "Q10:V11",
    "W10:W11",
    "X10:AC11",
    "B12:H20",
    "I12:O20",
    "P12:V20",
    "W12:AC20",
    "B21:H21",
    "I21:O21",
    "P21:V21",
    "W21:AC21",
    "B22:H22",
    "I22:O22",
    "P22:V22",
    "W22:AC22",
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
    "B34:H34",
    "I34:O34",
    "P34:V34",
    "W34:AC34",
    "B35:H35",
    "I35:O35",
    "P35:V35",
    "W35:AC35",
  ];
  for (const range of ranges) {
    sheet.getRange(range).merge();
  }
  sheet.getRange("B10:AC35").format = {
    fill: "#FFFFFF",
    borders: {
      preset: "all",
      style: "dotted",
      color: "#000000",
    },
  };
  for (const cell of ["B21", "I21", "P21", "W21", "B34", "I34", "P34", "W34"]) {
    sheet.getRange(cell).values = [["控制点："]];
  }
  for (const cell of ["B22", "I22", "P22", "W22", "B35", "I35", "P35", "W35"]) {
    sheet.getRange(cell).values = [["质量要求："]];
  }
  sheet.getRange("B10:AC35").format.font = {
    name: "微软雅黑",
    size: 11,
  };
  sheet.getRange("B10:B11").format.font = { name: "微软雅黑", bold: true, size: 14 };
  sheet.getRange("I10:I11").format.font = { name: "微软雅黑", bold: true, size: 14 };
  sheet.getRange("P10:P11").format.font = { name: "微软雅黑", bold: true, size: 14 };
  sheet.getRange("W10:W11").format.font = { name: "微软雅黑", bold: true, size: 14 };
  sheet.getRange("B23:B24").format.font = { name: "微软雅黑", bold: true, size: 14 };
  sheet.getRange("I23:I24").format.font = { name: "微软雅黑", bold: true, size: 14 };
  sheet.getRange("P23:P24").format.font = { name: "微软雅黑", bold: true, size: 14 };
  sheet.getRange("W23:W24").format.font = { name: "微软雅黑", bold: true, size: 14 };
  sheet.getRange("B21:AC22").format.font = {
    name: "微软雅黑",
    color: "#FF0000",
    size: 11,
  };
  sheet.getRange("B34:AC35").format.font = {
    name: "微软雅黑",
    color: "#FF0000",
    size: 11,
  };
}

async function readCriticalJobs() {
  const workbook = await SpreadsheetFile.importXlsx(
    await FileBlob.load(KEY_POST_LIST),
  );
  const values = workbook.worksheets
    .getItem("滚筒关键岗位清单")
    .getRange("A1:F18").values;
  const jobs = new Set();
  let process = "";
  for (const row of values.slice(2)) {
    if (row[1]) process = String(row[1]).trim();
    if (process === PROCESS_NAME && row[2]) {
      jobs.add(String(row[2]).trim());
    }
  }
  return jobs;
}

function buildConflictSheet(workbook, models) {
  const sheet = workbook.worksheets.getOrAdd("冲突审核");
  sheet.getRange("A1:I500").clear({ applyTo: "all" });
  const conflicts = models.flatMap((model) => model.conflicts);
  sheet.getRange("A1:I1").values = [[
    "岗位页",
    "步骤",
    "冲突类型",
    "页内/旧版值",
    "页签/参考值",
    "自动采用值",
    "处理说明",
    "最终采用值",
    "后续指令",
  ]];
  if (conflicts.length) {
    sheet.getRange(`A2:I${conflicts.length + 1}`).values =
      conflicts.map((item) => [
        item.sheet,
        item.step,
        item.type,
        item.oldValue,
        item.referenceValue,
        item.adoptedValue,
        item.reason,
        "",
        "",
      ]);
  }
  sheet.getRange("A1:I1").format = {
    fill: "#F4B183",
    font: { bold: true },
    wrapText: true,
  };
  sheet.getRange(`A1:I${Math.max(conflicts.length + 1, 2)}`).format.borders = {
    preset: "all",
    style: "thin",
    color: "#808080",
  };
  sheet.getRange("A1:I500").format.wrapText = true;
  sheet.getRange("A1:C500").format.columnWidth = 18;
  sheet.getRange("D1:I500").format.columnWidth = 28;
}

function buildLogSheet(workbook, models, pages) {
  const sheet = workbook.worksheets.getOrAdd("处理日志");
  sheet.getRange("A1:E1000").clear({ applyTo: "all" });
  const rows = [];
  for (const model of models) {
    model.log.forEach((text) => {
      rows.push([
        rows.length + 1,
        model.sourceSheet,
        "自动处理",
        text,
        "完成",
      ]);
    });
    rows.push([
      rows.length + 1,
      model.sourceSheet,
      "版面结果",
      `提取${model.steps.length}个步骤、${model.steps.reduce((sum, step) => sum + step.images.length, 0)}张操作图片，生成${pages.filter((page) => page.sourceSheet === model.sourceSheet).length}个新版页。`,
      "完成",
    ]);
  }
  sheet.getRange("A1:E1").values = [[
    "序号", "岗位页", "处理类型", "说明", "状态",
  ]];
  sheet.getRange(`A2:E${rows.length + 1}`).values = rows;
  sheet.getRange("A1:E1").format = {
    fill: "#BDD7EE",
    font: { bold: true },
  };
  sheet.getRange(`A1:E${rows.length + 1}`).format.borders = {
    preset: "all",
    style: "thin",
    color: "#808080",
  };
  sheet.getRange("A1:E1000").format.wrapText = true;
  sheet.getRange("A1:A1000").format.columnWidth = 8;
  sheet.getRange("B1:B1000").format.columnWidth = 26;
  sheet.getRange("C1:C1000").format.columnWidth = 14;
  sheet.getRange("D1:D1000").format.columnWidth = 70;
  sheet.getRange("E1:E1000").format.columnWidth = 10;
}

export async function buildBatch() {
  await fs.mkdir(WORK, { recursive: true });
  await execFileAsync(PYTHON, [
    `${ROOT}/src/sop_renewal/analyze_batch.py`,
    "--input", INPUT,
    "--output", SOURCE_JSON,
    "--image-dir", `${WORK}/images`,
  ]);
  const extracted = JSON.parse(await fs.readFile(SOURCE_JSON, "utf8"));
  const criticalJobs = await readCriticalJobs();
  const models = extracted.map((source) =>
    buildBatchModel(source, {
      processName: PROCESS_NAME,
      criticalJobs,
      visualInspectionJobs: VISUAL_INSPECTION_JOBS,
    })
  );
  for (const model of models) {
    model.log.push(
      `关键岗位依据《滚筒关键岗位清单》中的“${PROCESS_NAME}”工序判定：`
      + `${model.tags.keyPost ? "已勾选" : "未勾选"}。`,
    );
    model.log.push(
      `外观检查依据岗位是否可能损伤箱体、前门板等外观面判定：`
      + `${model.tags.visualInspection ? "已勾选" : "未勾选"}。`,
    );
  }
  const pages = makePageSpecs(models);
  await fs.writeFile(
    PAGE_SPEC,
    JSON.stringify(
      pages.map((page) => ({ name: page.name, tags: page.tags })),
      null,
      2,
    ),
    "utf8",
  );
  await execFileAsync(PYTHON, [
    `${ROOT}/src/sop_renewal/clone_template_pages.py`,
    "--template", TEMPLATE,
    "--page-spec", PAGE_SPEC,
    "--output", BASE_WORKBOOK,
  ]);

  const workbook = await SpreadsheetFile.importXlsx(
    await FileBlob.load(BASE_WORKBOOK),
  );
  for (const page of pages) {
    await fillPage(workbook.worksheets.getItem(page.name), page);
  }
  buildConflictSheet(workbook, models);
  buildLogSheet(workbook, models, pages);

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  const exported = await SpreadsheetFile.exportXlsx(workbook);
  await exported.save(RAW_OUTPUT);
  await execFileAsync(PYTHON, [
    `${ROOT}/src/sop_renewal/preserve_batch.py`,
    "--template", TEMPLATE,
    "--input", RAW_OUTPUT,
    "--output", OUTPUT,
    "--page-spec", PAGE_SPEC,
    "--checkmark-template", CHECKMARK_TEMPLATE,
  ]);
  return { outputPath: OUTPUT, models, pages };
}

const result = await buildBatch();
console.log(JSON.stringify({
  outputPath: result.outputPath,
  jobs: result.models.length,
  pages: result.pages.length,
  steps: result.models.reduce((sum, model) => sum + model.steps.length, 0),
  images: result.models.reduce(
    (sum, model) =>
      sum + model.steps.reduce((inner, step) => inner + step.images.length, 0),
    0,
  ),
  conflicts: result.models.reduce(
    (sum, model) => sum + model.conflicts.length,
    0,
  ),
}, null, 2));
