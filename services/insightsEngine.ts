import type { Transaction, Invoice, TaxPayment, UserSettings } from "../types";

export type InsightSeverity = "low" | "medium" | "high";

export type InsightCategory =
  | "cashflow"
  | "spending"
  | "income"
  | "budget"
  | "goals"
  | "patterns"
  | "anomaly"
  | "subscriptions"
  | "forecast"
  | "savings"
  | "vendors"
  | "emergency"
  | "seasonal"
  | "recurring"
  | "distribution"
  | "invoices"
  | "tax";

export type Insight = {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  message: string;
  detail?: string;
  priority: number; // 1-10 scale
  actionable: boolean;
  data?: any; // Additional context data
};

const DISMISSED_KEY = "moniezi_insights_dismissed_v1";

export function getDismissedInsightIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string");
  } catch {
    return [];
  }
}

export function dismissInsightId(id: string) {
  const curr = new Set(getDismissedInsightIds());
  curr.add(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(curr)));
}

export function clearDismissedInsights() {
  localStorage.removeItem(DISMISSED_KEY);
}

// Utility Functions
function parseDate(d: string | Date): number {
  if (d instanceof Date) return d.getTime();
  const t = Date.parse(d);
  return Number.isFinite(t) ? t : 0;
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

function average(nums: number[]): number {
  return nums.length > 0 ? sum(nums) / nums.length : 0;
}

function standardDeviation(nums: number[]): number {
  if (nums.length === 0) return 0;
  const avg = average(nums);
  const squaredDiffs = nums.map(n => Math.pow(n - avg, 2));
  return Math.sqrt(average(squaredDiffs));
}

function lastNDaysTransactions(transactions: Transaction[], days: number): Transaction[] {
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return transactions.filter((t) => parseDate(t.date) >= cutoff);
}

function groupByCategory(transactions: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  transactions.forEach(t => {
    const cat = t.category || "Uncategorized";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(t);
  });
  return map;
}

function groupByMonth(transactions: Transaction[]): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  transactions.forEach(t => {
    const month = t.date.substring(0, 7); // YYYY-MM
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(t);
  });
  return map;
}

function formatMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const val = Math.abs(n);
  return `${sign}$${val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Main Insights Generation
export function generateInsights(input: {
  transactions: Transaction[];
  invoices: Invoice[];
  taxPayments: TaxPayment[];
  settings: UserSettings;
}): Insight[] {
  const { transactions, invoices, taxPayments, settings } = input;
  const insights: Insight[] = [];

  // Run all analysis modules
  analyzeCashFlow(transactions, insights);
  analyzeSpendingTrends(transactions, insights);
  analyzeIncome(transactions, insights);
  analyzeInvoices(invoices, insights);
  analyzeCategoryConcentration(transactions, insights);
  analyzeTaxPayments(transactions, taxPayments, insights);
  detectAnomalies(transactions, insights);
  analyzeRecurringPatterns(transactions, insights);
  analyzeSpendingByDayOfWeek(transactions, insights);
  analyzeSavingsRate(transactions, insights);
  analyzeTopVendors(transactions, insights);
  detectSubscriptions(transactions, insights);
  predictNextMonthSpending(transactions, insights);
  analyzeSeasonalPatterns(transactions, insights);

  // Sort by priority (highest first)
  insights.sort((a, b) => b.priority - a.priority);

  // Remove duplicates
  const seen = new Set<string>();
  return insights.filter(insight => {
    const key = `${insight.category}-${insight.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 1. Cash Flow Analysis
function analyzeCashFlow(transactions: Transaction[], insights: Insight[]) {
  if (transactions.length < 5) return;

  const income = sum(transactions.filter(t => t.type === "income").map(t => t.amount));
  const expenses = sum(transactions.filter(t => t.type === "expense").map(t => Math.abs(t.amount)));
  const net = income - expenses;

  if (net < 0) {
    insights.push({
      id: "cashflow_negative",
      severity: "high",
      category: "cashflow",
      title: "Negative cash flow",
      message: `You're spending more than you earn (${formatMoney(net)} net).`,
      detail: "Consider reducing your biggest expense categories or increasing income sources.",
      priority: 10,
      actionable: true,
      data: { income, expenses, net }
    });
  } else if (income > 0) {
    const savingsRate = (net / income) * 100;
    
    if (savingsRate < 10) {
      insights.push({
        id: "cashflow_low_savings",
        severity: "medium",
        category: "cashflow",
        title: "Low savings rate",
        message: `You're only saving ${savingsRate.toFixed(1)}% of your income.`,
        detail: "Financial experts recommend saving at least 20% of income for financial health.",
        priority: 8,
        actionable: true,
        data: { income, expenses, net, savingsRate }
      });
    } else if (savingsRate >= 20) {
      insights.push({
        id: "cashflow_healthy",
        severity: "low",
        category: "cashflow",
        title: "Excellent savings rate!",
        message: `You're saving ${savingsRate.toFixed(1)}% of your income (${formatMoney(net)}).`,
        detail: "Great job! You're building strong financial health.",
        priority: 6,
        actionable: false,
        data: { income, expenses, net, savingsRate }
      });
    }
  }
}

// 2. Spending Trends Analysis
function analyzeSpendingTrends(transactions: Transaction[], insights: Insight[]) {
  if (transactions.length < 10) return;

  const last30 = lastNDaysTransactions(transactions, 30);
  const last60 = lastNDaysTransactions(transactions, 60);
  const prev30 = last60.filter(t => !last30.includes(t));

  const expLast = sum(last30.filter(t => t.type === "expense").map(t => Math.abs(t.amount)));
  const expPrev = sum(prev30.filter(t => t.type === "expense").map(t => Math.abs(t.amount)));

  if (expPrev > 0) {
    const changePercent = ((expLast - expPrev) / expPrev) * 100;

    if (changePercent > 25) {
      insights.push({
        id: "spend_up_30",
        severity: "medium",
        category: "spending",
        title: "Expenses rising significantly",
        message: `Your expenses increased by ${changePercent.toFixed(1)}% compared to the previous period.`,
        detail: `Current: ${formatMoney(expLast)} vs Previous: ${formatMoney(expPrev)}. Review recent purchases to identify the cause.`,
        priority: 8,
        actionable: true,
        data: { expLast, expPrev, changePercent }
      });
    } else if (changePercent < -20) {
      insights.push({
        id: "spend_down_30",
        severity: "low",
        category: "spending",
        title: "Great job reducing expenses!",
        message: `You've decreased spending by ${Math.abs(changePercent).toFixed(1)}% this period.`,
        detail: `You're saving ${formatMoney(expPrev - expLast)} compared to last period. Keep it up!`,
        priority: 6,
        actionable: false,
        data: { expLast, expPrev, changePercent }
      });
    }
  }
}

// 3. Income Analysis
function analyzeIncome(transactions: Transaction[], insights: Insight[]) {
  if (transactions.length < 10) return;

  const incomeTx = transactions.filter(t => t.type === "income");
  if (incomeTx.length === 0) return;

  // Analyze income stability over last 3 months
  const monthlyIncome = groupByMonth(incomeTx);
  const months = Array.from(monthlyIncome.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3);

  if (months.length >= 2) {
    const amounts = months.map(([_, txs]) => sum(txs.map(t => t.amount)));
    const avgIncome = average(amounts);
    const stdDev = standardDeviation(amounts);
    const coefficientOfVariation = avgIncome > 0 ? (stdDev / avgIncome) * 100 : 0;

    if (coefficientOfVariation > 30) {
      insights.push({
        id: "income_volatility",
        severity: "medium",
        category: "income",
        title: "Income varies significantly",
        message: `Your monthly income fluctuates by ${coefficientOfVariation.toFixed(1)}%.`,
        detail: "Variable income requires a larger emergency fund (6+ months of expenses) and careful budgeting.",
        priority: 7,
        actionable: true,
        data: { avgIncome, stdDev, coefficientOfVariation, amounts }
      });
    } else if (coefficientOfVariation < 10) {
      insights.push({
        id: "income_stable",
        severity: "low",
        category: "income",
        title: "Stable income stream",
        message: "Your income is very consistent month-to-month.",
        detail: "Predictable income allows for better planning. Consider automating savings and bill payments.",
        priority: 5,
        actionable: false,
        data: { avgIncome, coefficientOfVariation }
      });
    }
  }
}

// 4. Invoice Analysis
function analyzeInvoices(invoices: Invoice[], insights: Insight[]) {
  const unpaid = invoices.filter(inv => inv.status === "unpaid");
  
  if (unpaid.length > 0) {
    const now = Date.now();
    const overdue = unpaid.filter(inv => {
      const dueDate = parseDate(inv.due || inv.date);
      return dueDate > 0 && dueDate < now - 24 * 60 * 60 * 1000;
    });

    if (overdue.length > 0) {
      const totalOverdue = sum(overdue.map(inv => inv.amount));
      insights.push({
        id: "invoices_overdue",
        severity: "high",
        category: "invoices",
        title: "Overdue invoices detected",
        message: `${overdue.length} invoice(s) totaling ${formatMoney(totalOverdue)} are overdue.`,
        detail: "Follow up with clients immediately. Consider implementing automatic payment reminders.",
        priority: 9,
        actionable: true,
        data: { overdueCount: overdue.length, totalOverdue, overdue }
      });
    } else {
      const totalUnpaid = sum(unpaid.map(inv => inv.amount));
      insights.push({
        id: "invoices_unpaid",
        severity: "medium",
        category: "invoices",
        title: "Unpaid invoices",
        message: `${unpaid.length} invoice(s) worth ${formatMoney(totalUnpaid)} are awaiting payment.`,
        detail: "Monitor these closely and send friendly reminders as due dates approach.",
        priority: 6,
        actionable: true,
        data: { unpaidCount: unpaid.length, totalUnpaid, unpaid }
      });
    }
  }
}

// 5. Category Concentration Analysis
function analyzeCategoryConcentration(transactions: Transaction[], insights: Insight[]) {
  const expenseTx = transactions.filter(t => t.type === "expense");
  if (expenseTx.length < 8) return;

  const byCategory = groupByCategory(expenseTx);
  const categoryTotals = Array.from(byCategory.entries())
    .map(([cat, txs]) => ({
      category: cat,
      total: sum(txs.map(t => Math.abs(t.amount))),
      count: txs.length
    }))
    .sort((a, b) => b.total - a.total);

  const totalExpenses = sum(categoryTotals.map(c => c.total));
  const topCategory = categoryTotals[0];

  if (topCategory && totalExpenses > 0) {
    const percentage = (topCategory.total / totalExpenses) * 100;

    if (percentage > 45) {
      insights.push({
        id: "category_concentration",
        severity: "medium",
        category: "distribution",
        title: "One category dominates spending",
        message: `"${topCategory.category}" represents ${percentage.toFixed(1)}% of your expenses (${formatMoney(topCategory.total)}).`,
        detail: "If this is expected (e.g., rent, inventory), it's fine. Otherwise, review for potential savings opportunities.",
        priority: 7,
        actionable: true,
        data: { topCategory, percentage, categoryTotals }
      });
    }
  }
}

// 6. Tax Payment Analysis
function analyzeTaxPayments(
  transactions: Transaction[],
  taxPayments: TaxPayment[],
  insights: Insight[]
) {
  const income = sum(transactions.filter(t => t.type === "income").map(t => t.amount));
  if (income === 0) return;

  const paidTax = sum(taxPayments.map(p => p.amount));
  const estimatedTax = income * 0.20; // Rough 20% estimate

  if (paidTax < estimatedTax * 0.5) {
    const shortfall = estimatedTax - paidTax;
    insights.push({
      id: "tax_underfunded",
      severity: "medium",
      category: "tax",
      title: "Tax payments may be low",
      message: `Tax payments (${formatMoney(paidTax)}) look low compared to estimated liability (${formatMoney(estimatedTax)}).`,
      detail: `Consider setting aside approximately ${formatMoney(shortfall)} more. Consult a tax professional for accurate estimates.`,
      priority: 7,
      actionable: true,
      data: { paidTax, estimatedTax, shortfall, income }
    });
  }
}

// 7. Anomaly Detection
function detectAnomalies(transactions: Transaction[], insights: Insight[]) {
  const last60Days = lastNDaysTransactions(transactions, 60);
  const expenses = last60Days.filter(t => t.type === "expense");

  if (expenses.length < 10) return;

  const amounts = expenses.map(t => Math.abs(t.amount));
  const mean = average(amounts);
  const stdDev = standardDeviation(amounts);

  // Find outliers in last 7 days (> 2 standard deviations)
  const recent = lastNDaysTransactions(transactions, 7).filter(t => t.type === "expense");

  recent.forEach(transaction => {
    const amount = Math.abs(transaction.amount);
    const zScore = stdDev > 0 ? (amount - mean) / stdDev : 0;

    if (zScore > 2) {
      insights.push({
        id: `anomaly_${transaction.id}`,
        severity: "medium",
        category: "anomaly",
        title: "Unusual large purchase detected",
        message: `${formatMoney(amount)} for "${transaction.name}" is ${zScore.toFixed(1)}x your typical spending.`,
        detail: "Was this planned? Ensure unusual purchases align with your budget and financial goals.",
        priority: 6,
        actionable: true,
        data: { transaction, mean, stdDev, zScore }
      });
    }
  });
}

// 8. Recurring Pattern Analysis
function analyzeRecurringPatterns(transactions: Transaction[], insights: Insight[]) {
  // Group similar transactions by name and amount
  const transactionGroups = new Map<string, Transaction[]>();

  transactions.forEach(t => {
    const roundedAmount = Math.round(Math.abs(t.amount) / 5) * 5; // Round to nearest $5
    const key = `${t.name.toLowerCase()}_${roundedAmount}`;
    if (!transactionGroups.has(key)) transactionGroups.set(key, []);
    transactionGroups.get(key)!.push(t);
  });

  // Find recurring patterns (3+ occurrences)
  transactionGroups.forEach((txs, key) => {
    if (txs.length >= 3) {
      const sortedDates = txs.map(t => parseDate(t.date)).sort((a, b) => a - b);
      const intervals: number[] = [];

      for (let i = 1; i < sortedDates.length; i++) {
        const days = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
        intervals.push(days);
      }

      const avgInterval = average(intervals);
      const isRegular = intervals.every(i => Math.abs(i - avgInterval) < 7);

      // Check for monthly recurring (25-35 days)
      if (isRegular && avgInterval >= 25 && avgInterval <= 35) {
        const lastTx = txs[txs.length - 1];
        const daysSinceLast = (Date.now() - parseDate(lastTx.date)) / (1000 * 60 * 60 * 24);

        if (daysSinceLast > avgInterval + 5) {
          insights.push({
            id: `recurring_missing_${key}`,
            severity: "medium",
            category: "recurring",
            title: "Expected transaction missing",
            message: `Haven't seen "${lastTx.name}" for ${Math.floor(daysSinceLast)} days (usually every ${Math.floor(avgInterval)} days).`,
            detail: "Check if this subscription or bill is still active or has been paid through another method.",
            priority: 6,
            actionable: true,
            data: { lastTx, avgInterval, daysSinceLast, occurrences: txs.length }
          });
        }
      }
    }
  });
}

// 9. Spending by Day of Week
function analyzeSpendingByDayOfWeek(transactions: Transaction[], insights: Insight[]) {
  const last60Days = lastNDaysTransactions(transactions, 60);
  const expenses = last60Days.filter(t => t.type === "expense");

  if (expenses.length < 20) return;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay = new Map<string, number>();

  expenses.forEach(t => {
    const date = new Date(t.date);
    const day = days[date.getDay()];
    byDay.set(day, (byDay.get(day) || 0) + Math.abs(t.amount));
  });

  const sortedDays = Array.from(byDay.entries()).sort((a, b) => b[1] - a[1]);
  const topDay = sortedDays[0];
  const totalSpending = sum(Array.from(byDay.values()));

  if (topDay && totalSpending > 0) {
    const percentage = (topDay[1] / totalSpending) * 100;

    if (percentage > 25) {
      insights.push({
        id: "day_pattern",
        severity: "low",
        category: "patterns",
        title: `You spend most on ${topDay[0]}s`,
        message: `${percentage.toFixed(1)}% of your spending happens on ${topDay[0]}s (${formatMoney(topDay[1])}).`,
        detail: `Be extra mindful of purchases on ${topDay[0]}s. Consider planning ahead to avoid impulse spending.`,
        priority: 4,
        actionable: true,
        data: { topDay: topDay[0], amount: topDay[1], percentage, byDay: Object.fromEntries(byDay) }
      });
    }
  }
}

// 10. Savings Rate Analysis
function analyzeSavingsRate(transactions: Transaction[], insights: Insight[]) {
  const monthlyData = groupByMonth(transactions);
  const recentMonths = Array.from(monthlyData.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3);

  if (recentMonths.length < 2) return;

  const savingsRates = recentMonths.map(([month, txs]) => {
    const income = sum(txs.filter(t => t.type === "income").map(t => t.amount));
    const expenses = sum(txs.filter(t => t.type === "expense").map(t => Math.abs(t.amount)));
    const rate = income > 0 ? ((income - expenses) / income) * 100 : 0;
    return { month, rate, savings: income - expenses, income, expenses };
  });

  const avgSavingsRate = average(savingsRates.map(s => s.rate));

  if (avgSavingsRate < 10 && avgSavingsRate > 0) {
    insights.push({
      id: "low_savings_rate",
      severity: "medium",
      category: "savings",
      title: "Below recommended savings rate",
      message: `Your average savings rate is ${avgSavingsRate.toFixed(1)}%. Aim for at least 20%.`,
      detail: "Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings. Start small and increase gradually.",
      priority: 7,
      actionable: true,
      data: { avgSavingsRate, savingsRates }
    });
  } else if (avgSavingsRate >= 20) {
    insights.push({
      id: "good_savings_rate",
      severity: "low",
      category: "savings",
      title: "Excellent savings habits!",
      message: `You're saving ${avgSavingsRate.toFixed(1)}% of your income on average.`,
      detail: "You're building wealth effectively! Consider diversifying your savings into investments for long-term growth.",
      priority: 5,
      actionable: false,
      data: { avgSavingsRate, savingsRates }
    });
  }
}

// 11. Top Vendors Analysis
function analyzeTopVendors(transactions: Transaction[], insights: Insight[]) {
  const last90Days = lastNDaysTransactions(transactions, 90);
  const expenses = last90Days.filter(t => t.type === "expense");

  if (expenses.length < 10) return;

  const vendorSpending = new Map<string, number>();
  expenses.forEach(t => {
    const vendor = t.name || "Unknown";
    vendorSpending.set(vendor, (vendorSpending.get(vendor) || 0) + Math.abs(t.amount));
  });

  const topVendors = Array.from(vendorSpending.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (topVendors.length > 0) {
    const totalSpending = sum(Array.from(vendorSpending.values()));
    const topVendor = topVendors[0];
    const percentage = (topVendor[1] / totalSpending) * 100;

    if (percentage > 20) {
      insights.push({
        id: "top_vendor",
        severity: "low",
        category: "vendors",
        title: `Most spending at "${topVendor[0]}"`,
        message: `${percentage.toFixed(1)}% of your expenses (${formatMoney(topVendor[1])}) go to ${topVendor[0]}.`,
        detail: "Consider if there are cheaper alternatives or ways to negotiate better rates with this vendor.",
        priority: 5,
        actionable: true,
        data: { topVendor, percentage, topVendors, totalSpending }
      });
    }
  }
}

// 12. Subscription Detection
function detectSubscriptions(transactions: Transaction[], insights: Insight[]) {
  const potentialSubs = new Map<string, Transaction[]>();

  transactions.filter(t => t.type === "expense").forEach(t => {
    const roundedAmount = Math.round(Math.abs(t.amount) / 5) * 5;
    const key = `${t.name.toLowerCase()}_${roundedAmount}`;
    if (!potentialSubs.has(key)) potentialSubs.set(key, []);
    potentialSubs.get(key)!.push(t);
  });

  let totalMonthlySubscriptions = 0;
  const subscriptions: any[] = [];

  potentialSubs.forEach((txs, key) => {
    if (txs.length >= 3) {
      const dates = txs.map(t => parseDate(t.date)).sort((a, b) => a - b);
      const intervals: number[] = [];

      for (let i = 1; i < dates.length; i++) {
        const days = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        intervals.push(days);
      }

      const avgInterval = average(intervals);

      // Monthly subscription (25-35 days)
      if (avgInterval >= 25 && avgInterval <= 35) {
        const amount = Math.abs(txs[0].amount);
        totalMonthlySubscriptions += amount;
        subscriptions.push({
          name: txs[0].name,
          amount,
          frequency: "monthly",
          lastDate: txs[txs.length - 1].date
        });
      }
    }
  });

  if (totalMonthlySubscriptions > 0 && subscriptions.length > 0) {
    const last30Days = lastNDaysTransactions(transactions, 30);
    const totalMonthlySpending = sum(
      last30Days.filter(t => t.type === "expense").map(t => Math.abs(t.amount))
    );
    const subscriptionPercent =
      totalMonthlySpending > 0 ? (totalMonthlySubscriptions / totalMonthlySpending) * 100 : 0;

    if (subscriptionPercent > 15) {
      insights.push({
        id: "subscriptions_high",
        severity: "medium",
        category: "subscriptions",
        title: "Subscriptions are significant expense",
        message: `Subscriptions represent ${subscriptionPercent.toFixed(1)}% of monthly spending (${formatMoney(totalMonthlySubscriptions)}).`,
        detail: `Found ${subscriptions.length} recurring subscription(s). Review each to ensure you're getting value.`,
        priority: 7,
        actionable: true,
        data: { subscriptionPercent, totalMonthlySubscriptions, subscriptions }
      });
    } else if (subscriptions.length > 3) {
      insights.push({
        id: "subscriptions_summary",
        severity: "low",
        category: "subscriptions",
        title: "Monthly subscription summary",
        message: `You have ${subscriptions.length} recurring subscription(s) totaling ${formatMoney(totalMonthlySubscriptions)}/month.`,
        detail: "Regularly review subscriptions to ensure they still provide value.",
        priority: 5,
        actionable: true,
        data: { totalMonthlySubscriptions, subscriptions }
      });
    }
  }
}

// 13. Predictive Spending Forecast
function predictNextMonthSpending(transactions: Transaction[], insights: Insight[]) {
  const monthlySpending = groupByMonth(transactions.filter(t => t.type === "expense"));
  const months = Array.from(monthlySpending.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3);

  if (months.length < 2) return;

  const amounts = months.map(([_, txs]) => sum(txs.map(t => Math.abs(t.amount))));
  const avgSpending = average(amounts);

  // Calculate trend
  const trend = amounts.length >= 3 ? (amounts[0] - amounts[amounts.length - 1]) / amounts.length : 0;
  const predicted = avgSpending + trend;

  // Get current month spending so far
  const currentMonth = new Date().toISOString().substring(0, 7);
  const currentTxs = transactions.filter(
    t => t.date.startsWith(currentMonth) && t.type === "expense"
  );
  const currentSpending = sum(currentTxs.map(t => Math.abs(t.amount)));

  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projectedMonthTotal = (currentSpending / dayOfMonth) * daysInMonth;

  if (projectedMonthTotal > predicted * 1.15) {
    insights.push({
      id: "spending_forecast_high",
      severity: "medium",
      category: "forecast",
      title: "On track to overspend this month",
      message: `At current pace, you'll spend ${formatMoney(projectedMonthTotal)} vs typical ${formatMoney(predicted)}.`,
      detail: `You've spent ${formatMoney(currentSpending)} in ${dayOfMonth} days. Reduce discretionary spending to stay on track.`,
      priority: 7,
      actionable: true,
      data: { predicted, projectedMonthTotal, currentSpending, dayOfMonth }
    });
  } else if (projectedMonthTotal < predicted * 0.85) {
    insights.push({
      id: "spending_forecast_low",
      severity: "low",
      category: "forecast",
      title: "Trending below normal spending",
      message: `You're on pace to spend ${formatMoney(projectedMonthTotal)} vs typical ${formatMoney(predicted)}.`,
      detail: "Great spending control! Consider allocating the difference to savings or investments.",
      priority: 5,
      actionable: false,
      data: { predicted, projectedMonthTotal, currentSpending }
    });
  }
}

// 14. Seasonal Patterns
function analyzeSeasonalPatterns(transactions: Transaction[], insights: Insight[]) {
  const expenses = transactions.filter(t => t.type === "expense");
  if (expenses.length < 30) return;

  const monthlySpending = new Map<number, number>();

  expenses.forEach(t => {
    const month = new Date(t.date).getMonth();
    monthlySpending.set(month, (monthlySpending.get(month) || 0) + Math.abs(t.amount));
  });

  const currentMonth = new Date().getMonth();
  const currentMonthSpending = monthlySpending.get(currentMonth) || 0;

  const otherMonths = Array.from(monthlySpending.entries()).filter(([m]) => m !== currentMonth);

  if (otherMonths.length > 0) {
    const avgOtherMonths = average(otherMonths.map(([_, amt]) => amt));

    if (currentMonthSpending > avgOtherMonths * 1.3) {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const increase = ((currentMonthSpending / avgOtherMonths - 1) * 100).toFixed(0);

      insights.push({
        id: "seasonal_high",
        severity: "low",
        category: "seasonal",
        title: `${monthNames[currentMonth]} is a high-spending month`,
        message: `Historically, you spend ${increase}% more in ${monthNames[currentMonth]}.`,
        detail: "This could be due to holidays, seasonal needs, or recurring annual expenses. Plan ahead for this pattern next year.",
        priority: 4,
        actionable: false,
        data: { month: monthNames[currentMonth], currentMonthSpending, avgOtherMonths, increase }
      });
    }
  }
}

// Get count of active insights (for badge)
export function getInsightCount(input: {
  transactions: Transaction[];
  invoices: Invoice[];
  taxPayments: TaxPayment[];
  settings: UserSettings;
}): number {
  const insights = generateInsights(input);
  const dismissed = new Set(getDismissedInsightIds());
  return insights.filter((i) => !dismissed.has(i.id)).length;
}
