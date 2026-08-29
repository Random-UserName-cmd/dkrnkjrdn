import { Horse, AppNotification } from "../types";

/**
 * Parses date string in YYYY-MM-DD or standard ISO format.
 */
export function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Returns date string in YYYY-MM-DD format.
 */
export function formatDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Add weeks to a YYYY-MM-DD date.
 */
export function addWeeks(dateStr: string, weeks: number): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + (weeks * 7));
  return formatDateString(date);
}

/**
 * Get difference in days between two YYYY-MM-DD dates.
 */
export function getDaysDiff(dateStr1: string, dateStr2: string): number {
  const d1 = parseDate(dateStr1);
  const d2 = parseDate(dateStr2);
  
  // Set times to midnight to calculate purely calendar days
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  
  const diffTime = d1.getTime() - d2.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate shoeing status for a horse.
 */
export interface ShoeingStatus {
  dueDate: string;
  daysRemaining: number;
  status: "good" | "warning" | "overdue";
  statusText: string;
}

export function getShoeingStatus(horse: Horse, todayStr: string): ShoeingStatus | null {
  if (!horse.lastShoeingDate) return null;
  const interval = horse.shoeingIntervalWeeks || 6;
  const dueDate = addWeeks(horse.lastShoeingDate, interval);
  const daysRemaining = getDaysDiff(dueDate, todayStr);
  
  let status: "good" | "warning" | "overdue" = "good";
  let statusText = `${daysRemaining} days left`;
  
  if (daysRemaining < 0) {
    status = "overdue";
    statusText = `Overdue by ${Math.abs(daysRemaining)} days`;
  } else if (daysRemaining <= 7) {
    status = "warning";
    statusText = `Due in ${daysRemaining} days`;
  } else {
    statusText = `Due in ${daysRemaining} days`;
  }
  
  return { dueDate, daysRemaining, status, statusText };
}

/**
 * Calculate vet visit status for a horse.
 */
export interface VetStatus {
  dueDate: string;
  daysRemaining: number;
  status: "good" | "warning" | "overdue";
  statusText: string;
}

export function getVetStatus(horse: Horse, todayStr: string): VetStatus | null {
  if (!horse.nextVetDueDate) return null;
  const daysRemaining = getDaysDiff(horse.nextVetDueDate, todayStr);
  
  let status: "good" | "warning" | "overdue" = "good";
  let statusText = `Due in ${daysRemaining} days`;
  
  if (daysRemaining < 0) {
    status = "overdue";
    statusText = `Overdue by ${Math.abs(daysRemaining)} days`;
  } else if (daysRemaining <= 7) {
    status = "warning";
    statusText = `Due in ${daysRemaining} days`;
  }
  
  return { dueDate: horse.nextVetDueDate, daysRemaining, status, statusText };
}

/**
 * Generate notifications dynamically based on horse maintenance status.
 * This runs locally on app load and helps populate system notices.
 */
export function generateNotifications(horses: Horse[], todayStr: string): Omit<AppNotification, "id">[] {
  const alerts: Omit<AppNotification, "id">[] = [];

  horses.forEach((horse) => {
    // 1. Check shoeing
    const shoeing = getShoeingStatus(horse, todayStr);
    if (shoeing && (shoeing.status === "overdue" || shoeing.status === "warning")) {
      alerts.push({
        horseId: horse.id,
        horseName: horse.name,
        type: "shoeing_due",
        message: shoeing.status === "overdue" 
          ? `Shoeing is overdue for ${horse.name} (Due: ${shoeing.dueDate}, ${shoeing.statusText})`
          : `Shoeing is coming up for ${horse.name} (Due: ${shoeing.dueDate}, ${shoeing.statusText})`,
        dueDate: shoeing.dueDate,
        status: "unread",
        createdAt: todayStr,
      });
    }

    // 2. Check Vet Due
    const vet = getVetStatus(horse, todayStr);
    if (vet && (vet.status === "overdue" || vet.status === "warning")) {
      alerts.push({
        horseId: horse.id,
        horseName: horse.name,
        type: "vet_due",
        message: vet.status === "overdue"
          ? `Vet visit is overdue for ${horse.name} (Due: ${vet.dueDate}, ${vet.statusText})`
          : `Vet visit is scheduled soon for ${horse.name} (Due: ${vet.dueDate}, ${vet.statusText})`,
        dueDate: vet.dueDate,
        status: "unread",
        createdAt: todayStr,
      });
    }

    // 3. Check Deworming (Let's say deworming is recommended every 12 weeks/3 months)
    if (horse.lastDewormingDate) {
      const dewormDueDate = addWeeks(horse.lastDewormingDate, 12);
      const daysDiff = getDaysDiff(dewormDueDate, todayStr);
      if (daysDiff < 0) {
        alerts.push({
          horseId: horse.id,
          horseName: horse.name,
          type: "deworming_due",
          message: `Deworming is overdue for ${horse.name} (Recommended every 12 weeks. Due: ${dewormDueDate})`,
          dueDate: dewormDueDate,
          status: "unread",
          createdAt: todayStr,
        });
      } else if (daysDiff <= 7) {
        alerts.push({
          horseId: horse.id,
          horseName: horse.name,
          type: "deworming_due",
          message: `Deworming due soon for ${horse.name} (Due: ${dewormDueDate})`,
          dueDate: dewormDueDate,
          status: "unread",
          createdAt: todayStr,
        });
      }
    }
  });

  return alerts;
}
