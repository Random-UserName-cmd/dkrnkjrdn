import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, doc, updateDoc, onSnapshot, setDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { SystemUser, UserRole } from "../types";
import { User, ShieldCheck, Key, RefreshCw, Palette, HelpCircle, CheckCircle2, X, Calendar, ShieldAlert, Mail, Image, Sliders, ArrowUp, ArrowDown, LayoutGrid, Layers, Settings, Smartphone, Lock, Shield, Sparkles } from "lucide-react";
import { exportBadgeImage } from "../utils/badgeExport";
import BadgeDesigner from "./BadgeDesigner";
import AISettingsPage from "./AISettingsPage";

interface ProfileEditorProps {
  currentUser: SystemUser;
  onUpdateCurrentUser: (updatedUser: SystemUser) => void;
  onClose: () => void;
  // Customisation props
  customisationEnabled?: boolean;
  onToggleCustomisation?: (enabled: boolean) => void;
  dashboardWidgets?: any[];
  onUpdateWidgets?: (widgets: any[]) => void;
  headerOrder?: string[];
  onUpdateHeaderOrder?: (order: string[]) => void;
  presetTags?: string[];
  initialTab?: "profile" | "customisation" | "presets" | "ai";
}

const COLOR_PRESETS = [
  { name: "Teal Green", value: "bg-teal-500/10 text-teal-800 border-teal-500/20" },
  { name: "Cosmic Indigo", value: "bg-indigo-500/10 text-indigo-800 border-indigo-500/20" },
  { name: "Royal Blue", value: "bg-blue-500/10 text-blue-800 border-blue-500/20" },
  { name: "Coral Amber", value: "bg-amber-500/10 text-amber-800 border-amber-500/20" },
  { name: "Emerald Slate", value: "bg-emerald-500/10 text-emerald-800 border-emerald-500/20" },
  { name: "Rose Gold", value: "bg-rose-500/10 text-rose-800 border-rose-500/20" },
  { name: "Deep Violet", value: "bg-violet-500/10 text-violet-800 border-violet-500/20" },
  { name: "Crimson Red", value: "bg-red-500/10 text-red-800 border-red-500/20" },
];

export function BadgeQRCode({ name, pin }: { name: string; pin: string }) {
  // Generate a simple deterministic grid
  const str = `${name}:${pin}`;
  const size = 15; // 15x15 grid
  const dots: boolean[][] = [];
  
  // Hash function to get deterministic booleans
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      // Finder patterns in corners:
      // Top-Left (0,0) to (4,4)
      const isTopLeftFinder = r < 5 && c < 5;
      // Top-Right (0, size-5) to (4, size-1)
      const isTopRightFinder = r < 5 && c >= size - 5;
      // Bottom-Left (size-5, 0) to (size-1, 4)
      const isBottomLeftFinder = r >= size - 5 && c < 5;

      if (isTopLeftFinder) {
        const innerR = r;
        const innerC = c;
        const isOuter = innerR === 0 || innerR === 4 || innerC === 0 || innerC === 4;
        const isCenter = innerR === 2 && innerC === 2;
        row.push(isOuter || isCenter);
      } else if (isTopRightFinder) {
        const innerR = r;
        const innerC = c - (size - 5);
        const isOuter = innerR === 0 || innerR === 4 || innerC === 0 || innerC === 4;
        const isCenter = innerR === 2 && innerC === 2;
        row.push(isOuter || isCenter);
      } else if (isBottomLeftFinder) {
        const innerR = r - (size - 5);
        const innerC = c;
        const isOuter = innerR === 0 || innerR === 4 || innerC === 0 || innerC === 4;
        const isCenter = innerR === 2 && innerC === 2;
        row.push(isOuter || isCenter);
      } else {
        const val = Math.abs((hash ^ (r * 33) ^ (c * 79)) % 100);
        row.push(val > 45); // ~55% black density
      }
    }
    dots.push(row);
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-24 h-24 bg-white p-1.5 border border-stone-200 rounded-lg">
      {dots.map((row, r) =>
        row.map((active, c) => (
          active ? (
            <rect
              key={`${r}-${c}`}
              x={c}
              y={r}
              width={1}
              height={1}
              fill="#1c1917"
              shapeRendering="crispEdges"
            />
          ) : null
        ))
      )}
    </svg>
  );
}

