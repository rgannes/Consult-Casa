# Cenários de moradia — VECTO Consult-Casa

Reformulação da experiência de Cenários, na branch de trabalho. Sem push, merge ou publicação automática. As abas Premissas, Orçamento e Gastos reais, os backups e os motores anteriores permanecem preservados.

## Escolhas de implementação

Antes de alterar, foram identificados os componentes reutilizáveis:

- `simulation.js`: SAC/Price completo, taxa anual efetiva, arredondamentos, juros e amortização extras. Foi reutilizado sem alterar a API.
- `budget-schedule.js`: orçamento único dos 11 grupos, pagamentos automáticos/protegidos e substituição por gastos reais vinculados.
- `model.js`: validação v2, armazenamento local, cenários, migração, importação privada e backup anterior.

O orquestrador técnico antigo (`planner.js`) não foi adaptado para fingir quatro comparações: permanece com sua API e configuração antigas. A antiga tela `simulation-ui.js` não é mais carregada na página principal. Não se trata apenas de recolher seus campos: o novo `housing.js` calcula compras, vendas, duas dívidas e um caixa compartilhado sob convenções simplificadas; `housing-ui.js` apresenta uma alternativa por vez.

Os cronogramas já cadastrados foram movidos para um detalhe opcional de Orçamento. Isso mantém a possibilidade de revisar dados antigos sem transformar Cenários em gestão de obra.

## Como usar

1. Preencha referências dos apartamentos, renda, despesas, patrimônio e reserva em Premissas. O percentual bancário, teto confortável e aluguel ficam ali também, sem repetição em Cenários.
2. Escolha um dos quatro caminhos e o mês inicial. Preços vêm das referências dos apartamentos ou dos 11 grupos.
3. Ajuste entrada, crédito, prazo, CET hipotético e SAC/Price. Na construção, informe apenas o tempo até conclusão e regularização. Em duas etapas, escolha quando começa a segunda.
4. Se houver compra/venda, confira custos de transação e valor de venda no detalhe próprio. Zero não é cotação nem garantia de isenção.
5. Leia o resumo e as linhas do tempo. Começam com 12 meses, com navegação, anos e cronograma completo. O CSV sempre contém todos os meses da família, não apenas os visíveis.

Cada etapa tem sua linha. Pagamentos e dívida nela são específicos daquela etapa; a poupança, retiradas e saldo financeiro pertencem à **família inteira**, já considerando todas as obrigações. Não somar o saldo de duas tabelas. Nenhum patrimônio é reiniciado na segunda etapa.

## Quatro caminhos efetivos

### Comprar o apartamento atual e depois construir

Compra no mês 1, com entrada e crédito próprios. O mês escolhido inicia a construção. Sem venda, o financiamento do apartamento continua; a obra e a amortização da casa podem se sobrepor à primeira dívida. O resumo mostra a maior soma de prestações e emite aviso sobre simultaneidade.

A venda do primeiro apartamento é opcional. Por padrão ocorre na mudança, mas o mês pode ser alterado. O preço vem da referência do apartamento atual, editável para a venda, sem valorização presumida. A venda quita o saldo e deixa os recursos líquidos no mesmo caixa. Se a venda ocorre antes da casa pronta, o modelo retoma aluguel até a mudança, em vez de supor moradia gratuita.

### Construir enquanto continuam alugando

O terreno e a casa vêm do orçamento. Pagamentos automáticos são adaptados ao início e tempo de obra escolhidos; os cronogramas manuais/fixados, confirmados, pagos e vínculos com gastos são respeitados. Liberações do crédito são uniformes apenas como aproximação. O aluguel segue até o mês anterior à conclusão/regularização.

### Comprar o atual, vender e comprar um maior

Compra inicial e parcelas até a segunda etapa. No mês da troca, paga-se a parcela corrente do primeiro financiamento e quita-se o saldo que resta. A venda bruta entra uma vez; os custos de venda e a quitação saem uma vez. A compra do maior usa o mesmo caixa, inclusive recursos líquidos da venda e aportes acumulados. O primeiro empréstimo não é presumido quitado antecipadamente sem essa operação.

### Comprar o maior diretamente

Usa a referência do apartamento maior, entrada, custos de compra e crédito. O aluguel atual deixa de ser cobrado após a aquisição, sob a hipótese de ocupação no mês da compra. Não adiciona o orçamento de uma casa que não será construída neste caminho.

## Entrada, crédito e caixa

Campos nulos no arquivo representam entrada/crédito automáticos. A entrada automática usa o caixa disponível na competência da compra/início, descontando os custos de compra conhecidos; na segunda etapa, considera as obrigações e aportes anteriores e somente vendas já ocorridas. Não usa novamente o patrimônio inicial nem antecipa venda futura.

