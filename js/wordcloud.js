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

// Deterministic spiral placement keeps existing words stable when new votes arrive.
export function renderWordCloud(canvas,words){
  const rect=canvas.getBoundingClientRect(),width=Math.max(320,rect.width),height=Math.max(260,rect.height),dpr=Math.max(1,window.devicePixelRatio||1);
  canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(dpr,0,0,dpr,0,0);
  if(!words.length)return;
  const shown=words.slice(0,80),max=shown[0].count,min=shown.at(-1).count,maxFont=Math.min(160,width*.17,height*.25),minFont=Math.max(18,Math.min(width,height)*.03),placed=[];
  shown.forEach((word,index)=>{
    const normalized=max===min?1:(word.count-min)/(max-min);let font=Math.round(minFont+(maxFont-minFont)*Math.pow(normalized,.55)),box=null;
    while(font>=minFont&&!box){
      ctx.font=`${index<5?800:650} ${font}px 'Noto Sans TC',Inter,sans-serif`;const metrics=ctx.measureText(word.text),pad=Math.max(4,font*.06),w=metrics.width+pad*2,h=font*1.05+pad*2,start=(hash(word.text)%360)*Math.PI/180;
      for(let step=0;step<5200;step++){const angle=start+step*.21,radius=2.15*Math.sqrt(step),x=width/2+Math.cos(angle)*radius*1.08-w/2,y=height/2+Math.sin(angle)*radius*.76-h/2,candidate={x,y,w,h};if(x<4||y<4||x+w>width-4||y+h>height-4)continue;if(!insideCloudMask(candidate,width,height))continue;if(!placed.some(other=>overlaps(candidate,other))){box=candidate;break}}
      if(!box)font-=2;
    }
    if(!box)return;placed.push(box);ctx.font=`${index<5?800:650} ${font}px 'Noto Sans TC',Inter,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=PALETTE[(hash(word.text)+index)%PALETTE.length];ctx.globalAlpha=.96;ctx.fillText(word.text,box.x+box.w/2,box.y+box.h/2);
  });ctx.globalAlpha=1;
}
function insideCloudMask(box,width,height){const cx=box.x+box.w/2,cy=box.y+box.h/2,nx=(cx-width/2)/(width*.46),ny=(cy-height/2)/(height*.42);return nx*nx+ny*ny<=1}

function overlaps(a,b){const gap=3;return a.x<aRight(b)+gap&&aRight(a)+gap>b.x&&a.y<aBottom(b)+gap&&aBottom(a)+gap>b.y}
const aRight=box=>box.x+box.w,aBottom=box=>box.y+box.h;
function hash(text){let value=2166136261;for(const char of text){value^=char.codePointAt(0);value=Math.imul(value,16777619)}return value>>>0}
