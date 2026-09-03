# Redesign Visual "Noir Investigativo" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o sistema visual genérico (roxo/azul, emoji, fonte de sistema) do jogo "Na Miúda!" por uma identidade noir investigativa (âmbar/carvão/ferrugem, tipografia serifada + mono, grão de filme, ilustração customizada), sem alterar nenhuma regra de jogo ou chamada de backend.

**Architecture:** O app já é fortemente tokenizado (CSS custom properties em `app/globals.css:3-35` alimentam quase toda a UI via `var(--color-primary)` etc.), então a maior parte do reskin acontece redefinindo esses tokens — o resto do CSS herda a nova paleta de graça. O trabalho restante é: trocar fontes, trocar o fundo ambiente por textura de grão + spotlight, gerar e aplicar ilustração customizada (mascote, ícones de categoria), e adicionar alguns toques de movimento pontuais nas telas de maior tensão (revelação, votação, resultado).

**Tech Stack:** Next.js 16 / Vinext / Vite 8, React 19, TypeScript, CSS puro com custom properties (sem Tailwind aplicado nas classes do jogo — Tailwind está importado mas o app usa classes CSS próprias), Node --test para a suíte de testes.

**Spec:** `docs/superpowers/specs/2026-09-03-noir-redesign-design.md`

## Global Constraints

- Não alterar `useState`/`useEffect`/chamadas `supabase.rpc(...)` em `app/page.tsx` — só o JSX de renderização e classes.
- Não alterar `supabase/migrations/**`, `db/**`, `worker/**`.
- Rodar `npm test` (que primeiro roda `npm run build`) ao final de cada task e manter tudo verde.
- Toda nova animação deve respeitar `@media (prefers-reduced-motion: reduce)` — a regra global já existe em `app/globals.css:202-204` e zera durações; não sobrescrever essa regra.
- Paleta alvo (de `app/globals.css:3-35`):
  - `--surface-0..4`: `#121014, #1a1714, #201c19, #262019, #2e271f`
  - `--color-primary` / `--color-primary-strong`: `#d9a441` / `#c98f2e`
  - `--color-investigation`: `#7c93a8`
  - `--color-danger`: `#b8433a`
  - `--color-success`: `#6f9c76`
  - `--color-warning`: `#e0a53a`
- Fontes alvo: `Fraunces` (títulos), `Inter` (corpo), `JetBrains Mono` (código/números).
- Servidor de dev local: `.claude/launch.json` em `C:\Users\zepra\.claude\launch.json` já configurado (`na-miuda-dev`, porta 5173, `cwd: Documents/na-miuda-jogo`); modo demo funciona sem `.env.local` (sem Supabase configurado, `hasRemoteBackend()` retorna falso).

---

### Task 1: Fundação de tokens — paleta, fontes, grão e spotlight

**Files:**
- Modify: `app/globals.css:1-56` (bloco `@import`, `:root`, `:root[data-theme="light"]`, `body`)
- Modify: `app/globals.css:52-56` (`.app-shell`, `.app-shell::before`, `.ambient*`)

**Interfaces:**
- Produces: as variáveis CSS `--color-primary`, `--color-investigation`, `--color-danger`, `--color-success`, `--surface-0..4` com os novos valores (consumidas por todo o resto do CSS do app sem mudança adicional). Produces também `--font-display`, `--font-body`, `--font-mono` (novas variáveis, usadas nas tasks seguintes).

- [ ] **Step 1: Trocar o bloco `:root` de `app/globals.css`**

Substituir linhas 1-35 por:

