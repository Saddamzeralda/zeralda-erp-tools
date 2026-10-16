#!/usr/bin/env python3
"""
Cython Native Compilation Tool for Zeralda ERP Protection Modules.
==================================================================

Compiles critical security, licensing, and crypto files into native C extension
binaries (.pyd on Windows / .so on Linux).

Benefits:
- Complete removal of Python AST and source code from distribution
- Control flow and licensing logic compiled directly to machine code
- Resistant to decompilation (uncompyle6, pycdc cannot decompile native C binaries)
- High runtime performance and zero-cost abstraction for crypto routines

Target Modules:
- app/services/license_service.py
- app/handlers/license.py
- backend/keygen_service.py
- app/services/crypto_storage.py

Usage:
    python tools/compile_protection_cython.py           # Compile all target modules
    python tools/compile_protection_cython.py --restore # Restore original Python files
    python tools/compile_protection_cython.py --status  # Check compilation status
    python tools/compile_protection_cython.py --clean   # Remove build artifacts
"""
from __future__ import annotations

import argparse
import glob
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
BACKUP_DIR = BASE_DIR / "tools" / "_cython_originals"

TARGET_MODULES = [
    "app/services/license_service.py",
    "app/handlers/license.py",
    "backend/keygen_service.py",
    "app/services/crypto_storage.py",
]


def check_compiler_toolchain() -> Dict[str, bool]:
    """Check availability of Cython and a C compiler."""
    status = {"cython": False, "c_compiler": False}

    # 1. Check Cython
    try:
        import Cython  # noqa: F401
        status["cython"] = True
    except ImportError:
        status["cython"] = False

    # 2. Check C compiler
    system = platform.system()
    if system in ("Linux", "Darwin"):
        for compiler in ["gcc", "clang", "cc"]:
            if shutil.which(compiler):
                status["c_compiler"] = True
                break
    elif system == "Windows":
        # Check cl.exe or gcc (MinGW)
        if shutil.which("cl") or shutil.which("gcc"):
            status["c_compiler"] = True
        else:
            # Check vswhere or Visual Studio installations
            vswhere = Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Microsoft Visual Studio" / "Installer" / "vswhere.exe"
            if vswhere.exists():
                status["c_compiler"] = True

    return status


def get_status() -> List[Dict[str, str]]:
    """Inspect each target file to report current compilation state."""
    results = []
    ext_suffix = ".pyd" if platform.system() == "Windows" else ".so"

    for rel_path in TARGET_MODULES:
        py_file = BASE_DIR / rel_path
        parent = py_file.parent
        stem = py_file.stem

        # Look for matching compiled binaries (*.stem.*.so / *.stem.*.pyd)
        binaries = list(parent.glob(f"{stem}.*{ext_suffix}")) + list(parent.glob(f"{stem}{ext_suffix}"))
        has_binary = len(binaries) > 0
        has_source = py_file.exists()

        if has_binary and not has_source:
            state = f"Compiled Native ({binaries[0].name})"
        elif has_binary and has_source:
            # Check if source is a loader stub or original
            text = py_file.read_text(encoding="utf-8", errors="ignore")
            if "Compiled Cython Module Loader" in text:
                state = f"Compiled Native + Loader ({binaries[0].name})"
            else:
                state = f"Binary Present + Full Source ({binaries[0].name})"
        elif has_source:
            text = py_file.read_text(encoding="utf-8", errors="ignore")
            if "# Zeralda ERP - Protected Module" in text:
                state = "Obfuscated (Marshal/Base64)"
            else:
                state = "Plain Python Source"
        else:
            state = "Missing"

        results.append({
            "module": rel_path,
            "state": state,
            "has_binary": str(has_binary),
            "binary_name": binaries[0].name if binaries else "-",
        })
    return results


