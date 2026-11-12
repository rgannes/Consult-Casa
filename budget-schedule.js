/* Orçamento e cronogramas: uma única fonte para totais, programação e saídas de caixa. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' ? require('./simulation') : root.FinancialEngine;
  const IDS = ['land', 'documents', 'studies', 'projects', 'licenses', 'preparation', 'construction', 'external', 'furniture', 'completion', 'contingency'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const total = rows => E.cents(rows.reduce((sum, row) => sum + E.cents(row.amount), 0));
  function budget(state) {
    const values = {};
    state.groups.forEach(g => {
      const base = g.id === 'construction' && state.constructionMode === 'area' ? state.area * state.m2 : g.value;
      if (g.id !== 'contingency') values[g.id] = E.cents(base + g.subitems.reduce((s, i) => s + (i.includedInGroup ? 0 : i.value), 0));
    });
    const contingencyBase = E.cents(state.contingencyBaseIds.reduce((s, id) => s + values[id], 0)), g = state.groups[10];
    values.contingency = E.cents((state.contingencyMode === 'manual' ? g.value : contingencyBase * state.contingencyPercent / 100) + g.subitems.reduce((s, i) => s + (i.includedInGroup ? 0 : i.value), 0));
    const amount = E.cents(Object.values(values).reduce((s, v) => s + v, 0));
    return { values, total: amount, land: values.land, withoutLand: amount - values.land,
      construction: values.construction, contingency: values.contingency, contingencyBase,
      baseNoLand: amount - values.land - values.contingency,
      stress: (amount - values.land) * Math.pow(1 + state.inflation / 100, state.delay / 12) + values.land };
  }
  function defaults() {
    return { version: 1, landMonth: 1, moveDate: '', legacyAssignments: [], groups: IDS.map(groupId => ({
      groupId, mode: ['construction', 'external', 'contingency'].includes(groupId) ? 'monthly' : 'single',
      followTimeline: true, startMonth: 1, months: 1,
      source: 'Distribuição financeira provisória; não representa curva técnica de execução.', payments: []
    })) };
  }
  function timeline(state) {
    const p = state.planning;
    const automaticMoveMonth = p.projectStartMonth + p.constructionMonths + p.constructionDelay;
    const moveMonth = state.budgetSchedule.moveDate && p.startDate ? E.monthOffset(p.startDate, state.budgetSchedule.moveDate) + 1 : automaticMoveMonth;
    if (moveMonth < 1 || moveMonth > 1200) throw Error('Data de mudança fora do horizonte do fluxo (1–1200 meses).');
    return { startMonth: p.projectStartMonth, duration: p.constructionMonths + p.constructionDelay, moveMonth, automaticMoveMonth };
  }
  function windowFor(state, group) {
    if (!group.followTimeline) return { start: group.startMonth, months: group.mode === 'monthly' ? group.months : 1 };
    const t = timeline(state);
    return { start: ['land', 'documents'].includes(group.groupId) ? state.budgetSchedule.landMonth : ['furniture', 'completion'].includes(group.groupId) ? t.moveMonth : t.startMonth,
      months: group.mode === 'monthly' ? t.duration : 1 };
  }
  function numeric(value, label, max = 1e12) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw Error(`${label}: valor inválido.`);
  }
  function month(value, label) { numeric(value, label, 1200); if (!Number.isInteger(value) || value < 1) throw Error(`${label}: mês inválido.`); }
  function validate(state) {
    const s = state.budgetSchedule;
    if (!s || typeof s !== 'object' || s.version !== 1) throw Error('Cronograma do orçamento inválido.');
    month(s.landMonth, 'Aquisição do terreno');
    if (typeof s.moveDate !== 'string') throw Error('Data de mudança inválida.');
    if (s.moveDate) E.monthOffset(s.moveDate, s.moveDate);
    if (!Array.isArray(s.groups) || s.groups.length !== 11) throw Error('O cronograma exige os 11 grupos.');
    const ids = new Set();
    s.groups.forEach((g, index) => {
      if (!g || g.groupId !== IDS[index] || !['single', 'monthly', 'manual'].includes(g.mode)) throw Error('Grupo do cronograma inválido.');
      if (typeof g.followTimeline !== 'boolean' || typeof g.source !== 'string' || g.source.length > 5000) throw Error('Regra/fonte do cronograma inválida.');
      month(g.startMonth, 'Início do grupo'); month(g.months, 'Duração do grupo');
      if (!Array.isArray(g.payments) || g.payments.length > 2400) throw Error('Pagamentos do grupo inválidos.');
      g.payments.forEach(p => {
        if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 200 || p.id.startsWith('legacy:') || ids.has(p.id)) throw Error('Identificador de pagamento duplicado ou inválido.');
        ids.add(p.id); month(p.month, 'Pagamento'); numeric(p.amount, 'Pagamento');
        if (!['planned', 'confirmed', 'paid'].includes(p.status) || typeof p.fixed !== 'boolean' || !['automatic', 'manual'].includes(p.origin)) throw Error('Situação do pagamento inválida.');
      });
    });
    if (!Array.isArray(s.legacyAssignments) || s.legacyAssignments.length > 1000) throw Error('Classificações dos pagamentos manuais inválidas.');
    const assigned = new Set();
    s.legacyAssignments.forEach(a => {
      if (!a || typeof a.eventId !== 'string' || assigned.has(a.eventId) || !['budget', 'additional', 'financing'].includes(a.treatment)) throw Error('Classificação de pagamento inválida ou duplicada.');
      assigned.add(a.eventId);
      if (a.treatment === 'budget' && !IDS.includes(a.groupId)) throw Error('Grupo do pagamento manual inválido.');
    });
    state.expenses.forEach(e => {
      if (e.paymentId !== undefined && (typeof e.paymentId !== 'string' || e.paymentId.length > 200)) throw Error('Vínculo do gasto inválido.');
      if (e.cashTreatment !== undefined && !['budget', 'financing'].includes(e.cashTreatment)) throw Error('Tratamento financeiro do gasto inválido.');
    });
    timeline(state);
    return state;
  }
  function legacyPayments(state) {
    const assigned = new Map(state.budgetSchedule.legacyAssignments.map(a => [a.eventId, a]));
    return state.planning.projectPayments.map(e => {
      const a = assigned.get(e.id);
      return { ...e, id: `legacy:${e.id}`, groupId: a?.treatment === 'budget' ? a.groupId : null,
        treatment: a?.treatment || 'review', status: 'confirmed', fixed: true, origin: 'manual', external: true };
    });
  }
  function allPayments(state) {
    return [...state.budgetSchedule.groups.flatMap(g => g.payments.map(p => ({ ...p, groupId: g.groupId, treatment: 'budget' }))), ...legacyPayments(state)];
  }
  function linksFor(state, payment) {
    return state.expenses.filter(e => e.cashTreatment !== 'financing' && e.paymentId === payment.id && (payment.treatment === 'additional' || e.groupId === payment.groupId));
  }
  function amounts(state, payment) {
    const linked = linksFor(state, payment);
    const linkedTotal = E.cents(linked.reduce((s, e) => s + E.cents(e.amount), 0));
    const remainder = E.cents(Math.max(0, E.cents(payment.amount) - linkedTotal));
    const paid = E.cents(linked.filter(e => e.status === 'Pago').reduce((s, e) => s + E.cents(e.amount), 0) + (payment.status === 'paid' ? remainder : 0));
    return { linked, remainder, effective: E.cents(linkedTotal + remainder), paid };
  }
  function protectedPayment(state, g, p) {
    return g.mode === 'manual' || p.fixed || p.status !== 'planned' || state.expenses.some(e => e.cashTreatment !== 'financing' && e.paymentId === p.id);
  }
  function synchronize(input) {
    const state = clone(input);
    if (!state.budgetSchedule) state.budgetSchedule = defaults();
    validate(state);
    const b = budget(state), legacy = legacyPayments(state), pool = allPayments(state);
    const linkedExpense = e => e.paymentId && pool.some(p => ['budget', 'additional'].includes(p.treatment) && p.id === e.paymentId && (p.treatment === 'additional' || p.groupId === e.groupId));
    for (const g of state.budgetSchedule.groups) {
      if (g.mode === 'manual') continue;
      const keep = g.payments.filter(p => protectedPayment(state, g, p));
      const external = legacy.filter(p => p.treatment === 'budget' && p.groupId === g.groupId);
      const unlinked = state.expenses.filter(e => e.cashTreatment !== 'financing' && e.groupId === g.groupId && !linkedExpense(e));
      const used = E.cents([...keep.map(p => ({ ...p, groupId: g.groupId, treatment: 'budget' })), ...external].reduce((s, p) => s + amounts(state, p).effective, 0) + unlinked.reduce((s, e) => s + E.cents(e.amount), 0));
      const remaining = Math.max(0, Math.round((E.cents(b.values[g.groupId]) - used) * 100));
      const w = windowFor(state, g);
      if (w.start + w.months - 1 > 1200) throw Error('Cronograma do grupo ultrapassa 1200 meses.');
      const blocked = new Set(keep.map(p => p.month));
      const months = Array.from({ length: w.months }, (_, i) => w.start + i).filter(m => !blocked.has(m));
      const base = months.length ? Math.floor(remaining / months.length) : 0;
      const rest = months.length ? remaining % months.length : 0;
      const generated = months.filter((_, i) => base + (i < rest ? 1 : 0) > 0).map((m, i) => ({
        id: `budget:${g.groupId}:${m}`, month: m, amount: (base + (i < rest ? 1 : 0)) / 100,
        status: 'planned', fixed: false, origin: 'automatic'
      }));
      // IDs preservados de profissionais nunca são reutilizados por uma linha automática.
      const occupied = new Set([...keep, ...state.budgetSchedule.groups.filter(other => other !== g).flatMap(other => other.payments)].map(p => p.id));
      generated.forEach(p => { while (occupied.has(p.id)) p.id += ':auto'; occupied.add(p.id); });
      g.payments = [...keep, ...generated].sort((a, b) => a.month - b.month || a.id.localeCompare(b.id));
    }
    return state;
  }
  function resolve(input) {
    const state = synchronize(input), warnings = [], issues = [], b = budget(state), payments = allPayments(state), expenses = state.expenses;
    const review = payments.filter(p => p.treatment === 'review');
    review.forEach(p => warnings.push(`Pagamento manual da Etapa 2 “${p.description}” precisa ser classificado antes de calcular o caixa.`));
    const byId = new Map(payments.filter(p => ['budget', 'additional'].includes(p.treatment)).map(p => [p.id, p]));
    const linked = new Set(), events = [], excludedPast = [], keys = new Set();
    const add = e => {
      if (!e.amount) return;
      const signature = `${e.groupId}:${e.month}:${e.amount}:${e.label}`;
      if (keys.has(signature)) warnings.push(`Possível duplicidade: ${e.label}, mês ${e.month}, ${e.amount.toFixed(2)}. Confira os registros; não removemos pagamentos automaticamente.`);
      keys.add(signature);
      if (e.month < 1 && e.paid) { excludedPast.push(e); return; }
      if (e.month < 1) { warnings.push(`Compromisso vencido antes do início do fluxo: ${e.label}. Considerado no mês 1.`); e.month = 1; }
      events.push({ ...e, kind: e.groupId === 'construction' ? 'construction' : 'project' });
    };
    const expenseMonth = (e, fallback = 1) => {
      if (!e.date || !state.planning.startDate) {
        if (!e.date) warnings.push(`Gasto “${e.description}” sem data: usada competência do pagamento vinculado ou mês 1.`);
        return fallback;
      }
      try { return E.monthOffset(state.planning.startDate, e.date.length === 7 ? e.date + '-01' : e.date) + 1; }
      catch {
        const message = `Data do gasto “${e.description}” fora do intervalo do motor. Corrija a data antes de calcular o caixa.`;
        issues.push(message); warnings.push(message); return fallback;
      }
    };
    let paidBudget = 0, futureBudget = 0, additional = 0;
    const groupReports = state.groups.map(g => ({ groupId: g.id, label: g.label, budget: E.cents(b.values[g.id]), programmed: 0, paid: 0, future: 0 }));
    const reports = new Map(groupReports.map(r => [r.groupId, r]));
    for (const p of payments.filter(p => ['budget', 'additional'].includes(p.treatment))) {
      const a = amounts(state, p);
      if (a.effective > E.cents(p.amount)) warnings.push(`Pagamento ${p.id}: registros vinculados excedem o previsto; a diferença foi incluída uma única vez.`);
      if (p.status === 'paid' && a.linked.some(e => e.status === 'A pagar')) warnings.push(`Pagamento ${p.id} marcado como pago contém compromisso a pagar; revise a situação.`);
      for (const e of a.linked) {
        linked.add(e);
        add({ id: `expense:${e.id}`, groupId: p.groupId, month: expenseMonth(e, p.month), amount: E.cents(e.amount), label: e.description, paid: e.status === 'Pago' });
      }
      add({ id: p.id, groupId: p.groupId, month: p.month, amount: a.remainder, label: p.description || state.groups.find(g => g.id === p.groupId)?.label || 'Pagamento adicional', paid: p.status === 'paid' });
      if (p.treatment === 'budget') { const r = reports.get(p.groupId); r.programmed += a.effective; r.paid += a.paid; r.future += a.effective - a.paid; }
      else additional += a.effective;
    }
    const expenseIds = new Set();
    for (const e of expenses) {
      if (expenseIds.has(String(e.id))) { const message = 'Há identificadores duplicados nos gastos reais; revise os registros antes de calcular o caixa.'; issues.push(message); warnings.push(message); }
      expenseIds.add(String(e.id));
      if (e.cashTreatment === 'financing') continue;
      if (linked.has(e)) continue;
      if (e.paymentId && !byId.has(e.paymentId)) warnings.push(`Vínculo ${e.paymentId} não encontrado. O gasto “${e.description}” foi preservado e contado uma vez no seu grupo.`);
      if (e.paymentId && byId.has(e.paymentId)) warnings.push(`O grupo do gasto “${e.description}” difere do pagamento vinculado. Revise o vínculo.`);
      const r = reports.get(e.groupId), amount = E.cents(e.amount);
      r.programmed += amount; if (e.status === 'Pago') r.paid += amount; else r.future += amount;
      add({ id: `expense:${e.id}`, groupId: e.groupId, month: expenseMonth(e), amount, label: e.description, paid: e.status === 'Pago' });
    }
    for (const r of groupReports) {
      r.programmed = E.cents(r.programmed); r.paid = E.cents(r.paid); r.future = E.cents(r.future);
      r.difference = E.cents(r.budget - r.programmed);
      paidBudget += r.paid; futureBudget += r.future;
      if (r.difference > 0) warnings.push(`${r.label}: ${r.difference.toFixed(2)} ainda não distribuídos.`);
      if (r.difference < 0) warnings.push(`${r.label}: pagamentos excedem o orçamento em ${(-r.difference).toFixed(2)}.`);
    }
    if (excludedPast.length) warnings.push('Pagamentos já realizados antes do início do fluxo integram o orçamento/pago, mas não são debitados novamente do caixa inicial. Informe patrimônio disponível na data de início.');
    const t = timeline(state);
    if (t.moveMonth < t.automaticMoveMonth) warnings.push('A data de mudança informada precede o fim previsto da obra com atraso; confirme a viabilidade com os profissionais.');
    if (state.budgetSchedule.groups.some(g => g.groupId === 'contingency')) warnings.push('A contingência foi provisionada como saída futura conservadora, não como gasto já realizado. Remova/revise a provisão conforme os riscos forem resolvidos.');
    const programmed = E.cents(paidBudget + futureBudget);
    return { state, payments, events, groupReports, warnings, issues, review, timeline: t,
      totals: { budget: E.cents(b.total), programmed, paid: E.cents(paidBudget), future: E.cents(futureBudget),
        additional: E.cents(additional), difference: E.cents(E.cents(b.total) - programmed),
        pastPaid: total(excludedPast), flowPayments: total(events) } };
  }
  function preserveProtected(current, target) {
    if (!current.budgetSchedule) return target;
    if (!target.budgetSchedule) target.budgetSchedule = defaults();
    for (const g of current.budgetSchedule.groups) {
      const index = target.budgetSchedule.groups.findIndex(t => t.groupId === g.groupId);
      if (g.mode === 'manual') { target.budgetSchedule.groups[index] = clone(g); continue; }
      const to = target.budgetSchedule.groups[index];
      const protectedRows = g.payments.filter(p => protectedPayment(current, g, p));
      if (protectedRows.length) to.source = g.source;
      for (const p of protectedRows) {
        to.payments = to.payments.filter(t => t.id !== p.id); to.payments.push({ ...clone(p), fixed: p.fixed || g.mode === 'manual' });
      }
    }
    for (const event of current.planning.projectPayments) {
      const assignment = current.budgetSchedule.legacyAssignments.find(a => a.eventId === event.id);
      if (!assignment && !current.expenses.some(e => e.paymentId === `legacy:${event.id}`)) continue;
      target.planning.projectPayments = target.planning.projectPayments.filter(e => e.id !== event.id);
      target.planning.projectPayments.push(clone(event));
      if (assignment) {
        target.budgetSchedule.legacyAssignments = target.budgetSchedule.legacyAssignments.filter(a => a.eventId !== event.id);
        target.budgetSchedule.legacyAssignments.push(clone(assignment));
      }
    }
    return target;
  }
  const api = { defaults, validate, budget, timeline, windowFor, synchronize, resolve, allPayments, amounts, protectedPayment, preserveProtected };
  if (typeof module !== 'undefined') module.exports = api;
  root.BudgetScheduler = api;
})(globalThis);
