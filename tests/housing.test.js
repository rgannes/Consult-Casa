const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model'), H = require('../housing'), E = require('../simulation');
function fixture(path = 'buyLarger') {
  const s = M.defaults(); Object.assign(s, { cash: 120000, preservedReserve: 20000, reserveAlreadyExcluded: true,
    income: 14000, essential: 8000, monthlySavings: 3000, grossIncome1: 14000, grossIncome2: 0,
    bankPercent: 30, comfortablePayment: 2800, rent: 1500, rentIncludedInExpenses: true,
    currentApartment: 300000, largerApartment: 500000 });
  s.housing = H.defaults(s); s.housing.selectedPath = path; s.housing.startDate = '2027-01-01';
  return s;
}
function smallBuild(s) {
  s.groups.forEach(g => { g.value = 0; }); s.constructionMode = 'global'; s.groups[6].value = 120000;
  s.housing.paths[s.housing.selectedPath].second.entry = 20000;
  Object.assign(s.housing.paths[s.housing.selectedPath].second, { months: 24, buildMonths: 6, cet: 12 });
  return s;
}
for (const system of ['SAC', 'Price']) test(`modelo global ${system}: 420 parcelas sem encargos somados duas vezes`, () => {
  const s = fixture(); const p = s.housing.paths.buyLarger.second;
  Object.assign(p, { system, months: 420, entry: 100000, cet: 12 });
  const r = H.calculate(s), loan = r.loans[0].result;
  assert.equal(loan.rows.length, 420); assert.equal(loan.totals.closingBalance, 0);
  assert.equal(loan.totals.fees, 0); assert.equal(loan.totals.insurance, 0); assert.equal(loan.totals.upfront, 0);
  assert.equal(r.rows.length, 421); assert.equal(r.rows.at(-1).date, '2062-01-01');
  assert.equal(r.summary.totalOutlay, E.cents(500000 + loan.totals.financingCost));
});
test('conversão anual efetiva do CET usa taxa mensal equivalente e juros teóricos', () => {
  const s = fixture(); Object.assign(s.housing.paths.buyLarger.second, { entry: 100000, cet: (1.01 ** 12 - 1) * 100, months: 12 });
  const r = H.calculate(s); assert.equal(r.loans[0].result.rows[0].interest, 4000);
});
test('obra tem encargos e depois amortização; prazo total já inclui a construção', () => {
  const s = smallBuild(fixture('rentBuild')), r = H.calculate(s), loan = r.loans[0].result;
  assert.equal(loan.rows.length, 24); assert.equal(loan.totals.installments, 18);
  assert.ok(loan.rows.slice(0, 6).every(row => row.amortization === 0 && row.interestPaid > 0));
  assert.ok(loan.rows[6].amortization > 0); assert.equal(r.summary.moveMonth, 7);
  assert.equal(r.rows[5].rental, 1500); assert.equal(r.rows[6].rental, 0);
  s.housing.paths.rentBuild.second.buildMonths = 12;
  const delayed = H.calculate(s); assert.equal(delayed.loans[0].result.rows.length, 24); assert.equal(delayed.loans[0].result.totals.installments, 12);
  assert.equal(delayed.summary.moveMonth, 13);
  s.housing.paths.rentBuild.second.buildMonths = 24; assert.throws(() => H.calculate(s), /prazo total/);
});
test('ajuda entra no início, reserva já separada não é descontada novamente', () => {
  const s = fixture(); s.familyHelp = 300000; s.includeFamilyHelp = true;
  assert.equal(H.calculate(s).initialCash, 420000);
  s.includeFamilyHelp = false; assert.equal(H.calculate(s).initialCash, 120000);
  s.reserveAlreadyExcluded = false; assert.equal(H.calculate(s).initialCash, 100000);
});
test('despesas atualizadas em Premissas ajustam a poupança sem duplicar renda e aportes', () => {
  let s = M.validate(fixture()); assert.equal(H.calculate(s).baseCapacity, 3000);
  s.essential += 1000; s = M.validate(s); assert.equal(H.calculate(s).baseCapacity, 2000);
  s.income += 500; s = M.validate(s); assert.equal(H.calculate(s).baseCapacity, 2500);
  s.monthlySavings = 1000; s = M.validate(s); assert.equal(H.calculate(s).baseCapacity, 1000);
});
test('premissas incompatíveis geram aviso e capacidade conservadora', () => {
  const s = fixture(); s.monthlySavings = 10000; s.housing = H.defaults(s);
  const r = H.calculate(s); assert.equal(r.baseCapacity, 6000); assert.ok(r.warnings.some(w => w.includes('poupança informada supera')));
});
test('aluguel incluído é considerado uma vez e liberado apenas depois da mudança', () => {
  const s = smallBuild(fixture('rentBuild')); const r = H.calculate(s);
  assert.equal(r.rows[0].capacity, 3000); assert.equal(r.rows[6].capacity, 4500);
  s.rentIncludedInExpenses = false;
  const a = H.calculate(s); assert.equal(a.rows[0].capacity, 1500); assert.equal(a.rows[6].capacity, 3000);
});
test('duas dívidas simultâneas compartilham uma única conta e somam as parcelas', () => {
  const s = smallBuild(fixture('buyThenBuild')), p = s.housing.paths.buyThenBuild;
  p.stage2Month = 3; p.first.entry = 60000; p.second.entry = 0;
  const r = H.calculate(s); const row = r.rows[9];
  assert.ok(row.byStage.first.recurring > 0 && row.byStage.second.recurring > 0);
  assert.equal(row.recurring, E.cents(row.byStage.first.recurring + row.byStage.second.recurring));
  for (const row of r.rows) assert.equal(row.closingCash, E.cents(row.openingCash + row.capacity + row.funding + row.saleGross - row.projectPayments - row.financing));
  assert.equal(r.stages[1].rows[0].openingCash, r.rows[2].openingCash);
  assert.ok(r.warnings.some(w => w.includes('simultâneos')));
});
test('troca de apartamento usa venda bruta uma vez, quita dívida e aplica recursos líquidos', () => {
  const s = fixture('buyThenUpgrade'), p = s.housing.paths.buyThenUpgrade;
  Object.assign(p, { stage2Month: 13, buyCosts: 5000, secondBuyCosts: 10000, salePrice: 320000, saleCosts: 15000 });
  Object.assign(p.first, { entry: 60000, months: 240, cet: 10 });
  const first = E.loanSchedule({ principal: 240000, annualRate: 10, months: 240, system: 'SAC', firstDate: '2027-02-01' });
  const expectedPayoff = first.rows[11].closingBalance;
  const r = H.calculate(s);
  assert.equal(r.sales[0].payoff, expectedPayoff);
  assert.equal(r.sales[0].net, 320000 - 15000 - expectedPayoff);
  assert.equal(r.loans[0].result.rows.at(-1).closingBalance, 0);
  assert.equal(r.rows.filter(row => row.saleGross > 0).length, 1);
  assert.equal(r.rows[12].saleGross, 320000);
  assert.ok(r.stages[1].funding.entry > 0);
  assert.equal(r.summary.netOwnOutlay, r.summary.totalOutlay - 320000);
  assert.ok(r.loans[0].result.rows.every(row => row.date <= '2028-01-01'));
});
test('vender antes da casa ficar pronta retoma aluguel e não antecipa o crédito da venda', () => {
  const s = smallBuild(fixture('buyThenBuild')), p = s.housing.paths.buyThenBuild;
  Object.assign(p, { stage2Month: 10, sell: true, saleMonth: 5, saleCosts: 5000 });
  const r = H.calculate(s);
  assert.equal(r.rows[3].saleGross, 0); assert.equal(r.rows[4].saleGross, 300000);
  assert.equal(r.rows[3].rental, 0); assert.equal(r.rows[4].rental, 1500);
  assert.equal(r.rows[15].rental, 0);
});
test('amortização extra reduz prazo ou parcela no novo modelo global', () => {
  const s = fixture(); const p = s.housing.paths.buyLarger.second;
  Object.assign(p, { entry: 100000, months: 420, cet: 11 });
  const base = H.calculate(s).loans[0].result;
  Object.assign(p, { extraAmount: 50000, extraMonth: 12, extraMode: 'term' });
  const shorter = H.calculate(s).loans[0].result;
  assert.ok(shorter.rows.length < base.rows.length); assert.ok(shorter.totals.interest < base.totals.interest);
  p.extraMode = 'payment'; const cheaper = H.calculate(s).loans[0].result;
  assert.equal(cheaper.rows.length, 420); assert.ok(cheaper.rows[12].installment < base.rows[12].installment);
});
test('crédito ajustado substitui a parte financiada, sem somar a entrada duas vezes', () => {
  const s = fixture(); const p = s.housing.paths.buyLarger.second;
  Object.assign(p, { entry: 100000, credit: 350000, cet: 0, months: 12 });
  const r = H.calculate(s); assert.equal(r.stages[0].funding.entry, 150000);
  assert.equal(r.rows[0].projectPayments, 500000); assert.equal(r.rows[0].funding, 350000);
  assert.equal(r.summary.totalOutlay, 500000);
});
test('insuficiência temporária é apontada mesmo com saldo final positivo', () => {
  const s = smallBuild(fixture('rentBuild')); s.horizonMonths = 18;
  Object.assign(s, { cash: 0, income: 20000, essential: 5000, monthlySavings: 10000, rent: 0 }); s.housing.cashBaseline = { income: 20000, expenses: 5000, savings: 10000 };
  s.housing.paths.rentBuild.second.entry = 120000;
  const r = H.calculate(s); assert.ok(r.summary.additionalCapital > 0); assert.ok(r.summary.closingCash > 0); assert.ok(r.summary.shortageMonths.length);
});
test('orçamento, gastos vinculados, dados técnicos e cenários v2 são preservados', () => {
  let s = fixture('rentBuild'); const payment = s.budgetSchedule.groups[6].payments[0];
  s.expenses.push({ id: 'ficticio', date: '2027-01-03', category: 'Construção', groupId: 'construction', description: 'Exemplo', amount: 1000, status: 'Pago', paymentId: payment.id });
  const before = JSON.stringify({ groups: s.groups, expenses: s.expenses, planning: s.planning, budgetSchedule: s.budgetSchedule });
  H.calculate(s); assert.equal(JSON.stringify({ groups: s.groups, expenses: s.expenses, planning: s.planning, budgetSchedule: s.budgetSchedule }), before);
  const r = H.calculate(s); assert.equal(r.stages[0].schedule.totals.difference, 0);
  assert.equal(r.stages[0].schedule.events.filter(e => e.id === 'expense:ficticio').length, 1);
  s = M.saveScenario(s, 'Fictício', 'snapshot'); s.housing.paths.rentBuild.second.cet = 5;
  assert.equal(M.restoreScenario(s, 'snapshot').housing.paths.rentBuild.second.cet, 11);
  assert.deepEqual(M.readImport(M.exportData(s)), M.validate(s));
});
test('backup v2 anterior recebe apenas extensão e conserva os módulos existentes', () => {
  const s = fixture(); delete s.housing; delete s.bankPercent; delete s.comfortablePayment; delete s.rent; delete s.rentIncludedInExpenses;
  const old = JSON.stringify(s), migrated = M.readImport(JSON.stringify({ type: 'consult-casa-backup', version: 2, state: s }));
  assert.ok(migrated.housing); assert.deepEqual(migrated.groups, JSON.parse(old).groups); assert.deepEqual(migrated.planning, JSON.parse(old).planning);
});
