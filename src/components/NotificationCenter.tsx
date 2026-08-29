import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query, addDoc, doc, updateDoc, writeBatch, getDocs, orderBy, deleteDoc, where } from "firebase/firestore";
import { Horse, AppNotification, SystemUser } from "../types";
import { generateNotifications } from "../utils/scheduler";
import { Bell, BellRing, Check, Trash, X, Sliders, ArrowLeft, Shield, Hammer, Stethoscope, Heart, Lock, Mail } from "lucide-react";

interface NotificationCenterProps {
  horses: Horse[];
  todayStr: string;
  currentUser: SystemUser | null;
  onSelectHorse: (horseId: string) => void;
}

export default function NotificationCenter({ horses, todayStr, currentUser, onSelectHorse }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(() => {
    return localStorage.getItem("horsesense_email_alerts_enabled") === "true";
  });
  const [alertEmailAddress, setAlertEmailAddress] = useState(() => {
    return localStorage.getItem("horsesense_alert_email_address") || "";
  });
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [sentEmails, setSentEmails] = useState<any[]>([]);
  const [viewingEmail, setViewingEmail] = useState<any | null>(null);

  useEffect(() => {
    const q = query(collection(db, "sent_emails"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setSentEmails(list);
    });
    return () => unsub();
  }, []);

  const handleSendTestEmail = async () => {
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/send-bulk-check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isTest: true,
          adminEmail: alertEmailAddress || "admin@horsesense.app"
        })
      });
      const data = await res.json();
      if (data.success) {
        await addDoc(collection(db, "sent_emails"), {
          subject: data.subject || "⚠️ TEST EMAIL: Farm Admin Alerts",
          recipient: data.recipient || "admin@horsesense.app",
          body: data.emailHtml || "",
          realEmailSent: data.realEmailSent || false,
          timestamp: new Date().toISOString(),
          isTest: true
        });
        setTestResult(data.realEmailSent ? "✓ Test email sent successfully to your inbox!" : "✓ Test email dispatched (view in outbox below)!");
      } else {
        setTestResult("Failed to dispatch test email.");
      }
    } catch (err) {
      console.error("Test email fail:", err);
      setTestResult("Error dispatching test email.");
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleToggleEmailAlerts = (val: boolean) => {
    setEmailAlertsEnabled(val);
    localStorage.setItem("horsesense_email_alerts_enabled", val ? "true" : "false");
  };

  const handleSaveEmailAddress = (email: string) => {
    setAlertEmailAddress(email);
    localStorage.setItem("horsesense_alert_email_address", email);
  };

  // Notification filter settings state
  const [prefs, setPrefs] = useState({
    shoeing_due: true,
    vet_due: true,
    deworming_due: true,
    login_activity: true,
    custom: true
  });

  // Load user specific notification settings from localStorage
  useEffect(() => {
    if (currentUser) {
      const saved = localStorage.getItem(`horsesense_notif_prefs_${currentUser.name}`);
      if (saved) {
        try {
          setPrefs(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse notification preferences:", e);
        }
      }
    }
  }, [currentUser]);

  // Save notification toggle
  const togglePref = (key: keyof typeof prefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    if (currentUser) {
      localStorage.setItem(`horsesense_notif_prefs_${currentUser.name}`, JSON.stringify(updated));
    }
  };

  const triggerDeviceNotification = (title: string, body: string) => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        try {
          new Notification(title, {
            body: body,
            icon: "/favicon.ico"
          });
        } catch (e) {
          console.warn("Failed to construct system notification directly:", e);
        }
      }
    }
  };

  // 1. Listen to real-time notification collection
  useEffect(() => {
    const q = query(collection(db, "notifications"), orderBy("dueDate", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: AppNotification[] = [];
      let hasNewUnread = false;
      let newNotificationMsg = "";

      // Check for freshly added unread notifications to push
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const n = change.doc.data() as AppNotification;
          if (n.status === "unread") {
            const createdTime = n.createdAt ? new Date(n.createdAt).getTime() : Date.now();
            const ageMs = Date.now() - createdTime;
            // Only notify if added within the last 30 seconds
            if (ageMs < 30000) {
              hasNewUnread = true;
              newNotificationMsg = n.message || "A new maintenance check is required!";
            }
          }
        }
      });

      if (hasNewUnread && newNotificationMsg) {
        triggerDeviceNotification("Nova Herd Alert", newNotificationMsg);
      }

      const horseIds = new Set(horses.map(h => h.id));
      snapshot.forEach((docSnap) => {
        const notif = { id: docSnap.id, ...docSnap.data() } as AppNotification;
        if (!notif.horseId || horseIds.has(notif.horseId)) {
          list.push(notif);
        }
      });
      // Filter out dismissed notifications
      const activeList = list.filter((n) => n.status !== "dismissed");
      // Sort unread first, then by date descending
      const sorted = activeList.sort((a, b) => {
        if (a.status === "unread" && b.status === "read") return -1;
        if (a.status === "read" && b.status === "unread") return 1;
        return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
      });
      setNotifications(sorted);
    });

    return () => unsubscribe();
  }, [horses]);

  // 2. Automated Trigger: Sync notifications on load or whenever horses change
  useEffect(() => {
    if (horses.length === 0 || isSyncing) return;

    const syncNotifications = async () => {
      setIsSyncing(true);
      try {
        // Fetch existing ones from Firestore to compare
        const querySnapshot = await getDocs(collection(db, "notifications"));
        const existingList = querySnapshot.docs.map(d => d.data() as AppNotification);

        // Generate current alerts
        const generated = generateNotifications(horses, todayStr);

        // Filter alerts that don't already exist in DB (by horseId, type, and dueDate)
        const toAdd = generated.filter(genAlert => {
          return !existingList.some(existing => 
            existing.horseId === genAlert.horseId &&
            existing.type === genAlert.type &&
            existing.dueDate === genAlert.dueDate
          );
        });

        // Add missing alerts to Firestore
        for (const alert of toAdd) {
          await addDoc(collection(db, "notifications"), alert);
        }
      } catch (error) {
        console.error("Error syncing automated notifications:", error);
      } finally {
        setIsSyncing(false);
      }
    };

    syncNotifications();
  }, [horses, todayStr]);

  // Apply real-time filtering based on user permissions & toggled preferences
  const isOwnerOrAdmin = currentUser && (currentUser.role === "owner" || currentUser.role === "admin" || ["System Administrator", "Claire Wright", "Mark Wright"].includes(currentUser.name));

  const filteredNotifications = notifications.filter((n) => {
    // 1. If it's a login activity security notification, only show if user is owner/admin (Cooper, Claire, Mark)
    if (n.type === "login_activity") {
      if (!isOwnerOrAdmin) return false;
      return prefs.login_activity;
    }
    // 2. Map other notification types to preferences
    if (n.type === "shoeing_due") return prefs.shoeing_due;
    if (n.type === "vet_due") return prefs.vet_due;
    if (n.type === "deworming_due") return prefs.deworming_due;
    return prefs.custom;
  });

  const unreadCount = filteredNotifications.filter((n) => n.status === "unread").length;

  const clearAllNotifications = async () => {
    try {
      const batch = writeBatch(db);
      filteredNotifications.forEach((n) => {
        const ref = doc(db, "notifications", n.id);
        batch.delete(ref);
      });
      await batch.commit();
    } catch (error) {
      console.error("Error clearing all notifications:", error);
    }
  };

  const dismissNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, "notifications", id));
    } catch (error) {
      console.error("Error dismissing notification:", error);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), { status: "read" });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleRemoteLogoutUser = async (notif: any) => {
    try {
      // Robustly parse the username and role from the notification message or fields
      let username = notif.username;
      let role = notif.role;
      if (!username && notif.message) {
        const match = notif.message.match(/^(.+?)\s*\((visitor|crew|admin|owner)\)/i);
        if (match) {
          username = match[1].trim();
          role = match[2].trim().toLowerCase();
        } else {
          username = notif.message.split(" ")[0];
        }
      }
      if (!username) {
        alert("Could not identify the username to terminate.");
        return;
      }

      const isVisitor = role === "visitor" || notif.message.toLowerCase().includes("(visitor)");

      // 1. Dispatch real-time remote logout
      if (isVisitor) {
        const docId = username.toLowerCase().replace(/\s+/g, "_");
        await updateDoc(doc(db, "visitor_permissions", docId), { forceLogout: true });
      } else {
        await updateDoc(doc(db, "crew_profiles", username), { forceLogout: true });
      }

      // 2. Erase active device registry entries matching this username
      try {
        const qDevices = query(collection(db, "active_devices"), where("name", "==", username));
        const qSnap = await getDocs(qDevices);
        const batch = writeBatch(db);
        qSnap.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      } catch (devErr) {
        console.warn("Could not purge active devices for terminated user:", devErr);
      }

      // 3. Remove the login activity notification from the database completely
      await deleteDoc(doc(db, "notifications", notif.id));
      alert(`✓ Remote session for ${username} has been terminated.`);
    } catch (err) {
      console.error("Remote logout failed:", err);
      alert("Failed to send remote logout signal.");
    }
  };

  const hasCriticalOrOverdue = filteredNotifications.some(
    (n) => n.status === "unread" && ["shoeing_due", "vet_due", "deworming_due"].includes(n.type)
  );

  return (
    <div className="relative inline-block" id="notification-center-container">
      {/* Bell Trigger */}
      <button
        id="notification-bell-btn"
        onClick={() => {
          setIsOpen(!isOpen);
          setShowSettings(false); // Reset settings panel view when toggled
        }}
        className="relative p-2 text-stone-600 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors focus:outline-none"
        aria-label="Toggle notifications menu"
      >
        {unreadCount > 0 ? (
          <>
            <BellRing className={`text-teal-600 origin-top ${hasCriticalOrOverdue ? "animate-bell-shake" : "animate-swing"}`} size={24} />
            <span 
              id="notification-badge-count"
              className="absolute top-1 right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xxs font-bold leading-none text-white bg-teal-600 rounded-full animate-pulse"
            >
              {unreadCount}
            </span>
          </>
        ) : (
          <Bell size={24} />
        )}
      </button>

      {/* Notifications Panel / Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div 
            id="notification-dropdown-panel"
            className="absolute right-0 mt-3 w-96 max-w-sm bg-white rounded-2xl border border-stone-200 shadow-2xl z-50 overflow-hidden transform origin-top-right transition-all"
          >
            {/* Header */}
            <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <div className="flex items-center space-x-2">
                {showSettings ? (
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-1 hover:bg-stone-200 rounded-lg transition-colors text-stone-600 cursor-pointer"
                    title="Back to Alerts"
                  >
                    <ArrowLeft size={16} />
                  </button>
                ) : null}
                <h3 className="font-semibold text-stone-900 text-sm">
                  {showSettings ? "Notification Settings" : "Maintenance Alerts"}
                </h3>
                {!showSettings && (
                  <span className="text-xxs bg-teal-100 text-teal-800 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {unreadCount} Active
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {!showSettings && (
                  <>
                    {filteredNotifications.length > 0 && (
                      <button
                        onClick={clearAllNotifications}
                        className="text-xxs text-rose-600 hover:text-rose-700 font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Trash size={12} /> Clear All
                      </button>
                    )}
                    <button
                      onClick={() => setShowSettings(true)}
                      className="text-stone-500 hover:text-teal-600 cursor-pointer p-1 rounded hover:bg-stone-200 transition-colors"
                      title="Notification Preferences"
                    >
                      <Sliders size={15} />
                    </button>
                  </>
                )}
                <button 
                  onClick={() => setIsOpen(false)} 
                  className="text-stone-400 hover:text-stone-600 cursor-pointer p-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Panel Body */}
            {showSettings ? (
              /* Settings View */
              <div className="p-5 space-y-4 text-left" id="notification-settings-view">
                <p className="text-xxs text-stone-400 font-black uppercase tracking-wider leading-relaxed">
                  Choose which alerts and logs you want to display on your dashboard:
                </p>

                <div className="space-y-3 pt-2">
                  {/* Pref 1: Shoeing alerts */}
                  <label className="flex items-start gap-3 p-3 bg-stone-50 hover:bg-stone-100/60 rounded-xl border border-stone-200/60 cursor-pointer transition-all">
                    <input 
                      type="checkbox"
                      checked={prefs.shoeing_due}
                      onChange={() => togglePref("shoeing_due")}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5 leading-none">
                        <Hammer size={12} className="text-teal-600" /> Farrier Attention
                      </span>
                      <span className="text-[10px] text-stone-500 font-medium block">
                        Warn when horse shoeing schedule is overdue.
                      </span>
                    </div>
                  </label>

                  {/* Pref 2: Vet care alerts */}
                  <label className="flex items-start gap-3 p-3 bg-stone-50 hover:bg-stone-100/60 rounded-xl border border-stone-200/60 cursor-pointer transition-all">
                    <input 
                      type="checkbox"
                      checked={prefs.vet_due}
                      onChange={() => togglePref("vet_due")}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5 leading-none">
                        <Stethoscope size={12} className="text-rose-700" /> Veterinary Care
                      </span>
                      <span className="text-[10px] text-stone-500 font-medium block">
                        Warn when a horse vet check or routine medical is past due.
                      </span>
                    </div>
                  </label>

                  {/* Pref 3: Deworming alerts */}
                  <label className="flex items-start gap-3 p-3 bg-stone-50 hover:bg-stone-100/60 rounded-xl border border-stone-200/60 cursor-pointer transition-all">
                    <input 
                      type="checkbox"
                      checked={prefs.deworming_due}
                      onChange={() => togglePref("deworming_due")}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5 leading-none">
                        <Heart size={12} className="text-sky-600" /> Deworming Schedules
                      </span>
                      <span className="text-[10px] text-stone-500 font-medium block">
                        Alert for scheduled 12-week deworming cycles.
                      </span>
                    </div>
                  </label>

                  {/* Pref 4: Login activity (Only visible to Owners/Admins: Cooper, Claire, Mark) */}
                  {isOwnerOrAdmin ? (
                    <label className="flex items-start gap-3 p-3 bg-teal-50/20 hover:bg-teal-50/40 rounded-xl border border-teal-100 cursor-pointer transition-all">
                      <input 
                        type="checkbox"
                        checked={prefs.login_activity}
                        onChange={() => togglePref("login_activity")}
                        className="mt-0.5 h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5 leading-none">
                          <Lock size={12} className="text-teal-700" /> Security Login Auditing
                        </span>
                        <span className="text-[10px] text-teal-700/80 font-semibold block">
                          Receive live system alerts when crew or guests log in.
                        </span>
                      </div>
                    </label>
                  ) : (
                    <div className="p-3 bg-stone-100 rounded-xl border border-stone-200/60 flex items-center gap-2 text-stone-400">
                      <Lock size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">IT Login alerts locked to Admins</span>
                    </div>
                  )}

                  {/* Email Notifications & Alerts Config Section */}
                  <div className="p-3 bg-teal-50/15 border border-teal-600/15 rounded-xl space-y-2.5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={emailAlertsEnabled}
                        onChange={(e) => handleToggleEmailAlerts(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-stone-850 flex items-center gap-1.5 leading-none">
                          <Mail size={12} className="text-teal-600" /> Enable Email Notifications
                        </span>
                        <span className="text-[10px] text-stone-500 font-medium block">
                          Send automated alerts to your inbox for overdue schedules.
                        </span>
                      </div>
                    </label>

                    {emailAlertsEnabled && (
                      <div className="pt-1 animate-fade-in">
                        <input
                          type="email"
                          value={alertEmailAddress}
                          onChange={(e) => handleSaveEmailAddress(e.target.value)}
                          placeholder="your-email@example.com"
                          className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                        />
                        <span className="text-[9px] text-teal-700 font-bold uppercase tracking-wider mt-1 block">
                          ✓ Saved & Active for active alerts
                        </span>
                        <div className="mt-2.5 pt-2 border-t border-teal-600/10">
                          <button
                            type="button"
                            onClick={handleSendTestEmail}
                            disabled={isSendingTest}
                            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-black text-[9px] uppercase tracking-wider py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-xxs"
                          >
                            {isSendingTest ? "Sending Test..." : "✉ Send Test Email to Cooper"}
                          </button>
                          {testResult && (
                            <div className="space-y-1.5 animate-fade-in mt-1.5">
                              <span className="text-[9px] font-bold text-teal-700 block text-center bg-teal-50/50 p-1.5 rounded-md border border-teal-600/5">
                                {testResult}
                              </span>
                              <p className="text-[8px] text-stone-500 font-medium leading-relaxed bg-stone-50 p-1.5 rounded-md border border-stone-150">
                                <strong className="text-teal-700">Notice for Cooper:</strong> If you do not receive the email, make sure <code className="bg-stone-200 px-0.5 rounded text-[8px]">RESEND_API_KEY</code> is set in the AI Studio Settings menu. In Resend free trial mode, the sandbox sender <code className="bg-stone-200 px-0.5 rounded text-[8px]">onboarding@resend.dev</code> can <strong>only</strong> send to the email address registered on your Resend account.
                              </p>
                            </div>
                          )}
                        </div>
                        {/* Live Email Dispatch Outbox / Simulator */}
                        <div className="mt-4 pt-3 border-t border-teal-600/15 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="block text-[10px] font-black uppercase text-teal-700 tracking-wider">
                              📬 Live Email Outbox ({sentEmails.length})
                            </span>
                            {sentEmails.length > 0 && (
                              <button
                                type="button"
                                onClick={async () => {
                                  // Clear outbox
                                  const q = query(collection(db, "sent_emails"));
                                  const snaps = await getDocs(q);
                                  const batch = writeBatch(db);
                                  snaps.forEach((docSnap) => batch.delete(docSnap.ref));
                                  await batch.commit();
                                }}
                                className="text-[8px] font-bold uppercase text-stone-400 hover:text-rose-600 cursor-pointer"
                              >
                                Clear Logs
                              </button>
                            )}
                          </div>
                          {sentEmails.length === 0 ? (
                            <div className="text-center p-3.5 bg-stone-50 border border-stone-200/50 rounded-xl">
                              <span className="text-[9px] text-stone-400 font-bold uppercase block">
                                No emails sent yet
                              </span>
                            </div>
                          ) : (
                            <div className="max-h-[160px] overflow-y-auto space-y-1.5 pr-1" id="sent-emails-list">
                              {sentEmails.map((email) => (
                                <div 
                                  key={email.id} 
                                  className="p-2 bg-white border border-stone-200 hover:border-teal-500 rounded-xl text-left transition-all cursor-pointer shadow-3xs flex items-center justify-between"
                                  onClick={() => setViewingEmail(email)}
                                >
                                  <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                                    <span className="block text-[10px] font-extrabold text-stone-850 truncate">
                                      {email.subject}
                                    </span>
                                    <div className="flex items-center gap-1.5 text-[8px] font-bold text-stone-400 uppercase">
                                      <span className="truncate max-w-[110px]">{email.recipient}</span>
                                      <span>•</span>
                                      <span>{new Date(email.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                    </div>
                                  </div>
                                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md shrink-0 ${
                                    email.realEmailSent 
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                      : "bg-teal-50 text-teal-700 border border-teal-200"
                                  }`}>
                                    {email.realEmailSent ? "Delivered" : "Simulated"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Device Push Notifications Block */}
                  <div className="p-3 bg-teal-50/15 border border-teal-600/15 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-stone-850 flex items-center gap-1.5 leading-none">
                          <BellRing size={12} className="text-teal-600 animate-pulse" /> Device Push Alerts
                        </span>
                        <span className="text-[10px] text-stone-500 font-medium block">
                          Receive instant push notifications on your phone or computer.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== "undefined" && "Notification" in window) {
                            Notification.requestPermission().then((permission) => {
                              if (permission === "granted") {
                                triggerDeviceNotification("Nova Herd Alerts Active", "You will now receive tactile device alerts for horses!");
                              }
                            });
                          } else {
                            alert("This browser does not support local push notifications.");
                          }
                        }}
                        className={`text-xxs font-black uppercase px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all ${
                          typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
                            ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                            : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                        }`}
                      >
                        {typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
                          ? "✓ Active"
                          : "Enable"}
                      </button>
                    </div>
                  </div>

                </div>

                <button
                  onClick={() => setShowSettings(false)}
                  className="w-full mt-4 bg-stone-900 hover:bg-stone-850 text-white font-bold text-xxs uppercase tracking-widest py-2.5 rounded-xl transition-all cursor-pointer text-center"
                >
                  Apply &amp; Back to Alerts
                </button>
              </div>
            ) : (
              /* Alerts List View */
              <div className="max-h-[380px] overflow-y-auto divide-y divide-stone-100" id="notification-alerts-list">
                {filteredNotifications.length === 0 ? (
                  <div className="p-8 text-center text-stone-400">
                    <Bell className="mx-auto text-stone-300 mb-2 animate-bounce" size={32} />
                    <p className="text-sm font-semibold text-stone-650">No active alerts match filters.</p>
                    <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                      Toggle settings at top right to enable categories or clear filters.
                    </p>
                  </div>
                ) : (
                  filteredNotifications.map((notif) => {
                    const isUnread = notif.status === "unread";
                    return (
                      <div
                        key={notif.id}
                        id={`notif-${notif.id}`}
                        className={`p-4 hover:bg-stone-50 transition-colors flex gap-3 items-start cursor-pointer ${
                          isUnread ? "bg-teal-50/15 border-l-2 border-teal-600" : ""
                        }`}
                        onClick={() => {
                          if (notif.type !== "login_activity") {
                            onSelectHorse(notif.horseId);
                          }
                          setIsOpen(false);
                        }}
                      >
                        <div className="flex-1 text-left">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">
                              {notif.type.replace("_", " ")}
                            </span>
                            <span className="text-[9px] text-stone-400 font-semibold font-mono">
                              {notif.type === "login_activity" ? "Security Log" : `Due: ${notif.dueDate}`}
                            </span>
                          </div>
                          <p className={`text-xs mt-1 leading-normal ${isUnread ? "text-stone-950 font-extrabold" : "text-stone-600 font-medium"}`}>
                            {notif.message}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 self-center shrink-0">
                          {notif.type === "login_activity" ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissNotification(notif.id);
                                }}
                                className="p-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer flex items-center justify-center gap-1 text-[9px] font-black uppercase"
                                title="Approve & Dismiss Login notification"
                              >
                                <Check size={11} /> Tick
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Are you absolutely sure you want to force remote logout/session reset for ${notif.username || "this user"}?`)) {
                                    handleRemoteLogoutUser(notif);
                                  }
                                }}
                                className="p-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer flex items-center justify-center gap-1 text-[9px] font-black uppercase animate-pulse"
                                title="Force Remote Session Reset (X)"
                              >
                                <X size={11} /> Terminate
                              </button>
                            </>
                          ) : (
                            <>
                              {isUnread && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(notif.id);
                                  }}
                                  className="p-1 rounded bg-stone-100 hover:bg-teal-100 text-stone-500 hover:text-teal-850 transition-colors cursor-pointer"
                                  title="Mark as read"
                                >
                                  <Check size={13} />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissNotification(notif.id);
                                }}
                                className="p-1 rounded bg-stone-100 hover:bg-rose-100 text-stone-400 hover:text-rose-700 transition-colors cursor-pointer"
                                title="Dismiss notification"
                              >
                                <X size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Footer */}
            <div className="p-3 bg-stone-50 text-center border-t border-stone-100 flex justify-between items-center px-4">
              <span className="text-[9px] text-stone-400 font-mono">
                Ruabon Farm Alert System
              </span>
              <span className="text-[9px] text-stone-400 font-mono">
                Real-time Sync
              </span>
            </div>
          </div>
        </>
      )}

      {/* Email Viewer Simulator Modal */}
      {viewingEmail && (
        <div 
          className="fixed inset-0 bg-stone-900/65 backdrop-blur-xs z-[150] flex items-center justify-center p-4 overflow-y-auto text-left cursor-pointer" 
          id="email-viewer-modal"
          onClick={() => setViewingEmail(null)}
        >
          <div 
            className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-xl w-full p-6 space-y-4 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start pb-3 border-b border-stone-200">
              <div className="space-y-1">
                <span className={`inline-block text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                  viewingEmail.realEmailSent 
                    ? "bg-emerald-100 text-emerald-800" 
                    : "bg-teal-100 text-teal-800"
                }`}>
                  {viewingEmail.realEmailSent ? "✓ Delivered Real Email via Resend" : "📬 Simulated Inbox Transmission"}
                </span>
                <h3 className="text-sm font-black text-stone-900 uppercase">
                  {viewingEmail.subject}
                </h3>
                <div className="text-[10px] text-stone-500 font-bold uppercase">
                  To: <span className="text-teal-600 font-extrabold">{viewingEmail.recipient}</span> • Sent: {new Date(viewingEmail.timestamp).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingEmail(null)}
                className="bg-stone-50 border border-stone-200 hover:bg-stone-100 text-stone-600 hover:text-stone-900 rounded-xl p-2 cursor-pointer transition-all"
              >
                <X size={14} />
              </button>
            </div>

            {/* Email HTML Contents sandboxed in a clean container */}
            <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 max-h-[400px] overflow-y-auto font-sans text-stone-800">
              <div dangerouslySetInnerHTML={{ __html: viewingEmail.body }} />
            </div>

            <div className="flex justify-end pt-2 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setViewingEmail(null)}
                className="bg-stone-900 hover:bg-stone-850 text-white font-black text-[10px] uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all cursor-pointer"
              >
                Close Outbox Mail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
