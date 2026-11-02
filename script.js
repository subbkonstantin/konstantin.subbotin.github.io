(() => {
  'use strict';

  /* ---------------- Theme (dark / light) ---------------- */

  const root = document.body;
  const themeToggle = document.getElementById('darkModeToggle');
  const THEME_KEY = 'cv-theme';

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    root.classList.toggle('dark-mode', isDark);
    themeToggle.setAttribute('aria-checked', String(isDark));
    nudgeGlassRepaint();
  }

  // Safari has a documented rendering bug: when a background (a plain
  // color, a gradient, or something sampled by backdrop-filter) is driven
  // by a CSS custom property, and only that custom property changes — not
  // the background/backdrop-filter property itself — Safari can leave the
  // old raster on screen even though getComputedStyle correctly reports
  // the new value. Confirmed on this project: computed --bg-a and the
  // computed background-image both flip to the correct dark colors, but
  // the painted pixels stay light. Plain (non-background) properties like
  // text color repaint fine, which is why only the backgrounds looked
  // "stuck".
  //
  // A synchronous reflow (forcing layout via offsetHeight) isn't always
  // enough to invalidate Safari's compositor raster for a GPU layer — it
  // only guarantees layout is up to date, not that the layer's bitmap was
  // re-drawn. A tiny, visually-imperceptible opacity change, applied and
  // then reverted across two real animation frames, reliably forces
  // Safari to recomposite the layer with fresh pixels. This is a standard
  // workaround for this class of WebKit repaint bug and is a no-op on
  // Chrome/Firefox (they already repaint correctly on the very next
  // frame, so the opacity blip has already been reverted before anyone
  // could see it).
  function forceRepaint(el) {
    const prevOpacity = el.style.opacity;
    el.style.opacity = prevOpacity ? String(Math.max(0, Math.min(1, parseFloat(prevOpacity) - 0.0001))) : '0.9999';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = prevOpacity;
      });
    });
  }

  function nudgeGlassRepaint() {
    void document.body.offsetHeight;
    forceRepaint(document.body);
    document.querySelectorAll(
      '.blob-field, .blob-a, .blob-b, .blob-c, .window, .tabs-button, .dark-mode-toggle, .to-top, .dock-chip, .toc-drawer, .toc-backdrop, .max-backdrop'
    ).forEach(forceRepaint);
  }

  function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function storeTheme(theme) {
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
  }

  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = getStoredTheme() || (prefersDark ? 'dark' : 'light');
  applyTheme(initialTheme);

  themeToggle.addEventListener('click', () => {
    const next = root.classList.contains('dark-mode') ? 'light' : 'dark';
    applyTheme(next);
    storeTheme(next);
  });

  /* ---------------- Toast helper ---------------- */

  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2200);
  }

  /* ---------------- TOC drawer ---------------- */

  const tabsButton = document.getElementById('tabsButton');
  const tocDrawer = document.getElementById('tocDrawer');
  const tocBackdrop = document.getElementById('tocBackdrop');
  const tocClose = document.getElementById('tocClose');

  function openToc() {
    // Only one overlay at a time: a maximized window and the TOC drawer
    // both claim "focused" screen space, so opening one must close the
    // other rather than stacking two modal layers on top of each other.
    closeMaximizeIfAny();
    tocDrawer.hidden = false;
    tocBackdrop.hidden = false;
    tabsButton.setAttribute('aria-expanded', 'true');
    tocClose.focus();
  }
  function closeToc() {
    tocDrawer.hidden = true;
    tocBackdrop.hidden = true;
    tabsButton.setAttribute('aria-expanded', 'false');
    tabsButton.focus();
  }
  tabsButton.addEventListener('click', openToc);
  tocClose.addEventListener('click', closeToc);
  tocBackdrop.addEventListener('click', closeToc);
  tocDrawer.querySelectorAll('a').forEach(a => a.addEventListener('click', closeToc));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !tocDrawer.hidden) closeToc();
  });

  /* ---------------- Window controls ---------------- */

  const windows = Array.from(document.querySelectorAll('.window'));
  const dock = document.getElementById('dock');
  const maxBackdrop = document.getElementById('maxBackdrop');
  let maximizedWindow = null;

  function windowTitle(win) {
    return win.dataset.title || 'Window';
  }

  function closeWindow(win) {
    if (win.dataset.noClose === 'true') {
      showToast("You can't close the intro — but nice try 🙂");
      win.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
        { duration: 220 }
      );
      return;
    }
    // If this window is currently maximized, exit that state first —
    // otherwise the dimmed backdrop is left stranded on screen with the
    // window that would normally dismiss it now hidden (display:none).
    if (maximizedWindow === win) closeMaximize(win);
    win.classList.add('is-closed');
    addDockChip(win);
  }

  function addDockChip(win) {
    const chip = document.createElement('button');
    chip.className = 'dock-chip';
    chip.type = 'button';
    chip.innerHTML = `<span aria-hidden="true">${windowTitle(win).split(' ')[0]}</span> Reopen ${windowTitle(win).replace(/^\S+\s*/, '')}`;
    chip.addEventListener('click', () => {
      win.classList.remove('is-closed');
      chip.remove();
      win.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    dock.appendChild(chip);
  }

  function toggleMinimize(win) {
    // Real macOS semantics: the yellow dot always sends the window away,
    // regardless of whether it's currently zoomed. So exit maximize first
    // rather than leaving a floating, collapsed card sitting on top of a
    // dimmed backdrop — that combination was never designed/tested for.
    if (maximizedWindow === win) closeMaximize(win);
    win.classList.toggle('is-minimized');
    const btn = win.querySelector('[data-action="minimize"]');
    if (btn) btn.setAttribute('aria-pressed', String(win.classList.contains('is-minimized')));
  }

  function openMaximize(win) {
    if (maximizedWindow) closeMaximize(maximizedWindow);
    // Only one overlay at a time — see the matching guard in openToc().
    if (!tocDrawer.hidden) closeToc();
    win.classList.remove('is-minimized');
    win.classList.add('is-maximized');
    maxBackdrop.hidden = false;
    maximizedWindow = win;
    const closeBtn = win.querySelector('[data-action="maximize"]');
    if (closeBtn) closeBtn.focus();
  }
  function closeMaximize(win) {
    win.classList.remove('is-maximized');
    maxBackdrop.hidden = true;
    maximizedWindow = null;
  }
  // Plain function declaration (hoisted to the top of this IIFE's scope),
  // so openToc() — defined earlier in the file — can call it safely
  // regardless of source order.
  function closeMaximizeIfAny() {
    if (maximizedWindow) closeMaximize(maximizedWindow);
  }
  maxBackdrop.addEventListener('click', () => { if (maximizedWindow) closeMaximize(maximizedWindow); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && maximizedWindow) closeMaximize(maximizedWindow);
  });

  function resetWindow(win) {
    win.classList.remove('is-minimized');
    if (win.classList.contains('is-closed')) {
      win.classList.remove('is-closed');
      const chip = Array.from(dock.children).find(c => c.textContent.includes(windowTitle(win).replace(/^\S+\s*/, '')));
      if (chip) chip.remove();
    }
    if (maximizedWindow === win) closeMaximize(win);
    win.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function focusNeighbor(win, dir) {
    const visible = windows.filter(w => !w.classList.contains('is-closed'));
    const idx = visible.indexOf(win);
    const target = visible[idx + dir];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  windows.forEach((win) => {
    win.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'close') closeWindow(win);
        else if (action === 'minimize') toggleMinimize(win);
        else if (action === 'maximize') {
          win.classList.contains('is-maximized') ? closeMaximize(win) : openMaximize(win);
        } else if (action === 'prev') focusNeighbor(win, -1);
        else if (action === 'next') focusNeighbor(win, 1);
        else if (action === 'reset') resetWindow(win);
      });
    });
  });

  /* ---------------- Back to top ---------------- */

  const toTopBtn = document.getElementById('toTop');
  const TO_TOP_THRESHOLD = 480;
  let toTopTicking = false;

  function updateToTopVisibility() {
    toTopTicking = false;
    toTopBtn.classList.toggle('is-visible', window.scrollY > TO_TOP_THRESHOLD);
  }
  window.addEventListener('scroll', () => {
    if (!toTopTicking) {
      toTopTicking = true;
      requestAnimationFrame(updateToTopVisibility);
    }
  }, { passive: true });
  updateToTopVisibility();

  toTopBtn.addEventListener('click', () => {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    // Move focus to the skip target so keyboard/screen-reader users land
    // back at a sensible spot, not just visually at the top.
    const nameHeading = document.querySelector('.contactsLinksName-h1');
    if (nameHeading) {
      nameHeading.setAttribute('tabindex', '-1');
      nameHeading.focus({ preventScroll: true });
    }
  });

  /* ---------------- Liquid glass specular tracking ---------------- */
  /* Moves a light-catching highlight to follow the pointer on each
     window, like real glass reacting to where you're looking.
     Skipped on touch devices and for users who prefer reduced motion. */

  const supportsHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (supportsHover && !prefersReducedMotion) {
    let rafPending = false;
    let pendingEvent = null;

    function applySpecular() {
      rafPending = false;
      if (!pendingEvent) return;
      const { target, clientX, clientY } = pendingEvent;
      const win = target.closest('.window');
      if (!win) return;
      const rect = win.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      win.style.setProperty('--mx', x + '%');
      win.style.setProperty('--my', y + '%');
    }

    windows.forEach((win) => {
      win.addEventListener('pointermove', (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        pendingEvent = e;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(applySpecular);
        }
      });
    });
  }
})();
