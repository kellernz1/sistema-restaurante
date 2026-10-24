# Idiomas da interface

O seletor **Idioma**, junto ao seletor de tema, oferece **Português (Brasil)** e
**Español** nas telas da equipe e dos clientes. Português é o padrão. A escolha
fica em um cookie por um ano neste navegador e vale também para a navegação,
recarregamento da página, títulos e impressão. Cada aparelho pode usar seu idioma.

A troca atualiza a interface sem recarregar o documento inteiro e preserva o
carrinho e os campos preenchidos. Os nomes, descrições, endereços e observações
cadastrados pelo restaurante ou pelos clientes são mantidos como foram escritos.
Moeda e regras de pagamento continuam nas configurações já utilizadas pelo sistema.
O idioma das conversas externas do bot do WhatsApp é independente desta preferência
da interface.

As traduções ficam em `src/lib/i18n/es.json`, usando o texto original em português
como chave. Componentes de cliente usam `useTranslation()`; componentes de servidor
usam `await getTranslation()`. O servidor lê o cookie de cada requisição, sem estado
global compartilhado entre clientes. Mensagens dinâmicas usam marcadores `{0}`,
`{1}`, etc., mantendo os valores interpolados.

Verificação: `npm run test:whatsapp` inclui os testes do catálogo; com a aplicação
iniciada, `PUBLIC_TEST_URL` habilita `tests/i18n-http.test.mjs` para validar idioma,
títulos, seletor e isolamento de visitantes via HTTP. O teste completo local também
executa essa suíte.

## Validação em 24/10/2026

- Lint e build de produção aprovados.
- 37 testes unitários aprovados, incluindo sete de localização.
- Três testes HTTP de idiomas aprovados.
- Cinco logins, ciclo de retirada e nove suítes SQL aprovados no ambiente local.
- As pendências da suíte geral foram corrigidas: os cenários de entrega agora
  criam cotações de teste válidas conforme a modalidade configurada e verificam a
  rejeição de cotação ausente ou destino diferente. O fixture de configurações
  contém os campos atuais e testa a exigência de origem na cobrança por distância.
  O smoke do WhatsApp valida o link do cardápio, o checkout web e o atendimento humano.
- Resultado final com `npm run test:external`: 37 testes unitários e 56 testes
  nativos/HTTP aprovados, nenhum ignorado, 12/12 verificações de integração e nove
  suítes SQL aprovadas. A integração de rota real retornou 335 metros e conferiu
  o cache, a taxa e o total nos pedidos público e do caixa.
