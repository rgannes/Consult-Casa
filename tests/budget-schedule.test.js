'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../budget-schedule'), M = require('../model'), P = require('../planner');
const sum = rows => Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
function fixture() {
  const s = M.defaults();
  Object.assign(s.planning, { startDate: '2026-11-01', firstDate: '2026-11-01', principal: 0, annualRate: 0, fees: 0, upfront: 0 });
  return s;
}
const group = (s, id = 'construction') => s.budgetSchedule.groups.find(g => g.groupId === id);
function expense(s, payment, overrides = {}) {
  s.expenses.push({ id: 'ficticio', date: '2026-11-10', category: 'Construção da residência', groupId: 'construction', description: 'Gasto fictício',
    amount: payment?.amount || 1000, status: 'Pago', paymentId: payment?.id || '', cashTreatment: 'budget', ...overrides });
}
test('11 grupos geram cronograma que fecha exatamente com o orçamento', () => {
  const s = fixture(), r = B.resolve(s);
  assert.equal(r.groupReports.length, 11);
  assert.equal(r.totals.programmed, 1539500);
  assert.equal(r.totals.difference, 0);
  assert.ok(r.groupReports.every(g => g.difference === 0));
  assert.equal(sum(r.events), r.totals.budget);
  assert.equal(P.calculate(s).flow.totals.projectPayments + P.calculate(s).flow.totals.constructionPayments, 1539500);
});
test('construção de 750 mil para 900 mil atualiza automaticamente o fluxo', () => {
  const s = fixture(), before = P.calculate(s);
  s.constructionMode = 'global'; s.groups[6].value = 900000;
  const after = P.calculate(s);
  assert.equal(after.schedule.groupReports.find(r => r.groupId === 'construction').programmed, 900000);
  assert.equal(after.scheduledProjectTotal - before.scheduledProjectTotal, 150000);
  assert.equal(after.flow.totals.closingCash, before.flow.totals.closingCash - 150000);
  assert.equal(after.schedule.totals.difference, 0);
});
test('área e m² também atualizam a fonte única do cronograma sem duplicar o global', () => {
  const s = fixture(); s.area = 180; s.m2 = 5000;
  assert.equal(B.resolve(s).groupReports.find(r => r.groupId === 'construction').programmed, 900000);
  s.constructionMode = 'global'; s.groups[6].value = 0;
  assert.equal(B.resolve(s).groupReports.find(r => r.groupId === 'construction').programmed, 0);
});
test('distribuição mensal fecha centavos e aceita orçamento zero', () => {
  const s = fixture(); s.constructionMode = 'global'; s.groups[6].value = 100.01;
  const r = B.synchronize(s); assert.equal(sum(group(r).payments), 100.01);
  s.groups[6].value = 0; assert.equal(group(B.synchronize(s)).payments.length, 0);
});
test('pagamento único e mensal são editáveis, sem curva técnica presumida', () => {
  let s = fixture(); group(s).mode = 'single'; group(s).followTimeline = false; group(s).startMonth = 4;
  s = M.validate(s); assert.deepEqual(group(s).payments.map(p => [p.month, p.amount]), [[4, 750000]]);
  group(s).mode = 'monthly'; group(s).months = 3;
  s = M.validate(s); assert.deepEqual(group(s).payments.map(p => [p.month, p.amount]), [[4, 250000], [5, 250000], [6, 250000]]);
});
test('prazo, início, aquisição e atraso movem apenas previsões automáticas', () => {
  let s = fixture(); s.budgetSchedule.landMonth = 2; s.planning.projectStartMonth = 3;
  s.planning.constructionMonths = 6; s.planning.constructionDelay = 2;
  s = M.validate(s);
  assert.equal(group(s, 'land').payments[0].month, 2);
  assert.deepEqual(group(s).payments.map(p => p.month), [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(group(s, 'furniture').payments[0].month, 11);
  assert.equal(B.resolve(s).totals.difference, 0);
});
test('mudança explicitamente definida é preservada em caso de atraso, com alerta', () => {
  const s = fixture(); s.budgetSchedule.moveDate = '2027-05-20'; s.planning.constructionDelay = 3;
  const r = B.resolve(s);
  assert.equal(r.timeline.moveMonth, 7);
  assert.equal(group(r.state, 'furniture').payments[0].month, 7);
  assert.ok(r.warnings.some(w => w.includes('precede')));
});
for (const status of ['confirmed', 'paid']) test(`pagamento ${status} não muda ao atualizar valor e prazo`, () => {
  let s = fixture(); group(s).payments[0].status = status;
  const original = structuredClone(group(s).payments[0]);
  s.constructionMode = 'global'; s.groups[6].value = 900000; s.planning.projectStartMonth = 3; s.planning.constructionDelay = 2;
  s = M.validate(s);
  assert.deepEqual(group(s).payments.find(p => p.id === original.id), original);
  assert.equal(B.resolve(s).groupReports.find(r => r.groupId === 'construction').programmed, 900000);
});
test('cronograma manual do profissional não é sobrescrito por valor, prazo ou atraso', () => {
  let s = fixture(), g = group(s); g.mode = 'manual'; g.source = 'Exemplo fictício fornecido pelo profissional';
  g.payments = [{ id: 'prof:1', month: 3, amount: 350000, status: 'planned', fixed: true, origin: 'manual' },
    { id: 'prof:2', month: 9, amount: 400000, status: 'planned', fixed: true, origin: 'manual' }];
  const original = structuredClone(g);
  s.constructionMode = 'global'; s.groups[6].value = 900000; s.planning.constructionDelay = 3;
  s = M.validate(s);
  assert.deepEqual(group(s), original);
  assert.equal(B.resolve(s).groupReports.find(r => r.groupId === 'construction').difference, 150000);
});
test('fixar uma linha preserva seu valor e mês, redistribuindo apenas o restante', () => {
  let s = fixture(); const p = group(s).payments[0]; p.fixed = true;
  const original = structuredClone(p);
  s.groups[6].value = 900000; s.constructionMode = 'global'; s = M.validate(s);
  assert.deepEqual(group(s).payments[0], original);
  assert.equal(sum(group(s).payments), 900000);
});
test('vínculo de gasto pago substitui previsão integral, sem outra saída', () => {
  const s = fixture(), p = group(s).payments[0]; expense(s, p);
  const r = B.resolve(s);
  assert.equal(r.totals.paid, p.amount);
  assert.equal(r.totals.future, r.totals.budget - p.amount);
  assert.equal(sum(r.events), r.totals.budget);
  assert.equal(r.events.filter(e => e.id === 'expense:ficticio').length, 1);
  assert.ok(!r.events.some(e => e.id === p.id));
  assert.equal(P.calculate(s).flow.totals.constructionPayments, 750000);
});
test('vários gastos parciais vinculados deixam somente o residual previsto', () => {
  const s = fixture(), p = group(s).payments[0];
  expense(s, p, { id: 'a', amount: 10000 }); expense(s, p, { id: 'b', amount: 5000, status: 'A pagar' });
  const r = B.resolve(s);
  assert.equal(r.events.find(e => e.id === p.id).amount, p.amount - 15000);
  assert.equal(r.totals.paid, 10000); assert.equal(sum(r.events), r.totals.budget);
  assert.equal(r.events.filter(e => e.id.startsWith('expense:')).length, 2);
});
test('gasto maior que previsão é contado uma vez e consome o saldo automático futuro', () => {
  const s = fixture(), p = group(s).payments[0]; expense(s, p, { amount: 100000 });
  const r = B.resolve(s);
  assert.equal(r.totals.paid, 100000); assert.equal(r.totals.difference, 0);
  assert.equal(sum(r.events), r.totals.budget);
  assert.ok(r.warnings.some(w => w.includes('excedem o previsto')));
});
test('gasto sem vínculo consome o orçamento automático sem somar novamente o grupo completo', () => {
  const s = fixture(); expense(s, null, { amount: 1000 });
  const r = B.resolve(s);
  assert.equal(sum(group(r.state).payments), 749000);
  assert.equal(r.totals.programmed, r.totals.budget);
  assert.equal(P.calculate(s).flow.totals.constructionPayments, 750000);
});
test('pago declarado e gasto vinculado não duplicam o realizado', () => {
  const s = fixture(), p = group(s).payments[0]; p.status = 'paid'; expense(s, p);
  const r = B.resolve(s); assert.equal(r.totals.paid, p.amount); assert.equal(sum(r.events), r.totals.budget);
});
test('gasto antes da origem já integra orçamento, sem novo débito sobre o caixa inicial', () => {
  const s = fixture(), p = group(s).payments[0]; expense(s, p, { date: '2026-10-01' });
  const r = B.resolve(s);
  assert.equal(r.totals.pastPaid, p.amount);
  assert.equal(sum(r.events), r.totals.budget - p.amount);
  assert.equal(r.totals.programmed, r.totals.budget);
});
test('pagamentos manuais anteriores exigem classificação, e classificados consomem o grupo', () => {
  const s = fixture(); s.planning.projectPayments.push({ id: 'old', description: 'Pagamento legado fictício', month: 2, amount: 100000, kind: 'construction' });
  assert.throws(() => P.calculate(s), /Classifique/);
  s.budgetSchedule.legacyAssignments.push({ eventId: 'old', treatment: 'budget', groupId: 'construction' });
  const r = P.calculate(s); assert.equal(r.schedule.totals.difference, 0); assert.equal(r.flow.totals.constructionPayments, 750000);
  expense(s, { id: 'legacy:old', amount: 100000 });
  assert.equal(P.calculate(s).flow.totals.constructionPayments, 750000);
});
test('juros e amortizações do contrato não se duplicam por registro manual ou gasto real', () => {
  const s = fixture(); Object.assign(s.planning, { principal: 1200, months: 12 });
  expense(s, null, { amount: 100, cashTreatment: 'financing' });
  s.planning.projectPayments.push({ id: 'fee', description: 'Parcela já no contrato', month: 1, amount: 100, kind: 'project' });
  s.budgetSchedule.legacyAssignments.push({ eventId: 'fee', treatment: 'financing' });
  const r = P.calculate(s);
  assert.equal(r.flow.totals.installments, 1200);
  assert.equal(r.schedule.totals.programmed, 1539500);
  assert.equal(r.flow.totals.constructionPayments + r.flow.totals.projectPayments, 1539500);
  assert.equal(r.flow.totals.funding, 1200);
});
test('adicional fora do orçamento é separado da reconciliação e pode ter gasto vinculado', () => {
  const s = fixture(); s.planning.projectPayments.push({ id: 'extra', description: 'Adicional fictício', month: 2, amount: 50, kind: 'project' });
  s.budgetSchedule.legacyAssignments.push({ eventId: 'extra', treatment: 'additional' });
  expense(s, { id: 'legacy:extra', amount: 50 }, { date: '2026-12-01' });
  const r = P.calculate(s);
  assert.equal(r.schedule.totals.additional, 50); assert.equal(r.schedule.totals.difference, 0);
  assert.equal(sum(r.schedule.events), 1539550);
});
test('liberação posterior ao fornecedor gera falta temporária, mesmo com caixa final positivo', () => {
  const s = fixture(); s.groups.forEach(g => { g.value = 0; }); s.constructionMode = 'global'; s.groups[6].value = 9000;
  group(s).mode = 'single'; s.monthlySavings = 1000;
  Object.assign(s.planning, { useConstruction: true, principal: 9000, months: 12, constructionMonths: 2, amortizationStartMonth: 3,
    draws: [{ id: 'draw', description: 'Liberação fictícia posterior', month: 2, amount: 9000 }] });
  const r = P.calculate(s);
  assert.equal(r.flow.rows[0].funding, 0); assert.equal(r.flow.rows[0].constructionPayments, 9000);
  assert.equal(r.flow.totals.firstNegativeMonth, 1); assert.equal(r.flow.totals.additionalCapital, 8000);
  assert.ok(r.flow.totals.closingCash > 0);
});
test('fixados excedendo orçamento geram alerta sem serem reduzidos ou apagados', () => {
  const s = fixture(); const p = group(s).payments[0]; p.fixed = true; p.amount = 1000000;
  const r = B.resolve(s);
  assert.equal(group(r.state).payments[0].amount, 1000000);
  assert.equal(r.groupReports.find(g => g.groupId === 'construction').difference, -250000);
  assert.ok(r.warnings.some(w => w.includes('excedem o orçamento')));
});
test('cronograma manual divergente e linhas potencialmente duplicadas são alertados', () => {
  const s = fixture(), g = group(s); g.mode = 'manual'; g.payments = [
    { id: 'a', month: 1, amount: 100, status: 'planned', fixed: true, origin: 'manual' },
    { id: 'b', month: 1, amount: 100, status: 'planned', fixed: true, origin: 'manual' }];
  const r = B.resolve(s);
  assert.ok(r.warnings.some(w => w.includes('duplicidade'))); assert.ok(r.warnings.some(w => w.includes('não distribuídos')));
  g.payments[1].id = 'a'; assert.throws(() => M.validate(s), /duplicado/);
});
test('importação v2 anterior adiciona programação sem apagar gastos e orçamentos', () => {
  const s = fixture(); expense(s, null); delete s.budgetSchedule;
  const imported = M.readImport(JSON.stringify({ type: 'consult-casa-backup', version: 2, state: s }));
  assert.deepEqual(imported.expenses, s.expenses); assert.deepEqual(imported.groups, s.groups);
  assert.equal(B.resolve(imported).totals.difference, 0);
  assert.deepEqual(M.readImport(M.exportData(imported)), imported);
});
test('recuperação de cenário conserva pagamentos confirmados e gastos posteriores', () => {
  let s = fixture(); s = M.saveScenario(s, 'Fictício', 'snapshot');
  const p = group(s).payments[0]; p.status = 'confirmed'; p.amount = 10000;
  expense(s, p, { amount: 5000 }); s = M.validate(s);
  const restored = M.restoreScenario(s, 'snapshot');
  assert.equal(group(restored).payments.find(row => row.id === p.id).amount, 10000);
  assert.equal(group(restored).payments.find(row => row.id === p.id).status, 'confirmed');
  assert.equal(restored.expenses[0].amount, 5000);
  assert.equal(B.resolve(restored).totals.difference, 0);
});
test('cronograma manual preservado ao recuperar cenário anterior', () => {
  let s = M.saveScenario(fixture(), 'Antes', 'snapshot'); group(s).mode = 'manual';
  group(s).payments = [{ id: 'manual:preserve', month: 4, amount: 750000, fixed: false, status: 'planned', origin: 'manual' }];
  s = M.validate(s); const restored = M.restoreScenario(s, 'snapshot');
  assert.ok(group(restored).payments.some(p => p.id === 'manual:preserve' && p.amount === 750000));
});
test('backup local mantém vínculos, pagamentos fixados e restauração integral', () => {
  const data = new Map(), storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  let s = fixture(); expense(s, group(s).payments[0]); s = M.validate(s); M.persist(storage, s);
  const next = structuredClone(s); next.groups[6].value = 900000; next.constructionMode = 'global';
  M.importInto(storage, M.exportData(M.validate(next)), s);
  assert.deepEqual(M.restoreBackup(storage, next), s);
});
test('centavos dos grupos e da contingência usam a mesma base da reconciliação', () => {
  const s = fixture(); s.constructionMode = 'global'; s.groups.forEach(g => { g.value = .004; });
  const r = B.resolve(s); assert.equal(r.totals.budget, 0); assert.equal(r.totals.difference, 0);
  s.groups[6].value = 100.015; assert.equal(B.resolve(s).totals.difference, 0);
});
test('gastos com identificadores duplicados são preservados e bloqueiam um fluxo não confiável', () => {
  const s = fixture(); expense(s, null); expense(s, null);
  const r = B.resolve(s); assert.ok(r.warnings.some(w => w.includes('duplicados')));
  assert.equal(r.state.expenses.length, 2); assert.throws(() => P.calculate(s), /duplicados/);
});
test('vínculo órfão é sinalizado sem apagar ou repetir o gasto no total', () => {
  const s = fixture(); expense(s, null, { paymentId: 'ausente' });
  const r = B.resolve(s); assert.equal(r.totals.difference, 0); assert.equal(r.totals.paid, 1000);
  assert.ok(r.warnings.some(w => w.includes('não encontrado')));
});
