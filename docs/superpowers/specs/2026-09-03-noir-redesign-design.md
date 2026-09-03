# Redesign visual "Noir Investigativo" — Na Miúda!

Status: aprovado para virar plano de implementação
Data: 2026-09-03

## Contexto

O jogo funciona bem (lobby, revelação de papel, discussão, votação, resultado
já implementados e testados), mas a camada visual é genérica: gradiente
roxo/azul típico de app gerado por IA, ícones em emoji, fonte de sistema,
blobs de gradiente borrados como único elemento decorativo. Telas
inspecionadas em `npm run dev` (modo demo, sem Supabase): landing, formulário
de criar/entrar em sala, seletor de avatar, lobby com chat e lista de
jogadores.

Este spec cobre um redesign completo da camada de apresentação — paleta,
tipografia, motion e ilustração — sem tocar em lógica de jogo, RPCs do
Supabase, schema do banco ou regras. Decisões de direção já validadas com o
usuário:

- Direção visual: **Noir investigativo** (clima de investigação policial —
  spotlight, textura de grão, tons de carvão/âmbar) em vez de neon
  genérico.
- Nível de arte: **conjunto completo de ilustração customizada** gerada por
  modelo de imagem, substituindo emojis e gradientes por um sistema visual
  coeso.

## Fora de escopo

- Regras de jogo, lógica de fases, RPCs, schema Supabase, testes de backend.
- Reestruturação de arquitetura de dados (`Snapshot`, `Player`, etc.).
- Qualquer mudança que altere o comportamento funcional das telas.

Onde a lógica e a renderização estão misturadas no mesmo arquivo
(`app/page.tsx`, 1250 linhas), o trabalho toca apenas o JSX de renderização e
as classes CSS que ele referencia — os `useState`/`useEffect`/chamadas RPC
permanecem intactos byte a byte, exceto por trechos que precisem de um novo
`className` ou wrapper de `motion.div` para animar.

## Sistema de design

### Paleta (substitui as variáveis em `app/globals.css`)

| Token | Antes | Depois |
|---|---|---|
| `--surface-0..4` | navy/roxo | grafite com leve calor (`#121014` → `#242019`) |
| `--color-primary` | `#8b5cf6` (roxo) | `#d9a441` (âmbar/latão) |
| `--color-investigation` | `#00d4ff` (ciano neon) | `#7c93a8` (azul-acinzentado dessaturado) |
| `--color-danger` | `#ff4d6d` (rosa neon) | `#b8433a` (vermelho ferrugem) |
| `--color-success` | `#00e676` (verde neon) | `#6f9c76` (verde sálvia) |
| `--color-warning` | `#ffb800` | mantém, ajustado para tom mais quente |

Fundo ambiente: grão de filme (textura SVG/noise sutil, opacidade baixa) +
vinheta nas bordas + um único feixe de luz diagonal, no lugar dos dois blobs
de gradiente coloridos borrados atuais (`.ambient-one`, `.ambient-two`).

### Tipografia

- Títulos: **Fraunces** (serifada variável, peso 600–900) via Google Fonts.
- Corpo: **Inter** (mantém boa legibilidade, substitui a pilha de fontes de
  sistema).
- Código da sala / pontuação / rótulos de "evidência": **JetBrains Mono**.

Import via `@import url(...)` em `app/globals.css` (fonte de fallback do
sistema mantida como segunda opção).

### Motion

Nova dependência: `motion` (Framer Motion para React 19). Usos concretos:

- Transição entre fases (`lobby → reveal → discussion → voting → results`):
  crossfade + leve escala/deslocamento vertical.
- Revelação do papel: animação de carta virando (efeito de abrir um envelope
  de caso), com o spotlight de fundo acendendo durante o giro.
- Lista de jogadores: entrada escalonada (stagger) ao montar.
- Cronômetro de discussão/votação: anel de progresso animado, pulsando nos
  últimos segundos.
- Resultado: leve efeito de "carimbo" no veredito (culpado/inocente).
- Tudo respeita `prefers-reduced-motion` (a regra global em
  `app/globals.css:202` já zera durações; motion.js lê essa preferência via
  `useReducedMotion`).

### Ilustração customizada (gerada por modelo de imagem)

Ativos a gerar, todos em um único guia de estilo (line-art com peso de
traço consistente + paleta âmbar/carvão/ferrugem):

1. Mascote coringa em versão noir (sobretudo, chapéu, lupa) — substitui
   `public/mascote-na-miuda.png` e `public/investigador-na-miuda.webp`.
2. 12 ícones de categoria (hoje emoji: 🌎🍕🇧🇷⚽🎬🧑‍🔧🦜🎵🎮💡📱🎲) como
   line-art customizado.
3. Textura de fundo "quadro de investigação" (fios/alfinetes) para a hero da
   landing.
4. Tratamento duotone (âmbar/carvão) aplicado aos 8 avatares existentes em
   `public/avatars/*.webp` para casarem com a paleta nova — os avatares em si
   não são redesenhados do zero, só recoloridos/tratados.
5. Ícone de spotlight/lupa para o momento de revelação de papel.

## Telas afetadas (todas as 5 fases + landing)

- **Landing / formulário de sala**: hero reformulada com o feixe de luz e o
  mascote noir; card de entrada com abas estilizadas como pasta de arquivo;
  campo de código como etiqueta de evidência (mono, letter-spacing).
- **Lobby**: stepper de fases redesenhado (ícones novos, âmbar no ativo);
  lista de jogadores como "lineup de suspeitos".
- **Revelação**: tela cheia dramática — carta virando, spotlight, tensão.
- **Discussão**: chat com tom de "transcrição de interrogatório"; turno ativo
  destacado com spotlight.
- **Votação**: cards de acusação; anel de contagem regressiva.
- **Resultado**: veredito com tratamento tipo manchete/carimbo.

## Arquivos principais a tocar

- `app/globals.css`, `app/game-ui.css`, `app/game-polish.css`,
  `app/layout-stability.css`, `app/interaction-safety.css`,
  `app/connection-status.css`, `app/automatic-mechanics-ui.css` — tokens e
  estilos.
- `app/page.tsx` — apenas o JSX de renderização (não os hooks/lógica).
- `app/game-motion-controller.tsx` — já existe como controlador de
  transição; adaptar para usar `motion` em vez do que houver hoje.
- `public/*` — novos assets gerados substituindo/complementando os atuais.
- `package.json` — adiciona `motion` como dependência.

## Testes

A suíte atual (`npm test`) roda `node --test` sobre HTML renderizado e
comportamento — cobre lógica, não pixels. Depois do redesign, rodar a suíte
completa para garantir que nenhuma asserção de texto/estrutura quebrou (ex.:
`tests/layout-stability.test.mjs`, `tests/neon-identity.test.mjs`, cujo nome
sugere que hoje testam a identidade neon — pode precisar de ajuste de nome/
asserções de cor se testarem valores de CSS específicos). Verificação visual
manual via `npm run dev` (modo demo) em cada fase, tema claro e escuro.

## Ordem de implementação (visão geral — detalhada no plano)

1. Fundação: tokens de cor, fontes, textura de fundo, `motion` instalado.
2. Landing + formulário de sala.
3. Lobby (stepper, lista de jogadores, chat).
4. Revelação de papel (motion mais complexo).
5. Discussão + votação.
6. Resultado.
7. Ilustração customizada gerada e integrada (pode ser paralelo aos passos
   2–6, já que só troca assets em `public/`).
8. Ajuste de tema claro (`:root[data-theme="light"]`) para a nova paleta.
9. Rodar suíte de testes e revisão visual final.
