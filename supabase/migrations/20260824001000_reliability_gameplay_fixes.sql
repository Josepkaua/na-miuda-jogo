-- Reliability, fair randomization, voting quorum, profile integrity and safe exits.

create or replace function private.new_room_code()
returns text language plpgsql volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into candidate from generate_series(1, 6);
    exit when not exists (select 1 from public.rooms where code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function private.require_player(p_room_id uuid, p_session_token text)
returns uuid language plpgsql stable security definer
set search_path = ''
as $$
declare found_id uuid;
begin
  if p_session_token is null or p_session_token !~ '^[0-9a-f]{48}$' then
    raise exception 'Sessão inválida.' using errcode = 'P0001';
  end if;
  select id into found_id
  from public.players
  where room_id = p_room_id
    and session_hash = private.hash_token(p_session_token)
    and left_at is null;
  if found_id is null then raise exception 'Você não faz parte desta sala.' using errcode = 'P0001'; end if;
  return found_id;
end;
$$;

create or replace function public.create_room(
  p_nickname text,
  p_session_token text,
  p_category text,
  p_player_limit integer,
  p_impostor_count integer,
  p_discussion_seconds integer
)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  new_room public.rooms;
  new_player public.players;
  clean_name text;
  token_hash bytea;
begin
  if p_nickname is null or octet_length(p_nickname) > 80 then raise exception 'Apelido inválido.'; end if;
  if p_session_token is null or p_session_token !~ '^[0-9a-f]{48}$' then raise exception 'Sessão inválida.'; end if;
  clean_name := trim(regexp_replace(p_nickname, '\s+', ' ', 'g'));
  if char_length(clean_name) not between 2 and 20 then raise exception 'Apelido deve ter entre 2 e 20 caracteres.'; end if;
  if p_category not in ('paises','comidas','brasil','futebol','filmes','profissoes','animais','musica','games','objetos','internet','misturado') then raise exception 'Assunto inválido.'; end if;
  if p_player_limit not between 3 and 20 then raise exception 'A sala deve aceitar de 3 a 20 jogadores.'; end if;
  if p_impostor_count not between 1 and least(5, greatest(1, floor((p_player_limit - 1)::numeric / 3)::int)) then raise exception 'Quantidade de impostores desequilibrada para esta sala.'; end if;
  if p_discussion_seconds not between 60 and 900 then raise exception 'Tempo inválido.'; end if;
  token_hash := private.hash_token(p_session_token);
  if (select count(*) from public.rooms where created_by_hash = token_hash and created_at > now() - interval '1 minute') >= 3 then raise exception 'Aguarde um pouco antes de criar outra sala.'; end if;

  insert into public.rooms(code, category, player_limit, impostor_count, discussion_seconds, created_by_hash)
  values (private.new_room_code(), p_category, p_player_limit, p_impostor_count, p_discussion_seconds, token_hash)
  returning * into new_room;

  insert into public.players(room_id, user_id, session_hash, nickname)
  values (new_room.id, auth.uid(), token_hash, clean_name)
  returning * into new_player;

  update public.rooms set host_player_id = new_player.id where id = new_room.id;
  return jsonb_build_object('room_id', new_room.id, 'code', new_room.code);
end;
$$;

create or replace function public.join_room(p_code text, p_nickname text, p_session_token text)
returns jsonb language plpgsql volatile security definer
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
    if target_room.phase <> 'lobby'
      and not exists (select 1 from private.round_roles where round_id = target_room.current_round_id and player_id = joined_player.id)
    then
      raise exception 'A rodada já começou. Entre novamente quando ela terminar.';
    end if;
    update public.players set nickname = clean_name, left_at = null, last_seen_at = now(), user_id = coalesce(auth.uid(), user_id) where id = joined_player.id;
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

create or replace function public.leave_room(p_code text, p_session_token text)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  player_id uuid;
  replacement_host uuid;
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null then return; end if;
  player_id := private.require_player(target_room.id, p_session_token);
  update public.players set left_at = now(), is_ready = false, last_seen_at = now() where id = player_id;
  if target_room.host_player_id = player_id then
    select id into replacement_host
      from public.players
      where room_id = target_room.id and left_at is null
      order by (last_seen_at > now() - interval '60 seconds') desc, joined_at
      limit 1;
    update public.rooms set host_player_id = replacement_host, updated_at = now() where id = target_room.id;
  else
    update public.rooms set updated_at = now() where id = target_room.id;
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
    where room_id = target_room.id and left_at is null and last_seen_at < now() - interval '45 seconds';

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

create or replace function public.room_snapshot(p_code text, p_session_token text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  current_player uuid;
  player_json jsonb;
  votes_cast integer := 0;
  eligible_voters integer := 0;
  current_has_voted boolean := false;
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null then raise exception 'Sala não encontrada ou expirada.'; end if;
  current_player := private.require_player(target_room.id, p_session_token);
  update public.players set last_seen_at = now(), user_id = coalesce(user_id, auth.uid()) where id = current_player;

  if not exists (select 1 from public.players where id = target_room.host_player_id and left_at is null and last_seen_at > now() - interval '60 seconds') then
    select id into target_room.host_player_id from public.players where room_id = target_room.id and left_at is null order by (last_seen_at > now() - interval '60 seconds') desc, joined_at limit 1;
    update public.rooms set host_player_id = target_room.host_player_id, updated_at = now() where id = target_room.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nickname', p.nickname, 'is_me', p.id = current_player,
    'is_host', p.id = target_room.host_player_id, 'is_ready', p.is_ready,
    'is_online', p.left_at is null and p.last_seen_at > now() - interval '45 seconds', 'score', p.score
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
  end if;

  return jsonb_build_object(
    'room_id', target_room.id, 'code', target_room.code, 'phase', target_room.phase,
    'category', target_room.category, 'player_limit', target_room.player_limit,
    'impostor_count', target_room.impostor_count, 'discussion_seconds', target_room.discussion_seconds,
    'round_number', target_room.round_number, 'phase_ends_at', target_room.phase_ends_at,
    'vote_count', votes_cast, 'eligible_voter_count', eligible_voters, 'has_voted', current_has_voted,
    'players', player_json, 'server_now', now(),
    'revealed_word', case when target_room.phase = 'results' then target_room.revealed_word end,
    'eliminated_player_ids', case when target_room.phase = 'results' then to_jsonb(target_room.eliminated_player_ids) else '[]'::jsonb end,
    'impostor_player_ids', case when target_room.phase = 'results' then to_jsonb(target_room.impostor_player_ids) else '[]'::jsonb end,
    'winner', case when target_room.phase = 'results' then target_room.winner end
  );
end;
$$;

create or replace function public.get_my_role(p_code text, p_session_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  current_player_id uuid;
  my_role private.round_roles;
  round_secret private.round_secrets;
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now();
  if target_room.id is null or target_room.current_round_id is null then raise exception 'Nenhuma rodada ativa.'; end if;
  current_player_id := private.require_player(target_room.id, p_session_token);
  select rr.* into my_role from private.round_roles rr where rr.round_id = target_room.current_round_id and rr.player_id = current_player_id;
  if my_role.player_id is null then raise exception 'Você não participa desta rodada.'; end if;
  select * into round_secret from private.round_secrets where round_id = target_room.current_round_id;
  return jsonb_build_object('role', my_role.role, 'word', my_role.visible_word, 'category', round_secret.category, 'turn_order', my_role.turn_order);
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
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null then raise exception 'Sala não encontrada.'; end if;
  caller_id := private.require_player(target_room.id, p_session_token);
  if caller_id <> target_room.host_player_id then raise exception 'Apenas o anfitrião pode avançar a partida.'; end if;
  if target_room.phase <> p_expected_phase or target_room.round_number <> p_expected_round then
    raise exception 'A partida já avançou. Atualize a tela.';
  end if;

  if target_room.phase = 'reveal' then
    update public.rooms set phase = 'discussion', phase_ends_at = now() + make_interval(secs => discussion_seconds), updated_at = now() where id = target_room.id;
  elsif target_room.phase = 'discussion' then
    update public.rooms set phase = 'voting', phase_ends_at = now() + interval '90 seconds', updated_at = now() where id = target_room.id;
  elsif target_room.phase = 'voting' then
    select count(*) into vote_total
      from public.votes v join public.players p on p.id = v.voter_player_id
      where v.round_id = target_room.current_round_id and p.left_at is null;
    select count(*) into player_total
      from private.round_roles rr join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id and p.left_at is null;
    if vote_total < player_total and (target_room.phase_ends_at is null or target_room.phase_ends_at > now()) then
      raise exception 'Aguarde todos votarem ou o tempo da votação terminar.';
    end if;
    if vote_total = 0 then raise exception 'É necessário pelo menos um voto para revelar o resultado.'; end if;

    select coalesce(array_agg(player_id), '{}') into impostors
      from private.round_roles where round_id = target_room.current_round_id and role = 'impostor';
    select coalesce(array_agg(rr.player_id), '{}') into departed_impostors
      from private.round_roles rr join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id and rr.role = 'impostor' and p.left_at is not null;
    remaining_slots := greatest(0, coalesce(array_length(impostors, 1), 0) - coalesce(array_length(departed_impostors, 1), 0));

    if remaining_slots > 0 then
      with candidates as (
        select rr.player_id, count(v.target_player_id)::integer as votes
        from private.round_roles rr
        join public.players p on p.id = rr.player_id and p.left_at is null
        left join public.votes v on v.round_id = rr.round_id and v.target_player_id = rr.player_id
          and exists (select 1 from public.players voter where voter.id = v.voter_player_id and voter.left_at is null)
        where rr.round_id = target_room.current_round_id
        group by rr.player_id
      ), cutoff as (
        select votes from candidates order by votes desc offset (remaining_slots - 1) limit 1
      )
      select coalesce(array_agg(player_id order by player_id), '{}') into top_targets
        from candidates where votes >= (select votes from cutoff);
    end if;
    top_targets := coalesce(top_targets, '{}') || coalesce(departed_impostors, '{}');
    group_won := impostors <@ top_targets and top_targets <@ impostors;
    select rs.secret_word into selected_word from private.round_secrets rs where rs.round_id = target_room.current_round_id;

    update public.rooms set phase = 'results', phase_ends_at = null, revealed_word = selected_word,
      eliminated_player_ids = top_targets, impostor_player_ids = impostors,
      winner = case when group_won then 'group'::public.game_winner else 'impostor'::public.game_winner end,
      updated_at = now() where id = target_room.id;
    if group_won then
      update public.players set score = score + 1 where room_id = target_room.id and left_at is null and not (id = any(impostors));
    else
      update public.players set score = score + 2 where id = any(impostors) and left_at is null;
    end if;

    update public.profiles profile set
      games_played = profile.games_played + 1,
      wins = profile.wins + case
        when (group_won and rr.role = 'player') or (not group_won and rr.role = 'impostor') then 1 else 0 end,
      updated_at = now()
    from public.players p
    join private.round_roles rr on rr.player_id = p.id and rr.round_id = target_room.current_round_id
    where profile.user_id = p.user_id and p.left_at is null;

    update public.rounds set ended_at = now() where id = target_room.current_round_id;
  elsif target_room.phase = 'results' then
    update public.rooms set phase = 'lobby', phase_ends_at = null, updated_at = now() where id = target_room.id;
    update public.players set is_ready = false where room_id = target_room.id and left_at is null;
  else
    raise exception 'A partida ainda não começou.';
  end if;
  return jsonb_build_object('phase_advanced', true);
end;
$$;

revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, preferred_theme) on public.profiles to authenticated;

revoke all on function public.advance_phase(text,text) from anon, authenticated;
revoke all on function public.leave_room(text,text) from public;
revoke all on function public.advance_phase(text,text,public.game_phase,integer) from public;
grant execute on function public.leave_room(text,text) to anon, authenticated;
grant execute on function public.advance_phase(text,text,public.game_phase,integer) to anon, authenticated;
