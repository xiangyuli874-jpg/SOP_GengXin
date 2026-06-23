import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const ROOT = "E:/AI/SOP";
const INPUT =
  `${ROOT}/outputs/普通8kg及以下产品前总装SOP_新版_修正版.xlsx`;
const PREVIEW_DIR = `${ROOT}/.codex-work/sop-batch/previews-revised`;

await fs.mkdir(PREVIEW_DIR, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(
  await FileBlob.load(INPUT),
);
const sheetInspection = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 12000,
});
const sheetRecords = sheetInspection.ndjson
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((item) => item.kind === "sheet");
const sopSheets = sheetRecords.filter(
  (item) => !["冲突审核", "处理日志"].includes(item.name),
);

for (const item of sopSheets) {
  const preview = await workbook.render({
    sheetName: item.name,
    range: "A1:AM36",
    scale: 0.7,
    format: "png",
  });
  await fs.writeFile(
    path.join(
      PREVIEW_DIR,
      `${String(item.index + 1).padStart(2, "0")}.png`,
    ),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});

console.log(JSON.stringify({
  sopSheets: sopSheets.length,
  totalSheets: sheetRecords.length,
  previews: sopSheets.length,
  formulaErrors: formulaErrors.ndjson,
}, null, 2));
