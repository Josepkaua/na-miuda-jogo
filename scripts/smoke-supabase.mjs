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
const directMessages = await supabase.from("chat_messages").select("id").limit(1);
if (!directMessages.error) throw new Error("Direct chat table access should be blocked.");
const directDiscussionVotes = await supabase.from("discussion_votes").select("round_id").limit(1);
if (!directDiscussionVotes.error) throw new Error("Direct discussion-vote table access should be blocked.");

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

await rpc("send_chat_message", { p_code: code, p_session_token: tokens[0], p_body: "A sala abriu!" });
await rpc("send_chat_message", { p_code: code, p_session_token: tokens[1], p_body: "Cheguei para jogar." });
const lobbyChat = await rpc("list_chat_messages", { p_code: code, p_session_token: tokens[2], p_after_id: null });
if (lobbyChat.length !== 2 || lobbyChat[0].body !== "A sala abriu!" || lobbyChat.some((message) => message.is_me)) {
  throw new Error("Lobby chat synchronization failed.");
}
await expectRpcFailure(
  "list_chat_messages",
  { p_code: code, p_session_token: sessionToken(), p_after_id: null },
  "A non-player accessed the room chat.",
);

for (const token of tokens) {
  await rpc("set_player_ready", { p_code: code, p_session_token: token, p_ready: true });
}

await rpc("start_round", { p_code: code, p_session_token: tokens[0] });
await expectRpcFailure(
  "send_chat_message",
  { p_code: code, p_session_token: tokens[0], p_body: "Isto não pode aparecer." },
  "The chat accepted a message during role reveal.",
);
const snapshots = await Promise.all(tokens.map((token) => rpc("room_snapshot", { p_code: code, p_session_token: token })));
const roles = await Promise.all(tokens.map((token) => rpc("get_my_role", { p_code: code, p_session_token: token })));

if (roles.filter((role) => role.role === "impostor").length !== 1) throw new Error("Unexpected impostor count.");
if (roles.filter((role) => role.word).length !== 2) throw new Error("Secret visibility failed.");
if (roles.filter((role) => role.role === "impostor" && role.hint).length !== 1 || roles.some((role) => role.role !== "impostor" && role.hint)) throw new Error("Impostor hint visibility failed.");
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
await rpc("send_chat_message", { p_code: code, p_session_token: tokens[2], p_body: "Minha pista é bem brasileira." });
const discussionChat = await rpc("list_chat_messages", { p_code: code, p_session_token: tokens[0], p_after_id: lobbyChat.at(-1).id });
if (discussionChat.length !== 1 || discussionChat[0].nickname !== "Teste Davi" || discussionChat[0].body !== "Minha pista é bem brasileira.") {
  throw new Error("Discussion chat synchronization failed.");
}
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
let turnSnapshot = await rpc("room_snapshot", { p_code: code, p_session_token: tokens[0] });
while (turnSnapshot.discussion_stage === "turns") {
  await rpc("advance_discussion_turn", {
    p_code: code,
    p_session_token: tokens[0],
    p_expected_round: 1,
    p_expected_turn: turnSnapshot.discussion_turn_order,
  });
  turnSnapshot = await rpc("room_snapshot", { p_code: code, p_session_token: tokens[0] });
}
if (turnSnapshot.discussion_stage !== "decision" || turnSnapshot.discussion_turn_player_id !== null) throw new Error("Discussion turn flow did not open the group decision.");
await expectRpcFailure(
  "send_chat_message",
  { p_code: code, p_session_token: tokens[0], p_body: "Mensagem durante a decisão." },
  "The chat accepted a message during the group decision.",
);
await rpc("cast_discussion_choice", { p_code: code, p_session_token: tokens[0], p_choice: "more_time", p_expected_round: 1 });
await rpc("cast_discussion_choice", { p_code: code, p_session_token: tokens[1], p_choice: "more_time", p_expected_round: 1 });
const extraTimeSnapshot = await rpc("room_snapshot", { p_code: code, p_session_token: tokens[2] });
if (extraTimeSnapshot.discussion_stage !== "free_chat" || extraTimeSnapshot.discussion_vote_count !== 2 || extraTimeSnapshot.discussion_more_time_count !== 2) throw new Error("More-time majority did not reopen the chat.");
await rpc("send_chat_message", { p_code: code, p_session_token: tokens[2], p_body: "O tempo extra abriu." });
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
if (!result.players.some((player) => player.score > 0)) throw new Error("Round points were not added to the scoreboard.");

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
  chatMessages: lobbyChat.length + discussionChat.length,
  discussionDecision: extraTimeSnapshot.discussion_stage,
  impostorHint: Boolean(roles.find((role) => role.role === "impostor")?.hint),
  multipleImpostors: multiResult.winner,
}));
