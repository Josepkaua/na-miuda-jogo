import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("integrates the automatic mechanics presentation layer", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../app/automatic-mechanics-ui.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/automatic-mechanics-ui.css", import.meta.url), "utf8");

  assert.match(layout, /automatic-mechanics-ui\.css/);
  assert.match(layout, /import AutomaticMechanicsUi/);
  assert.match(layout, /<AutomaticMechanicsUi\s*\/>/);
  assert.match(component, /hidden = true/);
  assert.match(component, /tabIndex = -1/);
  assert.match(component, /aria-hidden/);
  assert.match(css, /\.automatic-mechanics-status/);
  assert.match(css, /prefers-reduced-motion/);
});

test("keeps automatic controllers in the DOM while removing host shortcuts from interaction", async () => {
  const component = await readFile(new URL("../app/automatic-mechanics-ui.tsx", import.meta.url), "utf8");

  assert.match(component, /começar pistas/i);
  assert.match(component, /\.discussion-decision-trigger/);
  assert.match(component, /votar\|votação/i);
  assert.match(component, /revelar resultado/i);
  assert.doesNotMatch(component, /\.remove\(\)/);
});

test("explains automatic transitions and fixes the zero-vote result sentence", async () => {
  const component = await readFile(new URL("../app/automatic-mechanics-ui.tsx", import.meta.url), "utf8");

  assert.match(component, /A discussão começa automaticamente assim que todos virem o próprio papel/);
  assert.match(component, /todos escolhem entre mais tempo e votação/);
  assert.match(component, /resultado é revelado automaticamente/i);
  assert.match(component, /Ninguém foi eliminado nesta votação/);
  assert.match(component, /requestAnimationFrame/);
  assert.match(component, /new MutationObserver\(schedule\)/);
});
