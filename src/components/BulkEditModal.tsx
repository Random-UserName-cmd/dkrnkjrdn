import React, { useState } from "react";
import { doc, updateDoc, deleteDoc, arrayUnion } from "firebase/firestore";
import { db, logAuditAction } from "../firebase";
import { Horse, SystemUser } from "../types";
import { X, Check, AlertCircle, Sparkles, Sliders, Plus, Trash, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  horses: Horse[];
  todayStr: string;
  currentUser: SystemUser | null;
  presetTags?: string[];
}

type EditableField = 
  | "breed" 
  | "age" 
  | "gender" 
  | "color" 
  | "shoeingIntervalWeeks" 
  | "lastShoeingDate" 
  | "nextVetDueDate" 
  | "ownerName" 
  | "ownerPhone" 
  | "useClassification" 
  | "temperament" 
  | "tags" 
  | "delete";

const fieldLabels: Record<EditableField, string> = {
  breed: "Breed (e.g. Thoroughbred)",
  age: "Age (Years)",
  gender: "Gender (Mare/Gelding/Stallion)",
  color: "Color (e.g. Chestnut)",
  shoeingIntervalWeeks: "Farrier Shoeing Interval (Weeks)",
  lastShoeingDate: "Last Shoeing Date",
  nextVetDueDate: "Next Vet Due Date",
  ownerName: "Owner Name",
  ownerPhone: "Owner Phone",
  useClassification: "Use Classification",
  temperament: "Temperament Rating (1-10)",
  tags: "Profile Tags",
  delete: "DELETE SELECTED HORSES",
};

