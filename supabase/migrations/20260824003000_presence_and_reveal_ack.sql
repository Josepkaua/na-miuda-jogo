-- Lower snapshot contention and require an explicit role reveal before discussion.

alter table private.round_roles
  add column if not exists revealed_at timestamptz;

create or replace function public.heartbeat_room(p_code text, p_session_token text)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  current_player uuid;
  replacement_host uuid;
begin
  select * into target_room
    from public.rooms
    where code = upper(trim(p_code)) and expires_at > now()
    for update;
  if target_room.id is null then return; end if;
  current_player := private.require_player(target_room.id, p_session_token);
  update public.players
    set last_seen_at = now(), user_id = coalesce(user_id, auth.uid())
    where id = current_player;

  if not exists (
    select 1 from public.players
    where id = target_room.host_player_id
      and left_at is null
      and last_seen_at > now() - interval '75 seconds'
  ) then
    select id into replacement_host
      from public.players
      where room_id = target_room.id and left_at is null
      order by (last_seen_at > now() - interval '75 seconds') desc, last_seen_at desc, joined_at
      limit 1;
    update public.rooms
      set host_player_id = replacement_host, updated_at = now()
      where id = target_room.id;
  end if;
end;
$$;

create or replace function public.start_round(p_code text, p_session_token text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  caller_id uuid;
  new_round uuid;
  chosen_word private.words;
  active_count integer;
  balanced_max integer;
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null then raise exception 'Sala não encontrada.'; end if;
  caller_id := private.require_player(target_room.id, p_session_token);
  if caller_id <> target_room.host_player_id then raise exception 'Apenas o anfitrião pode iniciar.'; end if;
  if target_room.phase <> 'lobby' then return jsonb_build_object('round_id', target_room.current_round_id, 'already_started', true); end if;

  update public.players set last_seen_at = now(), user_id = coalesce(user_id, auth.uid()) where id = caller_id;
  update public.players set left_at = now(), is_ready = false
    where room_id = target_room.id and left_at is null and last_seen_at < now() - interval '75 seconds';

  select count(*) into active_count from public.players where room_id = target_room.id and left_at is null;
  if active_count < 3 then raise exception 'São necessários pelo menos 3 jogadores online.'; end if;
  balanced_max := least(5, greatest(1, floor((active_count - 1)::numeric / 3)::int));
  if target_room.impostor_count > balanced_max then
    raise exception 'Para % impostores, convide mais jogadores ou reduza a quantidade.', target_room.impostor_count;
  end if;
  if exists (select 1 from public.players where room_id = target_room.id and left_at is null and not is_ready) then raise exception 'Ainda há jogadores que não estão prontos.'; end if;

  if target_room.category = 'misturado' then
    select * into chosen_word from private.words where active order by random() limit 1;
  else
    select * into chosen_word from private.words where active and category = target_room.category order by random() limit 1;
  end if;
  if chosen_word.id is null then raise exception 'Ainda não há palavras para este assunto.'; end if;

  insert into public.rounds(room_id, round_number) values (target_room.id, target_room.round_number + 1) returning id into new_round;
  insert into private.round_secrets(round_id, category, secret_word) values (new_round, chosen_word.category, chosen_word.word);

  with random_values as materialized (
    select id, random() as turn_rand, random() as role_rand
    from public.players where room_id = target_room.id and left_at is null
  ), shuffled as (
    select id,
      row_number() over (order by turn_rand, id)::smallint as turn_order,
      row_number() over (order by role_rand, id)::smallint as role_order
    from random_values
  )
  insert into private.round_roles(round_id, player_id, role, visible_word, turn_order)
  select new_round, id,
    case when role_order <= target_room.impostor_count then 'impostor'::private.player_role else 'player'::private.player_role end,
    case when role_order <= target_room.impostor_count then null else chosen_word.word end,
    turn_order
  from shuffled;

  update public.rooms set phase = 'reveal', current_round_id = new_round,
    round_number = round_number + 1, phase_ends_at = null, revealed_word = null,
    eliminated_player_ids = '{}', impostor_player_ids = '{}', winner = null, updated_at = now()
  where id = target_room.id;
  update public.players set is_ready = false where room_id = target_room.id and left_at is null;
  return jsonb_build_object('round_id', new_round, 'already_started', false);
end;
$$;

create or replace function public.acknowledge_role(
  p_code text,
  p_session_token text,
  p_expected_round integer
)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  current_player uuid;
begin
  select * into target_room
    from public.rooms
    where code = upper(trim(p_code)) and expires_at > now()
    for update;
  if target_room.id is null then raise exception 'Sala não encontrada.'; end if;
  if target_room.phase <> 'reveal' or target_room.round_number <> p_expected_round then
    raise exception 'Esta rodada já avançou.';
  end if;
  current_player := private.require_player(target_room.id, p_session_token);
  update private.round_roles
    set revealed_at = coalesce(revealed_at, now())
    where round_id = target_room.current_round_id and player_id = current_player;
  if not found then raise exception 'Você não participa desta rodada.'; end if;
  update public.players set last_seen_at = now() where id = current_player;
end;
$$;

create or replace function public.room_snapshot(p_code text, p_session_token text)
returns jsonb language plpgsql stable security definer
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
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now();
  if target_room.id is null then raise exception 'Sala não encontrada ou expirada.'; end if;
  current_player := private.require_player(target_room.id, p_session_token);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nickname', p.nickname, 'is_me', p.id = current_player,
    'is_host', p.id = target_room.host_player_id, 'is_ready', p.is_ready,
    'is_online', p.left_at is null and p.last_seen_at > now() - interval '75 seconds', 'score', p.score
  ) order by coalesce(rr.turn_order, 999), p.joined_at), '[]'::jsonb)
  into player_json
  from public.players p
  left join private.round_roles rr on rr.player_id = p.id and rr.round_id = target_room.current_round_id
  where p.room_id = target_room.id
    and (p.left_at is null or (target_room.phase = 'results' and rr.player_id is not null));

  if target_room.current_round_id is not null then
    select count(*) into votes_cast
      from public.votes v join public.players p on p.id = v.voter_player_id
      where v.round_id = target_room.current_round_id and p.left_at is null;
    select count(*) into eligible_voters
      from private.round_roles rr join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id and p.left_at is null;
    select exists(select 1 from public.votes where round_id = target_room.current_round_id and voter_player_id = current_player)
      into current_has_voted;
    select count(*) filter (where rr.revealed_at is not null), count(*)
      into roles_seen, round_players
      from private.round_roles rr
      join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
  end if;

  return jsonb_build_object(
    'room_id', target_room.id, 'code', target_room.code, 'phase', target_room.phase,
    'category', target_room.category, 'player_limit', target_room.player_limit,
    'impostor_count', target_room.impostor_count, 'discussion_seconds', target_room.discussion_seconds,
    'round_number', target_room.round_number, 'phase_ends_at', target_room.phase_ends_at,
    'vote_count', votes_cast, 'eligible_voter_count', eligible_voters, 'has_voted', current_has_voted,
    'roles_seen_count', roles_seen, 'round_player_count', round_players,
    'players', player_json, 'server_now', now(),
    'revealed_word', case when target_room.phase = 'results' then target_room.revealed_word end,
    'eliminated_player_ids', case when target_room.phase = 'results' then to_jsonb(target_room.eliminated_player_ids) else '[]'::jsonb end,
    'impostor_player_ids', case when target_room.phase = 'results' then to_jsonb(target_room.impostor_player_ids) else '[]'::jsonb end,
    'winner', case when target_room.phase = 'results' then target_room.winner end
  );
end;
$$;

create or replace function private.enforce_role_reveal_ready()
returns trigger language plpgsql volatile security definer
set search_path = ''
as $$
declare
  waiting_count integer;
begin
  if old.phase = 'reveal' and new.phase = 'discussion' and old.current_round_id is not null then
    select count(*) into waiting_count
      from private.round_roles rr
      join public.players p on p.id = rr.player_id
      where rr.round_id = old.current_round_id
        and rr.revealed_at is null
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    if waiting_count > 0 then
      raise exception 'Ainda há jogadores vendo o papel secreto.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_require_role_reveal on public.rooms;
create trigger rooms_require_role_reveal
before update of phase on public.rooms
for each row execute function private.enforce_role_reveal_ready();

revoke all on function public.acknowledge_role(text,text,integer) from public;
revoke all on function private.enforce_role_reveal_ready() from public, anon, authenticated;
grant execute on function public.acknowledge_role(text,text,integer) to anon, authenticated;