O financiamento automático é custo elegível menos entrada. Ajustar a entrada recalcula o crédito; ajustar o crédito recalcula a entrada efetiva. Não se somam uma entrada e um crédito que já cubram o mesmo preço duas vezes. O crédito não pode superar o custo da etapa.

A entrada definida manualmente pode superar o caixa: nesse caso o déficit aparece, em vez de reduzir a escolha silenciosamente. A entrada não pode superar o preço/custo elegível. No fluxo, a compra integral e a liberação do financiamento aparecem separadas; o efeito líquido é a parcela de recursos próprios.

Para construção, gastos pagos antes da origem já estão no patrimônio líquido informado: o custo do projeto continua incluindo-os, mas não são debitados nem financiados novamente. Pagamentos reais/protegidos antes do começo da construção permanecem nas suas competências; o crédito simplificado cobre somente despesas a partir do início da construção. Diferenças do orçamento e valores adicionais são sinalizados pelo reconciliador existente.

## CET global e prazo

O campo é **CET anual estimado**, uma taxa global hipotética para simulação. Em duas operações, cada financiamento tem sua taxa global. Não é CET oficial, nem reconstrução dos componentes de uma proposta. O valor inicial reaproveita a antiga hipótese anual disponível, sem certificar que seja o CET de uma instituição.

Conversão: `mensal = (1 + CET anual/100)^(1/12) − 1`. O motor calcula uma decomposição teórica entre custo financeiro e amortização. Seguros, taxas fixas, custos iniciais de crédito e indexadores antigos não são acrescentados, pois nesta convenção o CET representa globalmente o crédito. Custos de compra/venda externos ao crédito devem ser informados separadamente; se uma oferta já os inclui, revise antes de somar.

Na compra de apartamento, o crédito é recebido na competência da compra e a primeira parcela ocorre no mês seguinte. O prazo é a quantidade de parcelas. Em construção, o prazo é **total e já inclui obra/regularização**. Exemplo: 420 meses com 24 de obra resultam em 24 competências de encargos e 396 prestações completas, nunca 444 meses.

O prazo total deve ser maior que o prazo de obra quando há crédito. O desembolso do crédito é dividido igualmente, em centavos, pelos meses de obra. A aproximação cobra a taxa global mensal sobre o saldo acumulado liberado; não amortiza principal na obra. Depois inicia SAC/Price. Não é curva física, regra de medição ou cálculo exato de seguros/juros de obra de uma instituição.

Extras continuam com redução de prazo ou prestação. Para apartamento, o momento é o número da parcela; para construção, o mês do financiamento inclui a obra, devendo a extra ocorrer após ela. Extra acima do saldo é limitada pelo motor; eventos após quitação não são cobrados. A última parcela absorve arredondamentos, como no motor anterior.

## Poupança, despesas e aluguel: uma regra

A poupança declarada **não se soma à renda**. Ao iniciar/migrar o modelo, é registrada uma referência de renda, despesas e poupança. A parte do saldo renda menos despesas que não foi declarada como poupança é mantida como comprometida com outras necessidades, sem criar novo campo.

```
outros compromissos de referência = máximo(0, renda de referência − despesas de referência − poupança declarada)
capacidade atual = renda atual − despesas atuais − outros compromissos de referência
```

Se a poupança declarada era maior que a renda menos despesas, a capacidade fica limitada ao saldo conciliável e há aviso. Se renda ou despesas mudam, a capacidade muda na mesma diferença. Se a família edita a própria poupança, isso cria nova referência com renda/despesas daquele momento. Valores originais de Premissas não são sobrescritos.

Exemplo: renda 14 mil, despesas 8 mil e poupança 3 mil implicam 3 mil de outras necessidades. Ao aumentar as despesas para 9 mil, a capacidade passa a 2 mil, sem pedir outra base em Cenários e sem subtrair despesas duas vezes.

Aluguel incluído nas despesas não é debitado novamente; ao deixar o aluguel, seu valor é liberado na capacidade. Aluguel não incluído é debitado enquanto houver locação e não gera crédito fictício posterior. Se o aluguel marcado como incluído exceder as despesas totais, há aviso e a liberação fica limitada às despesas informadas.

Capacidade mensal, poupança possível e saldo acumulado são distintos:

- Capacidade: contribuição familiar líquida antes das novas obrigações de moradia.
- Poupança possível no mês: saldo positivo depois de compras/obra e financiamento, sem contar crédito recebido ou venda de patrimônio como poupança.
- Retirada de patrimônio: redução do caixa familiar após entradas e saídas daquela competência.
- Sobra mensal no resumo: capacidade após prestações na chegada à moradia desejada, antes de compras pontuais; pode mudar depois, como mostram as linhas.
- Saldo financeiro: dinheiro acumulado; não soma valor dos imóveis nem limite de crédito.

