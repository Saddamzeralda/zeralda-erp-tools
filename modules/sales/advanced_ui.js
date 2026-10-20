/**
 * 🎨 Advanced Features UI Components
 * Export Menus - Share Options - Scheduling UI
 * Version: 1.0 | Date: 2026-02-24
 */

// Create export menu for invoice view
function createExportMenu(invoiceId) {
  const menu = document.createElement('div');
  menu.className = 'export-menu';
  menu.innerHTML = `
    <button class="btn btn-success" title="Share options" onclick="toggleExportMenu(this)">
      <i class="fas fa-share-alt"></i> Share
    </button>
    <div class="export-dropdown">
      <a href="#" onclick="event.preventDefault(); exportToCSV('invoices'); return false;">
        <i class="fas fa-file-csv"></i> Share CSV
      </a>
      <a href="#" onclick="event.preventDefault(); exportToJSON('invoices'); return false;">
        <i class="fas fa-code"></i> Share JSON (Backup)
      </a>
      <a href="#" onclick="event.preventDefault(); exportToXML('invoices'); return false;">
        <i class="fas fa-file-xml"></i> Share XML (Enterprise)
      </a>
      <a href="#" onclick="event.preventDefault(); downloadInvoicePdf(); return false;">
        <i class="fas fa-file-pdf"></i> Share PDF
      </a>
    </div>
  `;
  return menu;
}

function toggleExportMenu(button) {
  const dropdown = button.nextElementSibling;
  if (dropdown && dropdown.classList.contains('export-dropdown')) {
    dropdown.classList.toggle('active');
  }
}

// Create share menu for invoice view
function createShareMenu(invoiceId) {
  const menu = document.createElement('div');
  menu.className = 'share-menu';
  menu.innerHTML = `
    <button class="btn btn-info" title="Share options" onclick="toggleShareMenu(this)">
      <i class="fas fa-share-alt"></i> Share
    </button>
    <div class="share-dropdown">
      <button onclick="shareInvoiceViaEmail('${invoiceId}')">
        <i class="fas fa-envelope"></i> Email
      </button>
      <button onclick="shareInvoiceViaWhatsApp('${invoiceId}')">
        <i class="fab fa-whatsapp"></i> WhatsApp
      </button>
      <button onclick="copyShareableLink('${invoiceId}', 'invoice')">
        <i class="fas fa-link"></i> Copy Link
      </button>
      <button onclick="generateInvoiceQRCode('${invoiceId}')">
        <i class="fas fa-qrcode"></i> QR Code
      </button>
    </div>
  `;
  return menu;
}

function toggleShareMenu(button) {
  const dropdown = button.nextElementSibling;
  if (dropdown && dropdown.classList.contains('share-dropdown')) {
    dropdown.classList.toggle('active');
  }
}

// Create scheduling button for invoice
function createScheduleButton(invoiceId) {
  const button = document.createElement('button');
  button.className = 'btn btn-warning';
  button.innerHTML = '<i class="fas fa-clock"></i> Schedule';
  button.title = 'Schedule invoice send';
  button.onclick = function () {
    scheduleInvoiceSend(invoiceId, 'email');
  };
  return button;
}

// Create batch action toolbar
function createBatchActionToolbar() {
  const toolbar = document.createElement('div');
  toolbar.className = 'batch-action-toolbar';
  toolbar.style.display = 'none';
  toolbar.innerHTML = `
    <div style="padding: 12px; background: #f0f9ff; border-left: 4px solid #0f766e; border-radius: 8px;">
      <span id="batchCount" style="font-weight: 600;">0 invoices selected</span>
      <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-success btn-sm" onclick="batchExportCSV()">
          <i class="fas fa-file-csv"></i> Share CSV
        </button>
        <button class="btn btn-info btn-sm" onclick="sendInvoiceBatch(getSelectedInvoiceIds(), 'email')">
          <i class="fas fa-envelope"></i> Send Emails
        </button>
        <button class="btn btn-sm" style="background:#25D366;color:#fff;" onclick="sendInvoiceBatch(getSelectedInvoiceIds(), 'whatsapp')">
          <i class="fab fa-whatsapp"></i> Send WhatsApp
        </button>
        <button class="btn btn-warning btn-sm" onclick="scheduleBatchSend()">
          <i class="fas fa-clock"></i> Schedule Batch
        </button>
        <button class="btn btn-secondary btn-sm" onclick="clearBatchSelection()">
          <i class="fas fa-times"></i> Cancel
        </button>
      </div>
    </div>
  `;
  return toolbar;
}

