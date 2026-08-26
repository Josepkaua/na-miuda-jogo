import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("loads the new identity as the final gameplay layer", async () => {
  const layout = await read("app/layout.tsx");
  const interactionIndex = layout.indexOf('import "./interaction-safety.css"');
  const identityIndex = layout.indexOf('import "./game-ui.css"');

  assert.ok(interactionIndex >= 0);
  assert.ok(identityIndex > interactionIndex);
  assert.match(layout, /#f3f5ff/);
  assert.match(layout, /#060817/);
});

test("uses the approved violet cyan coral amber and green palette", async () => {
  const css = await read("app/globals.css");

  assert.match(css, /--color-primary:\s*#8b5cf6/i);
  assert.match(css, /--color-investigation:\s*#00d4ff/i);
  assert.match(css, /--color-success:\s*#00e676/i);
  assert.match(css, /--color-warning:\s*#ffb800/i);
  assert.match(css, /--color-danger:\s*#ff4d6d/i);
});

test("replaces generic phase symbols with five consistent masked icons", async () => {
  const css = await read("app/game-ui.css");

  assert.match(css, /\.phase-step\.active/);
  assert.match(css, /\.phase-step\.complete/);
  assert.match(css, /\.ui-icon/);
});

test("turns the lobby into a compact game preparation dashboard", async () => {
  const css = await read("app/game-ui.css");

  assert.match(css, /\.settings-card/);
  assert.match(css, /\.ready-bar i/);
  assert.match(css, /\.ready-button\.active/);
  assert.match(css, /@media \(max-width:\s*900px\)/);
});

test("keeps every decisive state visually distinct", async () => {
  const css = await read("app/game-ui.css");
  const extras = await read("app/connection-status.css");

  assert.match(css, /\.timer-ring strong/);
  assert.match(css, /\.vote-card[^}]*selected/);
  assert.match(css, /\.result-burst/);
  assert.match(extras, /\.connection-status\.offline/);
});

test("uses consistent functional icons for decisions and results", async () => {
  const icons = await read("app/game-ui.css");

  assert.match(icons, /\.decision-options button/);
  assert.match(icons, /\.results-content/);
  assert.match(icons, /\.chat-message\.mine p/);
  assert.match(icons, /\.ui-icon/);
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
  const css = await read("app/game-ui.css");
  const extras = css;

  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation:\s*none !important/);
  assert.match(extras, /@media \(prefers-reduced-motion:\s*reduce\)/);
});
