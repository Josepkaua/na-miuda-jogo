# Na Miúda!

Um jogo brasileiro de dedução social para jogar à distância. Todo mundo recebe a mesma palavra — menos o impostor, que precisa improvisar sem ser descoberto.

## O que já funciona

- Salas privadas com código e link de convite
- 3 a 20 jogadores e até 4 impostores
- 12 temas, incluindo países, comidas, Brasil, futebol, filmes e modo misto
- Sugestões automáticas de tempo e quantidade de impostores
- Sorteio secreto de papéis, ordem de fala, cronômetro, votação e resultado
- Reconexão de jogadores e transferência automática de anfitrião
- Login opcional por Gmail via link mágico
- Tema claro, escuro ou automático pelo sistema
- Interface responsiva para celular e computador

## Tecnologias

- Next.js/Vinext, React e TypeScript
- Supabase Postgres, Auth, Row Level Security e funções RPC
- Render para hospedagem pública

## Desenvolvimento local

Requer Node.js 22.13 ou superior.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Preencha no `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave-publicavel
```

## Banco de dados

As migrações versionadas estão em `supabase/migrations`. Os papéis e palavras ficam em um schema privado; o navegador acessa o jogo somente por funções RPC validadas. Nunca use uma chave `service_role` no cliente.

Para validar um projeto Supabase já migrado:

```bash
TEST_SUPABASE_URL=https://seu-projeto.supabase.co \
TEST_SUPABASE_PUBLISHABLE_KEY=sua-chave-publicavel \
node scripts/smoke-supabase.mjs
```

## Deploy no Render

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health path: `/`

Defina as mesmas duas variáveis públicas do Supabase no serviço do Render.

## Licença

Projeto público. Antes de redistribuir comercialmente, adicione a licença desejada ao repositório.
