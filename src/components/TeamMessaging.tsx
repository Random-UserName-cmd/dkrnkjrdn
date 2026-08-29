import React, { useState, useEffect, useRef, useMemo } from "react";
import { db } from "../firebase";
import { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { SystemUser } from "../types";
import { USERS } from "./LoginScreen";
import { Send, MessageSquare, Users, Circle, Clock, Hash, Search, Trash } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface TeamMessagingProps {
  currentUser: SystemUser;
}

interface Message {
  id: string;
  sender: string;
  recipient: string;
  text: string;
  timestamp: any;
  threadId: string;
}

interface UserStatus {
  name: string;
  role: string;
  status: string;
  lastActive: string;
  avatarColor: string;
}

export default function TeamMessaging({ currentUser }: TeamMessagingProps) {
  const [activeTab, setActiveTab] = useState<"general" | string>("general"); // "general" or username
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [statuses, setStatuses] = useState<Record<string, UserStatus>>({});
  const [searchUser, setSearchUser] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [crewProfiles, setCrewProfiles] = useState<SystemUser[]>(USERS);
  const [activeMessagingUser, setActiveMessagingUser] = useState<SystemUser>(currentUser);

  // Visitor permissions and custom messaging support
  const [visitorPermissions, setVisitorPermissions] = useState<any[]>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customFirst, setCustomFirst] = useState("");
  const [customLast, setCustomLast] = useState("");
  const [customRecipients, setCustomRecipients] = useState<SystemUser[]>([]);

  // Selected profile details block
  const [selectedProfile, setSelectedProfile] = useState<{
    name: string;
    role: string;
    title?: string;
    bio?: string;
    avatarColor?: string;
    isOnline: boolean;
    statusText: string;
  } | null>(null);

  useEffect(() => {
    setActiveMessagingUser(currentUser);
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === activeMessagingUser.name) {
      setActiveTab("general");
    }
  }, [activeMessagingUser, activeTab]);

  // Fetch real-time visitor permissions
  useEffect(() => {
    const q = query(collection(db, "visitor_permissions"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setVisitorPermissions(list);
    });
    return () => unsubscribe();
  }, []);

  // Fetch real-time profiles
  useEffect(() => {
    const q = query(collection(db, "crew_profiles"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: SystemUser[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as SystemUser);
      });
      if (list.length > 0) {
        setCrewProfiles(list);
      }
    });
    return () => unsubscribe();
  }, []);

  // 1. Fetch real-time statuses of all team members
  useEffect(() => {
    const q = query(collection(db, "user_status"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const statusMap: Record<string, UserStatus> = {};
      snapshot.forEach((doc) => {
        const data = doc.data() as UserStatus;
        statusMap[data.name] = data;
      });
      setStatuses(statusMap);
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch real-time messages for selected thread scoped to farm
  useEffect(() => {
    const curFarm = (currentUser?.farmName || "").toLowerCase().trim();
    const curFarmId = (currentUser?.farmId || curFarm.replace(/[^a-z0-9]+/g, "_")).toLowerCase().trim();
    const isRuabon = !curFarm || curFarm.includes("ruabon") || curFarm.includes("nova herd");

    let threadId = isRuabon ? "general" : `${curFarmId}_general`;
    if (activeTab !== "general") {
      // Create unique alphabetical thread ID for 1-on-1 chats scoped to farm
      const rawChat = [activeMessagingUser.name, activeTab].sort().join("##");
      threadId = isRuabon ? rawChat : `${curFarmId}_${rawChat}`;
    }

    const q = query(
      collection(db, "messages"),
      where("threadId", "==", threadId),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        msgs.push({
          id: doc.id,
          sender: data.sender,
          recipient: data.recipient,
          text: data.text,
          timestamp: data.timestamp,
          threadId: data.threadId,
        });
      });
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [activeTab, activeMessagingUser.name, currentUser]);

  // Handle message sending
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const curFarm = (currentUser?.farmName || "").toLowerCase().trim();
    const curFarmId = (currentUser?.farmId || curFarm.replace(/[^a-z0-9]+/g, "_")).toLowerCase().trim();
    const isRuabon = !curFarm || curFarm.includes("ruabon") || curFarm.includes("nova herd");

    let threadId = isRuabon ? "general" : `${curFarmId}_general`;
    let recipient = "general";
    if (activeTab !== "general") {
      recipient = activeTab;
      const rawChat = [activeMessagingUser.name, activeTab].sort().join("##");
      threadId = isRuabon ? rawChat : `${curFarmId}_${rawChat}`;
    }

    const msgData = {
      sender: activeMessagingUser.name,
      recipient,
      text: inputText,
      threadId,
      farmName: currentUser.farmName || "Ruabon Farm & Herd Center",
      farmId: currentUser.farmId || curFarmId,
      timestamp: serverTimestamp() || new Date().toISOString(),
    };

    setInputText("");

    try {
      await addDoc(collection(db, "messages"), msgData);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!msgId) return;
    try {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      await deleteDoc(doc(db, "messages", msgId));
    } catch (err) {
      console.error("Failed to delete message:", err);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    }
  };

  const canDeleteMessage = (msg: Message) => {
    const activeName = activeMessagingUser?.name || currentUser.name;
    const activeRole = activeMessagingUser?.role || currentUser.role;
    const myRole = currentUser.role;

    if (myRole === "owner" || activeRole === "owner" || myRole === "admin" || activeRole === "admin") {
      return true;
    }

    if (msg.sender === currentUser.name || msg.sender === activeName) {
      return true;
    }

    return true;
  };

  // Helper to determine if a user is online (active in last 3 minutes)
  const getUserStatusInfo = (username: string) => {
    const userStat = statuses[username];
    if (!userStat) return { isOnline: false, text: "Offline" };

    const lastActiveDate = new Date(userStat.lastActive);
    const now = new Date();
    const diffMs = now.getTime() - lastActiveDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 3) {
      return { isOnline: true, text: "Online" };
    } else if (diffMins < 60) {
      return { isOnline: false, text: `${diffMins}m ago` };
    } else if (diffMins < 1440) {
      return { isOnline: false, text: `${Math.floor(diffMins / 60)}h ago` };
    } else {
      return { isOnline: false, text: "Offline" };
    }
  };

  const handleOpenProfile = (username: string) => {
    // Look up in crewProfiles
    const userObj = crewProfiles.find(u => u.name.toLowerCase() === username.toLowerCase());
    const statInfo = getUserStatusInfo(username);
    
    // Look up in visitorPermissions
    const visObj = visitorPermissions?.find((p: any) => p.name.toLowerCase() === username.toLowerCase());

    const name = userObj?.name || visObj?.name || username;
    const role = userObj?.role || visObj?.role || (visObj?.isAgistorRider ? "agistor" : "visitor");
    const title = userObj?.title || (visObj?.isAgistorRider ? "Agistor / Rider" : "Pre-Authorized Guest");
    const bio = userObj?.bio || (visObj as any)?.bio || "Registered member of the Wright Farm community network.";
    const avatarColor = userObj?.avatarColor || "bg-pink-100 text-pink-800 border-pink-200";

    setSelectedProfile({
      name,
      role,
      title,
      bio,
      avatarColor,
      isOnline: statInfo.isOnline,
      statusText: statInfo.text
    });
  };

  const handleAddCustomRecipient = (e: React.FormEvent) => {
    e.preventDefault();
    const fullName = `${customFirst.trim()} ${customLast.trim()}`;
    if (!fullName.trim() || fullName.trim() === " ") return;

    // Check existing
    const existsInCrew = crewProfiles.some(u => u.name.toLowerCase() === fullName.toLowerCase());
    const existsInCustom = customRecipients.some(u => u.name.toLowerCase() === fullName.toLowerCase());
    
    if (existsInCrew || existsInCustom) {
      setActiveTab(fullName);
      setShowCustomModal(false);
      setCustomFirst("");
      setCustomLast("");
      return;
    }

    // Check visitor permissions list
    const matchedVis = visitorPermissions.find(p => p.name.toLowerCase() === fullName.toLowerCase());

    const newRecipient: SystemUser = {
      name: fullName,
      role: "visitor",
      isAgistorRider: matchedVis?.isAgistorRider || false,
      title: matchedVis?.isAgistorRider ? "Agistor / Rider" : "Farm Visitor",
      avatarColor: matchedVis?.isAgistorRider ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-pink-100 text-pink-800 border-pink-200",
      pin: matchedVis?.pin || "",
      bio: (matchedVis as any)?.bio || `Registered Ruabon Farm visitor/agistor.`,
      email: ""
    };

    setCustomRecipients(prev => [...prev, newRecipient]);
    setActiveTab(fullName);
    setShowCustomModal(false);
    setCustomFirst("");
    setCustomLast("");
  };

  const visibleCrewProfiles = useMemo(() => {
    const curFarm = (currentUser?.farmName || "").toLowerCase().trim();
    const curFarmId = (currentUser?.farmId || curFarm.replace(/[^a-z0-9]+/g, "_")).toLowerCase().trim();
    const isRuabon = !curFarm || curFarm.includes("ruabon") || curFarm.includes("nova herd");

    return crewProfiles.filter(u => {
      const uFarm = (u.farmName || "").toLowerCase().trim();
      const uFarmId = (u.farmId || "").toLowerCase().trim();
      const userIsExplicitlyThisFarm = (uFarm && uFarm === curFarm) || (uFarmId && uFarmId === curFarmId);

      if (u.name.toLowerCase() === "system administrator" || u.name.toLowerCase() === "cooper wright") {
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

  const filteredUsers = visibleCrewProfiles.filter(
    (u) =>
      u.name !== activeMessagingUser.name &&
      u.name.toLowerCase().includes(searchUser.toLowerCase())
  );

  const combinedUsers = [
    ...filteredUsers,
    ...customRecipients.filter(r => r.name.toLowerCase().includes(searchUser.toLowerCase()))
  ];

  return (
    <div className="bg-white border-t border-b md:border md:rounded-2xl border-stone-200 shadow-2xs grid grid-cols-1 md:grid-cols-4 h-[calc(100vh-140px)] min-h-[500px] overflow-hidden w-full" id="team-messaging-container">
      {/* Left sidebar - users & threads */}
      <div className="border-r border-stone-200 flex flex-col h-full bg-stone-50/30 max-h-[250px] md:max-h-none overflow-y-auto">
        <div className="p-4 border-b border-stone-200 space-y-3">
          {currentUser.role === "owner" && (
            <div className="bg-orange-50/75 border border-orange-200/70 rounded-2xl p-3 mb-2 space-y-1.5 shadow-3xs text-left">
              <span className="block text-[9px] font-black uppercase text-orange-700 tracking-wider">
                Owner Profile Selector
              </span>
              <select
                value={activeMessagingUser.name}
                onChange={(e) => {
                  const selected = visibleCrewProfiles.find(u => u.name === e.target.value);
                  if (selected) {
                    setActiveMessagingUser(selected);
                    setActiveTab("general");
                  }
                }}
                className="w-full bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-stone-850 focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
              >
                {visibleCrewProfiles.map(u => (
                  <option key={u.name} value={u.name}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          )}
          <h3 className="font-black text-stone-900 text-xs uppercase tracking-wider flex items-center gap-2">
            <MessageSquare size={16} className="text-teal-600" />
            Farm Channels
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-stone-400" size={14} />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
              className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-teal-600 focus:outline-hidden font-medium"
            />
          </div>
        </div>

        {/* Directory / Users List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* General channel */}
          <button
            onClick={() => setActiveTab("general")}
            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
              activeTab === "general"
                ? "bg-teal-600 text-white font-bold shadow-xs"
                : "text-stone-700 hover:bg-stone-100"
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border uppercase ${
                activeTab === "general" ? "bg-teal-700/50 border-teal-500/30" : "bg-stone-100 border-stone-200"
              }`}>
                <Hash size={14} />
              </div>
              <div>
                <span className="block font-bold"># General Farm Chat</span>
                <span className={`text-[10px] block ${activeTab === "general" ? "text-teal-100" : "text-stone-400"}`}>
                  All crew members
                </span>
              </div>
            </div>
          </button>

          <div className="pt-3 pb-1 px-2.5 flex items-center justify-between select-none">
            <span className="text-[9px] font-black text-stone-400 uppercase tracking-wider">Direct Messages</span>
            <button
              type="button"
              onClick={() => setShowCustomModal(true)}
              className="text-[9px] font-bold text-teal-600 hover:text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-3xs"
            >
              + Custom
            </button>
          </div>

          {combinedUsers.map((user) => {
            const isActive = activeTab === user.name;
            const statusInfo = getUserStatusInfo(user.name);
            const userInitials = user.name
              .split(" ")
              .map((n) => n[0])
              .join("");

            return (
              <button
                key={user.name}
                onClick={() => setActiveTab(user.name)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                  isActive
                    ? "bg-teal-600 text-white font-bold shadow-xs"
                    : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div className="relative">
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenProfile(user.name);
                      }}
                      title="View Profile"
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border uppercase cursor-pointer hover:scale-105 transition-all ${
                        isActive ? "bg-teal-700/50 border-teal-500/30 text-white" : user.avatarColor || "bg-stone-100 border-stone-200"
                      }`}
                    >
                      {userInitials}
                    </div>
                    {/* Real-time status dot */}
                    <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white flex items-center justify-center ${
                      statusInfo.isOnline ? "bg-emerald-500 animate-pulse" : "bg-stone-400"
                    }`} />
                  </div>
                  <div>
                    <span className="block font-bold">{user.name}</span>
                    <span className={`text-[10px] block truncate max-w-[120px] ${isActive ? "text-teal-100" : "text-stone-400"}`}>
                      {user.title || user.role}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                    isActive 
                      ? "bg-teal-700/40 text-teal-100" 
                      : statusInfo.isOnline 
                      ? "bg-emerald-50 text-emerald-800" 
                      : "bg-stone-100 text-stone-500"
                  }`}>
                    {statusInfo.text}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right chat panel */}
      <div className="col-span-1 md:col-span-3 flex flex-col h-full min-h-[350px] overflow-hidden bg-stone-50/15">
        {/* Chat header */}
        <div className="p-4 border-b border-stone-200 bg-white flex items-center justify-between shadow-2xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-800 border border-teal-100 flex items-center justify-center font-bold text-sm">
              {activeTab === "general" ? <Hash size={18} /> : activeTab.split(" ").map(n => n[0]).join("")}
            </div>
            <div>
              <h4 
                onClick={() => activeTab !== "general" && handleOpenProfile(activeTab)}
                className={`font-bold text-stone-900 text-sm ${activeTab !== "general" ? "cursor-pointer hover:underline hover:text-teal-700" : ""}`}
                title={activeTab !== "general" ? "Click to view profile card" : undefined}
              >
                {activeTab === "general" ? "General Farm Broadcast" : activeTab}
              </h4>
              <p className="text-[10px] text-stone-500 font-medium uppercase tracking-wider">
                {activeTab === "general"
                  ? "Group Chat • All Employees"
                  : `Secure 1-on-1 Chat thread with ${activeTab}`}
              </p>
              {activeMessagingUser.name !== currentUser.name && (
                <span className="inline-block bg-orange-50 border border-orange-200 text-orange-700 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider mt-1 animate-pulse">
                  Viewing as {activeMessagingUser.name}
                </span>
              )}
            </div>
          </div>
          {activeTab !== "general" && (
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${getUserStatusInfo(activeTab).isOnline ? "bg-emerald-500 animate-pulse" : "bg-stone-400"}`} />
              <span className="text-[11px] font-bold text-stone-500 uppercase">
                {getUserStatusInfo(activeTab).text}
              </span>
            </div>
          )}
        </div>

        {/* Message body list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-stone-400">
              <MessageSquare size={36} className="text-stone-300 mb-2" />
              <p className="text-sm font-semibold">No messages in this channel yet.</p>
              <p className="text-xxs mt-1">Type below to start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender === activeMessagingUser.name;
              const formattedTime = msg.timestamp
                ? new Date(msg.timestamp.seconds ? msg.timestamp.seconds * 1000 : msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Sending...";

              // Helper to detect sender role and apply custom message color schemes
              const getSenderRole = (senderName: string): string => {
                const userObj = crewProfiles.find(u => u.name.toLowerCase() === senderName.toLowerCase());
                if (userObj) return userObj.role;
                const stat = statuses[senderName];
                if (stat) return stat.role;
                return "user";
              };

              const senderRole = getSenderRole(msg.sender);
              let textStyle = "text-stone-900 font-medium";
              let bubbleBg = "bg-white border border-stone-200 shadow-sm";

              if (senderRole === "owner") {
                bubbleBg = "bg-orange-100 border border-orange-300";
                textStyle = "text-red-600 font-extrabold uppercase tracking-wider";
              } else if (senderRole === "admin") {
                bubbleBg = "bg-white border border-stone-200 shadow-sm";
                textStyle = "text-orange-500 font-bold";
              } else {
                bubbleBg = "bg-white border border-stone-200 shadow-sm";
                textStyle = "text-stone-900 font-medium";
              }

              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"} items-end space-x-2 group`}
                >
                  {!isMine && (
                    <div 
                      onClick={() => handleOpenProfile(msg.sender)}
                      title={`View ${msg.sender}'s profile`}
                      className="w-7 h-7 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-[10px] border border-stone-200 uppercase cursor-pointer hover:bg-stone-200 hover:scale-105 transition-all"
                    >
                      {msg.sender.split(" ").map((n) => n[0]).join("")}
                    </div>
                  )}
                  <div className={`max-w-[70%] rounded-2xl p-3 shadow-3xs ${bubbleBg} ${isMine ? "rounded-br-none" : "rounded-bl-none"} ${isMine ? "border-teal-500/50" : ""}`}>
                    {!isMine && (
                      <span 
                        onClick={() => handleOpenProfile(msg.sender)}
                        title={`View ${msg.sender}'s profile`}
                        className="block text-[9px] font-black uppercase text-teal-600 mb-1 tracking-widest cursor-pointer hover:underline hover:text-teal-700"
                      >
                        {msg.sender} <span className="text-[7px] text-stone-400 font-normal ml-1">({senderRole})</span>
                      </span>
                    )}
                    <p className={`text-xs leading-relaxed whitespace-pre-wrap ${textStyle}`}>{msg.text}</p>
                    
                    <div className="flex items-center justify-between gap-4 mt-1.5 min-w-[100px]">
                      {canDeleteMessage(msg) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMessage(msg.id);
                          }}
                          className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                          title="Delete message"
                        >
                          <Trash size={12} />
                          <span className="text-[9px] uppercase font-extrabold tracking-wider">Delete</span>
                        </button>
                      ) : (
                        <div />
                      )}
                      <span className="block text-[9px] font-bold text-stone-400 select-none">
                        {formattedTime}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input bar */}
        <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-stone-200 flex items-center gap-2">
          <input
            type="text"
            placeholder={activeTab === "general" ? "Message #general..." : `Message ${activeTab}...`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
          />
          <button
            type="submit"
            className="bg-teal-600 hover:bg-teal-700 text-white p-2.5 rounded-xl cursor-pointer transition-all shrink-0 shadow-xs flex items-center justify-center"
          >
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* 1. Custom Messaging recipient modal */}
      <AnimatePresence>
        {showCustomModal && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-stone-200 shadow-xl max-w-sm w-full p-6 space-y-4 text-left"
            >
              <div>
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-widest">Custom Chat Recipient</h3>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1">
                  Enter first and last name to start messaging any visitor or agistor.
                </p>
              </div>
              <form onSubmit={handleAddCustomRecipient} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-stone-500 tracking-wider">First Name</label>
                  <input
                    type="text"
                    required
                    value={customFirst}
                    onChange={(e) => setCustomFirst(e.target.value)}
                    placeholder="e.g., John"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-stone-500 tracking-wider">Last Name</label>
                  <input
                    type="text"
                    required
                    value={customLast}
                    onChange={(e) => setCustomLast(e.target.value)}
                    placeholder="e.g., Doe"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-950"
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomModal(false);
                      setCustomFirst("");
                      setCustomLast("");
                    }}
                    className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold text-xxs py-2.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xxs py-2.5 rounded-xl uppercase tracking-wider transition-all cursor-pointer shadow-3xs"
                  >
                    Open Chat
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. User Profile Details Modal */}
      <AnimatePresence>
        {selectedProfile && (
          <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl border border-stone-200 shadow-xl max-w-sm w-full overflow-hidden text-left"
            >
              {/* Header section with avatar */}
              <div className="bg-stone-50 p-6 border-b border-stone-100 flex flex-col items-center text-center space-y-3">
                <div className="relative">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-xl border shadow-xs uppercase ${selectedProfile.avatarColor}`}>
                    {selectedProfile.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <span className={`absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full border-3 border-white ${
                    selectedProfile.isOnline ? "bg-emerald-500 animate-pulse" : "bg-stone-400"
                  }`} />
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-base">{selectedProfile.name}</h3>
                  <span className="inline-block bg-teal-50 border border-teal-200 text-teal-800 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest mt-1">
                    {selectedProfile.title || selectedProfile.role}
                  </span>
                </div>
              </div>

              {/* Bio & status info */}
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-center bg-stone-50/70 border border-stone-200/50 rounded-2xl p-3">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider">Network Status</span>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    selectedProfile.isOnline 
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200/50 animate-pulse" 
                      : "bg-stone-100 text-stone-500 border border-stone-200/30"
                  }`}>
                    {selectedProfile.statusText}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-[9px] font-black uppercase text-stone-400 tracking-widest">Biography / About</h4>
                  <p className="text-xs text-stone-700 leading-relaxed bg-stone-50/40 p-3 rounded-2xl border border-stone-150 font-medium italic">
                    "{selectedProfile.bio}"
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedProfile(null)}
                  className="w-full bg-stone-900 hover:bg-stone-850 text-white font-bold text-xxs py-3 rounded-xl uppercase tracking-widest transition-all cursor-pointer shadow-sm text-center"
                >
                  Close Profile
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
