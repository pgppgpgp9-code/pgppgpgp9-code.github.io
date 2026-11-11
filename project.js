/* Portable project schema. Pure validation shared by browser and Node checks. */
(function(root){
'use strict';
function text(value,max){if(typeof value!=='string'||value.length>max)throw new Error('Недопустимые текстовые данные проекта.');return value;}
function validate(p,A){
 if(!p||p.format!=='pole-project'||![1,2,3].includes(p.version))throw new Error('Это не поддерживаемый файл проекта «Поле».');
 if(!p.image||!Number.isInteger(p.image.width)||!Number.isInteger(p.image.height)||p.image.width<1||p.image.height<1||p.image.width>1800||p.image.height>1800)throw new Error('Неверные размеры снимка в проекте.');
 if(typeof p.image.data!=='string'||p.image.data.length>24000000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(p.image.data))throw new Error('Проект должен содержать встроенный PNG, JPG или WebP.');
 const s=p.settings;if(!s||!Number.isInteger(s.columns)||s.columns<30||s.columns>150||s.columns%10!==0||!Number.isFinite(s.greenThreshold)||s.greenThreshold<0||s.greenThreshold>.3||!Number.isInteger(s.lowPercent)||!Number.isInteger(s.highPercent)||s.lowPercent<1||s.highPercent>99||s.lowPercent>=s.highPercent)throw new Error('Некорректные настройки проекта.');
 if(Math.abs(s.greenThreshold*100-Math.round(s.greenThreshold*100))>1e-8)throw new Error('Порог зелени должен иметь шаг 0,01.');
 if(!Array.isArray(p.polygon)||(p.polygon.length&&!A.validPolygon(p.polygon)))throw new Error('Некорректная граница поля.');
 if(p.bounds!==null&&!A.validateBounds(p.bounds))throw new Error('Некорректная географическая привязка.');
 if(typeof p.synthetic!=='boolean')throw new Error('В проекте отсутствует тип снимка.');
 const m=p.metadata||{};const name=text(m.name??'',100),crop=text(m.crop??'',80),date=text(m.date??'',10),notes=text(m.notes??'',5000);
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new Error('Некорректная дата съёмки.');
 const result={format:'pole-project',version:p.version,sourceName:text(p.sourceName,300),synthetic:p.synthetic,image:{width:p.image.width,height:p.image.height,data:p.image.data},settings:{...s},polygon:p.polygon.map(point=>[...point]),bounds:p.bounds?{west:p.bounds.west,east:p.bounds.east,south:p.bounds.south,north:p.bounds.north}:null,metadata:{name,crop,date,notes}};
 if(p.version>=2){const advice=typeof module!=='undefined'?require('./advice.js'):root.FieldAdvice;result.advisory=advice.validate(p.advisory);}
 if(p.version===3){const corn=typeof module!=='undefined'?require('./corn.js'):root.CornYield;result.corn=corn.validate(p.corn);}
 return result;
}
const api={validate};root.FieldProject=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

