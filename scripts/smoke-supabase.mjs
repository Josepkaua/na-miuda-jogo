import { createClient } from "@supabase/supabase-js";

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("Set TEST_SUPABASE_URL and TEST_SUPABASE_PUBLISHABLE_KEY.");
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const directRooms = await supabase.from("rooms").select("id").limit(1);
if (!directRooms.error) throw new Error("Direct table access should be blocked.");

function sessionToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const tokens = [sessionToken(), sessionToken(), sessionToken()];

await expectRpcFailure(
  "create_room",
  {
    p_nickname: "Token curto",
    p_session_token: "123",
    p_category: "comidas",
    p_player_limit: 3,
    p_impostor_count: 1,
    p_discussion_seconds: 120,
  },
  "An invalid session token was accepted.",
);

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function expectRpcFailure(name, params, message) {
  const { error } = await supabase.rpc(name, params);
  if (!error) throw new Error(message);
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
if (new Set(roles.map((role) => role.turn_order)).size !== tokens.length) throw new Error("Turn order is not unique.");
if (snapshots.some((snapshot) => snapshot.has_voted || snapshot.eligible_voter_count !== tokens.length)) throw new Error("Initial voting state failed.");

await expectRpcFailure(
  "advance_phase",
  { p_code: code, p_session_token: tokens[0], p_expected_phase: "reveal", p_expected_round: 1 },
  "Discussion started before every active player revealed a role.",
);

for (const token of tokens) {
  await rpc("acknowledge_role", { p_code: code, p_session_token: token, p_expected_round: 1 });
}
const revealSnapshot = await rpc("room_snapshot", { p_code: code, p_session_token: tokens[0] });
if (revealSnapshot.roles_seen_count !== tokens.length || revealSnapshot.round_player_count !== tokens.length) throw new Error("Role reveal acknowledgement failed.");

await rpc("advance_phase", { p_code: code, p_session_token: tokens[0], p_expected_phase: "reveal", p_expected_round: 1 });
await expectRpcFailure(
  "advance_phase",
  { p_code: code, p_session_token: tokens[0], p_expected_phase: "reveal", p_expected_round: 1 },
  "A duplicated phase transition was accepted.",
);
await expectRpcFailure(
  "advance_phase",
  { p_code: code, p_session_token: tokens[0] },
  "The obsolete two-argument phase transition is still callable.",
);
await rpc("advance_phase", { p_code: code, p_session_token: tokens[0], p_expected_phase: "discussion", p_expected_round: 1 });

const playerIds = snapshots[0].players.map((player) => player.id);
for (let index = 0; index < tokens.length; index += 1) {
  const me = snapshots[index].players.find((player) => player.is_me);
  const target = playerIds.find((id) => id !== me.id);
  await rpc("cast_vote", { p_code: code, p_session_token: tokens[index], p_target_player_id: target });
}

const votedSnapshots = await Promise.all(tokens.map((token) => rpc("room_snapshot", { p_code: code, p_session_token: token })));
if (votedSnapshots.some((snapshot) => !snapshot.has_voted || snapshot.vote_count !== tokens.length)) throw new Error("Vote confirmation state failed.");

await rpc("advance_phase", { p_code: code, p_session_token: tokens[0], p_expected_phase: "voting", p_expected_round: 1 });
const result = await rpc("room_snapshot", { p_code: code, p_session_token: tokens[0] });

if (result.phase !== "results" || !result.revealed_word || result.impostor_player_ids.length !== 1) {
  throw new Error("Result reveal failed.");
}

await rpc("advance_phase", { p_code: code, p_session_token: tokens[0], p_expected_phase: "results", p_expected_round: 1 });
await rpc("leave_room", { p_code: code, p_session_token: tokens[0] });
const afterHostExit = await rpc("room_snapshot", { p_code: code, p_session_token: tokens[1] });
const newHost = afterHostExit.players.find((player) => player.is_host);
if (!newHost || !newHost.is_me) throw new Error("Host transfer after leaving failed.");
await expectRpcFailure(
  "room_snapshot",
  { p_code: code, p_session_token: tokens[0] },
  "A player who left the room remained authorized.",
);

const multiTokens = Array.from({ length: 7 }, () => sessionToken());
const multiRoom = await rpc("create_room", {
  p_nickname: "Multi 1",
  p_session_token: multiTokens[0],
  p_category: "misturado",
  p_player_limit: 7,
  p_impostor_count: 2,
  p_discussion_seconds: 120,
});
await Promise.all(multiTokens.slice(1).map((token, index) => rpc("join_room", {
  p_code: multiRoom.code,
  p_nickname: `Multi ${index + 2}`,
  p_session_token: token,
})));
await Promise.all(multiTokens.map((token) => rpc("set_player_ready", { p_code: multiRoom.code, p_session_token: token, p_ready: true })));
await rpc("start_round", { p_code: multiRoom.code, p_session_token: multiTokens[0] });
const multiSnapshots = await Promise.all(multiTokens.map((token) => rpc("room_snapshot", { p_code: multiRoom.code, p_session_token: token })));
const multiRoles = await Promise.all(multiTokens.map((token) => rpc("get_my_role", { p_code: multiRoom.code, p_session_token: token })));
if (multiRoles.filter((role) => role.role === "impostor").length !== 2) throw new Error("Multiple-impostor assignment failed.");
if (multiRoles.filter((role) => role.word).length !== 5) throw new Error("Multiple-impostor secret visibility failed.");
await Promise.all(multiTokens.map((token) => rpc("acknowledge_role", { p_code: multiRoom.code, p_session_token: token, p_expected_round: 1 })));
await rpc("advance_phase", { p_code: multiRoom.code, p_session_token: multiTokens[0], p_expected_phase: "reveal", p_expected_round: 1 });
await rpc("advance_phase", { p_code: multiRoom.code, p_session_token: multiTokens[0], p_expected_phase: "discussion", p_expected_round: 1 });
const multiImpostorIds = multiRoles
  .map((role, index) => role.role === "impostor" ? multiSnapshots[index].players.find((player) => player.is_me).id : null)
  .filter(Boolean);
await Promise.all(multiTokens.map((token, index) => {
  const meId = multiSnapshots[index].players.find((player) => player.is_me).id;
  const target = multiImpostorIds.find((playerId) => playerId !== meId);
  return rpc("cast_vote", { p_code: multiRoom.code, p_session_token: token, p_target_player_id: target });
}));
await rpc("advance_phase", { p_code: multiRoom.code, p_session_token: multiTokens[0], p_expected_phase: "voting", p_expected_round: 1 });
const multiResult = await rpc("room_snapshot", { p_code: multiRoom.code, p_session_token: multiTokens[0] });
if (multiResult.winner !== "group" || multiResult.impostor_player_ids.length !== 2 || multiResult.eliminated_player_ids.length !== 2) {
  throw new Error("Multiple-impostor result calculation failed.");
}

console.log(JSON.stringify({
  ok: true,
  roomCode: code,
  players: result.players.length,
  roles: roles.map((role) => role.role),
  result: result.winner,
  hostTransfer: newHost.nickname,
  multipleImpostors: multiResult.winner,
}));
