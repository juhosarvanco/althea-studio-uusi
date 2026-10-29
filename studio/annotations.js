import * as Y from 'yjs';
import { relativePositionToAbsolutePosition, ySyncPluginKey } from '@tiptap/y-tiptap';
import { relativeCommentPosition } from './comment-ranges.mjs';

const selectable = '[data-studio-field], [data-studio-node]';
// Keep browsing gallery images while commenting. Alt-click can still select
// the navigation button itself as an annotation target.
const galleryNavigation = event => !event.altKey && event.target.closest('[data-gallery-step]');
const names = { header: 'Valikko', main: 'Koko sivu', footer: 'Alatunniste', section: 'Osio', article: 'Alue',
  div: 'Ryhmä', figure: 'Kuva-alue', img: 'Kuva', a: 'Linkki / painike', button: 'Painike',
  nav: 'Navigaatio', details: 'Avautuva alue', summary: 'Avautuvan alueen otsikko', form: 'Lomake',
  input: 'Kenttä', textarea: 'Tekstikenttä', label: 'Kentän otsikko', ul: 'Lista', ol: 'Lista', p: 'Teksti', li: 'Listan kohta' };
export const anchorFor = el => el.dataset.studioField ? { kind: 'field', fieldId: el.dataset.studioField }
  : { kind: 'element', nodeId: el.dataset.studioNode };
export const anchorKey = anchor => anchor?.kind === 'element' ? `node:${anchor.nodeId}` : `field:${anchor?.fieldId}`;
export function anchorElement(anchor) {
  if (!anchor) return null;
  return document.querySelector(anchor.kind === 'element' ? `[data-studio-node="${CSS.escape(anchor.nodeId)}"]`
    : `[data-studio-field="${CSS.escape(anchor.fieldId)}"]`);
}
export function elementLabel(el) {
  if (!el) return 'Poistettu kohde';
  const tag = el.tagName.toLowerCase();
  const type = /^h[1-6]$/.test(tag) ? 'Otsikko' : names[tag] || 'Kohde';
  if (['header', 'main', 'footer'].includes(tag)) return type;
  const copy = (el.querySelector('h1,h2,h3,h4') || el).cloneNode(true);
  copy.querySelectorAll('.ProseMirror-yjs-cursor').forEach(cursor => cursor.remove());
  const text = el.getAttribute('aria-label') || el.getAttribute('alt') || copy.textContent || el.id;
  return `${type}${text?.trim() ? ` · ${text.trim().replace(/\s+/g, ' ').slice(0, 85)}` : ''}`;
}
export function textAnchor(editors, selection = window.getSelection()) {
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0), quote = selection.toString();
  const container = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const el = container.closest('[data-studio-field]'), editor = editors.get(el?.dataset.studioField);
  if (!editor || !editor.view.dom.contains(range.endContainer) || !editor.view.dom.contains(range.startContainer)) return null;
  if (!quote.trim() || quote.length > 2000) return null;
  const state = ySyncPluginKey.getState(editor.state);
  const from = editor.view.posAtDOM(range.startContainer, range.startOffset), to = editor.view.posAtDOM(range.endContainer, range.endOffset);
  const relative = (pos, association) => relativeCommentPosition(state.doc, state.type, state.binding.mapping, pos, association);
  return { kind: 'text', fieldId: el.dataset.studioField, quote,
    from: relative(from, 0), to: relative(to, -1) };
}
export function textRange(anchor, editors) {
  if (anchor?.kind !== 'text') return null;
  const editor = editors.get(anchor.fieldId); if (!editor) return null;
  const state = ySyncPluginKey.getState(editor.state); if (!state?.binding) return null;
  const from = relativePositionToAbsolutePosition(state.doc, state.type, Y.createRelativePositionFromJSON(anchor.from), state.binding.mapping);
  const to = relativePositionToAbsolutePosition(state.doc, state.type, Y.createRelativePositionFromJSON(anchor.to), state.binding.mapping);
  if (from === null || to === null || from >= to) return null;
  const start = editor.view.domAtPos(from), end = editor.view.domAtPos(to), range = document.createRange();
  range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset); return range;
}

