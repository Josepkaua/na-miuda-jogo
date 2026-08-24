import { readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Could not find ${label}`);
  return source.replace(before, after);
}

let page = readFileSync('app/page.tsx', 'utf8');

page = replaceOnce(
  page,
  '  const chatScroll = useRef<HTMLDivElement>(null);\n  const shouldAutoScrollChat = useRef(true);',
  '  const chatScroll = useRef<HTMLDivElement>(null);\n  const shouldAutoScrollChat = useRef(true);\n  const actionLocks = useRef(new Set<string>());\n  const lastSnapshotRound = useRef<number | null>(null);',
  'discussion refs',
);

page = replaceOnce(
  page,
  '      if (lastSnapshotPhase.current && lastSnapshotPhase.current !== normalized.phase) setRoleVisible(false);\n      lastSnapshotPhase.current = normalized.phase;\n      if (normalized.serverNow) setClockOffsetMs(new Date(normalized.serverNow).getTime() - Date.now());\n      setSnapshot(normalized);',
  '      const previousPhase = lastSnapshotPhase.current;\n      const phaseChanged = previousPhase !== null && previousPhase !== normalized.phase;\n      const roundChanged = lastSnapshotRound.current !== null && lastSnapshotRound.current !== normalized.roundNumber;\n      if (phaseChanged || roundChanged) {\n        setRoleVisible(false);\n        setNotice("");\n        setError("");\n        actionLocks.current.clear();\n      }\n      if (phaseChanged && previousPhase === "discussion" && normalized.phase === "voting") {\n        setNotice("Tempo encerrado — abrindo a votação…");\n      }\n      lastSnapshotPhase.current = normalized.phase;\n      lastSnapshotRound.current = normalized.roundNumber;\n      if (normalized.serverNow) setClockOffsetMs(new Date(normalized.serverNow).getTime() - Date.now());\n      setSnapshot(normalized);',
  'snapshot transition cleanup',
);

page = page.replace(/(lastSnapshotPhase\.current = null;)(?!\n\s*lastSnapshotRound\.current)/g, '$1\n        lastSnapshotRound.current = null;');

page = replaceOnce(
  page,
  '  async function callAction(name: string, extra: Record<string, unknown> = {}) {\n    if (!snapshot) return false; setBusy(true); setError("");\n    const actionRoomCode = snapshot.code;\n    try {\n      const supabase = getSupabaseClient();\n      const { error: rpcError } = await supabase!.rpc(name, { p_code: actionRoomCode, p_session_token: getSessionToken(), ...extra });\n      if (rpcError) throw rpcError;\n      if (activeRoomCode.current !== actionRoomCode) return false;\n      await loadSnapshot(actionRoomCode); return true;\n    } catch (caught) { setError(caught instanceof Error ? caught.message : "A ação não foi concluída."); return false; }\n    finally { setBusy(false); }\n  }',
  '  async function callAction(name: string, extra: Record<string, unknown> = {}) {\n    if (!snapshot) return false;\n    const actionRoomCode = snapshot.code;\n    const actionKey = `${name}:${snapshot.roomId}:${snapshot.phase}:${snapshot.roundNumber}`;\n    if (actionLocks.current.has(actionKey)) return false;\n    actionLocks.current.add(actionKey);\n    setBusy(true); setError("");\n    try {\n      const supabase = getSupabaseClient();\n      const { error: rpcError } = await supabase!.rpc(name, { p_code: actionRoomCode, p_session_token: getSessionToken(), ...extra });\n      if (rpcError) throw rpcError;\n      if (activeRoomCode.current !== actionRoomCode) return false;\n      await loadSnapshot(actionRoomCode); return true;\n    } catch (caught) { setError(caught instanceof Error ? caught.message : "A ação não foi concluída."); return false; }\n    finally { actionLocks.current.delete(actionKey); setBusy(false); }\n  }',
  'action lock',
);

page = replaceOnce(page, '  async function startRound() {\n    if (!snapshot) return;', '  async function startRound() {\n    if (!snapshot) return;\n    setNotice("");', 'start round notice cleanup');
page = replaceOnce(page, '  async function advancePhase() {\n    if (!snapshot) return;', '  async function advancePhase() {\n    if (!snapshot) return;\n    setNotice("");', 'advance notice cleanup');

page = replaceOnce(
  page,
  '      if (choice === "more_time") {\n        setSnapshot({ ...snapshot, discussionStage: "free_chat", discussionVoteCount: majority, discussionMoreTimeCount: majority, hasDiscussionVoted: true, discussionVoteChoice: choice, phaseEndsAt: new Date(Date.now() + 60_000).toISOString() });\n      } else {\n        setSnapshot({ ...snapshot, phase: "voting", discussionStage: "resolved", discussionVoteCount: majority, discussionGoVotingCount: majority, hasDiscussionVoted: true, discussionVoteChoice: choice, phaseEndsAt: new Date(Date.now() + 90_000).toISOString() });\n      }',
  '      if (choice === "more_time") {\n        setSnapshot({ ...snapshot, discussionStage: "free_chat", discussionVoteCount: 0, discussionMoreTimeCount: 0, discussionGoVotingCount: 0, hasDiscussionVoted: false, discussionVoteChoice: null, phaseEndsAt: new Date(Date.now() + 60_000).toISOString() });\n      } else {\n        setNotice("Tempo encerrado — abrindo a votação…");\n        setSnapshot({ ...snapshot, phase: "voting", discussionStage: "resolved", discussionVoteCount: majority, discussionGoVotingCount: majority, hasDiscussionVoted: true, discussionVoteChoice: choice, phaseEndsAt: new Date(Date.now() + 90_000).toISOString() });\n      }',
  'demo repeated decision',
);

page = replaceOnce(
  page,
  '  async function sendChatMessage() {\n    if (!snapshot || snapshot.phase === "reveal" || snapshot.phase === "discussion" && snapshot.discussionStage === "decision" || chatBusy) return;',
  '  async function sendChatMessage() {\n    if (!snapshot) return;\n    const discussionPaused = snapshot.phase === "discussion" && (snapshot.discussionStage === "decision" || secondsLeft === 0);\n    if (snapshot.phase === "reveal" || discussionPaused || chatBusy) return;',
  'chat expiry lock',
);

page = replaceOnce(
  page,
  '              {snapshot.phase === "discussion" && <DiscussionSide snapshot={snapshot} secondsLeft={secondsLeft} currentRoleInfo={currentRoleInfo} roleCategoryLabel={roleCategory.label} roleVisible={roleVisible} onToggleRole={() => setRoleVisible((value) => !value)} isHost={isHost} busy={busy} onOpenDecision={openDiscussionDecision} onOpenVoting={advancePhase} />}',
  '              {snapshot.phase === "discussion" && <DiscussionSide snapshot={snapshot} secondsLeft={secondsLeft} currentRoleInfo={currentRoleInfo} roleCategoryLabel={roleCategory.label} roleVisible={roleVisible} onToggleRole={() => setRoleVisible((value) => !value)} isHost={isHost} busy={busy} onOpenDecision={openDiscussionDecision} />}',
  'discussion component call',
);

page = replaceOnce(
  page,
  'function DiscussionSide({ snapshot, secondsLeft, currentRoleInfo, roleCategoryLabel, roleVisible, onToggleRole, isHost, busy, onOpenDecision, onOpenVoting }: {\n  snapshot: Snapshot;\n  secondsLeft: number | null;\n  currentRoleInfo: RoleInfo | null;\n  roleCategoryLabel: string;\n  roleVisible: boolean;\n  onToggleRole: () => void;\n  isHost: boolean;\n  busy: boolean;\n  onOpenDecision: () => void;\n  onOpenVoting: () => void;\n}) {\n  const extraTime = snapshot.discussionMoreTimeCount > 0;',
  'function DiscussionSide({ snapshot, secondsLeft, currentRoleInfo, roleCategoryLabel, roleVisible, onToggleRole, isHost, busy, onOpenDecision }: {\n  snapshot: Snapshot;\n  secondsLeft: number | null;\n  currentRoleInfo: RoleInfo | null;\n  roleCategoryLabel: string;\n  roleVisible: boolean;\n  onToggleRole: () => void;\n  isHost: boolean;\n  busy: boolean;\n  onOpenDecision: () => void;\n}) {',
  'discussion component signature',
);

page = replaceOnce(
  page,
  '    {deciding ? <div className="phase-icon decision-icon">⚖️</div> : <div className={`timer-ring ${secondsLeft === 0 ? "expired" : ""}`}><strong>{formatTime(secondsLeft ?? (extraTime ? 60 : snapshot.discussionSeconds))}</strong><span>{extraTime ? "tempo extra" : "para conversar"}</span></div>}\n    <span className="micro-label">{deciding ? "Decisão da turma" : extraTime ? "Tempo extra" : "Discussão aberta"}</span>\n    <h3>{deciding ? "Votem no chat" : "Conversem livremente"}</h3>\n    <p className="phase-description">{deciding ? "O chat fica pausado por alguns segundos enquanto todos escolhem o próximo passo." : extraTime ? "Usem este minuto para comparar respostas e encontrar contradições." : "Façam perguntas, deem pistas e organizem a conversa do jeito que funcionar melhor para a turma."}</p>',
  '    {deciding ? <div className="phase-icon decision-icon">⚖️</div> : <div className={`timer-ring ${secondsLeft === 0 ? "expired" : ""}`}><strong>{formatTime(secondsLeft ?? snapshot.discussionSeconds)}</strong><span>para conversar</span></div>}\n    <span className="micro-label">{deciding ? "Decisão da turma" : "Discussão aberta"}</span>\n    <h3>{deciding ? "Votem no chat" : "Conversem livremente"}</h3>\n    <p className="phase-description">{deciding ? "O tempo acabou. A turma escolhe mais um minuto ou segue para a votação." : "Façam perguntas, deem pistas e organizem a conversa do jeito que funcionar melhor para a turma."}</p>',
  'discussion copy',
);

page = replaceOnce(
  page,
  '    {!deciding && (extraTime\n      ? isHost ? <button className="primary-button phase-action" disabled={busy} onClick={onOpenVoting}>Encerrar conversa e votar →</button> : <p className="waiting-copy">O anfitrião abre a votação quando o grupo terminar.</p>\n      : isHost && <button className="ghost-button discussion-decision-trigger" disabled={busy} onClick={onOpenDecision}>Encerrar conversa e decidir →</button>)}',
  '    {!deciding && isHost && <button className="ghost-button discussion-decision-trigger" disabled={busy} onClick={onOpenDecision}>Encerrar conversa e decidir →</button>}',
  'collective decision only',
);

page = replaceOnce(page, '      ? snapshot.discussionMoreTimeCount > 0 ? "Tempo extra — conversem livremente" : "Chat livre — perguntem e respondam sem escrever a palavra secreta"', '      ? "Chat livre — perguntem e respondam sem escrever a palavra secreta"', 'chat free hint');
page = page.replace('    {phase === "discussion" && snapshot.discussionMoreTimeCount > 0 && !deciding && <div className="extra-time-banner"><span>＋1:00</span><div><strong>Tempo extra liberado</strong><small>O chat voltou — comparem as respostas.</small></div></div>}\n', '');
page = replaceOnce(page, '<li><b>Decidam e votem.</b><span>O grupo escolhe mais tempo de chat ou vai direto apontar o impostor.</span></li>', '<li><b>Decidam juntos.</b><span>Sempre que o tempo acabar, o grupo escolhe mais 1 minuto de chat ou segue para apontar o impostor.</span></li>', 'rules repeated decision');

writeFileSync('app/page.tsx', page);

let css = readFileSync('app/globals.css', 'utf8');
const refinement = `
/* Discussion room: chat-first layout with one intentional scroll area per panel. */
.discussion-mode { margin-top: 10px; margin-bottom: max(26px, env(safe-area-inset-bottom)); }
.discussion-mode .room-header { margin-bottom: 8px; padding: 12px 18px; border-radius: 16px; }
.discussion-mode .room-heading { gap: 10px; }
.discussion-mode .room-header h2 { font-size: 20px; }
.discussion-mode .room-live { padding: 6px 8px; }
.discussion-mode .room-code-block { gap: 10px; }
.discussion-mode .room-code-block strong { font-size: 18px; }
.discussion-mode .room-code-block button { padding: 8px 10px; }
.discussion-mode .phase-rail { margin: 0 0 9px; padding: 5px; border-radius: 14px; box-shadow: none; }
.discussion-mode .phase-step { gap: 6px; padding: 5px 8px; }
.discussion-mode .phase-step > span { width: 24px; height: 24px; border-radius: 8px; }
.game-grid.chat-focus { height: clamp(520px, calc(100dvh - 190px), 800px); grid-template-columns: minmax(0, 1fr) 300px; grid-template-rows: auto minmax(0, 1fr); grid-template-areas: "chat main" "chat players"; gap: 10px; align-items: stretch; }
.chat-focus .chat-panel { height: 100%; min-height: 0; padding: 16px; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 34px rgba(6,44,50,.11), 0 0 0 2px color-mix(in srgb, var(--lime) 7%, transparent); }
.chat-focus .chat-heading { flex: 0 0 auto; padding-bottom: 10px; }
.chat-focus .chat-heading h3 { font-size: 24px; }
.chat-focus .chat-phase-note { flex: 0 0 auto; margin-top: 8px; }
.chat-focus .chat-messages { flex: 1 1 auto; height: auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 12px 5px 8px; }
.chat-focus .chat-composer { flex: 0 0 auto; grid-template-columns: minmax(0, 1fr) 48px; gap: 8px; padding-top: 10px; padding-bottom: max(0px, env(safe-area-inset-bottom)); background: var(--paper); }
.chat-focus .chat-composer input, .chat-focus .chat-composer button { height: 48px; min-height: 48px; }
.chat-focus .chat-composer button { width: 48px; }
.chat-focus .chat-foot { flex: 0 0 auto; }
.chat-focus .main-panel { min-height: 0; padding: 13px; overflow: hidden; border-radius: 18px; }
.chat-focus .discussion-side { min-height: 0; justify-content: flex-start; }
.chat-focus .timer-ring { width: 90px; height: 90px; border-width: 7px; margin-bottom: 8px; }
.chat-focus .timer-ring strong { font-size: 23px; }
.chat-focus .timer-ring span { font-size: 8px; }
.chat-focus .phase-content h3 { margin: 5px 0 6px; font-size: 22px; }
.chat-focus .phase-description { margin-bottom: 9px; font-size: 9px; line-height: 1.4; }
.chat-focus .tip-box { gap: 9px; padding: 9px 10px; border-radius: 11px; }
.chat-focus .tip-box > span { font-size: 17px; }
.chat-focus .tip-box p { font-size: 9px; line-height: 1.35; }
.chat-focus .secret-recheck { width: 100%; margin-top: 8px; }
.chat-focus .secret-recheck .ghost-button { min-height: 38px; padding: 8px 10px; }
.chat-focus .secret-recheck > div { margin-top: 5px; padding: 7px 9px; }
.chat-focus .phase-action, .chat-focus .discussion-decision-trigger { width: 100%; min-height: 40px; margin-top: 8px; padding: 9px 10px; }
.chat-focus .players-panel { min-height: 0; display: flex; flex-direction: column; padding: 13px; overflow: hidden; border-radius: 18px; }
.chat-focus .players-heading { flex: 0 0 auto; padding-bottom: 9px; }
.chat-focus .players-heading h3 { font-size: 18px; }
.chat-focus .player-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--muted) 45%, transparent) transparent; padding: 5px 3px 5px 0; }
.chat-focus .player-row { gap: 6px; padding: 7px 1px; }
.chat-focus .player-order { display: none; }
.chat-focus .player-row .avatar { width: 30px; height: 30px; border-radius: 9px; font-size: 11px; }
.chat-focus .player-name strong { font-size: 10px; }
.chat-focus .player-name small { font-size: 8px; }
.chat-focus .player-trailing { gap: 5px; }
.chat-focus .player-score { min-width: 35px; padding: 5px 6px; font-size: 10px; }
.chat-focus .category-chip { flex: 0 0 auto; margin-top: 7px; padding: 8px 9px; border-radius: 10px; }
.chat-focus .category-chip > span { font-size: 18px; }
.chat-focus .category-chip strong { font-size: 10px; }
.chat-focus .room-mini-stats { flex: 0 0 auto; margin-top: 5px; }
.chat-focus .room-mini-stats span { padding: 5px 2px; }
.chat-focus .room-mini-stats b { font-size: 10px; }
.discussion-decision { min-height: 0; padding: 10px 4px; overflow: hidden; }
.discussion-decision h4 { font-size: clamp(22px, 3vw, 30px); }
.discussion-decision > p { margin-bottom: 11px; }
.decision-options button { min-height: 52px; padding: 10px; }

