/**
 * Utility function to format Herd Manager title based on animal herds
 */
export function formatHerdManagerTitle(livestockStr?: string): string {
  if (!livestockStr || !livestockStr.trim()) return "Herd Manager";

  const clean = livestockStr.toLowerCase();
  const herds: string[] = [];

  if (clean.includes("horse") || clean.includes("equine")) herds.push("Horses");
  if (clean.includes("cattle") || clean.includes("cow")) herds.push("Cattle");
  if (clean.includes("sheep") || clean.includes("lamb")) herds.push("Sheep");
  if (clean.includes("goat")) herds.push("Goats");
  if (clean.includes("alpaca") || clean.includes("llama")) herds.push("Alpacas");
  if (clean.includes("pig") || clean.includes("swine")) herds.push("Pigs");
  if (clean.includes("poultry") || clean.includes("fowl") || clean.includes("chicken")) herds.push("Poultry");

  if (herds.length === 0) {
    const rawClean = livestockStr.replace(/[^a-zA-Z\s,&]/g, "").trim();
    return rawClean ? `${rawClean} Herd Manager` : "Herd Manager";
  }

  if (herds.length === 1) return `${herds[0]} Herd Manager`;
  if (herds.length === 2) return `${herds[0]} & ${herds[1]} Herd Manager`;

  const last = herds.pop();
  return `${herds.join(", ")} & ${last} Herd Manager`;
}
