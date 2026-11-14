import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("majority vote can skip the discussion straight to voting", async () => {
  const [sql, page] = await Promise.all([read("supabase/migrations/20261113120000_skip_vote_and_kick.sql"), read("app/page.tsx")]);

  assert.match(sql, /create or replace function public\.vote_skip_discussion/);
  assert.match(sql, /skip_count > eligible_count \/ 2/);
  assert.match(sql, /insert into public\.discussion_votes[\s\S]*'voting'/);
  assert.match(sql, /'discussion_skip_count', skip_votes/);
  assert.match(page, /callAction\("vote_skip_discussion"/);
  assert.match(page, /className=\{`skip-vote/);
});

test("host can remove a player only until the round ends", async () => {
  const [sql, page] = await Promise.all([read("supabase/migrations/20261113120000_skip_vote_and_kick.sql"), read("app/page.tsx")]);

  assert.match(sql, /create or replace function public\.kick_player/);
  assert.match(sql, /host_player_id is distinct from caller_id/);
  assert.match(sql, /kicked_at is not null and target_room\.phase <> 'lobby'/);
  assert.match(sql, /left_at = null, kicked_at = null/);
  assert.match(page, /callAction\("kick_player"/);
  assert.match(page, /isHost && !player\.isMe && <button type="button" className=\{`kick-button/);
});

test("players panel is ordered by score", async () => {
  const page = await read("app/page.tsx");

  assert.match(page, /const rankedPlayers = \[\.\.\.\(snapshot\?\.players \?\? \[\]\)\]\.sort\(\(a, b\) => b\.score - a\.score\)/);
  assert.match(page, /rankedPlayers\.map\(\(player, index\)/);
});
