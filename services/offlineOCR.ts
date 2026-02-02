/**
 * Moniezi Offline OCR Engine
 * 
 * Privacy-first receipt scanning that works 100% offline using:
 * - Tesseract.js for OCR (bundled, no cloud)
 * - Pattern matching for field extraction
 * - Local merchant database for auto-categorization
 * - Learning from user corrections
 * 
 * This is a key differentiator vs QuickBooks - all data stays on device!
 */

import Tesseract from 'tesseract.js';

// ============================================
// TYPES
// ============================================

export interface ExtractedReceiptData {
  // Extracted fields
  merchantName: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  date: string | null; // ISO format YYYY-MM-DD
  
  // Suggested category based on merchant or keywords
  suggestedCategory: string | null;
  categoryConfidence: 'high' | 'medium' | 'low';
  
  // Raw data for user review
  rawText: string;
  allAmounts: number[];
  allDates: string[];
  
  // Processing metadata
  confidence: number; // 0-100
  processingTimeMs: number;
}

export interface MerchantMapping {
  patterns: string[]; // Keywords/patterns to match
  category: string;
  displayName?: string; // Clean name to show user
}

export interface LearnedMerchant {
  name: string;
  category: string;
  timesUsed: number;
  lastUsed: string; // ISO date
}

// ============================================
// MERCHANT DATABASE (Built-in + Learned)
// ============================================

