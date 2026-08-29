import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { Clock, Search, ShieldAlert, CheckCircle, UserCheck } from "lucide-react";

interface LoginHistoryItem {
  id: string;
  username: string;
  role: string;
  timestamp: string;
  isPasskeyLogin: boolean;
  actionType?: "login" | "view" | "modify" | string;
  detail?: string;
}

export default function LoginHistory() {
  const [history, setHistory] = useState<LoginHistoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "login_history"),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: LoginHistoryItem[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          username: data.username || "Unknown",
          role: data.role || "Operator",
          timestamp: data.timestamp || new Date().toISOString(),
          isPasskeyLogin: !!data.isPasskeyLogin,
          actionType: data.actionType || "login",
          detail: data.detail || "Logged in",
        });
      });
      setHistory(items);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredHistory = history.filter((item) =>
    item.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats Calculations
  const totalLogins = history.length;
  const passkeyLogins = history.filter(h => h.isPasskeyLogin).length;
  const pinLogins = totalLogins - passkeyLogins;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-6 shadow-xs" id="login-history-panel">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-150">
        <div>
          <h3 className="font-black text-stone-900 text-sm uppercase tracking-wide flex items-center gap-2">
            <Clock className="text-teal-600 animate-pulse" size={18} />
            Employee Login Audit Log
          </h3>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider mt-1">
            Real-time security auditing for Claire, Mark & Cooper
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-2.5 text-stone-400" size={14} />
          <input
            type="text"
            placeholder="Filter by operator name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-xs focus:ring-1 focus:ring-teal-600 focus:outline-hidden font-semibold"
          />
        </div>
      </div>

      {/* Quick Audit Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/60 flex items-center gap-3">
          <div className="p-2.5 bg-teal-100/70 text-teal-800 rounded-xl">
            <UserCheck size={18} />
          </div>
          <div>
            <span className="text-[10px] text-stone-400 font-black uppercase tracking-wider block">Total Audited Logins</span>
            <span className="text-lg font-black text-stone-800 mt-0.5 block">{totalLogins} sessions</span>
          </div>
        </div>
        
        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/60 flex items-center gap-3">
          <div className="p-2.5 bg-amber-100/70 text-amber-800 rounded-xl">
            <ShieldAlert size={18} />
          </div>
          <div>
            <span className="text-[10px] text-stone-400 font-black uppercase tracking-wider block">Passkey Bypasses</span>
            <span className="text-lg font-black text-stone-800 mt-0.5 block">{passkeyLogins} sessions</span>
          </div>
        </div>

        <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/60 flex items-center gap-3">
          <div className="p-2.5 bg-sky-100/70 text-sky-800 rounded-xl">
            <CheckCircle size={18} />
          </div>
          <div>
            <span className="text-[10px] text-stone-400 font-black uppercase tracking-wider block">PIN Authentications</span>
            <span className="text-lg font-black text-stone-800 mt-0.5 block">{pinLogins} sessions</span>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      {isLoading ? (
        <div className="py-12 text-center text-stone-400 text-xs font-semibold animate-pulse">
          Retrieving live audit logs...
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="py-12 text-center text-stone-400 text-xs font-semibold border border-dashed border-stone-200 rounded-2xl">
          No matching login sessions found in the database.
        </div>
      ) : (
        <div className="border border-stone-150 rounded-2xl overflow-hidden max-h-[350px] overflow-y-auto shadow-3xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-50 text-stone-500 font-bold uppercase tracking-wider text-[10px] border-b border-stone-150">
                <th className="p-3.5 pl-5">Operator</th>
                <th className="p-3.5">Assigned Role</th>
                <th className="p-3.5">Event</th>
                <th className="p-3.5">Action Details / What They Did</th>
                <th className="p-3.5 pr-5 text-right">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredHistory.map((item) => {
                const dateObj = new Date(item.timestamp);
                const isToday = dateObj.toDateString() === new Date().toDateString();

                // Assign status pill colors based on actionType
                let actionBadge = null;
                if (item.actionType === "modify") {
                  actionBadge = (
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-600/10 rounded-md px-2 py-0.5 uppercase tracking-wider">
                      Modify
                    </span>
                  );
                } else if (item.actionType === "view") {
                  actionBadge = (
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-600/10 rounded-md px-2 py-0.5 uppercase tracking-wider">
                      View
                    </span>
                  );
                } else {
                  actionBadge = (
                    <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-600/10 rounded-md px-2 py-0.5 uppercase tracking-wider">
                      Login
                    </span>
                  );
                }

                return (
                  <tr key={item.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="p-3.5 pl-5 font-bold text-stone-800 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                      {item.username}
                    </td>
                    <td className="p-3.5">
                      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-600/10 rounded-md px-2 py-0.5 uppercase tracking-wider">
                        {item.role}
                      </span>
                    </td>
                    <td className="p-3.5">
                      {actionBadge}
                    </td>
                    <td className="p-3.5 font-semibold text-stone-600 max-w-xs sm:max-w-md break-words">
                      {item.detail}
                    </td>
                    <td className="p-3.5 pr-5 text-right text-stone-500 font-semibold font-mono text-[11px] whitespace-nowrap">
                      {isToday ? (
                        <span className="text-teal-600 font-bold">Today, {dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      ) : (
                        dateObj.toLocaleString([], { dateStyle: "short", timeStyle: "medium" })
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
