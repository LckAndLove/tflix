/* ───────────────────────────────────────────────────────────────
   TFLIX Desktop — Tauri Webview initialization script

   Adds two desktop-only touches to the TFLIX site:
     • a small version label in the lower-left corner of browse pages
     • back-navigation state restore (rebuilds the open poster + scroll position on Back)
     • ad pop-up suppression (blocks window.open / popunder ads)
   ─────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var APP_VERSION = '1.1.2';

  // Override window.open in top frame and iframes to block popunder ads.
  // If the target is the Support link, redirect top location so Rust on_navigation opens it in the system browser.
  var origOpen = window.open;
  window.open = function (url) {
    if (url && typeof url === 'string' && url.indexOf('https://github.com/TomasTNunes/tflix') === 0) {
      window.location.href = url;
    }
    return null;
  };

  // Only inject DOM features into the TOP frame — never inside third-party stream embeds.
  if (window.top !== window.self) return;

  var VER_ID = 'tflix-version-label';

  function onStreamPage() {
    return /^\/stream(\/|$)/.test(window.location.pathname);
  }

  /* ─── Version label (lower-left corner of browse pages) ─── */
  function injectVersion() {
    if (onStreamPage()) return;
    if (document.getElementById(VER_ID)) return;
    if (!document.body) return;

    var label = document.createElement('div');
    label.id = VER_ID;
    label.textContent = 'v' + APP_VERSION;

    Object.assign(label.style, {
      position: 'fixed',
      left: '14px',
      bottom: '12px',
      fontSize: '11px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      letterSpacing: '0.3px',
      color: 'rgba(244,244,247,0.35)',
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: '2147483646',
      opacity: '0',
      transition: 'opacity .25s'
    });

    document.body.appendChild(label);

    var atBottom = function () {
      var scrolled = window.scrollY + window.innerHeight;
      return scrolled >= document.documentElement.scrollHeight - 2;
    };
    var isScrollable = function () {
      return document.documentElement.scrollHeight > window.innerHeight + 2;
    };
    var modalOpen = function () {
      return !!document.querySelector('#modal-backdrop.open');
    };
    var searchOpen = function () {
      return !!document.querySelector('#search-results-section.visible');
    };

    var settled = false;

    var update = function () {
      var show =
        !modalOpen() &&
        !searchOpen() &&
        atBottom() &&
        (isScrollable() || settled);
      label.style.opacity = show ? '1' : '0';
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });

    var mo = new MutationObserver(update);
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    var settle = function () { settled = true; update(); };
    if (document.readyState === 'complete') setTimeout(settle, 1200);
    else window.addEventListener('load', function () { setTimeout(settle, 1200); });

    update();
  }

  /* ─── Back-navigation state restore ─── */
  var KEY = 'tflix_return';

  function initHistoryCapture() {
    if (onStreamPage()) {
      document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('#logo')) {
          try { sessionStorage.removeItem(KEY); } catch (err) {}
        }
      }, true);
      return;
    }

    document.addEventListener('click', function (e) {
      if (!(e.target.closest && e.target.closest('#modal-watch-btn'))) return;
      try {
        var item = (typeof currentModalItem !== 'undefined') ? currentModalItem : null;
        if (!item) return;
        var ss = document.getElementById('season-select');
        var es = document.getElementById('episode-select');
        var input = document.getElementById('search');
        var results = document.getElementById('search-results-section');
        var isSearch = !!(results && results.classList.contains('visible'));
        var activeTab = document.querySelector('.filter-tab.active');
        sessionStorage.setItem(KEY, JSON.stringify({
          scrollY: window.scrollY,
          item: item,
          season: ss ? parseInt(ss.value || 1, 10) : 1,
          episode: es ? parseInt(es.value || 1, 10) : 1,
          search: (isSearch && input) ? input.value.trim() : null,
          filter: activeTab ? activeTab.dataset.filter : 'all'
        }));
      } catch (err) {}
    }, true);

    window.addEventListener('pageshow', function (e) {
      if (e.persisted) { try { sessionStorage.removeItem(KEY); } catch (err) {} }
    });

    function restoreScroll(targetY, done) {
      if (!targetY) { if (done) done(); return; }
      var deadline = Date.now() + 6000;
      (function step() {
        window.scrollTo(0, targetY);
        if (window.scrollY >= targetY - 2 || Date.now() >= deadline) { if (done) done(); return; }
        requestAnimationFrame(step);
      })();
    }

    function reopenModal(saved) {
      if (typeof openModal !== 'function') return Promise.resolve();
      return Promise.resolve(openModal(saved.item)).then(function () {
        var type = (typeof mediaOf === 'function') ? mediaOf(saved.item) : saved.item.media_type;
        if (type !== 'tv') return;
        var ss = document.getElementById('season-select');
        if (ss && saved.season != null) {
          ss.value = saved.season;
          if (typeof updateEpisodes === 'function') {
            return Promise.resolve(updateEpisodes(saved.item.id)).then(function () {
              var e2 = document.getElementById('episode-select');
              if (e2 && saved.episode != null) e2.value = saved.episode;
            });
          }
        }
        var es = document.getElementById('episode-select');
        if (es && saved.episode != null) es.value = saved.episode;
      });
    }

    function settleScroll(saved) {
      var backdrop = document.getElementById('modal-backdrop');
      document.body.style.overflow = '';
      restoreScroll(saved.scrollY, function () {
        if (backdrop && backdrop.classList.contains('open')) document.body.style.overflow = 'hidden';
      });
    }

    function restore() {
      var saved = null;
      try { saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (err) {}
      try { sessionStorage.removeItem(KEY); } catch (err) {}
      if (!saved || !saved.item) return;

      var bgReady;
      if (saved.search && typeof doSearch === 'function') {
        var input = document.getElementById('search');
        if (input) input.value = saved.search;
        var clearBtn = document.getElementById('search-clear');
        if (clearBtn) clearBtn.classList.add('visible');
        var filter = saved.filter || 'all';
        document.querySelectorAll('.filter-tab').forEach(function (t) {
          t.classList.toggle('active', t.dataset.filter === filter);
        });
        try { if (typeof currentFilter !== 'undefined') currentFilter = filter; } catch (err) {}
        bgReady = Promise.resolve(doSearch(saved.search));
      } else {
        bgReady = Promise.resolve();
      }

      reopenModal(saved).then(function () {
        bgReady.then(function () { settleScroll(saved); });
      });
    }

    restore();
  }

  function initAll() {
    injectVersion();
    initHistoryCapture();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
