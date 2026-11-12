'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../simulation');
const P = require('../planner');
const M = require('../model');
const sum = (rows, key) => E.cents(rows.reduce((s, r) => s + r[key], 0));
const near = (a, b, epsilon = .011) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≈ ${b}`);
const base = overrides => ({ principal: 300000, annualRate: 11, months: 240, system: 'SAC', firstDate: '2026-11-30', ...overrides });
function closingChecks(result) {
  for (const r of result.rows) {
    near(r.closingBalance, r.openingBalance + r.draw + r.correction + r.capitalizedInterest - r.amortization - r.extra);
    near(r.installment, r.amortization + r.interestPaid + r.insurance + r.fees + r.constructionCharges);
    near(r.totalPayment, r.installment + r.extra);
    assert.ok(r.closingBalance >= 0);
  }
  const t = result.totals;
  near(t.disbursed + t.correction + t.capitalizedInterest, t.amortization + t.extra + t.closingBalance);
  near(t.nominalOutflow, sum(result.rows, 'totalPayment') + t.upfront);
  near(t.interest, t.interestPaid + t.capitalizedInterest);
  assert.equal(t.closingBalance, 0);
}
for (const system of ['SAC', 'Price']) for (const months of [12, 240, 360, 420]) {
  test(`${system}: ${months} parcelas completas, saldo e somas fecham`, () => {
    const r = E.loanSchedule(base({ system, months, insuranceFixed: 50, fees: 25, upfront: 300 }));
    assert.equal(r.rows.length, months); closingChecks(r);
    assert.equal(r.totals.installments, months);
    assert.equal(r.totals.insurance, months * 50);
    assert.equal(r.totals.fees, months * 25);
    if (system === 'SAC') assert.ok(r.rows[0].installment > r.rows.at(-1).installment);
    else {
      assert.ok(r.rows.slice(0, -1).every(row => Math.abs(row.installment - r.rows[0].installment) < .011));
      // A última parcela absorve o arredondamento acumulado em centavos, com limite geométrico.
      const i = Math.expm1(Math.log1p(.11) / 12);
      assert.ok(Math.abs(r.rows[0].installment - r.rows.at(-1).installment) <= .01 * Math.expm1(months * Math.log1p(i)) / i);
    }
  });
}
test('SAC confere com exemplo independente de juros mensais de 1%', () => {
  const r = E.loanSchedule(base({ principal: 12000, annualRate: (1.01 ** 12 - 1) * 100, months: 12 }));
  assert.equal(r.rows[0].interest, 120);
  assert.equal(r.rows[0].amortization, 1000);
  assert.equal(r.rows[0].totalPayment, 1120);
  assert.equal(r.rows.at(-1).totalPayment, 1010);
  assert.equal(r.totals.interest, 780);
});
for (const system of ['SAC', 'Price']) test(`${system}: zero juros, índice, seguros e taxas`, () => {
  const r = E.loanSchedule(base({ principal: 1200, months: 12, annualRate: 0, system }));
  assert.equal(r.totals.nominalOutflow, 1200); assert.equal(r.totals.interest, 0);
  assert.ok(r.rows.every(r => r.totalPayment === 100)); closingChecks(r);
  const zero = E.loanSchedule(base({ principal: 0, annualRate: 0, system }));
  assert.equal(zero.rows.length, 0); assert.equal(zero.totals.nominalOutflow, 0);
});
for (const system of ['SAC', 'Price']) for (const extraMode of ['term', 'payment']) {
  test(`${system}: amortização extra para reduzir ${extraMode}`, () => {
    const regular = E.loanSchedule(base({ system }));
    const r = E.loanSchedule(base({ system, extraMode, extraPayments: [{ month: 12, amount: 50000 }] }));
    closingChecks(r);
    assert.equal(r.totals.extra, 50000);
    assert.ok(r.totals.interest < regular.totals.interest);
    if (extraMode === 'term') assert.ok(r.rows.length < 240);
    else { assert.equal(r.rows.length, 240); assert.ok(r.rows[12].installment < regular.rows[12].installment); }
  });
}
test('extra é limitado ao saldo e eventos posteriores à quitação não são cobrados', () => {
  const r = E.loanSchedule(base({ extraPayments: [{ month: 1, amount: 999999 }, { month: 10, amount: 100 }] }));
  assert.equal(r.rows.length, 1); closingChecks(r);
  assert.ok(r.warnings.length >= 2);
});
for (const system of ['SAC', 'Price']) test(`${system}: correção e extra preservam identidade do saldo`, () => {
  const r = E.loanSchedule(base({ system, indexAnnual: 5, extraMode: 'payment', extraPayments: [{ month: 20, amount: 10000 }] }));
  closingChecks(r); assert.ok(r.totals.correction > 0);
});
test('datas mantêm vencimento original no fim do mês; 420ª parcela vai além de 2030', () => {
  assert.equal(E.addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(E.addMonths('2028-01-31', 2), '2028-03-31');
  const r = E.loanSchedule(base({ months: 420 }));
  assert.equal(r.rows.at(-1).date, '2061-10-30');
  const annual = E.annualSummary(r.rows);
  assert.equal(sum(annual, 'interest'), r.totals.interest);
  assert.equal(sum(annual, 'totalPayment'), r.totals.nominalOutflow);
  assert.equal(annual.at(-1).closingBalance, 0);
  assert.equal(annual.reduce((s, r) => s + r.count, 0), 420);
  assert.equal(E.csv(r.rows, E.loanColumns).split('\n').length, 421);
});
function construction(capitalizeInterest = false) {
  return { phaseMonths: 2, amortizationStartMonth: 3, capitalizeInterest,
    draws: [{ month: 1, amount: 10000 }, { month: 2, amount: 20000 }],
    charges: [{ startMonth: 2, endMonth: 5, amount: 100 }] };
}
for (const capitalizeInterest of [false, true]) test(`obra: juros sobre saldo liberado, capitalização ${capitalizeInterest}`, () => {
  const r = E.loanSchedule(base({ principal: 30000, months: 12, construction: construction(capitalizeInterest), insuranceFixed: 10, fees: 20 }));
  assert.equal(r.rows.length, 14); closingChecks(r);
  assert.equal(r.rows[0].draw, 10000); assert.equal(r.rows[1].draw, 20000);
  assert.equal(r.rows[0].amortization, 0);
  const monthly = (1.11 ** (1 / 12)) - 1;
  near(r.rows[0].interest, E.cents(10000 * monthly));
  near(r.rows[1].interest, E.cents((30000 + (capitalizeInterest ? r.rows[0].interest : 0)) * monthly));
  assert.equal(r.rows[0].constructionCharges, 0);
  assert.equal(r.rows[4].constructionCharges, 100); // Continua depois da obra.
  assert.equal(r.rows[5].constructionCharges, 0);
  assert.equal(r.totals.constructionCharges, 400);
  assert.equal(r.rows[0].interestPaid, capitalizeInterest ? 0 : r.rows[0].interest);
});
test('obra não presume liberação integral nem cobre pagamentos automaticamente', () => {
  const c = construction(); c.draws = [{ month: 2, amount: 10000 }];
  const loan = E.loanSchedule(base({ principal: 30000, months: 12, annualRate: 0, construction: c }));
  assert.equal(loan.totals.disbursed, 10000); assert.ok(loan.warnings.length);
  assert.equal(loan.rows[0].interest, 0);
  const flow = E.cashFlow({ startDate: '2026-11-01', initialCash: 0, monthlySavings: 1000,
    loans: [loan], events: [{ month: 1, amount: 8000, kind: 'construction' }], moveMonth: 3 });
  assert.equal(flow.rows[0].closingCash, -7000);
  assert.ok(flow.totals.closingCash > 0);
  assert.equal(flow.totals.additionalCapital, 7000);
});
test('limite bancário maior que familiar e vice-versa; encargos não são ignorados', () => {
  const input = { grossIncome: 14000, bankPercent: 30, comfortablePayment: 2800, monthlyCapacity: 5000, minimumSavings: 500, recurringPayment: 2900, closingCash: 1000 };
  const a = E.limits(input); assert.equal(a.bankLimit, 4200); assert.equal(a.planningLimit, 2800); assert.equal(a.withinPlanning, false);
  const b = E.limits({ ...input, grossIncome: 8000 }); assert.equal(b.planningLimit, 2400);
  const c = E.limits({ ...input, monthlyCapacity: 3000 }); assert.equal(c.cashCapacity, 2500); assert.equal(c.withinMonthlyCash, false);
  assert.equal(E.limits({ ...input, closingCash: -1 }).hasCash, false);
  const zero = E.limits({ grossIncome: 0, bankPercent: 0, comfortablePayment: 0 }); assert.equal(zero.planningLimit, 0);
  assert.equal(a.approval, false);
});
test('ajuda entra apenas na data escolhida, sem antecipação ou duplicação', () => {
  const input = { startDate: '2026-11-01', initialCash: 0, monthlySavings: 1000, minMonths: 3,
    help: { enabled: true, amount: 5000, date: '2027-01-10' }, events: [{ month: 1, amount: 4000, kind: 'construction' }] };
  const r = E.cashFlow(input);
  assert.deepEqual(r.rows.map(r => r.help), [0, 0, 5000]);
  assert.equal(r.totals.closingCash, 4000); assert.equal(r.totals.additionalCapital, 3000);
  const noHelp = E.cashFlow({ ...input, help: { ...input.help, enabled: false } });
  assert.equal(noHelp.totals.help, 0); assert.equal(noHelp.totals.closingCash, -1000);
});
test('poupança de 3000 já líquida não subtrai despesas novamente nem soma renda', () => {
  const r = E.cashFlow({ startDate: '2026-11-01', initialCash: 0, mode: 'savings', monthlySavings: 3000,
    income: 10000, baseExpenses: 7000, minMonths: 3 });
  assert.equal(r.totals.closingCash, 9000);
  assert.ok(r.rows.every(r => r.baseIncome === 3000 && r.baselineExpenses === 0));
  const income = E.cashFlow({ startDate: '2026-11-01', initialCash: 0, mode: 'income', monthlySavings: 3000,
    income: 10000, baseExpenses: 7000, minMonths: 3 });
  assert.equal(income.totals.closingCash, 9000);
});
test('aluguel incluído não se repete; término libera o valor na base', () => {
  const input = { startDate: '2026-11-01', initialCash: 0, monthlySavings: 3000, rent: 1000,
    rentIncludedInBase: true, rentEndMonth: 2, moveMonth: 3 };
  const r = E.cashFlow(input);
  assert.deepEqual(r.rows.map(r => r.rent), [0, 0, 0]);
  assert.deepEqual(r.rows.map(r => r.closingCash), [3000, 6000, 10000]);
  const additional = E.cashFlow({ ...input, rentIncludedInBase: false });
  assert.deepEqual(additional.rows.map(r => r.closingCash), [2000, 4000, 7000]);
});
test('prestações e liberação entram uma única vez e fluxo vai até a última dívida', () => {
  const a = E.loanSchedule(base({ principal: 1200, months: 12, annualRate: 0, firstDate: '2027-01-01' }));
  const b = E.loanSchedule(base({ principal: 42000, months: 420, annualRate: 0, firstDate: '2028-01-01' }));
  const r = E.cashFlow({ startDate: '2026-11-01', initialCash: 0, monthlySavings: 1000, loans: [a, b], minMonths: 12 });
  assert.equal(r.rows.length, 434);
  assert.equal(r.rows.at(-1).date, '2062-12-01');
  assert.equal(r.totals.funding, 43200); assert.equal(r.totals.installments, 43200);
  assert.equal(r.totals.closingCash, 434000);
  near(sum(E.annualSummary(r.rows, 'cash'), 'installments'), r.totals.installments);
});
test('fases distinguem antes do projeto, obra com atraso e após mudança', () => {
  const r = E.cashFlow({ startDate: '2026-11-01', initialCash: 0, projectStartMonth: 3, moveMonth: 6, minMonths: 7 });
  assert.deepEqual(r.rows.map(r => r.phase), ['antes do projeto', 'antes do projeto', 'obra/projeto', 'obra/projeto', 'obra/projeto', 'após mudança', 'após mudança']);
});
test('compatibilidade v2 adiciona planejamento sem modificar grupos, gastos e snapshots antigos', () => {
  const old = M.defaults(); delete old.planning;
  old.expenses.push({ id: 'ficticio', category: 'Terreno', groupId: 'land', date: '', description: 'Exemplo', amount: 1, status: 'Pago' });
  const savedData = structuredClone(old); delete savedData.savedScenarios;
  old.savedScenarios.push({ id: 's', name: 'Exemplo', createdAt: '2026-11-01T00:00:00Z', data: savedData });
  const imported = M.readImport(JSON.stringify({ type: 'consult-casa-backup', version: 2, state: old }));
  assert.deepEqual(imported.groups, old.groups); assert.deepEqual(imported.expenses, old.expenses);
  assert.ok(imported.planning); assert.ok(imported.savedScenarios[0].data.planning);
  assert.equal(M.budget(imported).total, M.budget(old).total);
  assert.deepEqual(M.readImport(M.exportData(imported)), imported);
});
test('planejador não duplica a reserva e não antecipa ajuda; dados permanecem recuperáveis', () => {
  const s = M.defaults(); s.cash = 10000; s.preservedReserve = 1000; s.reserveAlreadyExcluded = true;
  s.familyHelp = 2000; s.includeFamilyHelp = true;
  Object.assign(s.planning, { principal: 0, startDate: '2026-11-01', firstDate: '2026-11-01', helpDate: '2027-01-01' });
  let r = P.calculate(s); assert.equal(r.flow.rows[0].openingCash, 10000); assert.equal(r.flow.rows[0].help, 0);
  s.reserveAlreadyExcluded = false; r = P.calculate(s); assert.equal(r.flow.rows[0].openingCash, 9000);
  const saved = M.saveScenario(s, 'Fictício', 'test');
  saved.planning.months = 420;
  assert.equal(M.restoreScenario(saved, 'test').planning.months, 240);
});
test('datas, parcelas, liberações e configuração inválidas são rejeitadas', () => {
  for (const principal of [-1, NaN, Infinity, null]) assert.throws(() => E.loanSchedule(base({ principal })));
  assert.throws(() => E.loanSchedule(base({ months: 0 })));
  assert.throws(() => E.loanSchedule(base({ firstDate: '2026-02-30' })));
  assert.throws(() => E.loanSchedule(base({ extraPayments: [{ month: 421, amount: 100 }] })));
  const c = construction(); c.draws[0].amount = 1000000;
  assert.throws(() => E.loanSchedule(base({ construction: c })));
  const s = M.defaults(); s.planning.bankPercent = 101; assert.throws(() => M.validate(s));
  assert.throws(() => P.calculate(M.defaults()));
  assert.throws(() => E.cashFlow({ startDate: '2026-11-01', initialCash: 0, help: { enabled: true, amount: 100, date: '' } }));
});
test('resumo anual conserva falta de caixa intermediária e não mascara saldo final positivo', () => {
  const r = E.cashFlow({ startDate: '2026-01-01', initialCash: 0, monthlySavings: 1000, minMonths: 12,
    events: [{ month: 1, amount: 3000, kind: 'construction' }] });
  const a = E.annualSummary(r.rows, 'cash')[0];
  assert.equal(a.closingCash, 9000); assert.equal(a.minimumCash, -2000);
});
test('cálculo que excede a precisão monetária é rejeitado, nunca exibido como Infinity', () => {
  assert.throws(() => E.loanSchedule(base({ principal: 1e12, annualRate: 100, indexAnnual: 100, months: 600 })));
});
test('liberações fora de ordem usam a primeira data real e arredondam cada evento em centavos', () => {
  const c = construction(); c.draws = [{ month: 2, amount: 100 }, { month: 1, amount: .004 }, { month: 1, amount: .004 }];
  const r = E.loanSchedule(base({ principal: 1000, months: 12, annualRate: 0, upfront: 10, construction: c }));
  assert.equal(r.totals.disbursed, 100);
  assert.equal(r.upfrontDate, '2026-12-30');
  assert.equal(r.rows[0].draw, 0);
  assert.equal(r.funding.reduce((s, f) => s + f.amount, 0), r.totals.disbursed);
});
test('meta mínima de poupança não é considerada cumprida quando a capacidade é insuficiente mesmo sem parcela', () => {
  const r = E.limits({ grossIncome: 14000, bankPercent: 30, comfortablePayment: 2800,
    monthlyCapacity: 500, minimumSavings: 1000, recurringPayment: 0 });
  assert.equal(r.cashCapacity, 0); assert.equal(r.withinMonthlyCash, false);
});
