/**
 * Zeralda ERP - E-commerce Admin Interface
 * =======================================
 * Admin panel logic for managing products, orders, customers, and settings
 */

(function() {
    'use strict';

    const storage = window.ecommerceStorage;
    let currentPage = 1;
    const itemsPerPage = 10;

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', function() {
        initializeTabs();
        loadDashboard();
        loadProducts();
        loadCategories();
        loadOrders();
        loadCustomers();
        loadPayments();
        loadSettings();
        initializeForms();
        updateStatistics();
    });

    // Tab navigation
    function initializeTabs() {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const tabId = this.getAttribute('data-tab');
                switchTab(tabId);
            });
        });
    }

    function switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.getAttribute('data-tab') === tabId) {
                tab.classList.add('active');
            }
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            if (content.id === tabId) {
                content.classList.add('active');
            }
        });

        // Refresh data when switching tabs
        if (tabId === 'dashboard') loadDashboard();
        if (tabId === 'products') loadProducts();
        if (tabId === 'categories') loadCategories();
        if (tabId === 'orders') loadOrders();
        if (tabId === 'customers') loadCustomers();
        if (tabId === 'payments') loadPayments();
        if (tabId === 'settings') loadSettings();
    }

    // Dashboard
    function loadDashboard() {
        const stats = storage.getStatistics();
        document.getElementById('totalProducts').textContent = stats.totalProducts;
        document.getElementById('totalOrders').textContent = stats.totalOrders;
        document.getElementById('totalRevenue').textContent = formatCurrency(stats.totalRevenue);

        initializeCharts(stats);
    }

    function initializeCharts(stats) {
        // Sales Chart
        const salesCtx = document.getElementById('salesChart');
        if (salesCtx) {
            new Chart(salesCtx, {
                type: 'line',
                data: {
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{
                        label: 'Sales',
                        data: [12000, 19000, 15000, 25000, 22000, 30000],
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }

        // Order Status Chart
        const statusCtx = document.getElementById('orderStatusChart');
        if (statusCtx) {
            new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
                    datasets: [{
                        data: [
                            stats.ordersByStatus.pending,
                            stats.ordersByStatus.processing,
                            stats.ordersByStatus.shipped,
                            stats.ordersByStatus.delivered,
                            stats.ordersByStatus.cancelled
                        ],
                        backgroundColor: ['#f59e0b', '#06b6d4', '#8b5cf6', '#10b981', '#ef4444']
                    }]
                },
                options: {
                    responsive: true
                }
            });
        }

        // Top Products Chart
        const topCtx = document.getElementById('topProductsChart');
        if (topCtx) {
            const products = storage.getProducts().slice(0, 5);
            new Chart(topCtx, {
                type: 'bar',
                data: {
                    labels: products.map(p => p.name),
                    datasets: [{
                        label: 'Sales',
                        data: products.map(() => Math.floor(Math.random() * 100) + 20),
                        backgroundColor: '#2563eb'
                    }]
                },
                options: {
                    responsive: true,
                    indexAxis: 'y'
                }
            });
        }

        // Revenue by Category
        const catCtx = document.getElementById('revenueCategoryChart');
        if (catCtx) {
            const categories = storage.getCategories();
            new Chart(catCtx, {
                type: 'pie',
                data: {
                    labels: categories.map(c => c.name),
                    datasets: [{
                        data: categories.map(() => Math.floor(Math.random() * 50000) + 10000),
                        backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']
                    }]
                },
                options: {
                    responsive: true
                }
            });
        }
    }

    // Products
    function loadProducts() {
        const products = storage.getProducts();
        const tbody = document.getElementById('productsTableBody');
        tbody.innerHTML = '';

        products.forEach(product => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    ${product.images && product.images.length > 0 
                        ? `<img src="${product.images[0]}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;">` 
                        : '<div style="width: 50px; height: 50px; background: #e5e7eb; border-radius: 8px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-image" style="color: #9ca3af;"></i></div>'}
                </td>
                <td>${escapeHtml(product.name)}</td>
                <td>${escapeHtml(product.sku || '-')}</td>
                <td>${getCategoryName(product.categoryId)}</td>
                <td>${formatCurrency(product.price)}</td>
                <td>${product.stock}</td>
                <td><span class="status-badge status-${product.status}">${product.status}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="viewProduct('${product.id}')"><i class="fas fa-eye"></i></button>
                        <button class="action-btn edit" onclick="editProduct('${product.id}')"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deleteProduct('${product.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });

        updatePagination('productsPagination', products.length);
    }

    function openProductModal(productId = null) {
        const modal = document.getElementById('productModal');
        const form = document.getElementById('productForm');
        const title = document.getElementById('productModalTitle');

        form.reset();
        document.getElementById('productId').value = '';
        document.getElementById('imagePreview').innerHTML = '';

        // Load categories
        const categorySelect = document.getElementById('productCategory');
        categorySelect.innerHTML = '<option value="">Select Category</option>';
        storage.getCategories().forEach(cat => {
            if (cat.status === 'active') {
                categorySelect.innerHTML += `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`;
            }
        });

        if (productId) {
            const product = storage.getProductById(productId);
            if (product) {
                title.textContent = 'Edit Product';
                document.getElementById('productId').value = product.id;
                document.getElementById('productName').value = product.name;
                document.getElementById('productSku').value = product.sku || '';
                document.getElementById('productCategory').value = product.categoryId || '';
                document.getElementById('productPrice').value = product.price;
                document.getElementById('productCost').value = product.cost || '';
                document.getElementById('productStock').value = product.stock || 0;
                document.getElementById('productWeight').value = product.weight || '';
                document.getElementById('productStatus').value = product.status;
                document.getElementById('productDescription').value = product.description || '';

                // Load images
                if (product.images && product.images.length > 0) {
                    const preview = document.getElementById('imagePreview');
                    product.images.forEach(img => {
                        preview.innerHTML += `<img src="${img}" alt="Product Image">`;
                    });
                }
            }
        } else {
            title.textContent = 'Add Product';
        }

        modal.classList.add('active');
    }

    function closeProductModal() {
        document.getElementById('productModal').classList.remove('active');
    }

    function editProduct(id) {
        openProductModal(id);
    }

    function deleteProduct(id) {
        if (confirm('Are you sure you want to delete this product?')) {
            storage.deleteProduct(id);
            loadProducts();
            showToast('Product deleted successfully', 'success');
        }
    }

    function viewProduct(id) {
        const product = storage.getProductById(id);
        if (product) {
            alert(`Product Details:\n\nName: ${product.name}\nSKU: ${product.sku}\nPrice: ${formatCurrency(product.price)}\nStock: ${product.stock}\nDescription: ${product.description}`);
        }
    }

    function previewImages(input) {
        const preview = document.getElementById('imagePreview');
        preview.innerHTML = '';

        if (input.files) {
            Array.from(input.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.innerHTML += `<img src="${e.target.result}" alt="Preview">`;
                };
                reader.readAsDataURL(file);
            });
        }
    }

    // Categories
    function loadCategories() {
        const categories = storage.getCategories();
        const tbody = document.getElementById('categoriesTableBody');
        tbody.innerHTML = '';

        categories.forEach(category => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(category.name)}</td>
                <td>${escapeHtml(category.description || '-')}</td>
                <td>${category.productCount || 0}</td>
                <td><span class="status-badge status-${category.status}">${category.status}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" onclick="editCategory('${category.id}')"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deleteCategory('${category.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    function openCategoryModal(categoryId = null) {
        const modal = document.getElementById('categoryModal');
        const form = document.getElementById('categoryForm');
        const title = document.getElementById('categoryModalTitle');

        form.reset();
        document.getElementById('categoryId').value = '';

        if (categoryId) {
            const category = storage.getCategoryById(categoryId);
            if (category) {
                title.textContent = 'Edit Category';
                document.getElementById('categoryId').value = category.id;
                document.getElementById('categoryName').value = category.name;
                document.getElementById('categoryDescription').value = category.description || '';
                document.getElementById('categoryStatus').value = category.status;
            }
        } else {
            title.textContent = 'Add Category';
        }

        modal.classList.add('active');
    }

    function closeCategoryModal() {
        document.getElementById('categoryModal').classList.remove('active');
    }

    function editCategory(id) {
        openCategoryModal(id);
    }

    function deleteCategory(id) {
        if (confirm('Are you sure you want to delete this category?')) {
            storage.deleteCategory(id);
            loadCategories();
            showToast('Category deleted successfully', 'success');
        }
    }

    // Orders
    function loadOrders() {
        const orders = storage.getOrders();
        const tbody = document.getElementById('ordersTableBody');
        tbody.innerHTML = '';

        orders.forEach(order => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${order.orderNumber}</td>
                <td>${escapeHtml(order.customerName)}</td>
                <td>${formatDate(order.createdAt)}</td>
                <td>${formatCurrency(order.total)}</td>
                <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                <td><span class="status-badge status-${order.paymentStatus}">${order.paymentStatus}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="viewOrder('${order.id}')"><i class="fas fa-eye"></i></button>
                        <button class="action-btn edit" onclick="updateOrderStatus('${order.id}')"><i class="fas fa-edit"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });

        updatePagination('ordersPagination', orders.length);
    }

    function viewOrder(id) {
        const order = storage.getOrderById(id);
        if (order) {
            let details = `Order: ${order.orderNumber}\n`;
            details += `Customer: ${order.customerName}\n`;
            details += `Date: ${formatDate(order.createdAt)}\n`;
            details += `Total: ${formatCurrency(order.total)}\n`;
            details += `Status: ${order.status}\n\n`;
            details += 'Items:\n';
            order.items.forEach(item => {
                details += `- ${item.name} x${item.quantity}: ${formatCurrency(item.price * item.quantity)}\n`;
            });
            alert(details);
        }
    }

    function updateOrderStatus(id) {
        const order = storage.getOrderById(id);
        if (order) {
            const newStatus = prompt('Enter new status (pending, processing, shipped, delivered, cancelled):', order.status);
            if (newStatus && ['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(newStatus)) {
                storage.updateOrder(id, { status: newStatus });
                loadOrders();
                showToast('Order status updated', 'success');
            }
        }
    }

    // Customers
    function loadCustomers() {
        const customers = storage.getCustomers();
        const tbody = document.getElementById('customersTableBody');
        tbody.innerHTML = '';

        customers.forEach(customer => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(customer.name)}</td>
                <td>${escapeHtml(customer.email)}</td>
                <td>${escapeHtml(customer.phone || '-')}</td>
                <td>${customer.totalOrders}</td>
                <td>${formatCurrency(customer.totalSpent)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="viewCustomer('${customer.id}')"><i class="fas fa-eye"></i></button>
                        <button class="action-btn edit" onclick="editCustomer('${customer.id}')"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deleteCustomer('${customer.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    function viewCustomer(id) {
        const customer = storage.getCustomerById(id);
        if (customer) {
            alert(`Customer Details:\n\nName: ${customer.name}\nEmail: ${customer.email}\nPhone: ${customer.phone}\nTotal Orders: ${customer.totalOrders}\nTotal Spent: ${formatCurrency(customer.totalSpent)}`);
        }
    }

    function editCustomer(id) {
        const customer = storage.getCustomerById(id);
        if (customer) {
            const newName = prompt('Enter new name:', customer.name);
            const newEmail = prompt('Enter new email:', customer.email);
            const newPhone = prompt('Enter new phone:', customer.phone || '');
            
            if (newName) {
                storage.updateCustomer(id, {
                    name: newName,
                    email: newEmail,
                    phone: newPhone
                });
                loadCustomers();
                showToast('Customer updated', 'success');
            }
        }
    }

    function deleteCustomer(id) {
        if (confirm('Are you sure you want to delete this customer?')) {
            storage.deleteCustomer(id);
            loadCustomers();
            showToast('Customer deleted', 'success');
        }
    }

    // Payments
    function loadPayments() {
        const payments = storage.getPayments();
        const tbody = document.getElementById('paymentsTableBody');
        tbody.innerHTML = '';

        payments.forEach(payment => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${payment.id}</td>
                <td>${payment.orderId || '-'}</td>
                <td>${formatCurrency(payment.amount)}</td>
                <td>${payment.method}</td>
                <td><span class="status-badge status-${payment.status}">${payment.status}</span></td>
                <td>${formatDate(payment.createdAt)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="viewPayment('${payment.id}')"><i class="fas fa-eye"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    function viewPayment(id) {
        const payments = storage.getPayments();
        const payment = payments.find(p => p.id === id);
        if (payment) {
            alert(`Payment Details:\n\nID: ${payment.id}\nOrder: ${payment.orderId}\nAmount: ${formatCurrency(payment.amount)}\nMethod: ${payment.method}\nStatus: ${payment.status}`);
        }
    }

    // Settings
    function loadSettings() {
        const settings = storage.getSettings();
        document.getElementById('storeName').value = settings.storeName || '';
        document.getElementById('storeEmail').value = settings.storeEmail || '';
        document.getElementById('storePhone').value = settings.storePhone || '';
        document.getElementById('currency').value = settings.currency || 'USD';
        document.getElementById('taxRate').value = settings.taxRate || 0;
        document.getElementById('shippingCost').value = settings.shippingCost || 0;
    }

    function saveSettings() {
        const settings = {
            storeName: document.getElementById('storeName').value,
            storeEmail: document.getElementById('storeEmail').value,
            storePhone: document.getElementById('storePhone').value,
            currency: document.getElementById('currency').value,
            taxRate: parseFloat(document.getElementById('taxRate').value) || 0,
            shippingCost: parseFloat(document.getElementById('shippingCost').value) || 0
        };

        storage.updateSettings(settings);
        showToast('Settings saved successfully', 'success');
    }

    // Form initialization
    function initializeForms() {
        // Product form
        document.getElementById('productForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const productId = document.getElementById('productId').value;
            const productData = {
                name: document.getElementById('productName').value,
                sku: document.getElementById('productSku').value,
                categoryId: document.getElementById('productCategory').value,
                price: parseFloat(document.getElementById('productPrice').value),
                cost: parseFloat(document.getElementById('productCost').value) || 0,
                stock: parseInt(document.getElementById('productStock').value) || 0,
                weight: parseFloat(document.getElementById('productWeight').value) || 0,
                status: document.getElementById('productStatus').value,
                description: document.getElementById('productDescription').value,
                images: getUploadedImages()
            };

            if (productId) {
                storage.updateProduct(productId, productData);
                showToast('Product updated successfully', 'success');
            } else {
                storage.addProduct(productData);
                showToast('Product added successfully', 'success');
            }

            closeProductModal();
            loadProducts();
            updateStatistics();
        });

        // Category form
        document.getElementById('categoryForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const categoryId = document.getElementById('categoryId').value;
            const categoryData = {
                name: document.getElementById('categoryName').value,
                description: document.getElementById('categoryDescription').value,
                status: document.getElementById('categoryStatus').value
            };

            if (categoryId) {
                storage.updateCategory(categoryId, categoryData);
                showToast('Category updated successfully', 'success');
            } else {
                storage.addCategory(categoryData);
                showToast('Category added successfully', 'success');
            }

            closeCategoryModal();
            loadCategories();
        });
    }

    function getUploadedImages() {
        const preview = document.getElementById('imagePreview');
        const images = [];
        preview.querySelectorAll('img').forEach(img => {
            images.push(img.src);
        });
        return images;
    }

    // Export/Import
    function exportProducts() {
        const data = storage.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ecommerce-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported successfully', 'success');
    }

    function importProducts() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = function(e) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (storage.importData(data)) {
                        showToast('Data imported successfully', 'success');
                        loadProducts();
                        loadCategories();
                        loadOrders();
                        loadCustomers();
                        updateStatistics();
                    } else {
                        showToast('Import failed', 'error');
                    }
                } catch (err) {
                    showToast('Invalid file format', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // Filter functions
    function filterProducts() {
        const query = document.getElementById('productSearch').value;
        const products = query ? storage.searchProducts(query) : storage.getProducts();
        // Re-render with filtered results
        const tbody = document.getElementById('productsTableBody');
        tbody.innerHTML = '';
        products.forEach(product => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    ${product.images && product.images.length > 0 
                        ? `<img src="${product.images[0]}" alt="${product.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;">` 
                        : '<div style="width: 50px; height: 50px; background: #e5e7eb; border-radius: 8px;"></div>'}
                </td>
                <td>${escapeHtml(product.name)}</td>
                <td>${escapeHtml(product.sku || '-')}</td>
                <td>${getCategoryName(product.categoryId)}</td>
                <td>${formatCurrency(product.price)}</td>
                <td>${product.stock}</td>
                <td><span class="status-badge status-${product.status}">${product.status}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="viewProduct('${product.id}')"><i class="fas fa-eye"></i></button>
                        <button class="action-btn edit" onclick="editProduct('${product.id}')"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deleteProduct('${product.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    function filterOrders() {
        const query = document.getElementById('orderSearch').value;
        const statusFilter = document.getElementById('orderStatusFilter').value;
        let orders = storage.getOrders();

        if (query) {
            const lowerQuery = query.toLowerCase();
            orders = orders.filter(o => 
                o.orderNumber.toLowerCase().includes(lowerQuery) ||
                o.customerName.toLowerCase().includes(lowerQuery)
            );
        }

        if (statusFilter) {
            orders = orders.filter(o => o.status === statusFilter);
        }

        // Re-render
        const tbody = document.getElementById('ordersTableBody');
        tbody.innerHTML = '';
        orders.forEach(order => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${order.orderNumber}</td>
                <td>${escapeHtml(order.customerName)}</td>
                <td>${formatDate(order.createdAt)}</td>
                <td>${formatCurrency(order.total)}</td>
                <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                <td><span class="status-badge status-${order.paymentStatus}">${order.paymentStatus}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="viewOrder('${order.id}')"><i class="fas fa-eye"></i></button>
                        <button class="action-btn edit" onclick="updateOrderStatus('${order.id}')"><i class="fas fa-edit"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    function filterCustomers() {
        const query = document.getElementById('customerSearch').value;
        let customers = storage.getCustomers();

        if (query) {
            const lowerQuery = query.toLowerCase();
            customers = customers.filter(c => 
                c.name.toLowerCase().includes(lowerQuery) ||
                c.email.toLowerCase().includes(lowerQuery)
            );
        }

        // Re-render
        const tbody = document.getElementById('customersTableBody');
        tbody.innerHTML = '';
        customers.forEach(customer => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(customer.name)}</td>
                <td>${escapeHtml(customer.email)}</td>
                <td>${escapeHtml(customer.phone || '-')}</td>
                <td>${customer.totalOrders}</td>
                <td>${formatCurrency(customer.totalSpent)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn view" onclick="viewCustomer('${customer.id}')"><i class="fas fa-eye"></i></button>
                        <button class="action-btn edit" onclick="editCustomer('${customer.id}')"><i class="fas fa-edit"></i></button>
                        <button class="action-btn delete" onclick="deleteCustomer('${customer.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // Helper functions
    function updateStatistics() {
        const stats = storage.getStatistics();
        document.getElementById('totalProducts').textContent = stats.totalProducts;
        document.getElementById('totalOrders').textContent = stats.totalOrders;
        document.getElementById('totalRevenue').textContent = formatCurrency(stats.totalRevenue);
    }

    function updatePagination(containerId, totalItems) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const totalPages = Math.ceil(totalItems / itemsPerPage);
        container.innerHTML = '';

        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.className = i === currentPage ? 'active' : '';
            btn.onclick = () => {
                currentPage = i;
                // Reload current tab data
                if (containerId === 'productsPagination') loadProducts();
                if (containerId === 'ordersPagination') loadOrders();
            };
            container.appendChild(btn);
        }
    }

    function getCategoryName(categoryId) {
        const category = storage.getCategoryById(categoryId);
        return category ? category.name : '-';
    }

    function formatCurrency(amount) {
        const settings = storage.getSettings();
        const symbol = settings.currency === 'USD' ? '$' : 
                      settings.currency === 'EUR' ? '€' : 
                      settings.currency === 'DZD' ? 'د.ج' : 
                      settings.currency === 'SAR' ? 'ر.س' : '$';
        return `${symbol}${amount.toFixed(2)}`;
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // Make functions globally accessible
    function openOrderModal() {
        const customerName = prompt('Enter Customer Name:');
        if (!customerName) return;
        const total = parseFloat(prompt('Enter Order Total Amount (DZD):', '1000')) || 0;
        const newOrder = {
            id: 'ord_' + Date.now(),
            orderNumber: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
            customerName: customerName,
            total: total,
            status: 'pending',
            paymentStatus: 'unpaid',
            createdAt: new Date().toISOString(),
            items: []
        };
        storage.addOrder(newOrder);
        loadOrders();
        showToast('Order created successfully', 'success');
    }

    function openCustomerModal() {
        const name = prompt('Enter Customer Full Name:');
        if (!name) return;
        const email = prompt('Enter Customer Email:', 'customer@example.com') || '';
        const phone = prompt('Enter Customer Phone:', '0550000000') || '';
        const newCust = {
            id: 'cust_' + Date.now(),
            name: name,
            email: email,
            phone: phone,
            totalOrders: 0,
            totalSpent: 0
        };
        storage.addCustomer(newCust);
        loadCustomers();
        showToast('Customer added successfully', 'success');
    }

    function openPaymentModal() {
        const orderId = prompt('Enter Order ID or Number:');
        if (!orderId) return;
        const amount = parseFloat(prompt('Enter Payment Amount (DZD):', '1000')) || 0;
        const method = prompt('Payment Method (cash, card, transfer):', 'cash') || 'cash';
        const newPay = {
            id: 'pay_' + Date.now(),
            orderId: orderId,
            amount: amount,
            method: method,
            status: 'completed',
            createdAt: new Date().toISOString()
        };
        storage.addPayment(newPay);
        loadPayments();
        showToast('Payment recorded successfully', 'success');
    }

    window.openOrderModal = openOrderModal;
    window.openCustomerModal = openCustomerModal;
    window.openPaymentModal = openPaymentModal;

    window.openProductModal = openProductModal;
    window.closeProductModal = closeProductModal;
    window.editProduct = editProduct;
    window.deleteProduct = deleteProduct;
    window.viewProduct = viewProduct;
    window.openCategoryModal = openCategoryModal;
    window.closeCategoryModal = closeCategoryModal;
    window.editCategory = editCategory;
    window.deleteCategory = deleteCategory;
    window.viewOrder = viewOrder;
    window.updateOrderStatus = updateOrderStatus;
    window.viewCustomer = viewCustomer;
    window.editCustomer = editCustomer;
    window.deleteCustomer = deleteCustomer;
    window.viewPayment = viewPayment;
    window.saveSettings = saveSettings;
    window.exportProducts = exportProducts;
    window.importProducts = importProducts;
    window.filterProducts = filterProducts;
    window.filterOrders = filterOrders;
    window.filterCustomers = filterCustomers;
    window.previewImages = previewImages;

})();
