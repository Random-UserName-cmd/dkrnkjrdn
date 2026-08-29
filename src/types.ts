export interface Horse {
  id: string;
  name: string;
  breed: string;
  age: number;
  gender: "Mare" | "Gelding" | "Stallion";
  color: string;
  photoUrl?: string;
  brandingDate?: string;
  brandingDescription?: string;
  brandingLocation?: string;
  brandLeft?: string;
  brandRight?: string;
  ottbPassport?: string;
  lastShoeingDate?: string;
  shoeingIntervalWeeks?: number; // default is 6
  lastVetDate?: string;
  lastVetNotes?: string;
  nextVetDueDate?: string;
  lastDewormingDate?: string;
  lastDentalDate?: string;
  // Extra detailed fields requested by user
  raceName?: string;
  microchipNumber?: string;
  heightHands?: string;
  weightLbs?: string;
  ownerName?: string;
  ownerPhone?: string;
  feedRequirements?: string;
  activeMedications?: string;
  temperament?: string;
  stableNumber?: string;
  paddock?: string;
  useClassification?: string;
  tags?: string[];
  agistedHorse?: boolean;
  dob?: string;
  farmName?: string;
  farmId?: string;
  createdAt: string;
  updatedAt: string;
  lastCheckedDate?: string;
  lastCheckedBy?: string;
  lastCheckedStatus?: string;
  dailyChecksHistory?: DailyCheckRecord[];
}

export interface DailyCheckRecord {
  id: string;
  date: string;
  checkedBy: string;
  checkedAt: string;
  status: string;
}

export type MaintenanceType = "shoeing" | "branding" | "vet" | "deworming" | "dental" | "vaccination" | "medication" | "grooming" | "other";

export interface MaintenanceLog {
  id: string;
  horseId: string;
  horseName: string;
  type: MaintenanceType;
  date: string;
  notes: string;
  performedBy: string;
  cost: number;
  nextDueDate?: string;
  createdAt: string;
  loggedBy?: string;
}

export interface FarmTask {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  createdAt: string;
  assignedTo?: string; // "Everyone" or specific user's name
  status: "pending" | "completed";
  completedBy?: string;
  completedAt?: string;
  completionDescription?: string;
  priority?: "Low" | "Medium" | "High" | "Critical";
  farmName?: string;
  farmId?: string;
}

export type RanchTask = FarmTask;

export interface AppNotification {
  id: string;
  horseId: string;
  horseName: string;
  type: "shoeing_due" | "vet_due" | "deworming_due" | "login_activity" | "custom";
  message: string;
  dueDate: string;
  status: "unread" | "read" | "dismissed";
  createdAt: string;
}

export type UserRole = "owner" | "admin" | "user" | "visitor";

export interface SystemUser {
  name: string;
  pin: string;
  role: UserRole;
  avatarColor: string;
  theme?: "light" | "dark";
  title?: string;
  dob?: string;
  acctTier?: string;
  isPasskeyLogin?: boolean;
  isScanOnly?: boolean;
  email?: string;
  emailAlertsEnabled?: boolean;
  emailAlertsFrequency?: "day" | "week" | "custom";
  emailAlertsTypes?: string[];
  emailAlertsCustomDays?: number;
  visitorCode?: string;
  badgeTheme?: "emerald" | "leather" | "midnight" | "sunset" | "gold";
  frameStyle?: "standard" | "classic" | "tech" | "minimal";
  customSubtitle?: string;
  customLayout?: "vertical" | "horizontal";
  showVisitorCode?: boolean;
  bio?: string;
  passwordLastChanged?: string;
  mustChangePassword?: boolean;
  tempPasswordSource?: string;
  hasCustomPin?: boolean;
  hasSeenTutorial?: boolean;
  isAgistorRider?: boolean;
  canLogMaintenance?: boolean;
  canLogDailyChecks?: boolean;
  assistedAccessMode?: boolean;
  vibrationIntensity?: "low" | "medium" | "high";
  badges?: string[];
  farmName?: string;
  farmId?: string;
  farmLivestockType?: string;
  isTenantOwner?: boolean;
}

export type WarningType = "Fence" | "Hazard" | "Animal" | "Equipment" | "Water" | "Other";
export type WarningSeverity = "Low" | "Medium" | "High" | "Critical";

export interface FarmWarning {
  id: string;
  type: WarningType;
  title: string;
  description: string;
  severity: WarningSeverity;
  lat: number;
  lng: number;
  status: "pending" | "resolved";
  createdBy: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  farmName?: string;
  farmId?: string;
}

export type RanchWarning = FarmWarning;

export interface RideLog {
  id: string;
  horseId: string;
  horseName: string;
  riderName: string;
  date: string;
  durationMinutes: number;
  intensity: "light" | "medium" | "hard";
  notes: string;
  createdAt: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  popular?: boolean;
  maxHorses: string;
  features: string[];
  isPayPerHorse?: boolean;
  unit?: string;
}

export interface RegisteredFarm {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  farmAddress?: string;
  plan: string;
  livestockType?: string;
  createdAt: string;
  activationTime?: string;
  licenseToken?: string;
  status: "active" | "pending_activation" | "trial" | "suspended";
  logoUrl?: string;
}

