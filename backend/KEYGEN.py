#!/usr/bin/env python3
"""
KEYGEN - Zeralda ERP Activation Key Generator
Simple command-line tool to generate and manage activation keys
"""

import sys
import os
import json
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from keygen_service import (
    generate_key, verify_key, mark_key_used, revoke_key, delete_key,
    list_keys, list_unified, authenticate_with_key, get_license_for_key,
    _validate_phone_number, _normalize_phone
)


def print_header():
    print("\n" + "="*70)
    print("  ZERALDA ERP - ACTIVATION KEY GENERATOR")
    print("="*70 + "\n")


def print_menu():
    print("Options:")
    print("  1) Generate new key (+ linked license)")
    print("  2) Verify key")
    print("  3) List all keys")
    print("  4) List keys for phone number")
    print("  5) Revoke key (+ linked license)")
    print("  6) Test authentication with key")
    print("  7) List unified (keys + linked licenses)")
    print("  8) Show linked license for a key")
    print("  9) Delete key permanently")
    print("  10) Exit")
    print()


def generate_new_key():
    print("\n--- Generate New Key ---")
    phone = input("Enter phone number (e.g., +21396409083): ").strip()
    if not phone:
        print("❌ Phone number is required")
        return
    
    email = input("Enter email (optional): ").strip() or None
    
    result = generate_key(phone, email)
    if result['ok']:
        print(f"\n✅ Key generated successfully!")
        print(f"   Phone: {result['phone']}")
        print(f"   Keygen Key: {result['key']}")
        if result.get('licenseKey'):
            print(f"   License Key: {result['licenseKey']}")
            print(f"   ── Unified: keygen + RSA license linked ──")
        else:
            print(f"   ⚠️  No linked license created (license_service unavailable)")
        print(f"   Created: {result['created_at']}")
    else:
        print(f"\n❌ Error: {result['error']}")


def verify_single_key():
    print("\n--- Verify Key ---")
    key = input("Enter key (e.g., KEY-XXXX-XXXX-XXXX): ").strip().upper()
    if not key:
        print("❌ Key is required")
        return
    
    result = verify_key(key)
    if result['ok']:
        print(f"\n✅ Key is valid!")
        print(f"   Key: {key}")
        print(f"   Phone: {result['phone']}")
        if result.get('email'):
            print(f"   Email: {result['email']}")
        print(f"   Active: {result['active']}")
        print(f"   Usage Count: {result['usage_count']}")
        print(f"   Created: {result['created_at']}")
    else:
        print(f"\n❌ Error: {result['error']}")


def list_all_keys():
    print("\n--- All Keys ---")
    result = list_keys()
    
    if result['count'] == 0:
        print("No keys found")
        return
    
    print(f"\nTotal keys: {result['count']}\n")
    print(f"{'Key':<25} {'Phone':<18} {'Email':<25} {'Active':<8} {'Usage':<6} {'Created'}")
    print("-" * 120)
    
    for key_info in result['keys']:
        key = key_info['key']
        phone = key_info['phone']
        email = key_info['email'] or '-'
        active = '✅ Yes' if key_info['active'] else '❌ No'
        usage = key_info['usage_count']
        created = key_info['created_at'][:10] if key_info['created_at'] else '-'
        
        print(f"{key:<25} {phone:<18} {email:<25} {active:<8} {usage:<6} {created}")


def list_for_phone():
    print("\n--- Keys for Phone Number ---")
    phone = input("Enter phone number (e.g., +21396409083): ").strip()
    if not phone:
        print("❌ Phone number is required")
        return
    
    result = list_keys(phone_number=phone)
    
    if result['count'] == 0:
        print(f"No keys found for phone: {phone}")
        return
    
    print(f"\nKeys for {phone}:\n")
    for key_info in result['keys']:
        key = key_info['key']
        active = '✅ Active' if key_info['active'] else '❌ Revoked'
        created = key_info['created_at']
        usage = key_info['usage_count']
        
        print(f"  Key: {key}")
        print(f"  Status: {active}")
        print(f"  Usage Count: {usage}")
        print(f"  Created: {created}")
        if key_info.get('last_used'):
            print(f"  Last Used: {key_info['last_used']}")
        print()


def revoke_single_key():
    print("\n--- Revoke Key ---")
    key = input("Enter key to revoke (e.g., KEY-XXXX-XXXX-XXXX): ").strip().upper()
    if not key:
        print("❌ Key is required")
        return

    confirm = input(f"Are you sure you want to revoke {key}? (yes/no): ").strip().lower()
    if confirm != 'yes':
        print("❌ Revocation cancelled")
        return

    result = revoke_key(key)
    if result['ok']:
        print(f"\n✅ {result['message']}")
    else:
        print(f"\n❌ Error: {result['error']}")


def delete_single_key():
    print("\n--- Delete Key Permanently ---")
    key = input("Enter key to delete (e.g., KEY-XXXX-XXXX-XXXX): ").strip().upper()
    if not key:
        print("❌ Key is required")
        return

    confirm = input(f"⚠️  Permanently delete {key}? This cannot be undone! (yes/no): ").strip().lower()
    if confirm != 'yes':
        print("❌ Deletion cancelled")
        return

    result = delete_key(key)
    if result['ok']:
        print(f"\n✅ {result['message']}")
    else:
        print(f"\n❌ Error: {result['error']}")


