const ACTION_MARKERS = /(?:自检要求|互检要求|要求)\s*[：:]/;

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r?\n|\t/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*[NＮ][.·。]?\s*[mＭ]/gi, "$1–$2 N·m")
    .replace(/([；。])\1+/g, "$1")
    .trim();
}

function isMarker(text) {
  const value = normalizeText(text);
  return (
    !value
    || /^[①②③④⑤⑥⑦⑧⑨⑩\d.、\s]+$/.test(value)
    || /^[LN]\d$/i.test(value)
    || value === "借用照片"
  );
}

function splitActionAndRequirement(text) {
  const normalized = normalizeText(text);
  const match = ACTION_MARKERS.exec(normalized);
  if (!match) return { action: normalized, embeddedRequirement: "" };
  return {
    action: normalized.slice(0, match.index).trim(),
    embeddedRequirement: normalized.slice(match.index + match[0].length).trim(),
  };
}

function operationImages(rawImages) {
  return rawImages
    .filter((image) => image.row > 0 && image.row <= 22 && image.col < 31)
    .sort((a, b) => a.col - b.col || a.row - b.row)
    .map((image) => ({
      ...image,
      ratio: image.width / image.height,
    }));
}

function textGroups(rawTextBoxes) {
  const boxes = rawTextBoxes
    .map((box) => ({ ...box, text: normalizeText(box.text) }))
    .filter((box) => !isMarker(box.text));
  const main = boxes
    .filter((box) => box.row >= 15 && box.text.length >= 12)
    .sort((a, b) => a.col - b.col || a.row - b.row);
  const notes = boxes.filter((box) => !main.includes(box));
  return { main, notes };
}

