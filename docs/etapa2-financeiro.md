# Etapa 2 — motor financeiro mensal da VECTO Consult-Casa

> A integração automática dos 11 grupos foi acrescentada em continuação desta etapa. O manual atual está em [orcamento-fluxo.md](orcamento-fluxo.md). As convenções do motor de dívida abaixo continuam válidas.

Implementação local na branch `feat/vecto-financial-budget`. Não é aprovação de crédito, CET oficial, proposta bancária ou comparação imobiliária validada. Não faz merge, push ou publicação.

## Escopo e arquitetura

- `simulation.js`: funções puras de cronograma de dívida, limites, fluxo de caixa, resumo anual e CSV; sem DOM, armazenamento ou dependências.
- `planner.js`: configuração persistida, validação e adaptação dos dados v2 ao motor. A mesma configuração pode ser exportada, importada e salva em cenários.
- `simulation-ui.js`: campos, eventos editáveis, tabelas mensais/anuais e downloads CSV.
- `model.js`: extensão aditiva de v2 com `planning`; mantém orçamento de 11 grupos, registros de gastos, chaves locais, importação privada, backups e cenários.
- `finance.js`: funções anteriores `loan`, `irrAnnual` e `consortium` preservadas. Não são usadas para apresentar as novas comparações como se completas estivessem.

Os quatro caminhos principais são: comprar apartamento atual e depois construir; construir pagando aluguel; comprar apartamento atual e depois trocar por maior; comprar diretamente apartamento maior. Os cartões apenas selecionam um objetivo, com aviso de comparação em preparação. Não inferem vendas, impostos, preços de troca, crédito futuro ou novos empréstimos. O motor é preparado para a etapa seguinte; a interface simula um contrato por vez. A API de caixa aceita múltiplos resultados de contratos e usa a última quitação como um dos determinantes do horizonte.

## Cronograma de dívida

`FinancialEngine.loanSchedule(options)` retorna `{ rows, totals, funding, upfrontDate, warnings }`. Entradas principais:

```js
const contrato = FinancialEngine.loanSchedule({
  principal: 300000, annualRate: 11, months: 420, system: 'SAC',
  firstDate: '2026-11-30', fundingDate: '2026-11-01',
  indexAnnual: 0, insuranceFixed: 50, insurancePercentMonthly: 0,
  fees: 25, upfront: 300,
  extraMode: 'term',
  extraPayments: [{ month: 12, amount: 10000 }]
});
```

Exemplo fictício, não taxa de mercado ou proposta. Taxas anuais são efetivas; a equivalente mensal é `(1 + anual/100)^(1/12) − 1`. Indexador anual é hipótese constante. Seguros podem combinar parte fixa e percentual mensal do saldo corrigido. Taxas fixas e seguros incidem em meses de saldo financiado positivo; outros encargos com janelas próprias podem ser cadastrados como encargos de obra.

Cada linha mostra mês contratual, número da parcela de amortização (zero na carência), data, fase, saldo inicial, liberação, correção, juros totais, juros capitalizados, amortização regular, seguros, taxas, outros encargos, prestação recorrente, extra, pagamento total e saldo final. Na carência, a interface mostra “—” em vez de número de parcela regular.

A data é calculada a partir do dia original: 31/janeiro passa para o último dia de fevereiro e volta a 31/março. Não usa fuso local nem contagem pro rata diária. Dias dentro de uma competência não geram diferença nos juros ou na disponibilidade do caixa.

### Ordem e conferência

1. Parte do saldo inicial e acrescenta a liberação do mês, se houver.
2. Aplica correção ao saldo disponível, inclusive à liberação do início do mês.
3. Calcula juros sobre o saldo corrigido.
4. Na carência, paga ou capitaliza os juros conforme a hipótese. Seguros, taxas e encargos não são capitalizados automaticamente.
5. Na amortização, calcula SAC ou Price, paga juros e amortização, depois aplica a extra limitada ao saldo restante.
6. Encerra quando a dívida é quitada; não cobra eventos extras agendados após a quitação e emite aviso.

