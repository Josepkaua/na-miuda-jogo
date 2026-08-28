import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("discussion puts players left of the chat and keeps tools contained", async () => {
  const css = await read("app/layout-stability.css");
  const page = await read("app/page.tsx");
  const layout = await read("app/layout.tsx");

  assert.match(page, /game-active game-phase-/);
  assert.doesNotMatch(page, /discussion-investigator/);
  assert.match(css, /\.app-shell\.game-active::after\s*\{[\s\S]*pointer-events:\s*none[\s\S]*url\("\/investigador-na-miuda\.webp"\)/);
  assert.doesNotMatch(css, /chat-panel::before[\s\S]*investigador-na-miuda/);
  assert.match(css, /grid-template-areas:\s*"players chat main"/);
  assert.match(css, /grid-template-columns:\s*clamp\(230px,\s*18vw,\s*285px\)\s+minmax\(0,\s*1fr\)\s+clamp\(310px,\s*24vw,\s*385px\)/);
  assert.match(css, /@media \(max-width:\s*1180px\) and \(min-width:\s*901px\)[\s\S]*"players chat"[\s\S]*"main chat"/);
  assert.doesNotMatch(css, /"art chat main"/);
  assert.doesNotMatch(css, /"chat main"[\s\S]*"chat players"/);
  assert.match(css, /height:\s*clamp\(520px,\s*calc\(100dvh - 271px\),\s*760px\)/);
  assert.match(css, /@media \(max-height:\s*860px\) and \(min-width:\s*901px\)[\s\S]*height:\s*clamp\(480px,\s*calc\(100dvh - 219px\),\s*640px\)/);
  assert.match(css, /discussion-side[\s\S]*overflow:\s*hidden/);
  assert.match(css, /players-panel \.player-list[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*\.app-shell\.game-active::after\s*\{[\s\S]*display:\s*none/);
  assert.match(layout, /import "\.\/game-ui\.css";[\s\S]*import "\.\/layout-stability\.css";/);
});

test("reveal phase is a centered single-focus scene without internal scrolling", async () => {
  const css = await read("app/layout-stability.css");
  const page = await read("app/page.tsx");

  assert.match(page, /snapshot\.phase === "reveal"/);
  assert.match(page, /game-grid phase-\$\{snapshot\.phase\}/);
  assert.match(page, /role-reveal-stage/);
  assert.match(css, /\.game-grid\.phase-reveal[\s\S]*grid-template-areas:\s*"main"/);
  assert.match(css, /\.game-grid\.phase-reveal > \.chat-panel,[\s\S]*\.game-grid\.phase-reveal > \.players-panel\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.game-grid\.phase-reveal\s*\{[\s\S]*height:\s*auto[\s\S]*min-height:\s*clamp\(520px,/);
  assert.match(css, /\.phase-reveal \.reveal-screen[\s\S]*height:\s*auto[\s\S]*overflow:\s*visible/);
  assert.match(css, /\.phase-reveal \.role-card\s*\{[\s\S]*width:\s*min\(460px,\s*100%\)[\s\S]*min-height:\s*166px/);
  assert.match(css, /@media \(max-height: 860px\) and \(min-width: 901px\)[\s\S]*\.phase-reveal \.role-card[\s\S]*min-height:\s*152px/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.game-grid\.phase-reveal > \.main-panel[\s\S]*order:\s*0/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.phase-reveal \.reveal-screen[\s\S]*overflow:\s*visible/);
});

test("voting and results keep phase controls visible while adapting their grids", async () => {
  const css = await read("app/layout-stability.css");
  const page = await read("app/page.tsx");

  assert.match(css, /\.phase-voting \.voting-screen\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto auto[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.phase-voting \.vote-grid\s*\{[\s\S]*repeat\(4,[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*\.phase-voting \.vote-grid[\s\S]*repeat\(3,/);
  assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*\.phase-voting \.vote-grid[\s\S]*repeat\(2,/);
  assert.match(css, /\.phase-results \.results-columns\s*\{[\s\S]*grid-template-columns:\s*\.9fr 1\.12fr 1fr/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*\.phase-results \.results-columns[\s\S]*repeat\(2,/);
  assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*\.phase-results \.results-columns[\s\S]*minmax\(0,\s*1fr\)/);
  assert.match(page, /vote-actions[\s\S]*Revelar resultado/);
  assert.match(page, /results-content[\s\S]*result-burst[\s\S]*points-note/);
  assert.match(page, /className="vote-grid" role="group"[\s\S]*aria-pressed=\{selectedVote === player\.id\}/);
  assert.doesNotMatch(page, /role="listbox"|role="option"|aria-activedescendant/);
  assert.match(page, /const voteSummary =[\s\S]*eliminatedPlayerIds[\s\S]*voteSummary\.map/);
  assert.doesNotMatch(page, /className="vote-rank"/);
  assert.match(css, /\.phase-results \.impostor-list\s*\{[\s\S]*min-height:\s*0[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.phase-results \.impostor-panel \.secret-reveal\s*\{[\s\S]*flex:\s*0 0 auto/);
  assert.match(css, /\.phase-results \.results-content\.result-impostor-win \.results-panel/);
});

test("intermediate notebook layout has no contradictory row minimums or cramped room header", async () => {
  const css = await read("app/layout-stability.css");
  const start = css.indexOf("@media (max-width: 1180px) and (min-width: 901px)");
  const end = css.indexOf("@media (max-width: 900px)", start);
  const intermediate = css.slice(start, end);
  const stageHeight = Math.max(480, Math.min(729 - 219, 640));

  assert.equal(stageHeight, 510);
  assert.match(intermediate, /\.room-header[\s\S]*flex-direction:\s*column/);
  assert.match(intermediate, /grid-template-rows:\s*minmax\(0,\s*\.9fr\)\s*minmax\(0,\s*1\.1fr\)/);
  assert.doesNotMatch(intermediate, /grid-template-rows:[^;]*(?:250|265)px/);
});

test("gameplay remains readable in light preference and mobile player cards wrap", async () => {
  const css = await read("app/layout-stability.css");

  assert.match(css, /:root\[data-theme="light"\] \.app-shell\.game-active\s*\{[\s\S]*--surface-0:\s*#060817[\s\S]*--text-primary:\s*#f7f8ff/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.game-grid\.phase-lobby > \.main-panel,[\s\S]*\.game-grid\.phase-lobby > \.players-panel\s*\{[\s\S]*flex:\s*0 0 auto/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.game-grid\.phase-lobby > \.main-panel\s*\{[\s\S]*height:\s*auto[\s\S]*min-height:\s*0[\s\S]*overflow:\s*visible/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.game-grid\.phase-lobby \.lobby-content\s*\{[\s\S]*height:\s*auto[\s\S]*overflow:\s*visible/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.game-grid\.phase-lobby,[\s\S]*display:\s*flex[\s\S]*height:\s*auto/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*players-panel \.player-list[\s\S]*display:\s*grid[\s\S]*repeat\(auto-fit,[\s\S]*overflow:\s*visible/);
  assert.doesNotMatch(css, /players-panel \.player-list[\s\S]{0,180}overflow-x:\s*auto/);
});
