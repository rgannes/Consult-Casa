# Correção 1 — finanças pessoais e caixa exclusivo da obra

Implementação na branch `feat/vecto-financial-budget`, sem push, merge ou publicação. Corrige a mistura entre recursos pessoais e caixa da construção; não acrescenta datas, classificações de financiabilidade, novas liberações ou regras de reembolso no orçamento.

## Separação

`cash-ledgers.js` recebe os fatos mensais já calculados em `housing.js` e produz dois fluxos conciliados:

**Finanças pessoais:** patrimônio inicial líquido da reserva quando aplicável, capacidade de poupança de Premissas (com aluguel já tratado uma vez), compras/vendas de apartamentos, crédito dos apartamentos, todos os encargos/prestações/quitações e transferências efetivas para a obra.

**Caixa da obra:** saldo anterior, aportes próprios recebidos, liberações/reembolsos da construção e pagamentos previstos a fornecedores/despesas relacionadas dos 11 grupos. Recursos bancários ficam neste caixa e não viram renda ou dinheiro pessoal disponível. A dívida da obra é uma coluna separada, não saldo de caixa.

O caixa da obra começa em zero, antes do primeiro aporte. Não foi criado um segundo patrimônio inicial. O valor já editável na construção, antes chamado entrada, agora aparece como **Aporte próprio planejado para a obra**. A mudança é de significado/registro dos movimentos, sem apagar ou alterar o valor salvo.

## Aportes finitos e limitação de disponibilidade

O plano é determinado pelos parâmetros já existentes:

1. Pagamentos da obra anteriores ao início da construção mantêm as competências cadastradas e formam aportes próprios planejados nesses meses.
2. O valor da entrada/aporte principal é planejado uma vez, no começo da construção.
3. Não há aportes automáticos acionados por saldo negativo, nem repetição automática posterior de parcelas de aporte que não puderam ser realizadas.

Antes de transferir, o motor considera capacidade mensal e movimentos pessoais daquele mês, incluindo encargos e prestações. A transferência é limitada ao dinheiro pessoal positivo restante. O valor não realizado é mostrado em aviso e no CSV. O aporte automático já existente permanece uma estimativa de disponibilidade; o novo fluxo pode mostrar que parte não cabe depois das prestações. Não se toma crédito adicional automaticamente para completar essa diferença.

Isso evita duas distorções: usar recursos bancários da obra para pagar dívidas pessoais e transferir patrimônio que a família não tem. As projeções podem continuar negativas para revelar insuficiência; isso **não significa** pagamento executado, limite de conta contratado ou captação automática.

## Conciliação mensal obrigatória

```
caixa pessoal antes do aporte = saldo pessoal anterior + capacidade líquida
  + crédito de apartamento + venda de apartamento
  − compras/custos pessoais de apartamento − encargos/prestações/quitações

aporte efetivo = mínimo(aporte planejado, máximo(0, caixa pessoal antes do aporte))
saldo pessoal final = caixa pessoal antes do aporte − aporte efetivo

saldo final da obra = saldo anterior da obra + aporte efetivo
  + liberação/reembolso bancário da obra − pagamentos de fornecedores/despesas da obra
```

A transferência sai de um lado e entra no outro com o mesmo valor, exatamente uma vez. A soma dos dois saldos elimina a transferência interna e fecha com todas as entradas/saídas externas. O motor calcula essa diferença em cada competência e rejeita o resultado se não for zero.

O saldo consolidado é apenas diagnóstico interno, não é apresentado como patrimônio pessoal disponível. Saldo bancário ocioso da obra não pode cobrir uma prestação pessoal automaticamente. Também não há devolução automática de sobra da obra para a família.

## Reutilização de liberações/reembolsos

O saldo da obra é carregado entre competências. Por exemplo, com 20 de aporte, 30 de liberação e 10 de pagamento, sobram 40 na obra. No mês seguinte, um pagamento de 35 usa essa sobra e deixa 5; não sai outra transferência de 35 da família. Um reembolso posterior entra na mesma conta e pode financiar as etapas seguintes.

As liberações progressivas e suas competências continuam seguindo a hipótese simplificada anterior. Não foram criadas condições de reembolso por item, índices de execução, nova elegibilidade bancária ou novos campos de datas. Os testes do módulo contábil incluem recebimentos em competências diferentes para provar o carregamento de saldo, sem alterar o modelo de liberações da interface.

## Insuficiência de caixa

Os dois fluxos têm déficits independentes:

- Primeiro mês insuficiente e maior déficit pessoal.
- Primeiro mês insuficiente e maior déficit da obra.
- Aportes planejados que não puderam ser transferidos.

