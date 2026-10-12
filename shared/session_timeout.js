/* ═══════════════════════════════════════════════════════════════
   Zeralda ERP - Auto-Logout on Session Timeout
   نظام تسجيل الخروج التلقائي عند انتهاء الجلسة
   
   تسجيل الخروج التلقائي بعد 30 دقيقة من عدم الاستخدام مع تنبيه
   قبل 5 دقائق من انتهاء الجلسة
   ═══════════════════════════════════════════════════════════════ */

(function initSessionTimeout() {
  'use strict';

  /* Constants */
  const SESSION_TIMEOUT_MS = 10 * 60 * 60 * 1000; // 10 hours
  const WARNING_TIME_MS = 10 * 60 * 1000;         // Warn 10 minutes before logout
  const INACTIVITY_CHECK_MS = 60 * 1000;          // Check inactivity each minute
  
  /* State */
  let timeoutId = null;
  let warningShown = false;
  let lastActivityTime = null;
  let sessionWarningOverlay = null;
  let _countdownInterval = null;
  let warningTimerId = null; // FIX P1: track warning timer to prevent duplicates

  /* ══════════════════════════════════════════════════════════ */
  /* 1. Activity Detection - تكتشف آخر نشاط للمستخدم */
  /* ══════════════════════════════════════════════════════════ */
  
  function recordActivity() {
    lastActivityTime = Date.now();
    warningShown = false; // Reset warning if user is still active
    resetSessionTimer();
  }

  function addActivityListeners() {
    // Listen for user interactions
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(function(event) {
      document.addEventListener(event, recordActivity, { passive: true });
    });
  }

  /* ══════════════════════════════════════════════════════════ */
  /* 2. Timer Management - إدارة المؤقت */
  /* ══════════════════════════════════════════════════════════ */

  function resetSessionTimer() {
    // Clear existing timers
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    // FIX P1: clear previous warning timer to prevent duplicate warnings.
    // Without this, every recordActivity() call created a new warning timer
    // that would all fire and show multiple warning dialogs.
    if (warningTimerId) {
      clearTimeout(warningTimerId);
      warningTimerId = null;
    }

    // Set new timeout for session expiry
    timeoutId = setTimeout(function() {
      handleSessionExpiry();
    }, SESSION_TIMEOUT_MS);

    // Also set warning timer for 5 minutes before expiry
    warningTimerId = setTimeout(function() {
      if (!warningShown) {
        showSessionWarning();
      }
    }, SESSION_TIMEOUT_MS - WARNING_TIME_MS);
  }

  /* ══════════════════════════════════════════════════════════ */
  /* 3. Session Warning - تنبيه قبل انتهاء الجلسة */
  /* ══════════════════════════════════════════════════════════ */

  function showSessionWarning() {
    if (warningShown) return;
    warningShown = true;

    // Create overlay
    sessionWarningOverlay = document.createElement('div');
    sessionWarningOverlay.id = 'session-warning-overlay';
    sessionWarningOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      backdrop-filter: blur(3px);
    `;

    // Create dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 18px;
      padding: 40px;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease-out;
      text-align: center;
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);

    // Build content
    const titleElement = document.createElement('h2');
    titleElement.style.cssText = `
      color: #ef4444;
      font-size: 24px;
      margin-bottom: 16px;
      font-weight: 700;
    `;
    titleElement.innerHTML = '⏱️ جلسة قيد الانتهاء<br><small style="font-size: 14px; color: #6b7280; font-weight: 400; display: block; margin-top: 8px;">Session Expiring</small>';

    const messageElement = document.createElement('p');
    messageElement.style.cssText = `
      color: #4b5563;
      font-size: 16px;
      margin: 20px 0;
      line-height: 1.5;
    `;
    messageElement.innerHTML = 'سيتم تسجيل خروجك تلقافياً خلال <strong id="countdown-timer">5:00</strong> دقائق<br><br>هل تريد البقاء مسجل الدخول؟';

    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
      display: flex;
      gap: 12px;
      margin-top: 28px;
    `;

    const stayButton = document.createElement('button');
    stayButton.innerHTML = '✓ البقاء مسجل الدخول';
    stayButton.style.cssText = `
      flex: 1;
      padding: 12px 20px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.3s;
    `;
    stayButton.onmouseover = function() { this.style.background = '#059669'; };
    stayButton.onmouseout = function() { this.style.background = '#10b981'; };
    stayButton.addEventListener('click', function() {
      dismissSessionWarning();
      recordActivity();
    });

    const logoutButton = document.createElement('button');
    logoutButton.innerHTML = '✕ تسجيل الخروج الآن';
    logoutButton.style.cssText = `
      flex: 1;
      padding: 12px 20px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.3s;
    `;
    logoutButton.onmouseover = function() { this.style.background = '#dc2626'; };
    logoutButton.onmouseout = function() { this.style.background = '#ef4444'; };
    logoutButton.addEventListener('click', performLogout);

    buttonsContainer.appendChild(stayButton);
    buttonsContainer.appendChild(logoutButton);

    dialog.appendChild(titleElement);
    dialog.appendChild(messageElement);
    dialog.appendChild(buttonsContainer);
    sessionWarningOverlay.appendChild(dialog);
    document.body.appendChild(sessionWarningOverlay);

    // Start countdown timer
    startCountdownTimer();
  }

  function dismissSessionWarning() {
    if (sessionWarningOverlay && sessionWarningOverlay.parentNode) {
      sessionWarningOverlay.parentNode.removeChild(sessionWarningOverlay);
      sessionWarningOverlay = null;
    }
    /* FIX: إيقاف countdown interval لمنع تسرب الذاكرة */
    if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
  }

  function startCountdownTimer() {
    let secondsLeft = 300; // 5 minutes
    const timerElement = document.getElementById('countdown-timer');
    /* FIX: إيقاف أي مؤقت سابق قبل بدء جديد */
    if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }

    _countdownInterval = setInterval(function() {
      secondsLeft--;
      if (secondsLeft < 0) {
        clearInterval(_countdownInterval);
        _countdownInterval = null;
        return;
      }

      const minutes = Math.floor(secondsLeft / 60);
      const seconds = secondsLeft % 60;
      if (timerElement) {
        timerElement.textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
      }
    }, 1000);
  }

  /* ══════════════════════════════════════════════════════════ */
  /* 4. Auto-Logout - تسجيل الخروج التلقائي */
  /* ══════════════════════════════════════════════════════════ */

  function handleSessionExpiry() {
    dismissSessionWarning();
    performLogout(true);
  }

  async function performLogout(isAutomatic) {
    try {
      // Try to notify backend about logout
      const token = getSessionTokenForLogout();
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'X-Session-Token': token
          },
          credentials: 'include',
          body: JSON.stringify({ automatic: Boolean(isAutomatic) })
        }).catch(function() {});
      }
    } catch (error) {
      console.warn('[SessionTimeout] Logout notification failed:', error);
    }

    // Clear session data
    try {
      ZS.removeItem('zeralda-session-token');
      ZS.removeItem('zeralda-auth-token');
    } catch (e) {}

    // Redirect to login
    const message = isAutomatic 
      ? 'انتهت جلستك بسبب استنزاف الوقت. يرجى تسجيل الدخول مرة أخرى.'
      : 'تم تسجيل خروجك بنجاح.';
    
    window.location.href = '/login.html?msg=' + encodeURIComponent(message);
  }

  function getSessionTokenForLogout() {
    if (window.ZeraldaAuth) return window.ZeraldaAuth.getSessionToken();
    // FIX: guard against ZS not being defined yet
    var zsToken = '';
    if (typeof ZS !== 'undefined' && ZS && ZS.getItem) {
      try { zsToken = ZS.getItem('zeralda-session-token') || ZS.getItem('zeralda-auth-token') || ''; } catch(e) {}
    }
    return zsToken || '';
  }

  /* ══════════════════════════════════════════════════════════ */
  /* 5. Initialization - البدء */
  /* ══════════════════════════════════════════════════════════ */

  function init() {
    // Only enable for authenticated users
    const token = getSessionTokenForLogout();
    if (!token) return;

    // Record initial activity
    recordActivity();

    // Add listeners
    addActivityListeners();

    // Start session timer
    resetSessionTimer();

    // Handle page visibility (paused when tab inactive)
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        recordActivity();
      }
    });

    // Warn user before closing if session will expire
    window.addEventListener('beforeunload', function(e) {
      if (timeoutId && lastActivityTime) {
        const timeLeft = SESSION_TIMEOUT_MS - (Date.now() - lastActivityTime);
        if (timeLeft < 60000) { // Less than 1 minute left
          e.preventDefault();
          e.returnValue = 'جلستك قريبة من الانتهاء. هل تريد المتابعة؟';
        }
      }
    });

    console.log('[SessionTimeout] ✅ Auto-logout initialized. Timeout: 10 hours');
  }

  // Initialize when DOM is ready — wait for ZDB first
  function startInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  if (window.ZDB && window.ZDB.ready) {
    window.ZDB.ready().then(startInit).catch(startInit);
  } else {
    startInit();
  }
})();
