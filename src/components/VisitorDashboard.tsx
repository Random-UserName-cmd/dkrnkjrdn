import React, { useState, useEffect } from "react";
import { SystemUser, Horse, RideLog } from "../types";
import { 
  LogOut, Camera, Sparkles, HelpCircle, ShieldAlert, Compass, 
  FileText, CheckCircle2, XCircle, Lock, Unlock, ChevronRight, 
  Calendar, Eye, Shield, AlertCircle, Info, Star, Clock, 
  ShieldCheck, ShieldX, Wrench, Plus, X, Save, RefreshCw,
  RotateCw, Smartphone, Fingerprint, ScanFace, Check
} from "lucide-react";
import { BadgeQRCode } from "./ProfileEditor";
import { db } from "../firebase";
import { collection, onSnapshot, query, where, doc, setDoc, addDoc, deleteDoc } from "firebase/firestore";
import MarkingScanner from "./MarkingScanner";
import HorseSenseLogo from "./HorseSenseLogo";
import HorsesenseAIChat from "./HorsesenseAIChat";
import { exportBadgeImage } from "../utils/badgeExport";
import { isBiometricsEnrolled, enrollBiometrics, disableBiometrics, authenticateWithBiometrics } from "../utils/biometrics";

interface VisitorDashboardProps {
  currentUser: SystemUser;
  horses: Horse[];
  onLogout: () => void;
}

