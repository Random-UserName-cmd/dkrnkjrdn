export interface PlanLimitInfo {
  maxHorses: number;
  planName: string;
  planId: string;
  description: string;
}

export const PLAN_LIMITS: Record<string, PlanLimitInfo> = {
  free: {
    planId: "free",
    planName: "Free / Community",
    maxHorses: 5,
    description: "Up to 5 horses"
  },
  starter: {
    planId: "starter",
    planName: "Paddock Starter",
    maxHorses: 15,
    description: "Up to 15 horses"
  },
  pro: {
    planId: "pro",
    planName: "Farm Professional",
    maxHorses: 50,
    description: "Up to 50 horses"
  },
  enterprise: {
    planId: "enterprise",
    planName: "Enterprise Stud",
    maxHorses: Infinity,
    description: "Unlimited horses"
  }
};

export function getPlanHorseLimit(plan?: string | null): PlanLimitInfo {
  if (!plan) {
    return PLAN_LIMITS.enterprise; // Default facility is enterprise/unlimited unless registered otherwise
  }

  const lower = plan.toLowerCase().trim();

  if (lower.includes("free") || lower.includes("community")) {
    return PLAN_LIMITS.free;
  }
  if (lower.includes("starter") || lower.includes("15")) {
    return PLAN_LIMITS.starter;
  }
  if (lower.includes("pro") || lower.includes("50")) {
    return PLAN_LIMITS.pro;
  }
  if (lower.includes("enter") || lower.includes("unlimited") || lower.includes("stud")) {
    return PLAN_LIMITS.enterprise;
  }

  // Check exact keys
  if (PLAN_LIMITS[lower]) {
    return PLAN_LIMITS[lower];
  }

  return PLAN_LIMITS.free;
}
