import { createClient } from "@supabase/supabase-js";

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("Set TEST_SUPABASE_URL and TEST_SUPABASE_PUBLISHABLE_KEY.");
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tokens = [crypto.randomUUID().repeat(2), crypto.randomUUID().repeat(2), crypto.randomUUID().repeat(2)];

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

const created = await rpc("create_room", {
  p_nickname: "Teste Host",
  p_session_token: tokens[0],
  p_category: "comidas",
  p_player_limit: 6,
  p_impostor_count: 1,
  p_discussion_seconds: 120,
});

const code = created.code;
await rpc("join_room", { p_code: code, p_nickname: "Teste Bia", p_session_token: tokens[1] });
await rpc("join_room", { p_code: code, p_nickname: "Teste Davi", p_session_token: tokens[2] });

for (const token of tokens) {
  await rpc("set_player_ready", { p_code: code, p_session_token: token, p_ready: true });
}

await rpc("start_round", { p_code: code, p_session_token: tokens[0] });
const snapshots = await Promise.all(tokens.map((token) => rpc("room_snapshot", { p_code: code, p_session_token: token })));
const roles = await Promise.all(tokens.map((token) => rpc("get_my_role", { p_code: code, p_session_token: token })));

if (roles.filter((role) => role.role === "impostor").length !== 1) throw new Error("Unexpected impostor count.");
if (roles.filter((role) => role.word).length !== 2) throw new Error("Secret visibility failed.");

await rpc("advance_phase", { p_code: code, p_session_token: tokens[0] });
await rpc("advance_phase", { p_code: code, p_session_token: tokens[0] });

const playerIds = snapshots[0].players.map((player) => player.id);
for (let index = 0; index < tokens.length; index += 1) {
  const me = snapshots[index].players.find((player) => player.is_me);
  const target = playerIds.find((id) => id !== me.id);
  await rpc("cast_vote", { p_code: code, p_session_token: tokens[index], p_target_player_id: target });
}

await rpc("advance_phase", { p_code: code, p_session_token: tokens[0] });
const result = await rpc("room_snapshot", { p_code: code, p_session_token: tokens[0] });

if (result.phase !== "results" || !result.revealed_word || result.impostor_player_ids.length !== 1) {
  throw new Error("Result reveal failed.");
}

console.log(JSON.stringify({
  ok: true,
  roomCode: code,
  players: result.players.length,
  roles: roles.map((role) => role.role),
  result: result.winner,
}));
