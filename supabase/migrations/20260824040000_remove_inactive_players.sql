-- Remove inactive players from live rounds and never let stale sessions block a vote.

create index if not exists players_room_presence_idx
  on public.players(room_id, last_seen_at)
  where left_at is null;

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

  update public.players
    set left_at = now(), is_ready = false
    where room_id = target_room.id
      and id <> current_player
      and left_at is null
      and last_seen_at <= now() - interval '75 seconds';

  if not exists (
    select 1 from public.players
    where id = target_room.host_player_id
      and left_at is null
      and last_seen_at > now() - interval '75 seconds'
  ) then
    select id into replacement_host
      from public.players
      where room_id = target_room.id
        and left_at is null
        and last_seen_at > now() - interval '75 seconds'
      order by last_seen_at desc, joined_at
      limit 1;
    update public.rooms
      set host_player_id = replacement_host, updated_at = now()
      where id = target_room.id;
  end if;
end;
$$;

create or replace function public.cast_vote(p_code text, p_session_token text, p_target_player_id uuid)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  voter_id uuid;
begin
  select * into target_room
    from public.rooms
    where code = upper(trim(p_code)) and expires_at > now()
    for update;
  if target_room.id is null or target_room.phase <> 'voting' then
    raise exception 'A votação não está aberta.';
  end if;

  voter_id := private.require_player(target_room.id, p_session_token);
  update public.players set last_seen_at = now() where id = voter_id;
  update public.players set left_at = now(), is_ready = false
    where room_id = target_room.id
      and id <> voter_id
      and left_at is null
      and last_seen_at <= now() - interval '75 seconds';

  if p_target_player_id = voter_id then raise exception 'Você não pode votar em si mesmo.'; end if;
  if not exists (
    select 1 from public.players
    where id = p_target_player_id
      and room_id = target_room.id
      and left_at is null
      and last_seen_at > now() - interval '75 seconds'
  ) then raise exception 'Este jogador já saiu da sala.'; end if;

  insert into public.votes(round_id, voter_player_id, target_player_id)
  values (target_room.current_round_id, voter_id, p_target_player_id)
  on conflict (round_id, voter_player_id) do nothing;
  update public.rooms set updated_at = now() where id = target_room.id;
end;
$$;

create or replace function public.cast_discussion_choice(
  p_code text,
  p_session_token text,
  p_choice text,
  p_expected_round integer
)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  caller_id uuid;
  eligible_count integer := 0;
  vote_count integer := 0;
  more_time_count integer := 0;
  voting_count integer := 0;
  outcome text;
