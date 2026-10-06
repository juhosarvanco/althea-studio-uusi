import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { Editor, Extension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { yCursorPlugin } from '@tiptap/y-tiptap';
import { inlineExtensions } from './schema.mjs';
import { diffWords } from './diff.mjs';
import { reconcileLayout, startPageBehavior } from './live-layout.js';
import { createAnnotationPicker, anchorFor, anchorElement, elementLabel, textRange } from './annotations.js';
import { createMediaMode } from './media-client.js';
import { studioConfiguration, connectionMessage } from './config.js';

const $ = selector => document.querySelector(selector);
const doc = new Y.Doc();
const editors = new Map();
let session, provider, activeField = null, editing = true, connected = false, persisted = '', panel = null, mounted = false;
let historyRequest = 0, historyField = null, historyTimer, archiveTimer;
let layout = null, pendingLayout = null, layoutRequest = 0, composing = false, refreshingLayout = false;
let annotating = false, showResolvedComments = false, commentDraft = '', selectedCommentKey = '';
const mediaMode = createMediaMode({ api, getSession: () => session, getHeading: id => editors.get(id)?.getText(),
  container: document.querySelector('#studio-panel-content'), toast: message => toast(message), isConnected: () => connected,
  onApplied: () => refreshLayout(), confirmAction: confirmation });
const refreshPageBehavior = startPageBehavior();
const stateVector = () => btoa(String.fromCharCode(...Y.encodeSnapshot(Y.snapshot(doc))));
const durable = () => connected && provider?.synced && persisted === stateVector()
  && layout?.layoutHash === doc.getMap('meta').get('layoutHash') && !pendingLayout;
const toast = message => { $('#studio-toast').textContent = message; $('#studio-toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#studio-toast').hidden = true, 6500); };
const status = () => {
  const el = $('#studio-status');
  el.dataset.state = !connected ? 'offline' : durable() ? 'saved' : 'pending';
  el.textContent = !connected ? 'Yhteys katkennut · yhdistetään' : durable() ? 'Tallennettu yhteiseen versioon' : 'Tallentuu…';
  $('#studio-publish').disabled = !durable();
};
async function api(path, body) {
  const response = await fetch(session.server + path, { method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${session.token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Toiminto epäonnistui.');
  return result;
}
function applyPendingLayout() {
  if (!pendingLayout || !provider?.synced || composing || [...editors.values()].some(editor => editor.view.composing)) return;
  const next = pendingLayout;
  // HTTP and WebSocket may arrive in either order. Never mount a blank editor
  // before its server-created Yjs paragraph has reached this browser.
  if (doc.getMap('meta').get('layoutHash') !== next.layoutHash
    || [...next.fields, ...next.archived].some(field => !doc.getXmlFragment(field.id).length)) return;
  pendingLayout = null;
  const changed = layout && layout.layoutHash !== next.layoutHash;
  reconcileLayout(next, editors, mediaMode.prepareImages); layout = next;
  for (const field of next.archived) if (!editors.has(field.id)) {
    const el = document.createElement(field.tag); el.dataset.studioField = field.id;
    $('#studio-archived-fields').append(el);
  }
  mountFields(); refreshPageBehavior(); renderPeople(); picker.refresh();
  mediaMode.layoutChanged();
  if (panel === 'comments') renderComments();
  $('#studio-archive').hidden = !next.archived.length;
  $('#studio-archive').textContent = `Arkisto (${next.archived.length})`;
  if (panel === 'archive') renderArchive();
  if (changed) toast('Ulkoasu päivitetty. Tekstisi ja kirjoituskohta säilyivät.');
  status();
}
async function refreshLayout() {
  const request = ++layoutRequest; refreshingLayout = true;
  try {
    const next = await api('/api/layout');
    await mediaMode.preload(next.html);
    if (request !== layoutRequest) return;
    if (layout?.layoutHash === next.layoutHash && !pendingLayout) return;
    pendingLayout = next; applyPendingLayout();
  } catch (error) { if (request === layoutRequest) toast(`Ulkoasun päivitys odottaa yhteyttä. ${error.message}`); }
  finally { if (request === layoutRequest) refreshingLayout = false; }
}
document.addEventListener('compositionstart', () => composing = true);
document.addEventListener('compositionend', () => { composing = false; setTimeout(applyPendingLayout, 0); });
function select(id) {
  const changed = activeField !== id;
  document.querySelector('.studio-selected')?.classList.remove('studio-selected');
  activeField = id;
  document.querySelector(`[data-studio-field="${CSS.escape(id)}"]`)?.classList.add('studio-selected');
  $('#studio-field-history').disabled = false;
  provider.awareness.setLocalStateField('activeField', id);
  if (!annotating) picker.choose({ kind: 'field', fieldId: id });
  if (panel === 'comments') renderComments();
  if (changed && panel === 'field-history') renderFieldHistory().catch(error => toast(error.message));
}
function mountFields() {
  const first = !mounted; mounted = true;
  for (const el of document.querySelectorAll('[data-studio-field]')) {
    const id = el.dataset.studioField;
    if (editors.has(id)) continue;
    el.innerHTML = '';
    const cursors = Extension.create({ name: 'altheaCursors', addProseMirrorPlugins() {
      return [yCursorPlugin(provider.awareness, {
        awarenessStateFilter: (own, other) => own !== other && provider.awareness.getStates().get(other)?.activeField === id,
        cursorBuilder: user => { const cursor = document.createElement('span'); cursor.className = 'ProseMirror-yjs-cursor';
          cursor.style.borderColor = user.color || '#48645a'; const label = document.createElement('div');
          label.style.backgroundColor = user.color || '#48645a'; label.textContent = user.name || 'Muokkaaja'; cursor.append(label); return cursor; }
      })];
    } });
    const editor = new Editor({ element: el, extensions: [...inlineExtensions,
      Collaboration.configure({ document: doc, field: id }), cursors],
      editable: editing && !annotating && !mediaMode.enabled, onFocus: () => select(id), onUpdate: () => {
        picker.refresh();
        if (panel === 'field-history' && activeField === id) {
          clearTimeout(historyTimer);
          historyTimer = setTimeout(() => renderFieldHistory().catch(error => toast(error.message)), 1000);
        }
      }, editorProps: { attributes: { 'aria-label': `Muokkaa: ${id}`, role: 'textbox' },
        handleKeyDown: (_, event) => { if (event.key === 'Enter' && !event.shiftKey) { editor.commands.setHardBreak(); return true; } return false; } } });
    editors.set(id, editor);
    el.addEventListener('click', event => { if (editing && event.target.closest('a')) event.preventDefault(); select(id); });
  }
  document.body.classList.toggle('studio-editing', editing);
  if (first) registerTools();
}
function renderPeople() {
  const people = $('#studio-people'); people.replaceChildren();
  document.querySelectorAll('.studio-remote').forEach(el => el.classList.remove('studio-remote'));
  const states = [...provider.awareness.getStates()];
  for (const [id, state] of states) {
    if (!state.user) continue;
    const button = document.createElement('button'); button.className = 'studio-person'; button.type = 'button';
    button.style.setProperty('--person-color', state.user.color); button.textContent = state.user.name.slice(0, 1);
    button.title = `${state.user.name}${id === doc.clientID ? ' · sinä' : ''}`;
    button.setAttribute('aria-label', `Näytä ${state.user.name}n muokkaama kohta`);
    button.onclick = () => { const el = document.querySelector(`[data-studio-field="${CSS.escape(state.activeField || '')}"]`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    people.append(button);
    if (id !== doc.clientID && state.activeField) { const el = document.querySelector(`[data-studio-field="${CSS.escape(state.activeField)}"]`);
      el?.classList.add('studio-remote'); el?.style.setProperty('--remote-color', state.user.color); }
  }
}
function showPanel(type) {
  mediaMode.setEnabled(type === 'images');
  editors.forEach(editor => editor.setEditable(editing && !annotating && !mediaMode.enabled));
  panel = type; $('#studio-sidebar').hidden = false; document.body.classList.add('studio-panel-open');
  document.body.classList.toggle('studio-images-open', type === 'images');
  document.body.classList.toggle('studio-field-history-open', type === 'field-history');
  $('#studio-panel-title').textContent = type === 'images' ? 'Kuvat' : type === 'comments' ? 'Kommentit' : type === 'field-history' ? 'Kohdan historia' : type === 'archive' ? 'Poistettujen alueiden tekstit' : 'Versiohistoria';
  if (type === 'images') { $('#studio-panel-content').replaceChildren(node('p', 'Ladataan kuvapankkia…')); mediaMode.render(); }
  else if (type === 'comments') renderComments();
  else if (type === 'archive') renderArchive();
  else (type === 'field-history' ? renderFieldHistory() : renderHistory()).catch(error => toast(error.message));
  picker.refresh();
}
function node(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
function renderArchive() {
  const container = $('#studio-panel-content'); container.replaceChildren(node('p', 'Sivulta poistetut tekstit, kommentit ja kohdan historia säilyvät täällä.'));
  for (const field of layout?.archived || []) {
    const item = node('article', '', 'studio-version');
    item.append(node('h3', field.section), node('p', editors.get(field.id)?.getText() || 'Tyhjä tekstikohta'));
    const history = node('button', 'Näytä kohdan historia'); history.type = 'button';
    history.onclick = () => { select(field.id); showPanel('field-history'); }; item.append(history); container.append(item);
  }
}
const comments = doc.getMap('comments');
const picker = createAnnotationPicker({ editors, getComments: () => comments,
  onPick: anchor => {
    const key = JSON.stringify(anchor), changed = key !== selectedCommentKey; selectedCommentKey = key;
    activeField = anchor.fieldId || null; $('#studio-field-history').disabled = !activeField;
    provider?.awareness.setLocalStateField('activeField', activeField);
    if (annotating) showPanel('comments'); else if (panel === 'comments') renderComments();
    if (changed && panel === 'comments') $('#studio-sidebar').scrollTop = 0;
  }, onCancel: () => setAnnotationMode(false), onJump: id => jumpToComment(id), onHint: toast });
function commentAnchor(comment) { return comment.anchor || { kind: 'field', fieldId: comment.fieldId }; }
function anchorLabel(anchor) {
  const el = anchorElement(anchor);
  if (el && !el.closest('[data-studio-chrome]')) return elementLabel(el);
  return layout?.targets?.find(target => target.id === anchor?.nodeId)?.label
    || layout?.archived.find(field => field.id === anchor?.fieldId)?.section || anchor?.fieldId || 'Poistettu kohde';
}
function addComment(fieldId, body, anchor = { kind: 'field', fieldId }) {
  if (!connected || !anchor || anchor.kind === 'element' && !layout.targets?.some(target => target.id === anchor.nodeId && !target.archivedAt)
    || anchor.kind !== 'element' && !editors.has(anchor.fieldId)) throw new Error('Valitse ensin sivulta kommentoitava kohde.');
  if (!body.trim() || body.length > 2000) throw new Error('Kirjoita 1–2000 merkin kommentti.');
  const id = crypto.randomUUID();
  comments.set(id, { fieldId: anchor.fieldId || null, anchor, body: body.trim(), author: session.user.name, createdAt: new Date().toISOString(), resolved: false });
  return id;
}
function jumpToComment(id) {
  const comment = comments.get(id); if (!comment) return;
  const anchor = commentAnchor(comment), el = anchorElement(anchor);
  if (!el || el.closest('[data-studio-chrome]')) {
    if (anchor.fieldId) { select(anchor.fieldId); showPanel('field-history'); }
    else { picker.choose(anchor); showPanel('comments'); }
    toast('Kohde on poistettu sivulta. Kommentti säilyy alkuperäisessä kohteessa.'); return;
  }
  for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
  picker.choose(anchor); showPanel('comments'); el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (anchor.kind === 'text' && !textRange(anchor, editors)) toast('Alkuperäinen tekstikatkelma on muuttunut tai poistettu. Kommentin lainaus säilyy.');
  requestAnimationFrame(() => { const item = document.querySelector(`[data-comment-id="${CSS.escape(id)}"]`);
    document.querySelectorAll('.studio-comment-focused').forEach(el => el.classList.remove('studio-comment-focused'));
    item?.classList.add('studio-comment-focused'); item?.scrollIntoView({ block: 'nearest' }); picker.refresh(); });
}
function renderComments() {
  const previous = $('#studio-panel-content textarea');
  const draft = previous?.value ?? commentDraft, focused = document.activeElement === previous;
  const container = $('#studio-panel-content'); container.replaceChildren();
  const anchor = picker.selected || (activeField ? { kind: 'field', fieldId: activeField } : null);
  container.append(node('p', anchor ? `Valittu: ${anchorLabel(anchor)}` : 'Paina Kommentoi aluetta ja valitse sivulta teksti, kuva, painike tai alue.', 'studio-field-name'));
  if (annotating) container.append(node('p', 'Klikkaa kohdetta tai maalaa tekstikatkelma. Voit vaihtaa valinnan tasoa alla. Esc lopettaa kommentointitilan.', 'studio-history-note'));
  if (anchor) {
    const levels = node('div', '', 'studio-target-levels'); levels.setAttribute('aria-label', 'Valinnan taso');
    const allLevels = picker.levels();
    for (const el of allLevels.filter(el => el.tagName !== 'DIV' || el === anchorElement(anchor))) {
      const button = node('button', elementLabel(el)); button.type = 'button';
      button.setAttribute('aria-pressed', String(el === anchorElement(anchor) && anchor.kind !== 'text'));
      button.onclick = () => picker.choose(anchorFor(el)); levels.append(button);
    }
    container.append(levels);
    if (allLevels.some(el => el.tagName === 'DIV')) {
      const details = document.createElement('details'), summary = node('summary', 'Kaikki valinnan tasot'), select = document.createElement('select');
      select.setAttribute('aria-label', 'Kaikki valinnan tasot'); select.append(new Option('Valitse taso…', ''));
      allLevels.forEach((el, index) => select.append(new Option(`${index + 1}. ${elementLabel(el)}`, String(index))));
      select.onchange = () => { if (select.value !== '') picker.choose(anchorFor(allLevels[Number(select.value)])); };
      details.className = 'studio-all-levels'; details.append(summary, select); container.append(details);
    }
    const el = anchorElement(anchor);
    const children = [...(el?.querySelectorAll('[data-studio-node], [data-studio-field]') || [])]
      .filter(child => child.parentElement.closest('[data-studio-node], [data-studio-field]') === el);
    if (children.length) {
      const label = node('label', 'Valitse tarkempi kohde', 'studio-compare-label'), select = document.createElement('select');
      select.setAttribute('aria-label', 'Valitse tarkempi kohde'); select.append(new Option('Valitse…', ''));
      children.forEach((child, index) => select.append(new Option(elementLabel(child), String(index))));
      select.onchange = () => { if (select.value !== '') picker.choose(anchorFor(children[Number(select.value)])); };
      label.append(select); container.append(label);
    }
    if (anchor.kind === 'text') container.append(node('blockquote', anchor.quote, 'studio-comment-quote'));
  }
  const form = document.createElement('form'), input = document.createElement('textarea'), button = node('button', 'Lisää kommentti');
  input.placeholder = 'Ajatus, kysymys tai muokkaustoive…'; input.maxLength = 2000; input.setAttribute('aria-label', 'Uusi kommentti');
  input.value = draft;
  input.oninput = () => commentDraft = input.value;
  button.type = 'submit'; button.disabled = !anchor || !connected; form.append(input, button); container.append(form);
  form.onsubmit = event => { event.preventDefault(); const body = input.value; input.value = ''; commentDraft = '';
    try { addComment(anchor.fieldId, body, anchor); } catch (error) { input.value = body; commentDraft = body; toast(error.message); } };
  if (focused) input.focus();
  const toggle = node('button', showResolvedComments ? 'Näytä avoimet kommentit' : 'Näytä myös käsitellyt'); toggle.type = 'button';
  toggle.onclick = () => { showResolvedComments = !showResolvedComments; renderComments(); }; container.append(toggle);
  const list = [...comments].filter(([, comment]) => showResolvedComments || !comment.resolved).sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt));
  for (const [id, comment] of list) {
    const item = document.createElement('article'); item.className = 'studio-comment'; item.dataset.commentId = id;
    item.append(node('small', `${comment.author} · ${new Date(comment.createdAt).toLocaleString('fi-FI')}${comment.resolved ? ' · Käsitelty' : ''}`), node('p', anchorLabel(commentAnchor(comment)), 'studio-field-name'));
    if (comment.anchor?.kind === 'text') item.append(node('blockquote', comment.anchor.quote, 'studio-comment-quote'));
    item.append(node('p', comment.body));
    const actions = node('div', '', 'studio-panel-buttons'), jump = node('button', 'Näytä kohta'), resolve = node('button', comment.resolved ? 'Avaa uudelleen' : 'Merkitse käsitellyksi');
    jump.onclick = () => jumpToComment(id);
    resolve.onclick = () => comments.set(id, { ...comments.get(id), resolved: !comment.resolved });
    actions.append(jump, resolve); item.append(actions); container.append(item);
  }
}
comments.observe(() => { picker.refresh(); $('#studio-comment-count').textContent = [...comments.values()].filter(comment => !comment.resolved).length;
  if (panel === 'comments') renderComments(); });
async function confirmation(title, message, label) {
  $('#studio-confirm-title').textContent = title; $('#studio-confirm-message').textContent = message; $('#studio-confirm-ok').textContent = label;
  const dialog = $('#studio-confirm'); dialog.showModal();
  return new Promise(resolve => {
    const finish = result => { dialog.close(); dialog.oncancel = null; resolve(result); };
    $('#studio-confirm-ok').onclick = () => finish(true); $('#studio-confirm-cancel').onclick = () => finish(false);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
  });
}
async function renderHistory() {
  const container = $('#studio-panel-content'); container.replaceChildren(node('p', 'Ladataan versioita…'));
  const { versions } = await api('/api/versions'); if (panel !== 'history') return;
  container.replaceChildren(node('p', 'Automaattinen versio tallentuu 15 minuutin välein. Voit myös nimetä tämänhetkisen version.'));
  const form = document.createElement('form'), input = document.createElement('input'), button = node('button', 'Tallenna nimetty versio');
  input.placeholder = 'Esimerkiksi: Tekstit tarkistettu'; input.maxLength = 100; input.setAttribute('aria-label', 'Version nimi');
  form.append(input, button); container.append(form);
  form.onsubmit = async event => { event.preventDefault(); try { if (!durable()) throw new Error('Odota muutosten tallentumista.');
    await api('/api/checkpoint', { title: input.value, vector: stateVector() }); await renderHistory(); toast('Versio tallennettu.'); } catch (error) { toast(error.message); } };
  for (const version of versions) {
    const item = node('article', '', 'studio-version'); item.append(node('h3', version.title), node('small', `${version.author} · ${new Date(version.createdAt).toLocaleString('fi-FI')}`));
    const restore = node('button', 'Palauta tämä versio');
    restore.onclick = async () => { if (!await confirmation('Palautetaanko yhteinen versio?', 'Tämä palauttaa koko työversion, myös kommentit, molemmille muokkaajille. Nykyinen sisältö tallennetaan ensin historiaan.', 'Palauta')) return;
      try { await api('/api/restore', { id: version.id, vector: stateVector() }); await renderHistory(); toast('Yhteinen versio palautettu.'); } catch (error) { toast(error.message); } };
    item.append(restore); container.append(item);
  }
}
async function renderFieldHistory() {
  const fieldId = activeField, request = ++historyRequest, container = $('#studio-panel-content');
  if (!fieldId) { container.replaceChildren(node('p', 'Valitse sivulta otsikko tai tekstikappale, jonka historiaa haluat tarkastella.')); return; }
  const sameField = historyField === fieldId;
  const opened = sameField ? new Set([...container.querySelectorAll('details[open]')].map(el => el.dataset.versionId)) : new Set();
  const comparisons = sameField ? new Map([...container.querySelectorAll('details')].map(el => [el.dataset.versionId, el.querySelector('select')?.value])) : new Map();
  const scrollTop = $('#studio-sidebar').scrollTop;
  if (!sameField) container.replaceChildren(node('p', 'Ladataan kohdan historiaa…'));
  const history = await api(`/api/field-history?fieldId=${encodeURIComponent(fieldId)}`);
  if (request !== historyRequest || panel !== 'field-history' || activeField !== fieldId) return;
  historyField = fieldId;
  const caption = history.current.text.trim().slice(0, 110) || 'Tyhjä tekstikohta';
  const section = document.querySelector(`[data-studio-field="${CSS.escape(fieldId)}"]`)?.closest('section');
  const sectionTitle = section?.querySelector('h2, h1')?.textContent.trim() || history.section;
  container.replaceChildren(node('p', sectionTitle === caption ? 'Valittu tekstikohta' : sectionTitle, 'studio-kicker'), node('h3', caption));
  container.append(node('p', 'Valitse sivulta toinen tekstikohta nähdäksesi sen historian. Peräkkäinen kirjoittaminen kootaan yhdeksi muutokseksi.'));
  const refresh = node('button', 'Päivitä historia'); refresh.type = 'button';
  refresh.onclick = () => renderFieldHistory().catch(error => toast(error.message)); container.append(refresh);
  const current = node('div', '', 'studio-current-text'); current.append(node('small', 'NYKYINEN TEKSTI'));
  const currentText = node('div', '', 'studio-history-text'); currentText.innerHTML = history.current.html || '<em>Tyhjä teksti</em>';
  current.append(currentText); container.append(current);
  if (!history.entries.length) container.append(node('p', 'Tälle kohdalle ei ole vielä aiempia versioita.'));
  for (const entry of history.entries) {
    const item = node('details', '', 'studio-field-version'); item.dataset.versionId = entry.id; item.open = opened.has(entry.id);
    const summary = node('summary'), date = new Date(entry.updatedAt).toLocaleString('fi-FI');
    summary.append(node('strong', entry.author?.name || 'Muokkaaja ei tiedossa'), node('small', date),
      node('span', entry.kind === 'restore' ? 'Tekstin palautus' : entry.kind === 'edit' ? 'Tekstimuutos' : entry.kind === 'layout' ? 'Uuden tekstikohdan luonti' : entry.title || 'Tallennettu versio'));
    item.append(summary);
    if (!entry.author) item.append(node('p', 'Tämä teksti on aiemmasta tallennuksesta. Ajankohta kertoo tallennushetken; alkuperäistä muokkaajaa ei ole kirjattu.', 'studio-history-note'));
    const label = node('label', 'Vertailu', 'studio-compare-label'), comparison = node('select');
    comparison.setAttribute('aria-label', `Vertailu: ${date}`);
    if (entry.before) { const option = node('option', 'Muutos edelliseen tekstiin'); option.value = 'previous'; comparison.append(option); }
    const option = node('option', 'Tästä versiosta nykyiseen'); option.value = 'current'; comparison.append(option);
    if (comparisons.get(entry.id)) comparison.value = comparisons.get(entry.id);
    label.append(comparison); item.append(label);
    const legend = node('p', '', 'studio-diff-legend'); legend.append(node('del', 'Poistettu'), document.createTextNode(' · '), node('ins', 'Lisätty'));
    const difference = node('div', '', 'studio-text-diff');
    const compare = () => {
      const from = comparison.value === 'previous' ? entry.before.text : entry.after.text;
      const to = comparison.value === 'previous' ? entry.after.text : history.current.text;
      difference.replaceChildren();
      if (from === to) difference.append(node('p', 'Sanamuoto on sama. Muotoilu tai linkki voi silti poiketa.'));
      else for (const part of diffWords(from, to)) difference.append(part.kind === 'same' ? document.createTextNode(part.text) : node(part.kind === 'add' ? 'ins' : 'del', part.text));
    };
    comparison.onchange = compare; compare(); item.append(legend, difference, node('h4', 'Tämän version teksti'));
    const preview = node('div', '', 'studio-history-text'); preview.innerHTML = entry.after.html || '<em>Tyhjä teksti</em>'; item.append(preview);
    const restore = node('button', entry.after.hash === history.current.hash ? 'Nykyinen teksti' : 'Palauta tämä teksti');
    restore.type = 'button'; restore.disabled = entry.after.hash === history.current.hash;
    restore.onclick = async () => {
      if (!await confirmation('Palautetaanko tämän kohdan teksti?', 'Vain tämä tekstikohta palautetaan. Muut tekstit ja kommentit säilyvät. Myös korvattava teksti jää kohdan historiaan.', 'Palauta teksti')) return;
      try {
        if (!durable()) throw new Error('Odota muutosten tallentumista ennen palauttamista.');
        await api('/api/field-restore', { fieldId, id: entry.id, expectedHash: history.current.hash, versionHash: entry.after.hash });
        toast('Tekstikohta palautettu yhteiseen työversioon.'); await renderFieldHistory();
      } catch (error) { toast(error.message); }
    };
    item.append(restore); container.append(item);
  }
  if (sameField) $('#studio-sidebar').scrollTop = scrollTop;
}
function registerTools() {
  if (typeof document.modelContext?.registerTool !== 'function') return;
  const tool = (name, description, properties, required, execute, readOnly = false, untrusted = false) => document.modelContext.registerTool({
    name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false },
    annotations: { readOnlyHint: readOnly, untrustedContentHint: untrusted }, execute: async input => {
      try { return { content: [{ type: 'text', text: JSON.stringify(await execute(input)) }] }; }
      catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
    } });
  const string = { type: 'string' };
  tool('althea_read_fields', 'Lue Althean yhteisen työversion tekstikohdat ja niiden pysyvät fieldId-tunnisteet. Ei muuta sisältöä.', {}, [],
    () => [...editors].map(([id, editor]) => ({ fieldId: id, text: editor.getText(), archived: !!layout?.archived.some(field => field.id === id) })), true);
  tool('althea_edit_text', 'Muokkaa yhtä tekstikohtaa yhteisessä työversiossa. Lue tuore sisältö ensin: expectedText on vastattava nykyistä tekstiä täsmälleen. Muutos näkyy muille heti, mutta ei julkaise sivustoa.',
    { fieldId: string, expectedText: string, text: string }, ['fieldId', 'expectedText', 'text'], ({ fieldId, expectedText, text }) => {
      if (!connected || !provider.synced) throw new Error('Yhteys ei ole valmis.');
      const editor = editors.get(fieldId); if (!editor) throw new Error('Tuntematon tekstikohta.');
      if (editor.getText() !== expectedText) throw new Error('Teksti muuttui toisella muokkaajalla. Lue uusin teksti ennen muokkaamista.');
      if (text.length > 20000) throw new Error('Teksti on liian pitkä.');
      const content = text.split('\n').flatMap((line, index) => [...(index ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : [])]);
      editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content }] }); select(fieldId);
      return { fieldId, text: editor.getText(), published: false };
    });
  tool('althea_add_comment', 'Lisää tekstikohtaan yhteinen kommentti, jonka molemmat muokkaajat näkevät.',
    { fieldId: string, body: string }, ['fieldId', 'body'], ({ fieldId, body }) => ({ id: addComment(fieldId, body) }));
  tool('althea_read_comments', 'Lue yhteiset alue- ja tekstikommentit sekä niiden pysyvät kohdetunnisteet. Ei muuta sisältöä.', {}, [],
    () => [...comments].map(([id, comment]) => ({ id, ...comment, targetLabel: anchorLabel(commentAnchor(comment)) })), true, true);
}
async function getSession() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const requested = new URL(location.href).searchParams.get('name') === 'julia' ? 'julia' : 'juho';
  const configuration = await studioConfiguration();
  const token = session?.token || sessionStorage.getItem('althea-studio-uusi-session');
  const response = await fetch(`${configuration.server}/api/studio-session${local ? `?name=${requested}` : ''}`, {
    cache: 'no-store', headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000) });
  const result = await response.json(); if (!response.ok) { const error = new Error(result.error || result.message || 'Kirjautuminen epäonnistui.'); error.status = response.status; throw error; }
  sessionStorage.setItem('althea-studio-uusi-session', result.token);
  return { ...result, server: configuration.server };
}
let loginSequence = 0;
$('#studio-login').onclick = async () => {
  const sequence = ++loginSequence, button = $('#studio-login');
  button.disabled = true;
  try {
    const configuration = await studioConfiguration();
    const request = async (path, body) => {
      const response = await fetch(configuration.server + path, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Kirjautuminen epäonnistui.'); return data;
    };
    const attempt = await request('/api/login-start', {});
    $('#studio-login-code').textContent = attempt.code;
    $('#studio-login-open').href = attempt.verification;
    $('#studio-login-step').hidden = false;
    $('#studio-gate-message').textContent = 'Avaa GitHub, syötä kertakäyttöinen koodi ja hyväksy kirjautuminen. Tämä sivu yhdistyy automaattisesti hyväksynnän jälkeen.';
    button.textContent = 'Odotetaan GitHub-hyväksyntää…';
    let interval = attempt.interval;
    const deadline = Date.now() + attempt.expiresIn * 1000;
    while (sequence === loginSequence && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
      if (sequence !== loginSequence) break;
      const result = await request('/api/login-poll', { id: attempt.id });
      if (result.pending) { interval = result.interval; continue; }
      session = { ...result, server: configuration.server };
      sessionStorage.setItem('althea-studio-uusi-session', result.token);
      $('#studio-login-step').hidden = true;
      await start(); return;
    }
    if (sequence === loginSequence) throw new Error('Kirjautumispyyntö vanheni. Aloita uudelleen.');
  } catch (error) { $('#studio-gate-message').textContent = connectionMessage(error); }
  finally { button.disabled = false; button.textContent = 'Kirjaudu GitHubilla'; }
};
$('#studio-login-cancel').onclick = () => { loginSequence++; $('#studio-login-step').hidden = true; $('#studio-login').disabled = false; $('#studio-login').textContent = 'Kirjaudu GitHubilla'; $('#studio-gate-message').textContent = 'Kirjaudu omalla GitHub-tunnuksellasi. Muutokset tallentuvat tähän erilliseen Studioon.'; };
async function start() {
  try {
    session = await getSession();
    $('#studio-gate').close();
    if (provider) { provider.connect(); return; }
    const Socket = class extends WebSocket { constructor(url) { super(url, [`althea-auth.${session.token}`]); } };
    provider = new WebsocketProvider(session.server.replace(/^http/, 'ws') + '/sync', 'althea-uusi', doc,
      { WebSocketPolyfill: Socket, disableBc: true });
    provider.messageHandlers[4] = (_, decoder) => { persisted = new TextDecoder().decode(decoding.readVarUint8Array(decoder)); status(); };
    provider.messageHandlers[5] = () => { refreshLayout(); };
    provider.messageHandlers[6] = () => { mediaMode.refresh().catch(error => toast(error.message)); };
    provider.on('status', event => {
      connected = event.status === 'connected';
      if (connected) { for (const type of [5, 6]) { const request = encoding.createEncoder(); encoding.writeVarUint(request, type); provider.ws.send(encoding.toUint8Array(request)); } mediaMode.refresh().catch(error => toast(error.message)); }
      status();
    });
    provider.on('sync', synced => { if (synced) { applyPendingLayout(); status(); } });
    provider.awareness.setLocalStateField('user', { name: session.user.name, color: session.user.login.includes('julia') ? '#a35d6a' : '#48645a' });
    provider.awareness.on('change', renderPeople);
    doc.on('update', () => {
      applyPendingLayout(); status(); picker.refresh();
      if (panel === 'archive') { clearTimeout(archiveTimer); archiveTimer = setTimeout(renderArchive, 150); }
    });
    await refreshLayout();
    await mediaMode.refresh();
    setInterval(() => {
      if (connected && !refreshingLayout && layout?.layoutHash !== doc.getMap('meta').get('layoutHash')) refreshLayout();
      applyPendingLayout();
    }, 1500);
    if (session.development) { $('.studio-bar').classList.add('studio-local'); $('.studio-brand span').textContent = `${session.user.name} · paikallinen kokeilu`;
      $('#studio-publish').textContent = 'Lataa sivu'; }
    setInterval(async () => { try { session = await getSession(); } catch { connected = false; provider.disconnect(); status(); $('#studio-gate-message').textContent = 'Kirjautuminen vanheni. Työversio säilyy palvelimella.'; $('#studio-gate').showModal(); } }, 10 * 60 * 1000);
  } catch (error) {
    $('#studio-gate-message').textContent = error.status === 401 ? 'Kirjaudu omalla GitHub-tunnuksellasi. Muutokset tallentuvat tähän erilliseen Studioon.' : connectionMessage(error);
    $('#studio-login').hidden = false;
    if (!$('#studio-gate').open) $('#studio-gate').showModal();
    $('#studio-status').textContent = 'Yhteiseditori odottaa kirjautumista';
  }
}
function setAnnotationMode(value) {
  if (composing) { toast('Viimeistele keskeneräinen kirjoitus ennen kommentointitilaa.'); return; }
  if (value) mediaMode.setEnabled(false);
  annotating = value; picker.setEnabled(value); editors.forEach(editor => editor.setEditable(editing && !value && !mediaMode.enabled));
  $('#studio-annotate').setAttribute('aria-pressed', String(value)); $('#studio-annotate').textContent = value ? 'Lopeta kommentointi' : 'Kommentoi aluetta';
  if (value) showPanel('comments');
}
$('#studio-annotate').onclick = () => setAnnotationMode(!annotating);
$('#studio-images').onclick = () => { if (!session) return toast('Kirjaudu ensin Studioon.'); setAnnotationMode(false); if (mediaMode.enabled) $('#studio-close').click(); else showPanel('images'); };
$('#studio-mode').onclick = () => { setAnnotationMode(false); editing = !editing; editors.forEach(editor => editor.setEditable(editing));
  if (mediaMode.enabled) $('#studio-close').click();
  document.body.classList.toggle('studio-editing', editing); $('#studio-mode').textContent = editing ? 'Esikatsele' : 'Muokkaa tekstejä'; };
$('#studio-undo').onclick = () => editors.get(activeField)?.commands.undo();
$('#studio-redo').onclick = () => editors.get(activeField)?.commands.redo();
$('#studio-comments').onclick = () => showPanel('comments'); $('#studio-history').onclick = () => showPanel('history');
$('#studio-archive').onclick = () => showPanel('archive');
$('#studio-archive-close').onclick = () => {
  if (!durable()) { toast('Odota tekstin tallentumista ennen sulkemista.'); return; }
  const dock = $('#studio-archive-dock');
  for (const el of [...dock.querySelector('[data-archive-editor]').children]) $('#studio-archived-fields').append(el);
  dock.hidden = true;
};
$('#studio-field-history').onclick = () => showPanel('field-history');
$('#studio-close').onclick = () => { mediaMode.setEnabled(false); setAnnotationMode(false); picker.clear(); panel = null; clearTimeout(historyTimer); $('#studio-sidebar').hidden = true; document.body.classList.remove('studio-panel-open', 'studio-field-history-open', 'studio-images-open'); };
$('#studio-publish').disabled = true;
$('#studio-publish').onclick = async () => {
  try {
    if (!durable()) throw new Error('Odota muutosten tallentumista.');
    if (session.development) {
      const result = await api('/api/export', { vector: stateVector() });
      const link = document.createElement('a'), url = URL.createObjectURL(new Blob([result.html], { type: 'text/html' }));
      link.href = url; link.download = 'althea-yhteinen-versio.html'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Yhteinen sivu ladattu tiedostoksi.'); return;
    }
    if (!await confirmation('Julkaistaanko yhteinen työversio?', 'Molempien muokkaajien tämänhetkiset tekstit julkaistaan sivustolle. Versio tallennetaan historiaan.', 'Julkaise')) return;
    $('#studio-publish').disabled = true;
    const result = await api('/api/studio-publish', { vector: stateVector(), layoutHash: layout.layoutHash });
    toast(result.unchanged ? 'Sivusto on jo ajan tasalla.' : 'Julkaistu uuteen GitHub-repoon. GitHub Pages päivittyy hetken kuluttua.'); status();
  } catch (error) { toast(error.message); status(); }
};
document.querySelector('main form')?.addEventListener('submit', event => event.preventDefault());
window.addEventListener('beforeunload', event => { if (mounted && (!durable() || commentDraft.trim())) { event.preventDefault(); event.returnValue = ''; } });
start();
