/**
 * Moniezi Offline OCR Engine v2
 * 
 * Now with native platform support:
 * - iOS: Apple Vision Framework (95%+ accuracy)
 * - Android: Google ML Kit (95%+ accuracy)  
 * - Web/PWA: Tesseract.js fallback (70-80% accuracy)
 * 
 * Plus improved multi-language receipt parsing for European formats.
 * All processing happens 100% offline on device.
 */

import { scanReceipt, isNativePlatform, ParsedReceiptData } from './nativeOCR';

// ============================================
// TYPES
// ============================================

export interface ExtractedReceiptData {
  merchantName: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  date: string | null;
  suggestedCategory: string | null;
  categoryConfidence: 'high' | 'medium' | 'low';
  rawText: string;
  allAmounts: number[];
  allDates: string[];
  confidence: number;
  processingTimeMs: number;
  usedNativeOCR: boolean;
}

export interface MerchantMapping {
  patterns: string[];
  category: string;
  displayName?: string;
}

export interface LearnedMerchant {
  name: string;
  category: string;
  timesUsed: number;
  lastUsed: string;
}

// ============================================
// MERCHANT DATABASE (Built-in + Learned)
// ============================================

const BUILT_IN_MERCHANTS: MerchantMapping[] = [
  // European Retailers
  { patterns: ['spar', 'spar albania', 'eurospar', 'interspar'], category: 'Office Supplies', displayName: 'SPAR' },
  { patterns: ['lidl'], category: 'Office Supplies', displayName: 'Lidl' },
  { patterns: ['aldi', 'aldi nord', 'aldi sud'], category: 'Office Supplies', displayName: 'Aldi' },
  { patterns: ['carrefour'], category: 'Office Supplies', displayName: 'Carrefour' },
  { patterns: ['tesco'], category: 'Office Supplies', displayName: 'Tesco' },
  { patterns: ['rewe'], category: 'Office Supplies', displayName: 'REWE' },
  { patterns: ['edeka'], category: 'Office Supplies', displayName: 'Edeka' },
  { patterns: ['kaufland'], category: 'Office Supplies', displayName: 'Kaufland' },
  { patterns: ['billa'], category: 'Office Supplies', displayName: 'Billa' },
  { patterns: ['penny'], category: 'Office Supplies', displayName: 'Penny' },
  { patterns: ['migros'], category: 'Office Supplies', displayName: 'Migros' },
  { patterns: ['mercadona'], category: 'Office Supplies', displayName: 'Mercadona' },
  
  // US Food & Dining
  { patterns: ['starbucks', 'sbux'], category: 'Meals (Business)', displayName: 'Starbucks' },
  { patterns: ['mcdonalds', "mcdonald's"], category: 'Meals (Business)', displayName: "McDonald's" },
  { patterns: ['subway'], category: 'Meals (Business)', displayName: 'Subway' },
  { patterns: ['chipotle'], category: 'Meals (Business)', displayName: 'Chipotle' },
  { patterns: ['uber eats'], category: 'Meals (Business)', displayName: 'Uber Eats' },
  { patterns: ['doordash'], category: 'Meals (Business)', displayName: 'DoorDash' },
  
  // Gas / Fuel
  { patterns: ['shell'], category: 'Travel', displayName: 'Shell' },
  { patterns: ['chevron'], category: 'Travel', displayName: 'Chevron' },
  { patterns: ['exxon', 'mobil', 'esso'], category: 'Travel', displayName: 'Exxon' },
  { patterns: ['bp'], category: 'Travel', displayName: 'BP' },
  { patterns: ['total energies'], category: 'Travel', displayName: 'TotalEnergies' },
  { patterns: ['omv'], category: 'Travel', displayName: 'OMV' },
  
  // Office & Electronics
  { patterns: ['staples'], category: 'Office Supplies', displayName: 'Staples' },
  { patterns: ['amazon', 'amzn'], category: 'Office Supplies', displayName: 'Amazon' },
  { patterns: ['best buy'], category: 'Equipment', displayName: 'Best Buy' },
  { patterns: ['apple store', 'apple.com'], category: 'Equipment', displayName: 'Apple' },
  { patterns: ['media markt'], category: 'Equipment', displayName: 'MediaMarkt' },
  
  // Software / SaaS
  { patterns: ['adobe', 'creative cloud'], category: 'Software / SaaS', displayName: 'Adobe' },
  { patterns: ['microsoft', 'office 365'], category: 'Software / SaaS', displayName: 'Microsoft' },
  { patterns: ['google'], category: 'Software / SaaS', displayName: 'Google' },
  { patterns: ['dropbox'], category: 'Software / SaaS', displayName: 'Dropbox' },
  { patterns: ['slack'], category: 'Software / SaaS', displayName: 'Slack' },
  { patterns: ['zoom'], category: 'Software / SaaS', displayName: 'Zoom' },
  
  // Travel
  { patterns: ['uber', 'uber trip'], category: 'Travel', displayName: 'Uber' },
  { patterns: ['lyft'], category: 'Travel', displayName: 'Lyft' },
  { patterns: ['bolt'], category: 'Travel', displayName: 'Bolt' },
  { patterns: ['airbnb'], category: 'Travel', displayName: 'Airbnb' },
  { patterns: ['booking.com'], category: 'Travel', displayName: 'Booking.com' },
  { patterns: ['ryanair'], category: 'Travel', displayName: 'Ryanair' },
  { patterns: ['wizzair', 'wizz air'], category: 'Travel', displayName: 'Wizz Air' },
  
  // Retail
  { patterns: ['walmart'], category: 'Office Supplies', displayName: 'Walmart' },
  { patterns: ['target'], category: 'Office Supplies', displayName: 'Target' },
  { patterns: ['costco'], category: 'Office Supplies', displayName: 'Costco' },
  { patterns: ['home depot'], category: 'Equipment', displayName: 'Home Depot' },
  
  // Shipping
  { patterns: ['usps', 'postal service'], category: 'Shipping / Delivery', displayName: 'USPS' },
  { patterns: ['fedex'], category: 'Shipping / Delivery', displayName: 'FedEx' },
  { patterns: ['ups'], category: 'Shipping / Delivery', displayName: 'UPS' },
  { patterns: ['dhl'], category: 'Shipping / Delivery', displayName: 'DHL' },
  
  // Banking
  { patterns: ['paypal'], category: 'Bank Fees', displayName: 'PayPal' },
  { patterns: ['stripe'], category: 'Bank Fees', displayName: 'Stripe' },
  { patterns: ['wise', 'transferwise'], category: 'Bank Fees', displayName: 'Wise' },
  { patterns: ['revolut'], category: 'Bank Fees', displayName: 'Revolut' },
];