```css
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600..900&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap");

:root {
  color-scheme: dark;
  --color-primary: #d9a441;
  --color-primary-strong: #c98f2e;
  --color-investigation: #7c93a8;
  --color-danger: #b8433a;
  --color-success: #6f9c76;
  --color-warning: #e0a53a;
  --surface-0: #121014;
  --surface-1: #1a1714;
  --surface-2: #201c19;
  --surface-3: #262019;
  --surface-4: #2e271f;
  --border-subtle: rgba(217, 164, 65, .14);
  --border-strong: rgba(217, 164, 65, .46);
  --text-primary: #f7f2e9;
  --text-secondary: #cbbfa8;
  --text-muted: #8c8175;
  --glow-primary: 0 0 28px rgba(217, 164, 65, .22);
  --glow-investigation: 0 0 28px rgba(124, 147, 168, .2);
  --glow-danger: 0 0 28px rgba(184, 67, 58, .22);
  --glow-success: 0 0 28px rgba(111, 156, 118, .16);
  --shadow-panel: 0 22px 70px rgba(0, 0, 0, .5);
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-xl: 32px;
  --ease-standard: cubic-bezier(.2, .8, .2, 1);
  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Inter", "Segoe UI", Arial, sans-serif;
  --font-mono: "JetBrains Mono", "Consolas", monospace;
  --ink: var(--text-primary); --deep: var(--color-primary); --deep-2: var(--color-investigation);
  --lime: var(--color-primary); --lime-bright: #f0cf8e; --cream: var(--surface-0);
  --paper: var(--surface-2); --soft: var(--surface-3); --muted: var(--text-muted);
  --line: var(--border-subtle); --danger: var(--color-danger); --success: var(--color-success); --shadow: var(--shadow-panel);
}

:root[data-theme="light"] {
  color-scheme: light;
  --surface-0: #f6f1e6; --surface-1: #efe8d8; --surface-2: #fffbf3; --surface-3: #e9e0c9; --surface-4: #ddd0af;
  --border-subtle: rgba(87, 63, 27, .16); --text-primary: #241d12; --text-secondary: #564a34; --text-muted: #7a6c50;
  --shadow-panel: 0 22px 70px rgba(60, 45, 15, .16);
}
```

**Por que essa mudança:** troca a base roxo/azul por grafite quente + âmbar/ferrugem/sálvia, e introduz as três variáveis de fonte que as próximas tasks usam.

- [ ] **Step 2: Trocar a fonte do corpo e o fundo ambiente**

Em `app/globals.css`, substituir a linha `body { ... font-family: "Avenir Next", "Segoe UI", Arial, sans-serif; }` (linha 46) por:

```css
body { min-height: 100%; margin: 0; background: var(--surface-0); color: var(--text-primary); font-family: var(--font-body); }
h1, h2, h3, .brand, .rules-modal h2 { font-family: var(--font-display); }
.room-code-block strong, .code-input, .timer-ring strong, .chat-timer-pill, .phase-timer-chip strong { font-family: var(--font-mono); }
```

Substituir o bloco `.app-shell`/`.app-shell::before`/`.ambient*` (linhas 52-56) por:

```css
.app-shell { min-height: 100dvh; position: relative; isolation: isolate; overflow-x: clip; padding: 0 clamp(18px, 5vw, 72px); background: radial-gradient(circle at 15% 0%, rgba(217, 164, 65, .08), transparent 42rem), var(--surface-0); }
.app-shell::before { content: ""; position: fixed; inset: 0; z-index: -2; pointer-events: none; opacity: .5; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E"); }
.ambient { position: fixed; z-index: -1; pointer-events: none; border-radius: 999px; filter: blur(60px); opacity: .4; }
.ambient-one { width: 620px; height: 620px; top: -260px; right: -160px; background: conic-gradient(from 200deg, rgba(217, 164, 65, .16), transparent 55%); }
.ambient-two { width: 520px; height: 520px; bottom: -280px; left: -200px; background: radial-gradient(circle, rgba(184, 67, 58, .1), transparent 68%); }
```

**Por que essa mudança:** o `.app-shell::before` deixa de ser uma grade sutil e vira um grão de filme (textura de ruído via SVG data-URI, sem novo asset); os blobs viram um feixe cônico âmbar (spotlight) e um glow vermelho-ferrugem discreto, no lugar do roxo/ciano borrado.

- [ ] **Step 3: Rodar a suíte de testes**

Run: `npm test` (dentro de `C:\Users\zepra\Documents\na-miuda-jogo`)
Expected: PASS — a suíte testa estrutura/HTML renderizado, não valores de cor, então nenhuma asserção deve quebrar. Se `tests/neon-identity.test.mjs` falhar por checar literalmente a palavra "neon" ou um valor de cor específico, abrir o arquivo, ver a asserção exata e ajustá-la para refletir a nova paleta (não apagar o teste, só atualizar o valor esperado).

- [ ] **Step 4: Verificação visual manual**

