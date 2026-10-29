// Storage-independent Studio components. Adapters own authentication and mutations.
export const UI_VERSION='0.1.0';
export const node=(tag,value='',className='')=>{const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;};
export const icons={edit:'<path d="m12 4 4 4M3 17l4-1L17 6a2.8 2.8 0 0 0-4-4L3 12Z"/>',images:'<rect x="2" y="3" width="16" height="14" rx="2"/><path d="m3 14 5-5 4 4 3-3 3 3"/><circle cx="14" cy="7" r="1"/>',ai:'<path d="m10 2 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"/>',arrow:'<path d="M4 16 16 4M4 4h12v12"/>',close:'<path d="m5 5 10 10M5 15 15 5"/>',chevron:'<path d="m12 5-5 5 5 5"/>'};
export function svg(name){return `<svg viewBox="0 0 20 20" aria-hidden="true">${icons[name]||''}</svg>`;}
export function formatDate(at,{compact=false}={}){return at?new Intl.DateTimeFormat('fi-FI',{dateStyle:'short',timeStyle:'short'}).format(new Date(at)).replace(compact?' klo ':'\0',' '):'Alkuperäinen teksti';}
export function plainHTML(value){const doc=new DOMParser().parseFromString(value||'','text/html');doc.querySelectorAll('br').forEach(el=>el.replaceWith('\n'));return doc.body.textContent;}
export function bindInspector({toggle,content,key,draw=()=>{},initial=false}){
 let collapsed=initial;try{const saved=localStorage.getItem(key);if(saved!==null)collapsed=saved==='true';}catch{}
 const render=()=>{content.inert=collapsed;content.setAttribute('aria-hidden',String(collapsed));toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'Näytä sivupaneeli':'Piilota sivupaneeli');toggle.title=toggle.getAttribute('aria-label');draw(collapsed);};
 const set=value=>{collapsed=value;render();try{localStorage.setItem(key,String(collapsed));}catch{}};
 toggle.addEventListener('click',()=>set(!collapsed));render();return {set,get collapsed(){return collapsed;}};
}
export function versionRow({title,at,label='Avaa versio',disabled=false}){
 const row=node('article','','sui-version'),name=node('h3',title),date=node('small',formatDate(at,{compact:true})),open=node('button',label,'sui-button');
 name.title=title;open.type='button';open.disabled=disabled;open.setAttribute('aria-label',`${label}: ${title}`);row.append(name,date,open);return {row,open};
}
export function timeline({container,current,entries=[],restore,empty='Ei aiempia versioita.'}){
 container.replaceChildren();
 const entry=(value,isCurrent)=>{const item=node('article','',`sui-history-entry${isCurrent?' sui-history-current':''}`);item.append(node('small',`${formatDate(value.at)}${isCurrent?' · Nykyinen':''}`),node('p',value.text||''));if(!isCurrent&&restore){const button=node('button','Palauta','sui-link');button.type='button';button.onclick=()=>restore(value);item.append(button);}return item;};
 if(current)container.append(entry(current,true));container.append(node('h3','Historia','sui-history-heading'));
 for(const value of entries)container.append(entry(value,false));if(!entries.length)container.append(node('p',empty,'sui-help'));
}
export function commentCard({id,number,author,at,target,body,resolved=false,selected=false}){
 const card=node('article','',`sui-comment${resolved?' is-resolved':''}${selected?' is-selected':''}`);card.dataset.commentId=id;
 card.append(node('span',resolved?'✓':String(number),'sui-comment-number'),node('small',`${author} · ${formatDate(at)}`),node('p',target,'sui-comment-target'),node('p',body,'sui-comment-body'));
 const actions=node('div','','sui-comment-actions');card.append(actions);return {card,actions};
}
export function aiStatus(container){const card=node('div','','sui-credit');card.setAttribute('aria-label','AI-krediittisaldo');card.innerHTML='<div class="sui-credit-heading"><span>AI-KREDIITIT</span><small>EI YHDISTETTY</small></div><div class="sui-credit-balance"><strong>—</strong> krediittiä</div><p>Saldo näkyy, kun tekoälypalvelu on yhdistetty.</p>';container.append(card);return card;}
