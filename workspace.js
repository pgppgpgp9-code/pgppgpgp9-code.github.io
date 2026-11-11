'use strict';
let restoringProject=false,projectDirty=false,lastSurvey=-1;
const metadataIds=['fieldName','cropName','surveyDate','fieldNotes'];
function projectMetadata(){return {name:$('fieldName').value.trim(),crop:$('cropName').value.trim(),date:$('surveyDate').value,notes:$('fieldNotes').value.trim()};}
function refreshProjectBar(){const meta=projectMetadata();$('projectTitle').textContent=meta.name||'Новое исследование';$('projectStatus').textContent=state.busy?'Обрабатываем снимок…':state.source?(projectDirty?'Есть изменения · сохраните проект':'Проект открыт'):'Снимок → зоны → отчёт';$('saveProject').disabled=!state.result||state.busy||state.drawing;$('openProject').disabled=state.busy;$('focusMap').disabled=!state.source;}
function markDirty(){projectDirty=true;refreshProjectBar();}
function packProject(){
 if(!state.result||state.busy||state.drawing)throw new Error('Дождитесь анализа и завершите выделение границы.');
 const p={format:'pole-project',version:3,sourceName:state.name,synthetic:state.demo,image:{width:sourceCanvas.width,height:sourceCanvas.height,data:sourceCanvas.toDataURL('image/png')},settings:{columns:Number($('resolution').value),greenThreshold:Number($('threshold').value)/100,lowPercent:Number($('lowBreak').value),highPercent:Number($('highBreak').value)},polygon:state.polygon,bounds:getBounds(),metadata:projectMetadata(),advisory:getAdviceProject(),corn:getCornProject()};
 return FieldProject.validate(p,A);
}
async function restoreProject(raw){
 if(state.busy)throw new Error('Дождитесь окончания обработки.');const p=FieldProject.validate(raw,A);
 const base64=p.image.data.slice(p.image.data.indexOf(',')+1),bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 // Validate/decode before changing the current project, so corrupt files cannot erase it.
 setBusy(true);let bitmap;try{bitmap=await createImageBitmap(new Blob([bytes]));if(bitmap.width!==p.image.width||bitmap.height!==p.image.height){bitmap.close();throw new Error('Размеры снимка не совпадают с данными проекта.');}}catch(e){setBusy(false);throw new Error('Не удалось прочитать встроенный снимок: '+e.message);}
 restoringProject=true;
 try{sourceCanvas.width=bitmap.width;sourceCanvas.height=bitmap.height;sourceCanvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
  setSource(p.sourceName,p.synthetic,`${p.image.width} × ${p.image.height}`);state.polygon=p.polygon;
  $('resolution').value=p.settings.columns;$('threshold').value=Math.round(p.settings.greenThreshold*100);$('lowBreak').value=p.settings.lowPercent;$('highBreak').value=p.settings.highPercent;
  $('resolutionLabel').textContent=`${p.settings.columns} ячеек`;$('thresholdLabel').textContent=p.settings.greenThreshold.toLocaleString('ru-RU',{minimumFractionDigits:2});
  $('fieldName').value=p.metadata.name;$('cropName').value=p.metadata.crop||'Не указана';$('surveyDate').value=p.metadata.date;$('fieldNotes').value=p.metadata.notes;
  if(p.bounds){for(const key of ['west','east','south','north'])$(key).value=p.bounds[key];$('geoConfirm').checked=true;}
  setAdviceProject(p.advisory);setCornProject(p.corn);updateFieldUI();setBusy(false);await runAnalysis();if(!state.result)throw new Error('Не удалось восстановить расчёт проекта.');projectDirty=false;refreshProjectBar();toast('Проект восстановлен: снимок, зоны, полевые замеры и заметки.');
 }finally{restoringProject=false;setBusy(false);}
}
$('saveProject').onclick=()=>{try{const p=packProject();download(new Blob([JSON.stringify(p)],{type:'application/json'}),filename('pole.json'));projectDirty=false;refreshProjectBar();toast('Файл проекта подготовлен. Перенесите его на другое устройство и нажмите «Открыть проект».');}catch(e){toast(e.message);}};
$('openProject').onclick=()=>$('projectInput').click();
$('projectInput').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>30*1024*1024){toast('Файл проекта больше 30 МБ.');return;}try{await restoreProject(JSON.parse(await file.text()));}catch(e){toast('Не удалось открыть проект. '+e.message);}};
metadataIds.forEach(id=>$(id).addEventListener('input',markDirty));
['west','east','south','north','geoConfirm'].forEach(id=>$(id).addEventListener('input',markDirty));
document.addEventListener('field:source',()=>{if(!restoringProject){metadataIds.forEach(id=>$(id).value='');$('cropName').value='Не указана';projectDirty=true;}lastSurvey=-1;refreshProjectBar();});
document.addEventListener('field:busy',refreshProjectBar);
document.addEventListener('field:boundary',refreshProjectBar);
document.addEventListener('field:invalidated',()=>{for(const id of ['qualityPanel','surveyStrip'])$(id).hidden=true;markDirty();});
function updateQuality(){
 const r=state.result;if(!r)return;const rejected=r.counts[3]/r.targetCount,oneClass=r.counts.slice(0,3).filter(v=>v>0).length===1;
 $('qualityPanel').hidden=false;const title=rejected>.3?'Снимок требует проверки':rejected>.1?'Есть участки без оценки':'Проверка исходных данных';
 const tips=[`${percent(1-rejected)} выбранной области пригодно по яркости и прозрачности. Это не оценка точности распознавания.`,state.polygon.length?'Фон за границей поля исключён.':'В расчёт включён фон. Если на снимке есть дорога или постройки, обведите только поле.',getBounds()?'Геопривязка задана вручную.':'Координаты не заданы: площадь в гектарах пока недоступна.'];
 if(oneClass)tips.push('Один класс может быть правильным результатом. Проверьте оригинал и пороги, не пытаясь обязательно получить три цвета.');
 $('qualityPanel').innerHTML=`<details><summary><span class="quality-symbol">${rejected>.1?'!':'i'}</span>${title}<span>${percent(1-rejected)} оценивается</span></summary><ul>${tips.map(t=>`<li>${escapeHTML(t)}</li>`).join('')}</ul></details>`;
 const low=r.regions.filter(z=>z.classId===0);$('surveyStrip').hidden=false;$('nextLow').disabled=!low.length;$('previousLow').disabled=!low.length;$('surveyStatus').textContent=low.length?`Мало зелени — участков: ${low.length} · сначала самые крупные`:'Участков с малым покрытием не найдено';
}
document.addEventListener('field:analysis',()=>{lastSurvey=-1;updateQuality();markDirty();});
['west','east','south','north','geoConfirm'].forEach(id=>$(id).addEventListener('input',updateQuality));
function tourLow(direction){if(!state.result||state.busy)return;const zones=state.result.regions.filter(z=>z.classId===0).sort((a,b)=>b.count-a.count);if(!zones.length)return;lastSurvey=(lastSurvey+direction+zones.length)%zones.length;const zone=zones[lastSurvey];state.filter=-1;buildZones();updateLegend();updateRegionList();showRegion(zone.id);focusRegion(zone);$('surveyStatus').textContent=`${lastSurvey+1} из ${zones.length} · участок № ${zone.id} · ${percent(zone.coverage)} зелени`;}
$('nextLow').onclick=()=>tourLow(1);$('previousLow').onclick=()=>tourLow(-1);
function toggleFocus(force){const focus=typeof force==='boolean'?force:!document.body.classList.contains('map-focus');document.body.classList.toggle('map-focus',focus);$('focusMap').textContent=focus?'Вернуть рабочий экран':'Развернуть карту';$('focusMap').setAttribute('aria-pressed',String(focus));render();}
$('focusMap').onclick=()=>toggleFocus();
document.addEventListener('keydown',e=>{if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||$('helpDialog').open)return;if(e.key==='Escape')toggleFocus(false);if(!state.source||state.drawing)return;const mode={1:'zones',2:'overlay',3:'original',4:'compare'}[e.key];if(mode)setMode(mode);if(e.key==='0')resetView();});
const originalSummary=summary;
summary=function(){return {...originalSummary(),version:3,project:projectMetadata()};};
const originalReport=reportHTML;
reportHTML=function(){const m=projectMetadata();const extra=`<section style="border-left:4px solid #164f3d;padding-left:16px;margin:20px 0"><h2>${escapeHTML(m.name||'Паспорт поля')}</h2><p>${m.crop?'Культура: '+escapeHTML(m.crop)+'. ':''}${m.date?'Дата съёмки: '+escapeHTML(m.date)+'.':''}</p>${m.notes?'<p style="white-space:pre-wrap">'+escapeHTML(m.notes)+'</p>':''}</section>`;return originalReport().replace('</h1>','</h1>'+extra);};
refreshProjectBar();
// Expose project actions to supported browser agents using the same validation and UI flow.
if(document.modelContext?.registerTool){
 try{Promise.resolve(document.modelContext.registerTool({name:'read_field_project_status',title:'Состояние проекта',description:'Read field metadata, unsaved state and available analysis. Does not export the image.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input=>{if(input&&Object.keys(input).length)throw new Error('Параметры не требуются.');return {metadata:projectMetadata(),hasImage:state.source,hasAnalysis:!!state.result,unsaved:projectDirty};}})).catch(()=>{});}catch{}
}

