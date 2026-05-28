'use strict';

const tesseract = require('node-tesseract-ocr');
const path = require('path');
const fs = require('fs');

const env = require('../../config/env');
const logger = require('../../utils/logger');

// ---------------------------------------------------------------------------
// Tesseract OCR Service — wraps node-tesseract-ocr for document processing.
// Supports: PDF (via poppler), JPEG, PNG, TIFF, BMP
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  lang: env.TESSERACT_LANG,
  oem: env.TESSERACT_OEM,
  psm: env.TESSERACT_PSM,
};

/**
 * Extract text from an image or PDF file.
 * @param {string} filePath - Absolute path to the file
 * @param {object} [config] - Tesseract config overrides
 * @returns {Promise<{ text: string, filePath: string, processingTimeMs: number }>}
 */
const extractText = async (filePath, config = {}) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`OCR: File not found at path: ${filePath}`);
  }

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const start = Date.now();

  logger.debug(`OCR: Processing file: ${path.basename(filePath)}`);

  const text = await tesseract.recognize(filePath, mergedConfig);
  const processingTimeMs = Date.now() - start;

  logger.info(`OCR: Extracted ${text.length} chars from ${path.basename(filePath)} in ${processingTimeMs}ms`);

  return {
    text: text.trim(),
    filePath,
    processingTimeMs,
  };
};

/**
 * Extract text from a buffer (e.g. uploaded file in memory).
 * Saves to temp dir, runs OCR, then cleans up.
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {object} [config]
 * @returns {Promise<{ text: string, processingTimeMs: number }>}
 */
const extractTextFromBuffer = async (buffer, originalName, config = {}) => {
  const tempDir = path.join(process.cwd(), env.TEMP_UPLOAD_DIR);

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const tempPath = path.join(tempDir, `ocr_${Date.now()}_${originalName}`);

  try {
    fs.writeFileSync(tempPath, buffer);
    const result = await extractText(tempPath, config);
    return { text: result.text, processingTimeMs: result.processingTimeMs };
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
};

module.exports = { extractText, extractTextFromBuffer };
