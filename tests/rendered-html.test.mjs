import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the production identity and social metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<html[^>]+lang=["']pt-BR["']/i);
  assert.match(html, /<title>Na Miúda! — Jogo do Impostor<\/title>/i);
  assert.match(html, /<meta[^>]+name=["']viewport["'][^>]+width=device-width/i);
  assert.match(html, /<meta[^>]+property=["']og:title["'][^>]+Na Miúda!/i);
  assert.match(html, /<meta[^>]+property=["']og:image["'][^>]+na-miuda-jogo\.onrender\.com\/og\.png/i);
  assert.match(html, /Criar sala e convidar/i);
  assert.match(html, /chat do próprio jogo/i);
});

test("keeps the discussion chat usable on narrow screens", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.app-shell\s*\{[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*visible;/s);
  assert.match(css, /@media\s*\(max-width:\s*900px\),\s*\(hover:\s*none\) and \(pointer:\s*coarse\)/);
  assert.match(css, /\.game-grid\.chat-focus\s*\{[^}]*grid-template-areas:\s*"chat"\s*"main"\s*"players";/s);
  assert.match(css, /\.chat-focus \.chat-panel\s*\{[^}]*height:\s*clamp\([^}]*100dvh/s);
  assert.match(css, /\.chat-focus \.chat-messages\s*\{[^}]*min-height:\s*0;/s);
});