@media (max-height: 820px) and (min-width: 901px) {
  .game-grid.chat-focus { height: calc(100dvh - 182px); min-height: 500px; }
  .chat-focus .timer-ring { width: 78px; height: 78px; border-width: 6px; }
  .chat-focus .timer-ring strong { font-size: 20px; }
  .chat-focus .phase-description { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .chat-focus .tip-box { padding: 7px 9px; }
  .chat-focus .secret-recheck { margin-top: 6px; }
}

@media (max-width: 900px), (hover: none) and (pointer: coarse) {
  .discussion-mode { margin-top: 7px; }
  .game-grid.chat-focus { height: auto; grid-template-columns: 1fr; grid-template-rows: auto; grid-template-areas: "chat" "main" "players"; gap: 10px; }
  .chat-focus .chat-panel { height: min(560px, max(430px, 62svh)); max-height: calc(100dvh - 150px); min-height: 390px; }
  .chat-focus .main-panel { height: auto; overflow: visible; }
  .chat-focus .players-panel { height: auto; max-height: none; overflow: hidden; }
  .chat-focus .player-list { flex: 0 1 auto; max-height: min(300px, 42svh); overflow-y: auto; }
}

@media (max-width: 600px), (max-device-width: 600px) {
  .discussion-mode .room-header { padding: 10px 12px; }
  .discussion-mode .room-live { display: none; }
  .discussion-mode .room-heading h2 { font-size: 17px; }
  .discussion-mode .phase-rail { margin-bottom: 7px; }
  .chat-focus .chat-panel { height: min(530px, max(410px, 61svh)); max-height: calc(100dvh - 142px); padding: 12px; }
  .chat-focus .chat-heading h3 { font-size: 20px; }
  .chat-focus .chat-message p { padding: 9px 11px; font-size: 12px; }
  .chat-focus .chat-composer { grid-template-columns: minmax(0, 1fr) 46px; }
  .chat-focus .chat-composer input, .chat-focus .chat-composer button { height: 46px; min-height: 46px; }
  .chat-focus .chat-composer button { width: 46px; }
  .chat-focus .main-panel, .chat-focus .players-panel { padding: 12px; }
  .chat-focus .player-list { max-height: min(260px, 38svh); }
  .discussion-decision { justify-content: flex-start; overflow: hidden; }
  .decision-options { grid-template-columns: 1fr; gap: 7px; }
  .decision-options button { min-height: 50px; }
}
`;
css = replaceOnce(css, '\n@media (prefers-reduced-motion: reduce) {', `${refinement}\n@media (prefers-reduced-motion: reduce) {`, 'reduced motion marker');
css = css.replace(/^\s*\.turn-[^\n]*\n/gm, '');
writeFileSync('app/globals.css', css);

let sql = readFileSync('supabase/migrations/20260824040000_remove_inactive_players.sql', 'utf8');
sql = replaceOnce(
  sql,
  "    update public.rooms set discussion_stage = 'free_chat', discussion_turn_order = null,\n      phase_ends_at = now() + interval '1 minute', updated_at = now()\n    where id = target_room.id;\n  elsif voting_count > eligible_count / 2 or vote_count >= eligible_count then",
  "    update public.rooms set discussion_stage = 'free_chat', discussion_turn_order = null,\n      phase_ends_at = now() + interval '1 minute', updated_at = now()\n    where id = target_room.id;\n    delete from public.discussion_votes\n      where round_id = target_room.current_round_id;\n  elsif voting_count > eligible_count / 2 or vote_count >= eligible_count then",
  'discussion vote reset',
);
writeFileSync('supabase/migrations/20260824040000_remove_inactive_players.sql', sql);

let tests = readFileSync('tests/rendered-html.test.mjs', 'utf8');
tests += `

test("keeps discussion scrolling isolated and repeats collective decisions", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const sql = await readFile(new URL("../supabase/migrations/20260824040000_remove_inactive_players.sql", import.meta.url), "utf8");

  assert.match(css, /\.chat-focus \.players-panel\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.chat-focus \.player-list\s*\{[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.chat-focus \.main-panel\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /62svh/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(css, /\.turn-banner/);
  assert.match(page, /Tempo encerrado — abrindo a votação…/);
  assert.match(page, /actionLocks\.current\.has\(actionKey\)/);
  assert.match(page, /discussionStage === "decision" \|\| secondsLeft === 0/);
  assert.doesNotMatch(page, /onOpenVoting/);
  assert.match(sql, /outcome := 'more_time'[\s\S]*delete from public\.discussion_votes[\s\S]*round_id = target_room\.current_round_id/i);
});
`;
writeFileSync('tests/rendered-html.test.mjs', tests);
