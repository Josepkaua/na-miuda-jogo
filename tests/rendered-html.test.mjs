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
  assert.match(html, /Criar sala e chamar a turma/i);
  assert.match(html, /chat (?:no jogo|integrado)/i);
});

test("keeps the discussion chat usable on narrow screens", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.app-shell\s*\{[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*visible;/s);
  assert.match(css, /@media\s*\(max-width:\s*900px\),\s*\(hover:\s*none\) and \(pointer:\s*coarse\)/);
  assert.match(css, /\.game-grid\.chat-focus\s*\{[^}]*grid-template-areas:\s*"chat"\s*"main"\s*"players";/s);
  assert.match(css, /\.chat-focus \.chat-panel\s*\{[^}]*height:\s*clamp\([^}]*100dvh/s);
  assert.match(css, /\.chat-focus \.chat-messages\s*\{[^}]*min-height:\s*0;/s);
});

test("keeps the lobby chat large and long player lists contained", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.game-grid\.phase-lobby\s*\{[^}]*grid-template-areas:\s*"players main chat";/s);
  assert.match(css, /\.phase-lobby \.player-list\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.phase-lobby \.chat-messages\s*\{[^}]*flex:\s*1 1 auto;[^}]*height:\s*auto;/s);
  assert.match(css, /\.game-grid\.phase-lobby\s*\{[^}]*height:\s*auto;[^}]*grid-template-areas:\s*"main"\s*"players"\s*"chat";/s);
  assert.match(css, /\.vote-progress\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*900;/s);
});

test("removes inactive players from server-side vote eligibility", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260824040000_remove_inactive_players.sql", import.meta.url), "utf8");

  assert.match(sql, /set left_at = now\(\), is_ready = false[\s\S]*last_seen_at <= now\(\) - interval '75 seconds'/i);
  assert.match(sql, /eligible_voters[\s\S]*p\.left_at is null[\s\S]*p\.last_seen_at > now\(\) - interval '75 seconds'/i);
  assert.match(sql, /vote_total[\s\S]*p\.left_at is null[\s\S]*p\.last_seen_at > now\(\) - interval '75 seconds'/i);
  assert.match(sql, /host_player_id = replacement_host/i);
});

test("keeps discussion chat-first and reopens the collective decision after more time", async () => {
  const css = await readFile(new URL("../app/discussion-refinement.css", import.meta.url), "utf8");
  const guard = await readFile(new URL("../app/game-phase-guard.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const sql = await readFile(new URL("../supabase/migrations/20260824040000_remove_inactive_players.sql", import.meta.url), "utf8");

  assert.match(layout, /discussion-refinement\.css/);
  assert.match(layout, /<GamePhaseGuard\s*\/>/);
  assert.match(css, /\.game-grid\.chat-focus\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+292px;/s);
  assert.match(css, /\.chat-focus \.main-panel\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.chat-focus \.players-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.chat-focus \.player-list\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.chat-focus \.chat-messages\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /62svh/);
  assert.match(css, /100dvh/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

  assert.match(guard, /actionLocks\s*=\s*useRef\(new Set<string>\(\)\)/);
  assert.match(guard, /autoAdvanceLocks\s*=\s*useRef\(new Set<string>\(\)\)/);
  assert.match(guard, /staleNoticeClose\?\.click\(\)/);
  assert.match(guard, /previous\.phase === "discussion" && current\.phase === "voting"/);
  assert.match(guard, /previous\.phase === "voting" && current\.phase === "results"/);
  assert.match(guard, /readVotingProgress\(\)/);
  assert.match(guard, /voting\.complete \|\| voting\.expired/);
  assert.match(guard, /revealButton\.click\(\)/);
  assert.match(guard, /Tempo encerrado — abrindo a votação…/);
  assert.match(guard, /Todos votaram — revelando o resultado…/);

  assert.match(sql, /outcome := 'more_time'[\s\S]*phase_ends_at = now\(\) \+ interval '1 minute'[\s\S]*delete from public\.discussion_votes[\s\S]*round_id = target_room\.current_round_id/i);
  assert.doesNotMatch(page, /advance_discussion_turn|onAdvanceDiscussionTurn|turn-banner/);
  assert.match(page, /Mais tempo ou votação\?/);
  assert.match(page, /Chat livre — perguntem e respondam sem escrever a palavra secreta/);
});
