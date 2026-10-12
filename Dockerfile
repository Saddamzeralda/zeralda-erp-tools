# ==============================================================================
# Zeralda ERP — Production Dockerfile for Render / Railway / Cloud VPS
# ==============================================================================
FROM python:3.11-slim

# Prevent Python from writing bytecode and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    ENVIRONMENT=production \
    AUTO_OPEN_BROWSER=false \
    ENABLE_REMOTE_TUNNEL=false

WORKDIR /app

# Install system dependencies (build tools, libpq, curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python requirements (skipping Windows-only tray libraries like pystray)
COPY requirements.txt /app/
RUN grep -v -i "pystray" requirements.txt > /tmp/req.txt && \
    pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /tmp/req.txt

# Copy application source
COPY . /app/

# Ensure data directory exists with write permissions
RUN mkdir -p /app/data /app/logs

# Default port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/api/ping || exit 1

# Launch the FastAPI app via uvicorn
CMD ["sh", "-c", "uvicorn app.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
