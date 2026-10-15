import { config } from './config.js';
const $ = id => document.getElementById(id);
const MINUTE = 60000;
const parseTime = s => { const [h,m]=s.split(':').map(Number); return h*60+m; };
const pad = n => String(n).padStart(2,'0');
const formatTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const formatRemain = ms => {const sec=Math.max(0,Math.ceil(ms/1000));return {minutes:Math.floor(sec/60),seconds:sec%60};};
const prettyDuration = minutes => `${Math.floor(minutes/60)?`${Math.floor(minutes/60)}時間`:''}${minutes%60?`${minutes%60}分`:''}` || '0分';

// 対象は同一日内の予定。重複がある場合は警告し、タイムラインで重ね描きはしない。
function normalizeSchedules(items){
 const result=items.map(item=>({...item,startMin:parseTime(item.start),endMin:parseTime(item.end)})).sort((a,b)=>a.startMin-b.startMin);
 for(let i=0;i<result.length;i++){
   const e=result[i];if(!Number.isFinite(e.startMin)||!Number.isFinite(e.endMin)||e.startMin>=e.endMin||e.endMin>1440)throw Error(`予定の時刻が不正: ${e.title}`);
   if(i>0&&result[i-1].endMin>e.startMin)throw Error(`予定が重複しています: ${result[i-1].title} / ${e.title}`);
 }
 return result;
}
const schedules=normalizeSchedules(config.schedules);
const segments=[];
function addGap(startMin,endMin){
 const gap=endMin-startMin;if(gap<=0)return;
 const compressed=gap>=config.timeline.compressionThresholdMinutes;
 segments.push({type:'gap',startMin,endMin,duration:gap,visual:compressed?config.timeline.compressedGapDisplayMinutes:gap,compressed});
}
if(schedules.length)addGap(0,schedules[0].startMin);
for(let i=0;i<schedules.length;i++){
 const event=schedules[i];if(i>0)addGap(schedules[i-1].endMin,event.startMin);
 segments.push({type:'event',startMin:event.startMin,endMin:event.endMin,duration:event.endMin-event.startMin,visual:event.endMin-event.startMin,event});
}
if(schedules.length)addGap(schedules[schedules.length-1].endMin,1440);
const dateFmt = new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric'});

