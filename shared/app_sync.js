/* eslint-disable */
(function (root) {
	const TOKEN_KEY = "zeralda-auth-token";
	const AUTH_META_KEY = "zeralda-auth-meta";
	const REMEMBER_ME_TIMEOUT_MINUTES = 7 * 24 * 60;
	const ENFORCE_LOGIN = true;
	// DISABLED: ZS now handles all storage directly (sync XHR to server).
	// app_sync.js's expected_version caused 409 conflicts.
	const ENABLE_API_SYNC = false;
	const DEFAULT_SECURITY = {
		sessionTimeoutMinutes: 30,
		autoLogoutInactive: true
	};

	// إصلاح: استخدم counter بدل boolean لمنع race condition
	let _syncDepth = 0; // 0 = not syncing, >0 = syncing (يدعم التداخل)
	let ready = false;
	let authActivityBound = false;
	let unifiedDateObserver = null;
	let buttonTooltipObserver = null;
	const BUTTON_TOOLTIP_SELECTOR = 'button, .btn, input[type="button"], input[type="submit"], [role="button"], [onclick]';

	// Helper: هل المزامنة جارية؟
	function isSyncing() { return _syncDepth > 0; }
	// Helper: بدء مزامنة (يدعم التداخل)
	function beginSync() { _syncDepth++; }
	// Helper: إنهاء مزامنة
	function endSync() { if (_syncDepth > 0) _syncDepth--; }

	function getToken() {
		var token = ZS.getItem(TOKEN_KEY) || "";
		// FIX: if token is missing from ZS, try to recover from cookie
		// (cookies survive cache clears better than IndexedDB)
		if (!token) {
			try {
				var m = document.cookie.match(/zeralda-auth-token=([^;]+)/);
				if (m && m[1]) {
					token = decodeURIComponent(m[1]);
					// Restore to ZS
					try { ZS.setItem(TOKEN_KEY, token); } catch(e){}
					console.log('[app_sync] Token recovered from cookie');
				}
			} catch(e) {}
		}
		// FIX: if token exists in ZS but not in cookie, sync it to cookie
		if (token) {
			try {
				var m2 = document.cookie.match(/zeralda-auth-token=([^;]+)/);
				if (!m2 || decodeURIComponent(m2[1]) !== token) {
					document.cookie = "zeralda-auth-token=" + encodeURIComponent(token) +
						"; path=/; max-age=604800; SameSite=Lax";
				}
			} catch(e) {}
		}
		return token;
	}

	function readAuthMeta() {
		try {
			const raw = ZS.getItem(AUTH_META_KEY);
			if (!raw) return { failedByUser: {} };
			
			const parsed = JSON.parse(raw);
			
			// Validate parsed data
			if (!parsed || typeof parsed !== 'object') {
				return { failedByUser: {} };
			}
			
			const failedByUser = parsed.failedByUser && typeof parsed.failedByUser === 'object' 
				? parsed.failedByUser 
				: {};
			
			return { ...parsed, failedByUser };
		} catch (e) {
			console.warn('[app_sync] Failed to read auth meta:', e.message);
			return { failedByUser: {} };
		}
	}

	function writeAuthMeta(nextMeta) {
		try {
			// Validate meta object
			if (!nextMeta || typeof nextMeta !== 'object') {
				nextMeta = { failedByUser: {} };
			}
			
			// Ensure failedByUser exists
			if (!nextMeta.failedByUser || typeof nextMeta.failedByUser !== 'object') {
				nextMeta.failedByUser = {};
			}
			
			ZS.setItem(AUTH_META_KEY, JSON.stringify(nextMeta));
		} catch (e) {
			console.error('[app_sync] Failed to write auth meta:', e.message);
		}
	}

 	function clearSessionMeta() {
 		const meta = readAuthMeta();
 		writeAuthMeta({
 			failedByUser: meta.failedByUser || {},
 			userId: null,
 			loginAt: null,
 			lastActivityAt: null,
 			expiresAt: null
 		});
 	}
 
 	function clearSessionData() {
 		ZS.removeItem(TOKEN_KEY);
 		clearSessionMeta();
 	}

	function redirectToLogin() {
		const path = String(window.location.pathname || "").toLowerCase();
		if (path.endsWith("/login.html") || path.endsWith("login.html")) return;

		const current = window.location.pathname + window.location.search + window.location.hash;
		const isLoginTarget = /(^|\/)login\.html(\?|#|$)/i.test(current);
		const safeNext = isLoginTarget ? "/zeralda_erp_dashboard.html" : (current || "/zeralda_erp_dashboard.html");
		const next = encodeURIComponent(safeNext);
		window.location.href = "/login.html?next=" + next;
	}

	const _pendingWrites = {};
	let _flushTimer = null;
	let _bgSyncTimer = null;
	const BG_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
	const _failedWrites = {};
	// Per-key version cache for optimistic locking (expected_version).
	// Populated from /api/store/mget and /api/store responses.
	const _keyVersions = {};

	// ── Deleted IDs tracker ──
	// When an item is deleted locally, its ID is recorded so that the merge
	// logic (_mergeValues) does NOT re-add it from the server during pull.
	const _deletedIds = {}; // { scopedKey: { id: timestamp } }

	function _trackDeletedId(key, id) {
		try {
			var scopedK = (window.CompanyStorage && window.CompanyStorage.scopedKey)
				? window.CompanyStorage.scopedKey(key) : key;
			if (!_deletedIds[scopedK]) _deletedIds[scopedK] = {};
			_deletedIds[scopedK][String(id)] = Date.now();
			try {
				var stored = JSON.parse(localStorage.getItem('zeralda-deleted-ids') || '{}');
				if (!stored[scopedK]) stored[scopedK] = {};
				stored[scopedK][String(id)] = Date.now();
				localStorage.setItem('zeralda-deleted-ids', JSON.stringify(stored));
			} catch(e) {}
		} catch(e) {}
	}

	function _isDeletedId(key, id) {
		try {
			var scopedK = (window.CompanyStorage && window.CompanyStorage.scopedKey)
				? window.CompanyStorage.scopedKey(key) : key;
			if (_deletedIds[scopedK] && _deletedIds[scopedK][String(id)]) return true;
			var stored = JSON.parse(localStorage.getItem('zeralda-deleted-ids') || '{}');
			if (stored[scopedK] && stored[scopedK][String(id)]) {
				if (!_deletedIds[scopedK]) _deletedIds[scopedK] = {};
				_deletedIds[scopedK][String(id)] = stored[scopedK][String(id)];
				return true;
			}
		} catch(e) {}
		return false;
	}

	function _clearDeletedIds(key) {
		try {
			var scopedK = (window.CompanyStorage && window.CompanyStorage.scopedKey)
				? window.CompanyStorage.scopedKey(key) : key;
			delete _deletedIds[scopedK];
			try {
				var stored = JSON.parse(localStorage.getItem('zeralda-deleted-ids') || '{}');
				delete stored[scopedK];
				localStorage.setItem('zeralda-deleted-ids', JSON.stringify(stored));
			} catch(e) {}
		} catch(e) {}
	}

	root.trackDeletedId = _trackDeletedId;
	root.clearDeletedIds = _clearDeletedIds;

	// إصلاح: دالة دمج ذكية للقيم المتضاربة
	// mergeKey (اختياري): مفتاح scoped لاستبعاد العناصر المحذوفة محلياً
	function _mergeValues(serverVal, localVal, mergeKey) {
		// إذا إحداهما null، خذ الأخرى
		if (serverVal === null || serverVal === undefined) return localVal;
		if (localVal === null || localVal === undefined) return serverVal;
		// إذا كلاهما مصفوفات: ادمج بالـ id
		if (Array.isArray(serverVal) && Array.isArray(localVal)) {
			var merged = [];
			var seen = {};
			// أضف عناصر الخادم أولاً (استثنِ المحذوفة محلياً)
			serverVal.forEach(function (item) {
				if (item && item.id) {
					// FIX: استثني العناصر المحذوفة محلياً لمنع عودتها من الخادم
					if (mergeKey && _isDeletedId(mergeKey, item.id)) return;
					seen[String(item.id)] = item;
					merged.push(item);
				} else {
					merged.push(item);
				}
			});
			// أضف/حدّث عناصر المحلي
			localVal.forEach(function (item) {
				if (item && item.id) {
					var id = String(item.id);
					if (seen[id]) {
						// FIX: deep merge بدل Object.assign (shallow) —
						// previously nested objects were entirely replaced
						// by the local version, losing server-side nested data.
						seen[id] = _deepMergeObjects(seen[id], item);
						var idx = merged.findIndex(function (m) { return m && m.id === item.id; });
						if (idx >= 0) merged[idx] = seen[id];
					} else {
						seen[id] = item;
						merged.push(item);
					}
				} else {
					// عنصر بدون id — أضفه إذا غير موجود
					var exists = merged.some(function (m) { return JSON.stringify(m) === JSON.stringify(item); });
					if (!exists) merged.push(item);
				}
			});
			return merged;
		}
		// إذا كلاهما كائنات: ادمج الحقول (المحلي يفوز)
		if (typeof serverVal === 'object' && typeof localVal === 'object' && !Array.isArray(serverVal) && !Array.isArray(localVal)) {
			// FIX: deep merge بدل Object.assign (shallow) —
			// nested objects are now recursively merged instead of being
			// entirely overwritten by the local version.
			return _deepMergeObjects(serverVal, localVal);
		}
		// وإلا: المحلي يفوز (آخر تعديل للمستخدم)
		return localVal;
	}

	// FIX: Deep merge for nested objects. Recursively merges server and
	// local objects so that nested fields from both sides are preserved.
	// Local values win at the leaf level (last-write-wins per field).
	function _deepMergeObjects(serverObj, localObj) {
		if (serverObj === null || serverObj === undefined) return localObj;
		if (localObj === null || localObj === undefined) return serverObj;
		if (typeof serverObj !== 'object' || typeof localObj !== 'object') return localObj;
		if (Array.isArray(serverObj) || Array.isArray(localObj)) {
			// Arrays are handled by _mergeValues (ID-based merge)
			return _mergeValues(serverObj, localObj);
		}
		var result = {};
		// Copy all server keys first
		Object.keys(serverObj).forEach(function (key) {
			result[key] = serverObj[key];
		});
		// Merge local keys (recursively for nested objects)
		Object.keys(localObj).forEach(function (key) {
			var sv = result[key];
			var lv = localObj[key];
			if (typeof sv === 'object' && sv !== null && !Array.isArray(sv) &&
				typeof lv === 'object' && lv !== null && !Array.isArray(lv)) {
				result[key] = _deepMergeObjects(sv, lv);
			} else if (Array.isArray(sv) && Array.isArray(lv)) {
				result[key] = _mergeValues(sv, lv);
			} else {
				result[key] = lv;  // local wins at leaf level
			}
		});
		return result;
	}

	function queueSet(key, value) {
		if (!ENABLE_API_SYNC || !key || key === TOKEN_KEY) return;
		if (key === AUTH_META_KEY) return;
		// 'zeralda-settings' is no longer excluded — it must sync to the server
		// so that company info (activeCompanyId, companies array) persists across
		// browsers/devices and survives browser data clearing.
		// إصلاح جذري: scope المفتاح عند وقت التخزين، وليس عند وقت الإرسال.
		var scopedK = (window.CompanyStorage && window.CompanyStorage.scopedKey)
			? window.CompanyStorage.scopedKey(key) : key;
		_pendingWrites[scopedK] = value;
		// إصلاح: persist pending writes فوراً (بدون تأخير 500ms)
		_persistPendingWritesImmediate();
		// إصلاح جذري: مزامنة لحظية — أرسل فوراً بدل انتظار 2 ثانية
		clearTimeout(_flushTimer);
		_flushPendingDebounced();
	}

	// مزامنة لحظية مع debounce قصير (200ms بدل 2000ms)
	var _instantFlushTimer = null;
	function _flushPendingDebounced() {
		if (_instantFlushTimer) clearTimeout(_instantFlushTimer);
		_instantFlushTimer = setTimeout(function() {
			flushPending();
		}, 200);
	}

	// persist فوري لـ pending writes (بدون debounce)
	function _persistPendingWritesImmediate() {
		try {
			var storageKey = _getPendingWritesKey();
			var snapshot = {};
			Object.keys(_pendingWrites).forEach(function(k) {
				if (k.indexOf('__flushing') === -1) {
					snapshot[k] = _pendingWrites[k];
				}
			});
			if (window.ZDB && window.ZDB.setItem) {
				window.ZDB.setItem(storageKey, JSON.stringify(snapshot));
			}
		} catch(e) {}
	}

	// إصلاح: persist pending writes في مفتاح خاص في IndexedDB
	// إصلاح: استخدم tab ID لمنع التداخل بين التبويبات
	var _persistTimer = null;
	function _getPendingWritesKey() {
		var tabId = (window.ZDB && window.ZDB.getTabId) ? window.ZDB.getTabId() : 'default';
		return 'zeralda-pending-writes::' + tabId;
	}
	function _persistPendingWrites() {
		if (_persistTimer) clearTimeout(_persistTimer);
		_persistTimer = setTimeout(function () {
			try {
				// إصلاح: تجاهل مفاتيح __flushing (لا تُخزّن في IndexedDB)
				var keys = Object.keys(_pendingWrites).filter(function(k) { return k.indexOf('__flushing') === -1; });
				var storageKey = _getPendingWritesKey();
				if (keys.length === 0) {
					window.ZDB && window.ZDB.removeItem(storageKey);
					return;
				}
				var snapshot = {};
				keys.forEach(function (k) { snapshot[k] = _pendingWrites[k]; });
				window.ZDB && window.ZDB.setItem(storageKey, JSON.stringify(snapshot));
			} catch (_) {}
		}, 500);
	}

	// إصلاح: استرجاع pending writes عند بدء التشغيل
	function _restorePendingWrites() {
		try {
			// إصلاح: استرجع من مفتاح التبويب الحالي + أي مفاتيح قديمة (backward compat)
			var storageKey = _getPendingWritesKey();
			var raw = window.ZDB && window.ZDB.getItem(storageKey);
			// Fallback: مفتاح قديم بدون tab ID
			if (!raw) raw = window.ZDB && window.ZDB.getItem('zeralda-pending-writes');

			// BUG #5 fix: also scan for pending writes from OTHER tabs that
			// crashed. Each tab stores under 'zeralda-pending-writes::tab-XXX'.
			// A new tab can recover those writes by enumerating all keys with
			// the 'zeralda-pending-writes::' prefix.
			var allPendingSnapshots = [];
			if (raw) allPendingSnapshots.push({ key: storageKey, raw: raw });

			if (window.ZDB && typeof window.ZDB.keys === 'function') {
				try {
					var allKeys = window.ZDB.keys();
					for (var ai = 0; ai < allKeys.length; ai++) {
						var ak = allKeys[ai];
						if (typeof ak !== 'string') continue;
						if (ak.indexOf('zeralda-pending-writes::') !== 0) continue;
						if (ak === storageKey) continue; // already have it
						var otherRaw = window.ZDB.getItem(ak);
						if (otherRaw) {
							allPendingSnapshots.push({ key: ak, raw: otherRaw });
						}
					}
				} catch (_) {}
			}

			if (allPendingSnapshots.length === 0) return;
			var totalRecovered = 0;
			allPendingSnapshots.forEach(function (entry) {
				try {
					var snapshot = JSON.parse(entry.raw);
					if (!snapshot || typeof snapshot !== 'object') return;
					var keys = Object.keys(snapshot);
					if (keys.length > 1000) {
						console.warn('[app_sync] Suspiciously large pending writes:', keys.length, '— skipping');
						return;
					}
					keys.forEach(function (k) {
						if (typeof k !== 'string' || k.length > 500) return;
						if (k === TOKEN_KEY || k === AUTH_META_KEY) return;
						if (k.indexOf('__flushing') !== -1) return;
						var v = snapshot[k];
						try { JSON.stringify(v); } catch (e) { return; }
						if (!(k in _pendingWrites)) {
							_pendingWrites[k] = v;
							totalRecovered++;
						}
					});
					// Clean up the recovered tab's key
					if (entry.key !== storageKey) {
						try { window.ZDB && window.ZDB.removeItem(entry.key); } catch (_) {}
					}
				} catch (_) {}
			});
			if (totalRecovered > 0) {
				console.log('[app_sync] Recovered', totalRecovered, 'pending writes from previous/crashed sessions');
				// إصلاح حرج: جدول flushPending لإرسال الـ pending writes المسترجعة
				// للخادم. بدون هذا، تُسترجع الكتابات لكن لا تُرسل أبداً، مما يسبب
				// عودة البيانات المحذوفة عند الـ pull التالي من الخادم.
				clearTimeout(_flushTimer);
				_flushTimer = setTimeout(flushPending, 100);
			}
			// إصلاح: امسح المفتاح القديم بدون tab ID
			try { window.ZDB && window.ZDB.removeItem('zeralda-pending-writes'); } catch (_) {}
		} catch (_) {}
	}

	async function flushPending() {
		if (!ENABLE_API_SYNC) return;
		const token = getToken();
		if (!token) return;
		// إصلاح جذري: تجاهل أي مفاتيح __flushing متبقية من نسخ قديمة
		var allKeys = Object.keys(_pendingWrites).filter(function(k) { return k.indexOf('__flushing') === -1; });
		if (!allKeys.length) return;
		const snapshot = {};
		allKeys.forEach(function (k) { snapshot[k] = _pendingWrites[k]; });
		// BUG #2 fix: do NOT delete from _pendingWrites before sending.
		// If a new write arrives during the async flush, the pre-delete +
		// post-success delete would silently discard it. Instead, we keep
		// the keys in _pendingWrites during flush and only delete on success
		// if the value hasn't changed (no new write interleaved).
		var promises = [];
		for (var i = 0; i < allKeys.length; i++) {
			(function (serverKey, rawVal) {
				// serverKey هو بالفعل scoped (مثلاً "invoices-data::companyA")
				// اشتقاق localKey (غير scoped) لاستخدامه في ZS.setItem الذي سيعيد scope تلقائياً
				var scopedMatch = serverKey.match(/^(.+)::([^:]+)$/);
				var localKey = scopedMatch ? scopedMatch[1] : serverKey;
				var parsedVal = rawVal;
				if (typeof rawVal === 'string') {
					try { parsedVal = JSON.parse(rawVal); } catch (_) { parsedVal = rawVal; }
				}
				// Send expected_version if we have one for this server key (optimistic locking).
				var bodyObj = { key: serverKey, value: parsedVal };
				if (_keyVersions[serverKey] !== undefined && _keyVersions[serverKey] !== -1) {
					bodyObj.expected_version = _keyVersions[serverKey];
				}
				promises.push(
					fetch('/api/store', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': 'Bearer ' + token,
							'X-Session-Token': token
						},
						body: JSON.stringify(bodyObj)
					}).then(function (res) {
						if (res.status === 409) {
							// Version conflict — re-pull, MERGE, then retry.
							return res.json().then(function (conflict) {
								_keyVersions[serverKey] = conflict.current_version;
								console.warn('[app_sync] Version conflict for', localKey, '- re-pulling and merging');
								return fetch('/api/store?key=' + encodeURIComponent(serverKey), {
									headers: { 'Authorization': 'Bearer ' + token, 'X-Session-Token': token }
								}).then(function (r) { return r.json(); }).then(function (fresh) {
									var serverVal = fresh.value;
									if (typeof serverVal === 'string') {
										try { serverVal = JSON.parse(serverVal); } catch (_) {}
									}
									_keyVersions[serverKey] = fresh.version;
									// إصلاح: دمج حقيقي بدلاً من force overwrite
									var mergedVal = _mergeValues(serverVal, parsedVal, localKey);
									// اكتب القيمة المدموجة محلياً
									try { ZS.setItem(localKey, JSON.stringify(mergedVal)); } catch (_) {}
									// اكتب القيمة المدموجة للخادم
									return fetch('/api/store', {
										method: 'POST',
										headers: {
											'Content-Type': 'application/json',
											'Authorization': 'Bearer ' + token,
											'X-Session-Token': token
										},
										body: JSON.stringify({ key: serverKey, value: JSON.stringify(mergedVal) })
									}).then(function (retryRes) {
										if (retryRes.ok) {
											delete _failedWrites[serverKey];
											return retryRes.json().then(function (rb) {
												if (rb && rb.version !== undefined) _keyVersions[serverKey] = rb.version;
											});
										}
										throw new Error('retry failed: ' + retryRes.status);
									});
								});
							}).catch(function (err) {
								console.warn('[app_sync] Conflict resolution failed for', serverKey, ':', err.message || err);
								_failedWrites[serverKey] = (_failedWrites[serverKey] || 0) + 1;
							});
						}
						if (!res.ok) {
							console.warn('[app_sync] Push failed for key', serverKey, ':', res.status);
							_failedWrites[serverKey] = (_failedWrites[serverKey] || 0) + 1;
							if (_failedWrites[serverKey] < 5 && !(serverKey in _pendingWrites)) {
								_pendingWrites[serverKey] = rawVal;
								// إصلاح: exponential backoff مع jitter
								var attempt = _failedWrites[serverKey];
								var baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 60000); // 1s, 2s, 4s, 8s, 16s (max 60s)
								var jitter = Math.random() * 500; // 0-500ms jitter
								setTimeout(flushPending, baseDelay + jitter);
							} else if (_failedWrites[serverKey] >= 5) {
								console.error('[app_sync] Push failed 5 times for', serverKey, '- data may be lost');
								// إشعار المستخدم
								try {
									if (typeof window !== 'undefined' && window.dispatchEvent) {
										window.dispatchEvent(new CustomEvent('app-sync-write-failed', { detail: { key: serverKey, attempts: _failedWrites[serverKey] } }));
									}
								} catch (_) {}
							}
						} else {
							delete _failedWrites[serverKey];
							/* BUG #2 fix: only delete from _pendingWrites if the value
							 * hasn't changed since the snapshot (no new write interleaved
							 * during the async flush). If it has changed, keep it for
							 * the next flush cycle. */
							if (serverKey in _pendingWrites && _pendingWrites[serverKey] === rawVal) {
								delete _pendingWrites[serverKey];
							}
							// Update version cache from server response
							return res.json().then(function (rb) {
								if (rb && rb.version !== undefined) _keyVersions[serverKey] = rb.version;
							}).catch(function () {});
						}
					}).catch(function (err) {
						_failedWrites[serverKey] = (_failedWrites[serverKey] || 0) + 1;
						if (_failedWrites[serverKey] < 5 && !(serverKey in _pendingWrites)) {
							_pendingWrites[serverKey] = rawVal;
							// إصلاح: exponential backoff مع jitter
							var attempt = _failedWrites[serverKey];
							var baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 60000);
							var jitter = Math.random() * 500;
							setTimeout(flushPending, baseDelay + jitter);
						}
						console.warn('[app_sync] Push error:', err.message || err);
					})
			);
		})(allKeys[i], snapshot[allKeys[i]]);
	}
	await Promise.all(promises);
	// إصلاح: مسح pending writes persist بعد نجاح flush
	var remaining = Object.keys(_pendingWrites).length;
	if (remaining === 0) {
		try { window.ZDB && window.ZDB.removeItem(_getPendingWritesKey()); } catch (_) {}
	}
}

	function patchLocalStorage() {
		if (!ENABLE_API_SYNC) return; // No-op when API sync is disabled
		// Patch ZS (Zeralda Storage) to intercept writes and queue server sync.
		// We no longer patch localStorage directly — all app code uses ZS now.
		if (!window.ZS) return;
		const originalSet = window.ZS.setItem.bind(window.ZS);
		const originalRemove = window.ZS.removeItem.bind(window.ZS);

		window.ZS.setItem = function (key, value) {
			originalSet(key, value);
			if (!isSyncing() && ready) queueSet(key, value);
		};

		window.ZS.removeItem = function (key) {
			originalRemove(key);
			if (!isSyncing() && ready) queueSet(key, null);
		};
	}

	function readSettings() {
		try {
			const raw = ZS.getItem("zeralda-settings");
			if (!raw) return {};
			
			const parsed = JSON.parse(raw);
			
			// Validate settings structure
			if (!parsed || typeof parsed !== 'object') {
				console.warn('[app_sync] Invalid settings format, resetting');
				return {};
			}
			
			return parsed;
		} catch (e) {
			console.error('[app_sync] Settings parse error:', e.message);
			return {};
		}
	}

	function writeSettings(next) {
		try {
			// Validate settings before writing
			if (!next || typeof next !== 'object') {
				console.warn('[app_sync] Invalid settings object, not writing');
				return;
			}
			
			// حماية: لا تحذف الشركات إذا لم يتم تمريرها في next
			const current = readSettings();
			if (!next.hasOwnProperty('companies') && current.companies) {
				next.companies = current.companies;
			}
			if (!next.hasOwnProperty('activeCompanyId') && current.activeCompanyId) {
				next.activeCompanyId = current.activeCompanyId;
			}
			
			ZS.setItem("zeralda-settings", JSON.stringify(next));
		} catch (e) {
			console.error('[app_sync] Failed to write settings:', e.message);
		}
	}

	function getSecuritySettings() {
		const settings = readSettings();
		return { ...DEFAULT_SECURITY, ...(settings.security || {}) };
	}

	function parseUTCOffset(tzStr) {
		if (!tzStr || typeof tzStr !== "string") return 0;
		const m = tzStr.match(/UTC([+-]\d{1,2})/);
		if (!m) return 0;
		const v = parseInt(m[1], 10);
		return isNaN(v) ? 0 : v;
	}

	function getProgramNow() {
		const settings = readSettings();
		const offset = parseUTCOffset(settings.timezone || "UTC+1");
		const now = new Date();
		const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
		return new Date(utcTime + offset * 3600000);
	}

	function injectUnifiedDateStyles() {
		if (document.getElementById("unifiedDateStyles")) return;
		const style = document.createElement("style");
		style.id = "unifiedDateStyles";
		style.textContent = ""
			+ ".unified-date-wrap{display:flex;align-items:center;gap:8px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;padding:8px 10px;}"
			+ ".unified-date-part{border:none;background:transparent;min-width:64px;padding:4px;font-size:14px;outline:none;}"
			+ ".unified-date-sep{color:#6b7280;font-weight:700;line-height:1;}"
			+ ".unified-date-hidden{position:absolute !important;opacity:0 !important;pointer-events:none !important;width:1px !important;height:1px !important;border:0 !important;padding:0 !important;margin:0 !important;}";
		document.head.appendChild(style);
	}

	function toISODate(year, month, day) {
		return String(year) + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
	}

	function parseISODate(value) {
		const text = String(value || "");
		if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
		const y = Number(text.slice(0, 4));
		const m = Number(text.slice(5, 7));
		const d = Number(text.slice(8, 10));
		if (!y || !m || !d) return null;
		return { y, m, d };
	}

	function dispatchDateEvents(input) {
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	}

	function enhanceDateInput(input) {
		if (!input || input.dataset.unifiedDateEnhanced === "1") return;
		if (input.type !== "date") return;

		const wrap = document.createElement("div");
		wrap.className = "unified-date-wrap";

		const daySel = document.createElement("select");
		daySel.className = "unified-date-part";
		const monthSel = document.createElement("select");
		monthSel.className = "unified-date-part";
		const yearSel = document.createElement("select");
		yearSel.className = "unified-date-part";

		for (let day = 1; day <= 31; day += 1) {
			const option = document.createElement("option");
			option.value = String(day);
			option.textContent = String(day);
			daySel.appendChild(option);
		}
		for (let month = 1; month <= 12; month += 1) {
			const option = document.createElement("option");
			option.value = String(month);
			option.textContent = String(month);
			monthSel.appendChild(option);
		}

		const currentYear = getProgramNow().getFullYear();
		for (let year = currentYear - 1; year <= currentYear + 8; year += 1) {
			const option = document.createElement("option");
			option.value = String(year);
			option.textContent = String(year);
			yearSel.appendChild(option);
		}

		const parsed = parseISODate(input.value);
		const baseDate = parsed || { y: currentYear, m: getProgramNow().getMonth() + 1, d: Math.min(31, getProgramNow().getDate()) };
		daySel.value = String(baseDate.d);
		monthSel.value = String(baseDate.m);
		yearSel.value = String(baseDate.y);
		input.value = toISODate(baseDate.y, baseDate.m, baseDate.d);

		const syncInput = function () {
			const day = Number(daySel.value || 1);
			const month = Number(monthSel.value || 1);
			const year = Number(yearSel.value || currentYear);
			input.value = toISODate(year, month, Math.min(31, day));
			dispatchDateEvents(input);
		};

		daySel.addEventListener("change", syncInput);
		monthSel.addEventListener("change", syncInput);
		yearSel.addEventListener("change", syncInput);

		wrap.appendChild(daySel);
		wrap.appendChild(monthSel);
		wrap.appendChild(yearSel);

		input.classList.add("unified-date-hidden");
		input.dataset.unifiedDateEnhanced = "1";
		input.insertAdjacentElement("afterend", wrap);
		dispatchDateEvents(input);
	}

	function applyUnifiedDatePickers(root) {
		injectUnifiedDateStyles();
		const scope = root && root.querySelectorAll ? root : document;
		scope.querySelectorAll('input[type="date"]').forEach((input) => enhanceDateInput(input));
	}

	function startUnifiedDateObserver() {
		if (unifiedDateObserver) return;
		var debounceTimer = null;
		unifiedDateObserver = new MutationObserver((mutations) => {
			// Throttle: batch multiple mutations into one scan
			if (debounceTimer) return;
			debounceTimer = setTimeout(function () {
				debounceTimer = null;
				mutations.forEach((mutation) => {
					mutation.addedNodes.forEach((node) => {
						if (!(node instanceof Element)) return;
						if (node.matches && node.matches('input[type="date"]')) {
							enhanceDateInput(node);
							return;
						}
						applyUnifiedDatePickers(node);
					});
				});
			}, 100);
		});
		unifiedDateObserver.observe(document.body, { childList: true, subtree: true });
	}

	let _lastActivityWrite = 0;
	function markAuthActivity() {
		if (!getToken()) return;
		var now = Date.now();
		if (now - _lastActivityWrite < 15000) return;
		_lastActivityWrite = now;
		const security = getSecuritySettings();
		const baseTimeoutMinutes = Math.max(5, Math.min(1440, Number(security.sessionTimeoutMinutes || 60)));
		const meta = readAuthMeta();
		const timeoutMinutes = meta.rememberMe ? Math.max(baseTimeoutMinutes, REMEMBER_ME_TIMEOUT_MINUTES) : baseTimeoutMinutes;
		const nextMeta = {
			...meta,
			lastActivityAt: now
		};
		if (security.autoLogoutInactive) {
			nextMeta.expiresAt = now + timeoutMinutes * 60 * 1000;
		}
		writeAuthMeta(nextMeta);
	}

	function ensureAuthActivityTracking() {
		if (authActivityBound) return;
		authActivityBound = true;
		["click", "keydown", "mousemove", "scroll", "touchstart"].forEach((eventName) => {
			window.addEventListener(eventName, markAuthActivity, { passive: true });
		});
	}

	function isSessionExpired() {
		if (!getToken()) return false;
		const security = getSecuritySettings();
		if (!security.autoLogoutInactive) return false;
		const meta = readAuthMeta();
		const now = Date.now();
		const expiresAt = Number(meta.expiresAt || 0);
		if (expiresAt > 0) return now > expiresAt;

		const baseTimeoutMinutes = Math.max(5, Math.min(1440, Number(security.sessionTimeoutMinutes || 60)));
		const timeoutMinutes = meta.rememberMe ? Math.max(baseTimeoutMinutes, REMEMBER_ME_TIMEOUT_MINUTES) : baseTimeoutMinutes;
		const lastActivityAt = Number(meta.lastActivityAt || meta.loginAt || 0);
		if (!lastActivityAt) return false;
		return now - lastActivityAt > timeoutMinutes * 60 * 1000;
	}

	function enforceSessionTimeout() {
		if (!getToken()) return false;
		if (!isSessionExpired()) {
			markAuthActivity();
			return false;
		}
		ZS.removeItem(TOKEN_KEY);
		clearSessionMeta();
		redirectToLogin();
		return true;
	}

	function getPreferredLang() {
		const settings = readSettings();
		const lang = String(settings.preferredLanguage || ZS.getItem("preferred-language") || "en").toLowerCase();
		return lang === "ar" || lang === "fr" ? lang : "en";
	}

	function getTooltipPrefix() {
		const lang = getPreferredLang();
		if (lang === "ar") return "انقر";
		if (lang === "fr") return "Cliquez";
		return "Click";
	}

	function getButtonLabel(el) {
		if (!el) return "";
		const lang = getPreferredLang();
		const aria = (el.getAttribute("aria-label") || "").trim();
		if (aria) return aria;
		const dataLang = (el.getAttribute("data-" + lang) || "").trim();
		if (dataLang) return dataLang;
		const dataEn = (el.getAttribute("data-en") || "").trim();
		if (dataEn) return dataEn;
		if (el.tagName === "INPUT") {
			const v = String(el.value || "").trim();
			if (v) return v;
		}
		const childSpan = el.querySelector ? el.querySelector("span") : null;
		if (childSpan) {
			const spanText = String(childSpan.textContent || "").replace(/\s+/g, " ").trim();
			if (spanText) return spanText;
		}
		const txt = String(el.textContent || "")
			.replace(/\s+/g, " ")
			.replace(/[\n\r\t]+/g, " ")
			.trim();
		return txt;
	}

	function normalizeTooltipLabel(label) {
		const compact = String(label || "")
			.replace(/\s+/g, " ")
			.replace(/\s*[|•·]+\s*/g, " ")
			.trim();
		if (!compact) return "";
		const sliced = compact.length > 20 ? compact.slice(0, 20).trim() + "..." : compact;
		return sliced;
	}

	function setTooltipIfMissing(el) {
		if (!el || el.dataset.autoTooltipLocked === "1") return;
		if (!(el instanceof Element)) return;
		const isClickable =
			el.tagName === "BUTTON" ||
			el.classList.contains("btn") ||
			el.getAttribute("role") === "button" ||
			el.hasAttribute("onclick") ||
			el.matches('input[type="button"], input[type="submit"]');
		if (!isClickable) return;
		const existingTitle = String(el.getAttribute("title") || "").trim();
		if (existingTitle && el.dataset.autoTooltip !== "1") return;
		const label = normalizeTooltipLabel(getButtonLabel(el));
		if (!label) return;
		el.setAttribute("title", getTooltipPrefix() + " " + label);
		el.dataset.autoTooltip = "1";
	}

	function applyGlobalButtonTooltips(root) {
		const scope = root && root.querySelectorAll ? root : document;
		if (scope instanceof Element && scope.matches && scope.matches(BUTTON_TOOLTIP_SELECTOR)) {
			setTooltipIfMissing(scope);
		}
		scope.querySelectorAll(BUTTON_TOOLTIP_SELECTOR).forEach((el) => setTooltipIfMissing(el));
	}

	function startButtonTooltipObserver() {
		if (buttonTooltipObserver) return;
		var debounceTimer = null;
		buttonTooltipObserver = new MutationObserver((mutations) => {
			// Throttle: batch multiple mutations into one scan
			if (debounceTimer) return;
			debounceTimer = setTimeout(function () {
				debounceTimer = null;
				mutations.forEach((mutation) => {
					mutation.addedNodes.forEach((node) => {
						if (!(node instanceof Element)) return;
						if (node.matches && node.matches(BUTTON_TOOLTIP_SELECTOR)) {
							setTooltipIfMissing(node);
						}
						node.querySelectorAll(BUTTON_TOOLTIP_SELECTOR).forEach((el) => setTooltipIfMissing(el));
					});
				});
			}, 100);
		});
		buttonTooltipObserver.observe(document.body, {
			childList: true,
			subtree: true
		});
	}

	function tHeader(key) {
		const lang = getPreferredLang();
		const dict = {
			en: { switch_user: "Switch User", logout: "Logout", no_users: "No users" },
			ar: { switch_user: "تغيير المستخدم", logout: "تسجيل الخروج", no_users: "لا يوجد مستخدمون" },
			fr: { switch_user: "Changer d'utilisateur", logout: "Déconnexion", no_users: "Aucun utilisateur" }
		};
		return (dict[lang] && dict[lang][key]) || (dict.en && dict.en[key]) || key;
	}

	function tHeaderUserName() {
		const lang = getPreferredLang();
		if (lang === "ar") return "مستخدم الخدمات";
		if (lang === "fr") return "Utilisateur des services";
		return "Services User";
	}

	function translateRoleLabel(roleLabel) {
		const lang = getPreferredLang();
		const raw = String(roleLabel || "").trim().toLowerCase();
		const roleMap = {
			administrator: { en: "Administrator", ar: "مدير", fr: "Administrateur" },
			admin: { en: "Administrator", ar: "مدير", fr: "Administrateur" },
			"مدير": { en: "Administrator", ar: "مدير", fr: "Administrateur" },
			"مدير النظام": { en: "Administrator", ar: "مدير", fr: "Administrateur" },
			administrateur: { en: "Administrator", ar: "مدير", fr: "Administrateur" }
		};
		const entry = roleMap[raw] || null;
		if (!entry) return String(roleLabel || "Administrator");
		return entry[lang] || entry.en;
	}

	function applyHeaderNameTranslation() {
		const info = document.querySelector(".user-info");
		if (!info) return;
		const name = tHeaderUserName();
		const nameEl = info.querySelector(".user-name");
		if (nameEl) {
			nameEl.textContent = name;
			return;
		}
		const lines = info.querySelectorAll("div > div");
		if (lines && lines.length) {
			lines[0].textContent = name;
		}
	}

	function getHeaderRoleElement(info) {
		if (!info) return null;
		const classBased = info.querySelector(".user-role");
		if (classBased) return classBased;
		const lines = info.querySelectorAll("div > div");
		if (lines && lines.length > 1) return lines[1];
		return null;
	}

	function applyHeaderRoleTranslation(user) {
		const info = document.querySelector(".user-info");
		if (!info) return;
		const roleEl = getHeaderRoleElement(info);
		if (!roleEl) return;
		const roleCandidate =
			(user && (user.roleLabel || user.role || user.userRole)) ||
			roleEl.getAttribute("data-en") ||
			roleEl.getAttribute("data-key") ||
			roleEl.textContent ||
			"Administrator";
		roleEl.textContent = translateRoleLabel(roleCandidate);
	}

	function getUsersContext() {
		const settings = readSettings();
		const users = Array.isArray(settings.users) ? settings.users : [];
		let activeUserId = settings.activeUserId || null;
		if (!activeUserId && users.length) {
			const firstActive = users.find((u) => u && u.active) || users[0];
			activeUserId = firstActive ? firstActive.id : null;
			writeSettings({ ...settings, activeUserId });
		}
		const activeUser = users.find((u) => u && u.id === activeUserId) || null;
		return { settings, users, activeUserId, activeUser };
	}

	function applyHeaderActiveUser(user) {
		if (!user) return;
		const avatarEl = document.querySelector(".user-avatar");
		if (avatarEl) {
			const parts = String(user.fullName || "U").trim().split(/\s+/).filter(Boolean);
			const initials = ((parts[0] && parts[0][0]) || "U") + ((parts[1] && parts[1][0]) || "");
			avatarEl.textContent = initials.toUpperCase();
		}

		applyHeaderNameTranslation();
		applyHeaderRoleTranslation(user);
	}

	function renderHeaderUserControls() {
		const headerRight = document.querySelector(".header-right");
		if (!headerRight) return;
		if (document.getElementById("headerUserSwitcher") || document.getElementById("headerLogoutBtn")) return;

		const { settings, users, activeUserId, activeUser } = getUsersContext();
		if (activeUser) applyHeaderActiveUser(activeUser);
		else {
			applyHeaderNameTranslation();
			applyHeaderRoleTranslation(null);
		}

		const wrap = document.createElement("div");
		wrap.className = "header-user-controls-wrap";
		wrap.style.display = "flex";
		wrap.style.gap = "8px";
		wrap.style.alignItems = "center";

		const select = document.createElement("select");
		select.id = "headerUserSwitcher";
		select.setAttribute("aria-label", tHeader("switch_user"));
		select.style.cssText = "background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: white; border-radius: 10px; padding: 8px 10px; font-size: 12px; max-width: 180px;";

		if (!users.length) {
			const opt = document.createElement("option");
			opt.value = "";
			opt.textContent = tHeader("no_users");
			select.appendChild(opt);
			select.disabled = true;
		} else {
			users.forEach((u) => {
				if (!u || u.active === false) return;
				const opt = document.createElement("option");
				opt.value = u.id;
				opt.textContent = u.fullName || "User";
				select.appendChild(opt);
			});
			select.value = activeUserId || "";
		}

		select.addEventListener("change", () => {
			const id = select.value;
			if (!id) return;
			const next = { ...settings, activeUserId: id };
			writeSettings(next);
			const meta = readAuthMeta();
			writeAuthMeta({ ...meta, userId: id || null });
			const user = (Array.isArray(next.users) ? next.users : []).find((u) => u && u.id === id);
			if (user) applyHeaderActiveUser(user);
			else {
				applyHeaderNameTranslation();
				applyHeaderRoleTranslation(null);
			}
			// Switch Google session to the new user's stored token/profile
			if (typeof window.ZeraldaGoogle === 'object' && typeof window.ZeraldaGoogle.switchUser === 'function') {
				try { window.ZeraldaGoogle.switchUser(); } catch (_) {}
			}
		});

		const logoutBtn = document.createElement("button");
		logoutBtn.id = "headerLogoutBtn";
		logoutBtn.type = "button";
		logoutBtn.textContent = tHeader("logout");
		logoutBtn.style.cssText = "background: #ef4444; color: white; border: none; border-radius: 10px; padding: 8px 10px; font-size: 12px; cursor: pointer;";
		logoutBtn.addEventListener("click", () => {
			ZS.removeItem(TOKEN_KEY);
			clearSessionMeta();
			redirectToLogin();
		});

		wrap.appendChild(select);
		wrap.appendChild(logoutBtn);
		headerRight.appendChild(wrap);

		const langSwitcher = document.getElementById("headerLanguageSwitcher");
		if (langSwitcher && !langSwitcher.dataset.roleTranslationBound) {
			langSwitcher.dataset.roleTranslationBound = "1";
			langSwitcher.addEventListener("change", () => {
				setTimeout(() => {
					const nextCtx = getUsersContext();
					applyHeaderNameTranslation();
					applyHeaderRoleTranslation(nextCtx.activeUser || null);
				}, 0);
			});
		}
	}

	async function maybeMigrateFromLocal() {
		// Push any locally-stored ERP data to server if server has nothing
		var token = getToken();
		if (!token) return;
		try {
			var res = await fetch('/api/store', {
				headers: { 'Authorization': 'Bearer ' + token, 'X-Session-Token': token }
			});
			if (!res.ok) return;
			var body = await res.json();
			var store = body.data || body.store || {};
			var hasData = store && Object.keys(store).length > 0;
			if (hasData) return; // Server already has data, no migration needed

			// Server is empty — push local data
			var DATA_KEYS = (window.CompanyStorage && window.CompanyStorage.scopedKeys) || [];
			var companyId = (window.CompanyStorage && window.CompanyStorage.getActiveCompanyId)
				? window.CompanyStorage.getActiveCompanyId() : 'default-company';
			var migrated = 0;
			for (var mi = 0; mi < DATA_KEYS.length; mi++) {
				var k = DATA_KEYS[mi];
				var raw = ZS.getItem(k);
				if (!raw) continue;
				// Parse the ZS string to a proper JSON value before sending
				// so the server stores {key: [...]} not {key: "[...]"} (double-encoded)
				var parsedValue;
				try { parsedValue = JSON.parse(raw); } catch (_) { parsedValue = raw; }
				var serverKey = k + '::' + companyId;
				await fetch('/api/store', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Session-Token': token },
					body: JSON.stringify({ key: serverKey, value: parsedValue })
				});
				migrated++;
			}
			if (migrated) console.log('[app_sync] Migrated ' + migrated + ' keys to server');
		} catch (e) {
			console.warn('[app_sync] Migration skipped:', e.message || e);
		}
	}

	async function pullAllToLocalStorage() {
		if (!ENABLE_API_SYNC) return;
		// Incremental pull: fetch only the scoped keys for the active company
		// (plus zeralda-settings and the owner's scoped keys for clone detection)
		// instead of pulling the entire server store (which can be hundreds of MB).
		var token = getToken();
		if (!token) return;
		try {
			var companyId = (window.CompanyStorage && window.CompanyStorage.getActiveCompanyId)
				? window.CompanyStorage.getActiveCompanyId() : 'default-company';
			var scopedSet = (window.CompanyStorage && window.CompanyStorage.scopedKeys) || [];

			// Clone detection: get owner company ID
			var rawSettings = ZS.getItem('zeralda-settings');
			var parsedSettings = rawSettings ? JSON.parse(rawSettings) : {};
			var companies = parsedSettings && Array.isArray(parsedSettings.companies) ? parsedSettings.companies : [];
			var ownerId = String((companies[0] && companies[0].id) || '');

			// Build the list of server keys to fetch (only what we need).
			// BUG #9 fix: don't fetch owner's scoped keys (doubled request size).
			// Clone detection is now done by comparing local hash with server hash.
			var keysToFetch = ['zeralda-settings'];
			for (var i = 0; i < scopedSet.length; i++) {
				keysToFetch.push(scopedSet[i] + '::' + companyId);
			}

			var res = await fetch('/api/store/mget', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ' + token,
					'X-Session-Token': token
				},
				body: JSON.stringify({ keys: keysToFetch })
			});
			if (!res.ok) {
				// Fallback to full store read if mget is unavailable (older server)
				res = await fetch('/api/store', {
					headers: { 'Authorization': 'Bearer ' + token, 'X-Session-Token': token }
				});
				if (!res.ok) return;
			}
			var body = await res.json();
			var store = body.data || body.store || {};
			if (!store || typeof store !== 'object') return;
			var suffix = '::' + companyId;
			// Cache per-key versions from the server for optimistic locking
			if (body.versions && typeof body.versions === 'object') {
				Object.keys(body.versions).forEach(function (vk) {
					_keyVersions[vk] = body.versions[vk];
				});
			}

			Object.keys(store).forEach(function (serverKey) {
				if (store[serverKey] === undefined || store[serverKey] === null) return;
				if (!serverKey.endsWith(suffix)) return;
				var localKey = serverKey.slice(0, serverKey.length - suffix.length);
				if (scopedSet.indexOf(localKey) === -1) return;

				// BUG #9 fix: removed old clone detection that compared owner's
			// server data with current company's server data. This required
			// fetching the owner's full dataset (doubling request size).
			// Clone detection is now implicit: if local data matches server
			// data, no write occurs (the hash comparison in the array/non-array
			// merge logic below already handles this).

				var serverVal = store[serverKey];
				if (typeof serverVal === 'string') {
					try { serverVal = JSON.parse(serverVal); } catch (_) { return; }
				}

				// Case 1: Array — bidirectional merge by ID
				if (Array.isArray(serverVal)) {
					// Radical fix: if this key has pending local writes, skip the
					// pull entirely — we'd clobber the user's unsynced edits with
					// the server's stale version (data loss bug #35).
					if (serverKey in _pendingWrites) {
						console.log('[app_sync] Pull: skipping', serverKey, '- has pending local write');
						return;
					}
					var localRaw = ZS.getItem(localKey);
					var localArr = [];
					try { localArr = JSON.parse(localRaw) || []; } catch (e) { localArr = []; }
					if (!Array.isArray(localArr)) localArr = [];

					var serverMap = {};
					serverVal.forEach(function (r) { if (r && r.id) serverMap[String(r.id)] = r; });

					var changed = false;
					var localIds = {};
					for (var i = 0; i < localArr.length; i++) {
						var r = localArr[i];
						if (r && r.id) {
							localIds[String(r.id)] = true;
							if (serverMap[String(r.id)]) {
								// Radical fix: MERGE fields instead of replacing the
								// whole record. Local edits win for fields present in
								// both, server provides fields missing locally. This
								// preserves unsynced local edits while still pulling
								// server-side additions (was: localArr[i] = serverMap[...]
								// which discarded local edits).
								// FIX P2-005: Object.assign({}, null, x) keeps
								// x but Object.assign({}, undefined, x) also
								// works — however Object.assign({}, x, null)
								// would null out x's keys. Guard against null/
								// undefined server entries to be safe.
								// FIX: use _deepMergeObjects instead of Object.assign
								// so nested objects are recursively merged.
								var _srv = serverMap[String(r.id)];
								localArr[i] = _deepMergeObjects(_srv || {}, localArr[i] || {});
								changed = true;
							}
						}
					}
					var added = 0;
					serverVal.forEach(function (r) {
						if (r && r.id && !localIds[String(r.id)]) {
							// FIX: استثني العناصر المحذوفة محلياً لمنع عودتها من الخادم
							if (_isDeletedId(localKey, r.id)) return;
							localArr.push(r); added++; changed = true;
						}
					});
					if (changed || (localArr.length === 0 && serverVal.length > 0)) {
						var finalArr = localArr.length > 0 ? localArr : serverVal;
						console.log('[app_sync] Pull write:', localKey, '→', (window.CompanyStorage && window.CompanyStorage.scopedKey ? window.CompanyStorage.scopedKey(localKey) : localKey), 'server=' + serverVal.length, 'local=' + (localRaw ? 'has-data' : 'null'), 'final=' + finalArr.length);
						beginSync();
						try { ZS.setItem(localKey, JSON.stringify(finalArr)); } finally { endSync(); }
					}
				}
				// Case 2: Non-array — replace local with server
				else {
					// Radical fix: skip if there's a pending write for this key
					// (would clobber unsynced local edits — data loss bug #35).
					if (serverKey in _pendingWrites) {
						console.log('[app_sync] Pull: skipping', serverKey, '- has pending local write');
						return;
					}
					var localRaw2 = ZS.getItem(localKey);
					var localParsed = null;
					try { localParsed = JSON.parse(localRaw2); } catch (e) {}
					if (_stableHash(localParsed) !== _stableHash(serverVal)) {
						beginSync();
						try { ZS.setItem(localKey, JSON.stringify(serverVal)); } finally { endSync(); }
					}
				}
			});
			// ── Pull zeralda-settings (non-scoped) from server ──
			// This key contains activeCompanyId + companies array and must be
			// synced so settings survive browser data clearing and are shared
			// across devices. We merge: server companies override local if newer.
			try {
				var srvSettings = store['zeralda-settings'];
				if (srvSettings !== undefined && srvSettings !== null) {
					if (typeof srvSettings === 'string') {
						try { srvSettings = JSON.parse(srvSettings); } catch (_) { srvSettings = null; }
					}
					if (srvSettings && typeof srvSettings === 'object') {
						var localRawS = ZS.getItem('zeralda-settings');
						var localS = null;
						try { localS = localRawS ? JSON.parse(localRawS) : null; } catch (_) {}

						// Merge: keep local companies not on server, add server companies
						var mergedCompanies = [];
						var seenIds = {};
						if (localS && Array.isArray(localS.companies)) {
							localS.companies.forEach(function (c) {
								if (c && c.id && !seenIds[c.id]) {
									mergedCompanies.push(c);
									seenIds[c.id] = true;
								}
							});
						}
						if (Array.isArray(srvSettings.companies)) {
							srvSettings.companies.forEach(function (c) {
								if (c && c.id && !seenIds[c.id]) {
									mergedCompanies.push(c);
									seenIds[c.id] = true;
								} else if (c && c.id && seenIds[c.id]) {
									var idx = mergedCompanies.findIndex(function (mc) { return mc.id === c.id; });
									if (idx >= 0) {
										// Use updatedAt timestamp to decide: newer wins.
										// Falls back to server-wins if no timestamps.
										var localTs = mergedCompanies[idx] && mergedCompanies[idx].updatedAt ? new Date(mergedCompanies[idx].updatedAt).getTime() : 0;
										var serverTs = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
										if (serverTs > localTs) {
											mergedCompanies[idx] = c;
										}
									}
								}
							});
						}
						var localActiveId = (localS && localS.activeCompanyId) || '';
						if (!localActiveId) {
							try {
								var ac = ZS.getItem('zeralda-active-company');
								if (ac) {
									try { localActiveId = String(JSON.parse(ac).id || ''); } catch (_) { localActiveId = String(ac); }
								}
							} catch (_) {}
						}
						// حماية: إذا srvSettings.companies فارغة، استعدها من zeralda-companies
						var srvCompanies = srvSettings.companies || [];
						if (!Array.isArray(srvCompanies) || srvCompanies.length === 0) {
							try {
								var zc = ZS.getItem('zeralda-companies');
								if (zc) {
									var parsedZc = JSON.parse(zc);
									if (Array.isArray(parsedZc) && parsedZc.length > 0) {
										srvCompanies = parsedZc;
									}
								}
							} catch (_) {}
						}
						var mergedSettings = {
							activeCompanyId: localActiveId || srvSettings.activeCompanyId || 'default-company',
							companies: mergedCompanies.length > 0 ? mergedCompanies : (localS && localS.companies && localS.companies.length > 0 ? localS.companies : srvCompanies)
						};
						// Copy extra keys from srvSettings first (lower priority)
						if (srvSettings) {
							Object.keys(srvSettings).forEach(function (k) {
								if (k !== 'activeCompanyId' && k !== 'companies' && !(k in mergedSettings)) {
									mergedSettings[k] = srvSettings[k];
								}
							});
						}
						// Then copy from localS (higher priority — local wins)
						if (localS) {
							Object.keys(localS).forEach(function (k) {
								if (k !== 'activeCompanyId' && k !== 'companies' && !(k in mergedSettings)) {
									mergedSettings[k] = localS[k];
								}
							});
						}
						// Ensure preferredLanguage is preserved: if still missing,
						// read from the standalone preferred-language key (cookie/IDB)
						if (!mergedSettings.preferredLanguage) {
							try {
								var pl = ZS.getItem('preferred-language');
								if (pl) mergedSettings.preferredLanguage = pl;
							} catch (_) {}
						}
						beginSync();
						try { ZS.setItem('zeralda-settings', JSON.stringify(mergedSettings)); } finally { endSync(); }
						// Also sync zeralda-active-company to match the merged activeCompanyId.
						// This ensures the cookie and IndexedDB always have the correct value,
						// even if the pull changed the activeCompanyId (e.g. first pull on a
						// new device where local was empty and server had the correct value).
						if (mergedSettings.activeCompanyId) {
							beginSync();
							try { ZS.setItem('zeralda-active-company', mergedSettings.activeCompanyId); } finally { endSync(); }
						}
					}
				}
			} catch (e) {
				console.warn('[app_sync] Pull zeralda-settings failed:', e.message || e);
			}
		} catch (e) {
			console.warn('[app_sync] Async pull failed:', e.message || e);
		}
	}

	// Pull a single key from the server (used by SSE write-no-value handler
	// to avoid a full pullAllToLocalStorage when only one key changed).
	async function _pullSingleKey(serverKey, localKey) {
		var token = getToken();
		if (!token) return;
		try {
			var res = await fetch('/api/store?key=' + encodeURIComponent(serverKey), {
				headers: { 'Authorization': 'Bearer ' + token, 'X-Session-Token': token }
			});
			if (!res.ok) return;
			var body = await res.json();
			if (!body || body.value === undefined || body.value === null) return;
			if (body.version !== undefined && body.version !== null) {
				_keyVersions[serverKey] = body.version;
			}
			var serverVal = body.value;
			if (typeof serverVal === 'string') {
				try { serverVal = JSON.parse(serverVal); } catch (_) { return; }
			}
			if (serverKey in _pendingWrites) {
				console.log('[app_sync] _pullSingleKey: skipping', localKey, '- has pending local write');
				return;
			}
			beginSync();
			try {
				if (Array.isArray(serverVal)) {
					var localRaw = ZS.getItem(localKey);
					var localArr = [];
					try { localArr = JSON.parse(localRaw) || []; } catch (e) { localArr = []; }
					if (!Array.isArray(localArr)) localArr = [];
					var merged = _mergeValues(serverVal, localArr, localKey);
					ZS.setItem(localKey, JSON.stringify(merged));
				} else {
					ZS.setItem(localKey, JSON.stringify(serverVal));
				}
				console.log('[app_sync] _pullSingleKey: updated', localKey);
			} finally { endSync(); }
		} catch (e) {
			console.warn('[app_sync] _pullSingleKey failed for', serverKey, ':', e.message || e);
		}
	}

	// Stable hash for clone detection / change detection.
	// Uses JSON.stringify with sorted keys for objects (deterministic), then a
	// FNV-1a 32-bit hash. BUG #8 fix: replaced djb2 (known collisions) with
	// FNV-1a which has better distribution. Avoids O(n) JSON.stringify
	// comparisons on every sync cycle and is order-independent for object keys.
	function _stableHash(value) {
		if (value === undefined || value === null) return '0';
		var str = _stableStringify(value);
		// FNV-1a 32-bit hash
		var hash = 0x811c9dc5;
		for (var i = 0; i < str.length; i++) {
			hash ^= str.charCodeAt(i);
			hash = Math.imul(hash, 0x01000193); // FNV prime
		}
		return (hash >>> 0).toString(36); // unsigned 32-bit, base36
	}

	function _stableStringify(value) {
		if (value === null) return 'null';
		if (typeof value !== 'object') return JSON.stringify(value);
		if (Array.isArray(value)) {
			return '[' + value.map(_stableStringify).join(',') + ']';
		}
		var keys = Object.keys(value).sort();
		var parts = [];
		for (var i = 0; i < keys.length; i++) {
			parts.push(JSON.stringify(keys[i]) + ':' + _stableStringify(value[keys[i]]));
		}
		return '{' + parts.join(',') + '}';
	}

	function showLocalNotice() {
		// Non-blocking notice that sync is unavailable — app continues in local-only mode
		ready = true;
		console.info('[app_sync] Running in local-only mode (server sync unavailable)');
	}

	async function cleanupServerClonedData() {
		var token = getToken();
		if (!token) return;
		try {
			var migrationFlag = 'server-clone-cleanup-v2';
			var res = await fetch('/api/store?key=' + encodeURIComponent(migrationFlag), {
				headers: { 'Authorization': 'Bearer ' + token, 'X-Session-Token': token }
			});
			if (res.ok) {
				var body = await res.json();
				if (body && body.value) return; // Already cleaned
			}
			// Fetch all server data
			res = await fetch('/api/store', {
				headers: { 'Authorization': 'Bearer ' + token, 'X-Session-Token': token }
			});
			if (!res.ok) return;
			body = await res.json();
			var store = body.data || body.store || {};
			if (!store || typeof store !== 'object') return;

			var scopedSet = (window.CompanyStorage && window.CompanyStorage.scopedKeys) || [];
			var raw = ZS.getItem('zeralda-settings');
			var settings = raw ? JSON.parse(raw) : {};
			var companies = settings && Array.isArray(settings.companies) ? settings.companies : [];
			if (!companies.length) return;
			var ownerId = String((companies[0] && companies[0].id) || '');

			var deleted = 0;
			for (var si = 0; si < scopedSet.length; si++) {
				var base = scopedSet[si];
				var ownerKey = base + '::' + ownerId;
				var ownerVal = store[ownerKey];
				if (ownerVal === undefined || ownerVal === null) continue;

				for (var ci = 0; ci < companies.length; ci++) {
					var companyId = String(companies[ci] && companies[ci].id || '');
					if (!companyId || companyId === ownerId) continue;
					var companyKey = base + '::' + companyId;
					var companyVal = store[companyKey];
					if (companyVal !== undefined && companyVal !== null && JSON.stringify(companyVal) === JSON.stringify(ownerVal)) {
						// Cloned data — delete it from server
						await fetch('/api/store?key=' + encodeURIComponent(companyKey), {
							method: 'DELETE',
							headers: { 'Authorization': 'Bearer ' + token, 'X-Session-Token': token }
						});
						deleted++;
					}
				}
				// Also delete unscoped key if it exists
				if (store[base] !== undefined && store[base] !== null) {
					await fetch('/api/store?key=' + encodeURIComponent(base), {
						method: 'DELETE',
						headers: { 'Authorization': 'Bearer ' + token, 'X-Session-Token': token }
					});
					deleted++;
				}
			}

			// Mark cleanup as done
			await fetch('/api/store', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Session-Token': token },
				body: JSON.stringify({ key: migrationFlag, value: '1' })
			});
			if (deleted > 0) console.log('[app_sync] Cleaned ' + deleted + ' cloned keys from server');
		} catch (e) {
			console.warn('[app_sync] Server clone cleanup failed:', e.message || e);
		}
	}

	// NOTE: syncServerToLocalSync() (synchronous XHR) was removed — it blocked
	// the UI thread and is deprecated in modern browsers. All server-to-ZS sync
	// now goes through the async pullAllToLocalStorage() path.

	// Server sync disabled — using ZS (IndexedDB) only

	// ── Background sync: periodic pull from server to keep cache fresh ──
	async function backgroundSync() {
		if (!ENABLE_API_SYNC || !ready) return;
		try {
			// إصلاح: تحقق من وجود كتابات معلقة قبل pull
			var pendingCount = Object.keys(_pendingWrites).length;
			if (pendingCount > 0) {
				console.log('[app_sync] Background sync: flushing', pendingCount, 'pending writes first');
				await flushPending();
				// BUG #10 fix: don't skip pull if flush has remaining writes.
				// pullAllToLocalStorage already skips keys with pending writes
				// (they won't be clobbered). Skipping the pull entirely means
				// the client never receives fresh data from the server if any
				// write is persistently failing (e.g. network issue on one key).
				var remaining = Object.keys(_pendingWrites).length;
				if (remaining > 0) {
					console.warn('[app_sync] Background sync:', remaining, 'writes still pending — pulling anyway (pending keys will be skipped)');
				}
			}
			// Then pull fresh data from server (merge mode — safe for concurrent edits)
			await pullAllToLocalStorage();
			console.log('[app_sync] Background sync completed');
		} catch (e) {
			console.warn('[app_sync] Background sync failed:', e.message || e);
		}
	}

	function startBackgroundSync() {
		if (!ENABLE_API_SYNC) return;
		clearInterval(_bgSyncTimer);
		_bgSyncTimer = setInterval(backgroundSync, BG_SYNC_INTERVAL);
	}

	function checkLocalStorageUsage() {
		try {
			var total = 0;
			if (window.ZeraldaStorageAdapter) {
				total = window.ZeraldaStorageAdapter.getCacheSize();
			}
			var totalMB = (total * 2) / (1024 * 1024); // UTF-16 = 2 bytes/char
			var backend = (window.ZeraldaStorageAdapter && window.ZeraldaStorageAdapter.getBackend)
				? window.ZeraldaStorageAdapter.getBackend() : 'indexeddb';
			console.info('[app_sync] OPFS storage usage: ' + totalMB.toFixed(2) + 'MB (' + Object.keys(window.ZeraldaStorageAdapter ? window.ZeraldaStorageAdapter.getCacheKeys() : {}).length + ' keys, backend: ' + backend + ')');
		} catch (e) {}
	}

	// ── Auto-recover settings after browser data clearing ───────────────
	async function autoRecoverSettings() {
		if (!ENABLE_API_SYNC) return;
		// If zeralda-settings exists and has companies, no recovery needed
		var rawSettings = ZS.getItem('zeralda-settings');
		if (rawSettings) {
			try {
				var parsed = JSON.parse(rawSettings);
				if (parsed && Array.isArray(parsed.companies) && parsed.companies.length > 0) return;
			} catch (_) {}
		}

		var token = getToken();
		if (!token) return;
		try {
			var res = await fetch('/api/store', {
				headers: { 'Authorization': 'Bearer ' + token, 'X-Session-Token': token }
			});
			if (!res.ok) return;
			var body = await res.json();
			var store = body.data || body.store || {};
			if (!store || typeof store !== 'object') return;

			// Detect company IDs from scoped keys (format: keyName::companyId)
			var companyIds = {};
			var scopedSet = (window.CompanyStorage && window.CompanyStorage.scopedKeys) || [];
			Object.keys(store).forEach(function (serverKey) {
				scopedSet.forEach(function (baseKey) {
					if (serverKey.startsWith(baseKey + '::')) {
						var cid = serverKey.slice(baseKey.length + 2);
						if (cid && store[serverKey] != null) {
							companyIds[cid] = (companyIds[cid] || 0) + 1;
						}
					}
				});
			});

			var detectedIds = Object.keys(companyIds);
			if (detectedIds.length === 0) return;

			// Pick the company ID with the most data keys
			detectedIds.sort(function (a, b) { return companyIds[b] - companyIds[a]; });
			var bestId = detectedIds[0];

			// Reconstruct minimal settings
			var recovered = {
				activeCompanyId: bestId,
				companies: [{
					id: bestId,
					name: 'الشركة الرئيسية',
					createdAt: new Date().toISOString()
				}]
			};

			beginSync();
			try { ZS.setItem('zeralda-settings', JSON.stringify(recovered)); } finally { endSync(); }
			console.log('[app_sync] Auto-recovered settings with company ID: ' + bestId + ' (' + detectedIds.length + ' companies detected)');

			// Also push settings to server so future clears can recover faster
			try {
				await fetch('/api/store', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Session-Token': token },
					body: JSON.stringify({ key: 'zeralda-settings-backup', value: recovered })
				});
			} catch (_) {}
		} catch (e) {
			console.warn('[app_sync] Auto-recovery failed:', e.message || e);
		}
	}

	// ── SSE (Server-Sent Events) — real-time storage change notifications ──
	// Connects to /api/store/events and updates the local ZS cache instantly
	// when another tab/user writes or deletes a key. This replaces the 5-minute
	// polling interval with instant push notifications from the server.
	var _sseSource = null;
	var _sseLastSeq = 0;          // last event sequence number received
	var _sseReconnectTimer = null;
	var _sseReconnectDelay = 1000; // starts at 1s, doubles up to 30s (exponential backoff)
	var _sseConnected = false;
	var SSE_MAX_RECONNECT_DELAY = 30000;
	var SSE_RECONNECT_RESET_AFTER = 60000; // reset backoff after 60s connected

	function _sseUrl() {
		var token = getToken();
		// EventSource cannot set custom headers — pass token via query string.
		// The server's SSE handler reads ?token= for authentication.
		var url = '/api/store/events';
		if (token) url += '?token=' + encodeURIComponent(token);
		return url;
	}

	// Pre-flight token validation: fetch /api/store/stats with the token.
	// If 401, the token is stale (e.g. after re-install) — clear it and
	// redirect to login instead of entering an infinite SSE reconnect loop.
	function _validateTokenBeforeSSE(callback) {
		var token = getToken();
		if (!token) { callback(false); return; }
		try {
			fetch('/api/store/stats', {
				headers: { 'Authorization': 'Bearer ' + token, 'X-Requested-With': 'XMLHttpRequest' }
			}).then(function (res) {
				if (res.status === 401) {
					console.warn('[app_sync] Token rejected (401) — clearing stale session');
					ZS.removeItem(TOKEN_KEY);
					clearSessionMeta();
					callback(false);
					redirectToLogin();
					return;
				}
				callback(res.ok);
			}).catch(function () {
				// Network error — server might be starting up; allow SSE attempt
				callback(true);
			});
		} catch (e) {
			callback(true);
		}
	}

	var _sseErrorCount = 0;
	var SSE_MAX_ERRORS_BEFORE_REVALIDATE = 3;

	function startSSE() {
		if (!ENABLE_API_SYNC) return;
		if (!window.EventSource) return;          // browser doesn't support SSE
		if (_sseSource) return;                    // already connected
		var token = getToken();
		if (!token) return;

		// Pre-flight: verify token is still valid before opening SSE
		_validateTokenBeforeSSE(function (valid) {
			if (!valid) return;  // token stale — already redirected to login
			try {
				_sseSource = new EventSource(_sseUrl());
			} catch (e) {
				console.warn('[app_sync] SSE connect failed:', e.message || e);
				_scheduleSSEReconnect();
				return;
			}

			_sseSource.addEventListener('store-change', function (event) {
				try {
					var data = JSON.parse(event.data);
					_handleSSEEvent(data);
				} catch (e) {
					console.warn('[app_sync] SSE event parse error:', e.message || e);
				}
			});

			_sseSource.addEventListener('open', function () {
				_sseConnected = true;
				_sseErrorCount = 0;
				// Reset backoff after a sustained connection
				setTimeout(function () {
					if (_sseConnected) _sseReconnectDelay = 1000;
				}, SSE_RECONNECT_RESET_AFTER);
				console.log('[app_sync] SSE connected — real-time sync active');
			});

			_sseSource.addEventListener('error', function () {
				_sseConnected = false;
				_sseErrorCount++;
				try { _sseSource.close(); } catch (_) {}
				_sseSource = null;
				// If errors pile up, the token might be stale — revalidate
				if (_sseErrorCount >= SSE_MAX_ERRORS_BEFORE_REVALIDATE) {
					console.warn('[app_sync] SSE errors exceeded threshold — revalidating token');
					_sseErrorCount = 0;
					_validateTokenBeforeSSE(function (valid) {
						if (valid) _scheduleSSEReconnect();
						// if invalid, redirectToLogin already called
					});
				} else {
					_scheduleSSEReconnect();
				}
			});
		});
	}

	function _scheduleSSEReconnect() {
		if (_sseReconnectTimer) return;
		var delay = _sseReconnectDelay;
		_sseReconnectDelay = Math.min(_sseReconnectDelay * 2, SSE_MAX_RECONNECT_DELAY);
		_sseReconnectTimer = setTimeout(function () {
			_sseReconnectTimer = null;
			// Only reconnect if we still have a valid token
			if (getToken()) startSSE();
		}, delay);
	}

	function stopSSE() {
		if (_sseReconnectTimer) {
			clearTimeout(_sseReconnectTimer);
			_sseReconnectTimer = null;
		}
		if (_sseSource) {
			try { _sseSource.close(); } catch (_) {}
			_sseSource = null;
		}
		_sseConnected = false;
	}

	// Handle an incoming SSE event: update local ZS cache + version tracking.
	// We do NOT re-broadcast to the server (would cause a loop). The `syncing`
	// flag prevents queueSet() from re-queueing these writes.
	function _handleSSEEvent(data) {
		if (!data || typeof data !== 'object') return;

		// Sequence gap detection: if we skipped events, do incremental catch-up.
		if (_sseLastSeq > 0 && data.seq > _sseLastSeq + 1) {
			var gapSize = data.seq - _sseLastSeq - 1;
			console.log('[app_sync] SSE seq gap detected (' + _sseLastSeq + ' → ' + data.seq + ', gap=' + gapSize + ') — incremental catch-up');
			// إصلاح: للحالات الصغيرة، عالج الحدث الحالي فقط.
			// للحالات الكبيرة (>10)، اعمل full re-sync.
			if (gapSize > 10) {
				setTimeout(function () { pullAllToLocalStorage(); }, 0);
			}
			// للحالات الصغيرة، الحدث الحالي سيُعالج أدناه — لا حاجة لـ full re-sync
		}
		_sseLastSeq = data.seq;

		// 'hello' event — just confirms subscription, no action needed
		if (data.type === 'hello') return;

		// 'clear-all' event — factory reset: wipe ALL local data
		// (IndexedDB + in-memory cache + pending writes) to prevent
		// stale data from being re-pushed to the now-empty server.
		if (data.type === 'clear-all') {
			console.warn('[app_sync] SSE clear-all received — wiping all local data');
			// 1) Clear pending writes so they don't get flushed after wipe
			_pendingWrites = {};
			_keyVersions = {};
			// 2) Clear ZDB cache + IndexedDB using built-in clear()
			if (window.ZDB) {
				try {
					if (window.ZDB.clear) {
						window.ZDB.clear();
					}
					if (window.ZDB.flush) {
						window.ZDB.flush().catch(function () {});
					}
				} catch (e) {
					console.warn('[app_sync] clear-all: ZDB clear failed:', e);
				}
			}
			// 3) Clear company ID cache so it re-reads from server
			if (window.CompanyStorage && window.CompanyStorage.clearCompanyIdCache) {
				window.CompanyStorage.clearCompanyIdCache();
			}
			// 4) Notify UI
			try {
				document.dispatchEvent(new CustomEvent('zeraldaStoreChange', {
					detail: { type: 'clear-all', source: 'sse' }
				}));
			} catch (_) {}
			// 5) Reload page to start fresh
			setTimeout(function () { location.reload(); }, 500);
			return;
		}

		// إصلاح: 'drop-notice' event — الخادم أبلغ عن أحداث مُسقطة
		if (data.type === 'drop-notice') {
			console.warn('[app_sync] SSE drop-notice received: seq', data.dropped_seq, 'was dropped — re-syncing');
			// إعادة المزامنة فوراً بدلاً من انتظار كشف seq gap
			setTimeout(function () { pullAllToLocalStorage(); }, 0);
			return;
		}

		// 'bulk' event — multiple keys changed, re-sync everything
		if (data.type === 'bulk') {
			setTimeout(function () { pullAllToLocalStorage(); }, 0);
			return;
		}

		var serverKey = data.key;
		if (!serverKey) return;

		// Map server key → local key (strip company scope suffix)
		var companyId = (window.CompanyStorage && window.CompanyStorage.getActiveCompanyId)
			? window.CompanyStorage.getActiveCompanyId() : 'default-company';
		var scopedSet = (window.CompanyStorage && window.CompanyStorage.scopedKeys) || [];
		var suffix = '::' + companyId;
		var localKey = null;

		if (scopedSet.indexOf(serverKey) !== -1) {
			// Unscoped key (e.g. zeralda-settings)
			localKey = serverKey;
		} else if (serverKey.indexOf(suffix) === serverKey.length - suffix.length) {
			// Scoped key for the active company
			localKey = serverKey.slice(0, serverKey.length - suffix.length);
			if (scopedSet.indexOf(localKey) === -1) {
				// Scoped key for a DIFFERENT company — ignore (not our context)
				return;
			}
		} else {
			// Key for another company or unknown — ignore
			return;
		}

		// Update version cache for optimistic locking
		if (data.version !== undefined && data.version !== null) {
			_keyVersions[serverKey] = data.version;
		}

		// Apply the change to local ZS cache (without re-broadcasting to server)
		beginSync();
		try {
			// BUG #1 fix: only delete on explicit "delete" type.
			// "write-no-value" means the value was too large for SSE — pull
			// the specific key from server instead of deleting local data.
			if (data.type === 'delete') {
				ZS.removeItem(localKey);
				console.log('[app_sync] SSE: deleted', localKey);
			} else if (data.type === 'write-no-value' || data.value === undefined) {
				// Value too large for SSE payload — pull this specific key only
				console.log('[app_sync] SSE: write-no-value for', localKey, '- pulling single key from server');
				setTimeout(function () { _pullSingleKey(serverKey, localKey); }, 0);
			} else if (data.value === null) {
				ZS.removeItem(localKey);
				console.log('[app_sync] SSE: deleted (null value)', localKey);
			} else {
				var val = data.value;
				// Server stores objects; ZS expects strings (localStorage-compat)
				if (typeof val !== 'string') {
					try { val = JSON.stringify(val); } catch (_) { return; }
				}
				// For arrays, merge with local (don't clobber local-only additions)
				// For non-arrays, replace local with server value.
				var parsed = val;
				try { parsed = JSON.parse(val); } catch (_) { parsed = val; }
				// Radical fix: if this key has pending local writes, skip applying
				// the SSE update — the local edit hasn't been pushed yet and we'd
				// clobber it with the server's stale version (data loss bug #36).
				// The pending write will be pushed shortly and the server will
				// reconcile via optimistic locking.
				if (serverKey in _pendingWrites) {
					console.log('[app_sync] SSE: skipping', localKey, '- has pending local write');
					return;
				}
				if (Array.isArray(parsed)) {
					var localRaw = ZS.getItem(localKey);
					var localArr = [];
					try { localArr = JSON.parse(localRaw) || []; } catch (e) { localArr = []; }
					if (!Array.isArray(localArr)) localArr = [];
					// Merge by ID: MERGE fields (local wins for overlapping fields)
					// Radical fix: was replacing localArr[i] = serverMap[...] which
					// discarded local edits. Now uses Object.assign so local edits
					// are preserved while server-side additions are pulled.
					var serverMap = {};
					parsed.forEach(function (r) { if (r && r.id) serverMap[String(r.id)] = r; });
					var changed = false;
					var localIds = {};
					for (var i = 0; i < localArr.length; i++) {
						var r = localArr[i];
						if (r && r.id) {
							localIds[String(r.id)] = true;
							if (serverMap[String(r.id)]) {
								// FIX P2-005: Object.assign({}, null, x) keeps
								// x but Object.assign({}, undefined, x) also
								// works — however Object.assign({}, x, null)
								// would null out x's keys. Guard against null/
								// undefined server entries to be safe.
								// FIX: use _deepMergeObjects instead of Object.assign
								// so nested objects are recursively merged.
								var _srv = serverMap[String(r.id)];
								localArr[i] = _deepMergeObjects(_srv || {}, localArr[i] || {});
								changed = true;
							}
						}
					}
					parsed.forEach(function (r) {
						if (r && r.id && !localIds[String(r.id)]) {
							// FIX: استثني العناصر المحذوفة محلياً
							if (_isDeletedId(localKey, r.id)) return;
							localArr.push(r); changed = true;
						}
					});
					if (changed || localArr.length === 0) {
						ZS.setItem(localKey, JSON.stringify(localArr.length > 0 ? localArr : parsed));
					}
				} else {
					// Non-array: replace if different
					var localRaw2 = ZS.getItem(localKey);
					var localParsed = null;
					try { localParsed = localRaw2 ? JSON.parse(localRaw2) : null; } catch (e) {}
					if (_stableHash(localParsed) !== _stableHash(parsed)) {
						ZS.setItem(localKey, val);
					}
				}
				console.log('[app_sync] SSE: updated', localKey);
			}
			// Notify the app that data changed (for UI refresh)
			document.dispatchEvent(new CustomEvent('zeraldaStoreChange', {
				detail: { key: localKey, type: data.type, actor: data.actor }
			}));
		} catch (e) {
			console.warn('[app_sync] SSE apply error for', localKey, ':', e.message || e);
		} finally {
			endSync();
		}
	}

	async function init() {
		patchLocalStorage();
		// Wait for the IndexedDB cache to be fully loaded before reading
		// settings. ready() resolves as soon as the DB is open, but the cache
		// (used for synchronous getItem() reads) is populated asynchronously.
		// Without this wait, ZS.getItem('zeralda-settings') returns null after
		// a page refresh because the cache is still empty.
		// We wait up to 2000ms — long enough for the cache to load, short
		// enough to not block the UI if IndexedDB is slow.
		if (window.ZDB && window.ZDB.cacheReady) {
			try {
				await Promise.race([
					window.ZDB.cacheReady(),
					new Promise(function (resolve) { setTimeout(resolve, 2000); })
				]);
			} catch (e) {}
		} else if (window.ZDB && window.ZDB.ready) {
			// Fallback for older ZDB versions without cacheReady()
			try {
				await Promise.race([
					window.ZDB.ready(),
					new Promise(function (resolve) { setTimeout(resolve, 500); })
				]);
			} catch (e) {}
		}
		// إصلاح حرج: استرجاع pending writes من الجلسة السابقة
		// يجب أن يكون AFTER تحميل cache من IndexedDB، لأن _restorePendingWrites
		// يقرأ من ZDB.getItem() و ZDB.keys() المتزامنة التي تقرأ من _cache.
		// إذا استُدعي قبل تحميل cache، لن يجد شيئاً وتُفقد كتابات الحذف
		// من الجلسة السابقة، مما يسبب عودة الفواتير المحذوفة بعد refresh.
		_restorePendingWrites();
		if (enforceSessionTimeout()) return;
		if (ENFORCE_LOGIN && !getToken()) {
			redirectToLogin();
			return;
		}
		// Defer heavy DOM scanning so the page renders immediately
		// Use requestIdleCallback if available, otherwise setTimeout
		var deferDOM = function (fn) {
			if (window.requestIdleCallback) {
				window.requestIdleCallback(fn, { timeout: 1500 });
			} else {
				setTimeout(fn, 100);
			}
		};
		deferDOM(function () {
			applyUnifiedDatePickers(document);
			startUnifiedDateObserver();
			applyGlobalButtonTooltips(document);
			startButtonTooltipObserver();
		});
		renderHeaderUserControls();
		if (getToken()) {
			ensureAuthActivityTracking();
			// Defer heavy network operations so the page renders immediately.
			// Data sync happens in the background without blocking UI.
			ready = true;
			// Dispatch zeraldaStorageReady so pages know the cache is loaded
			// and they can safely read settings via ZS.getItem().
			document.dispatchEvent(new CustomEvent('zeraldaStorageReady'));
			// Also dispatch zeraldaStoreChange so any UI that already rendered
			// with default/fallback values (because the cache was empty when
			// the page's inline script ran) can re-read and update now that
			// the cache is fully populated.
			document.dispatchEvent(new CustomEvent('zeraldaStoreChange', {
				detail: { source: 'cacheReady', keys: ['zeralda-settings', 'preferred-language', 'system-currency', 'date-format', 'time-format', 'zeralda-theme', 'logo-size'] }
			}));
			// إصلاح جذري: سحب فوري من الخادم عند فقدان البيانات
			var _localDataEmpty = false;
			try {
				var _checkInv = ZS.getItem('invoices-data');
				var _checkCust = ZS.getItem('customers-data');
				var _checkProd = ZS.getItem('products-data');
				if((!_checkInv || _checkInv === '[]') && (!_checkCust || _checkCust === '[]') && (!_checkProd || _checkProd === '[]')) {
					_localDataEmpty = true;
					console.log('[app_sync] Local cache empty — forcing immediate pull from server');
				}
			} catch(e) {}

			if(_localDataEmpty && getToken() && ENABLE_API_SYNC) {
				// سحب فوري — لا تنتظر 2 ثانية
				(async function immediatePull() {
					try {
						await autoRecoverSettings();
						await pullAllToLocalStorage();
						beginSync();
						try { ZS.setItem('zeralda-last-pull-ts', String(Date.now())); } catch(e){}
						endSync();
						document.dispatchEvent(new CustomEvent('zeraldaStoreChange', {
							detail: { source: 'serverPull', keys: ['invoices-data','customers-data','products-data','proformas-data'] }
						}));
						console.log('[app_sync] Immediate pull completed — data restored');
					} catch(e) {
						console.error('[app_sync] Immediate pull failed:', e);
					}
					startBackgroundSync();
					startSSE();
				})();
			} else {
			// السحب العادي بعد 2 ثانية
			setTimeout(async function backgroundInit() {
				try {
					// Validate session before enabling preference sync.
					// This prevents 401 errors when the token is expired/invalid.
					var token = getToken();
					if (token) {
						try {
							var vRes = await fetch('/api/auth/validate', {
								method: 'GET',
								headers: { 'X-Session-Token': token, 'Authorization': 'Bearer ' + token }
							});
							if (vRes.ok) _prefSyncReady = true;
						} catch (_) {}
					}
					await autoRecoverSettings();
					// Only pull from server if last pull was > 60 seconds ago.
					// This prevents re-pulling on every page navigation.
					// Only pull from server if last pull was > 60 seconds ago.
					// This prevents re-pulling on every page navigation.
					var lastPull = parseInt(ZS.getItem('zeralda-last-pull-ts') || '0', 10);
					if (Date.now() - lastPull > 60000) {
						await pullAllToLocalStorage();
						// Radical fix: wrap in beginSync/endSync so this write doesn't
						// get queued to the server (was generating 188 history entries
						// for an ephemeral timestamp key). It's a local-only marker.
						beginSync();
						try { 
							ZS.setItem('zeralda-last-pull-ts', String(Date.now())); 
						} finally { 
							endSync(); 
						}
					}
				} catch (e) {
					console.warn('[app_sync] Background init failed:', e.message || e);
				}
				// These are low-priority cleanup tasks — defer further
				setTimeout(function() {
					try { maybeMigrateFromLocal(); } catch(e) {}
					try { cleanupServerClonedData(); } catch(e) {}
				}, 2000);
				startBackgroundSync();
				// Start SSE real-time sync (after initial pull to avoid races)
				startSSE();
			}, 2000);
		} // end else (localDataEmpty)
		} else {
			document.dispatchEvent(new CustomEvent('zeraldaStorageReady'));
		}
		// Defer usage check — it iterates all keys and is not critical
		deferDOM(checkLocalStorageUsage);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}

	window.addEventListener('beforeunload', function () {
		/* FIX: تنظيف المراقبين والمؤقتات لمنع تسرب الذاكرة */
		try { if (unifiedDateObserver) { unifiedDateObserver.disconnect(); unifiedDateObserver = null; } } catch (_) {}
		if (!ENABLE_API_SYNC) return;
		// Close SSE connection cleanly
		stopSSE();
		// إصلاح: تجاهل مفاتيح __flushing
		var keys = Object.keys(_pendingWrites).filter(function(k) { return k.indexOf('__flushing') === -1; });
		if (!keys.length) return;
		var token = getToken();
		if (!token) return;
		// Keys in _pendingWrites are already scoped (from queueSet). Use directly.

		// Use sendBeacon (non-blocking) instead of synchronous XHR.
		// sendBeacon fires in the background and does NOT block navigation.
		if (navigator.sendBeacon) {
			for (var i = 0; i < keys.length; i++) {
				var serverKey = keys[i]; // already scoped
				var rawVal = _pendingWrites[serverKey];
				var parsedVal = rawVal;
				if (typeof rawVal === 'string') {
					try { parsedVal = JSON.parse(rawVal); } catch (_) { parsedVal = rawVal; }
				}
				try {
					var payload = { key: serverKey, value: parsedVal };
					// BUG #4 fix: include expected_version for optimistic locking
					// to prevent silent overwrites of concurrent changes.
					if (_keyVersions[serverKey] !== undefined && _keyVersions[serverKey] !== -1) {
						payload.expected_version = _keyVersions[serverKey];
					}
					var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
					// sendBeacon doesn't support custom headers, so we pass token in URL
					navigator.sendBeacon('/api/store?token=' + encodeURIComponent(token), blob);
				} catch (_) {}
			}
			return;
		}

		// Fallback: async XHR (not synchronous) — best effort, may not complete
		for (var j = 0; j < keys.length; j++) {
			var serverKey2 = keys[j]; // already scoped
			var rawVal2 = _pendingWrites[serverKey2];
			var parsedVal2 = rawVal2;
			if (typeof rawVal2 === 'string') {
				try { parsedVal2 = JSON.parse(rawVal2); } catch (_) { parsedVal2 = rawVal2; }
			}
			try {
				var xhr = new XMLHttpRequest();
				xhr.open('POST', '/api/store', true); // async, non-blocking
				xhr.setRequestHeader('Content-Type', 'application/json');
				xhr.setRequestHeader('Authorization', 'Bearer ' + token);
				xhr.setRequestHeader('X-Session-Token', token);
				xhr.send(JSON.stringify({ key: serverKey2, value: parsedVal2,
				expected_version: (_keyVersions[serverKey2] !== undefined && _keyVersions[serverKey2] !== -1)
					? _keyVersions[serverKey2] : undefined }));
			} catch (_) {}
		}
	});

	// Re-run header-dependent init when shared layout is loaded asynchronously
	document.addEventListener("sharedLayoutLoaded", function () {
		renderHeaderUserControls();
	});

	// ── Server-side preferences sync ────────────────────────────────────────
	const PREF_SYNC_KEYS = [
		'preferred-language', 'language',
		'system-currency',
		'zeralda-zoom-level',
		'zeralda-sidebar-collapsed',
		'zeralda-theme',
		'zeralda-remembered-login',
		'zeralda-remembered-email',
		'zeralda-saved-accounts',
		'zeralda-google-client-id'
	];

 	function syncPreferencesToServer() {
 		const token = getToken();
 		if (!token) return;
 		const prefs = {};
 		PREF_SYNC_KEYS.forEach(function (k) {
 			const v = ZS.getItem(k);
 			if (v !== null) prefs[k] = v;
 		});
 		if (Object.keys(prefs).length === 0) return;
 		fetch('/api/auth/validate', {
 			method: 'GET',
 			headers: { 'X-Session-Token': token, 'Authorization': 'Bearer ' + token }
 		}).then(function (validateRes) {
 			if (validateRes.status === 401) {
 				// Session expired or invalid — suppress the 401 console error.
 				// session_timeout.js handles expiry/redirect. Don't spam console.
 				return null;
 			}
 			if (!validateRes.ok) {
 				// Don't clear session on validate failure — session_timeout.js handles expiry/redirect.
 				return null;
 			}
 			return fetch('/api/auth/preferences', {
 				method: 'POST',
 				headers: { 'Content-Type': 'application/json', 'X-Session-Token': token, 'Authorization': 'Bearer ' + token },
 				body: JSON.stringify({ preferences: prefs })
 			});
 		}).catch(function () {});
 	}

	// Listen for ZS changes that affect preferences
	var _prefSyncTimer = null;
	var _prefSyncReady = false; // Only sync after session is confirmed valid
	function _schedulePrefSync(key) {
		if (PREF_SYNC_KEYS.indexOf(key) === -1) return;
		if (!_prefSyncReady) return; // Skip until session validated
		clearTimeout(_prefSyncTimer);
		_prefSyncTimer = setTimeout(syncPreferencesToServer, 1500);
	}

	// Cross-tab detection via storage event
	window.addEventListener('storage', function (e) {
		if (e.key) _schedulePrefSync(e.key);
	});

	// Listen for zeraldaStoreChange (dispatched by app_sync after cacheReady
	// or by SSE handler). Re-dispatch as synthetic 'storage' events so pages
	// that listen for window 'storage' events can re-read settings and update
	// the UI. This is critical after a page refresh: the page's inline script
	// runs before the cache is loaded, so it reads default/fallback values.
	// When cacheReady() completes, we dispatch zeraldaStoreChange, which
	// triggers this handler, which re-dispatches as 'storage' events, which
	// the page's own listeners pick up to re-apply the correct settings.
	document.addEventListener('zeraldaStoreChange', function (e) {
		var keys = (e && e.detail && Array.isArray(e.detail.keys)) ? e.detail.keys : [];
		keys.forEach(function (key) {
			try {
				// Dispatch a synthetic storage event for this key.
				// Fallback for browsers without StorageEvent constructor.
				var value = ZS.getItem(key);
				var ev;
				try {
					ev = new StorageEvent('storage', {
						key: key,
						newValue: value,
						url: window.location.href
					});
				} catch (_) {
					ev = document.createEvent('StorageEvent');
					ev.initStorageEvent('storage', false, false, key, null, value, window.location.href, null);
				}
				window.dispatchEvent(ev);
			} catch (_) {}
		});
	});

	window.syncPreferencesToServer = syncPreferencesToServer;
	// إصلاح: تصدير API للاستخدام الخارجي (company_storage.js)
	window.AppSync = {
		flushPending: flushPending,
		pullAllToLocalStorage: pullAllToLocalStorage,
		isSyncing: isSyncing,
		beginSync: beginSync,
		endSync: endSync,
		trackDeletedId: _trackDeletedId,
		clearDeletedIds: _clearDeletedIds
	};

	// إصلاح: إشعار المستخدم عند فشل المزامنة أو امتلاء التخزين
	function _showSyncNotification(message, type) {
		try {
			if (typeof showToast === 'function') {
				showToast(message, type);
			} else {
				// إنشاء toast بسيط
				var toast = document.createElement('div');
				toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;padding:12px 20px;border-radius:8px;color:white;font-family:sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:400px;';
				toast.style.background = type === 'error' ? '#dc2626' : (type === 'warning' ? '#d97706' : '#059669');
				toast.textContent = message;
				document.body.appendChild(toast);
				setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
			}
		} catch (_) {}
	}

	// الاستماع لأحداث فشل الكتابة
	window.addEventListener('app-sync-write-failed', function (event) {
		var detail = event.detail || {};
		_showSyncNotification('فشل حفظ البيانات للخادم: ' + (detail.key || 'مفتاح غير معروف') + ' — قد تُ فقدان البيانات', 'error');
	});

	// الاستماع لأحداث امتلاء التخزين
	window.addEventListener('zdb-quota-exceeded', function (event) {
		var detail = event.detail || {};
		var sizeMB = detail.cacheSize ? (detail.cacheSize * 2 / 1024 / 1024).toFixed(1) : '?';
		_showSyncNotification('امتلاء مساحة التخزين (' + sizeMB + 'MB) — تم تنظيف البيانات غير الحرجة. حاول حذف النسخ الاحتياطية القديمة.', 'warning');
	});

	// الاستماع لأحداث فشل كتابة ZDB
	window.addEventListener('zdb-write-failed', function () {
		_showSyncNotification('فشل كتابة البيانات في IndexedDB — قد تُ فقدان البيانات', 'error');
	});

	// الاستماع لكتابات التبويبات الأخرى (BroadcastChannel)
	window.addEventListener('zdb-remote-write', function (event) {
		// تبويب آخر كتب بيانات — أعد المزامنة إذا لزم
		var detail = event.detail || {};
		if (detail.key && detail.key.indexOf('zeralda-settings') !== -1) {
			// BUG #3 fix: call the exposed clearCompanyIdCache function
			// instead of setting a useless global _cachedCompanyId variable
			// that doesn't affect the one inside company_storage.js IIFE.
			if (window.CompanyStorage && typeof window.CompanyStorage.clearCompanyIdCache === 'function') {
				window.CompanyStorage.clearCompanyIdCache();
			}
		}
	});
})(window);
