import { useMemo, useState } from "react";
import { Horse, MaintenanceLog, SystemUser } from "../types";
import { getShoeingStatus, getVetStatus, addWeeks, getDaysDiff } from "../utils/scheduler";
import { Shield, Hammer, Stethoscope, DollarSign, Calendar, ChevronDown, ChevronUp, AlertCircle, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface DashboardStatsProps {
  key?: string;
  horses: Horse[];
  logs: MaintenanceLog[];
  todayStr: string;
  currentUser: SystemUser | null;
  onStatClick?: (statType: "herd" | "shoeing" | "vet") => void;
  onClickExpenses?: () => void;
}

export default function DashboardStats({ horses, logs, todayStr, currentUser, onStatClick, onClickExpenses }: DashboardStatsProps) {
  const [isTasksExpanded, setIsTasksExpanded] = useState(true);

  // 1. Total Herd Size
  const totalHorses = horses.length;

  // 2. Shoeing alerts
  const shoeingAlertsCount = horses.filter((horse) => {
    const status = getShoeingStatus(horse, todayStr);
    return status && (status.status === "overdue" || status.status === "warning");
  }).length;

  // 3. Vet alerts
  const vetAlertsCount = horses.filter((horse) => {
    const status = getVetStatus(horse, todayStr);
    return status && (status.status === "overdue" || status.status === "warning");
  }).length;

  // 4. Monthly Expenses (Restricted visibility)
  const isAllowedCost = currentUser && (
    currentUser.role === "owner" || 
    currentUser.role === "admin" ||
    ["System Administrator", "Claire Wright", "Mark Wright"].some(name => currentUser.name.toLowerCase() === name.toLowerCase())
  );

  const currentMonth = todayStr.substring(0, 7); // "YYYY-MM"
  const monthlyExpenses = logs
    .filter((log) => log.date && log.date.startsWith(currentMonth))
    .reduce((sum, log) => sum + (Number(log.cost) || 0), 0);

  // 5. Compute upcoming tasks for all horses
  const upcomingTasks = useMemo(() => {
    const list: Array<{
      id: string;
      horseId: string;
      horseName: string;
      taskType: "Shoeing" | "Vet Visit" | "Deworming" | "Dental";
      dueDate: string;
      daysRemaining: number;
    }> = [];

    horses.forEach((horse) => {
      // A. Farrier Shoeing Due
      if (horse.lastShoeingDate) {
        const interval = horse.shoeingIntervalWeeks || 6;
        const dueDate = addWeeks(horse.lastShoeingDate, interval);
        const daysRemaining = getDaysDiff(dueDate, todayStr);
        list.push({
          id: `${horse.id}-shoeing`,
          horseId: horse.id,
          horseName: horse.name,
          taskType: "Shoeing",
          dueDate,
          daysRemaining
        });
      }

      // B. Vet Visit Due
      if (horse.nextVetDueDate) {
        const daysRemaining = getDaysDiff(horse.nextVetDueDate, todayStr);
        list.push({
          id: `${horse.id}-vet`,
          horseId: horse.id,
          horseName: horse.name,
          taskType: "Vet Visit",
          dueDate: horse.nextVetDueDate,
          daysRemaining
        });
      }

      // C. Deworming Due
      if (horse.lastDewormingDate) {
        const dueDate = addWeeks(horse.lastDewormingDate, 12); // every 12 weeks
        const daysRemaining = getDaysDiff(dueDate, todayStr);
        list.push({
          id: `${horse.id}-deworming`,
          horseId: horse.id,
          horseName: horse.name,
          taskType: "Deworming",
          dueDate,
          daysRemaining
        });
      }

      // D. Dental Visit Due
      if (horse.lastDentalDate) {
        const dueDate = addWeeks(horse.lastDentalDate, 52); // annual dental checks
        const daysRemaining = getDaysDiff(dueDate, todayStr);
        list.push({
          id: `${horse.id}-dental`,
          horseId: horse.id,
          horseName: horse.name,
          taskType: "Dental",
          dueDate,
          daysRemaining
        });
      }
    });

    // Sort by days remaining (critical first)
    return list.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [horses, todayStr]);

  // Categorize tasks
  const thisWeekTasks = useMemo(() => {
    return upcomingTasks.filter(t => t.daysRemaining <= 7);
  }, [upcomingTasks]);

  const nextMonthTasks = useMemo(() => {
    return upcomingTasks.filter(t => t.daysRemaining > 7 && t.daysRemaining <= 30);
  }, [upcomingTasks]);

  const totalUpcomingCount = thisWeekTasks.length + nextMonthTasks.length;

  return (
    <div className="space-y-6 mb-8" id="dashboard-stats-container">
      {/* Primary Stats Row */}
      <div className={`grid grid-cols-1 ${isAllowedCost ? "md:grid-cols-4" : "md:grid-cols-3"} gap-4`} id="dashboard-stats-grid">
        {/* Herd Size */}
        <motion.div 
          id="stat-herd-size"
          onClick={() => onStatClick?.("herd")}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)" }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm flex items-center transition-all hover:border-teal-600/30 cursor-pointer"
        >
          <div className="p-3 bg-stone-50 rounded-lg text-teal-700 mr-4">
            <Shield size={24} />
          </div>
          <div>
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Total Herd Size</p>
            <p className="text-2xl font-bold text-stone-900 mt-1">{totalHorses} {totalHorses === 1 ? 'Horse' : 'Horses'}</p>
          </div>
        </motion.div>

        {/* Shoeing Overdue */}
        <motion.div 
          id="stat-shoeing-alerts"
          onClick={() => onStatClick?.("shoeing")}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)" }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className={`bg-white rounded-xl border p-5 shadow-sm flex items-center transition-all cursor-pointer ${
            shoeingAlertsCount > 0 ? "border-amber-200 bg-amber-50/20 hover:border-amber-300" : "border-stone-200 hover:border-amber-200"
          }`}
        >
          <div className={`p-3 rounded-lg mr-4 ${shoeingAlertsCount > 0 ? "bg-amber-100 text-amber-800" : "bg-stone-50 text-stone-600"}`}>
            <Hammer size={24} />
          </div>
          <div>
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Farrier Attention</p>
            <p className={`text-2xl font-bold mt-1 ${shoeingAlertsCount > 0 ? "text-amber-800" : "text-stone-900"}`}>
              {shoeingAlertsCount} {shoeingAlertsCount === 1 ? 'Alert' : 'Alerts'}
            </p>
          </div>
        </motion.div>

        {/* Vet Care Alerts */}
        <motion.div 
          id="stat-vet-alerts"
          onClick={() => onStatClick?.("vet")}
          whileHover={{ scale: 1.02, y: -2, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)" }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className={`bg-white rounded-xl border p-5 shadow-sm flex items-center transition-all cursor-pointer ${
            vetAlertsCount > 0 ? "border-rose-200 bg-rose-50/20 hover:border-rose-300" : "border-stone-200 hover:border-rose-200"
          }`}
        >
          <div className={`p-3 rounded-lg mr-4 ${vetAlertsCount > 0 ? "bg-rose-100 text-rose-800" : "bg-stone-50 text-stone-600"}`}>
            <Stethoscope size={24} />
          </div>
          <div>
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Vet Care Needed</p>
            <p className={`text-2xl font-bold mt-1 ${vetAlertsCount > 0 ? "text-rose-800" : "text-stone-900"}`}>
              {vetAlertsCount} {vetAlertsCount === 1 ? 'Alert' : 'Alerts'}
            </p>
          </div>
        </motion.div>

        {/* Monthly Maintenance Expense (Conditional rendering) */}
        {isAllowedCost && (
          <motion.div 
            id="stat-expenses"
            whileHover={{ scale: 1.02, y: -2, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={onClickExpenses}
            className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm flex items-center transition-all hover:border-emerald-700/30 cursor-pointer"
          >
            <div className="p-3 bg-stone-50 rounded-lg text-emerald-800 mr-4">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-xs font-black text-stone-400 uppercase tracking-widest">This Month's Cost</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">
                ${monthlyExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
