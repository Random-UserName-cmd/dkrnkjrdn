import { useState, useMemo } from "react";
import { Horse, MaintenanceLog } from "../types";
import { getShoeingStatus, getVetStatus } from "../utils/scheduler";
import { 
  Map as MapIcon, 
  Users, 
  CheckCircle, 
  AlertTriangle, 
  HelpCircle, 
  Activity, 
  Eye, 
  X, 
  Calendar,
  Layers,
  HeartPulse,
  Wrench
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface PaddockHealthSummaryProps {
  horses: Horse[];
  logs: MaintenanceLog[];
  todayStr: string;
}

interface PaddockStatus {
  name: string;
  horses: Horse[];
  overdueCount: number;
  warningCount: number;
  okCount: number;
  status: "critical" | "warning" | "optimal" | "empty";
  recentLogs: MaintenanceLog[];
}

export default function PaddockHealthSummary({ horses, logs, todayStr }: PaddockHealthSummaryProps) {
  const [selectedPaddock, setSelectedPaddock] = useState<PaddockStatus | null>(null);

  // Define paddocks and calculate their health statuses dynamically
  const paddocksData = useMemo(() => {
    // Extract unique paddock names from horses (stableNumber is used for paddocks/locations)
    const uniquePaddockNames = Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))) as string[];
    
    // Fallback predefined paddocks if empty, to ensure map always displays layout
    const activePaddockNames = uniquePaddockNames.length > 0 
      ? uniquePaddockNames 
      : ["North Pasture", "East Paddock", "Main Stables", "West Field", "South Grazing"];

    return activePaddockNames.map(paddockName => {
      const paddockHorses = horses.filter(h => h.stableNumber?.toLowerCase() === paddockName.toLowerCase());
      
      let overdueCount = 0;
      let warningCount = 0;
      let okCount = 0;

      paddockHorses.forEach(h => {
        const shoeing = getShoeingStatus(h, todayStr);
        const vet = getVetStatus(h, todayStr);

        const isOverdue = shoeing?.status === "overdue" || vet?.status === "overdue";
        const isWarning = shoeing?.status === "warning" || vet?.status === "warning";

        if (isOverdue) {
          overdueCount++;
        } else if (isWarning) {
          warningCount++;
        } else {
          okCount++;
        }
      });

      // Recent logs for horses in this paddock
      const horseIds = paddockHorses.map(h => h.id);
      const paddockLogs = logs
        .filter(log => horseIds.includes(log.horseId))
        .slice(0, 5); // Take top 5 recent maintenance logs

      let status: "critical" | "warning" | "optimal" | "empty" = "optimal";
      if (paddockHorses.length === 0) {
        status = "empty";
      } else if (overdueCount > 0) {
        status = "critical";
      } else if (warningCount > 0) {
        status = "warning";
      }

      return {
        name: paddockName,
        horses: paddockHorses,
        overdueCount,
        warningCount,
        okCount,
        status,
        recentLogs: paddockLogs
      } as PaddockStatus;
    });
  }, [horses, logs, todayStr]);

  // Overall statistics
  const stats = useMemo(() => {
    let optimal = 0;
    let warning = 0;
    let critical = 0;
    let empty = 0;

    paddocksData.forEach(p => {
      if (p.status === "optimal") optimal++;
      else if (p.status === "warning") warning++;
      else if (p.status === "critical") critical++;
      else empty++;
    });

    return { optimal, warning, critical, empty };
  }, [paddocksData]);

  // Status mapping for visual cards
  const getStatusConfig = (status: "critical" | "warning" | "optimal" | "empty") => {
    switch (status) {
      case "critical":
        return {
          bg: "bg-red-50/90 border-red-200 text-red-900 shadow-red-100/40",
          badge: "bg-red-500 text-white",
          glow: "ring-red-400 shadow-red-400/50",
          icon: <AlertTriangle className="text-red-600" size={16} />,
          label: "Critical Attention",
          dot: "bg-red-500"
        };
      case "warning":
        return {
          bg: "bg-amber-50/90 border-amber-200 text-amber-900 shadow-amber-100/40",
          badge: "bg-amber-500 text-stone-900",
          glow: "ring-amber-400 shadow-amber-400/50",
          icon: <AlertTriangle className="text-amber-600" size={16} />,
          label: "Upcoming Maintenance",
          dot: "bg-amber-500"
        };
      case "optimal":
        return {
          bg: "bg-emerald-50/90 border-emerald-200 text-emerald-950 shadow-emerald-100/40",
          badge: "bg-emerald-600 text-white",
          glow: "ring-emerald-400 shadow-emerald-400/50",
          icon: <CheckCircle className="text-emerald-600" size={16} />,
          label: "Optimal Health",
          dot: "bg-emerald-500"
        };
      default:
        return {
          bg: "bg-stone-50 border-stone-200 text-stone-600 shadow-transparent",
          badge: "bg-stone-400 text-white",
          glow: "ring-stone-300 shadow-stone-300/30",
          icon: <HelpCircle className="text-stone-400" size={16} />,
          label: "Empty Pasture",
          dot: "bg-stone-400"
        };
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-6 text-left" id="paddock-health-summary-section">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-[10px] bg-teal-500/10 text-teal-800 border border-teal-500/20 px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest">
            Farm Logistics
          </span>
          <h2 className="text-lg font-black text-stone-900 uppercase tracking-tight flex items-center gap-2 mt-1.5">
            <MapIcon className="text-teal-600" size={20} />
            Paddock Health Summary &amp; Spatial Map
          </h2>
          <p className="text-xxs text-stone-500 font-medium font-mono uppercase tracking-wider mt-0.5">
            Color-coded agricultural status mapping calculated from recent veterinary &amp; farrier records.
          </p>
        </div>

        {/* Mini stats counters */}
        <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-wider">
          <div className="flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1.5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Optimal: {stats.optimal}
          </div>
          <div className="flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1.5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Warning: {stats.warning}
          </div>
          <div className="flex items-center gap-1 bg-red-50 text-red-800 border border-red-200 px-2.5 py-1.5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Overdue: {stats.critical}
          </div>
          <div className="flex items-center gap-1 bg-stone-105 text-stone-600 border border-stone-200 px-2.5 py-1.5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-stone-400" />
            Empty: {stats.empty}
          </div>
        </div>
      </div>

      {/* Schematic Spatial Map of Paddocks */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-black text-stone-450 uppercase tracking-widest block font-mono">
          Interactive Farm Layout Schematic
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {paddocksData.map((paddock, index) => {
            const config = getStatusConfig(paddock.status);
            return (
              <motion.div
                key={paddock.name}
                id={`paddock-${paddock.name.toLowerCase().replace(/\s+/g, "-")}`}
                whileHover={{ scale: 1.025, y: -2 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                onClick={() => setSelectedPaddock(paddock)}
                className={`border rounded-2xl p-4 cursor-pointer flex flex-col justify-between h-44 relative overflow-hidden transition-all shadow-4xs ${config.bg}`}
              >
                {/* Visual Accent Grass Pattern in Background */}
                <div className="absolute right-0 bottom-0 text-stone-900/5 pointer-events-none transform translate-x-4 translate-y-4">
                  <MapIcon size={120} />
                </div>

                {/* Status Dot Ring Indicator */}
                <div className="flex justify-between items-start relative z-10">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ring-4 ${config.glow} ${config.dot}`} />
                    <span className="text-[10px] font-black uppercase tracking-wider">{paddock.name}</span>
                  </div>
                  
                  {paddock.horses.length > 0 && (
                    <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-black/5 px-2 py-0.5 rounded-full">
                      <Users size={10} />
                      {paddock.horses.length}h
                    </div>
                  )}
                </div>

                {/* Occupying horses preview */}
                <div className="my-3 space-y-1 relative z-10">
                  {paddock.horses.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-h-[50px] overflow-hidden">
                      {paddock.horses.map(h => (
                        <span 
                          key={h.id} 
                          className="text-[9px] font-bold bg-white/75 border border-black/10 px-1.8 py-0.5 rounded-md text-stone-900 inline-block truncate max-w-[90px]"
                        >
                          {h.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[9px] italic text-stone-400 block">No herd residents assigned</span>
                  )}
                </div>

                {/* Footer and status line */}
                <div className="border-t border-black/5 pt-2 flex justify-between items-center text-[9px] font-black uppercase tracking-wider relative z-10">
                  <span className="opacity-75">{config.label}</span>
                  <button className="text-[9px] text-teal-800 hover:text-teal-950 flex items-center gap-0.5 font-bold">
                    <Eye size={10} /> View details
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Paddock Inspection modal dialog */}
      <AnimatePresence>
        {selectedPaddock && (
          <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-[99999] overflow-y-auto" id="paddock-details-modal">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col my-auto overflow-hidden"
              id="paddock-details-modal-box"
            >
              {/* Header */}
              <div className="p-5 bg-stone-900 text-stone-100 flex justify-between items-center relative overflow-hidden">
                <div className="space-y-0.5 text-left">
                  <span className="text-[9px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded font-black uppercase tracking-widest">
                    Paddock Inspection
                  </span>
                  <h3 className="text-base font-black uppercase tracking-tight">{selectedPaddock.name} Logistics</h3>
                </div>
                <button
                  onClick={() => setSelectedPaddock(null)}
                  className="w-8 h-8 rounded-full bg-stone-800 border border-stone-700 hover:bg-stone-700 text-stone-300 flex items-center justify-center cursor-pointer transition-all shrink-0"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Scrollable contents */}
              <div className="p-6 overflow-y-auto space-y-6 text-left flex-1">
                {/* 1. Horses list */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1 font-mono">
                    <Users size={12} className="text-teal-600" /> Resident Herd ({selectedPaddock.horses.length})
                  </h4>

                  {selectedPaddock.horses.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedPaddock.horses.map(h => {
                        const shoeing = getShoeingStatus(h, todayStr);
                        const vet = getVetStatus(h, todayStr);
                        
                        return (
                          <div key={h.id} className="border border-stone-150 p-3 rounded-2xl bg-stone-50 flex items-start gap-2.5">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <span className="font-extrabold text-xs text-stone-900 truncate block uppercase tracking-tight">{h.name}</span>
                              <div className="grid grid-cols-2 gap-1 text-[9px] font-bold uppercase text-stone-500 font-mono">
                                <div>Breed: <span className="text-stone-800 font-semibold">{h.breed}</span></div>
                                <div>Age: <span className="text-stone-800 font-semibold">{h.age}yo</span></div>
                              </div>
                              <div className="flex gap-1.5 flex-wrap pt-1">
                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                                  shoeing?.status === "overdue" 
                                    ? "bg-red-50 border-red-200 text-red-800" 
                                    : shoeing?.status === "warning"
                                      ? "bg-amber-50 border-amber-200 text-amber-800"
                                      : "bg-emerald-50 border-emerald-100 text-emerald-800"
                                }`}>
                                  Farrier: {shoeing?.status || "Up to Date"}
                                </span>
                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                                  vet?.status === "overdue" 
                                    ? "bg-red-50 border-red-200 text-red-800" 
                                    : vet?.status === "warning"
                                      ? "bg-amber-50 border-amber-200 text-amber-800"
                                      : "bg-emerald-50 border-emerald-100 text-emerald-800"
                                }`}>
                                  Vet: {vet?.status || "Up to Date"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-stone-400 italic text-xxs py-2">No horses currently assigned to this paddock.</div>
                  )}
                </div>

                {/* 2. Recent Maintenance logs */}
                <div className="space-y-3 pt-4 border-t border-stone-100">
                  <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1 font-mono">
                    <Activity size={12} className="text-teal-600" /> Recent Paddock Maintenance Logs ({selectedPaddock.recentLogs.length})
                  </h4>

                  {selectedPaddock.recentLogs.length > 0 ? (
                    <div className="space-y-2.5">
                      {selectedPaddock.recentLogs.map(log => (
                        <div key={log.id} className="border border-stone-200 bg-white p-3 rounded-2xl shadow-3xs flex flex-col gap-1.5">
                          <div className="flex justify-between items-center">
                            <span className="font-extrabold text-stone-900 text-[11px] uppercase tracking-wide">{log.horseName}</span>
                            <span className="text-[8px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded border border-stone-200 uppercase font-bold">{log.type}</span>
                          </div>
                          
                          <p className="text-xxs text-stone-600 font-semibold italic">"{log.notes || 'No description logged'}"</p>
                          
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-[8px] font-black uppercase tracking-wider text-stone-450 border-t border-stone-50 pt-1.5 mt-1 font-mono">
                            <div>Performed by: <span className="text-stone-700 font-bold">{log.performedBy}</span></div>
                            <div>Logged: <span className="text-stone-700 font-bold">{log.date}</span></div>
                            {log.cost > 0 && <div>Cost: <span className="text-emerald-700 font-black">${log.cost}</span></div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-stone-400 italic text-xxs py-2">No recent maintenance logs found for horses in this paddock.</div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-stone-50 border-t border-stone-150 flex justify-end">
                <button
                  onClick={() => setSelectedPaddock(null)}
                  className="px-5 py-2.5 bg-stone-900 hover:bg-stone-850 text-white font-black text-[10px] uppercase tracking-widest rounded-xl cursor-pointer"
                >
                  Close Inspection
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
