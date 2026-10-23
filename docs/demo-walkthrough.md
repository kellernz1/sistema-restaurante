# Roteiro de demonstração

Antes do teste, execute `npm run local:start` e depois `npm run local:info`. Use dois navegadores ou janelas anônimas para representar equipe e cliente.

## Credenciais

Senha inicial de todas as contas: `Demo@12345`.

| Perfil | E-mail | Destino após login |
| --- | --- | --- |
| Administrador | `admin@restaurante.local` | Administração |
| Garçom | `garcom@restaurante.local` | Mesas |
| Garçom 2 | `garcom2@restaurante.local` | Mesas |
| Cozinha | `cozinha@restaurante.local` | KDS da cozinha |
| Caixa | `caixa@restaurante.local` | Fechamento |

## Pedido por QR de mesa

1. Rode `npm run local:info` e abra no celular o link da Mesa 8, que já tem um pedido aguardando confirmação, ou escolha o QR de uma mesa livre em `/admin/tables/qr`.
2. Monte o carrinho e envie. A tela do cliente mostra que o pedido aguarda confirmação.
3. Entre como garçom e abra `/waiter`. Confira a solicitação “Chamar garçom” da Mesa 4 e marque-a como atendida.
4. Na Central de Pedidos, confirme o pedido da mesa. O cliente deve enxergar a alteração ao vivo.
5. Entre como cozinha. Na coluna pendente, avance cada item para “Em preparo” e depois “Pronto”. Ative o som após tocar na tela para testar o alerta.
6. Como garçom, entregue os itens. Solicite a conta pela tela do cliente ou use a Mesa 5, que já está em fechamento com tudo entregue.
7. Entre como caixa, confira quantidades e totais, escolha dinheiro, cartão ou Pix e feche a comanda. A mesa volta a ficar disponível.

A Mesa 3 começa com quatro itens distribuídos entre pendente, preparo, pronto e entregue, facilitando a inspeção simultânea das colunas.

## Retirada e entrega pela web

1. Em uma janela sem login, abra `/order`.
2. Escolha “Retirada”, adicione produtos, informe nome, telefone e pagamento e envie.
3. Como caixa ou administrador, abra `/orders`, aceite o pedido e observe os itens aparecerem na cozinha.
4. Mova os itens até “Pronto” e conclua a retirada na Central de Pedidos.
5. Repita escolhendo “Entrega”. Informe um endereço completo e, se usar dinheiro, um valor de troco maior que o total.
6. Na Central, aceite, prepare, marque como pronto, use “Saiu para entrega” e finalmente conclua com o pagamento.

Os dados demo já incluem retiradas em confirmação, preparo e pronta; uma entrega aguardando confirmação via WhatsApp e outra em rota com “troco para R$ 100”. Há também seis pedidos fechados em dias anteriores para testar histórico e totais.

## Simulador do WhatsApp

1. Abra `/dev/whatsapp` e mantenha o telefone de teste sugerido.
2. Envie `menu` e clique em “Local”, “Retirada” ou “Entrega”. Os botões e listas da conversa são clicáveis.
3. Escolha categoria, produto, quantidade, observação, dados do cliente e pagamento. Confirme no fim.
4. Abra `/orders` e confirme que o pedido foi criado aguardando confirmação.
5. Faça ao menos um pedido de cada tipo. Para “Local”, escolha uma mesa livre; com um token, também é possível enviar `MESA-TOKEN`, trocando TOKEN pelo valor exibido em `local:info`.
6. Envie `atendente`. A conversa pausa e aparece como atendimento humano na Central. Como caixa ou administrador, resolva e libere o bot.
7. Envie `parar` para testar a saída e `menu` para reativar.

## Configurações administrativas

1. Entre como administrador e abra `/admin/settings`.
2. Desative entrega, salve e atualize `/order`: a opção deve desaparecer.
3. Reative entrega e altere taxa, pedido mínimo e estimativas. Faça um pedido e confira a aplicação das regras no banco, sem confiar em valores enviados pelo navegador.
4. Teste também “Aceitar pedidos”, QR/NFC, confirmação obrigatória e WhatsApp. Ao terminar, restaure todos os canais usados pelo restaurante.
5. Abra `/admin/tables/qr`, confira o IP local nos links e use a visualização de impressão. Reimprima sempre que o IP ou um token de mesa mudar.

## Encerrar a demonstração

Para voltar ao estado demo original, use `npm run seed:clear-demo` e `npm run seed:demo`. Para iniciar a operação real, faça antes `npm run db:backup`, remova os dados demo, troque contas e senhas, cadastre o cardápio real e revise as configurações.