export default function ProfileEditor({ 
  currentUser, 
  onUpdateCurrentUser, 
  onClose,
  customisationEnabled = false,
  onToggleCustomisation,
  dashboardWidgets = [],
  onUpdateWidgets,
  headerOrder = [],
  onUpdateHeaderOrder,
  presetTags = [],
  initialTab = "profile"
}: ProfileEditorProps) {
  const [crewProfiles, setCrewProfiles] = useState<SystemUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  
  // Tabs selector for settings editor panel
  const [activeEditorTab, setActiveEditorTab] = useState<"profile" | "customisation" | "presets" | "ai">(initialTab || "profile");

  // Form fields
  const [name, setName] = useState("");
  const [assistedAccessMode, setAssistedAccessMode] = useState(false);
  const [title, setTitle] = useState("");
  const [pin, setPin] = useState("");
  const [avatarColor, setAvatarColor] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(false);
  const [emailAlertsFrequency, setEmailAlertsFrequency] = useState<"day" | "week" | "custom">("week");
  const [emailAlertsTypes, setEmailAlertsTypes] = useState<string[]>(["maintenance", "notices"]);
  const [emailAlertsCustomDays, setEmailAlertsCustomDays] = useState(3);
  const [visitorCode, setVisitorCode] = useState("");
  const [bio, setBio] = useState("");
  const [isDesignerOpen, setIsDesignerOpen] = useState(false);
  const [vibrationIntensity, setVibrationIntensity] = useState<"low" | "medium" | "high">("medium");
  const [newGlobalPresetInput, setNewGlobalPresetInput] = useState("");

  const handleCreatePresetTag = async () => {
    const trimmed = newGlobalPresetInput.trim();
    if (!trimmed) return;
    try {
      await setDoc(doc(db, "ranch_settings", "presets"), {
        tags: arrayUnion(trimmed)
      }, { merge: true });
      setNewGlobalPresetInput("");
    } catch (e) {
      console.error("Error creating preset tag:", e);
    }
  };

  const handleRemovePresetTag = async (tag: string) => {
    try {
      await updateDoc(doc(db, "ranch_settings", "presets"), {
        tags: arrayRemove(tag)
      });
    } catch (e) {
      console.error("Error removing preset tag:", e);
    }
  };
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Only Owner and designated admins can edit everyone else's profiles
  const canEditEveryone = currentUser.role === "owner" || currentUser.role === "admin" || (["System Administrator", "Claire Wright", "Mark Wright"].includes(currentUser.name) && !currentUser.isPasskeyLogin);

  // Owners and System Administrators have extra IT admin rights to change account level permissions (roles and official titles)
  const canEditAccountLevel = (currentUser.role === "owner" || currentUser.name === "System Administrator") && !currentUser.isPasskeyLogin;

  // Subscribe to crew profiles
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "crew_profiles"), (snapshot) => {
      const list: SystemUser[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as SystemUser);
      });
      setCrewProfiles(list);
      
      // Auto-select currentUser profile on first load
      if (!selectedUser) {
        const found = list.find(u => u.name === currentUser.name);
        if (found) {
          setSelectedUser(found);
        }
      } else {
        const found = list.find(u => u.name === selectedUser.name);
        if (found) {
          setSelectedUser(found);
        }
      }
    });
    return () => unsub();
  }, []);

  // Update form fields when selected user changes
  useEffect(() => {
    if (selectedUser) {
      setName(selectedUser.name);
      setTitle(selectedUser.title || "");
      setPin(selectedUser.pin);
      setAvatarColor(selectedUser.avatarColor);
      setRole(selectedUser.role);
      setDob(selectedUser.dob || "");
      setEmail(selectedUser.email || "");
      setEmailAlertsEnabled(selectedUser.emailAlertsEnabled ?? false);
      setEmailAlertsFrequency(selectedUser.emailAlertsFrequency || "week");
      setEmailAlertsTypes(selectedUser.emailAlertsTypes || ["maintenance", "notices"]);
      setEmailAlertsCustomDays(selectedUser.emailAlertsCustomDays || 3);
      setVisitorCode((selectedUser as any).visitorCode || Math.floor(100000 + Math.random() * 900000).toString());
      setBio(selectedUser.bio || "");
      setAssistedAccessMode(selectedUser.assistedAccessMode ?? false);
      setVibrationIntensity((selectedUser as any).vibrationIntensity || "medium");
      setSuccessMsg("");
      setErrorMsg("");
    }
  }, [selectedUser]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    // Passkey Login users cannot edit any profiles (except root owners who have full IT admin privileges)
    if (currentUser.isPasskeyLogin && currentUser.role !== "owner" && currentUser.name !== "System Administrator") {
      setErrorMsg("Passkey logins are restricted from editing profiles.");
      return;
    }
    
    // Validations
    if (!pin || pin.length < 4) {
      setErrorMsg("Security PIN must be at least 4 digits.");
      return;
    }

    setIsSubmitting(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const profileRef = doc(db, "crew_profiles", selectedUser.name);
      
      const payload: Partial<SystemUser> = {
        pin: pin,
        avatarColor: avatarColor,
        dob: dob,
        email: email.trim(),
        emailAlertsEnabled: emailAlertsEnabled,
        emailAlertsFrequency: emailAlertsFrequency,
        emailAlertsTypes: emailAlertsTypes,
        emailAlertsCustomDays: emailAlertsCustomDays,
        visitorCode: visitorCode,
        bio: bio.trim(),
        vibrationIntensity: vibrationIntensity,
      };

      // Admin / Owner fields (Cooper & Claire Wright)
      if (canEditEveryone) {
        payload.name = name.trim();
        payload.assistedAccessMode = assistedAccessMode;
      }

      // Restrict role and title (account level) to canEditAccountLevel
      if (canEditAccountLevel) {
        payload.title = title.trim();
        payload.role = role;
      }

      await updateDoc(profileRef, payload);

      setSuccessMsg("Profile settings updated successfully!");
      
      // If editing self, update app state & localStorage immediately
      if (selectedUser.name === currentUser.name) {
        const updatedSelf: SystemUser = {
          ...currentUser,
          ...payload,
        } as SystemUser;
        onUpdateCurrentUser(updatedSelf);
      }

      setTimeout(() => {
        setSuccessMsg("");
      }, 3000);

    } catch (err) {
      console.error("Error updating profile:", err);
      setErrorMsg("Failed to save profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs animate-fade-in cursor-pointer" 
      id="settings-modal-backdrop"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-scale-up cursor-default"
        id="settings-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl">
              <User size={22} />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wide text-stone-900">Crew Profiles &amp; Settings</h2>
              <p className="text-xxs font-semibold text-stone-500 uppercase tracking-wider mt-0.5">
                Manage Security Credentials &amp; Bio Information
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentUser.isPasskeyLogin && currentUser.role !== "owner" && currentUser.name !== "System Administrator" ? (
              <span className="text-[10px] bg-amber-50 border border-amber-250 font-bold px-3 py-1 rounded-full text-amber-800 uppercase tracking-wider flex items-center gap-1">
                <ShieldAlert size={11} className="text-amber-600" /> Passkey View Only
              </span>
            ) : canEditEveryone ? (
              <span className="text-[10px] bg-teal-50 border border-teal-250 font-bold px-3 py-1 rounded-full text-teal-800 uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck size={11} className="text-teal-600" /> Administrative Access
              </span>
            ) : (
              <span className="text-[10px] bg-stone-50 border border-stone-200 font-bold px-3 py-1 rounded-full text-stone-500 uppercase tracking-wider">
                Personal settings
              </span>
            )}
            
            <button 
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100 transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
          
          {/* Left selector column */}
          {canEditEveryone && (
            <div className="md:col-span-1 border-r border-stone-100 pr-4">
              <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3">
                Choose Crew Profile
              </label>
              <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
                {crewProfiles.map((user) => {
                  const isSelf = user.name === currentUser.name;
                  const isSelected = selectedUser?.name === user.name;
                  
                  // If not Claire or Cooper, you cannot select other profiles
                  const isDisabled = !canEditEveryone && !isSelf;

                  return (
                    <button
                      key={user.name}
                      disabled={isDisabled}
                      onClick={() => setSelectedUser(user)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-teal-600 text-white shadow-md scale-102"
                          : "bg-white border border-stone-150 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border uppercase shrink-0 ${
                        isSelected ? "bg-white/20 text-white border-white/20" : user.avatarColor
                      }`}>
                        {user.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-xs font-bold leading-tight truncate">
                          {user.name} {isSelf && "(You)"}
                        </span>
                        <span className={`text-[9px] ${isSelected ? "text-teal-200" : "text-stone-400"} font-semibold uppercase truncate block mt-0.5`}>
                          {user.title || user.role}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {!canEditEveryone && (
                <p className="text-[10px] text-stone-400 font-semibold mt-4 bg-stone-50 border border-stone-150 p-2.5 rounded-lg leading-relaxed">
                  ℹ️ Only <strong>Cooper, Claire, or Mark</strong> can edit other staff members' profiles.
                </p>
              )}
            </div>
          )}

          {/* Right editor details column */}
          <div className={`${canEditEveryone ? "md:col-span-3" : "md:col-span-4"} space-y-5`}>
            {/* Tab selector for Profile Settings vs Dashboard Customisation */}
            <div className="flex border-b border-stone-150 gap-2 sm:gap-4 pb-2 mb-4 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveEditorTab("profile")}
                className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-1 transition-all cursor-pointer whitespace-nowrap ${
                  activeEditorTab === "profile"
                    ? "border-teal-600 text-teal-800"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                }`}
              >
                Crew Profile Settings
              </button>
              <button
                type="button"
                onClick={() => setActiveEditorTab("customisation")}
                className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-1 transition-all cursor-pointer whitespace-nowrap ${
                  activeEditorTab === "customisation"
                    ? "border-teal-600 text-teal-800"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                }`}
              >
                Dashboard Customisation
              </button>
              <button
                type="button"
                onClick={() => setActiveEditorTab("presets")}
                className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-1 transition-all cursor-pointer whitespace-nowrap ${
                  activeEditorTab === "presets"
                    ? "border-teal-600 text-teal-800"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                }`}
              >
                Preset Tags Manager
              </button>
              <button
                type="button"
                onClick={() => setActiveEditorTab("ai")}
                className={`pb-2 text-xs font-black tracking-wider uppercase border-b-2 px-1 transition-all cursor-pointer whitespace-nowrap ${
                  activeEditorTab === "ai"
                    ? "border-teal-600 text-teal-800"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                }`}
              >
                AI &amp; Alerts Settings
              </button>
            </div>

            {activeEditorTab === "customisation" ? (
              <div className="space-y-6 text-left animate-fade-in" id="dashboard-customiser-panel">
                {/* Section Header */}
                <div>
                  <h3 className="text-sm font-black text-stone-900 uppercase tracking-wide">
                    Dashboard Customisation &amp; Placing Settings
                  </h3>
                  <p className="text-xxs text-stone-500 font-semibold uppercase tracking-wider mt-0.5">
                    Customize your experience by toggling widgets and header tab ordering
                  </p>
                </div>

                {/* Main Customisation switch */}
                <div className="bg-stone-50 border border-stone-200 p-4.5 rounded-2xl flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-extrabold text-stone-900 uppercase">
                      Enable Dashboard Customisation
                    </h4>
                    <p className="text-[10px] text-stone-500 font-bold leading-tight uppercase">
                      Allow customized widget ordering and navigation header rearrangement
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleCustomisation?.(!customisationEnabled)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                      customisationEnabled ? "bg-teal-600" : "bg-stone-300"
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        customisationEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {customisationEnabled ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {/* Left: Widgets placing list */}
                    <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                      <div>
                        <h4 className="text-xs font-black uppercase text-stone-900 tracking-wider">
                          1. Home Screen Widgets
                        </h4>
                        <p className="text-[9px] text-stone-400 font-semibold uppercase mt-0.5">
                          Toggle visibility and click arrows to reorder dashboard elements
                        </p>
                      </div>

                      <div className="space-y-2">
                        {dashboardWidgets.map((widget, i) => {
                          const handleToggleWidget = () => {
                            const updated = dashboardWidgets.map((w, index) => 
                              index === i ? { ...w, enabled: !w.enabled } : w
                            );
                            onUpdateWidgets?.(updated);
                          };

                          const handleMoveWidgetUp = () => {
                            if (i === 0) return;
                            const updated = [...dashboardWidgets];
                            const temp = updated[i];
                            updated[i] = updated[i - 1];
                            updated[i - 1] = temp;
                            onUpdateWidgets?.(updated);
                          };

                          const handleMoveWidgetDown = () => {
                            if (i === dashboardWidgets.length - 1) return;
                            const updated = [...dashboardWidgets];
                            const temp = updated[i];
                            updated[i] = updated[i + 1];
                            updated[i + 1] = temp;
                            onUpdateWidgets?.(updated);
                          };

                          return (
                            <div key={widget.id} className="flex items-center justify-between p-3 border border-stone-150 rounded-xl bg-stone-50/50 hover:border-teal-500/20 hover:bg-stone-50 transition-all">
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={handleToggleWidget}
                                  className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
                                    widget.enabled 
                                      ? "bg-teal-600 border-teal-600 text-white" 
                                      : "border-stone-350 bg-white"
                                  }`}
                                >
                                  {widget.enabled && <CheckCircle2 size={12} className="stroke-[3px]" />}
                                </button>
                                <span className={`text-xs font-bold uppercase tracking-wide ${widget.enabled ? "text-stone-900" : "text-stone-400"}`}>
                                  {widget.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={i === 0}
                                  onClick={handleMoveWidgetUp}
                                  className="p-1 text-stone-400 hover:text-stone-800 disabled:opacity-30 cursor-pointer"
                                  title="Move Up"
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  disabled={i === dashboardWidgets.length - 1}
                                  onClick={handleMoveWidgetDown}
                                  className="p-1 text-stone-400 hover:text-stone-800 disabled:opacity-30 cursor-pointer"
                                  title="Move Down"
                                >
                                  <ArrowDown size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right: Header items placing list */}
                    <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-4">
                      <div>
                        <h4 className="text-xs font-black uppercase text-stone-900 tracking-wider">
                          2. Header Navigation Items
                        </h4>
                        <p className="text-[9px] text-stone-400 font-semibold uppercase mt-0.5">
                          Rearrange the horizontal order of tabs in your main navigation header
                        </p>
                      </div>

                      <div className="space-y-2">
                        {headerOrder.map((tabId, i) => {
                          const tabLabels: { [key: string]: string } = {
                            directory: "Herd Directory",
                            messaging: "Team Messaging",
                            audit: "Login History",
                            owner_station: "Owner Station",
                            access_requests: "Access Requests",
                            finance: "Financial Ledger",
                            checks_calendar: "Checks Registry",
                          };

                          const label = tabLabels[tabId] || tabId.toUpperCase().replace("_", " ");

                          const handleMoveTabUp = () => {
                            if (i === 0) return;
                            const updated = [...headerOrder];
                            const temp = updated[i];
                            updated[i] = updated[i - 1];
                            updated[i - 1] = temp;
                            onUpdateHeaderOrder?.(updated);
                          };

                          const handleMoveTabDown = () => {
                            if (i === headerOrder.length - 1) return;
                            const updated = [...headerOrder];
                            const temp = updated[i];
                            updated[i] = updated[i + 1];
                            updated[i + 1] = temp;
                            onUpdateHeaderOrder?.(updated);
                          };

                          return (
                            <div key={tabId} className="flex items-center justify-between p-3 border border-stone-150 rounded-xl bg-stone-50/50 hover:border-teal-500/20 hover:bg-stone-50 transition-all">
                              <span className="text-xs font-bold uppercase tracking-wide text-stone-800">
                                {label}
                              </span>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={i === 0}
                                  onClick={handleMoveTabUp}
                                  className="p-1 text-stone-400 hover:text-stone-800 disabled:opacity-30 cursor-pointer"
                                  title="Move Left"
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  disabled={i === headerOrder.length - 1}
                                  onClick={handleMoveTabDown}
                                  className="p-1 text-stone-400 hover:text-stone-800 disabled:opacity-30 cursor-pointer"
                                  title="Move Right"
                                >
                                  <ArrowDown size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-stone-50 border border-stone-150 p-6 rounded-2xl text-center text-stone-500 space-y-1.5">
                    <Sliders size={28} className="mx-auto text-stone-400" />
                    <p className="text-xs font-extrabold uppercase">Dashboard Customisation is Disabled</p>
                    <p className="text-[10px] text-stone-400 font-semibold uppercase leading-normal max-w-sm mx-auto">
                      Flick the main switch above to enable layout editing. This lets you select widgets to show on the dashboard and rearrange tabs.
                    </p>
                  </div>
                )}
              </div>
            ) : activeEditorTab === "presets" ? (
              <div className="space-y-6 text-left animate-fade-in" id="preset-tags-panel">
                <div>
                  <h3 className="text-sm font-black text-stone-900 uppercase tracking-wide">
                    Global Preset Tags Manager
                  </h3>
                  <p className="text-xxs text-stone-500 font-semibold uppercase tracking-wider mt-0.5">
                    Create and remove dynamic preset tags that are reusable across all horse records.
                  </p>
                </div>

                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1">Create a Custom Preset Tag</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newGlobalPresetInput}
                        onChange={(e) => setNewGlobalPresetInput(e.target.value)}
                        placeholder="e.g. Stud, Spelling, Quarantine"
                        className="flex-1 bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreatePresetTag();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleCreatePresetTag}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl cursor-pointer transition-colors shadow-xs uppercase tracking-wider whitespace-nowrap"
                      >
                        Create
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-150">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-stone-400 mb-2">Active Preset Tags ({presetTags?.length || 0})</label>
                    <div className="flex flex-wrap gap-2">
                      {presetTags && presetTags.length > 0 ? (
                        presetTags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white border border-stone-200 rounded-xl text-stone-800 shadow-5xs"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => handleRemovePresetTag(tag)}
                              className="text-stone-400 hover:text-red-600 font-black text-sm cursor-pointer transition-colors px-1"
                              title="Delete preset tag"
                            >
                              &times;
                            </button>
                          </span>
                        ))
                      ) : (
                        <p className="text-xxs font-bold text-stone-400 uppercase tracking-widest py-4">No custom preset tags configured.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : activeEditorTab === "ai" ? (
              <div className="space-y-6 text-left animate-fade-in" id="ai-alerts-panel">
                <div>
                  <h3 className="text-sm font-black text-stone-900 uppercase tracking-wide">
                    AI &amp; Alerts Station
                  </h3>
                  <p className="text-xxs text-stone-500 font-semibold uppercase tracking-wider mt-0.5">
                    Configure your Nova Herd AI model, system instructions, notification channels, and haptic feedback.
                  </p>
                </div>
                <div className="bg-stone-50 border border-stone-200/85 rounded-2xl p-4 overflow-y-auto max-h-[60vh]">
                  <AISettingsPage currentUser={currentUser} />
                </div>
              </div>
            ) : selectedUser ? (
              <form onSubmit={handleSaveProfile} className="space-y-5">
                {successMsg && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in">
                    <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}
                {errorMsg && (
                  <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs font-bold animate-shake">
                    {errorMsg}
                  </div>
                )}

                {currentUser.isPasskeyLogin && currentUser.role !== "owner" && currentUser.name !== "System Administrator" && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-semibold leading-relaxed mb-4">
                    You are logged in with a <strong>temporary bypass passkey</strong>. Security settings, PIN editing, and role updates are locked in this mode.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Profile Name */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Crew Member Name</label>
                    {canEditEveryone ? (
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                      />
                    ) : (
                      <div className="w-full bg-stone-100 border border-stone-200 text-stone-500 rounded-xl p-2.5 text-xs font-bold flex items-center justify-between">
                        <span>{name}</span>
                        <span className="text-[9px] bg-stone-200 text-stone-600 px-2 py-0.5 rounded-md">Locked</span>
                      </div>
                    )}
                  </div>

                  {/* Profile Title */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">Assigned Title / Role</label>
                    {canEditAccountLevel ? (
                      <input
                        type="text"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                      />
                    ) : (
                      <div className="w-full bg-stone-100 border border-stone-200 text-stone-500 rounded-xl p-2.5 text-xs font-bold flex items-center justify-between">
                        <span>{title || "Crew Member"}</span>
                        <span className="text-[9px] bg-stone-200 text-stone-600 px-2 py-0.5 rounded-md">Locked</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* PIN Code */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Secret Security PIN (4-Digit login code)
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      pattern="\d*"
                      required
                      placeholder="e.g. 1234"
                      disabled={!!currentUser.isPasskeyLogin && currentUser.role !== "owner" && currentUser.name !== "System Administrator"}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs font-bold tracking-widest focus:ring-1 focus:ring-teal-600 focus:outline-hidden disabled:bg-stone-100 disabled:text-stone-400"
                    />
                    <span className="text-[9px] text-stone-400 font-semibold block mt-1">
                      Used to securely log in from the physical PIN key pad on the Login Screen.
                    </span>
                  </div>

                  {/* DOB Field */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                      <Calendar size={13} className="text-teal-600" /> Date of Birth (DOB)
                    </label>
                    <input
                      type="date"
                      disabled={!!currentUser.isPasskeyLogin && currentUser.role !== "owner" && currentUser.name !== "System Administrator"}
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600 focus:outline-hidden disabled:bg-stone-100"
                    />
                  </div>
                </div>

                {/* Biography Bio Field */}
                <div className="mt-4">
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Biography / Personal Bio
                  </label>
                  <textarea
                    rows={2}
                    maxLength={200}
                    placeholder="Enter some background about yourself or specializations..."
                    disabled={!!currentUser.isPasskeyLogin && currentUser.role !== "owner" && currentUser.name !== "System Administrator"}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600 focus:outline-hidden disabled:bg-stone-100"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Account Tier (role) - Editable only by Owner */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">System Account Tier</label>
                    {canEditAccountLevel ? (
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as UserRole)}
                        className="w-full bg-white border border-stone-200 rounded-xl p-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                      >
                        <option value="user">User (Basic Access)</option>
                        <option value="admin">Admin (Middle Access)</option>
                        <option value="owner">Owner (Full Bypass Rights)</option>
                      </select>
                    ) : (
                      <div className="w-full bg-stone-100 border border-stone-200 text-stone-600 rounded-xl p-2.5 text-xs font-bold uppercase tracking-wider flex justify-between items-center">
                        <span>{role} Account</span>
                        <span className="text-[9px] bg-stone-200 text-stone-500 px-2 py-0.5 rounded-md">Read Only</span>
                      </div>
                    )}
                  </div>

                  {/* Info helper */}
                  <div className="flex items-center text-xxs font-semibold text-stone-400 bg-stone-50 border border-stone-150 rounded-xl p-3">
                    <HelpCircle size={15} className="text-stone-400 mr-2 shrink-0" />
                    <span>Updating credentials immediately syncs down to the team stations in real-time. Make sure to remember your PIN!</span>
                  </div>
                </div>

                {/* Avatar Color selector */}
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5 flex items-center gap-1">
                    <Palette size={13} className="text-teal-600" /> Custom Avatar Branding Color
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {COLOR_PRESETS.map((preset) => {
                      const isSelected = avatarColor === preset.value;
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          disabled={!!currentUser.isPasskeyLogin && currentUser.role !== "owner" && currentUser.name !== "System Administrator"}
                          onClick={() => setAvatarColor(preset.value)}
                          className={`p-2 rounded-xl border text-xxs font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 ${
                            isSelected 
                              ? "border-teal-600 ring-2 ring-teal-500 bg-stone-50 text-teal-950 scale-102 font-black"
                              : "border-stone-200 hover:bg-stone-50 text-stone-600 bg-white"
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded-md border uppercase ${preset.value} text-[0px] shrink-0`}>
                            Color
                          </span>
                          <span>{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Assisted Access Mode Section (Admins/Owners only can toggle) */}
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-5 space-y-4">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wide text-stone-900 flex items-center gap-1.5">
                      Accessibility Configuration
                    </h4>
                    <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider mt-0.5">
                      Manage visual styling assistance and accessibility parameters
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!canEditEveryone}
                      onClick={() => setAssistedAccessMode(!assistedAccessMode)}
                      className={`w-10 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                        assistedAccessMode ? "bg-teal-600" : "bg-stone-350"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          assistedAccessMode ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <div>
                      <span className="text-xs font-bold text-stone-850 block">Assisted Access Mode</span>
                      <span className="text-[9px] text-stone-400 font-semibold uppercase tracking-wider block">
                        {canEditEveryone 
                          ? "Enlarges typography, increases contrast, and enlarges touch targets." 
                          : "This setting must be enabled by Cooper, Claire, or Mark."}
                      </span>
                    </div>
                  </div>

                  {/* Vibration Intensity Setting */}
                  <div className="pt-4 border-t border-stone-200/60">
                    <label className="block text-xs font-bold text-stone-700 mb-1.5 uppercase tracking-wider">
                      Barn Maintenance Vibration Feedback Intensity
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["low", "medium", "high"] as const).map((intensity) => {
                        const isSelected = vibrationIntensity === intensity;
                        return (
                          <button
                            key={intensity}
                            type="button"
                            onClick={() => {
                              setVibrationIntensity(intensity);
                              if (typeof navigator !== "undefined" && navigator.vibrate) {
                                let pattern = [100, 50, 100];
                                if (intensity === "low") pattern = [40];
                                else if (intensity === "high") pattern = [250, 80, 250, 80, 250];
                                navigator.vibrate(pattern);
                              }
                            }}
                            className={`p-2 rounded-xl border text-xxs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer ${
                              isSelected
                                ? "bg-teal-600 text-white border-teal-600 shadow-sm font-extrabold"
                                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                            }`}
                          >
                            {intensity}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[9px] text-stone-400 font-semibold block mt-1.5 uppercase tracking-wider leading-relaxed">
                      Gives tactile feedback when completing maintenance logs. Tapping an option triggers a preview vibration.
                    </span>
                  </div>
                </div>

                {/* Visitor Activation Referral Code (Owner/Admin Settings) */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wide text-amber-900">Guest Activation Referral Code</h4>
                      <p className="text-[10px] text-amber-700 font-semibold uppercase tracking-wider mt-0.5">
                        Provide this code to farm visitors to authorize daily checks &amp; logs
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="bg-white border border-amber-250 font-mono text-base font-black px-4 py-2 rounded-xl text-amber-950 tracking-widest uppercase shadow-4xs select-all">
                      {visitorCode || "NOT SET"}
                    </div>
                    <span className="text-[10px] font-semibold text-amber-800 leading-normal">
                      This unique referral code is permanent and never changes, allowing reliable, long-term visitor activation.
                    </span>
                  </div>
                </div>

                {/* Employee Access Card Panel */}
                <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-5 mt-4">
                  <div className="flex items-center justify-between mb-4.5">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wide text-stone-900">Crew Security Access Badge</h4>
                      <p className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider mt-0.5">Scannable ID Card for Instant Station Login</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-1 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-[10px] px-3 py-1.5 rounded-xl uppercase tracking-wider shadow-3xs cursor-pointer transition-all"
                      >
                        Print Badge
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsDesignerOpen(true)}
                        className="inline-flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-xl uppercase tracking-wider shadow-3xs cursor-pointer transition-all"
                      >
                        🎨 Customize Badge
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-5 bg-white border border-stone-150 p-5 rounded-xl shadow-2xs relative overflow-hidden text-left">
                    <div className="absolute inset-0 bg-radial-gradient from-teal-500/3 to-stone-50/0 pointer-events-none" />
                    
                    <div className="shrink-0 z-10">
                      <BadgeQRCode name={selectedUser.name} pin={selectedUser.pin} />
                    </div>

                    <div className="flex-1 text-center sm:text-left z-10 relative w-full">
                      {/* Username & Password on TOP RIGHT */}
                      <div className="absolute top-0 right-0 text-right">
                        <div className="bg-stone-900 text-white font-mono text-[8.5px] px-2 py-1 rounded-md tracking-wider leading-normal select-all shadow-3xs uppercase font-extrabold flex flex-col items-end">
                          <span>U: {selectedUser.name.replace(/\s+/g, "").toLowerCase()}</span>
                          <span className="text-[7.5px] text-teal-400 mt-0.5 border-t border-stone-850 pt-0.5 w-full block">P: {selectedUser.pin}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-6 sm:mt-0">
                        <span className="text-[9px] bg-teal-600 text-white font-black px-2 py-0.5 rounded-md uppercase tracking-widest font-logo">
                          NOVA HERD CREW
                        </span>
                        <span className="text-[9px] bg-stone-100 text-stone-600 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                          RFID/QR SECURE
                        </span>
                      </div>
                      <h3 className="text-base font-black text-stone-900 uppercase tracking-tight mt-2.5">
                        {selectedUser.name}
                      </h3>
                      <p className="text-xs font-bold text-teal-700 uppercase tracking-wider mt-0.5">
                        {selectedUser.title || selectedUser.role}
                      </p>
                      {visitorCode && (
                        <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase flex justify-between items-center">
                          <span>Visitor Code:</span>
                          <span className="bg-amber-100 px-1.5 py-0.5 rounded tracking-wider">{visitorCode}</span>
                        </div>
                      )}
                      <div className="mt-2.5 pt-2.5 border-t border-stone-100 text-[10px] font-semibold text-stone-400 leading-relaxed max-w-sm">
                        Hold this secure card up to any terminal webcam or scanner to log in instantly. Authorized personnel only.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-3 border-t border-stone-100">
                  <button
                    type="submit"
                    disabled={isSubmitting || (!!currentUser.isPasskeyLogin && currentUser.role !== "owner" && currentUser.name !== "System Administrator")}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md hover:scale-102 disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      "Save Profile Settings"
                    )}
                  </button>
                </div>

              </form>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-stone-400">
                <HelpCircle size={32} className="mx-auto text-stone-300 mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider">No Profile Selected</p>
                <p className="text-[10px] text-stone-400 mt-1">Select a crew member profile on the left to start editing.</p>
              </div>
            )}
          </div>

        </div>
      </div>

      <BadgeDesigner
        isOpen={isDesignerOpen}
        onClose={() => setIsDesignerOpen(false)}
        userProfile={selectedUser || undefined}
      />
    </div>
  );
}
