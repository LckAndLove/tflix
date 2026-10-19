/* ───────────────────────────────────────────────────────────────
   TFLIX Desktop — Tauri Webview initialization script

   Adds two desktop-only touches to the TFLIX site:
     • a small version label in the lower-left corner of browse pages
     • back-navigation state restore (rebuilds the open poster + scroll position on Back)
     • ad pop-up suppression (blocks window.open / popunder ads)
   ─────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var APP_VERSION = '1.3.0';

  // Override window.open in top frame and iframes to block popunder ads.
  // If the target is the Support link, redirect top location so Rust on_navigation opens it in the system browser.
  var origOpen = window.open;
  window.open = function (url) {
    if (url && typeof url === 'string' && (url.indexOf('https://github.com/LckAndLove/tflix') === 0 || url.indexOf('https://github.com/TomasTNunes/tflix') === 0)) {
      window.location.href = url;
    }
    return null;
  };

  // Intercept fetch to api.themoviedb.org to ensure language parameter matches user preference
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (resource, init) {
      if (typeof resource === 'string' && resource.indexOf('api.themoviedb.org') !== -1) {
        try {
          var lang = localStorage.getItem('tflix_lang') || ((navigator.language && navigator.language.toLowerCase().indexOf('zh') === 0) ? 'zh' : 'en');
          var tmdbLang = lang === 'zh' ? 'zh-CN' : 'en-US';
          var url = new URL(resource);
          if (!url.searchParams.has('language') || url.searchParams.get('language') !== tmdbLang) {
            url.searchParams.set('language', tmdbLang);
            resource = url.toString();
          }
        } catch (e) {}
      }
      return origFetch.apply(this, arguments);
    };
  }

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
    label.title = '检查更新 / Check for updates';

    Object.assign(label.style, {
      position: 'fixed',
      left: '14px',
      bottom: '12px',
      fontSize: '11px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      letterSpacing: '0.3px',
      color: 'rgba(244,244,247,0.35)',
      cursor: 'pointer',
      pointerEvents: 'auto',
      userSelect: 'none',
      zIndex: '2147483646',
      opacity: '0',
      transition: 'opacity .25s, color .2s'
    });

    label.addEventListener('mouseenter', function () {
      label.style.color = 'rgba(244,244,247,0.85)';
    });
    label.addEventListener('mouseleave', function () {
      label.style.color = 'rgba(244,244,247,0.35)';
    });
    label.addEventListener('click', function () {
      if (typeof window.checkForUpdates === 'function') {
        window.checkForUpdates(true);
      }
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

  function injectFallbackLangToggle() {
    if (document.getElementById('lang-wrap') || document.getElementById('lang-btn') || document.getElementById('tauri-lang-toggle')) return;
    var container = document.querySelector('.nav-right') || document.querySelector('header');
    if (!container) return;

    var curLang = localStorage.getItem('tflix_lang') || ((navigator.language && navigator.language.toLowerCase().indexOf('zh') === 0) ? 'zh' : 'en');

    var btn = document.createElement('button');
    btn.id = 'tauri-lang-toggle';
    btn.title = 'Language / 语言';
    btn.style.cursor = 'pointer';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '6px';
    btn.style.padding = '0.45rem 0.8rem';
    btn.style.borderRadius = '99px';
    btn.style.background = 'rgba(255,255,255,0.06)';
    btn.style.border = '1px solid rgba(255,255,255,0.12)';
    btn.style.color = '#f4f4f7';
    btn.style.fontSize = '0.8rem';
    btn.style.fontWeight = '700';

    btn.innerHTML = '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span>' + (curLang === 'zh' ? '中' : 'EN') + '</span>';

    btn.addEventListener('click', function () {
      var next = (curLang === 'zh' ? 'en' : 'zh');
      localStorage.setItem('tflix_lang', next);
      window.location.reload();
    });

    if (container.firstChild) {
      container.insertBefore(btn, container.firstChild);
    } else {
      container.appendChild(btn);
    }
  }

  function initAll() {
    injectVersion();
    injectFallbackLangToggle();
    initHistoryCapture();
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
