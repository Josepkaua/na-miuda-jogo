import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("loads one final gameplay layer after the supporting UI layers", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const interactionIndex = layout.indexOf('import "./interaction-safety.css"');
  const gameUiIndex = layout.indexOf('import "./game-ui.css"');

  assert.ok(interactionIndex >= 0);
  assert.ok(gameUiIndex > interactionIndex);
});

test("gives every gameplay phase its own visual identity without changing phase mechanics", async () => {
  const css = await readFile(new URL("../app/game-ui.css", import.meta.url), "utf8");

  for (const phase of ["lobby", "reveal", "discussion", "voting", "results"]) {
    assert.match(css, new RegExp(`phase-${phase}`));
  }

  assert.match(css, /\.phase-lobby \.settings-card/);
  assert.match(css, /\.phase-reveal \.role-card/);
  assert.match(css, /\.phase-discussion \.timer-ring\.is-critical/);
  assert.match(css, /\.phase-voting \.vote-card\.selected/);
  assert.match(css, /\.results-columns/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("motion controller exposes phase state and animates meaningful player changes", async () => {
  const controller = await readFile(new URL("../app/game-motion-controller.tsx", import.meta.url), "utf8");

  assert.match(controller, /document\.documentElement\.dataset\.gamePhase = phase/);
  assert.match(controller, /delete document\.documentElement\.dataset\.gamePhase/);
  assert.match(controller, /scoreMemory/);
  assert.match(controller, /score-changed/);
  assert.match(controller, /stateMemory/);
  assert.match(controller, /player-state-changed/);
  assert.match(controller, /attributeFilter:/);
});

test("coalesces motion and automatic-flow DOM mutations into animation frames", async () => {
  const motion = await readFile(new URL("../app/game-motion-controller.tsx", import.meta.url), "utf8");
  const autoFlow = await readFile(new URL("../app/game-auto-flow.tsx", import.meta.url), "utf8");

  for (const source of [motion, autoFlow]) {
    assert.match(source, /let inspectFrame: number \| null = null/);
    assert.match(source, /const scheduleInspect = \(\) =>/);
    assert.match(source, /window\.requestAnimationFrame\(\(\) =>/);
    assert.match(source, /new MutationObserver\(scheduleInspect\)/);
    assert.match(source, /window\.cancelAnimationFrame\(inspectFrame\)/);
  }

  assert.match(autoFlow, /const timers = new Set<number>\(\)/);
  assert.match(autoFlow, /timers\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\)/);
});

test("keeps the most important game feedback animated but respects reduced motion", async () => {
  const css = await readFile(new URL("../app/game-ui.css", import.meta.url), "utf8");

  assert.match(css, /@keyframes nm-score-pop/);
  assert.match(css, /\.score-changed/);
});

test("compacts the global game chrome and keeps primary mobile actions reachable", async () => {
  const css = await readFile(new URL("../app/game-ui.css", import.meta.url), "utf8");

  assert.match(css, /\.phase-voting[\s\S]*\.vote-actions/);
  assert.match(css, /\.phase-lobby[\s\S]*\.lobby-actions/);
  assert.match(css, /@media \(prefers-reduced-motion:/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("presents Na Miuda as a standalone game app with branded metadata", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const manifest = await readFile(new URL("../app/manifest.ts", import.meta.url), "utf8");
  const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");

  assert.match(layout, /applicationName:\s*"Na Miúda!"/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /appleWebApp:/);
  assert.match(layout, /themeColor:/);
  assert.match(layout, /\/favicon\.svg/);

  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /lang:\s*"pt-BR"/);
  assert.match(manifest, /categories:\s*\["games", "entertainment", "social"\]/);
  assert.match(manifest, /background_color:\s*"#060817"/i);
  assert.match(manifest, /theme_color:\s*"#060817"/i);
  assert.match(manifest, /src:\s*"\/favicon\.svg"/);
  assert.match(manifest, /src:\s*"\/mascote-na-miuda\.png"/);

  assert.match(favicon, /#060817/i);
  assert.match(favicon, /#6C5CE7/i);
  assert.match(favicon, /#00D4FF/i);
  assert.match(favicon, /#FF4D6D/i);
  assert.match(favicon, /#FFB800/i);
});
