export const escapeHtml=(value)=>{const node=document.createElement('div');node.textContent=value??'';return node.innerHTML};
export const getClientId=()=>{let id=localStorage.getItem('gisfcu_client_id');if(!id){id=`c_${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}`.slice(0,64);localStorage.setItem('gisfcu_client_id',id)}return id};
export const getNickname=()=>localStorage.getItem('gisfcu_nickname')||'';
export const setNickname=(name)=>localStorage.setItem('gisfcu_nickname',name.trim().slice(0,12));
export const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export const formatType=(type)=>({wordcloud:'文字雲',open:'開放文字',single:'單選題',multi:'複選題',quiz:'選擇題',ranking:'排序題',emoji:'Emoji 投票',rating:'1–5 評分',slider:'滑桿',yesno:'是／否'})[type]||type;
export const typeIcon=(type)=>({wordcloud:'☁',open:'Aa',single:'◉',multi:'☑',quiz:'✦',ranking:'↕',emoji:'😊',rating:'★',slider:'↔',yesno:'✓'})[type]||'◇';
export const brandText=(value)=>String(value??'').replaceAll('全員互動','ESG × MM').replaceAll('GIS.FCU Live','ESG × MM');
