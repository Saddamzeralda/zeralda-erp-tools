(function () {
  function t(key, fallback) {
    try {
      return typeof window.tr === 'function' ? window.tr(key, fallback) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function getActiveModal() {
    return document.querySelector('.modal.active');
  }

  function getCustomerFormState() {
    return {
      name: (document.getElementById('newCustomerName')?.value || '').trim(),
      email: (document.getElementById('newCustomerEmail')?.value || '').trim(),
      phone: (document.getElementById('newCustomerPhone')?.value || '').trim(),
      city: (document.getElementById('newCustomerCity')?.value || '').trim(),
      type: (document.getElementById('newCustomerType')?.value || 'natural').trim(),
      rc: (document.getElementById('newCustomerRC')?.value || '').trim(),
      nif: (document.getElementById('newCustomerNIF')?.value || '').trim(),
      nis: (document.getElementById('newCustomerNIS')?.value || '').trim(),
      ai: (document.getElementById('newCustomerAI')?.value || '').trim(),
      art: (document.getElementById('newCustomerART')?.value || '').trim()
    };
  }

  function hasUnsavedCustomerChanges() {
    if (!customerFormInitialState) return false;
    try {
      return JSON.stringify(getCustomerFormState()) !== JSON.stringify(customerFormInitialState);
    } catch (err) {
      return false;
    }
  }

  function getInvoiceFormState() {
    return {
      date: document.getElementById('invoiceDate')?.value || '',
      customer: document.getElementById('invoiceCustomer')?.value || '',
      paymentMethod: document.getElementById('invoicePaymentMethod')?.value || '',
      stampRate: document.getElementById('invoiceStampRate')?.value || '1',
      includeTax: !!document.getElementById('invoiceIncludeTax')?.checked,
      taxRate: document.getElementById('invoiceTaxRate')?.value || '',
      items: (invoiceItemsArray || []).map(i => ({
        productId: i.productId || 0,
        description: i.description || '',
        quantity: Number(i.quantity || 0),
        price: Number(i.price || 0),
        total: Number(i.total || 0),
        unit: i.unit || 'unit'
      }))
    };
  }

  function hasUnsavedInvoiceChanges() {
    if (!invoiceFormInitialState) return false;
    try {
      return JSON.stringify(getInvoiceFormState()) !== JSON.stringify(invoiceFormInitialState);
    } catch (err) {
      return false;
    }
  }

  function getProformaFormState() {
    return {
      date: document.getElementById('proformaDate')?.value || '',
      customer: document.getElementById('proformaCustomer')?.value || '',
      includeTax: !!document.getElementById('proformaIncludeTax')?.checked,
      taxRate: document.getElementById('proformaTaxRate')?.value || '',
      notes: document.getElementById('proformaNotes')?.value || '',
      items: (proformaItemsArray || []).map(i => ({
        productId: i.productId || 0,
        description: i.description || '',
        quantity: Number(i.quantity || 0),
        price: Number(i.price || 0),
        total: Number(i.total || 0),
        unit: i.unit || 'unit'
      }))
    };
  }

  function hasUnsavedProformaChanges() {
    if (!proformaFormInitialState) return false;
    try {
      return JSON.stringify(getProformaFormState()) !== JSON.stringify(proformaFormInitialState);
    } catch (err) {
      return false;
    }
  }

  // حفظ حالة الفلاتر عند فتح نافذة المعاينة - تم حذف الفلاتر
  var savedFilterState = null;

  function saveFilterState() {
    // Filter elements have been removed
    savedFilterState = null;
  }

  function restoreFilterState() {
    // Filter elements have been removed
    savedFilterState = null;
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    const current = getActiveModal();
    if (current && current !== modal) {
      modal.dataset.prevModalId = current.id;
      if (document.activeElement && current.contains(document.activeElement)) document.activeElement.blur();
      current.classList.remove('active');
      current.setAttribute('aria-hidden', 'true');
    }

    modal._previouslyFocusedElement = document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    // حفظ حالة الفلاتر عند فتح نافذة المعاينة
    if (id === 'viewInvoiceModal' || id === 'viewProformaModal') {
      saveFilterState();
    }

    const main = document.querySelector('.main-content');
    if (main) {
      if ('inert' in HTMLElement.prototype) main.inert = true;
      else main.setAttribute('aria-hidden', 'true');
    }

    const first = modal.querySelector("input, select, textarea, button, [tabindex]:not([tabindex='-1'])");
    if (first) setTimeout(() => first.focus(), 10);
    else {
      if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
      setTimeout(() => modal.focus(), 10);
    }

    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    if (id === 'addCustomerModal' && !customerModalForceClose && hasUnsavedCustomerChanges()) {
      if (!confirm(t('unsaved_customer_changes_confirm', '⚠️ You have unsaved customer changes. Close without saving?'))) return;
    }
    if (id === 'createInvoiceModal' && !invoiceModalForceClose && hasUnsavedInvoiceChanges()) {
      if (!confirm(t('unsaved_invoice_changes_confirm', '⚠️ You have unsaved invoice changes. Close without saving?'))) return;
    }
    if (id === 'createProformaModal' && !proformaModalForceClose && hasUnsavedProformaChanges()) {
      if (!confirm(t('unsaved_proforma_changes_confirm', '⚠️ You have unsaved proforma changes. Close without saving?'))) return;
    }

    const prevId = modal.dataset.prevModalId;

    // Move focus out of the modal BEFORE hiding it to avoid aria-hidden focus warning
    try {
      const prev = modal._previouslyFocusedElement;
      if (prev && typeof prev.focus === 'function') prev.focus();
      else if (document.activeElement && modal.contains(document.activeElement)) document.activeElement.blur();
    } catch (err) {}

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');

    if (prevId) {
      delete modal.dataset.prevModalId;
      const prevModal = document.getElementById(prevId);
      if (prevModal) {
        prevModal.classList.add('active');
        prevModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        return;
      }
    }

    const main = document.querySelector('.main-content');
    if (main) {
      if ('inert' in HTMLElement.prototype) main.inert = false;
      else main.removeAttribute('aria-hidden');
    }
    document.body.style.overflow = '';

    if (id === 'createInvoiceModal') {
      isEditingInvoice = false;
      editingInvoiceId = null;
      invoiceFormInitialState = null;
      invoiceModalForceClose = false;
      const t = translations[ZS.getItem('preferred-language') || 'en'] || {};
      const saveBtnText = document.getElementById('saveInvoiceBtnText');
      if (saveBtnText) saveBtnText.textContent = t.save_invoice || 'Save Invoice';
      // إعادة تحميل البيانات من localStorage ثم تحديث الجدول
      try {
        var storedInv = ZS.getItem('invoices-data');
        if (storedInv) {
          var parsedInv = JSON.parse(storedInv);
          if (Array.isArray(parsedInv) && parsedInv.length > 0) {
            window.invoicesData = parsedInv;
          }
        }
      } catch(e) {}
      setTimeout(function() {
        try { if (typeof loadInvoicesTable === 'function') loadInvoicesTable(); } catch(e) {}
        try { if (typeof updateStats === 'function') updateStats(); } catch(e) {}
      }, 150);
    }

    if (id === 'viewInvoiceModal') {
      // معاينة الفاتورة لا تغير البيانات - لا حاجة لإعادة تحميل الجدول
      // استعادة حالة الفلاتر لتجنب أي تغيير عرضي
      restoreFilterState();
    }

    if (id === 'createProformaModal') {
      isEditingProforma = false;
      editingProformaId = null;
      proformaFormInitialState = null;
      proformaModalForceClose = false;
      const saveProformaBtnText = document.getElementById('saveProformaBtnText');
      if (saveProformaBtnText) {
        saveProformaBtnText.textContent = t('save_proforma', 'Save Proforma');
      }
      // إعادة تحميل جدول الفواتير الأولية بعد إغلاق Modal
      if (typeof loadProformasTable === 'function') {
        setTimeout(function() { loadProformasTable(); }, 100);
      }
    }

    if (id === 'viewProformaModal') {
      // معاينة الفاتورة الشكلية لا تغير البيانات - لا حاجة لإعادة تحميل الجدول
      restoreFilterState();
    }

    if (id === 'addCustomerModal') {
      resetCustomerModalState();
      const form = document.getElementById('addCustomerForm');
      if (form) form.reset();
      const typeSel = document.getElementById('newCustomerType');
      if (typeSel) typeSel.value = 'natural';
      toggleCustomerBusinessFields();
    }
  }

  function resetCustomerModalState() {
    isEditingCustomer = false;
    editingCustomerId = null;
    customerFormInitialState = null;
    customerModalForceClose = false;
    const titleEl = document.getElementById('addCustomerModalTitle');
    const submitEl = document.getElementById('addCustomerSubmitText');
    if (titleEl) titleEl.textContent = t('add_customer', 'Add Customer');
    if (submitEl) submitEl.textContent = t('add_customer', 'Add Customer');
  }

  function toggleCustomerBusinessFields() {
    const wrap = document.getElementById('customerBusinessFields');
    const typeSel = document.getElementById('newCustomerType');
    if (!wrap || !typeSel) return;
    wrap.style.display = typeSel.value === 'legal' ? '' : 'none';
  }

  function openAddCustomerModal() {
    resetCustomerModalState();
    const form = document.getElementById('addCustomerForm');
    if (form) form.reset();
    const typeSel = document.getElementById('newCustomerType');
    if (typeSel) typeSel.value = 'natural';
    toggleCustomerBusinessFields();
    customerFormInitialState = getCustomerFormState();
    openModal('addCustomerModal');
  }

  function openAddCustomerFor(selectId) {
    window._customerTargetSelect = selectId;
    openAddCustomerModal();
  }

  function editCustomer(customerId) {
    const customer = (customersData || []).find(c => String(c.id) === String(customerId));
    if (!customer) {
      alert(t('customer_not_found', 'Customer not found!'));
      return;
    }

    isEditingCustomer = true;
    editingCustomerId = customer.id;

    const titleEl = document.getElementById('addCustomerModalTitle');
    const submitEl = document.getElementById('addCustomerSubmitText');
    if (titleEl) titleEl.textContent = t('edit_customer', 'Edit Customer');
    if (submitEl) submitEl.textContent = t('update_customer', 'Update Customer');

    const form = document.getElementById('addCustomerForm');
    if (form) form.reset();

    document.getElementById('newCustomerName').value = customer.name || '';
    document.getElementById('newCustomerEmail').value = customer.email || '';
    document.getElementById('newCustomerPhone').value = customer.phone || '';
    document.getElementById('newCustomerCity').value = customer.city || '';

    const typeSel = document.getElementById('newCustomerType');
    if (typeSel) typeSel.value = customer.customerType || (customer.isCompany ? 'legal' : 'natural');

    document.getElementById('newCustomerRC').value = customer.rc || '';
    document.getElementById('newCustomerNIF').value = customer.nif || '';
    document.getElementById('newCustomerNIS').value = customer.nis || '';
    document.getElementById('newCustomerAI').value = customer.ai || '';
    document.getElementById('newCustomerART').value = customer.art || '';

    toggleCustomerBusinessFields();
    customerFormInitialState = getCustomerFormState();
    openModal('addCustomerModal');
  }

  function getCurrentUserKey() {
    try {
      const raw = ZS.getItem('zeralda-settings');
      if (raw) {
        const settings = JSON.parse(raw);
        const users = settings && Array.isArray(settings.users) ? settings.users : [];
        const activeId = settings && settings.activeUserId ? settings.activeUserId : null;
        const activeUser = users.find(u => u.id === activeId) || null;
        if (activeUser && activeUser.id) return String(activeUser.id);
      }
    } catch (err) {}

    const userNameEl = document.querySelector('.user-info div div');
    const name = (userNameEl && userNameEl.textContent) ? userNameEl.textContent : 'default';
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function getDraftStorageKey(type) {
    const userKey = getCurrentUserKey() || 'default';
    return type + '-draft-' + userKey;
  }

  function getDraftStatusText(mode, meta) {
    if (mode === 'saved_at') return t('draft_saved_at', 'Draft saved at') + ' ' + (meta || '');
    if (mode === 'loaded') return t('draft_loaded', 'Draft loaded');
    if (mode === 'cleared') return t('draft_cleared', 'Draft cleared');
    if (mode === 'available') return t('draft_available', 'Draft available');
    return t('no_saved_draft', 'No saved draft');
  }

  function syncDraftUI(type, statusMode, statusMeta) {
    const statusId = type === 'invoice' ? 'invoiceDraftStatus' : 'proformaDraftStatus';
    const loadBtnId = type === 'invoice' ? 'invoiceLoadDraftBtn' : 'proformaLoadDraftBtn';
    const clearBtnId = type === 'invoice' ? 'invoiceClearDraftBtn' : 'proformaClearDraftBtn';
    const hasDraft = !!ZS.getItem(getDraftStorageKey(type));

    const loadBtn = document.getElementById(loadBtnId);
    const clearBtn = document.getElementById(clearBtnId);
    const status = document.getElementById(statusId);

    if (loadBtn) loadBtn.disabled = !hasDraft;
    if (clearBtn) clearBtn.disabled = !hasDraft;

    if (status) {
      const mode = statusMode || (hasDraft ? 'available' : 'none');
      status.dataset.mode = mode;
      if (statusMeta !== undefined) status.dataset.meta = String(statusMeta);
      else if (mode !== 'saved_at') delete status.dataset.meta;
      const meta = status.dataset.meta || '';
      status.textContent = getDraftStatusText(mode, meta);
    }
  }

  function refreshDraftStatusLanguage() {
    ['invoice', 'proforma'].forEach(type => {
      const statusId = type === 'invoice' ? 'invoiceDraftStatus' : 'proformaDraftStatus';
      const statusEl = document.getElementById(statusId);
      const mode = statusEl ? (statusEl.dataset.mode || '') : '';
      const meta = statusEl ? (statusEl.dataset.meta || '') : '';
      syncDraftUI(type, mode || undefined, meta || undefined);
    });
  }

  window.getActiveModal = getActiveModal;
  window.getCustomerFormState = getCustomerFormState;
  window.hasUnsavedCustomerChanges = hasUnsavedCustomerChanges;
  window.getInvoiceFormState = getInvoiceFormState;
  window.hasUnsavedInvoiceChanges = hasUnsavedInvoiceChanges;
  window.getProformaFormState = getProformaFormState;
  window.hasUnsavedProformaChanges = hasUnsavedProformaChanges;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.resetCustomerModalState = resetCustomerModalState;
  window.toggleCustomerBusinessFields = toggleCustomerBusinessFields;
  window.openAddCustomerModal = openAddCustomerModal;
  window.openAddCustomerFor = openAddCustomerFor;
  window.editCustomer = editCustomer;
  window.getCurrentUserKey = getCurrentUserKey;
  window.getDraftStorageKey = getDraftStorageKey;
  window.getDraftStatusText = getDraftStatusText;
  window.syncDraftUI = syncDraftUI;
  window.refreshDraftStatusLanguage = refreshDraftStatusLanguage;

  window.SalesUiDraftsModule = {
    openModal: openModal,
    closeModal: closeModal,
    syncDraftUI: syncDraftUI
  };
})();
