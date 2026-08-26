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
  const [baseCss, css] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/game-ui.css", import.meta.url), "utf8"),
  ]);

  assert.match(baseCss, /\.app-shell\s*\{[^}]*overflow-x:\s*clip;/s);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /\.phase-discussion\s*\{[^}]*grid-template-areas:\s*"art chat main"\s*"art chat players";/s);
  assert.match(css, /\.chat-messages\s*\{[^}]*min-height:/s);
});

test("keeps the lobby chat large and long player lists contained", async () => {
  const css = await readFile(new URL("../app/game-ui.css", import.meta.url), "utf8");

  assert.match(css, /\.player-list\s*\{[^}]*overflow:\s*auto;/s);
  assert.match(css, /\.chat-messages\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.vote-progress\s*\{/);
});

test("removes inactive players from server-side vote eligibility", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260824040000_remove_inactive_players.sql", import.meta.url), "utf8");

  assert.match(sql, /set left_at = now\(\), is_ready = false[\s\S]*last_seen_at <= now\(\) - interval '75 seconds'/i);
  assert.match(sql, /eligible_voters[\s\S]*p\.left_at is null[\s\S]*p\.last_seen_at > now\(\) - interval '75 seconds'/i);
  assert.match(sql, /vote_total[\s\S]*p\.left_at is null[\s\S]*p\.last_seen_at > now\(\) - interval '75 seconds'/i);
  assert.match(sql, /host_player_id = replacement_host/i);
});

test("keeps discussion chat-first and reopens the collective decision after more time", async () => {
  const css = await readFile(new URL("../app/game-ui.css", import.meta.url), "utf8");
  const guard = await readFile(new URL("../app/game-phase-guard.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const sql = await readFile(new URL("../supabase/migrations/20260824040000_remove_inactive_players.sql", import.meta.url), "utf8");

  assert.match(layout, /game-ui\.css/);
  assert.match(layout, /<GamePhaseGuard\s*\/>/);
  assert.match(css, /\.phase-discussion\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /\.main-panel\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.player-list\s*\{[^}]*overflow:\s*auto;/s);
  assert.match(css, /\.chat-messages\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /100dvh/);
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
  assert.match(guard, /HORA DE ACUSAR/);
  assert.match(guard, /A EQUIPE VENCEU/);
  assert.match(guard, /O IMPOSTOR VENCEU/);
  assert.match(guard, /Todos votaram — calculando o resultado…/);

  assert.match(sql, /outcome := 'more_time'[\s\S]*phase_ends_at = now\(\) \+ interval '1 minute'[\s\S]*delete from public\.discussion_votes[\s\S]*round_id = target_room\.current_round_id/i);
  assert.doesNotMatch(page, /advance_discussion_turn|onAdvanceDiscussionTurn|turn-banner/);
  assert.match(page, /Mais tempo ou votação\?/);
  assert.match(page, /Chat livre — perguntem e respondam sem escrever a palavra secreta/);
});

test("uses cinematic transitions without sacrificing accessibility or mechanical feedback", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const guard = await readFile(new URL("../app/game-phase-guard.tsx", import.meta.url), "utf8");
  const controller = await readFile(new URL("../app/game-motion-controller.tsx", import.meta.url), "utf8");
  const cinematic = await readFile(new URL("../app/game-ui.css", import.meta.url), "utf8");
  const polish = cinematic;

  assert.match(layout, /game-ui\.css/);
  assert.match(layout, /<GameMotionController\s*\/>/);
  assert.match(guard, /kind:\s*"role-impostor"/);
  assert.match(guard, /kind:\s*"role-player"/);
  assert.match(guard, /kind:\s*"group"/);
  assert.match(guard, /kind:\s*"impostor"/);
  assert.match(guard, /cinematic-\$\{cinematic\.kind\}/);
  assert.match(guard, /currentText === text/);
  assert.match(controller, /syncDiscussionUrgency\(\)/);
  assert.match(controller, /syncVotingUrgency\(\)/);
  assert.match(controller, /Vote agora — Na Miúda!/);
  assert.match(controller, /navigator\.vibrate/);
  assert.match(cinematic, /\.timer-ring\.is-critical/);
  assert.match(cinematic, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(polish, /\.vote-card\.selected/);
  assert.match(polish, /\.ready-bar i/);
  assert.match(polish, /\.discussion-decision/);
  assert.match(polish, /\.cinematic-transition\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(polish, /@media \(prefers-reduced-motion: reduce\)/);
});

test("uses harder impostor hints and the 3-2-plus-1 scoring model", async () => {
  const guard = await readFile(new URL("../app/game-phase-guard.tsx", import.meta.url), "utf8");
  const sql = await readFile(new URL("../supabase/migrations/20260824041000_gameplay_scoring_and_hints.sql", import.meta.url), "utf8");

  assert.match(guard, /const hardImpostorHints: Record<string, string\[]>/);
  assert.match(guard, /syncHardImpostorHints\(\)/);
  assert.match(guard, /Pense mais na ocasião e na experiência de comer/);
  assert.match(guard, /Pode ser pessoa, lugar, regra, ação, competição/);
  assert.doesNotMatch(guard, /É comum em lanches, festas e vitrines de padarias/);

  assert.match(sql, /set impostor_hint = case category/i);
  assert.match(sql, /set score = p\.score \+ 2[\s\S]*rr\.role = 'player'/i);
  assert.match(sql, /set score = p\.score \+ 3[\s\S]*rr\.role = 'impostor'/i);
  assert.match(sql, /set score = p\.score \+ 1[\s\S]*voter_role\.role = 'player'[\s\S]*v\.target_player_id = any\(impostors\)/i);
  assert.match(sql, /awarded even if the group as a whole does not win/i);
});
