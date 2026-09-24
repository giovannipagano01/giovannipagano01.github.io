export const KEY = 'tempera-web-state-v2';
export const domains = ['lettura','preghiera','matematica','logica','memoria','scacchi','respirazione','meditazione'];
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const positive = n => Number.isFinite(Number(n)) ? Math.max(0,Number(n)) : 0;
export function loadState() {
  const saved = read(KEY);
  const old = read('tempera-web-state-v1') || {};
  const base = {version:2,onboarded:!!old.onboarded,theme:'system',goal:old.personalGoal || 'Ritrovare attenzione',minutes:3,
    favorites:(old.tracks || domains).filter(x=>domains.includes(x)),apps:old.apps || ['instagram'],
    startDate:old.startDate || null,history:[],bookmarks:{},readingIndex:positive(old.readingChapter),
    books:(old.books || []).map(b=>({id:b.id,title:b.title,pages:Array.isArray(b.pages)?b.pages.length:positive(b.pages)})),
    activeBookId:old.activeBookId || null,baseline:{completed:positive(old.completed),stats:old.trackStats || {}},
    timo:{life:Number.isFinite(Number(old.timoEnergy))?Math.min(100,Math.max(0,Number(old.timoEnergy))):100,attempts:0,socialMinutes:0,events:[]},
    nextRecommendation:null,nextRecommendationReason:'',lastRecommendation:null,accessGrant:null,daily:{},analyticsVersion:0,migrated:!!read('tempera-web-state-v1')};
  if (old.activeBookId) base.bookmarks[old.activeBookId] = positive(old.bookPage);
  const state = saved?.version===2 ? {...base,...saved} : base;
  state.history = Array.isArray(state.history) ? state.history : [];
  state.favorites = Array.isArray(state.favorites) ? state.favorites.filter(x=>domains.includes(x)) : domains;
  if (!state.favorites.length) state.favorites = ['lettura'];
  state.books = Array.isArray(state.books) ? state.books : [];
  state.apps = Array.isArray(state.apps) ? state.apps.filter(x=>['instagram','linkedin','youtube','tiktok'].includes(x)) : ['instagram'];
  state.bookmarks = state.bookmarks && typeof state.bookmarks==='object' ? state.bookmarks : {};
  state.baseline = state.baseline && typeof state.baseline==='object' ? state.baseline : {completed:0,stats:{}};
  state.baseline.completed = positive(state.baseline.completed);
  state.timo = state.timo && typeof state.timo==='object' ? state.timo : {life:100,attempts:0,socialMinutes:0,events:[]};
  state.timo.life = Math.min(100,positive(state.timo.life));
  state.timo.attempts = positive(state.timo.attempts);
  state.timo.socialMinutes = positive(state.timo.socialMinutes);
  state.timo.events = Array.isArray(state.timo.events) ? state.timo.events.slice(-100) : [];
  state.nextRecommendation = domains.includes(state.nextRecommendation) ? state.nextRecommendation : null;
  state.nextRecommendationReason = typeof state.nextRecommendationReason==='string' ? state.nextRecommendationReason : '';
  state.accessGrant = state.accessGrant && typeof state.accessGrant==='object' ? state.accessGrant : null;
  state.daily = state.daily && typeof state.daily==='object' ? state.daily : {};
  if(state.analyticsVersion!==1){
    const row=at=>{const key=dayKey(new Date(at));return state.daily[key]||(state.daily[key]={sessions:0,practiceSeconds:0,directCompleted:0,accessAttempts:0,socialMinutes:0,timoDelta:0,correct:0,answers:0,resistanceTotal:0,resistanceSessions:0,grantsUsed:0,domains:{}});};
    state.history.forEach(s=>{const d=row(s.at);d.sessions++;d.practiceSeconds+=positive(s.seconds);d.directCompleted+=s.trigger?1:0;d.timoDelta+=positive(s.timoGain);d.correct+=positive(s.correct);d.answers+=positive(s.attempts);if(s.resistanceLevel){d.resistanceTotal+=positive(s.resistanceLevel);d.resistanceSessions++;}d.domains[s.domain]=(d.domains[s.domain]||0)+1;});
    state.timo.events.filter(e=>e.type==='access'||e.type==='social').forEach(e=>{const d=row(e.at);if(e.type==='access')d.accessAttempts++;if(e.type==='social')d.socialMinutes+=positive(e.minutes);d.timoDelta+=Number(e.delta)||0;});
    state.analyticsVersion=1;
  }
  state.minutes = [1,3,5].includes(state.minutes) ? state.minutes : 3;
  return state;
}
export function saveState(state) {
  try {localStorage.setItem(KEY,JSON.stringify(state));return true;} catch {return false;}
}
export function loadSession() {const s=read('tempera-active-session-v2');return s && domains.includes(s.domain) && s.id ? s : null;}
export function saveSession(s) {try {s ? localStorage.setItem('tempera-active-session-v2',JSON.stringify(s)) : localStorage.removeItem('tempera-active-session-v2');return true;}catch{return false;}}
export async function bookStore(action, value) {
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open('tempera-books',1);
    open.onupgradeneeded=()=>{if(!open.result.objectStoreNames.contains('books')) open.result.createObjectStore('books',{keyPath:'id'});};
    open.onerror=()=>reject(new Error('La biblioteca non è disponibile in questo browser.'));
    open.onsuccess=()=>{const db=open.result;const tx=db.transaction('books',action==='get'?'readonly':'readwrite');const request=tx.objectStore('books')[action](value);let result;
      request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(new Error('Non è stato possibile salvare il libro.'));};};
  });
}
