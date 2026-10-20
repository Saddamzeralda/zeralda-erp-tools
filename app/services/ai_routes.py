"""
Zeralda ERP — AI Route Helpers

Shared constants and helper functions for AI-related route handlers.
Extracted from server.py to reduce monolith size and improve maintainability.

Future: Full route handler extraction into AIRoutesMixin class.
"""

# Canonical module map — keep in sync with shared/ai_chat_widget.js (window.MODULE_KEY_MAP)
MODULE_MAP = {
    'customers': 'customers-data', 'clients': 'customers-data', 'client': 'customers-data', 'customer': 'customers-data',
    'suppliers': 'suppliers-data', 'fournisseurs': 'suppliers-data', 'supplier': 'suppliers-data', 'fournisseur': 'suppliers-data',
    'employees': 'employees-data', 'personnel': 'employees-data', 'employee': 'employees-data',
    'products': 'products-data', 'produits': 'products-data', 'product': 'products-data', 'produit': 'products-data',
    'invoices': 'invoices-data', 'factures': 'invoices-data', 'invoice': 'invoices-data', 'facture': 'invoices-data',
    'proformas': 'proformas-data', 'proforma': 'proformas-data',
    'tenders': 'tenders-data', 'tender': 'tenders-data',
    'consultations': 'consultations-data', 'consultation': 'consultations-data',
    'leaves': 'hr-leaves', 'leave': 'hr-leaves',
    'transactions': 'finance-transactions', 'transaction': 'finance-transactions',
    'services': 'zeralda-services', 'service': 'zeralda-services'
}


# Whitelist of writable fields per module for AI-driven module_append.
# Purpose: prevent prompt-injection / arbitrary key writes from polluting
# records with system fields (id, createdAt, companyId, _meta, ...) or
# unknown keys. Fields not listed here are silently dropped from the record
# before it is appended to the store.
# `None` means "no restriction" (legacy modules without a known schema).
MODULE_FIELD_WHITELIST = {
    'customers': {
        'name', 'code', 'email', 'phone', 'address', 'city', 'country',
        'taxId', 'rc', 'nif', 'nis', 'website', 'contactPerson', 'notes',
        'category', 'balance', 'currency', 'active',
    },
    'suppliers': {
        'name', 'code', 'email', 'phone', 'address', 'city', 'country',
        'taxId', 'rc', 'nif', 'nis', 'website', 'contactPerson', 'productType',
        'notes', 'category', 'balance', 'currency', 'active',
    },
    'employees': {
        'name', 'firstName', 'lastName', 'position', 'department', 'salary',
        'phone', 'email', 'address', 'hireDate', 'nationalId', 'employeeId',
        'contractType', 'status', 'gender', 'birthDate', 'notes',
    },
    'products': {
        'name', 'code', 'sku', 'barcode', 'category', 'price', 'cost',
        'quantity', 'unit', 'description', 'supplier', 'brand', 'minStock',
        'maxStock', 'reorderLevel', 'taxRate', 'active', 'image',
        'purchasePrice', 'unitPrice', 'imageEmoji',
    },
    'invoices': {
        'invoiceNumber', 'number', 'customer', 'customerId', 'customerName',
        'date', 'dueDate', 'total', 'subtotal', 'tax', 'discount', 'amount',
        'status', 'paid', 'items', 'notes', 'currency', 'supplier',
        'supplierName', 'products',
    },
    'proformas': {
        'number', 'customer', 'customerId', 'date', 'dueDate', 'total',
        'subtotal', 'tax', 'discount', 'status', 'items', 'notes', 'currency',
    },
    'tenders': {
        'title', 'reference', 'client', 'organization', 'date', 'deadline',
        'amount', 'status', 'description', 'documents', 'notes',
    },
    'consultations': {
        'title', 'reference', 'client', 'date', 'amount', 'status',
        'description', 'notes',
    },
    'leaves': {
        'employee', 'employeeId', 'type', 'startDate', 'endDate', 'days',
        'status', 'reason', 'notes',
    },
    'transactions': {
        'date', 'type', 'category', 'description', 'amount', 'account',
        'reference', 'payee', 'status', 'notes',
    },
    'services': {
        'name', 'code', 'category', 'price', 'unit', 'description',
        'duration', 'active', 'notes',
    },
}

# Fields that are ALWAYS reserved (managed by the server) and must never
# come from the AI / client, regardless of the per-module whitelist.
RESERVED_FIELDS = {'id', 'createdAt', 'updatedAt', 'companyId', '_meta', '_meta_'}


# Store keys that are system-managed and must NEVER be overwritten via the
# generic store_write / store_append / store_delete_record AI actions.
# Touching these through the generic path could corrupt the application
# (auth, settings, AI config, backups, multi-tenant state, ...).
# Use the dedicated, permission-checked endpoints instead (e.g. settings_update).
PROTECTED_STORE_KEYS = {
    'zeralda-system-settings',
    'zeralda-module-settings',
    'zeralda-active-company',
    'zeralda-companies',
    'zeralda-integrations',
    'zeralda-backup-history',
    'zeralda-ai-memory',
    'zeralda-users',          # managed by backend.auth
    'zeralda-sessions',       # managed by backend.auth
}


