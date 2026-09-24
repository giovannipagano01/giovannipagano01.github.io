/* Domande di verifica generate dal testo appena letto.
   Funzionano con qualsiasi libro (PDF, EPUB, TXT) e non richiedono servizi esterni:
   ogni domanda nasce da frasi e parole realmente presenti nelle pagine lette, quindi la risposta giusta è certa. */

const stop=new Set(('alla alle allo agli dalla dalle dallo dagli della delle dello degli nella nelle nello negli sulla sulle sullo sugli '+
 'questa questo queste questi quella quello quelle quelli quale quali come dove quando perché perche mentre allora ancora sempre anche '+
 'molto molta molti molte poco tutto tutta tutti tutte altro altra altri altre essere avere stato stata stati state sono siamo siete erano '+
 'aveva avevo avevano avrei avrebbe sarebbe fosse fossero dopo prima sopra sotto dentro fuori senza verso contro circa quasi proprio '+
 'niente nulla qualche ciascuno ognuno nessuno nessuna cosa cose però pero quindi inoltre invece infatti oppure neppure nemmeno tuttavia '+
 'loro nostro nostra vostro vostra mio mia tuo tua suo sua miei tuoi suoi mie tue sue dunque tanto tanta tanti tante così cosi quanto quanta quanti quante secondo davanti dietro insieme subito appena finché ciascuna ognuna perciò infine benché sebbene affinché oltre tranne presso nessun').split(' '));
