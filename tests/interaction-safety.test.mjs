import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("protects players from leaving an active room by accident", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../app/interaction-safety.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/interaction-safety.css", import.meta.url), "utf8");

  assert.match(layout, /interaction-safety\.css/);
  assert.match(layout, /<InteractionSafety\s*\/>/);
  assert.match(component, /\.topbar \.brand/);
  assert.match(component, /\.topbar \.ghost-button\.compact/);
  assert.match(component, /event\.preventDefault\(\)/);
  assert.match(component, /role="alertdialog"/);
  assert.match(component, /Sair desta sala\?/);
  assert.match(component, /Continuar jogando/);
  assert.match(component, /bypassLeave/);
  assert.match(component, /beforeunload/);
  assert.match(component, /event\.returnValue = ""/);
  assert.match(css, /\.leave-confirm-backdrop/);
});

test("traps dialog focus and improves theme keyboard navigation", async () => {
  const component = await readFile(new URL("../app/interaction-safety.tsx", import.meta.url), "utf8");

  assert.match(component, /event\.key === "Tab"/);
  assert.match(component, /\.rules-modal/);
  assert.match(component, /\.rules-button/);
  assert.match(component, /event\.key === "ArrowDown"/);
  assert.match(component, /event\.key === "ArrowUp"/);
  assert.match(component, /event\.key === "Home"/);
  assert.match(component, /event\.key === "End"/);
  assert.match(component, /\.theme-trigger/);
});

test("shows copy confirmation once for each success toast", async () => {
  const component = await readFile(new URL("../app/interaction-safety.tsx", import.meta.url), "utf8");

  assert.match(component, /handledToast/);
  assert.match(component, /link da sala copiado/i);
  assert.match(component, /Copiado ✓/);
  assert.match(component, /copyFeedback/);
  assert.match(component, /1800/);
});
