# Instalação e operação local

Este guia coloca o Mesa Certa para funcionar em um computador do restaurante. O banco roda no Docker e a aplicação roda no Node.js. Depois da instalação, pedidos, telas da equipe, QR das mesas e o simulador de WhatsApp funcionam sem hospedagem ou serviços de nuvem.

## Antes de começar

Instale no computador:

- Docker Desktop e mantenha-o aberto;
- Node.js LTS 20 ou mais recente;
- Git, para baixar e atualizar o projeto;
- um navegador moderno.

O primeiro preparo baixa as imagens do Supabase e, portanto, precisa de internet. Depois que as imagens, pacotes e o código estiverem presentes, a operação diária é local. O projeto fixa a versão `2.121.0` da CLI do Supabase e a executa com `npx`, sem instalação global.

## Primeira instalação

Abra um terminal na pasta do projeto e execute, nesta ordem:

```text
npm ci
npm run local:setup
npm run local:start
```

`local:setup` inicia o Supabase, aplica todas as migrations e o seed base, cria `.env.local`, as contas da equipe e os dados demonstrativos. Na primeira execução, aceite no firewall apenas as portas indicadas na seção de rede. O comando é idempotente: em uma nova execução ele não apaga o banco. Para escolher manualmente o IP, use:

```text
npm run local:setup -- --ip 192.168.1.50
```

Use `npm run local:setup -- --no-demo` para criar apenas as contas da equipe. O padrão é instalar a demonstração completa. Ao terminar, `npm run local:info` mostra endereços, contas e todos os links QR.

## Rotina diária

Com o Docker Desktop aberto, inicie tudo com:

```text
npm run local:start
```

Esse comando preserva os dados, inicia o Supabase, recompila a aplicação quando necessário, publica o servidor em toda a rede local e inicia o worker do WhatsApp. Os registros ficam em `logs/`.

Antes de desligar o computador, execute:

```text
npm run local:stop
```

Depois de uma queda de energia, abra o Docker Desktop e rode `npm run local:start`. Se o endereço IP do computador mudou, execute primeiro `npm run local:env -- --ip NOVO_IP`; depois inicie novamente a aplicação e reimprima os QR codes.

Para desenvolvimento, use `npm run dev:lan`. Ele não substitui a rotina de produção do restaurante.

## Rede Wi-Fi e firewall

No roteador, reserve um IP fixo para o computador pelo endereço MAC, por exemplo `192.168.1.50`. Tablets e celulares precisam estar no mesmo Wi-Fi. Redes de convidados frequentemente isolam um aparelho do outro e não devem ser usadas.

No firewall do computador, permita entrada pela rede privada somente nestas portas:

- `3000`: aplicação Mesa Certa;
- `54321`: API e Realtime do Supabase.

Mantenha bloqueadas para a rede as portas `54322` (PostgreSQL) e `54323` (Supabase Studio). O Studio deve ser aberto somente no computador principal em `http://127.0.0.1:54323`. Nunca encaminhe essas portas no roteador para a internet.

Após fixar o IP, rode `npm run local:env -- --ip 192.168.1.50`. A URL do Supabase também precisa usar esse IP porque os navegadores dos tablets conectam diretamente ao Realtime. Se o IP mudar, os QR codes antigos apontarão para o endereço errado; gere o ambiente novamente e reimprima-os em `/admin/tables/qr`.

## Telas da equipe e dos clientes

Troque `192.168.1.50` pelo IP exibido por `npm run local:info`:

- login da equipe: `http://192.168.1.50:3000/login`;
- garçom: `/waiter`;
- cozinha: `/kitchen`;
- caixa: `/cashier`;
- administração: `/admin`;
- Central de Pedidos: `/orders`;
- retirada e entrega: `/order`;
- simulador do WhatsApp: `/dev/whatsapp`.

No tablet ou celular, abra a tela no navegador e use “Adicionar à tela inicial”. Como a rede usa HTTP, o Wake Lock do navegador pode não estar disponível; configure o sistema do tablet para não apagar a tela enquanto estiver conectado à energia. O login por cookie funciona em HTTP local e a autorização continua protegida pelas políticas RLS do banco.

## Contas demonstrativas

Todas usam a senha definida em `DEMO_PASSWORD`, inicialmente `Demo@12345`:

| Função | E-mail | Tela |
| --- | --- | --- |
| Administrador | `admin@restaurante.local` | `/admin` |
| Garçom | `garcom@restaurante.local` | `/waiter` |
| Garçom 2 | `garcom2@restaurante.local` | `/waiter` |
| Cozinha | `cozinha@restaurante.local` | `/kitchen` |
| Caixa | `caixa@restaurante.local` | `/cashier` |

Troque essas senhas antes do uso real. A chave privada do Supabase e o segredo do worker ficam apenas em `.env.local` e `.local-secrets/`, ambos ignorados pelo Git. A chave pública é usada nos navegadores, mas RLS permanece como limite de autorização.

## Sair da demonstração e operar de verdade

Faça um backup e remova apenas os registros marcados como demo:

```text
npm run db:backup
npm run seed:clear-demo
```

Depois, crie usuários reais ou recrie as contas necessárias com senhas próprias, ajuste nome, taxas, tempos e canais em `/admin/settings`, cadastre o cardápio real e imprima novos QR codes. Para recriar a demonstração a qualquer momento, execute `npm run seed:demo`.

