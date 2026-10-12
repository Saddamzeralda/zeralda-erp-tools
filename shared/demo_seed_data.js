/**
 * Demo Data Seeder — PERMANENTLY DISABLED
 * Demo data seeding has been removed from the application.
 * This stub keeps the window.ZeraldaDemoSeed API available so that
 * settings.html and other references don't throw errors.
 */

(function() {
  'use strict';

  // Permanently disable demo data seeding
  try { ZS.setItem('zeralda-demo-seeding', 'disabled'); } catch (_) {}

  window.ZeraldaDemoSeed = {
    ensure: function() { return; },
    _seedAllData: function() { return; },

    /**
     * Orchestrate seeding of all modules
     */
    _seedAllData: function() {
      this._seedCompanies();
      this._seedUsers();
      this._seedEmployees();
      this._seedCustomers();
      this._seedSuppliers();
      this._seedProducts();
      this._seedServices();
      this._seedInvoices();
      this._seedProformas();
      this._seedPurchaseOrders();
      this._seedAccounts();
      this._seedTransactions();
      this._seedJournalEntries();
      this._seedExpenses();
      this._seedStockMovements();
      this._seedServiceAppointments();
      this._seedLeads();
      this._seedOpportunities();
      this._seedContacts();
      this._seedTenders();
      this._seedProjects();
      this._seedProposals();
      this._seedConsultations();
    },

    // ─────────────────────────────────────────────────────────────────────
    // CORE SETUP DATA
    // ─────────────────────────────────────────────────────────────────────

    _seedCompanies: function() {
      // RADICAL FIX: seed into zeralda-settings.companies (canonical source)
      // with zeralda-companies as a shadow for backward compat.
      var settings = {};
      try { settings = JSON.parse(ZS.getItem('zeralda-settings') || '{}'); } catch(e) {}
      if (Array.isArray(settings.companies) && settings.companies.length) return;
      const companies = [
        {
          id: 'corp-001',
          name: 'Main Office',
          taxId: 'TAX-001',
          website: 'https://www.zeralda-erp.dz',
          phone: '+213 23 123 4567',
          email: 'info@zeralda-erp.dz',
          address: '123 Business Street',
          city: 'Algiers',
          country: 'Algeria'
        }
      ];
      settings.companies = companies;
      ZS.setItem('zeralda-settings', JSON.stringify(settings));
      // Shadow for backward compat
      ZS.setItem('zeralda-companies', JSON.stringify(companies));
    },

    _seedUsers: function() {
      // RADICAL FIX: seed into zeralda-settings.users (canonical source)
      var settings = {};
      try { settings = JSON.parse(ZS.getItem('zeralda-settings') || '{}'); } catch(e) {}
      if (Array.isArray(settings.users) && settings.users.length) return;
      const users = [
        {
          id: 'user-001',
          name: 'Admin User',
          email: 'admin@zeralda-erp.dz',
          role: 'administrator',
          permissions: ['all']
        },
        {
          id: 'user-002',
          name: 'Sales Manager',
          email: 'sales@zeralda-erp.dz',
          role: 'sales_manager',
          permissions: ['sales', 'crm', 'reports']
        },
        {
          id: 'user-003',
          name: 'Inventory Manager',
          email: 'inventory@zeralda-erp.dz',
          role: 'inventory_manager',
          permissions: ['inventory', 'stock', 'reports']
        },
        {
          id: 'user-004',
          name: 'Finance Manager',
          email: 'finance@zeralda-erp.dz',
          role: 'finance_manager',
          permissions: ['finance', 'accounting', 'reports']
        },
        {
          id: 'user-005',
          name: 'HR Manager',
          email: 'hr@zeralda-erp.dz',
          role: 'hr_manager',
          permissions: ['hr', 'employees', 'reports']
        }
      ];
      settings.users = users;
      ZS.setItem('zeralda-settings', JSON.stringify(settings));
      // Shadow for backward compat
      ZS.setItem('zeralda-users', JSON.stringify(users));
    },

    // ─────────────────────────────────────────────────────────────────────
    // HR MODULE DATA
    // ─────────────────────────────────────────────────────────────────────

    _seedEmployees: function() {
      if (ZS.getItem('employees-data')) return;
      const employees = [
        {
          id: 'EMP-001',
          name: 'Ahmed Bouhamed',
          email: 'ahmed@zeralda-erp.dz',
          phone: '+213 555 123 456',
          position: 'General Manager',
          department: 'Executive',
          salary: 150000,
          joinDate: '2020-01-15',
          status: 'active'
        },
        {
          id: 'EMP-002',
          name: 'Fatima Saadoun',
          email: 'fatima@zeralda-erp.dz',
          phone: '+213 555 234 567',
          position: 'Sales Manager',
          department: 'Sales',
          salary: 85000,
          joinDate: '2020-06-10',
          status: 'active'
        },
        {
          id: 'EMP-003',
          name: 'Mohamed Karim',
          email: 'karim@zeralda-erp.dz',
          phone: '+213 555 345 678',
          position: 'Accountant',
          department: 'Finance',
          salary: 65000,
          joinDate: '2021-03-20',
          status: 'active'
        },
        {
          id: 'EMP-004',
          name: 'Sophia Laurent',
          email: 'sophia@zeralda-erp.dz',
          phone: '+213 555 456 789',
          position: 'Inventory Manager',
          department: 'Operations',
          salary: 72000,
          joinDate: '2020-09-05',
          status: 'active'
        },
        {
          id: 'EMP-005',
          name: 'Amina Cherifi',
          email: 'amina@zeralda-erp.dz',
          phone: '+213 555 567 890',
          position: 'HR Specialist',
          department: 'Human Resources',
          salary: 58000,
          joinDate: '2021-01-15',
          status: 'active'
        }
      ];
      ZS.setItem('employees-data', JSON.stringify(employees));
    },

    // ─────────────────────────────────────────────────────────────────────
    // CRM & SALES DATA
    // ─────────────────────────────────────────────────────────────────────

    _seedCustomers: function() {
      if (ZS.getItem('customers-data')) return;
      const customers = [
        {
          id: 'CUST-001',
          name: 'Tech Solutions Algeria',
          type: 'business',
          email: 'contact@techsol.dz',
          phone: '+213 21 123 4567',
          city: 'Algiers',
          country: 'Algeria',
          taxId: 'TAX-TECH-001',
          website: 'https://techsol.dz',
          status: 'active',
          creditLimit: 500000
        },
        {
          id: 'CUST-002',
          name: 'Global Import Export Ltd',
          type: 'business',
          email: 'info@globalimport.com',
          phone: '+213 23 555 6789',
          city: 'Constantine',
          country: 'Algeria',
          taxId: 'TAX-GLOBAL-001',
          website: 'https://globalimport.com',
          status: 'active',
          creditLimit: 750000
        },
        {
          id: 'CUST-003',
          name: 'Retail Plus Store',
          type: 'business',
          email: 'sales@retailplus.dz',
          phone: '+213 34 777 8899',
          city: 'Oran',
          country: 'Algeria',
          taxId: 'TAX-RETAIL-001',
          website: 'https://retailplus.dz',
          status: 'active',
          creditLimit: 300000
        },
        {
          id: 'CUST-004',
          name: 'Manufacturing Corp',
          type: 'business',
          email: 'procurement@manuf.com',
          phone: '+213 41 222 3333',
          city: 'Tlemcen',
          country: 'Algeria',
          status: 'active',
          creditLimit: 1000000
        },
        {
          id: 'CUST-005',
          name: 'Hassan Mohammed',
          type: 'individual',
          email: 'hassan.m@email.com',
          phone: '+213 555 888 9999',
          city: 'Algiers',
          country: 'Algeria',
          status: 'active',
          creditLimit: 100000
        }
      ];
      ZS.setItem('customers-data', JSON.stringify(customers));
    },

    _seedSuppliers: function() {
      if (ZS.getItem('suppliers-data')) return;
      const suppliers = [
        {
          id: 'SUP-001',
          name: 'Industrial Supplies Ltd',
          email: 'sales@indsup.com',
          phone: '+212 5 2222 3333',
          city: 'Casablanca',
          country: 'Morocco',
          taxId: 'TAX-SUP-001',
          paymentTerms: 'Net 30',
          status: 'active'
        },
        {
          id: 'SUP-002',
          name: 'Mediterranean Trading Co',
          email: 'trade@medtrading.eu',
          phone: '+39 6 555 666 777',
          city: 'Rome',
          country: 'Italy',
          paymentTerms: 'Net 45',
          status: 'active'
        },
        {
          id: 'SUP-003',
          name: 'Asian Manufacturing Hub',
          email: 'export@asianmfg.com',
          phone: '+86 10 8888 9999',
          city: 'Shanghai',
          country: 'China',
          paymentTerms: 'Net 60',
          status: 'active'
        },
        {
          id: 'SUP-004',
          name: 'Local Producers Cooperative',
          email: 'info@localcoop.dz',
          phone: '+213 21 123 4567',
          city: 'Algiers',
          country: 'Algeria',
          paymentTerms: 'COD',
          status: 'active'
        }
      ];
      ZS.setItem('suppliers-data', JSON.stringify(suppliers));
    },

    _seedLeads: function() {
      if (ZS.getItem('leads-data')) return;
      const leads = [
        {
          id: 'LEAD-001',
          name: 'Future Enterprises',
          email: 'info@future-ent.com',
          phone: '+213 21 999 8888',
          source: 'website',
          status: 'new',
          value: 250000
        },
        {
          id: 'LEAD-002',
          name: 'Smart Solutions Inc',
          email: 'contact@smartsol.com',
          phone: '+213 23 666 7777',
          source: 'referral',
          status: 'contacted',
          value: 180000
        },
        {
          id: 'LEAD-003',
          name: 'Innovation Labs',
          email: 'sales@innovatelabs.com',
          phone: '+213 34 555 4444',
          source: 'trade_show',
          status: 'qualified',
          value: 420000
        }
      ];
      ZS.setItem('leads-data', JSON.stringify(leads));
    },

    _seedOpportunities: function() {
      if (ZS.getItem('opportunities-data')) return;
      const opportunities = [
        {
          id: 'OPP-001',
          name: 'Enterprise Software License',
          customerId: 'CUST-001',
          stage: 'proposal',
          probability: 75,
          value: 500000,
          closingDate: '2026-04-30'
        },
        {
          id: 'OPP-002',
          name: 'Annual Support Contract',
          customerId: 'CUST-002',
          stage: 'negotiation',
          probability: 60,
          value: 300000,
          closingDate: '2026-05-15'
        },
        {
          id: 'OPP-003',
          name: 'Consulting Project',
          customerId: 'CUST-004',
          stage: 'discovery',
          probability: 40,
          value: 250000,
          closingDate: '2026-06-30'
        }
      ];
      ZS.setItem('opportunities-data', JSON.stringify(opportunities));
    },

    _seedContacts: function() {
      if (ZS.getItem('contacts-data')) return;
      const contacts = [
        {
          id: 'CON-001',
          name: 'Dr. Ibrahim Bensalah',
          email: 'i.bensalah@techsol.dz',
          phone: '+213 555 100 001',
          customerId: 'CUST-001',
          title: 'CTO',
          type: 'business'
        },
        {
          id: 'CON-002',
          name: 'Nadia Moussa',
          email: 'n.moussa@globalimport.com',
          phone: '+213 555 200 002',
          customerId: 'CUST-002',
          title: 'Procurement Manager',
          type: 'business'
        },
        {
          id: 'CON-003',
          name: 'Youssef Hamidi',
          email: 'youssef@retailplus.dz',
          phone: '+213 555 300 003',
          customerId: 'CUST-003',
          title: 'Store Manager',
          type: 'business'
        }
      ];
      ZS.setItem('contacts-data', JSON.stringify(contacts));
    },

    // ─────────────────────────────────────────────────────────────────────
    // PRODUCTS & INVENTORY DATA
    // ─────────────────────────────────────────────────────────────────────

    _seedProducts: function() {
      if (ZS.getItem('products-data')) return;
      const products = [
        {
          id: 'PRD-001',
          code: 'SOFT-001',
          name: 'ERP System License - 1 Year',
          category: 'Software',
          price: 50000,
          cost: 20000,
          quantity: 100,
          unit: 'license',
          taxable: true,
          taxRate: 19
        },
        {
          id: 'PRD-002',
          code: 'HARD-001',
          name: 'Server Hardware - 2TB Storage',
          category: 'Hardware',
          price: 150000,
          cost: 90000,
          quantity: 25,
          unit: 'unit',
          taxable: true,
          taxRate: 19
        },
        {
          id: 'PRD-003',
          code: 'SRV-001',
          name: 'Annual Maintenance Support',
          category: 'Services',
          price: 30000,
          cost: 10000,
          quantity: 50,
          unit: 'contract',
          taxable: true,
          taxRate: 19
        },
        {
          id: 'PRD-004',
          code: 'CONS-001',
          name: 'Desktop Computer',
          category: 'Hardware',
          price: 75000,
          cost: 45000,
          quantity: 40,
          unit: 'unit',
          taxable: true,
          taxRate: 19
        },
        {
          id: 'PRD-005',
          code: 'OFF-001',
          name: 'Office Supplies Pack',
          category: 'Supplies',
          price: 5000,
          cost: 2000,
          quantity: 200,
          unit: 'box',
          taxable: true,
          taxRate: 19
        }
      ];
      ZS.setItem('products-data', JSON.stringify(products));
    },

    _seedStockMovements: function() {
      if (ZS.getItem('stock-movements')) return;
      const movements = [
        {
          id: 'MOV-001',
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          productId: 'PRD-001',
          type: 'in',
          quantity: 50,
          reference: 'GRN-001'
        },
        {
          id: 'MOV-002',
          date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          productId: 'PRD-002',
          type: 'in',
          quantity: 10,
          reference: 'PO-001'
        },
        {
          id: 'MOV-003',
          date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          productId: 'PRD-001',
          type: 'out',
          quantity: 5,
          reference: 'INV-001'
        },
        {
          id: 'MOV-004',
          date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          productId: 'PRD-003',
          type: 'out',
          quantity: 3,
          reference: 'INV-002'
        }
      ];
      ZS.setItem('stock-movements', JSON.stringify(movements));
    },

    // ─────────────────────────────────────────────────────────────────────
    // SALES DATA (INVOICES & PROFORMAS)
    // ─────────────────────────────────────────────────────────────────────

    _seedInvoices: function() {
      if (ZS.getItem('invoices-data')) return;
      const invoices = [
        {
          id: 'INV-001',
          number: 'INV-2026-0001',
          customerId: 'CUST-001',
          date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: [
            { productId: 'PRD-001', quantity: 1, unitPrice: 50000, discount: 0 }
          ],
          subtotal: 50000,
          taxAmount: 9500,
          total: 59500,
          status: 'paid',
          paymentDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        },
        {
          id: 'INV-002',
          number: 'INV-2026-0002',
          customerId: 'CUST-002',
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: [
            { productId: 'PRD-002', quantity: 1, unitPrice: 150000, discount: 5000 },
            { productId: 'PRD-003', quantity: 2, unitPrice: 30000, discount: 0 }
          ],
          subtotal: 210000,
          taxAmount: 39900,
          total: 249900,
          status: 'sent'
        },
        {
          id: 'INV-003',
          number: 'INV-2026-0003',
          customerId: 'CUST-003',
          date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: [
            { productId: 'PRD-004', quantity: 2, unitPrice: 75000, discount: 0 },
            { productId: 'PRD-005', quantity: 3, unitPrice: 5000, discount: 0 }
          ],
          subtotal: 165000,
          taxAmount: 31350,
          total: 196350,
          status: 'draft'
        }
      ];
      ZS.setItem('invoices-data', JSON.stringify(invoices));
    },

    _seedProformas: function() {
      if (ZS.getItem('proformas-data')) return;
      const proformas = [
        {
          id: 'PROF-001',
          number: 'PROF-2026-0001',
          customerId: 'CUST-004',
          date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          validUntil: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: [
            { productId: 'PRD-001', quantity: 5, unitPrice: 50000, discount: 5000 }
          ],
          subtotal: 245000,
          taxAmount: 46550,
          total: 291550,
          status: 'sent'
        },
        {
          id: 'PROF-002',
          number: 'PROF-2026-0002',
          customerId: 'CUST-001',
          date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          validUntil: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: [
            { productId: 'PRD-003', quantity: 10, unitPrice: 30000, discount: 0 }
          ],
          subtotal: 300000,
          taxAmount: 57000,
          total: 357000,
          status: 'draft'
        }
      ];
      ZS.setItem('proformas-data', JSON.stringify(proformas));
    },

    // ─────────────────────────────────────────────────────────────────────
    // PURCHASING DATA
    // ─────────────────────────────────────────────────────────────────────

    _seedPurchaseOrders: function() {
      if (ZS.getItem('purchase-orders-data')) return;
      const orders = [
        {
          id: 'PO-001',
          number: 'PO-2026-0001',
          supplierId: 'SUP-001',
          date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          requiredDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: [
            { productId: 'PRD-002', quantity: 5, unitPrice: 90000, discount: 0 }
          ],
          subtotal: 450000,
          taxAmount: 85500,
          total: 535500,
          status: 'received'
        },
        {
          id: 'PO-002',
          number: 'PO-2026-0002',
          supplierId: 'SUP-002',
          date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          requiredDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: [
            { productId: 'PRD-001', quantity: 20, unitPrice: 20000, discount: 2000 }
          ],
          subtotal: 360000,
          taxAmount: 68400,
          total: 428400,
          status: 'open'
        },
        {
          id: 'PO-003',
          number: 'PO-2026-0003',
          supplierId: 'SUP-003',
          date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          requiredDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          items: [
            { productId: 'PRD-005', quantity: 50, unitPrice: 2000, discount: 0 }
          ],
          subtotal: 100000,
          taxAmount: 19000,
          total: 119000,
          status: 'draft'
        }
      ];
      ZS.setItem('purchase-orders-data', JSON.stringify(orders));
    },

    // ─────────────────────────────────────────────────────────────────────
    // ACCOUNTING & FINANCE DATA
    // ─────────────────────────────────────────────────────────────────────

    _seedAccounts: function() {
      if (ZS.getItem('accounts-data')) return;
      const accounts = [
        { id: 'ACC-001', code: '1000', name: 'Cash', type: 'asset', balance: 500000 },
        { id: 'ACC-002', code: '1100', name: 'Bank Account', type: 'asset', balance: 2500000 },
        { id: 'ACC-003', code: '1200', name: 'Accounts Receivable', type: 'asset', balance: 450000 },
        { id: 'ACC-004', code: '2000', name: 'Accounts Payable', type: 'liability', balance: -350000 },
        { id: 'ACC-005', code: '3000', name: 'Capital Stock', type: 'equity', balance: -2000000 },
        { id: 'ACC-006', code: '4000', name: 'Sales Revenue', type: 'income', balance: -800000 },
        { id: 'ACC-007', code: '5000', name: 'Operating Expenses', type: 'expense', balance: 300000 },
        { id: 'ACC-008', code: '5100', name: 'Salaries & Wages', type: 'expense', balance: 450000 }
      ];
      ZS.setItem('accounts-data', JSON.stringify(accounts));
    },

    _seedTransactions: function() {
      if (ZS.getItem('transactions-data')) return;
      const transactions = [
        {
          id: 'TXN-001',
          date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          description: 'Invoice INV-001 Payment',
          amount: 59500,
          type: 'receipt',
          reference: 'INV-001'
        },
        {
          id: 'TXN-002',
          date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          description: 'Purchase Order PO-001 Payment',
          amount: -535500,
          type: 'payment',
          reference: 'PO-001'
        },
        {
          id: 'TXN-003',
          date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          description: 'Salary Payment - March 2026',
          amount: -450000,
          type: 'payment',
          reference: 'PAYROLL'
        }
      ];
      ZS.setItem('transactions-data', JSON.stringify(transactions));
    },

    _seedJournalEntries: function() {
      if (ZS.getItem('journal-entries-data')) return;
      const entries = [
        {
          id: 'JE-001',
          date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          description: 'Invoice INV-001 Posted',
          lines: [
            { accountId: 'ACC-002', debit: 59500, credit: 0 },
            { accountId: 'ACC-006', debit: 0, credit: 50000 },
            { accountId: 'ACC-008', debit: 0, credit: 9500 }
          ],
          status: 'posted'
        },
        {
          id: 'JE-002',
          date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          description: 'Purchase PO-001 Posted',
          lines: [
            { accountId: 'ACC-001', debit: 0, credit: 535500 },
            { accountId: 'ACC-002', debit: 450000, credit: 0 },
            { accountId: 'ACC-004', debit: 85500, credit: 0 }
          ],
          status: 'posted'
        }
      ];
      ZS.setItem('journal-entries-data', JSON.stringify(entries));
    },

    _seedExpenses: function() {
      if (ZS.getItem('expenses-data')) return;
      const expenses = [
        {
          id: 'EXP-001',
          date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          description: 'Office Utilities',
          category: 'utilities',
          amount: 25000,
          status: 'approved',
          submittedBy: 'EMP-001'
        },
        {
          id: 'EXP-002',
          date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          description: 'Travel - Client Meeting',
          category: 'travel',
          amount: 45000,
          status: 'approved',
          submittedBy: 'EMP-002'
        },
        {
          id: 'EXP-003',
          date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          description: 'Conference Registration',
          category: 'training',
          amount: 35000,
          status: 'pending',
          submittedBy: 'EMP-003'
        }
      ];
      ZS.setItem('expenses-data', JSON.stringify(expenses));
    },

    // ─────────────────────────────────────────────────────────────────────
    // SERVICES MODULE DATA
    // ─────────────────────────────────────────────────────────────────────

    _seedServices: function() {
      if (ZS.getItem('services-data')) return;
      const services = [
        {
          id: 'SVC-001',
          code: 'MAINT-001',
          name: 'System Maintenance',
          description: 'Monthly system maintenance and updates',
          price: 35000,
          duration: 'monthly',
          category: 'maintenance'
        },
        {
          id: 'SVC-002',
          code: 'TECH-001',
          name: 'Technical Support',
          description: '24/7 technical support via phone and email',
          price: 25000,
          duration: 'monthly',
          category: 'support'
        },
        {
          id: 'SVC-003',
          code: 'CONS-001',
          name: 'Business Consulting',
          description: 'Enterprise business consulting services',
          price: 100000,
          duration: 'project',
          category: 'consulting'
        }
      ];
      ZS.setItem('services-data', JSON.stringify(services));
    },

    _seedServiceAppointments: function() {
      if (ZS.getItem('appointments-data')) return;
      const appointments = [
        {
          id: 'APT-001',
          serviceId: 'SVC-002',
          customerId: 'CUST-001',
          date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          time: '09:00',
          duration: 60,
          status: 'scheduled',
          notes: 'Initial support setup'
        },
        {
          id: 'APT-002',
          serviceId: 'SVC-001',
          customerId: 'CUST-002',
          date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          time: '14:00',
          duration: 120,
          status: 'scheduled',
          notes: 'Monthly maintenance window'
        }
      ];
      ZS.setItem('appointments-data', JSON.stringify(appointments));
    },

    // ─────────────────────────────────────────────────────────────────────
    // CONSULTING & PROJECT DATA
    // ─────────────────────────────────────────────────────────────────────

    _seedTenders: function() {
      if (ZS.getItem('tenders-data')) return;
      const tenders = [
        {
          id: 'TND-001',
          number: 'TND-2026-001',
          title: 'Government IT Infrastructure',
          description: 'Tender for new IT infrastructure setup',
          budget: 5000000,
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'open'
        },
        {
          id: 'TND-002',
          number: 'TND-2026-002',
          title: 'Corporate Software License',
          description: 'Tender for enterprise software licenses',
          budget: 2000000,
          deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'open'
        }
      ];
      ZS.setItem('tenders-data', JSON.stringify(tenders));
    },

    _seedProjects: function() {
      if (ZS.getItem('projects-data')) return;
      const projects = [
        {
          id: 'PRJ-001',
          code: 'ERP-2026-01',
          name: 'ERP System Implementation',
          customerId: 'CUST-004',
          startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          budget: 2000000,
          status: 'active',
          progress: 35
        },
        {
          id: 'PRJ-002',
          code: 'WEB-2026-01',
          name: 'Website Redesign',
          customerId: 'CUST-002',
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          budget: 500000,
          status: 'active',
          progress: 50
        }
      ];
      ZS.setItem('projects-data', JSON.stringify(projects));
    },

    _seedProposals: function() {
      if (ZS.getItem('proposals-data')) return;
      const proposals = [
        {
          id: 'PROP-001',
          number: 'PROP-2026-001',
          customerId: 'CUST-001',
          title: 'Enterprise Solution Package',
          description: 'Complete ERP and CRM solution',
          value: 1500000,
          createdDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'sent'
        },
        {
          id: 'PROP-002',
          number: 'PROP-2026-002',
          customerId: 'CUST-004',
          title: 'Consulting & Training Services',
          description: 'System training and change management',
          value: 350000,
          createdDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          deadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'draft'
        }
      ];
      ZS.setItem('proposals-data', JSON.stringify(proposals));
    },

    _seedConsultations: function() {
      if (ZS.getItem('consultations-data')) return;
      const consultations = [
        {
          id: 'CONS-001',
          number: 'CONS-2026-001',
          customerId: 'CUST-001',
          type: 'strategy',
          subject: 'Digital Transformation Strategy',
          date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          duration: 120,
          consultant: 'EMP-001',
          status: 'scheduled'
        },
        {
          id: 'CONS-002',
          number: 'CONS-2026-002',
          customerId: 'CUST-002',
          type: 'technical',
          subject: 'System Architecture Review',
          date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          duration: 90,
          consultant: 'EMP-003',
          status: 'scheduled'
        }
      ];
      ZS.setItem('consultations-data', JSON.stringify(consultations));
    }
  };

})();
