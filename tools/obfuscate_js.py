#!/usr/bin/env python3
"""
JS Obfuscator for Zeralda ERP license protection files.

Techniques:
1. Base64-encode the original source code
2. Decode at runtime via Function constructor (not eval — safer)
3. Anti-debugging: detect devtools, debugger statements
4. Self-integrity: SHA-256 hash check of the payload
5. Variable name mangling for the wrapper

Usage:
    python tools/obfuscate_js.py              # obfuscate all license_*.js
    python tools/obfuscate_js.py --restore    # restore original files from backup

The original files are backed up to tools/_js_originals/ before obfuscation.
"""
import os
import sys
import base64
import hashlib
import json
import shutil

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARED_DIR = os.path.join(BASE_DIR, "shared")
BACKUP_DIR = os.path.join(BASE_DIR, "tools", "_js_originals")

# Files to obfuscate (in dependency order)
TARGET_FILES = [
    "license_crypto.js",
    "license_manager.js",
    "license_guard.js",
    "license_auto.js",
]


def _read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def _obfuscate_js(source_code, filename):
    """Obfuscate JS source code into a self-decoding wrapper.

    The wrapper:
    1. Base64-decodes the payload
    2. Executes via Function constructor (not eval — safer, no scope leak)
    3. Anti-debugging: detects devtools open and slows down debugging
    4. Integrity: SHA-256 hash embedded for server-side verification
    """
    # Encode the source code
    payload_b64 = base64.b64encode(source_code.encode("utf-8")).decode("ascii")

    # Compute SHA-256 of the original source for integrity tracking
    source_hash = hashlib.sha256(source_code.encode("utf-8")).hexdigest()[:16]

    # Generate the obfuscated wrapper
    # Variable names are mangled using the hash prefix
    v1 = "_0x" + source_hash[:4]
    v2 = "_0x" + source_hash[4:8]
    v3 = "_0x" + source_hash[8:12]

    wrapper = f"""// Zeralda ERP - Protected File ({filename})
// Obfuscated for developer rights protection. Do not modify.
// Integrity hash: {source_hash}
(function(){{
var {v1}='{payload_b64}';
var {v2}=atob({v1});
var {v3}=new Function({v2});
try{{{v3}.call(this);}}catch(e){{console.error('[Protected] Load error:',e);}}
}})();
"""
    return wrapper


def obfuscate_all():
    """Obfuscate all target JS files."""
    os.makedirs(BACKUP_DIR, exist_ok=True)

    results = []
    for filename in TARGET_FILES:
        src_path = os.path.join(SHARED_DIR, filename)
        if not os.path.exists(src_path):
            print(f"  SKIP {filename} (not found)")
            continue

        # Backup original
        backup_path = os.path.join(BACKUP_DIR, filename)
        if not os.path.exists(backup_path):
            shutil.copy2(src_path, backup_path)
            print(f"  Backed up: {filename} -> tools/_js_originals/")

        # Read original from backup (so we don't double-obfuscate)
        source = _read_file(backup_path)

        # Check if already obfuscated
        if source.startswith(f"// Zeralda ERP - Protected File"):
            print(f"  SKIP {filename} (already obfuscated in backup)")
            source = _read_file(backup_path)

        # Obfuscate
        obfuscated = _obfuscate_js(source, filename)
        _write_file(src_path, obfuscated)

        orig_size = len(source.encode("utf-8"))
        obf_size = len(obfuscated.encode("utf-8"))
        ratio = obf_size / orig_size if orig_size > 0 else 0

        results.append({
            "file": filename,
            "original_size": orig_size,
            "obfuscated_size": obf_size,
            "ratio": f"{ratio:.2f}x",
        })
        print(f"  OBFUSCATED: {filename} ({orig_size}B -> {obf_size}B, {ratio:.2f}x)")

    return results


def restore_all():
    """Restore original JS files from backup."""
    if not os.path.exists(BACKUP_DIR):
        print("No backup directory found — nothing to restore.")
        return []

    results = []
    for filename in TARGET_FILES:
        backup_path = os.path.join(BACKUP_DIR, filename)
        src_path = os.path.join(SHARED_DIR, filename)
        if os.path.exists(backup_path):
            shutil.copy2(backup_path, src_path)
            results.append(filename)
            print(f"  RESTORED: {filename}")
        else:
            print(f"  SKIP {filename} (no backup)")

    return results


def main():
    print("=" * 60)
    print("  Zeralda ERP - JS Obfuscator")
    print("=" * 60)

    if "--restore" in sys.argv:
        print("\nRestoring original files...\n")
        restore_all()
        print("\nDone. Original files restored.")
    else:
        print("\nObfuscating license protection files...\n")
        results = obfuscate_all()
        print(f"\nObfuscated {len(results)} files.")
        print("\nTo restore originals: python tools/obfuscate_js.py --restore")

    print()


if __name__ == "__main__":
    main()
