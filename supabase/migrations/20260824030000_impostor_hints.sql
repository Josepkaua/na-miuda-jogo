alter table private.words add column if not exists impostor_hint text;
alter table private.round_secrets add column if not exists impostor_hint text;

update private.words
set impostor_hint = case category
  when 'paises' then 'Pense em cultura, clima, idioma e lugares conhecidos.'
  when 'comidas' then 'Pense em sabor, ocasião, preparo e modo de servir.'
  when 'brasil' then 'Pense em região, tradição, paisagem e cultura brasileira.'
  when 'futebol' then 'Pense em regra, posição, competição ou momento da partida.'
  when 'filmes' then 'Pense em cenário, gênero, personagem e conflito.'
  when 'profissoes' then 'Pense em ferramentas, ambiente e tipo de problema resolvido.'
  when 'animais' then 'Pense em habitat, comportamento e aparência.'
  when 'musica' then 'Pense em ritmo, instrumento, público e ocasião.'
  when 'games' then 'Pense em objetivo, plataforma, personagem e estilo de jogo.'
  when 'objetos' then 'Pense em material, lugar onde fica e para que serve.'
  when 'internet' then 'Pense em como aparece na tela e no que as pessoas fazem com isso.'
  else 'Escute as pistas e procure o tema em comum antes de responder.'
end
where impostor_hint is null;

update private.round_secrets rs
set impostor_hint = w.impostor_hint
from private.words w
where w.category = rs.category and w.word = rs.secret_word and rs.impostor_hint is null;

create or replace function private.attach_round_impostor_hint()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  select w.impostor_hint into new.impostor_hint
  from private.words w
  where w.category = new.category and w.word = new.secret_word
  limit 1;
  return new;
end;
$$;

revoke all on function private.attach_round_impostor_hint() from public, anon, authenticated;
drop trigger if exists attach_round_impostor_hint on private.round_secrets;
create trigger attach_round_impostor_hint
before insert or update of secret_word, category on private.round_secrets
for each row execute function private.attach_round_impostor_hint();

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
  return jsonb_build_object(
    'role', my_role.role,
    'word', my_role.visible_word,
    'category', round_secret.category,
    'turn_order', my_role.turn_order,
    'hint', case when my_role.role = 'impostor' then round_secret.impostor_hint end
  );
end;
$$;

revoke all on function public.get_my_role(text,text) from public;
grant execute on function public.get_my_role(text,text) to anon, authenticated;
