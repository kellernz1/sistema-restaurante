# Repasse do projeto: Sistema de Restaurante

Este documento resume o contexto de trabalho compartilhado com o Codex para que outro desenvolvedor possa clonar o repositório e continuar o projeto sem depender do histórico original da conversa.

> Este arquivo é um resumo de continuidade, não uma exportação literal da conversa.

## Repositório e fontes de contexto

- GitHub: <https://github.com/kellernz1/sistema-restaurante>
- Branch principal: `main`.
- O `AGENTS.md` é a fonte principal de convenções e do estado atual.
- O escopo completo está em `restaurant_system_master_prompt_improved.md`.
- O guia do banco está em `docs/supabase-setup.md`.

## Stack

- Next.js 16 com App Router, React 19 e TypeScript estrito.
- Tailwind CSS 4 e Lucide React.
- Supabase PostgreSQL, Auth, Row Level Security e Realtime.
- `@supabase/ssr` para sessões baseadas em cookies.

## Convenções essenciais

- Código, identificadores, comentários e commits em inglês.
- Interface em português brasileiro (`pt-BR`).
- Server Components por padrão; Client Components somente para interação ou Realtime.
- Imports internos de `src` usam `@/*`.
- `SUPABASE_SERVICE_ROLE_KEY` é exclusiva do servidor.
- Clientes públicos nunca acessam o Supabase diretamente.
- Preços, totais e integridade dos pedidos são protegidos no PostgreSQL.
- Uma nova fase só começa depois da resposta explícita `CONFIRMED`.
- Antes de alterar Next.js, consulte a documentação instalada em `node_modules/next/dist/docs/`.

## Estado das fases

### Fase 1 — Configuração e arquitetura

Concluída no commit `bbab9ae`.

- Projeto e dependências configurados.
- Estrutura de pastas criada.
- Clientes Supabase para navegador, servidor, middleware e administração adicionados.

### Fase 2 — Banco de dados e RLS

Concluída no código no commit `3e929e9`.

- Migration: `supabase/migrations/202610220001_initial_schema.sql`.
- Seed: `supabase/seed.sql`.
- Teste transacional: `supabase/tests/rls_smoke_test.sql`.
- Tipos: `src/types/database.types.ts`.

O PostgreSQL foi informado como instalado. A migration, o seed e o teste ainda devem ser executados e confirmados no ambiente Supabase utilizado pela equipe.

### Fase 3 — Autenticação

Concluída no commit `2e0a2c3`.

- Login, provider de autenticação e logout.
- Rotas iniciais por função.
- Renovação de sessão e proteção otimista em `src/proxy.ts`.
- O RLS permanece como limite definitivo de autorização.

### Fase 4 — Painel de mesas do garçom

Implementada localmente e ainda não registrada em commit no momento deste repasse.

- Grade responsiva de mesas em `/waiter`.
- Cores e contadores para mesas disponíveis, ocupadas e em fechamento.
- Abertura atômica com a RPC `open_table`.
- Proteção imediata contra clique duplo.
- Tratamento amigável quando outro garçom abre a mesma mesa primeiro.
- Atualização por Realtime com limpeza da inscrição ao desmontar.
- Rota provisória `/waiter/tables/[tableId]` para a comanda ativa.

Próxima fase prevista: Fase 5, somente depois de uma nova confirmação.

## Configuração em outra máquina

```powershell
git clone https://github.com/kellernz1/sistema-restaurante.git
Set-Location sistema-restaurante
npm ci
Copy-Item .env.example .env.local
```

Preencha `.env.local` com as credenciais do Supabase sem enviar o arquivo ao Git. Depois siga `docs/supabase-setup.md` e valide:

```powershell
npm run lint
npm run build
npm run dev
```

## Mensagem sugerida para um novo chat

```text
Leia AGENTS.md, conversa-restaurante.md e restaurant_system_master_prompt_improved.md.
Confira o estado real do Git e dos arquivos antes de agir.
Continue somente a fase autorizada e preserve todas as convenções do projeto.
```

## Coordenação da equipe

- Usem branches separadas e pull requests pequenos.
- Sincronizem com `main` antes de iniciar uma tarefa.
- Não versionem `.env.local` nem credenciais.
- Regenerem `src/types/database.types.ts` depois de alterar o schema.
- Registrem decisões duráveis em `AGENTS.md` ou `docs/`, não somente no chat.
- Executem lint e build antes de integrar mudanças.
