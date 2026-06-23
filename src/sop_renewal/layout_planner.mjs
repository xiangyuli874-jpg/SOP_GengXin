const SLOT_PAIRS = [
  ["top1", "top12"],
  ["top2", null],
  ["top3", "top34"],
  ["top4", null],
  ["bottom5", "bottom56"],
  ["bottom6", null],
  ["bottom7", "bottom78"],
  ["bottom8", null],
];

function demand(step) {
  const imageDemand = Math.max(1, step.images.length);
  const requirementText = [
    ...(step.controlPoints ?? []),
    ...(step.qualityRequirements ?? []),
  ].join("");
  const textDemand = Math.max(
    1,
    Math.ceil((step.text.length + requirementText.length * 0.7) / 55),
  );
  return imageDemand + textDemand * 0.35;
}

function spanFor(step) {
  const requirementText = [
    ...(step.controlPoints ?? []),
    ...(step.qualityRequirements ?? []),
  ].join("");
  if (step.images.length > 1) return 2;
  if (requirementText.length > 45) return 2;
  if (step.text.length > 120) return 2;
  if (demand(step) > 2.4) return 2;
  return 1;
}

function slotAt(index, span) {
  if (span === 1) {
    return {
      key: SLOT_PAIRS[index][0],
      span,
      position: index + 1,
    };
  }
  return {
    key: SLOT_PAIRS[index][1],
    span,
    position: index + 1,
  };
}

export function planLayout(steps) {
  const pages = [];
  const remaining = [...steps];

  while (remaining.length) {
    const page = { steps: [] };
    let cursor = 0;

    while (remaining.length && cursor < SLOT_PAIRS.length) {
      const next = remaining[0];
      const span = spanFor(next);

      if (span === 2 && cursor % 2 === 1) {
        cursor += 1;
        continue;
      }
      if (cursor + span > SLOT_PAIRS.length) break;
      if (span === 2 && !SLOT_PAIRS[cursor][1]) {
        cursor += 1;
        continue;
      }

      const step = remaining.shift();
      page.steps.push({
        ...step,
        imageCount: step.images.length,
        slot: slotAt(cursor, span),
      });
      cursor += span;
    }

    if (!page.steps.length) {
      const step = remaining.shift();
      page.steps.push({
        ...step,
        imageCount: step.images.length,
        slot: slotAt(0, 2),
      });
    }
    pages.push(page);
  }

  return { pages };
}
