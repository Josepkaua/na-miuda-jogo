alter table public.rooms
  add column if not exists discussion_stage text not null default 'turns',
  add column if not exists discussion_turn_order smallint;

alter table public.rooms drop constraint if exists rooms_discussion_stage_check;
alter table public.rooms add constraint rooms_discussion_stage_check
  check (discussion_stage in ('turns', 'decision', 'free_chat', 'resolved'));

alter table private.words add column if not exists impostor_hint text;
alter table private.round_secrets add column if not exists impostor_hint text;

with hints(category, word, hint) as (values
  ('paises','Brasil','É um lugar de dimensões enormes e muitos contrastes regionais.'),
  ('paises','Japão','Tradições antigas convivem com tecnologia e grandes cidades.'),
  ('paises','Canadá','É lembrado pelo frio, pela natureza e por duas línguas oficiais.'),
  ('paises','Argentina','Tem forte ligação com futebol, dança e culinária marcante.'),
  ('paises','Egito','Sua história antiga e seus monumentos são conhecidos no mundo todo.'),
  ('paises','Itália','Arte, história e gastronomia aparecem muito quando falam deste lugar.'),
  ('paises','México','Cores fortes, festas e sabores intensos fazem parte da imagem do lugar.'),
  ('paises','Austrália','É distante, cercado por oceano e tem animais muito particulares.'),
  ('paises','Índia','Tem enorme diversidade cultural, espiritual e gastronômica.'),
  ('paises','França','Moda, arte, culinária e monumentos costumam aparecer nas pistas.'),
  ('paises','Portugal','O idioma e a relação histórica com o Brasil são pistas úteis.'),
  ('paises','Coreia do Sul','Cultura pop e tecnologia ajudaram a torná-lo muito conhecido.'),
  ('comidas','Coxinha','É comum em lanches, festas e vitrines de padarias.'),
  ('comidas','Pizza','Costuma ser compartilhada e permite muitas combinações.'),
  ('comidas','Feijoada','É uma refeição forte, tradicional e normalmente servida em grupo.'),
  ('comidas','Açaí','Pode ser consumido de formas bem diferentes dependendo da região.'),
  ('comidas','Lasanha','Tem camadas e normalmente chega à mesa bem quente.'),
  ('comidas','Brigadeiro','É pequeno, doce e quase obrigatório em certas comemorações.'),
  ('comidas','Sushi','A apresentação e o modo de comer fazem parte da experiência.'),
  ('comidas','Hambúrguer','É montado em camadas e tem muitas versões.'),
  ('comidas','Tapioca','É muito versátil e pode receber recheios doces ou salgados.'),
  ('comidas','Churrasco','Tem fogo, reunião de pessoas e preparação demorada.'),
  ('comidas','Pudim','É uma sobremesa de textura lisa e aparência bem reconhecível.'),
  ('comidas','Cuscuz','Muda bastante de preparo conforme a região.'),
  ('brasil','Carnaval','Envolve rua, música, fantasia e muita gente reunida.'),
  ('brasil','Festa Junina','Tem comidas típicas, roupas características e acontece numa época do ano.'),
  ('brasil','Cristo Redentor','É um ponto turístico visto de muito longe.'),
  ('brasil','Amazônia','Natureza, rios e biodiversidade são ideias centrais.'),
  ('brasil','Capoeira','Mistura movimento, música e tradição.'),
  ('brasil','Praia','Combina descanso, natureza e atividades ao ar livre.'),
  ('brasil','Sertão','Clima, paisagem e cultura regional ajudam a chegar perto.'),
  ('brasil','Guaraná','Pode remeter tanto a um fruto quanto a uma bebida popular.'),
  ('brasil','Samba','Ritmo, comunidade e celebração aparecem juntos.'),
  ('brasil','Pelourinho','História, arquitetura colorida e música se encontram ali.'),
  ('brasil','Pantanal','Água, animais e ciclos naturais definem esse lugar.'),
  ('brasil','São João','É uma celebração com dança, música e comidas típicas.'),
  ('futebol','Neymar','É uma pessoa conhecida por habilidade, fama e carreira internacional.'),
  ('futebol','Maracanã','É um lugar ligado a partidas históricas e grandes públicos.'),
  ('futebol','Pênalti','É um momento curto, tenso e decisivo.'),
  ('futebol','Goleiro','Tem uma função diferente da maioria dos jogadores.'),
  ('futebol','Champions League','Reúne equipes de alto nível em uma competição internacional.'),
  ('futebol','Copa do Mundo','Acontece em ciclos e mobiliza países inteiros.'),
  ('futebol','Escanteio','É uma situação de bola parada perto da linha de fundo.'),
  ('futebol','Drible','Depende de habilidade, movimento e surpresa.'),
  ('futebol','Torcida','É coletiva, barulhenta e muda o clima do jogo.'),
  ('futebol','Camisa 10','Um número costuma carregar expectativa e simbolismo.'),
  ('futebol','Prorrogação','Só aparece quando o tempo normal não resolve.'),
  ('futebol','Impedimento','É uma regra que depende da posição no instante do passe.'),
  ('filmes','Titanic','Mistura romance, história e uma viagem que dá errado.'),
  ('filmes','Harry Potter','Magia, escola e amizade são caminhos seguros.'),
  ('filmes','Vingadores','Vários heróis precisam agir juntos contra uma grande ameaça.'),
  ('filmes','Toy Story','Objetos ganham vida quando ninguém está olhando.'),
  ('filmes','Shrek','Contos de fadas aparecem de um jeito bem-humorado.'),
  ('filmes','Avatar','Um mundo visualmente diferente e a natureza têm grande importância.'),
  ('filmes','Interestelar','Espaço, tempo e família se misturam na história.'),
  ('filmes','Frozen','Gelo, irmãs e música são elementos fortes.'),
  ('filmes','Stranger Things','Amizade, mistério e coisas estranhas numa cidade pequena.'),
  ('filmes','Matrix','Realidade, tecnologia e escolha são temas centrais.'),
  ('filmes','Pantera Negra','Realeza, tecnologia e identidade cultural aparecem juntas.'),
  ('filmes','Jurassic Park','Ciência e criaturas do passado provocam caos.'),
  ('profissoes','Engenheiro','Planeja soluções e lida com cálculos e estruturas.'),
  ('profissoes','Veterinário','Cuida de pacientes que não conseguem explicar o que sentem.'),
  ('profissoes','Professor','Ensina, orienta e acompanha o desenvolvimento de outras pessoas.'),
  ('profissoes','Bombeiro','Age em emergências com treinamento e equipamentos de proteção.'),
  ('profissoes','Cozinheiro','Transforma ingredientes usando técnica, tempo e calor.'),
  ('profissoes','Piloto','Controla um veículo complexo e segue procedimentos rigorosos.'),
  ('profissoes','Jornalista','Investiga fatos e transforma informação em notícia.'),
  ('profissoes','Arquiteto','Equilibra estética, espaço e função em seus projetos.'),
  ('profissoes','Mecânico','Diagnostica problemas e trabalha com peças e ferramentas.'),
  ('profissoes','Fotógrafo','Observa luz, enquadramento e o instante certo.'),
  ('profissoes','Dentista','Trabalha com saúde em uma parte específica do corpo.'),
  ('profissoes','Programador','Constrói soluções digitais escrevendo instruções precisas.'),
  ('animais','Capivara','É sociável, vive perto da água e parece bem tranquila.'),
  ('animais','Girafa','Uma característica física torna sua silhueta inconfundível.'),
  ('animais','Golfinho','Vive na água, é inteligente e costuma andar em grupo.'),
  ('animais','Tamanduá','Sua alimentação explica boa parte do formato do corpo.'),
  ('animais','Pinguim','É uma ave adaptada ao frio que se move melhor na água.'),
  ('animais','Onça','É um predador forte, silencioso e de pelagem marcante.'),
  ('animais','Elefante','Tamanho, memória e vida em grupo são boas aproximações.'),
  ('animais','Papagaio','Cores, som e capacidade de imitar chamam atenção.'),
  ('animais','Tubarão','É um predador aquático cercado por muitos mitos.'),
  ('animais','Cachorro','Convive muito de perto com seres humanos.'),
  ('animais','Preguiça','O nome já sugere como seus movimentos são percebidos.'),
  ('animais','Camaleão','Adaptação visual e discrição são suas marcas.'),
  ('musica','Violão','É portátil, tem cordas e acompanha muitos estilos.'),
  ('musica','Samba','Ritmo brasileiro, percussão e roda combinam com a resposta.'),
  ('musica','Rock','Guitarras e energia ajudam, mas há muitas variações.'),
  ('musica','Forró','É música feita também para dançar em dupla.'),
  ('musica','K-pop','Coreografia, grupos e produção visual têm grande peso.'),
  ('musica','Bateria','Várias peças trabalham juntas para marcar o ritmo.'),
  ('musica','Karaokê','Pessoas comuns assumem o microfone por diversão.'),
  ('musica','Festival','Muitos artistas e um grande público dividem o mesmo evento.'),
  ('musica','Cantor','A voz é a principal ferramenta de trabalho.'),
  ('musica','DJ','Seleciona e mistura faixas para conduzir o ambiente.'),
  ('musica','Funk','Batida, dança e cultura urbana são referências.'),
  ('musica','Sertanejo','Histórias de amor e vida no interior aparecem com frequência.'),
  ('games','Minecraft','Construção, blocos e liberdade definem a experiência.'),
  ('games','Free Fire','Partidas rápidas e sobrevivência com muitos jogadores.'),
  ('games','Fortnite','Combate, construção e eventos coloridos aparecem juntos.'),
  ('games','The Sims','A vida cotidiana vira simulação e o jogador controla escolhas.'),
  ('games','Mario Kart','Corrida, personagens conhecidos e itens inesperados.'),
  ('games','FIFA','É uma representação digital de um esporte muito popular.'),
  ('games','Roblox','Reúne muitos jogos criados pela própria comunidade.'),
  ('games','God of War','Mitologia, combate e relação familiar movem a história.'),
  ('games','Pokémon','Colecionar, treinar e batalhar criaturas faz parte do caminho.'),
  ('games','GTA','Mundo aberto, veículos e liberdade para causar confusão.'),
  ('games','PlayStation','É uma plataforma associada a controle e jogos exclusivos.'),
  ('games','Controle','Fica nas mãos e transforma comandos em ações na tela.'),
  ('objetos','Guarda-chuva','Só costuma ser lembrado quando o clima muda.'),
  ('objetos','Liquidificador','Usa lâminas e energia para misturar alimentos.'),
  ('objetos','Mochila','Transporta coisas deixando as mãos livres.'),
  ('objetos','Espelho','Devolve uma imagem sem guardar nada.'),
  ('objetos','Chave','É pequena, mas controla o acesso a algo maior.'),
  ('objetos','Ventilador','Move o ar para tornar o ambiente mais confortável.'),
  ('objetos','Fone de ouvido','Leva o som diretamente a uma pessoa.'),
  ('objetos','Geladeira','Conserva alimentos usando baixa temperatura.'),
  ('objetos','Relógio','Organiza o dia mostrando algo que não para.'),
  ('objetos','Óculos','Fica no rosto e muda a forma de enxergar.'),
  ('objetos','Tesoura','Duas partes se movem juntas para cortar.'),
  ('objetos','Travesseiro','Está ligado a descanso e fica perto da cabeça.'),
  ('internet','TikTok','Vídeos curtos, tendências e rolagem contínua são pistas.'),
  ('internet','WhatsApp','Mensagens, grupos e conversas do cotidiano.'),
  ('internet','Meme','Uma ideia se espalha ao ser copiada e transformada.'),
  ('internet','Influenciador','Produz conteúdo e depende da atenção de uma audiência.'),
  ('internet','Podcast','É uma conversa ou programa feito principalmente para ouvir.'),
  ('internet','Hashtag','Uma marca curta ajuda a agrupar assuntos.'),
  ('internet','Story','É um conteúdo rápido que costuma desaparecer.'),
  ('internet','Streaming','O conteúdo chega pela internet enquanto é consumido.'),
  ('internet','Emoji','Uma pequena imagem substitui ou reforça palavras.'),
  ('internet','Viral','Espalha-se muito rápido de pessoa para pessoa.'),
  ('internet','Notificação','Interrompe para avisar que algo aconteceu.'),
  ('internet','Filtro','Altera o que aparece antes de mostrar ou publicar.')
)
update private.words w
set impostor_hint = h.hint
from hints h
where w.category = h.category and w.word = h.word;

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

