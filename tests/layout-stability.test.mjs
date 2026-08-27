import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("discussion uses the detective as ambient art without layout overflow", async () => {
  const css = await read("app/layout-stability.css");
  const page = await read("app/page.tsx");
  const layout = await read("app/layout.tsx");

  assert.match(page, /investigador-na-miuda\.webp/);
  assert.match(css, /\.discussion-investigator\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /chat-panel::before[\s\S]*url\("\/investigador-na-miuda\.webp"\)/);
  assert.match(css, /grid-template-areas:\s*[\s\S]*"chat main"[\s\S]*"chat players"/);
  assert.doesNotMatch(css, /"art chat main"/);
  assert.match(css, /height:\s*clamp\(560px,\s*calc\(100dvh - 210px\),\s*760px\)/);
  assert.match(css, /discussion-side[\s\S]*overflow:\s*hidden/);
  assert.match(css, /players-panel \.player-list[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*chat-panel::before[\s\S]*display:\s*none/);
  assert.match(layout, /import "\.\/game-ui\.css";[\s\S]*import "\.\/layout-stability\.css";/);
});

test("reveal phase prioritizes the secret card and does not reserve space for paused chat", async () => {
  const css = await read("app/layout-stability.css");
  const page = await read("app/page.tsx");

  assert.match(page, /phase-reveal/);
  assert.match(page, /role-reveal-stage/);
  assert.match(css, /\.game-grid\.phase-reveal[\s\S]*grid-template-areas:\s*"main players"/);
  assert.match(css, /\.game-grid\.phase-reveal > \.chat-panel\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.phase-reveal \.reveal-screen[\s\S]*height:\s*100%[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /@media \(max-height: 860px\) and \(min-width: 901px\)[\s\S]*\.phase-reveal \.role-card[\s\S]*min-height:\s*168px/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.game-grid\.phase-reveal > \.main-panel[\s\S]*order:\s*0/);
});
