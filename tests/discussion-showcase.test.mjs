import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path, encoding = "utf8") => readFile(new URL(`../${path}`, import.meta.url), encoding);

test("uses the generated investigator as a real discussion asset", async () => {
  const asset = await read("public/investigador-na-miuda.webp", null);
  const css = await read("app/discussion-showcase.css");
  const layout = await read("app/layout.tsx");

  assert.equal(asset.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(asset.subarray(8, 12).toString("ascii"), "WEBP");
  assert.match(css, /url\("\/investigador-na-miuda\.webp"\)/);
  assert.match(css, /@keyframes investigator-breathe/);
  assert.match(layout, /import "\.\/discussion-showcase\.css"/);
});

test("recomposes the discussion instead of merely recoloring cards", async () => {
  const css = await read("app/discussion-showcase.css");
  const page = await read("app/page.tsx");

  assert.match(page, /className="phase-content centered-phase discussion-side"/);
  assert.match(page, /className="players-panel panel"/);
  assert.match(page, /className={`chat-panel panel chat-\$\{phase\}`}/);
  assert.match(css, /--discussion-rail:\s*clamp\(330px, 26vw, 390px\)/);
  assert.match(css, /grid-template-areas:[\s\S]*"chat main"[\s\S]*"chat players"/);
  assert.match(css, /\.discussion-side[\s\S]*grid-template-columns:\s*96px minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-areas:[\s\S]*"timer eyebrow"[\s\S]*"tip tip"[\s\S]*"secret secret"/);
  assert.match(css, /\.chat-empty::before[\s\S]*investigador-na-miuda\.webp/);
  assert.match(css, /\.player-row[\s\S]*min-height:\s*46px/);
});

test("keeps the discussion responsive and motion-accessible", async () => {
  const css = await read("app/discussion-showcase.css");

  assert.match(css, /@media \(max-height:\s*820px\) and \(min-width:\s*901px\)/);
  assert.match(css, /@media \(max-width:\s*900px\), \(hover:\s*none\) and \(pointer:\s*coarse\)/);
  assert.match(css, /@media \(max-width:\s*520px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /animation:\s*none !important/);
});
