"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getSupabaseClient, hasRemoteBackend } from "../lib/supabase";

type ThemeMode = "system" | "light" | "dark";
type EntryMode = "create" | "join";
type Phase = "lobby" | "reveal" | "discussion" | "voting" | "results";
type Role = "player" | "impostor";
type DiscussionStage = "turns" | "decision" | "free_chat" | "resolved";
type DiscussionChoice = "more_time" | "voting";

type Player = {
  id: string;
  nickname: string;
  isMe: boolean;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  score: number;
};

type Snapshot = {
  roomId: string;
  code: string;
  phase: Phase;
  category: string;
  playerLimit: number;
  impostorCount: number;
  discussionSeconds: number;
  roundNumber: number;
  phaseEndsAt: string | null;
  serverNow: string | null;
  voteCount: number;
  hasVoted: boolean;
  eligibleVoterCount: number;
  rolesSeenCount: number;
  roundPlayerCount: number;
  discussionStage: DiscussionStage;
  discussionTurnOrder: number | null;
  discussionTurnPlayerId: string | null;
  discussionVoteCount: number;
  discussionMoreTimeCount: number;
  discussionGoVotingCount: number;
  hasDiscussionVoted: boolean;
  discussionVoteChoice: DiscussionChoice | null;
  revealedWord: string | null;
  eliminatedPlayerIds: string[];
  impostorPlayerIds: string[];
  winner: "group" | "impostor" | null;
  players: Player[];
};

type RoleInfo = { role: Role; word: string | null; category: string; hint: string | null; roomId: string; roundNumber: number };

type ChatMessage = {
  id: number;
  playerId: string;
  nickname: string;
  body: string;
  createdAt: string;
  isMe: boolean;
};

const categories = [
  { id: "paises", label: "Países", icon: "🌎", hint: "culturas e lugares do mundo" },
  { id: "comidas", label: "Comidas", icon: "🍕", hint: "pratos, bebidas e ingredientes" },
  { id: "brasil", label: "Brasil", icon: "🇧🇷", hint: "lugares, costumes e cultura" },
  { id: "futebol", label: "Futebol", icon: "⚽", hint: "jogadores, clubes e estádio" },
  { id: "filmes", label: "Filmes e séries", icon: "🎬", hint: "personagens, histórias e telas" },
  { id: "profissoes", label: "Profissões", icon: "🧑‍🔧", hint: "trabalhos e ferramentas" },
  { id: "animais", label: "Animais", icon: "🦜", hint: "do quintal à floresta" },
  { id: "musica", label: "Música", icon: "🎵", hint: "artistas, ritmos e instrumentos" },
  { id: "games", label: "Games", icon: "🎮", hint: "jogos, consoles e personagens" },
  { id: "objetos", label: "Objetos", icon: "💡", hint: "coisas do dia a dia" },
  { id: "internet", label: "Internet", icon: "📱", hint: "memes, apps e redes" },
  { id: "misturado", label: "Tudo misturado", icon: "🎲", hint: "uma surpresa a cada rodada" },
];

const demoNames = ["Bia", "Davi", "Luna", "João", "Malu", "Caio", "Nina"];
const phaseLabels: Record<Phase, string> = {
  lobby: "Sala de espera",
  reveal: "Papel secreto",
  discussion: "Hora das pistas",
  voting: "Votação secreta",
  results: "Resultado da rodada",
};

const phaseSteps: Array<{ id: Phase; short: string; icon: string }> = [
  { id: "lobby", short: "Reunir", icon: "⌂" },
  { id: "reveal", short: "Segredo", icon: "◉" },
  { id: "discussion", short: "Investigar", icon: "?" },
  { id: "voting", short: "Acusar", icon: "!" },
  { id: "results", short: "Revelar", icon: "✦" },
];

function recommendationFor(players: number) {
  if (players <= 5) return { impostors: 1, seconds: 120, label: "Rápida e direta" };
  if (players <= 8) return { impostors: 1, seconds: 180, label: "Equilibrada para o grupo" };
  if (players <= 12) return { impostors: 2, seconds: 240, label: "Mais blefe, mais debate" };
  return { impostors: 3, seconds: 300, label: "Caos organizado" };
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getSessionToken() {
  const existing = localStorage.getItem("na-miuda-session");
  if (existing) return existing;
  const created = randomToken();
  localStorage.setItem("na-miuda-session", created);
  return created;
}

function normalizeSnapshot(value: Record<string, unknown>): Snapshot {
  const players = (value.players ?? []) as Array<Record<string, unknown>>;
  return {
    roomId: String(value.room_id ?? ""),
    code: String(value.code ?? ""),
    phase: (value.phase as Phase) ?? "lobby",
    category: String(value.category ?? "misturado"),
    playerLimit: Number(value.player_limit ?? 8),
    impostorCount: Number(value.impostor_count ?? 1),
    discussionSeconds: Number(value.discussion_seconds ?? 180),
    roundNumber: Number(value.round_number ?? 0),
    phaseEndsAt: value.phase_ends_at ? String(value.phase_ends_at) : null,
    serverNow: value.server_now ? String(value.server_now) : null,
    voteCount: Number(value.vote_count ?? 0),
    hasVoted: Boolean(value.has_voted),
    eligibleVoterCount: Number(value.eligible_voter_count ?? players.length),
    rolesSeenCount: Number(value.roles_seen_count ?? 0),
    roundPlayerCount: Number(value.round_player_count ?? players.length),
    discussionStage: (value.discussion_stage as DiscussionStage) ?? "free_chat",
    discussionTurnOrder: value.discussion_turn_order === null || value.discussion_turn_order === undefined ? null : Number(value.discussion_turn_order),
    discussionTurnPlayerId: value.discussion_turn_player_id ? String(value.discussion_turn_player_id) : null,
    discussionVoteCount: Number(value.discussion_vote_count ?? 0),
    discussionMoreTimeCount: Number(value.discussion_more_time_count ?? 0),
    discussionGoVotingCount: Number(value.discussion_go_voting_count ?? 0),
    hasDiscussionVoted: Boolean(value.has_discussion_voted),
    discussionVoteChoice: value.discussion_vote_choice === "more_time" || value.discussion_vote_choice === "voting" ? value.discussion_vote_choice : null,
    revealedWord: value.revealed_word ? String(value.revealed_word) : null,
    eliminatedPlayerIds: Array.isArray(value.eliminated_player_ids) ? value.eliminated_player_ids.map(String) : [],
    impostorPlayerIds: Array.isArray(value.impostor_player_ids) ? value.impostor_player_ids.map(String) : [],
    winner: (value.winner as Snapshot["winner"]) ?? null,
    players: players.map((player) => ({
      id: String(player.id), nickname: String(player.nickname), isMe: Boolean(player.is_me),
      isHost: Boolean(player.is_host), isReady: Boolean(player.is_ready),
      isOnline: Boolean(player.is_online), score: Number(player.score ?? 0),
    })),
  };
}

function normalizeChatMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.map((message) => {
    const item = message as Record<string, unknown>;
    return {
      id: Number(item.id),
      playerId: String(item.player_id ?? ""),
      nickname: String(item.nickname ?? "Jogador"),
      body: String(item.body ?? ""),
      createdAt: String(item.created_at ?? new Date().toISOString()),
      isMe: Boolean(item.is_me),
    };
  }).filter((message) => Number.isFinite(message.id) && message.body.length > 0);
}

