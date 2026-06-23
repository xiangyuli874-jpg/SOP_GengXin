import test from "node:test";
import assert from "node:assert/strict";
import { buildBatchModel } from "../../src/sop_renewal/batch_rules.mjs";

function source(jobName, extraText = "") {
  return {
    source_sheet: `GT-QZ99${jobName}`,
    source_index: 1,
    raw_cells: {
      I3: jobName,
      Q3: "GT-QZ99",
      Q2: "普通8kg及以下",
      Z2: "15s",
      Z3: "1",
      Q1: "JD.K4022（1.0）",
      Z1: "45512",
      AE14: extraText,
    },
    raw_images: [],
    raw_text_boxes: [
      { row: 18, col: 0, text: `1.执行${jobName}操作 ${extraText}` },
    ],
  };
}

test("前总装仅清单中的吊筒岗位勾选关键岗位", () => {
  const options = {
    processName: "前总装",
    criticalJobs: new Set(["吊筒"]),
  };
  assert.equal(buildBatchModel(source("吊筒"), options).tags.keyPost, true);
  assert.equal(
    buildBatchModel(source("紧固排水泵"), options).tags.keyPost,
    false,
  );
});

test("仅可能影响洗衣机外观面的岗位勾选外观检查", () => {
  const options = {
    processName: "前总装",
    criticalJobs: new Set(["吊筒"]),
  };
  assert.equal(
    buildBatchModel(
      source("紧固前门上卡扣", "操作时防止前门板划伤"),
      options,
    ).tags.visualInspection,
    true,
  );
  assert.equal(
    buildBatchModel(
      source("插接排水泵端子", "端子插接到位，无漏插"),
      options,
    ).tags.visualInspection,
    false,
  );
});

