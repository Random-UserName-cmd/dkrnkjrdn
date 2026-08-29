/**
 * Deterministic Hourly Bypass Code Generator for Cooper's Owner Panel & Lockdown Mode
 * Updated to return a single static code so it never changes.
 */
export function generateHourlyBypassCode(): string {
  // Return a single constant 15-digit code that never changes
  return "990d12d679b5777";
}

export function getMinutesUntilNextHour(): number {
  // Since code is static, return maximum time or remaining minutes of the year to indicate no rotation
  return 999999;
}
