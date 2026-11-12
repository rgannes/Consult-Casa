/* Motor mensal independente de DOM, armazenamento e serviços externos. Valores em reais. */
(function (root) {
  'use strict';
  const cents = n => {
    if (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER / 100) throw Error('Valor calculado excede a precisão segura em centavos; revise prazo, taxas e valores.');
    return Math.round((n + Number.EPSILON) * 100) / 100;
  };
  const sum = (rows, key) => cents(rows.reduce((s, r) => s + r[key], 0));
  function num(value, name, max = 1e12) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw Error(`${name}: número inválido.`);
  }
  function integer(value, name, min = 0, max = 1200) {
    num(value, name, max); if (!Number.isInteger(value) || value < min) throw Error(`${name}: inteiro inválido.`);
  }
  function option(value, options, name) { if (!options.includes(value)) throw Error(`${name}: opção inválida.`); }
  function bool(value, name) { if (typeof value !== 'boolean') throw Error(`${name}: opção inválida.`); }
  function date(value, allowEmpty = false) {
    if (allowEmpty && value === '') return;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Informe uma data válida (AAAA-MM-DD).');
    const d = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value || d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 2200) throw Error('Data inválida (anos 1900–2200).');
  }
  function addMonths(anchor, offset) {
    date(anchor); integer(offset, 'Deslocamento');
    const [y, m, day] = anchor.split('-').map(Number);
    const last = new Date(Date.UTC(y, m + offset, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 1 + offset, Math.min(day, last))).toISOString().slice(0, 10);
  }
  function monthOffset(start, end) {
    date(start); date(end);
    const a = start.split('-').map(Number), b = end.split('-').map(Number);
    return (b[0] - a[0]) * 12 + b[1] - a[1];
  }
  const rate = annual => Math.expm1(Math.log1p(annual / 100) / 12);
  function payment(balance, i, months) { return i === 0 ? balance / months : balance * i / -Math.expm1(-months * Math.log1p(i)); }
  function eventList(events, name) {
    if (!Array.isArray(events) || events.length > 1200) throw Error(`${name}: lista inválida.`);
    events.forEach(e => { if (!e || typeof e !== 'object') throw Error(`${name}: evento inválido.`); integer(e.month, name, 1); num(e.amount, name); });
  }
  function loanSchedule(input) {
    const o = { annualRate: 0, indexAnnual: 0, insuranceFixed: 0, insurancePercentMonthly: 0,
      fees: 0, upfront: 0, extraMode: 'term', extraPayments: [], construction: null, ...input };
    for (const key of ['principal', 'insuranceFixed', 'fees', 'upfront']) num(o[key], key);
    for (const key of ['annualRate', 'indexAnnual', 'insurancePercentMonthly']) num(o[key], key, 100);
    integer(o.months, 'Prazo de amortização', 1, 600);
    option(o.system, ['SAC', 'Price'], 'Sistema'); option(o.extraMode, ['term', 'payment'], 'Amortização extra');
    date(o.firstDate);
    if (!o.construction) {
      date(o.fundingDate || o.firstDate);
      if (monthOffset(o.fundingDate || o.firstDate, o.firstDate) < 0) throw Error('Crédito não pode ser recebido depois do primeiro vencimento.');
    }
    eventList(o.extraPayments, 'Amortizações extras');
    o.extraPayments = o.extraPayments.map(e => ({ ...e, amount: cents(e.amount) }));
    let start = 1, draws = [], charges = [], capitalize = false;
    if (o.construction) {
      const c = o.construction;
      integer(c.phaseMonths, 'Prazo + atraso de obra', 1, 600);
      integer(c.amortizationStartMonth, 'Início da amortização', 2, 601);
      start = c.amortizationStartMonth;
      if (start <= c.phaseMonths) throw Error('Nesta hipótese, amortização começa após a obra; ajuste a carência.');
      bool(c.capitalizeInterest, 'Capitalizar juros de obra'); capitalize = c.capitalizeInterest;
      eventList(c.draws, 'Liberações'); draws = c.draws.map(d => ({ ...d, amount: cents(d.amount) }));
      if (draws.some(d => d.month >= start || d.month > c.phaseMonths)) throw Error('Liberações devem ocorrer durante a obra e antes da amortização.');
      if (cents(draws.reduce((s, d) => s + d.amount, 0)) > cents(o.principal)) throw Error('Liberações excedem o crédito contratado.');
      if (!Array.isArray(c.charges) || c.charges.length > 200) throw Error('Encargos de obra inválidos.');
      charges = c.charges;
      charges.forEach(e => { integer(e.startMonth, 'Início do encargo', 1); integer(e.endMonth, 'Fim do encargo', e.startMonth); num(e.amount, 'Encargo'); });
      charges = charges.map(e => ({ ...e, amount: cents(e.amount) }));
      if (o.extraPayments.some(e => e.month < start)) throw Error('Amortizações extras são suportadas apenas após o início da amortização regular.');
    }
    const maxMonths = start - 1 + o.months;
    if (o.extraPayments.some(e => e.month > maxMonths)) throw Error('Amortização extra fora do prazo contratual.');
    const disbursed = cents(o.construction ? draws.reduce((s, d) => s + d.amount, 0) : o.principal);
    const funding = o.construction ? draws.filter(d => d.amount > 0).map(d => ({ date: addMonths(o.firstDate, d.month - 1), amount: cents(d.amount) })) :
      disbursed ? [{ date: o.fundingDate || o.firstDate, amount: disbursed }] : [];
    funding.sort((a, b) => a.date.localeCompare(b.date));
    const rows = [], warnings = [];
    if (o.construction && disbursed < cents(o.principal)) warnings.push('Parte do crédito contratado não foi programada para liberação; não foi inventado um desembolso restante.');
    let balance = o.construction ? 0 : disbursed, scheduled = 0, initialized = false;
    const i = rate(o.annualRate), k = rate(o.indexAnnual);
    if (disbursed > 0) for (let month = 1; month <= maxMonths; month++) {
      const openingBalance = balance;
      const draw = cents(draws.filter(d => d.month === month).reduce((s, d) => s + d.amount, 0));
      const correction = cents((balance + draw) * k);
      balance = cents(balance + draw + correction);
      const interest = cents(balance * i);
      const amortizing = month >= start;
      const capitalizedInterest = !amortizing && capitalize ? interest : 0;
      const interestPaid = cents(interest - capitalizedInterest);
      const insurance = balance > 0 ? cents(o.insuranceFixed + balance * o.insurancePercentMonthly / 100) : 0;
      const fees = balance > 0 ? cents(o.fees) : 0;
      const constructionCharges = cents(charges.filter(e => month >= e.startMonth && month <= e.endMonth).reduce((s, e) => s + e.amount, 0));
      balance = cents(balance + capitalizedInterest);
      let amortization = 0;
      const installmentNumber = amortizing ? month - start + 1 : 0;
      if (amortizing) {
        const remaining = o.months - installmentNumber + 1;
        if (!initialized) { scheduled = o.system === 'SAC' ? balance / remaining : payment(balance, i, remaining); initialized = true; }
        else scheduled *= 1 + k;
        amortization = installmentNumber === o.months ? balance : Math.min(balance, cents(Math.max(0, o.system === 'SAC' ? scheduled : scheduled - interest)));
      }
      balance = cents(balance - amortization);
      const requestedExtra = cents(o.extraPayments.filter(e => e.month === month).reduce((s, e) => s + e.amount, 0));
      const extra = Math.min(balance, requestedExtra);
      balance = cents(balance - extra);
      if (requestedExtra > extra) warnings.push(`Mês ${month}: amortização extra limitada ao saldo após amortização regular.`);
      const installment = cents(amortization + interestPaid + insurance + fees + constructionCharges);
      rows.push({ month, installmentNumber, date: addMonths(o.firstDate, month - 1),
        phase: amortizing ? 'amortização' : 'obra/carência', openingBalance, draw, correction,
        interest, interestPaid, capitalizedInterest, amortization, insurance, fees, constructionCharges,
        installment, extra, totalPayment: cents(installment + extra), closingBalance: balance });
      if (extra > 0 && o.extraMode === 'payment' && balance > 0) {
        const remaining = o.months - installmentNumber;
        scheduled = o.system === 'SAC' ? balance / remaining : payment(balance, i, remaining);
      }
      if (amortizing && balance === 0) break;
    }
    const totals = { disbursed, interest: sum(rows, 'interest'), interestPaid: sum(rows, 'interestPaid'),
      capitalizedInterest: sum(rows, 'capitalizedInterest'), correction: sum(rows, 'correction'),
      amortization: sum(rows, 'amortization'), extra: sum(rows, 'extra'), insurance: sum(rows, 'insurance'),
      fees: sum(rows, 'fees'), constructionCharges: sum(rows, 'constructionCharges'), upfront: disbursed ? cents(o.upfront) : 0,
      closingBalance: balance, installments: rows.filter(r => r.installmentNumber > 0).length,
      lastDate: rows.at(-1)?.date || null };
    totals.charges = cents(totals.insurance + totals.fees + totals.constructionCharges + totals.upfront);
    totals.nominalOutflow = cents(sum(rows, 'totalPayment') + totals.upfront);
    totals.financingCost = cents(totals.nominalOutflow - disbursed);
    if (o.extraPayments.some(e => e.month > (rows.at(-1)?.month || 0) && e.amount > 0)) warnings.push('Amortizações agendadas após a quitação não foram cobradas.');
    return { rows, totals, funding, upfrontDate: funding[0]?.date || o.firstDate, warnings };
  }
  function limits({ grossIncome, bankPercent, comfortablePayment, monthlyCapacity = 0, minimumSavings = 0, recurringPayment = 0, closingCash = 0 }) {
    for (const [key, value] of Object.entries({ grossIncome, comfortablePayment, minimumSavings, recurringPayment })) num(value, key);
    num(bankPercent, 'Comprometimento bancário', 100);
    if (!Number.isFinite(monthlyCapacity) || !Number.isFinite(closingCash)) throw Error('Caixa inválido.');
    const bankLimit = cents(grossIncome * bankPercent / 100);
    const planningLimit = Math.min(bankLimit, comfortablePayment);
    const cashCapacity = cents(Math.max(0, monthlyCapacity - minimumSavings));
    return { bankLimit, familyLimit: comfortablePayment, planningLimit, cashCapacity,
      sustainableLimit: Math.min(planningLimit, cashCapacity),
      withinPlanning: recurringPayment <= planningLimit, withinMonthlyCash: recurringPayment + minimumSavings <= monthlyCapacity,
      hasCash: closingCash >= 0, approval: false };
  }
  function cashFlow(input) {
    const o = { loans: [], events: [], help: { enabled: false, amount: 0, date: '' },
      mode: 'savings', monthlySavings: 0, income: 0, baseExpenses: 0, additionalExpenses: 0,
      additionalFromMonth: 1, rent: 0, rentIncludedInBase: true, rentEndMonth: 0,
      projectStartMonth: 1, moveMonth: 2, minMonths: 1, ...input };
    date(o.startDate); option(o.mode, ['savings', 'income'], 'Base do fluxo'); bool(o.rentIncludedInBase, 'Aluguel incluído');
    for (const key of ['initialCash', 'monthlySavings', 'income', 'baseExpenses', 'additionalExpenses', 'rent']) num(o[key], key);
    if (o.mode === 'income' && o.rentIncludedInBase && o.baseExpenses < o.rent) throw Error('Aluguel marcado como incluído excede as despesas da base de renda.');
    for (const key of ['additionalFromMonth', 'projectStartMonth', 'moveMonth', 'minMonths']) integer(o[key], key, 1);
    integer(o.rentEndMonth, 'Fim do aluguel');
    if (o.moveMonth <= o.projectStartMonth) throw Error('Mudança deve ocorrer após o início do projeto.');
    if (o.rentEndMonth === 0) o.rentEndMonth = o.moveMonth - 1;
    bool(o.help.enabled, 'Ajuda familiar'); num(o.help.amount, 'Ajuda familiar'); date(o.help.date, !o.help.enabled || o.help.amount === 0);
    eventList(o.events, 'Pagamentos do projeto');
    o.events = o.events.map(e => ({ ...e, amount: cents(e.amount) }));
    const monthly = new Map();
    const at = month => { if (!monthly.has(month)) monthly.set(month, { funding: 0, installments: 0, extra: 0, upfront: 0 }); return monthly.get(month); };
    function index(d) { const m = monthOffset(o.startDate, d) + 1; integer(m, 'Evento anterior ao início da simulação', 1); return m; }
    let months = Math.max(o.minMonths, o.moveMonth, ...o.events.map(e => e.month));
    for (const loan of o.loans) {
      for (const f of loan.funding) { const m = index(f.date); at(m).funding += f.amount; months = Math.max(months, m); }
      for (const row of loan.rows) { const m = index(row.date); at(m).installments += row.installment; at(m).extra += row.extra; months = Math.max(months, m); }
      if (loan.totals.upfront) { const m = index(loan.upfrontDate); at(m).upfront += loan.totals.upfront; months = Math.max(months, m); }
    }
    const helpMonth = o.help.enabled && o.help.amount > 0 ? index(o.help.date) : 0;
    months = Math.max(months, helpMonth, o.rentEndMonth);
    integer(months, 'Horizonte final', 1);
    let balance = cents(o.initialCash), minimumBalance = balance;
    const rows = [];
    for (let month = 1; month <= months; month++) {
      const openingCash = balance;
      const baseIncome = o.mode === 'savings' ? o.monthlySavings : o.income;
      const baselineExpenses = o.mode === 'savings' ? 0 : o.baseExpenses;
      const rent = !o.rentIncludedInBase && month <= o.rentEndMonth ? o.rent : 0;
      const rentReleased = o.rentIncludedInBase && month > o.rentEndMonth ? o.rent : 0;
      const additionalExpenses = month >= o.additionalFromMonth ? o.additionalExpenses : 0;
      const help = month === helpMonth ? o.help.amount : 0;
      const payments = o.events.filter(e => e.month === month);
      const projectPayments = cents(payments.filter(e => e.kind !== 'construction').reduce((s, e) => s + e.amount, 0));
      const constructionPayments = cents(payments.filter(e => e.kind === 'construction').reduce((s, e) => s + e.amount, 0));
      const debt = at(month);
      const monthlyCapacity = cents(baseIncome - baselineExpenses + rentReleased - rent - additionalExpenses);
      balance = cents(balance + monthlyCapacity + help + debt.funding - projectPayments - constructionPayments - debt.installments - debt.extra - debt.upfront);
      minimumBalance = Math.min(minimumBalance, balance);
      const row = { month, date: addMonths(o.startDate, month - 1),
        phase: month < o.projectStartMonth ? 'antes do projeto' : month < o.moveMonth ? 'obra/projeto' : 'após mudança',
        openingCash, baseIncome, baselineExpenses, rent, rentReleased, additionalExpenses, help,
        funding: cents(debt.funding), projectPayments, constructionPayments,
        installments: cents(debt.installments), extra: cents(debt.extra), upfront: cents(debt.upfront), monthlyCapacity, closingCash: balance };
      if (o.limitInputs) row.limits = limits({ ...o.limitInputs, monthlyCapacity, recurringPayment: row.installments, closingCash: balance });
      rows.push(row);
    }
    return { rows, totals: { initialCash: cents(o.initialCash), closingCash: balance, minimumBalance,
      additionalCapital: cents(Math.max(0, -minimumBalance)), firstNegativeMonth: rows.find(r => r.closingCash < 0)?.month || null,
      help: sum(rows, 'help'), funding: sum(rows, 'funding'), installments: sum(rows, 'installments'), extra: sum(rows, 'extra'),
      projectPayments: sum(rows, 'projectPayments'), constructionPayments: sum(rows, 'constructionPayments') } };
  }
  const loanColumns = [ ['month', 'Mês contratual'], ['installmentNumber', 'Parcela'], ['date', 'Data'], ['phase', 'Fase'],
    ['openingBalance', 'Saldo inicial'], ['draw', 'Liberação'], ['correction', 'Correção monetária'], ['interest', 'Juros'],
    ['capitalizedInterest', 'Juros capitalizados'], ['amortization', 'Amortização'], ['insurance', 'Seguros'], ['fees', 'Taxas'],
    ['constructionCharges', 'Outros encargos de obra'], ['installment', 'Prestação recorrente'], ['extra', 'Amortização extraordinária'],
    ['totalPayment', 'Prestação total com extra'], ['closingBalance', 'Saldo final'] ];
  const cashColumns = [['month', 'Mês'], ['date', 'Data'], ['phase', 'Fase'], ['openingCash', 'Caixa inicial'],
    ['baseIncome', 'Poupança líquida OU receita'], ['baselineExpenses', 'Despesas da base de renda'], ['rent', 'Aluguel adicional'],
    ['rentReleased', 'Aluguel liberado da base'], ['additionalExpenses', 'Despesas adicionais'], ['help', 'Ajuda recebida'],
    ['funding', 'Crédito liberado'], ['projectPayments', 'Despesas do projeto'], ['constructionPayments', 'Pagamentos de obra'],
    ['installments', 'Prestações recorrentes'], ['extra', 'Amortizações extras'], ['upfront', 'Encargos iniciais'], ['closingCash', 'Caixa final']];
  function csv(rows, columns) {
    const cell = value => {
      let v = typeof value === 'number' ? value.toFixed(2).replace('.', ',') : String(value ?? '');
      if (/^[=+@\-]/.test(v) && typeof value !== 'number') v = "'" + v;
      return '"' + v.replace(/"/g, '""') + '"';
    };
    return '\ufeff' + [columns.map(([, label]) => cell(label)).join(';'), ...rows.map(r => columns.map(([key]) => cell(r[key])).join(';'))].join('\n');
  }
  function annualSummary(rows, type = 'loan') {
    option(type, ['loan', 'cash'], 'Resumo');
    const opening = type === 'loan' ? 'openingBalance' : 'openingCash', closing = type === 'loan' ? 'closingBalance' : 'closingCash';
    const keys = (type === 'loan' ? loanColumns : cashColumns).map(([key]) => key).filter(k => !['month', 'installmentNumber', 'date', 'phase', opening, closing].includes(k));
    const years = new Map();
    for (const row of rows) {
      const year = row.date.slice(0, 4);
      if (!years.has(year)) years.set(year, { year, date: year, phase: 'resumo anual', count: 0, [opening]: row[opening], ...Object.fromEntries(keys.map(k => [k, 0])) });
      const annual = years.get(year); annual.count++; annual[closing] = row[closing];
      if (type === 'cash') annual.minimumCash = Math.min(annual.minimumCash ?? row.openingCash, row.closingCash);
      keys.forEach(k => { annual[k] = cents(annual[k] + row[k]); });
    }
    return [...years.values()];
  }
  const api = { cents, addMonths, monthOffset, loanSchedule, limits, cashFlow, annualSummary, csv, loanColumns, cashColumns };
  if (typeof module !== 'undefined') module.exports = api;
  root.FinancialEngine = api;
})(globalThis);