Run: `npm run dev` (ou usar o preview já configurado em `.claude/launch.json`, nome `na-miuda-dev`)
Abrir `http://localhost:5173`, confirmar: fundo grafite quente com grão visível, botão "Criar sala e chamar a turma" âmbar, títulos em serifa (Fraunces carregando — checar aba Network do browser por `fonts.googleapis.com`), texto em Inter.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "Redefine tokens de cor e tipografia para o tema noir investigativo"
```

---

### Task 2: Gerar ilustração customizada (mascote e ícones de categoria)

**Files:**
- Create: `public/mascote-na-miuda-noir.png` (ou `.webp`)
- Create: `public/icons/categoria-paises.svg`, `.../categoria-comidas.svg`, `.../categoria-brasil.svg`, `.../categoria-futebol.svg`, `.../categoria-filmes.svg`, `.../categoria-profissoes.svg`, `.../categoria-animais.svg`, `.../categoria-musica.svg`, `.../categoria-games.svg`, `.../categoria-objetos.svg`, `.../categoria-internet.svg`, `.../categoria-misturado.svg`
- Create: `public/case-board.png` (textura decorativa de fundo)

**Interfaces:**
- Produces: 1 arquivo de mascote (proporção quadrada, fundo transparente), 12 ícones de categoria (line-art, traço único, fundo transparente, ~64×64) e 1 textura de fundo "quadro de investigação", todos referenciados por caminho relativo em `public/` para a Task 3 consumir.

- [ ] **Step 1: Gerar o mascote noir**

Usar a ferramenta de geração de imagem disponível no ambiente (modelo de imagem via MCP) com um prompt descrevendo: "mascote bobo da corte (joker) em estilo noir investigativo, sobretudo escuro, chapéu fedora inclinado, segurando uma lupa, paleta âmbar e carvão, line-art com sombra dramática tipo spotlight, fundo transparente, ilustração vetorial limpa, sem texto". Gerar em alta resolução quadrada (mín. 1024×1024).

Salvar o resultado em `public/mascote-na-miuda-noir.png`.

- [ ] **Step 2: Gerar os 12 ícones de categoria**

Para cada categoria (`países, comidas, Brasil, futebol, filmes e séries, profissões, animais, música, games, objetos, internet, tudo misturado` — lista em `app/page.tsx:71-84`), gerar um ícone line-art de traço único, cor âmbar sobre fundo transparente, estilo consistente com o mascote (mesmo prompt-base, variando só o objeto central: globo, prato de comida, bandeira estilizada, bola de futebol, claquete, ferramenta, silhueta de animal, nota musical, controle de videogame, lâmpada, sinal de wifi, dado).

Salvar cada um como SVG (se o modelo gerar raster, converter/exportar como SVG simplificado ou manter PNG 128×128 transparente — o importante é o traço único e fundo transparente) em `public/icons/categoria-<slug>.svg` usando os mesmos slugs de `app/page.tsx:71-84` (`paises, comidas, brasil, futebol, filmes, profissoes, animais, musica, games, objetos, internet, misturado`).

- [ ] **Step 3: Gerar a textura "quadro de investigação"**

Gerar uma imagem de fundo decorativa: "quadro de cortiça de investigação policial visto de perto, fotos presas com alfinetes vermelhos conectadas por barbante/fio, iluminação de spotlight lateral, tons de carvão e âmbar, textura granulada, sem texto legível, adequado como plano de fundo discreto atrás de um card — baixo contraste, não deve competir com texto sobreposto". Formato paisagem largo (mín. 1920×1080), pode ter leve granulado.

Salvar em `public/case-board.png`.

- [ ] **Step 4: Conferir os arquivos**

Run: `ls public/icons` (deve listar os 12 arquivos) e abrir `public/mascote-na-miuda-noir.png` e `public/case-board.png` num visualizador de imagem para confirmar fundo transparente (mascote/ícones) e contraste baixo o bastante para ficar atrás de texto (quadro de investigação).

- [ ] **Step 5: Commit**

```bash
git add public/mascote-na-miuda-noir.png public/icons public/case-board.png
git commit -m "Adiciona mascote, icones de categoria e textura de fundo em estilo noir"
```

---

### Task 3: Aplicar mascote e ícones novos no JSX

**Files:**
- Modify: `app/page.tsx:71-84` (array `categories`)
- Modify: `app/page.tsx:866, 870-871` (hero: `.hero-mascot`, `.proof-row`, `.category-preview`)
- Modify: `app/page.tsx:890` (`<select id="category">`, opção com `item.icon`)
- Modify: `app/globals.css:60, 76` (`.brand-logo`, `.hero-mascot` `background: url(...)`)
- Modify: `app/globals.css:86` (`.category-preview > span`)
- Test: `npm test`

**Interfaces:**
- Consumes: `public/mascote-na-miuda-noir.png`, `public/icons/categoria-*.svg` e `public/case-board.png` da Task 2.
- Produces: `categories` continua com o mesmo formato `{ id, label, icon, hint }`, mas `icon` passa a ser um caminho de arquivo (string) em vez de um emoji — qualquer código que hoje renderiza `{item.icon}` diretamente como texto (ex.: `app/page.tsx:890`, `:871`) precisa virar `<img src={item.icon} ... />`.

- [ ] **Step 1: Atualizar o array `categories`**

Em `app/page.tsx:71-84`, trocar o valor de `icon` de cada entrada do emoji para o caminho do ícone gerado, por exemplo:

```tsx
const categories = [
  { id: "paises", label: "Países", icon: "/icons/categoria-paises.svg", hint: "culturas e lugares do mundo" },
  { id: "comidas", label: "Comidas", icon: "/icons/categoria-comidas.svg", hint: "pratos, bebidas e ingredientes" },
  { id: "brasil", label: "Brasil", icon: "/icons/categoria-brasil.svg", hint: "lugares, costumes e cultura" },
  { id: "futebol", label: "Futebol", icon: "/icons/categoria-futebol.svg", hint: "jogadores, clubes e estádio" },
  { id: "filmes", label: "Filmes e séries", icon: "/icons/categoria-filmes.svg", hint: "personagens, histórias e telas" },
  { id: "profissoes", label: "Profissões", icon: "/icons/categoria-profissoes.svg", hint: "trabalhos e ferramentas" },
  { id: "animais", label: "Animais", icon: "/icons/categoria-animais.svg", hint: "do quintal à floresta" },
  { id: "musica", label: "Música", icon: "/icons/categoria-musica.svg", hint: "artistas, ritmos e instrumentos" },
  { id: "games", label: "Games", icon: "/icons/categoria-games.svg", hint: "jogos, consoles e personagens" },
  { id: "objetos", label: "Objetos", icon: "/icons/categoria-objetos.svg", hint: "coisas do dia a dia" },
  { id: "internet", label: "Internet", icon: "/icons/categoria-internet.svg", hint: "memes, apps e redes" },
  { id: "misturado", label: "Tudo misturado", icon: "/icons/categoria-misturado.svg", hint: "uma surpresa a cada rodada" },
];
```

- [ ] **Step 2: Trocar o `<select>` de categoria para usar imagens**

O HTML `<option>` não aceita `<img>` dentro do texto — manter o `<select id="category">` de `app/page.tsx:890` só com `{item.label}` (remover `{item.icon}` do texto da option, já que era o emoji). Junto ao `<select>`, adicionar um ícone visual fixo do lado de fora mostrando a categoria selecionada:

```tsx
<label className="field-label" htmlFor="category">Assunto da rodada</label>
<div className="category-select-row">
  <img className="category-select-icon" src={categories.find((item) => item.id === category)?.icon} alt="" aria-hidden="true" />
  <select id="category" className="wide-select" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select>