def test_authentication():
    print("\n--- Test Authentication ---")
    phone = input("Enter phone number (e.g., +21396409083): ").strip()
    if not phone:
        print("❌ Phone number is required")
        return
    
    key = input("Enter key (e.g., KEY-XXXX-XXXX-XXXX): ").strip().upper()
    if not key:
        print("❌ Key is required")
        return
    
    result = authenticate_with_key(phone, key)
    if result['ok']:
        print(f"\n✅ Authentication successful!")
        print(f"   Phone: {result['phone']}")
        if result.get('email'):
            print(f"   Email: {result['email']}")
    else:
        print(f"\n❌ Authentication failed: {result['error']}")


def batch_generate():
    """Batch generate keys for multiple phone numbers"""
    print("\n--- Batch Generate Keys ---")
    count = input("How many keys to generate? (1-100): ").strip()
    
    try:
        count = int(count)
        if count < 1 or count > 100:
            print("❌ Count must be between 1 and 100")
            return
    except ValueError:
        print("❌ Invalid number")
        return
    
    phone_base = input("Enter phone number base (e.g., +213): ").strip()
    if not phone_base:
        print("❌ Phone base is required")
        return
    
    keys_generated = []
    print(f"\nGenerating {count} keys...\n")
    
    for i in range(count):
        # Generate phone number (simple approach: add sequence)
        phone = f"{phone_base}{96400000 + i:08d}"
        result = generate_key(phone)
        if result['ok']:
            keys_generated.append({
                'phone': result['phone'],
                'key': result['key']
            })
            print(f"  ✅ {i+1}/{count}: {phone} → {result['key']}")
        else:
            print(f"  ❌ {i+1}/{count}: {phone} → {result['error']}")
    
    # Save to CSV file
    if keys_generated:
        csv_file = f"keys_generated_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        print(f"\n📄 Saving {len(keys_generated)} keys to {csv_file}...")
        
        try:
            with open(csv_file, 'w', encoding='utf-8') as f:
                f.write("Phone,Key\n")
                for k in keys_generated:
                    f.write(f"{k['phone']},{k['key']}\n")
            print(f"✅ Saved to {csv_file}")
        except Exception as e:
            print(f"❌ Error saving CSV: {e}")


def list_unified_keys():
    """List all keygen keys with their linked license info."""
    print("\n--- Unified Keys + Licenses ---")
    result = list_unified()

    if result['count'] == 0:
        print("No keys found")
        return

    print(f"\nTotal keys: {result['count']}\n")
    print(f"{'Keygen Key':<25} {'Phone':<18} {'License Key':<28} {'Active':<8} {'HW Bound':<10}")
    print("-" * 100)

    for entry in result['keys']:
        key = entry['key']
        phone = entry['phone'] or '-'
        active = '✅ Yes' if entry['active'] else '❌ No'
        lic = entry.get('license')
        if lic:
            lic_key = lic.get('licenseKey', '-')
            hw_bound = '✅ Yes' if lic.get('hwFingerprint') else 'No'
        else:
            lic_key = '(none)'
            hw_bound = '-'
        print(f"{key:<25} {phone:<18} {lic_key:<28} {active:<8} {hw_bound:<10}")


def show_linked_license():
    """Show the linked RSA license for a keygen key."""
    print("\n--- Linked License for Key ---")
    key = input("Enter keygen key (e.g., KEY-XXXX-XXXX-XXXX): ").strip().upper()
    if not key:
        print("❌ Key is required")
        return

    result = get_license_for_key(key)
    if result['ok']:
        payload = result['payload']
        print(f"\n✅ Linked license found!")
        print(f"   Keygen Key:   {key}")
        print(f"   License Key:  {result['licenseKey']}")
        print(f"   Type:         {payload.get('type', '?')}")
        print(f"   Customer:     {payload.get('customer', '?')}")
        print(f"   Phone:        {payload.get('phone', '?')}")
        print(f"   Email:        {payload.get('email', '-')}")
        print(f"   Max Devices:  {payload.get('maxDevices', 1)}")
        print(f"   HW Bound:     {'Yes (' + payload.get('hwId', '') + ')' if payload.get('hwFingerprint') else 'No'}")
        print(f"   Revoked:      {payload.get('revoked', False)}")
        exp = payload.get('expiresAt', 0)
        if exp and exp > 0:
            from datetime import datetime
            print(f"   Expires:      {datetime.utcfromtimestamp(exp).strftime('%Y-%m-%d')}")
        else:
            print(f"   Expires:      Never (perpetual)")
    else:
        print(f"\n❌ {result.get('error', 'No linked license found')}")


def main():
    # Check for --gui flag
    if '--gui' in sys.argv or '--desktop' in sys.argv:
        _launch_gui()
        return

    print_header()

    while True:
        print_menu()
        choice = input("Select option (1-10): ").strip()

        if choice == '1':
            generate_new_key()
        elif choice == '2':
            verify_single_key()
        elif choice == '3':
            list_all_keys()
        elif choice == '4':
            list_for_phone()
        elif choice == '5':
            revoke_single_key()
        elif choice == '6':
            test_authentication()
        elif choice == '7':
            list_unified_keys()
        elif choice == '8':
            show_linked_license()
        elif choice == '9':
            delete_single_key()
        elif choice == '10':
            print("Goodbye! 👋\n")
            break
        elif choice.lower() == 'batch':
            batch_generate()
        elif choice.lower() == 'gui':
            _launch_gui()
            return
        else:
            print("❌ Invalid option. Please select 1-9.\n")


def _launch_gui():
    """Launch the desktop GUI tool."""
    tool_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             'tools', 'keygen_tool.py')
    if not os.path.exists(tool_path):
        print(f"❌ GUI tool not found: {tool_path}")
        return
    import subprocess
    subprocess.Popen([sys.executable, tool_path])


if __name__ == '__main__':
    main()
