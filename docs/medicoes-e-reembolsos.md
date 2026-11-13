# Datas, medições e dois caixas

Esta versão substitui a hipótese de liberações bancárias iguais. Sem medições cadastradas com conclusão prevista, não inventa reembolsos. As condições continuam hipóteses até confirmação do contrato e cronograma aprovado pelo banco.

## Roteiro de revisão

1. **Premissas:** confira patrimônio disponível na origem da simulação, reserva já separada, renda, despesas, poupança líquida e inclusão do aluguel. A poupança informada não se soma novamente à renda.
2. **Orçamento:** abra cada um dos 11 grupos. Escolha pagamento único ou durante um período, data inicial e duração. O cronograma profissional continua disponível no detalhe de conciliação, com pagamentos confirmados, pagos, fixados e vinculados protegidos.
3. **Subitens e fases:** cadastre nome, valor e **data prevista de pagamento**, independente da data da cotação. Na construção, informe início, duração em meses e conclusão. Se a conclusão estiver vazia, usa início + duração − um dia. Marque “incluído” para distribuir parte do valor-base; desmarque somente para despesas adicionais. Confira o valor-base não detalhado ou excedido e a conciliação dos pagamentos. O saldo sem subitens continua explicitamente programado no grupo.
4. **Financiamento:** classifique cada grupo como não financiável, potencialmente financiável ou parcialmente financiável. Subitens herdam a regra ou a substituem. Por prudência, somente a construção começa potencialmente elegível; os outros grupos começam não financiáveis. Uma fase não vira medição automaticamente: marque a opção, informe o valor da medição e confirme elegibilidade. Em Cenários, revise cobertura da parte elegível, limite solicitado e prazo padrão até recebimento (30 dias, editável). Cada item pode substituir o prazo padrão. Documentação, móveis, contingência etc. não recebem cobertura automática.
5. **Resultados:** confira custo total, elegibilidade, crédito solicitado, reembolsos programados, custo definitivo com recursos próprios e capital de giro adicional. A tabela de medições mostra conclusão, recebimento e valor. O aporte extraordinário pode ser ajustado independentemente do crédito, inclusive para antecipar pagamentos. Compare o aporte planejado com o necessário: o sistema não transfere patrimônio ilimitadamente. Abra o caixa da obra, verifique os meses negativos, a reutilização de reembolsos e o patrimônio pessoal. Revise a poupança mensal após encargos/prestações e a economia do aluguel após a mudança. Explicações dos cabeçalhos funcionam por mouse, clique, toque e teclado.

## Regras financeiras

- Elegibilidade: o subitem substitui o grupo, sem somar as duas coberturas. A parcela não detalhada usa a classificação do grupo.
- Reembolso do item: menor valor entre custo e medição × percentual elegível × cobertura da simulação. O conjunto nunca excede o crédito solicitado nem a parcela elegível coberta. Liberações são alocadas por ordem de recebimento; o restante do limite contratado não é inventado.
- Se os subitens excedem o orçamento do grupo, os reembolsos desse grupo ficam suspensos até conciliação. O excesso permanece visível, sem aumentar artificialmente o orçamento ou a base elegível.
- Recebimento: conclusão + prazo de aprovação/liberação em dias. Liberações após o período de obra deslocam o início da amortização, conservando o prazo total contratado; datas que não cabem no prazo exigem correção explícita. A mudança de moradia permanece na conclusão/regularização prevista.
- Caixa da obra: saldo anterior + aportes recebidos + reembolsos − fornecedores. O saldo do banco não é renda pessoal e permanece na obra para etapas seguintes.
- Caixa pessoal: saldo anterior + poupança-base ajustada + crédito/vendas de apartamentos − compras/custos de apartamentos − encargos/prestações/extras − transferências efetivas à obra. Cada transferência tem entrada e saída idênticas.
- Poupança principal: poupança-base ajustada ao aluguel e às mudanças de renda/despesas − todas as obrigações de financiamento do período. Compras de patrimônio e aportes extraordinários são separados. Resultados negativos permanecem visíveis.
- Capital de giro adicional: maior necessidade acumulada de pagamentos menos reembolsos, descontando recursos próprios definitivos. É uma necessidade temporária; não é outro custo de construção nem transferência automática.

## Preservação e limites

Backups continuam v2, com extensão aditiva nos grupos, subitens e perfis de financiamento. Não usamos cotação para inventar pagamento. Subitens antigos sem data recebem aviso; permanecem no orçamento e no saldo do grupo. Status “pago” do orçamento não inventa uma saída passada: confira o gasto ou pagamento já registrado. Gastos vinculados substituem previsões; gastos sem vínculo consomem o saldo programado. Cronogramas profissionais não são redistribuídos ao editar subitens: confira-os explicitamente para evitar sobreposição. Nunca alteramos automaticamente pagamentos protegidos.

Os saldos e juros são projetados por mês. A estimativa de capital de giro usa os dias conhecidos de pagamentos e reembolsos; na ausência de dia, considera início do mês por prudência. Ela alerta para antecipações dentro do mês, mas não equivale a extrato diário nem proposta contratual. CET global, datas e aceitação das medições precisam ser revistos com o banco.

Exporte um backup antes da revisão e teste importação em navegador separado. Revise gastos reais, cenários salvos, amortizações extraordinárias, SAC e Price até 420 meses, CSV e resumo anual.

A aplicação do logotipo e da paleta VECTO permanece pendente dos arquivos de imagem acessíveis no projeto; nenhuma marca foi redesenhada e nenhuma paleta oficial foi inferida. O rodapé “© VECTO Consultoria” está presente em todas as abas.

## Testes

`npm test` executa os testes de cálculo e persistência. Com Python Playwright e Chromium disponíveis:

```sh
python tests/browser_smoke.py
python tests/budget_browser.py
python tests/housing_browser.py
python tests/ledgers_browser.py
python tests/project_browser.py
```

Todos usam dados fictícios e contextos de navegador descartáveis.
