import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { SystemUser, UserRole } from "../types";
import { 
  ShieldAlert, ShieldCheck, Key, UserPlus, FileText, Clock, Users,
  CheckCircle, XCircle, AlertCircle, Trash2, Send, ShieldX, HelpCircle, UserCheck
} from "lucide-react";
import LoginHistory from "./LoginHistory";
import AccessRequestsManager from "./AccessRequestsManager";

interface AdminStationProps {
  currentUser: SystemUser | null;
  clientIp?: string;
}

interface BanRequest {
  id: string;
  target: string;
  type: "name" | "ip";
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
}

interface VisitorProfile {
  id: string;
  name: string;
  pin: string;
  role: string;
  title?: string;
  isAgistorRider?: boolean;
  canLogDailyChecks?: boolean;
  canLogMaintenance?: boolean;
  isActive?: boolean;
}

export default function AdminStation({ currentUser, clientIp = "192.168.1.1" }: AdminStationProps) {
  const [activeTab, setActiveTab] = useState<"requests" | "ban_request" | "visit_agistor" | "user_creation" | "ts_cs" | "login_history">("requests");

  // State lists
  const [banRequests, setBanRequests] = useState<BanRequest[]>([]);
  const [visitors, setVisitors] = useState<VisitorProfile[]>([]);
  const [tosAcceptances, setTosAcceptances] = useState<any[]>([]);

  // Form states - Ban Request
  const [banTarget, setBanTarget] = useState("");
  const [banType, setBanType] = useState<"name" | "ip">("name");
  const [banReason, setBanReason] = useState("");
  const [banMsg, setBanMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form states - User Creation
  const [newUserName, setNewUserName] = useState("");
  const [newUserPin, setNewUserPin] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("user");
  const [newUserTitle, setNewUserTitle] = useState("");
  const [userMsg, setUserMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Loading states
  const [loading, setLoading] = useState(true);

  // 1. Subscribe to Ban Requests
  useEffect(() => {
    const q = query(collection(db, "ban_requests"), orderBy("requestedAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const list: BanRequest[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as BanRequest);
      });
      setBanRequests(list);
    });
  }, []);

  // 2. Subscribe to Visitors (isolated by farm)
  useEffect(() => {
    const curFarm = (currentUser?.farmName || "").toLowerCase().trim();
    const curFarmId = (currentUser?.farmId || curFarm.replace(/[^a-z0-9]+/g, "_")).toLowerCase().trim();
    const isRuabon = !curFarm || curFarm.includes("ruabon") || curFarm.includes("nova herd");

    return onSnapshot(collection(db, "visitor_permissions"), (snapshot) => {
      const list: VisitorProfile[] = [];
      snapshot.forEach((docSnap) => {
        const v = { id: docSnap.id, ...docSnap.data() } as VisitorProfile;
        const vFarm = (((v as any).farmName || "") as string).toLowerCase().trim();
        const vFarmId = (((v as any).farmId || "") as string).toLowerCase().trim();
        const userIsExplicitlyThisFarm = (vFarm && vFarm === curFarm) || (vFarmId && vFarmId === curFarmId);

        if (isRuabon) {
          if (userIsExplicitlyThisFarm) {
            list.push(v);
          } else if (!vFarm && !vFarmId) {
            list.push(v);
          } else if (vFarm.includes("ruabon") || vFarm.includes("nova herd") || vFarmId === "ruabon_farm") {
            list.push(v);
          }
        } else {
          if (userIsExplicitlyThisFarm) {
            list.push(v);
          }
        }
      });
      setVisitors(list);
    });
  }, [currentUser]);

  // 3. Subscribe to TOS Acceptances
  useEffect(() => {
    const q = query(collection(db, "tos_acceptances"), orderBy("acceptedAt", "desc"));
    return onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setTosAcceptances(list);
      setLoading(false);
    });
  }, []);

  // Handle Ban Request Submission
  const handleRequestBan = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanMsg(null);

    const targetClean = banTarget.trim();
    const reasonClean = banReason.trim();

    if (!targetClean || !reasonClean) {
      setBanMsg({ type: "error", text: "Please provide both the ban target and a solid reason." });
      return;
    }

    try {
      await addDoc(collection(db, "ban_requests"), {
        target: targetClean,
        type: banType,
        reason: reasonClean,
        requestedBy: currentUser?.name || "Admin",
        requestedAt: new Date().toISOString(),
        status: "pending"
      });

      setBanTarget("");
      setBanReason("");
      setBanMsg({ type: "success", text: "Ban request successfully dispatched to Owners for approval." });
    } catch (err) {
      console.error(err);
      setBanMsg({ type: "error", text: "Database connection failed. Please try again." });
    }
  };

  // Handle User Profile Creation
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserMsg(null);

    const nameClean = newUserName.trim();
    const pinClean = newUserPin.trim();
    const titleClean = newUserTitle.trim();

    if (!nameClean || !pinClean || !titleClean) {
      setUserMsg({ type: "error", text: "All fields are required to establish a crew profile." });
      return;
    }

    if (!/^\d{4}$/.test(pinClean)) {
      setUserMsg({ type: "error", text: "Security PIN must be exactly 4 numeric digits." });
      return;
    }

    try {
      // Create user avatar color randomly from standard preset options
      const colors = [
        "bg-teal-500/10 text-teal-800 border-teal-500/20",
        "bg-sky-500/10 text-sky-800 border-sky-500/20",
        "bg-amber-500/10 text-amber-800 border-amber-500/20",
        "bg-rose-500/10 text-rose-800 border-rose-500/20",
        "bg-indigo-500/10 text-indigo-800 border-indigo-500/20",
        "bg-emerald-500/10 text-emerald-800 border-emerald-500/20"
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      await setDoc(doc(db, "crew_profiles", nameClean), {
        name: nameClean,
        pin: pinClean,
        role: newUserRole,
        title: titleClean,
        avatarColor: randomColor,
        hasCustomPin: true,
        passwordLastChanged: new Date().toISOString(),
        farmName: currentUser?.farmName || "Ruabon Farm & Herd Center",
        farmId: currentUser?.farmId || (currentUser?.farmName ? currentUser.farmName.toLowerCase().replace(/[^a-z0-9]+/g, "_") : "ruabon_farm"),
      });

      setNewUserName("");
      setNewUserPin("");
      setNewUserTitle("");
      setUserMsg({ type: "success", text: `Crew profile for ${nameClean} successfully initialized.` });
    } catch (err) {
      console.error(err);
      setUserMsg({ type: "error", text: "Database connection failed. Please try again." });
    }
  };

  // Toggle Visitor Agistor & Permission Flags
  const handleToggleVisitorFlag = async (visitorId: string, field: keyof VisitorProfile, val: boolean) => {
    try {
      await updateDoc(doc(db, "visitor_permissions", visitorId), {
        [field]: val
      });
    } catch (err) {
      console.error("Failed to update visitor permission:", err);
      alert("Failed to update visitor privilege.");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" id="admin-station-panel">
      {/* Station Title Banner */}
      <div className="bg-stone-900 text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border border-stone-850 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="flex items-center gap-4 relative z-10">
          <div className="p-3 bg-teal-650 text-white rounded-2xl border border-teal-500 animate-pulse">
            <ShieldAlert size={26} />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-widest font-logo text-stone-50">
              Wright Farm Admin Station
            </h1>
            <p className="text-xxs font-extrabold text-teal-400 uppercase tracking-widest mt-1">
              Secondary Security Control Gate // Authorized Personnel: {currentUser?.name || "Administrator"}
            </p>
          </div>
        </div>

        {/* Tab Selector Buttons */}
        <div className="flex flex-wrap gap-2 relative z-10 w-full md:w-auto">
          {[
            { id: "requests", label: "Access Requests", icon: ShieldCheck },
            { id: "ban_request", label: "Request Ban", icon: ShieldX },
            { id: "visit_agistor", label: "Visit / Agistor Tracker", icon: UserCheck },
            { id: "user_creation", label: "Create Profile", icon: UserPlus },
            { id: "ts_cs", label: "Terms Acceptances", icon: FileText },
            { id: "login_history", label: "Audit Log", icon: Clock }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xxs font-black uppercase tracking-wider border cursor-pointer transition-all ${
                  isActive 
                    ? "bg-teal-600 border-teal-500 text-white shadow-md font-extrabold" 
                    : "bg-stone-800/80 border-stone-700 text-stone-300 hover:bg-stone-800"
                }`}
              >
                <Icon size={12} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Subsections */}
      <div className="transition-all duration-300">
        {activeTab === "requests" && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-2">
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">Active Guest Access Authorization</h3>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Review, approve, or decline clinical records sharing requests from public visitor terminals. You may notify Farm Administration directly if a priority decision is required.</p>
            </div>
            <AccessRequestsManager isAdmin={true} />
          </div>
        )}

        {activeTab === "ban_request" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in text-left">
            {/* Left form */}
            <div className="lg:col-span-1 bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-5 h-fit">
              <div>
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">
                  File Ban Request
                </h3>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1">
                  Admins can draft name or IP bans to submit to Owners for final clearance
                </p>
              </div>

              {banMsg && (
                <div className={`p-3.5 rounded-xl border font-bold text-[10px] uppercase flex items-center gap-2 ${
                  banMsg.type === "success" 
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}>
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{banMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleRequestBan} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-stone-500 font-black uppercase tracking-wider">Ban Target Type</label>
                  <select
                    value={banType}
                    onChange={(e) => setBanType(e.target.value as "name" | "ip")}
                    className="w-full border border-stone-200 bg-stone-50 rounded-xl p-2.5 text-xs font-bold uppercase tracking-wide focus:ring-1 focus:ring-teal-600 focus:bg-white"
                  >
                    <option value="name">Guest Name</option>
                    <option value="ip">IP Address</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-stone-500 font-black uppercase tracking-wider">
                    {banType === "name" ? "Target Full Name" : "Target IP Address"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={banType === "name" ? "E.g. Samuel Patterson" : "E.g. 192.168.1.10"}
                    value={banTarget}
                    onChange={(e) => setBanTarget(e.target.value)}
                    className="w-full border border-stone-200 bg-stone-50 rounded-xl p-2.5 text-xs font-semibold focus:ring-1 focus:ring-teal-600 focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-stone-500 font-black uppercase tracking-wider font-mono">Justification Reason</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Provide specific reason for the ban request (required)..."
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    className="w-full border border-stone-200 bg-stone-50 rounded-xl p-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600 focus:bg-white"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-black text-xxs uppercase tracking-wider rounded-xl cursor-pointer shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <Send size={12} />
                  Dispatch Request
                </button>
              </form>
            </div>

            {/* Right List of Requests */}
            <div className="lg:col-span-2 bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
              <h3 className="text-xs font-black text-stone-850 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldAlert size={14} className="text-amber-600" />
                Submitted Ban Requests Queue ({banRequests.length})
              </h3>

              {banRequests.length === 0 ? (
                <div className="text-center py-12 text-stone-400 font-medium text-xs">
                  No ban requests have been submitted yet.
                </div>
              ) : (
                <div className="divide-y divide-stone-100 max-h-[500px] overflow-y-auto pr-2 space-y-3">
                  {banRequests.map((req) => (
                    <div key={req.id} className="p-4 bg-stone-50/50 rounded-2xl border border-stone-150 space-y-3">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div>
                          <span className="text-xs font-black text-stone-900 block uppercase">
                            {req.target}
                          </span>
                          <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-0.5 block">
                            Type: {req.type === "name" ? "Name Ban" : "IP Ban"} // Requested by: {req.requestedBy}
                          </span>
                        </div>
                        <span className={`text-[8px] font-black uppercase px-2.5 py-1 rounded-full border ${
                          req.status === "pending" 
                            ? "bg-amber-50 border-amber-200 text-amber-700"
                            : req.status === "approved"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-stone-150 border-stone-250 text-stone-500"
                        }`}>
                          {req.status}
                        </span>
                      </div>

                      <p className="text-xs text-stone-650 bg-white p-3 rounded-xl border border-stone-150 font-medium leading-relaxed">
                        Reason: {req.reason}
                      </p>

                      <div className="text-[9px] text-stone-400 font-semibold text-right">
                        Submitted: {new Date(req.requestedAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "visit_agistor" && (
          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-5 animate-fade-in text-left">
            <div>
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">
                Visitor &amp; Agistor Tracker
              </h3>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1">
                Configure guest roles, agistor status, and set daily checks or logging authorities
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-stone-750">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-400 font-extrabold uppercase tracking-widest text-[9px] text-left">
                    <th className="py-3 px-4">Visitor Name</th>
                    <th className="py-3 px-4">Operator Title</th>
                    <th className="py-3 px-4">Paddocks</th>
                    <th className="py-3 px-4 text-center">Is Agistor / Rider</th>
                    <th className="py-3 px-4 text-center">Log Daily Checks</th>
                    <th className="py-3 px-4 text-center">Log Maintenance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-medium">
                  {visitors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-stone-400">
                        No registered visitor profiles in database.
                      </td>
                    </tr>
                  ) : (
                    visitors.map((v) => (
                      <tr key={v.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-stone-900 uppercase">{v.name}</td>
                        <td className="py-3.5 px-4 text-stone-500 font-semibold">{v.title || "Farm Guest"}</td>
                        <td className="py-3.5 px-4">
                          <span className="text-[9px] font-black uppercase bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                            Paddocks Allowed
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={!!v.isAgistorRider}
                            onChange={(e) => handleToggleVisitorFlag(v.id, "isAgistorRider", e.target.checked)}
                            className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-stone-300"
                          />
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={!!v.canLogDailyChecks}
                            onChange={(e) => handleToggleVisitorFlag(v.id, "canLogDailyChecks", e.target.checked)}
                            className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-stone-300"
                          />
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={!!v.canLogMaintenance}
                            onChange={(e) => handleToggleVisitorFlag(v.id, "canLogMaintenance", e.target.checked)}
                            className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-stone-300"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "user_creation" && (
          <div className="max-w-md mx-auto bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-5 animate-fade-in text-left">
            <div>
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">
                Create System Profile
              </h3>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1">
                Provision new operational staff or instructors on Wright Farm databases
              </p>
            </div>

            {userMsg && (
              <div className={`p-3 rounded-xl border font-bold text-[10px] uppercase flex items-center gap-2 ${
                userMsg.type === "success" 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}>
                <AlertCircle size={14} className="shrink-0" />
                <span>{userMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-stone-500 font-black uppercase tracking-wider">Operator Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="E.g. David Ross"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full border border-stone-200 bg-stone-50 rounded-xl p-2.5 text-xs font-semibold focus:ring-1 focus:ring-teal-600 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-stone-500 font-black uppercase tracking-wider">System Role</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full border border-stone-200 bg-stone-50 rounded-xl p-2.5 text-xs font-bold uppercase tracking-wide focus:ring-1 focus:ring-teal-600 focus:bg-white"
                >
                  <option value="user">User (Standard Crew)</option>
                  <option value="admin">Admin (Operational Administration)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-stone-500 font-black uppercase tracking-wider">Operator Title</label>
                <input
                  type="text"
                  required
                  placeholder="E.g. Senior Trail Coach"
                  value={newUserTitle}
                  onChange={(e) => setNewUserTitle(e.target.value)}
                  className="w-full border border-stone-200 bg-stone-50 rounded-xl p-2.5 text-xs font-semibold focus:ring-1 focus:ring-teal-600 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-stone-500 font-black uppercase tracking-wider">Initial 4-Digit Security PIN</label>
                <input
                  type="password"
                  required
                  maxLength={4}
                  placeholder="••••"
                  value={newUserPin}
                  onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ""))}
                  className="w-full border border-stone-200 bg-stone-50 rounded-xl p-2.5 text-xs font-black tracking-widest text-center focus:ring-1 focus:ring-teal-600 focus:bg-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-black text-xxs uppercase tracking-wider rounded-xl cursor-pointer shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <UserPlus size={12} />
                Provision Profile
              </button>
            </form>
          </div>
        )}

        {activeTab === "ts_cs" && (
          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4 animate-fade-in text-left">
            <div>
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">
                Terms of Service Acceptances
              </h3>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1">
                Historical record of operators and visitors signing off on terms of service and system rules
              </p>
            </div>

            {loading ? (
              <div className="text-center py-12 text-stone-400 font-semibold text-xs animate-pulse">
                Loading acceptances...
              </div>
            ) : tosAcceptances.length === 0 ? (
              <div className="text-center py-12 text-stone-400 font-medium text-xs">
                No terms acceptances recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-stone-750">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 font-extrabold uppercase tracking-widest text-[9px] text-left">
                      <th className="py-3 px-4">Operator / Visitor</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">IP Address</th>
                      <th className="py-3 px-4">System OS / Browser</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-medium">
                    {tosAcceptances.map((tos) => (
                      <tr key={tos.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-stone-900 uppercase">{tos.name}</td>
                        <td className="py-3 px-4">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${
                            tos.role === "owner" 
                              ? "bg-rose-50 border-rose-200 text-rose-700"
                              : tos.role === "admin"
                              ? "bg-teal-50 border-teal-200 text-teal-700"
                              : "bg-stone-100 border-stone-200 text-stone-600"
                          }`}>
                            {tos.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-stone-500">
                          {new Date(tos.acceptedAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-teal-700">{tos.ipAddress}</td>
                        <td className="py-3 px-4 text-stone-400 font-semibold text-[10px] truncate max-w-xs" title={tos.userAgent}>
                          {tos.platform} // {tos.userAgent}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "login_history" && (
          <div className="space-y-4 animate-fade-in text-left">
            <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-2">
              <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">Administrative Security Logs</h3>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">A real-time tamper-proof trail of administrative operator activity, login methods, and profile modifications across the farm network.</p>
            </div>
            <LoginHistory />
          </div>
        )}
      </div>
    </div>
  );
}
