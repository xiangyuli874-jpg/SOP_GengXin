import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSampleModel,
  normalizeUnitText,
} from "../../src/sop_renewal/sample_rules.mjs";

test("normalizes unit punctuation without changing the torque value", () => {
  assert.equal(
    normalizeUnitText("减震器螺栓力矩：20-25N.m"),
    "减震器螺栓力矩：20–25 N·m",
  );
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

test("groups images by action instead of slicing only by reading order", () => {
  const operationImages = [
    { row: 4, col: 0, path: "bolts.png", width: 345, height: 260 },
    { row: 4, col: 5, path: "install.png", width: 606, height: 532 },
    { row: 4, col: 9, path: "overview.jpg", width: 441, height: 580 },
    { row: 8, col: 0, path: "bin.png", width: 591, height: 515 },
    { row: 8, col: 9, path: "tighten.png", width: 576, height: 535 },
  ];
  const model = buildSampleModel({
    old: {
      jobName: "紧固减震器螺栓",
      torque: "20-25N.m",
      operationImages,
    },
    completedCase: {},
  });

  assert.deepEqual(
    model.steps.map((step) => step.images.map((image) => image.path)),
    [
      ["bolts.png", "bin.png"],
      ["install.png"],
      ["overview.jpg", "tighten.png"],
    ],
  );
  assert.deepEqual(model.tags, {
    keyPost: true,
    esdProtection: false,
    visualInspection: true,
    operationBottleneck: false,
  });
  assert.deepEqual(
    model.steps.map((step) => step.inspectionType),
    ["mutual", "mutual", "self"],
  );
});
