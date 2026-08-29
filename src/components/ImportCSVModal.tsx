import React, { useState, useRef } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Horse, SystemUser } from "../types";
import { X, Check, AlertCircle, Sparkles, Upload, FileSpreadsheet, Loader2, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getPlanHorseLimit } from "../utils/planLimits";

interface ImportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayStr: string;
  currentUser?: SystemUser | null;
  horsesCount?: number;
  farmPlan?: string;
}

interface ParsedHorse {
  name: string;
  breed: string;
  age: number;
  gender: "Mare" | "Gelding" | "Stallion";
  color: string;
  brandingDescription?: string;
  brandingLocation?: string;
  brandingDate?: string;
  lastShoeingDate?: string;
  shoeingIntervalWeeks?: number;
  lastVetDate?: string;
  lastVetNotes?: string;
  nextVetDueDate?: string;
  lastDewormingDate?: string;
  lastDentalDate?: string;
  microchipNumber?: string;
  heightHands?: string;
  weightLbs?: string;
  ownerName?: string;
  ownerPhone?: string;
  feedRequirements?: string;
  activeMedications?: string;
  temperament?: string;
  stableNumber?: string;
  useClassification?: string;
  raceName?: string;
  brandLeft?: string;
  brandRight?: string;
  ottbPassport?: string;
  isValid: boolean;
  errors: string[];
}

