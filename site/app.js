(() => {
  import('./gallery.js').then(({ startGalleries }) => startGalleries());
  const $ = selector => document.querySelector(selector);
  // Each biography expands its own card, without stretching the adjacent card.
  for (const profiles of document.querySelectorAll('.profiles')) profiles.style.alignItems = 'start';
  const policy = $('#policy-dialog');
  for (const button of document.querySelectorAll('[data-policy]')) button.addEventListener('click', () => {
    const privacy = button.dataset.policy === 'privacy';
    $('#policy-title').textContent = privacy ? 'Tietojen käsittely tässä esikatselussa' : 'Varaus- ja peruutusehdot';
    $('#policy-copy').textContent = privacy
      ? 'Tämä on Althean uusi työversio. Yhteydenottolomake ei lähetä viestejä tai tee varauksia. Viestiluonnoksen voit halutessasi ladata omalle koneellesi. Studion muokkaus edellyttää kirjautumista ja tallentuu erilliseen yhteiseen työversioon. Lopullinen tietosuojaseloste lisätään ennen yhteydenottolomakkeen käyttöönottoa.'
      : 'Tässä luonnoksessa ei tehdä varauksia tai maksuja. Lopulliset varaus- ja peruutusehdot lisätään ennen ohjelman myyntiä. Ohjelman nykyisessä kuvauksessa maksu jakautuu varausmaksuun ja loppumaksuun, joka maksetaan 14 päivää ennen kokemusta.';
    policy.showModal();
  });

  const form = $('#contact-form');
  let message = '';
  form.addEventListener('submit', event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const data = new FormData(form);
    message = `Tutustumiskeskustelupyyntö – Althea\n\nNimi: ${String(data.get('name')).trim()}\nSähköposti: ${String(data.get('email')).trim()}\n\n${String(data.get('message') || '').trim()}`;
    $('#message-preview').textContent = message;
    $('#contact-result').hidden = false;
    $('#contact-status').textContent = 'Viestiluonnos on valmis. Viestiä ei ole lähetetty.';
    const address = $('[data-contact-email]')?.getAttribute('href')?.replace(/^mailto:/, '') || '', emailLink = $('#open-email');
    emailLink.hidden = !address;
    if (address) emailLink.href = `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent('Tutustumiskeskustelupyyntö – Althea')}&body=${encodeURIComponent(message)}`;
    $('#contact-result').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('#download-message').addEventListener('click', () => {
    if (!message) return;
    const url = URL.createObjectURL(new Blob([message], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'althea-viestiluonnos.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#reset-message').addEventListener('click', () => {
    form.reset(); $('#contact-result').hidden = true; $('#message-preview').textContent = ''; $('#contact-status').textContent = ''; message = ''; $('#contact-name').focus();
  });

  const menu = $('.mobile-menu');
  menu.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; });
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { menu.open = false; menu.querySelector('summary').focus(); } });

  // One fixed image at a time. Switch only behind a panel covering the viewport.
  const backdrop = $('.photo-backdrop'), images = [...backdrop.querySelectorAll('img')];
  let measured = false, frame;
  const measure = (force = false) => {
    const headerHeight = $('.site-header').getBoundingClientRect().height;
    document.documentElement.style.setProperty('--header-height', headerHeight + 'px');
    const y = window.scrollY;
    const coverage = panel => { const rect = panel.getBoundingClientRect(), radius = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0; return [y + rect.top + radius - headerHeight, y + rect.bottom - radius - window.innerHeight]; };
    const thresholds = [...document.querySelectorAll('.background-transition-panel')].map(panel => { const [a, b] = coverage(panel); return (a + b) / 2; });
    const wanted = thresholds.reduce((index, threshold, i) => y >= threshold ? i + 1 : index, 0);
    const covered = [...document.querySelectorAll('.text-panel')].some(panel => { const [a, b] = coverage(panel); return y >= a && y <= b; });
    if (images[wanted]?.complete && images[wanted].naturalWidth && (covered || force || !measured)) {
      images.forEach((image, index) => image.classList.toggle('is-active', index === wanted)); backdrop.dataset.active = String(wanted);
    }
    measured = true;
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => measure()); };
  window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', () => requestAnimationFrame(() => measure(true)));
  const observer = new ResizeObserver(schedule); observer.observe($('main')); observer.observe($('.site-header'));
  for (const image of images) image.addEventListener('load', schedule, { once: true });
  document.fonts?.ready.then(schedule); measure(true);
})();
