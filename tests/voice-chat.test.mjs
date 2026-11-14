import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("offers live voice in the room without a database migration", async () => {
  const [voice, page, css] = await Promise.all([read("app/voice-chat.tsx"), read("app/page.tsx"), read("app/game-ui.css")]);

  assert.match(voice, /\.channel\(`room-voice:\$\{roomCode\}`/);
  assert.match(voice, /new RTCPeerConnection\(\{ iceServers \}\)/);
  assert.match(voice, /getUserMedia\(\{ audio:/);
  assert.match(voice, /event:\s*"signal"/);
  assert.match(page, /<VoiceChat key=\{snapshot\.code\}/);
  assert.match(page, /remoteEnabled && !demoMode && me\?\.id && <VoiceChat/);
  assert.match(css, /\.voice-chat \.voice-mic\.muted/);
  assert.match(css, /\.player-row\.speaking \.avatar/);
});

test("only one side of each pair sends the offer and the microphone is released on exit", async () => {
  const voice = await read("app/voice-chat.tsx");

  assert.match(voice, /if \(playerId > id\) continue;/);
  assert.match(voice, /signal\.to !== playerId/);
  assert.match(voice, /track\.stop\(\)/);
  assert.match(voice, /supabase\.removeChannel\(channel\)/);
  assert.match(voice, /aria-pressed=\{muted\}/);
});
