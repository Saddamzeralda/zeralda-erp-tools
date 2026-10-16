/**
 * ============================================================================
 * PROACTIVE SMART ALERTS & NOTIFICATION HUB — DISABLED & REMOVED
 * ============================================================================
 * The floating Smart Alerts window ("Centre d'alertes intelligent") has been
 * completely removed per user request.
 * ============================================================================
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProactiveAlerts = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function purgeAlertsUI() {
    if (typeof document === 'undefined') return;

    // 1. Remove known widget elements
    [
      'zeraldaAlertsHubWrapper',
      'zeraldaAlertsButton',
      'zeraldaAlertsDropdown',
      'zeraldaAlertsBadge',
      'zeraldaAlertsHeaderTitle',
      'zeraldaAlertsList'
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });

    // 2. Remove by query selector
    var selectors = [
      '[id*="zeraldaAlerts"]',
      '.alerts-hub-wrapper',
      '.proactive-alerts-hub',
      '.zeralda-alerts-dropdown'
    ];
    selectors.forEach(function (sel) {
      try {
        var elements = document.querySelectorAll(sel);
        elements.forEach(function (node) {
          if (node && node.parentNode) {
            node.parentNode.removeChild(node);
          }
        });
      } catch (_) {}
    });

    // 3. Remove by text content containing "Centre d'alertes" or Arabic counterpart
    try {
      var allDivs = document.querySelectorAll('div, section, aside, header');
      for (var i = 0; i < allDivs.length; i++) {
        var txt = (allDivs[i].textContent || '').trim();
        if (
          (txt.indexOf("Centre d'alertes intelligent") !== -1 ||
           txt.indexOf("مركز التنبيهات الذكي") !== -1 ||
           txt.indexOf("Smart Alerts Hub") !== -1) &&
          allDivs[i].children.length <= 15
        ) {
          var target = allDivs[i].closest('[style*="fixed"], [style*="absolute"], div') || allDivs[i];
          if (target && target.parentNode && target !== document.body && target !== document.documentElement) {
            target.parentNode.removeChild(target);
          }
        }
      }
    } catch (_) {}
  }

  // Purge immediately and on lifecycle events
  purgeAlertsUI();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', purgeAlertsUI);
    }
    if (window.addEventListener) {
      window.addEventListener('load', purgeAlertsUI);
    }
  }

  return {
    scanAlerts: function () { return []; },
    dismissAlert: function () {},
    applyLanguage: function () {},
    getAlerts: function () { return []; }
  };
}));
