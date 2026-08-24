-- Gameplay tuning only. This migration is intentionally left unapplied while live games are running.
-- Scoring: impostor victory +3, group victory +2 for non-impostors, correct impostor vote +1 bonus.
-- Impostor hints become deliberately broad so they help with bluffing without exposing the secret word.

update private.words
set impostor_hint = case category
  when 'paises' then 'Pense em identidade, costumes ou imagem internacional. Muitas respostas ainda cabem aqui.'
  when 'comidas' then 'Pense mais na ocasião e na experiência de comer do que em ingredientes, formato ou preparo.'
  when 'brasil' then 'Pode ser lugar, costume, manifestação, símbolo ou algo muito associado ao Brasil.'
  when 'futebol' then 'Pode ser pessoa, lugar, regra, ação, competição ou outro elemento do universo do futebol.'
  when 'filmes' then 'Pense em atmosfera, tema ou tipo de história sem depender de personagem, cena ou época específica.'
  when 'profissoes' then 'Pense na responsabilidade geral do trabalho sem assumir ferramenta, uniforme ou ambiente específico.'
  when 'animais' then 'Pense em comportamento ou relação com o ambiente sem apostar cedo em aparência, tamanho ou habitat.'
  when 'musica' then 'Pode ser estilo, instrumento, pessoa, evento ou parte da experiência de produzir e ouvir música.'
  when 'games' then 'Pode ser jogo, plataforma, personagem, mecânica ou algo usado para jogar.'
  when 'objetos' then 'Pense em contexto de uso e utilidade geral sem assumir material, formato ou cômodo específico.'
  when 'internet' then 'Pode ser conteúdo, recurso, comportamento, formato ou fenômeno do cotidiano digital.'
  else 'A pista é propositalmente aberta. Descubra primeiro que tipo de coisa os outros estão descrevendo.'
end
where active;

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
      update public.players p
      set score = p.score + 2
      from private.round_roles rr
      where rr.round_id = target_room.current_round_id
        and rr.player_id = p.id
        and rr.role = 'player'
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    else
      update public.players p
      set score = p.score + 3
      from private.round_roles rr
      where rr.round_id = target_room.current_round_id
        and rr.player_id = p.id
        and rr.role = 'impostor'
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    end if;

    -- Individual accuracy bonus. Only non-impostors can earn the +1 bonus,
    -- and it is awarded even if the group as a whole does not win the round.
    update public.players p
    set score = p.score + 1
    from public.votes v
    join private.round_roles voter_role
      on voter_role.round_id = v.round_id
      and voter_role.player_id = v.voter_player_id
    where v.round_id = target_room.current_round_id
      and p.id = v.voter_player_id
      and voter_role.role = 'player'
      and v.target_player_id = any(impostors)
      and p.left_at is null
      and p.last_seen_at > now() - interval '75 seconds';

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

revoke all on function public.advance_phase(text,text,public.game_phase,integer) from public;
grant execute on function public.advance_phase(text,text,public.game_phase,integer) to anon, authenticated;
