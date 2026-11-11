/* Browser and Node compatible processing; no external services. */
(function(root){
'use strict';
const classes=[{name:'Мало зелени',short:'Мало',color:'#e54b3f'},{name:'Средне зелени',short:'Средне',color:'#f5c842'},{name:'Много зелени',short:'Много',color:'#24aa6d'},{name:'Без оценки',short:'Нет данных',color:'#88969d'}];
function pointInPolygon(x,y,points){
 let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
function polygonArea(p){return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;}
function validPolygon(p){
 if(!Array.isArray(p)||p.length<3||p.length>100||p.some(a=>!Array.isArray(a)||a.length!==2||a.some(v=>!Number.isFinite(v)||v<0||v>1))||Math.abs(polygonArea(p))<.00001)return false;
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
  if(j===i+1||(i===0&&j===p.length-1))continue;
  const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length];
  if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1])))return false;
 }return true;
}
function analyzeCoverage(data,sw,sh,options={}){
 const {columns=80,greenThreshold=.08,low=.25,high=.6,polygon=[]}=options;
 if(!Number.isInteger(sw)||!Number.isInteger(sh)||sw<1||sh<1||data.length!==sw*sh*4||!Number.isInteger(columns)||columns<2||columns>200||!Number.isFinite(greenThreshold)||greenThreshold<0||greenThreshold>.3||!Number.isFinite(low)||!Number.isFinite(high)||low<=0||low>=high||high>=1||(polygon.length&&!validPolygon(polygon)))throw new Error('Проверьте настройки и границу поля.');
 const scale=Math.min(1,columns/Math.max(sw,sh)),width=Math.max(1,Math.round(sw*scale)),height=Math.max(1,Math.round(sh*scale)),n=width*height;
 const green=new Uint32Array(n),valid=new Uint32Array(n),samples=new Uint32Array(n),inside=new Uint8Array(n),coverage=new Float32Array(n),labels=new Uint8Array(n).fill(3),counts=[0,0,0,0];coverage.fill(NaN);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)inside[y*width+x]=!polygon.length||pointInPolygon((x+.5)/width,(y+.5)/height,polygon)?1:0;
 for(let y=0;y<sh;y++){const gy=Math.min(height-1,Math.floor(y/sh*height));for(let x=0;x<sw;x++){
  const cell=gy*width+Math.min(width-1,Math.floor(x/sw*width));if(!inside[cell])continue;samples[cell]++;
  const i=(y*sw+x)*4,r=data[i],g=data[i+1],b=data[i+2],light=(r+g+b)/3;
  if(data[i+3]<128||light<22||light>242)continue;valid[cell]++;
  if(g>r*1.04&&g>b*1.04&&(2*g-r-b)/(r+g+b)>=greenThreshold)green[cell]++;
 }}
 let targetCount=0,greenTotal=0,validTotal=0;
 for(let i=0;i<n;i++){if(!inside[i])continue;targetCount++;
  if(valid[i]&&valid[i]/samples[i]>=.25){coverage[i]=green[i]/valid[i];labels[i]=coverage[i]<low?0:coverage[i]<high?1:2;greenTotal+=green[i];validTotal+=valid[i];}
  counts[labels[i]]++;
 }
 if(!targetCount)throw new Error('Граница слишком мала для выбранной детальности. Увеличьте область или детальность.');
 const result={width,height,labels,inside,coverage,counts,targetCount,greenThreshold,threshold:greenThreshold,low,high,polygon:polygon.map(p=>[...p]),method:'RGB_green_pixel_coverage',greenFraction:validTotal?greenTotal/validTotal:null};
 Object.assign(result,connectedRegions(result));return result;
}
function connectedRegions(result){
 const {width:w,height:h,labels,inside,coverage}=result,n=w*h,cellRegions=new Int32Array(n),regions=[];
 for(let start=0;start<n;start++){
  if(labels[start]===3||cellRegions[start]||(inside&&!inside[start]))continue;
  const id=regions.length+1,classId=labels[start],cells=[start];cellRegions[start]=id;let sx=0,sy=0,sum=0;
  for(let head=0;head<cells.length;head++){const i=cells[head],x=i%w,y=Math.floor(i/w);sx+=x;sy+=y;sum+=coverage?.[i]??0;
   for(const next of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(next>=0&&!cellRegions[next]&&labels[next]===classId&&(!inside||inside[next])){cellRegions[next]=id;cells.push(next);}
  }
  const cx=sx/cells.length,cy=sy/cells.length;let best=cells[0],distance=Infinity;
  for(const i of cells){const d=(i%w-cx)**2+(Math.floor(i/w)-cy)**2;if(d<distance){best=i;distance=d;}}
  regions.push({id,classId,count:cells.length,coverage:sum/cells.length,anchor:[(best%w+.5)/w,(Math.floor(best/w)+.5)/h],cells});
 }
 for(const region of regions)region.rings=traceRings(region,w,h,cellRegions);
 return {regions,cellRegions};
}
function traceRings(region,w,h,ids){
 const stride=w+1,edges=[],outgoing=new Map();
 function add(ax,ay,bx,by,dir){const from=ay*stride+ax,to=by*stride+bx,e={from,to,dir,used:false};edges.push(e);if(!outgoing.has(from))outgoing.set(from,[]);outgoing.get(from).push(e);}
 for(const i of region.cells){const x=i%w,y=Math.floor(i/w),id=region.id;
  if(y===0||ids[i-w]!==id)add(x,y,x+1,y,0);
  if(x===w-1||ids[i+1]!==id)add(x+1,y,x+1,y+1,1);
  if(y===h-1||ids[i+w]!==id)add(x+1,y+1,x,y+1,2);
  if(x===0||ids[i-1]!==id)add(x,y+1,x,y,3);
 }
 const rings=[];for(const initial of edges){if(initial.used)continue;const points=[];let edge=initial;
  while(edge&&!edge.used){edge.used=true;points.push([edge.from%stride,Math.floor(edge.from/stride)]);if(edge.to===initial.from)break;
   const next=(outgoing.get(edge.to)||[]).filter(e=>!e.used),rank={1:0,0:1,3:2,2:3};next.sort((a,b)=>rank[(a.dir-edge.dir+4)%4]-rank[(b.dir-edge.dir+4)%4]);edge=next[0];
  }
  if(points.length>=4){const simple=points.filter((b,i)=>{const a=points[(i+points.length-1)%points.length],c=points[(i+1)%points.length];return (b[0]-a[0])*(c[1]-b[1])!==(b[1]-a[1])*(c[0]-b[0]);});simple.push([...simple[0]]);rings.push(simple);}
 }return rings;
}
function analyze(data,width,height,threshold=.08){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||data.length!==width*height*4||!Number.isFinite(threshold)||threshold<0||threshold>.3)throw new Error('Некорректные параметры анализа.');
 const labels=new Uint8Array(width*height),scores=new Float32Array(width*height),counts=[0,0,0,0];
 for(let i=0;i<labels.length;i++){
  const r=data[i*4],g=data[i*4+1],b=data[i*4+2],a=data[i*4+3],sum=r+g+b;
  const score=sum?(2*g-r-b)/sum:0;scores[i]=score;
  const light=sum/3;const k=a<128||light<22||light>242?3:score<threshold?0:score<threshold+.16?1:2;
  labels[i]=k;counts[k]++;
 }
 return {labels,scores,counts,width,height,threshold};
}
function validateBounds(b){return b&&['west','east','south','north'].every(k=>Number.isFinite(b[k]))&&b.west>=-180&&b.east<=180&&b.south>=-90&&b.north<=90&&b.west<b.east&&b.south<b.north;}
function areaHa(b){if(!validateBounds(b))return null;return 6371008.8**2*Math.abs((b.east-b.west)*Math.PI/180*(Math.sin(b.north*Math.PI/180)-Math.sin(b.south*Math.PI/180)))/10000;}
function geojson(result,b,meta={}){
 if(!validateBounds(b))throw new Error('Проверьте географические границы.');
 if(result.regions)return regionGeojson(result,b,meta);
 const {width:w,height:h,labels}=result,dx=(b.east-b.west)/w,dy=(b.north-b.south)/h,features=[];
 // Merge adjacent cells of each row without inventing or smoothing zone geometry.
 for(let y=0;y<h;y++)for(let x=0;x<w;){const start=x,k=labels[y*w+x];while(x<w&&labels[y*w+x]===k)x++;if(k===3)continue;
  const west=b.west+start*dx,east=b.west+x*dx,north=b.north-y*dy,south=b.north-(y+1)*dy;
  features.push({type:'Feature',properties:{zone:k+1,label:classes[k].name,color:classes[k].color,cell_count:x-start,method:'ExG_normalized_RGB',threshold:result.threshold,...meta},geometry:{type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]]}});
 }
 return {type:'FeatureCollection',bbox:[b.west,b.south,b.east,b.north],metadata:{...meta,method:'ExG_normalized_RGB',threshold:result.threshold,georeferencing:'manual_bounds_north_up',nodata:0,classes:classes.slice(0,3).map((c,i)=>({value:i+1,...c}))},features};
}
function regionGeojson(result,b,meta){
 const dx=(b.east-b.west)/result.width,dy=(b.north-b.south)/result.height;
 const coordinateRing=ring=>ring.map(([x,y])=>[b.west+x*dx,b.north-y*dy]).reverse();
 const features=result.regions.map(region=>{
  const outer=region.rings.filter(r=>polygonArea(r)>0),holes=region.rings.filter(r=>polygonArea(r)<0);
  const polygons=outer.map(r=>[coordinateRing(r)]);
  for(const hole of holes){const a=hole[0],bb=hole[1],mx=(a[0]+bb[0])/2,my=(a[1]+bb[1])/2;const index=outer.findIndex(r=>pointInPolygon(mx,my,r));if(index>=0)polygons[index].push(coordinateRing(hole));}
  return {type:'Feature',properties:{...meta,zone_id:region.id,class:region.classId+1,label:classes[region.classId].name,color:classes[region.classId].color,cells:region.count,green_percent:Math.round(region.coverage*1000)/10,method:result.method},geometry:polygons.length===1?{type:'Polygon',coordinates:polygons[0]}:{type:'MultiPolygon',coordinates:polygons}};
 });
 return {type:'FeatureCollection',bbox:[b.west,b.south,b.east,b.north],metadata:{...meta,method:result.method,green_threshold:result.greenThreshold,class_breaks:[result.low,result.high],roi_normalized:result.polygon,georeferencing:'manual_bounds_north_up',nodata:0},features};
}
function geotiff(result,b,meta={}){
 if(!validateBounds(b))throw new Error('Проверьте географические границы.');
 const {width:w,height:h,labels}=result;
 const description=Array.from(new TextEncoder().encode(JSON.stringify({method:result.method||'normalized_ExG_RGB',threshold:result.threshold,class_breaks:result.low!==undefined?[result.low,result.high]:undefined,synthetic:!!meta.synthetic,georeferencing:'manual_bounds_north_up',classes:{0:'NoData',1:'low_green',2:'intermediate',3:'strong_green'}})+'\0'));
 const entries=[ [256,4,[w]],[257,4,[h]],[258,3,[8]],[259,3,[1]],[262,3,[1]],[270,2,description],[273,4,[0]],[277,3,[1]],[278,4,[h]],[279,4,[w*h]],[284,3,[1]],[339,3,[1]],
 [33550,12,[(b.east-b.west)/w,(b.north-b.south)/h,0]],[33922,12,[0,0,0,b.west,b.north,0]],
 [34735,3,[1,1,0,3,1024,0,1,2,1025,0,1,1,2048,0,1,4326]],[42113,2,[48,0]] ];
 const sizes={2:1,3:2,4:4,12:8};let offset=8+2+entries.length*12+4;
 const places=entries.map(([,type,v])=>{if(v.length*sizes[type]<=4)return null;offset=Math.ceil(offset/8)*8;const pos=offset;offset+=v.length*sizes[type];return pos;});
 const pixels=Math.ceil(offset/8)*8;entries.find(e=>e[0]===273)[2][0]=pixels;
 const buffer=new ArrayBuffer(pixels+w*h),view=new DataView(buffer);view.setUint16(0,0x4949,true);view.setUint16(2,42,true);view.setUint32(4,8,true);view.setUint16(8,entries.length,true);
 entries.forEach(([tag,type,values],i)=>{const pos=10+i*12;view.setUint16(pos,tag,true);view.setUint16(pos+2,type,true);view.setUint32(pos+4,values.length,true);const start=places[i]??pos+8;if(places[i]!==null)view.setUint32(pos+8,start,true);values.forEach((v,j)=>{const at=start+j*sizes[type];if(type===2)view.setUint8(at,v);else if(type===3)view.setUint16(at,v,true);else if(type===4)view.setUint32(at,v,true);else view.setFloat64(at,v,true);});});
 const dest=new Uint8Array(buffer,pixels);for(let i=0;i<labels.length;i++)dest[i]=labels[i]===3?0:labels[i]+1;return buffer;
}
const api={classes,analyze,analyzeCoverage,connectedRegions,pointInPolygon,validPolygon,polygonArea,validateBounds,areaHa,geojson,geotiff};root.FieldAnalysis=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

