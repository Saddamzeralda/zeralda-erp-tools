#!/usr/bin/env python3
"""
Zeralda ERP — Keygen Tool (Standalone Desktop App)
====================================================
تطبيق مستقل لتوليد وإدارة مفاتيح التفعيل لنظام Zeralda ERP.

الميزات:
  - توليد مفتاح جديد برقم الهاتف + بريد إلكتروني (اختياري)
  - تحديد تاريخ انتهاء صلاحية للمفتاح (اختياري)
  - إلغاء/تعطيل مفتاح موجود
  - عرض كل المفاتيح مع الحالة (نشط/معطل/منتهي)
  - نسخ المفتاح بنقرة واحدة
  - تصدير المفاتيح إلى CSV أو JSON
  - بحث وفلترة المفاتيح

التشغيل:
  python tools/keygen_tool.py

  أو بدون تثبيت tkinter (نادر):
  pip install tkinter
  python tools/keygen_tool.py
"""

import os
import sys
import json
import csv
import secrets
import datetime
import threading
import tkinter as tk
from tkinter import ttk, messagebox, filedialog, simpledialog

# ── Path setup ────────────────────────────────────────────────────────────
# Allow running from anywhere — resolve project root relative to this file
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
KEYS_FILE = os.path.join(DATA_DIR, 'keys.json')

# Ensure data dir exists
os.makedirs(DATA_DIR, exist_ok=True)


# ── Key generation logic (self-contained, no external deps) ───────────────

