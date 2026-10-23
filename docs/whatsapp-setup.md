# Configurar pedidos pelo WhatsApp

## Banco e variáveis

1. Aplique `supabase/migrations/202610220004_whatsapp_bot.sql` depois das migrations anteriores. Não repita as migrations já aplicadas. Execute `supabase/tests/whatsapp_bot_test.sql` com o seed instalado; os dados do teste terminam em rollback.
2. Regenere os tipos do banco com o comando de `supabase-setup.md`. Os tipos locais desta fase foram atualizados a partir da migration, sem conexão a um projeto real.
3. Configure as variáveis de `.env.example` no servidor. `NEXT_PUBLIC_APP_URL` deve apontar para a origem HTTPS pública que os clientes conseguem abrir.

| Variável | Uso |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Token do System User para a API oficial |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número na Cloud API; não é o número com DDI |
| `WHATSAPP_VERIFY_TOKEN` | Segredo escolhido por você para validar o callback GET |
| `WHATSAPP_APP_SECRET` | App Secret usado no HMAC dos POSTs |
| `WHATSAPP_API_VERSION` | Versão suportada escolhida no painel Meta, no formato `vNN.0` |
| `WHATSAPP_WORKER_SECRET` | Segredo aleatório forte para a rotina de fila e o simulador |
| `WHATSAPP_MOCK` | `true` somente com `npm run dev`; `false` na implantação real |

Mantenha tokens, App Secret, worker secret e a chave service-role fora do navegador e do Git. Os valores de exemplo dos testes HTTP são fictícios e não devem ser reutilizados na implantação.

## Conta Meta e número de teste

1. Entre em Meta for Developers e crie/configure um app para a empresa. Adicione o produto WhatsApp e associe o portfólio empresarial e a WABA corretos. Os nomes das telas podem variar conforme o painel.
2. Na configuração inicial/API do WhatsApp, use o número de teste fornecido pela Meta. Cadastre um telefone destinatário autorizado e conclua a verificação oferecida pelo painel.
3. Copie o Phone Number ID e teste primeiro com o token temporário do painel. Depois configure um System User no Business Settings, atribua os ativos do app e da conta WhatsApp e gere seu token com os escopos de mensagens e gerenciamento necessários. Use uma duração apropriada, incluindo a opção sem expiração quando disponível; tokens ainda podem ser revogados. A [coleção oficial da Meta no Postman](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api) explica o início e os tokens de System User.
4. Configure `WHATSAPP_API_VERSION` com uma versão suportada exibida no painel da sua conta. O código exige configuração explícita, sem presumir uma versão atual fixa.
5. Copie o App Secret e escolha um verify token próprio. São segredos diferentes: o primeiro valida a assinatura de POST; o segundo valida o GET de cadastro.

## Webhook HTTPS

1. Para desenvolvimento real com o número de teste, inicie `npm run dev` e exponha a porta 3000 com um túnel HTTPS, como ngrok ou Cloudflare Tunnel. Configure `NEXT_PUBLIC_APP_URL` com essa origem quando o telefone precisar abrir os links. Não exponha o simulador com um segredo fraco.
2. Cadastre `https://SEU-DOMINIO/api/whatsapp/webhook` como callback no produto WhatsApp e informe exatamente o `WHATSAPP_VERIFY_TOKEN` do servidor.
3. O GET deve devolver o `hub.challenge` quando `hub.mode=subscribe` e o token estiver correto. Um token incorreto recebe 403.
4. Assine o campo `messages` e confirme que o app está inscrito na WABA pretendida. Teste tanto mensagens recebidas quanto callbacks de envio/entrega/leitura.
5. Os POSTs exigem `X-Hub-Signature-256`, calculado sobre os bytes originais com App Secret. Não coloque um intermediário que reconstrua o JSON antes de encaminhar. Assinatura inválida recebe 401, JSON inválido recebe 400 e falha temporária ao persistir recebe 503 para permitir nova entrega.
6. O corpo é limitado a 1 MiB. O receptor ignora eventos de outro Phone Number ID. Para o número configurado, salva mensagens e eventos em lote e devolve 200 depois da persistência; o bot roda depois da resposta.

Referências oficiais: [webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components), [mensagens](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages), [mensagens interativas no SDK da Meta](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/interactive/). A consulta automatizada às páginas do portal de desenvolvedores encontrou limitação HTTP 429 nesta sessão; confirme os detalhes do painel e da versão escolhida antes da ativação.