begin
  if p_choice not in ('more_time', 'voting') then raise exception 'Escolha inválida.'; end if;
  select * into target_room from public.rooms
  where code = upper(trim(p_code)) and expires_at > now()
  for update;
  if target_room.id is null then raise exception 'Sala não encontrada.'; end if;

  caller_id := private.require_player(target_room.id, p_session_token);
  update public.players set last_seen_at = now() where id = caller_id;
  update public.players set left_at = now(), is_ready = false
    where room_id = target_room.id
      and id <> caller_id
      and left_at is null
      and last_seen_at <= now() - interval '75 seconds';

  if target_room.round_number <> p_expected_round then raise exception 'A rodada já mudou.'; end if;
  if target_room.phase = 'discussion'
    and target_room.discussion_stage in ('turns', 'free_chat')
    and target_room.phase_ends_at is not null
    and target_room.phase_ends_at <= now()
    and not exists (
      select 1 from public.discussion_votes dv
      where dv.round_id = target_room.current_round_id
    )
  then
    update public.rooms
    set discussion_stage = 'decision', discussion_turn_order = null,
      phase_ends_at = null, updated_at = now()
    where id = target_room.id;
    target_room.discussion_stage := 'decision';
  end if;

  if target_room.phase <> 'discussion' or target_room.discussion_stage <> 'decision' then
    raise exception 'A decisão da turma não está aberta.';
  end if;
  if not exists (
    select 1 from private.round_roles rr
    join public.players p on p.id = rr.player_id
    where rr.round_id = target_room.current_round_id
      and rr.player_id = caller_id
      and p.left_at is null
      and p.last_seen_at > now() - interval '75 seconds'
  ) then raise exception 'Você não participa desta rodada.'; end if;

  insert into public.discussion_votes(round_id, voter_player_id, choice)
  values (target_room.current_round_id, caller_id, p_choice)
  on conflict (round_id, voter_player_id) do update
    set choice = excluded.choice, created_at = now();

  select count(*) into eligible_count
  from private.round_roles rr
  join public.players p on p.id = rr.player_id
  where rr.round_id = target_room.current_round_id
    and p.left_at is null
    and p.last_seen_at > now() - interval '75 seconds';

  select count(*),
    count(*) filter (where dv.choice = 'more_time'),
    count(*) filter (where dv.choice = 'voting')
  into vote_count, more_time_count, voting_count
  from public.discussion_votes dv
  join public.players p on p.id = dv.voter_player_id
  where dv.round_id = target_room.current_round_id
    and p.left_at is null
    and p.last_seen_at > now() - interval '75 seconds';

  if more_time_count > eligible_count / 2
    or (vote_count >= eligible_count and more_time_count >= voting_count)
  then
    outcome := 'more_time';
    update public.rooms set discussion_stage = 'free_chat', discussion_turn_order = null,
      phase_ends_at = now() + interval '1 minute', updated_at = now()
    where id = target_room.id;
    delete from public.discussion_votes
      where round_id = target_room.current_round_id;
  elsif voting_count > eligible_count / 2 or vote_count >= eligible_count then
    outcome := 'voting';
    update public.rooms set phase = 'voting', discussion_stage = 'resolved', discussion_turn_order = null,
      phase_ends_at = now() + interval '90 seconds', updated_at = now()
    where id = target_room.id;
  end if;

  return jsonb_build_object(
    'vote_count', vote_count,
    'eligible_voter_count', eligible_count,
    'more_time_count', more_time_count,
    'voting_count', voting_count,
    'outcome', outcome
  );
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
  discussion_votes_cast integer := 0;
  discussion_more_time integer := 0;
  discussion_go_voting integer := 0;
  current_discussion_choice text;
  current_turn_player uuid;
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
    'players', player_json, 'server_now', now(),
    'revealed_word', case when target_room.phase = 'results' then target_room.revealed_word end,
    'eliminated_player_ids', case when target_room.phase = 'results' then to_jsonb(target_room.eliminated_player_ids) else '[]'::jsonb end,
    'impostor_player_ids', case when target_room.phase = 'results' then to_jsonb(target_room.impostor_player_ids) else '[]'::jsonb end,
    'winner', case when target_room.phase = 'results' then target_room.winner end
  );
end;
$$;

create or replace function public.advance_phase(
  p_code text,
  p_session_token text,
  p_expected_phase public.game_phase,
  p_expected_round integer
)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  caller_id uuid;
  vote_total integer;
  player_total integer;
  top_targets uuid[] := '{}';
  impostors uuid[] := '{}';
  departed_impostors uuid[] := '{}';
  remaining_slots integer;
  group_won boolean;
  selected_word text;
