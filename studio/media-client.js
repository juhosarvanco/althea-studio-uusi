import { sitePath } from './config.js';

export function createMediaMode({ api, getSession, getHeading, container, toast, isConnected, onApplied, confirmAction }) {
  let enabled = false, images = [], deletedImages = [], slots = [], selected = null, draft = null, busy = false, request = 0, showDeleted = false;
  const urls = new Map(), resolvedURLs = new Map();
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const button = (text, action, className) => { const node = el('button', text, className); node.type = 'button'; node.onclick = action; return node; };
  const normalize = path => String(path || '').replace(/^\//, '');
  const label = slot => slot.kind === 'background' && !slot.headingField ? slot.label
    : slot.label === 'Yläosan taustakuva' ? slot.label : getHeading(slot.headingField) || slot.label;
  const current = () => slots.find(slot => slot.id === selected);
  async function imageURL(image) {
    if (!image.uploaded) return sitePath(image.path);
    if (!urls.has(image.id)) {
      const session = getSession();
      urls.set(image.id, fetch(session.server + '/api/media-file/' + image.id,
        { headers: { authorization: 'Bearer ' + session.token }, signal: AbortSignal.timeout(15000) })
        .then(response => { if (!response.ok) throw new Error('Kuvan lataaminen epäonnistui.'); return response.blob(); })
        .then(blob => { const url = URL.createObjectURL(blob); resolvedURLs.set(image.path, url); return url; }).catch(error => { urls.delete(image.id); throw error; }));
    }
    return urls.get(image.id);
  }
  function loadPreview(node, image) {
    if (!image) return;
    node.alt = image.alt || image.name;
    imageURL(image).then(url => { if (node.isConnected) node.src = url; }).catch(error => { if (enabled) toast(error.message); });
  }
  async function hydrate() {
    for (const image of document.querySelectorAll('main img, header img, footer img')) {
      const path = normalize(image.dataset.studioMediaPath || image.getAttribute('src'));
      const entry = images.find(item => item.uploaded && item.path === path);
      if (!entry) continue;
      image.dataset.studioMediaPath = path;
      try { const url = await imageURL(entry); if (image.isConnected) image.src = url; }
      catch { toast('Uusi kuva odottaa yhteyttä palvelimeen.'); }
    }
    highlight();
  }
  async function preload(html) {
    const incoming = new DOMParser().parseFromString(html, 'text/html');
    const paths = new Set([...incoming.querySelectorAll('img[src]')].map(image => normalize(image.getAttribute('src'))));
    if ([...paths].some(path => /^assets\/img\/studio-[a-f0-9]{64}\.webp$/.test(path) && !images.some(image => image.path === path))) {
      const result = await api('/api/media'); images = result.images; slots = result.slots;
    }
    await Promise.all(images.filter(image => image.uploaded && paths.has(image.path)).map(image => imageURL(image)));
  }
  function prepareImages(document) {
    for (const image of document.querySelectorAll('img[src]')) {
      const path = normalize(image.getAttribute('src')), url = resolvedURLs.get(path);
      if (url) { image.dataset.studioMediaPath = path; image.src = url; }
    }
  }
  async function refresh() {
    const id = ++request;
    const result = await api('/api/media');
    if (id !== request) return;
    images = result.images; deletedImages = result.deletedImages || []; slots = result.slots;
    if (draft?.mediaId && !images.some(image => image.id === draft.mediaId)) {
      draft.mediaId = images.find(image => image.path === normalize(current()?.src))?.id || null;
      if (enabled && !busy) toast('Valitsemasi kuva poistettiin kuvapankista. Voit valita toisen kuvan tai palauttaa sen Poistetut kuvat -listasta.');
    }
    if (!selected && slots.length) choose(slots[0].id, false);
    await hydrate();
    const typing = container.contains(document.activeElement) && document.activeElement.matches('input,textarea,select');
    if (enabled && !busy && !typing) render();
  }
  function choose(id, scroll = true) {
    selected = id;
    const slot = current();
    if (!slot) { draft = null; if (enabled) render(); return; }
    const image = images.find(item => item.path === normalize(slot.src));
    draft = { mediaId: image?.id || null, alt: slot.alt, position: /^\d+% \d+%$/.test(slot.position) ? slot.position : '50% 50%', imageHash: slot.imageHash };
    if (enabled) render(); highlight();
    if (scroll) document.querySelector(`[data-studio-node="${CSS.escape(slot.kind === 'background' ? '' : slot.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (scroll && slot.kind === 'background' && slot.sectionId) document.getElementById(slot.sectionId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function highlight() {
    document.querySelectorAll('.studio-image-selected').forEach(image => image.classList.remove('studio-image-selected'));
    if (enabled && selected) document.querySelector(`[data-studio-node="${CSS.escape(selected)}"]`)?.classList.add('studio-image-selected');
  }
  async function save() {
    if (!draft?.mediaId || !isConnected()) { toast('Odota yhteyden palautumista ennen kuvan vaihtamista.'); return; }
    const proposal = { nodeId: selected, ...draft };
    busy = true; render();
    try {
      await api('/api/media-assign', proposal);
      await onApplied(); await refresh(); choose(proposal.nodeId, false);
      toast('Kuva päivitetty yhteiseen työversioon. Julkaise, kun olette valmiita.');
    } catch (error) { toast(error.message); await refresh().catch(() => {}); }
    finally { busy = false; if (enabled) render(); }
  }
  async function optimize(file) {
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: alkuperäinen kuva saa olla enintään 20 Mt.`);
    if (!/\.(jpe?g|png|webp|avif)$/i.test(file.name)) throw new Error(`${file.name}: käytä JPG-, PNG-, WebP- tai AVIF-kuvaa.`);
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error(`${file.name}: kuvaa ei voitu avata.`); });
    try {
      if (bitmap.width * bitmap.height > 50 * 1024 * 1024) throw new Error(`${file.name}: kuvan tarkkuus on liian suuri.`);
      const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let blob;
      for (const quality of [0.82, 0.68, 0.5]) {
        blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob?.type === 'image/webp' && blob.size <= 2 * 1024 * 1024) return blob;
      }
      throw new Error(`${file.name}: kuvan valmistelu epäonnistui.`);
    } finally { bitmap.close(); }
  }
  async function remove(image) {
    if (busy || !isConnected()) return;
    if (!await confirmAction('Poistetaanko kuva kuvapankista?', `Kuva ”${image.name}” siirretään Poistetut kuvat -listaan. Voit palauttaa sen myöhemmin.`, 'Poista kuva')) return;
    busy = true; render();
    try {
      await api('/api/media-delete', { mediaId: image.id });
      await refresh();
      toast('Kuva poistettu kuvapankista. Voit palauttaa sen Poistetut kuvat -listasta.');
    } catch (error) { toast(error.message); await refresh().catch(() => {}); }
    finally { busy = false; if (enabled) render(); }
  }
  async function restore(image) {
    if (busy || !isConnected()) return;
    busy = true; render();
    try {
      await api('/api/media-restore', { mediaId: image.id });
      await refresh(); toast('Kuva palautettu yhteiseen kuvapankkiin.');
    } catch (error) { toast(error.message); await refresh().catch(() => {}); }
    finally { busy = false; if (enabled) render(); }
  }
  async function upload(files) {
    if (!files.length || busy) return;
    busy = true; render();
    let count = 0, last;
    try {
      for (const file of files) {
        toast(`Lisätään kuvapankkiin ${count + 1}/${files.length}: ${file.name}`);
        const blob = await optimize(file), session = getSession();
        const response = await fetch(session.server + '/api/media-upload?name=' + encodeURIComponent(file.name),
          { method: 'POST', headers: { authorization: 'Bearer ' + session.token, 'content-type': 'image/webp' }, body: blob, signal: AbortSignal.timeout(60000) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Kuvan tallennus epäonnistui.');
        last = result.entry; count++;
      }
      await refresh();
      if (draft && last) draft.mediaId = last.id;
      toast(`${count === 1 ? 'Kuva lisätty' : `${count} kuvaa lisätty`} yhteiseen kuvapankkiin. Valitse alue ja paina Käytä tässä kohdassa.`);
    } catch (error) { toast(error.message + (count ? ` ${count} kuvaa tallennettiin kuvapankkiin.` : '')); await refresh().catch(() => {}); }
    finally { busy = false; if (enabled) render(); }
  }
  function render() {
    if (!enabled) return;
    const fragment = document.createDocumentFragment();
    fragment.append(el('p', 'Valitse kuva sivulta tai alla olevasta listasta. Valitse sitten uusi kuva yhteisestä kuvapankista.', 'studio-media-intro'));
    const slotLabel = el('label', 'Muokattava kuva', 'studio-media-label'), select = el('select'); select.setAttribute('aria-label', 'Muokattava kuva'); select.disabled = busy;
    for (const [kind, title] of [['background', 'Taustakuvat'], ['image', 'Muut kuvat']]) {
      const group = el('optgroup'); group.label = title;
      for (const slot of slots.filter(item => item.kind === kind)) { const option = el('option', label(slot)); option.value = slot.id; option.selected = slot.id === selected; group.append(option); }
      if (group.children.length) select.append(group);
    }
    select.onchange = () => choose(select.value); slotLabel.append(select); fragment.append(slotLabel);
    const slot = current(), chosen = images.find(image => image.id === draft?.mediaId);
    if (slot && draft) {
      if (slot.imageHash !== draft.imageHash) {
        const warning = el('div', undefined, 'studio-media-conflict'); warning.setAttribute('role', 'status');
        warning.append(el('p', 'Tätä kuvaa muutettiin toisessa näkymässä. Tarkista uusin kuva ennen omaa muutostasi.'), button('Lataa uusin kuva', () => choose(selected, false)));
        fragment.append(warning);
      }
      if (chosen) {
        const preview = el('img', undefined, 'studio-media-preview'); preview.style.objectPosition = draft.position; loadPreview(preview, chosen); fragment.append(preview);
      }
      const altLabel = el('label', 'Kuvan kuvaus', 'studio-media-label'), alt = el('input'); alt.type = 'text'; alt.maxLength = 500; alt.value = draft.alt; alt.disabled = busy;
      alt.setAttribute('aria-label', 'Kuvan kuvaus'); alt.oninput = () => { draft.alt = alt.value; }; altLabel.append(alt);
      const cropLabel = el('label', 'Rajauksen painopiste', 'studio-media-label'), crop = el('select'); crop.setAttribute('aria-label', 'Rajauksen painopiste'); crop.disabled = busy;
      const positions = [['50% 50%', 'Keskellä'], ['50% 20%', 'Ylhäällä'], ['50% 80%', 'Alhaalla'], ['20% 50%', 'Vasemmalla'], ['80% 50%', 'Oikealla']];
      if (!positions.some(([value]) => value === draft.position)) positions.unshift([draft.position, 'Nykyinen rajaus']);
      for (const [value, name] of positions) { const option = el('option', name); option.value = value; option.selected = value === draft.position; crop.append(option); }
      crop.onchange = () => { draft.position = crop.value; const preview = container.querySelector('.studio-media-preview'); if (preview) preview.style.objectPosition = draft.position; };
      cropLabel.append(crop); fragment.append(altLabel, cropLabel);
      const apply = button(busy ? 'Odota…' : 'Käytä tässä kohdassa', save, 'studio-primary'); apply.disabled = busy || !chosen || !isConnected() || slot.imageHash !== draft.imageHash;
      fragment.append(apply, el('p', 'Kuvan vaihto näkyy molemmille heti. Julkinen sivu päivittyy Julkaise-painikkeella.', 'studio-history-note studio-media-note'));
    }
    const heading = el('div', undefined, 'studio-media-heading'); heading.append(el('h3', showDeleted ? `Poistetut kuvat (${deletedImages.length})` : `Kuvapankki (${images.length})`)); fragment.append(heading);
    const toggle = button(showDeleted ? 'Takaisin kuvapankkiin' : `Poistetut kuvat (${deletedImages.length})`, () => { showDeleted = !showDeleted; render(); });
    toggle.disabled = busy; fragment.append(toggle);
    if (!showDeleted) {
      const uploadLabel = el('label', busy ? 'Lisätään kuvia…' : '+ Lisää kuvia', 'studio-media-upload');
      const input = el('input'); input.type = 'file'; input.multiple = true; input.accept = 'image/jpeg,image/png,image/webp,image/avif'; input.disabled = busy; input.setAttribute('aria-label', 'Lisää kuvia kuvapankkiin');
      input.onchange = () => upload([...input.files]); uploadLabel.append(input); fragment.append(uploadLabel);
      fragment.append(el('p', 'JPG, PNG, WebP tai AVIF · enintään 20 Mt / alkuperäinen kuva. Kuvat valmistellaan automaattisesti sivustolle.', 'studio-history-note'));
      fragment.append(el('p', 'Sivulla käytössä olevan kuvan voi poistaa, kun sen tilalle on valittu toinen kuva.', 'studio-history-note'));
    } else fragment.append(el('p', 'Poistetut kuvat säilyvät täällä palautettavina. Kuvien poistaminen näkyy heti molemmille muokkaajille.', 'studio-history-note'));
    const grid = el('div', undefined, 'studio-media-grid');
    for (const image of [...(showDeleted ? deletedImages : images)].reverse()) {
      const card = el('article', undefined, 'studio-media-card'); card.dataset.mediaId = image.id;
      const tile = showDeleted ? el('div', undefined, 'studio-media-tile') : button('', () => { draft.mediaId = image.id; if (!draft.alt) draft.alt = image.alt; render(); }, 'studio-media-tile');
      if (!showDeleted) { tile.disabled = busy || !draft; tile.setAttribute('aria-pressed', String(image.id === draft?.mediaId)); tile.setAttribute('aria-label', `Valitse kuva: ${image.name}`); }
      const thumbnail = el('img'); thumbnail.loading = 'lazy'; thumbnail.alt = ''; tile.append(thumbnail, el('span', image.name));
      card.append(tile); loadPreview(thumbnail, image);
      if (!showDeleted && image.inUse) card.append(el('small', 'Käytössä sivulla', 'studio-media-used'));
      const action = button(showDeleted ? 'Palauta' : 'Poista', () => showDeleted ? restore(image) : remove(image), 'studio-media-action');
      action.setAttribute('aria-label', `${showDeleted ? 'Palauta kuva' : 'Poista kuva'}: ${image.name}`);
      action.disabled = busy || !isConnected() || !showDeleted && image.inUse;
      if (!showDeleted && image.inUse) action.title = 'Vaihda kuvan tilalle toinen kuva ennen poistamista.';
      card.append(action); grid.append(card);
    }
    if (!grid.children.length) fragment.append(el('p', showDeleted ? 'Ei poistettuja kuvia.' : 'Kuvapankki on tyhjä. Lisää ensimmäinen kuva.', 'studio-history-note'));
    fragment.append(grid); container.replaceChildren(fragment);
  }
  document.addEventListener('click', event => {
    if (!enabled || busy || event.target.closest('[data-studio-chrome]')) return;
    const image = event.target.closest('img[data-studio-node]');
    let id = image?.dataset.studioNode;
    if (!id && !event.target.closest('.text-panel,a,button,input,summary,[data-studio-field]') && event.target.closest('.photo-chapter'))
      id = document.querySelector('.photo-backdrop img.is-active')?.dataset.studioNode;
    if (id && slots.some(slot => slot.id === id)) { event.preventDefault(); event.stopImmediatePropagation(); choose(id, false); }
  }, true);
  return { refresh, hydrate, render, choose, preload, prepareImages,
    get enabled() { return enabled; },
    setEnabled(value) {
      const opening = value && !enabled;
      enabled = value; document.body.classList.toggle('studio-images', enabled);
      document.querySelector('#studio-images').setAttribute('aria-pressed', String(enabled)); highlight();
      if (enabled) refresh().then(() => { if (opening && enabled && selected) choose(selected, false); }).catch(error => toast(error.message));
    },
    layoutChanged() { hydrate(); if (enabled) refresh().catch(error => toast(error.message)); }
  };
}
