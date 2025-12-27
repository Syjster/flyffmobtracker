// src/ocr/xp-ocr.js - XP Bar OCR with Tesseract.js and Character Segmentation
let Tesseract;
let tesseractAvailable = false;

try {
  Tesseract = require('tesseract.js');
  tesseractAvailable = true;
  console.log('[OCR] Tesseract.js loaded successfully');
} catch (err) {
  console.warn('[OCR] Tesseract.js not installed:', err.message);
  console.warn('[OCR] Run: npm install tesseract.js');
}

const path = require('path');

// OCR Configuration
let ocrConfig = {
  scale: 4,
  threshold: 180,
  invert: false,
  contrast: 1.2,
  brightness: 0,
  tesseractLang: 'eng',
  minValue: 0,
  maxValue: 100,
  expectedDecimals: 4,
  useGptFallback: true,
  gptFallbackThreshold: 3,
  
  // Character segmentation settings
  useCharSegmentation: true,
  // XP format: XX.XXXX% = 8 characters
  charPositions: [
    { name: 'd1', start: 0, end: 0.125 },    // First digit
    { name: 'd2', start: 0.125, end: 0.25 },  // Second digit
    { name: 'dot', start: 0.25, end: 0.35 },  // Decimal point
    { name: 'd3', start: 0.35, end: 0.475 },  // Third digit
    { name: 'd4', start: 0.475, end: 0.6 },   // Fourth digit
    { name: 'd5', start: 0.6, end: 0.725 },   // Fifth digit
    { name: 'd6', start: 0.725, end: 0.85 },  // Sixth digit
    { name: 'pct', start: 0.85, end: 1.0 },   // Percent sign
  ]
};

let worker = null;
let workerReady = false;
let consecutiveFailures = 0;

// Initialize Tesseract worker
async function initWorker() {
  if (!tesseractAvailable) {
    console.warn('[OCR] Tesseract.js not available, skipping worker init');
    return null;
  }
  
  if (worker && workerReady) return worker;
  
  try {
    console.log('[OCR] Initializing Tesseract worker...');
    
    const { createWorker } = Tesseract;
    worker = await createWorker('eng');
    
    // Set parameters for number recognition
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.%',
      tessedit_pageseg_mode: '7',  // Single text line
      preserve_interword_spaces: '0',
    });
    
    workerReady = true;
    console.log('[OCR] Tesseract worker ready');
    return worker;
  } catch (err) {
    console.error('[OCR] Failed to initialize worker:', err);
    workerReady = false;
    return null;
  }
}

async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
    workerReady = false;
  }
}

// Parse XP value from OCR text
// Format is ALWAYS: XX.XXXX% or X.XXXX% (1-2 integer digits, 4 decimal digits)
function parseXpValue(text) {
  if (!text || text.trim() === '') {
    console.log('[OCR] Empty text received');
    return null;
  }
  
  // Remove everything except digits
  let digits = text.replace(/[^0-9]/g, '');
  
  console.log('[OCR] Cleaned digits:', digits, 'from:', text.trim());
  
  if (!digits || digits.length < 5) {
    console.log('[OCR] Not enough digits:', digits ? digits.length : 0);
    return null;
  }
  
  // If we have too many digits, the decimal point was likely misread as digits
  // Flyff XP is always 0-100, so first 1-2 digits are the integer part
  
  let intPart, decPart;
  
  if (digits.length === 5) {
    // X.XXXX format (e.g., "50000" -> "5.0000")
    intPart = digits.substring(0, 1);
    decPart = digits.substring(1, 5);
  } else if (digits.length === 6) {
    // XX.XXXX format (e.g., "650000" -> "65.0000")
    intPart = digits.substring(0, 2);
    decPart = digits.substring(2, 6);
  } else if (digits.length === 7) {
    // Decimal point might have been read as 1 digit
    // Try both: X + garbage + 4 digits, or XX + garbage + 4 digits
    // Check which gives valid 0-100 range
    
    // Try XX.XXXX (skip middle garbage digit)
    intPart = digits.substring(0, 2);
    decPart = digits.substring(3, 7);
    let value = parseFloat(`${intPart}.${decPart}`);
    
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      console.log('[OCR] Reconstructed (7 digits, skip 1):', `${intPart}.${decPart}`);
      return value;
    }
    
    // Try X.XXXX (skip middle garbage digit)
    intPart = digits.substring(0, 1);
    decPart = digits.substring(2, 6);
    value = parseFloat(`${intPart}.${decPart}`);
    
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      console.log('[OCR] Reconstructed (7 digits, X.XXXX):', `${intPart}.${decPart}`);
      return value;
    }
    
    return null;
  } else if (digits.length === 8) {
    // Decimal point was read as 2 digits (like "31" for ".")
    // Format: XX + 2garbage + XXXX
    intPart = digits.substring(0, 2);
    decPart = digits.substring(4, 8);
    let value = parseFloat(`${intPart}.${decPart}`);
    
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      console.log('[OCR] Reconstructed (8 digits, skip 2):', `${intPart}.${decPart}`);
      return value;
    }
    
    // Also try X + 2garbage + XXXX for single digit XP
    intPart = digits.substring(0, 1);
    decPart = digits.substring(3, 7);
    value = parseFloat(`${intPart}.${decPart}`);
    
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      console.log('[OCR] Reconstructed (8 digits, X + skip 2):', `${intPart}.${decPart}`);
      return value;
    }
    
    return null;
  } else if (digits.length > 8) {
    // Too many digits - try to find a reasonable interpretation
    // Take first 2 as int, last 4 as decimal
    intPart = digits.substring(0, 2);
    decPart = digits.substring(digits.length - 4);
    let value = parseFloat(`${intPart}.${decPart}`);
    
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      console.log('[OCR] Reconstructed (>8 digits):', `${intPart}.${decPart}`);
      return value;
    }
    
    return null;
  }
  
  const reconstructed = `${intPart}.${decPart}`;
  const value = parseFloat(reconstructed);
  
  console.log('[OCR] Reconstructed:', reconstructed);
  
  if (Number.isFinite(value) && value >= 0 && value <= 100) {
    return value;
  }
  
  return null;
}

