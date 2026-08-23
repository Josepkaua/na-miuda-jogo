create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.game_phase as enum ('lobby', 'reveal', 'discussion', 'voting', 'results');
create type public.game_winner as enum ('group', 'impostor');
create type private.player_role as enum ('player', 'impostor');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text check (char_length(display_name) between 2 and 30),
  avatar_url text,
  preferred_theme text not null default 'system' check (preferred_theme in ('system', 'light', 'dark')),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  phase public.game_phase not null default 'lobby',
  category text not null,
  player_limit smallint not null check (player_limit between 3 and 20),
  impostor_count smallint not null check (impostor_count between 1 and 5),
  discussion_seconds integer not null check (discussion_seconds between 60 and 900),
  host_player_id uuid,
  current_round_id uuid,
  round_number integer not null default 0,
  phase_ends_at timestamptz,
  revealed_word text,
  eliminated_player_ids uuid[] not null default '{}',
  impostor_player_ids uuid[] not null default '{}',
  winner public.game_winner,
  created_by_hash bytea not null,
  expires_at timestamptz not null default now() + interval '12 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  session_hash bytea not null,
  nickname text not null check (char_length(nickname) between 2 and 20),
  is_ready boolean not null default false,
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  unique (room_id, session_hash)
);

create unique index players_room_nickname_unique
  on public.players(room_id, lower(nickname)) where left_at is null;
create index players_room_active_idx on public.players(room_id, joined_at) where left_at is null;
create index players_session_idx on public.players(room_id, session_hash);
create index rooms_code_idx on public.rooms(code);
create index rooms_expiry_idx on public.rooms(expires_at);

alter table public.rooms
  add constraint rooms_host_player_fk foreign key (host_player_id) references public.players(id) on delete set null;

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number integer not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (room_id, round_number)
);

alter table public.rooms
  add constraint rooms_current_round_fk foreign key (current_round_id) references public.rounds(id) on delete set null;

create table private.words (
  id bigint generated always as identity primary key,
  category text not null,
  word text not null,
  active boolean not null default true,
  unique (category, word)
);

create table private.round_secrets (
  round_id uuid primary key references public.rounds(id) on delete cascade,
  category text not null,
  secret_word text not null
);

create table private.round_roles (
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  role private.player_role not null,
  visible_word text,
  turn_order smallint not null,
  primary key (round_id, player_id),
  unique (round_id, turn_order)
);

create table public.votes (
  round_id uuid not null references public.rounds(id) on delete cascade,
  voter_player_id uuid not null references public.players(id) on delete cascade,
  target_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, voter_player_id),
  check (voter_player_id <> target_player_id)
);
create index votes_round_target_idx on public.votes(round_id, target_player_id);

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.votes enable row level security;

revoke all on public.rooms, public.players, public.rounds, public.votes from anon, authenticated;
grant select, update on public.profiles to authenticated;

create policy "profiles read own"
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "profiles update own"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function private.hash_token(p_token text)
returns bytea language sql immutable strict
set search_path = ''
as $$ select extensions.digest(p_token, 'sha256') $$;

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
    exit when not exists (select 1 from public.rooms where code = candidate and expires_at > now());
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
  clean_name text := trim(regexp_replace(p_nickname, '\s+', ' ', 'g'));
  token_hash bytea;
begin
  if char_length(clean_name) not between 2 and 20 then raise exception 'Apelido deve ter entre 2 e 20 caracteres.'; end if;
  if char_length(p_session_token) < 32 then raise exception 'Sessão inválida.'; end if;
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
  clean_name text := trim(regexp_replace(p_nickname, '\s+', ' ', 'g'));
  token_hash bytea := private.hash_token(p_session_token);
begin
  if char_length(clean_name) not between 2 and 20 then raise exception 'Apelido deve ter entre 2 e 20 caracteres.'; end if;
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null then raise exception 'Sala não encontrada ou expirada.'; end if;

  select * into joined_player from public.players where room_id = target_room.id and session_hash = token_hash;
  if joined_player.id is not null then
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

