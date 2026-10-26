# Pedidos por QR e NFC

O bloco 6 substitui a confirmação antiga pelo fluxo configurável de caixa: pedidos pendentes separados da conta, nome obrigatório, telefone configurável, cancelamento e garçom opcional. Consulte [service-modes.md](service-modes.md) antes de seguir as instruções históricas abaixo.

## Preparar o sistema

1. Configure o Supabase conforme `supabase-setup.md` e aplique a nova migration `supabase/migrations/202610220002_table_self_service.sql` depois da migration inicial. Ela cria chamados, limites de uso e funções com verificação de acesso, e atualiza a criação de pedidos para conferir o token dentro da transação. Não execute a migration inicial novamente em um banco já configurado.
2. Execute `npm run db:verify-history` e `npm run db:validate-clean`. A suíte atual `supabase/tests/service_modes_test.sql` substitui a antiga de autoatendimento; as suítes usam bancos temporários e transações com rollback. Migrações são aplicadas apenas pela CLI oficial, nunca coladas no SQL Editor.
3. Em `.env.local`, preencha as credenciais reais do Supabase, incluindo `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor, e defina `NEXT_PUBLIC_APP_URL` com a origem pública, por exemplo `https://restaurante.exemplo.com`. Não use localhost nos códigos destinados aos clientes. O telefone precisa alcançar o servidor.
4. Habilite os pedidos pela mesa em `restaurant_settings`: `dine_in_qr_enabled = true` e `is_accepting_orders = true`. `require_confirmation_for_qr = true` faz o primeiro pedido de uma mesa disponível aguardar o garçom. A tela de configurações será feita na Fase 9; por enquanto altere os valores no Supabase.
5. Publique a aplicação no ambiente escolhido, configure as mesmas variáveis nele e confira HTTPS. Esta fase não publica automaticamente.
6. Entre como administrador e abra `/admin/tables/qr`. Confira cada mesa e a origem dos links. Aguarde todos os códigos carregarem e use Imprimir folha A4. Confira a prévia e teste uma impressão antes de produzir todas.

## Fluxo dos clientes e da equipe

O QR abre `/t/TOKEN?src=qr`. O cliente vê somente produtos ativos, monta o pedido com quantidades e observações e pode informar seu nome. Os preços definitivos são obtidos pelo banco. Uma comanda ativa recebe os novos itens; sem comanda, o primeiro pedido cria uma. Pedidos pendentes aparecem em `/waiter`, com Conferir itens, Confirmar e Rejeitar. A cozinha só vê pedidos abertos.

Após o envio, o cliente acompanha Recebido, Preparando, Pronto e Entregue por consultas a cada aproximadamente cinco segundos, sem acesso direto ao Supabase. O identificador da última comanda fica em `sessionStorage`, quando permitido pelo navegador. O acompanhamento mostra os itens da comanda compartilhada da mesa, sem nomes de clientes, telefones, observações ou dados de outras mesas.

Chamar garçom cria um chamado de atendimento. Pedir a conta cria um chamado e coloca a mesa em fechamento em uma única transação. O garçom marca os chamados como atendidos. Pedir a conta exige comanda ativa. Chamados iguais já abertos são reutilizados.

## Gravar NFC

NTAG213, NTAG215 e NTAG216 são etiquetas NFC Forum Type 2. Use uma etiqueta com espaço suficiente para a URL completa; confira a capacidade e o tamanho do registro no aplicativo antes de gravar. Referência: [NXP NTAG21x](https://www.nxp.com/docs/en/data-sheet/NTAG213_215_216.pdf).

1. Instale o NFC Tools da Wakdev em um telefone compatível. Consulte o [tutorial oficial de gravação de URL](https://www.wakdev.com/en/knowledge-base/videos/how-to-write-a-url-on-your-nfc-tags.html).
2. Copie o link NFC exibido na ficha da mesa: `https://SEU-DOMINIO/t/TOKEN?src=nfc`.
3. Na área de gravação do aplicativo, adicione um registro URL/URI com esse endereço completo. Grave como registro NDEF de URL; um registro de texto não substitui o endereço navegável.
4. Aproxime a etiqueta do leitor do telefone, conclua a gravação e leia a etiqueta novamente. Confira a mesa e envie um pedido de teste. Não há código Web NFC no site: a etiqueta abre a mesma página do QR, com origem NFC.
5. Somente após testar, se quiser impedir regravações, use Other/Outros → Lock a tag/Bloquear etiqueta, conforme o [guia oficial da Wakdev](https://www.wakdev.com/en/knowledge-base/how-to-guides/how-to-lock-an-nfc-chip.html). O bloqueio é permanente. Uma etiqueta bloqueada precisará ser substituída se o token ou domínio mudar.

Coloque a etiqueta em um local acessível na mesa, protegido de líquidos e identificado com o número correto. Teste a leitura na superfície real; para metal, use uma etiqueta adequada à superfície. Mantenha o QR impresso ao lado como alternativa para aparelhos sem NFC ou com leitura indisponível.

## Renovar os códigos

Em `/admin/tables/qr`, Renovar token exige confirmação e acesso de administrador. O token anterior deixa de funcionar para cardápio, novos pedidos, acompanhamento e chamados. Imprima o novo QR e regrave ou substitua a etiqueta NFC. A rotação não cancela pedidos existentes.

## Limites e infraestrutura

O PostgreSQL mantém contadores por janelas fixas de dez minutos: 20 escritas por token de mesa e 60 por origem de rede; leituras permitem 6.000 por token e 1.800 por origem. Escritas incluem pedidos e chamados. Os identificadores de rede e mesa são armazenados como HMAC, sem IP ou token bruto. Contadores antigos são removidos em chamadas posteriores após duas horas. O limite é compartilhado pelas instâncias da aplicação e falha fechado se o banco estiver indisponível. Respostas excedidas usam HTTP 429 e Retry-After.

`PUBLIC_TRUST_PROXY=false` é o padrão: todas as origens usam um contador de rede compartilhado. Ative `true` apenas após garantir que o proxy da implantação sobrescreve `X-Forwarded-For` com dados confiáveis. Caso contrário, o cabeçalho pode ser falsificado. Ajuste capacidade operacional e teste o volume de consultas antes de usar com o restaurante cheio. O código usa a primeira origem encaminhada e precisa dessa garantia do proxy.

O token funciona como acesso à mesa: mantenha-o nos QR/NFC destinados aos clientes e evite registrá-lo em serviços de analytics. Desabilite ou masque caminhos com tokens nos logs do proxy. A página usa no-referrer e não permite indexação; respostas da API não são armazenadas em cache. Se houver dúvida sobre o envio após falha de rede, confira com o garçom antes de reenviar, pois não há deduplicação automática de uma nova tentativa após perda da resposta.

## Regenerar os tipos

Os tipos locais foram atualizados a partir da migration, sem conexão a um projeto real. Após aplicá-la, regenere com o comando abaixo, substituindo a referência:

```powershell
npx supabase gen types typescript --project-id YOUR_PROJECT_REF --schema public | Set-Content -Encoding utf8 src/types/database.types.ts
npm run lint
npm run build
```
