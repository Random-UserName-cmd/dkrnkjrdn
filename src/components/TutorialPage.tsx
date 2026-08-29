import React from "react";
import { BookOpen, Shield, HelpCircle, User, Users, Compass, Eye, CheckCircle, ArrowRight, Activity, Bell, Sparkles } from "lucide-react";

interface TutorialPageProps {
  currentUser: { name: string; role: string };
  onStart: () => void;
}

export default function TutorialPage({ currentUser, onStart }: TutorialPageProps) {
  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-xl overflow-hidden max-w-4xl mx-auto my-6" id="tutorial-page">
      {/* Decorative Top Bar */}
      <div className="bg-stone-900 text-stone-100 p-8 flex items-center justify-between relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-12 -translate-y-12">
          <BookOpen size={240} className="text-teal-400" />
        </div>
        <div className="relative z-10 space-y-2">
          <span className="text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-3 py-1 rounded-full font-black uppercase tracking-widest">
            Learning Hub
          </span>
          <h1 className="text-2xl font-black tracking-tight uppercase">Ruabon Farm System Guide</h1>
          <p className="text-xs text-stone-400 font-medium">Learn how to navigate, manage, and secure our complete herd operations.</p>
        </div>
        <div className="w-16 h-16 bg-stone-800 rounded-2xl flex items-center justify-center border border-stone-700 shadow-inner">
          <Compass className="text-teal-400 animate-spin-slow" size={32} />
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Intro */}
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 flex items-start gap-4">
          <div className="p-3 bg-teal-50 text-teal-700 rounded-xl border border-teal-100 shrink-0">
            <Activity size={20} />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-stone-900 text-sm">Hello, {currentUser.name}!</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Welcome to the customized portal. Based on your active security clearance status as an <strong className="text-teal-700 uppercase font-extrabold">{currentUser.role}</strong>, specific commands and dashboard layouts are tailored to your needs. Read your guide below to understand your responsibilities.
            </p>
          </div>
        </div>

        {/* Roles Breakdown Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 1. Owner Clearence */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-6 hover:shadow-md transition-all space-y-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center font-bold">
              <Shield size={18} />
            </div>
            <div className="space-y-1.5">
              <h4 className="font-black text-xs text-stone-900 uppercase tracking-wider">1. Owner Control Station</h4>
              <p className="text-xxs text-stone-500 font-bold uppercase tracking-widest text-red-600">Clearence Level: Cooper, Claire, Mark</p>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Holds total farm orchestration tools:
              </p>
              <ul className="text-[10px] text-stone-500 space-y-1 list-disc pl-4 font-medium">
                <li>Immediate Emergency System-Wide Shutdown Button.</li>
                <li>Pre-authorizing guests and managing custom visitor PINs.</li>
                <li>Audit access history trails and unban IPs / block appeals.</li>
              </ul>
            </div>
          </div>

          {/* 2. Employee Operations */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-6 hover:shadow-md transition-all space-y-4">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center font-bold">
              <Users size={18} />
            </div>
            <div className="space-y-1.5">
              <h4 className="font-black text-xs text-stone-900 uppercase tracking-wider">2. Crew Directory & Logs</h4>
              <p className="text-xxs text-stone-500 font-bold uppercase tracking-widest text-teal-600">Clearence Level: All Employees</p>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Tracks public herd health and checklists:
              </p>
              <ul className="text-[10px] text-stone-500 space-y-1 list-disc pl-4 font-medium">
                <li>Log daily paddock Checks and set Critical checklist priorities.</li>
                <li>Register Vet Care, Medications, and Shoeing requirements.</li>
                <li>Design, export, and scan digital employee QR credentials.</li>
              </ul>
            </div>
          </div>

          {/* 3. Pre-Authorized Visitor */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-6 hover:shadow-md transition-all space-y-4">
            <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-600 border border-stone-200 flex items-center justify-center font-bold">
              <User size={18} />
            </div>
            <div className="space-y-1.5">
              <h4 className="font-black text-xs text-stone-900 uppercase tracking-wider">3. Guest Access Port</h4>
              <p className="text-xxs text-stone-500 font-bold uppercase tracking-widest text-stone-500">Clearence Level: Authorized Visitors</p>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Controlled view matching strict permissions:
              </p>
              <ul className="text-[10px] text-stone-500 space-y-1 list-disc pl-4 font-medium">
                <li>Restricted to hours/paddocks explicitly allowed by owners.</li>
                <li>Ability to log checks or maintenance ONLY when pre-approved.</li>
                <li>Rotation-safe security PIN expiring or updating weekly.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Security & System Features */}
        <div className="border-t border-stone-100 pt-6 space-y-4">
          <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest">Key Features & Security Controls</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex gap-3 items-start p-3 hover:bg-stone-50 rounded-xl transition-all">
              <Bell className="text-teal-600 shrink-0 mt-0.5" size={15} />
              <div className="space-y-0.5">
                <span className="block text-xs font-bold text-stone-800">Dismiss & Session Reset Notifications</span>
                <span className="block text-[10px] text-stone-500 font-medium">
                  Tick-dismiss general alerts, or click Terminate (X) to instantly sign out suspicious sessions remotely.
                </span>
              </div>
            </div>

            <div className="flex gap-3 items-start p-3 hover:bg-stone-50 rounded-xl transition-all">
              <Shield className="text-rose-500 shrink-0 mt-0.5" size={15} />
              <div className="space-y-0.5">
                <span className="block text-xs font-bold text-stone-800">Double Passkey Authentication Gating</span>
                <span className="block text-[10px] text-stone-500 font-medium">
                  Admins re-authenticate using their PIN whenever navigating back to Owner Station or Access Requests tabs.
                </span>
              </div>
            </div>

            <div className="flex gap-3 items-start p-3 hover:bg-stone-50 rounded-xl transition-all">
              <Sparkles className="text-amber-500 shrink-0 mt-0.5" size={15} />
              <div className="space-y-0.5">
                <span className="block text-xs font-bold text-stone-800">Nova Herd AI (Gemini 2.5 Flash)</span>
                <span className="block text-[10px] text-stone-500 font-medium">
                  Ask wellness, farrier, or financial ledger questions. Authorized staff can issue verbal IP bans or profile security audits.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-4 border-t border-stone-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onStart}
            className="px-6 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl cursor-pointer transition-all flex items-center gap-2 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
            id="tutorial-get-started-btn"
          >
            Let's Get Started <ArrowRight size={14} className="animate-pulse" />
          </button>
        </div>
      </div>
    </div>
  );
}
