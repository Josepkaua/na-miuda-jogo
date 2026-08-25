-- Make the automatic/collective game flow a database invariant, not only a UI convention.
-- This migration is safe to apply after the frontend no longer exposes manual phase shortcuts.

create or replace function private.enforce_automatic_phase_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  eligible_count integer := 0;
  vote_count integer := 0;
begin
  if new.phase is not distinct from old.phase then
    return new;
  end if;

  if old.phase = 'reveal' and new.phase = 'discussion' then
    if exists (
      select 1
      from private.round_roles rr
      join public.players p on p.id = rr.player_id
      where rr.round_id = old.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds'
        and rr.revealed_at is null
    ) then
      raise exception 'Aguarde todos os jogadores ativos verem o papel.';
    end if;
  elsif old.phase = 'discussion' and new.phase = 'voting' then
    if new.discussion_stage is distinct from 'resolved' then
      raise exception 'A votação começa somente pela decisão coletiva da turma.';
    end if;
    if not exists (
      select 1
      from public.disussion_votes dv
      join public.players p on p.id = dv.voter_player_id
      where dv.round_id = old.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds'
    ) then
      raise exception 'A votação exige uma decisão coletiva registrada.';
    end if;
  elsif old.phase = 'voting' and new.phase = 'results' then
    select count(*) into eligible_count
    from private.round_roles rr
    join public.players p on p.id = rr.player_id
    where rr.round_id = old.current_round_id
      and p.left_at is null
      and p.last_seen_at > now() - interval '75 seconds';

    select count(*) into vote_count
    from public.votes v
    join public.players p on p.id = v.voter_player_id
    where v.round_id = old.current_round_id
      and p.left_at is null
      and p.last_seen_at > now() - interval '75 seconds';

    if vote_count < eligible_count
      and (old.phase_ends_at is null or old.phase_ends_at > now())
    then
      raise exception 'Aguarde todos votarem ou o tempo da votação terminar.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_automatic_phase_integrity() from public, anon, authenticated;

drop trigger if exists enforce_automatic_phase_integrity on public.rooms;
create trigger enforce_automatic_phase_integrity
before update of phase on public.rooms
for each row
execute function private.enforce_automatic_phase_integrity();

-- Leaving must never hand the room to a stale browser session.
create or replace function public.leave_room(p_code text, p_session_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  player_id uuid;
  replacement_host uuid;
begin
  select * into target_room
  from public.rooms
  where code = upper(trim(p_code)) and expires_at > now()
  for update;

  if target_room.id is null then return; end if;
  player_id := private.require_player(target_room.id, p_session_token);

  update public.players
  set left_at = now(), is_ready = false, last_seen_at = now()
  where id = player_id;

  update public.players
  set left_at = now(), is_ready = false
  where room_id = target_room.id
    and id <> player_id
    and left_at is null
    and last_seen_at <= now() - interval '75 seconds';

  if target_room.host_player_id = player_id then
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
  else
    update public.rooms set updated_at = now() where id = target_room.id;
  end if;
end;
$$;

revoke all on function public.leave_room(text, text) from public;
grant execute on function public.leave_room(text, text) to anon, authenticated;

-- Legacy overload with old scoring/flow. It is no longer called by the frontend and had no anon/authenticated grants.
drop function if exists public.advance_phase(text, text);

-- The collective choice opens itself when the discussion clock expires, so the host shortcut is obsolete.
drop function if exists public.open_discussion_decision(text, text, integer);
