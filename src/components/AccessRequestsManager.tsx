import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { ShieldCheck, Lock, Unlock, XCircle, Check, ArrowRight, FileText, Send, Calendar, RefreshCw, ShieldAlert, CheckCircle, Trash2, Bell } from "lucide-react";

interface RequestItem {
  id: string;
  visitorName: string;
  horseId: string;
  horseName: string;
  scanDate: string;
  status?: string;
  requestedAt?: string;
  documentTypes?: string[];
  message?: string;
}

interface AppealItem {
  id: string;
  name: string;
  email: string;
  reason: string;
  clientIp: string;
  timestamp: string;
  status: "pending" | "resolved";
}

interface AccessRequestsManagerProps {
  isAdmin?: boolean;
}

export default function AccessRequestsManager({ isAdmin = false }: AccessRequestsManagerProps) {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  // Subscribe to visitor document requests in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "visitor_scanned_horses"), (snapshot) => {
      const list: RequestItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as RequestItem);
      });
      // Sort: pending requests first, then by date requested
      list.sort((a, b) => {
        const isPendingA = a.status === "pending" ? 1 : 0;
        const isPendingB = b.status === "pending" ? 1 : 0;
        if (isPendingA !== isPendingB) {
          return isPendingB - isPendingA;
        }
        const dateA = a.requestedAt || "";
        const dateB = b.requestedAt || "";
        return dateB.localeCompare(dateA);
      });
      setRequests(list);
    }, (err) => {
      console.error("Requests sub error:", err);
    });

    const unsubAppeals = onSnapshot(collection(db, "lockdown_appeals"), (snapshot) => {
      const list: AppealItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as AppealItem);
      });
      list.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
      setAppeals(list);
    }, (err) => {
      console.error("Appeals sub error:", err);
    });

    return () => {
      unsub();
      unsubAppeals();
    };
  }, []);

  const handleResolveAppeal = async (id: string, name: string, ip: string) => {
    try {
      const { deleteDoc, doc } = await import("firebase/firestore");
      // Delete appeal record
      await deleteDoc(doc(db, "lockdown_appeals", id));
      
      // Automatically lift restriction from banned_names and banned_ips collections
      const nameDocId = name.toLowerCase().trim();
      const ipDocId = ip.toLowerCase().trim();
      
      try {
        await deleteDoc(doc(db, "banned_names", nameDocId));
      } catch (e) {}
      try {
        await deleteDoc(doc(db, "banned_ips", ipDocId));
      } catch (e) {}

      // Log audit
      const { logAuditAction } = await import("../firebase");
      await logAuditAction("Administration", "admin", "modify", `Approved lockdown/ban appeal for ${name} (IP: ${ip}). Cleared limits.`);
      alert(`✓ Appeal approved. Bans on name "${name}" and IP "${ip}" have been lifted.`);
    } catch (err) {
      console.error("Resolve appeal failed:", err);
      alert("Failed to resolve appeal. Please try again.");
    }
  };

  const handleApprove = async (id: string) => {
    setActioningId(id);
    try {
      await updateDoc(doc(db, "visitor_scanned_horses", id), {
        status: "granted",
        approvedAt: new Date().toISOString(),
        message: "Access granted by Farm IT Administration."
      });
    } catch (err) {
      console.error("Failed to approve access:", err);
    } finally {
      setActioningId(null);
    }
  };

  const handleDeclineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!denyingId) return;
    const cleanReason = declineReason.trim() || "The requested document package is currently private.";
    setActioningId(denyingId);

    try {
      await updateDoc(doc(db, "visitor_scanned_horses", denyingId), {
        status: "denied",
        deniedAt: new Date().toISOString(),
        message: cleanReason
      });
      setDenyingId(null);
      setDeclineReason("");
    } catch (err) {
      console.error("Failed to decline access:", err);
    } finally {
      setActioningId(null);
    }
  };

  const handleBulkApprove = async () => {
    const pending = requests.filter(r => r.status === "pending");
    if (pending.length === 0) return;
    if (!window.confirm(`Are you sure you want to approve all ${pending.length} pending access requests?`)) {
      return;
    }

    setIsBulkApproving(true);
    try {
      const promises = pending.map((item) =>
        updateDoc(doc(db, "visitor_scanned_horses", item.id), {
          status: "granted",
          approvedAt: new Date().toISOString(),
          message: "Bulk approved by Farm Administration."
        })
      );
      await Promise.all(promises);
    } catch (err) {
      console.error("Failed to bulk approve requests:", err);
    } finally {
      setIsBulkApproving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setActioningId(id);
    try {
      await updateDoc(doc(db, "visitor_scanned_horses", id), {
        status: "denied",
        revokedAt: new Date().toISOString(),
        message: "Access privileges revoked by Farm Administration."
      });
    } catch (err) {
      console.error("Failed to revoke access:", err);
    } finally {
      setActioningId(null);
    }
  };

  const pendingRequests = requests.filter(r => r.status === "pending");
  const processedRequests = requests.filter(r => r.status && r.status !== "pending");
  const activeDenyingItem = requests.find(r => r.id === denyingId);

  return (
    <div className="space-y-6" id="access-requests-manager">
      {/* Header Info */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-xs p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-pink-50 text-pink-700 rounded-xl border border-pink-100 shadow-3xs">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h2 className="text-base font-black uppercase text-stone-900 tracking-wider">
              Document Authorization Terminal
            </h2>
            <p className="text-xxs font-semibold text-stone-500 uppercase tracking-widest mt-0.5">
              Review and approve clinical &amp; farrier data packet requests from guest terminals
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-full font-extrabold uppercase tracking-wide flex items-center gap-1.5">
            <Lock size={11} className="animate-pulse" />
            Pending: {pendingRequests.length}
          </span>
          <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-full font-extrabold uppercase tracking-wide">
            Processed: {processedRequests.length}
          </span>
        </div>
      </div>

      {/* Requests Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Pending Approval Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h3 className="text-xs font-black text-stone-850 uppercase tracking-widest flex items-center gap-2">
              <Lock size={14} className="text-amber-600" />
              Awaiting Sign-off ({pendingRequests.length})
            </h3>

            {pendingRequests.length > 0 && (
              <button
                onClick={handleBulkApprove}
                disabled={isBulkApproving}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-black text-[10px] px-3.5 py-1.5 rounded-xl uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer hover:scale-[1.01] shadow-xs"
              >
                {isBulkApproving ? (
                  <RefreshCw size={11} className="animate-spin" />
                ) : (
                  <Check size={11} className="stroke-[3]" />
                )}
                <span>Quick Bulk Approve ({pendingRequests.length})</span>
              </button>
            )}
          </div>

          {pendingRequests.length === 0 ? (
            <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center text-stone-400 space-y-2.5">
              <Check className="mx-auto text-emerald-500 bg-emerald-50 p-2 rounded-xl border border-emerald-200" size={36} />
              <p className="text-xs font-extrabold text-stone-700 uppercase tracking-wider">All Access Cleared</p>
              <p className="text-[11px] text-stone-500 max-w-sm mx-auto">
                No active document access requests are pending. Guests are notified immediately once new requests are submitted.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((item) => (
                <div 
                  key={item.id}
                  className="bg-white rounded-3xl border border-stone-200 p-5 shadow-3xs space-y-4 relative overflow-hidden text-left"
                >
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
                    <div>
                      <span className="text-xs font-black text-stone-900 block uppercase">
                        {item.visitorName}
                      </span>
                      <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider font-mono">
                        Connection: Guest Terminal
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] text-stone-500 font-bold font-mono bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200/40">
                      <Calendar size={12} className="text-stone-400" />
                      Requested: {item.requestedAt ? new Date(item.requestedAt).toLocaleString([], {hour: "2-digit", minute:"2-digit", month: "short", day: "numeric"}) : item.scanDate}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-stone-50 p-3 rounded-xl border border-stone-150">
                      <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Target Horse Profile</span>
                      <span className="text-xs font-black text-teal-800 mt-0.5 block">{item.horseName}</span>
                    </div>

                    <div className="bg-stone-50 p-3 rounded-xl border border-stone-150">
                      <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Requested Document Packets</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.documentTypes && item.documentTypes.length > 0 ? (
                          item.documentTypes.map((docType) => (
                            <span key={docType} className="text-[8px] font-black uppercase tracking-wider bg-white border border-stone-200 text-stone-700 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <FileText size={8} className="text-teal-600" />
                              {docType}
                            </span>
                          ))
                        ) : (
                          <span className="text-[9px] text-stone-500 font-bold">Standard Bio Access</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const { addDoc, collection } = await import("firebase/firestore");
                            await addDoc(collection(db, "owner_notifications"), {
                              message: `Access Request Alert: Visitor ${item.visitorName} requested access to ${item.horseName}. Admin has requested your attention.`,
                              timestamp: new Date().toISOString(),
                              status: "unread",
                              type: "access_request_alert",
                              visitorName: item.visitorName,
                              horseName: item.horseName
                            });
                            alert(`✓ Farm Administrator has been notified of ${item.visitorName}'s access request.`);
                          } catch (e) {
                            console.error("Failed to notify Administrator:", e);
                            alert("Failed to notify Administrator. Try again.");
                          }
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] px-3 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-3xs"
                      >
                        <Bell size={11} />
                        Notify Owner
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setDenyingId(item.id);
                        setDeclineReason("");
                      }}
                      disabled={actioningId === item.id}
                      className="bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-stone-200 hover:border-rose-200 font-bold text-[10px] px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-3xs"
                    >
                      <XCircle size={12} />
                      Decline
                    </button>
                    <button
                      onClick={() => handleApprove(item.id)}
                      disabled={actioningId === item.id}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-xs hover:scale-[1.01]"
                    >
                      {actioningId === item.id ? (
                        <RefreshCw size={11} className="animate-spin" />
                      ) : (
                        <Unlock size={11} />
                      )}
                      <span>Grant Access</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Processed Authorization Logs */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-stone-850 uppercase tracking-widest mb-1.5 flex items-center gap-2">
            <Unlock size={14} className="text-emerald-600" />
            Authorization Logs ({processedRequests.length})
          </h3>

          <div className="bg-white rounded-3xl border border-stone-200 p-4 space-y-3 shadow-3xs max-h-[500px] overflow-y-auto">
            {processedRequests.length === 0 ? (
              <p className="text-xxs font-bold text-stone-400 uppercase text-center py-12">No historical logs found.</p>
            ) : (
              processedRequests.map((item) => {
                const isGranted = item.status === "granted";
                return (
                  <div 
                    key={item.id}
                    className="p-3.5 bg-stone-50 border border-stone-150 rounded-2xl space-y-2 text-left text-xs transition-all hover:bg-white hover:border-stone-250 group"
                  >
                    <div className="flex justify-between items-start gap-1">
                      <div>
                        <span className="font-extrabold text-stone-900 block truncate max-w-[130px]">{item.visitorName}</span>
                        <span className="text-[9px] font-bold text-stone-400 block uppercase tracking-wider">{item.horseName}</span>
                      </div>
                      
                      {isGranted ? (
                        <span className="text-[8px] font-black uppercase text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <Unlock size={8} />
                          Active
                        </span>
                      ) : (
                        <span className="text-[8px] font-black uppercase text-rose-800 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <XCircle size={8} />
                          Declined
                        </span>
                      )}
                    </div>

                    {item.message && (
                      <p className="text-[10px] text-stone-500 italic leading-relaxed whitespace-pre-wrap font-medium">
                        &ldquo;{item.message}&rdquo;
                      </p>
                    )}

                    {isGranted ? (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-stone-200/40">
                        <button
                          onClick={() => {
                            setDenyingId(item.id);
                            setDeclineReason("");
                          }}
                          disabled={actioningId === item.id}
                          className="text-[9px] text-rose-600 hover:text-rose-800 font-extrabold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer bg-white border border-stone-200 hover:border-rose-200 px-2.5 py-1 rounded-lg transition-all"
                        >
                          <XCircle size={10} /> Decline / Revoke with Reason
                        </button>
                        <button
                          onClick={() => handleRevoke(item.id)}
                          disabled={actioningId === item.id}
                          className="text-[9px] text-rose-600 hover:text-rose-800 font-extrabold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer bg-white border border-stone-200 hover:border-rose-200 px-2.5 py-1 rounded-lg transition-all"
                        >
                          <Lock size={10} /> Quick Revoke
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-stone-200/40">
                        <button
                          onClick={() => handleApprove(item.id)}
                          disabled={actioningId === item.id}
                          className="text-[9px] text-emerald-700 hover:text-emerald-900 font-extrabold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer bg-white border border-stone-200 hover:border-emerald-200 px-2.5 py-1 rounded-lg transition-all"
                        >
                          <Unlock size={10} /> Grant Access
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Banishment & Lockdown Appeals Area (Required Feature!) */}
        <div className="bg-white rounded-3xl border border-stone-200/80 shadow-md p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100 mb-6">
            <div>
              <h2 className="text-sm font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
                <ShieldAlert className="text-red-600 animate-pulse" size={18} /> Guest Lockdown &amp; Banishment Appeals
              </h2>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">
                Active appeal statements submitted by clients on locked network connections
              </p>
            </div>
            <span className="self-start sm:self-center px-3 py-1 bg-red-50 text-red-700 rounded-md font-mono text-[9px] font-extrabold uppercase">
              {appeals.length} Appeals Pending
            </span>
          </div>

          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
            {appeals.length === 0 ? (
              <div className="text-center py-10 text-stone-400 border-2 border-dashed border-stone-150 rounded-2xl">
                <CheckCircle size={32} className="mx-auto text-stone-200 mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Zero Pending Appeals</p>
                <p className="text-[10px] text-stone-400 mt-1">No local lockdowns or banned visitors have appealed at this time.</p>
              </div>
            ) : (
              appeals.map((appeal) => (
                <div
                  key={appeal.id}
                  className="p-5 bg-stone-50 border border-stone-200 rounded-2xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 text-left hover:border-red-200 hover:bg-red-50/3 transition-all"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-extrabold text-stone-900 text-xs uppercase tracking-tight">
                        {appeal.name}
                      </span>
                      <span className="text-[9px] bg-stone-200 text-stone-600 font-mono font-bold px-2 py-0.5 rounded">
                        IP: {appeal.clientIp}
                      </span>
                      <span className="text-[9px] bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-sm flex items-center gap-0.5 uppercase tracking-wide">
                        <ShieldAlert size={8} /> Local Lockdown Appeal
                      </span>
                    </div>

                    <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <span className="text-stone-800 lowercase">{appeal.email}</span>
                      <span>•</span>
                      <span>Submitted: {appeal.timestamp ? new Date(appeal.timestamp).toLocaleString() : "Unknown"}</span>
                    </div>

                    <p className="text-xs text-stone-750 bg-white border border-stone-150 p-3.5 rounded-xl italic font-medium leading-relaxed mt-1">
                      &ldquo;{appeal.reason}&rdquo;
                    </p>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                    <button
                      onClick={() => handleResolveAppeal(appeal.id, appeal.name, appeal.clientIp)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                    >
                      <CheckCircle size={12} /> Pardon &amp; Clear Ban
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Are you sure you want to dismiss this appeal without unbanning?")) {
                          const { deleteDoc, doc } = await import("firebase/firestore");
                          await deleteDoc(doc(db, "lockdown_appeals", appeal.id));
                        }
                      }}
                      className="border border-stone-200 text-stone-500 hover:text-rose-600 hover:border-rose-200 p-2.5 rounded-xl transition-colors cursor-pointer"
                      title="Dismiss Appeal"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Deny with Reason overlay modal */}
      {denyingId && activeDenyingItem && (
        <div 
          className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setDenyingId(null)}
        >
          <div 
            className="bg-white rounded-3xl border border-stone-250 shadow-2xl p-6 w-full max-w-md animate-scale-up text-left cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-150 pb-3.5 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 shadow-3xs">
                  <XCircle size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wide">
                    Decline Access Request
                  </h3>
                  <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">
                    Decline {activeDenyingItem.visitorName}&apos;s request for {activeDenyingItem.horseName}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleDeclineSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest">
                  Decline Reason &amp; Feedback
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="e.g. This horse is undergoing active private clinical treatment. Records are restricted at this time."
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-250 rounded-2xl p-3.5 text-xs font-semibold focus:ring-2 focus:ring-rose-500 focus:outline-hidden text-stone-900 placeholder-stone-300"
                />
                <p className="text-[9px] text-stone-400 italic font-medium leading-relaxed">
                  This message will be visually sent to the guest immediately on their visitor dashboard when checking status.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDenyingId(null);
                    setDeclineReason("");
                  }}
                  className="border border-stone-200 text-stone-600 hover:text-stone-900 hover:bg-stone-50 font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actioningId === denyingId}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                >
                  {actioningId === denyingId ? (
                    <RefreshCw size={11} className="animate-spin" />
                  ) : (
                    <Send size={11} />
                  )}
                  <span>Send Decline</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