Identidade de saldo, testada em cada mês:

```
saldo final = saldo inicial + liberação + correção + juros capitalizados
              − amortização regular − amortização extraordinária
prestação recorrente = amortização regular + juros pagos + seguros + taxas + outros encargos
pagamento total = prestação recorrente + amortização extraordinária
```

Valores e eventos são arredondados em centavos. Na Price, a prestação financeira fica constante sem correção ou extras que a recalculam; a última parcela absorve o resíduo acumulado de arredondamento. Em contratos longos, esse ajuste pode superar alguns centavos por efeito dos juros. O teste confere o limite de propagação dos arredondamentos, além de saldo zero e identidade de cada linha. Cálculos que excedem a precisão segura de centavos são rejeitados, sem exibir `Infinity` ou produzir CSV inválido.

### Extras

- `extraMode: "term"`: mantém a amortização SAC ou a prestação financeira Price vigente, ajustada pelo indexador quando houver; quita antes.
- `extraMode: "payment"`: recalcula a amortização/prestação sobre o saldo restante e os meses ainda previstos, mantendo a data contratual final salvo quitação total.

Extras são pagas depois da amortização regular do mês. Durante a carência, amortização extra não é suportada nesta hipótese; o sistema informa a restrição, em vez de presumir regra do banco. Tarifas de amortização, condições de FGTS ou regras específicas devem ser confirmadas e modeladas separadamente.

### Obra e liberações

```js
construction: {
  phaseMonths: 14,                  // obra de 12 meses + atraso de 2
  amortizationStartMonth: 15,       // relativo à primeira competência do contrato
  capitalizeInterest: false,
  draws: [{ month: 2, amount: 50000 }, { month: 5, amount: 70000 }],
  charges: [{ startMonth: 1, endMonth: 18, amount: 100 }]
}
```

Os eventos da configuração persistida também têm ID e descrição, para edição. O crédito solicitado é um teto: o motor soma apenas o que foi programado e avisa sobre parcela não liberada. Não cria uma liberação residual, nem supõe que o banco paga fornecedores junto com cada liberação. Liberações podem vir antes ou depois dos pagamentos de obra no fluxo.

Nesta hipótese, não há amortização regular durante a obra; ela começa em mês configurado após o prazo de obra com atraso. Pode existir carência adicional. Janelas de outros encargos são independentes e podem começar antes da primeira liberação e continuar após a obra, até a quitação do contrato. Valores fixos de encargo zero são permitidos. Sem nenhum crédito efetivamente liberado, não é simulado um contrato ativo: não há juros, prestações ou encargos iniciais cobrados automaticamente.

**Atraso não desloca silenciosamente eventos contratuais.** Ele prolonga a fase de obra e adia a mudança. O usuário deve revisar início da amortização, meses das liberações, pagamentos e janelas dos encargos. Se a amortização ficar dentro do período de obra, o cálculo é bloqueado com mensagem. A UI alerta quando a data de início do contrato não corresponde ao mês de início do projeto no fluxo.

Todas essas convenções precisam de proposta bancária para confirmação; instituições podem usar outras bases de seguros, indexação, carência, liberação e capitalização.

### Totais

`totals` apresenta crédito efetivamente liberado, juros totais/pagos/capitalizados, correção, amortização regular/extra, seguros, taxas, outros encargos, custos iniciais, desembolso nominal, custo acima do crédito liberado, quantidade de parcelas e saldo/data final.

- Desembolso nominal do financiamento: soma dos pagamentos efetivos + custos iniciais.
- Custo acima do crédito recebido: desembolso nominal menos liberações.
- Esse custo incorpora juros, atualização e encargos, mas não é preço do imóvel nem CET oficial.
- Não somar juros capitalizados novamente ao total das parcelas: já serão pagos como parte do saldo.

## Limites bancário, familiar e de caixa

A renda bruta familiar do módulo é independente das rendas individuais da Etapa 1. Na conversão de v2, recebe a soma inicial das rendas individuais; edições posteriores não a sincronizam automaticamente. Confirme a totalização.