def compile_modules() -> bool:
    """Compile target modules to native extensions via Cython and Setuptools."""
    print("=" * 65)
    print("  Zeralda ERP — Cython Native Compilation Tool")
    print("=" * 65)

    toolchain = check_compiler_toolchain()
    print(f"[*] Toolchain status:")
    print(f"    - Cython installed:     {'YES' if toolchain['cython'] else 'NO'}")
    print(f"    - C Compiler available: {'YES' if toolchain['c_compiler'] else 'NO'}")

    if not toolchain["cython"]:
        print("\n[!] Cython is not installed in the current environment.")
        print("    Install it with:")
        print("        pip install cython setuptools")
        print("    or in a virtualenv:")
        print("        .venv/bin/pip install cython setuptools")
        return False

    if not toolchain["c_compiler"]:
        print("\n[!] No C compiler detected (gcc, clang, or MSVC).")
        print("    On Windows: Install Visual Studio C++ Build Tools or MinGW-w64.")
        print("    On Linux:   Run 'sudo apt install build-essential python3-dev'.")
        return False

    # Backup originals
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for rel_path in TARGET_MODULES:
        src = BASE_DIR / rel_path
        if src.exists():
            dest = BACKUP_DIR / rel_path
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists():
                shutil.copy2(src, dest)
                print(f"[+] Backed up original: {rel_path} -> tools/_cython_originals/{rel_path}")

    # Build extensions using setup script in a subprocess
    setup_code = f"""
import sys
from pathlib import Path
from setuptools import setup, Extension
from Cython.Build import cythonize

base_dir = Path(r"{BASE_DIR}")
extensions = []

for rel_path in {TARGET_MODULES!r}:
    src_file = base_dir / rel_path
    if not src_file.exists():
        continue
    # Module name, e.g. app.services.license_service
    mod_name = rel_path.replace(".py", "").replace("/", ".").replace("\\\\", ".")
    ext = Extension(
        name=mod_name,
        sources=[str(src_file)],
        extra_compile_args=["-O3"] if sys.platform != "win32" else ["/O2"],
    )
    extensions.append(ext)

setup(
    ext_modules=cythonize(
        extensions,
        compiler_directives={{
            'language_level': '3',
            'always_allow_keywords': True,
            'boundscheck': False,
            'wraparound': False,
        }},
        build_dir=str(base_dir / "build" / "cython"),
    ),
    script_args=["build_ext", "--inplace"],
)
"""
    tmp_setup = BASE_DIR / "tools" / "_tmp_cython_setup.py"
    try:
        tmp_setup.write_text(setup_code, encoding="utf-8")
        print("\n[*] Invoking Cython compiler...")
        proc = subprocess.run(
            [sys.executable, str(tmp_setup)],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            print("[X] Compilation failed:")
            print(proc.stdout)
            print(proc.stderr)
            return False

        print("[OK] Native extensions compiled successfully!")

        # Move or configure binaries
        ext_suffix = ".pyd" if platform.system() == "Windows" else ".so"
        for rel_path in TARGET_MODULES:
            py_file = BASE_DIR / rel_path
            parent = py_file.parent
            stem = py_file.stem
            binaries = list(parent.glob(f"{stem}.*{ext_suffix}")) + list(parent.glob(f"{stem}{ext_suffix}"))
            if binaries:
                print(f"    -> Generated: {binaries[0].relative_to(BASE_DIR)}")

        # Update integrity hashes
        try:
            sys.path.insert(0, str(BASE_DIR))
            from app.services import license_service
            license_service.reset_integrity()
            print("[+] Integrity database re-hashed and synchronized.")
        except Exception as e:
            print(f"[!] Note: integrity re-hash skipped: {e}")

        return True
    finally:
        if tmp_setup.exists():
            try:
                tmp_setup.unlink()
            except OSError:
                pass


def restore_originals() -> bool:
    """Restore original Python files from tools/_cython_originals and clean binaries."""
    print("=" * 65)
    print("  Restoring Original Python Files from Cython Backup")
    print("=" * 65)

    if not BACKUP_DIR.exists():
        print("[!] No backup directory found at tools/_cython_originals")
        return False

    ext_suffix = ".pyd" if platform.system() == "Windows" else ".so"
    restored = 0

    for rel_path in TARGET_MODULES:
        backup_file = BACKUP_DIR / rel_path
        target_file = BASE_DIR / rel_path
        parent = target_file.parent
        stem = target_file.stem

        # Remove compiled binaries
        for bin_file in list(parent.glob(f"{stem}.*{ext_suffix}")) + list(parent.glob(f"{stem}{ext_suffix}")):
            try:
                bin_file.unlink()
                print(f"[-] Removed binary: {bin_file.relative_to(BASE_DIR)}")
            except OSError as e:
                print(f"[!] Could not remove binary {bin_file}: {e}")

        # Remove generated .c files
        for c_file in parent.glob(f"{stem}.c"):
            try:
                c_file.unlink()
                print(f"[-] Removed generated C file: {c_file.relative_to(BASE_DIR)}")
            except OSError:
                pass

        # Restore original .py
        if backup_file.exists():
            target_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(backup_file, target_file)
            print(f"[+] Restored: {rel_path}")
            restored += 1

    clean_artifacts()

    # Reset integrity hashes
    try:
        sys.path.insert(0, str(BASE_DIR))
        from app.services import license_service
        license_service.reset_integrity()
        print("[+] Integrity database re-hashed.")
    except Exception as e:
        print(f"[!] Note: integrity re-hash skipped: {e}")

    print(f"\n[OK] Restored {restored} target files.")
    return True


def clean_artifacts() -> None:
    """Remove temporary build and cache artifacts."""
    build_dir = BASE_DIR / "build"
    if build_dir.exists():
        try:
            shutil.rmtree(build_dir)
            print("[-] Removed build/ directory")
        except OSError:
            pass


def main():
    parser = argparse.ArgumentParser(description="Cython Native Compilation Tool for Zeralda ERP")
    parser.add_argument("--compile", action="store_true", help="Compile target modules to native binaries")
    parser.add_argument("--restore", action="store_true", help="Restore original Python files")
    parser.add_argument("--status", action="store_true", help="Show current compilation status")
    parser.add_argument("--clean", action="store_true", help="Clean build artifacts")

    args = parser.parse_args()

    if args.status:
        statuses = get_status()
        print("=" * 70)
        print(f"{'Module':<36} | {'State':<30}")
        print("-" * 70)
        for s in statuses:
            print(f"{s['module']:<36} | {s['state']:<30}")
        print("=" * 70)
    elif args.restore:
        restore_originals()
    elif args.clean:
        clean_artifacts()
        print("[OK] Cleaned temporary build files.")
    else:
        # Default action: compile
        compile_modules()


if __name__ == "__main__":
    main()
