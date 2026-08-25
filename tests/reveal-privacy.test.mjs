import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("advances after everyone saw the role without reopening the host secret", async () => {
  const source = await readFile(new URL("../app/game-auto-flow.tsx", import.meta.url), "utf8");

  assert.match(source, /if \(button\.disabled\) button\.disabled = false/);
  assert.match(source, /button\.click\(\)/);
  assert.doesNotMatch(source, /revealHostCardIfNeeded/);
  assert.doesNotMatch(source, /\.role-card[\s\S]*\.click\(\)/);
  assert.doesNotMatch(source, /revealLocks/);
});
