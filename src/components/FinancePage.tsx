import { useState, useMemo } from "react";
import { Horse, MaintenanceLog, SystemUser, MaintenanceType } from "../types";
import { 
  TrendingUp, 
  DollarSign, 
  Receipt, 
  Calendar, 
  ShieldAlert, 
  Download, 
  ArrowUpDown, 
  Filter, 
  Layers, 
  Award, 
  Hammer, 
  Stethoscope, 
  Heart, 
  Pill, 
  Check, 
  Search, 
  HelpCircle,
  FileText,
  Trash2,
  Printer
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend, 
  Cell, 
  PieChart, 
  Pie 
} from "recharts";
import { motion } from "motion/react";
import { downloadHerdCSV } from "../utils/csv";

interface FinancePageProps {
  currentUser: SystemUser | null;
  allLogs: MaintenanceLog[];
  horses: Horse[];
  todayStr: string;
  onResetFinances?: () => Promise<void>;
  onNavigateToHorse?: (horseId: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  shoeing: "#0d9488",      // teal
  vet: "#be123c",          // rose
  deworming: "#0284c7",    // sky
  branding: "#111827",     // dark/stone
  dental: "#d97706",       // amber
  vaccination: "#4f46e5",  // indigo
  medication: "#ea580c",   // orange
  grooming: "#16a34a",     // green
  other: "#78716c"         // warm stone
};

const CATEGORY_LABELS: Record<string, string> = {
  shoeing: "Shoeing",
  vet: "Veterinary Care",
  deworming: "Deworming",
  branding: "Branding",
  dental: "Dental",
  vaccination: "Vaccinations",
  medication: "Medication",
  grooming: "Grooming",
  other: "Other"
};

export default function FinancePage({ currentUser, allLogs, horses, todayStr, onResetFinances, onNavigateToHorse }: FinancePageProps) {
  const [timeRange, setTimeRange] = useState<"6m" | "12m" | "ytd" | "all">("12m");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedHorseId, setSelectedHorseId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "cost" | "horse">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isResetting, setIsResetting] = useState(false);

  // 1. Access Control Guard - Expanded to Admin & Owner
  const isOwnerOrAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";

  // Filter logs by selected parameters and time range
  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      // 1. Filter by category
      if (selectedCategory !== "all" && log.type !== selectedCategory) return false;

      // 2. Filter by horse
      if (selectedHorseId !== "all" && log.horseId !== selectedHorseId) return false;

