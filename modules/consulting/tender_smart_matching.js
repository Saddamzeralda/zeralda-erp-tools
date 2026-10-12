(function () {
    'use strict';

    const TENDER_ANALYSIS_KEY = 'tender-analysis-data';

    // ── نظام الترجمة الموحد ──
    var DICT = {
        title:              { en: 'AI Tender Copilot & Smart Pricing', ar: 'المساعد الذكي للمناقصات والتسعير التنافسي', fr: 'Copilote IA & Tarification intelligente des AO' },
        subtitle:           { en: 'AI-driven specification breakdown, benchmark matching, win probability & proposal drafting.', ar: 'تفكيك دفتر الشروط، مطابقة الأسعار المرجعية، تقدير احتمالية الفوز، وصياغة العروض بالذكاء الاصطناعي.', fr: 'Analyse du cahier des charges, prix de référence, probabilité de succès et rédaction d\'offres.' },
        tabPricing:         { en: 'Smart Pricing & Benchmarks', ar: 'التسعير والمطابقة المرجعية', fr: 'Prix & Références' },
        tabCopilot:         { en: 'AI Tender Assistant', ar: 'محادثة المساعد الذكي', fr: 'Assistant IA AO' },
        tabProposal:        { en: 'Proposal & Letter Drafter', ar: 'صياغة العرض والخطاب الرسمي', fr: 'Rédaction d\'offres & Lettres' },
        tabAudit:           { en: 'AI Scan & Document Audit', ar: 'المسح الذكي وتدقيق الوثائق (Scan IA)', fr: 'Scan IA & Audit Cahier des charges' },
        upload:             { en: 'Upload Specification (PDF, Word, Excel, Image)', ar: 'رفع دفتر الشروط (PDF، Word، Excel، صورة)', fr: 'Téléverser le cahier des charges' },
        extracted:          { en: 'Extracted Items & Benchmarks', ar: 'البنود المستخرجة والأسعار المقترحة', fr: 'Postes détectés et prix suggérés' },
        margin:             { en: 'Target Margin %', ar: 'نسبة الهامش المستهدف %', fr: 'Marge cible %' },
        detected:           { en: 'Item / Specification', ar: 'البند / المواصفة', fr: 'Poste / Spécification' },
        qty:                { en: 'Qty', ar: 'الكمية', fr: 'Qté' },
        lastSale:           { en: 'Historical Benchmark', ar: 'السعر المرجعي السابق', fr: 'Prix de référence' },
        suggested:          { en: 'Proposed Unit Price', ar: 'سعر الوحدة المقترح', fr: 'Prix unitaire proposé' },
        subtotal:           { en: 'Subtotal (DZD)', ar: 'المجموع الجزئي (دج)', fr: 'Sous-total (DZD)' },
        action:             { en: 'Action', ar: 'إجراء', fr: 'Action' },
        applyAll:           { en: 'Apply Total to Tender', ar: 'اعتماد المجموع في المناقصة', fr: 'Appliquer à l\'AO' },
        addItem:            { en: 'Add Item', ar: 'إضافة بند مخصص', fr: 'Ajouter un poste' },
        scanning:           { en: 'AI is analyzing document & extracting specifications...', ar: 'الذكاء الاصطناعي يحلل المستند ويفكك بنود دفتر الشروط...', fr: 'L\'IA analyse le document et extrait les spécifications...' },
        appliedSuccess:     { en: 'Tender amount & specifications updated successfully!', ar: 'تم تحديث مبلغ وبيانات المناقصة بنجاح!', fr: 'Montant et données de l\'AO mis à jour avec succès !' },
        winScore:           { en: 'Win Probability Index', ar: 'مؤشر احتمالية الفوز', fr: 'Indice de succès estimé' },
        competitiveness:    { en: 'Price Competitiveness', ar: 'تنافسية العرض المالي', fr: 'Compétitivité du prix' },
        sendQuestion:       { en: 'Ask AI assistant about this tender...', ar: 'اسأل المساعد الذكي أي شيء حول هذه المناقصة...', fr: 'Posez une question sur cet appel d\'offres...' },
        generateDraft:      { en: 'Generate Submission Letter', ar: 'توليد خطاب التقديم الرسمي', fr: 'Générer lettre de soumission' },
        generateBPU:        { en: 'Generate Unit Price Schedule (BPU)', ar: 'توليد جدول الأسعار الأحادية (BPU)', fr: 'Générer bordereau des prix (BPU)' },
        generateTech:       { en: 'Generate Technical Methodology', ar: 'توليد المنهجية الفنية للمشروع', fr: 'Générer mémoire technique' },
        copyClipboard:      { en: 'Copy to Clipboard', ar: 'نسخ للحافظة', fr: 'Copier dans le presse-papier' },
        autoChecklist:      { en: 'Generate Submission Checklist', ar: 'استخراج وتوليد قائمة الوثائق المطلوبة', fr: 'Générer la checklist des pièces' }
    };

    var t = function (k, fb) {
        var lang = (window.ZS && window.ZS.getItem('preferred-language')) || 'ar';
        if (DICT[k] && DICT[k][lang]) return DICT[k][lang];
        if (DICT[k] && DICT[k].ar) return DICT[k].ar;
        if (DICT[k] && DICT[k].en) return DICT[k].en;
        return fb || k;
    };

    function getActiveCompanyId() {
        if (window.CompanyStorage && window.CompanyStorage.getActiveCompanyId) {
            var cid = window.CompanyStorage.getActiveCompanyId();
            if (cid) return String(cid);
        }
        try {
            var s = JSON.parse((window.ZS && window.ZS.getItem('zeralda-settings')) || '{}');
            return String(s.activeCompanyId || 'default-company');
        } catch(e) {
            return 'default-company';
        }
    }

    function getAuthHeaders() {
        var tok = (window.ZS && window.ZS.getItem('zeralda-auth-token')) || '';
        var headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };
        if (tok) headers['Authorization'] = 'Bearer ' + tok;
        return headers;
    }

    /**
     * Call ERP AI Chat endpoint with fallback handling
     */
    async function callAIChat(messages, systemContext) {
        var headers = getAuthHeaders();
        var fullMessages = [];
        if (Array.isArray(messages)) {
            fullMessages = fullMessages.concat(messages);
        } else if (typeof messages === 'string') {
            fullMessages.push({ role: 'user', content: messages });
        }

        try {
            var bodyPayload = {
                messages: fullMessages,
                type: 'general'
            };
            if (systemContext) {
                bodyPayload.system_prompt = systemContext;
            }

            var res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(bodyPayload)
            });

            if (!res.ok) {
                var errDetail = '';
                try {
                    var errData = await res.json();
                    errDetail = (errData && (errData.detail && errData.detail.error || errData.error)) || '';
                } catch(e) {}
                throw new Error('AI request failed with status ' + res.status + (errDetail ? ': ' + errDetail : ''));
            }

            var data = await res.json();
            var text = String((data && (data.text || data.reply || data.content || data.response || data.result)) || '').trim();
            return { ok: true, text: text, data: data };
        } catch (e) {
            console.error('[TenderAI] Error calling AI chat:', e);
            return { ok: false, error: e.message || 'AI service unavailable' };
        }
    }

    /**
     * Extracts items and specifications from text using LLM
     */
    async function extractSpecificationsWithAI(documentText) {
        if (!documentText || documentText.trim().length < 10) {
            return { items: [], metadata: {}, checklist: [] };
        }

        var prompt = `أنت خبير قانوني وهندسي متخصص في الصفقات العمومية والمناقصات (Public Procurement & Tenders).
حلل نص دفتر الشروط التالي واستخرج البيانات التالية بدقة.
يجب أن ترجع النتيجة بصيغة JSON فقط دون أي نصوص إضافية:
{
  "reference": "مرجع المناقصة",
  "title": "موضوع أو عنوان المناقصة",
  "authority": "الجهة المتعاقدة / المشتري",
  "deadline": "YYYY-MM-DD أو تاريخ انتهاء العروض",
  "estimatedBudget": 0.0,
  "executionPeriod": "مدة الإنجاز",
  "items": [
    { "name": "اسم البند أو الخدمة", "qty": 1, "unit": "U / Ens / M2 / Jours", "category": "Matériel / Service / Travaux" }
  ],
  "requiredDocuments": [
    "قائمة الوثائق الإدارية والتقنية المطلوبة (تصريح بالنزاهة، مستخرج الضرائب، السجل التجاري، الكفالة...)"
  ],
  "keyClauses": [
    "الشروط الأساسية أو الشروط الجزائية الهامة"
  ]
}

نص المستند:
` + documentText.slice(0, 7000);

        var aiRes = await callAIChat(prompt, "You are an expert public tender extraction assistant. Respond ONLY in valid JSON format.");
        if (aiRes.ok && aiRes.text) {
            try {
                var cleanJson = aiRes.text.replace(/```json/gi, '').replace(/```/g, '').trim();
                var jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    var parsed = JSON.parse(jsonMatch[0]);
                    return {
                        reference: parsed.reference || '',
                        title: parsed.title || '',
                        authority: parsed.authority || '',
                        deadline: parsed.deadline || '',
                        estimatedBudget: parseFloat(parsed.estimatedBudget) || 0,
                        executionPeriod: parsed.executionPeriod || '',
                        items: Array.isArray(parsed.items) ? parsed.items : [],
                        requiredDocuments: Array.isArray(parsed.requiredDocuments) ? parsed.requiredDocuments : [],
                        keyClauses: Array.isArray(parsed.keyClauses) ? parsed.keyClauses : []
                    };
                }
            } catch (err) {
                console.warn('[TenderAI] Failed to parse JSON from AI response, falling back to heuristic parsing:', err);
            }
        }

        // Fallback heuristic parsing if AI is unreachable or response invalid
        return {
            items: parseItemsFromTextHeuristic(documentText),
            requiredDocuments: [
                "Déclaration de candidature (تصريح بالترشح)",
                "Déclaration à souscrire (تصريح بالاكتتاب)",
                "Registre de commerce (السجل التجاري)",
                "Extrait de rôle apuré (مستخرج جدول الضرائب)",
                "Attestation CASNOS / CNAS (شهادة أداء المستحقات)",
                "Bilans financiers des 3 dernières années (الحصائل المالية)",
                "Références professionnelles similaires (شهادات حسن الإنجاز)"
            ],
            keyClauses: []
        };
    }

    function parseItemsFromTextHeuristic(text) {
        var lines = String(text || '').split(/\r?\n/);
        var detected = [];
        lines.forEach(function(l) {
            var trimmed = l.trim();
            if (!trimmed || trimmed.length < 4 || trimmed.length > 140) return;
            var matchQty = trimmed.match(/^(\d+)\s*[-.)xX]\s*(.+)/) || trimmed.match(/(.+?)\s*[:=]\s*(\d+)\s*(pcs|u|unites|qty|x)?$/i);
            if (matchQty) {
                var name = matchQty[2] || matchQty[1];
                var qty = parseInt(matchQty[1] || matchQty[2], 10) || 1;
                detected.push({ name: name.trim(), qty: Math.max(1, qty), category: 'General' });
            } else if (/^(art|lot|item|poste|article|بند|عنصر)\s*\d+/i.test(trimmed)) {
                detected.push({ name: trimmed, qty: 1, category: 'General' });
            }
        });
        if (!detected.length) {
            detected = [
                { name: "Services de conseil et études techniques", qty: 1, category: "Services" },
                { name: "Fourniture et installation équipements", qty: 2, category: "Matériel" },
                { name: "Assistance technique et formation", qty: 1, category: "Services" }
            ];
        }
        return detected.slice(0, 20);
    }

    /**
     * Searches historic invoices and purchase orders for exact and semantic pricing benchmarks
     */
    window.getMarketPriceBenchmarks = function(itemName) {
        if (!itemName || typeof itemName !== 'string') return [];
        var needle = itemName.trim().toLowerCase();
        if (needle.length < 2) return [];

        var cid = getActiveCompanyId();
        var invoices = [];
        try {
            var raw = (window.ZS && (window.ZS.getItem('invoices-data::' + cid) || window.ZS.getItem('invoices-data'))) || '[]';
            invoices = JSON.parse(raw);
        } catch(e) { invoices = []; }

        var matches = [];
        if (Array.isArray(invoices)) {
            invoices.forEach(function(inv) {
                var items = Array.isArray(inv.items) ? inv.items : [];
                items.forEach(function(it) {
                    var itName = String(it.name || it.description || it.designation || '').trim();
                    if (!itName) return;
                    var itLower = itName.toLowerCase();
                    if (itLower.includes(needle) || needle.includes(itLower)) {
                        var p = Number(it.price || it.unitPrice || it.rate || 0);
                        if (p > 0) {
                            matches.push({
                                price: p,
                                date: inv.date || inv.createdAt || '',
                                customer: (inv.customer && (inv.customer.name || inv.customer.company)) || inv.client || 'Client',
                                source: 'Vente (Sales)',
                                rawName: itName
                            });
                        }
                    }
                });
            });
        }

        // Also check purchasing data
        try {
            var rawPur = (window.ZS && (window.ZS.getItem('purchases-data::' + cid) || window.ZS.getItem('purchases-data') || window.ZS.getItem('zeralda-purchasing-data::' + cid))) || '[]';
            var pur = JSON.parse(rawPur);
            var orders = Array.isArray(pur) ? pur : (Array.isArray(pur.orders) ? pur.orders : []);
            orders.forEach(function(po) {
                var items = Array.isArray(po.items) ? po.items : [];
                items.forEach(function(it) {
                    var itName = String(it.name || it.description || '').toLowerCase();
                    var p = Number(it.price || it.unitPrice || 0);
                    if (p > 0 && (itName.includes(needle) || needle.includes(itName))) {
                        matches.push({
                            price: p,
                            date: po.date || '',
                            customer: po.supplier || 'Fournisseur',
                            source: 'Achat (Supplier Cost)',
                            rawName: it.name || 'PO'
                        });
                    }
                });
            });
        } catch(e) {}

        return matches.sort(function(a, b) { return new Date(b.date || 0) - new Date(a.date || 0); });
    };

    var currentActiveTenderIdx = null;
    var currentAnalysisItems = [];
    var currentExtractedMetadata = {};
    var currentCopilotMessages = [];

    /**
     * Opens AI Tender Copilot modal
     */
    window.openSmartPricingForTender = function(tenderIdx, initialTab) {
        currentActiveTenderIdx = (tenderIdx !== null && tenderIdx !== undefined) ? tenderIdx : null;
        var tObj = null;
        if (currentActiveTenderIdx !== null) {
            tObj = (typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(tenderIdx) : null;
            if (!tObj && window.tenders && Array.isArray(window.tenders)) {
                tObj = window.tenders[tenderIdx];
            }
        }

        var modal = document.getElementById('smartPricingModal');
        if (!modal) {
            createSmartPricingModal();
            modal = document.getElementById('smartPricingModal');
        }

        var titleEl = document.getElementById('smartPricingTenderTitle');
        if (titleEl) {
            if (tObj) {
                titleEl.textContent = (tObj.reference ? tObj.reference + ' - ' : '') + (tObj.title || 'Tender');
            } else {
                titleEl.textContent = t('title', 'مساعد تحليل وتسعير المناقصات');
            }
        }

        // Initialize items from tender or defaults
        currentAnalysisItems = [];
        if (tObj) {
            if (tObj.title) {
                currentAnalysisItems.push({ name: tObj.title, qty: 1, category: 'Marché Principal' });
            }
            if (tObj.notes) {
                var parsed = parseItemsFromTextHeuristic(tObj.notes);
                if (parsed.length) {
                    parsed.forEach(function(pi) {
                        if (!currentAnalysisItems.some(function(ci) { return ci.name.toLowerCase() === pi.name.toLowerCase(); })) {
                            currentAnalysisItems.push(pi);
                        }
                    });
                }
            }
        }

        if (!currentAnalysisItems.length) {
            currentAnalysisItems = [
                { name: "Services de conseil et assistance technique", qty: 1, category: 'Service' },
                { name: "Fourniture matériel et déploiement", qty: 1, category: 'Matériel' }
            ];
        }

        // Reset copilot messages for this session
        currentCopilotMessages = [
            {
                role: 'assistant',
                content: (window.ZS && window.ZS.getItem('preferred-language') === 'fr')
                    ? "Bonjour ! Je suis votre copilote IA pour les marchés et appels d'offres. Je peux analyser votre cahier des charges, optimiser vos prix avec marge, et rédiger votre lettre de soumission officielle."
                    : "مرحباً بك! أنا مساعدك الذكي للمناقصات والاستشارات. يمكنني مساعدتك في تفكيك دفتر الشروط، واقتراح أفضل استراتيجية تسعير تنافسية، وصياغة خطابات التقديم والعروض الفنية والمالية فورياً."
            }
        ];

        renderSmartPricingRows();
        updateWinProbabilityMetrics();
        renderCopilotMessages();
        switchCopilotTab(initialTab || 'pricing');

        // Toggle action buttons based on active tender presence
        var btnCreate = document.getElementById('btnCreateTenderFromAudit');
        var btnUpdate = document.getElementById('btnUpdateTenderFromAudit');
        if (btnCreate) btnCreate.style.display = 'inline-flex';
        if (btnUpdate) btnUpdate.style.display = (currentActiveTenderIdx !== null) ? 'inline-flex' : 'none';

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    };

    function createSmartPricingModal() {
        var div = document.createElement('div');
        div.id = 'smartPricingModal';
        div.className = 'modal-overlay';
        div.setAttribute('aria-hidden', 'true');
        div.innerHTML = `
            <div class="modal-card" role="dialog" aria-modal="true" style="width:min(1100px, 96vw); max-height:92vh; display:flex; flex-direction:column; padding:0; overflow:hidden; border-radius:14px; box-shadow:0 20px 40px rgba(0,0,0,0.2);">
                <!-- Header -->
                <div class="modal-header" style="background: linear-gradient(135deg, #1e3a8a, #2563eb, #3b82f6); color: white; padding:16px 24px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="background:rgba(255,255,255,0.2); width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:20px;">
                            <i class="fas fa-brain"></i>
                        </div>
                        <div>
                            <h3 style="color:white; margin:0; font-size:18px; font-weight:800;">${t('title')}</h3>
                            <div style="font-size:12px; color:rgba(255,255,255,0.85); margin-top:2px;" id="smartPricingTenderTitle">-</div>
                        </div>
                    </div>
                    <button class="close-modal" onclick="closeSmartPricingModal()" style="color:white; background:rgba(255,255,255,0.2); border:none; width:34px; height:34px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Navigation Tabs -->
                <div style="background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; gap:4px; padding:8px 20px 0 20px; overflow-x:auto;">
                    <button type="button" class="copilot-tab-btn active" id="tabBtnPricing" onclick="switchCopilotTab('pricing')">
                        <i class="fas fa-calculator"></i> <span>${t('tabPricing')}</span>
                    </button>
                    <button type="button" class="copilot-tab-btn" id="tabBtnCopilot" onclick="switchCopilotTab('copilot')">
                        <i class="fas fa-comments"></i> <span>${t('tabCopilot')}</span>
                        <span class="badge" style="background:#2563eb; color:white; font-size:10px; margin-inline-start:6px;">AI</span>
                    </button>
                    <button type="button" class="copilot-tab-btn" id="tabBtnProposal" onclick="switchCopilotTab('proposal')">
                        <i class="fas fa-file-signature"></i> <span>${t('tabProposal')}</span>
                    </button>
                    <button type="button" class="copilot-tab-btn" id="tabBtnAudit" onclick="switchCopilotTab('audit')">
                        <i class="fas fa-file-contract"></i> <span>${t('tabAudit')}</span>
                    </button>
                </div>

                <!-- Modal Body -->
                <div class="modal-body" style="padding:20px; overflow-y:auto; flex:1;">
                    
                    <!-- ═══ TAB 1: PRICING & BENCHMARKS ═══ -->
                    <div id="copilotTabContentPricing">
                        <!-- Top Analytics Bar -->
                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:18px;">
                            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 16px;">
                                <div style="font-size:11px; font-weight:700; color:#1e40af; text-transform:uppercase;">${t('winScore')}</div>
                                <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px;">
                                    <div id="winProbabilityBadge" style="font-size:24px; font-weight:800; color:#2563eb;">78%</div>
                                    <div id="winProbabilityStatus" style="font-size:11px; font-weight:700; padding:4px 8px; border-radius:6px; background:#dbeafe; color:#1e40af;">تنافسي ممتاز</div>
                                </div>
                                <div class="progress-bar" style="height:6px; margin-top:8px; background:#bfdbfe; border-radius:3px;">
                                    <div id="winProbabilityProgress" style="height:100%; width:78%; background:#2563eb; border-radius:3px; transition:width 0.4s;"></div>
                                </div>
                            </div>

                            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px 16px;">
                                <div style="font-size:11px; font-weight:700; color:#166534; text-transform:uppercase;">إجمالي العرض المقترح</div>
                                <div id="smartPricingTotalVal" style="font-size:22px; font-weight:800; color:#15803d; margin-top:4px;">0.00 DZD</div>
                                <div style="font-size:11px; color:#15803d; margin-top:2px;">يشمل هامش الربح المستهدف</div>
                            </div>

                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; display:flex; flex-direction:column; justify-content:center;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <label style="font-size:12px; font-weight:700; color:#334155;"><i class="fas fa-percentage"></i> ${t('margin')}:</label>
                                    <span id="marginDisplayVal" style="font-weight:800; color:#2563eb; font-size:15px;">15%</span>
                                </div>
                                <input type="range" id="smartPricingMargin" value="15" min="2" max="45" step="1" style="width:100%; margin-top:8px; accent-color:#2563eb; cursor:pointer;" oninput="onMarginSliderChange(this.value)">
                                <div style="display:flex; justify-content:space-between; font-size:10px; color:#94a3b8; margin-top:2px;">
                                    <span>5% (أقصى تنافسية)</span>
                                    <span>20% (متوازن)</span>
                                    <span>40% (هامش عالي)</span>
                                </div>
                            </div>
                        </div>

                        <!-- Action Controls -->
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <button class="btn btn-primary btn-sm" onclick="addCustomSmartPricingItem()"><i class="fas fa-plus"></i> <span>${t('addItem')}</span></button>
                                <label class="btn btn-secondary btn-sm" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px; margin:0;">
                                    <i class="fas fa-file-upload"></i> <span>${t('upload')}</span>
                                    <input type="file" id="smartPricingDocFile" accept=".pdf,image/*,.xlsx,.xls,.txt,.docx" style="display:none;" onchange="handleSmartPricingFileUpload(this)">
                                </label>
                                <button class="btn btn-ghost btn-sm" onclick="autoSuggestAllBenchmarks()"><i class="fas fa-magic"></i> <span>تطابق تلقائي مع المبيعات</span></button>
                                <button class="btn btn-outline-primary btn-sm" onclick="printOfficialBpuDocument()"><i class="fas fa-print"></i> <span>طباعة BPU / عرض رسمي</span></button>
                            </div>
                            <button class="btn btn-success btn-sm" onclick="applySmartPricingToTender()"><i class="fas fa-check-circle"></i> <span>${t('applyAll')}</span></button>
                        </div>

                        <!-- Pricing Table -->
                        <div class="table-container" style="max-height:360px; overflow-y:auto; border:1px solid #e5e7eb; border-radius:10px;">
                            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                                <thead>
                                    <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                                        <th style="padding:10px 12px; text-align:left;">${t('detected')}</th>
                                        <th style="padding:10px 8px; text-align:center; width:65px;">${t('qty')}</th>
                                        <th style="padding:10px 12px; text-align:right;">${t('lastSale')}</th>
                                        <th style="padding:10px 12px; text-align:right;">${t('suggested')}</th>
                                        <th style="padding:10px 12px; text-align:right;">${t('subtotal')}</th>
                                        <th style="padding:10px 8px; text-align:center; width:45px;"></th>
                                    </tr>
                                </thead>
                                <tbody id="smartPricingTableBody"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- ═══ TAB 2: AI COPILOT CHAT ═══ -->
                    <div id="copilotTabContentChat" style="display:none; flex-direction:column; height:500px;">
                        <!-- Quick Prompts Chips -->
                        <div style="display:flex; gap:6px; margin-bottom:12px; overflow-x:auto; padding-bottom:4px;">
                            <button type="button" class="copilot-chip" onclick="askCopilotPredefined('letter')">📝 صياغة خطاب التقديم الرسمي</button>
                            <button type="button" class="copilot-chip" onclick="askCopilotPredefined('strategy')">🎯 استراتيجية التسعير التنافسية</button>
                            <button type="button" class="copilot-chip" onclick="askCopilotPredefined('risks')">🛡️ فحص الثغرات والشروط الجزائية</button>
                            <button type="button" class="copilot-chip" onclick="askCopilotPredefined('docs')">📑 استخراج الوثائق الإدارية المطلوبة</button>
                        </div>

                        <!-- Chat Messages Container -->
                        <div id="copilotChatMessages" style="flex:1; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:12px;"></div>

                        <!-- Chat Input Box -->
                        <div style="display:flex; gap:8px; margin-top:12px;">
                            <input type="text" id="copilotChatInput" class="form-input" style="flex:1; padding:10px 14px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:14px;" placeholder="${t('sendQuestion')}" onkeydown="if(event.key==='Enter') sendCopilotChatMessage();">
                            <button class="btn btn-primary" onclick="sendCopilotChatMessage()" id="copilotSendBtn" style="padding:0 20px;">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>

                    <!-- ═══ TAB 3: PROPOSAL DRAFTER ═══ -->
                    <div id="copilotTabContentProposal" style="display:none;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-primary btn-sm" onclick="generateOfficialDraft('submission_letter')"><i class="fas fa-file-alt"></i> <span>خطاب التقديم (Lettre de soumission)</span></button>
                                <button class="btn btn-secondary btn-sm" onclick="generateOfficialDraft('bpu')"><i class="fas fa-table"></i> <span>جدول الأسعار (BPU)</span></button>
                                <button class="btn btn-purple btn-sm" onclick="generateOfficialDraft('technical_memo')"><i class="fas fa-cogs"></i> <span>المنهجية الفنية (Mémoire)</span></button>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-ghost btn-sm" onclick="copyProposalDraft()"><i class="fas fa-copy"></i> <span>${t('copyClipboard')}</span></button>
                                <button class="btn btn-outline-primary btn-sm" onclick="printOfficialBpuDocument()"><i class="fas fa-print"></i> <span>طباعة BPU / عرض رسمي</span></button>
                                <button class="btn btn-success btn-sm" onclick="saveProposalToTenderNotes()"><i class="fas fa-save"></i> <span>حفظ في ملاحظات المناقصة</span></button>
                            </div>
                        </div>

                        <div id="proposalDraftLoader" style="display:none; text-align:center; padding:30px; background:#f8fafc; border-radius:10px;">
                            <div class="fas fa-spinner fa-spin fa-2x" style="color:#2563eb;"></div>
                            <div style="margin-top:10px; font-weight:700; color:#2563eb;">المساعد الذكي يقوم بصياغة المستند الرسمي بالمعايير القانونية...</div>
                        </div>

                        <textarea id="proposalDraftContent" style="width:100%; height:380px; padding:16px; border:1px solid #cbd5e1; border-radius:10px; font-family:monospace, 'Segoe UI', Tahoma; font-size:13px; line-height:1.6; resize:vertical; background:#ffffff; color:#1e293b;" placeholder="اضغط على أحد الأزرار بالأعلى لتوليد الخطاب أو المستند المطلوب بالذكاء الاصطناعي..."></textarea>
                    </div>

                    <!-- ═══ TAB 4: SPECIFICATION AUDIT & OCR ═══ -->
                    <div id="copilotTabContentAudit" style="display:none;">
                        <div style="background:linear-gradient(135deg, #eff6ff, #f0fdf4); border:1px solid #bfdbfe; border-radius:12px; padding:16px; margin-bottom:16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                                <div>
                                    <h4 style="margin:0 0 4px 0; color:#1e40af; font-size:15px; font-weight:800;"><i class="fas fa-robot"></i> ${t('tabAudit')}</h4>
                                    <p style="margin:0; font-size:12.5px; color:#475569;">ارفع وثيقة المناقصة أو دفتر الشروط (PDF، صورة، Excel، Word، TXT) لمسحه واستخراج كافة البيانات، الأسعار التقديرية، والوثائق الإلزامية آلياً.</p>
                                </div>
                                <div style="display:flex; gap:8px;">
                                    <label class="btn btn-primary btn-sm" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px; margin:0; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                                        <i class="fas fa-robot"></i> <span>رفع المستند والمسح الذكي (Scan IA)</span>
                                        <input type="file" id="auditDocFileInput" accept=".pdf,image/*,.xlsx,.xls,.txt,.docx" style="display:none;" onchange="handleAuditFileUpload(this)">
                                    </label>
                                </div>
                            </div>
                            <div id="auditOcrStatus" style="display:none; margin-top:10px; padding:10px 14px; border-radius:8px; font-size:12.5px; font-weight:600;"></div>
                        </div>

                        <!-- Extracted Tender Metadata Card -->
                        <div id="auditTenderMetaCard" style="display:none; background:#ffffff; border:1.5px solid #93c5fd; border-radius:12px; padding:14px 18px; margin-bottom:16px; box-shadow:0 4px 12px rgba(37,99,235,0.08);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:8px; flex-wrap:wrap; gap:8px;">
                                <span style="font-size:13px; font-weight:800; color:#1e40af;"><i class="fas fa-check-circle text-success"></i> بيانات المناقصة المكتشفة بالذكاء الاصطناعي</span>
                                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                    <button type="button" class="btn btn-success btn-sm" id="btnCreateTenderFromAudit" onclick="createTenderFromExtractedData()"><i class="fas fa-plus-circle"></i> <span>إنشاء مناقصة جديدة بهذه البيانات</span></button>
                                    <button type="button" class="btn btn-primary btn-sm" id="btnUpdateTenderFromAudit" style="display:none;" onclick="applyExtractedMetadataToActiveTender()"><i class="fas fa-save"></i> <span>تحديث المناقصة الحالية</span></button>
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; font-size:12.5px;">
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">المرجع (Référence):</span>
                                    <strong id="auditMetaRef" style="color:#1e40af; font-size:13.5px;">-</strong>
                                </div>
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">الموضوع (Titre):</span>
                                    <strong id="auditMetaTitle" style="color:#0f172a; font-size:13.5px;">-</strong>
                                </div>
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">الجهة المتعاقدة (Autorité):</span>
                                    <strong id="auditMetaAuth" style="color:#334155;">-</strong>
                                </div>
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">الأجل النهائي (Date limite):</span>
                                    <strong id="auditMetaDeadline" style="color:#dc2626;">-</strong>
                                </div>
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">القيمة التقديرية (Montant):</span>
                                    <strong id="auditMetaBudget" style="color:#059669; font-size:13.5px;">-</strong>
                                </div>
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">مدة الإنجاز (Délai):</span>
                                    <strong id="auditMetaPeriod" style="color:#475569;">-</strong>
                                </div>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                            <div>
                                <label style="display:block; font-size:13px; font-weight:700; margin-bottom:6px;">نص دفتر الشروط أو الوثيقة المستخرجة:</label>
                                <textarea id="auditDocTextInput" style="width:100%; height:230px; padding:12px; border:1px solid #cbd5e1; border-radius:8px; font-size:12.5px; font-family:monospace; resize:vertical;" placeholder="الصق نص دفتر الشروط هنا أو ارفع الملف بالأعلى لتحليله مباشرة..."></textarea>
                                <div style="display:flex; gap:8px; margin-top:8px;">
                                    <button class="btn btn-primary btn-sm" onclick="runComprehensiveAudit()"><i class="fas fa-magic"></i> <span>بدء الفحص والتحليل الذكي (Scan IA)</span></button>
                                </div>
                            </div>

                            <div>
                                <label style="display:block; font-size:13px; font-weight:700; margin-bottom:6px;">الوثائق والشروط المطلوبة المكتشفة:</label>
                                <div id="auditChecklistOutput" style="height:230px; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; font-size:12.5px;">
                                    <div style="color:#94a3b8; text-align:center; padding:40px 10px;">
                                        <i class="fas fa-tasks fa-2x" style="margin-bottom:8px;"></i>
                                        <div>لم يتم الفحص بعد. ارفع المستند واضغط "بدء الفحص والتحليل الذكي".</div>
                                    </div>
                                </div>
                                <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
                                    <button class="btn btn-success btn-sm" onclick="applyExtractedChecklistToTender()"><i class="fas fa-check-double"></i> <span>تطبيق قائمة الوثائق في جاهزية الملف (Checklist)</span></button>
                                    <button class="btn btn-purple btn-sm" onclick="switchCopilotTab('pricing')"><i class="fas fa-calculator"></i> <span>التسعير الذكي للبنود</span></button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        `;

        // Inject Styles
        var style = document.createElement('style');
        style.textContent = `
            .copilot-tab-btn {
                background: none;
                border: none;
                border-bottom: 3px solid transparent;
                padding: 10px 16px;
                font-size: 13px;
                font-weight: 600;
                color: #64748b;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                transition: all 0.2s;
            }
            .copilot-tab-btn:hover { color: #1e40af; background: rgba(37,99,235,0.05); }
            .copilot-tab-btn.active {
                color: #2563eb;
                border-bottom-color: #2563eb;
                background: white;
                border-top-left-radius: 8px;
                border-top-right-radius: 8px;
            }
            .copilot-chip {
                background: #f1f5f9;
                border: 1px solid #cbd5e1;
                border-radius: 20px;
                padding: 6px 14px;
                font-size: 12px;
                font-weight: 600;
                color: #334155;
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.2s;
            }
            .copilot-chip:hover {
                background: #e2e8f0;
                border-color: #2563eb;
                color: #2563eb;
            }
            .chat-msg-row {
                display: flex;
                gap: 10px;
                max-width: 88%;
            }
            .chat-msg-row.user {
                align-self: flex-end;
                flex-direction: row-reverse;
            }
            .chat-msg-bubble {
                padding: 10px 14px;
                border-radius: 12px;
                font-size: 13.5px;
                line-height: 1.55;
                word-break: break-word;
            }
            .chat-msg-row.user .chat-msg-bubble {
                background: #2563eb;
                color: white;
                border-bottom-right-radius: 2px;
            }
            .chat-msg-row.assistant .chat-msg-bubble {
                background: white;
                color: #1e293b;
                border: 1px solid #e2e8f0;
                border-bottom-left-radius: 2px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(div);
    }

    window.switchCopilotTab = function(tabName) {
        var tabs = ['pricing', 'copilot', 'proposal', 'audit'];
        tabs.forEach(function(t) {
            var btn = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
            var content = document.getElementById('copilotTabContent' + (t === 'copilot' ? 'Chat' : (t.charAt(0).toUpperCase() + t.slice(1))));
            if (btn) btn.classList.toggle('active', t === tabName);
            if (content) {
                content.style.display = (t === tabName) ? (t === 'copilot' ? 'flex' : 'block') : 'none';
            }
        });
    };

    window.onMarginSliderChange = function(val) {
        var num = parseFloat(val) || 15;
        var display = document.getElementById('marginDisplayVal');
        if (display) display.textContent = num + '%';
        renderSmartPricingRows();
        updateWinProbabilityMetrics();
    };

    function updateWinProbabilityMetrics() {
        var margin = parseFloat(document.getElementById('smartPricingMargin')?.value) || 15;
        var hasBench = currentAnalysisItems.some(function(it) {
            return (window.getMarketPriceBenchmarks(it.name) || []).length > 0;
        });

        // Heuristic competitiveness index
        var score = 85;
        if (margin <= 10) score = 92;
        else if (margin <= 18) score = 82;
        else if (margin <= 28) score = 65;
        else score = 45;

        if (!hasBench) score -= 8;
        score = Math.min(99, Math.max(15, score));

        var badge = document.getElementById('winProbabilityBadge');
        var prog = document.getElementById('winProbabilityProgress');
        var status = document.getElementById('winProbabilityStatus');

        if (badge) badge.textContent = score + '%';
        if (prog) {
            prog.style.width = score + '%';
            prog.style.background = score >= 75 ? '#16a34a' : (score >= 55 ? '#2563eb' : '#d97706');
        }
        if (status) {
            if (score >= 75) {
                status.textContent = 'تنافسي ممتاز (فرصة فوز عالية)';
                status.style.background = '#dcfce7';
                status.style.color = '#15803d';
            } else if (score >= 55) {
                status.textContent = 'متوازن ومقبول تجارياً';
                status.style.background = '#dbeafe';
                status.style.color = '#1e40af';
            } else {
                status.textContent = 'هامش مرتفع (قد يقلل فرص الترسية)';
                status.style.background = '#fef3c7';
                status.style.color = '#b45309';
            }
        }
    }

    function renderSmartPricingRows() {
        var tbody = document.getElementById('smartPricingTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        var margin = (parseFloat(document.getElementById('smartPricingMargin')?.value) || 15) / 100;
        var grandTotal = 0;

        currentAnalysisItems.forEach(function(item, idx) {
            var benchmarks = window.getMarketPriceBenchmarks(item.name);
            var lastPrice = benchmarks.length > 0 ? benchmarks[0].price : 0;
            var suggestedPrice = item.customPrice != null ? item.customPrice : (lastPrice > 0 ? (lastPrice * (1 + margin)) : 10000);
            var qty = Number(item.qty || 1);
            var lineTotal = suggestedPrice * qty;
            grandTotal += lineTotal;

            var tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:8px 12px;">
                    <input type="text" class="form-input" value="${escapeHtml(item.name)}" style="padding:6px 8px; font-size:13px; width:100%; border:1px solid #cbd5e1; border-radius:6px;" onchange="updateItemName(${idx}, this.value)">
                    ${benchmarks.length > 0 ? `<div style="font-size:11px; color:#64748b; margin-top:2px;"><i class="fas fa-history"></i> مرجع: ${benchmarks[0].customer} (${benchmarks[0].date || 'سابق'} - ${benchmarks[0].source})</div>` : '<div style="font-size:11px; color:#94a3b8; margin-top:2px;"><i class="fas fa-info-circle"></i> تسعير تقديري</div>'}
                </td>
                <td style="padding:8px 8px; text-align:center;">
                    <input type="number" min="1" class="form-input" value="${qty}" style="width:55px; padding:6px; font-size:13px; text-align:center; border:1px solid #cbd5e1; border-radius:6px;" onchange="updateItemQty(${idx}, this.value)">
                </td>
                <td style="padding:8px 12px; text-align:right; color:#64748b; font-weight:600;">
                    ${lastPrice > 0 ? lastPrice.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) : '<span class="text-muted">—</span>'}
                </td>
                <td style="padding:8px 12px; text-align:right;">
                    <input type="number" step="0.01" class="form-input" value="${suggestedPrice.toFixed(2)}" style="width:115px; padding:6px 8px; font-size:13px; font-weight:700; color:#1e40af; text-align:right; border:1px solid #93c5fd; border-radius:6px;" onchange="updateItemPrice(${idx}, this.value)">
                </td>
                <td style="padding:8px 12px; text-align:right; font-weight:700; color:#0f766e;">
                    ${lineTotal.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2})}
                </td>
                <td style="padding:8px 8px; text-align:center;">
                    <button class="btn btn-danger btn-sm" onclick="removeSmartPricingItem(${idx})" style="padding:4px 8px; border-radius:6px;" title="حذف"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        var totalEl = document.getElementById('smartPricingTotalVal');
        if (totalEl) {
            totalEl.textContent = grandTotal.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' DZD';
        }
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    window.updateItemName = function(idx, val) {
        if (currentAnalysisItems[idx]) {
            currentAnalysisItems[idx].name = val;
            currentAnalysisItems[idx].customPrice = null;
            renderSmartPricingRows();
            updateWinProbabilityMetrics();
        }
    };

    window.updateItemQty = function(idx, val) {
        if (currentAnalysisItems[idx]) {
            currentAnalysisItems[idx].qty = Math.max(1, parseInt(val, 10) || 1);
            renderSmartPricingRows();
        }
    };

    window.updateItemPrice = function(idx, val) {
        if (currentAnalysisItems[idx]) {
            currentAnalysisItems[idx].customPrice = Math.max(0, parseFloat(val) || 0);
            renderSmartPricingRows();
        }
    };

    window.removeSmartPricingItem = function(idx) {
        if (currentAnalysisItems[idx]) {
            currentAnalysisItems.splice(idx, 1);
            renderSmartPricingRows();
            updateWinProbabilityMetrics();
        }
    };

    window.addCustomSmartPricingItem = function() {
        currentAnalysisItems.push({ name: "بند جديد / خدمة متخصصة", qty: 1, customPrice: 15000 });
        renderSmartPricingRows();
        updateWinProbabilityMetrics();
    };

    window.autoSuggestAllBenchmarks = function() {
        var margin = (parseFloat(document.getElementById('smartPricingMargin')?.value) || 15) / 100;
        currentAnalysisItems.forEach(function(item) {
            var b = window.getMarketPriceBenchmarks(item.name);
            if (b.length > 0) {
                item.customPrice = b[0].price * (1 + margin);
            }
        });
        renderSmartPricingRows();
        updateWinProbabilityMetrics();
        if (window.showToast) window.showToast('تمت مطابقة الأسعار مع السجلات السابقة بنجاح', 'success');
    };

    // ── COPILOT CHAT LOGIC ──
    function renderCopilotMessages() {
        var container = document.getElementById('copilotChatMessages');
        if (!container) return;
        container.innerHTML = '';

        currentCopilotMessages.forEach(function(msg, i) {
            var row = document.createElement('div');
            row.className = 'chat-msg-row ' + msg.role;
            row.innerHTML = `
                <div style="width:28px; height:28px; border-radius:50%; background:${msg.role==='user'?'#2563eb':'#e2e8f0'}; display:flex; align-items:center; justify-content:center; color:${msg.role==='user'?'white':'#1e40af'}; font-size:12px; flex-shrink:0;">
                    <i class="fas ${msg.role==='user'?'fa-user':'fa-robot'}"></i>
                </div>
                <div class="chat-msg-bubble">
                    <div style="white-space:pre-wrap;">${escapeHtml(msg.content)}</div>
                    ${msg.role==='assistant' && i > 0 ? `
                        <div style="margin-top:8px; padding-top:6px; border-top:1px dashed #e2e8f0; display:flex; gap:8px;">
                            <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px; font-size:11px;" onclick="copyCopilotMsg(${i})"><i class="fas fa-copy"></i> نسخ</button>
                            <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px; font-size:11px;" onclick="appendCopilotMsgToNotes(${i})"><i class="fas fa-plus"></i> إضافة لملاحظات المناقصة</button>
                        </div>
                    ` : ''}
                </div>
            `;
            container.appendChild(row);
        });

        container.scrollTop = container.scrollHeight;
    }

    window.copyCopilotMsg = function(idx) {
        if (currentCopilotMessages[idx]) {
            navigator.clipboard.writeText(currentCopilotMessages[idx].content);
            if (window.showToast) window.showToast('تم النسخ إلى الحافظة', 'success');
        }
    };

    window.appendCopilotMsgToNotes = function(idx) {
        if (currentCopilotMessages[idx] && currentActiveTenderIdx !== null) {
            var t = (typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
            if (t) {
                t.notes = (t.notes ? t.notes + '\n\n' : '') + '[AI Tender Copilot Note]:\n' + currentCopilotMessages[idx].content;
                if (window.saveData) window.saveData();
                if (window.showToast) window.showToast('تمت إضافة النص إلى ملاحظات المناقصة', 'success');
            }
        }
    };

    window.askCopilotPredefined = function(type) {
        var input = document.getElementById('copilotChatInput');
        var promptText = '';
        var tObj = (currentActiveTenderIdx !== null && typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
        var tenderInfo = tObj ? `(المناقصة: ${tObj.reference || ''} - ${tObj.title || ''})` : '';

        switch(type) {
            case 'letter':
                promptText = `قم بصياغة خطاب تقديم عرض رسمي (Lettre de soumission) احترافي لهذه المناقصة ${tenderInfo} مع التعهد بكامل الشروط ومدة الإنجاز.`;
                break;
            case 'strategy':
                promptText = `ما هي أفضل استراتيجية تسعير تنافسية للفوز بهذه المناقصة ${tenderInfo} مع الحفاظ على هامش ربح ممتاز وبأقل قدر من المخاطر؟`;
                break;
            case 'risks':
                promptText = `حلل أهم الثغرات والشروط الجزائية ومخاطر التأخير المحتملة في هذه المناقصة ${tenderInfo}، وكيفية التحوط منها قانونياً.`;
                break;
            case 'docs':
                promptText = `استخرج ولخص قائمة الوثائق الإدارية والجبائية والتقنية الإلزامية لتأهيل ملف هذه المناقصة ${tenderInfo} وفق القانون الجزائري للصفقات العمومية.`;
                break;
        }

        if (input) {
            input.value = promptText;
            sendCopilotChatMessage();
        }
    };

    window.sendCopilotChatMessage = async function() {
        var input = document.getElementById('copilotChatInput');
        var btn = document.getElementById('copilotSendBtn');
        if (!input) return;
        var text = input.value.trim();
        if (!text) return;

        input.value = '';
        currentCopilotMessages.push({ role: 'user', content: text });
        renderCopilotMessages();

        // Context regarding current tender
        var tObj = (currentActiveTenderIdx !== null && typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
        var itemsSummary = currentAnalysisItems.map(function(i){ return `- ${i.qty}x ${i.name} (Catégorie: ${i.category||'Général'})`; }).join('\n');
        var systemContext = `أنت المساعد الذكي المتخصص في الصفقات والمناقصات لبرنامج Zeralda ERP.
بيانات المناقصة الحالية:
العنوان: ${tObj ? (tObj.title || 'N/A') : 'عام'}
المرجع: ${tObj ? (tObj.reference || 'N/A') : 'N/A'}
المشتري / الجهة: ${tObj ? (tObj.authority || 'N/A') : 'N/A'}
الأجل: ${tObj ? (tObj.deadline || 'N/A') : 'N/A'}
المبلغ المقترح: ${tObj ? (tObj.amount || 0) : 0} DZD
البنود المسجلة:
${itemsSummary}
أجب باحترافية عالية باللغة العربية مع المصطلحات الرسمية المعمول بها في الصفقات العمومية.`;

        if (btn) btn.disabled = true;
        try {
            var res = await callAIChat(currentCopilotMessages, systemContext);
            if (res.ok && res.text) {
                currentCopilotMessages.push({ role: 'assistant', content: res.text });
            } else {
                currentCopilotMessages.push({ role: 'assistant', content: 'عذراً، حدث خطأ أثناء الاتصال بالذكاء الاصطناعي: ' + (res.error || 'يرجى المحاولة ثانية') });
            }
        } catch(e) {
            currentCopilotMessages.push({ role: 'assistant', content: 'حدث خطأ في الشبكة.' });
        } finally {
            if (btn) btn.disabled = false;
            renderCopilotMessages();
        }
    };

    // ── PROPOSAL DRAFTER LOGIC ──
    window.generateOfficialDraft = async function(docType) {
        var textarea = document.getElementById('proposalDraftContent');
        var loader = document.getElementById('proposalDraftLoader');
        if (!textarea) return;

        var tObj = (currentActiveTenderIdx !== null && typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
        var totalAmount = (parseFloat(document.getElementById('smartPricingTotalVal')?.textContent) || 0);

        var prompt = '';
        if (docType === 'submission_letter') {
            prompt = `قم بصياغة خطاب تقديم رسمي (Lettre de Soumission) كامل وجاهز للطباعة والتوقيع لمناقصة:
العنوان: ${tObj ? tObj.title : 'صفقة خدمات وتجهيزات'}
المرجع: ${tObj ? tObj.reference : 'AO-2026/01'}
الجهة المتعاقدة: ${tObj ? tObj.authority : 'المؤسسة الوطنية / الإدارة'}
المبلغ الإجمالي للعرض: ${totalAmount} دج
الصيغة تكون رسمية وقانونية وفق النموذج الجزائري للصفقات العمومية باللغة الفرنسية مع الترجمة العربية الموازية.`;
        } else if (docType === 'bpu') {
            var itemsList = currentAnalysisItems.map(function(it, i){
                return `بند ${i+1}: ${it.name} | الكمية: ${it.qty} | سعر الوحدة التقديري: ${it.customPrice || 10000} DZD`;
            }).join('\n');
            prompt = `قم بتوليد جدول الأسعار الأحادية والتفصيلية (Bordereau des Prix Unitaires & Devis Quantitatif Estimatif) بنسق جدولي منظم:
${itemsList}
المجموع العام: ${totalAmount} DZD.`;
        } else {
            prompt = `قم بصياغة مذكرة تقنية ومنهجية تنفيذ (Mémoire Technique) لمناقصة:
${tObj ? tObj.title : 'المشروع'}
تشمل: منهجية العمل، الخطة الزمنية المقترحة، فريق العمل، وإجراءات ضمان الجودة والسلامة.`;
        }

        if (loader) loader.style.display = 'block';
        textarea.value = 'جاري التوليد بالذكاء الاصطناعي...';

        var aiRes = await callAIChat(prompt, "You are an executive procurement documentation officer. Provide clean, production-ready legal and technical tender documentation.");
        if (loader) loader.style.display = 'none';

        if (aiRes.ok && aiRes.text) {
            textarea.value = aiRes.text;
        } else {
            textarea.value = 'فشل في توليد المستند: ' + (aiRes.error || 'حاول مجدداً.');
        }
    };

    window.copyProposalDraft = function() {
        var textarea = document.getElementById('proposalDraftContent');
        if (textarea && textarea.value) {
            navigator.clipboard.writeText(textarea.value);
            if (window.showToast) window.showToast('تم نسخ مسودة العرض بالكامل للحافظة', 'success');
        }
    };

    window.saveProposalToTenderNotes = function() {
        var textarea = document.getElementById('proposalDraftContent');
        if (textarea && textarea.value && currentActiveTenderIdx !== null) {
            var t = (typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
            if (t) {
                t.notes = (t.notes ? t.notes + '\n\n' : '') + '[AI Tender Proposal Draft]:\n' + textarea.value;
                if (window.saveData) window.saveData();
                if (window.showToast) window.showToast('تم حفظ المستند في ملاحظات المناقصة', 'success');
            }
        }
    };

    window.printOfficialBpuDocument = function() {
        var tObj = (currentActiveTenderIdx !== null && typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
        var margin = (parseFloat(document.getElementById('smartPricingMargin')?.value) || 15) / 100;

        var items = currentAnalysisItems.map(function(item, idx) {
            var benchmarks = (typeof window.getMarketPriceBenchmarks === 'function') ? window.getMarketPriceBenchmarks(item.name) : [];
            var lastPrice = benchmarks.length > 0 ? benchmarks[0].price : 0;
            var suggestedPrice = item.customPrice != null ? item.customPrice : (lastPrice > 0 ? (lastPrice * (1 + margin)) : 10000);
            var qty = Number(item.qty || 1);
            return {
                name: item.name || ('Désignation #' + (idx + 1)),
                unit: item.unit || 'U',
                quantity: qty,
                price: suggestedPrice,
                total: suggestedPrice * qty
            };
        });

        if (items.length === 0) {
            if (window.showToast) window.showToast('لا توجد بنود لطباعة جدول الأسعار BPU', 'warning');
            return;
        }

        var totalHT = items.reduce(function(acc, it){ return acc + it.total; }, 0);
        var docData = {
            type: 'BPU',
            code: (tObj && tObj.reference ? tObj.reference : 'AO-2026') + '-BPU',
            reference: tObj ? tObj.reference : '',
            subject: tObj ? (tObj.title || 'Bordereau des Prix Unitaires & Devis Quantitatif Estimatif') : 'Offre Financière et Bordereau des Prix Unitaires',
            tenderTitle: tObj ? tObj.title : '',
            client: {
                name: tObj ? (tObj.authority || tObj.client || 'Maître de l\'Ouvrage') : 'Maître de l\'Ouvrage / الإدارة المتعاقدة',
                address: tObj ? (tObj.location || 'Algérie') : 'Algérie'
            },
            items: items,
            totalHT: totalHT,
            tvaRate: 19
        };

        if (window.UnifiedDocumentPrinter && typeof window.UnifiedDocumentPrinter.printDocument === 'function') {
            window.UnifiedDocumentPrinter.printDocument(docData, { lang: 'fr' });
        } else if (window.ZeraldaPrintEngine && typeof window.ZeraldaPrintEngine.printHtml === 'function') {
            window.print();
        } else {
            window.print();
        }
    };


    // ── AUDIT & OCR SPECIFICATION LOGIC ──
    window.handleAuditFileUpload = async function(input) {
        if (!input.files || !input.files.length) return;
        var file = input.files[0];
        var textarea = document.getElementById('auditDocTextInput');
        var statusEl = document.getElementById('auditOcrStatus');

        function setStatus(msg, color, bg) {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.textContent = msg;
                statusEl.style.color = color || '#1e40af';
                statusEl.style.background = bg || '#eff6ff';
            }
        }

        setStatus('جاري استخراج وقراءة نص المستند عبر المساعد الذكي (Copilote IA)...', '#2563eb', '#eff6ff');
        if (textarea) textarea.value = 'جاري قراءة واستخراج نص المستند عبر المساعد الذكي (Copilote IA)...';

        if (window.UnifiedOCR && typeof window.UnifiedOCR.extract === 'function') {
            try {
                var ocr = await window.UnifiedOCR.extract(file, {
                    endpoint: '/api/ocr/extract',
                    allowImage: true, allowPdf: true, allowExcel: true, allowWordTxt: true,
                    extraBody: { lang: 'ara+fra+eng' }
                });
                if (ocr && ocr.text) {
                    if (textarea) textarea.value = ocr.text;
                    setStatus('تم استخراج النص بنجاح! جاري تحليله واستخراج الحقول بالذكاء الاصطناعي...', '#15803d', '#f0fdf4');
                    await runComprehensiveAudit();
                    return;
                }
            } catch(e) {
                console.warn('[Audit] UnifiedOCR error:', e);
                setStatus('تنبيه: تعذر إكمال القراءة الذكية، جاري محاولة القراءة المباشرة...', '#b45309', '#fffbeb');
            }
        }

        // Fallback text reader
        var reader = new FileReader();
        reader.onload = async function(evt) {
            try {
                var decoder = new TextDecoder('utf-8');
                var text = decoder.decode(evt.target.result);
                if (textarea) textarea.value = text;
                setStatus('تم تحميل النص. جاري التحليل الذكي...', '#15803d', '#f0fdf4');
                await runComprehensiveAudit();
            } catch(e) {
                setStatus('تعذر قراءة الملف. يرجى تجربة مستند نصي أو صورة واضحة.', '#b91c1c', '#fef2f2');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    window.runComprehensiveAudit = async function() {
        var text = (document.getElementById('auditDocTextInput')?.value || '').trim();
        var out = document.getElementById('auditChecklistOutput');
        var statusEl = document.getElementById('auditOcrStatus');
        if (!text) {
            if (window.showToast) window.showToast('يرجى كتابة أو رفع نص دفتر الشروط أولاً', 'warning');
            return;
        }

        if (out) out.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#2563eb;"></i><div style="margin-top:8px; font-weight:700; color:#2563eb;">جاري استخراج البنود والوثائق المطلوبة بالذكاء الاصطناعي...</div></div>';

        var extracted = await extractSpecificationsWithAI(text);
        currentExtractedMetadata = extracted;

        if (extracted.items && extracted.items.length) {
            currentAnalysisItems = extracted.items;
            renderSmartPricingRows();
            updateWinProbabilityMetrics();
        }

        // Update Extracted Metadata display card
        var metaCard = document.getElementById('auditTenderMetaCard');
        var metaRef = document.getElementById('auditMetaRef');
        var metaTitle = document.getElementById('auditMetaTitle');
        var metaAuth = document.getElementById('auditMetaAuth');
        var metaDeadline = document.getElementById('auditMetaDeadline');
        var metaBudget = document.getElementById('auditMetaBudget');
        var metaPeriod = document.getElementById('auditMetaPeriod');

        if (metaCard) metaCard.style.display = 'block';
        if (metaRef) metaRef.textContent = extracted.reference || '-';
        if (metaTitle) metaTitle.textContent = extracted.title || '-';
        if (metaAuth) metaAuth.textContent = extracted.authority || '-';
        if (metaDeadline) metaDeadline.textContent = extracted.deadline || '-';
        if (metaBudget) metaBudget.textContent = (extracted.estimatedBudget > 0) ? (extracted.estimatedBudget.toLocaleString('fr-FR') + ' DZD') : '-';
        if (metaPeriod) metaPeriod.textContent = extracted.executionPeriod || '-';

        // Update button visibility
        var btnCreate = document.getElementById('btnCreateTenderFromAudit');
        var btnUpdate = document.getElementById('btnUpdateTenderFromAudit');
        if (btnCreate) btnCreate.style.display = 'inline-flex';
        if (btnUpdate) btnUpdate.style.display = (currentActiveTenderIdx !== null) ? 'inline-flex' : 'none';

        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.textContent = '✅ تم اكتمال المسح واستخراج بيانات المناقصة وبنود التسعير بنجاح!';
            statusEl.style.color = '#15803d';
            statusEl.style.background = '#f0fdf4';
        }

        if (out) {
            var html = '';
            var docs = extracted.requiredDocuments || [];
            if (docs.length) {
                html += '<div style="font-weight:700; color:#1e40af; margin-bottom:8px;"><i class="fas fa-clipboard-check"></i> الوثائق الإلزامية المستخرجة (' + docs.length + '):</div>';
                docs.forEach(function(d) {
                    html += '<div style="padding:6px 10px; background:white; border:1px solid #cbd5e1; border-radius:6px; margin-bottom:6px; display:flex; align-items:center; gap:8px;">';
                    html += '<i class="fas fa-check-circle" style="color:#16a34a;"></i> <span>' + escapeHtml(d) + '</span>';
                    html += '</div>';
                });
            } else {
                html = '<div style="color:#64748b;">لم يتم العثور على وثائق إضافية.</div>';
            }
            out.innerHTML = html;
        }

        if (window.showToast) window.showToast('تم استخراج بنود المناقصة والوثائق بنجاح!', 'success');
    };

    window.createTenderFromExtractedData = function() {
        if (!currentExtractedMetadata) {
            if (window.showToast) window.showToast('لا توجد بيانات مستخرجة لإنشاء مناقصة', 'warning');
            return;
        }
        closeSmartPricingModal();
        if (typeof window.openTenderModal === 'function') {
            window.openTenderModal();
            if (currentExtractedMetadata.reference) {
                var el = document.getElementById('tenderRef');
                if (el) el.value = currentExtractedMetadata.reference;
            }
            if (currentExtractedMetadata.title) {
                var el = document.getElementById('tenderTitle');
                if (el) el.value = currentExtractedMetadata.title;
            }
            if (currentExtractedMetadata.authority) {
                var el = document.getElementById('tenderAuthority');
                if (el) el.value = currentExtractedMetadata.authority;
            }
            if (currentExtractedMetadata.deadline) {
                var el = document.getElementById('tenderDeadline');
                if (el) el.value = currentExtractedMetadata.deadline;
            }
            var amt = currentExtractedMetadata.estimatedBudget || 0;
            if (!amt && currentAnalysisItems && currentAnalysisItems.length) {
                amt = currentAnalysisItems.reduce(function(acc, it){
                    return acc + ((it.customPrice || 10000) * (it.qty || 1));
                }, 0);
            }
            if (amt > 0) {
                var el = document.getElementById('tenderAmount');
                if (el) el.value = amt.toFixed(2);
            }
            var notesParts = [];
            if (currentExtractedMetadata.executionPeriod) {
                notesParts.push('Délai d\'exécution: ' + currentExtractedMetadata.executionPeriod);
            }
            if (currentExtractedMetadata.keyClauses && currentExtractedMetadata.keyClauses.length) {
                notesParts.push('[Clauses clés]:\n' + currentExtractedMetadata.keyClauses.join('\n'));
            }
            if (currentAnalysisItems && currentAnalysisItems.length) {
                notesParts.push('[Postes détectés]:\n' + currentAnalysisItems.map(function(it){
                    return '- ' + (it.qty || 1) + 'x ' + it.name + (it.unit ? ' (' + it.unit + ')' : '');
                }).join('\n'));
            }
            if (notesParts.length) {
                var el = document.getElementById('tenderNotes');
                if (el) el.value = notesParts.join('\n\n');
            }
            if (currentExtractedMetadata.requiredDocuments && currentExtractedMetadata.requiredDocuments.length) {
                window._pendingOcrChecklist = currentExtractedMetadata.requiredDocuments.map(function(d){
                    return { text: d, done: false };
                });
            }
            if (window.showToast) {
                window.showToast('تم استيراد كافة بيانات المناقصة من المسح الذكي. راجع الحقول واضغط حفظ.', 'success');
            }
        } else if (typeof window.openModal === 'function' && document.getElementById('createProformaModal')) {
            window.openModal('createProformaModal');
            var title = (currentExtractedMetadata.title || 'Tender Quote');
            if (currentExtractedMetadata.reference) title = '[' + currentExtractedMetadata.reference + '] ' + title;

            var titleEl = document.getElementById('proformaTitle') || document.getElementById('quotationTitle');
            if (titleEl) titleEl.value = title.slice(0, 100);

            var notesEl = document.getElementById('proformaNotes');
            var notesParts = [];
            if (currentExtractedMetadata.reference) notesParts.push('Référence AO: ' + currentExtractedMetadata.reference);
            if (currentExtractedMetadata.authority) notesParts.push('Maître d\'ouvrage / Client: ' + currentExtractedMetadata.authority);
            if (currentExtractedMetadata.deadline) notesParts.push('Date limite: ' + currentExtractedMetadata.deadline);
            if (currentExtractedMetadata.executionPeriod) notesParts.push('Délai d\'exécution: ' + currentExtractedMetadata.executionPeriod);
            if (currentExtractedMetadata.keyClauses && currentExtractedMetadata.keyClauses.length) {
                notesParts.push('[Clauses clés]:\n' + currentExtractedMetadata.keyClauses.join('\n'));
            }
            if (notesEl && notesParts.length) notesEl.value = notesParts.join('\n\n');

            // Populate proforma items if addProformaItem is available
            if (typeof window.addProformaItem === 'function' && currentAnalysisItems && currentAnalysisItems.length) {
                var itemsContainer = document.getElementById('proformaItems');
                if (itemsContainer) itemsContainer.innerHTML = '';
                var margin = (parseFloat(document.getElementById('smartPricingMargin')?.value) || 15) / 100;
                currentAnalysisItems.forEach(function(item) {
                    window.addProformaItem();
                    var rows = itemsContainer ? itemsContainer.querySelectorAll('.invoice-item-row') : [];
                    var lastRow = rows[rows.length - 1];
                    if (lastRow) {
                        var descInp = lastRow.querySelector('.item-description') || lastRow.querySelector('input[type="text"]');
                        var qtyInp = lastRow.querySelector('.item-quantity') || lastRow.querySelector('input[type="number"]:not(.item-price)');
                        var priceInp = lastRow.querySelector('.item-price');
                        var benchmarks = (typeof window.getMarketPriceBenchmarks === 'function') ? window.getMarketPriceBenchmarks(item.name) : [];
                        var lastPrice = benchmarks.length > 0 ? benchmarks[0].price : 0;
                        var unitP = item.customPrice != null ? item.customPrice : (lastPrice > 0 ? (lastPrice * (1 + margin)) : 10000);
                        if (descInp) descInp.value = item.name + (item.unit ? ' (' + item.unit + ')' : '');
                        if (qtyInp) qtyInp.value = item.qty || 1;
                        if (priceInp) priceInp.value = unitP.toFixed(2);
                    }
                });
                if (typeof window.calculateProformaTotal === 'function') {
                    window.calculateProformaTotal();
                }
            }
            if (window.showToast) {
                window.showToast('تم استيراد بنود وبيانات المناقصة إلى الفاتورة الشكلية / عرض الأسعار بنجاح!', 'success');
            }
        } else {
            if (window.showToast) {
                window.showToast('تم استخراج البيانات بنجاح: ' + (currentExtractedMetadata.title || ''), 'info');
            }
        }
    };

    window.applyExtractedMetadataToActiveTender = function() {
        if (!currentExtractedMetadata || currentActiveTenderIdx === null) {
            if (window.showToast) window.showToast('يرجى تحديد مناقصة لتحديثها أو الضغط على إنشاء مناقصة جديدة', 'warning');
            return;
        }
        var t = (typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
        if (!t) return;
        if (currentExtractedMetadata.reference) t.reference = currentExtractedMetadata.reference;
        if (currentExtractedMetadata.title) t.title = currentExtractedMetadata.title;
        if (currentExtractedMetadata.authority) t.authority = currentExtractedMetadata.authority;
        if (currentExtractedMetadata.deadline) t.deadline = currentExtractedMetadata.deadline;
        if (currentExtractedMetadata.estimatedBudget > 0) t.amount = currentExtractedMetadata.estimatedBudget;
        if (currentExtractedMetadata.requiredDocuments && currentExtractedMetadata.requiredDocuments.length) {
            if (!Array.isArray(t.checklist)) t.checklist = [];
            currentExtractedMetadata.requiredDocuments.forEach(function(d) {
                if (!t.checklist.some(function(c) { return c.text === d; })) {
                    t.checklist.push({ text: d, done: false });
                }
            });
        }
        if (typeof window.saveData === 'function') window.saveData();
        if (typeof window.renderAll === 'function') window.renderAll();
        if (window.showToast) window.showToast('تم تحديث بيانات المناقصة الحالية بالبيانات المستخرجة بنجاح!', 'success');
        closeSmartPricingModal();
    };

    window.applyExtractedChecklistToTender = function() {
        if (!currentExtractedMetadata.requiredDocuments || !currentExtractedMetadata.requiredDocuments.length) {
            if (window.showToast) window.showToast('لا توجد وثائق مستخرجة لتطبيقها', 'warning');
            return;
        }

        if (currentActiveTenderIdx !== null) {
            var t = (typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
            if (t) {
                if (!Array.isArray(t.checklist)) t.checklist = [];
                currentExtractedMetadata.requiredDocuments.forEach(function(docName) {
                    if (!t.checklist.some(function(c) { return c.text === docName; })) {
                        t.checklist.push({ text: docName, done: false });
                    }
                });
                if (window.saveData) window.saveData();
                if (window.renderAll) window.renderAll();
                if (window.showToast) window.showToast('تمت إضافة ' + currentExtractedMetadata.requiredDocuments.length + ' وثائق إلى قائمة جاهزية المناقصة!', 'success');
            }
        } else {
            // Save to pending checklist for new tender
            window._pendingOcrChecklist = currentExtractedMetadata.requiredDocuments.map(function(d){
                return { text: d, done: false };
            });
            if (window.showToast) window.showToast('تم حفظ ' + currentExtractedMetadata.requiredDocuments.length + ' وثائق لاعتمادها في المناقصة الجديدة!', 'info');
        }
    };

    window.handleSmartPricingFileUpload = async function(input) {
        if (!input.files || !input.files.length) return;
        var file = input.files[0];
        if (window.showToast) window.showToast('جاري استخراج بنود المناقصة بالذكاء الاصطناعي...', 'info');

        var text = '';
        if (window.UnifiedOCR && typeof window.UnifiedOCR.extract === 'function') {
            try {
                var ocr = await window.UnifiedOCR.extract(file, { endpoint: '/api/ocr/extract', allowImage: true, allowPdf: true, allowExcel: true, allowWordTxt: true });
                text = ocr.text || '';
            } catch(e) {}
        }

        if (text) {
            var res = await extractSpecificationsWithAI(text);
            if (res.items && res.items.length) {
                res.items.forEach(function(it) {
                    if (!currentAnalysisItems.some(function(c) { return c.name.toLowerCase() === it.name.toLowerCase(); })) {
                        currentAnalysisItems.push(it);
                    }
                });
                renderSmartPricingRows();
                updateWinProbabilityMetrics();
                if (window.showToast) window.showToast('تم استخراج البنود بنجاح!', 'success');
            }
        }
    };

    window.closeSmartPricingModal = function() {
        var modal = document.getElementById('smartPricingModal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
    };

    window.applySmartPricingToTender = function() {
        var margin = (parseFloat(document.getElementById('smartPricingMargin')?.value) || 15) / 100;
        var totalAmount = 0;
        var itemsSummary = [];

        currentAnalysisItems.forEach(function(item) {
            var benchmarks = window.getMarketPriceBenchmarks(item.name);
            var lastPrice = benchmarks.length > 0 ? benchmarks[0].price : 0;
            var unitP = item.customPrice != null ? item.customPrice : (lastPrice > 0 ? (lastPrice * (1 + margin)) : 10000);
            var lineTot = unitP * Number(item.qty || 1);
            totalAmount += lineTot;
            itemsSummary.push(item.qty + 'x ' + item.name + ' (' + unitP.toFixed(2) + ' DZD)');
        });

        if (currentActiveTenderIdx !== null) {
            var tender = (typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
            if (tender) {
                tender.amount = totalAmount;
                tender.notes = (tender.notes ? tender.notes + '\n\n' : '') + '[Smart Pricing Calculation]:\n' + itemsSummary.join('\n');
                if (typeof window.saveData === 'function') window.saveData();
                if (typeof window.renderAll === 'function') window.renderAll();
                if (typeof window.showToast === 'function') {
                    window.showToast(t('appliedSuccess'), 'success');
                }
            }
        } else if (typeof window.addProformaItem === 'function' && document.getElementById('createProformaModal')) {
            var itemsContainer = document.getElementById('proformaItems');
            if (itemsContainer) itemsContainer.innerHTML = '';
            currentAnalysisItems.forEach(function(item) {
                window.addProformaItem();
                var rows = itemsContainer ? itemsContainer.querySelectorAll('.invoice-item-row') : [];
                var lastRow = rows[rows.length - 1];
                if (lastRow) {
                    var descInp = lastRow.querySelector('.item-description') || lastRow.querySelector('input[type="text"]');
                    var qtyInp = lastRow.querySelector('.item-quantity') || lastRow.querySelector('input[type="number"]:not(.item-price)');
                    var priceInp = lastRow.querySelector('.item-price');
                    var benchmarks = (typeof window.getMarketPriceBenchmarks === 'function') ? window.getMarketPriceBenchmarks(item.name) : [];
                    var lastPrice = benchmarks.length > 0 ? benchmarks[0].price : 0;
                    var unitP = item.customPrice != null ? item.customPrice : (lastPrice > 0 ? (lastPrice * (1 + margin)) : 10000);
                    if (descInp) descInp.value = item.name + (item.unit ? ' (' + item.unit + ')' : '');
                    if (qtyInp) qtyInp.value = item.qty || 1;
                    if (priceInp) priceInp.value = unitP.toFixed(2);
                }
            });
            if (typeof window.calculateProformaTotal === 'function') window.calculateProformaTotal();
            if (typeof window.showToast === 'function') {
                window.showToast(t('appliedSuccess'), 'success');
            }
        }

        // Also update form field if tender modal is open
        var tenderAmountInput = document.getElementById('tenderAmount');
        if (tenderAmountInput) {
            tenderAmountInput.value = totalAmount.toFixed(2);
        }

        closeSmartPricingModal();
    };

})();