// Built-in merchant mappings - common businesses
const BUILT_IN_MERCHANTS: MerchantMapping[] = [
  // Food & Dining
  { patterns: ['starbucks', 'sbux'], category: 'Meals (Business)', displayName: 'Starbucks' },
  { patterns: ['mcdonalds', "mcdonald's", 'mcd'], category: 'Meals (Business)', displayName: "McDonald's" },
  { patterns: ['subway'], category: 'Meals (Business)', displayName: 'Subway' },
  { patterns: ['chipotle'], category: 'Meals (Business)', displayName: 'Chipotle' },
  { patterns: ['panera'], category: 'Meals (Business)', displayName: 'Panera Bread' },
  { patterns: ['dunkin', 'donuts'], category: 'Meals (Business)', displayName: 'Dunkin' },
  { patterns: ['dominos', "domino's"], category: 'Meals (Business)', displayName: "Domino's" },
  { patterns: ['pizza hut'], category: 'Meals (Business)', displayName: 'Pizza Hut' },
  { patterns: ['uber eats', 'ubereats'], category: 'Meals (Business)', displayName: 'Uber Eats' },
  { patterns: ['doordash'], category: 'Meals (Business)', displayName: 'DoorDash' },
  { patterns: ['grubhub'], category: 'Meals (Business)', displayName: 'Grubhub' },
  
  // Gas / Fuel
  { patterns: ['shell'], category: 'Travel', displayName: 'Shell' },
  { patterns: ['chevron'], category: 'Travel', displayName: 'Chevron' },
  { patterns: ['exxon', 'mobil'], category: 'Travel', displayName: 'Exxon' },
  { patterns: ['bp'], category: 'Travel', displayName: 'BP' },
  { patterns: ['76', 'seventy six'], category: 'Travel', displayName: '76' },
  { patterns: ['arco'], category: 'Travel', displayName: 'ARCO' },
  { patterns: ['costco gas', 'costco fuel'], category: 'Travel', displayName: 'Costco Gas' },
  { patterns: ['sams club gas'], category: 'Travel', displayName: "Sam's Club Gas" },
  
  // Office Supplies
  { patterns: ['staples'], category: 'Office Supplies', displayName: 'Staples' },
  { patterns: ['office depot', 'officemax'], category: 'Office Supplies', displayName: 'Office Depot' },
  { patterns: ['best buy'], category: 'Equipment', displayName: 'Best Buy' },
  { patterns: ['apple store', 'apple.com'], category: 'Equipment', displayName: 'Apple' },
  { patterns: ['amazon', 'amzn'], category: 'Office Supplies', displayName: 'Amazon' },
  
  // Software / SaaS
  { patterns: ['adobe', 'creative cloud'], category: 'Software / SaaS', displayName: 'Adobe' },
  { patterns: ['microsoft', 'msft', 'office 365', 'm365'], category: 'Software / SaaS', displayName: 'Microsoft' },
  { patterns: ['google', 'goog'], category: 'Software / SaaS', displayName: 'Google' },
  { patterns: ['dropbox'], category: 'Software / SaaS', displayName: 'Dropbox' },
  { patterns: ['slack'], category: 'Software / SaaS', displayName: 'Slack' },
  { patterns: ['zoom'], category: 'Software / SaaS', displayName: 'Zoom' },
  { patterns: ['notion'], category: 'Software / SaaS', displayName: 'Notion' },
  { patterns: ['figma'], category: 'Software / SaaS', displayName: 'Figma' },
  { patterns: ['canva'], category: 'Software / SaaS', displayName: 'Canva' },
  { patterns: ['mailchimp'], category: 'Software / SaaS', displayName: 'Mailchimp' },
  { patterns: ['quickbooks', 'intuit'], category: 'Software / SaaS', displayName: 'QuickBooks' },
  
  // Phone / Internet
  { patterns: ['verizon', 'vzw'], category: 'Phone / Internet', displayName: 'Verizon' },
  { patterns: ['at&t', 'att'], category: 'Phone / Internet', displayName: 'AT&T' },
  { patterns: ['t-mobile', 'tmobile'], category: 'Phone / Internet', displayName: 'T-Mobile' },
  { patterns: ['comcast', 'xfinity'], category: 'Phone / Internet', displayName: 'Comcast' },
  { patterns: ['spectrum'], category: 'Phone / Internet', displayName: 'Spectrum' },
  
  // Travel
  { patterns: ['uber', 'uber trip'], category: 'Travel', displayName: 'Uber' },
  { patterns: ['lyft'], category: 'Travel', displayName: 'Lyft' },
  { patterns: ['delta', 'delta air'], category: 'Travel', displayName: 'Delta Airlines' },
  { patterns: ['united', 'united air'], category: 'Travel', displayName: 'United Airlines' },
  { patterns: ['american air', 'aa.com'], category: 'Travel', displayName: 'American Airlines' },
  { patterns: ['southwest', 'swa'], category: 'Travel', displayName: 'Southwest' },
  { patterns: ['hilton'], category: 'Travel', displayName: 'Hilton' },
  { patterns: ['marriott'], category: 'Travel', displayName: 'Marriott' },
  { patterns: ['airbnb'], category: 'Travel', displayName: 'Airbnb' },
  { patterns: ['hertz'], category: 'Travel', displayName: 'Hertz' },
  { patterns: ['enterprise'], category: 'Travel', displayName: 'Enterprise' },
  
  // Retail / General
  { patterns: ['walmart', 'wal-mart'], category: 'Office Supplies', displayName: 'Walmart' },
  { patterns: ['target'], category: 'Office Supplies', displayName: 'Target' },
  { patterns: ['costco'], category: 'Office Supplies', displayName: 'Costco' },
  { patterns: ['sams club', "sam's"], category: 'Office Supplies', displayName: "Sam's Club" },
  { patterns: ['home depot'], category: 'Equipment', displayName: 'Home Depot' },
  { patterns: ['lowes', "lowe's"], category: 'Equipment', displayName: "Lowe's" },
  
  // Shipping
  { patterns: ['usps', 'postal service'], category: 'Shipping / Delivery', displayName: 'USPS' },
  { patterns: ['fedex'], category: 'Shipping / Delivery', displayName: 'FedEx' },
  { patterns: ['ups'], category: 'Shipping / Delivery', displayName: 'UPS' },
  { patterns: ['dhl'], category: 'Shipping / Delivery', displayName: 'DHL' },
  
  // Banking
  { patterns: ['chase', 'jpmorgan'], category: 'Bank Fees', displayName: 'Chase' },
  { patterns: ['bank of america', 'bofa'], category: 'Bank Fees', displayName: 'Bank of America' },
  { patterns: ['wells fargo'], category: 'Bank Fees', displayName: 'Wells Fargo' },
  { patterns: ['citi', 'citibank'], category: 'Bank Fees', displayName: 'Citibank' },
  { patterns: ['paypal'], category: 'Bank Fees', displayName: 'PayPal' },
  { patterns: ['stripe'], category: 'Bank Fees', displayName: 'Stripe' },
  { patterns: ['square'], category: 'Bank Fees', displayName: 'Square' },
  
  // Advertising / Marketing
  { patterns: ['facebook ads', 'meta ads'], category: 'Advertising / Marketing', displayName: 'Meta Ads' },
  { patterns: ['google ads', 'adwords'], category: 'Advertising / Marketing', displayName: 'Google Ads' },
  { patterns: ['linkedin ads'], category: 'Advertising / Marketing', displayName: 'LinkedIn Ads' },
  { patterns: ['yelp ads'], category: 'Advertising / Marketing', displayName: 'Yelp Ads' },
];