function nearestIndex(items, target, weightRow = 0.12) {
  if (!items.length) return -1;
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  items.forEach((item, index) => {
    const score =
      Math.abs(item.col - target.col)
      + Math.abs(item.row - target.row) * weightRow;
    if (score < bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestIndex;
}

function keywordScore(textA, textB) {
  const a = normalizeText(textA);
  const b = normalizeText(textB);
  const nouns = [
    "箱体", "条码", "导线", "扎带", "排水泵", "排水管", "卡扣",
    "螺钉", "电源线", "滤波器", "变频器", "吊簧", "黄油", "端子",
    "卡爪", "支架", "力矩", "型号",
  ];
  return nouns.reduce(
    (score, noun) => score + (a.includes(noun) && b.includes(noun) ? 2 : 0),
    0,
  );
}

function assignRequirements(steps, requirements, field) {
  for (const requirement of requirements.filter(Boolean)) {
    let index = 0;
    let score = -1;
    steps.forEach((step, candidateIndex) => {
      const candidateScore = keywordScore(step.text, requirement);
      if (candidateScore > score) {
        score = candidateScore;
        index = candidateIndex;
      }
    });
    steps[index][field].push(normalizeText(requirement));
  }
}

function inferInspection(text, checks) {
  const combined = `${text} ${checks.join(" ")}`;
  if (/自检|反拔/.test(combined)) return "self";
  if (/互检/.test(combined)) return "mutual";
  if (/检查|确认/.test(text) && checks.length) return "mutual";
  return null;
}

function inferVisualInspection(jobName, allText, options) {
  if (options.visualInspectionJobs) {
    return options.visualInspectionJobs.has(jobName);
  }
  return (
    /箱体外观|箱体扫码|插接线孔|C面扎带|安装排水管|紧固排水管|前门|安装电源线|紧固电源线|吊筒|装筒/.test(
      `${jobName} ${allText}`,
    )
    || /防止.*(?:箱体|前门板).*划伤|避免.*碰撞箱体/.test(allText)
  );
}

function inferTags(source, steps, allText, jobName, options) {
  return {
    keyPost: options.criticalJobs
      ? options.criticalJobs.has(jobName)
      : false,
    esdProtection: /静电|防静电|ESD/i.test(allText),
    visualInspection: inferVisualInspection(jobName, allText, options),
    operationBottleneck:
      /吊装|移栽|配合|吊筒|装筒/.test(`${source.source_sheet} ${allText}`)
      || steps.length >= 4,
  };
}

function tabIdentity(sheetName) {
  const match = /^([A-Za-z]+-[A-Za-z]+\d+)(.*)$/.exec(sheetName);
  return match
    ? { code: match[1], jobName: match[2] }
    : { code: "", jobName: sheetName };
}

export function buildBatchModel(source, options = {}) {
  const cells = source.raw_cells ?? {};
  const identity = tabIdentity(source.source_sheet);
  const conflicts = [];
  const adoptedJobName =
    identity.jobName && cells.I3 && identity.jobName !== cells.I3
      ? identity.jobName
      : (cells.I3 || identity.jobName);
  if (identity.jobName && cells.I3 && identity.jobName !== cells.I3) {
    conflicts.push({
      sheet: source.source_sheet,
      step: "",
      type: "岗位名称不一致",
      oldValue: cells.I3,
      referenceValue: identity.jobName,
      adoptedValue: adoptedJobName,
      reason: "页签名称与页内岗位名称不一致，按实际作业内容与页签名称采用页签岗位名。",
    });
  }
  if (identity.code && cells.Q3 && identity.code !== cells.Q3) {
    conflicts.push({
      sheet: source.source_sheet,
      step: "",
      type: "岗位编号不一致",
      oldValue: cells.Q3,
      referenceValue: identity.code,
      adoptedValue: cells.Q3,
      reason: "页内正式岗位编号优先，保留页签差异供追溯。",
    });
  }

  const { main, notes } = textGroups(source.raw_text_boxes ?? []);
  const images = operationImages(source.raw_images ?? []);
  const fallbackMain = main.length
    ? main
    : [{ row: 18, col: 0, text: adoptedJobName || source.source_sheet }];
  const steps = fallbackMain.map((box, index) => {
    const { action, embeddedRequirement } = splitActionAndRequirement(box.text);
    return {
      id: index + 1,
      text: action || box.text,
      sourceText: box.text,
      sourceAnchor: { row: box.row, col: box.col },
      images: [],
      controlPoints: [],
      qualityRequirements: embeddedRequirement
        ? [embeddedRequirement]
        : [],
      inspectionType: null,
    };
  });

  for (const image of images) {
    const index = nearestIndex(fallbackMain, image);
    steps[Math.max(index, 0)].images.push(image);
  }
  for (const note of notes) {
    const index = nearestIndex(fallbackMain, note);
    const target = steps[Math.max(index, 0)];
    if (!target.text.includes(note.text)) {
      target.controlPoints.push(note.text);
    }
  }

  const requirements = ["AE14", "AE15", "AE16", "AE17"]
    .map((address) => cells[address])
    .filter(Boolean);
  const checks = ["AE20", "AE21"]
    .map((address) => cells[address])
    .filter(Boolean);
  assignRequirements(steps, requirements, "qualityRequirements");
  assignRequirements(steps, checks, "controlPoints");

  steps.forEach((step) => {
    step.controlPoints = [...new Set(step.controlPoints.map(normalizeText))];
    step.qualityRequirements = [
      ...new Set(step.qualityRequirements.map(normalizeText)),
    ];
    step.inspectionType = inferInspection(
      `${step.text} ${step.qualityRequirements.join(" ")}`,
      step.controlPoints,
    );
    if (!step.images.length) {
      conflicts.push({
        sheet: source.source_sheet,
        step: step.id,
        type: "步骤无对应图片",
        oldValue: step.sourceText,
        referenceValue: "",
        adoptedValue: "保留文字步骤",
        reason: "旧版未提供可可靠匹配的操作图片，未虚构或重复使用其他图片。",
      });
    }
  });

  const allText = [
    source.source_sheet,
    ...Object.values(cells),
    ...fallbackMain.map((item) => item.text),
  ].join(" ");
  const torque = normalizeText(
    requirements.find((value) => /力矩|N[.·]?m/i.test(value)) ?? "",
  );
  const log = [
    "按旧版页签、页内字段、文字框和图片锚点提取。",
    "同一文字框视为一个完整动作，多张相邻图片保持在同一步骤。",
    "标点、空格及力矩单位已规范化，型号、数量和参数数值未改变。",
  ];
  if (!cells.AE3) log.push("旧版未填写物料栏，新版物料明细保持空白。");
  if (!cells.AE10) log.push("旧版未填写工具栏，新版工具要求保持空白。");

  return {
    sourceSheet: source.source_sheet,
    sourceIndex: source.source_index,
    tags: inferTags(source, steps, allText, adoptedJobName, options),
    header: {
      productName: cells.Q2 || "",
      line: "A",
      jobName: adoptedJobName,
      jobCode: cells.Q3 || identity.code,
      people: cells.Z3 || "",
      taktTime: cells.Z2 || "",
      fileNumber: cells.Q1 || "",
      revision: 1,
      effectiveDateSerial: Number(cells.Z1 || 0),
    },
    tools: cells.AE10
      ? [{ name: cells.AE10, qty: cells.AI10 || 1, setting: torque }]
      : [],
    materials: cells.AE3
      ? [{ name: cells.AE3, qty: cells.AI3 || 1 }]
      : [],
    steps,
    conflicts,
    log,
  };
}
