/* Ajuda de leitura das tabelas. Não calcula nem grava valores financeiros. */
(function (root) {
  'use strict';
  const descriptions = {
    'Mês/ano': [
      'Mês da simulação, contado a partir da data escolhida em “Começar a simulação em”. A linha reúne os movimentos daquele mês; não é um extrato diário.',
      'Ano civil dos meses desta etapa. O primeiro e o último ano podem conter apenas parte dos meses. Movimentos são somados; saldos finais e mínimos seguem as regras explicadas em cada coluna.'
    ],
    'Momento': [
      'Situação desta etapa no mês: compra, preparação, obra, mudança, pagamento ou quitação. Usa o início da etapa, a conclusão prevista, a eventual venda e a dívida ainda existente. As duas etapas usam o mesmo caixa pessoal.',
      '“Resumo anual” identifica o agrupamento dos meses desta etapa naquele ano. Não é uma soma nem uma nova fase da obra; as situações de cada mês continuam no cronograma completo.'
    ],
    'Aluguel (já considerado)': [
      'Aluguel de Premissas nos meses em que a família continua alugando, conforme a mudança e eventual venda do apartamento. Se já está nas despesas familiares, não é descontado outra vez; quando termina, a economia aumenta a poupança-base. Nesse caso, o valor é limitado às despesas familiares informadas. Se não está incluído, é subtraído da poupança-base enquanto houver aluguel.',
      'Soma dos aluguéis dos meses desta etapa no ano. Eles já foram considerados na poupança-base de cada mês: não subtraia esta coluna novamente da poupança nem do saldo pessoal.'
    ],
    'Encargos / prestações da família': [
      'Soma de todos os pagamentos dos financiamentos da família neste mês: encargos durante a obra, prestações, amortizações extras e eventual quitação na venda. Na obra, os encargos estimados usam o saldo já liberado e a taxa anual informada; nas parcelas, SAC ou Price define como a dívida é paga. Se há duas dívidas, ambas estão incluídas. O valor sai do caixa pessoal uma única vez.',
      'Soma de todos os encargos, prestações, amortizações extras e quitações da família nos meses desta etapa no ano. Inclui as duas dívidas quando simultâneas; não some novamente os totais das duas visões pessoais sobrepostas.'
    ],
    'Compras / custos de apartamentos': [
      'Soma dos valores de compra dos apartamentos e custos de compra ou venda programados para este mês. São saídas pontuais do caixa pessoal. O crédito e o preço bruto recebido na venda entram separadamente no saldo; a quitação do financiamento fica em Encargos / prestações. Não inclui fornecedores da obra.',
      'Soma das compras e dos custos de compra ou venda de apartamentos nos meses desta etapa no ano. Não é o valor dos imóveis que a família possui, nem uma despesa mensal fixa. Crédito, venda bruta e quitação são tratados separadamente no caixa.'
    ],
    'Transferência para obra': [
      'Dinheiro próprio que efetivamente saiu da família e entrou no caixa da obra. Antes da construção, o plano acompanha os pagamentos anteriores; no início da obra, cobre as saídas programadas não cobertas pelo crédito. O limite disponível é saldo pessoal anterior + poupança-base + crédito e vendas de apartamentos − compras/custos − encargos/prestações. Transfere o menor entre o aporte programado e esse limite; se não há dinheiro disponível, transfere zero. Aportes não realizados não são repetidos automaticamente; o mesmo valor entra na obra uma única vez.',
      'Soma dos aportes próprios efetivamente transferidos nos meses desta etapa no ano. Não é uma nova despesa além das transferências mensais, nem o saldo do caixa da obra. O limite de dinheiro pessoal foi aplicado mês a mês.'
    ],
    'Poupança pessoal possível no mês': [
      'A base é o menor valor entre a Capacidade média de poupança mensal informada e a diferença positiva entre renda líquida e despesas mensais atuais de Premissas (zero quando as despesas igualam ou superam a renda). Não usa referências históricas. Depois, ajusta o aluguel sem descontá-lo duas vezes. Dessa base, subtrai compras/custos de apartamentos, encargos/prestações/quitações e transferências efetivas para a obra no mês. O mínimo mostrado é R$ 0: não apresenta poupança negativa. Não soma novamente renda menos despesas à poupança informada.',
      ''
    ],
    'Poupança pessoal possível no ano': [
      '',
      'Soma da Poupança pessoal possível de cada mês desta etapa no ano. Em cada mês, a poupança-base ajustada é reduzida por compras/custos de apartamentos, encargos/prestações/quitações e transferências para a obra, com mínimo de R$ 0. Meses deficitários entram como zero, sem reduzir os meses positivos. Não é a diferença entre o saldo inicial e o saldo final do ano.'
    ],
    'Saldo pessoal disponível': [
      'Dinheiro pessoal ao final do mês = saldo anterior + poupança-base ajustada ao aluguel + crédito de apartamentos + venda bruta de apartamentos − compras e custos de apartamentos − encargos/prestações/quitações − transferências efetivas para a obra. Não usa a poupança limitada a zero para fechar o caixa: o saldo pode ficar negativo, indicando falta de dinheiro. Exclui o valor dos imóveis e o dinheiro exclusivo da obra; não é saldo devedor.',
      'Saldo pessoal ao final do último mês desta etapa exibido no ano. Não soma os saldos mensais. Carrega o patrimônio dos meses anteriores e todas as entradas e saídas pessoais. Pode ser negativo. Não é valor dos imóveis, saldo do caixa da obra ou dívida do financiamento.'
    ],
    'Dívida desta etapa (não é caixa)': [
      'Valor já emprestado nesta etapa que ainda falta quitar após os pagamentos do mês. Aumenta com o crédito liberado e diminui com a parte das parcelas que abate o principal, amortizações extras ou quitação na venda. Juros pagos não são abatimento do principal. É uma obrigação com o banco, não dinheiro disponível nem a soma das dívidas das duas etapas.',
      'Dívida desta etapa ao final do último mês exibido no ano. Não é a soma dos saldos devedores mensais. Mostra quanto ainda falta quitar desta etapa, separado do dinheiro disponível da família e da obra.'
    ],
    'Menor saldo pessoal no ano': [
      '',
      'Menor saldo pessoal entre a abertura do primeiro mês desta etapa exibido no ano e os saldos finais de cada mês desse ano. Não é soma nem média. Um valor negativo revela falta temporária de dinheiro, mesmo quando o saldo final do ano é positivo.'
    ],
    'Saldo inicial da obra': [
      'Dinheiro da obra no início do mês: é o saldo final do mês anterior. Antes do primeiro aporte, começa em R$ 0. Inclui sobras de liberações bancárias e mantém eventuais déficits anteriores; não é dívida.',
      'Saldo de abertura do primeiro mês exibido no ano, trazido do mês anterior. Não soma as aberturas de todos os meses. É dinheiro da obra, separado do patrimônio pessoal e do saldo devedor.'
    ],
    'Aportes da família': [
      'Recursos próprios efetivamente transferidos do caixa pessoal para a obra no mês. É exatamente a entrada correspondente à coluna Transferência para obra da família, limitada ao dinheiro pessoal disponível. Não é nova renda e não é somada duas vezes.',
      'Soma dos aportes próprios efetivamente recebidos pela obra nos meses do ano. Corresponde às saídas da família uma única vez. Não é o saldo final da obra e não inclui crédito bancário.'
    ],
    'Liberação / reembolso bancário': [
      'Parte do crédito da construção recebida no mês: o financiamento calculado pela soma dos grupos Financiados menos a entrada manual é dividido em partes iguais durante o tempo de obra, com ajuste de centavos. Esta versão usa essa hipótese mensal, sem medições ou aprovação por fase. O dinheiro entra só na obra, gera dívida e não é renda pessoal.',
      'Soma das parcelas do crédito da construção liberadas nos meses do ano. A distribuição mensal continua a hipótese de partes iguais durante a obra; não é uma soma de saldos devedores nem uma nova renda da família.'
    ],
    'Pagamentos da obra': [
      'Soma dos fornecedores e demais despesas do projeto programados para o mês pelo orçamento. Previsões, pagamentos protegidos e gastos reais vinculados são conciliados sem somar a mesma saída duas vezes. Pagamentos já realizados antes do início do fluxo não saem novamente. A provisão de contingência também pode entrar como saída futura. Sai do caixa da obra, não como despesa familiar recorrente.',
      'Soma dos pagamentos de fornecedores e despesas do projeto nos meses do ano, conforme orçamento e gastos conciliados. Não soma novamente o custo total do projeto, as prestações do banco ou os aportes da família.'
    ],
    'Saldo exclusivo da obra': [
      'Dinheiro da obra ao final do mês = saldo inicial da obra + aportes da família + liberações bancárias − pagamentos da obra. Sobras continuam disponíveis nos meses seguintes. Um saldo negativo indica capital faltante; não cria aporte ou empréstimo automático. Não é patrimônio pessoal nem saldo devedor.',
      'Saldo exclusivo da obra ao final do último mês exibido no ano. Não soma os saldos mensais. Mantém sobras e déficits acumulados; negativo indica dinheiro faltante. É separado do patrimônio pessoal e da dívida da obra.'
    ],
    'Dívida da obra (não é caixa)': [
      'Crédito da construção já liberado que ainda falta quitar depois dos pagamentos do mês. Diminui com amortizações do principal e pagamentos extras; os encargos durante a obra não quitam o principal. É dívida, mesmo que o dinheiro do banco ainda esteja no caixa da obra. Não some esse valor ao dinheiro disponível.',
      'Saldo devedor da construção ao final do último mês exibido no ano. Não soma as dívidas mensais nem representa o dinheiro que sobrou no caixa da obra. Mostra a obrigação ainda existente com o banco.'
    ],
    'Menor saldo no ano': [
      '',
      'Menor saldo entre a abertura do primeiro mês exibido no ano e os saldos finais mensais da obra naquele ano. Não é soma nem média. Se negativo, mostra falta temporária de capital, mesmo com saldo positivo no final do ano.'
    ]
  };
  let tooltip, active, pinned, closeTimer;
  function hide() {
    clearTimeout(closeTimer);
    if (active) active.setAttribute('aria-expanded', 'false');
    if (tooltip) tooltip.hidden = true;
    active = pinned = null;
  }
  function initialize() {
    if (tooltip) return;
    tooltip = document.createElement('div');
    tooltip.id = 'scenario-column-tooltip'; tooltip.className = 'scenario-column-tooltip';
    tooltip.role = 'tooltip'; tooltip.hidden = true; document.body.append(tooltip);
    tooltip.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    tooltip.addEventListener('pointerleave', () => { closeTimer = setTimeout(hide, 150); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    document.addEventListener('pointerdown', event => {
      if (active && !active.contains(event.target) && !tooltip.contains(event.target)) hide();
    });
    // O balão fica fora das tabelas para não ser cortado pela rolagem.
    window.addEventListener('scroll', event => {
      if (!active || tooltip.contains(event.target)) return;
      const rect = active.getBoundingClientRect();
      if (!active.isConnected || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) hide();
      else position(active);
    }, true);
    window.addEventListener('resize', () => { if (active) position(active); });
  }
  function show(button, text) {
    initialize(); clearTimeout(closeTimer);
    if (active && active !== button) hide();
    active = button; button.setAttribute('aria-expanded', 'true');
    tooltip.textContent = text; tooltip.hidden = false;
    position(button);
  }
  function position(button) {
    const rect = button.getBoundingClientRect(), gap = 8, margin = 12;
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    const top = rect.top >= height + gap + margin ? rect.top - height - gap :
      Math.min(rect.bottom + gap, window.innerHeight - height - margin);
    tooltip.style.left = `${left}px`; tooltip.style.top = `${Math.max(margin, top)}px`;
  }
  function enhance(container, annual) {
    hide();
    for (const th of container.querySelectorAll('th')) {
      const label = th.textContent, text = descriptions[label]?.[annual ? 1 : 0];
      if (!text) throw Error(`Explicação de coluna ausente: ${label}`);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'scenario-column-help';
      button.setAttribute('aria-label', label); button.setAttribute('aria-describedby', 'scenario-column-tooltip');
      button.setAttribute('aria-expanded', 'false'); button.append(document.createTextNode(label));
      const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = ' ⓘ'; button.append(icon);
      button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(button, text); });
      button.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') closeTimer = setTimeout(hide, 150); });
      button.addEventListener('focus', () => show(button, text));
      button.addEventListener('blur', hide);
      button.addEventListener('click', () => {
        if (pinned === button) hide(); else { show(button, text); pinned = button; }
      });
      th.replaceChildren(button);
    }
    initialize();
  }
  root.ScenarioColumnHelp = { enhance };
})(globalThis);
