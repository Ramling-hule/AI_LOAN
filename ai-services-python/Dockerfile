# ============================================================
# Python AI Services — Dockerfile
# Base: Python 3.11 slim (smaller image, no extras)
# ============================================================

FROM python:3.11-slim

# System dependencies for pdf2image + opencv
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer caching)
COPY requirements.txt .

# Step 1: Install paddlepaddle CPU from PaddlePaddle's official wheel index.
#         PyPI does not publish manylinux2014 wheels for paddlepaddle on Python 3.11,
#         so we must install it from the upstream source first.
RUN pip install --default-timeout=300 --no-cache-dir \
    paddlepaddle==2.6.1 \
    -f https://www.paddlepaddle.org.cn/whl/linux/cpu-mkl/stable.html

# Step 2: Install the rest of the project dependencies
RUN pip install --default-timeout=300 --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose FastAPI port
EXPOSE 5001

# Start Uvicorn (single worker)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001", "--workers", "1"]
