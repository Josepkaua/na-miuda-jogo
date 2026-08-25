import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const integrityUrl = new URL("../supabase/migrations/20260825231000_enforce_automatic_phase_integrity.sql", import.meta.url);
const hostTransferUrl = new URL("../supabase/migrations/20260825231100_safe_host_transfer_on_leave.sql", import.meta.url);

test("makes automatic phase rules database invariants", async () => {
  const sql = await readFile(integrityUrl, "utf8");

  assert.match(sql, /create or replace function private\.enforce_automatic_phase_integrity/);
  assert.match(sql, /before update of phase on public\.rooms/);
  assert.match(sql, /rr\.revealed_at is null/);
  assert.match(sql, /Aguarde todos os jogadores ativos verem o papel/);
  assert.match(sql, /new\.discussion_stage is distinct from 'resolved'/);
  assert.match(sql, /A votação começa somente pela decisão coletiva da turma/);
  assert.match(sql, /public\.discussion_votes/);
  assert.match(sql, /Aguarde todos votarem ou o tempo da votação terminar/);
});

test("removes obsolete manual phase APIs from the database surface", async () => {
  const sql = await readFile(integrityUrl, "utf8");

  assert.match(sql, /drop function if exists public\.advance_phase\(text, text\)/);
  assert.match(sql, /drop function if exists public\.open_discussion_decision\(text, text, integer\)/);
  assert.doesNotMatch(sql, /public\.discussion_stage/);
});

test("only transfers host ownership to an actually active player", async () => {
  const sql = await readFile(hostTransferUrl, "utf8");

  assert.match(sql, /create or replace function public\.leave_room/);
  assert.match(sql, /last_seen_at <= now\(\) - interval '75 seconds'/);
  assert.match(sql, /and last_seen_at > now\(\) - interval '75 seconds'/);
  assert.match(sql, /order by last_seen_at desc, joined_at/);
  assert.match(sql, /set host_player_id = replacement_host/);
  assert.match(sql, /grant execute on function public\.leave_room\(text, text\) to anon, authenticated/);
});
