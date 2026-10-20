/**
 * 🧑‍💼 HR Intelligence & Payroll Automation - Zeralda ERP
 * توفير الذكاء الاصطناعي لإدارة الموارد البشرية، الرواتب، وتتبع العقود
 */

(function () {
    const HR_INTEL_KEY = 'zeralda-hr-intelligence';
    const ATTENDANCE_KEY = 'zeralda-attendance-log';

    // ── نظام الترجمة الموحد ──
    var DICT = {
        biometricCheckOut:    { en: '✅ [Biometric] Employee {id} Checked OUT at {time}', ar: '✅ [بصمة] الموظف {id} سجّل الخروج عند {time}', fr: '✅ [Biométrie] Employé {id} enregistré SORTIE à {time}' },
        biometricCheckIn:     { en: '✅ [Biometric] Employee {id} Checked IN at {time}', ar: '✅ [بصمة] الموظف {id} سجّل الدخول عند {time}', fr: '✅ [Biométrie] Employé {id} enregistré ENTRÉE à {time}' },
        daysLabel:            { en: 'Days', ar: 'أيام', fr: 'Jours' },
        fingerprintTitle:     { en: 'Fingerprint / Check-in', ar: 'بصمة / تسجيل الحضور', fr: 'Empreinte / Pointage' },
        downloadPayslipTitle: { en: 'Download Payslip', ar: 'تحميل قسيمة الراتب', fr: 'Télécharger le bulletin de paie' },
        warning:              { en: 'Warning', ar: 'تحذير', fr: 'Avertissement' },
        critical:             { en: 'Critical', ar: 'حرج', fr: 'Critique' },
        expiring:             { en: 'Expiring', ar: 'على وشك الانتهاء', fr: 'Expirent bientôt' },
        reviewContracts:      { en: 'Review Contracts', ar: 'مراجعة العقود', fr: 'Vérifier les contrats' },
        allContractsValid:    { en: 'All Contracts Valid', ar: 'جميع العقود سارية', fr: 'Tous les contrats sont valides' },
        hrAlerts:             { en: 'HR Alerts', ar: 'تنبيهات الموارد البشرية', fr: 'Alertes RH' },
        allValidMsg:          { en: '✅ All employee contracts and documents are valid and up to date.', ar: '✅ جميع عقود الموظفين ووثائقهم سارية ومحدثة.', fr: '✅ Tous les contrats et documents des employés sont valides et à jour.' },
        complianceAlerts:     { en: '⚠️ HR Compliance Alerts:\n\n', ar: '⚠️ تنبيهات امتثال الموارد البشرية:\n\n', fr: '⚠️ Alertes de conformité RH :\n\n' },
        expired:              { en: 'EXPIRED', ar: 'منتهي', fr: 'EXPIRÉ' },
        expiresInDays:        { en: 'Expires in {days} days', ar: 'ينتهي خلال {days} يوم', fr: 'Expire dans {days} jours' }
    };
    var t = window.createRuntimeTranslator ? window.createRuntimeTranslator(DICT) : function (k) { return k; };

    // 0. Smart Biometric Simulation
    // محاكاة نظام البصمة الذكي لتسجيل الحضور والغياب
    window.simulateBiometricCheckIn = function(employeeId) {
        const attendance = safeJSONParse(ZS.getItem(ATTENDANCE_KEY), {} === '{}' ? {} : []);
        const today = new Date().toISOString().split('T')[0];
        const logTime = new Date().toLocaleTimeString();

        if (!attendance[today]) attendance[today] = {};

        if (attendance[today][employeeId]) {
            attendance[today][employeeId].checkOut = logTime;
            alert(t('biometricCheckOut', { id: employeeId, time: logTime }));
        } else {
            attendance[today][employeeId] = { checkIn: logTime, status: 'Present' };
            alert(t('biometricCheckIn', { id: employeeId, time: logTime }));
        }

        ZS.setItem(ATTENDANCE_KEY, JSON.stringify(attendance));
        window.renderSmartPayrollTable(); // تحديث الجدول فوراً
    };

    // 1. Smart Payroll Hub
    // حساب الرواتب ديناميكياً بناءً على الحضور، الغياب، والعمل الإضافي
    window.calculateSmartPayroll = function(employeeId) {
        const employees = safeJSONParse(ZS.getItem('employees-data'), [] === '{}' ? {} : []);
        const attendanceLog = safeJSONParse(ZS.getItem(ATTENDANCE_KEY), {} === '{}' ? {} : []);
        const emp = employees.find(e => e.id == employeeId);
        if (!emp) return { base:0, final:0, deductions:0, bonus:0 };

        const baseSalary = Number(emp.baseSalary || 50000);
        const dailyRate = baseSalary / 30; // حساب على أساس 30 يوم

        // حساب الحضور الحقيقي من الـ LocalStorage
        let daysPresent = 0;
        Object.keys(attendanceLog).forEach(date => {
            if (attendanceLog[date][employeeId] && attendanceLog[date][employeeId].status === 'Present') {
                daysPresent++;
            }
        });

        // إذا لم يكن لديه سجل حضور، نفترض 22 يوماً كمثال افتراضي (Default)
        if (daysPresent === 0) daysPresent = 22;

        const overtimeHours = (daysPresent > 22) ? (daysPresent - 22) * 8 : 0;
        const overtimeRate = (dailyRate / 8) * 1.5;

        const deductions = daysPresent < 22 ? (22 - daysPresent) * dailyRate : 0;
        const totalSalary = (baseSalary - deductions) + (overtimeHours * overtimeRate);

        return {
            base: baseSalary,
            final: totalSalary.toFixed(2),
            deductions: deductions.toFixed(2),
            bonus: (overtimeHours * overtimeRate).toFixed(2),
            days: daysPresent
        };
    };

    // 2. AI Contract Expiry Predictor
    // التنبؤ بانتهاء العقود وتنبيه الإدارة قبل 30 يوم عمل
    window.checkContractExpiries = function() {
        const employees = safeJSONParse(ZS.getItem('employees-data'), [] === '{}' ? {} : []);
        const now = new Date();
        const alerts = [];

        employees.forEach(emp => {
            if (emp.contractEndDate) {
                const expiry = new Date(emp.contractEndDate);
                const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

                if (diffDays <= 30 && diffDays > 0) {
                    alerts.push({ name: emp.name, days: diffDays, type: t('warning') });
                } else if (diffDays <= 0) {
                    alerts.push({ name: emp.name, days: 0, type: t('critical') });
                }
            }
        });

        return alerts;
    };

    // 3. UI Injections for HR Intelligence
    window.injectHRIntelUI = function() {
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid) {
            const alerts = window.checkContractExpiries();
            const alertCount = alerts.length;

            const existingCard = document.getElementById('hrAlertCard');
            const card = existingCard || document.createElement('div');
            card.id = 'hrAlertCard';
            card.className = 'stat-card';
            card.style.border = alertCount > 0 ? '2px solid var(--danger-color)' : '2px solid var(--info-color)';

            card.innerHTML = `
                <div class="stat-icon ${alertCount > 0 ? 'red' : 'purple'}"><i class="fas fa-file-signature"></i></div>
                <div class="stat-details" style="cursor:pointer;" onclick="showHRAlertDetails()">
                    <p data-en="HR Alerts" data-ar="تنبيهات الموارد البشرية" data-fr="Alertes RH">${t('hrAlerts')}</p>
                    <h3>${alertCount} ${t('expiring')}</h3>
                    <div class="stat-change ${alertCount > 0 ? 'negative' : 'positive'}">
                        ${alertCount > 0 ? `<i class="fas fa-exclamation-circle"></i> ${t('reviewContracts')}` : `<i class="fas fa-check"></i> ${t('allContractsValid')}`}
                    </div>
                </div>
            `;
            if (!existingCard) {
                statsGrid.appendChild(card);
            }
        }
    };

    window.showHRAlertDetails = function() {
        const alerts = window.checkContractExpiries();
        if (alerts.length === 0) {
            alert(t('allValidMsg'));
            return;
        }

        let msg = t('complianceAlerts');
        alerts.forEach(a => {
            const expiryText = a.days === 0
                ? t('expired')
                : t('expiresInDays', { days: a.days });
            msg += `• ${a.name}: ${expiryText} [${a.type}]\n`;
        });

        alert(msg);
    };

    // 4. Automated Payroll Generation UI (Mockup for Payroll Tab)
    window.renderSmartPayrollTable = function() {
        const container = document.getElementById('payrollTableBody');
        if (!container) return;

        const employees = safeJSONParse(ZS.getItem('employees-data'), [] === '{}' ? {} : []);
        container.innerHTML = '';

        employees.forEach(emp => {
            const payroll = window.calculateSmartPayroll(emp.id);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${emp.name}</td>
                <td>$${payroll.base}</td>
                <td style="color:green;">${payroll.days} ${t('daysLabel')}</td>
                <td style="color:red;">-$${payroll.deductions}</td>
                <td style="font-weight:700;">$${payroll.final}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="simulateBiometricCheckIn(${emp.id})" title="${t('fingerprintTitle')}">
                        <i class="fas fa-fingerprint"></i>
                    </button>
                    <button class="btn btn-sm btn-info" onclick="generatePayslip(${emp.id})" title="${t('downloadPayslipTitle')}">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                </td>
            `;
            container.appendChild(tr);
        });
    };

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            window.injectHRIntelUI();
            window.renderSmartPayrollTable();
        }, 1000);
    });

})();