function findActive(min){return schedules.find(e=>e.startMin<=min&&min<e.endMin)}
function findNext(min){return schedules.find(e=>min<e.startMin)}
function getDisplayState(now){
 const min=now.getHours()*60+now.getMinutes()+now.getSeconds()/60+now.getMilliseconds()/60000;
 const active=findActive(min),next=findNext(min);
 if(active){return {kind:'active',active,next,remaining:(active.endMin-min)*MINUTE};}
 return {kind:'idle',active:null,next,remaining:next?(next.startMin-min)*MINUTE:null};
}
function renderTimeline(now,state){
 const container=$('timeline');container.replaceChildren();
 if(!segments.length){container.innerHTML='<div class="segment gap" style="flex:1"><div class="segment-start">—</div><div class="segment-name">本日の予定はありません</div></div>';return;}
 const currentMin=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
 for(const seg of segments){
   const node=document.createElement('div');node.className=`segment ${seg.type}`;node.style.flex=`${seg.visual} 1 0px`;
   // より短い予定ではラベルが省略されるが、開始・終了は title 属性で確認可能
   const start=document.createElement('div');start.className='segment-start';start.textContent=`${pad(Math.floor(seg.startMin/60))}:${pad(seg.startMin%60)}`;
   const label=document.createElement('div');label.className='segment-name';
   if(seg.type==='event'){
      node.style.setProperty('--segment-color',seg.event.color||'#59788f');node.title=`${seg.event.title} (${seg.event.start}–${seg.event.end})`;
      label.textContent=seg.event.title;
      if(currentMin>=seg.endMin)node.classList.add('past');
      if(state.active?.id===seg.event.id)node.classList.add('active');
   }else{
      label.textContent=`${seg.compressed?'··· ':''}${prettyDuration(seg.duration)} 空き`;
      node.title=`空き時間 ${prettyDuration(seg.duration)}（${seg.compressed?'圧縮表示':'通常表示'}）`;
   }
   node.append(start,label);
   if(currentMin>=seg.startMin && currentMin<seg.endMin){
     const line=document.createElement('div');line.className='now-line';line.style.left=`${((currentMin-seg.startMin)/seg.duration)*100}%`;node.append(line);
   }
   container.append(node);
 }
}
function render(){
 const now=new Date();const state=getDisplayState(now);
 $('date').textContent=dateFmt.format(now).toUpperCase();$('mini-clock').textContent=formatTime(now);
 $('event-count').textContent=` · ${schedules.length} EVENTS`;
 $('headline').classList.toggle('is-clock',state.kind==='idle');
 $('value').classList.toggle('clock-value',state.kind==='idle');
 $('hero-progress').classList.toggle('hidden',state.kind==='idle');
 if(state.kind==='active'){
   $('status').textContent='● IN PROGRESS';$('headline').textContent=state.active.title;
   const rem=formatRemain(state.remaining);
   $('value').replaceChildren(document.createTextNode(`${rem.minutes}`));
   const unit=document.createElement('span');unit.className='unit';unit.textContent=`分 ${pad(rem.seconds)}秒`; $('value').append(unit);
   $('detail').textContent=`${state.active.start} — ${state.active.end}  /  次の予定：${state.next?`${state.next.title} ${state.next.start}`:'なし'}`;
   const duration=(state.active.endMin-state.active.startMin)*MINUTE;
   $('progress-fill').style.width=`${Math.min(100,Math.max(0,(1-state.remaining/duration)*100))}%`;
 }else{
   $('status').textContent=state.next?'◷ FREE TIME':'✧ FREE TIME';
   $('headline').textContent=state.next?'次の予定まで':'本日の予定は終了';
   $('value').textContent=`${formatTime(now)}`;
   $('detail').textContent=state.next?`${state.next.title} · ${state.next.start}開始まで ${prettyDuration(Math.max(1,Math.ceil(state.remaining/MINUTE)))}`:(schedules.length?'本日のスケジュールはすべて終了しました':'本日の予定はありません');
 }
 $('timeline-caption').textContent=state.kind==='active'?'NOW · 作業中':state.next?'NEXT · '+state.next.start:'NO UPCOMING EVENTS';
 renderTimeline(now,state);
}
function ambientCanvas(){
 const canvas=$('ambient'),ctx=canvas.getContext('2d');if(!ctx)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let width=0,height=0,raf=0,t=0;
 const dots=Array.from({length:config.animation.particleCount},()=>({x:Math.random(),y:Math.random(),r:0.5+Math.random()*1.25,phase:Math.random()*6.28,speed:0.3+Math.random()}));
 function resize(){const dpr=Math.min(devicePixelRatio||1,2);width=canvas.clientWidth;height=canvas.clientHeight;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
 addEventListener('resize',resize);resize();
 function draw(){ctx.clearRect(0,0,width,height);t+=0.012*config.animation.speed;
  for(const dot of dots){const x=(dot.x+Math.sin(t*dot.speed+dot.phase)*.03)*width,y=(dot.y+Math.cos(t*dot.speed+dot.phase)*.035)*height;ctx.beginPath();ctx.arc(x,y,dot.r,0,Math.PI*2);ctx.fillStyle=`rgba(128,218,213,${config.animation.opacity*(.4+.5*Math.sin(t+dot.phase)**2)})`;ctx.fill()}
  if(!reduced)raf=requestAnimationFrame(draw);
 }
 draw();document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAnimationFrame(raf);else if(!reduced)draw()});
}
function fullScreen(){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.().catch(console.warn)}
$('fullscreen').addEventListener('click',fullScreen);document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='f'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&e.target.tagName!=='INPUT')fullScreen()});
$('brand-title').textContent=config.brand.name;$('brand-logo').src=config.brand.logo;
$('display').style.setProperty('--accent',config.theme.accent);$('display').style.setProperty('--background',config.theme.background);
render();setInterval(render,1000);ambientCanvas();
