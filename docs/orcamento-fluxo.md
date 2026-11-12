# Integração automática do orçamento ao fluxo de caixa

Continuação local das Etapas 1 e 2 na branch `feat/vecto-financial-budget`. Os valores continuam hipóteses, não cotações ou curvas técnicas verificadas. Nenhuma publicação é feita automaticamente.

## O que mudou

Os 11 grupos agora geram cronogramas financeiros automaticamente. `budget-schedule.js` centraliza o cálculo do orçamento e a programação; `model.js` e `planner.js` usam a mesma fonte de valores. O contrato continua em `simulation.js`, separado dos pagamentos a fornecedores. `budget-schedule-ui.js` permite editar e reconciliar os cronogramas.

A interface apresenta três conjuntos distintos:

1. Orçamento dos 11 grupos e sua reconciliação com pagamentos programados/realizados.
2. Valores pagos e futuros do projeto, além dos registros de gastos reais.
3. Caixa disponível por competência, liberações de crédito, prestações e necessidade de capital adicional.

Crédito liberado é entrada de financiamento, não renda, lucro ou aumento líquido de patrimônio. O empréstimo não paga fornecedores automaticamente: a saída vem do cronograma do orçamento. Juros, amortizações, seguros e taxas modelados no contrato entram apenas pelo contrato.

## Regras automáticas provisórias

| Grupo | Regra inicial |
|---|---|
| Terreno | Único no mês da aquisição |
| Documentação e impostos | Único no mês da aquisição |
| Estudos preliminares | Único no início da construção |
| Projetos arquitetônicos e complementares | Único no início da construção |
| Regularizações e licenças | Único no início da construção |
| Preparação do terreno | Único no início da construção |
| Construção da residência | Igual mensalmente durante prazo + atraso |
| Áreas externas | Igual mensalmente durante prazo + atraso |
| Mobiliário e eletrodomésticos | Único no mês da mudança |
| Despesas de conclusão | Único no mês da mudança |
| Contingência da obra | Provisão igual mensalmente durante prazo + atraso |

Estas regras **não descrevem a ordem técnica recomendada** nem a evolução física da obra. Agrupar estudos e licenças na competência inicial é apenas uma convenção financeira inicial: ajuste para as datas reais de projeto, aprovação e contratação. Não há percentuais técnicos presumidos de fundação, estrutura ou acabamento.

Os valores monetários dos grupos são arredondados em centavos antes da programação. A distribuição divide o saldo em centavos e distribui o resto de um centavo entre as primeiras competências; a soma fecha com o grupo. Valores zero não criam saídas fictícias.

O mês da aquisição fica em `budgetSchedule.landMonth`. Início e duração da construção continuam em `planning.projectStartMonth` e `constructionMonths`; `constructionDelay` aumenta o período automático. Os campos em meses são relativos ao início do fluxo.

A data `budgetSchedule.moveDate`, se preenchida, prevalece para móveis, conclusão, fases e fim automático do aluguel. Se vazia, a mudança é calculada após início + duração + atraso. Uma data explícita anterior ao fim previsto da obra gera aviso, sem alterar silenciosamente a escolha do usuário. Não há validação de possibilidade técnica de ocupação.

Liberações e encargos do banco continuam em meses relativos à primeira competência do contrato. Não são deslocados automaticamente com o orçamento ou o atraso: revise-os conforme a proposta bancária.

## Edição por grupo e cronogramas dos profissionais

Abra **Cenários → Orçamento integrado: cronogramas dos 11 grupos e reconciliação**.

Cada grupo permite:

- Pagamento único automático.
- Distribuição mensal igual automática.
- Cronograma manual/profissional.
- Meses derivados das regras iniciais ou janela própria (início e quantidade de meses).
- Fonte/observações sobre o cronograma.
- Edição explícita, adição, exclusão, confirmação e fixação das linhas.

Alterar mês ou valor de uma linha manualmente converte o grupo para manual, preservando o restante. O modo manual permite representar marcos, contratos e valores diferentes por mês sem os reajustar automaticamente. Para substituir a distribuição inicial, escolha manual e edite/exclua as linhas livres, ou acrescente linhas reais. Use a fonte para registrar de onde veio a programação, sem dados pessoais no repositório.

Importação JSON completa e configuração privada continuam disponíveis. Uma configuração pode conter `budgetSchedule` com os 11 grupos completos; não há importação automática de PDFs de profissionais ou interpretação de propostas. O CSV do cronograma serve para conferência/exportação, não para importação de cronogramas.

