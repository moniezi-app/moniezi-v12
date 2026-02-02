import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  RefreshCcw,
  AlertTriangle,
  Info,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Target,
  Calendar,
  Activity,
  ShoppingCart,
  Bell,
  Sparkles,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  ChevronRight,
} from "lucide-react";
import type { Transaction, Invoice, TaxPayment, UserSettings } from "./types";
import {
  generateInsights,
  getDismissedInsightIds,
  dismissInsightId,
  clearDismissedInsights,
  type Insight,
  type InsightCategory,
} from "./services/insightsEngine";

type Props = {
  transactions: Transaction[];
  invoices: Invoice[];
  taxPayments: TaxPayment[];
  settings: UserSettings;
  onClose: () => void;
};

function getCategoryIcon(category: InsightCategory) {
  switch (category) {
    case "cashflow": return <Activity className="w-5 h-5" />;
    case "spending": return <ShoppingCart className="w-5 h-5" />;
    case "income": return <TrendingUp className="w-5 h-5" />;
    case "budget": return <Target className="w-5 h-5" />;
    case "patterns": return <Calendar className="w-5 h-5" />;
    case "subscriptions": return <Bell className="w-5 h-5" />;
    case "forecast": return <Sparkles className="w-5 h-5" />;
    case "savings": return <DollarSign className="w-5 h-5" />;
    default: return <Info className="w-5 h-5" />;
  }
}

function SeverityIcon({ severity }: { severity: Insight["severity"] }) {
  if (severity === "high") return <AlertTriangle className="w-5 h-5" />;
  if (severity === "medium") return <Info className="w-5 h-5" />;
  return <CheckCircle2 className="w-5 h-5" />;
}

function severityColors(severity: Insight["severity"]) {
  switch (severity) {
    case "high":
      return {
        icon: "text-red-500",
        bg: "bg-red-50 dark:bg-red-950/10",
        border: "border-red-200 dark:border-red-900/20",
      };
    case "medium":
      return {
        icon: "text-amber-500",
        bg: "bg-amber-50 dark:bg-amber-950/10",
        border: "border-amber-200 dark:border-amber-900/20",
      };
    default:
      return {
        icon: "text-emerald-500",
        bg: "bg-emerald-50 dark:bg-emerald-950/10",
        border: "border-emerald-200 dark:border-emerald-900/20",
      };
  }
}