function makeDemoSnapshot(nickname: string, limit: number, category: string, seconds: number, impostors: number): Snapshot {
  const total = Math.min(Math.max(4, limit), 8);
  const players: Player[] = [
    { id: "me", nickname, isMe: true, isHost: true, isReady: false, isOnline: true, score: 0 },
    ...demoNames.slice(0, total - 1).map((name) => ({ id: name.toLowerCase(), nickname: name, isMe: false, isHost: false, isReady: true, isOnline: true, score: 0 })),
  ];
  return {
    roomId: "demo-room", code: "JOGAR", phase: "lobby", category,
    playerLimit: limit, impostorCount: Math.min(impostors, Math.max(1, total - 2)),
    discussionSeconds: seconds, roundNumber: 0, phaseEndsAt: null, serverNow: null, voteCount: 0, hasVoted: false, eligibleVoterCount: players.length, rolesSeenCount: 0, roundPlayerCount: players.length,
    discussionStage: "free_chat", discussionTurnOrder: null, discussionTurnPlayerId: null, discussionVoteCount: 0, discussionMoreTimeCount: 0, discussionGoVotingCount: 0, hasDiscussionVoted: false, discussionVoteChoice: null,
    revealedWord: null, eliminatedPlayerIds: [], impostorPlayerIds: [], winner: null, players,
  };
}

