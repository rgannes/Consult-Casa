/* Edição dos cronogramas e reconciliação do orçamento; nenhum envio de dados. */
(function (root) {
  'use strict';
  const B = root.BudgetScheduler, E = root.FinancialEngine;
  const $ = id => document.getElementById(id);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const statuses = { planned: 'Previsto', confirmed: 'Confirmado / contratado', paid: 'Pago declarado' };
  function input(group, index, key, value, type = 'number', disabled = false) {
    return `<input data-group="${group}" data-index="${index}" data-key="${key}" type="${type}" ${type === 'checkbox' ? (value ? 'checked' : '') : `value="${esc(value)}"`} ${type === 'number' ? `min="${key === 'amount' ? 0 : 1}" max="${key === 'amount' ? 1e12 : 1200}" step="${key === 'amount' ? '.01' : 1}" required` : ''} ${disabled ? 'disabled' : ''}>`;
  }
  function render(state, change) {
    const open = [...$('budgetScheduleGroups').querySelectorAll('details[open]')].map(el => el.id);
    const result = B.resolve(state), s = result.state;
    $('schedule-landMonth').value = s.budgetSchedule.landMonth;
    $('schedule-moveDate').value = s.budgetSchedule.moveDate;
    $('schedule-landMonth').onchange = event => {
      if (event.target.reportValidity()) change(next => { next.budgetSchedule.landMonth = Number(event.target.value); });
    };
    $('schedule-moveDate').onchange = event => change(next => { next.budgetSchedule.moveDate = event.target.value; });
    $('budgetScheduleSummary').innerHTML = `<p><strong>Orçamento total:</strong> ${money(result.totals.budget)} · <strong>Programado + realizado:</strong> ${money(result.totals.programmed)} · <strong>Pago do projeto:</strong> ${money(result.totals.paid)} · <strong>Compromissos futuros:</strong> ${money(result.totals.future)} · <strong>Adicionais fora do orçamento:</strong> ${money(result.totals.additional)}.</p><p>Saldo disponível é mostrado no fluxo de caixa, separado destes totais. Pago inclui valores declarados no cronograma e gastos vinculados, sem somá-los duas vezes. Mudança no mês ${result.timeline.moveMonth}; pagamentos anteriores ao início já pagos: ${money(result.totals.pastPaid)}, sem novo débito no caixa inicial.</p>`;
    $('budgetReconciliation').innerHTML = '<table><thead><tr><th>Grupo</th><th>Orçamento</th><th>Programado/realizado</th><th>Pago</th><th>Futuro</th><th>Não distribuído (+) / excesso (−)</th></tr></thead><tbody>' + result.groupReports.map(r => `<tr class="${r.difference ? 'negative' : ''}"><td>${esc(r.label)}</td><td>${money(r.budget)}</td><td>${money(r.programmed)}</td><td>${money(r.paid)}</td><td>${money(r.future)}</td><td>${money(r.difference)}</td></tr>`).join('') + '</tbody></table>';
    $('budgetScheduleWarnings').innerHTML = result.warnings.map(w => `<li>${esc(w)}</li>`).join('');
    $('legacyBudgetClassification').innerHTML = state.planning.projectPayments.length ? '<h4>Classifique os pagamentos manuais da Etapa 2</h4><p>Esses registros foram preservados. Escolha o grupo para consumirem o orçamento; “adicional” soma fora dele; “já no contrato” não cria outra saída.</p>' + state.planning.projectPayments.map(e => {
      const a = state.budgetSchedule.legacyAssignments.find(a => a.eventId === e.id);
      const selected = a ? (a.treatment === 'budget' ? a.groupId : a.treatment) : '';
      return `<label>${esc(e.description)} — ${money(e.amount)} — mês ${e.month}<select data-legacy="${esc(e.id)}"><option value="">Revisar antes de calcular</option>${state.groups.map(g => `<option value="${g.id}" ${selected === g.id ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}<option value="additional" ${selected === 'additional' ? 'selected' : ''}>Adicional fora do orçamento</option><option value="financing" ${selected === 'financing' ? 'selected' : ''}>Já incluído no contrato (não duplicar)</option></select></label>`;
    }).join('') : '';
    $('legacyBudgetClassification').onchange = event => {
      const id = event.target.dataset.legacy; if (!id) return;
      change(next => {
        next.budgetSchedule.legacyAssignments = next.budgetSchedule.legacyAssignments.filter(a => a.eventId !== id);
        const value = event.target.value;
        if (value) next.budgetSchedule.legacyAssignments.push({ eventId: id, treatment: ['additional', 'financing'].includes(value) ? value : 'budget', groupId: value });
      });
    };
    $('budgetScheduleGroups').innerHTML = s.budgetSchedule.groups.map((g, index) => {
      const w = B.windowFor(s, g);
      return `<details id="payment-group-${g.groupId}" ${open.includes(`payment-group-${g.groupId}`) ? 'open' : ''}><summary>${esc(state.groups[index].label)} — editar cronograma</summary>
      <div class="grid"><label>Forma de programação<select data-group="${index}" data-key="mode"><option value="single" ${g.mode === 'single' ? 'selected' : ''}>Pagamento único automático</option><option value="monthly" ${g.mode === 'monthly' ? 'selected' : ''}>Distribuição mensal igual automática</option><option value="manual" ${g.mode === 'manual' ? 'selected' : ''}>Cronograma manual / profissional</option></select></label>
      <label class="check">${input(index, -1, 'followTimeline', g.followTimeline, 'checkbox')}Usar meses das regras provisórias</label>
      <label>Mês inicial${input(index, -1, 'startMonth', w.start)}</label><label>Quantidade de meses${input(index, -1, 'months', w.months, 'number', g.mode !== 'monthly')}</label>
      <label>Fonte / observações do cronograma${input(index, -1, 'source', g.source, 'text')}</label></div>
      <p class="small">Único: uma saída no início escolhido. Mensal: divisão igual do saldo ainda não comprometido, em centavos, sem percentuais de execução técnica. Manual: os valores não se reajustam com o orçamento. Confirmados, pagos, fixados e vinculados a gastos ficam protegidos. Para corrigir uma linha protegida, use reabrir/desfixar explicitamente.</p>
      <div class="scroll"><table><thead><tr><th>Mês do fluxo</th><th>Valor previsto</th><th>Situação</th><th>Fixado</th><th>Vinculados</th><th>Ações</th></tr></thead><tbody>${g.payments.map((p, j) => {
        const linked = B.amounts(s, { ...p, groupId: g.groupId, treatment: 'budget' }).linked.length;
        const locked = p.fixed || p.status !== 'planned' || linked > 0;
        return `<tr><td>${input(index, j, 'month', p.month, 'number', locked)}</td><td>${input(index, j, 'amount', p.amount, 'number', locked)}</td><td><select data-group="${index}" data-index="${j}" data-key="status" ${p.status === 'paid' || linked ? 'disabled' : ''}>${Object.entries(statuses).filter(([status]) => p.status === 'planned' || status !== 'planned').map(([status, label]) => `<option value="${status}" ${p.status === status ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td>${input(index, j, 'fixed', p.fixed, 'checkbox', p.fixed || p.status !== 'planned' || linked > 0)}</td><td>${linked ? linked + ' gasto(s)' : '—'}</td><td><button data-group="${index}" data-unlock="${j}" ${linked ? 'disabled' : ''}>Reabrir / desfixar</button> <button class="danger" data-group="${index}" data-remove="${j}" ${locked ? 'disabled' : ''}>Excluir linha</button></td></tr>`;
      }).join('')}</tbody></table></div><button data-group="${index}" data-add>Adicionar linha manual</button></details>`;
    }).join('');
    $('budgetScheduleGroups').onchange = event => {
      const el = event.target; if (el.dataset.group === undefined || !el.dataset.key) return;
      if (!el.reportValidity()) return;
      const index = Number(el.dataset.group), row = Number(el.dataset.index ?? -1), key = el.dataset.key;
      if ((key === 'mode' || key === 'status') && !confirm('Aplicar esta alteração explícita no cronograma? Os pagamentos já protegidos serão preservados; o saldo automático poderá ser redistribuído.')) { render(state, change); return; }
      change(next => {
        const g = next.budgetSchedule.groups[index];
        if (row >= 0) {
          const p = g.payments[row];
          if (key === 'status') p.status = el.value;
          else if (key === 'fixed') p.fixed = el.checked;
          else { if (key === 'month') delete p.date; p[key] = Number(el.value); p.origin = 'manual'; g.mode = 'manual'; }
        } else {
          if (['startMonth', 'months'].includes(key) || (key === 'followTimeline' && !el.checked)) {
            const old = B.windowFor(next, g); g.startMonth = old.start; g.months = old.months; g.followTimeline = false;
          }
          if (key === 'mode' && g.mode === 'manual' && el.value !== 'manual') g.payments.forEach(p => { p.fixed = true; });
          g[key] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
        }
      }, false, true);
    };
    $('budgetScheduleGroups').onclick = event => {
      const el = event.target.closest('button'); if (!el || el.dataset.group === undefined) return;
      if (!confirm('Alterar explicitamente este cronograma? A versão anterior ficará no backup local.')) return;
      change(next => {
        const g = next.budgetSchedule.groups[Number(el.dataset.group)];
        if (el.hasAttribute('data-add')) {
          g.mode = 'manual';
          g.payments.push({ id: `manual:${globalThis.crypto?.randomUUID?.() || Date.now() + '-' + Math.random()}`, month: B.windowFor(next, g).start,
            amount: 0, status: 'planned', fixed: false, origin: 'manual' });
        }
        if (el.dataset.unlock !== undefined) {
          const p = g.payments[Number(el.dataset.unlock)];
          if (next.expenses.some(e => e.paymentId === p.id)) throw Error('Desvincule/corrija os gastos antes de reabrir o pagamento.');
          p.fixed = false; p.status = 'planned'; g.mode = 'manual';
        }
        if (el.dataset.remove !== undefined) { g.mode = 'manual'; g.payments.splice(Number(el.dataset.remove), 1); }
      }, false, true);
    };
    $('downloadBudgetSchedule').onclick = () => {
      const rows = result.payments.filter(p => ['budget', 'additional'].includes(p.treatment)).map(p => ({ ...p, ...B.amounts(s, p), label: s.groups.find(g => g.id === p.groupId)?.label || 'Adicional' }));
      const text = E.csv(rows, [['id', 'ID'], ['label', 'Grupo'], ['month', 'Mês do fluxo'], ['amount', 'Valor previsto'], ['effective', 'Programado/realizado'], ['paid', 'Pago'], ['status', 'Situação'], ['fixed', 'Fixado']]);
      const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.href = url; a.download = 'cronograma-orcamento.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }
  root.BudgetScheduleView = { render };
})(globalThis);
