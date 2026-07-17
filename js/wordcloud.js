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
  const rect=canvas.getBoundingClientRect(),width=Math.max(320,rect.width),height=Math.max(260,rect.height),dpr=devicePixelRatio||1;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  if(!words.length)return;
  const max=words[0].count,min=words.at(-1).count,maxFont=Math.min(132,width*.14,height*.25),minFont=Math.max(18,Math.min(width,height)*.032),placed=[];
  words.slice(0,80).forEach((word,index)=>{
    const frequency=max===min?Math.max(.18,1-index/Math.max(words.length,2)):(word.count-min)/(max-min);
    let font=Math.round(minFont+(maxFont-minFont)*Math.pow(frequency,.62));
    let box=null;
    while(font>=minFont&&!box){
      ctx.font=`${index<4?800:650} ${font}px Inter,'Noto Sans TC',sans-serif`;
      const textWidth=ctx.measureText(word.text).width,pad=Math.max(5,font*.09),w=textWidth+pad*2,h=font*1.08+pad*2;
      const seed=hash(word.text),start=(seed%360)*Math.PI/180;
      for(let step=0;step<4200;step+=1){
        const angle=start+step*.19,radius=2.35*Math.sqrt(step),x=width/2+Math.cos(angle)*radius*1.28-w/2,y=height/2+Math.sin(angle)*radius*.82-h/2;
        const candidate={x,y,w,h};
        if(x<4||y<4||x+w>width-4||y+h>height-4)continue;
        if(!placed.some(other=>overlaps(candidate,other))){box=candidate;break}
      }
      if(!box)font-=2;
    }
    if(!box)return;
    placed.push(box);ctx.font=`${index<4?800:650} ${font}px Inter,'Noto Sans TC',sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=PALETTE[(hash(word.text)+index)%PALETTE.length];ctx.globalAlpha=Math.min(1,.72+frequency*.28);ctx.fillText(word.text,box.x+box.w/2,box.y+box.h/2);
  });
  ctx.globalAlpha=1;
}

function overlaps(a,b){const gap=3;return a.x<aRight(b)+gap&&aRight(a)+gap>b.x&&a.y<aBottom(b)+gap&&aBottom(a)+gap>b.y}
const aRight=box=>box.x+box.w,aBottom=box=>box.y+box.h;
function hash(text){let value=2166136261;for(const char of text){value^=char.codePointAt(0);value=Math.imul(value,16777619)}return value>>>0}
