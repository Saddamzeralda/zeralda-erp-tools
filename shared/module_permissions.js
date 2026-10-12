// Unified module permissions initialization
(function() {
  function initializeModulePermissions() {
    const pathname = window.location.pathname.toLowerCase();
    let module = '';
    
    if (pathname.includes('hr_management')) {
      module = 'hr';
    } else if (pathname.includes('sales_management')) {
      module = 'sales';
    } else if (pathname.includes('inventory_management')) {
      module = 'inventory';
    } else if (pathname.includes('purchasing_management')) {
      module = 'purchasing';
    } else if (pathname.includes('finance_accounting')) {
      module = 'finance';
    } else if (pathname.includes('crm_management')) {
      module = 'crm';
    } else if (pathname.includes('services_management')) {
      module = 'services';
    }
    
    if (module && window.applyModuleActionRestrictions) {
      document.addEventListener('DOMContentLoaded', function() {
        window.applyModuleActionRestrictions(module);
      });
    }
  }
  
  // Initialize on script load
  initializeModulePermissions();
  
  // Re-initialize when shared layout loads
  document.addEventListener('sharedLayoutLoaded', function() {
    initializeModulePermissions();
  });
})();
