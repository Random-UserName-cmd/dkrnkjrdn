import React, { useState, useEffect, useRef } from "react";
import { X, Download, Palette, Layers, Sparkles, Type, Shield, CreditCard, Check } from "lucide-react";
import { SystemUser } from "../types";
import { db } from "../firebase";
import { doc, updateDoc } from "firebase/firestore";
import { ExportBadgeParams } from "../utils/badgeExport";

interface BadgeDesignerProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: SystemUser;
}

type BadgeTheme = "emerald" | "leather" | "midnight" | "sunset" | "gold";
type FrameStyle = "standard" | "classic" | "tech" | "minimal";

export default function BadgeDesigner({ isOpen, onClose, userProfile }: BadgeDesignerProps) {
  // Configurable states
  const [badgeName, setBadgeName] = useState(userProfile?.name || "System Administrator");
  const [badgeTitle, setBadgeTitle] = useState(userProfile?.title || "Lead Operations Director");
  const [badgeRole, setBadgeRole] = useState(userProfile?.role || "owner");
  const [badgePin, setBadgePin] = useState(userProfile?.pin || "8357");
  const [visitorCode, setVisitorCode] = useState(userProfile?.visitorCode || "739215");
  const [showVisitorCode, setShowVisitorCode] = useState(true);
  const [badgeTheme, setBadgeTheme] = useState<BadgeTheme>("emerald");
  const [frameStyle, setFrameStyle] = useState<FrameStyle>("standard");
  const [customSubtitle, setCustomSubtitle] = useState("SECURE ACCESS - NOVA HERD FARM");
  const [customLayout, setCustomLayout] = useState<"vertical" | "horizontal">("horizontal");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [badges, setBadges] = useState<string[]>(userProfile?.badges || []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (userProfile) {
      setBadgeName(userProfile.name);
      setBadgeTitle(userProfile.title || (userProfile.role === "owner" ? "Farm Owner" : "Crew Member"));
      setBadgeRole(userProfile.role);
      setBadgePin(userProfile.pin);
      setBadges(userProfile.badges || []);
      if (userProfile.visitorCode) {
        setVisitorCode(userProfile.visitorCode);
      }
      if (userProfile.badgeTheme) setBadgeTheme(userProfile.badgeTheme);
      if (userProfile.frameStyle) setFrameStyle(userProfile.frameStyle);
      if (userProfile.customSubtitle) setCustomSubtitle(userProfile.customSubtitle);
      if (userProfile.customLayout) setCustomLayout(userProfile.customLayout);
      if (userProfile.showVisitorCode !== undefined) setShowVisitorCode(userProfile.showVisitorCode);
    }
  }, [userProfile, isOpen]);

  if (!isOpen) return null;

  // Render preview badge to canvas for high quality download
  const drawBadgeToCanvas = (): HTMLCanvasElement => {
    const canvas = document.createElement("canvas");
    // Standard ID Badge aspect ratio (e.g., CR80 is 3.375" x 2.125")
    // Horizontal size: 600 x 380, Vertical size: 380 x 600
    const isHoriz = customLayout === "horizontal";
    canvas.width = isHoriz ? 600 : 380;
    canvas.height = isHoriz ? 380 : 600;

    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const W = canvas.width;
    const H = canvas.height;

    // Define colors based on theme
    let primaryColor = "#0d9488"; // teal-600
    let secondaryColor = "#0f766e"; // teal-700
    let bgColor = "#ffffff";
    let accentBg = "#f0fdfa"; // teal-50
    let textColor = "#1c1917"; // stone-900
    let pillTextColor = "#ffffff";
    let patternColor = "rgba(13, 148, 136, 0.05)";

    if (badgeTheme === "emerald") {
      primaryColor = "#059669"; // emerald-600
      secondaryColor = "#047857"; // emerald-700
      accentBg = "#ecfdf5";
      patternColor = "rgba(5, 150, 105, 0.04)";
    } else if (badgeTheme === "leather") {
      primaryColor = "#b45309"; // amber-700
      secondaryColor = "#78350f"; // amber-900
      accentBg = "#fffbeb";
      patternColor = "rgba(180, 83, 9, 0.04)";
    } else if (badgeTheme === "midnight") {
      primaryColor = "#3b82f6"; // blue-500
      secondaryColor = "#1e3a8a"; // blue-900
      bgColor = "#111827"; // grey-900
      accentBg = "#1f2937";
      textColor = "#f9fafb";
      patternColor = "rgba(59, 130, 246, 0.08)";
    } else if (badgeTheme === "sunset") {
      primaryColor = "#db2777"; // rose-600
      secondaryColor = "#be185d"; // rose-700
      accentBg = "#fff1f2";
      patternColor = "rgba(219, 39, 119, 0.05)";
    } else if (badgeTheme === "gold") {
      primaryColor = "#ca8a04"; // gold-600
      secondaryColor = "#854d0e"; // gold-800
      accentBg = "#fef9c3";
      patternColor = "rgba(202, 138, 4, 0.06)";
    }

    // 1. Draw Background Outer Card padding
    ctx.fillStyle = badgeTheme === "midnight" ? "#030712" : "#f5f5f4";
    ctx.fillRect(0, 0, W, H);

    // 2. Draw rounded card shape
    const cardX = 16;
    const cardY = 16;
    const cardW = W - 32;
    const cardH = H - 32;
    const cardRadius = 24;

    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(cardX, cardY, cardW, cardH, cardRadius);
    } else {
      ctx.rect(cardX, cardY, cardW, cardH);
    }
    ctx.fillStyle = bgColor;
    ctx.fill();

    // Draw frame borders
    ctx.lineWidth = frameStyle === "tech" ? 6 : 4;
    ctx.strokeStyle = primaryColor;
    if (frameStyle === "gold") {
      ctx.strokeStyle = "#ca8a04";
    } else if (frameStyle === "classic") {
      ctx.strokeStyle = "#292524"; // deep stone
    } else if (frameStyle === "minimal") {
      ctx.strokeStyle = "transparent";
    }
    ctx.stroke();

    // 3. Clip for pattern drawing inside
    ctx.clip();

    // Draw fancy pattern circles
    ctx.strokeStyle = patternColor;
    ctx.lineWidth = 2;
    for (let radius = 100; radius <= 350; radius += 50) {
      ctx.beginPath();
      ctx.arc(W - 20, isHoriz ? 20 : H - 20, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Grid overlay for tech style
    if (frameStyle === "tech") {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.02)";
      if (badgeTheme === "midnight") {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      }
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 4. Draw Security Header Pill
    const pillX = isHoriz ? 240 : (W - 160) / 2;
    const pillY = isHoriz ? 75 : 60;
    const pillW = 160;
    const pillH = 24;

    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(pillX, pillY, pillW, pillH, 8);
    } else {
      ctx.rect(pillX, pillY, pillW, pillH);
    }
    ctx.fill();

    ctx.fillStyle = pillTextColor;
    ctx.font = "black 9px sans-serif, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeRole.toUpperCase() === "visitor" ? "AUTHORIZED GUEST" : "NOVA HERD CREW", pillX + pillW / 2, pillY + pillH / 2);

    // 5. Draw QR Code Container & Mock QR
    const qrX = isHoriz ? 45 : (W - 140) / 2;
    const qrY = isHoriz ? 85 : 120;
    const qrSize = isHoriz ? 160 : 140;

    // Outer QR border
    ctx.fillStyle = badgeTheme === "midnight" ? "#1f2937" : "#fafaf9";
    ctx.strokeStyle = badgeTheme === "midnight" ? "#374151" : "#e7e5e4";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 16);
    } else {
      ctx.rect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
    }
    ctx.fill();
    ctx.stroke();

    // Generate deterministic 15x15 pixel qr code grid
    const str = `${badgeName}:${badgePin}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const gridSize = 15;
    const dotSize = qrSize / gridSize;

    ctx.fillStyle = badgeTheme === "midnight" ? "#f9fafb" : "#1c1917";
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        // Draw finders
        const isTopLeftFinder = r < 5 && c < 5;
        const isTopRightFinder = r < 5 && c >= gridSize - 5;
        const isBottomLeftFinder = r >= gridSize - 5 && c < 5;
        let active = false;

        if (isTopLeftFinder) {
          active = r === 0 || r === 4 || c === 0 || c === 4 || (r === 2 && c === 2);
        } else if (isTopRightFinder) {
          const cc = c - (gridSize - 5);
          active = r === 0 || r === 4 || cc === 0 || cc === 4 || (r === 2 && cc === 2);
        } else if (isBottomLeftFinder) {
          const rr = r - (gridSize - 5);
          active = rr === 0 || rr === 4 || c === 0 || c === 4 || (rr === 2 && c === 2);
        } else {
          const val = Math.abs((hash ^ (r * 29) ^ (c * 83)) % 100);
          active = val > 45;
        }

        if (active) {
          ctx.fillRect(qrX + c * dotSize, qrY + r * dotSize, dotSize + 0.3, dotSize + 0.3);
        }
      }
    }

    // 6. Draw Name & Title Info
    ctx.fillStyle = textColor;
    ctx.textAlign = isHoriz ? "left" : "center";
    ctx.textBaseline = "alphabetic";

    // Name
    ctx.font = "bold 24px sans-serif, Arial";
    let dName = badgeName;
    if (dName.length > 22) dName = dName.substring(0, 20) + "...";
    ctx.fillText(dName, isHoriz ? 240 : W / 2, isHoriz ? 140 : 310);

    // Title
    ctx.fillStyle = secondaryColor;
    ctx.font = "bold 13px sans-serif, Arial";
    ctx.fillText(badgeTitle.toUpperCase(), isHoriz ? 240 : W / 2, isHoriz ? 165 : 330);

    // 6.5 Draw Profile Badges on Canvas
    if (badges && badges.length > 0) {
      ctx.save();
      ctx.font = "bold 9px sans-serif, Arial";
      
      let currentX = isHoriz ? 240 : (W - (badges.length * 75)) / 2;
      const startY = isHoriz ? 180 : 345;
      
      badges.forEach((badgeStr) => {
        const textWidth = ctx.measureText(badgeStr.toUpperCase()).width;
        const capW = textWidth + 12;
        const capH = 16;
        const capX = isHoriz ? currentX : currentX + (75 - capW)/2;
        
        ctx.fillStyle = primaryColor + "15"; // transparent theme color
        ctx.strokeStyle = primaryColor + "40";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(capX, startY, capW, capH, 4);
        } else {
          ctx.rect(capX, startY, capW, capH);
        }
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = secondaryColor;
        ctx.textAlign = "center";
        ctx.fillText(badgeStr.toUpperCase(), capX + capW / 2, startY + 11);
        
        currentX += isHoriz ? capW + 6 : 75;
      });
      ctx.restore();
    }

    // 7. Visitor referral Code if enabled
    if (showVisitorCode) {
      const vCodeY = isHoriz 
        ? (badges && badges.length > 0 ? 210 : 185) 
        : (badges && badges.length > 0 ? 375 : 360);
      const vCodeX = isHoriz ? 240 : (W - 240) / 2;
      const vCodeW = 240;
      const vCodeH = 34;

      ctx.fillStyle = accentBg;
      ctx.strokeStyle = primaryColor + "40"; // 25% opacity
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(vCodeX, vCodeY, vCodeW, vCodeH, 8);
      } else {
        ctx.rect(vCodeX, vCodeY, vCodeW, vCodeH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = secondaryColor;
      ctx.font = "bold 9px sans-serif, Arial";
      ctx.textAlign = "left";
      ctx.fillText("REFERRAL GUEST BYPASS CODE:", vCodeX + 12, vCodeY + 14);

      ctx.fillStyle = textColor;
      ctx.font = "bold 13px monospace, Courier";
      ctx.fillText(visitorCode, vCodeX + 12, vCodeY + 28);
    }

    // 8. Bottom ID indicator bar
    ctx.fillStyle = badgeTheme === "midnight" ? "#9ca3af" : "#57534e";
    ctx.font = "bold 9px monospace, Courier";
    ctx.textAlign = isHoriz ? "left" : "center";
    const prefix = badgeRole === "visitor" ? "GUEST" : "STAFF";
    const labelX = isHoriz ? 240 : W / 2;
    const labelY = isHoriz ? 275 : 460;
    ctx.fillText(`SYS-ID: ${prefix}-${badgePin}-${badgeName.substring(0,3).toUpperCase()}`, labelX, labelY);

    // 9. Instructions footer
    ctx.fillStyle = badgeTheme === "midnight" ? "#6b7280" : "#a8a29e";
    ctx.font = "normal 8.1px sans-serif, Arial";
    ctx.fillText(customSubtitle, labelX, labelY + 18);
    ctx.fillText("Automated entry system. Subject to instant scanning check-in.", labelX, labelY + 28);

    // 10. Top Logo / Header (Farm Title)
    ctx.fillStyle = textColor;
    ctx.font = "black 14px sans-serif, Arial";
    ctx.textAlign = "left";
    ctx.fillText("NOVA HERD FARM", 45, 45);

    ctx.fillStyle = primaryColor;
    ctx.font = "bold 11px sans-serif, Arial";
    ctx.textAlign = "right";
    ctx.fillText("AUTOMATED GATEWAY SECURE", W - 45, 45);

    return canvas;
  };

  const handleSave = async () => {
    if (!userProfile) return;
    setIsSaving(true);
    try {
      const userRef = doc(db, "crew_profiles", userProfile.name);
      await updateDoc(userRef, {
        badgeTheme,
        frameStyle,
        customSubtitle,
        customLayout,
        showVisitorCode,
        title: badgeTitle,
        pin: badgePin,
        visitorCode
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save customized badge:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    if (userProfile) {
      try {
        const userRef = doc(db, "crew_profiles", userProfile.name);
        await updateDoc(userRef, {
          badgeTheme,
          frameStyle,
          customSubtitle,
          customLayout,
          showVisitorCode,
          title: badgeTitle,
          pin: badgePin,
          visitorCode
        });
      } catch (e) {
        console.warn("Auto save layout failed:", e);
      }
    }
    const canvas = drawBadgeToCanvas();
    const dataUrl = canvas.toDataURL("image/png", 1.0);
    const link = document.createElement("a");
    link.download = `${badgeName.toLowerCase().replace(/\s+/g, "_")}_badge_designer.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-stone-200 overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-auto max-h-[90vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left column: Controls */}
        <div className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto border-r border-stone-150">
          <div className="flex justify-between items-center pb-4 border-b border-stone-100">
            <div>
              <h2 className="text-lg font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
                <Palette className="text-teal-600" size={20} /> Badge Designer Studio
              </h2>
              <p className="text-xs text-stone-500">Configure visual themes, custom labels, and layout structures.</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                Full Name on Card
              </label>
              <input
                type="text"
                value={badgeName}
                onChange={(e) => setBadgeName(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 px-4 py-2.5 rounded-xl text-xs font-bold text-stone-800"
                placeholder="Enter Full Name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                  Designation / Title
                </label>
                <input
                  type="text"
                  value={badgeTitle}
                  onChange={(e) => setBadgeTitle(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 px-3 py-2.5 rounded-xl text-xs font-bold text-stone-800"
                  placeholder="e.g. Head Trainer"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                  Pin / Password
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={badgePin}
                  onChange={(e) => setBadgePin(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 px-3 py-2.5 rounded-xl text-xs font-mono font-bold text-stone-800"
                  placeholder="e.g. 1234"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                  Sponsor Referral Code
                </label>
                <input
                  type="text"
                  value={visitorCode}
                  onChange={(e) => setVisitorCode(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 px-3 py-2.5 rounded-xl text-xs font-mono font-bold text-stone-800"
                  placeholder="e.g. 842104"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                  Account Role Group
                </label>
                <select
                  value={badgeRole}
                  onChange={(e) => setBadgeRole(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 px-3 py-2.5 rounded-xl text-xs font-bold text-stone-800"
                >
                  <option value="owner">Owner / Proprietor</option>
                  <option value="admin">Administrator / Sponsor</option>
                  <option value="user">Employee / Trainer</option>
                  <option value="visitor">Visitor / Farm Guest</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                  Referral / Guest Code Block
                </label>
                <input
                  type="checkbox"
                  checked={showVisitorCode}
                  onChange={(e) => setShowVisitorCode(e.target.checked)}
                  className="accent-teal-600 h-4 w-4 rounded-sm border-stone-300"
                  id="toggleCode"
                />
              </div>
              <p className="text-[10px] text-stone-400">Renders the sponsor referral code directly on the front side of the badge.</p>
            </div>

            <div className="border-t border-stone-100 pt-4">
              <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-2">
                Select Design Theme Palette
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { id: "emerald", label: "Emerald", color: "bg-emerald-600 border-emerald-300" },
                  { id: "leather", label: "Amber", color: "bg-amber-700 border-amber-500" },
                  { id: "midnight", label: "Slate", color: "bg-slate-900 border-blue-500" },
                  { id: "sunset", label: "Sunset", color: "bg-pink-600 border-pink-400" },
                  { id: "gold", label: "Premium Gold", color: "bg-yellow-600 border-yellow-400" },
                ].map((th) => (
                  <button
                    key={th.id}
                    onClick={() => setBadgeTheme(th.id as BadgeTheme)}
                    className={`h-10 rounded-xl border-2 flex items-center justify-center transition-all ${th.color} ${
                      badgeTheme === th.id ? "scale-105 ring-2 ring-teal-500 ring-offset-1" : "opacity-80"
                    }`}
                    title={th.label}
                  >
                    {badgeTheme === th.id && <Check className="text-white" size={14} />}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                  Border Frame Trim
                </label>
                <select
                  value={frameStyle}
                  onChange={(e) => setFrameStyle(e.target.value as FrameStyle)}
                  className="w-full bg-stone-50 border border-stone-200 px-3 py-2 rounded-xl text-xs font-bold text-stone-800"
                >
                  <option value="standard">Teal / Theme Double border</option>
                  <option value="classic">Steel Charcoal Rim</option>
                  <option value="tech">Tech Thick Grid Borders</option>
                  <option value="minimal">Zero Borders (Clean)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                  Aspect Orientation
                </label>
                <select
                  value={customLayout}
                  onChange={(e) => setCustomLayout(e.target.value as "vertical" | "horizontal")}
                  className="w-full bg-stone-50 border border-stone-200 px-3 py-2 rounded-xl text-xs font-bold text-stone-800"
                >
                  <option value="horizontal">Horizontal Badge (Landscape)</option>
                  <option value="vertical">Vertical Badge (Portrait)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                Instructional Footer Message
              </label>
              <input
                type="text"
                value={customSubtitle}
                onChange={(e) => setCustomSubtitle(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 px-3 py-2 rounded-xl text-xs font-bold text-stone-850"
                placeholder="Secure access info..."
              />
            </div>
          </div>
        </div>

        {/* Right column: Interactive Visual Preview */}
        <div className="flex-1 bg-stone-50 p-6 md:p-8 flex flex-col justify-between items-center overflow-y-auto">
          <div className="w-full flex justify-between items-center pb-3 border-b border-stone-200/60 mb-6">
            <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider flex items-center gap-1">
              <Sparkles size={12} className="text-yellow-500" /> High-Fidelity Rendering Preview
            </span>
            <span className="text-[9px] bg-teal-50 border border-teal-100 text-teal-700 px-2.5 py-0.5 rounded-md font-mono font-black uppercase">
              {customLayout === "horizontal" ? "600 x 380 px" : "380 x 600 px"}
            </span>
          </div>

          {/* Render visually in HTML so it looks amazing and responsive in the page */}
          <div className="flex-1 flex items-center justify-center py-4">
            <div
              className={`relative bg-white rounded-3xl border shadow-xl flex transition-all duration-300 ${
                customLayout === "horizontal" 
                  ? "w-[340px] h-[215px] p-4 flex-row" 
                  : "w-[215px] h-[340px] p-4 flex-col justify-between"
              } ${
                badgeTheme === "emerald" ? "border-emerald-500 bg-emerald-50/5" :
                badgeTheme === "leather" ? "border-amber-700 bg-amber-50/5" :
                badgeTheme === "midnight" ? "border-blue-500 bg-gray-900 text-stone-100" :
                badgeTheme === "sunset" ? "border-pink-500 bg-rose-50/5" :
                "border-yellow-500 bg-yellow-50/5"
              }`}
            >
              {/* Dynamic Theme Color classes */}
              {badgeTheme === "midnight" && (
                <div className="absolute inset-0 bg-stone-900 rounded-3xl -z-10" />
              )}
              
              <div className="absolute top-2.5 left-4 right-4 flex justify-between items-center text-[8px] font-bold uppercase text-stone-500 font-logo">
                <span className={badgeTheme === "midnight" ? "text-stone-300" : "text-stone-800"}>Nova Herd Farm</span>
                <span className="text-teal-600 font-black">Secure</span>
              </div>

              {/* Badge visual main layout */}
              <div className={`w-full h-full flex ${customLayout === "horizontal" ? "flex-row gap-3 items-center" : "flex-col items-center justify-center mt-3 text-center"}`}>
                
                {/* Simulated QR Code */}
                <div className={`border p-1 bg-stone-50 rounded-xl flex items-center justify-center shrink-0 ${
                  badgeTheme === "midnight" ? "border-stone-700 bg-stone-850" : "border-stone-200"
                } ${customLayout === "horizontal" ? "w-24 h-24" : "w-20 h-20 mb-2"}`}>
                  <div className="w-full h-full grid grid-cols-5 gap-[1px]">
                    {Array.from({ length: 25 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`rounded-xs ${
                          (i % 2 === 0 && i % 3 !== 0) || i === 0 || i === 4 || i === 20 || i === 24
                            ? (badgeTheme === "midnight" ? "bg-white" : "bg-stone-900") 
                            : "bg-transparent"
                        }`} 
                      />
                    ))}
                  </div>
                </div>

                {/* Info Text Area */}
                <div className="flex-1 min-w-0 text-left">
                  {/* Category Pill */}
                  <span className={`inline-block text-[7px] font-black tracking-widest uppercase text-white px-2 py-0.5 rounded-sm mb-1 ${
                    badgeTheme === "emerald" ? "bg-emerald-600" :
                    badgeTheme === "leather" ? "bg-amber-700" :
                    badgeTheme === "midnight" ? "bg-blue-600" :
                    badgeTheme === "sunset" ? "bg-rose-600" :
                    "bg-yellow-600"
                  }`}>
                    {badgeRole === "visitor" ? "Farm Guest" : "Crew Team"}
                  </span>

                  <h3 className={`text-sm font-black uppercase tracking-tight truncate leading-tight ${
                    badgeTheme === "midnight" ? "text-white" : "text-stone-900"
                  }`}>
                    {badgeName}
                  </h3>

                  <p className={`text-[8.5px] font-bold uppercase ${
                    badgeTheme === "emerald" ? "text-emerald-700" :
                    badgeTheme === "leather" ? "text-amber-800" :
                    badgeTheme === "midnight" ? "text-blue-400" :
                    badgeTheme === "sunset" ? "text-pink-600" :
                    "text-yellow-700"
                  }`}>
                    {badgeTitle}
                  </p>

                  {/* Badges list */}
                  {badges && badges.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {badges.map((b, i) => (
                        <span
                          key={i}
                          className={`text-[6.5px] font-black uppercase px-1 py-0.5 rounded-sm border ${
                            badgeTheme === "midnight"
                              ? "bg-stone-800 text-stone-300 border-stone-750"
                              : "bg-stone-100 text-stone-700 border-stone-200"
                          }`}
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 space-y-1 font-mono text-[7.5px] text-stone-400">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(badgePin);
                        alert(`PIN ${badgePin} copied to clipboard!`);
                      }}
                      className="bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 border border-stone-300 font-bold px-2 py-0.5 rounded-lg tracking-wider block transition-all active:scale-95 cursor-pointer text-[7.5px]"
                    >
                      PIN-ID: {badgePin}
                    </button>
                    {showVisitorCode && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(visitorCode);
                          alert(`Bypass Code ${visitorCode} copied to clipboard!`);
                        }}
                        className="text-amber-850 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 font-bold px-2 py-0.5 rounded-lg block tracking-wider mt-1 transition-all active:scale-95 cursor-pointer text-[7px]"
                      >
                        REF-BYPASS: {visitorCode}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom tag line */}
              <div className={`absolute bottom-2.5 left-4 right-4 text-[6.5px] text-stone-400 font-mono flex justify-between ${
                customLayout === "vertical" ? "text-center flex-col items-center" : ""
              }`}>
                <span>ID: {badgeRole.toUpperCase()}-{badgePin}</span>
                <span className="truncate max-w-[150px]">{customSubtitle}</span>
              </div>
            </div>
          </div>

          <div className="w-full pt-4 border-t border-stone-200/85 space-y-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full bg-stone-900 hover:bg-black text-white font-extrabold text-xs py-3 rounded-2xl transition-all cursor-pointer shadow-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-stone-800"
            >
              {isSaving ? "Saving..." : saveSuccess ? "✓ Design Layout Saved!" : "Save Layout to Profile"}
            </button>
            {saveSuccess && (
              <p className="text-[10px] text-center text-emerald-600 font-extrabold uppercase mt-1">
                ✓ Layout successfully saved to system profile!
              </p>
            )}
            <p className="text-[10px] text-center text-stone-400 mt-2">
              Compiles vector elements directly to a 300DPI badge layout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
