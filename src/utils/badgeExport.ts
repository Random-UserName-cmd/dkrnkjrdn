// High-fidelity badge canvas rendering and exporting utility for PNG/JPG downloads.
import { SystemUser } from "../types";
import JSZip from "jszip";

/**
 * Generates a deterministic QR-like grid for a user badge.
 */
export function generateQRGrid(name: string, pin: string): boolean[][] {
  const str = `${name}:${pin}`;
  const size = 15;
  const dots: boolean[][] = [];
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      const isTopLeftFinder = r < 5 && c < 5;
      const isTopRightFinder = r < 5 && c >= size - 5;
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
  return dots;
}

export interface ExportBadgeParams {
  name: string;
  pin: string;
  title?: string;
  role: string;
  visitorCode?: string;
  isVisitor?: boolean;
  badgeTheme?: "emerald" | "leather" | "midnight" | "sunset" | "gold";
  frameStyle?: "standard" | "classic" | "tech" | "minimal";
  customSubtitle?: string;
  customLayout?: "vertical" | "horizontal";
  showVisitorCode?: boolean;
  badges?: string[];
}

/**
 * Draws a badge to an in-memory Canvas and returns the Data URL.
 */
export function generateBadgeCanvas({
  name,
  pin,
  title,
  role,
  visitorCode,
  isVisitor = false,
  badgeTheme = "emerald",
  frameStyle = "standard",
  customSubtitle = "Hold card up to any web terminal scanner to log in instantly.",
  customLayout = "horizontal",
  showVisitorCode = true,
  badges = [],
}: ExportBadgeParams): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
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

  if (isVisitor) {
    primaryColor = "#db2777"; // rose-600
    secondaryColor = "#be185d"; // rose-700
    accentBg = "#fff1f2";
    patternColor = "rgba(219, 39, 119, 0.05)";
  } else if (badgeTheme === "emerald") {
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
  if (frameStyle === "classic") {
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
  ctx.fillText(isVisitor ? "AUTHORIZED GUEST" : "HORSE SENSE CREW", pillX + pillW / 2, pillY + pillH / 2);

  // 5. Draw QR Code Container
  const qrX = isHoriz ? 45 : (W - 140) / 2;
  const qrY = isHoriz ? 85 : 120;
  const qrSize = isHoriz ? 160 : 140;

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

  // Generate QR grid
  const grid = generateQRGrid(name, pin);
  const gridSize = 15;
  const dotSize = qrSize / gridSize;

  ctx.fillStyle = badgeTheme === "midnight" ? "#f9fafb" : "#1c1917";
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r][c]) {
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
  let dName = name;
  if (dName.length > 22) dName = dName.substring(0, 20) + "...";
  ctx.fillText(dName, isHoriz ? 240 : W / 2, isHoriz ? 140 : 310);

  // Title
  ctx.fillStyle = secondaryColor;
  ctx.font = "bold 13px sans-serif, Arial";
  ctx.fillText((title || role || "CREW MEMBER").toUpperCase(), isHoriz ? 240 : W / 2, isHoriz ? 165 : 330);

  // 7. Visitor referral Code if enabled
  if (showVisitorCode) {
    const vCodeY = isHoriz ? 185 : 360;
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
    ctx.fillText(isVisitor ? "VISITOR ACCESS CODE (PIN):" : "REFERRAL GUEST BYPASS CODE:", vCodeX + 12, vCodeY + 14);

    ctx.fillStyle = textColor;
    ctx.font = "bold 13px monospace, Courier";
    ctx.fillText(isVisitor ? pin : (visitorCode || "482391"), vCodeX + 12, vCodeY + 28);
  }

  // 8. Bottom ID indicator bar
  ctx.fillStyle = badgeTheme === "midnight" ? "#9ca3af" : "#57534e";
  ctx.font = "bold 9px monospace, Courier";
  ctx.textAlign = isHoriz ? "left" : "center";
  const prefix = isVisitor ? "GUEST" : "RUABON";
  const labelX = isHoriz ? 240 : W / 2;
  const labelY = isHoriz ? 275 : 460;
  ctx.fillText(`SYS-ID: ${prefix}-${pin}-${name.substring(0,3).toUpperCase()}`, labelX, labelY);

  // 9. Instructions footer
  ctx.fillStyle = badgeTheme === "midnight" ? "#6b7280" : "#a8a29e";
  ctx.font = "normal 8.1px sans-serif, Arial";
  ctx.fillText(customSubtitle, labelX, labelY + 18);
  ctx.fillText("Automated entry system. Subject to instant scanning check-in.", labelX, labelY + 28);

  // 9.5. Draw assigned user/guest badges as rounded capsules if any exist
  if (badges && badges.length > 0) {
    let startX = isHoriz ? 240 : (W - 180) / 2;
    const startY = isHoriz ? 228 : 395;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 8px sans-serif, Arial";
    
    // Draw "Badges:" text label
    ctx.fillStyle = secondaryColor;
    ctx.fillText("BADGES:", startX, startY + 8);
    
    const textWidth = ctx.measureText("BADGES:").width;
    startX += textWidth + 8;
    
    (badges || []).slice(0, 3).forEach((badgeText) => {
      ctx.font = "bold 8px sans-serif, Arial";
      const badgeW = ctx.measureText(badgeText.toUpperCase()).width + 12;
      const badgeH = 16;
      
      // Capsule rounded background
      ctx.fillStyle = primaryColor + "15"; // light tint background
      ctx.strokeStyle = primaryColor + "50";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(startX, startY, badgeW, badgeH, 6);
      } else {
        ctx.rect(startX, startY, badgeW, badgeH);
      }
      ctx.fill();
      ctx.stroke();
      
      // Capsule text label
      ctx.fillStyle = primaryColor;
      ctx.textAlign = "center";
      ctx.fillText(badgeText.toUpperCase(), startX + badgeW / 2, startY + badgeH / 2);
      
      startX += badgeW + 6;
    });
  }

  // 10. Top Logo / Header (Farm Title)
  ctx.fillStyle = textColor;
  ctx.font = "black 14px sans-serif, Arial";
  ctx.textAlign = "left";
  ctx.fillText("HORSE SENSE FARM", 45, 45);

  ctx.fillStyle = primaryColor;
  ctx.font = "bold 11px sans-serif, Arial";
  ctx.textAlign = "right";
  ctx.fillText("AUTOMATED GATEWAY SECURE", W - 45, 45);

  return canvas;
}