create or replace function public.heartbeat_room(p_code text, p_session_token text)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare room_id uuid;
begin
  select id into room_id from public.rooms where code = upper(trim(p_code)) and expires_at > now();
  if room_id is null then return; end if;
  update public.players set last_seen_at = now(), left_at = null where id = private.require_player(room_id, p_session_token);
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
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null then raise exception 'Sala não encontrada ou expirada.'; end if;
  current_player := private.require_player(target_room.id, p_session_token);
  update public.players set last_seen_at = now() where id = current_player;

  if not exists (select 1 from public.players where id = target_room.host_player_id and left_at is null and last_seen_at > now() - interval '60 seconds') then
    select id into target_room.host_player_id from public.players where room_id = target_room.id and left_at is null order by (last_seen_at > now() - interval '60 seconds') desc, joined_at limit 1;
    update public.rooms set host_player_id = target_room.host_player_id, updated_at = now() where id = target_room.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nickname', p.nickname, 'is_me', p.id = current_player,
    'is_host', p.id = target_room.host_player_id, 'is_ready', p.is_ready,
    'is_online', p.last_seen_at > now() - interval '45 seconds', 'score', p.score
  ) order by coalesce(rr.turn_order, 999), p.joined_at), '[]'::jsonb)
  into player_json
  from public.players p
  left join private.round_roles rr on rr.player_id = p.id and rr.round_id = target_room.current_round_id
  where p.room_id = target_room.id and p.left_at is null;

  if target_room.current_round_id is not null then select count(*) into votes_cast from public.votes where round_id = target_room.current_round_id; end if;

  return jsonb_build_object(
    'room_id', target_room.id, 'code', target_room.code, 'phase', target_room.phase,
    'category', target_room.category, 'player_limit', target_room.player_limit,
    'impostor_count', target_room.impostor_count, 'discussion_seconds', target_room.discussion_seconds,
    'round_number', target_room.round_number, 'phase_ends_at', target_room.phase_ends_at,
    'vote_count', votes_cast, 'players', player_json, 'server_now', now(),
    'revealed_word', case when target_room.phase = 'results' then target_room.revealed_word end,
    'eliminated_player_ids', case when target_room.phase = 'results' then to_jsonb(target_room.eliminated_player_ids) else '[]'::jsonb end,
    'impostor_player_ids', case when target_room.phase = 'results' then to_jsonb(target_room.impostor_player_ids) else '[]'::jsonb end,
    'winner', case when target_room.phase = 'results' then target_room.winner end
  );
end;
$$;

create or replace function public.set_player_ready(p_code text, p_session_token text, p_ready boolean)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare target_room public.rooms; player_id uuid;
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null or target_room.phase <> 'lobby' then raise exception 'Não é possível alterar o status agora.'; end if;
  player_id := private.require_player(target_room.id, p_session_token);
  update public.players set is_ready = p_ready, last_seen_at = now() where id = player_id;
  update public.rooms set updated_at = now() where id = target_room.id;
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
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null then raise exception 'Sala não encontrada.'; end if;
  caller_id := private.require_player(target_room.id, p_session_token);
  if caller_id <> target_room.host_player_id then raise exception 'Apenas o anfitrião pode iniciar.'; end if;
  if target_room.phase <> 'lobby' then return jsonb_build_object('round_id', target_room.current_round_id, 'already_started', true); end if;
  select count(*) into active_count from public.players where room_id = target_room.id and left_at is null;
  if active_count < 3 then raise exception 'São necessários pelo menos 3 jogadores.'; end if;
  if exists (select 1 from public.players where room_id = target_room.id and left_at is null and not is_ready) then raise exception 'Ainda há jogadores que não estão prontos.'; end if;
  if target_room.impostor_count >= active_count then raise exception 'Há impostores demais para a quantidade de jogadores.'; end if;

  if target_room.category = 'misturado' then
    select * into chosen_word from private.words where active order by random() limit 1;
  else
    select * into chosen_word from private.words where active and category = target_room.category order by random() limit 1;
  end if;
  if chosen_word.id is null then raise exception 'Ainda não há palavras para este assunto.'; end if;

  insert into public.rounds(room_id, round_number) values (target_room.id, target_room.round_number + 1) returning id into new_round;
  insert into private.round_secrets(round_id, category, secret_word) values (new_round, chosen_word.category, chosen_word.word);

  with shuffled as (
    select id, row_number() over (order by random())::smallint as turn_order,
      row_number() over (order by random()) <= target_room.impostor_count as is_impostor
    from public.players where room_id = target_room.id and left_at is null
  )
  insert into private.round_roles(round_id, player_id, role, visible_word, turn_order)
  select new_round, id,
    case when is_impostor then 'impostor'::private.player_role else 'player'::private.player_role end,
    case when is_impostor then null else chosen_word.word end,
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