```
teto bancário hipotético = renda bruta familiar × percentual / 100
limite de planejamento = mínimo(teto bancário, prestação confortável)
capacidade mensal = contribuição líquida − aluguel incremental + aluguel liberado
                    − despesas adicionais
capacidade após poupança mínima = máximo(0, capacidade mensal − poupança mínima)
limite recorrente sustentável = mínimo(limite de planejamento, capacidade após poupança mínima)
```

Com renda bruta R$ 14.000, percentual 30% e teto familiar R$ 2.800: teto bancário R$ 4.200, limite de planejamento R$ 2.800. A comparação usa **toda a prestação recorrente**, não apenas juros e amortização. Extras são saídas de caixa separadas e não reduzem o valor mostrado como prestação recorrente confortável.

O fluxo testa os limites por mês e o resumo alerta violações. A poupança mínima é uma meta de sobra, não uma despesa duplicada. Um saldo acumulado positivo não transforma uma prestação recorrente insustentável em sustentável. Tampouco um limite mensal adequado elimina uma insuficiência de caixa para entrada e obra. Nenhuma saída do motor é aprovação de crédito.

## Fluxo mensal

`FinancialEngine.cashFlow(options)` aceita múltiplos contratos calculados, eventos de compra/obra/despesas não financiadas, ajuda datada, recursos iniciais e apenas uma das bases:

- `mode: "savings"`: usa exclusivamente a poupança atual já líquida. Não soma a renda nem desconta despesas familiares de novo. Exemplo: R$ 3.000 de poupança líquida continuam R$ 3.000, mesmo que renda e despesas estejam preenchidas.
- `mode: "income"`: usa renda líquida menos despesas familiares. Ignora a rubrica de poupança atual para não repetir o aporte.

O patrimônio inicial é líquido da reserva somente se ela ainda não estava separada. Não entram como saldo inicial a poupança futura, a ajuda ainda não recebida, o valor de referência dos apartamentos ou o limite de crédito.

A ajuda entra no mês da data selecionada, somente se estiver incluída no cenário. Uma ajuda prometida continua não garantida. O sistema exige a data se há ajuda positiva selecionada; não antecipa o recebimento.

Se o aluguel já está na base de despesas/poupança, não é debitado de novo antes da mudança. Depois do mês final do aluguel, seu valor é liberado da base (`rentReleased`), sem tratá-lo como receita externa efetiva. Se o aluguel é adicional à base, é debitado apenas nos meses indicados e não há liberação fictícia posterior. No modo renda, aluguel marcado como incluído não pode exceder as despesas da base. Despesas adicionais devem representar apenas novos custos ainda não contemplados.

O fim do aluguel pode ser definido manualmente (inclusive sobreposição após mudança) ou, com zero, ser o mês anterior à mudança. A mudança é `mês de início do projeto + prazo de obra + atraso`. As fases são anterior ao projeto, obra/projeto e após mudança. São marcadores do fluxo, não atestados de avanço físico.

O horizonte é o maior entre a última prestação de todos os contratos, o último pagamento do projeto, a ajuda datada, a mudança, o fim do aluguel e o horizonte mínimo. Não há corte fixo em 2030. Limite técnico: 1.200 competências, com até 600 parcelas de amortização por contrato.

Identidade mensal:

```
caixa final = caixa inicial + contribuição líquida + ajuda recebida + crédito liberado
              − pagamentos do projeto − pagamentos da obra
              − prestações − amortizações extras − encargos iniciais
```

Os tipos `project`, `construction` e `nonFinanced` classificam eventos. Cada evento entra uma vez; classificar um pagamento como não financiado não cria uma segunda saída.

`additionalCapital` é o valor máximo para cobrir o menor saldo negativo mensal, sem juros ou custo de captação. Não é dinheiro automaticamente injetado; o fluxo bruto permanece negativo nos meses de falta. O saldo anual mostra também o menor caixa do ano para não ocultar déficit intermediário.

