import React, { useState, useEffect } from "react";
import { db, logAuditAction } from "../firebase";
import { collection, addDoc, doc, updateDoc } from "firebase/firestore";
import { Horse, MaintenanceType, SystemUser } from "../types";
import { X, Save, Hammer, Stethoscope, Heart, Award, ShieldAlert, Pill, Scissors, Mic, MicOff, Square, Play, Trash } from "lucide-react";

interface MaintenanceFormProps {
  horse: Horse;
  isOpen: boolean;
  onClose: () => void;
  todayStr: string;
  loggedBy: string;
  currentUser?: SystemUser | null;
}

export default function MaintenanceForm({ horse, isOpen, onClose, todayStr, loggedBy, currentUser }: MaintenanceFormProps) {
  const [formData, setFormData] = useState({
    type: "shoeing" as MaintenanceType,
    date: todayStr,
    performedBy: "",
    cost: "",
    notes: "",
    nextDueDate: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Microphone voice memo states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [voiceMetadata, setVoiceMetadata] = useState<{
    durationSeconds: number;
    recordedAt: string;
    audioBase64?: string;
  } | null>(null);

  const [isListening, setIsListening] = useState(false);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice speech-to-text is not supported in this browser. Please use Google Chrome, Apple Safari, or Microsoft Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setFormData((prev) => ({
        ...prev,
        notes: prev.notes ? prev.notes + " " + transcript : transcript,
      }));
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const stopListening = () => {
    setIsListening(false);
  };

  // Clear states when closed/opened
  useEffect(() => {
    if (!isOpen) {
      setIsRecording(false);
      if (mediaRecorder) {
        try {
          mediaRecorder.stream.getTracks().forEach(t => t.stop());
        } catch {}
      }
      setMediaRecorder(null);
      setVoiceDuration(0);
      setRecordedUrl(null);
      setVoiceMetadata(null);
    }
  }, [isOpen]);

  // Voice recording timer
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setVoiceDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = async () => {
    try {
      setErrorMsg("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          setVoiceMetadata({
            durationSeconds: voiceDuration || 1,
            recordedAt: new Date().toISOString(),
            audioBase64: base64,
          });
        };
        reader.readAsDataURL(blob);

        stream.getTracks().forEach(track => track.stop());
      };

      setMediaRecorder(recorder);
      setVoiceDuration(0);
      setIsRecording(true);
      recorder.start();
    } catch (err) {
      console.error("Mic access denied or error:", err);
      setErrorMsg("Microphone access denied. Please verify your browser recording permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  // Update default next due date if type changes
  useEffect(() => {
    // If shoeing, suggest interval. (e.g. 6 weeks from today or 6 weeks from form date)
    if (formData.type === "shoeing") {
      const intervalWeeks = horse.shoeingIntervalWeeks || 6;
      const baseDate = formData.date ? new Date(formData.date) : new Date();
      baseDate.setDate(baseDate.getDate() + (intervalWeeks * 7));
      const nextStr = baseDate.toISOString().split("T")[0];
      setFormData((prev) => ({ ...prev, nextDueDate: nextStr }));
    } else {
      setFormData((prev) => ({ ...prev, nextDueDate: "" }));
    }
  }, [formData.type, formData.date, horse]);

  // Fetch AI Suggested Notes
  useEffect(() => {
    if (!isOpen) return;
    const fetchSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch("/api/suggest-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: formData.type,
            horseName: horse.name,
            breed: horse.breed
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions) {
            setSuggestions(data.suggestions);
          }
        }
      } catch (err) {
        console.error("Failed to fetch notes suggestions:", err);
      } finally {
        setLoadingSuggestions(false);
      }
    };
    fetchSuggestions();
  }, [formData.type, horse.name, horse.breed, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date) {
      setErrorMsg("Date is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const logPayload = {
        horseId: horse.id,
        horseName: horse.name,
        type: formData.type,
        date: formData.date,
        performedBy: formData.performedBy || "Unspecified Specialist",
        cost: Number(formData.cost) || 0,
        notes: formData.notes,
        nextDueDate: formData.nextDueDate || undefined,
        createdAt: todayStr,
        loggedBy: loggedBy,
        voiceMemo: voiceMetadata || null,
      };

      // 1. Add log to subcollection `/horses/{horseId}/logs`
      await addDoc(collection(db, `horses/${horse.id}/logs`), logPayload);

      // 2. Prepare parent Horse profile updates
      const horseUpdates: Partial<Horse> = {
        updatedAt: todayStr,
      };

      if (formData.type === "shoeing") {
        horseUpdates.lastShoeingDate = formData.date;
      } else if (formData.type === "vet") {
        horseUpdates.lastVetDate = formData.date;
        if (formData.notes) horseUpdates.lastVetNotes = formData.notes;
        if (formData.nextDueDate) horseUpdates.nextVetDueDate = formData.nextDueDate;
      } else if (formData.type === "branding") {
        horseUpdates.brandingDate = formData.date;
        if (formData.notes) horseUpdates.brandingDescription = formData.notes;
      } else if (formData.type === "deworming") {
        horseUpdates.lastDewormingDate = formData.date;
      } else if (formData.type === "dental") {
        horseUpdates.lastDentalDate = formData.date;
      }

      // 3. Update the parent Horse document
      await updateDoc(doc(db, "horses", horse.id), horseUpdates);

      if (currentUser) {
        logAuditAction(currentUser.name, currentUser.role, "modify", `Logged ${formData.type} maintenance record for horse: ${horse.name}`);
      }

      // Reset & Close
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        const intensity = currentUser?.vibrationIntensity || "medium";
        let pattern = [100, 50, 100];
        if (intensity === "low") {
          pattern = [40];
        } else if (intensity === "high") {
          pattern = [250, 80, 250, 80, 250];
        }
        navigator.vibrate(pattern);
      }
      onClose();
    } catch (err) {
      console.error("Error logging maintenance:", err);
      setErrorMsg("Failed to log maintenance record. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getHeaderStyle = () => {
    switch (formData.type) {
      case "shoeing": return { bg: "bg-teal-50 text-teal-800", icon: <Hammer size={20} /> };
      case "vet": return { bg: "bg-rose-50 text-rose-800", icon: <Stethoscope size={20} /> };
      case "deworming": return { bg: "bg-sky-50 text-sky-800", icon: <Heart size={20} /> };
      case "branding": return { bg: "bg-teal-100 text-teal-900", icon: <Award size={20} /> };
      case "medication": return { bg: "bg-amber-50 text-amber-800", icon: <Pill size={20} /> };
      case "grooming": return { bg: "bg-purple-50 text-purple-800", icon: <Scissors size={20} /> };
      default: return { bg: "bg-stone-50 text-stone-800", icon: <ShieldAlert size={20} /> };
    }
  };

  const headerStyle = getHeaderStyle();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto cursor-pointer" 
      id="maintenance-form-backdrop"
      onClick={onClose}
    >
      <div 
        id="maintenance-form-card"
        className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg overflow-hidden transform transition-all duration-300 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Banner */}
        <div className={`p-5 flex items-center justify-between border-b border-stone-100 ${headerStyle.bg}`}>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-white/70 shadow-xs shrink-0">
              {headerStyle.icon}
            </div>
            <div>
              <h2 className="text-lg font-bold">Log Maintenance for {horse.name}</h2>
              <p className="text-xs opacity-85 font-medium">Record shoeing, vet checks, deworming, or other care</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full hover:bg-stone-950/5 transition-colors cursor-pointer text-stone-500"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Maintenance Type Selection */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Maintenance Type</label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-semibold"
            >
              <option value="shoeing">Shoeing / Hoof Care (Farrier)</option>
              <option value="vet">Veterinary Check / General Vet Visit</option>
              <option value="medication">Medication / Supplement Admin</option>
              <option value="grooming">Grooming & Bath / Coat Care</option>
              <option value="deworming">Deworming Dose</option>
              <option value="dental">Dental Care (Floating / Dental Float)</option>
              <option value="vaccination">Vaccination / Immunization</option>
              <option value="branding">Branding / Mark Registration</option>
              <option value="other">Other General Care</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Maintenance Date */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Date Performed *</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
              />
            </div>

            {/* Cost */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Maintenance Cost ($)</label>
              <input
                type="number"
                name="cost"
                value={formData.cost}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="0.00"
                className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
              />
            </div>
          </div>

          {/* Performed By */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Performed By (Specialist/Vendor)</label>
            <input
              type="text"
              name="performedBy"
              value={formData.performedBy}
              onChange={handleChange}
              placeholder="e.g. Farrier Bob, Dr. Adams"
              className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
            />
          </div>

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-stone-700">Notes / Description of Work</label>
              {loadingSuggestions && (
                <span className="text-[10px] text-teal-600 font-bold animate-pulse">Loading AI notes...</span>
              )}
            </div>
            <div className="relative">
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="e.g. Added winter studs to front hooves, vaccine batch #104B"
                rows={3}
                className="w-full border border-stone-200 rounded-xl p-2.5 pr-10 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium mb-1.5"
              />
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`absolute right-2.5 bottom-4 p-1.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isListening
                    ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse animate-bounce"
                    : "bg-teal-50 hover:bg-teal-100 text-teal-700"
                }`}
                title={isListening ? "Stop voice dictation" : "Dictate Notes / Description"}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </div>
            {isListening && (
              <p className="text-[10px] text-teal-600 font-bold animate-pulse flex items-center gap-1 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-ping" />
                Listening... Speak now, text will append. Click red mic to stop.
              </p>
            )}
            {suggestions.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-black text-stone-400 uppercase tracking-wider block">AI Suggested Presets (Tap to use):</span>
                <div className="flex flex-col gap-1">
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, notes: s }))}
                      className="text-left text-xxs font-semibold bg-stone-50 hover:bg-teal-50 border border-stone-150 hover:border-teal-200 text-stone-700 hover:text-teal-950 p-2 rounded-lg cursor-pointer transition-colors block truncate"
                      title={s}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Voice Memo Recorder using browser microphone API */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-150 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                <Mic size={14} className="text-teal-600" />
                Specialist Voice Memo
              </label>
              {voiceMetadata && (
                <span className="text-[9px] bg-teal-100 text-teal-800 font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                  Recorded • {voiceMetadata.durationSeconds}s
                </span>
              )}
            </div>
            <p className="text-xxs text-stone-500 leading-normal font-semibold">
              Record a quick hands-free audio summary to store as secure audit metadata with this care log entry.
            </p>

            <div className="flex items-center gap-2.5">
              {!isRecording && !recordedUrl && (
                <button
                  type="button"
                  onClick={startRecording}
                  className="bg-white hover:bg-stone-100 text-stone-800 border border-stone-250 hover:border-stone-300 text-xxs font-black uppercase tracking-wider px-3.5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-5xs"
                >
                  <Mic size={13} className="text-teal-600 animate-pulse" />
                  Record Memo
                </button>
              )}

              {isRecording && (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xxs font-black uppercase tracking-wider px-3.5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-5xs animate-pulse"
                >
                  <Square size={13} className="text-rose-600 fill-current" />
                  Stop Recording ({voiceDuration}s)
                </button>
              )}

              {recordedUrl && (
                <div className="flex items-center gap-2 w-full justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const audio = new Audio(recordedUrl);
                        audio.play();
                      }}
                      className="bg-teal-600 hover:bg-teal-700 text-white text-xxs font-black uppercase tracking-wider px-3 py-2 rounded-xl transition-all flex items-center gap-1 shadow-3xs cursor-pointer"
                    >
                      <Play size={11} className="fill-current" />
                      Play Memo
                    </button>
                    <span className="text-xxs font-bold text-stone-500">Duration: {voiceDuration}s</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setRecordedUrl(null);
                      setVoiceMetadata(null);
                      setVoiceDuration(0);
                    }}
                    className="text-stone-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Delete voice memo"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Next Due Date Schedule */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-100">
            <label className="block text-xs font-semibold text-stone-700 mb-1">Next Recurrence / Scheduled Due Date</label>
            <input
              type="date"
              name="nextDueDate"
              value={formData.nextDueDate}
              onChange={handleChange}
              className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
            />
            <p className="text-xxs text-stone-500 mt-1.5 leading-relaxed">
              Setting this will automatically prompt notifications on the dashboard and alerts center when the date is upcoming or overdue.
            </p>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-stone-100 flex items-center justify-end space-x-3 bg-stone-50/50 -mx-6 -mb-6 p-4">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-stone-500 hover:text-stone-800 bg-white border border-stone-200 rounded-xl px-4 py-2.5 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-2.5 cursor-pointer transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <Save size={14} />
              {isSubmitting ? "Saving..." : "Save Log Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