      // 3. Filter by search query (notes, performedBy, horseName)
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesName = log.horseName?.toLowerCase().includes(query);
        const matchesNotes = log.notes?.toLowerCase().includes(query);
        const matchesPerf = log.performedBy?.toLowerCase().includes(query);
        if (!matchesName && !matchesNotes && !matchesPerf) return false;
      }

      // 4. Filter by Time Range
      if (!log.date) return false;
      const logDate = new Date(log.date);
      const referenceDate = new Date(todayStr || "2026-06-30");

      if (timeRange === "6m") {
        const sixMonthsAgo = new Date(referenceDate);
        sixMonthsAgo.setMonth(referenceDate.getMonth() - 6);
        return logDate >= sixMonthsAgo;
      } else if (timeRange === "12m") {
        const twelveMonthsAgo = new Date(referenceDate);
        twelveMonthsAgo.setMonth(referenceDate.getMonth() - 12);
        return logDate >= twelveMonthsAgo;
      } else if (timeRange === "ytd") {
        const startOfYear = new Date(referenceDate.getFullYear(), 0, 1);
        return logDate >= startOfYear;
      }

      return true; // "all"
    });
  }, [allLogs, selectedCategory, selectedHorseId, searchQuery, timeRange, todayStr]);

  // Sort logs
  const sortedLogs = useMemo(() => {
    return [...filteredLogs].sort((a, b) => {
      let comparison = 0;
      if (sortBy === "date") {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortBy === "cost") {
        comparison = (Number(a.cost) || 0) - (Number(b.cost) || 0);
      } else if (sortBy === "horse") {
        comparison = (a.horseName || "").localeCompare(b.horseName || "");
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });
  }, [filteredLogs, sortBy, sortOrder]);

  // Calculate high-level financial metrics
  const metrics = useMemo(() => {
    const total = filteredLogs.reduce((sum, log) => sum + (Number(log.cost) || 0), 0);
    const count = filteredLogs.length;
    const avg = count > 0 ? total / count : 0;
    
    // Max cost item
    const maxItem = filteredLogs.reduce((max, log) => 
      (Number(log.cost) || 0) > (Number(max?.cost) || 0) ? log : max
    , null as MaintenanceLog | null);

    return { total, count, avg, maxItem };
  }, [filteredLogs]);

  // Monthly Expenditure Trend Data
  const monthlyTrendData = useMemo(() => {
    const dataMap: Record<string, { key: string; name: string; Cost: number; Count: number }> = {};
    const referenceDate = new Date(todayStr || "2026-06-30");

    let numMonths = 12;
    if (timeRange === "6m") numMonths = 6;
    else if (timeRange === "ytd") numMonths = referenceDate.getMonth() + 1;
    else if (timeRange === "all") numMonths = 24; // Limit default to 2 years back for visual look

    // Pre-populate with empty months to avoid visual gaps
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
      const monthName = d.toLocaleString("default", { month: "short" });
      const yearStr = d.getFullYear().toString().slice(-2);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      dataMap[monthKey] = {
        key: monthKey,
        name: `${monthName} '${yearStr}`,
        Cost: 0,
        Count: 0
      };
    }

    // Fill in real costs
    allLogs.forEach((log) => {
      if (!log.date) return;
      const logMonthKey = log.date.substring(0, 7); // "YYYY-MM"
      
      // If we are in "all" time range and the log is older than our 24-month display, we can dynamically add it or skip
      if (dataMap[logMonthKey]) {
        dataMap[logMonthKey].Cost += Number(log.cost) || 0;
        dataMap[logMonthKey].Count += 1;
      } else if (timeRange === "all") {
        // Dynamically add older months only if log belongs there
        const d = new Date(log.date);
        const monthName = d.toLocaleString("default", { month: "short" });
        const yearStr = d.getFullYear().toString().slice(-2);
        dataMap[logMonthKey] = {
          key: logMonthKey,
          name: `${monthName} '${yearStr}`,
          Cost: Number(log.cost) || 0,
          Count: 1
        };
      }
    });

    // Convert to sorted array
    return Object.values(dataMap).sort((a, b) => a.key.localeCompare(b.key));
  }, [allLogs, timeRange, todayStr]);

  // Expenditure by Category Breakdown
  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<string, { name: string; value: number; color: string; count: number }> = {};
    
    filteredLogs.forEach((log) => {
      const cat = log.type || "other";
      const cost = Number(log.cost) || 0;
      
      if (!breakdown[cat]) {
        breakdown[cat] = {
          name: CATEGORY_LABELS[cat] || cat.toUpperCase(),
          value: 0,
          color: CATEGORY_COLORS[cat] || "#78716c",
          count: 0
        };
      }
      breakdown[cat].value += cost;
      breakdown[cat].count += 1;
    });

    return Object.values(breakdown).sort((a, b) => b.value - a.value);
  }, [filteredLogs]);

  // Expenditure by Horse ranking
  const horseRanking = useMemo(() => {
    const ranking: Record<string, { horseId: string; name: string; totalSpend: number; count: number; breed: string }> = {};

    filteredLogs.forEach((log) => {
      const hId = log.horseId;
      const cost = Number(log.cost) || 0;
      if (!hId) return;

      if (!ranking[hId]) {
        const horseObj = horses.find(h => h.id === hId);
        ranking[hId] = {
          horseId: hId,
          name: log.horseName || "Unknown Horse",
          totalSpend: 0,
          count: 0,
          breed: horseObj?.breed || "Unknown Breed"
        };
      }
      ranking[hId].totalSpend += cost;
      ranking[hId].count += 1;
    });

    return Object.values(ranking).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [filteredLogs, horses]);

  // Export CSV helper for financial logs
  const handleExportCSV = () => {
    if (sortedLogs.length === 0) return;
    
    // Create CSV content headers
    const headers = ["Date", "Horse Name", "Category", "Performed By", "Cost ($)", "Notes", "Created At"];
    const rows = sortedLogs.map((log) => [
      log.date,
      log.horseName,
      CATEGORY_LABELS[log.type] || log.type,
      log.performedBy || "N/A",
      log.cost.toString(),
      `"${(log.notes || "").replace(/"/g, '""')}"`,
      log.createdAt || ""
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ruabon_farm_financial_report_${timeRange}_${new Date().toISOString().substring(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case "shoeing": return <Hammer size={14} className="text-teal-600" />;
      case "vet": return <Stethoscope size={14} className="text-rose-800" />;
      case "deworming": return <Heart size={14} className="text-sky-800" />;
      case "branding": return <Award size={14} className="text-stone-800" />;
      case "medication": return <Pill size={14} className="text-amber-600" />;
      default: return <Layers size={14} className="text-indigo-600" />;
    }
  };

  // Render Access Denied screen if user is not authorized
  if (!isOwnerOrAdmin) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-stone-200 p-8 text-center shadow-lg" id="finance-access-denied">
        <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center text-rose-600 mx-auto mb-6">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-black text-stone-900 uppercase tracking-tight">Access Restricted</h2>
        <p className="text-sm text-stone-500 mt-3 leading-relaxed">
          The Ruabon Farm Financial Ledger contains sensitive payroll, veterinary expense tracking, and equipment maintenance metrics.
        </p>
        <div className="bg-stone-50 border border-stone-150 rounded-2xl p-4 mt-6 text-left">
          <span className="text-[10px] text-stone-400 font-extrabold uppercase tracking-wider block">Required Privilege</span>
          <span className="text-xs font-bold text-stone-850 mt-1 block">Farm Owner or Administrator Role</span>
          
          <span className="text-[10px] text-stone-400 font-extrabold uppercase tracking-wider block mt-4">Current Account</span>
          <span className="text-xs font-semibold text-stone-700 mt-1 block">{currentUser?.name || "Unidentified User"} ({currentUser?.role || "Visitor"})</span>
        </div>
        <p className="text-[10px] text-stone-400 mt-6 uppercase font-bold tracking-widest">
          Please contact IT Administration to adjust credentials.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="finance-page-root">
      
      {/* Title & Stats Summary Cards */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tight">Financial Ledger</h1>
            <p className="text-xs text-stone-500 font-medium mt-0.5 uppercase tracking-wider font-mono">
              Ruabon Farm Herd Cost Aggregation &amp; Expenditure Timelines
            </p>
          </div>
          {isOwnerOrAdmin && onResetFinances && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                setIsResetting(true);
                try {
                  await onResetFinances();
                } finally {
                  setIsResetting(false);
                }
              }}
              disabled={isResetting}
              className="bg-rose-50 border border-rose-200 hover:border-rose-300 text-rose-700 hover:text-rose-800 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-4xs cursor-pointer disabled:opacity-50"
              title="Reset all financial logs across the entire herd"
            >
              <Trash2 size={12} className={isResetting ? "animate-spin" : ""} />
              {isResetting ? "Resetting..." : "Reset Finances"}
            </motion.button>
          )}
        </div>

        {/* Time Filters */}
        <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200">
          {[
            { id: "6m", label: "6 Months" },
            { id: "12m", label: "12 Months" },
            { id: "ytd", label: "YTD" },
            { id: "all", label: "All Time" }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTimeRange(item.id as any)}
              className={`px-3 py-1 text-xxs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                timeRange === item.id
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-850"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="finance-stats-grid">
        
        {/* Metric 1: Total Cost */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">Total Expenditures</span>
            <span className="text-2xl font-black text-stone-900 tracking-tight">
              ${metrics.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[9px] font-bold text-teal-600 uppercase tracking-wider block">
              Active ledger filters applied
            </span>
          </div>
          <div className="p-3.5 bg-teal-50 border border-teal-100 rounded-xl text-teal-700">
            <DollarSign size={22} />
          </div>
        </div>

        {/* Metric 2: Average Cost */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">Avg Care Cost</span>
            <span className="text-2xl font-black text-stone-900 tracking-tight">
              ${metrics.avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider block">
              Per maintenance log
            </span>
          </div>
          <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-600">
            <Receipt size={22} />
          </div>
        </div>

        {/* Metric 3: Log Events Count */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">Total Log entries</span>
            <span className="text-2xl font-black text-stone-900 tracking-tight">
              {metrics.count}
            </span>
            <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider block">
              Logged maintenance events
            </span>
          </div>
          <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-700">
            <Calendar size={22} />
          </div>
        </div>

        {/* Metric 4: Peak Single cost */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">Peak Single Charge</span>
            <span className="text-2xl font-black text-stone-900 tracking-tight">
              ${(metrics.maxItem?.cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[9px] font-bold text-rose-700 uppercase tracking-wider block truncate max-w-[150px]">
              {metrics.maxItem ? `${metrics.maxItem.horseName} (${CATEGORY_LABELS[metrics.maxItem.type] || metrics.maxItem.type})` : "No entries yet"}
            </span>
          </div>
          <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-700">
            <TrendingUp size={22} />
          </div>
        </div>
      </div>

      {/* Main Charts & Breakdown row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Trend Chart (Line/Area) - Takes 2 cols on wide */}
        <div className="bg-white rounded-3xl border border-stone-200 p-6 lg:col-span-2 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">Monthly Expenditure Trends</h3>
                <p className="text-[10px] text-stone-450 uppercase font-semibold">Care cost aggregate progression over time</p>
              </div>
              <div className="flex items-center gap-1.5 text-xxs bg-stone-50 border border-stone-200/60 px-2.5 py-1 rounded-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-600 block"></span>
                <span className="font-bold text-stone-600">Total Spend</span>
              </div>
            </div>

            <div className="w-full h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                  <XAxis 
                    dataKey="name" 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fontWeight: "bold", fill: "#78716c" }}
                  />
                  <YAxis 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fontWeight: "bold", fill: "#78716c" }}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ background: "#1c1917", borderRadius: "12px", border: "none", color: "#fff", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                    labelStyle={{ fontSize: 10, fontWeight: "black", textTransform: "uppercase", color: "#a8a29e", letterSpacing: "0.05em" }}
                    itemStyle={{ fontSize: 11, fontWeight: "bold", color: "#fff" }}
                    formatter={(value: any) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "Spend"]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="Cost" 
                    stroke="#0d9488" 
                    strokeWidth={2.5} 
                    fillOpacity={1} 
                    fill="url(#colorSpend)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="border-t border-stone-100 pt-4 mt-4 flex items-center justify-between text-stone-500 text-[10px] font-bold uppercase tracking-wider">
            <span>Operational Date Limit: {todayStr}</span>
            <span>Real-time Sync Enabled</span>
          </div>
        </div>

        {/* Category breakdown (Pie Chart / Color pill lists) */}
        <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">Spend by Category</h3>
            <p className="text-[10px] text-stone-450 uppercase font-semibold mb-4">Distribution of total funds</p>

            {categoryBreakdown.length > 0 ? (
              <div className="space-y-4">
                
                {/* Visual Pie/Donut Chart */}
                <div className="w-full h-[120px] relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={50}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {categoryBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ background: "#1c1917", borderRadius: "8px", border: "none", color: "#fff" }}
                        itemStyle={{ fontSize: 10, fontWeight: "bold" }}
                        formatter={(value: any) => [`$${value.toLocaleString()}`, "Spend"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest leading-none">Dist</span>
                    <span className="text-xs font-black text-stone-800 uppercase mt-0.5 leading-none">{categoryBreakdown.length} Cats</span>
                  </div>
                </div>

                {/* Legend list with custom percentages */}
                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {categoryBreakdown.map((cat) => {
                    const pct = metrics.total > 0 ? (cat.value / metrics.total) * 100 : 0;
                    return (
                      <div key={cat.name} className="flex justify-between items-center text-xs font-semibold">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }}></span>
                          <span className="text-stone-700 truncate max-w-[120px]">{cat.name}</span>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <span className="text-stone-900 font-extrabold">${cat.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          <span className="text-stone-400 text-[10px] font-black w-8 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-stone-400 text-xxs font-bold uppercase tracking-widest">
                No categorical cost logs in selected range
              </div>
            )}
          </div>

          <div className="border-t border-stone-100 pt-3 mt-3 text-center">
            <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">
              Average Expense Event: ${(metrics.avg).toFixed(2)}
            </span>
          </div>
        </div>

      </div>

      {/* Grid: Spend by Horse (Ranked List) & Ledger Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Ranked Horses List */}
        <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm lg:col-span-1 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">Top Expenditures by Horse</h3>
            <p className="text-[10px] text-stone-450 uppercase font-semibold mb-4">Highest maintenance spend list</p>

            {horseRanking.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {horseRanking.slice(0, 6).map((rank, idx) => {
                  const pctOfTotal = metrics.total > 0 ? (rank.totalSpend / metrics.total) * 100 : 0;
                  return (
                    <div key={rank.horseId} className="flex items-center justify-between p-2.5 bg-stone-50 border border-stone-100 rounded-xl hover:bg-stone-100/50 transition-all">
                      <div className="flex items-center space-x-3 truncate">
                        <div className="w-7 h-7 rounded-lg bg-teal-600/10 text-teal-800 border border-teal-600/25 flex items-center justify-center font-black text-xs uppercase shrink-0">
                          {rank.name.substring(0, 2)}
                        </div>
                        <div className="truncate">
                          <span className="text-xs font-extrabold text-stone-850 block leading-tight truncate">{rank.name}</span>
                          <span className="text-[9px] text-stone-450 font-semibold uppercase truncate block">{rank.breed}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-stone-900 block leading-tight">
                          ${rank.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-[9px] text-stone-400 font-extrabold block leading-tight">
                          {rank.count} logs ({pctOfTotal.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-stone-400 text-xxs font-bold uppercase tracking-widest">
                No horse cost ranking logged in range
              </div>
            )}
          </div>

          <div className="border-t border-stone-100 pt-3 mt-3">
            <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-widest text-center block">
              Showing top {Math.min(6, horseRanking.length)} of {horseRanking.length} total active horses
            </span>
          </div>
        </div>

        {/* Ledger Control Table / List Filters & Search */}
        <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm lg:col-span-2 flex flex-col justify-between">
          
          <div className="space-y-4">
            
            {/* Controls Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">Audit Expense Logs</h3>
                <p className="text-[10px] text-stone-450 uppercase font-semibold">Granular search and spreadsheet export</p>
              </div>
              
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  onClick={handleExportCSV}
                  disabled={sortedLogs.length === 0}
                  className="bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed font-black text-xxs uppercase tracking-wider px-3.5 py-1.8 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs border border-stone-850"
                >
                  <Download size={12} /> Export CSV
                </button>
                <button
                  onClick={() => window.print()}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-black text-xxs uppercase tracking-wider px-3.5 py-1.8 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Printer size={12} /> Print Ledger
                </button>
              </div>
            </div>

            {/* Filters grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              
              {/* Category selector */}
              <div>
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1.5 block">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-stone-700 focus:outline-none focus:border-teal-500 cursor-pointer"
                >
                  <option value="all">All Categories</option>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Horse Selector */}
              <div>
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1.5 block">Horse</label>
                <select
                  value={selectedHorseId}
                  onChange={(e) => setSelectedHorseId(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-stone-700 focus:outline-none focus:border-teal-500 cursor-pointer"
                >
                  <option value="all">All Horses</option>
                  {horses.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>

              {/* Text Search */}
              <div>
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1.5 block">Quick Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" size={12} />
                  <input
                    type="text"
                    placeholder="Search note/vet..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-2.5 py-1.5 text-xs font-bold text-stone-700 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

            </div>

            {/* List Output */}
            <div className="border border-stone-150 rounded-2xl overflow-hidden bg-stone-50/50">
              <div className="grid grid-cols-12 gap-2 bg-stone-100 px-4 py-2 border-b border-stone-150 text-[9px] font-black uppercase text-stone-450 tracking-wider">
                <span className="col-span-3">Date &amp; Horse</span>
                <span className="col-span-3">Category</span>
                <span className="col-span-4">Notes &amp; Tech</span>
                <span className="col-span-2 text-right">Cost</span>
              </div>

              <div className="max-h-[220px] overflow-y-auto divide-y divide-stone-150 bg-white">
                {sortedLogs.length > 0 ? (
                  sortedLogs.map((log) => (
                    <div 
                      key={log.id} 
                      onClick={() => {
                        if (log.horseId && onNavigateToHorse) {
                          onNavigateToHorse(log.horseId);
                        }
                      }}
                      className={`grid grid-cols-12 gap-2 px-4 py-2.5 items-center hover:bg-stone-50 text-xs transition-all ${
                        log.horseId && onNavigateToHorse ? "cursor-pointer active:bg-stone-100" : ""
                      }`}
                      title={log.horseId && onNavigateToHorse ? `View details for ${log.horseName}` : undefined}
                    >
                      
                      {/* Horse & Date */}
                      <div className="col-span-3 truncate">
                        <span className="font-extrabold text-stone-850 block truncate leading-tight">{log.horseName}</span>
                        <span className="text-[9px] font-bold text-stone-400 block leading-tight">{log.date}</span>
                      </div>

                      {/* Category Pill */}
                      <div className="col-span-3">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border bg-white shadow-3xs`} style={{ color: CATEGORY_COLORS[log.type] || "#78716c", borderColor: `${CATEGORY_COLORS[log.type]}30` }}>
                          {getLogIcon(log.type)}
                          <span className="max-w-[70px] truncate">{CATEGORY_LABELS[log.type] || log.type}</span>
                        </span>
                      </div>

                      {/* Notes & Performer */}
                      <div className="col-span-4 truncate">
                        <p className="text-stone-600 truncate leading-tight" title={log.notes}>{log.notes || "No extra log notes."}</p>
                        <span className="text-[9px] text-stone-400 font-bold block leading-tight truncate">Tech: {log.performedBy || "N/A"}</span>
                      </div>

                      {/* Cost */}
                      <div className="col-span-2 text-right">
                        <span className="font-black text-stone-900 bg-stone-100 border border-stone-200 px-1.8 py-0.5 rounded-md text-[10px] inline-block font-mono">
                          ${log.cost.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </span>
                      </div>

                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-stone-400 text-xxs font-bold uppercase tracking-widest">
                    No matching care logs found with applied filters
                  </div>
                )}
              </div>
            </div>

          </div>

          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-stone-450 pt-3 mt-3 border-t border-stone-100">
            <span>Filtered Event Entries: {sortedLogs.length}</span>
            <span>Total Sum Selected: ${metrics.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>

        </div>

      </div>

    </div>
  );
}
