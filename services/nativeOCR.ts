/**
 * Moniezi Native OCR Bridge
 * 
 * Unified interface for OCR that automatically uses:
 * - iOS: Apple Vision Framework (95%+ accuracy)
 * - Android: Google ML Kit (95%+ accuracy)
 * - Web/PWA: Tesseract.js fallback (70-80% accuracy)
 * 
 * All processing happens 100% offline on device.
 */

// ============================================
// TYPES
// ============================================

export interface TextBlock {
  text: string;
  confidence: number;
  bounds: {
    x: number;      // 0-1 normalized
    y: number;      // 0-1 normalized
    width: number;  // 0-1 normalized
    height: number; // 0-1 normalized
  };
}

export interface RegionResult {
  text: string;
  confidence: number;
  blocks: TextBlock[];
}

export interface OCRResult {
  text: string;
  confidence: number;
  blocks: TextBlock[];
  blockCount?: number;
}

export interface RegionOCRResult {
  text: string;
  confidence: number;
  regions: {
    top: RegionResult;    // Merchant name, address (top 20%)
    middle: RegionResult; // Items (middle 50%)
    bottom: RegionResult; // Totals, payment (bottom 30%)
  };
}

export interface ParsedReceiptData {
  merchantName: string | null;
  merchantConfidence: number;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  date: string | null;
  rawText: string;
  overallConfidence: number;
  usedNativeOCR: boolean;
}

// ============================================
// PLATFORM DETECTION
// ============================================

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        MonieziOCR?: {
          recognizeText: (options: { image: string; fast?: boolean }) => Promise<OCRResult>;
          recognizeTextWithRegions: (options: { image: string }) => Promise<RegionOCRResult>;
        };
      };
    };
  }
}