export default function BulkEditModal({ isOpen, onClose, horses, todayStr, currentUser, presetTags }: BulkEditModalProps) {
  const commonTags = presetTags || [
    "Lessons", 
    "Therapy", 
    "Spooky", 
    "Beginner Safe", 
    "Advanced", 
    "Rehab", 
    "Trail", 
    "Spell", 
    "Farrier Overdue", 
    "Agistment",
    "aggistor horse"
  ];

  const handleSaveAsPreset = async (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    try {
      await updateDoc(doc(db, "ranch_settings", "presets"), {
        tags: arrayUnion(trimmed)
      });
    } catch (e) {
      console.error("Error saving preset tag:", e);
    }
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeFields, setActiveFields] = useState<EditableField[]>(["breed"]);
  
  // Form values
  const [breedVal, setBreedVal] = useState("");
  const [ageVal, setAgeVal] = useState<number>(5);
  const [genderVal, setGenderVal] = useState<"Mare" | "Gelding" | "Stallion">("Mare");
  const [colorVal, setColorVal] = useState("");
  const [shoeingIntervalVal, setShoeingIntervalVal] = useState<number>(6);
  const [lastShoeingDateVal, setLastShoeingDateVal] = useState(todayStr);
  const [nextVetDueDateVal, setNextVetDueDateVal] = useState(todayStr);
  const [ownerNameVal, setOwnerNameVal] = useState("");
  const [ownerPhoneVal, setOwnerPhoneVal] = useState("");
  
  // New properties values
  const [useClassificationVal, setUseClassificationVal] = useState("Therapy");
  const [temperamentVal, setTemperamentVal] = useState("5");
  const [bulkTagsVal, setBulkTagsVal] = useState<string[]>([]);
  const [newBulkTagInput, setNewBulkTagInput] = useState("");

  const [isUpdating, setIsUpdating] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [lastActionWasDelete, setLastActionWasDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Filters and Sorting for Step 1
  const [filterName, setFilterName] = useState("");
  const [filterPaddock, setFilterPaddock] = useState("");
  const [filterBreed, setFilterBreed] = useState("");
  const [filterGender, setFilterGender] = useState("");
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "paddock-asc" | "paddock-desc">("name-asc");

  // Derive filterable values
  const uniquePaddocks = Array.from(new Set(horses.map(h => h.stableNumber).filter(Boolean))) as string[];
  const uniqueBreeds = Array.from(new Set(horses.map(h => h.breed).filter(Boolean))) as string[];

  const filteredHorses = horses.filter(h => {
    const nameMatch = !filterName || h.name.toLowerCase().includes(filterName.toLowerCase());
    const paddockMatch = !filterPaddock || (h.stableNumber && h.stableNumber.toLowerCase() === filterPaddock.toLowerCase());
    const breedMatch = !filterBreed || (h.breed && h.breed.toLowerCase() === filterBreed.toLowerCase());
    const genderMatch = !filterGender || h.gender === filterGender;
    return nameMatch && paddockMatch && breedMatch && genderMatch;
  });

  const sortedAndFilteredHorses = [...filteredHorses].sort((a, b) => {
    if (sortBy === "name-asc") {
      return a.name.localeCompare(b.name);
    } else if (sortBy === "name-desc") {
      return b.name.localeCompare(a.name);
    } else if (sortBy === "paddock-asc") {
      const pA = a.stableNumber || "";
      const pB = b.stableNumber || "";
      return pA.localeCompare(pB) || a.name.localeCompare(b.name);
    } else if (sortBy === "paddock-desc") {
      const pA = a.stableNumber || "";
      const pB = b.stableNumber || "";
      return pB.localeCompare(pA) || a.name.localeCompare(b.name);
    }
    return 0;
  });

  const toggleSelectHorse = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const targets = sortedAndFilteredHorses.length > 0 ? sortedAndFilteredHorses : horses;
    const targetIds = targets.map(h => h.id);
    const allSelected = targetIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !targetIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...targetIds])));
    }
  };

  const handleAddField = () => {
    const availableFields = (Object.keys(fieldLabels) as EditableField[]).filter(
      (f) => !activeFields.includes(f)
    );
    if (availableFields.length > 0) {
      // Exclude 'delete' as an automatic pick to be safe
      const nextField = availableFields.find(f => f !== "delete") || availableFields[0];
      setActiveFields([...activeFields, nextField]);
    }
  };

  const handleRemoveField = (index: number) => {
    setActiveFields(activeFields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, newField: EditableField) => {
    const updated = [...activeFields];
    updated[index] = newField;
    
    // If 'delete' is chosen, make it the sole active property for clarity and safety
    if (newField === "delete") {
      setActiveFields(["delete"]);
    } else {
      setActiveFields(updated);
    }
  };

  const handleApplyUpdates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) {
      setErrorMsg("Please select at least one horse to process.");
      return;
    }
    if (activeFields.length === 0) {
      setErrorMsg("Please add at least one property to edit.");
      return;
    }

    setIsUpdating(true);
    setErrorMsg("");
    setSuccessCount(null);
    
    const hasDelete = activeFields.includes("delete");
    setLastActionWasDelete(hasDelete);

    try {
      let count = 0;

      if (hasDelete) {
        for (const horseId of selectedIds) {
          await deleteDoc(doc(db, "horses", horseId));
          count++;
        }
        if (currentUser) {
          await logAuditAction(
            currentUser.name,
            currentUser.role,
            "modify",
            `Bulk deleted ${count} horse profiles from the system.`
          );
        }
      } else {
        // Validate active fields before pushing
        if (activeFields.includes("breed") && !breedVal.trim()) {
          setErrorMsg("Please provide a valid breed name.");
          setIsUpdating(false);
          return;
        }
        if (activeFields.includes("color") && !colorVal.trim()) {
          setErrorMsg("Please provide a valid color description.");
          setIsUpdating(false);
          return;
        }
        if (activeFields.includes("ownerName") && !ownerNameVal.trim()) {
          setErrorMsg("Please provide an owner contact name.");
          setIsUpdating(false);
          return;
        }

        // Build dynamic update payload
        const updatePayload: any = {
          updatedAt: todayStr
        };

        for (const field of activeFields) {
          if (field === "breed") updatePayload.breed = breedVal.trim();
          else if (field === "age") updatePayload.age = Number(ageVal);
          else if (field === "gender") updatePayload.gender = genderVal;
          else if (field === "color") updatePayload.color = colorVal.trim();
          else if (field === "shoeingIntervalWeeks") updatePayload.shoeingIntervalWeeks = Number(shoeingIntervalVal);
          else if (field === "lastShoeingDate") updatePayload.lastShoeingDate = lastShoeingDateVal;
          else if (field === "nextVetDueDate") updatePayload.nextVetDueDate = nextVetDueDateVal;
          else if (field === "ownerName") updatePayload.ownerName = ownerNameVal.trim();
          else if (field === "ownerPhone") updatePayload.ownerPhone = ownerPhoneVal.trim();
          else if (field === "useClassification") updatePayload.useClassification = useClassificationVal;
          else if (field === "temperament") updatePayload.temperament = temperamentVal;
          else if (field === "tags") updatePayload.tags = bulkTagsVal;
        }

        for (const horseId of selectedIds) {
          const horseRef = doc(db, "horses", horseId);
          await updateDoc(horseRef, updatePayload);
          count++;
        }

        if (currentUser) {
          const updatedPropsStr = activeFields.map(f => fieldLabels[f]).join(", ");
          await logAuditAction(
            currentUser.name,
            currentUser.role,
            "modify",
            `Bulk updated ${count} horses for properties: [${updatedPropsStr}]`
          );
        }
      }

      setSuccessCount(count);
      setSelectedIds([]);
      
      // Clear values but retain active edit properties list
      setBreedVal("");
      setColorVal("");
      setOwnerNameVal("");
      setOwnerPhoneVal("");
      setBulkTagsVal([]);
    } catch (err) {
      console.error("Error bulk updating horses:", err);
      setErrorMsg("Failed to perform bulk updates. Please verify Firestore connectivity.");
    } finally {
      setIsUpdating(false);
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
          className="fixed inset-0 bg-stone-900/60 dark:bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 cursor-pointer text-left" 
          id="bulk-edit-modal"
          onClick={onClose}
        >
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350, delay: 0.05 }}
            className="bg-white dark:bg-stone-950 rounded-3xl border border-stone-200/80 dark:border-stone-850 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
        
        {/* Header */}
        <div className="p-5 border-b border-stone-100 dark:border-stone-850 flex items-center justify-between bg-stone-50 dark:bg-stone-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 rounded-xl">
              <Sliders size={20} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-wider text-stone-900 dark:text-white">Bulk Edit Herd Manager</h3>
              <p className="text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest mt-0.5">Apply multi-property batch updates to multiple horse profiles</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-250 hover:bg-stone-100 dark:hover:bg-stone-900 p-1.5 rounded-lg transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 bg-white dark:bg-stone-950 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successCount !== null && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2">
              <Check size={16} className="text-emerald-600 dark:text-emerald-400" />
              <span>
                {lastActionWasDelete 
                  ? `Successfully deleted ${successCount} horses from your herd database!` 
                  : `Successfully applied bulk changes to ${successCount} horses in your herd database!`}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Step 1: Select Horses (Checkbox List) */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between pb-1.5 border-b border-stone-150 dark:border-stone-850">
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                  Step 1: Select Horses ({selectedIds.length} / {sortedAndFilteredHorses.length})
                </span>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xxs font-extrabold text-teal-600 hover:text-teal-700 dark:text-teal-400 uppercase tracking-wider cursor-pointer"
                >
                  {selectedIds.length === sortedAndFilteredHorses.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              {/* Custom Settings Filter & Sort Box */}
              <div className="bg-stone-50 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-850 p-3 rounded-2xl space-y-2.5">
                <div className="flex items-center gap-1.5 text-[10px] font-black text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                  <Sliders size={12} className="text-teal-600 dark:text-teal-400" />
                  <span>Filters &amp; Sorting Options</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xxs">
                  {/* Name Filter */}
                  <div className="space-y-0.5 col-span-2">
                    <label className="text-[8px] font-bold text-stone-500 uppercase tracking-wide">Search by Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Spirit..."
                      value={filterName}
                      onChange={(e) => setFilterName(e.target.value)}
                      className="w-full bg-white dark:bg-stone-950 border border-stone-250 dark:border-stone-800 rounded-lg px-2 py-1 text-xxs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-950 dark:text-white"
                    />
                  </div>

                  {/* Paddock Filter */}
                  <div className="space-y-0.5">
                    <label className="text-[8px] font-bold text-stone-500 uppercase tracking-wide">By Paddock</label>
                    <select
                      value={filterPaddock}
                      onChange={(e) => setFilterPaddock(e.target.value)}
                      className="w-full bg-white dark:bg-stone-950 border border-stone-250 dark:border-stone-800 rounded-lg px-2 py-1 text-xxs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-950 dark:text-white"
                    >
                      <option value="">All Paddocks</option>
                      {uniquePaddocks.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  {/* Sorting dropdown */}
                  <div className="space-y-0.5">
                    <label className="text-[8px] font-bold text-stone-500 uppercase tracking-wide">Sort Order</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="w-full bg-white dark:bg-stone-950 border border-stone-250 dark:border-stone-800 rounded-lg px-2 py-1 text-xxs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-950 dark:text-white"
                    >
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="name-desc">Name (Z-A)</option>
                      <option value="paddock-asc">Paddock (A-Z)</option>
                      <option value="paddock-desc">Paddock (Z-A)</option>
                    </select>
                  </div>

                  {/* Breed filter */}
                  <div className="space-y-0.5">
                    <label className="text-[8px] font-bold text-stone-500 uppercase tracking-wide">By Breed</label>
                    <select
                      value={filterBreed}
                      onChange={(e) => setFilterBreed(e.target.value)}
                      className="w-full bg-white dark:bg-stone-950 border border-stone-250 dark:border-stone-800 rounded-lg px-2 py-1 text-xxs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-950 dark:text-white"
                    >
                      <option value="">All Breeds</option>
                      {uniqueBreeds.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  {/* Gender filter */}
                  <div className="space-y-0.5">
                    <label className="text-[8px] font-bold text-stone-500 uppercase tracking-wide">By Gender</label>
                    <select
                      value={filterGender}
                      onChange={(e) => setFilterGender(e.target.value)}
                      className="w-full bg-white dark:bg-stone-950 border border-stone-250 dark:border-stone-800 rounded-lg px-2 py-1 text-xxs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-950 dark:text-white"
                    >
                      <option value="">All Genders</option>
                      <option value="Mare">Mare</option>
                      <option value="Gelding">Gelding</option>
                      <option value="Stallion">Stallion</option>
                    </select>
                  </div>
                </div>

                {/* Reset button */}
                {(filterName || filterPaddock || filterBreed || filterGender || sortBy !== "name-asc") && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterName("");
                      setFilterPaddock("");
                      setFilterBreed("");
                      setFilterGender("");
                      setSortBy("name-asc");
                    }}
                    className="w-full text-center text-[9px] text-teal-600 dark:text-teal-400 font-extrabold uppercase hover:underline py-0.5 cursor-pointer"
                  >
                    Reset Filter &amp; Sort Options
                  </button>
                )}
              </div>

              {/* Horse Selection List container */}
              <div className="border border-stone-200/60 dark:border-stone-850 rounded-2xl p-2.5 max-h-[300px] overflow-y-auto bg-stone-50/50 dark:bg-stone-900/10 space-y-1.5">
                {sortedAndFilteredHorses.length === 0 ? (
                  <div className="text-center p-6 text-stone-400 uppercase tracking-wider text-xxs font-black">
                    No horses match these criteria
                  </div>
                ) : (
                  sortedAndFilteredHorses.map((horse) => {
                    const isChecked = selectedIds.includes(horse.id);
                    return (
                      <button
                        key={horse.id}
                        type="button"
                        onClick={() => toggleSelectHorse(horse.id)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                          isChecked 
                            ? "bg-white dark:bg-stone-900 border-teal-500 dark:border-teal-600 shadow-2xs text-stone-900 dark:text-stone-100" 
                            : "bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-850 text-stone-600 dark:text-stone-400 hover:border-stone-300 dark:hover:border-stone-700"
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                          <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                            isChecked ? "bg-teal-600 border-teal-600 text-white" : "border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-850"
                          }`}>
                            {isChecked && <Check size={11} strokeWidth={3} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <strong className="font-bold truncate">{horse.name}</strong>
                              <span className="text-[8px] bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 font-extrabold px-1.5 py-0.5 rounded border border-teal-150/80 uppercase tracking-wide shrink-0">
                                Paddock: {horse.stableNumber || "Unassigned"}
                              </span>
                            </div>
                            <span className="text-xxs font-medium text-stone-400 dark:text-stone-500 block uppercase truncate">
                              {horse.breed} • {horse.gender}
                            </span>
                          </div>
                        </div>
                        <span className="text-xxs font-bold text-stone-400 dark:text-stone-300 px-1.5 py-0.5 bg-stone-50 dark:bg-stone-800 border border-stone-200/50 dark:border-stone-700 rounded-md shrink-0 ml-2">
                          {horse.color}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Step 2: Choose and Configure Updates */}
            <form onSubmit={handleApplyUpdates} className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between pb-1.5 border-b border-stone-150 dark:border-stone-850">
                <span className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider block">
                  Step 2: Choose Properties to Edit
                </span>
                <button
                  type="button"
                  onClick={handleAddField}
                  className="inline-flex items-center gap-1 text-xxs font-black text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 bg-teal-50 dark:bg-teal-950/50 border border-teal-200/50 dark:border-teal-900/50 rounded-lg px-2 py-1 transition-all cursor-pointer uppercase tracking-wider"
                >
                  <Plus size={13} strokeWidth={3} />
                  <span>Add Property</span>
                </button>
              </div>

              {/* Dynamic Property Inputs List */}
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                {activeFields.map((field, index) => (
                  <div 
                    key={index} 
                    className="bg-stone-50/50 dark:bg-stone-900/40 border border-stone-200/60 dark:border-stone-850 p-4 rounded-2xl space-y-3 relative"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <label className="block text-xxs font-black text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">
                          Property Update #{index + 1}
                        </label>
                        <select
                          value={field}
                          onChange={(e) => handleFieldChange(index, e.target.value as EditableField)}
                          className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-850 dark:text-stone-100 rounded-xl p-2.5 text-xs font-bold focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                        >
                          {(Object.keys(fieldLabels) as EditableField[]).map((key) => {
                            const isAlreadySelected = activeFields.includes(key) && activeFields[index] !== key;
                            
                            // Check role constraints for DELETE option
                            if (key === "delete") {
                              const isAuthorized = currentUser && (currentUser.role === "owner" || currentUser.role === "admin" || ["system administrator", "claire wright", "mark wright"].includes(currentUser.name.toLowerCase()));
                              if (!isAuthorized) return null;
                            }

                            return (
                              <option key={key} value={key} disabled={isAlreadySelected}>
                                {fieldLabels[key]} {isAlreadySelected ? "(Already Configured)" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {activeFields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveField(index)}
                          className="mt-5 p-2.5 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-900 cursor-pointer transition-all shrink-0 shadow-5xs"
                          title="Remove this property"
                        >
                          <Trash size={15} />
                        </button>
                      )}
                    </div>

                    {/* Property-Specific Form Component */}
                    <div className="pt-3 border-t border-stone-100 dark:border-stone-800/80">
                      {field === "delete" && (
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-start gap-2.5">
                          <AlertCircle className="shrink-0 text-rose-600 dark:text-rose-450 mt-0.5" size={16} />
                          <div>
                            <span className="font-extrabold uppercase tracking-wide block mb-0.5 text-rose-900 dark:text-rose-200">Critical Deletion warning</span>
                            This will permanently purge the {selectedIds.length} selected horse(s) and all linked diagnostics, voice-notes, and histories from Firestore.
                          </div>
                        </div>
                      )}

                      {field === "breed" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">New Breed</label>
                          <input
                            type="text"
                            placeholder="e.g., Warmblood, Quarter Horse"
                            value={breedVal}
                            onChange={(e) => setBreedVal(e.target.value)}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          />
                        </div>
                      )}

                      {field === "age" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">New Age (Years)</label>
                          <input
                            type="number"
                            min={0}
                            max={40}
                            value={ageVal}
                            onChange={(e) => setAgeVal(Number(e.target.value))}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          />
                        </div>
                      )}

                      {field === "gender" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">New Gender</label>
                          <select
                            value={genderVal}
                            onChange={(e) => setGenderVal(e.target.value as any)}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          >
                            <option value="Mare">Mare</option>
                            <option value="Gelding">Gelding</option>
                            <option value="Stallion">Stallion</option>
                          </select>
                        </div>
                      )}

                      {field === "color" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">New Color</label>
                          <input
                            type="text"
                            placeholder="e.g., Dapple Blue, Flaxen Chestnut"
                            value={colorVal}
                            onChange={(e) => setColorVal(e.target.value)}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          />
                        </div>
                      )}

                      {field === "shoeingIntervalWeeks" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">Farrier Shoeing Interval (Weeks)</label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={shoeingIntervalVal}
                            onChange={(e) => setShoeingIntervalVal(Number(e.target.value))}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          />
                        </div>
                      )}

                      {field === "lastShoeingDate" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">Last Shoeing Date</label>
                          <input
                            type="date"
                            value={lastShoeingDateVal}
                            onChange={(e) => setLastShoeingDateVal(e.target.value)}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          />
                        </div>
                      )}

                      {field === "nextVetDueDate" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">Next Vet Due Date</label>
                          <input
                            type="date"
                            value={nextVetDueDateVal}
                            onChange={(e) => setNextVetDueDateVal(e.target.value)}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          />
                        </div>
                      )}

                      {field === "ownerName" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">New Owner Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Claire Wright"
                            value={ownerNameVal}
                            onChange={(e) => setOwnerNameVal(e.target.value)}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          />
                        </div>
                      )}

                      {field === "ownerPhone" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">New Owner Phone</label>
                          <input
                            type="text"
                            placeholder="e.g. +61 491 570 156"
                            value={ownerPhoneVal}
                            onChange={(e) => setOwnerPhoneVal(e.target.value)}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          />
                        </div>
                      )}

                      {field === "useClassification" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">New Use Classification</label>
                          <select
                            value={useClassificationVal}
                            onChange={(e) => setUseClassificationVal(e.target.value)}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          >
                            <option value="Therapy">Therapy Work</option>
                            <option value="Lesson">Lesson Riding</option>
                            <option value="Training">Active Training</option>
                            <option value="Retired">Retired / Pasture</option>
                            <option value="Trail">Trail Riding</option>
                          </select>
                        </div>
                      )}

                      {field === "temperament" && (
                        <div>
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase mb-1">New Temperament Rating (1-10)</label>
                          <select
                            value={temperamentVal}
                            onChange={(e) => setTemperamentVal(e.target.value)}
                            className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-2.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                          >
                            {[...Array(10)].map((_, idx) => (
                              <option key={idx + 1} value={(idx + 1).toString()}>
                                {idx + 1} - {idx + 1 <= 3 ? "Very Calm" : idx + 1 <= 7 ? "Moderate" : "Highly Sensitive"}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {field === "tags" && (
                        <div className="space-y-2.5">
                          <label className="block text-xxs font-bold text-stone-500 dark:text-stone-400 uppercase">New Tags Configuration</label>
                          
                          {/* Selected Tags list */}
                          <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
                            {bulkTagsVal.length === 0 ? (
                              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider px-1.5 py-0.5">No tags assigned yet</span>
                            ) : (
                              bulkTagsVal.map(tag => (
                                <span 
                                  key={tag} 
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xxs font-extrabold bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200/50 dark:border-teal-900/50 rounded-md"
                                >
                                  {tag}
                                  <button
                                    type="button"
                                    onClick={() => setBulkTagsVal(bulkTagsVal.filter(t => t !== tag))}
                                    className="text-teal-400 hover:text-teal-600 font-bold cursor-pointer"
                                  >
                                    &times;
                                  </button>
                                </span>
                              ))
                            )}
                          </div>

                          {/* Preset Tags chips */}
                          <div>
                            <span className="block text-[9px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider mb-1">Preset Tags</span>
                            <div className="flex flex-wrap gap-1">
                              {commonTags.map(ct => {
                                const isSelected = bulkTagsVal.includes(ct);
                                return (
                                  <button
                                    key={ct}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setBulkTagsVal(bulkTagsVal.filter(t => t !== ct));
                                      } else {
                                        setBulkTagsVal([...bulkTagsVal, ct]);
                                      }
                                    }}
                                    className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border transition-all cursor-pointer ${
                                      isSelected
                                        ? "bg-teal-600 text-white border-teal-600 shadow-3xs"
                                        : "bg-white dark:bg-stone-850 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800"
                                    }`}
                                  >
                                    {ct}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Custom Tag Input */}
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={newBulkTagInput}
                              onChange={(e) => setNewBulkTagInput(e.target.value)}
                              placeholder="Add custom tag..."
                              className="flex-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 text-stone-800 dark:text-stone-100"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const trimmed = newBulkTagInput.trim();
                                  if (trimmed && !bulkTagsVal.includes(trimmed)) {
                                    setBulkTagsVal([...bulkTagsVal, trimmed]);
                                    setNewBulkTagInput("");
                                  }
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const trimmed = newBulkTagInput.trim();
                                  if (trimmed && !bulkTagsVal.includes(trimmed)) {
                                    setBulkTagsVal([...bulkTagsVal, trimmed]);
                                    setNewBulkTagInput("");
                                  }
                              }}
                              className="px-3 py-1 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xxs font-black uppercase rounded-lg cursor-pointer transition-all"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const trimmed = newBulkTagInput.trim();
                                if (trimmed) {
                                  if (!bulkTagsVal.includes(trimmed)) {
                                    setBulkTagsVal([...bulkTagsVal, trimmed]);
                                  }
                                  handleSaveAsPreset(trimmed);
                                  setNewBulkTagInput("");
                                }
                              }}
                              className="px-3 py-1 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-xxs font-black uppercase rounded-lg cursor-pointer transition-all whitespace-nowrap"
                              title="Save this tag as a reusable preset tag for everyone"
                            >
                              + Preset
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isUpdating || selectedIds.length === 0}
                className={`w-full text-white font-bold text-xs py-3 rounded-xl transition-all cursor-pointer shadow-xs uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                  activeFields.includes("delete") 
                    ? "bg-rose-700 hover:bg-rose-800 focus:ring-rose-500" 
                    : "bg-teal-600 hover:bg-teal-700"
                }`}
              >
                {isUpdating ? (
                  <span>{activeFields.includes("delete") ? "Deleting Selected Horses..." : "Applying Batch Changes..."}</span>
                ) : (
                  <>
                    <Check size={14} />
                    <span>
                      {activeFields.includes("delete") 
                        ? `Permanently Delete Selected (${selectedIds.length})` 
                        : `Apply ${activeFields.length} Batch Updates (${selectedIds.length})`}
                    </span>
                  </>
                )}
              </button>
            </form>

          </div>
        </div>

        {/* Footer info banner */}
        <div className="p-4 bg-stone-50 dark:bg-stone-900 border-t border-stone-100 dark:border-stone-850 flex items-center gap-2 text-[10px] text-stone-500 dark:text-stone-400 font-medium">
          <Sparkles size={13} className="text-teal-600 dark:text-teal-400 animate-bounce" />
          <span>Updates are applied immediately in Firestore and synchronized in real-time across all active tablets.</span>
        </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
