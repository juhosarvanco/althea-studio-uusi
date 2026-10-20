// Generated from tools/public-app.js and site/gallery.js. Edit those sources and run npm run build.
(() => {
  // site/gallery.js
  function startGalleries() {
    const positions = /* @__PURE__ */ new Map();
    const tracks = /* @__PURE__ */ new Map();
    const visibleCount = (gallery) => Math.max(1, Number.parseInt(getComputedStyle(gallery).getPropertyValue("--gallery-visible"), 10) || 1);
    const render = (gallery, index = positions.get(gallery.id) || 0, preserveFocus = true, behavior = "instant") => {
      const slides = [...gallery.querySelectorAll("[data-gallery-slide]")];
      if (!slides.length) return;
      const count = visibleCount(gallery), lastStart = Math.max(0, slides.length - count);
      let current = Math.max(0, Math.min(index, lastStart));
      const focused = slides.findIndex((slide) => slide.contains(document.activeElement));
      if (preserveFocus && focused >= 0 && (focused < current || focused >= current + count)) current = Math.min(focused, lastStart);
      positions.set(gallery.id, current);
      slides.forEach((slide, i) => {
        const outside = i < current || i >= current + count;
        slide.hidden = false;
        slide.inert = outside;
        slide.setAttribute("aria-hidden", String(outside));
      });
      const counter = gallery.querySelector("[data-gallery-counter]");
      const last = Math.min(current + count, slides.length);
      if (counter) counter.textContent = `${count > 1 ? `${current + 1}\u2013${last}` : current + 1} / ${slides.length}`;
      for (const button of gallery.querySelectorAll("[data-gallery-step]"))
        button.disabled = Number(button.dataset.galleryStep) < 0 ? current === 0 : current === lastStart;
      const track = gallery.querySelector(".place-gallery-track");
      if (!track) return;
      let state = tracks.get(gallery.id);
      if (state?.track !== track) {
        clearTimeout(state?.settled);
        state?.observer?.disconnect();
        state = { track, width: track.clientWidth };
        tracks.set(gallery.id, state);
        track.addEventListener("scroll", () => {
          clearTimeout(state.settled);
          state.settled = setTimeout(() => {
            if (!track.isConnected) return;
            const stride = slides[1]?.offsetLeft - slides[0].offsetLeft;
            if (stride > 0) render(gallery, Math.round(track.scrollLeft / stride), false);
          }, 160);
        }, { passive: true });
        if (typeof ResizeObserver !== "undefined") {
          state.observer = new ResizeObserver(([entry]) => {
            if (!track.isConnected) {
              state.observer.disconnect();
              return;
            }
            if (entry.contentRect.width === state.width) return;
            state.width = entry.contentRect.width;
            render(gallery);
          });
          state.observer.observe(track);
        }
      }
      clearTimeout(state.settled);
      track.scrollTo({ left: slides[current].offsetLeft - slides[0].offsetLeft, behavior });
    };
    const step = (gallery, direction) => render(
      gallery,
      (positions.get(gallery.id) || 0) + direction,
      false,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"
    );
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      const button = event.target.closest("[data-gallery-step]");
      const gallery = button?.closest("[data-gallery]");
      if (!gallery || button.disabled) return;
      event.preventDefault();
      button.focus({ preventScroll: true });
      step(gallery, Number(button.dataset.galleryStep));
    });
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const gallery = event.target.closest("[data-gallery]");
      if (!gallery || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      step(gallery, event.key === "ArrowLeft" ? -1 : 1);
    });
    const refresh = () => document.querySelectorAll("[data-gallery]").forEach((gallery) => render(gallery));
    window.addEventListener("resize", refresh);
    refresh();
    return refresh;
  }

  // tools/contact-form.js
  async function sendContactRequest(action, data, request = fetch) {
    const endpoint = new URL(action);
    if (endpoint.origin !== "https://formsubmit.co") throw new Error("Invalid contact endpoint");
    endpoint.pathname = `/ajax${endpoint.pathname}`;
    const response = await request(endpoint.href, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: data,
      credentials: "omit",
      signal: AbortSignal.timeout(2e4)
    });
    const result = await response.json();
    if (!response.ok || ![true, "true"].includes(result.success)) throw new Error("Message was not accepted");
  }
  function startContactForm(document2, request = fetch) {
    const form = document2.querySelector("#contact-form");
    if (!form) return;
    const status = document2.querySelector("#contact-status");
    const submit = form.querySelector('[type="submit"]');
    const label = submit.textContent;
    let sending = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (sending || !form.reportValidity()) return;
      const data = new FormData(form);
      const controls = [...form.querySelectorAll("input, textarea, button")].map((control) => [control, control.disabled]);
      sending = true;
      controls.forEach(([control]) => {
        control.disabled = true;
      });
      form.setAttribute("aria-busy", "true");
      submit.textContent = "L\xE4hetet\xE4\xE4n\u2026";
      status.dataset.state = "pending";
      status.textContent = "L\xE4hetet\xE4\xE4n yhteydenottopyynt\xF6\xE4\u2026";
      try {
        await sendContactRequest(form.action, data, request);
        form.reset();
        status.dataset.state = "success";
        status.textContent = "Kiitos! Yhteydenottopyynt\xF6si on l\xE4hetetty. Vastaamme kahden arkip\xE4iv\xE4n kuluessa.";
      } catch {
        status.dataset.state = "error";
        status.textContent = "L\xE4hetys ei onnistunut. Tietosi ovat tallella lomakkeessa. Yrit\xE4 uudelleen tai l\xE4het\xE4 viesti osoitteeseen info@althea.fi.";
      } finally {
        sending = false;
        controls.forEach(([control, disabled]) => {
          control.disabled = disabled;
        });
        form.removeAttribute("aria-busy");
        submit.textContent = label;
      }
    });
  }

  // tools/public-app.js
  (() => {
    startGalleries();
    const $ = (selector) => document.querySelector(selector);
    for (const profiles of document.querySelectorAll(".profiles")) profiles.style.alignItems = "start";
    const policy = $("#policy-dialog");
    for (const button of document.querySelectorAll("[data-policy]")) button.addEventListener("click", () => {
      const privacy = button.dataset.policy === "privacy";
      $("#policy-title").textContent = privacy ? "Yhteydenottolomakkeen tietojen k\xE4sittely" : "Varaus- ja peruutusehdot";
      $("#policy-copy").textContent = privacy ? "Lomakkeella antamasi nimi, s\xE4hk\xF6postiosoite ja viesti v\xE4litet\xE4\xE4n FormSubmit-palvelun kautta osoitteeseen info@althea.fi. K\xE4yt\xE4mme tietoja yhteydenottoosi vastaamiseen ja tutustumiskeskustelun sopimiseen. FormSubmit s\xE4ilytt\xE4\xE4 lomakeviestit palvelussaan 30 p\xE4iv\xE4\xE4. \xC4l\xE4 l\xE4het\xE4 lomakkeella terveystietoja tai muita arkaluonteisia tietoja. Voit kysy\xE4 tietojesi k\xE4sittelyst\xE4 tai pyyt\xE4\xE4 niiden poistamista osoitteesta info@althea.fi." : "Yhteydenottopyynn\xF6n l\xE4hett\xE4minen ei ole varaus eik\xE4 edellyt\xE4 maksua. Ohjelman varaus- ja peruutusehdot k\xE4yd\xE4\xE4n l\xE4pi erikseen ennen varauksen vahvistamista.";
      policy.showModal();
    });
    policy.querySelector("[data-close-dialog]").addEventListener("click", () => policy.close());
    startContactForm(document);
    const menu = $(".mobile-menu");
    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) menu.open = false;
    });
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        menu.open = false;
        menu.querySelector("summary").focus();
      }
    });
    const backdrop = $(".photo-backdrop"), images = [...backdrop.querySelectorAll("img")];
    let measured = false, frame;
    const measure = (force = false) => {
      const headerHeight = $(".site-header").getBoundingClientRect().height;
      document.documentElement.style.setProperty("--header-height", headerHeight + "px");
      const y = window.scrollY;
      const footerTop = $(".site-footer").getBoundingClientRect().top;
      backdrop.style.clipPath = `inset(0 0 ${Math.max(0, window.innerHeight - footerTop)}px 0)`;
      const coverage = (panel) => {
        const rect = panel.getBoundingClientRect(), radius = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0;
        return [y + rect.top + radius - headerHeight, y + rect.bottom - radius - window.innerHeight];
      };
      const thresholds = [...document.querySelectorAll(".background-transition-panel")].map((panel) => {
        const [a, b] = coverage(panel);
        return (a + b) / 2;
      });
      const wanted = thresholds.reduce((index, threshold, i) => y >= threshold ? i + 1 : index, 0);
      const covered = [...document.querySelectorAll(".text-panel")].some((panel) => {
        const [a, b] = coverage(panel);
        return y >= a && y <= b;
      });
      if (images[wanted]?.complete && images[wanted].naturalWidth && (covered || force || !measured)) {
        images.forEach((image, index) => image.classList.toggle("is-active", index === wanted));
        backdrop.dataset.active = String(wanted);
      }
      measured = true;
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure());
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", () => requestAnimationFrame(() => measure(true)));
    const observer = new ResizeObserver(schedule);
    observer.observe($("main"));
    observer.observe($(".site-header"));
    for (const image of images) image.addEventListener("load", schedule, { once: true });
    document.fonts?.ready.then(schedule);
    measure(true);
  })();
})();
