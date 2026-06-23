import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import {
  buildSample,
  fitWithin,
} from "../../src/sop_renewal/build_sample.mjs";

const OUTPUT = "E:/AI/SOP/.codex-work/sop-sample/test-output.xlsx";

test("fits an image inside its box without changing its aspect ratio", () => {
  assert.deepEqual(
    fitWithin({ row: 1, col: 2, widthPx: 300, heightPx: 200 }, 2),
    {
      row: 1,
      col: 2,
      widthPx: 300,
      heightPx: 150,
      colOffsetPx: 0,
      rowOffsetPx: 25,
    },
  );
});

test("builds a sample workbook with the old critical values", async () => {
  await buildSample({ outputPath: OUTPUT });
  const stat = await fs.stat(OUTPUT);
  assert.equal(stat.size > 100_000, true);

  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(OUTPUT));
  const inspect = await workbook.inspect({
    kind: "match",
    searchTerm: "紧固减震器螺栓|ETV DS72-30-10电枪|20–25 N·m",
    options: { useRegex: true, maxResults: 20 },
    maxChars: 5000,
  });
  assert.match(inspect.ndjson, /紧固减震器螺栓/);
  assert.match(inspect.ndjson, /ETV DS72-30-10电枪/);
  assert.match(inspect.ndjson, /20–25 N·m/);

  const revisionStyle = await workbook.inspect({
    kind: "computedStyle",
    sheetId: "洗衣机SOP",
    range: "AG5:AH5",
    maxChars: 3000,
  });
  assert.match(revisionStyle.ndjson, /"numberFormat":"0"/);

  const mutualBorder = await workbook.inspect({
    kind: "computedStyle",
    sheetId: "洗衣机SOP",
    range: "B10:B10",
    maxChars: 3000,
  });
  const selfBorder = await workbook.inspect({
    kind: "computedStyle",
    sheetId: "洗衣机SOP",
    range: "B23:B23",
    maxChars: 3000,
  });
  assert.match(mutualBorder.ndjson, /00B0F0/i);
  assert.match(selfBorder.ndjson, /FF0000/i);
});