create table if not exists public.discussion_votes (
  round_id uuid not null references public.rounds(id) on delete cascade,
  voter_player_id uuid not null references public.players(id) on delete cascade,
  choice text not null check (choice in ('more_time', 'voting')),
  created_at timestamptz not null default now(),
  primary key (round_id, voter_player_id)
);

create index if not exists discussion_votes_round_choice_idx
  on public.discussion_votes(round_id, choice);
alter table public.discussion_votes enable row level security;
revoke all on public.discussion_votes from public, anon, authenticated;

create or replace function private.initialize_discussion_state()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.phase = 'discussion' and old.phase is distinct from 'discussion' then
    new.discussion_stage := 'turns';
    select min(rr.turn_order) into new.discussion_turn_order
    from private.round_roles rr
    join public.players p on p.id = rr.player_id
    where rr.round_id = new.current_round_id and p.left_at is null;
    if new.discussion_turn_order is null then new.discussion_stage := 'decision'; end if;
  elsif new.phase <> 'discussion' then
    new.discussion_stage := 'resolved';
    new.discussion_turn_order := null;
  end if;
  return new;
end;
$$;

revoke all on function private.initialize_discussion_state() from public, anon, authenticated;
drop trigger if exists initialize_discussion_state on public.rooms;
create trigger initialize_discussion_state
before update of phase on public.rooms
for each row execute function private.initialize_discussion_state();

