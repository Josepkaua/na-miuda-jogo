import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("loads the new identity after every previous polish layer", async () => {
  const layout = await read("app/layout.tsx");
  const interactionIndex = layout.indexOf('import "./interaction-safety.css"');
  const identityIndex = layout.indexOf('import "./neon-identity.css"');
  const extrasIndex = layout.indexOf('import "./neon-identity-extras.css"');
  const iconIndex = layout.indexOf('import "./neon-iconography.css"');

  assert.ok(interactionIndex >= 0);
  assert.ok(identityIndex > interactionIndex);
  assert.ok(extrasIndex > identityIndex);
  assert.ok(iconIndex > extrasIndex);
  assert.match(layout, /#f3f5ff/);
  assert.match(layout, /#060817/);
});

test("uses the approved violet cyan coral amber and green palette", async () => {
  const css = await read("app/neon-identity.css");

  assert.match(css, /--nm-violet:\s*#6c5ce7/i);
  assert.match(css, /--nm-cyan:\s*#00d4ff/i);
  assert.match(css, /--nm-green:\s*#00e676/i);
  assert.match(css, /--nm-amber:\s*#ffb800/i);
  assert.match(css, /--nm-coral:\s*#ff4d6d/i);
  assert.match(css, /--cream:\s*#060817/i);
  assert.match(css, /data-game-phase="discussion"[\s\S]*--phase-accent:\s*var\(--nm-cyan\)/i);
  assert.match(css, /data-game-phase="voting"[\s\S]*--phase-accent:\s*var\(--nm-coral\)/i);
  assert.match(css, /data-game-phase="results"[\s\S]*--phase-accent:\s*var\(--nm-green\)/i);
});

test("replaces generic phase symbols with five consistent masked icons", async () => {
  const css = await read("app/neon-identity.css");

  assert.match(css, /phase-step:nth-child\(1\)[\s\S]*--step-color:\s*var\(--nm-cyan\)/i);
  assert.match(css, /phase-step:nth-child\(2\)[\s\S]*#975cff/i);
  assert.match(css, /phase-step:nth-child\(3\)[\s\S]*#2ecbff/i);
  assert.match(css, /phase-step:nth-child\(4\)[\s\S]*var\(--nm-coral\)/i);
  assert.match(css, /phase-step:nth-child\(5\)[\s\S]*var\(--nm-green\)/i);
  assert.match(css, /phase-step:nth-child\(1\) > span::before/);
  assert.match(css, /phase-step:nth-child\(2\) > span::before/);
  assert.match(css, /phase-step:nth-child\(3\) > span::before/);
  assert.match(css, /phase-step:nth-child\(4\) > span::before/);
  assert.match(css, /phase-step:nth-child\(5\) > span::before/);
  assert.match(css, /phase-step\.complete > span::before/);
});

test("turns the lobby into a compact game preparation dashboard", async () => {
  const css = await read("app/neon-identity.css");

  assert.match(css, /\.phase-lobby \.settings-card[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.phase-lobby \.ready-bar i[\s\S]*linear-gradient\(90deg, var\(--nm-violet\), var\(--nm-cyan\)\)/);
  assert.match(css, /\.phase-lobby \.ready-button\.active[\s\S]*var\(--nm-green\)/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*\.phase-lobby \.settings-card[\s\S]*grid-template-columns:\s*1fr/);
});

test("keeps every decisive state visually distinct", async () => {
  const css = await read("app/neon-identity.css");
  const extras = await read("app/neon-identity-extras.css");

  assert.match(css, /\.phase-discussion \.timer-ring strong[\s\S]*var\(--nm-cyan\)/);
  assert.match(css, /\.phase-voting \.vote-card\.selected[\s\S]*var\(--nm-coral\)/);
  assert.match(css, /\.phase-results \.primary-button[\s\S]*var\(--nm-green\)/);
  assert.match(extras, /\.cinematic-vote[\s\S]*rgba\(255,77,109/);
  assert.match(extras, /\.cinematic-group[\s\S]*rgba\(0,230,118/);
  assert.match(extras, /\.cinematic-role-player[\s\S]*rgba\(0,212,255/);
  assert.match(extras, /\.connection-status\.offline[\s\S]*#ff4d6d/);
  assert.match(extras, /\.connection-status\.restored[\s\S]*#00e676/);
});

test("uses consistent functional icons for decisions and results", async () => {
  const icons = await read("app/neon-iconography.css");

  assert.match(icons, /\.decision-options button:first-child > span::before/);
  assert.match(icons, /\.decision-options button:last-child > span::before/);
  assert.match(icons, /\.results-content \.result-burst::before/);
  assert.match(icons, /\.results-content\.result-impostor-win \.result-burst::before/);
  assert.match(icons, /\.chat-message\.mine p/);
  assert.match(icons, /mask-image:/);
  assert.match(icons, /-webkit-mask-image:/);
});

test("brands installed app surfaces with the new palette", async () => {
  const manifest = await read("app/manifest.ts");
  const favicon = await read("public/favicon.svg");

  assert.match(manifest, /name:\s*"Na Miúda! — Jogo do Impostor"/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /background_color:\s*"#060817"/i);
  assert.match(manifest, /theme_color:\s*"#060817"/i);
  assert.match(manifest, /src:\s*"\/favicon\.svg"/);
  assert.match(manifest, /src:\s*"\/mascote-na-miuda\.png"/);
  assert.match(favicon, /#00D4FF/i);
  assert.match(favicon, /#6C5CE7/i);
  assert.match(favicon, /#FF4D6D/i);
  assert.match(favicon, /#FFB800/i);
});

test("keeps motion accessibility after the redesign", async () => {
  const css = await read("app/neon-identity.css");
  const extras = await read("app/neon-identity-extras.css");

  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation:\s*none !important/);
  assert.match(extras, /@media \(prefers-reduced-motion:\s*reduce\)/);
});
