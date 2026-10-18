/**
 * ============================================================================
 * UNIFIED ALGERIAN DOCUMENT & PRINT ENGINE (محرك طباعة الوثائق التجارية الجزائري الموحد)
 * ============================================================================
 * Standardized document printer for:
 *   - Invoices (Factures de vente)
 *   - Quotes / Estimates (Devis / Offres de prix)
 *   - Purchase Orders (Bons de commande)
 *   - Delivery Notes (Bons de livraison)
 *   - Proforma Invoices (Factures proforma)
 *   - Tenders Financial Offers & BPU (العروض المالية للمناقصات وجداول الأسعار الأحادية)
 *
 * Compliant with Algerian Fiscal & Commercial Law:
 *   - Official Identifiers: NIF, NIS, RC, Article d'Imposition (Art. Imp.), Capital Social
 *   - Bank & Postal Details: RIB, RIP, Banque, Agence
 *   - Algerian Tax Grid: TVA (19%, 9%, 0%), Timbre Fiscal (Droit de timbre pour paiement espèces)
 *   - Multi-lingual Tafqeet (تفقيط الأرقام بالحروف: عربي، فرنسي، إنجليزي)
 *   - Clean print stylesheet & responsive PDF output via ZeraldaPrintEngine
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UnifiedDocumentPrinter = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- Escape utility ---
  function esc(val) {
    if (val == null) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Currency & Number Formatting ---
  function formatMoney(amount, currency) {
    var n = Number(amount) || 0;
    var curr = currency || 'DZD';
    var formatted = n.toLocaleString('fr-DZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return formatted + ' ' + (curr === 'DZD' ? 'د.ج' : curr);
  }

  function formatMoneyRaw(amount) {
    var n = Number(amount) || 0;
    return n.toLocaleString('fr-DZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // --- Multi-lingual Tafqeet (Numbers to Words) ---
  var Tafqeet = {
    arabic: function (amount) {
      var n = Math.abs(Number(amount) || 0);
      var integerPart = Math.floor(n);
      var decimalPart = Math.round((n - integerPart) * 100);

      if (integerPart === 0 && decimalPart === 0) return 'صفر دينار جزائري';

      var ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
      var teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
      var tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
      var hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

      function under100(val) {
        if (val < 10) return ones[val] || '';
        if (val < 20) return teens[val - 10] || '';
        var t = Math.floor(val / 10);
        var o = val % 10;
        if (o === 0) return tens[t] || '';
        return (ones[o] || '') + ' و ' + (tens[t] || '');
      }

      function under1000(val) {
        var h = Math.floor(val / 100);
        var rest = val % 100;
        if (h === 0) return under100(rest);
        if (rest === 0) return hundreds[h] || '';
        return (hundreds[h] || '') + ' و ' + under100(rest);
      }

      var scales = [
        { value: 1000000000, one: 'مليار', two: 'ملياران', many: 'مليارات' },
        { value: 1000000, one: 'مليون', two: 'مليونان', many: 'ملايين' },
        { value: 1000, one: 'ألف', two: 'ألفان', many: 'آلاف' }
      ];

      var remainder = integerPart;
      var parts = [];

      scales.forEach(function (s) {
        if (remainder >= s.value) {
          var chunk = Math.floor(remainder / s.value);
          remainder = remainder % s.value;
          if (chunk === 1) {
            parts.push(s.one);
          } else if (chunk === 2) {
            parts.push(s.two);
          } else if (chunk >= 3 && chunk <= 10) {
            parts.push(under1000(chunk) + ' ' + s.many);
          } else {
            parts.push(under1000(chunk) + ' ' + s.one);
          }
        }
      });

      if (remainder > 0 || parts.length === 0) {
        parts.push(under1000(remainder));
      }

      var text = parts.join(' و ') + ' دينار جزائري';
      if (decimalPart > 0) {
        text += ' و ' + under100(decimalPart) + ' سنتيم';
      }
      return text;
    },

    french: function (amount) {
      var n = Math.abs(Number(amount) || 0);
      var integerPart = Math.floor(n);
      var decimalPart = Math.round((n - integerPart) * 100);

      if (integerPart === 0 && decimalPart === 0) return 'zéro dinar algérien';

      var units = ['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
      var tens = ['','','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];

      function under100(val) {
        if (val < 20) return units[val] || '';
        var t = Math.floor(val / 10);
        var o = val % 10;
        if (t === 7) {
          if (o === 1) return 'soixante et onze';
          if (o === 0) return 'soixante-dix';
          return 'soixante-' + (units[10 + o] || '');
        }
        if (t === 9) {
          if (o === 0) return 'quatre-vingt-dix';
          return 'quatre-vingt-' + (units[10 + o] || '');
        }
        if (o === 1 && t < 8) return tens[t] + ' et un';
        if (o === 0) return (t === 8) ? 'quatre-vingts' : (tens[t] || '');
        return tens[t] + '-' + units[o];
      }

      function under1000(val) {
        var h = Math.floor(val / 100);
        var rest = val % 100;
        var hStr = '';
        if (h === 1) hStr = 'cent';
        else if (h > 1) hStr = units[h] + ' cents';
        if (rest === 0) return hStr;
        var restStr = under100(rest);
        if (!hStr) return restStr;
        if (h > 1 && rest > 0) hStr = units[h] + ' cent';
        return hStr + ' ' + restStr;
      }

      var parts = [];
      var remainder = integerPart;

      var billions = Math.floor(remainder / 1000000000);
      remainder %= 1000000000;
      var millions = Math.floor(remainder / 1000000);
      remainder %= 1000000;
      var thousands = Math.floor(remainder / 1000);
      remainder %= 1000;

      if (billions > 0) {
        parts.push(billions === 1 ? 'un milliard' : under1000(billions) + ' milliards');
      }
      if (millions > 0) {
        parts.push(millions === 1 ? 'un million' : under1000(millions) + ' millions');
      }
      if (thousands > 0) {
        parts.push(thousands === 1 ? 'mille' : under1000(thousands) + ' mille');
      }
      if (remainder > 0 || parts.length === 0) {
        parts.push(under1000(remainder));
      }

      var text = parts.join(' ') + ' dinars algériens';
      if (decimalPart > 0) {
        text += ' et ' + under100(decimalPart) + ' centimes';
      }
      return text;
    },

    toWords: function (amount, lang) {
      var l = (lang || 'fr').toLowerCase();
      if (l.startsWith('ar')) return this.arabic(amount);
      return this.french(amount);
    }
  };

  // --- Active Company Fiscal Profile Loader ---
  function getActiveCompanyInfo() {
    try {
      if (typeof window !== 'undefined') {
        var settingsRaw = localStorage.getItem('zeralda-settings');
        var settings = settingsRaw ? JSON.parse(settingsRaw) : null;
        var activeId = (settings && settings.activeCompanyId) || localStorage.getItem('zeralda-active-company');
        var companies = (settings && settings.companies) || [];

        if (!companies.length) {
          var compsRaw = localStorage.getItem('zeralda-companies');
          companies = compsRaw ? JSON.parse(compsRaw) : [];
        }

        var found = null;
        if (activeId && companies.length) {
          found = companies.find(function (c) { return c && (c.id === activeId || c.companyId === activeId); });
        }
        if (!found && companies.length) {
          found = companies[0];
        }

        if (found) {
          return {
            name: found.name || found.companyName || 'Zeralda Enterprise',
            nif: found.nif || found.fiscalNif || '000000000000000',
            nis: found.nis || found.fiscalNis || '0000000000',
            rc: found.rc || found.fiscalRc || '00/00-0000000',
            article: found.article || found.fiscalArticle || found.ai || '00000000000',
            capital: found.capital || found.capitalSocial || '',
            address: found.address || found.siegeSocial || 'Alger, Algérie',
            phone: found.phone || found.tel || '',
            email: found.email || '',
            rib: found.rib || found.bankRib || '',
            bankName: found.bankName || found.banque || '',
            logo: found.logo || found.logoUrl || ''
          };
        }
      }
    } catch (e) {
      console.warn('[UnifiedDocumentPrinter] Could not load active company profile', e);
    }

    return {
      name: 'ZERALDA ENTERPRISE',
      nif: '001916000000000',
      nis: '001916000000000',
      rc: '16/00-0123456B20',
      article: '16012345678',
      capital: '10 000 000 DZD',
      address: 'Zone Industrielle, Alger, Algérie',
      phone: '+213 (0) 23 00 00 00',
      email: 'contact@zeralda-dz.com',
      rib: '',
      bankName: '',
      logo: ''
    };
  }

  // --- Document Type Labels ---
  var DOC_TYPES = {
    INVOICE: { fr: 'FACTURE', ar: 'فاتورة بيع', prefix: 'FAC' },
    PROFORMA: { fr: 'FACTURE PROFORMA', ar: 'فاتورة شكلية', prefix: 'PRO' },
    QUOTE: { fr: 'DEVIS / OFFRE DE PRIX', ar: 'عرض أسعار / تقدير', prefix: 'DEV' },
    PURCHASE_ORDER: { fr: 'BON DE COMMANDE', ar: 'سند طلبية', prefix: 'BC' },
    DELIVERY_NOTE: { fr: 'BON DE LIVRAISON', ar: 'سند تسليم', prefix: 'BL' },
    BPU: { fr: 'BORDEREAU DES PRIX UNITAIRES (BPU)', ar: 'جدول الأسعار الأحادية والتفصيلية', prefix: 'BPU' },
    TENDER_OFFER: { fr: 'OFFRE FINANCIÈRE DE MARCHÉ', ar: 'عرض مالي لمناقصة عمومية', prefix: 'OFF' }
  };

  /**
   * Builds the complete, responsive Algerian document HTML string
   * @param {Object} doc - Document data
   * @param {Object} options - Customizations & overrides
   */
  function generateDocumentHtml(doc, options) {
    var opts = options || {};
    var lang = (opts.lang || 'fr').toLowerCase();
    var isAr = lang.startsWith('ar');
    var dir = isAr ? 'rtl' : 'ltr';

    var docTypeKey = (doc.type || 'INVOICE').toUpperCase();
    var typeMeta = DOC_TYPES[docTypeKey] || DOC_TYPES.INVOICE;
    var docTitle = isAr ? typeMeta.ar : typeMeta.fr;

    var company = Object.assign({}, getActiveCompanyInfo(), doc.company || {});
    var client = doc.client || {};
    var items = Array.isArray(doc.items) ? doc.items : [];

    // Financial calculations
    var totalHT = Number(doc.totalHT != null ? doc.totalHT : (doc.montantHT || 0));
    var discount = Number(doc.discount || doc.remise || 0);
    var netHT = totalHT - discount;
    if (netHT < 0) netHT = 0;

    var tvaRate = doc.tvaRate != null ? Number(doc.tvaRate) : (doc.tva != null ? Number(doc.tva) : 19);
    var montantTVA = Number(doc.montantTVA != null ? doc.montantTVA : (netHT * (tvaRate / 100)));

    var timbreFiscal = Number(doc.timbreFiscal || 0);
    var totalTTC = Number(doc.totalTTC != null ? doc.totalTTC : (netHT + montantTVA + timbreFiscal));

    var docCode = doc.code || doc.number || doc.reference || (typeMeta.prefix + '-' + Date.now().toString(36).toUpperCase());
    var docDate = doc.date || new Date().toISOString().slice(0, 10);
    var docDueDate = doc.dueDate || doc.validityDate || doc.echeance || '';

    var inWords = doc.totalInWords || Tafqeet.toWords(totalTTC, lang);

    var html = '';
    html += '<div class="unified-doc-container" dir="' + dir + '">';

    // --- Header Section ---
    html += '  <div class="doc-header-grid">';
    html += '    <div class="company-brand-col">';
    if (company.logo) {
      html += '      <img src="' + esc(company.logo) + '" alt="Logo" class="company-logo" />';
    }
    html += '      <h1 class="company-name">' + esc(company.name) + '</h1>';
    html += '      <p class="company-sub">' + esc(company.address) + '</p>';
    if (company.phone) html += '      <p class="company-contact"><strong>' + (isAr ? 'الهاتف:' : 'Tél:') + '</strong> ' + esc(company.phone) + (company.email ? ' | ' + esc(company.email) : '') + '</p>';
    html += '    </div>';

    // Document Badge
    html += '    <div class="doc-badge-col">';
    html += '      <div class="doc-type-badge">' + esc(docTitle) + '</div>';
    html += '      <div class="doc-meta-item"><span>' + (isAr ? 'الرقم المرجعي:' : 'Réf. N°:') + '</span> <strong>' + esc(docCode) + '</strong></div>';
    html += '      <div class="doc-meta-item"><span>' + (isAr ? 'التاريخ:' : 'Date:') + '</span> <strong>' + esc(docDate) + '</strong></div>';
    if (docDueDate) {
      html += '      <div class="doc-meta-item"><span>' + (isAr ? 'الأجل / الصلاحية:' : 'Échéance / Validité:') + '</span> <strong>' + esc(docDueDate) + '</strong></div>';
    }
    html += '    </div>';
    html += '  </div>';

    // --- Algerian Legal & Fiscal Bar ---
    html += '  <div class="fiscal-id-bar">';
    html += '    <div class="fiscal-chip"><span>NIF / الرقم الجبائي:</span> <strong>' + esc(company.nif) + '</strong></div>';
    html += '    <div class="fiscal-chip"><span>NIS / الإحصائي:</span> <strong>' + esc(company.nis) + '</strong></div>';
    html += '    <div class="fiscal-chip"><span>RC / السجل التجاري:</span> <strong>' + esc(company.rc) + '</strong></div>';
    html += '    <div class="fiscal-chip"><span>Art. Imp. / المادة:</span> <strong>' + esc(company.article) + '</strong></div>';
    if (company.capital) {
      html += '    <div class="fiscal-chip"><span>Capital / رأس المال:</span> <strong>' + esc(company.capital) + '</strong></div>';
    }
    html += '  </div>';

    // --- Client / Partner Box ---
    html += '  <div class="partner-section">';
    html += '    <div class="partner-card">';
    html += '      <div class="partner-title">' + (isAr ? 'العميل / المشتري / صاحب المشروع (Client / Maître d\'Ouvrage)' : 'CLIENT / MAÎTRE DE L\'OUVRAGE') + '</div>';
    html += '      <div class="partner-name">' + esc(client.name || client.nom || (isAr ? 'عميل كرام' : 'Client Comptoir')) + '</div>';
    if (client.address) html += '      <div class="partner-detail">' + esc(client.address) + '</div>';
    if (client.nif || client.rc) {
      html += '      <div class="partner-fiscal">';
      if (client.nif) html += '<span>NIF: <strong>' + esc(client.nif) + '</strong></span> ';
      if (client.rc) html += '<span>RC: <strong>' + esc(client.rc) + '</strong></span> ';
      if (client.article) html += '<span>Article: <strong>' + esc(client.article) + '</strong></span>';
      html += '      </div>';
    }
    html += '    </div>';
    if (doc.subject || doc.tenderTitle || doc.object) {
      html += '    <div class="subject-card">';
      html += '      <div class="partner-title">' + (isAr ? 'موضوع العملية / الصفقة (Objet / Intitulé)' : 'OBJET / INTITULÉ DE LA MISSION') + '</div>';
      html += '      <div class="subject-text">' + esc(doc.subject || doc.tenderTitle || doc.object) + '</div>';
      if (doc.tenderRef) {
        html += '      <div class="partner-detail"><strong>Réf. Appel d\'offres:</strong> ' + esc(doc.tenderRef) + '</div>';
      }
      html += '    </div>';
    }
    html += '  </div>';

    // --- Items Table ---
    html += '  <table class="unified-doc-table">';
    html += '    <thead>';
    html += '      <tr>';
    html += '        <th style="width: 5%;">#</th>';
    html += '        <th style="width: 45%;">' + (isAr ? 'البيان وتعيين المواد / الخدمات (Désignation)' : 'Désignation & Description des Prestations') + '</th>';
    html += '        <th style="width: 10%; text-align: center;">' + (isAr ? 'الوحدة (U)' : 'Unité') + '</th>';
    html += '        <th style="width: 10%; text-align: center;">' + (isAr ? 'الكمية (Qté)' : 'Quantité') + '</th>';
    html += '        <th style="width: 15%; text-align: right;">' + (isAr ? 'السعر الأحادي د.ج (P.U HT)' : 'Prix Unitaire HT') + '</th>';
    html += '        <th style="width: 15%; text-align: right;">' + (isAr ? 'المجموع د.ج (Total HT)' : 'Montant Total HT') + '</th>';
    html += '      </tr>';
    html += '    </thead>';
    html += '    <tbody>';

    if (items.length === 0) {
      html += '      <tr><td colspan="6" style="text-align:center; padding: 20px; color:#64748b;">' + (isAr ? 'لا توجد بنود مدخلة' : 'Aucun article enregistré') + '</td></tr>';
    } else {
      items.forEach(function (it, idx) {
        var pu = Number(it.price || it.unitPrice || it.pu || it.rate || 0);
        var qty = Number(it.quantity || it.qty || it.qte || 1);
        var rowTotal = Number(it.total || it.totalHT || (pu * qty));
        var unitName = it.unit || it.unite || 'U';
        var descText = it.description || it.name || it.designation || ('Article #' + (idx + 1));

        html += '      <tr>';
        html += '        <td style="text-align: center; color: #64748b;">' + (idx + 1) + '</td>';
        html += '        <td><strong>' + esc(descText) + '</strong>' + (it.details ? '<div class="row-subtext">' + esc(it.details) + '</div>' : '') + '</td>';
        html += '        <td style="text-align: center;">' + esc(unitName) + '</td>';
        html += '        <td style="text-align: center; font-weight: 600;">' + qty + '</td>';
        html += '        <td style="text-align: right;">' + formatMoneyRaw(pu) + '</td>';
        html += '        <td style="text-align: right; font-weight: 700;">' + formatMoneyRaw(rowTotal) + '</td>';
        html += '      </tr>';
      });
    }

    html += '    </tbody>';
    html += '  </table>';

    // --- Totals & Financial Breakdown ---
    html += '  <div class="financial-summary-grid">';
    html += '    <div class="words-and-notes-box">';
    html += '      <div class="in-words-card">';
    html += '        <div class="words-title">' + (isAr ? 'المبلغ الإجمالي بالحروف:' : 'Arrêtée la présente pièce à la somme de :') + '</div>';
    html += '        <div class="words-content">' + esc(inWords) + '</div>';
    html += '      </div>';

    if (company.rib || doc.paymentTerms) {
      html += '      <div class="bank-info-box">';
      if (company.bankName || company.rib) {
        html += '        <div><strong>Mode de Règlement:</strong> ' + esc(company.bankName || 'Virement Bancaire') + ' - RIB: <code>' + esc(company.rib) + '</code></div>';
      }
      if (doc.paymentTerms) {
        html += '        <div><strong>Conditions:</strong> ' + esc(doc.paymentTerms) + '</div>';
      }
      html += '      </div>';
    }
    html += '    </div>';

    // Numeric totals table
    html += '    <div class="numeric-totals-box">';
    html += '      <table class="totals-table">';
    html += '        <tr><td>' + (isAr ? 'المجموع الخام (Total Brut HT):' : 'Total Brut HT') + '</td><td class="t-val">' + formatMoneyRaw(totalHT) + ' د.ج</td></tr>';
    if (discount > 0) {
      html += '        <tr><td>' + (isAr ? 'الخصم التجاري (Remise):' : 'Remise commerciale') + '</td><td class="t-val">-' + formatMoneyRaw(discount) + ' د.ج</td></tr>';
      html += '        <tr><td>' + (isAr ? 'الصافي التجاري (Net HT):' : 'Net Commercial HT') + '</td><td class="t-val font-bold">' + formatMoneyRaw(netHT) + ' د.ج</td></tr>';
    }
    html += '        <tr><td>' + (isAr ? 'الرسم على القيمة المضافة (TVA ' + tvaRate + '%):' : 'TVA (' + tvaRate + '%)') + '</td><td class="t-val">' + formatMoneyRaw(montantTVA) + ' د.ج</td></tr>';
    if (timbreFiscal > 0) {
      html += '        <tr><td>' + (isAr ? 'حق الطابع الجبائي (Timbre Fiscal):' : 'Droit de Timbre Fiscal') + '</td><td class="t-val">' + formatMoneyRaw(timbreFiscal) + ' د.ج</td></tr>';
    }
    html += '        <tr class="grand-total-row"><td>' + (isAr ? 'المجموع الصافي للدفع (Net à Payer TTC):' : 'NET À PAYER TTC') + '</td><td class="t-val">' + formatMoneyRaw(totalTTC) + ' د.ج</td></tr>';
    html += '      </table>';
    html += '    </div>';
    html += '  </div>';

    // --- Signatures & Legal Stamps with Fiscal QR Code ---
    var qrFiscalBoxHtml = '';
    try {
      if (typeof QRCode !== 'undefined' && typeof document !== 'undefined') {
        var qrData = [
          'Etab: ' + (company.name || 'Zeralda ERP'),
          'NIF: ' + (company.nif || ''),
          'Doc: ' + (docCode || ''),
          'Date: ' + (docDate || ''),
          'TTC: ' + totalTTC + ' DZD',
          'TVA: ' + montantTVA + ' DZD'
        ].join('\n');
        var tempDiv = document.createElement('div');
        new QRCode(tempDiv, {
          text: qrData,
          width: 75,
          height: 75,
          colorDark: '#0f172a',
          colorLight: '#ffffff'
        });
        qrFiscalBoxHtml = '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; margin:2px auto;">' +
          tempDiv.innerHTML +
          '<div style="font-size:9px; font-weight:700; color:#0284c7; margin-top:3px; letter-spacing:0.5px;">CONFORME DGI DZ</div>' +
          '</div>';
      }
    } catch (_) {}

    if (docTypeKey !== 'INVOICE' && docTypeKey !== 'PROFORMA' && opts.showSignatures !== false) {
      html += '  <div class="signatures-grid">';
      html += '    <div class="sig-box">';
      html += '      <div class="sig-title">' + (isAr ? 'تأشيرة ومصادقة الزبون (Client)' : 'Accusé de réception & Visa Client') + '</div>';
      html += '      <div class="sig-space"></div>';
      html += '      <div class="sig-sub">' + (isAr ? 'التاريخ والختم:' : 'Date, signature et cachet') + '</div>';
      html += '    </div>';
      if (qrFiscalBoxHtml) {
        html += '    <div class="sig-box" style="flex:0.7; align-items:center; justify-content:center; background:#fafafa;">';
        html += '      <div class="sig-title" style="width:100%;">' + (isAr ? 'التحقق الرقمي' : 'Vérification QR') + '</div>';
        html += '      <div style="margin:4px 0;">' + qrFiscalBoxHtml + '</div>';
        html += '      <div class="sig-sub" style="font-size:9px; color:#64748b;">Réf: ' + esc(docCode) + '</div>';
        html += '    </div>';
      }
      html += '    <div class="sig-box">';
      html += '      <div class="sig-title">' + (isAr ? 'الإدارة العامة والمحاسبة (Entreprise)' : 'Direction Générale / Cachet de l\'Entreprise') + '</div>';
      html += '      <div class="sig-space"></div>';
      html += '      <div class="sig-sub">' + esc(company.name) + '</div>';
      html += '    </div>';
      html += '  </div>';

      // --- Footer bar ---
      html += '  <div class="doc-footer-legal">';
      html += '    <span>Zeralda ERP Standard DZ</span> | ';
      html += '    <span>' + esc(company.name) + '</span> | ';
      html += '    <span>NIF: ' + esc(company.nif) + '</span> | ';
      html += '    <span>RC: ' + esc(company.rc) + '</span>';
      html += '  </div>';
    } else if (qrFiscalBoxHtml) {
      html += '  <div style="margin:12px auto; display:flex; justify-content:center;">' + qrFiscalBoxHtml + '</div>';
    }

    html += '</div>';

    return html;
  }

  // --- Embedded Standard CSS for Printing & Screens ---
  var DOCUMENT_CSS = [
    '.unified-doc-container { font-family: "Segoe UI", Roboto, -apple-system, sans-serif; background: #fff; color: #0f172a; max-width: 900px; margin: 0 auto; padding: 24px; box-sizing: border-box; line-height: 1.45; }',
    '.doc-header-grid { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 14px; }',
    '.company-brand-col { flex: 1; }',
    '.company-logo { max-height: 65px; max-width: 180px; object-fit: contain; margin-bottom: 8px; }',
    '.company-name { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px; }',
    '.company-sub { font-size: 12px; color: #475569; margin: 0 0 3px 0; }',
    '.company-contact { font-size: 11px; color: #64748b; margin: 0; }',
    '.doc-badge-col { text-align: right; min-width: 260px; }',
    '[dir="rtl"] .doc-badge-col { text-align: left; }',
    '.doc-type-badge { display: inline-block; background: #0284c7; color: #fff; font-size: 16px; font-weight: 800; padding: 6px 16px; border-radius: 6px; letter-spacing: 1px; margin-bottom: 10px; text-transform: uppercase; }',
    '.doc-meta-item { font-size: 12px; color: #334155; margin-bottom: 3px; }',
    '.doc-meta-item strong { color: #0f172a; font-size: 13px; }',
    '.fiscal-id-bar { display: flex; flex-wrap: wrap; gap: 8px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 11px; margin-bottom: 18px; }',
    '.fiscal-chip { color: #475569; }',
    '.fiscal-chip strong { color: #0f172a; }',
    '.partner-section { display: flex; gap: 16px; margin-bottom: 18px; }',
    '.partner-card, .subject-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; background: #fcfdfe; }',
    '.partner-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #0284c7; margin-bottom: 4px; letter-spacing: 0.5px; }',
    '.partner-name { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }',
    '.partner-detail { font-size: 12px; color: #475569; }',
    '.partner-fiscal { font-size: 11px; color: #64748b; margin-top: 4px; }',
    '.partner-fiscal span { margin-right: 8px; }',
    '.subject-text { font-size: 13px; font-weight: 600; color: #1e293b; margin-bottom: 4px; }',
    '.unified-doc-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }',
    '.unified-doc-table th { background: #0f172a; color: #fff; font-weight: 700; text-align: left; padding: 8px 10px; border: 1px solid #0f172a; font-size: 11px; text-transform: uppercase; }',
    '[dir="rtl"] .unified-doc-table th { text-align: right; }',
    '.unified-doc-table td { padding: 8px 10px; border: 1px solid #e2e8f0; color: #1e293b; vertical-align: top; }',
    '.unified-doc-table tbody tr:nth-child(even) { background: #f8fafc; }',
    '.row-subtext { font-size: 10px; color: #64748b; margin-top: 2px; }',
    '.financial-summary-grid { display: flex; gap: 20px; margin-bottom: 20px; align-items: flex-start; }',
    '.words-and-notes-box { flex: 1.2; display: flex; flex-direction: column; gap: 10px; }',
    '.in-words-card { border: 1px solid #cbd5e1; border-left: 4px solid #0284c7; border-radius: 4px; padding: 10px 14px; background: #f8fafc; }',
    '[dir="rtl"] .in-words-card { border-left: 1px solid #cbd5e1; border-right: 4px solid #0284c7; }',
    '.words-title { font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 4px; text-transform: uppercase; }',
    '.words-content { font-size: 13px; font-weight: 700; color: #0284c7; font-style: italic; }',
    '.bank-info-box { font-size: 11px; color: #475569; background: #fff; border: 1px dashed #cbd5e1; border-radius: 4px; padding: 8px 12px; }',
    '.numeric-totals-box { flex: 0.9; }',
    '.totals-table { width: 100%; border-collapse: collapse; font-size: 12px; }',
    '.totals-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; color: #334155; }',
    '.totals-table .t-val { text-align: right; font-weight: 600; color: #0f172a; white-space: nowrap; }',
    '.grand-total-row td { background: #0284c7 !important; color: #fff !important; font-weight: 800 !important; font-size: 14px !important; padding: 8px 10px !important; border-top: 2px solid #0369a1; }',
    '.grand-total-row .t-val { color: #fff !important; }',
    '.signatures-grid { display: flex; gap: 20px; margin-top: 24px; margin-bottom: 24px; }',
    '.sig-box { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; text-align: center; min-height: 110px; display: flex; flex-direction: column; justify-content: space-between; }',
    '.sig-title { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; border-bottom: 1px dashed #e2e8f0; padding-bottom: 4px; }',
    '.sig-space { height: 50px; }',
    '.sig-sub { font-size: 10px; color: #94a3b8; }',
    '.doc-footer-legal { text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; }',
    '@media print {',
    '  @page { size: A4 portrait; margin: 0 !important; }',
    '  html, body { margin: 0; padding: 0; background: #fff; width: 100%; min-height: 100%; }',
    '  .unified-doc-container { width: 100% !important; max-width: 100% !important; padding: 8mm 10mm 10mm 10mm !important; }',
    '  .unified-doc-table { width: 100%; }',
    '  .unified-doc-table th { background: #0f172a !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '  .doc-type-badge, .grand-total-row td { background: #0284c7 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '  .signatures-grid, .doc-footer-legal, .financial-summary-grid { page-break-inside: avoid; break-inside: avoid; }',
    '  .financial-summary-grid { margin-top: 14px; }',
    '  .preview-scale-content, .preview-zoom-viewport { transform: none !important; width: 100% !important; overflow: visible !important; }',
    '}'
  ].join('\n');

  /**
   * Main print method: renders document HTML and triggers ZeraldaPrintEngine
   */
  function printDocument(docData, options) {
    var opts = options || {};
    var htmlContent = generateDocumentHtml(docData, opts);

    var title = (docData.type || 'Document') + ' ' + (docData.code || docData.reference || '');

    if (window.ZeraldaPrintEngine && typeof window.ZeraldaPrintEngine.printContent === 'function') {
      return window.ZeraldaPrintEngine.printContent(htmlContent, title, {
        dir: opts.lang && opts.lang.startsWith('ar') ? 'rtl' : 'ltr',
        lang: opts.lang || 'fr',
        extraCss: DOCUMENT_CSS
      });
    }

    // Fallback: open popup directly
    var printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('الرجاء السماح بالنوافذ المنبثقة للطباعة');
      return false;
    }

    printWindow.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(title) + '</title><style>' + DOCUMENT_CSS + '</style></head><body>' + htmlContent + '<script>window.onload=function(){window.print();window.close();};<\/script></body></html>');
    printWindow.document.close();
    return true;
  }

  return {
    Tafqeet: Tafqeet,
    getActiveCompanyInfo: getActiveCompanyInfo,
    generateDocumentHtml: generateDocumentHtml,
    printDocument: printDocument,
    formatMoney: formatMoney,
    formatMoneyRaw: formatMoneyRaw,
    numberToWords: function (amount, lang) {
      return Tafqeet.toWords(amount, lang);
    }
  };
}));
