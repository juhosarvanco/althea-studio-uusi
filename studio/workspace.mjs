import {bindInspector,svg,aiStatus,node,commentCard,timeline,versionRow,plainHTML,formatDate} from '../vendor/studio-ui/components.mjs';
export {svg,aiStatus,node,commentCard,timeline,versionRow,plainHTML,formatDate};
export function initializeWorkspace(){
 document.querySelectorAll('[data-ui-icon]').forEach(el=>el.innerHTML=svg(el.dataset.uiIcon));
 const inspector=bindInspector({toggle:document.querySelector('#studio-sidebar-toggle'),content:document.querySelector('#studio-sidebar-inner'),key:'althea:studio:sidebar-collapsed',draw:value=>document.body.classList.toggle('studio-sidebar-collapsed',value)});
 const measure=()=>document.documentElement.style.setProperty('--studio-bar-height',document.querySelector('.studio-bar').getBoundingClientRect().height+'px');new ResizeObserver(measure).observe(document.querySelector('.studio-bar'));measure();
 return {inspector,setMode(mode){document.body.dataset.studioMode=mode;document.querySelectorAll('[data-workspace-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.workspaceMode===mode)));}};
}
