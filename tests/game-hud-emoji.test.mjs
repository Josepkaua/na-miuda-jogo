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
  assert.match(picker, /aria-haspopup="menu"/);
  assert.match(picker, /role="menu"/);
  assert.match(picker, /"😂"[\s\S]*"🎭"[\s\S]*"❤️"/);
  assert.match(css, /grid-template-columns:\s*42px minmax\(0, 1fr\) 42px/);
  assert.match(css, /\.emoji-menu/);
  assert.match(css, /\.emoji-grid/);
});

test("emoji picker closes naturally and supports keyboard navigation", async () => {
  const picker = await readFile(new URL("../app/chat-emoji-picker.tsx", import.meta.url), "utf8");

  assert.match(picker, /document\.addEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(picker, /event\.key !== "Escape"/);
  assert.match(picker, /returnFocusToChat\(composer\)/);
  assert.match(picker, /event\.key === "ArrowRight"/);
  assert.match(picker, /event\.key === "ArrowLeft"/);
  assert.match(picker, /event\.key === "ArrowDown"/);
  assert.match(picker, /event\.key === "ArrowUp"/);
  assert.match(picker, /event\.key === "Home"/);
  assert.match(picker, /event\.key === "End"/);
  assert.match(picker, /EMOJI_COLUMNS = 6/);
});

test("keeps the discussion composer wide and ready for continuous desktop typing", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const focus = await readFile(new URL("../app/chat-focus-presence.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/chat-focus-presence.css", import.meta.url), "utf8");

  assert.match(layout, /chat-focus-presence\.css/);
  assert.match(layout, /<ChatFocusPresence\s*\/>/);
  assert.match(css, /\.chat-focus \.chat-composer\s*\{[\s\S]*grid-template-columns:\s*48px minmax\(0, 1fr\) 48px;/);
  assert.match(css, /\.chat-focus \.chat-composer > input[\s\S]*min-width:\s*0;[\s\S]*width:\s*100%;/);
  assert.match(focus, /matchMedia\("\(pointer: fine\)"\)/);
  assert.match(focus, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.match(focus, /document\.addEventListener\("keydown", onGlobalKeyDown, true\)/);
  assert.match(focus, /attributeFilter:\s*\["disabled"\]/);
});

test("shares one DOM observer for chat focus and presence state", async () => {
  const presence = await readFile(new URL("../app/chat-focus-presence.tsx", import.meta.url), "utf8");

  assert.match(presence, /let sharedDomObserver: MutationObserver \| null = null/);
  assert.match(presence, /const domSubscribers = new Set<\(\) => void>\(\)/);
  assert.match(presence, /sharedDomObserver = new MutationObserver\(emitDomChange\)/);
  assert.match(presence, /useSyncExternalStore\(subscribeDom, getDomVersion/);
  assert.match(presence, /sharedDomObserver\?\.disconnect\(\)/);
});

test("shows realtime animated typing presence without a database migration", async () => {
  const presence = await readFile(new URL("../app/chat-focus-presence.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/chat-focus-presence.css", import.meta.url), "utf8");

  assert.match(presence, /\.channel\(`na-miuda-typing-\$\{roomCode\}`/);
  assert.match(presence, /event:\s*"typing"/);
  assert.match(presence, /broadcast:\s*\{ self:\s*false \}/);
  assert.match(presence, /está digitando/);
  assert.match(presence, /1900/);
  assert.match(presence, /input\.addEventListener\("blur", stopTyping\)/);
  assert.match(presence, /document\.addEventListener\("visibilitychange", onVisibilityChange\)/);
  assert.match(css, /\.chat-typing-indicator/);
  assert.match(css, /@keyframes typing-dot/);
  assert.match(css, /\.chat-typing-indicator i:nth-of-type\(3\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});
