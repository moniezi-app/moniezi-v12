import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import html2pdf from 'html2pdf.js';
import { 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Settings, 
  Plus, 
  X, 
  Trash2, 
  Download, 
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  BrainCircuit, 
  Sparkles, 
  Receipt, 
  Wallet, 
  BarChart3, 
  Sun, 
  Moon, 
  LayoutGrid, 
  CheckCircle, 
  AlertTriangle, 
  Calendar, 
  Clock3,
  User, 
  Info, 
  History, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Briefcase, 
  ShoppingBag, 
  Share2, 
  Landmark, 
  RotateCcw, 
  Megaphone, 
  Monitor, 
  Building, 
  Zap, 
  Package, 
  Smartphone, 
  Plane, 
  Utensils, 
  Shield, 
  Users, 
  UserCheck, 
  Hammer, 
  Truck, 
  CreditCard, 
  Code, 
  PenTool, 
  Wrench, 
  Key, 
  Flag, 
  GraduationCap, 
  AlertCircle, 
  Repeat, 
  Calculator, 
  BookOpen,
  Ban,
  HelpCircle,
  Percent,
  PlusCircle,
  MinusCircle,
  Search,
  Tag,
  Upload,
  Image as ImageIcon,
  Palette,
  AlignLeft,
  AlignCenter,
  Edit3,
  Loader2,
  Camera,
  Eye,
  ToggleLeft,
  ToggleRight,
  Copy,
  ClipboardList,
  ScanLine,
  FileCheck,
  Wand2
} from 'lucide-react';
import { Page, Transaction, Invoice, Estimate, Client, ClientStatus, UserSettings, Notification, FilterPeriod, RecurrenceFrequency, FilingStatus, TaxPayment, TaxEstimationMethod, InvoiceItem, EstimateItem, CustomCategories, Receipt as ReceiptType, ReceiptOCRData } from './types';
import { CATS_IN, CATS_OUT, CATS_BILLING, DEFAULT_PAY_PREFS, DB_KEY, TAX_CONSTANTS, TAX_PLANNER_2026, getFreshDemoData } from './constants';
import InsightsDashboard from './InsightsDashboard';
import { getInsightCount } from './services/insightsEngine';
import { processReceiptImage, learnFromUserCorrection, preprocessReceiptImage, ExtractedReceiptData } from './services/offlineOCR';
// --- Utility: UUID Generator ---
const generateId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

// --- Utility: Invoice/Estimate Number Generator ---
const generateDocNumber = (prefix: 'INV' | 'EST', existingDocs: { number?: string }[]): string => {
  const now = new Date();
  const yearMonth = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  
  // Find highest existing number for this prefix and year-month
  let maxSeq = 0;
  const pattern = new RegExp(`^${prefix}-${yearMonth}-(\\d+)$`);
  
  existingDocs.forEach(doc => {
    if (doc.number) {
      const match = doc.number.match(pattern);
      if (match) {
        const seq = parseInt(match[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
  });
  
  const nextSeq = (maxSeq + 1).toString().padStart(4, '0');
  return `${prefix}-${yearMonth}-${nextSeq}`;
};


// --- Clients Helpers ---
const normalize = (s: string) => (s || '').trim().toLowerCase();

// --- Utility: Image Compressor ---
const compressReceiptImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // Limit width to 800px
        const scaleSize = MAX_WIDTH / img.width;
        // Only scale down if image is larger than max width
        const width = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
        const height = img.width > MAX_WIDTH ? img.height * scaleSize : img.height;
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Compress to JPEG with 0.6 quality
        resolve(canvas.toDataURL('image/jpeg', 0.6)); 
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// --- Utility: Download Receipt ---
const downloadReceiptToDevice = (dataUrl: string) => {
    try {
        const link = document.createElement('a');
        link.href = dataUrl;
        const now = new Date();
        // Format: Receipt_YYYY-MM-DD_HHMMSS
        const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14); 
        const dateStr = now.toISOString().split('T')[0];
        
        // Attempt to place in BizReceipts folder (Browser support varies, might fallback to filename prefix)
        link.download = `Receipt_${dateStr}_${timestamp}.jpg`; 
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
    } catch (e) {
        console.error("Download failed", e);
        return false;
    }
};

// --- Utility: Date Helpers ---
const getStartOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  return new Date(d.setDate(diff));
};

const getEndOfWeek = (date: Date) => {
  const d = getStartOfWeek(date);
  d.setDate(d.getDate() + 6);
  return d;
};

const formatDateRange = (start: Date, end: Date) => {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} - ${end.toLocaleDateString('en-US', opts)}`;
};

const getDaysOverdue = (dueDate: string) => {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const today = new Date();
  due.setHours(0,0,0,0);
  today.setHours(0,0,0,0);
  
  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays;
};

const calculateNextDate = (currentDate: string, freq: RecurrenceFrequency): string => {
  const d = new Date(currentDate);
  if (freq === 'weekly') d.setDate(d.getDate() + 7);
  if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
  if (freq === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
};

const getNextEstimatedTaxDeadline = () => {
  const now = new Date();
  const year = now.getFullYear();
  const deadlines = [
    new Date(year, 3, 15), 
    new Date(year, 5, 15), 
    new Date(year, 8, 15), 
    new Date(year + 1, 0, 15)
  ];
  
  const next = deadlines.find(d => {
    d.setHours(23, 59, 59, 999); 
    return d >= now;
  }) || deadlines[0];

  const diffTime = next.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return { 
    date: next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 
    days: diffDays 
  };
};

// --- Helper: Category Icons ---
const getCategoryIcon = (category: string) => {
  switch (category) {
    case "Sales / Services": return <Briefcase size={16} />;
    case "Consulting / Freelance": return <User size={16} />;
    case "Product Sales": return <ShoppingBag size={16} />;
    case "Affiliate / Referral": return <Share2 size={16} />;
    case "Interest / Bank": return <Landmark size={16} />;
    case "Refunds": return <RotateCcw size={16} />;
    case "Advertising / Marketing": return <Megaphone size={16} />;
    case "Software / SaaS": return <Monitor size={16} />;
    case "Rent / Workspace": return <Building size={16} />;
    case "Utilities": return <Zap size={16} />;
    case "Office Supplies": return <Package size={16} />;
    case "Phone / Internet": return <Smartphone size={16} />;
    case "Travel": return <Plane size={16} />;
    case "Meals (Business)": return <Utensils size={16} />;
    case "Professional Services": return <Briefcase size={16} />;
    case "Insurance": return <Shield size={16} />;
    case "Contractors": return <Users size={16} />;
    case "Payroll": return <UserCheck size={16} />;
    case "Taxes & Licenses": return <FileText size={16} />;
    case "Equipment": return <Hammer size={16} />;
    case "Shipping / Delivery": return <Truck size={16} />;
    case "Bank Fees": return <CreditCard size={16} />;
    case "Web Development": return <Code size={16} />;
    case "Graphic Design": return <PenTool size={16} />;
    case "Strategy Consulting": return <Briefcase size={16} />;
    case "Content Writing": return <FileText size={16} />;
    case "Digital Marketing": return <Megaphone size={16} />;
    case "Maintenance Retainer": return <Wrench size={16} />;
    case "Software Licensing": return <Key size={16} />;
    case "Project Milestone": return <Flag size={16} />;
    case "Training / Workshop": return <GraduationCap size={16} />;
    default: return <Tag size={16} />;
  }
};

// --- Components ---

const Logo: React.FC<{ size?: 'sm' | 'lg', onClick?: () => void, forceDarkText?: boolean }> = ({ size = 'sm', onClick, forceDarkText = false }) => {
  const isLarge = size === 'lg';
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-2 sm:gap-3 cursor-pointer group select-none transition-transform active:scale-95 flex-shrink-0`}
    >
      <div 
        className={`${isLarge ? 'w-12 h-12 rounded-2xl' : 'w-9 h-9 sm:w-10 sm:h-10 rounded-xl'} bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all duration-500 flex-shrink-0`}
      >
        <div className="relative w-full h-full flex items-center justify-center">
            <div className="w-1/2 h-1/2 border-l-[3px] border-r-[3px] border-t-[3px] border-white opacity-90 rounded-t-sm" />
            <div className="absolute w-1.5 h-1.5 bg-white rounded-full bottom-2.5 left-1/2 -translate-x-1/2 shadow-sm" />
        </div>
      </div>
      <div className="flex flex-col leading-none min-w-0">
        <div className={`font-brand uppercase tracking-[0.18em] sm:tracking-[0.22em] ${isLarge ? 'text-2xl' : 'text-base sm:text-lg'} ${forceDarkText ? 'text-slate-950' : 'text-slate-950 dark:text-white'}`} style={{ whiteSpace: 'nowrap' }}>
          <span className="font-bold">Moni</span>
          <span className={`font-bold ${forceDarkText ? 'text-blue-700' : 'bg-gradient-to-r bg-clip-text text-transparent from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400'}`}>ezi</span>
        </div>
        <div className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.18em] sm:tracking-[0.22em] text-slate-600 dark:text-slate-300 mt-0.5 sm:mt-1 pl-0.5`} style={{ whiteSpace: 'nowrap' }}>
          Pro Finance
        </div>
       
            </div>
    </div>
  );
};

const ToastContainer: React.FC<{ notifications: Notification[]; remove: (id: string) => void }> = ({ notifications, remove }) => {
  return (
    <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {notifications.map(n => (
        <div 
          key={n.id} 
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border animate-in slide-in-from-right-10 fade-in duration-300 max-w-sm ${
            n.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 
            n.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}
          onClick={() => remove(n.id)}
        >
           {n.type === 'success' ? <CheckCircle size={18} /> : n.type === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
           <span className="text-sm font-bold">{n.message}</span>
        </div>
      ))}
    </div>
  );
};

const EmptyState: React.FC<{ icon: React.ReactNode, title: string, subtitle: string, action?: () => void, actionLabel?: string }> = ({ icon, title, subtitle, action, actionLabel }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50">
    <div className="mb-4 text-slate-600 dark:text-slate-300 p-4 bg-white dark:bg-slate-950 rounded-full shadow-sm">
      {icon}
    </div>
    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 font-brand">{title}</h3>
    <p className="text-slate-600 dark:text-slate-300 text-sm max-w-[250px] mx-auto mb-6">{subtitle}</p>
    {action && (
      <button onClick={action} className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2.5 rounded-lg text-sm font-bold shadow-lg hover:opacity-90 transition-all">
        {actionLabel}
      </button>
    )}
  </div>
);

const StatCard: React.FC<{ 
  label: string; 
  value: string; 
  colorClass?: string; 
  subText?: string; 
  subTextClass?: string;
  onClick?: () => void; 
  icon?: React.ReactNode 
}> = ({ 
  label, value, colorClass = "text-slate-950 dark:text-white", subText, subTextClass, onClick, icon 
}) => (
  <div 
    onClick={onClick}
    className={`bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-md transition-all duration-300 group overflow-hidden ${onClick ? 'cursor-pointer active:scale-95 hover:border-blue-500/50 hover:shadow-lg' : ''}`}
  >
    <div className="flex justify-between items-start mb-4">
        <div className="bg-slate-100 dark:bg-slate-950 p-3 rounded-lg text-slate-600 dark:text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-all">
            {icon}
        </div>
        {onClick && <ArrowRight size={16} className="text-slate-400 dark:text-slate-300 -rotate-45 group-hover:rotate-0 group-hover:text-blue-500 transition-all duration-300" />}
    </div>
    <div className={`text-2xl font-bold tracking-tight mb-1 break-words ${colorClass}`}>{value}</div>
    <div className="flex justify-between items-end min-w-0">
        <label className="text-base font-semibold text-slate-600 dark:text-slate-300 truncate">{label}</label>
    </div>
    {subText && <div className={`text-xs mt-2 font-bold inline-block px-3 py-1 rounded-md ${subTextClass || 'bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300'}`}>{subText}</div>}
  </div>
);

const DateInput = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => (
  <div className="group">
    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2 block pl-1 group-focus-within:text-blue-600 dark:group-focus-within:text-white transition-colors">
      {label}
    </label>
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 pointer-events-none">
        <Calendar size={18} />
      </div>
      <input 
        type="date" 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-0 rounded-lg pl-12 pr-5 py-4 font-medium text-lg text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 transition-all shadow-inner focus:ring-2 focus:ring-blue-500/20" 
      />
    </div>
  </div>
);

const Drawer: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-md p-0 sm:p-4 transition-all">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-xl sm:rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between p-8 pb-4">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 bg-slate-100 dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full text-slate-600 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white transition-colors">
            <X size={28} strokeWidth={1.5} />
          </button>
        </div>
        <div className="px-8 pb-8 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Period Selector Component ---
const PeriodSelector: React.FC<{ 
  period: FilterPeriod, 
  setPeriod: (p: FilterPeriod) => void,
  refDate: Date,
  setRefDate: (d: Date) => void 
}> = ({ period, setPeriod, refDate, setRefDate }) => {

  const navigateDate = (dir: number) => {
    const newDate = new Date(refDate);
    if (period === 'daily') newDate.setDate(newDate.getDate() + dir);
    else if (period === 'weekly') newDate.setDate(newDate.getDate() + (dir * 7));
    else if (period === 'monthly') newDate.setMonth(newDate.getMonth() + dir);
    else if (period === 'yearly') newDate.setFullYear(newDate.getFullYear() + dir);
    setRefDate(newDate);
  };

  const getLabel = () => {
    if (period === 'all') return 'All Time';
    if (period === 'daily') {
       return refDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    if (period === 'weekly') {
       const start = getStartOfWeek(refDate);
       const end = getEndOfWeek(refDate);
       return formatDateRange(start, end);
    }
    if (period === 'monthly') {
       return refDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (period === 'yearly') {
       return refDate.getFullYear().toString();
    }
    return '';
  };

  return (
    <div className="mb-6 space-y-4">
       <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto custom-scrollbar">
          {(['all', 'daily', 'weekly', 'monthly', 'yearly'] as FilterPeriod[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 min-w-[60px] py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                period === p 
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-white shadow-sm' 
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {p === 'daily' ? 'Day' : p === 'weekly' ? 'Week' : p === 'monthly' ? 'Month' : p === 'yearly' ? 'Year' : 'All'}
            </button>
          ))}
       </div>

       {period !== 'all' && (
         <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
            <button onClick={() => navigateDate(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-200 transition-colors">
               <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-2 font-brand font-bold text-slate-900 dark:text-white text-sm uppercase tracking-wide">
               <Calendar size={16} className="text-blue-500 mb-0.5" />
               {getLabel()}
            </div>
            <button onClick={() => navigateDate(1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-200 transition-colors">
               <ChevronRight size={20} />
            </button>
         </div>
       )}
    </div>
  );
};

// --- App Root ---

// --- Safety net: prevent “blank screen” by catching render errors in any page.
class PageErrorBoundary extends React.Component<
  { onReset?: () => void; children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: String(err?.message || err) };
  }
  componentDidCatch(err: any) {
    // eslint-disable-next-line no-console
    console.error('[Moniezi] Page render error:', err);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 shadow-sm">
          <div className="text-sm font-semibold">Something broke on this screen.</div>
          <div className="mt-2 text-xs opacity-80">{this.state.message}</div>
          <button
            onClick={() => {
              this.setState({ hasError: false, message: undefined });
              this.props.onReset?.();
            }}
            className="mt-3 w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white"
          >
            Go back to Home
          </button>
        </div>
      </div>
    );
  }
}

function normalizePage(p: any): Page {
  // Accept legacy strings from older builds (or stale SW cache)
  const v = String(p ?? '');
  const map: Record<string, Page> = {
    home: Page.Dashboard,
    dashboard: Page.Dashboard,
    invoices: Page.Invoices,
    invoice: Page.Invoices,
    ledger: Page.Ledger,
    transactions: Page.AllTransactions,
    all_transactions: Page.AllTransactions,
    reports: Page.Reports,
  };
  return map[v] ?? (Object.values(Page).includes(v as any) ? (v as Page) : Page.Dashboard);
}

export default function App() {
  const [dataLoaded, setDataLoaded] = useState(false);
  const [currentPage, _setCurrentPage] = useState<Page>(Page.Dashboard);
  const setCurrentPage = (p: any) => _setCurrentPage(normalizePage(p));
  const [invoiceQuickFilter, setInvoiceQuickFilter] = useState<'all' | 'unpaid' | 'overdue'>('all');
  const [estimateQuickFilter, setEstimateQuickFilter] = useState<'all' | 'draft' | 'sent' | 'accepted' | 'declined'>('all');

  const HOME_KPI_PERIOD_KEY = 'moniezi_home_kpi_period';
  type HomeKpiPeriod = 'ytd' | 'mtd' | '30d' | 'all';
  const [homeKpiPeriod, setHomeKpiPeriod] = useState<HomeKpiPeriod>(() => {
    try {
      const v = localStorage.getItem(HOME_KPI_PERIOD_KEY);
      if (v === 'ytd' || v === 'mtd' || v === '30d' || v === 'all') return v;
    } catch {
      // ignore
    }
    return 'ytd';
  });

  useEffect(() => {
    try {
      localStorage.setItem(HOME_KPI_PERIOD_KEY, homeKpiPeriod);
    } catch {
      // ignore
    }
  }, [homeKpiPeriod]);


  // The app scrolls inside an internal container (<main className="overflow-y-auto">),
  // not the browser window. Without resetting this container, switching pages via the
  // bottom nav keeps the previous scroll position.
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // Always reset scroll position when switching bottom tabs.
  // Some mobile browsers "remember" the scrollTop of the same scrolling container.
  // We enforce it (and re-enforce on the next tick) so each tab starts at the top.
  useLayoutEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;

    const toTop = () => {
      // Instant jump; keep it deterministic.
      el.scrollTop = 0;

      // Also reset the window scroll (some mobile browsers still use the page scroll).
      try {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      } catch {
        // ignore
      }

      // Also try the standards API on the container (some browsers behave better with scrollTo).
      // @ts-ignore
      if (typeof (el as any).scrollTo === "function") (el as any).scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    toTop();
    requestAnimationFrame(toTop);
    setTimeout(toTop, 0);
  }, [currentPage]);

  // Scroll-to-top button visibility - show after 65% scroll of page
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      const scrollableHeight = scrollHeight - clientHeight;
      
      // Calculate scroll percentage (0 to 1)
      const scrollPercent = scrollableHeight > 0 ? scrollTop / scrollableHeight : 0;
      
      // Show button after scrolling 65% of the page
      setShowScrollToTop(scrollPercent > 0.65);
    };
    
    // Add scroll listener to window
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initialize state
    handleScroll();
    
    // Cleanup
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [currentPage]); // Re-check when page changes as content length varies

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  // License / Activation State
  const LICENSE_STORAGE_KEY = 'moniezi_license';
  const [isLicenseValid, setIsLicenseValid] = useState<boolean | null>(null); // null = checking, false = invalid, true = valid
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseError, setLicenseError] = useState('');
  const [isValidatingLicense, setIsValidatingLicense] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<{ email?: string; purchaseDate?: string; } | null>(null);

  // Hidden dev mode toggle - Press Ctrl+Shift+D OR tap logo 5 times on mobile
  const [devTapCount, setDevTapCount] = useState(0);
  const devTapTimer = useRef<NodeJS.Timeout | null>(null);

  const handleDevTap = () => {
    setDevTapCount(prev => {
      const newCount = prev + 1;
      // Reset after 2 seconds of no taps
      if (devTapTimer.current) clearTimeout(devTapTimer.current);
      devTapTimer.current = setTimeout(() => setDevTapCount(0), 2000);
      
      if (newCount >= 5) {
        // Activate dev mode
        const devLicense = {
          key: 'HIDDEN-DEV-' + Date.now(),
          email: 'dev@moniezi.app',
          purchaseDate: new Date().toISOString(),
          validated: true,
          activatedAt: new Date().toISOString(),
        };
        localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(devLicense));
        setIsLicenseValid(true);
        setLicenseInfo({ email: 'dev@moniezi.app', purchaseDate: new Date().toISOString() });
        console.log('🔓 Dev mode activated!');
        return 0;
      }
      return newCount;
    });
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const devLicense = {
          key: 'HIDDEN-DEV-' + Date.now(),
          email: 'dev@moniezi.app',
          purchaseDate: new Date().toISOString(),
          validated: true,
          activatedAt: new Date().toISOString(),
        };
        localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(devLicense));
        setIsLicenseValid(true);
        setLicenseInfo({ email: 'dev@moniezi.app', purchaseDate: new Date().toISOString() });
        console.log('🔓 Dev mode activated!');
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<UserSettings>({
    businessName: "My Business",
    ownerName: "Owner",
    payPrefs: DEFAULT_PAY_PREFS,
    taxRate: 22,
    stateTaxRate: 0,
    taxEstimationMethod: 'custom',
    filingStatus: 'single',
    currencySymbol: '$',
    showLogoOnInvoice: true,
    logoAlignment: 'left',
    brandColor: '#2563eb'
  });
  const [customCategories, setCustomCategories] = useState<CustomCategories>({ income: [], expense: [], billing: [] });
  const [taxPayments, setTaxPayments] = useState<TaxPayment[]>([]);
  const [receipts, setReceipts] = useState<ReceiptType[]>([]);

  // Clients / Leads (Lightweight CRM)
  const [clientSearch, setClientSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<'all' | ClientStatus>('all');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Partial<Client>>({ status: 'lead' });

  // UI State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit_tx' | 'edit_inv' | 'tax_payments' | 'create_cat'>('add');
  const [activeTab, setActiveTab] = useState<'income' | 'expense' | 'billing'>('income');
  const [billingDocType, setBillingDocType] = useState<'invoice' | 'estimate'>('invoice');
  const [activeItem, setActiveItem] = useState<Partial<Transaction> & Partial<Invoice> & Partial<Estimate>>({});
  const [activeTaxPayment, setActiveTaxPayment] = useState<Partial<TaxPayment>>({ type: 'Estimated', date: new Date().toISOString().split('T')[0] });
  
  const [categorySearch, setCategorySearch] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const previousDrawerMode = useRef<'add' | 'edit_tx' | 'edit_inv' | 'tax_payments'>('add');

  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'income' | 'expense' | 'invoice'>('all');
  const [lastYearCalc, setLastYearCalc] = useState({ profit: '', tax: '' });
  const [selectedInvoiceForDoc, setSelectedInvoiceForDoc] = useState<Invoice | null>(null);
  const [selectedEstimateForDoc, setSelectedEstimateForDoc] = useState<Estimate | null>(null);
  const [isEstimatePdfPreviewOpen, setIsEstimatePdfPreviewOpen] = useState(false);
  const [isGeneratingEstimatePdf, setIsGeneratingEstimatePdf] = useState(false);
  const [showPLPreview, setShowPLPreview] = useState(false);
  const [plExportRequested, setPlExportRequested] = useState(false);
  const [isGeneratingPLPdf, setIsGeneratingPLPdf] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Pro P&L State
  const [plPeriodType, setPlPeriodType] = useState<'month' | 'quarter' | 'year' | 'ytd' | 'lastYear' | 'trailing12' | 'custom'>('ytd');
  const [plCustomStart, setPlCustomStart] = useState<string>(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [plCustomEnd, setPlCustomEnd] = useState<string>(new Date().toISOString().split('T')[0]);
  const [plShowComparison, setPlShowComparison] = useState(false);
  const [plAccountingBasis, setPlAccountingBasis] = useState<'cash' | 'accrual'>('cash');
  const [plShowPreparedBy, setPlShowPreparedBy] = useState(true);
  const [plShowAddress, setPlShowAddress] = useState(true);
  const [showProPLPreview, setShowProPLPreview] = useState(false);
  const [isGeneratingProPLPdf, setIsGeneratingProPLPdf] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [showInsights, setShowInsights] = useState(false);
  const [duplicationCount, setDuplicationCount] = useState<Record<string, number>>({});
  const [showTemplateSuggestion, setShowTemplateSuggestion] = useState(false);
  const [templateSuggestionData, setTemplateSuggestionData] = useState<{name: string, category: string, type: string} | null>(null);
  
  // Phase 3: Advanced Duplicate Features
  const [showBatchDuplicateModal, setShowBatchDuplicateModal] = useState(false);
  const [batchDuplicateData, setBatchDuplicateData] = useState<Transaction | Invoice | null>(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recurringData, setRecurringData] = useState<Transaction | Invoice | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<Array<{id: string, name: string, data: Partial<Transaction | Invoice>, type: string}>>([]);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [duplicationHistory, setDuplicationHistory] = useState<Record<string, {originalId: string, originalDate: string}>>({});
  
  // Settings Tab State
  const [settingsTab, setSettingsTab] = useState<'backup' | 'branding' | 'tax' | 'data' | 'license'>('backup');

  const insightsBadgeCount = useMemo(() => {
    return getInsightCount({ transactions, invoices, taxPayments, settings });
  }, [transactions, invoices, taxPayments, settings]);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  const [scrollToTaxSnapshot, setScrollToTaxSnapshot] = useState(false);
  const taxSnapshotRef = useRef<HTMLDivElement>(null);

  // Backup & Restore State
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [pendingBackupData, setPendingBackupData] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scan Receipt State
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<ReceiptType | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // OCR Scanning State
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const [ocrProgress, setOCRProgress] = useState<{ percent: number; status: string }>({ percent: 0, status: '' });
  const [ocrResult, setOCRResult] = useState<{
    merchantName: string | null;
    total: number | null;
    subtotal: number | null;
    tax: number | null;
    date: string | null;
    suggestedCategory: string | null;
    categoryConfidence: 'high' | 'medium' | 'low';
    rawText: string;
    confidence: number;
  } | null>(null);
  const [showOCRReviewModal, setShowOCRReviewModal] = useState(false);
  const [pendingOCRImage, setPendingOCRImage] = useState<string | null>(null);

  // Tax Planner State
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [plannerTab, setPlannerTab] = useState<'basic' | 'advanced'>('basic');
  const [advSection, setAdvSection] = useState<string | null>(null);
  const [plannerData, setPlannerData] = useState({
      income: 0,
      expenses: 0,
      filingStatus: 'single' as 'single' | 'joint' | 'head' | 'separate',
      taxRate: 15,
      useCustomRate: false,
      useSE: true,
      useStdDed: true,
      retirement: 0,
      credits: 0,
      // Advanced fields
      otherIncomeInterest: 0,
      otherIncomeDividends: 0,
      otherIncomeCapital: 0,
      otherIncomeOther: 0,
      deductionMode: 'standard' as 'standard' | 'itemized',
      itemizedDeduction: 0,
      adjustmentHSA: 0,
      adjustmentHealth: 0,
      // Section E: QBI
      applyQBI: false,
      qbiOverride: 0,
      // Section F: Payments
      paymentsYTD: 0,
      withholdingYTD: 0,
      lastYearTaxRef: 0
  });

  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('monthly');
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());

  const formatCurrency = useMemo(() => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: settings.currencySymbol === '€' ? 'EUR' : settings.currencySymbol === '£' ? 'GBP' : 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }, [settings.currencySymbol]);

  // Tax Planner Calculations (2026)
  const plannerResults = useMemo(() => {
      const income = Number(plannerData.income) || 0;
      const expenses = Number(plannerData.expenses) || 0;
      const profit = Math.max(0, income - expenses);
      const rate = Number(plannerData.taxRate) / 100;
      const credits = Number(plannerData.credits) || 0;
      
      const seTax = plannerData.useSE ? Math.max(0, profit) * TAX_PLANNER_2026.SE_TAX_RATE : 0;
      
      if (plannerTab === 'basic') {
          let stdDed = 0;
          if (plannerData.useStdDed) {
              if (plannerData.filingStatus === 'joint') stdDed = TAX_PLANNER_2026.STD_DEDUCTION_JOINT;
              else if (plannerData.filingStatus === 'head') stdDed = TAX_PLANNER_2026.STD_DEDUCTION_HEAD;
              else stdDed = TAX_PLANNER_2026.STD_DEDUCTION_SINGLE;
          }

          const retirement = Number(plannerData.retirement) || 0;
          const taxableIncome = Math.max(0, profit - stdDed - retirement);
          
          const incomeTax = taxableIncome * rate;
          const totalTax = Math.max(0, incomeTax + seTax - credits);
          
          return {
              profit,
              otherIncome: 0,
              adjustments: retirement,
              deduction: stdDed,
              qbiDeduction: 0,
              taxableIncome,
              incomeTax,
              seTax,
              totalTax,
              paidSoFar: 0,
              taxRemaining: totalTax,
              taxAhead: 0,
              monthly: totalTax / 12,
              quarterly: totalTax / 4,
              quarterlySuggestion: totalTax / 4
          };
      } else {
          // Advanced Logic
          const otherInc = (Number(plannerData.otherIncomeInterest)||0) + (Number(plannerData.otherIncomeDividends)||0) + (Number(plannerData.otherIncomeCapital)||0) + (Number(plannerData.otherIncomeOther)||0);
          const adjustments = (Number(plannerData.retirement)||0) + (Number(plannerData.adjustmentHSA)||0) + (Number(plannerData.adjustmentHealth)||0);
          
          let deduction = 0;
          if (plannerData.deductionMode === 'itemized') {
              deduction = Number(plannerData.itemizedDeduction) || 0;
          } else {
              if (plannerData.filingStatus === 'joint') deduction = TAX_PLANNER_2026.STD_DEDUCTION_JOINT;
              else if (plannerData.filingStatus === 'head') deduction = TAX_PLANNER_2026.STD_DEDUCTION_HEAD;
              else deduction = TAX_PLANNER_2026.STD_DEDUCTION_SINGLE;
          }

          // QBI Logic
          const userQbiBase = Number(plannerData.qbiOverride);
          const qbiBase = userQbiBase > 0 ? userQbiBase : Math.max(0, profit);
          const qbiDeduction = plannerData.applyQBI ? qbiBase * 0.2 : 0;

          const baseIncome = profit + otherInc;
          const taxableIncome = Math.max(0, baseIncome - adjustments - deduction - qbiDeduction);
          const incomeTax = taxableIncome * rate;
          const totalTax = Math.max(0, incomeTax + seTax - credits);

          // Payments Logic
          const paidSoFar = (Number(plannerData.paymentsYTD)||0) + (Number(plannerData.withholdingYTD)||0);
          const taxRemaining = Math.max(0, totalTax - paidSoFar);
          const taxAhead = Math.max(0, paidSoFar - totalTax);

          return {
              profit,
              otherIncome: otherInc,
              adjustments,
              deduction,
              qbiDeduction,
              taxableIncome,
              incomeTax,
              seTax,
              totalTax,
              paidSoFar,
              taxRemaining,
              taxAhead,
              monthly: totalTax / 12,
              quarterly: totalTax / 4,
              quarterlySuggestion: taxRemaining > 0 ? taxRemaining / 4 : 0
          };
      }
  }, [plannerData, plannerTab]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('moniezi_theme') as 'light' | 'dark' | null;
    if (savedTheme) {
        setTheme(savedTheme);
        document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
        document.documentElement.classList.add('dark');
    }
  }, []);

  // License validation on app load
  useEffect(() => {
    const checkStoredLicense = async () => {
      const stored = localStorage.getItem(LICENSE_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Verify the stored license is still valid
          const isValid = await validateLicenseWithServer(parsed.key);
          if (isValid) {
            setIsLicenseValid(true);
            setLicenseInfo({ email: parsed.email, purchaseDate: parsed.purchaseDate });
          } else {
            // License no longer valid, clear it
            localStorage.removeItem(LICENSE_STORAGE_KEY);
            setIsLicenseValid(false);
          }
        } catch {
          setIsLicenseValid(false);
        }
      } else {
        setIsLicenseValid(false);
      }
    };
    checkStoredLicense();
  }, []);

  // Validate license with Cloudflare Worker
  const validateLicenseWithServer = async (key: string): Promise<boolean> => {
    // If key starts with HIDDEN-DEV, it's a dev bypass - allow it
    if (key.startsWith('HIDDEN-DEV-')) {
      return true;
    }
    
    try {
      // Replace with your Cloudflare Worker URL
      const WORKER_URL = 'https://license.yourdomain.workers.dev/validate';
      
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: key }),
      });
      
      if (!response.ok) return false;
      
      const data = await response.json();
      return data.valid === true;
    } catch (error) {
      console.error('License validation error:', error);
      // If network error and we have a stored license, check if it's a dev key
      const stored = localStorage.getItem(LICENSE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Only allow offline use for dev keys
        if (parsed.key && parsed.key.startsWith('HIDDEN-DEV-')) {
          return true;
        }
      }
      return false;
    }
  };

  // Handle license activation
  const handleActivateLicense = async () => {
    if (!licenseKey.trim()) {
      setLicenseError('Please enter a license key');
      return;
    }

    setIsValidatingLicense(true);
    setLicenseError('');

    try {
      // Replace with your Cloudflare Worker URL
      const WORKER_URL = 'https://license.yourdomain.workers.dev/activate';
      
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseKey.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.valid) {
        // Store license info
        const licenseData = {
          key: licenseKey.trim(),
          email: data.email || '',
          purchaseDate: data.purchase_date || new Date().toISOString(),
          validated: true,
          activatedAt: new Date().toISOString(),
        };
        localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(licenseData));
        
        setLicenseInfo({ email: data.email, purchaseDate: data.purchase_date });
        setIsLicenseValid(true);
      } else {
        setLicenseError(data.message || 'Invalid license key. Please check and try again.');
      }
    } catch (error) {
      setLicenseError('Unable to validate license. Please check your internet connection and try again.');
    } finally {
      setIsValidatingLicense(false);
    }
  };

  // Deactivate license (for settings)
  const handleDeactivateLicense = () => {
    if (confirm('Are you sure you want to deactivate your license? You will need to re-enter your license key to use the app.')) {
      localStorage.removeItem(LICENSE_STORAGE_KEY);
      setIsLicenseValid(false);
      setLicenseKey('');
      setLicenseInfo(null);
    }
  };

  useEffect(() => {
    if (currentPage === Page.Reports && scrollToTaxSnapshot && taxSnapshotRef.current) {
        setTimeout(() => {
            taxSnapshotRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setScrollToTaxSnapshot(false);
        }, 100);
    }
  }, [currentPage, scrollToTaxSnapshot]);

  const toggleTheme = () => {
      const newTheme = theme === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
      localStorage.setItem('moniezi_theme', newTheme);
  };

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => setNotifications(prev => prev.filter(n => n.id !== id));


  const findMatchingClientId = useCallback((data: Partial<Invoice> & Partial<Estimate>) => {
    const email = normalize((data as any).clientEmail || '');
    const name = normalize((data as any).client || '');
    const company = normalize((data as any).clientCompany || '');

    if (data.clientId && clients.some(c => c.id === data.clientId)) return data.clientId;

    if (email) {
      const byEmail = clients.find(c => normalize(c.email || '') == email);
      if (byEmail) return byEmail.id;
    }
    if (name) {
      const byName = clients.find(c => normalize(c.name) === name && normalize(c.company || '') === company);
      if (byName) return byName.id;
      const byNameOnly = clients.find(c => normalize(c.name) == name);
      if (byNameOnly) return byNameOnly.id;
    }
    return undefined;
  }, [clients]);

  const upsertClientFromDoc = useCallback((data: Partial<Invoice> & Partial<Estimate>, statusHint: ClientStatus) => {
    const clientName = (data as any).client?.trim();
    if (!clientName) return undefined;

    const now = new Date().toISOString();
    const existingId = findMatchingClientId(data);

    if (existingId) {
      setClients(prev => prev.map(c => {
        if (c.id !== existingId) return c;
        return {
          ...c,
          name: clientName,
          company: (data as any).clientCompany || c.company,
          email: (data as any).clientEmail || c.email,
          address: (data as any).clientAddress || c.address,
          status: c.status === 'inactive' ? c.status : statusHint,
          updatedAt: now,
        };
      }));
      return existingId;
    }

    const newClient: Client = {
      id: generateId('cli'),
      name: clientName,
      company: (data as any).clientCompany || '',
      email: (data as any).clientEmail || '',
      phone: '',
      address: (data as any).clientAddress || '',
      notes: '',
      status: statusHint,
      createdAt: now,
      updatedAt: now,
    };
    setClients(prev => [newClient, ...prev]);
    return newClient.id;
  }, [findMatchingClientId]);

  const fillDocFromClient = useCallback((clientId: string) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    setActiveItem(prev => ({
      ...prev,
      clientId: c.id,
      client: c.name,
      clientCompany: c.company || '',
      clientEmail: c.email || '',
      clientAddress: c.address || '',
    }));
  }, [clients]);

  useEffect(() => {
    const saved = localStorage.getItem(DB_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTransactions(parsed.transactions || []);
        setInvoices(parsed.invoices || []);
        setEstimates(parsed.estimates || []);
        setClients(parsed.clients || []);
        const defaultMethod: TaxEstimationMethod = parsed.settings?.taxEstimationMethod || 'custom'; 
        setSettings({
            businessName: "My Business",
            ownerName: "Owner",
            payPrefs: DEFAULT_PAY_PREFS,
            taxRate: 22,
            stateTaxRate: 0,
            taxEstimationMethod: defaultMethod,
            filingStatus: 'single',
            currencySymbol: '$',
            showLogoOnInvoice: true,
            logoAlignment: 'left',
            brandColor: '#2563eb',
            ...parsed.settings
        });
        setCustomCategories({
            income: parsed.customCategories?.income || [],
            expense: parsed.customCategories?.expense || [],
            billing: parsed.customCategories?.billing || []
        });
        setTaxPayments(parsed.taxPayments || []);
        setReceipts(parsed.receipts || []);
      } catch (e) {
        console.error("Error loading data", e);
        showToast("Failed to load saved data.", "error");
      }
    } else {
        // First run (no saved DB): seed demo data so the app is never “empty/blank”
        // when viewed by a buyer on GitHub Pages.
        const demo = getFreshDemoData();

        // --- Demo Clients + Estimates (V7) ---
        const toISO = (d: Date) => d.toISOString().split('T')[0];
        const today = new Date();
        const daysAgo = (n: number) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000);
        const daysFromNow = (n: number) => new Date(today.getTime() + n * 24 * 60 * 60 * 1000);

        const demoClients: Client[] = [
          {
            id: 'cli_demo_1',
            name: 'Kenny Barria',
            company: 'KB Landscaping',
            email: 'kenny@kblandscaping.com',
            phone: '(305) 555-0198',
            address: '12 Palm St, Miami, FL 33101',
            status: 'lead',
            createdAt: toISO(daysAgo(45)),
            updatedAt: toISO(daysAgo(2)),
          },
          {
            id: 'cli_demo_2',
            name: 'Sophia Stanley',
            company: 'Stanley Studio',
            email: 'sophia@stanleystudio.co',
            phone: '(512) 555-0234',
            address: '88 Market Ave, Suite 200, Austin, TX 78701',
            status: 'lead',
            createdAt: toISO(daysAgo(30)),
            updatedAt: toISO(daysAgo(3)),
          },
          {
            id: 'cli_demo_3',
            name: 'Jimmy Wilson',
            company: 'Wilson Renovations',
            email: 'jimmy@wilsonreno.com',
            phone: '(619) 555-0142',
            address: '5 Harbor Rd, San Diego, CA 92101',
            status: 'client',
            createdAt: toISO(daysAgo(120)),
            updatedAt: toISO(daysAgo(1)),
          },
          {
            id: 'cli_demo_4',
            name: 'Rich Richards',
            company: 'Richards Consulting',
            email: 'rich@richardsconsulting.com',
            phone: '(212) 555-0187',
            address: '101 King St, Floor 15, New York, NY 10005',
            status: 'inactive',
            createdAt: toISO(daysAgo(300)),
            updatedAt: toISO(daysAgo(45)),
          },
          {
            id: 'cli_demo_5',
            name: 'Maria Chen',
            company: 'Chen Tech Solutions',
            email: 'maria@chentech.io',
            phone: '(415) 555-0321',
            address: '500 Tech Blvd, San Francisco, CA 94107',
            status: 'lead',
            createdAt: toISO(daysAgo(5)),
            updatedAt: toISO(daysAgo(1)),
            notes: 'Referred by Jimmy Wilson. Interested in e-commerce site.',
          },
        ];

        const demoEstimates: Estimate[] = [
          {
            id: 'est_demo_1',
            number: 'EST-2501-0001',
            clientId: 'cli_demo_3',
            client: 'Jimmy Wilson',
            clientCompany: 'Wilson Renovations',
            clientEmail: 'jimmy@wilsonreno.com',
            clientPhone: '(619) 555-0142',
            clientAddress: '5 Harbor Rd, San Diego, CA 92101',
            projectTitle: 'Master Bathroom Complete Renovation',
            scopeOfWork: `PROJECT OVERVIEW
Full renovation of the master bathroom (approx. 85 sq ft) including all fixtures, plumbing, and finishes.

DEMOLITION & PREP
• Remove and dispose of existing vanity, toilet, and all fixtures
• Disconnect and cap existing plumbing lines
• Protect adjacent flooring and walls during work
• Daily cleanup and debris removal

PLUMBING WORK
• Install new water supply lines for vanity and toilet
• Relocate drain for new vanity position (per approved layout)
• Install new shut-off valves
• Pressure test all connections
• Final plumbing inspection coordination

FIXTURE INSTALLATION
• 36" floating vanity with undermount sink (client to select from provided options)
• Kohler Highline comfort height toilet
• Single-handle widespread faucet in brushed nickel
• New supply lines and P-trap
• Wax ring and toilet mounting hardware

FINISHING
• Caulk all fixtures with mildew-resistant silicone
• Install new toilet paper holder and towel bar (included)
• Final walkthrough and demonstration of all fixtures
• 1-year workmanship warranty on all labor`,
            timeline: '5-7 business days',
            exclusions: `• Tile work / flooring (can quote separately)
• Electrical modifications or new outlets
• Drywall repair beyond fixture areas
• Permit fees (if required by city)
• Painting or wall finishing
• Medicine cabinet or mirrors
• Ventilation / exhaust fan work`,
            acceptanceTerms: 'To accept this estimate, please reply "APPROVED" to this email or sign and return. Work scheduled within 2 weeks of deposit.',
            category: 'Service',
            description: 'Bathroom repair + fixture replacement',
            date: toISO(daysAgo(12)),
            validUntil: toISO(daysFromNow(2)),
            status: 'accepted',
            sentAt: toISO(daysAgo(10)),
            followUpDate: toISO(daysAgo(3)),
            followUpCount: 1,
            lastFollowUp: toISO(daysAgo(5)),
            items: [
              { id: 'e1_i1', description: 'Labor - Demolition (4 hrs @ $95/hr)', quantity: 4, rate: 95 },
              { id: 'e1_i2', description: 'Labor - Plumbing rough-in (6 hrs @ $95/hr)', quantity: 6, rate: 95 },
              { id: 'e1_i3', description: 'Labor - Fixture installation (4 hrs @ $95/hr)', quantity: 4, rate: 95 },
              { id: 'e1_i4', description: '36" Floating Vanity w/ Undermount Sink', quantity: 1, rate: 680 },
              { id: 'e1_i5', description: 'Kohler Highline Comfort Height Toilet', quantity: 1, rate: 320 },
              { id: 'e1_i6', description: 'Widespread Faucet (Brushed Nickel)', quantity: 1, rate: 185 },
              { id: 'e1_i7', description: 'Supply lines, valves, hardware kit', quantity: 1, rate: 95 },
              { id: 'e1_i8', description: 'Towel bar + TP holder set', quantity: 1, rate: 65 },
            ],
            subtotal: 2675,
            discount: 150,
            taxRate: 8,
            shipping: 0,
            amount: Math.round((2525 + 2525 * 0.08) * 100) / 100,
            notes: `Thank you for choosing Wilson Renovations! 

All materials include manufacturer warranty. Labor covered by our 1-year workmanship guarantee.

Questions? Call Jimmy directly at (619) 555-0142.`,
            terms: `PAYMENT TERMS
• 50% deposit required to schedule work and order materials
• Remaining 50% due upon completion and final walkthrough
• Accepted payment: Check, Zelle, or Credit Card (+3% fee)

CHANGE ORDERS
Any work outside this scope will be quoted separately and requires written approval before proceeding.

SCHEDULING
Work will begin within 2 weeks of deposit receipt, subject to material availability.`,
            poNumber: 'WR-2025-1027',
          },
          {
            id: 'est_demo_2',
            number: 'EST-2501-0002',
            clientId: 'cli_demo_1',
            client: 'Kenny Barria',
            clientCompany: 'KB Landscaping',
            clientEmail: 'kenny@kblandscaping.com',
            clientPhone: '(305) 555-0198',
            clientAddress: '12 Palm St, Miami, FL 33101',
            projectTitle: 'Premium Monthly Lawn Care Package',
            scopeOfWork: `WEEKLY SERVICES (Every Thursday, weather permitting)
• Complete lawn mowing with professional-grade equipment
• Precise edging along all walkways, driveways, and beds
• String trimming around trees, fences, and obstacles
• Blowing of all clippings from hard surfaces

MONTHLY SERVICES
• Hedge and shrub trimming (up to 6ft height)
• Bed edging and definition
• Weed control treatment (pre-emergent + spot treatment)
• Irrigation system inspection and minor adjustments

INCLUDED WITH EVERY VISIT
• Green waste removal and disposal
• Visual inspection for pest/disease issues
• Photo documentation of completed work (via app)
• Direct communication with assigned crew lead

SEASONAL EXTRAS (Included quarterly)
• Deep edge renovation (Spring/Fall)
• Shrub shaping and detail pruning
• Mulch redistribution in beds`,
            timeline: 'Ongoing service - Monthly billing cycle',
            exclusions: `• Tree trimming above 6ft (requires separate quote)
• Major landscaping changes or new plantings
• Pest control treatments (can refer trusted partner)
• Fertilization program (available as add-on: $45/month)
• Irrigation repairs beyond minor adjustments
• Hurricane cleanup or storm damage
• Sod replacement or lawn renovation`,
            acceptanceTerms: 'Sign below and return to begin service. First visit scheduled within 5 business days of approval.',
            category: 'Service',
            description: 'Monthly lawn maintenance (4 visits)',
            date: toISO(daysAgo(8)),
            validUntil: toISO(daysFromNow(6)),
            status: 'sent',
            sentAt: toISO(daysAgo(7)),
            followUpDate: toISO(daysAgo(0)),
            followUpCount: 0,
            items: [
              { id: 'e2_i1', description: 'Weekly mowing, edging & blowing (4 visits)', quantity: 4, rate: 85 },
              { id: 'e2_i2', description: 'Monthly hedge & shrub trimming', quantity: 1, rate: 120 },
              { id: 'e2_i3', description: 'Weed control treatment', quantity: 1, rate: 65 },
              { id: 'e2_i4', description: 'Irrigation inspection & adjustment', quantity: 1, rate: 45 },
              { id: 'e2_i5', description: 'Green waste removal (included)', quantity: 1, rate: 0 },
            ],
            subtotal: 560,
            discount: 60,
            taxRate: 0,
            shipping: 0,
            amount: 500,
            notes: `Welcome to KB Landscaping! Your dedicated crew lead is Miguel - he'll text you before each visit.

FIRST MONTH BONUS: Complimentary irrigation system audit (normally $75 value).

Service day: Thursdays between 8am-2pm. We'll notify you if weather delays are needed.`,
            terms: `BILLING
• Monthly invoices sent on the 1st
• Payment due within 7 days
• Auto-pay available (5% discount)

CANCELLATION
• Cancel anytime with 7 days written notice
• No long-term contracts required

SERVICE GUARANTEE
• Not satisfied? We'll return within 48 hours to make it right
• Rain delays rescheduled to next available day`,
          },
          {
            id: 'est_demo_3',
            number: 'EST-2501-0003',
            clientId: 'cli_demo_2',
            client: 'Sophia Stanley',
            clientCompany: 'Stanley Studio',
            clientEmail: 'sophia@stanleystudio.co',
            clientPhone: '(512) 555-0234',
            clientAddress: '88 Market Ave, Suite 200\nAustin, TX 78701',
            projectTitle: 'Complete Brand Identity System',
            scopeOfWork: `PHASE 1: DISCOVERY & STRATEGY (Week 1)
• 90-minute brand discovery session (video call)
• Competitor analysis (5 key competitors)
• Target audience definition and persona development
• Brand positioning statement
• Creative brief documentation

PHASE 2: VISUAL DIRECTION (Week 1-2)
• 2 distinct moodboards with color, typography, and imagery direction
• Presentation of visual directions
• Feedback session and direction selection
• Refinement of chosen direction

PHASE 3: LOGO DESIGN (Week 2-3)
• 3 unique logo concepts based on approved direction
• Presentation with rationale for each concept
• 2 rounds of revisions on selected concept
• Final logo in horizontal, stacked, and icon variations
• Black, white, and full-color versions

PHASE 4: BRAND SYSTEM (Week 3)
• Primary and secondary color palette with hex/RGB/CMYK values
• Typography system (2 fonts: heading + body)
• Brand pattern or texture element
• Photography style guidelines
• Basic iconography style

PHASE 5: DELIVERABLES
• Brand Guidelines PDF (20-25 pages)
• Logo files: AI, EPS, SVG, PNG (all variations)
• Font files or links to purchase/download
• Color palette file for design software
• 1-hour handoff call to walk through all assets`,
            timeline: '3 weeks from deposit to final delivery',
            exclusions: `• Website design or development
• Business card or stationery design
• Social media templates
• Marketing collateral (brochures, flyers)
• Photography or video production
• Copywriting or tagline development
• Trademark research or registration
• Print production or management`,
            acceptanceTerms: 'To begin, pay 50% deposit via the invoice link that will be sent upon approval. Reply "APPROVED" to this email to proceed.',
            category: 'Design',
            description: 'Brand kit design (logo, colors, typography)',
            date: toISO(daysAgo(3)),
            validUntil: toISO(daysFromNow(11)),
            status: 'draft',
            items: [
              { id: 'e3_i1', description: 'Brand Discovery & Strategy Session', quantity: 1, rate: 450 },
              { id: 'e3_i2', description: 'Visual Direction & Moodboards (2)', quantity: 1, rate: 350 },
              { id: 'e3_i3', description: 'Logo Design (3 concepts)', quantity: 1, rate: 1200 },
              { id: 'e3_i4', description: 'Revision Rounds (2 included)', quantity: 2, rate: 150 },
              { id: 'e3_i5', description: 'Brand System Development', quantity: 1, rate: 400 },
              { id: 'e3_i6', description: 'Brand Guidelines Document', quantity: 1, rate: 350 },
              { id: 'e3_i7', description: 'Final File Preparation & Handoff', quantity: 1, rate: 200 },
            ],
            subtotal: 3250,
            discount: 250,
            taxRate: 0,
            shipping: 0,
            amount: 3000,
            notes: `Hi Sophia! I'm so excited to work on Stanley Studio's brand identity. 

Based on our initial conversation, I think we can create something really special that captures your modern, approachable aesthetic while standing out in the Austin market.

I've included a small discount as a thank you for the referral from Jimmy!`,
            terms: `PAYMENT SCHEDULE
• 50% deposit to begin ($1,500)
• 50% final payment before file delivery ($1,500)

REVISIONS
• 2 revision rounds included in logo phase
• Additional revisions: $75/hour

TIMELINE
• 3-week timeline begins after deposit clears
• Delays in feedback may extend timeline
• Rush delivery available (+25%)

OWNERSHIP
• Full rights transfer upon final payment
• I retain right to display in portfolio`,
          },
          {
            id: 'est_demo_4',
            number: 'EST-2501-0004',
            clientId: 'cli_demo_4',
            client: 'Rich Richards',
            clientCompany: 'Richards Consulting',
            clientEmail: 'rich@richardsconsulting.com',
            clientPhone: '(212) 555-0187',
            clientAddress: '101 King St, Floor 15\nNew York, NY 10005',
            projectTitle: 'Executive Leadership Strategy Workshop',
            scopeOfWork: `PRE-WORKSHOP PREPARATION (2 weeks before)
• Stakeholder interviews (3 x 45-min sessions with key executives)
• Review of existing strategic documents and market data
• Preparation of custom workshop materials
• Pre-workshop survey to all participants
• Logistics coordination with your admin team

WORKSHOP DAY (8 hours on-site)
Morning Session (9am - 12pm)
• Opening: Alignment on objectives and ground rules
• Exercise 1: Vision clarification and future-state mapping
• Exercise 2: SWOT analysis with structured facilitation
• Break + networking

Afternoon Session (1pm - 5pm)  
• Exercise 3: Competitive positioning deep-dive
• Exercise 4: Strategic priority ranking and resource allocation
• Exercise 5: 90-day action planning with owners and deadlines
• Closing: Commitments and next steps

POST-WORKSHOP DELIVERABLES (Within 2 weeks)
• Executive Summary Report (10-15 pages)
• Strategic Roadmap visualization (1-page)
• Prioritized initiative list with success metrics
• Photo documentation of all workshop outputs
• 60-minute follow-up call to review and refine`,
            timeline: '1-day workshop + 2 weeks for deliverables',
            exclusions: `• Implementation consulting or project management
• Ongoing advisory or coaching
• Travel expenses outside NYC metro
• Participant travel or accommodation
• Catering or venue (client provides)
• Change management support
• Individual executive coaching
• Market research or data acquisition`,
            acceptanceTerms: 'Confirm your preferred workshop date and pay the deposit to secure booking. Popular dates book 3-4 weeks out.',
            category: 'Consulting',
            description: 'Quarterly strategy workshop (1 day)',
            date: toISO(daysAgo(45)),
            validUntil: toISO(daysAgo(15)),
            status: 'declined',
            sentAt: toISO(daysAgo(44)),
            followUpDate: toISO(daysAgo(37)),
            followUpCount: 2,
            lastFollowUp: toISO(daysAgo(30)),
            items: [
              { id: 'e4_i1', description: 'Stakeholder Interviews (3 sessions)', quantity: 3, rate: 350 },
              { id: 'e4_i2', description: 'Workshop Preparation & Materials', quantity: 1, rate: 800 },
              { id: 'e4_i3', description: 'Full-Day On-Site Facilitation', quantity: 8, rate: 450 },
              { id: 'e4_i4', description: 'Executive Summary Report', quantity: 1, rate: 1200 },
              { id: 'e4_i5', description: 'Strategic Roadmap Document', quantity: 1, rate: 600 },
              { id: 'e4_i6', description: '60-Day Follow-Up Session', quantity: 1, rate: 450 },
            ],
            subtotal: 7700,
            discount: 700,
            taxRate: 0,
            shipping: 0,
            amount: 7000,
            notes: `Rich - per our conversation, client decided to reallocate Q1 budget to sales initiatives. 

They mentioned interest in revisiting for Q2 planning. I'll follow up in March.

Keeping this estimate on file for reference.`,
            terms: `BOOKING & PAYMENT
• 40% deposit to confirm date ($2,800)
• 60% balance due 7 days before workshop ($4,200)
• Accepted: Wire, ACH, or check

CANCELLATION
• 14+ days notice: Full refund minus $500 prep fee
• 7-13 days notice: 50% refund
• <7 days notice: No refund (reschedule available)

GUARANTEE
If you're not satisfied with the workshop, I'll provide an additional half-day session at no charge.`,
          },
          {
            id: 'est_demo_5',
            number: 'EST-2501-0005',
            clientId: 'cli_demo_5',
            client: 'Maria Chen',
            clientCompany: 'Chen Tech Solutions',
            clientEmail: 'maria@chentech.io',
            clientPhone: '(415) 555-0321',
            clientAddress: '500 Tech Blvd\nSan Francisco, CA 94107',
            projectTitle: 'Custom E-Commerce Platform Development',
            scopeOfWork: `PHASE 1: DISCOVERY & PLANNING (Week 1-2)
• Kickoff meeting and requirements gathering
• User journey mapping and conversion funnel design
• Technical architecture planning
• Shopify Plus store structure and navigation
• Integration requirements documentation
• Project timeline and milestone definition

PHASE 2: UI/UX DESIGN (Week 3-5)
• Mobile-first wireframes (Home, PLP, PDP, Cart, Checkout)
• High-fidelity mockups in Figma (Desktop + Mobile)
• Interactive prototype for key user flows
• 2 rounds of design revisions
• Design system documentation
• Client approval checkpoint

PHASE 3: DEVELOPMENT (Week 6-10)
Shopify Plus Implementation:
• Custom theme development (Dawn-based)
• Responsive implementation of all approved designs
• Product catalog setup (up to 100 SKUs)
• Collection and filtering system
• Search functionality with autocomplete

Integrations:
• Payment gateway (Stripe + PayPal)
• Shipping calculator (ShipStation or similar)
• Email marketing (Klaviyo)
• Analytics (GA4 + Meta Pixel)
• Inventory sync preparation

PHASE 4: TESTING & QA (Week 11)
• Cross-browser testing (Chrome, Safari, Firefox, Edge)
• Mobile device testing (iOS + Android)
• Checkout flow testing with test transactions
• Performance optimization (target: 90+ Lighthouse)
• Security review and SSL verification
• Bug fixes and refinements

PHASE 5: LAUNCH & TRAINING (Week 12)
• Staging to production migration
• DNS configuration and go-live
• Admin training session (2 hours, recorded)
• Documentation for day-to-day operations
• 30-day post-launch support period`,
            timeline: '10-12 weeks from project kickoff',
            exclusions: `• Product photography or image editing
• Product descriptions or copywriting
• Inventory data entry (beyond 100 SKUs)
• Custom app development
• ERP or fulfillment system integration
• Ongoing maintenance after 30-day support
• Email template design (beyond Klaviyo defaults)
• Paid advertising setup or management
• Content migration from existing platform
• Legal pages content (Privacy Policy, Terms)`,
            acceptanceTerms: 'To proceed, sign the attached contract and pay the 30% deposit. Project kickoff scheduled within 1 week of deposit.',
            category: 'Development',
            description: 'E-commerce website (Shopify Plus)',
            date: toISO(daysAgo(2)),
            validUntil: toISO(daysFromNow(12)),
            status: 'sent',
            sentAt: toISO(daysAgo(1)),
            followUpDate: toISO(daysFromNow(6)),
            followUpCount: 0,
            items: [
              { id: 'e5_i1', description: 'Discovery & Project Planning', quantity: 1, rate: 2000 },
              { id: 'e5_i2', description: 'UI/UX Design (Mobile + Desktop)', quantity: 1, rate: 4500 },
              { id: 'e5_i3', description: 'Shopify Plus Theme Development', quantity: 1, rate: 6500 },
              { id: 'e5_i4', description: 'Payment & Shipping Integration', quantity: 1, rate: 1500 },
              { id: 'e5_i5', description: 'Analytics & Marketing Integration', quantity: 1, rate: 1000 },
              { id: 'e5_i6', description: 'QA Testing & Performance Optimization', quantity: 1, rate: 1500 },
              { id: 'e5_i7', description: 'Launch, Training & Documentation', quantity: 1, rate: 1200 },
              { id: 'e5_i8', description: '30-Day Post-Launch Support', quantity: 1, rate: 800 },
            ],
            subtotal: 19000,
            discount: 1500,
            taxRate: 8.625,
            shipping: 0,
            amount: Math.round((17500 + 17500 * 0.08625) * 100) / 100,
            notes: `Maria - thank you for the detailed conversation last week! I'm confident we can build something great for Chen Tech Solutions.

Jimmy Wilson (who referred you) has been a client for 2 years - happy to connect you if you'd like a reference.

The $1,500 discount reflects our referral appreciation and your commitment to the recommended timeline.

Looking forward to kicking this off!`,
            terms: `PAYMENT SCHEDULE
• 30% deposit to begin ($5,250)
• 40% at design approval ($7,000)
• 30% before launch ($5,250)

TIMELINE & DELAYS
• Timeline assumes timely feedback (48-72 hrs)
• Scope changes may affect timeline and cost
• Rush delivery available (+20%)

CHANGE REQUESTS
• Minor adjustments included in revision rounds
• Significant changes quoted separately
• All changes require written approval

POST-LAUNCH
• 30-day support covers bugs only
• Ongoing maintenance: $150/month or hourly
• Priority support: $250/month

OWNERSHIP
• You own all custom code upon final payment
• Third-party licenses (Shopify, apps) are your responsibility`,
          },
        ];

        setTransactions([...(demo.transactions || [])] as Transaction[]);
        setInvoices([...(demo.invoices || [])] as Invoice[]);
        setClients(demoClients);
        setEstimates(demoEstimates);
        setSettings({
          businessName: 'My Business',
          ownerName: 'Owner',
          payPrefs: DEFAULT_PAY_PREFS,
          taxRate: 15,
          stateTaxRate: 0,
          taxEstimationMethod: 'preset',
          filingStatus: 'single',
          currencySymbol: '$',
          showLogoOnInvoice: true,
          logoAlignment: 'left',
          brandColor: '#2563eb',
          ...(demo.settings || {}),
        });
        setTaxPayments([...(demo.taxPayments || [])] as TaxPayment[]);
        setCustomCategories({
          income: demo.customCategories?.income || [],
          expense: demo.customCategories?.expense || [],
          billing: demo.customCategories?.billing || [],
        });
        setReceipts([...(demo.receipts || [])] as ReceiptType[]);
    }
    setDataLoaded(true);
  }, []);

  useEffect(() => {
    if (dataLoaded) {
      localStorage.setItem(DB_KEY, JSON.stringify({ transactions, invoices, estimates, clients, settings, taxPayments, customCategories, receipts }));
    }
  }, [transactions, invoices, estimates, clients, settings, taxPayments, customCategories, receipts, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const activeRecurring = invoices.filter(inv => inv.recurrence && inv.recurrence.active && inv.recurrence.nextDate <= todayStr && inv.status !== 'void');
    
    if (activeRecurring.length > 0) {
      const generatedInvoices: Invoice[] = [];
      const updatedParentInvoices = [...invoices];
      activeRecurring.forEach(parent => {
        if (!parent.recurrence) return;
        let currentNextDate = parent.recurrence.nextDate;
        while (currentNextDate <= todayStr) {
           const newDate = currentNextDate;
           const parentDateObj = new Date(parent.date);
           const parentDueObj = new Date(parent.due);
           const termDays = Math.ceil((parentDueObj.getTime() - parentDateObj.getTime()) / (1000 * 3600 * 24));
           const newDueObj = new Date(newDate);
           newDueObj.setDate(newDueObj.getDate() + termDays);
           generatedInvoices.push({
             ...parent,
             id: generateId('inv_auto'),
             date: newDate,
             due: newDueObj.toISOString().split('T')[0],
             status: 'unpaid',
             recurrence: undefined, 
             linkedTransactionId: undefined, 
             notes: `Generated from recurring invoice #${parent.id.substring(parent.id.length - 6).toUpperCase()}`
           });
           currentNextDate = calculateNextDate(currentNextDate, parent.recurrence.frequency);
        }
        const parentIndex = updatedParentInvoices.findIndex(p => p.id === parent.id);
        if (parentIndex >= 0) {
          updatedParentInvoices[parentIndex] = {
            ...parent,
            recurrence: {
              ...parent.recurrence,
              nextDate: currentNextDate
            }
          };
        }
      });
      if (generatedInvoices.length > 0) {
        setInvoices([...generatedInvoices, ...updatedParentInvoices]);
        showToast(`${generatedInvoices.length} recurring invoice(s) generated.`, 'success');
      }
    }
  }, [dataLoaded, invoices]); 

  const totals = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const profit = income - expense;
    const allUnpaid = invoices.filter(i => i.status === 'unpaid');
    const overdueAmount = allUnpaid.filter(i => getDaysOverdue(i.due) > 0).reduce((sum, i) => sum + i.amount, 0);
    const pendingAmount = allUnpaid.reduce((sum, i) => sum + i.amount, 0);
    const totalTaxRate = (settings.taxRate / 100) + (settings.stateTaxRate / 100) + TAX_CONSTANTS.SE_TAX_RATE;
    const estimatedTax = profit > 0 ? profit * totalTaxRate : 0;
    const pendingCount = allUnpaid.length;
    const overdueCount = allUnpaid.filter(i => getDaysOverdue(i.due) > 0).length;
    return { income, expense, profit, pendingAmount, overdueAmount, pendingCount, overdueCount, estimatedTax };
  }, [transactions, invoices, settings.taxRate, settings.stateTaxRate]);

  const homeTotals = useMemo(() => {
    const parse = (dateStr: string) => {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    };

    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const rangeFor = (p: HomeKpiPeriod): { start: Date | null; end: Date } => {
      if (p === 'all') return { start: null, end: endDate };
      if (p === 'ytd') return { start: new Date(now.getFullYear(), 0, 1), end: endDate };
      if (p === 'mtd') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endDate };
      // '30d'
      const start = new Date(endDate);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { start, end: endDate };
    };

    const { start, end } = rangeFor(homeKpiPeriod);
    const inRange = (t: Transaction) => {
      const d = parse(t.date);
      if (!d) return false;
      if (start && d < start) return false;
      return d <= end;
    };

    const scoped = transactions.filter(inRange);
    const income = scoped.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = scoped.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const profit = income - expense;

    const label = homeKpiPeriod === 'ytd' ? 'This Year' : homeKpiPeriod === 'mtd' ? 'This Month' : homeKpiPeriod === '30d' ? '30 Days' : 'All Time';

    const fmtShort = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const rangeText = start ? `${fmtShort(start)} — ${fmtShort(end)}` : `All Time`;

    return { income, expense, profit, label, rangeText };
  }, [transactions, homeKpiPeriod]);

  // Sales Pipeline Stats
  const pipelineStats = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Filter estimates from last 30 days for "active" pipeline
    const recentEstimates = estimates.filter(est => {
      const estDate = new Date(est.date);
      return estDate >= thirtyDaysAgo;
    });

    // All-time stats
    const allDraft = estimates.filter(e => e.status === 'draft');
    const allSent = estimates.filter(e => e.status === 'sent');
    const allAccepted = estimates.filter(e => e.status === 'accepted');
    const allDeclined = estimates.filter(e => e.status === 'declined');

    // Recent (30 days) stats
    const recentDraft = recentEstimates.filter(e => e.status === 'draft');
    const recentSent = recentEstimates.filter(e => e.status === 'sent');
    const recentAccepted = recentEstimates.filter(e => e.status === 'accepted');
    const recentDeclined = recentEstimates.filter(e => e.status === 'declined');

    // Calculate amounts
    const draftAmount = allDraft.reduce((sum, e) => sum + e.amount, 0);
    const sentAmount = allSent.reduce((sum, e) => sum + e.amount, 0);
    const acceptedAmount = allAccepted.reduce((sum, e) => sum + e.amount, 0);
    const declinedAmount = allDeclined.reduce((sum, e) => sum + e.amount, 0);

    // Pipeline value = draft + sent (potential revenue)
    const pipelineValue = draftAmount + sentAmount;

    // Conversion rate (accepted / (accepted + declined)) - only if there are completed estimates
    const completedCount = allAccepted.length + allDeclined.length;
    const conversionRate = completedCount > 0 ? (allAccepted.length / completedCount) * 100 : 0;

    // Recent conversion (last 30 days)
    const recentCompletedCount = recentAccepted.length + recentDeclined.length;
    const recentConversionRate = recentCompletedCount > 0 ? (recentAccepted.length / recentCompletedCount) * 100 : 0;

    // Awaiting response = sent estimates
    const awaitingResponse = allSent.length;
    const awaitingAmount = sentAmount;

    // Follow-up tracking - estimates with follow-up dates that are due or overdue
    const overdueFollowUps = allSent.filter(est => {
      if (est.followUpDate) {
        return est.followUpDate <= today;
      }
      // Legacy: if no followUpDate but sent more than 7 days ago
      if (est.sentAt) {
        const sentDate = new Date(est.sentAt);
        const sevenDaysLater = new Date(sentDate);
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
        return sevenDaysLater <= now;
      }
      // Fallback: use estimate date
      const estDate = new Date(est.date);
      const sevenDaysLater = new Date(estDate);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      return sevenDaysLater <= now;
    });

    // Upcoming follow-ups (in next 3 days)
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const threeDaysISO = threeDaysFromNow.toISOString().split('T')[0];
    
    const upcomingFollowUps = allSent.filter(est => {
      if (est.followUpDate) {
        return est.followUpDate > today && est.followUpDate <= threeDaysISO;
      }
      return false;
    });

    // Sort overdue by urgency (oldest first)
    const sortedOverdue = [...overdueFollowUps].sort((a, b) => {
      const dateA = a.followUpDate || a.sentAt || a.date;
      const dateB = b.followUpDate || b.sentAt || b.date;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });

    return {
      draft: { count: allDraft.length, amount: draftAmount },
      sent: { count: allSent.length, amount: sentAmount },
      accepted: { count: allAccepted.length, amount: acceptedAmount },
      declined: { count: allDeclined.length, amount: declinedAmount },
      pipelineValue,
      conversionRate,
      recentConversionRate,
      awaitingResponse,
      awaitingAmount,
      needsFollowUp: overdueFollowUps.length,
      overdueFollowUps: sortedOverdue,
      upcomingFollowUps,
      totalEstimates: estimates.length,
      recentAccepted: recentAccepted.length,
      recentDeclined: recentDeclined.length,
    };
  }, [estimates]);


  const reportData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Helper to safely get amount as number
    const getAmt = (t: any) => Number(t.amount) || 0;
    // Helper to safe parse date
    const getYear = (dateStr: string) => {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? 0 : d.getFullYear();
    };
    const getMonth = (dateStr: string) => {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? -1 : d.getMonth();
    };

    // 1. YTD Calculations (Calendar Year)
    const ytdTx = transactions.filter(t => getYear(t.date) === currentYear);
    
    const ytdIncome = ytdTx
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + getAmt(t), 0);
        
    const ytdExpense = ytdTx
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + getAmt(t), 0);

    // Allow negative for display
    const ytdNetProfit = ytdIncome - ytdExpense; 

    // 2. Tax Calculations
    // Tax is calculated on positive profit only
    const taxableProfit = Math.max(0, ytdNetProfit);

    const seTaxLiability = taxableProfit * TAX_CONSTANTS.SE_TAXABLE_PORTION * TAX_CONSTANTS.SE_TAX_RATE;
    
    const totalIncomeTaxRate = (settings.taxRate || 0) + (settings.stateTaxRate || 0);
    const incomeTaxLiability = taxableProfit * (totalIncomeTaxRate / 100);
    
    const totalEstimatedTax = seTaxLiability + incomeTaxLiability;
    
    // 3. Tax Payments (YTD)
    const taxPaymentsYTD = taxPayments.filter(p => getYear(p.date) === currentYear);
    const totalTaxPaidYTD = taxPaymentsYTD.reduce((sum, p) => sum + getAmt(p), 0);
    
    // 4. Current Period (Month) for P&L Card
    const currentMonthTx = transactions.filter(t => {
        return getMonth(t.date) === currentMonth && getYear(t.date) === currentYear;
    });
    
    const monthIncome = currentMonthTx
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + getAmt(t), 0);
        
    const monthExpense = currentMonthTx
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + getAmt(t), 0);

    const monthNetProfit = monthIncome - monthExpense;

    // 5. Extras
    const taxShield = ytdExpense * (TAX_CONSTANTS.SE_TAX_RATE + (totalIncomeTaxRate / 100));
    
    const stdDeduction = settings.filingStatus === 'joint' ? TAX_CONSTANTS.STD_DEDUCTION_JOINT : settings.filingStatus === 'head' ? TAX_CONSTANTS.STD_DEDUCTION_HEAD : TAX_CONSTANTS.STD_DEDUCTION_SINGLE;

    return { 
        income: monthIncome,
        expense: monthExpense,
        netProfit: monthNetProfit,
        ytdNetProfit, 
        seTaxLiability,
        incomeTaxLiability,
        totalEstimatedTax,
        stdDeduction,
        taxShield,
        totalTaxPaidYTD,
        taxRemaining: Math.max(0, totalEstimatedTax - totalTaxPaidYTD),
        taxAhead: Math.max(0, totalTaxPaidYTD - totalEstimatedTax),
        taxPaymentsYTD, 
        totalIncomeTaxRate
    };
  }, [transactions, settings, taxPayments]);

  // Pro P&L Data Calculation
  const proPLData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Calculate date range based on period type
    let startDate: Date;
    let endDate: Date;
    let priorStartDate: Date;
    let priorEndDate: Date;
    
    switch (plPeriodType) {
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        priorStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        priorEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        endDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
        priorStartDate = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);
        priorEndDate = new Date(now.getFullYear(), currentQuarter * 3, 0);
        break;
      case 'year':
        startDate = new Date(currentYear, 0, 1);
        endDate = new Date(currentYear, 11, 31);
        priorStartDate = new Date(currentYear - 1, 0, 1);
        priorEndDate = new Date(currentYear - 1, 11, 31);
        break;
      case 'ytd':
        startDate = new Date(currentYear, 0, 1);
        endDate = now;
        priorStartDate = new Date(currentYear - 1, 0, 1);
        priorEndDate = new Date(currentYear - 1, now.getMonth(), now.getDate());
        break;
      case 'lastYear':
        startDate = new Date(currentYear - 1, 0, 1);
        endDate = new Date(currentYear - 1, 11, 31);
        priorStartDate = new Date(currentYear - 2, 0, 1);
        priorEndDate = new Date(currentYear - 2, 11, 31);
        break;
      case 'trailing12':
        endDate = now;
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1);
        priorEndDate = new Date(startDate.getTime() - 1);
        priorStartDate = new Date(priorEndDate.getFullYear() - 1, priorEndDate.getMonth(), priorEndDate.getDate() + 1);
        break;
      case 'custom':
        startDate = new Date(plCustomStart);
        endDate = new Date(plCustomEnd);
        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        priorEndDate = new Date(startDate.getTime() - 1);
        priorStartDate = new Date(priorEndDate.getTime() - daysDiff * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(currentYear, 0, 1);
        endDate = now;
        priorStartDate = new Date(currentYear - 1, 0, 1);
        priorEndDate = new Date(currentYear - 1, now.getMonth(), now.getDate());
    }
    
    // Filter transactions by period
    const periodTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= startDate && d <= endDate;
    });
    
    const priorPeriodTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= priorStartDate && d <= priorEndDate;
    });
    
    // Categorize income with refunds as contra-revenue
    // Sales/Services = all income EXCEPT Refunds and Interest categories
    const salesServices = periodTx.filter(t => t.type === 'income' && 
      t.category !== 'Refunds' && 
      t.category !== 'Interest / Bank' && 
      t.category !== 'Interest'
    ).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    // Income by category (for detailed breakdown)
    const incomeByCategory: Record<string, number> = {};
    periodTx.filter(t => t.type === 'income' && 
      t.category !== 'Refunds' && 
      t.category !== 'Interest / Bank' && 
      t.category !== 'Interest'
    ).forEach(t => {
      const cat = t.category || 'Other Income';
      incomeByCategory[cat] = (incomeByCategory[cat] || 0) + (Number(t.amount) || 0);
    });
    
    const priorIncomeByCategory: Record<string, number> = {};
    priorPeriodTx.filter(t => t.type === 'income' && 
      t.category !== 'Refunds' && 
      t.category !== 'Interest / Bank' && 
      t.category !== 'Interest'
    ).forEach(t => {
      const cat = t.category || 'Other Income';
      priorIncomeByCategory[cat] = (priorIncomeByCategory[cat] || 0) + (Number(t.amount) || 0);
    });
    
    // Refunds should be tracked from EXPENSE type with 'Refunds' category, OR income marked as refund
    // Check if refunds are logged as expenses (more common) or as negative income
    const refundsAsExpense = periodTx.filter(t => t.type === 'expense' && t.category === 'Refunds').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const refundsAsIncome = periodTx.filter(t => t.type === 'income' && t.category === 'Refunds').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const refunds = refundsAsExpense + refundsAsIncome;
    
    // Interest income (Other Income section)
    const interestIncome = periodTx.filter(t => t.type === 'income' && (t.category === 'Interest / Bank' || t.category === 'Interest')).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    // Prior period income (same logic)
    const priorSalesServices = priorPeriodTx.filter(t => t.type === 'income' && 
      t.category !== 'Refunds' && 
      t.category !== 'Interest / Bank' && 
      t.category !== 'Interest'
    ).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const priorRefundsAsExpense = priorPeriodTx.filter(t => t.type === 'expense' && t.category === 'Refunds').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const priorRefundsAsIncome = priorPeriodTx.filter(t => t.type === 'income' && t.category === 'Refunds').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const priorRefunds = priorRefundsAsExpense + priorRefundsAsIncome;
    
    // Net Revenue
    const netRevenue = salesServices - refunds;
    const priorNetRevenue = priorSalesServices - priorRefunds;
    
    // COGS / Direct Costs (categories that are direct costs)
    const cogsCategories = ['Materials', 'Subcontractors', 'Shipping', 'Payment Processing', 'Direct Costs'];
    const cogs = periodTx.filter(t => t.type === 'expense' && cogsCategories.some(c => t.category.toLowerCase().includes(c.toLowerCase()))).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const priorCogs = priorPeriodTx.filter(t => t.type === 'expense' && cogsCategories.some(c => t.category.toLowerCase().includes(c.toLowerCase()))).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    // COGS by category (for detailed breakdown)
    const cogsByCategory: Record<string, number> = {};
    periodTx.filter(t => t.type === 'expense' && cogsCategories.some(c => t.category.toLowerCase().includes(c.toLowerCase()))).forEach(t => {
      const cat = t.category || 'Direct Costs';
      cogsByCategory[cat] = (cogsByCategory[cat] || 0) + (Number(t.amount) || 0);
    });
    
    const priorCogsByCategory: Record<string, number> = {};
    priorPeriodTx.filter(t => t.type === 'expense' && cogsCategories.some(c => t.category.toLowerCase().includes(c.toLowerCase()))).forEach(t => {
      const cat = t.category || 'Direct Costs';
      priorCogsByCategory[cat] = (priorCogsByCategory[cat] || 0) + (Number(t.amount) || 0);
    });
    
    // Gross Profit
    const grossProfit = netRevenue - cogs;
    const priorGrossProfit = priorNetRevenue - priorCogs;
    const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
    
    // Operating Expenses by category
    const opexCategories = [
      'Advertising & Marketing', 'Marketing', 'Advertising',
      'Bank Charges / Merchant Fees', 'Bank Charges', 'Merchant Fees',
      'Insurance',
      'Office Supplies', 'Office',
      'Phone/Internet', 'Phone', 'Internet', 'Communications',
      'Professional Fees', 'Legal', 'Accounting',
      'Rent / Lease', 'Rent', 'Lease',
      'Repairs & Maintenance', 'Repairs', 'Maintenance',
      'Software & Subscriptions', 'Software', 'Subscriptions', 'Software / SaaS',
      'Travel',
      'Meals', 'Meals & Entertainment',
      'Utilities',
      'Payroll', 'Wages', 'Salaries',
      'Payroll Taxes',
      'Taxes & Licenses', 'Taxes', 'Licenses',
      'Vehicle', 'Auto',
      'Depreciation', 'Amortization'
    ];
    
    // Get all expenses grouped by category (exclude COGS and Refunds)
    const expensesByCategory: Record<string, number> = {};
    const priorExpensesByCategory: Record<string, number> = {};
    
    periodTx.filter(t => t.type === 'expense' && 
      t.category !== 'Refunds' &&
      !cogsCategories.some(c => t.category.toLowerCase().includes(c.toLowerCase()))
    ).forEach(t => {
      const cat = t.category || 'Other';
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (Number(t.amount) || 0);
    });
    
    priorPeriodTx.filter(t => t.type === 'expense' && 
      t.category !== 'Refunds' &&
      !cogsCategories.some(c => t.category.toLowerCase().includes(c.toLowerCase()))
    ).forEach(t => {
      const cat = t.category || 'Other';
      priorExpensesByCategory[cat] = (priorExpensesByCategory[cat] || 0) + (Number(t.amount) || 0);
    });
    
    // Group expenses into P&L sections
    const occupancyCategories = ['Rent', 'Rent / Workspace', 'Utilities', 'Equipment', 'Lease'];
    const marketingCategories = ['Marketing', 'Advertising', 'Advertising / Marketing', 'Advertising & Marketing', 'Promotions'];
    const payrollCategories = ['Payroll', 'Wages', 'Salaries', 'Contractors', 'Payroll Taxes', 'Subcontractors'];
    const gaCategories = ['Software / SaaS', 'Software & Subscriptions', 'Software', 'Subscriptions', 'Phone', 'Internet', 'Phone/Internet', 'Communications', 'Office Supplies', 'Office', 'Insurance', 'Professional Fees', 'Legal', 'Accounting', 'Bank Charges', 'Merchant Fees', 'Bank Charges / Merchant Fees', 'Taxes & Licenses', 'Taxes', 'Licenses', 'Travel', 'Meals', 'Meals & Entertainment', 'Meals (Business)'];
    
    const getGroupTotal = (categories: string[], data: Record<string, number>) => {
      return Object.entries(data)
        .filter(([cat]) => categories.some(c => cat.toLowerCase().includes(c.toLowerCase())))
        .reduce((sum, [, amt]) => sum + amt, 0);
    };
    
    const getGroupItems = (categories: string[], data: Record<string, number>) => {
      return Object.entries(data)
        .filter(([cat]) => categories.some(c => cat.toLowerCase().includes(c.toLowerCase())))
        .sort(([,a], [,b]) => b - a);
    };
    
    // Grouped totals
    const occupancyTotal = getGroupTotal(occupancyCategories, expensesByCategory);
    const priorOccupancyTotal = getGroupTotal(occupancyCategories, priorExpensesByCategory);
    const marketingTotal = getGroupTotal(marketingCategories, expensesByCategory);
    const priorMarketingTotal = getGroupTotal(marketingCategories, priorExpensesByCategory);
    const payrollTotal = getGroupTotal(payrollCategories, expensesByCategory);
    const priorPayrollTotal = getGroupTotal(payrollCategories, priorExpensesByCategory);
    const gaTotal = getGroupTotal(gaCategories, expensesByCategory);
    const priorGaTotal = getGroupTotal(gaCategories, priorExpensesByCategory);
    
    // Other expenses (not in any group)
    const allGroupedCategories = [...occupancyCategories, ...marketingCategories, ...payrollCategories, ...gaCategories];
    const otherExpenses = Object.entries(expensesByCategory)
      .filter(([cat]) => !allGroupedCategories.some(c => cat.toLowerCase().includes(c.toLowerCase())))
      .reduce((sum, [, amt]) => sum + amt, 0);
    const priorOtherExpenses = Object.entries(priorExpensesByCategory)
      .filter(([cat]) => !allGroupedCategories.some(c => cat.toLowerCase().includes(c.toLowerCase())))
      .reduce((sum, [, amt]) => sum + amt, 0);
    
    const totalOpex = Object.values(expensesByCategory).reduce((sum, amt) => sum + amt, 0);
    const priorTotalOpex = Object.values(priorExpensesByCategory).reduce((sum, amt) => sum + amt, 0);
    
    // Operating Income
    const operatingIncome = grossProfit - totalOpex;
    const priorOperatingIncome = priorGrossProfit - priorTotalOpex;
    const opexChange = priorTotalOpex > 0 ? ((totalOpex - priorTotalOpex) / priorTotalOpex) * 100 : 0;
    const operatingIncomeChange = priorOperatingIncome !== 0 ? ((operatingIncome - priorOperatingIncome) / Math.abs(priorOperatingIncome)) * 100 : 0;
    
    // Other Income/Expense
    const otherIncomeTotal = interestIncome;
    const interestExpense = periodTx.filter(t => t.type === 'expense' && (t.category === 'Interest Expense' || t.category === 'Interest')).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const netOtherIncome = otherIncomeTotal - interestExpense;
    
    // Prior period other income
    const priorInterestIncome = priorPeriodTx.filter(t => t.type === 'income' && (t.category === 'Interest / Bank' || t.category === 'Interest')).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const priorInterestExpense = priorPeriodTx.filter(t => t.type === 'expense' && (t.category === 'Interest Expense' || t.category === 'Interest')).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const priorNetOtherIncome = priorInterestIncome - priorInterestExpense;
    
    // Net Income
    const netIncome = operatingIncome + netOtherIncome;
    const priorNetIncome = priorOperatingIncome + priorNetOtherIncome;
    
    // Prior period sales (for comparison column)
    const priorSalesServicesGross = priorSalesServices + priorRefunds;
    
    // Data integrity checks
    const uncategorizedTx = periodTx.filter(t => !t.category || t.category === 'Uncategorized' || t.category === 'Other');
    const uncategorizedCount = uncategorizedTx.length;
    const uncategorizedAmount = uncategorizedTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    
    // YoY change calculations
    const revenueChange = priorNetRevenue > 0 ? ((netRevenue - priorNetRevenue) / priorNetRevenue) * 100 : (netRevenue > 0 ? 100 : 0);
    const grossProfitChange = priorGrossProfit !== 0 ? ((grossProfit - priorGrossProfit) / Math.abs(priorGrossProfit)) * 100 : (grossProfit > 0 ? 100 : 0);
    const netIncomeChange = priorNetIncome !== 0 ? ((netIncome - priorNetIncome) / Math.abs(priorNetIncome)) * 100 : (netIncome > 0 ? 100 : 0);
    
    return {
      // Period info
      startDate,
      endDate,
      priorStartDate,
      priorEndDate,
      periodLabel: plPeriodType === 'custom' 
        ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : plPeriodType === 'ytd' ? `Year to Date (${currentYear})`
        : plPeriodType === 'lastYear' ? `Full Year ${currentYear - 1}`
        : plPeriodType === 'trailing12' ? 'Trailing 12 Months'
        : plPeriodType === 'month' ? now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : plPeriodType === 'quarter' ? `Q${Math.floor(now.getMonth() / 3) + 1} ${currentYear}`
        : `${currentYear}`,
      
      // Revenue
      salesServices,
      priorSalesServicesGross,
      incomeByCategory,
      priorIncomeByCategory,
      refunds,
      priorRefunds,
      netRevenue,
      priorNetRevenue,
      revenueChange,
      
      // COGS
      cogs,
      priorCogs,
      cogsByCategory,
      priorCogsByCategory,
      grossProfit,
      priorGrossProfit,
      grossMargin,
      grossProfitChange,
      
      // Operating Expenses - raw
      expensesByCategory,
      priorExpensesByCategory,
      totalOpex,
      priorTotalOpex,
      opexChange,
      
      // Grouped expenses
      occupancyTotal,
      priorOccupancyTotal,
      occupancyItems: getGroupItems(occupancyCategories, expensesByCategory),
      priorOccupancyItems: getGroupItems(occupancyCategories, priorExpensesByCategory),
      marketingTotal,
      priorMarketingTotal,
      marketingItems: getGroupItems(marketingCategories, expensesByCategory),
      priorMarketingItems: getGroupItems(marketingCategories, priorExpensesByCategory),
      payrollTotal,
      priorPayrollTotal,
      payrollItems: getGroupItems(payrollCategories, expensesByCategory),
      priorPayrollItems: getGroupItems(payrollCategories, priorExpensesByCategory),
      gaTotal,
      priorGaTotal,
      gaItems: getGroupItems(gaCategories, expensesByCategory),
      priorGaItems: getGroupItems(gaCategories, priorExpensesByCategory),
      otherExpenses,
      priorOtherExpenses,
      
      // Operating Income
      operatingIncome,
      priorOperatingIncome,
      operatingIncomeChange,
      operatingMargin: netRevenue > 0 ? (operatingIncome / netRevenue) * 100 : 0,
      
      // Other Income/Expense
      interestIncome,
      priorInterestIncome,
      interestExpense,
      priorInterestExpense,
      netOtherIncome,
      priorNetOtherIncome,
      
      // Net Income
      netIncome,
      priorNetIncome,
      netIncomeChange,
      netMargin: netRevenue > 0 ? (netIncome / netRevenue) * 100 : 0,
      
      // Data integrity
      uncategorizedCount,
      uncategorizedAmount,
      hasDataIssues: uncategorizedCount > 0,
      
      // Transaction count
      transactionCount: periodTx.length,
      priorTransactionCount: priorPeriodTx.length
    };
  }, [transactions, plPeriodType, plCustomStart, plCustomEnd]);

  const getFilteredTransactions = useCallback(() => {
     if (filterPeriod === 'all') return transactions;
     return transactions.filter(t => {
       const tDate = new Date(t.date);
       const checkDate = new Date(tDate.getFullYear(), tDate.getMonth(), tDate.getDate());
       const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
       if (filterPeriod === 'daily') return checkDate.getTime() === ref.getTime();
       if (filterPeriod === 'weekly') {
          const start = getStartOfWeek(ref);
          const end = getEndOfWeek(ref);
          return checkDate >= start && checkDate <= end;
       }
       if (filterPeriod === 'monthly') return tDate.getMonth() === ref.getMonth() && tDate.getFullYear() === ref.getFullYear();
       return tDate.getFullYear() === ref.getFullYear();
     });
  }, [transactions, filterPeriod, referenceDate]);

  const filteredTransactions = useMemo(() => getFilteredTransactions(), [getFilteredTransactions]);
  
  const ledgerItems = useMemo(() => {
    const txItems = transactions.map(t => ({ ...t, dataType: 'transaction', listId: t.id, original: t, sortDate: new Date(t.date).getTime() }));
    const invItems = invoices.map(i => ({ ...i, name: i.client, dataType: 'invoice', type: 'invoice', listId: i.id, original: i, sortDate: new Date(i.date).getTime() }));
    let merged = [...txItems, ...invItems];
    if (filterPeriod !== 'all') {
      merged = merged.filter(item => {
        const itemDate = new Date(item.date);
        const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
        if (filterPeriod === 'monthly') return itemDate.getMonth() === ref.getMonth() && itemDate.getFullYear() === ref.getFullYear();
        if (filterPeriod === 'yearly') return itemDate.getFullYear() === ref.getFullYear();
        return true; 
      });
    }
    if (ledgerFilter !== 'all') {
      merged = merged.filter(item => ledgerFilter === 'invoice' ? item.dataType === 'invoice' : item.type === ledgerFilter);
    }
    return merged.sort((a, b) => b.sortDate - a.sortDate);
  }, [transactions, invoices, filterPeriod, referenceDate, ledgerFilter]);

  const periodTotals = useMemo(() => {
    const inc = filteredTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = filteredTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { inc, exp, net: inc - exp };
  }, [filteredTransactions]);

  const getFilteredInvoices = useCallback(() => {
    if (filterPeriod === 'all') return invoices;
    return invoices.filter(i => {
      const iDate = new Date(i.date);
      const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
      if (filterPeriod === 'monthly') return iDate.getMonth() === ref.getMonth() && iDate.getFullYear() === ref.getFullYear();
      if (filterPeriod === 'yearly') return iDate.getFullYear() === ref.getFullYear();
      return true;
    });
 }, [invoices, filterPeriod, referenceDate]);

 const filteredInvoices = useMemo(() => getFilteredInvoices(), [getFilteredInvoices]);

  const displayedInvoices = useMemo(() => {
    if (invoiceQuickFilter === 'all') return filteredInvoices;
    if (invoiceQuickFilter === 'unpaid') return filteredInvoices.filter(i => i.status === 'unpaid');
    return filteredInvoices.filter(i => i.status === 'unpaid' && getDaysOverdue(i.due) > 0);
  }, [filteredInvoices, invoiceQuickFilter]);

  const invoiceQuickCounts = useMemo(() => {
    const validInvoices = filteredInvoices.filter(i => i.status !== 'void');
    const all = validInvoices.length;
    const unpaid = validInvoices.filter(i => i.status === 'unpaid').length;
    const overdue = validInvoices.filter(i => i.status === 'unpaid' && getDaysOverdue(i.due) > 0).length;
    return { all, unpaid, overdue };
  }, [filteredInvoices]);

 const invoicePeriodTotals = useMemo(() => {
   const validInvoices = filteredInvoices.filter(i => i.status !== 'void');
   const total = validInvoices.reduce((sum, i) => sum + i.amount, 0);
   const paid = validInvoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
   const unpaidAll = validInvoices.filter(i => i.status === 'unpaid');
   const unpaid = unpaidAll.reduce((sum, i) => sum + i.amount, 0);
   const overdue = unpaidAll.filter(i => getDaysOverdue(i.due) > 0).reduce((sum, i) => sum + i.amount, 0);
   return { total, paid, unpaid, overdue };
 }, [filteredInvoices]);

  // Estimates (Quotes)
  const getFilteredEstimates = useCallback(() => {
    if (filterPeriod === 'all') return estimates;
    return estimates.filter(e => {
      const eDate = new Date(e.date);
      const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
      if (filterPeriod === 'monthly') return eDate.getMonth() === ref.getMonth() && eDate.getFullYear() === ref.getFullYear();
      if (filterPeriod === 'yearly') return eDate.getFullYear() === ref.getFullYear();
      return true;
    });
  }, [estimates, filterPeriod, referenceDate]);

  const filteredEstimates = useMemo(() => getFilteredEstimates(), [getFilteredEstimates]);

  const displayedEstimates = useMemo(() => {
    if (estimateQuickFilter === 'all') return filteredEstimates;
    return filteredEstimates.filter(e => e.status === estimateQuickFilter);
  }, [filteredEstimates, estimateQuickFilter]);

  const estimateQuickCounts = useMemo(() => {
    const valid = filteredEstimates.filter(e => e.status !== 'void');
    const all = valid.length;
    const draft = valid.filter(e => e.status === 'draft').length;
    const sent = valid.filter(e => e.status === 'sent').length;
    const accepted = valid.filter(e => e.status === 'accepted').length;
    const declined = valid.filter(e => e.status === 'declined').length;
    return { all, draft, sent, accepted, declined };
  }, [filteredEstimates]);

 const recentCategories = useMemo(() => {
    if (!dataLoaded) return [];
    const sourceData = activeTab === 'billing' ? invoices.map(i => i.category) : transactions.filter(t => t.type === activeTab).map(t => t.category);
    const counts: Record<string, number> = {};
    sourceData.forEach(cat => { counts[cat] = (counts[cat] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cat]) => cat);
 }, [transactions, invoices, activeTab, dataLoaded]);

  const resetActiveItem = (type: 'income' | 'expense' | 'billing') => {
    const today = new Date().toISOString().split('T')[0];
    if (type === 'billing') {
      if (billingDocType === 'estimate') {
        setActiveItem({
          client: '', amount: 0, category: CATS_BILLING[0], description: '', date: today, validUntil: today, status: 'draft',
          items: [{ id: generateId('est_item'), description: '', quantity: 1, rate: 0 }],
          subtotal: 0, discount: 0, taxRate: 0, shipping: 0,
          notes: settings.defaultInvoiceNotes || '', terms: settings.defaultInvoiceTerms || ''
        });
      } else {
        setActiveItem({ 
          client: '', amount: 0, category: CATS_BILLING[0], description: '', date: today, due: today, status: 'unpaid',
          items: [{ id: generateId('item'), description: '', quantity: 1, rate: 0 }],
          subtotal: 0, discount: 0, taxRate: 0, shipping: 0,
          notes: settings.defaultInvoiceNotes || '', terms: settings.defaultInvoiceTerms || ''
        });
      }
    } else {
      setActiveItem({ type, date: today, name: '', amount: 0, category: type === 'income' ? CATS_IN[0] : CATS_OUT[0] });
    }
  };

  const handleOpenFAB = (
    type: 'income' | 'expense' | 'billing' = 'income',
    billingType?: 'invoice' | 'estimate'
  ) => {
    setDrawerMode('add');
    setActiveTab(type);

    // When creating a billing document, make sure the drawer opens in the
    // correct mode (Invoice vs Estimate).
    if (type === 'billing' && billingType) {
      setBillingDocType(billingType);
    }

    resetActiveItem(type);
    setCategorySearch('');
    setIsDrawerOpen(true);
  };

  const getHeaderFabType = (): 'income' | 'expense' | 'billing' => {
    if (currentPage === Page.Income) return 'income';
    if (currentPage === Page.Expenses) return 'expense';
    if ((currentPage === Page.Invoices || currentPage === Page.Invoice) || currentPage === Page.Invoice) return 'billing';
    if ((currentPage === Page.AllTransactions || currentPage === Page.Ledger) || currentPage === Page.Ledger) {
      if (ledgerFilter === 'income') return 'income';
      if (ledgerFilter === 'invoice') return 'billing';
      if (ledgerFilter === 'expense') return 'expense';
      return 'income'; // 'all'
    }
    return 'expense';
  };
  
  const handleEditItem = (item: any) => {
      setCategorySearch('');
      
      // Determine if the item is an invoice or a transaction.
      // It handles both "Ledger" items (which have a .original property) and raw items (from Recent Activity).
      const rawData = item.original || item;
      
      // Check for billing doc types (invoice vs estimate)
      const isEstimate = item.dataType === 'estimate' || rawData.validUntil !== undefined;
      const isInvoice = item.dataType === 'invoice' || rawData.due !== undefined;

      if (isInvoice || isEstimate) {
          setBillingDocType(isEstimate ? 'estimate' : 'invoice');
          setActiveItem(rawData); 
          setActiveTab('billing'); 
          setDrawerMode('edit_inv');
      } else {
          setActiveItem(rawData); 
          // Correctly set tab based on the transaction type (income vs expense)
          const txType = rawData.type || 'income';
          setActiveTab(txType === 'income' ? 'income' : 'expense'); 
          setDrawerMode('edit_tx');
      }
      setIsDrawerOpen(true);
  };

  const handleOpenTaxDrawer = () => {
    setDrawerMode('tax_payments'); setActiveTaxPayment({ type: 'Estimated', date: new Date().toISOString().split('T')[0], amount: 0, note: '' }); setIsDrawerOpen(true);
  };

  const saveTaxPayment = () => {
    if (!activeTaxPayment.amount || Number(activeTaxPayment.amount) <= 0) return showToast("Please enter a valid amount", "error");
    setTaxPayments(prev => [{ id: generateId('tax'), date: activeTaxPayment.date!, amount: Number(activeTaxPayment.amount), type: activeTaxPayment.type || 'Estimated', note: activeTaxPayment.note }, ...prev]);
    showToast("Tax payment recorded", "success"); setActiveTaxPayment(prev => ({ ...prev, amount: 0, note: '' }));
  };

  const deleteTaxPayment = (id: string) => {
    if(confirm("Delete this tax payment?")) { setTaxPayments(prev => prev.filter(p => p.id !== id)); showToast("Payment deleted", "info"); }
  };

  const handleSeedDemoData = () => {
    const demo = getFreshDemoData();
    // --- Demo Clients + Estimates (V7) ---
    const toISO = (d: Date) => d.toISOString().split('T')[0];
    const today = new Date();
    const daysAgo = (n: number) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000);
    const daysFromNow = (n: number) => new Date(today.getTime() + n * 24 * 60 * 60 * 1000);

    const demoClients: Client[] = [
      {
        id: 'cli_demo_1',
        name: 'Kenny Barria',
        company: 'KB Landscaping',
        email: 'kenny@kblandscaping.com',
        phone: '(305) 555-0198',
        address: '12 Palm St, Miami, FL 33101',
        status: 'lead',
        createdAt: toISO(daysAgo(45)),
        updatedAt: toISO(daysAgo(2)),
      },
      {
        id: 'cli_demo_2',
        name: 'Sophia Stanley',
        company: 'Stanley Studio',
        email: 'sophia@stanleystudio.co',
        phone: '(512) 555-0234',
        address: '88 Market Ave, Suite 200, Austin, TX 78701',
        status: 'lead',
        createdAt: toISO(daysAgo(30)),
        updatedAt: toISO(daysAgo(3)),
      },
      {
        id: 'cli_demo_3',
        name: 'Jimmy Wilson',
        company: 'Wilson Renovations',
        email: 'jimmy@wilsonreno.com',
        phone: '(619) 555-0142',
        address: '5 Harbor Rd, San Diego, CA 92101',
        status: 'client',
        createdAt: toISO(daysAgo(120)),
        updatedAt: toISO(daysAgo(1)),
      },
      {
        id: 'cli_demo_4',
        name: 'Rich Richards',
        company: 'Richards Consulting',
        email: 'rich@richardsconsulting.com',
        phone: '(212) 555-0187',
        address: '101 King St, Floor 15, New York, NY 10005',
        status: 'inactive',
        createdAt: toISO(daysAgo(300)),
        updatedAt: toISO(daysAgo(45)),
      },
      {
        id: 'cli_demo_5',
        name: 'Maria Chen',
        company: 'Chen Tech Solutions',
        email: 'maria@chentech.io',
        phone: '(415) 555-0321',
        address: '500 Tech Blvd, San Francisco, CA 94107',
        status: 'lead',
        createdAt: toISO(daysAgo(5)),
        updatedAt: toISO(daysAgo(1)),
        notes: 'Referred by Jimmy Wilson. Interested in e-commerce site.',
      },
    ];

    const demoEstimates: Estimate[] = [
      {
        id: 'est_demo_1',
        number: 'EST-2501-0001',
        clientId: 'cli_demo_3',
        client: 'Jimmy Wilson',
        clientCompany: 'Wilson Renovations',
        clientEmail: 'jimmy@wilsonreno.com',
        clientPhone: '(619) 555-0142',
        clientAddress: '5 Harbor Rd, San Diego, CA 92101',
        projectTitle: 'Master Bathroom Complete Renovation',
        scopeOfWork: `PROJECT OVERVIEW
Full renovation of the master bathroom (approx. 85 sq ft) including all fixtures, plumbing, and finishes.

DEMOLITION & PREP
• Remove and dispose of existing vanity, toilet, and all fixtures
• Disconnect and cap existing plumbing lines
• Protect adjacent flooring and walls during work

PLUMBING WORK
• Install new water supply lines for vanity and toilet
• Relocate drain for new vanity position
• Install new shut-off valves and pressure test

FIXTURE INSTALLATION
• 36" floating vanity with undermount sink
• Kohler Highline comfort height toilet
• Single-handle widespread faucet in brushed nickel

FINISHING
• Caulk all fixtures with mildew-resistant silicone
• Install new toilet paper holder and towel bar
• Final walkthrough and 1-year workmanship warranty`,
        timeline: '5-7 business days',
        exclusions: `• Tile work / flooring
• Electrical modifications
• Drywall repair beyond fixture areas
• Permit fees
• Painting or wall finishing`,
        acceptanceTerms: 'Reply "APPROVED" to this email or sign and return.',
        category: 'Service',
        description: 'Bathroom repair + fixture replacement',
        date: toISO(daysAgo(12)),
        validUntil: toISO(daysFromNow(2)),
        status: 'accepted',
        sentAt: toISO(daysAgo(10)),
        followUpDate: toISO(daysAgo(3)),
        followUpCount: 1,
        lastFollowUp: toISO(daysAgo(5)),
        items: [
          { id: 'e1_i1', description: 'Labor - Demolition (4 hrs @ $95/hr)', quantity: 4, rate: 95 },
          { id: 'e1_i2', description: 'Labor - Plumbing rough-in (6 hrs)', quantity: 6, rate: 95 },
          { id: 'e1_i3', description: 'Labor - Fixture installation (4 hrs)', quantity: 4, rate: 95 },
          { id: 'e1_i4', description: '36" Floating Vanity w/ Undermount Sink', quantity: 1, rate: 680 },
          { id: 'e1_i5', description: 'Kohler Highline Comfort Height Toilet', quantity: 1, rate: 320 },
          { id: 'e1_i6', description: 'Widespread Faucet (Brushed Nickel)', quantity: 1, rate: 185 },
          { id: 'e1_i7', description: 'Supply lines, valves, hardware kit', quantity: 1, rate: 95 },
        ],
        subtotal: 2610,
        discount: 150,
        taxRate: 8,
        shipping: 0,
        amount: Math.round((2460 + 2460 * 0.08) * 100) / 100,
        notes: 'Thank you for choosing Wilson Renovations! All materials include manufacturer warranty.',
        terms: `PAYMENT: 50% deposit to schedule, 50% upon completion.
CHANGES: Work outside scope quoted separately.`,
        poNumber: 'WR-2025-1027',
      },
      {
        id: 'est_demo_2',
        number: 'EST-2501-0002',
        clientId: 'cli_demo_1',
        client: 'Kenny Barria',
        clientCompany: 'KB Landscaping',
        clientEmail: 'kenny@kblandscaping.com',
        clientPhone: '(305) 555-0198',
        clientAddress: '12 Palm St, Miami, FL 33101',
        projectTitle: 'Premium Monthly Lawn Care Package',
        scopeOfWork: `WEEKLY SERVICES (Every Thursday)
• Complete lawn mowing with professional equipment
• Precise edging along walkways and driveways
• String trimming around trees and fences
• Blowing of all clippings from hard surfaces

MONTHLY SERVICES
• Hedge and shrub trimming (up to 6ft)
• Bed edging and definition
• Weed control treatment

INCLUDED WITH EVERY VISIT
• Green waste removal and disposal
• Visual inspection for pest/disease
• Photo documentation via app`,
        timeline: 'Ongoing service - Monthly billing',
        exclusions: `• Tree trimming above 6ft
• Major landscaping changes
• Pest control treatments
• Fertilization (add-on available)
• Irrigation repairs`,
        acceptanceTerms: 'Sign below to begin service within 5 business days.',
        category: 'Service',
        description: 'Monthly lawn maintenance (4 visits)',
        date: toISO(daysAgo(8)),
        validUntil: toISO(daysFromNow(6)),
        status: 'sent',
        sentAt: toISO(daysAgo(7)),
        followUpDate: toISO(daysAgo(0)),
        followUpCount: 0,
        items: [
          { id: 'e2_i1', description: 'Weekly mowing, edging & blowing (4 visits)', quantity: 4, rate: 85 },
          { id: 'e2_i2', description: 'Monthly hedge & shrub trimming', quantity: 1, rate: 120 },
          { id: 'e2_i3', description: 'Weed control treatment', quantity: 1, rate: 65 },
          { id: 'e2_i4', description: 'Irrigation inspection', quantity: 1, rate: 45 },
        ],
        subtotal: 570,
        discount: 70,
        taxRate: 0,
        shipping: 0,
        amount: 500,
        notes: 'FIRST MONTH BONUS: Complimentary irrigation audit ($75 value). Service day: Thursdays.',
        terms: `BILLING: Monthly on the 1st, due within 7 days.
CANCEL: Anytime with 7 days notice.`,
      },
      {
        id: 'est_demo_3',
        number: 'EST-2501-0003',
        clientId: 'cli_demo_2',
        client: 'Sophia Stanley',
        clientCompany: 'Stanley Studio',
        clientEmail: 'sophia@stanleystudio.co',
        clientPhone: '(512) 555-0234',
        clientAddress: '88 Market Ave, Suite 200\nAustin, TX 78701',
        projectTitle: 'Complete Brand Identity System',
        scopeOfWork: `PHASE 1: DISCOVERY (Week 1)
• 90-minute brand discovery session
• Competitor analysis (5 competitors)
• Target audience and persona development
• Creative brief documentation

PHASE 2: VISUAL DIRECTION (Week 1-2)
• 2 distinct moodboards
• Feedback session and direction selection

PHASE 3: LOGO DESIGN (Week 2-3)
• 3 unique logo concepts
• 2 rounds of revisions
• Final logo in all variations

PHASE 4: BRAND SYSTEM (Week 3)
• Color palette with hex/RGB/CMYK
• Typography system (2 fonts)
• Brand guidelines PDF (20+ pages)
• All final files (AI, EPS, SVG, PNG)`,
        timeline: '3 weeks from deposit to delivery',
        exclusions: `• Website design
• Business cards / stationery
• Social media templates
• Photography / video
• Copywriting`,
        acceptanceTerms: 'Reply "APPROVED" then pay 50% deposit to begin.',
        category: 'Design',
        description: 'Brand kit design (logo, colors, typography)',
        date: toISO(daysAgo(3)),
        validUntil: toISO(daysFromNow(11)),
        status: 'draft',
        items: [
          { id: 'e3_i1', description: 'Brand Discovery & Strategy', quantity: 1, rate: 450 },
          { id: 'e3_i2', description: 'Visual Direction & Moodboards', quantity: 1, rate: 350 },
          { id: 'e3_i3', description: 'Logo Design (3 concepts)', quantity: 1, rate: 1200 },
          { id: 'e3_i4', description: 'Revision Rounds (2 included)', quantity: 2, rate: 150 },
          { id: 'e3_i5', description: 'Brand System & Guidelines', quantity: 1, rate: 600 },
        ],
        subtotal: 2900,
        discount: 0,
        taxRate: 0,
        shipping: 0,
        amount: 2900,
        notes: 'Excited to work on Stanley Studio\'s brand! Jimmy Wilson referral discount applied.',
        terms: `PAYMENT: 50% deposit, 50% before delivery.
REVISIONS: 2 rounds included, additional at $75/hr.`,
      },
      {
        id: 'est_demo_4',
        number: 'EST-2501-0004',
        clientId: 'cli_demo_4',
        client: 'Rich Richards',
        clientCompany: 'Richards Consulting',
        clientEmail: 'rich@richardsconsulting.com',
        clientPhone: '(212) 555-0187',
        clientAddress: '101 King St, Floor 15\nNew York, NY 10005',
        projectTitle: 'Executive Leadership Strategy Workshop',
        scopeOfWork: `PRE-WORKSHOP (2 weeks before)
• Stakeholder interviews (3 x 45-min)
• Review strategic documents
• Custom workshop materials
• Pre-workshop survey

WORKSHOP DAY (8 hours)
Morning: Vision & SWOT analysis
Afternoon: Competitive positioning & 90-day planning

DELIVERABLES (Within 2 weeks)
• Executive Summary Report (10-15 pages)
• Strategic Roadmap (1-page visual)
• Prioritized initiatives with metrics
• 60-minute follow-up call`,
        timeline: '1-day workshop + 2 weeks deliverables',
        exclusions: `• Implementation consulting
• Ongoing advisory
• Travel outside NYC metro
• Catering / venue`,
        acceptanceTerms: 'Confirm date and pay deposit to book.',
        category: 'Consulting',
        description: 'Quarterly strategy workshop (1 day)',
        date: toISO(daysAgo(45)),
        validUntil: toISO(daysAgo(15)),
        status: 'declined',
        sentAt: toISO(daysAgo(44)),
        followUpDate: toISO(daysAgo(37)),
        followUpCount: 2,
        lastFollowUp: toISO(daysAgo(30)),
        items: [
          { id: 'e4_i1', description: 'Stakeholder Interviews (3)', quantity: 3, rate: 350 },
          { id: 'e4_i2', description: 'Workshop Prep & Materials', quantity: 1, rate: 800 },
          { id: 'e4_i3', description: 'Full-Day Facilitation (8 hrs)', quantity: 8, rate: 400 },
          { id: 'e4_i4', description: 'Report & Roadmap', quantity: 1, rate: 1500 },
          { id: 'e4_i5', description: 'Follow-Up Session', quantity: 1, rate: 450 },
        ],
        subtotal: 7000,
        discount: 500,
        taxRate: 0,
        shipping: 0,
        amount: 6500,
        notes: 'Client declined - budget reallocated. Will follow up Q2.',
        terms: `PAYMENT: 40% deposit, 60% before workshop.
CANCEL: 14+ days = full refund minus $500.`,
      },
      {
        id: 'est_demo_5',
        number: 'EST-2501-0005',
        clientId: 'cli_demo_5',
        client: 'Maria Chen',
        clientCompany: 'Chen Tech Solutions',
        clientEmail: 'maria@chentech.io',
        clientPhone: '(415) 555-0321',
        clientAddress: '500 Tech Blvd\nSan Francisco, CA 94107',
        projectTitle: 'Custom E-Commerce Platform',
        scopeOfWork: `PHASE 1: DISCOVERY (Week 1-2)
• Requirements gathering & kickoff
• User journey mapping
• Technical architecture planning

PHASE 2: DESIGN (Week 3-5)
• Mobile-first wireframes
• High-fidelity mockups (Figma)
• Interactive prototype
• 2 rounds of revisions

PHASE 3: DEVELOPMENT (Week 6-10)
• Custom Shopify Plus theme
• Product catalog (100 SKUs)
• Payment integration (Stripe + PayPal)
• Shipping calculator
• Analytics setup (GA4 + Meta)

PHASE 4: LAUNCH (Week 11-12)
• QA testing (cross-browser + mobile)
• Performance optimization
• Admin training (2 hrs, recorded)
• 30-day post-launch support`,
        timeline: '10-12 weeks from kickoff',
        exclusions: `• Product photography
• Copywriting
• Custom app development
• Ongoing maintenance (after 30 days)
• Marketing / ads setup`,
        acceptanceTerms: 'Sign contract and pay 30% deposit to begin.',
        category: 'Development',
        description: 'E-commerce website (Shopify Plus)',
        date: toISO(daysAgo(2)),
        validUntil: toISO(daysFromNow(12)),
        status: 'sent',
        sentAt: toISO(daysAgo(1)),
        followUpDate: toISO(daysFromNow(6)),
        followUpCount: 0,
        items: [
          { id: 'e5_i1', description: 'Discovery & Planning', quantity: 1, rate: 2000 },
          { id: 'e5_i2', description: 'UI/UX Design', quantity: 1, rate: 4500 },
          { id: 'e5_i3', description: 'Shopify Development', quantity: 1, rate: 6500 },
          { id: 'e5_i4', description: 'Integrations (Payment, Shipping, Analytics)', quantity: 1, rate: 2500 },
          { id: 'e5_i5', description: 'QA & Performance', quantity: 1, rate: 1500 },
          { id: 'e5_i6', description: 'Launch, Training & Support', quantity: 1, rate: 2000 },
        ],
        subtotal: 19000,
        discount: 1500,
        taxRate: 8.625,
        shipping: 0,
        amount: Math.round((17500 + 17500 * 0.08625) * 100) / 100,
        notes: 'Jimmy Wilson referral - $1,500 discount applied. Excited to build this!',
        terms: `PAYMENT: 30% start, 40% at design approval, 30% before launch.
TIMELINE: Assumes 48-72hr feedback turnaround.`,
      },
    ];

    // Keep original demo data, but add our V7 demo entities
    setTransactions([...demo.transactions] as Transaction[]);
    setInvoices([...demo.invoices] as Invoice[]);
    setClients(demoClients);
    setEstimates(demoEstimates);
    setSettings({ ...demo.settings });
    setTaxPayments([...(demo.taxPayments || [])] as TaxPayment[]);
    setSeedSuccess(true); showToast("Demo data loaded successfully!", "success"); setCurrentPage(Page.Dashboard); setTimeout(() => setSeedSuccess(false), 2000);
  };

  const handleClearData = () => setShowResetConfirm(true);
  
  const performReset = () => {
    try {
        localStorage.setItem(DB_KEY, JSON.stringify({ transactions: [], invoices: [], estimates: [], clients: [], settings: { businessName: "My Business", ownerName: "Owner", payPrefs: DEFAULT_PAY_PREFS, taxRate: 25, currencySymbol: '$' }, taxPayments: [], customCategories: { income: [], expense: [], billing: [] }, receipts: [] }));
    } catch (e) { console.error("Failed to wipe", e); }
    setTransactions([]); setInvoices([]); setEstimates([]); setTaxPayments([]); setReceipts([]); setCustomCategories({ income: [], expense: [], billing: [] }); setSettings({ businessName: "My Business", ownerName: "Owner", payPrefs: DEFAULT_PAY_PREFS, taxRate: 25, stateTaxRate: 0, taxEstimationMethod: 'preset', filingStatus: 'single', currencySymbol: '$' });
     setSeedSuccess(false); setShowResetConfirm(false); showToast("All data has been wiped.", "success"); setCurrentPage(Page.Dashboard);
  };

  const confirmDeleteInvoice = () => {
    if (!invoiceToDelete) return;
    const inv = invoices.find(i => i.id === invoiceToDelete);
    setInvoices(prev => prev.filter(i => i.id !== invoiceToDelete));
    if (inv && inv.linkedTransactionId) {
        setTransactions(prev => prev.filter(t => t.id !== inv.linkedTransactionId));
    }
    setInvoiceToDelete(null);
    setIsDrawerOpen(false);
    showToast("Invoice deleted", "info");
  };

  const saveTransaction = (data: Partial<Transaction>) => {
    if (!data.name?.trim()) return showToast("Please enter a description", "error");
    if (!data.amount || Number(data.amount) <= 0) return showToast("Please enter a valid amount", "error");
    const newTx: Transaction = { id: generateId('tx'), name: data.name, amount: Number(data.amount), category: data.category || "General", date: data.date || new Date().toISOString().split('T')[0], type: (data.type as any) || 'income', notes: data.notes };
    if (drawerMode === 'edit_tx' && activeItem.id) {
      setTransactions(prev => prev.map(t => t.id === activeItem.id ? { ...t, ...newTx, id: t.id } as Transaction : t)); showToast("Transaction updated", "success");
    } else {
      setTransactions(prev => [newTx, ...prev]); showToast("Transaction saved", "success");
    }
    setIsDrawerOpen(false);
  };

  const duplicateTransaction = (original: Transaction) => {
    const duplicated = {
      ...original,
      id: undefined, // Will be generated on save
      date: new Date().toISOString().split('T')[0], // Set to today
      receiptImage: undefined, // Don't copy receipt
      notes: original.notes || '' // Keep notes but don't add "duplicated" marker
    };
    
    setActiveItem(duplicated);
    setActiveTab(original.type); // Set correct tab (income/expense)
    setDrawerMode('add'); // Open in add mode
    setIsDrawerOpen(true);
    showToast("Transaction duplicated - review and save", "success");
    
    // Track duplication for smart suggestions
    const trackingKey = `${original.name}_${original.category}_${original.type}`;
    const currentCount = duplicationCount[trackingKey] || 0;
    const newCount = currentCount + 1;
    
    setDuplicationCount(prev => ({
      ...prev,
      [trackingKey]: newCount
    }));
    
    // After 3 duplications, suggest saving as template
    if (newCount === 3) {
      setTimeout(() => {
        setTemplateSuggestionData({
          name: original.name,
          category: original.category,
          type: original.type
        });
        setShowTemplateSuggestion(true);
      }, 1000);
    }
  };

  const saveInvoice = (data: Partial<Invoice>) => {
    if (!data.client?.trim()) return showToast("Please enter a client name", "error");
    // Auto-create/update client record and tie document to clientId
    const clientId = upsertClientFromDoc(data as any, 'client');
    data = { ...data, clientId };
    let totalAmount = 0, subtotal = 0;
    if (data.items && data.items.length > 0) {
        subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
        totalAmount = Math.max(0, subtotal - (data.discount || 0) + ((subtotal - (data.discount || 0)) * ((data.taxRate || 0) / 100)) + (data.shipping || 0));
    } else {
        totalAmount = Number(data.amount) || 0; subtotal = totalAmount;
    }
    if (totalAmount <= 0) return showToast("Please add items or enter a valid amount", "error");
    const description = data.description || (data.items && data.items.length > 0 ? data.items[0].description : "Services Rendered");
    
    if (drawerMode === 'edit_inv' && activeItem.id) {
      setInvoices(prev => prev.map(i => {
        if (i.id === activeItem.id) {
           const updatedInvoice = { ...i, ...data, amount: totalAmount, subtotal, description } as Invoice;
           if (updatedInvoice.status !== 'void' && updatedInvoice.linkedTransactionId) {
             setTransactions(txs => txs.map(t => t.id === updatedInvoice.linkedTransactionId ? { ...t, amount: updatedInvoice.amount, name: `Pmt: ${updatedInvoice.client}`, date: updatedInvoice.date } : t));
           }
           return updatedInvoice;
        }
        return i;
      }));
      showToast("Invoice updated", "success");
    } else {
      const invNumber = generateDocNumber('INV', invoices);
      const newInv: Invoice = {
        id: generateId('inv'), number: invNumber, clientId: data.clientId, client: data.client, clientAddress: data.clientAddress, clientEmail: data.clientEmail, clientCompany: data.clientCompany,
        amount: totalAmount, category: data.category || "Service", description, date: data.date || new Date().toISOString().split('T')[0],
        due: data.due || new Date().toISOString().split('T')[0], status: 'unpaid', notes: data.notes || settings.defaultInvoiceNotes,
        terms: data.terms || settings.defaultInvoiceTerms, payMethod: data.payMethod, recurrence: data.recurrence, items: data.items,
        subtotal, discount: data.discount, shipping: data.shipping, taxRate: data.taxRate, poNumber: data.poNumber
      };
      setInvoices(prev => [newInv, ...prev]); showToast(`Invoice ${invNumber} created`, "success");
    }
    setIsDrawerOpen(false);
  };

  // Estimates (Quotes)
  const saveEstimate = (data: Partial<Estimate>) => {
    if (!data.client?.trim()) return showToast('Please enter a client name', 'error');
    const statusHint: ClientStatus = (data.status === 'accepted') ? 'client' : 'lead';
    const clientId = upsertClientFromDoc(data as any, statusHint);
    data = { ...data, clientId };
    let totalAmount = 0;
    let subtotal = 0;
    if (data.items && data.items.length > 0) {
        subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
        const taxable = Math.max(0, subtotal - (data.discount || 0));
        totalAmount = Math.max(0, taxable + (taxable * ((data.taxRate || 0) / 100)) + (data.shipping || 0));
    } else {
        totalAmount = Number(data.amount) || 0;
        subtotal = totalAmount;
    }
    if (totalAmount <= 0) return showToast('Please add items or enter a valid amount', 'error');
    const description = data.description || (data.items && data.items.length > 0 ? data.items[0].description : 'Services / Work');

    if (drawerMode === 'edit_inv' && activeItem.id) {
      setEstimates(prev => prev.map(e => e.id === activeItem.id ? ({ ...e, ...data, amount: totalAmount, subtotal, description } as Estimate) : e));
      showToast('Estimate updated', 'success');
    } else {
      const estNumber = generateDocNumber('EST', estimates);
      const newEst: Estimate = {
        id: generateId('est'),
        number: estNumber,
        clientId: data.clientId,
        client: data.client!,
        clientCompany: data.clientCompany,
        clientAddress: data.clientAddress,
        clientEmail: data.clientEmail,
        amount: totalAmount,
        category: data.category || 'Service',
        description,
        date: data.date || new Date().toISOString().split('T')[0],
        validUntil: data.validUntil || data.date || new Date().toISOString().split('T')[0],
        status: (data.status as any) || 'draft',
        notes: data.notes || settings.defaultInvoiceNotes,
        terms: data.terms || settings.defaultInvoiceTerms,
        items: data.items,
        subtotal,
        discount: data.discount,
        shipping: data.shipping,
        taxRate: data.taxRate,
        poNumber: data.poNumber
      };
      setEstimates(prev => [newEst, ...prev]);
      showToast(`Estimate ${estNumber} created`, 'success');
    }
    setIsDrawerOpen(false);
  };

  // Quick status update for estimates with automatic client promotion and follow-up tracking
  const updateEstimateStatus = (est: Estimate, newStatus: 'draft' | 'sent' | 'accepted' | 'declined') => {
    if (!est?.id) return;
    
    const now = new Date();
    const nowISO = now.toISOString();
    
    // Calculate follow-up date (7 days from now when marking as sent)
    const followUpDate = new Date(now);
    followUpDate.setDate(followUpDate.getDate() + 7);
    const followUpDateISO = followUpDate.toISOString().split('T')[0];
    
    setEstimates(prev => prev.map(e => {
      if (e.id !== est.id) return e;
      
      const updates: Partial<Estimate> = { status: newStatus };
      
      if (newStatus === 'sent' && e.status !== 'sent') {
        // First time marking as sent - set sentAt and initial follow-up
        updates.sentAt = nowISO;
        updates.followUpDate = followUpDateISO;
        updates.followUpCount = 0;
      }
      
      return { ...e, ...updates };
    }));
    
    // Auto-promote client from "lead" to "client" when estimate is accepted
    if (newStatus === 'accepted' && est.clientId) {
      const client = clients.find(c => c.id === est.clientId);
      if (client && client.status === 'lead') {
        setClients(prev => prev.map(c => 
          c.id === est.clientId 
            ? { ...c, status: 'client', updatedAt: nowISO } 
            : c
        ));
        showToast(`🎉 ${est.client} is now a customer!`, 'success');
      } else {
        showToast(`Estimate marked as accepted`, 'success');
      }
    } else if (newStatus === 'declined') {
      showToast('Estimate marked as declined', 'info');
    } else if (newStatus === 'sent') {
      showToast(`Estimate sent! Follow-up reminder set for ${followUpDateISO}`, 'success');
    } else {
      showToast(`Estimate status updated`, 'success');
    }
  };

  // Record a follow-up on an estimate
  const recordFollowUp = (est: Estimate, nextFollowUpDays: number = 7) => {
    if (!est?.id) return;
    
    const now = new Date();
    const nextFollowUp = new Date(now);
    nextFollowUp.setDate(nextFollowUp.getDate() + nextFollowUpDays);
    
    setEstimates(prev => prev.map(e => {
      if (e.id !== est.id) return e;
      return {
        ...e,
        lastFollowUp: now.toISOString(),
        followUpDate: nextFollowUp.toISOString().split('T')[0],
        followUpCount: (e.followUpCount || 0) + 1
      };
    }));
    
    showToast(`Follow-up recorded! Next reminder: ${nextFollowUp.toLocaleDateString()}`, 'success');
  };

  // Snooze follow-up reminder
  const snoozeFollowUp = (est: Estimate, days: number) => {
    if (!est?.id) return;
    
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    
    setEstimates(prev => prev.map(e => {
      if (e.id !== est.id) return e;
      return { ...e, followUpDate: newDate.toISOString().split('T')[0] };
    }));
    
    showToast(`Follow-up snoozed for ${days} days`, 'info');
  };

  const deleteEstimate = (est: Partial<Estimate>) => {
    if (!est.id) return;
    if (confirm('Delete this estimate?')) {
      setEstimates(prev => prev.filter(e => e.id !== est.id));
      setIsDrawerOpen(false);
      showToast('Estimate deleted', 'info');
    }
  };

  const duplicateEstimate = (original: Estimate) => {
    const today = new Date().toISOString().split('T')[0];
    const daysValid = original.validUntil && original.date ? Math.max(0, Math.round((new Date(original.validUntil).getTime() - new Date(original.date).getTime()) / (1000 * 60 * 60 * 24))) : 30;
    const valid = new Date();
    valid.setDate(valid.getDate() + daysValid);

    const duplicated: Partial<Estimate> = {
      ...original,
      id: undefined,
      date: today,
      validUntil: valid.toISOString().split('T')[0],
      status: 'draft',
    };

    setBillingDocType('estimate');
    setActiveItem(duplicated);
    setActiveTab('billing');
    setDrawerMode('add');
    setIsDrawerOpen(true);
    showToast('Estimate duplicated - review and save', 'success');
  };

  // Convert Estimate -> Invoice (Wave-style)
  const convertEstimateToInvoice = (est: Estimate) => {
    if (!est?.id) return;
    if (est.status === 'void') return showToast('Cannot convert a void estimate', 'error');
    if (est.status === 'declined') {
      const ok = confirm('This estimate is Declined. Convert to an invoice anyway?');
      if (!ok) return;
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Default due date: today + 14 days (if user didn't set something else later)
    const due = new Date(today);
    due.setDate(due.getDate() + 14);
    const dueStr = due.toISOString().split('T')[0];

    // Generate invoice number
    const invNumber = generateDocNumber('INV', invoices);

    // Build invoice from estimate
    const newInv: Invoice = {
      id: generateId('inv'),
      number: invNumber,
      clientId: est.clientId,
      client: est.client,
      clientCompany: est.clientCompany,
      clientAddress: est.clientAddress,
      clientEmail: est.clientEmail,
      amount: est.amount,
      category: est.category || 'Service',
      description: est.description || (est.items && est.items[0]?.description) || 'Services Rendered',
      date: todayStr,
      due: dueStr,
      status: 'unpaid',
      notes: (est.notes ? `${est.notes}\n\n` : '') + `Converted from estimate ${est.number || est.id}`,
      terms: est.terms || settings.defaultInvoiceTerms,
      items: (est.items || []).map(it => ({ ...it, id: generateId('item') })),
      subtotal: est.subtotal,
      discount: est.discount,
      shipping: est.shipping,
      taxRate: est.taxRate,
      poNumber: est.poNumber,
    };

    // 1) Add invoice
    setInvoices(prev => [newInv, ...prev]);

    // 2) Mark estimate as accepted (so it reflects a closed deal)
    setEstimates(prev => prev.map(e => e.id === est.id ? ({ ...e, status: 'accepted' } as Estimate) : e));

    // 3) Ensure client is promoted to "client" status and show celebration
    let clientPromoted = false;
    if (newInv.clientId) {
      const client = clients.find(c => c.id === newInv.clientId);
      if (client && client.status === 'lead') {
        setClients(prev => prev.map(c => 
          c.id === newInv.clientId 
            ? { ...c, status: 'client', updatedAt: new Date().toISOString() } 
            : c
        ));
        clientPromoted = true;
      }
    } else if (newInv.client?.trim()) {
      upsertClientFromDoc(newInv as any, 'client');
    }

    // 4) Jump user into the new invoice for review/edit
    setBillingDocType('invoice');
    setCurrentPage(Page.Invoices);
    setActiveTab('billing');
    setActiveItem(newInv);
    setDrawerMode('edit_inv');
    setIsDrawerOpen(true);
    
    if (clientPromoted) {
      showToast(`🎉 Deal won! ${invNumber} created & ${est.client} is now a customer!`, 'success');
    } else {
      showToast(`Invoice ${invNumber} created from estimate`, 'success');
    }
  };

  const handlePrintEstimate = (est: Partial<Estimate>) => {
    const estimateToPrint = { ...est } as Estimate;
    if (!estimateToPrint.items || estimateToPrint.items.length === 0) {
        estimateToPrint.items = [{ id: 'generated_1', description: est.description || 'Services', quantity: 1, rate: est.amount || 0 }];
        estimateToPrint.subtotal = est.amount;
    }
    setSelectedEstimateForDoc(estimateToPrint);
    setIsEstimatePdfPreviewOpen(true);
  };

  const handleDirectExportEstimatePDF = () => {
    if (!activeItem.id) return;
    const updatedEstimate = { ...activeItem } as Estimate;
    if (!updatedEstimate.items || updatedEstimate.items.length === 0) {
        updatedEstimate.items = [{ id: 'generated_1', description: updatedEstimate.description || 'Services', quantity: 1, rate: updatedEstimate.amount || 0 }];
        updatedEstimate.subtotal = updatedEstimate.amount;
    }
    setEstimates(prev => prev.map(e => e.id === updatedEstimate.id ? updatedEstimate : e));
    setSelectedEstimateForDoc(updatedEstimate);
    setIsEstimatePdfPreviewOpen(true);
  };

  const duplicateInvoice = (original: Invoice) => {
    const today = new Date().toISOString().split('T')[0];
    const paymentTermsDays = original.due && original.date ? 
      Math.round((new Date(original.due).getTime() - new Date(original.date).getTime()) / (1000 * 60 * 60 * 24)) : 30;
    
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);
    
    const duplicated = {
      ...original,
      id: undefined, // Will be generated on save
      date: today,
      due: dueDate.toISOString().split('T')[0],
      status: 'unpaid' as const, // Always unpaid
      linkedTransactionId: undefined, // Don't link to old payment
      // Keep all the important stuff: client info, items, rates, terms, notes
    };
    
    setActiveItem(duplicated);
    setActiveTab('billing');
    setDrawerMode('add');
    setIsDrawerOpen(true);
    showToast("Invoice duplicated - review and save", "success");
  };
  
  // Phase 3: Batch Duplicate Function
  const openBatchDuplicate = (original: Transaction | Invoice) => {
    setBatchDuplicateData(original);
    setShowBatchDuplicateModal(true);
  };
  
  const executeBatchDuplicate = (dates: string[]) => {
    if (!batchDuplicateData) return;
    
    const isInvoice = 'client' in batchDuplicateData;
    
    dates.forEach(date => {
      if (isInvoice) {
        const original = batchDuplicateData as Invoice;
        const paymentTermsDays = original.due && original.date ? 
          Math.round((new Date(original.due).getTime() - new Date(original.date).getTime()) / (1000 * 60 * 60 * 24)) : 30;
        
        const dueDate = new Date(date);
        dueDate.setDate(dueDate.getDate() + paymentTermsDays);
        
        const newInv: Invoice = {
          ...original,
          id: generateId('inv'),
          date,
          due: dueDate.toISOString().split('T')[0],
          status: 'unpaid',
          linkedTransactionId: undefined
        };
        setInvoices(prev => [newInv, ...prev]);
      } else {
        const original = batchDuplicateData as Transaction;
        const newTx: Transaction = {
          ...original,
          id: generateId('tx'),
          date,
          receiptImage: undefined
        };
        setTransactions(prev => [newTx, ...prev]);
        
        // Track duplication history
        setDuplicationHistory(prev => ({
          ...prev,
          [newTx.id]: { originalId: original.id!, originalDate: original.date }
        }));
      }
    });
    
    showToast(`Created ${dates.length} entries`, "success");
    setShowBatchDuplicateModal(false);
    setBatchDuplicateData(null);
  };
  
  // Phase 3: Recurring Transaction Setup
  const openRecurringSetup = (original: Transaction | Invoice) => {
    setRecurringData(original);
    setShowRecurringModal(true);
  };
  
  const setupRecurringTransaction = (frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly', occurrences: number) => {
    if (!recurringData) return;
    
    const dates: string[] = [];
    const startDate = new Date();
    
    for (let i = 0; i < occurrences; i++) {
      const date = new Date(startDate);
      
      switch (frequency) {
        case 'weekly':
          date.setDate(date.getDate() + (i * 7));
          break;
        case 'biweekly':
          date.setDate(date.getDate() + (i * 14));
          break;
        case 'monthly':
          date.setMonth(date.getMonth() + i);
          break;
        case 'quarterly':
          date.setMonth(date.getMonth() + (i * 3));
          break;
      }
      
      dates.push(date.toISOString().split('T')[0]);
    }
    
    executeBatchDuplicate(dates);
    setShowRecurringModal(false);
    setRecurringData(null);
  };
  
  // Phase 3: Template Management
  const saveAsTemplate = (data: Partial<Transaction | Invoice>, type: string, name: string) => {
    const template = {
      id: generateId('template'),
      name,
      data,
      type
    };
    setSavedTemplates(prev => [...prev, template]);
    showToast("Template saved", "success");
  };
  
  const loadTemplate = (template: typeof savedTemplates[0]) => {
    setActiveItem(template.data);
    setActiveTab(template.type as any);
    setDrawerMode('add');
    setIsDrawerOpen(true);
    showToast(`Template "${template.name}" loaded`, "success");
  };
  
  const deleteTemplate = (id: string) => {
    setSavedTemplates(prev => prev.filter(t => t.id !== id));
    showToast("Template deleted", "info");
  };

  const saveNewCategory = () => {
      if (!newCategoryName || newCategoryName.length < 2) return showToast("Category name too short", "error");
      setCustomCategories(prev => {
          const list = activeTab === 'income' ? 'income' : activeTab === 'expense' ? 'expense' : 'billing';
          return { ...prev, [list]: [...(prev[list] || []), newCategoryName] };
      });
      setActiveItem(prev => ({ ...prev, category: newCategoryName })); setNewCategoryName(''); setDrawerMode(previousDrawerMode.current); showToast("Category added", "success");
  };

  const deleteTransaction = (id?: string) => {
    if (!id) return;
    if(confirm("Delete this transaction?")) { setTransactions(prev => prev.filter(t => t.id !== id)); setIsDrawerOpen(false); showToast("Transaction deleted", "info"); }
  };

  const deleteInvoice = (inv: Partial<Invoice>) => {
    if (!inv.id) return;
    if(confirm("Delete this invoice?")) {
        setInvoices(prev => prev.filter(i => i.id !== inv.id));
        if (inv.linkedTransactionId) setTransactions(prev => prev.filter(t => t.id !== inv.linkedTransactionId));
        setIsDrawerOpen(false); showToast("Invoice deleted", "info");
    }
  };

  const toggleInvoicePaidStatus = (inv: Partial<Invoice>) => {
    if (!inv.id || inv.status === 'void') return;
    if (inv.status === 'paid') {
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'unpaid', linkedTransactionId: undefined } : i));
      if (inv.linkedTransactionId) setTransactions(prev => prev.filter(t => t.id !== inv.linkedTransactionId));
      setActiveItem(prev => ({ ...prev, status: 'unpaid' })); showToast("Invoice marked as Unpaid", "info");
    } else {
      const txId = generateId('tx_pay');
      const newTx: Transaction = { id: txId, name: `Pmt: ${inv.client}`, amount: inv.amount || 0, category: inv.category || 'Sales / Services', date: new Date().toISOString().split('T')[0], type: 'income', notes: `Linked to invoice #${inv.id.substring(0,6)}` };
      setTransactions(prev => [newTx, ...prev]);
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'paid', linkedTransactionId: txId } : i));
      setActiveItem(prev => ({ ...prev, status: 'paid' })); showToast("Invoice marked as Paid", "success");
    }
  };

  const markInvoicePaid = (inv: Invoice) => toggleInvoicePaidStatus(inv);

  const handlePrintInvoice = (inv: Partial<Invoice>) => {
    const invoiceToPrint = { ...inv } as Invoice;
    if (!invoiceToPrint.items || invoiceToPrint.items.length === 0) {
        invoiceToPrint.items = [{ id: 'generated_1', description: inv.description || "Services", quantity: 1, rate: inv.amount || 0 }];
        invoiceToPrint.subtotal = inv.amount;
    }
    setSelectedInvoiceForDoc(invoiceToPrint); setIsPdfPreviewOpen(true);
  };

  const handleDirectExportPDF = () => {
     if (!activeItem.id) return;
     const updatedInvoice = { ...activeItem } as Invoice;
     if (!updatedInvoice.items || updatedInvoice.items.length === 0) {
        updatedInvoice.items = [{ id: 'generated_1', description: updatedInvoice.description || "Services", quantity: 1, rate: updatedInvoice.amount || 0 }];
        updatedInvoice.subtotal = updatedInvoice.amount;
     }
     setInvoices(prev => prev.map(i => i.id === updatedInvoice.id ? updatedInvoice : i));
     setSelectedInvoiceForDoc(updatedInvoice); setIsPdfPreviewOpen(true);
  };
  const handleExportPLPDF = () => {
    setPlExportRequested(true);
    setShowPLPreview(true);
  };

  // Share PDF for Profit & Loss (uses Web Share API when available; falls back to download)
  const sharePLPDF = async () => {
    if (isGeneratingPLPdf) return;
    setIsGeneratingPLPdf(true);
    try {
      // Ensure preview is visible (PDF is captured from the preview DOM)
      if (!showPLPreview) setShowPLPreview(true);

      // Let the modal render fully
      await new Promise(resolve => setTimeout(resolve, 350));

      const element = document.getElementById('pl-pdf-preview-content');
      if (!element) throw new Error("P&L preview element not found");

      // Wait for any images (logo) to finish loading
      const images = Array.from(element.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        const anyImg = img as HTMLImageElement;
        if (anyImg.complete) return Promise.resolve(true);
        return new Promise(resolve => {
          anyImg.onload = () => resolve(true);
          anyImg.onerror = () => resolve(true);
          setTimeout(() => resolve(true), 2000);
        });
      }));

      const periodLabel =
        filterPeriod === 'month'
          ? referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : filterPeriod === 'quarter'
            ? `Q${Math.floor(referenceDate.getMonth() / 3) + 1}_${referenceDate.getFullYear()}`
            : filterPeriod === 'year'
              ? referenceDate.getFullYear().toString()
              : 'All_Time';

      const safeLabel = String(periodLabel).replace(/[^a-z0-9]/gi, '_');
      const filename = `Profit_Loss_${safeLabel}.pdf`;

      // Clone into off-screen wrapper to avoid iOS/Safari clipping (keep ONE long page)
      let cloneWrapper: HTMLDivElement | null = null;

      try {
        const source = element as HTMLElement;

        cloneWrapper = document.createElement('div');
        cloneWrapper.style.position = 'fixed';
        cloneWrapper.style.left = '-100000px';
        cloneWrapper.style.top = '0';
        cloneWrapper.style.width = `${source.scrollWidth}px`;
        cloneWrapper.style.background = '#ffffff';
        cloneWrapper.style.padding = '0';
        cloneWrapper.style.margin = '0';
        cloneWrapper.style.zIndex = '-1';

        const clone = source.cloneNode(true) as HTMLElement;
        clone.style.height = 'auto';
        clone.style.maxHeight = 'none';
        clone.style.overflow = 'visible';

        cloneWrapper.appendChild(clone);
        document.body.appendChild(cloneWrapper);

        await new Promise(resolve => requestAnimationFrame(() => resolve(true)));

        const contentWidth = clone.scrollWidth;
        const contentHeight = clone.scrollHeight;

        const pxToMm = 0.264583; // 96 DPI px -> mm
        const pageWidthMm = 210; // A4 width
        const marginMm = 10;
        const contentWidthMm = pageWidthMm - (marginMm * 2);

        const scaleFactor = contentWidthMm / (contentWidth * pxToMm);
        const pageHeightMm = Math.ceil((contentHeight * pxToMm * scaleFactor) + (marginMm * 2) + 2);

        const opt = {
          margin: [marginMm, marginMm, marginMm, marginMm],
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            backgroundColor: '#ffffff',
            scrollY: 0,
            scrollX: 0,
            windowWidth: contentWidth,
            windowHeight: contentHeight
          },
          jsPDF: {
            unit: 'mm',
            format: [pageWidthMm, Math.max(297, pageHeightMm)],
            orientation: 'portrait',
            compress: true
          },
          pagebreak: { mode: 'avoid-all' }
        };

        const worker = html2pdf().set(opt).from(clone);

        // Try to get a Blob without forcing a download
        let blob: Blob | null = null;
        try {
          if (typeof worker.outputPdf === 'function') {
            blob = await worker.outputPdf('blob');
          }
        } catch {}

        if (!blob) {
          await worker.toPdf();
          const pdf = await worker.get('pdf');
          blob = pdf.output('blob');
        }

        const file = new File([blob!], filename, { type: 'application/pdf' });
        const navAny = navigator as any;
        const canShareFiles = !!navAny.share && (!navAny.canShare || navAny.canShare({ files: [file] }));

        if (canShareFiles) {
          await navAny.share({
            files: [file],
            title: filename,
            text: 'Profit & Loss Statement'
          });
          showToast("Share opened", "success");
        } else {
          // Fallback: download
          await worker.save();
          showToast("P&L PDF Downloaded", "success");
        }
      } finally {
        if (cloneWrapper && cloneWrapper.parentNode) cloneWrapper.parentNode.removeChild(cloneWrapper);
      }
    } catch (error) {
      console.error("P&L share failed:", error);
      showToast("Share/Export failed", "error");
    } finally {
      setIsGeneratingPLPdf(false);
    }
  };


  // Manual PDF generation for Invoice - only triggers when user clicks Download
  const generateInvoicePDF = async () => {
    if (!selectedInvoiceForDoc || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const element = document.getElementById('visible-pdf-preview-content');
      if (!element) throw new Error("Preview element not found");
      const images = Array.from(element.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; setTimeout(resolve, 2000); });
      }));
      const opt = { margin: [10, 10, 10, 10], filename: `Invoice_${selectedInvoiceForDoc.client.replace(/[^a-z0-9]/gi, '_')}_${selectedInvoiceForDoc.date}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
      await html2pdf().set(opt).from(element).save();
      showToast("PDF Downloaded", "success");
    } catch (error) { 
      console.error("PDF failed:", error); 
      showToast("Export failed", "error"); 
    } finally { 
      setIsGeneratingPdf(false); 
    }
  };



  // Share PDF for Invoice (uses Web Share API when available; falls back to download)
  const shareInvoicePDF = async () => {
    if (!selectedInvoiceForDoc || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const element = document.getElementById('visible-pdf-preview-content');
      if (!element) throw new Error("Preview element not found");

      const images = Array.from(element.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if ((img as HTMLImageElement).complete) return Promise.resolve();
        return new Promise(resolve => { (img as HTMLImageElement).onload = resolve as any; (img as HTMLImageElement).onerror = resolve as any; setTimeout(resolve, 2000); });
      }));

      const filename = `Invoice_${selectedInvoiceForDoc.client.replace(/[^a-z0-9]/gi, '_')}_${selectedInvoiceForDoc.date}.pdf`;
      const opt = {
        margin: [10, 10, 10, 10],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      const worker = html2pdf().set(opt).from(element);

      // Try to get a Blob without forcing a download
      let blob: Blob | null = null;
      try {
        if (typeof worker.outputPdf === 'function') {
          blob = await worker.outputPdf('blob');
        }
      } catch {}

      if (!blob) {
        // Fallback path supported by html2pdf.js
        await worker.toPdf();
        const pdf = await worker.get('pdf');
        blob = pdf.output('blob');
      }

      const file = new File([blob!], filename, { type: 'application/pdf' });
      const navAny = navigator as any;
      const canShareFiles = !!navAny.share && (!navAny.canShare || navAny.canShare({ files: [file] }));

      if (canShareFiles) {
        await navAny.share({
          files: [file],
          title: filename,
          text: 'Invoice PDF'
        });
        showToast("Share opened", "success");
      } else {
        // Fallback: download
        await html2pdf().set(opt).from(element).save();
        showToast("PDF Downloaded", "success");
      }
    } catch (error) {
      console.error("Share failed:", error);
      showToast("Share/Export failed", "error");
    } finally {
      setIsGeneratingPdf(false);
    }
  };
  // Manual PDF generation for Estimate - only triggers when user clicks Download
  const generateEstimatePDF = async () => {
    if (!selectedEstimateForDoc || isGeneratingEstimatePdf) return;
    setIsGeneratingEstimatePdf(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const element = document.getElementById('visible-estimate-pdf-preview-content');
      if (!element) throw new Error('Preview element not found');
      const images = Array.from(element.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        // @ts-ignore
        if ((img as any).complete) return Promise.resolve();
        return new Promise(resolve => {
          // @ts-ignore
          img.onload = resolve;
          // @ts-ignore
          img.onerror = resolve;
          setTimeout(resolve, 2000);
        });
      }));
      
      const contentWidth = element.scrollWidth;
      const contentHeight = element.scrollHeight;
      const pxToMm = 0.264583;
      const pageWidthMm = 210;
      const marginMm = 10;
      const contentWidthMm = pageWidthMm - (marginMm * 2);
      const scaleFactor = contentWidthMm / (contentWidth * pxToMm);
      const pageHeightMm = Math.ceil((contentHeight * pxToMm * scaleFactor) + (marginMm * 2) + 10);
      
      const opt = { 
        margin: [marginMm, marginMm, marginMm, marginMm], 
        filename: `Estimate_${selectedEstimateForDoc.client.replace(/[^a-z0-9]/gi, '_')}_${selectedEstimateForDoc.date}.pdf`, 
        image: { type: 'jpeg', quality: 0.98 }, 
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          backgroundColor: '#ffffff', 
          scrollY: 0,
          scrollX: 0,
          windowWidth: contentWidth,
          windowHeight: contentHeight
        }, 
        jsPDF: { 
          unit: 'mm', 
          format: [pageWidthMm, Math.max(297, pageHeightMm)],
          orientation: 'portrait',
          compress: true
        },
        pagebreak: { mode: 'avoid-all', avoid: ['tr', 'td', '.page-break-avoid'] }
      };
      await html2pdf().set(opt).from(element).save();
      showToast('PDF Downloaded', 'success');
    } catch (error) { 
      console.error('Estimate PDF failed:', error); 
      showToast('Export failed', 'error'); 
    } finally { 
      setIsGeneratingEstimatePdf(false); 
    }
  };

  // Share PDF for Estimate (uses Web Share API when available; falls back to download)
  const shareEstimatePDF = async () => {
    if (!selectedEstimateForDoc || isGeneratingEstimatePdf) return;
    setIsGeneratingEstimatePdf(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const element = document.getElementById('visible-estimate-pdf-preview-content');
      if (!element) throw new Error("Preview element not found");

      const images = Array.from(element.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if ((img as HTMLImageElement).complete) return Promise.resolve();
        return new Promise(resolve => { (img as HTMLImageElement).onload = resolve as any; (img as HTMLImageElement).onerror = resolve as any; setTimeout(resolve, 2000); });
      }));

      const filename = `Estimate_${selectedEstimateForDoc.client.replace(/[^a-z0-9]/gi, '_')}_${selectedEstimateForDoc.date}.pdf`;
      const opt = {
        margin: [10, 10, 10, 10],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      const worker = html2pdf().set(opt).from(element);

      let blob: Blob | null = null;
      try {
        if (typeof worker.outputPdf === 'function') {
          blob = await worker.outputPdf('blob');
        }
      } catch {}

      if (!blob) {
        await worker.toPdf();
        const pdf = await worker.get('pdf');
        blob = pdf.output('blob');
      }

      const file = new File([blob!], filename, { type: 'application/pdf' });
      const navAny = navigator as any;
      const canShareFiles = !!navAny.share && (!navAny.canShare || navAny.canShare({ files: [file] }));

      if (canShareFiles) {
        await navAny.share({
          files: [file],
          title: filename,
          text: 'Estimate PDF'
        });
        showToast("Share opened", "success");
      } else {
        await html2pdf().set(opt).from(element).save();
        showToast("PDF Downloaded", "success");
      }
    } catch (error) {
      console.error("Share failed:", error);
      showToast("Share/Export failed", "error");
    } finally {
      setIsGeneratingEstimatePdf(false);
    }
  };


  // Share PDF for Profit & Loss (uses Web Share API when available; falls back to download)
  const shareProPLPDF = async () => {
    if (isGeneratingProPLPdf) return;
    setIsGeneratingProPLPdf(true);
    let cloneWrapper: HTMLDivElement | null = null;

    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const element = document.getElementById('pro-pl-pdf-content');
      if (!element) throw new Error('P&L content not found');

      // Ensure images are loaded (logo)
      const images = Array.from(element.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if ((img as HTMLImageElement).complete) return Promise.resolve();
        return new Promise(resolve => { (img as HTMLImageElement).onload = resolve as any; (img as HTMLImageElement).onerror = resolve as any; setTimeout(resolve, 2000); });
      }));

      // Clone to a fixed-width wrapper to measure full height reliably (especially on iOS)
      cloneWrapper = document.createElement('div');
      cloneWrapper.style.position = 'fixed';
      cloneWrapper.style.left = '-99999px';
      cloneWrapper.style.top = '0';
      cloneWrapper.style.width = '800px';
      cloneWrapper.style.background = '#ffffff';
      cloneWrapper.style.padding = '0';
      cloneWrapper.style.margin = '0';
      cloneWrapper.style.zIndex = '-1';

      const clone = element.cloneNode(true) as HTMLElement;
      (clone as HTMLElement).style.width = '800px';
      (clone as HTMLElement).style.maxWidth = '800px';
      (clone as HTMLElement).style.margin = '0';
      (clone as HTMLElement).style.borderRadius = '0';
      (clone as HTMLElement).style.boxShadow = 'none';

      cloneWrapper.appendChild(clone);
      document.body.appendChild(cloneWrapper);

      // Force layout + capture accurate content height
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
      const contentWidth = clone.scrollWidth || 800;
      const contentHeight = clone.scrollHeight || clone.getBoundingClientRect().height || 1200;

      // Convert px->mm (assuming 96dpi; good enough for single-page export)
      const pxToMm = (px: number) => (px * 25.4) / 96;
      const pageWidthMm = 210; // A4 width
      const pageHeightMm = Math.max(297, pxToMm(contentHeight) * (pageWidthMm / pxToMm(contentWidth)));

      const title = (settings.businessName || 'Business').replace(/[^a-z0-9]/gi, '_');
      const filename = `PL_${title}_${new Date().toISOString().slice(0,10)}.pdf`;

      const opt = {
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          scrollY: 0,
          windowWidth: contentWidth,
          windowHeight: contentHeight
        },
        jsPDF: {
          unit: 'mm',
          format: [pageWidthMm, pageHeightMm],
          orientation: 'portrait'
        },
        pagebreak: { mode: 'avoid-all' }
      };

      const worker = html2pdf().set(opt).from(clone);

      // Try to get a Blob without forcing a download
      let blob: Blob | null = null;
      try {
        if (typeof worker.outputPdf === 'function') {
          blob = await worker.outputPdf('blob');
        }
      } catch {}

      if (!blob) {
        await worker.toPdf();
        const pdf = await worker.get('pdf');
        blob = pdf.output('blob');
      }

      const file = new File([blob!], filename, { type: 'application/pdf' });
      const navAny = navigator as any;
      const canShareFiles = !!navAny.share && (!navAny.canShare || navAny.canShare({ files: [file] }));

      if (canShareFiles) {
        await navAny.share({
          files: [file],
          title: filename,
          text: 'Profit & Loss Statement'
        });
        showToast('Share opened', 'success');
      } else {
        // Fallback: download
        await html2pdf().set(opt).from(clone).save();
        showToast('PDF exported!', 'success');
      }

    } catch (error) {
      console.error('P&L Share error:', error);
      showToast('Share/Export failed', 'error');
    } finally {
      if (cloneWrapper && cloneWrapper.parentNode) cloneWrapper.parentNode.removeChild(cloneWrapper);
      setIsGeneratingProPLPdf(false);
    }
  };




  useEffect(() => {
    let isMounted = true;
    const generatePLPdf = async () => {
      if (!showPLPreview || !plExportRequested || isGeneratingPLPdf) return;

      setIsGeneratingPLPdf(true);
      // Let the modal render fully
      await new Promise(resolve => setTimeout(resolve, 350));

      try {
        const element = document.getElementById('pl-pdf-preview-content');
        if (!element) throw new Error("P&L preview element not found");

        // Wait for any images (logo) to finish loading
        const images = Array.from(element.querySelectorAll('img'));
        await Promise.all(images.map(img => {
          const anyImg = img as HTMLImageElement;
          if (anyImg.complete) return Promise.resolve(true);
          return new Promise(resolve => {
            anyImg.onload = () => resolve(true);
            anyImg.onerror = () => resolve(true);
            setTimeout(() => resolve(true), 2000);
          });
        }));

        const periodLabel =
          filterPeriod === 'month'
            ? referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : filterPeriod === 'quarter'
              ? `Q${Math.floor(referenceDate.getMonth() / 3) + 1}_${referenceDate.getFullYear()}`
              : filterPeriod === 'year'
                ? referenceDate.getFullYear().toString()
                : 'All_Time';

        const safeLabel = String(periodLabel).replace(/[^a-z0-9]/gi, '_');

        // IMPORTANT: html2canvas/html2pdf can clip content inside scrollable containers.
        // We clone the preview content into an off-screen wrapper with no height/overflow limits,
        // then size the PDF page to the full content height so the export is ONE long page.
        let cloneWrapper: HTMLDivElement | null = null;

        try {
          const source = element as HTMLElement;

          cloneWrapper = document.createElement('div');
          cloneWrapper.style.position = 'fixed';
          cloneWrapper.style.left = '-100000px';
          cloneWrapper.style.top = '0';
          cloneWrapper.style.width = `${source.scrollWidth}px`;
          cloneWrapper.style.background = '#ffffff';
          cloneWrapper.style.padding = '0';
          cloneWrapper.style.margin = '0';
          cloneWrapper.style.zIndex = '-1';

          const clone = source.cloneNode(true) as HTMLElement;
          // Remove any potential clipping on the clone
          clone.style.height = 'auto';
          clone.style.maxHeight = 'none';
          clone.style.overflow = 'visible';

          cloneWrapper.appendChild(clone);
          document.body.appendChild(cloneWrapper);

          // Let the browser layout the clone before measuring/capturing
          await new Promise(resolve => requestAnimationFrame(() => resolve(true)));

          const contentWidth = clone.scrollWidth;
          const contentHeight = clone.scrollHeight;

          const pxToMm = 0.264583; // 96 DPI px -> mm
          const pageWidthMm = 210; // A4 width
          const marginMm = 10;
          const contentWidthMm = pageWidthMm - (marginMm * 2);

          // Scale so the content fits the A4 width, then compute the required page height
          const scaleFactor = contentWidthMm / (contentWidth * pxToMm);
          const pageHeightMm = Math.ceil((contentHeight * pxToMm * scaleFactor) + (marginMm * 2) + 2);

          const opt = {
            margin: [marginMm, marginMm, marginMm, marginMm],
            filename: `Profit_Loss_${safeLabel}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              letterRendering: true,
              backgroundColor: '#ffffff',
              scrollY: 0,
              scrollX: 0,
              windowWidth: contentWidth,
              windowHeight: contentHeight
            },
            jsPDF: {
              unit: 'mm',
              format: [pageWidthMm, Math.max(297, pageHeightMm)],
              orientation: 'portrait',
              compress: true
            },
            pagebreak: { mode: 'avoid-all' }
          };

          await html2pdf().set(opt).from(clone).save();
        } finally {
          if (cloneWrapper && cloneWrapper.parentNode) cloneWrapper.parentNode.removeChild(cloneWrapper);
        }

        if (isMounted) {
          showToast("P&L PDF Downloaded", "success");
          setPlExportRequested(false);
          setTimeout(() => setShowPLPreview(false), 1000);
        }
      } catch (error) {
        console.error("P&L PDF failed:", error);
        if (isMounted) {
          showToast("P&L PDF export failed", "error");
          setPlExportRequested(false);
        }
      } finally {
        if (isMounted) setIsGeneratingPLPdf(false);
      }
    };

    if (showPLPreview && plExportRequested) generatePLPdf();

    return () => { isMounted = false; };
  }, [showPLPreview, plExportRequested, filterPeriod, referenceDate]);



  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          if (file.size > 2 * 1024 * 1024) return showToast("File size too large (max 2MB)", "error");
          const reader = new FileReader();
          reader.onload = (e) => { setSettings(s => ({ ...s, businessLogo: e.target?.result as string })); showToast("Logo uploaded", "success"); };
          reader.readAsDataURL(file);
      }
  };

  // --- Scan Receipt Functions (with OCR) ---
  const handleScanReceipt = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      // First compress the image
      const compressedImage = await compressReceiptImage(file);
      setPendingOCRImage(compressedImage);
      
      // Start OCR processing
      setIsOCRProcessing(true);
      setOCRProgress({ percent: 0, status: 'Preparing image...' });
      setShowOCRReviewModal(true);
      
      // Preprocess for better OCR results
      const preprocessed = await preprocessReceiptImage(compressedImage);
      
      // Run OCR
      const result = await processReceiptImage(preprocessed, (percent, status) => {
        setOCRProgress({ percent, status });
      });
      
      // Store OCR results for review
      setOCRResult({
        merchantName: result.merchantName,
        total: result.total,
        subtotal: result.subtotal,
        tax: result.tax,
        date: result.date,
        suggestedCategory: result.suggestedCategory,
        categoryConfidence: result.categoryConfidence,
        rawText: result.rawText,
        confidence: result.confidence
      });
      
      setIsOCRProcessing(false);
      
    } catch (err) {
      console.error("OCR error:", err);
      setIsOCRProcessing(false);
      setOCRResult(null);
      showToast("Failed to scan receipt. Try again.", "error");
    }
    
    // Reset input so same file can be selected again
    event.target.value = '';
  };

  // Create transaction from OCR scan
  const createTransactionFromOCR = (userOverrides?: {
    name?: string;
    amount?: number;
    date?: string;
    category?: string;
  }) => {
    if (!ocrResult || !pendingOCRImage) return;
    
    const name = userOverrides?.name || ocrResult.merchantName || 'Unknown Merchant';
    const amount = userOverrides?.amount ?? ocrResult.total ?? 0;
    const date = userOverrides?.date || ocrResult.date || new Date().toISOString().split('T')[0];
    const category = userOverrides?.category || ocrResult.suggestedCategory || CATS_OUT[0];
    
    // Learn from user corrections for future accuracy
    learnFromUserCorrection(ocrResult.merchantName, name, category);
    
    // Create the transaction with receipt attached
    const newTx: Transaction = {
      id: generateId('tx'),
      type: 'expense',
      name,
      amount,
      date,
      category,
      notes: `Scanned from receipt (${Math.round(ocrResult.confidence)}% confidence)`,
      receiptImage: pendingOCRImage,
      receiptOCR: {
        merchantName: ocrResult.merchantName,
        total: ocrResult.total,
        subtotal: ocrResult.subtotal,
        tax: ocrResult.tax,
        extractedDate: ocrResult.date,
        suggestedCategory: ocrResult.suggestedCategory,
        confidence: ocrResult.confidence,
        rawText: ocrResult.rawText,
        processedAt: new Date().toISOString()
      }
    };
    
    setTransactions(prev => [newTx, ...prev]);
    
    // Cleanup
    setShowOCRReviewModal(false);
    setOCRResult(null);
    setPendingOCRImage(null);
    
    showToast(`Expense "${name}" created from receipt!`, 'success');
  };

  // Cancel OCR scan
  const cancelOCRScan = () => {
    setShowOCRReviewModal(false);
    setIsOCRProcessing(false);
    setOCRResult(null);
    setPendingOCRImage(null);
  };

  // Legacy save receipt (just saves image without OCR)
  const handleScanReceiptLegacy = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
        compressReceiptImage(file).then(base64 => {
            setScanPreview(base64);
        }).catch(err => {
            console.error("Compression error:", err);
            showToast("Failed to process image", "error");
        });
        event.target.value = '';
    }
  };

  const saveReceipt = () => {
      if (scanPreview) {
          const newReceipt: ReceiptType = {
              id: generateId('receipt'),
              date: new Date().toISOString().split('T')[0],
              imageData: scanPreview
          };
          setReceipts(prev => [newReceipt, ...prev]);
          
          downloadReceiptToDevice(scanPreview);

          setScanPreview(null);
          showToast("Receipt saved to Downloads", "success");
      }
  };

  const deleteReceipt = (id: string) => {
      if (confirm("Delete this receipt?")) {
          setReceipts(prev => prev.filter(r => r.id !== id));
          setViewingReceipt(null);
          showToast("Receipt deleted", "info");
      }
  };

  // --- Backup Functions ---
  const handleExportBackup = () => {
    const backup = {
        metadata: {
            appName: "Moniezi Pro v11",
            version: "11.0.0",
            timestamp: new Date().toISOString(),
        },
        data: {
            transactions,
            invoices,
            estimates,
            clients,
            settings,
            taxPayments,
            customCategories,
            receipts
        }
    };
    
    const dataStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `moniezi_v11_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Backup file downloaded", "success");
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const content = e.target?.result as string;
            const parsed = JSON.parse(content);
            
            // Simple validation
            if (!parsed.metadata || !parsed.data) {
                throw new Error("Invalid backup format");
            }
            
            setPendingBackupData(parsed.data);
            setShowRestoreModal(true);
        } catch (err) {
            console.error(err);
            showToast("Invalid backup file", "error");
        }
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const performRestore = () => {
    if (!pendingBackupData) return;
    
    try {
        const newData = pendingBackupData;
        
        // 1. Prepare safe data objects with defaults to prevent crashes
        const tx = Array.isArray(newData.transactions) ? newData.transactions : [];
        const inv = Array.isArray(newData.invoices) ? newData.invoices : [];
        const est = Array.isArray(newData.estimates) ? newData.estimates : [];
        const cls = Array.isArray(newData.clients) ? newData.clients : [];
        const tax = Array.isArray(newData.taxPayments) ? newData.taxPayments : [];
        const rec = Array.isArray(newData.receipts) ? newData.receipts : [];
        const set = { ...settings, ...(newData.settings || {}) };
        
        const cats = {
            income: Array.isArray(newData.customCategories?.income) ? newData.customCategories.income : [],
            expense: Array.isArray(newData.customCategories?.expense) ? newData.customCategories.expense : [],
            billing: Array.isArray(newData.customCategories?.billing) ? newData.customCategories.billing : []
        };

        // 2. Update State directly (triggers useEffect to save to LS)
        setTransactions(tx);
        setInvoices(inv);
        setEstimates(est);
        setClients(cls);
        setTaxPayments(tax);
        setReceipts(rec);
        setSettings(set);
        setCustomCategories(cats);

        // 3. UI Feedback & Cleanup
        setShowRestoreModal(false);
        setPendingBackupData(null);
        showToast("Backup restored successfully!", "success");
        
        // 4. Navigate to Dashboard to show data immediately
        setCurrentPage(Page.Dashboard);
        
    } catch (e) {
        console.error("Restore error", e);
        showToast("Failed to restore: Invalid data", "error");
    }
  };

  const renderCategoryChips = (current: string | undefined, onSelect: (cat: string) => void) => {
    const baseList = activeTab === 'income' ? CATS_IN : activeTab === 'expense' ? CATS_OUT : CATS_BILLING;
    const customList = activeTab === 'income' ? customCategories.income : activeTab === 'expense' ? customCategories.expense : customCategories.billing;
    const allCategories = [...customList, ...baseList.filter(c => !c.startsWith('Other'))];
    let displayList = allCategories;
    if (categorySearch) displayList = allCategories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase()));

    return (
      <div className="mt-3 space-y-3">
         <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400" size={16} />
            <input type="text" placeholder="Search or add category..." value={categorySearch} onChange={e => setCategorySearch(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white" />
         </div>
         <div className="max-h-48 overflow-y-auto custom-scrollbar p-1">
            {!categorySearch && recentCategories.length > 0 && (
                <div className="mb-4">
                    <label className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-2 block">Recent</label>
                    <div className="flex flex-wrap gap-2">
                        {recentCategories.map(cat => (
                            <button key={`recent-${cat}`} type="button" onClick={() => onSelect(cat)} className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border ${current === cat ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>{getCategoryIcon(cat)}{cat}</button>
                        ))}
                    </div>
                </div>
            )}
            <div>
               <label className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider mb-2 block">{categorySearch ? 'Results' : 'All Categories'}</label>
               <div className="flex flex-wrap gap-2">
                  {displayList.map(cat => (
                    <button key={cat} type="button" onClick={() => onSelect(cat)} className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${current === cat ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-800 border border-slate-300/50 dark:border-0'}`}>{getCategoryIcon(cat)}{cat}</button>
                  ))}
                  <button type="button" onClick={() => { if (drawerMode !== 'create_cat') previousDrawerMode.current = drawerMode as any; setNewCategoryName(categorySearch); setDrawerMode('create_cat'); }} className="px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-2 border-dashed border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-900/30"><Plus size={14} />{categorySearch ? `Create "${categorySearch}"` : "Custom Category..."}</button>
               </div>
            </div>
         </div>
      </div>
    );
  };

  const addInvoiceItem = () => setActiveItem(prev => ({ ...prev, items: [...(prev.items || []), { id: generateId('item'), description: '', quantity: 1, rate: 0 }] }));
  const removeInvoiceItem = (itemId: string) => setActiveItem(prev => ({ ...prev, items: prev.items?.filter(item => item.id !== itemId) }));
  const updateInvoiceItem = (itemId: string, field: keyof InvoiceItem, value: any) => setActiveItem(prev => ({ ...prev, items: prev.items?.map(item => item.id === itemId ? { ...item, [field]: value } : item) }));

  const activeInvoiceTotals = useMemo(() => {
      if (!activeItem.items) return { subtotal: 0, total: 0, tax: 0 };
      const subtotal = activeItem.items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
      const discount = activeItem.discount || 0;
      const taxRate = activeItem.taxRate || 0;
      const taxAmount = (subtotal - discount) * (taxRate / 100);
      const total = Math.max(0, subtotal - discount + taxAmount + (activeItem.shipping || 0));
      return { subtotal, total, tax: taxAmount };
  }, [activeItem]);

  // Show loading state while checking license
  if (isLicenseValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div 
            onClick={handleDevTap}
            className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 transform-gpu cursor-pointer select-none"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="40" 
              height="40" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="text-white pointer-events-none"
              style={{ shapeRendering: 'geometricPrecision' }}
            >
              <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/>
              <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
            </svg>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Loader2 size={20} className="animate-spin text-blue-500" />
            <span className="text-slate-400 font-medium">Loading Moniezi...</span>
          </div>
        </div>
      </div>
    );
  }

  // Show license activation screen if not valid
  if (isLicenseValid === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative w-full max-w-md">
          {/* Logo and Welcome */}
          <div className="text-center mb-8">
            <div 
              onClick={handleDevTap}
              className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-blue-500/30 transform-gpu hover:scale-105 transition-transform cursor-pointer select-none"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="48" 
                height="48" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="text-white pointer-events-none"
                style={{ shapeRendering: 'geometricPrecision' }}
              >
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/>
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
              </svg>
            </div>
            <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Welcome to Moniezi</h1>
            <p className="text-slate-400">Your all-in-one financial management app</p>
          </div>

          {/* License Card */}
          <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-800 p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Key size={20} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Activate Your License</h2>
                <p className="text-sm text-slate-500">Enter your Gumroad license key</p>
              </div>
            </div>

            {/* License Key Input */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  License Key
                </label>
                <input
                  type="text"
                  value={licenseKey}
                  onChange={(e) => { setLicenseKey(e.target.value); setLicenseError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleActivateLicense()}
                  placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                  className="w-full px-4 py-4 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                  disabled={isValidatingLicense}
                  autoFocus
                />
              </div>

              {/* Error Message */}
              {licenseError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{licenseError}</p>
                </div>
              )}

              {/* Activate Button */}
              <button
                onClick={handleActivateLicense}
                disabled={isValidatingLicense || !licenseKey.trim()}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isValidatingLicense ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <CheckCircle size={20} />
                    Activate License
                  </>
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-xs text-slate-600 uppercase tracking-wider">Need a license?</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Purchase Link */}
            <a
              href="https://yourusername.gumroad.com/l/moniezi"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold rounded-xl text-center transition-all"
            >
              Purchase on Gumroad →
            </a>
          </div>

          {/* Features Preview */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { icon: <TrendingUp size={18} />, label: 'Track Income' },
              { icon: <Receipt size={18} />, label: 'Manage Expenses' },
              { icon: <FileText size={18} />, label: 'Create Invoices' },
            ].map((feature, i) => (
              <div key={i} className="text-center p-4 bg-slate-900/50 rounded-xl border border-slate-800/50">
                <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
                  {feature.icon}
                </div>
                <span className="text-xs text-slate-500 font-medium">{feature.label}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <p className="text-center text-slate-600 text-xs mt-8">
            By activating, you agree to our Terms of Service
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
/* ================================
   Light mode readability boost
   (Makes text/icons a bit sharper)
   ================================ */
html:not(.dark) .text-slate-200 { color: rgb(148 163 184) !important; } /* slate-400 */
html:not(.dark) .text-slate-300 { color: rgb(100 116 139) !important; } /* slate-500 */
html:not(.dark) .text-slate-400 { color: rgb(71 85 105) !important; }  /* slate-600 */
html:not(.dark) .text-slate-500 { color: rgb(51 65 85) !important; }  /* slate-700 */
html:not(.dark) .text-slate-600 { color: rgb(30 41 59) !important; }  /* slate-800 */
html:not(.dark) .text-slate-700 { color: rgb(15 23 42) !important; }  /* slate-900 */
html:not(.dark) .text-slate-800 { color: rgb(2 6 23) !important; }    /* slate-950 */
html:not(.dark) .text-slate-900 { color: rgb(2 6 23) !important; }    /* slate-950 */

/* Slightly crisper borders in light mode */
html:not(.dark) .border-slate-100 { border-color: rgb(226 232 240) !important; } /* slate-200 */
html:not(.dark) .border-slate-200 { border-color: rgb(203 213 225) !important; } /* slate-300 */

/* Subtle “inkier” shadows in light mode */
html:not(.dark) .shadow-sm { box-shadow: 0 1px 2px rgba(2, 6, 23, 0.10) !important; }
html:not(.dark) .shadow { box-shadow: 0 1px 3px rgba(2, 6, 23, 0.14), 0 1px 2px rgba(2, 6, 23, 0.10) !important; }

/* Slightly stronger separators */
html:not(.dark) .divide-slate-200 > :not([hidden]) ~ :not([hidden]) { border-color: rgb(203 213 225) !important; }
`}</style>
      <div className="min-h-screen flex flex-col max-w-2xl mx-auto relative bg-slatebg dark:bg-slate-950 text-slate-900 dark:text-white overflow-hidden transition-colors duration-300">
      
      {/* Scan Receipt Confirm Modal */}
      {scanPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl p-4 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"><Receipt size={20} />Save Receipt?</h3>
                    <button onClick={() => setScanPreview(null)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-hidden rounded-lg bg-black border border-slate-800 relative mb-4">
                    <img src={scanPreview} alt="Receipt Preview" className="w-full h-full object-contain" />
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setScanPreview(null)} className="flex-1 py-3 font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Discard</button>
                    <button onClick={saveReceipt} className="flex-1 py-3 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/20 transition-colors">Save</button>
                </div>
            </div>
        </div>
      )}

      {/* OCR Receipt Review Modal - Smart Receipt Scanner */}
      {showOCRReviewModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[95vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-blue-600 to-indigo-600">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <ScanLine size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Smart Receipt Scanner</h3>
                  <p className="text-xs text-blue-100">Offline OCR • No cloud required</p>
                </div>
              </div>
              <button 
                onClick={cancelOCRScan} 
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <X size={18} className="text-white" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Image Preview */}
              {pendingOCRImage && (
                <div className="relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <img 
                    src={pendingOCRImage} 
                    alt="Receipt" 
                    className="w-full max-h-48 object-contain"
                  />
                  {isOCRProcessing && (
                    <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center">
                      <Loader2 size={32} className="text-blue-400 animate-spin mb-3" />
                      <div className="text-white text-sm font-medium mb-2">{ocrProgress.status}</div>
                      <div className="w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
                          style={{ width: `${ocrProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* OCR Results */}
              {!isOCRProcessing && ocrResult && (
                <>
                  {/* Confidence Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck size={16} className={ocrResult.confidence > 70 ? 'text-emerald-500' : ocrResult.confidence > 50 ? 'text-amber-500' : 'text-red-500'} />
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        {ocrResult.confidence > 70 ? 'High' : ocrResult.confidence > 50 ? 'Medium' : 'Low'} confidence ({Math.round(ocrResult.confidence)}%)
                      </span>
                    </div>
                    {ocrResult.categoryConfidence === 'high' && (
                      <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-full flex items-center gap-1">
                        <Wand2 size={12} /> Auto-categorized
                      </span>
                    )}
                  </div>

                  {/* Extracted Fields Form */}
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    {/* Merchant Name */}
                    <div>
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1 block">
                        Merchant / Vendor
                      </label>
                      <input
                        type="text"
                        value={ocrResult.merchantName || ''}
                        onChange={e => setOCRResult(prev => prev ? { ...prev, merchantName: e.target.value } : prev)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/30"
                        placeholder="Enter merchant name"
                      />
                    </div>

                    {/* Amount & Date Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1 block">
                          Total Amount
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{settings.currencySymbol}</span>
                          <input
                            type="number"
                            step="0.01"
                            value={ocrResult.total ?? ''}
                            onChange={e => setOCRResult(prev => prev ? { ...prev, total: parseFloat(e.target.value) || null } : prev)}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/30"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1 block">
                          Date
                        </label>
                        <input
                          type="date"
                          value={ocrResult.date || new Date().toISOString().split('T')[0]}
                          onChange={e => setOCRResult(prev => prev ? { ...prev, date: e.target.value } : prev)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                      </div>
                    </div>

                    {/* Tax/Subtotal (collapsed by default) */}
                    {(ocrResult.subtotal || ocrResult.tax) && (
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                        {ocrResult.subtotal && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium">Subtotal:</span> {settings.currencySymbol}{ocrResult.subtotal.toFixed(2)}
                          </div>
                        )}
                        {ocrResult.tax && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium">Tax:</span> {settings.currencySymbol}{ocrResult.tax.toFixed(2)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Category Selection */}
                    <div className="pt-2">
                      <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                        Category {ocrResult.categoryConfidence === 'high' && <span className="text-emerald-500 normal-case">(suggested)</span>}
                      </label>
                      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                        {CATS_OUT.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setOCRResult(prev => prev ? { ...prev, suggestedCategory: cat } : prev)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              ocrResult.suggestedCategory === cat
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Raw Text Preview (Collapsible) */}
                  <details className="group">
                    <summary className="text-xs font-medium text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-2">
                      <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
                      View extracted text
                    </summary>
                    <div className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-400 max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {ocrResult.rawText || 'No text extracted'}
                    </div>
                  </details>
                </>
              )}

              {/* Loading State */}
              {isOCRProcessing && !pendingOCRImage && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 size={40} className="text-blue-500 animate-spin mb-4" />
                  <p className="text-slate-600 dark:text-slate-400 font-medium">{ocrProgress.status}</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              {!isOCRProcessing && ocrResult ? (
                <div className="flex gap-3">
                  <button
                    onClick={cancelOCRScan}
                    className="flex-1 py-3 font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => createTransactionFromOCR({
                      name: ocrResult.merchantName || undefined,
                      amount: ocrResult.total ?? undefined,
                      date: ocrResult.date || undefined,
                      category: ocrResult.suggestedCategory || undefined
                    })}
                    className="flex-1 py-3 font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={18} /> Create Expense
                  </button>
                </div>
              ) : (
                <button
                  onClick={cancelOCRScan}
                  className="w-full py-3 font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              )}
              
              {/* Privacy Notice */}
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-500">
                <Shield size={12} />
                <span>100% offline • Your data never leaves your device</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Receipt Full Screen Modal */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg h-full flex flex-col">
                <div className="flex items-center justify-between mb-4 text-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center"><Calendar size={18} /></div>
                        <div>
                            <div className="font-bold text-lg">Receipt View</div>
                            <div className="text-xs text-slate-400 flex items-center gap-2">{viewingReceipt.date} <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px]">Exports to Downloads</span></div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => { downloadReceiptToDevice(viewingReceipt.imageData); showToast("Downloaded to device", "success"); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><Download size={24} /></button>
                        <button onClick={() => setViewingReceipt(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={24} /></button>
                    </div>
                </div>
                <div className="flex-1 bg-black rounded-xl overflow-hidden relative border border-white/10 shadow-2xl mb-4 flex items-center justify-center">
                    <img src={viewingReceipt.imageData} alt="Receipt" className="max-w-full max-h-full object-contain" />
                </div>
                <button onClick={() => deleteReceipt(viewingReceipt.id)} className="w-full py-4 bg-red-600/90 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95">
                    <Trash2 size={20} /> Delete Receipt
                </button>
            </div>
        </div>
      )}

      {isPdfPreviewOpen && selectedInvoiceForDoc && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="relative w-full max-w-[800px] bg-white text-slate-900 shadow-2xl overflow-y-auto max-h-[90vh] rounded-lg">
                {/* Preview Header with Actions */}
                <div className="sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-3 sm:px-4 pb-3 sm:pb-4 pt-[calc(0.75rem+env(safe-area-inset-top))] flex justify-between items-center z-50">
                    <button 
                      onClick={() => setIsPdfPreviewOpen(false)} 
                      className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                    >
                      <ChevronLeft size={18} />
                      <span className="hidden sm:inline">Back to Edit</span>
                    </button>
                    <span className="font-bold text-sm text-gray-900 uppercase tracking-wider">Invoice Preview</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={shareInvoicePDF}
                        disabled={isGeneratingPdf}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-all ${isGeneratingPdf ? 'opacity-70 cursor-wait' : ''}`}
                      >
                        {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                        <span className="hidden sm:inline">{isGeneratingPdf ? 'Preparing...' : 'Share'}</span>
                      </button>

                      <button 
                        onClick={generateInvoicePDF}
                        disabled={isGeneratingPdf}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all ${isGeneratingPdf ? 'opacity-70 cursor-wait' : ''}`}
                      >
                        {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        <span className="hidden sm:inline">{isGeneratingPdf ? 'Generating...' : 'Download PDF'}</span>
                      </button>
                      <button onClick={() => setIsPdfPreviewOpen(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><X size={20} /></button>
                    </div>
                </div>
                {/* PDF Preview Content - Fixed text colors for readability */}
                <div id="visible-pdf-preview-content" className="p-4 sm:p-6 md:p-12 bg-white min-h-[1000px]">
                    {selectedInvoiceForDoc.status === 'void' && <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"><div className="transform -rotate-45 text-red-100 text-[150px] font-extrabold opacity-50 border-8 border-red-100 p-10 rounded-3xl">VOID</div></div>}
                    <div className={`flex ${settings.showLogoOnInvoice && settings.logoAlignment === 'center' ? 'flex-col items-center text-center' : 'flex-col sm:flex-row sm:justify-between items-start'} border-b border-gray-200 pb-8 mb-8 gap-6 z-10 relative`}>
                        <div className={`flex-1 ${settings.showLogoOnInvoice && settings.logoAlignment === 'center' ? 'w-full' : ''}`}>
                            {settings.showLogoOnInvoice && settings.businessLogo && <img src={settings.businessLogo} alt="Logo" className={`h-20 w-auto object-contain mb-4 ${settings.logoAlignment === 'center' ? 'mx-auto' : ''}`} />}
                            <h1 className="text-3xl font-extrabold uppercase tracking-tight text-gray-900 mb-2 font-brand">{settings.businessName}</h1>
                            <div className="text-sm text-gray-700 font-medium space-y-1">
                                <p>{settings.ownerName}</p>
                                {(settings.businessEmail || settings.businessPhone) && <p className={`flex flex-wrap gap-3 ${settings.logoAlignment === 'center' ? 'justify-center' : ''}`}>{settings.businessEmail && <span>{settings.businessEmail}</span>}{settings.businessPhone && <span>• {settings.businessPhone}</span>}</p>}
                                {settings.businessAddress && <p className="leading-tight pt-1">{settings.businessAddress}</p>}
                                {settings.businessWebsite && <p className="text-blue-600 pt-1" style={{ color: settings.brandColor }}>{settings.businessWebsite}</p>}
                            </div>
                        </div>
                        <div className={`text-left ${settings.showLogoOnInvoice && settings.logoAlignment === 'center' ? 'w-full mt-6 flex flex-col items-center' : 'w-full sm:w-auto text-left sm:text-right flex-1 mt-6 sm:mt-0'}`}>
                            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tighter mb-4 font-brand break-words" style={{ color: settings.brandColor || '#e2e8f0' }}>INVOICE</h2>
                            <div className={`space-y-2 ${settings.showLogoOnInvoice && settings.logoAlignment === 'center' ? 'w-full max-w-sm' : ''}`}>
                                <div className="flex justify-between md:justify-end gap-8"><span className="text-sm font-bold text-gray-600 uppercase tracking-wider">Invoice #</span><span className="text-sm font-bold text-gray-900">{selectedInvoiceForDoc.number || selectedInvoiceForDoc.id.substring(selectedInvoiceForDoc.id.length - 6).toUpperCase()}</span></div>
                                <div className="flex justify-between md:justify-end gap-8"><span className="text-sm font-bold text-gray-600 uppercase tracking-wider">Date</span><span className="text-sm font-bold text-gray-900">{selectedInvoiceForDoc.date}</span></div>
                                <div className="flex justify-between md:justify-end gap-8"><span className="text-sm font-bold text-gray-600 uppercase tracking-wider">Due</span><span className="text-sm font-bold text-gray-900">{selectedInvoiceForDoc.due}</span></div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 mb-12 z-10 relative">
                        <div className="flex-1">
                            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Bill To</h3>
                            <div className="text-lg font-bold text-gray-900">{selectedInvoiceForDoc.client}</div>
                            {selectedInvoiceForDoc.clientCompany && selectedInvoiceForDoc.clientCompany !== selectedInvoiceForDoc.client && <div className="text-base font-semibold text-gray-800 mt-0.5">{selectedInvoiceForDoc.clientCompany}</div>}
                            <div className="text-sm text-gray-700 mt-1 space-y-0.5">{selectedInvoiceForDoc.clientEmail && <div>{selectedInvoiceForDoc.clientEmail}</div>}{selectedInvoiceForDoc.clientAddress && <div className="whitespace-pre-line">{selectedInvoiceForDoc.clientAddress}</div>}</div>
                        </div>
                        {(selectedInvoiceForDoc.poNumber || settings.businessTaxId) && (
                            <div className="flex-1 text-right">
                                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Details</h3>
                                {selectedInvoiceForDoc.poNumber && <div className="mb-2"><span className="text-xs font-bold text-gray-600 block">PO Number</span><span className="text-sm font-bold text-gray-900">{selectedInvoiceForDoc.poNumber}</span></div>}
                                {settings.businessTaxId && <div><span className="text-xs font-bold text-gray-600 block">Tax ID / VAT</span><span className="text-sm font-bold text-gray-900">{settings.businessTaxId}</span></div>}
                            </div>
                        )}
                    </div>
                    <div className="mb-8 z-10 relative">
                        <div className="grid grid-cols-12 gap-4 border-b-2 pb-3 mb-4" style={{ borderColor: settings.brandColor || '#0f172a' }}>
                            <div className="col-span-6 text-xs font-bold text-gray-900 uppercase tracking-wider">Description</div>
                            <div className="col-span-2 text-right text-xs font-bold text-gray-900 uppercase tracking-wider">Qty</div>
                            <div className="col-span-2 text-right text-xs font-bold text-gray-900 uppercase tracking-wider">Rate</div>
                            <div className="col-span-2 text-right text-xs font-bold text-gray-900 uppercase tracking-wider">Amount</div>
                        </div>
                        <div className="space-y-4">
                            {(selectedInvoiceForDoc.items || []).map((item, idx) => (
                                <div key={item.id || idx} className="border-b border-gray-200 pb-3 grid grid-cols-12 gap-4 items-start">
                                    <div className="col-span-6"><span className="font-bold text-gray-800 text-sm block">{item.description}</span></div>
                                    <div className="col-span-2 text-right text-sm font-semibold text-gray-700">{item.quantity}</div>
                                    <div className="col-span-2 text-right text-sm font-semibold text-gray-700">{formatCurrency.format(item.rate)}</div>
                                    <div className="col-span-2 text-right text-sm font-bold text-gray-900">{formatCurrency.format(item.quantity * item.rate)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end mt-4 mb-12 z-10 relative">
                        <div className="w-full sm:w-5/12 space-y-3">
                            <div className="flex justify-between text-sm"><span className="font-bold text-gray-700">Subtotal</span><span className="font-bold text-gray-900">{formatCurrency.format(selectedInvoiceForDoc.subtotal || selectedInvoiceForDoc.amount)}</span></div>
                            {selectedInvoiceForDoc.discount ? (<div className="flex justify-between text-sm text-emerald-600"><span className="font-bold">Discount</span><span className="font-bold">-{formatCurrency.format(selectedInvoiceForDoc.discount)}</span></div>) : null}
                            {selectedInvoiceForDoc.taxRate ? (<div className="flex justify-between text-sm"><span className="font-bold text-gray-700">Tax ({selectedInvoiceForDoc.taxRate}%)</span><span className="font-bold text-gray-900">{formatCurrency.format(((selectedInvoiceForDoc.subtotal || 0) - (selectedInvoiceForDoc.discount || 0)) * (selectedInvoiceForDoc.taxRate / 100))}</span></div>) : null}
                            {selectedInvoiceForDoc.shipping ? (<div className="flex justify-between text-sm"><span className="font-bold text-gray-700">Shipping</span><span className="font-bold text-gray-900">{formatCurrency.format(selectedInvoiceForDoc.shipping)}</span></div>) : null}
                            <div className="h-px bg-gray-900 my-2"></div>
                            <div className="flex justify-between items-end"><span className="font-extrabold text-base text-gray-900 uppercase tracking-wider">Total</span><span className="font-extrabold text-xl text-gray-900">{formatCurrency.format(selectedInvoiceForDoc.amount)}</span></div>
                            {selectedInvoiceForDoc.status === 'paid' && <div className="flex justify-between items-center text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded mt-2"><span className="font-bold text-sm uppercase">Amount Paid</span><span className="font-bold">{formatCurrency.format(selectedInvoiceForDoc.amount)}</span></div>}
                        </div>
                    </div>
                    <div className="mt-auto z-10 relative">
                        <div className="grid grid-cols-2 gap-8 border-t border-gray-200 pt-8">
                            <div>{selectedInvoiceForDoc.notes && (<><h4 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Notes</h4><p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedInvoiceForDoc.notes}</p></>)}</div>
                            <div>{(selectedInvoiceForDoc.terms || settings.payPrefs.length > 0) && (<><h4 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Terms & Payment</h4>{selectedInvoiceForDoc.terms && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-3">{selectedInvoiceForDoc.terms}</p>}{settings.payPrefs.length > 0 && (<div className="text-xs font-bold text-gray-700 bg-gray-100 p-3 rounded inline-block w-full">Accepted Methods: {settings.payPrefs.join(', ')}</div>)}</>)}</div>
                        </div>
                        <div className="mt-12 text-center text-xs text-gray-500 font-bold uppercase tracking-widest">Thank you for your business</div>
                    </div>
                </div>
            </div>
        </div>

      )}

      {isEstimatePdfPreviewOpen && selectedEstimateForDoc && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="relative w-full max-w-[800px] bg-white text-slate-900 shadow-2xl overflow-y-auto max-h-[90vh] rounded-lg">
                {/* Preview Header with Actions */}
                <div className="sticky top-0 left-0 right-0 bg-white border-b border-gray-200 px-3 sm:px-4 pb-3 sm:pb-4 pt-[calc(0.75rem+env(safe-area-inset-top))] flex justify-between items-center z-50">
                    <button 
                      onClick={() => setIsEstimatePdfPreviewOpen(false)} 
                      className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                    >
                      <ChevronLeft size={18} />
                      <span className="hidden sm:inline">Back to Edit</span>
                    </button>
                    <span className="font-bold text-sm text-gray-900 uppercase tracking-wider">Estimate Preview</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={shareEstimatePDF}
                        disabled={isGeneratingEstimatePdf}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-all ${isGeneratingEstimatePdf ? 'opacity-70 cursor-wait' : ''}`}
                      >
                        {isGeneratingEstimatePdf ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                        <span className="hidden sm:inline">{isGeneratingEstimatePdf ? 'Preparing...' : 'Share'}</span>
                      </button>

                      <button 
                        onClick={generateEstimatePDF}
                        disabled={isGeneratingEstimatePdf}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all ${isGeneratingEstimatePdf ? 'opacity-70 cursor-wait' : ''}`}
                      >
                        {isGeneratingEstimatePdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        <span className="hidden sm:inline">{isGeneratingEstimatePdf ? 'Generating...' : 'Download PDF'}</span>
                      </button>
                      <button onClick={() => setIsEstimatePdfPreviewOpen(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><X size={20} /></button>
                    </div>
                </div>
                {/* PDF Preview Content - Fixed text colors for readability */}
                <div id="visible-estimate-pdf-preview-content" className="p-4 sm:p-6 md:p-12 bg-white min-h-[1000px]">
                    {selectedEstimateForDoc.status === 'void' && <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"><div className="transform -rotate-45 text-red-100 text-[150px] font-extrabold opacity-50 border-8 border-red-100 p-10 rounded-3xl">VOID</div></div>}
                    
                    {/* Header with Business Info */}
                    <div className={`flex ${settings.showLogoOnInvoice && settings.logoAlignment === 'center' ? 'flex-col items-center text-center' : 'flex-col sm:flex-row sm:justify-between items-start'} border-b border-gray-200 pb-8 mb-8 gap-6 z-10 relative`}>
                        <div className={`flex-1 ${settings.showLogoOnInvoice && settings.logoAlignment === 'center' ? 'w-full' : ''}`}>
                            {settings.showLogoOnInvoice && settings.businessLogo && <img src={settings.businessLogo} alt="Logo" className={`h-20 w-auto object-contain mb-4 ${settings.logoAlignment === 'center' ? 'mx-auto' : ''}`} />}
                            <h1 className="text-3xl font-extrabold uppercase tracking-tight text-gray-900 mb-2 font-brand">{settings.businessName}</h1>
                            <div className="text-sm text-gray-700 font-medium space-y-1">
                                <p>{settings.ownerName}</p>
                                {(settings.businessEmail || settings.businessPhone) && <p className={`flex flex-wrap gap-3 ${settings.logoAlignment === 'center' ? 'justify-center' : ''}`}>{settings.businessEmail && <span>{settings.businessEmail}</span>}{settings.businessPhone && <span>• {settings.businessPhone}</span>}</p>}
                                {settings.businessAddress && <p className="leading-tight pt-1">{settings.businessAddress}</p>}
                                {settings.businessWebsite && <p className="text-blue-600 pt-1" style={{ color: settings.brandColor }}>{settings.businessWebsite}</p>}
                            </div>
                        </div>
                        <div className={`text-left ${settings.showLogoOnInvoice && settings.logoAlignment === 'center' ? 'w-full mt-6 flex flex-col items-center' : 'w-full sm:w-auto text-left sm:text-right flex-1 mt-6 sm:mt-0'}`}>
                            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tighter mb-4 font-brand break-words" style={{ color: settings.brandColor || '#e2e8f0' }}>ESTIMATE</h2>
                            <div className={`space-y-2 ${settings.showLogoOnInvoice && settings.logoAlignment === 'center' ? 'w-full max-w-sm' : ''}`}>
                                <div className="flex justify-between md:justify-end gap-8"><span className="text-sm font-bold text-gray-600 uppercase tracking-wider">Estimate #</span><span className="text-sm font-bold text-gray-900">{selectedEstimateForDoc.number || selectedEstimateForDoc.id.substring(selectedEstimateForDoc.id.length - 6).toUpperCase()}</span></div>
                                <div className="flex justify-between md:justify-end gap-8"><span className="text-sm font-bold text-gray-600 uppercase tracking-wider">Date</span><span className="text-sm font-bold text-gray-900">{selectedEstimateForDoc.date}</span></div>
                                <div className="flex justify-between md:justify-end gap-8"><span className="text-sm font-bold text-gray-600 uppercase tracking-wider">Valid Until</span><span className="text-sm font-bold text-gray-900">{selectedEstimateForDoc.validUntil || ''}</span></div>
                                {(selectedEstimateForDoc as any).timeline && <div className="flex justify-between md:justify-end gap-8"><span className="text-sm font-bold text-gray-600 uppercase tracking-wider">Timeline</span><span className="text-sm font-bold text-gray-900">{(selectedEstimateForDoc as any).timeline}</span></div>}
                            </div>
                        </div>
                    </div>

                    {/* Project Title */}
                    {(selectedEstimateForDoc as any).projectTitle && (
                      <div className="mb-8 z-10 relative">
                        <div className="bg-gray-50 rounded-lg p-6 border-l-4" style={{ borderColor: settings.brandColor || '#3b82f6' }}>
                          <h3 className="text-2xl font-bold text-gray-900 mb-1">{(selectedEstimateForDoc as any).projectTitle}</h3>
                          {selectedEstimateForDoc.description && <p className="text-gray-700">{selectedEstimateForDoc.description}</p>}
                        </div>
                      </div>
                    )}

                    {/* Client Info */}
                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 mb-8 z-10 relative">
                        <div className="flex-1">
                            <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Prepared For</h3>
                            <div className="text-lg font-bold text-gray-900">{selectedEstimateForDoc.client}</div>
                            {selectedEstimateForDoc.clientCompany && selectedEstimateForDoc.clientCompany !== selectedEstimateForDoc.client && <div className="text-base font-semibold text-gray-800 mt-0.5">{selectedEstimateForDoc.clientCompany}</div>}
                            <div className="text-sm text-gray-700 mt-1 space-y-0.5">
                              {selectedEstimateForDoc.clientEmail && <div>{selectedEstimateForDoc.clientEmail}</div>}
                              {(selectedEstimateForDoc as any).clientPhone && <div>{(selectedEstimateForDoc as any).clientPhone}</div>}
                              {selectedEstimateForDoc.clientAddress && <div className="whitespace-pre-line">{selectedEstimateForDoc.clientAddress}</div>}
                            </div>
                        </div>
                        {(selectedEstimateForDoc.poNumber || settings.businessTaxId) && (
                            <div className="flex-1 text-right">
                                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Reference</h3>
                                {selectedEstimateForDoc.poNumber && <div className="mb-2"><span className="text-xs font-bold text-gray-600 block">Client Ref / PO</span><span className="text-sm font-bold text-gray-900">{selectedEstimateForDoc.poNumber}</span></div>}
                                {settings.businessTaxId && <div><span className="text-xs font-bold text-gray-600 block">Tax ID / VAT</span><span className="text-sm font-bold text-gray-900">{settings.businessTaxId}</span></div>}
                            </div>
                        )}
                    </div>

                    {/* Scope of Work */}
                    {(selectedEstimateForDoc as any).scopeOfWork && (
                      <div className="mb-8 z-10 relative">
                        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Scope of Work</h3>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{(selectedEstimateForDoc as any).scopeOfWork}</p>
                        </div>
                      </div>
                    )}

                    {/* Line Items Table */}
                    <div className="mb-8 z-10 relative">
                        <div className="grid grid-cols-12 gap-4 border-b-2 pb-3 mb-4" style={{ borderColor: settings.brandColor || '#0f172a' }}>
                            <div className="col-span-6 text-xs font-bold text-gray-900 uppercase tracking-wider">Description</div>
                            <div className="col-span-2 text-right text-xs font-bold text-gray-900 uppercase tracking-wider">Qty</div>
                            <div className="col-span-2 text-right text-xs font-bold text-gray-900 uppercase tracking-wider">Rate</div>
                            <div className="col-span-2 text-right text-xs font-bold text-gray-900 uppercase tracking-wider">Amount</div>
                        </div>
                        <div className="space-y-4">
                            {(selectedEstimateForDoc.items || []).map((item, idx) => (
                                <div key={item.id || idx} className="border-b border-gray-200 pb-3 grid grid-cols-12 gap-4 items-start">
                                    <div className="col-span-6"><span className="font-bold text-gray-800 text-sm block">{item.description}</span></div>
                                    <div className="col-span-2 text-right text-sm font-semibold text-gray-700">{item.quantity}</div>
                                    <div className="col-span-2 text-right text-sm font-semibold text-gray-700">{formatCurrency.format(item.rate)}</div>
                                    <div className="col-span-2 text-right text-sm font-bold text-gray-900">{formatCurrency.format(item.quantity * item.rate)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end mt-4 mb-8 z-10 relative">
                        <div className="w-full sm:w-5/12 space-y-3">
                            <div className="flex justify-between text-sm"><span className="font-bold text-gray-700">Subtotal</span><span className="font-bold text-gray-900">{formatCurrency.format(selectedEstimateForDoc.subtotal || selectedEstimateForDoc.amount)}</span></div>
                            {selectedEstimateForDoc.discount ? (<div className="flex justify-between text-sm text-emerald-600"><span className="font-bold">Discount</span><span className="font-bold">-{formatCurrency.format(selectedEstimateForDoc.discount)}</span></div>) : null}
                            {selectedEstimateForDoc.taxRate ? (<div className="flex justify-between text-sm"><span className="font-bold text-gray-700">Tax ({selectedEstimateForDoc.taxRate}%)</span><span className="font-bold text-gray-900">{formatCurrency.format(((selectedEstimateForDoc.subtotal || 0) - (selectedEstimateForDoc.discount || 0)) * (selectedEstimateForDoc.taxRate / 100))}</span></div>) : null}
                            <div className="h-px bg-gray-900 my-2"></div>
                            <div className="flex justify-between items-end"><span className="font-extrabold text-base text-gray-900 uppercase tracking-wider">Estimated Total</span><span className="font-extrabold text-xl text-gray-900">{formatCurrency.format(selectedEstimateForDoc.amount)}</span></div>
                        </div>
                    </div>

                    {/* Exclusions */}
                    {(selectedEstimateForDoc as any).exclusions && (
                      <div className="mb-8 z-10 relative" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                        <h4 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Not Included in This Estimate</h4>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                          <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">{(selectedEstimateForDoc as any).exclusions}</p>
                        </div>
                      </div>
                    )}

                    {/* Notes, Terms, and Acceptance */}
                    <div className="mt-auto z-10 relative" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-gray-200 pt-8">
                            <div>
                              {selectedEstimateForDoc.notes && (
                                <>
                                  <h4 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Notes</h4>
                                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selectedEstimateForDoc.notes}</p>
                                </>
                              )}
                            </div>
                            <div>
                              {selectedEstimateForDoc.terms && (
                                <>
                                  <h4 className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">Terms & Conditions</h4>
                                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-3">{selectedEstimateForDoc.terms}</p>
                                </>
                              )}
                            </div>
                        </div>

                        {/* How to Accept */}
                        {(selectedEstimateForDoc as any).acceptanceTerms && (
                          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6 text-center" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                            <h4 className="text-sm font-bold text-blue-900 uppercase tracking-wider mb-2">How to Accept This Estimate</h4>
                            <p className="text-blue-800">{(selectedEstimateForDoc as any).acceptanceTerms}</p>
                          </div>
                        )}

                        {/* Signature Line (optional for printed versions) */}
                        <div className="mt-12 pt-8 border-t border-gray-300" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                          <div className="grid grid-cols-2 gap-12">
                            <div>
                              <div className="border-b border-gray-400 pb-8 mb-2"></div>
                              <p className="text-xs text-gray-600 font-bold uppercase tracking-wider">Client Signature</p>
                            </div>
                            <div>
                              <div className="border-b border-gray-400 pb-8 mb-2"></div>
                              <p className="text-xs text-gray-600 font-bold uppercase tracking-wider">Date</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-12 text-center text-xs text-gray-500 font-bold uppercase tracking-widest">Thank you for considering our services</div>
                    </div>
                </div>
            </div>
        </div>
      )}

      <ToastContainer notifications={notifications} remove={removeToast} />


      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl p-6 shadow-2xl border border-red-500/20">
                <div className="flex items-center gap-4 mb-4 text-red-600 dark:text-red-500">
                   <div className="bg-red-100 dark:bg-red-500/10 p-3 rounded-full"><AlertTriangle size={24} strokeWidth={2} /></div>
                   <h3 className="text-lg sm:text-xl font-bold">System Reset</h3>
                </div>
                <p className="text-slate-600 dark:text-slate-300 mb-6 font-medium leading-relaxed">Are you sure you want to delete <span className="text-slate-900 dark:text-white font-bold">all transactions and invoices</span>? This action cannot be undone.</p>
                <div className="flex gap-3">
                   <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                   <button onClick={performReset} className="flex-1 py-3 font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-lg shadow-red-500/20 transition-colors">Yes, Delete All</button>
                </div>
            </div>
        </div>
      )}

      {/* NEW: Delete Invoice Confirmation Modal */}
      {invoiceToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3 mb-4 text-slate-900 dark:text-white">
                    <div className="bg-red-100 dark:bg-red-500/10 p-3 rounded-full text-red-600 dark:text-red-500">
                        <Trash2 size={20} strokeWidth={2} />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold">Delete invoice?</h3>
                </div>
                <p className="text-slate-600 dark:text-slate-300 mb-6 font-medium leading-relaxed">This will permanently delete this invoice and cannot be undone.</p>
                <div className="flex gap-3">
                   <button onClick={() => setInvoiceToDelete(null)} className="flex-1 py-3 font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                   <button onClick={confirmDeleteInvoice} className="flex-1 py-3 font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-lg shadow-red-500/20 transition-colors">Delete</button>
                </div>
            </div>
        </div>
      )}

      {/* NEW: Restore Backup Confirmation Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl p-6 shadow-2xl border border-blue-500/20">
                <div className="flex items-center gap-4 mb-4 text-blue-600 dark:text-blue-400">
                    <div className="bg-blue-100 dark:bg-blue-500/10 p-3 rounded-full"><RotateCcw size={24} strokeWidth={2} /></div>
                    <h3 className="text-lg sm:text-xl font-bold">Restore Backup?</h3>
                </div>
                <p className="text-slate-600 dark:text-slate-300 mb-6 font-medium leading-relaxed">
                    This will <span className="text-slate-900 dark:text-white font-bold">replace all current data</span> with the backup from <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">{pendingBackupData?.metadata?.timestamp?.split('T')[0] || 'Unknown Date'}</span>.
                </p>
                <div className="flex gap-3">
                    <button onClick={() => { setShowRestoreModal(false); setPendingBackupData(null); }} className="flex-1 py-3 font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button>
                    <button onClick={performRestore} className="flex-1 py-3 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/20 transition-colors">Restore Data</button>
                </div>
            </div>
        </div>
      )}

      <header 
        className={`no-print flex items-center justify-between px-4 sm:px-6 md:px-8 pb-4 sm:pb-6 sticky top-0 bg-slatebg/90 dark:bg-slate-950/90 backdrop-blur-xl z-50 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300`}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
      >
        <Logo onClick={() => setCurrentPage(Page.Dashboard)} />
        <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
           <button onClick={toggleTheme} className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-all shadow-md">{theme === 'dark' ? <Sun size={18} className="sm:w-5 sm:h-5" strokeWidth={1.2} /> : <Moon size={18} className="sm:w-5 sm:h-5" strokeWidth={1.2} />}</button>
           <button
             onClick={() => setShowInsights(true)}
             className="relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-purple-600 transition-all shadow-md"
             title="Insights"
           >
             <BrainCircuit size={18} className="sm:w-5 sm:h-5" strokeWidth={1.2} />
             {insightsBadgeCount > 0 && (
               <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-purple-600 text-white text-[10px] sm:text-xs font-bold rounded-full flex items-center justify-center">
                 {Math.min(9, insightsBadgeCount)}
               </span>
             )}
           </button>
           <button onClick={() => setCurrentPage(Page.Settings)} className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-950 transition-all shadow-md"><Settings size={18} className="sm:w-5 sm:h-5" strokeWidth={1.2} /></button>
        </div>
      </header>

      <div ref={mainScrollRef} className="flex-1 overflow-y-auto pb-44 px-6 md:px-8 no-print custom-scrollbar" role="main">

      <PageErrorBoundary key={currentPage} onReset={() => setCurrentPage(Page.Dashboard)}>

        {(currentPage === Page.Dashboard) && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white dark:bg-gradient-to-br dark:from-blue-800 dark:to-indigo-950 p-6 sm:p-8 rounded-xl shadow-xl dark:shadow-none border border-slate-200 dark:border-white/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-80 h-80 bg-slate-100/50 dark:bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-slate-200/50 transition-colors duration-700 pointer-events-none" />

              <div className="flex flex-col gap-4 mb-4">
                {/* Header - Larger Typography */}
                <div className="relative z-10">
                  <h2 className="text-base sm:text-lg font-extrabold tracking-wide uppercase font-brand mb-1" style={{ color: 'var(--text-primary)' }}>
                    Net Profit <span className="text-blue-600 dark:text-blue-300">({homeTotals.label})</span>
                  </h2>
                  <p className="text-sm sm:text-base font-semibold tracking-wide" style={{ color: 'var(--text-secondary)' }}>{homeTotals.rangeText}</p>
                </div>

                {/* Redesigned Period Selector - User Friendly */}
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2 bg-slate-100/80 dark:bg-white/10 p-1.5 sm:p-2 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow-sm">
                  {(['ytd', 'mtd', '30d', 'all'] as HomeKpiPeriod[]).map(p => {
                    const isActive = homeKpiPeriod === p;
                    const labels: Record<HomeKpiPeriod, { short: string; full: string }> = {
                      'ytd': { short: 'Year', full: 'This Year' },
                      'mtd': { short: 'Month', full: 'This Month' },
                      '30d': { short: '30 Days', full: '30 Days' },
                      'all': { short: 'All', full: 'All Time' }
                    };
                    return (
                      <button
                        key={p}
                        onClick={() => setHomeKpiPeriod(p)}
                        className={`relative flex flex-col items-center justify-center min-h-[48px] sm:min-h-[52px] px-2 py-2 rounded-xl transition-all duration-200 ${
                          isActive 
                            ? 'bg-white dark:bg-slate-900/90 shadow-lg shadow-blue-500/10 dark:shadow-black/30 ring-1 ring-blue-500/20 dark:ring-white/20' 
                            : 'hover:bg-white/50 dark:hover:bg-white/5 active:scale-95'
                        }`}
                      >
                        <span 
                          className={`text-[13px] sm:text-sm font-bold leading-tight text-center transition-colors ${
                            isActive 
                              ? 'text-blue-600 dark:text-white' 
                              : ''
                          }`}
                          style={{ 
                            fontVariantNumeric: 'tabular-nums',
                            color: isActive ? undefined : 'var(--tab-inactive)'
                          }}
                        >
                          {labels[p].short}
                        </span>
                        {isActive && (
                          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-6 h-1 bg-blue-500 dark:bg-blue-400 rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="text-4xl font-extrabold tracking-tighter mb-6 text-slate-950 dark:text-white font-brand">{formatCurrency.format(homeTotals.profit)}</div>

              <div className="grid grid-cols-1 gap-2">
                <div className="bg-slate-50 dark:bg-white/10 backdrop-blur-md px-4 py-3 rounded-lg border border-slate-200 dark:border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-300"><TrendingUp size={18} strokeWidth={2.5} /><span className="text-sm font-bold uppercase tracking-wide">In</span></div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency.format(homeTotals.income)}</div>
                </div>
                <div className="bg-slate-50 dark:bg-white/10 backdrop-blur-md px-4 py-3 rounded-lg border border-slate-200 dark:border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-300"><TrendingDown size={18} strokeWidth={2.5} /><span className="text-sm font-bold uppercase tracking-wide">Out</span></div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency.format(homeTotals.expense)}</div>
                </div>
              </div>
            </div>

            <div
                className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-lg rounded-3xl p-6 relative overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all"
                onClick={() => {
                  const mode = totals.overdueCount > 0 ? 'overdue' : totals.pendingCount > 0 ? 'unpaid' : 'all';
                  setInvoiceQuickFilter(mode);
                  setCurrentPage(Page.Invoices);
                }}
              >
                <div className="text-center">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
                      totals.overdueCount > 0
                        ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300'
                        : totals.pendingCount > 0
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    }`}
                  >
                    {totals.overdueCount > 0 ? <AlertTriangle size={24} /> : totals.pendingCount > 0 ? <Clock3 size={24} /> : <CheckCircle size={24} />}
                  </div>

                  <div
                    className={`text-4xl font-extrabold tracking-tight mb-2 ${
                      totals.overdueCount > 0
                        ? 'text-red-600 dark:text-red-300'
                        : totals.pendingCount > 0
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {formatCurrency.format(totals.overdueCount > 0 ? totals.overdueAmount : totals.pendingAmount)}
                  </div>

                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {totals.overdueCount > 0 ? 'Overdue Invoices' : totals.pendingCount > 0 ? 'Unpaid Invoices' : 'All invoices paid'}
                  </div>

                  <div
                    className={`inline-flex mt-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      totals.overdueCount > 0
                        ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                        : totals.pendingCount > 0
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                    }`}
                  >
                    {totals.overdueCount > 0 ? `${totals.overdueCount} overdue` : totals.pendingCount > 0 ? `${totals.pendingCount} unpaid` : 'Great job'}
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold mt-3">Tap to open invoices</div>
                </div>
              </div>

            {/* Sales Pipeline Widget */}
            {(pipelineStats.totalEstimates > 0 || pipelineStats.pipelineValue > 0) && (
              <div
                className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-lg rounded-3xl p-6 relative overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all"
                onClick={() => {
                  setBillingDocType('estimate');
                  setCurrentPage(Page.Invoices);
                }}
              >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/10 dark:bg-purple-400/10 rounded-full blur-2xl pointer-events-none" />
                
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                      <Briefcase size={20} strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">Sales Pipeline</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300">Estimates & Proposals</p>
                    </div>
                  </div>
                  {pipelineStats.conversionRate > 0 && (
                    <div className="text-right">
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{pipelineStats.conversionRate.toFixed(0)}%</div>
                      <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Win Rate</div>
                    </div>
                  )}
                </div>

                {/* Pipeline Value */}
                {pipelineStats.pipelineValue > 0 && (
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl p-4 mb-5 border border-purple-100 dark:border-purple-800/30">
                    <div className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Pipeline Value</div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{formatCurrency.format(pipelineStats.pipelineValue)}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      {pipelineStats.draft.count} draft{pipelineStats.draft.count !== 1 ? 's' : ''} + {pipelineStats.sent.count} awaiting response
                    </div>
                  </div>
                )}

                {/* Stage Breakdown */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-lg font-bold text-slate-600 dark:text-slate-300">{pipelineStats.draft.count}</div>
                    <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Draft</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{pipelineStats.sent.count}</div>
                    <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Sent</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{pipelineStats.accepted.count}</div>
                    <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Won</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <div className="text-lg font-bold text-red-500 dark:text-red-400">{pipelineStats.declined.count}</div>
                    <div className="text-[10px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wider">Lost</div>
                  </div>
                </div>

                {/* Follow-up Alerts - Detailed */}
                {pipelineStats.needsFollowUp > 0 && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider">
                      <Clock3 size={14} />
                      Follow-ups Due ({pipelineStats.needsFollowUp})
                    </div>
                    {pipelineStats.overdueFollowUps.slice(0, 3).map((est: Estimate) => (
                      <div 
                        key={est.id} 
                        className="flex items-center justify-between gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBillingDocType('estimate');
                          setCurrentPage(Page.Invoices);
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-orange-900 dark:text-orange-200">{est.client}</div>
                          <div className="text-xs text-orange-700 dark:text-orange-400 leading-relaxed">
                            <span>{formatCurrency.format(est.amount)}</span>
                            <span> • Due</span>
                            <br />
                            <span>{est.followUpDate || 'now'}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); recordFollowUp(est, 7); }}
                            className="px-3 py-2 rounded-md text-xs font-bold bg-white dark:bg-slate-800 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-slate-700 transition-all border border-orange-200/50 dark:border-orange-800/50"
                            title="Record follow-up, set next in 7 days"
                          >
                            Done
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); snoozeFollowUp(est, 3); }}
                            className="px-3 py-2 rounded-md text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200/50 dark:border-slate-700/50"
                            title="Snooze 3 days"
                          >
                            +3d
                          </button>
                        </div>
                      </div>
                    ))}
                    {pipelineStats.needsFollowUp > 3 && (
                      <div className="text-xs text-center text-orange-600 dark:text-orange-400 font-medium">
                        +{pipelineStats.needsFollowUp - 3} more needing attention
                      </div>
                    )}
                  </div>
                )}

                {/* Upcoming Follow-ups */}
                {pipelineStats.upcomingFollowUps.length > 0 && pipelineStats.needsFollowUp === 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 mb-4">
                    <Calendar size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-blue-800 dark:text-blue-300">
                        {pipelineStats.upcomingFollowUps.length} follow-up{pipelineStats.upcomingFollowUps.length !== 1 ? 's' : ''} coming up
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">In the next 3 days</div>
                    </div>
                  </div>
                )}

                {/* Won Revenue */}
                {pipelineStats.accepted.amount > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Revenue Won (All Time)</div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency.format(pipelineStats.accepted.amount)}</div>
                  </div>
                )}

                <div className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold mt-4 text-center">Tap to view estimates</div>
              </div>
            )}
            
            <div>
              <div className="flex items-center justify-between mb-4 pl-2">
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest font-brand">Recent Activity</h3>
                <button onClick={() => setCurrentPage(Page.AllTransactions)} className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors uppercase">See all</button>
              </div>
              <div className="space-y-3">
                {transactions.length === 0 ? <EmptyState icon={<Sparkles size={24} />} title="No activity yet" subtitle="Your latest transactions will appear here once you start recording." action={() => handleOpenFAB('income')} actionLabel="Add Transaction" /> :
                  transactions.slice().sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map(t => (
                    <div key={t.id} className="group flex items-center justify-between p-5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500/30 hover:shadow-lg transition-all cursor-pointer shadow-sm relative z-10" onClick={() => handleEditItem(t)}>
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${t.type === 'income' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>{t.type === 'income' ? <ArrowRight size={18} className="-rotate-45" strokeWidth={2.5} /> : <ArrowRight size={18} className="rotate-45" strokeWidth={2.5} />}</div>
                        <div className="min-w-0 pr-2">
                          <div className="text-base font-bold text-slate-900 dark:text-white truncate">{t.name}</div>
                          <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-0.5 truncate">{t.category}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                         <div className={`text-base font-bold whitespace-nowrap ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>{t.type === 'income' ? '+' : ''}{formatCurrency.format(t.amount)}</div>
                         <div className="text-left md:text-right mt-1"><div className="text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{t.date}</div></div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            <div onClick={() => { setScrollToTaxSnapshot(true); setCurrentPage(Page.Reports); }} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-800 cursor-pointer active:scale-95 transition-all hover:shadow-lg hover:border-emerald-500/30 group">
               <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400"><Calculator size={20} /><span className="text-xs font-bold uppercase tracking-widest font-brand">Tax Snapshot</span></div>
                  <ArrowRight size={18} className="text-slate-300 dark:text-slate-300 -rotate-45 group-hover:rotate-0 group-hover:text-emerald-500 transition-all duration-300"/>
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                  <div><div className="text-xs text-slate-600 dark:text-slate-300 uppercase tracking-wider font-bold mb-1">Estimated Tax (YTD)</div><div className="text-2xl font-extrabold font-brand text-slate-900 dark:text-white">{formatCurrency.format(reportData.totalEstimatedTax)}</div></div>
                  <div><div className="text-xs text-slate-600 dark:text-slate-300 uppercase tracking-wider font-bold mb-1">YTD Net Profit</div><div className="text-2xl font-bold text-slate-600 dark:text-slate-200">{formatCurrency.format(reportData.ytdNetProfit)}</div></div>
               </div>
               <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Next Deadline: <span className="text-emerald-600 dark:text-emerald-400">{getNextEstimatedTaxDeadline().date}</span> — {getNextEstimatedTaxDeadline().days} days left</div>
                  <div onClick={(e) => { e.stopPropagation(); setCurrentPage(Page.Reports); setTimeout(() => { setScrollToTaxSnapshot(true); handleOpenTaxDrawer(); }, 100); }} className="text-xs font-bold text-blue-500 hover:underline uppercase tracking-wider cursor-pointer">Log Payment</div>
               </div>
            </div>

            {/* Smart Receipt Scanner Section */}
            <div>
              <div className="flex items-center justify-between mb-4 pl-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-200 uppercase tracking-[0.10em] font-brand">Receipts</h3>
                  <span className="px-2 py-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[9px] font-bold uppercase tracking-wider rounded-full">OCR</span>
                </div>
              </div>
              <div className="flex overflow-x-auto gap-3 pb-4 pt-1 px-1 -mx-1 custom-scrollbar snap-x">
                {/* Smart Scan Button with OCR */}
                <button onClick={() => scanInputRef.current?.click()} className="flex-shrink-0 w-28 h-28 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex flex-col items-center justify-center gap-2 hover:from-blue-600 hover:to-indigo-700 transition-all border border-blue-400/30 active:scale-95 snap-start shadow-lg shadow-blue-500/20 group">
                   <div className="bg-white/20 p-3 rounded-full group-hover:scale-110 transition-transform">
                     <ScanLine size={24} className="text-white" />
                   </div>
                   <div className="text-center">
                     <span className="text-xs font-bold text-white block">Smart Scan</span>
                     <span className="text-[9px] text-blue-100 opacity-80">Auto-extract</span>
                   </div>
                </button>
                <input type="file" ref={scanInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleScanReceipt} />
                
                {receipts.map(r => (
                   <div key={r.id} onClick={() => setViewingReceipt(r)} className="flex-shrink-0 w-24 h-24 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative cursor-pointer shadow-sm group active:scale-95 transition-transform snap-start">
                      <img src={r.imageData} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Eye className="text-white drop-shadow-md" size={20} />
                      </div>
                   </div>
                ))}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium text-center mt-2 flex items-center justify-center gap-2">
                <Shield size={10} />
                <span>100% Offline OCR • No cloud required</span>
              </div>
            </div>
          </div>
        )}

        {(currentPage === Page.Income || currentPage === Page.Expenses || (currentPage === Page.AllTransactions || currentPage === Page.Ledger)) && (
           <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
             <div className="flex items-center justify-between mb-2 pl-2">
                 <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                     <div className="flex items-center gap-2 sm:gap-3">
                       <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${currentPage === Page.Income ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : currentPage === Page.Expenses ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-500' : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'}`}>{currentPage === Page.Income ? <TrendingUp size={20} className="sm:w-6 sm:h-6" strokeWidth={1.5}/> : currentPage === Page.Expenses ? <TrendingDown size={20} className="sm:w-6 sm:h-6" strokeWidth={1.5}/> : <History size={20} className="sm:w-6 sm:h-6" strokeWidth={1.5} />}</div>
                       <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white font-brand">{currentPage === Page.Income ? 'Income' : currentPage === Page.Expenses ? 'Expenses' : 'Ledger'}</h2>
                     </div>
                 </div>
                 {(currentPage === Page.Income || currentPage === Page.Expenses || (currentPage === Page.AllTransactions || currentPage === Page.Ledger)) && (
                    <button onClick={() => handleOpenFAB(getHeaderFabType())} className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-500 transition-all flex-shrink-0"><Plus size={20} className="sm:w-6 sm:h-6" strokeWidth={2.5} /></button>
                 )}
             </div>

             <PeriodSelector period={filterPeriod} setPeriod={setFilterPeriod} refDate={referenceDate} setRefDate={setReferenceDate} />

        {((currentPage === Page.AllTransactions || currentPage === Page.Ledger) || currentPage === Page.Ledger) && (
               <div className="flex bg-slate-200 dark:bg-slate-900 p-1 rounded-lg mb-4">
                  {(['all', 'income', 'expense', 'invoice'] as const).map(f => (
                    <button key={f} onClick={() => setLedgerFilter(f)} className={`flex-1 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${ledgerFilter === f ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-200'}`}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
                  ))}
               </div>
             )}

             {filterPeriod !== 'all' && (
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 mb-6 flex items-center justify-between shadow-sm">
                   <div className="text-center flex-1 border-r border-slate-200 dark:border-slate-800"><div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Cash In</div><div className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency.format(periodTotals.inc)}</div></div>
                   <div className="text-center flex-1"><div className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">Cash Out</div><div className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency.format(periodTotals.exp)}</div></div>
                </div>
             )}

             <div className="space-y-4">
               {((currentPage === Page.AllTransactions || currentPage === Page.Ledger) ? ledgerItems : filteredTransactions.filter(t => currentPage === Page.Income ? t.type === 'income' : t.type === 'expense')).length === 0 ? (
                  <EmptyState icon={currentPage === Page.Income ? <Wallet size={32} /> : currentPage === Page.Expenses ? <Receipt size={32} /> : <History size={32} />} title="No Items Found" subtitle="No activity found for the selected period." action={() => handleOpenFAB('income')} actionLabel="Add Transaction" />
               ) : (
                ((currentPage === Page.AllTransactions || currentPage === Page.Ledger) ? ledgerItems : filteredTransactions.filter(t => currentPage === Page.Income ? t.type === 'income' : t.type === 'expense').sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())).map((item: any) => {
                  const isInvoice = item.dataType === 'invoice';
                  const isIncome = item.type === 'income';
                  const amountColor = isInvoice ? 'text-blue-600 dark:text-blue-400' : isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
                  const iconBg = isInvoice ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : isIncome ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400';
                  const Icon = isInvoice ? FileText : isIncome ? Wallet : Receipt;
                  
                  // Invoice status calculations
                  let invoiceStatusBadge = null;
                  if (isInvoice) {
                    const inv = item as Invoice;
                    const isVoid = inv.status === 'void';
                    const overdueDays = inv.status === 'unpaid' ? getDaysOverdue(inv.due) : 0;
                    const isOverdue = overdueDays > 0;
                    
                    let badgeClass = '';
                    let badgeText = '';
                    
                    if (isVoid) {
                      badgeClass = 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
                      badgeText = 'VOID';
                    } else if (inv.status === 'paid') {
                      badgeClass = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
                      badgeText = 'PAID';
                    } else if (isOverdue) {
                      badgeClass = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
                      badgeText = 'OVERDUE';
                    } else {
                      badgeClass = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
                      badgeText = 'UNPAID';
                    }
                    
                    invoiceStatusBadge = (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase flex-shrink-0 ${badgeClass}`}>
                        {badgeText}
                      </span>
                    );
                  }
                  
                  // If it's an invoice, use the detailed invoice card layout
                  if (isInvoice) {
                    const inv = item as Invoice;
                    const isVoid = inv.status === 'void';
                    const overdueDays = inv.status === 'unpaid' ? getDaysOverdue(inv.due) : 0;
                    const isOverdue = overdueDays > 0;
                    const isRecurring = inv.recurrence && inv.recurrence.active;
                    
                    return (
                      <div key={item.listId || item.id} className={`bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500/30 hover:shadow-lg transition-all shadow-md cursor-pointer ${isOverdue && !isVoid ? 'border-l-4 border-l-red-500' : ''} ${isVoid ? 'opacity-75 grayscale-[0.5] border-l-4 border-l-slate-400' : ''}`} onClick={() => handleEditItem(item)}>
                        {/* Top Section: Icon, Name, Description */}
                        <div className="flex items-start gap-4 mb-4">
                          <div className={`w-12 h-12 bg-slate-100 dark:bg-blue-500/10 text-slate-600 dark:text-blue-400 rounded-md flex items-center justify-center flex-shrink-0 ${isVoid ? 'bg-slate-200 dark:bg-slate-800 text-slate-400' : ''}`}>{isVoid ? <Ban size={20} strokeWidth={1.5} /> : isRecurring ? <Repeat size={20} strokeWidth={1.5} className="text-blue-500" /> : <FileText size={20} strokeWidth={1.5} />}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`font-bold text-slate-900 dark:text-white text-lg ${isVoid ? 'line-through text-slate-400' : ''}`}>{inv.client}</div>
                              {isRecurring && <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Recurring</span>}
                            </div>
                            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{inv.description}</div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">{inv.date}</div>
                          </div>
                        </div>
                        
                        {/* Bottom Section: Amount, Status, Actions */}
                        <div className="flex items-end justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                          <div>
                              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1 uppercase tracking-wide">Total</label>
                              <div className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white mb-2">{formatCurrency.format(inv.amount)}</div>
                              <div className="flex flex-col gap-1">
                                <div className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 w-fit ${isVoid ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : inv.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' : isOverdue ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'}`}>
                                  {isOverdue && !isVoid && <AlertTriangle size={12} />}
                                  {isVoid ? 'Void' : inv.status === 'paid' ? 'Paid' : isOverdue ? `Overdue (${overdueDays}d)` : 'Unpaid'}
                                </div>
                                <div className={`text-xs font-medium ${isOverdue && !isVoid ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                  {isOverdue && !isVoid ? `Due was ${inv.due}` : `Due ${inv.due}`}
                                  {isRecurring && inv.recurrence && <span className="block text-blue-500 mt-0.5">Next: {inv.recurrence.nextDate}</span>}
                                </div>
                              </div>
                          </div>
                          <div className="flex gap-2">
                              <button onClick={(e) => { e.stopPropagation(); handlePrintInvoice(inv); }} title="Export PDF" className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-600 hover:text-white transition-all active:scale-95"><Download size={20} strokeWidth={1.5} /></button>
                              <button onClick={(e) => { e.stopPropagation(); markInvoicePaid(inv); }} title={inv.status === 'paid' ? "Mark Unpaid" : "Mark Paid"} disabled={isVoid} className={`p-2.5 rounded-lg transition-all active:scale-95 ${isVoid ? 'bg-slate-50 dark:bg-slate-900 text-slate-300 cursor-not-allowed' : inv.status === 'paid' ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400 hover:bg-green-600 hover:text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-green-600 hover:text-white'}`}><CheckCircle size={20} strokeWidth={1.5} /></button>
                              {!isVoid && <button onClick={(e) => { e.stopPropagation(); setActiveItem(inv); setDrawerMode('edit_inv'); setIsDrawerOpen(true); }} title="Edit Invoice" className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-900 hover:text-white dark:hover:bg-slate-700 transition-all active:scale-95"><Edit3 size={20} strokeWidth={1.5} /></button>}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Otherwise use the standard transaction layout
                  return (
                   <div key={item.listId || item.id} className="p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500/30 hover:shadow-lg transition-all shadow-md" onClick={() => handleEditItem(item)}>
                      {/* Top Row: Icon, Name/Client, Amount */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}><Icon size={22} strokeWidth={1.5} /></div>
                              <div className="min-w-0 flex-1 pt-1">
                                  <div className="flex items-center gap-2 mb-1">
                                      <div className="font-bold text-slate-900 dark:text-white text-base leading-tight">{item.name || item.client}</div>
                                      {invoiceStatusBadge}
                                  </div>
                                  <div className="text-xs font-medium text-slate-600 dark:text-slate-300">{item.date} · {item.category}</div>
                              </div>
                          </div>
                          <div className={`text-xl font-bold whitespace-nowrap flex-shrink-0 pt-1 ${amountColor}`}>{isIncome ? '+' : ''}{formatCurrency.format(item.amount)}</div>
                      </div>
                      
                      {/* Bottom Row: Action Buttons */}
                      <div className="flex items-center justify-end gap-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                           <button onClick={(e) => { e.stopPropagation(); if (isInvoice) duplicateInvoice(item as Invoice); else duplicateTransaction(item as Transaction); }} className="p-2 rounded-lg text-slate-400 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all active:scale-95" title="Duplicate"><Copy size={18}/></button>
                           <button onClick={(e) => { e.stopPropagation(); handleEditItem(item); }} className="p-2 rounded-lg text-slate-400 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95" title="Edit"><Edit3 size={18}/></button>
                           <button onClick={(e) => { e.stopPropagation(); if (isInvoice) deleteInvoice(item); else deleteTransaction(item.id); }} className="p-2 rounded-lg text-slate-400 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95" title="Delete"><Trash2 size={18}/></button>
                      </div>
                   </div>
                  );
                }))}
             </div>
           </div>
        )}

        {((currentPage === Page.Invoices || currentPage === Page.Invoice) || currentPage === Page.Invoice) && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="p-2 sm:p-2.5 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 flex-shrink-0">
                  <FileText size={20} className="sm:w-6 sm:h-6" strokeWidth={1.5} />
                </div>
                <div className="flex flex-col gap-2 sm:gap-3 min-w-0">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white font-brand">{billingDocType === 'estimate' ? 'Estimates' : 'Invoices'}</h2>
                  {/* Redesigned Invoices/Estimates Segmented Tabs */}
                  <div className="inline-flex w-fit bg-slate-200/80 dark:bg-slate-900 p-1.5 rounded-xl border border-slate-300/50 dark:border-slate-700/50 shadow-sm">
                    <button 
                      onClick={() => { setBillingDocType('invoice'); setInvoiceQuickFilter('all'); }} 
                      className={`px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-bold uppercase tracking-wide transition-all ${
                        billingDocType === 'invoice' 
                          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-md ring-1 ring-black/5 dark:ring-white/10' 
                          : 'hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                      style={{ color: billingDocType === 'invoice' ? undefined : 'var(--tab-inactive)' }}
                    >
                      Invoices
                    </button>
                    <button 
                      onClick={() => { setBillingDocType('estimate'); setEstimateQuickFilter('all'); }} 
                      className={`px-5 sm:px-6 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base font-bold uppercase tracking-wide transition-all ${
                        billingDocType === 'estimate' 
                          ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-md ring-1 ring-black/5 dark:ring-white/10' 
                          : 'hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                      style={{ color: billingDocType === 'estimate' ? undefined : 'var(--tab-inactive)' }}
                    >
                      Estimates
                    </button>
                  </div>
                </div>
              </div>
              <button onClick={() => handleOpenFAB('billing', billingDocType === 'estimate' ? 'estimate' : 'invoice')} className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-500 transition-all flex-shrink-0"><Plus size={20} className="sm:w-6 sm:h-6" strokeWidth={2.5} /></button>
            </div>
            <PeriodSelector period={filterPeriod} setPeriod={setFilterPeriod} refDate={referenceDate} setRefDate={setReferenceDate} />

            {billingDocType === 'invoice' && (<>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInvoiceQuickFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${invoiceQuickFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}
              >
                All ({invoiceQuickCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setInvoiceQuickFilter('unpaid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${invoiceQuickFilter === 'unpaid' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}
              >
                Unpaid ({invoiceQuickCounts.unpaid})
              </button>
              <button
                type="button"
                onClick={() => setInvoiceQuickFilter('overdue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${invoiceQuickFilter === 'overdue' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}
              >
                Overdue ({invoiceQuickCounts.overdue})
              </button>
            </div>

             {filterPeriod !== 'all' && (
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6 shadow-sm">
                   <div className="grid grid-cols-3 gap-2">
                     <div className="text-center py-2">
                       <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Paid</div>
                       <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">{formatCurrency.format(invoicePeriodTotals.paid)}</div>
                     </div>
                     <div className="text-center py-2 border-x border-slate-200 dark:border-slate-700">
                       <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Due Soon</div>
                       <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">{formatCurrency.format(invoicePeriodTotals.unpaid - invoicePeriodTotals.overdue)}</div>
                     </div>
                     <div className="text-center py-2">
                       <div className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">Overdue</div>
                       <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">{formatCurrency.format(invoicePeriodTotals.overdue)}</div>
                     </div>
                   </div>
                </div>
             )}
            <div className="space-y-4">
              {displayedInvoices.length === 0 ? <EmptyState icon={<FileText size={32} />} title="No Invoices Found" subtitle={filterPeriod === 'all' ? "Create professional invoices and track payments effortlessly." : "No invoices found for the selected period."} action={() => handleOpenFAB('billing', 'invoice')} actionLabel="Create Invoice" /> :
                displayedInvoices.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(inv => {
                  const overdueDays = inv.status === 'unpaid' ? getDaysOverdue(inv.due) : 0;
                  const isOverdue = overdueDays > 0;
                  const isRecurring = inv.recurrence && inv.recurrence.active;
                  const isVoid = inv.status === 'void';
                  return (
                  <div key={inv.id} className={`bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 group hover:border-blue-500/30 hover:shadow-lg transition-all shadow-md cursor-pointer ${isOverdue && !isVoid ? 'border-l-4 border-l-red-500' : ''} ${isVoid ? 'opacity-75 grayscale-[0.5] border-l-4 border-l-slate-400' : ''}`} onClick={() => handleEditItem({ dataType: 'invoice', original: inv })}>
                    {/* Top Section: Icon, Name, Description */}
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`w-12 h-12 bg-slate-100 dark:bg-blue-500/10 text-slate-600 dark:text-blue-400 rounded-md flex items-center justify-center flex-shrink-0 ${isVoid ? 'bg-slate-200 dark:bg-slate-800 text-slate-400' : ''}`}>{isVoid ? <Ban size={20} strokeWidth={1.5} /> : isRecurring ? <Repeat size={20} strokeWidth={1.5} className="text-blue-500" /> : <FileText size={20} strokeWidth={1.5} />}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <div className={`font-bold text-slate-900 dark:text-white text-lg ${isVoid ? 'line-through text-slate-400' : ''}`}>{inv.client}</div>
                          {inv.number && <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono font-bold">{inv.number}</span>}
                          {isRecurring && <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Recurring</span>}
                        </div>
                        <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{inv.description}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">{inv.date}</div>
                      </div>
                    </div>
                    
                    {/* Bottom Section: Amount, Status, Actions */}
                    <div className="flex items-end justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                      <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1 uppercase tracking-wide">Total</label>
                          <div className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white mb-2">{formatCurrency.format(inv.amount)}</div>
                          <div className="flex flex-col gap-1">
                            <div className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 w-fit ${isVoid ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : inv.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' : isOverdue ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'}`}>
                              {isOverdue && !isVoid && <AlertTriangle size={12} />}
                              {isVoid ? 'Void' : inv.status === 'paid' ? 'Paid' : isOverdue ? `Overdue (${overdueDays}d)` : 'Unpaid'}
                            </div>
                            <div className={`text-xs font-medium ${isOverdue && !isVoid ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
                              {isOverdue && !isVoid ? `Due was ${inv.due}` : `Due ${inv.due}`}
                              {isRecurring && inv.recurrence && <span className="block text-blue-500 mt-0.5">Next: {inv.recurrence.nextDate}</span>}
                            </div>
                          </div>
                      </div>
                      <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); handlePrintInvoice(inv); }} title="Export PDF" className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-600 hover:text-white transition-all active:scale-95"><Download size={20} strokeWidth={1.5} /></button>
                          <button onClick={(e) => { e.stopPropagation(); markInvoicePaid(inv); }} title={inv.status === 'paid' ? "Mark Unpaid" : "Mark Paid"} disabled={isVoid} className={`p-2.5 rounded-lg transition-all active:scale-95 ${isVoid ? 'bg-slate-50 dark:bg-slate-900 text-slate-300 cursor-not-allowed' : inv.status === 'paid' ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400 hover:bg-green-600 hover:text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-green-600 hover:text-white'}`}><CheckCircle size={20} strokeWidth={1.5} /></button>
                          {!isVoid && <button onClick={(e) => { e.stopPropagation(); setActiveItem(inv); setDrawerMode('edit_inv'); setIsDrawerOpen(true); }} title="Edit Invoice" className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-900 hover:text-white dark:hover:bg-slate-700 transition-all active:scale-95"><Edit3 size={20} strokeWidth={1.5} /></button>}
                      </div>
                    </div>
                  </div>
                )})
              }

            </div>
            </>
            )}

            {billingDocType === 'estimate' && (
              <>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" onClick={() => setEstimateQuickFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${estimateQuickFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}>All ({estimateQuickCounts.all})</button>
                  <button type="button" onClick={() => setEstimateQuickFilter('draft')} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${estimateQuickFilter === 'draft' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}>Draft ({estimateQuickCounts.draft})</button>
                  <button type="button" onClick={() => setEstimateQuickFilter('sent')} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${estimateQuickFilter === 'sent' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}>Sent ({estimateQuickCounts.sent})</button>
                  <button type="button" onClick={() => setEstimateQuickFilter('accepted')} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${estimateQuickFilter === 'accepted' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}>Accepted ({estimateQuickCounts.accepted})</button>
                  <button type="button" onClick={() => setEstimateQuickFilter('declined')} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-colors ${estimateQuickFilter === 'declined' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}>Declined ({estimateQuickCounts.declined})</button>
                </div>

                <div className="space-y-4">
                  {displayedEstimates.length === 0 ? (
                    <EmptyState icon={<FileText size={32} />} title="No Estimates Found" subtitle={filterPeriod === 'all' ? "Create professional estimates (quotes) and export to PDF." : "No estimates found for the selected period."} action={() => handleOpenFAB('billing', 'estimate')} actionLabel="Create Estimate" />
                  ) : (
                    displayedEstimates
                      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(est => {
                        const isExpired = est.validUntil ? new Date(est.validUntil) < new Date() : false;
                        const statusLabel = est.status === 'accepted' ? 'Accepted' : est.status === 'declined' ? 'Declined' : est.status === 'sent' ? 'Sent' : est.status === 'void' ? 'Void' : 'Draft';
                        const statusClass = est.status === 'accepted' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : est.status === 'declined' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' : est.status === 'sent' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' : est.status === 'void' ? 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                        const isVoid = est.status === 'void';
                        
                        // Follow-up status calculation
                        const today = new Date().toISOString().split('T')[0];
                        const isFollowUpOverdue = est.status === 'sent' && est.followUpDate && est.followUpDate <= today;
                        const isFollowUpSoon = est.status === 'sent' && est.followUpDate && !isFollowUpOverdue && (() => {
                          const followUp = new Date(est.followUpDate);
                          const threeDays = new Date();
                          threeDays.setDate(threeDays.getDate() + 3);
                          return followUp <= threeDays;
                        })();
                        const daysSinceSent = est.sentAt ? Math.floor((new Date().getTime() - new Date(est.sentAt).getTime()) / (1000 * 60 * 60 * 24)) : null;
                        
                        return (
                          <div key={est.id} className={`bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 group hover:border-blue-500/30 hover:shadow-lg transition-all shadow-md cursor-pointer ${isExpired && est.status !== 'accepted' && !isVoid ? 'border-l-4 border-l-amber-500' : ''} ${est.status === 'accepted' ? 'border-l-4 border-l-emerald-500' : ''} ${isFollowUpOverdue ? 'border-l-4 border-l-orange-500' : ''} ${isVoid ? 'opacity-60' : ''}`} onClick={() => handleEditItem({ dataType: 'estimate', original: est })}>
                            <div className="flex items-start gap-4 mb-4">
                              <div className={`w-12 h-12 rounded-md flex items-center justify-center flex-shrink-0 ${est.status === 'accepted' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : est.status === 'sent' ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                                {est.status === 'accepted' ? <CheckCircle size={20} strokeWidth={1.5} /> : <FileText size={20} strokeWidth={1.5} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <div className="font-bold text-slate-900 dark:text-white text-lg">{est.client}</div>
                                  {est.number && <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-mono font-bold">{est.number}</span>}
                                  {isFollowUpOverdue && <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded font-bold flex items-center gap-1"><Clock3 size={12} /> Follow-up due</span>}
                                </div>
                                <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{est.description}</div>
                                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                                  {est.date}{est.validUntil ? ` • Valid until ${est.validUntil}` : ''}
                                  {est.status === 'sent' && daysSinceSent !== null && <span className="ml-2 text-blue-600 dark:text-blue-400">• Sent {daysSinceSent}d ago</span>}
                                  {est.followUpCount !== undefined && est.followUpCount > 0 && <span className="ml-2 text-purple-600 dark:text-purple-400">• {est.followUpCount} follow-up{est.followUpCount > 1 ? 's' : ''}</span>}
                                </div>
                              </div>
                            </div>

                            {/* Follow-up Alert Banner for Sent Estimates */}
                            {est.status === 'sent' && (isFollowUpOverdue || isFollowUpSoon) && (
                              <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3 rounded-lg mb-4 ${isFollowUpOverdue ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30' : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30'}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  <Clock3 size={16} className={`flex-shrink-0 ${isFollowUpOverdue ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`} />
                                  <span className={`text-sm font-bold ${isFollowUpOverdue ? 'text-orange-800 dark:text-orange-300' : 'text-blue-800 dark:text-blue-300'}`}>
                                    {isFollowUpOverdue ? `Follow-up was due ${est.followUpDate}` : `Follow-up: ${est.followUpDate}`}
                                  </span>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); recordFollowUp(est, 7); }}
                                    className="px-3 py-1.5 rounded text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
                                  >
                                    Done +7d
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); snoozeFollowUp(est, 3); }}
                                    className="px-3 py-1.5 rounded text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
                                  >
                                    +3d
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Quick Status Actions - Context-Sensitive */}
                            {!isVoid && (
                              <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                                {est.status === 'draft' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); updateEstimateStatus(est, 'sent'); }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-1.5"
                                  >
                                    <Share2 size={14} /> Mark Sent
                                  </button>
                                )}
                                {est.status === 'sent' && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); updateEstimateStatus(est, 'accepted'); }}
                                      className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-1.5"
                                    >
                                      <CheckCircle size={14} /> Won / Accepted
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); updateEstimateStatus(est, 'declined'); }}
                                      className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-red-100 text-red-700 hover:bg-red-600 hover:text-white dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white transition-all active:scale-95 flex items-center gap-1.5"
                                    >
                                      <X size={14} /> Lost / Declined
                                    </button>
                                    {!isFollowUpOverdue && !isFollowUpSoon && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); recordFollowUp(est, 7); }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-600 dark:hover:text-white transition-all active:scale-95 flex items-center gap-1.5"
                                      >
                                        <Clock3 size={14} /> Log Follow-up
                                      </button>
                                    )}
                                  </>
                                )}
                                {est.status === 'accepted' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); convertEstimateToInvoice(est); }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-emerald-600 to-blue-600 text-white hover:from-emerald-700 hover:to-blue-700 transition-all active:scale-95 flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
                                  >
                                    <ArrowRight size={14} /> Create Invoice
                                  </button>
                                )}
                                {est.status === 'declined' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); duplicateEstimate(est); }}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-all active:scale-95 flex items-center gap-1.5"
                                  >
                                    <Copy size={14} /> Revise & Resend
                                  </button>
                                )}
                              </div>
                            )}

                            <div className="flex items-end justify-between">
                              <div>
                                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1 uppercase tracking-wide">Total</label>
                                <div className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white mb-2">{formatCurrency.format(est.amount)}</div>
                                <div className="flex flex-col gap-1">
                                  <div className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 w-fit ${statusClass}`}>{statusLabel}</div>
                                  {isExpired && est.status !== 'accepted' && !isVoid && <div className="text-xs font-medium text-amber-600 dark:text-amber-400">Expired</div>}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={(e) => { e.stopPropagation(); handlePrintEstimate(est); }} title="Export PDF" className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-600 hover:text-white transition-all active:scale-95"><Download size={20} strokeWidth={1.5} /></button>
                                <button onClick={(e) => { e.stopPropagation(); setBillingDocType('estimate'); setActiveItem(est); setDrawerMode('edit_inv'); setIsDrawerOpen(true); }} title="Edit Estimate" className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-900 hover:text-white dark:hover:bg-slate-700 transition-all active:scale-95"><Edit3 size={20} strokeWidth={1.5} /></button>
                                <button onClick={(e) => { e.stopPropagation(); deleteEstimate(est); }} title="Delete Estimate" className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-red-600 hover:text-white transition-all active:scale-95"><Trash2 size={20} strokeWidth={1.5} /></button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {currentPage === Page.Reports && (
           <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-2.5 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 flex-shrink-0">
                  <BarChart3 size={20} className="sm:w-6 sm:h-6" strokeWidth={1.5} />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white font-brand">Reports</h2>
              </div>
              
              {/* Pro-Grade U.S. P&L Statement */}
              <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl">
                {/* Controls Header - NOT part of PDF */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <BarChart3 size={24} strokeWidth={2} className="text-blue-600 dark:text-blue-400" />
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                        Profit & Loss
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {proPLData.periodLabel}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowProPLPreview(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    <span>Preview & Export</span>
                  </button>
                </div>

                {/* Period Selector */}
                <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {[
                      { value: 'month', label: 'This Month' },
                      { value: 'ytd', label: 'YTD' },
                      { value: 'lastYear', label: 'Last Year' },
                      { value: 'trailing12', label: '12 Mo' },
                      { value: 'custom', label: 'Custom' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setPlPeriodType(opt.value as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          plPeriodType === opt.value 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  
                  {plPeriodType === 'custom' && (
                    <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">From:</label>
                        <input type="date" value={plCustomStart} onChange={(e) => setPlCustomStart(e.target.value)} className="px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm" />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">To:</label>
                        <input type="date" value={plCustomEnd} onChange={(e) => setPlCustomEnd(e.target.value)} className="px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm" />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => setPlShowComparison(!plShowComparison)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        plShowComparison ? 'bg-purple-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600'
                      }`}
                    >
                      {plShowComparison ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      Prior Period
                    </button>
                    <select
                      value={plAccountingBasis}
                      onChange={(e) => setPlAccountingBasis(e.target.value as 'cash' | 'accrual')}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs font-bold"
                    >
                      <option value="cash">Cash Basis</option>
                      <option value="accrual">Accrual Basis</option>
                    </select>
                  </div>
                </div>

                {/* Data Integrity Warning */}
                {proPLData.hasDataIssues && (
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {proPLData.uncategorizedCount} uncategorized transaction{proPLData.uncategorizedCount !== 1 ? 's' : ''} ({formatCurrency.format(proPLData.uncategorizedAmount)})
                    </p>
                  </div>
                )}

                {/* ========== UNIFIED P&L REPORT (Same as PDF) ========== */}
                <div id="pl-report-content" className="bg-white text-gray-900 rounded-lg overflow-hidden" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                  {/* Report Header - Left Aligned */}
                  <div className="px-4 py-4 border-b-2 border-gray-300 bg-gray-50">
                    <div>
                      {settings.businessLogo && (
                        <img
                          src={settings.businessLogo}
                          alt="Logo"
                          className="h-10 sm:h-14 w-auto object-contain mb-2"
                        />
                      )}
                      <h1 className="text-base sm:text-lg font-bold text-gray-900 uppercase tracking-wide">{settings.businessName}</h1>
                      <h2 className="text-sm font-semibold text-gray-700 mt-1">Profit & Loss Statement</h2>
                      <p className="text-xs text-gray-600 mt-1">
                        For the Period: {proPLData.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – {proPLData.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {plAccountingBasis === 'cash' ? 'Cash' : 'Accrual'} Basis | USD
                        {plShowComparison && ` | Prior: ${proPLData.priorStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${proPLData.priorEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      </p>
                    </div>
                  </div>

                  {/* Column Headers */}
                  <div className="px-4 py-2 bg-gray-100 border-b border-gray-300">
                    <div className="flex items-center text-xs font-bold text-gray-600 uppercase">
                      <div className="flex-1 min-w-0">Account</div>
                      <div className="w-24 sm:w-28 text-right flex-shrink-0">Current</div>
                      {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 hidden sm:block">Prior</div>}
                      {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block">% Chg</div>}
                      <div className="w-14 sm:w-16 text-right flex-shrink-0">% Rev</div>
                    </div>
                  </div>

                  {/* Report Body */}
                  <div className="px-4 py-2">
                    {/* REVENUE SECTION - Industry Standard with Category Breakdown */}
                    <div className="mb-4">
                      <div className="font-bold text-xs text-gray-900 uppercase tracking-wide py-2 border-b border-gray-200">Revenue</div>
                      
                      {/* Income by Category (like QuickBooks) */}
                      {Object.entries(proPLData.incomeByCategory)
                        .sort(([,a], [,b]) => b - a)
                        .map(([category, amount]) => (
                          <div key={category} className="flex items-center py-1 text-sm">
                            <div className="flex-1 min-w-0 pl-4 text-gray-700 truncate">{category}</div>
                            <div className="w-24 sm:w-28 text-right flex-shrink-0 font-medium tabular-nums">{formatCurrency.format(amount)}</div>
                            {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorIncomeByCategory[category] ? formatCurrency.format(proPLData.priorIncomeByCategory[category]) : '—'}</div>}
                            {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                            <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((amount / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                          </div>
                        ))}
                      
                      {/* Gross Sales Total (if multiple categories) */}
                      {Object.keys(proPLData.incomeByCategory).length > 1 && (
                        <div className="flex items-center py-1.5 text-sm font-semibold border-t border-gray-200 mt-1">
                          <div className="flex-1 min-w-0 pl-2 text-gray-800">Total Gross Sales</div>
                          <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums">{formatCurrency.format(proPLData.salesServices)}</div>
                          {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorSalesServicesGross > 0 ? formatCurrency.format(proPLData.priorSalesServicesGross) : '—'}</div>}
                          {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                          <div className="w-14 sm:w-16 text-right flex-shrink-0 text-xs"></div>
                        </div>
                      )}
                      
                      {/* Less: Returns & Refunds */}
                      {(proPLData.refunds > 0 || proPLData.priorRefunds > 0) && (
                        <div className="flex items-center py-1.5 text-sm">
                          <div className="flex-1 min-w-0 pl-4 text-gray-700 italic truncate">Less: Returns & Refunds</div>
                          <div className="w-24 sm:w-28 text-right flex-shrink-0 font-medium tabular-nums text-red-600">({formatCurrency.format(proPLData.refunds)})</div>
                          {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorRefunds > 0 ? `(${formatCurrency.format(proPLData.priorRefunds)})` : '—'}</div>}
                          {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                          <div className="w-14 sm:w-16 text-right flex-shrink-0"></div>
                        </div>
                      )}
                      
                      {/* Net Revenue Subtotal */}
                      <div className="flex items-center py-2 text-sm font-bold border-t border-gray-300 mt-2">
                        <div className="flex-1 min-w-0 text-gray-900">NET REVENUE</div>
                        <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums text-emerald-700">{formatCurrency.format(proPLData.netRevenue)}</div>
                        {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-600 tabular-nums hidden sm:block">{proPLData.priorNetRevenue > 0 ? formatCurrency.format(proPLData.priorNetRevenue) : '—'}</div>}
                        {plShowComparison && <div className={`w-16 text-right flex-shrink-0 text-xs hidden sm:block ${proPLData.revenueChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{proPLData.priorNetRevenue > 0 ? `${proPLData.revenueChange >= 0 ? '+' : ''}${proPLData.revenueChange.toFixed(1)}%` : '—'}</div>}
                        <div className="w-14 sm:w-16 text-right flex-shrink-0 text-xs">100.0%</div>
                      </div>
                    </div>

                    {/* COGS SECTION - Industry Standard with Category Breakdown */}
                    {(proPLData.cogs > 0 || proPLData.priorCogs > 0) && (
                      <div className="mb-4">
                        <div className="font-bold text-xs text-gray-900 uppercase tracking-wide py-2 border-b border-gray-200">Cost of Goods Sold</div>
                        
                        {/* COGS by Category */}
                        {Object.entries(proPLData.cogsByCategory)
                          .sort(([,a], [,b]) => b - a)
                          .map(([category, amount]) => (
                            <div key={category} className="flex items-center py-1 text-sm">
                              <div className="flex-1 min-w-0 pl-4 text-gray-700 truncate">{category}</div>
                              <div className="w-24 sm:w-28 text-right flex-shrink-0 font-medium tabular-nums">{formatCurrency.format(amount)}</div>
                              {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorCogsByCategory[category] ? formatCurrency.format(proPLData.priorCogsByCategory[category]) : '—'}</div>}
                              {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                              <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((amount / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                            </div>
                          ))}
                        
                        {/* Total COGS (if multiple categories) */}
                        {Object.keys(proPLData.cogsByCategory).length > 1 && (
                          <div className="flex items-center py-1.5 text-sm font-semibold border-t border-gray-200 mt-1">
                            <div className="flex-1 min-w-0 pl-2 text-gray-800">Total COGS</div>
                            <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums">{formatCurrency.format(proPLData.cogs)}</div>
                            {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorCogs > 0 ? formatCurrency.format(proPLData.priorCogs) : '—'}</div>}
                            {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                            <div className="w-14 sm:w-16 text-right flex-shrink-0 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.cogs / proPLData.netRevenue) * 100).toFixed(1)}%` : '—'}</div>
                          </div>
                        )}
                        
                        {/* Gross Profit */}
                        <div className="flex items-center py-2 text-sm font-bold border-t border-gray-300 mt-2">
                          <div className="flex-1 min-w-0 text-gray-900">GROSS PROFIT</div>
                          <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums">{formatCurrency.format(proPLData.grossProfit)}</div>
                          {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-600 tabular-nums hidden sm:block">{proPLData.priorGrossProfit !== 0 ? formatCurrency.format(proPLData.priorGrossProfit) : '—'}</div>}
                          {plShowComparison && <div className={`w-16 text-right flex-shrink-0 text-xs hidden sm:block ${proPLData.grossProfitChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{proPLData.priorGrossProfit !== 0 ? `${proPLData.grossProfitChange >= 0 ? '+' : ''}${proPLData.grossProfitChange.toFixed(1)}%` : '—'}</div>}
                          <div className="w-14 sm:w-16 text-right flex-shrink-0 text-xs">{proPLData.grossMargin.toFixed(1)}%</div>
                        </div>
                      </div>
                    )}

                    {/* OPERATING EXPENSES SECTION - Industry Standard Grouped Layout */}
                    <div className="mb-4">
                      <div className="font-bold text-xs text-gray-900 uppercase tracking-wide py-2 border-b border-gray-200">Operating Expenses</div>
                      
                      {/* Payroll & Labor */}
                      {proPLData.payrollTotal > 0 && (
                        <>
                          <div className="flex items-center py-1.5 text-sm font-semibold bg-gray-50 -mx-4 px-4 mt-1">
                            <div className="flex-1 min-w-0 text-gray-800">Payroll & Labor</div>
                            <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums">{formatCurrency.format(proPLData.payrollTotal)}</div>
                            {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorPayrollTotal > 0 ? formatCurrency.format(proPLData.priorPayrollTotal) : '—'}</div>}
                            {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                            <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.payrollTotal / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                          </div>
                          {proPLData.payrollItems.map(([cat, amt]) => (
                            <div key={cat} className="flex items-center py-1 text-sm">
                              <div className="flex-1 min-w-0 pl-6 text-gray-600 truncate">{cat}</div>
                              <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums text-gray-600">{formatCurrency.format(amt)}</div>
                              {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-400 tabular-nums hidden sm:block">{proPLData.priorPayrollItems.find(([c]) => c === cat)?.[1] ? formatCurrency.format(proPLData.priorPayrollItems.find(([c]) => c === cat)?.[1] || 0) : '—'}</div>}
                              {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                              <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-400 text-xs">{proPLData.netRevenue > 0 ? `${((amt / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* Occupancy & Facilities */}
                      {proPLData.occupancyTotal > 0 && (
                        <>
                          <div className="flex items-center py-1.5 text-sm font-semibold bg-gray-50 -mx-4 px-4 mt-1">
                            <div className="flex-1 min-w-0 text-gray-800">Occupancy & Facilities</div>
                            <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums">{formatCurrency.format(proPLData.occupancyTotal)}</div>
                            {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorOccupancyTotal > 0 ? formatCurrency.format(proPLData.priorOccupancyTotal) : '—'}</div>}
                            {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                            <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.occupancyTotal / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                          </div>
                          {proPLData.occupancyItems.map(([cat, amt]) => (
                            <div key={cat} className="flex items-center py-1 text-sm">
                              <div className="flex-1 min-w-0 pl-6 text-gray-600 truncate">{cat}</div>
                              <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums text-gray-600">{formatCurrency.format(amt)}</div>
                              {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-400 tabular-nums hidden sm:block">{proPLData.priorOccupancyItems.find(([c]) => c === cat)?.[1] ? formatCurrency.format(proPLData.priorOccupancyItems.find(([c]) => c === cat)?.[1] || 0) : '—'}</div>}
                              {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                              <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-400 text-xs">{proPLData.netRevenue > 0 ? `${((amt / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* Marketing & Advertising */}
                      {proPLData.marketingTotal > 0 && (
                        <>
                          <div className="flex items-center py-1.5 text-sm font-semibold bg-gray-50 -mx-4 px-4 mt-1">
                            <div className="flex-1 min-w-0 text-gray-800">Marketing & Advertising</div>
                            <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums">{formatCurrency.format(proPLData.marketingTotal)}</div>
                            {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorMarketingTotal > 0 ? formatCurrency.format(proPLData.priorMarketingTotal) : '—'}</div>}
                            {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                            <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.marketingTotal / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                          </div>
                          {proPLData.marketingItems.map(([cat, amt]) => (
                            <div key={cat} className="flex items-center py-1 text-sm">
                              <div className="flex-1 min-w-0 pl-6 text-gray-600 truncate">{cat}</div>
                              <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums text-gray-600">{formatCurrency.format(amt)}</div>
                              {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-400 tabular-nums hidden sm:block">{proPLData.priorMarketingItems.find(([c]) => c === cat)?.[1] ? formatCurrency.format(proPLData.priorMarketingItems.find(([c]) => c === cat)?.[1] || 0) : '—'}</div>}
                              {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                              <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-400 text-xs">{proPLData.netRevenue > 0 ? `${((amt / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* General & Administrative */}
                      {proPLData.gaTotal > 0 && (
                        <>
                          <div className="flex items-center py-1.5 text-sm font-semibold bg-gray-50 -mx-4 px-4 mt-1">
                            <div className="flex-1 min-w-0 text-gray-800">General & Administrative</div>
                            <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums">{formatCurrency.format(proPLData.gaTotal)}</div>
                            {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorGaTotal > 0 ? formatCurrency.format(proPLData.priorGaTotal) : '—'}</div>}
                            {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                            <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.gaTotal / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                          </div>
                          {proPLData.gaItems.map(([cat, amt]) => (
                            <div key={cat} className="flex items-center py-1 text-sm">
                              <div className="flex-1 min-w-0 pl-6 text-gray-600 truncate">{cat}</div>
                              <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums text-gray-600">{formatCurrency.format(amt)}</div>
                              {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-400 tabular-nums hidden sm:block">{proPLData.priorGaItems.find(([c]) => c === cat)?.[1] ? formatCurrency.format(proPLData.priorGaItems.find(([c]) => c === cat)?.[1] || 0) : '—'}</div>}
                              {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                              <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-400 text-xs">{proPLData.netRevenue > 0 ? `${((amt / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* Other Expenses (uncategorized) */}
                      {proPLData.otherExpenses > 0 && (
                        <div className="flex items-center py-1.5 text-sm font-semibold bg-gray-50 -mx-4 px-4 mt-1">
                          <div className="flex-1 min-w-0 text-gray-800">Other Expenses</div>
                          <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums">{formatCurrency.format(proPLData.otherExpenses)}</div>
                          {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorOtherExpenses > 0 ? formatCurrency.format(proPLData.priorOtherExpenses) : '—'}</div>}
                          {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                          <div className="w-14 sm:w-16 text-right flex-shrink-0 text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.otherExpenses / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                        </div>
                      )}
                      
                      {/* Total Operating Expenses */}
                      <div className="flex items-center py-2 text-sm font-bold border-t-2 border-gray-400 mt-3">
                        <div className="flex-1 min-w-0 text-gray-900">TOTAL OPERATING EXPENSES</div>
                        <div className="w-24 sm:w-28 text-right flex-shrink-0 tabular-nums text-red-700">{formatCurrency.format(proPLData.totalOpex)}</div>
                        {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-600 tabular-nums hidden sm:block">{proPLData.priorTotalOpex > 0 ? formatCurrency.format(proPLData.priorTotalOpex) : '—'}</div>}
                        {plShowComparison && <div className={`w-16 text-right flex-shrink-0 text-xs hidden sm:block ${proPLData.opexChange <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{proPLData.priorTotalOpex > 0 ? `${proPLData.opexChange >= 0 ? '+' : ''}${proPLData.opexChange.toFixed(1)}%` : '—'}</div>}
                        <div className="w-14 sm:w-16 text-right flex-shrink-0 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.totalOpex / proPLData.netRevenue) * 100).toFixed(1)}%` : '—'}</div>
                      </div>
                    </div>

                    {/* OPERATING INCOME */}
                    <div className="flex items-center py-3 text-sm font-bold bg-gray-100 -mx-4 px-4 mb-4">
                      <div className="flex-1 min-w-0 text-gray-900 uppercase">Operating Income</div>
                      <div className={`w-24 sm:w-28 text-right flex-shrink-0 tabular-nums ${proPLData.operatingIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {proPLData.operatingIncome < 0 ? `(${formatCurrency.format(Math.abs(proPLData.operatingIncome))})` : formatCurrency.format(proPLData.operatingIncome)}
                      </div>
                      {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-600 tabular-nums hidden sm:block">{proPLData.priorOperatingIncome !== 0 ? (proPLData.priorOperatingIncome < 0 ? `(${formatCurrency.format(Math.abs(proPLData.priorOperatingIncome))})` : formatCurrency.format(proPLData.priorOperatingIncome)) : '—'}</div>}
                      {plShowComparison && <div className={`w-16 text-right flex-shrink-0 text-xs hidden sm:block ${proPLData.operatingIncomeChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{proPLData.priorOperatingIncome !== 0 ? `${proPLData.operatingIncomeChange >= 0 ? '+' : ''}${proPLData.operatingIncomeChange.toFixed(1)}%` : '—'}</div>}
                      <div className="w-14 sm:w-16 text-right flex-shrink-0 text-xs">{proPLData.operatingMargin.toFixed(1)}%</div>
                    </div>

                    {/* OTHER INCOME/EXPENSE */}
                    {(proPLData.interestIncome > 0 || proPLData.interestExpense > 0 || proPLData.priorInterestIncome > 0 || proPLData.priorInterestExpense > 0) && (
                      <div className="mb-4">
                        <div className="font-bold text-xs text-gray-900 uppercase tracking-wide py-2 border-b border-gray-200">Other Income / Expense</div>
                        
                        {(proPLData.interestIncome > 0 || proPLData.priorInterestIncome > 0) && (
                          <div className="flex items-center py-1.5 text-sm">
                            <div className="flex-1 min-w-0 pl-4 text-gray-700">Interest Income</div>
                            <div className="w-24 sm:w-28 text-right flex-shrink-0 font-medium tabular-nums text-emerald-600">{formatCurrency.format(proPLData.interestIncome)}</div>
                            {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorInterestIncome > 0 ? formatCurrency.format(proPLData.priorInterestIncome) : '—'}</div>}
                            {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                            <div className="w-14 sm:w-16 text-right flex-shrink-0"></div>
                          </div>
                        )}
                        
                        {(proPLData.interestExpense > 0 || proPLData.priorInterestExpense > 0) && (
                          <div className="flex items-center py-1.5 text-sm">
                            <div className="flex-1 min-w-0 pl-4 text-gray-700">Interest Expense</div>
                            <div className="w-24 sm:w-28 text-right flex-shrink-0 font-medium tabular-nums text-red-600">({formatCurrency.format(proPLData.interestExpense)})</div>
                            {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-500 tabular-nums hidden sm:block">{proPLData.priorInterestExpense > 0 ? `(${formatCurrency.format(proPLData.priorInterestExpense)})` : '—'}</div>}
                            {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                            <div className="w-14 sm:w-16 text-right flex-shrink-0"></div>
                          </div>
                        )}
                        
                        <div className="flex items-center py-2 text-sm font-bold border-t border-gray-200 mt-2">
                          <div className="flex-1 min-w-0 text-gray-900">NET OTHER INCOME</div>
                          <div className={`w-24 sm:w-28 text-right flex-shrink-0 tabular-nums ${proPLData.netOtherIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {proPLData.netOtherIncome < 0 ? `(${formatCurrency.format(Math.abs(proPLData.netOtherIncome))})` : formatCurrency.format(proPLData.netOtherIncome)}
                          </div>
                          {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-600 tabular-nums hidden sm:block">{proPLData.priorNetOtherIncome !== 0 ? formatCurrency.format(proPLData.priorNetOtherIncome) : '—'}</div>}
                          {plShowComparison && <div className="w-16 text-right flex-shrink-0 hidden sm:block"></div>}
                          <div className="w-14 sm:w-16 text-right flex-shrink-0"></div>
                        </div>
                      </div>
                    )}

                    {/* NET INCOME */}
                    <div className="flex items-center py-3 text-sm font-bold bg-gray-900 text-white -mx-4 px-4 rounded-b-lg">
                      <div className="flex-1 min-w-0 uppercase text-base">Net Income</div>
                      <div className={`w-24 sm:w-28 text-right flex-shrink-0 tabular-nums text-base ${proPLData.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {proPLData.netIncome < 0 ? `(${formatCurrency.format(Math.abs(proPLData.netIncome))})` : formatCurrency.format(proPLData.netIncome)}
                      </div>
                      {plShowComparison && <div className="w-24 sm:w-28 text-right flex-shrink-0 text-gray-400 tabular-nums hidden sm:block">{proPLData.priorNetIncome !== 0 ? (proPLData.priorNetIncome < 0 ? `(${formatCurrency.format(Math.abs(proPLData.priorNetIncome))})` : formatCurrency.format(proPLData.priorNetIncome)) : '—'}</div>}
                      {plShowComparison && <div className={`w-16 text-right flex-shrink-0 text-xs hidden sm:block ${proPLData.netIncomeChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{proPLData.priorNetIncome !== 0 ? `${proPLData.netIncomeChange >= 0 ? '+' : ''}${proPLData.netIncomeChange.toFixed(1)}%` : '—'}</div>}
                      <div className="w-14 sm:w-16 text-right flex-shrink-0 text-xs text-gray-300">{proPLData.netMargin.toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* Notes Section */}
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                    <div className="font-semibold text-gray-600 mb-1">Notes</div>
                    <div className="space-y-0.5">
                      <p>• {plAccountingBasis === 'cash' ? 'Cash' : 'Accrual'} Basis | {proPLData.transactionCount} transactions</p>
                      {proPLData.uncategorizedCount > 0 && <p className="text-amber-600">• {proPLData.uncategorizedCount} uncategorized ({formatCurrency.format(proPLData.uncategorizedAmount)})</p>}
                      <p>• Generated: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div ref={taxSnapshotRef} className="bg-white dark:bg-slate-950 text-slate-900 dark:text-white p-5 sm:p-8 rounded-lg shadow-xl relative overflow-hidden border border-slate-200 dark:border-slate-800">
                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-50 dark:bg-blue-600/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 sm:mb-8 relative z-10">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Calculator size={20} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <div>
                      <h3 style={{ fontSize: '16px' }} className="font-bold uppercase tracking-tight font-brand">Tax Snapshot</h3>
                      <p style={{ fontSize: '11px' }} className="text-slate-600 dark:text-slate-300 font-bold mt-0.5">Based on Net Profit: {formatCurrency.format(reportData.ytdNetProfit)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenTaxDrawer(); }} style={{ fontSize: '10px' }} className="relative z-30 cursor-pointer font-bold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors uppercase tracking-wider active:scale-95 self-start sm:self-auto">Manage Payments</button>
                </div>
                <div className="space-y-4 sm:space-y-6 relative z-10">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div style={{ fontSize: '13px' }} className="font-bold text-slate-700 dark:text-slate-300">Self-Employment Tax</div>
                      <div style={{ fontSize: '10px' }} className="text-slate-600 dark:text-slate-300 uppercase tracking-wider">Social Security & Medicare (~15.3%)</div>
                    </div>
                    <div style={{ fontSize: '18px' }} className="font-bold flex-shrink-0">{formatCurrency.format(reportData.seTaxLiability)}</div>
                  </div>
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div style={{ fontSize: '13px' }} className="font-bold text-slate-700 dark:text-slate-300">Income Tax Estimate</div>
                      <div style={{ fontSize: '10px' }} className="text-slate-600 dark:text-slate-300 uppercase tracking-wider">Based on {reportData.totalIncomeTaxRate}% Combined Rate</div>
                    </div>
                    <div style={{ fontSize: '18px' }} className="font-bold flex-shrink-0">{formatCurrency.format(reportData.incomeTaxLiability)}</div>
                  </div>
                  <div className="flex justify-between items-start gap-2 py-2 bg-slate-50 dark:bg-slate-900/50 -mx-4 sm:-mx-4 px-4 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <div style={{ fontSize: '13px' }} className="font-bold text-slate-700 dark:text-slate-300">Less: Payments (YTD)</div>
                    </div>
                    <div style={{ fontSize: '18px' }} className="font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">-{formatCurrency.format(reportData.totalTaxPaidYTD)}</div>
                  </div>
                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-3 sm:my-4" />
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-1">
                    <span style={{ fontSize: '12px' }} className="font-bold uppercase tracking-widest font-brand text-slate-600 dark:text-slate-300">{reportData.taxAhead > 0 ? 'Overpaid (Refund Est.)' : 'Net Remaining To Pay'}</span>
                    <span style={{ fontSize: '28px' }} className={`font-extrabold font-brand ${reportData.taxAhead > 0 ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>{formatCurrency.format(reportData.taxAhead > 0 ? reportData.taxAhead : reportData.taxRemaining)}</span>
                  </div>
                </div>

                {/* --- Tax Planner (2026) Accordion --- */}
              </div>
                <div className="bg-white dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800 shadow-lg rounded-3xl p-6 relative overflow-hidden">
                  <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-blue-500/10 dark:bg-blue-400/10 opacity-0 dark:opacity-100 blur-2xl pointer-events-none" />
                  <button
                    onClick={() => setIsPlannerOpen(!isPlannerOpen)}
                    className="w-full flex items-center justify-between gap-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <BrainCircuit size={22} className="text-blue-600 dark:text-blue-400" />
                      <h3 className="text-lg sm:text-xl font-bold uppercase tracking-tight font-brand text-slate-900 dark:text-white">
                        Tax Planner <span className="text-slate-600 dark:text-slate-300">(2026)</span>
                      </h3>
                    </div>
                    <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
                      {isPlannerOpen ? <ChevronUp size={18} className="text-slate-600 dark:text-slate-300" /> : <ChevronDown size={18} className="text-slate-600 dark:text-slate-300" />}
                    </span>
                  </button>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 pl-9">
                    Estimate and plan your 2026 taxes in one place.
                  </p>

                  {isPlannerOpen && (
                    <div className="mt-6 pt-6 border-t border-slate-200/60 dark:border-slate-800 animate-in slide-in-from-top-2 duration-200 space-y-6">
                            
                            {/* Tab Switcher */}
                            <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg mb-4">
                                <button onClick={() => setPlannerTab('basic')} className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${plannerTab === 'basic' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>Basic</button>
                                <button onClick={() => setPlannerTab('advanced')} className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${plannerTab === 'advanced' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>Advanced</button>
                            </div>

                            {plannerTab === 'basic' ? (
                                // Basic Mode
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Projected Annual Income</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">$</span>
                                                <input 
                                                    type="number" 
                                                    value={plannerData.income || ''} 
                                                    onChange={e => setPlannerData(p => ({...p, income: Number(e.target.value)}))}
                                                    className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Projected Annual Expenses</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">$</span>
                                                <input 
                                                    type="number" 
                                                    value={plannerData.expenses || ''} 
                                                    onChange={e => setPlannerData(p => ({...p, expenses: Number(e.target.value)}))}
                                                    className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1 text-right">
                                                Proj. Profit: {formatCurrency.format(plannerResults.profit)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Filing Status</label>
                                            <select 
                                                value={plannerData.filingStatus} 
                                                onChange={e => setPlannerData(p => ({...p, filingStatus: e.target.value as any}))}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                            >
                                                <option value="single">Single</option>
                                                <option value="joint">Married Filing Jointly</option>
                                                <option value="head">Head of Household</option>
                                                <option value="separate">Married Filing Separately</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Est. Income Tax Rate</label>
                                            <div className="flex gap-2 mb-2">
                                                {[10, 15, 20].map(rate => (
                                                    <button 
                                                        key={rate}
                                                        onClick={() => setPlannerData(p => ({...p, taxRate: rate, useCustomRate: false}))}
                                                        className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${!plannerData.useCustomRate && plannerData.taxRate === rate ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                                                    >
                                                        {rate}%
                                                    </button>
                                                ))}
                                                <button 
                                                    onClick={() => setPlannerData(p => ({...p, useCustomRate: true}))}
                                                    className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${plannerData.useCustomRate ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                                                >
                                                    Custom
                                                </button>
                                            </div>
                                            {plannerData.useCustomRate && (
                                                <div className="relative">
                                                    <input 
                                                        type="number" 
                                                        value={plannerData.taxRate} 
                                                        onChange={e => setPlannerData(p => ({...p, taxRate: Number(e.target.value)}))}
                                                        className="w-full pl-3 pr-8 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm font-bold text-slate-900 dark:text-white outline-none"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold text-xs">%</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-100 dark:border-slate-800/50">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Apply SE Tax (~15.3%)</label>
                                            <button 
                                                onClick={() => setPlannerData(p => ({...p, useSE: !p.useSE}))}
                                                className={`w-10 h-5 rounded-full relative transition-colors ${plannerData.useSE ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                            >
                                                <div className={`absolute top-1 bottom-1 w-3 bg-white rounded-full transition-all ${plannerData.useSE ? 'left-6' : 'left-1'}`} />
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Standard Deduction (2026)</label>
                                            <button 
                                                onClick={() => setPlannerData(p => ({...p, useStdDed: !p.useStdDed}))}
                                                className={`w-10 h-5 rounded-full relative transition-colors ${plannerData.useStdDed ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                            >
                                                <div className={`absolute top-1 bottom-1 w-3 bg-white rounded-full transition-all ${plannerData.useStdDed ? 'left-6' : 'left-1'}`} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Annual Retirement Contrib.</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">$</span>
                                                <input 
                                                    type="number" 
                                                    value={plannerData.retirement || ''} 
                                                    onChange={e => setPlannerData(p => ({...p, retirement: Number(e.target.value)}))}
                                                    className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Expected Annual Credits</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">$</span>
                                                <input 
                                                    type="number" 
                                                    value={plannerData.credits || ''} 
                                                    onChange={e => setPlannerData(p => ({...p, credits: Number(e.target.value)}))}
                                                    className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                // Advanced Mode
                                <div className="space-y-6">
                                    {/* Reused Core Inputs */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Projected Annual Income</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">$</span>
                                                <input 
                                                    type="number" 
                                                    value={plannerData.income || ''} 
                                                    onChange={e => setPlannerData(p => ({...p, income: Number(e.target.value)}))}
                                                    className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Projected Annual Expenses</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">$</span>
                                                <input 
                                                    type="number" 
                                                    value={plannerData.expenses || ''} 
                                                    onChange={e => setPlannerData(p => ({...p, expenses: Number(e.target.value)}))}
                                                    className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                                    placeholder="0"
                                                />
                                            </div>
                                            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1 text-right">
                                                Proj. Profit: {formatCurrency.format(plannerResults.profit)}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Filing Status</label>
                                            <select 
                                                value={plannerData.filingStatus} 
                                                onChange={e => setPlannerData(p => ({...p, filingStatus: e.target.value as any}))}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
                                            >
                                                <option value="single">Single</option>
                                                <option value="joint">Married Filing Jointly</option>
                                                <option value="head">Head of Household</option>
                                                <option value="separate">Married Filing Separately</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Est. Income Tax Rate</label>
                                            <div className="flex gap-2 mb-2">
                                                {[10, 15, 20].map(rate => (
                                                    <button 
                                                        key={rate}
                                                        onClick={() => setPlannerData(p => ({...p, taxRate: rate, useCustomRate: false}))}
                                                        className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${!plannerData.useCustomRate && plannerData.taxRate === rate ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                                                    >
                                                        {rate}%
                                                    </button>
                                                ))}
                                                <button 
                                                    onClick={() => setPlannerData(p => ({...p, useCustomRate: true}))}
                                                    className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${plannerData.useCustomRate ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                                                >
                                                    Custom
                                                </button>
                                            </div>
                                            {plannerData.useCustomRate && (
                                                <div className="relative">
                                                    <input 
                                                        type="number" 
                                                        value={plannerData.taxRate} 
                                                        onChange={e => setPlannerData(p => ({...p, taxRate: Number(e.target.value)}))}
                                                        className="w-full pl-3 pr-8 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm font-bold text-slate-900 dark:text-white outline-none"
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold text-xs">%</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Advanced Sections */}
                                    <div className="space-y-4">
                                        {/* Section A: Other Income */}
                                        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                                            <button onClick={() => setAdvSection(advSection === 'income' ? null : 'income')} className="flex items-center justify-between w-full p-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center"><Wallet size={16}/></div>
                                                    <div className="text-left">
                                                        <div className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">A. Other Income</div>
                                                        <div className="text-xs text-slate-600 dark:text-slate-300">Interest, Dividends, Capital Gains</div>
                                                    </div>
                                                </div>
                                                {advSection === 'income' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                            </button>
                                            {advSection === 'income' && (
                                                <div className="p-4 bg-white dark:bg-slate-950 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                                    <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Interest</label><input type="number" value={plannerData.otherIncomeInterest || ''} onChange={e => setPlannerData(p => ({...p, otherIncomeInterest: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-sm outline-none" placeholder="0"/></div>
                                                    <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Dividends</label><input type="number" value={plannerData.otherIncomeDividends || ''} onChange={e => setPlannerData(p => ({...p, otherIncomeDividends: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-sm outline-none" placeholder="0"/></div>
                                                    <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Capital Gains</label><input type="number" value={plannerData.otherIncomeCapital || ''} onChange={e => setPlannerData(p => ({...p, otherIncomeCapital: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-sm outline-none" placeholder="0"/></div>
                                                    <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Other</label><input type="number" value={plannerData.otherIncomeOther || ''} onChange={e => setPlannerData(p => ({...p, otherIncomeOther: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-sm outline-none" placeholder="0"/></div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Section B: Deductions */}
                                        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                                            <button onClick={() => setAdvSection(advSection === 'deductions' ? null : 'deductions')} className="flex items-center justify-between w-full p-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><FileText size={16}/></div>
                                                    <div className="text-left">
                                                        <div className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">B. Deductions</div>
                                                        <div className="text-xs text-slate-600 dark:text-slate-300">Standard vs. Itemized</div>
                                                    </div>
                                                </div>
                                                {advSection === 'deductions' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                            </button>
                                            {advSection === 'deductions' && (
                                                <div className="p-4 bg-white dark:bg-slate-950 animate-in slide-in-from-top-2">
                                                    <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg mb-4">
                                                        <button onClick={() => setPlannerData(p => ({...p, deductionMode: 'standard'}))} className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${plannerData.deductionMode === 'standard' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500'}`}>Standard</button>
                                                        <button onClick={() => setPlannerData(p => ({...p, deductionMode: 'itemized'}))} className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${plannerData.deductionMode === 'itemized' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500'}`}>Itemized</button>
                                                    </div>
                                                    {plannerData.deductionMode === 'itemized' ? (
                                                        <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Total Itemized Deductions</label><input type="number" value={plannerData.itemizedDeduction || ''} onChange={e => setPlannerData(p => ({...p, itemizedDeduction: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none" placeholder="0"/></div>
                                                    ) : (
                                                        <div className="text-sm text-slate-600 dark:text-slate-300">Using 2026 Standard Deduction for <b>{plannerData.filingStatus}</b>: {formatCurrency.format(plannerResults.deduction)}</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Section C: Adjustments */}
                                        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                                            <button onClick={() => setAdvSection(advSection === 'adjustments' ? null : 'adjustments')} className="flex items-center justify-between w-full p-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center"><Shield size={16}/></div>
                                                    <div className="text-left">
                                                        <div className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">C. Adjustments</div>
                                                        <div className="text-xs text-slate-600 dark:text-slate-300">Retirement, HSA, Health Ins</div>
                                                    </div>
                                                </div>
                                                {advSection === 'adjustments' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                            </button>
                                            {advSection === 'adjustments' && (
                                                <div className="p-4 bg-white dark:bg-slate-950 grid grid-cols-1 gap-4 animate-in slide-in-from-top-2">
                                                    <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Retirement Contributions</label><input type="number" value={plannerData.retirement || ''} onChange={e => setPlannerData(p => ({...p, retirement: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none" placeholder="0"/></div>
                                                    <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">HSA Contributions</label><input type="number" value={plannerData.adjustmentHSA || ''} onChange={e => setPlannerData(p => ({...p, adjustmentHSA: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none" placeholder="0"/></div>
                                                    <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">SE Health Insurance</label><input type="number" value={plannerData.adjustmentHealth || ''} onChange={e => setPlannerData(p => ({...p, adjustmentHealth: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none" placeholder="0"/></div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Section D: Credits & SE Tax */}
                                        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                                            <button onClick={() => setAdvSection(advSection === 'credits' ? null : 'credits')} className="flex items-center justify-between w-full p-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center"><CreditCard size={16}/></div>
                                                    <div className="text-left">
                                                        <div className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">D. Credits & Taxes</div>
                                                        <div className="text-xs text-slate-600 dark:text-slate-300">Credits, SE Tax Toggle</div>
                                                    </div>
                                                </div>
                                                {advSection === 'credits' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                            </button>
                                            {advSection === 'credits' && (
                                                <div className="p-4 bg-white dark:bg-slate-950 animate-in slide-in-from-top-2 space-y-4">
                                                    <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Expected Credits ($)</label><input type="number" value={plannerData.credits || ''} onChange={e => setPlannerData(p => ({...p, credits: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none" placeholder="0"/></div>
                                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-900">
                                                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Apply SE Tax (~15.3%)</label>
                                                        <button 
                                                            onClick={() => setPlannerData(p => ({...p, useSE: !p.useSE}))}
                                                            className={`w-10 h-5 rounded-full relative transition-colors ${plannerData.useSE ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                                        >
                                                            <div className={`absolute top-1 bottom-1 w-3 bg-white rounded-full transition-all ${plannerData.useSE ? 'left-6' : 'left-1'}`} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Section E: QBI Deduction (Optional) */}
                                        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                                            <button onClick={() => setAdvSection(advSection === 'qbi' ? null : 'qbi')} className="flex items-center justify-between w-full p-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center"><Briefcase size={16}/></div>
                                                    <div className="text-left">
                                                        <div className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">E. QBI Deduction (Optional)</div>
                                                        <div className="text-xs text-slate-600 dark:text-slate-300">Section 199A Estimate</div>
                                                    </div>
                                                </div>
                                                {advSection === 'qbi' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                            </button>
                                            {advSection === 'qbi' && (
                                                <div className="p-4 bg-white dark:bg-slate-950 animate-in slide-in-from-top-2 space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Apply QBI Deduction</label>
                                                        <button 
                                                            onClick={() => setPlannerData(p => ({...p, applyQBI: !p.applyQBI}))}
                                                            className={`w-10 h-5 rounded-full relative transition-colors ${plannerData.applyQBI ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                                        >
                                                            <div className={`absolute top-1 bottom-1 w-3 bg-white rounded-full transition-all ${plannerData.applyQBI ? 'left-6' : 'left-1'}`} />
                                                        </button>
                                                    </div>
                                                    {plannerData.applyQBI && (
                                                        <>
                                                            <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">QBI Amount Override ($)</label><input type="number" value={plannerData.qbiOverride || ''} onChange={e => setPlannerData(p => ({...p, qbiOverride: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none" placeholder="Default: Profit"/></div>
                                                            <div className="text-xs text-slate-600 dark:text-slate-300 italic">Eligibility limits vary. Estimate is 20% of QBI base.</div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Section F: Payments & On-Track */}
                                        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                                            <button onClick={() => setAdvSection(advSection === 'payments' ? null : 'payments')} className="flex items-center justify-between w-full p-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center"><CheckCircle size={16}/></div>
                                                    <div className="text-left">
                                                        <div className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">F. Payments & On-Track</div>
                                                        <div className="text-xs text-slate-600 dark:text-slate-300">YTD Status & Suggestions</div>
                                                    </div>
                                                </div>
                                                {advSection === 'payments' ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                                            </button>
                                            {advSection === 'payments' && (
                                                <div className="p-4 bg-white dark:bg-slate-950 animate-in slide-in-from-top-2 space-y-4">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Est. Payments YTD</label><input type="number" value={plannerData.paymentsYTD || ''} onChange={e => setPlannerData(p => ({...p, paymentsYTD: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-sm outline-none" placeholder="0"/></div>
                                                        <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Withholding YTD</label><input type="number" value={plannerData.withholdingYTD || ''} onChange={e => setPlannerData(p => ({...p, withholdingYTD: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-sm outline-none" placeholder="0"/></div>
                                                    </div>
                                                    <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Last Year Total Tax (Reference)</label><input type="number" value={plannerData.lastYearTaxRef || ''} onChange={e => setPlannerData(p => ({...p, lastYearTaxRef: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none" placeholder="Optional"/></div>
                                                    
                                                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-900">
                                                        <div className="text-xs font-bold uppercase text-blue-600 dark:text-blue-400 mb-1">Quarterly Suggestion</div>
                                                        <div className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency.format(plannerResults.quarterlySuggestion)} <span className="text-xs font-normal text-slate-500">x 4 payments</span></div>
                                                        <div className="text-[10px] text-slate-600 dark:text-slate-300 mt-2">
                                                            Next Due Dates: Apr 15, Jun 15, Sep 15, Jan 15.
                                                            <br/>Dates may shift for weekends/holidays.
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-5 space-y-3 border border-slate-200 dark:border-slate-800">
                                {plannerTab === 'advanced' && (
                                    <>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-600 dark:text-slate-300 font-medium">Other Income</span>
                                            <span className="font-bold text-slate-900 dark:text-white">{formatCurrency.format(plannerResults.otherIncome)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-600 dark:text-slate-300 font-medium">Total Adjustments</span>
                                            <span className="font-bold text-slate-900 dark:text-white">-{formatCurrency.format(plannerResults.adjustments)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-600 dark:text-slate-300 font-medium">Deduction Used ({plannerData.deductionMode === 'itemized' ? 'Itemized' : 'Standard'})</span>
                                            <span className="font-bold text-slate-900 dark:text-white">-{formatCurrency.format(plannerResults.deduction)}</span>
                                        </div>
                                        {plannerResults.qbiDeduction > 0 && (
                                           <div className="flex justify-between items-center text-sm">
                                               <span className="text-slate-600 dark:text-slate-300 font-medium">QBI Deduction (Est.)</span>
                                               <span className="font-bold text-emerald-600 dark:text-emerald-400">-{formatCurrency.format(plannerResults.qbiDeduction)}</span>
                                           </div>
                                        )}
                                    </>
                                )}
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600 dark:text-slate-300 font-medium">Projected Taxable Income</span>
                                    <span className="font-bold text-slate-900 dark:text-white">{formatCurrency.format(plannerResults.taxableIncome)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600 dark:text-slate-300 font-medium">Income Tax (Annual)</span>
                                    <span className="font-bold text-slate-900 dark:text-white">{formatCurrency.format(plannerResults.incomeTax)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600 dark:text-slate-300 font-medium">SE Tax (Annual)</span>
                                    <span className="font-bold text-slate-900 dark:text-white">{formatCurrency.format(plannerResults.seTax)}</span>
                                </div>
                                <div className="h-px bg-slate-200 dark:bg-slate-700 my-2" />
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-extrabold uppercase text-slate-700 dark:text-slate-200">Total Est. Annual Tax</span>
                                    <span className="text-xl font-extrabold text-slate-900 dark:text-white">{formatCurrency.format(plannerResults.totalTax)}</span>
                                </div>
                                {plannerTab === 'advanced' ? (
                                    <>
                                        <div className="flex justify-between items-center text-sm mt-1">
                                            <span className="text-slate-600 dark:text-slate-300 font-medium">Less: Paid YTD</span>
                                            <span className="font-bold text-slate-900 dark:text-white">-{formatCurrency.format(plannerResults.paidSoFar)}</span>
                                        </div>
                                        <div className="h-px bg-slate-200 dark:bg-slate-700 my-2" />
                                        <div className="flex justify-between items-center">
                                             <div className="flex items-center gap-2">
                                                <span className="text-sm font-extrabold uppercase text-slate-700 dark:text-slate-200">{plannerResults.taxAhead > 0 ? 'Ahead by' : 'Remaining Due'}</span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${plannerResults.taxAhead > 0 ? 'bg-emerald-100 text-emerald-700' : plannerResults.taxRemaining > 0 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {plannerResults.taxAhead > 0 ? 'Ahead' : plannerResults.taxRemaining > 0 ? 'Behind' : 'On Track'}
                                                </span>
                                             </div>
                                             <span className={`text-xl font-extrabold ${plannerResults.taxAhead > 0 ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>{formatCurrency.format(plannerResults.taxAhead > 0 ? plannerResults.taxAhead : plannerResults.taxRemaining)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                        <div className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 text-center">
                                            <div className="text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300">Monthly Set-Aside</div>
                                            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency.format(plannerResults.monthly)}</div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 text-center">
                                            <div className="text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300">Quarterly Payment</div>
                                            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency.format(plannerResults.quarterly)}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

              {/* P&L Preview Modal */}
              {showPLPreview && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-stretch justify-stretch p-0">
                  <div className="bg-white dark:bg-slate-900 rounded-none w-full h-full overflow-hidden flex flex-col">
                    {/* Modal Header */}
                    <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        {isGeneratingPLPdf ? (
                          <Loader2 className="animate-spin text-blue-600" size={18} />
                        ) : plExportRequested ? (
                          <Download className="text-emerald-600" size={18} />
                        ) : (
                          <Eye className="text-blue-600" size={18} />
                        )}
                        <span className="font-bold text-sm uppercase tracking-wider text-slate-700 dark:text-slate-200">
                          {isGeneratingPLPdf ? 'Generating PDF...' : plExportRequested ? 'Exporting PDF...' : 'Previewing P&L'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isGeneratingPLPdf && !plExportRequested && (
                          <>
                            <button
                              onClick={sharePLPDF}
                              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors"
                            >
                              <Share2 className="w-4 h-4" />
                              <span className="hidden sm:inline">Share</span>
                            </button>

                            <button
                              onClick={() => setPlExportRequested(true)}
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm flex items-center gap-2 transition-colors"
                            >
                              <Download className="w-4 h-4" />
                              <span className="hidden sm:inline">Download PDF</span>
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => { setPlExportRequested(false); setShowPLPreview(false); }}
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* PDF Preview Content */}
                    <div className="flex-1 overflow-y-auto p-0 bg-white">
                      <div id="pl-pdf-preview-content" className="w-full min-h-full bg-white text-gray-900 p-6 sm:p-10" style={{ backgroundColor: '#ffffff', color: '#111827' }}>
                        {/* Header */}
                        <div className="mb-8 pb-6 border-b-2 border-gray-400">
                          <div className="flex items-start gap-4">
                            <Building size={32} className="mt-1 text-blue-600" />
                            <div className="flex-1 min-w-0">
                              <h1 className="text-2xl font-bold text-gray-900 mb-1 text-left">{settings.businessName}</h1>
                              {settings.businessAddress && (
                                <p className="text-sm text-gray-700 whitespace-pre-line text-left">{settings.businessAddress}</p>
                              )}
                              <div className="mt-4 text-left">
                                <h2 className="text-xl font-bold text-gray-900 uppercase">Profit &amp; Loss Statement</h2>
                                <p className="text-sm text-gray-700 mt-1">
                                  Period: {filterPeriod === 'month' ? referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) :
                                      filterPeriod === 'quarter' ? `Q${Math.floor(referenceDate.getMonth() / 3) + 1} ${referenceDate.getFullYear()}` :
                                      filterPeriod === 'year' ? referenceDate.getFullYear().toString() : 'All Time'}
                                </p>
                                <p className="text-xs text-gray-600 mt-1">
                                  Generated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Revenue Section */}
                        <div className="mb-8">
                          <div className="flex items-center gap-2 mb-4">
                            <TrendingUp className="w-5 h-5 text-emerald-600" />
                            <h3 className="text-lg font-bold text-gray-900 uppercase">Revenue</h3>
                          </div>
                          <div className="space-y-2 ml-7">
                            {(() => {
                              const incomeByCategory = filteredTransactions.filter(t => t.type === 'income').reduce((acc, t) => {
                                acc[t.category] = (acc[t.category] || 0) + t.amount;
                                return acc;
                              }, {} as Record<string, number>);
                              return Object.entries(incomeByCategory).map(([category, amount]) => (
                                <div key={category} className="flex items-start justify-between gap-4 py-2">
                                  <span className="text-sm text-gray-800 flex-1 min-w-0 break-words">{category}</span>
                                  <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">{formatCurrency.format(amount)}</span>
                                </div>
                              ));
                            })()}
                          </div>
                          <div className="flex justify-between items-center py-3 mt-2 border-t border-gray-400">
                            <span className="font-bold text-gray-900">Total Revenue</span>
                            <span className="text-lg font-bold text-emerald-600 tabular-nums">{formatCurrency.format(reportData.income)}</span>
                          </div>
                        </div>

                        {/* Expenses Section */}
                        <div className="mb-8">
                          <div className="flex items-center gap-2 mb-4">
                            <TrendingDown className="w-5 h-5 text-red-600" />
                            <h3 className="text-lg font-bold text-gray-900 uppercase">Operating Expenses</h3>
                          </div>
                          <div className="space-y-2 ml-7">
                            {(() => {
                              const expensesByCategory = filteredTransactions.filter(t => t.type === 'expense').reduce((acc, t) => {
                                acc[t.category] = (acc[t.category] || 0) + t.amount;
                                return acc;
                              }, {} as Record<string, number>);
                              return Object.entries(expensesByCategory).map(([category, amount]) => (
                                <div key={category} className="flex items-start justify-between gap-4 py-2">
                                  <span className="text-sm text-gray-800 flex-1 min-w-0 break-words">{category}</span>
                                  <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">{formatCurrency.format(amount)}</span>
                                </div>
                              ));
                            })()}
                          </div>
                          <div className="flex justify-between items-center py-3 mt-2 border-t border-gray-400">
                            <span className="font-bold text-gray-900">Total Expenses</span>
                            <span className="text-lg font-bold text-red-600 tabular-nums">{formatCurrency.format(reportData.expense)}</span>
                          </div>
                        </div>

                        {/* Net Profit Section */}
                        <div className="pt-6 border-t-2 border-gray-900">
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-xl font-bold text-gray-900 uppercase">Net Profit</span>
                            <span className={`text-3xl font-bold tabular-nums ${reportData.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatCurrency.format(reportData.netProfit)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-2 bg-gray-100 px-4 rounded">
                            <span className="text-sm font-semibold text-gray-800">Profit Margin</span>
                            <span className={`text-lg font-bold tabular-nums ${reportData.income > 0 && reportData.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {reportData.income > 0 ? `${((reportData.netProfit / reportData.income) * 100).toFixed(1)}%` : '—'}
                            </span>
                          </div>
                        </div>

                        {/* Summary Statistics */}
                        <div className="mt-8 pt-6 border-t border-gray-300">
                          <h4 className="text-sm font-bold text-gray-700 uppercase mb-3">Transaction Summary</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="bg-gray-100 p-3 rounded">
                              <div className="text-xs text-gray-700 mb-1">Income Transactions</div>
                              <div className="text-xl font-bold text-gray-900">
                                {filteredTransactions.filter(t => t.type === 'income').length}
                              </div>
                            </div>
                            <div className="bg-gray-100 p-3 rounded">
                              <div className="text-xs text-gray-700 mb-1">Expense Transactions</div>
                              <div className="text-xl font-bold text-gray-900">
                                {filteredTransactions.filter(t => t.type === 'expense').length}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="mt-8 pt-6 border-t border-gray-300 text-center">
                          <p className="text-xs text-gray-600">
                            This statement has been prepared from the books of {settings.businessName}.
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            For period ending {filterPeriod === 'month' ? referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) :
                                              filterPeriod === 'quarter' ? `Q${Math.floor(referenceDate.getMonth() / 3) + 1} ${referenceDate.getFullYear()}` :
                                              filterPeriod === 'year' ? referenceDate.getFullYear().toString() : 'All Time'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Modal Footer */}
                    <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
                      <button
                        onClick={() => setShowPLPreview(false)}
                        className="px-6 py-3 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        Close
                      </button>
                      <button
                        onClick={async () => {
                          setIsGeneratingPDF(true);
                          try {
                            const element = document.getElementById('pl-pdf-preview-content');
                            if (!element) throw new Error('Preview content not found');
                            
                            const periodLabel = filterPeriod === 'month' 
                              ? referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                              : filterPeriod === 'quarter' 
                                ? `Q${Math.floor(referenceDate.getMonth() / 3) + 1} ${referenceDate.getFullYear()}`
                                : filterPeriod === 'year'
                                  ? referenceDate.getFullYear().toString()
                                  : 'All-Time';
                            
                            // IMPORTANT (iPhone/Safari): getBoundingClientRect() can under-report height for
                            // long, scrollable content, which causes the bottom of the PDF (notes/footer) to be cut off.
                            // Solution: clone to an off-screen wrapper (no scroll clipping) and size the PDF
                            // to the full scrollHeight so the export is ONE long page (no page breaks).
                            let cloneWrapper: HTMLDivElement | null = null;
                            try {
                              const source = element as HTMLElement;

                              cloneWrapper = document.createElement('div');
                              cloneWrapper.style.position = 'fixed';
                              cloneWrapper.style.left = '-100000px';
                              cloneWrapper.style.top = '0';
                              cloneWrapper.style.width = `${source.scrollWidth}px`;
                              cloneWrapper.style.background = '#ffffff';
                              cloneWrapper.style.padding = '0';
                              cloneWrapper.style.margin = '0';
                              cloneWrapper.style.zIndex = '-1';

                              const clone = source.cloneNode(true) as HTMLElement;
                              clone.style.height = 'auto';
                              clone.style.maxHeight = 'none';
                              clone.style.overflow = 'visible';

                              cloneWrapper.appendChild(clone);
                              document.body.appendChild(cloneWrapper);

                              await new Promise(resolve => requestAnimationFrame(() => resolve(true)));

                              const contentWidth = clone.scrollWidth;
                              const contentHeight = clone.scrollHeight;

                              const pxToMm = 0.264583; // 96 DPI px -> mm
                              const pageWidthMm = 210;
                              const marginMm = 8;
                              const contentWidthMm = pageWidthMm - (marginMm * 2);

                              const scaleFactor = contentWidthMm / (contentWidth * pxToMm);
                              const pageHeightMm = Math.ceil((contentHeight * pxToMm * scaleFactor) + (marginMm * 2) + 2);

                              const opt = {
                                margin: [marginMm, marginMm, marginMm, marginMm],
                                filename: `PL-Statement-${periodLabel.replace(/\s+/g, '-')}.pdf`,
                                image: { type: 'jpeg', quality: 0.95 },
                                html2canvas: {
                                  scale: 2,
                                  useCORS: true,
                                  backgroundColor: '#ffffff',
                                  logging: false,
                                  scrollY: 0,
                                  scrollX: 0,
                                  windowWidth: contentWidth,
                                  windowHeight: contentHeight
                                },
                                jsPDF: {
                                  unit: 'mm',
                                  format: [pageWidthMm, Math.max(297, pageHeightMm)],
                                  orientation: 'portrait'
                                },
                                pagebreak: { mode: 'avoid-all' }
                              };

                              await html2pdf().set(opt).from(clone).save();
                            } finally {
                              if (cloneWrapper && cloneWrapper.parentNode) cloneWrapper.parentNode.removeChild(cloneWrapper);
                            }
                            showToast('PDF exported successfully!', 'success');
                            setTimeout(() => setShowPLPreview(false), 1000);
                          } catch (error) {
                            console.error('PDF generation error:', error);
                            showToast('Failed to generate PDF. Please try again.', 'error');
                          }
                          setIsGeneratingPDF(false);
                        }}
                        disabled={isGeneratingPDF}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <Download className="w-4 h-4" />
                        {isGeneratingPDF ? 'Generating...' : 'Export PDF'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-md"><div className="flex items-center gap-2 mb-4 text-emerald-600"><Shield size={20} /><span className="font-bold uppercase tracking-widest text-xs">Tax Shield</span></div><div className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">{formatCurrency.format(reportData.taxShield)}</div><p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">Your expenses have lowered your estimated tax bill by this amount. Every valid business expense saves you money at tax time.</p></div>
                 
                 <div className="bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-md">
                   <div className="flex items-center gap-2 mb-4 text-blue-600">
                     <BookOpen size={20} />
                     <span className="font-bold uppercase tracking-widest text-xs">2026 Standard Deduction</span>
                   </div>
                   
                   {/* Filing Status Dropdown */}
                   <div className="mb-4">
                     <label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 block uppercase tracking-wide">Filing Status</label>
                     <select
                       value={settings.filingStatus}
                       onChange={(e) => {
                         const newStatus = e.target.value as FilingStatus;
                         setSettings(prev => ({ ...prev, filingStatus: newStatus }));
                       }}
                       className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20"
                     >
                       <option value="single">Single</option>
                       <option value="joint">Married Filing Jointly</option>
                       <option value="separate">Married Filing Separately</option>
                       <option value="head">Head of Household</option>
                     </select>
                   </div>
                   
                   {/* Deduction Amount */}
                   <div className="mb-3">
                     <div className="text-3xl font-extrabold text-slate-900 dark:text-white">
                       {(() => {
                         if (settings.filingStatus === 'joint') return formatCurrency.format(TAX_PLANNER_2026.STD_DEDUCTION_JOINT);
                         if (settings.filingStatus === 'head') return formatCurrency.format(TAX_PLANNER_2026.STD_DEDUCTION_HEAD);
                         return formatCurrency.format(TAX_PLANNER_2026.STD_DEDUCTION_SINGLE);
                       })()}
                     </div>
                   </div>
                   
                   <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                     Compare your personal itemized deductions against this standard amount. This affects your personal income tax, not SE tax.
                   </p>
                 </div>
              </div>
           </div>
        )}

        {/* Pro P&L Preview Modal - OUTSIDE Reports conditional for proper rendering */}
        {showProPLPreview && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-stretch justify-stretch p-0">
            <div className="bg-gray-100 w-full h-full overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:p-4 border-b border-gray-300 bg-white flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowProPLPreview(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <span className="font-bold text-sm text-gray-900">P&L Preview</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={shareProPLPDF}
                    disabled={isGeneratingProPLPdf}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Share2 size={16} />
                    <span>Share</span>
                  </button>
                <button
                  onClick={async () => {
                    setIsGeneratingProPLPdf(true);
                    try {
                      await new Promise(resolve => setTimeout(resolve, 300));
                      const element = document.getElementById('pro-pl-pdf-content');
                      if (!element) throw new Error('Preview content not found');

                      // Same iPhone-safe export logic as above: clone off-screen, measure full scrollHeight,
                      // and size the PDF to a single long page so nothing is cut off.
                      let cloneWrapper: HTMLDivElement | null = null;
                      try {
                        const source = element as HTMLElement;

                        cloneWrapper = document.createElement('div');
                        cloneWrapper.style.position = 'fixed';
                        cloneWrapper.style.left = '-100000px';
                        cloneWrapper.style.top = '0';
                        cloneWrapper.style.width = `${source.scrollWidth}px`;
                        cloneWrapper.style.background = '#ffffff';
                        cloneWrapper.style.padding = '0';
                        cloneWrapper.style.margin = '0';
                        cloneWrapper.style.zIndex = '-1';

                        const clone = source.cloneNode(true) as HTMLElement;
                        clone.style.height = 'auto';
                        clone.style.maxHeight = 'none';
                        clone.style.overflow = 'visible';

                        cloneWrapper.appendChild(clone);
                        document.body.appendChild(cloneWrapper);

                        await new Promise(resolve => requestAnimationFrame(() => resolve(true)));

                        const contentWidth = clone.scrollWidth;
                        const contentHeight = clone.scrollHeight;

                        const pxToMm = 0.264583;
                        const pageWidthMm = 210;
                        const marginMm = 8;
                        const contentWidthMm = pageWidthMm - (marginMm * 2);
                        const scaleFactor = contentWidthMm / (contentWidth * pxToMm);
                        const pageHeightMm = Math.ceil((contentHeight * pxToMm * scaleFactor) + (marginMm * 2) + 2);

                        const opt = {
                          margin: [marginMm, marginMm, marginMm, marginMm],
                          filename: `PL_${settings.businessName.replace(/[^a-z0-9]/gi, '_')}_${proPLData.startDate.toISOString().split('T')[0]}.pdf`,
                          image: { type: 'jpeg', quality: 0.95 },
                          html2canvas: {
                            scale: 2,
                            useCORS: true,
                            backgroundColor: '#ffffff',
                            logging: false,
                            scrollY: 0,
                            scrollX: 0,
                            windowWidth: contentWidth,
                            windowHeight: contentHeight
                          },
                          jsPDF: {
                            unit: 'mm',
                            format: [pageWidthMm, Math.max(297, pageHeightMm)],
                            orientation: 'portrait'
                          },
                          pagebreak: { mode: 'avoid-all' }
                        };

                        await html2pdf().set(opt).from(clone).save();
                      } finally {
                        if (cloneWrapper && cloneWrapper.parentNode) cloneWrapper.parentNode.removeChild(cloneWrapper);
                      }
                      showToast('PDF exported!', 'success');
                    } catch (error) {
                      console.error('PDF error:', error);
                      showToast('Export failed', 'error');
                    }
                    setIsGeneratingProPLPdf(false);
                  }}
                  disabled={isGeneratingProPLPdf}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isGeneratingProPLPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  <span>{isGeneratingProPLPdf ? 'Exporting...' : 'Download PDF'}</span>
                </button>
                </div>
              </div>

              {/* PDF Content */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                <div id="pro-pl-pdf-content" className="bg-white text-gray-900 rounded-lg shadow-lg mx-auto overflow-hidden" style={{ fontFamily: 'system-ui, -apple-system, sans-serif', width: '700px', maxWidth: '100%' }}>
                  {/* Report Header - Left Aligned */}
                  <div className="px-5 py-5 border-b-2 border-gray-300 bg-gray-50">
                    <div>
                      {settings.businessLogo && (
                        <img
                          src={settings.businessLogo}
                          alt="Logo"
                          className="h-10 sm:h-14 w-auto object-contain mb-2"
                          crossOrigin="anonymous"
                        />
                      )}
                      <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wide">{settings.businessName}</h1>
                      <h2 className="text-base font-semibold text-gray-700 mt-1">Profit & Loss Statement</h2>
                      <p className="text-sm text-gray-600 mt-2">
                        Period: {proPLData.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – {proPLData.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{plAccountingBasis === 'cash' ? 'Cash' : 'Accrual'} Basis | USD | Generated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                  </div>

                  {/* Column Headers */}
                  <div className="px-5 py-2 bg-gray-100 border-b border-gray-300">
                    <div className="flex items-center text-xs font-bold text-gray-600 uppercase">
                      <div className="flex-1 min-w-0">Account</div>
                      <div className="w-28 text-right flex-shrink-0">Amount</div>
                      <div className="w-16 text-right flex-shrink-0">% Rev</div>
                    </div>
                  </div>

                  {/* Report Body */}
                  <div className="px-5 py-3">
                    {/* REVENUE - with category breakdown */}
                    <div className="mb-5">
                      <div className="font-bold text-sm text-gray-900 uppercase tracking-wide py-2 border-b border-gray-200">Revenue</div>
                      
                      {/* Income by Category */}
                      {Object.entries(proPLData.incomeByCategory)
                        .sort(([,a], [,b]) => b - a)
                        .map(([category, amount]) => (
                          <div key={category} className="flex items-center py-1.5">
                            <div className="flex-1 pl-4 text-gray-700 truncate">{category}</div>
                            <div className="w-28 text-right font-medium tabular-nums">{formatCurrency.format(amount)}</div>
                            <div className="w-16 text-right text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((amount / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                          </div>
                        ))}
                      
                      {/* Total Gross Sales (if multiple categories) */}
                      {Object.keys(proPLData.incomeByCategory).length > 1 && (
                        <div className="flex items-center py-1.5 font-semibold border-t border-gray-200 mt-1">
                          <div className="flex-1 pl-2 text-gray-800">Total Gross Sales</div>
                          <div className="w-28 text-right tabular-nums">{formatCurrency.format(proPLData.salesServices)}</div>
                          <div className="w-16 text-right text-xs"></div>
                        </div>
                      )}
                      
                      {proPLData.refunds > 0 && (
                        <div className="flex items-center py-2">
                          <div className="flex-1 pl-4 text-gray-700 italic">Less: Returns & Refunds</div>
                          <div className="w-28 text-right font-medium tabular-nums text-red-600">({formatCurrency.format(proPLData.refunds)})</div>
                          <div className="w-16 text-right"></div>
                        </div>
                      )}
                      <div className="flex items-center py-2 font-bold border-t border-gray-300 mt-2">
                        <div className="flex-1 text-gray-900">NET REVENUE</div>
                        <div className="w-28 text-right tabular-nums text-emerald-700">{formatCurrency.format(proPLData.netRevenue)}</div>
                        <div className="w-16 text-right text-xs">100.0%</div>
                      </div>
                    </div>

                    {/* COGS - with category breakdown */}
                    {proPLData.cogs > 0 && (
                      <div className="mb-5">
                        <div className="font-bold text-sm text-gray-900 uppercase tracking-wide py-2 border-b border-gray-200">Cost of Goods Sold</div>
                        
                        {/* COGS by Category */}
                        {Object.entries(proPLData.cogsByCategory)
                          .sort(([,a], [,b]) => b - a)
                          .map(([category, amount]) => (
                            <div key={category} className="flex items-center py-1.5">
                              <div className="flex-1 pl-4 text-gray-700 truncate">{category}</div>
                              <div className="w-28 text-right font-medium tabular-nums">{formatCurrency.format(amount)}</div>
                              <div className="w-16 text-right text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((amount / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                            </div>
                          ))}
                        
                        {/* Total COGS (if multiple categories) */}
                        {Object.keys(proPLData.cogsByCategory).length > 1 && (
                          <div className="flex items-center py-1.5 font-semibold border-t border-gray-200 mt-1">
                            <div className="flex-1 pl-2 text-gray-800">Total COGS</div>
                            <div className="w-28 text-right tabular-nums">{formatCurrency.format(proPLData.cogs)}</div>
                            <div className="w-16 text-right text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.cogs / proPLData.netRevenue) * 100).toFixed(1)}%` : '—'}</div>
                          </div>
                        )}
                        
                        <div className="flex items-center py-2 font-bold border-t border-gray-300 mt-2">
                          <div className="flex-1 text-gray-900">GROSS PROFIT</div>
                          <div className="w-28 text-right tabular-nums">{formatCurrency.format(proPLData.grossProfit)}</div>
                          <div className="w-16 text-right text-xs">{proPLData.grossMargin.toFixed(1)}%</div>
                        </div>
                      </div>
                    )}

                    {/* OPERATING EXPENSES - Industry Standard Grouped */}
                    <div className="mb-5">
                      <div className="font-bold text-sm text-gray-900 uppercase tracking-wide py-2 border-b border-gray-200">Operating Expenses</div>
                      
                      {/* Payroll & Labor */}
                      {proPLData.payrollTotal > 0 && (
                        <>
                          <div className="flex items-center py-1.5 font-semibold bg-gray-50 -mx-5 px-5 mt-1">
                            <div className="flex-1 text-gray-800">Payroll & Labor</div>
                            <div className="w-28 text-right tabular-nums">{formatCurrency.format(proPLData.payrollTotal)}</div>
                            <div className="w-16 text-right text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.payrollTotal / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                          </div>
                          {proPLData.payrollItems.map(([cat, amt]) => (
                            <div key={cat} className="flex items-center py-1">
                              <div className="flex-1 pl-6 text-gray-600 truncate">{cat}</div>
                              <div className="w-28 text-right tabular-nums text-gray-600">{formatCurrency.format(amt)}</div>
                              <div className="w-16 text-right text-gray-400 text-xs">{proPLData.netRevenue > 0 ? `${((amt / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* Occupancy & Facilities */}
                      {proPLData.occupancyTotal > 0 && (
                        <>
                          <div className="flex items-center py-1.5 font-semibold bg-gray-50 -mx-5 px-5 mt-1">
                            <div className="flex-1 text-gray-800">Occupancy & Facilities</div>
                            <div className="w-28 text-right tabular-nums">{formatCurrency.format(proPLData.occupancyTotal)}</div>
                            <div className="w-16 text-right text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.occupancyTotal / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                          </div>
                          {proPLData.occupancyItems.map(([cat, amt]) => (
                            <div key={cat} className="flex items-center py-1">
                              <div className="flex-1 pl-6 text-gray-600 truncate">{cat}</div>
                              <div className="w-28 text-right tabular-nums text-gray-600">{formatCurrency.format(amt)}</div>
                              <div className="w-16 text-right text-gray-400 text-xs">{proPLData.netRevenue > 0 ? `${((amt / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* Marketing & Advertising */}
                      {proPLData.marketingTotal > 0 && (
                        <>
                          <div className="flex items-center py-1.5 font-semibold bg-gray-50 -mx-5 px-5 mt-1">
                            <div className="flex-1 text-gray-800">Marketing & Advertising</div>
                            <div className="w-28 text-right tabular-nums">{formatCurrency.format(proPLData.marketingTotal)}</div>
                            <div className="w-16 text-right text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.marketingTotal / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                          </div>
                          {proPLData.marketingItems.map(([cat, amt]) => (
                            <div key={cat} className="flex items-center py-1">
                              <div className="flex-1 pl-6 text-gray-600 truncate">{cat}</div>
                              <div className="w-28 text-right tabular-nums text-gray-600">{formatCurrency.format(amt)}</div>
                              <div className="w-16 text-right text-gray-400 text-xs">{proPLData.netRevenue > 0 ? `${((amt / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* General & Administrative */}
                      {proPLData.gaTotal > 0 && (
                        <>
                          <div className="flex items-center py-1.5 font-semibold bg-gray-50 -mx-5 px-5 mt-1">
                            <div className="flex-1 text-gray-800">General & Administrative</div>
                            <div className="w-28 text-right tabular-nums">{formatCurrency.format(proPLData.gaTotal)}</div>
                            <div className="w-16 text-right text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.gaTotal / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                          </div>
                          {proPLData.gaItems.map(([cat, amt]) => (
                            <div key={cat} className="flex items-center py-1">
                              <div className="flex-1 pl-6 text-gray-600 truncate">{cat}</div>
                              <div className="w-28 text-right tabular-nums text-gray-600">{formatCurrency.format(amt)}</div>
                              <div className="w-16 text-right text-gray-400 text-xs">{proPLData.netRevenue > 0 ? `${((amt / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                            </div>
                          ))}
                        </>
                      )}
                      
                      {/* Other Expenses */}
                      {proPLData.otherExpenses > 0 && (
                        <div className="flex items-center py-1.5 font-semibold bg-gray-50 -mx-5 px-5 mt-1">
                          <div className="flex-1 text-gray-800">Other Expenses</div>
                          <div className="w-28 text-right tabular-nums">{formatCurrency.format(proPLData.otherExpenses)}</div>
                          <div className="w-16 text-right text-gray-500 text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.otherExpenses / proPLData.netRevenue) * 100).toFixed(1)}%` : ''}</div>
                        </div>
                      )}
                      
                      <div className="flex items-center py-2 font-bold border-t-2 border-gray-400 mt-3">
                        <div className="flex-1 text-gray-900">TOTAL OPERATING EXPENSES</div>
                        <div className="w-28 text-right tabular-nums text-red-700">{formatCurrency.format(proPLData.totalOpex)}</div>
                        <div className="w-16 text-right text-xs">{proPLData.netRevenue > 0 ? `${((proPLData.totalOpex / proPLData.netRevenue) * 100).toFixed(1)}%` : '—'}</div>
                      </div>
                    </div>

                    {/* OPERATING INCOME */}
                    <div className="flex items-center py-3 font-bold bg-gray-100 -mx-5 px-5 mb-5">
                      <div className="flex-1 text-gray-900 uppercase">Operating Income</div>
                      <div className={`w-28 text-right tabular-nums ${proPLData.operatingIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {proPLData.operatingIncome < 0 ? `(${formatCurrency.format(Math.abs(proPLData.operatingIncome))})` : formatCurrency.format(proPLData.operatingIncome)}
                      </div>
                      <div className="w-16 text-right text-xs">{proPLData.operatingMargin.toFixed(1)}%</div>
                    </div>

                    {/* OTHER INCOME/EXPENSE */}
                    {(proPLData.interestIncome > 0 || proPLData.interestExpense > 0) && (
                      <div className="mb-5">
                        <div className="font-bold text-sm text-gray-900 uppercase tracking-wide py-2 border-b border-gray-200">Other Income / Expense</div>
                        {proPLData.interestIncome > 0 && (
                          <div className="flex items-center py-2">
                            <div className="flex-1 pl-4 text-gray-700">Interest Income</div>
                            <div className="w-28 text-right font-medium tabular-nums text-emerald-600">{formatCurrency.format(proPLData.interestIncome)}</div>
                            <div className="w-16 text-right"></div>
                          </div>
                        )}
                        {proPLData.interestExpense > 0 && (
                          <div className="flex items-center py-2">
                            <div className="flex-1 pl-4 text-gray-700">Interest Expense</div>
                            <div className="w-28 text-right font-medium tabular-nums text-red-600">({formatCurrency.format(proPLData.interestExpense)})</div>
                            <div className="w-16 text-right"></div>
                          </div>
                        )}
                        <div className="flex items-center py-2 font-bold border-t border-gray-200 mt-2">
                          <div className="flex-1 text-gray-900">NET OTHER INCOME</div>
                          <div className={`w-28 text-right tabular-nums ${proPLData.netOtherIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                            {proPLData.netOtherIncome < 0 ? `(${formatCurrency.format(Math.abs(proPLData.netOtherIncome))})` : formatCurrency.format(proPLData.netOtherIncome)}
                          </div>
                          <div className="w-16 text-right"></div>
                        </div>
                      </div>
                    )}

                    {/* NET INCOME */}
                    <div className="flex items-center py-4 font-bold bg-gray-900 text-white -mx-5 px-5 rounded-b-lg">
                      <div className="flex-1 uppercase text-lg">Net Income</div>
                      <div className={`w-28 text-right tabular-nums text-lg ${proPLData.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {proPLData.netIncome < 0 ? `(${formatCurrency.format(Math.abs(proPLData.netIncome))})` : formatCurrency.format(proPLData.netIncome)}
                      </div>
                      <div className="w-16 text-right text-xs text-gray-300">{proPLData.netMargin.toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                    <div className="font-semibold text-gray-600 mb-1">Notes</div>
                    <p>• {plAccountingBasis === 'cash' ? 'Cash' : 'Accrual'} Basis | {proPLData.transactionCount} transactions</p>
                    {proPLData.uncategorizedCount > 0 && <p className="text-amber-600">• {proPLData.uncategorizedCount} uncategorized ({formatCurrency.format(proPLData.uncategorizedAmount)})</p>}
                    <p>• Owner draws excluded | Management report, may not be GAAP-prepared</p>
                  </div>

                  {/* Footer */}
                  <div className="px-5 py-3 border-t border-gray-200 text-center text-xs text-gray-400">
                    <p>{settings.businessName} | P&L | {proPLData.periodLabel} | Prepared by Moniezi</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== CLIENTS PAGE ==================== */}
        {currentPage === Page.Clients && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 pb-24">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="p-2 sm:p-2.5 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400 flex-shrink-0">
                  <Users size={20} className="sm:w-6 sm:h-6" strokeWidth={1.5} />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white font-brand">Clients</h2>
              </div>
              <button 
                onClick={() => { 
                  setEditingClient({ status: 'lead' }); 
                  setIsClientModalOpen(true); 
                }} 
                className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-blue-500 transition-all active:scale-95 flex-shrink-0"
              >
                <Plus size={20} className="sm:w-6 sm:h-6" strokeWidth={2.5} />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto custom-scrollbar">
              {(['all', 'lead', 'client', 'inactive'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setClientFilter(f)}
                  className={`flex-1 min-w-[80px] py-2.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                    clientFilter === f 
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-white shadow-sm' 
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {f === 'all' ? `All (${clients.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${clients.filter(c => c.status === f).length})`}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search clients by name, company, or email..."
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-12 pr-4 py-4 font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
              />
            </div>

            {/* Clients List */}
            <div className="space-y-3">
              {(() => {
                const filtered = clients
                  .filter(c => clientFilter === 'all' || c.status === clientFilter)
                  .filter(c => {
                    if (!clientSearch.trim()) return true;
                    const search = clientSearch.toLowerCase();
                    return (
                      c.name.toLowerCase().includes(search) ||
                      (c.company || '').toLowerCase().includes(search) ||
                      (c.email || '').toLowerCase().includes(search)
                    );
                  })
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

                if (filtered.length === 0) {
                  return (
                    <EmptyState
                      icon={<Users size={32} />}
                      title="No Clients Found"
                      subtitle={clientFilter === 'all' 
                        ? "Start by adding your first lead or client." 
                        : `No ${clientFilter}s found. Try adjusting your filters.`}
                      action={() => { 
                        setEditingClient({ status: 'lead' }); 
                        setIsClientModalOpen(true); 
                      }}
                      actionLabel="Add Client"
                    />
                  );
                }

                return filtered.map(client => {
                  const statusColors: Record<ClientStatus, string> = {
                    lead: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                    client: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                    inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  };

                  // Calculate client lifetime value
                  const clientRevenue = invoices
                    .filter(inv => inv.clientId === client.id && inv.status === 'paid')
                    .reduce((sum, inv) => sum + inv.amount, 0);

                  const clientInvoiceCount = invoices.filter(inv => inv.clientId === client.id).length;
                  const clientEstimateCount = estimates.filter(est => est.clientId === client.id).length;

                  return (
                    <div
                      key={client.id}
                      onClick={() => {
                        setEditingClient(client);
                        setIsClientModalOpen(true);
                      }}
                      className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/30 hover:shadow-lg transition-all cursor-pointer shadow-sm"
                    >
                      {/* Top Row: Icon + Name + Status Badge */}
                      <div className="flex items-start gap-4 mb-3">
                        <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
                          <User size={20} strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                              {client.name}
                            </h3>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${statusColors[client.status]}`}>
                              {client.status}
                            </span>
                          </div>
                          {client.company && (
                            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                              {client.company}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Contact Info */}
                      {(client.email || client.phone) && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300 mb-3">
                          {client.email && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">✉</span>
                              <span className="truncate">{client.email}</span>
                            </div>
                          )}
                          {client.phone && (
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">☎</span>
                              {client.phone}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Notes Preview */}
                      {client.notes && (
                        <div className="text-sm text-slate-600 dark:text-slate-300 italic line-clamp-2 mb-3">
                          {client.notes}
                        </div>
                      )}

                      {/* Stats Row */}
                      <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300 pt-3 border-t border-slate-100 dark:border-slate-800">
                        {clientRevenue > 0 && (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            LTV: {formatCurrency.format(clientRevenue)}
                          </span>
                        )}
                        {clientInvoiceCount > 0 && (
                          <span>{clientInvoiceCount} invoice{clientInvoiceCount !== 1 ? 's' : ''}</span>
                        )}
                        {clientEstimateCount > 0 && (
                          <span>{clientEstimateCount} estimate{clientEstimateCount !== 1 ? 's' : ''}</span>
                        )}
                        <span className="ml-auto">Updated: {new Date(client.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {currentPage === Page.Settings && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 pb-24">
            {/* Settings Header */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 flex-shrink-0">
                <Settings size={20} className="sm:w-6 sm:h-6" strokeWidth={1.5} />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white font-brand">Settings</h2>
            </div>
            
            {/* Tab Navigation */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 shadow-sm">
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                <button
                  onClick={() => setSettingsTab('backup')}
                  className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-4 py-3 rounded-lg font-bold text-xs md:text-sm uppercase tracking-wide transition-all ${
                    settingsTab === 'backup'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <Shield size={18} />
                  <span className="text-[10px] md:text-sm mt-0.5 md:mt-0">Backup</span>
                </button>
                
                <button
                  onClick={() => setSettingsTab('branding')}
                  className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-4 py-3 rounded-lg font-bold text-xs md:text-sm uppercase tracking-wide transition-all ${
                    settingsTab === 'branding'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <Palette size={18} />
                  <span className="text-[10px] md:text-sm mt-0.5 md:mt-0">Branding</span>
                </button>
                
                <button
                  onClick={() => setSettingsTab('tax')}
                  className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-4 py-3 rounded-lg font-bold text-xs md:text-sm uppercase tracking-wide transition-all ${
                    settingsTab === 'tax'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <Calculator size={18} />
                  <span className="text-[10px] md:text-sm mt-0.5 md:mt-0">Tax</span>
                </button>
                
                <button
                  onClick={() => setSettingsTab('data')}
                  className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-4 py-3 rounded-lg font-bold text-xs md:text-sm uppercase tracking-wide transition-all ${
                    settingsTab === 'data'
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <Trash2 size={18} />
                  <span className="text-[10px] md:text-sm mt-0.5 md:mt-0">Data</span>
                </button>

                <button
                  onClick={() => setSettingsTab('license')}
                  className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 md:px-4 py-3 rounded-lg font-bold text-xs md:text-sm uppercase tracking-wide transition-all ${
                    settingsTab === 'license'
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <Key size={18} />
                  <span className="text-[10px] md:text-sm mt-0.5 md:mt-0">License</span>
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
              
              {/* Backup & Restore Tab */}
              {settingsTab === 'backup' && (
                <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Shield size={20} strokeWidth={2} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Backup & Restore</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                      <button 
                          onClick={handleExportBackup} 
                          className="flex items-center justify-center gap-3 py-5 rounded-lg bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all font-bold text-sm uppercase tracking-wider active:scale-95"
                      >
                          <Download size={20} /> Export Backup
                      </button>
                      <button 
                          onClick={() => fileInputRef.current?.click()} 
                          className="flex items-center justify-center gap-3 py-5 rounded-lg bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all font-bold text-sm uppercase tracking-wider active:scale-95"
                      >
                          <Upload size={20} /> Import Backup
                      </button>
                      <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleImportBackup} 
                          className="hidden" 
                          accept=".json" 
                      />
                  </div>
                  
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-900 dark:text-amber-100">
                        <p className="font-semibold mb-1">Important Information</p>
                        <p>Save a complete copy of your data to your device. You can restore it later if needed.</p>
                        <p className="mt-2 text-amber-700 dark:text-amber-300 font-bold">⚠️ Warning: Importing a backup will overwrite all current data.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Branding & Customization Tab */}
              {settingsTab === 'branding' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                        <Palette size={20} strokeWidth={2} />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">Branding & Customization</h3>
                    </div>
                    
                    <div className="mb-8">
                        <label className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3 block">Business Logo</label>
                        <div className="flex items-start gap-6">
                            <div className="w-24 h-24 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex items-center justify-center overflow-hidden relative group">
                                {settings.businessLogo ? (<><img src={settings.businessLogo} alt="Logo" className="w-full h-full object-contain p-2" /><div className="absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity"><button onClick={() => setSettings(s => ({ ...s, businessLogo: undefined }))} className="text-white bg-red-500 p-1.5 rounded-full hover:bg-red-600"><Trash2 size={14} /></button></div></>) : <ImageIcon className="text-slate-300 dark:text-slate-600" size={32} />}
                            </div>
                            <div className="flex-1"><input type="file" ref={logoInputRef} className="hidden" accept="image/png, image/jpeg, image/svg+xml" onChange={handleLogoUpload} /><button onClick={() => logoInputRef.current?.click()} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors mb-2"><Upload size={14} /> Upload Logo</button><p className="text-xs text-slate-600 dark:text-slate-300">Recommended: PNG with transparent background. Max 2MB.</p></div>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-700 dark:text-slate-300">Show Logo on Invoice</span><button onClick={() => setSettings(s => ({ ...s, showLogoOnInvoice: !s.showLogoOnInvoice }))} className={`w-12 h-6 rounded-full p-1 transition-colors ${settings.showLogoOnInvoice ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${settings.showLogoOnInvoice ? 'translate-x-6' : 'translate-x-0'}`} /></button></div>
                            <div><label className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-2 block">Logo Alignment</label><div className="flex bg-slate-200 dark:bg-slate-900 p-1 rounded-lg"><button onClick={() => setSettings(s => ({ ...s, logoAlignment: 'left' }))} className={`flex-1 py-1.5 flex items-center justify-center gap-2 rounded-md transition-all ${settings.logoAlignment === 'left' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}><AlignLeft size={16} /> <span className="text-[10px] font-bold uppercase">Left</span></button><button onClick={() => setSettings(s => ({ ...s, logoAlignment: 'center' }))} className={`flex-1 py-1.5 flex items-center justify-center gap-2 rounded-md transition-all ${settings.logoAlignment === 'center' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'}`}><AlignCenter size={16} /> <span className="text-[10px] font-bold uppercase">Center</span></button></div></div>
                        </div>
                        <div><label className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3 block">Brand Accent Color</label><div className="flex flex-wrap gap-3">{['#2563eb', '#4f46e5', '#9333ea', '#059669', '#dc2626', '#0f172a'].map(color => (<button key={color} onClick={() => setSettings(s => ({ ...s, brandColor: color }))} className={`w-10 h-10 rounded-lg shadow-sm transition-transform hover:scale-110 flex items-center justify-center ${settings.brandColor === color ? 'ring-2 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900 ring-slate-400' : ''}`} style={{ backgroundColor: color }}>{settings.brandColor === color && <CheckCircle size={16} className="text-white" strokeWidth={3} />}</button>))}</div><p className="text-xs text-slate-600 dark:text-slate-300 mt-2">Used for invoice headings and highlights.</p></div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div><label className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3 block">Business Name</label><input type="text" value={settings.businessName} onChange={e => setSettings(s => ({ ...s, businessName: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-5 py-4 font-bold text-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500/20 transition-all" /></div>
                        <div><label className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3 block">Owner Name</label><input type="text" value={settings.ownerName} onChange={e => setSettings(s => ({ ...s, ownerName: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-5 py-4 font-bold text-lg text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500/20 transition-all" /></div>
                    </div>

                    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-6 bg-slate-50/50 dark:bg-slate-900/50">
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">Invoice Contact Details</h4>
                        <div className="space-y-4">
                            <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 block">Address</label><input type="text" value={settings.businessAddress || ''} onChange={e => setSettings(s => ({ ...s, businessAddress: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm font-medium outline-none focus:ring-1 focus:ring-purple-500" placeholder="123 Main St, City, State, Zip" /></div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 block">Email</label><input type="email" value={settings.businessEmail || ''} onChange={e => setSettings(s => ({ ...s, businessEmail: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm font-medium outline-none focus:ring-1 focus:ring-purple-500" placeholder="contact@business.com" /></div>
                                <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 block">Phone</label><input type="tel" value={settings.businessPhone || ''} onChange={e => setSettings(s => ({ ...s, businessPhone: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm font-medium outline-none focus:ring-1 focus:ring-purple-500" placeholder="(555) 123-4567" /></div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 block">Website</label><input type="text" value={settings.businessWebsite || ''} onChange={e => setSettings(s => ({ ...s, businessWebsite: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm font-medium outline-none focus:ring-1 focus:ring-purple-500" placeholder="www.yourbusiness.com" /></div>
                                <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 block">Tax ID / VAT (Optional)</label><input type="text" value={settings.businessTaxId || ''} onChange={e => setSettings(s => ({ ...s, businessTaxId: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm font-medium outline-none focus:ring-1 focus:ring-purple-500" placeholder="XX-XXXXXXX" /></div>
                            </div>
                        </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Tax Configuration Tab */}
              {settingsTab === 'tax' && (
                <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <Calculator size={20} strokeWidth={2} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Tax Configuration</h3>
                  </div>
                  
                 <label className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-3 block">How do you want to estimate your income tax?</label>
                 <div className="flex bg-slate-200 dark:bg-slate-900 p-1 rounded-lg mb-6">
                    {(['preset', 'lastYear', 'custom'] as TaxEstimationMethod[]).map(method => (
                      <button key={method} onClick={() => setSettings(s => ({ ...s, taxEstimationMethod: method }))} className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${settings.taxEstimationMethod === method ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-200'}`}>{method === 'preset' ? 'Quick Preset' : method === 'lastYear' ? 'Use Last Year' : 'Custom %'}</button>
                    ))}
                 </div>
                 
                 <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-6 mb-6">
                    {settings.taxEstimationMethod === 'preset' && (
                       <div className="space-y-4 animate-in fade-in zoom-in-95">
                          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">Select a rough estimate based on typical self-employed brackets. This is for planning only.</p>
                          <div className="grid grid-cols-3 gap-3">
                             {[10, 15, 20].map(rate => (
                               <button key={rate} onClick={() => setSettings(s => ({ ...s, taxRate: rate }))} className={`py-6 rounded-lg border-2 transition-all flex flex-col items-center justify-center ${settings.taxRate === rate ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 shadow-lg' : 'border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700'}`}><span className="text-3xl font-extrabold">{rate}%</span><span className="text-xs mt-1 font-medium">Federal</span></button>
                             ))}
                          </div>
                       </div>
                    )}
                    {settings.taxEstimationMethod === 'lastYear' && (
                       <div className="space-y-4 animate-in fade-in zoom-in-95">
                          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">Enter values from last year's tax return to calculate your effective rate.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                             <div><label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Net Profit (Last Year)</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">$</span><input type="number" placeholder="0.00" value={lastYearCalc.profit} onChange={e => setLastYearCalc(p => ({...p, profit: e.target.value}))} className="w-full pl-8 pr-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20"/></div></div>
                             <div><label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Fed. Income Tax Paid</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">$</span><input type="number" placeholder="0.00" value={lastYearCalc.tax} onChange={e => setLastYearCalc(p => ({...p, tax: e.target.value}))} className="w-full pl-8 pr-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20"/></div></div>
                          </div>
                          <button onClick={() => { const profit = Number(lastYearCalc.profit); const tax = Number(lastYearCalc.tax); if (profit > 0 && tax >= 0) { const rate = Math.min(40, Math.max(0, (tax / profit) * 100)); setSettings(s => ({ ...s, taxRate: Number(rate.toFixed(1)) })); showToast(`Rate set to ${rate.toFixed(1)}%`, 'success'); } else { showToast("Please enter valid profit amount", "error"); } }} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm uppercase tracking-widest rounded-lg transition-all active:scale-95">Calculate & Apply Rate</button>
                       </div>
                    )}
                    {settings.taxEstimationMethod === 'custom' && (
                       <div className="space-y-4 animate-in fade-in zoom-in-95">
                          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">Manually enter your estimated effective federal income tax rate.</p>
                          <div><label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-300 mb-2 block">Federal Effective Rate</label><div className="relative"><input type="number" value={settings.taxRate} onChange={e => setSettings(s => ({ ...s, taxRate: Math.min(100, Math.max(0, Number(e.target.value))) }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 pr-12 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"/><span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold"><Percent size={18} /></span></div></div>
                       </div>
                    )}
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div><label className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-2 block">State Tax (Optional)</label><div className="relative"><input type="number" value={settings.stateTaxRate} onChange={e => setSettings(s => ({ ...s, stateTaxRate: Math.min(100, Math.max(0, Number(e.target.value))) }))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 pr-10 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"/><span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">%</span></div></div>
                    <div><label className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 mb-2 block">Filing Status</label><select value={settings.filingStatus} onChange={e => setSettings(s => ({ ...s, filingStatus: e.target.value as FilingStatus }))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all appearance-none"><option value="single">Single</option><option value="joint">Married Filing Jointly</option><option value="separate">Married Filing Separately</option><option value="head">Head of Household</option></select></div>
                 </div>
                 
                 <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-lg p-6">
                    <h5 className="text-sm font-bold text-emerald-900 dark:text-emerald-100 mb-4 uppercase tracking-wider">Current Estimate Summary</h5>
                    <div className="flex flex-col gap-3 text-sm">
                       <div className="flex justify-between items-center"><span className="text-emerald-700 dark:text-emerald-300">Federal Income Tax (Effective)</span><span className="font-bold text-emerald-900 dark:text-emerald-100 text-lg">{settings.taxRate}%</span></div>
                       <div className="flex justify-between items-center"><span className="text-emerald-700 dark:text-emerald-300">State Tax (Optional)</span><span className="font-bold text-emerald-900 dark:text-emerald-100 text-lg">{settings.stateTaxRate}%</span></div>
                       <div className="flex justify-between items-center"><span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">Self-Employment Tax <HelpCircle size={14} className="cursor-help" title="Social Security (12.4%) + Medicare (2.9%)" /></span><span className="font-bold text-emerald-900 dark:text-emerald-100 text-lg">~15.3%</span></div>
                       <div className="h-px bg-emerald-200 dark:bg-emerald-800 my-1" />
                       <div className="flex justify-between items-center bg-emerald-100 dark:bg-emerald-900/20 -mx-2 px-2 py-2 rounded"><span className="font-bold uppercase text-xs tracking-wider text-emerald-900 dark:text-emerald-100">Combined Planning Rate</span><span className="font-extrabold text-2xl text-emerald-900 dark:text-emerald-100">{(settings.taxRate + settings.stateTaxRate + 15.3).toFixed(1)}%</span></div>
                    </div>
                 </div>
                </div>
              )}

              {/* Data Management Tab */}
              {settingsTab === 'data' && (
                <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center">
                      <Trash2 size={20} strokeWidth={2} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Data Management</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                      <button onClick={handleSeedDemoData} className="py-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30 border-2 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 rounded-lg text-sm font-bold uppercase tracking-widest shadow-lg transition-all flex flex-col items-center justify-center gap-3 active:scale-95">
                        {seedSuccess ? <CheckCircle size={24} /> : <Sparkles size={24} />}
                        <span>{seedSuccess ? 'Demo Data Loaded' : 'Load Demo Data'}</span>
                      </button>
                      <button onClick={handleClearData} className="py-6 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 hover:from-red-100 hover:to-orange-100 dark:hover:from-red-900/30 dark:hover:to-orange-900/30 border-2 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100 rounded-lg text-sm font-bold uppercase tracking-widest shadow-lg transition-all flex flex-col items-center justify-center gap-3 active:scale-95">
                        <AlertTriangle size={24} />
                        <span>Reset & Clear All</span>
                      </button>
                  </div>
                  
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-red-900 dark:text-red-100">
                        <p className="font-semibold mb-1">⚠️ Warning: Destructive Actions</p>
                        <p className="mb-2"><strong>Load Demo Data:</strong> Adds sample transactions, invoices, and tax payments to help you explore the app's features.</p>
                        <p><strong>Reset & Clear All:</strong> Permanently deletes ALL your data including transactions, invoices, tax payments, and custom categories. This action cannot be undone!</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* License Tab */}
              {settingsTab === 'license' && (
                <div className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <Key size={20} strokeWidth={2} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">License</h3>
                  </div>
                  
                  {/* License Status Card */}
                  <div className={`p-6 rounded-xl border-2 mb-6 ${
                    isLicenseValid 
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' 
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  }`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                        isLicenseValid
                          ? 'bg-emerald-500 text-white'
                          : 'bg-red-500 text-white'
                      }`}>
                        {isLicenseValid ? <CheckCircle size={28} /> : <AlertCircle size={28} />}
                      </div>
                      <div>
                        <h4 className={`text-lg font-bold ${
                          isLicenseValid
                            ? 'text-emerald-900 dark:text-emerald-100'
                            : 'text-red-900 dark:text-red-100'
                        }`}>
                          {isLicenseValid ? 'License Active' : 'No License'}
                        </h4>
                        <p className={`text-sm ${
                          isLicenseValid
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-red-700 dark:text-red-300'
                        }`}>
                          {isLicenseValid 
                            ? 'Your Moniezi license is valid and active'
                            : 'Please activate your license to use Moniezi'
                          }
                        </p>
                      </div>
                    </div>

                    {/* License Details */}
                    {isLicenseValid && licenseInfo && (
                      <div className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-800 space-y-3">
                        {licenseInfo.email && (
                          <div>
                            <label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Email</label>
                            <p className="text-sm text-emerald-900 dark:text-emerald-100 font-medium break-all">{licenseInfo.email}</p>
                          </div>
                        )}
                        {licenseInfo.purchaseDate && (
                          <div>
                            <label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Purchased</label>
                            <p className="text-sm text-emerald-900 dark:text-emerald-100 font-medium">
                              {new Date(licenseInfo.purchaseDate).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Deactivate License Button */}
                  {isLicenseValid && (
                    <button
                      onClick={handleDeactivateLicense}
                      className="w-full py-4 bg-slate-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <Ban size={18} />
                      Deactivate License
                    </button>
                  )}

                  {/* Info Box */}
                  <div className="mt-6 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-900 dark:text-blue-100">
                        <p className="font-semibold mb-1">License Information</p>
                        <p className="mb-2">Your Moniezi license is tied to your Gumroad purchase. If you need to transfer your license to another device, deactivate it here first, then reactivate on your new device.</p>
                        <p>Need help? Contact support at <a href="mailto:support@moniezi.app" className="underline">support@moniezi.app</a></p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Safety net: never allow navigation to render a blank screen */}
        {!([
          Page.Dashboard,
          Page.Invoices,
          Page.Invoice,
          Page.AllTransactions,
          Page.Ledger,
          Page.Income,
          Page.Expenses,
          Page.Clients,
          Page.Reports,
          Page.Settings,
          Page.InvoiceDoc,
        ] as const).includes(currentPage) && (
          <div className="px-4 sm:px-6 pt-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Navigation error</div>
              <div className="mt-1 text-sm text-slate-600">
                We couldn&apos;t load this screen. Tap a tab below to continue.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setCurrentPage(Page.Dashboard)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                  Home
                </button>
                <button
                  onClick={() => setCurrentPage(Page.Invoices)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900"
                >
                  Invoices
                </button>
                <button
                  onClick={() => setCurrentPage(Page.AllTransactions)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900"
                >
                  Ledger
                </button>
                <button
                  onClick={() => setCurrentPage(Page.Clients)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900"
                >
                  Clients
                </button>
                <button
                  onClick={() => setCurrentPage(Page.Reports)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900"
                >
                  Reports
                </button>
              </div>
            </div>
          </div>
        )}

      </PageErrorBoundary>

      </div>

      {/* Scroll to Top Button - Theme Aware */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="no-print fixed right-4 z-[54] w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90 animate-in fade-in zoom-in-75 duration-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg shadow-slate-900/10 dark:shadow-black/30 hover:shadow-xl hover:scale-105"
          style={{
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px) + 20px)',
          }}
          aria-label="Scroll to top"
        >
          <ArrowUp size={22} strokeWidth={2.5} className="text-slate-600 dark:text-slate-300" />
        </button>
      )}

      <div className="no-print fixed bottom-0 left-0 right-0 z-[55] pb-safe">
        <div className="bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800/50 px-1 pt-2 pb-3">
          <div className="max-w-xl mx-auto flex justify-between items-end relative">
            {/* Home */}
            <button 
              onClick={() => setCurrentPage(Page.Dashboard)} 
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 ${currentPage === Page.Dashboard ? 'text-blue-600 dark:text-white' : ''}`}
              style={{ color: currentPage === Page.Dashboard ? undefined : 'var(--nav-inactive)' }}
            >
              <div className={`p-1.5 rounded-lg ${currentPage === Page.Dashboard ? 'bg-blue-100 dark:bg-slate-800' : ''}`}>
                <LayoutGrid size={20} strokeWidth={currentPage === Page.Dashboard ? 2 : 1.5} />
              </div>
              <span className={`text-[11px] mt-0.5 ${currentPage === Page.Dashboard ? 'font-bold text-blue-600 dark:text-white' : 'font-semibold'}`} style={{ color: currentPage === Page.Dashboard ? undefined : 'var(--nav-inactive)' }}>Home</span>
            </button>

            {/* Invoice */}
            <button 
              onClick={() => { setBillingDocType('invoice'); setCurrentPage(Page.Invoices); }} 
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 ${(currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'invoice' ? 'text-blue-600 dark:text-white' : ''}`}
              style={{ color: (currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'invoice' ? undefined : 'var(--nav-inactive)' }}
            >
              <div className={`p-1.5 rounded-lg ${(currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'invoice' ? 'bg-blue-100 dark:bg-slate-800' : ''}`}>
                <FileText size={20} strokeWidth={(currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'invoice' ? 2 : 1.5} />
              </div>
              <span className={`text-[11px] mt-0.5 ${(currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'invoice' ? 'font-bold text-blue-600 dark:text-white' : 'font-semibold'}`} style={{ color: (currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'invoice' ? undefined : 'var(--nav-inactive)' }}>Invoice</span>
            </button>

            {/* Estimate */}
            <button 
              onClick={() => { setBillingDocType('estimate'); setCurrentPage(Page.Invoices); }} 
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 ${(currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'estimate' ? 'text-blue-600 dark:text-white' : ''}`}
              style={{ color: (currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'estimate' ? undefined : 'var(--nav-inactive)' }}
            >
              <div className={`p-1.5 rounded-lg ${(currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'estimate' ? 'bg-blue-100 dark:bg-slate-800' : ''}`}>
                <ClipboardList size={20} strokeWidth={(currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'estimate' ? 2 : 1.5} />
              </div>
              <span className={`text-[11px] mt-0.5 ${(currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'estimate' ? 'font-bold text-blue-600 dark:text-white' : 'font-semibold'}`} style={{ color: (currentPage === Page.Invoices || currentPage === Page.Invoice) && billingDocType === 'estimate' ? undefined : 'var(--nav-inactive)' }}>Estimate</span>
            </button>

            {/* Center FAB - Ledger with + */}
            <div className="flex-1 flex flex-col items-center -mt-3">
              <button 
                onClick={() => {
                  if (currentPage === Page.AllTransactions || currentPage === Page.Ledger) {
                    handleOpenFAB('income');
                  } else {
                    setCurrentPage(Page.AllTransactions);
                  }
                }} 
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg shadow-blue-600/30 transition-all active:scale-95 bg-blue-600"
              >
                <Plus size={24} strokeWidth={2.5} className="text-white" />
              </button>
              <span className={`text-[11px] mt-1 ${(currentPage === Page.AllTransactions || currentPage === Page.Ledger) ? 'font-bold text-blue-600 dark:text-blue-400' : 'font-semibold'}`} style={{ color: (currentPage === Page.AllTransactions || currentPage === Page.Ledger) ? undefined : 'var(--nav-inactive)' }}>Ledger</span>
            </div>

            {/* Clients */}
            <button 
              onClick={() => setCurrentPage(Page.Clients)} 
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 ${currentPage === Page.Clients ? 'text-blue-600 dark:text-white' : ''}`}
              style={{ color: currentPage === Page.Clients ? undefined : 'var(--nav-inactive)' }}
            >
              <div className={`p-1.5 rounded-lg ${currentPage === Page.Clients ? 'bg-blue-100 dark:bg-slate-800' : ''}`}>
                <Users size={20} strokeWidth={currentPage === Page.Clients ? 2 : 1.5} />
              </div>
              <span className={`text-[11px] mt-0.5 ${currentPage === Page.Clients ? 'font-bold text-blue-600 dark:text-white' : 'font-semibold'}`} style={{ color: currentPage === Page.Clients ? undefined : 'var(--nav-inactive)' }}>Clients</span>
            </button>

            {/* Reports */}
            <button 
              onClick={() => setCurrentPage(Page.Reports)} 
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 ${currentPage === Page.Reports ? 'text-blue-600 dark:text-white' : ''}`}
              style={{ color: currentPage === Page.Reports ? undefined : 'var(--nav-inactive)' }}
            >
              <div className={`p-1.5 rounded-lg ${currentPage === Page.Reports ? 'bg-blue-100 dark:bg-slate-800' : ''}`}>
                <BarChart3 size={20} strokeWidth={currentPage === Page.Reports ? 2 : 1.5} />
              </div>
              <span className={`text-[11px] mt-0.5 ${currentPage === Page.Reports ? 'font-bold text-blue-600 dark:text-white' : 'font-semibold'}`} style={{ color: currentPage === Page.Reports ? undefined : 'var(--nav-inactive)' }}>Reports</span>
            </button>
          </div>
        </div>
      </div>
      

      {/* Insights Modal */}
      {showInsights && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <InsightsDashboard
              transactions={transactions}
              invoices={invoices}
              taxPayments={taxPayments}
              settings={settings}
              onClose={() => setShowInsights(false)}
            />
          </div>
        </div>
      )}

      <Drawer
         isOpen={isDrawerOpen}
         onClose={() => setIsDrawerOpen(false)}
         title={
            drawerMode === 'tax_payments' ? 'Tax Payments' :
            drawerMode === 'create_cat' ? 'New Category' :
            drawerMode === 'add' ? (activeTab === 'billing' ? (billingDocType === 'estimate' ? 'New Estimate' : 'New Invoice') : activeTab === 'income' ? 'Add Income' : 'Add Expense') : 
            drawerMode === 'edit_tx' ? 'Edit Transaction' : 
            drawerMode === 'edit_inv' ? (billingDocType === 'estimate' ? 'Edit Estimate' : 'Edit Invoice') :
            'Edit Invoice'
         }
      >
         {drawerMode === 'tax_payments' ? (
             <div className="space-y-6">
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-wider">Log New Payment</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <DateInput label="Date" value={activeTaxPayment.date || ''} onChange={v => setActiveTaxPayment(p => ({...p, date: v}))} />
                        <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 block pl-1 uppercase tracking-wider">Amount</label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">{settings.currencySymbol}</span><input type="number" value={activeTaxPayment.amount || ''} onChange={e => setActiveTaxPayment(p => ({...p, amount: Number(e.target.value)}))} className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-0 rounded-lg pl-10 pr-4 py-4 font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="0.00" /></div></div>
                    </div>
                    <div className="mb-4"><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 block pl-1 uppercase tracking-wider">Payment Type</label><div className="flex bg-slate-200 dark:bg-slate-900 p-1 rounded-lg">{['Estimated', 'Annual', 'Other'].map(type => (<button key={type} onClick={() => setActiveTaxPayment(p => ({...p, type: type as any}))} className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${activeTaxPayment.type === type ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>{type}</button>))}</div></div>
                    <button onClick={saveTaxPayment} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20 uppercase tracking-widest transition-all active:scale-95">Record Payment</button>
                </div>
                <div><h4 className="text-sm font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-3 pl-1">Payment History</h4>{taxPayments.length === 0 ? (<div className="text-center py-8 text-slate-400 italic text-sm">No payments recorded yet.</div>) : (<div className="space-y-3">{taxPayments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (<div key={p.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center"><CheckCircle size={18} /></div><div><div className="font-bold text-slate-900 dark:text-white">{p.type} Tax</div><div className="text-xs text-slate-500">{p.date}</div></div></div><div className="text-right"><div className="font-bold text-slate-900 dark:text-white">{formatCurrency.format(p.amount)}</div><button onClick={() => deleteTaxPayment(p.id)} className="text-xs text-red-500 hover:text-red-600 mt-1 font-bold">DELETE</button></div></div>))}</div>)}</div>
             </div>
         ) : drawerMode === 'create_cat' ? (
             <div className="space-y-6">
                 <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-lg border border-slate-100 dark:border-slate-800">
                     <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-wider">Create {activeTab === 'billing' ? 'Invoice' : activeTab === 'income' ? 'Income' : 'Expense'} Category</h4>
                     <div className="mb-6"><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 block pl-1 uppercase tracking-wider">Category Name</label><input type="text" autoFocus value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-4 font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700" placeholder="e.g. Project Supplies" /><p className="text-xs text-slate-400 mt-2 pl-1">This will be available for future {activeTab} entries.</p></div>
                     <div className="flex gap-3"><button onClick={() => setDrawerMode(previousDrawerMode.current)} className="flex-1 py-4 font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancel</button><button onClick={saveNewCategory} className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20 uppercase tracking-widest transition-all active:scale-95">Save Category</button></div>
                 </div>
             </div>
         ) : (
            <div className="space-y-6">
                {drawerMode === 'add' && (
                    <div className="flex bg-slate-200 dark:bg-slate-900 p-1 rounded-lg mb-4">
                        <button onClick={() => { setActiveTab('income'); resetActiveItem('income'); setCategorySearch(''); }} className={`flex-1 py-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'income' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>Income</button>
                        <button onClick={() => { setActiveTab('expense'); resetActiveItem('expense'); setCategorySearch(''); }} className={`flex-1 py-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'expense' ? 'bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>Expense</button>
                        <button onClick={() => { setActiveTab('billing'); resetActiveItem('billing'); setCategorySearch(''); }} className={`flex-1 py-3 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'billing' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>{billingDocType === 'estimate' ? 'Estimate' : 'Invoice'}</button>
                    </div>
                )}

                {drawerMode === 'edit_inv' && activeItem.id && (
                    <div className="bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg mb-4 border border-slate-200 dark:border-slate-700">
                        <div className="grid grid-cols-3 gap-2 mb-2">
                            <button type="button" onClick={billingDocType === 'estimate' ? handleDirectExportEstimatePDF : handleDirectExportPDF} disabled={billingDocType === 'estimate' ? isGeneratingEstimatePdf : isGeneratingPdf} className={`py-2.5 flex flex-col items-center justify-center gap-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-all ${(billingDocType === 'estimate' ? isGeneratingEstimatePdf : isGeneratingPdf) ? 'opacity-70 cursor-wait' : ''}`}>{(billingDocType === 'estimate' ? isGeneratingEstimatePdf : isGeneratingPdf) ? <Loader2 size={18} className="animate-spin text-blue-600" /> : <Download size={18} />}<span className="text-[10px] font-bold uppercase tracking-wider">{(billingDocType === 'estimate' ? isGeneratingEstimatePdf : isGeneratingPdf) ? 'Generating...' : 'Export PDF'}</span></button>
                            <button type="button" onClick={() => (billingDocType === 'estimate' ? duplicateEstimate(activeItem as any) : duplicateInvoice(activeItem as Invoice))} className="py-2.5 flex flex-col items-center justify-center gap-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 shadow-sm transition-all"><Copy size={18} /><span className="text-[10px] font-bold uppercase tracking-wider">Duplicate</span></button>
                            <button type="button" onClick={() => (billingDocType === 'estimate' ? null : openBatchDuplicate(activeItem as Invoice))} disabled={billingDocType === 'estimate'} className={`py-2.5 flex flex-col items-center justify-center gap-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 shadow-sm transition-all ${billingDocType === 'estimate' ? 'opacity-50 cursor-not-allowed' : ''}`}><Repeat size={18} /><span className="text-[10px] font-bold uppercase tracking-wider">Batch</span></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {billingDocType !== 'estimate' ? (
                              <button type="button" onClick={() => toggleInvoicePaidStatus(activeItem)} disabled={activeItem.status === 'void'} className={`py-2.5 flex flex-col items-center justify-center gap-1 rounded-md border shadow-sm transition-all ${activeItem.status === 'void' ? 'opacity-50 cursor-not-allowed bg-slate-200 dark:bg-slate-800 text-slate-500' : activeItem.status === 'paid' ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400 hover:bg-orange-100' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'}`}>{activeItem.status === 'paid' ? <X size={18} /> : <CheckCircle size={18} />}<span className="text-[10px] font-bold uppercase tracking-wider">{activeItem.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}</span></button>
                            ) : (
                              <div className="py-2.5 flex flex-col items-center justify-center gap-1 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-500">
                                <span className="text-[10px] font-bold uppercase tracking-wider">No payment status</span>
                              </div>
                            )}
                            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); billingDocType === 'estimate' ? deleteEstimate(activeItem as any) : setInvoiceToDelete(activeItem.id!); }} className="py-2.5 flex flex-col items-center justify-center gap-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 shadow-sm transition-all"><Trash2 size={18} /><span className="text-[10px] font-bold uppercase tracking-wider">Delete</span></button>
                        </div>
                    </div>
                )}

                {activeTab === 'billing' ? (
                   <div className="space-y-4">
                      <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                          <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-3">Client Details</h4>
                          <div className="space-y-3">
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block pl-1 uppercase tracking-wider">Select Client</label>
                                <select value={(activeItem as any).clientId || ''} onChange={e => { const id = e.target.value; setActiveItem(p => ({ ...p, clientId: id || undefined })); if (id) fillDocFromClient(id); }} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-3 font-bold text-sm outline-none focus:ring-1 focus:ring-blue-500">
                                  <option value="">New / Not selected</option>
                                  {clients.map(c => (<option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}{c.status === 'lead' ? ' (Lead)' : ''}</option>))}
                                </select>
                              </div>
                              <input type="text" value={activeItem.client || ''} onChange={e => setActiveItem(prev => ({ ...prev, client: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-3 font-bold text-base outline-none focus:ring-1 focus:ring-blue-500" placeholder="Client Name (Required)" />
                              <input type="text" value={activeItem.clientCompany || ''} onChange={e => setActiveItem(prev => ({ ...prev, clientCompany: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="Company Name (Optional)" />
                              <input type="email" value={activeItem.clientEmail || ''} onChange={e => setActiveItem(prev => ({ ...prev, clientEmail: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="Client Email (Optional)" />
                              <input type="text" value={activeItem.clientAddress || ''} onChange={e => setActiveItem(prev => ({ ...prev, clientAddress: e.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="Client Address (Optional)" />
                          </div>
                      </div>

                      {/* ESTIMATE-SPECIFIC FIELDS */}
                      {billingDocType === 'estimate' && (
                        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-100 dark:border-purple-800/30">
                          <h4 className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <FileText size={14} /> Proposal Details
                          </h4>
                          <div className="space-y-3">
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block pl-1 uppercase tracking-wider">Project Title</label>
                              <input 
                                type="text" 
                                value={(activeItem as any).projectTitle || ''} 
                                onChange={e => setActiveItem(prev => ({ ...prev, projectTitle: e.target.value }))} 
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-3 font-bold text-base outline-none focus:ring-1 focus:ring-purple-500" 
                                placeholder="e.g., Website Redesign, Marketing Campaign" 
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block pl-1 uppercase tracking-wider">Scope of Work</label>
                              <textarea 
                                value={(activeItem as any).scopeOfWork || ''} 
                                onChange={e => setActiveItem(prev => ({ ...prev, scopeOfWork: e.target.value }))} 
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500 min-h-[80px]" 
                                placeholder="Describe what's included in this proposal..." 
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block pl-1 uppercase tracking-wider">Timeline</label>
                                <input 
                                  type="text" 
                                  value={(activeItem as any).timeline || ''} 
                                  onChange={e => setActiveItem(prev => ({ ...prev, timeline: e.target.value }))} 
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500" 
                                  placeholder="e.g., 2-3 weeks" 
                                />
                              </div>
                              <div>
                                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block pl-1 uppercase tracking-wider">Reference #</label>
                                <input 
                                  type="text" 
                                  value={(activeItem as any).poNumber || ''} 
                                  onChange={e => setActiveItem(prev => ({ ...prev, poNumber: e.target.value }))} 
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500" 
                                  placeholder="Client ref / PO #" 
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><DateInput label="Date" value={activeItem.date || ''} onChange={v => setActiveItem(prev => ({ ...prev, date: v }))} /><DateInput label={billingDocType === 'estimate' ? "Valid Until" : "Due Date"} value={(billingDocType === 'estimate' ? (activeItem.validUntil as any) : activeItem.due) || ''} onChange={v => setActiveItem(prev => billingDocType === 'estimate' ? ({ ...prev, validUntil: v }) : ({ ...prev, due: v }))} /></div>
                      <div className="bg-slate-50 dark:bg-slate-900 p-1 rounded-lg border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800"><h4 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Line Items</h4><button onClick={addInvoiceItem} className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline"><PlusCircle size={14}/> Add Item</button></div>
                          <div className="p-2 space-y-2">{(activeItem.items || []).map((item, idx) => (<div key={item.id} className="flex gap-2 items-start animate-in fade-in slide-in-from-left-2"><div className="flex-1 space-y-2"><input type="text" value={item.description} onChange={(e) => updateInvoiceItem(item.id, 'description', e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="Description" /><div className="flex gap-2"><div className="relative w-20"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 text-xs">Qty</span><input type="number" value={item.quantity || ''} onChange={(e) => updateInvoiceItem(item.id, 'quantity', Number(e.target.value))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded pl-8 pr-2 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 text-center" placeholder="0"/></div><div className="relative flex-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 text-xs">$</span><input type="number" value={item.rate || ''} onChange={(e) => updateInvoiceItem(item.id, 'rate', Number(e.target.value))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded pl-6 pr-2 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" placeholder="0.00" /></div></div></div><div className="pt-2"><button onClick={() => removeInvoiceItem(item.id)} className="text-slate-400 hover:text-red-500 p-1"><MinusCircle size={18} /></button></div></div>))}{(activeItem.items || []).length === 0 && <div className="text-center py-4 text-xs text-slate-400 italic">No items added. Add at least one item.</div>}</div>
                          <div className="p-3 bg-slate-100 dark:bg-slate-900/50 rounded-b-lg space-y-2">
                              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300"><span>Subtotal</span><span>{formatCurrency.format(activeInvoiceTotals.subtotal)}</span></div>
                              <div className="flex items-center justify-between gap-4"><label className="text-xs text-slate-600 dark:text-slate-300">Discount</label><div className="relative w-24"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 text-xs">$</span><input type="number" value={activeItem.discount || ''} onChange={e => setActiveItem(p => ({...p, discount: Number(e.target.value)}))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded py-1 pl-5 pr-1 text-xs text-right outline-none" placeholder="0" /></div></div>
                              <div className="flex items-center justify-between gap-4"><label className="text-xs text-slate-600 dark:text-slate-300">Tax Rate</label><div className="relative w-24"><input type="number" value={activeItem.taxRate || ''} onChange={e => setActiveItem(p => ({...p, taxRate: Number(e.target.value)}))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded py-1 pl-1 pr-5 text-xs text-right outline-none" placeholder="0" /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 text-xs">%</span></div></div>
                              {billingDocType !== 'estimate' && <div className="flex items-center justify-between gap-4"><label className="text-xs text-slate-600 dark:text-slate-300">Shipping</label><div className="relative w-24"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 text-xs">$</span><input type="number" value={activeItem.shipping || ''} onChange={e => setActiveItem(p => ({...p, shipping: Number(e.target.value)}))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded py-1 pl-5 pr-1 text-xs text-right outline-none" placeholder="0" /></div></div>}
                              <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"><span>{billingDocType === 'estimate' ? 'Estimated Total' : 'Total Due'}</span><span>{formatCurrency.format(activeInvoiceTotals.total)}</span></div>
                          </div>
                      </div>

                      {/* ESTIMATE-SPECIFIC: Exclusions */}
                      {billingDocType === 'estimate' && (
                        <div>
                          <label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 block pl-1 uppercase tracking-wider">Exclusions (Not Included)</label>
                          <textarea 
                            value={(activeItem as any).exclusions || ''} 
                            onChange={e => setActiveItem(prev => ({ ...prev, exclusions: e.target.value }))} 
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 min-h-[60px]" 
                            placeholder="List items NOT included in this estimate (e.g., hosting, stock photos, third-party fees)..." 
                          />
                        </div>
                      )}

                      <div className="space-y-4">
                          <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 block pl-1 uppercase tracking-wider">Internal Category</label>{renderCategoryChips(activeItem.category, (cat) => setActiveItem(prev => ({ ...prev, category: cat })))}</div>
                          <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 block pl-1 uppercase tracking-wider">{billingDocType === 'estimate' ? 'Notes to Client' : 'Notes / Memo'}</label><textarea value={activeItem.notes || ''} onChange={e => setActiveItem(prev => ({ ...prev, notes: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-50 min-h-[60px]" placeholder={billingDocType === 'estimate' ? "Additional information for your client..." : "Thank you for your business..."} /></div>
                          <div><label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 block pl-1 uppercase tracking-wider">{billingDocType === 'estimate' ? 'Terms & Conditions' : 'Payment Terms'}</label><textarea value={activeItem.terms || ''} onChange={e => setActiveItem(prev => ({ ...prev, terms: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 min-h-[60px]" placeholder={billingDocType === 'estimate' ? "This estimate is valid for 30 days. 50% deposit required to begin work..." : "Net 30. Late fees apply..."} /></div>
                          
                          {/* ESTIMATE-SPECIFIC: Acceptance Terms */}
                          {billingDocType === 'estimate' && (
                            <div>
                              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 block pl-1 uppercase tracking-wider">How to Accept</label>
                              <input 
                                type="text" 
                                value={(activeItem as any).acceptanceTerms || ''} 
                                onChange={e => setActiveItem(prev => ({ ...prev, acceptanceTerms: e.target.value }))} 
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" 
                                placeholder="e.g., Reply 'Approved' to this email, Sign below, etc." 
                              />
                            </div>
                          )}
                      </div>

                      {/* Preview & Save Buttons */}
                      <div className="flex gap-3">
                        <button onClick={() => (billingDocType === 'estimate' ? saveEstimate(activeItem) : saveInvoice(activeItem))} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20 uppercase tracking-widest transition-all active:scale-95">Save {billingDocType === 'estimate' ? 'Estimate' : 'Invoice'}</button>
                      </div>
                   </div>
                ) : (
                   <div className="space-y-4">
                      {drawerMode === 'edit_tx' && activeItem.id && (
                        <div className="bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg mb-2 border border-slate-200 dark:border-slate-700">
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            <button type="button" onClick={() => duplicateTransaction(activeItem as Transaction)} className="py-2.5 flex flex-col items-center justify-center gap-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 shadow-sm transition-all">
                              <Copy size={18} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Duplicate</span>
                            </button>
                            <button type="button" onClick={() => openBatchDuplicate(activeItem as Transaction)} className={`py-2.5 flex flex-col items-center justify-center gap-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 shadow-sm transition-all ${billingDocType === 'estimate' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                              <Repeat size={18} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Batch</span>
                            </button>
                            <button type="button" onClick={() => openRecurringSetup(activeItem as Transaction)} className="py-2.5 flex flex-col items-center justify-center gap-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 shadow-sm transition-all">
                              <Calendar size={18} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Recurring</span>
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            <button type="button" onClick={() => deleteTransaction(activeItem.id)} className="py-2.5 flex flex-col items-center justify-center gap-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 shadow-sm transition-all">
                              <Trash2 size={18} />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Delete</span>
                            </button>
                          </div>
                        </div>
                      )}
                      <div><label className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 block pl-1">Description</label><input type="text" value={activeItem.name || ''} onChange={e => setActiveItem(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-0 rounded-lg px-4 py-4 font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500/20" placeholder={activeTab === 'income' ? "Client or Source" : "Vendor or Purchase"} /></div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><DateInput label="Date" value={activeItem.date || ''} onChange={v => setActiveItem(prev => ({ ...prev, date: v }))} /><div><label className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 block pl-1">Amount</label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-300 font-bold">{settings.currencySymbol}</span><input type="number" value={activeItem.amount || ''} onChange={e => setActiveItem(prev => ({ ...prev, amount: Number(e.target.value) }))} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-0 rounded-lg pl-10 pr-4 py-4 font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="0.00" /></div></div></div>
                      <div><label className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-2 block pl-1">Category</label>{renderCategoryChips(activeItem.category, (cat) => setActiveItem(prev => ({ ...prev, category: cat })))}</div>
                      <button onClick={() => saveTransaction(activeItem)} className={`w-full py-4 font-bold rounded-lg shadow-lg uppercase tracking-widest transition-all active:scale-95 text-white ${activeTab === 'income' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' : 'bg-red-600 hover:bg-red-700 shadow-red-500/20'}`}>Save {activeTab}</button>
                   </div>
                )}
             </div>
         )}
      </Drawer>
      
      

      {/* Client Modal */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-lg font-extrabold text-slate-900 dark:text-white">{editingClient.id ? 'Edit Client' : 'New Client'}</div>
                <div className="text-xs text-slate-500">Leads and customers are tied to invoices/estimates.</div>
              </div>
              <button onClick={() => { setIsClientModalOpen(false); setEditingClient({ status: 'lead' }); }} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={editingClient.name || ''} onChange={e => setEditingClient(p => ({...p, name: e.target.value}))} placeholder="Client name" className="w-full px-3 py-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-bold" />
                <select value={(editingClient.status as any) || 'lead'} onChange={e => setEditingClient(p => ({...p, status: e.target.value as any}))} className="w-full px-3 py-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-bold">
                  <option value="lead">Lead</option>
                  <option value="client">Client</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <input value={editingClient.company || ''} onChange={e => setEditingClient(p => ({...p, company: e.target.value}))} placeholder="Company (optional)" className="w-full px-3 py-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-bold" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={editingClient.email || ''} onChange={e => setEditingClient(p => ({...p, email: e.target.value}))} placeholder="Email (optional)" className="w-full px-3 py-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-bold" />
                <input value={editingClient.phone || ''} onChange={e => setEditingClient(p => ({...p, phone: e.target.value}))} placeholder="Phone (optional)" className="w-full px-3 py-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-bold" />
              </div>
              <input value={editingClient.address || ''} onChange={e => setEditingClient(p => ({...p, address: e.target.value}))} placeholder="Address (optional)" className="w-full px-3 py-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-bold" />
              <textarea value={editingClient.notes || ''} onChange={e => setEditingClient(p => ({...p, notes: e.target.value}))} placeholder="Notes (optional)" className="w-full px-3 py-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm min-h-[80px]" />
            </div>

            <div className="flex gap-3 mt-5">
              {editingClient.id && (
                <button
                  onClick={() => {
                    const clientInvoices = invoices.filter(inv => inv.clientId === editingClient.id);
                    const clientEstimates = estimates.filter(est => est.clientId === editingClient.id);
                    
                    // Build warning message if there are linked documents
                    let confirmMsg = 'Delete this client?';
                    if (clientInvoices.length > 0 || clientEstimates.length > 0) {
                      const parts = [];
                      if (clientInvoices.length > 0) parts.push(`${clientInvoices.length} invoice${clientInvoices.length !== 1 ? 's' : ''}`);
                      if (clientEstimates.length > 0) parts.push(`${clientEstimates.length} estimate${clientEstimates.length !== 1 ? 's' : ''}`);
                      confirmMsg = `This client has ${parts.join(' and ')}. Deleting will unlink these documents (they won't be deleted). Continue?`;
                    }
                    
                    if (!confirm(confirmMsg)) return;
                    
                    // Unlink invoices from this client
                    if (clientInvoices.length > 0) {
                      setInvoices(prev => prev.map(inv => 
                        inv.clientId === editingClient.id 
                          ? { ...inv, clientId: undefined } 
                          : inv
                      ));
                    }
                    
                    // Unlink estimates from this client
                    if (clientEstimates.length > 0) {
                      setEstimates(prev => prev.map(est => 
                        est.clientId === editingClient.id 
                          ? { ...est, clientId: undefined } 
                          : est
                      ));
                    }
                    
                    setClients(prev => prev.filter(c => c.id !== editingClient.id));
                    setIsClientModalOpen(false);
                    setEditingClient({ status: 'lead' });
                    showToast('Client deleted', 'info');
                  }}
                  className="px-4 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-2">
                  <Trash2 size={18}/> Delete
                </button>
              )}
              <button
                onClick={() => {
                  const name = (editingClient.name || '').trim();
                  if (!name) return showToast('Client name is required', 'error');
                  const now = new Date().toISOString();
                  if (editingClient.id) {
                    setClients(prev => prev.map(c => c.id === editingClient.id ? ({
                      ...c,
                      name,
                      company: editingClient.company || '',
                      email: editingClient.email || '',
                      phone: editingClient.phone || '',
                      address: editingClient.address || '',
                      notes: editingClient.notes || '',
                      status: (editingClient.status as any) || 'lead',
                      updatedAt: now,
                    }) : c));
                    showToast('Client updated', 'success');
                  } else {
                    const newClient: Client = {
                      id: generateId('cli'),
                      name,
                      company: editingClient.company || '',
                      email: editingClient.email || '',
                      phone: editingClient.phone || '',
                      address: editingClient.address || '',
                      notes: editingClient.notes || '',
                      status: (editingClient.status as any) || 'lead',
                      createdAt: now,
                      updatedAt: now,
                    };
                    setClients(prev => [newClient, ...prev]);
                    showToast('Client created', 'success');
                  }
                  setIsClientModalOpen(false);
                  setEditingClient({ status: 'lead' });
                }}
                className="flex-1 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/20">
                Save Client
              </button>
            </div>
          </div>
        </div>
      )}

{/* Template Suggestion Modal */}
      {showTemplateSuggestion && templateSuggestionData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl p-6 shadow-2xl border border-blue-500/20">
            <div className="flex items-center gap-4 mb-4 text-blue-600 dark:text-blue-400">
              <div className="bg-blue-100 dark:bg-blue-500/10 p-3 rounded-full">
                <Sparkles size={24} strokeWidth={2} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold">Save as Template?</h3>
            </div>
            
            <p className="text-slate-600 dark:text-slate-300 mb-4 font-medium leading-relaxed">
              You've duplicated <span className="font-bold text-slate-900 dark:text-white">"{templateSuggestionData.name}"</span> multiple times.
            </p>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  <p className="font-semibold mb-1">Pro tip for future:</p>
                  <p>For truly recurring transactions, try using the <strong>"Batch"</strong> or <strong>"Recurring"</strong> buttons to create multiple entries at once!</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => setShowTemplateSuggestion(false)} 
                className="flex-1 py-3 font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Not Now
              </button>
              <button 
                onClick={() => {
                  setShowTemplateSuggestion(false);
                  showToast("Tip noted! Check out Batch & Recurring buttons", "success");
                }} 
                className="flex-1 py-3 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/20 transition-colors"
              >
                Got It!
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Phase 3: Batch Duplicate Modal */}
      {showBatchDuplicateModal && batchDuplicateData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl border border-purple-500/20 my-auto">
            <div className="flex items-center gap-4 mb-4 text-purple-600 dark:text-purple-400">
              <div className="bg-purple-100 dark:bg-purple-500/10 p-3 rounded-full">
                <Repeat size={24} strokeWidth={2} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold">Batch Duplicate</h3>
            </div>
            
            <p className="text-slate-600 dark:text-slate-300 mb-4 font-medium">
              Creating multiple copies of: <span className="font-bold text-slate-900 dark:text-white">{batchDuplicateData.name || (batchDuplicateData as Invoice).client}</span>
            </p>
            
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 mb-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 block uppercase">Quick Presets</label>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => {
                    const dates: string[] = [];
                    for (let i = 1; i <= 3; i++) {
                      const d = new Date();
                      d.setMonth(d.getMonth() + i);
                      dates.push(d.toISOString().split('T')[0]);
                    }
                    executeBatchDuplicate(dates);
                  }} className="py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
                    3 Months
                  </button>
                  <button onClick={() => {
                    const dates: string[] = [];
                    for (let i = 1; i <= 6; i++) {
                      const d = new Date();
                      d.setMonth(d.getMonth() + i);
                      dates.push(d.toISOString().split('T')[0]);
                    }
                    executeBatchDuplicate(dates);
                  }} className="py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
                    6 Months
                  </button>
                  <button onClick={() => {
                    const dates: string[] = [];
                    for (let i = 1; i <= 12; i++) {
                      const d = new Date();
                      d.setMonth(d.getMonth() + i);
                      dates.push(d.toISOString().split('T')[0]);
                    }
                    executeBatchDuplicate(dates);
                  }} className="py-2 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
                    12 Months
                  </button>
                </div>
              </div>
              
              <div className="text-xs text-slate-600 dark:text-slate-300 italic">
                💡 Each copy will be created for the first day of each month starting next month
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowBatchDuplicateModal(false);
                  setBatchDuplicateData(null);
                }} 
                className="flex-1 py-3 font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Phase 3: Recurring Transaction Modal */}
      {showRecurringModal && recurringData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl p-6 shadow-2xl border border-emerald-500/20 my-auto">
            <div className="flex items-center gap-4 mb-4 text-emerald-600 dark:text-emerald-400">
              <div className="bg-emerald-100 dark:bg-emerald-500/10 p-3 rounded-full">
                <Calendar size={24} strokeWidth={2} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold">Setup Recurring</h3>
            </div>
            
            <p className="text-slate-600 dark:text-slate-300 mb-4 font-medium">
              Schedule: <span className="font-bold text-slate-900 dark:text-white">{recurringData.name}</span>
            </p>
            
            <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 mb-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 block uppercase">Frequency</label>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button onClick={() => setupRecurringTransaction('weekly', 12)} className="py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                    <div className="text-sm">Weekly</div>
                    <div className="text-xs text-slate-500 mt-1">Next 12 weeks</div>
                  </button>
                  <button onClick={() => setupRecurringTransaction('biweekly', 12)} className="py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                    <div className="text-sm">Bi-weekly</div>
                    <div className="text-xs text-slate-500 mt-1">Next 24 weeks</div>
                  </button>
                  <button onClick={() => setupRecurringTransaction('monthly', 12)} className="py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                    <div className="text-sm">Monthly</div>
                    <div className="text-xs text-slate-500 mt-1">Next 12 months</div>
                  </button>
                  <button onClick={() => setupRecurringTransaction('quarterly', 8)} className="py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                    <div className="text-sm">Quarterly</div>
                    <div className="text-xs text-slate-500 mt-1">Next 2 years</div>
                  </button>
                </div>
              </div>
              
              <div className="text-xs text-slate-600 dark:text-slate-300 italic">
                💡 All entries will be created immediately. Review them in your ledger.
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowRecurringModal(false);
                  setRecurringData(null);
                }} 
                className="flex-1 py-3 font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
