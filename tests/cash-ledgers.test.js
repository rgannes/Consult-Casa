'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../cash-ledgers'), E = require('../simulation'), H = require('../housing'), M = require('../model');
function facts(rows) { return rows.map((r, i) => ({ month: i + 1, date: E.addMonths('2027-01-01', i), capacity: 0, ...r })); }
function fixture(path = 'rentBuild') {
  let s = M.defaults();
  Object.assign(s, { cash: 100000, income: 0, essential: 0, monthlySavings: 0, currentApartment: 300000,
    largerApartment: 500000, preservedReserve: 20000, reserveAlreadyExcluded: true, rent: 0, comfortablePayment: 10000, grossIncome1: 100000 });
  s.groups.forEach(g => { g.value = 0; }); s.constructionMode = 'global'; s.groups[6].value = 120000;
  s.housing = H.defaults(s); s.housing.startDate = '2027-01-01'; s.housing.selectedPath = path;
  Object.assign(s.housing.paths[path].second, { entry: 30000, credit: null, months: 12, buildMonths: 3, cet: 0 });
  // Proposta explícita de teste: três medições aceitas de 30 mil, sem prazo adicional.
  // Não se presume mais uma distribuição bancária mensal na aplicação.
  s.groups[6].subitems = Array.from({length:3},(_,i)=>({id:`measurement-${i}`,description:`Medição ${i+1}`,value:40000,
    source:'Contrato fictício',referenceDate:'',status:'estimado',notes:'',includedInGroup:true,
    measurement:true,measurementValue:30000,phaseEnd:E.addMonths('2027-01-01',i),releaseDelayDays:0}));
  return M.validate(s);
}
function reconcile(result) {
  const personal = result.ledgers.personal, project = result.ledgers.project;
  assert.equal(personal.totals.transfers, project.totals.ownTransfers);
  result.rows.forEach((row, i) => {
    const p = personal.rows[i], w = project.rows[i];
    assert.equal(p.closingCash, E.cents(p.openingCash + p.capacity + p.apartmentFunding + p.saleGross - p.apartmentPayments - p.financing - p.transferToProject));
    assert.equal(w.closingCash, E.cents(w.openingCash + w.ownTransfers + w.bankFunding - w.supplierPayments));
    assert.equal(result.ledgers.reconciliation[i].difference, 0);
    assert.equal(row.consolidatedCash, E.cents(p.closingCash + w.closingCash));
    assert.equal(row.closingCash, p.closingCash);
    assert.equal(row.constructionCash, w.closingCash);
  });
}
test('reembolsos e sobras da obra financiam competências seguintes sem virar renda pessoal', () => {
  const r = L.separate({ initialCash: 100, rows: facts([
    { capacity: 10, financing: 2, transferPlanned: 20, constructionFunding: 30, constructionPayments: 10 },
    { capacity: 10, financing: 2, constructionPayments: 35 },
    { capacity: 10, financing: 2, constructionFunding: 5, constructionPayments: 10 }
  ]) });
  assert.deepEqual(r.personal.rows.map(r => r.closingCash), [88, 96, 104]);
  assert.deepEqual(r.project.rows.map(r => r.closingCash), [40, 5, 0]);
  assert.deepEqual(r.project.rows.map(r => r.openingCash), [0, 40, 5]);
  assert.equal(r.personal.totals.transfers, 20); assert.equal(r.project.totals.bankFunding, 35);
  assert.ok(r.reconciliation.every(r => r.difference === 0));
});
test('fornecedor superior ao reembolso gera déficit da obra, apesar do dinheiro pessoal', () => {
  const r = L.separate({ initialCash: 100, rows: facts([
    { capacity: 10, constructionFunding: 30, constructionPayments: 50 },
    { capacity: 10, constructionFunding: 40, constructionPayments: 10 }
  ]) });
  assert.deepEqual(r.personal.rows.map(r => r.closingCash), [110, 120]);
  assert.deepEqual(r.project.rows.map(r => r.closingCash), [-20, 10]);
  assert.equal(r.project.totals.additionalCapital, 20); assert.equal(r.project.totals.firstShortageMonth, 1);
  assert.equal(r.personal.totals.transfers, 0);
});
test('aportes são limitados ao caixa pessoal e valores faltantes não são repetidos depois', () => {
  const r = L.separate({ initialCash: 20, rows: facts([
    { financing: 5, transferPlanned: 200, constructionPayments: 200 }, { capacity: 300 }
  ]) });
  assert.equal(r.personal.rows[0].transferToProject, 15);
  assert.equal(r.project.rows[0].ownTransfers, 15);
  assert.equal(r.personal.rows[0].unmetTransfer, 185);
  assert.equal(r.personal.rows[1].transferToProject, 0);
  assert.equal(r.personal.rows[1].closingCash, 300);
  assert.equal(r.project.rows[1].closingCash, -185);
});
test('obrigações pessoais não são pagas com saldo bancário retido na obra', () => {
  const r = L.separate({ initialCash: 20, rows: facts([
    { financing: 30, constructionFunding: 100, transferPlanned: 100, constructionPayments: 0 }
  ]) });
  assert.equal(r.personal.totals.closingCash, -10);
  assert.equal(r.project.totals.closingCash, 100);
  assert.equal(r.personal.totals.transfers, 0);
  assert.equal(r.personal.totals.additionalCapital, 10);
});
test('aluguel já líquido na capacidade não é subtraído outra vez', () => {
  const r = L.separate({ initialCash: 10000, rows: facts([{ capacity: 3000, rental: 1000, financing: 100 }]) });
  assert.equal(r.personal.totals.closingCash, 12900);
  assert.equal(r.personal.rows[0].savingPossible, 2900);
  assert.equal(r.project.totals.supplierPayments, 0);
});
test('dois caixas e transferências fecham com os valores da construção, sem patrimônio fictício', () => {
  const r = H.calculate(fixture()); reconcile(r);
  const work = r.ledgers.project;
  assert.equal(work.initialCash, 0);
  assert.equal(work.totals.ownTransfers, 30000);
  assert.equal(work.totals.bankFunding, 90000);
  assert.equal(work.totals.supplierPayments, 120000);
  assert.deepEqual(work.rows.slice(0, 3).map(r => r.closingCash), [20000, 10000, 0]);
  assert.equal(r.rows[0].closingCash, 70000);
  assert.equal(r.rows[0].funding, 0); assert.equal(r.rows[0].projectPayments, 0);
  assert.equal(r.rows[1].transferToProject, 0);
});
test('juros de obra e prestações saem do pessoal, fornecedores e banco só da obra', () => {
  const s = fixture(); s.housing.paths.rentBuild.second.cet = 12;
  const r = H.calculate(s); reconcile(r);
  const debt = r.loans[0].result;
  assert.equal(r.ledgers.personal.totals.financing, debt.totals.nominalOutflow);
  assert.equal(r.rows[0].closingCash, E.cents(100000 - 30000 - debt.rows[0].totalPayment));
  assert.equal(r.ledgers.project.rows[0].closingCash, 20000);
  assert.ok(debt.rows[0].amortization === 0 && debt.rows[0].interest > 0);
  assert.ok(debt.rows[3].amortization > 0);
});
test('obra deficitária não recebe complementações automáticas do patrimônio pessoal', () => {
  const s = fixture(), g = s.budgetSchedule.groups[6]; g.mode = 'manual';
  g.payments = [{ id: 'contract-1', month: 1, amount: 90000, status: 'confirmed', fixed: true, origin: 'manual' },
    { id: 'contract-2', month: 3, amount: 30000, status: 'confirmed', fixed: true, origin: 'manual' }];
  const r = H.calculate(s); reconcile(r);
  assert.equal(r.rows[0].closingCash, 70000);
  assert.equal(r.rows[0].constructionCash, -30000);
  assert.equal(r.summary.firstConstructionShortageMonth, 1);
  assert.equal(r.summary.constructionAdditionalCapital, 30000);
  assert.equal(r.rows[1].transferToProject, 0);
  assert.equal(r.rows[1].constructionCash, 0);
  assert.equal(r.ledgers.project.totals.closingCash, 0);
});
test('patrimônio insuficiente limita o aporte e sinaliza o caixa da obra negativo', () => {
  const s = fixture(); s.cash = 5000;
  const r = H.calculate(s); reconcile(r);
  assert.equal(r.rows[0].transferToProject, 5000);
  assert.equal(r.rows[0].unmetTransfer, 25000);
  assert.equal(r.rows[0].closingCash, 0);
  assert.equal(r.rows[0].constructionCash, -5000);
  assert.equal(r.summary.constructionAdditionalCapital, 25000);
  assert.equal(r.ledgers.project.totals.closingCash, -25000);
});
test('aluguel incluído/adicional e liberação após mudança continuam sem dupla contagem', () => {
  const s = fixture(); Object.assign(s, { income: 10000, essential: 5000, monthlySavings: 3000, rent: 1000 });
  s.housing.cashBaseline = { income: 10000, expenses: 5000, savings: 3000 };
  let r = H.calculate(s); reconcile(r);
  assert.equal(r.rows[0].capacity, 3000); assert.equal(r.rows[3].capacity, 4000);
  assert.equal(r.rows[0].closingCash, 73000);
  s.rentIncludedInExpenses = false; r = H.calculate(s);
  assert.equal(r.rows[0].capacity, 2000); assert.equal(r.rows[3].capacity, 3000);
  assert.equal(r.rows[0].closingCash, 72000);
});
test('apartamentos mantêm compras/vendas no caixa pessoal e não usam caixa da obra', () => {
  for (const path of ['buyLarger', 'buyThenUpgrade']) {
    const s = fixture(path), p = s.housing.paths[path];
    if (p.first) p.first.entry = 60000;
    p.second.entry = 100000;
    const r = H.calculate(s); reconcile(r);
    assert.equal(r.hasConstruction, false);
    assert.ok(r.ledgers.project.rows.every(row => row.closingCash === 0 && row.bankFunding === 0 && row.supplierPayments === 0));
    assert.equal(r.ledgers.personal.totals.transfers, 0);
    assert.equal(r.rows[0].funding, path === 'buyLarger' ? 400000 : 240000);
    if (path === 'buyThenUpgrade') assert.equal(r.rows[p.stage2Month - 1].saleGross, 300000);
  }
});
test('venda de apartamento no caminho de construção não vira aporte automático', () => {
  const s = fixture('buyThenBuild'), p = s.housing.paths.buyThenBuild;
  Object.assign(p, { stage2Month: 3, sell: true, saleMonth: 5, saleCosts: 1000 }); p.first.entry = 60000;
  s.groups[6].subitems.forEach((item,i)=>item.phaseEnd=E.addMonths('2027-03-01',i));
  const r = H.calculate(s); reconcile(r);
  assert.equal(r.rows[4].saleGross, 300000);
  assert.equal(r.rows[4].transferToProject, 0);
  assert.equal(r.ledgers.project.rows[4].bankFunding, 30000);
  assert.equal(r.ledgers.project.rows[4].ownTransfers, 0);
});
for (const system of ['SAC', 'Price']) test(`420 meses preservados no ${system}, com dívida separada dos caixas`, () => {
  const s = fixture(); Object.assign(s.housing.paths.rentBuild.second, { system, months: 420, cet: 11 });
  const r = H.calculate(s); reconcile(r);
  assert.equal(r.rows.length, 420);
  assert.equal(r.loans[0].result.rows.length, 420);
  assert.equal(r.loans[0].result.rows.at(-1).closingBalance, 0);
  assert.equal(r.rows.at(-1).debtBalance, 0);
  assert.equal(r.ledgers.project.rows.length, 420);
  assert.equal(E.csv(r.rows, H.columns).split('\n').length, 421);
});
test('gastos vinculados não duplicam fornecedor nem se tornam despesa pessoal', () => {
  let s = fixture(); const p = s.budgetSchedule.groups[6].payments[0];
  s.expenses.push({ id: 'exemplo', date: '2027-01-10', category: 'Construção', groupId: 'construction', description: 'Exemplo fictício', amount: p.amount, status: 'Pago', paymentId: p.id });
  s = M.validate(s); const r = H.calculate(s); reconcile(r);
  assert.equal(r.ledgers.project.totals.supplierPayments, 120000);
  assert.equal(r.rows.reduce((sum, row) => sum + row.projectPayments, 0), 0);
  assert.deepEqual(M.readImport(M.exportData(s)), s);
});
test('cálculo preserva os dados de orçamento, datas e financiabilidade sem mutar o original', () => {
  const s = fixture(); const before = JSON.stringify({ groups: s.groups, budgetSchedule: s.budgetSchedule, planning: s.planning });
  H.calculate(s);
  assert.equal(JSON.stringify({ groups: s.groups, budgetSchedule: s.budgetSchedule, planning: s.planning }), before);
});
