/* Corn grain estimates. RGB is never an input to the yield calculation. */
(function(root){
'use strict';
const methods={grain:'По массе продукции',kernels:'Устаревший способ'};
const defaults=()=>({method:'grain',baseMoisture:14,low:6,high:10,hybrid:'',signature:'',records:{}});
function numeric(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(label+': допустимо от '+min+' до '+max+'.');return v;}
function text(v,max){if(typeof v!=='string'||v.length>max)throw new Error('Проверьте текст в журнале полевых проб.');return v;}
function sample(raw){
 if(!raw||!Object.hasOwn(methods,raw.method))throw new Error('Выберите способ расчёта.');
 const s={method:raw.method,area:numeric(raw.area,.01,1000000,'Площадь пробы, м²'),date:text(raw.date,10),note:text(raw.note||'',300)};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!Number.isFinite(Date.parse(s.date+'T00:00:00Z'))||new Date(s.date+'T00:00:00Z').toISOString().slice(0,10)!==s.date)throw new Error('Укажите действительную дату замера.');
 if(s.method==='grain'){s.mass=numeric(raw.mass,0,1000000,'Масса очищенного зерна, кг');s.moisture=numeric(raw.moisture,0,60,'Влажность зерна, %');}
 else{ s.ears=numeric(raw.ears,0,1000000,'Количество продуктивных растений на пробной площади');if(!Number.isInteger(s.ears))throw new Error('Количество растений должно быть целым.');s.rows=numeric(raw.rows,1,40,'Первый параметр структуры урожая');s.kernels=numeric(raw.kernels,1,100,'Второй параметр структуры урожая');s.thousand=numeric(raw.thousand,1,1000,'Ожидаемая масса 1000 единиц продукции, г');s.kernelMoisture=numeric(raw.kernelMoisture,0,60,'Базис влажности, %');}
 return s;
}
function validate(raw){
 const d={...defaults(),...(raw||{})};if(!Object.hasOwn(methods,d.method))throw new Error('Неизвестный метод расчёта урожайности.');
 const result={method:d.method,baseMoisture:numeric(d.baseMoisture,0,60,'Базовая влажность, %'),low:numeric(d.low,.1,100,'Нижний ориентир, т/га'),high:numeric(d.high,.2,100,'Верхний ориентир, т/га'),hybrid:text(d.hybrid,100),signature:text(d.signature,150),records:{}};
 if(result.low>=result.high)throw new Error('Верхний ориентир должен быть выше нижнего.');
 if(!d.records||typeof d.records!=='object'||Array.isArray(d.records))throw new Error('Неверный журнал замеров.');
 let count=0;for(const [id,items] of Object.entries(d.records)){
  if(!/^[1-9]\d{0,4}$/.test(id)||!Array.isArray(items)||!items.length||items.length>20)throw new Error('Не более 20 проб на участок.');
  count+=items.length;if(count>500)throw new Error('Не более 500 проб в проекте.');result.records[id]=items.map(sample);
 }
 return result;
}
function correctedMass(s,base){numeric(base,0,60,'Базовая влажность');return s.method==='grain'?s.mass*(100-s.moisture)/(100-base):s.ears*s.rows*s.kernels*s.thousand/1000000*(100-s.kernelMoisture)/(100-base);}
function estimate(items,method,base){
 const list=items.filter(s=>s.method===method);if(!list.length)return null;
 const area=list.reduce((sum,s)=>sum+s.area,0),mass=list.reduce((sum,s)=>sum+correctedMass(s,base),0),values=list.map(s=>10*correctedMass(s,base)/s.area);
 return {value:10*mass/area,area,count:list.length,min:Math.min(...values),max:Math.max(...values),method};
}
function classify(value,low,high){return value==null?3:value<low?0:value<high?1:2;}
function signature(r){let h=2166136261;for(let i=0;i<r.labels.length;i++){h=Math.imul(h^(r.labels[i]+(r.inside[i]?8:0)),16777619)>>>0;h=Math.imul(h^Math.round((r.coverage[i]||0)*1000000),16777619)>>>0;}return [r.width,r.height,r.low,r.high,r.greenThreshold,h].join(':');}
function bindRecords(data,r){if(data.signature!==signature(r))return {};const ids=new Set(r.regions.map(z=>String(z.id)));return Object.fromEntries(Object.entries(data.records).filter(([id])=>ids.has(id)));}
const api={methods,defaults,sample,validate,correctedMass,estimate,classify,signature,bindRecords};root.CornYield=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

