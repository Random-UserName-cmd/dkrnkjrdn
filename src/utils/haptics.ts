/**
 * Herd Farm Management vibration haptics utility.
 * Integrates navigator.vibrate with configurable user preferences.
 */

export type HapticType = "tap" | "success" | "error" | "warning";

export function triggerHaptic(type: HapticType) {
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    // Default to true unless explicitly disabled
    const isEnabled = localStorage.getItem("horsesense_haptics_enabled") !== "false";
    if (!isEnabled) {
      return;
    }

    try {
      switch (type) {
        case "tap":
          navigator.vibrate(20);
          break;
        case "success":
          // Short double pulse
          navigator.vibrate([50, 30, 50]);
          break;
        case "warning":
          // Medium single pulse
          navigator.vibrate(75);
          break;
        case "error":
          // Long heavy rumble
          navigator.vibrate([150, 50, 150]);
          break;
      }
    } catch (e) {
      console.warn("Haptics vibration failed or blocked by context:", e);
    }
  }
}