/**
 * Renders and downloads a badge as an image.
 */
export function exportBadgeImage(params: ExportBadgeParams, format: "png" | "jpg" = "png") {
  const canvas = generateBadgeCanvas(params);
  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  const ext = format === "jpg" ? "jpg" : "png";
  const dataUrl = canvas.toDataURL(mimeType, 1.0);

  const filename = `${params.name.toLowerCase().replace(/\s+/g, "_")}_security_badge.${ext}`;
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Renders ALL badges side-by-side in a beautiful grid on a single consolidated document.
 * This satisfies: "when you bulk png or jpg it puts all the badges onto one document"
 */
export async function exportBulkBadges(
  crewProfiles: SystemUser[],
  visitorPermissions: any[],
  format: "png" | "jpg" = "png"
) {
  const badgeW = 600;
  const badgeH = 380;
  const margin = 20;
  const cols = 2;
  const totalBadges = crewProfiles.length + visitorPermissions.length;
  
  if (totalBadges === 0) return;
  
  const rows = Math.ceil(totalBadges / cols);
  
  const combinedCanvas = document.createElement("canvas");
  combinedCanvas.width = cols * badgeW + (cols + 1) * margin;
  combinedCanvas.height = rows * badgeH + (rows + 1) * margin;
  
  const ctx = combinedCanvas.getContext("2d");
  if (!ctx) return;
  
  // Fill solid background for the document
  ctx.fillStyle = "#e2e8f0"; // slate-200 background page
  ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);
  
  let index = 0;
  
  // 1. Render Crew Badges
  for (const user of crewProfiles) {
    const badgeCanvas = generateBadgeCanvas({
      name: user.name,
      pin: user.pin,
      title: user.title,
      role: user.role,
      visitorCode: (user as any).visitorCode || "482391",
      isVisitor: false,
      badgeTheme: user.badgeTheme,
      frameStyle: user.frameStyle,
      customSubtitle: user.customSubtitle,
      customLayout: user.customLayout,
      showVisitorCode: user.showVisitorCode,
      badges: user.badges || [],
    });
    
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = margin + col * (badgeW + margin);
    const y = margin + row * (badgeH + margin);
    
    ctx.drawImage(badgeCanvas, x, y);
    index++;
  }
  
  // 2. Render Visitor Badges
  for (const vis of visitorPermissions) {
    const badgeCanvas = generateBadgeCanvas({
      name: vis.name,
      pin: vis.pin || "0000",
      title: vis.title || "Pre-Authorized Guest",
      role: "visitor",
      isVisitor: true,
      badgeTheme: vis.badgeTheme || "sunset",
      frameStyle: vis.frameStyle || "standard",
      customSubtitle: vis.customSubtitle || "Hold card up to any web terminal scanner.",
      customLayout: vis.customLayout || "horizontal",
      showVisitorCode: vis.showVisitorCode !== false,
      badges: vis.badges || [],
    });
    
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = margin + col * (badgeW + margin);
    const y = margin + row * (badgeH + margin);
    
    ctx.drawImage(badgeCanvas, x, y);
    index++;
  }
  
  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  const ext = format === "jpg" ? "jpg" : "png";
  const dataUrl = combinedCanvas.toDataURL(mimeType, 1.0);
  
  const link = document.createElement("a");
  link.download = `ruabon_farm_all_badges_sheet.${ext}`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads all badges as separate individual JPG images bundled inside a ZIP archive.
 * This satisfies: "when you download a zip it makes them all seperate jpg"
 */
export async function exportBadgesZip(
  crewProfiles: SystemUser[],
  visitorPermissions: any[]
) {
  const zip = new JSZip();
  
  const getCanvasBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob || new Blob());
      }, "image/jpeg", 0.9);
    });
  };
  
  // 1. Add Crew Badges
  for (const user of crewProfiles) {
    const badgeCanvas = generateBadgeCanvas({
      name: user.name,
      pin: user.pin,
      title: user.title,
      role: user.role,
      visitorCode: (user as any).visitorCode || "482391",
      isVisitor: false,
      badgeTheme: user.badgeTheme,
      frameStyle: user.frameStyle,
      customSubtitle: user.customSubtitle,
      customLayout: user.customLayout,
      showVisitorCode: user.showVisitorCode,
      badges: user.badges || [],
    });
    const blob = await getCanvasBlob(badgeCanvas);
    const filename = `crew_${user.name.toLowerCase().replace(/\s+/g, "_")}_badge.jpg`;
    zip.file(filename, blob);
  }
  
  // 2. Add Visitor Badges
  for (const vis of visitorPermissions) {
    const badgeCanvas = generateBadgeCanvas({
      name: vis.name,
      pin: vis.pin || "0000",
      title: vis.title || "Pre-Authorized Guest",
      role: "visitor",
      isVisitor: true,
      badgeTheme: vis.badgeTheme || "sunset",
      frameStyle: vis.frameStyle || "standard",
      customSubtitle: vis.customSubtitle || "Hold card up to any web terminal scanner.",
      customLayout: vis.customLayout || "horizontal",
      showVisitorCode: vis.showVisitorCode !== false,
      badges: vis.badges || [],
    });
    const blob = await getCanvasBlob(badgeCanvas);
    const filename = `guest_${vis.name.toLowerCase().replace(/\s+/g, "_")}_badge.jpg`;
    zip.file(filename, blob);
  }
  
  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ruabon_farm_security_badges_archive.zip";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
