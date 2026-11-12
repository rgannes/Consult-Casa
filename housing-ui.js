/* Uma alternativa por vez, poucas entradas e linhas do tempo com caixa compartilhado. */
(function (root) {
  'use strict';
  const H = root.Housing, E = root.FinancialEngine;
  const $ = id => document.getElementById(id);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const when = date => new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
  let path = '', views = {}, last = null;
  const card = (title, value, note) => `<article class="card"><h3>${title}</h3><div class="number">${esc(value)}</div><p>${esc(note)}</p></article>`;
  function input(id, label, value, action, type = 'number', options = null) {
    const wrap = document.createElement('label'); wrap.textContent = label;
    const el = document.createElement(options ? 'select' : 'input'); el.id = id;
    if (options) options.forEach(([v, text]) => { const o = document.createElement('option'); o.value = v; o.textContent = text; el.append(o); });
    else { el.type = type; if (type === 'number') { el.min = 0; el.step = 'any'; el.max = 1e12; el.required = true; } }
    if (type === 'checkbox') { wrap.className = 'check'; el.checked = value; } else el.value = value;
    el.onchange = () => { if (el.reportValidity()) action(type === 'checkbox' ? el.checked : type === 'number' && !options ? Number(el.value) : el.value); };
    wrap.append(el); return wrap;
  }
  function render(state, change) {
    const h = state.housing, p = h.paths[h.selectedPath];
    if (path !== h.selectedPath) { views = {}; path = h.selectedPath; }
    const selector = $('housingPath'); selector.replaceChildren(...Object.entries(H.PATHS).map(([id, label]) => { const o = document.createElement('option'); o.value = id; o.textContent = label; return o; }));
    selector.value = h.selectedPath; $('housingSelectedTitle').textContent = H.PATHS[h.selectedPath]; selector.onchange = () => change(next => { next.housing.selectedPath = selector.value; });
    const dateField = input('housing-start', 'Começar a simulação em', h.startDate.slice(0, 7), value => change(next => { next.housing.startDate = value + '-01'; }), 'month');
    $('housingStart').replaceChildren(dateField);
    last = null; let error = '';
    try { last = H.calculate(state); } catch (e) { error = e.message; }
    const mutate = (which, key, value) => change(next => {
      const profile = next.housing.paths[path][which]; profile[key] = value;
      if (key === 'entry') profile.credit = null;
      if (key === 'credit') profile.entry = null;
    });
    $('housingContext').textContent = `Dados de Premissas: recursos iniciais ${money(Math.max(0, state.cash - (state.reserveAlreadyExcluded ? 0 : state.preservedReserve)) + (state.includeFamilyHelp ? state.familyHelp : 0))}; renda líquida ${money(state.income)}; despesas ${money(state.essential)}. A reserva já separada não é retirada de novo.`;
    const open = new Set([...document.querySelectorAll('#housingForms details[open]')].map(d => d.id));
    $('housingForms').replaceChildren();
    function loanForm(which, label, cost, build) {
      const profile = p[which], stage = last?.stages.find(s => s.id === which);
      const section = document.createElement('div'); section.className = 'housing-step';
      const title = document.createElement('h3'); title.textContent = label; section.append(title);
      const intro = document.createElement('p'); intro.textContent = `${build ? 'Orçamento da casa' : 'Valor em Premissas'}: ${money(cost)}. Entrada e crédito são calculados automaticamente; você pode ajustá-los.`; section.append(intro);
      const grid = document.createElement('div'); grid.className = 'grid';
      const entry = stage?.funding.entry ?? profile.entry ?? Math.min(cost, Math.max(0, state.cash));
      const credit = stage?.funding.principal ?? profile.credit ?? Math.max(0, cost - entry);
      grid.append(input(`home-${which}-entry`, 'Entrada utilizada (R$)', entry, v => mutate(which, 'entry', v)),
        input(`home-${which}-credit`, 'Financiamento (R$; pode ajustar)', credit, v => mutate(which, 'credit', v)),
        input(`home-${which}-months`, build ? 'Prazo total do financiamento (meses, incluindo obra)' : 'Prazo do financiamento (meses)', profile.months, v => mutate(which, 'months', v)),
        input(`home-${which}-cet`, 'CET anual estimado (%)', profile.cet, v => mutate(which, 'cet', v)),
        input(`home-${which}-system`, 'Forma de pagamento', profile.system, v => mutate(which, 'system', v), 'text', [['SAC', 'SAC · parcelas que diminuem'], ['Price', 'Price · parcela financeira constante']]));
      if (build) grid.append(input(`home-${which}-buildMonths`, 'Tempo até conclusão e regularização da obra (meses)', profile.buildMonths, v => mutate(which, 'buildMonths', v)));
      section.append(grid);
      const reset = document.createElement('button'); reset.className = 'secondary'; reset.textContent = 'Recalcular entrada e crédito automaticamente';
      reset.onclick = () => change(next => { next.housing.paths[path][which].entry = null; next.housing.paths[path][which].credit = null; }); section.append(reset);
      const extra = document.createElement('details'); extra.id = `extra-${which}`;
      extra.innerHTML = '<summary>Pagar um valor extra (opcional)</summary>';
      const extraGrid = document.createElement('div'); extraGrid.className = 'grid';
      extraGrid.append(input(`home-${which}-extraAmount`, 'Valor extra (R$; zero = sem extra)', profile.extraAmount, v => mutate(which, 'extraAmount', v)),
        input(`home-${which}-extraMonth`, build ? 'Mês do financiamento para a extra (inclui obra)' : 'Número da parcela para o pagamento extra', profile.extraMonth, v => mutate(which, 'extraMonth', v)),
        input(`home-${which}-extraMode`, 'Como usar o valor extra', profile.extraMode, v => mutate(which, 'extraMode', v), 'text', [['term', 'Terminar de pagar antes'], ['payment', 'Diminuir as próximas parcelas']]));
      extra.append(extraGrid); section.append(extra); $('housingForms').append(section);
    }
    const two = path === 'buyThenBuild' || path === 'buyThenUpgrade', build = path === 'buyThenBuild' || path === 'rentBuild';
    if (two) loanForm('first', '1 · Compra do apartamento atual', state.currentApartment, false);
    if (path !== 'buyLarger') {
      const timing = document.createElement('div'); timing.className = 'housing-timing';
      timing.append(input('home-stage2Month', two ? (build ? 'Começar a construção no mês' : 'Vender e trocar de apartamento no mês') : 'Começar a obra no mês', p.stage2Month,
        v => change(next => { next.housing.paths[path].stage2Month = v; })));
      $('housingForms').append(timing);
    }
    loanForm('second', two ? (build ? '2 · Construção da casa' : '2 · Compra do apartamento maior') : (build ? 'Construção da casa' : 'Compra do apartamento maior'), build ? root.BudgetScheduler.budget(state).total : state.largerApartment, build);
    if (path === 'buyThenBuild') {
      const sale = input('home-sell', 'Vender o apartamento atual neste caminho', p.sell, v => change(next => { next.housing.paths[path].sell = v; }), 'checkbox'); $('housingForms').append(sale);
    }
    const transaction = document.createElement('details'); transaction.id = 'home-transactions'; transaction.innerHTML = '<summary>Custos de compra e venda e valor de venda</summary>';
    const costs = document.createElement('div'); costs.className = 'grid';
    const costField = (key, label, value = p[key]) => costs.append(input(`home-${key}`, label, value, v => change(next => { next.housing.paths[path][key] = v; })));
    if (path !== 'rentBuild') costField('buyCosts', two ? 'Custos da compra do apartamento atual (R$)' : 'Custos da compra (R$)');
    if (path === 'buyThenUpgrade') costField('secondBuyCosts', 'Custos da compra do apartamento maior (R$)');
    if (path === 'buyThenUpgrade' || (path === 'buyThenBuild' && p.sell)) {
      costField('salePrice', 'Valor estimado da venda (R$)', p.salePrice ?? state.currentApartment);
      costField('saleCosts', 'Custos e tributos da venda (R$)');
      if (path === 'buyThenBuild') costField('saleMonth', 'Vender no mês (padrão: mudança para a casa)', p.saleMonth ?? p.stage2Month + p.second.buildMonths);
    }
    if (costs.children.length) { transaction.append(costs); $('housingForms').append(transaction); }
    open.forEach(id => { const node = $(id); if (node) node.open = true; });
    $('housingError').textContent = error; $('housingError').classList.toggle('hidden', !error);
    $('housingSummary').innerHTML = ''; $('housingWarnings').innerHTML = ''; $('housingTimelines').replaceChildren();
    $('housingExport').disabled = !last;
    if (!last) return;
    const s = last.summary, debtDate = s.debtFreeMonth ? when(E.addMonths(h.startDate, s.debtFreeMonth - 1)) : 'Sem financiamento';
    $('housingSummary').innerHTML = card('Quando chegar à moradia desejada', when(E.addMonths(h.startDate, s.moveMonth - 1)), `Mês ${s.moveMonth} da simulação.`) +
      card('Até quando há financiamentos', debtDate, 'Considera todas as dívidas deste caminho e as quitações em vendas.') +
      card('Custo dos imóveis/projeto', money(s.projectCost), 'Sem financiamento; nas alternativas em duas etapas, soma as aquisições. Custos de transação aparecem no desembolso.') +
      card('Desembolso total projetado', money(s.totalOutlay), last.sales.length ? `Após descontar a venda bruta, necessidade líquida: ${money(s.netOwnOutlay)}. Inclui financiamento, aluguel e custos informados.` : 'Saídas projetadas desde o início: projeto, custo global do crédito, aluguel e custos informados. Gastos pagos antes do início não saem novamente. Não soma o principal emprestado duas vezes.') +
      card('Quanto pagar por mês', money(s.firstPayment), `Primeira cobrança estimada. Primeira prestação na moradia desejada: ${money(s.firstFullPayment)}. Maior soma de prestações: ${money(s.maxPayment)}.`) +
      card('Quanto pode continuar guardando', money(s.regularSaving), 'Sobra mensal após prestações no início da moradia desejada, antes de compras/obra pontuais. Se negativa, precisa complementar com patrimônio.') +
      card('Patrimônio financeiro ao final', money(s.closingCash), `Dinheiro disponível, sem somar valor dos imóveis. Menor saldo: ${money(s.minimumCash)}.`);
    const alerts = [];
    if (s.shortageMonths.length) alerts.push(`Falta de caixa em ${s.shortageMonths.length} mês(es), a partir do mês ${s.shortageMonths[0]}. Capital adicional máximo: ${money(s.additionalCapital)}.`);
    if (s.excessiveMonths.length) alerts.push(`Em ${s.excessiveMonths.length} mês(es), as prestações superam o limite ou a capacidade mensal. Teto bancário hipotético: ${money(s.bankLimit)}; limite confortável: ${money(s.familyLimit)}. Não é aprovação de crédito.`);
    alerts.push(...last.warnings);
    $('housingWarnings').innerHTML = alerts.map(w => `<li>${esc(w)}</li>`).join('');
    last.sales.forEach(sale => { const note = document.createElement('p'); note.className = 'notice'; note.textContent = `Venda em ${when(E.addMonths(h.startDate, sale.month - 1))}: ${money(sale.gross)} − ${money(sale.costs)} de despesas − ${money(sale.payoff)} de quitação = ${money(sale.net)} líquidos. O caixa é compartilhado; esse valor não é somado outra vez como patrimônio inicial.`; $('housingTimelines').append(note); });
    for (const stage of last.stages) renderTimeline(stage);
    $('housingExport').onclick = () => {
      const a = document.createElement('a'), url = URL.createObjectURL(new Blob([E.csv(last.rows, H.columns)], { type: 'text/csv;charset=utf-8' }));
      a.href = url; a.download = `vecto-${path}-cronograma-completo.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }
  function renderTimeline(stage) {
    const choice = views[stage.id] ||= { page: 0, mode: 'monthly' }, rows = stage.rows;
    const box = document.createElement('div'); box.className = 'housing-timeline'; box.dataset.stage = stage.id;
    const title = document.createElement('h3'); title.textContent = stage.label; box.append(title);
    const note = document.createElement('p'); note.className = 'small'; note.textContent = 'Valores pagos são desta etapa. A poupança e o saldo financeiro são da família inteira, já considerando a outra etapa. Não some os saldos das duas linhas. Role a tabela para os lados para ver todos os valores.'; box.append(note);
    choice.page = Math.min(choice.page, Math.max(0, Math.ceil(rows.length / 12) - 1));
    const toolbar = document.createElement('div'); toolbar.className = 'timeline-toolbar';
    const controls = [['previous', 'Voltar 12 meses'], ['next', 'Próximos 12 meses'], ['annual', 'Períodos anuais'], ['all', 'Todo o cronograma'], ['monthly', 'Ver 12 meses']];
    controls.forEach(([action, label]) => {
      const button = document.createElement('button'); button.textContent = label; button.className = 'secondary'; button.dataset.timelineAction = action;
      button.disabled = (action === 'previous' && (choice.mode !== 'monthly' || choice.page === 0)) || (action === 'next' && (choice.mode !== 'monthly' || (choice.page + 1) * 12 >= rows.length));
      button.onclick = () => {
        if (action === 'previous') choice.page--; else if (action === 'next') choice.page++; else choice.mode = action;
        const replacement = document.createElement('div'); box.replaceWith(replacement); const parent = $('housingTimelines');
        // Recria apenas as linhas do tempo; os campos e os dados financeiros não mudam.
        parent.querySelectorAll('.housing-timeline').forEach(el => el.remove()); replacement.remove();
        last.stages.forEach(s => renderTimeline(s));
      };
      toolbar.append(button);
    }); box.append(toolbar);
    choice.page = Math.min(choice.page, Math.max(0, Math.ceil(rows.length / 12) - 1));
    let visible = choice.mode === 'all' ? rows : rows.slice(choice.page * 12, choice.page * 12 + 12);
    if (choice.mode === 'annual') {
      const years = new Map();
      for (const r of rows) {
        const year = r.date.slice(0, 4);
        if (!years.has(year)) years.set(year, { ...r, date: year, phase: 'Resumo anual', stageTotal: 0, stageFinancing: 0, savingPossible: 0, wealthWithdrawal: 0, minimumCash: r.openingCash });
        const y = years.get(year);
        for (const k of ['stageTotal', 'stageFinancing', 'savingPossible', 'wealthWithdrawal']) y[k] = E.cents(y[k] + r[k]);
        y.closingCash = r.closingCash; y.balance = r.balance; y.minimumCash = Math.min(y.minimumCash, r.closingCash);
      }
      visible = [...years.values()];
    }
    const caption = document.createElement('p'); caption.className = 'small'; caption.textContent = choice.mode === 'annual' ? 'Resumo por ano. Todos os meses continuam calculados e estão no CSV.' : `${choice.mode === 'all' ? 'Todos os' : 'Até 12 dos'} ${rows.length} meses desta etapa. Todas as parcelas estão calculadas.`; box.append(caption);
    const table = document.createElement('div'); table.className = 'scroll';
    table.innerHTML = `<table><thead><tr><th>Mês/ano</th><th>Momento</th><th>Total pago em moradia</th><th>Parcela / encargos</th><th>Poupança possível ${choice.mode === 'annual' ? 'no ano' : 'no mês'}</th><th>Retirada de patrimônio</th><th>Saldo disponível da família</th><th>Saldo desta dívida</th>${choice.mode === 'annual' ? '<th>Menor saldo no ano</th>' : ''}</tr></thead><tbody>${visible.map(r => `<tr class="${(r.minimumCash ?? r.closingCash) < 0 ? 'negative' : ''}"><td>${r.date.length === 4 ? r.date : esc(when(r.date))}</td><td>${esc(r.phase)}</td><td>${money(r.stageTotal)}</td><td>${money(r.stageFinancing)}</td><td>${money(r.savingPossible)}</td><td>${money(r.wealthWithdrawal)}</td><td>${money(r.closingCash)}</td><td>${money(r.balance)}</td>${choice.mode === 'annual' ? `<td>${money(r.minimumCash)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
    box.append(table); $('housingTimelines').append(box);
  }
  root.HousingView = { render };
})(globalThis);
