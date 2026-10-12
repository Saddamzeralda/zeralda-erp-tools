// shared/modules_api.js
// واجهة API موحدة لجميع وحدات Zeralda ERP
// يدمج: hr_api, sales_api, inventory_api, finance_api, purchasing_api,
//        crm_api, reports_api, services_api, consulting_api, unified_api

(function () {
  'use strict';

  const API_BASE = '/api/store';

  function getSessionToken() {
    return localStorage.getItem('zeralda-session-token') ||
      sessionStorage.getItem('zeralda-session-token') ||
      localStorage.getItem('zeralda-auth-token') ||
      sessionStorage.getItem('zeralda-auth-token') || '';
  }

  function buildAuthHeaders(extra) {
    const h = Object.assign({}, extra || {});
    const t = getSessionToken();
    if (t) { h['Authorization'] = 'Bearer ' + t; h['X-Session-Token'] = t; }
    return h;
  }

  function isUnauthorized(res) {
    return res && (res.status === 401 || res.status === 403);
  }

  function createModuleApi(moduleName, keys) {
    let disabled = false;

    async function apiGet(key) {
      if (disabled) return { ok: false, unauthorized: true };
      const res = await fetch(`${API_BASE}?key=${encodeURIComponent(key)}`, {
        credentials: 'include',
        headers: buildAuthHeaders()
      });
      if (isUnauthorized(res)) { disabled = true; return { ok: false, unauthorized: true }; }
      if (!res.ok) throw new Error('Network error');
      disabled = false;
      const data = await res.json();
      if (data && data.ok === true && Object.prototype.hasOwnProperty.call(data, 'value')) return data.value;
      if (data && data.ok === true && Object.prototype.hasOwnProperty.call(data, 'data')) return data.data;
      return data;
    }

    async function apiSet(key, value) {
      if (disabled) return { ok: false, unauthorized: true };
      const res = await fetch(API_BASE, {
        method: 'POST',
        credentials: 'include',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ key, value })
      });
      if (isUnauthorized(res)) { disabled = true; return { ok: false, unauthorized: true }; }
      if (!res.ok) throw new Error('Save failed');
      disabled = false;
      return res.json();
    }

    async function apiDelete(key) {
      if (disabled) return { ok: false, unauthorized: true };
      const res = await fetch(`${API_BASE}?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: buildAuthHeaders()
      });
      if (isUnauthorized(res)) { disabled = true; return { ok: false, unauthorized: true }; }
      if (!res.ok) throw new Error('Delete failed');
      disabled = false;
      return res.json();
    }

    const api = Object.assign(
      { apiGet, apiSet, apiDelete },
      { [moduleName + 'ApiGet']: apiGet, [moduleName + 'ApiSet']: apiSet, [moduleName + 'ApiDelete']: apiDelete },
      keys
    );
    return api;
  }

  // ── وحدة الموارد البشرية ──────────────────────────────────────
  window.hrAPI = createModuleApi('hr', {
    EMPLOYEES_KEY: 'employees',
    JOBS_KEY: 'jobs',
    PAYROLL_KEY: 'payroll'
  });

  // ── وحدة المبيعات ─────────────────────────────────────────────
  window.salesAPI = createModuleApi('sales', {
    INVOICES_KEY: 'invoices',
    CUSTOMERS_KEY: 'customers',
    PRODUCTS_KEY: 'products',
    PROFORMAS_KEY: 'proformas'
  });

  // ── وحدة المخزون ──────────────────────────────────────────────
  window.inventoryAPI = createModuleApi('inventory', {
    PRODUCTS_KEY: 'products',
    STOCK_KEY: 'stock',
    WAREHOUSES_KEY: 'warehouses'
  });

  // ── وحدة المالية والمحاسبة ────────────────────────────────────
  window.financeAPI = createModuleApi('finance', {
    ACCOUNTS_KEY: 'accounts',
    TRANSACTIONS_KEY: 'transactions',
    BILLS_KEY: 'bills',
    BANK_ACCOUNTS_KEY: 'finance_bank_accounts',
    BANK_TRANSACTIONS_KEY: 'finance_bank_transactions',
    PRINTED_CHECKS_KEY: 'finance_printed_checks',
    JOURNAL_ENTRIES_KEY: 'finance_journal_entries'
  });

  // ── وحدة المشتريات ────────────────────────────────────────────
  window.purchasingAPI = createModuleApi('purchasing', {
    PURCHASES_KEY: 'purchase_orders',
    SUPPLIERS_KEY: 'suppliers',
    BILLS_KEY: 'bills',
    PAYMENTS_KEY: 'payments'
  });

  // ── وحدة إدارة علاقات العملاء ────────────────────────────────
  window.crmAPI = createModuleApi('crm', {
    CUSTOMERS_KEY: 'customers',
    OPPORTUNITIES_KEY: 'opportunities'
  });

  // ── وحدة التقارير والتحليلات ──────────────────────────────────
  window.reportsAPI = createModuleApi('reports', {
    REPORTS_KEY: 'reports',
    ANALYTICS_KEY: 'analytics'
  });

  // ── وحدة الخدمات ──────────────────────────────────────────────
  window.servicesAPI = createModuleApi('services', {
    SERVICES_KEY: 'services',
    CONTRACTS_KEY: 'contracts'
  });

  // ── وحدة الاستشارات والمناقصات ───────────────────────────────
  window.consultingAPI = createModuleApi('consulting', {
    TENDERS_KEY: 'tenders',
    CONSULTANTS_KEY: 'consultants'
  });

  // ── واجهة النظام العامة (الإعدادات/المستخدمون) ───────────────
  const _sys = createModuleApi('unified', {
    SETTINGS_KEY: 'settings',
    USERS_KEY: 'users',
    ROLES_KEY: 'roles'
  });
  window.unifiedAPI = {
    unifiedApiGet: _sys.apiGet,
    unifiedApiSet: _sys.apiSet,
    unifiedApiDelete: _sys.apiDelete,
    SETTINGS_KEY: _sys.SETTINGS_KEY,
    USERS_KEY: _sys.USERS_KEY,
    ROLES_KEY: _sys.ROLES_KEY
  };

  window.ZeraldaAuth = {
    getSessionToken,
    buildAuthHeaders,
    isUnauthorized
  };

  console.log('[ModulesAPI] All module APIs initialized.');
})();