const headerMapping: { [key: string]: string } = {
  "horse name": "name",
  "name": "name",
  "breed": "breed",
  "age": "age",
  "gender": "gender",
  "color": "color",
  "ranch brand description": "brandingDescription",
  "farm brand description": "brandingDescription",
  "brand description": "brandingDescription",
  "branding description": "brandingDescription",
  "brand location": "brandingLocation",
  "branding location": "brandingLocation",
  "branding date": "brandingDate",
  "last shoeing date": "lastShoeingDate",
  "shoeing interval (weeks)": "shoeingIntervalWeeks",
  "shoeing interval": "shoeingIntervalWeeks",
  "shoeingintervalweeks": "shoeingIntervalWeeks",
  "last vet date": "lastVetDate",
  "next vet due date": "nextVetDueDate",
  "last deworming date": "lastDewormingDate",
  "last dental date": "lastDentalDate",
  "microchip number": "microchipNumber",
  "microchip": "microchipNumber",
  "height (hands)": "heightHands",
  "height hands": "heightHands",
  "heighthands": "heightHands",
  "weight (lbs)": "weightLbs",
  "weight lbs": "weightLbs",
  "weightlbs": "weightLbs",
  "owner name": "ownerName",
  "ownername": "ownerName",
  "owner phone": "ownerPhone",
  "ownerphone": "ownerPhone",
  "feed requirements": "feedRequirements",
  "feedrequirements": "feedRequirements",
  "active medications": "activeMedications",
  "activemedications": "activeMedications",
  "temperament": "temperament",
  "stable number": "stableNumber",
  "stablenumber": "stableNumber",
  "use classification": "useClassification",
  "useclassification": "useClassification",
  "race name": "raceName",
  "registered race name": "raceName",
  "racename": "raceName",
  "brand left": "brandLeft",
  "brandleft": "brandLeft",
  "brand right": "brandRight",
  "brandright": "brandRight",
  "brand left (near side)": "brandLeft",
  "brand right (off side)": "brandRight",
  "off the track passport": "ottbPassport",
  "passport": "ottbPassport",
  "ottb passport": "ottbPassport"
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export default function ImportCSVModal({ isOpen, onClose, todayStr, currentUser, horsesCount = 0, farmPlan }: ImportCSVModalProps) {
  const planInfo = getPlanHorseLimit(farmPlan || (currentUser as any)?.farmPlan);
  const [parsedHorses, setParsedHorses] = useState<ParsedHorse[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isExceedingLimit = isFinite(planInfo.maxHorses) && (horsesCount + parsedHorses.length > planInfo.maxHorses);

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setErrorMsg("Please upload a valid CSV file (.csv)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          setErrorMsg("The uploaded file is empty.");
          return;
        }

        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        if (lines.length < 2) {
          setErrorMsg("CSV must contain a header row and at least one horse record.");
          return;
        }

        // Parse headers
        const rawHeaders = parseCSVLine(lines[0]);
        const mappedFields = rawHeaders.map(h => {
          const clean = h.trim().toLowerCase().replace(/^["']|["']$/g, "");
          return headerMapping[clean] || null;
        });

        // Verify we have basic fields or we map them fallback style
        const parsedRows: ParsedHorse[] = [];

        for (let i = 1; i < lines.length; i++) {
          const cells = parseCSVLine(lines[i]);
          // Skip empty lines
          if (cells.length === 0 || (cells.length === 1 && cells[0] === "")) continue;

          const horseData: any = {};
          
          // Map cells to fields
          mappedFields.forEach((field, index) => {
            if (field && index < cells.length) {
              let val = cells[index].replace(/^["']|["']$/g, "").trim();
              if (field === "age") {
                const num = parseInt(val, 10);
                horseData[field] = isNaN(num) ? 5 : num;
              } else if (field === "shoeingIntervalWeeks") {
                const num = parseInt(val, 10);
                horseData[field] = isNaN(num) ? 6 : num;
              } else if (field === "gender") {
                const cleanGender = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
                if (["Mare", "Gelding", "Stallion"].includes(cleanGender)) {
                  horseData[field] = cleanGender;
                } else {
                  horseData[field] = "Mare"; // default
                }
              } else {
                horseData[field] = val;
              }
            }
          });

          // Validation and Fallbacks
          const errors: string[] = [];
          const name = horseData.name || `Unnamed Row ${i}`;
          const breed = horseData.breed || "Thoroughbred";
          const age = typeof horseData.age === "number" ? horseData.age : 5;
          const gender = horseData.gender || "Mare";
          const color = horseData.color || "Chestnut";

          if (!horseData.name) {
            errors.push("Missing Horse Name (assigned placeholder)");
          }
          if (!horseData.breed) {
            errors.push("Missing Breed (assigned Thoroughbred)");
          }
          if (!horseData.color) {
            errors.push("Missing Color (assigned Chestnut)");
          }

          parsedRows.push({
            ...horseData,
            name,
            breed,
            age,
            gender,
            color,
            isValid: true, // we assign smart fallbacks so they can always be imported
            errors
          });
        }

        setParsedHorses(parsedRows);
        setErrorMsg("");
        setSuccessCount(null);
      } catch (err) {
        console.error("Error parsing CSV:", err);
        setErrorMsg("Failed to parse the CSV file. Please verify its formatting.");
      }
    };

    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (parsedHorses.length === 0) return;

    if (isExceedingLimit) {
      setErrorMsg(`Plan Limit Exceeded: Importing ${parsedHorses.length} horses would bring your total to ${horsesCount + parsedHorses.length}, exceeding your ${planInfo.planName} tier limit of ${planInfo.maxHorses} horses.`);
      return;
    }

    setIsImporting(true);
    setErrorMsg("");
    setSuccessCount(null);

    try {
      let count = 0;
      for (const ph of parsedHorses) {
        const payload: any = {
          name: ph.name,
          breed: ph.breed,
          age: ph.age,
          gender: ph.gender,
          color: ph.color,
          createdAt: todayStr,
          updatedAt: todayStr,
          farmName: currentUser?.farmName || "Ruabon Farm & Herd Center",
          farmId: currentUser?.farmId || (currentUser?.farmName ? currentUser.farmName.toLowerCase().replace(/[^a-z0-9]+/g, "_") : "ruabon_farm")
        };

        // Add optional parameters if defined
        if (ph.brandingDescription) payload.brandingDescription = ph.brandingDescription;
        if (ph.brandingLocation) payload.brandingLocation = ph.brandingLocation;
        if (ph.brandingDate) payload.brandingDate = ph.brandingDate;
        if (ph.lastShoeingDate) payload.lastShoeingDate = ph.lastShoeingDate;
        if (ph.shoeingIntervalWeeks) payload.shoeingIntervalWeeks = ph.shoeingIntervalWeeks;
        if (ph.lastVetDate) payload.lastVetDate = ph.lastVetDate;
        if (ph.lastVetNotes) payload.lastVetNotes = ph.lastVetNotes;
        if (ph.nextVetDueDate) payload.nextVetDueDate = ph.nextVetDueDate;
        if (ph.lastDewormingDate) payload.lastDewormingDate = ph.lastDewormingDate;
        if (ph.lastDentalDate) payload.lastDentalDate = ph.lastDentalDate;
        if (ph.microchipNumber) payload.microchipNumber = ph.microchipNumber;
        if (ph.raceName) payload.raceName = ph.raceName;
        if (ph.brandLeft) payload.brandLeft = ph.brandLeft;
        if (ph.brandRight) payload.brandRight = ph.brandRight;
        if (ph.ottbPassport) payload.ottbPassport = ph.ottbPassport;
        if (ph.heightHands) payload.heightHands = ph.heightHands;
        if (ph.weightLbs) payload.weightLbs = ph.weightLbs;
        if (ph.ownerName) payload.ownerName = ph.ownerName;
        if (ph.ownerPhone) payload.ownerPhone = ph.ownerPhone;
        if (ph.feedRequirements) payload.feedRequirements = ph.feedRequirements;
        if (ph.activeMedications) payload.activeMedications = ph.activeMedications;
        if (ph.temperament) payload.temperament = ph.temperament;
        if (ph.stableNumber) payload.stableNumber = ph.stableNumber;
        if (ph.useClassification) payload.useClassification = ph.useClassification;

        // 1. Add horse record
        const docRef = await addDoc(collection(db, "horses"), payload);

        // 2. Add maintenance log references if dates exist
        if (ph.lastShoeingDate) {
          await addDoc(collection(db, `horses/${docRef.id}/logs`), {
            horseId: docRef.id,
            horseName: ph.name,
            type: "shoeing",
            date: ph.lastShoeingDate,
            notes: "Initial shoeing record imported from CSV.",
            cost: 0,
            createdAt: todayStr
          });
        }

        if (ph.lastVetDate) {
          await addDoc(collection(db, `horses/${docRef.id}/logs`), {
            horseId: docRef.id,
            horseName: ph.name,
            type: "vet",
            date: ph.lastVetDate,
            notes: ph.lastVetNotes || "Initial vet record imported from CSV.",
            cost: 0,
            createdAt: todayStr
          });
        }

        if (ph.brandingDate && ph.brandingDescription) {
          await addDoc(collection(db, `horses/${docRef.id}/logs`), {
            horseId: docRef.id,
            horseName: ph.name,
            type: "branding",
            date: ph.brandingDate,
            notes: `Branding: ${ph.brandingDescription} (${ph.brandingLocation || "N/A"})`,
            cost: 0,
            createdAt: todayStr
          });
        }

        count++;
      }

      setSuccessCount(count);
      setParsedHorses([]);
    } catch (err) {
      console.error("Error importing horses:", err);
      setErrorMsg("Failed to complete CSV import database writes. Please verify connection.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 cursor-pointer text-left" 
          id="import-csv-modal"
          onClick={onClose}
        >
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350, delay: 0.05 }}
            className="bg-white rounded-3xl border border-stone-200/80 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
        
        {/* Header */}
        <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-wider text-stone-900">Import CSV Herd Records</h3>
              <p className="text-xxs font-bold text-stone-500 uppercase tracking-widest mt-0.5">Quickly register multiple horses from a spreadsheet</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-stone-400 hover:text-stone-600 hover:bg-stone-100 p-1.5 rounded-lg transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successCount !== null && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
              <Check size={16} className="text-emerald-600" />
              <span>Successfully registered {successCount} horses into your farm database from CSV!</span>
            </div>
          )}

          {parsedHorses.length === 0 ? (
            /* Upload Zone */
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center flex flex-col items-center justify-center cursor-pointer transition-all ${
                dragActive 
                  ? "border-teal-500 bg-teal-50/45" 
                  : "border-stone-200 bg-stone-50 hover:border-stone-300 hover:bg-stone-100/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="p-4 bg-white shadow-2xs rounded-full text-teal-600 mb-4 border border-stone-150">
                <Upload size={28} />
              </div>
              <h4 className="text-sm font-bold text-stone-900">Drag & Drop your CSV file here</h4>
              <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto">
                Or click to browse your files. Your file should have column headers like "Horse Name", "Breed", "Age", "Gender", and "Color".
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-xxs font-bold text-teal-700 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-100 uppercase tracking-wider">
                <Sparkles size={11} /> Supports custom & Nova Herd exports
              </div>
            </div>
          ) : (
            /* Preview parsed horses */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1.5 border-b border-stone-150">
                <span className="text-xs font-black text-stone-700 uppercase tracking-wider">
                  Review Parsed Horses ({parsedHorses.length} total)
                </span>
                <button
                  onClick={() => setParsedHorses([])}
                  className="text-xxs font-black text-rose-600 hover:text-rose-700 uppercase tracking-wider cursor-pointer"
                >
                  Clear & Re-upload
                </button>
              </div>

              {/* Table list preview */}
              <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white max-h-[280px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 text-[10px] font-black uppercase tracking-wider text-stone-500 border-b border-stone-150">
                      <th className="p-2.5 pl-4">Name</th>
                      <th className="p-2.5">Breed</th>
                      <th className="p-2.5">Age</th>
                      <th className="p-2.5">Gender</th>
                      <th className="p-2.5 pr-4">Color</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-xs text-stone-700">
                    {parsedHorses.map((h, idx) => (
                      <tr key={idx} className="hover:bg-stone-50/50">
                        <td className="p-2.5 pl-4 font-bold text-stone-900">{h.name}</td>
                        <td className="p-2.5 text-stone-500 font-medium">{h.breed}</td>
                        <td className="p-2.5 text-stone-500 font-mono">{h.age} yrs</td>
                        <td className="p-2.5">
                          <span className="text-[10px] font-semibold bg-stone-100 border border-stone-200/50 px-1.5 py-0.5 rounded-md">
                            {h.gender}
                          </span>
                        </td>
                        <td className="p-2.5 pr-4 text-stone-500 font-medium">{h.color}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Warnings list if any fallbacks used */}
              {parsedHorses.some(h => h.errors.length > 0) && (
                <div className="p-3 bg-amber-50 border border-amber-100 text-amber-800 rounded-xl text-[11px] font-medium max-h-[100px] overflow-y-auto space-y-1">
                  <div className="font-bold uppercase text-amber-950 flex items-center gap-1.5 mb-1">
                    <Sparkles size={12} />
                    Auto-Correction & Mapping Notes:
                  </div>
                  {parsedHorses.filter(h => h.errors.length > 0).slice(0, 10).map((h, i) => (
                    <div key={i}>
                      • <strong>{h.name}</strong>: {h.errors.join(", ")}
                    </div>
                  ))}
                  {parsedHorses.filter(h => h.errors.length > 0).length > 10 && (
                    <div className="font-semibold text-stone-400 italic">
                      and {parsedHorses.filter(h => h.errors.length > 0).length - 10} more rows corrected.
                    </div>
                  )}
                </div>
              )}

              {isExceedingLimit && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-900 rounded-2xl flex items-start gap-3">
                  <ShieldAlert size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-bold uppercase tracking-wider">Plan Limit Exceeded</div>
                    <p className="mt-0.5">
                      Your current plan ({planInfo.planName}) supports up to <strong>{planInfo.maxHorses} horses</strong>. You currently have <strong>{horsesCount} horses</strong>. Importing {parsedHorses.length} more horses would exceed your tier limit.
                    </p>
                  </div>
                </div>
              )}

              {/* Import trigger button */}
              <button
                onClick={handleImport}
                disabled={isImporting || isExceedingLimit}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-3 rounded-xl transition-all cursor-pointer shadow-xs uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    <span>Writing records to database...</span>
                  </>
                ) : isExceedingLimit ? (
                  <>
                    <ShieldAlert size={14} />
                    <span>Import Exceeds Plan Limit ({planInfo.planName})</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Confirm Import & Save {parsedHorses.length} Horses</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer info banner */}
        <div className="p-4 bg-stone-50 border-t border-stone-100 flex items-center gap-2 text-[10px] text-stone-500 font-medium">
          <Sparkles size={13} className="text-teal-600 animate-bounce" />
          <span>Importing parses all columns into their respective fields and schedules future vet/farrier reminders.</span>
        </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
