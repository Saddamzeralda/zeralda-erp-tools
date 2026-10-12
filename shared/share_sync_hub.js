/* Shared communication hub: replaces legacy export flows with Email sharing
 * and adds simple helpers for daily sync triggers.
 */
(function () {
  'use strict';

  var CHANNEL_MODAL_ID = 'zeralda-share-channel-modal';
  var CHANNEL_MODAL_STYLE_ID = 'zeralda-share-channel-style';

  function safeString(value) {
    return value == null ? '' : String(value);
  }

  function getLang() {
    var lang = safeString(ZS.getItem('preferred-language') || 'en').toLowerCase();
    return (lang === 'ar' || lang === 'fr') ? lang : 'en';
  }

  function t(key) {
    var lang = getLang();
    var dict = {
      title: { en: 'Share via Email', ar: 'مشاركة عبر البريد', fr: 'Partager par email' },
      subtitle: { en: 'Send using email.', ar: 'أرسل عبر البريد الإلكتروني.', fr: 'Envoyer par email.' },
      email: { en: 'Email', ar: 'البريد الإلكتروني', fr: 'Email' },
      cancel: { en: 'Cancel', ar: 'إلغاء', fr: 'Annuler' }
    };
    if (!dict[key]) return key;
    return dict[key][lang] || dict[key].en;
  }

  function ensureChannelModal() {
    if (!document.getElementById(CHANNEL_MODAL_STYLE_ID)) {
      var style = document.createElement('style');
      style.id = CHANNEL_MODAL_STYLE_ID;
      style.textContent = '' +
        '.z-share-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:none;align-items:center;justify-content:center;z-index:99999;}' +
        '.z-share-card{width:min(420px,calc(100% - 24px));background:#fff;border-radius:14px;padding:16px;box-shadow:0 18px 42px rgba(0,0,0,.22);font-family:Segoe UI,Tahoma,sans-serif;}' +
        '.z-share-title{margin:0 0 6px 0;font-size:18px;color:#111827;}' +
        '.z-share-sub{margin:0 0 12px 0;font-size:13px;color:#6b7280;}' +
        '.z-share-grid{display:grid;grid-template-columns:1fr;gap:8px;}' +
        '.z-share-btn{border:1px solid #d1d5db;background:#fff;color:#111827;padding:10px;border-radius:10px;cursor:pointer;font-weight:600;}' +
        '.z-share-btn:hover{background:#f9fafb;}' +
        '.z-share-btn-primary{border-color:#16a34a;color:#166534;}' +
        '.z-share-cancel{margin-top:10px;width:100%;border:1px solid #e5e7eb;background:#fff;padding:9px;border-radius:9px;cursor:pointer;}' +
        '@media(max-width:520px){.z-share-grid{grid-template-columns:1fr;}}';
      document.head.appendChild(style);
    }

    if (!document.getElementById(CHANNEL_MODAL_ID)) {
      var overlay = document.createElement('div');
      overlay.id = CHANNEL_MODAL_ID;
      overlay.className = 'z-share-overlay';
      overlay.innerHTML = '' +
        '<div class="z-share-card" role="dialog" aria-modal="true">' +
          '<h3 class="z-share-title" id="zShareTitle"></h3>' +
          '<p class="z-share-sub" id="zShareSub"></p>' +
          '<div class="z-share-grid">' +
            '<button type="button" class="z-share-btn z-share-btn-primary" data-channel="email"></button>' +
          '</div>' +
          '<button type="button" class="z-share-cancel" data-channel="cancel"></button>' +
        '</div>';
      document.body.appendChild(overlay);
    }
  }

  function renderChannelModalText() {
    var overlay = document.getElementById(CHANNEL_MODAL_ID);
    if (!overlay) return;
    var title = overlay.querySelector('#zShareTitle');
    var sub = overlay.querySelector('#zShareSub');
    if (title) title.textContent = t('title');
    if (sub) sub.textContent = t('subtitle');
    var emailBtn = overlay.querySelector('[data-channel="email"]');
    var cancelBtn = overlay.querySelector('[data-channel="cancel"]');
    if (emailBtn) emailBtn.textContent = t('email');
    if (cancelBtn) cancelBtn.textContent = t('cancel');
  }

  function chooseChannel() {
    ensureChannelModal();
    renderChannelModalText();

    return new Promise(function (resolve) {
      var overlay = document.getElementById(CHANNEL_MODAL_ID);
      if (!overlay) {
        resolve(null);
        return;
      }

      overlay.style.display = 'flex';
      var cleanup = function () {
        overlay.style.display = 'none';
        overlay.removeEventListener('click', onClick);
      };

      var onClick = function (event) {
        var target = event.target;
        if (!(target instanceof Element)) return;
        var btn = target.closest('[data-channel]');
        if (!btn) {
          if (target === overlay) {
            cleanup();
            resolve(null);
          }
          return;
        }
        var channel = safeString(btn.getAttribute('data-channel')).toLowerCase();
        cleanup();
        resolve(channel === 'cancel' ? null : channel);
      };

      overlay.addEventListener('click', onClick);
    });
  }

  function openEmail(to, subject, body) {
    var recipient = safeString(to).trim();
    var mailto = 'mailto:' + encodeURIComponent(recipient) + '?subject=' + encodeURIComponent(safeString(subject || 'Zeralda ERP Share')) + '&body=' + encodeURIComponent(safeString(body || ''));
    window.location.href = mailto;
    return true;
  }

  function dispatchByChannel(channel, opts, title, text) {
    if (channel === 'email') {
      openEmail(opts.email || '', title, text);
    }
  }

  function buildShareText(title, payload) {
    var header = safeString(title || 'Zeralda ERP Data');
    var stamp = new Date().toISOString();
    var body = '';
    try {
      body = JSON.stringify(payload || {}, null, 2);
    } catch (_) {
      body = safeString(payload);
    }
    return header + '\n\nGenerated at: ' + stamp + '\n\n' + body;
  }

  function sharePayload(options) {
    var opts = options || {};
    var title = safeString(opts.title || 'Zeralda ERP Share');
    var text = buildShareText(title, opts.payload || {});
    var channel = opts.channel;
    if (channel) {
      dispatchByChannel(channel, opts, title, text);
      return true;
    }

    chooseChannel().then(function (picked) {
      if (!picked) return;
      dispatchByChannel(picked, opts, title, text);
    });
    return true;
  }

  function shareTableData(title, rows, meta) {
    return sharePayload({
      title: title,
      payload: {
        meta: meta || {},
        rows: Array.isArray(rows) ? rows : []
      }
    });
  }

  function upgradeLegacyShareLabels(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll('button, .btn, [role="button"]');
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      var onclickAttr = safeString(el.getAttribute && el.getAttribute('onclick')).toLowerCase();
      if (!onclickAttr) continue;
      if (onclickAttr.indexOf('import') >= 0) continue;
      if (onclickAttr.indexOf('export') < 0 && onclickAttr.indexOf('download') < 0) continue;

      var icon = el.querySelector('i');
      if (icon) icon.className = 'fas fa-share-alt';

      var span = el.querySelector('span');
      if (span) {
        span.textContent = 'Share';
        span.setAttribute('data-en', 'Share');
        span.setAttribute('data-ar', 'مشاركة');
        span.setAttribute('data-fr', 'Partager');
      } else {
        el.textContent = 'Share';
      }
    }
  }

  function isLegacyExportAction(actionText) {
    var a = safeString(actionText).toLowerCase();
    if (!a) return false;
    if (a.indexOf('import') >= 0) return false;
    if (a.indexOf('restore') >= 0) return false;
    if (a.indexOf('backup') >= 0) return false;
    if (a.indexOf('sync') >= 0) return false;
    if (a.indexOf('export') >= 0) return true;
    if (a.indexOf('download') >= 0) return true;
    if (a.indexOf('share') >= 0) return true;
    return false;
  }

  function extractButtonLabel(el) {
    if (!el) return 'ERP Data Share';
    var span = el.querySelector('span');
    if (span && safeString(span.textContent).trim()) return safeString(span.textContent).trim();
    var text = safeString(el.textContent).replace(/\s+/g, ' ').trim();
    return text || 'ERP Data Share';
  }

  function installLegacyActionInterceptor() {
    if (document.documentElement.dataset.shareInterceptorBound === '1') return;
    document.documentElement.dataset.shareInterceptorBound = '1';

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var clickable = target.closest('button, .btn, a, [role="button"], [onclick]');
      if (!clickable) return;
      if (clickable.hasAttribute('data-modern-share')) return;

      var action = safeString(clickable.getAttribute && clickable.getAttribute('onclick'));
      if (!isLegacyExportAction(action)) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }

      sharePayload({
        title: extractButtonLabel(clickable),
        payload: {
          page: window.location.pathname,
          action: action,
          sharedAt: new Date().toISOString(),
          message: 'Legacy export/share action replaced with Email share.'
        }
      });
    }, true);
  }

  function triggerDailySyncNow() {
    if (!window.UnifiedStorage || typeof window.UnifiedStorage.runDailyFullSync !== 'function') {
      return Promise.resolve(false);
    }
    return window.UnifiedStorage.runDailyFullSync();
  }

  window.ZeraldaShareHub = {
    chooseChannel: chooseChannel,
    openEmail: openEmail,
    sharePayload: sharePayload,
    shareTableData: shareTableData,
    triggerDailySyncNow: triggerDailySyncNow,
    upgradeLegacyShareLabels: upgradeLegacyShareLabels,
    installLegacyActionInterceptor: installLegacyActionInterceptor
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      upgradeLegacyShareLabels(document);
      installLegacyActionInterceptor();
    });
  } else {
    upgradeLegacyShareLabels(document);
    installLegacyActionInterceptor();
  }

  document.addEventListener('sharedLayoutLoaded', function () {
    upgradeLegacyShareLabels(document);
    installLegacyActionInterceptor();
  });
})();