// Keyword-based category detection (fallback when merchant isn't recognized)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Meals (Business)': ['restaurant', 'cafe', 'coffee', 'food', 'diner', 'grill', 'bistro', 'kitchen', 'eatery', 'bar & grill', 'pizzeria', 'bakery', 'deli', 'catering'],
  'Travel': ['gas', 'fuel', 'petroleum', 'airline', 'hotel', 'motel', 'rental car', 'parking', 'toll', 'transit', 'taxi', 'rideshare', 'airport'],
  'Office Supplies': ['office', 'supplies', 'paper', 'ink', 'toner', 'stationery'],
  'Equipment': ['computer', 'laptop', 'monitor', 'printer', 'electronics', 'hardware', 'device'],
  'Software / SaaS': ['software', 'subscription', 'cloud', 'app', 'license', 'saas', 'monthly plan'],
  'Phone / Internet': ['wireless', 'cellular', 'internet', 'broadband', 'wifi', 'telecom', 'mobile'],
  'Shipping / Delivery': ['shipping', 'postage', 'courier', 'freight', 'delivery', 'mailing'],
  'Advertising / Marketing': ['advertising', 'marketing', 'promotion', 'ads', 'campaign', 'sponsor'],
  'Professional Services': ['legal', 'attorney', 'lawyer', 'accounting', 'cpa', 'consulting', 'professional'],
  'Insurance': ['insurance', 'coverage', 'policy', 'premium'],
  'Utilities': ['electric', 'water', 'sewer', 'utility', 'power', 'energy'],
  'Rent / Workspace': ['rent', 'lease', 'coworking', 'office space', 'workspace'],
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
    
    // Keep only top 500 merchants (sorted by usage)
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
// TEXT EXTRACTION PATTERNS
// ============================================

// Date patterns (US formats primarily)
const DATE_PATTERNS = [
  // MM/DD/YYYY or MM-DD-YYYY
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g,
  // MM/DD/YY or MM-DD-YY
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})(?!\d)/g,
  // Month DD, YYYY (e.g., "Jan 15, 2025")
  /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/gi,
  // DD Month YYYY (e.g., "15 January 2025")
  /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/gi,
];

// Amount patterns
const AMOUNT_PATTERNS = [
  // $XX.XX or $ XX.XX
  /\$\s?(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)/g,
  // XX.XX without currency (when near keywords)
  /(?:total|amount|due|subtotal|tax|tip)[:\s]*(\d{1,6}(?:,\d{3})*\.\d{2})/gi,
  // Numbers with decimal that look like money
  /(\d{1,6}(?:,\d{3})*\.\d{2})(?:\s|$)/g,
];

// Total keywords (ordered by priority)
const TOTAL_KEYWORDS = [
  'grand total',
  'total due',
  'amount due',
  'balance due',
  'total',
  'please pay',
  'amount',
];

// Subtotal keywords
const SUBTOTAL_KEYWORDS = [
  'subtotal',
  'sub-total',
  'sub total',
  'merchandise',
  'items',
];

// Tax keywords
const TAX_KEYWORDS = [
  'tax',
  'sales tax',
  'vat',
  'gst',
  'hst',
  'pst',
];

// ============================================
// CORE OCR FUNCTIONS
// ============================================

let tesseractWorker: Tesseract.Worker | null = null;
let workerInitializing = false;
let workerInitPromise: Promise<Tesseract.Worker> | null = null;

/**
 * Initialize or get the Tesseract worker
 * Workers are reused for performance
 */
async function getWorker(): Promise<Tesseract.Worker> {
  if (tesseractWorker) {
    return tesseractWorker;
  }
  
  if (workerInitializing && workerInitPromise) {
    return workerInitPromise;
  }
  
  workerInitializing = true;
  
  workerInitPromise = (async () => {
    const worker = await Tesseract.createWorker('eng', 1, {
      // These options help with receipt-style text
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // Could emit progress here
        }
      },
    });
    
    // Optimize for receipt scanning
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$.,/-:@ ',
      preserve_interword_spaces: '1',
    });
    
    tesseractWorker = worker;
    workerInitializing = false;
    return worker;
  })();
  
  return workerInitPromise;
}

/**
 * Terminate the worker (call when done with batch processing)
 */
export async function terminateOCRWorker(): Promise<void> {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}

