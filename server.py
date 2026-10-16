"""Zeralda ERP Server — Launches the canonical FastAPI application.

This legacy server wrapper forwards all execution to app.main.
The original monolithic server is archived in legacy/server_monolith.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

_BASE = Path(__file__).resolve().parent
if str(_BASE) not in sys.path:
    sys.path.insert(0, str(_BASE))

if __name__ == "__main__":
    from app.main import main
    main()