## Rotina obrigatória da fila

O webhook usa `after` do Next.js para tentar processar a fila após responder. Configure também uma rotina externa, por exemplo a cada minuto, que faça GET ou POST para:

```text
https://SEU-DOMINIO/api/whatsapp/process
Authorization: Bearer SEU_WHATSAPP_WORKER_SECRET
```

O endpoint permite até 60 segundos; cada execução usa um orçamento de aproximadamente 40 segundos e lotes pequenos. Garanta que a plataforma de hospedagem permita esse tempo e a execução de `after`. Não coloque o segredo na URL. A rotina deve continuar ativa quando não há novos webhooks, para recuperar trabalho pendente.

O banco serializa o processamento por telefone com leases de dois minutos. A mesma mensagem de entrada não cria duas comandas: ID único, estado da conversa, criação de pedido e resposta pendente são protegidos no commit transacional. Entradas com falhas transitórias são retomadas até três tentativas; falhas persistentes pedem atendimento humano.

Uma falha de envio após chamar a Meta pode ter ocorrido depois da entrega. Por isso, uma saída com resultado incerto é marcada como falha, pausa o bot e exige conferência humana, sem reenvio automático. Confira o WhatsApp/registro no banco antes de retomar. Essa escolha evita duplicar uma mensagem cujo recebimento não pode ser determinado. Webhooks de entrega/leitura atualizam os registros de saída sem rebaixar uma leitura confirmada.

## Ativar e operar

1. Em `/admin/settings`, habilite WhatsApp e aceitar pedidos. Configure entrega/retirada, taxa, mínimo e estimativas. Para Local, habilite também o atendimento QR/NFC da mesa.
2. Envie uma mensagem para iniciar. O bot oferece Local/Retirada/Entrega conforme disponibilidade, além do link `/order`. Escolha categoria e produto nas listas. Listas têm até dez linhas totais, incluindo Ver mais; títulos e descrições são reduzidos dentro dos limites.
3. A quantidade oferece 1, 2, 3 e Outro como lista, pois quatro botões ultrapassariam o máximo de três. Também é possível digitar de 1 a 99. As observações têm até 200 caracteres e o carrinho até vinte linhas. Há resumo, edição por remoção/reinclusão, nome, endereço e pagamento ao receber.
4. Para Local, um deep link pode usar `https://wa.me/NUMERO-COM-DDI?text=MESA-TOKEN`, substituindo o número somente por dígitos e TOKEN pelo token real da mesa. Esse link pode ser codificado como QR alternativo. Tokens são revalidados dentro da transação e a rotação invalida os antigos.
5. Sem token, o cliente informa o número de uma mesa livre. O pedido sempre aguarda confirmação. Se já existir comanda, o bot solicita QR ou ajuda humana; saber apenas o número não autoriza acrescentar itens a uma conta existente. Com token válido, os itens podem entrar na comanda ativa conforme a regra compartilhada.
6. Novas comandas WhatsApp, inclusive Local, aguardam confirmação na central `/orders`. Uma comanda existente mantém sua origem/status. O garçom consulta; caixa/admin aceitam ou recusam. As notificações alcançam pedidos cuja origem da comanda é WhatsApp e que possuam o telefone correspondente.
7. Na entrega, o remetente identificado pelo webhook assinado pode escolher endereços salvos daquele telefone ou cadastrar um novo. Uma localização compartilhada é guardada como referência; rua, número, bairro, cidade, UF e CEP continuam necessários. Não há geocodificação externa.
8. O resumo mostra itens, observações, tipo/mesa, nome, pagamento, troco, endereço, taxa e total estimado. O banco confere preços, disponibilidade, taxa, mínimo e troco no envio. O cliente recebe número, estimativa e link secreto de acompanhamento.
9. `menu` reinicia, `cancelar` descarta o carrinho, `atendente` pausa o bot e abre um alerta, `parar`/`sair` interrompem mensagens automáticas. A próxima mensagem após duas horas de inatividade reinicia a conversa. Uma pausa humana só termina com liberação da equipe; `menu` não a remove.
10. Em `/orders`, caixa/admin veem atendimentos humanos e podem abrir o WhatsApp e liberar o bot após resolver o caso. Esses contatos limitados vêm de RPCs; as tabelas brutas continuam somente leitura para admin. Se houver opt-out, o cliente precisa enviar `menu` para voltar a pedir mesmo depois da liberação humana.

