

export type TransactionType = 'income' | 'expense';

export interface ReceiptOCRData {
  merchantName: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  extractedDate: string | null;
  suggestedCategory: string | null;
  confidence: number;
  rawText: string;
  processedAt: string; // ISO date when OCR was performed
}

export interface Transaction {
  id: string;
  date: string;
  name: string;
  category: string;
  amount: number;
  notes?: string;
  type: TransactionType;
  // Receipt attachment
  receiptImage?: string; // Base64 data URL
  // OCR extracted data (if receipt was scanned)
  receiptOCR?: ReceiptOCRData;
}

export type InvoiceStatus = 'unpaid' | 'paid' | 'void';

export type RecurrenceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}

// --- Clients / Leads (Lightweight CRM) ---
export type ClientStatus = 'lead' | 'client' | 'inactive';

export interface Client {
  id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  status: ClientStatus;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export interface Invoice {
  id: string;
  number?: string;

  // Link to Client (preferred)
  clientId?: string;

  // Display fields (kept for backward compatibility + PDF rendering)
  client: string;
  clientCompany?: string;
  clientAddress?: string;
  clientEmail?: string;

  amount: number; // Total Amount Due (calculated)
  category: string;
  description: string; // Used as summary or fallback
  date: string;
  due: string;
  notes?: string;
  terms?: string; // Payment terms
  status: InvoiceStatus;
  payMethod?: string;
  linkedTransactionId?: string;
  recurrence?: {
    active: boolean;
    frequency: RecurrenceFrequency;
    nextDate: string;
  };

  // New Fields
  items?: InvoiceItem[];
  subtotal?: number;
  discount?: number; // Fixed amount
  taxRate?: number; // Percent
  shipping?: number; // Fixed amount
  poNumber?: string;
}

// Estimates (Quotes/Proposals)
export type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'void';

export type EstimateItem = InvoiceItem;

export interface Estimate {
  id: string;
  number?: string;

  // Link to Client (preferred)
  clientId?: string;

  // Client display fields
  client: string;
  clientCompany?: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;

  // Proposal details
  projectTitle?: string;        // "Website Redesign" - main title for the proposal
  scopeOfWork?: string;         // Detailed description of what's included
  timeline?: string;            // "2-3 weeks", "Q1 2025", etc.
  exclusions?: string;          // What's NOT included in this estimate

  // Financial
  amount: number;               // Total (calculated)
  category: string;
  description: string;          // Brief description / summary
  
  // Dates
  date: string;                 // Created/issued date
  validUntil: string;           // Expiry date
  
  // Terms & Notes
  notes?: string;               // Additional notes to client
  terms?: string;               // Acceptance terms / conditions
  acceptanceTerms?: string;     // How to accept (e.g., "Sign and return", "Reply to confirm")
  
  status: EstimateStatus;

  // Follow-up tracking
  sentAt?: string;
  followUpDate?: string;
  followUpCount?: number;
  lastFollowUp?: string;

  // Line items
  items?: EstimateItem[];
  subtotal?: number;
  discount?: number;
  taxRate?: number;
  shipping?: number;
  poNumber?: string;            // Reference/PO number from client
}

export type FilingStatus = 'single' | 'joint' | 'head';

export type TaxEstimationMethod = 'preset' | 'lastYear' | 'custom';

export interface UserSettings {
  businessName: string;
  ownerName: string;
  // New Business Details
  businessAddress?: string;
  businessEmail?: string;
  businessPhone?: string;
  businessWebsite?: string;
  businessTaxId?: string;

  // Branding
  businessLogo?: string; // Base64 Data URL
  showLogoOnInvoice?: boolean;
  logoAlignment?: 'left' | 'center';
  brandColor?: string; // Hex code

  payPrefs: string[];
  taxRate: number; // Estimated Federal Income Tax Rate
  stateTaxRate: number; // Estimated State Tax Rate
  taxEstimationMethod: TaxEstimationMethod;
  filingStatus: FilingStatus;
  currencySymbol: string;

  // Invoice Defaults
  defaultInvoiceTerms?: string;
  defaultInvoiceNotes?: string;
}

export interface CustomCategories {
  income: string[];
  expense: string[];
  billing: string[];
}

export interface TaxPayment {
  id: string;
  date: string;
  amount: number;
  type: 'Estimated' | 'Annual' | 'Other';
  note?: string;
}

export interface Receipt {
  id: string;
  date: string;
  imageData: string; // Base64 Data URL (compressed)
  note?: string;
}

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export type FilterPeriod = 'all' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export enum Page {
  Dashboard = 'dashboard',
  /** Back-compat: some older UI elements refer to the Ledger page by name. */
  Ledger = 'ledger',
  AllTransactions = 'all_transactions',
  Income = 'income',
  Expenses = 'expenses',
  /** Back-compat: singular invoice page name used in older builds. */
  Invoice = 'invoice',
  Invoices = 'invoices',
  Clients = 'clients',
  Reports = 'reports',
  Settings = 'settings',
  InvoiceDoc = 'invoice_doc'
}