def _load_keys():
    """Load keys database from JSON file."""
    if not os.path.exists(KEYS_FILE):
        return {}
    try:
        with open(KEYS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def _save_keys(keys_data):
    """Save keys database (atomic write)."""
    try:
        import shutil
        tmp = KEYS_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(keys_data, f, ensure_ascii=False, indent=2)
        shutil.move(tmp, KEYS_FILE)
        return True
    except Exception as e:
        print(f"[ERROR] Failed to save keys: {e}")
        return False


def _validate_phone(phone):
    """Validate phone number format — accepts international and local Algerian."""
    phone = str(phone or '').strip().replace(' ', '').replace('-', '')
    if phone.startswith('+'):
        digits = phone[1:]
        return digits.isdigit() and 8 <= len(digits) <= 15
    # Accept local format (0XXXXXXXXX) — will be normalized
    if phone.startswith('0') and phone[1:].isdigit():
        return len(phone) >= 9
    # Accept plain digits
    if phone.isdigit() and len(phone) >= 8:
        return True
    return False


def _normalize_phone(phone):
    """Normalize phone — auto-convert local Algerian to international."""
    phone = str(phone or '').strip().replace(' ', '').replace('-', '')
    if phone.startswith('+'):
        return phone
    if phone.startswith('0'):
        return '+213' + phone[1:]
    if phone.startswith('213'):
        return '+' + phone
    if phone.isdigit():
        return '+213' + phone
    return phone


def _generate_key_code():
    """Generate a random key: KEY-XXXX-XXXX-XXXX."""
    random_bytes = secrets.token_bytes(12)
    hex_str = random_bytes.hex().upper()
    return f"KEY-{hex_str[0:4]}-{hex_str[4:8]}-{hex_str[8:12]}"


def _is_expired(expires_at):
    """Check if a key is expired."""
    if not expires_at:
        return False
    try:
        exp_dt = datetime.datetime.fromisoformat(str(expires_at).replace('Z', ''))
        return datetime.datetime.utcnow() > exp_dt
    except (ValueError, TypeError):
        return False


def _key_status(key_data):
    """Return status string for a key."""
    if not key_data.get('active', True):
        return 'revoked'
    if _is_expired(key_data.get('expires_at')):
        return 'expired'
    return 'active'


def generate_key(phone, email=None, expires_at=None, force_new=False):
    """Generate a new activation key (+ linked RSA license if available)."""
    phone = _normalize_phone(phone)
    if not _validate_phone(phone):
        return {'ok': False, 'error': f'Invalid phone format: {phone}. Use +XXXXXXXXX or 0XXXXXXXXX'}

    keys = _load_keys()

    # Check existing active key (unless force_new)
    if not force_new:
        existing = [k for k, v in keys.items()
                    if v.get('phone') == phone and v.get('active', True) and not _is_expired(v.get('expires_at'))]
        if existing:
            return {'ok': True, 'key': existing[0], 'phone': phone,
                    'message': 'Key already exists for this phone'}

    key = _generate_key_code()
    now = datetime.datetime.utcnow().isoformat()
    record = {
        'phone': phone,
        'email': email or None,
        'created_at': now,
        'last_used': None,
        'active': True,
        'usage_count': 0,
        'created_by': 'keygen_tool'
    }
    if expires_at:
        record['expires_at'] = expires_at
    keys[key] = record

    if not _save_keys(keys):
        return {'ok': False, 'error': 'Failed to save key'}

    result = {'ok': True, 'key': key, 'phone': phone, 'created_at': now, 'expires_at': expires_at}

    # Create linked RSA license (unified system)
    try:
        import sys as _sys
        _base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _base not in _sys.path:
            _sys.path.insert(0, _base)
        from app.services import license_service
        lic = license_service.create_license_for_key(
            keygen_key=key, phone=phone, email=email,
        )
        if lic.get('ok'):
            result['licenseKey'] = lic['licenseKey']
    except ImportError:
        pass  # license_service not available (standalone mode)
    except Exception as e:
        print(f"[KEYGEN] [WARN] Linked license creation failed: {e}")

    return result


def revoke_key(key):
    """Revoke/deactivate a key (+ linked license if available)."""
    key = str(key or '').strip().upper()
    keys = _load_keys()
    if key not in keys:
        return {'ok': False, 'error': f'Key not found: {key}'}
    keys[key]['active'] = False
    if not _save_keys(keys):
        return {'ok': False, 'error': 'Failed to revoke'}

    # Also revoke the linked license (unified system)
    try:
        import sys as _sys
        _base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _base not in _sys.path:
            _sys.path.insert(0, _base)
        from app.services import license_service
        license_service.revoke_license_by_keygen_key(key)
    except ImportError:
        pass
    except Exception:
        pass

    return {'ok': True, 'message': f'Key revoked: {key}'}


def delete_key(key):
    """Permanently delete a key (+ revoke linked license if available)."""
    key = str(key or '').strip().upper()
    keys = _load_keys()
    if key not in keys:
        return {'ok': False, 'error': f'Key not found: {key}'}
    # Revoke linked license first
    try:
        import sys as _sys
        _base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _base not in _sys.path:
            _sys.path.insert(0, _base)
        from app.services import license_service
        license_service.revoke_license_by_keygen_key(key)
    except Exception:
        pass
    del keys[key]
    if _save_keys(keys):
        return {'ok': True, 'message': f'Key deleted: {key}'}
    return {'ok': False, 'error': 'Failed to delete'}


def list_all_keys():
    """List all keys with status (+ linked license info if available)."""
    keys = _load_keys()
    result = []
    # Try to load license service for unified view
    _license_svc = None
    try:
        import sys as _sys
        _base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if _base not in _sys.path:
            _sys.path.insert(0, _base)
        from app.services import license_service
        _license_svc = license_service
    except ImportError:
        pass
    except Exception:
        pass

    for key, data in keys.items():
        entry = {
            'key': key,
            'phone': data.get('phone', ''),
            'email': data.get('email') or '',
            'created_at': data.get('created_at', ''),
            'last_used': data.get('last_used') or '',
            'active': data.get('active', True),
            'usage_count': data.get('usage_count', 0),
            'expires_at': data.get('expires_at') or '',
            'status': _key_status(data),
            'licenseKey': '',
            'hwBound': False,
        }
        # Fetch linked license info
        if _license_svc:
            try:
                rec = _license_svc.find_license_by_keygen_key(key)
                if rec:
                    payload = rec.get('payload', {})
                    entry['licenseKey'] = payload.get('licenseKey', '')
                    entry['hwBound'] = bool(payload.get('hwFingerprint'))
            except Exception:
                pass
        result.append(entry)
    # Sort by created_at descending
    result.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return result


# ── GUI Application ───────────────────────────────────────────────────────

class KeygenApp:
    """Main Keygen Tool Application."""

    # Theme colors
    BG = '#f5f0e8'
    CARD_BG = '#fffaf4'
    ACCENT = '#d36b2e'
    ACCENT_HOVER = '#c05a1f'
    ACCENT_2 = '#0f766e'
    BORDER = '#e7dccd'
    TEXT = '#1f1b16'
    MUTED = '#78716c'
    DANGER = '#ef4444'
    SUCCESS = '#16a34a'
    WARNING = '#f59e0b'

    STATUS_COLORS = {
        'active': SUCCESS,
        'revoked': DANGER,
        'expired': WARNING,
    }

    STATUS_LABELS = {
        'active': 'نشط',
        'revoked': 'معطل',
        'expired': 'منتهي',
    }

    def __init__(self, root):
        self.root = root
        self.root.title("Zeralda ERP — مولد مفاتيح التفعيل")
        self.root.geometry("1100x700")
        self.root.minsize(900, 600)
        self.root.configure(bg=self.BG)

        # Data
        self.keys_data = []
        self.search_var = tk.StringVar()
        self.search_var.trace_add('write', self._on_search)

        self._build_ui()
        self._refresh_keys()

    def _build_ui(self):
        """Build the UI."""
        # ── Header ─────────────────────────────────────────────
        header = tk.Frame(self.root, bg=self.ACCENT, height=60)
        header.pack(fill='x')
        header.pack_propagate(False)

        title = tk.Label(header, text="🔑 مولد مفاتيح التفعيل — Zeralda ERP",
                         font=('Segoe UI', 16, 'bold'), bg=self.ACCENT, fg='white')
        title.pack(side='left', padx=20, pady=15)

        keys_count_label = tk.Label(header, text="", font=('Segoe UI', 11),
                                    bg=self.ACCENT, fg='#ffe0cc')
        keys_count_label.pack(side='right', padx=20, pady=15)
        self.keys_count_label = keys_count_label

        # ── Main container ─────────────────────────────────────
        main = tk.Frame(self.root, bg=self.BG)
        main.pack(fill='both', expand=True, padx=16, pady=12)

        # ── Left panel: Generate key form ──────────────────────
        left = tk.Frame(main, bg=self.CARD_BG, relief='solid', bd=1, highlightbackground=self.BORDER,
                        highlightthickness=1)
        left.pack(side='left', fill='y', padx=(0, 8))
        left.pack_propagate(False)
        left.configure(width=340)

        form_title = tk.Label(left, text="➕ توليد مفتاح جديد", font=('Segoe UI', 13, 'bold'),
                              bg=self.CARD_BG, fg=self.TEXT)
        form_title.pack(pady=(16, 12), anchor='w', padx=16)

        # Phone field
        tk.Label(left, text="رقم الهاتف *", font=('Segoe UI', 10), bg=self.CARD_BG,
                 fg=self.MUTED).pack(anchor='w', padx=16, pady=(4, 2))
        self.phone_entry = tk.Entry(left, font=('Segoe UI', 12), width=28,
                                    relief='solid', bd=1, highlightthickness=1,
                                    highlightcolor=self.ACCENT)
        self.phone_entry.pack(padx=16, fill='x')
        self.phone_entry.insert(0, '+213')

        # Email field
        tk.Label(left, text="البريد الإلكتروني (اختياري)", font=('Segoe UI', 10),
                 bg=self.CARD_BG, fg=self.MUTED).pack(anchor='w', padx=16, pady=(8, 2))
        self.email_entry = tk.Entry(left, font=('Segoe UI', 12), width=28,
                                    relief='solid', bd=1, highlightthickness=1,
                                    highlightcolor=self.ACCENT)
        self.email_entry.pack(padx=16, fill='x')

        # Expiry frame
        tk.Label(left, text="تاريخ الانتهاء (اختياري)", font=('Segoe UI', 10),
                 bg=self.CARD_BG, fg=self.MUTED).pack(anchor='w', padx=16, pady=(8, 2))

        expiry_frame = tk.Frame(left, bg=self.CARD_BG)
        expiry_frame.pack(padx=16, fill='x')

        self.expiry_var = tk.StringVar(value='no_expiry')
        tk.RadiButton = tk.Radiobutton

        rb1 = tk.Radiobutton(expiry_frame, text="بدون انتهاء", variable=self.expiry_var,
                             value='no_expiry', font=('Segoe UI', 10), bg=self.CARD_BG,
                             fg=self.TEXT, activebackground=self.CARD_BG, selectcolor=self.CARD_BG)
        rb1.pack(anchor='w')

        rb2 = tk.Radiobutton(expiry_frame, text="30 يوم", variable=self.expiry_var,
                             value='30d', font=('Segoe UI', 10), bg=self.CARD_BG,
                             fg=self.TEXT, activebackground=self.CARD_BG, selectcolor=self.CARD_BG)
        rb2.pack(anchor='w')

        rb3 = tk.Radiobutton(expiry_frame, text="90 يوم", variable=self.expiry_var,
                             value='90d', font=('Segoe UI', 10), bg=self.CARD_BG,
                             fg=self.TEXT, activebackground=self.CARD_BG, selectcolor=self.CARD_BG)
        rb3.pack(anchor='w')

        rb4 = tk.Radiobutton(expiry_frame, text="365 يوم", variable=self.expiry_var,
                             value='365d', font=('Segoe UI', 10), bg=self.CARD_BG,
                             fg=self.TEXT, activebackground=self.CARD_BG, selectcolor=self.CARD_BG)
        rb4.pack(anchor='w')

        custom_frame = tk.Frame(expiry_frame, bg=self.CARD_BG)
        custom_frame.pack(anchor='w', fill='x')
        rb5 = tk.Radiobutton(custom_frame, text="تاريخ مخصص:", variable=self.expiry_var,
                             value='custom', font=('Segoe UI', 10), bg=self.CARD_BG,
                             fg=self.TEXT, activebackground=self.CARD_BG, selectcolor=self.CARD_BG)
        rb5.pack(side='left')

        self.custom_date_entry = tk.Entry(custom_frame, font=('Segoe UI', 10), width=12,
                                          relief='solid', bd=1)
        self.custom_date_entry.pack(side='left', padx=4)
        self.custom_date_entry.insert(0, '2026-12-31')

        date_hint = tk.Label(left, text="(صيغة: YYYY-MM-DD)", font=('Segoe UI', 8),
                             bg=self.CARD_BG, fg=self.MUTED)
        date_hint.pack(anchor='w', padx=35)

        # Force new checkbox
        self.force_var = tk.BooleanVar(value=False)
        cb = tk.Checkbutton(left, text="توليد مفتاح جديد حتى لو يوجد واحد",
                            variable=self.force_var, font=('Segoe UI', 9),
                            bg=self.CARD_BG, fg=self.MUTED, activebackground=self.CARD_BG,
                            selectcolor=self.CARD_BG)
        cb.pack(anchor='w', padx=16, pady=(8, 0))

        # Generate button
        gen_btn = tk.Button(left, text="🔑 توليد المفتاح", font=('Segoe UI', 12, 'bold'),
                            bg=self.ACCENT, fg='white', relief='flat', height=2,
                            cursor='hand2', activebackground=self.ACCENT_HOVER,
                            command=self._on_generate)
        gen_btn.pack(padx=16, pady=(16, 8), fill='x')

        # Result label (shows generated key)
        self.result_var = tk.StringVar(value='')
        self.result_label = tk.Label(left, textvariable=self.result_var,
                                     font=('Consolas', 11, 'bold'), bg=self.CARD_BG,
                                     fg=self.ACCENT_2, wraplength=300, justify='center')
        self.result_label.pack(padx=16, pady=(4, 4))

        # Copy button
        self.copy_btn = tk.Button(left, text="📋 نسخ المفتاح", font=('Segoe UI', 10),
                                  bg=self.ACCENT_2, fg='white', relief='flat', height=1,
                                  cursor='hand2', state='disabled',
                                  command=self._copy_result)
        self.copy_btn.pack(padx=16, pady=(0, 16), fill='x')

        # ── Right panel: Keys list ─────────────────────────────
        right = tk.Frame(main, bg=self.CARD_BG, relief='solid', bd=1,
                         highlightbackground=self.BORDER, highlightthickness=1)
        right.pack(side='right', fill='both', expand=True)

        # Toolbar
        toolbar = tk.Frame(right, bg=self.CARD_BG)
        toolbar.pack(fill='x', padx=12, pady=(12, 8))

        tk.Label(toolbar, text="🔍", font=('Segoe UI', 12), bg=self.CARD_BG).pack(side='left')

        search_entry = tk.Entry(toolbar, textvariable=self.search_var,
                                font=('Segoe UI', 11), width=30, relief='solid', bd=1,
                                highlightthickness=1, highlightcolor=self.ACCENT)
        search_entry.pack(side='left', padx=4)
        search_entry.bind('<Control-a>', lambda e: e.widget.select_range(0, 'end'))

        # Export buttons
        export_frame = tk.Frame(toolbar, bg=self.CARD_BG)
        export_frame.pack(side='right')

        csv_btn = tk.Button(export_frame, text="📊 CSV", font=('Segoe UI', 9, 'bold'),
                            bg=self.ACCENT_2, fg='white', relief='flat', padx=8,
                            cursor='hand2', command=self._export_csv)
        csv_btn.pack(side='left', padx=2)

        json_btn = tk.Button(export_frame, text="📄 JSON", font=('Segoe UI', 9, 'bold'),
                             bg=self.ACCENT_2, fg='white', relief='flat', padx=8,
                             cursor='hand2', command=self._export_json)
        json_btn.pack(side='left', padx=2)

        refresh_btn = tk.Button(export_frame, text="🔄 تحديث", font=('Segoe UI', 9),
                                bg=self.BORDER, fg=self.TEXT, relief='flat', padx=8,
                                cursor='hand2', command=self._refresh_keys)
        refresh_btn.pack(side='left', padx=2)

        # Treeview
        tree_frame = tk.Frame(right, bg=self.CARD_BG)
        tree_frame.pack(fill='both', expand=True, padx=12, pady=(0, 12))

        columns = ('key', 'phone', 'email', 'status', 'created', 'expires', 'usage')
        self.tree = ttk.Treeview(tree_frame, columns=columns, show='headings', selectmode='browse')

        self.tree.heading('key', text='المفتاح')
        self.tree.heading('phone', text='الهاتف')
        self.tree.heading('email', text='البريد')
        self.tree.heading('status', text='الحالة')
        self.tree.heading('created', text='تاريخ الإنشاء')
        self.tree.heading('expires', text='تاريخ الانتهاء')
        self.tree.heading('usage', text='الاستخدام')

        self.tree.column('key', width=160, minwidth=140)
        self.tree.column('phone', width=130, minwidth=100)
        self.tree.column('email', width=150, minwidth=100)
        self.tree.column('status', width=70, minwidth=60, anchor='center')
        self.tree.column('created', width=140, minwidth=120)
        self.tree.column('expires', width=120, minwidth=100)
        self.tree.column('usage', width=60, minwidth=50, anchor='center')

        # Style
        style = ttk.Style()
        style.theme_use('clam')
        style.configure('Treeview', font=('Segoe UI', 10), rowheight=28,
                        background=self.CARD_BG, fieldbackground=self.CARD_BG,
                        bordercolor=self.BORDER)
        style.configure('Treeview.Heading', font=('Segoe UI', 10, 'bold'),
                        background=self.BORDER, foreground=self.TEXT, relief='flat')
        style.map('Treeview', background=[('selected', self.ACCENT)],
                  foreground=[('selected', 'white')])

        # Scrollbar
        scrollbar = ttk.Scrollbar(tree_frame, orient='vertical', command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side='right', fill='y')
        self.tree.pack(fill='both', expand=True)

        # Tags for status colors
        self.tree.tag_configure('active', foreground=self.SUCCESS)
        self.tree.tag_configure('revoked', foreground=self.DANGER)
        self.tree.tag_configure('expired', foreground=self.WARNING)

        # Context menu (right-click)
        self.context_menu = tk.Menu(self.root, tearoff=0)
        self.context_menu.add_command(label="📋 نسخ المفتاح", command=self._copy_selected)
        self.context_menu.add_command(label="📋 نسخ رقم الهاتف", command=self._copy_selected_phone)
        self.context_menu.add_separator()
        self.context_menu.add_command(label="🔴 تعطيل المفتاح", command=self._revoke_selected)
        self.context_menu.add_command(label="🗑️ حذف نهائي", command=self._delete_selected)
        self.context_menu.add_separator()
        self.context_menu.add_command(label="🔄 تحديث", command=self._refresh_keys)

        self.tree.bind('<Button-3>', self._show_context_menu)
        self.tree.bind('<Double-1>', self._copy_selected)

        # Status bar
        self.status_var = tk.StringVar(value='جاهز')
        status_bar = tk.Label(self.root, textvariable=self.status_var,
                              font=('Segoe UI', 9), bg=self.BORDER, fg=self.MUTED,
                              anchor='w', relief='flat', height=1)
        status_bar.pack(fill='x', side='bottom')

    def _compute_expiry(self):
        """Compute expiry ISO string from radio selection."""
        choice = self.expiry_var.get()
        if choice == 'no_expiry':
            return None
        elif choice == '30d':
            return (datetime.datetime.utcnow() + datetime.timedelta(days=30)).isoformat()
        elif choice == '90d':
            return (datetime.datetime.utcnow() + datetime.timedelta(days=90)).isoformat()
        elif choice == '365d':
            return (datetime.datetime.utcnow() + datetime.timedelta(days=365)).isoformat()
        elif choice == 'custom':
            raw = self.custom_date_entry.get().strip()
            if not raw:
                return None
            try:
                # Parse date and set to end of day
                dt = datetime.datetime.strptime(raw, '%Y-%m-%d')
                dt = dt.replace(hour=23, minute=59, second=59)
                return dt.isoformat()
            except ValueError:
                return 'INVALID'
        return None

    def _on_generate(self):
        """Generate a new key."""
        phone = self.phone_entry.get().strip()
        email = self.email_entry.get().strip() or None
        expires_at = self._compute_expiry()
        force_new = self.force_var.get()

        if not phone:
            messagebox.showwarning("تنبيه", "الرجاء إدخال رقم الهاتف", parent=self.root)
            return

        if expires_at == 'INVALID':
            messagebox.showwarning("تنبيه", "صيغة التاريخ غير صحيحة. استخدم: YYYY-MM-DD", parent=self.root)
            return

        result = generate_key(phone, email, expires_at, force_new)

        if result.get('ok'):
            key = result['key']
            self.result_var.set(key)
            self.copy_btn.config(state='normal')
            self.status_var.set(f'✅ تم توليد المفتاح: {key}')
            self._refresh_keys()

            # Highlight the new key in the tree
            for item in self.tree.get_children():
                if self.tree.item(item, 'values')[0] == key:
                    self.tree.selection_set(item)
                    self.tree.see(item)
                    break
        else:
            self.result_var.set('')
            self.copy_btn.config(state='disabled')
            messagebox.showerror("خطأ", result.get('error', 'Failed to generate key'), parent=self.root)

    def _copy_result(self):
        """Copy the generated key to clipboard."""
        key = self.result_var.get()
        if key:
            self.root.clipboard_clear()
            self.root.clipboard_append(key)
            self.status_var.set(f'📋 تم نسخ: {key}')

    def _copy_selected(self, event=None):
        """Copy selected key to clipboard."""
        selection = self.tree.selection()
        if not selection:
            return
        values = self.tree.item(selection[0], 'values')
        key = values[0]
        self.root.clipboard_clear()
        self.root.clipboard_append(key)
        self.status_var.set(f'📋 تم نسخ: {key}')

    def _copy_selected_phone(self):
        """Copy selected phone to clipboard."""
        selection = self.tree.selection()
        if not selection:
            return
        values = self.tree.item(selection[0], 'values')
        phone = values[1]
        self.root.clipboard_clear()
        self.root.clipboard_append(phone)
        self.status_var.set(f'📋 تم نسخ: {phone}')

    def _revoke_selected(self):
        """Revoke the selected key."""
        selection = self.tree.selection()
        if not selection:
            return
        values = self.tree.item(selection[0], 'values')
        key = values[0]
        status = values[3]

        if status == 'معطل':
            messagebox.showinfo("معلومة", "هذا المفتاح معطل بالفعل", parent=self.root)
            return

        if messagebox.askyesno("تأكيد", f"هل تريد تعطيل المفتاح؟\n\n{key}", parent=self.root):
            result = revoke_key(key)
            if result.get('ok'):
                self.status_var.set(f'🔴 تم تعطيل: {key}')
                self._refresh_keys()
            else:
                messagebox.showerror("خطأ", result.get('error'), parent=self.root)

    def _delete_selected(self):
        """Permanently delete the selected key."""
        selection = self.tree.selection()
        if not selection:
            return
        values = self.tree.item(selection[0], 'values')
        key = values[0]

        if messagebox.askyesno("تأكيد حذف نهائي",
                               f"⚠️ تحذير: سيتم حذف المفتاح نهائياً!\n\n{key}\n\nهل أنت متأكد؟",
                               parent=self.root):
            result = delete_key(key)
            if result.get('ok'):
                self.status_var.set(f'🗑️ تم حذف: {key}')
                self._refresh_keys()
            else:
                messagebox.showerror("خطأ", result.get('error'), parent=self.root)

    def _show_context_menu(self, event):
        """Show right-click context menu."""
        item = self.tree.identify_row(event.y)
        if item:
            self.tree.selection_set(item)
            self.context_menu.tk_popup(event.x_root, event.y_root)

    def _on_search(self, *args):
        """Filter keys by search text."""
        self._refresh_keys()

    def _refresh_keys(self):
        """Reload keys into the treeview."""
        # Clear existing
        for item in self.tree.get_children():
            self.tree.delete(item)

        # Load keys
        all_keys = list_all_keys()

        # Filter by search
        search = self.search_var.get().lower().strip()
        if search:
            all_keys = [k for k in all_keys
                        if search in k['key'].lower()
                        or search in k['phone'].lower()
                        or search in (k['email'] or '').lower()]

        # Insert
        for k in all_keys:
            status = k['status']
            status_label = self.STATUS_LABELS.get(status, status)

            # Format dates for display
            created = k['created_at'][:10] if k['created_at'] else ''
            expires = k['expires_at'][:10] if k['expires_at'] else '—'

            self.tree.insert('', 'end', values=(
                k['key'],
                k['phone'],
                k['email'] or '—',
                status_label,
                created,
                expires,
                k['usage_count']
            ), tags=(status,))

        # Update count
        total = len(all_keys)
        active = sum(1 for k in all_keys if k['status'] == 'active')
        revoked = sum(1 for k in all_keys if k['status'] == 'revoked')
        expired = sum(1 for k in all_keys if k['status'] == 'expired')
        self.keys_count_label.config(text=f"المجموع: {total} | نشط: {active} | معطل: {revoked} | منتهي: {expired}")

        if not search:
            self.status_var.set(f'جاهز — {total} مفتاح')
        else:
            self.status_var.set(f'نتائج البحث: {total} مفتاح')

    def _export_csv(self):
        """Export keys to CSV."""
        all_keys = list_all_keys()
        if not all_keys:
            messagebox.showinfo("تصدير", "لا توجد مفاتيح للتصدير", parent=self.root)
            return

        filename = filedialog.asksaveasfilename(
            defaultextension='.csv',
            filetypes=[('CSV files', '*.csv'), ('All files', '*.*')],
            initialfile=f'keys_export_{datetime.date.today().isoformat()}.csv',
            title="حفظ ملف CSV"
        )
        if not filename:
            return

        try:
            with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.writer(f)
                writer.writerow(['Key', 'Phone', 'Email', 'Status', 'Created', 'Last Used',
                                 'Expires', 'Usage Count'])
                for k in all_keys:
                    writer.writerow([
                        k['key'], k['phone'], k['email'] or '',
                        self.STATUS_LABELS.get(k['status'], k['status']),
                        k['created_at'], k['last_used'],
                        k['expires_at'] or '', k['usage_count']
                    ])
            self.status_var.set(f'📊 تم تصدير {len(all_keys)} مفتاح إلى CSV')
            messagebox.showinfo("تصدير", f"تم تصدير {len(all_keys)} مفتاح إلى:\n{filename}", parent=self.root)
        except Exception as e:
            messagebox.showerror("خطأ", f"فشل التصدير: {e}", parent=self.root)

    def _export_json(self):
        """Export keys to JSON."""
        all_keys = list_all_keys()
        if not all_keys:
            messagebox.showinfo("تصدير", "لا توجد مفاتيح للتصدير", parent=self.root)
            return

        filename = filedialog.asksaveasfilename(
            defaultextension='.json',
            filetypes=[('JSON files', '*.json'), ('All files', '*.*')],
            initialfile=f'keys_export_{datetime.date.today().isoformat()}.json',
            title="حفظ ملف JSON"
        )
        if not filename:
            return

        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(all_keys, f, ensure_ascii=False, indent=2)
            self.status_var.set(f'📄 تم تصدير {len(all_keys)} مفتاح إلى JSON')
            messagebox.showinfo("تصدير", f"تم تصدير {len(all_keys)} مفتاح إلى:\n{filename}", parent=self.root)
        except Exception as e:
            messagebox.showerror("خطأ", f"فشل التصدير: {e}", parent=self.root)


# ── Entry point ───────────────────────────────────────────────────────────

def main():
    """Launch the Keygen Tool."""
    try:
        root = tk.Tk()
        app = KeygenApp(root)
        root.mainloop()
    except ImportError:
        print("[ERROR] tkinter is not available. Install it with:")
        print("  Ubuntu/Debian: sudo apt install python3-tk")
        print("  CentOS/RHEL:   sudo yum install python3-tkinter")
        print("  macOS:         brew install python-tk")
        print("  Windows:       (included with Python)")
        sys.exit(1)


if __name__ == '__main__':
    main()