export function createAnnotationPicker({ editors, onPick, onCancel, getComments, onJump, onHint, onCompose = () => {} }) {
  let enabled = false, selected = null, hover = null, frame;
  const layer = document.createElement('div'); layer.id = 'studio-annotation-layer'; layer.dataset.studioChrome = '';
  const box = document.createElement('div'), highlight = document.createElement('div'), pins = document.createElement('div');
  box.className = 'studio-hover-box'; highlight.className = 'studio-target-box'; pins.className = 'studio-comment-pins';
  layer.append(box, highlight, pins); document.body.append(layer);
  function drawBox(node, rect) {
    node.hidden = !rect || !rect.width || !rect.height;
    if (node.hidden) return;
    Object.assign(node.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }
  function rectangle(anchor) {
    const el = anchorElement(anchor);
    if (!el || el.closest('[data-studio-chrome], [data-gallery-slide][aria-hidden="true"]')) return null;
    if (anchor.kind === 'text') return textRange(anchor, editors)?.getBoundingClientRect() || el.getBoundingClientRect();
    return el.getBoundingClientRect();
  }
  function draw() {
    drawBox(box, enabled ? hover?.getBoundingClientRect() : null);
    drawBox(highlight, enabled && selected ? rectangle(selected) : null);
    pins.replaceChildren();
    if (!enabled) return;
    const visibleTop=document.querySelector('.studio-bar')?.getBoundingClientRect().bottom+8 || 80;
    const active=[...getComments()].filter(([,comment])=>!comment.resolved).sort((a,b)=>b[1].createdAt.localeCompare(a[1].createdAt));
    const stacks=new Map();
    active.forEach(([id,comment],index)=>{
      const anchor=comment.anchor||{kind:'field',fieldId:comment.fieldId},rect=rectangle(anchor);
      if(!rect||!rect.width||!rect.height||rect.bottom<visibleTop||rect.top>innerHeight||rect.right<0||rect.left>innerWidth)return;
      const key=anchorKey(anchor),offset=stacks.get(key)||0;stacks.set(key,offset+1);
      const pin=document.createElement('button');pin.type='button';pin.className='studio-comment-pin';pin.textContent=String(index+1);pin.setAttribute('aria-label',`Avaa kommentti ${index+1}`);
      const p=comment.position||{x:1,y:0};
      Object.assign(pin.style,{left:`${Math.min(innerWidth-36,Math.max(4,rect.left+rect.width*p.x-14-offset*24))}px`,top:`${Math.max(visibleTop,rect.top+rect.height*p.y-12)}px`});
      pin.onclick=()=>onJump(id);pins.append(pin);
    });
  }
  const refresh = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
  function choose(anchor) {
    selected = anchor; hover = null;
    const el = anchorElement(anchor);
    if (el && !el.getClientRects().length)
      for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    onPick(anchor); refresh();
  }
  function levels() {
    const el = anchorElement(selected); if (!el) return [];
    const result = []; let current = el;
    while (current && current !== document.body) {
      if (current.matches(selectable)) result.unshift(current); current = current.parentElement;
    }
    return result;
  }
  document.addEventListener('pointermove', event => {
    if (!enabled) return;
    const next = event.target.closest('[data-studio-chrome]') || galleryNavigation(event) ? null : event.target.closest(selectable);
    if (next !== hover) { hover = next; refresh(); }
  });
  document.addEventListener('pointerdown', event => {
    if (!enabled || event.target.closest('[data-studio-chrome]') || galleryNavigation(event)) return;
    if (event.target.closest('a,button,input,select,summary,textarea') && !event.target.closest('[data-studio-field]')) event.preventDefault();
  }, true);
  document.addEventListener('click', event => {
    if (!enabled || event.target.closest('[data-studio-chrome]')) return;
    if (galleryNavigation(event)) { refresh(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    const anchor = textAnchor(editors), el = event.target.closest(selectable), selection = window.getSelection();
    if (anchor) choose(anchor);
    else if (selection?.toString().trim() && selection.rangeCount) {
      const common = selection.getRangeAt(0).commonAncestorContainer;
      const group = (common.nodeType === 1 ? common : common.parentElement).closest(selectable);
      if (group) { choose(anchorFor(group)); onHint('Katkelma ulottuu useaan tekstikohtaan tai on liian pitkä. Kommentti kohdistuu valitun tekstin yhteiseen alueeseen.'); }
    } else if (el) { selection?.removeAllRanges(); choose(anchorFor(el)); }
    if (selected) { const rect=anchorElement(selected)?.getBoundingClientRect(); onCompose(selected,{x:rect?.width?Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)):1,y:rect?.height?Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height)):0}); }
  }, true);
  document.addEventListener('keydown', event => {
    if (!enabled) return;
    if (event.target.closest('[data-studio-chrome]')) return;
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { event.preventDefault(); onCancel(); return; }
    if (galleryNavigation(event)) { refresh(); return; }
    if (['Enter', ' '].includes(event.key) && event.target.closest('a,button,summary,input,select')) {
      event.preventDefault(); event.stopImmediatePropagation();
      const el = event.target.closest(selectable); if (el) { choose(anchorFor(el)); onCompose(selected,{x:1,y:0}); }
    }
  }, true);
  window.addEventListener('scroll', refresh, { passive: true, capture: true }); window.addEventListener('resize', refresh);
  return { refresh, choose, levels, get selected() { return selected; },
    setEnabled(value) { enabled = value; hover = null; document.body.classList.toggle('studio-annotating', enabled); refresh(); },
    clear() { selected = null; hover = null; refresh(); } };
}
