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

function groupOperationImages(images) {
  if (images.every((image) => Number.isInteger(image.row) && Number.isInteger(image.col))) {
    return {
      takeAndCheck: images.filter(
        (image) => image.col === 0 && (image.row === 4 || image.row === 8),
      ),
      install: images.filter((image) => image.row === 4 && image.col === 5),
      tighten: images.filter((image) => image.col === 9),
    };
  }
  return {
    takeAndCheck: images.slice(0, 2),
    install: images.slice(2, 4),
    tighten: images.slice(4),
  };
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
  const imageGroups = groupOperationImages(images);
  const steps = [
    {
      id: 1,
      text: "拿取减震器螺栓，检查型号、涂层和螺纹状态，确认无锈蚀、无损伤。",
      images: imageGroups.takeAndCheck,
      controlPoints: ["减震器螺栓型号正确"],
      qualityRequirements: [],
      inspectionType: "mutual",
    },
    {
      id: 2,
      text: "对齐减震器螺栓孔与箱体固定孔，将螺栓完全穿入安装孔；操作时避免直接握拿减震器钢管，防止蹭掉润滑油。",
      images: imageGroups.install,
      controlPoints: ["安装方向正确，螺栓孔与固定孔准确对齐"],
      qualityRequirements: ["减震器连接无异常、无脱节"],
      inspectionType: "mutual",
    },
    {
      id: 3,
      text: "使用电枪紧固减震器螺栓，检查螺栓紧固状态。",
      images: imageGroups.tighten,
      controlPoints: ["螺栓紧固到位，无漏打、滑丝"],
      qualityRequirements: [normalizeUnitText(`减震器螺栓力矩：${old.torque}`)],
      inspectionType: "self",
    },
  ];

  return {
    tags: {
      keyPost: true,
      esdProtection: false,
      visualInspection: true,
      operationBottleneck: false,
    },
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
    tools: [
      {
        name: old.toolName,
        qty: old.toolQty,
        setting: normalizeUnitText(old.torque),
      },
    ],
    materials: [{ name: old.materialName, qty: old.materialQty }],
    steps,
    qualityRequirements: [
      normalizeUnitText(`减震器螺栓力矩：${old.torque}`),
    ],
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
