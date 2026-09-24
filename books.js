const chunk = text => {
  const paragraphs=text.replace(/\r/g,'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);const pages=[];let page='';
  for(const paragraph of paragraphs){const words=paragraph.split(/\s+/);for(const word of words){if(page.length+word.length>1500){pages.push(page.trim());page='';}page+=word+' ';}page+='\n\n';}
  if(page.trim())pages.push(page.trim());return pages;
};
const xml = text => {const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('Il file EPUB contiene dati non leggibili.');return doc;};
const thumb = async (source, width=360, type='image/jpeg') => {
  try {
    const img = source instanceof HTMLCanvasElement ? source : await createImageBitmap(source);
    const w = Math.min(width, img.width), h = Math.round(img.height * w / img.width);
    if (!w || !h || h > w * 4) return '';
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL(type, .8);
  } catch { return ''; }
};

/* ---------- PDF ----------
   Il PDF viene conservato intero: il lettore mostra la pagina originale (impaginazione, indice, dedica, illustrazioni).
   Il testo viene estratto solo quando serve, per la modalità “testo adattato”. */
export async function openPdf(buffer){
  const pdfjs=await import('./vendor/pdf.min.mjs?v=32');pdfjs.GlobalWorkerOptions.workerSrc=new URL('vendor/pdf.worker.min.mjs',document.baseURI).href;
  return pdfjs.getDocument({data:new Uint8Array(buffer.slice(0))}).promise;
}
async function pdfOutline(pdf){
  const out=[];let outline=null;try{outline=await pdf.getOutline();}catch{}
  async function walk(items,level){for(const item of items||[]){if(out.length>400)return;try{let dest=item.dest;if(typeof dest==='string')dest=await pdf.getDestination(dest);if(Array.isArray(dest)&&dest[0]){const page=typeof dest[0]==='number'?dest[0]:await pdf.getPageIndex(dest[0]);out.push({title:String(item.title||'').trim(),page,level});}}catch{}if(level<2)await walk(item.items,level+1);}}
  await walk(outline,0);return out.filter(x=>x.title);
}
const headingRe=/^(capitolo|parte|libro|dedica|prefazione|introduzione|premessa|prologo|epilogo|postfazione|appendice|chapter|part|prologue|epilogue)\b[^\n]{0,60}$/i;
async function detectToc(pdf){
  if(pdf.numPages>700)return [];const out=[];
  for(let i=0;i<pdf.numPages;i++){try{const first=(await pdfPageText(pdf,i)).split('\n')[0].trim();if(headingRe.test(first))out.push({title:first,page:i,level:0});}catch{}}
  return out;
}
export async function pdfPageText(pdf,index){
  const t=await (await pdf.getPage(index+1)).getTextContent();let lines=[],line='';
  for(const item of t.items){line+=item.str;if(item.hasEOL){lines.push(line);line='';}}if(line)lines.push(line);
  lines=lines.map(l=>l.replace(/\s+/g,' ').trim());
  // Alcuni PDF (es. Liber Liber) contengono il testo due volte: tieni una sola copia.
  const half=lines.length/2;if(lines.length>1&&Number.isInteger(half)&&lines.slice(0,half).join('|')===lines.slice(half).join('|'))lines=lines.slice(0,half);
  lines=lines.filter((l,i)=>!(i===lines.length-1&&/^\d{1,4}$/.test(l)));// numero di pagina finale
  const width=[...lines].map(l=>l.length).sort((a,b)=>a-b)[Math.floor(lines.length*.8)]||60;let text='';
  lines.forEach((l,i)=>{if(!l){text+='\n\n';return;}const hyph=/[a-zàèéìòù]-$/.test(l);text+=hyph?l.slice(0,-1):l;const short=l.length<width*.72,end=/[.!?:;»”"')]$/.test(l),next=lines[i+1]||'';text+=hyph?'':(short&&(end||!next||/^[A-ZÀ-Ý«"—–-]/.test(next))?'\n\n':' ');});
  return text.replace(/\n{3,}/g,'\n\n').trim();
}
export async function importPdfData(buffer,fallbackTitle='Libro'){
  const pdf=await openPdf(buffer);let title=fallbackTitle,author='',cover='',toc=[];
  try{
    try{const info=(await pdf.getMetadata())?.info||{};if(info.Title&&info.Title.trim().length>2&&!/untitled|microsoft|\.docx?$/i.test(info.Title))title=info.Title.trim();author=(info.Author||'').trim();}catch{}
    try{const first=await pdf.getPage(1),base=first.getViewport({scale:1}),vp=first.getViewport({scale:360/base.width}),canvas=document.createElement('canvas');canvas.width=Math.round(vp.width);canvas.height=Math.round(vp.height);await first.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;cover=await thumb(canvas);}catch{}
    toc=await pdfOutline(pdf);if(!toc.length)toc=await detectToc(pdf);
    return {title,author,cover,kind:'pdf',file:buffer,pageCount:pdf.numPages,pages:Array(pdf.numPages).fill(''),toc};
  }finally{await pdf.destroy();}
}

