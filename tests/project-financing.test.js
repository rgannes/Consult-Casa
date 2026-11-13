'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../model'), B=require('../budget-schedule'), H=require('../housing'), E=require('../simulation');
function fixture(){
 const s=M.defaults();s.groups.forEach(g=>g.value=0);s.constructionMode='global';s.groups[6].value=100000;
 Object.assign(s,{cash:100000,income:10000,essential:6000,monthlySavings:3000,rent:1000,rentIncludedInExpenses:true});
 s.planning.startDate='2027-01-01';s.planning.constructionMonths=4;s.planning.constructionDelay=0;
 s.housing=H.defaults(s);s.housing.startDate='2027-01-01';
 Object.assign(s.housing.paths.rentBuild.second,{credit:80000,entry:null,months:420,buildMonths:4,cet:12,releaseDelayDays:30,coveragePercent:80});
 return s;
}
function item(id,value,date,extra={}){return {id,description:id,value,source:'Hipótese',referenceDate:'2026-10-01',status:'estimado',notes:'',includedInGroup:true,paymentDate:date,...extra};}
function phases(s){
 s.groups[6].subitems=[item('Primeira fase',50000,'2027-01-10',{measurement:true,measurementValue:50000,phaseStart:'2027-01-01',durationMonths:1}),item('Segunda fase',50000,'2027-03-10',{measurement:true,measurementValue:50000,phaseEnd:'2027-04-01'})];return M.validate(s);
}
test('subitens incluídos distribuem valor-base sem duplicar e residual é explícito',()=>{
 const s=fixture();s.groups[6].subitems=[item('Parte A',30000,'2027-02-15'),item('Adicional',5000,'2027-04-10',{includedInGroup:false})];
 const r=B.resolve(s),g=r.state.budgetSchedule.groups[6];
 assert.equal(r.totals.budget,105000);assert.equal(r.totals.programmed,105000);
 assert.equal(g.payments.find(p=>p.subitemId==='Parte A').month,2);
 assert.equal(g.payments.filter(p=>!p.subitemId).reduce((a,p)=>a+p.amount,0),70000);
 assert.equal(g.payments.find(p=>p.subitemId==='Parte A').date,'2027-02-15');
 assert.ok(r.warnings.some(w=>w.includes('70000.00 do valor-base')));
});
test('grupos aceitam data única e período com centavos conciliados',()=>{
 const s=fixture(),g=s.budgetSchedule.groups[6];g.startDate='2027-02-17';g.mode='single';
 let r=B.resolve(s);assert.deepEqual(r.events.map(e=>[e.month,e.amount]),[[2,100000]]);
 g.mode='monthly';g.months=3;r=B.resolve(s);assert.deepEqual(r.events.map(e=>e.month),[2,3,4]);assert.equal(r.totals.difference,0);
});
test('fases dividem a construção, calculam conclusão e mostram saldo ou excesso',()=>{
 let s=phases(fixture());assert.equal(B.phaseEnd(s.groups[6].subitems[0]),'2027-01-31');assert.equal(B.budget(s).total,100000);
 assert.ok(B.resolve(s).warnings.some(w=>w.includes('0.00 do valor-base')));
 s.groups[6].subitems[0].value=60000;const r=B.resolve(s);assert.equal(r.totals.difference,-10000);
 assert.ok(r.warnings.some(w=>w.includes('-10000.00 do valor-base')));
 assert.equal(B.financing(r.state,100000).disbursed,0);
});
test('medição só reembolsa após conclusão e prazo; etapa paga antes exige capital de giro',()=>{
 const s=phases(fixture()),r=H.calculate(s),f=r.stages[0].funding.finance;
 assert.deepEqual(f.measurements.map(m=>[m.releaseDate,m.amount]),[['2027-03-02',40000],['2027-05-01',40000]]);
 assert.equal(r.rows[0].constructionFunding,0);assert.equal(r.rows[0].constructionPayments,50000);
 assert.equal(r.rows[0].constructionCash,-30000);assert.equal(r.rows[2].constructionFunding,40000);
 assert.equal(r.rows[4].constructionFunding,40000);assert.equal(r.rows[4].constructionCash,0);
 assert.equal(r.rows[0].savingPossible,3000);assert.ok(r.rows[2].savingPossible<3000);
 assert.equal(r.loans[0].result.rows.length,420);assert.equal(r.loans[0].result.totals.closingBalance,0);
 assert.equal(r.loans[0].result.funding[0].date,'2027-03-02');
 assert.equal(r.rows[4].capacity,4000);assert.equal(r.rows[3].capacity,3000);
});
test('reembolso retido financia etapa seguinte e não aumenta renda pessoal',()=>{
 const s=phases(fixture());s.groups[6].subitems[1].paymentDate='2027-04-10';s.housing.paths.rentBuild.second.cet=0;
 const r=H.calculate(s);assert.equal(r.rows[2].constructionCash,10000);assert.equal(r.rows[3].openingConstructionCash,10000);
 assert.equal(r.rows[2].closingCash-r.rows[1].closingCash,3000);assert.equal(r.rows[2].funding,0);
 assert.ok(r.ledgers.reconciliation.every(m=>m.difference===0 && m.transferOut===m.transferIn));
 assert.equal(r.ledgers.personal.totals.transfers,20000);
});
test('elegibilidade específica substitui o grupo; cobertura e principal limitam financiamento',()=>{
 let s=phases(fixture());s.groups[6].subitems[0].financeability='partial';s.groups[6].subitems[0].financePercent=50;
 s.groups[6].subitems[1].financeability='none';s.groups[1].value=10000;s.groups[8].value=20000;s.groups[10].value=5000;
 s=M.validate(s);let f=B.financing(s,80000,80,30);
 assert.equal(f.eligibleCosts,25000);assert.equal(f.disbursed,20000);assert.equal(f.ownCosts,115000);
 f=B.financing(s,12000,80,30);assert.equal(f.disbursed,12000);
 s.groups[6].subitems[0].financeability='inherit';s.groups[6].financeability='none';assert.equal(B.financing(s,80000).disbursed,0);
});
test('sem fases ou medição aceita não se inventam liberações uniformes',()=>{
 const s=fixture(),r=H.calculate(s);assert.equal(r.loans[0].result.totals.disbursed,0);assert.equal(r.rows.reduce((a,r)=>a+r.constructionFunding,0),0);
 assert.ok(r.warnings.some(w=>w.includes('nenhum reembolso')));
 s.groups[6].subitems=[item('Etapa não aceita',50000,'2027-01-01',{phaseEnd:'2027-02-01'})];assert.equal(H.calculate(s).loans[0].result.totals.disbursed,0);
});
test('datas de aprovação por fase substituem padrão e cobertura zero não recebe banco',()=>{
 const s=phases(fixture());s.groups[6].subitems[0].releaseDelayDays=10;
 assert.equal(H.calculate(s).stages[0].funding.finance.measurements[0].releaseDate,'2027-02-10');
 s.housing.paths.rentBuild.second.coveragePercent=0;assert.equal(H.calculate(s).loans[0].result.totals.disbursed,0);
});
test('poupança exclui transferências extraordinárias e revela insuficiência após encargos',()=>{
 const s=phases(fixture());s.monthlySavings=100;s.housing.cashBaseline.savings=100;const r=H.calculate(s);
 assert.equal(r.rows[0].savingPossible,100);assert.equal(r.rows[0].transferToProject,20000);
 assert.ok(r.rows[2].savingPossible<0);
 for(const m of r.rows) assert.equal(m.savingPossible,E.cents(m.capacity-m.financing));
});
test('migração mantém cotação, pagos, backups, extras e cenários sem inventar datas antigas',()=>{
 let s=fixture();s.groups[6].subitems=[item('Antigo',10000,'',{status:'pago'})];
 const p=s.budgetSchedule.groups[6].payments[0];p.status='paid';p.fixed=true;p.amount=10000;p.month=2;
 s.housing.paths.rentBuild.second.extraAmount=1000;s.housing.paths.rentBuild.second.extraMonth=20;
 s=M.saveScenario(s,'Antes','antes');const old=JSON.parse(JSON.stringify(s));
 for(const g of old.groups){delete g.financeability;delete g.financePercent;for(const i of g.subitems){delete i.paymentDate;delete i.financeability;}}
 const restored=M.readImport(JSON.stringify({version:2,type:'consult-casa-backup',state:old}));
 assert.equal(restored.groups[6].subitems[0].referenceDate,'2026-10-01');assert.equal(restored.groups[6].subitems[0].paymentDate,'');
 assert.deepEqual(restored.budgetSchedule.groups[6].payments.find(i=>i.id===p.id),p);
 assert.equal(restored.housing.paths.rentBuild.second.extraAmount,1000);assert.equal(restored.savedScenarios.length,1);
 assert.deepEqual(M.readImport(M.exportData(restored)),restored);
});
test('gastos ligados a subitens ficam protegidos e substituem a previsão uma vez',()=>{
 let s=phases(fixture()),p=s.budgetSchedule.groups[6].payments.find(p=>p.subitemId==='Primeira fase');
 s.expenses.push({id:'real',date:'2027-01-10',category:'Construção',groupId:'construction',description:'Parte paga',amount:20000,status:'Pago',paymentId:p.id});
 s=M.validate(s);s.groups[6].subitems[0].paymentDate='2027-02-10';s=M.validate(s);
 assert.equal(s.budgetSchedule.groups[6].payments.find(row=>row.id===p.id).month,1);
 assert.equal(B.resolve(s).totals.programmed,100000);assert.equal(H.calculate(s).ledgers.project.totals.supplierPayments,100000);
});
test('datas passadas previstas e parâmetros inválidos não geram pagamentos fictícios',()=>{
 const s=fixture();s.groups[6].subitems=[item('Data antiga',10000,'2026-01-01')];assert.throws(()=>M.validate(s),/antes do início/);
 s.groups[6].subitems[0].paymentDate='2027-01-01';s.groups[6].subitems[0].financeability='partial';s.groups[6].subitems[0].financePercent=101;assert.throws(()=>M.validate(s),/Percentual/);
});
test('gasto sem vínculo consome subitens programados sem duplicar fornecedor',()=>{
 let s=phases(fixture());s.expenses.push({id:'sem-vinculo',date:'2027-01-10',category:'Construção',groupId:'construction',description:'Adiantamento',amount:20000,status:'Pago'});
 s=M.validate(s);const r=B.resolve(s);assert.equal(r.totals.programmed,100000);assert.equal(r.totals.paid,20000);
 assert.equal(r.state.budgetSchedule.groups[6].payments.find(p=>p.subitemId==='Primeira fase').amount,30000);
 assert.equal(H.calculate(s).ledgers.project.totals.supplierPayments,100000);
});
test('capital de giro considera pagamento anterior a reembolso dentro do mesmo mês',()=>{
 const s=phases(fixture());s.groups[6].subitems[0].phaseEnd='2027-01-15';s.groups[6].subitems[0].releaseDelayDays=10;
 s.groups[6].subitems[1].paymentDate='2027-05-10';
 const r=H.calculate(s);assert.equal(r.stages[0].funding.finance.measurements[0].releaseDate,'2027-01-25');
 assert.equal(r.stages[0].funding.finance.workingCapital,30000);
});
test('amortização extraordinária continua válida após medições tardias em SAC e Price',()=>{
 for(const system of ['SAC','Price']){const s=phases(fixture()),p=s.housing.paths.rentBuild.second;p.system=system;
 const before=H.calculate(s).loans[0].result;Object.assign(p,{extraAmount:10000,extraMonth:20,extraMode:'term'});
 const after=H.calculate(s).loans[0].result;assert.ok(after.rows.length<420);assert.ok(after.totals.interest<before.totals.interest);
 assert.equal(after.totals.closingBalance,0);p.extraMode='payment';assert.equal(H.calculate(s).loans[0].result.rows.length,420);}
});
test('aporte para capital de giro é independente do principal solicitado',()=>{
 const s=phases(fixture());s.housing.paths.rentBuild.second.ownTransfer=50000;
 const r=H.calculate(s);assert.equal(r.stages[0].funding.finance.disbursed,80000);
 assert.equal(r.rows[0].transferToProject,50000);assert.equal(r.rows[0].constructionCash,0);
 assert.equal(r.rows[0].closingCash,53000);assert.equal(r.rows[0].savingPossible,3000);
 assert.equal(r.ledgers.project.totals.closingCash,30000);
});
test('percentual de aceitação incide sobre valor medido, sem financiar a medição integral',()=>{
 const s=phases(fixture()),i=s.groups[6].subitems[0];i.measurementValue=20000;i.financeability='partial';i.financePercent=50;
 const f=B.financing(M.validate(s),80000,80,30);assert.equal(f.measurements[0].amount,8000);
});
