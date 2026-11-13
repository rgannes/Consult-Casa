/* Dois caixas conciliados. Não altera datas, orçamento ou regras de financiamento. */
(function (root) {
  'use strict';
  const E = typeof module !== 'undefined' ? require('./simulation') : root.FinancialEngine;
  function amount(value, label, signed = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (!signed && value < 0)) throw Error(`${label}: valor inválido para conciliação.`);
    return E.cents(value);
  }
  const sum = (rows, key) => E.cents(rows.reduce((s, row) => s + row[key], 0));
  function separate({ initialCash, rows }) {
    const initialPersonal = amount(initialCash, 'Patrimônio pessoal inicial');
    let personal = initialPersonal, project = 0;
    let personalMinimum = personal, projectMinimum = 0, maxJointShortage = 0;
    const personalRows = [], projectRows = [], reconciliation = [];
    if (!Array.isArray(rows)) throw Error('Competências inválidas para conciliação.');
    for (const fact of rows) {
      const openingCash = personal, openingProject = project;
      const capacity = amount(fact.capacity, 'Capacidade mensal', true);
      const apartmentFunding = amount(fact.apartmentFunding || 0, 'Crédito de apartamento');
      const saleGross = amount(fact.saleGross || 0, 'Receita da venda');
      const apartmentPayments = amount(fact.apartmentPayments || 0, 'Compra/venda de apartamento');
      const financing = amount(fact.financing || 0, 'Encargos e prestações');
      const rental = amount(fact.rental || 0, 'Aluguel já tratado na capacidade');
      const bankFunding = amount(fact.constructionFunding || 0, 'Liberação/reembolso da obra');
      const supplierPayments = amount(fact.constructionPayments || 0, 'Fornecedores da obra');
      const transferPlanned = amount(fact.transferPlanned || 0, 'Aporte próprio planejado');
      // Primeiro preserva o pagamento das obrigações pessoais. Nunca transfere dinheiro inexistente.
      const beforeTransfer = E.cents(personal + capacity + apartmentFunding + saleGross - apartmentPayments - financing);
      const transfer = Math.min(transferPlanned, Math.max(0, beforeTransfer));
      const unmetTransfer = E.cents(transferPlanned - transfer);
      personal = E.cents(beforeTransfer - transfer);
      // O saldo anterior, inclusive reembolsos não utilizados, é carregado integralmente.
      project = E.cents(project + transfer + bankFunding - supplierPayments);
      personalMinimum = Math.min(personalMinimum, personal);
      projectMinimum = Math.min(projectMinimum, project);
      maxJointShortage = Math.max(maxJointShortage, E.cents(Math.max(0, -personal) + Math.max(0, -project)));
      const personalRow = { month: fact.month, date: fact.date, openingCash, capacity, rental,
        apartmentFunding, saleGross, apartmentPayments, financing, transferPlanned,
        transferToProject: transfer, unmetTransfer, closingCash: personal,
        savingPossible: E.cents(capacity - financing),
        wealthWithdrawal: E.cents(Math.max(0, openingCash - personal)), shortage: personal < 0 };
      const projectRow = { month: fact.month, date: fact.date, openingCash: openingProject,
        ownTransfers: transfer, bankFunding, supplierPayments, closingCash: project,
        shortage: project < 0, debtBalance: amount(fact.constructionDebtBalance || 0, 'Dívida da obra') };
      personalRows.push(personalRow); projectRows.push(projectRow);
      const expected = E.cents(openingCash + openingProject + capacity + apartmentFunding + saleGross + bankFunding - apartmentPayments - financing - supplierPayments);
      const combined = E.cents(personal + project);
      const difference = E.cents(combined - expected);
      if (difference !== 0) throw Error('Falha na conciliação entre o patrimônio pessoal e o caixa da obra.');
      reconciliation.push({ month: fact.month, personalCash: personal, projectCash: project, combinedCash: combined,
        transferOut: transfer, transferIn: transfer, difference });
    }
    return {
      personal: { initialCash: initialPersonal, rows: personalRows, totals: {
        closingCash: personal, minimumCash: personalMinimum, additionalCapital: E.cents(Math.max(0, -personalMinimum)),
        shortageMonths: personalRows.filter(r => r.shortage).map(r => r.month),
        transfers: sum(personalRows, 'transferToProject'), plannedTransfers: sum(personalRows, 'transferPlanned'),
        unmetTransfers: sum(personalRows, 'unmetTransfer'), financing: sum(personalRows, 'financing') } },
      project: { initialCash: 0, rows: projectRows, totals: {
        closingCash: project, minimumCash: projectMinimum, additionalCapital: E.cents(Math.max(0, -projectMinimum)),
        firstShortageMonth: projectRows.find(r => r.shortage)?.month || null,
        shortageMonths: projectRows.filter(r => r.shortage).map(r => r.month), ownTransfers: sum(projectRows, 'ownTransfers'),
        bankFunding: sum(projectRows, 'bankFunding'), supplierPayments: sum(projectRows, 'supplierPayments') } },
      reconciliation, maxJointShortage
    };
  }
  const api = { separate };
  if (typeof module !== 'undefined') module.exports = api;
  root.CashLedgers = api;
})(globalThis);
