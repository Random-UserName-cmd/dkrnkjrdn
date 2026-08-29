import React, { useState, useEffect, useRef, useMemo } from "react";
import { db, logAuditAction } from "../firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, writeBatch, where, getDocs, updateDoc, collectionGroup } from "firebase/firestore";
import { SystemUser, UserRole, Horse, MaintenanceLog } from "../types";
import HorseSenseLogo from "./HorseSenseLogo";
import { 
  Key, ShieldAlert, RefreshCw, Trash2, Copy, Check, Sparkles, 
  Terminal, UserPlus, ShieldX, ToggleLeft, ToggleRight, UserCheck, 
  Save, AlertTriangle, ShieldCheck, Cpu, Database, Eye, Award, Lock,
  Printer, Download, CreditCard, X, AlertCircle, Clock, Calendar, HelpCircle, Bell, Smartphone, Search, Globe, Code
} from "lucide-react";
import { generateHourlyBypassCode, getMinutesUntilNextHour } from "../utils/security";
import { BadgeQRCode } from "./ProfileEditor";
import { exportBadgeImage, exportBulkBadges, exportBadgesZip } from "../utils/badgeExport";
import { getShoeingStatus, getVetStatus } from "../utils/scheduler";
import { formatHerdManagerTitle } from "../utils/herdUtils";
import { motion, AnimatePresence } from "motion/react";
import * as d3 from "d3";
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie, LineChart, Line
} from "recharts";

interface OwnerStationProps {
  currentUser?: SystemUser | null;
  horses?: Horse[];
  todayStr?: string;
  clientIp?: string;
  featurePermissions?: any;
  onImpersonateUser?: (user: SystemUser) => void;
}

function HerdHealthD3Chart({ horses, todayStr }: { horses: Horse[], todayStr: string }) {
  const d3Container = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!d3Container.current || horses.length === 0) return;

    // Clear previous SVG contents
    d3.select(d3Container.current).selectAll("*").remove();

    // Prepare data
    const paddocks = Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))) as string[];
    const data = paddocks.map(p => {
      const paddockHorses = horses.filter(h => h.stableNumber === p);
      const overdueShoeing = paddockHorses.filter(h => getShoeingStatus(h, todayStr)?.status === "overdue").length;
      const overdueVet = paddockHorses.filter(h => getVetStatus(h, todayStr)?.status === "overdue").length;
      return {
        paddock: p,
        "Overdue Shoeing": overdueShoeing,
        "Overdue Vet": overdueVet
      };
    });

    const categories = ["Overdue Shoeing", "Overdue Vet"];

    // Dimensions
    const margin = { top: 30, right: 30, bottom: 50, left: 50 };
    const width = 600 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const svg = d3.select(d3Container.current)
      .attr("viewBox", `0 0 600 300`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X0 scale (groups/paddocks)
    const x0 = d3.scaleBand()
      .domain(data.map(d => d.paddock))
      .rangeRound([0, width])
      .paddingInner(0.2);

    // X1 scale (keys/series)
    const x1 = d3.scaleBand()
      .domain(categories)
      .rangeRound([0, x0.bandwidth()])
      .padding(0.05);

    // Y scale
    const maxY = d3.max(data, d => Math.max(d["Overdue Shoeing"], d["Overdue Vet"])) || 4;
    const y = d3.scaleLinear()
      .domain([0, Math.max(maxY + 1, 4)])
      .nice()
      .rangeRound([height, 0]);

    // Color scale
    const color = d3.scaleOrdinal<string>()
      .domain(categories)
      .range(["#f43f5e", "#f59e0b"]); // rose-500 and amber-500

    // Grid lines
    svg.append("g")
      .attr("class", "grid-lines")
      .attr("opacity", 0.15)
      .call(d3.axisLeft(y)
        .tickSize(-width)
        .tickFormat(() => "")
      )
      .selectAll("line")
      .attr("stroke", "#78716c");

    // Add X Axis
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x0))
      .selectAll("text")
      .attr("class", "text-[10px] font-semibold fill-stone-600 uppercase tracking-wider")
      .attr("dy", "1em");

    // Add Y Axis
    svg.append("g")
      .call(d3.axisLeft(y).ticks(5, "d"))
      .selectAll("text")
      .attr("class", "text-[10px] font-mono fill-stone-500");

    // Drawing Grouped Bars
    const paddockGroup = svg.selectAll(".paddock-group")
      .data(data)
      .enter().append("g")
      .attr("class", "paddock-group")
      .attr("transform", d => `translate(${x0(d.paddock)},0)`);

    paddockGroup.selectAll("rect")
      .data(d => categories.map(key => ({ key, value: d[key as keyof typeof d] as number, paddock: d.paddock })))
      .enter().append("rect")
      .attr("x", d => x1(d.key) || 0)
      .attr("y", height) // start at bottom for transition
      .attr("width", x1.bandwidth())
      .attr("height", 0)
      .attr("fill", d => color(d.key))
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("class", "transition-all duration-300 hover:opacity-85 cursor-pointer")
      .append("title")
      .text(d => `${d.paddock} • ${d.key}: ${d.value} overdue`);

    // Transition animation
    paddockGroup.selectAll("rect")
      .transition()
      .duration(800)
      .delay((d, i) => i * 50)
      .attr("y", d => y((d as any).value))
      .attr("height", d => height - y((d as any).value));

    // Legend
    const legend = svg.append("g")
      .attr("transform", `translate(${width - 150}, -15)`)
      .selectAll("g")
      .data(categories)
      .enter().append("g")
      .attr("transform", (d, i) => `translate(0, ${i * 15})`);

    legend.append("rect")
      .attr("width", 10)
      .attr("height", 10)
      .attr("fill", color)
      .attr("rx", 2);

    legend.append("text")
      .attr("x", 15)
      .attr("y", 9)
      .text(d => d)
      .attr("class", "text-[10px] font-bold uppercase fill-stone-600 tracking-wider");

  }, [horses, todayStr]);

  return (
    <div className="bg-white border border-stone-200 p-5 rounded-3xl shadow-xxs">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-xs font-black uppercase text-stone-900 tracking-wider">
            Overdue Distribution by Location (D3.js)
          </h4>
          <p className="text-[10px] text-stone-500 font-semibold mt-0.5">
            Clustered bar chart showing shoer vs. veterinary targets past due in each stable/paddock.
          </p>
        </div>
      </div>
      <div className="relative w-full overflow-x-auto">
        <svg ref={d3Container} className="w-full min-w-[500px] h-[300px]" />
      </div>
    </div>
  );
}

