// The arena is the application's live renderer, also recorded with canvas.captureStream.
// Every texture is captured from this blend's actual input/output; there are no sample screens.
const C=['#a987ff','#47e5cc'];
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,p)=>a+(b-a)*p;
const box=(c,x,y,w,h,r,fill,stroke)=>{c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.stroke();}};
function label(c,t,x,y,size=14,color='#dce7f6',align='left') {c.font=`${size<13?500:600} ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;c.fillStyle=color;c.textAlign=align;c.fillText(t,x,y);}
function rectIn(rect,area){return {x:area.x+rect.x*area.w,y:area.y+rect.y*area.h,w:rect.w*area.w,h:rect.h*area.h};}
function fitted(image,area){if(!image)return area;const scale=Math.min(area.w/image.width,area.h/image.height);return{x:area.x+(area.w-image.width*scale)/2,y:area.y+(area.h-image.height*scale)/2,w:image.width*scale,h:image.height*scale};}
function crop(c,image,rect,dest){if(!image)return;const x=clamp(rect.x),y=clamp(rect.y),w=Math.min(1-x,rect.w),h=Math.min(1-y,rect.h);if(w<=0||h<=0)return;c.drawImage(image,x*image.width,y*image.height,w*image.width,h*image.height,dest.x,dest.y,dest.w,dest.h);}
function mech(c,x,y,t,color,walk=0,carry=false) {
  c.save();c.translate(x,y-Math.abs(Math.sin(t*12))*walk*4);
  c.shadowColor=color;c.shadowBlur=12;
  // Hard-surface helmet, split visor, shoulder plates and magnetic cargo arms.
  c.fillStyle='#182638';c.strokeStyle=color;c.lineWidth=2;
  c.beginPath();c.moveTo(-30,-120);c.lineTo(-19,-142);c.lineTo(20,-142);c.lineTo(31,-120);c.lineTo(25,-91);c.lineTo(-25,-91);c.closePath();c.fill();c.stroke();
  box(c,-24,-122,48,13,2,color);box(c,-17,-119,34,5,0,'#e7fff9');
  c.shadowBlur=0;box(c,-22,-87,44,57,5,'#22374c',color);box(c,-12,-76,24,16,2,color);
  for(const side of [-1,1]){
    box(c,side===-1?-40:27,-89,14,21,2,'#283d53',color);
    const hand=carry? -39:-44+Math.sin(t*7+side)*7;
    c.lineWidth=10;c.strokeStyle='#334c65';c.beginPath();c.moveTo(side*31,-66);c.lineTo(side*43,hand);c.stroke();
    box(c,side*43-6,hand-5,12,13,2,'#d4e8ed',color);
    c.lineWidth=13;c.strokeStyle='#263e52';const stride=Math.sin(t*12+side)*walk*10;c.beginPath();c.moveTo(side*12,-28);c.lineTo(side*17+stride,-4);c.stroke();box(c,side*17+stride-11,-6,25,9,1,'#122133',color);
    c.shadowColor=color;c.shadowBlur=10;c.fillStyle=color;c.fillRect(side*17+stride-7,5,17,2);c.shadowBlur=0;
  }
  label(c,color===C[0]?'01':'02',0,-47,10,'#a6bace','center');c.restore();
}
export function createGameRenderer(canvas){
  const c=canvas.getContext('2d'),images={},W=1600,H=900;
  canvas.width=W;canvas.height=H;
  let state={},start=null,raf,disposed=false,onFrame=null;
  const imageUrls={};
  function update(next){state=next;for(const name of ['source','reference','result']){const url=next.assets?.[name];if(url&&url!==imageUrls[name]){imageUrls[name]=url;const img=new Image();img.onload=()=>{images[name]=img;};img.src=url;}}}
  function restart(){start=performance.now();}
  function draw(now){
    if(disposed)return;
    const t=now/1000,hasResult=!!images.result;
    if(hasResult&&start===null)start=now;
    const p=start===null?0:Math.max(0,(now-start)/1000),done=hasResult&&p>=9;
    c.clearRect(0,0,W,H);c.fillStyle='#080f1b';c.fillRect(0,0,W,H);
    const glow=c.createRadialGradient(800,410,20,800,420,850);glow.addColorStop(0,'#142d40');glow.addColorStop(1,'#080f1b');c.fillStyle=glow;c.fillRect(0,0,W,H);
    c.strokeStyle='#173044';c.lineWidth=.6;
    for(let x=0;x<W;x+=40){c.beginPath();c.moveTo(x,125);c.lineTo(x,H);c.stroke();}
    for(let y=125;y<H;y+=40){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}
    c.fillStyle='#080f1bef';c.fillRect(0,0,W,112);
    label(c,'MISTY',40,47,26,'#effaff');label(c,'/ BLEND ARENA',146,47,18,'#7fa3bd');
    label(c,state.replay?'REAL BLEND / REPLAY':state.phase==='waiting'?'LIVE MODEL REQUEST':'LIVE BLEND / GENERATED RESULT',40,80,12,state.phase==='waiting'?'#f6c97b':'#69ecd4');
    label(c,state.label||'SOURCE + REFERENCE',1550,48,14,'#9cb2ca','right');
    label(c,done?'ASSEMBLY COMPLETE':state.phase==='error'?'BLEND STOPPED':hasResult?'ASSEMBLING RETURNED UI':'WAITING FOR THE BRIDGE',1550,80,12,done?'#69ecd4':'#a8b9d2','right');
    const areas=[{x:75,y:191,w:310,h:520},{x:645,y:171,w:310,h:560},{x:1215,y:191,w:310,h:520}];
    const ia=[fitted(images.source,areas[0]),fitted(images.result,areas[1]),fitted(images.reference,areas[2])];
    for(const [i,x,title,col] of [[0,50,'A / SOURCE CONTENT',C[0]],[1,620,'C / BLENDED INTERFACE','#c9d8ec'],[2,1190,'B / REFERENCE VISUALS',C[1]]]){
      box(c,x,139,i===1?360:360,i===1?626:606,8,'#0d1928','#284058');
      label(c,title,x+18,166,12,col);c.strokeStyle=col;c.lineWidth=2;c.beginPath();c.moveTo(x,139);c.lineTo(x+62,139);c.stroke();
      if(i!==1){const img=i===0?images.source:images.reference;if(img)c.drawImage(img,ia[i].x,ia[i].y,ia[i].w,ia[i].h);else label(c,'CAPTURING INPUT…',x+180,400,12,'#68859d','center');}
    }
    if(images.result){c.drawImage(images.result,ia[1].x,ia[1].y,ia[1].w,ia[1].h);}
    // Fog is masked only after the actual output screenshot exists.
    const regions=state.assets?.sourceRegions?.slice(0,2)||[];
    if(!regions.length)regions.push({label:'Selected UI',rect:{x:.04,y:.12,w:.92,h:.3}});
    const resultRegions=state.assets?.resultRegions||regions;
    const fog=1-ease((p-7.7)/1.1);
    if(!done){
      c.save();c.beginPath();c.rect(areas[1].x,areas[1].y,areas[1].w,areas[1].h);
      if(hasResult)regions.forEach((_,i)=>{if(p>i*3.6+3.25){const r=rectIn(resultRegions[i]?.rect||regions[i].rect,ia[1]);c.rect(r.x+r.w,r.y,-r.w,r.h);}});
      c.clip('evenodd');c.fillStyle=`rgba(10,23,39,${hasResult?fog*.98:.99})`;c.fillRect(areas[1].x,areas[1].y,areas[1].w,areas[1].h);
      c.globalAlpha=(hasResult?fog:1)*.3;
      for(let k=0;k<7;k++){const gy=210+k*77+Math.sin(t*.8+k)*16;const g=c.createRadialGradient(785+Math.sin(t*.6+k)*65,gy,0,790,gy,180);g.addColorStop(0,'#506a92');g.addColorStop(1,'#506a9200');c.fillStyle=g;c.fillRect(645,171,310,560);}
      c.restore();
    }
    if(!hasResult){label(c,state.phase==='error'?'CONNECTION FAILED':'MODEL IS WORKING',800,410,16,'#bcd2e3','center');label(c,'Input fragments preview below',800,441,11,'#7592ad','center');}
    const index=hasResult?Math.min(regions.length-1,Math.floor(p/3.6)):Math.floor(t/4)%regions.length;
    const region=regions[index],local=hasResult?p-index*3.6:(t%4),phase=local;
    let travel=phase<1.2?0:phase<2.4?ease((phase-1.2)/1.2):phase<3.3?1:1-ease((phase-3.3)/.3);
    if(done||p>regions.length*3.6)travel=0;
    const busy=!done&&p<regions.length*3.6;
    for(let role=0;role<2;role++){
      const color=C[role],home=role?1110:490,end=role?1030:570,ax=mix(home,end,travel),ay=664;
      const refRect=state.assets?.referenceIsCrop?{x:0,y:0,w:1,h:1}:{x:.07,y:Math.min(.7,region.rect.y),w:.86,h:Math.min(.32,region.rect.h)};
      const sr=role?refRect:region.rect,area=role?ia[2]:ia[0],source=rectIn(sr,area);
      const dr=rectIn(resultRegions[index]?.rect||region.rect,ia[1]);
      if(busy){
        c.strokeStyle=color;c.lineWidth=2;c.setLineDash([7,5]);c.strokeRect(source.x-3,source.y-3,source.w+6,source.h+6);c.setLineDash([]);
        // Moving cutting laser traces the precise selected screenshot boundary.
        const scan=((phase/.9)%1),perimeter=2*(source.w+source.h);let z=scan*perimeter,sx=source.x,sy=source.y;
        if(z<source.w)sx+=z;else if((z-=source.w)<source.h){sx+=source.w;sy+=z;}else if((z-=source.h)<source.w){sx+=source.w-z;sy+=source.h;}else{z-=source.w;sy+=source.h-z;}
        if(phase<1.2){c.shadowColor=color;c.shadowBlur=14;c.fillStyle='#e9ffff';c.fillRect(sx-4,sy-4,8,8);c.shadowBlur=0;c.strokeStyle=color+'88';c.beginPath();c.moveTo(ax+(role?-35:35),ay-68);c.lineTo(sx,sy);c.stroke();}
      }
      mech(c,ax,ay,t,color,busy&&phase>1.2&&phase<2.4?1:0,busy&&phase>1&&phase<2.7);
      label(c,role?'AGENT 02 / STYLE':'AGENT 01 / CONTENT',home,710,10,color,'center');
      if(busy&&phase>.55&&phase<3.3){
        let w=158,h=Math.max(44,Math.min(100,source.h/source.w*158)),x=ax-w/2,y=ay-80-h/2;
        if(phase<1.2){const q=ease((phase-.55)/.65);w=mix(source.w,w,q);h=mix(source.h,h,q);x=mix(source.x,x,q);y=mix(source.y,y,q)-Math.sin(q*Math.PI)*48;}
        else if(phase>2.4&&hasResult){const q=ease((phase-2.4)/.9);x=mix(x,dr.x,q);y=mix(y,dr.y,q)-Math.sin(q*Math.PI)*72;w=mix(w,dr.w,q);h=mix(h,dr.h,q);}
        c.shadowColor=color;c.shadowBlur=15;box(c,x-3,y-3,w+6,h+6,3,'#0b1525',color);c.shadowBlur=0;crop(c,role?images.reference:images.source,sr,{x,y,w,h});box(c,x+w-23,y-13,25,23,2,color);label(c,role?'B':'A',x+w-10,y+3,12,'#0b1423','center');
        if(hasResult&&phase>2.4){c.strokeStyle=color+'66';c.beginPath();c.moveTo(ax,ay-75);c.lineTo(x+w/2,y+h/2);c.stroke();}
      }
      if(hasResult&&busy&&phase>3.1){c.strokeStyle=color;c.lineWidth=2;c.strokeRect(dr.x-4-role*3,dr.y-4-role*3,dr.w+8+role*6,dr.h+8+role*6);}
    }
    c.fillStyle='#08101def';c.fillRect(0,781,W,119);c.strokeStyle='#244057';c.beginPath();c.moveTo(0,781);c.lineTo(W,781);c.stroke();
    let caption=state.phase==='error'?'Blend stopped — original source is safe.':done?'RESULT SAVED ON THE MISTY CANVAS':!hasResult?'LIVE REQUEST · selected input fragments remain visible':phase<1.2?'CUT / '+region.label:phase<2.4?'TRANSPORT / actual screenshot fragments':phase<3.3?'ASSEMBLE / source content + reference treatment':'LOCK / reveal the returned UI region';
    label(c,caption.slice(0,86),800,819,17,done?'#6ae4ca':'#e0eaf6','center');
    label(c,hasResult?'Returned interface · region transfers illustrate the requested blend roles':'No generated regions have arrived yet.',800,849,11,'#819db7','center');
    ['SELECT','CUT','TRANSPORT','ASSEMBLE','REVEAL'].forEach((s,i)=>{label(c,s,450+i*175,880,10,done||p>i*1.6?'#78dacc':'#3c556f','center');});
    onFrame?.({time:p,done,ready:hasResult});
    raf=requestAnimationFrame(draw);
  }
  raf=requestAnimationFrame(draw);
  return{update,restart,setFrameCallback(fn){onFrame=fn;},dispose(){disposed=true;cancelAnimationFrame(raf);Object.keys(images).forEach(k=>delete images[k]);}};
}
