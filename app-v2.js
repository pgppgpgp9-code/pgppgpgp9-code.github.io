'use strict';
const $=id=>document.getElementById(id),A=FieldAnalysis;
const state={source:false,result:null,name:'',demo:false,mode:'zones',busy:false,filter:-1,selected:0,polygon:[],draft:[],drawing:false,zoom:1,panX:0,panY:0,listLimit:40,revision:0};
const sourceCanvas=document.createElement('canvas'),sampleCanvas=document.createElement('canvas'),zoneCanvas=document.createElement('canvas');
let toastTimer,analysisTimer,viewTransform,pointer=null;
const percent=(n,digits=1)=>Number.isFinite(n)?n>0&&n<.0005?'<0,1%':(n*100).toLocaleString('ru-RU',{maximumFractionDigits:digits})+'%':'нет данных';
const number=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:2});
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setBusy(b){state.busy=b;$('mapBusy').hidden=!b;$('analyzeButton').disabled=b||!state.source;$('drawField').disabled=b||!state.source;for(const id of ['fileInput','topUpload','dropzone','demoButton','emptyDemo'])$(id).disabled=b;document.dispatchEvent(new Event('field:busy'));}
function invalidate(){clearTimeout(analysisTimer);state.revision++;state.result=null;state.selected=0;for(const id of ['results','mapLegend','mapOptions','inspector'])$(id).hidden=true;updateGeo();render();document.dispatchEvent(new Event('field:invalidated'));}
function settings(){const low=Number($('lowBreak').value)/100,high=Number($('highBreak').value)/100;if(low<=0||high>=1||low>=high||!Number.isFinite(low)||!Number.isFinite(high))throw new Error('Порог «Мало» должен быть меньше порога «Много». Допустимо от 1 до 99%.');return {columns:Number($('resolution').value),greenThreshold:Number($('threshold').value)/100,low,high,polygon:state.polygon};}
function setMode(mode){state.mode=mode;document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});$('compareControl').hidden=mode!=='compare';$('opacityControl').hidden=mode!=='overlay';render();}
function resetView(){state.zoom=1;state.panX=0;state.panY=0;render();}
function setSource(name,demo,dimensions){
 clearTimeout(analysisTimer);state.source=true;state.name=name;state.demo=demo;state.polygon=[];state.draft=[];state.drawing=false;state.filter=-1;state.listLimit=40;
 invalidate();['west','east','south','north'].forEach(id=>$(id).value='');$('geoConfirm').checked=false;
 $('fileInfo').hidden=false;$('fileInfo').textContent=`${name} · ${dimensions}`;$('dataBadge').textContent=demo?'Демопример':'Ваш снимок';$('emptyState').hidden=true;$('displayCanvas').hidden=false;$('zoomTools').hidden=false;$('mapCaption').hidden=false;
 const factor=Math.min(1,1200/Math.max(sourceCanvas.width,sourceCanvas.height));sampleCanvas.width=Math.max(1,Math.round(sourceCanvas.width*factor));sampleCanvas.height=Math.max(1,Math.round(sourceCanvas.height*factor));sampleCanvas.getContext('2d',{willReadFrequently:true}).drawImage(sourceCanvas,0,0,sampleCanvas.width,sampleCanvas.height);
 setMode('zones');resetView();updateFieldUI();updateGeo();document.dispatchEvent(new Event('field:source'));
}
async function loadFile(file){
 if(state.busy)return;if(!/\.(jpe?g|png|webp)$/i.test(file.name)){toast('Выберите JPG, PNG или WebP.');return;}if(file.size>30*1024*1024){toast('Файл больше 30 МБ. Уменьшите его перед загрузкой.');return;}
 clearTimeout(analysisTimer);setBusy(true);$('viewerStatus').textContent='Читаем снимок…';let loaded=false;
 try{const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));sourceCanvas.width=Math.max(1,Math.round(bitmap.width*scale));sourceCanvas.height=Math.max(1,Math.round(bitmap.height*scale));sourceCanvas.getContext('2d').drawImage(bitmap,0,0,sourceCanvas.width,sourceCanvas.height);const dims=`${bitmap.width} × ${bitmap.height}`;bitmap.close();setSource(file.name,false,dims);loaded=true;}
 catch{toast('Не удалось открыть снимок. Попробуйте другой JPG, PNG или WebP.');$('viewerStatus').textContent=state.result?'Показан предыдущий результат':'Снимок не загружен';}finally{setBusy(false);}
 if(loaded)await runAnalysis();
}
async function loadDemo(){
 if(state.busy)return;sourceCanvas.width=1000;sourceCanvas.height=640;const ctx=sourceCanvas.getContext('2d'),image=ctx.createImageData(1000,640);let seed=928;
 for(let y=0;y<640;y++)for(let x=0;x<1000;x++){
  seed=(seed*1664525+1013904223)>>>0;const random=seed/4294967296;
  const sparse=Math.exp(-((x-695)**2/52000+(y-230)**2/28000)),sparse2=Math.exp(-((x-250)**2/21000+(y-490)**2/15000));
  const vegetation=Math.max(.04,.94-.9*sparse-.83*sparse2),row=(Math.sin((x+y*.22)*.22)+1)/2;
  const isGreen=(random*.75+row*.25)<vegetation,noise=(random-.5)*26,i=(y*1000+x)*4;
  const rgb=isGreen?[45,120,43]:[146,103,57];for(let c=0;c<3;c++)image.data[i+c]=rgb[c]+noise;image.data[i+3]=255;
 }
 ctx.putImageData(image,0,0);setSource('Демонстрационный участок',true,'1000 × 640');await runAnalysis();
}
async function runAnalysis(){
 clearTimeout(analysisTimer);if(!state.source||state.busy)return;
 let config;try{config=settings();}catch(error){invalidate();$('viewerStatus').textContent=error.message;toast(error.message);return;}
 const revision=state.revision;setBusy(true);$('viewerStatus').textContent='Определяем покрытие и объединяем зоны…';
 // A background browser tab can suspend requestAnimationFrame indefinitely.
 await new Promise(resolve=>setTimeout(resolve,25));
 try{const data=sampleCanvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,sampleCanvas.width,sampleCanvas.height).data;
  const result=A.analyzeCoverage(data,sampleCanvas.width,sampleCanvas.height,config);if(revision!==state.revision)return;
  result.createdAt=new Date().toISOString();state.result=result;state.selected=0;state.listLimit=40;
  buildZones();for(const id of ['results','mapLegend','mapOptions'])$(id).hidden=false;
  $('viewerStatus').textContent=`Готово · участков: ${result.regions.length} · ${result.width} × ${result.height} ячеек`;
  updateGeo();render();document.dispatchEvent(new Event('field:analysis'));
 }catch(error){state.result=null;for(const id of ['results','mapLegend','mapOptions','inspector'])$(id).hidden=true;updateGeo();document.dispatchEvent(new Event('field:invalidated'));$('viewerStatus').textContent=error.message;toast(error.message);}finally{setBusy(false);$('analyzeButton').textContent='Пересчитать зоны';if(revision!==state.revision&&state.source)analysisTimer=setTimeout(runAnalysis,200);}
}
function scheduleAnalysis(){
 $('resolutionLabel').textContent=`${$('resolution').value} ячеек`;$('thresholdLabel').textContent=(Number($('threshold').value)/100).toLocaleString('ru-RU',{minimumFractionDigits:2});
 if(!state.source)return;invalidate();$('viewerStatus').textContent='Настройки изменены. Пересчитываем…';analysisTimer=setTimeout(runAnalysis,420);
}
function buildZones(){
 const r=state.result;if(!r)return;zoneCanvas.width=r.width;zoneCanvas.height=r.height;const ctx=zoneCanvas.getContext('2d'),image=ctx.createImageData(r.width,r.height);
 r.labels.forEach((k,i)=>{const color=A.classes[k].color;image.data[i*4]=parseInt(color.slice(1,3),16);image.data[i*4+1]=parseInt(color.slice(3,5),16);image.data[i*4+2]=parseInt(color.slice(5,7),16);image.data[i*4+3]=r.inside[i]?(state.filter<0||k===state.filter?255:30):0;});ctx.putImageData(image,0,0);
}
function ringPath(ctx,rings,result){ctx.beginPath();for(const ring of rings){ring.forEach(([x,y],i)=>{const px=x/result.width*sourceCanvas.width,py=y/result.height*sourceCanvas.height;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.closePath();}}
function polygonPath(ctx,polygon){ctx.beginPath();polygon.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(x*sourceCanvas.width,y*sourceCanvas.height);else ctx.lineTo(x*sourceCanvas.width,y*sourceCanvas.height);});ctx.closePath();}
function drawMap(ctx,width,height,{exporting=false}={}){
 const sw=sourceCanvas.width,sh=sourceCanvas.height,z=exporting?1:state.zoom,scale=Math.min(width/sw,height/sh)*z,tx=(width-sw*scale)/2+(exporting?0:state.panX),ty=(height-sh*scale)/2+(exporting?0:state.panY);
 if(!exporting)viewTransform={scale,tx,ty,width,height};ctx.fillStyle='#152b25';ctx.fillRect(0,0,width,height);ctx.save();ctx.translate(tx,ty);ctx.scale(scale,scale);ctx.drawImage(sourceCanvas,0,0);
 const r=state.result,mode=exporting?'zones':state.drawing?'original':state.mode,filter=exporting?-1:state.filter;
 if(r&&mode!=='original'){
  ctx.save();if(mode==='compare'){ctx.beginPath();ctx.rect(sw*Number($('compare').value)/100,0,sw,sh);ctx.clip();}
  ctx.imageSmoothingEnabled=false;ctx.globalAlpha=mode==='overlay'?Number($('opacity').value)/100:1;
  if(exporting&&state.filter!==-1){const cached=state.filter;state.filter=-1;buildZones();ctx.drawImage(zoneCanvas,0,0,sw,sh);state.filter=cached;buildZones();}else ctx.drawImage(zoneCanvas,0,0,sw,sh);
  ctx.globalAlpha=1;
  if(exporting||$('showContours').checked){for(const region of r.regions){if(filter>=0&&region.classId!==filter)continue;ringPath(ctx,region.rings,r);ctx.strokeStyle='#20332caa';ctx.lineWidth=1/scale;ctx.stroke();}}
  if(!exporting&&state.selected){const region=r.regions.find(z=>z.id===state.selected);if(region){ringPath(ctx,region.rings,r);ctx.strokeStyle='#10291e';ctx.lineWidth=5/scale;ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=2.5/scale;ctx.stroke();}}
  if(exporting||$('showLabels').checked){const occupied=[];const sorted=[...r.regions].sort((a,b)=>(b.id===state.selected)-(a.id===state.selected)||b.count-a.count);
   for(const region of sorted){if(filter>=0&&region.classId!==filter)continue;const selected=region.id===state.selected;if(!selected&&region.count/r.labels.length*sw*sh*scale*scale<1600)continue;
    const x=region.anchor[0]*sw,y=region.anchor[1]*sh,label=`${region.id} · ${A.classes[region.classId].short}`;ctx.font=`600 ${13/scale}px "Segoe UI",sans-serif`;const boxW=ctx.measureText(label).width+16/scale,boxH=27/scale;
    if(!selected&&occupied.some(p=>Math.abs(p.x-x)<(p.w+boxW)/2&&Math.abs(p.y-y)<boxH+5/scale))continue;
    if(x*scale+tx<0||x*scale+tx>width||y*scale+ty<0||y*scale+ty>height)continue;
    occupied.push({x,y,w:boxW});ctx.fillStyle=selected?'#ffffff':'#16362ded';ctx.fillRect(x-boxW/2,y-boxH/2,boxW,boxH);ctx.fillStyle=selected?'#16362d':'#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x,y);
   }
  }ctx.restore();
 }
 if(state.polygon.length){ctx.save();ctx.beginPath();ctx.rect(0,0,sw,sh);state.polygon.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(x*sw,y*sh);else ctx.lineTo(x*sw,y*sh);});ctx.closePath();ctx.fillStyle='#0b171bbd';ctx.fill('evenodd');polygonPath(ctx,state.polygon);ctx.strokeStyle='#fff';ctx.lineWidth=2/scale;ctx.stroke();ctx.restore();}
 if(!exporting&&state.drawing&&state.draft.length){polygonPath(ctx,state.draft);ctx.fillStyle='#ffffff18';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2/scale;ctx.setLineDash([7/scale,4/scale]);ctx.stroke();ctx.setLineDash([]);state.draft.forEach(([x,y],i)=>{ctx.beginPath();ctx.arc(x*sw,y*sh,5/scale,0,Math.PI*2);ctx.fillStyle='#c7ed92';ctx.fill();ctx.font=`bold ${12/scale}px sans-serif`;ctx.fillStyle='#fff';ctx.fillText(String(i+1),x*sw+9/scale,y*sh-9/scale);});}
 if(mode==='compare'){const x=sw*Number($('compare').value)/100;ctx.strokeStyle='#fff';ctx.lineWidth=3/scale;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,sh);ctx.stroke();}ctx.restore();
}
function render(){
 if(!state.source)return;const canvas=$('displayCanvas'),rect=$('viewer').getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,rect.width),h=Math.max(1,rect.height);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);drawMap(ctx,w,h);$('zoomLabel').textContent=`${Math.round(state.zoom*100)}%`;
}
function getBounds(){const b={};for(const key of ['west','east','south','north']){if($(key).value.trim()==='')return null;b[key]=Number($(key).value);}return A.validateBounds(b)&&$('geoConfirm').checked?b:null;}
function zoneArea(region){const b=getBounds(),r=state.result;if(!b||!r)return null;const dy=(b.north-b.south)/r.height,dx=(b.east-b.west)/r.width;let area=0;for(const i of region.cells){const row=Math.floor(i/r.width),north=b.north-row*dy;area+=A.areaHa({west:b.west,east:b.west+dx,south:north-dy,north});}return area;}
function updateGeo(){
 const b=getBounds(),some=['west','east','south','north'].some(k=>$(k).value!=='');$('geoStatus').textContent=b?'Ручная привязка WGS84 готова.':some?'Проверьте четыре границы и подтвердите ортофотоплан.':'Без привязки доступны PNG, таблица и отчёт.';
 $('jsonExport').disabled=!b||!state.result;$('tiffExport').disabled=!b||!state.result;$('northArrow').hidden=!b;
 if(state.source)$('mapCaption').textContent=state.drawing?'Поставьте точки по периметру поля':state.demo?'Синтетический пример · не настоящее поле':b?'WGS84 · ручная привязка':'Координаты не заданы';
 if(state.result){updateResults();if(state.selected)showRegion(state.selected);}
}
function updateLegend(){
 const r=state.result;$('mapLegend').replaceChildren();const defs=[{id:-1,name:'Все зоны',color:null},...A.classes.map((c,id)=>({...c,id}))];
 for(const c of defs){const button=document.createElement('button');button.className='legend-chip'+(state.filter===c.id?' active':'');button.setAttribute('aria-pressed',String(state.filter===c.id));button.innerHTML=`${c.color?`<span class="legend-swatch" style="background:${c.color}"></span>`:''}${c.name}${c.id<0?'':` <small>${percent(r.counts[c.id]/r.targetCount)}</small>`}`;button.onclick=()=>{state.filter=c.id;state.selected=0;state.listLimit=40;$('inspector').hidden=true;if(state.mode==='original')setMode('zones');buildZones();updateLegend();updateRegionList();render();};$('mapLegend').append(button);}
}
function updateResults(){
 const r=state.result;if(!r)return;updateLegend();const regionAreas=new Map(r.regions.map(z=>[z.id,zoneArea(z)]));$('stats').replaceChildren();$('distribution').replaceChildren();
 A.classes.forEach((c,k)=>{const ratio=r.counts[k]/r.targetCount,card=document.createElement('div');card.className='stat';const area=getBounds()&&k!==3?r.regions.filter(z=>z.classId===k).reduce((s,z)=>s+regionAreas.get(z.id),0):null;card.innerHTML=`<div class="stat-title"><span class="dot" style="background:${c.color}"></span>${c.name}</div><div class="stat-number">${percent(ratio)}</div><div class="stat-area">${area===null?`${number(r.counts[k])} ячеек`:`≈ ${number(area)} га`}</div>`;$('stats').append(card);const span=document.createElement('span');span.style.width=`${ratio*100}%`;span.style.background=c.color;$('distribution').append(span);});
 $('resultMeta').textContent=`Участков: ${r.regions.length} · покрытие RGB`;
 $('coverageNote').textContent=`Доли зон рассчитаны ${state.polygon.length?'внутри выбранной границы':'по всему снимку, включая фон'}. Серые ячейки включены в площадь, но не в оценку зелени. ${getBounds()?'Площади приблизительные.':'Для площади в гектарах укажите геопривязку.'}`;
 const activeClasses=r.counts.slice(0,3).filter(n=>n>0).length;
 $('analysisInsight').textContent=r.counts[3]===r.targetCount?'Недостаточно пригодных пикселей. Проверьте освещение и выберите другой снимок.':`Зелёные пиксели занимают ${percent(r.greenFraction)} оцениваемой области. ${activeClasses===1?'На снимке получился один класс: алгоритм не создаёт искусственные различия. При необходимости проверьте пороги.':`Красным отмечено ${percent(r.counts[0]/r.targetCount)} площади — участки с меньшим покрытием зеленью.`}`;
 updateRegionList();
}
function updateRegionList(){
 const r=state.result;if(!r)return;const rows=r.regions.filter(z=>state.filter<0||z.classId===state.filter).sort((a,b)=>a.classId-b.classId||b.count-a.count);$('zoneDirectoryTitle').textContent=`Участки на карте · ${rows.length}`;$('regionList').replaceChildren();
 for(const z of rows.slice(0,state.listLimit)){const button=document.createElement('button');button.className='region-row'+(state.selected===z.id?' selected':'');button.dataset.region=String(z.id);button.innerHTML=`<span class="legend-swatch" style="background:${A.classes[z.classId].color}"></span><strong>№ ${z.id}</strong><span>${A.classes[z.classId].name}</span><span>Зелень: ${percent(z.coverage)}</span><small>${percent(z.count/r.targetCount)} поля</small>`;button.onclick=()=>{showRegion(z.id);focusRegion(z);};$('regionList').append(button);}
 if(!rows.length){const p=document.createElement('p');p.className='hint';p.textContent=state.filter===3?'Серые ячейки не объединяются в диагностические участки.':'Участков этого класса нет.';$('regionList').append(p);}$('moreRegions').hidden=rows.length<=state.listLimit;
}
function showRegion(id){
 const r=state.result,z=r?.regions.find(z=>z.id===id);if(!z)return;state.selected=id;const area=zoneArea(z);
 $('inspector').hidden=false;$('inspector').innerHTML=`<div><span class="legend-swatch" style="background:${A.classes[z.classId].color}"></span><strong>Участок № ${z.id} · ${A.classes[z.classId].name}</strong></div><div class="inspector-data"><span>Зелёное покрытие <b>${percent(z.coverage)}</b></span><span>Доля области <b>${percent(z.count/r.targetCount)}</b></span><span>${area===null?'Размер':'Площадь'} <b>${area===null?number(z.count)+' ячеек':'≈ '+number(area)+' га'}</b></span></div><p>${z.classId===0?'Зелёных пикселей мало. Сверьте участок с оригиналом: это может быть почва, редкие всходы или влияние освещения.':z.classId===1?'Смешанное покрытие: зелень чередуется с участками другого цвета.':'Большая часть пригодных пикселей зелёная. Это не подтверждает отсутствие заболеваний.'}</p>`;
 document.querySelectorAll('.region-row').forEach(b=>b.classList.toggle('selected',Number(b.dataset.region)===id));render();document.dispatchEvent(new Event('field:selection'));
}
function focusRegion(z){if(state.mode==='original')setMode('zones');state.zoom=Math.max(state.zoom,1.5);const rect=$('viewer').getBoundingClientRect(),s=Math.min(rect.width/sourceCanvas.width,rect.height/sourceCanvas.height)*state.zoom;state.panX=(.5-z.anchor[0])*sourceCanvas.width*s;state.panY=(.5-z.anchor[1])*sourceCanvas.height*s;render();$('viewer').scrollIntoView({behavior:'smooth',block:'center'});}
function canvasPoint(event){const rect=$('displayCanvas').getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;if(!viewTransform)return null;const u=(x-viewTransform.tx)/viewTransform.scale/sourceCanvas.width,v=(y-viewTransform.ty)/viewTransform.scale/sourceCanvas.height;return u>=0&&u<1&&v>=0&&v<1?[u,v]:null;}
function pick(point){if(!point||!state.result)return;const r=state.result,x=Math.min(r.width-1,Math.floor(point[0]*r.width)),y=Math.min(r.height-1,Math.floor(point[1]*r.height)),i=y*r.width+x;if(!r.inside[i]){toast('За границей поля. Эта область исключена из расчёта.');return;}if(r.labels[i]===3){state.selected=0;$('inspector').hidden=false;$('inspector').textContent='Без оценки: слишком мало пригодных пикселей — темнота, засветка или прозрачность.';render();document.dispatchEvent(new Event('field:selection'));return;}if(state.filter>=0&&r.labels[i]!==state.filter){toast('Этот класс скрыт фильтром. Нажмите «Все зоны».');return;}showRegion(r.cellRegions[i]);}
function updateFieldUI(){$('drawingActions').hidden=!state.drawing;$('drawField').hidden=state.drawing;$('clearField').hidden=!state.polygon.length||state.drawing;$('fieldStatus').textContent=state.drawing?`Поставьте минимум 3 точки. Сейчас: ${state.draft.length}. Затем примените границу.`:state.polygon.length?'Расчёт только внутри выбранной границы.':'Сейчас анализируется весь снимок.';$('displayCanvas').style.cursor=state.drawing?'crosshair':'grab';$('finishField').disabled=state.draft.length<3;updateGeo();render();document.dispatchEvent(new Event('field:boundary'));}
function startDrawing(){if(!state.source||state.busy)return;state.drawing=true;state.draft=[];resetView();updateFieldUI();$('viewer').scrollIntoView({behavior:'smooth',block:'center'});}
async function finishDrawing(){if(!A.validPolygon(state.draft)){toast('Граница должна быть без пересечений и содержать минимум 3 разные точки.');return;}state.polygon=state.draft.map(p=>[...p]);state.draft=[];state.drawing=false;invalidate();setMode('zones');updateFieldUI();await runAnalysis();}
function zoomBy(factor){if(!state.source||state.drawing)return;const before=state.zoom;state.zoom=Math.max(1,Math.min(6,state.zoom*factor));state.panX*=state.zoom/before;state.panY*=state.zoom/before;render();}
const canvas=$('displayCanvas');
canvas.addEventListener('pointerdown',e=>{if(e.button!==0||state.busy)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.lastX,dy=e.clientY-pointer.lastY;if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>5)pointer.moved=true;if(!state.drawing&&pointer.moved){state.panX+=dx;state.panY+=dy;render();}pointer.lastX=e.clientX;pointer.lastY=e.clientY;});
canvas.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;if(!pointer.moved){const point=canvasPoint(e);if(state.drawing&&point){if(state.draft.length>=100)toast('Максимум 100 точек границы.');else{state.draft.push(point);updateFieldUI();}}else pick(point);}pointer=null;});canvas.addEventListener('pointercancel',()=>{pointer=null;});
canvas.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.drawing){state.drawing=false;state.draft=[];updateFieldUI();}if(e.key==='Enter'&&state.drawing)finishDrawing();if(e.key==='+'||e.key==='=')zoomBy(1.4);if(e.key==='-')zoomBy(1/1.4);});
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function filename(ext){return `pole-${state.demo?'demo':state.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,70)}.${ext}`;}
function exportCanvas(){
 const out=document.createElement('canvas'),w=Math.max(1000,sourceCanvas.width),h=Math.min(1800,Math.max(200,Math.round(sourceCanvas.height*w/sourceCanvas.width)));out.width=w;out.height=h+152;const ctx=out.getContext('2d');drawMap(ctx,w,h,{exporting:true});ctx.fillStyle='#fff';ctx.fillRect(0,h,w,152);ctx.fillStyle='#203b32';ctx.font='bold 21px sans-serif';ctx.textAlign='left';ctx.fillText(`ПОЛЕ · Карта покрытия зеленью${state.demo?' · ДЕМО':''}`,22,h+31);ctx.font='15px sans-serif';
 A.classes.forEach((c,k)=>{const x=22+k*(w-35)/4;ctx.fillStyle=c.color;ctx.fillRect(x,h+52,15,15);ctx.fillStyle='#203b32';ctx.fillText(c.name,x+23,h+65);ctx.fillText(percent(state.result.counts[k]/state.result.targetCount)+' площади',x,h+94);});ctx.font='13px sans-serif';ctx.fillText(`Пороги покрытия: ${percent(state.result.low,0)} / ${percent(state.result.high,0)}. RGB-анализ, не диагноз. ${state.polygon.length?'Только выделенное поле.':'Весь снимок, включая фон.'}`,22,h+130);return out;
}
function summary(){const r=state.result;if(!r)throw new Error('Сначала дождитесь анализа снимка.');return {application:'Поле',version:2,source:state.name,synthetic_demo:state.demo,created_at:r.createdAt,method:'Доля зелёных пикселей (RGB / ExG) в каждой ячейке',green_pixel_rule:{exg_threshold:r.greenThreshold,green_red_ratio:1.04,green_blue_ratio:1.04},class_breaks:[r.low,r.high],green_fraction:r.greenFraction,grid:{width:r.width,height:r.height},evaluated_cells:r.targetCount,roi_normalized:r.polygon,bounds_wgs84:getBounds(),classes:A.classes.map((c,k)=>({...c,value:k===3?0:k+1,cells:r.counts[k],percent:100*r.counts[k]/r.targetCount})),regions:r.regions.map(z=>({id:z.id,class:z.classId+1,label:A.classes[z.classId].name,green_percent:100*z.coverage,field_percent:100*z.count/r.targetCount,cells:z.count,area_ha:zoneArea(z)}))};}
function reportHTML(){
 const r=summary(),rows=r.regions.map(z=>`<tr><td>${z.id}</td><td>${z.label}</td><td>${number(z.green_percent)}%</td><td>${number(z.field_percent)}%</td><td>${z.area_ha===null?'—':number(z.area_ha)}</td></tr>`).join('');
 return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Поле — отчёт по зонам</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#203b32;max-width:1100px;margin:30px auto;padding:0 20px}h1{font-size:30px}img{max-width:100%}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{text-align:left;padding:10px;border-bottom:1px solid #ddd}pre{white-space:pre-wrap;font-size:12px}button{background:#164f3d;color:white;border:0;border-radius:6px;padding:12px;cursor:pointer}@media print{button{display:none}body{margin:0;padding:0}tr{break-inside:avoid}thead{display:table-header-group}}</style><body><button onclick="window.print()">Печать / сохранить PDF</button><h1>Поле · Карта диагностических зон</h1><p>${escapeHTML(state.name)}${state.demo?' · СИНТЕТИЧЕСКИЙ ДЕМОПРИМЕР':''}<br>${escapeHTML(new Date(r.created_at).toLocaleString('ru-RU'))} · ${r.regions.length} участков</p><img src="${exportCanvas().toDataURL('image/png')}" alt="Карта зон с номерами и легендой"><p>Зелёные пиксели: ${percent(r.green_fraction)} оцениваемой области. Пороги покрытия: ${percent(r.class_breaks[0])} / ${percent(r.class_breaks[1])}. Область: ${r.roi_normalized.length?'выделенное поле':'весь снимок, включая фон'}.</p><table><thead><tr><th>№</th><th>Класс</th><th>Зелени в зоне</th><th>Доля области</th><th>Га, ≈</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Нет пригодных для оценки зон.</td></tr>'}</tbody></table><p>Цветовой анализ не является диагнозом, NDVI или рекомендацией внесения удобрений. Освещение, тени и цвет почвы влияют на результат. Среднее покрытие зоны — среднее по её ячейкам; доли классов — по площади ячеек. Серые ячейки не оцениваются.</p><p>${r.bounds_wgs84?'Ручная привязка WGS84: '+escapeHTML(JSON.stringify(r.bounds_wgs84))+'. Площади приблизительные.':'Геопривязка отсутствует. Площадь в гектарах не рассчитывалась.'}</p><details><summary>Параметры и данные расчёта</summary><pre>${escapeHTML(JSON.stringify(r,null,2))}</pre></details></body></html>`;
}
function exportGeo(format){if(!state.result||!getBounds()){toast('Укажите и подтвердите географическую привязку.');return;}const meta={source:state.name,synthetic:state.demo,created_at:state.result.createdAt};if(format==='json')download(new Blob([JSON.stringify(A.geojson(state.result,getBounds(),meta),null,2)],{type:'application/geo+json'}),filename('geojson'));else{download(new Blob([A.geotiff(state.result,getBounds(),meta)],{type:'image/tiff'}),filename('tif'));toast('GeoTIFF: 1 — мало, 2 — средне, 3 — много зелени; 0 — нет данных.');}}
function openFile(){if(!state.busy)$('fileInput').click();}
['topUpload','dropzone'].forEach(id=>$(id).onclick=openFile);['demoButton','emptyDemo'].forEach(id=>$(id).onclick=loadDemo);$('analyzeButton').onclick=runAnalysis;
$('fileInput').onchange=e=>{if(e.target.files[0])loadFile(e.target.files[0]);e.target.value='';};
['dragenter','dragover'].forEach(event=>$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.add('dragging');}));['dragleave','drop'].forEach(event=>$('dropzone').addEventListener(event,e=>{e.preventDefault();$('dropzone').classList.remove('dragging');}));$('dropzone').addEventListener('drop',e=>{if(e.dataTransfer.files[0])loadFile(e.dataTransfer.files[0]);});
['resolution','threshold'].forEach(id=>$(id).oninput=scheduleAnalysis);['lowBreak','highBreak'].forEach(id=>$(id).onchange=scheduleAnalysis);
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.mode));
$('opacity').oninput=()=>{$('opacityLabel').textContent=`${$('opacity').value}%`;render();};$('compare').oninput=render;['showContours','showLabels'].forEach(id=>$(id).onchange=render);
$('zoomIn').onclick=()=>zoomBy(1.4);$('zoomOut').onclick=()=>zoomBy(1/1.4);$('fitView').onclick=resetView;
$('drawField').onclick=startDrawing;$('finishField').onclick=finishDrawing;$('undoPoint').onclick=()=>{state.draft.pop();updateFieldUI();};$('cancelField').onclick=()=>{state.drawing=false;state.draft=[];updateFieldUI();};$('clearField').onclick=async()=>{state.polygon=[];invalidate();updateFieldUI();await runAnalysis();};
['west','east','south','north','geoConfirm'].forEach(id=>$(id).addEventListener('input',updateGeo));$('moreRegions').onclick=()=>{state.listLimit+=40;updateRegionList();};
$('helpButton').onclick=()=>$('helpDialog').showModal();['closeHelp','helpDone'].forEach(id=>$(id).onclick=()=>$('helpDialog').close());
$('pngExport').onclick=()=>{if(state.result)exportCanvas().toBlob(blob=>{if(blob)download(blob,filename('png'));},'image/png');};$('reportExport').onclick=()=>{if(state.result)download(new Blob([reportHTML()],{type:'text/html;charset=utf-8'}),filename('report.html'));};$('jsonExport').onclick=()=>exportGeo('json');$('tiffExport').onclick=()=>exportGeo('tiff');
$('csvExport').onclick=()=>{if(!state.result)return;const r=summary(),lines=['Номер зоны;Класс;Зелёное покрытие (%);Доля области (%);Площадь (га);Ячейки',...r.regions.map(z=>[z.id,z.label,z.green_percent.toFixed(2).replace('.',','),z.field_percent.toFixed(2).replace('.',','),z.area_ha===null?'':z.area_ha.toFixed(4).replace('.',','),z.cells].join(';'))];download(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),filename('zones.csv'));};
new ResizeObserver(render).observe($('viewer'));
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 const tools=[{name:'load_field_demo',title:'Открыть демопример',description:'Replace the image with labeled synthetic data and calculate green-coverage zones.',annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async()=>{if(state.busy)throw new Error('Обработка уже идёт.');await loadDemo();return summary();}},
 {name:'analyze_field_image',title:'Сформировать зоны',description:'Recalculate the loaded image with visible thresholds and field boundary.',annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async()=>{if(!state.source||state.busy)throw new Error('Загрузите снимок и дождитесь обработки.');await runAnalysis();return summary();}},
 {name:'read_field_analysis',title:'Прочитать результат',description:'Read green coverage, numbered regions, thresholds and selected field boundary.',annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>summary()}];
 for(const tool of tools){const execute=tool.execute;tool.inputSchema={type:'object',properties:{},additionalProperties:false};tool.execute=input=>{if(input&&Object.keys(input).length)throw new Error('Параметры не требуются.');return execute();};try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}

