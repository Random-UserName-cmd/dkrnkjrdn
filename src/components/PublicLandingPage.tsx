import React, { useState, useEffect } from "react";
import HorseSenseLogo from "./HorseSenseLogo";
import { 
  Shield, Key, Check, Sparkles, Building2, ArrowRight, UserCheck, 
  CreditCard, ChevronRight, Zap, Globe, Lock, Users, HelpCircle, X,
  CheckCircle2, AlertCircle, RefreshCw, Star, Mail, Phone, MessageSquare,
  Send, FileText, CheckSquare, Menu, Clock, Server, Layers, Palette, Cookie, Sliders,
  Sun, Moon, Eye, Award, Copy, Hourglass, Download, Search
} from "lucide-react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, setDoc, addDoc } from "firebase/firestore";
import { SystemUser, RegisteredFarm, PricingPlan } from "../types";
import { ensureDemoHorsesExist } from "../utils/demoHorses";

export const DEFAULT_PRICING_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Micro Farm",
    monthlyPrice: 0,
    annualPrice: 0,
    popular: false,
    maxHorses: "5 Horses or Less",
    features: [
      "Up to 5 Horses max",
      "Single User Account (Owner only)",
      "Basic Herd Profile & DOB Records",
      "Simple Shoeing & Vet Reminders",
      "Essential Daily Health Check-ins"
    ]
  },
  {
    id: "pay_per_horse",
    name: "Pay Per Horse",
    monthlyPrice: 1,
    annualPrice: 1,
    popular: false,
    maxHorses: "Flexible Herd Size",
    isPayPerHorse: true,
    unit: "$1 USD / horse / mo",
    features: [
      "$1.00 USD per horse per month",
      "Scale up or down dynamically",
      "Full Herd Health & Medical Logs",
      "Shoeing & Farrier Schedules",
      "Unlimited Staff & Guest PIN Logins",
      "Real-time Paddock Status"
    ]
  },
  {
    id: "starter",
    name: "Paddock Starter",
    monthlyPrice: 49,
    annualPrice: 39,
    popular: false,
    maxHorses: "Up to 15 Horses",
    features: [
      "Full Herd Directory & Profiles",
      "Paddock Health Checks & Audits",
      "Shoeing & Vet Reminders",
      "Up to 3 Staff User Logins",
      "Basic Private Notes Workspace"
    ]
  },
  {
    id: "pro",
    name: "Farm Professional",
    monthlyPrice: 149,
    annualPrice: 119,
    popular: true,
    maxHorses: "Up to 50 Horses",
    features: [
      "Everything in Starter, plus:",
      "AI Herd Assistant & Paddock Vision",
      "Staff Badge & QR Scanner Terminal",
      "Financial Ledger & Expense Tracking",
      "Unlimited Staff Accounts with PINs",
      "Team Real-time Messaging",
      "Agistor & Rider Client Portals"
    ]
  },
  {
    id: "enterprise",
    name: "Enterprise Stud",
    monthlyPrice: 349,
    annualPrice: 289,
    popular: false,
    maxHorses: "Unlimited Horses & Facilities",
    features: [
      "Everything in Pro, plus:",
      "Multi-Facility & Multi-Barn Routing",
      "Custom IT Owner Station & Audit Controls",
      "Visitor Security Gate Pass Codes",
      "24/7 Dedicated Support & Data Exports",
      "Custom Branding & White-Label Badges"
    ]
  }
];

export const INITIAL_FARMS: RegisteredFarm[] = [
  {
    id: "horse_sense",
    name: "Horse Sense",
    ownerName: "System Administrator",
    ownerEmail: "admin@horsesense.app",
    ownerPhone: "0419 883 201",
    farmAddress: "161 Gilberti Rd, Western Australia",
    plan: "Enterprise Stud",
    createdAt: "2024-01-15",
    status: "active"
  },
  {
    id: "nova_herd_main",
    name: "Nova Herd Main Facility",
    ownerName: "Claire Wright",
    ownerEmail: "claire@novaherd.com",
    ownerPhone: "0412 555 789",
    farmAddress: "45 Meadow Lane, Western Australia",
    plan: "Farm Professional",
    createdAt: "2024-03-10",
    status: "active"
  }
];

interface PublicLandingPageProps {
  onEnterFarm: (farmName?: string) => void;
  onLoginUser: (user: SystemUser) => void;
}

