import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps the round moving without host shortcuts", async () => {
  const [autoFlow, automaticCss, guard] = await Promise.all([
    read("app/game-auto-flow.tsx"),
    read("app/automatic-flow.css"),
    read("app/game-phase-guard.tsx"),
  ]);

  assert.match(autoFlow, /viram o papel/i);
  assert.match(autoFlow, /revealHostCardIfNeeded/);
  assert.match(autoFlow, /button\.click\(\)/);
  assert.match(automaticCss, /discussion-decision-trigger[\s\S]*display:\s*none\s*!important/);
  assert.match(automaticCss, /phase-voting[\s\S]*vote-actions > \.ghost-button[\s\S]*display:\s*none\s*!important/);
  assert.match(guard, /voting\.complete \|\| voting\.expired/);
  assert.match(guard, /revealButton\.click\(\)/);
});

test("does not trap voting when the timer expires with zero votes", async () => {
  const sql = await read("supabase/migrations/20260824041000_gameplay_scoring_and_hints.sql");

  assert.match(sql, /if vote_total > 0 and remaining_slots > 0 then/i);
  assert.doesNotMatch(sql, /if vote_total = 0 then\s+raise exception/i);
  assert.match(sql, /zero votes, nobody is eliminated and the active impostor wins/i);
});

test("keeps motion useful, responsive and accessible", async () => {
  const [motion, cinematic, polish] = await Promise.all([
    read("app/game-motion-controller.tsx"),
    read("app/cinematic-transitions.css"),
    read("app/game-polish.css"),
  ]);

  assert.match(motion, /syncDiscussionUrgency/);
  assert.match(motion, /syncVotingUrgency/);
  assert.match(motion, /navigator\.vibrate/);
  assert.match(cinematic, /cinematic-role-impostor/);
  assert.match(cinematic, /cinematic-group/);
  assert.match(cinematic, /prefers-reduced-motion:\s*reduce/);
  assert.match(polish, /vote-card\.selected/);
  assert.match(polish, /ready-bar i::after/);
});

test("warns remote players about connection loss and recovery", async () => {
  const [component, css] = await Promise.all([
    read("app/connection-status.tsx"),
    read("app/connection-status.css"),
  ]);

  assert.match(component, /Você está sem internet/);
  assert.match(component, /Conexão restabelecida/);
  assert.match(component, /addEventListener\("offline"/);
  assert.match(component, /addEventListener\("online"/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