begin
  select * into target_room from public.rooms
  where code = upper(trim(p_code)) and expires_at > now()
  for update;
  if target_room.id is null then raise exception 'Sala não encontrada.'; end if;
  caller_id := private.require_player(target_room.id, p_session_token);
  update public.players set last_seen_at = now() where id = caller_id;
  update public.players set left_at = now(), is_ready = false
    where room_id = target_room.id
      and id <> caller_id
      and left_at is null
      and last_seen_at <= now() - interval '75 seconds';

  if caller_id <> target_room.host_player_id then
    raise exception 'Apenas o anfitrião pode avançar a partida.';
  end if;
  if target_room.phase <> p_expected_phase or target_room.round_number <> p_expected_round then
    raise exception 'A partida já avançou. Atualize a tela.';
  end if;

  if target_room.phase = 'reveal' then
    update public.rooms
      set phase = 'discussion',
        phase_ends_at = now() + make_interval(secs => discussion_seconds),
        updated_at = now()
      where id = target_room.id;
  elsif target_room.phase = 'discussion' then
    update public.rooms
      set phase = 'voting', phase_ends_at = now() + interval '90 seconds', updated_at = now()
      where id = target_room.id;
  elsif target_room.phase = 'voting' then
    select count(*) into vote_total
      from public.votes v
      join public.players p on p.id = v.voter_player_id
      where v.round_id = target_room.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    select count(*) into player_total
      from private.round_roles rr
      join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    if vote_total < player_total
      and (target_room.phase_ends_at is null or target_room.phase_ends_at > now())
    then raise exception 'Aguarde todos votarem ou o tempo da votação terminar.'; end if;
    if vote_total = 0 then raise exception 'É necessário pelo menos um voto para revelar o resultado.'; end if;

    select coalesce(array_agg(player_id), '{}') into impostors
      from private.round_roles
      where round_id = target_room.current_round_id and role = 'impostor';
    select coalesce(array_agg(rr.player_id), '{}') into departed_impostors
      from private.round_roles rr
      join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id
        and rr.role = 'impostor'
        and (p.left_at is not null or p.last_seen_at <= now() - interval '75 seconds');
    remaining_slots := greatest(
      0,
      coalesce(array_length(impostors, 1), 0) - coalesce(array_length(departed_impostors, 1), 0)
    );

    if remaining_slots > 0 then
      with candidates as (
        select rr.player_id, count(v.target_player_id)::integer as votes
        from private.round_roles rr
        join public.players p
          on p.id = rr.player_id
          and p.left_at is null
          and p.last_seen_at > now() - interval '75 seconds'
        left join public.votes v
          on v.round_id = rr.round_id
          and v.target_player_id = rr.player_id
          and exists (
            select 1 from public.players voter
            where voter.id = v.voter_player_id
              and voter.left_at is null
              and voter.last_seen_at > now() - interval '75 seconds'
          )
        where rr.round_id = target_room.current_round_id
        group by rr.player_id
      ), cutoff as (
        select votes from candidates
        order by votes desc
        offset (remaining_slots - 1) limit 1
      )
      select coalesce(array_agg(player_id order by player_id), '{}') into top_targets
        from candidates where votes >= (select votes from cutoff);
    end if;
    top_targets := coalesce(top_targets, '{}') || coalesce(departed_impostors, '{}');
    group_won := impostors <@ top_targets and top_targets <@ impostors;
    select rs.secret_word into selected_word
      from private.round_secrets rs
      where rs.round_id = target_room.current_round_id;

    update public.rooms set phase = 'results', phase_ends_at = null,
      revealed_word = selected_word, eliminated_player_ids = top_targets,
      impostor_player_ids = impostors,
      winner = case when group_won then 'group'::public.game_winner else 'impostor'::public.game_winner end,
      updated_at = now()
    where id = target_room.id;

    if group_won then
      update public.players set score = score + 1
      where room_id = target_room.id
        and left_at is null
        and last_seen_at > now() - interval '75 seconds'
        and not (id = any(impostors));
    else
      update public.players set score = score + 2
      where id = any(impostors)
        and left_at is null
        and last_seen_at > now() - interval '75 seconds';
    end if;

    update public.profiles profile set
      games_played = profile.games_played + 1,
      wins = profile.wins + case
        when (group_won and rr.role = 'player') or (not group_won and rr.role = 'impostor') then 1
        else 0
      end,
      updated_at = now()
    from public.players p
    join private.round_roles rr
      on rr.player_id = p.id and rr.round_id = target_room.current_round_id
    where profile.user_id = p.user_id
      and p.left_at is null
      and p.last_seen_at > now() - interval '75 seconds';

    update public.rounds set ended_at = now() where id = target_room.current_round_id;
  elsif target_room.phase = 'results' then
    update public.rooms
      set phase = 'lobby', phase_ends_at = null, updated_at = now()
      where id = target_room.id;
    update public.players set is_ready = false
      where room_id = target_room.id and left_at is null;
  else
    raise exception 'A partida ainda não começou.';
  end if;
  return jsonb_build_object('phase_advanced', true);
end;
$$;

revoke all on function public.heartbeat_room(text,text) from public;
revoke all on function public.cast_vote(text,text,uuid) from public;
revoke all on function public.cast_discussion_choice(text,text,text,integer) from public;
revoke all on function public.room_snapshot(text,text) from public;
revoke all on function public.advance_phase(text,text,public.game_phase,integer) from public;

grant execute on function public.heartbeat_room(text,text) to anon, authenticated;
grant execute on function public.cast_vote(text,text,uuid) to anon, authenticated;
grant execute on function public.cast_discussion_choice(text,text,text,integer) to anon, authenticated;
grant execute on function public.room_snapshot(text,text) to anon, authenticated;
grant execute on function public.advance_phase(text,text,public.game_phase,integer) to anon, authenticated;
