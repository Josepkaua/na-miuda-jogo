import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("loads the global experience polish after the existing refinement layers", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const hudIndex = layout.indexOf('import "./game-hud-refinement.css"');
  const presenceIndex = layout.indexOf('import "./chat-focus-presence.css"');
  const overhaulIndex = layout.indexOf('import "./experience-overhaul.css"');

  assert.ok(hudIndex >= 0);
  assert.ok(presenceIndex > hudIndex);
  assert.ok(overhaulIndex > presenceIndex);
});

test("gives every gameplay phase its own visual identity without changing phase mechanics", async () => {
  const css = await readFile(new URL("../app/experience-overhaul.css", import.meta.url), "utf8");

  for (const phase of ["lobby", "reveal", "discussion", "voting", "results"]) {
    assert.match(css, new RegExp(`:root\\[data-game-phase="${phase}"\\]`));
  }

  assert.match(css, /\.phase-lobby \.settings-card/);
  assert.match(css, /\.phase-reveal \.role-card/);
  assert.match(css, /\.phase-discussion \.timer-ring\.is-critical/);
  assert.match(css, /\.phase-voting \.vote-card\.selected/);
  assert.match(css, /\.phase-results \.round-ranking/);
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
  assert.match(controller, /attributeFilter:\s*\["class", "disabled", "style"\]/);
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
  const css = await readFile(new URL("../app/experience-overhaul.css", import.meta.url), "utf8");

  assert.match(css, /@keyframes start-ready-pulse/);
  assert.match(css, /@keyframes secret-scan/);
  assert.match(css, /@keyframes critical-clock/);
  assert.match(css, /@keyframes vote-lock/);
  assert.match(css, /@keyframes result-halo/);
  assert.match(css, /@keyframes score-bump/);
  assert.match(css, /\.player-score\.score-changed/);
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
  assert.match(manifest, /src:\s*"\/favicon\.svg"/);
  assert.match(manifest, /src:\s*"\/mascote-na-miuda\.png"/);

  assert.match(favicon, /#073D45/);
  assert.match(favicon, /#C8F43D/);
  assert.match(favicon, /#76D7FF/);
});
