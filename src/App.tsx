import React, { useState, useEffect, useMemo } from "react";
import { db, logAuditAction } from "./firebase";
import { collection, onSnapshot, query, orderBy, collectionGroup, addDoc, doc, deleteDoc, setDoc, updateDoc } from "firebase/firestore";
import { Horse, MaintenanceLog, SystemUser } from "./types";
import { getPlanHorseLimit } from "./utils/planLimits";
import DashboardStats from "./components/DashboardStats";
import NotificationCenter from "./components/NotificationCenter";
import HorseCard from "./components/HorseCard";
import AddHorseModal from "./components/AddHorseModal";
import MaintenanceForm from "./components/MaintenanceForm";
import HorseDetail from "./components/HorseDetail";
import HorseSenseLogo from "./components/HorseSenseLogo";
import PublicLandingPage, { INITIAL_FARMS } from "./components/PublicLandingPage";
import LoginScreen from "./components/LoginScreen";
import MarkingScanner from "./components/MarkingScanner";
import VisitorDashboard from "./components/VisitorDashboard";
import RanchTaskList from "./components/RanchTaskList";
import BulkEditModal from "./components/BulkEditModal";
import ImportCSVModal from "./components/ImportCSVModal";
import PrivateNotesList from "./components/PrivateNotesList";
import HorsesenseAIChat from "./components/HorsesenseAIChat";
import CooperPasskeyManager from "./components/CooperPasskeyManager";
import WeatherWidget from "./components/WeatherWidget";
import ProfileEditor from "./components/ProfileEditor";
import TeamMessaging from "./components/TeamMessaging";
import LoginHistory from "./components/LoginHistory";
import OwnerStation from "./components/OwnerStation";
import AccessRequestsManager from "./components/AccessRequestsManager";
import FinancePage from "./components/FinancePage";
import ChecksCalendar from "./components/ChecksCalendar";
import TutorialPage from "./components/TutorialPage";
import PaddockHealthSummary from "./components/PaddockHealthSummary";
import VisitorActivityHeatmap from "./components/VisitorActivityHeatmap";
import AdminLoginScreen from "./components/AdminLoginScreen";
import AdminStation from "./components/AdminStation";
import { getShoeingStatus, getVetStatus } from "./utils/scheduler";
import { ensureDemoHorsesExist, ensureDeltaFarmExists } from "./utils/demoHorses";
import { downloadHerdZip } from "./utils/csv";
import { Plus, Search, Filter, RefreshCw, Award, Shield, Sparkles, Download, LogOut, Camera, Sliders, Upload, ArrowUp, ArrowDown, Check, Loader2, X, AlertCircle, ShieldAlert, BookOpen, Compass, Activity, Users, User, ArrowLeft, ArrowRight, Bell, Sun, Moon, Key, ShieldCheck, SlidersHorizontal, Maximize2, Minimize2, EyeOff, RotateCcw, GripVertical, Globe } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { generateHourlyBypassCode } from "./utils/security";
import { playSound } from "./utils/audio";
import AISettingsPage from "./components/AISettingsPage";
import { triggerHaptic } from "./utils/haptics";

const modalContainerVariants = {
  hidden: { 
    opacity: 0, 
    y: 20, 
    scale: 0.95 
  },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: {
      type: "spring",
      damping: 25,
      stiffness: 350,
      delayChildren: 0.05,
      staggerChildren: 0.06
    }
  },
  hover: {
    scale: 0.97,
    transition: { type: "spring", damping: 20, stiffness: 350 }
  },
  exit: { 
    opacity: 0, 
    y: 15, 
    scale: 0.95,
    transition: { duration: 0.2 }
  }
};

const modalItemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring", stiffness: 350, damping: 25 }
  }
};

function getFarmNameFromPath(path: string, dynamicFarms: { id: string; name: string }[] = []): string | null {
  if (!path) return null;
  const clean = decodeURIComponent(path).trim().replace(/^\/+|\/+$/g, "");
  if (!clean) return null;
  
  const lower = clean.toLowerCase();
  const slug = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug || lower === "admin" || lower === "index.html" || lower === "favicon.ico" || lower.startsWith("api/")) {
    return null;
  }

  let deletedFarmIds: string[] = [];
  try {
    const savedDeleted = localStorage.getItem("deleted_farm_ids");
    if (savedDeleted) deletedFarmIds = JSON.parse(savedDeleted);
  } catch (e) {}

  const allFarms = [...INITIAL_FARMS, ...dynamicFarms].filter(f => !deletedFarmIds.includes(f.id));

  // Check matching registered farm in INITIAL_FARMS or dynamicFarms
  const matchingRegistered = allFarms.find(f => {
    const nameSlug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const idSlug = f.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const rawId = f.id.toLowerCase();
    const rawName = f.name.toLowerCase();
    return (
      slug === nameSlug ||
      slug === idSlug ||
      lower === rawId ||
      lower === rawName ||
      (slug === "ruabon-farm" && f.id === "ruabon_farm") ||
      (slug.includes("ruabon") && rawName.includes("ruabon"))
    );
  });
  if (matchingRegistered) {
    return matchingRegistered.name;
  }

  // Check matching recent farms stored in localStorage ONLY IF it exists in allFarms
  try {
    const savedRecent = localStorage.getItem("recent_farms");
    if (savedRecent) {
      const list: string[] = JSON.parse(savedRecent);
      const match = list.find(r => {
        const rSlug = r.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (rSlug === slug || r.toLowerCase() === lower) {
          return allFarms.some(af => af.name.toLowerCase() === r.toLowerCase());
        }
        return false;
      });
      if (match) return match;
    }
  } catch (e) {}

  // DO NOT dynamically format unknown slug into a fake farm! Return null to display 404.
  return null;
}