## Modelos de notificação

Cadastre os modelos abaixo no WhatsApp Manager com idioma `pt_BR`, categoria adequada ao uso transacional e exemplos válidos. Aguarde aprovação antes de depender deles. O código envia os parâmetros de corpo nesta ordem:

| Nome | Parâmetros de corpo | Exemplo de texto para cadastro |
| --- | --- | --- |
| `order_confirmed` | número, URL de acompanhamento | Seu pedido {{1}} foi confirmado. Acompanhe: {{2}} |
| `order_rejected` | número, motivo, URL | Seu pedido {{1}} não foi confirmado. Motivo: {{2}}. Detalhes: {{3}} |
| `order_ready` | número, URL | Seu pedido {{1}} está pronto. Confira o atendimento: {{2}} |
| `order_out_for_delivery` | número, URL | Seu pedido {{1}} saiu para entrega. Acompanhe: {{2}} |
| `order_completed` | número, URL | Seu pedido {{1}} foi concluído. Obrigado! Detalhes: {{2}} |

O quinto modelo cobre conclusão fora da janela. Dentro de 24 horas da última mensagem do cliente, as notificações usam texto; no limite de 24 horas ou depois, usam modelo aprovado. Eventos são enfileirados uma vez por pedido/evento. Opt-out ou pausa humana suspendem notificações automáticas. Falhas não desfazem a confirmação, despacho ou pagamento.

## Simular sem conta Meta

É necessário um Supabase configurado; o modo mock substitui a Meta, não o banco. Em `.env.local`, defina `WHATSAPP_MOCK=true` e um `WHATSAPP_WORKER_SECRET` de desenvolvimento. Habilite WhatsApp nas configurações e execute `npm run dev`. `npm run start` é produção e não permite o mock.

Exemplo PowerShell em outro terminal, com o mesmo segredo no ambiente desse terminal:

```powershell
$headers = @{ Authorization = "Bearer $env:WHATSAPP_WORKER_SECRET" }
$body = @{ phone = '+5511999999999'; message_id = 'dev-start-1'; text = 'menu' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/whatsapp/simulate -Headers $headers -ContentType application/json -Body $body
```

Leia `replies[].payload`. Para tocar em um botão/linha, envie seu `id` no próximo campo `text`, com outro `message_id`. Para repetir a entrega da mesma mensagem, reutilize o mesmo ID: a resposta indica `duplicate` e não há nova transição. Para localização, inclua `location = @{ latitude = -23.5; longitude = -46.6 }` e use `ConvertTo-Json -Depth 5`.

Sequência de retirada: `menu`, `pickup`, `category:UUID`, `product:UUID`, `2`, `skip`, `finish`, nome se solicitado, `pix`, `confirm`. Para entrega, escolha `delivery`, depois endereço salvo ou `new_address`, preencha os campos solicitados, selecione pagamento/troco e confirme. Para Local, use `dine_in` e uma mesa livre ou envie `MESA-TOKEN`. Use os IDs reais retornados pelo catálogo.

Saídas mock aparecem no console com `[WhatsApp mock]` e ficam no banco com `provider_id` iniciado por `mock:`. Aceite os pedidos na central e movimente-os na cozinha/caixa para conferir notificações. Se houver fila acumulada, chame a rotina autenticada de processamento. Nada é enviado à Meta no mock.

## Produção e dados pessoais

Antes de ativar com clientes, troque o número de teste pelo número comercial autorizado, conclua as verificações e requisitos de faturamento/limites da conta na Meta, use token e versão corretos, obtenha aprovação dos modelos, configure webhook e rotina de fila, publique com HTTPS e mantenha `WHATSAPP_MOCK=false`. Teste recebimento, confirmação, preparo, despacho, pagamento, pausa humana e opt-out com um número controlado.

O sistema guarda telefone, estado/carrinho, endereço necessário, mensagens recebidas simplificadas e respostas/eventos de envio. Não persiste o envelope completo da Meta nem os segredos. O mock imprime dados no console: use apenas dados de teste nele. Divulgue ao cliente o aviso de privacidade do restaurante e personalize a saudação em `messages.pt-BR.ts` com o endereço desse aviso. Defina responsáveis, acesso, retenção e descarte dos dados conforme a política do estabelecimento; não apague filas pendentes indiscriminadamente. O comando `parar` é a opção de interrupção das mensagens automáticas. Esta configuração não substitui a definição da política de privacidade do restaurante.