Os limites usam a soma das rendas brutas individuais e o percentual de Premissas, comparada ao teto confortável ali informado. São hipóteses de planejamento, não aprovação. Amortizações extras e quitação de venda são saídas de caixa, não novas prestações recorrentes para comparar com o teto bancário.

## Ajuda e reserva

No novo modelo, ajuda ativada entra no patrimônio inicial, sem data: 120 mil disponíveis + 300 mil de ajuda = 420 mil. A reserva de 20 mil já fora dos 120 mil não é descontada de novo. Se ainda estiver dentro, é subtraída uma vez.

A ajuda continua condicional, com aviso permanente. Essa convenção altera deliberadamente a regra de ajuda datada do motor técnico anterior, que permanece preservado no código/configuração para compatibilidade, mas não é a regra da nova aba.

## Venda, total desembolsado e consistência

A venda é simulada na competência escolhida, após a parcela do primeiro financiamento. A quitação usa seu saldo final daquela parcela, sem adicionar novamente o principal original. Não há multa, imposto automático ou contagem diária; custos de venda são editáveis e precisam ser estimados pelo usuário.

```
recursos líquidos da venda = venda bruta − custos da venda − quitação do saldo
caixa final mensal = caixa inicial mensal + capacidade + crédito recebido + venda bruta
                    − compras/obra/custos − pagamentos de financiamentos e quitações
```

A venda bruta entra uma vez; o fluxo mostra quitação e custos uma vez, em vez de somar recursos líquidos e também brutos. O saldo não é reiniciado na troca.

O custo do projeto/imóveis é separado do total desembolsado. Em duas etapas, soma os imóveis/projetos adquiridos. O desembolso projetado inclui compras/obra, custos informados, custo global de financiamento e aluguel. O principal é eliminado da dupla contagem pela dedução do crédito efetivamente recebido. Com venda, o resumo também apresenta a necessidade líquida após descontar sua receita bruta, sem apagar as aquisições intermediárias.

Os dados de gastos e orçamento de construção são usados nos caminhos que constroem; não se aplicam automaticamente a uma compra de apartamento. Não há inflação aplicada automaticamente aos preços: o campo de estresse permanece disponível em Orçamento para revisão dos custos. Não há rentabilidade do caixa, impostos automáticos, nova renda presumida ou ocupação parcial de obra. A contagem é mensal e não prova liquidez em cada dia.

## Compatibilidade e revisão

O backup continua v2. `housing.version = 1` é uma extensão; ela contém preferências independentes para cada caminho e referência da capacidade de poupança. Os módulos `planning`, `budgetSchedule`, grupos, gastos, backups e snapshots existentes permanecem. O novo modelo não apaga a configuração de seguros, encargos, ajuda datada ou liberações anterior; ela apenas não é usada como outra cobrança sobre o CET global.

Recuperação de cenário mantém os gastos e pagamentos protegidos atuais, como antes, e recupera as preferências dos caminhos daquele cenário. Arquivos antigos recebem defaults sem descartar dados. Configurações privadas e arquivos exportados continuam privados, sem analytics ou envio a serviços externos.

Verificação automatizada:

```sh
npm test
python tests/browser_smoke.py
python tests/budget_browser.py
python tests/housing_browser.py
```

As verificações de navegador exigem Playwright/Chromium já instalados, não dependências do site. Testam dados fictícios e perfis temporários.

Revisão curta:

1. Em Premissas, cadastre preços dos apartamentos, renda/despesas, poupança, reserva, aluguel e limites.
2. Em Cenários, alterne os quatro caminhos. Deve aparecer somente a simulação escolhida, com uma ou duas linhas do tempo.
3. Configure 420 meses e teste SAC/Price. Consulte 12 meses, os próximos, anos e tudo; exporte CSV completo.
4. Em construção, altere o tempo de obra: a mudança e a transição para prestação completa devem mudar, sem acrescentar meses ao prazo total.
5. Teste comprar e construir sem venda: as duas parcelas devem aparecer juntas no resumo/caixa. Teste vender e trocar: confirme venda, despesas, quitação e entrada da etapa 2.
6. Ative/desative ajuda e aumente despesas em Premissas. A reserva já separada não pode ser descontada outra vez; a poupança deve ajustar sem duplicação.
7. Teste uma extra, salve cenário, exporte/importa JSON e confirme preservação de gastos e orçamento.

Esta versão é uma ferramenta de planejamento familiar. Propostas bancárias, elegibilidade de crédito, custos de transação e viabilidade técnica continuam exigindo confirmação antes de decisões reais.