export default function App() {
  const [horses, setHorses] = useState<Horse[]>([]);
  const [allLogs, setAllLogs] = useState<MaintenanceLog[]>([]);
  const [bulkConfirmData, setBulkConfirmData] = useState<{
    groupHorses: Horse[];
    groupName: string;
    firstTimeCount: number;
    warningCount: number;
    warningNames: string[];
    onConfirm: () => void;
  } | null>(null);
  
  const [successCheckGroupName, setSuccessCheckGroupName] = useState<string | null>(null);
  
  useEffect(() => {
    document.title = "Nova Herd";
  }, []);

  // User Authentication State - Auto restore session if user has been on website/app
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(() => {
    try {
      const saved = localStorage.getItem("horsesense_user");
      if (saved) {
        const parsed = JSON.parse(saved) as SystemUser;
        if (parsed && parsed.name && parsed.role) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Auto-login restore error:", e);
    }
    return null;
  });

  const [registeredFarmsList, setRegisteredFarmsList] = useState<{ id: string; name: string; plan?: string }[]>([]);

  useEffect(() => {
    const unsubFarms = onSnapshot(collection(db, "registered_farms"), (snapshot) => {
      const list: { id: string; name: string; plan?: string }[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.name) {
          list.push({ id: d.id, name: data.name, plan: data.plan });
        }
      });
      setRegisteredFarmsList(list);
    });
    return () => unsubFarms();
  }, []);

  const [selectedFarmForLogin, setSelectedFarmForLogin] = useState<string | null>(() => {
    return getFarmNameFromPath(window.location.pathname, []);
  });

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("horsesense_theme");
    return (saved as "light" | "dark") || "light";
  });

  const [presetTags, setPresetTags] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("horsesense_preset_tags");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      "Competition", "Retired", "Foal", "Therapy", "Training", "Rescue", "Breeding",
      "Lessons", "Spooky", "Beginner Safe", "Advanced", "Rehab", "Trail", "Spell", 
      "Farrier Overdue", "Agistment", "aggistor horse"
    ];
  });

  const [featurePermissions, setFeaturePermissions] = useState<any>({
    messagingEnabledForCrew: "everyone",
    messagingAllowedCrewUsers: [],
    messagingEnabledForGuests: "everyone",
    messagingAllowedGuestIds: [],
    messagingEnabledForAgistors: "everyone",
    messagingAllowedAgistorIds: [],
    dailyChecksEnabledForCrew: "everyone",
    dailyChecksAllowedCrewUsers: []
  });

  useEffect(() => {
    const unsubPermissions = onSnapshot(doc(db, "ranch_settings", "permissions"), (docSnap) => {
      if (docSnap.exists()) {
        setFeaturePermissions(docSnap.data());
      } else {
        const initialPermissions = {
          messagingEnabledForCrew: "everyone",
          messagingAllowedCrewUsers: [],
          messagingEnabledForGuests: "everyone",
          messagingAllowedGuestIds: [],
          messagingEnabledForAgistors: "everyone",
          messagingAllowedAgistorIds: [],
          dailyChecksEnabledForCrew: "everyone",
          dailyChecksAllowedCrewUsers: []
        };
        setDoc(doc(db, "ranch_settings", "permissions"), initialPermissions).catch(console.error);
      }
    });
    return () => unsubPermissions();
  }, []);

  useEffect(() => {
    const unsubPresets = onSnapshot(doc(db, "ranch_settings", "presets"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.tags)) {
          setPresetTags(data.tags);
          localStorage.setItem("horsesense_preset_tags", JSON.stringify(data.tags));
        }
      } else {
        const initialTags = [
          "Competition", "Retired", "Foal", "Therapy", "Training", "Rescue", "Breeding",
          "Lessons", "Spooky", "Beginner Safe", "Advanced", "Rehab", "Trail", "Spell", 
          "Farrier Overdue", "Agistment", "aggistor horse"
        ];
        setDoc(doc(db, "ranch_settings", "presets"), { tags: initialTags }).catch(console.error);
      }
    });
    return () => unsubPresets();
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const themeRef = React.useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  // Automatic Night Shift Mode (8:00 PM - 6:00 AM)
  useEffect(() => {
    const checkNightShift = async () => {
      const hour = new Date().getHours();
      const isNight = hour >= 20 || hour < 6;
      if (isNight) {
        const nightShiftTriggered = sessionStorage.getItem("horsesense_night_shift_triggered");
        if (!nightShiftTriggered && themeRef.current !== "dark") {
          setTheme("dark");
          localStorage.setItem("horsesense_theme", "dark");
          sessionStorage.setItem("horsesense_night_shift_triggered", "true");
          if (currentUser) {
            try {
              if (currentUser.role === "visitor") {
                const docId = currentUser.name.toLowerCase().replace(/\s+/g, "_");
                await updateDoc(doc(db, "visitor_permissions", docId), { theme: "dark" });
              } else {
                await updateDoc(doc(db, "crew_profiles", currentUser.name), { theme: "dark" });
              }
            } catch (err) {
              console.warn("Failed to sync theme to DB:", err);
            }
          }
        }
      }
    };
    checkNightShift();
    const interval = setInterval(checkNightShift, 60000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const toggleTheme = async () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("horsesense_theme", nextTheme);
    if (currentUser) {
      try {
        if (currentUser.role === "visitor") {
          const docId = currentUser.name.toLowerCase().replace(/\s+/g, "_");
          await updateDoc(doc(db, "visitor_permissions", docId), { theme: nextTheme });
        } else {
          await updateDoc(doc(db, "crew_profiles", currentUser.name), { theme: nextTheme });
        }
      } catch (err) {
        console.warn("Failed to sync theme to DB:", err);
      }
    }
  };

  const [hasAgreedOnboardingTos, setHasAgreedOnboardingTos] = useState(true);
  const [onboardingTosText, setOnboardingTosText] = useState("");
  const [showTosModal, setShowTosModal] = useState(false);

  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);
  const [newVisitorPin, setNewVisitorPin] = useState("");
  const [newVisitorPinConfirm, setNewVisitorPinConfirm] = useState("");
  const [pinCreationError, setPinCreationError] = useState<string | null>(null);

  // If visitor leaves the site or closes the tab/session without completing onboarding (making a PIN), delete their account!
  useEffect(() => {
    if (currentUser && currentUser.role === "visitor" && currentUser.hasSeenTutorial !== true) {
      const handleBeforeUnload = () => {
        const docId = currentUser.name.toLowerCase().replace(/\s+/g, "_");
        // We use a synchronous XMLHttpRequest to delete the Firestore doc to guarantee it gets sent before unload
        const projectId = "ai-studio-horsesense-990d12d6-79b5-4b3b-8b5d-b4a72c8f8204";
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/visitor_permissions/${docId}`;
        const xhr = new XMLHttpRequest();
        xhr.open("DELETE", url, false); // false makes it synchronous
        xhr.send();
      };
      
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    }
  }, [currentUser]);

  // Clean up incomplete visitor accounts upon initial application mount / load if they didn't complete onboarding
  useEffect(() => {
    const cleanupIncompleteVisitorOnLoad = async () => {
      const savedUser = localStorage.getItem("horsesense_user");
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser) as SystemUser;
          if (user && user.role === "visitor" && user.hasSeenTutorial !== true) {
            const docId = user.name.toLowerCase().replace(/\s+/g, "_");
            const { doc, deleteDoc } = await import("firebase/firestore");
            await deleteDoc(doc(db, "visitor_permissions", docId));
            localStorage.removeItem("horsesense_user");
            setCurrentUser(null);
          }
        } catch (e) {
          console.error("Cleanup error during load:", e);
        }
      }
    };
    cleanupIncompleteVisitorOnLoad();
  }, []);

  useEffect(() => {
    const unsubTos = onSnapshot(doc(db, "config", "terms_of_service"), (snap) => {
      if (snap.exists()) {
        setOnboardingTosText(snap.data().text || "");
      } else {
        setOnboardingTosText("Welcome to Horse Sense Operations. By accessing this platform, you agree to safeguard all equestrian medical records, maintain staff PIN confidentiality, and report any unscheduled gate scans or security incidents immediately to Farm Administration.");
      }
    });
    return () => unsubTos();
  }, []);

  // Apply dark class to document elements for low-light barn operations
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("horsesense_theme", theme);
  }, [theme]);

  // Synchronize current user profile changes in real-time
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "visitor") {
      const docId = currentUser.name.toLowerCase().replace(/\s+/g, "_");
      const unsub = onSnapshot(doc(db, "visitor_permissions", docId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.forceLogout) {
            updateDoc(doc(db, "visitor_permissions", docId), { forceLogout: false });
            setCurrentUser(null);
            localStorage.removeItem("horsesense_user");
            return;
          }
          if (data.theme && (data.theme === "light" || data.theme === "dark")) {
            setTheme(prev => {
              if (prev !== data.theme) {
                localStorage.setItem("horsesense_theme", data.theme);
                return data.theme;
              }
              return prev;
            });
          } else {
            updateDoc(docSnap.ref, { theme: themeRef.current }).catch(err => console.warn("Failed to sync default theme:", err));
          }
          const updatedUser = { ...currentUser, ...data };
          setCurrentUser(updatedUser);
          localStorage.setItem("horsesense_user", JSON.stringify(updatedUser));
        }
      });
      return () => unsub();
    } else {
      const unsub = onSnapshot(doc(db, "crew_profiles", currentUser.name), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as SystemUser;
          if ((data as any).forceLogout) {
            updateDoc(doc(db, "crew_profiles", currentUser.name), { forceLogout: false });
            setCurrentUser(null);
            localStorage.removeItem("horsesense_user");
            return;
          }
          if (data.theme && (data.theme === "light" || data.theme === "dark")) {
            setTheme(prev => {
              if (prev !== data.theme) {
                localStorage.setItem("horsesense_theme", data.theme);
                return data.theme;
              }
              return prev;
            });
          } else {
            updateDoc(docSnap.ref, { theme: themeRef.current }).catch(err => console.warn("Failed to sync default theme:", err));
          }
          const updatedUser = { ...currentUser, ...data };
          setCurrentUser(updatedUser);
          localStorage.setItem("horsesense_user", JSON.stringify(updatedUser));
        }
      });
      return () => unsub();
    }
  }, [currentUser?.name, currentUser?.role]);
  


  // Offline paddock check sync trigger and count updater
  useEffect(() => {
    const updateCount = () => {
      try {
        const pending = JSON.parse(localStorage.getItem("horsesense_offline_checks") || "[]");
        setPendingSyncCount(pending.length);
      } catch {
        setPendingSyncCount(0);
      }
    };
    
    updateCount();
    const interval = setInterval(updateCount, 2500);

    const handleOnline = async () => {
      try {
        const pending = JSON.parse(localStorage.getItem("horsesense_offline_checks") || "[]");
        if (pending.length === 0) return;
        
        const { updateDoc, doc } = await import("firebase/firestore");
        for (const item of pending) {
          for (const hId of item.horseIds) {
            const horseObj = horses.find(h => h.id === hId);
            if (horseObj) {
              const history = horseObj.dailyChecksHistory || [];
              const newCheck = {
                id: Math.random().toString(36).substr(2, 9),
                date: item.date,
                checkedBy: item.checkedBy,
                status: "OK",
                timestamp: item.timestamp
              };
              await updateDoc(doc(db, "horses", hId), {
                lastCheckedDate: item.date,
                lastCheckedBy: item.checkedBy,
                lastCheckedStatus: "OK",
                dailyChecksHistory: [newCheck, ...history],
                updatedAt: item.date
              });
            }
          }
          if (currentUser) {
            await logAuditAction(
              currentUser.name,
              currentUser.role,
              "modify",
              `Synced offline Bulk Paddock Check for "${item.groupName}" (${item.horseIds.length} horses)`
            );
          }
        }
        localStorage.removeItem("horsesense_offline_checks");
        updateCount();
        alert("Online connection restored! Synchronized offline paddock check logs with database.");
      } catch (err) {
        console.error("Offline sync error:", err);
      }
    };

    window.addEventListener("online", handleOnline);
    if (navigator.onLine) {
      handleOnline();
    }
    return () => {
      window.removeEventListener("online", handleOnline);
      clearInterval(interval);
    };
  }, [horses, currentUser]);

  const handleManualSync = async () => {
    try {
      const pending = JSON.parse(localStorage.getItem("horsesense_offline_checks") || "[]");
      if (pending.length === 0) {
        alert("No offline checks to synchronize.");
        return;
      }
      if (!navigator.onLine) {
        alert("Your device is currently offline. Please restore connectivity first before trying to sync.");
        return;
      }
      
      const { updateDoc, doc } = await import("firebase/firestore");
      for (const item of pending) {
        for (const hId of item.horseIds) {
          const horseObj = horses.find(h => h.id === hId);
          if (horseObj) {
            const history = horseObj.dailyChecksHistory || [];
            const newCheck = {
              id: Math.random().toString(36).substr(2, 9),
              date: item.date,
              checkedBy: item.checkedBy,
              status: "OK",
              timestamp: item.timestamp
            };
            await updateDoc(doc(db, "horses", hId), {
              lastCheckedDate: item.date,
              lastCheckedBy: item.checkedBy,
              lastCheckedStatus: "OK",
              dailyChecksHistory: [newCheck, ...history],
              updatedAt: item.date
            });
          }
        }
        if (currentUser) {
          await logAuditAction(
            currentUser.name,
            currentUser.role,
            "modify",
            `Synced offline Bulk Paddock Check for "${item.groupName}" (${item.horseIds.length} horses) via manual Sync Now`
          );
        }
      }
      localStorage.removeItem("horsesense_offline_checks");
      setPendingSyncCount(0);
      alert("Manual sync successful! Offline paddock check logs have been synchronized.");
    } catch (err) {
      console.error("Manual sync error:", err);
      alert("Error syncing offline checks. Please try again when connection is stronger.");
    }
  };

  // Real-time Banned IPs & Client IP detection for lockdown
  const [bannedIps, setBannedIps] = useState<string[]>([]);
  const [bannedIpsList, setBannedIpsList] = useState<any[]>([]);
  const [clientIp, setClientIp] = useState("192.168.1.100");

  // Lockdown bypass state (non-persistent to force lockdown on reload)
  const [bypassInput, setBypassInput] = useState("");
  const [showBypassInput, setShowBypassInput] = useState(false);
  const [bypassError, setBypassError] = useState(false);
  const [isBypassed, setIsBypassed] = useState(false);

  // Appeal states
  const [showAppealView, setShowAppealView] = useState(false);
  const [appealName, setAppealName] = useState("");
  const [appealEmail, setAppealEmail] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [appealSuccess, setAppealSuccess] = useState<string | null>(null);
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  // Real-time emergency shutdown state
  const [shutdownActive, setShutdownActive] = useState(false);

  // Custom multi-stage system restoration flow (Cooper override)
  const [restorationActive, setRestorationActive] = useState(false);
  const [restorationStep, setRestorationStep] = useState<number>(0);
  const [restorationInputPin, setRestorationInputPin] = useState("");
  const [restorationInputMsg, setRestorationInputMsg] = useState("");
  const [restorationInputCode, setRestorationInputCode] = useState("");
  const [restorationInputMaster, setRestorationInputMaster] = useState("");
  const [restorationError, setRestorationError] = useState<string | null>(null);

  useEffect(() => {
    const unsubShutdown = onSnapshot(doc(db, "system_status", "emergency"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setShutdownActive(!!data.shutdownActive);
      } else {
        setShutdownActive(false);
      }
    });
    return () => unsubShutdown();
  }, []);

  useEffect(() => {
    if (shutdownActive && currentUser) {
      handleLogout();
    }
  }, [shutdownActive, currentUser]);

  const handleLogout = async () => {
    try {
      const deviceId = sessionStorage.getItem("horsesense_device_id");
      if (deviceId) {
        await updateDoc(doc(db, "active_devices", deviceId), {
          status: "inactive",
          lastActive: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error("Error setting active device as inactive on logout:", err);
    }
    if (currentUser) {
      await logAuditAction(currentUser.name, currentUser.role || "user", "logout", `${currentUser.name} logged out`);
    }
    setCurrentUser(null);
    localStorage.removeItem("horsesense_user");
  };

  const handleVerifyBypass = () => {
    const code = generateHourlyBypassCode();
    if (bypassInput.trim() === code) {
      setIsBypassed(true);
      setBypassError(false);
      setShowBypassInput(false);
      // Auto locks after 1.5 hours
      setTimeout(() => {
        setIsBypassed(false);
      }, 1.5 * 60 * 60 * 1000);
    } else {
      setBypassError(true);
    }
  };

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealName.trim() || !appealEmail.trim() || !appealReason.trim()) {
      alert("Please fill in all appeal fields.");
      return;
    }
    setSubmittingAppeal(true);
    setAppealSuccess(null);
    try {
      const { addDoc, collection } = await import("firebase/firestore");
      await addDoc(collection(db, "lockdown_appeals"), {
        name: appealName.trim(),
        email: appealEmail.trim(),
        reason: appealReason.trim(),
        clientIp: clientIp,
        timestamp: new Date().toISOString(),
        status: "pending"
      });
      setAppealSuccess("✓ Your ban appeal has been submitted successfully to Farm Administration.");
      setAppealName("");
      setAppealEmail("");
      setAppealReason("");
    } catch (err) {
      console.error("Error submitting appeal:", err);
      alert("Failed to save appeal. Please check connection.");
    } finally {
      setSubmittingAppeal(false);
    }
  };

  useEffect(() => {
    const unsubIps = onSnapshot(collection(db, "banned_ips"), (snapshot) => {
      const list: string[] = [];
      const records: any[] = [];
      snapshot.forEach((docSnap) => {
        const ip = docSnap.id.toLowerCase().trim();
        const data = docSnap.data();
        if (data && data.expiresAt && new Date() > new Date(data.expiresAt)) {
          // expired, skip
        } else {
          list.push(ip);
          records.push({
            ip,
            scope: data?.scope || "all",
            bannedProfiles: data?.bannedProfiles || [],
            expiresAt: data?.expiresAt || null
          });
        }
      });
      setBannedIps(list);
      setBannedIpsList(records);
    });

    // Detect client IP
    fetch("https://api.ipify.org?format=json")
      .then(r => r.json())
      .then(data => {
        if (data.ip) {
          setClientIp(data.ip);
          localStorage.setItem("visitor_detected_ip", data.ip);
        }
      })
      .catch(() => {
        const saved = localStorage.getItem("visitor_detected_ip");
        if (saved) {
          setClientIp(saved);
        }
      });

    return () => unsubIps();
  }, []);

  // Main Navigation tab state
  const [activeMainTab, setActiveMainTab] = useState<"directory" | "messaging" | "audit" | "owner_station" | "admin_station" | "access_requests" | "finance" | "checks_calendar" | "tutorial" | "ai_settings">("directory");
  const [isOwnerVerified, setIsOwnerVerified] = useState(false);

  // Dashboard Customisation and Navigation Header Order states
  const [customisationEnabled, setCustomisationEnabled] = useState<boolean>(() => {
    return localStorage.getItem("horsesense_dashboard_customisation_enabled") === "true";
  });

  const [dashboardWidgets, setDashboardWidgets] = useState<any[]>(() => {
    const saved = localStorage.getItem("horsesense_dashboard_widgets");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((w: any) => w.id !== "paddock_health" && w.id !== "activity_heatmap" && w.id !== "offline_paddock_checks");
        }
      } catch (e) {
        // ignore
      }
    }
    return [
      { id: "stats", title: "Dashboard Stats Banner", enabled: true },
      { id: "weather", title: "Weather Forecast Widget", enabled: true },
      { id: "tasks", title: "Farm Task Board", enabled: true },
      { id: "notes", title: "Private Notes Workspace", enabled: true },
    ];
  });

  const [headerOrder, setHeaderOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem("horsesense_header_order");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return ["directory", "messaging", "audit", "owner_station", "access_requests", "finance", "checks_calendar"];
  });

  // Undo Tracking History states
  const [previousDashboardWidgets, setPreviousDashboardWidgets] = useState<any[] | null>(null);
  const [previousHeaderOrder, setPreviousHeaderOrder] = useState<string[] | null>(null);
  const [draggedOverId, setDraggedOverId] = useState<string | null>(null);

  const handleToggleCustomisation = (val: boolean) => {
    setCustomisationEnabled(val);
    localStorage.setItem("horsesense_dashboard_customisation_enabled", String(val));
  };

  const handleUpdateWidgets = (updatedWidgets: any[]) => {
    setPreviousDashboardWidgets(dashboardWidgets);
    setDashboardWidgets(updatedWidgets);
    localStorage.setItem("horsesense_dashboard_widgets", JSON.stringify(updatedWidgets));
  };

  const handleUpdateHeaderOrder = (updatedOrder: string[]) => {
    setPreviousHeaderOrder(headerOrder);
    setHeaderOrder(updatedOrder);
    localStorage.setItem("horsesense_header_order", JSON.stringify(updatedOrder));
  };

  const handleUndoLastChange = () => {
    if (previousDashboardWidgets) {
      const currentWidgets = [...dashboardWidgets];
      setDashboardWidgets(previousDashboardWidgets);
      localStorage.setItem("horsesense_dashboard_widgets", JSON.stringify(previousDashboardWidgets));
      setPreviousDashboardWidgets(currentWidgets);
    }
    if (previousHeaderOrder) {
      const currentHeaders = [...headerOrder];
      setHeaderOrder(previousHeaderOrder);
      localStorage.setItem("horsesense_header_order", JSON.stringify(previousHeaderOrder));
      setPreviousHeaderOrder(currentHeaders);
    }
  };

  const handleResetLayout = () => {
    setPreviousDashboardWidgets(dashboardWidgets);
    setPreviousHeaderOrder(headerOrder);

    const defaultWidgets = [
      { id: "stats", title: "Dashboard Stats Banner", enabled: true },
      { id: "offline_paddock_checks", title: "Offline Pending Actions Log", enabled: true },
      { id: "weather", title: "Weather Forecast Widget", enabled: true },
      { id: "tasks", title: "Farm Task Board", enabled: true },
      { id: "notes", title: "Private Notes Workspace", enabled: true },
    ];
    setDashboardWidgets(defaultWidgets);
    localStorage.removeItem("horsesense_dashboard_widgets");

    const defaultHeaders = ["directory", "messaging", "audit", "owner_station", "access_requests", "finance", "checks_calendar"];
    setHeaderOrder(defaultHeaders);
    localStorage.removeItem("horsesense_header_order");
  };

  useEffect(() => {
    if (activeMainTab !== "owner_station" && activeMainTab !== "access_requests") {
      setIsOwnerVerified(false);
    }
  }, [activeMainTab]);

  // Log access history when employee views different sections/tabs
  useEffect(() => {
    if (currentUser && activeMainTab) {
      logAuditAction(
        currentUser.name,
        currentUser.role || "user",
        "view",
        `Navigated to and viewed section: ${activeMainTab.toUpperCase().replace("_", " ")}`
      );
    }
  }, [activeMainTab, currentUser?.name]);

  // Floating back to top button state
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Status Heartbeat for Employee Messaging Online status
  useEffect(() => {
    if (!currentUser) return;

    const updateStatus = async () => {
      try {
        await setDoc(doc(db, "user_status", currentUser.name), {
          name: currentUser.name,
          role: currentUser.role,
          title: currentUser.title || currentUser.role,
          status: "online",
          lastActive: new Date().toISOString(),
          avatarColor: currentUser.avatarColor || "bg-stone-100 text-stone-700 border-stone-200"
        }, { merge: true });
      } catch (err) {
        console.error("Error writing user heartbeat status:", err);
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 60000); // Heartbeat every 1 minute
    return () => clearInterval(interval);
  }, [currentUser]);

  // Active Device Tracking Heartbeat
  useEffect(() => {
    if (!currentUser) return;

    let deviceId = sessionStorage.getItem("horsesense_device_id");
    if (!deviceId) {
      deviceId = "dev_" + Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem("horsesense_device_id", deviceId);
    }

    const updateDevice = async () => {
      try {
        await setDoc(doc(db, "active_devices", deviceId), {
          id: deviceId,
          name: currentUser.name,
          role: currentUser.role || "user",
          ip: clientIp || "Unknown",
          userAgent: navigator.userAgent,
          lastActive: new Date().toISOString(),
          status: "active"
        }, { merge: true });
      } catch (err) {
        console.error("Error setting active device status:", err);
      }
    };

    updateDevice();
    const interval = setInterval(updateDevice, 30000); // Update every 30 seconds

    return () => {
      clearInterval(interval);
    };
  }, [currentUser, clientIp]);

  // Real-time listener for active device session termination / force logouts
  useEffect(() => {
    if (!currentUser) return;

    const deviceId = sessionStorage.getItem("horsesense_device_id");
    if (!deviceId) return;

    const unsub = onSnapshot(doc(db, "active_devices", deviceId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status === "force_logout" || data.status === "locked_down") {
          // Temporarily set it to inactive in db so subsequent logins don't loop
          updateDoc(doc(db, "active_devices", deviceId), { status: "inactive" }).catch(() => {});
          alert("🔒 Security Alert: This specific browser terminal session has been force logged out by the farm administrator.");
          handleLogout();
        }
      }
    });

    return () => unsub();
  }, [currentUser]);

  // Handle scroll events for Floating back-to-top button
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  
  // UI Selection States
  const [selectedHorseId, setSelectedHorseId] = useState<string | null>(null);
  const [maintenanceHorse, setMaintenanceHorse] = useState<Horse | null>(null);
  
  // Modal toggle states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isImportCSVOpen, setIsImportCSVOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"profile" | "customisation" | "presets" | "ai">("profile");
  const [isStartup, setIsStartup] = useState(true);
  const [isHoveringBackdrop, setIsHoveringBackdrop] = useState(false);

  // Routing & Admin login states
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handleLocationChange);
    
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    window.history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleLocationChange();
    };
    window.history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleLocationChange();
    };
    
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  useEffect(() => {
    const farmFromUrl = getFarmNameFromPath(currentPath);
    if (farmFromUrl) {
      setSelectedFarmForLogin(farmFromUrl);
    } else if (currentPath === "/" || currentPath === "") {
      setSelectedFarmForLogin(null);
    }
  }, [currentPath]);

  useEffect(() => {
    const isAdminPath = currentPath === "/admin" || currentPath === "/admin/" || currentPath.toLowerCase().endsWith("/admin") || currentPath.toLowerCase().endsWith("/admin/");
    if (isAdminPath && currentUser) {
      if (currentUser.role === "owner") {
        setActiveMainTab("owner_station");
        setIsOwnerVerified(true);
      } else if (currentUser.role === "admin") {
        setActiveMainTab("admin_station");
        setIsOwnerVerified(true);
      }
    }
  }, [currentPath, currentUser]);

  useEffect(() => {
    const isAdminPath = currentPath === "/admin" || currentPath === "/admin/" || currentPath.toLowerCase().endsWith("/admin") || currentPath.toLowerCase().endsWith("/admin/");
    if (isAdminPath && activeMainTab !== "owner_station" && activeMainTab !== "admin_station") {
      if (currentUser && currentUser.role !== "owner" && currentUser.role !== "admin") {
        window.history.pushState({}, "", "/");
        setCurrentPath("/");
      }
    }
  }, [activeMainTab, currentPath, currentUser]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStartup(false);
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

  // Remove auto-present Terms of Service modal overlay, directing to start page instead
  const [agreedToTosOnboarding, setAgreedToTosOnboarding] = useState(false);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "shoeing_overdue" | "vet_overdue" | "branded">("all");
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Advanced Filters State
  const [filterPaddock, setFilterPaddock] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterDob, setFilterDob] = useState("");
  const [filterAgisted, setFilterAgisted] = useState<"all" | "yes" | "no">("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Current operational date format from additional metadata, now dynamically resetting at midnight AWST
  const getTodayStrAWST = () => {
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Perth",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
      return formatter.format(new Date());
    } catch (e) {
      const d = new Date();
      const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      const awstDate = new Date(utc + (3600000 * 8));
      const year = awstDate.getFullYear();
      const month = String(awstDate.getMonth() + 1).padStart(2, '0');
      const day = String(awstDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  };
  const todayStr = getTodayStrAWST(); 

  // Deletion logic for horse document
  const handleDeleteHorse = async (horseId: string) => {
    try {
      await deleteDoc(doc(db, "horses", horseId));
      if (selectedHorseId === horseId) {
        setSelectedHorseId(null);
      }
    } catch (error) {
      console.error("Error deleting horse:", error);
    }
  };

  // Bulk Paddock check & 7-day rolling daily checks states
  const [isBulkPaddockCheckOpen, setIsBulkPaddockCheckOpen] = useState(false);
  const [isGroupingLoading, setIsGroupingLoading] = useState(false);
  const [paddockGroups, setPaddockGroups] = useState<any[]>([]);
  const [bulkFilter, setBulkFilter] = useState<"all" | "overdue" | "uptodate">("all");
  const [dailyCheckError, setDailyCheckError] = useState<string | null>(null);
  const [bulkEmailAlertToggle, setBulkEmailAlertToggle] = useState(true);
  const [paddockSort, setPaddockSort] = useState<"name" | "count_desc" | "count_asc">("name");
  const [bulkHorseSort, setBulkHorseSort] = useState<"name" | "last_check" | "stable">("name");

  const isMessagingAllowed = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === "owner" || currentUser.role === "admin" || currentUser.name === "System Administrator") return true;

    // Crew Check
    const isCrew = currentUser.role === "admin" || currentUser.role === "user";
    if (isCrew) {
      const mode = featurePermissions?.messagingEnabledForCrew || "everyone";
      if (mode === "everyone") return true;
      if (mode === "none") return false;
      if (mode === "custom") {
        return (featurePermissions?.messagingAllowedCrewUsers || []).includes(currentUser.name);
      }
    } else if (currentUser.role === "visitor") {
      // It is visitor (guest or agistor)
      const docId = currentUser.name.toLowerCase().replace(/\s+/g, "_");
      if (currentUser.isAgistorRider) {
        const mode = featurePermissions?.messagingEnabledForAgistors || "everyone";
        if (mode === "everyone") return true;
        if (mode === "none") return false;
        if (mode === "custom") {
          return (featurePermissions?.messagingAllowedAgistorIds || []).includes(docId);
        }
      } else {
        const mode = featurePermissions?.messagingEnabledForGuests || "everyone";
        if (mode === "everyone") return true;
        if (mode === "none") return false;
        if (mode === "custom") {
          return (featurePermissions?.messagingAllowedGuestIds || []).includes(docId);
        }
      }
    }
    return true;
  }, [currentUser, featurePermissions]);

  const isDailyChecksAllowed = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === "owner" || currentUser.role === "admin" || currentUser.name === "System Administrator") return true;

    const isCrew = currentUser.role === "admin" || currentUser.role === "user";
    if (isCrew) {
      const mode = featurePermissions?.dailyChecksEnabledForCrew || "everyone";
      if (mode === "everyone") return true;
      if (mode === "none") return false;
      if (mode === "custom") {
        return (featurePermissions?.dailyChecksAllowedCrewUsers || []).includes(currentUser.name);
      }
    }
    return true;
  }, [currentUser, featurePermissions]);

  useEffect(() => {
    if (activeMainTab === "messaging" && !isMessagingAllowed) {
      setActiveMainTab("directory");
    }
  }, [activeMainTab, isMessagingAllowed]);

  // AI Smart search & Location Match states
  const [customSearchPaddock, setCustomSearchPaddock] = useState("");
  const [isCustomMatching, setIsCustomMatching] = useState(false);
  const [customMatchedPaddocks, setCustomMatchedPaddocks] = useState<string[]>([]);
  const [customMatchedHorses, setCustomMatchedHorses] = useState<Horse[]>([]);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("horsesense_recent_searches") || "[]");
    } catch {
      return [];
    }
  });

  const handleAddRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(t => t.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 3);
      localStorage.setItem("horsesense_recent_searches", JSON.stringify(updated));
      return updated;
    });
  };

  const handleCustomAIMatch = async () => {
    if (!customSearchPaddock.trim()) return;
    setIsCustomMatching(true);
    setCustomMatchedPaddocks([]);
    setCustomMatchedHorses([]);
    try {
      const allUniquePaddocks = Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))) as string[];
      const res = await fetch("/api/match-custom-paddock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPaddock: customSearchPaddock,
          paddocks: allUniquePaddocks
        })
      });
      const data = await res.json();
      const matchedList = data.matches || [];
      setCustomMatchedPaddocks(matchedList);
      
      const matchedHorsesList = horses.filter(h => h.stableNumber && matchedList.includes(h.stableNumber));
      setCustomMatchedHorses(matchedHorsesList);
    } catch (error) {
      console.error("Error matching custom paddock:", error);
    } finally {
      setIsCustomMatching(false);
    }
  };

  const handleQuickCheckOk = async (horse: Horse, checkNotes?: string) => {
    if (!isDailyChecksAllowed) {
      setDailyCheckError("You do not have permission to log daily checks. Please contact Farm Administration.");
      setTimeout(() => setDailyCheckError(null), 5000);
      return;
    }
    try {
      const checkerName = currentUser?.name || "Staff";
      
      const history = horse.dailyChecksHistory || [];
      const newCheck = {
        id: Math.random().toString(36).substr(2, 9),
        date: todayStr,
        checkedBy: checkerName,
        status: checkNotes || "OK",
        timestamp: Date.now()
      };
      
      const todayDateObj = new Date(todayStr);
      const filteredHistory = [newCheck, ...history].filter((check: any) => {
        try {
          const checkDateObj = new Date(check.date);
          const diffTime = Math.abs(todayDateObj.getTime() - checkDateObj.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays <= 7;
        } catch {
          return true;
        }
      });

      const { updateDoc, doc } = await import("firebase/firestore");
      await updateDoc(doc(db, "horses", horse.id), {
        lastCheckedDate: todayStr,
        lastCheckedBy: checkerName,
        lastCheckedStatus: checkNotes || "OK",
        dailyChecksHistory: filteredHistory,
        updatedAt: todayStr
      });

      if (currentUser) {
        await logAuditAction(currentUser.name, currentUser.role, "modify", `Logged Daily Check (${checkNotes || "OK"}) for horse ${horse.name}`);
      }
      playSound("success");
    } catch (error) {
      console.error("Error logging daily check:", error);
      playSound("error");
    }
  };



  const handleAIGroupPaddocks = async () => {
    setIsGroupingLoading(true);
    try {
      const uniquePaddocks = Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean)));
      const response = await fetch("/api/group-paddocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paddocks: uniquePaddocks })
      });
      const data = await response.json();
      
      const mappedGroups = (data.groups || []).map((group: any) => {
        const groupHorses = horses.filter(h => h.stableNumber && group.locations.includes(h.stableNumber));
        return {
          ...group,
          horses: groupHorses
        };
      });
      
      setPaddockGroups(mappedGroups);
    } catch (error) {
      console.error("Error grouping paddocks with AI:", error);
      // Fallback simple grouping
      const rawGroups = Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))).map(loc => {
        return {
          canonicalName: loc,
          locations: [loc],
          horses: horses.filter(h => h.stableNumber === loc)
        };
      });
      setPaddockGroups(rawGroups);
    } finally {
      setIsGroupingLoading(false);
    }
  };

  const executeBulkCheckOk = async (groupHorses: Horse[], groupName: string) => {
    try {
      const checkerName = currentUser?.name || "Staff";

      if (!navigator.onLine) {
        const pending = JSON.parse(localStorage.getItem("horsesense_offline_checks") || "[]");
        pending.push({
          groupName,
          horseIds: groupHorses.map(h => h.id),
          date: todayStr,
          checkedBy: checkerName,
          timestamp: Date.now()
        });
        localStorage.setItem("horsesense_offline_checks", JSON.stringify(pending));
        alert(`Device is offline! Saved bulk paddock check for "${groupName}" locally. It will auto-sync once connection is restored.`);
        return;
      }

      const { updateDoc, doc } = await import("firebase/firestore");
      
      for (const horse of groupHorses) {
        const history = horse.dailyChecksHistory || [];
        const newCheck = {
          id: Math.random().toString(36).substr(2, 9),
          date: todayStr,
          checkedBy: checkerName,
          status: "OK",
          timestamp: Date.now()
        };
        
        const todayDateObj = new Date(todayStr);
        const filteredHistory = [newCheck, ...history].filter((check: any) => {
          try {
            const checkDateObj = new Date(check.date);
            const diffTime = Math.abs(todayDateObj.getTime() - checkDateObj.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 7;
          } catch {
            return true;
          }
        });

        await updateDoc(doc(db, "horses", horse.id), {
          lastCheckedDate: todayStr,
          lastCheckedBy: checkerName,
          lastCheckedStatus: "OK",
          dailyChecksHistory: filteredHistory,
          updatedAt: todayStr
        });
      }

      // Background Automated Email dispatch compiling skips and overdue flags
      try {
        const checkedData = groupHorses.map(h => ({ name: h.name, stableNumber: h.stableNumber }));
        
        // Find all horses in the paddock residences that might have been skipped
        const paddockResidences = groupHorses.map(h => h.stableNumber).filter(Boolean);
        const allPaddockHorses = horses.filter(h => h.stableNumber && paddockResidences.includes(h.stableNumber));
        const skippedData = allPaddockHorses
          .filter(h => !groupHorses.some(gh => gh.id === h.id))
          .map(h => ({ name: h.name, stableNumber: h.stableNumber }));

        // Detect maintenance flags (shoeing or vet overdue)
        const overdueFlags: any[] = [];
        allPaddockHorses.forEach(h => {
          const shoeing = getShoeingStatus(h, todayStr);
          const vet = getVetStatus(h, todayStr);
          if (shoeing?.status === "overdue") {
            overdueFlags.push({ horseName: h.name, flagType: `Farrier Shoeing Overdue (${shoeing.statusText})` });
          }
          if (vet?.status === "overdue") {
            overdueFlags.push({ horseName: h.name, flagType: `Veterinary Care Overdue (${vet.statusText})` });
          }
        });

        // Compute unique count of overdue horses inside the bulk check residences
        const overdueHorses = new Set(overdueFlags.map(f => f.horseName));
        const overdueCount = overdueHorses.size;
        const shouldSendEmail = bulkEmailAlertToggle;

        if (shouldSendEmail) {
          // Trigger the backend API to compile and send the summary
          fetch("/api/send-bulk-check-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paddockName: groupName,
              horsesCheckedCount: groupHorses.length,
              horsesChecked: checkedData,
              horsesSkipped: skippedData,
              overdueFlags,
              adminEmail: currentUser?.email || "admin@horsesense.app"
            })
          })
          .then(res => res.json())
          .then(async (result) => {
            console.log("Automated Admin Email Alert Triggered:", result);
            if (result.success) {
              await addDoc(collection(db, "sent_emails"), {
                subject: result.subject || `[Bulk Check Summary] Paddock: ${groupName}`,
                recipient: result.recipient || "admin@horsesense.app",
                body: result.emailHtml || "",
                realEmailSent: result.realEmailSent || false,
                timestamp: new Date().toISOString(),
                isTest: false
              });
            }
          })
          .catch(err => {
            console.warn("Could not dispatch admin email alert:", err);
          });
        } else {
          console.log(`Email alert skipped (Toggle: ${bulkEmailAlertToggle}, Overdue Count: ${overdueCount})`);
        }
      } catch (emailErr) {
        console.warn("Error compiling email metrics:", emailErr);
      }

      if (currentUser) {
        await logAuditAction(
          currentUser.name,
          currentUser.role,
          "modify",
          `Logged Bulk Paddock Check OK for paddock/group "${groupName}" (${groupHorses.length} horses)`
        );
      }
      
      setSuccessCheckGroupName(groupName);
      setTimeout(() => setSuccessCheckGroupName(null), 3500);
      playSound("success");

      setTimeout(() => {
        alert(`Successfully checked OK for all ${groupHorses.length} horses in "${groupName}"!`);
      }, 1200);
    } catch (error) {
      console.error("Error bulk checking paddock:", error);
      playSound("error");
      alert("Failed to complete bulk paddock check.");
    }
  };

  const handleBulkCheckOk = async (groupHorses: Horse[], groupName: string) => {
    if (!isDailyChecksAllowed) {
      setDailyCheckError("You do not have permission to log daily checks. Please contact Farm Administration.");
      setTimeout(() => setDailyCheckError(null), 5000);
      return;
    }
    if (groupHorses.length === 0) return;
    
    // Calculate stats for confirmation dialog
    const firstTimeCount = groupHorses.filter(h => h.lastCheckedDate !== todayStr).length;
    const warningHorses = groupHorses.filter(h => {
      const shoeing = getShoeingStatus(h, todayStr);
      const vet = getVetStatus(h, todayStr);
      return shoeing?.status === "overdue" || vet?.status === "overdue";
    });

    setBulkConfirmData({
      groupHorses,
      groupName,
      firstTimeCount,
      warningCount: warningHorses.length,
      warningNames: Array.from(new Set(warningHorses.map(h => h.name))),
      onConfirm: () => executeBulkCheckOk(groupHorses, groupName)
    });
  };

  const handleResetFinances = async () => {
    if (!currentUser || (currentUser.role !== "owner" && currentUser.role !== "admin")) {
      alert("Unauthorized: Only Admins or Owners can reset financial records.");
      return;
    }

    const confirmReset = window.confirm(
      "⚠️ WARNING: This will permanently delete ALL maintenance logs and transaction history for ALL horses. This action cannot be undone.\n\nAre you sure you want to proceed?"
    );
    if (!confirmReset) return;

    try {
      const { getDocs, deleteDoc, query, collectionGroup } = await import("firebase/firestore");
      
      // Query all logs using collectionGroup
      const logsQuery = query(collectionGroup(db, "logs"));
      const querySnapshot = await getDocs(logsQuery);
      
      if (querySnapshot.empty) {
        alert("The financial ledger is already empty!");
        return;
      }

      let deletedCount = 0;
      for (const docSnap of querySnapshot.docs) {
        await deleteDoc(docSnap.ref);
        deletedCount++;
      }

      await logAuditAction(
        currentUser.name,
        currentUser.role,
        "modify",
        `Permanently reset the Financial Ledger: deleted ${deletedCount} logs`
      );

      alert(`Financial Ledger reset completed! Permanently cleared ${deletedCount} transaction logs.`);
    } catch (error) {
      console.error("Error resetting finances:", error);
      alert("Failed to reset finances. Please check permissions or network.");
    }
  };

  // 1. Subscribe to Horses list in real-time with strict farm-level isolation
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "horses"), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Horse[] = [];
      const userFarmClean = (currentUser.farmName || "").toLowerCase().trim();
      const userFarmIdClean = (currentUser.farmId || "").toLowerCase().trim();
      const isRuabon = !userFarmClean || userFarmClean.includes("ruabon") || userFarmClean.includes("nova herd");
      const isDemoFarm = userFarmClean === "demo farm" || userFarmIdClean === "demo_farm";

      snapshot.forEach((docSnap) => {
        const horse = { id: docSnap.id, ...docSnap.data() } as Horse;
        const horseFarmClean = (horse.farmName || "").toLowerCase().trim();
        const horseFarmIdClean = (horse.farmId || "").toLowerCase().trim();

        if (isRuabon) {
          // Explicit rule: Demo Farm horses must NEVER enter Ruabon or Nova Herd
          if (horseFarmClean === "demo farm" || horseFarmIdClean === "demo_farm") {
            return;
          }
          // Ruabon sees Ruabon tagged horses or legacy horses without explicit other-farm tag
          if (!horseFarmClean && !horseFarmIdClean) {
            list.push(horse);
          } else if (
            horseFarmClean.includes("ruabon") || 
            horseFarmClean.includes("nova herd") || 
            horseFarmIdClean === "ruabon_farm" ||
            horseFarmIdClean === "nova_herd_main"
          ) {
            list.push(horse);
          }
        } else if (isDemoFarm) {
          // Demo Farm only sees Demo Farm horses
          if (horseFarmClean === "demo farm" || horseFarmIdClean === "demo_farm") {
            list.push(horse);
          }
        } else {
          // Custom farms only see their own livestock (never Demo Farm, never Ruabon)
          if (horseFarmClean === "demo farm" || horseFarmIdClean === "demo_farm") {
            return;
          }
          const matchesFarmName = horseFarmClean && horseFarmClean === userFarmClean;
          const matchesFarmId = horseFarmIdClean && (horseFarmIdClean === userFarmIdClean || horseFarmIdClean === userFarmClean.replace(/[^a-z0-9]+/g, "_"));
          if (matchesFarmName || matchesFarmId) {
            list.push(horse);
          }
        }
      });
      setHorses(list);

      // If Demo Farm has 0 horses, auto-seed demo horses instantly
      if (isDemoFarm && list.length === 0) {
        ensureDemoHorsesExist();
      }
      const isDeltaFarm = userFarmClean === "delta farm" || userFarmIdClean === "delta_farm";
      if (isDeltaFarm && list.length === 0) {
        ensureDeltaFarmExists();
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 2. Subscribe to all logs in real-time (using Collection Group to calculate dashboard metrics)
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collectionGroup(db, "logs"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: MaintenanceLog[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MaintenanceLog);
      });
      setAllLogs(list);
    }, (error) => {
      console.warn("Collection group query logs error (likely indexing required, using fallback calculation):", error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Filter logs strictly to current farm's horses
  const visibleLogs = useMemo(() => {
    const horseIds = new Set(horses.map(h => h.id));
    return allLogs.filter(l => horseIds.has(l.horseId));
  }, [allLogs, horses]);

  // 3. Find the selected horse object
  const selectedHorse = useMemo(() => {
    return horses.find((h) => h.id === selectedHorseId) || null;
  }, [horses, selectedHorseId]);

  // Pinned/Priority cards state persisted in localStorage
  const [pinnedHorseIds, setPinnedHorseIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("horsesense_pinned_ids");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleTogglePinHorse = (horseId: string) => {
    setPinnedHorseIds((prev) => {
      const next = prev.includes(horseId)
        ? prev.filter((id) => id !== horseId)
        : [...prev, horseId];
      localStorage.setItem("horsesense_pinned_ids", JSON.stringify(next));
      return next;
    });
  };

  // Drag-and-drop custom sorting order persisted in localStorage
  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("horsesense_custom_order");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sort horses: Pinned priority cards always sort to the top, then custom order, then alphabetical
  const sortedHorses = useMemo(() => {
    return [...horses].sort((a, b) => {
      const isPinnedA = pinnedHorseIds.includes(a.id);
      const isPinnedB = pinnedHorseIds.includes(b.id);
      if (isPinnedA && !isPinnedB) return -1;
      if (!isPinnedA && isPinnedB) return 1;

      const idxA = customOrder.indexOf(a.id);
      const idxB = customOrder.indexOf(b.id);
      
      if (idxA !== -1 && idxB !== -1) {
        return idxA - idxB;
      }
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      
      return a.name.localeCompare(b.name);
    });
  }, [horses, customOrder, pinnedHorseIds]);

  const handleReorder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    
    const currentOrderedIds = sortedHorses.map(h => h.id);
    const draggedIndex = currentOrderedIds.indexOf(draggedId);
    const targetIndex = currentOrderedIds.indexOf(targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const newOrder = [...currentOrderedIds];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);
    
    setCustomOrder(newOrder);
    localStorage.setItem("horsesense_custom_order", JSON.stringify(newOrder));
  };

  // Extract all unique tags dynamically
  const allUniqueTags = useMemo(() => {
    const tagsSet = new Set<string>(["Competition", "Retired", "Foal"]);
    horses.forEach((h) => {
      if (h.tags && Array.isArray(h.tags)) {
        h.tags.forEach((t) => {
          if (t && t.trim()) tagsSet.add(t.trim());
        });
      }
    });
    return Array.from(tagsSet);
  }, [horses]);

  // 4. Filter horses based on search input and filter toggles
  const filteredHorses = useMemo(() => {
    return sortedHorses.filter((horse) => {
      // Search matching
      const matchesSearch = 
        horse.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        horse.breed.toLowerCase().includes(searchTerm.toLowerCase()) ||
        horse.color.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // Advanced Paddock Filter
      if (filterPaddock) {
        const paddockStr = horse.stableNumber || "";
        if (!paddockStr.toLowerCase().includes(filterPaddock.toLowerCase())) {
          return false;
        }
      }

      // Advanced Name Filter
      if (filterName) {
        if (!horse.name.toLowerCase().includes(filterName.toLowerCase())) {
          return false;
        }
      }

      // Advanced DOB/Age Filter
      if (filterDob) {
        const ageStr = horse.age ? horse.age.toString() : "";
        const dobStr = horse.dob || "";
        const matchesDobOrAge = 
          ageStr.includes(filterDob) || 
          dobStr.toLowerCase().includes(filterDob.toLowerCase());
        if (!matchesDobOrAge) {
          return false;
        }
      }

      // Advanced Agisted Horse Filter
      if (filterAgisted !== "all") {
        const isAgisted = !!horse.agistedHorse;
        if (filterAgisted === "yes" && !isAgisted) return false;
        if (filterAgisted === "no" && isAgisted) return false;
      }

      // Filter matching
      if (activeFilter === "shoeing_overdue") {
        const shoeing = getShoeingStatus(horse, todayStr);
        if (!shoeing || (shoeing.status !== "overdue" && shoeing.status !== "warning")) return false;
      }
      if (activeFilter === "vet_overdue") {
        const vet = getVetStatus(horse, todayStr);
        if (!vet || vet.status !== "overdue") return false;
      }
      if (activeFilter === "branded") {
        if (!horse.brandingDescription) return false;
      }

      // Tag filter matching
      if (selectedTagFilter) {
        if (!horse.tags || !horse.tags.includes(selectedTagFilter)) return false;
      }

      return true;
    });
  }, [sortedHorses, searchTerm, activeFilter, selectedTagFilter, todayStr, filterPaddock, filterName, filterDob, filterAgisted]);

  const canSeeLoginHistory = useMemo(() => {
    return currentUser && (
      currentUser.role === "owner" ||
      currentUser.role === "admin" ||
      ["System Administrator", "Claire Wright", "Mark Wright"].some(name => currentUser.name.toLowerCase() === name.toLowerCase())
    );
  }, [currentUser]);

  // Global Real-time IP Block check (Lockdown screen)
  const isFullyBlocked = useMemo(() => {
    if (isBypassed) return false;
    const currentIpClean = clientIp.toLowerCase().trim();
    const rec = bannedIpsList.find(r => r.ip === currentIpClean);
    return !!(rec && (rec.scope === "all" || !rec.scope));
  }, [bannedIpsList, clientIp, isBypassed]);

  const isProfileBannedOnThisIp = useMemo(() => {
    if (isBypassed || !currentUser) return false;
    const currentIpClean = clientIp.toLowerCase().trim();
    const rec = bannedIpsList.find(r => r.ip === currentIpClean);
    return !!(rec && rec.scope === "profiles" && rec.bannedProfiles?.some((p: string) => p.toLowerCase() === currentUser.name.toLowerCase()));
  }, [currentUser, bannedIpsList, clientIp, isBypassed]);

  const isVisitorBlockedOnThisIp = useMemo(() => {
    if (isBypassed || currentUser?.role !== "visitor") return false;
    const currentIpClean = clientIp.toLowerCase().trim();
    const rec = bannedIpsList.find(r => r.ip === currentIpClean);
    return !!(rec && (rec.scope === "visitor" || rec.scope === "all"));
  }, [currentUser, bannedIpsList, clientIp, isBypassed]);

  const activeBanRecord = useMemo(() => {
    if (isBypassed) return null;
    const currentIpClean = clientIp.toLowerCase().trim();
    const ipRec = bannedIpsList.find(r => r.ip === currentIpClean && (r.scope === "all" || !r.scope));
    if (ipRec) return ipRec;
    if (currentUser) {
      const profRec = bannedIpsList.find(r => r.ip === currentIpClean && r.scope === "profiles" && r.bannedProfiles?.some((p: string) => p.toLowerCase() === currentUser.name.toLowerCase()));
      if (profRec) return profRec;
    }
    if (currentUser?.role === "visitor") {
      const visRec = bannedIpsList.find(r => r.ip === currentIpClean && (r.scope === "visitor" || r.scope === "all"));
      if (visRec) return visRec;
    }
    return null;
  }, [bannedIpsList, clientIp, currentUser, isBypassed]);

  const handleCompleteTutorial = async (visitorPin?: string) => {
    if (!currentUser) return;
    try {
      const { doc, updateDoc, collection, addDoc } = await import("firebase/firestore");
      
      // Log Terms of Service acceptance in dedicated Firestore collection
      await addDoc(collection(db, "tos_acceptances"), {
        name: currentUser.name,
        role: currentUser.role,
        acceptedAt: new Date().toISOString(),
        ipAddress: clientIp,
        userAgent: navigator.userAgent,
        platform: navigator.platform || "Unknown",
        language: navigator.language || "Unknown"
      });

      if (currentUser.role === "visitor") {
        const docId = currentUser.name.toLowerCase().replace(/\s+/g, "_");
        const updates: any = {
          hasSeenTutorial: true
        };
        if (visitorPin) {
          updates.pin = visitorPin;
        }
        await updateDoc(doc(db, "visitor_permissions", docId), updates);
      } else {
        await updateDoc(doc(db, "crew_profiles", currentUser.name), {
          hasSeenTutorial: true
        });
      }
      logAuditAction(currentUser.name, currentUser.role, "modify", "Accepted Terms of Service and completed systems onboarding");
    } catch (err) {
      console.error("Failed to complete tutorial in Firestore:", err);
      // Fallback update local state if firestore fails
      const updatedUser = { ...currentUser, hasSeenTutorial: true };
      if (visitorPin && currentUser.role === "visitor") {
        updatedUser.pin = visitorPin;
      }
      setCurrentUser(updatedUser);
      localStorage.setItem("horsesense_user", JSON.stringify(updatedUser));
    }
  };

  const isHomePath = currentPath === "/" || currentPath === "" || currentPath === "/index.html";
  const isAdminPath = currentPath === "/admin" || currentPath === "/admin/" || currentPath.toLowerCase().endsWith("/admin") || currentPath.toLowerCase().endsWith("/admin/");
  const farmFromPath = getFarmNameFromPath(currentPath, registeredFarmsList);
  const isValidFarmPath = Boolean(farmFromPath);

  // Unknown URL Fallback Page Not Found
  if (!isHomePath && !isAdminPath && !isValidFarmPath) {
    return (
      <div className="fixed inset-0 bg-stone-900 flex flex-col items-center justify-center text-center p-6 z-50 overflow-y-auto">
        <div className="max-w-md w-full bg-stone-950 border border-stone-850 p-8 rounded-3xl space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-stone-900 text-stone-400 rounded-full flex items-center justify-center border border-stone-800 mx-auto animate-bounce animate-duration-3000">
            <ShieldAlert size={32} className="text-teal-500" />
          </div>
          <h1 className="text-2xl font-mono font-black text-white uppercase tracking-widest leading-none">
            PAGE NOT FOUND
          </h1>
          <p className="text-xs font-mono text-stone-400 uppercase tracking-wider leading-relaxed">
            The requested address does not exist or has been relocated within the Wright Farm network.
          </p>
          <button
            onClick={() => {
              window.history.pushState({}, "", "/");
              setCurrentPath("/");
            }}
            className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-mono text-xs uppercase tracking-wider font-bold rounded-xl cursor-pointer transition-all shadow-md"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Admin Pathway Bypass of Lockdown & Shutdown
  const isAdminOrOwnerLoggedIn = currentUser && (currentUser.role === "admin" || currentUser.role === "owner");

  if (isAdminPath && !isAdminOrOwnerLoggedIn) {
    return (
      <AdminLoginScreen
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          localStorage.setItem("horsesense_user", JSON.stringify(user));
          setIsOwnerVerified(true);
          if (user.role === "owner") {
            setActiveMainTab("owner_station");
          } else {
            setActiveMainTab("admin_station");
          }
          logAuditAction(user.name, user.role, "login", `${user.name} authenticated via /admin Gateway.`);
        }}
        onBackToHome={() => {
          window.history.pushState({}, "", "/");
          setCurrentPath("/");
        }}
      />
    );
  }

  if (shutdownActive && !isAdminPath) {
    if (restorationActive) {
      return (
        <div className="fixed inset-0 bg-stone-950 flex flex-col items-center justify-center text-center p-6 z-50 select-none overflow-y-auto font-mono">
          <div className="w-full max-w-lg bg-stone-900 border-2 border-emerald-500/30 p-8 rounded-3xl space-y-6 shadow-2xl relative text-left">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-emerald-950 pb-4 mb-2">
              <div className="p-2.5 bg-emerald-950/50 text-emerald-500 rounded-2xl border border-emerald-900 animate-pulse">
                <Shield size={24} />
              </div>
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  RUABON FARM RESTORATION TERMINAL
                </h2>
                <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-0.5">
                  Secure Override Console // Stage {restorationStep === 1 ? "1" : restorationStep === 2 ? "2" : restorationStep === 3 ? "3" : restorationStep === 4 ? "4" : "5"} of 5
                </p>
              </div>
            </div>

            {restorationError && (
              <div className="p-3 bg-red-950/50 border border-red-900 rounded-xl text-[11px] text-red-400 font-bold uppercase flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{restorationError}</span>
              </div>
            )}

            {/* STEP 1: Enter Employee PIN */}
            {restorationStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-widest">
                    GATEWAY 1: HEAD OF IT EMPLOYEE PIN
                  </span>
                  <p className="text-[11px] text-stone-400 leading-relaxed uppercase">
                    Please authenticate using the administrative employee number/PIN (2013).
                  </p>
                </div>
                <input
                  type="password"
                  placeholder="Enter 4-Digit Employee PIN"
                  maxLength={4}
                  value={restorationInputPin}
                  onChange={(e) => {
                    setRestorationInputPin(e.target.value.replace(/\D/g, ""));
                    setRestorationError(null);
                  }}
                  className="w-full bg-black border border-stone-850 rounded-xl px-4 py-3 text-sm tracking-widest text-emerald-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-bold placeholder-stone-800"
                />
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setRestorationActive(false);
                      setRestorationStep(0);
                      setRestorationInputPin("");
                      setRestorationError(null);
                    }}
                    className="flex-1 py-3 border border-stone-800 text-stone-500 hover:text-stone-400 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all hover:bg-stone-850"
                  >
                    Abort
                  </button>
                  <button
                    onClick={() => {
                      if (restorationInputPin === "2013") {
                        setRestorationStep(2);
                        setRestorationError(null);
                      } else {
                        setRestorationError("Authentication Failed: Invalid Employee PIN.");
                      }
                    }}
                    className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md flex items-center justify-center gap-1.5"
                  >
                    Verify PIN <Check size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Owner Commands Page */}
            {restorationStep === 2 && (
              <div className="space-y-5">
                <div className="space-y-1 border-b border-emerald-950/40 pb-3">
                  <span className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-widest">
                    MAINFRAME GRANTED: WELCOME COOPER WRIGHT
                  </span>
                  <p className="text-[11px] text-stone-400 leading-relaxed uppercase">
                    Primary IT Administrative Commands have been initialized. Select an operation below.
                  </p>
                </div>

                {/* Simulated Owner Commands Panel */}
                <div className="space-y-3">
                  <div className="bg-stone-950/60 border border-stone-850 p-4 rounded-2xl flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[10px] text-emerald-500 font-bold uppercase tracking-wider">
                      <span>Command 01 // Reactivate System</span>
                      <span className="text-[9px] bg-red-950 text-red-500 border border-red-950 px-1.5 py-0.5 rounded-md">OFFLINE</span>
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1 uppercase">
                      Initiate the global multi-factor sequence to clear the emergency shutdown state.
                    </p>
                    <button
                      onClick={() => {
                        setRestorationStep(3);
                        setRestorationError(null);
                      }}
                      className="mt-3 py-2.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-500 text-emerald-400 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg animate-pulse"
                    >
                      Reactivate Global System
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div className="bg-stone-950/40 border border-stone-850 p-3 rounded-xl flex flex-col justify-between">
                      <span className="text-stone-400 font-bold uppercase">Database State</span>
                      <span className="text-red-600 font-black uppercase mt-1">RESTRICTED (RO)</span>
                    </div>
                    <div className="bg-stone-950/40 border border-stone-850 p-3 rounded-xl flex flex-col justify-between">
                      <span className="text-stone-400 font-bold uppercase">Bypass Generator</span>
                      <span className="text-emerald-500 font-black uppercase mt-1">ACTIVE (PERTH/AWST)</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setRestorationActive(false);
                      setRestorationStep(0);
                      setRestorationInputPin("");
                      setRestorationError(null);
                    }}
                    className="w-full py-3 border border-stone-800 text-stone-500 hover:text-stone-400 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all hover:bg-stone-850 text-center"
                  >
                    Back to Safe Mode Screen
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Optional Broadcast Message */}
            {restorationStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-widest">
                    STAGE 2: LEAVE RESTORATION MESSAGE
                  </span>
                  <p className="text-[11px] text-stone-400 leading-relaxed uppercase">
                    Would you like to write a restoration broadcast? Everyone will receive this message in the general chat upon system startup.
                  </p>
                </div>
                <textarea
                  placeholder="Enter message for the team (Optional)..."
                  value={restorationInputMsg}
                  onChange={(e) => {
                    setRestorationInputMsg(e.target.value);
                    setRestorationError(null);
                  }}
                  className="w-full h-24 bg-black border border-stone-850 rounded-xl p-3.5 text-xs font-mono text-emerald-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 placeholder-stone-800"
                />
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => {
                      setRestorationInputMsg("");
                      setRestorationStep(4);
                      setRestorationError(null);
                    }}
                    className="flex-1 py-3 border border-stone-800 text-stone-500 hover:text-stone-400 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all hover:bg-stone-850"
                  >
                    Skip Message
                  </button>
                  <button
                    onClick={() => {
                      if (!restorationInputMsg.trim()) {
                        setRestorationError("Please enter a message or click 'Skip Message' to continue.");
                      } else {
                        setRestorationStep(4);
                        setRestorationError(null);
                      }
                    }}
                    className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md flex items-center justify-center gap-1.5"
                  >
                    Save & Continue <Check size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Secondary Bypass Pin (8357) */}
            {restorationStep === 4 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-widest">
                    GATEWAY 2: SECONDARY OVERRIDE PASSCODE
                  </span>
                  <p className="text-[11px] text-stone-400 leading-relaxed uppercase">
                    Enter the secondary override bypass password (8357) to proceed to master deactivation.
                  </p>
                </div>
                <input
                  type="password"
                  placeholder="Enter Secondary Override PIN"
                  maxLength={4}
                  value={restorationInputCode}
                  onChange={(e) => {
                    setRestorationInputCode(e.target.value.replace(/\D/g, ""));
                    setRestorationError(null);
                  }}
                  className="w-full bg-black border border-stone-850 rounded-xl px-4 py-3 text-sm tracking-widest text-emerald-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-bold placeholder-stone-800"
                />
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setRestorationStep(2);
                      setRestorationInputCode("");
                      setRestorationError(null);
                    }}
                    className="flex-1 py-3 border border-stone-800 text-stone-500 hover:text-stone-400 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all hover:bg-stone-850"
                  >
                    Back to Commands
                  </button>
                  <button
                    onClick={() => {
                      if (restorationInputCode === "8357") {
                        setRestorationStep(5);
                        setRestorationError(null);
                      } else {
                        setRestorationError("Verification Failed: Invalid Secondary Passcode.");
                      }
                    }}
                    className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md flex items-center justify-center gap-1.5"
                  >
                    Verify Passcode <Check size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: Master Key (Cdog2013#) */}
            {restorationStep === 5 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-widest">
                    GATEWAY 3: GLOBAL MASTER SECURITY KEY
                  </span>
                  <p className="text-[11px] text-stone-400 leading-relaxed uppercase">
                    Enter the global master IT restorational key (Cdog2013#) to complete system reactivation.
                  </p>
                </div>
                <input
                  type="password"
                  placeholder="Enter Master Security Key"
                  value={restorationInputMaster}
                  onChange={(e) => {
                    setRestorationInputMaster(e.target.value);
                    setRestorationError(null);
                  }}
                  className="w-full bg-black border border-stone-850 rounded-xl px-4 py-3 text-sm tracking-widest text-emerald-400 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 font-bold placeholder-stone-800"
                />
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setRestorationStep(2);
                      setRestorationInputMaster("");
                      setRestorationError(null);
                    }}
                    className="flex-1 py-3 border border-stone-800 text-stone-500 hover:text-stone-400 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all hover:bg-stone-850"
                  >
                    Back to Commands
                  </button>
                  <button
                    onClick={async () => {
                      if (restorationInputMaster === "Cdog2013#") {
                        try {
                          const { doc, updateDoc, collection, addDoc } = await import("firebase/firestore");

                          // Write message broadcast to general chat if provided
                          if (restorationInputMsg.trim()) {
                            await addDoc(collection(db, "messages"), {
                              sender: "System Administrator",
                              recipient: "general",
                              text: restorationInputMsg.trim(),
                              threadId: "general",
                              timestamp: new Date().toISOString()
                            });
                          }

                          // Deactivate emergency shutdown
                          await updateDoc(doc(db, "system_status", "emergency"), { shutdownActive: false });

                          await logAuditAction("System Administrator", "owner", "modify", "Deactivated global emergency shutdown and restored system access.");

                          alert("System restored successfully! Access granted to all users.");

                          // Reset all restoration state variables
                          setRestorationActive(false);
                          setRestorationStep(0);
                          setRestorationInputPin("");
                          setRestorationInputMsg("");
                          setRestorationInputCode("");
                          setRestorationInputMaster("");
                          setRestorationError(null);
                        } catch (err) {
                          console.error("Restoration commit failed:", err);
                          setRestorationError("Database update failed. Check network.");
                        }
                      } else {
                        setRestorationError("Verification Failed: Invalid Master Security Key.");
                      }
                    }}
                    className="flex-1 py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md flex items-center justify-center gap-1.5"
                  >
                    Restore Mainframe <Check size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-stone-950 flex flex-col items-center justify-center text-center p-6 z-50 select-none">
        {/* Top Right System Restoration Trigger */}
        <div className="absolute top-6 right-6">
          <button
            onClick={() => {
              setRestorationActive(true);
              setRestorationStep(1);
              setRestorationError(null);
            }}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-850 text-red-500 hover:text-red-400 border border-red-900/60 font-mono text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-lg flex items-center gap-1.5"
          >
            <RefreshCw size={12} className="animate-spin animate-duration-3000" />
            System Restoration
          </button>
        </div>

        <div className="max-w-md bg-stone-900 border border-red-600 p-8 rounded-3xl space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-red-950/40 text-red-500 rounded-full flex items-center justify-center border border-red-900 mx-auto animate-pulse">
            <ShieldAlert size={32} />
          </div>
          <h1 className="text-2xl font-mono font-black text-red-600 uppercase tracking-widest leading-none">
            EMERGENCY SHUTDOWN ACTIVATED
          </h1>
          <p className="text-xs font-mono text-stone-400 uppercase tracking-wider leading-relaxed">
            The Farm Master IT Administration has initiated a complete system-wide emergency shutdown.
          </p>
          <p className="text-[10px] font-mono text-red-750 bg-black py-2.5 px-4 rounded-xl border border-red-950">
            ALL OPERATIONS OFFLINE // ACCESS SUSPENDED
          </p>
          <p className="text-[9px] font-mono text-stone-600 uppercase tracking-widest">
            Awaiting Head of IT System Restoration Protocol.
          </p>
        </div>
      </div>
    );
  }

  const shouldLockdown = isFullyBlocked || isProfileBannedOnThisIp || isVisitorBlockedOnThisIp;

  if (shouldLockdown && !isAdminPath) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-center p-6 z-50 select-none overflow-y-auto">
        {/* Top Right Bypass Controls */}
        <div className="absolute top-6 right-6 z-50">
          {!showBypassInput ? (
            <button
              onClick={() => setShowBypassInput(true)}
              className="px-4 py-2 bg-red-950 text-red-500 hover:text-red-400 hover:bg-red-900 border border-red-800 font-mono text-[10px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer shadow-md"
            >
              Enter Bypass Code
            </button>
          ) : (
            <div className="bg-stone-950 rounded-2xl p-5 shadow-2xl border border-red-900 max-w-sm flex flex-col gap-2.5 animate-fade-in text-left">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-mono font-black text-red-500 uppercase tracking-widest">Enter 15-Digit Bypass</span>
                <button 
                  onClick={() => { setShowBypassInput(false); setBypassError(false); }}
                  className="text-red-700 hover:text-red-500 font-bold px-1"
                >
                  ✕
                </button>
              </div>
              <input
                type="text"
                maxLength={15}
                placeholder="15-Digit Code"
                value={bypassInput}
                onChange={(e) => setBypassInput(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-black border border-red-900 rounded-lg px-3 py-2 text-xs font-mono font-bold tracking-widest text-red-500 focus:outline-hidden focus:ring-1 focus:ring-red-600 placeholder-red-950"
              />
              {bypassError && (
                <span className="text-[9px] font-mono text-red-600 font-black uppercase">Invalid Code.</span>
              )}
              <button
                onClick={handleVerifyBypass}
                className="w-full bg-red-900 hover:bg-red-800 text-white font-mono font-bold text-xs py-2 rounded-lg uppercase tracking-wider transition-all cursor-pointer"
              >
                Verify Code
              </button>
            </div>
          )}
        </div>

        {!showAppealView ? (
          <div className="space-y-6 max-w-2xl bg-black border border-red-900 rounded-3xl p-8 md:p-12 shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-950/40 text-red-600 rounded-2xl flex items-center justify-center border border-red-900/60 mx-auto mb-2 animate-pulse">
              <ShieldAlert size={36} />
            </div>
            <h1 className="text-3xl md:text-5xl font-mono font-black text-red-600 uppercase tracking-widest leading-none">
              LOCKDOWN INITIATED
            </h1>
            <h2 className="text-xs font-mono font-extrabold text-red-800 uppercase tracking-widest pt-1">
              CRITICAL ACCESS RESTRICTION ACTIVE
            </h2>
            <div className="space-y-3 font-mono text-[11px] text-red-500/80 uppercase tracking-wider py-2">
              <p>
                {isFullyBlocked 
                  ? `Your IP address (${clientIp}) is banned from accessing this network.` 
                  : isProfileBannedOnThisIp 
                    ? `The user profile "${currentUser?.name}" is restricted from accessing Ruabon Farm systems.`
                    : `Visitor portal access is blocked on this connection by system administration.`}
              </p>
              <p className="text-red-700 font-bold">
                Shutting that down with IP: {clientIp}
              </p>
              {activeBanRecord?.reason && (
                <div className="bg-red-950/30 border border-red-900/50 p-3.5 rounded-xl max-w-md mx-auto my-2 text-left">
                  <span className="text-[9px] font-mono font-black text-red-500 block uppercase tracking-widest mb-1.5">
                    Official Ban Reason:
                  </span>
                  <p className="text-[10px] text-red-400 font-mono font-bold break-words whitespace-pre-wrap leading-normal uppercase">
                    {activeBanRecord.reason}
                  </p>
                </div>
              )}
              <p className="text-[9px] text-red-900 bg-red-950/20 py-1.5 px-3 border border-red-950/40 rounded-lg max-w-md mx-auto">
                This was a local lockdown. Keep bypass code at hand to clear connections.
              </p>
            </div>
            <div className="pt-4 flex flex-col sm:flex-row justify-center items-center gap-4">
              <button
                onClick={() => {
                  setShowAppealView(true);
                  setAppealSuccess(null);
                }}
                className="px-6 py-3 bg-red-900 hover:bg-red-850 text-white font-mono font-bold text-xs uppercase tracking-widest rounded-xl transition-colors cursor-pointer w-full sm:w-auto"
              >
                Submit Ban Appeal
              </button>
            </div>
            <div className="text-[8px] text-red-900 font-mono uppercase tracking-widest">
              RUABON FARM SECURITY CORE // OFFLINE STATE ACTIVE
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-md bg-black border border-red-900 rounded-3xl p-8 shadow-2xl text-left">
            <div className="flex justify-between items-center border-b border-red-950 pb-3">
              <span className="text-xs font-mono font-black text-red-600 uppercase tracking-widest">Submit Ban Appeal Form</span>
              <button 
                onClick={() => setShowAppealView(false)}
                className="text-red-800 hover:text-red-600 font-mono text-xs uppercase font-bold"
              >
                Back
              </button>
            </div>

            {appealSuccess ? (
              <div className="space-y-4 py-4 text-center">
                <p className="text-xs font-mono text-red-500 uppercase leading-relaxed font-bold bg-red-950/25 p-4 border border-red-900 rounded-xl">
                  {appealSuccess}
                </p>
                <button
                  onClick={() => setShowAppealView(false)}
                  className="px-5 py-2 bg-red-950 hover:bg-red-900 text-red-500 border border-red-900 font-mono text-[10px] font-bold rounded-lg uppercase tracking-wider"
                >
                  Return to lockdown screen
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitAppeal} className="space-y-4">
                <p className="text-[10px] font-mono text-red-750 uppercase leading-normal">
                  Your IP address (<span className="text-red-600 font-bold">{clientIp}</span>) will be logged alongside this appeal request.
                </p>

                <div>
                  <label className="block text-[8px] font-mono font-bold text-red-600 uppercase tracking-wider mb-1">
                    Your Registered Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={appealName}
                    onChange={(e) => setAppealName(e.target.value)}
                    placeholder="Enter full name"
                    className="w-full bg-stone-950 border border-red-950 rounded-lg p-2.5 text-xs font-mono text-red-500 focus:outline-hidden focus:border-red-650 focus:ring-1 focus:ring-red-650 placeholder-red-950/40"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-mono font-bold text-red-600 uppercase tracking-wider mb-1">
                    Your Contact Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={appealEmail}
                    onChange={(e) => setAppealEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full bg-stone-950 border border-red-950 rounded-lg p-2.5 text-xs font-mono text-red-500 focus:outline-hidden focus:border-red-650 focus:ring-1 focus:ring-red-650 placeholder-red-950/40"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-mono font-bold text-red-600 uppercase tracking-wider mb-1">
                    Detailed Appeal Reason &amp; Statement
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={appealReason}
                    onChange={(e) => setAppealReason(e.target.value)}
                    placeholder="Provide a logical reason or sponsor confirmation to lift restrictions..."
                    className="w-full bg-stone-950 border border-red-950 rounded-lg p-2.5 text-xs font-mono text-red-500 focus:outline-hidden focus:border-red-650 focus:ring-1 focus:ring-red-650 placeholder-red-950/40"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAppealView(false)}
                    className="border border-red-950 text-red-800 hover:text-red-600 font-mono text-[9px] py-2.5 rounded-lg uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingAppeal}
                    className="bg-red-900 hover:bg-red-850 text-white font-mono font-bold text-[9px] py-2.5 rounded-lg uppercase tracking-wider flex items-center justify-center gap-1.5"
                  >
                    {submittingAppeal ? "Submitting..." : "Submit Appeal"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }



  // Handle public visitor page (Direct redirection to a clean marking scan page)
  if (currentUser?.role === "visitor") {
    return (
      <VisitorDashboard
        currentUser={currentUser}
        horses={horses}
        onLogout={handleLogout}
      />
    );
  }

  // Seeding demo horses for an immersive immediate user experience
  const seedDemoData = async () => {
    setIsSeeding(true);
    try {
      const names = [
        "Maverick", "Bella Luna", "Stardust", "Bandit", "Duchess", 
        "Apollo", "Gypsy", "Whiskey", "Willow", "Shadow", 
        "Coco", "Ziggy", "Trigger", "Sierra", "Copper", 
        "Phoenix", "Clover", "Rusty", "Jasmine", "Trooper"
      ];
      const breeds = [
        "Quarter Horse", "Thoroughbred", "Appaloosa", "Paint Horse", "Arabian",
        "Clydesdale", "Gypsy Vanner", "Mustang", "Morgan", "Friesian",
        "Shetland Pony", "Tennessee Walker", "Quarter Horse", "Warmblood", "Standardbred",
        "Thoroughbred", "Irish Sport Horse", "Belgian Draft", "Haflinger", "Paso Fino"
      ];
      const colors = [
        "Bay", "Chestnut", "Spotted Leopard", "Black & White", "Grey",
        "Bay Roan", "Piebald", "Dun", "Dark Bay", "Black",
        "Brown", "Palomino", "Golden Palomino", "Liver Chestnut", "Chestnut",
        "Bay", "Grey", "Sorrel", "Chestnut Flaxen", "Buckskin"
      ];
      const genders = [
        "Gelding", "Mare", "Stallion", "Gelding", "Mare",
        "Stallion", "Mare", "Gelding", "Mare", "Stallion",
        "Mare", "Gelding", "Gelding", "Mare", "Gelding",
        "Stallion", "Mare", "Gelding", "Mare", "Gelding"
      ];
      const brands = [
        "Lazy S over Rocking R", "Star Outline", "", "Bar Double B", "Crown Accent",
        "", "Fleur de Lis", "Three Feathers", "Diamond G", "Shield Bar",
        "", "Double Anchor", "Slashed Circle", "Arrow Head", "Heart outline",
        "", "Flying W", "Clover emblem", "Moon Crescent", "Sunburst Brand"
      ];

      for (let i = 0; i < 20; i++) {
        const horseName = names[i];
        const breed = breeds[i];
        const color = colors[i];
        const gender = genders[i] as "Mare" | "Gelding" | "Stallion";
        const brandDesc = brands[i];
        
        // Vary dates to create realistic statuses (overdue vs upcoming)
        const age = 5 + (i * 13) % 15;
        const lastShoeingOffset = (i % 3 === 0) ? 60 : 15; // some overdue (60 days ago)
        const lastVetOffset = (i % 4 === 0) ? 120 : 30; // some overdue (120 days ago)
        
        const shoeingDate = new Date();
        shoeingDate.setDate(shoeingDate.getDate() - lastShoeingOffset);
        const lastShoeingStr = shoeingDate.toISOString().split("T")[0];

        const vetDate = new Date();
        vetDate.setDate(vetDate.getDate() - lastVetOffset);
        const lastVetStr = vetDate.toISOString().split("T")[0];

        const nextVetDate = new Date();
        nextVetDate.setDate(nextVetDate.getDate() + (30 + (i * 20) % 100));
        const nextVetStr = nextVetDate.toISOString().split("T")[0];

        const horseObj = {
          name: horseName,
          breed: breed,
          age: age,
          gender: gender,
          color: color,
          brandingDescription: brandDesc,
          brandingLocation: brandDesc ? (i % 2 === 0 ? "Left Shoulder" : "Right Hip") : "",
          brandingDate: brandDesc ? "2023-05-15" : "",
          lastShoeingDate: lastShoeingStr,
          shoeingIntervalWeeks: 6,
          lastVetDate: lastVetStr,
          lastVetNotes: "Routine physical examination. Doing well.",
          nextVetDueDate: nextVetStr,
          lastDewormingDate: lastVetStr,
          lastDentalDate: lastVetStr,
          createdAt: todayStr,
          updatedAt: todayStr,
          // Extra detailed fields requested by user
          stableNumber: `Barn A, Box ${i + 1}`,
          ownerName: "Ruabon Farm Partners",
          ownerPhone: "+61 8 9755 1234",
          useClassification: i % 2 === 0 ? "Therapy Work" : "Riding Lessons",
          feedRequirements: "1 scoop senior grain, 2 flakes oaten hay twice daily",
          activeMedications: i % 5 === 0 ? "Equioxx 57mg SID" : "None",
          temperament: i % 3 === 0 ? "Very Gentle" : "Energetic but Calm",
          heightHands: `${14 + (i % 3)}.${i % 4} hh`,
          weightLbs: `${950 + (i * 25)} lbs`
        };

        const docRef = await addDoc(collection(db, "horses"), horseObj);

        // Add history logs for the horse
        await addDoc(collection(db, `horses/${docRef.id}/logs`), {
          horseId: docRef.id,
          horseName: horseName,
          type: "shoeing",
          date: lastShoeingStr,
          notes: "Regular trim and shoeing maintenance.",
          performedBy: "Farrier Bob",
          cost: 120.00,
          createdAt: todayStr,
          loggedBy: "System Init"
        });

        await addDoc(collection(db, `horses/${docRef.id}/logs`), {
          horseId: docRef.id,
          horseName: horseName,
          type: "vet",
          date: lastVetStr,
          notes: "Routine health assessment and vaccine boosters.",
          performedBy: "Dr. Catherine Adams",
          cost: 250.00,
          nextDueDate: nextVetStr,
          createdAt: todayStr,
          loggedBy: "System Init"
        });
      }
    } catch (error) {
      console.error("Error seeding 20 horses:", error);
    } finally {
      setIsSeeding(false);
    }
  };

  if (isStartup) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 text-stone-900" id="startup-screen">
        <div className="flex flex-col items-center max-w-sm text-center space-y-6">
          {/* Logo container with pulse animation */}
          <div className="p-6 bg-stone-50 border border-stone-150 rounded-3xl shadow-md animate-pulse">
            <HorseSenseLogo className="w-20 h-20 text-teal-600 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-[0.18em] pl-[0.18em] text-stone-900 uppercase font-logo">Nova Herd</h1>
            <p className="text-xs text-teal-700 font-bold uppercase tracking-widest">Business Herd Manager</p>
          </div>
          {/* Progress loader */}
          <div className="w-48 h-1.5 bg-stone-200 rounded-full overflow-hidden relative">
            <div className="absolute top-0 left-0 h-full bg-teal-600 rounded-full animate-progress w-full" />
          </div>
          <p className="text-xxs font-semibold text-stone-400 uppercase tracking-widest mt-4">
            Loading Farm Database...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    const effectiveFarmForLogin = selectedFarmForLogin || farmFromPath;
    if (effectiveFarmForLogin) {
      return (
        <LoginScreen 
          onLoginSuccess={(user) => {
            const rec = bannedIpsList.find(r => r.ip === clientIp.toLowerCase().trim());
            if (rec && rec.scope === "profiles" && rec.bannedProfiles?.some((p: string) => p.toLowerCase() === user.name.toLowerCase())) {
              alert(`ACCESS DENIED: The user profile "${user.name}" is banned on this IP address.`);
              return;
            }
            setCurrentUser(user);
            localStorage.setItem("horsesense_user", JSON.stringify(user));
            logAuditAction(user.name, user.role, "login", `${user.name} logged in`);
          }}
          farmName={effectiveFarmForLogin}
          onBackToLanding={() => {
            setSelectedFarmForLogin(null);
            if (window.location.pathname !== "/") {
              window.history.pushState({}, "", "/");
              setCurrentPath("/");
            }
          }}
        />
      );
    }

    return (
      <PublicLandingPage 
        onEnterFarm={(farmName) => {
          const name = farmName || "Nova Herd Facility";
          setSelectedFarmForLogin(name);
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
          if (window.location.pathname !== `/${slug}`) {
            window.history.pushState({}, "", `/${slug}`);
            setCurrentPath(`/${slug}`);
          }
        }}
        onLoginUser={(user) => {
          setCurrentUser(user);
          localStorage.setItem("horsesense_user", JSON.stringify(user));
        }}
      />
    );
  }

  return (
    <div className={`min-h-screen bg-stone-50 font-sans text-stone-900 flex flex-col justify-between transition-colors duration-300 ${currentUser?.assistedAccessMode ? "assisted-access" : ""}`} id="app-root-container">
      {/* Header Bar */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-xs" id="app-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          {/* Logo & Slogan */}
          <div 
            onClick={() => {
              if (currentUser && currentUser.role !== "visitor") {
                setActiveMainTab("directory");
                setSelectedHorseId(null);
              } else {
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            }}
            className="flex items-center space-x-2.5 cursor-pointer select-none"
          >
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="shrink-0"
            >
              <HorseSenseLogo className="w-11 h-11 shrink-0" />
            </motion.div>
            <div>
              <h1 className="text-xl font-black tracking-[0.14em] pl-[0.14em] text-stone-950 uppercase leading-none font-logo">Nova Herd</h1>
              <p className="text-[10px] text-teal-700 font-bold uppercase tracking-widest leading-none mt-1.5">Business Herd Manager</p>
            </div>
          </div>

          {/* Notifications and Header Actions */}
          <div className="flex items-center space-x-3">
            {currentUser && (
              <div className="flex items-center space-x-2 bg-stone-50 border border-stone-200/80 rounded-2xl pl-3 pr-2 py-1.5 shadow-2xs">
                <div className="text-right hidden sm:block">
                  <span className="text-xs font-bold text-stone-800 block leading-tight">{currentUser.name}</span>
                  <span className="text-[9px] font-bold text-teal-700 block uppercase tracking-widest leading-none mt-0.5">{currentUser.role}</span>
                  {currentUser.badges && currentUser.badges.length > 0 && (
                    <div className="flex gap-0.5 justify-end mt-1 flex-wrap max-w-[150px]">
                      {currentUser.badges.map(b => (
                        <span key={b} className="bg-teal-50 text-teal-800 text-[8px] font-black px-1 py-0.2 rounded border border-teal-250 uppercase tracking-wide">
                          {b}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border uppercase ${currentUser.avatarColor}`}>
                  {currentUser.name.split(" ").map(n => n[0]).join("")}
                </div>

                {currentUser.hasSeenTutorial !== true && currentUser.role !== "owner" && currentUser.name !== "System Administrator" && (
                  <button
                    onClick={() => setShowTosModal(true)}
                    className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg animate-pulse transition-all cursor-pointer shadow-3xs hover:scale-102 border border-amber-400 shrink-0"
                    title="You have not yet accepted the latest Terms of Service. Click to review and accept."
                  >
                    <ShieldAlert size={11} /> ToS Warning
                  </button>
                )}
                
                {/* Settings Tab next to the user's name */}
                {currentUser.name !== "Peter Baker" && (
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    title="Account Settings"
                    className="text-stone-400 hover:text-teal-600 hover:bg-teal-50 p-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    <Sliders size={14} />
                  </button>
                )}



                {/* Theme Toggle Button for low-light barn checks */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={theme === "light" ? "Switch to Dark Mode (Low-light Barn Checks)" : "Switch to Light Mode"}
                  className="text-stone-400 hover:text-amber-500 hover:bg-amber-50/70 p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center shrink-0"
                >
                  {theme === "light" ? (
                    <Moon size={14} className="text-stone-500" />
                  ) : (
                    <Sun size={14} className="text-amber-400 fill-amber-400" />
                  )}
                </button>

                {/* Full Screen Toggle Button */}
                <button
                  type="button"
                  onClick={toggleFullScreen}
                  title={isFullscreen ? "Exit Full Screen" : "Enter Full Screen"}
                  className="text-stone-400 hover:text-teal-600 hover:bg-teal-50 p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center shrink-0"
                >
                  {isFullscreen ? (
                    <Minimize2 size={14} className="text-teal-600" />
                  ) : (
                    <Maximize2 size={14} />
                  )}
                </button>

                {(!currentUser?.farmName || currentUser?.farmName === "Horse Sense" || currentUser?.farmName === "Ruabon Farm" || currentUser?.farmName === "Nova Herd Facility" || currentUser?.role === "owner" || currentUser?.name === "System Administrator") && (
                  <button
                    onClick={() => {
                      handleLogout();
                      setSelectedFarmForLogin(null);
                    }}
                    title="Return to Main Website"
                    className="text-stone-400 hover:text-teal-600 hover:bg-teal-50 p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                  >
                    <Globe size={14} /> <span className="hidden lg:inline">Website</span>
                  </button>
                )}

                <button
                  onClick={handleLogout}
                  title="Log Out"
                  className="text-stone-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-all cursor-pointer"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}

            {currentUser && currentUser.name !== "Peter Baker" && (
              <NotificationCenter 
                horses={horses} 
                todayStr={todayStr} 
                currentUser={currentUser}
                onSelectHorse={(horseId) => setSelectedHorseId(horseId)} 
              />
            )}
            {currentUser && (
              <HorsesenseAIChat 
                currentUser={currentUser}
                horses={horses}
                logs={visibleLogs}
                todayStr={todayStr}
                onOpenAISettings={() => {
                  setSettingsInitialTab("ai");
                  setIsSettingsOpen(true);
                }}
              />
            )}
            <div className="text-right hidden md:block">
              <span className="text-xxs font-bold text-stone-400 block uppercase tracking-wider">Operational Date</span>
              <span className="text-xs font-semibold text-stone-700 bg-stone-50 border border-stone-200 px-2 py-0.5 rounded-md mt-0.5 inline-block">
                {todayStr}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`${activeMainTab === "messaging" ? "w-full max-w-none px-0 py-0 space-y-4" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8"} flex-1 w-full`}>
        {dailyCheckError && (
          <div className={activeMainTab === "messaging" ? "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4" : ""}>
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl flex items-start justify-between shadow-xs animate-fade-in">
              <div className="flex gap-3">
                <AlertCircle className="text-amber-600 mt-0.5 shrink-0" size={18} />
                <div>
                  <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">Logging Restricted</h4>
                  <p className="text-xs text-amber-700 font-semibold mt-1">{dailyCheckError}</p>
                </div>
              </div>
              <button 
                onClick={() => setDailyCheckError(null)} 
                className="text-stone-400 hover:text-stone-700 font-bold text-xs p-1 cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {/* Navigation Tabs (Hidden for Peter Baker since he only has access to directory) */}
        {currentUser && currentUser.name !== "Peter Baker" && (
          <div className={activeMainTab === "messaging" ? "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 w-full" : ""}>
            <div className="flex flex-wrap border-b border-stone-200 gap-1.5 sm:gap-2 pb-2 mb-2 bg-stone-50/50 p-2 sm:p-3 rounded-2xl border border-stone-200/85">
            {(() => {
              const allTabs = [
                {
                  id: "directory",
                  label: "Herd Directory",
                  visible: true,
                  render: () => (
                    <button
                      key="directory"
                      onClick={() => setActiveMainTab("directory")}
                      className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-3 transition-all cursor-pointer ${
                        activeMainTab === "directory"
                          ? "border-teal-600 text-teal-800 font-extrabold"
                          : "border-transparent text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      Herd Directory
                    </button>
                  )
                },
                {
                  id: "messaging",
                  label: "Team Messaging",
                  visible: isMessagingAllowed,
                  render: () => (
                    <button
                      key="messaging"
                      onClick={() => setActiveMainTab("messaging")}
                      className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-3 transition-all cursor-pointer ${
                        activeMainTab === "messaging"
                          ? "border-teal-600 text-teal-800 font-extrabold"
                          : "border-transparent text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      Team Messaging
                    </button>
                  )
                },
                {
                  id: "audit",
                  label: "Login History",
                  visible: false,
                  render: () => (
                    <button
                      key="audit"
                      onClick={() => setActiveMainTab("audit")}
                      className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-3 transition-all cursor-pointer ${
                        activeMainTab === "audit"
                          ? "border-teal-600 text-teal-800 font-extrabold"
                          : "border-transparent text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      Login History
                    </button>
                  )
                },
                {
                  id: "owner_station",
                  label: "Owner Station",
                  visible: currentUser && (currentUser.role === "owner" || currentUser.name === "System Administrator"),
                  render: () => (
                    <button
                      key="owner_station"
                      onClick={() => setActiveMainTab("owner_station")}
                      className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-3 transition-all cursor-pointer ${
                        activeMainTab === "owner_station"
                          ? "border-teal-600 text-teal-800 font-extrabold"
                          : "border-transparent text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      Owner Station
                    </button>
                  )
                },
                {
                  id: "admin_station",
                  label: "Admin Station",
                  visible: currentUser && currentUser.role === "admin",
                  render: () => (
                    <button
                      key="admin_station"
                      onClick={() => setActiveMainTab("admin_station")}
                      className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-3 transition-all cursor-pointer ${
                        activeMainTab === "admin_station"
                          ? "border-teal-600 text-teal-800 font-extrabold"
                          : "border-transparent text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      Admin Station
                    </button>
                  )
                },
                {
                  id: "access_requests",
                  label: "Access Requests",
                  visible: false,
                  render: () => (
                    <button
                      key="access_requests"
                      onClick={() => setActiveMainTab("access_requests")}
                      className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-3 transition-all cursor-pointer ${
                        activeMainTab === "access_requests"
                          ? "border-teal-600 text-teal-800 font-extrabold"
                          : "border-transparent text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      Access Requests
                    </button>
                  )
                },
                {
                  id: "finance",
                  label: "Financial Ledger",
                  visible: currentUser && (currentUser.role === "owner" || currentUser.role === "admin" || ["System Administrator", "Claire Wright", "Mark Wright"].some(name => currentUser.name.toLowerCase() === name.toLowerCase())),
                  render: () => (
                    <button
                      key="finance"
                      onClick={() => setActiveMainTab("finance")}
                      className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-3 transition-all cursor-pointer ${
                        activeMainTab === "finance"
                          ? "border-teal-600 text-teal-800 font-extrabold"
                          : "border-transparent text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      Financial Ledger
                    </button>
                  )
                },
                {
                  id: "checks_calendar",
                  label: "Checks Registry",
                  visible: true,
                  render: () => (
                    <button
                      key="checks_calendar"
                      onClick={() => setActiveMainTab("checks_calendar")}
                      className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-3 transition-all cursor-pointer ${
                        activeMainTab === "checks_calendar"
                          ? "border-teal-600 text-teal-800 font-extrabold"
                          : "border-transparent text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      Checks Registry
                    </button>
                  )
                },
                {
                  id: "ai_settings",
                  label: "AI & Alerts",
                  visible: false,
                  render: () => (
                    <button
                      key="ai_settings"
                      onClick={() => setActiveMainTab("ai_settings")}
                      className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-3 transition-all cursor-pointer ${
                        activeMainTab === "ai_settings"
                          ? "border-teal-600 text-teal-800 font-extrabold"
                          : "border-transparent text-stone-500 hover:text-stone-800"
                      }`}
                    >
                      AI &amp; Alerts
                    </button>
                  )
                }
              ];

              const sortedAndFiltered = customisationEnabled 
                ? [...allTabs].sort((a, b) => {
                    const idxA = headerOrder.indexOf(a.id);
                    const idxB = headerOrder.indexOf(b.id);
                    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
                  })
                : allTabs;

              return sortedAndFiltered.map((t, idx) => {
                if (!t.visible) return null;

                if (customisationEnabled) {
                  const visibleTabs = sortedAndFiltered.filter(tab => tab.visible);
                  const visibleIdx = visibleTabs.findIndex(tab => tab.id === t.id);

                  const handleMoveLeft = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (visibleIdx <= 0) return;
                    
                    const currentOrder = [...headerOrder];
                    allTabs.forEach(tab => {
                      if (!currentOrder.includes(tab.id)) currentOrder.push(tab.id);
                    });

                    const itemA = t.id;
                    const itemB = visibleTabs[visibleIdx - 1].id;
                    const idxA = currentOrder.indexOf(itemA);
                    const idxB = currentOrder.indexOf(itemB);
                    if (idxA !== -1 && idxB !== -1) {
                      currentOrder[idxA] = itemB;
                      currentOrder[idxB] = itemA;
                      handleUpdateHeaderOrder(currentOrder);
                    }
                  };

                  const handleMoveRight = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (visibleIdx === -1 || visibleIdx >= visibleTabs.length - 1) return;

                    const currentOrder = [...headerOrder];
                    allTabs.forEach(tab => {
                      if (!currentOrder.includes(tab.id)) currentOrder.push(tab.id);
                    });

                    const itemA = t.id;
                    const itemB = visibleTabs[visibleIdx + 1].id;
                    const idxA = currentOrder.indexOf(itemA);
                    const idxB = currentOrder.indexOf(itemB);
                    if (idxA !== -1 && idxB !== -1) {
                      currentOrder[idxA] = itemB;
                      currentOrder[idxB] = itemA;
                      handleUpdateHeaderOrder(currentOrder);
                    }
                  };

                  return (
                    <div key={t.id} className="flex items-center gap-1 bg-teal-50/20 border border-dashed border-teal-500/40 rounded-xl px-1 py-0.5 shadow-3xs hover:border-teal-500/80 transition-all">
                      <button
                        type="button"
                        onClick={handleMoveLeft}
                        disabled={visibleIdx === 0}
                        className="p-1 hover:bg-teal-50 text-teal-600 hover:text-teal-800 disabled:opacity-20 rounded-md transition-colors cursor-pointer"
                        title="Move Tab Left"
                      >
                        <ArrowLeft size={10} className="stroke-[3px]" />
                      </button>
                      {t.render()}
                      <button
                        type="button"
                        onClick={handleMoveRight}
                        disabled={visibleIdx === visibleTabs.length - 1}
                        className="p-1 hover:bg-teal-50 text-teal-600 hover:text-teal-800 disabled:opacity-20 rounded-md transition-colors cursor-pointer"
                        title="Move Tab Right"
                      >
                        <ArrowRight size={10} className="stroke-[3px]" />
                      </button>
                    </div>
                  );
                }

                return t.render();
              });
            })()}
          </div>
        </div>
      )}



        {/* Tab View Selection */}
        {currentUser && currentUser.name === "Peter Baker" ? (
          <>
            {/* Peter Baker special clean view (Only weather widget & herd directory) */}
            <WeatherWidget />

            {horses.length === 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center max-w-xl mx-auto my-12 shadow-sm">
                <Shield className="mx-auto text-teal-600 mb-4" size={48} />
                <h2 className="text-lg font-bold text-stone-900">Herd Directory</h2>
                <p className="text-sm text-stone-500 mt-2 max-w-sm mx-auto leading-relaxed">
                  No horse records have been registered in your database yet.
                </p>
              </div>
            )}

            {horses.length > 0 && (
              <div className="space-y-6" id="herd-listing-area">
                {/* Search Bar for Peter */}
                <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="relative w-full md:w-80">
                    <Search className="absolute left-3.5 top-3 text-stone-400" size={18} />
                    <input
                      type="text"
                      placeholder="Search horse name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onBlur={(e) => handleAddRecentSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddRecentSearch(e.currentTarget.value);
                      }}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-9 py-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => setSearchTerm("")}
                        className="absolute right-3 top-3 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
                        title="Clear search"
                      >
                        <X size={16} />
                      </button>
                    )}
                    {recentSearches.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5 px-1">
                        <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wide shrink-0">Recent:</span>
                        <div className="flex flex-wrap gap-1">
                          {recentSearches.map((term, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setSearchTerm(term)}
                              className="text-[10px] font-semibold bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 text-stone-600 px-1.5 py-0.5 rounded-md transition-all cursor-pointer"
                            >
                              {term}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Peter has marking scanner access */}
                  <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                    <button
                      onClick={() => {
                        handleAIGroupPaddocks();
                        setIsBulkPaddockCheckOpen(true);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer w-full md:w-auto justify-center"
                    >
                      <Sparkles size={15} /> Bulk Paddock Check
                    </button>
                    <button
                      onClick={() => setIsScannerOpen(true)}
                      title="Scan horse markings or branding using your phone camera"
                      className="bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer w-full md:w-auto justify-center"
                    >
                      <Camera size={15} className="text-teal-600 animate-pulse" /> Scan Marking
                    </button>
                  </div>
                </div>

                {/* Horse Grid */}
                {filteredHorses.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center my-6">
                    <Search className="mx-auto text-stone-300 mb-2" size={32} />
                    <p className="text-sm font-semibold text-stone-600">No matching horses found.</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="horses-grid">
                      {filteredHorses.map((horse) => (
                        <HorseCard
                          key={horse.id}
                          horse={horse}
                          todayStr={todayStr}
                          userRole={currentUser.role}
                          isPeter={true}
                          onSelect={(id) => setSelectedHorseId(id)}
                          onLogMaintenance={() => {}}
                          onDelete={(id) => handleDeleteHorse(id)}
                          onReorder={handleReorder}
                          searchTerm={searchTerm}
                          onQuickCheckOk={handleQuickCheckOk}
                          isPinned={pinnedHorseIds.includes(horse.id)}
                          onTogglePin={handleTogglePinHorse}
                        />
                      ))}
                    </div>

                    {/* Peter's Read-Only Farm Herd Status Legend */}
                    <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-3xs mt-6">
                      <h4 className="text-xs font-black text-stone-950 uppercase tracking-wider mb-2">
                        Farm Status Indicator Legend
                      </h4>
                      <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider leading-relaxed mb-4">
                        The status indicators on each profile highlight shoeing and veterinary standings on our farm:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="flex items-start gap-2.5 p-3.5 bg-stone-50/50 border border-stone-150 rounded-2xl">
                          <span className="w-5 h-5 rounded-full bg-emerald-500 border border-emerald-400 shrink-0 flex items-center justify-center text-[10px] text-white font-extrabold font-mono">✓</span>
                          <div>
                            <span className="text-xs font-bold text-stone-900 block leading-tight">Up to Date</span>
                            <span className="text-[10px] text-stone-500 font-medium leading-normal mt-1 block">
                              Maintenance performed within interval; scheduled tasks are up to date.
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 p-3.5 bg-stone-50/50 border border-stone-150 rounded-2xl">
                          <span className="w-5 h-5 rounded-full bg-rose-500 border border-rose-400 shrink-0 flex items-center justify-center text-[10px] text-white font-extrabold font-mono">!</span>
                          <div>
                            <span className="text-xs font-bold text-stone-900 block leading-tight">Overdue</span>
                            <span className="text-[10px] text-stone-500 font-medium leading-normal mt-1 block">
                              Shoeing cycle exceeded recommended weeks or veterinary targets are past due.
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 p-3.5 bg-stone-50/50 border border-stone-150 rounded-2xl">
                          <span className="w-5 h-5 rounded-full bg-amber-500 border border-amber-400 shrink-0 flex items-center justify-center text-[10px] text-white font-extrabold font-mono">!</span>
                          <div>
                            <span className="text-xs font-bold text-stone-900 block leading-tight">Due Soon</span>
                            <span className="text-[10px] text-stone-500 font-medium leading-normal mt-1 block">
                              Shoeing or routine vet check is scheduled within the upcoming 7 days.
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5 p-3.5 bg-stone-50/50 border border-stone-150 rounded-2xl">
                          <span className="w-5 h-5 rounded-full bg-stone-400 border border-stone-300 shrink-0 flex items-center justify-center text-[10px] text-white font-extrabold font-mono">?</span>
                          <div>
                            <span className="text-xs font-bold text-stone-900 block leading-tight">No History</span>
                            <span className="text-[10px] text-stone-500 font-medium leading-normal mt-1 block">
                              No logs found yet. Register historical tasks to establish indicator standings.
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : activeMainTab === "messaging" ? (
          <TeamMessaging currentUser={currentUser} />
        ) : activeMainTab === "audit" && canSeeLoginHistory ? (
          <LoginHistory />
        ) : activeMainTab === "owner_station" && (currentUser.role === "owner" || currentUser.name === "System Administrator") ? (
          !isOwnerVerified ? (
            <div className="max-w-md mx-auto my-12 bg-white border border-stone-200 rounded-3xl p-8 shadow-xl text-center space-y-6">
              <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-xl border border-teal-100 flex items-center justify-center mx-auto shadow-3xs animate-bounce">
                <Shield size={20} />
              </div>
              <div>
                <h2 className="text-sm font-black text-stone-900 uppercase tracking-widest">IT Admin Security Gate</h2>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1">Re-enter your password / PIN to access administrative features</p>
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                const pin = (e.currentTarget.elements.namedItem("pinInput") as HTMLInputElement).value;
                if (pin === currentUser.pin) {
                  setIsOwnerVerified(true);
                } else {
                  alert("Incorrect PIN. Access Denied.");
                }
              }} className="space-y-4">
                <input
                  type="password"
                  name="pinInput"
                  maxLength={4}
                  required
                  placeholder="••••"
                  className="w-36 text-center text-xl font-bold tracking-widest border border-stone-250 bg-stone-50 rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:bg-white text-stone-900"
                />
                <button
                  type="submit"
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-2.5 rounded-xl uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Verify &amp; Unlock Section
                </button>
              </form>
            </div>
          ) : (
            <OwnerStation 
              currentUser={currentUser} 
              horses={horses} 
              todayStr={todayStr} 
              clientIp={clientIp} 
              featurePermissions={featurePermissions} 
              onImpersonateUser={(user) => {
                setCurrentUser(user);
                localStorage.setItem("horsesense_user", JSON.stringify(user));
                alert(`✓ Successfully logged in as "${user.name}" (${user.role}).`);
              }}
            />
          )
        ) : activeMainTab === "admin_station" && currentUser.role === "admin" ? (
          <AdminStation currentUser={currentUser} />
        ) : activeMainTab === "access_requests" && (currentUser.role === "owner" || currentUser.name === "System Administrator") ? (
          !isOwnerVerified ? (
            <div className="max-w-md mx-auto my-12 bg-white border border-stone-200 rounded-3xl p-8 shadow-xl text-center space-y-6">
              <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-xl border border-teal-100 flex items-center justify-center mx-auto shadow-3xs animate-bounce">
                <Shield size={20} />
              </div>
              <div>
                <h2 className="text-sm font-black text-stone-900 uppercase tracking-widest">IT Admin Security Gate</h2>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1">Re-enter your password / PIN to access administrative features</p>
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                const pin = (e.currentTarget.elements.namedItem("pinInput") as HTMLInputElement).value;
                if (pin === currentUser.pin) {
                  setIsOwnerVerified(true);
                } else {
                  alert("Incorrect PIN. Access Denied.");
                }
              }} className="space-y-4">
                <input
                  type="password"
                  name="pinInput"
                  maxLength={4}
                  required
                  placeholder="••••"
                  className="w-36 text-center text-xl font-bold tracking-widest border border-stone-250 bg-stone-50 rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-teal-600 focus:bg-white text-stone-900"
                />
                <button
                  type="submit"
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-2.5 rounded-xl uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Verify &amp; Unlock Section
                </button>
              </form>
            </div>
          ) : (
            <AccessRequestsManager />
          )
        ) : activeMainTab === "finance" ? (
          <FinancePage 
            currentUser={currentUser} 
            allLogs={visibleLogs} 
            horses={horses} 
            todayStr={todayStr} 
            onResetFinances={handleResetFinances}
            onNavigateToHorse={(horseId) => {
              setSelectedHorseId(horseId);
              setActiveMainTab("directory");
            }}
          />
        ) : activeMainTab === "checks_calendar" ? (
          <ChecksCalendar 
            horses={horses} 
            currentUser={currentUser} 
            todayStr={todayStr} 
          />
        ) : activeMainTab === "tutorial" ? (
          <TutorialPage 
            currentUser={currentUser} 
            onStart={() => setActiveMainTab("directory")} 
          />
        ) : activeMainTab === "ai_settings" ? (
          <AISettingsPage currentUser={currentUser} />
        ) : (
          <>
            {/* Render Widgets dynamically based on customized order and selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 items-start">
              {(() => {
                const widgetsToRender = customisationEnabled 
                  ? dashboardWidgets 
                  : [
                      { id: "stats", title: "Dashboard Stats Banner", enabled: true },
                      { id: "weather", title: "Weather Forecast Widget", enabled: true },
                      { id: "tasks", title: "Farm Task Board", enabled: true },
                      { id: "notes", title: "Private Notes Workspace", enabled: true },
                    ];

                // Filter out disabled ones if customisation mode is OFF,
                // but keep them in array if customisation mode is ON so we can show hidden placeholders
                const activeWidgets = widgetsToRender.filter(w => w.enabled || customisationEnabled);

                return activeWidgets.map((w, index) => {
                  let widgetContent = null;
                  let widgetTitle = w.title || w.id.toUpperCase();

                  switch (w.id) {
                    case "stats":
                      widgetContent = (
                        <DashboardStats 
                          horses={horses} 
                          logs={visibleLogs} 
                          todayStr={todayStr} 
                          currentUser={currentUser} 
                          onClickExpenses={() => {
                            setActiveMainTab("finance");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          onStatClick={(statType) => {
                            setActiveMainTab("directory");
                            setTimeout(() => {
                              if (statType === "herd") {
                                setActiveFilter("all");
                              } else if (statType === "shoeing") {
                                setActiveFilter("shoeing_overdue");
                              } else if (statType === "vet") {
                                setActiveFilter("vet_overdue");
                              }
                              document.getElementById("herd-listing-area")?.scrollIntoView({ behavior: "smooth" });
                            }, 50);
                          }}
                        />
                      );
                      break;

                    case "weather":
                      widgetContent = <WeatherWidget />;
                      break;

                    case "tasks":
                      widgetContent = <RanchTaskList currentUser={currentUser} todayStr={todayStr} />;
                      break;

                    case "notes":
                      widgetContent = <PrivateNotesList currentUser={currentUser} todayStr={todayStr} />;
                      break;

                    case "paddock_health":
                      widgetContent = <PaddockHealthSummary horses={horses} logs={visibleLogs} todayStr={todayStr} />;
                      break;

                    case "activity_heatmap":
                      widgetContent = <VisitorActivityHeatmap />;
                      break;

                    default:
                      break;
                  }

                  if (!widgetContent) return null;

                  // Render wrapped in customisable element
                  const colSpan = w.width === "half" ? "col-span-1" : "col-span-1 md:col-span-2";
                  
                  let scaleClass = "scale-100";
                  if (w.scale === "sm") {
                    scaleClass = "scale-95 origin-top";
                  } else if (w.scale === "lg") {
                    scaleClass = "scale-105 origin-top";
                  }

                  const handleMoveUp = () => {
                    if (index === 0) return;
                    const widgetIndex = dashboardWidgets.findIndex(item => item.id === w.id);
                    if (widgetIndex <= 0) return;
                    const updatedDbWidgets = [...dashboardWidgets];
                    const temp = updatedDbWidgets[widgetIndex];
                    updatedDbWidgets[widgetIndex] = updatedDbWidgets[widgetIndex - 1];
                    updatedDbWidgets[widgetIndex - 1] = temp;
                    handleUpdateWidgets(updatedDbWidgets);
                  };

                  const handleMoveDown = () => {
                    const widgetIndex = dashboardWidgets.findIndex(item => item.id === w.id);
                    if (widgetIndex === -1 || widgetIndex >= dashboardWidgets.length - 1) return;
                    const updatedDbWidgets = [...dashboardWidgets];
                    const temp = updatedDbWidgets[widgetIndex];
                    updatedDbWidgets[widgetIndex] = updatedDbWidgets[widgetIndex + 1];
                    updatedDbWidgets[widgetIndex + 1] = temp;
                    handleUpdateWidgets(updatedDbWidgets);
                  };

                  const handleToggleWidth = () => {
                    const updatedDbWidgets = dashboardWidgets.map(item => 
                      item.id === w.id ? { ...item, width: item.width === "half" ? "full" : "half" } : item
                    );
                    handleUpdateWidgets(updatedDbWidgets);
                  };

                  const handleCycleScale = () => {
                    const updatedDbWidgets = dashboardWidgets.map(item => {
                      if (item.id === w.id) {
                        const nextScale = item.scale === "sm" ? "md" : item.scale === "md" ? "lg" : "sm";
                        return { ...item, scale: nextScale };
                      }
                      return item;
                    });
                    handleUpdateWidgets(updatedDbWidgets);
                  };

                  const handleHideWidget = () => {
                    const updatedDbWidgets = dashboardWidgets.map(item => 
                      item.id === w.id ? { ...item, enabled: false } : item
                    );
                    handleUpdateWidgets(updatedDbWidgets);
                  };

                  const handleShowWidget = () => {
                    const updatedDbWidgets = dashboardWidgets.map(item => 
                      item.id === w.id ? { ...item, enabled: true } : item
                    );
                    handleUpdateWidgets(updatedDbWidgets);
                  };

                  if (!w.enabled && customisationEnabled) {
                    return (
                      <div 
                        key={w.id} 
                        draggable={customisationEnabled}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", w.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (draggedOverId !== w.id) {
                            setDraggedOverId(w.id);
                          }
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          if (draggedOverId !== w.id) {
                            setDraggedOverId(w.id);
                          }
                        }}
                        onDragLeave={() => {
                          if (draggedOverId === w.id) {
                            setDraggedOverId(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDraggedOverId(null);
                          const sourceId = e.dataTransfer.getData("text/plain");
                          if (!sourceId || sourceId === w.id) return;
                          const sourceIdx = dashboardWidgets.findIndex(item => item.id === sourceId);
                          const targetIdx = dashboardWidgets.findIndex(item => item.id === w.id);
                          if (sourceIdx !== -1 && targetIdx !== -1) {
                            const updated = [...dashboardWidgets];
                            const [removed] = updated.splice(sourceIdx, 1);
                            updated.splice(targetIdx, 0, removed);
                            handleUpdateWidgets(updated);
                          }
                        }}
                        className={`col-span-1 border-2 border-dashed rounded-3xl p-4 flex items-center justify-between transition-all duration-300 ${
                          draggedOverId === w.id 
                            ? "border-teal-500 bg-teal-100/30 scale-[1.02]" 
                            : "border-stone-250 bg-stone-50/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <GripVertical size={14} className="text-stone-300 shrink-0 cursor-grab active:cursor-grabbing" />
                          <div>
                            <span className="text-[9px] text-stone-400 font-black uppercase tracking-wider block">Hidden Widget</span>
                            <span className="text-xs font-bold text-stone-500">{widgetTitle}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleShowWidget}
                          className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                        >
                          Show
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={w.id}
                      draggable={customisationEnabled}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", w.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggedOverId !== w.id) {
                          setDraggedOverId(w.id);
                        }
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        if (draggedOverId !== w.id) {
                          setDraggedOverId(w.id);
                        }
                      }}
                      onDragLeave={() => {
                        if (draggedOverId === w.id) {
                          setDraggedOverId(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDraggedOverId(null);
                        const sourceId = e.dataTransfer.getData("text/plain");
                        if (!sourceId || sourceId === w.id) return;
                        const sourceIdx = dashboardWidgets.findIndex(item => item.id === sourceId);
                        const targetIdx = dashboardWidgets.findIndex(item => item.id === w.id);
                        if (sourceIdx !== -1 && targetIdx !== -1) {
                          const updated = [...dashboardWidgets];
                          const [removed] = updated.splice(sourceIdx, 1);
                          updated.splice(targetIdx, 0, removed);
                          handleUpdateWidgets(updated);
                        }
                      }}
                      className={`transition-all duration-300 ${colSpan} ${
                        customisationEnabled 
                          ? `border-2 p-3 pt-10 rounded-[28px] relative ${
                              draggedOverId === w.id 
                                ? "border-teal-500 bg-teal-100/30 scale-[1.02] ring-4 ring-teal-500/10 shadow-lg" 
                                : "border-dashed border-teal-500/50 bg-teal-50/10 shadow-3xs"
                            }` 
                          : ""
                      }`}
                    >
                      {customisationEnabled && (
                        <div className="absolute -top-3.5 left-4 right-4 z-40 flex flex-wrap items-center justify-between gap-1.5 select-none">
                          <div className="bg-teal-700 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-md flex items-center gap-1 cursor-grab active:cursor-grabbing" title="Drag to reposition widget">
                            <GripVertical size={10} className="text-teal-200" />
                            {widgetTitle}
                          </div>
                          
                          <div className="bg-stone-900 text-white p-1 rounded-full shadow-lg flex items-center gap-1 border border-stone-800">
                            {/* Reorder Up */}
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={handleMoveUp}
                              className="p-1 hover:bg-stone-800 disabled:opacity-30 rounded-full cursor-pointer text-white"
                              title="Move Left / Up"
                            >
                              <ArrowUp size={11} className="stroke-[3px]" />
                            </button>
                            
                            {/* Reorder Down */}
                            <button
                              type="button"
                              disabled={index === activeWidgets.length - 1}
                              onClick={handleMoveDown}
                              className="p-1 hover:bg-stone-800 disabled:opacity-30 rounded-full cursor-pointer text-white"
                              title="Move Right / Down"
                            >
                              <ArrowDown size={11} className="stroke-[3px]" />
                            </button>

                            <div className="h-3 w-[1px] bg-stone-800 mx-0.5" />

                            {/* Toggle width */}
                            <button
                              type="button"
                              onClick={handleToggleWidth}
                              className="px-2 py-0.5 hover:bg-stone-800 rounded-md text-[8.5px] font-extrabold uppercase tracking-wide flex items-center gap-1 cursor-pointer"
                              title="Change Width"
                            >
                              {w.width === "half" ? <Maximize2 size={10} /> : <Minimize2 size={10} />}
                              <span>{w.width === "half" ? "Full" : "1/2"}</span>
                            </button>

                            <div className="h-3 w-[1px] bg-stone-800 mx-0.5" />

                            {/* Toggle Scale */}
                            <button
                              type="button"
                              onClick={handleCycleScale}
                              className="px-2 py-0.5 hover:bg-stone-800 rounded-md text-[8.5px] font-extrabold uppercase tracking-wide flex items-center gap-0.5 cursor-pointer"
                              title="Cycle Visual Scale"
                            >
                              <span>Scale: {w.scale?.toUpperCase() || "MD"}</span>
                            </button>

                            <div className="h-3 w-[1px] bg-stone-800 mx-0.5" />

                            {/* Toggle visibility */}
                            <button
                              type="button"
                              onClick={handleHideWidget}
                              className="p-1 hover:bg-rose-900 hover:text-rose-200 text-stone-400 rounded-full cursor-pointer"
                              title="Hide Widget"
                            >
                              <EyeOff size={11} />
                            </button>
                          </div>
                        </div>
                      )}

                      <div className={`transition-all duration-300 origin-top ${scaleClass}`}>
                        {widgetContent}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Settings Modal (Tapped next to user name) */}
            {isSettingsOpen && (
              <ProfileEditor 
                currentUser={currentUser} 
                onUpdateCurrentUser={(updated) => {
                  setCurrentUser(updated);
                  localStorage.setItem("horsesense_user", JSON.stringify(updated));
                }}
                onClose={() => {
                  setIsSettingsOpen(false);
                  setSettingsInitialTab("profile");
                }}
                customisationEnabled={customisationEnabled}
                onToggleCustomisation={handleToggleCustomisation}
                dashboardWidgets={dashboardWidgets}
                onUpdateWidgets={handleUpdateWidgets}
                headerOrder={headerOrder}
                onUpdateHeaderOrder={handleUpdateHeaderOrder}
                presetTags={presetTags}
                initialTab={settingsInitialTab}
              />
            )}

            {/* Empty Herd Banner */}
            {horses.length === 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center max-w-xl mx-auto my-12 shadow-sm" id="empty-state-banner">
                <Shield className="mx-auto text-teal-600 mb-4" size={48} />
                <h2 className="text-lg font-bold text-stone-900">Welcome to Nova Herd Manager</h2>
                <p className="text-sm text-stone-500 mt-2 max-w-sm mx-auto leading-relaxed">
                  No horse records have been registered in your Firestore database yet. Start logging your branding, shoeing, and vet care now!
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                  {currentUser.role !== "visitor" ? (
                    <>
                      <button
                        onClick={() => setIsAddOpen(true)}
                        className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm px-5 py-3 rounded-xl transition-all cursor-pointer shadow-xs"
                      >
                        + Register First Horse
                      </button>
                      {currentUser.role === "owner" && (
                        <button
                          onClick={seedDemoData}
                          disabled={isSeeding}
                          className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-sm px-5 py-3 rounded-xl transition-all border border-stone-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles size={15} className="text-teal-600 animate-pulse" />
                          {isSeeding ? "Seeding Herd..." : "Seed Demo Herd"}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-stone-500 font-semibold uppercase tracking-wider bg-stone-50 border border-stone-200/80 px-4 py-3 rounded-xl">
                      Admin or Owner authorization is required to register new horses.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Herd Listing Area */}
            {horses.length > 0 && (
              <div className="space-y-6" id="herd-listing-area">
            {/* Filter and Search Bar */}
            <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Search */}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3.5 top-3 text-stone-400" size={18} />
                <input
                  type="text"
                  placeholder="Search horse name, breed, color..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onBlur={(e) => handleAddRecentSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddRecentSearch(e.currentTarget.value);
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-9 py-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-3 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X size={16} />
                  </button>
                )}
                {recentSearches.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5 px-1">
                    <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wide shrink-0">Recent:</span>
                    <div className="flex flex-wrap gap-1">
                      {recentSearches.map((term, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSearchTerm(term)}
                          className="text-[10px] font-semibold bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 text-stone-600 px-1.5 py-0.5 rounded-md transition-all cursor-pointer"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Filters list */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <button
                  onClick={() => setActiveFilter("all")}
                  className={`text-xs font-semibold px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                    activeFilter === "all"
                      ? "bg-stone-900 text-white"
                      : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  All Horses ({horses.length})
                </button>
                <button
                  onClick={() => setActiveFilter("shoeing_overdue")}
                  className={`text-xs font-semibold px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                    activeFilter === "shoeing_overdue"
                      ? "bg-teal-600 text-white"
                      : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  Shoeing Alerts
                </button>
                <button
                  onClick={() => setActiveFilter("vet_overdue")}
                  className={`text-xs font-semibold px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                    activeFilter === "vet_overdue"
                      ? "bg-rose-700 text-white"
                      : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  Vet Overdue
                </button>
                <button
                  onClick={() => setActiveFilter("branded")}
                  className={`text-xs font-semibold px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                    activeFilter === "branded"
                      ? "bg-teal-800 text-white"
                      : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  Branded
                </button>

                {/* Custom Tag Filter Toggle Dropdown */}
                <div className="relative inline-block">
                  <select
                    value={selectedTagFilter || ""}
                    onChange={(e) => setSelectedTagFilter(e.target.value || null)}
                    className="text-xs font-black px-3.5 py-2.5 rounded-xl bg-stone-50 text-stone-700 border border-stone-200 focus:outline-hidden focus:ring-1 focus:ring-teal-600 cursor-pointer transition-all uppercase tracking-wider"
                  >
                    <option value="">All Profile Tags</option>
                    {allUniqueTags.map(tag => (
                      <option key={tag} value={tag}>Tag: {tag}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`text-xs font-black px-3.5 py-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 uppercase tracking-wider ${
                    showAdvancedFilters
                      ? "bg-teal-600 text-white"
                      : "bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-700"
                  }`}
                >
                  <SlidersHorizontal size={13} className={showAdvancedFilters ? "text-white" : "text-teal-600"} />
                  Advanced Filters
                </button>
              </div>

              {/* Action register, CSV export & scanner */}
              <div className="flex flex-wrap gap-2.5 w-full md:w-auto justify-center md:justify-end">
                <button
                  onClick={() => {
                    handleAIGroupPaddocks();
                    setIsBulkPaddockCheckOpen(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer w-full md:w-auto justify-center"
                >
                  <Sparkles size={15} /> Bulk Paddock Check
                </button>
                <button
                  onClick={() => setIsScannerOpen(true)}
                  title="Scan horse markings or branding using your phone camera"
                  className="bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer w-full md:w-auto justify-center"
                >
                  <Camera size={15} className="text-teal-600 animate-pulse" /> Scan Marking
                </button>
                <button
                  onClick={() => downloadHerdZip(filteredHorses, todayStr, visibleLogs)}
                  title="Export current list of horses and profiles to a ZIP archive"
                  className="bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer w-full md:w-auto justify-center"
                >
                  <Download size={15} className="text-teal-600" /> Bulk Export (ZIP)
                </button>
                {currentUser.role !== "visitor" && (
                  <div className="flex gap-2 w-full md:w-auto">
                    <button
                      onClick={() => setIsImportCSVOpen(true)}
                      title="Import multiple horses from a CSV file"
                      className="bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer w-full md:w-auto justify-center"
                    >
                      <Upload size={14} className="text-teal-600" /> Import CSV
                    </button>
                    <button
                      onClick={() => setIsBulkOpen(true)}
                      className="bg-stone-900 hover:bg-stone-850 text-white border border-stone-800 font-bold text-sm px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer w-full md:w-auto justify-center"
                    >
                      <Sliders size={14} className="text-teal-400" /> Bulk Edit
                    </button>
                    <button
                      onClick={() => setIsAddOpen(true)}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer w-full md:w-auto justify-center"
                    >
                      <Plus size={16} /> Register Horse
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Advanced Filters Panel */}
            {showAdvancedFilters && (
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in text-left shadow-xs">
                {/* 1. Filter by Name */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1">
                    Horse Name
                  </label>
                  <input
                    type="text"
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    placeholder="Filter by name..."
                    className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
                  />
                </div>

                {/* 2. Filter by Paddock */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1">
                    Paddock / Stable
                  </label>
                  <input
                    type="text"
                    value={filterPaddock}
                    onChange={(e) => setFilterPaddock(e.target.value)}
                    placeholder="Filter by paddock..."
                    className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
                  />
                </div>

                {/* 3. Filter by DOB / Age */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1">
                    DOB / Age
                  </label>
                  <input
                    type="text"
                    value={filterDob}
                    onChange={(e) => setFilterDob(e.target.value)}
                    placeholder="e.g. 2018 or 8..."
                    className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
                  />
                </div>

                {/* 4. Filter by Agisted Horse */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1">
                    Agisted Horse
                  </label>
                  <select
                    value={filterAgisted}
                    onChange={(e) => setFilterAgisted(e.target.value as any)}
                    className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 cursor-pointer"
                  >
                    <option value="all">All (Agisted & Regular)</option>
                    <option value="yes">Agisted Only</option>
                    <option value="no">Non-Agisted Only</option>
                  </select>
                </div>

                {/* Reset button */}
                <div className="sm:col-span-2 md:col-span-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterName("");
                      setFilterPaddock("");
                      setFilterDob("");
                      setFilterAgisted("all");
                    }}
                    className="text-xxs font-black tracking-wider uppercase bg-stone-200/65 hover:bg-stone-200 text-stone-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Reset Advanced Filters
                  </button>
                </div>
              </div>
            )}

            {/* Filter Empty Results */}
            {filteredHorses.length === 0 ? (
              <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center my-6" id="no-search-results">
                <Search className="mx-auto text-stone-300 mb-2" size={32} />
                <p className="text-sm font-semibold text-stone-600">No horses match your current filter parameters.</p>
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setActiveFilter("all");
                  }}
                  className="mt-3 text-xs font-bold text-teal-600 hover:text-teal-700 cursor-pointer"
                >
                  Clear all filters
                </button>
              </div>
            ) : (
              /* Horse Grid */
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="horses-grid">
                {filteredHorses.map((horse) => (
                  <HorseCard
                    key={horse.id}
                    horse={horse}
                    todayStr={todayStr}
                    userRole={currentUser.role}
                    isPeter={currentUser?.name === "Peter Baker"}
                    onSelect={(id) => setSelectedHorseId(id)}
                    onLogMaintenance={(h) => setMaintenanceHorse(h)}
                    onDelete={(id) => handleDeleteHorse(id)}
                    onReorder={handleReorder}
                    searchTerm={searchTerm}
                    onQuickCheckOk={handleQuickCheckOk}
                    isPinned={pinnedHorseIds.includes(horse.id)}
                    onTogglePin={handleTogglePinHorse}
                  />
                ))}
              </div>
            )}
          </div>
        )}
          </>
        )}
      </main>

      {/* Footer */}
      {activeMainTab !== "messaging" && (
        <footer className="bg-white border-t border-stone-200 py-6 mt-12" id="app-footer">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-stone-400 font-medium">
              &copy; 2026 Nova Herd Operations. All rights reserved.
            </p>
            <div className="flex items-center space-x-4 text-xxs font-bold text-stone-400 uppercase tracking-wider">
              <span>Automated Recurring Alerts</span>
            </div>
          </div>
        </footer>
      )}

      {/* MODALS */}
      {/* 1. Register Horse Modal */}
      {(() => {
        const existingPaddocks = Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))) as string[];
        const currentFarmRecord = registeredFarmsList.find(
          (f) =>
            (f.name && f.name.toLowerCase() === (currentUser?.farmName || selectedFarmForLogin || "").toLowerCase()) ||
            (f.id && f.id === currentUser?.farmId)
        );
        const currentPlan = currentFarmRecord?.plan || (currentUser as any)?.farmPlan || "enterprise";

        return (
          <AddHorseModal 
            isOpen={isAddOpen} 
            onClose={() => setIsAddOpen(false)} 
            todayStr={todayStr} 
            currentUser={currentUser}
            existingPaddocks={existingPaddocks}
            presetTags={presetTags}
            horsesCount={horses.length}
            farmPlan={currentPlan}
          />
        );
      })()}

      {/* 2. Log Maintenance Event Modal */}
      {maintenanceHorse && (
        <MaintenanceForm
          horse={maintenanceHorse}
          isOpen={true}
          onClose={() => setMaintenanceHorse(null)}
          todayStr={todayStr}
          loggedBy={currentUser?.name || "System"}
          currentUser={currentUser}
        />
      )}

      {/* 3. Detailed Horse View Modal */}
      <AnimatePresence>
        {selectedHorse && (
          <HorseDetail
            horse={selectedHorse}
            userRole={currentUser.role}
            isPeter={currentUser?.name === "Peter Baker"}
            onClose={() => setSelectedHorseId(null)}
            todayStr={todayStr}
            currentUser={currentUser}
            onDeleteHorse={handleDeleteHorse}
            existingPaddocks={Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))) as string[]}
            presetTags={presetTags}
          />
        )}
      </AnimatePresence>

      {/* 4. Brand & Marking Scanner Modal */}
      {isScannerOpen && (
        <MarkingScanner
          horses={horses}
          onClose={() => setIsScannerOpen(false)}
          onSelectHorse={(id) => setSelectedHorseId(id)}
        />
      )}

      {/* 5. Bulk Edit Modal */}
      <BulkEditModal
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        horses={horses}
        todayStr={todayStr}
        currentUser={currentUser}
        presetTags={presetTags}
      />

      {/* 6. Import CSV Modal */}
      {(() => {
        const currentFarmRecord = registeredFarmsList.find(
          (f) =>
            (f.name && f.name.toLowerCase() === (currentUser?.farmName || selectedFarmForLogin || "").toLowerCase()) ||
            (f.id && f.id === currentUser?.farmId)
        );
        const currentPlan = currentFarmRecord?.plan || (currentUser as any)?.farmPlan || "enterprise";

        return (
          <ImportCSVModal
            isOpen={isImportCSVOpen}
            onClose={() => setIsImportCSVOpen(false)}
            todayStr={todayStr}
            currentUser={currentUser}
            horsesCount={horses.length}
            farmPlan={currentPlan}
          />
        );
      })()}

      <AnimatePresence>
        {bulkConfirmData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-55 cursor-pointer" 
            id="bulk-confirm-modal"
            onClick={() => {
              setBulkConfirmData(null);
              setIsHoveringBackdrop(false);
            }}
            onMouseEnter={() => setIsHoveringBackdrop(true)}
            onMouseLeave={() => setIsHoveringBackdrop(false)}
          >
            <motion.div 
              variants={modalContainerVariants}
              initial="hidden"
              animate={isHoveringBackdrop ? "hover" : "visible"}
              exit="exit"
              className="bg-white rounded-3xl border border-stone-200 max-w-md w-full p-6 shadow-2xl space-y-6 cursor-default text-left"
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={(e) => {
                e.stopPropagation();
                setIsHoveringBackdrop(false);
              }}
              onMouseLeave={(e) => {
                e.stopPropagation();
                setIsHoveringBackdrop(true);
              }}
            >
              <motion.div variants={modalItemVariants} className="flex items-center gap-3 border-b border-stone-100 pb-4">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                  <Check size={20} />
                </div>
                <div className="text-left">
                  <h3 className="font-black text-sm text-stone-900 uppercase tracking-wide">Paddock Check Confirmation</h3>
                  <p className="text-xxs text-stone-400 font-bold uppercase tracking-widest">{bulkConfirmData.groupName}</p>
                </div>
              </motion.div>

              <motion.div variants={modalItemVariants} className="space-y-4 text-left">
                <p className="text-xs text-stone-600 leading-relaxed">
                  You are about to bulk-register positive health checks for all horses in this group. Please verify the following summary before proceeding:
                </p>

                {/* Stats Box */}
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 space-y-3 font-mono">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-500 font-bold">TOTAL HORSES:</span>
                    <span className="text-stone-900 font-black">{bulkConfirmData.groupHorses.length}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-500 font-bold">FIRST-TIME MARKS TODAY:</span>
                    <span className="text-stone-900 font-black">{bulkConfirmData.firstTimeCount}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-500 font-bold">MAINTENANCE WARNINGS:</span>
                    <span className={bulkConfirmData.warningCount > 0 ? "text-amber-600 font-black animate-pulse animate-duration-1000" : "text-stone-500 font-bold"}>
                      {bulkConfirmData.warningCount}
                    </span>
                  </div>
                </div>

                {/* Warnings List */}
                {bulkConfirmData.warningCount > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                    <span className="text-[10px] font-black uppercase text-amber-850 tracking-wide block">
                      ⚠️ Overdue Maintenance Warned:
                    </span>
                    <p className="text-[10px] text-amber-800 leading-normal font-medium">
                      The following horses in this group are overdue for Shoeing or Veterinary care:{" "}
                      <strong>{bulkConfirmData.warningNames.join(", ")}</strong>. Proceeding will still log their paddock check status, but please schedule care as soon as possible.
                    </p>
                  </div>
                )}
              </motion.div>

              <motion.div variants={modalItemVariants} className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setBulkConfirmData(null);
                    setIsHoveringBackdrop(false);
                  }}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-black text-xxs uppercase tracking-widest py-3.5 rounded-xl transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    bulkConfirmData.onConfirm();
                    setBulkConfirmData(null);
                    setIsHoveringBackdrop(false);
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xxs uppercase tracking-widest py-3.5 rounded-xl transition-all cursor-pointer text-center shadow-xs"
                >
                  Yes, Mark OK
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. Bulk Paddock Check Modal with Nova Herd AI */}
      <AnimatePresence>
        {isBulkPaddockCheckOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 cursor-pointer"
            onClick={() => setIsBulkPaddockCheckOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 350, delay: 0.05 }}
              className="bg-white rounded-3xl border border-stone-200 max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col cursor-default text-left"
              onClick={(e) => e.stopPropagation()}
            >
            {/* Header */}
            <div className="p-6 bg-stone-50 border-b border-stone-150 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-black text-stone-900 text-base uppercase tracking-wider flex items-center gap-1.5 font-logo">
                  <Sparkles size={18} className="text-teal-600 animate-pulse" /> Bulk Paddock Check
                </h3>
                <p className="text-xxs text-stone-550 font-bold uppercase tracking-wider mt-0.5">
                  Analyze herd locations using Nova Herd AI
                </p>
              </div>
              <button
                onClick={() => setIsBulkPaddockCheckOpen(false)}
                className="text-stone-400 hover:text-stone-600 p-1.5 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              <div className="bg-gradient-to-br from-teal-50 to-stone-50 border border-teal-600/10 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-teal-950 uppercase tracking-wide">
                    Nova Herd AI Paddock Matching Analysis
                  </h4>
                  <p className="text-[10px] text-stone-500 font-semibold leading-relaxed">
                    Uses Nova Herd AI to detect if two horse locations are the same paddock (e.g. "back paddock" vs "paddock out back").
                  </p>
                </div>
                <button
                  onClick={handleAIGroupPaddocks}
                  disabled={isGroupingLoading}
                  className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-bold text-xs px-4 py-2.5 rounded-xl uppercase tracking-wider shadow-sm transition-all shrink-0 flex items-center gap-1.5"
                >
                  {isGroupingLoading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} /> Run Nova Herd AI Matching
                    </>
                  )}
                </button>
              </div>

              {/* Custom AI Paddock Matcher Input */}
              <div className="bg-stone-50 border border-stone-200 p-4 rounded-2xl space-y-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-stone-900 uppercase tracking-wide flex items-center gap-1.5 font-logo">
                    <Sparkles size={14} className="text-teal-600 animate-pulse" /> Custom Nova Herd AI Paddock Matcher
                  </h4>
                  <p className="text-[10px] text-stone-500 font-semibold">
                    Type in any paddock name (e.g. "back paddock"). Nova Herd AI will find similar locations and let you bulk check them all instantly.
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customSearchPaddock}
                    onChange={(e) => setCustomSearchPaddock(e.target.value)}
                    placeholder="E.g. back paddock..."
                    className="flex-1 bg-white border border-stone-250 rounded-xl p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600 focus:outline-hidden text-stone-900 placeholder:text-stone-400"
                  />
                  <button
                    type="button"
                    onClick={handleCustomAIMatch}
                    disabled={isCustomMatching || !customSearchPaddock.trim()}
                    className="bg-stone-900 hover:bg-stone-850 disabled:bg-stone-300 text-white text-xxs font-extrabold uppercase tracking-widest px-4 py-2.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    {isCustomMatching ? "Searching..." : "Search"}
                  </button>
                </div>

                {/* Custom AI search results list */}
                {customMatchedPaddocks.length > 0 && (
                  <div className="bg-teal-50/20 border border-teal-600/10 rounded-xl p-3 space-y-3 animate-fade-in">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-[9px] font-black text-teal-800 uppercase tracking-wider block">
                          Nova Herd AI Semantic Matches Found:
                        </span>
                        <span className="text-[10px] font-bold text-stone-600 block mt-0.5">
                          {customMatchedPaddocks.join(", ")}
                        </span>
                      </div>
                      <motion.button
                        key={successCheckGroupName === `AI Match: ${customSearchPaddock}` ? "success" : "idle"}
                        type="button"
                        onClick={async () => {
                          const matchName = `AI Match: ${customSearchPaddock}`;
                          await handleBulkCheckOk(customMatchedHorses, matchName);
                          // Keep matches visible briefly so they see the success pulse/checkmark
                          setTimeout(() => {
                            setCustomSearchPaddock("");
                            setCustomMatchedPaddocks([]);
                            setCustomMatchedHorses([]);
                          }, 1500);
                        }}
                        disabled={customMatchedHorses.length === 0}
                        animate={successCheckGroupName === `AI Match: ${customSearchPaddock}` ? { scale: [1, 1.15, 0.92, 1.05, 1] } : { scale: 1 }}
                        transition={{ duration: 0.65, ease: "easeInOut" }}
                        className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                          successCheckGroupName === `AI Match: ${customSearchPaddock}`
                            ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/40 ring-4 ring-emerald-500/25"
                            : "bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white"
                        }`}
                      >
                        {successCheckGroupName === `AI Match: ${customSearchPaddock}` ? (
                          <span className="flex items-center gap-1.5">
                            <motion.span
                              initial={{ scale: 0, rotate: -25 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: "spring", stiffness: 350, damping: 14 }}
                            >
                              ✨ ✓ COMPLETED!
                            </motion.span>
                          </span>
                        ) : (
                          `✓ Bulk Mark OK (${customMatchedHorses.length})`
                        )}
                      </motion.button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {customMatchedHorses.length === 0 ? (
                        <span className="text-xxs text-stone-400 italic">No horses found in matched paddocks</span>
                      ) : (
                        customMatchedHorses.map(h => (
                          <span key={h.id} className="text-[10px] font-bold bg-white border border-stone-200 text-stone-800 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-xxs">
                            {h.name} <span className="text-[8px] text-stone-400 uppercase font-semibold">({h.stableNumber})</span>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Paddock Health Overdue Heat Map */}
              {(() => {
                const heatMapData = Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))).map(loc => {
                  const locHorses = horses.filter(h => h.stableNumber === loc);
                  const overdueHorses = locHorses.filter(h => {
                    const shoeing = getShoeingStatus(h, todayStr);
                    const vet = getVetStatus(h, todayStr);
                    return shoeing?.status === "overdue" || vet?.status === "overdue";
                  });
                  return {
                    paddock: loc,
                    totalCount: locHorses.length,
                    overdueCount: overdueHorses.length,
                    overdueNames: overdueHorses.map(h => h.name)
                  };
                });

                return (
                  <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3">
                    <div>
                      <h4 className="text-xs font-black text-stone-900 uppercase tracking-wide flex items-center gap-1.5">
                        <AlertCircle size={14} className="text-amber-500 animate-pulse" /> Paddock Health Overdue Heat Map
                      </h4>
                      <p className="text-[10px] text-stone-500 font-semibold">
                        Shows paddock occupancy health and density of maintenance-overdue horses across the farm.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {heatMapData.map(data => {
                        const colorClass = data.overdueCount >= 2 
                          ? "bg-red-50 border-red-200 text-red-800" 
                          : data.overdueCount === 1 
                            ? "bg-amber-50 border-amber-200 text-amber-800" 
                            : "bg-emerald-50 border-emerald-150 text-emerald-800";
                        return (
                          <div 
                            key={data.paddock} 
                            className={`border p-3 rounded-xl flex flex-col justify-between shadow-4xs ${colorClass}`} 
                            title={data.overdueCount > 0 ? `Overdue: ${data.overdueNames.join(", ")}` : "All Up to Date"}
                          >
                            <div className="text-[10px] font-black truncate uppercase tracking-wider">{data.paddock}</div>
                            <div className="mt-1 flex items-baseline justify-between">
                              <span className="text-[9px] font-semibold opacity-75">Density: {data.totalCount}h</span>
                              <span className="text-xs font-extrabold">{data.overdueCount} Overdue</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Group listings with local filter & sparkline rendering */}
              {(() => {
                const getLast7DaysDates = () => {
                  const dates = [];
                  const [year, month, day] = todayStr.split("-").map(Number);
                  const today = new Date(year, month - 1, day);
                  for (let i = 6; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(today.getDate() - i);
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    dates.push(`${yyyy}-${mm}-${dd}`);
                  }
                  return dates;
                };

                const renderSparkline = (groupHorses: Horse[]) => {
                  if (groupHorses.length === 0) return null;
                  const dates = getLast7DaysDates();
                  const sparkData = dates.map(date => {
                    const checkedCount = groupHorses.filter(h => 
                      (h.dailyChecksHistory || []).some((check: any) => check.date === date)
                    ).length;
                    return {
                      date,
                      checkedCount,
                      pct: groupHorses.length > 0 ? (checkedCount / groupHorses.length) * 100 : 0
                    };
                  });

                  const width = 80;
                  const height = 16;
                  const padding = 2;
                  const points = sparkData.map((item, i) => {
                    const x = padding + (i * (width - padding * 2) / 6);
                    const y = height - padding - (item.pct * (height - padding * 2) / 100);
                    return `${x},${y}`;
                  }).join(" ");

                  const latestPct = sparkData[6].pct;
                  const strokeColor = latestPct === 100 ? "#059669" : latestPct > 0 ? "#d97706" : "#dc2626";

                  return (
                    <div className="flex items-center gap-1.5 shrink-0" title="7-day check trend (Hover points to view history)">
                      <span className="text-[8px] font-bold text-stone-400 uppercase tracking-wide">7d checks:</span>
                      <svg width={width} height={height} className="overflow-visible bg-stone-100/50 rounded-sm px-1 border border-stone-200/50">
                        <polyline
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={points}
                        />
                        {sparkData.map((item, i) => {
                          const x = padding + (i * (width - padding * 2) / 6);
                          const y = height - padding - (item.pct * (height - padding * 2) / 100);
                          return (
                            <circle
                              key={i}
                              cx={x}
                              cy={y}
                              r="3.5"
                              className="fill-teal-600 hover:fill-amber-500 opacity-0 hover:opacity-100 transition-all cursor-pointer"
                            >
                              <title>{`History: On ${item.date}, ${item.checkedCount}/${groupHorses.length} checked (${Math.round(item.pct)}%)`}</title>
                            </circle>
                          );
                        })}
                        <circle
                          cx={padding + 6 * (width - padding * 2) / 6}
                          cy={height - padding - (latestPct * (height - padding * 2) / 100)}
                          r="2.25"
                          fill={strokeColor}
                          className="pointer-events-none"
                        />
                      </svg>
                    </div>
                  );
                };

                const filterGroupHorses = (groupHorses: Horse[]) => {
                  if (bulkFilter === "overdue") {
                    return groupHorses.filter(h => h.lastCheckedDate !== todayStr);
                  }
                  if (bulkFilter === "uptodate") {
                    return groupHorses.filter(h => h.lastCheckedDate === todayStr);
                  }
                  return groupHorses;
                };

                const sortHorsesList = (horsesList: Horse[]) => {
                  return [...horsesList].sort((a, b) => {
                    if (bulkHorseSort === "last_check") {
                      const dateA = a.lastCheckedDate || "";
                      const dateB = b.lastCheckedDate || "";
                      return dateA.localeCompare(dateB);
                    }
                    if (bulkHorseSort === "stable") {
                      const stableA = a.stableNumber || "";
                      const stableB = b.stableNumber || "";
                      return stableA.localeCompare(stableB);
                    }
                    return a.name.localeCompare(b.name);
                  });
                };

                return (
                  <div className="space-y-4">
                    {/* Visual filter & sort bar */}
                    <div className="flex flex-col gap-3.5 bg-stone-50 border border-stone-200 p-4 rounded-2xl">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h5 className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Filter size={14} className="text-stone-400" /> Filter & Sort Controls
                          </h5>
                          <p className="text-[10px] text-stone-500 font-semibold mt-0.5">
                            Configure visibility and sort ordering for groups and horses.
                          </p>
                        </div>
                        {/* Automated Email Alert Toggle */}
                        <div className="flex items-center gap-2 bg-amber-50/50 border border-amber-200/50 rounded-xl px-3 py-1.5 self-start sm:self-auto shadow-4xs">
                          <input
                            type="checkbox"
                            id="bulk-email-alert-toggle"
                            checked={bulkEmailAlertToggle}
                            onChange={(e) => setBulkEmailAlertToggle(e.target.checked)}
                            className="rounded text-teal-600 focus:ring-teal-600 h-3.5 w-3.5 cursor-pointer accent-teal-600"
                          />
                          <label htmlFor="bulk-email-alert-toggle" className="text-[9px] font-bold text-amber-950 uppercase tracking-wide cursor-pointer select-none">
                            Alert Email if &gt;2 Overdue
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                        {/* Filter dropdown */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black uppercase text-stone-400 tracking-wider">Show Status</label>
                          <select
                            value={bulkFilter}
                            onChange={(e) => setBulkFilter(e.target.value as any)}
                            className="bg-white border border-stone-250 rounded-xl py-2 px-2.5 text-xxs font-bold text-stone-850 focus:outline-hidden focus:ring-1 focus:ring-teal-600 cursor-pointer shadow-4xs"
                          >
                            <option value="all">All Horses</option>
                            <option value="overdue">Overdue (Unchecked Today)</option>
                            <option value="uptodate">Checked Today</option>
                          </select>
                        </div>

                        {/* Paddock Sort dropdown */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black uppercase text-stone-400 tracking-wider">Sort Paddocks</label>
                          <select
                            value={paddockSort}
                            onChange={(e) => setPaddockSort(e.target.value as any)}
                            className="bg-white border border-stone-250 rounded-xl py-2 px-2.5 text-xxs font-bold text-stone-850 focus:outline-hidden focus:ring-1 focus:ring-teal-600 cursor-pointer shadow-4xs"
                          >
                            <option value="name">Alphabetical (A-Z)</option>
                            <option value="count_desc">Horse Count (High-Low)</option>
                            <option value="count_asc">Horse Count (Low-High)</option>
                          </select>
                        </div>

                        {/* Horse Sort dropdown */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[9px] font-black uppercase text-stone-400 tracking-wider">Sort Horses</label>
                          <select
                            value={bulkHorseSort}
                            onChange={(e) => setBulkHorseSort(e.target.value as any)}
                            className="bg-white border border-stone-250 rounded-xl py-2 px-2.5 text-xxs font-bold text-stone-850 focus:outline-hidden focus:ring-1 focus:ring-teal-600 cursor-pointer shadow-4xs"
                          >
                            <option value="name">Horse Name</option>
                            <option value="last_check">Last Checked Date</option>
                            <option value="stable">Stable / Location</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {paddockGroups.length === 0 ? (
                      /* Initial non-AI simple list */
                      <div className="space-y-4">
                        <span className="text-xxs font-black text-stone-400 uppercase tracking-widest block">
                          Active Farm Locations
                        </span>
                        {(() => {
                          const rawPaddocks = Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))) as string[];
                          const mappedPaddocks = rawPaddocks.map(paddockLoc => {
                            const groupHorses = horses.filter(h => h.stableNumber === paddockLoc);
                            return { paddockLoc, groupHorses };
                          });

                          const sortedPaddocks = [...mappedPaddocks].sort((a, b) => {
                            if (paddockSort === "count_desc") {
                              return b.groupHorses.length - a.groupHorses.length;
                            }
                            if (paddockSort === "count_asc") {
                              return a.groupHorses.length - b.groupHorses.length;
                            }
                            return a.paddockLoc.localeCompare(b.paddockLoc);
                          });

                          return sortedPaddocks.map(({ paddockLoc, groupHorses }, groupIdx) => {
                            const displayedHorses = sortHorsesList(filterGroupHorses(groupHorses));
                            const checkedCount = groupHorses.filter(h => h.lastCheckedDate === todayStr).length;
                            const completionPct = groupHorses.length > 0 ? Math.round((checkedCount / groupHorses.length) * 100) : 0;
                            
                            return (
                              <motion.div 
                                key={paddockLoc} 
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: groupIdx * 0.05, duration: 0.3 }}
                                className="border border-stone-200 rounded-2xl p-4 bg-stone-50/50 space-y-3"
                              >
                                <div className="flex justify-between items-start gap-4 flex-wrap">
                                  <div>
                                    <span className="text-xs font-black text-stone-800 uppercase tracking-wider block">
                                      {paddockLoc}
                                    </span>
                                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                                      <span className="text-[9px] text-stone-450 font-semibold uppercase tracking-wider block">
                                        {groupHorses.length} total horses
                                      </span>
                                      {renderSparkline(groupHorses)}
                                    </div>
                                  </div>
                                  <motion.button
                                    key={successCheckGroupName === paddockLoc ? "success" : "idle"}
                                    type="button"
                                    onClick={() => handleBulkCheckOk(groupHorses, paddockLoc)}
                                    animate={successCheckGroupName === paddockLoc ? { scale: [1, 1.15, 0.92, 1.05, 1] } : { scale: 1 }}
                                    transition={{ duration: 0.65, ease: "easeInOut" }}
                                    className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                                      successCheckGroupName === paddockLoc
                                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/40 ring-4 ring-emerald-500/25"
                                        : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-4xs"
                                    }`}
                                  >
                                    {successCheckGroupName === paddockLoc ? (
                                      <span className="flex items-center gap-1">
                                        <motion.span
                                          initial={{ scale: 0, rotate: -25 }}
                                          animate={{ scale: 1, rotate: 0 }}
                                          transition={{ type: "spring", stiffness: 350, damping: 14 }}
                                        >
                                          ✨ ✓ OK!
                                        </motion.span>
                                      </span>
                                    ) : (
                                      "✓ Bulk Mark OK"
                                    )}
                                  </motion.button>
                                </div>

                                {/* Visual progress bar */}
                                <div className="space-y-1.5 bg-white border border-stone-150 rounded-xl p-2.5">
                                  <div className="flex justify-between items-center text-[10px] font-black text-stone-500 uppercase tracking-wider">
                                    <span>Paddock Check Completion</span>
                                    <span className={completionPct === 100 ? "text-emerald-600 font-extrabold" : "text-stone-700 font-bold"}>
                                      {completionPct}% ({checkedCount}/{groupHorses.length} Checked)
                                    </span>
                                  </div>
                                  <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden shadow-4xs">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${completionPct}%` }}
                                      transition={{ duration: 0.6, ease: "easeOut" }}
                                      className={`h-full rounded-full ${
                                        completionPct === 100 
                                          ? "bg-emerald-500" 
                                          : completionPct > 0 
                                            ? "bg-amber-500" 
                                            : "bg-stone-300"
                                      }`}
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {displayedHorses.length === 0 ? (
                                    <span className="text-xxs text-stone-400 italic">No horses match the filter</span>
                                  ) : (
                                    displayedHorses.map((h, horseIdx) => {
                                      const isCheckedToday = h.lastCheckedDate === todayStr;
                                      return (
                                        <motion.span 
                                          key={h.id} 
                                          initial={{ opacity: 0, scale: 0.9 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          transition={{ delay: horseIdx * 0.03 }}
                                          className={`text-xxs font-semibold px-2 py-1 rounded-lg border flex items-center gap-1 ${
                                            isCheckedToday 
                                              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                              : "bg-white text-stone-700 border-stone-200"
                                          }`}
                                        >
                                          {isCheckedToday && <span className="text-[9px]">✓</span>}
                                          {h.name}
                                        </motion.span>
                                      );
                                    })
                                  )}
                                </div>
                              </motion.div>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      /* AI grouped list */
                      <div className="space-y-4">
                        <span className="text-xxs font-black text-teal-700 uppercase tracking-widest block flex items-center gap-1">
                          <Sparkles size={11} className="text-teal-600 animate-pulse" /> Nova Herd AI Matches Found
                        </span>
                        {(() => {
                          const sortedPaddockGroups = [...paddockGroups].sort((a, b) => {
                            if (paddockSort === "count_desc") {
                              return (b.horses?.length || 0) - (a.horses?.length || 0);
                            }
                            if (paddockSort === "count_asc") {
                              return (a.horses?.length || 0) - (b.horses?.length || 0);
                            }
                            return a.canonicalName.localeCompare(b.canonicalName);
                          });

                          return sortedPaddockGroups.map((group, groupIdx) => {
                            const groupHorses = group.horses || [];
                            const displayedHorses = sortHorsesList(filterGroupHorses(groupHorses));
                            const checkedCount = groupHorses.filter((h: any) => h.lastCheckedDate === todayStr).length;
                            const completionPct = groupHorses.length > 0 ? Math.round((checkedCount / groupHorses.length) * 100) : 0;

                            return (
                              <motion.div 
                                key={group.canonicalName} 
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: groupIdx * 0.05, duration: 0.3 }}
                                className="border-2 border-teal-600/15 rounded-2xl p-4 bg-teal-50/5 space-y-3 shadow-xs"
                              >
                                <div className="flex justify-between items-start gap-4 flex-wrap">
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-black text-teal-950 uppercase tracking-wider">
                                        {group.canonicalName}
                                      </span>
                                      <span className="text-[9px] font-black uppercase bg-teal-100 text-teal-850 px-1.5 py-0.2 rounded-full border border-teal-200">
                                        Nova Herd AI Grouped
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3.5 mt-1.5 flex-wrap">
                                      <div className="text-[9px] text-stone-450 font-semibold uppercase tracking-wider">
                                        Unified: {group.locations.join(", ")}
                                      </div>
                                      {renderSparkline(groupHorses)}
                                    </div>
                                  </div>
                                  <motion.button
                                    key={successCheckGroupName === group.canonicalName ? "success" : "idle"}
                                    type="button"
                                    onClick={() => handleBulkCheckOk(groupHorses, group.canonicalName)}
                                    disabled={groupHorses.length === 0}
                                    animate={successCheckGroupName === group.canonicalName ? { scale: [1, 1.15, 0.92, 1.05, 1] } : { scale: 1 }}
                                    transition={{ duration: 0.65, ease: "easeInOut" }}
                                    className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                                      successCheckGroupName === group.canonicalName
                                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/40 ring-4 ring-emerald-500/25"
                                        : "bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white shadow-4xs"
                                    }`}
                                  >
                                    {successCheckGroupName === group.canonicalName ? (
                                      <span className="flex items-center gap-1">
                                        <motion.span
                                          initial={{ scale: 0, rotate: -25 }}
                                          animate={{ scale: 1, rotate: 0 }}
                                          transition={{ type: "spring", stiffness: 350, damping: 14 }}
                                        >
                                          ✨ ✓ OK!
                                        </motion.span>
                                      </span>
                                    ) : (
                                      `✓ Mark OK (${groupHorses.length})`
                                    )}
                                  </motion.button>
                                </div>

                                {/* Visual progress bar */}
                                <div className="space-y-1.5 bg-white border border-stone-200 rounded-xl p-2.5">
                                  <div className="flex justify-between items-center text-[10px] font-black text-stone-600 uppercase tracking-wider">
                                    <span>Nova Herd AI Group Completion Gauge</span>
                                    <span className={completionPct === 100 ? "text-emerald-600 font-extrabold" : "text-stone-700 font-bold"}>
                                      {completionPct}% ({checkedCount}/{groupHorses.length} Checked)
                                    </span>
                                  </div>
                                  <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden shadow-4xs">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${completionPct}%` }}
                                      transition={{ duration: 0.6, ease: "easeOut" }}
                                      className={`h-full rounded-full ${
                                        completionPct === 100 
                                          ? "bg-teal-500" 
                                          : completionPct > 0 
                                            ? "bg-amber-500" 
                                            : "bg-stone-300"
                                      }`}
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 pt-1">
                                  {displayedHorses.length === 0 ? (
                                    <span className="text-xxs text-stone-400 italic">No horses match the filter</span>
                                  ) : (
                                    displayedHorses.map((h: any, horseIdx) => {
                                      const isCheckedToday = h.lastCheckedDate === todayStr;
                                      return (
                                        <motion.div 
                                          key={h.id} 
                                          initial={{ opacity: 0, scale: 0.9 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          transition={{ delay: horseIdx * 0.03 }}
                                          className={`flex flex-col border p-2 rounded-xl text-center shadow-4xs shrink-0 min-w-[75px] ${
                                            isCheckedToday 
                                              ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                                              : "bg-white border-stone-200 text-stone-800"
                                          }`}
                                        >
                                          <span className="text-xs font-black flex items-center justify-center gap-1">
                                            {isCheckedToday && <span className="text-emerald-600">✓</span>}
                                            {h.name}
                                          </span>
                                          <span className="text-[8px] font-bold text-stone-400 uppercase tracking-wider mt-0.5">{h.stableNumber}</span>
                                        </motion.div>
                                      );
                                    })
                                  )}
                                </div>
                              </motion.div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-150 flex justify-end shrink-0">
              <button
                onClick={() => setIsBulkPaddockCheckOpen(false)}
                className="text-xs font-semibold text-stone-600 hover:text-stone-900 border border-stone-200 hover:border-stone-400 bg-white px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-xs"
              >
                Close Window
              </button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Back to Top Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 bg-teal-600/20 hover:bg-teal-700 text-teal-600/60 hover:text-white p-3.5 rounded-full shadow-xs hover:shadow-lg z-50 transition-all cursor-pointer border border-teal-500/10 hover:border-teal-500/30 flex items-center justify-center backdrop-blur-3xs"
            title="Back to Top"
          >
            <ArrowUp size={20} strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>

      {currentUser && currentUser.hasSeenTutorial !== true && currentUser.role !== "owner" && currentUser.name !== "System Administrator" && (
        <div className="fixed inset-0 bg-stone-900/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] overflow-y-auto" id="tutorial-modal-overlay">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl overflow-hidden max-w-2xl w-full max-h-[85vh] flex flex-col my-auto animate-fade-in" id="tutorial-modal-box">
            {/* Header */}
            <div className="bg-stone-900 text-stone-100 p-6 flex items-center justify-between relative overflow-hidden shrink-0">
              <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-6 -translate-y-6">
                <BookOpen size={160} className="text-teal-400" />
              </div>
              <div className="relative z-10 space-y-1 text-left">
                <span className="text-[9px] bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest">
                  System Onboarding
                </span>
                <h1 className="text-lg font-black tracking-tight uppercase">Horse Sense Guide</h1>
                <p className="text-[11px] text-stone-400 font-medium">System navigation & security clearance rules.</p>
              </div>
              <div className="w-12 h-12 bg-stone-800 rounded-xl flex items-center justify-center border border-stone-700 shadow-inner shrink-0">
                <Compass className="text-teal-400 animate-spin-slow" size={24} />
              </div>
            </div>

            {onboardingStep === 1 ? (
              <>
                {/* Scrollable Content */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
                  {/* Intro */}
                  <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex items-start gap-3">
                    <div className="p-2 bg-teal-50 text-teal-700 rounded-lg border border-teal-100 shrink-0">
                      <Activity size={16} />
                    </div>
                    <div className="space-y-0.5">
                      <h3 className="font-bold text-stone-900 text-xs">Hello, {currentUser.name}!</h3>
                      <p className="text-xxs text-stone-600 leading-relaxed">
                        Welcome to the Ruabon Farm system portal. Your active security clearance as an <strong className="text-teal-700 uppercase font-extrabold">{currentUser.role}</strong> tailors specific commands and dashboard layouts for your role. Please read this guide to understand your access and tasks.
                      </p>
                    </div>
                  </div>

                  {/* Special Guest & Visitor Onboarding Guidelines */}
                  {currentUser.role === "visitor" && (
                    <div className="bg-pink-50/50 border border-pink-200 rounded-2xl p-4.5 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-pink-100 text-pink-700 rounded-lg border border-pink-200">
                          <Sparkles size={14} />
                        </div>
                        <h3 className="font-extrabold text-stone-900 text-xs uppercase tracking-wider">How Guest & Visitor Access Works</h3>
                      </div>
                      <div className="text-xxs text-stone-700 leading-relaxed space-y-1.5">
                        <p>
                          Welcome to Ruabon Farm! To protect herd safety and preserve operations, your guest portal provides secure, pre-approved digital clearance features:
                        </p>
                        <ul className="list-disc pl-4 space-y-1">
                          <li><strong>Scanning Horse Brands & Markings:</strong> Use the live camera scanner to read branded numbers or marking details, automatically matching identity records.</li>
                          <li><strong>Pre-Approved Paddock Decryptors:</strong> Access is restricted only to actual, active paddocks in the system that have been authorized for your visit.</li>
                          <li><strong>Real-time Compliance Loggers:</strong> You may submit daily horse checks or checklists sponsored by on-site crew members.</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Roles Breakdown */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Clearance Protocols</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="bg-white border border-stone-150 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-red-50 text-red-600 border border-red-100 flex items-center justify-center shrink-0">
                            <Shield size={12} />
                          </div>
                          <span className="font-black text-xxs text-stone-900 uppercase tracking-wider">1. Owner Control Station</span>
                        </div>
                        <p className="text-xxs text-stone-500 leading-relaxed">
                          Holds critical farm administrative tools including emergency shutdown deactivation/override, pre-authorizing guests, managing custom visitor PINs, and auditing system access trails.
                        </p>
                      </div>

                      <div className="bg-white border border-stone-150 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0">
                            <Users size={12} />
                          </div>
                          <span className="font-black text-xxs text-stone-900 uppercase tracking-wider">2. Crew Directory & Logs</span>
                        </div>
                        <p className="text-xxs text-stone-500 leading-relaxed">
                          Tracks public herd health and checklists. Allows logging daily checks, setting critical priorities, registering medications, and design/scans of digital QR credentials.
                        </p>
                      </div>

                      <div className="bg-white border border-stone-150 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-stone-100 text-stone-600 border border-stone-200 flex items-center justify-center shrink-0">
                            <User size={12} />
                          </div>
                          <span className="font-black text-xxs text-stone-900 uppercase tracking-wider">3. Guest Access Port</span>
                        </div>
                        <p className="text-xxs text-stone-500 leading-relaxed">
                          Provides controlled view matching strict permissions. Restricted to hours/paddocks allowed by owners. Includes weekly-rotating PIN codes for safety.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Security Alerts & Features */}
                  <div className="border-t border-stone-150 pt-4 space-y-2.5">
                    <h4 className="text-[10px] font-black text-stone-400 uppercase tracking-widest">System Controls & Safety</h4>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="text-xxs text-stone-600 flex items-start gap-2.5">
                        <Bell className="text-teal-600 shrink-0 mt-0.5" size={13} />
                        <span><strong>Real-Time Session Notifications:</strong> Manage alerts or sign out suspicious concurrent sessions instantly from the panel.</span>
                      </div>
                      <div className="text-xxs text-stone-600 flex items-start gap-2.5">
                        <Shield className="text-rose-500 shrink-0 mt-0.5" size={13} />
                        <span><strong>Multi-Factor Overrides:</strong> Admins require passkeys/PIN deactivation sequences during emergency states.</span>
                      </div>
                      <div className="text-xxs text-stone-600 flex items-start gap-2.5">
                        <Sparkles className="text-amber-500 shrink-0 mt-0.5" size={13} />
                        <span><strong>Nova Herd AI:</strong> Ask veterinary or farrier questions to our model context-grounded with complete herd logs.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="p-4 bg-stone-50 border-t border-stone-150 flex flex-col gap-3 shrink-0">
                  {/* Terms of Service Section with Checkbox */}
                  <div className="flex items-center justify-center gap-2 bg-stone-100/80 p-2.5 rounded-xl border border-stone-200">
                    <input
                      type="checkbox"
                      id="agree-tos-checkbox"
                      checked={agreedToTosOnboarding}
                      onChange={(e) => setAgreedToTosOnboarding(e.target.checked)}
                      className="rounded text-teal-600 focus:ring-teal-600 h-4 w-4 cursor-pointer accent-teal-600"
                    />
                    <label htmlFor="agree-tos-checkbox" className="text-stone-700 font-bold text-xs cursor-pointer select-none">
                      I agree to the <button type="button" onClick={(e) => { e.preventDefault(); setShowTosModal(true); }} className="text-teal-600 underline font-bold hover:text-teal-800">Terms and Conditions</button>
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">
                      Welcome to Nova Herd
                    </span>
                    <button
                      type="button"
                      disabled={!agreedToTosOnboarding}
                      onClick={() => {
                        if (currentUser.role === "visitor") {
                          setOnboardingStep(2);
                        } else {
                          handleCompleteTutorial();
                        }
                      }}
                      className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-stone-300 disabled:text-stone-500 text-white font-black text-xxs uppercase tracking-widest rounded-xl transition-all flex items-center gap-1.5 shadow-sm hover:shadow-md shrink-0 enabled:cursor-pointer disabled:cursor-not-allowed"
                      id="tutorial-get-started-btn"
                    >
                      {currentUser.role === "visitor" ? "Next: Create PIN" : "Get Started"} <ArrowRight size={12} className="animate-pulse" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // Step 2: Visitor PIN Creation Page
              <div className="p-6 flex flex-col flex-1 overflow-y-auto space-y-6 text-left">
                <div className="bg-pink-50 border border-pink-200 rounded-2xl p-4 flex items-start gap-3">
                  <div className="p-2 bg-pink-100 text-pink-700 rounded-lg border border-pink-200 shrink-0">
                    <Key size={16} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-extrabold text-stone-900 text-xs uppercase tracking-wider">Set Secure Visitor PIN</h3>
                    <p className="text-xxs text-stone-600 leading-relaxed">
                      To activate your Ruabon Farm Guest clearance, you must configure a secure <strong>4-digit numeric PIN</strong>. This PIN is required to access your guest dashboard features and on-site security badges.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 max-w-sm mx-auto w-full pt-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                      Choose 4-Digit PIN
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="••••"
                      value={newVisitorPin}
                      onChange={(e) => {
                        setNewVisitorPin(e.target.value.replace(/\D/g, ""));
                        setPinCreationError(null);
                      }}
                      className="w-full bg-stone-50 border border-stone-250 rounded-2xl px-4 py-3 text-center font-bold text-lg tracking-[0.5em] text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden focus:bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                      Confirm 4-Digit PIN
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="••••"
                      value={newVisitorPinConfirm}
                      onChange={(e) => {
                        setNewVisitorPinConfirm(e.target.value.replace(/\D/g, ""));
                        setPinCreationError(null);
                      }}
                      className="w-full bg-stone-50 border border-stone-250 rounded-2xl px-4 py-3 text-center font-bold text-lg tracking-[0.5em] text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden focus:bg-white"
                    />
                  </div>

                  {pinCreationError && (
                    <div className="text-red-600 text-xxs font-bold uppercase tracking-wider bg-red-50 p-2.5 rounded-xl border border-red-150 text-center animate-shake">
                      ⚠️ {pinCreationError}
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-stone-150 flex flex-col sm:flex-row gap-3 justify-between items-center mt-auto">
                  <button
                    type="button"
                    onClick={async () => {
                      // Delete temporary guest account from Firestore and log out if they leave/cancel
                      const docId = currentUser.name.toLowerCase().replace(/\s+/g, "_");
                      try {
                        const { doc, deleteDoc } = await import("firebase/firestore");
                        await deleteDoc(doc(db, "visitor_permissions", docId));
                      } catch (err) {
                        console.error("Failed to cancel visitor registration:", err);
                      }
                      setCurrentUser(null);
                      localStorage.removeItem("horsesense_user");
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 border border-stone-250 text-stone-500 hover:text-stone-800 hover:bg-stone-50 font-black text-xxs uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                  >
                    Cancel & Delete Pass
                  </button>

                  <button
                    type="button"
                    disabled={newVisitorPin.length !== 4 || newVisitorPinConfirm.length !== 4}
                    onClick={async () => {
                      if (newVisitorPin !== newVisitorPinConfirm) {
                        setPinCreationError("PINs do not match. Please re-enter.");
                        return;
                      }
                      if (!/^\d{4}$/.test(newVisitorPin)) {
                        setPinCreationError("PIN must be exactly 4 digits.");
                        return;
                      }
                      await handleCompleteTutorial(newVisitorPin);
                    }}
                    className="w-full sm:w-auto px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xxs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed enabled:cursor-pointer"
                  >
                    Complete Activation <ShieldCheck size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terms and Conditions Detail Modal Overlay */}
      {showTosModal && (
        <div 
          className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[10000] cursor-pointer" 
          id="tos-details-modal"
          onClick={() => setShowTosModal(false)}
        >
          <div 
            className="bg-white rounded-3xl border border-stone-200 shadow-2xl p-6 w-full max-w-lg animate-scale-up text-left flex flex-col max-h-[80vh] cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-150 pb-3 mb-4">
              <div className="flex items-center gap-2 text-blue-600">
                <Shield size={18} />
                <h3 className="text-xs font-black tracking-wider text-stone-900 uppercase">
                  Terms of Service Agreement
                </h3>
              </div>
              <button 
                onClick={() => setShowTosModal(false)}
                className="text-stone-400 hover:text-stone-700 text-lg font-bold p-1 cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto text-[11px] text-stone-600 leading-relaxed bg-stone-50 border border-stone-150 rounded-2xl p-4 whitespace-pre-wrap font-sans font-medium mb-4 space-y-2">
              {onboardingTosText || (
                <>
                  <p className="font-bold text-stone-900">TERMS OF SERVICE & FACILITY OPERATIONS AGREEMENT</p>
                  <p><strong>1. BAN ON SUING & COMPLETE LIABILITY RELEASE:</strong> By accessing this platform or facility, all operators, crew members, farm owners, agistors, riders, and visitors irrevocably agree NOT to sue, assert claims, or initiate legal proceedings against Nova Herd, Ruabon Farm, facility owners, administrators, or software developers. All users waive rights to trial by jury or class action litigation and agree that all disputes must be settled through binding private individual arbitration.</p>
                  <p><strong>2. FEATURE PERMISSIONS & SECURITY CLEARANCES:</strong> Administrative controls, security overrides, and feature permission configurations are strictly restricted to verified farm owners. Riders, agistors, and visitors are banned from attempting to access, alter, or view feature permissions or administrative consoles.</p>
                  <p><strong>3. PROHIBITION ON IFRAME & FORMAT CODE EXTRACTION:</strong> Source format codes and website embed iframe codes are proprietary. Riders, agistors, and guests are strictly prohibited from accessing, viewing, or extracting format iframe codes.</p>
                  <p><strong>4. EQUINE HEALTH & PIN CONFIDENTIALITY:</strong> You agree to maintain staff PIN confidentiality, log biosecurity checks accurately, and report any security incidents immediately to the Farm Administrator.</p>
                </>
              )}
            </div>

            <button
              onClick={() => setShowTosModal(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-xxs uppercase tracking-widest py-3 rounded-xl transition-colors cursor-pointer text-center"
            >
              Close & Go Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
