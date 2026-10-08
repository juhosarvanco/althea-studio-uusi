// Generated from tools/public-app.js and site/gallery.js. Edit those sources and run npm run build.
(() => {
  // site/gallery.js
  function startGalleries() {
    const positions = /* @__PURE__ */ new Map();
    const visibleCount = (gallery) => Math.max(1, Number.parseInt(getComputedStyle(gallery).getPropertyValue("--gallery-visible"), 10) || 1);
    const render = (gallery, index = positions.get(gallery.id) || 0, preserveFocus = true) => {
      const slides = [...gallery.querySelectorAll("[data-gallery-slide]")];
      if (!slides.length) return;
      const count = visibleCount(gallery), pages = Math.ceil(slides.length / count);
      const page = Math.floor(index / count);
      let current = (page % pages + pages) % pages * count;
      const focused = slides.findIndex((slide) => slide.contains(document.activeElement));
      if (preserveFocus && focused >= 0 && (focused < current || focused >= current + count)) current = Math.floor(focused / count) * count;
      positions.set(gallery.id, current);
      slides.forEach((slide, i) => {
        slide.hidden = i < current || i >= current + count;
      });
      const counter = gallery.querySelector("[data-gallery-counter]");
      const last = Math.min(current + count, slides.length);
      if (counter) counter.textContent = `${count > 1 ? `${current + 1}\u2013${last}` : current + 1} / ${slides.length}`;
      for (const button of gallery.querySelectorAll("[data-gallery-step]")) button.disabled = pages < 2;
    };
    const step = (gallery, direction) => render(gallery, (positions.get(gallery.id) || 0) + direction * visibleCount(gallery), false);
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      const button = event.target.closest("[data-gallery-step]");
      const gallery = button?.closest("[data-gallery]");
      if (!gallery) return;
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

  // tools/public-app.js
  (() => {
    startGalleries();
    const $ = (selector) => document.querySelector(selector);
    for (const profiles of document.querySelectorAll(".profiles")) profiles.style.alignItems = "start";
    const policy = $("#policy-dialog");
    for (const button of document.querySelectorAll("[data-policy]")) button.addEventListener("click", () => {
      const privacy = button.dataset.policy === "privacy";
      $("#policy-title").textContent = privacy ? "Tietojen k\xE4sittely t\xE4ss\xE4 esikatselussa" : "Varaus- ja peruutusehdot";
      $("#policy-copy").textContent = privacy ? "T\xE4m\xE4 on Althean uusi ty\xF6versio. Yhteydenottolomake ei l\xE4het\xE4 viestej\xE4 tai tee varauksia. Viestiluonnoksen voit halutessasi ladata omalle koneellesi. Studion muokkaus edellytt\xE4\xE4 kirjautumista ja tallentuu erilliseen yhteiseen ty\xF6versioon. Lopullinen tietosuojaseloste lis\xE4t\xE4\xE4n ennen yhteydenottolomakkeen k\xE4ytt\xF6\xF6nottoa." : "T\xE4ss\xE4 luonnoksessa ei tehd\xE4 varauksia tai maksuja. Lopulliset varaus- ja peruutusehdot lis\xE4t\xE4\xE4n ennen ohjelman myynti\xE4. Ohjelman nykyisess\xE4 kuvauksessa maksu jakautuu varausmaksuun ja loppumaksuun, joka maksetaan 14 p\xE4iv\xE4\xE4 ennen kokemusta.";
      policy.showModal();
    });
    const form = $("#contact-form");
    let message = "";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      message = `Tutustumiskeskustelupyynt\xF6 \u2013 Althea

Nimi: ${String(data.get("name")).trim()}
S\xE4hk\xF6posti: ${String(data.get("email")).trim()}

${String(data.get("message") || "").trim()}`;
      $("#message-preview").textContent = message;
      $("#contact-result").hidden = false;
      $("#contact-status").textContent = "Viestiluonnos on valmis. Viesti\xE4 ei ole l\xE4hetetty.";
      const address = $("[data-contact-email]")?.getAttribute("href")?.replace(/^mailto:/, "") || "", emailLink = $("#open-email");
      emailLink.hidden = !address;
      if (address) emailLink.href = `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent("Tutustumiskeskustelupyynt\xF6 \u2013 Althea")}&body=${encodeURIComponent(message)}`;
      $("#contact-result").scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    $("#download-message").addEventListener("click", () => {
      if (!message) return;
      const url = URL.createObjectURL(new Blob([message], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "althea-viestiluonnos.txt";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    });
    $("#reset-message").addEventListener("click", () => {
      form.reset();
      $("#contact-result").hidden = true;
      $("#message-preview").textContent = "";
      $("#contact-status").textContent = "";
      message = "";
      $("#contact-name").focus();
    });
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