## Backups e restauração

Crie um backup manual com:

```text
npm run db:backup
```

O arquivo SQL é salvo em `backups/`; os 14 mais recentes são mantidos. Programe esse comando uma vez por dia e copie a pasta para um pendrive ou outro computador. Um backup no mesmo disco não protege contra defeito ou furto.

Para restaurar, mantenha o Supabase iniciado e execute `npm run db:restore`. Escolha o arquivo e digite `RESTORE`. A restauração substitui os dados atuais. O comando `npm run db:reset` é ainda mais destrutivo: exige `RESETAR`, cria um backup primeiro e recria o banco pelas migrations.

No Agendador de Tarefas do Windows, crie uma tarefa diária cuja ação seja `cmd.exe /c npm run db:backup` e informe a pasta do projeto em “Iniciar em”. No Linux, use o mesmo comando em um cron com o diretório correto.

## Iniciar automaticamente com o computador

No Windows, crie uma tarefa “Ao iniciar” ou “Ao fazer logon”, com atraso de cerca de um minuto para o Docker Desktop subir. Use `cmd.exe /c npm run local:start` e configure a pasta do projeto em “Iniciar em”. Execute a tarefa mesmo sem a janela aberta e faça um teste após reiniciar.

No Linux, um serviço `systemd` pode executar `npm run local:start` depois do Docker e chamar `npm run local:stop` ao encerrar. `pm2` também pode manter o comando ativo, mas é opcional. Em qualquer sistema, configure o Docker para iniciar automaticamente. Um nobreak (UPS) é recomendado para evitar desligamentos abruptos do banco e do roteador.

## WhatsApp

O modo local não envia mensagens reais. `/dev/whatsapp` usa o mesmo fluxo do bot e cria pedidos reais no banco. O worker iniciado por `local:start` processa a fila a cada 30 segundos; sem ele, notificações podem ficar pendentes.

O WhatsApp real é opcional e requer internet, conta Meta e um webhook HTTPS público. Use `WHATSAPP_MOCK=false` e as credenciais descritas em `docs/whatsapp-setup.md`. Se o computador não tiver domínio público, um Cloudflare Tunnel ou ngrok pode apontar somente para `/api/whatsapp/webhook`. Não exponha Supabase Studio ou PostgreSQL. Para HTTPS somente dentro da rede, `mkcert` é uma opção, mas exige instalar a autoridade local em cada aparelho.

## Verificação e manutenção

Com a aplicação iniciada, execute:

```text
npm run test:smoke
```

O teste confere saúde, banco, cinco logins, páginas públicas, ciclo de retirada, cozinha, RLS, WhatsApp e os testes SQL. `npm run test:all` acrescenta os testes unitários do WhatsApp. Depois de alterar o banco, rode `npm run types` e registre o novo `src/types/database.types.ts`.

### Validação completa com webhook e rota real

Com Docker e Supabase iniciados, execute `npm run test:external`. O comando compila
a aplicação e abre um servidor temporário somente em `127.0.0.1:3001`. A porta
pode ser alterada com `EXTERNAL_TEST_PORT`. Ela precisa estar livre.

O ambiente deve usar `APP_MODE=local`, `WHATSAPP_MOCK=true` e cobrança de entrega
por distância com a origem do restaurante configurada. A consulta real de rota
precisa de internet e usa `DELIVERY_ROUTING_URL`, ou o serviço público de demonstração
do OSRM no modo local. `DELIVERY_ROUTE_SMOKE_LOCATION` permite escolher outro ponto
de destino, diferente da origem. O teste confirma também cache, taxa, checkout
público e criação pelo caixa.

As credenciais de webhook são aleatórias e temporárias, compartilhadas apenas pelo
servidor de teste e pela suíte. Não é necessária uma conta Meta. Nenhuma credencial
real é substituída em `.env.local` e nenhuma mensagem real é enviada. O servidor
temporário é encerrado ao terminar, inclusive se os testes falharem. Seus registros
ficam em `logs/external-test-server.log`; o Supabase continua disponível até
`npm run local:stop`.

## Solução de problemas

- **Docker não inicia:** abra o Docker Desktop, espere o status ficar pronto e rode `npm run local:start` novamente.
- **Porta em uso:** encerre outro programa nas portas `3000`, `54321`, `54322` ou `54323`; não altere portas sem atualizar a documentação e o ambiente.
- **Celular não conecta:** confirme o mesmo Wi-Fi, desative a rede de convidados, confira o firewall e teste o IP exibido por `local:info`.
- **QR abre endereço antigo:** reserve o IP, rode `local:env -- --ip NOVO_IP`, reinicie e reimprima os QR codes.
- **Login volta para a tela inicial:** confira data e hora do aparelho, limpe os cookies do endereço local e confirme que a URL do Supabase em `.env.local` usa o IP da LAN.
- **Banco aparece indisponível:** abra `http://127.0.0.1:54323` somente no computador principal e consulte `logs/`; rode `npm run local:info` e `/api/health`.
- **WhatsApp não responde:** confirme `APP_MODE=local`, `WHATSAPP_MOCK=true`, o worker em `logs/whatsapp-worker.log` e o status 200 de `/api/health`.
