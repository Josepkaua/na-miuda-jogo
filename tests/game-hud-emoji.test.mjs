import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the in-game HUD compact, unified and animated", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/game-hud-refinement.css", import.meta.url), "utf8");

  assert.match(layout, /game-hud-refinement\.css/);
  assert.match(css, /\.game-wrap > \.room-header\.panel[\s\S]*margin-bottom:\s*0;/);
  assert.match(css, /border-radius:\s*20px 20px 0 0/);
  assert.match(css, /\.game-wrap > \.phase-rail\.panel[\s\S]*border-radius:\s*0 0 20px 20px/);
  assert.match(css, /calc\(100dvh - 158px\)/);
  assert.match(css, /@keyframes phase-scan/);
  assert.match(css, /@keyframes phase-icon-breathe/);
  assert.match(css, /\.chat-messages \.chat-message:last-child/);
  assert.match(css, /@media \(max-width:\s*600px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});

test("adds an accessible emoji picker without changing chat transport", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const picker = await readFile(new URL("../app/chat-emoji-picker.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/game-hud-refinement.css", import.meta.url), "utf8");

  assert.match(layout, /<ChatEmojiPicker\s*\/>/);
  assert.match(picker, /useSyncExternalStore/);
  assert.match(picker, /createPortal/);
  assert.match(picker, /Mensagem para o chat da sala/);
  assert.match(picker, /HTMLInputElement\.prototype/);
  assert.match(picker, /new Event\("input", \{ bubbles: true \}\)/);
  assert.match(picker, /aria-label="Abrir emojis"/);
  assert.match(picker, /role="menu"/);
  assert.match(picker, /"😂"[\s\S]*"🎭"[\s\S]*"❤️"/);
  assert.match(css, /grid-template-columns:\s*42px minmax\(0, 1fr\) 42px/);
  assert.match(css, /\.emoji-menu/);
  assert.match(css, /\.emoji-grid/);
});
