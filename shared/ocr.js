// shared/ocr.js
// وحدة OCR الموحدة لـ Zeralda ERP
// يدمج: unified_ocr.js + ocr_field_extractors.js

(function (global) {
  'use strict';

  // ── OcrFieldExtractors ────────────────────────────────────────

  function normalizeArabicDigits(text) {
    return String(text || '')
      // Arabic-Indic digits ٠-٩ (U+0660-U+0669)
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      // Eastern Arabic-Indic digits ۰-۹ (U+06F0-U+06F9, used in Persian/Urdu)
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      // Arabic decimal separator ٫ (U+066B) → dot
      .replace(/\u066B/g, '.')
      // Arabic thousands separator ٬ (U+066C) → remove
      .replace(/\u066C/g, '');
  }

  function pickFirstNonEmpty(values) {
    var list = Array.isArray(values) ? values : [];
    for (var i = 0; i < list.length; i++) {
      var v = String(list[i] || '').trim();
      if (v) return v;
    }
    return '';
  }

  function extractRc(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:\bRC\b|registre\s+de\s+commerce|السجل\s+التجاري)\s*[:\-]?\s*([A-Z0-9\-\/]{4,40})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractNis(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:\bNIS\b|num(?:e|é)ro\s+d['']?identification\s+statistique|numero\s+identification\s+statistique|التعريف\s+الإحصائي|رقم\s+التعريف\s+الإحصائي)\s*[:\-]?\s*([A-Z0-9\-\/]{4,40})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractRib(text) {
    var raw = String(text || '');
    if (!raw) return '';
    var m = raw.match(/\b(?:RIB|IBAN)\s*[:\-]?\s*([A-Z0-9\s]{8,40})/i);
    return m ? String(m[1] || '').replace(/\s+/g, ' ').trim() : '';
  }

  function extractVat(text) {
    var raw = String(text || '');
    if (!raw) return '';
    var m = raw.match(/\b(?:TVA|VAT)\s*(?:N(?:o|°|umero)?)?\s*[:\-]?\s*([A-Z0-9\-\/]{4,30})/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function extractAg(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:\bN\s*[°º]?\s*AG\b|\bAG\b|agr(?:e|é)ment|رقم\s+الترخيص)\s*[:\-]?\s*([A-Z0-9\-\/]{3,40})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractArt(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:\bN\s*[°º]?\s*d['']?\s*art\b|\bart\b(?:icle)?|رقم\s+المادة)\s*[:\-]?\s*([A-Z0-9\-\/]{3,40})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractNin(text) {
    var raw = normalizeArabicDigits(text);
    var m = raw.match(/(?:\bNIN\b|الرقم\s+التعريفي\s+الوطني)\s*[:\-]?\s*([A-Z0-9\-\/]{4,40})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractAi(text) {
    var raw = normalizeArabicDigits(text);
    // Algerian "Article d'Imposition" — appears as "AI:" or "N° AI:" or "Art:" on invoices
    var m = raw.match(/(?:\bN\s*[°º]?\s*AI\b|\bAI\b\s*[:\-]?\s*|article\s+d['']?imposition\s*[:\-]?\s*)([0-9]{6,20})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractCustomerName(text) {
    var raw = String(text || '');
    if (!raw) return '';
    // Try patterns: "Client:", "Customer:", "Facturé à:", "Doit:", "عميل:"
    var patterns = [
      /(?:client|customer|acheteur|destinataire|factur[eé]\s*[eà]|doit)\s*[:\-]\s*([^\n\r]{3,80})/i,
      /(?:العميل|المشتري|الزبون|اسم\s*العميل)\s*[:\-]?\s*([^\n\r]{3,80})/,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = raw.match(patterns[i]);
      if (m) return String(m[1] || '').trim().substring(0, 80);
    }
    // Fallback: a line that contains an Algerian company-type designator
    var companyLine = raw.match(/^[^\n\r]*\b(SARL|SPA|EURL|EPIC|SNC|SAS)\b[^\n\r]*/m);
    if (companyLine) return companyLine[0].trim().substring(0, 80);
    return '';
  }

  function extractSupplierName(text) {
    var raw = String(text || '');
    if (!raw) return '';
    // Try patterns: "Fournisseur:", "Vendeur:", "Émis par:", "Émetteur:", "المورد:"
    var patterns = [
      /(?:fournisseur|vendeur|vendu\s*par|[eé]mis\s*par|[eé]metteur|raison\s*sociale|d[eé]nomination\s*sociale?)\s*[:\-]\s*([^\n\r]{3,80})/i,
      /(?:المورد|اسم\s*المورد|البائع|مقدم\s*الفاتورة|الشركة)\s*[:\-]?\s*([^\n\r]{3,80})/,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = raw.match(patterns[i]);
      if (m) return String(m[1] || '').trim().substring(0, 80);
    }
    // Fallback: first line with an Algerian company-type designator
    var companyLine = raw.match(/^[^\n\r]*\b(SARL|SPA|EURL|EPIC|SNC|SAS)\b[^\n\r]*/m);
    if (companyLine) return companyLine[0].trim().substring(0, 80);
    return '';
  }

  function extractNif(text) {
    var raw = normalizeArabicDigits(text);
    // Algerian NIF: "NIF:", "N° IF:", "N° d'identification fiscale:"
    var m = raw.match(/(?:\bNIF\b|\bN\s*[°º]?\s*IF\b|num[eé]ro\s+d['']?identification\s+fiscale|الرقم\s+الجبائي)\s*[:\-]?\s*([0-9]{10,20})/i);
    return m ? String(m[1] || '').replace(/[\s.،؛,;]+$/g, '').trim() : '';
  }

  function extractBp(text) {
    var raw = normalizeArabicDigits(text);
    // BP: "BP:", "B.P.:", "Boîte Postale:", "ص.ب"
    var m = raw.match(/(?:\bBP\b|\bB\.?\s*P\.?|bo[îi]te\s+postale|ص\.?\s*ب)\s*[:\-]?\s*([0-9]{3,10})/i);
    return m ? String(m[1] || '').trim() : '';
  }

  global.OcrFieldExtractors = {
    pickFirstNonEmpty,
    extractRc,
    extractNis,
    extractNif,
    extractBp,
    extractRib,
    extractVat,
    extractAg,
    extractArt,
    extractAi,
    extractNin,
    extractCustomerName,
    extractSupplierName
  };

  // ── UnifiedOCR ────────────────────────────────────────────────

  var EXCEL_MIME = {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
    'application/vnd.ms-excel': true,
    'text/csv': true,
    'application/csv': true
  };

  var WORD_MIME = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
    'application/msword': true,
    'application/vnd.ms-word': true,
    'text/plain': true
  };

  // SVG is excluded — it's a vector format, not raster. The server reads SVG as XML text.
  var IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.heif', '.jfif', '.avif', '.ico'];

  function normalizeMime(mime) { return String(mime || '').toLowerCase().trim(); }
  function normalizeName(name) { return String(name || '').toLowerCase().trim(); }

  function _hasImageExt(name) {
    for (var i = 0; i < IMAGE_EXT.length; i++) {
      if (name.slice(-IMAGE_EXT[i].length) === IMAGE_EXT[i]) return true;
    }
    return false;
  }

  function getFileKind(file, options) {
    var opts = options || {};
    var mime = normalizeMime(file && file.type);
    var name = normalizeName(file && file.name);
    var isImage = mime.indexOf('image/') === 0 || _hasImageExt(name);
    var isPdf   = mime === 'application/pdf' || name.slice(-4) === '.pdf';
    var isExcel = !!EXCEL_MIME[mime] || name.slice(-5) === '.xlsx' || name.slice(-4) === '.xls' || name.slice(-4) === '.csv';
    var isWord  = !!WORD_MIME[mime]  || name.slice(-5) === '.docx' || name.slice(-4) === '.doc' || name.slice(-4) === '.txt';
    if (isImage && opts.allowImage  !== false) return 'image';
    if (isPdf   && opts.allowPdf    !== false) return 'pdf';
    if (isExcel && opts.allowExcel  !== false) return 'excel';
    if (isWord  && opts.allowWordTxt !== false) return 'wordtxt';
    return '';
  }

  function supportedTypesText(options) {
    var opts = options || {}, parts = [];
    if (opts.allowPdf     !== false) parts.push('PDF');
    if (opts.allowImage   !== false) parts.push('image');
    if (opts.allowExcel   !== false) parts.push('Excel');
    if (opts.allowWordTxt !== false) parts.push('Word', 'TXT');
    return parts.join(', ');
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('file-read-failed')); };
      reader.readAsDataURL(file);
    });
  }

  function defaultOptimizeImage(file, maxWidth) {
    maxWidth = maxWidth || 2048;
    return new Promise(function (resolve) {
      if (typeof FileReader === 'undefined' || typeof Image === 'undefined') {
        return fileToDataUrl(file).then(resolve).catch(function () { resolve(''); });
      }
      var reader = new FileReader();
      reader.onerror = function () {
        fileToDataUrl(file).then(resolve).catch(function () { resolve(''); });
      };
      reader.onload = function (e) {
        var rawDataUrl = e.target.result;
        var img = new Image();
        img.onerror = function () { resolve(rawDataUrl); };
        img.onload = function () {
          try {
            var width = img.width || 0;
            var height = img.height || 0;
            if (!width || !height) return resolve(rawDataUrl);

            // If image is already smaller than maxWidth and file size is < 1MB, no recompression needed
            if (width <= maxWidth && height <= maxWidth && file.size < 1024 * 1024) {
              return resolve(rawDataUrl);
            }

            var ratio = 1;
            if (width > maxWidth || height > maxWidth) {
              ratio = Math.min(maxWidth / width, maxWidth / height);
            }
            var targetW = Math.round(width * ratio);
            var targetH = Math.round(height * ratio);

            var canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            var ctx = canvas.getContext('2d');
            if (!ctx) return resolve(rawDataUrl);

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.drawImage(img, 0, 0, targetW, targetH);

            var optUrl = canvas.toDataURL('image/jpeg', 0.88);
            resolve(optUrl);
          } catch (err) {
            console.warn('[UnifiedOCR] Canvas resize fallback to raw:', err);
            resolve(rawDataUrl);
          }
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  async function toDataUrl(file, kind, options) {
    var opts = options || {};
    if (kind === 'image') {
      if (typeof opts.optimizeImageFn === 'function') {
        return opts.optimizeImageFn(file, Number(opts.imageMaxWidth || 2048));
      }
      return defaultOptimizeImage(file, Number(opts.imageMaxWidth || 2048));
    }
    return fileToDataUrl(file);
  }

  async function extract(file, options) {
    var opts = options || {};
    if (!file) throw new Error(opts.emptyFileMessage || 'Please select a file first.');
    var kind = getFileKind(file, opts);
    if (!kind) throw new Error(opts.unsupportedTypeMessage || ('Unsupported file type. Use ' + supportedTypesText(opts) + '.'));

    var mimeType = normalizeMime(file.type);
    if (!mimeType || mimeType === 'application/octet-stream') {
      var _fn = normalizeName(file.name);
      if (_fn.slice(-4) === '.pdf') mimeType = 'application/pdf';
      else if (_fn.slice(-5) === '.xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (_fn.slice(-4) === '.xls') mimeType = 'application/vnd.ms-excel';
      else if (_fn.slice(-4) === '.csv') mimeType = 'text/csv';
      else if (_fn.slice(-5) === '.docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (_fn.slice(-4) === '.doc') mimeType = 'application/msword';
      else if (_fn.slice(-4) === '.png') mimeType = 'image/png';
      else if (_fn.slice(-4) === '.jpg' || _fn.slice(-5) === '.jpeg') mimeType = 'image/jpeg';
      else if (_fn.slice(-5) === '.webp') mimeType = 'image/webp';
    }
    var dataUrl  = await toDataUrl(file, kind, opts);
    if (dataUrl && dataUrl.indexOf('data:image/jpeg') === 0) {
      mimeType = 'image/jpeg';
    }
    var endpoint = String(opts.endpoint || '/api/ai/invoice-extract');
    if (typeof opts.buildApiUrl === 'function') endpoint = opts.buildApiUrl(endpoint);

    var token = '';
    try {
      if (typeof ZS !== 'undefined' && ZS && typeof ZS.getItem === 'function') {
        token = ZS.getItem(String(opts.tokenKey || 'zeralda-auth-token')) || ZS.getItem('zeralda-session-token') || '';
      } else if (typeof localStorage !== 'undefined') {
        token = localStorage.getItem(String(opts.tokenKey || 'zeralda-auth-token')) || localStorage.getItem('zeralda-session-token') || '';
      } else if (typeof sessionStorage !== 'undefined') {
        token = sessionStorage.getItem(String(opts.tokenKey || 'zeralda-auth-token')) || sessionStorage.getItem('zeralda-session-token') || '';
      }
    } catch (_) {}

    var headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (token) {
      headers.Authorization = 'Bearer ' + token;
      headers['X-Session-Token'] = token;
    }

    var payloadBody = { fileBase64: dataUrl, mimeType, fileName: file.name || '' };
    if (opts.extraBody && typeof opts.extraBody === 'object') {
      for (var k in opts.extraBody) {
        if (Object.prototype.hasOwnProperty.call(opts.extraBody, k)) payloadBody[k] = opts.extraBody[k];
      }
    }

    var userPrefLang = '';
    try {
      if (typeof localStorage !== 'undefined' && localStorage) userPrefLang = localStorage.getItem('preferredLanguage') || '';
    } catch(e) {}
    var lang = ((typeof window !== 'undefined' && window.currentLanguage) || userPrefLang || (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'ar').toLowerCase();
    var isAr = lang.indexOf('ar') === 0;
    var isFr = lang.indexOf('fr') === 0;
    var tooLargeMsg = isAr ? 'الملف كبير جداً (الحد الأقصى المسموح به 100 ميغابايت). يُرجى استخدام ملف أصغر أو ضغط الـ PDF/الصورة.'
      : (isFr ? 'Fichier trop volumineux (max 100 Mo recommandé). Veuillez utiliser un fichier plus petit ou compresser le PDF/image.'
      : 'File too large (max 100MB recommended). Please use a smaller file or compress the PDF/image.');

    if (JSON.stringify(payloadBody).length > 100 * 1024 * 1024) {
      throw new Error(tooLargeMsg);
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId  = controller ? setTimeout(function () { controller.abort(); }, 180000) : null;
    var fetchOpts  = { method: 'POST', headers, body: JSON.stringify(payloadBody) };
    if (controller) fetchOpts.signal = controller.signal;

    var response = await fetch(endpoint, fetchOpts).catch(function (err) {
      if (timeoutId) clearTimeout(timeoutId);
      if (err && err.name === 'AbortError') throw new Error(isAr ? 'انتهت مهلة الطلب (180 ثانية). الملف كبير جداً أو الاتصال بطيء.' : (isFr ? 'Délai d\'attente dépassé (180 s). Fichier trop lourd ou connexion lente.' : 'Request timeout (180 seconds). File is too large or network is too slow.'));
      throw err;
    });
    if (timeoutId) clearTimeout(timeoutId);

    var payload = await response.json().catch(() => ({}));
    if (response.status === 413) throw new Error(tooLargeMsg);
    if (response.status === 408) throw new Error(isAr ? 'انتهت مهلة الخادم. الملف كبير أو الاتصال بطيء.' : 'Request timeout. File is too large or network is slow.');

    // Automatic fallback to Tesseract if Copilot IA fails
    if (!response.ok || !payload.ok) {
      if (endpoint === '/api/ai/invoice-extract') {
        console.warn('[UnifiedOCR] Copilot IA failed (' + (payload.error || response.status) + '). Automatically falling back to Tesseract (/api/ocr/extract)...');
        try {
          var tessEndpoint = typeof opts.buildApiUrl === 'function' ? opts.buildApiUrl('/api/ocr/extract') : '/api/ocr/extract';
          var tessResp = await fetch(tessEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ fileBase64: dataUrl, mimeType: mimeType, fileName: file.name || '', lang: 'ara+fra+eng' })
          });
          var tessPayload = await tessResp.json().catch(() => ({}));
          if (tessResp.ok && tessPayload.ok && (tessPayload.text || '').trim()) {
            tessPayload.ocr_engine_used = 'tesseract-fallback';
            return {
              payload: tessPayload,
              text: String(tessPayload.text || '').trim(),
              mimeType: mimeType,
              fileName: String(file.name || ''),
              engineUsed: 'tesseract'
            };
          }
        } catch (tessErr) {
          console.warn('[UnifiedOCR] Tesseract fallback failed:', tessErr);
        }
      }
      throw new Error(payload.error || ('HTTP ' + response.status));
    }

    return { payload, text: String(payload.text || '').trim(), mimeType, fileName: String(file.name || '') };
  }

  function optimizeImageFileToDataUrl(file, maxSide) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          try {
            var ow = Number(img.width || 0), oh = Number(img.height || 0);
            if (!ow || !oh) { resolve(String(reader.result || '')); return; }
            var limit = Math.max(320, Number(maxSide || 2000));
            var ratio = Math.max(ow, oh) > limit ? limit / Math.max(ow, oh) : 1;
            var tw = Math.max(1, Math.round(ow * ratio)), th = Math.max(1, Math.round(oh * ratio));
            var canvas = document.createElement('canvas');
            canvas.width = tw; canvas.height = th;
            var ctx = canvas.getContext('2d');
            if (!ctx) { resolve(String(reader.result || '')); return; }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, tw, th);
            // Preserve PNG transparency — only use JPEG for opaque formats
            var fileName = String(file && file.name || '').toLowerCase();
            var isPng = fileName.slice(-4) === '.png' || (file && file.type === 'image/png');
            if (isPng) {
              resolve(canvas.toDataURL('image/png'));
            } else {
              resolve(canvas.toDataURL('image/jpeg', 0.95));
            }
          } catch (_) { resolve(String(reader.result || '')); }
        };
        img.onerror = function () { resolve(String(reader.result || '')); };
        img.src = String(reader.result || '');
      };
      reader.onerror = function () { reject(new Error('Failed to optimize image')); };
      reader.readAsDataURL(file);
    });
  }

  global.UnifiedOCR = { getFileKind, supportedTypesText, fileToDataUrl, extract, optimizeImage: optimizeImageFileToDataUrl };

  // ── ZeraldaOCR: Unified Professional Modal & Dropzone Controller ───

  var ZeraldaOCR = {
    state: {
      file: null,
      dataUrl: null,
      kind: null,
      mode: 'customer',
      extracted: null,
      options: null,
      isExtracting: false
    },

    translations: {
      ar: {
        modalTitle: "المساعد الذكي (Copilote IA) : المسح واستخراج البيانات",
        dropzoneTitle: "اسحب وأفلت المستند هنا، أو اضغط للاستعراض",
        dropzoneSubtitle: "يدعم الصور، PDF، ملفات Excel و Word",
        removeFile: "إزالة",
        scanning: "جاري قراءة وتحليل المستند بالمساعد الذكي (Copilote IA)...",
        extractBtn: "مسح واستخراج ذكي (Scan IA)",
        applyBtn: "تطبيق في النموذج",
        cancelBtn: "إلغاء",
        reScanBtn: "إعادة المسح",
        successExtracted: "تم استخراج البيانات بنجاح!",
        noTextFound: "لم يتم العثور على نصوص قابلة للاستخراج في هذا المستند.",
        fileRequired: "يرجى اختيار ملف مستند أولاً.",
        itemsExtracted: "البنود والمنتجات المستخرجة",
        totalAmount: "المجموع الإجمالي",
        selectAll: "تحديد الكل",
        itemDesc: "الوصف / البند",
        qty: "الكمية",
        price: "السعر",
        total: "المجموع",
        customerName: "اسم العميل",
        supplierName: "اسم المورد",
        rc: "السجل التجاري (RC)",
        nif: "الرقم الجبائي (NIF)",
        nis: "رقم التعريف الإحصائي (NIS)",
        ai: "المادة الضريبية (AI)",
        art: "رقم النشاط (ART)",
        phone: "الهاتف",
        email: "البريد الإلكتروني",
        address: "العنوان",
        city: "المدينة",
        tenderRef: "مرجع المناقصة",
        tenderTitle: "موضوع المناقصة",
        authority: "الجهة صاحبة المشروع",
        deadline: "آخر أجل للإيداع",
        amount: "المبلغ التقديري",
        empName: "اسم الموظف / المرشح",
        nin: "الرقم التعريفي الوطني (NIN)",
        birthDate: "تاريخ الميلاد",
        jobTitle: "المنصب / التخصص",
        education: "المؤهل الدراسي",
        takePhoto: "التقاط صورة بالكاميرا",
        productName: "اسم المنتج",
        productPrice: "سعر البيع",
        productCost: "سعر الشراء",
        productBarcode: "الباركود",
        productQty: "الكمية",
        category: "الفئة",
        journalRef: "مرجع القيد / الفاتورة",
        journalDesc: "بيان / وصف القيد",
        journalDate: "التاريخ",
        bankName: "اسم البنك",
        bankRib: "رقم الحساب / RIB",
        accountHolder: "صاحب الحساب",
        companyName: "اسم الشركة / المؤسسة"
      },
      fr: {
        modalTitle: "Copilote IA : Scan et extraction intelligente",
        dropzoneTitle: "Glissez-déposez le document ici, ou cliquez pour parcourir",
        dropzoneSubtitle: "Prend en charge images, PDF, Excel et Word",
        removeFile: "Supprimer",
        scanning: "Analyse et extraction du document par Copilote IA en cours...",
        extractBtn: "Scan & Extraction intelligente (IA)",
        applyBtn: "Appliquer au formulaire",
        cancelBtn: "Annuler",
        reScanBtn: "Réanalyser",
        successExtracted: "Données extraites avec succès !",
        noTextFound: "Aucun texte exploitable trouvé dans ce document.",
        fileRequired: "Veuillez d'abord sélectionner un fichier.",
        itemsExtracted: "Articles et lignes extraits",
        totalAmount: "Montant Total",
        selectAll: "Tout sélectionner",
        itemDesc: "Description / Article",
        qty: "Qté",
        price: "Prix Unitaire",
        total: "Total",
        customerName: "Nom Client",
        supplierName: "Nom Fournisseur",
        rc: "Registre de Commerce (RC)",
        nif: "NIF",
        nis: "NIS",
        ai: "Article d'Imposition (AI)",
        art: "N° d'Activité (ART)",
        phone: "Téléphone",
        email: "Email",
        address: "Adresse",
        city: "Ville",
        tenderRef: "Réf Appel d'Offres",
        tenderTitle: "Objet de l'Appel",
        authority: "Maître d'Ouvrage",
        deadline: "Date Limite",
        amount: "Montant Estimatif",
        empName: "Nom de l'Employé / Candidat",
        nin: "Numéro National (NIN)",
        birthDate: "Date de Naissance",
        jobTitle: "Poste / Spécialité",
        education: "Diplôme / Formation",
        takePhoto: "Prendre une photo (Caméra)",
        productName: "Nom Produit",
        productPrice: "Prix de Vente",
        productCost: "Prix d'Achat",
        productBarcode: "Code-barres",
        productQty: "Quantité",
        category: "Catégorie",
        journalRef: "Réf Écriture / Facture",
        journalDesc: "Libellé de l'Écriture",
        journalDate: "Date",
        bankName: "Nom Banque",
        bankRib: "RIB / Compte",
        accountHolder: "Titulaire Compte",
        companyName: "Société / Entreprise"
      },
      en: {
        modalTitle: "AI Copilot: Smart Scan & Extraction",
        dropzoneTitle: "Drag & drop your document here, or click to browse",
        dropzoneSubtitle: "Supports images, PDF, Excel and Word files",
        removeFile: "Remove",
        scanning: "Analyzing and extracting document with AI Copilot...",
        extractBtn: "Smart Scan & Extract (Scan IA)",
        applyBtn: "Apply to Form",
        cancelBtn: "Cancel",
        reScanBtn: "Re-scan",
        successExtracted: "Data extracted successfully!",
        noTextFound: "No usable text found in this document.",
        fileRequired: "Please select a document file first.",
        itemsExtracted: "Extracted Line Items",
        totalAmount: "Total Amount",
        selectAll: "Select All",
        itemDesc: "Description / Item",
        qty: "Qty",
        price: "Unit Price",
        total: "Total",
        customerName: "Customer Name",
        supplierName: "Supplier Name",
        rc: "Commercial Register (RC)",
        nif: "Tax ID (NIF)",
        nis: "Statistical ID (NIS)",
        ai: "Tax Article (AI)",
        art: "Activity Code (ART)",
        phone: "Phone",
        email: "Email",
        address: "Address",
        city: "City",
        tenderRef: "Tender Reference",
        tenderTitle: "Tender Subject",
        authority: "Contracting Authority",
        deadline: "Submission Deadline",
        amount: "Estimated Amount",
        empName: "Employee / Candidate Name",
        nin: "National ID (NIN)",
        birthDate: "Date of Birth",
        jobTitle: "Position / Specialization",
        education: "Education / Degree",
        takePhoto: "Take a Photo (Camera)",
        productName: "Product Name",
        productPrice: "Selling Price",
        productCost: "Purchase Price",
        productBarcode: "Barcode",
        productQty: "Quantity",
        category: "Category",
        journalRef: "Entry Ref / Invoice",
        journalDesc: "Entry Description",
        journalDate: "Date",
        bankName: "Bank Name",
        bankRib: "RIB / Account No",
        accountHolder: "Account Holder",
        companyName: "Company / Organization"
      }
    },

    getLang: function() {
      var storedLang = '';
      try {
        if (typeof localStorage !== 'undefined' && localStorage) {
          storedLang = localStorage.getItem('preferredLanguage') || '';
        }
      } catch (e) {}
      var l = ((typeof window !== 'undefined' && window.currentLanguage) || storedLang || (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'ar').toLowerCase();
      if (l.indexOf('fr') === 0) return 'fr';
      if (l.indexOf('en') === 0) return 'en';
      return 'ar';
    },

    t: function(key) {
      var lang = this.getLang();
      var dict = this.translations[lang] || this.translations.ar;
      return dict[key] || this.translations.ar[key] || key;
    },

    ensureStyles: function() {
      if (!document.getElementById('zeralda-ocr-unified-css')) {
        var link = document.createElement('link');
        link.id = 'zeralda-ocr-unified-css';
        link.rel = 'stylesheet';
        link.href = 'styles/ocr_unified.css?v=20261012d';
        document.head.appendChild(link);
      }
    },

    getModalEl: function() {
      var modal = document.getElementById('zeraldaUnifiedOcrModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'zeraldaUnifiedOcrModal';
        modal.className = 'modal ocr-unified-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
      }
      return modal;
    },

    escapeHtml: function(text) {
      return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    formatBytes: function(bytes) {
      if (!bytes || bytes <= 0) return '0 B';
      var k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
      var i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    renderModalHtml: function(options) {
      var opts = options || {};
      var title = opts.title || this.t('modalTitle');
      var subtitle = opts.subtitle || this.t('dropzoneSubtitle');
      var icon = opts.icon || 'fas fa-robot';

      return '' +
        '<div class="modal-content ocr-modal-content" role="document">' +
          '<div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--ocr-border);">' +
            '<h2 style="margin:0;font-size:17px;font-weight:700;display:flex;align-items:center;gap:10px;">' +
              '<i class="' + icon + '" style="color:var(--ocr-primary);" aria-hidden="true"></i>' +
              '<span>' + this.escapeHtml(title) + '</span>' +
            '</h2>' +
            '<button type="button" class="close-modal" id="ocrModalCloseBtn" aria-label="Close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--ocr-text-muted);">&times;</button>' +
          '</div>' +
          '<div class="ocr-shell">' +
            '<div class="ocr-header-banner">' +
              '<div class="ocr-header-icon"><i class="' + icon + '"></i></div>' +
              '<div class="ocr-header-text">' +
                '<h3>' + this.escapeHtml(title) + '</h3>' +
                '<p>' + this.escapeHtml(subtitle) + '</p>' +
              '</div>' +
            '</div>' +

            '<!-- Dropzone -->' +
            '<div class="ocr-dropzone" id="ocrDropzone">' +
              '<input type="file" id="ocrUnifiedFileInput" class="ocr-dropzone-input" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain">' +
              '<input type="file" id="ocrUnifiedCameraInput" accept="image/*" capture="environment" style="display:none;">' +
              '<div class="ocr-dropzone-icon"><i class="fas fa-cloud-upload-alt"></i></div>' +
              '<div class="ocr-dropzone-title">' + this.t('dropzoneTitle') + '</div>' +
              '<div class="ocr-dropzone-subtitle">' + this.t('dropzoneSubtitle') + '</div>' +
              '<div class="ocr-formats-badges">' +
                '<span class="ocr-format-badge"><i class="fas fa-file-pdf"></i> PDF</span>' +
                '<span class="ocr-format-badge"><i class="fas fa-file-image"></i> JPG / PNG</span>' +
                '<span class="ocr-format-badge"><i class="fas fa-file-excel"></i> Excel / CSV</span>' +
                '<span class="ocr-format-badge"><i class="fas fa-file-word"></i> Word / TXT</span>' +
              '</div>' +
              '<div class="ocr-dropzone-actions">' +
                '<button type="button" class="ocr-camera-btn" id="ocrCameraTriggerBtn"><i class="fas fa-camera"></i> <span>' + this.t('takePhoto') + '</span></button>' +
              '</div>' +
            '</div>' +

            '<!-- Selected File Card -->' +
            '<div class="ocr-file-card" id="ocrFileCard">' +
              '<i class="fas fa-file-alt ocr-file-icon" id="ocrFileIcon"></i>' +
              '<div class="ocr-file-meta">' +
                '<div class="ocr-file-name" id="ocrFileName">filename.pdf</div>' +
                '<div class="ocr-file-size" id="ocrFileSize">0 KB</div>' +
              '</div>' +
              '<button type="button" class="ocr-file-remove" id="ocrFileRemoveBtn"><i class="fas fa-times"></i> ' + this.t('removeFile') + '</button>' +
            '</div>' +

            '<!-- Scanning Beam Animation -->' +
            '<div class="ocr-scanning-container" id="ocrScanningContainer">' +
              '<div class="ocr-laser-sim"><div class="ocr-laser-beam"></div></div>' +
              '<div class="ocr-scanning-text"><i class="fas fa-spinner fa-spin"></i> ' + this.t('scanning') + '</div>' +
              '<div class="ocr-scanning-subtext">Gemini Vision AI Engine</div>' +
            '</div>' +

            '<!-- Status Banner -->' +
            '<div class="ocr-status-box" id="ocrStatusBox"></div>' +

            '<!-- Preview Panel -->' +
            '<div class="ocr-preview-panel" id="ocrPreviewPanel"></div>' +

            '<!-- Actions Footer -->' +
            '<div class="ocr-actions-footer">' +
              '<button type="button" class="btn btn-secondary" id="ocrCancelBtn">' + this.t('cancelBtn') + '</button>' +
              '<button type="button" class="btn btn-primary" id="ocrExtractBtn">' +
                '<i class="fas fa-bolt"></i> <span>' + this.t('extractBtn') + '</span>' +
              '</button>' +
              '<button type="button" class="btn btn-success" id="ocrApplyBtn" style="display:none;">' +
                '<i class="fas fa-check-circle"></i> <span>' + this.t('applyBtn') + '</span>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    },

    bindEvents: function(modal) {
      var self = this;
      var dropzone = modal.querySelector('#ocrDropzone');
      var fileInput = modal.querySelector('#ocrUnifiedFileInput');
      var cameraInput = modal.querySelector('#ocrUnifiedCameraInput');
      var cameraBtn = modal.querySelector('#ocrCameraTriggerBtn');
      var fileCard = modal.querySelector('#ocrFileCard');
      var removeBtn = modal.querySelector('#ocrFileRemoveBtn');
      var closeBtn = modal.querySelector('#ocrModalCloseBtn');
      var cancelBtn = modal.querySelector('#ocrCancelBtn');
      var extractBtn = modal.querySelector('#ocrExtractBtn');
      var applyBtn = modal.querySelector('#ocrApplyBtn');

      function closeIt() { self.close(); }
      if (closeBtn) closeBtn.onclick = closeIt;
      if (cancelBtn) cancelBtn.onclick = closeIt;
      modal.onclick = function(e) {
        if (e.target === modal) self.close();
      };

      if (cameraBtn && cameraInput) {
        cameraBtn.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          cameraInput.click();
        };
      }
      if (cameraInput) {
        cameraInput.addEventListener('change', function(e) {
          if (e.target.files && e.target.files.length) {
            self.handleFileSelect(e.target.files[0], modal);
          }
        });
      }

      // Drag & Drop
      ['dragenter', 'dragover'].forEach(function(evt) {
        dropzone.addEventListener(evt, function(e) {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('is-dragover');
        });
      });

      ['dragleave', 'drop'].forEach(function(evt) {
        dropzone.addEventListener(evt, function(e) {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('is-dragover');
        });
      });

      dropzone.addEventListener('drop', function(e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          self.handleFileSelect(e.dataTransfer.files[0], modal);
        }
      });

      fileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length) {
          self.handleFileSelect(e.target.files[0], modal);
        }
      });

      if (removeBtn) {
        removeBtn.onclick = function() {
          self.state.file = null;
          self.state.extracted = null;
          fileInput.value = '';
          if (cameraInput) cameraInput.value = '';
          fileCard.classList.remove('is-active');
          dropzone.style.display = 'flex';
          self.hideScanning(modal);
          self.hideStatus(modal);
          self.hidePreview(modal);
          if (applyBtn) applyBtn.style.display = 'none';
        };
      }

      if (extractBtn) {
        extractBtn.onclick = function() {
          self.runExtraction(modal);
        };
      }

      if (applyBtn) {
        applyBtn.onclick = function() {
          self.applyResult(modal);
        };
      }
    },

    handleFileSelect: function(file, modal) {
      this.state.file = file;
      this.state.extracted = null;

      var dropzone = modal.querySelector('#ocrDropzone');
      var fileCard = modal.querySelector('#ocrFileCard');
      var fileNameEl = modal.querySelector('#ocrFileName');
      var fileSizeEl = modal.querySelector('#ocrFileSize');
      var fileIconEl = modal.querySelector('#ocrFileIcon');
      var applyBtn = modal.querySelector('#ocrApplyBtn');

      if (applyBtn) applyBtn.style.display = 'none';
      this.hideStatus(modal);
      this.hidePreview(modal);

      if (fileNameEl) fileNameEl.textContent = file.name;
      if (fileSizeEl) fileSizeEl.textContent = this.formatBytes(file.size);

      // Icon determination
      var fn = (file.name || '').toLowerCase();
      var iconCls = 'fas fa-file-alt';
      if (fn.endsWith('.pdf')) iconCls = 'fas fa-file-pdf text-danger';
      else if (fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) iconCls = 'fas fa-file-excel text-success';
      else if (fn.endsWith('.docx') || fn.endsWith('.doc')) iconCls = 'fas fa-file-word text-primary';
      else if (file.type && file.type.indexOf('image/') === 0) iconCls = 'fas fa-file-image text-info';
      if (fileIconEl) fileIconEl.className = iconCls + ' ocr-file-icon';

      dropzone.style.display = 'none';
      fileCard.classList.add('is-active');
    },

    showScanning: function(modal) {
      var scan = modal.querySelector('#ocrScanningContainer');
      var extractBtn = modal.querySelector('#ocrExtractBtn');
      if (scan) scan.classList.add('is-active');
      if (extractBtn) {
        extractBtn.disabled = true;
        extractBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + this.t('scanning');
      }
    },

    hideScanning: function(modal) {
      var scan = modal.querySelector('#ocrScanningContainer');
      var extractBtn = modal.querySelector('#ocrExtractBtn');
      if (scan) scan.classList.remove('is-active');
      if (extractBtn) {
        extractBtn.disabled = false;
        extractBtn.innerHTML = '<i class="fas fa-bolt"></i> <span>' + this.t('extractBtn') + '</span>';
      }
    },

    showStatus: function(modal, message, tone) {
      var box = modal.querySelector('#ocrStatusBox');
      if (!box) return;
      var icon = tone === 'success' ? 'fa-check-circle' : (tone === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
      box.className = 'ocr-status-box is-active tone-' + (tone || 'info');
      box.innerHTML = '<i class="fas ' + icon + '" style="font-size:16px;margin-top:2px;"></i><div>' + this.escapeHtml(message) + '</div>';
    },

    hideStatus: function(modal) {
      var box = modal.querySelector('#ocrStatusBox');
      if (box) box.classList.remove('is-active');
    },

    hidePreview: function(modal) {
      var p = modal.querySelector('#ocrPreviewPanel');
      if (p) {
        p.classList.remove('is-active');
        p.innerHTML = '';
      }
    },

    runExtraction: async function(modal) {
      if (!this.state.file) {
        this.showStatus(modal, this.t('fileRequired'), 'error');
        return;
      }

      this.state.isExtracting = true;
      this.hideStatus(modal);
      this.hidePreview(modal);
      this.showScanning(modal);

      try {
        var result = await UnifiedOCR.extract(this.state.file, {
          endpoint: '/api/ai/invoice-extract',
          imageMaxWidth: 1600
        });

        var payload = result.payload || {};
        var text = result.text || '';
        var analysis = payload.analysis || {};
        var fields = analysis.fields || {};
        var lineItems = payload.lineItems || analysis.line_items || [];

        // Parse standard model
        var parsed = this.parseDocumentData(payload, text, this.state.mode);
        this.state.extracted = parsed;

        this.hideScanning(modal);
        var successMsg = this.t('successExtracted');
        if (result.engineUsed === 'tesseract' || payload.ocr_engine_used === 'tesseract-fallback') {
          var isAr = this.getLang() === 'ar';
          var isFr = this.getLang() === 'fr';
          successMsg += isAr ? ' (تم التبديل تلقائياً إلى Tesseract)' : (isFr ? ' (Basculé automatiquement sur Tesseract)' : ' (Auto fallback to Tesseract)');
        }
        this.showStatus(modal, successMsg, 'success');
        this.renderPreview(modal, parsed);

        var applyBtn = modal.querySelector('#ocrApplyBtn');
        if (applyBtn) {
          applyBtn.style.display = 'inline-flex';
          applyBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } catch (err) {
        this.hideScanning(modal);
        var msg = (err && err.message) || 'Unknown OCR Error';
        this.showStatus(modal, msg, 'error');
      } finally {
        this.state.isExtracting = false;
      }
    },

    parseDocumentData: function(payload, text, mode) {
      var ext = global.OcrFieldExtractors || {};
      var raw = text || '';
      var fields = (payload.analysis && payload.analysis.fields) || {};

      var customerName = payload.customer || fields.customer || (ext.extractCustomerName ? ext.extractCustomerName(raw) : '');
      var supplierName = payload.supplier || fields.supplier || (ext.extractSupplierName ? ext.extractSupplierName(raw) : '');
      var rc = payload.rc || fields.rc || (ext.extractRc ? ext.extractRc(raw) : '');
      var nif = payload.nif || fields.nif || (ext.extractNif ? ext.extractNif(raw) : '');
      var nis = payload.nis || fields.nis || (ext.extractNis ? ext.extractNis(raw) : '');
      var ai = payload.ai || fields.ai || (ext.extractAi ? ext.extractAi(raw) : '');
      var art = payload.art || fields.art || (ext.extractArt ? ext.extractArt(raw) : '');
      var rib = payload.rib || fields.rib || (ext.extractRib ? ext.extractRib(raw) : '');
      var phone = payload.phone || fields.phone || '';
      var email = payload.email || fields.email || '';
      var address = payload.address || fields.address || '';
      var city = payload.city || fields.city || '';

      // Line items normalization
      var rawItems = Array.isArray(payload.lineItems) ? payload.lineItems : (Array.isArray(payload.analysis && payload.analysis.line_items) ? payload.analysis.line_items : []);
      if (!rawItems.length && raw) {
        var lines = raw.split(/\r?\n/);
        for (var li = 0; li < lines.length; li++) {
          var lineTrim = lines[li].trim();
          if (!lineTrim || lineTrim.length < 5) continue;
          if (/(?:total|tva|sous-total|net|remise|montant|المجموع|الضريبة|الإجمالي|facture|client|date)/i.test(lineTrim)) continue;
          var numMatches = lineTrim.match(/([0-9]+(?:[.,][0-9]{1,2})?)/g);
          if (numMatches && numMatches.length >= 2) {
            var descPart = lineTrim.replace(/[0-9]+(?:[.,][0-9]{1,2})?/g, '').replace(/[\s\t,;:\-_|]+/g, ' ').trim();
            if (descPart.length >= 2) {
              var qVal = parseFloat(numMatches[0].replace(',', '.')) || 1;
              var pVal = parseFloat(numMatches[1].replace(',', '.')) || 0;
              var tVal = numMatches[2] ? parseFloat(numMatches[2].replace(',', '.')) : (qVal * pVal);
              rawItems.push({ description: descPart, quantity: qVal, unit_price: pVal, total: tVal });
            }
          }
        }
      }
      var items = rawItems.map(function(it, idx) {
        var q = parseFloat(String(it.quantity || 1).replace(',', '.').replace(/[^0-9.]/g, '')) || 1;
        var p = parseFloat(String(it.unit_price || it.unitPrice || it.price || 0).replace(',', '.').replace(/[^0-9.]/g, '')) || 0;
        var t = parseFloat(String(it.total || 0).replace(',', '.').replace(/[^0-9.]/g, '')) || (q * p);
        return {
          id: idx,
          description: String(it.description || it.name || ('Item #' + (idx + 1))).trim(),
          quantity: q,
          unitPrice: p,
          total: t,
          selected: true
        };
      });

      var subtotal = parseFloat(String(payload.subtotal || payload.totalHT || 0).replace(',', '.')) || 0;
      var vat = parseFloat(String(payload.vat || payload.totalTVA || payload.tax || 0).replace(',', '.')) || 0;
      var total = parseFloat(String(payload.total || payload.totalTTC || 0).replace(',', '.')) || 0;
      if (!total && items.length) {
        total = items.reduce(function(acc, i) { return acc + i.total; }, 0);
      }

      // Fallback phone/email extraction from raw text if missing
      if (!phone && raw) {
        var pm = raw.match(/(?:(?:0[567][0-9]{8})|(?:\+213\s?[567][0-9]{8})|(?:0[234][0-9]{7}))/);
        if (pm) phone = pm[0].replace(/\s+/g, '');
      }
      if (!email && raw) {
        var em = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (em) email = em[0];
      }

      // HR & Employee extraction
      var empName = payload.employeeName || fields.employee_name || customerName || '';
      var nin = payload.nin || fields.nin || '';
      if (!nin && raw) {
        var ninM = raw.match(/(?:(?:nin|رقم التعريف الوطني|cni)\s*[:\-]?\s*([0-9]{18}))/i);
        if (ninM) nin = ninM[1];
      }
      var birthDate = payload.birthDate || fields.birth_date || '';
      if (!birthDate && raw) {
        var bM = raw.match(/(?:né\(e\)\s*le|تاريخ الميلاد|date\s*de\s*naissance)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
        if (bM) birthDate = bM[1];
      }
      var jobTitle = payload.jobTitle || fields.job_title || '';
      if (!jobTitle && raw) {
        var jM = raw.match(/(?:poste|fonction|المنصب|مهنة|spécialité)\s*[:\-]?\s*([^\n\r]{3,60})/i);
        if (jM) jobTitle = jM[1].trim();
      }

      // Tender extraction
      var tenderTitle = '';
      var tenderRef = '';
      var authority = '';
      var deadline = '';
      if (raw) {
        var tm = raw.match(/(?:tender|appel\s+d['’]offres|مناقصة|طلب\s+عروض)[\s\w]*[\:\-]?\s*([^\n\r]{5,100})/i);
        if (tm) tenderTitle = tm[1].trim();
        var rm = raw.match(/(?:(?:n[°º]|réf|ref|مرجع|رقم)\s*[:\/\-]?\s*([A-Za-z0-9\/\-_]{3,40}))/i);
        if (rm) tenderRef = rm[1].trim();
        var am = raw.match(/(?:ma[iî]tre\s+d['’]ouvrage|client|administration|المصلحة\s+المتعاقدة|صاحب\s+المشروع|الجهة)\s*[:\-]?\s*([^\n\r]{3,80})/i);
        if (am) authority = am[1].trim();
        var dm = raw.match(/(?:deadline|échéance|date\s+limite|آخر\s+أجل|تاريخ\s+الإيداع)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
        if (dm) deadline = dm[1].trim();
      }

      // Inventory & Product extraction
      var productName = payload.productName || fields.product_name || (items[0] && items[0].description) || '';
      var barcode = payload.barcode || fields.barcode || '';
      if (!barcode && raw) {
        var bcM = raw.match(/\b([0-9]{8,14})\b/);
        if (bcM) barcode = bcM[1];
      }
      var purchasePrice = parseFloat(String(payload.purchasePrice || (items[0] && items[0].unitPrice) || 0).replace(',', '.')) || 0;
      var sellingPrice = parseFloat(String(payload.sellingPrice || (payload.purchasePrice ? (payload.purchasePrice * 1.25).toFixed(2) : (items[0] && items[0].unitPrice ? (items[0].unitPrice * 1.25).toFixed(2) : 0))).replace(',', '.')) || 0;
      var quantity = parseFloat(String(payload.quantity || (items[0] && items[0].quantity) || 1).replace(',', '.')) || 1;
      var category = payload.category || fields.category || 'General';

      // Finance, Journal & Bank extraction
      var journalDate = payload.date || fields.date || new Date().toISOString().slice(0, 10);
      var invoiceNumber = payload.invoiceNumber || payload.number || fields.invoice_number || '';
      if (!invoiceNumber && raw) {
        var invM = raw.match(/(?:(?:n[°º]|réf|ref|facture|quittance|reçu|رقم|مرجع)\s*[:\/\-]?\s*([A-Za-z0-9\/\-_]{3,30}))/i);
        if (invM) invoiceNumber = invM[1].trim();
      }
      var bankName = payload.bankName || '';
      if (!bankName && raw) {
        var bnkM = raw.match(/\b(BEA|BNA|CPA|BADR|BDL|CNEP|SGA|AGB|BARAKA|NATIXIS|FRANSABANK)\b/i);
        if (bnkM) bankName = bnkM[1].toUpperCase();
      }
      var accountHolder = customerName || supplierName || empName || '';
      var company = payload.company || customerName || supplierName || '';

      return {
        customerName: customerName,
        supplierName: supplierName,
        empName: empName,
        nin: nin,
        birthDate: birthDate,
        jobTitle: jobTitle,
        tenderTitle: tenderTitle,
        tenderRef: tenderRef,
        authority: authority,
        deadline: deadline,
        client: customerName,
        subject: tenderTitle || (raw ? raw.split('\n')[0].slice(0, 100) : ''),
        rc: rc,
        nif: nif,
        nis: nis,
        ai: ai,
        art: art,
        rib: rib,
        phone: phone,
        email: email,
        address: address,
        city: city,
        items: items,
        totals: { subtotal: subtotal, vat: vat, total: total },
        date: journalDate,
        invoiceNumber: invoiceNumber,
        productName: productName,
        barcode: barcode,
        purchasePrice: purchasePrice,
        sellingPrice: sellingPrice,
        quantity: quantity,
        category: category,
        reference: invoiceNumber,
        journalDate: journalDate,
        journalDesc: supplierName || customerName || (raw ? raw.split('\n')[0].slice(0, 80) : 'قيد مستند'),
        bankName: bankName,
        accountHolder: accountHolder,
        company: company,
        rawText: raw,
        payload: payload
      };
    },

    renderPreview: function(modal, data) {
      var p = modal.querySelector('#ocrPreviewPanel');
      if (!p) return;

      var mode = this.state.mode;
      var html = '<div class="ocr-preview-header">' +
        '<div class="ocr-preview-title"><i class="fas fa-check-circle text-success"></i> <span>' + this.t('itemsExtracted') + '</span></div>' +
        '<span class="ocr-confidence-badge"><i class="fas fa-magic"></i> AI Parsed</span>' +
      '</div>';

      // 1. Entity Fields Grid
      var fieldsList = [];
      if (mode === 'customer' || mode === 'invoice' || mode === 'proforma') {
        if (data.customerName) fieldsList.push({ label: this.t('customerName'), val: data.customerName });
      }
      if (mode === 'supplier' || mode === 'po' || mode === 'bill') {
        if (data.supplierName) fieldsList.push({ label: this.t('supplierName'), val: data.supplierName });
      }
      if (mode === 'employee' || mode === 'cv') {
        if (data.empName) fieldsList.push({ label: this.t('empName'), val: data.empName });
        if (data.nin) fieldsList.push({ label: this.t('nin'), val: data.nin });
        if (data.birthDate) fieldsList.push({ label: this.t('birthDate'), val: data.birthDate });
        if (data.jobTitle) fieldsList.push({ label: this.t('jobTitle'), val: data.jobTitle });
      }
      if (mode === 'tender') {
        if (data.tenderRef) fieldsList.push({ label: this.t('tenderRef'), val: data.tenderRef });
        if (data.tenderTitle) fieldsList.push({ label: this.t('tenderTitle'), val: data.tenderTitle });
        if (data.authority) fieldsList.push({ label: this.t('authority'), val: data.authority });
        if (data.deadline) fieldsList.push({ label: this.t('deadline'), val: data.deadline });
      }
      if (mode === 'consultation') {
        if (data.customerName || data.client) fieldsList.push({ label: this.t('customerName'), val: data.customerName || data.client });
        if (data.subject) fieldsList.push({ label: this.t('tenderTitle'), val: data.subject });
      }
      if (mode === 'inventory' || mode === 'product') {
        if (data.productName) fieldsList.push({ label: this.t('productName'), val: data.productName });
        if (data.barcode) fieldsList.push({ label: this.t('productBarcode'), val: data.barcode });
        if (data.purchasePrice > 0) fieldsList.push({ label: this.t('productCost'), val: data.purchasePrice.toFixed(2) + ' DZD' });
        if (data.sellingPrice > 0) fieldsList.push({ label: this.t('productPrice'), val: data.sellingPrice.toFixed(2) + ' DZD' });
        if (data.quantity > 0) fieldsList.push({ label: this.t('productQty'), val: String(data.quantity) });
        if (data.category) fieldsList.push({ label: this.t('category'), val: data.category });
      }
      if (mode === 'journal' || mode === 'finance') {
        if (data.journalDate || data.date) fieldsList.push({ label: this.t('journalDate'), val: data.journalDate || data.date });
        if (data.reference || data.invoiceNumber) fieldsList.push({ label: this.t('journalRef'), val: data.reference || data.invoiceNumber });
        if (data.supplierName || data.customerName) fieldsList.push({ label: this.t('journalDesc'), val: data.supplierName || data.customerName });
      }
      if (mode === 'bank') {
        if (data.bankName) fieldsList.push({ label: this.t('bankName'), val: data.bankName });
        if (data.rib) fieldsList.push({ label: this.t('bankRib'), val: data.rib });
        if (data.accountHolder) fieldsList.push({ label: this.t('accountHolder'), val: data.accountHolder });
      }
      if (mode === 'crm' || mode === 'lead') {
        if (data.customerName) fieldsList.push({ label: this.t('customerName'), val: data.customerName });
        if (data.company) fieldsList.push({ label: this.t('companyName'), val: data.company });
      }
      if (mode === 'universal') {
        if (data.customerName) fieldsList.push({ label: this.t('customerName'), val: data.customerName });
        if (data.supplierName) fieldsList.push({ label: this.t('supplierName'), val: data.supplierName });
        if (data.productName) fieldsList.push({ label: this.t('productName'), val: data.productName });
        if (data.barcode) fieldsList.push({ label: this.t('productBarcode'), val: data.barcode });
        if (data.reference || data.invoiceNumber) fieldsList.push({ label: this.t('journalRef'), val: data.reference || data.invoiceNumber });
        if (data.bankName) fieldsList.push({ label: this.t('bankName'), val: data.bankName });
        if (data.rib) fieldsList.push({ label: this.t('bankRib'), val: data.rib });
      }
      if (data.nif) fieldsList.push({ label: this.t('nif'), val: data.nif });
      if (data.rc) fieldsList.push({ label: this.t('rc'), val: data.rc });
      if (data.nis) fieldsList.push({ label: this.t('nis'), val: data.nis });
      if (data.ai) fieldsList.push({ label: this.t('ai'), val: data.ai });
      if (data.art) fieldsList.push({ label: this.t('art'), val: data.art });
      if (data.phone) fieldsList.push({ label: this.t('phone'), val: data.phone });
      if (data.email) fieldsList.push({ label: this.t('email'), val: data.email });
      if (data.city) fieldsList.push({ label: this.t('city'), val: data.city });

      if (fieldsList.length) {
        html += '<div class="ocr-fields-grid">';
        fieldsList.forEach(function(f) {
          html += '<div class="ocr-field-item">' +
            '<span class="ocr-field-label">' + ZeraldaOCR.escapeHtml(f.label) + '</span>' +
            '<span class="ocr-field-val">' + ZeraldaOCR.escapeHtml(f.val) + '</span>' +
          '</div>';
        });
        html += '</div>';
      }

      // 2. Line Items Table (if any)
      if (data.items && data.items.length) {
        html += '<div class="ocr-table-wrap">' +
          '<table class="ocr-items-table">' +
            '<thead>' +
              '<tr>' +
                '<th style="width:36px;text-align:center;"><input type="checkbox" id="ocrToggleAllItems" checked></th>' +
                '<th>' + this.t('itemDesc') + '</th>' +
                '<th style="text-align:center;width:60px;">' + this.t('qty') + '</th>' +
                '<th style="text-align:center;width:90px;">' + this.t('price') + '</th>' +
                '<th style="text-align:center;width:90px;">' + this.t('total') + '</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>';

        data.items.forEach(function(it, idx) {
          html += '<tr>' +
            '<td style="text-align:center;"><input type="checkbox" class="ocr-item-check" data-idx="' + idx + '" ' + (it.selected ? 'checked' : '') + '></td>' +
            '<td><strong>' + ZeraldaOCR.escapeHtml(it.description) + '</strong></td>' +
            '<td style="text-align:center;">' + it.quantity + '</td>' +
            '<td style="text-align:center;">' + (it.unitPrice > 0 ? it.unitPrice.toFixed(2) : '-') + '</td>' +
            '<td style="text-align:center;">' + (it.total > 0 ? it.total.toFixed(2) : '-') + '</td>' +
          '</tr>';
        });

        html += '</tbody></table></div>';

        // Totals Strip
        if (data.totals && (data.totals.total > 0 || data.totals.subtotal > 0)) {
          html += '<div class="ocr-totals-strip">' +
            '<div class="ocr-total-badge">' + this.t('totalAmount') + ': <strong>' + (data.totals.total || data.totals.subtotal).toFixed(2) + ' DZD</strong></div>' +
          '</div>';
        }
      }

      p.innerHTML = html;
      p.classList.add('is-active');

      // Bind table checkbox toggles
      var toggleAll = p.querySelector('#ocrToggleAllItems');
      var itemChecks = p.querySelectorAll('.ocr-item-check');
      if (toggleAll) {
        toggleAll.onchange = function() {
          var checked = toggleAll.checked;
          itemChecks.forEach(function(cb) {
            cb.checked = checked;
            var idx = parseInt(cb.getAttribute('data-idx'), 10);
            if (data.items[idx]) data.items[idx].selected = checked;
          });
        };
      }
      itemChecks.forEach(function(cb) {
        cb.onchange = function() {
          var idx = parseInt(cb.getAttribute('data-idx'), 10);
          if (data.items[idx]) data.items[idx].selected = cb.checked;
        };
      });
    },

    applyResult: function(modal) {
      var data = this.state.extracted;
      if (!data) return;

      var opts = this.state.options || {};
      if (typeof opts.onApply === 'function') {
        opts.onApply(data);
      } else {
        // Default handlers based on mode
        this.defaultApply(this.state.mode, data);
      }

      this.close();
    },

    defaultApply: function(mode, data) {
      var setVal = function(id, val) {
        var el = document.getElementById(id);
        if (el && val != null && String(val).trim() !== '') el.value = String(val).trim();
      };

      if (mode === 'customer') {
        // Populate customer fields if present
        setVal('newCustomerName', data.customerName);
        setVal('newCustomerRC', data.rc);
        setVal('newCustomerNIF', data.nif);
        setVal('newCustomerNIS', data.nis);
        setVal('newCustomerAI', data.ai);
        setVal('newCustomerART', data.art);
        setVal('newCustomerPhone', data.phone);
        setVal('newCustomerEmail', data.email);
        setVal('newCustomerCity', data.city);

        var typeSelect = document.getElementById('newCustomerType');
        if (typeSelect && (data.rc || data.nif)) {
          typeSelect.value = 'legal';
          if (typeof window.toggleCustomerBusinessFields === 'function') {
            window.toggleCustomerBusinessFields();
          }
        }
      } else if (mode === 'supplier') {
        var sName = document.getElementById('supplierName') || document.getElementById('newSupplierName');
        if (sName && data.supplierName) sName.value = data.supplierName;
        var sRc = document.getElementById('supplierRC') || document.getElementById('newSupplierRC');
        if (sRc && data.rc) sRc.value = data.rc;
        var sNif = document.getElementById('supplierNIF') || document.getElementById('newSupplierNIF');
        if (sNif && data.nif) sNif.value = data.nif;
        var sNis = document.getElementById('supplierNIS') || document.getElementById('newSupplierNIS');
        if (sNis && data.nis) sNis.value = data.nis;
        var sPhone = document.getElementById('supplierPhone') || document.getElementById('newSupplierPhone');
        if (sPhone && data.phone) sPhone.value = data.phone;
        var sEmail = document.getElementById('supplierEmail') || document.getElementById('newSupplierEmail');
        if (sEmail && data.email) sEmail.value = data.email;
        var sAddr = document.getElementById('supplierAddress') || document.getElementById('newSupplierAddress');
        if (sAddr && (data.address || data.city)) sAddr.value = data.address || data.city;
      } else if (mode === 'employee' || mode === 'cv') {
        setVal('employeeName', data.empName);
        setVal('employeeNationalId', data.nin);
        setVal('employeeDob', data.birthDate);
        setVal('employeePhone', data.phone);
        setVal('employeeEmail', data.email);
        setVal('employeeAddress', data.address || data.city);
        setVal('employeePosition', data.jobTitle);
      } else if (mode === 'consultation') {
        setVal('consultClient', data.customerName || data.client);
        setVal('consultSubject', data.subject || data.tenderTitle);
        setVal('consultDate', data.date);
      } else if (mode === 'tender') {
        setVal('tenderRef', data.tenderRef);
        setVal('tenderTitle', data.tenderTitle);
        setVal('tenderAuthority', data.authority);
        setVal('tenderDeadline', data.deadline);
        if (data.totals && data.totals.total > 0) setVal('tenderAmount', data.totals.total.toFixed(2));
      } else if (mode === 'inventory' || mode === 'product') {
        var pName = data.productName || (data.items && data.items[0] && data.items[0].description) || '';
        setVal('productName', pName);
        setVal('productBarcode', data.barcode);
        if (data.purchasePrice > 0) setVal('productPurchasePrice', data.purchasePrice.toFixed(2));
        else if (data.items && data.items[0] && data.items[0].unitPrice > 0) setVal('productPurchasePrice', data.items[0].unitPrice.toFixed(2));
        if (data.sellingPrice > 0) setVal('productSellingPrice', data.sellingPrice.toFixed(2));
        if (data.quantity > 0) setVal('productQuantity', data.quantity);
        if (data.category && typeof window.ensureCategoryExists === 'function') {
          window.ensureCategoryExists(data.category);
          setVal('productCategory', data.category);
        }
        if (typeof window.showToast === 'function') {
          window.showToast('تم تطبيق بيانات المنتج المستخرجة بنجاح!', 'success');
        }
      } else if (mode === 'journal' || mode === 'finance') {
        var jForm = document.getElementById('journalForm');
        if (jForm) {
          var dateInput = jForm.querySelector('input[type="date"]');
          if (dateInput && (data.journalDate || data.date)) dateInput.value = data.journalDate || data.date;
          var refInput = jForm.querySelector('input[placeholder*="reference"], input[placeholder*="مرجع"]');
          if (refInput && (data.reference || data.invoiceNumber)) refInput.value = data.reference || data.invoiceNumber;
          var descInput = jForm.querySelector('textarea');
          if (descInput) descInput.value = data.journalDesc || ('فاتورة ' + (data.supplierName || data.customerName || data.reference || ''));
          if (data.items && data.items.length && typeof window.addJournalLine === 'function') {
            var tbody = document.getElementById('journalLinesTable');
            if (tbody) {
              tbody.innerHTML = '';
              data.items.filter(function(i){ return i.selected; }).forEach(function(it) {
                window.addJournalLine();
                var rows = tbody.querySelectorAll('tr');
                var lastRow = rows[rows.length - 1];
                if (lastRow) {
                  var descInp = lastRow.querySelector('input[type="text"]');
                  if (descInp) descInp.value = it.description;
                  var numInps = lastRow.querySelectorAll('input[type="number"]');
                  if (numInps.length >= 2) {
                    numInps[0].value = (it.total || (it.quantity * it.unitPrice)).toFixed(2);
                    numInps[1].value = '0.00';
                  }
                }
              });
              if (typeof window.calculateJournalBalance === 'function') window.calculateJournalBalance();
            }
          }
          if (typeof window.showToast === 'function') {
            window.showToast('تم تعبئة سطور القيد المحاسبي بنجاح!', 'success');
          }
        }
      } else if (mode === 'bank') {
        if (data.bankName) {
          var bSel = document.getElementById('bankNameSelect');
          if (bSel) {
            for (var bi = 0; bi < bSel.options.length; bi++) {
              if (bSel.options[bi].value === data.bankName || bSel.options[bi].text.indexOf(data.bankName) !== -1) {
                bSel.selectedIndex = bi;
                break;
              }
            }
          }
        }
        setVal('bankRib', data.rib);
        setVal('bankAccountNumber', data.accountNumber || (data.rib ? data.rib.replace(/\s+/g, '') : ''));
        setVal('bankHolderName', data.accountHolder);
      } else if (mode === 'crm' || mode === 'lead') {
        var cForm = document.getElementById('customerForm') || document.getElementById('leadForm');
        if (cForm) {
          var inputs = cForm.querySelectorAll('input');
          inputs.forEach(function(inp) {
            var ph = (inp.placeholder || '').toLowerCase();
            var lbl = inp.parentElement ? (inp.parentElement.textContent || '').toLowerCase() : '';
            if ((ph.indexOf('name') !== -1 || lbl.indexOf('اسم') !== -1) && data.customerName && !inp.value) inp.value = data.customerName;
            if ((ph.indexOf('company') !== -1 || lbl.indexOf('شركة') !== -1) && (data.company || data.customerName) && !inp.value) inp.value = data.company || data.customerName;
            if (inp.type === 'email' && data.email && !inp.value) inp.value = data.email;
            if (inp.type === 'tel' && data.phone && !inp.value) inp.value = data.phone;
            if ((ph.indexOf('street') !== -1 || ph.indexOf('address') !== -1 || lbl.indexOf('عنوان') !== -1) && data.address && !inp.value) inp.value = data.address;
            if ((ph.indexOf('city') !== -1 || lbl.indexOf('مدينة') !== -1) && data.city && !inp.value) inp.value = data.city;
          });
        }
      } else if (mode === 'universal') {
        if (typeof window.showToast === 'function') {
          window.showToast('تم الاستخراج بنجاح! يمكنك نسخ البيانات أو استخدامها.', 'success');
        }
      }
    },

    open: function(options) {
      var opts = options || {};
      this.ensureStyles();
      this.state.file = null;
      this.state.dataUrl = null;
      this.state.kind = null;
      this.state.mode = opts.mode || 'customer';
      this.state.extracted = null;
      this.state.options = opts;
      this.state.isExtracting = false;

      var modal = this.getModalEl();
      modal.innerHTML = this.renderModalHtml(opts);
      this.bindEvents(modal);

      modal.classList.add('is-active');
      modal.classList.add('active');
      modal.style.setProperty('display', 'flex', 'important');
      modal.style.setProperty('z-index', '999999', 'important');
      modal.style.setProperty('position', 'fixed', 'important');
      modal.style.setProperty('top', '0', 'important');
      modal.style.setProperty('left', '0', 'important');
      modal.style.setProperty('right', '0', 'important');
      modal.style.setProperty('bottom', '0', 'important');
      modal.style.setProperty('width', '100vw', 'important');
      modal.style.setProperty('height', '100vh', 'important');
      modal.style.setProperty('background', 'rgba(15, 23, 42, 0.75)', 'important');
      modal.style.setProperty('align-items', 'center', 'important');
      modal.style.setProperty('justify-content', 'center', 'important');
      modal.removeAttribute('aria-hidden');
      modal.setAttribute('aria-hidden', 'false');
      if (document.body) document.body.classList.add('modal-open');
      return modal;
    },

    close: function() {
      var modal = document.getElementById('zeraldaUnifiedOcrModal');
      if (modal) {
        modal.classList.remove('is-active');
        modal.classList.remove('active');
        modal.style.setProperty('display', 'none', 'important');
        modal.setAttribute('aria-hidden', 'true');
      }
      if (document.body) document.body.classList.remove('modal-open');
    },

    openModal: function(options) {
      return this.open(options);
    }
  };

  function openUniversalOcrModal(options) {
    var isAr = ZeraldaOCR.getLang() === 'ar';
    var isFr = ZeraldaOCR.getLang() === 'fr';
    var opts = options || {};
    opts.mode = opts.mode || 'universal';
    opts.title = opts.title || (isAr ? 'المسح الضوئي الذكي الشامل (Scan IA)' : (isFr ? 'Scan Intelligent Universel (IA)' : 'Universal AI Smart Scan'));
    opts.subtitle = opts.subtitle || (isAr ? 'امسح أي فاتورة، إيصال، كشف بنكي، بطاقة عمل، أو ملصق منتج' : (isFr ? 'Scannez factures, reçus, chèques, cartes de visite ou articles' : 'Scan any invoice, receipt, check, business card, or product label'));
    opts.icon = opts.icon || 'fas fa-camera';
    return ZeraldaOCR.open(opts);
  }

  global.ZeraldaOCR = ZeraldaOCR;
  global.openUniversalOcrModal = openUniversalOcrModal;
  if (typeof window !== 'undefined') {
    window.ZeraldaOCR = ZeraldaOCR;
    window.openOcrModal = function(options) {
      return ZeraldaOCR.open(options);
    };
    window.openUniversalOcrModal = openUniversalOcrModal;
  }

})(typeof window !== 'undefined' ? window : this);

