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

# Install system dependencies (build tools, libpq, curl, certificates, and native Tesseract OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    gcc \
    libpq-dev \
    curl \
    tesseract-ocr \
    tesseract-ocr-ara \
    tesseract-ocr-fra \
    tesseract-ocr-eng \
    tesseract-ocr-osd \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Install python requirements (skipping Windows-only tray libraries like pystray)
COPY requirements.txt /app/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . /app/

# Ensure data directory exists with write permissions and keep seed copy in data_defaults
RUN mkdir -p /app/data /app/logs && cp -r /app/data /app/data_defaults

# Default port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/api/ping || exit 1

# Launch the FastAPI app via app.main
CMD ["python", "-m", "app.main"]
