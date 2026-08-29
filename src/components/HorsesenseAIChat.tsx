import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Send, X, ArrowLeft, Loader2, Bot, HelpCircle, History, Plus, Trash2, MessageSquare, ShieldAlert, Check, Ban, Settings } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Horse, MaintenanceLog, SystemUser } from "../types";
import { db, logAuditAction } from "../firebase";
import { doc, setDoc, deleteDoc, collection, getDocs, query, where } from "firebase/firestore";
import HorseSenseLogo from "./HorseSenseLogo";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  timestamp: Date;
  imageUrl?: string;
  pendingAction?: {
    name: string;
    args: any;
    status: "pending" | "approved" | "rejected";
  };
}

interface ChatSession {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  messages: {
    id: string;
    role: "user" | "ai";
    text: string;
    timestamp: string;
    imageUrl?: string;
    pendingAction?: {
      name: string;
      args: any;
      status: "pending" | "approved" | "rejected";
    };
  }[];
}

interface HorsesenseAIChatProps {
  currentUser: SystemUser | null;
  horses: Horse[];
  logs?: MaintenanceLog[];
  todayStr: string;
  visitorScannedHistory?: any[];
  onOpenAISettings?: () => void;
}

export default function HorsesenseAIChat({ 
  currentUser, 
  horses, 
  logs = [], 
  todayStr, 
  visitorScannedHistory = [],
  onOpenAISettings
}: HorsesenseAIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Previous Chats State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const role = currentUser?.role || "visitor";
  const userName = currentUser?.name || "Visitor";
  const userId = `${userName}_${role}`;

  // Load chat sessions on widget open
  const loadSessions = async () => {
    try {
      const localKey = `horsesense_ai_sessions_${userId}`;
      const localSessions = JSON.parse(localStorage.getItem(localKey) || "[]") as ChatSession[];
      
      if (navigator.onLine) {
        const q = query(
          collection(db, "horsesense_ai_chats"),
          where("userId", "==", userId)
        );
        const snap = await getDocs(q);
        const firestoreSessions: ChatSession[] = [];
        snap.forEach(d => {
          const s = d.data() as ChatSession;
          firestoreSessions.push(s);
        });
        
        // Sort sessions by creation time descending
        firestoreSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        setSessions(firestoreSessions);
        localStorage.setItem(localKey, JSON.stringify(firestoreSessions));
      } else {
        localSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setSessions(localSessions);
      }
    } catch (err) {
      console.warn("Failed to load sessions, using local fallback:", err);
      const localKey = `horsesense_ai_sessions_${userId}`;
      const localSessions = JSON.parse(localStorage.getItem(localKey) || "[]") as ChatSession[];
      localSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSessions(localSessions);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen, userId]);



  // Setup/Reset default welcome message when no current session exists
  useEffect(() => {
    if (!currentSessionId) {
      let welcomeText = `Hello ${userName}! I am Nova Herd AI, your digital Ruabon Farm intelligence assistant. How can I help you today?`;
      if (role === "visitor") {
        welcomeText += " As a registered visitor, you can ask me basic questions about the horses' breed, age, and paddock locations. Confidential veterinary, farrier, and financial files are restricted.";
      } else if (role === "user") {
        welcomeText += " As a staff member, you can ask me about paddock groups, daily checks, and upcoming scheduling dates. Financial records are administrative only.";
      } else {
        welcomeText += " As an administrator, you have full security clearance. You can ask me to calculate monthly expenses, audit logs, analyze farrier ledger items, or list herd statistics.";
      }

      setMessages([
        {
          id: "welcome",
          role: "ai",
          text: welcomeText,
          timestamp: new Date()
        }
      ]);
    }
  }, [role, userName, currentSessionId]);

  // Scroll messages container to bottom on new messages without scrolling outer page
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Start new empty chat session
  const startNewChat = () => {
    setCurrentSessionId(null);
    let welcomeText = `Hello ${userName}! I am Nova Herd AI, your digital Ruabon Farm intelligence assistant. How can I help you today?`;
    if (role === "visitor") {
      welcomeText += " As a registered visitor, you can ask me basic questions about the horses' breed, age, and paddock locations. Confidential veterinary, farrier, and financial files are restricted.";
    } else if (role === "user") {
      welcomeText += " As a staff member, you can ask me about paddock groups, daily checks, and upcoming scheduling dates. Financial records are administrative only.";
    } else {
      welcomeText += " As an administrator, you have full security clearance. You can ask me to calculate monthly expenses, audit logs, analyze farrier ledger items, or list herd statistics.";
    }

    setMessages([
      {
        id: "welcome",
        role: "ai",
        text: welcomeText,
        timestamp: new Date()
      }
    ]);
    setIsHistoryOpen(false);
  };

  // Load an existing chat session from history
  const selectSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    const parsedMessages = session.messages.map(m => ({
      id: m.id,
      role: m.role as "user" | "ai",
      text: m.text,
      timestamp: new Date(m.timestamp),
      imageUrl: m.imageUrl,
      pendingAction: m.pendingAction
    }));
    setMessages(parsedMessages);
    setIsHistoryOpen(false);
  };

  // Delete chat session
  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const localKey = `horsesense_ai_sessions_${userId}`;
      const filtered = sessions.filter(s => s.id !== sessionId);
      setSessions(filtered);
      localStorage.setItem(localKey, JSON.stringify(filtered));

      if (navigator.onLine) {
        await deleteDoc(doc(db, "horsesense_ai_chats", sessionId));
      }

      if (currentSessionId === sessionId) {
        startNewChat();
      }
    } catch (err) {
      console.error("Error deleting session:", err);
    }
  };

  // Save or update active session
  const saveSession = async (newMessages: ChatMessage[]) => {
    let sessionId = currentSessionId;
    let sessionTitle = "";
    const isNew = !sessionId;

    if (!sessionId) {
      sessionId = Math.random().toString(36).substr(2, 9);
      setCurrentSessionId(sessionId);
      
      const firstUserMsg = newMessages.find(m => m.role === "user");
      sessionTitle = firstUserMsg 
        ? (firstUserMsg.text.length > 35 ? firstUserMsg.text.substring(0, 35) + "..." : firstUserMsg.text)
        : `Chat Archive (${new Date().toLocaleDateString()})`;
    } else {
      const existing = sessions.find(s => s.id === sessionId);
      sessionTitle = existing ? existing.title : `Chat Archive (${new Date().toLocaleDateString()})`;
    }

    const payload: ChatSession = {
      id: sessionId,
      userId,
      title: sessionTitle,
      createdAt: isNew ? new Date().toISOString() : (sessions.find(s => s.id === sessionId)?.createdAt || new Date().toISOString()),
      messages: newMessages.map(m => ({
        id: m.id,
        role: m.role,
        text: m.text,
        timestamp: m.timestamp.toISOString(),
        imageUrl: m.imageUrl,
        pendingAction: m.pendingAction
      }))
    };

    const updatedSessions = isNew 
      ? [payload, ...sessions]
      : sessions.map(s => s.id === sessionId ? payload : s);

    setSessions(updatedSessions);
    localStorage.setItem(`horsesense_ai_sessions_${userId}`, JSON.stringify(updatedSessions));

    if (navigator.onLine) {
      try {
        await setDoc(doc(db, "horsesense_ai_chats", sessionId), payload);
      } catch (err) {
        console.warn("Could not save session to database:", err);
      }
    }
  };

  // Approve administrative security action
  const handleApproveAction = async (msgId: string, actionName: string, args: any) => {
    setIsLoading(true);
    let finalAiText = "";
    try {
      if (actionName === "banIp") {
        const { ip, scope, bannedProfiles, durationHours } = args;
        const cleanIp = ip.toLowerCase().trim();
        const payload: any = {
          scope: scope || "all",
          bannedProfiles: bannedProfiles || [],
          timestamp: new Date().toISOString()
        };
        if (durationHours && typeof durationHours === "number") {
          const expires = new Date();
          expires.setHours(expires.getHours() + durationHours);
          payload.expiresAt = expires.toISOString();
        }
        await setDoc(doc(db, "banned_ips", cleanIp), payload);
        await logAuditAction(currentUser?.name || "AI Moderator (Cooper)", "owner", "modify", `AI Banned IP (Approved): ${cleanIp} (scope: ${scope}${durationHours ? `, duration: ${durationHours}h` : ""})`);
        finalAiText = `[AI MODERATION EVENT]: Successfully authorized and banned IP address **${cleanIp}** with **${scope}** scope${durationHours ? ` for **${durationHours}** hours` : " permanently"}.`;
      } else if (actionName === "unbanIp") {
        const { ip } = args;
        const cleanIp = ip.toLowerCase().trim();
        await deleteDoc(doc(db, "banned_ips", cleanIp));
        await logAuditAction(currentUser?.name || "AI Moderator (Cooper)", "owner", "modify", `AI Unbanned IP (Approved): ${cleanIp}`);
        finalAiText = `[AI MODERATION EVENT]: Authorized unban of IP **${cleanIp}** completed successfully.`;
      } else if (actionName === "banName") {
        const { name: banTargetName, durationHours } = args;
        const cleanName = banTargetName.trim();
        const payload: any = {
          name: cleanName,
          timestamp: new Date().toISOString()
        };
        if (durationHours && typeof durationHours === "number") {
          const expires = new Date();
          expires.setHours(expires.getHours() + durationHours);
          payload.expiresAt = expires.toISOString();
        }
        await setDoc(doc(db, "banned_names", cleanName), payload);
        await logAuditAction(currentUser?.name || "AI Moderator (Cooper)", "owner", "modify", `AI Banned Guest Name (Approved): ${cleanName}`);
        finalAiText = `[AI MODERATION EVENT]: Guest profile name **"${cleanName}"** is now banned from the visitor lobby.`;
      } else if (actionName === "unbanName") {
        const { name: banTargetName } = args;
        const cleanName = banTargetName.trim();
        await deleteDoc(doc(db, "banned_names", cleanName));
        await logAuditAction(currentUser?.name || "AI Moderator (Cooper)", "owner", "modify", `AI Unbanned Guest Name (Approved): ${cleanName}`);
        finalAiText = `[AI MODERATION EVENT]: Guest name **"${cleanName}"** has been cleared for visitor authentication.`;
      } else if (actionName === "viewReports") {
        const ipsSnap = await getDocs(collection(db, "banned_ips"));
        const namesSnap = await getDocs(collection(db, "banned_names"));
        
        const activeIps: string[] = [];
        ipsSnap.forEach(d => {
          const exp = d.data().expiresAt ? ` (Expires: ${new Date(d.data().expiresAt).toLocaleString()})` : "";
          activeIps.push(`- ${d.id} [Scope: ${d.data().scope || "all"}]${exp}`);
        });

        const activeNames: string[] = [];
        namesSnap.forEach(d => {
          const exp = d.data().expiresAt ? ` (Expires: ${new Date(d.data().expiresAt).toLocaleString()})` : "";
          activeNames.push(`- ${d.id}${exp}`);
        });

        finalAiText = `**Authorized Ruabon Security Report:**\n\n**Active Firewall Banned IPs (${activeIps.length}):**\n${activeIps.length > 0 ? activeIps.join("\n") : "_None registered_"}\n\n**Banned Visitor Names (${activeNames.length}):**\n${activeNames.length > 0 ? activeNames.join("\n") : "_None registered_"}`;
      }

      // Update message status in state
      const updatedMessages = messages.map(m => {
        if (m.id === msgId) {
          return {
            ...m,
            text: finalAiText,
            pendingAction: {
              ...m.pendingAction!,
              status: "approved" as const
            }
          };
        }
        return m;
      });

      setMessages(updatedMessages);
      saveSession(updatedMessages);
    } catch (err: any) {
      console.error("Approval error:", err);
      alert(`Authorization failed: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Reject administrative security action
  const handleRejectAction = (msgId: string) => {
    const updatedMessages = messages.map(m => {
      if (m.id === msgId) {
        const actionName = m.pendingAction?.name || "Administrative Action";
        const text = `[AUTHORIZATION REJECTED]: The security command execution for "${actionName}" was explicitly declined by the system owner. No system or firewall changes were applied.`;

        return {
          ...m,
          text,
          pendingAction: {
            ...m.pendingAction!,
            status: "rejected" as const
          }
        };
      }
      return m;
    });

    setMessages(updatedMessages);
    saveSession(updatedMessages);
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text) return;

    if (!textToSend) {
      setInputValue("");
    }

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      role: "user",
      text,
      timestamp: new Date()
    };

    const updatedWithUser = [...messages, userMsg];
    setMessages(updatedWithUser);
    saveSession(updatedWithUser);
    setIsLoading(true);

    try {
      const savedModel = localStorage.getItem("horsesense_ai_model") || "gemini-3.5-flash";
      const savedTempStr = localStorage.getItem("horsesense_ai_temperature");
      const savedTemp = savedTempStr ? parseFloat(savedTempStr) : 0.7;
      const savedInstruction = localStorage.getItem("horsesense_ai_system_instruction") || undefined;

      const response = await fetch("/api/horsesense-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: updatedWithUser.slice(-10).map((m) => ({ role: m.role, text: m.text })),
          currentUser,
          horses,
          logs,
          visitorScannedHistory,
          customModel: savedModel,
          customTemperature: savedTemp,
          customSystemInstruction: savedInstruction
        })
      });

      if (!response.ok) {
        throw new Error("API call failed");
      }

      const data = await response.json();
      let finalAiText = data.text || "I was unable to formulate a response. Please try again.";

      // Check if Gemini triggered an administrative action tool
      if (data.functionCall && (role === "owner" || role === "admin" || currentUser?.name === "System Administrator")) {
        const { name: actionName, args } = data.functionCall;
        
        // Present as a clean pendingAction that needs user confirmation
        const aiMsg: ChatMessage = {
          id: Math.random().toString(36).substr(2, 9),
          role: "ai",
          text: `**SECURITY AUTHORIZATION REQUEST:**\n\nI want to execute the security administrative action **"${actionName}"** with parameters:\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n\n_Please confirm if you want to authorize this action to update the facility firewall records and log history._`,
          timestamp: new Date(),
          pendingAction: {
            name: actionName,
            args,
            status: "pending"
          }
        };

        const updatedWithAi = [...updatedWithUser, aiMsg];
        setMessages(updatedWithAi);
        saveSession(updatedWithAi);
      } else {
        // Standard conversational response
        const aiMsg: ChatMessage = {
          id: Math.random().toString(36).substr(2, 9),
          role: "ai",
          text: finalAiText,
          timestamp: new Date(),
          imageUrl: data.imageUrl
        };
        
        const updatedWithAi = [...updatedWithUser, aiMsg];
        setMessages(updatedWithAi);
        saveSession(updatedWithAi);
      }
    } catch (err) {
      console.error("AI response error:", err);
      const errorMsg: ChatMessage = {
        id: Math.random().toString(36).substr(2, 9),
        role: "ai",
        text: "I encountered an error connecting to Ruabon Nova Herd AI Services. Please make sure your network and API configurations are active.",
        timestamp: new Date()
      };
      const updatedWithError = [...updatedWithUser, errorMsg];
      setMessages(updatedWithError);
      saveSession(updatedWithError);
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleBadgeColor = () => {
    switch (role) {
      case "owner": return "bg-red-550 text-white";
      case "admin": return "bg-teal-600 text-white";
      case "user": return "bg-stone-800 text-white";
      default: return "bg-pink-100 text-pink-800 border border-pink-200";
    }
  };

  const getSuggestions = () => {
    if (role === "visitor") {
      return [
        "Tell me about the horses in the Back Paddock.",
        "List all the mares currently registered.",
        "What are my visitor logging permissions?"
      ];
    } else if (role === "user") {
      return [
        "Who is checked in today?",
        "Any horses overdue for farrier/shoeing?",
        "How can I log a water check?"
      ];
    } else {
      return [
        "What are our total expenses this month?",
        "Show me a financial breakdown by paddock.",
        "Draft a farm announcement about weather forecast"
      ];
    }
  };

  return (
    <div className="relative inline-block" id="horsesense-ai-widget">
      {/* Trigger Button */}
      <button
        id="horsesense-ai-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-1 text-stone-600 hover:text-stone-900 rounded-full hover:bg-stone-100 transition-colors focus:outline-none"
        title="Talk to Nova Herd AI"
      >
        <HorseSenseLogo className="w-8 h-8 shrink-0" />
        <span 
          className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center px-1 py-0.5 text-[8px] font-black leading-none text-white bg-teal-600 rounded-full"
        >
          AI
        </span>
      </button>

      {/* Floating Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop click close */}
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute right-0 mt-3 w-[420px] max-w-[calc(100vw-2rem)] h-[550px] bg-white rounded-2xl border border-stone-200 shadow-2xl z-50 overflow-hidden flex flex-col transform origin-top-right"
            >
              {/* Previous Chats Panel Drawer */}
              <AnimatePresence>
                {isHistoryOpen && (
                  <>
                    <div className="absolute inset-0 bg-black/40 z-20" onClick={() => setIsHistoryOpen(false)} />
                    <motion.div
                      initial={{ x: "-100%" }}
                      animate={{ x: 0 }}
                      exit={{ x: "-100%" }}
                      transition={{ type: "tween", duration: 0.25 }}
                      className="absolute inset-y-0 left-0 w-[280px] bg-stone-900 text-stone-100 z-30 border-r border-stone-850 flex flex-col shadow-2xl"
                    >
                      {/* Drawer Header */}
                      <div className="p-4 border-b border-stone-800 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                          <History size={14} className="text-teal-400" />
                          <span className="text-xs font-black uppercase tracking-wider text-stone-300">Chat History</span>
                        </div>
                        <button
                          onClick={() => setIsHistoryOpen(false)}
                          className="p-1 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {/* New Chat Button */}
                      <div className="p-3 border-b border-stone-800 shrink-0">
                        <button
                          onClick={startNewChat}
                          className="w-full py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                        >
                          <Plus size={14} /> New Chat
                        </button>
                      </div>

                      {/* Sessions scrollable list */}
                      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-none">
                        {sessions.length === 0 ? (
                          <div className="text-center py-8 text-stone-550 text-xs italic font-semibold">
                            No previous chats found.
                          </div>
                        ) : (
                          sessions.map(s => {
                            const isActive = s.id === currentSessionId;
                            const dateStr = new Date(s.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
                            return (
                              <div
                                key={s.id}
                                onClick={() => selectSession(s)}
                                className={`group p-2.5 rounded-xl cursor-pointer transition-all flex items-start gap-2.5 border ${
                                  isActive 
                                    ? "bg-teal-950/40 text-teal-300 border-teal-900/60 font-semibold" 
                                    : "hover:bg-stone-800/80 text-stone-300 hover:text-white border-transparent"
                                }`}
                              >
                                <MessageSquare size={13} className="shrink-0 mt-1 text-stone-500 group-hover:text-teal-400 transition-colors" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs truncate font-bold leading-normal">{s.title}</p>
                                  <span className="text-[9px] text-stone-500 font-bold block mt-0.5">{dateStr}</span>
                                </div>
                                <button
                                  onClick={(e) => deleteSession(s.id, e)}
                                  className="opacity-60 hover:opacity-100 p-1 rounded-lg text-stone-500 hover:text-red-400 hover:bg-stone-800 transition-all cursor-pointer"
                                  title="Delete chat session"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* Header */}
              <div className="p-4 border-b border-stone-150 bg-stone-50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsHistoryOpen(true)}
                    className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-200/50 transition-colors cursor-pointer"
                    title="View previous chats"
                  >
                    <History size={16} />
                  </button>
                  <div className="w-8 h-8 flex items-center justify-center shrink-0">
                    <HorseSenseLogo className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-black text-stone-900 text-xs uppercase tracking-wider flex items-center gap-1 font-logo">
                      Nova Herd AI <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-teal-500"></span></span>
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-stone-400 font-bold uppercase">Active Session:</span>
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full ${getRoleBadgeColor()}`}>
                        {role}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {onOpenAISettings && (
                    <button
                      onClick={() => {
                        onOpenAISettings();
                        setIsOpen(false);
                      }}
                      className="text-stone-400 hover:text-stone-600 cursor-pointer p-1 rounded-lg hover:bg-stone-200/55 transition-colors"
                      title="AI Settings"
                    >
                      <Settings size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-stone-400 hover:text-stone-600 cursor-pointer p-1 rounded-lg hover:bg-stone-200/55 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Chat scrolling messages */}
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50/50">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {m.role === "ai" && (
                      <div className="w-7 h-7 flex items-center justify-center shrink-0 self-start">
                        <HorseSenseLogo className="w-7 h-7" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-4xs relative group/msg flex flex-col ${
                        m.role === "user"
                          ? "bg-teal-600 text-white font-semibold rounded-tr-none"
                          : "bg-white border border-stone-200 text-stone-800 font-medium rounded-tl-none"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.text}</div>
                      
                      {m.imageUrl && (
                        <div className="mt-2 rounded-xl overflow-hidden border border-stone-200/60 bg-stone-100 shadow-5xs">
                          <img 
                            src={m.imageUrl} 
                            alt="AI Generated" 
                            className="w-full h-auto object-cover max-h-60 rounded-xl" 
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      
                      {/* Interactive Security Action Authorization Panel */}
                      {m.pendingAction && (
                        <div className="mt-3 p-3 bg-stone-50 border border-stone-200 rounded-xl flex flex-col gap-2.5 text-stone-900 shadow-5xs">
                          <div className="flex items-center gap-1.5 border-b border-stone-200 pb-1.5">
                            <ShieldAlert size={14} className="text-amber-600 shrink-0" />
                            <span className="text-[10px] font-black uppercase tracking-wider text-stone-700">Firewall Authority Requested</span>
                          </div>
                          
                          <div className="text-[10px] font-bold text-stone-600">
                            Action: <span className="text-teal-600 uppercase font-extrabold">{m.pendingAction.name}</span>
                          </div>

                          {m.pendingAction.status === "pending" ? (
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                onClick={() => handleApproveAction(m.id, m.pendingAction!.name, m.pendingAction!.args)}
                                className="flex-1 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[9px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all shadow-4xs"
                              >
                                <Check size={11} /> Confirm
                              </button>
                              <button
                                onClick={() => handleRejectAction(m.id)}
                                className="flex-1 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-[9px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all"
                              >
                                <Ban size={11} /> Deny
                              </button>
                            </div>
                          ) : m.pendingAction.status === "approved" ? (
                            <div className="py-1 px-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                              <Check size={10} className="stroke-[3]" /> Command Authorized and Dispatched
                            </div>
                          ) : (
                            <div className="py-1 px-2 bg-red-50 border border-red-200 rounded-lg text-red-850 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                              <Ban size={10} className="stroke-[3]" /> Authorization Declined by Owner
                            </div>
                          )}
                        </div>
                      )}

                      <span
                        className={`text-[8px] block mt-1.5 text-right font-bold ${
                          m.role === "user" ? "text-teal-200" : "text-stone-400"
                        }`}
                      >
                        {m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex gap-2.5 justify-start">
                    <div className="w-7 h-7 flex items-center justify-center shrink-0 animate-pulse">
                      <HorseSenseLogo className="w-7 h-7" />
                    </div>
                    <div className="bg-white border border-stone-200 text-stone-500 rounded-2xl rounded-tl-none p-3.5 text-xs font-semibold shadow-4xs flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-teal-600" />
                      <span>Nova Herd AI is analyzing...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Suggestion Chips */}
              <div className="px-4 py-2 bg-white border-t border-stone-100 flex gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
                {getSuggestions().map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(s)}
                    disabled={isLoading}
                    className="text-[10px] font-bold text-stone-600 bg-stone-50 hover:bg-teal-50 border border-stone-200 hover:border-teal-200 rounded-lg px-2.5 py-1.5 cursor-pointer shrink-0 transition-all shadow-5xs disabled:opacity-55 disabled:cursor-not-allowed"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="p-3 border-t border-stone-150 bg-stone-50 flex gap-2 shrink-0 items-center"
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={
                    role === "visitor"
                      ? "Ask basic horse info..."
                      : "Type in any question..."
                  }
                  disabled={isLoading}
                  className="flex-1 bg-white border border-stone-250 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:ring-1 focus:ring-teal-600 focus:outline-hidden text-stone-900 placeholder:text-stone-400 disabled:bg-stone-100"
                />
                <button
                  type="submit"
                  disabled={isLoading || !inputValue.trim()}
                  className="w-10 h-10 bg-teal-600 hover:bg-teal-700 disabled:bg-stone-200 text-white rounded-xl flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  <Send size={15} />
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
