# Zeralda ERP - E-commerce Module
================================

**نظام التجارة الإلكترونية الاحترافي المتكامل**

A professional, full-featured E-commerce module for Zeralda ERP with product catalog management, shopping cart, order processing, payment integration, and seamless sync with existing inventory and sales modules.

---

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Admin Panel](#admin-panel)
- [Storefront](#storefront)
- [Payment Integration](#payment-integration)
- [Integration with ERP](#integration-with-erp)
- [API Reference](#api-reference)
- [Storage Structure](#storage-structure)
- [Troubleshooting](#troubleshooting)

---

## ✨ Features

### Product Management
- ✅ Full CRUD operations for products
- ✅ Multi-category support with unlimited nesting
- ✅ Multiple product images with preview
- ✅ SKU and barcode tracking
- ✅ Stock management with low-stock alerts
- ✅ Price and cost tracking
- ✅ Product status (active/inactive/out of stock)
- ✅ Weight and dimensions support
- ✅ Bulk import/export (JSON)

### Shopping Cart
- ✅ Add/remove items with quantity controls
- ✅ Real-time cart total calculation
- ✅ Tax and shipping cost calculation
- ✅ Session-based cart persistence
- ✅ Stock validation before checkout

### Order Management
- ✅ Automatic order number generation
- ✅ Order status tracking (pending → processing → shipped → delivered)
- ✅ Payment status tracking
- ✅ Customer information capture
- ✅ Shipping address management
- ✅ Order history and filtering
- ✅ Automatic stock deduction on order

### Payment Gateways
- ✅ Cash on Delivery (built-in)
- ✅ Stripe integration (ready for API keys)
- ✅ PayPal integration (ready for API keys)
- ✅ Payment status tracking
- ✅ Refund processing

### Customer Management
- ✅ Customer profiles with contact info
- ✅ Order history per customer
- ✅ Total spent tracking
- ✅ Customer statistics

### Admin Dashboard
- ✅ Real-time statistics (products, orders, revenue)
- ✅ Interactive charts (sales overview, top products, order status)
- ✅ Category management
- ✅ Order management with status updates
- ✅ Customer management
- ✅ Payment tracking
- ✅ Store configuration (currency, tax, shipping)

### Customer Storefront
- ✅ Modern, responsive design
- ✅ Product catalog with filtering
- ✅ Category browsing
- ✅ Product search
- ✅ Product detail modal
- ✅ Shopping cart sidebar
- ✅ Checkout process
- ✅ Multi-language support (Arabic, English, French)
- ✅ RTL support for Arabic

### ERP Integration
- ✅ Sync products with Inventory module
- ✅ Convert orders to Sales invoices
- ✅ Sync customers with Sales module
- ✅ Automatic stock updates
- ✅ Bulk sync operations

---

## 🏗️ Architecture

```
modules/ecommerce/
├── ecommerce_admin.html          # Admin panel UI
├── storefront.html               # Customer storefront UI
├── ecommerce_core.js             # Core data management (localStorage)
├── ecommerce_admin.js            # Admin panel logic
├── storefront.js                 # Storefront logic
├── payment_service.js            # Payment gateway integration
└── README.md                     # This file

backend/
├── ecommerce_service.py          # Backend service (Python)
└── ecommerce_integration.py      # ERP integration service
```

### Data Flow

```
Frontend (localStorage)
    ↓
ecommerce_core.js (EcommerceDataManager)
    ↓
Backend (PostgreSQL/JSON)
    ↓
ecommerce_service.py (EcommerceService)
    ↓
ecommerce_integration.py (sync with Inventory/Sales)
```

---

## 🚀 Installation

### Prerequisites
- Zeralda ERP installed and running
- Modern web browser (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- localStorage available

### Steps

1. **Copy files to your Zeralda ERP installation:**
   ```bash
   # Copy the entire ecommerce module
   cp -r modules/ecommerce /path/to/zeralda-erp/modules/
   
   # Copy backend services
   cp backend/ecommerce_service.py /path/to/zeralda-erp/backend/
   cp backend/ecommerce_integration.py /path/to/zeralda-erp/backend/
   ```

2. **Initialize backend service in server.py:**
   Add this to your server.py after the store initialization:
   ```python
   from backend.ecommerce_service import EcommerceService
   from backend.ecommerce_integration import EcommerceIntegrationService
   
   # Initialize e-commerce service
   ecommerce_service = EcommerceService(_read_store, _write_store)
   ecommerce_integration = EcommerceIntegrationService(
       ecommerce_service, _read_store, _write_store
   )
   ```

3. **Add API routes to server.py:**
   ```python
   # E-commerce API endpoints
   def do_api_ecommerce_products(self):
       """GET/POST /api/ecommerce/products"""
       if self.command == 'GET':
           filters = self.get_query_params()
           products = ecommerce_service.get_products(filters)
           self.send_json_response(products)
       elif self.command == 'POST':
           data = self.get_json_body()
           product = ecommerce_service.create_product(data)
           self.send_json_response(product)
   
   def do_api_ecommerce_orders(self):
       """GET/POST /api/ecommerce/orders"""
       if self.command == 'GET':
           orders = ecommerce_service.get_orders()
           self.send_json_response(orders)
       elif self.command == 'POST':
           data = self.get_json_body()
           order = ecommerce_service.create_order(data)
           self.send_json_response(order)
   
   # Add similar endpoints for categories, customers, payments, etc.
   ```

4. **Add menu links to dashboard:**
   Add these links to your main dashboard HTML:
   ```html
   <a href="modules/ecommerce/ecommerce_admin.html" class="nav-item">
       <i class="fas fa-shopping-cart"></i>
       <span>E-commerce Admin</span>
   </a>
   <a href="modules/ecommerce/storefront.html" class="nav-item">
       <i class="fas fa-store"></i>
       <span>Online Store</span>
   </a>
   ```

---

## 🎯 Quick Start

### 1. Open Admin Panel
Navigate to: `modules/ecommerce/ecommerce_admin.html`

### 2. Configure Store Settings
- Go to Settings tab
- Set store name, email, phone
- Configure currency (USD, EUR, DZD, SAR)
- Set tax rate and shipping cost
- Click "Save Settings"

### 3. Add Categories
- Go to Categories tab
- Click "Add Category"
- Enter category name and description
- Set status to "active"
- Click "Save Category"

### 4. Add Products
- Go to Products tab
- Click "Add Product"
- Fill in product details:
  - Name (required)
  - SKU (optional)
  - Category (required)
  - Price (required)
  - Cost price (optional)
  - Stock quantity
  - Weight
  - Status
  - Description
  - Upload images
- Click "Save Product"

### 5. Open Storefront
Navigate to: `modules/ecommerce/storefront.html`

### 6. Test Checkout
- Browse products
- Add items to cart
- Click cart icon
- Click "Checkout"
- Enter customer information
- Complete order

---

## 📊 Admin Panel

### Dashboard
- **Statistics Cards**: Total products, orders, revenue
- **Sales Chart**: Monthly sales trend
- **Top Products Chart**: Best-selling products
- **Order Status Chart**: Order distribution by status
- **Revenue by Category**: Revenue per category

### Products Tab
- **Add Product**: Create new products with full details
- **Edit Product**: Modify existing products
- **Delete Product**: Remove products (with confirmation)
- **View Product**: Quick product details
- **Search**: Filter products by name/SKU
- **Export**: Export all products to JSON
- **Import**: Import products from JSON file

### Categories Tab
- **Add Category**: Create new product categories
- **Edit Category**: Modify category details
- **Delete Category**: Remove categories
- **Product Count**: Auto-calculated per category

### Orders Tab
- **Create Order**: Manual order creation
- **View Order**: Full order details with items
- **Update Status**: Change order status (pending → processing → shipped → delivered → cancelled)
- **Filter**: Filter by status or search by order number/customer
- **Payment Status**: Track payment status

### Customers Tab
- **Add Customer**: Create customer profiles
- **View Customer**: Customer details and order history
- **Edit Customer**: Update customer information
- **Delete Customer**: Remove customers
- **Statistics**: Total orders and spent per customer

### Payments Tab
- **Record Payment**: Manual payment entry
- **View Payment**: Payment details
- **Status Tracking**: Payment status (pending, completed, refunded)

### Settings Tab
- **Store Configuration**: Name, email, phone
- **Currency**: USD, EUR, DZD, SAR
- **Tax Rate**: Percentage for tax calculation
- **Shipping Cost**: Flat shipping fee
- **Payment Methods**: Enable/disable payment gateways

---

## 🛒 Storefront

### Features
- **Hero Section**: Welcome banner with call-to-action
- **Category Grid**: Browse by category
- **Product Grid**: Product cards with images, prices, actions
- **Search Bar**: Real-time product search
- **Product Modal**: Detailed product view
- **Cart Sidebar**: Slide-out cart with items
- **Checkout Flow**: Simple checkout process

### User Flow
1. **Browse**: View products by category or search
2. **View Details**: Click product for more information
3. **Add to Cart**: Click "Add" button
4. **Review Cart**: Click cart icon to view items
5. **Checkout**: Enter customer details and complete order
6. **Confirmation**: Receive order number and confirmation

### Responsive Design
- Desktop: Full layout with sidebar cart
- Tablet: Optimized grid layout
- Mobile: Single column with touch-friendly controls

---

## 💳 Payment Integration

### Cash on Delivery (Built-in)
- No configuration required
- Payment marked as "pending" until delivery
- Can be updated to "paid" upon delivery

### Stripe Integration
To enable Stripe:

1. Get API keys from [Stripe Dashboard](https://dashboard.stripe.com/)
2. Configure in settings:
   ```javascript
   paymentService.init({
       stripe: {
           publicKey: 'pk_test_...',
           enabled: true
       }
   });
   ```
3. For production, implement backend processing:
   - Use Stripe.js on frontend
   - Process payments on backend with secret key
   - Handle webhooks for payment confirmations

### PayPal Integration
To enable PayPal:

1. Get Client ID from [PayPal Developer](https://developer.paypal.com/)
2. Configure in settings:
   ```javascript
   paymentService.init({
       paypal: {
           clientId: 'AX...',
           enabled: true
       }
   });
   ```
3. For production, implement backend processing:
   - Use PayPal SDK on frontend
   - Process payments on backend
   - Handle IPN/webhooks for confirmations

### Security Notes
⚠️ **Important**: Never store secret API keys in frontend code. Always process payments on backend with proper validation and webhook handling.

---

## 🔗 Integration with ERP

### Product Sync
Sync products between E-commerce and Inventory modules:

```python
# Sync E-commerce → Inventory
result = ecommerce_integration.sync_products_to_inventory('ecommerce_to_inventory')

# Sync Inventory → E-commerce
result = ecommerce_integration.sync_products_to_inventory('inventory_to_ecommerce')
```

### Order to Invoice
Convert E-commerce orders to Sales invoices:

```python
invoice = ecommerce_integration.sync_order_to_invoice(order_id)
```

### Customer Sync
Sync E-commerce customers to Sales module:

```python
customer = ecommerce_integration.sync_customer_to_sales(customer_id)
```

### Auto-Sync on Order
Automatically sync when order is placed:

```python
result = ecommerce_integration.auto_sync_on_order(order_id)
```

### Bulk Sync
Sync all data at once:

```python
results = ecommerce_integration.bulk_sync_all()
```

### Integration Status
Check sync status:

```python
status = ecommerce_integration.get_integration_status()
```

---

## 📚 API Reference

### Products
- `GET /api/ecommerce/products` - List all products
- `POST /api/ecommerce/products` - Create product
- `GET /api/ecommerce/products/{id}` - Get product
- `PUT /api/ecommerce/products/{id}` - Update product
- `DELETE /api/ecommerce/products/{id}` - Delete product

### Categories
- `GET /api/ecommerce/categories` - List categories
- `POST /api/ecommerce/categories` - Create category
- `GET /api/ecommerce/categories/{id}` - Get category
- `PUT /api/ecommerce/categories/{id}` - Update category
- `DELETE /api/ecommerce/categories/{id}` - Delete category

### Orders
- `GET /api/ecommerce/orders` - List orders
- `POST /api/ecommerce/orders` - Create order
- `GET /api/ecommerce/orders/{id}` - Get order
- `PUT /api/ecommerce/orders/{id}` - Update order
- `DELETE /api/ecommerce/orders/{id}` - Delete order

### Customers
- `GET /api/ecommerce/customers` - List customers
- `POST /api/ecommerce/customers` - Create customer
- `GET /api/ecommerce/customers/{id}` - Get customer
- `PUT /api/ecommerce/customers/{id}` - Update customer
- `DELETE /api/ecommerce/customers/{id}` - Delete customer

### Payments
- `GET /api/ecommerce/payments` - List payments
- `POST /api/ecommerce/payments` - Create payment
- `GET /api/ecommerce/payments/{id}` - Get payment

### Settings
- `GET /api/ecommerce/settings` - Get settings
- `PUT /api/ecommerce/settings` - Update settings

### Statistics
- `GET /api/ecommerce/statistics` - Get statistics

### Integration
- `POST /api/ecommerce/sync/products` - Sync products
- `POST /api/ecommerce/sync/order/{id}` - Sync order to invoice
- `POST /api/ecommerce/sync/customer/{id}` - Sync customer
- `GET /api/ecommerce/sync/status` - Get sync status
- `POST /api/ecommerce/sync/bulk` - Bulk sync all

---

## 💾 Storage Structure

### localStorage Keys

| Key | Description | Type |
|-----|-------------|------|
| `ecommerce-products` | Product catalog | Array |
| `ecommerce-categories` | Product categories | Array |
| `ecommerce-orders` | Order records | Array |
| `ecommerce-customers` | Customer data | Array |
| `ecommerce-payments` | Payment records | Array |
| `ecommerce-settings` | Store configuration | Object |
| `ecommerce-cart` | Shopping cart (session) | Array |

### Product Object
```javascript
{
    id: "EC-1234567890-1234",
    name: "Product Name",
    sku: "SKU-001",
    categoryId: "EC-1234567890-5678",
    price: 99.99,
    cost: 50.00,
    stock: 100,
    weight: 1.5,
    status: "active",
    description: "Product description",
    images: ["image1.jpg", "image2.jpg"],
    createdAt: "2026-10-09T12:00:00Z",
    updatedAt: "2026-10-09T12:00:00Z"
}
```

### Order Object
```javascript
{
    id: "EC-1234567890-1234",
    orderNumber: "ORD-20261009-0001",
    customerId: "EC-1234567890-9999",
    customerName: "John Doe",
    customerEmail: "john@example.com",
    customerPhone: "+1234567890",
    shippingAddress: "123 Main St",
    items: [
        {
            productId: "EC-1234567890-1111",
            name: "Product 1",
            price: 99.99,
            quantity: 2
        }
    ],
    subtotal: 199.98,
    tax: 19.99,
    shipping: 10.00,
    total: 229.97,
    status: "pending",
    paymentStatus: "pending",
    createdAt: "2026-10-09T12:00:00Z",
    updatedAt: "2026-10-09T12:00:00Z"
}
```

---

## 🔧 Troubleshooting

### Products not showing in storefront
**Problem**: Products added but not visible in store

**Solution**:
1. Check product status is "active"
2. Check stock quantity > 0
3. Verify category is "active"
4. Clear browser cache and reload

### Cart not persisting
**Problem**: Cart items lost on page refresh

**Solution**:
1. Check localStorage is enabled in browser
2. Check browser privacy settings
3. Verify no browser extensions blocking localStorage

### Orders not syncing to invoices
**Problem**: Orders created but not appearing in Sales module

**Solution**:
1. Check integration service is initialized in server.py
2. Verify `syncedToInvoice` flag in order
3. Manually trigger sync: `ecommerce_integration.sync_order_to_invoice(order_id)`

### Stock not updating
**Problem**: Product stock not decreasing after order

**Solution**:
1. Check `inventorySync` setting is enabled
2. Verify order has `paymentStatus: 'paid'`
3. Manually sync: `ecommerce_integration.sync_products_to_inventory('ecommerce_to_inventory')`

### Payment gateway not working
**Problem**: Stripe/PayPal payments failing

**Solution**:
1. Verify API keys are correct
2. Check backend payment processing is implemented
3. Review payment service logs
4. Test in sandbox mode first

### RTL layout issues
**Problem**: Arabic text not displaying correctly

**Solution**:
1. Ensure `<html lang="ar" dir="rtl">` is set
2. Check CSS has RTL support
3. Verify font supports Arabic characters

---

## 🌐 Multi-Language Support

The module supports 3 languages:
- **Arabic** (ar) - RTL layout
- **English** (en) - Default
- **French** (fr)

To change language, use the theme manager or add `?lang=ar` to URL.

---

## 📝 Development

### Adding New Features

1. **Frontend**: Add to `ecommerce_core.js` for data logic
2. **Admin UI**: Add to `ecommerce_admin.js` for admin functions
3. **Storefront**: Add to `storefront.js` for customer functions
4. **Backend**: Add to `ecommerce_service.py` for API endpoints
5. **Integration**: Add to `ecommerce_integration.py` for ERP sync

### Testing

```javascript
// In browser console
const storage = window.ecommerceStorage;

// Test product creation
storage.addProduct({
    name: 'Test Product',
    sku: 'TEST-001',
    categoryId: 'category-id',
    price: 99.99,
    stock: 10,
    status: 'active'
});

// Test order creation
storage.addOrder({
    customerName: 'Test Customer',
    items: [{ productId: 'product-id', name: 'Product', price: 99.99, quantity: 1 }],
    subtotal: 99.99,
    tax: 0,
    shipping: 0,
    total: 99.99
});
```

---

## 📄 License

© 2026 Zeralda ERP. All rights reserved.

---

## 🤝 Support

For issues, questions, or feature requests:
- Check this README first
- Review troubleshooting section
- Contact Zeralda ERP support team

---

## 🎉 Summary

This E-commerce module provides a complete online store solution integrated with Zeralda ERP. It includes:

✅ Professional admin panel with dashboard  
✅ Customer-facing storefront  
✅ Full product and category management  
✅ Shopping cart and checkout  
✅ Order processing and tracking  
✅ Payment gateway integration  
✅ Seamless ERP integration  
✅ Multi-language support  
✅ Responsive design  
✅ Export/import functionality  

**Version**: 1.0.0  
**Last Updated**: October 9, 2026  
**Status**: ✅ Production Ready