export default function Home() {
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [entryMode, setEntryMode] = useState<EntryMode>("create");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [category, setCategory] = useState("misturado");
  const [playerLimit, setPlayerLimit] = useState(8);
  const [impostorCount, setImpostorCount] = useState(1);
  const [discussionSeconds, setDiscussionSeconds] = useState(180);
  const [showSuggestion, setShowSuggestion] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [roleVisible, setRoleVisible] = useState(false);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const latestSnapshotRequest = useRef(0);
  const latestRoleRequest = useRef(0);
  const latestChatRequest = useRef(0);
  const lastSnapshotPhase = useRef<Phase | null>(null);
  const activeRoomCode = useRef<string | null>(null);
  const profileRequest = useRef(0);
  const lastChatId = useRef<number | null>(null);
  const chatScroll = useRef<HTMLDivElement>(null);
  const shouldAutoScrollChat = useRef(true);

  const remoteEnabled = hasRemoteBackend();
  const me = snapshot?.players.find((player) => player.isMe);
  const isHost = Boolean(me?.isHost);
  const currentRoleInfo = roleInfo?.roomId === snapshot?.roomId && roleInfo?.roundNumber === snapshot?.roundNumber ? roleInfo : null;
  const readyCount = snapshot?.players.filter((player) => player.isOnline && player.isReady).length ?? 0;
  const onlineCount = snapshot?.players.filter((player) => player.isOnline).length ?? 0;
  const leaderScore = Math.max(0, ...(snapshot?.players.map((player) => player.score) ?? [0]));
  const roomCode = snapshot?.code;
  const suggestion = recommendationFor(playerLimit);
  const maxImpostors = Math.max(1, Math.min(5, Math.floor((playerLimit - 1) / 3)));
  const activeCategory = snapshot && snapshot.phase !== "lobby" && currentRoleInfo?.category
    ? currentRoleInfo.category
    : snapshot?.category ?? category;
  const selectedCategory = categories.find((item) => item.id === activeCategory) ?? categories.at(-1)!;
  const roleCategory = categories.find((item) => item.id === currentRoleInfo?.category) ?? selectedCategory;
  const secondsLeft = snapshot?.phaseEndsAt && now
    ? Math.max(0, Math.ceil((new Date(snapshot.phaseEndsAt).getTime() - (now + clockOffsetMs)) / 1000))
    : null;

  useEffect(() => {
    const storedTheme = (localStorage.getItem("na-miuda-theme") as ThemeMode | null) ?? "system";
    document.documentElement.dataset.theme = storedTheme;
    const code = new URLSearchParams(window.location.search).get("sala");
    const storedName = localStorage.getItem("na-miuda-nickname");
    const frame = window.requestAnimationFrame(() => {
      setTheme(storedTheme);
      if (code) setJoinCode(code.toUpperCase().slice(0, 6));
      if (storedName) setNickname(storedName);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!remoteEnabled) return;
    const requestNumber = ++profileRequest.current;
    void (async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || requestNumber !== profileRequest.current) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, preferred_theme")
        .eq("user_id", user.id)
        .maybeSingle();
      if (requestNumber !== profileRequest.current) return;
      const savedName = profile?.display_name?.trim();
      const savedTheme = profile?.preferred_theme as ThemeMode | undefined;
      if (savedName) setNickname(savedName);
      if (savedTheme && ["system", "light", "dark"].includes(savedTheme)) setTheme(savedTheme);
      if (user.email) setEmail(user.email);
    })();
    return () => { profileRequest.current += 1; };
  }, [remoteEnabled]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("na-miuda-theme", theme);
  }, [theme]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const loadSnapshot = useCallback(async (code: string, silent = false) => {
    if (activeRoomCode.current !== code) return;
    const requestNumber = ++latestSnapshotRequest.current;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error: rpcError } = await supabase.rpc("room_snapshot", { p_code: code, p_session_token: getSessionToken() });
    if (requestNumber !== latestSnapshotRequest.current || activeRoomCode.current !== code) return;
    if (rpcError) {
      if (/não faz parte desta sala/i.test(rpcError.message)) {
        activeRoomCode.current = null;
        latestSnapshotRequest.current += 1;
        latestRoleRequest.current += 1;
        latestChatRequest.current += 1;
        lastSnapshotPhase.current = null;
        lastChatId.current = null;
        setJoinCode(code);
        setEntryMode("join");
        setSnapshot(null);
        setRoleInfo(null);
        setRoleVisible(false);
        setSelectedVote(null);
        setChatMessages([]);
        setChatDraft("");
        setUnreadChat(0);
        window.history.replaceState({}, "", window.location.pathname);
        setError("Você ficou offline por mais de 75 segundos e saiu da sala. Entre novamente com o mesmo código.");
        return;
      }
      if (!silent) setError(rpcError.message);
      return;
    }
    if (data) {
      const normalized = normalizeSnapshot(data as Record<string, unknown>);
      if (lastSnapshotPhase.current && lastSnapshotPhase.current !== normalized.phase) setRoleVisible(false);
      lastSnapshotPhase.current = normalized.phase;
      if (normalized.serverNow) setClockOffsetMs(new Date(normalized.serverNow).getTime() - Date.now());
      setSnapshot(normalized);
    }
  }, []);

  const loadChatMessages = useCallback(async (code: string, silent = false) => {
    if (activeRoomCode.current !== code) return;
    const requestNumber = ++latestChatRequest.current;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const afterId = lastChatId.current;
    const { data, error: rpcError } = await supabase.rpc("list_chat_messages", {
      p_code: code,
      p_session_token: getSessionToken(),
      p_after_id: afterId,
    });
    if (requestNumber !== latestChatRequest.current || activeRoomCode.current !== code) return;
    if (rpcError) {
      if (!silent) setError("Não foi possível carregar o chat agora.");
      setChatLoading(false);
      return;
    }
    const incoming = normalizeChatMessages(data);
    if (incoming.length) {
      lastChatId.current = Math.max(afterId ?? 0, ...incoming.map((message) => message.id));
      setChatMessages((current) => {
        const known = new Set(current.map((message) => message.id));
        return [...current, ...incoming.filter((message) => !known.has(message.id))].sort((a, b) => a.id - b.id).slice(-120);
      });
      if (!shouldAutoScrollChat.current) {
        const newFromOthers = incoming.filter((message) => !message.isMe).length;
        if (newFromOthers) setUnreadChat((current) => current + newFromOthers);
      }
    }
    setChatLoading(false);
  }, []);

  useEffect(() => {
    if (!roomCode || demoMode || !remoteEnabled) return;
    let cancelled = false;
    let timeout: number;
    const poll = async () => {
      await loadSnapshot(roomCode, true);
      if (!cancelled) timeout = window.setTimeout(() => void poll(), 1800);
    };
    timeout = window.setTimeout(() => void poll(), 1800);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [demoMode, loadSnapshot, remoteEnabled, roomCode]);

  useEffect(() => {
    if (!roomCode || demoMode || !remoteEnabled) return;
    let cancelled = false;
    let timeout: number;
    shouldAutoScrollChat.current = true;
    const poll = async () => {
      await loadChatMessages(roomCode, true);
      if (!cancelled) timeout = window.setTimeout(() => void poll(), 1400);
    };
    void poll();
    return () => {
      cancelled = true;
      latestChatRequest.current += 1;
      window.clearTimeout(timeout);
    };
  }, [demoMode, loadChatMessages, remoteEnabled, roomCode]);

  useEffect(() => {
    if (!shouldAutoScrollChat.current) return;
    const frame = window.requestAnimationFrame(() => {
      chatScroll.current?.scrollTo({ top: chatScroll.current.scrollHeight, behavior: "smooth" });
      setUnreadChat(0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chatMessages]);

  useEffect(() => {
    if (!roomCode || demoMode || !remoteEnabled) return;
    const heartbeat = async () => {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.rpc("heartbeat_room", { p_code: roomCode, p_session_token: getSessionToken() });
    };
    const heartbeatWhenVisible = () => { if (document.visibilityState === "visible") void heartbeat(); };
    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), 12000);
    document.addEventListener("visibilitychange", heartbeatWhenVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", heartbeatWhenVisible); };
  }, [demoMode, remoteEnabled, roomCode]);

  useEffect(() => {
    if (!snapshot || demoMode || !remoteEnabled || snapshot.phase === "lobby" || snapshot.phase === "results" || currentRoleInfo) return;
    const roleRequestNumber = ++latestRoleRequest.current;
    void (async () => {
      const supabase = getSupabaseClient();
      const { data, error: roleError } = await supabase!.rpc("get_my_role", { p_code: snapshot.code, p_session_token: getSessionToken() });
      if (roleRequestNumber !== latestRoleRequest.current || activeRoomCode.current !== snapshot.code) return;
      if (roleError) { setError("Não foi possível carregar seu papel. Tentando novamente..."); return; }
      if (data) {
        const value = data as Record<string, unknown>;
        setError("");
        setRoleVisible(false);
        setSelectedVote(null);
        setRoleInfo({ role: value.role === "impostor" ? "impostor" : "player", word: value.word ? String(value.word) : null, category: String(value.category ?? snapshot.category), hint: value.hint ? String(value.hint) : null, roomId: snapshot.roomId, roundNumber: snapshot.roundNumber });
      }
    })();
  }, [currentRoleInfo, demoMode, remoteEnabled, snapshot]);

  const updateProfile = useCallback(async (changes: { display_name?: string; preferred_theme?: ThemeMode }) => {
    if (!remoteEnabled) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update(changes).eq("user_id", user.id);
  }, [remoteEnabled]);
  const closeRules = useCallback(() => setShowRules(false), []);

  function validateName() {
    const value = nickname.trim().replace(/\s+/g, " ");
    if (value.length < 2) { setError("Digite um apelido com pelo menos 2 letras."); return null; }
    if (value.length > 20) { setError("O apelido pode ter no máximo 20 caracteres."); return null; }
    localStorage.setItem("na-miuda-nickname", value);
    setNickname(value); setError(""); void updateProfile({ display_name: value }); return value;
  }

  function prepareChatForRoom() {
    latestChatRequest.current += 1;
    lastChatId.current = null;
    shouldAutoScrollChat.current = true;
    setChatMessages([]);
    setChatDraft("");
    setUnreadChat(0);
    setChatLoading(remoteEnabled);
  }

  async function createRoom() {
    const validName = validateName(); if (!validName) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!remoteEnabled) {
        prepareChatForRoom();
        setDemoMode(true);
        setSnapshot(makeDemoSnapshot(validName, playerLimit, category, discussionSeconds, impostorCount));
        setNotice("Demonstração aberta com jogadores simulados.");
        return;
      }
      const supabase = getSupabaseClient();
      const { data, error: rpcError } = await supabase!.rpc("create_room", {
        p_nickname: validName, p_session_token: getSessionToken(), p_category: category,
        p_player_limit: playerLimit, p_impostor_count: impostorCount, p_discussion_seconds: discussionSeconds,
      });
      if (rpcError) throw rpcError;
      const code = String((data as Record<string, unknown>).code);
      prepareChatForRoom();
      activeRoomCode.current = code;
      window.history.replaceState({}, "", `?sala=${code}`);
      await loadSnapshot(code);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível criar a sala."); }
    finally { setBusy(false); }
  }

  async function joinRoom() {
    const validName = validateName(); const code = joinCode.trim().toUpperCase();
    if (!validName) return;
    if (code.length !== 6) { setError("O código da sala precisa ter 6 caracteres."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      if (!remoteEnabled) {
        prepareChatForRoom(); setDemoMode(true); setSnapshot(makeDemoSnapshot(validName, playerLimit, category, discussionSeconds, impostorCount));
        setNotice("A conexão remota está sendo preparada; você entrou na demonstração."); return;
      }
      const supabase = getSupabaseClient();
      const { error: rpcError } = await supabase!.rpc("join_room", { p_code: code, p_nickname: validName, p_session_token: getSessionToken() });
      if (rpcError) throw rpcError;
      prepareChatForRoom();
      activeRoomCode.current = code;
      window.history.replaceState({}, "", `?sala=${code}`); await loadSnapshot(code);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível entrar na sala."); }
    finally { setBusy(false); }
  }

  async function saveProfileByEmail() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@gmail\.com$/i.test(normalizedEmail)) { setError("Digite um endereço Gmail válido."); return; }
    if (!remoteEnabled) { setNotice("O perfil com Gmail será liberado junto com o banco online."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const supabase = getSupabaseClient();
      const { error: authError } = await supabase!.auth.signInWithOtp({ email: normalizedEmail, options: { emailRedirectTo: window.location.origin, data: { full_name: nickname.trim() || undefined } } });
      if (authError) setError(authError.message); else setNotice("Enviamos um link seguro para seu Gmail. Abra-o para salvar o perfil.");
    } catch {
      setError("Não foi possível enviar o link agora. Tente novamente em instantes.");
    } finally { setBusy(false); }
  }

  async function callAction(name: string, extra: Record<string, unknown> = {}) {
    if (!snapshot) return false; setBusy(true); setError("");
    const actionRoomCode = snapshot.code;
    try {
      const supabase = getSupabaseClient();
      const { error: rpcError } = await supabase!.rpc(name, { p_code: actionRoomCode, p_session_token: getSessionToken(), ...extra });
      if (rpcError) throw rpcError;
      if (activeRoomCode.current !== actionRoomCode) return false;
      await loadSnapshot(actionRoomCode); return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A ação não foi concluída."); return false; }
    finally { setBusy(false); }
  }

  async function toggleReady() {
    if (!snapshot || !me) return;
    if (demoMode) { setSnapshot({ ...snapshot, players: snapshot.players.map((player) => player.isMe ? { ...player, isReady: !player.isReady } : player) }); return; }
    await callAction("set_player_ready", { p_ready: !me.isReady });
  }

  async function startRound() {
    if (!snapshot) return;
    if (demoMode) {
      const shuffled = [...snapshot.players].sort(() => Math.random() - .5);
      const impostors = shuffled.slice(0, snapshot.impostorCount).map((player) => player.id);
      const meIsImpostor = impostors.includes(me?.id ?? "");
      setRoleInfo({ role: meIsImpostor ? "impostor" : "player", word: meIsImpostor ? null : "Coxinha", category: "comidas", hint: meIsImpostor ? "É algo associado a lanches, festas e momentos descontraídos." : null, roomId: snapshot.roomId, roundNumber: snapshot.roundNumber + 1 });
      setRoleVisible(false);
      setSnapshot({ ...snapshot, phase: "reveal", roundNumber: snapshot.roundNumber + 1, impostorPlayerIds: impostors, revealedWord: null, eliminatedPlayerIds: [], winner: null, voteCount: 0, hasVoted: false, rolesSeenCount: snapshot.players.length, roundPlayerCount: snapshot.players.length, discussionStage: "free_chat", discussionTurnOrder: null, discussionTurnPlayerId: null, discussionVoteCount: 0, discussionMoreTimeCount: 0, discussionGoVotingCount: 0, hasDiscussionVoted: false, discussionVoteChoice: null });
      return;
    }
    setRoleInfo(null); setRoleVisible(false); await callAction("start_round");
  }

  async function advancePhase() {
    if (!snapshot) return;
    if (demoMode) {
      if (snapshot.phase === "reveal") setSnapshot({ ...snapshot, phase: "discussion", phaseEndsAt: new Date(Date.now() + snapshot.discussionSeconds * 1000).toISOString() });
      else if (snapshot.phase === "discussion") setSnapshot({ ...snapshot, phase: "voting", phaseEndsAt: null });
      else if (snapshot.phase === "voting") {
        const eliminated = roleInfo?.role === "impostor" ? [me?.id ?? "me"] : [selectedVote ?? snapshot.players[1].id];
        const caught = snapshot.impostorPlayerIds.every((id) => eliminated.includes(id));
        const players = snapshot.players.map((player) => ({
          ...player,
          score: player.score + (caught ? snapshot.impostorPlayerIds.includes(player.id) ? 0 : 1 : snapshot.impostorPlayerIds.includes(player.id) ? 2 : 0),
        }));
        setSnapshot({ ...snapshot, phase: "results", eliminatedPlayerIds: eliminated, revealedWord: "Coxinha", winner: caught ? "group" : "impostor", voteCount: snapshot.players.length, hasVoted: true, players });
      } else {
        setRoleInfo(null); setRoleVisible(false); setSelectedVote(null);
        setSnapshot({ ...snapshot, phase: "lobby", phaseEndsAt: null, players: snapshot.players.map((player) => ({ ...player, isReady: !player.isMe })) });
      }
      return;
    }
    if (snapshot.phase === "reveal") setRoleVisible(false);
    await callAction("advance_phase", { p_expected_phase: snapshot.phase, p_expected_round: snapshot.roundNumber });
  }

  async function castVote() {
    if (!selectedVote || !snapshot) return;
    if (demoMode) { setSnapshot({ ...snapshot, voteCount: snapshot.voteCount + 1, hasVoted: true }); setNotice("Voto confirmado e mantido em segredo."); return; }
    const succeeded = await callAction("cast_vote", { p_target_player_id: selectedVote });
    if (succeeded) setNotice("Voto confirmado e mantido em segredo.");
  }

  async function castDiscussionChoice(choice: DiscussionChoice) {
    const initialDiscussionEnded = snapshot?.phase === "discussion"
      && (snapshot.discussionStage === "free_chat" || snapshot.discussionStage === "turns")
      && snapshot.discussionVoteCount === 0
      && secondsLeft === 0;
    if (!snapshot || snapshot.phase !== "discussion" || snapshot.discussionStage !== "decision" && !initialDiscussionEnded || snapshot.hasDiscussionVoted) return;
    if (demoMode) {
      const majority = Math.floor(snapshot.eligibleVoterCount / 2) + 1;
      if (choice === "more_time") {
        setSnapshot({ ...snapshot, discussionStage: "free_chat", discussionVoteCount: majority, discussionMoreTimeCount: majority, hasDiscussionVoted: true, discussionVoteChoice: choice, phaseEndsAt: new Date(Date.now() + 60_000).toISOString() });
      } else {
        setSnapshot({ ...snapshot, phase: "voting", discussionStage: "resolved", discussionVoteCount: majority, discussionGoVotingCount: majority, hasDiscussionVoted: true, discussionVoteChoice: choice, phaseEndsAt: new Date(Date.now() + 90_000).toISOString() });
      }
      return;
    }
    await callAction("cast_discussion_choice", { p_choice: choice, p_expected_round: snapshot.roundNumber });
  }

  async function openDiscussionDecision() {
    if (!snapshot || snapshot.phase !== "discussion" || !["turns", "free_chat"].includes(snapshot.discussionStage) || snapshot.discussionVoteCount > 0) return;
    if (demoMode) {
      setSnapshot({ ...snapshot, discussionStage: "decision", discussionTurnOrder: null, discussionTurnPlayerId: null, phaseEndsAt: null });
      return;
    }
    await callAction("open_discussion_decision", { p_expected_round: snapshot.roundNumber });
  }

  async function toggleRoleCard() {
    if (!snapshot || !currentRoleInfo) return;
    const revealing = !roleVisible;
    setRoleVisible(revealing);
    if (!revealing || snapshot.phase !== "reveal" || demoMode) return;
    await callAction("acknowledge_role", { p_expected_round: snapshot.roundNumber });
  }

  async function copyInvite() {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?sala=${snapshot.code}`);
      setNotice("Link da sala copiado!");
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o código da sala e envie aos amigos.");
    }
  }

  async function sendChatMessage() {
    if (!snapshot || snapshot.phase === "reveal" || snapshot.phase === "discussion" && snapshot.discussionStage === "decision" || chatBusy) return;
    const body = chatDraft.trim().replace(/\s+/g, " ");
    if (!body) return;
    if (body.length > 280) { setError("A mensagem pode ter no máximo 280 caracteres."); return; }

    setChatBusy(true);
    setError("");
    shouldAutoScrollChat.current = true;
    try {
      if (demoMode) {
        const message: ChatMessage = {
          id: Date.now(),
          playerId: me?.id ?? "me",
          nickname: me?.nickname ?? nickname,
          body,
          createdAt: new Date().toISOString(),
          isMe: true,
        };
        setChatMessages((current) => [...current, message]);
        setChatDraft("");
        return;
      }
      const supabase = getSupabaseClient();
      const { error: rpcError } = await supabase!.rpc("send_chat_message", {
        p_code: snapshot.code,
        p_session_token: getSessionToken(),
        p_body: body,
      });
      if (rpcError) throw rpcError;
      setChatDraft("");
      await loadChatMessages(snapshot.code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar a mensagem.");
    } finally {
      setChatBusy(false);
    }
  }

  function handleChatScroll() {
    const element = chatScroll.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 56;
    shouldAutoScrollChat.current = nearBottom;
    if (nearBottom) setUnreadChat(0);
  }

  function jumpToLatestChat() {
    shouldAutoScrollChat.current = true;
    setUnreadChat(0);
    chatScroll.current?.scrollTo({ top: chatScroll.current.scrollHeight, behavior: "smooth" });
  }

  function acceptSuggestion() {
    setImpostorCount(suggestion.impostors); setDiscussionSeconds(suggestion.seconds); setShowSuggestion(false);
    setNotice("Sugestão aplicada. Você ainda pode alterar tudo.");
  }

  function changePlayerLimit(value: number) {
    const nextMaxImpostors = Math.max(1, Math.min(5, Math.floor((value - 1) / 3)));
    setPlayerLimit(value);
    setImpostorCount((current) => Math.min(current, nextMaxImpostors));
    setShowSuggestion(true);
  }

  async function leaveRoom() {
    const leavingSnapshot = snapshot;
    activeRoomCode.current = null;
    latestSnapshotRequest.current += 1;
    latestRoleRequest.current += 1;
    latestChatRequest.current += 1;
    lastSnapshotPhase.current = null;
    lastChatId.current = null;
    setSnapshot(null); setRoleInfo(null); setRoleVisible(false); setSelectedVote(null); setDemoMode(false); setNotice(""); setError("");
    setChatMessages([]); setChatDraft(""); setUnreadChat(0); setChatLoading(false);
    window.history.replaceState({}, "", window.location.pathname);
    if (leavingSnapshot && remoteEnabled && !demoMode) {
      const supabase = getSupabaseClient();
      await supabase?.rpc("leave_room", { p_code: leavingSnapshot.code, p_session_token: getSessionToken() });
    }
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <button className="brand" onClick={leaveRoom} aria-label="Voltar ao início"><span className="brand-logo" aria-hidden="true" /><span>Na Miúda!</span></button>
        <div className="topbar-actions">
          <button className="rules-button" onClick={() => setShowRules(true)}>Como jogar</button>
          <ThemeSwitch value={theme} onChange={(value) => { setTheme(value); void updateProfile({ preferred_theme: value }); }} />
          {snapshot && <button className="ghost-button compact" onClick={leaveRoom}>Sair</button>}
        </div>
      </header>

      {!snapshot ? (
        <div className="landing-wrap">
          <section className="hero-copy">
            <div className="hero-mascot" aria-hidden="true"><span>?</span></div>
            <span className="eyebrow"><b>●</b> Suspeita brasileira, de qualquer lugar</span>
            <h1>Todo mundo sabe.<br /><em>Menos um.</em></h1>
            <p>Uma palavra, muita conversa e alguém tentando parecer confiante demais. Crie a sala, mande o código e descubra quem está só improvisando.</p>
            <div className="proof-row"><span>⚡ sala em segundos</span><span>●</span><span>💬 chat no jogo</span><span>●</span><span>📱 cada um na sua casa</span></div>
            <div className="category-preview" aria-hidden="true"><span>🌎</span><span>🍕</span><span>⚽</span><span>🎬</span><span>🎮</span><b>assuntos para todo tipo de turma</b></div>
            <div className="suspicion-note"><span>REGRA NÃO ESCRITA</span><strong>Fale com confiança.<br />Mesmo sem saber de nada.</strong></div>
          </section>

          <section className="entry-card" aria-label="Criar ou entrar em sala">
            <div className="entry-heading"><div><span className="micro-label">Partida particular</span><h2>{entryMode === "create" ? "Abra a investigação" : "Entre sem fazer barulho"}</h2></div><span className="browser-badge"><i /> grátis no navegador</span></div>
            <div className="entry-tabs" role="tablist" aria-label="Escolher como jogar"><button type="button" role="tab" aria-selected={entryMode === "create"} className={entryMode === "create" ? "active" : ""} onClick={() => setEntryMode("create")}>Criar sala</button><button type="button" role="tab" aria-selected={entryMode === "join"} className={entryMode === "join" ? "active" : ""} onClick={() => setEntryMode("join")}>Tenho um código</button></div>
            <label className="field-label" htmlFor="nickname">Seu apelido</label>
            <input id="nickname" className="text-input" value={nickname} maxLength={20} onChange={(event) => setNickname(event.target.value)} placeholder="Ex.: Kauã" autoComplete="nickname" />

            {entryMode === "create" ? <>
              <div className="quick-settings">
                <label><span>Limite da sala</span><select value={playerLimit} onChange={(event) => changePlayerLimit(Number(event.target.value))}>{Array.from({ length: 18 }, (_, index) => index + 3).map((value) => <option value={value} key={value}>{value} jogadores</option>)}</select></label>
                <label><span>Impostores</span><select value={impostorCount} onChange={(event) => setImpostorCount(Number(event.target.value))}>{Array.from({ length: maxImpostors }, (_, index) => index + 1).map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                <label><span>Discussão</span><select value={discussionSeconds} onChange={(event) => setDiscussionSeconds(Number(event.target.value))}><option value={120}>2 min</option><option value={180}>3 min</option><option value={240}>4 min</option><option value={300}>5 min</option><option value={420}>7 min</option><option value={600}>10 min</option></select></label>
              </div>

              <label className="field-label" htmlFor="category">Assunto da rodada</label>
              <select id="category" className="wide-select" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option value={item.id} key={item.id}>{item.icon} {item.label}</option>)}</select>

              {showSuggestion && (
                <div className="suggestion-card">
                  <span className="spark">✦</span><div><strong>Palpite da casa</strong><p>Com {playerLimit} pessoas, {suggestion.impostors} {suggestion.impostors === 1 ? "impostor" : "impostores"} e {suggestion.seconds / 60} min deixam a rodada {suggestion.label.toLowerCase()}.</p><div><button onClick={acceptSuggestion}>Usar esse ajuste</button><button onClick={() => setShowSuggestion(false)}>Eu decido</button></div></div>
                </div>
              )}

              <button className="primary-button" disabled={busy} onClick={createRoom}><span>＋</span> {busy ? "Preparando o caso..." : "Criar sala e chamar a turma"}</button>
            </> : <div className="join-case">
              <label className="field-label" htmlFor="room-code">Código da sala</label>
              <div className="join-row"><input id="room-code" className="code-input" value={joinCode} maxLength={6} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ""))} placeholder="EX.: A7B9K2" aria-label="Código da sala" autoComplete="off" /><button className="secondary-button" disabled={busy} onClick={joinRoom}>{busy ? "Entrando..." : "Entrar →"}</button></div>
              <p>O código tem 6 caracteres e foi enviado por quem criou a sala.</p>
            </div>}

            <details className="profile-save"><summary><span>G</span><div><strong>Guardar meu apelido</strong><small>Opcional • salvar com Gmail</small></div><i>⌄</i></summary><div className="profile-save-row"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seunome@gmail.com" aria-label="Seu Gmail" /><button disabled={busy} onClick={saveProfileByEmail}>{busy ? "Enviando..." : "Salvar"}</button></div></details>
            {error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message success" role="status">{notice}</p>}
            {!remoteEnabled && <p className="demo-note">A versão aberta agora usa jogadores simulados para você testar uma rodada completa.</p>}
          </section>

          <section className="how-it-works">
            <div><span>01</span><strong>Mande o código</strong><p>Cada pessoa entra pelo navegador, sem instalar nada.</p></div>
            <div><span>02</span><strong>Proteja o segredo</strong><p>Todo mundo recebe a palavra. O impostor recebe só uma pista.</p></div>
            <div><span>03</span><strong>Blefe e desconfie</strong><p>Conversem no chat, comparem respostas e façam a acusação.</p></div>
          </section>
        </div>
      ) : (
        <div className={`game-wrap ${snapshot.phase === "discussion" ? "discussion-mode" : ""}`}>
          <section className="room-header panel"><div className="room-heading"><span className="room-live"><i /> sala aberta</span><div><span className="micro-label">{phaseLabels[snapshot.phase]}</span><h2>{snapshot.phase === "lobby" ? "Junte a turma" : `Rodada ${snapshot.roundNumber}`}</h2></div></div><div className="room-code-block"><span>Código da sala</span><strong>{snapshot.code}</strong><button onClick={copyInvite}>Copiar</button></div></section>
          <PhaseRail phase={snapshot.phase} />
          <div className={`game-grid phase-${snapshot.phase} ${snapshot.phase === "discussion" ? "chat-focus" : ""}`}>
            <section className="main-panel panel">
              {snapshot.phase === "lobby" && <Lobby snapshot={snapshot} me={me} readyCount={readyCount} selectedCategory={selectedCategory} toggleReady={toggleReady} startRound={startRound} busy={busy} />}
              {snapshot.phase === "reveal" && (
                <section className="phase-content centered-phase"><div className="phase-icon">{roleVisible ? currentRoleInfo?.role === "impostor" ? "🎭" : "🔐" : "👁️"}</div><span className="micro-label">Só você pode ver</span><h3>{roleVisible ? currentRoleInfo?.role === "impostor" ? "Você é o impostor" : "Sua palavra é" : "Descubra seu papel"}</h3>
                  <button className={`role-card ${roleVisible ? "revealed" : ""}`} disabled={!currentRoleInfo || busy} onClick={toggleRoleCard}>{!roleVisible ? <><strong>{currentRoleInfo ? "Toque para revelar" : "Sorteando seu papel..."}</strong><small>Proteja a tela dos curiosos</small></> : currentRoleInfo?.role === "impostor" ? <><strong>IMPOSTOR</strong><small>Categoria: {roleCategory.label}. Escute as pistas e disfarce.</small>{currentRoleInfo.hint && <span className="role-hint"><b>Dica secreta</b>{currentRoleInfo.hint}</span>}</> : <><strong>{currentRoleInfo?.word ?? "Carregando..."}</strong><small>Dê uma pista boa, mas não entregue a palavra.</small></>}</button>
                  <p className="seen-progress">{snapshot.rolesSeenCount}/{snapshot.roundPlayerCount} viram o papel</p>
                  {isHost ? <button className="primary-button phase-action" disabled={!roleVisible || busy || snapshot.rolesSeenCount < snapshot.roundPlayerCount} onClick={advancePhase}>Todos viram? Começar pistas →</button> : <p className="waiting-copy">Quando todos estiverem prontos, o anfitrião inicia as pistas.</p>}
                </section>
              )}
              {snapshot.phase === "discussion" && <DiscussionSide snapshot={snapshot} secondsLeft={secondsLeft} currentRoleInfo={currentRoleInfo} roleCategoryLabel={roleCategory.label} roleVisible={roleVisible} onToggleRole={() => setRoleVisible((value) => !value)} isHost={isHost} busy={busy} onOpenDecision={openDiscussionDecision} onOpenVoting={advancePhase} />}
              {snapshot.phase === "voting" && (
                <section className="phase-content"><span className="micro-label">Escolha sem contar</span><h3>Quem está na miúda?</h3><p className="phase-description vote-copy">Seu voto é secreto e não pode ser trocado depois da confirmação.</p><div className="vote-grid">{snapshot.players.filter((player) => !player.isMe).map((player) => <button key={player.id} className={`vote-card ${selectedVote === player.id ? "selected" : ""}`} disabled={snapshot.hasVoted} aria-pressed={selectedVote === player.id} onClick={() => setSelectedVote(player.id)}><Avatar name={player.nickname} /><span>{player.nickname}</span><i>{selectedVote === player.id ? "✓" : ""}</i></button>)}</div><div className="vote-actions"><button className="primary-button" disabled={!selectedVote || busy || snapshot.hasVoted} onClick={castVote}>{snapshot.hasVoted ? "Voto confirmado ✓" : "Confirmar meu voto"}</button>{isHost && <button className="ghost-button" disabled={busy || snapshot.voteCount < snapshot.eligibleVoterCount && secondsLeft !== 0 && !demoMode} onClick={advancePhase}>Revelar resultado</button>}</div><div className="vote-progress"><span>{snapshot.voteCount} de {snapshot.eligibleVoterCount} votos confirmados{secondsLeft !== null ? ` • encerra em ${formatTime(secondsLeft)}` : ""}</span><div><i style={{ width: `${snapshot.eligibleVoterCount ? Math.min(100, snapshot.voteCount / snapshot.eligibleVoterCount * 100) : 0}%` }} /></div></div></section>
              )}
              {snapshot.phase === "results" && <Results snapshot={snapshot} isHost={isHost} advancePhase={advancePhase} busy={busy} />}
            </section>

            <aside className="players-panel panel"><div className="players-heading"><div><span className="micro-label">Na sala • placar</span><h3>Jogadores</h3></div><span>{onlineCount}/{snapshot.players.length} online</span></div><div className="player-list">{snapshot.players.map((player, index) => { const isLeader = leaderScore > 0 && player.score === leaderScore; return <div className={`player-row ${isLeader ? "leader" : ""}`} key={player.id}><div className="player-order">{index + 1}</div><Avatar name={player.nickname} /><div className="player-name"><strong>{isLeader && <span className="leader-crown" aria-label="Líder">♛</span>}{player.nickname}{player.isMe ? " (você)" : ""}</strong><small>{!player.isOnline ? "Desconectado" : player.isHost ? "Anfitrião" : snapshot.phase === "lobby" ? player.isReady ? "Pronto para jogar" : "Se preparando" : phaseLabels[snapshot.phase]}</small></div><div className="player-trailing"><div className={`status-dot ${player.isOnline ? "online" : ""}`} title={player.isOnline ? "Online" : "Desconectado"} /><b className="player-score" key={`${player.id}-${player.score}`} aria-label={`${player.score} ${player.score === 1 ? "ponto" : "pontos"}`}>{player.score}<small>pt</small></b></div></div>; })}</div><div className="category-chip"><span>{selectedCategory.icon}</span><div><small>Categoria</small><strong>{selectedCategory.label}</strong></div></div><div className="room-mini-stats"><span><b>{snapshot.playerLimit}</b> vagas</span><span><b>{snapshot.impostorCount}</b> impostor{snapshot.impostorCount > 1 ? "es" : ""}</span><span><b>{snapshot.discussionSeconds / 60}</b> min</span></div></aside>
            <ChatPanel
              snapshot={snapshot}
              messages={chatMessages}
              draft={chatDraft}
              busy={chatBusy}
              actionBusy={busy}
              loading={chatLoading}
              unread={unreadChat}
              listRef={chatScroll}
              onDraftChange={setChatDraft}
              onSend={sendChatMessage}
              onScroll={handleChatScroll}
              onJumpToLatest={jumpToLatestChat}
              secondsLeft={secondsLeft}
              onDiscussionChoice={castDiscussionChoice}
            />
          </div>
          {(error || notice) && <div className={`toast ${error ? "error" : "success"}`} role={error ? "alert" : "status"} aria-live="polite">{error || notice}<button aria-label="Fechar aviso" onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
        </div>
      )}

      {showRules && <RulesModal onClose={closeRules} />}
      <footer><span>Na Miúda! • uma brincadeira entre amigos</span><span>Chat da sala integrado para jogar de qualquer lugar.</span></footer>
    </main>
  );
}

function PhaseRail({ phase }: { phase: Phase }) {
  const activeIndex = phaseSteps.findIndex((step) => step.id === phase);
  return <nav className="phase-rail panel" aria-label="Etapas da rodada">
    {phaseSteps.map((step, index) => <div className={`phase-step ${index < activeIndex ? "complete" : ""} ${index === activeIndex ? "active" : ""}`} aria-current={index === activeIndex ? "step" : undefined} key={step.id}>
      <span aria-hidden="true">{index < activeIndex ? "✓" : step.icon}</span><div><small>0{index + 1}</small><strong>{step.short}</strong></div>
    </div>)}
  </nav>;
}

function ThemeSwitch({ value, onChange }: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  const options: Array<{ value: ThemeMode; label: string; icon: string }> = [{ value: "system", label: "Sistema", icon: "◐" }, { value: "light", label: "Claro", icon: "☀" }, { value: "dark", label: "Escuro", icon: "☾" }];
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = Math.max(0, options.findIndex((item) => item.value === value));
  const selected = options[current];
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeWithEscape);
    return () => { window.removeEventListener("pointerdown", closeOutside); window.removeEventListener("keydown", closeWithEscape); };
  }, [open]);
  return <div className="theme-switch" ref={root}>
    <button className="theme-trigger" type="button" title={`Tema: ${selected.label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((currentOpen) => !currentOpen)}><span aria-hidden="true">{selected.icon}</span><strong>{selected.label}</strong><i aria-hidden="true">⌄</i></button>
    {open && <div className="theme-menu" role="menu" aria-label="Escolher tema">{options.map((option) => <button type="button" role="menuitemradio" aria-checked={option.value === value} className={option.value === value ? "active" : ""} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}><span aria-hidden="true">{option.icon}</span><strong>{option.label}</strong><i aria-hidden="true">{option.value === value ? "✓" : ""}</i></button>)}</div>}
  </div>;
}

function DiscussionSide({ snapshot, secondsLeft, currentRoleInfo, roleCategoryLabel, roleVisible, onToggleRole, isHost, busy, onOpenDecision, onOpenVoting }: {
  snapshot: Snapshot;
  secondsLeft: number | null;
  currentRoleInfo: RoleInfo | null;
  roleCategoryLabel: string;
  roleVisible: boolean;
  onToggleRole: () => void;
  isHost: boolean;
  busy: boolean;
  onOpenDecision: () => void;
  onOpenVoting: () => void;
}) {
  const extraTime = snapshot.discussionMoreTimeCount > 0;
  const deciding = snapshot.discussionStage === "decision"
    || (snapshot.discussionStage === "free_chat" || snapshot.discussionStage === "turns") && snapshot.discussionVoteCount === 0 && secondsLeft === 0;
  return <section className="phase-content centered-phase discussion-side">
    {deciding ? <div className="phase-icon decision-icon">⚖️</div> : <div className={`timer-ring ${secondsLeft === 0 ? "expired" : ""}`}><strong>{formatTime(secondsLeft ?? (extraTime ? 60 : snapshot.discussionSeconds))}</strong><span>{extraTime ? "tempo extra" : "para conversar"}</span></div>}
    <span className="micro-label">{deciding ? "Decisão da turma" : extraTime ? "Tempo extra" : "Discussão aberta"}</span>
    <h3>{deciding ? "Votem no chat" : "Conversem livremente"}</h3>
    <p className="phase-description">{deciding ? "O chat fica pausado por alguns segundos enquanto todos escolhem o próximo passo." : extraTime ? "Usem este minuto para comparar respostas e encontrar contradições." : "Façam perguntas, deem pistas e organizem a conversa do jeito que funcionar melhor para a turma."}</p>
    <div className={`tip-box ${currentRoleInfo?.role === "impostor" ? "impostor-tip" : ""}`}><span>{currentRoleInfo?.role === "impostor" ? "🎭" : "💡"}</span><p><strong>{currentRoleInfo?.role === "impostor" ? "Sua dica de blefe" : "Dica rápida"}</strong>{currentRoleInfo?.role === "impostor" ? currentRoleInfo.hint ?? "Escute as palavras que mais se repetem e responda de forma ampla." : "Uma boa pergunta testa quem conhece a palavra sem entregá-la ao impostor."}</p></div>
    <div className="secret-recheck"><button className="ghost-button" disabled={!currentRoleInfo} onClick={onToggleRole}>{roleVisible ? "Ocultar meu segredo" : "Rever meu segredo"}</button>{roleVisible && currentRoleInfo && <div><small>{currentRoleInfo.role === "impostor" ? `Impostor • ${roleCategoryLabel}` : "Sua palavra"}</small><strong>{currentRoleInfo.role === "impostor" ? "IMPOSTOR" : currentRoleInfo.word}</strong>{currentRoleInfo.role === "impostor" && currentRoleInfo.hint && <p>{currentRoleInfo.hint}</p>}</div>}</div>
    {!deciding && (extraTime
      ? isHost ? <button className="primary-button phase-action" disabled={busy} onClick={onOpenVoting}>Encerrar conversa e votar →</button> : <p className="waiting-copy">O anfitrião abre a votação quando o grupo terminar.</p>
      : isHost && <button className="ghost-button discussion-decision-trigger" disabled={busy} onClick={onOpenDecision}>Encerrar conversa e decidir →</button>)}
  </section>;
}

function ChatPanel({
  snapshot,
  messages,
  draft,
  busy,
  actionBusy,
  loading,
  unread,
  listRef,
  secondsLeft,
  onDraftChange,
  onSend,
  onScroll,
  onJumpToLatest,
  onDiscussionChoice,
}: {
  snapshot: Snapshot;
  messages: ChatMessage[];
  draft: string;
  busy: boolean;
  actionBusy: boolean;
  loading: boolean;
  unread: number;
  listRef: RefObject<HTMLDivElement | null>;
  secondsLeft: number | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onScroll: () => void;
  onJumpToLatest: () => void;
  onDiscussionChoice: (choice: DiscussionChoice) => void;
}) {
  const phase = snapshot.phase;
  const initialDiscussionEnded = phase === "discussion"
    && (snapshot.discussionStage === "free_chat" || snapshot.discussionStage === "turns")
    && snapshot.discussionVoteCount === 0
    && secondsLeft === 0;
  const deciding = phase === "discussion" && (snapshot.discussionStage === "decision" || initialDiscussionEnded);
  const paused = phase === "reveal" || deciding;
  const voteProgress = snapshot.eligibleVoterCount ? Math.min(100, snapshot.discussionVoteCount / snapshot.eligibleVoterCount * 100) : 0;
  const phaseHint = paused
    ? deciding ? "Chat pausado durante a decisão do grupo" : "Chat pausado enquanto todos veem o papel"
    : phase === "discussion"
      ? snapshot.discussionMoreTimeCount > 0 ? "Tempo extra — conversem livremente" : "Chat livre — perguntem e respondam sem escrever a palavra secreta"
      : phase === "voting"
        ? "Votação aberta — não revele seu voto"
        : phase === "results"
          ? "Comente o resultado e prepare a revanche"
          : "Aproveitem para combinar a partida";

  return <section className={`chat-panel panel chat-${phase}`} aria-label="Chat da sala">
    <div className="chat-heading">
      <div><span className="micro-label">{phase === "discussion" ? "Conversem e descubram" : "Conversa da sala"}</span><h3>{phase === "discussion" ? "Discussão ao vivo" : "Chat da turma"}</h3></div>
      <div className="chat-heading-status">{phase === "discussion" && !deciding && secondsLeft !== null && <span className="chat-timer-pill">{formatTime(secondsLeft)}</span>}<span className="chat-live"><i /> ao vivo</span></div>
    </div>
    <div className={`chat-phase-note ${paused ? "paused" : ""}`}><span>{paused ? "🔒" : "💬"}</span>{phaseHint}</div>
    {phase === "discussion" && snapshot.discussionMoreTimeCount > 0 && !deciding && <div className="extra-time-banner"><span>＋1:00</span><div><strong>Tempo extra liberado</strong><small>O chat voltou — comparem as respostas.</small></div></div>}
    {deciding ? <div className="discussion-decision" role="group" aria-labelledby="discussion-question">
      <div className="decision-symbol" aria-hidden="true">?</div>
      <span className="micro-label">Todo mundo escolhe</span>
      <h4 id="discussion-question">Mais tempo ou votação?</h4>
      <p>Assim que uma opção tiver maioria, o jogo continua automaticamente.</p>
      <div className="decision-options">
        <button type="button" className={snapshot.discussionVoteChoice === "more_time" ? "selected" : ""} disabled={snapshot.hasDiscussionVoted || actionBusy} onClick={() => onDiscussionChoice("more_time")}><span>⏱️</span><div><strong>Mais tempo</strong><small>+1 minuto de chat</small></div><b>{snapshot.discussionMoreTimeCount}</b></button>
        <button type="button" className={snapshot.discussionVoteChoice === "voting" ? "selected" : ""} disabled={snapshot.hasDiscussionVoted || actionBusy} onClick={() => onDiscussionChoice("voting")}><span>🗳️</span><div><strong>Ir para votação</strong><small>Escolher o impostor</small></div><b>{snapshot.discussionGoVotingCount}</b></button>
      </div>
      <div className="decision-progress"><span><b>{snapshot.discussionVoteCount}</b> de {snapshot.eligibleVoterCount} votaram</span><div><i style={{ width: `${voteProgress}%` }} /></div></div>
      {snapshot.hasDiscussionVoted && <small className="decision-waiting">Seu voto foi contado. Aguardando a turma…</small>}
    </div> : <div className="chat-messages" ref={listRef} onScroll={onScroll} aria-live="polite" aria-relevant="additions">
      {loading && messages.length === 0 ? <div className="chat-empty"><span>•••</span><strong>Abrindo a conversa...</strong></div> : messages.length === 0 ? <div className="chat-empty"><span>🕵️</span><strong>O silêncio já está suspeito</strong><p>Quebre o gelo antes que alguém pareça culpado demais.</p></div> : messages.map((message) => <div className={`chat-message ${message.isMe ? "mine" : ""}`} key={message.id}>
        {!message.isMe && <Avatar name={message.nickname} />}
        <div><span><strong>{message.isMe ? "Você" : message.nickname}</strong><time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time></span><p>{message.body}</p></div>
      </div>)}
    </div>}
    {!deciding && unread > 0 && <button className="new-messages-button" type="button" onClick={onJumpToLatest}>{unread} {unread === 1 ? "mensagem nova" : "mensagens novas"} ↓</button>}
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
      <input
        value={draft}
        maxLength={280}
        disabled={paused || busy}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder={paused ? deciding ? "Vote acima para continuar" : "Chat temporariamente pausado" : phase === "discussion" ? "Pergunte, responda ou levante suspeitas..." : "Escreva para a turma..."}
        aria-label="Mensagem para o chat da sala"
        autoComplete="off"
      />
      <button type="submit" disabled={paused || busy || !draft.trim()} aria-label="Enviar mensagem">{busy ? "…" : "➤"}</button>
    </form>
    <div className="chat-foot"><span>Enter para enviar</span>{draft.length >= 220 && <span>{draft.length}/280</span>}</div>
  </section>;
}

function Lobby({ snapshot, me, readyCount, selectedCategory, toggleReady, startRound, busy }: { snapshot: Snapshot; me?: Player; readyCount: number; selectedCategory: (typeof categories)[number]; toggleReady: () => void; startRound: () => void; busy: boolean }) {
  const onlinePlayers = snapshot.players.filter((player) => player.isOnline);
  const canStart = onlinePlayers.length >= 3 && readyCount === onlinePlayers.length;
  return <section className="phase-content lobby-content"><div className="lobby-intro"><span className="micro-label">Antes de começar</span><h3>A turma está chegando</h3><p>Compartilhe o código, combine a partida no chat e marque “Estou pronto”. Os papéis e a palavra serão sorteados com segurança no servidor.</p></div><div className="settings-card"><div className="settings-title"><strong>Ficha desta partida</strong><span>Escolhida pelo anfitrião</span></div><div className="setting-row"><div className="setting-copy"><span className="setting-icon">{selectedCategory.icon}</span><div><strong>{selectedCategory.label}</strong><small>{selectedCategory.hint}</small></div></div><span className="setting-value">Assunto</span></div><div className="setting-row"><div className="setting-copy"><span className="setting-icon">👥</span><div><strong>Até {snapshot.playerLimit} jogadores</strong><small>{snapshot.impostorCount} impostor{snapshot.impostorCount > 1 ? "es" : ""}</small></div></div><span className="setting-value">Equilibrado</span></div><div className="setting-row"><div className="setting-copy"><span className="setting-icon">⏱️</span><div><strong>{snapshot.discussionSeconds / 60} minutos</strong><small>para conversa e suspeitas</small></div></div><span className="setting-value">Por rodada</span></div></div><div className="ready-box"><div><strong>{readyCount}/{onlinePlayers.length} online prontos</strong><span>{onlinePlayers.length < 3 ? `Faltam ${3 - onlinePlayers.length} jogadores` : canStart ? "Todo mundo pronto — podem começar!" : "Aguardando a turma"}</span></div><div className="ready-bar"><i style={{ width: `${Math.max(8, onlinePlayers.length ? readyCount / onlinePlayers.length * 100 : 8)}%` }} /></div></div><div className="lobby-actions"><button className={me?.isReady ? "ready-button active" : "ready-button"} onClick={toggleReady}>{me?.isReady ? "✓ Estou pronto" : "Marcar como pronto"}</button>{me?.isHost && <button className="primary-button" disabled={!canStart || busy} onClick={startRound}>{busy ? "Sorteando..." : "Sortear e começar →"}</button>}</div></section>;
}

function Results({ snapshot, isHost, advancePhase, busy }: { snapshot: Snapshot; isHost: boolean; advancePhase: () => void; busy: boolean }) {
  const eliminated = snapshot.players.filter((player) => snapshot.eliminatedPlayerIds.includes(player.id));
  const impostors = snapshot.players.filter((player) => snapshot.impostorPlayerIds.includes(player.id));
  const ranking = [...snapshot.players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)).slice(0, 3);
  const groupWon = snapshot.winner === "group";
  const plural = impostors.length > 1;
  return <section className="phase-content centered-phase results-content"><div className="result-confetti" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div><div className={`result-burst ${groupWon ? "caught" : "escaped"}`}>{groupWon ? "🔎" : "🎭"}</div><span className="micro-label">A verdade apareceu</span><h3>{groupWon ? plural ? "Impostores descobertos!" : "Impostor descoberto!" : plural ? "Os impostores escaparam!" : "O impostor escapou!"}</h3><p className="phase-description">{eliminated.length ? eliminated.map((player) => player.nickname).join(" e ") : "O mais votado"} {eliminated.length > 1 ? "ficaram" : "ficou"} entre os mais votados.</p><div className="result-evidence"><div className="impostor-reveal-card"><small>{plural ? "Os impostores eram" : "O impostor era"}</small><div>{impostors.length ? impostors.map((player) => <span key={player.id}><Avatar name={player.nickname} /><strong>{player.nickname}</strong></span>) : <strong>Revelando…</strong>}</div></div><div className="secret-reveal"><small>A palavra secreta era</small><strong>{snapshot.revealedWord ?? "—"}</strong></div></div><div className="round-ranking"><small>Placar da turma</small><div>{ranking.map((player, index) => <span key={player.id}><b>{index === 0 ? "♛" : index + 1}</b><strong>{player.nickname}</strong><em>{player.score} pt</em></span>)}</div></div><div className="points-note">{groupWon ? "Cada inocente marca 1 ponto." : "Cada impostor marca 2 pontos."}</div>{isHost ? <button className="primary-button phase-action" disabled={busy} onClick={advancePhase}>Preparar próxima rodada →</button> : <p className="waiting-copy">O anfitrião está preparando a próxima rodada.</p>}</section>;
}

function RulesModal({ onClose }: { onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.stopPropagation()}><button ref={closeButton} className="modal-close" aria-label="Fechar regras" onClick={onClose}>×</button><span className="micro-label">Regras rápidas</span><h2 id="rules-title">Como jogar Na Miúda!</h2><ol><li><b>Entre na sala.</b><span>Cada pessoa usa o próprio celular ou computador.</span></li><li><b>Veja seu segredo.</b><span>Os jogadores recebem a palavra; os impostores recebem o assunto e uma dica ampla.</span></li><li><b>Conversem livremente.</b><span>Façam perguntas, deem pistas e organizem a discussão pelo chat sem escrever a palavra.</span></li><li><b>Decidam e votem.</b><span>O grupo escolhe mais tempo de chat ou vai direto apontar o impostor.</span></li></ol><p>Com vários impostores, o grupo precisa colocar todos entre os mais votados. Se um inocente empatar nessa faixa, os impostores escapam. Os papéis são sorteados novamente a cada rodada.</p><button className="primary-button" onClick={onClose}>Entendi, vamos jogar</button></section></div>;
}

function Avatar({ name }: { name: string }) {
  const palette = ["#d8ff55", "#76d7ff", "#ffb25e", "#ff7bb0", "#b69cff"];
  const color = palette[name.split("").reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % palette.length];
  return <span className="avatar" style={{ background: color }}>{name.slice(0, 1).toUpperCase()}</span>;
}

function formatTime(total: number) {
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${Math.floor(total % 60).toString().padStart(2, "0")}`;
}

function formatChatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