// Batch invoice selection helper
let selectedInvoiceIds = new Set();

function toggleInvoiceSelection(invoiceId) {
  if (selectedInvoiceIds.has(invoiceId)) {
    selectedInvoiceIds.delete(invoiceId);
  } else {
    selectedInvoiceIds.add(invoiceId);
  }
  updateBatchToolbar();
}

function getSelectedInvoiceIds() {
  return Array.from(selectedInvoiceIds);
}

function clearBatchSelection() {
  selectedInvoiceIds.clear();
  updateBatchToolbar();
  document.querySelectorAll('input[type="checkbox"].invoice-select').forEach(cb => cb.checked = false);
}

function updateBatchToolbar() {
  const toolbar = document.querySelector('.batch-action-toolbar');
  if (!toolbar) return;

  const count = selectedInvoiceIds.size;
  const countEl = document.getElementById('batchCount');
  if (countEl) {
    countEl.textContent = `${count} invoice${count !== 1 ? 's' : ''} selected`;
  }

  toolbar.style.display = count > 0 ? 'block' : 'none';
}

function batchExportCSV() {
  if (selectedInvoiceIds.size === 0) {
    alert('No invoices selected');
    return;
  }

  let csv = '"Invoice #","Customer","Date","Amount","Status","Payment Method"\n';
  selectedInvoiceIds.forEach(id => {
    const invoice = invoicesData.find(i => i.id == id);
    if (invoice) {
      const customer = getCustomerById(invoice.customerId) || { name: 'Unknown' };
      csv += `"${getInvoiceDisplayNumber(invoice)}","${customer.name}","${invoice.date}","${(invoice.total || 0).toFixed(2)}","${getInvoiceComputedStatus(invoice)}","${invoice.paymentMethod || '-'}"\n`;
    }
  });

  // Share via Share Hub
  if (window.ZeraldaShareHub && typeof window.ZeraldaShareHub.sharePayload === 'function') {
    window.ZeraldaShareHub.sharePayload({
      title: `invoices_batch_${new Date().toISOString().split('T')[0]}.csv`,
      payload: csv
    });
    return;
  }
  alert('Share system is not loaded yet.');
}

