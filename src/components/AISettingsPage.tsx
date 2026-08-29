import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, 
  Settings2, 
  BellRing, 
  Smartphone, 
  Save, 
  RotateCcw, 
  Play, 
  Send, 
  AlertCircle, 
  CheckCircle, 
  ChevronRight,
  Info,
  Waves,
  Zap,
  Check,
  CheckCircle2,
  RefreshCw,
  X
} from "lucide-react";
import { triggerHaptic } from "../utils/haptics";
import { SystemUser } from "../types";

interface AISettingsPageProps {
  currentUser: SystemUser | null;
}

interface PushLog {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  category: string;
}

export default function AISettingsPage({ currentUser }: AISettingsPageProps) {
  // 1. AI settings state
  const [model, setModel] = useState("nova-3.5-flash");
  const [temperature, setTemperature] = useState(0.7);
  const [systemInstruction, setSystemInstruction] = useState(
    "You are Nova AI, an advanced AI assistant for herd facilities. You assist with horse health, paddock audits, task management, feeding guidelines, and veterinarian logs."
  );

  // 2. Push Notification settings state
  const [pushEnabled, setPushEnabled] = useState(true);
  const [notifPerm, setNotifPerm] = useState("default");
  const [categories, setCategories] = useState({
    shoeing_due: true,
    vet_due: true,
    deworming_due: true,
    login_activity: true,
    chat_alerts: true
  });
  const [pushLogs, setPushLogs] = useState<PushLog[]>([]);

  // 3. Vibration Haptic settings state
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [testHapticPattern, setTestHapticPattern] = useState<"tap" | "success" | "warning" | "error">("tap");
  const [isVibrating, setIsVibrating] = useState(false);

  // 4. Testing states
  const [testPrompt, setTestPrompt] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  // Load settings on mount
  useEffect(() => {
    // AI Settings
    const savedModel = localStorage.getItem("horsesense_ai_model");
    if (savedModel) setModel(savedModel);

    const savedTemp = localStorage.getItem("horsesense_ai_temperature");
    if (savedTemp) setTemperature(parseFloat(savedTemp));

    const savedInstruction = localStorage.getItem("horsesense_ai_system_instruction");
    if (savedInstruction) setSystemInstruction(savedInstruction);

    // Push Notifications
    const savedPushEnabled = localStorage.getItem("horsesense_push_enabled");
    if (savedPushEnabled) setPushEnabled(savedPushEnabled === "true");

    const savedCats = localStorage.getItem("horsesense_push_categories");
    if (savedCats) {
      try {
        setCategories(JSON.parse(savedCats));
      } catch (e) {
        console.error("Failed to parse push categories:", e);
      }
    }

    const savedLogs = localStorage.getItem("horsesense_push_simulated_logs");
    if (savedLogs) {
      try {
        setPushLogs(JSON.parse(savedLogs));
      } catch (e) {
        console.error("Failed to parse push logs:", e);
      }
    }

    // Vibration Haptics
    const savedHapticsEnabled = localStorage.getItem("horsesense_haptics_enabled");
    if (savedHapticsEnabled) setHapticsEnabled(savedHapticsEnabled === "true");

    // Browser Notification permission status
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPerm(Notification.permission);
    }
  }, []);

  // Save changes to localStorage
  const handleSaveSettings = () => {
    try {
      localStorage.setItem("horsesense_ai_model", model);
      localStorage.setItem("horsesense_ai_temperature", temperature.toString());
      localStorage.setItem("horsesense_ai_system_instruction", systemInstruction);
      localStorage.setItem("horsesense_push_enabled", pushEnabled ? "true" : "false");
      localStorage.setItem("horsesense_push_categories", JSON.stringify(categories));
      localStorage.setItem("horsesense_haptics_enabled", hapticsEnabled ? "true" : "false");

      setSaveStatus("saved");
      triggerHaptic("success");

      setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);
    } catch (e) {
      console.error("Save settings error:", e);
      setSaveStatus("error");
      triggerHaptic("error");
    }
  };

  // Reset to defaults
  const handleResetDefaults = () => {
    if (window.confirm("Are you sure you want to restore default system & AI parameters?")) {
      setModel("nova-3.5-flash");
      setTemperature(0.7);
      setSystemInstruction(
        "You are Nova AI, an advanced AI assistant for herd facilities. You assist with horse health, paddock audits, task management, feeding guidelines, and veterinarian logs."
      );
      setPushEnabled(true);
      setCategories({
        shoeing_due: true,
        vet_due: true,
        deworming_due: true,
        login_activity: true,
        chat_alerts: true
      });
      setHapticsEnabled(true);
      triggerHaptic("warning");
    }
  };

  // Request real browser notification permission
  const handleRequestPushPerm = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const result = await Notification.requestPermission();
        setNotifPerm(result);
        if (result === "granted") {
          triggerHaptic("success");
        } else {
          triggerHaptic("warning");
        }
      } catch (e) {
        console.error("Failed to request push notification permission:", e);
      }
    }
  };

  // Test vibration haptics
  const handleTestHaptic = () => {
    setIsVibrating(true);
    triggerHaptic(testHapticPattern);
    setTimeout(() => {
      setIsVibrating(false);
    }, 400);
  };

  // Simulate Push Notification
  const handleSimulatePush = async () => {
    let permission = notifPerm;
    if (permission !== "granted" && typeof window !== "undefined" && "Notification" in window) {
      try {
        permission = await Notification.requestPermission();
        setNotifPerm(permission);
      } catch (e) {
        console.warn("Could not request notification permission in iframe sandbox:", e);
      }
    }

    if (permission === "granted" || (typeof Notification !== "undefined" && Notification.permission === "granted")) {
      try {
        new Notification("Herd Facility Admin Alert", {
          body: "📢 PUSH OK: Interactive haptics & alerts successfully synced with system dashboard.",
          icon: "/favicon.ico"
        });
      } catch (e) {
        console.warn("Direct Notification constructor failed. Falling back to simulated modal alert.", e);
      }
    }

    // Create entry in simulated logs
    const newLog: PushLog = {
      id: Math.random().toString(36).substr(2, 9),
      title: "Farm Administrator Manual Dispatch",
      body: "📢 PUSH SYSTEM CHECK: Manual validation of background worker alerts successfully synced.",
      timestamp: new Date().toLocaleTimeString(),
      category: "system_test"
    };

    const updatedLogs = [newLog, ...pushLogs].slice(0, 15);
    setPushLogs(updatedLogs);
    localStorage.setItem("horsesense_push_simulated_logs", JSON.stringify(updatedLogs));
    
    triggerHaptic("success");
  };

  const handleClearPushLogs = () => {
    setPushLogs([]);
    localStorage.removeItem("horsesense_push_simulated_logs");
    triggerHaptic("warning");
  };

  // Test Custom AI Generation
  const handleTestAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPrompt.trim() || isAiLoading) return;

    setIsAiLoading(true);
    setTestResponse("");
    triggerHaptic("tap");

    try {
      const res = await fetch("/api/horsesense-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: testPrompt,
          history: [],
          currentUser,
          horses: [],
          logs: [],
          customModel: model,
          customTemperature: temperature,
          customSystemInstruction: systemInstruction
        })
      });

      const data = await res.json();
      if (data.text) {
        setTestResponse(data.text);
        triggerHaptic("success");
      } else {
        setTestResponse("Nova AI returned an empty response. Please check network connectivity.");
        triggerHaptic("warning");
      }
    } catch (err) {
      console.error("Test AI error:", err);
      setTestResponse("Failed to communicate with Nova AI endpoint.");
      triggerHaptic("error");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-8" id="ai-settings-root">
      
      {/* Page Title & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div className="text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full tracking-wider border border-teal-200/30">
              System Control Console
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-2 font-logo">
            <Settings2 size={24} className="text-teal-600" /> Nova AI &amp; Alerts Config
          </h1>
          <p className="text-xs text-stone-500 font-semibold mt-0.5">
            Optimize Nova AI model parameters, push notification dispatch queues, and vibration haptic responses.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-stone-250 hover:border-stone-400 bg-white hover:bg-stone-50 text-stone-600 hover:text-stone-900 font-black text-xxs uppercase tracking-wider transition-all cursor-pointer shadow-4xs"
          >
            <RotateCcw size={13} />
            Reset Defaults
          </button>
          
          <button
            onClick={handleSaveSettings}
            className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-black text-xxs uppercase tracking-widest transition-all cursor-pointer shadow-xs ${
              saveStatus === "saved"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-teal-600 hover:bg-teal-700 text-white"
            }`}
          >
            {saveStatus === "saved" ? (
              <>
                <CheckCircle size={13} />
                Changes Saved!
              </>
            ) : (
              <>
                <Save size={13} />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {saveStatus === "saved" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2 text-xs font-semibold"
          >
            <CheckCircle size={18} className="text-emerald-600 shrink-0" />
            <span>Success: Global Nova AI settings, push notifications, and device haptic arrays updated successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Config Panels */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Card 1: Nova AI Settings */}
          <section className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-6 text-left">
            <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="font-black text-sm text-stone-900 uppercase tracking-wider">Nova AI Model Architecture</h3>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">Control neural parameters, temperature, and farm prompt guidelines</p>
              </div>
            </div>

            <div className="space-y-4">
              
              {/* Model Choice */}
              <div>
                <label className="block text-xxs font-black text-stone-400 uppercase tracking-widest mb-1.5">
                  AI Model Engine
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-250 text-stone-900 font-extrabold text-xs rounded-xl p-3 focus:outline-hidden focus:border-teal-600"
                >
                  <option value="nova-3.5-flash">Nova 3.5 Flash (Ultra-Fast Response &amp; Recommended for Herds)</option>
                  <option value="nova-pro">Nova Pro (Maximum Reasoning &amp; Complex Pedigree Diagnostic)</option>
                  <option value="nova-lite">Nova Lite (Low Power &amp; Low Bandwidth Mode)</option>
                </select>
                <span className="text-[9px] text-stone-400 font-medium mt-1 block">
                  Configured with automated fallbacks to ensure zero interruption during field paddock inspections.
                </span>
              </div>

              {/* Temperature Slider */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xxs font-black text-stone-400 uppercase tracking-widest">
                    Response Creativity (Temperature): {temperature}
                  </label>
                  <span className="text-xxs font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                    {temperature <= 0.3 ? "Strict & Deterministic" : temperature <= 0.7 ? "Balanced & Practical" : "Creative & Exploratory"}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                />
                <div className="flex justify-between text-[9px] text-stone-400 font-bold mt-1">
                  <span>0.0 (Strict Facts)</span>
                  <span>0.5 (Standard)</span>
                  <span>1.0 (High Creativity)</span>
                </div>
              </div>

              {/* System Instruction */}
              <div>
                <label className="block text-xxs font-black text-stone-400 uppercase tracking-widest mb-1.5">
                  Global System Directives
                </label>
                <textarea
                  rows={4}
                  value={systemInstruction}
                  onChange={(e) => setSystemInstruction(e.target.value)}
                  placeholder="Enter system prompt instruction..."
                  className="w-full bg-stone-50 border border-stone-250 text-stone-900 font-medium text-xs rounded-xl p-3 focus:outline-hidden focus:border-teal-600 leading-relaxed resize-none"
                />
                <span className="text-[9px] text-stone-400 font-medium mt-1 block">
                  Defines the core personality, clinical tone, and emergency triage instructions for Nova AI.
                </span>
              </div>

            </div>
          </section>

          {/* Card 2: Push Notifications Dispatch */}
          <section className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-6 text-left">
            <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <BellRing size={20} />
              </div>
              <div>
                <h3 className="font-black text-sm text-stone-900 uppercase tracking-wider">Push Notification Dispatch</h3>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">Real-time alerts for health checks, logins, and veterinarian updates</p>
              </div>
            </div>

            {/* Master Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-stone-50 border border-stone-200 rounded-2xl">
              <div>
                <span className="text-xs font-black text-stone-900 uppercase tracking-wide block">Push Delivery Service</span>
                <span className="text-[10px] text-stone-500 font-medium mt-0.5 block leading-normal">
                  Enable device alert banners for critical herd health events and task schedules.
                </span>
              </div>
              <div 
                onClick={() => {
                  setPushEnabled(!pushEnabled);
                  triggerHaptic("tap");
                }}
                className={`w-11 h-6 rounded-full p-0.5 cursor-pointer transition-all duration-200 ${
                  pushEnabled ? "bg-teal-600" : "bg-stone-250"
                }`}
              >
                <motion.div 
                  layout
                  className="w-5 h-5 bg-white rounded-full shadow-sm"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  animate={{ x: pushEnabled ? 20 : 0 }}
                />
              </div>
            </div>

            {/* Browser Permission State */}
            <div className="p-4 border border-stone-200 rounded-2xl space-y-2 bg-stone-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xxs font-black text-stone-500 uppercase tracking-wider">Browser Permission Level:</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                  notifPerm === "granted" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}>
                  {notifPerm}
                </span>
              </div>
              
              {notifPerm !== "granted" && (
                <button
                  type="button"
                  onClick={handleRequestPushPerm}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xxs uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs mt-2"
                >
                  Request Push Notification Permission
                </button>
              )}
            </div>

            {/* Notification Categories */}
            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Trigger Categories</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Shoeing */}
                <label className="flex items-start gap-3 p-3.5 border border-stone-200/85 rounded-2xl hover:bg-stone-50/50 cursor-pointer select-none transition-all">
                  <input
                    type="checkbox"
                    checked={categories.shoeing_due}
                    onChange={() => {
                      setCategories(prev => ({ ...prev, shoeing_due: !prev.shoeing_due }));
                      triggerHaptic("tap");
                    }}
                    className="mt-0.5 rounded text-teal-600 focus:ring-teal-600 h-4 w-4 cursor-pointer accent-teal-600"
                  />
                  <div>
                    <span className="text-xxs font-black text-stone-900 uppercase tracking-wider block">Shoeing Overdue Warnings</span>
                    <span className="text-[9px] text-stone-400 font-medium leading-normal mt-0.5 block">Alert staff when horses pass scheduled 6-week shoeing sessions.</span>
                  </div>
                </label>

                {/* 2. Vet */}
                <label className="flex items-start gap-3 p-3.5 border border-stone-200/85 rounded-2xl hover:bg-stone-50/50 cursor-pointer select-none transition-all">
                  <input
                    type="checkbox"
                    checked={categories.vet_due}
                    onChange={() => {
                      setCategories(prev => ({ ...prev, vet_due: !prev.vet_due }));
                      triggerHaptic("tap");
                    }}
                    className="mt-0.5 rounded text-teal-600 focus:ring-teal-600 h-4 w-4 cursor-pointer accent-teal-600"
                  />
                  <div>
                    <span className="text-xxs font-black text-stone-900 uppercase tracking-wider block">Veterinary Due Appointments</span>
                    <span className="text-[9px] text-stone-400 font-medium leading-normal mt-0.5 block">Trigger push warnings for physicals, vaccine boosters, or health alerts.</span>
                  </div>
                </label>

                {/* 3. Logins */}
                <label className="flex items-start gap-3 p-3.5 border border-stone-200/85 rounded-2xl hover:bg-stone-50/50 cursor-pointer select-none transition-all">
                  <input
                    type="checkbox"
                    checked={categories.login_activity}
                    onChange={() => {
                      setCategories(prev => ({ ...prev, login_activity: !prev.login_activity }));
                      triggerHaptic("tap");
                    }}
                    className="mt-0.5 rounded text-teal-600 focus:ring-teal-600 h-4 w-4 cursor-pointer accent-teal-600"
                  />
                  <div>
                    <span className="text-xxs font-black text-stone-900 uppercase tracking-wider block">Security Admin Login Activity</span>
                    <span className="text-[9px] text-stone-400 font-medium leading-normal mt-0.5 block">Notify the IT administrator of system access requests or role changes.</span>
                  </div>
                </label>

                {/* 4. Chat Alerts */}
                <label className="flex items-start gap-3 p-3.5 border border-stone-200/85 rounded-2xl hover:bg-stone-50/50 cursor-pointer select-none transition-all">
                  <input
                    type="checkbox"
                    checked={categories.chat_alerts}
                    onChange={() => {
                      setCategories(prev => ({ ...prev, chat_alerts: !prev.chat_alerts }));
                      triggerHaptic("tap");
                    }}
                    className="mt-0.5 rounded text-teal-600 focus:ring-teal-600 h-4 w-4 cursor-pointer accent-teal-600"
                  />
                  <div>
                    <span className="text-xxs font-black text-stone-900 uppercase tracking-wider block">Team Messaging Mentions</span>
                    <span className="text-[9px] text-stone-400 font-medium leading-normal mt-0.5 block">Dispatch real-time notification alerts when crew members are tagged.</span>
                  </div>
                </label>

              </div>
            </div>
          </section>

          {/* Card 3: Vibration Haptics Controller */}
          <section className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-6 text-left">
            <div className="flex items-center gap-3 border-b border-stone-100 pb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <Smartphone size={20} />
              </div>
              <div>
                <h3 className="font-black text-sm text-stone-900 uppercase tracking-wider">Vibration Haptics Controller</h3>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">Adjust tactile cues on mobile and tablet devices</p>
              </div>
            </div>

            {/* Master Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-stone-50 border border-stone-200 rounded-2xl">
              <div>
                <span className="text-xs font-black text-stone-900 uppercase tracking-wide block">Tactile Vibration Feedback</span>
                <span className="text-[10px] text-stone-500 font-medium mt-0.5 block leading-normal">
                  Provide physical buzz triggers during barcode scans, audits, error validations, or system saves.
                </span>
              </div>
              <div 
                onClick={() => {
                  setHapticsEnabled(!hapticsEnabled);
                  triggerHaptic("tap");
                }}
                className={`w-11 h-6 rounded-full p-0.5 cursor-pointer transition-all duration-200 ${
                  hapticsEnabled ? "bg-teal-600" : "bg-stone-250"
                }`}
              >
                <motion.div 
                  layout
                  className="w-5 h-5 bg-white rounded-full shadow-sm"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  animate={{ x: hapticsEnabled ? 20 : 0 }}
                />
              </div>
            </div>

            {/* Test Pattern Section */}
            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Interactive Vibrator Pattern Sandbox</span>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 p-4 border border-stone-200 rounded-2xl bg-stone-50/20">
                <div className="flex-1 flex flex-wrap gap-2">
                  {[
                    { id: "tap", label: "Single Tap (15ms)", style: "border-stone-200 text-stone-700 bg-white" },
                    { id: "success", label: "Double Success (50-30-50ms)", style: "border-emerald-250 text-emerald-800 bg-emerald-50/10" },
                    { id: "warning", label: "Warning Buzz (75ms)", style: "border-amber-250 text-amber-800 bg-amber-50/10" },
                    { id: "error", label: "Emergency Rumble (150-50-150ms)", style: "border-rose-250 text-rose-800 bg-rose-50/10" }
                  ].map((pat) => (
                    <button
                      key={pat.id}
                      onClick={() => {
                        setTestHapticPattern(pat.id as any);
                        triggerHaptic("tap");
                      }}
                      className={`px-3 py-2 text-xxs font-black uppercase tracking-wider rounded-xl border transition-all cursor-pointer ${
                        testHapticPattern === pat.id 
                          ? "ring-2 ring-teal-600 bg-teal-50 border-teal-300 text-teal-800" 
                          : pat.style
                      }`}
                    >
                      {pat.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={handleTestHaptic}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xxs uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                  >
                    <Play size={11} fill="white" />
                    Test Pattern
                  </button>

                  <AnimatePresence>
                    {isVibrating && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        className="w-7 h-7 bg-teal-50 border border-teal-200 text-teal-600 rounded-full flex items-center justify-center shadow-4xs animate-ping"
                      >
                        <Waves size={13} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Right 1 Column: Interactive Simulators / Live Outputs */}
        <div className="space-y-8">
          
          {/* Panel 1: Live AI settings sandbox */}
          <section className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4 text-left flex flex-col min-h-[300px]">
            <div className="flex items-center gap-3 border-b border-stone-100 pb-4 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <Zap size={16} />
              </div>
              <div>
                <h4 className="font-black text-xs text-stone-900 uppercase tracking-wide">Live Nova AI Sandbox</h4>
                <p className="text-[9px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">Test configured model prompt rules in real-time</p>
              </div>
            </div>

            {/* Test prompt form */}
            <form onSubmit={handleTestAi} className="space-y-3 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  placeholder="e.g., Calculate feed ration for 520kg gelding..."
                  className="w-full bg-stone-50 border border-stone-250 text-stone-900 text-xs rounded-xl p-3 pr-10 focus:outline-hidden focus:border-teal-600 font-medium"
                />
                <button
                  type="submit"
                  disabled={isAiLoading || !testPrompt.trim()}
                  className="absolute right-2 top-2 p-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Send size={13} />
                </button>
              </div>
            </form>

            {/* Response Area */}
            <div className="flex-1 bg-stone-50 border border-stone-200/80 rounded-2xl p-4 overflow-y-auto max-h-[260px] text-left text-xs text-stone-700 leading-relaxed font-medium space-y-2">
              {isAiLoading ? (
                <div className="flex items-center gap-2 text-stone-400 py-4 justify-center">
                  <RefreshCw size={14} className="animate-spin text-teal-600" />
                  <span className="font-bold text-xxs uppercase tracking-wider">Generating Nova AI Response...</span>
                </div>
              ) : testResponse ? (
                <div className="space-y-2">
                  <span className="text-[9px] font-black text-teal-600 uppercase tracking-widest block">Output:</span>
                  <p className="whitespace-pre-wrap">{testResponse}</p>
                </div>
              ) : (
                <div className="text-center py-6 text-stone-400 space-y-1">
                  <Sparkles size={20} className="mx-auto text-stone-300" />
                  <p className="text-[10px] font-semibold">Enter a prompt above to preview real-time Nova AI responses.</p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSimulatePush}
              className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-extrabold text-xxs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-stone-250 shrink-0"
            >
              <BellRing size={13} className="text-teal-600" />
              Dispatch Test Push Alert
            </button>
          </section>

          {/* Panel 2: Simulated Push Dispatch Console */}
          <section className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4 text-left">
            <div className="flex items-center gap-3 border-b border-stone-100 pb-4 flex-wrap justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                  <BellRing size={16} />
                </div>
                <div>
                  <h4 className="font-black text-xs text-stone-900 uppercase tracking-wide">Push Alerts Dispatch Log</h4>
                  <p className="text-[9px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">Real-time notification payloads</p>
                </div>
              </div>
              
              {pushLogs.length > 0 && (
                <button
                  onClick={handleClearPushLogs}
                  className="text-[9px] font-black text-rose-600 hover:text-rose-800 uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Clear Logs
                </button>
              )}
            </div>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {pushLogs.length === 0 ? (
                <div className="p-4 border border-dashed border-stone-200 rounded-2xl text-center space-y-2">
                  <Info size={18} className="text-stone-300 mx-auto" />
                  <p className="text-[10px] text-stone-400 font-medium italic">No push alert tokens received in this session. Click "Dispatch Test Alert" or perform system actions.</p>
                </div>
              ) : (
                pushLogs.map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-3 border border-stone-200 rounded-2xl bg-stone-50/40 text-left space-y-1.5 text-xxs font-medium leading-normal relative overflow-hidden"
                  >
                    <div className="flex justify-between items-center text-[8px] font-black tracking-widest uppercase">
                      <span className="text-teal-600 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-150/20">{log.category}</span>
                      <span className="text-stone-400">{log.timestamp}</span>
                    </div>
                    <div className="text-stone-900 font-extrabold pr-4 text-xxs">{log.title}</div>
                    <div className="text-stone-500 font-semibold leading-relaxed text-[10px]">{log.body}</div>
                  </motion.div>
                ))
              )}
            </div>
          </section>

        </div>

      </div>

    </div>
  );
}
