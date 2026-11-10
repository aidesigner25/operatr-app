import assert from "node:assert/strict";
import { test } from "node:test";
import { assessSharedLimiter } from "../scripts/check-shared-limiter.mjs";

test("shared limiter verification requires working controls and a combined quota", () => {
  assert.deepEqual(assessSharedLimiter(true, true, [true, true, false], [true, true, false]), { allowed: 4, blocked: 2 });
  assert.throws(() => assessSharedLimiter(false, true, [true, true, false], [true, true, false]), /INCONCLUSIVE/);
  assert.throws(() => assessSharedLimiter(true, true, [true, true, true], [true, true, true]), /expected four/);
  assert.throws(() => assessSharedLimiter(true, true, [false, false, false], [false, false, false]), /expected four/);
});