// Read single character from image segment
async function readSingleChar(buffer, isDigit = true) {
  if (!worker || !workerReady) return null;
  
  try {
    // Use PSM 10 (single character) for individual chars
    await worker.setParameters({
      tessedit_char_whitelist: isDigit ? '0123456789' : '.%',
      tessedit_pageseg_mode: '10',  // Single character
    });
    
    const result = await worker.recognize(buffer);
    const char = result.data.text.trim().charAt(0);
    
    // Reset to normal mode
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.%',
      tessedit_pageseg_mode: '7',
    });
    
    return char || null;
  } catch (err) {
    console.error('[OCR] Single char error:', err);
    return null;
  }
}

// Main OCR function
async function readXpFromImage(dataUrl) {
  if (!tesseractAvailable) {
    console.log('[OCR] Tesseract not available, returning null');
    consecutiveFailures++;
    return null;
  }
  
  try {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const buffer = Buffer.from(base64, 'base64');
    
    console.log('[OCR] Image buffer size:', buffer.length, 'bytes');
    
    let result;
    let bestResult = null;
    
    const w = await initWorker();
    if (w && workerReady) {
      // Try multiple PSM modes and pick the best one
      const psmModes = [
        { mode: '7', name: 'single line' },
        { mode: '8', name: 'single word' },
        { mode: '6', name: 'uniform block' },
        { mode: '13', name: 'raw line' },
      ];
      
      for (const psm of psmModes) {
        await w.setParameters({
          tessedit_char_whitelist: '0123456789.%',
          tessedit_pageseg_mode: psm.mode,
        });
        
        result = await w.recognize(buffer);
        const text = result.data.text.trim();
        
        // Check if we got valid digits
        const digits = text.replace(/[^0-9]/g, '');
        
        if (digits.length >= 5) {
          console.log(`[OCR] PSM ${psm.mode} (${psm.name}): "${text}" - ${digits.length} digits`);
          bestResult = result;
          break;  // Found good result
        }
      }
      
      if (!bestResult) {
        // No good result from any PSM mode
        console.log('[OCR] All PSM modes failed to find digits');
        result = { data: { text: '', confidence: 0 } };
      } else {
        result = bestResult;
      }
    } else {
      console.log('[OCR] Using static recognize method...');
      result = await Tesseract.recognize(buffer, 'eng', {
        logger: () => {}
      });
    }
    
    const rawText = result.data.text;
    const confidence = result.data.confidence;
    
    console.log(`[OCR] Raw: "${rawText.trim()}" (confidence: ${confidence?.toFixed(1) || 0}%)`);
    
    const xpValue = parseXpValue(rawText);
    
    if (xpValue !== null) {
      consecutiveFailures = 0;
      return {
        value: xpValue,
        confidence: confidence || 0,
        method: 'tesseract',
        rawText: rawText.trim()
      };
    }
    
    consecutiveFailures++;
    console.log(`[OCR] Parse failed (${consecutiveFailures} consecutive)`);
    
    return null;
  } catch (err) {
    console.error('[OCR] Error:', err);
    consecutiveFailures++;
    workerReady = false;
    return null;
  }
}

// Read XP from pre-segmented character images
// charImages = array of {buffer, isDigit} for each character position
async function readXpFromSegments(charImages) {
  if (!tesseractAvailable || !worker || !workerReady) {
    return null;
  }
  
  try {
    const chars = [];
    
    for (let i = 0; i < charImages.length; i++) {
      const { buffer, isDigit } = charImages[i];
      const char = await readSingleChar(buffer, isDigit);
      chars.push(char || '?');
    }
    
    // Reconstruct: XX.XXXX%
    const result = chars.slice(0, 2).join('') + '.' + chars.slice(3, 7).join('');
    console.log(`[OCR] Segmented result: ${result}`);
    
    const value = parseFloat(result);
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      consecutiveFailures = 0;
      return {
        value: value,
        confidence: 90,
        method: 'tesseract-segmented',
        rawText: result
      };
    }
    
    return null;
  } catch (err) {
    console.error('[OCR] Segment error:', err);
    return null;
  }
}

// Canvas-based OCR not available in Node
async function readXpFromCanvas(canvas) {
  console.warn('[OCR] readXpFromCanvas not available in Node.js context');
  return null;
}

function shouldUseGptFallback() {
  return ocrConfig.useGptFallback && 
         consecutiveFailures >= ocrConfig.gptFallbackThreshold;
}

function getOcrConfig() {
  return { ...ocrConfig };
}

async function setOcrConfig(newConfig) {
  ocrConfig = { ...ocrConfig, ...newConfig };
  
  if (worker && newConfig.tesseractConfig) {
    await worker.setParameters(ocrConfig.tesseractConfig);
  }
  
  return ocrConfig;
}

function resetFailures() {
  consecutiveFailures = 0;
}

function isAvailable() {
  return tesseractAvailable;
}

module.exports = {
  initWorker,
  terminateWorker,
  readXpFromImage,
  readXpFromSegments,
  readXpFromCanvas,
  shouldUseGptFallback,
  getOcrConfig,
  setOcrConfig,
  resetFailures,
  parseXpValue,
  isAvailable,
};