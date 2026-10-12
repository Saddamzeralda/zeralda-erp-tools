#!/bin/sh
set -e
PORT="${PORT:-8080}"
echo "Starting Zeralda ERP on port $PORT..."
exec uvicorn app.app:app --host 0.0.0.0 --port "$PORT"
