const fs = require('fs'); const path = require('path');
let broadcast = () => {};
function setBroadcast(fn) { broadcast = fn; }
const root = process.env.DATA_DIR || path.join(__dirname, 'data');
const maxCandles = Math.max(1000, Number(process.env.MAX_CANDLES_PER_INSTRUMENT || 50000));
const intervals = (process.env.CANDLE_INTERVALS || '1,3,5,15').split(',').map(Number).filter(n => [1,3,5,15,30,60].includes(n));
const store = new Map(); // key -> interval -> candle array
const currentVolume = new Map();
function keyOf(t) { return `${t.exchangeSegment}:${t.securityId}`; }
function intervalMap(key) { if (!store.has(key)) store.set(key, new Map()); return store.get(key); }
function bucket(ts, mins) { const size = mins * 60000; return Math.floor(ts / size) * size; }
function addTick(tick) {
  const price = Number(tick.ltp); if (!Number.isFinite(price) || price <= 0) return;
  const key = keyOf(tick), ts = Number(tick.receivedAt || Date.now());
  const vol = Number(tick.volume); const previousVol = currentVolume.get(key); let deltaVol = 0;
  if (Number.isFinite(vol)) { if (previousVol !== undefined && vol >= previousVol) deltaVol = vol - previousVol; currentVolume.set(key, vol); }
  for (const mins of intervals) {
    const arrs = intervalMap(key); if (!arrs.has(mins)) arrs.set(mins, []); const arr = arrs.get(mins); const start = bucket(ts, mins); let c = arr[arr.length - 1];
    if (!c || c.time !== start) { c = { time:start, timeISO:new Date(start).toISOString(), open:price, high:price, low:price, close:price, volume:deltaVol, tickCount:1, complete:false, source:'live_ticks' }; arr.push(c); while(arr.length>maxCandles)arr.shift(); }
    else { c.high=Math.max(c.high,price); c.low=Math.min(c.low,price); c.close=price; c.volume+=deltaVol; c.tickCount++; }
    c.close=price; c.updatedAt=ts;
    broadcast('candle', { securityId:String(tick.securityId), exchangeSegment:tick.exchangeSegment, interval:mins, candle:{...c} });
  }
}
function seedFromMarketOHLC(tick) {
  if (![tick.open,tick.high,tick.low,tick.close].every(v=>Number.isFinite(Number(v))&&Number(v)>0)) return;
  const key=keyOf(tick), now=Number(tick.receivedAt||Date.now());
  for(const mins of intervals){const arrs=intervalMap(key);if(!arrs.has(mins))arrs.set(mins,[]);const arr=arrs.get(mins);if(arr.length)continue;const start=bucket(now,mins);arr.push({time:start,timeISO:new Date(start).toISOString(),open:Number(tick.open),high:Number(tick.high),low:Number(tick.low),close:Number(tick.close),volume:Number(tick.volume)||0,tickCount:0,complete:false,source:'dhan_market_ohlc_seed'});}
}
function getCandles({securityId,exchangeSegment,interval=1,from,to,limit=1000}={}) {
  const id=String(securityId||''); const matches=[...store.entries()].filter(([k])=>(!id||k.endsWith(':'+id))&&(!exchangeSegment||k.startsWith(exchangeSegment+':')));
  let data=[]; for(const [key,byInterval] of matches){const arr=byInterval.get(Number(interval))||[];data.push(...arr.map(c=>({...c,securityId:key.split(':').slice(1).join(':'),exchangeSegment:key.split(':')[0]})));}
  if(from){const f=Number.isNaN(Number(from))?new Date(from).getTime():Number(from);data=data.filter(c=>c.time>=f)} if(to){const t=Number.isNaN(Number(to))?new Date(to).getTime():Number(to);data=data.filter(c=>c.time<=t)}
  data.sort((a,b)=>a.time-b.time); return data.slice(-Math.min(10000,Math.max(1,Number(limit)||1000)));
}
function exportData(){const out={version:1,savedAt:Date.now(),instruments:{}};for(const [key,m]of store){out.instruments[key]={};for(const [i,a]of m)out.instruments[key][i]=a.slice(-maxCandles);}return out;}
function load(){try{fs.mkdirSync(root,{recursive:true});const p=path.join(root,'candles.json');if(!fs.existsSync(p))return;const data=JSON.parse(fs.readFileSync(p,'utf8'));for(const [key,by]of Object.entries(data.instruments||{})){const m=intervalMap(key);for(const [i,a]of Object.entries(by||{}))if(Array.isArray(a))m.set(Number(i),a.slice(-maxCandles));}}catch(e){console.error('[candles] restore failed:',e.message)}}
let saveTimer=null;function persist(){try{fs.mkdirSync(root,{recursive:true});const tmp=path.join(root,'candles.tmp.json');fs.writeFileSync(tmp,JSON.stringify(exportData()));fs.renameSync(tmp,path.join(root,'candles.json'));}catch(e){console.error('[candles] persist failed:',e.message)}}
function schedulePersist(){if(saveTimer)return;saveTimer=setTimeout(()=>{saveTimer=null;persist()},Math.max(1000,Number(process.env.HISTORY_FLUSH_MS||5000)));}
function onTick(tick){addTick(tick);schedulePersist();}
load();
module.exports={onTick,getCandles,persist,setBroadcast,intervals,stats:()=>({intervals, instruments:store.size, retainedCandles:[...store.values()].reduce((s,m)=>s+[...m.values()].reduce((a,x)=>a+x.length,0),0),storagePath:root})};
