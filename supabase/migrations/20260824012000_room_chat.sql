-- Secure room chat for remote play. Guests authenticate with the same
-- high-entropy session token used by the game RPCs; the table stays private.

create table public.chat_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create index chat_messages_room_id_idx
  on public.chat_messages(room_id, id desc);

create index chat_messages_created_at_idx
  on public.chat_messages(created_at);

alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;

create or replace function public.list_chat_messages(
  p_code text,
  p_session_token text,
  p_after_id bigint default null
)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  current_player uuid;
  message_json jsonb;
begin
  select * into target_room
    from public.rooms
    where code = upper(trim(p_code)) and expires_at > now();
  if target_room.id is null then raise exception 'Sala não encontrada ou expirada.'; end if;

  current_player := private.require_player(target_room.id, p_session_token);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', recent.id,
    'player_id', recent.player_id,
    'nickname', recent.nickname,
    'body', recent.body,
    'created_at', recent.created_at,
    'is_me', recent.player_id = current_player
  ) order by recent.id), '[]'::jsonb)
  into message_json
  from (
    select m.id, m.player_id, p.nickname, m.body, m.created_at
    from public.chat_messages m
    join public.players p on p.id = m.player_id
    where m.room_id = target_room.id
      and (p_after_id is null or m.id > p_after_id)
    order by m.id desc
    limit case when p_after_id is null then 80 else 100 end
  ) recent;

  return message_json;
end;
$$;

create or replace function public.send_chat_message(
  p_code text,
  p_session_token text,
  p_body text
)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  current_player uuid;
  clean_body text := trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  inserted_message public.chat_messages;
begin
  select * into target_room
    from public.rooms
    where code = upper(trim(p_code)) and expires_at > now();
  if target_room.id is null then raise exception 'Sala não encontrada ou expirada.'; end if;

  current_player := private.require_player(target_room.id, p_session_token);
  perform 1 from public.players where id = current_player for update;

  if target_room.phase = 'reveal' then
    raise exception 'O chat fica pausado enquanto todos veem o papel secreto.';
  end if;
  if char_length(clean_body) not between 1 and 280 then
    raise exception 'A mensagem deve ter entre 1 e 280 caracteres.';
  end if;
  if (
    select count(*)
    from public.chat_messages
    where player_id = current_player
      and created_at > now() - interval '10 seconds'
  ) >= 6 then
    raise exception 'Muitas mensagens seguidas. Espere alguns segundos.';
  end if;

  select * into inserted_message
    from public.chat_messages
    where player_id = current_player
      and body = clean_body
      and created_at > now() - interval '2 seconds'
    order by id desc
    limit 1;

  if inserted_message.id is null then
    insert into public.chat_messages(room_id, player_id, body)
    values (target_room.id, current_player, clean_body)
    returning * into inserted_message;
  end if;

  update public.players set last_seen_at = now() where id = current_player;

  return jsonb_build_object(
    'id', inserted_message.id,
    'created_at', inserted_message.created_at
  );
end;
$$;

revoke all on function public.list_chat_messages(text,text,bigint) from public;
revoke all on function public.send_chat_message(text,text,text) from public;
grant execute on function public.list_chat_messages(text,text,bigint) to anon, authenticated;
grant execute on function public.send_chat_message(text,text,text) to anon, authenticated;
