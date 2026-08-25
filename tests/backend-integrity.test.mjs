import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260825231000_enforce_automatic_phase_integrity.sql", import.meta.url);

test("makes automatic phase rules database invariants", async () => {
  const sql = await readFile(migrationUrl, "utf8");

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
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /drop function if exists public\.advance_phase\(text, text\)/);
  assert.match(sql, /drop function if exists public\.open_discussion_decision\(text, text, integer\)/);
  assert.doesNotMatch(sql, /public\.discussion_stage/);
});
