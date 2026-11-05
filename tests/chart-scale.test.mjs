import assert from "node:assert/strict";
import { test } from "node:test";
import { chartUpperBound } from "../src/lib/shared/chart-scale.ts";

test("rounds dollar and hour maxima independently to readable upper bounds", () => {
  assert.equal(chartUpperBound(450), 500);
  assert.equal(chartUpperBound(3), 5);
  assert.notEqual(450 / chartUpperBound(450), 3 / chartUpperBound(3));
  for (const value of [0.1, 0.7, 1, 2, 3, 10, 101, 999]) assert.ok(chartUpperBound(value) >= value);
  assert.equal(chartUpperBound(0), 1);
});
