"""
Zeralda ERP - E-commerce Integration Service
===========================================
Integrates E-commerce module with existing Inventory and Sales modules
"""

from typing import Dict, List, Optional
from datetime import datetime


class EcommerceIntegrationService:
    """Integration between E-commerce and existing ERP modules"""
    
    def __init__(self, ecommerce_service, store_getter, store_setter):
        """
        Initialize integration service
        
        Args:
            ecommerce_service: Instance of EcommerceService
            store_getter: Function to get the entire store dict
            store_setter: Function to set the entire store dict
        """
        self.ecommerce = ecommerce_service
        self._get_store = store_getter
        self._set_store = store_setter
    
    # Storage keys for existing modules
    INVENTORY_KEY = 'products-data'
    SALES_INVOICES_KEY = 'invoices-data'
    SALES_CUSTOMERS_KEY = 'customers-data'
    
    def sync_products_to_inventory(self, direction: str = 'ecommerce_to_inventory') -> Dict:
        """
        Sync products between E-commerce and Inventory modules
        
        Args:
            direction: 'ecommerce_to_inventory' or 'inventory_to_ecommerce'
        
        Returns:
            Dict with sync results
        """
        store = self._get_store()
        
        ecommerce_products = self.ecommerce.get_products()
        inventory_products = store.get(self.INVENTORY_KEY, [])
        
        synced = 0
        conflicts = []
        
        if direction == 'ecommerce_to_inventory':
            # Sync E-commerce products to Inventory
            for ecom_product in ecommerce_products:
                # Find matching product by SKU or code
                inv_product = None
                for p in inventory_products:
                    if p.get('sku') == ecom_product.get('sku') or p.get('code') == ecom_product.get('sku'):
                        inv_product = p
                        break
                
                if inv_product:
                    # Update existing
                    inv_product['quantity'] = ecom_product.get('stock', inv_product.get('quantity', 0))
                    inv_product['price'] = ecom_product.get('price', inv_product.get('price', 0))
                    inv_product['name'] = ecom_product.get('name', inv_product.get('name', ''))
                    synced += 1
                else:
                    # Create new inventory product
                    new_inv_product = {
                        'code': ecom_product.get('sku', ''),
                        'name': ecom_product.get('name', ''),
                        'price': ecom_product.get('price', 0),
                        'quantity': ecom_product.get('stock', 0),
                        'unit': 'pcs',
                        'category': ecom_product.get('categoryId', ''),
                        'description': ecom_product.get('description', ''),
                        'createdAt': datetime.utcnow().isoformat()
                    }
                    inventory_products.append(new_inv_product)
                    synced += 1
            
            store[self.INVENTORY_KEY] = inventory_products
            self._set_store(store)
            
        elif direction == 'inventory_to_ecommerce':
            # Sync Inventory products to E-commerce
            for inv_product in inventory_products:
                # Find matching product by SKU/code
                ecom_product = None
                for p in ecommerce_products:
                    if p.get('sku') == inv_product.get('code') or p.get('sku') == inv_product.get('sku'):
                        ecom_product = p
                        break
                
                if ecom_product:
                    # Update existing
                    self.ecommerce.update_product(ecom_product['id'], {
                        'stock': inv_product.get('quantity', ecom_product.get('stock', 0)),
                        'price': inv_product.get('price', ecom_product.get('price', 0)),
                        'name': inv_product.get('name', ecom_product.get('name', ''))
                    })
                    synced += 1
                else:
                    # Create new e-commerce product
                    self.ecommerce.create_product({
                        'name': inv_product.get('name', ''),
                        'sku': inv_product.get('code', ''),
                        'price': inv_product.get('price', 0),
                        'stock': inv_product.get('quantity', 0),
                        'description': inv_product.get('description', ''),
                        'status': 'active' if inv_product.get('quantity', 0) > 0 else 'inactive'
                    })
                    synced += 1
        
        return {
            'success': True,
            'synced': synced,
            'conflicts': conflicts,
            'direction': direction
        }
    
    def sync_order_to_invoice(self, order_id: str) -> Optional[Dict]:
        """
        Convert E-commerce order to Sales invoice
        
        Args:
            order_id: E-commerce order ID
        
        Returns:
            Created invoice dict or None
        """
        order = self.ecommerce.get_order(order_id)
        if not order:
            return None
        
        store = self._get_store()
        invoices = store.get(self.SALES_INVOICES_KEY, [])
        
        # Create invoice from order
        invoice = {
            'id': f'INV-{datetime.utcnow().strftime("%Y%m%d")}-{len(invoices) + 1:04d}',
            'invoiceNumber': order.get('orderNumber', ''),
            'customerName': order.get('customerName', ''),
            'customerEmail': order.get('customerEmail', ''),
            'customerPhone': order.get('customerPhone', ''),
            'date': order.get('createdAt', '').split('T')[0],
            'items': [],
            'subtotal': order.get('subtotal', 0),
            'tax': order.get('tax', 0),
            'total': order.get('total', 0),
            'status': 'paid' if order.get('paymentStatus') == 'paid' else 'pending',
            'paymentStatus': order.get('paymentStatus', 'pending'),
            'notes': f'E-commerce order: {order.get("orderNumber", "")}',
            'createdAt': datetime.utcnow().isoformat()
        }
        
        # Convert order items to invoice items
        for item in order.get('items', []):
            invoice_item = {
                'productId': item.get('productId', ''),
                'name': item.get('name', ''),
                'quantity': item.get('quantity', 0),
                'unitPrice': item.get('price', 0),
                'total': item.get('price', 0) * item.get('quantity', 0)
            }
            invoice['items'].append(invoice_item)
        
        invoices.append(invoice)
        store[self.SALES_INVOICES_KEY] = invoices
        self._set_store(store)
        
        # Update order to mark as synced
        self.ecommerce.update_order(order_id, {'syncedToInvoice': True, 'invoiceId': invoice['id']})
        
        return invoice
    
    def sync_customer_to_sales(self, customer_id: str) -> Optional[Dict]:
        """
        Sync E-commerce customer to Sales customers
        
        Args:
            customer_id: E-commerce customer ID
        
        Returns:
            Synced customer dict or None
        """
        ecom_customer = self.ecommerce.get_customer(customer_id)
        if not ecom_customer:
            return None
        
        store = self._get_store()
        sales_customers = store.get(self.SALES_CUSTOMERS_KEY, [])
        
        # Check if customer already exists in sales
        existing = None
        for c in sales_customers:
            if c.get('email') == ecom_customer.get('email'):
                existing = c
                break
        
        if existing:
            # Update existing
            existing['name'] = ecom_customer.get('name', existing.get('name', ''))
            existing['phone'] = ecom_customer.get('phone', existing.get('phone', ''))
            existing['address'] = ecom_customer.get('address', existing.get('address', ''))
            store[self.SALES_CUSTOMERS_KEY] = sales_customers
            self._set_store(store)
            return existing
        else:
            # Create new sales customer
            new_customer = {
                'name': ecom_customer.get('name', ''),
                'email': ecom_customer.get('email', ''),
                'phone': ecom_customer.get('phone', ''),
                'address': ecom_customer.get('address', ''),
                'balance': 0,
                'active': True,
                'createdAt': datetime.utcnow().isoformat()
            }
            sales_customers.append(new_customer)
            store[self.SALES_CUSTOMERS_KEY] = sales_customers
            self._set_store(store)
            return new_customer
    
    def auto_sync_on_order(self, order_id: str) -> Dict:
        """
        Automatically sync order to invoice and customer when order is placed
        
        Args:
            order_id: E-commerce order ID
        
        Returns:
            Sync results
        """
        order = self.ecommerce.get_order(order_id)
        if not order:
            return {'success': False, 'error': 'Order not found'}
        
        results = {
            'success': True,
            'invoice': None,
            'customer': None
        }
        
        # Sync customer if exists
        if order.get('customerId'):
            results['customer'] = self.sync_customer_to_sales(order['customerId'])
        
        # Sync order to invoice
        results['invoice'] = self.sync_order_to_invoice(order_id)
        
        return results
    
    def get_integration_status(self) -> Dict:
        """
        Get status of integration between modules
        
        Returns:
            Dict with integration status
        """
        store = self._get_store()
        
        ecommerce_products = len(self.ecommerce.get_products())
        inventory_products = len(store.get(self.INVENTORY_KEY, []))
        
        ecommerce_orders = len(self.ecommerce.get_orders())
        sales_invoices = len(store.get(self.SALES_INVOICES_KEY, []))
        
        # Count synced orders
        synced_orders = sum(1 for o in self.ecommerce.get_orders() if o.get('syncedToInvoice'))
        
        return {
            'products': {
                'ecommerce': ecommerce_products,
                'inventory': inventory_products,
                'syncNeeded': abs(ecommerce_products - inventory_products) > 0
            },
            'orders': {
                'ecommerce': ecommerce_orders,
                'invoices': sales_invoices,
                'synced': synced_orders,
                'pendingSync': ecommerce_orders - synced_orders
            },
            'lastSync': datetime.utcnow().isoformat()
        }
    
    def bulk_sync_all(self) -> Dict:
        """
        Perform bulk sync of all data
        
        Returns:
            Sync results
        """
        results = {
            'products': None,
            'orders': [],
            'customers': []
        }
        
        # Sync products
        results['products'] = self.sync_products_to_inventory('ecommerce_to_inventory')
        
        # Sync pending orders
        orders = self.ecommerce.get_orders()
        for order in orders:
            if not order.get('syncedToInvoice') and order.get('status') in ['delivered', 'paid']:
                result = self.auto_sync_on_order(order['id'])
                results['orders'].append({
                    'orderId': order['id'],
                    'orderNumber': order.get('orderNumber'),
                    'result': result
                })
        
        # Sync all customers
        customers = self.ecommerce.get_customers()
        for customer in customers:
            synced = self.sync_customer_to_sales(customer['id'])
            if synced:
                results['customers'].append({
                    'customerId': customer['id'],
                    'name': customer.get('name'),
                    'result': 'synced'
                })
        
        return results