</div>
```

- [ ] **Step 3: Trocar `.category-preview` e `.proof-row` na hero**

Em `app/page.tsx:871`, trocar:

```tsx
<div className="category-preview" aria-hidden="true"><span>🌎</span><span>🍕</span><span>⚽</span><span>🎬</span><span>🎮</span><b>assuntos para todo tipo de turma</b></div>
```

por:

```tsx
<div className="category-preview" aria-hidden="true">{["paises", "comidas", "futebol", "filmes", "games"].map((id) => <span key={id}><img src={categories.find((item) => item.id === id)!.icon} alt="" /></span>)}<b>assuntos para todo tipo de turma</b></div>
```

Os emojis em `.proof-row` (`⚡`, `💬`, `📱`) e no `suspicion-note`/`hero-mascot > span` (`?`) e no `chat-empty` (`🕵️`) e no `lobby` (`👥`, `⏱️`) e no `profile-save` (`G`) não fazem parte do pacote de ilustração de categorias — mantê-los como estão (fora do escopo deste redesign; são glifos utilitários pequenos, não o problema de "genérico" identificado no spec).

- [ ] **Step 4: Trocar o mascote em `app/globals.css`**

Em `app/globals.css:60`, trocar `background: url("/mascote-na-miuda.png") center / contain no-repeat;` por `background: url("/mascote-na-miuda-noir.png") center / contain no-repeat;`.
Em `app/globals.css:76`, mesma troca para `.hero-mascot`.

- [ ] **Step 5: Adicionar `.category-select-row`/`.category-select-icon` e o quadro de investigação ao CSS**

Em `app/globals.css`, logo após a regra `.wide-select` (linha 121), adicionar:

```css
.category-select-row { display: flex; align-items: center; gap: 10px; margin-bottom: 13px; }
.category-select-icon { width: 22px; height: 22px; flex: 0 0 auto; filter: drop-shadow(0 0 6px rgba(217, 164, 65, .35)); }
.category-select-row .wide-select { margin-bottom: 0; }
.category-preview img { width: 18px; height: 18px; }
```

Na regra `.entry-card` (linha 92), acrescentar a textura do quadro de investigação como uma segunda camada de fundo, por trás do gradiente que já existe (a declaração `background` atual vira uma lista separada por vírgula, mantendo a ordem: gradiente existente primeiro, imagem depois):

```css
.entry-card { position: relative; padding: clamp(22px, 3vw, 34px); border: 1px solid var(--border-strong); border-radius: var(--radius-xl); background: linear-gradient(145deg, color-mix(in srgb, var(--surface-2) 96%, transparent), color-mix(in srgb, var(--surface-1) 92%, transparent)), url("/case-board.png") center / cover no-repeat; box-shadow: var(--shadow-panel), var(--glow-primary); }
```

- [ ] **Step 6: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS. Se algum teste procurar por um emoji literal (ex.: `🌎`) no HTML renderizado, abrir o teste e trocar a asserção para checar `img[src*="categoria-paises"]` ou o texto do label, mantendo a intenção original do teste (existência do item, não o emoji específico).

- [ ] **Step 7: Verificação visual manual**

Run: `npm run dev`, abrir `http://localhost:5173`, confirmar: logo do topo e mascote da hero usando a arte nova, ícones de categoria visíveis no `<select>` e na prévia da hero, sem emoji quebrado ou alt-text feio.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx app/globals.css
git commit -m "Aplica mascote e icones de categoria noir na landing"
```

---

### Task 4: Avatares em duotone âmbar/carvão

**Files:**
- Modify: `app/layout-stability.css:66` (`.avatar-portrait`)
- Modify: `app/globals.css:107` (`.avatar-choice-portrait`)
- Test: `npm test`

**Interfaces:**
- Consumes: nenhum asset novo — usa `filter` CSS sobre as imagens já existentes em `public/avatars/*.webp`.

- [ ] **Step 1: Aplicar duotone via CSS `filter`**

Em `app/layout-stability.css:66`, trocar:

```css
.avatar-portrait { position: absolute; inset: 0; z-index: 1; background-position: center 18%; background-repeat: no-repeat; background-size: cover; }
```

por:

```css
.avatar-portrait { position: absolute; inset: 0; z-index: 1; background-position: center 18%; background-repeat: no-repeat; background-size: cover; filter: grayscale(.4) sepia(.25) saturate(1.3) contrast(1.05); }
```

Em `app/globals.css:107`, na regra `.avatar-choice-portrait`, adicionar a mesma propriedade `filter` ao final da declaração existente (mantendo `border`, `background-color`, etc. como estão):

```css
.avatar-choice-portrait { width: 43px; height: 43px; border: 2px solid color-mix(in srgb, var(--avatar-choice-accent) 68%, white); border-radius: 50%; background-color: color-mix(in srgb, var(--avatar-choice-accent) 24%, var(--surface-2)); background-position: center 18%; background-repeat: no-repeat; background-size: cover; box-shadow: 0 4px 12px rgba(0,0,0,.2); filter: grayscale(.4) sepia(.25) saturate(1.3) contrast(1.05); }
```

- [ ] **Step 2: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS (mudança é puramente visual, não deve afetar asserções de estrutura/texto).

- [ ] **Step 3: Verificação visual manual**

Run: `npm run dev`, abrir a lista de avatares no formulário de entrada e a lista de jogadores dentro de uma sala demo — confirmar que os retratos ganharam um tom terroso/âmbar sem perder legibilidade dos rostos.

- [ ] **Step 4: Commit**

```bash
git add app/layout-stability.css app/globals.css
git commit -m "Aplica tratamento duotone aos avatares dos jogadores"
```

---

### Task 5: Revelação de papel — flip de carta mais dramático

**Files:**
- Modify: `app/layout-stability.css` (regras `.role-card`, `.role-card.revealed`, animação `reveal-card-open` — localizar com `grep -n "reveal-card-open" app/layout-stability.css`)
- Test: `npm test`

**Interfaces:**
- Consumes: nenhuma prop nova — a lógica de `revealMotion`/`roleVisible` em `app/page.tsx:733-757` já controla as classes `scanning`/`revealed`/`role-is-impostor`/`role-is-player` que este CSS consome; não mexer nessa lógica.

- [ ] **Step 1: Encontrar a keyframe atual**

Run: `grep -n "reveal-card-open\|@keyframes" "app/layout-stability.css" | head -20`

Ler o bloco `@keyframes reveal-card-open { ... }` retornado antes do próximo passo, para não duplicar nomes de keyframe.

- [ ] **Step 2: Adicionar perspectiva 3D ao container e reforçar a animação de abertura**

Em `app/layout-stability.css`, na regra `.role-reveal-stage` (buscar com `grep -n "\.role-reveal-stage" app/layout-stability.css`), adicionar `perspective: 900px;` à declaração existente (sem remover as propriedades já presentes).

Na regra `.role-card` (linha ~317-321 conforme o grep do Task 1), adicionar `transform-style: preserve-3d; will-change: transform;` à declaração base do `.role-card` (mesma linha da regra já existente, junto das outras propriedades).

Substituir a keyframe `reveal-card-open` (a que a regra `.role-card.revealed` referencia) por uma versão com giro no eixo Y:

```css
@keyframes reveal-card-open {
  0% { transform: rotateY(-18deg) scale(.94); opacity: .4; }
  60% { transform: rotateY(6deg) scale(1.02); opacity: 1; }
  100% { transform: rotateY(0deg) scale(1); opacity: 1; }
}
```

(Mantém o mesmo nome de keyframe e a mesma referência em `.role-card.revealed { ... animation: reveal-card-open .72s cubic-bezier(.16, .88, .22, 1.08) both; }` — só troca o `@keyframes`, não a regra que o chama.)

- [ ] **Step 3: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Verificação visual manual**

Run: `npm run dev`, criar uma sala demo, avançar até a fase de revelação, tocar no cartão e observar o giro 3D ao revelar o papel. Confirmar que com `prefers-reduced-motion` ativado no sistema operacional a animação não ocorre (a regra global de `app/globals.css:202-204` já zera a duração).

- [ ] **Step 5: Commit**

```bash
git add app/layout-stability.css
git commit -m "Adiciona giro 3D a carta de revelacao de papel"
```

---

### Task 6: Anel de tempo com pulso nos segundos finais

**Files:**
- Modify: `app/layout-stability.css:151-152` (`.timer-ring.is-critical`)
- Test: `npm test`

**Interfaces:**
- Consumes: a classe `.is-critical` já é alternada por `syncDiscussionUrgency()` em `app/game-motion-controller.tsx:32-40` quando faltam ≤10s — não mexer nessa lógica, só no CSS que a classe dispara.

- [ ] **Step 1: Adicionar animação de pulso**

Em `app/layout-stability.css`, logo após a regra `.timer-ring.is-critical { ... }` (linha 151), adicionar:

```css
.timer-ring.is-critical { animation: timer-pulse 1s ease-in-out infinite; }
@keyframes timer-pulse {
  0%, 100% { box-shadow: var(--glow-danger); }
  50% { box-shadow: 0 0 42px rgba(184, 67, 58, .5); }
}
```

(Isso substitui/complementa a declaração existente de `.timer-ring.is-critical` — manter as propriedades de borda que já estão lá, só adicionar a linha `animation` e o novo `@keyframes` depois do bloco.)

- [ ] **Step 2: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Verificação visual manual**

Run: `npm run dev`, entrar em uma sala demo, chegar à fase de discussão e observar os últimos 10 segundos do cronômetro pulsando em vermelho-ferrugem.

- [ ] **Step 4: Commit**

```bash
git add app/layout-stability.css
git commit -m "Adiciona pulso ao anel de tempo nos segundos finais"
```

---

### Task 7: Resultado — carimbo de veredito

**Files:**
- Modify: `app/game-ui.css:220-223` (`.result-confetti` e vizinhas — localizar bloco de `.results-hero`/`.result-burst` com `grep -n "result-burst\|results-hero" app/game-ui.css app/layout-stability.css`)
- Test: `npm test`

**Interfaces:**
- Consumes: as classes `result-group-win`/`result-impostor-win` já aplicadas em `app/page.tsx:1197` (`Results`) — não mexer no componente `Results`, só no CSS.

- [ ] **Step 1: Localizar a regra `.result-burst`**

Run: `grep -rn "\.result-burst" app/*.css`

- [ ] **Step 2: Adicionar animação de carimbo**

No arquivo e linha retornados pelo grep, adicionar (mantendo as propriedades já existentes na regra `.result-burst` e só acrescentando a `animation`):

```css
.result-burst { animation: verdict-stamp .5s cubic-bezier(.2, 1.4, .4, 1) both; }
@keyframes verdict-stamp {
  0% { transform: scale(2.2) rotate(-14deg); opacity: 0; }
  70% { transform: scale(.94) rotate(-4deg); opacity: 1; }
  100% { transform: scale(1) rotate(-6deg); opacity: 1; }
}
```

- [ ] **Step 3: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Verificação visual manual**

Run: `npm run dev`, jogar uma rodada demo completa até a tela de resultado, confirmar o efeito de "carimbo" no ícone de veredito (troféu ou alerta) ao entrar na tela.

- [ ] **Step 5: Commit**

```bash
git add app/game-ui.css
git commit -m "Adiciona animacao de carimbo ao veredito do resultado"
```

(Se o grep do Step 1 apontar para um arquivo diferente de `app/game-ui.css`, ajustar o `git add` para o arquivo correto antes de commitar.)

---

### Task 8: Revisão do tema claro

**Files:**
- Modify: `app/globals.css:37-42` (`:root[data-theme="light"]`) — já reescrito na Task 1, esta task é de verificação e ajuste fino.
- Test: `npm test`

**Interfaces:**
- Nenhuma nova — task de QA visual sobre o trabalho das tasks 1-7 no tema claro.

- [ ] **Step 1: Verificação visual manual no tema claro**

Run: `npm run dev`, abrir `http://localhost:5173`, clicar no seletor de tema no topo e escolher "Claro". Percorrer: landing, formulário de sala, lobby demo, revelação, discussão, votação, resultado.

- [ ] **Step 2: Ajustar contraste se necessário**

Se algum texto ficar pouco legível (ex.: `--text-muted` muito claro sobre `--surface-2` claro), ajustar apenas os valores dentro de `:root[data-theme="light"]` em `app/globals.css:37-42` — não introduzir novas variáveis, só recalibrar os tons já definidos na Task 1 até o contraste ficar confortável (teste visual, não uma métrica automatizada).

- [ ] **Step 3: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit** (só se o Step 2 mudou algo)

```bash
git add app/globals.css
git commit -m "Ajusta contraste do tema claro na paleta noir"
```

---

### Task 9: Verificação final

**Files:**
- Nenhum arquivo novo — task de checagem.

**Interfaces:**
- Nenhuma.

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm test`
Expected: PASS (build + todos os arquivos listados no script `test` de `package.json:13`).

- [ ] **Step 2: Rodar o lint**

Run: `npm run lint`
Expected: PASS sem novos avisos introduzidos pelas mudanças de JSX da Task 3.

- [ ] **Step 3: Passagem visual completa nas 5 fases + landing, tema escuro e claro**

Run: `npm run dev`, e para cada combinação de tema (claro/escuro) percorrer: landing → criar sala demo → lobby → revelar papel → discussão → decisão → votação → resultado → nova rodada. Confirmar: nenhuma classe CSS órfã (sem estilo), nenhum emoji de categoria sobrando, fontes carregando (sem fallback visível por mais de 1s), nenhuma quebra de layout em 375px de largura (usar `resize_window` preset mobile se estiver testando via ferramenta de browser).

- [ ] **Step 4: Conferir `git log` do trabalho**

Run: `git log --oneline -15`
Expected: uma sequência de commits claros, um por task (tokens/fontes, ilustração gerada, ilustração aplicada, avatares, revelação, timer, resultado, tema claro).