create or replace function public.get_my_role(p_code text, p_session_token text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare target_room public.rooms; current_player_id uuid; my_role private.round_roles; round_secret private.round_secrets;
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now();
  if target_room.id is null or target_room.current_round_id is null then raise exception 'Nenhuma rodada ativa.'; end if;
  current_player_id := private.require_player(target_room.id, p_session_token);
  select rr.* into my_role from private.round_roles rr where rr.round_id = target_room.current_round_id and rr.player_id = current_player_id;
  select * into round_secret from private.round_secrets where round_id = target_room.current_round_id;
  return jsonb_build_object('role', my_role.role, 'word', my_role.visible_word, 'category', round_secret.category, 'turn_order', my_role.turn_order);
end;
$$;

create or replace function public.cast_vote(p_code text, p_session_token text, p_target_player_id uuid)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare target_room public.rooms; voter_id uuid;
begin
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now() for update;
  if target_room.id is null or target_room.phase <> 'voting' then raise exception 'A votação não está aberta.'; end if;
  voter_id := private.require_player(target_room.id, p_session_token);
  if p_target_player_id = voter_id then raise exception 'Você não pode votar em si mesmo.'; end if;
  if not exists (select 1 from public.players where id = p_target_player_id and room_id = target_room.id and left_at is null) then raise exception 'Jogador inválido.'; end if;
  insert into public.votes(round_id, voter_player_id, target_player_id) values (target_room.current_round_id, voter_id, p_target_player_id)
  on conflict (round_id, voter_player_id) do nothing;
  update public.rooms set updated_at = now() where id = target_room.id;
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
    with tally as (select target_player_id, count(*) votes from public.votes where round_id = target_room.current_round_id group by target_player_id), leaders as (select target_player_id from tally where votes = (select max(votes) from tally))
    select coalesce(array_agg(target_player_id), '{}') into top_targets from leaders;
    select array_agg(player_id) into impostors from private.round_roles where round_id = target_room.current_round_id and role = 'impostor';
    select rs.secret_word into selected_word from private.round_secrets rs where rs.round_id = target_room.current_round_id;
    group_won := impostors <@ top_targets;
    update public.rooms set phase = 'results', phase_ends_at = null, revealed_word = selected_word,
      eliminated_player_ids = top_targets, impostor_player_ids = impostors,
      winner = case when group_won then 'group'::public.game_winner else 'impostor'::public.game_winner end,
      updated_at = now() where id = target_room.id;
    if group_won then update public.players set score = score + 1 where room_id = target_room.id and left_at is null and not (id = any(impostors));
    else update public.players set score = score + 2 where id = any(impostors); end if;
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

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles(user_id, email, display_name, avatar_url)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (user_id) do update set email = excluded.email, avatar_url = excluded.avatar_url, updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function private.handle_new_user();

revoke all on function private.hash_token(text), private.new_room_code(), private.require_player(uuid, text), private.handle_new_user() from public, anon, authenticated;
revoke all on function public.create_room(text,text,text,integer,integer,integer), public.join_room(text,text,text), public.heartbeat_room(text,text), public.room_snapshot(text,text), public.set_player_ready(text,text,boolean), public.start_round(text,text), public.get_my_role(text,text), public.cast_vote(text,text,uuid), public.advance_phase(text,text) from public;

grant execute on function public.create_room(text,text,text,integer,integer,integer), public.join_room(text,text,text), public.heartbeat_room(text,text), public.room_snapshot(text,text), public.set_player_ready(text,text,boolean), public.start_round(text,text), public.get_my_role(text,text), public.cast_vote(text,text,uuid), public.advance_phase(text,text) to anon, authenticated;

insert into private.words(category, word) values
('paises','Brasil'),('paises','Japão'),('paises','Canadá'),('paises','Argentina'),('paises','Egito'),('paises','Itália'),('paises','México'),('paises','Austrália'),('paises','Índia'),('paises','França'),('paises','Portugal'),('paises','Coreia do Sul'),
('comidas','Coxinha'),('comidas','Pizza'),('comidas','Feijoada'),('comidas','Açaí'),('comidas','Lasanha'),('comidas','Brigadeiro'),('comidas','Sushi'),('comidas','Hambúrguer'),('comidas','Tapioca'),('comidas','Churrasco'),('comidas','Pudim'),('comidas','Cuscuz'),
('brasil','Carnaval'),('brasil','Festa Junina'),('brasil','Cristo Redentor'),('brasil','Amazônia'),('brasil','Capoeira'),('brasil','Praia'),('brasil','Sertão'),('brasil','Guaraná'),('brasil','Samba'),('brasil','Pelourinho'),('brasil','Pantanal'),('brasil','São João'),
('futebol','Neymar'),('futebol','Maracanã'),('futebol','Pênalti'),('futebol','Goleiro'),('futebol','Champions League'),('futebol','Copa do Mundo'),('futebol','Escanteio'),('futebol','Drible'),('futebol','Torcida'),('futebol','Camisa 10'),('futebol','Prorrogação'),('futebol','Impedimento'),
('filmes','Titanic'),('filmes','Harry Potter'),('filmes','Vingadores'),('filmes','Toy Story'),('filmes','Shrek'),('filmes','Avatar'),('filmes','Interestelar'),('filmes','Frozen'),('filmes','Stranger Things'),('filmes','Matrix'),('filmes','Pantera Negra'),('filmes','Jurassic Park'),
('profissoes','Engenheiro'),('profissoes','Veterinário'),('profissoes','Professor'),('profissoes','Bombeiro'),('profissoes','Cozinheiro'),('profissoes','Piloto'),('profissoes','Jornalista'),('profissoes','Arquiteto'),('profissoes','Mecânico'),('profissoes','Fotógrafo'),('profissoes','Dentista'),('profissoes','Programador'),
('animais','Capivara'),('animais','Girafa'),('animais','Golfinho'),('animais','Tamanduá'),('animais','Pinguim'),('animais','Onça'),('animais','Elefante'),('animais','Papagaio'),('animais','Tubarão'),('animais','Cachorro'),('animais','Preguiça'),('animais','Camaleão'),
('musica','Violão'),('musica','Samba'),('musica','Rock'),('musica','Forró'),('musica','K-pop'),('musica','Bateria'),('musica','Karaokê'),('musica','Festival'),('musica','Cantor'),('musica','DJ'),('musica','Funk'),('musica','Sertanejo'),
('games','Minecraft'),('games','Free Fire'),('games','Fortnite'),('games','The Sims'),('games','Mario Kart'),('games','FIFA'),('games','Roblox'),('games','God of War'),('games','Pokémon'),('games','GTA'),('games','PlayStation'),('games','Controle'),
('objetos','Guarda-chuva'),('objetos','Liquidificador'),('objetos','Mochila'),('objetos','Espelho'),('objetos','Chave'),('objetos','Ventilador'),('objetos','Fone de ouvido'),('objetos','Geladeira'),('objetos','Relógio'),('objetos','Óculos'),('objetos','Tesoura'),('objetos','Travesseiro'),
('internet','TikTok'),('internet','WhatsApp'),('internet','Meme'),('internet','Influenciador'),('internet','Podcast'),('internet','Hashtag'),('internet','Story'),('internet','Streaming'),('internet','Emoji'),('internet','Viral'),('internet','Notificação'),('internet','Filtro');
