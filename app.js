'use strict';
const M = CasaModel;
const $ = id => document.getElementById(id);
const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = value => JSON.parse(JSON.stringify(value));
let state = M.defaults(), storageLocked = false;
let startupMessage = '';
try {
  const loaded = M.load(localStorage);
  state = loaded.state;
  if (loaded.migrated) startupMessage = 'Dados v1 migrados: gastos e total preservados; a cópia v1 original continua no navegador. Revise a classificação dos subitens.';
} catch (error) {
  storageLocked = true;
  startupMessage = `Não foi possível carregar os dados locais: ${error.message} Nada foi sobrescrito. Baixe os dados locais originais antes de recuperar um backup.`;
}
function message(text) { $('storageMessage').textContent = text; }
function show(id) {
  ['base', 'budget', 'scenarios', 'actual', 'guide'].forEach(key => $(key).classList.toggle('hidden', key !== id));
}
function commit(mutator, budgetEdit = false, backup = false) {
  const next = clone(state);
  try {
    mutator(next);
    if (budgetEdit) next.scenarioName = 'personalizado';
    const checked = M.validate(next);
    if (storageLocked) throw new Error('Armazenamento local bloqueado para preservar dados originais. Baixe os originais e importe um backup válido.');
    M.persist(localStorage, checked, backup);
    state = checked;
    render(); message('Dados salvos somente neste navegador. Exporte JSON para guardar um backup privado.');
    return true;
  } catch (error) { message(error.message); render(); return false; }
}
const baseFields = [
  ['city', 'Cidade / UF', 'text'], ['reference', 'Data-base das hipóteses', 'month'],
  ['landArea', 'Área do terreno (m²)'], ['ceiling', 'Limite total do projeto (R$; zero = não definido)'],
  ['cash', 'Patrimônio inicial disponível para o projeto (R$)'],
  ['familyHelp', 'Ajuda familiar potencial (R$; não garantida)'],
  ['includeFamilyHelp', 'Incluir ajuda familiar, condicionada à confirmação', 'checkbox'],
  ['monthlySavings', 'Capacidade média de poupança mensal (R$)'],
  ['income', 'Renda líquida familiar mensal (R$)'],
  ['grossIncome1', 'Renda bruta comprovável — pessoa 1 (R$/mês)'],
  ['grossIncome2', 'Renda bruta comprovável — pessoa 2 (R$/mês)'],
  ['essential', 'Despesas familiares mensais (R$)'],
  ['preservedReserve', 'Reserva financeira preservada (R$)'],
  ['reserveAlreadyExcluded', 'A reserva já está fora do patrimônio disponível', 'checkbox'],
  ['currentApartment', 'Referência do apartamento atual (R$)'],
  ['largerApartment', 'Referência do apartamento maior (R$)'],
  ['horizonMonths', 'Horizonte temporal para poupança (meses)', 'integer', 600],
  ['inflation', 'Estresse de alta de custos anual (%)', 'number', 100],
  ['delay', 'Horizonte do estresse de custos (meses)', 'integer', 600]
];
const financeFields = [
  ['credit', 'Crédito solicitado / carta (R$)'], ['annual', 'Juros efetivos anuais (%)', 'number', 100],
  ['months', 'Prazo do financiamento (meses)', 'positiveInteger', 600],
  ['system', 'Amortização', ['SAC', 'Price']], ['fee', 'Seguro + encargos mensais fixos (R$)'],
  ['upfront', 'Custos iniciais exclusivos do crédito (R$)'],
  ['index', 'Correção anual simulada do saldo (%)', 'number', 100],
  ['admin', 'Administração total do consórcio (%)'], ['fund', 'Fundo de reserva total (%)'],
  ['consMonths', 'Prazo do consórcio (meses)', 'positiveInteger', 600],
  ['consIndex', 'Reajuste anual do consórcio (%)', 'number', 100],
  ['award', 'Mês hipotético de contemplação', 'positiveInteger', 600], ['bid', 'Lance com recursos próprios (R$)']
];
function field(id, label, type = 'number', max = 1e12) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const input = document.createElement(Array.isArray(type) ? 'select' : 'input');
  input.id = `field-${id}`;
  if (Array.isArray(type)) {
    type.forEach(option => {
      const opt = document.createElement('option');
      [opt.value, opt.textContent] = Array.isArray(option) ? option : [option, option];
      input.append(opt);
    });
  } else if (type === 'checkbox') {
    input.type = 'checkbox'; input.checked = state[id]; wrapper.classList.add('check');
  } else {
    input.type = ['integer', 'positiveInteger'].includes(type) ? 'number' : type;
    if (input.type === 'number') {
      input.min = type === 'positiveInteger' ? 1 : 0;
      input.max = max;
      input.step = ['integer', 'positiveInteger'].includes(type) ? 1 : 'any'; input.required = true;
    }
  }
  if (type !== 'checkbox') input.value = state[id];
  input.onchange = () => {
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const value = type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    if (id === 'scenarioName') { switchPreset(value); return; }
    commit(next => {
      next[id] = value;
      if (id === 'consMonths') next.award = Math.min(next.award, value);
    }, ['area', 'm2', 'constructionMode', 'contingencyMode', 'contingencyPercent'].includes(id));
  };
  wrapper.append(input); return wrapper;
}
function renderFields() {
  $('fields').replaceChildren(...baseFields.map(args => field(...args)));
  // Campos e funções legados ficam preservados; não integram a comparação principal.
  $('budgetControls').replaceChildren(
    field('scenarioName', 'Cenário de orçamento', [['economico', 'Econômico'], ['intermediario', 'Intermediário'], ['elevado', 'Elevado'], ['personalizado', 'Personalizado']]),
    field('area', 'Área construída (m²)'), field('m2', 'Construção por m² (R$)'),
    field('constructionMode', 'Método ativo da construção', [['area', 'Área × custo por m²'], ['global', 'Orçamento global recebido']]),
    field('contingencyMode', 'Método ativo da contingência', [['manual', 'Valor manual'], ['percent', 'Percentual da base selecionada']]),
    field('contingencyPercent', 'Contingência sobre a base (%)')
  );
  const base = $('contingencyBase'); base.replaceChildren();
  state.groups.filter(g => g.id !== 'contingency').forEach(group => {
    const label = document.createElement('label'); label.className = 'check';
    const input = document.createElement('input'); input.type = 'checkbox';
    input.checked = state.contingencyBaseIds.includes(group.id);
    input.disabled = state.contingencyMode !== 'percent';
    input.onchange = () => commit(next => {
      next.contingencyBaseIds = input.checked ? [...next.contingencyBaseIds, group.id] : next.contingencyBaseIds.filter(id => id !== group.id);
    }, true);
    label.append(input, document.createTextNode(group.label)); base.append(label);
  });
}
function editField(groupIndex, itemIndex, key, value, type = 'text', disabled = false) {
  const data = `data-group="${groupIndex}" data-item="${itemIndex}" data-key="${key}"`;
  if (type === 'textarea') return `<textarea ${data}>${esc(value)}</textarea>`;
  if (type === 'status') return `<select ${data}>${M.STATUSES.map(s => `<option ${value === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`;
  if (type === 'checkbox') return `<input ${data} type="checkbox" ${value ? 'checked' : ''}>`;
  return `<input ${data} type="${type}" value="${esc(value)}" ${type === 'number' ? 'min="0" max="1000000000000" step="any" required' : ''} ${disabled ? 'disabled' : ''}>`;
}
function metadataFields(g, item, value) {
  return `<label>Descrição${editField(g, item, 'description', value.description)}</label>
    <label>Fonte${editField(g, item, 'source', value.source)}</label>
    <label>Data de referência${editField(g, item, 'referenceDate', value.referenceDate, 'date')}</label>
    <label>Status${editField(g, item, 'status', value.status, 'status')}</label>
    <label>Inclusões / exclusões e observações${editField(g, item, 'notes', value.notes, 'textarea')}</label>`;
}
function renderGroups(b) {
  const open = [...$('categories').querySelectorAll('details[open]')].map(d => d.id);
  $('categories').innerHTML = state.groups.map((g, i) => {
    const calculated = (g.id === 'construction' && state.constructionMode === 'area') || (g.id === 'contingency' && state.contingencyMode === 'percent');
    const baseLabel = g.id === 'construction' ? 'Orçamento global recebido (R$; ativo apenas no método global)' : g.id === 'contingency' ? 'Contingência manual (R$; ativa apenas no modo manual)' : 'Valor-base do grupo (R$)';
    return `<details id="group-${g.id}" ${open.includes(`group-${g.id}`) ? 'open' : ''}><summary>${i + 1}. ${esc(g.label)} — ${money(b.values[g.id])}</summary>
      <div class="grid group-fields"><label>${baseLabel}${editField(i, -1, 'value', g.value, 'number', calculated)}</label>${metadataFields(i, -1, g)}</div>
      <p class="small">${calculated ? 'Valor-base calculado pelo método ativo; o valor manual é guardado, mas não é somado. ' : ''}Subitens já incluídos apenas detalham a proposta; somente subitens marcados como adicionais são somados ao valor-base. Status não altera o orçamento nem cria um pagamento no controle de gastos.</p>
      ${g.subitems.map((item, j) => `<div class="subitem"><h4>Subitem ${j + 1}</h4><div class="grid"><label>Valor do subitem (R$)${editField(i, j, 'value', item.value, 'number')}</label>${metadataFields(i, j, item)}<label class="check">${editField(i, j, 'includedInGroup', item.includedInGroup, 'checkbox')}Já incluído no valor-base (não somar novamente)</label></div><button class="danger" data-delete-group="${i}" data-delete-item="${j}">Excluir subitem</button></div>`).join('')}
      <button data-add-group="${i}">Adicionar subitem</button></details>`;
  }).join('');
}
$('categories').onchange = event => {
  const input = event.target;
  if (!input.dataset.key) return;
  if (!input.checkValidity()) { input.reportValidity(); return; }
  commit(next => {
    const group = next.groups[Number(input.dataset.group)];
    const itemIndex = Number(input.dataset.item);
    const target = itemIndex < 0 ? group : group.subitems[itemIndex];
    target[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
  }, true);
};
$('categories').onclick = event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.addGroup !== undefined) commit(next => {
    next.groups[Number(button.dataset.addGroup)].subitems.push({
      id: uniqueId(), description: 'Novo subitem', value: 0, source: '', referenceDate: '',
      status: 'estimado', notes: '', includedInGroup: true
    });
  }, true);
  if (button.dataset.deleteGroup !== undefined && confirm('Excluir este subitem do orçamento? Os gastos registrados serão preservados.')) {
    commit(next => next.groups[Number(button.dataset.deleteGroup)].subitems.splice(Number(button.dataset.deleteItem), 1), true, true);
  }
};
function card(title, value, detail) {
  return `<article class="card"><h3>${esc(title)}</h3><div class="number">${money(value)}</div><p>${esc(detail)}</p></article>`;
}
function renderResources(b, r) {
  $('resourceSummary').innerHTML = card('Disponível hoje sem ajuda', r.nowWithoutHelp, `Reserva descontada do patrimônio: ${money(r.deduction)}. Se já separada, o desconto é zero.`) +
    card('Ajuda familiar potencial', r.help, 'Não é saldo disponível hoje. No fluxo mensal, entra somente na data escolhida e se confirmada sua utilização.') +
    card('Poupança futura projetada', r.futureSavings, `${state.horizonMonths} meses × ${money(state.monthlySavings)}. Sem rentabilidade; aporte não somado novamente à renda.`) +
    card('Recursos potenciais sem calendário', r.projected, `Sem ajuda: ${money(r.projectedWithoutHelp)}. Referência da Etapa 1, não saldo de caixa. Confira datas, aportes e despesas no fluxo mensal antes de usar este valor.`) +
    card('Diferença entre apartamentos', state.largerApartment - state.currentApartment, 'Somente referência: não representa receita de venda, patrimônio líquido ou custo de troca.');
  const warnings = [];
  if (r.reserveShortfall) warnings.push(`A reserva excede o patrimônio informado em ${money(r.reserveShortfall)}; revise a disponibilidade.`);
  if (state.monthlySavings > Math.max(0, state.income - state.essential)) warnings.push('A poupança informada supera renda líquida menos despesas. Confirme a sustentabilidade dos aportes; a renda não é somada à poupança.');
  if (state.includeFamilyHelp) warnings.push('O cenário inclui ajuda familiar ainda condicionada à confirmação.');
  $('resourceWarnings').textContent = warnings.join(' ');
}
let schedules;
function renderLegacyFinancing(b, r) {
  const p = Math.min(state.credit, b.baseNoLand);
  const p2 = Math.min(state.credit, b.total - b.contingency);
  const a = Finance.loan(p, state.annual, state.months, state.system, state.fee, state.index);
  const a2 = Finance.loan(p2, state.annual, state.months, state.system, state.fee, state.index);
  const c = Finance.consortium(state.credit, state.admin, state.fund, state.consMonths, state.consIndex, state.award, state.bid);
  schedules = { a, a2, c };
  function financed(title, principal, l, total) {
    const rate = Finance.irrAnnual([-(principal - state.upfront), ...l.rows.map(row => row.payment)]);
    return card(title, total - principal + l.total + state.upfront,
      `Desembolso nominal: projeto + juros e encargos; contingência incluída. Recursos próprios necessários ao projeto: ${money(total - principal + state.upfront)}; falta hoje: ${money(Math.max(0, total - principal + state.upfront - r.now))}. Reserva preservada não é descontada novamente. Primeira parcela: ${money(l.first)}; última: ${money(l.last)}. Primeira/renda líquida: ${state.income ? (l.first / state.income * 100).toFixed(1) + '%' : 'indefinido'}. Taxa anual implícita: ${rate === null ? 'não calculável' : rate.toFixed(2) + '%'}. Não substitui CET oficial nem análise da renda bruta comprovável pelo banco.`);
  }
  $('results').innerHTML = card('1 · Recursos próprios', b.total,
    `Inclui terreno e contingência. Falta hoje: ${money(Math.max(0, b.total - r.now))}. Falta no horizonte: ${money(Math.max(0, b.total - r.projected))}. Reserva preservada já tratada na disponibilidade, sem dupla dedução. Ajuda familiar opcional e não garantida. Sem CET de crédito.`) +
    financed('2 · Terreno já disponível', p, a, b.withoutLand) +
    financed('3 · Terreno + construção', p2, a2, b.total) +
    card('4 · Consórcio / terreno disponível', c.total + Math.max(0, b.withoutLand - c.available),
      `Pagamentos ao grupo: ${money(c.total)}. Carta hipotética no mês ${state.award}: ${money(c.available)}. Complemento: ${money(Math.max(0, b.withoutLand - c.available))}. Parcela inicial sem lance: ${money(c.base)}. Contemplação não garantida. Lance próprio somado SEM reduzir parcelas, aproximação conservadora que exige recálculo contratual. Não há CET bancário equivalente. Seguro não incluído.`);
  $('schedule').innerHTML = Array.from({ length: Math.min(12, Math.max(state.months, state.consMonths)) }, (_, i) =>
    `<tr><td>${i + 1}</td><td>${money(a.rows[i]?.payment || 0)}</td><td>${money(a2.rows[i]?.payment || 0)}</td><td>${money(c.rows[i]?.payment || 0)}</td></tr>`).join('');
}
function paymentOptions(groupId, selected = '') {
  const payments = BudgetScheduler.allPayments(state).filter(p =>
    (p.treatment === 'additional' || (p.treatment === 'budget' && p.groupId === groupId)));
  return '<option value="">Sem vínculo — consome o saldo do grupo</option>' +
    (selected && !payments.some(p => p.id === selected) ? `<option value="${esc(selected)}" selected>Vínculo ausente: ${esc(selected)} — revisar</option>` : '') +
    payments.map(p => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>Mês ${p.month} · ${money(p.amount)} · ${esc(p.id)}</option>`).join('');
}
function renderExpenseLink() {
  const input = $('expensePaymentLink');
  const selected = input.value;
  input.innerHTML = paymentOptions($('category').value, selected);
  input.disabled = $('expenseCashTreatment').value === 'financing';
}
$('category').onchange = () => { $('expensePaymentLink').value = ''; renderExpenseLink(); };
$('expenseCashTreatment').onchange = renderExpenseLink;
function renderExpenses(b) {
  const selected = $('category').value;
  $('category').innerHTML = state.groups.map(g => `<option value="${g.id}">${esc(g.label)}</option>`).join('');
  if (selected) $('category').value = selected;
  renderExpenseLink();
  const paid = state.expenses.filter(e => e.status === 'Pago').reduce((sum, e) => sum + e.amount, 0);
  const pending = state.expenses.filter(e => e.status === 'A pagar').reduce((sum, e) => sum + e.amount, 0);
  $('actualSummary').innerHTML = card('Pago', paid, 'Saídas registradas.') + card('Contratado a pagar', pending, 'Compromissos registrados.') +
    card('Saldo do orçamento total', b.total - paid - pending, 'Inclui os 11 grupos. Não representa caixa nem custo estimado para concluir.');
  $('expenses').innerHTML = state.expenses.map((e, i) => `<tr><td>${esc(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.description)}</td><td>${money(e.amount)}</td><td><select data-expense-status="${i}"><option ${e.status === 'Pago' ? 'selected' : ''}>Pago</option><option ${e.status === 'A pagar' ? 'selected' : ''}>A pagar</option></select></td><td><select data-expense-link="${i}" ${e.cashTreatment === 'financing' ? 'disabled' : ''}>${paymentOptions(e.groupId, e.paymentId || '')}</select></td><td><select data-expense-treatment="${i}"><option value="budget">Despesa do projeto</option><option value="financing" ${e.cashTreatment === 'financing' ? 'selected' : ''}>Já no contrato</option></select></td><td><button class="danger" data-expense="${i}">Excluir</button></td></tr>`).join('');
  $('variance').innerHTML = '<table><tr><th>Grupo</th><th>Planejado</th><th>Pago + a pagar</th><th>Saldo</th></tr>' + state.groups.map(g => {
    const spent = state.expenses.filter(e => e.groupId === g.id).reduce((sum, e) => sum + e.amount, 0);
    return `<tr><td>${esc(g.label)}</td><td>${money(b.values[g.id])}</td><td>${money(spent)}</td><td>${money(b.values[g.id] - spent)}</td></tr>`;
  }).join('') + '</table>';
}
$('expenseForm').onsubmit = event => {
  event.preventDefault();
  if (!$('expenseForm').reportValidity()) return;
  const group = state.groups.find(g => g.id === $('category').value);
  if (commit(next => next.expenses.push({ id: uniqueId(), date: $('date').value, groupId: group.id,
    category: group.label, description: $('description').value, amount: Number($('amount').value), status: $('status').value,
    paymentId: $('expenseCashTreatment').value === 'financing' ? '' : $('expensePaymentLink').value, cashTreatment: $('expenseCashTreatment').value }))) {
    $('description').value = ''; $('amount').value = '';
  }
};
$('expenses').onchange = event => {
  const input = event.target;
  const key = ['expenseLink', 'expenseTreatment', 'expenseStatus'].find(k => input.dataset[k] !== undefined);
  if (!key) return;
  commit(next => {
    const expense = next.expenses[Number(input.dataset[key])];
    const property = { expenseLink: 'paymentId', expenseTreatment: 'cashTreatment', expenseStatus: 'status' }[key];
    expense[property] = input.value;
  }, false, true);
};
$('expenses').onclick = event => {
  const button = event.target.closest('button[data-expense]');
  if (button && confirm('Excluir este gasto? A versão anterior ficará no backup local.')) commit(next => next.expenses.splice(Number(button.dataset.expense), 1), false, true);
};
function render() {
  const b = M.budget(state), r = M.resources(state);
  renderFields(); renderGroups(b); renderResources(b, r); FinancialView.render(state, commit, M.budget(state)); renderExpenses(b);
  $('totals').innerHTML = card('Total dos 11 grupos', b.total, `Contingência incluída uma única vez: ${money(b.contingency)}.`) +
    card('Casa sem terreno', b.withoutLand, 'Terreno existente não é novo desembolso; sua disponibilidade precisa ser confirmada no caminho escolhido.') +
    card('Base da contingência', b.contingencyBase, state.contingencyMode === 'percent' ? `${state.contingencyPercent}% desta base + subitens adicionais da contingência.` : 'Modo manual: a base não altera a contingência informada.') +
    card('Estresse no horizonte', b.stress, 'Alta aplicada aos grupos sem terreno; terreno fixo. Não é cronograma de desembolsos.');
  if (state.ceiling > 0) $('totals').innerHTML += card('Saldo do limite do projeto', state.ceiling - b.total, 'Antes dos custos de crédito; a reserva familiar não integra o custo da casa.');
  const previous = $('savedScenarios').value;
  $('savedScenarios').innerHTML = '<option value="">Selecione um cenário salvo</option>' + state.savedScenarios.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  $('savedScenarios').value = previous;
}
function uniqueId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function switchPreset(name) {
  if (name === state.scenarioName) return;
  if (name === 'personalizado') { commit(next => { next.scenarioName = name; }); return; }
  if (!confirm('Substituir o orçamento por esta hipótese de 150 m²? O orçamento atual será salvo para recuperação; os gastos e as premissas financeiras serão mantidos.')) { render(); return; }
  commit(next => {
    const saved = M.saveScenario(next, `Antes de trocar para ${name} (${new Date().toLocaleString('pt-BR')})`, uniqueId());
    Object.assign(next, M.applyPreset(saved, name));
  }, false, true);
}
function saveCurrentScenario() {
  const name = $('snapshotName').value.trim();
  if (!name) { message('Informe um nome para salvar o cenário.'); return; }
  commit(next => Object.assign(next, M.saveScenario(next, name, uniqueId())));
}
function recoverScenario() {
  const id = $('savedScenarios').value;
  if (!id) { message('Selecione um cenário salvo.'); return; }
  if (confirm('Recuperar premissas e orçamento do cenário selecionado? Os gastos atuais serão mantidos; a versão anterior ficará no backup local.')) {
    commit(next => Object.assign(next, M.restoreScenario(next, id)), false, true);
  }
}
function deleteScenario() {
  const id = $('savedScenarios').value;
  if (!id) return;
  if (confirm('Excluir este cenário salvo?')) commit(next => { next.savedScenarios = next.savedScenarios.filter(s => s.id !== id); }, false, true);
}
function download(name, data, type) {
  const anchor = document.createElement('a');
  const url = URL.createObjectURL(new Blob([data], { type }));
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportData() { download('consult-casa-dados-v2.json', M.exportData(state), 'application/json'); }
function downloadTemplate() { download('consult-casa-configuracao-modelo.json', M.configTemplate(), 'application/json'); }
function downloadOriginal() {
  try {
    const raw = localStorage.getItem(M.RECOVERY_KEY) ?? localStorage.getItem(M.STORAGE_KEY) ?? localStorage.getItem(M.LEGACY_KEY);
    if (raw === null) { message('Ainda não há dados locais originais. Use Exportar dados JSON.'); return; }
    download('consult-casa-dados-originais.json', raw, 'application/json');
  } catch (error) { message(error.message); }
}
async function importFile(input, configOnly = false) {
  try {
    const file = input.files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 10 MB).');
    const raw = await file.text();
    if (configOnly) {
      const obj = JSON.parse(raw);
      if (obj.type !== 'consult-casa-config' || obj.version !== 2) throw new Error('Selecione uma configuração privada v2.');
    }
    M.readImport(raw);
    if (!confirm(configOnly ? 'Importar esta configuração inicial? O orçamento e as premissas serão substituídos; os gastos atuais e cenários salvos serão mantidos.' : 'Restaurar este arquivo? Premissas, orçamento, gastos e cenários serão substituídos pelos dados do backup. A versão atual será guardada como backup local.')) return;
    if (storageLocked && !confirm('Os dados locais atuais são inválidos. Restaurar o arquivo validado e arquivar os dados brutos originais neste navegador? Recomendamos baixá-los primeiro pelo botão Baixar dados locais originais.')) return;
    if (configOnly) {
      const next = M.readImport(raw); next.expenses = clone(state.expenses); next.savedScenarios = clone(state.savedScenarios);
      state = M.importInto(localStorage, M.exportData(next), state, storageLocked);
    } else state = M.importInto(localStorage, raw, state, storageLocked);
    storageLocked = false;
    render(); message('Arquivo validado e importado. O estado anterior foi preservado no backup local.');
  } catch (error) { message(`Importação não realizada: ${error.message}`); }
  finally { input.value = ''; }
}
$('import').onchange = event => importFile(event.target);
$('privateConfig').onchange = event => importFile(event.target, true);
function restoreLocalBackup() {
  try {
    if (!confirm('Restaurar o backup local anterior, incluindo gastos e cenários? O estado atual será guardado como backup de retorno.')) return;
    if (storageLocked && !confirm('Arquivar o original inválido e restaurar o backup local válido? Baixe antes os originais se desejar uma cópia externa.')) return;
    state = M.restoreBackup(localStorage, state, storageLocked); storageLocked = false; render(); message('Backup local restaurado.');
  } catch (error) { message(error.message); }
}
function downloadSchedule() {
  const rows = ['Mes;Financiamento construcao;Financiamento terreno e construcao;Consorcio'];
  for (let i = 0; i < Math.max(state.months, state.consMonths); i++) {
    rows.push([i + 1, ...[schedules.a, schedules.a2, schedules.c].map(s => (s.rows[i]?.payment || 0).toFixed(2).replace('.', ','))].join(';'));
  }
  download('cronograma.csv', '\ufeff' + rows.join('\n'), 'text/csv;charset=utf-8');
}
$('date').value = new Date().toISOString().slice(0, 10);
render(); message(startupMessage);
