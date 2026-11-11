/* Sentinel-2 Collection 1. All calculations use source pixels, not map tiles. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SatelliteCore=api;})(typeof globalThis==='object'?globalThis:this,()=>{
 'use strict';
 const API='https://earth-search.aws.element84.com/v1',COLLECTION='sentinel-2-c1-l2a';
 const inside=(p,ring)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 const bounds=ring=>[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
 function area(ring){const rad=Math.PI/180;let sum=0;for(let i=0;i<ring.length-1;i++)sum+=(ring[i+1][0]-ring[i][0])*rad*(2+Math.sin(ring[i][1]*rad)+Math.sin(ring[i+1][1]*rad));return Math.abs(sum*6371008.8**2/2)/10000;}
 function validate(input){
  let g=input?.type==='FeatureCollection'?(input.features?.length===1?input.features[0]?.geometry:null):input?.type==='Feature'?input.geometry:input;
  if(g?.type!=='Polygon'||g.coordinates?.length!==1)throw Error('Нужен один полигон GeoJSON без отверстий, в координатах WGS84 (долгота, широта).');
  let ring=g.coordinates[0];if(!Array.isArray(ring)||ring.length<4||ring.length>1000)throw Error('Граница должна содержать от 3 до 999 точек.');
  if(ring.some(p=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||p[1]<-56||p[1]>83))throw Error('Проверьте координаты: долгота от −180 до 180, широта от −56 до 83.');
  ring=ring.map(p=>p.slice(0,2));if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw Error('Полигон должен быть замкнут: первая и последняя точки совпадают.');
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const on=(a,b,p)=>Math.abs(cross(a,b,p))<1e-12&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
  for(let i=0;i<ring.length-1;i++){if(ring[i][0]===ring[i+1][0]&&ring[i][1]===ring[i+1][1])throw Error('Уберите повторяющиеся соседние точки границы.');for(let j=i+2;j<ring.length-1;j++){if(i===0&&j===ring.length-2)continue;const a=ring[i],b=ring[i+1],c=ring[j],d=ring[j+1];if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw Error('Граница пересекает сама себя. Обведите поле заново.');}}
  const box=bounds(ring),ha=area(ring),lat=(box[1]+box[3])/2;
  if(ha<.1||ha>5000||(box[2]-box[0])*111320*Math.cos(lat*Math.PI/180)>12000||(box[3]-box[1])*111320>12000)throw Error('Для браузерной версии выберите поле от 0,1 до 5 000 га, не шире 12 км. Большое хозяйство разделите на поля.');
  return {type:'Polygon',coordinates:[ring]};
 }
 function crs(epsg){if(epsg>=32601&&epsg<=32660)return `+proj=utm +zone=${epsg-32600} +datum=WGS84 +units=m +no_defs`;if(epsg>=32701&&epsg<=32760)return `+proj=utm +zone=${epsg-32700} +south +datum=WGS84 +units=m +no_defs`;throw Error('Проекция этого снимка пока не поддерживается. Выберите другой.');}
 function ndvi(red,nir,rm,nm){if(!Number.isFinite(red)||!Number.isFinite(nir)||red===(rm.nodata??0)||nir===(nm.nodata??0))return NaN;const r=red*(rm.scale??1)+(rm.offset??0),n=nir*(nm.scale??1)+(nm.offset??0);if(r<0||n<0||r+n<=0)return NaN;const v=(n-r)/(n+r);return v>=-1&&v<=1?v:NaN;}
 const classify=v=>!Number.isFinite(v)?-1:v<.3?0:v<.6?1:2;
 const colors=['#bd704e','#d6b955','#428166'];
 function summarize(values,mask){let total=0,valid=0,sum=0,min=Infinity,max=-Infinity;const counts=[0,0,0];for(let i=0;i<values.length;i++){if(!mask[i])continue;total++;const v=values[i];if(!Number.isFinite(v))continue;valid++;sum+=v;min=Math.min(min,v);max=Math.max(max,v);counts[classify(v)]++;}return {total,valid,coverage:total?valid/total:0,mean:valid?sum/valid:null,min:valid?min:null,max:valid?max:null,counts};}
 function sample(result,lonlat,proj4){const xy=proj4('EPSG:4326',crs(result.epsg),lonlat),x=Math.floor((xy[0]-result.origin[0])/result.step),y=Math.floor((result.origin[1]-xy[1])/result.step);if(x<0||y<0||x>=result.width||y>=result.height)return NaN;return result.values[y*result.width+x];}
 function compare(earlier,later,proj4){const values=new Float32Array(later.values.length).fill(NaN);let sum=0,valid=0,down=0,up=0;const projection=crs(later.epsg);for(let i=0;i<values.length;i++){if(!Number.isFinite(later.values[i]))continue;const lonlat=proj4(projection,'EPSG:4326',[later.origin[0]+(i%later.width+.5)*later.step,later.origin[1]-(Math.floor(i/later.width)+.5)*later.step]),a=sample(earlier,lonlat,proj4);if(!Number.isFinite(a))continue;const v=later.values[i]-a;values[i]=v;sum+=v;valid++;if(v<-.1)down++;else if(v>.1)up++;}const denominator=later.stats.expected||later.stats.total;return {values,valid,coverage:denominator?Math.min(1,valid/denominator):0,mean:valid?sum/valid:null,down,up,stable:valid-down-up};}
 async function search(geometry,start,end,cloud,signal){
  validate(geometry);if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end||Date.parse(end)-Date.parse(start)>366*86400000||end>new Date().toISOString().slice(0,10))throw Error('Укажите период до одного года, без будущих дат.');
  const query=new URLSearchParams({collections:COLLECTION,bbox:bounds(geometry.coordinates[0]).join(','),datetime:`${start}T00:00:00Z/${end}T23:59:59Z`,limit:'100',sortby:'-properties.datetime'});
  // Read a bounded number of pages; report truncation rather than silently claiming completeness.
  let url=`${API}/search?${query}`,all=[],truncated=false;
  for(let page=0;page<5&&url;page++){const r=await fetch(url,{signal});if(!r.ok)throw Error(`Каталог снимков временно недоступен (${r.status}). Повторите поиск позже.`);const data=await r.json();all.push(...(data.features||[]));const next=data.links?.find(l=>l.rel==='next');url=next?.href||null;if(url&&!url.startsWith(API+'/'))throw Error('Каталог вернул неподдерживаемую ссылку.');truncated=!!url;}
  const unique=new Set();return {truncated,items:all.filter(f=>{const key=f.id;if(unique.has(key)||!f.assets?.red||!f.assets?.nir||!f.assets?.scl||(f.properties['eo:cloud_cover']??101)>cloud)return false;unique.add(key);return true;}).sort((a,b)=>b.properties.datetime.localeCompare(a.properties.datetime))};
 }
 async function load(item,geometry,deps,signal,onProgress=()=>{}){
  const {GeoTIFF,proj4}=deps,epsg=item.properties['proj:epsg']||Number(String(item.properties['proj:code']||'').replace('EPSG:','')),projection=crs(epsg),ring=validate(geometry).coordinates[0].map(p=>proj4('EPSG:4326',projection,p)),box=bounds(ring);
  const rasters={};let done=0;
  await Promise.all(['red','nir','scl'].map(async name=>{
   const asset=item.assets[name],url=new URL(asset.href);if(url.protocol!=='https:'||!url.hostname.endsWith('.amazonaws.com'))throw Error('Неподдерживаемое хранилище снимка.');
   const tiff=await GeoTIFF.fromUrl(url.href,{allowFullFile:false,blockSize:65536,cacheSize:40},signal);
   const image=await tiff.getImage(),origin=image.getOrigin(),resolution=image.getResolution(),step=resolution[0];
   if(!(step>0)||Math.abs(resolution[1]+step)>.001)throw Error('Неподдерживаемая сетка снимка.');
   const pad=name==='scl'?1:0;
   const window=[Math.max(0,Math.floor((box[0]-origin[0])/step)-pad),Math.max(0,Math.floor((origin[1]-box[3])/step)-pad),Math.min(image.getWidth(),Math.ceil((box[2]-origin[0])/step)+pad),Math.min(image.getHeight(),Math.ceil((origin[1]-box[1])/step)+pad)];
   if(window[0]>=window[2]||window[1]>=window[3])throw Error('Этот фрагмент снимка не покрывает поле. Выберите соседний снимок.');
   if((window[2]-window[0])*(window[3]-window[1])>1500000)throw Error('Поле слишком большое для браузерного расчёта. Выберите меньшую границу.');
   const data=await image.readRasters({window,samples:[0],signal});
   rasters[name]={data:data[0],width:window[2]-window[0],height:window[3]-window[1],origin:[origin[0]+window[0]*step,origin[1]-window[1]*step],step,meta:asset['raster:bands']?.[0]||{}};
   onProgress(`Загружено каналов: ${++done} из 3`);
  }));
  signal?.throwIfAborted();const r=rasters.red,n=rasters.nir,s=rasters.scl;
  if(r.width!==n.width||r.height!==n.height||r.origin.some((v,i)=>v!==n.origin[i])||r.step!==10||n.step!==10)throw Error('Сетки красного и инфракрасного каналов не совпадают.');
  const values=new Float32Array(r.data.length).fill(NaN),mask=new Uint8Array(values.length);let rejected=0;
  for(let i=0;i<values.length;i++){
   const x=r.origin[0]+(i%r.width+.5)*r.step,y=r.origin[1]-(Math.floor(i/r.width)+.5)*r.step;if(!inside([x,y],ring))continue;mask[i]=1;
   const sx=Math.floor((x-s.origin[0])/s.step),sy=Math.floor((s.origin[1]-y)/s.step),c=s.data[sy*s.width+sx];
   // Conservative: only vegetation and bare ground. Clouds/shadows have a one-SCL-pixel buffer.
   let clear=(c===4||c===5);for(let yy=Math.max(0,sy-1);yy<=Math.min(s.height-1,sy+1)&&clear;yy++)for(let xx=Math.max(0,sx-1);xx<=Math.min(s.width-1,sx+1);xx++)if([3,8,9,10,11].includes(s.data[yy*s.width+xx])){clear=false;break;}
   if(clear)values[i]=ndvi(r.data[i],n.data[i],r.meta,n.meta);if(!Number.isFinite(values[i]))rejected++;
  }
  const expected=Math.abs(ring.reduce((sum,p,i)=>i?sum+ring[i-1][0]*p[1]-p[0]*ring[i-1][1]:sum,0))/2/(r.step*r.step);
  const stats=summarize(values,mask);stats.expected=expected;stats.inTileCoverage=expected?Math.min(1,stats.total/expected):0;
  // Denominator includes field area outside this tile; never call a partial tile a fully clear field.
  stats.fieldCoverage=expected?Math.min(1,stats.valid/expected):0;
  return {item,geometry,epsg,origin:r.origin,step:r.step,width:r.width,height:r.height,values,mask,stats,rejected,calibration:{red:r.meta,nir:n.meta},computedAt:new Date().toISOString()};
 }
 function geotiff(result){
  // Minimal TIFF 6.0: one uncompressed Float32 strip, explicit UTM GeoKeys and nodata.
  const {width,height,origin,epsg,values,step}=result;crs(epsg);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width*height!==values.length||width<1||height<1)throw Error('Некорректный размер растра.');
  const short=arr=>{const b=new Uint8Array(arr.length*2),d=new DataView(b.buffer);arr.forEach((v,i)=>d.setUint16(i*2,v,true));return b;};
  const long=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b;};
  const doubles=arr=>{const b=new Uint8Array(arr.length*8),d=new DataView(b.buffer);arr.forEach((v,i)=>d.setFloat64(i*8,v,true));return b;};
  const ascii=s=>new TextEncoder().encode(s+'\0');
  const tags=[[256,4,1,long(width)],[257,4,1,long(height)],[258,3,1,short([32])],[259,3,1,short([1])],[262,3,1,short([1])],[270,2,0,ascii(`NDVI; ${result.item?.id||'GeoZoning'}; Copernicus Sentinel-2 / Earth Search; SCL 4,5; cloud buffer 20m`)],[273,4,1,long(0)],[277,3,1,short([1])],[278,4,1,long(height)],[279,4,1,long(width*height*4)],[339,3,1,short([3])],[33550,12,3,doubles([step,step,0])],[33922,12,6,doubles([0,0,0,...origin,0])],[34735,3,20,short([1,1,0,4,1024,0,1,1,1025,0,1,1,3072,0,1,epsg,3076,0,1,9001])],[42113,2,6,ascii('-9999')]];
  let offset=8+2+tags.length*12+4;offset=Math.ceil(offset/8)*8;
  for(const tag of tags){if(tag[1]===2)tag[2]=tag[3].length;if(tag[3].length>4){tag[4]=offset;offset+=Math.ceil(tag[3].length/8)*8;}}
  const pixelOffset=offset,buffer=new ArrayBuffer(pixelOffset+values.length*4),view=new DataView(buffer),bytes=new Uint8Array(buffer);bytes.set([73,73,42,0]);view.setUint32(4,8,true);view.setUint16(8,tags.length,true);
  tags.forEach((tag,i)=>{const at=10+i*12;view.setUint16(at,tag[0],true);view.setUint16(at+2,tag[1],true);view.setUint32(at+4,tag[2],true);if(tag[0]===273)view.setUint32(at+8,pixelOffset,true);else if(tag[3].length<=4)bytes.set(tag[3],at+8);else{view.setUint32(at+8,tag[4],true);bytes.set(tag[3],tag[4]);}});
  for(let i=0;i<values.length;i++)view.setFloat32(pixelOffset+i*4,Number.isFinite(values[i])?values[i]:-9999,true);
  return buffer;
 }
 return {API,COLLECTION,inside,bounds,area,validate,crs,ndvi,classify,colors,summarize,sample,compare,search,load,geotiff};
});