Trocar um grupo manual de volta para automático mantém as linhas existentes fixadas, em vez de apagá-las: apenas eventual diferença positiva é programada em competências livres. Para descartar uma linha livre, faça a exclusão explícita. Não há um botão que apague silenciosamente todos os contratos.

## O que fica protegido

Uma linha fica protegida contra atualização automática quando:

- Está confirmada/contratada.
- Está marcada como paga.
- Está explicitamente fixada.
- Tem gasto vinculado.
- Pertence a grupo em modo manual.

Atualizar valor do orçamento, área, custo por m² ou prazo não muda valor/mês dessas linhas. O novo saldo do grupo é redistribuído apenas entre competências automáticas livres. Não se usa uma competência já ocupada por linha protegida para inventar outro pagamento automático no mesmo mês. Se não houver competências livres, o valor fica **não distribuído** e é sinalizado.

Para corrigir uma linha confirmada, paga ou fixada, use **Reabrir / desfixar**, com confirmação; o grupo passa para manual. Se houver gastos vinculados, corrija/desvincule os gastos antes de reabrir. A intenção é distinguir correção explícita do usuário de um recálculo silencioso. Operações de edição do cronograma mantêm backup local anterior.

A situação paga no cronograma é **pago declarado**, não comprovação bancária e não cria automaticamente um registro em Gastos reais. O relatório informa essa convenção. Confirmar/contratar não significa pagamento realizado.

## Vínculos com gastos reais

Em **Gastos reais**, escolha o pagamento previsto correspondente, no mesmo grupo. É possível vincular um gasto novo ou usar o seletor em registros existentes. Vários gastos parciais podem apontar para o mesmo pagamento. A situação de um registro pode ser atualizada de “A pagar” para “Pago”, sem criar outro gasto.

Para cada pagamento:

```
valor vinculado = soma dos gastos vinculados pagos e a pagar
residual previsto = máximo(0, previsão original − valor vinculado)
programado/realizado = valor vinculado + residual previsto
pago = gastos pagos vinculados + residual declarado pago, quando aplicável
futuro = programado/realizado − pago
```

O fluxo usa cada registro vinculado uma vez, na sua data, e apenas o residual no mês previsto. Se os gastos ultrapassam a previsão, a diferença real entra uma vez e gera aviso; o saldo automático ainda livre do grupo é reduzido. A previsão original protegida permanece guardada para comparação.

Gastos sem vínculo consomem o saldo automático do seu grupo. Não se soma o grupo completo mais o gasto: o automático gera apenas o saldo restante. Para um grupo manual/fixado, divergências permanecem visíveis, pois não se pode presumir que um contrato possa ser reduzido. Vincular corretamente é a forma mais precisa de preservar a distribuição por marcos.

Gastos com tratamento **Já incluído no contrato de financiamento** permanecem registrados, mas não criam outra saída nem consomem o orçamento de fornecedores. Esse tratamento é uma declaração do usuário, não conciliação com extrato bancário. Não inclua juros/amortizações dentro de propostas globais de fornecedores e também no contrato sem revisar as inclusões; duplicidades semânticas entre propostas não são identificadas automaticamente.

## Pagamentos anteriores à origem do fluxo

O patrimônio inicial deve representar o dinheiro disponível **na data de início** do fluxo. Um gasto pago com data anterior já está refletido nesse saldo: integra o orçamento/realizado, mas não é debitado de novo. Compromissos ainda não pagos vencidos antes da origem são considerados no mês 1, com aviso.

Gasto antigo sem data é preservado: usa a competência da previsão vinculada ou o mês 1, com aviso para revisão. IDs de gastos duplicados ou datas fora do intervalo suportado são conservados para correção e bloqueiam o cálculo de caixa, em vez de exibir resultado confiável indevido. Um vínculo que deixou de existir após recuperar um cenário é sinalizado; o gasto continua contado uma vez no seu grupo.

## Pagamentos manuais da Etapa 2

`planning.projectPayments` permanece intacto. Como esses eventos não tinham grupo, não é possível inferir se repetem custos dos 11 grupos ou são adicionais. Cada um precisa ser classificado:

- Um dos 11 grupos: é tratado como compromisso protegido e consome o saldo daquele grupo.
- Adicional fora do orçamento: entra no caixa separadamente e aparece como adicional.
- Já incluído no contrato: não cria outra saída, evitando duplicação de prestações/encargos.

