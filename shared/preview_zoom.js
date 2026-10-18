/**
 * Zeralda ERP — Universal Preview Zoom & Scaling Engine
 * shared/preview_zoom.js (v20261011e)
 *
 * Solves:
 * 1. "لا استطيع تصغير في معاينة الفواتير" (Cannot zoom out / shrink invoice previews on mobile)
 * 2. "اغلب القوائم او المعاينة تضهر جزء فقط جانبي" (Side clipping in previews & modals)
 *
 * Provides:
 * - Interactive Zoom toolbar: [- Zoom Out], [+ Zoom In], [📱 Fit Screen], [🔄 100%]
 * - Automatic Fit-to-Screen on mobile devices (< 768px)
 * - Native 2-finger touch Pinch-to-Zoom gesture on smartphones & tablets
 * - Smooth horizontal & vertical panning with zero clipping
 * - Print-safe (automatically resets transforms during print)
 */
(function(window, document) {
  'use strict';

  var _zoomStates = {}; // targetId -> { scale: Number, fitScale: Number, isFit: Boolean }

  function getTargetId(el) {
    if (typeof el === 'string') return el;
    return el && el.id ? el.id : 'preview_' + Math.random().toString(36).substr(2, 6);
  }

  function getLanguage() {
    try {
      if (window.UnifiedI18N && typeof window.UnifiedI18N.getLanguage === 'function') {
        return window.UnifiedI18N.getLanguage();
      }
      return String(localStorage.getItem('preferred-language') || 'ar').toLowerCase();
    } catch (_) {
      return 'ar';
    }
  }

  var I18N = {
    ar: {
      zoom: 'التحكم في الحجم:',
      zoomIn: 'تكبير (+)',
      zoomOut: 'تصغير (-)',
      fitScreen: 'ملاءمة الشاشة',
      actualSize: '100% الحجم الفعلي',
      pinchHint: 'يمكنك استخدام إصبعين للتكبير والتصغير والسحب بحرية'
    },
    fr: {
      zoom: 'Zoom :',
      zoomIn: 'Agrandir (+)',
      zoomOut: 'Réduire (-)',
      fitScreen: 'Ajuster l\'écran',
      actualSize: '100% Taille réelle',
      pinchHint: 'Pincez avec deux doigts pour zoomer et faites glisser'
    },
    en: {
      zoom: 'Zoom Controls:',
      zoomIn: 'Zoom In (+)',
      zoomOut: 'Zoom Out (-)',
      fitScreen: 'Fit Screen',
      actualSize: '100% Actual Size',
      pinchHint: 'Pinch with two fingers to zoom or drag to pan'
    }
  };

  function tr(key) {
    var lang = getLanguage();
    if (lang !== 'ar' && lang !== 'fr') lang = 'en';
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || '';
  }

  function computeFitScale(targetEl) {
    if (!targetEl) return 1.0;
    var parent = targetEl.closest('.invoice-preview-shell, .bill-preview-shell, .modal-body, .modal-content') || targetEl.parentElement;
    var availableWidth = parent ? (parent.clientWidth - 20) : (window.innerWidth - 30);
    if (availableWidth <= 0) availableWidth = window.innerWidth - 30;

    // Find actual content width (unscaled)
    var contentEl = targetEl.querySelector('.facture-container, .preview-paper, .preview-body, table') || targetEl.firstElementChild || targetEl;
    var naturalWidth = contentEl ? (contentEl.scrollWidth || contentEl.offsetWidth) : 760;
    if (!naturalWidth || naturalWidth < 400) naturalWidth = 760; // Standard A4 preview width

    var scale = availableWidth / naturalWidth;
    // Cap between 0.35 and 1.05
    return Math.max(0.35, Math.min(1.05, Math.round(scale * 100) / 100));
  }

  function applyZoom(targetId, scale, isFit) {
    var targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    scale = Math.max(0.30, Math.min(1.60, Math.round(scale * 100) / 100));

    var state = _zoomStates[targetId] || { scale: 1.0, fitScale: 1.0, isFit: false };
    state.scale = scale;
    state.isFit = !!isFit;
    _zoomStates[targetId] = state;

    // Apply scale to wrapper/content
    var contentEl = targetEl.querySelector('.preview-scale-content');
    if (!contentEl) {
      wrapContent(targetEl);
      contentEl = targetEl.querySelector('.preview-scale-content');
    }

    if (contentEl) {
      // Use CSS transform with smooth transition
      contentEl.style.transform = 'scale(' + scale + ')';
      contentEl.style.transformOrigin = document.body.classList.contains('rtl') ? 'top right' : 'top left';

      // Update parent viewport height so it doesn't leave huge whitespace or clip
      var viewport = targetEl.querySelector('.preview-zoom-viewport');
      if (viewport) {
        var baseHeight = contentEl.scrollHeight || 1000;
        var scaledHeight = Math.ceil(baseHeight * scale);
        viewport.style.minHeight = Math.min(scaledHeight + 30, window.innerHeight * 0.8) + 'px';
      }
    }

    // Update toolbar badges & buttons
    var toolbar = document.querySelector('.preview-zoom-toolbar[data-target="' + targetId + '"]');
    if (toolbar) {
      var badge = toolbar.querySelector('.zoom-value-badge');
      if (badge) badge.textContent = Math.round(scale * 100) + '%';

      var fitBtn = toolbar.querySelector('.btn-zoom-fit');
      if (fitBtn) fitBtn.classList.toggle('active', !!isFit);

      var resetBtn = toolbar.querySelector('.btn-zoom-reset');
      if (resetBtn) resetBtn.classList.toggle('active', Math.abs(scale - 1.0) < 0.03);
    }
  }

  function wrapContent(targetEl) {
    if (!targetEl || targetEl.querySelector('.preview-zoom-viewport')) return;

    var children = Array.from(targetEl.childNodes);
    if (!children.length) return;

    var viewport = document.createElement('div');
    viewport.className = 'preview-zoom-viewport';
    viewport.style.cssText = 'width:100%;overflow-x:auto;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y pinch-zoom;padding:2px 0;box-sizing:border-box;';

    var scaleContent = document.createElement('div');
    scaleContent.className = 'preview-scale-content';
    scaleContent.style.cssText = 'width:max-content;min-width:100%;transition:transform 0.12s ease-out;box-sizing:border-box;';

    children.forEach(function(child) {
      scaleContent.appendChild(child);
    });

    viewport.appendChild(scaleContent);
    targetEl.appendChild(viewport);

    setupPinchToZoom(viewport, targetEl.id);
  }

  function setupPinchToZoom(viewportEl, targetId) {
    var startDist = 0;
    var startScale = 1.0;
    var isPinching = false;

    viewportEl.addEventListener('touchstart', function(e) {
      if (e.touches.length === 2) {
        isPinching = true;
        startDist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        var state = _zoomStates[targetId] || { scale: 1.0 };
        startScale = state.scale || 1.0;
      }
    }, { passive: true });

    viewportEl.addEventListener('touchmove', function(e) {
      if (isPinching && e.touches.length === 2) {
        var currentDist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        if (startDist > 0) {
          var factor = currentDist / startDist;
          var newScale = startScale * factor;
          applyZoom(targetId, newScale, false);
        }
      }
    }, { passive: true });

    viewportEl.addEventListener('touchend', function(e) {
      if (e.touches.length < 2) {
        isPinching = false;
        startDist = 0;
      }
    }, { passive: true });
  }

  function createZoomToolbar(targetId) {
    var toolbar = document.createElement('div');
    toolbar.className = 'preview-zoom-toolbar';
    toolbar.setAttribute('data-target', targetId);
    toolbar.innerHTML = [
      '<div class="zoom-toolbar-left">',
      '  <span class="zoom-toolbar-title"><i class="fas fa-search"></i> <span class="t-zoom">' + tr('zoom') + '</span></span>',
      '  <div class="zoom-pill">',
      '    <button type="button" class="zoom-btn btn-zoom-out" title="' + tr('zoomOut') + '" aria-label="' + tr('zoomOut') + '"><i class="fas fa-minus"></i></button>',
      '    <span class="zoom-value-badge">100%</span>',
      '    <button type="button" class="zoom-btn btn-zoom-in" title="' + tr('zoomIn') + '" aria-label="' + tr('zoomIn') + '"><i class="fas fa-plus"></i></button>',
      '  </div>',
      '</div>',
      '<div class="zoom-toolbar-right">',
      '  <button type="button" class="zoom-action-btn btn-zoom-fit" title="' + tr('fitScreen') + '">',
      '    <i class="fas fa-compress-arrows-alt"></i> <span class="t-fit">' + tr('fitScreen') + '</span>',
      '  </button>',
      '  <button type="button" class="zoom-action-btn btn-zoom-reset" title="' + tr('actualSize') + '">',
      '    <i class="fas fa-redo-alt"></i> 100%',
      '  </button>',
      '</div>',
      '<div class="zoom-mobile-hint"><i class="fas fa-hand-pointer"></i> ' + tr('pinchHint') + '</div>'
    ].join('');

    // Wire events
    toolbar.querySelector('.btn-zoom-out').addEventListener('click', function() {
      var s = (_zoomStates[targetId] && _zoomStates[targetId].scale) || 1.0;
      applyZoom(targetId, s - 0.10, false);
    });

    toolbar.querySelector('.btn-zoom-in').addEventListener('click', function() {
      var s = (_zoomStates[targetId] && _zoomStates[targetId].scale) || 1.0;
      applyZoom(targetId, s + 0.10, false);
    });

    toolbar.querySelector('.btn-zoom-fit').addEventListener('click', function() {
      var targetEl = document.getElementById(targetId);
      var fitScale = computeFitScale(targetEl);
      applyZoom(targetId, fitScale, true);
    });

    toolbar.querySelector('.btn-zoom-reset').addEventListener('click', function() {
      applyZoom(targetId, 1.0, false);
    });

    return toolbar;
  }

  function attach(targetIdOrEl, options) {
    var targetEl = typeof targetIdOrEl === 'string' ? document.getElementById(targetIdOrEl) : targetIdOrEl;
    if (!targetEl) return;
    var targetId = targetEl.id || getTargetId(targetEl);
    if (!targetEl.id) targetEl.id = targetId;

    // Completely skip invoice and proforma previews as requested by user
    if (targetId === 'invoicePreview' || targetId === 'proformaPreview' || targetId === 'quotationPreview') {
      var parentEl = targetEl.parentElement;
      var prevToolbar = parentEl ? parentEl.querySelector('.preview-zoom-toolbar[data-target="' + targetId + '"]') : null;
      if (prevToolbar) prevToolbar.remove();
      return;
    }

    var opts = options || {};
    var forceAutoFit = opts.forceAutoFit !== undefined ? opts.forceAutoFit : (window.innerWidth <= 768);

    // 1. Wrap content inside viewport
    wrapContent(targetEl);

    // 2. Insert toolbar above targetEl if not exists
    var parent = targetEl.parentElement;
    var existingToolbar = parent ? parent.querySelector('.preview-zoom-toolbar[data-target="' + targetId + '"]') : null;
    if (!existingToolbar && parent) {
      var toolbar = createZoomToolbar(targetId);
      parent.insertBefore(toolbar, targetEl);
    }

    // 3. Auto fit on mobile or if requested
    setTimeout(function() {
      if (forceAutoFit) {
        var fitScale = computeFitScale(targetEl);
        applyZoom(targetId, fitScale, true);
      } else {
        applyZoom(targetId, 1.0, false);
      }
    }, 40);
  }

  // Auto-init for common preview IDs whenever modals or views open
  function autoAttachAll() {
    var commonIds = ['poPreview', 'billPreview', 'payslipContent'];
    commonIds.forEach(function(id) {
      var el = document.getElementById(id);
      if (el && el.innerHTML.trim().length > 20) {
        attach(el);
      }
    });
  }

  // Expose API
  window.ZeraldaPreviewZoom = {
    attach: attach,
    applyZoom: applyZoom,
    computeFitScale: computeFitScale,
    autoAttachAll: autoAttachAll,
    zoomIn: function(id) {
      var s = (_zoomStates[id] && _zoomStates[id].scale) || 1.0;
      applyZoom(id, s + 0.10, false);
    },
    zoomOut: function(id) {
      var s = (_zoomStates[id] && _zoomStates[id].scale) || 1.0;
      applyZoom(id, s - 0.10, false);
    },
    fit: function(id) {
      var el = document.getElementById(id);
      if (el) applyZoom(id, computeFitScale(el), true);
    },
    reset: function(id) {
      applyZoom(id, 1.0, false);
    }
  };

  // Reset zoom scale during print so documents fill the full page and never print shrunk
  window.addEventListener('beforeprint', function() {
    try {
      document.querySelectorAll('.preview-scale-content').forEach(function(el) {
        el.setAttribute('data-prev-transform', el.style.transform || '');
        el.style.transform = 'none';
      });
    } catch (_) {}
  });

  window.addEventListener('afterprint', function() {
    try {
      document.querySelectorAll('.preview-scale-content').forEach(function(el) {
        var prev = el.getAttribute('data-prev-transform');
        if (prev !== null) {
          el.style.transform = prev;
          el.removeAttribute('data-prev-transform');
        }
      });
    } catch (_) {}
  });

  // Listen to orientation change / resize
  window.addEventListener('resize', function() {
    Object.keys(_zoomStates).forEach(function(targetId) {
      if (_zoomStates[targetId] && _zoomStates[targetId].isFit) {
        var targetEl = document.getElementById(targetId);
        if (targetEl) {
          var fitScale = computeFitScale(targetEl);
          applyZoom(targetId, fitScale, true);
        }
      }
    });
  });

  // Re-translate toolbar when language changes
  window.addEventListener('zeraldaStoreChange', function(e) {
    try {
      var keys = (e && e.detail && Array.isArray(e.detail.keys)) ? e.detail.keys : [];
      if (keys.indexOf('preferred-language') !== -1 || keys.indexOf('zeralda-settings') !== -1) {
        document.querySelectorAll('.preview-zoom-toolbar').forEach(function(toolbar) {
          var tZoom = toolbar.querySelector('.t-zoom');
          var tFit = toolbar.querySelector('.t-fit');
          var hint = toolbar.querySelector('.zoom-mobile-hint');
          if (tZoom) tZoom.textContent = tr('zoom');
          if (tFit) tFit.textContent = tr('fitScreen');
          if (hint) hint.innerHTML = '<i class="fas fa-hand-pointer"></i> ' + tr('pinchHint');
        });
      }
    } catch (_) {}
  });

  // Observe modal opens to auto-attach
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'attributes' && m.attributeName === 'class') {
        var target = m.target;
        if (target && target.classList && (target.classList.contains('active') || target.classList.contains('show'))) {
          setTimeout(autoAttachAll, 50);
        }
      }
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
    setTimeout(autoAttachAll, 200);
  });

})(window, document);
