#!/usr/bin/env python3
"""
Python Obfuscator for Zeralda ERP critical protection files.

Techniques:
1. Compile .py source to bytecode (code object)
2. Serialize via marshal.dumps()
3. Base64-encode the marshalled bytes
4. Embed in a loader .py with mangled variable names
5. Integrity hash (SHA-256) embedded for tamper detection

The obfuscated .py file:
- Looks like gibberish (base64 blob)
- Runs identically to the original
- Cannot be read by casual inspection
- Detects tampering via integrity hash

** IMPORTANT: Marshal bytecode is NOT portable between Python versions! **
Do NOT obfuscate Python files if the target uses a different Python version
(e.g., obfuscating with Python 3.14 but running on Python 3.11 will fail
with "bad marshal data" error). Only obfuscate if the same Python version
is used at runtime, or skip Python obfuscation for distributed installers.

Usage:
    python tools/obfuscate_py.py              # obfuscate critical Python files
    python tools/obfuscate_py.py --restore    # restore originals

Original files are backed up to tools/_py_originals/ before obfuscation.
"""
import os
import sys
import base64
import marshal
import hashlib
import shutil
import struct

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_DIR = os.path.join(BASE_DIR, "tools", "_py_originals")

# Critical Python files to obfuscate (relative to BASE_DIR)
TARGET_FILES = [
    "app/services/license_service.py",
    "app/handlers/license.py",
    "backend/keygen_service.py",
]


def _read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def _obfuscate_py(source_code, filepath):
    """Obfuscate Python source code into a marshal-based loader.

    The loader:
    1. Contains base64-encoded marshalled bytecode
    2. Decodes and execs it at import time
    3. Verifies integrity via SHA-256 hash
    4. Preserves the module's __name__ and exports
    """
    # Compile to bytecode
    code_obj = compile(source_code, filepath, "exec")

    # Marshal the code object
    marshalled = marshal.dumps(code_obj)

    # Base64-encode
    payload_b64 = base64.b64encode(marshalled).decode("ascii")

    # Integrity hash
    integrity_hash = hashlib.sha256(marshalled).hexdigest()[:16]

    # Mangled variable names based on hash
    v1 = "__" + integrity_hash[:4]
    v2 = "__" + integrity_hash[4:8]
    v3 = "__" + integrity_hash[8:12]

    # Generate the loader
    loader = f'''# Zeralda ERP - Protected Module ({os.path.basename(filepath)})
# Obfuscated for developer rights protection. Do not modify.
# Integrity: {integrity_hash}
import base64 as {v1}
import marshal as {v2}
import hashlib as {v3}_h
{v1}_payload = "{payload_b64}"
{v2}_data = {v1}.b64decode({v1}_payload)
{v3}_h_check = {v3}_h.sha256({v2}_data).hexdigest()[:16]
if {v3}_h_check != "{integrity_hash}":
    raise ImportError("Integrity check failed for {os.path.basename(filepath)}")
{v2}_code = {v2}.loads({v2}_data)
exec({v2}_code, globals())
'''
    return loader


def obfuscate_all():
    """Obfuscate all target Python files."""
    os.makedirs(BACKUP_DIR, exist_ok=True)

    results = []
    for rel_path in TARGET_FILES:
        src_path = os.path.join(BASE_DIR, rel_path)
        if not os.path.exists(src_path):
            print(f"  SKIP {rel_path} (not found)")
            continue

        # Ensure backup directory structure
        backup_path = os.path.join(BACKUP_DIR, rel_path)
        os.makedirs(os.path.dirname(backup_path), exist_ok=True)

        # Backup original (only if not already backed up)
        if not os.path.exists(backup_path):
            shutil.copy2(src_path, backup_path)
            print(f"  Backed up: {rel_path}")

        # Read original from backup (so we don't double-obfuscate)
        source = _read_file(backup_path)

        # Check if already obfuscated
        if source.startswith("# Zeralda ERP - Protected Module"):
            print(f"  SKIP {rel_path} (backup already obfuscated, using as-is)")
            source = _read_file(backup_path)

        # Obfuscate
        try:
            obfuscated = _obfuscate_py(source, rel_path)
            _write_file(src_path, obfuscated)

            orig_size = len(source.encode("utf-8"))
            obf_size = len(obfuscated.encode("utf-8"))
            ratio = obf_size / orig_size if orig_size > 0 else 0

            results.append({
                "file": rel_path,
                "original_size": orig_size,
                "obfuscated_size": obf_size,
                "ratio": f"{ratio:.2f}x",
            })
            print(f"  OBFUSCATED: {rel_path} ({orig_size}B -> {obf_size}B, {ratio:.2f}x)")
        except Exception as e:
            print(f"  ERROR {rel_path}: {e}")

    return results


def restore_all():
    """Restore original Python files from backup."""
    if not os.path.exists(BACKUP_DIR):
        print("No backup directory found — nothing to restore.")
        return []

    results = []
    for rel_path in TARGET_FILES:
        backup_path = os.path.join(BACKUP_DIR, rel_path)
        src_path = os.path.join(BASE_DIR, rel_path)
        if os.path.exists(backup_path):
            shutil.copy2(backup_path, src_path)
            results.append(rel_path)
            print(f"  RESTORED: {rel_path}")
        else:
            print(f"  SKIP {rel_path} (no backup)")

    return results


def main():
    print("=" * 60)
    print("  Zeralda ERP - Python Obfuscator")
    print("=" * 60)

    if "--restore" in sys.argv:
        print("\nRestoring original files...\n")
        restore_all()
        print("\nDone. Original files restored.")
    else:
        print("\nObfuscating critical Python files...\n")
        results = obfuscate_all()
        print(f"\nObfuscated {len(results)} files.")
        print("\nTo restore originals: python tools/obfuscate_py.py --restore")

    print()


if __name__ == "__main__":
    main()
