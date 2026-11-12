/* Dados locais da VECTO. Não depende de DOM, rede ou do motor de financiamento. */
(function (root) {
  'use strict';
  const Planner = typeof module !== 'undefined' ? require('./planner') : root.FinancialPlanner;
  const Scheduler = typeof module !== 'undefined' ? require('./budget-schedule') : root.BudgetScheduler;
  const Homes = typeof module !== 'undefined' ? require('./housing') : root.Housing;
  const VERSION = 2;
  const STORAGE_KEY = 'consult-casa-v2';
  const BACKUP_KEY = 'consult-casa-backup-v2';
  const LEGACY_KEY = 'consult-casa-v1';
  const RECOVERY_KEY = 'consult-casa-recovery-original-v2';
  const GROUPS = [
    ['land', 'Terreno'], ['documents', 'Documentação e impostos'],
    ['studies', 'Estudos preliminares'], ['projects', 'Projetos arquitetônicos e complementares'],
    ['licenses', 'Regularizações e licenças'], ['preparation', 'Preparação do terreno'],
    ['construction', 'Construção da residência'], ['external', 'Áreas externas'],
    ['furniture', 'Mobiliário e eletrodomésticos'], ['completion', 'Despesas de conclusão'],
    ['contingency', 'Contingência da obra']
  ];
  const PRESETS = {
    economico: [250000, 10000, 6000, 30000, 6000, 60000, 600000, 25000, 60000, 8000, 66000],
    intermediario: [300000, 13000, 9000, 52000, 12000, 135000, 750000, 50000, 115000, 15000, 88500],
    elevado: [350000, 17000, 14000, 85000, 20000, 260000, 900000, 90000, 195000, 25000, 116000]
  };
  const STATUSES = ['estimado', 'cotado', 'contratado', 'pago'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function fail(message) { throw new Error(message); }
  function object(value, name) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name}: objeto inválido.`);
  }
  function number(value, name, max = 1e12) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) fail(`${name}: número inválido.`);
  }
  function text(value, name, max = 10000) {
    if (typeof value !== 'string' || value.length > max) fail(`${name}: texto inválido.`);
  }
  function choice(value, options, name) { if (!options.includes(value)) fail(`${name}: opção inválida.`); }
  function boolean(value, name) { if (typeof value !== 'boolean') fail(`${name}: opção inválida.`); }
  function date(value, name) {
    text(value, name, 10);
    if (!value) return;
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(value)) fail(`${name}: data inválida.`);
    const parts = value.split('-').map(Number);
    if (parts[1] < 1 || parts[1] > 12) fail(`${name}: mês inválido.`);
    if (parts.length === 3) {
      const d = new Date(`${value}T12:00:00Z`);
      if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) fail(`${name}: dia inválido.`);
    }
  }
  function metadata(item) {
    text(item.description, 'Descrição'); text(item.source, 'Fonte');
    date(item.referenceDate, 'Data de referência');
    choice(item.status, STATUSES, 'Status'); text(item.notes, 'Inclusões/exclusões');
  }
  function makeGroups(values) {
    return GROUPS.map(([id, label], i) => ({
      id, label, value: values[i], description: label,
      source: 'Hipótese de planejamento; não é cotação técnica verificada.',
      referenceDate: '', status: 'estimado', notes: '', subitems: []
    }));
  }
  function defaults() {
    const state = {
      schemaVersion: VERSION, city: 'São José dos Campos – SP', reference: '',
      area: 150, landArea: 250, m2: 5000, ceiling: 0,
      cash: 0, familyHelp: 0, includeFamilyHelp: false, monthlySavings: 0,
      income: 0, grossIncome1: 0, grossIncome2: 0, essential: 0,
      preservedReserve: 0, reserveAlreadyExcluded: true,
      currentApartment: 0, largerApartment: 0, horizonMonths: 12,
      inflation: 5, delay: 12,
      credit: 300000, annual: 11, months: 240, system: 'SAC', fee: 150,
      upfront: 3000, index: 0, admin: 20, fund: 2, consMonths: 180,
      consIndex: 5, award: 36, bid: 0,
      scenarioName: 'intermediario', constructionMode: 'area',
      contingencyMode: 'manual', contingencyPercent: 10,
      contingencyBaseIds: GROUPS.filter(([id]) => !['land', 'contingency'].includes(id)).map(([id]) => id),
      groups: makeGroups(PRESETS.intermediario), expenses: [], savedScenarios: []
    };
    state.planning = Planner.defaults(state);
    state.budgetSchedule = Scheduler.defaults();
    Homes.normalize(state);
    return Scheduler.synchronize(state);
  }
  const initialDefaults = defaults();
  const numericFields = Object.keys(initialDefaults).filter(key => typeof initialDefaults[key] === 'number' && key !== 'schemaVersion');
  function validateCore(state) {
    object(state, 'Dados');
    Planner.validate(state.planning);
    Homes.validate(state);
    if (state.schemaVersion !== VERSION) fail('Versão de dados incompatível.');
    numericFields.forEach(key => number(state[key], key));
    for (const key of ['months', 'consMonths']) {
      if (!Number.isInteger(state[key]) || state[key] < 1 || state[key] > 600) fail(`${key}: prazo entre 1 e 600 meses.`);
    }
    for (const key of ['horizonMonths', 'delay']) {
      if (!Number.isInteger(state[key]) || state[key] > 600) fail(`${key}: horizonte entre 0 e 600 meses.`);
    }
    if (!Number.isInteger(state.award) || state.award < 1 || state.award > state.consMonths) fail('Mês de contemplação inválido.');
    for (const key of ['annual', 'index', 'consIndex', 'inflation']) number(state[key], key, 100);
    text(state.city, 'Cidade'); date(state.reference, 'Data-base');
    boolean(state.includeFamilyHelp, 'Ajuda familiar'); boolean(state.reserveAlreadyExcluded, 'Reserva separada');
    choice(state.system, ['SAC', 'Price'], 'Amortização');
    choice(state.scenarioName, [...Object.keys(PRESETS), 'personalizado'], 'Cenário');
    choice(state.constructionMode, ['area', 'global'], 'Método de construção');
    choice(state.contingencyMode, ['percent', 'manual'], 'Método de contingência');
    if (!Array.isArray(state.groups) || state.groups.length !== 11) fail('O orçamento deve conter os 11 grupos.');
    state.groups.forEach((group, i) => {
      object(group, 'Grupo');
      if (group.id !== GROUPS[i][0] || group.label !== GROUPS[i][1]) fail('Identificação dos grupos inválida.');
      number(group.value, 'Valor do grupo'); metadata(group);
      if (!Array.isArray(group.subitems) || group.subitems.length > 500) fail('Subitens inválidos.');
      const ids = new Set();
      group.subitems.forEach(item => {
        object(item, 'Subitem'); text(item.id, 'Identificador', 100);
        if (!item.id || ids.has(item.id)) fail('Subitem duplicado ou sem identificador.');
        ids.add(item.id); metadata(item); number(item.value, 'Valor do subitem');
        boolean(item.includedInGroup, 'Inclusão na proposta');
      });
    });
    if (!Array.isArray(state.contingencyBaseIds) || new Set(state.contingencyBaseIds).size !== state.contingencyBaseIds.length ||
      state.contingencyBaseIds.some(id => !GROUPS.some(([key]) => key === id) || id === 'contingency')) fail('Base de contingência inválida.');
    if (!Array.isArray(state.expenses) || state.expenses.length > 50000) fail('Gastos inválidos.');
    state.expenses.forEach(expense => {
      object(expense, 'Gasto');
      if (typeof expense.id !== 'string' && (typeof expense.id !== 'number' || !Number.isFinite(expense.id))) fail('Identificador do gasto inválido.');
      text(expense.category, 'Categoria'); text(expense.description, 'Descrição do gasto');
      date(expense.date, 'Data do gasto'); number(expense.amount, 'Valor do gasto');
      choice(expense.status, ['Pago', 'A pagar'], 'Situação do gasto');
      choice(expense.groupId, GROUPS.map(([id]) => id), 'Grupo do gasto');
    });
    // Também impede que produtos/somas de valores individualmente válidos ultrapassem limites seguros.
    const b = budget(state), r = resources(state);
    [b.total, b.contingencyBase, b.stress, r.projected].forEach(value => number(value, 'Total calculado', Number.MAX_SAFE_INTEGER));
    return state;
  }
  function validate(state) {
    // Extensão aditiva de v2: não reescreve orçamento, gastos ou configurações antigas.
    state = clone(state);
    if (state && typeof state === 'object' && !own(state, 'planning')) state.planning = Planner.defaults(state);
    if (Array.isArray(state?.savedScenarios)) state.savedScenarios.forEach(s => {
      if (s?.data && typeof s.data === 'object' && !own(s.data, 'planning')) s.data.planning = Planner.defaults(s.data);
    });
    Homes.normalize(state);
    validateCore(state);
    state = Scheduler.synchronize(state);
    if (!Array.isArray(state.savedScenarios) || state.savedScenarios.length > 30) fail('Cenários salvos inválidos (máximo 30).');
    const ids = new Set();
    state.savedScenarios.forEach(s => {
      object(s, 'Cenário salvo'); text(s.id, 'Identificador', 100); text(s.name, 'Nome do cenário', 160);
      text(s.createdAt, 'Data de salvamento', 40);
      if (!s.id || ids.has(s.id) || !Number.isFinite(Date.parse(s.createdAt))) fail('Cenário salvo inválido.');
      ids.add(s.id); Homes.normalize(s.data); validateCore(s.data);
      s.data = Scheduler.synchronize(s.data);
      if (own(s.data, 'savedScenarios')) fail('Cenários não podem conter outros cenários.');
    });
    return clone(state);
  }
  function budget(state) { return Scheduler.budget(state); }
  function resources(state) {
    const deduction = state.reserveAlreadyExcluded ? 0 : state.preservedReserve;
    const nowWithoutHelp = Math.max(0, state.cash - deduction);
    const help = state.includeFamilyHelp ? state.familyHelp : 0;
    const futureSavings = state.monthlySavings * state.horizonMonths;
    return { deduction, nowWithoutHelp, help, now: nowWithoutHelp + help,
      futureSavings, projectedWithoutHelp: nowWithoutHelp + futureSavings,
      projected: nowWithoutHelp + help + futureSavings,
      reserveShortfall: Math.max(0, deduction - state.cash) };
  }
  function snapshot(state, name, id, createdAt = new Date().toISOString()) {
    text(name, 'Nome do cenário', 160);
    const data = clone(state); delete data.savedScenarios;
    return { id, name, createdAt, data };
  }
  function saveScenario(state, name, id) {
    const result = clone(state);
    if (result.savedScenarios.length >= 30) fail('Exclua um cenário salvo antes de salvar outro.');
    result.savedScenarios.push(snapshot(state, name, id));
    return validate(result);
  }
  function restoreScenario(state, id) {
    const saved = state.savedScenarios.find(s => s.id === id);
    if (!saved) fail('Cenário não encontrado.');
    // Recupera premissas e orçamento, sem apagar gastos registrados depois do cenário.
    return validate(Scheduler.preserveProtected(state, { ...clone(saved.data), expenses: clone(state.expenses), savedScenarios: clone(state.savedScenarios) }));
  }
  function applyPreset(state, name) {
    const result = clone(state);
    if (name === 'personalizado') { result.scenarioName = name; return validate(result); }
    if (!own(PRESETS, name)) fail('Cenário inválido.');
    result.groups = makeGroups(PRESETS[name]);
    result.area = 150; result.m2 = PRESETS[name][6] / 150;
    result.constructionMode = 'area'; result.contingencyMode = 'manual';
    result.scenarioName = name;
    return validate(result);
  }
  const legacyLabels = [
    'Diligência do terreno, sondagem e topografia', 'ITBI, escritura/contrato e registro',
    'Arquitetura, projetos complementares e compatibilização', 'Engenharia, responsabilidade técnica e gestão',
    'Aprovações, taxas, alvarás e certificados', 'Canteiro, ligações provisórias e logística',
    'Seguro de obra e segurança', 'Regularização fiscal/previdenciária da obra',
    'Habite-se, averbação e documentação final', 'Ligações definitivas, calçada e paisagismo',
    'Móveis, eletros e decoração', 'Aluguel durante a obra, mudança e sobreposição'
  ];
  const legacyMapping = ['studies', 'documents', 'projects', 'construction', 'licenses', 'preparation',
    'construction', 'licenses', 'completion', 'external', 'furniture', 'completion'];
  function legacyGroup(label) {
    if (label === 'Terreno') return 'land';
    if (label === 'Construção') return 'construction';
    const i = legacyLabels.indexOf(label);
    return i < 0 ? 'completion' : legacyMapping[i];
  }
  function migrateLegacy(old) {
    object(old, 'Dados legados');
    // Campos críticos de orçamento não podem faltar; campos financeiros opcionais usam zero/default.
    for (const key of ['area', 'm2', 'land', 'contingency']) number(old[key], key);
    if (!Array.isArray(old.categories) || !Array.isArray(old.expenses)) fail('Dados legados incompletos.');
    const result = defaults();
    for (const key of [...numericFields, 'city', 'reference', 'system']) {
      if (own(old, key)) result[key] = clone(old[key]);
    }
    result.preservedReserve = (own(old, 'essential') ? old.essential : 0) * (own(old, 'emergencyMonths') ? old.emergencyMonths : 0);
    result.reserveAlreadyExcluded = false; // v1 somava a reserva à necessidade e comparava com cash.
    result.horizonMonths = own(old, 'delay') ? old.delay : 12;
    result.scenarioName = 'personalizado'; result.constructionMode = 'area';
    result.contingencyMode = 'percent'; result.contingencyPercent = old.contingency;
    result.groups = makeGroups(Array(11).fill(0));
    result.groups.forEach(g => { g.source = 'Migrado do orçamento v1; revisar classificação e inclusões.'; });
    result.groups[0].value = old.land;
    result.groups[6].value = old.area * old.m2;
    old.categories.forEach((pair, i) => {
      if (!Array.isArray(pair) || pair.length !== 2) fail('Categoria legada inválida.');
      text(pair[0], 'Categoria legada'); number(pair[1], 'Valor legado');
      const group = result.groups.find(g => g.id === legacyGroup(pair[0]));
      group.subitems.push({ id: `migrated-${i}`, description: pair[0], value: pair[1],
        source: 'Importado da versão 1.', referenceDate: '', status: 'estimado',
        notes: 'Rubrica original preservada; adicional ao valor-base do grupo.', includedInGroup: false });
    });
    result.expenses = old.expenses.map(e => ({ ...clone(e), groupId: legacyGroup(e.category) }));
    result.planning = Planner.defaults(result);
    result.budgetSchedule = Scheduler.defaults();
    result.housing = Homes.defaults(result);
    return validate(result);
  }
  function readImport(raw) {
    let obj;
    try { obj = JSON.parse(raw); } catch { fail('JSON inválido.'); }
    object(obj, 'Arquivo');
    if (obj.version === 1) return migrateLegacy(obj.state);
    if (obj.version === VERSION && obj.type === 'consult-casa-config') {
      object(obj.config, 'Configuração privada');
      const merged = defaults();
      for (const [key, value] of Object.entries(obj.config)) {
        if (!own(merged, key) || ['schemaVersion', 'savedScenarios', 'expenses'].includes(key)) fail(`Campo não permitido na configuração: ${key}`);
        merged[key] = clone(value);
      }
      // Configurações privadas são pontos de partida, não cotações verificadas.
      merged.scenarioName = 'personalizado';
      if (!own(obj.config, 'planning')) merged.planning = Planner.defaults(merged);
      if (!own(obj.config, 'housing')) merged.housing = Homes.defaults(merged);
      return validate(merged);
    }
    if (obj.version !== VERSION || obj.type !== 'consult-casa-backup') fail('Formato de arquivo incompatível.');
    return validate(obj.state);
  }
  function exportData(state) { return JSON.stringify({ type: 'consult-casa-backup', version: VERSION, state: validate(state) }, null, 2); }
  function configTemplate() {
    const config = defaults(); delete config.schemaVersion; delete config.expenses; delete config.savedScenarios;
    return JSON.stringify({ type: 'consult-casa-config', version: VERSION, config }, null, 2);
  }
  function persist(storage, state, backup = false) {
    const raw = exportData(state);
    // Valida e guarda o anterior ANTES de substituí-lo. Falha no backup impede a substituição.
    const previous = storage.getItem(STORAGE_KEY);
    if (backup && previous) {
      readImport(previous);
      storage.setItem(BACKUP_KEY, previous);
    }
    storage.setItem(STORAGE_KEY, raw);
  }
  function load(storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) return { state: readImport(raw), migrated: false };
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy !== null) {
      let old; try { old = JSON.parse(legacy); } catch { fail('Dados antigos inválidos; original preservado.'); }
      const state = old.version === 1 ? readImport(legacy) : migrateLegacy(old);
      persist(storage, state); // A chave v1 permanece intacta para recuperação.
      return { state, migrated: true };
    }
    return { state: defaults(), migrated: false };
  }
  function importInto(storage, raw, current, allowInvalidPrevious = false) {
    const state = readImport(raw); // Nunca altera o armazenamento se o arquivo for inválido.
    const previous = storage.getItem(STORAGE_KEY);
    if (previous !== null) {
      try { readImport(previous); }
      catch (error) {
        if (!allowInvalidPrevious) throw error;
        // Recuperação explicitamente autorizada: conserva o bruto antes de restaurar o válido.
        if (storage.getItem(RECOVERY_KEY) !== null) fail('Já existe um original arquivado. Exporte e remova esse arquivo local antes de outra recuperação assistida.');
        storage.setItem(RECOVERY_KEY, previous);
        if (current) storage.setItem(BACKUP_KEY, exportData(current));
        storage.setItem(STORAGE_KEY, exportData(state));
        return state;
      }
    }
    if (previous === null && current) storage.setItem(BACKUP_KEY, exportData(current));
    persist(storage, state, true);
    return state;
  }
  function restoreBackup(storage, current, allowInvalidPrevious = false) {
    const raw = storage.getItem(BACKUP_KEY);
    if (!raw) fail('Não há backup local disponível.');
    return importInto(storage, raw, current, allowInvalidPrevious); // Mantém a versão anterior como backup de retorno.
  }
  const api = { VERSION, STORAGE_KEY, BACKUP_KEY, LEGACY_KEY, RECOVERY_KEY, GROUPS, PRESETS, STATUSES,
    defaults, validate, budget, resources, applyPreset, saveScenario, restoreScenario,
    migrateLegacy, readImport, exportData, configTemplate, persist, load, importInto, restoreBackup };
  if (typeof module !== 'undefined') module.exports = api;
  root.CasaModel = api;
})(globalThis);
