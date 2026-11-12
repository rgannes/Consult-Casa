/* Configuração persistida e adaptação dos dados v2 ao motor mensal. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' ? require('./simulation') : root.FinancialEngine;
  const PATHS = {
    buyThenBuild: 'Comprar apartamento atual e depois construir',
    rentBuild: 'Construir pagando aluguel',
    buyThenUpgrade: 'Comprar apartamento atual e depois trocar por maior',
    buyLarger: 'Comprar diretamente apartamento maior'
  };
  function defaults(source = {}) {
    return { version: 1, selectedPath: 'rentBuild', startDate: '', firstDate: '', fundingDate: '',
      grossFamilyIncome: (source.grossIncome1 || 0) + (source.grossIncome2 || 0), bankPercent: 30,
      comfortablePayment: 0, minimumSavings: 0, additionalExpenses: 0, additionalFromMonth: 1,
      cashMode: 'savings', rent: 0, rentIncludedInBase: true, rentEndMonth: 0,
      helpDate: '', projectStartMonth: 1, constructionMonths: 12, constructionDelay: 0,
      principal: source.credit ?? 300000, annualRate: source.annual ?? 11,
      months: source.months ?? 240, system: source.system || 'SAC', indexAnnual: source.index ?? 0,
      insuranceFixed: 0, insurancePercentMonthly: 0, fees: source.fee ?? 150, upfront: source.upfront ?? 3000,
      extraMode: 'term', extraPayments: [], useConstruction: false, amortizationStartMonth: 13,
      capitalizeInterest: false, draws: [], constructionCharges: [], projectPayments: [],
      scheduleView: 'monthly' };
  }
  function validate(plan) {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan) || plan.version !== 1) throw Error('Configuração do motor mensal inválida.');
    const sample = defaults();
    for (const [key, value] of Object.entries(sample)) {
      const actual = plan[key];
      if (typeof value === 'number' && (typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0 || actual > 1e12)) throw Error(`Planejamento: ${key} inválido.`);
      if (typeof value === 'boolean' && typeof actual !== 'boolean') throw Error(`Planejamento: ${key} inválido.`);
      if (typeof value === 'string' && typeof actual !== 'string') throw Error(`Planejamento: ${key} inválido.`);
    }
    for (const key of ['additionalFromMonth', 'projectStartMonth', 'constructionMonths', 'amortizationStartMonth']) {
      if (!Number.isInteger(plan[key]) || plan[key] < 1 || plan[key] > 600) throw Error(`Planejamento: ${key} deve estar entre 1 e 600.`);
    }
    if (!Number.isInteger(plan.months) || plan.months < 1 || plan.months > 600) throw Error('Prazo entre 1 e 600 meses.');
    for (const key of ['rentEndMonth', 'constructionDelay']) if (!Number.isInteger(plan[key]) || plan[key] > (key === 'rentEndMonth' ? 1200 : 600)) throw Error(`${key}: inteiro fora do intervalo permitido.`);
    if (plan.constructionMonths + plan.constructionDelay > 600) throw Error('Prazo de obra com atraso excede 600 meses.');
    for (const key of ['annualRate', 'indexAnnual', 'insurancePercentMonthly', 'bankPercent']) if (plan[key] > 100) throw Error(`${key}: máximo 100%.`);
    for (const key of ['startDate', 'firstDate', 'fundingDate', 'helpDate']) {
      if (plan[key]) E.monthOffset(plan[key], plan[key]);
    }
    const choices = { selectedPath: Object.keys(PATHS), cashMode: ['savings', 'income'],
      system: ['SAC', 'Price'], extraMode: ['term', 'payment'], scheduleView: ['monthly', 'annual'] };
    for (const [key, options] of Object.entries(choices)) if (!options.includes(plan[key])) throw Error(`${key}: opção inválida.`);
    for (const key of ['extraPayments', 'draws', 'constructionCharges', 'projectPayments']) {
      if (!Array.isArray(plan[key]) || plan[key].length > 1000) throw Error(`${key}: lista inválida.`);
      const ids = new Set();
      for (const event of plan[key]) {
        if (!event || typeof event !== 'object' || typeof event.id !== 'string' || !event.id || ids.has(event.id)) throw Error(`${key}: identificador inválido ou duplicado.`);
        ids.add(event.id);
        if (typeof event.description !== 'string' || event.description.length > 1000) throw Error('Descrição do evento inválida.');
        if (typeof event.amount !== 'number' || !Number.isFinite(event.amount) || event.amount < 0 || event.amount > 1e12) throw Error('Valor do evento inválido.');
        const keys = key === 'constructionCharges' ? ['startMonth', 'endMonth'] : ['month'];
        for (const field of keys) if (!Number.isInteger(event[field]) || event[field] < 1 || event[field] > 1200) throw Error('Mês do evento inválido.');
        if (key === 'constructionCharges' && event.endMonth < event.startMonth) throw Error('Encargo termina antes de começar.');
        if (key === 'projectPayments' && !['project', 'construction', 'nonFinanced'].includes(event.kind)) throw Error('Tipo de pagamento inválido.');
      }
    }
    return plan;
  }
  function calculate(state) {
    const p = validate(state.planning);
    if (!p.startDate || !p.firstDate) throw Error('Informe início do fluxo e primeiro vencimento/competência do contrato para calcular.');
    const loan = E.loanSchedule({ principal: p.principal, annualRate: p.annualRate, months: p.months, system: p.system,
      indexAnnual: p.indexAnnual, insuranceFixed: p.insuranceFixed, insurancePercentMonthly: p.insurancePercentMonthly,
      fees: p.fees, upfront: p.upfront, firstDate: p.firstDate, fundingDate: p.fundingDate || p.firstDate,
      extraMode: p.extraMode, extraPayments: p.extraPayments,
      construction: p.useConstruction ? { phaseMonths: p.constructionMonths + p.constructionDelay,
        amortizationStartMonth: p.amortizationStartMonth, draws: p.draws, charges: p.constructionCharges,
        capitalizeInterest: p.capitalizeInterest } : null });
    const reserveDeduction = state.reserveAlreadyExcluded ? 0 : state.preservedReserve;
    const moveMonth = p.projectStartMonth + p.constructionMonths + p.constructionDelay;
    const limitInputs = { grossIncome: p.grossFamilyIncome, bankPercent: p.bankPercent,
      comfortablePayment: p.comfortablePayment, minimumSavings: p.minimumSavings };
    const flow = E.cashFlow({ startDate: p.startDate, initialCash: Math.max(0, state.cash - reserveDeduction),
      help: { enabled: state.includeFamilyHelp, amount: state.familyHelp, date: p.helpDate },
      mode: p.cashMode, monthlySavings: state.monthlySavings, income: state.income, baseExpenses: state.essential,
      additionalExpenses: p.additionalExpenses, additionalFromMonth: p.additionalFromMonth,
      rent: p.rent, rentIncludedInBase: p.rentIncludedInBase, rentEndMonth: p.rentEndMonth || moveMonth - 1,
      projectStartMonth: p.projectStartMonth, moveMonth, minMonths: Math.max(1, state.horizonMonths),
      loans: [loan], events: p.projectPayments, limitInputs });
    const warnings = [...loan.warnings];
    if (!p.projectPayments.length) warnings.push('Nenhum pagamento de compra/obra foi distribuído no fluxo. Crédito recebido não é ganho: cadastre os pagamentos, inclusive entrada e custos não financiados.');
    if (state.includeFamilyHelp) warnings.push('Ajuda familiar é condicional; só entra no mês da data informada.');
    if (state.cash < reserveDeduction) warnings.push('Patrimônio inicial insuficiente para preservar toda a reserva.');
    warnings.push('O orçamento de 11 grupos e os gastos reais não são somados automaticamente ao fluxo. Distribua os pagamentos uma única vez; confira a reconciliação com o orçamento.');
    if (p.useConstruction && E.monthOffset(p.startDate, p.firstDate) + 1 !== p.projectStartMonth) warnings.push('O início do contrato não coincide com o início do projeto no fluxo; confirme a correspondência dos meses das liberações e dos encargos.');
    if (p.useConstruction) warnings.push('Liberações, encargos e datas são hipóteses até proposta bancária. Atraso altera o prazo da obra/mudança; revise manualmente os meses de liberação, encargos e início da amortização.');
    const peakPayment = Math.max(0, ...flow.rows.map(r => r.installments));
    return { loan, flow, limits: E.limits({ ...limitInputs, recurringPayment: peakPayment,
      monthlyCapacity: Math.min(...flow.rows.map(r => r.monthlyCapacity)), closingCash: flow.totals.minimumBalance }), warnings,
      scheduledProjectTotal: E.cents(p.projectPayments.reduce((s, e) => s + e.amount, 0)) };
  }
  const api = { PATHS, defaults, validate, calculate };
  if (typeof module !== 'undefined') module.exports = api;
  root.FinancialPlanner = api;
})(globalThis);
