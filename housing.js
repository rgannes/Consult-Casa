/* Quatro caminhos, CET global hipotético e um único patrimônio familiar. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' ? require('./simulation') : root.FinancialEngine;
  const B = typeof module !== 'undefined' ? require('./budget-schedule') : root.BudgetScheduler;
  const PATHS = {
    buyThenBuild: 'Comprar o apartamento atual e depois construir a casa',
    rentBuild: 'Construir a casa enquanto continuam de aluguel',
    buyThenUpgrade: 'Comprar o apartamento atual e depois trocar por um maior',
    buyLarger: 'Comprar diretamente um apartamento maior'
  };
  const clone = v => JSON.parse(JSON.stringify(v));
  const sum = (rows, key) => E.cents(rows.reduce((s, r) => s + r[key], 0));
  function todayMonth() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-01`;
  }
  function profile(source, build = false) {
    return { entry: null, credit: null, months: source.months ?? 420, cet: source.annual ?? 11,
      system: source.system || 'SAC', buildMonths: Math.min(599, (source.planning?.constructionMonths || 12) + (source.planning?.constructionDelay || 0)),
      extraAmount: 0, extraMonth: build ? Math.min(600, (source.planning?.constructionMonths || 12) + (source.planning?.constructionDelay || 0) + 1) : 12, extraMode: 'term' };
  }
  function defaults(source = {}) {
    return { version: 1, selectedPath: source.planning?.selectedPath || 'rentBuild',
      startDate: source.planning?.startDate || (source.reference ? source.reference.slice(0, 7) + '-01' : todayMonth()),
      cashBaseline: { income: source.income || 0, expenses: source.essential || 0, savings: source.monthlySavings || 0 },
      paths: {
        buyThenBuild: { first: profile(source), second: profile(source, true), stage2Month: 25, buyCosts: 0,
          sell: false, saleMonth: null, salePrice: null, saleCosts: 0 },
        rentBuild: { second: profile(source, true), stage2Month: 1 },
        buyThenUpgrade: { first: profile(source), second: profile(source), stage2Month: 25, buyCosts: 0,
          secondBuyCosts: 0, salePrice: null, saleCosts: 0 },
        buyLarger: { second: profile(source), buyCosts: 0 }
      } };
  }
  function normalize(state) {
    if (!state.housing) state.housing = defaults(state);
    if (state.bankPercent === undefined) state.bankPercent = state.planning?.bankPercent ?? 30;
    if (state.comfortablePayment === undefined) state.comfortablePayment = state.planning?.comfortablePayment ?? 0;
    if (state.rent === undefined) state.rent = state.planning?.rent ?? 0;
    if (state.rentIncludedInExpenses === undefined) state.rentIncludedInExpenses = state.planning?.rentIncludedInBase ?? true;
    const baseline = state.housing.cashBaseline;
    if (baseline && baseline.savings !== state.monthlySavings) state.housing.cashBaseline = {
      income: state.income, expenses: state.essential, savings: state.monthlySavings };
    return state;
  }
  function number(v, name, max = 1e12) { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) throw Error(`${name}: valor inválido.`); }
  function month(v, name, max = 1200) { number(v, name, max); if (!Number.isInteger(v) || v < 1) throw Error(`${name}: use meses inteiros positivos.`); }
  function validate(state) {
    const h = state.housing;
    if (!h || h.version !== 1 || !Object.hasOwn(PATHS, h.selectedPath)) throw Error('Caminho imobiliário inválido.');
    E.monthOffset(h.startDate, h.startDate);
    for (const key of ['income', 'expenses', 'savings']) number(h.cashBaseline?.[key], 'Referência de poupança');
    number(state.bankPercent, 'Percentual bancário', 100); number(state.comfortablePayment, 'Prestação confortável'); number(state.rent, 'Aluguel');
    if (typeof state.rentIncludedInExpenses !== 'boolean') throw Error('Inclusão do aluguel inválida.');
    if (!h.paths || typeof h.paths !== 'object') throw Error('Configurações dos caminhos ausentes.');
    for (const id of Object.keys(PATHS)) {
      const p = h.paths[id]; if (!p || typeof p !== 'object') throw Error('Configuração do caminho ausente.');
      for (const which of ['first', 'second']) if (which === 'second' || id === 'buyThenBuild' || id === 'buyThenUpgrade') {
        const loan = p[which]; if (!loan) throw Error('Financiamento ausente.');
        for (const key of ['entry', 'credit']) if (loan[key] !== null) number(loan[key], key);
        number(loan.cet, 'CET hipotético', 100); month(loan.months, 'Prazo', 600); month(loan.buildMonths, 'Prazo de obra', 599);
        number(loan.extraAmount, 'Amortização extra'); month(loan.extraMonth, 'Mês da extra', 600);
        if (!['SAC', 'Price'].includes(loan.system) || !['term', 'payment'].includes(loan.extraMode)) throw Error('Amortização inválida.');
      }
      if (id !== 'buyLarger') month(p.stage2Month, 'Início da etapa');
      if (['buyThenBuild', 'buyThenUpgrade'].includes(id) && p.stage2Month < 2) throw Error('A segunda etapa deve começar a partir do mês 2.');
      const requiredCosts = id === 'rentBuild' ? [] : id === 'buyThenUpgrade' ? ['buyCosts', 'secondBuyCosts', 'saleCosts'] : id === 'buyThenBuild' ? ['buyCosts', 'saleCosts'] : ['buyCosts'];
      for (const key of requiredCosts) number(p[key], 'Custos de transação');
      if (['buyThenBuild', 'buyThenUpgrade'].includes(id) && p.salePrice === undefined) throw Error('Referência de venda ausente.');
      if (p.salePrice !== undefined && p.salePrice !== null) number(p.salePrice, 'Preço de venda');
      if (id === 'buyThenBuild') {
        if (typeof p.sell !== 'boolean') throw Error('Opção de venda inválida.');
        if (p.saleMonth !== null) { month(p.saleMonth, 'Mês da venda'); if (p.saleMonth < 2) throw Error('Venda a partir do mês 2.'); }
      }
    }
    return state;
  }
  function capacity(state) {
    const b = state.housing.cashBaseline;
    // A parcela do saldo renda-despesa não declarada como poupança continua comprometida.
    const unallocated = Math.max(0, b.income - b.expenses - b.savings);
    return E.cents(Math.min(state.income - state.essential, state.income - state.essential - unallocated));
  }
  function amounts(cost, entry, credit, available, extraCosts = 0) {
    if (entry !== null && entry > cost) throw Error('A entrada não pode superar o custo a financiar.');
    const chosenEntry = entry === null ? E.cents(Math.min(cost, Math.max(0, available - extraCosts))) : E.cents(entry);
    const principal = credit === null ? E.cents(Math.max(0, cost - chosenEntry)) : E.cents(credit);
    if (principal > E.cents(cost)) throw Error('O financiamento não pode superar o custo desta aquisição/etapa.');
    return { entry: E.cents(cost - principal), principal, requestedEntry: chosenEntry, adjusted: credit !== null };
  }
  function split(amount, months) {
    const c = Math.round(amount * 100), q = Math.floor(c / months), rest = c % months;
    return Array.from({ length: months }, (_, i) => (q + (i < rest ? 1 : 0)) / 100);
  }
  function loan(profile, principal, startDate, startMonth, build = false) {
    if (build && principal > 0 && profile.months <= profile.buildMonths) throw Error('O prazo total do financiamento deve ser maior que o tempo de obra e regularização.');
    const amortizationMonths = build ? Math.max(1, profile.months - profile.buildMonths) : profile.months;
    if (profile.extraAmount > 0 && profile.extraMonth > profile.months) throw Error('A amortização extra está após o prazo do financiamento.');
    if (build && profile.extraAmount > 0 && profile.extraMonth <= profile.buildMonths) throw Error(`A amortização extra deve ocorrer após a obra, a partir do mês ${profile.buildMonths + 1} do financiamento.`);
    const firstDate = E.addMonths(startDate, build ? startMonth - 1 : startMonth);
    const extras = profile.extraAmount > 0 ? [{ month: profile.extraMonth, amount: profile.extraAmount }] : [];
    return E.loanSchedule({ principal, annualRate: profile.cet, months: amortizationMonths, system: profile.system,
      firstDate, fundingDate: E.addMonths(startDate, startMonth - 1),
      fees: 0, upfront: 0, insuranceFixed: 0, insurancePercentMonthly: 0, indexAnnual: 0,
      extraMode: profile.extraMode, extraPayments: extras,
      construction: build ? { phaseMonths: profile.buildMonths, amortizationStartMonth: profile.buildMonths + 1, capitalizeInterest: false,
        draws: split(principal, profile.buildMonths).map((amount, i) => ({ month: i + 1, amount })), charges: [] } : null });
  }
  function settle(result, saleMonth, startDate) {
    const r = clone(result);
    r.rows = r.rows.filter(row => E.monthOffset(startDate, row.date) + 1 <= saleMonth);
    let outstanding = r.rows.at(-1)?.closingBalance ?? r.totals.disbursed;
    outstanding = E.cents(outstanding);
    if (outstanding > 0) {
      const date = E.addMonths(startDate, saleMonth - 1);
      let row = r.rows.find(row => row.date.slice(0, 7) === date.slice(0, 7));
      if (!row) {
        row = { month: saleMonth, installmentNumber: 0, date, phase: 'quitação na venda', openingBalance: outstanding,
          draw: 0, correction: 0, interest: 0, interestPaid: 0, capitalizedInterest: 0, amortization: 0,
          insurance: 0, fees: 0, constructionCharges: 0, installment: 0, extra: 0, totalPayment: 0, closingBalance: outstanding };
        r.rows.push(row);
      }
      row.extra = E.cents(row.extra + outstanding); row.totalPayment = E.cents(row.totalPayment + outstanding); row.closingBalance = 0;
      row.phase = 'parcela e quitação na venda'; row.saleSettlement = outstanding;
    }
    for (const key of ['interest', 'interestPaid', 'capitalizedInterest', 'correction', 'amortization', 'extra', 'insurance', 'fees', 'constructionCharges']) r.totals[key] = sum(r.rows, key);
    r.totals.nominalOutflow = E.cents(sum(r.rows, 'totalPayment') + r.totals.upfront);
    r.totals.financingCost = E.cents(r.totals.nominalOutflow - r.totals.disbursed);
    r.totals.closingBalance = r.rows.at(-1)?.closingBalance || 0;
    r.totals.lastDate = r.rows.at(-1)?.date || null;
    r.totals.installments = r.rows.filter(row => row.installmentNumber > 0).length;
    return { result: r, outstanding };
  }
  function calculate(input) {
    const state = validate(normalize(clone(input))), h = state.housing, p = h.paths[h.selectedPath];
    const buildPath = ['buyThenBuild', 'rentBuild'].includes(h.selectedPath), twoStages = ['buyThenBuild', 'buyThenUpgrade'].includes(h.selectedPath);
    const warnings = [], stages = [], loans = [], events = [], sales = [];
    const reserveDeduction = state.reserveAlreadyExcluded ? 0 : state.preservedReserve;
    const initial = E.cents(Math.max(0, state.cash - reserveDeduction) + (state.includeFamilyHelp ? state.familyHelp : 0));
    const base = capacity(state), moveMonth = buildPath ? p.stage2Month + p.second.buildMonths : h.selectedPath === 'buyThenUpgrade' ? p.stage2Month : 1;
    const saleMonth = h.selectedPath === 'buyThenBuild' && p.sell ? (p.saleMonth === null ? moveMonth : p.saleMonth) : null;
    const isRenting = month => h.selectedPath === 'rentBuild' ? month < moveMonth : saleMonth !== null && month >= saleMonth && month < moveMonth;
    if (state.includeFamilyHelp) warnings.push('A ajuda familiar entra no início apenas como hipótese e depende de confirmação, inclusive de uso neste caminho.');
    if (state.cash < reserveDeduction) warnings.push('O patrimônio informado é insuficiente para separar toda a reserva.');
    if (state.monthlySavings > Math.max(0, state.income - state.essential)) warnings.push('A poupança informada supera renda menos despesas. Usamos uma capacidade menor e conservadora; revise Premissas.');
    if (state.rentIncludedInExpenses && state.rent > state.essential) warnings.push('O aluguel indicado como incluído supera as despesas totais. Revise Premissas; a liberação do aluguel foi limitada às despesas.');
    const rent = state.rentIncludedInExpenses ? Math.min(state.rent, state.essential) : state.rent;
    const contribution = month => E.cents(base + (state.rentIncludedInExpenses ? (!isRenting(month) ? rent : 0) : (isRenting(month) ? -rent : 0)));
    const index = date => E.monthOffset(h.startDate, date) + 1;
    const caches = new WeakMap();
    function indexed(result) {
      if (caches.has(result)) return caches.get(result);
      const byMonth = new Map(), funding = new Map(), monthRows = [];
      for (const row of result.rows) {
        const m = index(row.date); if (!byMonth.has(m)) byMonth.set(m, []);
        byMonth.get(m).push(row); monthRows.push(m);
      }
      for (const f of result.funding) { const m = index(f.date); funding.set(m, E.cents((funding.get(m) || 0) + f.amount)); }
      const data = { byMonth, funding, monthRows }; caches.set(result, data); return data;
    }
    const available = (month, extraEvents = []) => {
      let cash = initial;
      for (let m = 1; m <= month; m++) {
        cash += contribution(m);
        cash += sales.filter(s => s.month === m).reduce((sum, s) => sum + s.gross, 0);
        cash -= [...events, ...extraEvents].filter(e => e.month === m).reduce((sum, e) => sum + e.amount, 0);
        for (const l of loans) {
          cash += indexed(l.result).funding.get(m) || 0;
          cash -= (indexed(l.result).byMonth.get(m) || []).reduce((s, r) => s + r.totalPayment, 0);
        }
      }
      return E.cents(cash);
    };
    function purchase(id, label, price, costs, profile, startMonth) {
      if (price <= 0) throw Error(`Preencha o valor de referência do ${id === 'first' ? 'apartamento atual' : 'apartamento maior'} em Premissas.`);
      const funding = amounts(price, profile.entry, profile.credit, available(startMonth), costs);
      const result = loan(profile, funding.principal, h.startDate, startMonth);
      loans.push({ id, result });
      events.push({ id: `purchase:${id}`, stage: id, month: startMonth, amount: E.cents(price + costs), label: 'Compra e custos de aquisição' });
      stages.push({ id, label, startMonth, moveMonth: startMonth, cost: price, additionalCosts: costs, funding, profile: clone(profile), build: false });
      if (costs === 0) warnings.push(`${label}: custos de compra estão zerados; inclua documentação, impostos e demais despesas aplicáveis.`);
    }
    function sellApartment(month) {
      const gross = E.cents(p.salePrice === null ? state.currentApartment : p.salePrice), fee = E.cents(p.saleCosts);
      if (gross <= 0) throw Error('Informe o preço de venda do apartamento atual.');
      const first = loans.find(l => l.id === 'first');
      const settled = settle(first.result, month, h.startDate); first.result = settled.result;
      const sale = { month, gross, costs: fee, payoff: settled.outstanding, net: E.cents(gross - fee - settled.outstanding) };
      sales.push(sale); events.push({ id: 'sale-costs', stage: 'second', month, amount: fee, label: 'Custos da venda' });
      if (fee === 0) warnings.push('Custos da venda zerados: confirme corretagem, tributos e demais despesas aplicáveis.');
      if (sale.net < 0) warnings.push('A venda não cobre a quitação e as despesas; a diferença sai do caixa familiar.');
      warnings.push('A venda quita o saldo após a parcela do mês, sem multas ou juros diários. Confirme os valores de liquidação com o banco.');
    }
    if (twoStages) {
      purchase('first', 'Etapa 1 · Apartamento atual', state.currentApartment, p.buyCosts, p.first, 1);
      if (h.selectedPath === 'buyThenUpgrade') sellApartment(p.stage2Month);
      else if (p.sell) sellApartment(p.saleMonth === null ? moveMonth : p.saleMonth);
    }
    if (buildPath) {
      const copy = clone(state), shift = p.stage2Month - state.planning.projectStartMonth;
      copy.planning.startDate = h.startDate; copy.planning.projectStartMonth = p.stage2Month;
      copy.planning.constructionMonths = p.second.buildMonths; copy.planning.constructionDelay = 0;
      copy.budgetSchedule.landMonth = Math.max(1, copy.budgetSchedule.landMonth + shift);
      copy.budgetSchedule.moveDate = '';
      const schedule = B.resolve(copy);
      if (schedule.review.length || schedule.issues.length) throw Error('Há pagamentos antigos que precisam de revisão em Orçamento → Cronogramas cadastrados. Os dados foram preservados.');
      warnings.push(...schedule.warnings);
      const beforeBuild = schedule.events.filter(e => e.month < p.stage2Month);
      const financingCost = sum(schedule.events.filter(e => e.month >= p.stage2Month), 'amount');
      const funding = amounts(financingCost, p.second.entry, p.second.credit, available(p.stage2Month, beforeBuild));
      const result = loan(p.second, funding.principal, h.startDate, p.stage2Month, true);
      loans.push({ id: 'second', result });
      events.push(...schedule.events.map(e => ({ ...e, stage: 'second' })));
      stages.push({ id: 'second', label: twoStages ? 'Etapa 2 · Construção da casa' : 'Construção da casa', startMonth: Math.min(p.stage2Month, ...schedule.events.map(e => e.month)),
        constructionStart: p.stage2Month, moveMonth, cost: schedule.totals.budget, additionalCosts: schedule.totals.additional, funding,
        profile: clone(p.second), build: true, schedule });
      warnings.push('Encargos de obra aproximados: o crédito é liberado em partes iguais, com a taxa global hipotética. O CET não permite reproduzir precisamente seguros, tarifas e juros contratuais.');
      if (beforeBuild.length) warnings.push('Cronogramas reais/protegidos anteriores ao início da obra foram mantidos. Confira as datas em Orçamento.');
      if (state.planning.fee || state.planning.upfront || state.planning.index || state.planning.constructionCharges.length) warnings.push('Parâmetros técnicos antigos foram preservados no backup, mas não são somados à taxa global deste modelo simplificado.');
    } else purchase('second', twoStages ? 'Etapa 2 · Apartamento maior' : 'Apartamento maior', state.largerApartment,
      twoStages ? p.secondBuyCosts : p.buyCosts, p.second, twoStages ? p.stage2Month : 1);
    let months = Math.max(12, state.horizonMonths, moveMonth, ...events.map(e => e.month), ...sales.map(e => e.month));
    for (const l of loans) months = Math.max(months, ...indexed(l.result).monthRows);
    if (months > 1200) throw Error('O caminho excede o horizonte de 1200 meses.');
    const rows = [], latestBalances = new Map(); let cash = initial, minimumCash = cash;
    const limit = Math.min((state.grossIncome1 + state.grossIncome2) * state.bankPercent / 100, state.comfortablePayment);
    for (let month = 1; month <= months; month++) {
      const openingCash = cash, baseCapacity = contribution(month), byStage = {};
      let funding = 0, debtPayment = 0, recurring = 0, debtBalance = 0;
      for (const s of stages) {
        const l = loans.find(l => l.id === s.id);
        const current = indexed(l.result).byMonth.get(month) || [];
        const debt = E.cents(current.reduce((sum, r) => sum + r.totalPayment, 0));
        const installment = E.cents(current.reduce((sum, r) => sum + r.installment, 0));
        const draw = indexed(l.result).funding.get(month) || 0;
        if (current.length) latestBalances.set(s.id, current.at(-1).closingBalance);
        const outstanding = latestBalances.get(s.id) ?? (month >= s.startMonth && !s.build ? s.funding.principal : 0);
        const project = E.cents(events.filter(e => e.stage === s.id && e.month === month).reduce((sum, e) => sum + e.amount, 0));
        const phase = s.build ? month < s.constructionStart ? 'Preparação / pagamentos já definidos' : month < s.moveMonth ? 'Obra e regularização · encargos estimados' : outstanding > 0 ? 'Casa pronta · prestação completa' : 'Casa pronta · sem dívida' :
          month === s.startMonth ? 'Compra do apartamento' : (sales.some(sale => sale.month === month) && s.id === 'first') ? 'Venda e quitação do saldo' : outstanding > 0 ? 'Pagamento do apartamento' : (isRenting(month) && s.id === 'first') ? 'Apartamento vendido · aguardando a casa' : 'Sem dívida nesta etapa';
        byStage[s.id] = { phase, housing: project, debt, recurring: installment, funding: draw, balance: outstanding };
        funding += draw; debtPayment += debt; recurring += installment; debtBalance += outstanding;
      }
      const housing = E.cents(events.filter(e => e.month === month).reduce((sum, e) => sum + e.amount, 0));
      const saleGross = E.cents(sales.filter(s => s.month === month).reduce((sum, s) => sum + s.gross, 0));
      cash = E.cents(cash + baseCapacity + funding + saleGross - housing - debtPayment);
      minimumCash = Math.min(minimumCash, cash);
      const activePhases = stages.filter(s => month >= s.startMonth && (s.id === 'second' || !twoStages || month < p.stage2Month || byStage[s.id].balance > 0 || byStage[s.id].debt > 0)).map(s => `${s.label}: ${byStage[s.id].phase}`);
      rows.push({ month, date: E.addMonths(h.startDate, month - 1), phase: activePhases.join(' + ') || 'Antes da próxima etapa',
        openingCash, capacity: baseCapacity, projectPayments: housing, financing: E.cents(debtPayment), recurring: E.cents(recurring),
        rental: isRenting(month) ? rent : 0, totalHousing: E.cents(housing + debtPayment + (isRenting(month) ? rent : 0)), funding: E.cents(funding), saleGross, closingCash: cash, debtBalance: E.cents(debtBalance),
        savingPossible: E.cents(Math.max(0, baseCapacity - housing - debtPayment)),
        wealthWithdrawal: E.cents(Math.max(0, openingCash - cash)), regularSaving: E.cents(baseCapacity - recurring),
        cashShortage: cash < 0, excessivePayment: recurring > limit + .001 || baseCapacity - recurring < 0, byStage });
    }
    for (const s of stages) {
      const l = loans.find(l => l.id === s.id);
      const lastDebt = Math.max(s.startMonth, ...indexed(l.result).monthRows);
      const sale = sales.find(() => s.id === 'first');
      s.endMonth = Math.max(lastDebt, s.moveMonth, ...events.filter(e => e.stage === s.id).map(e => e.month), s.id === 'first' && twoStages ? Math.max(sale ? sale.month : 1, p.stage2Month - 1) : 1);
      s.rows = rows.filter(r => r.month >= s.startMonth && r.month <= s.endMonth).map(r => ({ ...r, ...r.byStage[s.id], phase: r.byStage[s.id].phase,
        stageHousing: E.cents(r.byStage[s.id].housing + (s.id === (h.selectedPath === 'rentBuild' || (h.selectedPath === 'buyThenBuild' && r.month >= p.stage2Month) ? 'second' : 'first') ? r.rental : 0)), stageFinancing: r.byStage[s.id].debt, stageTotal: E.cents(r.byStage[s.id].housing + r.byStage[s.id].debt + (s.id === (h.selectedPath === 'rentBuild' || (h.selectedPath === 'buyThenBuild' && r.month >= p.stage2Month) ? 'second' : 'first') ? r.rental : 0)) }));
    }
    for (const l of loans) warnings.push(...l.result.warnings);
    const allDebtRows = loans.flatMap(l => l.result.rows);
    const projectPayments = sum(events, 'amount'), debtPayments = sum(allDebtRows, 'totalPayment');
    const disbursed = E.cents(loans.reduce((s, l) => s + l.result.totals.disbursed, 0));
    const totalOutlay = E.cents(projectPayments + debtPayments - disbursed + sum(rows, 'rental'));
    const firstFullMonth = Math.min(months, moveMonth + (buildPath ? 0 : 1));
    const reference = rows[firstFullMonth - 1];
    const firstFinancing = rows.find(r => r.recurring > 0)?.recurring || 0;
    if (twoStages && rows.some(r => r.byStage.first?.recurring > 0 && r.byStage.second?.recurring > 0)) warnings.push('Há dois financiamentos simultâneos. A poupança e o caixa das duas linhas já consideram as duas prestações juntas.');
    return { path: h.selectedPath, initialCash: initial, baseCapacity: base, rows, stages, loans, sales, warnings: [...new Set(warnings)],
      summary: { moveMonth, debtFreeMonth: Math.max(0, ...allDebtRows.map(r => index(r.date))),
        projectCost: E.cents(stages.reduce((sum, s) => sum + s.cost, 0)), projectPayments, totalOutlay,
        netOwnOutlay: E.cents(totalOutlay - sales.reduce((s, sale) => s + sale.gross, 0)),
        financingCost: E.cents(debtPayments - disbursed), firstPayment: firstFinancing,
        firstFullPayment: reference.recurring,
        maxPayment: Math.max(0, ...rows.map(r => r.recurring)), regularSaving: reference.regularSaving,
        closingCash: cash, minimumCash, additionalCapital: E.cents(Math.max(0, -minimumCash)),
        shortageMonths: rows.filter(r => r.cashShortage).map(r => r.month), excessiveMonths: rows.filter(r => r.excessivePayment).map(r => r.month),
        bankLimit: E.cents((state.grossIncome1 + state.grossIncome2) * state.bankPercent / 100), familyLimit: state.comfortablePayment } };
  }
  const columns = [['month', 'Mês'], ['date', 'Data'], ['phase', 'Fase'], ['openingCash', 'Caixa inicial compartilhado'],
    ['capacity', 'Capacidade de poupança antes da moradia'], ['projectPayments', 'Compras e obra'], ['financing', 'Financiamentos e quitações'],
    ['rental', 'Aluguel (já na capacidade)'], ['totalHousing', 'Total pago em moradia'], ['funding', 'Crédito recebido'], ['saleGross', 'Venda bruta'], ['savingPossible', 'Poupança possível'],
    ['wealthWithdrawal', 'Retirada do patrimônio'], ['closingCash', 'Caixa disponível compartilhado'], ['debtBalance', 'Saldo devedor total']];
  const api = { PATHS, defaults, normalize, validate, capacity, amounts, calculate, columns };
  if (typeof module !== 'undefined') module.exports = api;
  root.Housing = api;
})(globalThis);
