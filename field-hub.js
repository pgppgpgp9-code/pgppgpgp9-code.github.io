'use strict';
(() => {
 const storageKey='geozoning-field-hub-v1';
 const empty=()=>({journal:[],costs:[],area:''});
 const load=()=>{try{const value=JSON.parse(localStorage.getItem(storageKey));return value&&Array.isArray(value.journal)&&Array.isArray(value.costs)?{...empty(),...value}:empty();}catch(_error){return empty();}};
 let data=load();
 const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(data));}catch(_error){}}
 const today=()=>new Date().toISOString().slice(0,10);
 const money=value=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(value||0);
 const dateLabel=value=>{if(!value)return 'Без даты';const date=new Date(value+'T12:00:00');return Number.isNaN(date.getTime())?value:date.toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});};
 const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
 const setTab=name=>{
  document.querySelectorAll('[data-field-tab]').forEach(button=>{const active=button.dataset.fieldTab===name;button.classList.toggle('current',active);button.setAttribute('aria-selected',String(active));});
  document.querySelectorAll('[data-field-panel]').forEach(panel=>panel.hidden=panel.dataset.fieldPanel!==name);
  if(name==='work')requestAnimationFrame(()=>document.dispatchEvent(new CustomEvent('field:hub-work-opened')));
 };
 document.querySelectorAll('[data-field-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.fieldTab)));
 document.querySelectorAll('[data-open-field-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.openFieldTab)));
 $('fieldQuickTask').addEventListener('click',()=>{setTab('work');$('fieldJournalNote').focus();});
 $('fieldJournalDate').value=today();$('fieldCostDate').value=today();$('fieldArea').value=data.area;
 $('fieldJournalForm').addEventListener('submit',event=>{
  event.preventDefault();const note=$('fieldJournalNote').value.trim();if(!note)return;
  data.journal.unshift({id:Date.now(),type:$('fieldJournalType').value,date:$('fieldJournalDate').value,note});save();event.currentTarget.reset();$('fieldJournalDate').value=today();render();
 });
 $('fieldCostForm').addEventListener('submit',event=>{
  event.preventDefault();const amount=Number($('fieldCostAmount').value);if(!Number.isFinite(amount)||amount<0)return;
  data.area=$('fieldArea').value;data.costs.unshift({id:Date.now(),type:$('fieldCostType').value,date:$('fieldCostDate').value,amount,note:$('fieldCostNote').value.trim()});save();event.currentTarget.reset();$('fieldCostDate').value=today();$('fieldArea').value=data.area;render();
 });
 $('fieldArea').addEventListener('change',()=>{data.area=$('fieldArea').value;save();render();});
 function remove(kind,id){data[kind]=data[kind].filter(item=>item.id!==id);save();render();}
 function renderJournal(){
  const list=$('fieldJournalList');list.replaceChildren();$('fieldJournalCount').textContent=`${data.journal.length} ${data.journal.length===1?'запись':'записей'}`;
  if(!data.journal.length){const blank=el('div','field-list-empty');blank.append(el('strong','', 'Журнал пока пуст'),el('p','', 'Добавьте осмотр, посев, обработку или другое событие по полю.'));list.append(blank);return;}
  data.journal.slice(0,12).forEach(item=>{const row=el('article','field-journal-row');const date=el('time','',dateLabel(item.date));const body=el('div');body.append(el('strong','',item.type),el('p','',item.note));const del=el('button','field-delete','Удалить');del.type='button';del.setAttribute('aria-label',`Удалить запись ${item.type}`);del.addEventListener('click',()=>remove('journal',item.id));row.append(date,body,del);list.append(row);});
 }
 function renderCosts(){
  const total=data.costs.reduce((sum,item)=>sum+item.amount,0),area=Number(data.area);$('fieldCostTotal').textContent=money(total);$('fieldCostState').textContent=money(total);$('fieldCostPerHa').textContent=area>0?`${money(total/area)} / га`:'Укажите площадь';$('fieldCostHint').textContent=area>0?`${money(total/area)} на гектар`:'Добавьте площадь для расчёта на гектар';
  const grouped={};data.costs.forEach(item=>grouped[item.type]=(grouped[item.type]||0)+item.amount);const breakdown=$('fieldCostBreakdown');breakdown.replaceChildren();Object.entries(grouped).sort((a,b)=>b[1]-a[1]).forEach(([name,value])=>{const row=el('div');row.append(el('span','',name),el('strong','',money(value)));breakdown.append(row);});
  const list=$('fieldCostList');list.replaceChildren();if(!data.costs.length){const blank=el('div','field-list-empty');blank.append(el('strong','', 'Расходов пока нет'),el('p','', 'Добавьте семена, удобрения, топливо или другие затраты.'));list.append(blank);return;}
  data.costs.slice(0,12).forEach(item=>{const row=el('article','field-cost-row');const body=el('div');body.append(el('strong','',item.type),el('small','',`${dateLabel(item.date)}${item.note?' · '+item.note:''}`));const amount=el('b','',money(item.amount));const del=el('button','field-delete','Удалить');del.type='button';del.addEventListener('click',()=>remove('costs',item.id));row.append(body,amount,del);list.append(row);});
 }
 function renderSummary(){
  const result=globalThis.state?.result,total=result?.regions?.length||0,sampled=globalThis.cornData?Object.keys(cornData.records).filter(id=>cornData.records[id].length).length:0,meta=typeof projectMetadata==='function'?projectMetadata():{};
  $('fieldNextAction').onclick=null;
  $('fieldHubTitle').textContent=meta.name||'Текущее поле';$('fieldPassportName').textContent=meta.name||'Не указано';$('fieldPassportCrop').textContent=meta.crop||'Не указана';$('fieldPassportDate').textContent=meta.date?dateLabel(meta.date):'Не указана';$('fieldPassportEntries').textContent=String(data.journal.length+data.costs.length);
  $('fieldMapState').textContent=result?`${total} зон`:'Нет данных';$('fieldMapHint').textContent=result?'Карта готова для проверки на месте':'Добавьте поле со спутника или снимок';$('fieldSampleState').textContent=result?`${sampled} / ${total}`:'—';$('fieldDoneState').textContent=String(data.journal.length);
  if(!result){$('fieldNextTitle').textContent='Добавьте поле';$('fieldNextText').textContent='После анализа здесь появятся понятные рекомендации по дальнейшим действиям.';$('fieldNextAction').href='#satellite';$('fieldNextAction').textContent='Открыть спутник →';}
  else if(!sampled){$('fieldNextTitle').textContent='Проверьте карту и добавьте замеры';$('fieldNextText').textContent='Карта показывает различия растительности. Полевые пробы помогут связать их с фактической урожайностью.';$('fieldNextAction').href='#yield';$('fieldNextAction').textContent='Добавить замеры →';}
  else if(!data.journal.length){$('fieldNextTitle').textContent='Запланируйте осмотр';$('fieldNextText').textContent='Зафиксируйте, что увидели на месте, чтобы не потерять причину различий между зонами.';$('fieldNextAction').href='#field';$('fieldNextAction').textContent='Открыть работы →';$('fieldNextAction').onclick=event=>{event.preventDefault();setTab('work');};}
  else{$('fieldNextTitle').textContent='Поле ведётся';$('fieldNextText').textContent='Продолжайте записывать работы и расходы — так к концу сезона будет готова полная история поля.';$('fieldNextAction').href='#field';$('fieldNextAction').textContent='Посмотреть историю →';$('fieldNextAction').onclick=event=>{event.preventDefault();setTab('history');};}
 }
 function render(){renderJournal();renderCosts();renderSummary();}
 for(const name of ['field:analysis','field:source','field:invalidated','field:boundary'])document.addEventListener(name,renderSummary);
 for(const id of ['fieldName','crop','captureDate'])document.getElementById(id)?.addEventListener('input',renderSummary);
 window.GeoZoningFieldHub={open:setTab,refresh:render};render();
})();

