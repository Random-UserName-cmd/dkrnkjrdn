import React, { useState } from "react";
import { db, handleFirestoreError, OperationType, logAuditAction } from "../firebase";
import { collection, addDoc, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { Horse, SystemUser } from "../types";
import { X, Save, Hammer, Stethoscope, Award, Info, Heart, Search, Sparkles, Database, Check, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getPlanHorseLimit } from "../utils/planLimits";

interface AddHorseModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayStr: string;
  currentUser?: SystemUser | null;
  existingPaddocks?: string[];
  presetTags?: string[];
  horsesCount?: number;
  farmPlan?: string;
}

export default function AddHorseModal({ isOpen, onClose, todayStr, currentUser, existingPaddocks, presetTags, horsesCount = 0, farmPlan }: AddHorseModalProps) {
  const planInfo = getPlanHorseLimit(farmPlan || (currentUser as any)?.farmPlan);
  const isLimitReached = isFinite(planInfo.maxHorses) && horsesCount >= planInfo.maxHorses;
  const [formData, setFormData] = useState({
    name: "",
    breed: "",
    age: "",
    gender: "Mare",
    color: "",
    brandingDescription: "",
    brandingLocation: "",
    brandLeft: "",
    brandRight: "",
    ottbPassport: "",
    raceName: "",
    brandingDate: "",
    lastShoeingDate: "",
    shoeingIntervalWeeks: "6",
    lastVetDate: "",
    lastVetNotes: "",
    nextVetDueDate: "",
    lastDewormingDate: "",
    lastDentalDate: "",
    // Extra fields
    microchipNumber: "",
    heightHands: "",
    weightLbs: "",
    ownerName: "Wright Farm",
    ownerPhone: "+61 491 570 156",
    feedRequirements: "",
    activeMedications: "",
    temperament: "",
    stableNumber: "",
    useClassification: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [dob, setDob] = useState("");
  const [agistedHorse, setAgistedHorse] = useState(false);
  const commonTags = presetTags || ["Competition", "Retired", "Foal", "Therapy", "Training", "Rescue", "Breeding", "aggistor horse"];

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      setErrorMsg("Horse Name is required.");
      return;
    }

    if (isLimitReached) {
      setErrorMsg(`Plan Limit Reached: Your current plan (${planInfo.planName}) allows up to ${planInfo.maxHorses} horses. You currently have ${horsesCount} horses registered.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const compositeDescription = formData.brandingDescription || 
        (formData.brandLeft || formData.brandRight ? 
          `Left: ${formData.brandLeft || 'None'} | Right: ${formData.brandRight || 'None'}` : "");

      const finalTags = [...tags];
      if (agistedHorse && !finalTags.includes("aggistor horse")) {
        finalTags.push("aggistor horse");
      }

      const payload: Omit<Horse, "id"> = {
        name: formData.name,
        breed: formData.breed || "Unknown Breed",
        age: Number(formData.age) || 0,
        gender: formData.gender as "Mare" | "Gelding" | "Stallion",
        color: formData.color || "Unknown Color",
        brandingDescription: compositeDescription,
        brandingLocation: formData.brandingLocation || "N/A",
        brandLeft: formData.brandLeft || undefined,
        brandRight: formData.brandRight || undefined,
        ottbPassport: formData.ottbPassport || undefined,
        raceName: formData.raceName || undefined,
        brandingDate: formData.brandingDate || undefined,
        lastShoeingDate: formData.lastShoeingDate || undefined,
        shoeingIntervalWeeks: Number(formData.shoeingIntervalWeeks) || 6,
        lastVetDate: formData.lastVetDate || undefined,
        lastVetNotes: formData.lastVetNotes || undefined,
        nextVetDueDate: formData.nextVetDueDate || undefined,
        lastDewormingDate: formData.lastDewormingDate || undefined,
        lastDentalDate: formData.lastDentalDate || undefined,
        microchipNumber: formData.microchipNumber || undefined,
        heightHands: formData.heightHands || undefined,
        weightLbs: formData.weightLbs || undefined,
        ownerName: formData.ownerName || undefined,
        ownerPhone: formData.ownerPhone || undefined,
        feedRequirements: formData.feedRequirements || undefined,
        activeMedications: formData.activeMedications || undefined,
        temperament: formData.temperament || undefined,
        stableNumber: formData.stableNumber || undefined,
        useClassification: formData.useClassification || undefined,
        tags: finalTags.length > 0 ? finalTags : undefined,
        agistedHorse: agistedHorse,
        dob: dob || undefined,
        createdAt: todayStr,
        updatedAt: todayStr,
        farmName: currentUser?.farmName || "Ruabon Farm & Herd Center",
        farmId: currentUser?.farmId || (currentUser?.farmName ? currentUser.farmName.toLowerCase().replace(/[^a-z0-9]+/g, "_") : "ruabon_farm"),
      };

      // 1. Add horse to 'horses' collection
      const docRef = await addDoc(collection(db, "horses"), payload);

      // 2. Also log initial actions as historical records if dates were provided!
      // This is a beautiful feature! If a user registers a horse with 'lastShoeingDate',
      // we auto-generate a maintenance log so the owner sees a complete chronological history instantly!
      if (formData.lastShoeingDate) {
        await addDoc(collection(db, `horses/${docRef.id}/logs`), {
          horseId: docRef.id,
          horseName: formData.name,
          type: "shoeing",
          date: formData.lastShoeingDate,
          notes: "Initial shoeing registration record.",
          performedBy: "System Registration",
          cost: 0,
          nextDueDate: formData.lastShoeingDate ? todayStr : "", // placeholder
          createdAt: todayStr
        });
      }

      if (formData.lastVetDate) {
        await addDoc(collection(db, `horses/${docRef.id}/logs`), {
          horseId: docRef.id,
          horseName: formData.name,
          type: "vet",
          date: formData.lastVetDate,
          notes: formData.lastVetNotes || "Initial registered vet visit.",
          performedBy: "System Registration",
          cost: 0,
          nextDueDate: formData.nextVetDueDate || "",
          createdAt: todayStr
        });
      }

      if (formData.brandingDate && formData.brandingDescription) {
        await addDoc(collection(db, `horses/${docRef.id}/logs`), {
          horseId: docRef.id,
          horseName: formData.name,
          type: "branding",
          date: formData.brandingDate,
          notes: `Branding: ${formData.brandingDescription} (${formData.brandingLocation || "N/A"})`,
          performedBy: "System Registration",
          cost: 0,
          createdAt: todayStr
        });
      }

      if (currentUser) {
        logAuditAction(currentUser.name, currentUser.role, "modify", `Registered a new horse: ${formData.name}`);
      }

      // Reset Form and close
      setFormData({
        name: "",
        breed: "",
        age: "",
        gender: "Mare",
        color: "",
        brandingDescription: "",
        brandingLocation: "",
        brandLeft: "",
        brandRight: "",
        ottbPassport: "",
        raceName: "",
        brandingDate: "",
        lastShoeingDate: "",
        shoeingIntervalWeeks: "6",
        lastVetDate: "",
        lastVetNotes: "",
        nextVetDueDate: "",
        lastDewormingDate: "",
        lastDentalDate: "",
        microchipNumber: "",
        heightHands: "",
        weightLbs: "",
        ownerName: "Wright Farm",
        ownerPhone: "+61 491 570 156",
        feedRequirements: "",
        activeMedications: "",
        temperament: "",
        stableNumber: "",
        useClassification: "",
      });
      setTags([]);
      setNewTagInput("");
      onClose();
    } catch (err: any) {
      console.error("Error creating horse profile:", err);
      setErrorMsg(`Failed to save horse profile: ${err.message || "Please check connection"}`);
      // Pass the error to the diagnostics system as required by the firebase-integration skill
      try {
        handleFirestoreError(err, OperationType.CREATE, "horses");
      } catch (wrappedErr) {
        // Continue after throwing/logging
      }
    } finally {
      setIsSubmitting(false);
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto cursor-pointer text-left" 
          id="add-horse-modal-backdrop"
          onClick={onClose}
        >
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 350, delay: 0.05 }}
            id="add-horse-modal-card"
            className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-2xl overflow-hidden my-8 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
        {/* Header */}
        <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="text-xl font-bold text-stone-900">Add New Horse Profile</h2>
            <p className="text-xs text-stone-500 font-medium">Create a tracking record for a new herd member</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {isLimitReached && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-900">
              <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">Farm Plan Capacity Reached</h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  Your current tier ({planInfo.planName}) supports up to <strong>{planInfo.maxHorses} horses</strong>. You currently have <strong>{horsesCount} horses</strong> in this farm. Please upgrade to a higher plan (Starter, Pro, or Enterprise Stud) to register additional horses.
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-medium">
              {errorMsg}
            </div>
          )}

          {/* Core Info Section */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider">1. Basic Horse Profile</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Horse Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Maverick, Spirit"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Registered Racing Name</label>
                <input
                  type="text"
                  name="raceName"
                  value={formData.raceName}
                  onChange={handleChange}
                  placeholder="e.g. Black Caviar"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Breed</label>
                <input
                  type="text"
                  name="breed"
                  value={formData.breed}
                  onChange={handleChange}
                  placeholder="e.g. Quarter Horse, Thoroughbred"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Gender</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                >
                  <option value="Mare">Mare (Female)</option>
                  <option value="Gelding">Gelding (Castrated Male)</option>
                  <option value="Stallion">Stallion (Intact Male)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Color / Coat</label>
                <input
                  type="text"
                  name="color"
                  value={formData.color}
                  onChange={handleChange}
                  placeholder="e.g. Bay, Chestnut, Palomino"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Age (Years)</label>
                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleChange}
                  min="0"
                  max="50"
                  placeholder="e.g. 8"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Date of Birth (DOB)</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Agisted Horse</label>
                <select
                  value={agistedHorse ? "yes" : "no"}
                  onChange={(e) => setAgistedHorse(e.target.value === "yes")}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium bg-stone-50 text-stone-800"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes (Is Agister Horse)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Paddock / Stable Location</label>
                <input
                  type="text"
                  name="stableNumber"
                  list="paddock-suggestions"
                  value={formData.stableNumber}
                  onChange={handleChange}
                  placeholder="e.g. Barn A, Stall 4"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
                <datalist id="paddock-suggestions">
                  {(existingPaddocks || []).map(p => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Owner Contact Name</label>
                <input
                  type="text"
                  name="ownerName"
                  value={formData.ownerName}
                  onChange={handleChange}
                  placeholder="e.g. Wright Farm"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Owner Contact Phone</label>
                <input
                  type="text"
                  name="ownerPhone"
                  value={formData.ownerPhone}
                  onChange={handleChange}
                  placeholder="e.g. +61 491 570 156"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium font-semibold"
                />
              </div>

              {/* Profile Tags Section */}
              <div className="col-span-1 md:col-span-2 pt-2">
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                  Horse Profile Tags
                </label>
                
                {/* Selected Tags list */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {tags.length === 0 ? (
                    <span className="text-stone-400 text-xs italic">No tags assigned yet. Select from presets below or add a custom tag.</span>
                  ) : (
                    tags.map(t => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200/50 rounded-lg shadow-5xs"
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() => setTags(tags.filter(tag => tag !== t))}
                          className="text-teal-400 hover:text-teal-600 transition-colors shrink-0 cursor-pointer text-sm font-bold"
                        >
                          &times;
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Preset Chips */}
                <div className="mb-3">
                  <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">Preset Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {commonTags.map(ct => {
                      const isSelected = tags.includes(ct);
                      return (
                        <button
                          key={ct}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setTags(tags.filter(t => t !== ct));
                            } else {
                              setTags([...tags, ct]);
                            }
                          }}
                          className={`text-xxs font-black uppercase px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer shadow-5xs ${
                            isSelected
                              ? "bg-teal-600 text-white border-teal-600"
                              : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                          }`}
                        >
                          {ct}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom tag input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="Enter a custom tag... (e.g. Stud, Hospital)"
                    className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const trimmed = newTagInput.trim();
                        if (trimmed && !tags.includes(trimmed)) {
                          setTags([...tags, trimmed]);
                          setNewTagInput("");
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = newTagInput.trim();
                      if (trimmed && !tags.includes(trimmed)) {
                        setTags([...tags, trimmed]);
                        setNewTagInput("");
                      }
                    }}
                    className="px-3 py-2 bg-stone-150 hover:bg-stone-200 border border-stone-250 text-stone-700 text-xs font-black rounded-xl cursor-pointer transition-colors"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = newTagInput.trim();
                      if (trimmed) {
                        if (!tags.includes(trimmed)) {
                          setTags([...tags, trimmed]);
                        }
                        handleSaveAsPreset(trimmed);
                        setNewTagInput("");
                      }
                    }}
                    className="px-3 py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 text-xs font-black rounded-xl cursor-pointer transition-colors whitespace-nowrap"
                    title="Save this tag as a reusable preset tag for everyone"
                  >
                    + Preset
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Branding Details */}
          <div className="space-y-4 pt-4 border-t border-stone-100">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
              <Award size={14} className="text-teal-600" /> 2. Farm Identity / Branding Marks
            </h3>

            {/* Near Side / Off Side Note */}
            <div className="bg-amber-50/70 border border-amber-200/50 rounded-xl px-3.5 py-2.5 flex items-start gap-2.5">
              <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xxs text-amber-900 font-semibold leading-relaxed">
                <span className="font-bold block text-amber-950 uppercase tracking-wider mb-0.5">Anatomical Side Conventions</span>
                The horse's <span className="underline">LEFT SIDE is the NEAR SIDE</span> (traditional mounting side), and the horse's <span className="underline">RIGHT SIDE is the OFF SIDE</span>.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Brand on Left Side / Near Side (e.g. Left Shoulder)</label>
                <input
                  type="text"
                  name="brandLeft"
                  value={formData.brandLeft}
                  onChange={handleChange}
                  placeholder="e.g. Lazy Double J, Left Shoulder"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Brand on Right Side / Off Side (e.g. Right Hip)</label>
                <input
                  type="text"
                  name="brandRight"
                  value={formData.brandRight}
                  onChange={handleChange}
                  placeholder="e.g. Chevron under Bar, Right Hip"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Other Brand description (Legacy)</label>
                <input
                  type="text"
                  name="brandingDescription"
                  value={formData.brandingDescription}
                  onChange={handleChange}
                  placeholder="e.g. Overall description or additional tattoos"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Brand Location on Horse</label>
                <input
                  type="text"
                  name="brandingLocation"
                  value={formData.brandingLocation}
                  onChange={handleChange}
                  placeholder="e.g. Left shoulder, Right hip"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Date Branded</label>
                <input
                  type="date"
                  name="brandingDate"
                  value={formData.brandingDate}
                  onChange={handleChange}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Thoroughbred & Identification Registry Section */}
          <div className="space-y-4 pt-4 border-t border-stone-100">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
              <Award size={14} className="text-amber-700" /> 3. Thoroughbred & Identification Registry
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Microchip Number</label>
                <input
                  type="text"
                  name="microchipNumber"
                  value={formData.microchipNumber}
                  onChange={handleChange}
                  placeholder="e.g. 981021002341232"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Off the Track Passport # (OTTB)</label>
                <input
                  type="text"
                  name="ottbPassport"
                  value={formData.ottbPassport}
                  onChange={handleChange}
                  placeholder="e.g. OTTB-2015-84"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Shoeing Setup */}
          <div className="space-y-4 pt-4 border-t border-stone-100">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
              <Hammer size={14} className="text-teal-600" /> 3. Farrier & Shoeing Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Last Shoeing Date</label>
                <input
                  type="date"
                  name="lastShoeingDate"
                  value={formData.lastShoeingDate}
                  onChange={handleChange}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Shoeing/Hoof Interval (Weeks)</label>
                <input
                  type="number"
                  name="shoeingIntervalWeeks"
                  value={formData.shoeingIntervalWeeks}
                  onChange={handleChange}
                  min="1"
                  max="52"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Vet Setup */}
          <div className="space-y-4 pt-4 border-t border-stone-100">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
              <Stethoscope size={14} className="text-rose-700" /> 4. Veterinary & Wellness Setup
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Last Veterinary Visit</label>
                <input
                  type="date"
                  name="lastVetDate"
                  value={formData.lastVetDate}
                  onChange={handleChange}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Next Scheduled Vet Visit</label>
                <input
                  type="date"
                  name="nextVetDueDate"
                  value={formData.nextVetDueDate}
                  onChange={handleChange}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-stone-700 mb-1">Last Vet Visit Notes</label>
                <textarea
                  name="lastVetNotes"
                  value={formData.lastVetNotes}
                  onChange={handleChange}
                  placeholder="e.g. Vaccinations and dental float"
                  rows={2}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Other Milestones */}
          <div className="space-y-4 pt-4 border-t border-stone-100">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
              <Heart size={14} className="text-sky-700" /> 5. Other Preventive Milestones
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Last Deworming Date</label>
                <input
                  type="date"
                  name="lastDewormingDate"
                  value={formData.lastDewormingDate}
                  onChange={handleChange}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Last Dental floating Date</label>
                <input
                  type="date"
                  name="lastDentalDate"
                  value={formData.lastDentalDate}
                  onChange={handleChange}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-teal-600 focus:border-teal-600 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-6 border-t border-stone-100 flex items-center justify-end space-x-3 bg-stone-50/50 -mx-6 -mb-6 p-5">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-semibold text-stone-500 hover:text-stone-800 bg-white border border-stone-200 rounded-xl px-4 py-2.5 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-2.5 cursor-pointer transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Save size={16} />
              {isSubmitting ? "Creating..." : "Save Horse Profile"}
            </button>
          </div>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
