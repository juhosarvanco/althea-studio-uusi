import {svg} from '../vendor/studio-ui/components.mjs';
import {anchorElement,anchorFor,anchorKey,elementLabel} from './annotations.js';
export function createInlineComposer({getPicker,getComment,save,onDraft}){
 const chrome=document.createElement('div');chrome.className='studio-inline-composer';chrome.dataset.studioChrome='';chrome.hidden=true;chrome.setAttribute('role','form');chrome.setAttribute('aria-label','Kommentti valittuun kohtaan');
 chrome.innerHTML=`<span class="studio-composer-pin" aria-hidden="true">+</span><div class="studio-composer-body"><button type="button" class="studio-composer-scope" aria-label="Vaihda kommentin kohdetasoa" aria-expanded="false"><span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></button><div class="studio-composer-levels" role="group" aria-label="Kommentin kohdetaso" hidden></div><div class="studio-composer-input"><textarea rows="1" maxlength="2000" aria-label="Kommenttisi valittuun kohtaan" placeholder="Lisää kommentti…"></textarea><button type="button" class="studio-composer-save" aria-label="Tallenna kommentti"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16V4m-5 5 5-5 5 5"/></svg></button><button type="button" class="studio-composer-close" aria-label="Sulje kommenttikenttä">${svg('close')}</button></div></div><p class="studio-composer-error" role="alert" hidden></p>`;
 document.body.append(chrome);
 const input=chrome.querySelector('textarea'),scope=chrome.querySelector('.studio-composer-scope'),levels=chrome.querySelector('.studio-composer-levels'),drafts=new Map();
 let selected=null,id=null,position={x:1,y:0},original='';
 function changed(){const hasDraft=[...drafts.values()].some(value=>value.trim());onDraft(hasDraft?input.value.trim()||'Keskeneräinen kommentti':'');}
 function remember(){if(selected){if(input.value!==original)drafts.set(anchorKey(selected),input.value);else drafts.delete(anchorKey(selected));changed();}}
 function redraw(){
  if(chrome.hidden||!selected)return;const el=anchorElement(selected);if(!el){close();return;}const rect=el.getBoundingClientRect();
  const leftLimit=innerWidth<=720||document.body.classList.contains('studio-sidebar-collapsed')?12:Math.min(334,innerWidth-30);
  const width=Math.min(500,innerWidth-leftLimit-14);chrome.style.width=`${Math.max(220,width)}px`;
  const x=rect.left+rect.width*position.x,y=rect.top+rect.height*position.y;
  chrome.style.left=`${Math.max(leftLimit,Math.min(innerWidth-width-12,x-12))}px`;chrome.style.top=`${Math.max(document.querySelector('.studio-bar').getBoundingClientRect().bottom+8,Math.min(innerHeight-chrome.offsetHeight-12,y+15))}px`;
 }
 function scopeUI(){const picker=getPicker(),el=anchorElement(selected);scope.querySelector('span').textContent=el?elementLabel(el).split(' · ')[0]:'Kohde';levels.replaceChildren();levels.hidden=true;scope.setAttribute('aria-expanded','false');
  for(const item of [...picker.levels()].reverse()){
   const button=document.createElement('button');button.type='button';button.textContent=elementLabel(item).split(' · ')[0];button.title=elementLabel(item);button.setAttribute('aria-pressed',String(item===el));button.onclick=()=>{remember();picker.choose(anchorFor(item));open(anchorFor(item));};levels.append(button);
  }
 }
 function open(anchor,options={}){remember();selected=anchor;id=options.id||null;const comment=id?getComment(id):null;const rect=anchorElement(anchor)?.getBoundingClientRect();position=comment?.position||options.position||{x:1,y:0};
  original=comment?.body||'';input.value=comment?.body??drafts.get(anchorKey(anchor))??'';chrome.querySelector('.studio-composer-error').hidden=true;chrome.querySelector('.studio-composer-pin').textContent=options.number||'+';chrome.hidden=false;scopeUI();resize();redraw();input.focus({preventScroll:true});
 }
 function close(){remember();chrome.hidden=true;levels.hidden=true;}
 function resize(){input.style.height='auto';input.style.height=`${Math.min(130,Math.max(27,input.scrollHeight))}px`;redraw();}
 input.oninput=()=>{remember();resize();};scope.onclick=()=>{levels.hidden=!levels.hidden;scope.setAttribute('aria-expanded',String(!levels.hidden));redraw();};
 async function submit(){if(!selected||!input.value.trim())return;const button=chrome.querySelector('.studio-composer-save');button.disabled=true;
  try{await save({anchor:selected,body:input.value,id,position});drafts.delete(anchorKey(selected));input.value='';changed();chrome.hidden=true;}
  catch(error){chrome.querySelector('.studio-composer-error').textContent=error.message;chrome.querySelector('.studio-composer-error').hidden=false;}
  finally{button.disabled=false;}
 }
 chrome.querySelector('.studio-composer-save').onclick=submit;chrome.querySelector('.studio-composer-close').onclick=close;
 input.onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();submit();}if(event.key==='Escape'){event.stopPropagation();close();}};
 window.addEventListener('scroll',redraw,{capture:true,passive:true});window.addEventListener('resize',redraw);
 return {open,close,refresh:redraw,get hasDraft(){return [...drafts.values()].some(value=>value.trim());}};
}