### Integração automática com o orçamento

Esta limitação foi corrigida: os 11 grupos geram pagamentos automaticamente, preservando fixados e realizados. Gastos vinculados substituem a previsão; pagamentos manuais antigos exigem classificação para não duplicar valores. Consulte [orcamento-fluxo.md](orcamento-fluxo.md) para as regras, a migração e a reconciliação atuais.

## Dados e compatibilidade

A versão do backup continua `2`. `planning.version` é `1`. A ausência de `planning` em backups v2 antigos gera configuração inicial a partir dos antigos `credit`, `annual`, `months`, `system`, `index`, `fee` e `upfront`, mantendo o restante do estado. As datas começam vazias e devem ser escolhidas; não se inventa um início de financiamento. Campos antigos continuam guardados, inclusive consórcio.

Snapshots v2 antigos recebem a mesma extensão. Cenários novos guardam as datas, eventos e limites; recuperar cenário mantém os gastos atuais, como na Etapa 1. Os backups completos continuam restaurando todo o estado. Importação privada continua local, sem rede ou analytics. Não foram incluídos dados de clientes, credenciais ou backups privados no repositório.

## Testes e revisão manual

```sh
npm test
node --check simulation.js
node --check planner.js
node --check simulation-ui.js
python tests/browser_smoke.py
```

O último comando requer Playwright/Chromium já disponíveis e não instala dependências. A suíte de navegador conserva os testes da Etapa 1 e acrescenta 420 meses, resumo anual com CSV integral, persistência de eventos, amortização extra e obra com falta de caixa.

Checklist com dados fictícios:

1. Em Premissas, patrimônio 100.000, reserva 20.000 já separada, poupança 3.000; não preencher nomes.
2. Em Cenários, renda bruta familiar 14.000, comprometimento 30%, prestação confortável 2.800. Confira teto bancário 4.200 e planejamento 2.800.
3. Escolha início do fluxo e primeira competência, por exemplo 01/11/2026; deixe ajuda desmarcada inicialmente. Contrato 300.000, 11% anuais, 420 meses, SAC; seguros 50 e taxas 25. Confira as 420 linhas e o saldo final zero. Repita com Price.
4. Troque para resumo anual, exporte cronograma: CSV deve manter 420 linhas de dados. Confira data final além de 2030 e a presença de todos os componentes.
5. Adicione extra de 10.000 no mês 12; compare reduzir prazo e reduzir prestação. Total de juros deve cair em relação à mesma hipótese sem extra.
6. Para obra, use 2 meses, atraso zero e amortização no mês 3. Programe liberações de 10.000 no mês 1 e 20.000 no mês 2, sem presumir liberação do restante do teto.
7. Programe pagamento de obra superior ao caixa no mês 1. Confira saldo negativo e capital adicional, mesmo se o crédito posterior tornar o saldo final positivo. Adicione encargo com janela que ultrapasse o fim da obra e confira a cobrança após a mudança.
8. Inclua ajuda de 5.000 com data no terceiro mês; confira zero nos dois anteriores. Desmarque e confira a diferença. Não compare usando ajuda como garantida.
9. Preencha renda e despesas junto com poupança 3.000. No modo poupança, confirme que a base continua 3.000. Alterne o modo de renda e confira a fórmula correspondente.
10. Teste aluguel incluído versus adicional e a liberação da base depois de seu fim, sem duplicidade.
11. Salve cenário, exporte/importa JSON e recupere backup anterior. Confira que orçamento e gastos da Etapa 1 não foram apagados.

Ainda não há comparação completa dos quatro caminhos, venda/troca de imóveis, custos tributários automáticos, aprovação bancária, múltiplos contratos editáveis na interface, séries históricas de indexadores, variações de renda e despesas mês a mês, análise intramensal, regra de seguros dependente de idade ou cálculo diário de CET. Esses limites estão identificados na interface/documentação; o motor fornece componentes para evoluir sem apresentar comparações parciais como resultados validados.
