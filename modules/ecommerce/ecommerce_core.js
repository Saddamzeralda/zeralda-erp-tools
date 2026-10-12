/**
 * Zeralda ERP - E-commerce Core Module
 * ====================================
 * Core data management, storage, and business logic for E-commerce functionality
 * 
 * Storage Keys:
 * - ecommerce-products: Product catalog
 * - ecommerce-categories: Product categories
 * - ecommerce-orders: Order records
 * - ecommerce-customers: Customer data
 * - ecommerce-payments: Payment records
 * - ecommerce-cart: Shopping cart (session-based)
 * - ecommerce-settings: Store configuration
 */

(function() {
    'use strict';

    // Storage key constants
    const STORAGE_KEYS = {
        PRODUCTS: 'ecommerce-products',
        CATEGORIES: 'ecommerce-categories',
        ORDERS: 'ecommerce-orders',
        CUSTOMERS: 'ecommerce-customers',
        PAYMENTS: 'ecommerce-payments',
        SETTINGS: 'ecommerce-settings',
        CART: 'ecommerce-cart'
    };

    // Default settings
    const DEFAULT_SETTINGS = {
        storeName: 'Zeralda Store',
        storeEmail: '',
        storePhone: '',
        currency: 'USD',
        taxRate: 0,
        shippingCost: 0,
        enabledPaymentMethods: ['cash', 'card', 'stripe', 'paypal'],
        lowStockThreshold: 10,
        autoOrderConfirmation: true,
        inventorySync: true
    };

    // Data management class
    class EcommerceDataManager {
        constructor() {
            this.initializeStorage();
        }

        initializeStorage() {
            // Initialize all storage keys if they don't exist
            if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS)) {
                localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.CATEGORIES)) {
                localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([
                    { id: this.generateId(), name: 'Electronics', description: 'Electronic devices and accessories', status: 'active', createdAt: new Date().toISOString() },
                    { id: this.generateId(), name: 'Clothing', description: 'Apparel and fashion items', status: 'active', createdAt: new Date().toISOString() }
                ]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.ORDERS)) {
                localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.CUSTOMERS)) {
                localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.PAYMENTS)) {
                localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
                localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
            }
            if (!localStorage.getItem(STORAGE_KEYS.CART)) {
                localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify([]));
            }
        }

        generateId() {
            return 'EC-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
        }

        // Generic CRUD operations
        getData(key) {
            try {
                return JSON.parse(localStorage.getItem(key)) || [];
            } catch (e) {
                console.error('Error reading data:', e);
                return [];
            }
        }

        setData(key, data) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
                return true;
            } catch (e) {
                console.error('Error saving data:', e);
                return false;
            }
        }

        // Product operations
        getProducts() {
            return this.getData(STORAGE_KEYS.PRODUCTS);
        }

        getProductById(id) {
            const products = this.getProducts();
            return products.find(p => p.id === id);
        }

        addProduct(product) {
            const products = this.getProducts();
            const newProduct = {
                id: this.generateId(),
                ...product,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                images: product.images || []
            };
            products.push(newProduct);
            this.setData(STORAGE_KEYS.PRODUCTS, products);
            return newProduct;
        }

        updateProduct(id, updates) {
            const products = this.getProducts();
            const index = products.findIndex(p => p.id === id);
            if (index !== -1) {
                products[index] = {
                    ...products[index],
                    ...updates,
                    updatedAt: new Date().toISOString()
                };
                this.setData(STORAGE_KEYS.PRODUCTS, products);
                return products[index];
            }
            return null;
        }

        deleteProduct(id) {
            const products = this.getProducts();
            const filtered = products.filter(p => p.id !== id);
            this.setData(STORAGE_KEYS.PRODUCTS, filtered);
            return filtered.length < products.length;
        }

        // Category operations
        getCategories() {
            return this.getData(STORAGE_KEYS.CATEGORIES);
        }

        getCategoryById(id) {
            const categories = this.getCategories();
            return categories.find(c => c.id === id);
        }

        addCategory(category) {
            const categories = this.getCategories();
            const newCategory = {
                id: this.generateId(),
                ...category,
                createdAt: new Date().toISOString(),
                productCount: 0
            };
            categories.push(newCategory);
            this.setData(STORAGE_KEYS.CATEGORIES, categories);
            return newCategory;
        }

        updateCategory(id, updates) {
            const categories = this.getCategories();
            const index = categories.findIndex(c => c.id === id);
            if (index !== -1) {
                categories[index] = {
                    ...categories[index],
                    ...updates,
                    updatedAt: new Date().toISOString()
                };
                this.setData(STORAGE_KEYS.CATEGORIES, categories);
                return categories[index];
            }
            return null;
        }

        deleteCategory(id) {
            const categories = this.getCategories();
            const filtered = categories.filter(c => c.id !== id);
            this.setData(STORAGE_KEYS.CATEGORIES, filtered);
            return filtered.length < categories.length;
        }

        updateCategoryProductCount(categoryId) {
            const products = this.getProducts();
            const count = products.filter(p => p.categoryId === categoryId).length;
            const categories = this.getCategories();
            const index = categories.findIndex(c => c.id === categoryId);
            if (index !== -1) {
                categories[index].productCount = count;
                this.setData(STORAGE_KEYS.CATEGORIES, categories);
            }
        }

        // Order operations
        getOrders() {
            return this.getData(STORAGE_KEYS.ORDERS);
        }

        getOrderById(id) {
            const orders = this.getOrders();
            return orders.find(o => o.id === id);
        }

        addOrder(order) {
            const orders = this.getOrders();
            const newOrder = {
                id: this.generateId(),
                orderNumber: this.generateOrderNumber(),
                ...order,
                status: 'pending',
                paymentStatus: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            orders.unshift(newOrder); // Add to beginning
            this.setData(STORAGE_KEYS.ORDERS, orders);
            
            // Update stock if inventory sync is enabled
            if (this.getSettings().inventorySync) {
                this.updateStockFromOrder(newOrder);
            }
            
            return newOrder;
        }

        updateOrder(id, updates) {
            const orders = this.getOrders();
            const index = orders.findIndex(o => o.id === id);
            if (index !== -1) {
                orders[index] = {
                    ...orders[index],
                    ...updates,
                    updatedAt: new Date().toISOString()
                };
                this.setData(STORAGE_KEYS.ORDERS, orders);
                return orders[index];
            }
            return null;
        }

        deleteOrder(id) {
            const orders = this.getOrders();
            const filtered = orders.filter(o => o.id !== id);
            this.setData(STORAGE_KEYS.ORDERS, filtered);
            return filtered.length < orders.length;
        }

        generateOrderNumber() {
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            return `ORD-${year}${month}${day}-${random}`;
        }

        updateStockFromOrder(order) {
            const products = this.getProducts();
            order.items.forEach(item => {
                const productIndex = products.findIndex(p => p.id === item.productId);
                if (productIndex !== -1) {
                    products[productIndex].stock = Math.max(0, products[productIndex].stock - item.quantity);
                    if (products[productIndex].stock === 0) {
                        products[productIndex].status = 'out_of_stock';
                    }
                }
            });
            this.setData(STORAGE_KEYS.PRODUCTS, products);
        }

        // Customer operations
        getCustomers() {
            return this.getData(STORAGE_KEYS.CUSTOMERS);
        }

        getCustomerById(id) {
            const customers = this.getCustomers();
            return customers.find(c => c.id === id);
        }

        getCustomerByEmail(email) {
            const customers = this.getCustomers();
            return customers.find(c => c.email === email);
        }

        addCustomer(customer) {
            const customers = this.getCustomers();
            const newCustomer = {
                id: this.generateId(),
                ...customer,
                totalOrders: 0,
                totalSpent: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            customers.push(newCustomer);
            this.setData(STORAGE_KEYS.CUSTOMERS, customers);
            return newCustomer;
        }

        updateCustomer(id, updates) {
            const customers = this.getCustomers();
            const index = customers.findIndex(c => c.id === id);
            if (index !== -1) {
                customers[index] = {
                    ...customers[index],
                    ...updates,
                    updatedAt: new Date().toISOString()
                };
                this.setData(STORAGE_KEYS.CUSTOMERS, customers);
                return customers[index];
            }
            return null;
        }

        deleteCustomer(id) {
            const customers = this.getCustomers();
            const filtered = customers.filter(c => c.id !== id);
            this.setData(STORAGE_KEYS.CUSTOMERS, filtered);
            return filtered.length < customers.length;
        }

        updateCustomerStats(customerId, orderAmount) {
            const customers = this.getCustomers();
            const index = customers.findIndex(c => c.id === customerId);
            if (index !== -1) {
                customers[index].totalOrders += 1;
                customers[index].totalSpent += orderAmount;
                customers[index].updatedAt = new Date().toISOString();
                this.setData(STORAGE_KEYS.CUSTOMERS, customers);
            }
        }

        // Payment operations
        getPayments() {
            return this.getData(STORAGE_KEYS.PAYMENTS);
        }

        addPayment(payment) {
            const payments = this.getPayments();
            const newPayment = {
                id: this.generateId(),
                ...payment,
                createdAt: new Date().toISOString()
            };
            payments.unshift(newPayment);
            this.setData(STORAGE_KEYS.PAYMENTS, payments);
            
            // Update order payment status
            if (payment.orderId && payment.status === 'completed') {
                this.updateOrder(payment.orderId, { paymentStatus: 'paid' });
            }
            
            return newPayment;
        }

        // Cart operations
        getCart() {
            return this.getData(STORAGE_KEYS.CART);
        }

        addToCart(product, quantity = 1) {
            const cart = this.getCart();
            const existingItem = cart.find(item => item.productId === product.id);
            
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                cart.push({
                    productId: product.id,
                    name: product.name,
                    price: product.price,
                    quantity: quantity,
                    image: product.images[0] || null
                });
            }
            
            this.setData(STORAGE_KEYS.CART, cart);
            return cart;
        }

        removeFromCart(productId) {
            const cart = this.getCart();
            const filtered = cart.filter(item => item.productId !== productId);
            this.setData(STORAGE_KEYS.CART, filtered);
            return filtered;
        }

        updateCartItemQuantity(productId, quantity) {
            const cart = this.getCart();
            const index = cart.findIndex(item => item.productId === productId);
            
            if (index !== -1) {
                if (quantity <= 0) {
                    cart.splice(index, 1);
                } else {
                    cart[index].quantity = quantity;
                }
                this.setData(STORAGE_KEYS.CART, cart);
            }
            
            return cart;
        }

        clearCart() {
            this.setData(STORAGE_KEYS.CART, []);
        }

        getCartTotal() {
            const cart = this.getCart();
            const settings = this.getSettings();
            const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const tax = subtotal * (settings.taxRate / 100);
            const shipping = settings.shippingCost;
            return {
                subtotal: subtotal,
                tax: tax,
                shipping: shipping,
                total: subtotal + tax + shipping
            };
        }

        // Settings operations
        getSettings() {
            const settings = this.getData(STORAGE_KEYS.SETTINGS);
            return typeof settings === 'object' ? settings : DEFAULT_SETTINGS;
        }

        updateSettings(newSettings) {
            const current = this.getSettings();
            const updated = { ...current, ...newSettings };
            this.setData(STORAGE_KEYS.SETTINGS, updated);
            return updated;
        }

        // Search and filter
        searchProducts(query) {
            const products = this.getProducts();
            const lowerQuery = query.toLowerCase();
            return products.filter(p => 
                p.name.toLowerCase().includes(lowerQuery) ||
                p.sku.toLowerCase().includes(lowerQuery) ||
                p.description.toLowerCase().includes(lowerQuery)
            );
        }

        filterProductsByCategory(categoryId) {
            const products = this.getProducts();
            return products.filter(p => p.categoryId === categoryId);
        }

        filterProductsByStatus(status) {
            const products = this.getProducts();
            return products.filter(p => p.status === status);
        }

        // Statistics
        getStatistics() {
            const products = this.getProducts();
            const orders = this.getOrders();
            const customers = this.getCustomers();
            const payments = this.getPayments();
            
            const totalProducts = products.length;
            const activeProducts = products.filter(p => p.status === 'active').length;
            const totalOrders = orders.length;
            const totalRevenue = orders
                .filter(o => o.paymentStatus === 'paid')
                .reduce((sum, o) => sum + o.total, 0);
            const totalCustomers = customers.length;
            
            const ordersByStatus = {
                pending: orders.filter(o => o.status === 'pending').length,
                processing: orders.filter(o => o.status === 'processing').length,
                shipped: orders.filter(o => o.status === 'shipped').length,
                delivered: orders.filter(o => o.status === 'delivered').length,
                cancelled: orders.filter(o => o.status === 'cancelled').length
            };

            const recentOrders = orders.slice(0, 10).map(o => ({
                id: o.id,
                orderNumber: o.orderNumber,
                customerName: o.customerName,
                total: o.total,
                status: o.status,
                createdAt: o.createdAt
            }));

            return {
                totalProducts,
                activeProducts,
                totalOrders,
                totalRevenue,
                totalCustomers,
                ordersByStatus,
                recentOrders
            };
        }

        // Export/Import
        exportData() {
            return {
                products: this.getProducts(),
                categories: this.getCategories(),
                orders: this.getOrders(),
                customers: this.getCustomers(),
                payments: this.getPayments(),
                settings: this.getSettings(),
                exportedAt: new Date().toISOString()
            };
        }

        importData(data) {
            try {
                if (data.products) this.setData(STORAGE_KEYS.PRODUCTS, data.products);
                if (data.categories) this.setData(STORAGE_KEYS.CATEGORIES, data.categories);
                if (data.orders) this.setData(STORAGE_KEYS.ORDERS, data.orders);
                if (data.customers) this.setData(STORAGE_KEYS.CUSTOMERS, data.customers);
                if (data.payments) this.setData(STORAGE_KEYS.PAYMENTS, data.payments);
                if (data.settings) this.setData(STORAGE_KEYS.SETTINGS, data.settings);
                return true;
            } catch (e) {
                console.error('Import error:', e);
                return false;
            }
        }
    }

    // Export to global scope
    window.EcommerceDataManager = EcommerceDataManager;
    window.ecommerceStorage = new EcommerceDataManager();

})();
