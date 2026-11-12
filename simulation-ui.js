/* Componentes reutilizáveis de formulário, tabelas e CSV do motor mensal. */
(function (root) {
  'use strict';
  const E = root.FinancialEngine, P = root.FinancialPlanner;
  const $ = id => document.getElementById(id);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const card = (title, amount, text) => `<article class="card"><h4>${esc(title)}</h4><div class="number">${money(amount)}</div><p>${esc(text)}</p></article>`;
  const limitsFields = [
    ['grossFamilyIncome', 'Renda bruta comprovável familiar (R$/mês)'], ['bankPercent', 'Comprometimento bancário hipotético (%)', 'number', 100],
    ['comfortablePayment', 'Prestação máxima confortável definida pela família (R$)'], ['minimumSavings', 'Poupança mínima desejada após aquisição (R$/mês)'],
    ['additionalExpenses', 'Despesas familiares adicionais previstas (R$/mês)'], ['additionalFromMonth', 'Mês de início das despesas adicionais no fluxo', 'integer'],
    ['cashMode', 'Base do fluxo mensal', [['savings', 'Poupança atual já líquida das despesas'], ['income', 'Renda líquida menos despesas familiares']]]
  ];
  const contractFields = [
    ['principal', 'Crédito contratado / solicitado (R$)'], ['annualRate', 'Juros efetivos anuais (%)', 'number', 100],
    ['months', 'Parcelas de amortização (até 600 meses)', 'integer', 600], ['system', 'Sistema de amortização', ['SAC', 'Price']],
    ['firstDate', 'Primeiro vencimento / competência do contrato', 'date'], ['fundingDate', 'Recebimento do crédito comum (data; vazio = primeira competência)', 'date'],
    ['indexAnnual', 'Correção anual hipotética do saldo (%)', 'number', 100], ['insuranceFixed', 'Seguros fixos mensais (R$)'],
    ['insurancePercentMonthly', 'Seguro variável mensal sobre saldo corrigido (%)', 'number', 100], ['fees', 'Taxas recorrentes mensais (R$)'],
    ['upfront', 'Encargos iniciais não financiados (R$)'], ['extraMode', 'Efeito da amortização extra', [['term', 'Reduzir prazo'], ['payment', 'Reduzir prestação']]],
    ['useConstruction', 'Usar liberações e carência de obra', 'checkbox']
  ];
  const timelineFields = [
    ['startDate', 'Início do fluxo de caixa', 'date'], ['helpDate', 'Data hipotética do recebimento da ajuda familiar', 'date'],
    ['projectStartMonth', 'Mês de início do projeto no fluxo', 'integer'], ['constructionMonths', 'Prazo de obra / projeto (meses)', 'integer', 600],
    ['constructionDelay', 'Atraso de obra / projeto (meses)', 'zeroInteger', 600], ['rent', 'Aluguel mensal (R$)'],
    ['rentIncludedInBase', 'Aluguel já incluído nas despesas / poupança atual', 'checkbox'],
    ['rentEndMonth', 'Último mês de aluguel no fluxo (zero = mês anterior à mudança)', 'zeroInteger', 1200]
  ];
  const constructionFields = [
    ['amortizationStartMonth', 'Início da amortização regular — mês do contrato', 'integer', 601],
    ['capitalizeInterest', 'Capitalizar juros de obra na carência (em vez de pagar)', 'checkbox']
  ];
  let latest = null;
  function field(plan, change, key, label, type = 'number', max = 1e12) {
    const wrapper = document.createElement('label'); wrapper.textContent = label;
    const input = document.createElement(Array.isArray(type) ? 'select' : 'input'); input.id = `plan-${key}`;
    if (Array.isArray(type)) type.forEach(v => {
      const option = document.createElement('option'); [option.value, option.textContent] = Array.isArray(v) ? v : [v, v]; input.append(option);
    });
    else {
      input.type = ['integer', 'zeroInteger'].includes(type) ? 'number' : type;
      if (input.type === 'number') { input.min = type === 'integer' ? 1 : 0; input.max = max; input.step = ['integer', 'zeroInteger'].includes(type) ? 1 : 'any'; input.required = true; }
      if (type === 'checkbox') { wrapper.className = 'check'; input.checked = plan[key]; }
    }
    if (type !== 'checkbox') input.value = plan[key];
    input.onchange = () => {
      if (!input.checkValidity()) { input.reportValidity(); return; }
      const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
      change(next => { next.planning[key] = value; });
    };
    wrapper.append(input); return wrapper;
  }
  function eventInput(list, index, key, value, label, type = 'number') {
    const attrs = `data-list="${list}" data-index="${index}" data-key="${key}"`;
    if (type === 'kind') return `<label>${label}<select ${attrs}>${[['project', 'Compra / despesas do projeto'], ['construction', 'Pagamento de obra'], ['nonFinanced', 'Despesa não financiada']].map(([v, text]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
    return `<label>${label}<input ${attrs} type="${type}" value="${esc(value)}" ${type === 'number' ? `min="${key === 'amount' ? 0 : 1}" max="${key === 'amount' ? '1000000000000' : '1200'}" step="${key === 'amount' ? 'any' : '1'}" required` : 'maxlength="1000"'}></label>`;
  }
  const eventTypes = {
    extraPayments: ['extraEditor', 'Amortizações extraordinárias', 'Adicionar amortização extra'],
    draws: ['drawEditor', 'Liberações de crédito por etapa', 'Adicionar liberação'],
    constructionCharges: ['chargeEditor', 'Outros encargos de obra por janela mensal', 'Adicionar encargo'],
    projectPayments: ['paymentEditor', 'Pagamentos de compra, obra e custos não financiados', 'Adicionar pagamento']
  };
  function eventEditor(plan, change, key) {
    const [id, title, action] = eventTypes[key], node = $(id);
    node.innerHTML = `<h4>${title}</h4>` + plan[key].map((e, index) => `<div class="subitem grid">
      ${eventInput(key, index, 'description', e.description, 'Descrição', 'text')}
      ${key === 'constructionCharges' ? eventInput(key, index, 'startMonth', e.startMonth, 'Primeiro mês do contrato') + eventInput(key, index, 'endMonth', e.endMonth, 'Último mês do contrato') : eventInput(key, index, 'month', e.month, key === 'projectPayments' ? 'Mês do fluxo' : 'Mês do contrato')}
      ${eventInput(key, index, 'amount', e.amount, key === 'constructionCharges' ? 'Encargo mensal (R$)' : 'Valor (R$)')}
      ${key === 'projectPayments' ? eventInput(key, index, 'kind', e.kind, 'Tipo de saída', 'kind') : ''}
      <button class="danger" data-remove="${index}">Excluir evento</button></div>`).join('') + `<button data-add>${action}</button>`;
    node.onchange = event => {
      const input = event.target;
      if (!input.dataset.key || !input.checkValidity()) { input.reportValidity?.(); return; }
      change(next => { next.planning[key][Number(input.dataset.index)][input.dataset.key] = input.type === 'number' ? Number(input.value) : input.value; });
    };
    node.onclick = event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.hasAttribute('data-add')) change(next => {
        const e = { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, description: 'Evento hipotético', amount: 0 };
        if (key === 'constructionCharges') { e.startMonth = 1; e.endMonth = next.planning.constructionMonths + next.planning.constructionDelay; }
        else e.month = key === 'extraPayments' && next.planning.useConstruction ? next.planning.amortizationStartMonth : 1;
        if (key === 'projectPayments') e.kind = 'construction'; next.planning[key].push(e);
      });
      if (button.dataset.remove !== undefined && confirm('Excluir este evento do fluxo? O orçamento e os gastos reais serão mantidos.')) change(next => { next.planning[key].splice(Number(button.dataset.remove), 1); }, false, true);
    };
  }
  function table(headId, bodyId, rows, type, annual) {
    const columns = (type === 'loan' ? E.loanColumns : E.cashColumns).filter(([key]) => !annual || !['month', 'installmentNumber'].includes(key));
    if (annual) columns.unshift(['count', 'Meses no ano']);
    if (annual && type === 'cash') columns.push(['minimumCash', 'Menor caixa no ano']);
    $(headId).innerHTML = '<tr>' + columns.map(([, label]) => `<th>${label}</th>`).join('') + '</tr>';
    $(bodyId).innerHTML = rows.map(r => `<tr class="${(r.minimumCash ?? r.closingCash ?? 0) < 0 ? 'negative' : ''}">${columns.map(([key]) => `<td>${['month', 'installmentNumber', 'count'].includes(key) ? esc(r[key] || '—') : typeof r[key] === 'number' ? money(r[key]) : esc(r[key] ?? '')}</td>`).join('')}</tr>`).join('');
  }
  function saveCsv(name, text) {
    const anchor = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function render(state, change, budget) {
    const p = state.planning;
    $('results').innerHTML = Object.entries(P.PATHS).map(([id, title]) => `<article class="card ${p.selectedPath === id ? 'selected-path' : ''}"><h3>${esc(title)}</h3><p>Comparação em preparação. Sem resultado imobiliário validado nesta etapa.</p><button data-path="${id}">${p.selectedPath === id ? 'Caminho selecionado' : 'Selecionar caminho'}</button></article>`).join('');
    $('results').onclick = event => { const button = event.target.closest('button[data-path]'); if (button) change(next => { next.planning.selectedPath = button.dataset.path; }); };
    for (const [id, fields] of [['plannerLimits', limitsFields], ['plannerContract', contractFields], ['plannerTimeline', timelineFields], ['plannerConstruction', constructionFields]]) {
      $(id).replaceChildren(...fields.map(args => field(p, change, ...args)));
    }
    $('plannerView').replaceChildren(field(p, change, 'scheduleView', 'Visualização das tabelas', [['monthly', 'Todos os meses'], ['annual', 'Resumo anual']]));
    Object.keys(eventTypes).forEach(key => eventEditor(p, change, key));
    latest = null; $('plannerError').textContent = ''; $('plannerSummary').innerHTML = ''; $('plannerWarnings').innerHTML = '';
    $('downloadLoan').disabled = true; $('downloadCash').disabled = true;
    table('scheduleHead', 'schedule', [], 'loan', false); table('cashHead', 'cashRows', [], 'cash', false);
    try {
      latest = P.calculate(state);
      const { loan, flow, limits, warnings } = latest, t = loan.totals;
      $('plannerSummary').innerHTML = card('Teto bancário hipotético', limits.bankLimit, 'Não é aprovação de crédito.') +
        card('Limite de planejamento', limits.planningLimit, `Menor entre banco e família. Menor capacidade recorrente após poupança mínima: ${money(limits.cashCapacity)}.`) +
        card('Juros totais do contrato', t.interest, `Pagos: ${money(t.interestPaid)}; capitalizados: ${money(t.capitalizedInterest)}.`) +
        card('Encargos totais', t.charges, 'Seguros, taxas, encargos de obra e custos iniciais; correção monetária separada.') +
        card('Desembolso nominal do financiamento', t.nominalOutflow, `Custo acima do crédito efetivamente recebido: ${money(t.financingCost)}. Correção acumulada: ${money(t.correction)}. Não inclui preço do imóvel/obra.`) +
        card('Saldo devedor final', t.closingBalance, `${t.installments} parcelas de amortização; quitação: ${t.lastDate || 'sem crédito liberado'}. Extra efetivamente utilizada: ${money(t.extra)}.`) +
        card('Caixa final', flow.totals.closingCash, `Menor saldo durante o fluxo: ${money(flow.totals.minimumBalance)}.`) +
        card('Capital adicional necessário', flow.totals.additionalCapital, flow.totals.firstNegativeMonth ? `Primeiro mês negativo: ${flow.totals.firstNegativeMonth}. Saldo final positivo não elimina falta de caixa anterior.` : 'Nenhum saldo mensal negativo nas hipóteses cadastradas.') +
        card('Pagamentos distribuídos no fluxo', latest.scheduledProjectTotal, `Orçamento dos 11 grupos: ${money(budget.total)}. Reconciliação manual; não somamos orçamento e pagamentos duas vezes.`);
      const alerts = [...warnings];
      if (!limits.withinPlanning) alerts.push('Há prestação recorrente acima do limite de planejamento.');
      if (flow.rows.some(r => !r.limits.withinMonthlyCash)) alerts.push('Há mês em que a prestação compromete a poupança mínima ou supera a capacidade mensal.');
      if (flow.totals.additionalCapital > 0) alerts.push('Caixa mensal negativo: falta capital de giro ou financiamento em datas compatíveis.');
      $('plannerWarnings').innerHTML = alerts.map(text => `<li>${esc(text)}</li>`).join('');
      const annual = p.scheduleView === 'annual';
      table('scheduleHead', 'schedule', annual ? E.annualSummary(loan.rows) : loan.rows, 'loan', annual);
      table('cashHead', 'cashRows', annual ? E.annualSummary(flow.rows, 'cash') : flow.rows, 'cash', annual);
      $('downloadLoan').disabled = false; $('downloadCash').disabled = false;
    } catch (error) { $('plannerError').textContent = error.message; }
    $('downloadLoan').onclick = () => { if (latest) saveCsv('cronograma-integral.csv', E.csv(latest.loan.rows, E.loanColumns)); };
    $('downloadCash').onclick = () => { if (latest) saveCsv('fluxo-caixa-integral.csv', E.csv(latest.flow.rows, E.cashColumns)); };
  }
  root.FinancialView = { render };
})(globalThis);