const noise=/www\.|\.org|\.it\b|e-?book|liber ?liber|cei 2008|preghiamo|isbn|copyright|http|diritti d/i;
const clean=t=>String(t||'').replace(/­/g,'').replace(/(^|[\s(«"“])\d{1,3}(?=[A-Za-zÀ-ÿ«“"])/g,'$1').replace(/([a-zà-ù])\s?-\s+([a-zà-ù])/g,'$1$2').replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,' ').replace(/\s{2,}/g,' ').trim();
const shuffle=list=>list.map(v=>[Math.random(),v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
const cut=(t,n=110)=>t.length>n?t.slice(0,t.lastIndexOf(' ',n)).replace(/[,;:]$/,'')+'…':t;
export function sentencesOf(text){
  return [...new Set(clean(text).split(/(?<=[.!?…»”])\s+(?=[«“"—–-]?\s?(?:\d{1,3}\s?)?[A-ZÀ-Ý])/).map(s=>s.trim().replace(/^\d{1,3}\s?/,'').replace(/^[—–-]\s*/,'')).filter(s=>s.length>=45&&s.length<=240&&s.split(' ').length>=7&&!noise.test(s)&&/[a-zà-ù]{3}/.test(s)&&!/\.{4,}/.test(s)&&!/\s\d{1,4}\s+[a-zà-ù]/.test(s)))];
}
const wordsOf=s=>s.match(/[A-Za-zÀ-ÿ’']+/g)||[];
const keyWords=s=>wordsOf(s).map(w=>w.replace(/^[lLdDnNsSuU]’|^[lLdDnNsSuU]'/,'')).filter(w=>w.length>=6&&!stop.has(w.toLowerCase())&&!/’|'/.test(w));
const shape=w=>({cap:/^[A-ZÀ-Ý]/.test(w),end:w.slice(-2).toLowerCase(),len:w.length});
function distractors(word,pool,n=3){const s=shape(word),lower=word.toLowerCase();const cands=[...new Set(pool)].filter(w=>w.toLowerCase()!==lower&&!lower.startsWith(w.toLowerCase().slice(0,5))&&!w.toLowerCase().startsWith(lower.slice(0,5)));
  const score=w=>{const t=shape(w);return (t.cap===s.cap?4:0)+(t.end===s.end?3:0)+(w.slice(-1)===word.slice(-1)?1:0)-Math.abs(t.len-s.len)*.4+Math.random();};
  return cands.map(w=>[score(w),w]).sort((a,b)=>b[0]-a[0]).slice(0,n).map(x=>x[1]);}
const names=text=>{const found=new Map(),all=clean(text);for(const s of sentencesOf(text)){const toks=s.split(/\s+/);toks.forEach((t,i)=>{const w=t.replace(/[^A-Za-zÀ-ÿ]/g,'');if(i===0||/[.!?«"“:;—–-]$/.test(toks[i-1])||/^[«"“]/.test(t))return;if(/^[A-ZÀ-Ý][a-zà-ÿ]{2,}$/.test(w)&&!stop.has(w.toLowerCase())&&!new RegExp('(^|[^A-Za-zÀ-ÿ])'+w.toLowerCase()+'([^A-Za-zÀ-ÿ]|$)').test(all))found.set(w,(found.get(w)||0)+1);});}return found;};
const opt=(correct,wrongs)=>{const choices=shuffle([correct,...wrongs]);return {choices,answer:choices.indexOf(correct)};};

export function makeReadingQuiz(readText,otherText='',amount=3){
  const sents=sentencesOf(readText);if(sents.length<2)return [];
  const pool=keyWords(clean(readText)+' '+clean(otherText)),out=[],used=new Set();
  const makers={
    cloze(){for(const s of shuffle(sents)){if(used.has(s))continue;const keys=keyWords(s).filter(w=>clean(readText).split(w).length<=3);const w=keys.sort((a,b)=>b.length-a.length)[0];if(!w)continue;const d=distractors(w,pool.filter(x=>!s.includes(x)));if(d.length<3)continue;used.add(s);
      return {q:`Completa la frase che hai letto: «${s.replace(w,'_____')}»`,...opt(w,d),variant:'Completa la frase',explain:`Il testo diceva: «${s}»`};}},
    which(){for(const s of shuffle(sents)){if(used.has(s)||s.length>170)continue;const keys=keyWords(s);if(keys.length<2)continue;const fakes=[];for(const k of shuffle(keys)){const d=distractors(k,pool.filter(x=>!s.includes(x)),1)[0];if(d){const f=s.replace(k,d);if(!fakes.includes(f)&&f!==s)fakes.push(f);}if(fakes.length===2)break;}if(fakes.length<2)continue;used.add(s);
      return {q:'Quale di queste frasi compare esattamente nelle pagine lette?',...opt(s,fakes),variant:'Riconosci la frase',explain:'Le altre avevano una parola cambiata.'};}},
    who(){const inText=names(readText),otherMap=names(otherText),other=[...otherMap.keys()].filter(n=>otherMap.get(n)>=1&&!clean(readText).includes(n));const cands=[...inText.keys()].filter(n=>inText.get(n)>=1);if(!cands.length||other.length<2)return null;const n=shuffle(cands)[0];
      return {q:'Quale di questi nomi compare nelle pagine che hai appena letto?',...opt(n,shuffle(other).slice(0,3)),variant:'Chi compare?',explain:`«${n}» compare nel passo che hai letto.`};},
    order(){const avail=sents.filter(s=>!used.has(s));if(avail.length<3)return null;const i=Math.floor(Math.random()*(avail.length-2)),j=i+1+Math.floor(Math.random()*(avail.length-i-1));const a=avail[i],b=avail[j];if(cut(a)===cut(b))return null;used.add(a);used.add(b);
      return {q:'Quale di questi due passaggi viene prima nel testo?',...opt(cut(a),[cut(b)]),variant:'Che cosa viene prima?',explain:'Nel testo l’ordine è questo: prima «'+cut(a,70)+'», poi «'+cut(b,70)+'».'};}
  };
  const order=shuffle(['cloze','cloze','which','who','order']);
  for(const kind of [...order,...order,'cloze','which','cloze']){if(out.length>=amount)break;const q=makers[kind]();if(q&&!out.some(x=>x.q===q.q))out.push(q);}
  return out.map((q,i)=>({...q,id:'quiz-'+i}));
}
