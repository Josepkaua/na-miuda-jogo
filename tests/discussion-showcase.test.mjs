import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path, encoding = "utf8") => readFile(new URL(`../${path}`, import.meta.url), encoding);

test("uses the keyhole eye as the game symbol", async () => {
  const layout = await read("app/layout.tsx");
  const page = await read("app/page.tsx");
  const stability = await read("app/layout-stability.css");

  assert.match(layout, /import "\.\/game-ui\.css"/);
  assert.match(page, /game-active game-phase-/);
  assert.match(page, /<EyeMark className="brand-logo" \/>/);
  assert.doesNotMatch(page, /discussion-investigator/);
});

test("recomposes the discussion instead of merely recoloring cards", async () => {
  const css = await read("app/game-ui.css");
  const stability = await read("app/layout-stability.css");
  const page = await read("app/page.tsx");

  assert.match(page, /className="phase-content centered-phase discussion-side"/);
  assert.match(page, /className="players-panel panel"/);
  assert.match(page, /className={`chat-panel panel chat-\$\{phase\}`}/);
  assert.match(stability, /grid-template-areas:\s*"players chat main"/);
  assert.match(stability, /"players chat"\s*"main chat"/);
  assert.doesNotMatch(css, /"art chat main"/);
  assert.match(css, /\.discussion-side/);
  assert.match(css, /\.timer-ring/);
  assert.match(css, /\.secret-recheck/);
  assert.match(css, /\.player-row[\s\S]*min-height:\s*48px/);
});

test("keeps the discussion responsive and motion-accessible", async () => {
  const css = await read("app/game-ui.css");
  const stability = await read("app/layout-stability.css");

  assert.match(css, /@media \(max-height:\s*820px\) and \(min-width:\s*901px\)/);
  assert.match(stability, /mobile-view-chat > \.main-panel/);
  assert.match(css, /@media \(max-width:\s*900px\)/);
  assert.match(css, /@media \(max-width:\s*600px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation:\s*none !important/);
});
