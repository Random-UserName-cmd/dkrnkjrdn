import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { SystemUser } from "../types";
import { Key, ShieldAlert, RefreshCw, Trash2, Copy, Check, Sparkles } from "lucide-react";

interface PasskeyData {
  id: string;
  username: string;
  passkey: string;
  createdAt: string;
}

export default function CooperPasskeyManager() {
  const [activePasskeys, setActivePasskeys] = useState<Record<string, PasskeyData>>({});
  const [copiedUser, setCopiedUser] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [crewProfiles, setCrewProfiles] = useState<SystemUser[]>([]);

  // Subscribe to crew profiles
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "crew_profiles"), (snapshot) => {
      const list: SystemUser[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as SystemUser);
      });
      setCrewProfiles(list);
    });
    return () => unsub();
  }, []);

  // Subscribe to real-time passkeys
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "cooper_passkeys"), (snapshot) => {
      const keysMap: Record<string, PasskeyData> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        keysMap[docSnap.id] = {
          id: docSnap.id,
          username: data.username,
          passkey: data.passkey,
          createdAt: data.createdAt,
        };
      });
      setActivePasskeys(keysMap);
    }, (err) => {
      console.warn("Passkeys subscription warning:", err);
    });

    return () => unsub();
  }, []);

  const [visitorAccessEnabled, setVisitorAccessEnabled] = useState(false);

  // Subscribe to real-time visitor terminal setting
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

  const handleToggleVisitorAccess = async () => {
    try {
      await setDoc(doc(db, "config", "visitor_access"), {
        enabled: !visitorAccessEnabled,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Failed to update visitor access config:", err);
    }
  };

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
    } catch (err) {
      console.error("Error generating passkey in Firestore:", err);
    } finally {
      setIsGenerating(null);
    }
  };

  const handleRevokePasskey = async (username: string) => {
    try {
      await deleteDoc(doc(db, "cooper_passkeys", username));
    } catch (err) {
      console.error("Error revoking passkey in Firestore:", err);
    }
  };

  const copyToClipboard = (text: string, username: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUser(username);
    setTimeout(() => setCopiedUser(null), 2000);
  };

  // Filter out owner/admin himself from the switcher list
  const otherUsers = crewProfiles.filter(u => u.name !== "System Administrator" && u.role !== "owner");

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-xs p-6" id="cooper-passkey-manager">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl">
            <Key size={20} />
          </div>
          <div>
            <h2 className="text-base font-black uppercase tracking-wide text-stone-900">Crew Account Switcher &amp; Passkeys</h2>
            <p className="text-xxs font-semibold text-stone-500 uppercase tracking-wider mt-0.5">
              Generate 10-Character Passkeys for instant operator login bypass
            </p>
          </div>
        </div>
        <span className="text-[10px] bg-teal-50 border border-teal-200/60 px-3 py-1 rounded-full text-teal-800 font-extrabold uppercase tracking-wider flex items-center gap-1">
          <Sparkles size={11} className="animate-spin text-teal-600" /> Owner Controls
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* User list table */}
        <div className="space-y-3.5">
          <h3 className="text-xs font-black text-stone-700 uppercase tracking-wider mb-2.5">
            Active Crew Directory ({otherUsers.length})
          </h3>
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            {otherUsers.map((user) => {
              const activeKey = activePasskeys[user.name];
              return (
                <div 
                  key={user.name} 
                  className="flex items-center justify-between p-3 bg-stone-50/50 border border-stone-200/75 rounded-2xl transition-all hover:bg-stone-50"
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border uppercase ${user.avatarColor}`}>
                      {user.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <strong className="block text-xs font-bold text-stone-900 leading-tight">{user.name}</strong>
                      <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider block mt-0.5">
                        {user.title || user.role}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeKey ? (
                      <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl pl-3 pr-2 py-1">
                        <span className="font-mono text-xs font-black tracking-widest text-emerald-900">
                          {activeKey.passkey}
                        </span>
                        <button
                          onClick={() => copyToClipboard(activeKey.passkey, user.name)}
                          className="p-1 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                          title="Copy Passkey"
                        >
                          {copiedUser === user.name ? <Check size={12} strokeWidth={3} /> : <Copy size={12} />}
                        </button>
                        <button
                          onClick={() => handleRevokePasskey(user.name)}
                          className="p-1 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                          title="Revoke Passkey"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGeneratePasskey(user.name)}
                        disabled={isGenerating === user.name}
                        className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] px-3.5 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-3xs hover:scale-102 active:scale-98 disabled:opacity-40"
                      >
                        <RefreshCw size={11} className={isGenerating === user.name ? "animate-spin" : ""} />
                        <span>Generate Passkey</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Informational banner / quick setup guides */}
        <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-5 flex flex-col justify-between">
          <div className="space-y-3.5">
            {/* Visitor/Guest Access Toggle Card */}
            <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-3xs">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-xs font-black text-stone-900 uppercase tracking-wide">Public Visitor Access</h4>
                  <p className="text-[10px] text-stone-500 font-semibold uppercase mt-0.5">Toggle guest terminal link on login screen</p>
                </div>
                <button
                  onClick={handleToggleVisitorAccess}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                    visitorAccessEnabled ? "bg-teal-600" : "bg-stone-300"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 left-1 transition-transform ${
                      visitorAccessEnabled ? "translate-x-6" : ""
                    }`}
                  />
                </button>
              </div>
              <div className="text-[10px] text-stone-500 font-medium leading-relaxed">
                {visitorAccessEnabled ? (
                  <span className="text-teal-700 font-bold">Enabled:</span>
                ) : (
                  <span className="text-stone-500 font-bold">Disabled:</span>
                )}{" "}
                Visitors can log in with one tap (no password required) to scan physical marking certificates and view basic horse identity metadata (Name, Colour, Age).
              </div>
            </div>

            <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-1.5 pt-2">
              <ShieldAlert size={14} className="text-teal-600" /> Security &amp; Bypass Protocol
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed font-medium">
              This system replaces standard master bypass PINs. As the Owner, the Primary Administrator can generate dedicated ten-character <strong>Passkeys</strong> to immediately bypass security for any crew profile.
            </p>
            <ul className="text-xxs font-semibold uppercase text-stone-500 space-y-2.5 tracking-wider mt-2 list-none pl-0">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-teal-600 rounded-full mt-1 shrink-0"></span>
                <span>Click "Generate Passkey" next to any crew member</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-teal-600 rounded-full mt-1 shrink-0"></span>
                <span>The generated code is stored securely in Firestore in real-time</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 bg-teal-600 rounded-full mt-1 shrink-0"></span>
                <span>Enter that passkey down at the bottom of the Login Screen to instantly access that person's account</span>
              </li>
            </ul>
          </div>

          <div className="p-3 bg-teal-50 border border-teal-150 rounded-xl text-[10px] text-teal-800 font-bold uppercase tracking-wider flex items-center gap-2 mt-4">
            <Key size={13} className="text-teal-600 animate-bounce" />
            <span>Active passkeys are immediately revoked upon browser session refresh or explicit deletion.</span>
          </div>
        </div>

      </div>
    </div>
  );
}
