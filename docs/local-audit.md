# Auditoria para operação local

Data da auditoria: 23/10/2026.

## Resultado

O aplicativo pode operar na rede local sem hospedagem. O Supabase continua sendo necessário, mas será executado localmente em Docker. Depois que as dependências e imagens Docker forem baixadas, os fluxos principais não dependem da internet.

## Dependências externas encontradas

| Dependência | Momento | Tratamento local |
| --- | --- | --- |
| npm registry | Instalação/atualização | Necessário somente para `npm ci` e para obter a Supabase CLI na primeira instalação. |
| Imagens Docker do Supabase | Primeira inicialização | Necessárias uma vez; depois ficam no cache do Docker. |
| Meta Graph API | Somente WhatsApp real | Opcional. `WHATSAPP_MOCK=true` substitui a Meta no modo local. |
| `wa.me` | Link manual da Central de Pedidos | Opcional; exige internet e abre o WhatsApp fora do sistema. |
| Google Maps | Link manual de endereço de entrega | Opcional; o pedido e o endereço continuam visíveis sem o mapa. |
| Links de documentação | Documentação | Não são carregados pelo aplicativo. |

Não foram encontrados analytics, fontes remotas, CDN, imagens remotas nem assets externos carregados automaticamente. Não existem URLs ou chaves reais do Supabase versionadas; `.env.example` continha apenas placeholders. A URL efetiva vem de `.env.local`.

## Correções realizadas

- A telemetria do Next.js foi desabilitada por `NEXT_TELEMETRY_DISABLED=1` nos comandos e no exemplo de ambiente.
- Os três usos de `crypto.randomUUID()` em Client Components foram substituídos por `src/lib/uuid.ts`. O helper usa `randomUUID` quando disponível, depois `getRandomValues` e, por último, um identificador aleatório suficiente para linhas temporárias do carrinho.
- Não há uso de `navigator.clipboard`, Wake Lock ou Service Worker em `src`.
- A Central de Pedidos já possuía ativação de som por gesto do usuário. O KDS ganhou o mesmo controle para avisar sobre novos itens.

## Sessão e HTTP na LAN

Os clientes `@supabase/ssr` não definem `Secure` manualmente. A versão instalada usa por padrão `path=/` e `sameSite=lax`, sem forçar `secure`, portanto os cookies podem persistir em `http://<IP-DA-LAN>:3000`. A renovação continua em `src/proxy.ts`.

Essa conclusão foi verificada estaticamente no código da versão instalada. O login em um telefone real ainda deve ser validado depois que o Supabase local estiver iniciado.

## Realtime

Os navegadores de funcionários se conectam diretamente ao endpoint configurado em `NEXT_PUBLIC_SUPABASE_URL`. Para dispositivos da rede, ele deve usar o IP LAN do computador, nunca `127.0.0.1`. As tabelas `orders`, `order_items`, `tables` e `service_requests` estão previstas na publicação Realtime pelas migrations.

## Chaves locais

A premissa do prompt sobre configurar `jwt_secret` no `config.toml` foi reavaliada contra a referência atual da CLI. Essa opção não faz parte da configuração documentada. A CLI atual gera chaves opacas `publishable` e `secret` para a stack local, que substituem as chaves JWT legadas.

O aplicativo agora prefere `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`, mantendo as variáveis antigas apenas como fallback de migração. A chave secret permanece em código marcado como `server-only`. Essa abordagem evita depender do JWT de demonstração conhecido e segue a recomendação atual do Supabase: <https://supabase.com/docs/guides/getting-started/api-keys>.

## Verificações do repositório

- As quatro migrations informadas existem.
- Ao contrário da hipótese inicial do prompt, `supabase/tests/table_self_service_test.sql` e `supabase/tests/whatsapp_bot_test.sql` também existem no repositório atual.
- Docker e Supabase CLI não estavam disponíveis no ambiente desta auditoria. A aplicação real das migrations e os testes SQL ficaram pendentes para uma máquina com Docker.

## Build offline

`npm run build` não requer fontes ou assets remotos. Referências `https://` que possam aparecer dentro de bundles de dependências são exemplos/comentários dos pacotes ou endpoints opcionais; não representam downloads durante o build. O resultado e a varredura final do build devem ser repetidos depois de cada mudança de dependência.