Enquanto houver eventos não classificados, o cronograma/reconciliação é visível, mas o fluxo é bloqueado com instrução de revisão. Nenhum registro é apagado. Esses pagamentos também podem receber gastos vinculados, pelo identificador `legacy:ID-do-evento` mostrado no seletor.

O editor manual da Etapa 2 é preservado para adicionais e eventos legados. Para substituir um cronograma de fornecedor, prefira o grupo manual integrado, que já identifica o grupo e as proteções.

## Reconciliação e avisos

Para cada grupo:

```
diferença = orçamento − pagamentos programados/realizados
```

Diferença positiva indica valor não distribuído; negativa indica excesso. Gastos vinculados substituem a previsão; não são adicionados uma segunda vez ao denominador. A interface mostra orçamento, programado/realizado, pago, futuro e diferença para os 11 grupos.

Linhas de mesmo grupo, mês, valor e descrição geram aviso de possível duplicidade, sem exclusão automática: duas parcelas iguais podem ser legítimas. IDs de pagamentos repetidos são rejeitados na importação/validação. Vínculos ausentes ou entre grupos incompatíveis exigem revisão. Não há reconhecimento automático de documentos, identidade de fornecedor ou semelhança textual de notas.

O caixa mantém seus totais próprios, com prestações, liberações, entradas e pagamentos nas competências. O primeiro mês negativo e o máximo déficit continuam calculados no motor mensal, até a última obrigação/evento, mesmo quando o saldo final é positivo. A necessidade adicional não é financiamento automaticamente captado e não contém custo de captação.

A contingência programada é uma reserva conservadora de desembolsos possíveis, não dinheiro já gasto. A escolha permite reconciliar os 11 grupos integralmente, mas pode antecipar necessidade de caixa; ajuste-a com revisão dos riscos, preservando a reserva familiar separada.

## Compatibilidade, cenários e privacidade

O backup permanece v2. A extensão `budgetSchedule.version` é 1. Arquivos antigos recebem regras iniciais, preservando valores, metadados, gastos, configuração de financiamento e snapshots. A existência de pagamentos manuais antigos exige classificação, não descarte.

Recuperar um cenário mantém gastos atuais, como antes, e também preserva pagamentos atuais protegidos e eventos manuais classificados. Se divergirem do orçamento recuperado, é mostrado o saldo não distribuído/excesso. Restaurar um backup completo continua sendo uma substituição explícita de toda a versão, incluindo gastos, após confirmação e backup local anterior.

Nenhum dado real de cliente foi acrescentado ao código. Exportações e configurações privadas continuam locais; não há analytics ou envio de dados. Não publicar esses arquivos no GitHub. Exportar backup regularmente: o armazenamento local pode ser apagado pelo navegador.

## Verificação

```sh
npm test
python tests/browser_smoke.py
python tests/budget_browser.py
```

Os testes de navegador usam Playwright/Chromium já instalados, perfis temporários e dados fictícios. Não são dependências do site.

Roteiro manual com dados fictícios:

1. Escolha datas do fluxo/contrato. Abra a reconciliação e confira 11 grupos, total intermediário R$ 1.539.500 e diferenças zero.
2. Em orçamento global, altere construção de 750.000 para 900.000. Confira aumento de 150.000 na programação e redução correspondente no caixa final, mantidas as demais hipóteses.
3. Configure aquisição no mês 2, início no mês 3, duração de 6 meses e atraso de 2. Confira parcelas automáticas nos meses 3–10 e mudança automática no mês 11.
4. Confirme/fixe uma parcela antes de mudar valor ou prazo. Confira preservação de seu mês/valor e redistribuição apenas do saldo livre.
5. Coloque um grupo em manual, informe as parcelas do profissional e fonte. Aumente o orçamento: o manual não muda; surge diferença não distribuída.
6. Vincule um gasto parcial a uma previsão. Confira o residual, pago e futuro; acrescente o complemento e confira que não aparece outra saída integral.
7. Programe fornecedor antes da liberação bancária e verifique o primeiro déficit e capital de giro, mesmo se o saldo final estiver positivo.
8. Teste exportação/importação, backup anterior e recuperação de cenário com gastos/pagamentos confirmados posteriores.
9. Se havia pagamentos manuais da Etapa 2, classifique-os e confira a reconciliação antes de usar o caixa.

Limites: distribuição uniforme provisória, não curva técnica; datas mensais, não análise intramensal; cronogramas bancários independentes; duplicidades semânticas exigem revisão; contingência provisionada como possível saída; um contrato editável na interface; comparações imobiliárias completas continuam em preparação. Nada altera a `main` ou publica o site automaticamente.