export default function PublicLandingPage({ onEnterFarm, onLoginUser }: PublicLandingPageProps) {
  // SaaS Settings State
  const [allowSignups, setAllowSignups] = useState<boolean>(true);
  const [headline, setHeadline] = useState("The Operating System for Modern Horse Farms & Herds");
  const [subheadline, setSubheadline] = useState("Streamline herd tracking, paddock health, AI assistant guidance, staff access badges, and financial ledgers for your herd facility.");
  const [announcement, setAnnouncement] = useState("Horse Sense Live - Complete Equestrian Herd Management Platform");
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>(DEFAULT_PRICING_PLANS);
  const [registeredFarms, setRegisteredFarms] = useState<RegisteredFarm[]>(INITIAL_FARMS);

  // Recent Farms stored in LocalStorage for device isolation
  const [recentFarms, setRecentFarms] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("recent_farms");
      return saved ? JSON.parse(saved) : ["Ruabon Farm & Herd Center"];
    } catch {
      return ["Ruabon Farm & Herd Center"];
    }
  });

  const saveRecentFarm = (farmNameStr: string) => {
    const clean = farmNameStr.trim();
    if (!clean) return;
    setRecentFarms(prev => {
      const updated = [clean, ...prev.filter(f => f.toLowerCase() !== clean.toLowerCase())].slice(0, 10);
      try {
        localStorage.setItem("recent_farms", JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save recent farm:", e);
      }
      return updated;
    });
  };

  const removeRecentFarm = (farmNameStr: string) => {
    setRecentFarms(prev => {
      const updated = prev.filter(f => f.toLowerCase() !== farmNameStr.toLowerCase());
      try {
        localStorage.setItem("recent_farms", JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  // Active Page Navigation State (Separate pages requirement)
  const [currentPage, setCurrentPage] = useState<"home" | "about" | "features" | "pricing" | "farms" | "contact">("home");

  // Contact Form State
  const [contactName, setContactName] = useState("");
  const [contactFarm, setContactFarm] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPriority, setContactPriority] = useState("Standard Support");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSuccess, setContactSuccess] = useState(false);
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  // Billing Cycle
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");

  // Modals state
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [showSignUpModal, setShowSignUpModal] = useState(false);
  const [selectedPlanForSignUp, setSelectedPlanForSignUp] = useState<string>("free");
  const [registeredLicenseModal, setRegisteredLicenseModal] = useState<{ farm: RegisteredFarm; token: string; activationTime: string } | null>(null);
  const [pendingActivationModalFarm, setPendingActivationModalFarm] = useState<RegisteredFarm | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Sign Up Form State
  const [newFarmName, setNewFarmName] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newOwnerPin, setNewOwnerPin] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [newLivestockType, setNewLivestockType] = useState("Horses");
  const [selectedHerds, setSelectedHerds] = useState<string[]>(["Horses"]);

  const toggleHerdSelection = (herdId: string) => {
    setSelectedHerds(prev => {
      if (prev.includes(herdId)) {
        if (prev.length === 1) return prev;
        return prev.filter(h => h !== herdId);
      } else {
        return [...prev, herdId];
      }
    });
  };

  // Credit Card Details
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardZip, setCardZip] = useState("");

  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [signUpSuccess, setSignUpSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sign In Modal State
  const [signInSearch, setSignInSearch] = useState("");
  const [showForgotFarm, setShowForgotFarm] = useState(false);
  const [forgotQuery, setForgotQuery] = useState("");
  const [forgotFarmMatches, setForgotFarmMatches] = useState<RegisteredFarm[]>([]);
  const [hasSearchedForgot, setHasSearchedForgot] = useState(false);

  const handleForgotFarmSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = forgotQuery.trim().toLowerCase();
    if (!query) {
      setForgotFarmMatches([]);
      setHasSearchedForgot(false);
      return;
    }

    const cleanDigits = query.replace(/\D/g, "");

    const matched = registeredFarms.filter((f) => {
      const fName = (f.name || "").toLowerCase();
      const oName = (f.ownerName || "").toLowerCase();
      const oEmail = (f.ownerEmail || "").toLowerCase();
      const oPhone = (f.ownerPhone || "").toLowerCase();
      const oPhoneDigits = (f.ownerPhone || "").replace(/\D/g, "");

      const matchesName = fName.includes(query) || oName.includes(query);
      const matchesEmail = oEmail.includes(query);
      const matchesPhone = (cleanDigits.length >= 3 && oPhoneDigits.includes(cleanDigits)) || oPhone.includes(query);

      return matchesName || matchesEmail || matchesPhone;
    });

    setForgotFarmMatches(matched);
    setHasSearchedForgot(true);
  };

  // Website Theme State
  const [websiteTheme, setWebsiteTheme] = useState<"dark" | "light" | "crimson" | "ocean" | "charcoal">(
    () => {
      try {
        return (localStorage.getItem("nova_website_theme") as any) || "ocean";
      } catch {
        return "ocean";
      }
    }
  );
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState<boolean>(false);

  const changeWebsiteTheme = (
    newTheme: "dark" | "light" | "crimson" | "ocean" | "charcoal"
  ) => {
    setWebsiteTheme(newTheme);
    setIsThemeMenuOpen(false);
    try {
      localStorage.setItem("nova_website_theme", newTheme);
    } catch (e) {
      console.error(e);
    }
  };

  const getThemeContainerClass = () => {
    switch (websiteTheme) {
      case "light":
        return "bg-slate-50 text-slate-900";
      case "crimson":
        return "bg-[#18080a] text-rose-100";
      case "ocean":
        return "bg-[#081325] text-sky-100";
      case "charcoal":
        return "bg-[#121417] text-stone-100";
      case "dark":
      default:
        return "bg-stone-950 text-stone-100";
    }
  };

  // Cookie Consent State
  const [cookieConsent, setCookieConsent] = useState<string | null>(() => {
    try {
      return localStorage.getItem("nova_cookie_consent");
    } catch {
      return null;
    }
  });
  const [showCookieBanner, setShowCookieBanner] = useState<boolean>(() => !cookieConsent);
  const [showCookieSettingsModal, setShowCookieSettingsModal] = useState<boolean>(false);
  const [analyticsCookies, setAnalyticsCookies] = useState<boolean>(true);
  const [sessionCookies, setSessionCookies] = useState<boolean>(true);

  const handleAcceptAllCookies = () => {
    setCookieConsent("all");
    setShowCookieBanner(false);
    try {
      localStorage.setItem("nova_cookie_consent", "all");
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcceptEssentials = () => {
    setCookieConsent("essentials");
    setShowCookieBanner(false);
    try {
      localStorage.setItem("nova_cookie_consent", "essentials");
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveCustomCookieSettings = () => {
    const pref = analyticsCookies ? "custom_analytics" : "custom_essentials";
    setCookieConsent(pref);
    setShowCookieBanner(false);
    setShowCookieSettingsModal(false);
    try {
      localStorage.setItem("nova_cookie_consent", pref);
    } catch (e) {
      console.error(e);
    }
  };

  // Feature Interactive Preview Modal State
  const [activeFeatureModal, setActiveFeatureModal] = useState<string | null>(null);

  // Interactive Feature Simulator States
  const [simPaddockChecked, setSimPaddockChecked] = useState<{ [key: string]: boolean }>({
    "Paddock A - Water Trough": true,
    "Paddock B - Gate Perimeter": true,
    "Paddock C - Pasture Trough": false,
    "Main Barn - Stall 4 Feed": false,
  });
  const [simAiQuery, setSimAiQuery] = useState("What is the optimal feed ration for a 500kg warmblood in moderate work?");
  const [simAiReply, setSimAiReply] = useState("For a 500kg Warmblood in moderate work, supply 2.0% of body weight in forage daily (~10kg Timothy/Alfalfa hay split into 3 feeds) plus 2.5kg electrolyte-balanced grain concentrate and constant clean water access.");
  const [simPinInput, setSimPinInput] = useState("");
  const [simPinVerified, setSimPinVerified] = useState<boolean | null>(null);
  const [simChatMsg, setSimChatMsg] = useState("");
  const [simChatList, setSimChatList] = useState([
    { id: "1", sender: "Operations Lead", text: "Morning team! All morning paddock water checks completed.", time: "07:15 AM" },
    { id: "2", sender: "Barn Mgr Sarah", text: "Dr. Evans confirmed shoeing appointment for Ruabon Star tomorrow.", time: "08:30 AM" }
  ]);
  const [simSelectedSpecies, setSimSelectedSpecies] = useState("Horses");
  const [simExpenseList, setSimExpenseList] = useState([
    { category: "Shoeing & Farrier", amount: 350, date: "Today", vendor: "Apex Farrier" },
    { category: "Feed & Alfalfa", amount: 1200, date: "Yesterday", vendor: "Valley Grain Co." },
    { category: "Veterinary Scopes", amount: 450, date: "Jul 28", vendor: "Herd Vet Care" }
  ]);
  const [simOwnerPerms, setSimOwnerPerms] = useState({
    allowStaffEdit: true,
    requirePinChecks: true,
    customEmbeds: true,
    autoAuditLog: true
  });

  // Listen for SaaS settings from Firestore
  const [fontFamily, setFontFamily] = useState<string>("Plus Jakarta Sans");
  const [fontFormat, setFontFormat] = useState<string>("normal");
  const [fontScale, setFontScale] = useState<string>("standard");
  const [customIframeCode, setCustomIframeCode] = useState<string>("");
  const [customIframeTitle, setCustomIframeTitle] = useState<string>("Featured Facility Tour & Weather Widget");
  const [customIframeEnabled, setCustomIframeEnabled] = useState<boolean>(false);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "saas_config", "settings"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (typeof data.allowSignups === "boolean") setAllowSignups(data.allowSignups);
        if (data.headline) setHeadline(data.headline);
        if (data.subheadline) setSubheadline(data.subheadline);
        if (data.announcement) setAnnouncement(data.announcement);

        if (data.fontFamily) setFontFamily(data.fontFamily);
        if (data.fontFormat) setFontFormat(data.fontFormat);
        if (data.fontScale) setFontScale(data.fontScale);
        if (data.customIframeCode !== undefined) setCustomIframeCode(data.customIframeCode);
        if (data.customIframeTitle !== undefined) setCustomIframeTitle(data.customIframeTitle);
        if (data.customIframeEnabled !== undefined) setCustomIframeEnabled(data.customIframeEnabled);
      }
    });

    const unsubPricing = onSnapshot(doc(db, "saas_config", "pricing"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.plans) && data.plans.length > 0) {
          setPricingPlans(data.plans);
        }
      }
    });

    const unsubFarms = onSnapshot(collection(db, "registered_farms"), (snapshot) => {
      if (!snapshot.empty) {
        const list: RegisteredFarm[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as RegisteredFarm);
        });
        setRegisteredFarms(list);
      }
    });

    return () => {
      unsubSettings();
      unsubPricing();
      unsubFarms();
    };
  }, []);

  // Start Demo Helper - Creates and launches "Demo Farm" instantly
  const handleStartDemo = async () => {
    const demoFarmName = "Demo Farm";
    const demoFarmId = "demo_farm";

    try {
      const demoFarmDoc: RegisteredFarm = {
        id: demoFarmId,
        name: demoFarmName,
        ownerName: "Demo Owner",
        ownerEmail: "demo@farm.com",
        plan: "Enterprise Stud",
        createdAt: new Date().toISOString().split("T")[0],
        status: "active",
        livestockType: "Horses & Herd"
      };

      await setDoc(doc(db, "registered_farms", demoFarmId), demoFarmDoc);

      const demoOwnerUser: SystemUser = {
        name: "Demo Owner",
        role: "owner",
        title: "Demo Farm Owner & Facility Admin",
        pin: "1234",
        avatarColor: "bg-teal-600",
        hasCustomPin: true,
        farmName: demoFarmName,
        farmId: demoFarmId
      };

      await setDoc(doc(db, "crew_profiles", "Demo Owner"), demoOwnerUser);
      await ensureDemoHorsesExist();
    } catch (e) {
      console.error("Error setting up demo farm:", e);
    }

    saveRecentFarm(demoFarmName);
    onEnterFarm(demoFarmName);
  };

  // Handle Portal Lookup & Launch - Check existing farm before navigating/opening
  const handlePortalLaunch = (rawName: string) => {
    const trimmed = rawName.trim();
    if (!trimmed) return;

    const lowerInput = trimmed.toLowerCase();
    if (lowerInput === "demo" || lowerInput === "demo farm" || lowerInput === "demo-farm") {
      handleStartDemo();
      return;
    }

    let deletedFarmIds: string[] = [];
    try {
      const savedDeleted = localStorage.getItem("deleted_farm_ids");
      if (savedDeleted) deletedFarmIds = JSON.parse(savedDeleted);
    } catch (e) {}

    const allValidFarms = [...INITIAL_FARMS, ...registeredFarms].filter(f => !deletedFarmIds.includes(f.id));

    const slugInput = lowerInput.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const cleanDigits = trimmed.replace(/\D/g, "");

    const matchingFarm = allValidFarms.find(f => {
      const nameSlug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const idSlug = f.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const matchesNameOrId = nameSlug === slugInput || idSlug === slugInput || f.name.toLowerCase() === lowerInput || f.id.toLowerCase() === lowerInput;
      const matchesToken = f.licenseToken && cleanDigits.length >= 8 && f.licenseToken === cleanDigits;
      return matchesNameOrId || matchesToken;
    });

    if (matchingFarm) {
      // Check if 24-hour activation is pending
      const isPending = (matchingFarm.status === "pending_activation" || (matchingFarm.activationTime && new Date(matchingFarm.activationTime).getTime() > Date.now())) && matchingFarm.id !== "ruabon_farm" && matchingFarm.id !== "demo_farm";
      
      if (isPending) {
        setPendingActivationModalFarm(matchingFarm);
        return;
      }

      saveRecentFarm(matchingFarm.name);
      onEnterFarm(matchingFarm.name);
    } else {
      // If the farm does NOT exist, navigate to /<slug> which will trigger 404 Page Not Found
      const slug = slugInput || "unknown-farm";
      if (window.location.pathname !== `/${slug}`) {
        window.history.pushState({}, "", `/${slug}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }
  };

  // Instant Activate Handler (for instant activation after 24h or testing override)
  const handleInstantActivate = async (farm: RegisteredFarm) => {
    try {
      const updatedFarm: RegisteredFarm = {
        ...farm,
        status: "active",
        activationTime: new Date(Date.now() - 1000).toISOString()
      };
      await setDoc(doc(db, "registered_farms", farm.id), updatedFarm, { merge: true });
      setRegisteredFarms(prev => prev.map(f => f.id === farm.id ? updatedFarm : f));
      setPendingActivationModalFarm(null);
      setRegisteredLicenseModal(null);
      saveRecentFarm(farm.name);
      onEnterFarm(farm.name);
    } catch (e) {
      console.error("Error activating farm:", e);
    }
  };

  // Download official license key as .txt file
  const handleDownloadLicense = (farm: RegisteredFarm, token: string, activationTime?: string) => {
    const textContent = `=====================================================
NOVA HERD - OFFICIAL FARM LICENSE KEY
=====================================================

Facility Name:     ${farm.name}
Facility ID:       ${farm.id}
Owner Name:        ${farm.ownerName}
Owner Email:       ${farm.ownerEmail || "N/A"}
Assigned Plan:     ${farm.plan}
Livestock Focus:   ${farm.livestockType || "Horses"}
Registration Date: ${farm.createdAt}
Activation Time:   ${activationTime ? new Date(activationTime).toLocaleString() : "24 Hours from Registration"}

-----------------------------------------------------
20-DIGIT MASTER LICENSE TOKEN:
${token.replace(/(\d{4})/g, "$1 ").trim()}
-----------------------------------------------------

AUTHENTICATION INSTRUCTIONS:
1. Keep this official license token secure and offline.
2. You can authenticate into your dedicated Farm Console using either your Farm Name or your 20-digit License Token.
3. Access opens automatically once the 24-hour verification window elapses.

Nova Herd Infrastructure Security Team
=====================================================`;

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `NovaHerd_License_${farm.id || "farm"}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle Sign Up Submission - Creates new farm with 20-digit license token and 24-hour activation delay
  const handleRegisterFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFarmName.trim() || !newOwnerName.trim() || !newOwnerPin.trim()) {
      setSignUpError("Please fill in all required fields (Farm Name, Owner Name, PIN)");
      return;
    }
    setIsSubmitting(true);
    setSignUpError(null);
    try {
      const cleanName = newFarmName.trim();
      const farmId = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_");

      // Generate 20-digit random license token
      const licenseToken = Array.from({ length: 20 }, () => Math.floor(Math.random() * 10)).join("");
      // 24-hour activation delay
      const activationTimestamp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const newFarm: RegisteredFarm = {
        id: farmId,
        name: cleanName,
        ownerName: newOwnerName.trim(),
        ownerEmail: newOwnerEmail.trim() || `${newOwnerName.toLowerCase().replace(/\s+/g, ".")}@farm.com`,
        plan: selectedPlanForSignUp,
        createdAt: new Date().toISOString().split("T")[0],
        activationTime: activationTimestamp,
        licenseToken: licenseToken,
        status: "pending_activation",
        livestockType: selectedHerds.join(", ") || "Horses"
      };

      // Save farm document to registered_farms collection
      await setDoc(doc(db, "registered_farms", farmId), newFarm);

      // Create owner user profile ONLY for this farm
      const newOwnerUser: SystemUser = {
        name: newOwnerName.trim(),
        role: "owner",
        title: "Farm Owner & Facility Admin",
        pin: newOwnerPin.trim(),
        avatarColor: "bg-teal-600",
        hasCustomPin: true,
        farmName: cleanName,
        farmId: farmId
      };

      await setDoc(doc(db, "crew_profiles", newOwnerName.trim()), newOwnerUser);

      setRegisteredFarms(prev => [...prev.filter(f => f.id !== farmId), newFarm]);
      setShowSignUpModal(false);
      setRegisteredLicenseModal({
        farm: newFarm,
        token: licenseToken,
        activationTime: activationTimestamp
      });
    } catch (err: any) {
      console.error("Error registering farm:", err);
      setSignUpError(err.message || "Failed to register new farm.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      return;
    }
    setIsSubmittingContact(true);
    try {
      await addDoc(collection(db, "saas_inquiries"), {
        name: contactName.trim(),
        farm: contactFarm.trim() || "Not specified",
        email: contactEmail.trim(),
        priority: contactPriority,
        message: contactMessage.trim(),
        createdAt: new Date().toISOString()
      });
      setContactSuccess(true);
      setContactName("");
      setContactFarm("");
      setContactEmail("");
      setContactMessage("");
      setTimeout(() => setContactSuccess(false), 5000);
    } catch (err) {
      console.error("Error sending inquiry:", err);
    } finally {
      setIsSubmittingContact(false);
    }
  };

  const isLight = websiteTheme === "light";

  const getThemeHeroClass = () => {
    switch (websiteTheme) {
      case "light":
        return "bg-gradient-to-b from-slate-100 via-white to-slate-100 border-b border-slate-200 text-slate-900";
      case "crimson":
        return "bg-gradient-to-b from-[#20090c] via-[#150507] to-[#100305] border-b border-rose-900/30 text-rose-100";
      case "ocean":
        return "bg-gradient-to-b from-[#0a1e3b] via-[#071426] to-[#040c18] border-b border-sky-900/30 text-sky-100";
      case "charcoal":
        return "bg-gradient-to-b from-[#1a1d22] via-[#121417] to-[#0c0d10] border-b border-slate-800/40 text-stone-100";
      case "dark":
      default:
        return "bg-gradient-to-b from-stone-950 via-stone-900 to-stone-950 border-b border-stone-850 text-stone-100";
    }
  };

  const getThemeHeaderClass = () => {
    switch (websiteTheme) {
      case "light":
        return "bg-white/95 border-b border-slate-200 text-slate-900 shadow-2xs backdrop-blur-md";
      case "crimson":
        return "bg-[#18080a]/90 border-b border-rose-950 text-rose-100 backdrop-blur-md";
      case "ocean":
        return "bg-[#081325]/90 border-b border-sky-950 text-sky-100 backdrop-blur-md";
      case "charcoal":
        return "bg-[#121417]/90 border-b border-slate-900 text-stone-100 backdrop-blur-md";
      case "dark":
      default:
        return "bg-stone-950/90 border-b border-stone-850 text-stone-100 backdrop-blur-md";
    }
  };

  const themePage = isLight ? "bg-slate-100 text-slate-900" : getThemeContainerClass();
  const themeHeader = getThemeHeaderClass();
  const themeHero = getThemeHeroClass();
  const themeSection = isLight ? "bg-slate-50 border-b border-slate-200 text-slate-900" : (
    websiteTheme === "crimson" ? "bg-[#140608] border-b border-rose-950/60 text-rose-100" :
    websiteTheme === "ocean" ? "bg-[#060f1e] border-b border-sky-950/60 text-sky-100" :
    websiteTheme === "charcoal" ? "bg-[#101215] border-b border-slate-900/80 text-stone-100" :
    "bg-stone-950 border-b border-stone-850 text-stone-100"
  );
  const themeAltSection = isLight ? "bg-white border-b border-slate-200 text-slate-900" : (
    websiteTheme === "crimson" ? "bg-[#1a080a]/90 border-b border-rose-950 text-rose-100" :
    websiteTheme === "ocean" ? "bg-[#081528]/90 border-b border-sky-950 text-sky-100" :
    websiteTheme === "charcoal" ? "bg-[#14161a]/90 border-b border-slate-900 text-stone-100" :
    "bg-stone-900/80 border-b border-stone-850 text-stone-100"
  );
  const themeCard = isLight ? "bg-white border border-slate-200 text-slate-900 shadow-xs" : (
    websiteTheme === "crimson" ? "bg-[#1e0a0d] border border-rose-900/40 text-rose-100" :
    websiteTheme === "ocean" ? "bg-[#0a182c] border border-sky-900/40 text-sky-100" :
    websiteTheme === "charcoal" ? "bg-[#16181d] border border-slate-800 text-stone-100" :
    "bg-stone-900 border border-stone-800 text-stone-100"
  );
  const themeInteractiveCard = isLight 
    ? "bg-white border border-slate-200 text-slate-900 shadow-xs hover:border-teal-600 hover:shadow-md transition-all cursor-pointer" 
    : (
      websiteTheme === "crimson" ? "bg-[#1e0a0d] border border-rose-900/40 text-rose-100 hover:border-rose-500/50 transition-all cursor-pointer" :
      websiteTheme === "ocean" ? "bg-[#0a182c] border border-sky-900/40 text-sky-100 hover:border-sky-500/50 transition-all cursor-pointer" :
      websiteTheme === "charcoal" ? "bg-[#16181d] border border-slate-800 text-stone-100 hover:border-slate-500/50 transition-all cursor-pointer" :
      "bg-stone-900 border border-stone-800 text-stone-100 hover:border-teal-500/40 transition-all cursor-pointer"
    );
  const themeTextHead = isLight ? "text-slate-900" : "text-white";
  const themeTextSub = isLight ? "text-slate-600" : (
    websiteTheme === "crimson" ? "text-rose-300/80" :
    websiteTheme === "ocean" ? "text-sky-300/80" :
    websiteTheme === "charcoal" ? "text-slate-400" :
    "text-stone-400"
  );
  const themeFooter = isLight ? "bg-white border-t border-slate-200 text-slate-800" : (
    websiteTheme === "crimson" ? "bg-[#120406] border-t border-rose-950 text-rose-200" :
    websiteTheme === "ocean" ? "bg-[#040a14] border-t border-sky-950 text-sky-200" :
    websiteTheme === "charcoal" ? "bg-[#0e0f12] border-t border-slate-900 text-stone-300" :
    "bg-stone-950 border-t border-stone-850 text-stone-300"
  );

  return (
    <div 
      className={`min-h-screen ${themePage} font-sans selection:bg-teal-500 selection:text-white flex flex-col justify-between transition-colors duration-300 relative`}
      style={{ fontFamily: fontFamily || "Plus Jakarta Sans, sans-serif" }}
    >
      {/* Real-time Color Filter Wash Overlays */}
      {websiteTheme === "crimson" && (
        <div className="pointer-events-none fixed inset-0 z-30 bg-rose-950/15 mix-blend-color transition-opacity duration-700" />
      )}
      {websiteTheme === "ocean" && (
        <div className="pointer-events-none fixed inset-0 z-30 bg-sky-950/20 mix-blend-color transition-opacity duration-700" />
      )}
      {websiteTheme === "charcoal" && (
        <div className="pointer-events-none fixed inset-0 z-30 bg-stone-900/15 mix-blend-saturation transition-opacity duration-700" />
      )}
      
      {/* Top Announcement Bar */}
      {announcement && (
        <div className={`text-xs font-bold py-2 px-4 text-center border-b flex items-center justify-center gap-2 ${
          isLight ? "bg-teal-50 border-teal-200 text-teal-800" : "bg-gradient-to-r from-teal-900 via-stone-900 to-amber-950 text-stone-200 border-teal-800/40"
        }`}>
          <Sparkles size={14} className="text-amber-500 shrink-0 animate-pulse" />
          <span>{announcement}</span>
        </div>
      )}

      {/* Main Header / Navigation Bar */}
      <header className={`sticky top-0 z-40 transition-colors duration-300 ${themeHeader}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          
          {/* Logo & Brand Name */}
          <div 
            className="flex items-center space-x-3 cursor-pointer select-none" 
            onClick={() => {
              setCurrentPage("home");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <HorseSenseLogo className="w-11 h-11 border-stone-700" />
            <div>
              <h1 className={`text-xl font-black tracking-[0.14em] pl-[0.14em] uppercase leading-none font-logo ${themeTextHead}`}>Nova Herd</h1>
              <p className="text-[10px] text-teal-600 font-bold uppercase tracking-widest leading-none mt-1">Enterprise Herd Platform</p>
            </div>
          </div>

          {/* Separate Website Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 sm:space-x-2 text-xs font-extrabold uppercase tracking-wider">
            {[
              { id: "home", label: "Home" },
              { id: "about", label: "About Us" },
              { id: "features", label: "Features" },
              { id: "pricing", label: "Pricing Plans" },
              { id: "farms", label: "Registered Farms" },
              { id: "contact", label: "Contact & Sales" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setCurrentPage(p.id as any);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`px-3 py-2 rounded-xl transition-all cursor-pointer ${
                  currentPage === p.id
                    ? (isLight ? "bg-teal-500/15 text-teal-800 border border-teal-300 font-black shadow-2xs" : "bg-teal-500/15 text-teal-300 border border-teal-500/30 font-black shadow-xs")
                    : (isLight ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100" : "text-stone-400 hover:text-white hover:bg-stone-900")
                }`}
              >
                {p.label}
              </button>
            ))}
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center space-x-2.5">
            {/* Theme Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                className={`font-bold text-xs uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-sm border ${
                  isLight
                    ? "bg-slate-100 hover:bg-slate-200 text-sky-600 border-sky-300"
                    : "bg-[#091628] hover:bg-[#0e213b] text-sky-400 border-sky-500/40"
                }`}
                title="Select Theme"
              >
                <Palette size={16} className="text-sky-400" />
                <span>THEME</span>
              </button>

              {isThemeMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl shadow-2xl p-2.5 z-50 space-y-1 bg-[#09111e] border border-slate-800 text-slate-100 backdrop-blur-xl">
                  <div className="px-2.5 py-1 mb-1.5 text-[11px] font-bold text-sky-400 uppercase tracking-widest border-b border-slate-800/80 font-mono">
                    SELECT THEME
                  </div>
                  {[
                    { id: "dark", label: "Dark Mode", dotBg: "bg-emerald-500" },
                    { id: "light", label: "Light Mode", dotBg: "bg-emerald-500" },
                    { id: "crimson", label: "Crimson Red", dotBg: "bg-rose-500" },
                    { id: "ocean", label: "Ocean Blue", dotBg: "bg-sky-400" },
                    { id: "charcoal", label: "Charcoal Gray", dotBg: "bg-slate-400" },
                  ].map((t) => {
                    const isSelected = websiteTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => changeWebsiteTheme(t.id as any)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? "bg-slate-800/90 text-white font-black"
                            : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-3 h-3 rounded-full ${t.dotBg} shrink-0 shadow-xs`} />
                          <span>{t.label}</span>
                        </div>
                        {isSelected && <Check size={14} className="text-white shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowSignInModal(true)}
              className={`font-bold text-xs uppercase tracking-wider px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                isLight ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300" : "bg-stone-850 hover:bg-stone-800 text-stone-200 border border-stone-700"
              }`}
            >
              <Key size={14} className="text-teal-500" /> Sign In to Farm
            </button>

            {allowSignups ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedPlanForSignUp("starter");
                  setShowSignUpModal(true);
                }}
                className="text-stone-400 hover:text-stone-200 text-xs font-semibold uppercase tracking-wider px-3 py-2 rounded-xl transition-all border border-stone-800 hover:border-stone-700 bg-stone-900/60 cursor-pointer flex items-center gap-1.5"
              >
                <Building2 size={13} /> Register Farm
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="bg-stone-800 text-stone-500 font-bold text-xs uppercase tracking-wider px-3 py-2 rounded-xl border border-stone-700 cursor-not-allowed flex items-center gap-1.5 opacity-60"
              >
                <Lock size={13} /> Signups Paused
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Pill Bar */}
        <div className="md:hidden flex items-center gap-1.5 overflow-x-auto px-4 py-2 bg-stone-900/90 border-t border-stone-850 text-[11px] font-extrabold uppercase tracking-wider no-scrollbar">
          {[
            { id: "home", label: "Home" },
            { id: "about", label: "About" },
            { id: "features", label: "Features" },
            { id: "pricing", label: "Pricing" },
            { id: "farms", label: "Farms" },
            { id: "contact", label: "Contact" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setCurrentPage(p.id as any);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`shrink-0 px-3 py-1.5 rounded-lg transition-all ${
                currentPage === p.id
                  ? "bg-teal-500 text-stone-950 font-black"
                  : "text-stone-400 bg-stone-950 border border-stone-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* PAGE 1: HOME PAGE */}
      {currentPage === "home" && (
        <div className="space-y-0">
          {/* Hero Section */}
          <section className="relative overflow-hidden py-20 lg:py-28 bg-gradient-to-b from-stone-950 via-stone-900 to-stone-950 border-b border-stone-850">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-1/3 right-10 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-8">
              <div className="inline-flex items-center gap-2 bg-stone-900/90 border border-teal-500/30 text-teal-300 text-xs font-bold px-4 py-1.5 rounded-full shadow-inner">
                <Shield size={14} className="text-teal-400" />
                <span>Enterprise Cloud Infrastructure for Horse Herds</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl mx-auto font-logo uppercase">
                {headline}
              </h1>

              <p className="text-sm sm:text-base text-stone-400 max-w-2xl mx-auto font-medium leading-relaxed">
                {subheadline}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                <button
                  onClick={() => {
                    setCurrentPage("pricing");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="w-full sm:w-auto bg-teal-500 hover:bg-teal-400 text-stone-950 font-black text-xs uppercase tracking-wider px-8 py-4 rounded-2xl transition-all shadow-xl shadow-teal-500/10 flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <span>Explore Subscription Plans</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={() => {
                    setCurrentPage("farms");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="w-full sm:w-auto bg-stone-900 hover:bg-stone-850 text-white border border-stone-750 font-black text-xs uppercase tracking-wider px-8 py-4 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Building2 size={16} className="text-teal-400" />
                  <span>Enter Existing Farm Portal</span>
                </button>
              </div>

              {/* Hero Feature Badges */}
              <div className="pt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
                <div className="p-4 bg-stone-900/60 border border-stone-800 rounded-2xl flex items-center gap-3">
                  <div className="p-2.5 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/20">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <span className="block text-xs font-black text-white uppercase">Real-Time Audits</span>
                    <span className="block text-[10px] text-stone-400 font-bold">Paddock checks &amp; logs</span>
                  </div>
                </div>

                <div className="p-4 bg-stone-900/60 border border-stone-800 rounded-2xl flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <span className="block text-xs font-black text-white uppercase">AI Herd Intelligence</span>
                    <span className="block text-[10px] text-stone-400 font-bold">Smart vet advice</span>
                  </div>
                </div>

                <div className="p-4 bg-stone-900/60 border border-stone-800 rounded-2xl flex items-center gap-3">
                  <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <span className="block text-xs font-black text-white uppercase">Staff QR Badges</span>
                    <span className="block text-[10px] text-stone-400 font-bold">PIN &amp; scan access</span>
                  </div>
                </div>

                <div className="p-4 bg-stone-900/60 border border-stone-800 rounded-2xl flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                    <Globe size={20} />
                  </div>
                  <div>
                    <span className="block text-xs font-black text-white uppercase">Multi-User Access</span>
                    <span className="block text-[10px] text-stone-400 font-bold">Owner &amp; staff roles</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Custom iFrame Embed Section (Configured by Owner via Admin Panel) */}
          {customIframeEnabled && customIframeCode.trim() && (
            <section className="py-12 bg-stone-900/80 border-b border-stone-850">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4 text-center">
                <div className="inline-flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-wider">
                  <Globe size={14} className="text-emerald-400" />
                  <span>{customIframeTitle || "Featured Facility Embed Widget"}</span>
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-3xl p-4 shadow-2xl overflow-hidden w-full">
                  <div 
                    className="w-full min-h-[300px] flex items-center justify-center [&>iframe]:w-full [&>iframe]:rounded-2xl"
                    dangerouslySetInnerHTML={{ __html: customIframeCode }}
                  />
                </div>
              </div>
            </section>
          )}

          {/* Quick Launcher & Teasers */}
          <section className="py-16 bg-stone-950 border-b border-stone-850">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-2xl space-y-4 max-w-2xl mx-auto text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-stone-800/80">
                  <div>
                    <span className="text-[10px] font-black text-teal-400 uppercase tracking-widest block">FAST TERMINAL LAUNCH</span>
                    <label className="block text-sm font-black text-white uppercase tracking-wider mt-0.5">
                      Type Farm / Facility Name to Enter:
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartDemo}
                    className="bg-teal-500 hover:bg-teal-400 text-stone-950 font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-2xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 shrink-0 border border-teal-300"
                  >
                    <Sparkles size={15} />
                    <span>Start Demo</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Building2 size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400" />
                    <input
                      type="text"
                      placeholder="Enter farm name (e.g. demo farm)..."
                      value={signInSearch}
                      onChange={(e) => setSignInSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && signInSearch.trim()) {
                          handlePortalLaunch(signInSearch);
                        }
                      }}
                      className="w-full bg-stone-950 border border-stone-750 text-white placeholder-stone-500 rounded-2xl pl-11 pr-10 py-3 text-xs font-bold focus:outline-hidden focus:border-teal-500 font-mono"
                    />
                    {signInSearch && (
                      <button
                        type="button"
                        onClick={() => setSignInSearch("")}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white transition-colors cursor-pointer"
                        title="Clear text"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!signInSearch.trim()}
                    onClick={() => {
                      if (signInSearch.trim()) {
                        handlePortalLaunch(signInSearch);
                      }
                    }}
                    className="bg-teal-500 hover:bg-teal-400 disabled:opacity-30 text-stone-950 font-black text-xs uppercase tracking-wider px-6 py-3 rounded-2xl transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Launch Portal</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>

              {recentFarms.length > 0 && (
                <div className="max-w-2xl mx-auto text-left space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                      Recent Portals on This Device:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          localStorage.removeItem("recent_farms");
                          setRecentFarms([]);
                        } catch (e) {}
                      }}
                      className="text-[10px] font-bold text-stone-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      Clear Recent
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentFarms.map((f) => (
                      <div
                        key={f}
                        className="bg-stone-900 border border-stone-800 hover:border-teal-500/50 text-stone-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center group overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            saveRecentFarm(f);
                            setShowSignInModal(false);
                            onEnterFarm(f);
                          }}
                          className="px-3.5 py-2 flex items-center gap-2 cursor-pointer text-left hover:bg-stone-850"
                        >
                          <Building2 size={14} className="text-teal-400 shrink-0" />
                          <span>{f}</span>
                          <ArrowRight size={12} className="text-stone-500 group-hover:text-teal-400 transition-colors" />
                        </button>
                        <button
                          type="button"
                          title={`Remove ${f} from recent`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeRecentFarm(f);
                          }}
                          className="px-2.5 py-2 text-stone-500 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer border-l border-stone-800 text-xs font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* PAGE 2: ABOUT US PAGE */}
      {currentPage === "about" && (
        <section className="py-20 bg-stone-950 border-b border-stone-850">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            
            <div className="text-center space-y-4 max-w-3xl mx-auto">
              <span className="text-xs font-black text-teal-400 uppercase tracking-widest block">
                About Nova Herd Enterprise
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase font-logo leading-tight">
                Empowering Livestock &amp; Herd Facilities Worldwide
              </h2>
              <p className="text-sm text-stone-400 font-medium leading-relaxed">
                Nova Herd was created to replace paper logbooks, unrecorded pasture checks, and fragmented records with a modern, cloud-hosted operating terminal for professional herd and livestock facilities.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6 text-left">
                <h3 className="text-xl font-black text-white uppercase tracking-wider">Our Mission &amp; Governance</h3>
                <p className="text-xs text-stone-300 leading-relaxed font-medium">
                  Whether managing a high-performance show jumping stable or a 500-head cattle farm, our platform unifies real-time water trough audits, AI veterinary assistant support, printable QR staff badges, financial expense ledgers, and role-based permissions in one terminal.
                </p>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-stone-900 border border-stone-800 rounded-2xl">
                    <span className="block text-2xl font-black text-teal-400 font-mono">100%</span>
                    <span className="text-[11px] font-black text-stone-300 uppercase mt-0.5 block">Audit Compliance</span>
                    <span className="text-[10px] text-stone-500 block">Timestamps &amp; staff PINs</span>
                  </div>

                  <div className="p-4 bg-stone-900 border border-stone-800 rounded-2xl">
                    <span className="block text-2xl font-black text-amber-400 font-mono">24/7</span>
                    <span className="text-[11px] font-black text-stone-300 uppercase mt-0.5 block">AI Vet Assistant</span>
                    <span className="text-[10px] text-stone-500 block">Nova-powered feed advice</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-stone-900 to-stone-950 p-8 rounded-3xl border border-stone-800 space-y-6 text-left shadow-2xl">
                <div className="flex items-center gap-3 pb-4 border-b border-stone-800">
                  <HorseSenseLogo className="w-12 h-12" />
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Horse Sense Leadership</h3>
                    <p className="text-[11px] text-teal-400 font-bold">Managed by System IT Administration</p>
                  </div>
                </div>

                <div className="space-y-4 text-xs text-stone-300">
                  <p><strong className="text-white">System Administration</strong> oversees cloud security, platform infrastructure, bank deposit management, and order audit ledgers.</p>
                  <p><strong className="text-white">Data Isolation Assurance:</strong> Every farm operates inside an isolated workspace. Non-registered personnel cannot access or view another facility's employee profiles or records.</p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setCurrentPage("contact");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="w-full bg-teal-500 hover:bg-teal-400 text-stone-950 font-black text-xs uppercase tracking-wider py-3 rounded-xl transition-all shadow-md cursor-pointer"
                  >
                    Contact IT &amp; Engineering Team
                  </button>
                </div>
              </div>
            </div>

          </div>
        </section>
      )}

      {/* PAGE 3: FEATURES PAGE */}
      {currentPage === "features" && (
        <section className={`py-20 border-b transition-colors duration-300 ${themeSection}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            
            <div className="text-center space-y-3">
              <span className="text-xs font-black text-teal-600 uppercase tracking-widest block">Comprehensive Capability Suite</span>
              <h2 className={`text-2xl sm:text-4xl font-black uppercase font-logo ${themeTextHead}`}>
                Built Specifically for Professional Herd Operations
              </h2>
              <p className={`text-xs sm:text-sm max-w-xl mx-auto font-medium ${themeTextSub}`}>
                Click any feature card below to open an interactive live preview simulator.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              {/* Feature 1 */}
              <div 
                onClick={() => setActiveFeatureModal("paddock")}
                className={`p-6 rounded-3xl border space-y-4 transition-all cursor-pointer group ${
                  isLight 
                    ? "bg-white border-slate-200 hover:border-teal-600 hover:shadow-lg text-slate-900" 
                    : "bg-stone-900 border-stone-800 hover:border-teal-500/60 text-stone-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 border border-teal-500/20 flex items-center justify-center font-bold">
                    <Shield size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 group-hover:underline flex items-center gap-1">
                    Preview <Eye size={12} />
                  </span>
                </div>
                <h3 className={`text-lg font-black uppercase ${themeTextHead}`}>Paddock Safety &amp; Health Checks</h3>
                <p className={`text-xs leading-relaxed font-medium ${themeTextSub}`}>
                  Log daily water trough, fence line, and individual horse condition checks with automated timestamps and staff verification.
                </p>
              </div>

              {/* Feature 2 */}
              <div 
                onClick={() => setActiveFeatureModal("ai")}
                className={`p-6 rounded-3xl border space-y-4 transition-all cursor-pointer group ${
                  isLight 
                    ? "bg-white border-slate-200 hover:border-amber-600 hover:shadow-lg text-slate-900" 
                    : "bg-stone-900 border-stone-800 hover:border-amber-500/60 text-stone-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center font-bold">
                    <Sparkles size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 group-hover:underline flex items-center gap-1">
                    Preview <Eye size={12} />
                  </span>
                </div>
                <h3 className={`text-lg font-black uppercase ${themeTextHead}`}>AI Veterinary &amp; Feed Assistant</h3>
                <p className={`text-xs leading-relaxed font-medium ${themeTextSub}`}>
                  Ask Gemini AI questions regarding feed calculations, coat conditions, or injury first-aid guidelines tailored to your horses.
                </p>
              </div>

              {/* Feature 3 */}
              <div 
                onClick={() => setActiveFeatureModal("badge")}
                className={`p-6 rounded-3xl border space-y-4 transition-all cursor-pointer group ${
                  isLight 
                    ? "bg-white border-slate-200 hover:border-sky-600 hover:shadow-lg text-slate-900" 
                    : "bg-stone-900 border-stone-800 hover:border-sky-500/60 text-stone-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 border border-sky-500/20 flex items-center justify-center font-bold">
                    <CreditCard size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-sky-600 group-hover:underline flex items-center gap-1">
                    Preview <Eye size={12} />
                  </span>
                </div>
                <h3 className={`text-lg font-black uppercase ${themeTextHead}`}>Staff Badge &amp; PIN Security</h3>
                <p className={`text-xs leading-relaxed font-medium ${themeTextSub}`}>
                  Generate printable staff badges with QR codes. Fast PIN verification ensures full accountability across all shift logs.
                </p>
              </div>

              {/* Feature 4 */}
              <div 
                onClick={() => setActiveFeatureModal("financial")}
                className={`p-6 rounded-3xl border space-y-4 transition-all cursor-pointer group ${
                  isLight 
                    ? "bg-white border-slate-200 hover:border-emerald-600 hover:shadow-lg text-slate-900" 
                    : "bg-stone-900 border-stone-800 hover:border-emerald-500/60 text-stone-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center font-bold">
                    <Zap size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 group-hover:underline flex items-center gap-1">
                    Preview <Eye size={12} />
                  </span>
                </div>
                <h3 className={`text-lg font-black uppercase ${themeTextHead}`}>Financial Ledger &amp; Expenses</h3>
                <p className={`text-xs leading-relaxed font-medium ${themeTextSub}`}>
                  Track shoeing, feed bills, veterinary fees, and maintenance overhead with interactive charts and exportable CSVs.
                </p>
              </div>

              {/* Feature 5 */}
              <div 
                onClick={() => setActiveFeatureModal("owner")}
                className={`p-6 rounded-3xl border space-y-4 transition-all cursor-pointer group ${
                  isLight 
                    ? "bg-white border-slate-200 hover:border-rose-600 hover:shadow-lg text-slate-900" 
                    : "bg-stone-900 border-stone-800 hover:border-rose-500/60 text-stone-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center font-bold">
                    <Lock size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 group-hover:underline flex items-center gap-1">
                    Preview <Eye size={12} />
                  </span>
                </div>
                <h3 className={`text-lg font-black uppercase ${themeTextHead}`}>Owner Control &amp; IT Station</h3>
                <p className={`text-xs leading-relaxed font-medium ${themeTextSub}`}>
                  First registered user receives Owner access. Add admins or staff, manage permissions, ban users, and review audit trails.
                </p>
              </div>

              {/* Feature 6 */}
              <div 
                onClick={() => setActiveFeatureModal("chat")}
                className={`p-6 rounded-3xl border space-y-4 transition-all cursor-pointer group ${
                  isLight 
                    ? "bg-white border-slate-200 hover:border-indigo-600 hover:shadow-lg text-slate-900" 
                    : "bg-stone-900 border-stone-800 hover:border-indigo-500/60 text-stone-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center font-bold">
                    <Users size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 group-hover:underline flex items-center gap-1">
                    Preview <Eye size={12} />
                  </span>
                </div>
                <h3 className={`text-lg font-black uppercase ${themeTextHead}`}>Team Messaging &amp; Chat</h3>
                <p className={`text-xs leading-relaxed font-medium ${themeTextSub}`}>
                  Communicate directly across facility staff, agistors, and barn managers with private, instant team channels.
                </p>
              </div>

              {/* Feature 7 */}
              <div 
                onClick={() => setActiveFeatureModal("herd")}
                className={`p-6 rounded-3xl border space-y-4 transition-all cursor-pointer group ${
                  isLight 
                    ? "bg-white border-slate-200 hover:border-purple-600 hover:shadow-lg text-slate-900" 
                    : "bg-stone-900 border-stone-800 hover:border-purple-500/60 text-stone-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center justify-center font-bold">
                    <Building2 size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 group-hover:underline flex items-center gap-1">
                    Preview <Eye size={12} />
                  </span>
                </div>
                <h3 className={`text-lg font-black uppercase ${themeTextHead}`}>Multi-Animal Species Engine</h3>
                <p className={`text-xs leading-relaxed font-medium ${themeTextSub}`}>
                  Manage Horses, Cattle, Sheep, Goats, Alpacas, or Swine with customized animal health parameters and ear tag tracking.
                </p>
              </div>

              {/* Feature 8 */}
              <div 
                onClick={() => setActiveFeatureModal("reports")}
                className={`p-6 rounded-3xl border space-y-4 transition-all cursor-pointer group ${
                  isLight 
                    ? "bg-white border-slate-200 hover:border-teal-600 hover:shadow-lg text-slate-900" 
                    : "bg-stone-900 border-stone-800 hover:border-teal-500/60 text-stone-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-500 border border-teal-500/20 flex items-center justify-center font-bold">
                    <Award size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 group-hover:underline flex items-center gap-1">
                    Preview <Eye size={12} />
                  </span>
                </div>
                <h3 className={`text-lg font-black uppercase ${themeTextHead}`}>Exportable PDF &amp; CSV Reports</h3>
                <p className={`text-xs leading-relaxed font-medium ${themeTextSub}`}>
                  Generate one-click official PDF summaries and raw CSV ledgers for veterinarian audits and insurance compliance.
                </p>
              </div>
            </div>

            <div className={`p-8 rounded-3xl border text-center space-y-4 ${
              isLight ? "bg-white border-slate-200 text-slate-900 shadow-sm" : "bg-stone-900 border-stone-800 text-white"
            }`}>
              <h3 className={`text-xl font-black uppercase ${themeTextHead}`}>Ready to Upgrade Your Facility Infrastructure?</h3>
              <p className={`text-xs max-w-lg mx-auto ${themeTextSub}`}>
                Select a subscription plan or register your farm today to activate full terminal features.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCurrentPage("pricing");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="bg-teal-500 hover:bg-teal-400 text-stone-950 font-black text-xs uppercase tracking-wider px-8 py-3.5 rounded-2xl transition-all cursor-pointer shadow-lg inline-flex items-center gap-2"
              >
                <span>View Subscription Plans</span>
                <ArrowRight size={16} />
              </button>
            </div>

          </div>
        </section>
      )}

      {/* PAGE 4: PRICING PAGE */}
      {currentPage === "pricing" && (
        <section className="py-20 bg-stone-950 border-b border-stone-850">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-black px-4 py-1.5 rounded-full uppercase tracking-wider">
                <span>All Prices in USD ($)</span>
              </div>
              <span className="text-xs font-black text-amber-400 uppercase tracking-widest block">Flexible Subscription Plans</span>
              <h2 className="text-2xl sm:text-4xl font-black text-white uppercase font-logo">
                Transparent Pricing for Every Farm Size
              </h2>
              
              {/* Monthly / Annual Billing Toggle */}
              <div className="inline-flex items-center bg-stone-900 border border-stone-800 p-1 rounded-2xl">
                <button
                  onClick={() => setBillingCycle("monthly")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    billingCycle === "monthly" ? "bg-stone-800 text-white shadow-xs" : "text-stone-400 hover:text-white"
                  }`}
                >
                  Monthly Billing
                </button>
                <button
                  onClick={() => setBillingCycle("annual")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    billingCycle === "annual" ? "bg-teal-500 text-stone-950 font-black shadow-xs" : "text-stone-400 hover:text-white"
                  }`}
                >
                  <span>Annual Billing</span>
                  <span className="bg-teal-950 text-teal-300 text-[9px] px-1.5 py-0.5 rounded-full uppercase font-black">Save 20%</span>
                </button>
              </div>
            </div>

            {/* Pricing Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 text-left">
              {pricingPlans.map((plan) => {
                const price = billingCycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
                const isFree = plan.id === "free" || price === 0;
                const isPerHorse = plan.isPayPerHorse || plan.id === "pay_per_horse";

                return (
                  <div 
                    key={plan.id}
                    className={`bg-stone-900 rounded-3xl p-6 border relative flex flex-col justify-between transition-all ${
                      plan.popular 
                        ? "border-teal-500 shadow-2xl shadow-teal-500/10 scale-102 bg-stone-900/90" 
                        : isFree
                        ? "border-emerald-500/40 hover:border-emerald-500/80 bg-stone-900/90"
                        : isPerHorse
                        ? "border-amber-500/50 hover:border-amber-500 bg-stone-900/90"
                        : "border-stone-800 hover:border-stone-700"
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-teal-500 text-stone-950 font-black text-[10px] uppercase tracking-widest px-4 py-1 rounded-full shadow-md flex items-center gap-1 whitespace-nowrap">
                        <span>Most Popular</span>
                      </span>
                    )}

                    {isFree && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-stone-950 font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-full shadow-md flex items-center gap-1 whitespace-nowrap">
                        <span>100% Free Forever</span>
                      </span>
                    )}

                    {isPerHorse && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-stone-950 font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-full shadow-md flex items-center gap-1 whitespace-nowrap">
                        <span>Pay Per Horse</span>
                      </span>
                    )}

                    <div className="space-y-5">
                      <div>
                        <h3 className="text-lg font-black text-white uppercase">{plan.name}</h3>
                        <p className="text-xs text-teal-400 font-bold mt-1 uppercase tracking-wider">{plan.maxHorses}</p>
                      </div>

                      <div className="flex items-baseline gap-1 font-mono">
                        {isPerHorse ? (
                          <>
                            <span className="text-3xl font-black text-white">$1</span>
                            <span className="text-xs text-stone-400 font-bold">USD / horse / mo</span>
                          </>
                        ) : (
                          <>
                            <span className="text-3xl font-black text-white">{isFree ? "$0" : `$${price}`}</span>
                            <span className="text-xs text-stone-400 font-bold">{isFree ? "USD forever" : "USD / mo"}</span>
                          </>
                        )}
                        {!isFree && !isPerHorse && billingCycle === "annual" && (
                          <span className="text-[9px] text-stone-500 font-bold block ml-1">billed annually</span>
                        )}
                      </div>

                      <div className="border-t border-stone-800 pt-5 space-y-2.5">
                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">Included Features:</span>
                        {plan.features.map((feat, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-stone-300 font-medium leading-tight">
                            <Check size={14} className="text-teal-400 shrink-0 mt-0.5" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6">
                      <button
                        onClick={() => {
                          setSelectedPlanForSignUp(plan.id);
                          if (allowSignups) {
                            setShowSignUpModal(true);
                          } else {
                            alert("New farm registrations are currently paused by IT Administration.");
                          }
                        }}
                        className={`w-full font-black text-xs uppercase tracking-wider py-3 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          plan.popular 
                            ? "bg-teal-500 hover:bg-teal-400 text-stone-950 shadow-lg" 
                            : isFree
                            ? "bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black shadow-md"
                            : isPerHorse
                            ? "bg-amber-500 hover:bg-amber-400 text-stone-950 font-black shadow-md"
                            : "bg-stone-800 hover:bg-stone-750 text-white border border-stone-700"
                        }`}
                      >
                        <span>{isFree ? "Start Free Account" : isPerHorse ? "Select $1/Horse Plan" : "Purchase Plan (USD)"}</span>
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </section>
      )}

      {/* PAGE 5: REGISTERED FARMS PAGE */}
      {currentPage === "farms" && (
        <section className="py-20 bg-stone-950 border-b border-stone-850">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <span className="text-xs font-black text-teal-400 uppercase tracking-widest block">
                OPERATIONAL PORTAL ACCESS
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white uppercase font-logo">
                Access Your Private Farm Terminal
              </h2>
              <p className="text-xs text-stone-400 font-medium">
                Type your farm or company name to open its isolated login terminal.
              </p>
            </div>

            {/* Direct Farm Name Input Launcher */}
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-2xl space-y-4 max-w-2xl mx-auto text-left">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-[11px] font-black text-stone-300 uppercase tracking-wider">
                  Type Farm / Facility Name:
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowSignInModal(false);
                    handleStartDemo();
                  }}
                  className="bg-teal-500 hover:bg-teal-400 text-stone-950 font-black text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1 border border-teal-300 shrink-0"
                >
                  <Sparkles size={12} />
                  <span>Start Demo</span>
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Building2 size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-teal-400" />
                  <input
                    type="text"
                    placeholder="Enter farm name (e.g. demo farm)..."
                    value={signInSearch}
                    onChange={(e) => setSignInSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && signInSearch.trim()) {
                        handlePortalLaunch(signInSearch);
                      }
                    }}
                    className="w-full bg-stone-950 border border-stone-750 text-white placeholder-stone-500 rounded-2xl pl-11 pr-10 py-3 text-xs font-bold focus:outline-hidden focus:border-teal-500 font-mono"
                  />
                  {signInSearch && (
                    <button
                      type="button"
                      onClick={() => setSignInSearch("")}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white transition-colors cursor-pointer"
                      title="Clear text"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!signInSearch.trim()}
                  onClick={() => {
                    if (signInSearch.trim()) {
                      handlePortalLaunch(signInSearch);
                    }
                  }}
                  className="bg-teal-500 hover:bg-teal-400 disabled:opacity-30 text-stone-950 font-black text-xs uppercase tracking-wider px-6 py-3 rounded-2xl transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Enter Portal</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>

            {/* Security Notice & Recent Device Portals */}
            <div className="max-w-2xl mx-auto space-y-4 text-left">
              <div className="p-4 bg-stone-900/90 border border-stone-800 rounded-2xl flex items-start gap-3">
                <Shield size={20} className="text-teal-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">
                    Data Isolation &amp; Security Compliance
                  </h4>
                  <p className="text-[11px] text-stone-400 font-medium leading-relaxed">
                    Public facility directory listing is disabled to protect client privacy and isolate farm operations. To enter your facility's terminal, simply type your exact registered Farm or Facility Name in the launcher box above.
                  </p>
                </div>
              </div>

              {recentFarms.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-stone-300 uppercase tracking-widest block">
                      Recent Portals Saved on This Device:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          localStorage.removeItem("recent_farms");
                          setRecentFarms([]);
                        } catch (e) {}
                      }}
                      className="text-xs font-bold text-stone-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      Clear Recent
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {recentFarms.map((fName) => (
                      <div
                        key={fName}
                        className="bg-stone-900 border border-stone-800 hover:border-teal-500/60 p-4 rounded-2xl transition-all flex items-center justify-between group shadow-xs text-left"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            saveRecentFarm(fName);
                            setShowSignInModal(false);
                            onEnterFarm(fName);
                          }}
                          className="flex items-center gap-3 cursor-pointer flex-1 text-left"
                        >
                          <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center font-black shrink-0">
                            <Building2 size={18} />
                          </div>
                          <div>
                            <span className="text-xs font-black text-white group-hover:text-teal-300 transition-colors uppercase block">
                              {fName}
                            </span>
                            <span className="text-[10px] text-stone-400 font-bold block">Launch Private Portal</span>
                          </div>
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              saveRecentFarm(fName);
                              setShowSignInModal(false);
                              onEnterFarm(fName);
                            }}
                            className="p-1.5 text-teal-400 hover:text-teal-300 cursor-pointer"
                          >
                            <ArrowRight size={18} />
                          </button>
                          <button
                            type="button"
                            title={`Remove ${fName}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeRecentFarm(fName);
                            }}
                            className="p-1.5 text-stone-500 hover:text-red-400 cursor-pointer text-xs font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </section>
      )}

      {/* PAGE 6: CONTACT & SALES PAGE */}
      {currentPage === "contact" && (
        <section className="py-20 bg-stone-950 border-b border-stone-850">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <span className="text-xs font-black text-teal-400 uppercase tracking-widest block">
                CONTACT &amp; ENTERPRISE SUPPORT
              </span>
              <h2 className="text-2xl sm:text-4xl font-black text-white uppercase font-logo">
                Get in Touch with IT Engineering
              </h2>
              <p className="text-xs sm:text-sm text-stone-400 font-medium">
                Have questions about custom deployments, bank deposit routing, or subscription billing? Send an inquiry directly to IT Administration.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left">
              {/* Contact Info Side Panel */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/20">
                      <Mail size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase">Direct IT Engineering Email</h4>
                      <p className="text-[11px] text-teal-400 font-bold font-mono mt-0.5">admin@horsesense.app</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                      <Shield size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase">Head IT Administration</h4>
                      <p className="text-[11px] text-stone-400 font-bold mt-0.5">System Administrator</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
                      <Clock size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-white uppercase">SLA &amp; Support Hours</h4>
                      <p className="text-[11px] text-stone-400 font-bold mt-0.5">24/7 Priority Support for Enterprise Subscribers</p>
                    </div>
                  </div>
                </div>

                <div className="bg-stone-900/60 border border-stone-800 rounded-3xl p-6 text-xs text-stone-400 space-y-2">
                  <span className="font-black text-white uppercase block">Facility Onboarding Guarantee</span>
                  <p>All new farm setups receive complimentary data migration assistance and badge printing setup guidance.</p>
                </div>
              </div>

              {/* Inquiry Form */}
              <div className="lg:col-span-2 bg-stone-900 border border-stone-800 rounded-3xl p-8 space-y-6 shadow-2xl">
                <h3 className="text-lg font-black text-white uppercase">Send Technical Inquiry or Enterprise Request</h3>

                {contactSuccess && (
                  <div className="p-4 bg-teal-500/10 border border-teal-500/30 rounded-2xl text-teal-300 text-xs font-extrabold flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-teal-400 shrink-0" />
                    <span>Inquiry sent successfully! System IT Administration will review your message shortly.</span>
                  </div>
                )}

                <form onSubmit={handleSendInquiry} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">
                        Your Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sarah Jenkins"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl p-3 text-xs font-semibold focus:outline-hidden focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">
                        Farm / Facility Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Oakridge Equestrian Center"
                        value={contactFarm}
                        onChange={(e) => setContactFarm(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl p-3 text-xs font-semibold focus:outline-hidden focus:border-teal-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="sarah@oakridge.com"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl p-3 text-xs font-semibold focus:outline-hidden focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">
                        Priority Level
                      </label>
                      <select
                        value={contactPriority}
                        onChange={(e) => setContactPriority(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl p-3 text-xs font-bold focus:outline-hidden focus:border-teal-500 cursor-pointer"
                      >
                        <option value="Standard Support">Standard Support</option>
                        <option value="Priority Onboarding">Priority Onboarding</option>
                        <option value="Custom Enterprise SLA">Custom Enterprise SLA</option>
                        <option value="Bank Routing Question">Bank Routing Question</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-stone-400 uppercase tracking-wider mb-1">
                      Message / Inquiry Details *
                    </label>
                    <textarea
                      required
                      rows={4}
                      placeholder="Type your question or request..."
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl p-3 text-xs font-medium focus:outline-hidden focus:border-teal-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingContact}
                    className="bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-stone-950 font-black text-xs uppercase tracking-wider px-8 py-3.5 rounded-2xl transition-all shadow-lg cursor-pointer flex items-center gap-2"
                  >
                    {isSubmittingContact ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Sending Inquiry...</span>
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        <span>Send Technical Inquiry</span>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-stone-950 border-t border-stone-850 py-12 text-stone-500 text-xs font-medium">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          
          <div className="flex items-center space-x-3">
            <HorseSenseLogo className="w-8 h-8" />
            <div>
              <span className="text-sm font-black text-stone-300 uppercase tracking-widest font-logo block">Horse Sense</span>
              <span className="text-[10px] text-teal-400 font-bold uppercase tracking-wider block">Enterprise Equine Operating System</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-bold text-stone-400 uppercase tracking-wider">
            {[
              { id: "home", label: "Home" },
              { id: "about", label: "About Us" },
              { id: "features", label: "Features" },
              { id: "pricing", label: "Pricing Plans" },
              { id: "farms", label: "Registered Farms" },
              { id: "contact", label: "Contact & Sales" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setCurrentPage(p.id as any);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`transition-colors cursor-pointer ${currentPage === p.id ? "text-teal-400 font-black" : "hover:text-teal-400"}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <p className="text-center md:text-right text-[11px] font-bold uppercase tracking-wider text-stone-500">
            © {new Date().getFullYear()} Horse Sense Systems. All rights reserved.<br />
            Enterprise Equine Operations Management.
          </p>

        </div>
      </footer>

      {/* MODAL: Sign In / Select Farm */}
      {showSignInModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-5 text-left">
            
            <div className="flex items-center justify-between pb-4 border-b border-stone-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/20">
                  <Key size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase">Sign In to Farm Portal</h3>
                  <p className="text-xs text-stone-400 font-bold mt-0.5">Enter your farm or company name to open portal</p>
                </div>
              </div>

              <button onClick={() => setShowSignInModal(false)} className="text-stone-400 hover:text-white p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {!showForgotFarm ? (
                <>
                  <div>
                    <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1.5">
                      Type Your Farm / Company Name
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={signInSearch}
                        onChange={(e) => setSignInSearch(e.target.value)}
                        placeholder="Type farm name (e.g. Ruabon Farm, Nova Herd)..."
                        className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl pl-3 pr-10 py-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-500 font-mono"
                      />
                      {signInSearch && (
                        <button
                          type="button"
                          onClick={() => setSignInSearch("")}
                          className="absolute right-3 top-2.5 text-stone-500 hover:text-white text-xs font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {signInSearch.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        saveRecentFarm(signInSearch.trim());
                        setShowSignInModal(false);
                        onEnterFarm(signInSearch.trim());
                      }}
                      className="w-full bg-teal-600 hover:bg-teal-500 text-white p-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-between shadow-md cursor-pointer"
                    >
                      <span>Open Portal for "{signInSearch.trim()}"</span>
                      <ArrowRight size={16} />
                    </button>
                  )}

                  {/* Forgot Farm Quick Recovery Trigger */}
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotFarm(true);
                        setForgotQuery("");
                        setForgotFarmMatches([]);
                        setHasSearchedForgot(false);
                      }}
                      className="text-[11px] font-bold text-teal-400 hover:text-teal-300 hover:underline cursor-pointer transition-colors"
                    >
                      Forgot Farm Name? Find by Phone, Email, or Owner Name →
                    </button>
                  </div>

                  {recentFarms.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-stone-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                          Your Recent Device Portals:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              localStorage.removeItem("recent_farms");
                              setRecentFarms([]);
                            } catch (e) {}
                          }}
                          className="text-[10px] font-bold text-stone-500 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {recentFarms.map((fName) => (
                          <div
                            key={fName}
                            className="w-full text-left p-3 bg-stone-950 hover:bg-stone-850 border border-stone-800 hover:border-teal-500 rounded-xl transition-all flex items-center justify-between group"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                saveRecentFarm(fName);
                                setShowSignInModal(false);
                                onEnterFarm(fName);
                              }}
                              className="flex items-center gap-2 flex-1 cursor-pointer text-left"
                            >
                              <Building2 size={14} className="text-teal-400 shrink-0" />
                              <span className="text-xs font-black text-white group-hover:text-teal-300 transition-colors">{fName}</span>
                            </button>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  saveRecentFarm(fName);
                                  setShowSignInModal(false);
                                  onEnterFarm(fName);
                                }}
                                className="p-1 text-stone-500 hover:text-teal-400 cursor-pointer"
                              >
                                <ArrowRight size={14} />
                              </button>
                              <button
                                type="button"
                                title={`Remove ${fName}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  removeRecentFarm(fName);
                                }}
                                className="p-1 text-stone-600 hover:text-red-400 text-xs font-bold cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* FORGOT FARM RECOVERY PORTAL */
                <div className="space-y-4">
                  <div className="bg-teal-950/40 border border-teal-800/60 p-3.5 rounded-2xl">
                    <span className="text-[10px] font-black uppercase tracking-wider text-teal-400 block mb-1">
                      Farm Account Recovery
                    </span>
                    <p className="text-xs text-stone-300 leading-relaxed">
                      Enter any phone number, email address, or owner / farm contact name linked to your farm registry.
                    </p>
                  </div>

                  <form onSubmit={handleForgotFarmSearch} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1.5">
                        Phone Number, Email, or Owner Name
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={forgotQuery}
                          onChange={(e) => setForgotQuery(e.target.value)}
                          placeholder="e.g. 0419 883 201, admin@horsesense.app, Sarah..."
                          className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl pl-3 pr-10 py-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-500 font-mono"
                          autoFocus
                        />
                        {forgotQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setForgotQuery("");
                              setForgotFarmMatches([]);
                              setHasSearchedForgot(false);
                            }}
                            className="absolute right-3 top-2.5 text-stone-500 hover:text-white text-xs font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="flex-1 bg-teal-600 hover:bg-teal-500 text-white py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <Search size={14} /> Find Linked Farm
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowForgotFarm(false)}
                        className="bg-stone-800 hover:bg-stone-700 text-stone-300 py-2.5 px-3 rounded-xl font-bold text-xs uppercase cursor-pointer"
                      >
                        Back
                      </button>
                    </div>
                  </form>

                  {/* Search Results */}
                  {hasSearchedForgot && (
                    <div className="space-y-2 pt-2 border-t border-stone-800">
                      <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block">
                        Search Results ({forgotFarmMatches.length} Found):
                      </span>

                      {forgotFarmMatches.length === 0 ? (
                        <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl text-center">
                          <p className="text-xs text-stone-400 font-bold">No farm matches found for "{forgotQuery}"</p>
                          <p className="text-[10px] text-stone-500 mt-1">
                            Double check your phone number or email, or register a new farm below.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {forgotFarmMatches.map((farm) => (
                            <div
                              key={farm.id}
                              className="p-3 bg-stone-950 border border-teal-500/40 rounded-xl hover:border-teal-400 transition-all flex items-center justify-between group"
                            >
                              <div className="space-y-0.5 flex-1 pr-2">
                                <div className="flex items-center gap-1.5">
                                  <Building2 size={13} className="text-teal-400 shrink-0" />
                                  <span className="text-xs font-black text-white">{farm.name}</span>
                                </div>
                                <div className="text-[10px] text-stone-400 font-mono">
                                  Owner: <span className="text-stone-200">{farm.ownerName}</span>
                                  {farm.ownerPhone && <span> • 📞 {farm.ownerPhone}</span>}
                                  {farm.ownerEmail && <span> • ✉️ {farm.ownerEmail}</span>}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  saveRecentFarm(farm.name);
                                  setShowSignInModal(false);
                                  setShowForgotFarm(false);
                                  onEnterFarm(farm.name);
                                }}
                                className="bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 rounded-lg text-xxs font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer shrink-0 shadow-xs"
                              >
                                <span>Sign In</span>
                                <ArrowRight size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-stone-800 flex justify-between items-center">
              <span className="text-xs text-stone-400 font-bold">Don't have a farm account?</span>
              <button
                type="button"
                onClick={() => {
                  if (allowSignups) {
                    setShowSignInModal(false);
                    setShowSignUpModal(true);
                  } else {
                    alert("New farm registrations are currently disabled by administration.");
                  }
                }}
                className="text-xs font-black text-teal-400 hover:underline uppercase tracking-wider cursor-pointer"
              >
                Register Farm Now →
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Register New Farm & Card Payment */}
      {showSignUpModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-2xl max-w-lg w-full space-y-5 text-left my-8">
            
            <div className="flex items-center justify-between pb-4 border-b border-stone-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/20">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase">Register New Farm &amp; Activate Plan</h3>
                  <p className="text-xs text-stone-400 font-bold mt-0.5">Enter farm details, payment card, and owner account</p>
                </div>
              </div>

              <button onClick={() => setShowSignUpModal(false)} className="text-stone-400 hover:text-white p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            {signUpError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-rose-400" />
                <span>{signUpError}</span>
              </div>
            )}

            {signUpSuccess && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                <span>{signUpSuccess}</span>
              </div>
            )}

            <form onSubmit={handleRegisterFarm} className="space-y-3.5">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                    Farm / Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sunrise Herd Stables"
                    value={newFarmName}
                    onChange={(e) => setNewFarmName(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl p-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-500"
                  />
                </div>

                <div className="sm:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest">
                      What animal herd(s) do you have? (Select all that apply) *
                    </label>
                    <span className="text-[10px] text-teal-400 font-bold">
                      {selectedHerds.length} Herd{selectedHerds.length > 1 ? "s" : ""} Selected
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 font-medium">
                    Select all animal livestock managed at your facility portal. You can select more than one herd:
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {[
                      { id: "Horses", label: "Horses & Herd" },
                      { id: "Cattle", label: "Cattle & Cows" },
                      { id: "Sheep", label: "Sheep & Lambs" },
                      { id: "Goats", label: "Goats & Kids" },
                      { id: "Alpacas", label: "Alpacas & Llamas" },
                      { id: "Pigs", label: "Pigs & Swine" },
                      { id: "Poultry", label: "Poultry & Fowl" },
                      { id: "Others", label: "Custom / Other" },
                    ].map((herd) => {
                      const isSelected = selectedHerds.includes(herd.id);
                      return (
                        <button
                          key={herd.id}
                          type="button"
                          onClick={() => toggleHerdSelection(herd.id)}
                          className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? "bg-teal-500/20 text-teal-300 border-teal-500/60 shadow-xs"
                              : "bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700"
                          }`}
                        >
                          <span className="truncate">{herd.label}</span>
                          {isSelected && <Check size={14} className="text-teal-400 shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                    First User (Owner) Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sarah Jenkins"
                    value={newOwnerName}
                    onChange={(e) => setNewOwnerName(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl p-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                    Owner 4-Digit Security PIN *
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={4}
                    placeholder="••••"
                    value={newOwnerPin}
                    onChange={(e) => setNewOwnerPin(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl p-2.5 text-xs font-bold text-center tracking-widest focus:outline-hidden focus:border-teal-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                  Owner Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="owner@farm.com"
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 text-white rounded-xl p-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">
                  Select Plan &amp; Billing Cycle
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedPlanForSignUp}
                    onChange={(e) => setSelectedPlanForSignUp(e.target.value)}
                    className="bg-stone-950 border border-stone-800 text-white rounded-xl p-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-500"
                  >
                    {pricingPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.maxHorses})
                      </option>
                    ))}
                  </select>

                  <select
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value as any)}
                    className="bg-stone-950 border border-stone-800 text-white rounded-xl p-2.5 text-xs font-bold focus:outline-hidden focus:border-teal-500"
                  >
                    <option value="annual">Annual Billing (20% Discount)</option>
                    <option value="monthly">Monthly Standard Billing</option>
                  </select>
                </div>
              </div>

              {/* CREDIT CARD PAYMENT SECTION (Paid plans only) */}
              {selectedPlanForSignUp !== "free" ? (
                <div className="bg-stone-950 border border-stone-800 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-850 pb-2">
                    <span className="text-[10px] font-black text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard size={14} /> Subscription Payment Details
                    </span>
                    <span className="text-[10px] font-mono text-stone-400 font-bold">
                      Total: ${(() => {
                        const p = pricingPlans.find(plan => plan.id === selectedPlanForSignUp) || DEFAULT_PRICING_PLANS[1];
                        return billingCycle === "annual" ? p.annualPrice * 12 : p.monthlyPrice;
                      })()}
                    </span>
                  </div>

                  <div>
                    <label className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider mb-1">
                      Cardholder Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Name on Credit Card"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800 text-white rounded-xl p-2 text-xs font-semibold focus:outline-hidden focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider mb-1">
                      Card Number
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={19}
                      placeholder="4532 •••• •••• 8821"
                      value={cardNumber}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
                        setCardNumber(val);
                      }}
                      className="w-full bg-stone-900 border border-stone-800 text-white rounded-xl p-2 text-xs font-mono font-bold focus:outline-hidden focus:border-teal-500 tracking-wider"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <label className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider mb-1">
                        Expiry
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={5}
                        placeholder="MM/YY"
                        value={cardExp}
                        onChange={(e) => {
                          let val = e.target.value.replace(/\D/g, "");
                          if (val.length >= 2) val = val.slice(0, 2) + "/" + val.slice(2, 4);
                          setCardExp(val);
                        }}
                        className="w-full bg-stone-900 border border-stone-800 text-white rounded-xl p-2 text-xs font-mono text-center font-bold focus:outline-hidden focus:border-teal-500"
                      />
                    </div>

                    <div className="col-span-1">
                      <label className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider mb-1">
                        CVC / CVV
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={4}
                        placeholder="•••"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ""))}
                        className="w-full bg-stone-900 border border-stone-800 text-white rounded-xl p-2 text-xs font-mono text-center font-bold focus:outline-hidden focus:border-teal-500"
                      />
                    </div>

                    <div className="col-span-1">
                      <label className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider mb-1">
                        Billing ZIP
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="78701"
                        value={cardZip}
                        onChange={(e) => setCardZip(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-800 text-white rounded-xl p-2 text-xs font-mono text-center font-bold focus:outline-hidden focus:border-teal-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-950/40 border border-emerald-800/60 p-4 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    <span>Free Plan Selected ($0.00) — No Credit Card Required</span>
                  </div>
                  <p className="text-[11px] text-stone-400 font-medium">
                    Includes basic livestock management for up to 5 horses, standard health logging, and 1 single owner user login.
                  </p>
                </div>
              )}

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl text-[10px] text-teal-400 font-bold flex items-center gap-2">
                <Shield size={14} className="shrink-0 text-teal-400" />
                <span>The first registered user automatically receives OWNER privileges. A 20-digit license token will be generated upon signup.</span>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSignUpModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-800 text-stone-400 hover:text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !allowSignups}
                  className="bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-stone-950 font-black text-xs uppercase tracking-wider px-6 py-2.5 rounded-xl transition-all shadow-lg cursor-pointer flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Creating Farm &amp; Issuing License...</span>
                    </>
                  ) : (
                    <>
                      {selectedPlanForSignUp === "free" ? <Building2 size={14} /> : <CreditCard size={14} />}
                      <span>{selectedPlanForSignUp === "free" ? "Register Free Farm" : "Pay & Register Farm"}</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* MODAL: 20-Digit License Token Issued & 24h Activation Notice */}
      {registeredLicenseModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-900 border border-teal-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-lg w-full space-y-6 text-left my-8">
            
            <div className="flex items-center justify-between pb-4 border-b border-stone-800">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-teal-500/10 text-teal-400 rounded-2xl border border-teal-500/30">
                  <Key size={24} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase">Farm Registered &amp; License Issued</h3>
                  <p className="text-xs text-teal-400 font-bold mt-0.5">{registeredLicenseModal.farm.name}</p>
                </div>
              </div>

              <button 
                onClick={() => setRegisteredLicenseModal(null)} 
                className="text-stone-400 hover:text-white p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* 20-Digit License Token Box */}
            <div className="bg-stone-950 border border-teal-500/30 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-teal-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Shield size={14} /> 20-Digit License Token
                </span>
                <span className="text-[10px] bg-teal-500/10 text-teal-300 font-bold px-2 py-0.5 rounded-full border border-teal-500/20">
                  Save Securely
                </span>
              </div>

              <div className="p-3 bg-stone-900 rounded-xl border border-stone-800 font-mono text-center text-base sm:text-lg font-black tracking-widest text-teal-300 select-all">
                {registeredLicenseModal.token.replace(/(\d{4})/g, "$1 ").trim()}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(registeredLicenseModal.token);
                    setTokenCopied(true);
                    setTimeout(() => setTokenCopied(false), 2500);
                  }}
                  className="px-3.5 py-1.5 bg-stone-850 hover:bg-stone-800 text-stone-200 rounded-xl border border-stone-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {tokenCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{tokenCopied ? "Copied to Clipboard!" : "Copy Token"}</span>
                </button>

                <span className="text-[10px] text-stone-400 font-medium">
                  Use either Farm Name or Token to launch
                </span>
              </div>
            </div>

            {/* 24-Hour Security Activation Lock Notice */}
            <div className="bg-amber-950/30 border border-amber-800/40 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                <Hourglass size={16} className="text-amber-400 shrink-0" />
                <span className="uppercase tracking-wider">24-Hour Activation Delay</span>
              </div>
              <p className="text-xs text-stone-300 leading-relaxed">
                As required by SaaS verification policy, new facility accounts require <strong>24 hours</strong> to activate network security and DNS routing before full portal access is granted.
              </p>
              <div className="text-[11px] text-stone-400 font-mono">
                Estimated activation: {new Date(registeredLicenseModal.activationTime).toLocaleString()}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleDownloadLicense(registeredLicenseModal.farm, registeredLicenseModal.token, registeredLicenseModal.activationTime)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <Download size={15} />
                <span>Download License Key (.txt)</span>
              </button>

              <button
                type="button"
                onClick={() => setRegisteredLicenseModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-stone-800 text-stone-400 hover:text-white text-xs font-bold uppercase tracking-wider cursor-pointer text-center"
              >
                Close Window
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Pending 24-Hour Activation Delay */}
      {pendingActivationModalFarm && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-900 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-lg w-full space-y-6 text-left my-8">
            
            <div className="flex items-center justify-between pb-4 border-b border-stone-800">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/30">
                  <Hourglass size={24} />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase">License Activation In Progress</h3>
                  <p className="text-xs text-amber-400 font-bold mt-0.5">{pendingActivationModalFarm.name}</p>
                </div>
              </div>

              <button 
                onClick={() => setPendingActivationModalFarm(null)} 
                className="text-stone-400 hover:text-white p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-300 leading-relaxed">
              <p>
                Access to <strong>{pendingActivationModalFarm.name}</strong> is currently restricted while the 24-hour initial security activation period completes.
              </p>
              
              {pendingActivationModalFarm.licenseToken && (
                <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 font-mono text-center text-sm font-bold text-teal-300">
                  License Token: {pendingActivationModalFarm.licenseToken.replace(/(\d{4})/g, "$1 ").trim()}
                </div>
              )}

              <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-xl text-[11px] text-amber-300 font-medium">
                ⏱ Registered: {pendingActivationModalFarm.createdAt} • Scheduled activation: {pendingActivationModalFarm.activationTime ? new Date(pendingActivationModalFarm.activationTime).toLocaleString() : "Within 24 Hours"}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              {pendingActivationModalFarm.licenseToken ? (
                <button
                  type="button"
                  onClick={() => handleDownloadLicense(pendingActivationModalFarm, pendingActivationModalFarm.licenseToken!, pendingActivationModalFarm.activationTime)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  <Download size={15} />
                  <span>Download License Key (.txt)</span>
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setPendingActivationModalFarm(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-stone-800 text-stone-400 hover:text-white text-xs font-bold uppercase tracking-wider cursor-pointer text-center"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* FEATURE INTERACTIVE PREVIEW MODAL */}
      {activeFeatureModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className={`rounded-3xl border p-6 max-w-3xl w-full space-y-6 shadow-2xl relative my-8 text-left ${
            isLight ? "bg-white border-slate-200 text-slate-900" : "bg-stone-900 border-stone-800 text-stone-100"
          }`}>
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-stone-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-500/10 text-teal-600 rounded-xl border border-teal-500/20">
                  <Eye size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-teal-500/10 text-teal-600 px-2 py-0.5 rounded-full border border-teal-500/20">
                      Interactive Feature Preview
                    </span>
                  </div>
                  <h3 className={`text-lg font-black uppercase mt-0.5 ${themeTextHead}`}>
                    {activeFeatureModal === "paddock" && "Paddock Safety & Health Checks"}
                    {activeFeatureModal === "ai" && "AI Veterinary & Feed Assistant"}
                    {activeFeatureModal === "badge" && "Staff Badge & PIN Security"}
                    {activeFeatureModal === "financial" && "Financial Ledger & Expenses"}
                    {activeFeatureModal === "owner" && "Owner Control & IT Station"}
                    {activeFeatureModal === "chat" && "Team Messaging & Chat"}
                    {activeFeatureModal === "herd" && "Multi-Animal Species Engine"}
                    {activeFeatureModal === "reports" && "Exportable PDF & CSV Reports"}
                  </h3>
                </div>
              </div>

              <button 
                onClick={() => setActiveFeatureModal(null)} 
                className="text-stone-400 hover:text-stone-200 p-1 rounded-xl cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Feature Tabs Bar inside modal */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px] font-bold uppercase tracking-wider">
              {[
                { id: "paddock", label: "Paddock Checks" },
                { id: "ai", label: "AI Vet" },
                { id: "badge", label: "Staff PIN Badge" },
                { id: "financial", label: "Financial Ledger" },
                { id: "owner", label: "Owner Panel" },
                { id: "chat", label: "Team Chat" },
                { id: "herd", label: "Species Engine" },
                { id: "reports", label: "PDF Reports" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFeatureModal(tab.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                    activeFeatureModal === tab.id
                      ? "bg-teal-500 text-stone-950 font-black border-teal-400 shadow-2xs"
                      : (isLight ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200" : "bg-stone-950 text-stone-400 border-stone-800 hover:text-white")
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Interactive Simulator Content Body */}
            <div className={`p-5 rounded-2xl border space-y-4 ${
              isLight ? "bg-slate-50 border-slate-200" : "bg-stone-950 border-stone-800"
            }`}>

              {/* 1. Paddock Checks Preview */}
              {activeFeatureModal === "paddock" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-xs font-black uppercase ${themeTextHead}`}>Interactive Pasture & Trough Auditor</h4>
                      <p className={`text-[11px] ${themeTextSub}`}>Click checkboxes below to simulate staff logging paddock checks in real-time.</p>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-teal-600 bg-teal-500/10 px-2 py-1 rounded-lg border border-teal-500/20">
                      Live Simulator
                    </span>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(simPaddockChecked).map(([item, checked]) => (
                      <div 
                        key={item}
                        onClick={() => setSimPaddockChecked(prev => ({ ...prev, [item]: !prev[item] }))}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          checked 
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800" 
                            : (isLight ? "bg-white border-slate-200 text-slate-700 hover:border-slate-300" : "bg-stone-900 border-stone-800 text-stone-300 hover:border-stone-700")
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-xs ${
                            checked ? "bg-emerald-500 text-stone-950" : "border border-stone-500"
                          }`}>
                            {checked && <Check size={14} />}
                          </div>
                          <div>
                            <span className="text-xs font-bold block">{item}</span>
                            <span className="text-[10px] text-stone-400 block font-mono">
                              {checked ? "Checked OK at 07:45 AM by Staff #104" : "Pending Check"}
                            </span>
                          </div>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          checked ? "bg-emerald-500/20 text-emerald-700" : "bg-amber-500/20 text-amber-600"
                        }`}>
                          {checked ? "Verified" : "Tap to Check"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. AI Vet Assistant Preview */}
              {activeFeatureModal === "ai" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-xs font-black uppercase ${themeTextHead}`}>Nova AI Veterinary Assistant</h4>
                      <p className={`text-[11px] ${themeTextSub}`}>Select a sample herd health query or ask a custom question.</p>
                    </div>
                    <Sparkles size={18} className="text-amber-500" />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Warmblood feed ration 500kg",
                      "First aid for minor leg scrape",
                      "Winter coat supplement advice",
                      "Colic early alert signs"
                    ].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setSimAiQuery(q);
                          if (q.includes("scrape")) {
                            setSimAiReply("Clean the scrape with saline solution, apply betadine antiseptic gel, wrap loosely with a sterile bandage if flies are present, and monitor for swelling or localized warmth.");
                          } else if (q.includes("coat")) {
                            setSimAiReply("Incorporate 60ml cold-pressed flaxseed oil or ground linseed rich in Omega-3 daily, alongside biotin supplements to enhance coat oil shine and hoof wall density.");
                          } else if (q.includes("Colic")) {
                            setSimAiReply("Colic warning signs include flank biting, pawing the ground, lying down repeatedly, absence of gut sounds, and refusal of feed. Immediately contact your attending vet.");
                          } else {
                            setSimAiReply("For a 500kg Warmblood in moderate work, supply 2.0% of body weight in forage daily (~10kg Timothy/Alfalfa hay) plus 2.5kg electrolyte-balanced grain concentrate.");
                          }
                        }}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          simAiQuery === q 
                            ? "bg-amber-500/20 text-amber-700 border-amber-500/40" 
                            : (isLight ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-100" : "bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800")
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  <div className={`p-3.5 rounded-xl border space-y-2 ${
                    isLight ? "bg-white border-slate-200" : "bg-stone-900 border-stone-800"
                  }`}>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                      <Sparkles size={14} /> Nova AI Veterinary Response
                    </div>
                    <p className={`text-xs leading-relaxed font-medium ${isLight ? "text-slate-800" : "text-stone-200"}`}>
                      {simAiReply}
                    </p>
                  </div>
                </div>
              )}

              {/* 3. Staff Badge & PIN Security Preview */}
              {activeFeatureModal === "badge" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-xs font-black uppercase ${themeTextHead}`}>Staff Badge & PIN Security Terminal</h4>
                      <p className={`text-[11px] ${themeTextSub}`}>Enter staff 3-digit PIN below to test instant authentication.</p>
                    </div>
                    <Key size={18} className="text-sky-500" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-xl border space-y-3 text-center ${
                      isLight ? "bg-white border-slate-200" : "bg-stone-900 border-stone-800"
                    }`}>
                      <div className="w-12 h-12 rounded-full bg-sky-500/10 text-sky-500 mx-auto flex items-center justify-center font-black">
                        <Users size={24} />
                      </div>
                      <div>
                        <span className="block text-xs font-black uppercase">Staff Badge #104</span>
                        <span className="block text-[10px] text-stone-400">Operations Lead</span>
                      </div>
                      <div className="p-2 bg-white rounded-lg inline-block border border-stone-200">
                        <div className="w-20 h-20 bg-stone-900 text-white flex items-center justify-center text-[9px] font-mono p-1 text-center font-bold">
                          [QR SECURITY CODE]
                        </div>
                      </div>
                    </div>

                    <div className={`p-4 rounded-xl border space-y-3 ${
                      isLight ? "bg-white border-slate-200" : "bg-stone-900 border-stone-800"
                    }`}>
                      <span className="text-[10px] font-black uppercase tracking-wider block text-stone-400">PIN Verification Pad</span>
                      <div className="flex justify-center gap-2">
                        <input
                          type="password"
                          maxLength={3}
                          value={simPinInput}
                          onChange={(e) => setSimPinInput(e.target.value)}
                          placeholder="•••"
                          className="w-24 text-center font-mono text-lg font-black bg-stone-950 text-white border border-stone-700 rounded-xl py-2"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (simPinInput.length === 3) {
                              setSimPinVerified(true);
                            } else {
                              setSimPinVerified(false);
                            }
                          }}
                          className="bg-sky-500 hover:bg-sky-400 text-stone-950 px-3 py-2 rounded-xl text-xs font-black uppercase cursor-pointer"
                        >
                          Verify
                        </button>
                      </div>

                      {simPinVerified !== null && (
                        <div className={`p-2 rounded-lg text-center text-[10px] font-extrabold uppercase ${
                          simPinVerified ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" : "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                        }`}>
                          {simPinVerified ? "✓ PIN Verified - Staff Granted Access" : "✕ Invalid PIN (Must be 3 digits)"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Financial Ledger Preview */}
              {activeFeatureModal === "financial" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-xs font-black uppercase ${themeTextHead}`}>Facility Expense & Financial Ledger</h4>
                      <p className={`text-[11px] ${themeTextSub}`}>Real-time expense categorization and CSV export simulator.</p>
                    </div>
                    <Zap size={18} className="text-emerald-500" />
                  </div>

                  <div className="space-y-2">
                    {simExpenseList.map((exp, idx) => (
                      <div key={idx} className={`p-3 rounded-xl border flex items-center justify-between ${
                        isLight ? "bg-white border-slate-200 text-slate-800" : "bg-stone-900 border-stone-800 text-stone-200"
                      }`}>
                        <div>
                          <span className="text-xs font-bold block">{exp.category}</span>
                          <span className="text-[10px] text-stone-400 font-medium">{exp.vendor} • {exp.date}</span>
                        </div>
                        <span className="text-xs font-mono font-black text-emerald-600">
                          ${exp.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSimExpenseList(prev => [
                        ...prev,
                        { category: "Pasture Seed & Lime", amount: 280, date: "Just now", vendor: "Rural Farm Supply" }
                      ]);
                    }}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs uppercase tracking-wider py-2.5 rounded-xl transition-all cursor-pointer shadow-xs"
                  >
                    + Log Sample $280 Expense Entry
                  </button>
                </div>
              )}

              {/* 5. Owner Control Preview */}
              {activeFeatureModal === "owner" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-xs font-black uppercase ${themeTextHead}`}>Owner Admin & IT Station</h4>
                      <p className={`text-[11px] ${themeTextSub}`}>Control system permissions and security parameters.</p>
                    </div>
                    <Lock size={18} className="text-rose-500" />
                  </div>

                  <div className="space-y-2">
                    {Object.entries(simOwnerPerms).map(([key, val]) => (
                      <div 
                        key={key} 
                        onClick={() => setSimOwnerPerms(prev => ({ ...prev, [key]: !val }))}
                        className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${
                          isLight ? "bg-white border-slate-200 text-slate-800" : "bg-stone-900 border-stone-800 text-stone-200"
                        }`}
                      >
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {key === "allowStaffEdit" && "Allow Staff To Add New Horses"}
                          {key === "requirePinChecks" && "Require PIN on Shift Logs"}
                          {key === "customEmbeds" && "Enable Owner Custom iFrame Embeds"}
                          {key === "autoAuditLog" && "Stream Live Security Audit Trail"}
                        </span>
                        <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${val ? "bg-teal-500" : "bg-stone-600"}`}>
                          <div className={`w-4 h-4 rounded-full bg-white transition-transform ${val ? "translate-x-5" : "translate-x-0"}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 6. Team Chat Preview */}
              {activeFeatureModal === "chat" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-xs font-black uppercase ${themeTextHead}`}>Facility Team Messaging</h4>
                      <p className={`text-[11px] ${themeTextSub}`}>Post a message to test team synchronization.</p>
                    </div>
                    <Users size={18} className="text-indigo-500" />
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {simChatList.map((msg) => (
                      <div key={msg.id} className={`p-2.5 rounded-xl border ${
                        isLight ? "bg-white border-slate-200 text-slate-800" : "bg-stone-900 border-stone-800 text-stone-200"
                      }`}>
                        <div className="flex items-center justify-between text-[10px] text-stone-400 font-bold mb-0.5">
                          <span>{msg.sender}</span>
                          <span>{msg.time}</span>
                        </div>
                        <p className="text-xs font-medium">{msg.text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type test chat note..."
                      value={simChatMsg}
                      onChange={(e) => setSimChatMsg(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && simChatMsg.trim()) {
                          setSimChatList(prev => [
                            ...prev,
                            { id: Date.now().toString(), sender: "You (Preview User)", text: simChatMsg.trim(), time: "Just now" }
                          ]);
                          setSimChatMsg("");
                        }
                      }}
                      className={`flex-1 rounded-xl border p-2 text-xs font-bold focus:outline-hidden ${
                        isLight ? "bg-white border-slate-300 text-slate-900" : "bg-stone-900 border-stone-800 text-white"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (simChatMsg.trim()) {
                          setSimChatList(prev => [
                            ...prev,
                            { id: Date.now().toString(), sender: "You (Preview User)", text: simChatMsg.trim(), time: "Just now" }
                          ]);
                          setSimChatMsg("");
                        }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase cursor-pointer"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}

              {/* 7. Herd Species Engine Preview */}
              {activeFeatureModal === "herd" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-xs font-black uppercase ${themeTextHead}`}>Multi-Animal Species Engine</h4>
                      <p className={`text-[11px] ${themeTextSub}`}>Select an animal type to inspect specialized herd parameters.</p>
                    </div>
                    <Building2 size={18} className="text-purple-500" />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {["Horses", "Cattle", "Sheep", "Goats", "Alpacas", "Swine"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSimSelectedSpecies(s)}
                        className={`text-xs font-black px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                          simSelectedSpecies === s 
                            ? "bg-purple-500 text-stone-950 border-purple-400" 
                            : (isLight ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-100" : "bg-stone-900 text-stone-300 border-stone-800 hover:bg-stone-800")
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  <div className={`p-4 rounded-xl border space-y-2 ${
                    isLight ? "bg-white border-slate-200" : "bg-stone-900 border-stone-800"
                  }`}>
                    <span className="text-xs font-black text-purple-600 uppercase tracking-wider block">
                      Active Herd Species: {simSelectedSpecies}
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs font-medium">
                      <div className="p-2 bg-purple-500/10 rounded-lg">
                        <span className="block text-[10px] font-bold uppercase text-stone-400">Tracking Metric</span>
                        <span className="block font-bold">
                          {simSelectedSpecies === "Horses" && "Shoeing & Vet Schedules"}
                          {simSelectedSpecies === "Cattle" && "Ear Tag # & Sire Breed"}
                          {simSelectedSpecies === "Sheep" && "Flock Shearing & Fleece Weight"}
                          {simSelectedSpecies === "Goats" && "Pasture Foraging & Milk Yield"}
                          {simSelectedSpecies === "Alpacas" && "Micron Fiber Quality Score"}
                          {simSelectedSpecies === "Swine" && "Litter Size & Weight Records"}
                        </span>
                      </div>
                      <div className="p-2 bg-purple-500/10 rounded-lg">
                        <span className="block text-[10px] font-bold uppercase text-stone-400">Health Protocol</span>
                        <span className="block font-bold">
                          {simSelectedSpecies === "Horses" && "Coggins & Tetanus Booster"}
                          {simSelectedSpecies === "Cattle" && "BVD & Blackleg Vaccine"}
                          {simSelectedSpecies === "Sheep" && "Deworming & Foot Rot Checks"}
                          {simSelectedSpecies === "Goats" && "CDT Vaccine & Hoof Trimming"}
                          {simSelectedSpecies === "Alpacas" && "Meningeal Worm Prevention"}
                          {simSelectedSpecies === "Swine" && "Iron Injection & Parvovirus"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 8. Exportable PDF Reports Preview */}
              {activeFeatureModal === "reports" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className={`text-xs font-black uppercase ${themeTextHead}`}>Exportable PDF & CSV Reports</h4>
                      <p className={`text-[11px] ${themeTextSub}`}>Preview generated official compliance document.</p>
                    </div>
                    <Award size={18} className="text-teal-500" />
                  </div>

                  <div className={`p-4 rounded-xl border font-mono text-[11px] space-y-2 ${
                    isLight ? "bg-white border-slate-200 text-slate-800" : "bg-stone-900 border-stone-800 text-stone-200"
                  }`}>
                    <div className="flex justify-between border-b pb-2 border-stone-700">
                      <span className="font-bold">NOVA HERD AUDIT REPORT #882</span>
                      <span>DATE: {new Date().toLocaleDateString()}</span>
                    </div>
                    <div>HEALTH VERIFIED: 100% PASS</div>
                    <div>PADDOCK TROUGHS: ALL CHECKED OK</div>
                    <div>AUDIT COMPLIANCE STAMP: SYSTEM ADMINISTRATOR (OWNER)</div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => alert("Simulated CSV Export downloaded to device!")}
                      className="flex-1 bg-teal-600 hover:bg-teal-500 text-white font-black text-xs uppercase py-2.5 rounded-xl cursor-pointer shadow-xs"
                    >
                      Export CSV Data
                    </button>
                    <button
                      type="button"
                      onClick={() => alert("Simulated Official PDF generated!")}
                      className="flex-1 bg-stone-800 hover:bg-stone-750 text-white font-black text-xs uppercase py-2.5 rounded-xl cursor-pointer shadow-xs border border-stone-700"
                    >
                      Download PDF Report
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Bottom CTAs */}
            <div className="flex items-center justify-between pt-2 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setActiveFeatureModal(null)}
                className={`text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl border ${
                  isLight ? "bg-slate-100 text-slate-700 border-slate-300" : "bg-stone-800 text-stone-300 border-stone-700"
                }`}
              >
                Close Preview
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveFeatureModal(null);
                  setShowSignInModal(true);
                }}
                className="bg-teal-500 hover:bg-teal-400 text-stone-950 font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-2"
              >
                <span>Launch App Terminal</span>
                <ArrowRight size={14} />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Floating Cookie Consent Banner (Appears only on first visit) */}
      {showCookieBanner && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-xl z-50 bg-stone-900/95 border border-stone-750 p-5 rounded-2xl shadow-2xl backdrop-blur-lg flex flex-col space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-400 font-black text-xs uppercase tracking-wider">
              <Cookie size={18} />
              <span>Cookie &amp; Privacy Consent</span>
            </div>
            <button
              onClick={() => setShowCookieBanner(false)}
              className="text-stone-400 hover:text-white cursor-pointer"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-stone-300 leading-relaxed">
            We use essential cookies to maintain secure farm portal sessions, remember your farm login credentials, and optimize system telemetry.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              onClick={handleAcceptEssentials}
              className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-200 border border-stone-700 text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Only Essentials
            </button>
            <button
              onClick={handleAcceptAllCookies}
              className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-stone-950 text-xs font-black uppercase tracking-wider shadow-lg shadow-teal-500/20 cursor-pointer"
            >
              Allow All Cookies
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
