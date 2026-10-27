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

  // tools/public-copy.js
  var copy = {
    fi: {
      privacyTitle: "Yhteydenottolomakkeen tietojen k\xE4sittely",
      privacy: "K\xE4yt\xE4mme yhteystietojasi yhteydenottoosi vastaamiseen ja tutustumiskeskustelun j\xE4rjest\xE4miseen. Ajanvarauksessa nimi, puhelinnumero, mahdollinen s\xE4hk\xF6postiosoite ja valittu aika k\xE4sitell\xE4\xE4n Cal.com-palvelussa. Varaus tallentuu yksityiseen Althea-kalenteriin iCloudissa. Ajanvarauskalenteri k\xE4ytt\xE4\xE4 Cal.comin palvelua ja sen tietosuojak\xE4yt\xE4nt\xF6\xE4. WhatsApp-linkki avaa WhatsAppin; viesti l\xE4hetet\xE4\xE4n vasta, kun l\xE4het\xE4t sen itse. WhatsApp k\xE4sittelee tietoja omien ehtojensa mukaisesti. S\xE4hk\xF6postilomakkeen nimi, s\xE4hk\xF6postiosoite ja viesti v\xE4litet\xE4\xE4n FormSubmit-palvelun kautta osoitteeseen info@althea.fi. FormSubmit s\xE4ilytt\xE4\xE4 lomakeviestit palvelussaan 30 p\xE4iv\xE4\xE4. \xC4l\xE4 l\xE4het\xE4 n\xE4iden kanavien kautta terveystietoja tai muita arkaluonteisia tietoja. Voit kysy\xE4 tietojesi k\xE4sittelyst\xE4 tai pyyt\xE4\xE4 niiden poistamista osoitteesta info@althea.fi.",
      termsTitle: "Varaus- ja peruutusehdot",
      terms: "Tutustumiskeskustelu on maksuton eik\xE4 sido osallistumaan ohjelmaan. Kalenterista varaamasi aika on varaus tutustumiskeskusteluun. Voit siirt\xE4\xE4 tai peruuttaa ajan varausvahvistuksen linkist\xE4 tai ottamalla yhteytt\xE4 osoitteeseen info@althea.fi. S\xE4hk\xF6posti- tai WhatsApp-viestin l\xE4hett\xE4minen ei varaa aikaa automaattisesti. Ohjelman varaus- ja peruutusehdot k\xE4yd\xE4\xE4n l\xE4pi erikseen ennen ohjelmavarauksen vahvistamista.",
      sending: "L\xE4hetet\xE4\xE4n\u2026",
      pending: "L\xE4hetet\xE4\xE4n yhteydenottopyynt\xF6\xE4\u2026",
      successTitle: "Kiitos yhteydenotosta!",
      success: "Palaamme sinulle pian.",
      error: "L\xE4hetys ei onnistunut. Tietosi ovat tallella lomakkeessa. Yrit\xE4 uudelleen tai l\xE4het\xE4 viesti osoitteeseen info@althea.fi."
    },
    en: {
      privacyTitle: "How we use your contact details",
      privacy: "We use your contact details to reply to your enquiry and arrange your introductory call. When you book, your name, phone number, optional email address and chosen time are processed by Cal.com. The booking is added to the private Althea calendar in iCloud. The booking calendar uses Cal.com and its privacy policy. The WhatsApp link opens WhatsApp; a message is sent only when you send it yourself. WhatsApp processes information under its own terms. The name, email address and message entered in the email form are forwarded via FormSubmit to info@althea.fi. FormSubmit retains form submissions on its servers for 30 days. Please do not send health information or other sensitive details through these channels. You can ask about how we handle your details or request their deletion by emailing info@althea.fi.",
      termsTitle: "Booking and cancellation terms",
      terms: "The introductory call is free and does not commit you to joining the programme. Selecting and confirming a time in the calendar books an introductory call. You can reschedule or cancel using the link in your booking confirmation or by contacting info@althea.fi. Sending an email or WhatsApp message does not automatically reserve a time. The programme\u2019s booking and cancellation terms will be discussed separately before a programme booking is confirmed.",
      sending: "Sending\u2026",
      pending: "Sending your request\u2026",
      successTitle: "Thank you for getting in touch!",
      success: "We\u2019ll get back to you soon.",
      error: "Your message could not be sent. Your details are still in the form. Please try again or email info@althea.fi."
    }
  };
  function publicCopy(document2) {
    return copy[document2.documentElement?.lang?.toLowerCase().split("-")[0]] || copy.fi;
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
    const copy2 = publicCopy(document2);
    const status = document2.querySelector("#contact-status");
    const submit = form.querySelector('[type="submit"]');
    const label = submit.textContent;
    let sending = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (sending || form.dataset.state === "success" || !form.reportValidity()) return;
      const data = new FormData(form);
      const controls = [...form.querySelectorAll("input, textarea, button")].map((control) => [control, control.disabled]);
      sending = true;
      controls.forEach(([control]) => {
        control.disabled = true;
      });
      form.setAttribute("aria-busy", "true");
      submit.textContent = copy2.sending;
      status.dataset.state = "pending";
      status.textContent = copy2.pending;
      try {
        await sendContactRequest(form.action, data, request);
        form.reset();
        const panel = form.closest(".contact-panel");
        const height = panel?.getBoundingClientRect?.().height;
        if (height) panel.style.minHeight = `${height}px`;
        if (panel) panel.dataset.contactState = "success";
        form.dataset.state = "success";
        for (const child of form.children) if (child !== status) child.hidden = true;
        const icon = document2.createElement("span");
        icon.className = "contact-success-icon";
        icon.setAttribute("aria-hidden", "true");
        const title = document2.createElement("span");
        title.className = "contact-success-title";
        title.textContent = copy2.successTitle;
        title.setAttribute("role", "heading");
        title.setAttribute("aria-level", "3");
        const message = document2.createElement("span");
        message.className = "contact-success-message";
        message.textContent = copy2.success;
        status.dataset.state = "success";
        status.replaceChildren(icon, title, document2.createTextNode(" "), message);
        status.setAttribute("tabindex", "-1");
        status.focus?.();
      } catch {
        status.dataset.state = "error";
        status.textContent = copy2.error;
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

  // site/contact-form.css
  var contact_form_default = '.contact-panel[data-contact-state="success"] {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.contact-panel[data-contact-state="success"] > h3 { display: none; }\n#contact-form[data-state="success"] { width: 100%; }\n#contact-status[data-state="success"] {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 16px;\n  margin: 0;\n  padding: 32px 0;\n  color: var(--ink);\n  font-size: 18px;\n  line-height: 1.7;\n  text-align: center;\n  outline: none;\n}\n.contact-success-icon {\n  display: grid;\n  place-items: center;\n  width: 60px;\n  height: 60px;\n  margin-bottom: 6px;\n  border-radius: 50%;\n  background: var(--sage);\n  color: var(--accent);\n}\n.contact-success-icon::after {\n  content: "";\n  width: 11px;\n  height: 22px;\n  border: solid currentColor;\n  border-width: 0 2px 2px 0;\n  transform: translateY(-3px) rotate(45deg);\n}\n.contact-success-title {\n  font-family: Lora, Georgia, serif;\n  font-size: clamp(24px, 2.5vw, 28px);\n  line-height: 1.3;\n  text-wrap: balance;\n}\n.contact-success-message { color: var(--body); }\n';

  // shared/site-icons.mjs
  function applySiteIcons(document2, base) {
    document2.querySelectorAll("link[data-althea-icon]").forEach((link) => link.remove());
    for (const attributes of [
      { rel: "icon", href: "favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { rel: "icon", href: "favicon-32.png", sizes: "32x32", type: "image/png" },
      { rel: "icon", href: "favicon.svg", sizes: "any", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "apple-touch-icon.png", sizes: "180x180" }
    ]) {
      const link = document2.createElement("link");
      link.setAttribute("data-althea-icon", "");
      for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, name === "href" ? base + value : value);
      document2.head.append(link);
    }
  }

  // tools/booking.js
  var bookingLinks = Object.freeze({
    fi: "team-althea-zulfrv/tutustumiskeskustelu",
    en: "team-althea-zulfrv/introductory-call"
  });
  function startBooking(document2, window2 = document2.defaultView) {
    const container = document2.querySelector("[data-booking-calendar]");
    if (!container || document2.documentElement.hasAttribute("data-studio-language")) return;
    const language = document2.documentElement.lang?.startsWith("en") ? "en" : "fi";
    const status = document2.querySelector("[data-booking-status]");
    const fail = () => {
      if (status) {
        status.hidden = false;
        status.textContent = language === "en" ? "The calendar could not load. Please contact us on WhatsApp or by email." : "Kalenteri ei latautunut. Voit ottaa yhteytt\xE4 WhatsAppilla tai s\xE4hk\xF6postilla.";
      }
    };
    if (!window2.Cal) {
      window2.Cal = function() {
        const cal = window2.Cal, args = arguments;
        if (!cal.loaded) {
          cal.ns = {};
          cal.q = [];
          const script = document2.createElement("script");
          script.src = "https://app.cal.com/embed/embed.js";
          script.onerror = fail;
          document2.head.append(script);
          cal.loaded = true;
        }
        if (args[0] === "init") {
          const namespace2 = args[1], api2 = function() {
            api2.q.push(arguments);
          };
          api2.q = [];
          cal.ns[namespace2] = cal.ns[namespace2] || api2;
          cal.ns[namespace2].q.push(args);
          cal.q.push(["initNamespace", namespace2]);
          return;
        }
        cal.q.push(args);
      };
    }
    const Cal = window2.Cal, namespace = `althea-${language}`;
    Cal("init", namespace, { origin: "https://app.cal.com" });
    Cal.config = Cal.config || {};
    Cal.config.forwardQueryParams = false;
    const api = Cal.ns[namespace];
    api("on", { action: "linkReady", callback: () => {
      if (status) status.hidden = true;
    } });
    api("on", { action: "linkFailed", callback: fail });
    api("inline", {
      elementOrSelector: "#althea-booking-calendar",
      calLink: bookingLinks[language],
      config: { layout: "month_view", useSlotsViewOnSmallScreen: "false", theme: "light" }
    });
    api("ui", {
      theme: "light",
      cssVarsPerTheme: { light: { "cal-brand": "#0d1f29" } },
      hideEventTypeDetails: true,
      showTimezoneWhenEventDetailsHidden: false,
      useSlotsViewOnSmallScreen: false,
      layout: "month_view"
    });
  }

  // tools/email-dialog.js
  var started = /* @__PURE__ */ new WeakSet();
  function startEmailDialog(document2) {
    if (started.has(document2)) return;
    started.add(document2);
    let trigger;
    document2.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-open-contact-email]");
      const dialog = document2.querySelector("#contact-email-dialog");
      if (!dialog) return;
      if (opener && typeof dialog.showModal === "function") {
        event.preventDefault();
        trigger = opener;
        if (!dialog.open) dialog.showModal();
        document2.documentElement.classList.add("contact-email-open");
      } else if (event.target.closest("[data-close-contact-email]")) {
        dialog.close();
      } else if (event.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
      }
    }, true);
    document2.addEventListener("close", (event) => {
      if (event.target.id !== "contact-email-dialog") return;
      document2.documentElement.classList.remove("contact-email-open");
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    }, true);
  }

  // tools/public-app.js
  (() => {
    const appURL = document.currentScript?.src || document.querySelector('script[src$="app.js"]')?.src || document.baseURI;
    applySiteIcons(document, new URL(".", appURL).href);
    const confirmationStyles = document.createElement("style");
    confirmationStyles.textContent = contact_form_default;
    document.head.append(confirmationStyles);
    startGalleries();
    const $ = (selector) => document.querySelector(selector);
    const copy2 = publicCopy(document);
    for (const profiles of document.querySelectorAll(".profiles")) profiles.style.alignItems = "start";
    const policy = $("#policy-dialog");
    for (const button of document.querySelectorAll("[data-policy]")) button.addEventListener("click", () => {
      const privacy = button.dataset.policy === "privacy";
      $("#policy-title").textContent = privacy ? copy2.privacyTitle : copy2.termsTitle;
      $("#policy-copy").textContent = privacy ? copy2.privacy : copy2.terms;
      policy.showModal();
    });
    policy.querySelector("[data-close-dialog]").addEventListener("click", () => policy.close());
    startContactForm(document);
    startEmailDialog(document);
    startBooking(document);
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
