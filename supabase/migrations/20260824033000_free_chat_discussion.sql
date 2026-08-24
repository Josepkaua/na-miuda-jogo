create or replace function private.initialize_discussion_state()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.phase = 'discussion' and old.phase is distinct from 'discussion' then
    new.discussion_stage := 'free_chat';
    new.discussion_turn_order := null;
  elsif new.phase <> 'discussion' then
    new.discussion_stage := 'resolved';
    new.discussion_turn_order := null;
  end if;
  return new;
end;
$$;

revoke all on function private.initialize_discussion_state() from public, anon, authenticated;

create or replace function public.open_discussion_decision(
  p_code text,
  p_session_token text,
  p_expected_round integer
)
returns jsonb language plpgsql volatile security definer
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
  if target_room.host_player_id <> caller_id then raise exception 'Somente o anfitrião pode encerrar a conversa.'; end if;
  if target_room.round_number <> p_expected_round then raise exception 'A rodada já mudou.'; end if;
  if target_room.phase <> 'discussion' or target_room.discussion_stage not in ('turns', 'free_chat') then
    raise exception 'A conversa livre não está aberta.';
  end if;
  if exists (
    select 1 from public.discussion_votes dv
    where dv.round_id = target_room.current_round_id
  ) then raise exception 'A turma já decidiu o próximo passo.'; end if;

  update public.rooms
  set discussion_stage = 'decision', discussion_turn_order = null,
    phase_ends_at = null, updated_at = now()
  where id = target_room.id;

  return jsonb_build_object('discussion_stage', 'decision');
end;
$$;

revoke all on function public.open_discussion_decision(text,text,integer) from public;
grant execute on function public.open_discussion_decision(text,text,integer) to anon, authenticated;

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
    select 1 from private.round_roles rr join public.players p on p.id = rr.player_id
    where rr.round_id = target_room.current_round_id and rr.player_id = caller_id and p.left_at is null
  ) then raise exception 'Você não participa desta rodada.'; end if;

  insert into public.discussion_votes(round_id, voter_player_id, choice)
  values (target_room.current_round_id, caller_id, p_choice)
  on conflict (round_id, voter_player_id) do update
    set choice = excluded.choice, created_at = now();

  select count(*) into eligible_count
  from private.round_roles rr join public.players p on p.id = rr.player_id
  where rr.round_id = target_room.current_round_id and p.left_at is null;

  select count(*), count(*) filter (where dv.choice = 'more_time'), count(*) filter (where dv.choice = 'voting')
  into vote_count, more_time_count, voting_count
  from public.discussion_votes dv
  join public.players p on p.id = dv.voter_player_id
  where dv.round_id = target_room.current_round_id and p.left_at is null;

  if more_time_count > eligible_count / 2 or (vote_count >= eligible_count and more_time_count >= voting_count) then
    outcome := 'more_time';
    update public.rooms set discussion_stage = 'free_chat', discussion_turn_order = null,
      phase_ends_at = now() + interval '1 minute', updated_at = now()
    where id = target_room.id;
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

revoke all on function public.cast_discussion_choice(text,text,text,integer) from public;
grant execute on function public.cast_discussion_choice(text,text,text,integer) to anon, authenticated;
