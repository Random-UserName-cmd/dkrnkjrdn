import React, { useState, useEffect, useMemo } from "react";
import { db } from "../firebase";
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { SystemUser, RanchTask } from "../types";
import { 
  ClipboardList, Plus, CheckSquare, Square, User, Clock, 
  FileText, CheckCircle2, X, AlertCircle, Trash2, HelpCircle 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface RanchTaskListProps {
  key?: string;
  currentUser: SystemUser;
  todayStr: string;
}

export default function RanchTaskList({ currentUser, todayStr }: RanchTaskListProps) {
  if (currentUser?.name === "Peter Baker") {
    return null;
  }

  const [tasks, setTasks] = useState<RanchTask[]>([]);
  const [crewProfiles, setCrewProfiles] = useState<SystemUser[]>([]);

  // Subscribe to crew profiles
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "crew_profiles"), (snapshot) => {
      const list: SystemUser[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as SystemUser);
      });
      setCrewProfiles(list);
    });
    return () => unsub();
  }, []);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("Everyone");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High" | "Critical">("Medium");
  const [mentionedPeople, setMentionedPeople] = useState<string[]>([]);
  
  // State for completing a task
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Anyone can add tasks now!
  const canAddTasks = true;

  // Dispatchers & Farm Admins who can assign tasks to specific people.
  const DISPATCHERS = ["System Administrator", "Claire Wright", "Mark Wright"];
  const isOwnerOrAdmin = currentUser.role === "owner" || currentUser.role === "admin";
  const canAssignSpecific = isOwnerOrAdmin || DISPATCHERS.includes(currentUser.name);

  // Filter crew profiles by farm
  const visibleCrewProfiles = useMemo(() => {
    const curFarm = (currentUser?.farmName || "").toLowerCase().trim();
    const curFarmId = (currentUser?.farmId || curFarm.replace(/[^a-z0-9]+/g, "_")).toLowerCase().trim();
    const isRuabon = !curFarm || curFarm.includes("ruabon") || curFarm.includes("nova herd") || curFarm.includes("horse sense");

    return crewProfiles.filter(u => {
      const uFarm = (u.farmName || "").toLowerCase().trim();
      const uFarmId = (u.farmId || "").toLowerCase().trim();
      const userIsExplicitlyThisFarm = (uFarm && uFarm === curFarm) || (uFarmId && uFarmId === curFarmId);

      if (u.name.toLowerCase() === "system administrator" || u.name.toLowerCase() === "cooper wright") {
        return isRuabon;
      }

      if (isRuabon) {
        if (userIsExplicitlyThisFarm) return true;
        if (!uFarm && !uFarmId) return true;
        return uFarm.includes("ruabon") || uFarm.includes("nova herd") || uFarm.includes("horse sense");
      }

      return userIsExplicitlyThisFarm;
    });
  }, [crewProfiles, currentUser]);

  // Subscribe to Ranch Tasks from Firestore
  useEffect(() => {
    const q = query(collection(db, "ranch_tasks"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: RanchTask[] = [];
      const curFarm = (currentUser?.farmName || "").toLowerCase().trim();
      const curFarmId = (currentUser?.farmId || curFarm.replace(/[^a-z0-9]+/g, "_")).toLowerCase().trim();
      const isRuabon = !curFarm || curFarm.includes("ruabon") || curFarm.includes("nova herd");

      snapshot.forEach((docSnap) => {
        const t = { id: docSnap.id, ...docSnap.data() } as RanchTask;
        const tFarm = ((t as any).farmName || "").toLowerCase().trim();
        const tFarmId = ((t as any).farmId || "").toLowerCase().trim();

        if (isRuabon) {
          if (!tFarm && !tFarmId) {
            list.push(t);
          } else if (tFarm.includes("ruabon") || tFarm.includes("nova herd") || tFarmId === "ruabon_farm") {
            list.push(t);
          }
        } else {
          if (tFarm === curFarm || tFarmId === curFarmId) {
            list.push(t);
          }
        }
      });
      setTasks(list);

      // Auto scroll straight to critical tasks on load
      setTimeout(() => {
        const criticalEl = document.querySelector(".critical-task-card");
        if (criticalEl) {
          criticalEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 600);
    }, (err) => {
      console.error("Error reading ranch tasks:", err);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMsg("Please fill in both title and description.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const newTaskPayload: any = {
        title: title.trim(),
        description: description.trim(),
        createdBy: currentUser.name,
        createdAt: todayStr,
        assignedTo: canAssignSpecific ? assignedTo : "Everyone",
        status: "pending" as const,
        priority: priority,
        farmName: currentUser.farmName || "Ruabon Farm & Herd Center",
        farmId: currentUser.farmId || (currentUser.farmName ? currentUser.farmName.toLowerCase().replace(/[^a-z0-9]+/g, "_") : "ruabon_farm")
      };

      if (mentionedPeople.length > 0) {
        newTaskPayload.mentions = mentionedPeople;
      }

      await addDoc(collection(db, "ranch_tasks"), newTaskPayload);
      
      // Reset form
      setTitle("");
      setDescription("");
      setAssignedTo("Everyone");
      setPriority("Medium");
      setMentionedPeople([]);
      setIsFormOpen(false);
    } catch (err) {
      console.error("Error creating ranch task:", err);
      setErrorMsg("Failed to create task. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMention = (name: string) => {
    setMentionedPeople(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      const taskRef = doc(db, "ranch_tasks", taskId);
      await updateDoc(taskRef, {
        status: "completed",
        completedBy: currentUser.name,
        completedAt: todayStr,
        completionDescription: completionNotes.trim() || "Completed successfully.",
      });

      // Clear states
      setCompletingTaskId(null);
      setCompletionNotes("");
    } catch (err) {
      console.error("Error completing task:", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, "ranch_tasks", taskId));
    } catch (err) {
      console.error("Error deleting task:", err);
    }
  };

  const getTaskVisibility = (task: RanchTask) => {
    const adminNames = ["System Administrator", "Claire Wright", "Mark Wright"];
    const isAdmin = currentUser.role === "owner" || currentUser.role === "admin" || adminNames.includes(currentUser.name);
    const isAssignee = task.assignedTo === currentUser.name || task.assignedTo === "Everyone" || task.createdBy === currentUser.name;
    
    const mentions = (task as any).mentions || [];
    const isMentioned = mentions.includes(currentUser.name);

    if (isAdmin || isAssignee) {
      return { visible: true, canSeeDetails: true };
    }
    
    if (isMentioned) {
      return { visible: true, canSeeDetails: false };
    }

    return { visible: false, canSeeDetails: false };
  };

  // Grouping tasks
  const activeTasks = tasks.filter((t) => t.status === "pending" && getTaskVisibility(t).visible);
  const completedTasks = tasks.filter((t) => t.status === "completed" && getTaskVisibility(t).visible);

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-xs p-6" id="farm-tasks-section">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-100 pb-5 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl">
            <ClipboardList size={22} />
          </div>
          <div>
            <h2 className="text-base font-black uppercase tracking-wide text-stone-900">Farm Public Job Board</h2>
            <p className="text-xxs font-semibold text-stone-500 uppercase tracking-wider mt-0.5">
              Cooperative Task Management &amp; Completion Records
            </p>
          </div>
        </div>

        {canAddTasks ? (
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs w-full sm:w-auto justify-center"
          >
            {isFormOpen ? <X size={14} /> : <Plus size={14} />}
            {isFormOpen ? "Cancel" : "Add Public Job"}
          </button>
        ) : (
          <span className="text-[10px] bg-stone-50 text-stone-500 border border-stone-200 font-bold px-3 py-2 rounded-xl text-center flex items-center gap-1">
            Task dispatch restricted to dispatchers
          </span>
        )}
      </div>

      {/* Task Creation Form Dropdown */}
      {isFormOpen && canAddTasks && (
        <form onSubmit={handleCreateTask} className="mb-6 p-5 bg-stone-50 border border-stone-200 rounded-2xl animate-fade-in space-y-4">
          <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
            <Plus size={14} /> Dispatch a New Farm Job
          </h3>
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Job / Task Title *</label>
              <input
                type="text"
                placeholder="e.g., Clean North Barn Stalls, Replenish Alfalfa Feed"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Assignee / Caretaker</label>
              {canAssignSpecific ? (
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs font-semibold focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                >
                  <option value="Everyone">Everyone (Public Claim)</option>
                  {visibleCrewProfiles.map((user) => (
                    <option key={user.name} value={user.name}>
                      {user.name} ({user.title || user.role})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-stone-100 border border-stone-200 text-stone-500 rounded-xl p-2.5 text-xs font-bold flex items-center justify-between">
                  <span>Everyone (Public Claim)</span>
                  <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200/50 px-2 py-0.5 rounded-md">Direct assignment restricted</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Priority Selector */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Priority Level</label>
              <div className="flex gap-2">
                {(() => {
                  const canSetCritical = currentUser.role === "owner" || currentUser.role === "admin" || ["System Administrator", "Claire Wright", "Mark Wright"].includes(currentUser.name);
                  const allowedLevels = canSetCritical 
                    ? (["Low", "Medium", "High", "Critical"] as const) 
                    : (["Low", "Medium", "High"] as const);
                  
                  return allowedLevels.map((level) => {
                    const activeColor = {
                      Low: "bg-stone-200 text-stone-950 border-stone-400 ring-1 ring-stone-500",
                      Medium: "bg-amber-500 text-white border-amber-600 ring-1 ring-amber-600",
                      High: "bg-rose-600 text-white border-rose-700 ring-1 ring-rose-700",
                      Critical: "bg-red-600 text-white border-red-700 ring-1 ring-red-700 animate-pulse",
                    };
                    const isSelected = priority === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setPriority(level)}
                        className={`flex-1 py-2 px-1 text-[11px] font-bold rounded-xl border transition-all cursor-pointer ${
                          isSelected ? activeColor[level] : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                        }`}
                      >
                        {level}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Mentions Selector */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Mention Crew Members</label>
              <div className="flex flex-wrap gap-1.5 p-2 bg-white border border-stone-200 rounded-xl max-h-[85px] overflow-y-auto">
                {visibleCrewProfiles.map((user) => {
                  const isMentioned = mentionedPeople.includes(user.name);
                  return (
                    <button
                      key={user.name}
                      type="button"
                      onClick={() => toggleMention(user.name)}
                      className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                        isMentioned 
                          ? "bg-teal-600 text-white border-teal-700" 
                          : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100"
                      }`}
                    >
                      @{user.name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Job Description &amp; Instructions *</label>
            <textarea
              placeholder="Provide clean step-by-step instructions of what needs to be accomplished..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-3xs flex items-center gap-1.5 disabled:opacity-50"
            >
              Dispatch Job
            </button>
          </div>
        </form>
      )}

      {/* Task List Layout - Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* ACTIVE JOBS COLUMN */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
              Pending Jobs ({activeTasks.length})
            </span>
            <span className="text-[10px] bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full border border-amber-200/50 uppercase tracking-widest">
              Action Required
            </span>
          </div>

          {activeTasks.length === 0 ? (
            <div className="p-8 bg-stone-50 border border-stone-100 rounded-2xl text-center text-stone-500">
              <CheckCircle2 size={24} className="mx-auto text-emerald-600 mb-2" />
              <p className="text-xs font-bold uppercase tracking-wider text-stone-700">All caught up!</p>
              <p className="text-xxs text-stone-500 mt-1">No pending jobs are registered on the public board.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {activeTasks.map((task) => {
                  const { canSeeDetails } = getTaskVisibility(task);
                  const isCritical = task.priority === "Critical";
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      key={task.id} 
                      className={`p-4 rounded-2xl shadow-3xs transition-all relative group flex flex-col justify-between border-2 ${
                        isCritical
                          ? "border-red-600 bg-red-500/10 shadow-md shadow-red-500/20 animate-pulse critical-task-card"
                          : "border-stone-200 bg-white hover:border-teal-500/30 hover:shadow-2xs"
                      }`}
                    >
                    <div>
                      {/* Header line */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center flex-wrap gap-2">
                            <h4 className="font-bold text-stone-900 text-sm">{task.title}</h4>
                            {canSeeDetails && task.priority && (
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                task.priority === "Critical"
                                  ? "bg-red-600 text-white border-red-700 animate-pulse"
                                  : task.priority === "High" 
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : task.priority === "Low"
                                  ? "bg-stone-50 text-stone-600 border-stone-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200"
                              }`}>
                                {task.priority}
                              </span>
                            )}
                          </div>
                          {/* Mentions tags */}
                          {(task as any).mentions && (task as any).mentions.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {(task as any).mentions.map((name: string) => (
                                <span key={name} className="text-[9px] bg-teal-50 text-teal-800 border border-teal-100/50 px-2 py-0.5 rounded-md font-semibold">
                                  @{name.split(" ")[0]}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {/* Delete option for creators/admins */}
                        {canSeeDetails && (task.createdBy === currentUser.name || currentUser.role !== "visitor") && (
                          <div className="absolute top-3 right-3 z-10">
                            {confirmDeleteId === task.id ? (
                              <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 text-[9px] font-bold text-rose-800 animate-fade-in shadow-2xs">
                                <span>Delete?</span>
                                <button
                                  type="button"
                                  onClick={() => { handleDeleteTask(task.id); setConfirmDeleteId(null); }}
                                  className="bg-rose-600 hover:bg-rose-700 text-white px-1.5 py-0.5 rounded cursor-pointer font-extrabold"
                                >
                                  Yes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="bg-stone-200 hover:bg-stone-300 text-stone-700 px-1.5 py-0.5 rounded cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(task.id)}
                                title="Delete Task"
                                className="text-stone-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {canSeeDetails ? (
                        <p className="text-xs text-stone-600 leading-relaxed mb-3 whitespace-pre-wrap">
                          {task.description}
                        </p>
                      ) : (
                        <p className="text-xs text-stone-400 italic mb-3 bg-stone-50 p-2 rounded-lg border border-stone-100">
                          Job details locked — Access restricted to assignee.
                        </p>
                      )}

                      {/* Meta line */}
                      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[10px] text-stone-500 font-medium pb-3 border-b border-stone-100">
                        {canSeeDetails && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} className="text-stone-400" />
                            Added {task.createdAt} by {task.createdBy}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <User size={11} className="text-stone-400" />
                          Assignee: <strong className="text-teal-700">{task.assignedTo || "Everyone"}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Completion Action */}
                    {canSeeDetails && (
                      <div className="mt-3.5">
                        {completingTaskId === task.id ? (
                          <div className="space-y-2.5 p-3 bg-teal-50/50 border border-teal-500/15 rounded-xl animate-fade-in">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-teal-900 uppercase">Describe your work (optional)</span>
                              <button 
                                onClick={() => setCompletingTaskId(null)}
                                className="text-stone-400 hover:text-stone-600 p-0.5 rounded-full hover:bg-stone-200"
                              >
                                <X size={12} />
                              </button>
                            </div>
                            <textarea
                              placeholder="What details should the team know? e.g. Checked water level, added 2 flakes of hay."
                              value={completionNotes}
                              onChange={(e) => setCompletionNotes(e.target.value)}
                              rows={2}
                              className="w-full bg-white border border-teal-300/40 rounded-lg p-2 text-xs focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setCompletingTaskId(null)}
                                className="px-2.5 py-1.5 text-[10px] font-bold text-stone-500 bg-white border border-stone-200 rounded-md"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleCompleteTask(task.id)}
                                className="px-3 py-1.5 text-[10px] font-bold bg-teal-600 text-white rounded-md hover:bg-teal-700"
                              >
                                Complete Job
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setCompletingTaskId(task.id);
                              setCompletionNotes("");
                            }}
                            className="w-full bg-stone-50 hover:bg-teal-50 hover:text-teal-900 text-stone-700 border border-stone-200 font-bold text-[11px] py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <CheckSquare size={13} className="text-teal-600" /> Mark as Done
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* COMPLETED JOBS COLUMN */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
              Completed History ({completedTasks.length})
            </span>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200/50 uppercase tracking-widest">
              Success Archive
            </span>
          </div>

          {completedTasks.length === 0 ? (
            <div className="p-8 bg-stone-50/50 border border-stone-100 rounded-2xl text-center text-stone-500 border-dashed">
              <HelpCircle size={24} className="mx-auto text-stone-400 mb-2" />
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">No completed history</p>
              <p className="text-xxs text-stone-400 mt-1">Jobs marked done by the crew will appear in this column.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {completedTasks.map((task) => {
                  const { canSeeDetails } = getTaskVisibility(task);
                  return (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      key={task.id} 
                      className="p-4 bg-emerald-50/10 border border-emerald-100 rounded-2xl relative group"
                    >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center flex-wrap gap-2">
                          <h4 className="font-bold text-stone-800 text-sm flex items-center gap-1.5 line-through decoration-emerald-600/30">
                            {task.title}
                          </h4>
                          {canSeeDetails && task.priority && (
                            <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded-md border uppercase tracking-wider ${
                              task.priority === "Critical"
                                ? "bg-red-100 text-red-700 border-red-200"
                                : task.priority === "High" 
                                ? "bg-rose-50 text-rose-600 border-rose-150"
                                : task.priority === "Low"
                                ? "bg-stone-50 text-stone-500 border-stone-150"
                                : "bg-amber-50 text-amber-600 border-amber-150"
                            }`}>
                              {task.priority}
                            </span>
                          )}
                        </div>
                        {/* Mentions tags */}
                        {(task as any).mentions && (task as any).mentions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {(task as any).mentions.map((name: string) => (
                              <span key={name} className="text-[8px] bg-teal-50/70 text-teal-700 border border-teal-100/30 px-1.5 py-0.2 rounded font-semibold line-through decoration-emerald-600/10">
                                @{name.split(" ")[0]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {canSeeDetails && currentUser.role !== "visitor" && (
                        <div className="absolute top-3 right-3 z-10">
                          {confirmDeleteId === task.id ? (
                            <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 text-[9px] font-bold text-rose-800 animate-fade-in shadow-2xs">
                              <span>Delete?</span>
                              <button
                                type="button"
                                onClick={() => { handleDeleteTask(task.id); setConfirmDeleteId(null); }}
                                className="bg-rose-600 hover:bg-rose-700 text-white px-1.5 py-0.5 rounded cursor-pointer font-extrabold"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="bg-stone-200 hover:bg-stone-300 text-stone-700 px-1.5 py-0.5 rounded cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(task.id)}
                              title="Delete History Record"
                              className="text-stone-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {canSeeDetails ? (
                      <p className="text-xs text-stone-500 leading-relaxed mb-3 line-through decoration-emerald-600/10">
                        {task.description}
                      </p>
                    ) : (
                      <p className="text-xs text-stone-400 italic mb-3 bg-stone-50/50 p-2 rounded-lg border border-stone-100/55">
                        Job details locked — Access restricted to assignee.
                      </p>
                    )}

                    {canSeeDetails && (
                      <div className="p-3 bg-emerald-50/45 rounded-xl border border-emerald-200/10 mb-3 text-xs text-emerald-950 font-semibold flex flex-col gap-1.5 leading-relaxed">
                        <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-emerald-600" /> Completed by {task.completedBy}
                        </span>
                        <p className="text-stone-700 italic pl-3.5 border-l-2 border-emerald-300 font-medium">
                          &ldquo;{task.completionDescription}&rdquo;
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[9px] text-stone-400 font-medium">
                      {canSeeDetails ? (
                        <span>Added {task.createdAt} by {task.createdBy}</span>
                      ) : (
                        <span>Assignee: <strong className="text-teal-700">{task.assignedTo || "Everyone"}</strong></span>
                      )}
                      <span className="font-bold text-emerald-800 bg-emerald-100/60 px-1.5 py-0.5 rounded">Done {task.completedAt}</span>
                    </div>
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
