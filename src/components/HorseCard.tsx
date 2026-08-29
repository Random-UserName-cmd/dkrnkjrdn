import { useState, useRef } from "react";
import { motion } from "motion/react";
import { Horse, UserRole } from "../types";
import { getShoeingStatus, getVetStatus } from "../utils/scheduler";
import { Calendar, Hammer, Stethoscope, Award, Info, Heart, Eye, Trash2, GripVertical, AlertCircle, Check, Pill, Mic, MicOff, Pin } from "lucide-react";

interface HorseCardProps {
  horse: Horse;
  todayStr: string;
  onSelect: (horseId: string) => void;
  onLogMaintenance: (horse: Horse) => void;
  onDelete: (horseId: string) => void;
  userRole: UserRole;
  isPeter?: boolean;
  key?: string | number;
  onReorder?: (draggedId: string, targetId: string) => void;
  searchTerm?: string;
  onQuickCheckOk?: (horse: Horse, checkNotes?: string) => void;
  isPinned?: boolean;
  onTogglePin?: (horseId: string) => void;
}

export default function HorseCard({ horse, todayStr, onSelect, onLogMaintenance, onDelete, userRole, isPeter, onReorder, searchTerm, onQuickCheckOk, isPinned, onTogglePin }: HorseCardProps) {
  const shoeing = getShoeingStatus(horse, todayStr);
  const vet = getVetStatus(horse, todayStr);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Voice dictation states
  const [activeVoiceModal, setActiveVoiceModal] = useState<"check" | null>(null);
  const [voiceNotes, setVoiceNotes] = useState("");
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice speech-to-text is not supported in this browser. Please use Google Chrome, Apple Safari, or Microsoft Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        }
      }
      if (finalTranscript) {
        setVoiceNotes(prev => {
          const base = prev.endsWith(" ") ? prev : prev + " ";
          return base + finalTranscript;
        });
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  // Helper to visually highlight matching search text
  const highlightText = (text: string, search?: string) => {
    if (!text) return "";
    if (!search || !search.trim()) return <span>{text}</span>;
    const regex = new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, "gi");
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, idx) => 
          part.toLowerCase() === search.toLowerCase() ? (
            <mark key={idx} className="bg-amber-100 text-amber-950 font-extrabold px-0.5 rounded-sm">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  // Fallback visual colors/patterns based on gender or name hash for variety
  const getAvatarStyle = () => {
    const genders = {
      Mare: "bg-rose-50 text-rose-800 border-rose-200",
      Gelding: "bg-teal-50 text-teal-800 border-teal-200",
      Stallion: "bg-stone-50 text-stone-800 border-stone-200"
    };
    return genders[horse.gender] || "bg-stone-50 text-stone-800 border-stone-200";
  };

  return (
    <motion.div 
      id={`horse-card-${horse.id}`}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStart={(e) => {
        setIsDragging(true);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", horse.id);
      }}
      onDragEnd={() => {
        setIsDragging(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => {
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const draggedId = e.dataTransfer.getData("text/plain");
        if (onReorder && draggedId) {
          onReorder(draggedId, horse.id);
        }
      }}
      whileHover={{ 
        y: -6,
        scale: 1.03,
        boxShadow: "0 25px 35px -5px rgba(0, 0, 0, 0.15), 0 12px 20px -6px rgba(13, 148, 136, 0.25)" 
      }}
      transition={{ 
        type: "spring", 
        stiffness: 350, 
        damping: 22 
      }}
      className={`relative bg-white rounded-2xl border overflow-hidden flex flex-col justify-between group transition-colors duration-300 cursor-pointer ${
        isDragging ? "opacity-30 scale-95 border-dashed border-stone-400" :
        isDragOver ? "border-teal-500 ring-4 ring-teal-500/10 scale-102" :
        isPinned ? "border-amber-400 ring-2 ring-amber-400/20 shadow-md bg-gradient-to-b from-amber-50/20 to-white" :
        "border-stone-200 hover:border-teal-500/60"
      }`}
    >
      {/* Absolute Confirmation Overlay */}
      {showConfirmDelete && (
        <div className="absolute inset-0 bg-stone-900/80 backdrop-blur-xs flex flex-col justify-center items-center p-6 text-center z-20 animate-fade-in">
          <div className="bg-white rounded-2xl p-5 shadow-xl max-w-xs border border-stone-100">
            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600 mx-auto mb-3">
              <Trash2 size={24} />
            </div>
            <h4 className="font-bold text-stone-900 text-sm">Delete {horse.name}?</h4>
            <p className="text-xs text-stone-500 mt-2 leading-relaxed">
              This will permanently remove this horse's profile and all their maintenance history logs.
            </p>
            <div className="flex gap-2.5 mt-4">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 text-xs font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 py-2.5 px-3 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(horse.id);
                  setShowConfirmDelete(false);
                }}
                className="flex-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white py-2.5 px-3 rounded-xl transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upper Content */}
      <div>
        {/* Header Block: Horse Profile Header */}
        <div className="p-5 pb-3 border-b border-stone-100 bg-stone-50/50 flex items-start justify-between">
          <div className="flex items-center space-x-2.5 w-3/4">
            {/* Grip handle for drag and drop */}
            <div className="cursor-grab active:cursor-grabbing text-stone-300 hover:text-stone-500 p-1 rounded-md shrink-0 -ml-2.5 transition-colors" title="Drag to sort card">
              <GripVertical size={16} />
            </div>
            {/* Visual Initials Circle */}
            <div className={`w-12 h-12 rounded-xl border flex flex-col items-center justify-center font-bold text-lg shadow-sm ${getAvatarStyle()}`}>
              {horse.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="truncate">
              <h3 className="font-bold text-stone-900 text-lg leading-tight truncate flex items-center gap-1.5 flex-wrap">
                <span className="truncate">{highlightText(horse.name, searchTerm)}</span>
                {horse.raceName && (
                  <span className="text-xs font-semibold text-stone-500 italic truncate shrink-0">
                    ({highlightText(horse.raceName, searchTerm)})
                  </span>
                )}

              </h3>
              {horse.raceName && (
                <div className="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-150 px-1.5 py-0.5 rounded-md mt-0.5 inline-block uppercase tracking-wider max-w-full truncate">
                  Racing: "{horse.raceName}"
                </div>
              )}
              <p className="text-xs text-stone-500 font-medium truncate">
                {highlightText(horse.breed, searchTerm)} • {horse.age} yrs
              </p>
              {/* Display Horse tags on card */}
              {horse.tags && horse.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {horse.tags.slice(0, 3).map(tag => (
                    <span 
                      key={tag} 
                      className="inline-block text-[9px] font-bold bg-teal-50 text-teal-700 border border-teal-200/50 px-1.5 py-0.5 rounded-md uppercase tracking-wider"
                    >
                      {tag}
                    </span>
                  ))}
                  {horse.tags.length > 3 && (
                    <span className="text-[9px] font-bold text-stone-400 bg-stone-50 border border-stone-200 px-1 py-0.5 rounded-md uppercase">
                      +{horse.tags.length - 3}
                    </span>
                  )}
                </div>
              )}

              {/* At-a-glance Status Indicators */}
              <div className="flex flex-wrap gap-1.5 mt-2.5" id={`status-indicators-${horse.id}`}>
                {shoeing?.status === "overdue" && (
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-250/60 px-2 py-0.5 rounded-md" title="Requires Farrier shoeing attention">
                    <Hammer size={11} className="animate-bounce shrink-0" /> Requires Farrier
                  </span>
                )}
                {vet?.status === "overdue" && (
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-250/60 px-2 py-0.5 rounded-md" title="Requires Vet medical attention">
                    <Stethoscope size={11} className="animate-pulse shrink-0" /> Requires Vet
                  </span>
                )}
                {(!shoeing || shoeing.status !== "overdue") && (!vet || vet.status !== "overdue") && (
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-250/60 px-2 py-0.5 rounded-md" title="All routine care and vet checks are current">
                    <Check size={11} strokeWidth={3} className="text-emerald-600 shrink-0" /> Up to Date
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-800 border border-stone-200 uppercase tracking-wider">
              {highlightText(horse.color, searchTerm)}
            </span>
            
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onTogglePin) onTogglePin(horse.id);
                }}
                title={isPinned ? "Unpin priority card" : "Pin card as priority (sorts to top of grid)"}
                className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold ${
                  isPinned 
                    ? "bg-amber-100 text-amber-800 border border-amber-300/80 shadow-2xs hover:bg-amber-200" 
                    : "text-stone-300 hover:text-amber-600 hover:bg-amber-50"
                }`}
              >
                <Pin size={13} className={isPinned ? "fill-amber-600 text-amber-700 rotate-45" : ""} />
                {isPinned && <span className="text-[9px] font-black uppercase tracking-wider text-amber-800">Priority</span>}
              </button>

              {userRole !== "visitor" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirmDelete(true);
                  }}
                  title="Delete Horse"
                  className="text-stone-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-all cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Daily Status Check Indicator */}
          {horse.lastCheckedDate === todayStr ? (
            <div className="p-2.5 bg-emerald-50 border border-emerald-500/15 rounded-xl flex items-center justify-between text-[10px] text-emerald-800 animate-fade-in shadow-4xs" id={`status-checked-${horse.id}`}>
              <span className="flex items-center gap-2 font-bold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Daily Check: <strong className="uppercase">Checked &amp; OK</strong>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] text-stone-400 font-semibold uppercase mr-1">
                  By {horse.lastCheckedBy || "Staff"}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-stone-500" id={`status-unchecked-${horse.id}`}>
              <span className="flex items-center gap-2 font-semibold">
                <span className="h-2 w-2 rounded-full bg-stone-300"></span>
                No Daily Check Logged Today
              </span>
              <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 flex-wrap">
                {!isPeter && onQuickCheckOk && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setVoiceNotes("Checked & OK. Calm, clear, and alert.");
                      setActiveVoiceModal("check");
                    }}
                    className="flex-1 sm:flex-initial h-9 px-3 font-bold uppercase tracking-wider bg-teal-600 hover:bg-teal-700 active:scale-[0.98] text-white rounded-lg transition-all cursor-pointer shadow-md flex items-center justify-center gap-1 shrink-0 text-xs sm:text-[10px]"
                    id={`quick-check-btn-${horse.id}`}
                  >
                    <Check size={13} strokeWidth={3} className="shrink-0" /> Quick Check
                  </button>
                )}
              </div>
            </div>
          )}

          {!isPeter ? (
            <>


              {/* 1. Branding Information (Farm Identity Marks) */}
              {horse.brandingDescription ? (
                <div className="p-3 bg-teal-50/30 border border-teal-600/10 rounded-xl flex items-start space-x-2.5">
                  <Award className="text-teal-700 mt-0.5 shrink-0" size={16} />
                  <div className="text-xs">
                    <span className="font-semibold text-teal-900 block">Farm Brand & Marks</span>
                    <span className="text-stone-600 block line-clamp-1">
                      {horse.brandingDescription} {horse.brandingLocation ? `(${horse.brandingLocation})` : ""}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-stone-50 rounded-xl flex items-start space-x-2.5 border border-dashed border-stone-200">
                  <Award className="text-stone-400 mt-0.5 shrink-0" size={16} />
                  <div className="text-xs">
                    <span className="font-semibold text-stone-500 block">No Brand Registered</span>
                    <span className="text-stone-400 block italic">Click 'Profile' to add brand marks.</span>
                  </div>
                </div>
              )}

              {/* 2. Maintenance Status Grid (Shoeing & Vet) */}
              <div className="grid grid-cols-2 gap-3">
                {/* Shoeing Column */}
                <div className="p-3 bg-stone-50/75 rounded-xl border border-stone-100">
                  <div className="flex items-center space-x-2 text-stone-700 mb-1.5">
                    <Hammer size={15} className="text-teal-600 shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">Shoeing</span>
                  </div>
                  {shoeing ? (
                    <div>
                      <span className={`inline-block text-xxs font-bold px-2 py-0.5 rounded-md mb-1.5 ${
                        shoeing.status === "overdue" ? "bg-rose-100 text-rose-800" :
                        shoeing.status === "warning" ? "bg-amber-100 text-amber-800" :
                        "bg-emerald-100 text-emerald-800"
                      }`}>
                        {shoeing.statusText}
                      </span>
                      <div className="text-[11px] text-stone-500 font-medium">
                        Due: <span className="text-stone-700 font-bold">{shoeing.dueDate}</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xxs text-stone-400 block italic">Not scheduled</span>
                  )}
                </div>

                {/* Vet Column */}
                <div className="p-3 bg-stone-50/75 rounded-xl border border-stone-100">
                  <div className="flex items-center space-x-2 text-stone-700 mb-1.5">
                    <Stethoscope size={15} className="text-rose-700 shrink-0" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-600">Vet Check</span>
                  </div>
                  {vet ? (
                    <div>
                      <span className={`inline-block text-xxs font-bold px-2 py-0.5 rounded-md mb-1.5 ${
                        vet.status === "overdue" ? "bg-rose-100 text-rose-800" :
                        vet.status === "warning" ? "bg-amber-100 text-amber-800" :
                        "bg-sky-100 text-sky-800"
                      }`}>
                        {vet.statusText}
                      </span>
                      <div className="text-[11px] text-stone-500 font-medium">
                        Due: <span className="text-stone-700 font-bold">{vet.dueDate}</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xxs text-stone-400 block italic">No upcoming visits</span>
                  )}
                </div>
              </div>

              {/* 3. Additional Care Milestones Line */}
              <div className="flex flex-wrap gap-2 pt-1">
                {horse.lastDewormingDate && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-50 text-[10px] text-stone-600 border border-stone-100">
                    <Heart size={11} className="text-red-500" /> Dewormed {horse.lastDewormingDate}
                  </span>
                )}
                {horse.lastDentalDate && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-50 text-[10px] text-stone-600 border border-stone-100">
                    <Info size={11} className="text-sky-500" /> Dental {horse.lastDentalDate}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="p-4 bg-teal-50/20 border border-teal-600/10 rounded-2xl text-center">
              <Award className="text-teal-700 mx-auto mb-2" size={24} />
              <p className="text-xs font-bold text-teal-900 uppercase tracking-wide">Ready for Markings Verification</p>
              <p className="text-xxs text-stone-500 mt-1">Open Profile to inspect the farm brand certificate or run a marking scan check.</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="px-5 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between gap-2">
        <button
          onClick={() => onSelect(horse.id)}
          className="text-xs font-semibold text-stone-600 hover:text-stone-900 border border-stone-200 hover:border-stone-400 bg-white px-2.5 py-2 rounded-xl flex items-center gap-1 transition-all cursor-pointer shadow-xs shrink-0"
        >
          <Eye size={13} /> Profile
        </button>
        {!isPeter && (
          <button
            onClick={() => onLogMaintenance(horse)}
            className="text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-2 rounded-xl flex-1 text-center transition-all cursor-pointer shadow-xs min-w-0 truncate"
          >
            + Log Maintenance
          </button>
        )}
      </div>

      {/* Absolute Voice Dictation Modal / Panel */}
      {activeVoiceModal && (
        <div className="absolute inset-0 bg-stone-950/90 backdrop-blur-xs flex flex-col justify-between p-5 z-30 animate-fade-in text-white">
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
              <h4 className="font-bold text-sm tracking-wide flex items-center gap-1.5 uppercase text-stone-100">
                <Check size={16} className="text-teal-400" /> Dictate Daily Check
              </h4>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveVoiceModal(null);
                  setVoiceNotes("");
                  stopListening();
                }}
                className="text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-lg transition-all cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-stone-300 leading-normal mb-3">
              Press the microphone button to start speaking. Dictation is fully hands-free inside the barn.
            </p>

            <div className="relative">
              <textarea
                value={voiceNotes}
                onChange={(e) => setVoiceNotes(e.target.value)}
                placeholder="Enter daily status check details..."
                className="w-full h-32 bg-stone-900/90 border border-stone-700 rounded-xl p-3 text-xs text-white placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
              />
              
              {/* Dictate / Speak Button overlay */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isListening) {
                    stopListening();
                  } else {
                    startListening();
                  }
                }}
                className={`absolute right-3 bottom-3 p-3 rounded-full flex items-center justify-center transition-all shadow-md active:scale-95 ${
                  isListening
                    ? "bg-rose-600 hover:bg-rose-700 animate-pulse text-white scale-110"
                    : "bg-teal-600 hover:bg-teal-700 text-white"
                }`}
                title={isListening ? "Stop listening" : "Start speaking voice memo"}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            </div>

            {isListening && (
              <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-teal-400 font-bold animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping"></span>
                Listening... Speak now and press stop when done.
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t border-white/10 pt-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveVoiceModal(null);
                setVoiceNotes("");
                stopListening();
              }}
              className="flex-1 bg-white/10 hover:bg-white/15 text-stone-300 hover:text-white font-semibold text-xs py-2.5 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                stopListening();
                if (onQuickCheckOk) {
                  onQuickCheckOk(horse, voiceNotes || "Checked & OK");
                }
                setActiveVoiceModal(null);
                setVoiceNotes("");
              }}
              className="flex-1 font-bold text-xs py-2.5 rounded-xl transition-all cursor-pointer bg-teal-600 hover:bg-teal-500 text-white"
            >
              Save Check
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