export default function InsightsDashboard({
  transactions,
  invoices,
  taxPayments,
  settings,
  onClose,
}: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set()); // All collapsed by default
  const [expandedInsights, setExpandedInsights] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setDismissed(new Set(getDismissedInsightIds()));
  }, []);

  const allInsights: Insight[] = useMemo(() => {
    return generateInsights({ transactions, invoices, taxPayments, settings });
  }, [transactions, invoices, taxPayments, settings]);

  const insightsBySeverity = useMemo(() => {
    const active = allInsights.filter((i) => !dismissed.has(i.id));
    active.sort((a, b) => b.priority - a.priority);
    
    return {
      high: active.filter((i) => i.severity === "high"),
      medium: active.filter((i) => i.severity === "medium"),
      low: active.filter((i) => i.severity === "low"),
    };
  }, [allInsights, dismissed]);

  const stats = useMemo(() => {
    const active = allInsights.filter((i) => !dismissed.has(i.id));
    return {
      total: allInsights.length,
      active: active.length,
      high: insightsBySeverity.high.length,
      medium: insightsBySeverity.medium.length,
      low: insightsBySeverity.low.length,
      actionable: active.filter((i) => i.actionable).length,
    };
  }, [allInsights, dismissed, insightsBySeverity]);

  const dismiss = (id: string) => {
    dismissInsightId(id);
    setDismissed(new Set(getDismissedInsightIds()));
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const resetDismissed = () => {
    clearDismissedInsights();
    setDismissed(new Set());
  };

  const toggleCategory = (severity: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(severity)) {
      newExpanded.delete(severity);
    } else {
      newExpanded.add(severity);
    }
    setExpandedCategories(newExpanded);
  };

  const toggleInsightDetail = (id: string) => {
    const newExpanded = new Set(expandedInsights);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedInsights(newExpanded);
  };

  const renderInsightSection = (severity: "high" | "medium" | "low", insights: Insight[]) => {
    const isExpanded = expandedCategories.has(severity);
    const colors = severityColors(severity);
    const labels = {
      high: { title: "High Priority", count: insights.length, icon: AlertTriangle },
      medium: { title: "Medium Priority", count: insights.length, icon: Info },
      low: { title: "Good News", count: insights.length, icon: CheckCircle2 },
    };
    const label = labels[severity];
    const Icon = label.icon;

    if (insights.length === 0) return null;

    return (
      <div key={severity} className="border-b border-slate-200 dark:border-slate-800">
        {/* Section Header - Collapsible */}
        <button
          onClick={() => toggleCategory(severity)}
          className="w-full px-6 py-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${colors.bg}`}>
              <Icon className={`w-5 h-5 ${colors.icon}`} />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {label.title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {label.count} {label.count === 1 ? 'insight' : 'insights'}
              </p>
            </div>
          </div>
          <ChevronDown
            className={`w-6 h-6 text-slate-400 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Expanded Insights */}
        {isExpanded && (
          <div className="bg-slate-50/50 dark:bg-slate-950/20">
            {insights.map((insight, index) => {
              const isDetailExpanded = expandedInsights.has(insight.id);
              
              return (
                <div
                  key={insight.id}
                  className={`${index !== 0 ? 'border-t border-slate-200 dark:border-slate-800' : ''}`}
                >
                  {/* Mobile-First Card Layout */}
                  <div className="p-4 sm:p-6 hover:bg-white dark:hover:bg-slate-900/30 transition-colors">
                    
                    {/* Top Row: Icon + Title (Single Line) */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg ${colors.bg} flex items-center justify-center`}>
                        {getCategoryIcon(insight.category)}
                      </div>
                      <h4 className="flex-1 text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                        {insight.title}
                      </h4>
                    </div>

                    {/* Message - Full Width */}
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                      {insight.message}
                    </p>

                    {/* Badges Row - Stack on Mobile */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold capitalize">
                        {insight.category}
                      </span>
                      {insight.actionable && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold">
                          <Target className="w-3 h-3" />
                          Action
                        </span>
                      )}
                    </div>

                    {/* Expandable Recommendation Detail */}
                    {insight.detail && (
                      <div className="mb-4">
                        {isDetailExpanded && (
                          <div className="mb-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                              {insight.detail}
                            </p>
                          </div>
                        )}
                        <button
                          onClick={() => toggleInsightDetail(insight.id)}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600 text-white text-sm font-semibold transition-colors"
                        >
                          {isDetailExpanded ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              Hide Details
                            </>
                          ) : (
                            <>
                              <ChevronRight className="w-4 h-4" />
                              View Recommendation
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Dismiss Button - Full Width on Mobile */}
                    <button
                      onClick={() => dismiss(insight.id)}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-colors"
                    >
                      Dismiss
                    </button>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-slate-950">
      {/* Modern Clean Header */}
      <div className="flex-shrink-0 relative px-6 py-6 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        {/* Action Buttons */}
        <div className="absolute top-6 right-6 flex items-center gap-3 z-10">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCcw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Title Section */}
        <div className="pr-28 mb-5">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-purple-100 dark:bg-purple-900/30">
              <BrainCircuit className="w-7 h-7 text-purple-600 dark:text-purple-400" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-1">Smart Insights</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{stats.active} active insights</p>
            </div>
          </div>
        </div>

        {/* Quick Stats Pills - Modern Flat Design */}
        <div className="flex flex-wrap items-center gap-2.5">
          {stats.high > 0 && (
            <div className="px-4 py-2 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold border border-red-200 dark:border-red-800/50">
              {stats.high} High
            </div>
          )}
          {stats.medium > 0 && (
            <div className="px-4 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold border border-amber-200 dark:border-amber-800/50">
              {stats.medium} Medium
            </div>
          )}
          {stats.actionable > 0 && (
            <div className="px-4 py-2 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-bold border border-purple-200 dark:border-purple-800/50">
              {stats.actionable} Need Action
            </div>
          )}
          <button
            onClick={resetDismissed}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors border border-slate-200 dark:border-slate-800"
          >
            Reset Dismissed
          </button>
        </div>
      </div>

      {/* Full-Height Scrollable Content - Like Weather App */}
      <div className="flex-1 overflow-y-auto">
        {stats.active === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg">
              <BrainCircuit className="w-8 h-8 text-white" strokeWidth={1.2} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              All Clear!
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-sm">
              No active insights. Add more transactions or reset dismissed insights.
            </p>
          </div>
        ) : (
          <>
            {renderInsightSection("high", insightsBySeverity.high)}
            {renderInsightSection("medium", insightsBySeverity.medium)}
            {renderInsightSection("low", insightsBySeverity.low)}
          </>
        )}
        
        {/* Bottom Padding - Generous space to prevent cutoff */}
        <div className="h-32" />
      </div>
    </div>
  );
}
