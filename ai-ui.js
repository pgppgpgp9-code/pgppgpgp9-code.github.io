'use strict';
(()=>{
 const AI=FieldAIDemo,panel=$('page-assistant');if(!panel)return;
 const n=(value,digits=1)=>Number(value.toFixed(digits));
 function snapshot(){
  const r=state.result;if(!r)return AI.empty();
  const corn=getCornProject(),advice=getAdviceProject(),records=advice.records||{};
  const yieldRows=[];let sampleCount=0;for(const [id,items] of Object.entries(corn.records||{})){sampleCount+=items.length;const e=CornYield.estimate(items,corn.method,corn.baseMoisture);if(e)yieldRows.push({id:Number(id),value:n(e.value),count:e.count,area:n(e.area)});}
  const nutrientLow=[];let labRecords=0;for(const rec of Object.values(records)){const evidence=rec.sampleDate&&rec.labRef.trim();if(evidence){labRecords++;for(const [key,label] of [['n','N — азот'],['p','P — фосфор'],['k','K — калий']])if(rec[key]==='low')nutrientLow.push(label);}}
  const total=r.targetCount||1;return {analyzed:true,synthetic:state.demo,fieldName:projectMetadata().name,zoneCount:r.regions.length,counts:r.counts,percents:r.counts.map(v=>100*v/total),regions:r.regions.map(z=>({id:z.id,classId:z.classId,greenPercent:100*z.coverage,fieldPercent:100*z.count/total})),route:FieldAdvice.route(r,advice.context),sampledZones:yieldRows.length,sampleCount,yieldRows,visited:Object.values(records).filter(v=>v.visited).length,labRecords,nutrientLow,bounds:!!getBounds(),stage:FieldAdvice.stages[advice.context.stage],location:advice.context.location,previousCrop:advice.context.previousCrop};
 }
 function esc(value){return escapeHTML(String(value));}
 function answerHTML(a){return `<article class="ai-message assistant"><span class="ai-kicker">ДЕМО-ПОМОЩНИК · ПО ДАННЫМ ПРОЕКТА</span><h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p>${a.facts?.length?`<strong>Что известно</strong><ul>${a.facts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${a.actions?.length?`<strong>Что сделать дальше</strong><ul>${a.actions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${a.limits?.length?`<p class="ai-limit">${a.limits.map(esc).join(' ')}</p>`:''}</article>`;}
 function renderContext(){const d=snapshot();$('aiField').textContent=d.analyzed?(d.fieldName||'Текущее поле'):'Нет карты';$('aiZones').textContent=d.analyzed?String(d.zoneCount):'—';$('aiSamples').textContent=d.analyzed?`${d.sampledZones} зон / ${d.sampleCount} проб`:'—';$('aiVisits').textContent=d.analyzed?String(d.visited):'—';$('aiLabs').textContent=d.analyzed?String(d.labRecords):'—';$('aiReadyText').textContent=!d.analyzed?'Откройте учебный пример или загрузите снимок.':d.sampleCount&&d.visited?'Есть карта, пробы и осмотры — можно готовить сводку.':d.sampleCount?'Есть карта и пробы. Добавьте результаты осмотра.':'Карта готова. Добавьте полевые пробы и записи осмотра.';}
 function ask(kind,label,question=''){if(label){$('aiThread').insertAdjacentHTML('beforeend',`<div class="ai-message user">${esc(label)}</div>`);}const result=AI.answer(kind,snapshot(),question);$('aiThread').insertAdjacentHTML('beforeend',answerHTML(result));$('aiThread').scrollTop=$('aiThread').scrollHeight;renderContext();}
 $('aiQuick').addEventListener('click',event=>{const b=event.target.closest('[data-ai-kind]');if(!b)return;ask(b.dataset.aiKind,b.textContent.trim());});
 $('aiForm').addEventListener('submit',event=>{event.preventDefault();const q=$('aiQuestion').value.trim();if(!q)return;$('aiQuestion').value='';ask('question',q,q);});
 for(const event of ['field:analysis','field:source','field:invalidated','field:boundary'])document.addEventListener(event,renderContext);
 for(const id of ['adviceStage','adviceLocation','advicePrevious'])$(id)?.addEventListener('input',renderContext);
 panel.addEventListener('input',renderContext);
 ask('missing','');
})();

