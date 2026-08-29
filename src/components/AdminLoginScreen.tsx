import React, { useState } from "react";
import { Shield, Key, Eye, EyeOff, AlertCircle, ArrowLeft, Check, Lock, ShieldCheck } from "lucide-react";
import { SystemUser, UserRole } from "../types";

interface AdminLoginScreenProps {
  onLoginSuccess: (user: SystemUser) => void;
  onBackToHome: () => void;
}

export default function AdminLoginScreen({ onLoginSuccess, onBackToHome }: AdminLoginScreenProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pinInput, setPinInput] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanVal = pinInput.trim();

    if (!cleanVal) {
      setError("Please enter the verification code for this stage.");
      return;
    }

    if (step === 1) {
      if (cleanVal === "2013") {
        setStep(2);
        setPinInput("");
        setError(null);
      } else {
        setError("Stage 1 Verification Failed: Incorrect User PIN.");
      }
    } else if (step === 2) {
      if (cleanVal === "8357") {
        setStep(3);
        setPinInput("");
        setError(null);
      } else {
        setError("Stage 2 Verification Failed: Incorrect Secondary Override Code.");
      }
    } else if (step === 3) {
      if (cleanVal === "Cdog2013#") {
        setIsVerifying(true);
        try {
          const { doc, getDoc } = await import("firebase/firestore");
          const { db } = await import("../firebase");

          const cooperRef = doc(db, "crew_profiles", "System Administrator");
          const cooperSnap = await getDoc(cooperRef);
          let cooperUser: SystemUser = {
            name: "System Administrator",
            pin: "2013",
            role: "owner" as UserRole,
            avatarColor: "bg-teal-500/10 text-teal-800 border-teal-500/20",
            title: "Head of IT Administration / Owner"
          };
          if (cooperSnap.exists()) {
            cooperUser = { ...cooperUser, ...(cooperSnap.data() as SystemUser) };
          }
          onLoginSuccess(cooperUser);
        } catch (err) {
          console.error("Admin verification error:", err);
          onLoginSuccess({
            name: "System Administrator",
            pin: "2013",
            role: "owner" as UserRole,
            avatarColor: "bg-teal-500/10 text-teal-800 border-teal-500/20",
            title: "Head of IT Administration / Owner"
          });
        }
      } else {
        setError("Stage 3 Verification Failed: Incorrect Master Security Key.");
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-950 flex flex-col items-center justify-center text-center p-6 z-50 overflow-y-auto font-sans select-none">
      <div className="max-w-md w-full bg-stone-900 border border-stone-800 p-8 rounded-3xl space-y-6 shadow-2xl text-left relative overflow-hidden">
        {/* Subtle accent glow */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center space-x-3 pb-4 border-b border-stone-800">
          <div className="p-3 bg-teal-950/80 border border-teal-700/60 rounded-2xl text-teal-400 shrink-0">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-wide uppercase font-logo">
              Owner Admin Gateway
            </h2>
            <p className="text-[10px] font-mono text-teal-400 font-bold uppercase tracking-widest mt-0.5">
              3-Stage Multi-Factor Security Verification
            </p>
          </div>
        </div>

        {/* Step Progress Indicators */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { stage: 1, label: "User PIN" },
            { stage: 2, label: "Override Code" },
            { stage: 3, label: "Master Key" },
          ].map((s) => {
            const isCompleted = step > s.stage;
            const isCurrent = step === s.stage;
            return (
              <div
                key={s.stage}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                  isCompleted
                    ? "bg-emerald-950/60 border-emerald-800 text-emerald-400"
                    : isCurrent
                    ? "bg-teal-950/80 border-teal-500 text-teal-300 ring-1 ring-teal-500/50"
                    : "bg-stone-950/50 border-stone-850 text-stone-600"
                }`}
              >
                <div className="flex items-center gap-1">
                  {isCompleted ? (
                    <Check size={12} className="text-emerald-400 stroke-[3]" />
                  ) : (
                    <Lock size={11} className={isCurrent ? "text-teal-400" : "text-stone-600"} />
                  )}
                  <span className="text-[9px] font-black uppercase tracking-wider">
                    Stage {s.stage}
                  </span>
                </div>
                <span className="text-[10px] font-bold truncate max-w-full">
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Informational Stage Banner */}
        <div className="p-3.5 bg-stone-950 border border-stone-800 rounded-2xl space-y-1">
          <div className="flex items-center space-x-2 text-teal-400">
            <Key size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              {step === 1 && "Stage 1 / 3: Primary User Verification PIN"}
              {step === 2 && "Stage 2 / 3: Secondary Override Bypass Code"}
              {step === 3 && "Stage 3 / 3: Global Master Security Key"}
            </span>
          </div>
          <p className="text-[11px] text-stone-400 leading-relaxed font-medium">
            {step === 1 && "Enter your primary administrative employee PIN."}
            {step === 2 && "Enter the secondary administrative bypass override PIN."}
            {step === 3 && "Enter the master security key to unlock owner administration."}
          </p>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-900 rounded-xl text-[11px] text-rose-300 font-bold uppercase flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Verification Form */}
        <form onSubmit={handleStepSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] text-stone-400 font-black uppercase tracking-widest flex items-center justify-between">
              <span>
                {step === 1 && "Primary Employee PIN"}
                {step === 2 && "Secondary Bypass Code"}
                {step === 3 && "Master Security Key"}
              </span>
              <span className="text-teal-400 text-[9px] font-bold font-mono">
                Verification {step}/3
              </span>
            </label>
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                placeholder={
                  step === 1
                    ? "Enter 4-Digit Employee PIN"
                    : step === 2
                    ? "Enter Secondary Code"
                    : "Enter Master Key"
                }
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setError(null);
                }}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-xs font-mono font-bold text-teal-300 focus:outline-hidden focus:border-teal-500 transition-all placeholder:text-stone-700 pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 transition-colors cursor-pointer"
              >
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isVerifying}
            className="w-full py-3.5 bg-teal-600 hover:bg-teal-500 text-stone-950 font-mono text-xs uppercase tracking-wider font-black rounded-xl transition-all shadow-lg shadow-teal-950/40 cursor-pointer flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <span>Authenticating Owner Access...</span>
            ) : step === 3 ? (
              <>
                <ShieldCheck size={16} />
                <span>Authenticate &amp; Open Owner Panel</span>
              </>
            ) : (
              <span>Proceed to Stage {step + 1} →</span>
            )}
          </button>
        </form>

        {/* Back navigation */}
        <div className="pt-2 border-t border-stone-850 flex justify-between items-center text-xs">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setStep((step - 1) as 1 | 2);
                setPinInput("");
                setError(null);
              }}
              className="inline-flex items-center space-x-1.5 text-stone-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer py-1.5 px-3 rounded-lg hover:bg-stone-850"
            >
              <ArrowLeft size={13} />
              <span>Back to Stage {step - 1}</span>
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center space-x-1.5 text-stone-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer py-1.5 px-3 rounded-lg hover:bg-stone-850"
          >
            <ArrowLeft size={13} />
            <span>Return to Station Sign-In</span>
          </button>
        </div>
      </div>
    </div>
  );
}

