/**
 * Zeralda ERP - E-commerce Storefront
 * ==================================
 * Customer-facing shopping cart and checkout functionality
 */

(function() {
    'use strict';

    const storage = window.ecommerceStorage;
    let currentCategoryFilter = null;

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', function() {
        loadStoreSettings();
        loadCategories();
        loadProducts();
        loadCart();
    });

    // Load store settings
    function loadStoreSettings() {
        const settings = storage.getSettings();
        document.getElementById('storeName').textContent = settings.storeName || 'Zeralda Store';
    }

    // Load categories
    function loadCategories() {
        const categories = storage.getCategories();
        const grid = document.getElementById('categoryGrid');
        grid.innerHTML = '';

        categories.forEach(category => {
            if (category.status === 'active') {
                const card = document.createElement('div');
                card.className = 'category-card';
                card.onclick = () => filterByCategory(category.id);
                card.innerHTML = `
                    <i class="fas fa-box"></i>
                    <h3>${escapeHtml(category.name)}</h3>
                `;
                grid.appendChild(card);
            }
        });
    }

    // Load products
    function loadProducts(filter = 'all') {
        let products = storage.getProducts();
        
        if (filter === 'active') {
            products = products.filter(p => p.status === 'active' && p.stock > 0);
        }

        if (currentCategoryFilter) {
            products = products.filter(p => p.categoryId === currentCategoryFilter);
        }

        const grid = document.getElementById('productGrid');
        grid.innerHTML = '';

        if (products.length === 0) {
            grid.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 40px; color: #9ca3af;">No products found</p>';
            return;
        }

        products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="${product.images && product.images.length > 0 ? product.images[0] : 'https://via.placeholder.com/300x250?text=No+Image'}" 
                     alt="${escapeHtml(product.name)}" 
                     class="product-image"
                     onclick="openProductModal('${product.id}')">
                <div class="product-info">
                    <div class="product-category">${getCategoryName(product.categoryId)}</div>
                    <div class="product-name">${escapeHtml(product.name)}</div>
                    <div class="product-price">${formatCurrency(product.price)}</div>
                    <div class="product-actions">
                        <button class="btn btn-secondary" onclick="openProductModal('${product.id}')">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="btn btn-primary" onclick="addToCart('${product.id}')">
                            <i class="fas fa-cart-plus"></i> Add
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    // Filter products
    function filterProducts(filter) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-filter') === filter) {
                btn.classList.add('active');
            }
        });
        loadProducts(filter);
    }

    function filterByCategory(categoryId) {
        currentCategoryFilter = categoryId;
        loadProducts('all');
        scrollToProducts();
    }

    function searchProducts() {
        const query = document.getElementById('searchInput').value;
        if (query.length > 0) {
            const products = storage.searchProducts(query);
            renderFilteredProducts(products);
        } else {
            loadProducts('all');
        }
    }

    function renderFilteredProducts(products) {
        const grid = document.getElementById('productGrid');
        grid.innerHTML = '';

        if (products.length === 0) {
            grid.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 40px; color: #9ca3af;">No products found</p>';
            return;
        }

        products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <img src="${product.images && product.images.length > 0 ? product.images[0] : 'https://via.placeholder.com/300x250?text=No+Image'}" 
                     alt="${escapeHtml(product.name)}" 
                     class="product-image"
                     onclick="openProductModal('${product.id}')">
                <div class="product-info">
                    <div class="product-category">${getCategoryName(product.categoryId)}</div>
                    <div class="product-name">${escapeHtml(product.name)}</div>
                    <div class="product-price">${formatCurrency(product.price)}</div>
                    <div class="product-actions">
                        <button class="btn btn-secondary" onclick="openProductModal('${product.id}')">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="btn btn-primary" onclick="addToCart('${product.id}')">
                            <i class="fas fa-cart-plus"></i> Add
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    // Cart functionality
    function loadCart() {
        const cart = storage.getCart();
        const cartItems = document.getElementById('cartItems');
        const cartBadge = document.getElementById('cartBadge');
        
        cartBadge.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
        
        if (cart.length === 0) {
            cartItems.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 40px;">Your cart is empty</p>';
            document.getElementById('cartTotal').textContent = formatCurrency(0);
            return;
        }

        cartItems.innerHTML = '';
        cart.forEach(item => {
            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            cartItem.innerHTML = `
                <img src="${item.image || 'https://via.placeholder.com/80'}" alt="${escapeHtml(item.name)}" class="cart-item-image">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">${formatCurrency(item.price)}</div>
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="updateQuantity('${item.productId}', -1)">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateQuantity('${item.productId}', 1)">+</button>
                        <span class="remove-item" onclick="removeFromCart('${item.productId}')">
                            <i class="fas fa-trash"></i>
                        </span>
                    </div>
                </div>
            `;
            cartItems.appendChild(cartItem);
        });

        const totals = storage.getCartTotal();
        document.getElementById('cartTotal').textContent = formatCurrency(totals.total);
    }

    function addToCart(productId) {
        const product = storage.getProductById(productId);
        if (!product) return;

        if (product.stock <= 0) {
            showToast('Product is out of stock', 'error');
            return;
        }

        const cart = storage.getCart();
        const existingItem = cart.find(item => item.productId === productId);
        
        if (existingItem) {
            if (existingItem.quantity >= product.stock) {
                showToast('Maximum stock reached', 'warning');
                return;
            }
            storage.updateCartItemQuantity(productId, existingItem.quantity + 1);
        } else {
            storage.addToCart(product, 1);
        }

        loadCart();
        showToast('Added to cart', 'success');
    }

    function updateQuantity(productId, change) {
        const cart = storage.getCart();
        const item = cart.find(i => i.productId === productId);
        if (!item) return;

        const newQuantity = item.quantity + change;
        if (newQuantity <= 0) {
            removeFromCart(productId);
        } else {
            storage.updateCartItemQuantity(productId, newQuantity);
            loadCart();
        }
    }

    function removeFromCart(productId) {
        storage.removeFromCart(productId);
        loadCart();
        showToast('Removed from cart', 'info');
    }

    function toggleCart() {
        const sidebar = document.getElementById('cartSidebar');
        const overlay = document.getElementById('overlay');
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    }

    // Product modal
    function openProductModal(productId) {
        const product = storage.getProductById(productId);
        if (!product) return;

        const modal = document.getElementById('productModal');
        const detail = document.getElementById('productDetail');

        const stockStatus = product.stock > 0 
            ? `<span class="product-detail-stock">In Stock (${product.stock})</span>`
            : `<span class="product-detail-stock" style="background: #fee2e2; color: #991b1b;">Out of Stock</span>`;

        detail.innerHTML = `
            <img src="${product.images && product.images.length > 0 ? product.images[0] : 'https://via.placeholder.com/400'}" 
                 alt="${escapeHtml(product.name)}" 
                 class="product-detail-image">
            <div class="product-detail-info">
                <h2>${escapeHtml(product.name)}</h2>
                <div class="product-detail-price">${formatCurrency(product.price)}</div>
                ${stockStatus}
                <p class="product-detail-description">${escapeHtml(product.description || 'No description available')}</p>
                <div style="margin-bottom: 20px;">
                    <strong>SKU:</strong> ${escapeHtml(product.sku || 'N/A')}<br>
                    <strong>Category:</strong> ${getCategoryName(product.categoryId)}<br>
                    <strong>Weight:</strong> ${product.weight ? product.weight + ' kg' : 'N/A'}
                </div>
                <button class="add-to-cart-btn" 
                        onclick="addToCartFromModal('${product.id}')" 
                        ${product.stock <= 0 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                    <i class="fas fa-cart-plus"></i> Add to Cart
                </button>
            </div>
        `;

        modal.classList.add('active');
    }

    function closeProductModal() {
        document.getElementById('productModal').classList.remove('active');
    }

    function addToCartFromModal(productId) {
        addToCart(productId);
        closeProductModal();
    }

    // Checkout
    function checkout() {
        const cart = storage.getCart();
        if (cart.length === 0) {
            showToast('Your cart is empty', 'error');
            return;
        }

        const totals = storage.getCartTotal();
        
        // Simple checkout form (in production, this would be a proper checkout page)
        const customerName = prompt('Enter your name:');
        if (!customerName) return;

        const customerEmail = prompt('Enter your email:');
        if (!customerEmail) return;

        const customerPhone = prompt('Enter your phone:');
        if (!customerPhone) return;

        const address = prompt('Enter your delivery address:');
        if (!address) return;

        // Create or get customer
        let customer = storage.getCustomerByEmail(customerEmail);
        if (!customer) {
            customer = storage.addCustomer({
                name: customerName,
                email: customerEmail,
                phone: customerPhone,
                address: address
            });
        }

        // Create order
        const order = storage.addOrder({
            customerId: customer.id,
            customerName: customerName,
            customerEmail: customerEmail,
            customerPhone: customerPhone,
            shippingAddress: address,
            items: cart.map(item => ({
                productId: item.productId,
                name: item.name,
                price: item.price,
                quantity: item.quantity
            })),
            subtotal: totals.subtotal,
            tax: totals.tax,
            shipping: totals.shipping,
            total: totals.total
        });

        // Update customer stats
        storage.updateCustomerStats(customer.id, totals.total);

        // Clear cart
        storage.clearCart();
        loadCart();
        toggleCart();

        showToast(`Order ${order.orderNumber} placed successfully!`, 'success');
        alert(`Thank you for your order!\n\nOrder Number: ${order.orderNumber}\nTotal: ${formatCurrency(totals.total)}\n\nWe will contact you shortly.`);
    }

    // Helper functions
    function getCategoryName(categoryId) {
        const category = storage.getCategoryById(categoryId);
        return category ? category.name : 'Uncategorized';
    }

    function formatCurrency(amount) {
        const settings = storage.getSettings();
        const symbol = settings.currency === 'USD' ? '$' : 
                      settings.currency === 'EUR' ? '€' : 
                      settings.currency === 'DZD' ? 'د.ج' : 
                      settings.currency === 'SAR' ? 'ر.س' : '$';
        return `${symbol}${amount.toFixed(2)}`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function scrollToProducts() {
        document.getElementById('productsSection').scrollIntoView({ behavior: 'smooth' });
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
    window.filterProducts = filterProducts;
    window.searchProducts = searchProducts;
    window.addToCart = addToCart;
    window.updateQuantity = updateQuantity;
    window.removeFromCart = removeFromCart;
    window.toggleCart = toggleCart;
    window.openProductModal = openProductModal;
    window.closeProductModal = closeProductModal;
    window.addToCartFromModal = addToCartFromModal;
    window.checkout = checkout;

})();
