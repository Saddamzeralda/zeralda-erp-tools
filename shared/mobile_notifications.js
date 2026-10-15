/**
 * ============================================================================
 * ZERALDA ERP — MOBILE & WEB PUSH NOTIFICATIONS ENGINE
 * ============================================================================
 * Enables native smartphone push notifications:
 * - W3C Push API + VAPID Web Push (Android Chrome/Samsung/Firefox, iOS 16.4+ PWA)
 * - Auto-registration & permission management
 * - In-app prompt banner on mobile devices
 * - Test notification trigger with vibration and sound
 * ============================================================================
 */
(function(window, document) {
  'use strict';

  function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  function getDeviceDescription() {
    const ua = navigator.userAgent || '';
    let name = 'متصفح ويب';
    if (/android/i.test(ua)) {
      name = 'هاتف أندرويد';
      const m = ua.match(/;\s*([^;]+)\s+Build/i);
      if (m && m[1]) name = 'Android (' + m[1].trim() + ')';
    } else if (/iphone/i.test(ua)) {
      name = 'Apple iPhone';
    } else if (/ipad/i.test(ua)) {
      name = 'Apple iPad';
    } else if (/windows/i.test(ua)) {
      name = 'جهاز كمبيوتر (Windows)';
    } else if (/macintosh|mac os x/i.test(ua)) {
      name = 'جهاز كمبيوتر (Mac)';
    }
    return name;
  }

  const ZeraldaMobileNotifications = {
    isSupported: function() {
      return (
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
      );
    },

    getPermissionState: function() {
      if (!('Notification' in window)) return 'unsupported';
      return Notification.permission; // 'granted', 'denied', or 'default'
    },

    getRegistration: async function() {
      if (!('serviceWorker' in navigator)) return null;
      try {
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        }
        await navigator.serviceWorker.ready;
        return reg;
      } catch (e) {
        console.warn('[Push] Error getting service worker registration:', e);
        return null;
      }
    },

    getCurrentSubscription: async function() {
      const reg = await this.getRegistration();
      if (!reg || !reg.pushManager) return null;
      return await reg.pushManager.getSubscription();
    },

    subscribeCurrentDevice: async function(customDeviceName) {
      if (!this.isSupported()) {
        throw new Error('متصفحك الحالي أو جهازك لا يدعم الإشعارات الفورية (Web Push). يرجى استخدام متصفح حديث مثل Chrome أو Safari.');
      }

      // 1. Request user permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('تم رفض إذن الإشعارات من قِبل المتصفح. يرجى تفعيل الإشعارات من إعدادات المتصفح أو القفل بجانب رابط الموقع.');
      }

      // 2. Fetch VAPID Public Key from server
      const keyRes = await fetch('/api/notifications/vapid-public-key', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      const keyData = await keyRes.json();
      if (!keyData.ok || !keyData.publicKey) {
        throw new Error('تعذر جلب مفتاح التحقق VAPID من الخادم.');
      }

      // 3. Register Push Subscription with Service Worker
      const reg = await this.getRegistration();
      if (!reg) {
        throw new Error('تعذر العثور على Service Worker لتسجيل الإشعارات.');
      }

      const applicationServerKey = urlB64ToUint8Array(keyData.publicKey);
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey
        });
      }

      // 4. Send subscription to ERP server
      const deviceName = customDeviceName || getDeviceDescription();
      const sendRes = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          deviceName: deviceName
        })
      });

      const sendData = await sendRes.json();
      if (!sendData.ok) {
        throw new Error(sendData.error || 'فشل حفظ اشتراك الجهاز في الخادم.');
      }

      localStorage.setItem('zeralda_mobile_push_subscribed', 'true');
      this.dismissMobilePrompt();

      return {
        ok: true,
        deviceName: deviceName,
        subscription: subscription
      };
    },

    unsubscribeCurrentDevice: async function() {
      const sub = await this.getCurrentSubscription();
      if (sub) {
        try {
          await fetch('/api/notifications/unsubscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ endpoint: sub.endpoint })
          });
        } catch(e) {}
        await sub.unsubscribe();
      }
      localStorage.removeItem('zeralda_mobile_push_subscribed');
      return true;
    },

    sendTestPush: async function() {
      const sub = await this.getCurrentSubscription();
      const bodyPayload = sub ? { subscription: sub.toJSON() } : {};
      const res = await fetch('/api/notifications/test-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(bodyPayload)
      });
      return await res.json();
    },

    // ── Floating Mobile In-App Invitation Pill ──────────────────────────────
    showMobilePromptIfNeeded: async function() {
      // Don't show if already subscribed or explicitly dismissed in this session
      if (localStorage.getItem('zeralda_mobile_push_subscribed') === 'true') return;
      if (sessionStorage.getItem('zeralda_push_prompt_dismissed') === 'true') return;
      if (!this.isSupported()) return;
      if (Notification.permission === 'denied') return;

      const sub = await this.getCurrentSubscription();
      if (sub) {
        localStorage.setItem('zeralda_mobile_push_subscribed', 'true');
        return;
      }

      // Check if mobile or small screen
      const isMobile = window.innerWidth <= 820 || /android|iphone|ipad|mobile/i.test(navigator.userAgent);
      if (!isMobile) return;

      // Avoid duplicate banner
      if (document.getElementById('zeraldaMobileNotifBanner')) return;

      const banner = document.createElement('div');
      banner.id = 'zeraldaMobileNotifBanner';
      banner.setAttribute('dir', 'rtl');
      banner.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 16px;
        right: 16px;
        max-width: 440px;
        margin: 0 auto;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #fff;
        padding: 14px 16px;
        border-radius: 14px;
        box-shadow: 0 12px 30px rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.12);
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        animation: slideUpMobileBanner 0.35s ease-out;
      `;

      banner.innerHTML = `
        <div style="font-size:24px; color:#38bdf8; line-height:1;">📱</div>
        <div style="flex:1;">
          <div style="font-size:13px; font-weight:700; margin-bottom:2px;">إشعارات الهاتف الفورية</div>
          <div style="font-size:11px; color:#cbd5e1; line-height:1.4;">استقبل تنبيهات الفواتير والمخزون والنسخ الاحتياطي على هاتفك مباشرة.</div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button id="zeraldaEnableNotifBtn" style="background:#0284c7; color:#fff; border:none; padding:7px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">
            تفعيل 🔔
          </button>
          <button id="zeraldaDismissNotifBtn" style="background:transparent; color:#94a3b8; border:none; padding:6px; font-size:16px; cursor:pointer;">
            ✕
          </button>
        </div>
      `;

      if (!document.getElementById('slideUpMobileBannerStyle')) {
        const style = document.createElement('style');
        style.id = 'slideUpMobileBannerStyle';
        style.textContent = `
          @keyframes slideUpMobileBanner {
            from { transform: translateY(100px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(banner);

      document.getElementById('zeraldaDismissNotifBtn').onclick = () => {
        this.dismissMobilePrompt();
      };

      document.getElementById('zeraldaEnableNotifBtn').onclick = async () => {
        const btn = document.getElementById('zeraldaEnableNotifBtn');
        btn.textContent = 'جارٍ التفعيل...';
        btn.disabled = true;
        try {
          await this.subscribeCurrentDevice();
          btn.textContent = 'تم التفعيل ✓';
          btn.style.background = '#16a34a';
          setTimeout(() => {
            this.dismissMobilePrompt();
            this.sendTestPush();
          }, 1000);
        } catch (err) {
          alert(err.message || 'تعذر تفعيل الإشعارات.');
          btn.textContent = 'تفعيل 🔔';
          btn.disabled = false;
        }
      };
    },

    dismissMobilePrompt: function() {
      sessionStorage.setItem('zeralda_push_prompt_dismissed', 'true');
      const banner = document.getElementById('zeraldaMobileNotifBanner');
      if (banner) {
        banner.style.transition = 'all 0.3s ease';
        banner.style.transform = 'translateY(100px)';
        banner.style.opacity = '0';
        setTimeout(() => banner.remove(), 300);
      }
    }
  };

  // Expose globally
  window.ZeraldaMobileNotifications = ZeraldaMobileNotifications;

  // Auto initialize on mobile after page load
  window.addEventListener('load', function() {
    setTimeout(function() {
      ZeraldaMobileNotifications.showMobilePromptIfNeeded();
    }, 2500);
  });

})(window, document);