create or replace function public.advance_discussion_turn(
  p_code text,
  p_session_token text,
  p_expected_round integer,
  p_expected_turn integer
)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  target_room public.rooms;
  caller_id uuid;
  current_turn_player uuid;
  next_turn smallint;
begin
  select * into target_room from public.rooms
  where code = upper(trim(p_code)) and expires_at > now()
  for update;
  if target_room.id is null then raise exception 'Sala não encontrada.'; end if;
  caller_id := private.require_player(target_room.id, p_session_token);
  if target_room.phase <> 'discussion' or target_room.discussion_stage <> 'turns' then
    raise exception 'A rodada de perguntas já terminou.';
  end if;
  if target_room.round_number <> p_expected_round or target_room.discussion_turn_order <> p_expected_turn then
    raise exception 'A vez já mudou. Atualize a tela.';
  end if;

  select rr.player_id into current_turn_player
  from private.round_roles rr
  join public.players p on p.id = rr.player_id
  where rr.round_id = target_room.current_round_id
    and rr.turn_order = target_room.discussion_turn_order
    and p.left_at is null;
  if caller_id <> current_turn_player and caller_id <> target_room.host_player_id then
    raise exception 'Somente quem está falando ou o anfitrião pode passar a vez.';
  end if;

  select min(rr.turn_order) into next_turn
  from private.round_roles rr
  join public.players p on p.id = rr.player_id
  where rr.round_id = target_room.current_round_id
    and rr.turn_order > target_room.discussion_turn_order
    and p.left_at is null;

  if next_turn is null then
    update public.rooms set discussion_stage = 'decision', discussion_turn_order = null,
      phase_ends_at = null, updated_at = now()
    where id = target_room.id;
    return jsonb_build_object('discussion_stage', 'decision');
  end if;

  update public.rooms set discussion_turn_order = next_turn, updated_at = now()
  where id = target_room.id;
  return jsonb_build_object('discussion_stage', 'turns', 'discussion_turn_order', next_turn);
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
  if target_room.phase <> 'discussion' or target_room.discussion_stage <> 'decision' then
    raise exception 'A decisão da turma não está aberta.';
  end if;
  if target_room.round_number <> p_expected_round then raise exception 'A rodada já mudou.'; end if;
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
  select * into target_room from public.rooms where code = upper(trim(p_code)) and expires_at > now();
  if target_room.id is null then raise exception 'Sala não encontrada ou expirada.'; end if;
  current_player := private.require_player(target_room.id, p_session_token);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nickname', p.nickname, 'is_me', p.id = current_player,
    'is_host', p.id = target_room.host_player_id, 'is_ready', p.is_ready,
    'is_online', p.left_at is null and p.last_seen_at > now() - interval '75 seconds', 'score', p.score
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
    select count(*) filter (where rr.revealed_at is not null), count(*)
      into roles_seen, round_players
      from private.round_roles rr
      join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id
        and p.left_at is null
        and p.last_seen_at > now() - interval '75 seconds';
    select count(*), count(*) filter (where dv.choice = 'more_time'), count(*) filter (where dv.choice = 'voting')
      into discussion_votes_cast, discussion_more_time, discussion_go_voting
      from public.discussion_votes dv
      join public.players p on p.id = dv.voter_player_id
      where dv.round_id = target_room.current_round_id and p.left_at is null;
    select dv.choice into current_discussion_choice
      from public.discussion_votes dv
      where dv.round_id = target_room.current_round_id and dv.voter_player_id = current_player;
    select rr.player_id into current_turn_player
      from private.round_roles rr join public.players p on p.id = rr.player_id
      where rr.round_id = target_room.current_round_id
        and rr.turn_order = target_room.discussion_turn_order
        and p.left_at is null;
  end if;

  return jsonb_build_object(
    'room_id', target_room.id, 'code', target_room.code, 'phase', target_room.phase,
    'category', target_room.category, 'player_limit', target_room.player_limit,
    'impostor_count', target_room.impostor_count, 'discussion_seconds', target_room.discussion_seconds,
    'round_number', target_room.round_number, 'phase_ends_at', target_room.phase_ends_at,
    'vote_count', votes_cast, 'eligible_voter_count', eligible_voters, 'has_voted', current_has_voted,
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

create or replace function public.send_chat_message(p_code text, p_session_token text, p_body text)
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
  if target_room.phase = 'discussion' and target_room.discussion_stage = 'decision' then
    raise exception 'O chat fica pausado durante a decisão da turma.';
  end if;
  if char_length(clean_body) not between 1 and 280 then
    raise exception 'A mensagem deve ter entre 1 e 280 caracteres.';
  end if;
  if (
    select count(*) from public.chat_messages
    where player_id = current_player and created_at > now() - interval '10 seconds'
  ) >= 6 then raise exception 'Muitas mensagens seguidas. Espere alguns segundos.'; end if;

  select * into inserted_message
  from public.chat_messages
  where player_id = current_player and body = clean_body and created_at > now() - interval '2 seconds'
  order by id desc limit 1;

  if inserted_message.id is null then
    insert into public.chat_messages(room_id, player_id, body)
    values (target_room.id, current_player, clean_body)
    returning * into inserted_message;
  end if;

  update public.players set last_seen_at = now() where id = current_player;
  return jsonb_build_object('id', inserted_message.id, 'created_at', inserted_message.created_at);
end;
$$;

revoke all on function public.advance_discussion_turn(text,text,integer,integer), public.cast_discussion_choice(text,text,text,integer) from public;
grant execute on function public.advance_discussion_turn(text,text,integer,integer), public.cast_discussion_choice(text,text,text,integer) to anon, authenticated;
revoke all on function public.get_my_role(text,text), public.room_snapshot(text,text), public.send_chat_message(text,text,text) from public;
grant execute on function public.get_my_role(text,text), public.room_snapshot(text,text), public.send_chat_message(text,text,text) to anon, authenticated;
