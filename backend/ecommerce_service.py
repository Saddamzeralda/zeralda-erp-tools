"""
Zeralda ERP - E-commerce Backend Service
========================================
Backend API endpoints for E-commerce functionality
Integrates with existing storage system (PostgreSQL + JSON fallback)
"""

import json
from datetime import datetime
from typing import Dict, List, Optional, Any


class EcommerceService:
    """E-commerce business logic and data management"""
    
    # Storage keys (must match frontend)
    STORAGE_KEYS = {
        'PRODUCTS': 'ecommerce-products',
        'CATEGORIES': 'ecommerce-categories',
        'ORDERS': 'ecommerce-orders',
        'CUSTOMERS': 'ecommerce-customers',
        'PAYMENTS': 'ecommerce-payments',
        'SETTINGS': 'ecommerce-settings',
        'CART': 'ecommerce-cart'
    }
    
    def __init__(self, store_getter, store_setter):
        """
        Initialize with store getter/setter functions
        
        Args:
            store_getter: Function to get the entire store dict
            store_setter: Function to set the entire store dict
        """
        self._get_store = store_getter
        self._set_store = store_setter
        self._initialize_storage()
    
    def _initialize_storage(self):
        """Initialize e-commerce storage keys if they don't exist"""
        store = self._get_store()
        
        # Initialize with empty arrays if not present
        for key in self.STORAGE_KEYS.values():
            if key not in store:
                store[key] = []
        
        # Initialize default categories if empty
        if not store[self.STORAGE_KEYS['CATEGORIES']]:
            store[self.STORAGE_KEYS['CATEGORIES']] = [
                {
                    'id': self._generate_id(),
                    'name': 'Electronics',
                    'description': 'Electronic devices and accessories',
                    'status': 'active',
                    'productCount': 0,
                    'createdAt': datetime.utcnow().isoformat()
                },
                {
                    'id': self._generate_id(),
                    'name': 'Clothing',
                    'description': 'Apparel and fashion items',
                    'status': 'active',
                    'productCount': 0,
                    'createdAt': datetime.utcnow().isoformat()
                }
            ]
        
        # Initialize default settings if not present
        if not store.get(self.STORAGE_KEYS['SETTINGS']):
            store[self.STORAGE_KEYS['SETTINGS']] = {
                'storeName': 'Zeralda Store',
                'storeEmail': '',
                'storePhone': '',
                'currency': 'USD',
                'taxRate': 0,
                'shippingCost': 0,
                'enabledPaymentMethods': ['cash', 'card'],
                'lowStockThreshold': 10,
                'autoOrderConfirmation': True,
                'inventorySync': True
            }
        
        self._set_store(store)
    
    def _generate_id(self) -> str:
        """Generate unique ID"""
        import time
        import random
        return f'EC-{int(time.time() * 1000)}-{random.randint(1000, 9999)}'
    
    def _get_data(self, key: str) -> List:
        """Get data from storage"""
        store = self._get_store()
        return store.get(key, [])
    
    def _set_data(self, key: str, data: List):
        """Set data in storage"""
        store = self._get_store()
        store[key] = data
        self._set_store(store)
    
    # Product operations
    def get_products(self, filters: Optional[Dict] = None) -> List[Dict]:
        """Get all products with optional filters"""
        products = self._get_data(self.STORAGE_KEYS['PRODUCTS'])
        
        if filters:
            if 'category_id' in filters:
                products = [p for p in products if p.get('categoryId') == filters['category_id']]
            if 'status' in filters:
                products = [p for p in products if p.get('status') == filters['status']]
            if 'search' in filters:
                search = filters['search'].lower()
                products = [p for p in products if 
                           search in p.get('name', '').lower() or 
                           search in p.get('sku', '').lower()]
        
        return products
    
    def get_product(self, product_id: str) -> Optional[Dict]:
        """Get single product by ID"""
        products = self._get_data(self.STORAGE_KEYS['PRODUCTS'])
        for product in products:
            if product.get('id') == product_id:
                return product
        return None
    
    def create_product(self, product_data: Dict) -> Dict:
        """Create new product"""
        products = self._get_data(self.STORAGE_KEYS['PRODUCTS'])
        
        new_product = {
            'id': self._generate_id(),
            **product_data,
            'createdAt': datetime.utcnow().isoformat(),
            'updatedAt': datetime.utcnow().isoformat(),
            'images': product_data.get('images', [])
        }
        
        products.append(new_product)
        self._set_data(self.STORAGE_KEYS['PRODUCTS'], products)
        
        # Update category product count
        if product_data.get('categoryId'):
            self._update_category_count(product_data['categoryId'])
        
        return new_product
    
    def update_product(self, product_id: str, updates: Dict) -> Optional[Dict]:
        """Update existing product"""
        products = self._get_data(self.STORAGE_KEYS['PRODUCTS'])
        
        for i, product in enumerate(products):
            if product.get('id') == product_id:
                products[i] = {
                    **product,
                    **updates,
                    'updatedAt': datetime.utcnow().isoformat()
                }
                self._set_data(self.STORAGE_KEYS['PRODUCTS'], products)
                
                # Update category count if changed
                if 'categoryId' in updates:
                    self._update_category_count(updates['categoryId'])
                
                return products[i]
        
        return None
    
    def delete_product(self, product_id: str) -> bool:
        """Delete product"""
        products = self._get_data(self.STORAGE_KEYS['PRODUCTS'])
        original_length = len(products)
        
        # Get category ID before deletion
        product = self.get_product(product_id)
        category_id = product.get('categoryId') if product else None
        
        products = [p for p in products if p.get('id') != product_id]
        self._set_data(self.STORAGE_KEYS['PRODUCTS'], products)
        
        # Update category count
        if category_id:
            self._update_category_count(category_id)
        
        return len(products) < original_length
    
    # Category operations
    def get_categories(self) -> List[Dict]:
        """Get all categories"""
        return self._get_data(self.STORAGE_KEYS['CATEGORIES'])
    
    def get_category(self, category_id: str) -> Optional[Dict]:
        """Get single category by ID"""
        categories = self._get_data(self.STORAGE_KEYS['CATEGORIES'])
        for category in categories:
            if category.get('id') == category_id:
                return category
        return None
    
    def create_category(self, category_data: Dict) -> Dict:
        """Create new category"""
        categories = self._get_data(self.STORAGE_KEYS['CATEGORIES'])
        
        new_category = {
            'id': self._generate_id(),
            **category_data,
            'productCount': 0,
            'createdAt': datetime.utcnow().isoformat()
        }
        
        categories.append(new_category)
        self._set_data(self.STORAGE_KEYS['CATEGORIES'], categories)
        
        return new_category
    
    def update_category(self, category_id: str, updates: Dict) -> Optional[Dict]:
        """Update existing category"""
        categories = self._get_data(self.STORAGE_KEYS['CATEGORIES'])
        
        for i, category in enumerate(categories):
            if category.get('id') == category_id:
                categories[i] = {
                    **category,
                    **updates,
                    'updatedAt': datetime.utcnow().isoformat()
                }
                self._set_data(self.STORAGE_KEYS['CATEGORIES'], categories)
                return categories[i]
        
        return None
    
    def delete_category(self, category_id: str) -> bool:
        """Delete category"""
        categories = self._get_data(self.STORAGE_KEYS['CATEGORIES'])
        original_length = len(categories)
        
        categories = [c for c in categories if c.get('id') != category_id]
        self._set_data(self.STORAGE_KEYS['CATEGORIES'], categories)
        
        return len(categories) < original_length
    
    def _update_category_count(self, category_id: str):
        """Update product count for a category"""
        products = self._get_data(self.STORAGE_KEYS['PRODUCTS'])
        count = sum(1 for p in products if p.get('categoryId') == category_id)
        
        categories = self._get_data(self.STORAGE_KEYS['CATEGORIES'])
        for i, category in enumerate(categories):
            if category.get('id') == category_id:
                categories[i]['productCount'] = count
                break
        
        self._set_data(self.STORAGE_KEYS['CATEGORIES'], categories)
    
    # Order operations
    def get_orders(self, filters: Optional[Dict] = None) -> List[Dict]:
        """Get all orders with optional filters"""
        orders = self._get_data(self.STORAGE_KEYS['ORDERS'])
        
        if filters:
            if 'status' in filters:
                orders = [o for o in orders if o.get('status') == filters['status']]
            if 'customer_id' in filters:
                orders = [o for o in orders if o.get('customerId') == filters['customer_id']]
            if 'date_from' in filters:
                orders = [o for o in orders if o.get('createdAt', '') >= filters['date_from']]
        
        return orders
    
    def get_order(self, order_id: str) -> Optional[Dict]:
        """Get single order by ID"""
        orders = self._get_data(self.STORAGE_KEYS['ORDERS'])
        for order in orders:
            if order.get('id') == order_id:
                return order
        return None
    
    def create_order(self, order_data: Dict) -> Dict:
        """Create new order"""
        orders = self._get_data(self.STORAGE_KEYS['ORDERS'])
        
        # Generate order number
        date = datetime.utcnow()
        order_num = f"ORD-{date.strftime('%Y%m%d')}-{len(orders) + 1:04d}"
        
        new_order = {
            'id': self._generate_id(),
            'orderNumber': order_num,
            **order_data,
            'status': 'pending',
            'paymentStatus': 'pending',
            'createdAt': datetime.utcnow().isoformat(),
            'updatedAt': datetime.utcnow().isoformat()
        }
        
        orders.insert(0, new_order)  # Add to beginning
        self._set_data(self.STORAGE_KEYS['ORDERS'], orders)
        
        # Update stock if inventory sync is enabled
        settings = self.get_settings()
        if settings.get('inventorySync', True):
            self._update_stock_from_order(new_order)
        
        # Update customer stats
        if order_data.get('customerId'):
            self._update_customer_stats(order_data['customerId'], order_data.get('total', 0))
        
        return new_order
    
    def update_order(self, order_id: str, updates: Dict) -> Optional[Dict]:
        """Update existing order"""
        orders = self._get_data(self.STORAGE_KEYS['ORDERS'])
        
        for i, order in enumerate(orders):
            if order.get('id') == order_id:
                orders[i] = {
                    **order,
                    **updates,
                    'updatedAt': datetime.utcnow().isoformat()
                }
                self._set_data(self.STORAGE_KEYS['ORDERS'], orders)
                return orders[i]
        
        return None
    
    def _update_stock_from_order(self, order: Dict):
        """Update product stock from order items"""
        products = self._get_data(self.STORAGE_KEYS['PRODUCTS'])
        
        for item in order.get('items', []):
            product_id = item.get('productId')
            quantity = item.get('quantity', 0)
            
            for i, product in enumerate(products):
                if product.get('id') == product_id:
                    current_stock = product.get('stock', 0)
                    products[i]['stock'] = max(0, current_stock - quantity)
                    
                    if products[i]['stock'] == 0:
                        products[i]['status'] = 'out_of_stock'
                    break
        
        self._set_data(self.STORAGE_KEYS['PRODUCTS'], products)
    
    # Customer operations
    def get_customers(self, filters: Optional[Dict] = None) -> List[Dict]:
        """Get all customers with optional filters"""
        customers = self._get_data(self.STORAGE_KEYS['CUSTOMERS'])
        
        if filters:
            if 'email' in filters:
                customers = [c for c in customers if c.get('email') == filters['email']]
            if 'search' in filters:
                search = filters['search'].lower()
                customers = [c for c in customers if 
                           search in c.get('name', '').lower() or 
                           search in c.get('email', '').lower()]
        
        return customers
    
    def get_customer(self, customer_id: str) -> Optional[Dict]:
        """Get single customer by ID"""
        customers = self._get_data(self.STORAGE_KEYS['CUSTOMERS'])
        for customer in customers:
            if customer.get('id') == customer_id:
                return customer
        return None
    
    def create_customer(self, customer_data: Dict) -> Dict:
        """Create new customer"""
        customers = self._get_data(self.STORAGE_KEYS['CUSTOMERS'])
        
        new_customer = {
            'id': self._generate_id(),
            **customer_data,
            'totalOrders': 0,
            'totalSpent': 0,
            'createdAt': datetime.utcnow().isoformat(),
            'updatedAt': datetime.utcnow().isoformat()
        }
        
        customers.append(new_customer)
        self._set_data(self.STORAGE_KEYS['CUSTOMERS'], customers)
        
        return new_customer
    
    def update_customer(self, customer_id: str, updates: Dict) -> Optional[Dict]:
        """Update existing customer"""
        customers = self._get_data(self.STORAGE_KEYS['CUSTOMERS'])
        
        for i, customer in enumerate(customers):
            if customer.get('id') == customer_id:
                customers[i] = {
                    **customer,
                    **updates,
                    'updatedAt': datetime.utcnow().isoformat()
                }
                self._set_data(self.STORAGE_KEYS['CUSTOMERS'], customers)
                return customers[i]
        
        return None
    
    def _update_customer_stats(self, customer_id: str, order_amount: float):
        """Update customer order statistics"""
        customers = self._get_data(self.STORAGE_KEYS['CUSTOMERS'])
        
        for i, customer in enumerate(customers):
            if customer.get('id') == customer_id:
                customers[i]['totalOrders'] = customers[i].get('totalOrders', 0) + 1
                customers[i]['totalSpent'] = customers[i].get('totalSpent', 0) + order_amount
                customers[i]['updatedAt'] = datetime.utcnow().isoformat()
                break
        
        self._set_data(self.STORAGE_KEYS['CUSTOMERS'], customers)
    
    # Payment operations
    def get_payments(self, filters: Optional[Dict] = None) -> List[Dict]:
        """Get all payments with optional filters"""
        payments = self._get_data(self.STORAGE_KEYS['PAYMENTS'])
        
        if filters:
            if 'order_id' in filters:
                payments = [p for p in payments if p.get('orderId') == filters['order_id']]
            if 'status' in filters:
                payments = [p for p in payments if p.get('status') == filters['status']]
        
        return payments
    
    def create_payment(self, payment_data: Dict) -> Dict:
        """Create new payment record"""
        payments = self._get_data(self.STORAGE_KEYS['PAYMENTS'])
        
        new_payment = {
            'id': self._generate_id(),
            **payment_data,
            'createdAt': datetime.utcnow().isoformat()
        }
        
        payments.insert(0, new_payment)
        self._set_data(self.STORAGE_KEYS['PAYMENTS'], payments)
        
        # Update order payment status if completed
        if payment_data.get('orderId') and payment_data.get('status') == 'completed':
            self.update_order(payment_data['orderId'], {'paymentStatus': 'paid'})
        
        return new_payment
    
    # Settings operations
    def get_settings(self) -> Dict:
        """Get e-commerce settings"""
        store = self._get_store()
        return store.get(self.STORAGE_KEYS['SETTINGS'], {})
    
    def update_settings(self, settings: Dict) -> Dict:
        """Update e-commerce settings"""
        store = self._get_store()
        current = self.get_settings()
        
        updated = {**current, **settings}
        store[self.STORAGE_KEYS['SETTINGS']] = updated
        self._set_store(store)
        
        return updated
    
    # Statistics
    def get_statistics(self) -> Dict:
        """Get e-commerce statistics"""
        products = self._get_data(self.STORAGE_KEYS['PRODUCTS'])
        orders = self._get_data(self.STORAGE_KEYS['ORDERS'])
        customers = self._get_data(self.STORAGE_KEYS['CUSTOMERS'])
        
        total_products = len(products)
        active_products = sum(1 for p in products if p.get('status') == 'active')
        total_orders = len(orders)
        total_revenue = sum(
            o.get('total', 0) for o in orders 
            if o.get('paymentStatus') == 'paid'
        )
        total_customers = len(customers)
        
        orders_by_status = {
            'pending': sum(1 for o in orders if o.get('status') == 'pending'),
            'processing': sum(1 for o in orders if o.get('status') == 'processing'),
            'shipped': sum(1 for o in orders if o.get('status') == 'shipped'),
            'delivered': sum(1 for o in orders if o.get('status') == 'delivered'),
            'cancelled': sum(1 for o in orders if o.get('status') == 'cancelled')
        }
        
        return {
            'totalProducts': total_products,
            'activeProducts': active_products,
            'totalOrders': total_orders,
            'totalRevenue': total_revenue,
            'totalCustomers': total_customers,
            'ordersByStatus': orders_by_status
        }
    
    # Export/Import
    def export_data(self) -> Dict:
        """Export all e-commerce data"""
        return {
            'products': self._get_data(self.STORAGE_KEYS['PRODUCTS']),
            'categories': self._get_data(self.STORAGE_KEYS['CATEGORIES']),
            'orders': self._get_data(self.STORAGE_KEYS['ORDERS']),
            'customers': self._get_data(self.STORAGE_KEYS['CUSTOMERS']),
            'payments': self._get_data(self.STORAGE_KEYS['PAYMENTS']),
            'settings': self.get_settings(),
            'exportedAt': datetime.utcnow().isoformat()
        }
    
    def import_data(self, data: Dict) -> bool:
        """Import e-commerce data"""
        try:
            if 'products' in data:
                self._set_data(self.STORAGE_KEYS['PRODUCTS'], data['products'])
            if 'categories' in data:
                self._set_data(self.STORAGE_KEYS['CATEGORIES'], data['categories'])
            if 'orders' in data:
                self._set_data(self.STORAGE_KEYS['ORDERS'], data['orders'])
            if 'customers' in data:
                self._set_data(self.STORAGE_KEYS['CUSTOMERS'], data['customers'])
            if 'payments' in data:
                self._set_data(self.STORAGE_KEYS['PAYMENTS'], data['payments'])
            if 'settings' in data:
                self.update_settings(data['settings'])
            return True
        except Exception as e:
            print(f"[E-commerce] Import error: {e}")
            return False
