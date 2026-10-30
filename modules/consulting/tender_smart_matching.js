(function () {
    'use strict';

    const TENDER_ANALYSIS_KEY = 'tender-analysis-data';

    // ── Unified Language Detection ──
    function getActiveLang() {
        try {
            if (window.UnifiedI18N && typeof window.UnifiedI18N.getCurrentLang === 'function') {
                var l = window.UnifiedI18N.getCurrentLang();
                if (l) return l.toLowerCase().slice(0, 2);
            }
            if (window.ZS && typeof window.ZS.getItem === 'function') {
                var l2 = window.ZS.getItem('preferred-language') || window.ZS.getItem('language');
                if (l2) return l2.toLowerCase().slice(0, 2);
            }
            if (typeof localStorage !== 'undefined') {
                var s = localStorage.getItem('zeralda-settings');
                if (s) {
                    try {
                        var parsed = JSON.parse(s);
                        if (parsed && parsed.preferredLanguage) return parsed.preferredLanguage.toLowerCase().slice(0, 2);
                    } catch (_) {}
                }
                var l3 = localStorage.getItem('preferred-language') || localStorage.getItem('language');
                if (l3) return l3.toLowerCase().slice(0, 2);
            }
            if (document.documentElement && document.documentElement.lang) {
                return document.documentElement.lang.toLowerCase().slice(0, 2);
            }
        } catch (_) {}
        return 'ar';
    }

    // ── Comprehensive Tri-Lingual Dictionary ──
    var DICT = {
        title:              { ar: 'المساعد الذكي للمناقصات والتسعير التنافسي (Copilote IA)', fr: 'Copilote IA & Tarification Intelligente des AO', en: 'AI Tender Copilot & Smart Pricing' },
        subtitle:           { ar: 'تفكيك دفتر الشروط، مطابقة الأسعار المرجعية، تقدير احتمالية الفوز، وصياغة العروض بالذكاء الاصطناعي.', fr: 'Analyse du cahier des charges, prix de référence, probabilité de succès et rédaction d\'offres.', en: 'AI-driven specification breakdown, benchmark matching, win probability & proposal drafting.' },
        tabPricing:         { ar: 'التسعير والمطابقة المرجعية', fr: 'Prix & Références', en: 'Smart Pricing & Benchmarks' },
        tabCopilot:         { ar: 'محادثة المساعد الذكي', fr: 'Assistant IA AO', en: 'AI Tender Assistant' },
        tabProposal:        { ar: 'صياغة العرض والخطاب الرسمي', fr: 'Rédaction d\'offres & Lettres', en: 'Proposal & Letter Drafter' },
        tabAudit:           { ar: 'المسح الذكي وتدقيق الوثائق (Scan IA)', fr: 'Scan IA & Audit Cahier des charges', en: 'AI Scan & Document Audit' },
        winScore:           { ar: 'مؤشر احتمالية الفوز', fr: 'Indice de succès estimé', en: 'Win Probability Index' },
        totalOffer:         { ar: 'إجمالي العرض المقترح', fr: 'Total de l\'offre proposée', en: 'Proposed Total Offer' },
        marginIncluded:     { ar: 'يشمل هامش الربح المستهدف', fr: 'Inclut la marge bénéficiaire cible', en: 'Includes target profit margin' },
        margin:             { ar: 'نسبة الهامش المستهدف %', fr: 'Marge cible %', en: 'Target Margin %' },
        marginMaxComp:      { ar: '5% (أقصى تنافسية)', fr: '5% (Très compétitif)', en: '5% (Max competitive)' },
        marginBalanced:     { ar: '20% (متوازن)', fr: '20% (Équilibré)', en: '20% (Balanced)' },
        marginHigh:         { ar: '40% (هامش عالي)', fr: '40% (Marge élevée)', en: '40% (High margin)' },
        addItem:            { ar: 'إضافة بند مخصص', fr: 'Ajouter un poste', en: 'Add Item' },
        upload:             { ar: 'رفع دفتر الشروط (PDF، Word، Excel، صورة)', fr: 'Téléverser cahier des charges', en: 'Upload Specification' },
        autoMatch:          { ar: 'تطابق تلقائي مع المبيعات', fr: 'Correspondance auto ventes', en: 'Auto-match with Sales' },
        printBpu:           { ar: 'طباعة BPU / عرض رسمي', fr: 'Imprimer BPU / Offre officielle', en: 'Print BPU / Official Quote' },
        applyAll:           { ar: 'اعتماد المجموع في المناقصة', fr: 'Appliquer à l\'AO', en: 'Apply Total to Tender' },
        detected:           { ar: 'البند / المواصفة', fr: 'Poste / Spécification', en: 'Item / Specification' },
        qty:                { ar: 'الكمية', fr: 'Qté', en: 'Qty' },
        lastSale:           { ar: 'السعر المرجعي السابق', fr: 'Prix de référence', en: 'Historical Benchmark' },
        suggested:          { ar: 'سعر الوحدة المقترح', fr: 'Prix unitaire proposé', en: 'Proposed Unit Price' },
        subtotal:           { ar: 'المجموع الجزئي (دج)', fr: 'Sous-total (DZD)', en: 'Subtotal (DZD)' },
        delete:             { ar: 'حذف', fr: 'Supprimer', en: 'Delete' },
        benchmarkRef:       { ar: 'مرجع: ', fr: 'Réf : ', en: 'Ref: ' },
        benchmarkEst:       { ar: 'تسعير تقديري', fr: 'Tarif estimatif', en: 'Estimated price' },
        chipLetter:         { ar: '📝 صياغة خطاب التقديم الرسمي', fr: '📝 Rédiger lettre de soumission', en: '📝 Draft submission letter' },
        chipStrategy:       { ar: '🎯 استراتيجية التسعير التنافسية', fr: '🎯 Stratégie de prix compétitifs', en: '🎯 Competitive pricing strategy' },
        chipRisks:          { ar: '🛡️ فحص الثغرات والشروط الجزائية', fr: '🛡️ Analyse des risques & pénalités', en: '🛡️ Penalty & risk audit' },
        chipDocs:           { ar: '📑 استخراج الوثائق الإدارية المطلوبة', fr: '📑 Pièces administratives requises', en: '📑 Required administrative checklist' },
        copy:               { ar: 'نسخ', fr: 'Copier', en: 'Copy' },
        appendToNotes:      { ar: 'إضافة لملاحظات المناقصة', fr: 'Ajouter aux notes AO', en: 'Add to tender notes' },
        sendQuestion:       { ar: 'اسأل المساعد الذكي أي شيء حول هذه المناقصة...', fr: 'Posez une question sur cet appel d\'offres...', en: 'Ask AI assistant about this tender...' },
        btnLetter:          { ar: 'خطاب التقديم (Lettre de soumission)', fr: 'Lettre de soumission', en: 'Submission Letter' },
        btnBpu:             { ar: 'جدول الأسعار (BPU)', fr: 'Bordereau des prix (BPU)', en: 'Price Schedule (BPU)' },
        btnTech:            { ar: 'المنهجية الفنية (Mémoire)', fr: 'Mémoire technique', en: 'Technical Methodology' },
        copyClipboard:      { ar: 'نسخ للحافظة', fr: 'Copier dans le presse-papier', en: 'Copy to Clipboard' },
        saveToNotes:        { ar: 'حفظ في ملاحظات المناقصة', fr: 'Enregistrer dans les notes', en: 'Save to Tender Notes' },
        proposalLoader:     { ar: 'المساعد الذكي يقوم بصياغة المستند بالمعايير القانونية...', fr: 'L\'assistant IA rédige le document officiel selon les normes...', en: 'AI assistant is drafting official procurement document...' },
        proposalPlaceholder:{ ar: 'اضغط على أحد الأزرار بالأعلى لتوليد الخطاب أو المستند المطلوب بالذكاء الاصطناعي...', fr: 'Cliquez sur un bouton ci-dessus pour générer le document souhaité via IA...', en: 'Click any button above to generate official document using AI...' },
        auditTitle:         { ar: 'المسح الذكي وتدقيق الوثائق (Scan IA)', fr: 'Scan IA & Audit Cahier des charges', en: 'AI Scan & Document Audit' },
        auditSubtitle:      { ar: 'ارفع وثيقة المناقصة أو دفتر الشروط (PDF، صورة، Excel، Word، TXT) لمسحه واستخراج كافة البيانات والبنود آلياً.', fr: 'Téléversez le cahier des charges (PDF, image, Excel, Word, TXT) pour extraire automatiquement les postes et exigences.', en: 'Upload tender specifications (PDF, image, Excel, Word, TXT) to automatically extract items, amounts, and checklist.' },
        auditUploadBtn:     { ar: 'رفع المستند والمسح الذكي (Scan IA)', fr: 'Téléverser & Scan IA', en: 'Upload & AI Scan' },
        metaCardTitle:      { ar: 'بيانات المناقصة المكتشفة بالذكاء الاصطناعي', fr: 'Données de l\'AO détectées par l\'IA', en: 'Tender Data Detected by AI' },
        btnCreateTender:    { ar: 'إنشاء مناقصة جديدة بهذه البيانات', fr: 'Créer un nouvel AO avec ces données', en: 'Create New Tender from Data' },
        btnUpdateTender:    { ar: 'تحديث المناقصة الحالية', fr: 'Mettre à jour l\'AO actuel', en: 'Update Active Tender' },
        metaRef:            { ar: 'المرجع (Référence):', fr: 'Référence :', en: 'Reference:' },
        metaTitle:          { ar: 'الموضوع (Titre):', fr: 'Titre / Objet :', en: 'Subject / Title:' },
        metaAuthority:      { ar: 'الجهة المتعاقدة (Autorité):', fr: 'Maître d\'ouvrage :', en: 'Contracting Authority:' },
        metaDeadline:       { ar: 'الأجل النهائي (Date limite):', fr: 'Date limite :', en: 'Submission Deadline:' },
        metaBudget:         { ar: 'القيمة التقديرية (Montant):', fr: 'Montant estimatif :', en: 'Estimated Budget:' },
        metaPeriod:         { ar: 'مدة الإنجاز (Délai):', fr: 'Délai d\'exécution :', en: 'Execution Period:' },
        docTextLabel:       { ar: 'نص دفتر الشروط أو الوثيقة المستخرجة:', fr: 'Texte du cahier des charges ou document extrait :', en: 'Extracted Specification Document Text:' },
        docTextPlaceholder: { ar: 'الصق نص دفتر الشروط هنا أو ارفع الملف بالأعلى لتحليله مباشرة...', fr: 'Collez le texte du cahier des charges ici ou téléversez un fichier ci-dessus...', en: 'Paste specification text here or upload document above to analyze directly...' },
        startAuditBtn:      { ar: 'بدء الفحص والتحليل الذكي (Scan IA)', fr: 'Lancer le Scan & Audit IA', en: 'Run AI Scan & Audit' },
        checklistLabel:     { ar: 'الوثائق والشروط المطلوبة المكتشفة:', fr: 'Pièces et conditions requises détectées :', en: 'Detected Required Documents & Conditions:' },
        checklistEmpty:     { ar: 'لم يتم الفحص بعد. ارفع المستند واضغط "بدء الفحص والتحليل الذكي".', fr: 'Aucun audit effectué. Téléversez le document et cliquez sur "Lancer le Scan IA".', en: 'No audit performed yet. Upload document and click "Run AI Scan & Audit".' },
        applyChecklistBtn:  { ar: 'تطبيق قائمة الوثائق في جاهزية الملف (Checklist)', fr: 'Appliquer à la checklist de conformité', en: 'Apply to Tender Checklist' },
        goToPricingBtn:     { ar: 'التسعير الذكي للبنود', fr: 'Tarification intelligente', en: 'Smart Pricing Breakdown' },
        statusExtracting:   { ar: 'جاري استخراج وقراءة نص المستند عبر المساعد الذكي (Scan IA)...', fr: 'Extraction et lecture du document en cours (Scan IA)...', en: 'Extracting and reading document text via AI Scan...' },
        statusOcrSuccess:   { ar: 'تم استخراج النص بنجاح! جاري تحليله واستخراج الحقول بالذكاء الاصطناعي...', fr: 'Texte extrait avec succès ! Analyse IA en cours...', en: 'Text extracted successfully! Running AI analysis...' },
        statusAuditDone:    { ar: '✅ تم اكتمال المسح واستخراج بيانات المناقصة وبنود التسعير بنجاح!', fr: '✅ Scan et audit terminés avec succès ! Postes et pièces extraits.', en: '✅ Scan & audit completed successfully! Items and documents extracted.' },
        statusUnreadable:   { ar: 'تعذر استخراج نص مقروء من المستند المرفق (تأكد من وضوح الصورة أو أن ملف PDF يحتوي على نص قابل للقراءة). يمكنك لصق النص يدوياً أدناه.', fr: 'Impossible d\'extraire un texte lisible de ce fichier (vérifiez la netteté ou la couche texte du PDF). Vous pouvez coller le texte manuellement ci-dessous.', en: 'Could not extract readable text from this file (ensure image is sharp or PDF has text layer). You may paste text manually below.' },
        statusError:        { ar: 'حدث خطأ أثناء قراءة المستند.', fr: 'Une erreur est survenue lors de la lecture du document.', en: 'An error occurred while reading the document.' },
        statusAuditLoading: { ar: 'جاري استخراج البنود والوثائق المطلوبة بالذكاء الاصطناعي...', fr: 'Extraction des postes et pièces requises par l\'IA...', en: 'Extracting items and required documents with AI...' },
        scoreExcellent:     { ar: 'تنافسي ممتاز (فرصة فوز عالية)', fr: 'Très compétitif (forte chance de succès)', en: 'Highly competitive (high win chance)' },
        scoreBalanced:      { ar: 'متوازن ومقبول تجارياً', fr: 'Équilibré et viable commercialement', en: 'Balanced and commercially viable' },
        scoreHigh:          { ar: 'هامش مرتفع (قد يقلل فرص الترسية)', fr: 'Marge élevée (risque de rejet sur le prix)', en: 'High margin (may reduce win rate)' },
        appliedSuccess:     { ar: 'تم تحديث مبلغ وبيانات المناقصة بنجاح!', fr: 'Montant et données de l\'AO mis à jour avec succès !', en: 'Tender amount & specifications updated successfully!' }
    };

    var t = function (k, fb) {
        var lang = getActiveLang();
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
     * Call ERP AI Chat endpoint with safe timeout and error handling
     */
    async function callAIChat(messages, systemContext, timeoutMs) {
        var headers = getAuthHeaders();
        var fullMessages = [];
        if (Array.isArray(messages)) {
            fullMessages = fullMessages.concat(messages);
        } else if (typeof messages === 'string') {
            fullMessages.push({ role: 'user', content: messages });
        }

        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timeout = timeoutMs || 25000;
        var timerId = controller ? setTimeout(function () {
            controller.abort();
        }, timeout) : null;

        try {
            var bodyPayload = {
                messages: fullMessages,
                type: 'general'
            };
            if (systemContext) {
                bodyPayload.system_prompt = systemContext;
            }

            var fetchOpts = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(bodyPayload)
            };
            if (controller) fetchOpts.signal = controller.signal;

            var res = await fetch('/api/ai/chat', fetchOpts);
            if (timerId) clearTimeout(timerId);

            if (!res.ok) {
                var errDetail = '';
                try {
                    var errData = await res.json();
                    errDetail = (errData && (errData.detail && errData.detail.error || errData.error)) || '';
                } catch(e) {}
                return { ok: false, error: 'AI status ' + res.status + (errDetail ? ': ' + errDetail : '') };
            }

            var data = await res.json();
            var text = String((data && (data.text || data.reply || data.content || data.response || data.result)) || '').trim();
            return { ok: true, text: text, data: data };
        } catch (e) {
            if (timerId) clearTimeout(timerId);
            var isTimeout = (e && e.name === 'AbortError');
            var errMsg = isTimeout ? 'AI service timed out (25s)' : (e && e.message ? e.message : 'AI unavailable');
            console.warn('[TenderAI] Error calling AI chat:', errMsg);
            return { ok: false, error: errMsg };
        }
    }

    function isUnconfiguredAIMessage(txt) {
        if (!txt) return true;
        var s = String(txt).toLowerCase();
        return s.includes('غير معرف') || s.includes('no ai provider') || s.includes('معطل حالياً') ||
               s.includes('missing api') || s.includes('settings → ai') || s.includes('ai status 400') ||
               s.includes('not supported') || s.includes('disabled');
    }

    /**
     * Extracts items and specifications from text using LLM, with guaranteed intelligent Algerian heuristic fallback
     */
    async function extractSpecificationsWithAI(documentText) {
        if (!documentText || documentText.trim().length < 5) {
            return { items: [], requiredDocuments: [], keyClauses: [] };
        }

        var activeLang = getActiveLang();
        var prompt = `You are an expert public procurement and tenders auditor for Algerian public tenders (Marchés publics selon Décret 15-247).
Analyze the following specification text (Cahier des charges / Avis d'appel d'offres / دفتر الشروط).
Extract the core data and respond ONLY in valid JSON format matching this schema:
{
  "reference": "Tender reference code",
  "title": "Tender subject / title",
  "authority": "Contracting authority / client",
  "deadline": "YYYY-MM-DD or submission deadline",
  "estimatedBudget": 0.0,
  "executionPeriod": "Execution delay",
  "items": [
    { "name": "Item designation / spec", "qty": 1, "unit": "U / Ens / M2 / Jours", "category": "Matériel / Service / Travaux" }
  ],
  "requiredDocuments": [
    "List of mandatory administrative & technical documents required"
  ],
  "keyClauses": [
    "Key penalties or execution clauses"
  ]
}

Document text:
` + documentText.slice(0, 8000);

        try {
            var aiRes = await callAIChat(prompt, "You are an expert procurement auditor. Respond ONLY in valid JSON format.", 25000);
            if (aiRes.ok && aiRes.text && !isUnconfiguredAIMessage(aiRes.text)) {
                var cleanJson = aiRes.text.replace(/```json/gi, '').replace(/```/g, '').trim();
                var jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    var parsed = JSON.parse(jsonMatch[0]);
                    var heuristicRef = extractReferenceHeuristic(documentText);
                    var candidateRef = (parsed.reference && typeof parsed.reference === 'string') ? parsed.reference.trim() : '';
                    if (!candidateRef || /^(66-156|03-03|15-247)$/.test(candidateRef) || /ordonnance|code\s*p[eé]nal|registre/i.test(candidateRef)) {
                        candidateRef = heuristicRef;
                    }

                    var heuristicTitle = extractTitleHeuristic(documentText);
                    var cleanTitle = (parsed.title && typeof parsed.title === 'string') ? parsed.title.trim() : heuristicTitle;
                    if (!cleanTitle || /^(d[eé]claration|candidature|probit[eé]|soumission|march[eé]\s+public)$/i.test(cleanTitle)) {
                        if (heuristicTitle) cleanTitle = heuristicTitle;
                    }

                    var heuristicAuth = extractAuthorityHeuristic(documentText);
                    var cleanAuth = (parsed.authority && typeof parsed.authority === 'string') ? parsed.authority.trim() : heuristicAuth;
                    cleanAuth = cleanAuth.replace(/Staoug[eé]/gi, 'Staoueli').replace(/Staqueli/gi, 'Staoueli');
                    var mWil = documentText.match(/(?:Wilaya\s+d[e\'’]\s*[A-Za-zÀ-ÿ\-]+|ولاية\s+[\u0621-\u064A\-]+)/i);
                    if (mWil && !cleanAuth.toLowerCase().includes('wilaya') && !cleanAuth.toLowerCase().includes('alger')) {
                        cleanAuth += ' (' + mWil[0].trim() + ')';
                    }

                    var detectedDocs = getDetectedChecklist(documentText, activeLang);
                    var finalDocs = (Array.isArray(parsed.requiredDocuments) && parsed.requiredDocuments.length) 
                        ? parsed.requiredDocuments 
                        : detectedDocs;

                    return {
                        reference: candidateRef,
                        title: cleanTitle,
                        authority: cleanAuth,
                        deadline: parsed.deadline || extractDeadlineHeuristic(documentText),
                        estimatedBudget: parseFloat(parsed.estimatedBudget) || 0,
                        executionPeriod: parsed.executionPeriod || '',
                        items: (Array.isArray(parsed.items) && parsed.items.length) ? parsed.items : parseItemsFromTextHeuristic(documentText, cleanTitle),
                        requiredDocuments: finalDocs,
                        keyClauses: (Array.isArray(parsed.keyClauses) && parsed.keyClauses.length) ? parsed.keyClauses : [
                            activeLang === 'ar' ? "الشروط الجزائية للتأخير: 1/1000 عن كل يوم تأخير بحد أقصى 10% من مبلغ الصفقة" : "Pénalités de retard : 1/1000 par jour plafonnées à 10% du marché",
                            activeLang === 'ar' ? "اقتطاع الضمان: 5% من كل كشف حساب تسترجع عند التسليم النهائي (بعد سنة)" : "Retenue de garantie : 5% libérable à la réception définitive (1 an)",
                            activeLang === 'ar' ? "فترة صلاحية العروض: مدة تحضير العروض + 3 أشهر" : "Délai de validité des offres : délai de préparation + 3 mois"
                        ]
                    };
                }
            }
        } catch (err) {
            console.warn('[TenderAI] Exception in AI extraction, using heuristic parser:', err);
        }

        // Guaranteed Heuristic Fallback
        return extractAlgerianTenderHeuristics(documentText, activeLang);
    }

    function extractAlgerianTenderHeuristics(documentText, activeLang) {
        var title = extractTitleHeuristic(documentText);
        return {
            reference: extractReferenceHeuristic(documentText),
            title: title,
            authority: extractAuthorityHeuristic(documentText),
            deadline: extractDeadlineHeuristic(documentText),
            candidate: extractCandidateHeuristic(documentText),
            estimatedBudget: 0,
            executionPeriod: '',
            items: parseItemsFromTextHeuristic(documentText, title),
            requiredDocuments: getDetectedChecklist(documentText, activeLang),
            keyClauses: [
                activeLang === 'ar' ? "الشروط الجزائية للتأخير: 1/1000 عن كل يوم تأخير بحد أقصى 10% من مبلغ الصفقة" : "Pénalités de retard : 1/1000 par jour plafonnées à 10% du marché",
                activeLang === 'ar' ? "اقتطاع الضمان: 5% من كل كشف حساب تسترجع عند التسليم النهائي (بعد سنة)" : "Retenue de garantie : 5% libérable à la réception définitive (1 an)",
                activeLang === 'ar' ? "فترة صلاحية العروض: مدة تحضير العروض + 3 أشهر" : "Délai de validité des offres : délai de préparation + 3 mois"
            ]
        };
    }

    function getDetectedChecklist(text, lang) {
        var str = String(text || '').toLowerCase();
        var isFr = lang === 'fr';
        var isEn = lang === 'en';

        var list = [];
        // Check for specific declarations present in the uploaded scan
        var hasProbite = /probit[eé]|نزاهة/i.test(str);
        var hasCandidature = /candidature|ترشح/i.test(str);
        var hasSoumission = /lettre\s+de\s+soumission|تعهد|تقديم\s+العرض/i.test(str);
        var hasRC = /registre\s+d[ue]\s+commerce|سجل\s+تجاري/i.test(str);
        var hasRole = /extrait\s+de\s+r[oô]le|ضرائب|جدول\s+الضرائب/i.test(str);
        var hasCnas = /cnas|casnos|ضمان\s+اجتماعي/i.test(str);
        var hasCasier = /casier\s+judiciaire|سوابق\s+قضائية/i.test(str);

        if (isFr) {
            list.push((hasCandidature ? "✓ " : "") + "Déclaration de candidature (renseignée et signée)" + (hasCandidature ? " [Détectée dans le fichier]" : ""));
            list.push((hasProbite ? "✓ " : "") + "Déclaration de probité (signée et datée)" + (hasProbite ? " [Détectée dans le fichier]" : ""));
            list.push((hasSoumission ? "✓ " : "") + "Lettre de soumission (signée et cachetée)");
            list.push((hasRC ? "✓ " : "") + "Registre de commerce électronique (code d'activité conforme)");
            list.push("Statuts de l'entreprise & pouvoirs de signature du gérant");
            list.push((hasRole ? "✓ " : "") + "Extrait de rôle apuré (moins de 3 mois)");
            list.push((hasCnas ? "✓ " : "") + "Attestation d'affiliation et mise à jour CNAS / CASNOS");
            list.push((hasCasier ? "✓ " : "") + "Casier judiciaire du gérant (bulletin N° 3)");
            list.push("Bordereau des Prix Unitaires (BPU) & Devis Quantitatif Estimatif (DQE)");
            list.push("Mémoire technique justificatif et méthodologie d'exécution");
            list.push("Bilans financiers certifiés des 3 dernières années");
            list.push("Attestations de bonne exécution pour projets similaires");
        } else if (isEn) {
            list.push((hasCandidature ? "✓ " : "") + "Candidate Application Declaration [Found in document]");
            list.push((hasProbite ? "✓ " : "") + "Integrity Declaration [Found in document]");
            list.push("Bid Submission Letter (signed and stamped)");
            list.push("Commercial Register (Electronic RC certificate)");
            list.push("Company Statutes & Manager Authority");
            list.push("Tax Clearance Certificate (Extrait de rôle)");
            list.push("Social Security Clearance (CNAS / CASNOS)");
            list.push("Criminal Record Certificate (N° 3)");
            list.push("Price Schedule (BPU) & Quantity Bill (DQE)");
            list.push("Technical Justification Proposal & Execution Methodology");
        } else {
            list.push((hasCandidature ? "✓ " : "") + "تصريح بالترشح (مملوء وموقع من المسير)" + (hasCandidature ? " [تم العثور عليه في الملف]" : ""));
            list.push((hasProbite ? "✓ " : "") + "تصريح بالنزاهة (موقع ومؤرخ)" + (hasProbite ? " [تم العثور عليه في الملف]" : ""));
            list.push((hasSoumission ? "✓ " : "") + "خطاب تقديم العرض والتعهد (Lettre de soumission)");
            list.push((hasRC ? "✓ " : "") + "مستخرج السجل التجاري الإلكتروني (برمز النشاط المناسب)");
            list.push("القانون الأساسي للشركة ومحضر تفويض المسير للتوقيع");
            list.push((hasRole ? "✓ " : "") + "مستخرج جدول الضرائب مصفى (أقل من 3 أشهر)");
            list.push((hasCnas ? "✓ " : "") + "شهادة أداء المستحقات وتحديث الاشتراك (CNAS / CASNOS)");
            list.push((hasCasier ? "✓ " : "") + "صحيفة السوابق القضائية للمسير (أقل من 3 أشهر)");
            list.push("جدول الأسعار الأحادية (BPU) والتفصيل الكمي والتقديري (DQE)");
            list.push("المذكرة التقنية التبريرية ومنهجية الإنجاز");
            list.push("الحصائل المالية للسنوات الثلاث الأخيرة (محافظ الحسابات)");
            list.push("شهادات حسن الإنجاز لمشاريع مماثلة سابقة");
        }
        return list;
    }


    function extractReferenceHeuristic(text) {
        var str = String(text || '');
        // Strip penal code / legal ordinance references to avoid false matches (e.g. 66-156, 03-03, 15-247)
        var cleanStr = str.replace(/(?:ordonnance|d[eé]cret|loi|article|code\s+p[eé]nal|registre(?:\s+du\s+commerce)?)\s*(?:n[°oº]|r[eé]f)?\s*[:\.\s]*[0-9\-\/]+/gi, '');

        // 1. Explicit tender reference with keywords
        var m = cleanStr.match(/(?:AON?|AOI?|Consultation|Avis\s+d['’]appel\s+d['’]offres|Appel\s+d['’]offres|الصفقة|المناقصة|الاستشارة)\s*(?:N[°oº]|R[eé]f(?:\.|erence)?|رقم|مرجع)?\s*[:\/\-\s#№]+\s*([0-9]{1,4}\s*[\/\-]\s*[0-9]{2,4}|[A-Za-z0-9\/\-_]{3,30})/i);
        if (m) {
            var candidateRef = m[1].replace(/\s+/g, '').trim();
            if (/\d/.test(candidateRef) && candidateRef.length >= 3 && !/^(66-156|03-03|15-247)$/.test(candidateRef)) return candidateRef;
        }

        // 2. Generic N° X/YYYY pattern
        var m2 = cleanStr.match(/(?:N[°oº]|R[eé]f(?:\.|erence)?|مرجع|رقم)\s*[:\/\-\s#№]+\s*([0-9]{1,4}\s*[\/\-]\s*20[2-3][0-9])/i);
        if (m2) {
            var candidateRef2 = m2[1].replace(/\s+/g, '').trim();
            if (/\d/.test(candidateRef2) && !/^(66-156|03-03|15-247)$/.test(candidateRef2)) return candidateRef2;
        }

        return '';
    }

    function extractTitleHeuristic(text) {
        var str = String(text || '');
        // 1. Check for 'Objet du marché public :' or 'Objet :' or 'portant sur :'
        var m = str.match(/(?:Objet(?:\s+du\s+march[eé](?:\s+public)?|\s+de\s+la\s+consultation|\s+de\s+l['’]appel\s+d['’]offres|\s+de\s+la\s+prestation)?|portant(?:\s+sur)?|relatif\s+[aà]|intitul[eé]|موضوع(?:\s+الصفقة|\s+المناقصة|\s+الاستشارة)?|يتضمن|مشروع)\s*[:\-]\s*([^\n\r]+)/i);
        if (m) {
            var t = m[1].replace(/\s+/g, ' ').replace(/^[0-9\/\-.:\s]+/, '').replace(/[.;,]+$/, '').trim();
            if (t.length > 3) return t;
        }

        // 2. Scan lines
        var lines = str.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
        for (var i = 0; i < Math.min(lines.length, 12); i++) {
            if (/^(objet|titre|موضوع|مشروع|projet)\s*[:\-]/i.test(lines[i])) {
                var clean = lines[i].replace(/^(objet|titre|موضوع|مشروع|projet)\s*[:\-]\s*/i, '').trim();
                if (clean.length > 3) return clean;
            }
            if (/^(avis\s+d['’]appel|إعلان\s+عن|استشارة)/i.test(lines[i]) && lines[i+1] && lines[i+1].length > 6) {
                return lines[i+1].slice(0, 120);
            }
        }
        return lines[0] ? lines[0].slice(0, 100) : '';
    }

    function extractAuthorityHeuristic(text) {
        var str = String(text || '');
        // 1. Check for 'Désignation du service contractant :'
        var mService = str.match(/(?:D[eé]signation\s+du\s+service\s+contractant|l['’]Assembl[eé]e\s+Populaire\s+Communale\s+d[e\'’]\s*[A-Za-zÀ-ÿ\-]+|المجلس\s+الشعبي\s+البلدي\s+ل?[^\n\r]+)\s*[:\-]?\s*([^\n\r]+)?/i);
        if (mService) {
            var auth = (mService[1] || mService[0]).replace(/\s+/g, ' ').replace(/^[0-9\/\-.:\s]+/, '').replace(/[.;,]+$/, '').trim();
            auth = auth.replace(/Staou[a-zÀ-ÿ]+/gi, 'Staoueli').replace(/Staqueli/gi, 'Staoueli');
            if (auth.length > 4 && !auth.match(/^[0-9]+$/)) {
                // Append Wilaya if found
                var mWil = str.match(/(?:Wilaya\s+d[e\'’]\s*[A-Za-zÀ-ÿ\-]+|ولاية\s+[\u0621-\u064A\-]+)/i);
                if (mWil && !auth.toLowerCase().includes('wilaya') && !auth.toLowerCase().includes('alger')) {
                    auth += ' (' + mWil[0].trim() + ')';
                }
                return auth;
            }
        }

        // 2. Commune de ...
        var mCommune = str.match(/(?:Commune\s+d[e\'’]\s*[A-Za-zÀ-ÿ\-]+|بلدية\s+[\u0621-\u064A\-]+)/i);
        if (mCommune) {
            var c = mCommune[0].trim().replace(/Staqueli/gi, 'Staoueli');
            return c;
        }

        // 3. Wilaya / Ministère / Direction
        var m2 = str.match(/(?:Wilaya\s+d[e\'’]\s*[A-Za-zÀ-ÿ\-]+|ولاية\s+[\u0621-\u064A\-]+)/i);
        if (m2) return m2[0].trim();
        var m3 = str.match(/(?:Minist[eè]re\s+d[e\'’]\s*[A-Za-zÀ-ÿ\s\-]+|وزارة\s+[\u0621-\u064A\s\-]+)/i);
        if (m3) return m3[0].trim();
        var m4 = str.match(/(?:Direction\s+d[e\'’]\s*[A-Za-zÀ-ÿ\s\-]+|مديرية\s+[\u0621-\u064A\s\-]+)/i);
        if (m4) return m4[0].trim();
        var m5 = str.match(/(?:ma[iî]tre\s+d['’]ouvrage|client|administration|acheteur|المصلحة\s+المتعاقدة|المشتري|الإدارة)\s*[:\-]\s*([^\n\r,]{4,80})/i);
        if (m5 && !m5[1].trim().match(/^[0-9]+$/)) return m5[1].trim();

        return '';
    }

    function extractCandidateHeuristic(text) {
        var str = String(text || '');
        var mCompany = str.match(/\b(SARL|EURL|SPA|SNC|ETS)\s+[A-Z0-9\s\-]{3,35}\b/);
        if (mCompany) return mCompany[0].trim();
        var mDenom = str.match(/(?:D[eé]nomination\s+de\s+la\s+soci[eé]t[eé]|Raison\s+sociale|تسمية\s+الشركة|المؤسسة)\s*[:\-]?\s*([^\n\r]{3,40})/i);
        if (mDenom && mDenom[1].trim().length > 3) return mDenom[1].trim();
        return '';
    }

    function extractDeadlineHeuristic(text) {
        var str = String(text || '');
        var m = str.match(/(?:d[eé]lai\s+de\s+pr[eé]paration[^\n\r:]*[:\-]\s*([^\n\r.]{3,40})|deadline|échéance|date\s+limite|آخر\s+أجل|تاريخ\s+الإيداع|مدة\s+التحضير)\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|[^\n\r,.;]{3,35})/i);
        if (m) return (m[1] || m[2] || '').trim();
        var mDate = str.match(/(\d{4}[-/]\d{2}[-/]\d{2})|(\d{2}[-/]\d{2}[-/]\d{4})/);
        return mDate ? mDate[0] : '';
    }

    function parseItemsFromTextHeuristic(text, tenderTitle) {
        var str = String(text || '');
        var detected = [];

        // 1. Look for numbered lots (Lot N° 01: ...)
        var lotRegex = /(?:Lot|Poste|Article|بند|حصة)\s*N?[°oº]?\s*(\d+)\s*[:\-]\s*([^\n\r]+)/gi;
        var lm;
        while ((lm = lotRegex.exec(str)) !== null) {
            var lotName = lm[2].trim().replace(/[.;]+$/, '');
            var lotNum = lm[1];
            detected.push({
                name: (getActiveLang() === 'ar' ? ('الحصة ' + lotNum + ': ' + lotName) : ('Lot ' + lotNum + ' : ' + lotName)),
                qty: 1,
                category: (/fourniture|consommable|matériel|équipement|عتاد|تجهيز/i.test(lotName) ? 'Matériel' : 'Services')
            });
        }
        if (detected.length) return detected.slice(0, 25);

        // 2. If tenderTitle is known (e.g. "Acquisition Bourses et Prix"), use it as the main item!
        if (tenderTitle && tenderTitle.length > 3 && !tenderTitle.toLowerCase().includes('cahier') && !tenderTitle.toLowerCase().includes('avis')) {
            return [
                {
                    name: tenderTitle,
                    qty: 1,
                    category: (/fourniture|acquisition|équipement|bourses|prix/i.test(tenderTitle) ? 'Fournitures' : 'Services')
                }
            ];
        }

        // 3. Fallback to generic line search
        var lines = str.split(/\r?\n/);
        lines.forEach(function(l) {
            var trimmed = l.trim();
            if (!trimmed || trimmed.length < 4 || trimmed.length > 140) return;
            var matchQty = trimmed.match(/^(\d+)\s*[-.)xX]\s*(.+)/) || trimmed.match(/(.+?)\s*[:=]\s*(\d+)\s*(pcs|u|unites|qty|x)?$/i);
            if (matchQty) {
                var name = matchQty[2] || matchQty[1];
                var qty = parseInt(matchQty[1] || matchQty[2], 10) || 1;
                detected.push({ name: name.trim(), qty: Math.max(1, qty), category: 'General' });
            }
        });
        if (detected.length) return detected.slice(0, 25);

        var lang = getActiveLang();
        if (lang === 'fr') {
            return [
                { name: "Lot 01 : Fournitures et équipements principaux", qty: 1, category: "Matériel" },
                { name: "Lot 02 : Prestations de services et déploiement", qty: 1, category: "Services" }
            ];
        } else if (lang === 'en') {
            return [
                { name: "Lot 01: Main equipment and supplies", qty: 1, category: "Hardware" },
                { name: "Lot 02: Deployment & consulting services", qty: 1, category: "Services" }
            ];
        } else {
            return [
                { name: "الحصة 01: التوريدات والتجهيزات الرئيسية", qty: 1, category: "عتاد" },
                { name: "الحصة 02: خدمات التركيب والدعم الفني", qty: 1, category: "خدمات" }
            ];
        }
    }

    /**
     * Offline Procurement Copilot Assistant Engine (Algerian Presidential Decree 15-247 compliant)
     */
    function generateOfflineCopilotResponse(query, tenderObj, items, curLang) {
        var q = String(query || '').toLowerCase();
        var isAr = curLang === 'ar';
        var tTitle = tenderObj ? (tenderObj.title || 'Marché') : (currentExtractedMetadata.title || 'Marché');
        var tRef = tenderObj ? (tenderObj.reference || 'AO-2026') : (currentExtractedMetadata.reference || 'AO-2026');
        var tAuth = tenderObj ? (tenderObj.authority || 'Administration') : (currentExtractedMetadata.authority || 'Administration');
        var tDeadline = tenderObj ? (tenderObj.deadline || '15 jours') : (currentExtractedMetadata.deadline || '15 jours');
        var totalAmountVal = parseFloat(document.getElementById('smartPricingTotalVal')?.textContent) || 0;
        var marginVal = document.getElementById('marginDisplayVal')?.textContent || '15%';

        // 1. Submission Letter Request
        if (q.includes('letter') || q.includes('soumission') || q.includes('خطاب') || q.includes('تقديم') || q.includes('تعهد')) {
            if (isAr) {
                return `📋 **صياغة خطاب تقديم العرض الرسمي (Lettre de Soumission)**
المشروع: **${tTitle}** | المرجع: **${tRef}**
المصلحة المتعاقدة: **${tAuth}**

صيغة الخطاب القانونية الرسمية جاهزة:
> "أنا الموقع أسفله، ممثل المؤسسة، بعد الاطلاع على كامل وثائق دفتر الشروط الخاص بالمناقصة رقم **${tRef}** المتعلقة بـ **${tTitle}**، أتعهد وألزم مؤسستي بتنفيذ كامل بنود الصفقة طبقا للشروط والمواصفات المحددة، بمبلغ إجمالي قدره **${totalAmountVal.toLocaleString('fr-FR')} دج مع كل الرسوم**، وفي أجل قدره **${tDeadline}**."

💡 **توصية المساعد الذكي:** يمكنك الانتقال إلى تبويب **"صياغة العرض والخطاب الرسمي"** لتوليد الخطاب بالكامل بنسخة جاهزة للطباعة والتوقيع أو نسخه مباشرة.`;
            } else {
                return `📋 **Lettre de Soumission Officielle (Décret 15-247)**
Marché : **${tTitle}** | Réf : **${tRef}**
Maître d'ouvrage : **${tAuth}**

Modèle formel conforme à la réglementation des marchés publics :
> "Je soussigné, représentant légal de l'entreprise, après avoir examiné le cahier des charges relatif à l'appel d'offres N° **${tRef}** portant **${tTitle}**, m'engage à exécuter l'ensemble des prestations pour un montant global de **${totalAmountVal.toLocaleString('fr-FR')} DZD TTC**, dans un délai ferme de **${tDeadline}**."

💡 **Conseil du Copilote :** Vous pouvez basculer sur l'onglet **"Rédaction d'offres & Lettres"** pour générer la lettre officielle complète prête pour signature et cachet.`;
            }
        }

        // 2. Pricing & Competitive Strategy
        if (q.includes('strategy') || q.includes('prix') || q.includes('pricing') || q.includes('تسعير') || q.includes('استراتيجية') || q.includes('ربح') || q.includes('marge')) {
            var itemsCount = items ? items.length : 0;
            if (isAr) {
                return `🎯 **استراتيجية التسعير التنافسية للصفقة:**
- **مستوى الهامش المعتمد:** ${marginVal} (يوفر توازناً ممتازاً بين التنافسية واستدامة الربحية).
- **المبلغ الإجمالي المقترح:** ${totalAmountVal.toLocaleString('fr-FR')} دج TTC موزعة على ${itemsCount} بنود.
- **معيار التقييم المعتمد في قانون الصفقات الجزائري:**
  1. إذا كان التقييم وفق **"العرض الأقل ثمناً" (Moins-disant)**: يفضل تخفيض الهامش إلى 8%-10% في البنود الرئيسية.
  2. إذا كان التقييم وفق **"العرض الأفضل اقتصادياً" (Mieux-disant)**: حافظ على هامش 15%-18% مع تدعيم المذكرة التقنية بالضمانات، لأن العلامة التقنية (تمثل عادة 70% إلى 80%) سترجح كفتك.`;
            } else {
                return `🎯 **Stratégie de Tarification & Compétitivité :**
- **Marge appliquée :** ${marginVal} (taux équilibré entre attractivité financière et rentabilité nette).
- **Montant total de l'offre :** ${totalAmountVal.toLocaleString('fr-FR')} DZD TTC (${itemsCount} postes évalués).
- **Critères d'attribution (Décret présidentiel 15-247) :**
  1. **Offre la moins-disante :** Si le marché privilégie uniquement le coût, optimisez la marge entre 8% et 10% sur les fournitures standards.
  2. **Offre économiquement la plus avantageuse (Mieux-disant) :** Maintenez la marge à 15%-18% et valorisez le mémoire technique (noté sur 70 ou 80 points) pour remporter l'évaluation technique éliminatoire.`;
            }
        }

        // 3. Risks & Penalty Clauses
        if (q.includes('risks') || q.includes('risques') || q.includes('pénalité') || q.includes('مخاطر') || q.includes('غرامة') || q.includes('شروط جزائية') || q.includes('caution') || q.includes('ضمان')) {
            if (isAr) {
                return `🛡️ **تحليل المخاطر والبنود التعاقدية الأساسية:**
1. **غرامات التأخير (Pénalités de retard):** وفق المادة 99 من المرسوم 15-247، تحدد عادة بـ 1/1000 عن كل يوم تأخير، وهي **مسقوفة قانوناً بنسبة 10%** من القيمة الإجمالية للصفقة.
2. **اقتطاع الضمان (Retenue de garantie):** يتم حجز **5%** من كل وضعية مستحقة، ولا تسترجع إلا بعد محضر الاستلام النهائي (بعد سنة من الاستلام المؤقت). يمكنك قانوناً استبدالها بكفالة بنكية للمحافظة على السيولة.
3. **أجل إيداع العروض:** الالتزام الصارم بالإيداع قبل الساعة 12:00 من آخر يوم محدد (${tDeadline}) في مكتب الصفقات لتفادي الإقصاء الشكلي.`;
            } else {
                return `🛡️ **Audit des Risques & Clauses Réglementaires (Décret 15-247) :**
1. **Pénalités de retard :** Fixées légalement à 1/1000 par jour calendaire de retard, avec un **plafond légal strict de 10%** du montant global du marché.
2. **Retenue de garantie :** Une retenue de **5%** s'applique sur chaque décompte mensuel, libérable à la réception définitive (garantie de 12 mois). Vous pouvez la remplacer par une caution bancaire équivalente pour préserver votre trésorerie.
3. **Validité des offres :** Vous restez engagé pendant la durée de préparation augmentée de 3 mois. Tout désistement entraîne la confiscation de la caution de soumission.`;
            }
        }

        // 4. Required Documents Checklist
        if (q.includes('docs') || q.includes('documents') || q.includes('candidature') || q.includes('وثائق') || q.includes('ملف') || q.includes('شروط') || q.includes('أوراق')) {
            if (isAr) {
                return `📑 **ملف الترشح والعرض الكامل وفق القانون الجزائري للصفقات:**
يتكون الملف القانوني من 3 أظرفة منفصلة داخل ظرف رئيسي مغلق ومبهم:
1. **ظرف الترشح (Dossier de candidature):**
   - التصريح بالترشح + التصريح بالنزاهة.
   - السجل التجاري الإلكتروني (برمز نشاط مطابق).
   - جدول الضرائب مصفى (أقل من 3 أشهر) + شهادات CNAS/CASNOS سارية.
   - الحصائل المالية للـ 3 سنوات السابقة + شهادات حسن الإنجاز لمشاريع مماثلة.
2. **ظرف العرض التقني (Offre technique):**
   - التصريح بالاكتتاب + المذكرة التقنية ومنهجية التنفيذ + رزنامة الإنجاز.
3. **ظرف العرض المالي (Offre financière):**
   - خطاب التقديم (Lettre de soumission) + جدول الأسعار BPU + التفصيل التقديري DQE.`;
            } else {
                return `📑 **Dossier Officiel Exigé (Architecture à 3 Enveloppes) :**
Conformément au Décret 15-247, votre soumission doit comprendre 3 enveloppes distinctes :
1. **Dossier de Candidature :**
   - Déclaration de candidature & Déclaration de probité.
   - Registre de commerce électronique (code d'activité adéquat).
   - Extrait de rôle apuré (< 3 mois) et attestations CNAS/CASNOS à jour.
   - Bilans certifiés (3 dernières années) + Attestations de bonne exécution similaires.
2. **Offre Technique :**
   - Déclaration à souscrire, Mémoire technique justificatif, planning de réalisation.
3. **Offre Financière :**
   - Lettre de soumission signée & cachetée, BPU et DQE chiffrés.`;
            }
        }

        // General Consulting Query
        if (isAr) {
            return `مرحباً بك! بصفتي المساعد الذكي لمناقصاتك في Zeralda ERP:
- أنا أتابع ملف المناقصة **${tTitle}** (مرجع: **${tRef}**).
- يمكنك استخدام الأزرار السريعة بالأعلى لصياغة خطاب التقديم الرسمي، أو فحص الأسعار وهوامش الربح، أو تدقيق قائمة الوثائق الإلزامية لتجنب أي إقصاء إداري.
- كما يمكنك رفع وثيقة دفتر الشروط في تبويب **"Scan IA"** لاستخراج كافة البنود والأسعار آلياً.`;
        } else {
            return `Bonjour ! En tant que Copilote IA pour vos marchés Zeralda ERP :
- J'analyse le dossier de consultation **${tTitle}** (Réf: **${tRef}**).
- Utilisez les puces rapides ci-dessus pour rédiger la lettre de soumission, simuler vos marges bénéficiaires, ou vérifier les pièces éliminatoires.
- Vous pouvez également déposer votre cahier des charges dans l'onglet **"Scan IA"** pour une extraction automatisée immédiate.`;
        }
    }

    /**
     * Offline Official Document Generator for Proposal Drafter
     */
    function generateOfflineDraftDocument(docType, tenderObj, items, totalAmount, curLang) {
        var isAr = curLang === 'ar';
        var tTitle = tenderObj ? (tenderObj.title || 'Marché de fournitures et prestations') : (currentExtractedMetadata.title || 'Marché de fournitures et prestations');
        var tRef = tenderObj ? (tenderObj.reference || 'AO-2026/01') : (currentExtractedMetadata.reference || 'AO-2026/01');
        var tAuth = tenderObj ? (tenderObj.authority || 'Administration Contractante') : (currentExtractedMetadata.authority || 'Administration Contractante');
        var tDeadline = tenderObj ? (tenderObj.deadline || '15 jours') : (currentExtractedMetadata.deadline || '15 jours');
        var todayStr = new Date().toLocaleDateString(isAr ? 'ar-DZ' : 'fr-FR');
        var totalAmountVal = totalAmount || (parseFloat(document.getElementById('smartPricingTotalVal')?.textContent) || 0);

        if (docType === 'submission_letter') {
            if (isAr) {
                return `الجمهورية الجزائرية الديمقراطية الشعبية

رسالة التعهد وخطاب تقديم العرض الرسمي (Lettre de Soumission)
(وفقاً للمرسوم الرئاسي رقم 15-247 المتعلق بتنظيم الصفقات العمومية)

إلى السيد / ${tAuth}
الموضوع: التعهد في المناقصة رقم: ${tRef}
موضوع الصفقة: ${tTitle}

أنا الموقع أسفله: [الاسم واللقب / الممثل القانوني للمؤسسة]،
المتصرف باسم ولحساب شركة: [اسم الشركة / المؤسسة]،
السجل التجاري رقم: [رقم السجل التجاري]،
رقم التعريف الجبائي (NIF): [NIF] - رقم المادة (AI): [رقم المادة]،
المقر الاجتماعي: [العنوان الكامل]،

1. بعد دراسة واطلاع كامل على وثائق دفتر الشروط الخاص بالمناقصة رقم ${tRef}؛
2. أعلن التزامي وقبولي التام وغير المشروط بجميع الشروط والبنود المحددة في دفتر الشروط؛
3. أتعهد بتنفيذ كامل التوريدات والخدمات موضوع الصفقة طبقا للشروط والمواصفات الفنية، وبالمبلغ الإجمالي والجزافي:
   - بالأرقام (مع كل الرسوم TTC): ${totalAmountVal.toLocaleString('fr-FR', {minimumFractionDigits:2})} دج
   - بالحروف: [يكتب المبلغ بالحروف دينار جزائري مع كل الرسوم].
4. أتعهد بإنجاز كامل موضوع الصفقة في أجل قدره: ${tDeadline} ابتداءً من تاريخ تبليغ أمر بداية الخدمة (ODS).
5. أقر بأن هذا العرض يلزمني طيلة فترة صلاحية العروض المحددة في دفتر الشروط.

حرر بـ: ........................، في: ${todayStr}

المتعهد
(التوقيع القانوني وخاتم المؤسسة)`;
            } else {
                return `RÉPUBLIQUE ALGÉRIENNE DÉMOCRATIQUE ET POPULAIRE

LETTRE DE SOUMISSION OFFICIELLE
(Conforme aux dispositions du Décret présidentiel n° 15-247 portant réglementation des marchés publics)

À l'attention de : Monsieur le Responsable de ${tAuth}
Objet : Soumission à l'Appel d'Offres N° : ${tRef}
Intitulé du projet : ${tTitle}

Je soussigné(e) : [Nom, Prénom et Fonction du Gérant / Représentant habilité],
Agissant au nom et pour le compte de la société : [Raison Sociale de l'Entreprise],
Inscrite au Registre du Commerce sous le N° : [N° RC],
Identifiant Fiscal (NIF) : [NIF] - Article d'Imposition : [AI] - NIS : [NIS],
Adresse du siège social : [Adresse complète],

1. Après avoir examiné l'ensemble des pièces constitutives du cahier des charges relatif au marché cité en référence ;
2. Déclare accepter sans réserve toutes les clauses, stipulations et obligations prévues dans le dossier d'appel d'offres ;
3. Me soumets et m'engage envers ${tAuth} à exécuter l'ensemble des prestations conformément aux spécifications techniques et selon les prix mentionnés au Bordereau des Prix Unitaires (BPU) ci-annexé, pour le montant global et forfaitaire de :
   - En chiffres (TTC) : ${totalAmountVal.toLocaleString('fr-FR', {minimumFractionDigits:2})} DZD
   - En lettres (TTC) : [Montant arrêté en toutes lettres en Dinars Algériens toutes taxes comprises].
4. M'engage à réaliser les prestations dans un délai ferme de : ${tDeadline} à compter de la notification de l'Ordre de Service (ODS).
5. Déclare que la présente offre reste valable pendant toute la durée de validité des offres fixée par le cahier des charges.

Fait à : ...................................., le : ${todayStr}

Le Soumissionnaire
(Nom, Signature légalisée et cachet de l'entreprise)`;
            }
        }

        if (docType === 'bpu') {
            var lines = [];
            var totHt = 0;
            (items || []).forEach(function(it, i) {
                var p = it.customPrice != null ? it.customPrice : 10000;
                var q = it.qty || 1;
                var tht = p * q;
                totHt += tht;
                lines.push(`| ${(i+1)} | ${it.name} | ${it.unit || 'U'} | ${q} | ${p.toLocaleString('fr-FR', {minimumFractionDigits:2})} | ${tht.toLocaleString('fr-FR', {minimumFractionDigits:2})} |`);
            });
            var tva = totHt * 0.19;
            var totTtc = totHt + tva;

            if (isAr) {
                return `جدول الأسعار الأحادية والتفصيل الكمي والتقديري (BPU / DQE)
المشروع: ${tTitle} | المرجع: ${tRef}
المصلحة المتعاقدة: ${tAuth}

| الرقم | تعيين البند / المواصفة | الوحدة | الكمية | السعر الأحادي (دج) | المجموع الجزئي (دج) |
|---|---|---|---|---|---|
${lines.join('\n')}

- المجموع خارج الرسوم (Total Général HT): ${totHt.toLocaleString('fr-FR', {minimumFractionDigits:2})} دج
- الرسم على القيمة المضافة (TVA 19%): ${tva.toLocaleString('fr-FR', {minimumFractionDigits:2})} دج
- المجموع الإجمالي مع كل الرسوم (Total Général TTC): ${totTtc.toLocaleString('fr-FR', {minimumFractionDigits:2})} دج

حرر بتاريخ: ${todayStr}
ختم وتوقيع المتعهد:`;
            } else {
                return `BORDEREAU DES PRIX UNITAIRES & DÉTAIL QUANTITATIF ESTIMATIF (BPU / DQE)
Marché : ${tTitle} | Réf : ${tRef}
Maître d'ouvrage : ${tAuth}

| N° | Désignation des Prestations & Fournitures | Unité | Qté | Prix Unitaire HT (DZD) | Montant Total HT (DZD) |
|---|---|---|---|---|---|
${lines.join('\n')}

- TOTAL GÉNÉRAL HORS TAXES (HT) : ${totHt.toLocaleString('fr-FR', {minimumFractionDigits:2})} DZD
- TVA (19%) : ${tva.toLocaleString('fr-FR', {minimumFractionDigits:2})} DZD
- MONTANT GLOBAL TOUTES TAXES COMPRISES (TTC) : ${totTtc.toLocaleString('fr-FR', {minimumFractionDigits:2})} DZD

Arrêté le présent bordereau à la somme de : [Montant en toutes lettres] Dinars Algériens TTC.
Fait le : ${todayStr}
Signature et cachet du Soumissionnaire :`;
            }
        }

        // Technical Memo
        if (isAr) {
            return `المذكرة التقنية ومنهجية التنفيذ (Mémoire Technique)
الصفقة: ${tTitle} | المرجع: ${tRef}
المصلحة المتعاقدة: ${tAuth}

1. نبذة عن المؤسسة ومؤهلاتها:
- خبرة متخصصة وسجل حافل من المشاريع المشابهة المنجزة بنجاح.
- توفر طاقم فني وإداري مؤهل تأهيلاً عالياً لضمان تنفيذ المشروع بأعلى درجات الاحترافية.

2. منهجية ومراحل التنفيذ:
- المرحلة الأولى: الإعداد الأولي، دراسة الاحتياجات وتنسيق خطة العمل مع ممثلي ${tAuth}.
- المرحلة الثانية: التوريد والتنفيذ الميداني وفق المواصفات القياسية المعتمدة.
- المرحلة الثالثة: الفحص التجريبي ومحاضر التسليم المؤقت وتدريب المستخدمين.

3. الوسائل البشرية والمادية المسخرة:
- مهندس رئيسي ومسؤول مشروع لمتابعة الجودة والجدول الزمني.
- فريق تقني ميداني مجهز بالكامل بأحدث المعدات ووسائل السلامة.

4. نظام الجودة والأمن الصناعي (HSE):
- الامتثال الصارم لتدابير السلامة والوقاية المعمول بها.
- الالتزام التام بفترة الضمان والصيانة الفورية وخدمة ما بعد البيع.

حرر بـ: ........................، في: ${todayStr}`;
        } else {
            return `MÉMOIRE TECHNIQUE JUSTIFICATIF & MÉTHODOLOGIE D'EXÉCUTION
Projet : ${tTitle} | Réf : ${tRef}
Maître d'ouvrage : ${tAuth}

1. PRÉSENTATION DE L'ENTREPRISE & CAPACITÉS OPÉRATIONNELLES
- Société spécialisée disposant des agréments nécessaires et d'une solide expérience dans le domaine.
- Références professionnelles probantes et attestations de bonne exécution délivrées par des administrations similaires.

2. MÉTHODOLOGIE D'INTERVENTION & DÉROULEMENT DES PRESTATIONS
- Phase 1 : Cadrage initial, planification détaillée et coordination avec les services de ${tAuth}.
- Phase 2 : Approvisionnement conforme aux normes techniques et déploiement opérationnel.
- Phase 3 : Recette technique, essais de conformité, mise en service et formation du personnel.

3. MOYENS HUMAINS ET MATÉRIELS AFFECTÉS AU PROJET
- Chef de projet dédié assurant le pilotage technique et le reporting régulier.
- Équipes techniques qualifiées et outillage moderne garantissant une exécution rapide et soignée.

4. DÉMARCHE QUALITÉ, HYGIÈNE ET SÉCURITÉ (Q-HSE)
- Respect scrupuleux des normes de sécurité et de propreté sur les lieux d'intervention.
- Engagement ferme sur la réactivité du service après-vente et la garantie légale des prestations.

Fait à : ...................................., le : ${todayStr}`;
        }
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
                                source: 'Vente',
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
                            source: 'Achat',
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
     * Opens AI Tender Copilot modal with active language support
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

        var curLang = getActiveLang();
        var modal = document.getElementById('smartPricingModal');
        // If modal was created in a different language, re-create it so all labels are localized
        if (modal && modal.dataset.renderedLang !== curLang) {
            modal.remove();
            modal = null;
        }

        if (!modal) {
            createSmartPricingModal();
            modal = document.getElementById('smartPricingModal');
        }

        var titleEl = document.getElementById('smartPricingTenderTitle');
        if (titleEl) {
            if (tObj) {
                titleEl.textContent = (tObj.reference ? tObj.reference + ' - ' : '') + (tObj.title || 'Tender');
            } else {
                titleEl.textContent = t('title');
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
            var lang = getActiveLang();
            if (lang === 'fr') {
                currentAnalysisItems = [
                    { name: "Services de conseil et assistance technique", qty: 1, category: 'Service' },
                    { name: "Fourniture matériel et déploiement", qty: 1, category: 'Matériel' }
                ];
            } else if (lang === 'en') {
                currentAnalysisItems = [
                    { name: "Consulting & Technical Support Services", qty: 1, category: 'Service' },
                    { name: "Hardware supply and deployment", qty: 1, category: 'Hardware' }
                ];
            } else {
                currentAnalysisItems = [
                    { name: "خدمات الاستشارة والدعم الفني", qty: 1, category: 'خدمات' },
                    { name: "توريد ونشر التجهيزات", qty: 1, category: 'عتاد' }
                ];
            }
        }

        // Localized Welcome Message
        var welcomeText = "";
        if (curLang === 'fr') {
            welcomeText = "Bonjour ! Je suis votre copilote IA pour les marchés et appels d'offres. Je peux analyser votre cahier des charges, optimiser vos prix avec marge, et rédiger votre lettre de soumission officielle.";
        } else if (curLang === 'en') {
            welcomeText = "Hello! I am your AI Tender & Procurement Copilot. I can analyze your specifications, benchmark competitive pricing, and draft your official bid submission documents.";
        } else {
            welcomeText = "مرحباً بك! أنا مساعدك الذكي للمناقصات والاستشارات. يمكنني مساعدتك في تفكيك دفتر الشروط، واقتراح أفضل استراتيجية تسعير تنافسية، وصياغة خطابات التقديم والعروض الفنية والمالية فورياً.";
        }

        currentCopilotMessages = [
            { role: 'assistant', content: welcomeText }
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
        var curLang = getActiveLang();
        var isRtl = curLang === 'ar';
        var div = document.createElement('div');
        div.id = 'smartPricingModal';
        div.className = 'modal-overlay';
        div.dataset.renderedLang = curLang;
        div.setAttribute('aria-hidden', 'true');
        div.style.direction = isRtl ? 'rtl' : 'ltr';

        div.innerHTML = `
            <div class="modal-card" role="dialog" aria-modal="true" style="width:min(1120px, 96vw); max-height:92vh; display:flex; flex-direction:column; padding:0; overflow:hidden; border-radius:14px; box-shadow:0 20px 40px rgba(0,0,0,0.25);">
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
                                    <div id="winProbabilityStatus" style="font-size:11px; font-weight:700; padding:4px 8px; border-radius:6px; background:#dbeafe; color:#1e40af;">${t('scoreBalanced')}</div>
                                </div>
                                <div class="progress-bar" style="height:6px; margin-top:8px; background:#bfdbfe; border-radius:3px;">
                                    <div id="winProbabilityProgress" style="height:100%; width:78%; background:#2563eb; border-radius:3px; transition:width 0.4s;"></div>
                                </div>
                            </div>

                            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px 16px;">
                                <div style="font-size:11px; font-weight:700; color:#166534; text-transform:uppercase;">${t('totalOffer')}</div>
                                <div id="smartPricingTotalVal" style="font-size:22px; font-weight:800; color:#15803d; margin-top:4px;">0.00 DZD</div>
                                <div style="font-size:11px; color:#15803d; margin-top:2px;">${t('marginIncluded')}</div>
                            </div>

                            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 16px; display:flex; flex-direction:column; justify-content:center;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <label style="font-size:12px; font-weight:700; color:#334155;"><i class="fas fa-percentage"></i> ${t('margin')}:</label>
                                    <span id="marginDisplayVal" style="font-weight:800; color:#2563eb; font-size:15px;">15%</span>
                                </div>
                                <input type="range" id="smartPricingMargin" value="15" min="2" max="45" step="1" style="width:100%; margin-top:8px; accent-color:#2563eb; cursor:pointer;" oninput="onMarginSliderChange(this.value)">
                                <div style="display:flex; justify-content:space-between; font-size:10px; color:#94a3b8; margin-top:2px;">
                                    <span>${t('marginMaxComp')}</span>
                                    <span>${t('marginBalanced')}</span>
                                    <span>${t('marginHigh')}</span>
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
                                <button class="btn btn-ghost btn-sm" onclick="autoSuggestAllBenchmarks()"><i class="fas fa-magic"></i> <span>${t('autoMatch')}</span></button>
                                <button class="btn btn-outline-primary btn-sm" onclick="printOfficialBpuDocument()"><i class="fas fa-print"></i> <span>${t('printBpu')}</span></button>
                            </div>
                            <button class="btn btn-success btn-sm" onclick="applySmartPricingToTender()"><i class="fas fa-check-circle"></i> <span>${t('applyAll')}</span></button>
                        </div>

                        <!-- Pricing Table -->
                        <div class="table-container" style="max-height:360px; overflow-y:auto; border:1px solid #e5e7eb; border-radius:10px;">
                            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                                <thead>
                                    <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                                        <th style="padding:10px 12px; text-align:${isRtl ? 'right' : 'left'};">${t('detected')}</th>
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
                            <button type="button" class="copilot-chip" onclick="askCopilotPredefined('letter')">${t('chipLetter')}</button>
                            <button type="button" class="copilot-chip" onclick="askCopilotPredefined('strategy')">${t('chipStrategy')}</button>
                            <button type="button" class="copilot-chip" onclick="askCopilotPredefined('risks')">${t('chipRisks')}</button>
                            <button type="button" class="copilot-chip" onclick="askCopilotPredefined('docs')">${t('chipDocs')}</button>
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
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <button class="btn btn-primary btn-sm" onclick="generateOfficialDraft('submission_letter')"><i class="fas fa-file-alt"></i> <span>${t('btnLetter')}</span></button>
                                <button class="btn btn-secondary btn-sm" onclick="generateOfficialDraft('bpu')"><i class="fas fa-table"></i> <span>${t('btnBpu')}</span></button>
                                <button class="btn btn-purple btn-sm" onclick="generateOfficialDraft('technical_memo')"><i class="fas fa-cogs"></i> <span>${t('btnTech')}</span></button>
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <button class="btn btn-ghost btn-sm" onclick="copyProposalDraft()"><i class="fas fa-copy"></i> <span>${t('copyClipboard')}</span></button>
                                <button class="btn btn-outline-primary btn-sm" onclick="printOfficialBpuDocument()"><i class="fas fa-print"></i> <span>${t('printBpu')}</span></button>
                                <button class="btn btn-success btn-sm" onclick="saveProposalToTenderNotes()"><i class="fas fa-save"></i> <span>${t('saveToNotes')}</span></button>
                            </div>
                        </div>

                        <div id="proposalDraftLoader" style="display:none; text-align:center; padding:30px; background:#f8fafc; border-radius:10px;">
                            <div class="fas fa-spinner fa-spin fa-2x" style="color:#2563eb;"></div>
                            <div style="margin-top:10px; font-weight:700; color:#2563eb;">${t('proposalLoader')}</div>
                        </div>

                        <textarea id="proposalDraftContent" style="width:100%; height:380px; padding:16px; border:1px solid #cbd5e1; border-radius:10px; font-family:monospace, 'Segoe UI', Tahoma; font-size:13px; line-height:1.6; resize:vertical; background:#ffffff; color:#1e293b;" placeholder="${t('proposalPlaceholder')}"></textarea>
                    </div>

                    <!-- ═══ TAB 4: SPECIFICATION AUDIT & OCR ═══ -->
                    <div id="copilotTabContentAudit" style="display:none;">
                        <div style="background:linear-gradient(135deg, #eff6ff, #f0fdf4); border:1px solid #bfdbfe; border-radius:12px; padding:16px; margin-bottom:16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                                <div>
                                    <h4 style="margin:0 0 4px 0; color:#1e40af; font-size:15px; font-weight:800;"><i class="fas fa-robot"></i> ${t('auditTitle')}</h4>
                                    <p style="margin:0; font-size:12.5px; color:#475569;">${t('auditSubtitle')}</p>
                                </div>
                                <div style="display:flex; gap:8px;">
                                    <label class="btn btn-primary btn-sm" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px; margin:0; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
                                        <i class="fas fa-robot"></i> <span>${t('auditUploadBtn')}</span>
                                        <input type="file" id="auditDocFileInput" accept=".pdf,image/*,.xlsx,.xls,.txt,.docx" style="display:none;" onchange="handleAuditFileUpload(this)">
                                    </label>
                                </div>
                            </div>
                            <div id="auditOcrStatus" style="display:none; margin-top:10px; padding:10px 14px; border-radius:8px; font-size:12.5px; font-weight:600;"></div>
                        </div>

                        <!-- Extracted Tender Metadata Card -->
                        <div id="auditTenderMetaCard" style="display:none; background:#ffffff; border:1.5px solid #93c5fd; border-radius:12px; padding:14px 18px; margin-bottom:16px; box-shadow:0 4px 12px rgba(37,99,235,0.08);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:8px; flex-wrap:wrap; gap:8px;">
                                <span style="font-size:13px; font-weight:800; color:#1e40af;"><i class="fas fa-check-circle text-success"></i> ${t('metaCardTitle')}</span>
                                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                    <button type="button" class="btn btn-success btn-sm" id="btnCreateTenderFromAudit" onclick="createTenderFromExtractedData()"><i class="fas fa-plus-circle"></i> <span>${t('btnCreateTender')}</span></button>
                                    <button type="button" class="btn btn-primary btn-sm" id="btnUpdateTenderFromAudit" style="display:none;" onclick="applyExtractedMetadataToActiveTender()"><i class="fas fa-save"></i> <span>${t('btnUpdateTender')}</span></button>
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; font-size:12.5px;">
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">${t('metaRef')}</span>
                                    <strong id="auditMetaRef" style="color:#1e40af; font-size:13.5px;">-</strong>
                                </div>
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">${t('metaTitle')}</span>
                                    <strong id="auditMetaTitle" style="color:#0f172a; font-size:13.5px;">-</strong>
                                </div>
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">${t('metaAuthority')}</span>
                                    <strong id="auditMetaAuth" style="color:#334155;">-</strong>
                                </div>
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">${t('metaDeadline')}</span>
                                    <strong id="auditMetaDeadline" style="color:#dc2626;">-</strong>
                                </div>
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">${t('metaBudget')}</span>
                                    <strong id="auditMetaBudget" style="color:#059669; font-size:13.5px;">-</strong>
                                </div>
                                <div style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0;">
                                    <span style="color:#64748b; font-size:11px; font-weight:700; display:block;">${t('metaPeriod')}</span>
                                    <strong id="auditMetaPeriod" style="color:#475569;">-</strong>
                                </div>
                            </div>
                        </div>

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                            <div>
                                <label style="display:block; font-size:13px; font-weight:700; margin-bottom:6px;">${t('docTextLabel')}</label>
                                <textarea id="auditDocTextInput" style="width:100%; height:230px; padding:12px; border:1px solid #cbd5e1; border-radius:8px; font-size:12.5px; font-family:monospace; resize:vertical;" placeholder="${t('docTextPlaceholder')}"></textarea>
                                <div style="display:flex; gap:8px; margin-top:8px;">
                                    <button class="btn btn-primary btn-sm" id="btnRunComprehensiveAudit" onclick="runComprehensiveAudit()"><i class="fas fa-magic"></i> <span>${t('startAuditBtn')}</span></button>
                                </div>
                            </div>

                            <div>
                                <label style="display:block; font-size:13px; font-weight:700; margin-bottom:6px;">${t('checklistLabel')}</label>
                                <div id="auditChecklistOutput" style="height:230px; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; font-size:12.5px;">
                                    <div style="color:#94a3b8; text-align:center; padding:40px 10px;">
                                        <i class="fas fa-tasks fa-2x" style="margin-bottom:8px;"></i>
                                        <div>${t('checklistEmpty')}</div>
                                    </div>
                                </div>
                                <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
                                    <button class="btn btn-success btn-sm" onclick="applyExtractedChecklistToTender()"><i class="fas fa-check-double"></i> <span>${t('applyChecklistBtn')}</span></button>
                                    <button class="btn btn-purple btn-sm" onclick="switchCopilotTab('pricing')"><i class="fas fa-calculator"></i> <span>${t('goToPricingBtn')}</span></button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        `;

        if (!document.getElementById('smartPricingStyleDef')) {
            var style = document.createElement('style');
            style.id = 'smartPricingStyleDef';
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
        }

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
                status.textContent = t('scoreExcellent');
                status.style.background = '#dcfce7';
                status.style.color = '#15803d';
            } else if (score >= 55) {
                status.textContent = t('scoreBalanced');
                status.style.background = '#dbeafe';
                status.style.color = '#1e40af';
            } else {
                status.textContent = t('scoreHigh');
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
        var curLang = getActiveLang();

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
                    ${benchmarks.length > 0 ? `<div style="font-size:11px; color:#64748b; margin-top:2px;"><i class="fas fa-history"></i> ${t('benchmarkRef')}${escapeHtml(benchmarks[0].customer)} (${benchmarks[0].date || ''} - ${escapeHtml(benchmarks[0].source)})</div>` : `<div style="font-size:11px; color:#94a3b8; margin-top:2px;"><i class="fas fa-info-circle"></i> ${t('benchmarkEst')}</div>`}
                </td>
                <td style="padding:8px 8px; text-align:center;">
                    <input type="number" min="1" class="form-input" value="${qty}" style="width:55px; padding:6px; font-size:13px; text-align:center; border:1px solid #cbd5e1; border-radius:6px;" onchange="updateItemQty(${idx}, this.value)">
                </td>
                <td style="padding:8px 12px; text-align:right; color:#64748b; font-weight:600;">
                    ${lastPrice > 0 ? lastPrice.toLocaleString(curLang === 'ar' ? 'ar-DZ' : 'fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) : '<span class="text-muted">—</span>'}
                </td>
                <td style="padding:8px 12px; text-align:right;">
                    <input type="number" step="0.01" class="form-input" value="${suggestedPrice.toFixed(2)}" style="width:115px; padding:6px 8px; font-size:13px; font-weight:700; color:#1e40af; text-align:right; border:1px solid #93c5fd; border-radius:6px;" onchange="updateItemPrice(${idx}, this.value)">
                </td>
                <td style="padding:8px 12px; text-align:right; font-weight:700; color:#0f766e;">
                    ${lineTotal.toLocaleString(curLang === 'ar' ? 'ar-DZ' : 'fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2})}
                </td>
                <td style="padding:8px 8px; text-align:center;">
                    <button class="btn btn-danger btn-sm" onclick="removeSmartPricingItem(${idx})" style="padding:4px 8px; border-radius:6px;" title="${t('delete')}"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        var totalEl = document.getElementById('smartPricingTotalVal');
        if (totalEl) {
            totalEl.textContent = grandTotal.toLocaleString(curLang === 'ar' ? 'ar-DZ' : 'fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' DZD';
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
        var lang = getActiveLang();
        var defaultName = (lang === 'fr') ? "Nouveau poste / Prestation spécialisée" : ((lang === 'en') ? "New item / Specialized service" : "بند جديد / خدمة متخصصة");
        currentAnalysisItems.push({ name: defaultName, qty: 1, customPrice: 15000 });
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
        var msg = (getActiveLang() === 'fr') ? 'Prix synchronisés avec les références précédentes' : ((getActiveLang() === 'en') ? 'Prices synchronized with previous sales benchmarks' : 'تمت مطابقة الأسعار مع السجلات السابقة بنجاح');
        if (window.showToast) window.showToast(msg, 'success');
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
                            <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px; font-size:11px;" onclick="copyCopilotMsg(${i})"><i class="fas fa-copy"></i> ${t('copy')}</button>
                            <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px; font-size:11px;" onclick="appendCopilotMsgToNotes(${i})"><i class="fas fa-plus"></i> ${t('appendToNotes')}</button>
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
            var msg = (getActiveLang() === 'fr') ? 'Copié dans le presse-papier' : ((getActiveLang() === 'en') ? 'Copied to clipboard' : 'تم النسخ إلى الحافظة');
            if (window.showToast) window.showToast(msg, 'success');
        }
    };

    window.appendCopilotMsgToNotes = function(idx) {
        if (currentCopilotMessages[idx] && currentActiveTenderIdx !== null) {
            var tObj = (typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
            if (tObj) {
                tObj.notes = (tObj.notes ? tObj.notes + '\n\n' : '') + '[AI Tender Copilot Note]:\n' + currentCopilotMessages[idx].content;
                if (window.saveData) window.saveData();
                var msg = (getActiveLang() === 'fr') ? 'Ajouté aux notes de l\'AO' : ((getActiveLang() === 'en') ? 'Added to tender notes' : 'تمت إضافة النص إلى ملاحظات المناقصة');
                if (window.showToast) window.showToast(msg, 'success');
            }
        }
    };

    window.askCopilotPredefined = function(type) {
        var input = document.getElementById('copilotChatInput');
        var promptText = '';
        var tObj = (currentActiveTenderIdx !== null && typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
        var tenderInfo = tObj ? `(${tObj.reference || ''} - ${tObj.title || ''})` : '';
        var lang = getActiveLang();

        if (lang === 'fr') {
            switch(type) {
                case 'letter':
                    promptText = `Rédigez une lettre de soumission officielle professionnelle pour cet appel d'offres ${tenderInfo} avec engagement sur les délais et prix.`;
                    break;
                case 'strategy':
                    promptText = `Quelle est la meilleure stratégie de prix compétitive pour remporter cet appel d'offres ${tenderInfo} tout en préservant une marge saine ?`;
                    break;
                case 'risks':
                    promptText = `Analysez les risques juridiques, clauses pénales et pénalités de retard potentielles pour cet appel d'offres ${tenderInfo}.`;
                    break;
                case 'docs':
                    promptText = `Listez l'ensemble des pièces administratives, fiscales et techniques obligatoires pour cet appel d'offres ${tenderInfo} selon la réglementation des marchés.`;
                    break;
            }
        } else if (lang === 'en') {
            switch(type) {
                case 'letter':
                    promptText = `Draft a professional official bid submission letter for this tender ${tenderInfo} committing to all terms and deadlines.`;
                    break;
                case 'strategy':
                    promptText = `What is the most effective competitive pricing strategy to win this tender ${tenderInfo} with sustainable profit margin?`;
                    break;
                case 'risks':
                    promptText = `Identify key risks, penalty clauses, and execution liabilities for this tender ${tenderInfo}.`;
                    break;
                case 'docs':
                    promptText = `Extract and list all mandatory administrative, fiscal, and technical documents required to qualify for tender ${tenderInfo}.`;
                    break;
            }
        } else {
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

        var tObj = (currentActiveTenderIdx !== null && typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
        var itemsSummary = currentAnalysisItems.map(function(i){ return `- ${i.qty}x ${i.name} (Catégorie: ${i.category||'Général'})`; }).join('\n');
        var curLang = getActiveLang();

        var systemContext = (curLang === 'fr')
            ? `Vous êtes le copilote IA spécialisé dans les appels d'offres et marchés pour Zeralda ERP.
Données de l'AO:
Titre: ${tObj ? (tObj.title || 'N/A') : 'Général'}
Référence: ${tObj ? (tObj.reference || 'N/A') : 'N/A'}
Maître d'ouvrage: ${tObj ? (tObj.authority || 'N/A') : 'N/A'}
Date limite: ${tObj ? (tObj.deadline || 'N/A') : 'N/A'}
Montant estimé: ${tObj ? (tObj.amount || 0) : 0} DZD
Postes:
${itemsSummary}
Répondez avec précision professionnelle en français.`
            : (curLang === 'en'
            ? `You are the AI Tender and Public Procurement Copilot for Zeralda ERP.
Tender details:
Title: ${tObj ? (tObj.title || 'N/A') : 'General'}
Reference: ${tObj ? (tObj.reference || 'N/A') : 'N/A'}
Contracting Authority: ${tObj ? (tObj.authority || 'N/A') : 'N/A'}
Deadline: ${tObj ? (tObj.deadline || 'N/A') : 'N/A'}
Estimated Amount: ${tObj ? (tObj.amount || 0) : 0} DZD
Items:
${itemsSummary}
Respond accurately in English with standard procurement terminology.`
            : `أنت المساعد الذكي المتخصص في الصفقات والمناقصات لبرنامج Zeralda ERP.
بيانات المناقصة الحالية:
العنوان: ${tObj ? (tObj.title || 'N/A') : 'عام'}
المرجع: ${tObj ? (tObj.reference || 'N/A') : 'N/A'}
المشتري / الجهة: ${tObj ? (tObj.authority || 'N/A') : 'N/A'}
الأجل: ${tObj ? (tObj.deadline || 'N/A') : 'N/A'}
المبلغ المقترح: ${tObj ? (tObj.amount || 0) : 0} DZD
البنود المسجلة:
${itemsSummary}
أجب باحترافية عالية باللغة العربية مع المصطلحات الرسمية المعمول بها في الصفقات العمومية.`);

        if (btn) btn.disabled = true;
        try {
            var res = await callAIChat(currentCopilotMessages, systemContext, 25000);
            if (res.ok && res.text && !isUnconfiguredAIMessage(res.text)) {
                currentCopilotMessages.push({ role: 'assistant', content: res.text });
            } else {
                // Seamless local Algerian procurement copilot fallback
                var offlineReply = generateOfflineCopilotResponse(text, tObj, currentAnalysisItems, curLang);
                currentCopilotMessages.push({ role: 'assistant', content: offlineReply });
            }
        } catch(e) {
            var offlineReply = generateOfflineCopilotResponse(text, tObj, currentAnalysisItems, curLang);
            currentCopilotMessages.push({ role: 'assistant', content: offlineReply });
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
        var curLang = getActiveLang();

        var prompt = '';
        if (docType === 'submission_letter') {
            prompt = (curLang === 'fr')
                ? `Rédigez une lettre de soumission officielle complète et prête pour signature pour le marché suivant :
Titre: ${tObj ? tObj.title : 'Marché de prestations'}
Référence: ${tObj ? tObj.reference : 'AO-2026/01'}
Maître d'ouvrage: ${tObj ? tObj.authority : 'Administration contractante'}
Montant total de l'offre: ${totalAmount} DZD. Formule juridique formelle selon le Décret présidentiel 15-247.`
                : `قم بصياغة خطاب تقديم رسمي (Lettre de Soumission) كامل وجاهز للطباعة والتوقيع لمناقصة:
العنوان: ${tObj ? tObj.title : 'صفقة خدمات وتجهيزات'}
المرجع: ${tObj ? tObj.reference : 'AO-2026/01'}
الجهة المتعاقدة: ${tObj ? tObj.authority : 'المؤسسة الوطنية / الإدارة'}
المبلغ الإجمالي للعرض: ${totalAmount} دج
الصيغة تكون رسمية وقانونية وفق النموذج المعمول به في المرسوم الرئاسي 15-247 للصفقات العمومية.`;
        } else if (docType === 'bpu') {
            var itemsList = currentAnalysisItems.map(function(it, i){
                return `Item ${i+1}: ${it.name} | Qty: ${it.qty} | Prix: ${it.customPrice || 10000} DZD`;
            }).join('\n');
            prompt = `Générez un Bordereau des Prix Unitaires et Devis Quantitatif Estimatif (BPU & DQE) structuré sous forme de tableau texte clair :
${itemsList}
Total général : ${totalAmount} DZD.`;
        } else {
            prompt = `Rédigez un Mémoire Technique et méthodologie d'exécution pour :
${tObj ? tObj.title : 'Marché'}
Comprenant: Méthodologie, planning prévisionnel, moyens humains et matériels, démarche qualité et sécurité.`;
        }

        if (loader) loader.style.display = 'block';
        textarea.value = (curLang === 'fr') ? 'Génération du document officiel en cours...' : ((curLang === 'en') ? 'Drafting official procurement document...' : 'جاري صياغة المستند الرسمي بالمعايير القانونية...');

        try {
            var aiRes = await callAIChat(prompt, "You are an executive procurement documentation officer. Provide clean, production-ready legal and technical tender documentation.", 25000);
            if (aiRes.ok && aiRes.text && !isUnconfiguredAIMessage(aiRes.text)) {
                textarea.value = aiRes.text;
            } else {
                textarea.value = generateOfflineDraftDocument(docType, tObj, currentAnalysisItems, totalAmount, curLang);
            }
        } catch (e) {
            textarea.value = generateOfflineDraftDocument(docType, tObj, currentAnalysisItems, totalAmount, curLang);
        } finally {
            if (loader) loader.style.display = 'none';
        }
    };

    window.copyProposalDraft = function() {
        var textarea = document.getElementById('proposalDraftContent');
        if (textarea && textarea.value) {
            navigator.clipboard.writeText(textarea.value);
            var msg = (getActiveLang() === 'fr') ? 'Projet d\'offre copié dans le presse-papier' : ((getActiveLang() === 'en') ? 'Draft proposal copied to clipboard' : 'تم نسخ مسودة العرض بالكامل للحافظة');
            if (window.showToast) window.showToast(msg, 'success');
        }
    };

    window.saveProposalToTenderNotes = function() {
        var textarea = document.getElementById('proposalDraftContent');
        if (textarea && textarea.value && currentActiveTenderIdx !== null) {
            var tObj = (typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
            if (tObj) {
                tObj.notes = (tObj.notes ? tObj.notes + '\n\n' : '') + '[AI Tender Proposal Draft]:\n' + textarea.value;
                if (window.saveData) window.saveData();
                var msg = (getActiveLang() === 'fr') ? 'Document enregistré dans les notes de l\'AO' : ((getActiveLang() === 'en') ? 'Document saved in tender notes' : 'تم حفظ المستند في ملاحظات المناقصة');
                if (window.showToast) window.showToast(msg, 'success');
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
            var warnMsg = (getActiveLang() === 'fr') ? 'Aucun poste à imprimer pour le BPU' : 'لا توجد بنود لطباعة جدول الأسعار BPU';
            if (window.showToast) window.showToast(warnMsg, 'warning');
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
                name: tObj ? (tObj.authority || tObj.client || 'Maître de l\'Ouvrage') : 'Maître de l\'Ouvrage',
                address: tObj ? (tObj.location || 'Algérie') : 'Algérie'
            },
            items: items,
            totalHT: totalHT,
            tvaRate: 19
        };

        if (window.UnifiedDocumentPrinter && typeof window.UnifiedDocumentPrinter.printDocument === 'function') {
            window.UnifiedDocumentPrinter.printDocument(docData, { lang: getActiveLang() === 'ar' ? 'ar' : 'fr' });
        } else if (window.ZeraldaPrintEngine && typeof window.ZeraldaPrintEngine.printHtml === 'function') {
            window.print();
        } else {
            window.print();
        }
    };


    // ── AUDIT & OCR SPECIFICATION LOGIC (Crash & Hang Protected) ──
    window.handleAuditFileUpload = async function(input) {
        if (!input.files || !input.files.length) return;
        var file = input.files[0];
        var textarea = document.getElementById('auditDocTextInput');
        var statusEl = document.getElementById('auditOcrStatus');
        var uploadLabel = input.closest('label');
        var originalLabelHtml = uploadLabel ? uploadLabel.innerHTML : '';

        function setStatus(msg, color, bg) {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.innerHTML = msg;
                statusEl.style.color = color || '#1e40af';
                statusEl.style.background = bg || '#eff6ff';
            }
        }

        var loadingMsg = (getActiveLang() === 'fr') 
            ? '<i class="fas fa-spinner fa-spin"></i> Numérisation OCR en cours... Veuillez patienter (10-25s)...'
            : '<i class="fas fa-spinner fa-spin"></i> جاري قراءة واستخراج نصوص الوثيقة ضوئياً (Tesseract OCR)... يرجى الانتظار (10-25 ثانية)...';

        setStatus(loadingMsg, '#2563eb', '#eff6ff');
        if (textarea) textarea.value = (getActiveLang() === 'fr') ? 'Numérisation et extraction en cours...' : 'جاري الفحص واستخراج النصوص...';

        if (uploadLabel) {
            uploadLabel.style.pointerEvents = 'none';
            uploadLabel.style.opacity = '0.7';
            uploadLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>' + ((getActiveLang() === 'fr') ? 'Numérisation...' : 'جاري الفحص...') + '</span>';
        }

        var isTextFile = /\.(txt|csv|tsv|json|xml)$/i.test(file.name) || (file.type && file.type.indexOf('text/') === 0);
        var extractedText = '';
        var extractionError = '';

        try {
            // 1. Try UnifiedOCR for PDF / Images / Excel / Word
            if (window.UnifiedOCR && typeof window.UnifiedOCR.extract === 'function') {
                try {
                    var ocr = await window.UnifiedOCR.extract(file, {
                        endpoint: '/api/ocr/extract',
                        allowImage: true,
                        allowPdf: true,
                        allowExcel: true,
                        allowWordTxt: true,
                        extraBody: { lang: 'ara+fra+eng' }
                    });
                    if (ocr && ocr.text && ocr.text.trim().length > 0) {
                        extractedText = ocr.text.trim();
                    }
                } catch(e) {
                    extractionError = (e && e.message) ? e.message : String(e);
                    console.warn('[Audit] UnifiedOCR extraction error:', e);
                }
            }

            // 2. If it is a text-based format and OCR was skipped or empty, read as UTF-8
            if (!extractedText && isTextFile) {
                try {
                    extractedText = await new Promise(function(resolve, reject) {
                        var reader = new FileReader();
                        reader.onload = function(evt) { resolve(String(evt.target.result || '').trim()); };
                        reader.onerror = reject;
                        reader.readAsText(file, 'utf-8');
                    });
                } catch (readErr) {
                    console.warn('[Audit] FileReader text decode failed:', readErr);
                }
            }

            // 3. Process result safely without freezing
            if (extractedText && extractedText.length > 5) {
                if (textarea) textarea.value = extractedText;
                var successNotice = (getActiveLang() === 'fr')
                    ? ('<i class="fas fa-check-circle"></i> ' + t('statusOcrSuccess') + ' (' + extractedText.length + ' caractères extraits)')
                    : ('<i class="fas fa-check-circle"></i> ' + t('statusOcrSuccess') + ' (تم استخراج ' + extractedText.length + ' حرف)');
                setStatus(successNotice, '#15803d', '#f0fdf4');
                await runComprehensiveAudit();
            } else {
                if (textarea) textarea.value = '';
                var failNotice = extractionError ? ('<i class="fas fa-exclamation-triangle"></i> ' + extractionError) : ('<i class="fas fa-exclamation-triangle"></i> ' + t('statusUnreadable'));
                setStatus(failNotice, '#b45309', '#fffbeb');
                if (window.showToast) window.showToast(extractionError || t('statusUnreadable'), 'warning');
            }
        } catch (outerErr) {
            console.error('[Audit] Unhandled error during file upload:', outerErr);
            setStatus('<i class="fas fa-times-circle"></i> ' + (outerErr.message || t('statusError')), '#b91c1c', '#fef2f2');
        } finally {
            if (uploadLabel) {
                uploadLabel.style.pointerEvents = 'auto';
                uploadLabel.style.opacity = '1';
                uploadLabel.innerHTML = originalLabelHtml;
            }
            try { input.value = ''; } catch(_) {}
        }
    };

    window.runComprehensiveAudit = async function() {
        var text = (document.getElementById('auditDocTextInput')?.value || '').trim();
        var out = document.getElementById('auditChecklistOutput');
        var statusEl = document.getElementById('auditOcrStatus');
        var btn = document.getElementById('btnRunComprehensiveAudit');

        if (!text) {
            var warnMsg = (getActiveLang() === 'fr') ? 'Veuillez coller ou téléverser le texte du cahier des charges' : 'يرجى كتابة أو رفع نص دفتر الشروط أولاً';
            if (window.showToast) window.showToast(warnMsg, 'warning');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>' + t('startAuditBtn') + '</span>';
        }

        if (out) {
            out.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#2563eb;"></i><div style="margin-top:8px; font-weight:700; color:#2563eb;">' + t('statusAuditLoading') + '</div></div>';
        }

        try {
            var extracted = await extractSpecificationsWithAI(text);
            currentExtractedMetadata = extracted || {};

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
                statusEl.textContent = t('statusAuditDone');
                statusEl.style.color = '#15803d';
                statusEl.style.background = '#f0fdf4';
            }

            if (out) {
                var html = '';
                var docs = extracted.requiredDocuments || [];
                if (docs.length) {
                    var reqTitle = (getActiveLang() === 'fr') ? `Pièces obligatoires détectées (${docs.length}) :` : ((getActiveLang() === 'en') ? `Mandatory Documents Detected (${docs.length}):` : `الوثائق الإلزامية المستخرجة (${docs.length}):`);
                    html += `<div style="font-weight:700; color:#1e40af; margin-bottom:8px;"><i class="fas fa-clipboard-check"></i> ${reqTitle}</div>`;
                    docs.forEach(function(d) {
                        html += '<div style="padding:6px 10px; background:white; border:1px solid #cbd5e1; border-radius:6px; margin-bottom:6px; display:flex; align-items:center; gap:8px;">';
                        html += '<i class="fas fa-check-circle" style="color:#16a34a;"></i> <span>' + escapeHtml(d) + '</span>';
                        html += '</div>';
                    });
                } else {
                    html = '<div style="color:#64748b;">Aucune pièce supplémentaire détectée.</div>';
                }
                out.innerHTML = html;
            }

            var toastMsg = (getActiveLang() === 'fr') ? 'Spécifications et documents extraits avec succès !' : 'تم استخراج بنود المناقصة والوثائق بنجاح!';
            if (window.showToast) window.showToast(toastMsg, 'success');
        } catch (auditErr) {
            console.error('[TenderAI] Error in runComprehensiveAudit:', auditErr);
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.textContent = t('statusError');
                statusEl.style.color = '#b91c1c';
                statusEl.style.background = '#fef2f2';
            }
            if (out) {
                out.innerHTML = '<div style="color:#b91c1c; text-align:center; padding:20px;">' + t('statusError') + '</div>';
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-magic"></i> <span>' + t('startAuditBtn') + '</span>';
            }
        }
    };

    window.createTenderFromExtractedData = function() {
        if (!currentExtractedMetadata) {
            var msg = (getActiveLang() === 'fr') ? 'Aucune donnée extraite pour créer un AO' : 'لا توجد بيانات مستخرجة لإنشاء مناقصة';
            if (window.showToast) window.showToast(msg, 'warning');
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
            var succMsg = (getActiveLang() === 'fr') ? 'Données importées depuis le Scan IA. Vérifiez les champs et enregistrez.' : 'تم استيراد كافة بيانات المناقصة من المسح الذكي. راجع الحقول واضغط حفظ.';
            if (window.showToast) window.showToast(succMsg, 'success');
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
                window.showToast('Données extraites: ' + (currentExtractedMetadata.title || ''), 'info');
            }
        }
    };

    window.applyExtractedMetadataToActiveTender = function() {
        if (!currentExtractedMetadata || currentActiveTenderIdx === null) {
            var warnMsg = (getActiveLang() === 'fr') ? 'Sélectionnez un AO à mettre à jour ou créez-en un nouveau' : 'يرجى تحديد مناقصة لتحديثها أو الضغط على إنشاء مناقصة جديدة';
            if (window.showToast) window.showToast(warnMsg, 'warning');
            return;
        }
        var tObj = (typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
        if (!tObj) return;
        if (currentExtractedMetadata.reference) tObj.reference = currentExtractedMetadata.reference;
        if (currentExtractedMetadata.title) tObj.title = currentExtractedMetadata.title;
        if (currentExtractedMetadata.authority) tObj.authority = currentExtractedMetadata.authority;
        if (currentExtractedMetadata.deadline) tObj.deadline = currentExtractedMetadata.deadline;
        if (currentExtractedMetadata.estimatedBudget > 0) tObj.amount = currentExtractedMetadata.estimatedBudget;
        if (currentExtractedMetadata.requiredDocuments && currentExtractedMetadata.requiredDocuments.length) {
            if (!Array.isArray(tObj.checklist)) tObj.checklist = [];
            currentExtractedMetadata.requiredDocuments.forEach(function(d) {
                if (!tObj.checklist.some(function(c) { return c.text === d; })) {
                    tObj.checklist.push({ text: d, done: false });
                }
            });
        }
        if (typeof window.saveData === 'function') window.saveData();
        if (typeof window.renderAll === 'function') window.renderAll();
        var succMsg = (getActiveLang() === 'fr') ? 'AO mis à jour avec succès avec les données extraites !' : 'تم تحديث بيانات المناقصة الحالية بالبيانات المستخرجة بنجاح!';
        if (window.showToast) window.showToast(succMsg, 'success');
        closeSmartPricingModal();
    };

    window.applyExtractedChecklistToTender = function() {
        if (!currentExtractedMetadata.requiredDocuments || !currentExtractedMetadata.requiredDocuments.length) {
            var warnMsg = (getActiveLang() === 'fr') ? 'Aucune pièce extraite à appliquer' : 'لا توجد وثائق مستخرجة لتطبيقها';
            if (window.showToast) window.showToast(warnMsg, 'warning');
            return;
        }

        if (currentActiveTenderIdx !== null) {
            var tObj = (typeof window.getTenderByIndex === 'function') ? window.getTenderByIndex(currentActiveTenderIdx) : null;
            if (tObj) {
                if (!Array.isArray(tObj.checklist)) tObj.checklist = [];
                currentExtractedMetadata.requiredDocuments.forEach(function(docName) {
                    if (!tObj.checklist.some(function(c) { return c.text === docName; })) {
                        tObj.checklist.push({ text: docName, done: false });
                    }
                });
                if (window.saveData) window.saveData();
                if (window.renderAll) window.renderAll();
                var succMsg = (getActiveLang() === 'fr') ? currentExtractedMetadata.requiredDocuments.length + ' pièces ajoutées à la checklist de l\'AO !' : 'تمت إضافة ' + currentExtractedMetadata.requiredDocuments.length + ' وثائق إلى قائمة جاهزية المناقصة!';
                if (window.showToast) window.showToast(succMsg, 'success');
            }
        } else {
            window._pendingOcrChecklist = currentExtractedMetadata.requiredDocuments.map(function(d){
                return { text: d, done: false };
            });
            var infoMsg = (getActiveLang() === 'fr') ? currentExtractedMetadata.requiredDocuments.length + ' pièces réservées pour le prochain AO !' : 'تم حفظ ' + currentExtractedMetadata.requiredDocuments.length + ' وثائق لاعتمادها في المناقصة الجديدة!';
            if (window.showToast) window.showToast(infoMsg, 'info');
        }
    };

    window.handleSmartPricingFileUpload = async function(input) {
        if (!input.files || !input.files.length) return;
        var file = input.files[0];
        var infoMsg = (getActiveLang() === 'fr') ? 'Extraction des postes via IA...' : 'جاري استخراج بنود المناقصة بالذكاء الاصطناعي...';
        if (window.showToast) window.showToast(infoMsg, 'info');

        var text = '';
        if (window.UnifiedOCR && typeof window.UnifiedOCR.extract === 'function') {
            try {
                var ocr = await window.UnifiedOCR.extract(file, {
                    endpoint: '/api/ocr/extract',
                    allowImage: true,
                    allowPdf: true,
                    allowExcel: true,
                    allowWordTxt: true,
                    extraBody: { lang: 'ara+fra+eng' }
                });
                text = (ocr && ocr.text) ? ocr.text : '';
            } catch(e) {
                console.warn('[SmartPricing] UnifiedOCR error:', e);
            }
        }

        try { input.value = ''; } catch(_) {}

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
                var succMsg = (getActiveLang() === 'fr') ? 'Postes extraits avec succès !' : 'تم استخراج البنود بنجاح!';
                if (window.showToast) window.showToast(succMsg, 'success');
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

    // Re-render modal when user switches language in UI
    window.addEventListener('languageChanged', function() {
        var modal = document.getElementById('smartPricingModal');
        if (modal) {
            var isOpen = modal.classList.contains('active');
            modal.remove();
            if (isOpen) {
                openSmartPricingForTender(currentActiveTenderIdx);
            }
        }
    });

})();
