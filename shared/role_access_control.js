(function () {
  const SETTINGS_KEY = 'zeralda-settings';

  function getSettings() {
    try {
      const raw = ZS.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function getActivePermissions() {
    const settings = getSettings();
    const users = Array.isArray(settings.users) ? settings.users : [];
    const roles = Array.isArray(settings.roles) ? settings.roles : [];
    const activeUser = users.find(u => u && u.id === settings.activeUserId) || users.find(u => u && u.active) || null;
    if (!activeUser) return ['*'];
    const role = roles.find(r => r && r.id === activeUser.roleId) || null;
    const perms = role && Array.isArray(role.permissions) ? role.permissions.filter(Boolean) : [];
    return perms.length ? perms : ['read'];
  }

  function hasPermission(required, perms) {
    if (!required) return true;
    if (!Array.isArray(perms) || !perms.length) return false;
    if (perms.includes('*')) return true;
    if (required === 'consulting' && perms.includes('read')) return true;
    return perms.includes(required);
  }

  function hideMenuItemByHref(hrefPart) {
    document.querySelectorAll('.menu a.menu-item[href]').forEach((a) => {
      const href = String(a.getAttribute('href') || '').toLowerCase();
      if (href.includes(hrefPart)) {
        a.style.display = 'none';
      }
    });
  }

  function enforcePageAccess(perms) {
    const page = (location.pathname.split('/').pop() || '').toLowerCase();
    const needsSettings = page === 'settings.html';
    const needsReports = page === 'reports_analytics.html';
    const needsConsulting = page === 'consulting_tenders_management.html';

    if (needsSettings && !hasPermission('settings', perms)) {
      alert('Access denied: settings permission required.');
      location.href = 'zeralda_erp_dashboard.html';
      return false;
    }

    if (needsReports && !hasPermission('reports', perms)) {
      alert('Access denied: reports permission required.');
      location.href = 'zeralda_erp_dashboard.html';
      return false;
    }

    if (needsConsulting && !hasPermission('consulting', perms)) {
      alert('Access denied: consulting permission required.');
      location.href = 'zeralda_erp_dashboard.html';
      return false;
    }

    return true;
  }

  function enforceMenuAccess(perms) {
    if (!hasPermission('settings', perms)) {
      hideMenuItemByHref('settings.html');
    }
    if (!hasPermission('reports', perms)) {
      hideMenuItemByHref('reports_analytics.html');
    }
    if (!hasPermission('consulting', perms)) {
      hideMenuItemByHref('consulting_tenders_management.html');
    }
  }

  function disableElement(el) {
    if (!el) return;
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
    el.style.opacity = '0.55';
    el.style.cursor = 'not-allowed';
    if (!el.title) {
      el.title = 'Access restricted by role permissions';
    }
  }

  function enforceActionAccess(perms) {
    const canWrite = hasPermission('write', perms);
    const canDelete = hasPermission('delete', perms);

    const writePattern = /(save|add|create|update|import|upload|new)/i;
    const deletePattern = /(delete|remove|trash)/i;

    document.querySelectorAll('button, .btn, [role="button"]').forEach((el) => {
      if (!el || !el.getAttribute) return;
      if (el.closest('.menu')) return;

      const onclick = String(el.getAttribute('onclick') || '');
      const text = String(el.textContent || '').trim();
      const hint = onclick + ' ' + text;

      if (!canWrite && writePattern.test(hint)) {
        disableElement(el);
      }

      if (!canDelete && deletePattern.test(hint)) {
        disableElement(el);
      }
    });

    if (!canWrite) {
      document.querySelectorAll('input[type="file"]').forEach(disableElement);
    }
  }

  function applyRoleAccessControl() {
    const perms = getActivePermissions();
    const canContinue = enforcePageAccess(perms);
    if (!canContinue) return;
    enforceMenuAccess(perms);
    enforceActionAccess(perms);
  }

  function startInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyRoleAccessControl);
    } else {
      applyRoleAccessControl();
    }
  }

  // Wait for ZDB (IndexedDB cache) to be ready
  if (window.ZDB && window.ZDB.ready) {
    window.ZDB.ready().then(startInit).catch(startInit);
  } else {
    startInit();
  }

  // Re-apply when shared layout is loaded asynchronously
  document.addEventListener('sharedLayoutLoaded', applyRoleAccessControl);
})();