def is_protected_store_key(key):
    """Return True if the given store key is system-managed and must not be
    written through the generic AI store_* actions."""
    # FIX P1: return True (protected) for non-string keys instead of False.
    # A non-string key is invalid and should be blocked, not allowed through.
    if not isinstance(key, str):
        return True
    # FIX P0: aggressive normalization to prevent bypass via homoglyphs,
    # zero-width characters, combining marks, or fullwidth characters.
    # NFKC handles fullwidth→ASCII and combining marks, but does NOT strip
    # zero-width chars or normalize hyphens, so we do that explicitly.
    import unicodedata
    k = unicodedata.normalize('NFKC', key.strip().lower())
    # Strip zero-width characters (U+200B U+200C U+200D U+FEFF U+2060)
    k = k.replace('\u200b', '').replace('\u200c', '').replace('\u200d', '')
    k = k.replace('\ufeff', '').replace('\u2060', '')
    # Normalize various hyphens/dashes to ASCII hyphen
    for hyphen in ('\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2015', '\u2212'):
        k = k.replace(hyphen, '-')
    if k in PROTECTED_STORE_KEYS:
        return True
    # Also protect any backup-* or ai_settings keys and per-company scoped
    # variants of the protected keys (key::companyId).
    base = k.split('::', 1)[0]
    if base in PROTECTED_STORE_KEYS:
        return True
    if base.startswith('backup-'):
        return True
    if base in ('ai_settings', 'ai_settings.json'):
        return True
    return False


def sanitize_record(module, record):
    """Strip disallowed and reserved fields from an AI-supplied record.

    Returns a new dict containing only the whitelisted fields for the module.
    FIX AI-P2-008: if the module is not in MODULE_FIELD_WHITELIST, return an
    empty dict instead of passing all fields through. Previously an unknown
    module name bypassed the whitelist entirely, letting prompt-injected
    records carry arbitrary keys.

    FIX P1: recursively sanitize nested dicts so that reserved fields
    (id, createdAt, etc.) cannot be injected via nested objects.
    """
    if not isinstance(record, dict):
        return {}
    allowed = MODULE_FIELD_WHITELIST.get(module)
    if allowed is None:
        # Unknown module — refuse every field rather than allowing all.
        return {}
    out = {}
    for k, v in record.items():
        if k in RESERVED_FIELDS:
            continue
        if k not in allowed:
            continue
        # Recursively sanitize nested dicts to strip reserved fields
        # from sub-objects (e.g., metadata, nested records).
        if isinstance(v, dict):
            out[k] = _sanitize_nested_dict(v)
        elif isinstance(v, list):
            out[k] = [_sanitize_nested_dict(item) if isinstance(item, dict) else item for item in v]
        else:
            out[k] = v
    return out


def _sanitize_nested_dict(obj):
    """Recursively strip RESERVED_FIELDS from a nested dict."""
    if not isinstance(obj, dict):
        return obj
    cleaned = {}
    for k, v in obj.items():
        if k in RESERVED_FIELDS:
            continue
        if isinstance(v, dict):
            cleaned[k] = _sanitize_nested_dict(v)
        elif isinstance(v, list):
            cleaned[k] = [_sanitize_nested_dict(item) if isinstance(item, dict) else item for item in v]
        else:
            cleaned[k] = v
    return cleaned


def ai_chat(messages, system_prompt=None, max_tokens=None, temperature=None):
    """Thin wrapper around the AI chat service."""
    from app.services.ai_chat_service import chat_with_assistant_ai
    return chat_with_assistant_ai(messages, system_prompt=system_prompt, max_tokens=max_tokens, temperature=temperature)


def normalize_line_items(items):
    """Normalize line items from AI response into consistent structure."""
    if not isinstance(items, list):
        return []
    return [_normalize_one_item(item) for item in items if isinstance(item, dict)]


def _to_western_digits(val):
    if val is None:
        return '0'
    s = str(val).strip()
    for i in range(10):
        s = s.replace(chr(0x0660 + i), str(i))
        s = s.replace(chr(0x06F0 + i), str(i))
    return s


def _parse_num(val):
    s = _to_western_digits(val)
    # Remove spaces and NBSP (thousand separators in EU/FR format: "13 500,00")
    s = s.replace('\u00a0', '').replace(' ', '')
    if ',' in s and '.' in s:
        if s.rindex(',') < s.rindex('.'):
            s = s.replace(',', '')
        else:
            s = s.replace('.', '').replace(',', '.')
    elif ',' in s and '.' not in s:
        parts = s.split(',')
        if len(parts) == 2 and len(parts[1]) <= 2:
            s = parts[0] + '.' + parts[1]
        else:
            s = s.replace(',', '')
    try:
        return float(s)
    except Exception:
        return 0


def _normalize_one_item(item):
    desc = str(item.get('description') or item.get('item') or item.get('name') or
               item.get('designation') or item.get('désignation') or '').strip()
    return {
        'description': desc,
        'quantity': _parse_num(item.get('quantity') or item.get('qty') or 1),
        'unit_price': _parse_num(item.get('unit_price') or item.get('unitPrice') or
                                 item.get('price') or item.get('prix_unitaire') or 0),
        'total': _parse_num(item.get('total') or item.get('line_total') or
                            item.get('lineTotal') or item.get('montant') or 0),
        'unit': str(item.get('unit') or item.get('um') or item.get('unite') or '').strip(),
    }
