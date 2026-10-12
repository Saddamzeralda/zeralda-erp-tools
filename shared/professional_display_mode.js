(function () {
    'use strict';

    function hasExcludedToken(value) {
        var text = String(value || '').toLowerCase();
        return /invoice|invoices|bill|bills|proforma|quotation|quote|facture|فاتور|فاتورة|فواتير/.test(text);
    }

    function isInsideModal(el) {
        return !!(el && el.closest && el.closest('.modal, .modal-overlay, [role="dialog"]'));
    }

    function ensureStyleTag() {
        if (document.getElementById('professional-display-mode-style')) return;
        var style = document.createElement('style');
        style.id = 'professional-display-mode-style';
        style.textContent = [
            '.pro-display-wrap {',
            '  border: 1px solid #dccfbf;',
            '  border-radius: 18px;',
            '  background: linear-gradient(180deg, #fffdf9 0%, #fff9f1 100%);',
            '  box-shadow: 0 14px 28px rgba(31, 27, 22, 0.10);',
            '  overflow: hidden;',
            '  backdrop-filter: blur(2px);',
            '}',
            '.pro-display-wrap table.pro-display-table {',
            '  width: 100%;',
            '  border-collapse: separate;',
            '  border-spacing: 0;',
            '}',
            '.pro-display-wrap table.pro-display-table thead {',
            '  background: linear-gradient(180deg, #f8f0e4 0%, #eee1cc 100%);',
            '}',
            '.pro-display-wrap table.pro-display-table th {',
            '  color: #53493f;',
            '  font-size: 12px;',
            '  font-weight: 700;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.04em;',
            '  border-bottom: 1px solid #e3d6c5;',
            '  position: sticky;',
            '  top: 0;',
            '  z-index: 1;',
            '}',
            '.pro-display-wrap table.pro-display-table td {',
            '  border-bottom: 1px solid #efe4d6;',
            '  color: #2f2a24;',
            '  vertical-align: middle;',
            '}',
            '.pro-display-wrap table.pro-display-table tbody tr:nth-child(even) {',
            '  background: #fffaf3;',
            '}',
            '.pro-display-wrap table.pro-display-table tbody tr:hover {',
            '  background: #ffefd8;',
            '  transition: background-color 0.18s ease, transform 0.18s ease;',
            '  transform: translateY(-1px);',
            '}',
            '.pro-display-list {',
            '  border: 1px solid #dccfbf;',
            '  border-radius: 16px;',
            '  background: #fffdf9;',
            '  box-shadow: inset 0 1px 0 rgba(255,255,255,0.65);',
            '  padding: 10px;',
            '}',
            '.pro-display-list .item {',
            '  border: 1px solid #eadcc8;',
            '  border-radius: 14px;',
            '  background: linear-gradient(180deg, #fff9f0 0%, #fff6eb 100%);',
            '  box-shadow: 0 8px 16px rgba(31, 27, 22, 0.07);',
            '  transition: transform 0.15s ease, box-shadow 0.15s ease;',
            '}',
            '.pro-display-list .item:hover {',
            '  transform: translateY(-2px);',
            '  box-shadow: 0 12px 22px rgba(31, 27, 22, 0.10);',
            '}',
            '@media (max-width: 768px) {',
            '  .pro-display-wrap { border-radius: 12px; }',
            '  .pro-display-wrap table.pro-display-table th,',
            '  .pro-display-wrap table.pro-display-table td {',
            '    padding-top: 10px;',
            '    padding-bottom: 10px;',
            '  }',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function decorateTables() {
        var tbodies = document.querySelectorAll('tbody[id]');
        tbodies.forEach(function (tbody) {
            var id = String(tbody.id || '');
            if (!id) return;
            if (hasExcludedToken(id)) return;
            if (isInsideModal(tbody)) return;

            var table = tbody.closest('table');
            if (!table) return;
            if (table.classList.contains('preview-table') || table.classList.contains('recent-invoices-table') || table.classList.contains('payslip-table')) return;

            var container = table.closest('.table-container') || table.parentElement;
            if (!container || isInsideModal(container)) return;

            table.classList.add('pro-display-table');
            container.classList.add('pro-display-wrap');
        });
    }

    function decorateLists() {
        var lists = document.querySelectorAll('.list[id], .list');
        lists.forEach(function (listEl) {
            var id = String(listEl.id || '');
            if (id && hasExcludedToken(id)) return;
            if (isInsideModal(listEl)) return;
            listEl.classList.add('pro-display-list');
        });
    }

    function apply() {
        ensureStyleTag();
        decorateTables();
        decorateLists();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply);
    } else {
        apply();
    }

    window.ProfessionalDisplayMode = {
        refresh: apply
    };
})();
