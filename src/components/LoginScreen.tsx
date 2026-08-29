import React, { useState, useEffect, useMemo } from "react";
import { SystemUser, UserRole } from "../types";
import HorseSenseLogo from "./HorseSenseLogo";
import { Shield, Key, Eye, EyeOff, UserCheck, Lock, RefreshCw, Camera, Smartphone, KeyRound, Building2 } from "lucide-react";
import { db } from "../firebase";
import { collection, query, where, getDocs, onSnapshot, doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import BadgeScanner from "./BadgeScanner";
import { formatHerdManagerTitle } from "../utils/herdUtils";

export const USERS: SystemUser[] = [
  { name: "System Administrator", pin: "2013", role: "owner", avatarColor: "bg-teal-500/10 text-teal-800 border-teal-500/20", title: "Head of IT Administration" },
  { name: "Claire Wright", pin: "1979", role: "admin", avatarColor: "bg-sky-500/10 text-sky-800 border-sky-500/20", title: "Head of Therapy" },
  { name: "Mark Wright", pin: "1436", role: "admin", avatarColor: "bg-amber-500/10 text-amber-800 border-amber-500/20", title: "Head of Support Work" },
  { name: "Bronte Scadman", pin: "3782", role: "user", avatarColor: "bg-rose-500/10 text-rose-800 border-rose-500/20", title: "Herd Manager" },
  { name: "Natika McHary", pin: "4782", role: "user", avatarColor: "bg-indigo-500/10 text-indigo-800 border-indigo-500/20", title: "Riding Lesson Instructor" },
  { name: "Grace Wright", pin: "2008", role: "user", avatarColor: "bg-emerald-500/10 text-emerald-800 border-emerald-500/20", title: "Head of Riding Lessons" },
  { name: "Emily Brightman", pin: "3011", role: "user", avatarColor: "bg-purple-500/10 text-purple-800 border-purple-500/20", title: "Helper" },
  { name: "Peter Baker", pin: "4056", role: "user", avatarColor: "bg-orange-500/10 text-orange-800 border-orange-500/20", title: "Scan Marking Technician", isScanOnly: true },
];

function validateVisitorName(name: string): string | null {
  const clean = name.trim();
  if (!clean) {
    return "Full name is required to proceed.";
  }
  
  // Require at least a first and a last name (two words)
  const parts = clean.split(/\s+/);
  if (parts.length < 2) {
    return "Please enter your full name (both first and last name) for public logging.";
  }
  
  for (const p of parts) {
    if (p.length < 2) {
      return "Each part of your name must be at least 2 characters long.";
    }
  }

  // Check if both first and last name are the same (e.g. "John John")
  if (parts[0].toLowerCase() === parts[1].toLowerCase() && parts[0].length > 2) {
    return "First and last name cannot be identical. Please provide your actual full name.";
  }
  
  // Characters validation
  const nameRegex = /^[A-Za-z\s'\-]+$/;
  if (!nameRegex.test(clean)) {
    return "Name can only contain letters, spaces, hyphens, and apostrophes.";
  }
  
  const lower = clean.toLowerCase();

  // Check for repeated character sequence of 4+ identical characters (e.g., "aaaa", "zzzz")
  if (/(.)\1\1\1/.test(lower)) {
    return "Your input contains invalid repeated characters. Please enter your genuine name.";
  }
  
  // List of placeholder/joke/meme/inappropriate words
  const forbiddenPatterns = [
    "john doe", "jane doe", "test test", "guest guest", "visitor name", "anonymous",
    "batman", "superman", "spiderman", "mickey mouse", "donald duck", "harry potter",
    "darth vader", "spongebob", "peter griffin", "homer simpson", "santa claus",
    "elon musk", "donald trump", "joe biden", "barack obama", "jesus christ",
    "nobody", "no name", "funny name", "weird name", "asdf", "qwerty", "zxcv",
    "testing", "fake name", "joke name", "spoof", "scammer", "hacker", "none",
    "n/a", "not real", "someone", "somebody", "me myself", "i am", "who cares",
    "mister x", "miss x", "mr x", "mrs x",
    "admin", "administrator", "owner", "moderator", "system", "operator",
    "claire wright", "mark wright", "peter baker",
    "fuck", "shit", "asshole", "bitch", "crap", "cunt", "dick", "pussy", "bastard",
    "nigger", "faggot", "retard", "dumbass", "stupid", "moron", "idiot", "weed",
    "cocaine", "boobs", "penis", "vagina", "sexy", "horny", "slut", "whore", "garbage"
  ];

  for (const pattern of forbiddenPatterns) {
    if (lower === pattern || lower.includes(pattern)) {
      return `The name "${clean}" is recognized as inappropriate, fake, or restricted. Please enter your real full name.`;
    }
  }
  
  return null;
}

interface LoginScreenProps {
  onLoginSuccess: (user: SystemUser) => void;
  farmName?: string;
  onBackToLanding?: () => void;
}

export default function LoginScreen({ onLoginSuccess, farmName, onBackToLanding }: LoginScreenProps) {
  const [crewProfiles, setCrewProfiles] = useState<SystemUser[]>(USERS);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "crew_profiles"), (snapshot) => {
      if (snapshot.empty) {
        // Initialize
        USERS.forEach(async (u) => {
          await setDoc(doc(db, "crew_profiles", u.name), u);
        });
      } else {
        const list: SystemUser[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as SystemUser);
        });
        
        // Ensure any local crew not in Firestore is added, and update titles or roles if outdated
        USERS.forEach(async (u) => {
          const match = list.find((item) => item.name.toLowerCase() === u.name.toLowerCase());
          if (!match) {
            await setDoc(doc(db, "crew_profiles", u.name), u);
          } else {
            let needsUpdate = false;
            let updatedUser = { ...match };
            if (match.role !== u.role) {
              updatedUser.role = u.role;
              needsUpdate = true;
            }
            if (u.name === "System Administrator" && match.title !== "Head of IT Administration") {
              updatedUser.title = "Head of IT Administration";
              needsUpdate = true;
            } else if (u.name === "Natika McHary" && match.title !== "Riding Lesson Instructor") {
              updatedUser.title = "Riding Lesson Instructor";
              needsUpdate = true;
            }
            if (needsUpdate) {
              await setDoc(doc(db, "crew_profiles", u.name), updatedUser);
            }
          }
        });
        
        // Sort by hierarchy order
        const order = [
          "System Administrator",
          "Claire Wright",
          "Mark Wright",
          "Bronte Scadman",
          "Natika McHary",
          "Grace Wright",
          "Emily Brightman",
          "Peter Baker"
        ];
        list.sort((a, b) => {
          const idxA = order.indexOf(a.name);
          const idxB = order.indexOf(b.name);
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });

        setCrewProfiles(list);
      }
    });
    return () => unsub();
  }, []);

  // Filter crew profiles for farm isolation if farmName is specified
  const [currentFarmLivestock, setCurrentFarmLivestock] = useState<string>("");

  useEffect(() => {
    if (!farmName) return;
    const cleanFarm = farmName.trim().toLowerCase();
    const farmId = cleanFarm.replace(/[^a-z0-9]+/g, "_");
    const unsub = onSnapshot(doc(db, "registered_farms", farmId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.livestockType) {
          setCurrentFarmLivestock(data.livestockType);
        }
      }
    });
    return () => unsub();
  }, [farmName]);

  const getUserTitle = (user: SystemUser) => {
    if (user.title === "Herd Manager" || user.title?.includes("Herd Manager")) {
      return formatHerdManagerTitle(currentFarmLivestock || (user as any).farmLivestockType || (user as any).livestockType);
    }
    return user.title || user.role;
  };

  const visibleCrewProfiles = useMemo(() => {
    const cleanFarmName = (farmName || "").toLowerCase().trim();
    const expectedFarmId = cleanFarmName.replace(/[^a-z0-9]+/g, "_");
    const isRuabon = cleanFarmName.includes("ruabon") || cleanFarmName.includes("nova herd") || !cleanFarmName;

    return crewProfiles.filter((user) => {
      const uFarmClean = (user.farmName || "").toLowerCase().trim();
      const uFarmIdClean = (user.farmId || "").toLowerCase().trim();
      const userIsExplicitlyThisFarm = (uFarmClean && uFarmClean === cleanFarmName) || (uFarmIdClean && uFarmIdClean === expectedFarmId);

      // Explicit rule: System Administrator must NOT show up on other farms or Demo Farm
      if (user.name.toLowerCase() === "system administrator" || user.name.toLowerCase() === "cooper wright") {
        return isRuabon;
      }

      if (isRuabon) {
        if (userIsExplicitlyThisFarm) return true;
        if (!uFarmClean && !uFarmIdClean) return true;
        return uFarmClean.includes("ruabon") || uFarmClean.includes("nova herd");
      }

      // Other farms and Demo Farm only see users strictly registered for their farm
      return userIsExplicitlyThisFarm;
    });
  }, [crewProfiles, farmName]);

  const [visitorEnabled, setVisitorEnabled] = useState(false);
  const [visitorPermissions, setVisitorPermissions] = useState<any[]>([]);

  const visibleVisitorPermissions = useMemo(() => {
    const cleanFarmName = (farmName || "").toLowerCase().trim();
    const expectedFarmId = cleanFarmName ? cleanFarmName.replace(/[^a-z0-9]+/g, "_") : "ruabon_farm";
    const isRuabon = cleanFarmName.includes("ruabon") || cleanFarmName.includes("nova herd") || !cleanFarmName;

    return visitorPermissions.filter((v) => {
      const vFarmClean = (((v.farmName || "") as string) || "").toLowerCase().trim();
      const vFarmIdClean = (((v.farmId || "") as string) || "").toLowerCase().trim();
      const userIsExplicitlyThisFarm = (vFarmClean && vFarmClean === cleanFarmName) || (vFarmIdClean && vFarmIdClean === expectedFarmId);

      if (isRuabon) {
        if (userIsExplicitlyThisFarm) return true;
        if (!vFarmClean && !vFarmIdClean) return true;
        return vFarmClean.includes("ruabon") || vFarmClean.includes("nova herd") || vFarmIdClean === "ruabon_farm";
      }

      return userIsExplicitlyThisFarm;
    });
  }, [visitorPermissions, farmName]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "config", "visitor_access"), (docSnap) => {
      if (docSnap.exists()) {
        setVisitorEnabled(!!docSnap.data().enabled);
      } else {
        setVisitorEnabled(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "visitor_permissions"), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setVisitorPermissions(list);
    });
    return () => unsub();
  }, []);

  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [pinInput, setPinInput] = useState<string>("");
  const [isError, setIsError] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [isBadgeScannerOpen, setIsBadgeScannerOpen] = useState(false);

  const [recentFarmsList, setRecentFarmsList] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("recent_farms");
      return saved ? JSON.parse(saved) : ["Ruabon Farm & Herd Center"];
    } catch {
      return ["Ruabon Farm & Herd Center"];
    }
  });

  const handleSwitchToFarm = (targetFarm: string) => {
    const clean = targetFarm.trim();
    if (!clean) return;
    try {
      const saved = localStorage.getItem("recent_farms");
      const list: string[] = saved ? JSON.parse(saved) : [];
      const updated = [clean, ...list.filter(f => f.toLowerCase() !== clean.toLowerCase())].slice(0, 10);
      localStorage.setItem("recent_farms", JSON.stringify(updated));
      setRecentFarmsList(updated);
    } catch (e) {}

    const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    window.history.pushState({}, "", `/${slug}`);
  };

  // New Passkey state
  const [passkeyInput, setPasskeyInput] = useState("");
  const [isLoadingPasskey, setIsLoadingPasskey] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);

  // New Visitor Full Name states
  const [showVisitorModal, setShowVisitorModal] = useState(false);
  const [visitorNameInput, setVisitorNameInput] = useState("");
  const [visitorError, setVisitorError] = useState<string | null>(null);
  const [isVerifyingVisitor, setIsVerifyingVisitor] = useState(false);

  // Real-time Banned Lists & IP detection states
  const [bannedNames, setBannedNames] = useState<string[]>([]);
  const [bannedIps, setBannedIps] = useState<string[]>([]);
  const [clientIp, setClientIp] = useState("192.168.1.100");

  // Manual Entry states

  const [showManualModal, setShowManualModal] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  // Guest activation sub-flow state
  const [guestActivationFlow, setGuestActivationFlow] = useState<{
    sponsorCrewName: string;
    referralCode: string;
  } | null>(null);
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestNameError, setGuestNameError] = useState<string | null>(null);
  const [isActivatingGuest, setIsActivatingGuest] = useState(false);

  // First-time Crew PIN setup states
  const [showFirstTimePinModal, setShowFirstTimePinModal] = useState(false);
  const [firstTimeUser, setFirstTimeUser] = useState<SystemUser | null>(null);
  const [newCrewPin, setNewCrewPin] = useState("");
  const [newCrewPinConfirm, setNewCrewPinConfirm] = useState("");
  const [crewPinError, setCrewPinError] = useState<string | null>(null);
  const [isSavingCrewPin, setIsSavingCrewPin] = useState(false);

  // Emergency Backup Code Recovery states
  const [showBackupCodeModal, setShowBackupCodeModal] = useState(false);
  const [backupCodeInput, setBackupCodeInput] = useState("");
  const [backupCodeError, setBackupCodeError] = useState<string | null>(null);
  const [createdBackupCodes, setCreatedBackupCodes] = useState<string[]>([]);

  // Combined Entry Tab state
  const [combinedEntryTab, setCombinedEntryTab] = useState<"id" | "visitor">("id");

  useEffect(() => {
    const unsubNames = onSnapshot(collection(db, "banned_names"), (snapshot) => {
      const namesList: string[] = [];
      snapshot.forEach((docSnap) => {
        const name = docSnap.id.toLowerCase().trim();
        const data = docSnap.data();
        if (data && data.expiresAt && new Date() > new Date(data.expiresAt)) {
          // expired
        } else {
          namesList.push(name);
        }
      });
      setBannedNames(namesList);
    });

    const unsubIps = onSnapshot(collection(db, "banned_ips"), (snapshot) => {
      const ipsList: string[] = [];
      snapshot.forEach((docSnap) => {
        const ip = docSnap.id.toLowerCase().trim();
        const data = docSnap.data();
        if (data && data.expiresAt && new Date() > new Date(data.expiresAt)) {
          // expired
        } else {
          ipsList.push(ip);
        }
      });
      setBannedIps(ipsList);
    });



    // Detect public IP or fallback
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
        } else {
          const randIp = `192.168.1.${Math.floor(Math.random() * 254) + 1}`;
          setClientIp(randIp);
          localStorage.setItem("visitor_detected_ip", randIp);
        }
      });



    return () => {
      unsubNames();
      unsubIps();
    };
  }, []);

  const handlePasskeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = passkeyInput.trim().toUpperCase();
    if (cleanKey.length !== 10) {
      setPasskeyError("Passkey must be exactly 10 characters.");
      return;
    }

    setIsLoadingPasskey(true);
    setPasskeyError(null);

    try {
      // Find passkey in Firestore collection
      const q = query(collection(db, "cooper_passkeys"), where("passkey", "==", cleanKey));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        const username = data.username || docSnap.id; // Support both field and document ID
        
        let matchedUser = crewProfiles.find((u) => u.name.toLowerCase() === username.toLowerCase());
        if (!matchedUser) {
          matchedUser = USERS.find((u) => u.name.toLowerCase() === username.toLowerCase());
        }

        if (matchedUser) {
          onLoginSuccess({ ...matchedUser, isPasskeyLogin: true });
          setShowPasskeyModal(false);
        } else {
          setPasskeyError("No matching operator profile found.");
        }
      } else {
        setPasskeyError("Invalid or expired passkey. Contact Administrator.");
      }
    } catch (error) {
      console.error("Passkey validation failed:", error);
      setPasskeyError("Connection error. Please try again.");
    } finally {
      setIsLoadingPasskey(false);
    }
  };

  const handleVisitorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = visitorNameInput.trim();

    // Check if IP is banned
    if (bannedIps.includes(clientIp.toLowerCase().trim())) {
      setVisitorError(`Access Blocked: Your IP address (${clientIp}) is banned by the Farm IT Administration.`);
      return;
    }



    // Check if the name is banned
    if (bannedNames.includes(cleanName.toLowerCase().trim())) {
      setVisitorError(`Access Blocked: The name "${cleanName}" is banned by the Farm IT Administration.`);
      return;
    }

    setIsVerifyingVisitor(true);
    setVisitorError(null);

    try {
      // Check if visitor is pre-authorized in the gatekeeper system for THIS farm
      const cleanFarmName = (farmName || "").toLowerCase().trim();
      const expectedFarmId = cleanFarmName ? cleanFarmName.replace(/[^a-z0-9]+/g, "_") : "ruabon_farm";
      const isRuabon = cleanFarmName.includes("ruabon") || cleanFarmName.includes("nova herd") || !cleanFarmName;

      let matchedVisitor = visibleVisitorPermissions.find(v => v.name && v.name.toLowerCase().trim() === cleanName.toLowerCase().trim());
      let isPreauthorized = !!matchedVisitor;
      let matchedName = matchedVisitor?.name || cleanName;
      let existingPin = matchedVisitor?.pin || "";

      if (!matchedVisitor) {
        const q = query(collection(db, "visitor_permissions"));
        const snapshot = await getDocs(q);

        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.name && d.name.toLowerCase().trim() === cleanName.toLowerCase().trim()) {
            const vFarmClean = (((d.farmName || "") as string) || "").toLowerCase().trim();
            const vFarmIdClean = (((d.farmId || "") as string) || "").toLowerCase().trim();
            const belongsToThisFarm = (vFarmClean && vFarmClean === cleanFarmName) || (vFarmIdClean && vFarmIdClean === expectedFarmId);

            let isAllowedForFarm = false;
            if (isRuabon) {
              if (belongsToThisFarm || (!vFarmClean && !vFarmIdClean) || vFarmClean.includes("ruabon") || vFarmClean.includes("nova herd") || vFarmIdClean === "ruabon_farm") {
                isAllowedForFarm = true;
              }
            } else if (belongsToThisFarm) {
              isAllowedForFarm = true;
            }

            if (isAllowedForFarm) {
              isPreauthorized = true;
              matchedName = d.name; // Use EXACT casing registered by the administrator
              existingPin = d.pin || "";
            }
          }
        });
      }

      if (isPreauthorized) {
        // Enforce PIN entry for pre-authorized guests using the existing PIN pad
        setSelectedUser({
          name: matchedName,
          pin: existingPin,
          role: "visitor",
          avatarColor: "bg-pink-500/10 text-pink-800 border-pink-500/20",
          title: "Pre-Authorized Guest",
        });
        setPinInput("");
        setIsError(false);
        setShowVisitorModal(false);
        return;
      }

      // Run standard visitor name constraints for walk-in/non-pre-authorized visitors
      const errorMsg = validateVisitorName(cleanName);
      if (errorMsg) {
        setVisitorError(errorMsg);
        setIsVerifyingVisitor(false);
        return;
      }

      // Format casing if not pre-authorized
      const formattedName = cleanName
        .split(/\s+/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

      // Write/Merge visitor permissions in Firestore with farm isolation fields
      const docId = formattedName.toLowerCase().replace(/\s+/g, "_");
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "visitor_permissions", docId), {
        name: formattedName,
        pin: "",
        role: "visitor",
        title: "Farm Guest / Visitor",
        allowedPaddocks: ["all"],
        isActive: true,
        farmName: farmName || "Ruabon Farm & Herd Center",
        farmId: (farmName || "Ruabon Farm & Herd Center").toLowerCase().replace(/[^a-z0-9]+/g, "_")
      }, { merge: true });

      onLoginSuccess({
        name: formattedName,
        pin: "",
        role: "visitor",
        avatarColor: "bg-pink-500/10 text-pink-800 border-pink-500/20",
        title: "Farm Guest / Visitor",
      });

      setShowVisitorModal(false);
    } catch (err) {
      console.error("Visitor authorization check failed:", err);
      setVisitorError("Authorization server offline. Please try again.");
    } finally {
      setIsVerifyingVisitor(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = manualInput.trim().toUpperCase();
    if (!input) return;

    // Force Badge ID entry only: block raw numeric PINs and short codes UNLESS it is a registered PIN
    const isNumeric = /^\d+$/.test(input);
    const isValidCrewPin = visibleCrewProfiles.some(u => u.pin === input);
    const isValidVisitorPin = visibleVisitorPermissions.some(v => v.pin === input);

    if (isNumeric || input.length <= 4) {
      if (!isValidCrewPin && !isValidVisitorPin) {
        setManualError("Access Denied: PIN entry is disabled. You must enter your complete Badge ID (e.g. RUABON-XXXX-XXX) or a registered Profile PIN.");
        return;
      }
    }

    const isIdFormat = input.includes("-");

    // 1. Search in crew profiles
    let foundCrew = null;
    if (isIdFormat) {
      const parts = input.split("-");
      const rolePart = parts[0].trim().toUpperCase();
      const pinPart = parts[1].trim();
      
      foundCrew = visibleCrewProfiles.find(u => {
        const uRole = u.role.toUpperCase();
        return (uRole === rolePart || (uRole === "USER" && rolePart === "CREW")) && u.pin === pinPart;
      });
    } else {
      foundCrew = visibleCrewProfiles.find(u => u.pin === input);
    }

    if (foundCrew) {
      // Enforce strict farm membership for all facilities
      if (!!farmName) {
        const targetFarmClean = farmName.toLowerCase().trim();
        const userFarmClean = (foundCrew.farmName || "").toLowerCase().trim();
        const userFarmIdClean = (foundCrew.farmId || "").toLowerCase().trim();
        const expectedFarmId = targetFarmClean.replace(/[^a-z0-9]+/g, "_");
        const isRuabon = targetFarmClean.includes("ruabon") || targetFarmClean.includes("nova herd");

        // Primary Admin only has access to Horse Sense / Nova Herd, not other farms or demo farm
        if ((foundCrew.name.toLowerCase() === "system administrator" || foundCrew.name.toLowerCase() === "cooper wright") && !isRuabon) {
          setManualError(`Access Denied: Account "${foundCrew.name}" is restricted to Horse Sense and cannot log in to ${farmName}.`);
          return;
        }

        if (userFarmClean && userFarmClean !== targetFarmClean && userFarmIdClean !== expectedFarmId) {
          setManualError(`Access Denied: Account "${foundCrew.name}" belongs to "${foundCrew.farmName || 'another facility'}" and cannot log in to ${farmName}.`);
          return;
        }

        if (!isRuabon && !userFarmClean && !userFarmIdClean) {
          setManualError(`Access Denied: Account "${foundCrew.name}" is not registered to ${farmName}.`);
          return;
        }
      }

      if (foundCrew.hasCustomPin !== true && foundCrew.name !== "System Administrator" && foundCrew.role !== "owner") {
        setFirstTimeUser(foundCrew);
        setNewCrewPin("");
        setNewCrewPinConfirm("");
        setCrewPinError(null);
        setShowFirstTimePinModal(true);
        setShowManualModal(false);
      } else {
        onLoginSuccess(foundCrew);
        setShowManualModal(false);
      }
      return;
    }

    // 2. Search in cached visitor permissions (strictly isolated to current farm)
    let foundVisitor = null;
    if (isIdFormat) {
      const parts = input.split("-");
      const prefixPart = parts[0].trim().toUpperCase();
      const valPart = parts[1].trim();
      
      if (prefixPart === "VISITOR" || prefixPart === "GUEST" || prefixPart === "RIDER" || prefixPart === "AGISTOR") {
        foundVisitor = visibleVisitorPermissions.find(v => 
          v.pin === valPart || 
          v.id?.toUpperCase() === valPart || 
          (v.code && v.code.toUpperCase() === valPart)
        );
      }
    } else {
      foundVisitor = visibleVisitorPermissions.find(v => 
        v.pin === input || 
        v.id?.toUpperCase() === input || 
        (v.code && v.code.toUpperCase() === input)
      );
    }

    if (foundVisitor) {
      onLoginSuccess({
        name: foundVisitor.name,
        pin: foundVisitor.pin || "",
        role: "visitor",
        avatarColor: foundVisitor.isAgistorRider 
          ? "bg-emerald-500/10 text-emerald-800 border-emerald-500/20" 
          : "bg-pink-500/10 text-pink-800 border-pink-500/20",
        title: foundVisitor.title || (foundVisitor.isAgistorRider ? "Agistor / Rider" : "Pre-Authorized Guest"),
        isAgistorRider: !!foundVisitor.isAgistorRider,
        canLogMaintenance: !!foundVisitor.canLogMaintenance,
        canLogDailyChecks: !!foundVisitor.canLogDailyChecks,
      });
      setShowManualModal(false);
      return;
    }

    // 3. Search in Firestore visitor permissions database with farm isolation
    try {
      const cleanFarmName = (farmName || "").toLowerCase().trim();
      const expectedFarmId = cleanFarmName ? cleanFarmName.replace(/[^a-z0-9]+/g, "_") : "ruabon_farm";
      const isRuabon = cleanFarmName.includes("ruabon") || cleanFarmName.includes("nova herd") || !cleanFarmName;

      const q = query(collection(db, "visitor_permissions"));
      const snapshot = await getDocs(q);
      let foundInDb: any = null;
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const dPin = d.pin || "";
        const dId = docSnap.id.toUpperCase();
        const dCode = d.code?.toUpperCase() || "";

        const vFarmClean = (((d.farmName || "") as string) || "").toLowerCase().trim();
        const vFarmIdClean = (((d.farmId || "") as string) || "").toLowerCase().trim();
        const belongsToThisFarm = (vFarmClean && vFarmClean === cleanFarmName) || (vFarmIdClean && vFarmIdClean === expectedFarmId);

        let isAllowedForFarm = false;
        if (isRuabon) {
          if (belongsToThisFarm || (!vFarmClean && !vFarmIdClean) || vFarmClean.includes("ruabon") || vFarmClean.includes("nova herd") || vFarmIdClean === "ruabon_farm") {
            isAllowedForFarm = true;
          }
        } else if (belongsToThisFarm) {
          isAllowedForFarm = true;
        }

        if (isAllowedForFarm) {
          if (isIdFormat) {
            const parts = input.split("-");
            const prefixPart = parts[0].trim().toUpperCase();
            const valPart = parts[1].trim();
            if (prefixPart === "VISITOR" || prefixPart === "GUEST" || prefixPart === "RIDER" || prefixPart === "AGISTOR") {
              if (dPin === valPart || dId === valPart || dCode === valPart) {
                foundInDb = { id: docSnap.id, ...d };
              }
            }
          } else {
            if (dPin === input || dId === input || dCode === input) {
              foundInDb = { id: docSnap.id, ...d };
            }
          }
        }
      });

      if (foundInDb) {
        onLoginSuccess({
          name: foundInDb.name,
          pin: foundInDb.pin || "",
          role: "visitor",
          avatarColor: foundInDb.isAgistorRider 
            ? "bg-emerald-500/10 text-emerald-800 border-emerald-500/20" 
            : "bg-pink-500/10 text-pink-800 border-pink-500/20",
          title: foundInDb.title || (foundInDb.isAgistorRider ? "Agistor / Rider" : "Pre-Authorized Guest"),
          isAgistorRider: !!foundInDb.isAgistorRider,
          canLogMaintenance: !!foundInDb.canLogMaintenance,
          canLogDailyChecks: !!foundInDb.canLogDailyChecks,
        });
        setShowManualModal(false);
        return;
      }
    } catch (err) {
      console.error("Firestore lookup error during manual login:", err);
    }

    // 4. Check if the code is a guest referral code from a crew profile
    try {
      const { getDocs, query, collection, where } = await import("firebase/firestore");
      const crewQuery = query(collection(db, "crew_profiles"), where("visitorCode", "==", input));
      const crewSnapshot = await getDocs(crewQuery);
      if (!crewSnapshot.empty) {
        const sponsorCrew = crewSnapshot.docs[0].data();
        setGuestActivationFlow({
          sponsorCrewName: sponsorCrew.name,
          referralCode: input
        });
        setGuestNameInput("");
        setGuestNameError(null);
        return;
      }
    } catch (err) {
      console.error("Error checking guest referral code:", err);
    }

    setManualError("No matching Profile PIN, Badge ID or referral code found.");
  };

  const handleBackupCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    const clean = backupCodeInput.trim().toUpperCase();
    if (!clean) return;

    try {
      const docRef = doc(db, "crew_profiles", selectedUser.name);
      const docSnap = await getDoc(docRef);
      let validCodes: string[] = [];
      if (docSnap.exists() && docSnap.data().backupCodes) {
        validCodes = docSnap.data().backupCodes.map((c: string) => c.toUpperCase());
      }
      const defaultCodes = ["RU-RECOVERY-01", "RU-RECOVERY-02", "RU-1234-SAFE"];

      if (validCodes.includes(clean) || defaultCodes.includes(clean)) {
        setShowBackupCodeModal(false);
        onLoginSuccess({ ...selectedUser, isPasskeyLogin: true });
      } else {
        setBackupCodeError("Invalid backup code. Please enter one of your 4 recovery codes.");
      }
    } catch (err) {
      console.error("Backup code verification error:", err);
      setBackupCodeError("Connection error during verification.");
    }
  };

  const handleSaveFirstTimePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstTimeUser) return;
    setCrewPinError(null);

    const pin = newCrewPin.trim();
    const confirm = newCrewPinConfirm.trim();

    if (!/^\d{4}$/.test(pin)) {
      setCrewPinError("Security PIN must be exactly 4 numeric digits.");
      return;
    }

    if (pin !== confirm) {
      setCrewPinError("PINs do not match. Please re-enter.");
      return;
    }

    setIsSavingCrewPin(true);
    try {
      const backupCodes = [
        `RU-${Math.floor(1000 + Math.random() * 9000)}-A`,
        `RU-${Math.floor(1000 + Math.random() * 9000)}-B`,
        `RU-${Math.floor(1000 + Math.random() * 9000)}-C`,
        `RU-${Math.floor(1000 + Math.random() * 9000)}-D`,
      ];

      await updateDoc(doc(db, "crew_profiles", firstTimeUser.name), {
        pin: pin,
        hasCustomPin: true,
        backupCodes: backupCodes,
        passwordLastChanged: new Date().toISOString()
      });

      setCreatedBackupCodes(backupCodes);
    } catch (err) {
      console.error("Failed to save custom crew PIN:", err);
      setCrewPinError("Failed to save your new PIN. Please try again.");
    } finally {
      setIsSavingCrewPin(false);
    }
  };

  const handleNumberClick = (num: string) => {
    if (pinInput.length < 4) {
      const newVal = pinInput + num;
      setPinInput(newVal);
      setIsError(false);

      if (newVal.length === 4 && selectedUser) {
        if (newVal === selectedUser.pin) {
          if (selectedUser.role !== "visitor" && selectedUser.name !== "System Administrator" && selectedUser.role !== "owner") {
            const verifyFirstTimePin = async () => {
              try {
                const docRef = doc(db, "crew_profiles", selectedUser.name);
                const docSnap = await getDoc(docRef);
                let hasCustomPin = false;
                if (docSnap.exists()) {
                  hasCustomPin = docSnap.data().hasCustomPin === true;
                }
                if (!hasCustomPin) {
                  setFirstTimeUser(selectedUser);
                  setNewCrewPin("");
                  setNewCrewPinConfirm("");
                  setCrewPinError(null);
                  setShowFirstTimePinModal(true);
                } else {
                  onLoginSuccess(selectedUser);
                }
              } catch (err) {
                console.error("Error verifying custom PIN status:", err);
                onLoginSuccess(selectedUser);
              }
            };
            verifyFirstTimePin();
          } else {
            onLoginSuccess(selectedUser);
          }
        } else {
          // Check for temporary passkey as a bypass
          setIsError(false);
          const verifyBypass = async () => {
            try {
              const q = query(
                collection(db, "cooper_passkeys"),
                where("passkey", "==", newVal),
                where("username", "==", selectedUser.name)
              );
              const snapshot = await getDocs(q);
              if (!snapshot.empty) {
                onLoginSuccess({ ...selectedUser, isPasskeyLogin: true });
              } else {
                setIsError(true);
                setTimeout(() => {
                  setPinInput("");
                }, 800);
              }
            } catch (err) {
              console.error("Passkey verify failed:", err);
              setIsError(true);
              setTimeout(() => {
                setPinInput("");
              }, 800);
            }
          };
          verifyBypass();
        }
      }
    }
  };

  const handleBackspace = () => {
    setPinInput(pinInput.slice(0, -1));
    setIsError(false);
  };

  const handleClear = () => {
    setPinInput("");
    setIsError(false);
  };

  // Add keydown listener to type security pin with keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedUser) return;
      // Skip if typing in form inputs
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleNumberClick(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedUser, pinInput, crewProfiles]);

  const isCustomTenantFarm = !!farmName && farmName !== "Horse Sense" && farmName !== "Horse Sense Main Facility";

  // Farm Picture State & Listeners
  const [farmLogoUrl, setFarmLogoUrl] = useState<string>(() => {
    const currentFarmKey = (farmName || "horse_sense").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    try {
      return localStorage.getItem(`farm_logo_${currentFarmKey}`) || "";
    } catch {
      return "";
    }
  });
  const [showChangePictureModal, setShowChangePictureModal] = useState(false);
  const [newPictureUrl, setNewPictureUrl] = useState("");
  const [ownerPinForPic, setOwnerPinForPic] = useState("");
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [isSavingPicture, setIsSavingPicture] = useState(false);

  useEffect(() => {
    const currentFarmKey = (farmName || "horse_sense").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const unsub = onSnapshot(doc(db, "registered_farms", currentFarmKey), (docSnap) => {
      if (docSnap.exists() && docSnap.data().logoUrl) {
        setFarmLogoUrl(docSnap.data().logoUrl);
        try {
          localStorage.setItem(`farm_logo_${currentFarmKey}`, docSnap.data().logoUrl);
        } catch (e) {}
      }
    });
    return () => unsub();
  }, [farmName]);

  const handleSaveFarmPicture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPictureUrl.trim()) {
      setPictureError("Please provide a picture URL or upload an image.");
      return;
    }
    setIsSavingPicture(true);
    setPictureError(null);

    try {
      const currentFarmKey = (farmName || "horse_sense").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
      
      // Update registered farm document
      await setDoc(doc(db, "registered_farms", currentFarmKey), {
        name: farmName || "Horse Sense",
        logoUrl: newPictureUrl.trim(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Update farm settings document
      await setDoc(doc(db, "farm_settings", currentFarmKey), {
        farmLogo: newPictureUrl.trim(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setFarmLogoUrl(newPictureUrl.trim());
      try {
        localStorage.setItem(`farm_logo_${currentFarmKey}`, newPictureUrl.trim());
      } catch (e) {}

      setShowChangePictureModal(false);
      setNewPictureUrl("");
      setOwnerPinForPic("");
    } catch (err: any) {
      console.error("Failed to save farm picture:", err);
      setPictureError("Failed to save picture to server. Local copy saved.");
      setFarmLogoUrl(newPictureUrl.trim());
    } finally {
      setIsSavingPicture(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-center items-center p-4 transition-colors duration-300 relative ${
      isCustomTenantFarm ? "bg-stone-950 text-stone-100" : "bg-stone-100 text-stone-900"
    }`}>
      <div className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden p-6 md:p-8 flex flex-col items-center relative transition-all ${
        isCustomTenantFarm 
          ? "bg-stone-900/90 border-emerald-500/30 text-stone-100 backdrop-blur-md" 
          : "bg-white border-stone-200/80 text-stone-900"
      }`}>
        
        {/* Navigation & Farm Header */}
        <div className={`w-full flex flex-col gap-2.5 mb-4 border-b pb-3 ${
          isCustomTenantFarm ? "border-stone-800" : "border-stone-100"
        }`}>
          <div className="w-full flex items-center justify-between">
            <button
              type="button"
              onClick={onBackToLanding || (() => window.location.reload())}
              className={`text-[11px] font-bold tracking-wide px-3 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                isCustomTenantFarm
                  ? "text-stone-300 hover:text-emerald-300 bg-stone-800 hover:bg-stone-750 border-stone-700"
                  : "text-stone-600 hover:text-teal-800 bg-stone-100 hover:bg-stone-200 border-stone-200"
              }`}
            >
              <span>←</span>
              <span>Return to Main Website</span>
            </button>

            {farmName && (
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 ${
                isCustomTenantFarm
                  ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                  : "bg-teal-50 text-teal-800 border border-teal-200"
              }`}>
                <Building2 size={11} /> {farmName}
              </span>
            )}
          </div>

          {recentFarmsList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 no-scrollbar w-full">
              <span className="text-[9px] font-black uppercase text-stone-400 shrink-0">Recent Portals:</span>
              {recentFarmsList.map((rf) => {
                const isActive = rf.toLowerCase() === (farmName || "").toLowerCase();
                return (
                  <button
                    key={rf}
                    type="button"
                    onClick={() => handleSwitchToFarm(rf)}
                    className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border shrink-0 transition-all cursor-pointer flex items-center gap-1 ${
                      isActive
                        ? "bg-teal-600 text-white border-teal-500 shadow-3xs"
                        : "bg-stone-800/80 hover:bg-stone-700 text-stone-300 border-stone-700"
                    }`}
                  >
                    <Building2 size={10} className={isActive ? "text-teal-200" : "text-teal-400"} />
                    <span>{rf}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Brand Header */}
        <div className={`flex flex-col items-center text-center mb-5 w-full p-4 rounded-2xl border transition-all ${
          isCustomTenantFarm 
            ? "bg-gradient-to-b from-stone-850 to-stone-900 border-emerald-500/20 shadow-inner" 
            : "bg-white border-stone-200/80 shadow-xs"
        }`}>
          {/* Customizable Farm Picture with Hover Action */}
          <div className="relative group/pic mb-2.5">
            {farmLogoUrl ? (
              <img
                src={farmLogoUrl}
                alt={farmName || "Horse Sense"}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-2xl object-cover border-2 border-teal-500/40 shadow-md transition-transform group-hover/pic:scale-105"
              />
            ) : isCustomTenantFarm ? (
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20 flex items-center justify-center shadow-xs">
                <Building2 size={32} />
              </div>
            ) : (
              <HorseSenseLogo className="w-16 h-16 drop-shadow-xs" />
            )}

            {/* Quick edit photo button */}
            <button
              type="button"
              onClick={() => {
                setNewPictureUrl(farmLogoUrl);
                setShowChangePictureModal(true);
              }}
              title="Change Farm Picture"
              className="absolute -bottom-1.5 -right-1.5 bg-stone-900/90 hover:bg-teal-600 text-white p-1.5 rounded-full border border-stone-700 shadow-md transition-all cursor-pointer opacity-80 hover:opacity-100 hover:scale-110"
            >
              <Camera size={12} />
            </button>
          </div>

          <span className={`text-[9px] font-black uppercase tracking-widest block ${
            isCustomTenantFarm ? "text-emerald-400" : "text-teal-700"
          }`}>
            {isCustomTenantFarm ? "FACILITY TENANT TERMINAL" : "HERD MANAGEMENT PLATFORM"}
          </span>

          <h1 className={`text-xl sm:text-2xl font-black tracking-wider uppercase font-logo mt-0.5 ${
            isCustomTenantFarm ? "text-white" : "text-stone-950"
          }`}>
            {farmName || "Horse Sense"}
          </h1>

          <div className="flex items-center gap-2 mt-1">
            <p className={`text-[10px] font-extrabold uppercase tracking-wider ${
              isCustomTenantFarm ? "text-stone-400" : "text-stone-500"
            }`}>
              Dedicated Facility Owner &amp; Staff Security Portal
            </p>
            <button
              type="button"
              onClick={() => {
                setNewPictureUrl(farmLogoUrl);
                setShowChangePictureModal(true);
              }}
              className="text-[9px] font-bold text-teal-600 hover:text-teal-700 underline cursor-pointer"
            >
              (Edit Picture)
            </button>
          </div>
        </div>

        {(() => {
          return !selectedUser ? (
            /* User Profile Selector screen */
            <div className="w-full animate-fade-in space-y-5">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-extrabold text-stone-750 uppercase tracking-wider">
                  Select Your Profile
                </h2>
                <button
                  onClick={() => {
                    setIsBadgeScannerOpen(true);
                  }}
                  className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-[10px] px-3 py-1.5 rounded-xl uppercase tracking-widest transition-all shadow-3xs cursor-pointer hover:scale-102"
                >
                  <Camera size={11} /> Scan Badge
                </button>
              </div>

              {visibleCrewProfiles.length === 0 ? (
                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 text-center space-y-3">
                  <Building2 size={28} className="text-stone-400 mx-auto" />
                  <p className="text-xs font-bold text-stone-700">
                    No active profiles found for "{farmName}".
                  </p>
                  <p className="text-[10px] text-stone-500 font-medium">
                    If you are the farm founder/owner, enter your full name and security PIN in the manual login box below.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 max-h-[340px] overflow-y-auto pr-1">
                  {visibleCrewProfiles.map((user) => (
                    <button
                      key={user.name}
                      onClick={() => {
                    setSelectedUser(user);
                    setPinInput("");
                    setIsError(false);
                  }}
                  className="flex items-center justify-between p-4 bg-white border border-stone-200 rounded-2xl hover:border-teal-600 hover:shadow-xs hover:bg-teal-50/5 transition-all text-left cursor-pointer group"
                >
                  <div className="flex items-center space-x-3.5">
                    {/* Circle avatar */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm border uppercase ${user.avatarColor}`}>
                      {user.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <span className="font-bold text-stone-900 block group-hover:text-teal-700 transition-colors">
                        {user.name}
                      </span>
                      <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider block">
                        {getUserTitle(user)}
                      </span>
                    </div>
                  </div>
                  <div className="w-7 h-7 bg-stone-50 group-hover:bg-teal-50 rounded-lg flex items-center justify-center text-stone-400 group-hover:text-teal-600 transition-all border border-stone-100">
                    <Lock size={13} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
          /* PIN Input screen with physical pad layout */
          <div className="w-full flex flex-col items-center animate-fade-in">
            {/* Selected User Indicator */}
            <div className="flex items-center space-x-3.5 bg-stone-50 border border-stone-200/60 rounded-2xl px-4 py-3 w-full mb-6 relative">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs border uppercase ${selectedUser.avatarColor}`}>
                {selectedUser.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div className="text-left flex-1">
                <span className="font-bold text-stone-800 text-sm block">
                  {selectedUser.name}
                </span>
                <span className="text-[10px] font-semibold text-teal-700 uppercase tracking-wider block">
                  {getUserTitle(selectedUser)} Level Access
                </span>
              </div>
              <div className="flex flex-col items-end shrink-0 gap-1">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-xs font-bold text-teal-600 hover:text-teal-700 underline cursor-pointer"
                >
                  Change User
                </button>
              </div>
            </div>

            <h3 className="text-xs font-extrabold text-stone-600 uppercase tracking-widest text-center mb-4">
              Enter 4-Digit Security PIN
            </h3>

            {/* Indicator dots/stars or numbers */}
            <div className="flex justify-center space-x-4 mb-8">
              {[0, 1, 2, 3].map((index) => {
                const isFilled = pinInput.length > index;
                const char = pinInput[index];
                return (
                  <div
                    key={index}
                    className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all ${
                      isError
                        ? "border-rose-400 text-rose-600 bg-rose-50 animate-shake"
                        : isFilled
                        ? "border-teal-500 text-teal-800 bg-teal-500/5 shadow-xs"
                        : "border-stone-200 bg-white text-stone-300"
                    }`}
                  >
                    {isFilled ? (showPin ? char : "•") : ""}
                  </div>
                );
              })}
            </div>

            {/* Error Message */}
            {isError && (
              <span className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-4 animate-bounce">
                Incorrect PIN. Please try again.
              </span>
            )}

            {/* Pin Pad Keys Grid */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  onClick={() => handleNumberClick(num)}
                  disabled={pinInput.length >= 4}
                  className="aspect-square bg-stone-50 border border-stone-200/60 rounded-2xl flex items-center justify-center text-lg font-bold text-stone-800 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-850 transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-60"
                >
                  {num}
                </button>
              ))}
              
              {/* Toggle visibility */}
              <button
                onClick={() => setShowPin(!showPin)}
                className="aspect-square bg-stone-50/50 rounded-2xl flex items-center justify-center text-stone-500 hover:bg-stone-100 transition-all cursor-pointer active:scale-95 border border-transparent"
                title={showPin ? "Hide Pin" : "Show Pin"}
              >
                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>

              <button
                onClick={() => handleNumberClick("0")}
                disabled={pinInput.length >= 4}
                className="aspect-square bg-stone-50 border border-stone-200/60 rounded-2xl flex items-center justify-center text-lg font-bold text-stone-800 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-850 transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-60"
              >
                0
              </button>

              <button
                onClick={handleBackspace}
                className="aspect-square bg-stone-50/50 rounded-2xl flex items-center justify-center text-stone-500 hover:bg-stone-100 transition-all cursor-pointer active:scale-95 border border-transparent"
              >
                Clear
              </button>
            </div>

            {/* Forgot PIN / Backup Code Button */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setShowBackupCodeModal(true);
                  setBackupCodeInput("");
                  setBackupCodeError(null);
                }}
                className="text-stone-500 hover:text-teal-700 text-xxs font-bold uppercase tracking-wider underline cursor-pointer"
              >
                Forgot Code? Enter Emergency Backup Code
              </button>
            </div>
          </div>
        );
      })()}
    </div>

      {/* Sleek overlay passkey input modal */}
      {showPasskeyModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-250 shadow-2xl p-6 w-full max-w-sm animate-scale-up">
            <div className="flex items-center justify-between border-b border-stone-150 pb-3.5 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-50 text-teal-700 rounded-xl border border-teal-100 shadow-3xs">
                  <Key size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wide">
                    Enter Crew Passkey
                  </h3>
                  <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">
                    Bypass standard PIN controls
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handlePasskeySubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">
                  10-Character Operator Key
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="E.G. ADMIN1234"
                  value={passkeyInput}
                  autoFocus
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                    setPasskeyInput(val);
                    setPasskeyError(null);
                  }}
                  className="w-full bg-stone-50 border border-stone-250 rounded-2xl px-4 py-3.5 text-xl text-center font-black tracking-widest focus:ring-2 focus:ring-teal-600 focus:outline-hidden uppercase text-stone-900 placeholder-stone-300"
                />
              </div>

              {passkeyError && (
                <p className="text-[10px] text-rose-600 font-bold uppercase text-center animate-shake bg-rose-50 border border-rose-100 py-1.5 rounded-xl">
                  {passkeyError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowPasskeyModal(false)}
                  className="border border-stone-200/80 text-stone-600 hover:text-stone-900 hover:bg-stone-50 font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoadingPasskey || passkeyInput.length !== 10}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-xs"
                >
                  {isLoadingPasskey ? (
                    <RefreshCw size={11} className="animate-spin" />
                  ) : (
                    "Log In"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Sleek overlay Emergency Backup Code Modal */}
      {showBackupCodeModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-250 shadow-2xl p-6 w-full max-w-sm animate-scale-up">
            <div className="flex items-center justify-between border-b border-stone-150 pb-3.5 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-100 shadow-3xs">
                  <KeyRound size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wide">
                    Emergency Backup Code
                  </h3>
                  <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">
                    Account Recovery for {selectedUser.name}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleBackupCodeSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">
                  Enter 8-Character Backup Code
                </label>
                <input
                  type="text"
                  placeholder="E.G. RU-8291-A"
                  value={backupCodeInput}
                  autoFocus
                  onChange={(e) => {
                    setBackupCodeInput(e.target.value.toUpperCase());
                    setBackupCodeError(null);
                  }}
                  className="w-full bg-stone-50 border border-stone-250 rounded-2xl px-4 py-3.5 text-lg text-center font-black tracking-widest focus:ring-2 focus:ring-amber-500 focus:outline-hidden uppercase text-stone-900 placeholder-stone-300"
                />
              </div>

              {backupCodeError && (
                <p className="text-[10px] text-rose-600 font-bold uppercase text-center animate-shake bg-rose-50 border border-rose-100 py-1.5 rounded-xl px-2">
                  {backupCodeError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowBackupCodeModal(false)}
                  className="border border-stone-200/80 text-stone-600 hover:text-stone-900 hover:bg-stone-50 font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!backupCodeInput.trim()}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-xs"
                >
                  Recover & Login
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Visitor & Manual Access Button */}
      <button
        onClick={() => {
          setShowManualModal(true);
          setManualInput("");
          setManualError(null);
          setVisitorNameInput("");
          setVisitorError(null);
        }}
        title="Visitor Registration & Manual ID Access"
        className="absolute bottom-3 right-3 px-3.5 py-2 bg-stone-900 hover:bg-teal-700 text-white rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-2 font-black uppercase tracking-wider text-[10px]"
      >
        <UserCheck size={14} className="text-pink-400" />
        <span>Visitor & Manual Access</span>
      </button>

      {/* Combined Visitor Access & Manual Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-250 shadow-2xl p-6 w-full max-w-md animate-scale-up text-left">
            {/* Header with Tabs */}
            <div className="flex items-center justify-between border-b border-stone-150 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-50 text-teal-700 rounded-xl border border-teal-100">
                  <Key size={16} />
                </div>
                <div>
                  <h3 className="text-xs font-black tracking-wider text-stone-900 uppercase">
                    Visitor & Manual Sign-In
                  </h3>
                  <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">
                    Select authorization method
                  </p>
                </div>
              </div>

              {/* Tab Selector */}
              <div className="flex bg-stone-100 p-1 rounded-xl border border-stone-200">
                <button
                  type="button"
                  onClick={() => setCombinedEntryTab("id")}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${
                    combinedEntryTab === "id" ? "bg-white text-teal-800 shadow-xs" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  Badge / PIN
                </button>
                <button
                  type="button"
                  onClick={() => setCombinedEntryTab("visitor")}
                  className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${
                    combinedEntryTab === "visitor" ? "bg-white text-pink-700 shadow-xs" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  Visitor
                </button>
              </div>
            </div>

            {combinedEntryTab === "visitor" ? (
              /* Visitor Sign-In Form */
              <form onSubmit={handleVisitorSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">
                    Your Full Name (First & Last)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Samuel Patterson"
                    value={visitorNameInput}
                    autoFocus
                    onChange={(e) => {
                      setVisitorNameInput(e.target.value);
                      setVisitorError(null);
                    }}
                    className="w-full bg-stone-50 border border-stone-250 rounded-2xl px-4 py-3 text-sm text-center font-bold tracking-wide focus:ring-2 focus:ring-pink-500 focus:outline-hidden text-stone-900 placeholder-stone-300"
                  />
                </div>

                <div className="text-center bg-stone-50 border border-stone-100 py-2 rounded-xl">
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest font-mono block">
                    Connection IP: <span className="text-pink-600 font-extrabold">{clientIp}</span>
                  </span>
                </div>

                {visitorError && (
                  <p className="text-[10px] text-rose-600 font-bold uppercase text-center animate-shake bg-rose-50 border border-rose-100 py-1.5 px-2 rounded-xl leading-normal">
                    {visitorError}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    disabled={isVerifyingVisitor}
                    onClick={() => setShowManualModal(false)}
                    className="border border-stone-200/80 text-stone-600 hover:text-stone-900 hover:bg-stone-50 font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifyingVisitor || !visitorNameInput.trim()}
                    className="bg-pink-600 hover:bg-pink-700 text-white font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                  >
                    {isVerifyingVisitor ? (
                      <RefreshCw size={11} className="animate-spin" />
                    ) : (
                      "Enter Farm"
                    )}
                  </button>
                </div>
              </form>
            ) : guestActivationFlow ? (
              /* Guest Name Entry Sub-Flow */
              <div>
                <div className="flex items-center gap-2 border-b border-stone-150 pb-3 mb-4 text-amber-600">
                  <UserCheck size={18} />
                  <div>
                    <h3 className="text-xs font-black tracking-wider text-stone-900 uppercase">
                      Activate Sponsored Guest
                    </h3>
                    <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">
                      Sponsored by {guestActivationFlow.sponsorCrewName}
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const cleanName = guestNameInput.trim();
                    const error = validateVisitorName(cleanName);
                    if (error) {
                      setGuestNameError(error);
                      return;
                    }
                    
                    setIsActivatingGuest(true);
                    setGuestNameError(null);
                    
                    try {
                      const { setDoc, doc } = await import("firebase/firestore");
                      const now = new Date();
                      const todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
                      
                      const endDate = new Date();
                      endDate.setDate(endDate.getDate() + 30);
                      const endStr = endDate.getFullYear() + "-" + String(endDate.getMonth() + 1).padStart(2, '0') + "-" + String(endDate.getDate()).padStart(2, '0');

                      const docId = cleanName.toLowerCase().replace(/\s+/g, "_");
                      const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();
                      
                      const newPerm = {
                        name: cleanName,
                        pin: generatedPin,
                        isActive: true,
                        canLogMaintenance: true,
                        canLogDailyChecks: true,
                        activatedByCrew: guestActivationFlow.sponsorCrewName,
                        activatedByCode: guestActivationFlow.referralCode,
                        accessStartDate: todayStr,
                        accessEndDate: endStr,
                        accessStartHour: "00:00",
                        accessEndHour: "23:59",
                        allowedHorseIds: ["all"],
                        allowedPaddocks: ["all"]
                      };

                      await setDoc(doc(db, "visitor_permissions", docId), newPerm, { merge: true });
                      
                      const { logAuditAction } = await import("../firebase");
                      await logAuditAction(
                        cleanName,
                        "visitor",
                        "modify",
                        `Guest activated account and logged in via referral code ${guestActivationFlow.referralCode} from ${guestActivationFlow.sponsorCrewName}`
                      );

                      onLoginSuccess({
                        name: cleanName,
                        pin: generatedPin,
                        role: "visitor",
                        avatarColor: "bg-pink-500/10 text-pink-800 border-pink-500/20",
                        title: "Pre-Authorized Guest",
                      });

                      setShowManualModal(false);
                      setGuestActivationFlow(null);
                      setGuestNameInput("");
                    } catch (err: any) {
                      console.error("Error activating guest via manual flow:", err);
                      setGuestNameError("Failed to register guest account. Please try again.");
                    } finally {
                      setIsActivatingGuest(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">
                      Enter Your Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="JOHN SMITH"
                      value={guestNameInput}
                      autoFocus
                      onChange={(e) => {
                        setGuestNameInput(e.target.value);
                        setGuestNameError(null);
                      }}
                      className="w-full bg-stone-50 border border-stone-250 rounded-2xl px-4 py-3 text-sm text-center font-bold tracking-wide focus:ring-2 focus:ring-amber-500 focus:outline-hidden uppercase text-stone-900 placeholder-stone-300"
                    />
                  </div>

                  {guestNameError && (
                    <p className="text-[10px] text-rose-600 font-bold uppercase text-center animate-shake bg-rose-50 border border-rose-100 py-1.5 rounded-xl px-2">
                      {guestNameError}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setGuestActivationFlow(null);
                        setGuestNameInput("");
                        setGuestNameError(null);
                      }}
                      className="border border-stone-200/80 text-stone-600 hover:text-stone-900 hover:bg-stone-50 font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={!guestNameInput || isActivatingGuest}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      {isActivatingGuest ? "Registering..." : "Activate & Login"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Standard ID/PIN Manual Entry */
              <div>
                <form onSubmit={handleManualSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">
                      Badge ID or Referral Code
                    </label>
                    <input
                      type="text"
                      placeholder="ENTER BADGE ID OR CODE"
                      value={manualInput}
                      autoFocus
                      onChange={(e) => {
                        setManualInput(e.target.value.toUpperCase());
                        setManualError(null);
                      }}
                      className="w-full bg-stone-50 border border-stone-250 rounded-2xl px-4 py-3 text-sm text-center font-black tracking-widest focus:ring-2 focus:ring-teal-600 focus:outline-hidden uppercase text-stone-900 placeholder-stone-300"
                    />
                  </div>

                  {manualError && (
                    <p className="text-[10px] text-rose-600 font-bold uppercase text-center animate-shake bg-rose-50 border border-rose-100 py-1.5 rounded-xl px-2">
                      {manualError}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowManualModal(false)}
                      className="border border-stone-200/80 text-stone-600 hover:text-stone-900 hover:bg-stone-50 font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!manualInput}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      Confirm ID
                    </button>
                  </div>
                </form>

                <div className="border-t border-stone-150 mt-4 pt-3 flex flex-col items-center gap-1.5">
                  <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider">
                    Are you an Operator?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowManualModal(false);
                      setShowPasskeyModal(true);
                      setPasskeyInput("");
                      setPasskeyError(null);
                    }}
                    className="text-teal-600 hover:text-teal-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:underline"
                  >
                    <Key size={11} /> Use Operator Passkey Sign-In
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Crew Badge Scanner Modal */}
      {isBadgeScannerOpen && (
        <BadgeScanner
          onClose={() => setIsBadgeScannerOpen(false)}
          crewList={visibleCrewProfiles}
          visitorList={visibleVisitorPermissions}
          onScanSuccess={(scannedUser) => {
            onLoginSuccess(scannedUser);
          }}
        />
      )}

      {/* First-Time Crew User PIN Configuration Modal */}
      {showFirstTimePinModal && firstTimeUser && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl p-6 w-full max-w-md animate-scale-up text-left">
            <div className="flex items-center gap-2 border-b border-stone-150 pb-3 mb-4 text-amber-600">
              <Key size={20} className="animate-pulse" />
              <div>
                <h3 className="text-xs font-black tracking-wider text-stone-900 uppercase">
                  First-Time Login: Set Security PIN
                </h3>
                <p className="text-[9px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">
                  Secure your account credentials
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 mb-5">
              <Shield className="text-amber-700 mt-0.5 shrink-0" size={16} />
              <div className="space-y-1">
                <h4 className="font-extrabold text-stone-900 text-xs uppercase tracking-wider">Hello, {firstTimeUser.name}!</h4>
                <p className="text-xxs text-stone-600 leading-relaxed">
                  As an <strong>{firstTimeUser.role}</strong> ({firstTimeUser.title || "Staff Member"}), this is your first time logging in. For complete systems security, you must configure a private <strong>4-digit numeric PIN</strong>. 
                </p>
              </div>
            </div>

            {createdBackupCodes.length > 0 ? (
              <div className="space-y-4">
                <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-teal-800">
                    <Shield className="shrink-0" size={18} />
                    <h4 className="font-extrabold text-xs uppercase tracking-wider">Emergency Backup Codes Generated</h4>
                  </div>
                  <p className="text-xxs text-stone-600 leading-relaxed">
                    Please copy or write down these <strong>4 single-use recovery codes</strong>. If you ever forget your PIN, click <strong>"Forgot Code?"</strong> on the login screen to recover access.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-stone-50 border border-stone-200 p-3 rounded-2xl">
                  {createdBackupCodes.map((code, idx) => (
                    <div key={idx} className="bg-white border border-stone-200 rounded-xl p-2 text-center font-mono font-black text-xs text-stone-900 tracking-wider">
                      {code}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (firstTimeUser) {
                      const updatedUser: SystemUser = {
                        ...firstTimeUser,
                        pin: newCrewPin,
                        hasCustomPin: true,
                      };
                      onLoginSuccess(updatedUser);
                    }
                    setShowFirstTimePinModal(false);
                    setFirstTimeUser(null);
                    setCreatedBackupCodes([]);
                  }}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-black text-xs uppercase tracking-widest py-3 rounded-xl transition-colors cursor-pointer text-center shadow-sm"
                >
                  I Have Saved My Backup Codes & Proceed
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveFirstTimePin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">
                    Choose New 4-Digit PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    placeholder="••••"
                    value={newCrewPin}
                    onChange={(e) => {
                      setNewCrewPin(e.target.value.replace(/\D/g, ""));
                      setCrewPinError(null);
                    }}
                    className="w-full bg-stone-50 border border-stone-250 rounded-2xl px-4 py-3 text-center font-bold text-lg tracking-[0.5em] text-stone-850 focus:ring-2 focus:ring-amber-500 focus:outline-hidden focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest text-center">
                    Confirm New PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    required
                    placeholder="••••"
                    value={newCrewPinConfirm}
                    onChange={(e) => {
                      setNewCrewPinConfirm(e.target.value.replace(/\D/g, ""));
                      setCrewPinError(null);
                    }}
                    className="w-full bg-stone-50 border border-stone-250 rounded-2xl px-4 py-3 text-center font-bold text-lg tracking-[0.5em] text-stone-850 focus:ring-2 focus:ring-amber-500 focus:outline-hidden focus:bg-white"
                  />
                </div>

                {crewPinError && (
                  <div className="text-red-600 text-[10px] font-bold uppercase tracking-wider bg-red-50 p-2.5 rounded-xl border border-red-150 text-center animate-shake">
                    ⚠️ {crewPinError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowFirstTimePinModal(false);
                      setFirstTimeUser(null);
                      setNewCrewPin("");
                      setNewCrewPinConfirm("");
                      setCrewPinError(null);
                    }}
                    className="border border-stone-200/80 text-stone-600 hover:text-stone-900 hover:bg-stone-50 font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer text-center"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={newCrewPin.length !== 4 || newCrewPinConfirm.length !== 4 || isSavingCrewPin}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] py-3 rounded-xl uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isSavingCrewPin ? "Saving..." : "Set PIN & Generate Backup Codes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Change Farm Picture / Logo */}
      {showChangePictureModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 w-full max-w-md shadow-2xl text-left animate-scale-up space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-150">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl border border-teal-200">
                  <Camera size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider">
                    Change Farm Portal Picture
                  </h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">
                    Customize the image displayed above {farmName || "Horse Sense"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePictureModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveFarmPicture} className="space-y-4">
              {/* Picture Preview */}
              <div className="flex items-center justify-center p-4 bg-stone-50 rounded-2xl border border-dashed border-stone-300">
                {newPictureUrl ? (
                  <img
                    src={newPictureUrl}
                    alt="Preview"
                    referrerPolicy="no-referrer"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-teal-500 shadow-md"
                  />
                ) : (
                  <div className="text-center space-y-1 text-stone-400">
                    <Camera size={28} className="mx-auto" />
                    <span className="text-[10px] font-bold block uppercase">No Image Selected</span>
                  </div>
                )}
              </div>

              {/* Upload image file or paste URL */}
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-stone-600 uppercase tracking-wider">
                  Image URL or Direct Link:
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/farm-logo.png"
                  value={newPictureUrl}
                  onChange={(e) => setNewPictureUrl(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl px-3 py-2.5 text-xs font-bold text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />

                <div className="flex items-center justify-between text-[10px] text-stone-500 font-bold pt-1">
                  <span>Or choose a preset style:</span>
                  <div className="flex gap-1.5">
                    {[
                      { label: "Barn", url: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80" },
                      { label: "Horse", url: "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=150&auto=format&fit=crop&q=80" },
                      { label: "Meadow", url: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=150&auto=format&fit=crop&q=80" }
                    ].map((pre) => (
                      <button
                        key={pre.label}
                        type="button"
                        onClick={() => setNewPictureUrl(pre.url)}
                        className="bg-stone-100 hover:bg-teal-50 hover:text-teal-800 text-stone-700 px-2 py-0.5 rounded-lg border border-stone-200 text-[9px] uppercase font-bold cursor-pointer"
                      >
                        {pre.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* File Uploader */}
                <div className="pt-1">
                  <label className="block text-[10px] font-black text-stone-600 uppercase tracking-wider mb-1">
                    Upload from Device:
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (loadEvt) => {
                          if (loadEvt.target?.result) {
                            setNewPictureUrl(loadEvt.target.result as string);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="w-full text-xs text-stone-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border file:border-stone-200 file:text-[10px] file:font-black file:uppercase file:bg-stone-100 file:text-stone-700 hover:file:bg-teal-50 cursor-pointer"
                  />
                </div>
              </div>

              {pictureError && (
                <div className="text-red-600 text-[10px] font-bold uppercase bg-red-50 p-2.5 rounded-xl border border-red-150 text-center">
                  ⚠️ {pictureError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePictureModal(false)}
                  className="border border-stone-200 text-stone-600 hover:text-stone-900 font-bold text-[10px] py-2.5 rounded-xl uppercase tracking-wider transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPicture || !newPictureUrl.trim()}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] py-2.5 rounded-xl uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40"
                >
                  {isSavingPicture ? "Updating..." : "Save Farm Picture"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center space-x-2 text-xxs font-extrabold text-stone-600 uppercase tracking-widest">
        <Shield size={12} className="text-teal-600" />
        <span>Secure Local Station Authentication</span>
      </div>
    </div>
  );
}
