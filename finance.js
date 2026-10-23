(function(root){
function loan(principal,annual,months,system='SAC',monthlyFee=0,indexAnnual=0){
 const i=Math.pow(1+annual/100,1/12)-1,k=Math.pow(1+indexAnnual/100,1/12)-1;
 let balance=principal, factor=1; const rows=[]; const fixed=i?principal*i/(1-Math.pow(1+i,-months)):principal/months;
 for(let m=1;m<=months;m++){factor*=1+k;const correction=balance*k;balance+=correction;const interest=balance*i;const amort=m===months?balance:Math.min(balance,system==='SAC'?principal/months*factor:fixed*factor-interest);const payment=amort+interest+monthlyFee;balance-=amort;rows.push({month:m,payment,interest,amort,correction,balance:Math.max(0,balance)});}
 return {rows,total:rows.reduce((s,r)=>s+r.payment,0),first:rows[0]?.payment||0,last:rows.at(-1)?.payment||0};
}
function irrAnnual(flows){if(!flows.some(v=>v>0)||!flows.some(v=>v<0))return null;const npv=r=>flows.reduce((s,v,t)=>s+v/Math.pow(1+r,t),0);let lo=-.9,hi=1;if(npv(lo)*npv(hi)>0)return null;for(let n=0;n<150;n++){let mid=(lo+hi)/2;if(npv(mid)>0)lo=mid;else hi=mid;}return (Math.pow(1+(lo+hi)/2,12)-1)*100;}
function consortium(credit,admin,reserve,months,annualIndex,awardMonth,bid){
 const base=credit*(1+(admin+reserve)/100)/months; const rows=[];
 for(let m=1;m<=months;m++){const factor=Math.pow(1+annualIndex/100,Math.floor((m-1)/12));rows.push({month:m,payment:base*factor+(m===awardMonth?bid:0)});}
 return {rows,total:rows.reduce((s,r)=>s+r.payment,0),available:credit*Math.pow(1+annualIndex/100,Math.floor((awardMonth-1)/12)),base};
}
const api={loan,irrAnnual,consortium};if(typeof module!=='undefined')module.exports=api;root.Finance=api;
})(globalThis);