export default function VisitorDashboard({ currentUser, horses, onLogout }: VisitorDashboardProps) {
  const [localAssistedAccessMode, setLocalAssistedAccessMode] = useState(() => localStorage.getItem("visitor_assisted_access") === "true");

  const handleToggleLocalAssisted = () => {
    const nextVal = !localAssistedAccessMode;
    setLocalAssistedAccessMode(nextVal);
    localStorage.setItem("visitor_assisted_access", String(nextVal));
  };

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedHistory, setScannedHistory] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [brandModalHorse, setBrandModalHorse] = useState<any | null>(null);
  
  // States for making a new document request
  const [requestingItem, setRequestingItem] = useState<any | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<string[]>([
    "Clinical & Health Records",
    "Farrier & Shoeing History"
  ]);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Real-time Visitor Gatekeeper Permissions
  const [visitorPerm, setVisitorPerm] = useState<any | null>(null);
  const [loadingPerm, setLoadingPerm] = useState(true);
  const [showBadgeModal, setShowBadgeModal] = useState(false);

  // Maintenance Log Form states
  const [isMaintenanceFormOpen, setIsMaintenanceFormOpen] = useState(false);
  const [logHorseId, setLogHorseId] = useState("");
  const [logType, setLogType] = useState("other");
  const [logNotes, setLogNotes] = useState("");
  const [logCost, setLogCost] = useState("0");
  const [logPerformedBy, setLogPerformedBy] = useState(currentUser?.name || "");
  const [logError, setLogError] = useState<string | null>(null);
  const [logSuccess, setLogSuccess] = useState<string | null>(null);
  const [loggingProgress, setLoggingProgress] = useState(false);

  // Guest Code Activation states
  const [activationCode, setActivationCode] = useState("");
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState<string | null>(null);

  // Daily Checking states
  const [dailyCheckStatus, setDailyCheckStatus] = useState("OK");
  const [dailyCheckNotes, setDailyCheckNotes] = useState("");
  const [checkingProgress, setCheckingProgress] = useState(false);
  const [checkSuccess, setCheckSuccess] = useState<string | null>(null);

  // Edit PIN states
  const [showEditPinModal, setShowEditPinModal] = useState(false);
  const [editPinCurrent, setEditPinCurrent] = useState("");
  const [editPinNew, setEditPinNew] = useState("");
  const [editPinConfirm, setEditPinConfirm] = useState("");
  const [editPinError, setEditPinError] = useState<string | null>(null);
  const [editPinSuccess, setEditPinSuccess] = useState<string | null>(null);
  const [editingPinProgress, setEditingPinProgress] = useState(false);

  // Biometric Authentication (FaceID/TouchID) states
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(() => isBiometricsEnrolled(currentUser?.name || ""));
  const [biometricTesting, setBiometricTesting] = useState(false);
  const [biometricMsg, setBiometricMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Ride Log states
  const [isRideFormOpen, setIsRideFormOpen] = useState(false);
  const [rideHorseId, setRideHorseId] = useState("");
  const [rideDuration, setRideDuration] = useState("45");
  const [rideIntensity, setRideIntensity] = useState<"light" | "medium" | "hard">("medium");
  const [rideNotes, setRideNotes] = useState("");
  const [rideError, setRideError] = useState<string | null>(null);
  const [rideSuccess, setRideSuccess] = useState<string | null>(null);
  const [loggingRideProgress, setLoggingRideProgress] = useState(false);
  const [rideHistory, setRideHistory] = useState<any[]>([]);

  // Selected horse maintenance logs and ride history for rich dashboard details
  const [horseMaintenanceLogs, setHorseMaintenanceLogs] = useState<any[]>([]);
  const [selectedHorseRideHistory, setSelectedHorseRideHistory] = useState<any[]>([]);
  const [modalActiveTab, setModalActiveTab] = useState<"profile" | "rides" | "maintenance">("profile");

  // In-modal Ride log form states
  const [modalRideDuration, setModalRideDuration] = useState("45");
  const [modalRideIntensity, setModalRideIntensity] = useState<"light" | "medium" | "hard">("medium");
  const [modalRideNotes, setModalRideNotes] = useState("");
  const [modalRideError, setModalRideError] = useState<string | null>(null);
  const [modalRideSuccess, setModalRideSuccess] = useState<string | null>(null);
  const [modalRideLoading, setModalRideLoading] = useState(false);

  // In-modal Maintenance form states
  const [modalLogType, setModalLogType] = useState("other");
  const [modalLogNotes, setModalLogNotes] = useState("");
  const [modalLogCost, setModalLogCost] = useState("0");
  const [modalLogPerformedBy, setModalLogPerformedBy] = useState(currentUser?.name || "");
  const [modalLogError, setModalLogError] = useState<string | null>(null);
  const [modalLogSuccess, setModalLogSuccess] = useState<string | null>(null);
  const [modalLogLoading, setModalLogLoading] = useState(false);

  useEffect(() => {
    if (!selectedItem?.horseId) {
      setHorseMaintenanceLogs([]);
      return;
    }
    const q = query(collection(db, `horses/${selectedItem.horseId}/logs`));
    const unsub = onSnapshot(q, (snapshot) => {
      const logs: any[] = [];
      snapshot.forEach(docSnap => {
        logs.push({ id: docSnap.id, ...docSnap.data() });
      });
      logs.sort((a, b) => {
        const dateA = a.createdAt || a.date || "";
        const dateB = b.createdAt || b.date || "";
        return dateB.localeCompare(dateA);
      });
      setHorseMaintenanceLogs(logs);
    }, (err) => {
      console.error("Error subscribing to horse maintenance logs:", err);
    });
    return () => unsub();
  }, [selectedItem?.horseId]);

  useEffect(() => {
    if (!selectedItem?.horseId) {
      setSelectedHorseRideHistory([]);
      return;
    }
    const q = query(
      collection(db, "ride_logs"),
      where("horseId", "==", selectedItem.horseId)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const logs: any[] = [];
      snapshot.forEach(docSnap => {
        logs.push({ id: docSnap.id, ...docSnap.data() });
      });
      logs.sort((a, b) => {
        const dateA = a.createdAt || a.date || "";
        const dateB = b.createdAt || b.date || "";
        return dateB.localeCompare(dateA);
      });
      setSelectedHorseRideHistory(logs);
    }, (err) => {
      console.error("Error subscribing to horse ride logs:", err);
    });
    return () => unsub();
  }, [selectedItem?.horseId]);

  // Fetch / Subscribe to this guest's specific pre-authorization Gate profile
  useEffect(() => {
    if (!currentUser) {
      setLoadingPerm(false);
      return;
    }
    const q = query(collection(db, "visitor_permissions"));
    const unsub = onSnapshot(q, (snapshot) => {
      let foundPerm: any = null;
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.name && d.name.toLowerCase().trim() === currentUser.name.toLowerCase().trim()) {
          foundPerm = { id: docSnap.id, ...d };
        }
      });
      setVisitorPerm(foundPerm);
      setLoadingPerm(false);
    }, (err) => {
      console.error("Error subscribing to visitor permissions:", err);
      setLoadingPerm(false);
    });
    return () => unsub();
  }, [currentUser]);

  // Resolve actual permitted paddocks list
  const permittedPaddocksList = React.useMemo(() => {
    if (!visitorPerm) return [];
    const actualPaddocks = Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))) as string[];
    const allowed = visitorPerm.allowedPaddocks || [];
    if (allowed.includes("all")) {
      return actualPaddocks;
    }
    // Filter allowed paddocks to only include actual existing paddocks in the system
    return allowed.filter((p: string) => actualPaddocks.includes(p));
  }, [visitorPerm, horses]);

  // Check if visitor has valid gate access right now
  const checkGateAccess = () => {
    if (!visitorPerm) {
      return { allowed: true, isPreauthorized: false }; // Normal guest scan-only access
    }

    if (!visitorPerm.isActive) {
      return { 
        allowed: false, 
        isPreauthorized: true, 
        reason: "Access has been temporarily suspended or immediately revoked by Farm Administration (Owner Console)." 
      };
    }

    const now = new Date();
    // Get local date format (YYYY-MM-DD)
    const todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');

    if (visitorPerm.accessStartDate && todayStr < visitorPerm.accessStartDate) {
      return { 
        allowed: false, 
        isPreauthorized: true, 
        reason: `Your pre-approved guest window is not active yet. Allowed starts: ${visitorPerm.accessStartDate}.` 
      };
    }
    if (visitorPerm.accessEndDate && todayStr > visitorPerm.accessEndDate) {
      return { 
        allowed: false, 
        isPreauthorized: true, 
        reason: `Your pre-approved guest window expired on ${visitorPerm.accessEndDate}. Please contact Claire to extend access.` 
      };
    }

    // Daily hours check (HH:MM format)
    const currentHourMin = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');
    if (visitorPerm.accessStartHour && currentHourMin < visitorPerm.accessStartHour) {
      return { 
        allowed: false, 
        isPreauthorized: true, 
        reason: `Daily visitor access hours are restricted to: ${visitorPerm.accessStartHour} - ${visitorPerm.accessEndHour}. Current Time is ${currentHourMin}.` 
      };
    }
    if (visitorPerm.accessEndHour && currentHourMin > visitorPerm.accessEndHour) {
      return { 
        allowed: false, 
        isPreauthorized: true, 
        reason: `Daily visitor access hours are restricted to: ${visitorPerm.accessStartHour} - ${visitorPerm.accessEndHour}. Current Time is ${currentHourMin}.` 
      };
    }

    return { allowed: true, isPreauthorized: true };
  };

  const gateCheck = checkGateAccess();

  // Subscribe to guest's own scanned history in real-time
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "visitor_scanned_horses"),
      where("visitorName", "==", currentUser.name)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort so most recently scanned/updated is first
      list.sort((a, b) => {
        const dateA = a.requestedAt || a.scanDate || "";
        const dateB = b.requestedAt || b.scanDate || "";
        return dateB.localeCompare(dateA);
      });
      setScannedHistory(list);
    }, (err) => {
      console.error("Error subscribing to visitor scans:", err);
    });
    return () => unsub();
  }, [currentUser]);

  // Subscribe to ride logs in real-time
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "ride_logs"),
      where("riderName", "==", currentUser.name)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort newest first
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setRideHistory(list);
    }, (err) => {
      console.error("Error subscribing to ride logs:", err);
    });
    return () => unsub();
  }, [currentUser]);

  const handleDocToggle = (docType: string) => {
    setSelectedDocs(prev =>
      prev.includes(docType) ? prev.filter(t => t !== docType) : [...prev, docType]
    );
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestingItem) return;
    setSubmittingRequest(true);

    try {
      const docRefId = `${currentUser.name}_${requestingItem.horseId}`.replace(/\s+/g, "_");
      await setDoc(doc(db, "visitor_scanned_horses", docRefId), {
        visitorName: currentUser.name,
        horseId: requestingItem.horseId,
        horseName: requestingItem.horseName,
        scanDate: requestingItem.scanDate || new Date().toLocaleDateString(),
        status: "pending",
        requestedAt: new Date().toISOString(),
        documentTypes: selectedDocs,
      }, { merge: true });

      setRequestingItem(null);
    } catch (err) {
      console.error("Error submitting document request:", err);
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Submit visitor referral code activation
  const handleActivateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activationCode.length !== 6) return;
    setActivating(true);
    setActivationError(null);
    setActivationSuccess(null);

    try {
      const { getDocs, query, collection, where, doc, setDoc } = await import("firebase/firestore");
      
      // 1. Query crew_profiles for matching visitorCode
      const crewQuery = query(collection(db, "crew_profiles"), where("visitorCode", "==", activationCode));
      const querySnapshot = await getDocs(crewQuery);
      
      if (querySnapshot.empty) {
        setActivationError("Invalid or inactive guest activation code. Please check with your crew sponsor.");
        setActivating(false);
        return;
      }

      // Found matching crew
      const crewDoc = querySnapshot.docs[0];
      const crewData = crewDoc.data();

      // 2. Prepare visitor_permissions doc
      const now = new Date();
      const todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
      
      // End date 30 days from now
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30);
      const endStr = endDate.getFullYear() + "-" + String(endDate.getMonth() + 1).padStart(2, '0') + "-" + String(endDate.getDate()).padStart(2, '0');

      const docId = currentUser.name.toLowerCase().replace(/\s+/g, "_");
      
      const newPerm = {
        name: currentUser.name,
        pin: visitorPerm?.pin || Math.floor(1000 + Math.random() * 9000).toString(),
        isActive: true,
        canLogMaintenance: true,
        canLogDailyChecks: true,
        activatedByCrew: crewData.name,
        activatedByCode: activationCode,
        accessStartDate: todayStr,
        accessEndDate: endStr,
        accessStartHour: "00:00",
        accessEndHour: "23:59",
        allowedHorseIds: visitorPerm?.allowedHorseIds || ["all"], // give access to view all horses!
        allowedPaddocks: visitorPerm?.allowedPaddocks || ["all"], // give access to all padlocks!
      };

      await setDoc(doc(db, "visitor_permissions", docId), newPerm, { merge: true });
      
      // Audit action
      const { logAuditAction } = await import("../firebase");
      await logAuditAction(
        currentUser.name,
        "visitor",
        "modify",
        `Guest activated full check-in and maintenance logging access using referral code from ${crewData.name}`
      );

      setActivationSuccess(`✓ Access Activated! You have been granted full logging access sponsored by ${crewData.name}.`);
      setActivationCode("");
    } catch (err: any) {
      console.error("Error activating code:", err);
      setActivationError("Failed to process activation. Please check connection.");
    } finally {
      setActivating(false);
    }
  };

  // Submit dynamic health check from visitor
  const handleLogDailyCheck = async (horseId: string, horseName: string) => {
    setCheckingProgress(true);
    try {
      const { updateDoc, doc, getDoc } = await import("firebase/firestore");
      const horseRef = doc(db, "horses", horseId);
      const horseSnap = await getDoc(horseRef);
      if (!horseSnap.exists()) {
        throw new Error("Horse profile not found.");
      }
      
      const horseData = horseSnap.data();
      const existingHistory = horseData.dailyChecksHistory || [];

      const now = new Date();
      const todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
      const timeStr = String(now.getHours()).padStart(2, '0') + ":" + String(now.getMinutes()).padStart(2, '0');

      const newRecord = {
        id: Math.random().toString(36).substring(2, 9),
        date: todayStr,
        checkedBy: `${currentUser.name} (Authorized Guest)`,
        checkedAt: timeStr,
        status: dailyCheckStatus,
        notes: dailyCheckNotes
      };

      // Keep last 7 items
      const updatedHistory = [newRecord, ...existingHistory].slice(0, 7);

      await updateDoc(horseRef, {
        lastCheckedDate: todayStr,
        lastCheckedBy: `${currentUser.name} (Authorized Guest)`,
        lastCheckedStatus: dailyCheckStatus,
        dailyChecksHistory: updatedHistory,
        updatedAt: todayStr
      });

      // Log Audit action
      const { logAuditAction } = await import("../firebase");
      await logAuditAction(
        currentUser.name,
        "visitor",
        "modify",
        `Guest logged daily check for ${horseName}: Status - ${dailyCheckStatus}`
      );

      setCheckSuccess("✓ Daily check logged successfully in Firestore!");
      setDailyCheckNotes("");
      setTimeout(() => {
        setCheckSuccess(null);
      }, 3000);
    } catch (err: any) {
      console.error("Error logging daily check:", err);
      alert("Failed to submit daily check. Please try again.");
    } finally {
      setCheckingProgress(false);
    }
  };

  const handleModalSubmitRide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem?.horseId) return;
    setModalRideLoading(true);
    setModalRideError(null);
    setModalRideSuccess(null);

    try {
      const selectedHorse = horses.find(h => h.id === selectedItem.horseId);
      if (!selectedHorse) throw new Error("Horse not found.");

      const todayStr = new Date().toISOString().split("T")[0];

      await addDoc(collection(db, "ride_logs"), {
        horseId: selectedItem.horseId,
        horseName: selectedHorse.name,
        riderName: currentUser.name,
        date: todayStr,
        durationMinutes: Number(modalRideDuration) || 45,
        intensity: modalRideIntensity,
        notes: modalRideNotes,
        createdAt: new Date().toISOString()
      });

      // Log audit
      const { logAuditAction } = await import("../firebase");
      await logAuditAction(
        currentUser.name,
        "visitor",
        "modify",
        `Rider/Agistor logged a workout ride for horse ${selectedHorse.name}: ${modalRideDuration} mins, ${modalRideIntensity} intensity`
      );

      setModalRideSuccess(`Workout ride successfully logged for ${selectedHorse.name}!`);
      setModalRideNotes("");
    } catch (err: any) {
      console.error("Error logging in-modal ride:", err);
      setModalRideError(err.message || "Failed to log ride.");
    } finally {
      setModalRideLoading(false);
    }
  };

  const handleModalSubmitMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem?.horseId) return;
    setModalLogLoading(true);
    setModalLogError(null);
    setModalLogSuccess(null);

    try {
      const selectedHorse = horses.find(h => h.id === selectedItem.horseId);
      if (!selectedHorse) throw new Error("Horse not found.");

      const todayStr = new Date().toISOString().split("T")[0];

      await addDoc(collection(db, `horses/${selectedItem.horseId}/logs`), {
        horseId: selectedItem.horseId,
        horseName: selectedHorse.name,
        type: modalLogType,
        date: todayStr,
        notes: modalLogNotes,
        performedBy: modalLogPerformedBy || currentUser.name,
        cost: Number(modalLogCost) || 0,
        createdAt: todayStr,
        loggedBy: `${currentUser.name} (Authorized Guest)`
      });

      // Log audit
      const { logAuditAction } = await import("../firebase");
      await logAuditAction(
        currentUser.name,
        "visitor",
        "modify",
        `Authorized Guest logged maintenance task for horse ${selectedHorse.name}: ${modalLogNotes}`
      );

      setModalLogSuccess(`Maintenance log successfully saved for ${selectedHorse.name}!`);
      setModalLogNotes("");
      setModalLogCost("0");
    } catch (err: any) {
      console.error("Error logging in-modal maintenance:", err);
      setModalLogError(err.message || "Failed to log maintenance.");
    } finally {
      setModalLogLoading(false);
    }
  };

  // Submit maintenance log
  const handleVisitorSubmitMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logHorseId) {
      setLogError("Please select an authorized horse.");
      return;
    }
    setLoggingProgress(true);
    setLogError(null);
    setLogSuccess(null);

    try {
      const selectedHorse = horses.find(h => h.id === logHorseId);
      if (!selectedHorse) {
        throw new Error("Specified horse does not exist in the farm directory.");
      }

      const todayStr = new Date().toISOString().split("T")[0];

      await addDoc(collection(db, `horses/${logHorseId}/logs`), {
        horseId: logHorseId,
        horseName: selectedHorse.name,
        type: logType,
        date: todayStr,
        notes: logNotes,
        performedBy: logPerformedBy || currentUser.name,
        cost: Number(logCost) || 0,
        createdAt: todayStr,
        loggedBy: `${currentUser.name} (Authorized Guest)`
      });

      // Log audit
      const { logAuditAction } = await import("../firebase");
      await logAuditAction(
        currentUser.name,
        "visitor",
        "modify",
        `Authorized Guest logged maintenance task for horse ${selectedHorse.name}: ${logNotes}`
      );

      setLogSuccess(`Successfully saved ${logType} maintenance notes for ${selectedHorse.name}!`);
      setLogNotes("");
      setLogCost("0");
      setTimeout(() => {
        setIsMaintenanceFormOpen(false);
        setLogSuccess(null);
      }, 2000);
    } catch (err: any) {
      console.error("Error logging visitor maintenance:", err);
      setLogError(err.message || "Failed to persist maintenance entry.");
    } finally {
      setLoggingProgress(false);
    }
  };

  // Submit Workout Ride Log
  const handleVisitorSubmitRideLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rideHorseId) {
      setRideError("Please select a horse.");
      return;
    }
    setLoggingRideProgress(true);
    setRideError(null);
    setRideSuccess(null);

    try {
      const selectedHorse = horses?.find(h => h.id === rideHorseId);
      if (!selectedHorse) {
        throw new Error("Specified horse does not exist in the farm directory.");
      }

      const todayStr = new Date().toISOString().split("T")[0];

      await addDoc(collection(db, "ride_logs"), {
        horseId: rideHorseId,
        horseName: selectedHorse.name,
        riderName: currentUser.name,
        date: todayStr,
        durationMinutes: Number(rideDuration) || 45,
        intensity: rideIntensity,
        notes: rideNotes,
        createdAt: new Date().toISOString()
      });

      // Log audit
      const { logAuditAction } = await import("../firebase");
      await logAuditAction(
        currentUser.name,
        "visitor",
        "modify",
        `Rider/Agistor logged a workout ride for horse ${selectedHorse.name}: ${rideDuration} mins, ${rideIntensity} intensity`
      );

      setRideSuccess(`Successfully logged workout ride for ${selectedHorse.name}!`);
      setRideNotes("");
      setRideDuration("45");
      setTimeout(() => {
        setIsRideFormOpen(false);
        setRideSuccess(null);
      }, 2000);
    } catch (err: any) {
      console.error("Error logging workout ride:", err);
      setRideError(err.message || "Failed to log workout ride.");
    } finally {
      setLoggingRideProgress(false);
    }
  };

  const handleDeleteRideLog = async (logId: string) => {
    if (!window.confirm("Are you sure you want to delete this workout/ride record?")) return;
    try {
      await deleteDoc(doc(db, "ride_logs", logId));
      // Log audit
      const { logAuditAction } = await import("../firebase");
      await logAuditAction(
        currentUser.name,
        "visitor",
        "modify",
        `Rider/Agistor deleted a workout ride log (id: ${logId})`
      );
    } catch (err: any) {
      console.error("Error deleting ride log:", err);
      alert("Failed to delete ride log.");
    }
  };

  // Find corresponding horse data
  const getHorseData = (horseId: string) => {
    return horses.find(h => h.id === horseId);
  };

  const isPreAuth = !!(visitorPerm && visitorPerm.isPreAuthorized);
  const activeAssistedAccess = isPreAuth 
    ? !!visitorPerm?.assistedAccessMode 
    : localAssistedAccessMode;

  return (
    <div className={`min-h-screen bg-stone-100 flex flex-col justify-between ${activeAssistedAccess ? "assisted-access" : ""}`}>
      {/* Header */}
      <header className="bg-white border-b border-stone-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div 
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center space-x-3 cursor-pointer select-none"
          >
            <HorseSenseLogo className="w-9 h-9" />
            <div>
              <span className="font-black text-stone-900 text-xs tracking-tight uppercase block font-logo">Nova Herd</span>
              <span className="text-[9px] font-black text-pink-700 uppercase tracking-wider block">Farm Visitor Station</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-[10px] font-black uppercase text-stone-850">
                {currentUser.name}
              </span>
              <span className="text-[8px] font-bold text-stone-450 uppercase tracking-widest block mt-0.5">
                {gateCheck.isPreauthorized ? "Pre-Authorized Guest" : "Registered Guest"}
              </span>
            </div>
            <span className="text-xxs font-extrabold uppercase bg-pink-50 text-pink-700 px-3 py-1 rounded-full border border-pink-200/50">
              {gateCheck.isPreauthorized ? "Authorized Gate" : "Guest Mode"}
            </span>
            
            {/* Assisted Access Self-Enable Toggle for standard guests */}
            {!isPreAuth ? (
              <button
                type="button"
                onClick={handleToggleLocalAssisted}
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer font-bold text-[10px] uppercase tracking-wider ${
                  activeAssistedAccess 
                    ? "bg-purple-600 border-purple-700 text-white" 
                    : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                }`}
              >
                {activeAssistedAccess ? "Assisted On" : "Assisted Off"}
              </button>
            ) : (
              <span className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold text-[8px] uppercase tracking-widest ${
                activeAssistedAccess 
                  ? "bg-purple-100 border-purple-200 text-purple-750" 
                  : "bg-stone-50 border-stone-150 text-stone-400"
              }`}>
                {activeAssistedAccess ? "Assisted" : "Standard"}
              </span>
            )}

            <HorsesenseAIChat 
              currentUser={currentUser}
              horses={horses}
              todayStr="2026-07-05" 
              visitorScannedHistory={scannedHistory}
            />
            <button
              onClick={onLogout}
              className="text-stone-400 hover:text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-xl border border-stone-200/75 flex items-center gap-1.5 transition-all cursor-pointer font-bold text-[10px] uppercase tracking-wider"
              title="Exit Guest Mode"
            >
              <LogOut size={12} />
              <span>Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
        
        {loadingPerm ? (
          <div className="bg-white rounded-3xl border border-stone-200 p-8 text-center space-y-4">
            <RefreshCw className="animate-spin text-pink-600 mx-auto" size={24} />
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Decrypting Gate Credentials...</p>
          </div>
        ) : !gateCheck.allowed ? (
          /* Locked Out State Page */
          <div className="bg-white rounded-3xl border border-rose-200 shadow-xl p-8 text-center space-y-6 max-w-xl mx-auto my-12 animate-fade-in">
            <div className="mx-auto w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center border border-rose-150">
              <ShieldX className="text-rose-600 animate-pulse" size={32} />
            </div>
            <div className="space-y-2">
              <span className="text-[10px] bg-rose-100 text-rose-800 font-mono font-black tracking-widest px-3 py-1 rounded-full uppercase">
                Gate Lock: Access Suspended
              </span>
              <h1 className="text-lg font-black text-stone-900 uppercase tracking-tight mt-4">Pre-Approved Credentials Denied</h1>
              <p className="text-xs text-stone-600 font-semibold leading-relaxed max-w-md mx-auto whitespace-pre-line">
                {gateCheck.reason}
              </p>
            </div>
            <div className="pt-4 border-t border-stone-150 font-mono text-[9px] text-stone-400 uppercase tracking-wider">
              Secure Guard ID: GUEST-{currentUser.name.replace(/\s+/g, "").toUpperCase()}
            </div>
          </div>
        ) : (
          /* Active Permitted Content Dashboard */
          <>
            {/* Activation Referral Code Entry Widget */}
            {(!visitorPerm || !visitorPerm.activatedByCode) ? (
              <div className="bg-white rounded-3xl border border-amber-250 p-6 shadow-xs text-left space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-stone-100 pb-3">
                  <div className="space-y-1">
                    <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                      Crew Guest Sponsor Access
                    </span>
                    <h3 className="text-sm font-black uppercase text-stone-900 tracking-tight mt-1">
                      Unlock Full Checking &amp; Maintenance Logs
                    </h3>
                    <p className="text-[11px] text-stone-500 font-semibold leading-relaxed">
                      If an employee gave you a 6-digit visitor referral code from their badge, enter it below to instantly authorize yourself.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleActivateCode} className="flex flex-col sm:flex-row gap-3 items-end max-w-md pt-1">
                  <div className="w-full space-y-1">
                    <label className="block text-[9px] font-black text-stone-400 uppercase tracking-widest">
                      Enter 6-Digit Visitor Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 482931"
                      value={activationCode}
                      onChange={(e) => setActivationCode(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-stone-50 border border-stone-250 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold tracking-widest text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={activating || activationCode.length !== 6}
                    className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-extrabold text-[10px] py-3.5 px-6 rounded-xl uppercase tracking-wider cursor-pointer transition-colors shrink-0 flex items-center gap-1.5 shadow-3xs"
                  >
                    {activating ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      "Activate Access"
                    )}
                  </button>
                </form>

                {activationError && (
                  <p className="text-[10px] text-rose-600 font-bold leading-normal flex items-center gap-1">
                    <ShieldAlert size={12} /> {activationError}
                  </p>
                )}
                {activationSuccess && (
                  <p className="text-[10px] text-emerald-600 font-extrabold leading-normal flex items-center gap-1 animate-fade-in">
                    <CheckCircle2 size={12} /> {activationSuccess}
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-emerald-50/20 border border-emerald-200/60 rounded-3xl p-4 flex items-center justify-between text-left shadow-5xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <span className="text-[8px] font-black text-emerald-800 uppercase tracking-wider bg-emerald-100 px-1.5 py-0.5 rounded">
                      Activated Access
                    </span>
                    <p className="text-xs font-bold text-stone-900 mt-1">
                      Full check-in and maintenance logging sponsored by crew member <strong className="text-emerald-800 font-extrabold">{visitorPerm.activatedByCrew}</strong>.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-stone-400 uppercase">
                  Code: {visitorPerm.activatedByCode}
                </span>
              </div>
            )}

            {/* If Pre-authorized, show beautiful Pre-authorized panels */}
            {gateCheck.isPreauthorized && visitorPerm && (
              <div className="space-y-6 animate-fade-in">
                {/* Gate status banner */}
                <div className={`bg-gradient-to-r rounded-3xl p-6 shadow-lg relative overflow-hidden text-left ${
                  visitorPerm.isAgistorRider 
                    ? "from-emerald-950 to-stone-900 border border-emerald-900" 
                    : "from-pink-900 to-stone-900 border border-pink-950"
                }`}>
                  <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl pointer-events-none ${
                    visitorPerm.isAgistorRider ? "bg-emerald-500/10" : "bg-pink-500/10"
                  }`} />
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 z-10 relative">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`${
                          visitorPerm.isAgistorRider ? "bg-emerald-600" : "bg-pink-600"
                        } text-white text-[8.5px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider`}>
                          {visitorPerm.isAgistorRider ? "Agistor & Rider Terminal" : "Active Pre-Authorized Gate Pass"}
                        </span>
                        <span className="bg-emerald-600 text-white text-[8.5px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider animate-pulse">
                          Access Open
                        </span>
                      </div>
                      <h2 className="text-base font-black uppercase text-white tracking-wide">
                        {visitorPerm.isAgistorRider ? "Ruabon Agistor / Rider Dashboard" : "Ruabon Guest Credentials Terminal"}
                      </h2>
                      <p className={`text-[11px] font-semibold leading-relaxed ${
                        visitorPerm.isAgistorRider ? "text-emerald-200" : "text-pink-200"
                      }`}>
                        Welcome back, <strong className="text-white">{visitorPerm.name}</strong>. Clearances active for secure horse logging, workout rides, and care records.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {visitorPerm.isAgistorRider && (
                        <button
                          onClick={() => {
                            setRideError(null);
                            setRideSuccess(null);
                            setRideHorseId("");
                            setRideNotes("");
                            setRideDuration("45");
                            setIsRideFormOpen(true);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 border border-emerald-500 text-white font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
                        >
                          <Compass size={12} /> Log Workout / Ride
                        </button>
                      )}
                      {visitorPerm.canLogMaintenance && (
                        <button
                          onClick={() => setIsMaintenanceFormOpen(true)}
                          className={`bg-white hover:bg-stone-50 text-stone-900 font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer ${
                            visitorPerm.isAgistorRider ? "border border-emerald-250 hover:bg-emerald-50/20" : ""
                          }`}
                        >
                          <Wrench size={12} /> Submit Maintenance Log
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditPinError(null);
                          setEditPinSuccess(null);
                          setEditPinCurrent("");
                          setEditPinNew("");
                          setEditPinConfirm("");
                          setShowEditPinModal(true);
                        }}
                        className="bg-stone-800 hover:bg-stone-700 text-white font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer border border-stone-700"
                      >
                        <Lock size={12} /> Edit PIN
                      </button>
                      <button
                        onClick={() => {
                          setBiometricMsg(null);
                          setBiometricEnabled(isBiometricsEnrolled(currentUser?.name || ""));
                          setShowBiometricModal(true);
                        }}
                        className="bg-gradient-to-r from-teal-700 to-cyan-800 hover:from-teal-600 hover:to-cyan-700 text-white font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer border border-teal-600"
                      >
                        <Fingerprint size={13} className="text-teal-300" /> FaceID / TouchID
                      </button>
                      <button
                        onClick={() => setShowBadgeModal(true)}
                        className={`text-white font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer border ${
                          visitorPerm.isAgistorRider 
                            ? "bg-emerald-700 hover:bg-emerald-850 border-emerald-600" 
                            : "bg-pink-600 hover:bg-pink-750 border-pink-500"
                        }`}
                      >
                        <ShieldCheck size={12} /> View Badge
                      </button>
                    </div>
                  </div>

                  <div className={`mt-4 pt-3 border-t grid grid-cols-1 sm:grid-cols-3 gap-4 text-[10px] font-mono ${
                    visitorPerm.isAgistorRider 
                      ? "border-emerald-900/50 text-emerald-200" 
                      : "border-pink-950/50 text-pink-200"
                  }`}>
                    <div>
                      <span className={`${visitorPerm.isAgistorRider ? "text-emerald-400" : "text-pink-400"} block font-black uppercase tracking-wider`}>Daily Hours Window</span>
                      <span>{visitorPerm.accessStartHour || "00:00"} - {visitorPerm.accessEndHour || "23:59"} AWST</span>
                    </div>
                    <div>
                      <span className={`${visitorPerm.isAgistorRider ? "text-emerald-400" : "text-pink-400"} block font-black uppercase tracking-wider`}>Active Dates</span>
                      <span>{visitorPerm.accessStartDate ? visitorPerm.accessStartDate : "Open Start"} to {visitorPerm.accessEndDate ? visitorPerm.accessEndDate : "Open End"}</span>
                    </div>
                    <div>
                      <span className={`${visitorPerm.isAgistorRider ? "text-emerald-400" : "text-pink-400"} block font-black uppercase tracking-wider`}>Maintenance Access</span>
                      <span className={visitorPerm.canLogMaintenance ? "text-emerald-300 font-bold" : "text-stone-400"}>
                        {visitorPerm.canLogMaintenance ? "✓ Permitted (Write Allowed)" : "❌ Blocked (ReadOnly)"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pre-Authorized Horses section */}
                <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-5 shadow-3xs text-left">
                  <div>
                    <h2 className="text-xs font-black uppercase text-stone-900 tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className={visitorPerm.isAgistorRider ? "text-emerald-600" : "text-pink-600"} size={16} />
                      {visitorPerm.isAgistorRider ? "Mapped Horses Under Your Care" : "Pre-Authorized Horse Credentials"}
                    </h2>
                    <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                      {visitorPerm.isAgistorRider ? "Directly access schedules, diet specs, shoeing dates, and log entries" : "Instant profile records, no QR scanning required"}
                    </span>
                  </div>

                  {(!visitorPerm.allowedHorseIds || visitorPerm.allowedHorseIds.length === 0) ? (
                    <div className="py-6 border border-dashed border-stone-200 rounded-2xl text-center text-stone-400">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">No Horses specifically pre-approved</p>
                      <p className="text-[9px] text-stone-450 mt-0.5">Contact owner Claire or Cooper to authorize mapping permissions.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {visitorPerm.allowedHorseIds.map((hid: string) => {
                        const hObj = horses.find(h => h.id === hid);
                        if (!hObj) return null;

                        return (
                          <div
                            key={hid}
                            onClick={() => {
                              // Dummy granted scan item so we can reuse the decryption details modal seamlessly
                              setSelectedItem({
                                id: `preauth_${hid}`,
                                horseId: hid,
                                horseName: hObj.name,
                                scanDate: "Gate Clearance",
                                status: "granted"
                              });
                            }}
                            className={`bg-stone-50/50 hover:bg-white border p-4 rounded-2xl cursor-pointer transition-all flex justify-between items-center group shadow-4xs ${
                              visitorPerm.isAgistorRider ? "border-stone-200 hover:border-emerald-300" : "border-stone-200 hover:border-pink-300"
                            }`}
                          >
                            <div className="space-y-1.5">
                              <span className={`text-xs font-black uppercase transition-colors ${
                                visitorPerm.isAgistorRider ? "text-stone-900 group-hover:text-emerald-700" : "text-stone-900 group-hover:text-pink-700"
                              }`}>
                                🐴 {hObj.name}
                              </span>
                              <div className="flex items-center gap-2 text-[9px] font-mono text-stone-500 font-bold uppercase">
                                <span>{hObj.breed}</span>
                                <span>•</span>
                                <span className={`${
                                  visitorPerm.isAgistorRider ? "bg-emerald-100 text-emerald-800" : "bg-pink-100 text-pink-800"
                                } px-1.5 py-0.5 rounded text-[8px]`}>
                                  {visitorPerm.isAgistorRider ? "Mapped Care" : "Cleared"}
                                </span>
                              </div>
                            </div>
                            <ChevronRight size={14} className={`text-stone-300 transition-all ${
                              visitorPerm.isAgistorRider ? "group-hover:text-emerald-500" : "group-hover:text-pink-500"
                            } group-hover:translate-x-0.5`} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Rider workout ride history section */}
                {visitorPerm.isAgistorRider && (
                  <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-5 shadow-3xs text-left animate-fade-in">
                    <div>
                      <h2 className="text-xs font-black uppercase text-stone-900 tracking-wider flex items-center gap-1.5">
                        <Compass className="text-emerald-600 animate-spin-slow" size={16} />
                        Your Logged Rides &amp; Work History
                      </h2>
                      <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                        All training sessions logged on this system
                      </span>
                    </div>

                    {rideHistory.length === 0 ? (
                      <div className="py-8 border border-dashed border-stone-200 rounded-2xl text-center text-stone-400">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">No workout rides logged yet</p>
                        <p className="text-[9px] text-stone-450 mt-0.5">Use the "Log Workout / Ride" button above to log your first ride.</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                        {rideHistory.map((log) => (
                          <div key={log.id} className="p-4 bg-stone-50/50 border border-stone-200 rounded-2xl flex flex-col md:flex-row justify-between md:items-center gap-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-stone-900 uppercase">
                                  🐴 {log.horseName || "Unknown Horse"}
                                </span>
                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${
                                  log.intensity === "hard" ? "bg-rose-100 text-rose-800" :
                                  log.intensity === "medium" ? "bg-amber-100 text-amber-800" :
                                  "bg-emerald-100 text-emerald-800"
                                }`}>
                                  {log.intensity} intensity
                                </span>
                              </div>
                              {log.notes && (
                                <p className="text-xs text-stone-600 font-medium italic bg-white border border-stone-100 p-2.5 rounded-xl leading-relaxed mt-1">
                                  &ldquo;{log.notes}&rdquo;
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0 space-y-1 font-bold text-[9px] uppercase tracking-wide text-stone-500">
                              <div className="flex items-center justify-end gap-1.5">
                                <Clock size={11} className="text-stone-400" />
                                <span className="text-stone-800 font-extrabold">{log.durationMinutes} Minutes</span>
                              </div>
                              <div className="text-[8px] font-mono text-stone-400">
                                Logged {log.date || new Date(log.createdAt).toLocaleDateString()}
                              </div>
                              <div className="pt-1.5 flex justify-end">
                                <button
                                  onClick={() => handleDeleteRideLog(log.id)}
                                  className="inline-flex items-center gap-1 text-[8.5px] font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200/50 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Workout Log"
                                >
                                  <X size={10} /> Delete Log
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}


              </div>
            )}

            {/* General Brand Scanning Box */}
            <div className="bg-white rounded-3xl border border-stone-200 shadow-xs p-6 md:p-8 text-center space-y-6 text-left">
              <div className="mx-auto w-14 h-14 bg-pink-50 rounded-2xl flex items-center justify-center border border-pink-150">
                <Camera className="text-pink-600 animate-pulse" size={26} />
              </div>

              <div className="space-y-2 text-center">
                <h1 className="text-xl font-black text-stone-900 uppercase tracking-tight">Farm Guest Scanning Terminal</h1>
                <p className="text-xs text-stone-500 font-medium leading-relaxed max-w-md mx-auto">
                  Scan a horse's branding certificate or body markings to view their identity. Request official health and farrier documents directly from Cooper and Claire for digital approval.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setIsScannerOpen(true)}
                  className="w-full bg-teal-600 hover:bg-teal-750 text-white font-bold text-xs py-4 rounded-2xl transition-all cursor-pointer shadow-md uppercase tracking-wider flex items-center justify-center gap-2 hover:scale-[1.01]"
                >
                  <Camera size={16} />
                  <span>Launch Brand / Marking Scanner</span>
                </button>
              </div>
            </div>

            {/* Real-time Scanned Horses History */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-5 shadow-3xs text-left">
              <div className="border-b border-stone-100 pb-3 flex justify-between items-center">
                <div>
                  <h2 className="text-xs font-black uppercase text-stone-900 tracking-wider">
                    Your Scanned Horses History
                  </h2>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                    Real-Time Document Access Statuses
                  </span>
                </div>
                <span className="text-[10px] bg-pink-50 border border-pink-100/50 text-pink-700 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider font-mono">
                  Count: {scannedHistory.length}
                </span>
              </div>

              {scannedHistory.length === 0 ? (
                <div className="py-12 text-center text-stone-400 space-y-2">
                  <Compass className="mx-auto text-stone-300" size={28} />
                  <p className="text-xs font-bold uppercase tracking-wider text-stone-600">No scanned history found</p>
                  <p className="text-[11px] text-stone-500 max-w-sm mx-auto leading-relaxed">
                    Scan your first horse above! Once matched, they will appear here, and you can request document packs from the farm management.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {scannedHistory.map((item) => {
                    const isPending = item.status === "pending";
                    const isGranted = item.status === "granted";
                    const isDenied = item.status === "denied";
                    const isDeleted = !horses.some((h) => h.id === item.horseId);

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedItem(item)}
                        className={`p-4 rounded-2xl transition-all cursor-pointer shadow-3xs hover:shadow-2xs group flex flex-col justify-between ${
                          isDeleted
                            ? "bg-rose-50/40 hover:bg-rose-50/60 border border-rose-200/80 hover:border-rose-300"
                            : "bg-stone-50 hover:bg-white border border-stone-200/80 hover:border-pink-300"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <span className={`font-black text-sm block truncate ${
                              isDeleted ? "text-rose-950" : "text-stone-900 group-hover:text-pink-700"
                            }`}>
                              {item.horseName}
                            </span>
                            <ChevronRight size={14} className={`shrink-0 transition-all ${
                              isDeleted ? "text-rose-400 group-hover:text-rose-600" : "text-stone-300 group-hover:text-pink-500 group-hover:translate-x-0.5"
                            }`} />
                          </div>

                          {isDeleted ? (
                            <p className="text-[10px] text-rose-700 font-bold leading-normal">
                              Horse deleted by farm administration please contact admins for more information
                            </p>
                          ) : (
                            <div className="flex items-center text-[10px] text-stone-500 font-semibold uppercase font-mono gap-1">
                              <Calendar size={11} className="text-stone-400" />
                              Scanned: {item.scanDate}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-stone-200/40 flex items-center justify-between">
                          {isDeleted ? (
                            <span className="text-[9px] font-black uppercase text-rose-800 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md flex items-center gap-1">
                              <XCircle size={10} />
                              Record Unavailable
                            </span>
                          ) : (
                            <>
                              {isPending && (
                                <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md flex items-center gap-1">
                                  <Lock size={9} />
                                  Pending Approval
                                </span>
                              )}
                              {isGranted && (
                                <span className="text-[9px] font-black uppercase text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md flex items-center gap-1">
                                  <Unlock size={9} />
                                  Access Granted
                                </span>
                              )}
                              {isDenied && (
                                <span className="text-[9px] font-black uppercase text-rose-800 bg-rose-50 border border-rose-200 px-2 py-1 rounded-md flex items-center gap-1">
                                  <XCircle size={10} />
                                  Access Denied
                                </span>
                              )}
                              {!isPending && !isGranted && !isDenied && (
                                <span className="text-[9px] font-black uppercase text-stone-700 bg-stone-100 border border-stone-250 px-2 py-1 rounded-md flex items-center gap-1">
                                  <Info size={10} />
                                  Scanned Only
                                </span>
                              )}

                              {!isPending && !isGranted && !isDenied && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRequestingItem(item);
                                    setSelectedDocs(["Clinical & Health Records", "Farrier & Shoeing History"]);
                                  }}
                                  className="text-[9px] bg-pink-600 hover:bg-pink-700 text-white font-extrabold px-2 py-1 rounded uppercase tracking-wider"
                                >
                                  Request Docs
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-[10px] font-bold text-stone-400 uppercase tracking-widest border-t border-stone-150 bg-white mt-12">
        <span>© {new Date().getFullYear()} Ruabon Farm • Managed in Visitor Mode</span>
      </footer>

      {/* Scanner Modal */}
      {isScannerOpen && (
        <MarkingScanner
          horses={horses}
          onClose={() => setIsScannerOpen(false)}
          onSelectHorse={() => {}}
          isVisitor={true}
          visitorName={currentUser.name}
        />
      )}

      {/* Visitor Maintenance Logger Modal */}
      {isMaintenanceFormOpen && visitorPerm && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-250 shadow-2xl overflow-hidden max-w-md w-full p-6 space-y-6 text-left">
            <div className="flex items-center justify-between border-b border-stone-150 pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="text-pink-600" size={18} />
                <div>
                  <h3 className="text-xs font-black uppercase text-stone-900">
                    Field Maintenance Logger
                  </h3>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-0.5 block">
                    Submit secure task logs as a verified guest
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsMaintenanceFormOpen(false);
                  setLogError(null);
                  setLogSuccess(null);
                }}
                className="bg-white border border-stone-200 text-stone-450 hover:text-stone-850 hover:bg-stone-50 rounded-xl p-1.5 transition-all cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {logError && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-[11px] font-bold">
                ⚠️ {logError}
              </div>
            )}
            {logSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-850 rounded-xl text-[11px] font-bold">
                ✓ {logSuccess}
              </div>
            )}

            <form onSubmit={handleVisitorSubmitMaintenance} className="space-y-4">
              {/* Select Horse */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-450 uppercase tracking-widest block">
                  Select Permitted Horse
                </label>
                <select
                  required
                  value={logHorseId}
                  onChange={(e) => setLogHorseId(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-250 rounded-xl p-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden"
                >
                  <option value="">-- Choose Approved Horse --</option>
                  {visitorPerm.allowedHorseIds && visitorPerm.allowedHorseIds.map((hid: string) => {
                    const h = horses.find(item => item.id === hid);
                    return (
                      <option key={hid} value={hid}>
                        🐴 {h?.name || hid}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Maintenance Type */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-450 uppercase tracking-widest block">
                  Log Category
                </label>
                <select
                  value={logType}
                  onChange={(e) => setLogType(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-250 rounded-xl p-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden"
                >
                  <option value="shoeing">Shoeing & Farrier</option>
                  <option value="vet">Veterinary Work</option>
                  <option value="deworming">Deworming Treatment</option>
                  <option value="dental">Dental Operations</option>
                  <option value="medication">Medication Log</option>
                  <option value="grooming">Routine Grooming</option>
                  <option value="other">Other Operations</option>
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-450 uppercase tracking-widest block">
                  Detailed Field Work Notes
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the exact medical, horseshoeing, or pasture logs performed..."
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-250 rounded-xl p-2.5 text-xs font-semibold text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden"
                />
              </div>

              {/* Cost & PerformedBy */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-stone-450 uppercase tracking-widest block">
                    Cost Estimate (AUD)
                  </label>
                  <input
                    type="number"
                    value={logCost}
                    onChange={(e) => setLogCost(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-250 rounded-xl p-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-stone-450 uppercase tracking-widest block">
                    Performed By
                  </label>
                  <input
                    type="text"
                    required
                    value={logPerformedBy}
                    onChange={(e) => setLogPerformedBy(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-250 rounded-xl p-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsMaintenanceFormOpen(false)}
                  className="w-1/2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-black py-3 rounded-xl uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loggingProgress}
                  className="w-1/2 bg-pink-600 hover:bg-pink-700 text-white text-xs font-black py-3 rounded-xl uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                >
                  {loggingProgress ? "Submitting..." : <><Save size={13} /> Save Log</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rider Workouts/Ride Logger Modal */}
      {isRideFormOpen && visitorPerm && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-250 shadow-2xl overflow-hidden max-w-md w-full p-6 space-y-6 text-left">
            <div className="flex items-center justify-between border-b border-stone-150 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="text-emerald-600" size={18} />
                <div>
                  <h3 className="text-xs font-black uppercase text-stone-900">
                    Log Workout / Ride Activity
                  </h3>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-0.5 block">
                    Log training or pleasure rides for your mapped horses
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsRideFormOpen(false);
                  setRideError(null);
                  setRideSuccess(null);
                }}
                className="bg-white border border-stone-200 text-stone-450 hover:text-stone-850 hover:bg-stone-50 rounded-xl p-1.5 transition-all cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {rideError && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-[11px] font-bold">
                ⚠️ {rideError}
              </div>
            )}
            {rideSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-850 rounded-xl text-[11px] font-bold">
                ✓ {rideSuccess}
              </div>
            )}

            <form onSubmit={handleVisitorSubmitRideLog} className="space-y-4">
              {/* Select Horse */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-450 uppercase tracking-widest block">
                  Select Associated Horse
                </label>
                <select
                  required
                  value={rideHorseId}
                  onChange={(e) => setRideHorseId(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-250 rounded-xl p-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="">-- Choose Mapped Horse --</option>
                  {visitorPerm.allowedHorseIds && visitorPerm.allowedHorseIds.map((hid: string) => {
                    const h = horses?.find(item => item.id === hid);
                    return (
                      <option key={hid} value={hid}>
                        🐴 {h?.name || hid}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Workout Duration */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-450 uppercase tracking-widest block">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={480}
                  placeholder="E.G. 45"
                  value={rideDuration}
                  onChange={(e) => setRideDuration(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-250 rounded-xl p-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {/* Workout Intensity */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-450 uppercase tracking-widest block">
                  Workout Intensity
                </label>
                <select
                  value={rideIntensity}
                  onChange={(e) => setRideIntensity(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-250 rounded-xl p-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="light">Light (Walking, Grooming, Gentle Walk)</option>
                  <option value="medium">Medium (Trot, Canter drills, Active Work)</option>
                  <option value="hard">Hard (Jump Training, Speed/Intervals, Long Gallop)</option>
                </select>
              </div>

              {/* Workout Notes */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-450 uppercase tracking-widest block">
                  Ride Activity Notes
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the exercises, behavior, shoe response, or trails ridden..."
                  value={rideNotes}
                  onChange={(e) => setRideNotes(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-250 rounded-xl p-2.5 text-xs font-semibold text-stone-850 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsRideFormOpen(false)}
                  className="w-1/2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-black py-3 rounded-xl uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loggingRideProgress}
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-3 rounded-xl uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                >
                  {loggingRideProgress ? "Saving..." : <><Save size={13} /> Save Log</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Access Details Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-stone-900/95 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-stone-250 shadow-2xl overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 bg-stone-50 border-b border-stone-150 flex justify-between items-center text-left">
              <div>
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                  Access Record Terminal
                </h3>
                <span className="text-[9px] font-bold text-pink-750 uppercase tracking-widest block font-mono">
                  {selectedItem.horseName} Profile
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedItem(null);
                  setModalActiveTab("profile");
                }}
                className="p-1.5 hover:bg-stone-100 text-stone-400 hover:text-stone-700 rounded-full cursor-pointer"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-left">
              {!horses.some((h) => h.id === selectedItem.horseId) ? (
                <div className="p-6 rounded-2xl border border-rose-250 bg-rose-50 text-rose-900 flex flex-col items-center text-center gap-3">
                  <AlertCircle className="text-rose-600 shrink-0" size={32} />
                  <p className="text-xs font-black uppercase tracking-wider">Record Deleted</p>
                  <p className="text-xs font-semibold leading-relaxed">
                    Horse deleted by farm administration please contact admins for more information
                  </p>
                </div>
              ) : (
                <>
                  {/* Status Section */}
                  <div className="p-4 rounded-2xl border flex items-start gap-3 bg-stone-50 border-stone-200">
                    {selectedItem.status === "pending" && (
                      <>
                        <Lock className="text-amber-600 shrink-0 mt-0.5" size={18} />
                        <div className="space-y-1">
                          <p className="text-xs font-black text-amber-900 uppercase">Document Access Pending</p>
                          <p className="text-[11px] text-stone-600 leading-relaxed font-medium">
                            Your request to obtain official records for <strong className="text-stone-800">{selectedItem.horseName}</strong> is under review by Cooper and Claire. Access will update automatically.
                          </p>
                        </div>
                      </>
                    )}
                    {selectedItem.status === "granted" && (
                      <>
                        <Unlock className="text-emerald-600 shrink-0 mt-0.5" size={18} />
                        <div className="space-y-1">
                          <p className="text-xs font-black text-emerald-950 uppercase">Access Granted</p>
                          <p className="text-[11px] text-stone-655 leading-relaxed font-medium">
                            {visitorPerm?.isAgistorRider ? (
                              <span>You are authenticated as an <strong>Authorized Agistor / Rider</strong>. You can view full logs, save rides, or record veterinary treatments below.</span>
                            ) : (
                              <span>Ruabon Farm administration has approved your credentials. Official records are decrypted below.</span>
                            )}
                          </p>
                        </div>
                      </>
                    )}
                    {selectedItem.status === "denied" && (
                      <>
                        <XCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                        <div className="space-y-1">
                          <p className="text-xs font-black text-rose-950 uppercase">Access Denied</p>
                          <p className="text-[11px] text-stone-650 leading-relaxed font-medium">
                            The farm management declined record access for this profile.
                          </p>
                          {selectedItem.message && (
                            <p className="text-[11px] text-rose-700 font-bold bg-rose-50 border border-rose-100 p-2 rounded-lg mt-1 whitespace-pre-wrap font-mono">
                              Message: "{selectedItem.message}"
                            </p>
                          )}
                        </div>
                      </>
                    )}
                    {(!selectedItem.status || selectedItem.status === "scanned") && (
                      <>
                        <Info className="text-stone-600 shrink-0 mt-0.5" size={18} />
                        <div className="space-y-1">
                          <p className="text-xs font-black text-stone-900 uppercase">Scanned Record Only</p>
                          <p className="text-[11px] text-stone-500 leading-relaxed">
                            You have scanned this horse's public markings. You have not requested clinical or farrier record packs yet.
                          </p>
                          <button
                            onClick={() => {
                              setSelectedItem(null);
                              setRequestingItem(selectedItem);
                              setSelectedDocs(["Clinical & Health Records", "Farrier & Shoeing History"]);
                            }}
                            className="mt-2 bg-pink-600 hover:bg-pink-700 text-white font-extrabold text-[9px] px-3 py-1.5 rounded uppercase tracking-wider block"
                          >
                            Submit Document Request
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Tabs Selector for Agistors/Riders, or standard view for non-agistor */}
                  {selectedItem.status === "granted" && visitorPerm?.isAgistorRider && (
                    <div className="flex border-b border-stone-200 mb-4 bg-stone-50 rounded-lg p-1 gap-1">
                      <button
                        type="button"
                        onClick={() => setModalActiveTab("profile")}
                        className={`flex-1 py-2 text-center text-xs font-black uppercase tracking-wider rounded-md transition-all ${
                          modalActiveTab === "profile"
                            ? "bg-white text-emerald-800 shadow-3xs"
                            : "text-stone-500 hover:text-stone-700 hover:bg-stone-100/50"
                        }`}
                      >
                        Bio & Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalActiveTab("rides")}
                        className={`flex-1 py-2 text-center text-xs font-black uppercase tracking-wider rounded-md transition-all ${
                          modalActiveTab === "rides"
                            ? "bg-white text-emerald-800 shadow-3xs"
                            : "text-stone-500 hover:text-stone-700 hover:bg-stone-100/50"
                        }`}
                      >
                        Rides & Work
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalActiveTab("maintenance")}
                        className={`flex-1 py-2 text-center text-xs font-black uppercase tracking-wider rounded-md transition-all ${
                          modalActiveTab === "maintenance"
                            ? "bg-white text-emerald-800 shadow-3xs"
                            : "text-stone-500 hover:text-stone-700 hover:bg-stone-100/50"
                        }`}
                      >
                        Care & Logs
                      </button>
                    </div>
                  )}

                  {/* Public/Granted Data Fields */}
                  {selectedItem.status === "granted" ? (
                    /* DECRYPTION OF GRANTED RECORDS */
                    (() => {
                      const data = getHorseData(selectedItem.horseId);
                      if (!data) return <p className="text-xs text-stone-400">Loading full records from farm server...</p>;

                      return (
                        <div className="space-y-4 animate-fade-in text-left">
                          
                          {/* TAB 1: PROFILE DETAILS */}
                          {(modalActiveTab === "profile" || !visitorPerm?.isAgistorRider) && (
                            <div className="space-y-4">
                              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block border-b border-stone-100 pb-1.5">
                                Complete Decrypted Records
                              </span>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                  <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Breed</span>
                                  <span className="text-xs font-bold text-stone-800">{data.breed}</span>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                  <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Stable Assignment</span>
                                  <span className="text-xs font-bold text-stone-800">{data.stableNumber || "Not specified"}</span>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                  <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Height</span>
                                  <span className="text-xs font-bold text-stone-800">{data.heightHands ? `${data.heightHands} hands` : "Not specified"}</span>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                  <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Weight</span>
                                  <span className="text-xs font-bold text-stone-800">{data.weightLbs ? `${data.weightLbs} lbs` : "Not specified"}</span>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                  <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Age</span>
                                  <span className="text-xs font-bold text-stone-800">{data.age ? `${data.age} years` : "Not specified"}</span>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                  <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Gender</span>
                                  <span className="text-xs font-bold text-stone-800">{data.gender || "Not specified"}</span>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                  <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Color / Markings</span>
                                  <span className="text-xs font-bold text-stone-800">{data.color || "Not specified"}</span>
                                </div>
                                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                                  <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Use Classification</span>
                                  <span className="text-xs font-bold text-stone-800">{data.useClassification || "Not specified"}</span>
                                </div>
                              </div>

                              {/* Ownership and Race Details */}
                              {(data.ownerName || data.ownerPhone || data.raceName || data.lastDentalDate || (data.tags && data.tags.length > 0)) && (
                                <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl space-y-2 text-xs">
                                  <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Ownership &amp; Extras</span>
                                  {data.ownerName && (
                                    <div>
                                      <span className="text-stone-400 font-medium">Registered Owner:</span> <strong className="text-stone-800">{data.ownerName}</strong>{" "}
                                      {data.ownerPhone && <span className="text-[10px] text-stone-500">({data.ownerPhone})</span>}
                                    </div>
                                  )}
                                  {data.raceName && (
                                    <div>
                                      <span className="text-stone-400 font-medium">Race Name:</span> <strong className="text-stone-800">{data.raceName}</strong>
                                    </div>
                                  )}
                                  {data.lastDentalDate && (
                                    <div>
                                      <span className="text-stone-400 font-medium">Last Dental Visit:</span> <strong className="text-stone-800">{data.lastDentalDate}</strong>
                                    </div>
                                  )}
                                  {data.tags && data.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {data.tags.map((t: string) => (
                                        <span key={t} className="bg-stone-200 text-stone-750 font-bold text-[8.5px] uppercase tracking-wider px-2 py-0.5 rounded-md">
                                          🏷️ {t}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Brand Information */}
                              {(data.brandLeft || data.brandRight || data.brandingDescription || data.brandingLocation || data.brandingDate) && (
                                <div 
                                  onClick={() => {
                                    setBrandModalHorse(data);
                                    setIsBrandModalOpen(true);
                                  }}
                                  className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl space-y-2 text-xs cursor-pointer hover:bg-stone-100 transition-all group relative"
                                  title="Click to generate interactive 3D model of this brand"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Brands &amp; Markings Record</span>
                                    <span className="text-[8px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md uppercase tracking-wider group-hover:scale-105 transition-all flex items-center gap-1 border border-teal-100">
                                      <Sparkles size={9} className="text-teal-600 animate-pulse" /> 3D AI
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3 mt-1">
                                    {data.brandLeft && (
                                      <div>
                                        <span className="text-stone-400 block font-semibold text-[9px] uppercase tracking-wider">Left Brand</span>
                                        <strong className="text-stone-800 font-mono text-[11px]">{data.brandLeft}</strong>
                                      </div>
                                    )}
                                    {data.brandRight && (
                                      <div>
                                        <span className="text-stone-400 block font-semibold text-[9px] uppercase tracking-wider">Right Brand</span>
                                        <strong className="text-stone-800 font-mono text-[11px]">{data.brandRight}</strong>
                                      </div>
                                    )}
                                  </div>
                                  {data.brandingLocation && (
                                    <div>
                                      <span className="text-stone-400 font-medium">Branding Location:</span> <strong className="text-stone-800">{data.brandingLocation}</strong>
                                    </div>
                                  )}
                                  {data.brandingDate && (
                                    <div>
                                      <span className="text-stone-400 font-medium">Branding Date:</span> <strong className="text-stone-800">{data.brandingDate}</strong>
                                    </div>
                                  )}
                                  {data.brandingDescription && (
                                    <div className="p-2 bg-white border border-stone-150 rounded-lg text-stone-600 mt-1 italic leading-relaxed">
                                      &ldquo;{data.brandingDescription}&rdquo;
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl space-y-2">
                                <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Clinical &amp; Medical Log</span>
                                <div className="space-y-1.5 text-xs">
                                  <div>
                                    <span className="text-stone-400 font-medium">Last Vet Visit:</span> <strong className="text-stone-700">{data.lastVetDate || "Never"}</strong>
                                  </div>
                                  {data.lastVetNotes && (
                                    <div className="p-2 bg-white border border-stone-150 rounded-lg text-stone-600 mt-1 italic leading-relaxed">
                                      &ldquo;{data.lastVetNotes}&rdquo;
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-stone-400 font-medium">Active Medications:</span> <strong className="text-teal-700">{data.activeMedications || "None"}</strong>
                                  </div>
                                  <div>
                                    <span className="text-stone-400 font-medium">Deworming Date:</span> <span className="text-stone-700 font-bold">{data.lastDewormingDate || "Never"}</span>
                                  </div>
                                  <div>
                                    <span className="text-stone-400 font-medium">Microchip ID:</span> <span className="text-stone-700 font-bold font-mono text-[11px]">{data.microchipNumber || "Not microchipped"}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl space-y-2">
                                <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Farrier &amp; Shoeing Log</span>
                                <div className="space-y-1.5 text-xs">
                                  <div>
                                    <span className="text-stone-400 font-medium">Last Shoeing:</span> <strong className="text-stone-700">{data.lastShoeingDate || "Never"}</strong>
                                  </div>
                                  <div>
                                    <span className="text-stone-400 font-medium">Shoeing Interval:</span> <span className="text-stone-700 font-semibold">{data.shoeingIntervalWeeks || 6} Weeks</span>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl space-y-2">
                                <span className="text-[9px] text-stone-400 font-extrabold uppercase tracking-wider block">Diet &amp; Temperament Specs</span>
                                <div className="space-y-1 text-xs">
                                  <div>
                                    <span className="text-stone-400 font-medium">Feed Requirements:</span> <p className="text-stone-700 font-medium mt-0.5">{data.feedRequirements || "Standard Pasture"}</p>
                                  </div>
                                  <div className="pt-1.5">
                                    <span className="text-stone-400 font-medium">Temperament Profile:</span> <strong className="text-stone-800">{data.temperament || "Gentle / Safe"}</strong>
                                  </div>
                                </div>
                              </div>

                              {/* Log Daily Check Form */}
                              {visitorPerm?.canLogDailyChecks && (
                                <div className="bg-amber-50/40 border border-amber-200/80 p-4 rounded-xl mt-4 space-y-3">
                                  <div className="flex items-center gap-1.5 justify-start">
                                    <CheckCircle2 className="text-amber-800" size={15} />
                                    <span className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                                      Log Daily Health &amp; Water Check
                                    </span>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setDailyCheckStatus("OK")}
                                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer text-center ${
                                        dailyCheckStatus === "OK"
                                          ? "bg-emerald-600 border-emerald-600 text-white font-extrabold"
                                          : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                                      }`}
                                    >
                                      ✓ OK / Perfect
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDailyCheckStatus("Attention Needed")}
                                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer text-center ${
                                        dailyCheckStatus === "Attention Needed"
                                          ? "bg-amber-600 border-amber-600 text-white font-extrabold"
                                          : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                                      }`}
                                    >
                                      ⚠ Needs Attention
                                    </button>
                                  </div>

                                  <div className="space-y-1.5">
                                    <textarea
                                      rows={2}
                                      value={dailyCheckNotes}
                                      onChange={(e) => setDailyCheckNotes(e.target.value)}
                                      placeholder="Enter health, water level, or behavior notes (optional)..."
                                      className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs font-medium focus:ring-1 focus:ring-amber-500 text-stone-800 focus:outline-hidden"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    disabled={checkingProgress}
                                    onClick={() => handleLogDailyCheck(data.id, data.name)}
                                    className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-extrabold text-[10px] py-2.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-3xs"
                                  >
                                    {checkingProgress ? "Saving Check..." : "Submit Daily Check"}
                                  </button>

                                  {checkSuccess && (
                                    <p className="text-[9.5px] text-emerald-600 font-extrabold text-center mt-1 animate-fade-in">
                                      {checkSuccess}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* TAB 2: WORKOUT RIDES */}
                          {modalActiveTab === "rides" && visitorPerm?.isAgistorRider && (
                            <div className="space-y-4">
                              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block border-b border-stone-100 pb-1.5">
                                Workout Ride Logger
                              </span>

                              <form onSubmit={handleModalSubmitRide} className="bg-stone-50 border border-stone-200 p-4 rounded-xl space-y-3 text-left">
                                {modalRideSuccess && (
                                  <p className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xxs uppercase rounded-lg text-center animate-fade-in">
                                    ✓ {modalRideSuccess}
                                  </p>
                                )}
                                {modalRideError && (
                                  <p className="p-2 bg-rose-50 border border-rose-200 text-rose-800 font-bold text-xxs uppercase rounded-lg text-center animate-fade-in">
                                    ⚠️ {modalRideError}
                                  </p>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1.5">
                                    <label className="text-[8.5px] font-black text-stone-450 uppercase tracking-wider block">Duration (Minutes)</label>
                                    <input
                                      type="number"
                                      required
                                      min={1}
                                      max={240}
                                      value={modalRideDuration}
                                      onChange={(e) => setModalRideDuration(e.target.value)}
                                      className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs font-bold text-stone-800"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-[8.5px] font-black text-stone-450 uppercase tracking-wider block">Intensity</label>
                                    <select
                                      value={modalRideIntensity}
                                      onChange={(e) => setModalRideIntensity(e.target.value as any)}
                                      className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs font-bold text-stone-800"
                                    >
                                      <option value="light">Light Work</option>
                                      <option value="medium">Medium Work</option>
                                      <option value="hard">Hard Training</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <label className="text-[8.5px] font-black text-stone-450 uppercase tracking-wider block">Activity Notes</label>
                                  <textarea
                                    required
                                    rows={2}
                                    placeholder="Describe the workout, exercises performed, behavior..."
                                    value={modalRideNotes}
                                    onChange={(e) => setModalRideNotes(e.target.value)}
                                    className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs font-medium text-stone-850"
                                  />
                                </div>

                                <button
                                  type="submit"
                                  disabled={modalRideLoading}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-[9px] py-2.5 px-3 rounded-lg uppercase tracking-wider cursor-pointer shadow-xs"
                                >
                                  {modalRideLoading ? "Saving Log..." : "Save Workout Ride"}
                                </button>
                              </form>

                              <div className="space-y-3.5">
                                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block border-b border-stone-100 pb-1.5">
                                  Workout History ({selectedHorseRideHistory.length})
                                </span>
                                {selectedHorseRideHistory.length === 0 ? (
                                  <p className="text-[10px] font-bold text-stone-400 italic text-center py-4 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                                    No rides logged for this horse yet.
                                  </p>
                                ) : (
                                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {selectedHorseRideHistory.map((log) => (
                                      <div key={log.id} className="p-3 bg-stone-50 border border-stone-150 rounded-xl space-y-1 text-xs">
                                        <div className="flex justify-between items-center">
                                          <span className="font-bold text-stone-800">{log.riderName || "Rider"}</span>
                                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                            log.intensity === "hard" ? "bg-rose-100 text-rose-800" :
                                            log.intensity === "medium" ? "bg-amber-100 text-amber-800" :
                                            "bg-emerald-100 text-emerald-800"
                                          }`}>{log.intensity}</span>
                                        </div>
                                        {log.notes && <p className="text-stone-600 italic bg-white p-2 rounded border border-stone-100 mt-1">&ldquo;{log.notes}&rdquo;</p>}
                                        <div className="flex justify-between items-center text-[9px] text-stone-400 font-bold uppercase mt-1">
                                          <span>{log.durationMinutes} Mins</span>
                                          <span>{log.date || (log.createdAt && new Date(log.createdAt).toLocaleDateString()) || ""}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* TAB 3: CARE & MAINTENANCE */}
                          {modalActiveTab === "maintenance" && visitorPerm?.isAgistorRider && (
                            <div className="space-y-4">
                              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block border-b border-stone-100 pb-1.5">
                                Log Care &amp; Maintenance
                              </span>

                              {visitorPerm.canLogMaintenance ? (
                                <form onSubmit={handleModalSubmitMaintenance} className="bg-stone-50 border border-stone-200 p-4 rounded-xl space-y-3 text-left">
                                  {modalLogSuccess && (
                                    <p className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xxs uppercase rounded-lg text-center animate-fade-in">
                                      ✓ {modalLogSuccess}
                                    </p>
                                  )}
                                  {modalLogError && (
                                    <p className="p-2 bg-rose-50 border border-rose-200 text-rose-800 font-bold text-xxs uppercase rounded-lg text-center animate-fade-in">
                                      ⚠️ {modalLogError}
                                    </p>
                                  )}

                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                      <label className="text-[8.5px] font-black text-stone-450 uppercase tracking-wider block">Care Type</label>
                                      <select
                                        value={modalLogType}
                                        onChange={(e) => setModalLogType(e.target.value)}
                                        className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs font-bold text-stone-800"
                                      >
                                        <option value="shoeing">Shoeing</option>
                                        <option value="vet">Vet Treatment</option>
                                        <option value="deworming">Deworming</option>
                                        <option value="dental">Dental Check</option>
                                        <option value="vaccination">Vaccination</option>
                                        <option value="medication">Medication Log</option>
                                        <option value="grooming">Grooming</option>
                                        <option value="other">Other/Care Notes</option>
                                      </select>
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="text-[8.5px] font-black text-stone-450 uppercase tracking-wider block">Cost ($ AUD, Optional)</label>
                                      <input
                                        type="number"
                                        required
                                        min={0}
                                        value={modalLogCost}
                                        onChange={(e) => setModalLogCost(e.target.value)}
                                        className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs font-bold text-stone-800"
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-1.5">
                                    <label className="text-[8.5px] font-black text-stone-450 uppercase tracking-wider block">Performed By</label>
                                    <input
                                      type="text"
                                      required
                                      value={modalLogPerformedBy}
                                      onChange={(e) => setModalLogPerformedBy(e.target.value)}
                                      className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs font-bold text-stone-800"
                                    />
                                  </div>

                                  <div className="space-y-1.5">
                                    <label className="text-[8.5px] font-black text-stone-450 uppercase tracking-wider block">Treatment / Log Notes</label>
                                    <textarea
                                      required
                                      rows={2}
                                      placeholder="Describe the clinical visit, medication dosage, farrier work..."
                                      value={modalLogNotes}
                                      onChange={(e) => setModalLogNotes(e.target.value)}
                                      className="w-full bg-white border border-stone-200 rounded-lg p-2 text-xs font-medium text-stone-850"
                                    />
                                  </div>

                                  <button
                                    type="submit"
                                    disabled={modalLogLoading}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-[9px] py-2.5 px-3 rounded-lg uppercase tracking-wider cursor-pointer shadow-xs"
                                  >
                                    {modalLogLoading ? "Saving Log..." : "Save Care Treatment"}
                                  </button>
                                </form>
                              ) : (
                                <p className="text-[10px] font-bold text-stone-500 bg-stone-50 p-3 rounded-xl border text-center leading-relaxed">
                                  ⚠️ Read-Only Access: Your rider profile is not authorized to log maintenance or veterinary records directly. Please contact Claire or Cooper to grant your profile maintenance access.
                                </p>
                              )}

                              <div className="space-y-3.5">
                                <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block border-b border-stone-100 pb-1.5">
                                  Care &amp; Maintenance Logs ({horseMaintenanceLogs.length})
                                </span>
                                {horseMaintenanceLogs.length === 0 ? (
                                  <p className="text-[10px] font-bold text-stone-400 italic text-center py-4 bg-stone-50 rounded-xl border border-dashed border-stone-200">
                                    No clinical or care logs found for this horse yet.
                                  </p>
                                ) : (
                                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {horseMaintenanceLogs.map((log) => (
                                      <div key={log.id} className="p-3 bg-stone-50 border border-stone-150 rounded-xl space-y-1 text-xs text-left">
                                        <div className="flex justify-between items-center">
                                          <span className="font-extrabold text-stone-850 uppercase text-[10px] tracking-wider">{log.type}</span>
                                          {log.cost > 0 && <span className="text-emerald-700 font-extrabold text-[10.5px]">${log.cost}</span>}
                                        </div>
                                        {log.notes && <p className="text-stone-600 italic bg-white p-2 rounded border border-stone-100 mt-1">&ldquo;{log.notes}&rdquo;</p>}
                                        <div className="flex justify-between items-center text-[9px] text-stone-450 font-bold uppercase mt-1">
                                          <span>Done By: {log.performedBy || "Unknown"}</span>
                                          <span>{log.date || (log.createdAt && new Date(log.createdAt).toLocaleDateString()) || ""}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })()
                  ) : (
                    /* PUBLIC BIO ONLY */
                    <div className="space-y-3.5">
                      <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block border-b border-stone-100 pb-1.5">
                        Public Bio Card (No Records Cleared)
                      </span>
                      <div className="space-y-3 text-xs font-semibold leading-relaxed text-stone-600">
                        <p>In accordance with privacy guards, only basic non-sensitive credentials are visible for public-facing profiles:</p>
                        <ul className="list-disc list-inside space-y-1 text-stone-500 pl-1 font-bold">
                          <li>Official Registered Name</li>
                          <li>General Coated Coat Colour</li>
                          <li>Operational Age Estimate</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              )}

              <button
                onClick={() => setSelectedItem(null)}
                className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs py-3 rounded-xl transition-all uppercase tracking-wider font-mono mt-4"
              >
                Close Profile File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Request Forms Overlay */}
      {requestingItem && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-stone-250 shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between border-b border-stone-150 pb-3.5 mb-5 text-left">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-pink-50 text-pink-700 rounded-xl border border-pink-100 shadow-3xs">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wide">
                    Request Farm Records
                  </h3>
                  <p className="text-[9px] text-pink-700 font-black uppercase tracking-wider block mt-0.5">
                    Submit pack for {requestingItem.horseName}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmitRequest} className="space-y-5 text-left">
              <div className="space-y-2.5">
                <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest">
                  Select Document Packages
                </label>
                
                <div className="space-y-2">
                  {[
                    "Clinical & Health Records",
                    "Farrier & Shoeing History",
                    "Stable & Diet Specifications",
                    "Owner & Breed Certificates"
                  ].map((docType) => {
                    const isChecked = selectedDocs.includes(docType);
                    return (
                      <button
                        key={docType}
                        type="button"
                        onClick={() => handleDocToggle(docType)}
                        className={`w-full p-3 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                          isChecked
                            ? "bg-pink-50 border-pink-300 text-pink-900"
                            : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                        }`}
                      >
                        <span>{docType}</span>
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                          isChecked ? "bg-pink-600 border-pink-600 text-white" : "border-stone-300"
                        }`}>
                          {isChecked && <CheckCircle2 size={10} className="stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-stone-50 border border-stone-150 rounded-xl p-3 text-[10px] text-stone-500 font-medium leading-normal">
                This request will be submitted directly to Cooper and Claire for approval. Once reviewed, you will see their response instantly on your dashboard history.
              </div>

              <div className="grid grid-cols-2 gap-3.5 pt-1">
                <button
                  type="button"
                  onClick={() => setRequestingItem(null)}
                  className="border border-stone-200/80 text-stone-600 hover:text-stone-900 hover:bg-stone-50 font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest || selectedDocs.length === 0}
                  className="bg-pink-600 hover:bg-pink-700 text-white font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-40"
                >
                  {submittingRequest ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    "Submit Request"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Digital Security Badge Modal */}
      {showBadgeModal && visitorPerm && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto text-left">
          <div className="bg-stone-50 rounded-3xl border border-stone-200 shadow-2xl max-w-md w-full p-6 space-y-6 relative print:p-0 print:border-none print:shadow-none print:bg-white">
            <div className="flex justify-between items-center pb-4 border-b border-stone-200 print:hidden">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-pink-600" size={20} />
                <div>
                  <h3 className="text-sm font-black uppercase text-stone-900">
                    Your Digital Guest Badge
                  </h3>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-0.5 block">
                    Pre-authorized security pass credential
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBadgeModal(false)}
                className="bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-stone-900 rounded-xl p-2 cursor-pointer transition-all"
              >
                <X size={14} />
              </button>
            </div>

            {/* Print Card of Badge */}
            <div 
              className="flex flex-col sm:flex-row items-center gap-4 bg-white border border-stone-300 p-5 rounded-2xl shadow-xs relative overflow-hidden print:border print:border-stone-400 print:p-4 print:shadow-none text-left border-dashed border-pink-300"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/3 rounded-full blur-xl pointer-events-none" />
              
              {/* Scannable Code */}
              <div className="shrink-0 z-10">
                <BadgeQRCode name={visitorPerm.name} pin={visitorPerm.pin || "0000"} />
              </div>

              {/* Badge Details */}
              <div className="flex-1 text-center sm:text-left z-10 w-full relative">
                {/* Username & Password on TOP RIGHT */}
                <div className="absolute top-0 right-0 text-right">
                  <div className="bg-pink-900 text-white font-mono text-[8.5px] px-2 py-1 rounded-md tracking-wider leading-normal select-all shadow-3xs uppercase font-extrabold flex flex-col items-end">
                    <span>U: {visitorPerm.name.replace(/\s+/g, "").toLowerCase()}</span>
                    <span className="text-[7.5px] text-pink-300 mt-0.5 border-t border-pink-850 pt-0.5 w-full block">PIN: {visitorPerm.pin}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center sm:justify-start gap-1">
                  <span className="text-[8px] bg-pink-600 text-white font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                    FARM GUEST
                  </span>
                </div>

                <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight mt-6 sm:mt-5 font-sans">
                  {visitorPerm.name}
                </h3>
                <p className="text-[10px] font-bold text-pink-750 uppercase tracking-wider mt-0.5">
                  PRE-AUTHORIZED GUEST
                </p>
                
                <div className="mt-3 pt-2.5 border-t border-stone-150 text-[9px] font-bold text-stone-400 leading-normal uppercase tracking-wide">
                  ID: GUEST-{visitorPerm.pin}-{visitorPerm.name.slice(0, 3).toUpperCase()}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-stone-200 flex justify-end gap-2 flex-wrap print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-pink-650 hover:bg-pink-700 text-white font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
              >
                <Clock size={12} /> Print Pass Card
              </button>
              <button
                type="button"
                onClick={() => setShowBadgeModal(false)}
                className="bg-stone-900 hover:bg-stone-850 text-white font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider cursor-pointer"
              >
                Close Pass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit PIN Modal Overlay */}
      {showEditPinModal && visitorPerm && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-xl max-w-md w-full p-6 space-y-6 text-left my-auto">
            <div className="flex items-center justify-between border-b border-stone-150 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-pink-50 text-pink-700 rounded-xl border border-pink-100">
                  <Lock size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight">
                    Change Security PIN
                  </h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">
                    Update your gate decryption code
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditPinModal(false)}
                className="bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-stone-900 rounded-xl p-2 cursor-pointer transition-all"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Current PIN */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                  Verify Current PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={editPinCurrent}
                  onChange={(e) => {
                    setEditPinCurrent(e.target.value.replace(/\D/g, ""));
                    setEditPinError(null);
                    setEditPinSuccess(null);
                  }}
                  className="w-full bg-stone-50 border border-stone-250 rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden tracking-widest text-center"
                />
              </div>

              {/* New PIN */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                  Enter New 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={editPinNew}
                  onChange={(e) => {
                    setEditPinNew(e.target.value.replace(/\D/g, ""));
                    setEditPinError(null);
                    setEditPinSuccess(null);
                  }}
                  className="w-full bg-stone-50 border border-stone-250 rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden tracking-widest text-center"
                />
              </div>

              {/* Confirm New PIN */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                  Confirm New 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={editPinConfirm}
                  onChange={(e) => {
                    setEditPinConfirm(e.target.value.replace(/\D/g, ""));
                    setEditPinError(null);
                    setEditPinSuccess(null);
                  }}
                  className="w-full bg-stone-50 border border-stone-250 rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden tracking-widest text-center"
                />
              </div>

              {editPinError && (
                <div className="text-red-600 text-xxs font-bold uppercase tracking-wider bg-red-50 p-2.5 rounded-xl border border-red-150 text-center">
                  ⚠️ {editPinError}
                </div>
              )}

              {editPinSuccess && (
                <div className="text-emerald-600 text-xxs font-bold uppercase tracking-wider bg-emerald-50 p-2.5 rounded-xl border border-emerald-150 text-center">
                  ✅ {editPinSuccess}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-stone-150 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEditPinModal(false)}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-black text-xxs uppercase tracking-widest rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editPinCurrent.length !== 4 || editPinNew.length !== 4 || editPinConfirm.length !== 4 || editingPinProgress}
                onClick={async () => {
                  if (editPinCurrent !== visitorPerm.pin) {
                    setEditPinError("Current PIN is incorrect.");
                    return;
                  }
                  if (editPinNew !== editPinConfirm) {
                    setEditPinError("New PIN and Confirmation PIN do not match.");
                    return;
                  }
                  if (!/^\d{4}$/.test(editPinNew)) {
                    setEditPinError("PIN must be exactly 4 numeric digits.");
                    return;
                  }
                  if (editPinNew === editPinCurrent) {
                    setEditPinError("New PIN cannot be the same as your current PIN.");
                    return;
                  }

                  // Enforce weekly PIN rotation constraint
                  if (visitorPerm.passwordLastChanged) {
                    const lastChangedDate = new Date(visitorPerm.passwordLastChanged);
                    const now = new Date();
                    const diffDays = (now.getTime() - lastChangedDate.getTime()) / (1000 * 60 * 60 * 24);
                    if (diffDays < 7) {
                      setEditPinError(`PIN can only be changed once a week. Next eligible date: ${new Date(lastChangedDate.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()}.`);
                      return;
                    }
                  }

                  setEditingPinProgress(true);
                  setEditPinError(null);
                  try {
                    const { doc, updateDoc } = await import("firebase/firestore");
                    const docId = visitorPerm.name.toLowerCase().replace(/\s+/g, "_");
                    await updateDoc(doc(db, "visitor_permissions", docId), {
                      pin: editPinNew,
                      passwordLastChanged: new Date().toISOString()
                    });
                    setEditPinSuccess("PIN updated successfully!");
                    setEditPinCurrent("");
                    setEditPinNew("");
                    setEditPinConfirm("");
                  } catch (err) {
                    setEditPinError("Failed to update PIN in database. Try again.");
                  } finally {
                    setEditingPinProgress(false);
                  }
                }}
                className="px-5 py-2 bg-pink-600 hover:bg-pink-700 text-white font-black text-xxs uppercase tracking-widest rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:cursor-pointer shadow-sm"
              >
                {editingPinProgress ? "Updating..." : "Save New PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BIOMETRIC AUTHENTICATION (FACEID / TOUCHID) MODAL */}
      {showBiometricModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-250 shadow-2xl p-6 w-full max-w-md animate-scale-up text-left space-y-5">
            <div className="flex items-center justify-between border-b border-stone-150 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-teal-500/10 text-teal-600 rounded-xl border border-teal-500/20">
                  <Fingerprint size={20} />
                </div>
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wide">
                    Biometric Authentication
                  </h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">
                    FaceID &amp; TouchID PIN Fallback
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBiometricModal(false)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 rounded-xl p-2 cursor-pointer transition-all"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ScanFace size={18} className="text-teal-600" />
                    <span className="text-xs font-black text-stone-900 uppercase tracking-tight">
                      FaceID / TouchID Sign-In
                    </span>
                  </div>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                    biometricEnabled 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                      : "bg-stone-200 text-stone-600 border-stone-300"
                  }`}>
                    {biometricEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                
                <p className="text-[11px] text-stone-600 font-medium leading-relaxed">
                  Allow your device's biometric sensor (FaceID, Apple TouchID, Android Biometrics, or Windows Hello) to unlock your Guest &amp; Agistor portal without manually typing your 4-digit PIN every time.
                </p>

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (biometricEnabled) {
                        disableBiometrics(currentUser.name);
                        setBiometricEnabled(false);
                        setBiometricMsg({ type: "success", text: "Biometric authentication disabled for this account." });
                      } else {
                        setBiometricTesting(true);
                        const res = await enrollBiometrics(currentUser.name);
                        setBiometricTesting(false);
                        if (res.success) {
                          setBiometricEnabled(true);
                          setBiometricMsg({ type: "success", text: res.message });
                        } else {
                          setBiometricMsg({ type: "error", text: res.message });
                        }
                      }
                    }}
                    className={`w-full sm:w-auto flex-1 px-4 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs ${
                      biometricEnabled
                        ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                        : "bg-teal-600 hover:bg-teal-700 text-white"
                    }`}
                  >
                    {biometricTesting ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : biometricEnabled ? (
                      "Disable Biometric Access"
                    ) : (
                      <>
                        <Fingerprint size={14} />
                        <span>Enable FaceID / TouchID</span>
                      </>
                    )}
                  </button>

                  {biometricEnabled && (
                    <button
                      type="button"
                      disabled={biometricTesting}
                      onClick={async () => {
                        setBiometricTesting(true);
                        setBiometricMsg(null);
                        const test = await authenticateWithBiometrics(currentUser.name);
                        setBiometricTesting(false);
                        if (test.success) {
                          setBiometricMsg({ type: "success", text: "Verified! FaceID / TouchID biometric sensor is working properly." });
                        } else {
                          setBiometricMsg({ type: "error", text: test.error || "Biometric test failed." });
                        }
                      }}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-black text-[11px] uppercase tracking-wider transition-all cursor-pointer border border-stone-300 flex items-center justify-center gap-1.5"
                    >
                      <Check size={14} className="text-teal-600" />
                      <span>Test Sensor</span>
                    </button>
                  )}
                </div>
              </div>

              {biometricMsg && (
                <div className={`p-3 rounded-xl border text-xxs font-bold uppercase tracking-wider flex items-center gap-2 ${
                  biometricMsg.type === "success" 
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                    : "bg-rose-50 text-rose-800 border-rose-200"
                }`}>
                  {biometricMsg.type === "success" ? <CheckCircle2 size={14} className="shrink-0 text-emerald-600" /> : <AlertCircle size={14} className="shrink-0 text-rose-600" />}
                  <span>{biometricMsg.text}</span>
                </div>
              )}

              <div className="p-3 bg-teal-50/50 border border-teal-100 rounded-xl text-[10px] text-teal-900 leading-normal">
                <strong>🔒 Security Standard:</strong> Biometric keys remain encrypted within your local hardware enclave and provide an authorized fallback for guest and agistor PIN logins.
              </div>
            </div>

            <div className="pt-2 border-t border-stone-150 flex justify-end">
              <button
                type="button"
                onClick={() => setShowBiometricModal(false)}
                className="px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-black text-xxs uppercase tracking-widest rounded-xl transition-all cursor-pointer"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {brandModalHorse && isBrandModalOpen && (
        <div className="fixed inset-0 z-[100] bg-stone-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 text-stone-100 rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-scale-up text-left">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="text-teal-400 animate-pulse" size={16} />
                <h3 className="text-xs font-black uppercase tracking-wider">AI Generated 3D Brand Model</h3>
              </div>
              <button 
                onClick={() => {
                  setIsBrandModalOpen(false);
                  setBrandModalHorse(null);
                }}
                className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Rotating 3D Viewport container */}
              <div className="relative h-64 bg-stone-950 rounded-2xl border border-stone-800 flex flex-col items-center justify-center overflow-hidden group">
                <div className="absolute top-3 left-3 bg-teal-950/80 border border-teal-800/50 text-teal-300 font-mono text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
                  Real-time 3D Render
                </div>

                {/* Rotating 3D Object */}
                <div 
                  className="w-40 h-40 rounded-full bg-gradient-to-tr from-stone-800 via-stone-700 to-stone-800 border-2 border-stone-600 flex flex-col items-center justify-center shadow-2xl transition-all duration-700 hover:scale-105"
                  style={{
                    perspective: "1000px",
                    transformStyle: "preserve-3d",
                    animation: "spin-slow 15s linear infinite"
                  }}
                >
                  <style>{`
                    @keyframes spin-slow {
                      0% { transform: rotateY(0deg) rotateX(10deg); }
                      100% { transform: rotateY(360deg) rotateX(10deg); }
                    }
                  `}</style>
                  
                  {/* Brand Content */}
                  <div className="text-center space-y-2 select-none" style={{ transform: "translateZ(30px)" }}>
                    <div className="text-stone-400 font-mono text-[9px] uppercase tracking-wider">Left Brand</div>
                    <div className="text-3xl font-serif font-black text-amber-100 tracking-widest drop-shadow-md">
                      {brandModalHorse.brandLeft || "—"}
                    </div>
                    <div className="w-12 h-px bg-stone-600 mx-auto" />
                    <div className="text-3xl font-serif font-black text-teal-200 tracking-widest drop-shadow-md">
                      {brandModalHorse.brandRight || "—"}
                    </div>
                    <div className="text-stone-400 font-mono text-[9px] uppercase tracking-wider">Right Brand</div>
                  </div>
                </div>

                <div className="absolute bottom-3 text-stone-500 font-mono text-[9px] uppercase tracking-wider flex items-center gap-1">
                  <RotateCw size={10} className="animate-spin" style={{ animationDuration: "3s" }} />
                  Drag / Hover to inspect model perspective
                </div>
              </div>

              {/* Information */}
              <div className="grid grid-cols-2 gap-4 text-left font-mono">
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/50">
                  <span className="text-stone-500 text-[8px] uppercase tracking-widest block mb-1">Left Shoulder Brand</span>
                  <span className="text-xs text-amber-100 font-black">{brandModalHorse.brandLeft || "None Registered"}</span>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/50">
                  <span className="text-stone-500 text-[8px] uppercase tracking-widest block mb-1">Right Shoulder Brand</span>
                  <span className="text-xs text-teal-300 font-black">{brandModalHorse.brandRight || "None Registered"}</span>
                </div>
              </div>

              {brandModalHorse.brandingDescription && (
                <div className="bg-stone-950 p-4 rounded-xl border border-stone-800/50 text-left">
                  <span className="text-stone-500 text-[8px] uppercase tracking-widest font-mono block mb-1.5">Branding Description &amp; Distinguishing Marks</span>
                  <p className="text-xxs text-stone-300 font-medium leading-relaxed">{brandModalHorse.brandingDescription}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