// Multi-language category keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Meals (Business)': [
    'restaurant', 'cafe', 'coffee', 'food', 'diner', 'grill', 'bistro',
    'pizzeria', 'bakery', 'deli', 'bar', 'ristorante', 'trattoria',
    'gasthaus', 'bäckerei', 'brasserie', 'boulangerie', 'restorant', 'kafe'
  ],
  'Travel': [
    'gas', 'fuel', 'petroleum', 'airline', 'hotel', 'motel', 'parking',
    'toll', 'transit', 'taxi', 'airport', 'benzin', 'tankstelle',
    'aeroporto', 'flughafen', 'aeroport'
  ],
  'Office Supplies': ['office', 'supplies', 'paper', 'ink', 'stationery'],
  'Equipment': ['computer', 'laptop', 'monitor', 'printer', 'electronics', 'hardware'],
  'Software / SaaS': ['software', 'subscription', 'cloud', 'app', 'license', 'saas'],
  'Shipping / Delivery': ['shipping', 'postage', 'courier', 'freight', 'delivery'],
};

// ============================================
// LOCAL STORAGE FOR LEARNED DATA
// ============================================

const LEARNED_MERCHANTS_KEY = 'moniezi_learned_merchants';

export function getLearnedMerchants(): LearnedMerchant[] {
  try {
    const stored = localStorage.getItem(LEARNED_MERCHANTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveLearnedMerchant(name: string, category: string): void {
  try {
    const merchants = getLearnedMerchants();
    const normalized = name.toLowerCase().trim();
    
    const existing = merchants.find(m => m.name.toLowerCase() === normalized);
    if (existing) {
      existing.category = category;
      existing.timesUsed += 1;
      existing.lastUsed = new Date().toISOString();
    } else {
      merchants.push({
        name: normalized,
        category,
        timesUsed: 1,
        lastUsed: new Date().toISOString()
      });
    }
    
    merchants.sort((a, b) => b.timesUsed - a.timesUsed);
    const trimmed = merchants.slice(0, 500);
    
    localStorage.setItem(LEARNED_MERCHANTS_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('[OCR] Failed to save learned merchant:', e);
  }
}

export function clearLearnedMerchants(): void {
  try {
    localStorage.removeItem(LEARNED_MERCHANTS_KEY);
  } catch (e) {
    console.warn('[OCR] Failed to clear learned merchants:', e);
  }
}

// ============================================
// MAIN OCR FUNCTION
// ============================================

export async function processReceiptImage(
  imageData: string | File | Blob,
  onProgress?: (percent: number, status: string) => void
): Promise<ExtractedReceiptData> {
  const startTime = performance.now();
  
  // Convert File/Blob to data URL if needed
  let dataUrl: string;
  if (typeof imageData === 'string') {
    dataUrl = imageData;
  } else {
    dataUrl = await blobToDataUrl(imageData);
  }
  
  // Use the native OCR bridge
  const nativeResult = await scanReceipt(dataUrl, onProgress);
  
  // Get category suggestion
  const { category, confidence: catConfidence } = suggestCategory(
    nativeResult.rawText, 
    nativeResult.merchantName
  );
  
  // Extract all amounts for reference
  const allAmounts = extractAllAmounts(nativeResult.rawText);
  const allDates = extractAllDates(nativeResult.rawText);
  
  const processingTimeMs = performance.now() - startTime;
  
  return {
    merchantName: nativeResult.merchantName,
    total: nativeResult.total,
    subtotal: nativeResult.subtotal,
    tax: nativeResult.tax,
    date: nativeResult.date,
    suggestedCategory: category,
    categoryConfidence: catConfidence,
    rawText: nativeResult.rawText,
    allAmounts,
    allDates,
    confidence: nativeResult.overallConfidence,
    processingTimeMs,
    usedNativeOCR: nativeResult.usedNativeOCR
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function blobToDataUrl(blob: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function extractAllAmounts(text: string): number[] {
  const amounts: number[] = [];
  const pattern = /(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?)/g;
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    let numStr = match[1].replace(/\s/g, '');
    
    // Handle European vs US format
    if (numStr.includes('.') && numStr.includes(',')) {
      if (numStr.lastIndexOf(',') > numStr.lastIndexOf('.')) {
        numStr = numStr.replace(/\./g, '').replace(',', '.');
      } else {
        numStr = numStr.replace(/,/g, '');
      }
    } else if (numStr.includes(',')) {
      const parts = numStr.split(',');
      if (parts[parts.length - 1].length === 2) {
        numStr = numStr.replace(',', '.');
      } else {
        numStr = numStr.replace(/,/g, '');
      }
    }
    
    const num = parseFloat(numStr);
    if (!isNaN(num) && num > 0 && num < 100000) {
      amounts.push(num);
    }
  }
  
  return [...new Set(amounts)].sort((a, b) => b - a);
}

function extractAllDates(text: string): string[] {
  const dates: string[] = [];
  const patterns = [
    /(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/g,
    /(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{2})(?!\d)/g,
    /(\d{4})-(\d{2})-(\d{2})/g
  ];
  
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      try {
        let year: number, month: number, day: number;
        
        if (match[1].length === 4) {
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        } else {
          day = parseInt(match[1]);
          month = parseInt(match[2]);
          year = parseInt(match[3]);
          if (year < 100) year = 2000 + year;
        }
        
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2030) {
          dates.push(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`);
        }
      } catch {
        continue;
      }
    }
  }
  
  return [...new Set(dates)];
}

function suggestCategory(text: string, merchantName: string | null): { category: string | null; confidence: 'high' | 'medium' | 'low' } {
  const textLower = text.toLowerCase();
  const merchantLower = (merchantName || '').toLowerCase();
  
  // Check learned merchants first
  const learnedMerchants = getLearnedMerchants();
  for (const learned of learnedMerchants) {
    if (merchantLower.includes(learned.name) || textLower.includes(learned.name)) {
      return { category: learned.category, confidence: 'high' };
    }
  }
  
  // Check built-in merchant database
  for (const merchant of BUILT_IN_MERCHANTS) {
    for (const pattern of merchant.patterns) {
      if (textLower.includes(pattern) || merchantLower.includes(pattern)) {
        return { category: merchant.category, confidence: 'high' };
      }
    }
  }
  
  // Fallback to keyword-based detection
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword)) {
        return { category, confidence: 'medium' };
      }
    }
  }
  
  return { category: null, confidence: 'low' };
}

// ============================================
// USER FEEDBACK LEARNING
// ============================================

export function learnFromUserCorrection(
  originalMerchant: string | null,
  correctedName: string,
  selectedCategory: string
): void {
  if (correctedName && correctedName.length >= 2) {
    saveLearnedMerchant(correctedName, selectedCategory);
  }
  
  if (originalMerchant && originalMerchant !== correctedName && originalMerchant.length >= 2) {
    saveLearnedMerchant(originalMerchant, selectedCategory);
  }
}

// ============================================
// IMAGE PREPROCESSING
// ============================================

export async function preprocessReceiptImage(imageData: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageData);
        return;
      }
      
      const MAX_DIM = 2000;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      // Grayscale + contrast for better OCR
      const imageData2 = ctx.getImageData(0, 0, width, height);
      const data = imageData2.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const contrast = 1.3;
        const enhanced = Math.max(0, Math.min(255, ((gray - 128) * contrast) + 128));
        data[i] = enhanced;
        data[i + 1] = enhanced;
        data[i + 2] = enhanced;
      }
      
      ctx.putImageData(imageData2, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(imageData);
    img.src = imageData;
  });
}

// ============================================
// EXPORTS
// ============================================

export { BUILT_IN_MERCHANTS, CATEGORY_KEYWORDS, isNativePlatform };