Pode haver patrimônio pessoal positivo e obra negativa, porque a família não autorizou/programou outro aporte. Isso deve ser resolvido conscientemente ajustando o aporte ou outra hipótese, não com uma transferência ilimitada escondida. Pode haver obra positiva e pessoal negativo, porque recursos da obra não pagam automaticamente juros/prestações pessoais.

O maior déficit é a necessidade máxima naquele fluxo antes de qualquer solução externa. Não é um empréstimo contratado, não contém juros de captação e não garante viabilidade diária. Os saldos negativos continuam visíveis; o sistema não os zera por uma entrada fictícia.

## Interface e exportação

Nos caminhos de construção:

1. O resumo apresenta patrimônio **pessoal** e avisos de insuficiência separados.
2. As linhas principais mostram finanças pessoais: capacidade de poupança, aluguel já considerado, financiamentos, movimentos de apartamentos, transferência para obra, poupança possível e saldo pessoal.
3. A seção **Ver movimentação financeira da obra**, inicialmente recolhida, mostra saldo inicial, aporte recebido, liberação/reembolso, fornecedores, saldo exclusivo e dívida separada.

Não há novos campos técnicos. A entrada da construção foi reaproveitada como aporte planejado. Os controles de 12 meses, períodos anuais e cronograma integral permanecem, inclusive no caixa da obra. O resumo anual mantém o menor saldo do ano para não esconder um déficit passageiro.

O CSV completo possui colunas separadas para pessoal e obra. A transferência aparece como saída pessoal e entrada da obra, com rótulos explícitos; não deve ser somada como duas despesas. Dívida aparece em colunas próprias. Todas as parcelas, inclusive 420 meses, permanecem calculadas.

Nos caminhos sem construção, compra, venda, crédito, quitação e despesas dos apartamentos continuam no caixa pessoal. A seção da obra não aparece. No caminho comprar apartamento e depois construir, a venda segue no caixa pessoal e não vira aporte adicional automático à obra.

## Preservação de dados

Não houve mudança do esquema persistido, nem novos campos obrigatórios. Orçamento de 11 grupos, subitens, gastos, vínculos, fontes, parâmetros antigos e preferências de caminhos permanecem. `Housing.calculate` trabalha sobre cópias e não reescreve datas, grupos ou financiabilidade.

O reconciliador do orçamento continua substituindo previsões pelos gastos reais vinculados uma vez. Agora a saída resultante pertence à obra, não também às despesas pessoais. Importação/exportação v2, snapshots e backups mantêm o comportamento anterior. Nenhum dado real de cliente foi incluído.

## Verificação

```sh
npm test
python tests/browser_smoke.py
python tests/budget_browser.py
python tests/housing_browser.py
python tests/ledgers_browser.py
```

Os testes de navegador usam Playwright/Chromium já instalados, dados fictícios e perfis temporários; não há dependência nova no site.

Roteiro manual:

1. Escolha construir alugando. Em uma cópia de teste, use somente o grupo de construção em 120.000 e os demais grupos zerados; aporte 30.000, financiamento 90.000 e três meses de obra. Com distribuição igual, a obra recebe 30.000 do banco a cada mês e paga 40.000 por mês: saldos 20.000, 10.000 e zero. O aporte próprio é uma única saída pessoal de 30.000.
2. Confira que os encargos de obra e parcelas posteriores saem do pessoal. Os 40.000 mensais de fornecedores aparecem somente na seção da obra.
3. No cronograma manual já existente de Orçamento, use pagamentos de 90.000 no mês 1 e 30.000 no mês 3. A obra terá déficit de 30.000 no mês 1, mesmo se a família tiver dinheiro. Não deve surgir outro aporte automático.
4. Reduza o patrimônio pessoal para 5.000: o aporte planejado de 30.000 fica limitado ao disponível depois das obrigações pessoais, com aviso da parte não transferida.
5. Consulte os anos e exporte o CSV: compare transferência pessoal e aporte recebido, que devem ser iguais. Confira os dois saldos e os 420 meses, se configurados.
6. Alterne para comprar/trocar apartamento: a movimentação volta a ser apenas pessoal e a seção de obra desaparece. Exporte/importe um backup e confira orçamento e gastos preservados.

Limites mantidos: competências mensais, CET global hipotético, liberações simplificadas e ausência de regras novas de datas ou financiabilidade. Esta correção não implementa otimização automática de aportes, devolução de sobras, captação para cobrir déficits ou um novo contrato bancário.
