create index if not exists round_roles_player_idx on private.round_roles(player_id);
create index if not exists players_user_idx on public.players(user_id);
create index if not exists rooms_current_round_idx on public.rooms(current_round_id);
create index if not exists rooms_host_player_idx on public.rooms(host_player_id);
create index if not exists votes_target_player_idx on public.votes(target_player_id);
create index if not exists votes_voter_player_idx on public.votes(voter_player_id);

create policy "rooms deny direct access"
on public.rooms as restrictive for all to anon, authenticated
using (false) with check (false);

create policy "players deny direct access"
on public.players as restrictive for all to anon, authenticated
using (false) with check (false);

create policy "rounds deny direct access"
on public.rounds as restrictive for all to anon, authenticated
using (false) with check (false);

create policy "votes deny direct access"
on public.votes as restrictive for all to anon, authenticated
using (false) with check (false);

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
  select rr.* into my_role
    from private.round_roles rr
    where rr.round_id = target_room.current_round_id and rr.player_id = current_player_id;
  select * into round_secret from private.round_secrets where round_id = target_room.current_round_id;
  return jsonb_build_object('role', my_role.role, 'word', my_role.visible_word, 'category', round_secret.category, 'turn_order', my_role.turn_order);
end;
$$;

create or replace function public.advance_phase(p_code text, p_session_token text)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  caller_id uuid;
  vote_total integer;
  player_total integer;
  top_targets uuid[];
  impostors uuid[];
  group_won boolean;
  selected_word text;
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null then raise exception 'Sala não encontrada.'; end if;
  caller_id := private.require_player(target_room.id, p_session_token);
  if caller_id <> target_room.host_player_id then raise exception 'Apenas o anfitrião pode avançar a partida.'; end if;

  if target_room.phase = 'reveal' then
    update public.rooms set phase = 'discussion', phase_ends_at = now() + make_interval(secs => discussion_seconds), updated_at = now() where id = target_room.id;
  elsif target_room.phase = 'discussion' then
    update public.rooms set phase = 'voting', phase_ends_at = null, updated_at = now() where id = target_room.id;
  elsif target_room.phase = 'voting' then
    select count(*) into vote_total from public.votes where round_id = target_room.current_round_id;
    select count(*) into player_total from public.players where room_id = target_room.id and left_at is null;
    if vote_total < player_total then raise exception 'Aguarde todos os jogadores votarem.'; end if;
    with tally as (
      select target_player_id, count(*) votes
      from public.votes where round_id = target_room.current_round_id group by target_player_id
    ), leaders as (
      select target_player_id from tally where votes = (select max(votes) from tally)
    )
    select coalesce(array_agg(target_player_id), '{}') into top_targets from leaders;
    select array_agg(player_id) into impostors from private.round_roles where round_id = target_room.current_round_id and role = 'impostor';
    select rs.secret_word into selected_word from private.round_secrets rs where rs.round_id = target_room.current_round_id;
    group_won := impostors <@ top_targets;
    update public.rooms set phase = 'results', phase_ends_at = null, revealed_word = selected_word,
      eliminated_player_ids = top_targets, impostor_player_ids = impostors,
      winner = case when group_won then 'group'::public.game_winner else 'impostor'::public.game_winner end,
      updated_at = now() where id = target_room.id;
    if group_won then
      update public.players set score = score + 1 where room_id = target_room.id and left_at is null and not (id = any(impostors));
    else
      update public.players set score = score + 2 where id = any(impostors);
    end if;
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

revoke all on function public.get_my_role(text,text), public.advance_phase(text,text) from public;
grant execute on function public.get_my_role(text,text), public.advance_phase(text,text) to anon, authenticated;
