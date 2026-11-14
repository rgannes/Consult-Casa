'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model'), H = require('../housing');
function fixture(path = 'rentBuild') {
  const s = M.defaults();
  s.groups.forEach(g => { g.value = 0; g.fundingSource = 'own'; });
  s.constructionMode = 'global'; s.groups[6].value = 100000; s.groups[6].fundingSource = 'financed';
  s.groups[8].value = 20000;
  Object.assign(s, { cash: 200000, income: 10000, essential: 6000, monthlySavings: 3000,
    currentApartment: 300000, largerApartment: 500000, rent: 1000 });
  s.housing = H.defaults(s); s.housing.selectedPath = path; s.housing.startDate = '2027-01-01';
  Object.assign(s.housing.paths[path].second, { entry: 20000, months: 420, buildMonths: 3, cet: 11 });
  return s;
}
function funding(s) { return H.calculate(s).stages.find(stage => stage.build).funding; }
function memory() { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,String(v)) }; }
test('cada grupo aceita somente uma das duas origens e subitens usam o total do grupo', () => {
  const s = fixture(); s.groups[6].subitems = [
    { id: 'incluido', description: 'Incluído', value: 10000, includedInGroup: true, source: '', referenceDate: '', status: 'estimado', notes: '' },
    { id: 'adicional', description: 'Adicional', value: 5000, includedInGroup: false, source: '', referenceDate: '', status: 'estimado', notes: '' }
  ];
  assert.equal(funding(s).financedGroups, 105000); assert.equal(funding(s).principal, 85000);
  assert.equal(funding(s).principal + funding(s).downPayment, 105000);
  s.groups[6].fundingSource = 'ambos'; assert.throws(() => M.validate(s), /Origem/);
});
for (const path of ['rentBuild', 'buyThenBuild']) test(`${path}: crédito é soma financiada menos entrada manual`, () => {
  const s = fixture(path); if (path === 'buyThenBuild') s.housing.paths[path].first.entry = 60000;
  const f = funding(s); assert.equal(f.financedGroups, 100000); assert.equal(f.downPayment, 20000);
  assert.equal(f.principal, 80000); assert.equal(f.entry, 40000);
  s.cash = 0; s.monthlySavings = 0; assert.equal(funding(s).principal, 80000); assert.equal(s.housing.paths[path].second.entry, 20000);
});
test('alterar classificação, custo financiado ou entrada recalcula o principal', () => {
  const s = fixture(); assert.equal(funding(s).principal, 80000);
  s.groups[8].fundingSource = 'financed'; assert.equal(funding(s).principal, 100000);
  s.groups[8].value = 30000; assert.equal(funding(s).principal, 110000);
  s.housing.paths.rentBuild.second.entry = 35000; assert.equal(funding(s).principal, 95000);
  s.groups[8].fundingSource = 'own'; assert.equal(funding(s).principal, 65000);
  s.groups[8].value = 90000; assert.equal(funding(s).principal, 65000);
});
test('métodos ativos de área e contingência determinam os totais financiados', () => {
  const s = fixture(); s.constructionMode = 'area'; s.area = 100; s.m2 = 1500;
  s.contingencyMode = 'percent'; s.contingencyPercent = 10; s.contingencyBaseIds = ['construction']; s.groups[10].fundingSource = 'financed';
  assert.equal(funding(s).financedGroups, 165000); assert.equal(funding(s).principal, 145000);
  s.area = 120; assert.equal(funding(s).principal, 178000);
});
test('entrada nunca usa o patrimônio ou crédito manual antigo da construção', () => {
  const s = fixture(); Object.assign(s.housing.paths.rentBuild.second, { entry: null, credit: 123 });
  assert.equal(funding(s).downPayment, 0); assert.equal(funding(s).principal, 100000);
  s.cash = 900000; assert.equal(funding(s).principal, 100000);
  assert.equal(s.housing.paths.rentBuild.second.credit, 123); // preservado, sem comandar o crédito calculado
});
test('entrada negativa ou acima da base é rejeitada; igual à base zera crédito', () => {
  const s = fixture(), p = s.housing.paths.rentBuild.second;
  p.entry = -1; assert.throws(() => H.calculate(s));
  p.entry = 100000.01; assert.throws(() => H.calculate(s), /entrada.*não pode superar/);
  p.entry = 100000; assert.equal(funding(s).principal, 0);
  assert.equal(H.calculate(s).loans[0].result.totals.disbursed, 0);
  s.groups[6].fundingSource = 'own'; p.entry = 0; assert.equal(funding(s).principal, 0);
});
test('recursos próprios e entrada entram no aporte uma vez, mantendo os dois caixas', () => {
  const s = fixture(); s.housing.paths.rentBuild.second.cet = 0;
  const r = H.calculate(s);
  assert.equal(r.ledgers.project.totals.ownTransfers, 40000);
  assert.equal(r.ledgers.project.totals.bankFunding, 80000);
  assert.equal(r.ledgers.project.totals.supplierPayments, 120000);
  assert.equal(r.ledgers.personal.totals.transfers, 40000);
  assert.equal(r.ledgers.project.totals.closingCash, 0);
  assert.ok(r.ledgers.reconciliation.every(row => row.difference === 0 && row.transferOut === row.transferIn));
});
test('compras de apartamentos preservam crédito e entrada editáveis', () => {
  for (const path of ['buyLarger', 'buyThenUpgrade', 'buyThenBuild']) {
    const s = fixture(path), p = s.housing.paths[path];
    if (p.first) Object.assign(p.first, { entry: 60000, credit: 210000 });
    if (path !== 'buyThenBuild') Object.assign(p.second, { entry: 100000, credit: 350000 });
    let r = H.calculate(s); const apartment = r.stages.find(st => !st.build);
    assert.equal(apartment.funding.principal, p.first ? 210000 : 350000);
    s.groups.forEach(g => g.fundingSource = 'financed'); r = H.calculate(s);
    assert.equal(r.stages.find(st => !st.build).funding.principal, apartment.funding.principal);
  }
});
test('persistência, exportação, importação e recuperação conservam origem e entrada', () => {
  let s = fixture(); s = M.saveScenario(s, 'Exemplo fictício', 'origens');
  const store = memory(); M.persist(store, s, true); const loaded = M.load(store).state;
  assert.equal(loaded.groups[6].fundingSource, 'financed'); assert.equal(loaded.groups[8].fundingSource, 'own');
  assert.equal(loaded.housing.paths.rentBuild.second.entry, 20000);
  assert.deepEqual(M.readImport(M.exportData(loaded)), M.validate(s));
  loaded.groups[8].fundingSource = 'financed'; loaded.housing.paths.rentBuild.second.entry = 1000;
  const recovered = M.restoreScenario(loaded, 'origens');
  assert.equal(recovered.groups[8].fundingSource, 'own'); assert.equal(recovered.housing.paths.rentBuild.second.entry, 20000);
});
test('backup antigo ganha classificação sem alterar subitens, gastos ou cronogramas', () => {
  let s = fixture(); s = M.saveScenario(s, 'Antigo', 'antigo');
  const schedule = JSON.stringify(s.budgetSchedule);
  s.groups.forEach(g => delete g.fundingSource); s.savedScenarios[0].data.groups.forEach(g => delete g.fundingSource);
  const recovered = M.readImport(JSON.stringify({type:'consult-casa-backup', version:2, state:s}));
  assert.ok(recovered.groups.every(g => g.fundingSource === 'financed'));
  assert.ok(recovered.savedScenarios[0].data.groups.every(g => g.fundingSource === 'financed'));
  assert.equal(JSON.stringify(recovered.budgetSchedule), schedule);
  assert.deepEqual(recovered.expenses, s.expenses); assert.equal(recovered.housing.paths.rentBuild.second.entry, 20000);
});
test('trocar cenário de orçamento preserva a origem escolhida por grupo', () => {
  const s = M.applyPreset(fixture(), 'economico');
  assert.equal(s.groups[6].fundingSource, 'financed'); assert.equal(s.groups[8].fundingSource, 'own');
});
