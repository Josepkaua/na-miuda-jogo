-- Votação para pular a discussão e expulsão temporária pelo anfitrião.

-- Votos para pular a discussão ficam separados de discussion_votes, porque a
-- decisão do fim do cronômetro só abre quando ainda não existe voto coletivo.
create table if not exists public.discussion_skip_votes (
  round_id uuid not null references public.rounds(id) on delete cascade,
  voter_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, voter_player_id)
);
create index if not exists discussion_skip_votes_voter_idx on public.discussion_skip_votes(voter_player_id);
alter table public.discussion_skip_votes enable row level security;
revoke all on table public.discussion_skip_votes from anon, authenticated;

-- Expulsão não é permanente: o jogador volta com o mesmo código quando a rodada acabar.
alter table public.players add column if not exists kicked_at timestamptz;

create or replace function public.vote_skip_discussion(
  p_code text,
  p_session_token text,
  p_skip boolean,
  p_expected_round integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  caller_id uuid;
  eligible_count integer := 0;
  skip_count integer := 0;
  moved boolean := false;
begin
  select * into target_room from public.rooms
  where code = upper(trim(p_code)) and expires_at > now()
  for update;
  if target_room.id is null then raise exception 'Sala não encontrada.'; end if;

  caller_id := private.require_player(target_room.id, p_session_token);
  update public.players set last_seen_at = now() where id = caller_id;

  if target_room.round_number <> p_expected_round then raise exception 'A rodada já mudou.'; end if;
  if target_room.phase <> 'discussion' or target_room.discussion_stage not in ('turns', 'free_chat') then
    raise exception 'Só dá para pedir a votação durante a conversa.';
  end if;
  if not exists (
    select 1 from private.round_roles rr
    where rr.round_id = target_room.current_round_id and rr.player_id = caller_id
  ) then raise exception 'Você não participa desta rodada.'; end if;

  if coalesce(p_skip, false) then
    insert into public.discussion_skip_votes(round_id, voter_player_id)
    values (target_room.current_round_id, caller_id)
    on conflict do nothing;
  else
    delete from public.discussion_skip_votes
    where round_id = target_room.current_round_id and voter_player_id = caller_id;
  end if;

  select count(*) into eligible_count
  from private.round_roles rr
  join public.players p on p.id = rr.player_id
  where rr.round_id = target_room.current_round_id
    and p.left_at is null
    and p.last_seen_at > now() - interval '75 seconds';

  select count(*) into skip_count
  from public.discussion_skip_votes sv
  join public.players p on p.id = sv.voter_player_id
  where sv.round_id = target_room.current_round_id
    and p.left_at is null
    and p.last_seen_at > now() - interval '75 seconds';

  if eligible_count > 0 and skip_count > eligible_count / 2 then
    -- Registra a maioria como decisão coletiva, exigida pela trava de fases.
    insert into public.discussion_votes(round_id, voter_player_id, choice)
    select sv.round_id, sv.voter_player_id, 'voting'
    from public.discussion_skip_votes sv
    join public.players p on p.id = sv.voter_player_id
    where sv.round_id = target_room.current_round_id
      and p.left_at is null
      and p.last_seen_at > now() - interval '75 seconds'
    on conflict (round_id, voter_player_id) do update set choice = 'voting', created_at = now();

    update public.rooms
    set phase = 'voting', discussion_stage = 'resolved', discussion_turn_order = null,
      phase_ends_at = now() + interval '90 seconds', updated_at = now()
    where id = target_room.id;
    moved := true;
  else
    update public.rooms set updated_at = now() where id = target_room.id;
  end if;

  return jsonb_build_object('skip_count', skip_count, 'eligible_voter_count', eligible_count, 'moved_to_voting', moved);
end;
$$;

revoke all on function public.vote_skip_discussion(text, text, boolean, integer) from public;
grant execute on function public.vote_skip_discussion(text, text, boolean, integer) to anon, authenticated;

create or replace function public.kick_player(p_code text, p_session_token text, p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  caller_id uuid;
begin
  select * into target_room from public.rooms
  where code = upper(trim(p_code)) and expires_at > now()
  for update;
  if target_room.id is null then raise exception 'Sala não encontrada.'; end if;

  caller_id := private.require_player(target_room.id, p_session_token);
  if target_room.host_player_id is distinct from caller_id then
    raise exception 'Só o anfitrião pode tirar alguém da sala.';
  end if;
  if p_player_id is null or p_player_id = caller_id then
    raise exception 'Escolha outro jogador.';
  end if;

  update public.players
  set left_at = now(), is_ready = false, kicked_at = now()
  where id = p_player_id and room_id = target_room.id and left_at is null;
  if not found then raise exception 'Esse jogador não está mais na sala.'; end if;

  delete from public.discussion_skip_votes where voter_player_id = p_player_id;
  update public.players set last_seen_at = now() where id = caller_id;
  update public.rooms set updated_at = now() where id = target_room.id;
end;
$$;

revoke all on function public.kick_player(text, text, uuid) from public;
grant execute on function public.kick_player(text, text, uuid) to anon, authenticated;

create or replace function public.join_room(p_code text, p_nickname text, p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  joined_player public.players;
  clean_name text;
  token_hash bytea;
begin
  if p_code is null or p_code !~* '^[A-HJ-NP-Z2-9]{6}$' then raise exception 'Código de sala inválido.'; end if;
  if p_nickname is null or octet_length(p_nickname) > 80 then raise exception 'Apelido inválido.'; end if;
  if p_session_token is null or p_session_token !~ '^[0-9a-f]{48}$' then raise exception 'Sessão inválida.'; end if;
  clean_name := trim(regexp_replace(p_nickname, '\s+', ' ', 'g'));
  if char_length(clean_name) not between 2 and 20 then raise exception 'Apelido deve ter entre 2 e 20 caracteres.'; end if;
  token_hash := private.hash_token(p_session_token);

  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null then raise exception 'Sala não encontrada ou expirada.'; end if;

  if target_room.phase = 'lobby' then
    update public.players set left_at = now(), is_ready = false
      where room_id = target_room.id and left_at is null and last_seen_at < now() - interval '2 minutes';
  end if;

  select * into joined_player from public.players where room_id = target_room.id and session_hash = token_hash;
  if joined_player.id is not null then
    if joined_player.kicked_at is not null and target_room.phase <> 'lobby' then
      raise exception 'O anfitrião tirou você desta rodada. Entre de novo quando ela acabar.';
    end if;
    if target_room.phase <> 'lobby'
      and not exists (select 1 from private.round_roles where round_id = target_room.current_round_id and player_id = joined_player.id)
    then
      raise exception 'A rodada já começou. Entre novamente quando ela terminar.';
    end if;
    update public.players
    set nickname = clean_name, left_at = null, kicked_at = null, last_seen_at = now(), user_id = coalesce(auth.uid(), user_id)
    where id = joined_player.id;
    return jsonb_build_object('room_id', target_room.id, 'code', target_room.code, 'reconnected', true);
  end if;

  if target_room.phase <> 'lobby' then raise exception 'A partida já começou.'; end if;
  if (select count(*) from public.players where room_id = target_room.id and left_at is null) >= target_room.player_limit then raise exception 'A sala está cheia.'; end if;

  begin
    insert into public.players(room_id, user_id, session_hash, nickname)
    values (target_room.id, auth.uid(), token_hash, clean_name)
    returning * into joined_player;
  exception when unique_violation then
    raise exception 'Este apelido já está sendo usado na sala.';
  end;
  return jsonb_build_object('room_id', target_room.id, 'code', target_room.code, 'reconnected', false);
end;
$$;

create or replace function public.room_snapshot(p_code text, p_session_token text)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  current_player uuid;
  player_json jsonb;
  votes_cast integer := 0;
  eligible_voters integer := 0;
  current_has_voted boolean := false;
  roles_seen integer := 0;
  round_players integer := 0;
  discussion_votes_cast integer := 0;
  discussion_more_time integer := 0;
  discussion_go_voting integer := 0;
  current_discussion_choice text;
  current_turn_player uuid;
  skip_votes integer := 0;
  current_skip boolean := false;
begin
  select * into target_room from public.rooms
  where code = upper(trim(p_code)) and expires_at > now();
  if target_room.id is null then raise exception 'Sala não encontrada ou expirada.'; end if;
  current_player := private.require_player(target_room.id, p_session_token);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nickname', p.nickname, 'is_me', p.id = current_player,
    'is_host', p.id = target_room.host_player_id, 'is_ready', p.is_ready,
    'is_online', p.left_at is null and p.last_seen_at > now() - interval '75 seconds',
    'score', p.score
  ) order by coalesce(rr.turn_order, 999), p.joined_at), '[]'::jsonb)
  into player_json
  from public.players p
  left join private.round_roles rr
    on rr.player_id = p.id and rr.round_id = target_room.current_round_id
  where p.room_id = target_room.id
    and (
      (target_room.phase = 'results' and rr.player_id is not null)
      or (p.left_at is null and p.last_seen_at > now() - interval '75 seconds')
    );

  if target_room.current_round_id is not null then
    select count(*) into votes_cast
      from public.votes v
      join public.players p on p.id = v.voter_player_id
      where v.round_id = target_room.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    select count(*) into eligible_voters
      from private.round_roles rr
      join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    select exists(
      select 1 from public.votes v
      join public.players p on p.id = v.voter_player_id
      where v.round_id = target_room.current_round_id
        and v.voter_player_id = current_player
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds'
    ) into current_has_voted;
    select count(*) filter (where rr.revealed_at is not null), count(*)
      into roles_seen, round_players
      from private.round_roles rr
      join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    select count(*),
      count(*) filter (where dv.choice = 'more_time'),
      count(*) filter (where dv.choice = 'voting')
      into discussion_votes_cast, discussion_more_time, discussion_go_voting
      from public.discussion_votes dv
      join public.players p on p.id = dv.voter_player_id
      where dv.round_id = target_room.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    select dv.choice into current_discussion_choice
      from public.discussion_votes dv
      where dv.round_id = target_room.current_round_id
        and dv.voter_player_id = current_player;
    select rr.player_id into current_turn_player
      from private.round_roles rr
      join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id
        and rr.turn_order = target_room.discussion_turn_order
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    select count(*), coalesce(bool_or(sv.voter_player_id = current_player), false)
      into skip_votes, current_skip
      from public.discussion_skip_votes sv
      join public.players p on p.id = sv.voter_player_id
      where sv.round_id = target_room.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
  end if;

  return jsonb_build_object(
    'room_id', target_room.id, 'code', target_room.code, 'phase', target_room.phase,
    'category', target_room.category, 'player_limit', target_room.player_limit,
    'impostor_count', target_room.impostor_count,
    'discussion_seconds', target_room.discussion_seconds,
    'round_number', target_room.round_number, 'phase_ends_at', target_room.phase_ends_at,
    'vote_count', votes_cast, 'eligible_voter_count', eligible_voters,
    'has_voted', current_has_voted,
    'roles_seen_count', roles_seen, 'round_player_count', round_players,
    'discussion_stage', target_room.discussion_stage,
    'discussion_turn_order', target_room.discussion_turn_order,
    'discussion_turn_player_id', current_turn_player,
    'discussion_vote_count', discussion_votes_cast,
    'discussion_more_time_count', discussion_more_time,
    'discussion_go_voting_count', discussion_go_voting,
    'has_discussion_voted', current_discussion_choice is not null,
    'discussion_vote_choice', current_discussion_choice,
    'discussion_skip_count', skip_votes,
    'has_skip_voted', current_skip,
    'players', player_json, 'server_now', now(),
    'revealed_word', case when target_room.phase = 'results' then target_room.revealed_word end,
    'eliminated_player_ids', case when target_room.phase = 'results' then to_jsonb(target_room.eliminated_player_ids) else '[]'::jsonb end,
    'impostor_player_ids', case when target_room.phase = 'results' then to_jsonb(target_room.impostor_player_ids) else '[]'::jsonb end,
    'winner', case when target_room.phase = 'results' then target_room.winner end
  );
end;
$$;