/* ---------- EPUB ----------
   Conserva la struttura del libro: titoli, paragrafi, allineamenti, corsivi e illustrazioni. */
const BLOCK=new Set(['P','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','UL','OL','LI','HR','FIGURE','FIGCAPTION','PRE','TABLE','DL']);
const INLINE={EM:'em',I:'em',CITE:'em',STRONG:'strong',B:'strong',SUP:'sup',SUB:'sub',SMALL:'small',U:'u',S:'s',BR:'br'};
function cssHints(cssTexts){const map={};for(const css of cssTexts){for(const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)){const decl=m[2].toLowerCase(),hint={};if(/text-align\s*:\s*center/.test(decl))hint.align='c';if(/text-align\s*:\s*right/.test(decl))hint.align='r';if(/font-style\s*:\s*italic/.test(decl))hint.em=true;if(/font-weight\s*:\s*(bold|[6-9]00)/.test(decl))hint.strong=true;if(/font-variant\s*:\s*small-caps/.test(decl))hint.sc=true;if(/page-break-before\s*:\s*always|break-before\s*:\s*page/.test(decl))hint.brk=true;if(!Object.keys(hint).length)continue;for(const sel of m[1].split(',')){const cls=sel.trim().match(/\.([\w-]+)\s*$/);if(cls)map[cls[1]]={...map[cls[1]],...hint};}}}return map;}
export async function importBook(file) {
  if(file.size>40*1024*1024)throw new Error('Scegli un file più piccolo di 40 MB.');
  const title0=file.name.replace(/\.[^.]+$/,'');
  if(/\.pdf$/i.test(file.name))return {id:crypto.randomUUID(),...await importPdfData(await file.arrayBuffer(),title0)};
  if(/\.txt$/i.test(file.name)){const pages=chunk(await file.text());if(!pages.length)throw new Error('Il file di testo è vuoto.');return {id:crypto.randomUUID(),title:title0,author:'',cover:'',kind:'text',pages};}
  if(!/\.epub$/i.test(file.name))throw new Error('Sono supportati PDF, EPUB e TXT.');
  if(!globalThis.JSZip) await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('vendor/jszip.min.js',document.baseURI).href;script.onload=resolve;script.onerror=()=>reject(new Error('Lettore EPUB non disponibile. Riprova quando sei online.'));document.head.append(script);});
  const zip=await JSZip.loadAsync(file);let expanded=0;
  const pathOf=(href,base)=>{const url=new URL(href,new URL(base,'https://book.local/'));return url.origin==='https://book.local'?decodeURIComponent(url.pathname.slice(1)):null;};
  async function get(name){const f=zip.file(name);if(!f)throw new Error('EPUB incompleto: manca un capitolo.');const value=await f.async('string');expanded+=value.length;if(expanded>25000000)throw new Error('Il contenuto del libro è troppo grande.');return value;}
  const container=xml(await get('META-INF/container.xml'));const root=container.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');if(!root)throw new Error('Indice EPUB non trovato.');
  const opf=xml(await get(root));const title=opf.getElementsByTagNameNS('*','title')[0]?.textContent?.trim() || title0,author=opf.getElementsByTagNameNS('*','creator')[0]?.textContent?.trim()||'';
  const items=[...opf.getElementsByTagName('item')],byId=new Map(items.map(x=>[x.id,x])),isImg=i=>/^image\//.test(i.getAttribute('media-type')||'');
  let cover='';try{const metaId=[...opf.getElementsByTagName('meta')].find(m=>m.getAttribute('name')==='cover')?.getAttribute('content'),item=items.find(i=>(i.getAttribute('properties')||'').includes('cover-image'))||items.find(i=>i.id===metaId&&isImg(i))||items.find(i=>isImg(i)&&/cover/i.test(i.id+' '+i.getAttribute('href')));
    if(item){const f=zip.file(pathOf(item.getAttribute('href'),root));if(f)cover=await thumb(new Blob([await f.async('arraybuffer')],{type:item.getAttribute('media-type')}));}}catch{}
  const hints=cssHints(await Promise.all(items.filter(i=>/css/.test(i.getAttribute('media-type')||'')).map(i=>{const f=zip.file(pathOf(i.getAttribute('href'),root));return f?f.async('string'):'';})));
  const images=[],imageIndex=new Map(),out=document.implementation.createHTMLDocument('');
  async function image(src,chapterPath){const path=pathOf(src,chapterPath);if(!path)return null;if(imageIndex.has(path))return imageIndex.get(path);const f=zip.file(path);if(!f||images.length>=150)return null;const ext=path.split('.').pop().toLowerCase(),type={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml'}[ext]||'image/jpeg';
    const blob=new Blob([await f.async('arraybuffer')],{type});const data=type==='image/svg+xml'?await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(blob);}):await thumb(blob,900,type==='image/png'?'image/png':'image/jpeg');if(!data)return null;images.push(data);imageIndex.set(path,images.length-1);return images.length-1;}
  const hintOf=el=>{const h={};for(const c of el.classList||[])Object.assign(h,hints[c]||{});const st=(el.getAttribute?.('style')||'').toLowerCase();if(/text-align\s*:\s*center/.test(st))h.align='c';if(/text-align\s*:\s*right/.test(st))h.align='r';if(/font-style\s*:\s*italic/.test(st))h.em=true;if(/font-weight\s*:\s*(bold|[6-9]00)/.test(st))h.strong=true;if(el.getAttribute?.('align')==='center')h.align='c';return h;};
  async function inline(node,target,chapterPath){for(const child of [...node.childNodes]){if(child.nodeType===3){target.append(out.createTextNode(child.textContent));continue;}if(child.nodeType!==1)continue;const tag=child.tagName.toUpperCase();
    if(tag==='IMG'||tag==='IMAGE'){const n=await image(child.getAttribute('src')||child.getAttribute('xlink:href')||child.getAttribute('href')||'',chapterPath);if(n!==null){const img=out.createElement('img');img.dataset.img=n;img.alt=child.getAttribute('alt')||'';target.append(img);}continue;}
    if(tag==='SCRIPT'||tag==='STYLE')continue;
    const h=hintOf(child);let el=INLINE[tag]?out.createElement(INLINE[tag]):null;if(tag==='BR'){target.append(el);continue;}
    if(!el&&(h.em||h.strong||h.sc)){el=out.createElement(h.em?'em':h.strong?'strong':'span');if(h.sc)el.className='sc';}
    if(el){await inline(child,el,chapterPath);target.append(el);}else await inline(child,target,chapterPath);}}
  async function blocks(node,chapterPath,list){for(const child of [...node.childNodes]){if(child.nodeType===3){if(child.textContent.trim()){const p=out.createElement('p');p.textContent=child.textContent;list.push(p);}continue;}if(child.nodeType!==1)continue;const tag=child.tagName.toUpperCase();if(['SCRIPT','STYLE','NAV','HEAD'].includes(tag))continue;
    const hasBlock=[...child.children].some(c=>BLOCK.has(c.tagName.toUpperCase())||['DIV','SECTION','ARTICLE','ASIDE','HEADER','FOOTER','MAIN'].includes(c.tagName.toUpperCase()));
    if(['DIV','SECTION','ARTICLE','ASIDE','HEADER','FOOTER','MAIN','BODY'].includes(tag)&&hasBlock){await blocks(child,chapterPath,list);continue;}
    if(['UL','OL'].includes(tag)){const el=out.createElement(tag.toLowerCase());for(const li of child.querySelectorAll(':scope > li')){const x=out.createElement('li');await inline(li,x,chapterPath);el.append(x);}list.push(el);continue;}
    if(tag==='HR'){list.push(out.createElement('hr'));continue;}
    const name=/^H[1-6]$/.test(tag)?tag.toLowerCase():tag==='BLOCKQUOTE'?'blockquote':tag==='FIGCAPTION'?'figcaption':tag==='PRE'?'pre':'p',el=out.createElement(name),h=hintOf(child);if(h.align)el.classList.add(h.align);if(h.em)el.classList.add('it');if(h.strong)el.classList.add('bd');if(h.sc)el.classList.add('sc');
    await inline(child,el,chapterPath);if(!el.textContent.trim()&&!el.querySelector('img'))continue;if(el.querySelector('img')&&!el.textContent.trim())el.classList.add('fig');list.push(el);}}
  const pages=[],html=[],toc=[];
  for(const ref of opf.getElementsByTagName('itemref')){const item=byId.get(ref.getAttribute('idref'));if(!item)continue;const path=pathOf(item.getAttribute('href'),root);if(!path||!/html|xml/.test(item.getAttribute('media-type')||'html'))continue;
    const doc=new DOMParser().parseFromString(await get(path),'text/html'),list=[];await blocks(doc.body,path,list);if(!list.length)continue;
    const heading=list.find(b=>/^h[1-3]$/i.test(b.tagName));if(heading)toc.push({title:heading.textContent.trim().slice(0,80),page:pages.length,level:0});
    let buf=[],len=0;const flush=()=>{if(!buf.length)return;const wrap=out.createElement('div');buf.forEach(b=>wrap.append(b));html.push(wrap.innerHTML);pages.push(wrap.textContent.replace(/\s+\n/g,'\n').trim());buf=[];len=0;};
    for(const b of list){const size=b.textContent.length+(b.querySelector('img')?600:0);if(len&&len+size>1700)flush();buf.push(b);len+=size;}flush();}
  if(!pages.length)throw new Error('Non trovo testo leggibile in questo EPUB.');
  return {id:crypto.randomUUID(),title,author,cover,kind:'epub',pages,html,images,toc};
}
