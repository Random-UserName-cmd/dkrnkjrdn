import { useState, useMemo } from "react";
import { Horse, SystemUser } from "../types";
import { db, logAuditAction } from "../firebase";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  AlertCircle, 
  Users, 
  Search, 
  Info,
  Layers,
  HeartPulse,
  Hammer,
  Stethoscope,
  Droplet,
  Plus,
  Check,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ChecksCalendarProps {
  horses: Horse[];
  currentUser: SystemUser | null;
  todayStr: string;
}

export default function ChecksCalendar({ horses, currentUser, todayStr }: ChecksCalendarProps) {
  // Parse reference date
  const today = useMemo(() => new Date(todayStr || "2026-07-06"), [todayStr]);
  
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedHorseId, setSelectedHorseId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Batch scheduling states
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [selectedHorses, setSelectedHorses] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [batchDate, setBatchDate] = useState(todayStr);
  const [batchPerformedBy, setBatchPerformedBy] = useState("");
  const [batchNotes, setBatchNotes] = useState("");
  const [batchCost, setBatchCost] = useState("");
  const [batchNextDueDate, setBatchNextDueDate] = useState("");
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [batchHorseSearch, setBatchHorseSearch] = useState("");

  const batchAvailableTasks = [
    { type: "shoeing", label: "Farrier (Shoeing)", icon: <Hammer size={14} className="text-amber-600" /> },
    { type: "vet", label: "Veterinary Care", icon: <Stethoscope size={14} className="text-red-600" /> },
    { type: "deworming", label: "Deworming", icon: <Droplet size={14} className="text-blue-600" /> },
    { type: "dental", label: "Dental Care", icon: <HeartPulse size={14} className="text-teal-600" /> },
  ];

  // Filter horses for the batch selection list
  const filteredHorsesForBatch = useMemo(() => {
    if (!batchHorseSearch.trim()) return horses;
    return horses.filter(h => h.name.toLowerCase().includes(batchHorseSearch.toLowerCase()));
  }, [horses, batchHorseSearch]);

  const handleBatchSchedule = async () => {
    if (selectedHorses.length === 0) {
      alert("Please select at least one horse.");
      return;
    }
    if (selectedTasks.length === 0) {
      alert("Please select at least one task type.");
      return;
    }
    setIsSavingBatch(true);
    try {
      const { collection, addDoc, doc, updateDoc } = await import("firebase/firestore");

      for (const horseId of selectedHorses) {
        const horse = horses.find(h => h.id === horseId);
        if (!horse) continue;

        const horseUpdates: Partial<Horse> = {
          updatedAt: todayStr
        };

        for (const taskType of selectedTasks) {
          const logPayload = {
            horseId: horse.id,
            horseName: horse.name,
            type: taskType,
            date: batchDate || todayStr,
            performedBy: batchPerformedBy.trim() || currentUser?.name || "System",
            cost: Number(batchCost) || 0,
            notes: batchNotes.trim() || `Batch Scheduled Care: ${taskType}`,
            createdAt: todayStr,
            loggedBy: currentUser?.name || "System"
          };

          if (batchNextDueDate) {
            (logPayload as any).nextDueDate = batchNextDueDate;
          }

          // Add to subcollection: horses/{horseId}/logs
          await addDoc(collection(db, `horses/${horse.id}/logs`), logPayload);

          // Update horse parent fields based on type
          if (taskType === "shoeing") {
            horseUpdates.lastShoeingDate = batchDate || todayStr;
          } else if (taskType === "vet") {
            horseUpdates.lastVetDate = batchDate || todayStr;
            if (batchNotes) horseUpdates.lastVetNotes = batchNotes;
            if (batchNextDueDate) horseUpdates.nextVetDueDate = batchNextDueDate;
          } else if (taskType === "deworming") {
            horseUpdates.lastDewormingDate = batchDate || todayStr;
          } else if (taskType === "dental") {
            horseUpdates.lastDentalDate = batchDate || todayStr;
          }
        }

        // Save updates on parent horse
        await updateDoc(doc(db, "horses", horse.id), horseUpdates);
      }

      // Log audit
      if (currentUser) {
        await logAuditAction(
          currentUser.name,
          currentUser.role,
          "modify",
          `Batch scheduled ${selectedTasks.join(", ")} for ${selectedHorses.length} horses`
        );
      }

      setSelectedHorses([]);
      setSelectedTasks([]);
      setBatchNotes("");
      setBatchCost("");
      setBatchNextDueDate("");
      setBatchPerformedBy("");
      setSuccessMsg("✓ Batch maintenance successfully logged!");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Batch save error:", err);
      alert("Failed to save batch care tasks.");
    } finally {
      setIsSavingBatch(false);
    }
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Filter horses list for the selector
  const filteredHorsesForDropdown = useMemo(() => {
    if (!searchQuery.trim()) return horses;
    return horses.filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [horses, searchQuery]);

  // Navigate months
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Generate calendar days for grid
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const totalDaysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const days: Array<{
      dayNumber: number;
      isCurrentMonth: boolean;
      dateStr: string;
      key: string;
    }> = [];

    // Prev month overflow days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = totalDaysInPrevMonth - i;
      const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      days.push({
        dayNumber: dayNum,
        isCurrentMonth: false,
        dateStr,
        key: `prev-${dayNum}`
      });
    }

    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      days.push({
        dayNumber: i,
        isCurrentMonth: true,
        dateStr,
        key: `curr-${i}`
      });
    }

    // Next month overflow days to complete grid rows
    const remainingSlots = 42 - days.length; // 6 rows of 7 days
    for (let i = 1; i <= remainingSlots; i++) {
      const nextMonthIdx = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      days.push({
        dayNumber: i,
        isCurrentMonth: false,
        dateStr,
        key: `next-${i}`
      });
    }

    return days;
  }, [currentYear, currentMonth]);

  // Aggregate checks across horses based on filters
  const checksByDate = useMemo(() => {
    const map: Record<string, Array<{
      horseName: string;
      horseId: string;
      checkedBy: string;
      status: "OK" | "Attention Needed";
      notes?: string;
    }>> = {};

    horses.forEach((h) => {
      if (selectedHorseId !== "all" && h.id !== selectedHorseId) return;
      
      const history = (h as any).dailyChecksHistory || [];
      history.forEach((check: any) => {
        if (!check.date) return;
        
        if (!map[check.date]) {
          map[check.date] = [];
        }
        
        map[check.date].push({
          horseId: h.id,
          horseName: h.name,
          checkedBy: check.checkedBy || "Anonymous Crew",
          status: check.status || "OK",
          notes: check.notes
        });
      });
    });

    return map;
  }, [horses, selectedHorseId]);

  // Calculations for stats summary panel
  const monthlyStats = useMemo(() => {
    let totalCompleted = 0;
    let totalAlerts = 0;
    const activeCheckingDays = new Set<string>();

    const startOfMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const endOfMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-31`; // Approx

    Object.keys(checksByDate).forEach((date) => {
      const checksList = checksByDate[date];
      // Filter only if date falls in current active month
      const checkDate = new Date(date);
      if (checkDate.getFullYear() === currentYear && checkDate.getMonth() === currentMonth) {
        checksList.forEach(c => {
          totalCompleted += 1;
          if (c.status === "Attention Needed") {
            totalAlerts += 1;
          }
          activeCheckingDays.add(date);
        });
      }
    });

    // Compute expected checks if a single horse is selected vs aggregated
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysElapsed = currentYear === today.getFullYear() && currentMonth === today.getMonth()
      ? today.getDate()
      : daysInMonth;

    const horsesCount = selectedHorseId === "all" ? horses.length : 1;
    const targetChecksCount = daysElapsed * horsesCount;
    const completionRate = targetChecksCount > 0 ? (totalCompleted / targetChecksCount) * 100 : 0;

    return {
      totalCompleted,
      totalAlerts,
      checkedDaysCount: activeCheckingDays.size,
      completionRate,
      daysInMonth
    };
  }, [checksByDate, currentYear, currentMonth, selectedHorseId, horses, today]);

  return (
    <div className="space-y-6 text-left" id="checks-calendar-page">
      {/* Title block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
            <CalendarIcon className="text-teal-600" size={24} />
            Paddock Check Registry
          </h1>
          <p className="text-xs text-stone-500 font-medium mt-0.5 uppercase tracking-wider font-mono">
            Historical Trends &amp; Monthly Safety Compliance Logs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {currentUser?.role !== "visitor" && (
            <button
              id="btn-toggle-batch-scheduler"
              onClick={() => setIsBatchOpen(!isBatchOpen)}
              className="px-4 py-2.5 bg-stone-900 hover:bg-stone-850 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer border border-stone-800"
            >
              {isBatchOpen ? "Close Scheduler" : "Batch Schedule Care"}
            </button>
          )}

          {/* Legend Indicators */}
          <div className="flex items-center gap-3 bg-stone-50 border border-stone-200/60 px-4 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-wider text-stone-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-600/20 shadow-4xs" />
              Passed (OK)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-600/20 shadow-4xs" />
              Attention
            </span>
          </div>
        </div>
      </div>

      {/* Expanded Batch Scheduler Form */}
      <AnimatePresence>
        {isBatchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-stone-50 border border-stone-200 rounded-3xl p-5 shadow-inner"
            id="batch-scheduler-panel"
          >
            <div className="space-y-5 text-left">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xs font-black text-stone-900 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                    Multi-Herd Batch Care Dispatcher
                  </h2>
                  <p className="text-[10px] text-stone-500 font-semibold uppercase tracking-wider font-mono mt-0.5">
                    Simultaneously schedule several maintenance actions (e.g., vet &amp; farrier checkups) to a custom list of horses.
                  </p>
                </div>
                <button 
                  onClick={() => setIsBatchOpen(false)}
                  className="text-stone-400 hover:text-stone-600 font-black text-xs uppercase cursor-pointer"
                >
                  Close ×
                </button>
              </div>

              {successMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-850 text-xxs font-extrabold uppercase tracking-wider p-3 rounded-xl">
                  {successMsg}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Step 1: Select Horses */}
                <div className="bg-white p-4 rounded-2xl border border-stone-150 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest font-mono">
                      1. Select Horses ({selectedHorses.length})
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedHorses(horses.map(h => h.id))}
                        className="text-[9px] font-black uppercase text-teal-700 hover:text-teal-900 cursor-pointer"
                      >
                        All
                      </button>
                      <span className="text-stone-300">|</span>
                      <button
                        onClick={() => setSelectedHorses([])}
                        className="text-[9px] font-black uppercase text-stone-450 hover:text-stone-600 cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Search filter for horse selection list */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 text-stone-400" size={13} />
                    <input
                      type="text"
                      placeholder="Filter horse names..."
                      value={batchHorseSearch}
                      onChange={(e) => setBatchHorseSearch(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-3 py-1.8 text-xxs focus:outline-hidden font-semibold text-stone-900 focus:ring-1 focus:ring-teal-500"
                    />
                  </div>

                  {/* Horse check grid */}
                  <div className="max-h-44 overflow-y-auto space-y-1.5 p-1 border border-stone-100 rounded-xl">
                    {filteredHorsesForBatch.length > 0 ? (
                      filteredHorsesForBatch.map(h => {
                        const isChecked = selectedHorses.includes(h.id);
                        return (
                          <label 
                            key={h.id} 
                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all select-none border text-xxs font-bold ${
                              isChecked 
                                ? "bg-teal-50/70 border-teal-200 text-teal-950" 
                                : "bg-stone-50/50 border-transparent text-stone-600 hover:bg-stone-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedHorses(prev => [...prev, h.id]);
                                } else {
                                  setSelectedHorses(prev => prev.filter(id => id !== h.id));
                                }
                              }}
                              className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5 cursor-pointer"
                            />
                            <span className="flex-1 truncate">{h.name}</span>
                            <span className="text-[9px] text-stone-400 font-medium font-mono">{h.stableNumber || "No Location"}</span>
                          </label>
                        );
                      })
                    ) : (
                      <div className="text-stone-400 text-center py-4 italic text-xxs">No horses match filter</div>
                    )}
                  </div>
                </div>

                {/* Step 2: Select Tasks */}
                <div className="bg-white p-4 rounded-2xl border border-stone-150 space-y-3">
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest font-mono block">
                    2. Select Maintenance Types ({selectedTasks.length})
                  </span>

                  <div className="grid grid-cols-1 gap-2">
                    {batchAvailableTasks.map(task => {
                      const isChecked = selectedTasks.includes(task.type);
                      return (
                        <label
                          key={task.type}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer border transition-all text-xxs font-extrabold uppercase tracking-wide select-none ${
                            isChecked
                              ? "bg-teal-50/70 border-teal-200 text-teal-950"
                              : "bg-stone-50/50 border-stone-150 text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTasks(prev => [...prev, task.type]);
                              } else {
                                setSelectedTasks(prev => prev.filter(t => t !== task.type));
                              }
                            }}
                            className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className="p-1 rounded bg-stone-100">{task.icon}</span>
                          <span>{task.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Step 3: Care Details */}
                <div className="bg-white p-4 rounded-2xl border border-stone-150 space-y-3">
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest font-mono block">
                    3. Service Details
                  </span>

                  <div className="space-y-2 text-xxs font-bold text-stone-600">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[8px] uppercase tracking-wider mb-1">Date Logged</label>
                        <input
                          type="date"
                          value={batchDate}
                          onChange={(e) => setBatchDate(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-2 text-xxs font-semibold text-stone-900 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] uppercase tracking-wider mb-1">Total Cost ($)</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={batchCost}
                          onChange={(e) => setBatchCost(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-2 text-xxs font-semibold text-stone-900 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[8px] uppercase tracking-wider mb-1">Performed By</label>
                        <input
                          type="text"
                          placeholder="e.g. Dr. Cooper"
                          value={batchPerformedBy}
                          onChange={(e) => setBatchPerformedBy(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-2 text-xxs font-semibold text-stone-900 focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] uppercase tracking-wider mb-1">Optional Next Due</label>
                        <input
                          type="date"
                          value={batchNextDueDate}
                          onChange={(e) => setBatchNextDueDate(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-2 text-xxs font-semibold text-stone-900 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[8px] uppercase tracking-wider mb-1">Service Notes</label>
                      <textarea
                        placeholder="Detail the work done..."
                        value={batchNotes}
                        onChange={(e) => setBatchNotes(e.target.value)}
                        rows={2}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-2.5 py-2 text-xxs font-semibold resize-none focus:outline-hidden text-stone-900"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Dispatch Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleBatchSchedule}
                  disabled={isSavingBatch}
                  className="px-6 py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-stone-300 text-white font-black text-xxs uppercase tracking-widest rounded-xl shadow-xs cursor-pointer transition-all flex items-center gap-2"
                >
                  {isSavingBatch ? (
                    <>
                      <Loader2 className="animate-spin" size={13} />
                      Scheduling Care...
                    </>
                  ) : (
                    <>
                      Schedule Batch Maintenance
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main calendar controls + layout split */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Sidebar Selector list */}
        <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-sm space-y-4 lg:col-span-1">
          <div>
            <h3 className="text-xs font-black uppercase text-stone-900 tracking-wider">
              Profile Filter
            </h3>
            <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
              Select horse to analyze
            </span>
          </div>

          {/* Quick search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={13} />
            <input
              type="text"
              placeholder="Search horse profile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-3 py-1.8 text-xs font-semibold text-stone-750 focus:outline-none focus:border-teal-500 placeholder-stone-400"
            />
          </div>

          {/* Horse Select Button list */}
          <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
            <button
              onClick={() => setSelectedHorseId("all")}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer flex items-center justify-between ${
                selectedHorseId === "all"
                  ? "bg-teal-50 border-teal-200 text-teal-800 shadow-5xs"
                  : "bg-stone-50/55 border-stone-150 text-stone-650 hover:bg-stone-50"
              }`}
            >
              <span className="flex items-center gap-2">
                <Layers size={13} /> Entire Farm Herd
              </span>
              <span className="bg-stone-200/60 text-stone-700 px-1.8 py-0.5 rounded text-[9px] font-black font-mono">
                {horses.length}
              </span>
            </button>

            {filteredHorsesForDropdown.map((h) => {
              const checkLogsCount = ((h as any).dailyChecksHistory || []).length;
              return (
                <button
                  key={h.id}
                  onClick={() => setSelectedHorseId(h.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-between ${
                    selectedHorseId === h.id
                      ? "bg-teal-50 border-teal-200 text-teal-800 shadow-5xs"
                      : "bg-white border-stone-150 text-stone-650 hover:bg-stone-50"
                  }`}
                >
                  <span className="truncate max-w-[120px]">{h.name}</span>
                  {checkLogsCount > 0 && (
                    <span className="bg-emerald-55 text-emerald-800 px-1.5 py-0.2 rounded text-[8px] font-black">
                      {checkLogsCount} logged
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Calendar Core Grid */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm lg:col-span-3 space-y-6">
          
          {/* Header month navigational row */}
          <div className="flex justify-between items-center pb-4 border-b border-stone-150">
            <div className="flex items-center gap-2">
              <CalendarIcon className="text-teal-600" size={18} />
              <h2 className="text-base font-black uppercase text-stone-900 tracking-tight">
                {monthNames[currentMonth]} {currentYear}
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePrevMonth}
                className="p-1.8 border border-stone-200 hover:bg-stone-50 rounded-xl transition-all cursor-pointer text-stone-600"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => {
                  setCurrentYear(today.getFullYear());
                  setCurrentMonth(today.getMonth());
                }}
                className="px-3.5 py-1.8 border border-stone-200 text-stone-700 hover:bg-stone-50 rounded-xl text-xxs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Today
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1.8 border border-stone-200 hover:bg-stone-50 rounded-xl transition-all cursor-pointer text-stone-600"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* Calendar Grid Sheet */}
          <div className="space-y-1">
            {/* Weekdays names */}
            <div className="grid grid-cols-7 gap-1 text-center font-mono text-[9px] font-black uppercase text-stone-400 tracking-widest pb-1 border-b border-stone-100">
              {daysOfWeek.map(day => (
                <div key={day} className="py-2">{day}</div>
              ))}
            </div>

            {/* Grid days */}
            <div className="grid grid-cols-7 gap-1.5 pt-1.5">
              {calendarDays.map((day) => {
                const dayChecks = checksByDate[day.dateStr] || [];
                const hasOK = dayChecks.some(c => c.status === "OK");
                const hasAlert = dayChecks.some(c => c.status === "Attention Needed");
                const totalChecksOnDay = dayChecks.length;
                
                // Color mapping for days
                let cellBg = day.isCurrentMonth ? "bg-white" : "bg-stone-50/50 text-stone-400";
                let dayColor = "text-stone-800 font-bold";
                if (!day.isCurrentMonth) {
                  dayColor = "text-stone-350 font-semibold";
                }

                // Check highlight border/colors
                let checkBadgeColor = "";
                if (totalChecksOnDay > 0) {
                  if (hasAlert) {
                    checkBadgeColor = "border-amber-200 bg-amber-50/30 text-amber-800";
                  } else {
                    checkBadgeColor = "border-emerald-100 bg-emerald-50/20 text-emerald-850";
                  }
                }

                const isToday = day.dateStr === todayStr;

                return (
                  <div
                    key={day.key}
                    className={`min-h-[85px] border border-stone-200 rounded-xl p-2 flex flex-col justify-between transition-all hover:shadow-3xs ${cellBg} ${checkBadgeColor} ${
                      isToday ? "ring-2 ring-teal-500/80 border-teal-200" : ""
                    }`}
                  >
                    {/* Day number with Today highlight */}
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] ${dayColor}`}>
                        {day.dayNumber}
                      </span>
                      {isToday && (
                        <span className="text-[7px] bg-teal-600 text-white font-black uppercase px-1 rounded-sm leading-normal tracking-wide">
                          Today
                        </span>
                      )}
                    </div>

                    {/* Daily checks information */}
                    {totalChecksOnDay > 0 ? (
                      <div className="space-y-1 mt-1 text-left">
                        {selectedHorseId === "all" ? (
                          <div className="space-y-0.5">
                            <span className="text-[8px] font-black text-stone-450 uppercase tracking-wider block">
                              {totalChecksOnDay} {totalChecksOnDay === 1 ? "Check" : "Checks"} Logged
                            </span>
                            <div className="flex gap-0.5 flex-wrap">
                              {dayChecks.slice(0, 3).map((c, i) => (
                                <span
                                  key={i}
                                  className={`w-1.5 h-1.5 rounded-full inline-block ${
                                    c.status === "Attention Needed" ? "bg-amber-500" : "bg-emerald-500"
                                  }`}
                                  title={`${c.horseName}: ${c.status}`}
                                />
                              ))}
                              {totalChecksOnDay > 3 && (
                                <span className="text-[7px] font-black text-stone-400 font-mono">+{totalChecksOnDay - 3}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          // Individual horse check details
                          dayChecks.map((c, idx) => (
                            <div key={idx} className="space-y-0.5">
                              <span className={`text-[8px] font-black uppercase tracking-wider flex items-center gap-0.5 leading-none ${
                                c.status === "Attention Needed" ? "text-amber-800" : "text-emerald-800"
                              }`}>
                                {c.status === "Attention Needed" ? (
                                  <AlertCircle size={7} />
                                ) : (
                                  <CheckCircle size={7} />
                                )}
                                {c.status}
                              </span>
                              <span className="text-[7px] text-stone-400 font-bold block leading-none max-w-[65px] truncate">
                                By {c.checkedBy}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <span className="text-[8px] text-stone-300 font-black uppercase tracking-widest block text-left">
                        No logs
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Statistics summary section at footer */}
          <div className="pt-5 border-t border-stone-200 grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Metric 1 */}
            <div className="border border-stone-150 p-4 rounded-2xl bg-stone-50/40">
              <span className="text-[9px] font-black text-stone-450 uppercase tracking-widest block leading-none">
                Month Compliance Rate
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-xl font-black text-stone-900 tracking-tight leading-none">
                  {monthlyStats.completionRate.toFixed(1)}%
                </span>
                <span className="text-[9px] text-stone-450 font-semibold uppercase">
                  checks quota
                </span>
              </div>
              <div className="w-full bg-stone-200 rounded-full h-1 mt-3">
                <div 
                  className="bg-teal-600 h-1 rounded-full" 
                  style={{ width: `${Math.min(monthlyStats.completionRate, 100)}%` }}
                />
              </div>
            </div>

            {/* Metric 2 */}
            <div className="border border-stone-150 p-4 rounded-2xl bg-stone-50/40">
              <span className="text-[9px] font-black text-stone-450 uppercase tracking-widest block leading-none">
                Daily checks Completed
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-xl font-black text-stone-900 tracking-tight leading-none">
                  {monthlyStats.totalCompleted}
                </span>
                <span className="text-[9px] text-stone-450 font-semibold uppercase">
                  individual logs
                </span>
              </div>
              <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider block mt-3">
                Recorded across {monthlyStats.checkedDaysCount} separate dates
              </span>
            </div>

            {/* Metric 3 */}
            <div className="border border-stone-150 p-4 rounded-2xl bg-stone-50/40">
              <span className="text-[9px] font-black text-stone-450 uppercase tracking-widest block leading-none">
                Attention Alerts Triggered
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className={`text-xl font-black tracking-tight leading-none ${
                  monthlyStats.totalAlerts > 0 ? "text-amber-600" : "text-stone-900"
                }`}>
                  {monthlyStats.totalAlerts}
                </span>
                <span className="text-[9px] text-stone-450 font-semibold uppercase">
                  escalation flags
                </span>
              </div>
              <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider block mt-3">
                Needs immediate stable team dispatch
              </span>
            </div>

          </div>

          {/* Quick Informational Notice */}
          <div className="bg-stone-50 border border-stone-200/50 p-4 rounded-2xl flex items-start gap-3">
            <Info className="text-stone-500 mt-0.5 shrink-0" size={16} />
            <div className="space-y-1">
              <h5 className="text-[10px] font-black uppercase text-stone-800 tracking-wide">
                Calendar Audits &amp; Compliance Data Sources
              </h5>
              <p className="text-xxs text-stone-500 font-semibold leading-relaxed">
                Check records are synchronized live from direct paddock observations and saved on specific horse profile logs. These files provide an aggregate legal audit trail of high-integrity daily herd care.
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
