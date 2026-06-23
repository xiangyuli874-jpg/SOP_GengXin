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

test("never assigns one step to a full four-slot row", () => {
  const plan = planLayout([
    {
      id: 1,
      text: "多图步骤应只合并相邻两个步骤位",
      images: [
        { ratio: 1.2 },
        { ratio: 1.2 },
        { ratio: 1.2 },
      ],
    },
    { id: 2, text: "后续步骤仍需保留独立区域", images: [{ ratio: 1.1 }] },
    { id: 3, text: "继续排版", images: [{ ratio: 1.1 }] },
  ]);

  for (const page of plan.pages) {
    for (const step of page.steps) {
      assert.notEqual(step.slot, "top-full");
      assert.notEqual(step.slot, "bottom-full");
      assert.equal(step.slot.span <= 2, true);
    }
  }
});

test("uses two adjacent slots when control or quality text is long", () => {
  const plan = planLayout([
    {
      id: 1,
      text: "检查外观",
      images: [{ ratio: 1.2 }],
      controlPoints: ["检查箱体有无划伤、变形、脏污等，检查箱体漏压、螺钉等不良，防止外观缺陷流出"],
      qualityRequirements: ["A/B/C 面均无变形、划伤、喷涂不良、脏污等"],
    },
  ]);

  assert.equal(plan.pages[0].steps[0].slot.span, 2);
});
