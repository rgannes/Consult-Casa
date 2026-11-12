'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model');
function storage() {
  const data = new Map();
  return { getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}
function legacy() {
  return { city: 'Exemplo fictício', reference: '2026-10', area: 120, m2: 1000, land: 90000,
    contingency: 10, cash: 10000, income: 5000, essential: 2000, emergencyMonths: 3,
    delay: 12, categories: [
      ['Diligência do terreno, sondagem e topografia', 1000],
      ['ITBI, escritura/contrato e registro', 2000],
      ['Arquitetura, projetos complementares e compatibilização', 3000],
      ['Engenharia, responsabilidade técnica e gestão', 4000],
      ['Aprovações, taxas, alvarás e certificados', 5000],
      ['Canteiro, ligações provisórias e logística', 6000],
      ['Seguro de obra e segurança', 7000],
      ['Regularização fiscal/previdenciária da obra', 8000],
      ['Habite-se, averbação e documentação final', 9000],
      ['Ligações definitivas, calçada e paisagismo', 10000],
      ['Móveis, eletros e decoração', 11000],
      ['Aluguel durante a obra, mudança e sobreposição', 12000]
    ], expenses: [{ id: 123, category: 'Construção', description: 'Gasto fictício',
      date: '2026-10-01', amount: 900, status: 'Pago' },
      { id: 124, category: 'Seguro de obra e segurança', description: 'Compromisso fictício',
        date: '2026-10-02', amount: 200, status: 'A pagar' }] };
}
test('os 11 grupos somam exatamente os valores fornecidos, inclusive contingência', () => {
  const totals = { economico: 1121000, intermediario: 1539500, elevado: 2072000 };
  for (const [name, values] of Object.entries(M.PRESETS)) {
    const s = M.applyPreset(M.defaults(), name);
    const b = M.budget(s);
    assert.equal(s.groups.length, 11);
    assert.deepEqual(s.groups.map(g => g.value), values);
    assert.equal(b.total, values.reduce((a, v) => a + v, 0));
    assert.equal(b.total, totals[name]);
    assert.equal(b.withoutLand, b.total - values[0]);
    assert.equal(s.area, 150);
  }
});
test('área × m² e orçamento global são mutuamente exclusivos, incluindo valor zero', () => {
  const s = M.defaults(); s.groups[6].value = 900000;
  s.area = 200; s.m2 = 4000;
  assert.equal(M.budget(s).construction, 800000);
  s.constructionMode = 'global';
  assert.equal(M.budget(s).construction, 900000);
  s.area = 300; s.m2 = 6000;
  assert.equal(M.budget(s).construction, 900000);
  s.groups[6].value = 0;
  assert.equal(M.budget(s).construction, 0);
  s.constructionMode = 'area'; s.area = 0;
  assert.equal(M.budget(s).construction, 0);
});
test('contingência incide só sobre grupos marcados ou usa manual sem dupla contagem', () => {
  const s = M.defaults(); s.contingencyMode = 'percent'; s.contingencyPercent = 10;
  s.contingencyBaseIds = ['construction', 'preparation'];
  assert.equal(M.budget(s).contingencyBase, 885000);
  assert.equal(M.budget(s).contingency, 88500);
  s.groups[10].value = 123;
  assert.equal(M.budget(s).contingency, 88500);
  s.contingencyMode = 'manual';
  assert.equal(M.budget(s).contingency, 123);
  s.contingencyMode = 'percent'; s.contingencyBaseIds = [];
  assert.equal(M.budget(s).contingency, 0);
  s.contingencyBaseIds = ['contingency']; assert.throws(() => M.validate(s));
});
test('subitens incluídos detalham a proposta; somente adicionais entram no total', () => {
  const s = M.defaults();
  const item = { id: 'a', description: 'Exemplo', source: '', referenceDate: '', status: 'estimado', notes: '', value: 10000, includedInGroup: true };
  s.groups[6].subitems.push(item);
  const initial = M.budget(s).total;
  assert.equal(M.budget(s).construction, 750000);
  item.includedInGroup = false;
  assert.equal(M.budget(s).total, initial + 10000);
  s.constructionMode = 'global';
  assert.equal(M.budget(s).construction, 760000);
  item.value = 0; assert.equal(M.budget(s).total, initial);
});
test('ajuda familiar só entra se selecionada e não altera recursos sem ajuda', () => {
  const s = M.defaults(); s.cash = 100000; s.familyHelp = 50000;
  assert.equal(M.resources(s).now, 100000);
  s.includeFamilyHelp = true;
  assert.equal(M.resources(s).now, 150000);
  assert.equal(M.resources(s).nowWithoutHelp, 100000);
  s.includeFamilyHelp = false;
  assert.equal(M.resources(s).now, 100000);
});
test('reserva já separada não é deduzida novamente; nunca cria caixa negativo', () => {
  const s = M.defaults(); s.cash = 100000; s.preservedReserve = 30000;
  assert.equal(M.resources(s).now, 100000);
  s.reserveAlreadyExcluded = false;
  assert.equal(M.resources(s).now, 70000);
  s.preservedReserve = 120000;
  assert.equal(M.resources(s).now, 0);
  assert.equal(M.resources(s).reserveShortfall, 20000);
});
test('poupança conta uma vez; renda, despesas e imóveis são referências, não aportes', () => {
  const s = M.defaults(); s.cash = 10000; s.monthlySavings = 1000; s.horizonMonths = 12;
  s.income = 9000; s.essential = 8000; s.currentApartment = 500000; s.largerApartment = 900000;
  assert.equal(M.resources(s).projected, 22000);
  s.income = 18000; s.grossIncome1 = 20000; s.grossIncome2 = 30000;
  assert.equal(M.resources(s).projected, 22000);
  s.horizonMonths = 0; assert.equal(M.resources(s).projected, 10000);
});
test('exportação/importação v2 faz roundtrip de metadados, subitens e gastos', () => {
  const s = M.migrateLegacy(legacy());
  s.groups[0].notes = 'Inclui somente a proposta fictícia';
  s.groups[0].referenceDate = '2026-10-01'; s.groups[0].status = 'cotado';
  assert.deepEqual(M.readImport(M.exportData(s)), s);
});
test('persistência e restauração do backup preservam a versão anterior', () => {
  const store = storage(), s = M.defaults();
  M.persist(store, s);
  const next = M.applyPreset(s, 'elevado');
  M.importInto(store, M.exportData(next), s);
  assert.deepEqual(M.load(store).state, next);
  assert.deepEqual(M.restoreBackup(store, next), s);
  assert.deepEqual(M.restoreBackup(store, s), next);
});
test('arquivo inválido não muda dados nem backup persistidos', () => {
  const store = storage(), s = M.defaults(); M.persist(store, s);
  const before = store.getItem(M.STORAGE_KEY);
  const bad = M.defaults(); bad.groups[0].value = '100';
  assert.throws(() => M.importInto(store, JSON.stringify({ type: 'consult-casa-backup', version: 2, state: bad }), s));
  assert.equal(store.getItem(M.STORAGE_KEY), before);
  assert.equal(store.getItem(M.BACKUP_KEY), null);
  assert.throws(() => M.readImport('{'));
  assert.throws(() => M.readImport('null'));
  assert.throws(() => M.readImport('{"version":99}'));
});
test('migração mantém total e todos os registros de gastos com classificação nova', () => {
  const old = legacy(); const s = M.readImport(JSON.stringify({ version: 1, state: old }));
  const oldTotal = old.land + (old.area * old.m2 + old.categories.reduce((sum, c) => sum + c[1], 0)) * 1.1;
  assert.ok(Math.abs(M.budget(s).total - oldTotal) < 1e-6);
  assert.equal(s.expenses.length, old.expenses.length);
  s.expenses.forEach((e, i) => { const { groupId, ...original } = e; assert.deepEqual(original, old.expenses[i]); assert.equal(groupId, 'construction'); });
  assert.equal(s.groups.reduce((sum, g) => sum + g.subitems.length, 0), old.categories.length);
  assert.equal(s.preservedReserve, 6000);
  assert.equal(s.reserveAlreadyExcluded, false);
  assert.equal(M.resources(s).now, 4000);
});
test('migração automática não apaga a chave v1 e sobrevive a recarregamento', () => {
  const store = storage(); const raw = JSON.stringify(legacy()); store.setItem(M.LEGACY_KEY, raw);
  const loaded = M.load(store); assert.equal(loaded.migrated, true);
  assert.equal(store.getItem(M.LEGACY_KEY), raw);
  assert.deepEqual(M.load(store).state, loaded.state);
  assert.equal(M.load(store).migrated, false);
});
test('zeros são válidos; ausências críticas, negativos, tipos errados e não finitos são rejeitados', () => {
  const zeros = M.defaults(); zeros.area = 0; zeros.m2 = 0; zeros.groups.forEach(g => { g.value = 0; });
  assert.equal(M.budget(M.validate(zeros)).total, 0);
  for (const value of [-1, null, '', '12', NaN, Infinity, undefined]) {
    const s = M.defaults(); s.cash = value; assert.throws(() => M.validate(s));
  }
  for (const key of ['cash', 'groups', 'expenses', 'includeFamilyHelp', 'reserveAlreadyExcluded']) {
    const s = M.defaults(); delete s[key]; assert.throws(() => M.validate(s));
  }
  const old = legacy(); delete old.land; assert.throws(() => M.migrateLegacy(old));
  const fractional = M.defaults(); fractional.months = 1.5; assert.throws(() => M.validate(fractional));
  const date = M.defaults(); date.reference = '2026-13'; assert.throws(() => M.validate(date));
  date.reference = ''; date.groups[0].referenceDate = '2026-02-30'; assert.throws(() => M.validate(date));
});
test('configuração privada parcial valida valores, mantém zeros e não aceita campos arbitrários', () => {
  const input = config => JSON.stringify({ type: 'consult-casa-config', version: 2, config });
  const s = M.readImport(input({ cash: 123000, familyHelp: 0, includeFamilyHelp: false, monthlySavings: 0 }));
  assert.equal(s.cash, 123000); assert.equal(s.monthlySavings, 0); assert.equal(s.scenarioName, 'personalizado');
  assert.throws(() => M.readImport(input({ cash: -1 })));
  assert.throws(() => M.readImport(input({ unknown: 1 })));
  assert.throws(() => M.readImport(input({ expenses: [] })));
  assert.equal(M.readImport(M.configTemplate()).groups.length, 11);
});
test('cenário personalizado pode ser recuperado após troca; gastos recentes não são perdidos', () => {
  const s = M.defaults(); s.groups[0].value = 123456; s.scenarioName = 'personalizado';
  let next = M.saveScenario(s, 'Exemplo de teste', 'scenario-test');
  next = M.applyPreset(next, 'economico');
  next.expenses.push({ id: 'new', date: '2026-10-01', category: 'Terreno', groupId: 'land', description: 'Exemplo', amount: 100, status: 'Pago' });
  const recovered = M.restoreScenario(next, 'scenario-test');
  assert.equal(recovered.groups[0].value, 123456);
  assert.equal(recovered.expenses.length, 1);
  assert.equal(recovered.expenses[0].amount, 100);
  assert.equal(recovered.scenarioName, 'personalizado');
  assert.equal(M.readImport(M.exportData(recovered)).savedScenarios.length, 1);
  assert.throws(() => M.restoreScenario(next, 'missing'));
});
test('migração aceita categorias antigas adicionais sem perder custo ou gasto', () => {
  const old = legacy(); old.categories.push(['Rubrica local extra', 250]);
  old.expenses.push({ id: 'extra', category: 'Rubrica local extra', description: 'Exemplo', date: '', amount: 0, status: 'A pagar' });
  const s = M.migrateLegacy(old);
  assert.equal(s.expenses.at(-1).category, 'Rubrica local extra');
  assert.equal(s.expenses.at(-1).groupId, 'completion');
  assert.ok(s.groups[9].subitems.some(i => i.description === 'Rubrica local extra'));
});
test('estado local inválido nunca é sobrescrito pela carga', () => {
  const store = storage(); store.setItem(M.STORAGE_KEY, '{invalid');
  assert.throws(() => M.load(store));
  assert.equal(store.getItem(M.STORAGE_KEY), '{invalid');
});
test('recuperação explícita de estado corrompido arquiva o original antes de restaurar', () => {
  const store = storage(); store.setItem(M.STORAGE_KEY, '{invalid');
  const s = M.defaults(); s.cash = 100;
  assert.throws(() => M.importInto(store, M.exportData(s), M.defaults()));
  assert.equal(store.getItem(M.STORAGE_KEY), '{invalid');
  M.importInto(store, M.exportData(s), M.defaults(), true);
  assert.equal(store.getItem(M.RECOVERY_KEY), '{invalid');
  assert.equal(M.load(store).state.cash, 100);
});
test('falha no backup impede substituir o estado atual', () => {
  const store = storage(); const s = M.defaults(); M.persist(store, s);
  const before = store.getItem(M.STORAGE_KEY);
  const blocked = { getItem: store.getItem, setItem: (key, value) => {
    if (key === M.BACKUP_KEY) throw Error('Armazenamento cheio');
    store.setItem(key, value);
  }};
  assert.throws(() => M.importInto(blocked, M.exportData(M.applyPreset(s, 'elevado')), s));
  assert.equal(store.getItem(M.STORAGE_KEY), before);
});