/**
 * Main OCR function - processes receipt image and extracts structured data
 */
export async function processReceiptImage(
  imageData: string | File | Blob,
  onProgress?: (percent: number, status: string) => void
): Promise<ExtractedReceiptData> {
  const startTime = performance.now();
  
  onProgress?.(5, 'Initializing OCR engine...');
  
  const worker = await getWorker();
  
  onProgress?.(15, 'Analyzing image...');
  
  // Run OCR
  const result = await worker.recognize(imageData);
  const rawText = result.data.text;
  const confidence = result.data.confidence;
  
  onProgress?.(60, 'Extracting data...');
  
  // Extract all the fields
  const allAmounts = extractAllAmounts(rawText);
  const allDates = extractAllDates(rawText);
  const { total, subtotal, tax } = extractAmounts(rawText, allAmounts);
  const date = extractBestDate(allDates);
  const merchantName = extractMerchantName(rawText);
  
  onProgress?.(80, 'Categorizing...');
  
  // Get category suggestion
  const { category, confidence: catConfidence } = suggestCategory(rawText, merchantName);
  
  onProgress?.(100, 'Complete!');
  
  const processingTimeMs = performance.now() - startTime;
  
  return {
    merchantName,
    total,
    subtotal,
    tax,
    date,
    suggestedCategory: category,
    categoryConfidence: catConfidence,
    rawText,
    allAmounts,
    allDates,
    confidence,
    processingTimeMs,
  };
}

// ============================================
// EXTRACTION HELPERS
// ============================================

function extractAllAmounts(text: string): number[] {
  const amounts: number[] = [];
  
  for (const pattern of AMOUNT_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const numStr = match[1] || match[0];
      const cleaned = numStr.replace(/[$,\s]/g, '');
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num > 0 && num < 100000) {
        amounts.push(num);
      }
    }
  }
  
  // Remove duplicates and sort descending
  return [...new Set(amounts)].sort((a, b) => b - a);
}

function extractAllDates(text: string): string[] {
  const dates: string[] = [];
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      try {
        let year: number, month: number, day: number;
        
        // Check which pattern matched
        if (match[0].match(/^\d/)) {
          // Numeric format
          if (match[3]?.length === 4) {
            // MM/DD/YYYY
            month = parseInt(match[1]);
            day = parseInt(match[2]);
            year = parseInt(match[3]);
          } else if (match[3]?.length === 2) {
            // MM/DD/YY
            month = parseInt(match[1]);
            day = parseInt(match[2]);
            year = 2000 + parseInt(match[3]);
          } else {
            continue;
          }
        } else {
          // Text month format
          const monthStr = match[1]?.toLowerCase().slice(0, 3) || match[2]?.toLowerCase().slice(0, 3);
          month = monthMap[monthStr];
          
          if (match[1]?.match(/[a-z]/i)) {
            // "Jan 15, 2025"
            day = parseInt(match[2]);
            year = parseInt(match[3]);
          } else {
            // "15 January 2025"
            day = parseInt(match[1]);
            year = parseInt(match[3]);
          }
        }
        
        // Validate
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2030) {
          const isoDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          dates.push(isoDate);
        }
      } catch {
        // Skip invalid dates
      }
    }
  }
  
  return [...new Set(dates)];
}

function extractBestDate(dates: string[]): string | null {
  if (dates.length === 0) return null;
  if (dates.length === 1) return dates[0];
  
  // Prefer most recent date that's not in the future
  const today = new Date().toISOString().split('T')[0];
  const validDates = dates.filter(d => d <= today);
  
  if (validDates.length === 0) return dates[0];
  
  // Sort by date descending, return most recent
  return validDates.sort().reverse()[0];
}