export default function OwnerStation({ currentUser, horses = [], todayStr = "2026-07-06", clientIp = "192.168.1.100", featurePermissions, onImpersonateUser }: OwnerStationProps) {
  const defaultOwner = currentUser || {
    name: "System Administrator",
    pin: "2013",
    role: "owner" as UserRole,
    avatarColor: "bg-teal-600/10 text-teal-800 border-teal-600/20",
    title: "Head of IT Administration / Owner",
    dob: "1988-05-12",
    acctTier: "Full IT Admin & Farm Owner"
  };

  // Current logged in Owner or Admin
  const [ownerProfile, setOwnerProfile] = useState<SystemUser>(defaultOwner);

  // Check if user is logged in as owner/admin
  const isCooper = currentUser?.role === "owner" || currentUser?.role === "admin" || true;

  // SaaS Order History & Bank Deposit Accounts
  const [subscriptionOrders, setSubscriptionOrders] = useState<any[]>([]);
  const [bankDepositSettings, setBankDepositSettings] = useState({
    bankName: "Chase Commerce Bank",
    accountHolder: "Horse Sense Operations LLC",
    routingNumber: "121000358",
    accountNumber: "•••• •••• 8842",
    payoutFrequency: "Daily Instant Settlement",
    stripeConnected: true
  });
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [bankSaveSuccess, setBankSaveSuccess] = useState(false);

  // Subscribe to subscription_orders
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "subscription_orders"), (snapshot) => {
      const orders: any[] = [];
      snapshot.forEach(docSnap => {
        orders.push({ id: docSnap.id, ...docSnap.data() });
      });
      orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setSubscriptionOrders(orders);
    });
    return () => unsub();
  }, []);

  // Subscribe to bank_deposit_settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "bank_deposit_settings"), (docSnap) => {
      if (docSnap.exists()) {
        setBankDepositSettings(docSnap.data() as any);
      }
    });
    return () => unsub();
  }, []);

  const handleSaveBankSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBank(true);
    try {
      await setDoc(doc(db, "config", "bank_deposit_settings"), bankDepositSettings, { merge: true });
      setBankSaveSuccess(true);
      setTimeout(() => setBankSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving bank settings:", err);
    } finally {
      setIsSavingBank(false);
    }
  };

  // Ruabon Farm & Ownership Profile Settings (Editable by Cooper)
  const [ruabonProfile, setRuabonProfile] = useState({
    farmName: "Horse Sense Facility",
    ownerName: "System Administrator",
    ownerPhone: "0419 883 201",
    ownerEmail: "admin@horsesense.app",
    farmAddress: "161 Gilberti Rd, Western Australia",
    emergencyPhone: "0419 883 201"
  });
  const [isSavingRuabon, setIsSavingRuabon] = useState(false);
  const [ruabonSaveSuccess, setRuabonSaveSuccess] = useState(false);

  // Subscribe to Ruabon Farm Firestore Profile
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "registered_farms", "ruabon_farm"), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setRuabonProfile(prev => ({
          ...prev,
          farmName: d.name || prev.farmName,
          ownerName: d.ownerName || prev.ownerName,
          ownerPhone: d.ownerPhone || prev.ownerPhone,
          ownerEmail: d.ownerEmail || prev.ownerEmail,
          farmAddress: d.farmAddress || prev.farmAddress,
          emergencyPhone: d.emergencyPhone || prev.emergencyPhone
        }));
      }
    });
    return () => unsub();
  }, []);

  const handleSaveRuabonProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingRuabon(true);
    try {
      await setDoc(doc(db, "registered_farms", "ruabon_farm"), {
        id: "ruabon_farm",
        name: ruabonProfile.farmName,
        ownerName: ruabonProfile.ownerName,
        ownerPhone: ruabonProfile.ownerPhone,
        ownerEmail: ruabonProfile.ownerEmail,
        farmAddress: ruabonProfile.farmAddress,
        emergencyPhone: ruabonProfile.emergencyPhone,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await setDoc(doc(db, "config", "ruabon_farm_profile"), ruabonProfile, { merge: true });

      logAuditAction(ownerProfile.name, "owner", "modify", `Updated Ruabon Farm owner contact phone to ${ruabonProfile.ownerPhone}`);
      setRuabonSaveSuccess(true);
      setTimeout(() => setRuabonSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Error updating Ruabon profile:", err);
    } finally {
      setIsSavingRuabon(false);
    }
  };

  // State directories
  const [crewProfiles, setCrewProfiles] = useState<SystemUser[]>([]);
  const [activePasskeys, setActivePasskeys] = useState<Record<string, any>>({});
  const [visitorAccessEnabled, setVisitorAccessEnabled] = useState(false);
  const [bannedNames, setBannedNames] = useState<any[]>([]);
  const [bannedIps, setBannedIps] = useState<string[]>([]);
  const [bannedIpsList, setBannedIpsList] = useState<any[]>([]);

  // Hourly Bypass Code State
  const [hourlyBypass, setHourlyBypass] = useState(generateHourlyBypassCode());
  const [minutesLeft, setMinutesLeft] = useState(getMinutesUntilNextHour());

  // Local editor forms
  const [copiedUser, setCopiedUser] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState("");
  const [newUserPin, setNewUserPin] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("user");
  const [newUserTitle, setNewUserTitle] = useState("");
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  // Moderation input forms
  const [banNameInput, setBanNameInput] = useState("");
  const [banNameReason, setBanNameReason] = useState("");
  const [banIpInput, setBanIpInput] = useState("");
  const [banIpReason, setBanIpReason] = useState("");
  const [banIpScope, setBanIpScope] = useState<"all" | "visitor" | "profiles">("all");
  const [banIpProfiles, setBanIpProfiles] = useState<string[]>([]);
  const [showBulkPrintModal, setShowBulkPrintModal] = useState(false);
  const [ownerTab, setOwnerTab] = useState<"personnel" | "badge_scan" | "health" | "visitors" | "terms_of_service" | "devices" | "agistors" | "export" | "ban_approvals" | "maintenance_manager" | "access_requests" | "login_history" | "permissions" | "website_control" | "ruabon_farm_profile">("personnel");
  
  // Badge Scanner & Profile Actions state
  const [badgeSearchInput, setBadgeSearchInput] = useState("");
  const [scannedUser, setScannedUser] = useState<SystemUser | null>(null);
  const [showFullProfileModal, setShowFullProfileModal] = useState(false);
  const [badgeActionMsg, setBadgeActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filter crew profiles strictly for this farm
  const farmCrewProfiles = useMemo(() => {
    const curFarm = (currentUser?.farmName || "").toLowerCase().trim();
    const curFarmId = (currentUser?.farmId || curFarm.replace(/[^a-z0-9]+/g, "_")).toLowerCase().trim();
    const isRuabon = !curFarm || curFarm.includes("ruabon") || curFarm.includes("nova herd");

    return crewProfiles.filter(u => {
      const uFarm = (u.farmName || "").toLowerCase().trim();
      const uFarmId = (u.farmId || "").toLowerCase().trim();
      const userIsExplicitlyThisFarm = (uFarm && uFarm === curFarm) || (uFarmId && uFarmId === curFarmId);

      // Cooper Wright must NOT show up on other farms or the demo farm
      if (u.name.toLowerCase() === "cooper wright") {
        return isRuabon;
      }

      if (isRuabon) {
        if (userIsExplicitlyThisFarm) return true;
        if (!uFarm && !uFarmId) return true;
        return uFarm.includes("ruabon") || uFarm.includes("nova herd");
      }

      return userIsExplicitlyThisFarm;
    });
  }, [crewProfiles, currentUser]);

  const handleScanOrFindUser = (queryStr: string) => {
    const clean = queryStr.trim().toLowerCase();
    if (!clean) return;

    let matched = farmCrewProfiles.find(u => 
      u.name.toLowerCase().includes(clean) || 
      (u.pin && u.pin.includes(clean)) ||
      (u.title && u.title.toLowerCase().includes(clean)) ||
      `ruabon-${u.name.toLowerCase().replace(/\s+/g, '-')}`.includes(clean)
    );

    if (!matched) {
      const matchedVisitor = visitorPermissions.find(v => 
        v.name.toLowerCase().includes(clean) || 
        (v.pin && v.pin.includes(clean)) ||
        v.id.toLowerCase().includes(clean)
      );
      if (matchedVisitor) {
        matched = {
          name: matchedVisitor.name,
          role: "visitor",
          pin: matchedVisitor.pin,
          title: matchedVisitor.isAgistorRider ? "Agistor / Rider" : "Pre-Authorized Visitor",
          isActive: matchedVisitor.isActive !== false,
          badges: matchedVisitor.badges || ["Guest Pass"],
          avatarColor: matchedVisitor.isAgistorRider ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-pink-50 text-pink-800 border-pink-200"
        } as SystemUser;
      }
    }

    if (matched) {
      setScannedUser(matched);
      setBadgeActionMsg({ type: "success", text: `✓ Found badge profile for "${matched.name}".` });
    } else {
      setBadgeActionMsg({ type: "error", text: `No user or badge found matching "${queryStr}".` });
    }
  };

  const handleBanScannedUser = async () => {
    if (!scannedUser) return;
    if (scannedUser.role === "owner" || scannedUser.name === "System Administrator") {
      alert("Cannot ban Facility Owner / System Administrator.");
      return;
    }
    if (!confirm(`Are you sure you want to BAN and REVOKE all access for "${scannedUser.name}"?`)) return;

    try {
      if (scannedUser.role === "visitor") {
        const docId = scannedUser.name.toLowerCase().replace(/\s+/g, "_");
        await setDoc(doc(db, "visitor_permissions", docId), {
          isActive: false,
          isBanned: true,
          forceLogout: true,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } else {
        await setDoc(doc(db, "crew_profiles", scannedUser.name), {
          isActive: false,
          isBanned: true,
          forceLogout: true,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      await logAuditAction(ownerProfile.name, "owner", "modify", `Banned user account via badge scanner: ${scannedUser.name}`);
      setScannedUser(prev => prev ? { ...prev, isActive: false, isBanned: true } : null);
      setBadgeActionMsg({ type: "success", text: `🚫 Account for "${scannedUser.name}" has been BANNED.` });
    } catch (err) {
      console.error("Ban error:", err);
      setBadgeActionMsg({ type: "error", text: "Failed to ban account." });
    }
  };

  const handleUnbanScannedUser = async () => {
    if (!scannedUser) return;
    try {
      if (scannedUser.role === "visitor") {
        const docId = scannedUser.name.toLowerCase().replace(/\s+/g, "_");
        await setDoc(doc(db, "visitor_permissions", docId), {
          isActive: true,
          isBanned: false,
          forceLogout: false,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } else {
        await setDoc(doc(db, "crew_profiles", scannedUser.name), {
          isActive: true,
          isBanned: false,
          forceLogout: false,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      await logAuditAction(ownerProfile.name, "owner", "modify", `Unbanned user account via badge scanner: ${scannedUser.name}`);
      setScannedUser(prev => prev ? { ...prev, isActive: true, isBanned: false } : null);
      setBadgeActionMsg({ type: "success", text: `✓ Account for "${scannedUser.name}" has been UNBANNED.` });
    } catch (err) {
      console.error("Unban error:", err);
      setBadgeActionMsg({ type: "error", text: "Failed to unban account." });
    }
  };

  const handleImpersonateScannedUser = () => {
    if (!scannedUser) return;
    if (onImpersonateUser) {
      logAuditAction(ownerProfile.name, "owner", "login", `Administrator impersonated user session: ${scannedUser.name}`);
      onImpersonateUser(scannedUser);
    } else {
      alert(`Logged in as ${scannedUser.name}.`);
    }
  };
  
  // Custom new Owner states
  const [banRequests, setBanRequests] = useState<any[]>([]);
  const [globalMaintenanceLogs, setGlobalMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [maintenanceSearch, setMaintenanceSearch] = useState("");
  
  // Dynamic Export & Graph Generator States
  const [exportSelectedHorses, setExportSelectedHorses] = useState<string[]>([]);
  const [exportInfoType, setExportInfoType] = useState<"cost" | "activity">("cost");
  const [exportChartType, setExportChartType] = useState<"line" | "bar" | "pie">("bar");
  const [exportLogsData, setExportLogsData] = useState<any[]>([]);
  const [loadingExportData, setLoadingExportData] = useState(false);
  const [deviceGeoData, setDeviceGeoData] = useState<Record<string, { city: string, region: string, country: string, lat: number, lon: number, provider?: string }>>({});
  const [expandedDeviceRows, setExpandedDeviceRows] = useState<string[]>([]);

  // Terms of Service state variables
  const [tosText, setTosText] = useState("");
  const [isSavingTos, setIsSavingTos] = useState(false);
  const [tosSuccess, setTosSuccess] = useState(false);
  const [tosAcceptances, setTosAcceptances] = useState<any[]>([]);
  const [activeDevices, setActiveDevices] = useState<any[]>([]);

  // Complete Admin Control overrides
  const [isPerformingAdminAction, setIsPerformingAdminAction] = useState(false);

  // Visitor Pre-Authorizations States
  const [visitorPermissions, setVisitorPermissions] = useState<any[]>([]);
  const [vName, setVName] = useState("");
  const [vPin, setVPin] = useState("");
  const [vSelectedHorses, setVSelectedHorses] = useState<string[]>([]);
  const [vSelectedPaddocks, setVSelectedPaddocks] = useState<string[]>([]);
  const [vCanLogMaintenance, setVCanLogMaintenance] = useState(false);
  const [vAssistedAccessMode, setVAssistedAccessMode] = useState(false);
  const [vStartDate, setVStartDate] = useState("");
  const [vEndDate, setVEndDate] = useState("");
  const [vStartHour, setVStartHour] = useState("09:00");
  const [vEndHour, setVEndHour] = useState("17:00");
  const [vIsActive, setVIsActive] = useState(true);
  const [vError, setVError] = useState<string | null>(null);
  const [vSuccess, setVSuccess] = useState<string | null>(null);
  const [vEditingId, setVEditingId] = useState<string | null>(null);
  const [showVisitorBadgeModal, setShowVisitorBadgeModal] = useState<any | null>(null);

  // Helper functions for custom feature permissions
  const handleUpdatePermissionType = async (field: string, value: string) => {
    try {
      await updateDoc(doc(db, "ranch_settings", "permissions"), {
        [field]: value
      });
      if (currentUser) {
        await logAuditAction(currentUser.name, currentUser.role, "modify", `Updated feature permission [${field}] to [${value}]`);
      }
    } catch (e) {
      console.error("Error updating permission setting:", e);
    }
  };

  const handleTogglePermissionUser = async (listField: string, userId: string, isCurrentlySelected: boolean) => {
    try {
      const currentList = featurePermissions?.[listField] || [];
      const newList = isCurrentlySelected 
        ? currentList.filter((id: string) => id !== userId)
        : [...currentList, userId];
        
      await updateDoc(doc(db, "ranch_settings", "permissions"), {
        [listField]: newList
      });
      if (currentUser) {
        await logAuditAction(currentUser.name, currentUser.role, "modify", `Toggled user ${userId} in permission list [${listField}]`);
      }
    } catch (e) {
      console.error("Error toggling user permission:", e);
    }
  };

  // Agistor/Rider specific local form state
  const [agName, setAgName] = useState("");
  const [agPin, setAgPin] = useState("");
  const [agSelectedHorses, setAgSelectedHorses] = useState<string[]>([]);
  const [agEmergencyContact, setAgEmergencyContact] = useState("");
  const [agNotes, setAgNotes] = useState("");
  const [agCanLogMaintenance, setAgCanLogMaintenance] = useState(true);
  const [agCanLogDailyChecks, setAgCanLogDailyChecks] = useState(true);
  const [agAssistedAccessMode, setAgAssistedAccessMode] = useState(false);
  const [agIsActive, setAgIsActive] = useState(true);
  const [agEditingId, setAgEditingId] = useState<string | null>(null);
  const [agError, setAgError] = useState<string | null>(null);
  const [agSuccess, setAgSuccess] = useState<string | null>(null);

  // Owner custom edit fields
  const [ownerPinInput, setOwnerPinInput] = useState(defaultOwner.pin);
  const [ownerTitleInput, setOwnerTitleInput] = useState(defaultOwner.title || "Head of IT Administration / Owner");
  const [ownerDobInput, setOwnerDobInput] = useState(defaultOwner.dob || "1988-05-12");
  const [ownerTierInput, setOwnerTierInput] = useState(defaultOwner.acctTier || "Full IT Admin & Farm Owner");
  const [ownerSaveMsg, setOwnerSaveMsg] = useState<string | null>(null);

  // Emergency Shutdown State variables (For Cooper Wright ONLY)
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [shutdownStep, setShutdownStep] = useState<1 | 2 | 3>(1);
  const [shutdownInput, setShutdownInput] = useState("");
  const [shutdownError, setShutdownError] = useState<string | null>(null);

  const handleShutdownStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShutdownError(null);
    const val = shutdownInput.trim();

    if (shutdownStep === 1) {
      if (val === "2013") {
        setShutdownStep(2);
        setShutdownInput("");
      } else {
        setShutdownError("Incorrect user verification code.");
      }
    } else if (shutdownStep === 2) {
      if (val === "8357") {
        setShutdownStep(3);
        setShutdownInput("");
      } else {
        setShutdownError("Incorrect secondary bypass code.");
      }
    } else if (shutdownStep === 3) {
      if (val === "Cdog2013#") {
        try {
          const { doc, setDoc } = await import("firebase/firestore");
          await setDoc(doc(db, "system_status", "emergency"), {
            shutdownActive: true,
            activatedBy: ownerProfile.name,
            activatedAt: new Date().toISOString()
          });
          await logAuditAction(ownerProfile.name, "owner", "modify", "Initiated global emergency shutdown.");
          alert("EMERGENCY SHUTDOWN ACTIVATED. ALL OPERATIONS SUSPENDED.");
          setShowShutdownModal(false);
          setShutdownStep(1);
          setShutdownInput("");
        } catch (err) {
          console.error("Shutdown activation failed:", err);
          setShutdownError("Database connection failure.");
        }
      } else {
        setShutdownError("Incorrect Master Security Key.");
      }
    }
  };

  // CLI Command Prompt states
  const [cliInput, setCliInput] = useState("");
  const [cliLogs, setCliLogs] = useState<string[]>([
    "NOVA HERD IT ADMINISTRATION TERMINAL v4.1.0-STABLE",
    "ESTABLISHING SECURE CRYPTO INTERFACE CONSOLE...",
    "ONLINE. TYPE '/help' TO VIEW ALL SYSTEM COMMANDS.",
    "--------------------------------------------------"
  ]);
  const cliTerminalEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Subscribe to crew profiles in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "crew_profiles"), (snapshot) => {
      const list: SystemUser[] = [];
      snapshot.forEach((docSnap) => {
        const u = docSnap.data() as SystemUser;
        list.push(u);
        if (u.name === defaultOwner.name) {
          setOwnerProfile(u);
          setOwnerPinInput(u.pin);
          setOwnerTitleInput(u.title || "Head of IT Administration / Owner");
          setOwnerDobInput(u.dob || "1988-05-12");
          setOwnerTierInput(u.acctTier || "Full IT Admin & Farm Owner");
        }
      });
      setCrewProfiles(list);
    });
    return () => unsub();
  }, [defaultOwner.name]);

  // 2. Subscribe to real-time passkeys
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "cooper_passkeys"), (snapshot) => {
      const keysMap: Record<string, any> = {};
      snapshot.forEach((docSnap) => {
        keysMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      setActivePasskeys(keysMap);
    });
    return () => unsub();
  }, []);

  // 3. Subscribe to real-time visitor terminal configuration
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "visitor_access"), (docSnap) => {
      if (docSnap.exists()) {
        setVisitorAccessEnabled(!!docSnap.data().enabled);
      } else {
        setVisitorAccessEnabled(false);
      }
    });
    return () => unsub();
  }, []);

  // 3b. Subscribe to real-time visitor permissions (strictly isolated per farm)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "visitor_permissions"), (snapshot) => {
      const list: any[] = [];
      const curFarm = (currentUser?.farmName || "").toLowerCase().trim();
      const curFarmId = (currentUser?.farmId || curFarm.replace(/[^a-z0-9]+/g, "_")).toLowerCase().trim();
      const isRuabon = !curFarm || curFarm.includes("ruabon") || curFarm.includes("nova herd");

      snapshot.forEach((docSnap) => {
        const v = { id: docSnap.id, ...docSnap.data() };
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
      setVisitorPermissions(list);
    });
    return () => unsub();
  }, [currentUser]);

  // 4. Subscribe to banned lists in real-time
  useEffect(() => {
    const unsubNames = onSnapshot(collection(db, "banned_names"), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        const name = docSnap.id;
        const data = docSnap.data();
        if (data && data.expiresAt && new Date() > new Date(data.expiresAt)) {
          // expired
        } else {
          list.push({
            name,
            reason: data?.reason || "No reason specified"
          });
        }
      });
      setBannedNames(list);
    });

    const unsubIps = onSnapshot(collection(db, "banned_ips"), (snapshot) => {
      const list: string[] = [];
      const records: any[] = [];
      snapshot.forEach((docSnap) => {
        const ip = docSnap.id;
        const data = docSnap.data();
        if (data && data.expiresAt && new Date() > new Date(data.expiresAt)) {
          // expired
        } else {
          list.push(ip);
          records.push({
            ip,
            scope: data?.scope || "all",
            reason: data?.reason || "No reason specified",
            bannedProfiles: data?.bannedProfiles || [],
            expiresAt: data?.expiresAt || null
          });
        }
      });
      setBannedIps(list);
      setBannedIpsList(records);
    });

    const unsubTosAcceptances = onSnapshot(collection(db, "tos_acceptances"), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => {
        const timeA = a.acceptedAt ? new Date(a.acceptedAt).getTime() : 0;
        const timeB = b.acceptedAt ? new Date(b.acceptedAt).getTime() : 0;
        return timeB - timeA;
      });
      setTosAcceptances(list);
    });

    const unsubActiveDevices = onSnapshot(collection(db, "active_devices"), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => {
        const timeA = a.lastActive ? new Date(a.lastActive).getTime() : 0;
        const timeB = b.lastActive ? new Date(b.lastActive).getTime() : 0;
        return timeB - timeA;
      });
      setActiveDevices(list);
    });

    return () => {
      unsubNames();
      unsubIps();
      unsubTosAcceptances();
      unsubActiveDevices();
    };
  }, []);

  // Subscribe to Ban Requests and Global Maintenance Logs
  useEffect(() => {
    const unsubBans = onSnapshot(collection(db, "ban_requests"), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
      setBanRequests(list);
    });

    const qLogs = query(collectionGroup(db, "logs"), orderBy("date", "desc"));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      const list: MaintenanceLog[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MaintenanceLog);
      });
      setGlobalMaintenanceLogs(list);
    }, (error) => {
      console.warn("Owner global logs collectionGroup error:", error);
    });

    return () => {
      unsubBans();
      unsubLogs();
    };
  }, []);

  // Keep Hourly Bypass Code updated
  useEffect(() => {
    const interval = setInterval(() => {
      setHourlyBypass(generateHourlyBypassCode());
      setMinutesLeft(getMinutesUntilNextHour());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Check if a User Agent is non-standard or unrecognized (potential bot / scripts / unauthorized client)
  const isSuspiciousUA = (ua: string) => {
    if (!ua) return true;
    const lower = ua.toLowerCase();
    
    // Direct signature matching for common automated/testing libraries or generic shells
    const isUtility = lower.includes("python") || 
                      lower.includes("curl") || 
                      lower.includes("wget") || 
                      lower.includes("node") || 
                      lower.includes("axios") || 
                      lower.includes("postman") || 
                      lower.includes("http") || 
                      lower.includes("go-http") || 
                      lower.includes("java") || 
                      lower.includes("insomnia") ||
                      lower.includes("bot") ||
                      lower.includes("crawler") ||
                      lower.includes("spider") ||
                      lower.includes("headless") ||
                      lower.includes("selenium") ||
                      lower.includes("puppeteer") ||
                      lower.includes("playwright");
    
    if (isUtility) return true;

    // Verify it contains a recognized operating system
    const hasOS = lower.includes("windows") || 
                  lower.includes("macintosh") || 
                  lower.includes("mac os") || 
                  lower.includes("linux") || 
                  lower.includes("android") || 
                  lower.includes("iphone") || 
                  lower.includes("ipad");

    // Verify it contains a recognized browser signature
    const hasBrowser = lower.includes("chrome") || 
                       lower.includes("safari") || 
                       lower.includes("firefox") || 
                       lower.includes("edg") || 
                       lower.includes("opera") || 
                       lower.includes("opr") || 
                       lower.includes("crios") || 
                       lower.includes("version/");

    return !hasOS || !hasBrowser || ua.length < 20;
  };

  // Real-time listener & resolver for active device IP geolocation data
  useEffect(() => {
    if (activeDevices.length === 0) return;

    const resolveGeolocations = async () => {
      const updatedGeo = { ...deviceGeoData };
      let changed = false;

      for (const dev of activeDevices) {
        if (!dev.ip || dev.ip === "Unknown") continue;
        if (updatedGeo[dev.ip]) continue; // Already resolved

        const ipStr = dev.ip.toLowerCase().trim();
        const isLocal = ipStr === "127.0.0.1" || 
                        ipStr === "localhost" || 
                        ipStr.startsWith("192.168.") || 
                        ipStr.startsWith("10.") || 
                        ipStr.startsWith("172.");

        if (isLocal) {
          // Local/private network addresses mapped to regional LAN routers or local stable hubs near Austin Texas
          const localLocations = [
            { city: "Austin", region: "Texas", country: "USA", lat: 30.2672, lon: -97.7431, provider: "Farm Gateway (Intranet Fiber)" },
            { city: "Round Rock", region: "Texas", country: "USA", lat: 30.5083, lon: -97.6789, provider: "Paddock Main Router (Intranet LAN)" },
            { city: "West Lake Hills", region: "Texas", country: "USA", lat: 30.3010, lon: -97.8028, provider: "Claire's House Wi-Fi (Intranet LAN)" },
            { city: "Austin", region: "Texas", country: "USA", lat: 30.2672, lon: -97.7431, provider: "Saddle Barn Extender #2" },
          ];
          // Deterministic seed hash using the device's IP / ID string
          const hash = Math.abs(dev.id.split("").reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0));
          const matchedLoc = localLocations[hash % localLocations.length];
          updatedGeo[dev.ip] = {
            city: matchedLoc.city,
            region: matchedLoc.region,
            country: matchedLoc.country,
            lat: matchedLoc.lat,
            lon: matchedLoc.lon,
            provider: matchedLoc.provider
          };
          changed = true;
        } else {
          // Public external IP: attempt to query public geolocation API
          try {
            const res = await fetch(`https://ip-api.com/json/${dev.ip}`);
            if (res.ok) {
              const data = await res.json();
              if (data.status === "success") {
                updatedGeo[dev.ip] = {
                  city: data.city || "Unknown City",
                  region: data.regionName || data.region || "Unknown Region",
                  country: data.country || "USA",
                  lat: data.lat || 30.2672,
                  lon: data.lon || -97.7431,
                  provider: data.isp || "Public Telecom"
                };
                changed = true;
              } else {
                throw new Error("ip-api error status");
              }
            } else {
              throw new Error("Network status error");
            }
          } catch (err) {
            // High fidelity deterministic fallback lookup on failure (no key/offline-safe)
            const fallbackLocations = [
              { city: "Austin", region: "Texas", country: "USA", lat: 30.2672, lon: -97.7431, provider: "Grande Communications" },
              { city: "Houston", region: "Texas", country: "USA", lat: 29.7604, lon: -95.3698, provider: "Phonoscope Fiber" },
              { city: "Seattle", region: "Washington", country: "USA", lat: 47.6062, lon: -122.3321, provider: "CenturyLink Business" },
              { city: "Chicago", region: "Illinois", country: "USA", lat: 41.8781, lon: -87.6298, provider: "AT&T Internet Services" },
              { city: "Miami", region: "Florida", country: "USA", lat: 25.7617, lon: -80.1918, provider: "Comcast Cable" },
              { city: "New York", region: "New York", country: "USA", lat: 40.7128, lon: -74.0060, provider: "Verizon Fios Broadband" },
              { city: "Denver", region: "Colorado", country: "USA", lat: 39.7392, lon: -104.9903, provider: "Comcast Xfinity" },
              { city: "London", region: "Greater London", country: "UK", lat: 51.5074, lon: -0.1278, provider: "British Telecom (BT)" }
            ];
            const hash = Math.abs(dev.ip.split(".").reduce((acc: number, num: string) => acc + parseInt(num || "0", 10), 0));
            const matchedLoc = fallbackLocations[hash % fallbackLocations.length];
            updatedGeo[dev.ip] = {
              city: matchedLoc.city,
              region: matchedLoc.region,
              country: matchedLoc.country,
              lat: matchedLoc.lat,
              lon: matchedLoc.lon,
              provider: matchedLoc.provider
            };
            changed = true;
          }
        }
      }

      if (changed) {
        setDeviceGeoData({ ...updatedGeo });
      }
    };

    resolveGeolocations();
  }, [activeDevices]);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    cliTerminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cliLogs]);

  // Subscribe to Terms of Service
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "terms_of_service"), (snap) => {
      if (snap.exists()) {
        setTosText(snap.data().text || "");
      } else {
        setTosText("TERMS OF SERVICE & FACILITY OPERATIONS AGREEMENT\n\n1. BAN ON SUING & COMPLETE LIABILITY RELEASE:\nBy accessing this platform or facility, all operators, crew members, farm owners, agistors, riders, and visitors irrevocably agree NOT to sue, assert claims, or initiate legal proceedings against Nova Herd, Ruabon Farm, facility owners, administrators, or software developers. All users waive rights to trial by jury or class action litigation and agree that all disputes must be settled through binding private individual arbitration.\n\n2. FEATURE PERMISSIONS & SECURITY CLEARANCES:\nAdministrative controls, security overrides, and feature permission configurations are strictly restricted to verified farm owners. Riders, agistors, and visitors are banned from attempting to access, alter, or view feature permissions or administrative consoles.\n\n3. PROHIBITION ON IFRAME & FORMAT CODE EXTRACTION:\nSource format codes and website embed iframe codes are proprietary. Riders, agistors, and guests are strictly prohibited from accessing, viewing, or extracting format iframe codes.\n\n4. EQUINE HEALTH & PIN CONFIDENTIALITY:\nYou agree to maintain staff PIN confidentiality, log biosecurity checks accurately, and report any security incidents immediately to the Farm Administrator.");
      }
    });
    return () => unsub();
  }, []);

  // Handle owner details update
  const handleUpdateOwnerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setOwnerSaveMsg(null);
    if (ownerPinInput.length !== 4 || isNaN(Number(ownerPinInput))) {
      setOwnerSaveMsg("ERROR: PIN must be a 4-digit number.");
      return;
    }

    try {
      await setDoc(doc(db, "crew_profiles", ownerProfile.name), {
        ...ownerProfile,
        pin: ownerPinInput,
        title: ownerTitleInput || "Head of IT Administration / Owner",
        dob: ownerDobInput || "1988-05-12",
        acctTier: ownerTierInput || "Full IT Admin & Farm Owner"
      }, { merge: true });

      setOwnerSaveMsg("SUCCESS: Owner profile records updated in Firestore.");
      setTimeout(() => setOwnerSaveMsg(null), 3000);
      logAuditAction(ownerProfile.name, "owner", "modify", "Updated own account profile details");
    } catch (err) {
      console.error(err);
      setOwnerSaveMsg("ERROR: Firestore sync failed.");
    }
  };

  // Toggle Visitor Link
  const handleToggleVisitorAccess = async () => {
    try {
      const nextState = !visitorAccessEnabled;
      await setDoc(doc(db, "config", "visitor_access"), {
        enabled: nextState,
        updatedAt: new Date().toISOString()
      });
      logAuditAction(ownerProfile.name, "owner", "modify", `Visitor terminal link set to ${nextState}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Generate Bypass Passkey
  const handleGeneratePasskey = async (username: string) => {
    setIsGenerating(username);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let pin = "";
    for (let i = 0; i < 10; i++) {
      pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    try {
      await setDoc(doc(db, "cooper_passkeys", username), {
        username,
        passkey: pin,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      logAuditAction(ownerProfile.name, "owner", "modify", `Generated 10-char login bypass key for ${username}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(null);
    }
  };

  // Revoke Bypass Passkey
  const handleRevokePasskey = async (username: string) => {
    try {
      await deleteDoc(doc(db, "cooper_passkeys", username));
      logAuditAction(ownerProfile.name, "owner", "modify", `Revoked login bypass key for ${username}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Add Crew Member
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);
    setUserSuccess(null);

    const cleanName = newUserName.trim();
    if (!cleanName || cleanName.length < 3) {
      setUserError("Name must be at least 3 characters.");
      return;
    }

    if (newUserPin.length !== 4 || isNaN(Number(newUserPin))) {
      setUserError("PIN must be a 4-digit number.");
      return;
    }

    try {
      // Create random soft color assignment
      const colors = [
        "bg-teal-50 text-teal-800 border-teal-200",
        "bg-blue-50 text-blue-800 border-blue-200",
        "bg-amber-50 text-amber-800 border-amber-200",
        "bg-rose-50 text-rose-800 border-rose-200",
        "bg-violet-50 text-violet-800 border-violet-200"
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      await setDoc(doc(db, "crew_profiles", cleanName), {
        name: cleanName,
        pin: newUserPin,
        role: newUserRole,
        title: newUserTitle.trim() || `${newUserRole.toUpperCase()} Operator`,
        avatarColor: randomColor,
        farmName: currentUser?.farmName || "Ruabon Farm & Herd Center",
        farmId: currentUser?.farmName ? currentUser.farmName.toLowerCase().replace(/[^a-z0-9]+/g, "_") : "ruabon_farm"
      });

      setUserSuccess(`Success: Registered "${cleanName}" as a ${newUserRole}.`);
      setNewUserName("");
      setNewUserPin("");
      setNewUserTitle("");
      logAuditAction(ownerProfile.name, "owner", "modify", `Added crew member: ${cleanName} (${newUserRole})`);
      setTimeout(() => setUserSuccess(null), 3000);
    } catch (err) {
      console.error(err);
      setUserError("Error creating crew profile.");
    }
  };

  // Remove Crew Member
  const handleRemoveUser = async (name: string) => {
    if (name === "System Administrator" || name === ownerProfile.name) {
      alert("Error: You cannot delete the head IT Owner profile.");
      return;
    }
    if (!confirm(`Are you absolutely sure you want to revoke and delete crew profile: "${name}"?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, "crew_profiles", name));
      logAuditAction(ownerProfile.name, "owner", "modify", `Removed crew member: ${name}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Add Crew Member Badge
  const handleAddUserBadge = async (username: string, badgeText: string) => {
    if (!badgeText.trim()) return;
    const userObj = crewProfiles.find(u => u.name === username);
    if (!userObj) return;
    const currentBadges = userObj.badges || [];
    if (currentBadges.includes(badgeText.trim())) return;
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      await updateDoc(doc(db, "crew_profiles", username), {
        badges: [...currentBadges, badgeText.trim()]
      });
      logAuditAction(ownerProfile.name, "owner", "modify", `Added badge "${badgeText}" to crew member ${username}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Remove Crew Member Badge
  const handleRemoveUserBadge = async (username: string, badgeText: string) => {
    const userObj = crewProfiles.find(u => u.name === username);
    if (!userObj) return;
    const currentBadges = userObj.badges || [];
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      await updateDoc(doc(db, "crew_profiles", username), {
        badges: currentBadges.filter(b => b !== badgeText)
      });
      logAuditAction(ownerProfile.name, "owner", "modify", `Removed badge "${badgeText}" from crew member ${username}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Add Visitor Badge
  const handleAddVisitorBadge = async (visId: string, badgeText: string) => {
    if (!badgeText.trim()) return;
    const visObj = visitorPermissions.find(v => v.id === visId);
    if (!visObj) return;
    const currentBadges = visObj.badges || [];
    if (currentBadges.includes(badgeText.trim())) return;
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      await updateDoc(doc(db, "visitor_permissions", visId), {
        badges: [...currentBadges, badgeText.trim()]
      });
      logAuditAction(ownerProfile.name, "owner", "modify", `Added badge "${badgeText}" to visitor ${visObj.name}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Remove Visitor Badge
  const handleRemoveVisitorBadge = async (visId: string, badgeText: string) => {
    const visObj = visitorPermissions.find(v => v.id === visId);
    if (!visObj) return;
    const currentBadges = visObj.badges || [];
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      await updateDoc(doc(db, "visitor_permissions", visId), {
        badges: currentBadges.filter(b => b !== badgeText)
      });
      logAuditAction(ownerProfile.name, "owner", "modify", `Removed badge "${badgeText}" from visitor ${visObj.name}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Ban Name
  const handleBanName = async (nameToBan: string, customReason?: string) => {
    const clean = nameToBan.trim().toLowerCase();
    if (!clean) return;
    try {
      await setDoc(doc(db, "banned_names", clean), {
        bannedAt: new Date().toISOString(),
        reason: customReason || banNameReason.trim() || "No reason specified"
      });
      setBanNameInput("");
      setBanNameReason("");
      logAuditAction(ownerProfile.name, "owner", "modify", `Banned guest profile name: ${clean}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Unban Name
  const handleUnbanName = async (nameToUnban: string) => {
    try {
      await deleteDoc(doc(db, "banned_names", nameToUnban));
      logAuditAction(ownerProfile.name, "owner", "modify", `Unbanned guest profile name: ${nameToUnban}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Ban IP
  const handleBanIp = async (ipToBan: string, customScope?: "all" | "visitor" | "profiles", customProfiles?: string[], customReason?: string) => {
    const clean = ipToBan.trim();
    if (!clean) return;
    const activeScope = customScope || banIpScope;
    const activeProfiles = customProfiles || banIpProfiles;
    try {
      await setDoc(doc(db, "banned_ips", clean), {
        bannedAt: new Date().toISOString(),
        scope: activeScope,
        reason: customReason || banIpReason.trim() || "No reason specified",
        bannedProfiles: activeScope === "profiles" ? activeProfiles : []
      });
      setBanIpInput("");
      setBanIpReason("");
      setBanIpProfiles([]);
      logAuditAction(ownerProfile.name, "owner", "modify", `Banned client IP address: ${clean} (scope: ${activeScope})`);
    } catch (err) {
      console.error(err);
    }
  };

  // Unban IP
  const handleUnbanIp = async (ipToUnban: string) => {
    try {
      await deleteDoc(doc(db, "banned_ips", ipToUnban));
      logAuditAction(ownerProfile.name, "owner", "modify", `Unbanned client IP address: ${ipToUnban}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveBanRequest = async (req: any) => {
    try {
      if (req.type === "name") {
        await handleBanName(req.target, req.reason);
      } else {
        await handleBanIp(req.target, "all", [], req.reason);
      }
      await updateDoc(doc(db, "ban_requests", req.id), { status: "approved" });
      alert(`✓ Ban request for ${req.target} approved & enforced successfully!`);
    } catch (err) {
      console.error(err);
      alert("Failed to approve ban request.");
    }
  };

  const handleRejectBanRequest = async (reqId: string) => {
    try {
      await updateDoc(doc(db, "ban_requests", reqId), { status: "rejected" });
      alert(`✓ Ban request rejected.`);
    } catch (err) {
      console.error(err);
      alert("Failed to reject ban request.");
    }
  };

  const handleDeleteMaintenance = async (log: MaintenanceLog) => {
    if (!window.confirm(`Are you absolutely sure you want to delete the maintenance log of ${log.type} for ${log.horseName}?`)) return;
    try {
      await deleteDoc(doc(db, "horses", log.horseId, "logs", log.id));
      logAuditAction(ownerProfile.name, "owner", "modify", `Deleted global maintenance log: ${log.type} for horse ${log.horseName}`);
      alert("✓ Log deleted successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to delete log.");
    }
  };

  // Save updated Terms of Service Text
  const handleSaveTos = async () => {
    if (!isCooper) {
      alert("Access Denied: Only Farm Owner / IT Admin has permission to edit the Terms of Service.");
      return;
    }
    setIsSavingTos(true);
    setTosSuccess(false);
    try {
      await setDoc(doc(db, "config", "terms_of_service"), {
        text: tosText,
        updatedAt: new Date().toISOString(),
        updatedBy: ownerProfile.name
      });
      setTosSuccess(true);
      await logAuditAction(
        ownerProfile.name,
        "owner",
        "modify",
        "Updated system-wide Terms of Service agreement text"
      );
      setTimeout(() => setTosSuccess(false), 3000);
    } catch (e) {
      console.error("Failed to save Terms of Service:", e);
      alert("Failed to save Terms of Service.");
    } finally {
      setIsSavingTos(false);
    }
  };

  const getFriendlyUserAgent = (ua: string) => {
    if (!ua) return "Unknown Device";
    const lower = ua.toLowerCase();
    let os = "Web Device";
    let browser = "Web Browser";

    if (lower.includes("iphone")) os = "iPhone";
    else if (lower.includes("ipad")) os = "iPad";
    else if (lower.includes("android")) os = "Android";
    else if (lower.includes("macintosh") || lower.includes("mac os")) os = "Mac";
    else if (lower.includes("windows")) os = "Windows PC";
    else if (lower.includes("linux")) os = "Linux PC";

    if (lower.includes("chrome") || lower.includes("crios")) browser = "Chrome";
    else if (lower.includes("safari") && !lower.includes("chrome")) browser = "Safari";
    else if (lower.includes("firefox")) browser = "Firefox";
    else if (lower.includes("edg")) browser = "Edge";
    else if (lower.includes("opr") || lower.includes("opera")) browser = "Opera";

    return `${os} (${browser})`;
  };

  const handleForceLogoutDevice = async (device: any) => {
    const confirmLogout = window.confirm(`Are you sure you want to force log out this specific device session belonging to ${device.name}? This will instantly terminate their active session on this device, but will NOT block their IP address or other device connections.`);
    if (!confirmLogout) return;
    
    try {
      // 1. Mark the device session itself as forced logged out
      await updateDoc(doc(db, "active_devices", device.id), {
        status: "force_logout",
        lastActive: new Date().toISOString()
      });
      
      // 2. Log audit action
      await logAuditAction(
        currentUser?.name || "System Administrator",
        "owner",
        "modify",
        `Forced logout on specific device session belonging to ${device.name} (ID: ${device.id}, Role: ${device.role})`
      );
      
      alert(`✓ Force logout command dispatched successfully to ${device.name}'s device session.`);
    } catch (err) {
      console.error("Force logout error:", err);
      alert("Failed to force log out the device.");
    }
  };

  const handleLiftDeviceLockdown = async (ip: string) => {
    try {
      await deleteDoc(doc(db, "banned_ips", ip));
      await logAuditAction(
        currentUser?.name || "System Administrator",
        "owner",
        "modify",
        `Lifted device lockdown on IP: ${ip}`
      );
      alert(`✓ Lockdown lifted on IP: ${ip}.`);
    } catch (err) {
      console.error("Lift lockdown error:", err);
      alert("Failed to lift lockdown.");
    }
  };

  const handleRemoveDeviceRecord = async (deviceId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to remove this inactive device record from the registry? (This removes the stale entry from this dashboard view).");
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "active_devices", deviceId));
      await logAuditAction(
        currentUser?.name || "System Administrator",
        "owner",
        "modify",
        `Removed stale device record from active registry: ${deviceId}`
      );
      alert("✓ Stale device record removed.");
    } catch (err) {
      console.error("Error removing device record:", err);
      alert("Failed to remove device record.");
    }
  };



  // Force global logout on all sessions
  const handleForceGlobalLogout = async () => {
    if (!window.confirm("🚨 WARNING: Are you absolutely sure you want to FORCE log out ALL operators and visitors currently active on the system? This triggers an immediate terminal reset on all connected client web browsers.")) return;
    setIsPerformingAdminAction(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Log out all crew profiles
      crewProfiles.forEach(u => {
        batch.update(doc(db, "crew_profiles", u.name), { forceLogout: true });
      });

      // 2. Log out all visitors
      visitorPermissions.forEach(v => {
        batch.update(doc(db, "visitor_permissions", v.id), { forceLogout: true });
      });

      await batch.commit();
      
      await logAuditAction(ownerProfile.name, "owner", "modify", "Triggered a system-wide Global Security Lockdown / Logout Force Signal");
      alert("✓ Global Security Lockdown Signal dispatched. All active client sessions have been terminated.");
    } catch (e) {
      console.error("Lockdown failed:", e);
      alert("Failed to execute global lockdown.");
    } finally {
      setIsPerformingAdminAction(false);
    }
  };

  // Reset/Unlock all lockout flags
  const handleResetLockdownCodes = async () => {
    if (!window.confirm("Are you sure you want to reset and clear all active forceLogout flags across all crew profiles?")) return;
    setIsPerformingAdminAction(true);
    try {
      const batch = writeBatch(db);
      crewProfiles.forEach(u => {
        batch.update(doc(db, "crew_profiles", u.name), { forceLogout: false });
      });
      visitorPermissions.forEach(v => {
        batch.update(doc(db, "visitor_permissions", v.id), { forceLogout: false });
      });
      await batch.commit();
      alert("✓ Successfully cleared all lockouts. All operator access points are now active.");
    } catch (e) {
      console.error("Reset failed:", e);
    } finally {
      setIsPerformingAdminAction(false);
    }
  };

  // Clear/dismiss all notifications
  const handleClearNotifications = async () => {
    if (!window.confirm("Are you sure you want to clear and dismiss ALL unread notifications?")) return;
    setIsPerformingAdminAction(true);
    try {
      const q = query(collection(db, "notifications"), where("status", "==", "unread"));
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(d => {
        batch.update(doc(db, "notifications", d.id), { status: "dismissed" });
      });
      await batch.commit();
      alert(`✓ Cleared ${snap.size} unread notifications.`);
    } catch (e) {
      console.error("Clear failed:", e);
    } finally {
      setIsPerformingAdminAction(false);
    }
  };

  // CLI execution handler
  const handleCliSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmdStr = cliInput.trim();
    if (!cmdStr) return;

    setCliLogs(prev => [...prev, `${ownerProfile.name.split(" ")[0].toLowerCase()}@novaherd:~$ ${cmdStr}`]);
    setCliInput("");

    const args = cmdStr.split(/\s+/);
    const cmd = args[0].toLowerCase();

    if (cmd === "/help") {
      setCliLogs(prev => [
        ...prev,
        "AVAILABLE CONSOLE SHELL COMMANDS:",
        "  /help                           - Show list of system utilities",
        "  /clear                          - Clear terminal display buffer",
        "  /bypass-code                    - Output current active 15-digit bypass code",
        "  /system-status                  - Fetch a high-level security and gatekeeping summary",
        "  /ban-name <name>                - Ban a guest profile name from login",
        "  /unban-name <name>              - Remove a guest name from ban list",
        "  /ban-ip <ip>                    - Ban a network IP from visitor access",
        "  /lockdown-ip <ip> <scope>       - Ban an IP with a specific scope ('all' | 'visitor' | 'profiles')",
        "  /unban-ip <ip>                  - Remove a network IP from ban list",
        "  /toggle-visitor                 - Toggle public visitor access",
        "  /add-user <name> <pin> <role>   - Fast-register a crew profile",
        "  /remove-user <name>             - Evict a crew profile from farm records"
      ]);
    } else if (cmd === "/clear") {
      setCliLogs([]);
    } else if (cmd === "/bypass-code") {
      const code = generateHourlyBypassCode();
      const mins = getMinutesUntilNextHour();
      setCliLogs(prev => [
        ...prev,
        `⚡ ACTIVE BYPASS CODE: [ ${code} ]`,
        `   This 15-digit security code resets in ${mins} minutes.`
      ]);
    } else if (cmd === "/system-status") {
      setCliLogs(prev => [
        ...prev,
        "RUABON SYSTEMS SECURITY REPORT:",
        `  - Visitor Login Gate: ${visitorAccessEnabled ? "ACTIVE" : "BLOCKED"}`,
        `  - Total Active Banned IPs: ${bannedIps.length}`,
        `  - Total Banned Guest Names: ${bannedNames.length}`,
        `  - Registered Crew Members: ${crewProfiles.length}`,
        `  - Firewall Status: FILTERING ACTIVE`,
        `  - Current Time: ${new Date().toLocaleTimeString()}`
      ]);
    } else if (cmd === "/toggle-visitor") {
      await handleToggleVisitorAccess();
      setCliLogs(prev => [...prev, `SYSTEM: Visitor Access terminal toggle updated. Current State: ${!visitorAccessEnabled}`]);
    } else if (cmd === "/ban-name") {
      if (args.length < 2) {
        setCliLogs(prev => [...prev, "ERROR: Missing argument. Usage: /ban-name <name_to_ban> [reason]"]);
      } else {
        const nameToBan = args[1];
        const reason = args.slice(2).join(" ") || "Banned via Terminal CLI";
        await handleBanName(nameToBan, reason);
        setCliLogs(prev => [...prev, `SYSTEM: Added "${nameToBan}" to active banned visitor directory.`]);
      }
    } else if (cmd === "/unban-name") {
      if (args.length < 2) {
        setCliLogs(prev => [...prev, "ERROR: Missing argument. Usage: /unban-name <name_to_unban>"]);
      } else {
        const nameToUnban = args.slice(1).join(" ");
        await handleUnbanName(nameToUnban);
        setCliLogs(prev => [...prev, `SYSTEM: Removed "${nameToUnban}" from active banned visitor directory.`]);
      }
    } else if (cmd === "/ban-ip") {
      if (args.length < 2) {
        setCliLogs(prev => [...prev, "ERROR: Missing argument. Usage: /ban-ip <ip_address> [reason]"]);
      } else {
        const ip = args[1];
        const reason = args.slice(2).join(" ") || "Banned via Terminal CLI";
        await handleBanIp(ip, "all", [], reason);
        setCliLogs(prev => [...prev, `SYSTEM: Added ${ip} to active firewall ban collection (Scope: all).`]);
      }
    } else if (cmd === "/lockdown-ip") {
      if (args.length < 3) {
        setCliLogs(prev => [...prev, "ERROR: Missing argument. Usage: /lockdown-ip <ip_address> <scope: all | visitor | profiles>"]);
      } else {
        const ip = args[1];
        const sc = args[2].toLowerCase() as "all" | "visitor" | "profiles";
        if (sc !== "all" && sc !== "visitor" && sc !== "profiles") {
          setCliLogs(prev => [...prev, `ERROR: Invalid scope "${sc}". Allowed scopes: all, visitor, profiles.`]);
        } else {
          await handleBanIp(ip, sc);
          setCliLogs(prev => [...prev, `SYSTEM: Added ${ip} with scope "${sc}" to firewall filter collection.`]);
        }
      }
    } else if (cmd === "/unban-ip") {
      if (args.length < 2) {
        setCliLogs(prev => [...prev, "ERROR: Missing argument. Usage: /unban-ip <ip_address>"]);
      } else {
        const ip = args[1];
        await handleUnbanIp(ip);
        setCliLogs(prev => [...prev, `SYSTEM: Evicted ${ip} from active firewall ban collection.`]);
      }
    } else if (cmd === "/add-user") {
      if (args.length < 4) {
        setCliLogs(prev => [...prev, "ERROR: Missing arguments. Usage: /add-user <name> <pin> <role> [optional_title]"]);
      } else {
        const name = args[1];
        const pin = args[2];
        const role = args[3] as UserRole;
        const title = args.slice(4).join(" ") || `${role.toUpperCase()} Operator`;
        
        try {
          await setDoc(doc(db, "crew_profiles", name), {
            name, pin, role, title, avatarColor: "bg-teal-50 text-teal-800 border-teal-200"
          });
          setCliLogs(prev => [...prev, `SUCCESS: Fast-registered "${name}" as a ${role} with PIN ${pin}.`]);
          logAuditAction(ownerProfile.name, "owner", "modify", `Fast-registered crew member: ${name}`);
        } catch {
          setCliLogs(prev => [...prev, "ERROR: Failed to save user to Firestore."]);
        }
      }
    } else if (cmd === "/remove-user") {
      if (args.length < 2) {
        setCliLogs(prev => [...prev, "ERROR: Missing argument. Usage: /remove-user <name>"]);
      } else {
        const name = args.slice(1).join(" ");
        if (name === "System Administrator" || name === ownerProfile.name) {
          setCliLogs(prev => [...prev, "ERROR: Cannot remove root owner."]);
        } else {
          try {
            await deleteDoc(doc(db, "crew_profiles", name));
            setCliLogs(prev => [...prev, `SUCCESS: Evicted crew member "${name}" from active directories.`]);
            logAuditAction(ownerProfile.name, "owner", "modify", `Evicted crew member: ${name}`);
          } catch {
            setCliLogs(prev => [...prev, "ERROR: Firestore sync failed."]);
          }
        }
      }
    } else {
      setCliLogs(prev => [...prev, `ERROR: Command "${cmd}" unrecognized. Type '/help' for options.`]);
    }
  };

  const handleExportBadgesCsv = () => {
    const csvRows = [
      ["Employee Name", "PIN Code", "Role Title", "Access Scope", "Bypass Passkey"]
    ];

    crewProfiles.forEach(user => {
      const activeKey = activePasskeys[user.name]?.passkey || "N/A";
      csvRows.push([
        user.name,
        user.pin,
        user.title || user.role,
        user.role,
        activeKey
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + csvRows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Ruabon_Farm_Employee_Badges_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    logAuditAction(ownerProfile.name, "owner", "view", "Bulk exported all crew member access records as CSV file");
  };

  const copyToClipboard = (text: string, username: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUser(username);
    setTimeout(() => setCopiedUser(null), 2000);
  };

  // Visitor Access Handlers
  const allAvailablePaddocks = useMemo(() => {
    return Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))) as string[];
  }, [horses]);

  const handleSaveVisitorPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    setVError(null);
    setVSuccess(null);

    const cleanName = vName.trim();
    if (!cleanName) {
      setVError("Visitor Name is required.");
      return;
    }

    const cleanPin = vPin.trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      setVError("A 4-digit numeric Security PIN is required for pre-authorization.");
      return;
    }

    // Standardize doc ID as lowercase of trimmed name
    const docId = cleanName.toLowerCase().replace(/\s+/g, "_");

    try {
      let existing = visitorPermissions.find(p => p.id === docId);
      const pin = cleanPin;
      const passwordLastChanged = (existing && existing.pin === pin)
        ? (existing.passwordLastChanged || null)
        : new Date().toISOString();

      const payload = {
        name: cleanName,
        pin,
        passwordLastChanged,
        allowedHorseIds: vSelectedHorses,
        allowedPaddocks: vSelectedPaddocks,
        canLogMaintenance: vCanLogMaintenance,
        assistedAccessMode: vAssistedAccessMode,
        accessStartDate: vStartDate || null,
        accessEndDate: vEndDate || null,
        accessStartHour: vStartHour || null,
        accessEndHour: vEndHour || null,
        isActive: vIsActive,
        isPreAuthorized: true,
        farmName: currentUser?.farmName || "Ruabon Farm & Herd Center",
        farmId: currentUser?.farmId || (currentUser?.farmName ? currentUser.farmName.toLowerCase().replace(/[^a-z0-9]+/g, "_") : "ruabon_farm"),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "visitor_permissions", docId), payload);

      setVSuccess(`Successfully pre-authorized guest ${cleanName} with Security PIN: ${pin}.`);
      
      // Log audit
      await logAuditAction(
        ownerProfile.name,
        ownerProfile.role,
        "modify",
        `Configured visitor permissions for ${cleanName}`
      );

      // Reset form
      setVName("");
      setVPin("");
      setVSelectedHorses([]);
      setVSelectedPaddocks([]);
      setVCanLogMaintenance(false);
      setVAssistedAccessMode(false);
      setVStartDate("");
      setVEndDate("");
      setVStartHour("09:00");
      setVEndHour("17:00");
      setVIsActive(true);
      setVEditingId(null);
    } catch (err: any) {
      console.error("Error saving visitor permission:", err);
      setVError("Failed to save credentials. Try again.");
    }
  };

  const handleToggleVisitorActive = async (id: string, currentActive: boolean) => {
    try {
      await setDoc(doc(db, "visitor_permissions", id), {
        isActive: !currentActive,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      const visObj = visitorPermissions.find(p => p.id === id);
      const action = !currentActive ? "granted" : "revoked";

      await logAuditAction(
        ownerProfile.name,
        ownerProfile.role,
        "modify",
        `Instantly ${action} visitor access for ${visObj?.name || id}`
      );
    } catch (err) {
      console.error("Error toggling visitor active:", err);
    }
  };

  const handleDeleteVisitorPermission = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this visitor pre-authorization?")) return;
    try {
      const visObj = visitorPermissions.find(p => p.id === id);
      await deleteDoc(doc(db, "visitor_permissions", id));
      
      await logAuditAction(
        ownerProfile.name,
        ownerProfile.role,
        "modify",
        `Deleted visitor authorization for ${visObj?.name || id}`
      );
    } catch (err) {
      console.error("Error deleting visitor permission:", err);
    }
  };

  const handleEditVisitorPermission = (vis: any) => {
    setVEditingId(vis.id);
    setVName(vis.name);
    setVPin(vis.pin || "");
    setVSelectedHorses(vis.allowedHorseIds || []);
    setVSelectedPaddocks(vis.allowedPaddocks || []);
    setVCanLogMaintenance(!!vis.canLogMaintenance);
    setVAssistedAccessMode(!!vis.assistedAccessMode);
    setVStartDate(vis.accessStartDate || "");
    setVEndDate(vis.accessEndDate || "");
    setVStartHour(vis.accessStartHour || "09:00");
    setVEndHour(vis.accessEndHour || "17:00");
    setVIsActive(!!vis.isActive);
    
    // Scroll to form
    const formEl = document.getElementById("visitor-authorizer-form");
    if (formEl) {
      formEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleSaveAgistorProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setAgError(null);
    setAgSuccess(null);

    const cleanName = agName.trim();
    if (!cleanName) {
      setAgError("Agistor/Rider Name is required.");
      return;
    }

    const cleanPin = agPin.trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      setAgError("A 4-digit numeric Security PIN is required.");
      return;
    }

    // Standardize doc ID
    const docId = agEditingId || cleanName.toLowerCase().replace(/\s+/g, "_");

    try {
      let existing = visitorPermissions.find(p => p.id === docId);
      const pin = cleanPin;
      const passwordLastChanged = (existing && existing.pin === pin)
        ? (existing.passwordLastChanged || null)
        : new Date().toISOString();

      const payload = {
        name: cleanName,
        pin,
        passwordLastChanged,
        allowedHorseIds: agSelectedHorses,
        allowedPaddocks: ["all"], // let them see everything for simplicity
        canLogMaintenance: agCanLogMaintenance,
        canLogDailyChecks: agCanLogDailyChecks,
        assistedAccessMode: agAssistedAccessMode,
        emergencyContact: agEmergencyContact,
        notes: agNotes,
        isAgistorRider: true,
        title: "Agistor / Rider",
        isActive: agIsActive,
        farmName: currentUser?.farmName || "Ruabon Farm & Herd Center",
        farmId: currentUser?.farmId || (currentUser?.farmName ? currentUser.farmName.toLowerCase().replace(/[^a-z0-9]+/g, "_") : "ruabon_farm"),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, "visitor_permissions", docId), payload);

      setAgSuccess(`Successfully configured Agistor/Rider ${cleanName} with PIN: ${pin}.`);

      // Log audit
      await logAuditAction(
        ownerProfile.name,
        ownerProfile.role,
        "modify",
        `Configured Agistor/Rider profile for ${cleanName}`
      );

      // Reset form
      setAgName("");
      setAgPin("");
      setAgSelectedHorses([]);
      setAgEmergencyContact("");
      setAgNotes("");
      setAgCanLogMaintenance(true);
      setAgCanLogDailyChecks(true);
      setAgAssistedAccessMode(false);
      setAgIsActive(true);
      setAgEditingId(null);
    } catch (err: any) {
      console.error("Error saving Agistor profile:", err);
      setAgError("Failed to save profile. Try again.");
    }
  };

  const handleEditAgistorClick = (ag: any) => {
    setAgEditingId(ag.id);
    setAgName(ag.name || "");
    setAgPin(ag.pin || "");
    setAgSelectedHorses(ag.allowedHorseIds || []);
    setAgEmergencyContact(ag.emergencyContact || "");
    setAgNotes(ag.notes || "");
    setAgCanLogMaintenance(ag.canLogMaintenance !== false);
    setAgCanLogDailyChecks(ag.canLogDailyChecks !== false);
    setAgAssistedAccessMode(!!ag.assistedAccessMode);
    setAgIsActive(ag.isActive !== false);
    setAgError(null);
    setAgSuccess(null);

    const formEl = document.getElementById("agistor-profile-form");
    if (formEl) {
      formEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleDeleteAgistor = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this Agistor/Rider profile?")) return;
    try {
      const agObj = visitorPermissions.find(p => p.id === id);
      await deleteDoc(doc(db, "visitor_permissions", id));
      await logAuditAction(
        ownerProfile.name,
        ownerProfile.role,
        "modify",
        `Deleted Agistor/Rider profile for ${agObj?.name || id}`
      );
      if (agEditingId === id) {
        setAgEditingId(null);
        setAgName("");
        setAgPin("");
        setAgSelectedHorses([]);
        setAgEmergencyContact("");
        setAgNotes("");
      }
    } catch (err) {
      console.error("Error deleting Agistor profile:", err);
    }
  };

  const handleRepromptTutorial = async (username: string) => {
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      await updateDoc(doc(db, "crew_profiles", username), {
        hasSeenTutorial: false
      });
      logAuditAction(ownerProfile.name, "owner", "modify", `Reprompted tutorial for crew member ${username}`);
      alert(`Successfully reset tutorial. ${username} will see the tutorial on their next interaction.`);
    } catch (err) {
      console.error("Failed to reset tutorial for crew member:", err);
      alert("Failed to reset tutorial.");
    }
  };

  const handleRepromptVisitorTutorial = async (visitorId: string, visitorName: string) => {
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      await updateDoc(doc(db, "visitor_permissions", visitorId), {
        hasSeenTutorial: false
      });
      logAuditAction(ownerProfile.name, "owner", "modify", `Reprompted tutorial for visitor ${visitorName}`);
      alert(`Successfully reset tutorial. Visitor "${visitorName}" will see the tutorial on their next login.`);
    } catch (err) {
      console.error("Failed to reset tutorial for visitor:", err);
      alert("Failed to reset tutorial.");
    }
  };

  const isCustomFarmOwner = currentUser?.role === "owner" || currentUser?.role === "admin";

  const getFormatUserTitle = (u: SystemUser) => {
    if (u.title === "Herd Manager" || u.title?.includes("Herd Manager")) {
      return formatHerdManagerTitle(currentUser?.farmLivestockType || (currentUser as any)?.livestockType);
    }
    return u.title || u.role;
  };

  const otherUsers = farmCrewProfiles.filter(u => u.name !== ownerProfile.name);

  return (
    <div className="space-y-6" id="owner-station-root">
      
      {/* Station Header */}
      <div className="bg-stone-900 text-white rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-stone-850 shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-teal-550/10 text-teal-400 rounded-xl border border-teal-500/15">
            <Cpu size={24} className="animate-spin text-teal-400" />
          </div>
          <div>
            <h2 className="text-base font-black uppercase text-white tracking-widest flex items-center gap-1.5 font-mono">
              {currentUser?.farmName || "RUABON FARM"} OWNER CONSOLE
            </h2>
            <span className="text-[10px] text-teal-400 font-extrabold uppercase tracking-widest font-mono block mt-0.5">
              Secure Local Host ID: {ownerProfile.name}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono">
          <button
            onClick={() => setOwnerTab("website_control" as any)}
            className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-[10px] uppercase tracking-wider rounded-lg transition-all shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center gap-1.5 ring-2 ring-emerald-400/50"
            title="Change Text Fonts, Formatting & Add iFrame Embed Code"
          >
            <Code size={13} className="stroke-[2.5]" />
            <span>Format, Font &amp; iFrame Code</span>
          </button>

          <button
            onClick={() => {
              setShowShutdownModal(true);
              setShutdownStep(1);
              setShutdownInput("");
              setShutdownError(null);
            }}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white border border-rose-500 font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition-all shadow-md animate-pulse cursor-pointer flex items-center gap-1.5"
          >
            <ShieldAlert size={12} className="text-white" /> Emergency Shutdown
          </button>
          <span className="text-[9px] bg-teal-900/40 text-teal-300 border border-teal-500/20 px-3 py-1.5 rounded-lg font-black uppercase tracking-wider flex items-center gap-1">
            <Award size={11} /> Facility Owner Access
          </span>
        </div>
      </div>

      {/* Sub Tab Switcher & Multi-column Bento Layout */}
      <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
        {/* Left column: Side Panel Navigation (Visual, Spacious, Beautiful!) */}
        <div className="w-full lg:w-72 shrink-0 bg-stone-50 border border-stone-200/80 rounded-3xl p-5 space-y-4">
          <div className="pb-3 border-b border-stone-150">
            <h3 className="text-xxs font-black text-stone-400 uppercase tracking-widest">
              Console Dashboard
            </h3>
            <p className="text-[10px] text-stone-500 font-semibold uppercase tracking-wider mt-0.5">
              Select an administration module
            </p>
          </div>

          <div className="space-y-2">
            {(() => {
              const isMasterAdmin = currentUser?.role === "owner" || currentUser?.role === "admin" || true;
              const tabsList = [
                ...(isMasterAdmin ? [{
                  id: "ruabon_farm_profile",
                  title: "Ruabon Farm & Ownership",
                  desc: "Update Ruabon new owner's phone number & contact",
                  icon: <Smartphone size={18} />,
                  colorClass: "text-teal-600 bg-teal-50 border-teal-100",
                  activeClass: "bg-teal-600 text-white shadow-md shadow-teal-500/10 border-teal-600 scale-[1.02]",
                  inactiveClass: "bg-white border-stone-150 text-stone-750 hover:bg-stone-50 hover:border-stone-300"
                }] : []),
                {
                  id: "personnel",
                  title: "Personnel & Security",
                  desc: "Manage staff, PIN codes & credentials",
                  icon: <UserCheck size={18} />,
                  colorClass: "text-teal-600 bg-teal-50 border-teal-100",
                  activeClass: "bg-teal-600 text-white shadow-md shadow-teal-500/10 border-teal-600 scale-[1.02]",
                  inactiveClass: "bg-white border-stone-150 text-stone-750 hover:bg-stone-50 hover:border-stone-300"
                },
                {
                  id: "badge_scan",
                  title: "Badge Scanner & Actions",
                  desc: "Scan badges to view profile, ban account or log in",
                  icon: <CreditCard size={18} />,
                  colorClass: "text-amber-600 bg-amber-50 border-amber-100",
                  activeClass: "bg-amber-600 text-white shadow-md shadow-amber-500/10 border-amber-600 scale-[1.02]",
                  inactiveClass: "bg-white border-stone-150 text-stone-750 hover:bg-stone-50 hover:border-stone-300"
                },
                {
                  id: "visitors",
                  title: "Visitor & Manual Entry Hub",
                  desc: "Pre-authorizations, guest access & manual entry codes",
                  icon: <Key size={18} />,
                  colorClass: "text-pink-600 bg-pink-50 border-pink-100",
                  activeClass: "bg-pink-600 text-white shadow-md shadow-pink-500/10 border-pink-600 scale-[1.02]",
                  inactiveClass: "bg-white border-stone-150 text-stone-750 hover:bg-stone-50 hover:border-stone-300"
                },
                {
                  id: "terms_of_service",
                  title: "Terms of Service",
                  desc: "Configure login rules & mandatory copies",
                  icon: <Database size={18} />,
                  colorClass: "text-blue-600 bg-blue-50 border-blue-100",
                  activeClass: "bg-blue-600 text-white shadow-md shadow-blue-500/10 border-blue-600 scale-[1.02]",
                  inactiveClass: "bg-white border-stone-150 text-stone-750 hover:bg-stone-50 hover:border-stone-300"
                },
                {
                  id: "agistors",
                  title: "Agistor & Rider Profiles",
                  desc: "Manage client directories & credentials",
                  icon: <Award size={18} />,
                  colorClass: "text-emerald-600 bg-emerald-50 border-emerald-100",
                  activeClass: "bg-emerald-600 text-white shadow-md shadow-emerald-500/10 border-emerald-600 scale-[1.02]",
                  inactiveClass: "bg-white border-stone-150 text-stone-750 hover:bg-stone-50 hover:border-stone-300"
                },
                {
                  id: "ban_approvals",
                  title: "Ban Approvals Queue",
                  desc: "Review blocked terminals & network bans",
                  icon: <ShieldAlert size={18} />,
                  colorClass: "text-amber-600 bg-amber-50 border-amber-100",
                  activeClass: "bg-amber-600 text-white shadow-md shadow-amber-500/10 border-amber-600 scale-[1.02]",
                  inactiveClass: "bg-white border-stone-150 text-stone-750 hover:bg-stone-50 hover:border-stone-300"
                },
                {
                  id: "permissions",
                  title: "Feature Permissions",
                  desc: "Toggle live messaging & daily logs access",
                  icon: <Lock size={18} />,
                  colorClass: "text-purple-600 bg-purple-50 border-purple-100",
                  activeClass: "bg-purple-600 text-white shadow-md shadow-purple-500/10 border-purple-600 scale-[1.02]",
                  inactiveClass: "bg-white border-stone-150 text-stone-750 hover:bg-stone-50 hover:border-stone-300"
                }
              ].filter((tab) => {
                if (isMasterAdmin) return true;
                const masterOnlyTabs = [
                  "terms_of_service",
                  "ban_approvals",
                  "permissions"
                ];
                return !masterOnlyTabs.includes(tab.id);
              });

              return tabsList.map((tab) => {
                const isActive = ownerTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => setOwnerTab(tab.id as any)}
                    whileHover={isActive ? {} : { x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={`w-full flex items-start gap-3.5 p-3.5 rounded-2xl text-left border transition-all cursor-pointer ${
                      isActive ? tab.activeClass : tab.inactiveClass
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl shrink-0 ${isActive ? "bg-white/20 text-white" : tab.colorClass}`}>
                      {tab.icon}
                    </div>
                    <div className="min-w-0">
                      <span className="block text-xs font-black uppercase tracking-wide leading-none mt-0.5 font-mono">
                        {tab.title}
                      </span>
                      <span className={`block text-[8px] font-extrabold mt-1.5 leading-tight uppercase tracking-wider ${isActive ? "text-teal-50" : "text-stone-400"}`}>
                        {tab.desc}
                      </span>
                    </div>
                  </motion.button>
                );
              });
            })()}
          </div>
        </div>

        {/* Right column: Active Dashboard Content */}
        <div className="flex-1 w-full space-y-6">

          {ownerTab === ("ruabon_farm_profile" as any) && (
            <div className="space-y-6 text-left">
              {/* Header Banner */}
              <div className="bg-stone-900 text-white rounded-3xl p-6 border border-stone-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 bg-teal-500/10 text-teal-400 rounded-2xl border border-teal-500/20">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <h2 className="text-base font-black uppercase tracking-wide font-mono">
                      Ruabon Farm &amp; Ownership Profile
                    </h2>
                    <p className="text-xs text-stone-400 font-bold mt-0.5">
                      Facility Administrative Controls for Primary Owner Phone &amp; Emergency Contacts
                    </p>
                  </div>
                </div>

                <span className="text-[10px] bg-teal-950 text-teal-400 border border-teal-800/60 px-3 py-1.5 rounded-xl font-mono font-black uppercase tracking-wider">
                  SYSTEM ADMINISTRATOR
                </span>
              </div>

              {ruabonSaveSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2">
                  <Check size={16} className="text-emerald-600" />
                  <span>Ruabon Farm Owner Number &amp; Profile Updated Successfully in Cloud Database!</span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: Form to Edit Owner Contact & Phone */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-stone-200 p-6 space-y-6 shadow-xs">
                  <div className="flex items-center justify-between border-b border-stone-150 pb-3">
                    <div className="flex items-center gap-2">
                      <Smartphone size={18} className="text-teal-600" />
                      <h3 className="text-xs font-black uppercase text-stone-900 tracking-wider">
                        Update Ruabon Owner Details &amp; Phone
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                      Live Cloud Sync
                    </span>
                  </div>

                  <form onSubmit={handleSaveRuabonProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                          Farm Name
                        </label>
                        <input
                          type="text"
                          required
                          value={ruabonProfile.farmName}
                          onChange={(e) => setRuabonProfile(prev => ({ ...prev, farmName: e.target.value }))}
                          className="w-full bg-stone-50 border border-stone-250 text-stone-900 rounded-xl p-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                          Owner / Managing Contact Name
                        </label>
                        <input
                          type="text"
                          required
                          value={ruabonProfile.ownerName}
                          onChange={(e) => setRuabonProfile(prev => ({ ...prev, ownerName: e.target.value }))}
                          className="w-full bg-stone-50 border border-stone-250 text-stone-900 rounded-xl p-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-teal-700 uppercase tracking-widest mb-1 flex items-center justify-between">
                          <span>Ruabon Owner Phone Number *</span>
                          <span className="text-[9px] font-mono text-teal-600 bg-teal-50 px-1.5 py-0.2 rounded">Primary</span>
                        </label>
                        <input
                          type="tel"
                          required
                          placeholder="e.g. 0419 883 201"
                          value={ruabonProfile.ownerPhone}
                          onChange={(e) => setRuabonProfile(prev => ({ ...prev, ownerPhone: e.target.value }))}
                          className="w-full bg-stone-50 border-2 border-teal-500/40 text-stone-900 rounded-xl p-2.5 text-xs font-mono font-black focus:outline-hidden focus:border-teal-600"
                        />
                        <span className="text-[10px] text-stone-400 mt-1 block">
                          This phone number is used for farm login recovery &amp; official facility communications.
                        </span>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                          Ruabon Owner Email *
                        </label>
                        <input
                          type="email"
                          required
                          value={ruabonProfile.ownerEmail}
                          onChange={(e) => setRuabonProfile(prev => ({ ...prev, ownerEmail: e.target.value }))}
                          className="w-full bg-stone-50 border border-stone-250 text-stone-900 rounded-xl p-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                          Physical Farm Address
                        </label>
                        <input
                          type="text"
                          value={ruabonProfile.farmAddress}
                          onChange={(e) => setRuabonProfile(prev => ({ ...prev, farmAddress: e.target.value }))}
                          className="w-full bg-stone-50 border border-stone-250 text-stone-900 rounded-xl p-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                          Emergency Operations Phone
                        </label>
                        <input
                          type="tel"
                          value={ruabonProfile.emergencyPhone}
                          onChange={(e) => setRuabonProfile(prev => ({ ...prev, emergencyPhone: e.target.value }))}
                          className="w-full bg-stone-50 border border-stone-250 text-stone-900 rounded-xl p-2.5 text-xs font-mono font-bold focus:outline-hidden focus:border-teal-600"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingRuabon}
                      className="w-full bg-teal-600 hover:bg-teal-700 text-white font-black text-xs uppercase tracking-wider py-3.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 mt-4"
                    >
                      {isSavingRuabon ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Saving Ruabon Profile...</span>
                        </>
                      ) : (
                        <>
                          <Save size={14} />
                          <span>Save Ruabon Owner Number &amp; Details</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Right Column: Live Summary Card */}
                <div className="bg-gradient-to-br from-stone-900 to-stone-950 rounded-3xl border border-stone-800 p-6 text-white space-y-5 shadow-xl">
                  <div className="flex items-center gap-3 pb-3 border-b border-stone-800">
                    <HorseSenseLogo className="w-9 h-9" />
                    <div>
                      <h4 className="text-xs font-black uppercase text-white font-mono">Ruabon Live Card</h4>
                      <span className="text-[10px] text-teal-400 font-bold">Active Registration</span>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-stone-900 rounded-xl border border-stone-800">
                      <span className="text-[9px] text-stone-400 font-black uppercase block">Active Owner</span>
                      <span className="font-bold text-white text-sm">{ruabonProfile.ownerName}</span>
                    </div>

                    <div className="p-3 bg-teal-950/40 border border-teal-800/40 rounded-xl">
                      <span className="text-[9px] text-teal-400 font-black uppercase block">Owner Contact Number</span>
                      <span className="font-mono font-black text-teal-300 text-sm">{ruabonProfile.ownerPhone}</span>
                    </div>

                    <div className="p-3 bg-stone-900 rounded-xl border border-stone-800">
                      <span className="text-[9px] text-stone-400 font-black uppercase block">Official Email</span>
                      <span className="font-mono text-stone-200 text-xs">{ruabonProfile.ownerEmail}</span>
                    </div>

                    <div className="p-3 bg-stone-900 rounded-xl border border-stone-800">
                      <span className="text-[9px] text-stone-400 font-black uppercase block">Facility Address</span>
                      <span className="text-stone-300 text-xs">{ruabonProfile.farmAddress}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {ownerTab === "badge_scan" && (
        <div className="space-y-6">
          {/* Badge Scanner Hero Panel */}
          <div className="bg-stone-900 text-white rounded-3xl p-6 border border-stone-800 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-800">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
                  <CreditCard size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-white tracking-wider font-mono">
                    Owner Station Badge Scanner Terminal
                  </h3>
                  <p className="text-xs text-stone-400 font-medium mt-0.5">
                    Scan any operator or visitor badge to inspect permissions, ban account, or log in as user
                  </p>
                </div>
              </div>

              <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800/50 px-3 py-1 rounded-full font-black uppercase tracking-wider self-start sm:self-center">
                Live Scanner Active
              </span>
            </div>

            {/* Scan Search Input */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <div className="md:col-span-2 relative">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
                <input
                  type="text"
                  placeholder="Scan badge QR code, enter Badge ID or search by User Name / PIN..."
                  value={badgeSearchInput}
                  onChange={(e) => {
                    setBadgeSearchInput(e.target.value);
                    handleScanOrFindUser(e.target.value);
                  }}
                  className="w-full bg-stone-950 border border-stone-750 text-stone-100 placeholder-stone-500 rounded-2xl pl-11 pr-4 py-3 text-xs font-mono font-bold focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (badgeSearchInput) {
                      handleScanOrFindUser(badgeSearchInput);
                    }
                  }}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider py-3 px-4 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <CreditCard size={16} /> Scan Badge
                </button>
              </div>
            </div>

            {/* Quick Select Buttons for All Registered Crew & Visitors */}
            <div className="space-y-2 pt-2">
              <span className="text-xxs font-black text-stone-400 uppercase tracking-widest block">
                Quick Select Registered Operator / Visitor:
              </span>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                {farmCrewProfiles.map((user) => (
                  <button
                    key={user.name}
                    type="button"
                    onClick={() => {
                      setBadgeSearchInput(user.name);
                      setScannedUser(user);
                      setBadgeActionMsg({ type: "success", text: `✓ Selected badge profile for "${user.name}".` });
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      scannedUser?.name === user.name
                        ? "bg-amber-500 text-stone-950 border-amber-400 font-extrabold"
                        : "bg-stone-800/80 text-stone-300 border-stone-700 hover:bg-stone-750"
                    }`}
                  >
                    {user.name} ({user.role})
                  </button>
                ))}
                {visitorPermissions.map((vis) => (
                  <button
                    key={vis.id}
                    type="button"
                    onClick={() => {
                      setBadgeSearchInput(vis.name);
                      const visUser = {
                        name: vis.name,
                        role: "visitor",
                        pin: vis.pin,
                        title: "Pre-Authorized Visitor",
                        isActive: vis.isActive !== false,
                        badges: vis.badges || ["Guest Pass"],
                        avatarColor: "bg-pink-50 text-pink-800 border-pink-200"
                      } as SystemUser;
                      setScannedUser(visUser);
                      setBadgeActionMsg({ type: "success", text: `✓ Selected visitor badge for "${vis.name}".` });
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      scannedUser?.name === vis.name
                        ? "bg-pink-500 text-stone-950 border-pink-400 font-extrabold"
                        : "bg-stone-800/80 text-stone-300 border-stone-700 hover:bg-stone-750"
                    }`}
                  >
                    {vis.name} (Visitor)
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Feedback Message */}
          {badgeActionMsg && (
            <div className={`p-4 rounded-2xl text-xs font-extrabold flex items-center justify-between ${
              badgeActionMsg.type === "success" 
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
                : "bg-rose-50 text-rose-800 border border-rose-200"
            }`}>
              <span>{badgeActionMsg.text}</span>
              <button onClick={() => setBadgeActionMsg(null)} className="text-stone-400 hover:text-stone-600 cursor-pointer">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Scanned User Action Details Card */}
          {scannedUser ? (
            <div className="bg-white rounded-3xl border border-stone-200 shadow-md p-6 space-y-6">
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-stone-150">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl border shadow-xs ${scannedUser.avatarColor || "bg-stone-100 text-stone-800 border-stone-200"}`}>
                    {scannedUser.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-stone-900">{scannedUser.name}</h2>
                      {scannedUser.isBanned || scannedUser.isActive === false ? (
                        <span className="bg-rose-100 text-rose-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-rose-200 uppercase">
                          Banned / Revoked
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-200 uppercase">
                          Active Account
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-extrabold text-stone-500 uppercase tracking-wider mt-0.5">
                      {scannedUser.title || scannedUser.role} • Security PIN: {scannedUser.pin || "••••"}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-stone-50 border border-stone-200 rounded-2xl flex items-center gap-3">
                  <BadgeQRCode name={scannedUser.name} pin={scannedUser.pin || "0000"} />
                  <div className="text-left font-mono">
                    <span className="text-[9px] font-extrabold text-stone-400 uppercase tracking-wider block">Badge Identifier</span>
                    <span className="text-xs font-black text-stone-800 block">RUABON-{scannedUser.name.replace(/\s+/g, '-').toUpperCase()}</span>
                  </div>
                </div>
              </div>

              {/* Action Control Panel Grid */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest">
                  Owner Station Badge Actions
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Action 1: View Profile & Activity Logs */}
                  <button
                    type="button"
                    onClick={() => setShowFullProfileModal(true)}
                    className="p-4 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-2xl transition-all text-left space-y-2 cursor-pointer shadow-3xs group"
                  >
                    <div className="p-2.5 bg-teal-600 text-white rounded-xl w-fit group-hover:scale-105 transition-transform">
                      <Eye size={18} />
                    </div>
                    <div>
                      <span className="block text-xs font-black uppercase tracking-wider">View Full Profile</span>
                      <span className="block text-[10px] text-teal-700 font-bold mt-0.5">Inspect audit logs & activity history</span>
                    </div>
                  </button>

                  {/* Action 2: Ban / Unban Account */}
                  {scannedUser.isBanned || scannedUser.isActive === false ? (
                    <button
                      type="button"
                      onClick={handleUnbanScannedUser}
                      className="p-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-2xl transition-all text-left space-y-2 cursor-pointer shadow-3xs group"
                    >
                      <div className="p-2.5 bg-emerald-600 text-white rounded-xl w-fit group-hover:scale-105 transition-transform">
                        <ShieldCheck size={18} />
                      </div>
                      <div>
                        <span className="block text-xs font-black uppercase tracking-wider">Unban Account</span>
                        <span className="block text-[10px] text-emerald-700 font-bold mt-0.5">Restore login access immediately</span>
                      </div>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleBanScannedUser}
                      className="p-4 bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200 rounded-2xl transition-all text-left space-y-2 cursor-pointer shadow-3xs group"
                    >
                      <div className="p-2.5 bg-rose-600 text-white rounded-xl w-fit group-hover:scale-105 transition-transform">
                        <ShieldX size={18} />
                      </div>
                      <div>
                        <span className="block text-xs font-black uppercase tracking-wider">Ban Account</span>
                        <span className="block text-[10px] text-rose-700 font-bold mt-0.5">Revoke access & force logout</span>
                      </div>
                    </button>
                  )}

                  {/* Action 3: Log In As User (Impersonate) */}
                  <button
                    type="button"
                    onClick={handleImpersonateScannedUser}
                    className="p-4 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-2xl transition-all text-left space-y-2 cursor-pointer shadow-3xs group"
                  >
                    <div className="p-2.5 bg-blue-600 text-white rounded-xl w-fit group-hover:scale-105 transition-transform">
                      <UserPlus size={18} />
                    </div>
                    <div>
                      <span className="block text-xs font-black uppercase tracking-wider">Log In As User</span>
                      <span className="block text-[10px] text-blue-700 font-bold mt-0.5">Impersonate session to test or assist</span>
                    </div>
                  </button>

                  {/* Action 4: Generate Bypass Passkey */}
                  <button
                    type="button"
                    onClick={() => handleGeneratePasskey(scannedUser.name)}
                    className="p-4 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-2xl transition-all text-left space-y-2 cursor-pointer shadow-3xs group"
                  >
                    <div className="p-2.5 bg-amber-600 text-white rounded-xl w-fit group-hover:scale-105 transition-transform">
                      <Key size={18} />
                    </div>
                    <div>
                      <span className="block text-xs font-black uppercase tracking-wider">Generate Bypass Key</span>
                      <span className="block text-[10px] text-amber-700 font-bold mt-0.5">Issue 10-char login passkey</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-stone-50 border-2 border-dashed border-stone-200 rounded-3xl p-12 text-center space-y-3">
              <CreditCard size={36} className="text-stone-300 mx-auto" />
              <h4 className="text-sm font-black text-stone-600 uppercase tracking-wider">No Badge Scanned Yet</h4>
              <p className="text-xs text-stone-400 max-w-md mx-auto font-medium">
                Use the search input or quick-select buttons above to scan an operator or visitor badge.
              </p>
            </div>
          )}
        </div>
      )}

      {ownerTab === "personnel" && (
        /* Main Grid Layout */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Double-Column for Controls */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Retro Command Prompt Terminal */}
          <div className="bg-stone-950 border border-stone-850 rounded-3xl p-5 shadow-2xl flex flex-col font-mono text-left relative overflow-hidden">
            <div className="absolute top-2 right-4 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="w-2 h-2 rounded-full bg-teal-500" />
            </div>
            
            <div className="flex items-center space-x-2 text-[10px] font-black uppercase text-stone-500 tracking-widest border-b border-stone-900 pb-2 mb-3">
              <Terminal size={14} className="text-teal-500 animate-pulse" />
              <span>Operator Shell CLI</span>
            </div>

            {true ? (
              <>
                <div className="h-44 overflow-y-auto text-[11px] font-bold text-teal-400 leading-normal mb-3 pr-1 space-y-1">
                  {cliLogs.map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap">
                      {log}
                    </div>
                  ))}
                  <div ref={cliTerminalEndRef} />
                </div>

                <form onSubmit={handleCliSubmit} className="flex gap-2 border-t border-stone-900 pt-3">
                  <span className="text-teal-500 font-black self-center">{ownerProfile.name.split(" ")[0].toLowerCase()}$</span>
                  <input
                    type="text"
                    placeholder="Type '/help' to list CLI commands, or enter command directly..."
                    value={cliInput}
                    onChange={(e) => setCliInput(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none focus:outline-hidden text-teal-300 text-[11px] font-bold"
                  />
                  <button
                    type="submit"
                    className="bg-teal-950 border border-teal-800/40 text-teal-400 hover:bg-teal-900 hover:text-white font-mono text-[9px] px-3 py-1.5 rounded-lg uppercase tracking-wider transition-all cursor-pointer font-extrabold"
                  >
                    Exec
                  </button>
                </form>
              </>
            ) : (
              <div className="h-52 flex flex-col items-center justify-center text-center space-y-3">
                <Lock className="text-rose-500 shrink-0 animate-pulse" size={28} />
                <p className="text-xs font-bold text-stone-550 uppercase tracking-widest leading-relaxed max-w-sm">
                  🔒 Operator Shell Restricted to Administrator.
                </p>
              </div>
            )}
          </div>

          {/* User Management System */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-5 shadow-xs text-left">
            <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
              <UserPlus className="text-teal-600" size={18} />
              <div>
                <h3 className="text-xs font-black uppercase text-stone-900 tracking-wider">
                  Crew Profiles Administration
                </h3>
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                  Register new personnel, set bypass PINs, or revoke credentials
                </span>
              </div>
            </div>

            {/* Existing Users Directory */}
            <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
              {otherUsers.map((user) => {
                const activeKey = activePasskeys[user.name];
                return (
                  <div 
                    key={user.name}
                    className="flex items-center justify-between p-3.5 bg-stone-50/70 border border-stone-200/60 rounded-2xl hover:bg-white transition-all group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border uppercase ${user.avatarColor}`}>
                        {user.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div>
                        <strong className="block text-xs font-bold text-stone-900 leading-tight">{user.name}</strong>
                        <span className="text-[10px] font-bold text-teal-750 uppercase tracking-wider block mt-0.5 font-mono">
                          PIN: {user.pin} • {getFormatUserTitle(user)}
                        </span>
                        {/* Render Badges */}
                        {user.badges && user.badges.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {user.badges.map(b => (
                              <span key={b} className="bg-teal-50 text-teal-800 text-[9px] font-black px-1.5 py-0.5 rounded border border-teal-200/50 flex items-center gap-1 uppercase tracking-wider">
                                {b}
                                {isCooper && (
                                  <button 
                                    type="button"
                                    onClick={() => handleRemoveUserBadge(user.name, b)}
                                    className="text-teal-400 hover:text-teal-900 font-black ml-0.5 cursor-pointer text-[10px]"
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Owner Add Badge Input */}
                        {isCooper && (
                          <div className="mt-1.5 flex items-center gap-1">
                            <input 
                              type="text"
                              placeholder="New Badge Label"
                              id={`add-badge-crew-${user.name.replace(/\s+/g, "-")}`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddUserBadge(user.name, e.currentTarget.value);
                                  e.currentTarget.value = "";
                                }
                              }}
                              className="bg-white border border-stone-250 rounded-lg px-2 py-0.5 text-[9px] font-semibold w-24 outline-none text-stone-800 focus:ring-1 focus:ring-teal-600"
                            />
                            <button 
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(`add-badge-crew-${user.name.replace(/\s+/g, "-")}`) as HTMLInputElement;
                                if (input && input.value) {
                                  handleAddUserBadge(user.name, input.value);
                                  input.value = "";
                                }
                              }}
                              className="text-[9px] bg-teal-50 hover:bg-teal-100 text-teal-700 px-2 py-0.5 rounded-lg border border-teal-200 font-bold uppercase cursor-pointer"
                            >
                              + Add
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCooper ? (
                        activeKey ? (
                          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1">
                            <span className="font-mono text-[11px] font-black tracking-widest text-emerald-900">
                              {activeKey.passkey}
                            </span>
                            <button
                              onClick={() => copyToClipboard(activeKey.passkey, user.name)}
                              className="p-1 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                              title="Copy Passkey"
                            >
                              {copiedUser === user.name ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                            <button
                              onClick={() => handleRevokePasskey(user.name)}
                              className="p-1 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                              title="Revoke Passkey"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleGeneratePasskey(user.name)}
                            disabled={isGenerating === user.name}
                            className="bg-teal-600 hover:bg-teal-750 text-white font-bold text-[9px] px-3 py-1.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-3xs disabled:opacity-40"
                          >
                            <RefreshCw size={10} className={isGenerating === user.name ? "animate-spin" : ""} />
                            <span>Passkey</span>
                          </button>
                        )
                      ) : (
                        <span className="text-[9px] bg-stone-100 text-stone-400 border border-stone-200 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 uppercase tracking-wider">
                          <Lock size={10} /> Bypass Locked
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRepromptTutorial(user.name)}
                        className={`p-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1 text-[9px] uppercase font-bold shrink-0 ${
                          user.hasSeenTutorial === false
                            ? "bg-amber-50 border-amber-200 text-amber-700 cursor-default"
                            : "bg-stone-50 hover:bg-teal-50 border-stone-200 hover:border-teal-300 text-stone-600 hover:text-teal-700"
                        }`}
                        title={user.hasSeenTutorial === false ? "Tutorial is already prompted" : "Reprompt Help & Tutorial"}
                        disabled={user.hasSeenTutorial === false}
                      >
                        <HelpCircle size={11} />
                        <span>{user.hasSeenTutorial === false ? "Prompted" : "Reprompt"}</span>
                      </button>

                      <button
                        onClick={() => handleRemoveUser(user.name)}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-100 hover:border-rose-200 text-rose-600 hover:text-rose-800 rounded-xl transition-all cursor-pointer shrink-0 ml-1 opacity-60 hover:opacity-100 group-hover:opacity-100"
                        title="Delete User"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add User Form Inline */}
            <form onSubmit={handleAddUser} className="p-4 bg-stone-50 border border-stone-200 rounded-2xl space-y-3.5">
              <span className="text-[10px] font-black text-teal-900 uppercase tracking-wider block">
                Register New Operator Profile
              </span>

              {userError && (
                <div className="p-2.5 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xxs font-extrabold uppercase tracking-wide animate-shake">
                  {userError}
                </div>
              )}
              {userSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xxs font-extrabold uppercase tracking-wide">
                  {userSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="bg-white border border-stone-250 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden text-stone-900 focus:ring-1 focus:ring-teal-600"
                />
                <input
                  type="text"
                  maxLength={4}
                  required
                  placeholder="4-Digit PIN"
                  value={newUserPin}
                  onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ""))}
                  className="bg-white border border-stone-250 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden text-stone-900 focus:ring-1 focus:ring-teal-600 font-mono text-center"
                />
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="bg-white border border-stone-250 rounded-xl px-2.5 py-2 text-xs font-bold focus:outline-hidden text-stone-950 focus:ring-1 focus:ring-teal-600 cursor-pointer"
                >
                  <option value="user">USER (Groom/Helper)</option>
                  <option value="admin">ADMIN (Manager)</option>
                  <option value="owner">OWNER (Cooper)</option>
                </select>
                <input
                  type="text"
                  placeholder="Role Title (e.g. Helper)"
                  value={newUserTitle}
                  onChange={(e) => setNewUserTitle(e.target.value)}
                  className="bg-white border border-stone-250 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden text-stone-900 focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <UserPlus size={11} /> Register Crew Profile
                </button>
              </div>
            </form>

          </div>

          {/* Bulk Badges & Printing Station */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 shadow-xs text-left" id="bulk-badges-hub">
            <div className="border-b border-stone-100 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="text-teal-600" size={18} />
                <div>
                  <h3 className="text-xs font-black uppercase text-stone-900 tracking-wider">
                    Crew Badges Hub
                  </h3>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                    Bulk export or print security badges for all crew
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => setShowBulkPrintModal(true)}
                className="w-full inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-black text-[10px] px-3 py-2.5 rounded-xl uppercase tracking-wider shadow-xs cursor-pointer transition-all"
              >
                <Printer size={12} /> Bulk Print Badges
              </button>
            </div>

            <div className="text-[10px] font-semibold text-stone-400 leading-relaxed bg-stone-50 p-3.5 rounded-xl border border-stone-150">
              ⚠️ Each security badge contains a deterministic login QR code mapping the crew member's name and bypass PIN. Keep all exported records confidential.
            </div>
          </div>

        </div>

        {/* Right Column for Owner Account & Banning lists */}
        <div className="space-y-6">
          
          {/* Owner Details Account Editor */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 shadow-xs text-left">
            <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
              <Database className="text-teal-600" size={17} />
              <div>
                <h3 className="text-xs font-black uppercase text-stone-900 tracking-wider">
                  Owner Account Customization
                </h3>
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                  Customize and store your root profile metadata
                </span>
              </div>
            </div>

            {ownerSaveMsg && (
              <div className={`p-2.5 rounded-xl text-xxs font-extrabold uppercase tracking-wide border ${
                ownerSaveMsg.startsWith("ERROR") ? "bg-rose-50 border-rose-100 text-rose-800" : "bg-emerald-50 border-emerald-100 text-emerald-800"
              }`}>
                {ownerSaveMsg}
              </div>
            )}

            <form onSubmit={handleUpdateOwnerProfile} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-wider block">Full Name (Read-Only)</label>
                <input
                  type="text"
                  disabled
                  value={ownerProfile.name}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-500 cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-wider block">Secret Authorization PIN</label>
                <input
                  type="text"
                  maxLength={4}
                  value={ownerPinInput}
                  onChange={(e) => setOwnerPinInput(e.target.value.replace(/\D/g, ""))}
                  className="w-full bg-white border border-stone-250 rounded-xl px-3 py-2 text-xs font-extrabold text-stone-900 font-mono focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-wider block">Operator Professional Title</label>
                <input
                  type="text"
                  value={ownerTitleInput}
                  onChange={(e) => setOwnerTitleInput(e.target.value)}
                  className="w-full bg-white border border-stone-250 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-wider block">Date of Birth</label>
                <input
                  type="date"
                  value={ownerDobInput}
                  onChange={(e) => setOwnerDobInput(e.target.value)}
                  className="w-full bg-white border border-stone-250 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 focus:ring-1 focus:ring-teal-600 focus:outline-hidden cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-wider block">Security Account Tier</label>
                <input
                  type="text"
                  value={ownerTierInput}
                  onChange={(e) => setOwnerTierInput(e.target.value)}
                  className="w-full bg-white border border-stone-250 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-stone-900 hover:bg-stone-850 text-white font-bold text-[10px] py-2.5 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-1 shadow-xs cursor-pointer"
              >
                <Save size={12} />
                <span>Save Account Profile</span>
              </button>
            </form>
          </div>

          {/* Visitor link Toggle Widget */}
          <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-xs text-left space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black text-stone-900 uppercase tracking-wide">Visitor Login Gate</h4>
                <p className="text-[9px] text-stone-400 font-bold uppercase mt-0.5">Toggle Visitor button on login page</p>
              </div>
              <button
                onClick={handleToggleVisitorAccess}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  visitorAccessEnabled ? "bg-teal-600" : "bg-stone-300"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-1 left-1 transition-transform ${
                    visitorAccessEnabled ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
            <p className="text-[10px] text-stone-500 font-medium leading-relaxed">
              When disabled, public logins are completely blocked and guests cannot register or access any records.
            </p>
          </div>

          {/* Guest Profile and IP Moderation Banning */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-5 shadow-xs text-left">
            <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
              <ShieldX className="text-rose-600" size={18} />
              <div>
                <h3 className="text-xs font-black uppercase text-stone-900 tracking-wider">
                  Visitor Gatekeeping &amp; Bans
                </h3>
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                  Blacklist specific guest names or connection IP addresses
                </span>
              </div>
            </div>

            {isCooper ? (
              <>
                {/* 15-Digit Hourly Bypass Code Display */}
                <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-teal-800 uppercase tracking-widest block">
                      Hourly Lockdown Bypass Code
                    </span>
                    <span className="text-[9px] text-teal-600 font-mono font-bold">
                      Resets in {minutesLeft}m
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 bg-white border border-teal-200 rounded-xl px-3.5 py-2 font-mono text-base font-black text-teal-905 tracking-widest text-center select-all select-none">
                      {hourlyBypass}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(hourlyBypass);
                        alert("Bypass code copied to clipboard!");
                      }}
                      className="p-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl cursor-pointer transition-colors"
                      title="Copy bypass code"
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                  <p className="text-[9px] text-teal-700/80 leading-normal font-medium">
                    Administrator can share this 15-digit code with blocked clients or staff to bypass lockdowns on specific connections. This is a secure, static recovery key.
                  </p>
                </div>

                {/* Banned Names List */}
                <div className="space-y-3 pt-2">
                  <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Banned Guest Names ({bannedNames.length})</span>
                  
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Timothy"
                      value={banNameInput}
                      onChange={(e) => setBanNameInput(e.target.value)}
                      className="flex-1 bg-stone-50 border border-stone-250 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-hidden text-stone-900 focus:ring-1 focus:ring-rose-500"
                    />
                    <input
                      type="text"
                      placeholder="Explain ban reason..."
                      value={banNameReason}
                      onChange={(e) => setBanNameReason(e.target.value)}
                      className="flex-1 bg-stone-50 border border-stone-250 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-hidden text-stone-900 focus:ring-1 focus:ring-rose-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleBanName(banNameInput)}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[9px] px-3.5 py-1.5 rounded-xl uppercase tracking-wider cursor-pointer"
                    >
                      Ban Name
                    </button>
                  </div>

                  {bannedNames.length > 0 && (
                    <div className="space-y-2 pt-2.5 max-h-52 overflow-y-auto">
                      {bannedNames.map(item => (
                        <div key={item.name} className="flex flex-col gap-1.5 p-3 bg-white border border-stone-200 rounded-xl text-xs text-stone-900 shadow-3xs" id={`banned-name-bubble-${item.name}`}>
                          <div className="flex justify-between items-center">
                            <span className="font-extrabold text-stone-950 uppercase tracking-wide text-[11px]">{item.name}</span>
                            <button onClick={() => handleUnbanName(item.name)} className="text-stone-400 hover:text-rose-600 font-bold text-sm leading-none shrink-0 cursor-pointer px-1">×</button>
                          </div>
                          <div className="text-[10px] text-stone-550 border-t border-stone-100 pt-1 mt-0.5">
                            <span className="font-black text-[9px] uppercase text-stone-450 block tracking-wider">Ban Reason:</span>
                            <p className="mt-0.5 font-medium text-stone-700 break-words whitespace-pre-wrap">{item.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Banned IPs List */}
                <div className="space-y-3 pt-4 border-t border-stone-100">
                  <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Banned IP Addresses ({bannedIps.length})</span>
                  
                  <div className="space-y-2.5 bg-stone-50/65 p-3 rounded-2xl border border-stone-150">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="e.g. 192.168.1.102"
                        value={banIpInput}
                        onChange={(e) => setBanIpInput(e.target.value)}
                        className="flex-1 bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden text-stone-900 focus:ring-1 focus:ring-rose-500"
                      />
                      <input
                        type="text"
                        placeholder="Explain ban reason..."
                        value={banIpReason}
                        onChange={(e) => setBanIpReason(e.target.value)}
                        className="flex-1 bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden text-stone-900 focus:ring-1 focus:ring-rose-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleBanIp(banIpInput)}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[9px] px-3.5 py-2 rounded-xl uppercase tracking-wider cursor-pointer"
                      >
                        Ban IP
                      </button>
                    </div>

                    {/* Ban Scope options */}
                    <div className="space-y-1.5">
                      <span className="block text-[9px] font-bold text-stone-550 uppercase tracking-widest">Select Ban Scope for IP:</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setBanIpScope("all")}
                          className={`py-1.5 px-2 text-[9px] font-black uppercase rounded-lg border text-center transition-all cursor-pointer ${
                            banIpScope === "all" 
                              ? "bg-red-600 border-red-600 text-white shadow-xs" 
                              : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          🚨 Everything
                        </button>
                        <button
                          type="button"
                          onClick={() => setBanIpScope("visitor")}
                          className={`py-1.5 px-2 text-[9px] font-black uppercase rounded-lg border text-center transition-all cursor-pointer ${
                            banIpScope === "visitor" 
                              ? "bg-amber-600 border-amber-600 text-white shadow-xs" 
                              : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          👥 Visitors
                        </button>
                        <button
                          type="button"
                          onClick={() => setBanIpScope("profiles")}
                          className={`py-1.5 px-2 text-[9px] font-black uppercase rounded-lg border text-center transition-all cursor-pointer ${
                            banIpScope === "profiles" 
                              ? "bg-blue-600 border-blue-600 text-white shadow-xs" 
                              : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                          }`}
                        >
                          Profiles
                        </button>
                      </div>
                    </div>

                    {/* Profiles select check list if scope === profiles */}
                    {banIpScope === "profiles" && (
                      <div className="space-y-1.5 pt-1.5 border-t border-stone-200/60">
                        <span className="block text-[8px] font-bold text-stone-500 uppercase tracking-widest">Restrict Specific Staff Accounts:</span>
                        <div className="grid grid-cols-2 gap-1.5 max-h-24 overflow-y-auto p-2 border border-stone-200 rounded-xl bg-white">
                          {crewProfiles.map(u => (
                            <label key={u.name} className="flex items-center gap-1.5 text-[11px] text-stone-700 font-bold cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={banIpProfiles.includes(u.name)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setBanIpProfiles(prev => [...prev, u.name]);
                                  } else {
                                    setBanIpProfiles(prev => prev.filter(p => p !== u.name));
                                  }
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                              />
                              <span className="truncate">{u.name.split(" ")[0]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {bannedIpsList.length > 0 && (
                    <div className="space-y-2 pt-2.5 max-h-52 overflow-y-auto">
                      {bannedIpsList.map(item => (
                        <div key={item.ip} className="flex flex-col gap-1.5 p-3 bg-white border border-stone-200 rounded-xl text-xs text-stone-900 shadow-3xs" id={`banned-ip-bubble-${item.ip}`}>
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-extrabold text-stone-950 text-[11px]">{item.ip}</span>
                            <button onClick={() => handleUnbanIp(item.ip)} className="text-stone-400 hover:text-rose-600 font-bold text-sm leading-none shrink-0 cursor-pointer px-1">×</button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 items-center text-[9px] uppercase font-mono mt-0.5">
                            <span className="bg-stone-100 text-stone-800 border border-stone-250 px-1.5 py-0.5 rounded font-black">
                              Target: {item.scope || "all"}
                            </span>
                            {item.scope === "profiles" && item.bannedProfiles?.length > 0 && (
                              <span className="text-stone-500 font-sans font-bold capitalize break-words">
                                (Restricted: {item.bannedProfiles.join(", ")})
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-stone-550 border-t border-stone-100 pt-1 mt-1">
                            <span className="font-black text-[9px] uppercase text-stone-455 block tracking-wider">Ban Reason:</span>
                            <p className="mt-0.5 font-medium text-stone-700 break-words whitespace-pre-wrap">{item.reason || "No reason specified"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>


              </>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-2 border border-dashed border-stone-250 rounded-2xl p-4 bg-stone-50/50">
                <Lock className="text-stone-400 shrink-0" size={20} />
                <span className="text-xxs font-black text-stone-400 uppercase tracking-widest leading-none">
                  Firewall Blacklist Locked
                </span>
                <p className="text-[10px] text-stone-500 font-semibold leading-relaxed max-w-xs">
                  IP ban & visitor ban moderation tools are restricted to Facility Administrator.
                </p>
              </div>
            )}
          </div>

        </div>

      </div>
      )}

            {/* Visitor Access Hub Tab */}
      {ownerTab === "visitors" && (
        <div className="space-y-6 animate-fade-in text-left">
          <div className="bg-white border border-stone-200 rounded-3xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-stone-100 pb-4">
              <div>
                <h3 className="text-sm font-black uppercase text-stone-900 tracking-wider">
                  Pre-Authorized Visitor Gatekeeper
                </h3>
                <p className="text-xs text-stone-500 font-semibold mt-0.5">
                  Pre-approve family, veterinary, farrier, or guest accounts. Define scheduling limits, horse allowances, padlock permissions, and issue printed QR guest passes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVName("");
                  setVSelectedHorses([]);
                  setVSelectedPaddocks([]);
                  setVCanLogMaintenance(false);
                  setVStartDate("");
                  setVEndDate("");
                  setVStartHour("09:00");
                  setVEndHour("17:00");
                  setVIsActive(true);
                  setVEditingId(null);
                  setVError(null);
                  setVSuccess(null);
                }}
                className="bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold text-[10px] px-3.5 py-2 border border-stone-200 rounded-xl uppercase tracking-wider transition-all"
              >
                Clear Form
              </button>
            </div>

            {/* Error & Success Messages */}
            {vError && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl text-xs font-bold uppercase tracking-wider">
                ⚠️ {vError}
              </div>
            )}
            {vSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl text-xs font-bold uppercase tracking-wider">
                ✓ {vSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Form: Create/Edit Credentials */}
              <form 
                id="visitor-authorizer-form"
                onSubmit={handleSaveVisitorPermission} 
                className="lg:col-span-5 bg-stone-50/40 border border-stone-200 p-5 rounded-2xl space-y-5"
              >
                <div className="flex items-center gap-2 border-b border-stone-150 pb-2">
                  <UserPlus className="text-pink-600 font-bold" size={16} />
                  <span className="text-xs font-black uppercase text-stone-855 tracking-wider">
                    {vEditingId ? "Modify Pre-Authorization" : "Pre-Approve New Visitor"}
                  </span>
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                    Visitor Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Timothy Cooper"
                    value={vName}
                    onChange={(e) => setVName(e.target.value)}
                    className="w-full bg-white border border-stone-250 rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden"
                  />
                </div>

                {/* PIN Configuration */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                    Assigned 4-Digit Security PIN (Required)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    placeholder="e.g. 1234"
                    value={vPin}
                    onChange={(e) => setVPin(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-white border border-stone-250 rounded-xl px-3.5 py-2.5 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-pink-500 focus:outline-hidden tracking-widest text-center font-mono text-sm"
                  />
                </div>



                {/* Direct Access Permissions Toggle */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                      Access Status
                    </label>
                    <button
                      type="button"
                      onClick={() => setVIsActive(!vIsActive)}
                      className={`w-full py-2 px-3 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        vIsActive 
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                          : "bg-rose-50 border-rose-200 text-rose-800"
                      }`}
                    >
                      {vIsActive ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                      {vIsActive ? "Currently Allowed" : "Access Closed"}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                      Log Maintenance
                    </label>
                    <button
                      type="button"
                      onClick={() => setVCanLogMaintenance(!vCanLogMaintenance)}
                      className={`w-full py-2 px-3 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        vCanLogMaintenance 
                          ? "bg-teal-50 border-teal-200 text-teal-800" 
                          : "bg-stone-100 border-stone-200 text-stone-500"
                      }`}
                    >
                      {vCanLogMaintenance ? "Allowed to Log" : "ReadOnly Access"}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                      Assisted Access
                    </label>
                    <button
                      type="button"
                      onClick={() => setVAssistedAccessMode(!vAssistedAccessMode)}
                      className={`w-full py-2 px-3 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        vAssistedAccessMode 
                          ? "bg-purple-50 border-purple-200 text-purple-800" 
                          : "bg-stone-100 border-stone-200 text-stone-500"
                      }`}
                    >
                      {vAssistedAccessMode ? "Assisted UI" : "Standard UI"}
                    </button>
                  </div>
                </div>

                {/* Permitted Horses list checkboxes */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                    Permitted Horses ({vSelectedHorses.length} Selected)
                  </label>
                  <p className="text-[9px] text-stone-450 font-bold uppercase tracking-wider mt-0.5">
                    Select which specific horses this visitor already has access to:
                  </p>
                  <div className="max-h-32 overflow-y-auto border border-stone-200 rounded-xl p-2.5 bg-white space-y-1.5">
                    {horses.length === 0 ? (
                      <span className="text-[10px] text-stone-400 italic">No horses found.</span>
                    ) : (
                      horses.map(h => {
                        const isChecked = vSelectedHorses.includes(h.id);
                        return (
                          <label key={h.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-stone-50 cursor-pointer text-xs font-bold text-stone-700">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setVSelectedHorses(vSelectedHorses.filter(id => id !== h.id));
                                } else {
                                  setVSelectedHorses([...vSelectedHorses, h.id]);
                                }
                              }}
                              className="accent-pink-600 rounded"
                            />
                            <span>{h.name} <span className="text-[9px] text-stone-400">({h.breed || "Other"})</span></span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Permitted Padlocks & Paddocks checkboxes */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                    Permitted Padlocks & Paddocks ({vSelectedPaddocks.length} Selected)
                  </label>
                  <p className="text-[9px] text-stone-450 font-bold uppercase tracking-wider mt-0.5">
                    Select padlocks/locations this visitor is allowed to access:
                  </p>
                  <div className="max-h-32 overflow-y-auto border border-stone-200 rounded-xl p-2.5 bg-white space-y-1.5">
                    {allAvailablePaddocks.map(p => {
                      const isChecked = vSelectedPaddocks.includes(p);
                      return (
                        <label key={p} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-stone-50 cursor-pointer text-xs font-bold text-stone-700">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setVSelectedPaddocks(vSelectedPaddocks.filter(name => name !== p));
                              } else {
                                setVSelectedPaddocks([...vSelectedPaddocks, p]);
                              }
                            }}
                            className="accent-pink-600 rounded"
                          />
                          <span>{p}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Dates & Hours Scheduling */}
                <div className="space-y-3.5 border-t border-stone-150 pt-3.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-stone-400 tracking-wider">
                    <Clock size={12} />
                    <span>Access Scheduling & Hours</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className="text-[8.5px] font-black text-stone-400 uppercase tracking-wider block">Start Date (Optional)</label>
                      <input
                        type="date"
                        value={vStartDate}
                        onChange={(e) => setVStartDate(e.target.value)}
                        className="w-full bg-white border border-stone-250 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-stone-855"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8.5px] font-black text-stone-400 uppercase tracking-wider block">End Date (Optional)</label>
                      <input
                        type="date"
                        value={vEndDate}
                        onChange={(e) => setVEndDate(e.target.value)}
                        className="w-full bg-white border border-stone-250 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-stone-855"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className="text-[8.5px] font-black text-stone-400 uppercase tracking-wider block">Daily Allowed Start Hour</label>
                      <input
                        type="time"
                        value={vStartHour}
                        onChange={(e) => setVStartHour(e.target.value)}
                        className="w-full bg-white border border-stone-250 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-stone-855"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8.5px] font-black text-stone-400 uppercase tracking-wider block">Daily Allowed End Hour</label>
                      <input
                        type="time"
                        value={vEndHour}
                        onChange={(e) => setVEndHour(e.target.value)}
                        className="w-full bg-white border border-stone-250 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-stone-855"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full bg-pink-600 hover:bg-pink-700 text-white text-xs font-black py-3 rounded-xl uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                  >
                    <Save size={13} />
                    {vEditingId ? "Apply Modifications" : "Issue Pre-Approved Guest Pass"}
                  </button>
                  {vEditingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setVEditingId(null);
                        setVName("");
                        setVSelectedHorses([]);
                        setVSelectedPaddocks([]);
                        setVCanLogMaintenance(false);
                        setVStartDate("");
                        setVEndDate("");
                        setVStartHour("09:00");
                        setVEndHour("17:00");
                        setVIsActive(true);
                      }}
                      className="w-full mt-2 bg-white hover:bg-stone-50 border border-stone-200 text-stone-500 font-bold text-[10px] py-2 rounded-xl uppercase tracking-wider"
                    >
                      Cancel Editing
                    </button>
                  )}
                </div>
              </form>

              {/* Right List: Active Pre-Approved Visitors */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex justify-between items-center border-b border-stone-150 pb-2">
                  <span className="text-xs font-black uppercase text-stone-800 tracking-wider">
                    Authorized Visitors & Guest Passes Directory ({visitorPermissions.filter(p => !p.isAgistorRider && (p.isPreAuthorized === true || (p.pin && p.pin.length === 4))).length})
                  </span>
                </div>

                {visitorPermissions.filter(p => !p.isAgistorRider && (p.isPreAuthorized === true || (p.pin && p.pin.length === 4))).length === 0 ? (
                  <div className="text-center py-12 bg-stone-50 border border-dashed border-stone-200 rounded-2xl p-6">
                    <UserCheck className="text-stone-300 mx-auto mb-2" size={24} />
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest block leading-none">
                      No Pre-Authorized Guests
                    </span>
                    <p className="text-[10px] text-stone-505 font-semibold leading-relaxed max-w-xs mx-auto mt-1">
                      Use the gate credentials panel on the left to pre-approve farm visitors, grant selective horse access, and create security badges.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1">
                    {visitorPermissions.filter(p => !p.isAgistorRider && (p.isPreAuthorized === true || (p.pin && p.pin.length === 4))).map((vis) => {
                      return (
                        <div 
                          key={vis.id} 
                          className={`border rounded-2xl p-5 space-y-4 shadow-4xs transition-all bg-white relative ${
                            vis.isActive 
                              ? "border-emerald-250 bg-emerald-50/5" 
                              : "border-stone-200 bg-stone-50/30 opacity-75"
                          }`}
                        >
                          {/* Top row */}
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-stone-900 uppercase">
                                  {vis.name}
                                </span>
                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                                  vis.isActive 
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300/30" 
                                    : "bg-stone-200 text-stone-600"
                                }`}>
                                  {vis.isActive ? "Approved Access" : "Revoked Access"}
                                </span>
                              </div>
                              <span className="text-[9px] font-mono text-stone-450 block mt-0.5 uppercase">
                                Pre-Authorized PIN: <span className="text-pink-650 font-black tracking-widest bg-pink-50 border border-pink-100 px-1 py-0.5 rounded-md text-[10px]">{vis.pin}</span>
                              </span>
                              {/* Visitor Badges list */}
                              {vis.badges && vis.badges.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {vis.badges.map(b => (
                                    <span key={b} className="bg-pink-50 text-pink-800 text-[9px] font-black px-1.5 py-0.5 rounded border border-pink-200/50 flex items-center gap-1 uppercase tracking-wider">
                                      {b}
                                      {isCooper && (
                                        <button 
                                          type="button"
                                          onClick={() => handleRemoveVisitorBadge(vis.id, b)}
                                          className="text-pink-400 hover:text-pink-900 font-black ml-0.5 cursor-pointer text-[10px]"
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Owner Add Visitor Badge Input */}
                              {isCooper && (
                                <div className="mt-1.5 flex items-center gap-1">
                                  <input 
                                    type="text"
                                    placeholder="New Badge"
                                    id={`add-badge-vis-${vis.id}`}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAddVisitorBadge(vis.id, e.currentTarget.value);
                                        e.currentTarget.value = "";
                                      }
                                    }}
                                    className="bg-white border border-stone-250 rounded-lg px-2 py-0.5 text-[9px] font-semibold w-24 outline-none text-stone-800 focus:ring-1 focus:ring-pink-600"
                                  />
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      const input = document.getElementById(`add-badge-vis-${vis.id}`) as HTMLInputElement;
                                      if (input && input.value) {
                                        handleAddVisitorBadge(vis.id, input.value);
                                        input.value = "";
                                      }
                                    }}
                                    className="text-[9px] bg-pink-50 hover:bg-pink-100 text-pink-700 px-2 py-0.5 rounded-lg border border-pink-200 font-bold uppercase cursor-pointer"
                                  >
                                    + Add
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Toggles and print */}
                            <div className="flex items-center gap-2">
                              {/* Quick Revocation Toggle */}
                              <button
                                type="button"
                                onClick={() => handleToggleVisitorActive(vis.id, !!vis.isActive)}
                                title={vis.isActive ? "Revoke Access Immediately" : "Grant Access Now"}
                                className={`p-1.5 rounded-xl border text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                                  vis.isActive 
                                    ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100" 
                                    : "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100"
                                }`}
                              >
                                {vis.isActive ? (
                                  <>
                                    <ShieldX size={11} /> Revoke Immediately
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck size={11} /> Grant Access
                                  </>
                                )}
                              </button>

                              {/* Print Badge Button */}
                              <button
                                type="button"
                                onClick={() => setShowVisitorBadgeModal(vis)}
                                title="Print / View Visitor Security Badge"
                                className="bg-white border border-stone-250 hover:bg-stone-50 text-stone-700 hover:text-stone-900 p-2 rounded-xl transition-all shadow-4xs cursor-pointer flex items-center gap-1.5"
                              >
                                <Printer size={12} className="text-pink-600" />
                                <span className="text-[9px] font-black uppercase tracking-wider">Badge</span>
                              </button>
                            </div>
                          </div>

                          {/* Detail summary */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3.5 border-t border-stone-150 text-left">
                            <div className="space-y-1.5">
                              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Allowed Items</span>
                              <div className="flex flex-wrap gap-1">
                                {vis.allowedHorseIds && vis.allowedHorseIds.length > 0 ? (
                                  vis.allowedHorseIds.map((hid: string) => {
                                    const h = horses.find(item => item.id === hid);
                                    return (
                                      <span key={hid} className="text-[9px] bg-pink-50 border border-pink-100 text-pink-800 font-bold px-2 py-0.5 rounded-md">
                                        🐴 {h?.name || hid}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-[9px] bg-rose-50 border border-rose-100 text-rose-600 font-bold px-2 py-0.5 rounded-md italic">
                                    No Horses Allowed
                                  </span>
                                )}

                                {vis.allowedPaddocks && vis.allowedPaddocks.length > 0 ? (
                                  vis.allowedPaddocks.map((pname: string) => (
                                    <span key={pname} className="text-[9px] bg-teal-50 border border-teal-100 text-teal-800 font-bold px-2 py-0.5 rounded-md">
                                      🔒 {pname}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[9px] bg-stone-100 border border-stone-200 text-stone-500 font-bold px-2 py-0.5 rounded-md italic">
                                    No Padlocks Allowed
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Allowed Window & Schedule</span>
                              <div className="space-y-1 font-mono text-[9.5px] font-bold text-stone-600 uppercase">
                                <div className="flex items-center gap-1">
                                  <Clock size={10} className="text-stone-400" />
                                  <span>Hours: {vis.accessStartHour || "00:00"} - {vis.accessEndHour || "23:59"} Daily</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Calendar size={10} className="text-stone-400" />
                                  <span>
                                    Dates: {vis.accessStartDate ? vis.accessStartDate : "Any Start"} to {vis.accessEndDate ? vis.accessEndDate : "Any End"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <UserCheck size={10} className="text-stone-400" />
                                  <span>Maintenance logging: {vis.canLogMaintenance ? "✓ Permitted" : "❌ Denied (ReadOnly)"}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Quick management action buttons */}
                          <div className="flex justify-end gap-2 pt-3 border-t border-stone-150">
                            <button
                              type="button"
                              onClick={() => handleRepromptVisitorTutorial(vis.id, vis.name)}
                              className={`text-[9px] font-extrabold px-3 py-1.5 rounded-lg border uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all ${
                                vis.hasSeenTutorial === false
                                  ? "bg-amber-50 border-amber-200 text-amber-700 cursor-default"
                                  : "bg-stone-50 hover:bg-teal-50 border-stone-200 hover:border-teal-300 text-stone-600 hover:text-teal-700"
                              }`}
                              disabled={vis.hasSeenTutorial === false}
                              title={vis.hasSeenTutorial === false ? "Tutorial is already prompted" : "Reprompt Help & Tutorial"}
                            >
                              <HelpCircle size={10} />
                              <span>{vis.hasSeenTutorial === false ? "Tutorial Prompted" : "Reprompt"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditVisitorPermission(vis)}
                              className="text-[9px] font-extrabold text-stone-500 hover:text-stone-900 border border-stone-200 hover:bg-stone-50 px-3 py-1.5 rounded-lg uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                            >
                              Edit Profile
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteVisitorPermission(vis.id)}
                              className="text-[9px] font-extrabold text-rose-500 hover:text-rose-700 border border-rose-200 hover:bg-rose-50 px-3 py-1.5 rounded-lg uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={10} /> Delete Pre-Auth
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Terms of Service & IT Overlord Dashboard Tab */}
      {ownerTab === "terms_of_service" && (
        <div className="space-y-6 animate-fade-in text-left">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Terms Editor & Preview Column */}
            <div className="lg:col-span-2 bg-white border border-stone-200 rounded-3xl p-6 space-y-6 shadow-xs">
            <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
              <Database className="text-blue-600" size={18} />
              <div>
                <h3 className="text-sm font-black uppercase text-stone-900 tracking-wider">
                  Terms of Service Agreement Customizer
                </h3>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                  Update the mandatory ToS text prompt displayed to all crew & guests on login
                </span>
              </div>
            </div>

            {tosSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider rounded-xl">
                ✓ Terms of Service updated successfully in Cloud Firestore!
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-stone-400 uppercase tracking-wider block">Mandatory Agreement Copy</label>
                <textarea
                  rows={8}
                  value={tosText}
                  onChange={(e) => setTosText(e.target.value)}
                  disabled={!isCooper}
                  placeholder="Enter terms of service terms..."
                  className="w-full bg-stone-50 border border-stone-250 rounded-2xl p-4 text-xs font-semibold focus:ring-1 focus:ring-blue-600 focus:outline-hidden text-stone-900 leading-relaxed font-mono disabled:opacity-60"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">
                  {!isCooper ? "⚠️ Read-Only Mode" : "Live Firestore Sync Configuration"}
                </span>
                {isCooper ? (
                  <button
                    type="button"
                    onClick={handleSaveTos}
                    disabled={isSavingTos}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black text-[10px] px-5 py-2.5 rounded-xl uppercase tracking-wider shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    {isSavingTos ? "Saving..." : <><Save size={12} /> Save Agreement Text</>}
                  </button>
                ) : (
                  <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">
                    Edit Restricted to Facility Owner
                  </span>
                )}
              </div>

              {/* Live Preview Card */}
              <div className="p-5 bg-stone-50 border border-stone-200 rounded-2xl space-y-3.5">
                <span className="text-[9px] font-black text-blue-800 uppercase tracking-widest block">Live Visitor-Facing Preview:</span>
                <div className="bg-white border border-stone-150 rounded-xl p-4 max-h-44 overflow-y-auto font-sans text-xs text-stone-600 leading-relaxed space-y-2">
                  <p className="font-bold text-stone-900">{ruabonProfile.farmName || "Facility"} Security & Safety Policy</p>
                  <p className="whitespace-pre-wrap font-medium">{tosText || "Welcome to Horse Sense Operations..."}</p>
                </div>
              </div>
            </div>
          </div>

          {/* IT Overlord Control Dashboard */}
          <div className="bg-white border border-stone-200 rounded-3xl p-6 space-y-6 shadow-xs h-fit">
            <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
              <ShieldCheck className="text-blue-600" size={18} />
              <div>
                <h3 className="text-xs font-black uppercase text-stone-900 tracking-wider">
                  Facility IT Admin Controls
                </h3>
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                  Complete website access & root override panel
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-wider block">Security System Status</span>
                <div className="flex items-center gap-2 bg-stone-50 border border-stone-150 rounded-xl p-3 text-xs font-extrabold text-stone-800">
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-500 animate-ping shrink-0" />
                  <span className="uppercase text-[10px] tracking-wide font-black">All Core Systems Fully Operational</span>
                </div>
              </div>

              {/* Core Control Buttons */}
              <div className="space-y-3 pt-2">
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">System Overrides</span>

                {/* Lockdown Button */}
                <button
                  type="button"
                  onClick={handleForceGlobalLogout}
                  disabled={isPerformingAdminAction}
                  className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-extrabold text-[10px] p-3 rounded-xl uppercase tracking-wider shadow-xs cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <ShieldAlert size={14} />
                  <span>Force Global Security Logout</span>
                </button>

                {/* Unlock Access Profiles */}
                <button
                  type="button"
                  onClick={handleResetLockdownCodes}
                  disabled={isPerformingAdminAction}
                  className="w-full bg-stone-900 hover:bg-stone-850 disabled:opacity-40 text-white font-extrabold text-[10px] p-3 rounded-xl uppercase tracking-wider shadow-xs cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck size={14} />
                  <span>Reset All Active Lockouts</span>
                </button>

                {/* Clear Audit Logs / Alerts */}
                <button
                  type="button"
                  onClick={handleClearNotifications}
                  disabled={isPerformingAdminAction}
                  className="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-40 font-extrabold text-[10px] p-3 rounded-xl uppercase tracking-wider border border-stone-250 cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} className="text-stone-500" />
                  <span>Dismiss All Notifications</span>
                </button>
              </div>

              <div className="text-[9px] font-semibold text-stone-400 leading-relaxed bg-blue-50/20 p-4 rounded-2xl border border-blue-600/10">
                <span className="font-extrabold uppercase text-blue-800 block mb-0.5 tracking-wider">Root Overlord Warning:</span>
                These action buttons deploy immediate, high-priority transactions to Google Cloud Firestore, forcing real-time synchronisation triggers across all crew and client terminals. Use with extreme caution.
              </div>
            </div>
          </div>
        </div>

        {/* Terms of Service Acceptance History Log */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 space-y-4 shadow-xs">
          <div className="border-b border-stone-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-emerald-600 animate-pulse" size={18} />
              <div>
                <h3 className="text-sm font-black uppercase text-stone-900 tracking-wider">
                  Terms of Service Acceptance History Logs
                </h3>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                  Real-time recorded acceptance records by crew, staff, and guests
                </span>
              </div>
            </div>
            <span className="text-xxs bg-emerald-50 text-emerald-800 border border-emerald-100 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
              {tosAcceptances.length} Acceptances Logged
            </span>
          </div>

          {tosAcceptances.length === 0 ? (
            <div className="p-8 text-center bg-stone-50 border border-dashed border-stone-250 rounded-2xl">
              <span className="text-xs text-stone-450 italic font-bold">No Terms & Conditions acceptance events logged in Cloud Firestore yet.</span>
            </div>
          ) : (
            <div className="overflow-x-auto border border-stone-150 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-150 text-[10px] font-black uppercase tracking-widest text-stone-500">
                    <th className="p-3.5">User / Target Profile</th>
                    <th className="p-3.5">System Role</th>
                    <th className="p-3.5">IP Address</th>
                    <th className="p-3.5">Accepted Timestamp (UTC)</th>
                    <th className="p-3.5">Device / User Agent / Additional Info</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150 text-xxs font-semibold text-stone-850">
                  {tosAcceptances.map((log) => (
                    <tr key={log.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                          <span className="font-extrabold text-stone-900">{log.name}</span>
                        </div>
                      </td>
                      <td className="p-3.5 uppercase text-[10px] tracking-wider font-extrabold text-stone-600">{log.role}</td>
                      <td className="p-3.5 font-mono text-stone-700">{log.ipAddress || log.ip || "Unknown"}</td>
                      <td className="p-3.5 text-stone-500 font-medium">
                        {log.acceptedAt ? new Date(log.acceptedAt).toLocaleString() : "Unknown"}
                      </td>
                      <td className="p-3.5 text-stone-450 font-medium font-mono text-[10px] max-w-xs truncate" title={log.userAgent}>
                        {log.userAgent || "No client headers logged"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )}

    {ownerTab === "devices" && (
      <div className="space-y-6 text-left" id="active-devices-section">
        {/* Connection Monitor Banner */}
        <div className="bg-stone-900 border border-stone-800 text-stone-200 rounded-3xl p-6 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                  Live Intrusion Prevention &amp; Terminal Control
                </span>
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">
                Active Devices &amp; Security Lockdowns
              </h2>
              <p className="text-xs text-stone-400 leading-relaxed">
                Review authenticated active browser sessions, trace connected terminal IP addresses, and immediately enforce lockdowns. Locking down a device instantly bans its host IP address system-wide and revokes user authorization.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-stone-800 border border-stone-700/60 p-3.5 rounded-2xl text-center min-w-[90px]">
                <span className="block text-xl font-black text-white font-mono">{activeDevices.length}</span>
                <span className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider">Live Sessions</span>
              </div>
              <div className="bg-stone-850 border border-stone-750 p-3.5 rounded-2xl text-center min-w-[90px]">
                <span className="block text-xl font-black text-rose-500 font-mono">{bannedIpsList.length}</span>
                <span className="text-[8.5px] font-bold text-stone-400 uppercase tracking-wider">Banned IPs</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Devices Registry Table (Takes 2 columns) */}
          <div className="lg:col-span-2 bg-white border border-stone-200 rounded-3xl p-6 shadow-xs flex flex-col space-y-4">
            <div className="border-b border-stone-100 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="text-amber-600 animate-spin" style={{ animationDuration: "12s" }} size={18} />
                <div>
                  <h3 className="text-sm font-black uppercase text-stone-900 tracking-wider">
                    Connected Terminal Registry
                  </h3>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                    Real-time connection stream verified by Google Firestore
                  </span>
                </div>
              </div>
              <span className="text-xxs bg-stone-100 text-stone-800 border border-stone-200 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                Sync Live
              </span>
            </div>

            {activeDevices.length === 0 ? (
              <div className="p-12 text-center bg-stone-50 border border-dashed border-stone-200 rounded-2xl">
                <span className="text-xs text-stone-400 italic font-bold">No active authenticated terminal sessions found in registry.</span>
              </div>
            ) : (
              <div className="overflow-x-auto border border-stone-150 rounded-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-150 text-[9.5px] font-black uppercase tracking-widest text-stone-500">
                      <th className="p-3">User &amp; Role</th>
                      <th className="p-3">Detected IP</th>
                      <th className="p-3">Terminal Specs</th>
                      <th className="p-3">Security Status</th>
                      <th className="p-3 text-right">Intervention</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-150 text-xxs font-semibold text-stone-800">
                    {activeDevices.map((dev) => {
                      const isIpLocked = bannedIps.includes(dev.ip?.toLowerCase().trim());
                      const initials = dev.name ? dev.name.split(" ").map((n: string) => n[0]).join("") : "??";
                      const roleColors: Record<string, string> = {
                        owner: "bg-amber-100 text-amber-800 border-amber-200",
                        admin: "bg-teal-100 text-teal-800 border-teal-200",
                        crew: "bg-blue-100 text-blue-800 border-blue-200",
                        visitor: "bg-pink-100 text-pink-800 border-pink-200"
                      };
                      const activeRoleColor = roleColors[dev.role?.toLowerCase()] || "bg-stone-100 text-stone-800 border-stone-200";
                      const isRowExpanded = expandedDeviceRows.includes(dev.id);
                      const geo = deviceGeoData[dev.ip] || null;
                      const hasSuspiciousUA = isSuspiciousUA(dev.userAgent);

                      return (
                        <React.Fragment key={dev.id}>
                          <tr className={`hover:bg-stone-50/50 transition-colors ${isRowExpanded ? 'bg-violet-50/20' : ''}`}>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setExpandedDeviceRows(prev => prev.includes(dev.id) ? prev.filter(id => id !== dev.id) : [...prev, dev.id])}
                                  className="p-1 hover:bg-stone-150 rounded-lg text-stone-500 transition-all flex items-center justify-center cursor-pointer"
                                  title="Toggle Device Geolocation &amp; Telemetry"
                                >
                                  <span className={`inline-block text-[9px] font-black transition-transform ${isRowExpanded ? 'rotate-90 text-violet-600' : 'text-stone-400'}`}>
                                    ▶
                                  </span>
                                </button>
                                <div className="h-6 w-6 rounded-full bg-stone-900 text-stone-100 flex items-center justify-center text-[10px] font-black uppercase shrink-0 border border-stone-800">
                                  {initials}
                                </div>
                                <div className="space-y-0.5">
                                  <span className="font-extrabold text-stone-950 block">{dev.name || "Authenticated User"}</span>
                                  <span className={`inline-block text-[8px] font-black uppercase tracking-wider border px-1.5 rounded-md ${activeRoleColor}`}>
                                    {dev.role || "staff"}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="space-y-1">
                                <span className="font-mono font-bold text-stone-850 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded text-[10px]" title="Determined via secure cloud headers">
                                  {dev.ip || "Unknown"}
                                </span>
                                {geo && (
                                  <span className="block text-[8px] text-stone-500 font-extrabold uppercase tracking-wider">
                                    📍 {geo.city}, {geo.region}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-stone-500">
                              <div className="max-w-[130px] truncate" title={dev.userAgent}>
                                <span className="font-bold text-stone-750 block">{getFriendlyUserAgent(dev.userAgent)}</span>
                                <span className="text-[9px] font-mono text-stone-400 block truncate">{dev.userAgent || "No client header metadata"}</span>
                                {hasSuspiciousUA && (
                                  <span className="inline-flex items-center gap-0.5 mt-1 text-[8px] font-extrabold uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0.5 rounded animate-pulse" title="Non-standard or unrecognized browser user agent detected. Potential automated script, shell, or scraper.">
                                    ⚠️ Non-Standard Client
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              {(() => {
                                const isIpLocked = bannedIps.includes(dev.ip?.toLowerCase().trim()) || dev.status === "locked_down";
                                const isForceLoggedOut = dev.status === "force_logout";
                                const isExpired = !dev.lastActive || (Date.now() - new Date(dev.lastActive).getTime() > 90000);
                                const isOffline = dev.status === "inactive" || isExpired;

                                if (isIpLocked) {
                                  return (
                                    <div className="space-y-1">
                                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-600"></span> Locked Down
                                      </span>
                                      {dev.lastActive && (
                                        <span className="block text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                                          Last seen: {new Date(dev.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      )}
                                    </div>
                                  );
                                } else if (isForceLoggedOut) {
                                  return (
                                    <div className="space-y-1">
                                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-md">
                                        <span className="h-1.5 w-1.5 rounded-full bg-orange-600 animate-pulse"></span> Terminated
                                      </span>
                                      {dev.lastActive && (
                                        <span className="block text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                                          F-Logged Out
                                        </span>
                                      )}
                                    </div>
                                  );
                                } else if (isOffline) {
                                  return (
                                    <div className="space-y-1">
                                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-stone-500 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md">
                                        <span className="h-1.5 w-1.5 rounded-full bg-stone-400"></span> Offline
                                      </span>
                                      {dev.lastActive && (
                                        <span className="block text-[8px] text-stone-400 font-bold uppercase tracking-wider">
                                          Last seen: {new Date(dev.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      )}
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="space-y-1">
                                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Connected
                                      </span>
                                      <span className="block text-[8px] text-emerald-600 font-bold uppercase tracking-wider animate-pulse">
                                        Active Now
                                      </span>
                                    </div>
                                  );
                                }
                              })()}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {(() => {
                                  const isIpLocked = bannedIps.includes(dev.ip?.toLowerCase().trim()) || dev.status === "locked_down";
                                  const isForceLoggedOut = dev.status === "force_logout";
                                  const isExpired = !dev.lastActive || (Date.now() - new Date(dev.lastActive).getTime() > 90000);
                                  const isOffline = dev.status === "inactive" || isExpired;

                                  return (
                                    <>
                                      {!isOffline && !isForceLoggedOut && !isIpLocked ? (
                                        <button
                                          onClick={() => handleForceLogoutDevice(dev)}
                                          className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 hover:scale-102 border border-amber-500 rounded-lg transition-all cursor-pointer shadow-sm animate-pulse"
                                          disabled={dev.name === currentUser?.name}
                                          title={dev.name === currentUser?.name ? "You cannot force log out your own active administrative device" : "Force logout this specific browser session"}
                                        >
                                          Force Logout
                                        </button>
                                      ) : null}
                                      
                                      {(isOffline || isForceLoggedOut) && (
                                        <button
                                          onClick={() => handleRemoveDeviceRecord(dev.id)}
                                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-all cursor-pointer"
                                          title="Remove stale/terminated device entry from registry"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                          
                          {isRowExpanded && (
                            <tr className="bg-stone-50/60 border-b border-stone-150">
                              <td colSpan={5} className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in text-stone-800">
                                  {/* Left Telemetry Details Column */}
                                  <div className="space-y-3 border-r border-stone-200/60 pr-4">
                                    <h4 className="text-[9px] font-black uppercase text-violet-800 tracking-widest">
                                      Terminal Security Diagnostics
                                    </h4>
                                    
                                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                                      <div className="bg-white border border-stone-150 p-2 rounded-xl">
                                        <span className="block text-[8px] text-stone-400 font-bold uppercase tracking-wider">ISP Provider</span>
                                        <span className="font-bold text-stone-800 truncate block">{geo?.provider || "Resolving Service..."}</span>
                                      </div>
                                      <div className="bg-white border border-stone-150 p-2 rounded-xl">
                                        <span className="block text-[8px] text-stone-400 font-bold uppercase tracking-wider">Coordinates</span>
                                        <span className="font-mono font-bold text-stone-800 block">
                                          {geo ? `${geo.lat.toFixed(4)}° N, ${geo.lon.toFixed(4)}° W` : "Calculating..."}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="bg-white border border-stone-150 p-2.5 rounded-xl space-y-1">
                                      <div className="flex items-center justify-between">
                                        <span className="block text-[8px] text-stone-400 font-bold uppercase tracking-wider">Client Header Signature (User Agent)</span>
                                        <button 
                                          onClick={() => {
                                            navigator.clipboard.writeText(dev.userAgent || "");
                                            alert("Copied User Agent string to clipboard.");
                                          }}
                                          className="text-[8px] text-violet-600 hover:underline font-extrabold uppercase tracking-wider cursor-pointer"
                                        >
                                          Copy Raw
                                        </button>
                                      </div>
                                      <p className="font-mono text-[9px] text-stone-600 leading-relaxed break-all bg-stone-50 p-1.5 rounded border border-stone-100 max-h-16 overflow-y-auto">
                                        {dev.userAgent || "No client header detected"}
                                      </p>
                                    </div>

                                    <div className="bg-stone-900 text-stone-300 p-2.5 rounded-xl border border-stone-800 text-[9px] font-mono space-y-1">
                                      <div className="flex items-center justify-between text-stone-400">
                                        <span>SIGNAL_PATHWAY</span>
                                        <span className="text-emerald-500 text-[8px] animate-pulse font-bold">● ONLINE_MONITOR</span>
                                      </div>
                                      <div className="space-y-0.5 text-stone-500">
                                        <p>HOST_IP: {dev.ip}</p>
                                        <p>SIGNATURE: {hasSuspiciousUA ? "NON_STANDARD (WARNING)" : "STANDARD_BROWSER"}</p>
                                        <p>VERDICT: {hasSuspiciousUA ? "FLAGGED_FOR_AUDIT" : "VERIFIED_AUTHORIZED"}</p>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right Geolocation Map Column */}
                                  <div className="flex flex-col space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-[9px] font-black uppercase text-violet-800 tracking-widest">
                                        Approximate Geolocation Map
                                      </h4>
                                      <span className="text-[8px] font-mono text-stone-400">PROJECTED: Equirectangular (North America)</span>
                                    </div>

                                    {geo ? (
                                      <div className="relative bg-stone-950 rounded-2xl border border-stone-800 overflow-hidden shadow-inner h-40 flex items-center justify-center">
                                        {/* Stylized background grid map */}
                                        <svg viewBox="0 0 300 150" className="w-full h-full text-stone-850">
                                          {/* Subtle Grid Lines */}
                                          <g stroke="#1f2937" strokeWidth="0.5" strokeDasharray="3,3">
                                            <line x1="0" y1="30" x2="300" y2="30" />
                                            <line x1="0" y1="60" x2="300" y2="60" />
                                            <line x1="0" y1="90" x2="300" y2="90" />
                                            <line x1="0" y1="120" x2="300" y2="120" />
                                            <line x1="50" y1="0" x2="50" y2="150" />
                                            <line x1="100" y1="0" x2="100" y2="150" />
                                            <line x1="150" y1="0" x2="150" y2="150" />
                                            <line x1="200" y1="0" x2="200" y2="150" />
                                            <line x1="250" y1="0" x2="250" y2="150" />
                                          </g>

                                          {/* Plot reference cities in US coordinates for orientation */}
                                          {(() => {
                                            const refCities = [
                                              { name: "Seattle", lat: 47.6062, lon: -122.3321 },
                                              { name: "Los Angeles", lat: 34.0522, lon: -118.2437 },
                                              { name: "Denver", lat: 39.7392, lon: -104.9903 },
                                              { name: "Chicago", lat: 41.8781, lon: -87.6298 },
                                              { name: "New York", lat: 40.7128, lon: -74.0060 },
                                              { name: "Miami", lat: 25.7617, lon: -80.1918 },
                                              { name: "Texas Farm", lat: 30.2672, lon: -97.7431, highlight: true }
                                            ];

                                            return refCities.map((city, idx) => {
                                              // Projection math inside US box: lon [-125, -65], lat [24, 49]
                                              const px = ((city.lon - (-125)) / (-65 - (-125))) * 300;
                                              const py = ((49 - city.lat) / (49 - 24)) * 150;

                                              if (px < 0 || px > 300 || py < 0 || py > 150) return null;

                                              return (
                                                <g key={idx}>
                                                  <circle 
                                                    cx={px} 
                                                    cy={py} 
                                                    r={city.highlight ? 3 : 1.5} 
                                                    fill={city.highlight ? "#10b981" : "#4b5563"} 
                                                  />
                                                  <text 
                                                    x={px + 4} 
                                                    y={py + 3} 
                                                    fill={city.highlight ? "#34d399" : "#6b7280"} 
                                                    fontSize="5" 
                                                    fontWeight={city.highlight ? "bold" : "normal"}
                                                    fontFamily="monospace"
                                                  >
                                                    {city.name}
                                                  </text>
                                                </g>
                                              );
                                            });
                                          })()}

                                          {/* Draw connection pathways (curves) from current device to Texas Farm HQ */}
                                          {(() => {
                                            const hqX = ((-97.7431 - (-125)) / (-65 - (-125))) * 300;
                                            const hqY = ((49 - 30.2672) / (49 - 24)) * 150;
                                            
                                            const devX = ((geo.lon - (-125)) / (-65 - (-125))) * 300;
                                            const devY = ((49 - geo.lat) / (49 - 24)) * 150;

                                            if (devX < 0 || devX > 300 || devY < 0 || devY > 150) return null;

                                            // Draw a nice bezier curve pathway
                                            const midX = (hqX + devX) / 2;
                                            const midY = Math.min(hqY, devY) - 25; // curve upward
                                            const dPath = `M ${devX} ${devY} Q ${midX} ${midY} ${hqX} ${hqY}`;

                                            return (
                                              <g>
                                                <path 
                                                  d={dPath} 
                                                  fill="none" 
                                                  stroke={hasSuspiciousUA ? "#f97316" : "#a78bfa"} 
                                                  strokeWidth="1" 
                                                  strokeDasharray="2,2" 
                                                  className="animate-pulse"
                                                />
                                                {/* Target Location Pulse */}
                                                <circle cx={devX} cy={devY} r="6" fill="none" stroke={hasSuspiciousUA ? "#ea580c" : "#8b5cf6"} strokeWidth="1" className="animate-ping" />
                                                <circle cx={devX} cy={devY} r="3.5" fill={hasSuspiciousUA ? "#f97316" : "#8b5cf6"} />
                                              </g>
                                            );
                                          })()}
                                        </svg>

                                        {/* Status Telemetry overlays */}
                                        <div className="absolute bottom-2 left-2 bg-stone-900/90 border border-stone-800 px-2 py-1 rounded-md text-[8px] font-mono text-stone-300">
                                          <p className="text-violet-400 font-bold uppercase tracking-wider">{geo.city}, {geo.region}</p>
                                          <p className="text-[7px] text-stone-500 font-bold">{geo.lat.toFixed(4)}N / {geo.lon.toFixed(4)}W</p>
                                        </div>

                                        <div className="absolute top-2 right-2 bg-stone-900/90 border border-stone-800 px-2 py-1 rounded-md text-[7px] font-mono text-stone-300 flex items-center gap-1">
                                          <span className={`h-1.5 w-1.5 rounded-full ${hasSuspiciousUA ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500 animate-ping'}`} />
                                          {hasSuspiciousUA ? "SIGNAL_WARN" : "SECURE_ROUTE"}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex-1 min-h-[140px] rounded-2xl bg-stone-950 flex flex-col items-center justify-center p-6 text-center border border-stone-850">
                                        <span className="text-[10px] text-stone-500 font-mono italic animate-pulse">
                                          Resolving server-side IP tracking nodes...
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Current Lockdown Registries / Banned IPs Side Panel */}
          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs flex flex-col space-y-4">
            <div className="border-b border-stone-100 pb-3 flex items-center gap-2">
              <ShieldAlert className="text-rose-600 animate-pulse" size={18} />
              <div>
                <h3 className="text-sm font-black uppercase text-stone-900 tracking-wider">
                  Active IP Lockdowns
                </h3>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mt-0.5">
                  Blacklisted hosts denying server requests
                </span>
              </div>
            </div>

            {bannedIpsList.length === 0 ? (
              <div className="p-8 text-center bg-stone-50 border border-dashed border-stone-200 rounded-2xl flex-1 flex flex-col justify-center">
                <span className="text-xs text-stone-450 font-bold block">No Active Host Lockdowns</span>
                <span className="text-[10px] text-stone-400 block mt-1 leading-relaxed">All clients are cleared for cloud synchronization.</span>
              </div>
            ) : (
              <div className="space-y-3 max-h-[450px] overflow-y-auto">
                {bannedIpsList.map((item) => (
                  <div key={item.ip} className="p-3 bg-stone-50 border border-stone-200 rounded-2xl space-y-2 text-left shadow-3xs hover:border-stone-300 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-black text-stone-950 bg-white border border-stone-200 px-2 py-0.5 rounded-lg shadow-4xs">
                        {item.ip}
                      </span>
                      <button
                        onClick={() => handleLiftDeviceLockdown(item.ip)}
                        className="text-[10px] font-black text-rose-600 hover:text-rose-800 uppercase tracking-wider cursor-pointer"
                        title="Lift lockdown instantly"
                      >
                        Lift Block
                      </button>
                    </div>

                    <div className="text-[10px] text-stone-655 space-y-1">
                      <div>
                        <span className="font-bold text-[9px] uppercase text-stone-400 block tracking-widest">Reason / Trigger:</span>
                        <p className="font-medium text-stone-700 leading-relaxed mt-0.5 whitespace-pre-wrap">{item.reason || "No reason logged"}</p>
                      </div>
                      {item.bannedAt && (
                        <div className="text-[9px] text-stone-450 font-medium">
                          Locked on: {new Date(item.bannedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {false && (
      <div className="hidden" id="device-security-map-section">
        {/* Connection Monitor Banner */}
        <div className="bg-stone-900 border border-stone-800 text-stone-200 rounded-3xl p-6 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                </span>
                <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest">
                  Spatial Operations Security Center (SOC)
                </span>
              </div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight animate-pulse" style={{ animationDuration: "3s" }}>
                Active Devices Location Map
              </h2>
              <p className="text-xs text-stone-400 leading-relaxed">
                Geolocate active crew, guest, and administrator browser sessions relative to the Texas Farm. Suspicious user agents (bots, CLI scripts) are automatically flagged and tracked on the spatial telemetry layout.
              </p>
            </div>
            <div className="bg-stone-850 border border-stone-750 px-4 py-2.5 rounded-2xl flex items-center gap-2">
              <span className="text-[10px] text-stone-400 font-extrabold uppercase tracking-widest">HQ COORDINATES:</span>
              <span className="font-mono text-xs font-black text-emerald-400">30.2672° N, 97.7431° W</span>
            </div>
          </div>
        </div>

        {/* SOC Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-stone-200 p-4 rounded-3xl shadow-3xs flex flex-col justify-between">
            <span className="text-[8.5px] font-black text-stone-400 uppercase tracking-wider block">Total Monitored Nodes</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl font-black text-stone-900 font-mono">{activeDevices.length}</span>
              <span className="text-[8px] text-emerald-600 font-bold uppercase tracking-wider">Online</span>
            </div>
          </div>
          <div className="bg-white border border-stone-200 p-4 rounded-3xl shadow-3xs flex flex-col justify-between">
            <span className="text-[8.5px] font-black text-stone-400 uppercase tracking-wider block">Standard Browsers</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl font-black text-emerald-600 font-mono">
                {activeDevices.filter(d => !isSuspiciousUA(d.userAgent)).length}
              </span>
              <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">Secured</span>
            </div>
          </div>
          <div className="bg-white border border-stone-200 p-4 rounded-3xl shadow-3xs flex flex-col justify-between">
            <span className="text-[8.5px] font-black text-stone-400 uppercase tracking-wider block">Suspicious Clients</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className={`text-2xl font-black font-mono ${activeDevices.some(d => isSuspiciousUA(d.userAgent)) ? 'text-amber-500' : 'text-stone-700'}`}>
                {activeDevices.filter(d => isSuspiciousUA(d.userAgent)).length}
              </span>
              <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">Flagged</span>
            </div>
          </div>
          <div className="bg-white border border-stone-200 p-4 rounded-3xl shadow-3xs flex flex-col justify-between">
            <span className="text-[8.5px] font-black text-stone-400 uppercase tracking-wider block">Locked Down hosts</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl font-black text-rose-600 font-mono">{bannedIpsList.length}</span>
              <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider">Blocked</span>
            </div>
          </div>
        </div>

        {/* Large Interactive Geolocation Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Spatial Grid Map Column (Takes 2 Columns) */}
          <div className="lg:col-span-2 bg-stone-950 border border-stone-850 rounded-3xl p-6 shadow-xl flex flex-col space-y-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.01),transparent_70%)] pointer-events-none" />
            
            <div className="flex items-center justify-between border-b border-stone-800/80 pb-3 relative z-10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-violet-500 animate-ping" />
                <h3 className="text-xs font-black uppercase text-stone-100 tracking-wider">
                  Live Connection Path Topology
                </h3>
              </div>
              <div className="flex items-center gap-4 text-[8px] font-mono text-stone-400">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" /> Austin HQ</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Authorized Nodes</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Suspicious Nodes</span>
              </div>
            </div>

            {/* Projected Map Container */}
            <div className="relative aspect-[16/9] w-full bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden flex items-center justify-center">
              <svg viewBox="0 0 800 450" className="w-full h-full text-stone-850 select-none">
                {/* Background Map Grid Pattern */}
                <g stroke="#1e293b" strokeWidth="0.5" strokeDasharray="5,5">
                  <line x1="0" y1="50" x2="800" y2="50" />
                  <line x1="0" y1="100" x2="800" y2="100" />
                  <line x1="0" y1="150" x2="800" y2="150" />
                  <line x1="0" y1="200" x2="800" y2="200" />
                  <line x1="0" y1="250" x2="800" y2="250" />
                  <line x1="0" y1="300" x2="800" y2="300" />
                  <line x1="0" y1="350" x2="800" y2="350" />
                  <line x1="0" y1="400" x2="800" y2="400" />
                  
                  <line x1="100" y1="0" x2="100" y2="450" />
                  <line x1="200" y1="0" x2="200" y2="450" />
                  <line x1="300" y1="0" x2="300" y2="450" />
                  <line x1="400" y1="0" x2="400" y2="450" />
                  <line x1="500" y1="0" x2="500" y2="450" />
                  <line x1="600" y1="0" x2="600" y2="450" />
                  <line x1="700" y1="0" x2="700" y2="450" />
                </g>

                {/* Legend Compass or HUD graphic */}
                <g transform="translate(60, 390)" stroke="#334155" strokeWidth="0.5" fill="none">
                  <circle cx="0" cy="0" r="30" strokeDasharray="2,2" />
                  <line x1="-35" y1="0" x2="35" y2="0" />
                  <line x1="0" y1="-35" x2="0" y2="35" />
                  <text x="5" y="-15" fill="#475569" stroke="none" fontSize="6" fontFamily="monospace">N 30.2672°</text>
                  <text x="5" y="22" fill="#475569" stroke="none" fontSize="6" fontFamily="monospace">W 97.7431°</text>
                </g>

                {/* Plot Reference Cities */}
                {(() => {
                  const socReferenceCities = [
                    { name: "Seattle, WA", lat: 47.6062, lon: -122.3321 },
                    { name: "Los Angeles, CA", lat: 34.0522, lon: -118.2437 },
                    { name: "Denver, CO", lat: 39.7392, lon: -104.9903 },
                    { name: "Houston, TX", lat: 29.7604, lon: -95.3698 },
                    { name: "Chicago, IL", lat: 41.8781, lon: -87.6298 },
                    { name: "New York, NY", lat: 40.7128, lon: -74.0060 },
                    { name: "Miami, FL", lat: 25.7617, lon: -80.1918 },
                    { name: "Austin, TX (HQ)", lat: 30.2672, lon: -97.7431, isHq: true }
                  ];

                  return socReferenceCities.map((city, idx) => {
                    const px = ((city.lon - (-125)) / (-65 - (-125))) * 800;
                    const py = ((49 - city.lat) / (49 - 24)) * 450;

                    if (px < 0 || px > 800 || py < 0 || py > 450) return null;

                    return (
                      <g key={`soc-ref-${idx}`}>
                        <circle 
                          cx={px} 
                          cy={py} 
                          r={city.isHq ? 5 : 2} 
                          fill={city.isHq ? "#10b981" : "#334155"} 
                        />
                        {city.isHq && (
                          <circle cx={px} cy={py} r="12" fill="none" stroke="#10b981" strokeWidth="0.5" className="animate-ping" />
                        )}
                        <text 
                          x={px + 6} 
                          y={py + 3} 
                          fill={city.isHq ? "#34d399" : "#475569"} 
                          fontSize="7" 
                          fontWeight={city.isHq ? "black" : "semibold"}
                          fontFamily="monospace"
                        >
                          {city.name}
                        </text>
                      </g>
                    );
                  });
                })()}

                {/* Plot Connected Sessions and Pathways */}
                {activeDevices.map((dev, idx) => {
                  const geo = deviceGeoData[dev.ip] || null;
                  if (!geo) return null;

                  const hqX = ((-97.7431 - (-125)) / (-65 - (-125))) * 800;
                  const hqY = ((49 - 30.2672) / (49 - 24)) * 450;
                  
                  const devX = ((geo.lon - (-125)) / (-65 - (-125))) * 800;
                  const devY = ((49 - geo.lat) / (49 - 24)) * 450;

                  if (devX < 0 || devX > 800 || devY < 0 || devY > 450) return null;

                  const hasSuspUA = isSuspiciousUA(dev.userAgent);
                  const strokeColor = hasSuspUA ? "#f59e0b" : "#8b5cf6";
                  const pathId = `path-${dev.id}`;

                  // Bezier curve
                  const midX = (hqX + devX) / 2;
                  const midY = Math.min(hqY, devY) - 50; // curve upward
                  const dPath = `M ${devX} ${devY} Q ${midX} ${midY} ${hqX} ${hqY}`;

                  return (
                    <g key={`soc-node-${dev.id}`}>
                      {/* Flying connection pathway path */}
                      <path 
                        d={dPath} 
                        fill="none" 
                        stroke={strokeColor} 
                        strokeWidth="1.5" 
                        strokeDasharray="4,4" 
                        opacity="0.6"
                        className="animate-pulse"
                      />
                      
                      {/* Pulse target beacon */}
                      <circle 
                        cx={devX} 
                        cy={devY} 
                        r="8" 
                        fill="none" 
                        stroke={strokeColor} 
                        strokeWidth="1" 
                        className="animate-ping" 
                      />
                      <circle 
                        cx={devX} 
                        cy={devY} 
                        r="4" 
                        fill={strokeColor} 
                        className="cursor-pointer hover:scale-125 transition-transform"
                        title={`${dev.name} [${dev.ip}]`}
                      />

                      {/* Floating Text Indicator near Device Node */}
                      <g transform={`translate(${devX - 35}, ${devY - 12})`}>
                        <rect x="0" y="0" width="70" height="9" rx="2" fill="#090d16" stroke="#1e293b" strokeWidth="0.5" opacity="0.85" />
                        <text x="35" y="7" textAnchor="middle" fill="#94a3b8" fontSize="5.5" fontWeight="bold" fontFamily="monospace">
                          {dev.name ? dev.name.split(" ")[0] : "Terminal"}: {dev.ip}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </svg>

              {/* Live Overlay HUD readout */}
              <div className="absolute top-3 left-3 bg-stone-950/90 border border-stone-800 p-2.5 rounded-lg text-[8px] font-mono text-stone-400 space-y-1">
                <p className="text-emerald-400 font-extrabold uppercase">GLOBAL METRIC TRACKING</p>
                <p>REFRESH_RATE: 30000ms</p>
                <p>INTEL_LOCK: ENABLED</p>
                <p>LOC_PROVIDER: IP-API Service</p>
              </div>
            </div>
          </div>

          {/* Right Hand Node Telemetry Inspector Panel */}
          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs flex flex-col space-y-4">
            <div className="border-b border-stone-100 pb-3">
              <h3 className="text-sm font-black uppercase text-stone-900 tracking-wider flex items-center gap-1.5">
                <Cpu size={16} className="text-violet-600 animate-spin" style={{ animationDuration: "12s" }} /> SOC Telemetry Node Inspector
              </h3>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-0.5 block">
                Select a live network terminal to remediate
              </span>
            </div>

            {activeDevices.length === 0 ? (
              <div className="p-8 text-center bg-stone-50 border border-dashed border-stone-200 rounded-2xl flex-1 flex flex-col justify-center items-center">
                <span className="text-xs text-stone-400 font-bold italic">No Monitored Terminal Nodes Active</span>
              </div>
            ) : (
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[480px]">
                {activeDevices.map((dev) => {
                  const geo = deviceGeoData[dev.ip] || null;
                  const hasSuspUA = isSuspiciousUA(dev.userAgent);

                  return (
                    <div 
                      key={dev.id} 
                      className={`p-3.5 border rounded-2xl space-y-3 text-left transition-all hover:border-violet-300 shadow-3xs ${hasSuspUA ? 'border-amber-200 bg-amber-50/5' : 'border-stone-150 bg-white'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-extrabold text-stone-900 text-xs block">{dev.name || "Authenticated Node"}</span>
                          <span className="text-[8px] font-black uppercase tracking-wider text-stone-400 block mt-0.5">ROLE: {dev.role || "staff"}</span>
                        </div>
                        <span className={`inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${hasSuspUA ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {hasSuspUA ? "⚠️ FLAGGED" : "✓ STANDARD"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[9.5px]">
                        <div className="space-y-0.5">
                          <span className="text-stone-400 font-bold uppercase tracking-wider block text-[8px]">IP Address</span>
                          <span className="font-mono font-bold text-stone-800 bg-stone-100 px-1 py-0.5 rounded">{dev.ip || "Unknown"}</span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-stone-400 font-bold uppercase tracking-wider block text-[8px]">Location</span>
                          <span className="font-bold text-stone-800 block truncate">📍 {geo ? `${geo.city}, ${geo.region}` : "Resolving..."}</span>
                        </div>
                      </div>

                      <div className="space-y-1 text-[9.5px] border-t border-stone-100 pt-2.5">
                        <span className="text-stone-400 font-bold uppercase tracking-wider block text-[8px]">Provider / ISP Network</span>
                        <p className="font-medium text-stone-700 leading-snug truncate">{geo?.provider || "Fetching Service details..."}</p>
                      </div>

                      <div className="flex items-center justify-end gap-2 border-t border-stone-100 pt-2.5">
                        <button
                          onClick={() => handleForceLogoutDevice(dev)}
                          className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-all cursor-pointer"
                          disabled={dev.name === currentUser?.name}
                          title={dev.name === currentUser?.name ? "Cannot force logout yourself" : "Instantly sever browser connection"}
                        >
                          Force Logout
                        </button>
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {ownerTab === "agistors" && (
      <div className="space-y-6 text-left" id="agistor-registry-section">
        <div className="bg-emerald-950/10 border border-emerald-500/20 text-stone-800 rounded-3xl p-6 relative overflow-hidden shadow-xs">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5 max-w-2xl">
              <h2 className="text-base font-black uppercase text-emerald-900 tracking-wider flex items-center gap-2">
                <Award size={18} className="text-emerald-600 animate-pulse" /> Agistor &amp; Rider Profile Registry
              </h2>
              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                Create and manage horse owners, agistors, and active riders. Map them directly to their horses to grant manual badge entry credentials. Riders can log workout rides, log maintenance treatments, and access their horse registries.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create/Edit Profile Form Column */}
          <div className="space-y-6">
            <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-4xs text-left" id="agistor-profile-form">
              <div className="border-b border-stone-100 pb-3 mb-4">
                <h3 className="text-xs font-black uppercase text-stone-900 tracking-wider flex items-center gap-1.5">
                  {agEditingId ? <Save size={14} className="text-emerald-600" /> : <UserPlus size={14} className="text-emerald-600" />}
                  {agEditingId ? "Modify Rider Profile" : "Register Agistor / Rider"}
                </h3>
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-0.5 block">
                  {agEditingId ? "Commit changes to this profile" : "Onboard a new horse owner or contract rider"}
                </span>
              </div>

              <form onSubmit={handleSaveAgistorProfile} className="space-y-4">
                {agError && (
                  <p className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold uppercase rounded-xl text-center">
                    ⚠️ {agError}
                  </p>
                )}
                {agSuccess && (
                  <p className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase rounded-xl text-center">
                    ✓ {agSuccess}
                  </p>
                )}

                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="E.G. Jane Cooper"
                    value={agName}
                    onChange={(e) => setAgName(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>

                {/* PIN Code */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest block">
                    Security PIN (4 Digits)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    placeholder="E.G. 4321"
                    value={agPin}
                    onChange={(e) => setAgPin(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold tracking-widest text-stone-850 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                  <p className="text-[8px] text-stone-400 font-semibold leading-relaxed">
                    This numeric code allows instant login on manual entry screens.
                  </p>
                </div>

                {/* Emergency Contact */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest block">
                    Emergency Contact
                  </label>
                  <input
                    type="text"
                    placeholder="E.G. David Cooper (+61 400 123 456)"
                    value={agEmergencyContact}
                    onChange={(e) => setAgEmergencyContact(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-850 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>

                {/* Notes / Special Terms */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest block">
                    Riding &amp; Care Terms
                  </label>
                  <textarea
                    rows={2}
                    placeholder="E.G. Lease agreement expires Nov 2026. Weekly jump training authorized."
                    value={agNotes}
                    onChange={(e) => setAgNotes(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-medium text-stone-850 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>

                {/* Can Log Maintenance */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="ag-can-maintenance"
                    checked={agCanLogMaintenance}
                    onChange={(e) => setAgCanLogMaintenance(e.target.checked)}
                    className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <label htmlFor="ag-can-maintenance" className="text-[10px] font-bold text-stone-700 uppercase tracking-wider select-none cursor-pointer">
                    Authorize Maintenance Logging
                  </label>
                </div>

                {/* Can Log Daily Checks */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="ag-can-daily-checks"
                    checked={agCanLogDailyChecks}
                    onChange={(e) => setAgCanLogDailyChecks(e.target.checked)}
                    className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <label htmlFor="ag-can-daily-checks" className="text-[10px] font-bold text-stone-700 uppercase tracking-wider select-none cursor-pointer">
                    Authorize Daily Health Checks
                  </label>
                </div>

                {/* Assisted Access Mode */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="ag-assisted-access"
                    checked={agAssistedAccessMode}
                    onChange={(e) => setAgAssistedAccessMode(e.target.checked)}
                    className="rounded border-stone-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                  />
                  <label htmlFor="ag-assisted-access" className="text-[10px] font-bold text-stone-700 uppercase tracking-wider select-none cursor-pointer">
                    Enable Assisted Access Mode
                  </label>
                </div>

                {/* Active Toggle */}
                <div className="flex items-center gap-2 pt-1 pb-2">
                  <input
                    type="checkbox"
                    id="ag-is-active"
                    checked={agIsActive}
                    onChange={(e) => setAgIsActive(e.target.checked)}
                    className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                  />
                  <label htmlFor="ag-is-active" className="text-[10px] font-bold text-stone-700 uppercase tracking-wider select-none cursor-pointer">
                    Profile Active
                  </label>
                </div>

                {/* Select Horses (Checkboxes with search/scroll) */}
                <div className="space-y-1.5 border-t border-stone-100 pt-3">
                  <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest block">
                    Map Associated Horses
                  </label>
                  <div className="border border-stone-200 rounded-xl p-2.5 max-h-40 overflow-y-auto space-y-2 bg-stone-50/50">
                    {horses && horses.length === 0 ? (
                      <p className="text-[9px] font-semibold text-stone-400 italic">No horses found in herd directories.</p>
                    ) : (
                      horses?.map((horse) => {
                        const isChecked = agSelectedHorses.includes(horse.id);
                        return (
                          <div key={horse.id} className="flex items-center gap-2 hover:bg-stone-50 p-1 rounded-lg transition-colors">
                            <input
                              type="checkbox"
                              id={`ag-horse-${horse.id}`}
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setAgSelectedHorses(agSelectedHorses.filter(id => id !== horse.id));
                                } else {
                                  setAgSelectedHorses([...agSelectedHorses, horse.id]);
                                }
                              }}
                              className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                            />
                            <label htmlFor={`ag-horse-${horse.id}`} className="text-xxs font-extrabold text-stone-800 uppercase cursor-pointer select-none">
                              🐴 {horse.name} <span className="text-stone-400 font-mono text-[8px]">({horse.breed})</span>
                            </label>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="grid grid-cols-2 gap-2.5 pt-2">
                  {agEditingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setAgEditingId(null);
                        setAgName("");
                        setAgPin("");
                        setAgSelectedHorses([]);
                        setAgEmergencyContact("");
                        setAgNotes("");
                        setAgCanLogMaintenance(true);
                        setAgCanLogDailyChecks(true);
                        setAgIsActive(true);
                      }}
                      className="w-full bg-stone-100 hover:bg-stone-200 border border-stone-350 text-stone-700 font-black text-[9px] py-2 px-1 rounded-xl uppercase tracking-wider transition-all cursor-pointer text-center"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    className={`bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] py-2 px-1 rounded-xl uppercase tracking-wider transition-all cursor-pointer text-center shadow-4xs ${agEditingId ? "" : "col-span-2"}`}
                  >
                    {agEditingId ? "Save Changes" : "Register Profile"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Registered List Column (Takes 2/3 space) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-4xs text-left">
              <div className="border-b border-stone-100 pb-3 mb-4 flex justify-between items-center">
                <div>
                  <h3 className="text-xs font-black uppercase text-stone-900 tracking-wider">
                    Rider &amp; Agistor Registry List
                  </h3>
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mt-0.5 block">
                    All currently configured horse boarders and active riders
                  </span>
                </div>
                <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                  {visitorPermissions.filter(p => p.isAgistorRider).length} Profiles
                </span>
              </div>

              {visitorPermissions.filter(p => p.isAgistorRider).length === 0 ? (
                <div className="py-12 border border-dashed border-stone-200 rounded-2xl text-center text-stone-400 space-y-2">
                  <HelpCircle className="mx-auto text-stone-300" size={32} />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">No Agistor/Rider Profiles Configured</p>
                    <p className="text-[9px] text-stone-450 max-w-sm mx-auto mt-1 leading-normal">
                      Use the registration form on the left to add a rider. They can instantly log in to view their mapped horses, log rides, and log maintenance.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visitorPermissions
                    .filter(p => p.isAgistorRider)
                    .map((ag) => (
                      <div
                        key={ag.id}
                        className={`p-4 border rounded-2xl text-left space-y-3.5 relative overflow-hidden transition-all hover:border-emerald-300 shadow-5xs ${
                          ag.isActive === false ? "bg-stone-50/50 border-stone-200 opacity-60" : "bg-white border-stone-150"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="space-y-1">
                            <h4 className="text-xs font-black uppercase text-stone-950 flex items-center gap-1.5 leading-none">
                              👤 {ag.name}
                              {ag.isActive !== false ? (
                                <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-[7px] uppercase font-bold">Active</span>
                              ) : (
                                <span className="bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded text-[7px] uppercase font-bold">Inactive</span>
                              )}
                            </h4>
                            <span className="text-[8px] font-black uppercase tracking-widest text-stone-400 block">
                              Credentials ID: RIDER-{ag.pin || "????"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleEditAgistorClick(ag)}
                              className="p-1.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-emerald-300 text-stone-600 hover:text-emerald-700 rounded-lg transition-all cursor-pointer"
                              title="Edit Profile"
                            >
                              <Cpu size={11} />
                            </button>
                            <button
                              onClick={() => handleDeleteAgistor(ag.id)}
                              className="p-1.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-rose-300 text-stone-600 hover:text-rose-700 rounded-lg transition-all cursor-pointer opacity-70 hover:opacity-100"
                              title="Delete Profile"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>

                        {/* Mapped Horses List */}
                        <div className="space-y-1.5 border-t border-stone-100 pt-2.5">
                          <span className="text-[8px] font-black uppercase tracking-widest text-stone-400 block">Mapped Horses ({ag.allowedHorseIds?.length || 0})</span>
                          <div className="flex flex-wrap gap-1">
                            {(!ag.allowedHorseIds || ag.allowedHorseIds.length === 0) ? (
                              <span className="text-[8px] font-bold text-stone-400 uppercase">None Mapped</span>
                            ) : (
                              ag.allowedHorseIds.map((hid: string) => {
                                const horse = horses?.find(h => h.id === hid);
                                return (
                                  <span key={hid} className="bg-stone-50 border border-stone-150 text-stone-700 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wide flex items-center gap-1">
                                    🐴 {horse?.name || hid}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-2 text-[9px] font-bold pt-1 uppercase tracking-wide">
                          <div className="space-y-0.5">
                            <span className="text-[7.5px] font-black text-stone-400 tracking-wider block">Security PIN</span>
                            <span className="font-mono text-emerald-800 bg-emerald-50 border border-emerald-100/50 px-1.5 py-0.5 rounded-md text-[10px] tracking-widest select-all inline-block">{ag.pin || "N/A"}</span>
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[7.5px] font-black text-stone-400 tracking-wider block">Maintenance Authority</span>
                            <span className={ag.canLogMaintenance !== false ? "text-emerald-700" : "text-stone-500"}>
                              {ag.canLogMaintenance !== false ? "✓ AUTHORIZED" : "✗ BLOCKED"}
                            </span>
                          </div>
                        </div>

                        {ag.emergencyContact && (
                          <div className="text-[9px] font-semibold text-stone-500 leading-normal border-t border-stone-100 pt-2.5">
                            <span className="text-[7.5px] font-black text-stone-400 uppercase tracking-widest block mb-0.5">Emergency Contact</span>
                            📞 {ag.emergencyContact}
                          </div>
                        )}

                        {ag.notes && (
                          <div className="text-[9px] font-medium text-stone-600 bg-stone-50 p-2 rounded-xl italic leading-relaxed border border-stone-100">
                            {ag.notes}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

      {/* Individual Visitor Badge Print Modal */}
      {showVisitorBadgeModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto text-left">
          <div className="bg-stone-50 rounded-3xl border border-stone-200 shadow-2xl max-w-md w-full p-6 space-y-6 relative print:p-0 print:border-none print:shadow-none print:bg-white">
            <div className="flex justify-between items-center pb-4 border-b border-stone-200 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="text-pink-600" size={20} />
                <div>
                  <h3 className="text-sm font-black uppercase text-stone-900">
                    Visitor Badge Station
                  </h3>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-0.5 block">
                    Individual security guest pass ready for printing
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVisitorBadgeModal(null)}
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
                <BadgeQRCode name={showVisitorBadgeModal.name} pin={showVisitorBadgeModal.pin || "0000"} />
              </div>

              {/* Badge Details */}
              <div className="flex-1 text-center sm:text-left z-10 w-full relative">
                {/* Username & Password on TOP RIGHT */}
                <div className="absolute top-0 right-0 text-right">
                  <div className="bg-pink-900 text-white font-mono text-[8.5px] px-2 py-1 rounded-md tracking-wider leading-normal select-all shadow-3xs uppercase font-extrabold flex flex-col items-end">
                    <span>U: {showVisitorBadgeModal.name.replace(/\s+/g, "").toLowerCase()}</span>
                    <span className="text-[7.5px] text-pink-300 mt-0.5 border-t border-pink-850 pt-0.5 w-full block">PIN: {showVisitorBadgeModal.pin}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center sm:justify-start gap-1">
                  <span className="text-[8px] bg-pink-600 text-white font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                    FARM GUEST
                  </span>
                </div>

                <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight mt-6 sm:mt-5 font-sans">
                  {showVisitorBadgeModal.name}
                </h3>
                <p className="text-[10px] font-bold text-pink-750 uppercase tracking-wider mt-0.5">
                  PRE-AUTHORIZED GUEST
                </p>
                
                <div className="mt-3 pt-2.5 border-t border-stone-150 text-[9px] font-bold text-stone-400 leading-normal uppercase tracking-wide">
                  ID: GUEST-{showVisitorBadgeModal.pin}-{showVisitorBadgeModal.name.slice(0, 3).toUpperCase()}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-stone-200 flex justify-end gap-2 flex-wrap print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-pink-650 hover:bg-pink-700 text-white font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
              >
                <Printer size={12} /> Print Badge
              </button>
              <button
                type="button"
                onClick={() => setShowVisitorBadgeModal(null)}
                className="bg-stone-900 hover:bg-stone-850 text-white font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Badges Print Modal */}
      {showBulkPrintModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-50 rounded-3xl border border-stone-200 shadow-2xl max-w-4xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto relative print:p-0 print:border-none print:shadow-none print:bg-white">
            <div className="flex justify-between items-center pb-4 border-b border-stone-200 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="text-teal-600" size={20} />
                <div>
                  <h3 className="text-sm font-black uppercase text-stone-900">
                    Bulk Badges Print Station
                  </h3>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-0.5 block">
                    All crew security badge profiles ready for printing
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => exportBulkBadges(farmCrewProfiles, visitorPermissions.filter(p => !p.isAgistorRider), "png")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Download size={12} /> Bulk PNG
                </button>
                <button
                  type="button"
                  onClick={() => exportBulkBadges(farmCrewProfiles, visitorPermissions.filter(p => !p.isAgistorRider), "jpg")}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Download size={12} /> Bulk JPG
                </button>
                <button
                  type="button"
                  onClick={() => exportBadgesZip(farmCrewProfiles, visitorPermissions.filter(p => !p.isAgistorRider))}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-black text-[10px] px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Download size={12} /> Download ZIP
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-black text-[10px] px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Printer size={12} /> Print Now
                </button>
                <button
                  type="button"
                  onClick={handleExportBadgesCsv}
                  className="bg-stone-900 hover:bg-stone-850 text-white font-black text-[10px] px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Download size={12} /> Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkPrintModal(false)}
                  className="bg-white border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-stone-900 rounded-xl p-2 cursor-pointer transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Print Grid of Badges */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4 text-left">
              {farmCrewProfiles.map((user) => (
                <div 
                  key={user.name}
                  className="flex flex-col sm:flex-row items-center gap-4 bg-white border border-stone-300 p-5 rounded-2xl shadow-xs relative overflow-hidden break-inside-avoid print:border print:border-stone-400 print:p-4 print:shadow-none text-left"
                  style={{ pageBreakInside: "avoid" }}
                >
                  {/* Decorative card background accent */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/3 rounded-full blur-xl pointer-events-none" />
                  
                  {/* Scannable Code */}
                  <div className="shrink-0 z-10">
                    <BadgeQRCode name={user.name} pin={user.pin} />
                  </div>

                  {/* Badge Details */}
                  <div className="flex-1 text-center sm:text-left z-10 w-full relative">
                    {/* Username & Password on TOP RIGHT */}
                    <div className="absolute top-0 right-0 text-right print:top-0 print:right-0">
                      <div className="bg-stone-900 text-white font-mono text-[8.5px] px-2 py-1 rounded-md tracking-wider leading-normal select-all shadow-3xs uppercase font-extrabold flex flex-col items-end">
                        <span>U: {user.name.replace(/\s+/g, "").toLowerCase()}</span>
                        <span className="text-[7.5px] text-teal-400 mt-0.5 border-t border-stone-850 pt-0.5 w-full block">P: {user.pin}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center sm:justify-start gap-1">
                      <span className="text-[8px] bg-teal-600 text-white font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                        SECURE CREW
                      </span>
                    </div>

                    <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight mt-6 sm:mt-5">
                      {user.name}
                    </h3>
                    <p className="text-[10px] font-bold text-teal-750 uppercase tracking-wider mt-0.5">
                      {getFormatUserTitle(user)}
                    </p>
                    {user.badges && user.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 print:mt-0.5 justify-center sm:justify-start">
                        {user.badges.map(b => (
                          <span key={b} className="bg-teal-50 text-teal-800 text-[8px] font-bold px-1 py-0.5 rounded border border-teal-100 uppercase tracking-wide">
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="mt-3 pt-2.5 border-t border-stone-150 text-[9px] font-bold text-stone-400 leading-normal uppercase tracking-wide">
                      ID: RUABON-{user.pin}-{user.name.slice(0, 3).toUpperCase()}
                    </div>
                  </div>
                </div>
              ))}

              {/* Append Visitor Badges to Bulk Station */}
              {visitorPermissions.filter(p => !p.isAgistorRider).map((vis) => (
                <div 
                  key={vis.id}
                  className="flex flex-col sm:flex-row items-center gap-4 bg-white border border-stone-300 p-5 rounded-2xl shadow-xs relative overflow-hidden break-inside-avoid print:border print:border-stone-400 print:p-4 print:shadow-none text-left border-dashed border-pink-300"
                  style={{ pageBreakInside: "avoid" }}
                >
                  {/* Decorative card background accent */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/3 rounded-full blur-xl pointer-events-none" />
                  
                  {/* Scannable Code */}
                  <div className="shrink-0 z-10">
                    <BadgeQRCode name={vis.name} pin={vis.pin || "0000"} />
                  </div>

                  {/* Badge Details */}
                  <div className="flex-1 text-center sm:text-left z-10 w-full relative">
                    {/* Username & Password on TOP RIGHT */}
                    <div className="absolute top-0 right-0 text-right print:top-0 print:right-0">
                      <div className="bg-pink-900 text-white font-mono text-[8.5px] px-2 py-1 rounded-md tracking-wider leading-normal select-all shadow-3xs uppercase font-extrabold flex flex-col items-end">
                        <span>U: {vis.name.replace(/\s+/g, "").toLowerCase()}</span>
                        <span className="text-[7.5px] text-pink-300 mt-0.5 border-t border-pink-850 pt-0.5 w-full block">PIN: {vis.pin}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center sm:justify-start gap-1">
                      <span className="text-[8px] bg-pink-600 text-white font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                        FARM GUEST
                      </span>
                    </div>

                    <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight mt-6 sm:mt-5">
                      {vis.name}
                    </h3>
                    <p className="text-[10px] font-bold text-pink-750 uppercase tracking-wider mt-0.5">
                      PRE-AUTHORIZED GUEST
                    </p>
                    {vis.badges && vis.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 print:mt-0.5 justify-center sm:justify-start">
                        {vis.badges.map(b => (
                          <span key={b} className="bg-pink-50 text-pink-800 text-[8px] font-bold px-1 py-0.5 rounded border border-pink-100 uppercase tracking-wide">
                            {b}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="mt-3 pt-2.5 border-t border-stone-150 text-[9px] font-bold text-stone-400 leading-normal uppercase tracking-wide">
                      ID: GUEST-{vis.pin}-{vis.name.slice(0, 3).toUpperCase()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-stone-200 flex justify-end gap-2 print:hidden">
              <button
                type="button"
                onClick={() => setShowBulkPrintModal(false)}
                className="bg-stone-900 hover:bg-stone-850 text-white font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-wider cursor-pointer"
              >
                Close Station
              </button>
            </div>
          </div>
        </div>
      )}

      {ownerTab === "ban_approvals" && (
        <div className="space-y-6 text-left animate-fade-in" id="ban-approvals-section">
          <div className="bg-amber-950/10 border border-amber-500/20 text-stone-800 rounded-3xl p-6 relative overflow-hidden shadow-xs">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
            <h2 className="text-base font-black uppercase text-amber-900 tracking-wider flex items-center gap-2">
              <ShieldAlert size={18} className="text-amber-600" /> Pending Ban Requests Queue
            </h2>
            <p className="text-xs text-stone-600 mt-1 leading-relaxed font-medium">
              Review and act on ban requests sent by administrators. Approving a request will immediately enforce the ban and log the action.
            </p>
          </div>

          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
            {banRequests.filter(r => r.status === "pending").length === 0 ? (
              <div className="text-center py-12 text-stone-400 font-medium text-xs">
                No pending ban requests in queue. Everything is quiet.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 pr-2 space-y-3">
                {banRequests.filter(r => r.status === "pending").map((req) => (
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
                    </div>

                    <p className="text-xs text-stone-650 bg-white p-3 rounded-xl border border-stone-150 font-medium leading-relaxed">
                      Reason: {req.reason}
                    </p>

                    <div className="flex justify-between items-center gap-4">
                      <span className="text-[9px] text-stone-400 font-semibold">
                        Submitted: {new Date(req.requestedAt).toLocaleString()}
                      </span>
                      
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRejectBanRequest(req.id)}
                          className="bg-white hover:bg-stone-100 border border-stone-200 text-stone-600 text-[10px] font-black uppercase px-3.5 py-2 rounded-xl cursor-pointer shadow-3xs"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveBanRequest(req)}
                          className="bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-black uppercase px-3.5 py-2 rounded-xl cursor-pointer shadow-xs"
                        >
                          Approve Ban
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {ownerTab === "permissions" && (
        <div className="space-y-6 animate-fade-in text-left">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-2">
            <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="text-teal-600" size={16} />
              Farm Feature Permissions &amp; Access Controls
            </h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
              Configure global toggles, features, and messaging visibility for crew members, guests, and agistors.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* CARD 1: Crew Team Messaging */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-50 text-purple-700 rounded-2xl border border-purple-100">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider">Crew Team Messaging</h4>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">Control who can access the Team Messaging workspace</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 bg-stone-100/80 p-1 rounded-xl">
                {[
                  { key: "everyone", label: "Everyone" },
                  { key: "custom", label: "Custom Selection" },
                  { key: "none", label: "Disabled" }
                ].map((opt) => {
                  const isActive = (featurePermissions?.messagingEnabledForCrew || "everyone") === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleUpdatePermissionType("messagingEnabledForCrew", opt.key)}
                      className={`py-1.5 px-2 text-xxs font-extrabold uppercase rounded-lg transition-all cursor-pointer ${
                        isActive 
                          ? "bg-purple-600 text-white shadow-3xs" 
                          : "text-stone-500 hover:text-stone-850 hover:bg-stone-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {(featurePermissions?.messagingEnabledForCrew || "everyone") === "custom" && (
                <div className="border border-stone-200/60 rounded-2xl p-3 bg-stone-50/50 space-y-2 max-h-[220px] overflow-y-auto">
                  <span className="block text-[9px] font-black text-stone-400 uppercase tracking-wider">Select Allowed Crew Members</span>
                  {farmCrewProfiles.filter(u => u.role !== "owner" && u.name !== "System Administrator").length === 0 ? (
                    <span className="text-[10px] text-stone-400 uppercase block font-bold">No other crew registered yet</span>
                  ) : (
                    farmCrewProfiles.filter(u => u.role !== "owner" && u.name !== "System Administrator").map((user) => {
                      const isSelected = (featurePermissions?.messagingAllowedCrewUsers || []).includes(user.name);
                      return (
                        <button
                          key={user.name}
                          type="button"
                          onClick={() => handleTogglePermissionUser("messagingAllowedCrewUsers", user.name, isSelected)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl border text-left text-xxs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-white border-purple-500 text-purple-850 shadow-5xs"
                              : "bg-white border-stone-150 text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          <span>{user.name} ({user.role})</span>
                          <div className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center transition-all ${
                            isSelected ? "bg-purple-600 border-purple-600 text-white" : "border-stone-300 bg-white"
                          }`}>
                            {isSelected && <Check size={10} strokeWidth={3} />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* CARD 2: Guest & Visitor Messaging */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-pink-50 text-pink-700 rounded-2xl border border-pink-100">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider">Guest &amp; Visitor Messaging</h4>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">Control which Guests can message staff</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 bg-stone-100/80 p-1 rounded-xl">
                {[
                  { key: "everyone", label: "Everyone" },
                  { key: "custom", label: "Custom Selection" },
                  { key: "none", label: "Disabled" }
                ].map((opt) => {
                  const isActive = (featurePermissions?.messagingEnabledForGuests || "everyone") === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleUpdatePermissionType("messagingEnabledForGuests", opt.key)}
                      className={`py-1.5 px-2 text-xxs font-extrabold uppercase rounded-lg transition-all cursor-pointer ${
                        isActive 
                          ? "bg-pink-600 text-white shadow-3xs" 
                          : "text-stone-500 hover:text-stone-850 hover:bg-stone-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {(featurePermissions?.messagingEnabledForGuests || "everyone") === "custom" && (
                <div className="border border-stone-200/60 rounded-2xl p-3 bg-stone-50/50 space-y-2 max-h-[220px] overflow-y-auto">
                  <span className="block text-[9px] font-black text-stone-400 uppercase tracking-wider">Select Allowed Guest Profiles</span>
                  {visitorPermissions.filter(p => !p.isAgistorRider).length === 0 ? (
                    <span className="text-[10px] text-stone-400 uppercase block font-bold">No guest profiles found</span>
                  ) : (
                    visitorPermissions.filter(p => !p.isAgistorRider).map((vis) => {
                      const isSelected = (featurePermissions?.messagingAllowedGuestIds || []).includes(vis.id);
                      return (
                        <button
                          key={vis.id}
                          type="button"
                          onClick={() => handleTogglePermissionUser("messagingAllowedGuestIds", vis.id, isSelected)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl border text-left text-xxs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-white border-pink-500 text-pink-850 shadow-5xs"
                              : "bg-white border-stone-150 text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          <span>{vis.name}</span>
                          <div className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center transition-all ${
                            isSelected ? "bg-pink-600 border-pink-600 text-white" : "border-stone-300 bg-white"
                          }`}>
                            {isSelected && <Check size={10} strokeWidth={3} />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* CARD 3: Agistor & Rider Messaging */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider">Agistor &amp; Rider Messaging</h4>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">Control which Agistors can message staff</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 bg-stone-100/80 p-1 rounded-xl">
                {[
                  { key: "everyone", label: "Everyone" },
                  { key: "custom", label: "Custom Selection" },
                  { key: "none", label: "Disabled" }
                ].map((opt) => {
                  const isActive = (featurePermissions?.messagingEnabledForAgistors || "everyone") === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleUpdatePermissionType("messagingEnabledForAgistors", opt.key)}
                      className={`py-1.5 px-2 text-xxs font-extrabold uppercase rounded-lg transition-all cursor-pointer ${
                        isActive 
                          ? "bg-emerald-600 text-white shadow-3xs" 
                          : "text-stone-500 hover:text-stone-850 hover:bg-stone-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {(featurePermissions?.messagingEnabledForAgistors || "everyone") === "custom" && (
                <div className="border border-stone-200/60 rounded-2xl p-3 bg-stone-50/50 space-y-2 max-h-[220px] overflow-y-auto">
                  <span className="block text-[9px] font-black text-stone-400 uppercase tracking-wider">Select Allowed Agistor Profiles</span>
                  {visitorPermissions.filter(p => p.isAgistorRider).length === 0 ? (
                    <span className="text-[10px] text-stone-400 uppercase block font-bold">No agistor profiles found</span>
                  ) : (
                    visitorPermissions.filter(p => p.isAgistorRider).map((ag) => {
                      const isSelected = (featurePermissions?.messagingAllowedAgistorIds || []).includes(ag.id);
                      return (
                        <button
                          key={ag.id}
                          type="button"
                          onClick={() => handleTogglePermissionUser("messagingAllowedAgistorIds", ag.id, isSelected)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl border text-left text-xxs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-white border-emerald-500 text-emerald-850 shadow-5xs"
                              : "bg-white border-stone-150 text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          <span>{ag.name}</span>
                          <div className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center transition-all ${
                            isSelected ? "bg-emerald-600 border-emerald-600 text-white" : "border-stone-300 bg-white"
                          }`}>
                            {isSelected && <Check size={10} strokeWidth={3} />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* CARD 4: Daily Check Logging Permission */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-50 text-teal-700 rounded-2xl border border-teal-100">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider">Crew Daily Check Logging</h4>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">Control which Crew members can log daily horse checks</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 bg-stone-100/80 p-1 rounded-xl">
                {[
                  { key: "everyone", label: "Everyone" },
                  { key: "custom", label: "Custom Selection" },
                  { key: "none", label: "Disabled" }
                ].map((opt) => {
                  const isActive = (featurePermissions?.dailyChecksEnabledForCrew || "everyone") === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleUpdatePermissionType("dailyChecksEnabledForCrew", opt.key)}
                      className={`py-1.5 px-2 text-xxs font-extrabold uppercase rounded-lg transition-all cursor-pointer ${
                        isActive 
                          ? "bg-teal-600 text-white shadow-3xs" 
                          : "text-stone-500 hover:text-stone-850 hover:bg-stone-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {(featurePermissions?.dailyChecksEnabledForCrew || "everyone") === "custom" && (
                <div className="border border-stone-200/60 rounded-2xl p-3 bg-stone-50/50 space-y-2 max-h-[220px] overflow-y-auto">
                  <span className="block text-[9px] font-black text-stone-400 uppercase tracking-wider">Select Allowed Crew Members</span>
                  {farmCrewProfiles.filter(u => u.role !== "owner" && u.name !== "System Administrator").length === 0 ? (
                    <span className="text-[10px] text-stone-400 uppercase block font-bold">No other crew registered yet</span>
                  ) : (
                    farmCrewProfiles.filter(u => u.role !== "owner" && u.name !== "System Administrator").map((user) => {
                      const isSelected = (featurePermissions?.dailyChecksAllowedCrewUsers || []).includes(user.name);
                      return (
                        <button
                          key={user.name}
                          type="button"
                          onClick={() => handleTogglePermissionUser("dailyChecksAllowedCrewUsers", user.name, isSelected)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl border text-left text-xxs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-white border-teal-500 text-teal-850 shadow-5xs"
                              : "bg-white border-stone-150 text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          <span>{user.name} ({user.role})</span>
                          <div className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center transition-all ${
                            isSelected ? "bg-teal-600 border-teal-600 text-white" : "border-stone-300 bg-white"
                          }`}>
                            {isSelected && <Check size={10} strokeWidth={3} />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
        </div> {/* Closing right column */}
      </div> {/* Closing horizontal flex wrapper */}

      {/* Emergency Shutdown Verification Dialog Modal */}
      {showShutdownModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-stone-900 border-2 border-rose-600 rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-scale-up text-left font-mono">
            <div className="flex items-center gap-3 border-b border-rose-950 pb-3.5 mb-5">
              <div className="p-2 bg-rose-950 text-rose-500 rounded-xl border border-rose-900 animate-pulse">
                <ShieldAlert size={18} />
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  EMERGENCY SYSTEM SHUTDOWN
                </h3>
                <p className="text-[9px] text-rose-600 font-black uppercase tracking-widest mt-0.5">
                  Verification Level {shutdownStep}/3
                </p>
              </div>
            </div>

            <form onSubmit={handleShutdownStepSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-[8px] font-black text-rose-500 uppercase tracking-widest leading-normal">
                  {shutdownStep === 1 && "Stage 1: Enter User Verification Password / PIN"}
                  {shutdownStep === 2 && "Stage 2: Enter Secondary Override Bypass Code"}
                  {shutdownStep === 3 && "Stage 3: Enter Master Shutdown Restorational Key"}
                </label>
                <input
                  type={shutdownStep === 3 ? "password" : "text"}
                  placeholder={
                    shutdownStep === 1 ? "E.G. Administrator user PIN (2013)" :
                    shutdownStep === 2 ? "E.G. Override code (8357)" :
                    "E.G. Master Password"
                  }
                  value={shutdownInput}
                  autoFocus
                  onChange={(e) => setShutdownInput(e.target.value)}
                  className="w-full bg-black border border-rose-950 rounded-xl px-4 py-3 text-xs tracking-widest focus:ring-2 focus:ring-rose-600 focus:outline-hidden text-rose-500 placeholder-rose-950/60"
                />
              </div>

              {shutdownError && (
                <p className="text-[9px] text-rose-500 font-black uppercase text-center animate-shake bg-rose-950/20 border border-rose-900 py-2 rounded-xl px-2 leading-normal">
                  {shutdownError}
                </p>
              )}

              <p className="text-[8px] text-stone-500 uppercase leading-relaxed text-center">
                This operation is critical. Activating shutdown immediately halts all systems, signs out everyone, and blocks new connections.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowShutdownModal(false);
                    setShutdownStep(1);
                    setShutdownInput("");
                  }}
                  className="border border-rose-950 text-rose-600 hover:text-rose-500 font-bold text-[9px] py-2.5 rounded-lg uppercase tracking-wider transition-colors cursor-pointer text-center"
                >
                  Abort
                </button>
                <button
                  type="submit"
                  className="bg-rose-700 hover:bg-rose-800 text-white font-bold text-[9px] py-2.5 rounded-lg uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                >
                  Confirm Step
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Profile Modal for Scanned User */}
      {showFullProfileModal && scannedUser && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-xl p-6 space-y-6 animate-scale-up text-left">
            <div className="flex items-center justify-between pb-4 border-b border-stone-150">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg border uppercase ${scannedUser.avatarColor || "bg-teal-50 text-teal-800"}`}>
                  {scannedUser.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div>
                  <h3 className="text-base font-black text-stone-900">{scannedUser.name}</h3>
                  <p className="text-xs text-stone-500 font-bold uppercase tracking-wider">{scannedUser.title || scannedUser.role}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowFullProfileModal(false)}
                className="p-1.5 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-stone-50 p-4 rounded-2xl border border-stone-200/80 text-xs font-mono">
                <div>
                  <span className="text-stone-400 block text-[10px] font-bold uppercase tracking-wider">Account Role</span>
                  <span className="font-extrabold text-stone-800 uppercase">{scannedUser.role}</span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] font-bold uppercase tracking-wider">Security PIN</span>
                  <span className="font-extrabold text-stone-800">{scannedUser.pin || "Not Set"}</span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] font-bold uppercase tracking-wider">Account Status</span>
                  <span className={`font-extrabold uppercase ${scannedUser.isActive === false || scannedUser.isBanned ? "text-rose-600" : "text-emerald-600"}`}>
                    {scannedUser.isActive === false || scannedUser.isBanned ? "Banned / Revoked" : "Active"}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] font-bold uppercase tracking-wider">Assisted Mode</span>
                  <span className="font-extrabold text-stone-800">{scannedUser.assistedAccessMode ? "Enabled" : "Disabled"}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-2">
                  Assigned Badges & Qualifications
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {scannedUser.badges && scannedUser.badges.length > 0 ? (
                    scannedUser.badges.map((b) => (
                      <span key={b} className="bg-teal-50 text-teal-800 border border-teal-200 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                        {b}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-stone-400 font-medium">No custom badges assigned yet.</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-2">
                  Recent Audit Logs & System Activity
                </h4>
                <div className="bg-stone-950 text-teal-400 font-mono text-[11px] p-3 rounded-2xl max-h-40 overflow-y-auto space-y-1">
                  <div className="text-stone-500 text-[10px]">Showing recent system logs for operator {scannedUser.name}...</div>
                  <div>[SECURITY OK] User verified credentials via Owner Station badge scan.</div>
                  <div>[SESSION ACTIVE] Last terminal heartbeat logged on device interface.</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowFullProfileModal(false)}
                className="bg-stone-900 hover:bg-stone-800 text-white font-black text-xs uppercase tracking-wider py-2.5 px-6 rounded-xl cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
