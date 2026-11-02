export const KEY='nobody-life-os-v4';
export const LEGACY='nobody-life-os-v1';
export const uid=()=>globalThis.crypto.randomUUID();
export const clone=x=>JSON.parse(JSON.stringify(x));
export function day(d=new Date()){return `${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function plus(s,n){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return day(d)}
export function monday(s=day()){const d=new Date(s+'T12:00:00');return plus(s,-(d.getDay()+6)%7)}
export const minutes=(a,b)=>(new Date(b)-new Date(a))/60000;
export const defaults=()=>({version:4,activities:[['reading','📖','阅读','学习',30,4],['guitar','🎸','吉他','学习',30,2],['movie','🎬','电影','影音',120,2],['drama','📺','韩剧','影音',60,2],['fitness','💪','晨练','运动',30,3],['tennis','🎾','网球','运动',90,3],['class','📚','兼职上课','工作',90,0],['trip','🧳','旅行','生活',120,0],['other','✨','其他','其他',30,0]].map(([id,icon,name,category,duration,target])=>({id,icon,name,category,duration,target,metric:'count',unit:'次',color:'#9784de',status:'active',include:true,goalHistory:[]})),events:[],records:[],works:[],weeks:{},reviews:{},changes:[],prefs:{theme:'dark',sleep:'01:30',wake:'08:30',availableStart:'18:00',availableEnd:'23:00',home:['goals','days','pool','review']}});
export function migrate(raw){
 if(!raw||typeof raw!=='object')throw Error('备份不是有效对象');
 if(raw.version===4){validate(raw);return clone(raw)}
 if(!Array.isArray(raw.logs)||!Array.isArray(raw.events))throw Error('不支持的备份格式，未更改现有数据');
 const s=defaults();s.legacy=clone(raw);s.migratedAt=new Date().toISOString();
 const types=new Set([...raw.logs,...raw.events,...(raw.collection||[])].map(x=>x.type).filter(Boolean));
 for(const id of types)if(!s.activities.some(a=>a.id===id))s.activities.push({...s.activities.at(-1),id,name:String(id),goalHistory:[]});
 for(const a of s.activities)if(Number.isFinite(raw.targets?.[a.id]))a.target=raw.targets[a.id];
 s.events=raw.events.map(e=>({id:String(e.id||uid()),activityId:e.type||'other',title:String(e.title||'活动'),start:`${e.date}T${e.start||'00:00'}`,end:`${e.endDate||e.date}T${e.end||'23:59'}`,note:String(e.note||''),status:'planned',quantity:1}));
 s.records=raw.logs.map(l=>({id:String(l.id||uid()),activityId:l.type||'other',date:l.date,duration:null,quantity:1,note:'旧版打卡迁移；未记录实际时长',createdAt:l.createdAt||'',legacy:true}));
 s.works=(raw.collection||[]).map(w=>({...w,id:String(w.id||uid()),activityId:w.type||'other',rating:w.rating||0}));
 s.prefs={...s.prefs,...raw.prefs};
 const keys=new Set([...s.records.map(r=>monday(r.date)),...s.events.map(e=>monday(e.start.slice(0,10)))]);for(const k of keys)s.weeks[k]=snapshot(s);
 validate(s);return s;
}
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&day(new Date(s+'T12:00:00'))===s;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function validate(s){
 if(s.version!==4||!['activities','events','records','works','changes'].every(k=>Array.isArray(s[k]))||!s.weeks||!s.prefs||!s.reviews)throw Error('V4 备份结构不完整');
 const ids=new Set();for(const a of s.activities){if(typeof a.id!=='string'||ids.has(a.id)||typeof a.name!=='string'||!a.name||typeof a.icon!=='string'||typeof a.category!=='string'||!['active','paused','archived'].includes(a.status)||!['count','minutes','quantity','none'].includes(a.metric)||!positive(a.duration)||!positive(a.target)||!Array.isArray(a.goalHistory))throw Error('活动配置无效');ids.add(a.id)}
 for(const key of ['events','records','works']){const seen=new Set();for(const x of s[key]){if(typeof x.id!=='string'||seen.has(x.id)||!ids.has(x.activityId))throw Error('记录 ID 重复或关联活动缺失');seen.add(x.id)}}
 for(const e of s.events)if(typeof e.title!=='string'||!validDate(e.start?.slice(0,10))||!validDate(e.end?.slice(0,10))||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(e.start)||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(e.end)||!Number.isFinite(minutes(e.start,e.end))||minutes(e.start,e.end)<=0||!['planned','skipped','cancelled'].includes(e.status)||!positive(e.quantity))throw Error('日程时间或状态无效');
 for(const r of s.records)if(!validDate(r.date)||!(r.duration===null||positive(r.duration))||!positive(r.quantity)||r.eventId&&!s.events.some(e=>e.id===r.eventId))throw Error('完成记录无效');
 const linked=s.records.filter(r=>r.eventId).map(r=>r.eventId);if(new Set(linked).size!==linked.length)throw Error('同一日程存在重复完成记录');
 for(const w of s.works)if(typeof w.title!=='string'||!['todo','doing','done'].includes(w.status)||!Number.isInteger(w.rating)||w.rating<0||w.rating>5)throw Error('作品数据无效');
 for(const r of s.records)if(r.workId&&!s.works.some(w=>w.id===r.workId&&w.activityId===r.activityId))throw Error('作品关联无效');
 for(const [week,gs] of Object.entries(s.weeks)){if(!validDate(week)||!gs||typeof gs!=='object'||Array.isArray(gs))throw Error('周目标快照无效');for(const [id,g]of Object.entries(gs))if(!ids.has(id)||!g||!positive(g.target)||!['count','minutes','quantity','none'].includes(g.metric))throw Error('周目标数据无效')}
 if(!['dark','light','system'].includes(s.prefs.theme)||!Array.isArray(s.prefs.home)||s.prefs.home.some(k=>!['goals','days','pool','review'].includes(k))||s.prefs.hidden&&!Array.isArray(s.prefs.hidden)||typeof s.reviews!=='object'||Array.isArray(s.reviews))throw Error('偏好或复盘数据无效');
 if(s.pool&&(!Array.isArray(s.pool)||s.pool.some(x=>typeof x.id!=='string'||!ids.has(x.activityId)||!validDate(x.week)||typeof x.title!=='string')))throw Error('待安排事项无效');
 for(const a of s.activities)for(const g of a.goalHistory)if(!g||!validDate(g.week)||!positive(g.target)||!['count','minutes','quantity','none'].includes(g.metric))throw Error('活动目标历史无效');
 for(const c of s.changes)if(!c||typeof c.label!=='string'||typeof c.at!=='string'||!Number.isFinite(Date.parse(c.at)))throw Error('变更历史无效');
 if(s.pool&&new Set(s.pool.map(x=>x.id)).size!==s.pool.length)throw Error('待安排事项 ID 重复');
 return true;
}
export function snapshot(s){return Object.fromEntries(s.activities.filter(a=>a.status==='active'&&a.target>0&&a.metric!=='none').map(a=>[a.id,{target:a.target,metric:a.metric,unit:a.unit}]))}
export function goals(s,w){if(s.weeks[w])return s.weeks[w];return Object.fromEntries(s.activities.filter(a=>!a.createdWeek||a.createdWeek<=w).map(a=>{const h=[...(a.goalHistory||[])].reverse().filter(x=>x.week<=w).sort((x,y)=>y.week.localeCompare(x.week))[0]||a;return[a.id,{target:h.target,metric:h.metric,unit:h.unit,status:h.status||a.status}]}).filter(([,g])=>g.status==='active'&&g.target>0&&g.metric!=='none'))}
export function ensureWeek(s,w){if(!s.weeks[w])s.weeks[w]=goals(s,w)}
export function progress(s,w,id){const g=goals(s,w)[id];if(!g)return{done:0,planned:0,left:0,target:0};const until=plus(w,6),rs=s.records.filter(r=>r.activityId===id&&r.date>=w&&r.date<=until),es=s.events.filter(e=>e.activityId===id&&e.status==='planned'&&e.end.slice(0,10)>=w&&e.end.slice(0,10)<=until&&!s.records.some(r=>r.eventId===e.id));const val=(x,event=false)=>g.metric==='minutes'?(event?minutes(x.start,x.end):x.duration||0):g.metric==='quantity'?x.quantity:1;const done=rs.reduce((n,r)=>n+val(r),0),planned=es.reduce((n,e)=>n+val(e,true),0);return{...g,done,planned,left:Math.max(0,g.target-done-planned)}}
export function conflicts(s,event){return s.events.filter(e=>e.id!==event.id&&e.status==='planned'&&event.start<e.end&&event.end>e.start)}
export function occurrences(event,repeat='none',until=''){const result=[event];if(repeat==='none')return result;const step=repeat==='daily'?1:7;if(!validDate(until)||until<event.start.slice(0,10))throw Error('请选择有效的重复截止日期');const span=minutes(event.start,event.end),seriesId=uid();event.seriesId=seriesId;let d=plus(event.start.slice(0,10),step);while(d<=until){if(result.length>=366)throw Error('一次最多生成 366 次，请缩短重复范围');const start=d+event.start.slice(10),end=localStamp(new Date(new Date(start).getTime()+span*60000));result.push({...event,id:uid(),start,end,seriesId});d=plus(d,step)}return result}
export function localStamp(d){return day(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
export function complete(s,eventId,record){if(eventId&&s.records.some(r=>r.eventId===eventId))throw Error('该日程已完成，请编辑或撤销记录');if(eventId&&!s.events.some(e=>e.id===eventId&&e.status==='planned'))throw Error('日程不可完成');const r={id:uid(),...record,...(eventId?{eventId}:{}),createdAt:new Date().toISOString()};s.records.push(r);return r}
export function seriesEdit(s,id,patch,all){const base=s.events.find(e=>e.id===id);if(!base)throw Error('找不到日程');const delta=new Date(patch.start)-new Date(base.start),length=minutes(patch.start,patch.end);for(const e of s.events.filter(e=>e.id===id||all&&base.seriesId&&e.seriesId===base.seriesId)){if(e.id===id)Object.assign(e,patch);else{const start=localStamp(new Date(new Date(e.start).getTime()+delta));Object.assign(e,{activityId:patch.activityId,title:patch.title,note:patch.note,quantity:patch.quantity,start,end:localStamp(new Date(new Date(start).getTime()+length*60000))})}}}
export function copyWeek(s,w){const prev=plus(w,-7),existing=new Set(s.events.map(e=>e.copySource));const added=s.events.filter(e=>e.start.slice(0,10)>=prev&&e.start.slice(0,10)<w&&e.status!=='cancelled'&&!existing.has(`${e.id}:${w}`)).map(e=>({...e,id:uid(),start:plus(e.start.slice(0,10),7)+e.start.slice(10),end:plus(e.end.slice(0,10),7)+e.end.slice(10),status:'planned',seriesId:undefined,copySource:`${e.id}:${w}`}));s.events.push(...added);return added.length}
export function summary(s,from,to){const records=s.records.filter(r=>r.date>=from&&r.date<=to&&s.activities.find(a=>a.id===r.activityId)?.include!==false);return{records,count:records.length,duration:records.reduce((n,r)=>n+(r.duration||0),0),unknown:records.filter(r=>r.duration===null).length,days:new Set(records.map(r=>r.date)).size}}
export function persist(storage,s){validate(s);storage.setItem(KEY,JSON.stringify(s))}
export function boot(storage){const raw=storage.getItem(KEY);if(raw){const s=JSON.parse(raw);validate(s);return s}const legacy=storage.getItem(LEGACY);if(legacy){storage.setItem('nobody-life-os-backup-before-v4',legacy);const s=migrate(JSON.parse(legacy));persist(storage,s);return s}const s=defaults();persist(storage,s);return s}
export function freeSlots(s,date){const start=date+'T'+(s.prefs.availableStart||'18:00'),end=date+'T'+(s.prefs.availableEnd||'23:00');if(end<=start)return[];const intervals=s.events.filter(e=>e.status==='planned'&&e.start<end&&e.end>start).map(e=>({start:e.start<start?start:e.start,end:e.end>end?end:e.end})).sort((a,b)=>a.start.localeCompare(b.start));let cursor=start,result=[];for(const e of intervals){if(minutes(cursor,e.start)>=30)result.push({start:cursor,end:e.start});if(e.end>cursor)cursor=e.end}if(minutes(cursor,end)>=30)result.push({start:cursor,end});return result}
