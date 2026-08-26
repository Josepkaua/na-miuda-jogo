import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("detective is ambient background and no longer consumes a discussion column", async () => {
  const css = await read("app/layout-stability.css");
  const page = await read("app/page.tsx");
  const layout = await read("app/layout.tsx");

  assert.match(page, /investigador-na-miuda\.webp/);
  assert.match(css, /\.discussion-investigator\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /url\("\/investigador-na-miuda\.webp"\)/);
  assert.match(css, /grid-template-areas:\s*[\s\S]*"chat main"[\s\S]*"chat players"/);
  assert.doesNotMatch(css, /"art chat main"/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*linear-gradient\(145deg/);
  assert.match(layout, /import "\.\/layout-stability\.css"/);
});
