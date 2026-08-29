import { Horse, MaintenanceLog } from "../types";
import { getShoeingStatus, getVetStatus } from "./scheduler";
import JSZip from "jszip";

/**
 * Clean data field by escaping double quotes and wrapping in quotes if commas are present.
 */
function cleanCSVCell(cell: any): string {
  if (cell === null || cell === undefined) {
    return "";
  }
  const str = String(cell);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates the CSV content for the herd manifest
 */
export function generateHerdCSV(horses: Horse[], todayStr: string): string {
  const headers = [
    "Horse ID",
    "Horse Name",
    "Breed",
    "Age",
    "Gender",
    "Color",
    "Stable/Paddock",
    "Farm Brand Description",
    "Brand Location",
    "Branding Date",
    "Last Shoeing Date",
    "Shoeing Interval (Weeks)",
    "Shoeing Status",
    "Last Vet Date",
    "Next Vet Due Date",
    "Vet Status",
    "Last Deworming Date",
    "Last Dental Date",
    "Registered Date",
    "Classification",
    "Tags",
    "Microchip Number"
  ];

  const rows = horses.map((horse) => {
    const shoeing = getShoeingStatus(horse, todayStr);
    const vet = getVetStatus(horse, todayStr);

    return [
      cleanCSVCell(horse.id),
      cleanCSVCell(horse.name),
      cleanCSVCell(horse.breed),
      cleanCSVCell(horse.age),
      cleanCSVCell(horse.gender),
      cleanCSVCell(horse.color),
      cleanCSVCell(horse.stableNumber || "Unassigned"),
      cleanCSVCell(horse.brandingDescription),
      cleanCSVCell(horse.brandingLocation),
      cleanCSVCell(horse.brandingDate),
      cleanCSVCell(horse.lastShoeingDate),
      cleanCSVCell(horse.shoeingIntervalWeeks || 6),
      cleanCSVCell(shoeing ? shoeing.status.toUpperCase() : "N/A"),
      cleanCSVCell(horse.lastVetDate),
      cleanCSVCell(horse.nextVetDueDate),
      cleanCSVCell(vet ? vet.status.toUpperCase() : "N/A"),
      cleanCSVCell(horse.lastDewormingDate),
      cleanCSVCell(horse.lastDentalDate),
      cleanCSVCell(horse.createdAt),
      cleanCSVCell(horse.useClassification || "Therapy"),
      cleanCSVCell((horse.tags || []).join("; ")),
      cleanCSVCell(horse.microchipNumber || "")
    ];
  });

  return [
    headers.join(","),
    ...rows.map(row => row.join(","))
  ].join("\n");
}

/**
 * Generates the CSV content for global maintenance history logs
 */
export function generateGlobalMaintenanceCSV(horses: Horse[], logs: MaintenanceLog[]): string {
  const horseIds = new Set(horses.map(h => h.id));
  const relevantLogs = logs.filter(log => horseIds.has(log.horseId));

  const headers = [
    "Log ID",
    "Horse ID",
    "Horse Name",
    "Maintenance Type",
    "Date Performed",
    "Performed By",
    "Cost ($)",
    "Next Due Date",
    "Logged By",
    "Notes",
    "Created Timestamp"
  ];

  const rows = relevantLogs.map(log => {
    return [
      cleanCSVCell(log.id),
      cleanCSVCell(log.horseId),
      cleanCSVCell(log.horseName),
      cleanCSVCell(log.type.toUpperCase()),
      cleanCSVCell(log.date),
      cleanCSVCell(log.performedBy || "N/A"),
      cleanCSVCell(log.cost || 0),
      cleanCSVCell(log.nextDueDate || "N/A"),
      cleanCSVCell(log.loggedBy || "N/A"),
      cleanCSVCell(log.notes || ""),
      cleanCSVCell(log.createdAt || "")
    ];
  });

  return [
    headers.join(","),
    ...rows.map(row => row.join(","))
  ].join("\n");
}

/**
 * Generates a detailed text summary report of the farm herd
 */
function generateSummaryReport(horses: Horse[], todayStr: string, logs: MaintenanceLog[]): string {
  const total = horses.length;
  if (total === 0) {
    return "Ruabon Farm Herd Export Summary\n===============================\nNo horses currently selected or matching filter criteria.";
  }

  const avgAge = (horses.reduce((sum, h) => sum + (h.age || 0), 0) / total).toFixed(1);
  const mares = horses.filter(h => h.gender === "Mare").length;
  const geldings = horses.filter(h => h.gender === "Gelding").length;
  const stallions = horses.filter(h => h.gender === "Stallion").length;

  const shoeingOverdue = horses.filter(h => {
    const s = getShoeingStatus(h, todayStr);
    return s && s.status === "overdue";
  }).length;

  const vetOverdue = horses.filter(h => {
    const v = getVetStatus(h, todayStr);
    return v && v.status === "overdue";
  }).length;

  const horseIds = new Set(horses.map(h => h.id));
  const relevantLogs = logs.filter(log => horseIds.has(log.horseId));
  const totalCost = relevantLogs.reduce((sum, l) => sum + (l.cost || 0), 0);

  let report = "";
  report += `==================================================\n`;
  report += ` RUABON FARM - HERD BULK EXPORT REPORT\n`;
  report += `==================================================\n`;
  report += `Export Timestamp : ${new Date().toLocaleString()}\n`;
  report += `Reference Date   : ${todayStr}\n`;
  report += `Total Herd Size  : ${total} horse(s)\n\n`;

  report += `DEMOGRAPHIC DISTRIBUTION:\n`;
  report += `------------------------\n`;
  report += `- Average Age : ${avgAge} years old\n`;
  report += `- Mares       : ${mares} (${((mares/total)*100).toFixed(1)}%)\n`;
  report += `- Geldings    : ${geldings} (${((geldings/total)*100).toFixed(1)}%)\n`;
  report += `- Stallions   : ${stallions} (${((stallions/total)*100).toFixed(1)}%)\n\n`;

  report += `MAINTENANCE ALERTS & FINANCIALS:\n`;
  report += `--------------------------------\n`;
  report += `- Shoeing Overdue     : ${shoeingOverdue} horse(s)\n`;
  report += `- Vet Care Overdue    : ${vetOverdue} horse(s)\n`;
  report += `- Total Historic Cost : $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
  report += `- Total Logged Events : ${relevantLogs.length} event(s)\n\n`;

  report += `COMPLETE HERD INDEX:\n`;
  report += `--------------------\n`;
  horses.forEach((h, idx) => {
    const hLogs = relevantLogs.filter(l => l.horseId === h.id);
    report += `${idx + 1}. ${h.name} (${h.breed}, ${h.age} yrs, ${h.color})\n`;
    report += `   - Location     : ${h.stableNumber || "No paddock assigned"}\n`;
    report += `   - Microchip    : ${h.microchipNumber || "Not recorded"}\n`;
    report += `   - Brand        : ${h.brandingDescription || "No brand recorded"}\n`;
    report += `   - Maintenance  : ${hLogs.length} history events logged\n`;
    report += `   - Last Checked : ${h.lastCheckedDate ? `${h.lastCheckedDate} by ${h.lastCheckedBy || "Staff"} (Status: ${h.lastCheckedStatus || "OK"})` : "Never checked"}\n`;
    report += `   ------------------------------------------------\n`;
  });

  report += `\nEnd of Ruabon Farm Export Archive.\n`;
  return report;
}

/**
 * Bulk exports herd data as a zip archive containing CSVs, formatted report, and individual profiles
 */
export async function downloadHerdZip(horses: Horse[], todayStr: string, logs: MaintenanceLog[] = []) {
  try {
    const zip = new JSZip();
    const stamp = todayStr.replace(/-/g, "");

    // 1. Add Herd CSV file (Formatted Manifest)
    const csvContent = generateHerdCSV(horses, todayStr);
    zip.file(`herd_manifest_${stamp}.csv`, csvContent);

    // 2. Add Global Maintenance History CSV
    const globalLogsCSV = generateGlobalMaintenanceCSV(horses, logs);
    zip.file(`global_maintenance_ledger_${stamp}.csv`, globalLogsCSV);

    // 3. Add beautiful text summary report
    const summaryText = generateSummaryReport(horses, todayStr, logs);
    zip.file(`herd_summary_report_${stamp}.txt`, summaryText);

    // 4. Create individual directories inside ZIP
    const profilesFolder = zip.folder("individual_profiles");
    const logsFolder = zip.folder("maintenance_history_logs");

    horses.forEach(h => {
      const hStamp = h.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const hLogs = logs.filter(l => l.horseId === h.id);

      // A. Compile individual horse profile
      let profile = `==================================================\n`;
      profile += ` HORSE PROFILE: ${h.name.toUpperCase()}\n`;
      profile += `==================================================\n`;
      profile += `Breed          : ${h.breed}\n`;
      profile += `Age            : ${h.age} years\n`;
      profile += `Gender         : ${h.gender}\n`;
      profile += `Color          : ${h.color}\n`;
      profile += `Microchip No.  : ${h.microchipNumber || "N/A"}\n`;
      profile += `Stable/Paddock : ${h.stableNumber || "Unassigned"}\n`;
      profile += `Classification : ${h.useClassification || "Therapy"}\n`;
      profile += `Profile Tags   : ${(h.tags || []).join(", ") || "None Assigned"}\n\n`;

      profile += `PHYSICAL STATS:\n`;
      profile += `- Height       : ${h.heightHands || "N/A"} hands\n`;
      profile += `- Weight       : ${h.weightLbs || "N/A"} lbs\n`;
      profile += `- Temperament  : ${h.temperament || "N/A"}\n\n`;

      profile += `OWNERSHIP DETAILS:\n`;
      profile += `- Owner Name   : ${h.ownerName || "Ruabon Farm Owned"}\n`;
      profile += `- Owner Phone  : ${h.ownerPhone || "N/A"}\n\n`;

      profile += `MAINTENANCE LOG SUMMARY:\n`;
      profile += `- Last Shod    : ${h.lastShoeingDate || "Never"}\n`;
      profile += `- Last Vet     : ${h.lastVetDate || "Never"}\n`;
      profile += `- Last Dewormed: ${h.lastDewormingDate || "Never"}\n`;
      profile += `- Last Dental  : ${h.lastDentalDate || "Never"}\n\n`;

      if (h.feedRequirements) {
        profile += `FEEDING REQUIREMENTS:\n${h.feedRequirements}\n\n`;
      }

      if (h.activeMedications) {
        profile += `ACTIVE MEDICATIONS:\n${h.activeMedications}\n\n`;
      }

      // Add simple stats on daily check history
      profile += `DAILY CHECKS TELEMETRY:\n`;
      profile += `- Total Checks Rec: ${(h.dailyChecksHistory || []).length}\n`;
      profile += `- Last Checked On : ${h.lastCheckedDate || "N/A"} by ${h.lastCheckedBy || "N/A"} (Status: ${h.lastCheckedStatus || "N/A"})\n\n`;

      if (profilesFolder) {
        profilesFolder.file(`${hStamp}_profile.txt`, profile);
      }

      // B. Compile specific horse maintenance log history sheet
      let historySheet = `==================================================\n`;
      historySheet += ` MAINTENANCE HISTORY: ${h.name.toUpperCase()}\n`;
      historySheet += `==================================================\n\n`;

      if (hLogs.length === 0) {
        historySheet += "No maintenance events logged for this horse.\n";
      } else {
        hLogs.forEach((log, idx) => {
          historySheet += `EVENT #${idx + 1}\n`;
          historySheet += `Type         : ${log.type.toUpperCase()}\n`;
          historySheet += `Date         : ${log.date}\n`;
          historySheet += `Performed By : ${log.performedBy || "N/A"}\n`;
          historySheet += `Cost         : $${log.cost || 0}\n`;
          historySheet += `Logged By    : ${log.loggedBy || "N/A"}\n`;
          if (log.nextDueDate) {
            historySheet += `Next Due     : ${log.nextDueDate}\n`;
          }
          historySheet += `Notes        : ${log.notes || "None"}\n`;
          historySheet += `--------------------------------------------------\n`;
        });
      }

      // Append detailed Daily Paddock Check records for this horse
      historySheet += `\n\n==================================================\n`;
      historySheet += ` DAILY CHECK LOGS HISTORY\n`;
      historySheet += `==================================================\n\n`;
      
      const checkHistory = h.dailyChecksHistory || [];
      if (checkHistory.length === 0) {
        historySheet += "No daily paddock checks recorded for this horse.\n";
      } else {
        checkHistory.forEach((check, idx) => {
          historySheet += `[${check.date}] Checked by: ${check.checkedBy || "Staff"} | Status: ${check.status || "OK"}\n`;
        });
      }

      if (logsFolder) {
        logsFolder.file(`${hStamp}_maintenance_history.txt`, historySheet);
      }
    });

    // Generate zip blob and trigger client download
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ruabon_farm_herd_archive_${stamp}.zip`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("ZIP Generation failed:", err);
    alert("An error occurred while building the ZIP archive. Falling back to simple CSV download.");
    
    // Fallback: simple CSV download
    const csvContent = generateHerdCSV(horses, todayStr);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `horsesense_herd_fallback_${todayStr.replace(/-/g, "")}.csv`;
    link.click();
  }
}

export const downloadHerdCSV = downloadHerdZip;