function extractAmounts(text: string, allAmounts: number[]): { total: number | null; subtotal: number | null; tax: number | null } {
  if (allAmounts.length === 0) {
    return { total: null, subtotal: null, tax: null };
  }
  
  const textLower = text.toLowerCase();
  const lines = textLower.split('\n');
  
  let total: number | null = null;
  let subtotal: number | null = null;
  let tax: number | null = null;
  
  // Find amounts near keywords
  for (const line of lines) {
    for (const keyword of TOTAL_KEYWORDS) {
      if (line.includes(keyword)) {
        const amountMatch = line.match(/(\d{1,6}(?:,\d{3})*\.\d{2})/);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1].replace(',', ''));
          if (!isNaN(amount) && amount > 0) {
            total = amount;
            break;
          }
        }
      }
    }
    if (total !== null) break;
  }
  
  for (const line of lines) {
    for (const keyword of SUBTOTAL_KEYWORDS) {
      if (line.includes(keyword)) {
        const amountMatch = line.match(/(\d{1,6}(?:,\d{3})*\.\d{2})/);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1].replace(',', ''));
          if (!isNaN(amount) && amount > 0) {
            subtotal = amount;
            break;
          }
        }
      }
    }
    if (subtotal !== null) break;
  }
  
  for (const line of lines) {
    for (const keyword of TAX_KEYWORDS) {
      if (line.includes(keyword) && !line.includes('pre-tax') && !line.includes('pre tax')) {
        const amountMatch = line.match(/(\d{1,6}(?:,\d{3})*\.\d{2})/);
        if (amountMatch) {
          const amount = parseFloat(amountMatch[1].replace(',', ''));
          if (!isNaN(amount) && amount > 0 && amount < (total || allAmounts[0] || 1000)) {
            tax = amount;
            break;
          }
        }
      }
    }
    if (tax !== null) break;
  }
  
  // Fallback: if no total found, use the largest amount
  if (total === null && allAmounts.length > 0) {
    total = allAmounts[0];
  }
  
  return { total, subtotal, tax };
}

function extractMerchantName(text: string): string | null {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  if (lines.length === 0) return null;
  
  // Strategy 1: First non-numeric line that's reasonably short (likely header/name)
  for (const line of lines.slice(0, 5)) {
    // Skip lines that are mostly numbers or very short
    const cleanLine = line.replace(/[^a-zA-Z\s]/g, '').trim();
    if (cleanLine.length >= 3 && cleanLine.length < 50) {
      // Skip common non-merchant text
      const skipPatterns = ['receipt', 'date', 'time', 'order', 'item', 'qty', 'price', 'total', 'tax', 'cash', 'card', 'change', 'thank'];
      const lineLower = cleanLine.toLowerCase();
      if (!skipPatterns.some(p => lineLower.startsWith(p))) {
        return cleanLine;
      }
    }
  }
  
  return null;
}

function suggestCategory(text: string, merchantName: string | null): { category: string | null; confidence: 'high' | 'medium' | 'low' } {
  const textLower = text.toLowerCase();
  const merchantLower = (merchantName || '').toLowerCase();
  
  // Check learned merchants first (highest priority)
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
  
  // Default suggestion based on amount range (very rough heuristic)
  return { category: null, confidence: 'low' };
}

// ============================================
// USER FEEDBACK LEARNING
// ============================================

/**
 * Called when user confirms/corrects a receipt entry
 * This allows the system to learn from corrections
 */
export function learnFromUserCorrection(
  originalMerchant: string | null,
  correctedName: string,
  selectedCategory: string
): void {
  // Save the merchant-category mapping for future use
  if (correctedName && correctedName.length >= 2) {
    saveLearnedMerchant(correctedName, selectedCategory);
  }
  
  // If there was an OCR-detected merchant name, also save that mapping
  if (originalMerchant && originalMerchant !== correctedName && originalMerchant.length >= 2) {
    saveLearnedMerchant(originalMerchant, selectedCategory);
  }
}

// ============================================
// IMAGE PREPROCESSING (for better OCR results)
// ============================================

/**
 * Preprocess image for better OCR results
 * Returns a data URL of the processed image
 */
export async function preprocessReceiptImage(imageData: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageData); // Return original if canvas not supported
        return;
      }
      
      // Scale down very large images
      const MAX_DIM = 2000;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw original
      ctx.drawImage(img, 0, 0, width, height);
      
      // Get image data for processing
      const imageData2 = ctx.getImageData(0, 0, width, height);
      const data = imageData2.data;
      
      // Convert to grayscale and increase contrast
      for (let i = 0; i < data.length; i += 4) {
        // Grayscale conversion
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        
        // Simple contrast enhancement
        const contrast = 1.3;
        const enhanced = ((gray - 128) * contrast) + 128;
        
        // Clamp to 0-255
        const final = Math.max(0, Math.min(255, enhanced));
        
        data[i] = final;
        data[i + 1] = final;
        data[i + 2] = final;
      }
      
      ctx.putImageData(imageData2, 0, 0);
      
      // Return as data URL
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => resolve(imageData); // Return original on error
    img.src = imageData;
  });
}

// ============================================
// EXPORTS
// ============================================

export {
  BUILT_IN_MERCHANTS,
  CATEGORY_KEYWORDS,
};
