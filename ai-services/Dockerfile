FROM node:20-alpine

# Install Tesseract OCR and language data
RUN apk add --no-cache \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    poppler-utils \
    python3 \
    make \
    g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Create required directories
RUN mkdir -p logs tmp/uploads

EXPOSE 5001

CMD ["node", "server.js"]