function isNativePlatform(): boolean {
  try {
    return window.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function getNativePlugin() {
  try {
    return window.Capacitor?.Plugins?.MonieziOCR ?? null;
  } catch {
    return null;
  }
}

// ============================================
// CORE OCR FUNCTIONS
// ============================================

/**
 * Run OCR on an image using the best available engine
 * Automatically uses native APIs on iOS/Android, falls back to Tesseract on web
 */
export async function runOCR(
  imageData: string,
  options?: { fast?: boolean }
): Promise<OCRResult> {
  const nativePlugin = getNativePlugin();
  
  if (isNativePlatform() && nativePlugin) {
    console.log('[MonieziOCR] Using native OCR engine');
    try {
      return await nativePlugin.recognizeText({
        image: imageData,
        fast: options?.fast ?? false
      });
    } catch (e) {
      console.error('[MonieziOCR] Native OCR failed, falling back to Tesseract:', e);
    }
  }
  
  // Fallback to Tesseract (web/PWA)
  console.log('[MonieziOCR] Using Tesseract.js fallback');
  return runTesseractOCR(imageData);
}

/**
 * Run region-based OCR optimized for receipt scanning
 * Splits image into zones for better merchant/total extraction
 */
export async function runRegionOCR(imageData: string): Promise<RegionOCRResult> {
  const nativePlugin = getNativePlugin();
  
  if (isNativePlatform() && nativePlugin) {
    console.log('[MonieziOCR] Using native region-based OCR');
    try {
      return await nativePlugin.recognizeTextWithRegions({ image: imageData });
    } catch (e) {
      console.error('[MonieziOCR] Native region OCR failed:', e);
    }
  }
  
  // Fallback: run full OCR and simulate regions
  console.log('[MonieziOCR] Using Tesseract fallback with simulated regions');
  const result = await runTesseractOCR(imageData);
  return simulateRegions(result);
}

/**
 * High-level function: Scan receipt and extract structured data
 * Includes confidence gating and smart field extraction
 */
export async function scanReceipt(
  imageData: string,
  onProgress?: (percent: number, status: string) => void
): Promise<ParsedReceiptData> {
  const startTime = performance.now();
  const usedNative = isNativePlatform() && getNativePlugin() !== null;
  
  onProgress?.(10, usedNative ? 'Using device OCR...' : 'Initializing OCR...');
  
  // Use region-based OCR for better accuracy
  const ocrResult = await runRegionOCR(imageData);
  
  onProgress?.(60, 'Extracting data...');
  
  // Extract fields from regions
  const merchantName = extractMerchant(ocrResult.regions.top);
  const totals = extractTotals(ocrResult.regions.bottom, ocrResult.text);
  const date = extractDate(ocrResult.text);
  
  onProgress?.(90, 'Finalizing...');
  
  // Apply confidence gating
  const merchantConfidence = ocrResult.regions.top.confidence;
  const finalMerchant = merchantConfidence >= 60 ? merchantName : null;
  
  onProgress?.(100, 'Complete!');
  
  return {
    merchantName: finalMerchant,
    merchantConfidence,
    total: totals.total,
    subtotal: totals.subtotal,
    tax: totals.tax,
    date,
    rawText: ocrResult.text,
    overallConfidence: ocrResult.confidence,
    usedNativeOCR: usedNative
  };
}

// ============================================
// TESSERACT FALLBACK (for web/PWA)
// ============================================

let tesseractWorker: any = null;

async function runTesseractOCR(imageData: string): Promise<OCRResult> {
  // Dynamic import to avoid loading Tesseract on native platforms
  const Tesseract = await import('tesseract.js');
  
  if (!tesseractWorker) {
    tesseractWorker = await Tesseract.createWorker('eng');
  }
  
  const result = await tesseractWorker.recognize(imageData);
  
  // Convert Tesseract result to our format
  const blocks: TextBlock[] = [];
  
  if (result.data.lines) {
    for (const line of result.data.lines) {
      blocks.push({
        text: line.text,
        confidence: line.confidence / 100,
        bounds: {
          x: line.bbox.x0 / result.data.width,
          y: line.bbox.y0 / result.data.height,
          width: (line.bbox.x1 - line.bbox.x0) / result.data.width,
          height: (line.bbox.y1 - line.bbox.y0) / result.data.height
        }
      });
    }
  }
  
  return {
    text: result.data.text,
    confidence: result.data.confidence,
    blocks,
    blockCount: blocks.length
  };
}

function simulateRegions(ocrResult: OCRResult): RegionOCRResult {
  // Split blocks into regions based on Y position
  const topBlocks: TextBlock[] = [];
  const middleBlocks: TextBlock[] = [];
  const bottomBlocks: TextBlock[] = [];
  
  for (const block of ocrResult.blocks) {
    const centerY = block.bounds.y + block.bounds.height / 2;
    
    if (centerY < 0.2) {
      topBlocks.push(block);
    } else if (centerY > 0.7) {
      bottomBlocks.push(block);
    } else {
      middleBlocks.push(block);
    }
  }
  
  const calcRegionConfidence = (blocks: TextBlock[]) => {
    if (blocks.length === 0) return 0;
    return blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length * 100;
  };
  
  return {
    text: ocrResult.text,
    confidence: ocrResult.confidence,
    regions: {
      top: {
        text: topBlocks.map(b => b.text).join('\n'),
        confidence: calcRegionConfidence(topBlocks),
        blocks: topBlocks
      },
      middle: {
        text: middleBlocks.map(b => b.text).join('\n'),
        confidence: calcRegionConfidence(middleBlocks),
        blocks: middleBlocks
      },
      bottom: {
        text: bottomBlocks.map(b => b.text).join('\n'),
        confidence: calcRegionConfidence(bottomBlocks),
        blocks: bottomBlocks
      }
    }
  };
}

// ============================================
// FIELD EXTRACTION (Multi-language support)
// ============================================

// Merchant extraction from top region
function extractMerchant(topRegion: RegionResult): string | null {
  const lines = topRegion.text.split('\n').filter(l => l.trim().length > 0);
  
  // Skip common non-merchant patterns
  const skipPatterns = [
    /^(receipt|invoice|bill|ticket|bon|factura|rechnung|ricevuta|fatura)/i,
    /^\d+[\/\-\.]\d+[\/\-\.]\d+/, // Dates
    /^\d{2}:\d{2}/, // Times
    /^tel|phone|fax|www\.|http/i,
    /^address|adresse|indirizzo|adresa/i
  ];
  
  for (const line of lines.slice(0, 5)) {
    const cleaned = line.trim();
    
    // Skip if matches skip patterns
    if (skipPatterns.some(p => p.test(cleaned))) continue;
    
    // Skip if too short or too long
    if (cleaned.length < 2 || cleaned.length > 50) continue;
    
    // Skip if mostly numbers
    const letterRatio = (cleaned.match(/[a-zA-Z]/g) || []).length / cleaned.length;
    if (letterRatio < 0.3) continue;
    
    return cleaned;
  }
  
  return null;
}

// Total extraction with multi-language support
function extractTotals(bottomRegion: RegionResult, fullText: string): { total: number | null; subtotal: number | null; tax: number | null } {
  const text = (bottomRegion.text + '\n' + fullText).toLowerCase();
  const lines = text.split('\n');
  
  // Multi-language total keywords
  const totalKeywords = [
    'grand total', 'total due', 'amount due', 'balance due', 'total',
    'totale', 'totali', 'gesamt', 'summe', 'total a pagar', 'montant',
    'totaal', 'suma', 'итого', 'razem', 'celkem'
  ];
  
  const subtotalKeywords = [
    'subtotal', 'sub-total', 'sub total', 'netto', 'nëntotali',
    'sottototal', 'zwischensumme', 'subtotaal', 'podzbiór'
  ];
  
  const taxKeywords = [
    'tax', 'vat', 'gst', 'hst', 'pst', 'mwst', 'iva', 'tva',
    'tvsh', 'imposto', 'mehrwertsteuer', 'btw', 'podatek'
  ];
  
  let total: number | null = null;
  let subtotal: number | null = null;
  let tax: number | null = null;
  
  // Amount extraction pattern (handles various formats)
  const amountPattern = /(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)/g;
  
  for (const line of lines) {
    const amounts = line.match(amountPattern);
    if (!amounts) continue;
    
    // Parse the largest amount on this line
    const parsedAmounts = amounts.map(a => {
      // Handle European format (1.234,56) vs US format (1,234.56)
      let normalized = a.replace(/\s/g, '');
      
      // If has both . and , check which is decimal
      if (normalized.includes('.') && normalized.includes(',')) {
        if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
          // European: 1.234,56
          normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
          // US: 1,234.56
          normalized = normalized.replace(/,/g, '');
        }
      } else if (normalized.includes(',')) {
        // Could be decimal or thousands
        const parts = normalized.split(',');
        if (parts[parts.length - 1].length === 2) {
          // Likely decimal: 1234,56
          normalized = normalized.replace(',', '.');
        } else {
          // Likely thousands: 1,234
          normalized = normalized.replace(/,/g, '');
        }
      }
      
      return parseFloat(normalized);
    }).filter(n => !isNaN(n) && n > 0);
    
    if (parsedAmounts.length === 0) continue;
    
    const amount = Math.max(...parsedAmounts);
    
    // Check for total keywords
    if (total === null && totalKeywords.some(k => line.includes(k))) {
      total = amount;
      continue;
    }
    
    // Check for subtotal keywords  
    if (subtotal === null && subtotalKeywords.some(k => line.includes(k))) {
      subtotal = amount;
      continue;
    }
    
    // Check for tax keywords
    if (tax === null && taxKeywords.some(k => line.includes(k))) {
      tax = amount;
      continue;
    }
  }
  
  // If no total found with keywords, use the largest amount in bottom region
  if (total === null) {
    const allAmounts = bottomRegion.text.match(amountPattern);
    if (allAmounts) {
      const parsed = allAmounts.map(a => {
        let n = a.replace(/\s/g, '').replace(/,/g, '.');
        if (n.split('.').length > 2) {
          // Multiple dots = thousands separator
          const parts = n.split('.');
          const lastPart = parts.pop();
          n = parts.join('') + '.' + lastPart;
        }
        return parseFloat(n);
      }).filter(n => !isNaN(n) && n > 0);
      
      if (parsed.length > 0) {
        total = Math.max(...parsed);
      }
    }
  }
  
  return { total, subtotal, tax };
}

// Date extraction with multi-format support
function extractDate(text: string): string | null {
  const patterns = [
    // DD.MM.YYYY or DD/MM/YYYY (European)
    /(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/,
    // DD.MM.YY or DD/MM/YY
    /(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{2})(?!\d)/,
    // YYYY-MM-DD (ISO)
    /(\d{4})-(\d{2})-(\d{2})/,
    // MM/DD/YYYY (US)
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    // Month DD, YYYY
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i
  ];
  
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    
    try {
      let year: number, month: number, day: number;
      
      if (pattern.source.includes('Jan|Feb')) {
        // Text month format
        month = monthMap[match[1].toLowerCase().slice(0, 3)];
        day = parseInt(match[2]);
        year = parseInt(match[3]);
      } else if (pattern.source.startsWith('(\\d{4})')) {
        // ISO format
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else {
        // Numeric format - assume DD/MM/YYYY for European
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = parseInt(match[3]);
        
        // Handle 2-digit year
        if (year < 100) {
          year = year > 50 ? 1900 + year : 2000 + year;
        }
        
        // Swap if day > 12 and month <= 12 (likely DD/MM not MM/DD)
        if (day > 12 && month <= 12) {
          // Keep as is - it's DD/MM
        } else if (month > 12 && day <= 12) {
          // Swap - it's MM/DD
          [day, month] = [month, day];
        }
      }
      
      // Validate
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2030) {
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

// ============================================
// EXPORTS
// ============================================

export { isNativePlatform };