function scheduleBatchSend() {
  if (selectedInvoiceIds.size === 0) {
    alert('No invoices selected');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h2>Schedule Batch Send</h2>
        <span class="close-modal" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
      </div>
      <div style="padding: 20px;">
        <div class="form-group">
          <label class="form-label">Send Method</label>
          <select id="batchScheduleMethod" class="form-select">
            <option value="email">📧 Email</option>
            <option value="both">📧 Both</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Send Date</label>
          <input type="date" id="batchScheduleDate" class="form-input" min="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label">Send Time</label>
          <input type="time" id="batchScheduleTime" class="form-input" value="09:00">
        </div>
        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="batchScheduleSpread" checked style="width: 18px; height: 18px;">
            <span>Spread sends (5 min apart) to avoid email spam filter</span>
          </label>
        </div>
        <button class="btn btn-success" style="width: 100%; margin-top: 20px;" onclick="confirmBatchScheduleSend()">
          <i class="fas fa-calendar-check"></i> Schedule ${selectedInvoiceIds.size} Invoices
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('batchScheduleDate').value = tomorrow.toISOString().split('T')[0];

  modal.addEventListener('click', function (e) {
    if (e.target === this) this.remove();
  });
}

function confirmBatchScheduleSend() {
  const method = document.getElementById('batchScheduleMethod').value;
  const date = document.getElementById('batchScheduleDate').value;
  const time = document.getElementById('batchScheduleTime').value;
  const spread = document.getElementById('batchScheduleSpread').checked;

  if (!date) {
    return alert('Please select a send date');
  }

  let scheduledCount = 0;
  const schedules = safeJSONParse(ZS.getItem('invoice-schedules'), [] === '{}' ? {} : []);

  selectedInvoiceIds.forEach((id, index) => {
    const sendDateTime = new Date(`${date}T${time}`);
    if (spread) {
      sendDateTime.setMinutes(sendDateTime.getMinutes() + index * 5);
    }

    schedules.push({
      id: generateUUID(),
      invoiceId: id,
      method: method,
      sendDateTime: sendDateTime.toISOString(),
      repeat: 'none',
      repeatUntil: null,
      reminderDaysBefore: 0,
      createdAt: new Date().toISOString(),
      status: 'pending',
      sentAt: null
    });
    scheduledCount++;
  });

  ZS.setItem('invoice-schedules', JSON.stringify(schedules));
  alert(`✅ ${scheduledCount} invoices scheduled to send`);
  clearBatchSelection();
  document.querySelector('.modal.active')?.remove();
}

// Performance monitoring functions
function initializePerformanceMonitoring() {
  const metrics = {
    dataLoadTime: 0,
    tableRenderTime: 0,
    filterResponseTime: 0,
    exportTime: 0
  };

  window.getPerformanceMetrics = function () {
    return metrics;
  };

  window.recordMetric = function (metricName, duration) {
    if (metrics.hasOwnProperty(metricName)) {
      metrics[metricName] = duration;
    }
  };

  // Measure data load time
  const startLoad = performance.now();
  window.addEventListener('load', () => {
    const loadTime = performance.now() - startLoad;
    console.log(`📊 Page load time: ${loadTime.toFixed(2)}ms`);
  });

  // Store metrics periodically
  setInterval(() => {
    const log = safeJSONParse(ZS.getItem('performance-log'), [] === '{}' ? {} : []);
    log.push({
      timestamp: new Date().toISOString(),
      metrics: { ...metrics }
    });
    if (log.length > 50) log.shift();
    ZS.setItem('performance-log', JSON.stringify(log));
  }, 60000); // Every minute
}

// Lazy loading implementation
function initializeLazyLoading() {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            img.classList.remove('lazy-load');
            img.classList.add('loaded');
            imageObserver.unobserve(img);
          }
        }
      });
    });

    document.querySelectorAll('img.lazy-load').forEach(img => imageObserver.observe(img));
  }
}

// Initialize advanced UI components
function initializeAdvancedUI() {
  initializePerformanceMonitoring();
  initializeLazyLoading();

  // Add batch toolbar to invoices table
  const invoicesTab = document.getElementById('invoices');
  if (invoicesTab && !invoicesTab.querySelector('.batch-action-toolbar')) {
    const toolbar = createBatchActionToolbar();
    invoicesTab.insertBefore(toolbar, invoicesTab.firstChild);
  }
}

// Call on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAdvancedUI);
} else {
  initializeAdvancedUI();
}

// Export functions to window
window.createExportMenu = createExportMenu;
window.createShareMenu = createShareMenu;
window.createScheduleButton = createScheduleButton;
window.toggleExportMenu = toggleExportMenu;
window.toggleShareMenu = toggleShareMenu;
window.toggleInvoiceSelection = toggleInvoiceSelection;
window.getSelectedInvoiceIds = getSelectedInvoiceIds;
window.clearBatchSelection = clearBatchSelection;
window.updateBatchToolbar = updateBatchToolbar;
window.batchExportCSV = batchExportCSV;
window.scheduleBatchSend = scheduleBatchSend;
window.confirmBatchScheduleSend = confirmBatchScheduleSend;
window.initializeAdvancedUI = initializeAdvancedUI;
