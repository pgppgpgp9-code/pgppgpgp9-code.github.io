/* Explainable scouting support. RGB never determines nutrient deficiency or crop suitability. */
(function(root){
'use strict';
const sources=[
 {title:'Copernicus: описание продуктов Sentinel-2',url:'https://sentiwiki.copernicus.eu/web/s2-products'},
 {title:'FAO: спутниковый мониторинг сельскохозяйственных культур',url:'https://www.fao.org/giews/earthobservation/asis/index_1.jsp?lang=en'}
];
const stages={unknown:'Фаза культуры не указана',early:'Всходы / первые листья',growing:'Активный вегетативный рост',flowering:'Цветение',filling:'Формирование урожая',mature:'Созревание',bare:'После уборки / до посева'};
const goals={inspect:'Осмотреть текущий посев',cover:'Проверить развитие культуры',next:'Спланировать следующий посев'};
const moisture={unknown:'Не проверена',dry:'Сухо при осмотре',normal:'Достаточно влаги при осмотре',wet:'Переувлажнение при осмотре'};
const nutrients={unknown:'Нет заключения',low:'Недостаток по заключению',adequate:'Достаточно по заключению',high:'Избыток по заключению'};
const defaults=()=>({stage:'unknown',goal:'inspect',location:'',previousCrop:''});
const emptyRecord=()=>({moisture:'unknown',visited:false,n:'unknown',p:'unknown',k:'unknown',sampleDate:'',labRef:'',notes:''});
function txt(v,max){if(typeof v!=='string'||v.length>max)throw new Error('Недопустимые данные плана осмотра.');return v;}
function choice(v,list){if(!Object.hasOwn(list,v))throw new Error('Неизвестный вариант в плане осмотра.');return v;}
function validateRecord(raw={}){const r={...emptyRecord(),...raw};
 for(const k of ['n','p','k'])choice(r[k],nutrients);choice(r.moisture,moisture);
 if(typeof r.visited!=='boolean')throw new Error('Некорректная отметка осмотра.');
 const date=txt(r.sampleDate,10);if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new Error('Проверьте дату анализа.');
 return {moisture:r.moisture,visited:r.visited,n:r.n,p:r.p,k:r.k,sampleDate:date,labRef:txt(r.labRef,150),notes:txt(r.notes,1500)};
}
function validate(raw){if(raw==null)return {context:defaults(),signature:'',records:{}};
 if(typeof raw!=='object'||Array.isArray(raw))throw new Error('Некорректный план осмотра.');
 const c={...defaults(),...raw.context},records={};
 choice(c.stage,stages);choice(c.goal,goals);
 const items=Object.entries(raw.records||{});if(items.length>500)throw new Error('Слишком много записей осмотра (максимум 500).');
 for(const [id,value] of items){if(!/^[1-9]\d{0,4}$/.test(id))throw new Error('Неверный номер участка в плане.');records[id]=validateRecord(value);}
 return {context:{stage:c.stage,goal:c.goal,location:txt(c.location,100),previousCrop:txt(c.previousCrop,100)},signature:txt(raw.signature||'',100),records};
}
function signature(r){let h=2166136261;for(let i=0;i<r.labels.length;i++){h=Math.imul(h^(r.labels[i]+(r.inside[i]?8:0)),16777619)>>>0;}return [r.width,r.height,r.low,r.high,r.greenThreshold,h].join(':');}
function bindRecords(saved,r){if(saved.signature!==signature(r))return {};const ids=new Set(r.regions.map(z=>String(z.id)));return Object.fromEntries(Object.entries(saved.records).filter(([id])=>ids.has(id)));}
function planting(c,rec){
 if(c.goal==='inspect')return {title:'Проверьте выбранную культуру на месте',text:'Сравните густоту, равномерность развития и признаки повреждений. Отделите культурные растения от сорняков: цветовой анализ их не различает. Не принимайте решение о пересеве только из-за красного цвета.',examples:[]};
 return {title:'Культуру и сорт выбирают по местным данным',text:'Зафиксируйте регион, предшественник, доступную влагу и результаты почвенного анализа. Сравните местные испытания сортов и условия уборки. Приложение не назначает сорт и норму высева автоматически; обсудите их с агрономом.',examples:[]};
}
function recommend(zone,context=defaults(),record=emptyRecord()){
 const c={...defaults(),...context},rec=validateRecord(record);
 if(!zone||zone.classId===3)return {title:'Недостаточно данных',priority:'Нет оценки',reason:'Нет пригодной для оценки зоны. Проверьте яркость снимка и границу поля.',actions:['Загрузите более подходящий снимок; по серым ячейкам нельзя делать вывод о питании или посеве.'],nutrition:{title:'Не определено',text:'По снимку не определяется.',low:[],high:[],evidence:false},planting:{title:'Нет основания для выбора',text:'Сначала получите пригодный снимок и сведения о поле.',examples:[]}};
 const neutral=!['growing','flowering','filling'].includes(c.stage);
 const priority=zone.classId===0?(neutral?'Проверить с учётом фазы':'Осмотреть в первую очередь'):zone.classId===1?'Сравнить с соседними зонами':'Контрольная точка для сравнения';
 const reason=zone.classId===0?'На снимке мало зелёных пикселей. Причину цветовой анализ не определяет.':zone.classId===1?'Покрытие неоднородно. Это основание для сравнения участков, а не диагноз.':'На снимке много зелени. Это не доказывает плодородие почвы и отсутствие болезней или сорняков.';
 const actions=['Сверьте участок с оригиналом: исключите тень, дорогу и посторонний фон.'];
 if(c.stage==='unknown')actions.push('Укажите фазу культуры: одинаковое покрытие имеет разный смысл для всходов и взрослого посева.');
 if(c.stage==='early')actions.push('Оцените густоту и равномерность всходов на месте; открытая почва между рядами может быть нормальной.');
 if(c.stage==='bare'||c.stage==='mature')actions.push('После уборки или при созревании низкая доля зелени сама по себе не указывает на дефицит питания.');
 if(c.stage==='growing'&&zone.classId<2)actions.push('Осмотрите растения, густоту стояния, корни и почву; сравните с участком той же культуры и фазы.');
 if(c.stage==='flowering')actions.push('На месте проверьте равномерность цветения и опыления. Фото сверху не подтверждает успешное формирование урожая.');
 if(c.stage==='filling')actions.push('Осмотрите формирование продуктивных органов и внесите фактическую массу продукции с пробной площади в разделе урожайности.');
 if(c.stage==='mature')actions.push('Проверьте устойчивость стеблей и полегание. Для сравнения урожая взвесьте очищенное зерно с известной площади и измерьте влажность.');
 if(rec.moisture==='dry')actions.push('Зафиксировано «сухо»: проверьте влагу в корнеобитаемом слое и работу полива, если он есть.');
 else if(rec.moisture==='wet')actions.push('Зафиксировано переувлажнение: проверьте застой воды и состояние корней.');
 else actions.push('Проверьте влажность и признаки уплотнения на месте; по RGB они не измеряются.');
 const evidence=!!rec.labRef.trim()&&!!rec.sampleDate;
 const names={n:'N — азот',p:'P — фосфор',k:'K — калий'};
 const low=evidence?Object.keys(names).filter(k=>rec[k]==='low').map(k=>names[k]):[];
 const high=evidence?Object.keys(names).filter(k=>rec[k]==='high').map(k=>names[k]):[];
 const entered=Object.keys(names).some(k=>rec[k]!=='unknown');
 let nutrition={evidence,low,high,title:'Нехватка удобрений не установлена',text:'Цвет снимка не определяет N, P и K. При подозрении на нарушение питания отберите отдельные пробы в различающихся зонах по инструкции лаборатории; сопоставьте почву и растительные ткани.'};
 if(entered&&!evidence)nutrition={...nutrition,title:'Заключение не привязано',text:'Выбраны оценки N/P/K, но не указаны дата и источник заключения. До их заполнения приложение не использует эти оценки для вывода.'};
 if(evidence&&entered)nutrition={...nutrition,title:low.length?'Недостаток отмечен в ваших данных':high.length?'Избыток отмечен в ваших данных':'По введённым оценкам недостаток не отмечен',text:`Источник: ${rec.labRef}, дата: ${rec.sampleDate}. Это сведения пользователя, не результат анализа фото. ${low.length?'Согласуйте коррекцию питания с агрономом по заключению лаборатории. ':''}${high.length?'Не увеличивайте отмеченные элементы без пересмотра схемы питания. ':''}Нормы внесения и препараты приложение не рассчитывает; неизвестные элементы остаются без оценки.`};
 return {title:priority,priority,reason,actions,nutrition,planting:planting(c,rec)};
}
function route(r,c){const order=[...r.regions].sort((a,b)=>a.classId-b.classId||b.count-a.count||a.id-b.id);return [...order.filter(z=>z.classId===0).slice(0,3),...order.filter(z=>z.classId===1).slice(0,1),...order.filter(z=>z.classId===2).slice(0,1)].map(z=>({id:z.id,classId:z.classId,purpose:recommend(z,c).priority}));}
const api={sources,stages,goals,moisture,nutrients,defaults,emptyRecord,validateRecord,validate,signature,bindRecords,recommend,route};root.FieldAdvice=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

