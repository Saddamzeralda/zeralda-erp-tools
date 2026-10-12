/**
 * Zeralda ERP — QR Code for Phone Numbers
 * Auto-attaches a QR button to every input[type="tel"] in the page.
 * Also exposes window.showPhoneQR(phone) for programmatic use.
 */
(function () {
    'use strict';

    /* ── Load qrcode.js from CDN ─────────────────────────────────────── */
    function loadQRLib(cb) {
        if (window.QRCode) { cb(); return; }
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
        s.onload = cb;
        s.onerror = function () {
            console.warn('[QR] Could not load QR library from CDN.');
        };
        document.head.appendChild(s);
    }

    /* ── Inject styles ───────────────────────────────────────────────── */
    function injectStyles() {
        if (document.getElementById('qr-phone-styles')) return;
        var s = document.createElement('style');
        s.id = 'qr-phone-styles';
        s.textContent = [
            '#qr-phone-modal{display:none;position:fixed;inset:0;z-index:2147483640;',
            '  background:rgba(0,0,0,.55);align-items:center;justify-content:center;}',
            '#qr-phone-modal.open{display:flex;}',
            '#qr-phone-box{background:#fff;border-radius:18px;padding:32px 28px 24px;',
            '  text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.28);min-width:260px;max-width:300px;}',
            '#qr-phone-label{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;',
            '  letter-spacing:.6px;margin-bottom:14px;}',
            '#qr-phone-canvas{margin:0 auto 14px;display:flex;justify-content:center;}',
            '#qr-phone-canvas canvas,#qr-phone-canvas img{border-radius:8px;border:1px solid #e2e8f0;}',
            '#qr-phone-number{font-size:19px;font-weight:700;color:#1e3a8a;',
            '  letter-spacing:1.5px;margin-bottom:20px;direction:ltr;}',
            '.qr-phone-actions{display:flex;gap:8px;justify-content:center;}',
            '#qr-phone-close{flex:1;padding:10px 0;border-radius:9px;border:none;',
            '  background:#2563eb;color:#fff;cursor:pointer;font-size:13.5px;font-weight:600;}',
            '#qr-phone-close:hover{background:#1d4ed8;}',
            '#qr-phone-download{padding:10px 14px;border-radius:9px;',
            '  border:1px solid #e2e8f0;background:#f8fafc;color:#374151;cursor:pointer;font-size:13px;}',
            '#qr-phone-download:hover{background:#eff6ff;border-color:#bfdbfe;color:#2563eb;}',
            /* QR trigger button next to inputs */
            '.qr-phone-btn{display:inline-flex;align-items:center;justify-content:center;',
            '  width:34px;height:34px;border-radius:8px;border:1px solid #bfdbfe;',
            '  background:#eff6ff;color:#2563eb;cursor:pointer;font-size:14px;',
            '  flex-shrink:0;transition:background .15s,border-color .15s;vertical-align:middle;',
            '  margin-inline-start:6px;}',
            '.qr-phone-btn:hover{background:#dbeafe;border-color:#93c5fd;}',
        ].join('');
        document.head.appendChild(s);
    }

    /* ── Build modal (once) ──────────────────────────────────────────── */
    function buildModal() {
        if (document.getElementById('qr-phone-modal')) return;
        var modal = document.createElement('div');
        modal.id = 'qr-phone-modal';
        modal.innerHTML =
            '<div id="qr-phone-box">' +
            '  <div id="qr-phone-label">QR Code</div>' +
            '  <div id="qr-phone-canvas"></div>' +
            '  <div id="qr-phone-number"></div>' +
            '  <div class="qr-phone-actions">' +
            '    <button id="qr-phone-download" title="تحميل"><i class="fas fa-download"></i></button>' +
            '    <button id="qr-phone-close">إغلاق</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeModal();
        });
        document.getElementById('qr-phone-close').addEventListener('click', closeModal);
        document.getElementById('qr-phone-download').addEventListener('click', downloadQR);
    }

    function closeModal() {
        var m = document.getElementById('qr-phone-modal');
        if (m) m.classList.remove('open');
    }

    function downloadQR() {
        var canvas = document.querySelector('#qr-phone-canvas canvas');
        if (!canvas) return;
        var a = document.createElement('a');
        a.download = 'qr-' + (document.getElementById('qr-phone-number').textContent.replace(/\s+/g, '') || 'phone') + '.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
    }

    /* ── Show QR modal ───────────────────────────────────────────────── */
    function showPhoneQR(phone) {
        phone = String(phone || '').trim();
        if (!phone) return;
        loadQRLib(function () {
            buildModal();
            var canvasDiv = document.getElementById('qr-phone-canvas');
            canvasDiv.innerHTML = '';
            document.getElementById('qr-phone-number').textContent = phone;
            new window.QRCode(canvasDiv, {
                text: 'tel:' + phone,
                width: 190,
                height: 190,
                colorDark: '#1e3a8a',
                colorLight: '#ffffff',
                correctLevel: window.QRCode.CorrectLevel.H
            });
            document.getElementById('qr-phone-modal').classList.add('open');
        });
    }

    /* ── Attach button next to a tel input ──────────────────────────── */
    function attachQRButton(input) {
        if (input.dataset.qrAttached) return;
        input.dataset.qrAttached = '1';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qr-phone-btn';
        btn.title = 'عرض QR Code';
        btn.innerHTML = '<i class="fas fa-qrcode"></i>';
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            showPhoneQR(input.value.trim());
        });
        input.insertAdjacentElement('afterend', btn);
    }

    /* ── Scan all tel inputs ─────────────────────────────────────────── */
    function scan() {
        document.querySelectorAll('input[type="tel"]:not([data-qr-attached])').forEach(attachQRButton);
    }

    /* ── Watch for dynamically added inputs (modals, forms) ─────────── */
    function observe() {
        if (window._qrPhoneObserver) return;
        window._qrPhoneObserver = new MutationObserver(function () { scan(); });
        window._qrPhoneObserver.observe(document.body, { childList: true, subtree: true });
    }

    /* ── Init ────────────────────────────────────────────────────────── */
    function init() {
        injectStyles();
        scan();
        observe();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.showPhoneQR = showPhoneQR;
}());
