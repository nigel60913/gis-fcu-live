const PALETTE=['#073B5C','#226E86','#54B9DF','#6E8431','#91AD1E','#B49336','#7A3030'];

export function tallyWords(values){
  const counts=new Map();
  values.forEach(raw=>{
    const text=String(raw??'').trim().replace(/\s+/g,' ').slice(0,24);
    if(!text)return;
    const key=text.toLocaleLowerCase('zh-Hant');
    const item=counts.get(key)||{text,count:0};
    item.count+=1;
    counts.set(key,item);
  });
  return [...counts.values()].sort((a,b)=>b.count-a.count||a.text.localeCompare(b.text,'zh-Hant'));
}

// Deterministic placement keeps words stable, while measuring the real canvas
// size prevents clipping or overflow on different projector resolutions.
export function renderWordCloud(canvas,words){
  const rect=canvas.getBoundingClientRect();
  const width=Math.max(320,Math.floor(rect.width));
  const height=Math.max(240,Math.floor(rect.height));
  const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  canvas.style.width='100%';
  canvas.style.height='100%';
  canvas.width=Math.round(width*dpr);
  canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(!words.length)return;

  const shown=words.slice(0,60);
  const max=shown[0].count,min=shown.at(-1).count;
  const minFont=Math.max(16,Math.min(width,height)*.026);
  const maxFont=Math.min(142,width*.145,height*.22);
  const placed=[];

  shown.forEach((word,index)=>{
    const normalized=max===min?1:(word.count-min)/(max-min);
    let font=Math.round(minFont+(maxFont-minFont)*Math.pow(normalized,.58));
    let box=null;
    while(font>=minFont&&!box){
      const weight=index<5?800:650;
      ctx.font=`${weight} ${font}px 'Noto Sans TC',Inter,sans-serif`;
      const metrics=ctx.measureText(word.text);
      const pad=Math.max(5,font*.075);
      const measuredHeight=(metrics.actualBoundingBoxAscent||font*.78)+(metrics.actualBoundingBoxDescent||font*.22);
      const w=metrics.width+pad*2;
      const h=measuredHeight+pad*2;
      if(w>width*.92||h>height*.82){font-=2;continue;}
      const start=(hash(word.text)%360)*Math.PI/180;
      for(let step=0;step<6000;step++){
        const angle=start+step*.205;
        const radius=2.08*Math.sqrt(step);
        const x=width/2+Math.cos(angle)*radius*1.08-w/2;
        const y=height/2+Math.sin(angle)*radius*.74-h/2;
        const candidate={x,y,w,h};
        if(x<8||y<8||x+w>width-8||y+h>height-8)continue;
        if(!insideCloudMask(candidate,width,height))continue;
        if(!placed.some(other=>overlaps(candidate,other))){box=candidate;break;}
      }
      if(!box)font-=2;
    }
    if(!box)return;
    placed.push(box);
    ctx.font=`${index<5?800:650} ${font}px 'Noto Sans TC',Inter,sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=PALETTE[(hash(word.text)+index)%PALETTE.length];
    ctx.globalAlpha=.96;
    ctx.fillText(word.text,box.x+box.w/2,box.y+box.h/2);
  });
  ctx.globalAlpha=1;
}

function insideCloudMask(box,width,height){
  const points=[
    [box.x,box.y],[box.x+box.w,box.y],[box.x,box.y+box.h],[box.x+box.w,box.y+box.h],
    [box.x+box.w/2,box.y+box.h/2]
  ];
  return points.every(([cx,cy])=>{
    const nx=(cx-width/2)/(width*.49),ny=(cy-height/2)/(height*.47);
    return nx*nx+ny*ny<=1;
  });
}
function overlaps(a,b){const gap=4;return a.x<aRight(b)+gap&&aRight(a)+gap>b.x&&a.y<aBottom(b)+gap&&aBottom(a)+gap>b.y}
const aRight=box=>box.x+box.w,aBottom=box=>box.y+box.h;
function hash(text){let value=2166136261;for(const char of text){value^=char.codePointAt(0);value=Math.imul(value,16777619)}return value>>>0}
