-- A voluntary host exit must never hand the room to a stale browser session.

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
    update public.rooms
    set updated_at = now()
    where id = target_room.id;
  end if;
end;
$$;

revoke all on function public.leave_room(text, text) from public;
grant execute on function public.leave_room(text, text) to anon, authenticated;
