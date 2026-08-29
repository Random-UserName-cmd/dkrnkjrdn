import React, { useState, useEffect } from "react";
import { db, logAuditAction } from "../firebase";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, addDoc, arrayUnion } from "firebase/firestore";
import { Horse, MaintenanceLog, UserRole, SystemUser } from "../types";
import { X, Calendar, Hammer, Stethoscope, Heart, Award, Clock, DollarSign, User, ShieldAlert, Settings, Edit, Save, Trash, Pill, AlertCircle, Info, Mic, MicOff, Play, MessageSquare, Plus, Upload, FileText, Download, ExternalLink, Eye, Sparkles, RotateCw } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "motion/react";

interface HorseDetailProps {
  horse: Horse;
  onClose: () => void;
  todayStr: string;
  userRole: UserRole;
  isPeter?: boolean;
  currentUser?: SystemUser | null;
  onDeleteHorse?: (horseId: string) => void;
  existingPaddocks?: string[];
  presetTags?: string[];
}

export default function HorseDetail({ horse, onClose, todayStr, userRole, isPeter, currentUser, onDeleteHorse, existingPaddocks, presetTags }: HorseDetailProps) {
  const [activeTab, setActiveTab] = useState<"timeline" | "profile" | "settings" | "documents">(isPeter ? "profile" : "timeline");
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [selectedMaintainer, setSelectedMaintainer] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [quickLogSuccess, setQuickLogSuccess] = useState<string | null>(null);
  const [isLoggingQuick, setIsLoggingQuick] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [isChangingPaddock, setIsChangingPaddock] = useState(false);
  const [newPaddock, setNewPaddock] = useState(horse.stableNumber || "");
  const [showCustomConfirmDelete, setShowCustomConfirmDelete] = useState(false);

  // Documents integration
  interface HorseDocument {
    id: string;
    name: string;
    type: string;
    size: string;
    uploadedAt: string;
    uploadedBy: string;
    dataUrl?: string;
  }
  const [documents, setDocuments] = useState<HorseDocument[]>([]);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [previewingDoc, setPreviewingDoc] = useState<HorseDocument | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    if (userRole === "visitor") {
      alert("Unauthorized: Visitors cannot upload documents.");
      return;
    }
    // Limit file size to 800KB to stay safely within Firestore's 1MB limit per document
    if (file.size > 800 * 1024) {
      alert("File is too large. For optimal performance, please upload files smaller than 800 KB.");
      return;
    }

    setIsUploadingDoc(true);
    setUploadProgress(10);
    try {
      const reader = new FileReader();
      
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 75);
          setUploadProgress(percent === 0 ? 10 : percent);
        }
      };

      reader.onload = async (event) => {
        setUploadProgress(80);
        const dataUrl = event.target?.result as string;
        setUploadProgress(90);
        
        await addDoc(collection(db, "horses", horse.id, "documents"), {
          name: file.name,
          type: file.type,
          size: formatFileSize(file.size),
          uploadedAt: new Date().toLocaleString("en-US", { hour12: false }),
          uploadedBy: currentUser?.name || "Staff",
          dataUrl: dataUrl
        });

        setUploadProgress(100);

        if (currentUser) {
          await logAuditAction(
            currentUser.name,
            currentUser.role,
            "modify",
            `Uploaded document "${file.name}" to horse profile: ${horse.name}`
          );
        }

        setTimeout(() => {
          setIsUploadingDoc(false);
          setUploadProgress(0);
        }, 500);
      };
      
      reader.onerror = () => {
        throw new Error("File reading failed.");
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Error uploading file:", err);
      alert("Failed to upload file.");
      setIsUploadingDoc(false);
      setUploadProgress(0);
    }
  };

  const downloadDocument = (docItem: HorseDocument) => {
    if (!docItem.dataUrl) {
      alert("Error: Document has no data payload.");
      return;
    }
    setDownloadingDocId(docItem.id);
    setDownloadProgress(5);

    let progress = 5;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 8;
      if (progress >= 100) {
        progress = 100;
        setDownloadProgress(100);
        clearInterval(interval);

        // Trigger programmatic download
        const link = document.createElement("a");
        link.href = docItem.dataUrl || "";
        link.download = docItem.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => {
          setDownloadingDocId(null);
          setDownloadProgress(0);
        }, 600);
      } else {
        setDownloadProgress(progress);
      }
    }, 80);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [deleteDocSuccessToast, setDeleteDocSuccessToast] = useState<string | null>(null);

  const deleteDocument = async (docId: string, docName: string) => {
    try {
      setDeletingDocId(docId);
      // Optimistic local state update
      setDocuments(prev => prev.filter(d => d.id !== docId));
      if (previewingDoc?.id === docId) {
        setPreviewingDoc(null);
      }
      await deleteDoc(doc(db, "horses", horse.id, "documents", docId));
      if (currentUser) {
        await logAuditAction(
          currentUser.name,
          currentUser.role,
          "modify",
          `Deleted document "${docName}" from horse profile: ${horse.name}`
        );
      }
      setDeleteDocSuccessToast(`Document "${docName}" deleted.`);
      setTimeout(() => setDeleteDocSuccessToast(null), 3000);
    } catch (err) {
      console.error("Error deleting document:", err);
    } finally {
      setDeletingDocId(null);
    }
  };

  // Comments and voice dictation states
  interface ProfileComment {
    id: string;
    text: string;
    author: string;
    createdAt: string;
  }
  const [profileComments, setProfileComments] = useState<ProfileComment[]>([]);
  const [newCommentText, setNewCommentText] = useState("");
  const [isSavingComment, setIsSavingComment] = useState(false);

  // Voice recognition states
  const [isListening, setIsListening] = useState(false);
  const [activeDictationField, setActiveDictationField] = useState<"feed" | "meds" | "comment" | null>(null);

  const startListening = (field: "feed" | "meds" | "comment") => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice speech-to-text is not supported in this browser. Please use Google Chrome, Apple Safari, or Microsoft Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setActiveDictationField(field);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (field === "feed") {
        setProfileForm((prev) => ({
          ...prev,
          feedRequirements: prev.feedRequirements ? prev.feedRequirements + " " + transcript : transcript,
        }));
      } else if (field === "meds") {
        setProfileForm((prev) => ({
          ...prev,
          activeMedications: prev.activeMedications ? prev.activeMedications + " " + transcript : transcript,
        }));
      } else if (field === "comment") {
        setNewCommentText((prev) => (prev ? prev + " " + transcript : transcript));
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
      setActiveDictationField(null);
    };

    recognition.onend = () => {
      setIsListening(false);
      setActiveDictationField(null);
    };

    recognition.start();
  };

  const stopListening = () => {
    setIsListening(false);
    setActiveDictationField(null);
  };

  const handleSaveComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    setIsSavingComment(true);
    try {
      await addDoc(collection(db, "horses", horse.id, "comments"), {
        text: newCommentText.trim(),
        author: currentUser?.name || "Staff",
        createdAt: new Date().toLocaleString("en-US", { hour12: false }),
      });
      setNewCommentText("");
      if (currentUser) {
        await logAuditAction(currentUser.name, currentUser.role, "modify", `Added comment on horse profile: ${horse.name}`);
      }
    } catch (err) {
      console.error("Error saving comment:", err);
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteDoc(doc(db, "horses", horse.id, "comments", commentId));
    } catch (err) {
      console.error("Error deleting comment:", err);
    }
  };

  const handleSavePaddock = async () => {
    try {
      await updateDoc(doc(db, "horses", horse.id), {
        stableNumber: newPaddock,
        updatedAt: todayStr
      });
      setIsChangingPaddock(false);
      if (currentUser) {
        await logAuditAction(currentUser.name, currentUser.role, "modify", `Changed location of horse ${horse.name} to ${newPaddock}`);
      }
    } catch (error) {
      console.error("Error saving paddock location:", error);
    }
  };

  // Log profile viewing activity
  useEffect(() => {
    if (currentUser) {
      logAuditAction(currentUser.name, currentUser.role, "view", `Viewed profile of horse: ${horse.name}`);
    }
  }, [horse.id, currentUser]);
  
  // Profile edit fields state
  const [profileForm, setProfileForm] = useState({
    name: horse.name,
    breed: horse.breed,
    age: horse.age.toString(),
    gender: horse.gender,
    color: horse.color,
    brandingDescription: horse.brandingDescription || "",
    brandingLocation: horse.brandingLocation || "",
    brandingDate: horse.brandingDate || "",
    shoeingIntervalWeeks: (horse.shoeingIntervalWeeks || 6).toString(),
    nextVetDueDate: horse.nextVetDueDate || "",
    brandLeft: horse.brandLeft || "",
    brandRight: horse.brandRight || "",
    ottbPassport: horse.ottbPassport || "",
    raceName: (horse as any).raceName || "",
    weightLbs: horse.weightLbs || "",
    heightHands: horse.heightHands || "",
    microchipNumber: horse.microchipNumber || "",
    ownerName: horse.ownerName || "",
    ownerPhone: horse.ownerPhone || "",
    feedRequirements: horse.feedRequirements || "",
    activeMedications: horse.activeMedications || "",
    allergies: (horse as any).allergies || "",
    temperament: horse.temperament || "5",
    stableNumber: horse.stableNumber || "",
    useClassification: horse.useClassification || "Therapy",
    agistedHorse: !!horse.agistedHorse,
    dob: horse.dob || "",
  });

  const [isUpdating, setIsUpdating] = useState(false);
  const [tags, setTags] = useState<string[]>(horse.tags || []);
  const [newTagInput, setNewTagInput] = useState("");
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

  const [isDuplicating, setIsDuplicating] = useState(false);

  const handleDuplicateHorse = async () => {
    if (userRole !== "owner") {
      alert("Only registered Owners can copy or duplicate a horse profile.");
      return;
    }
    
    if (!window.confirm(`Are you sure you want to make a copy of "${horse.name}"?`)) {
      return;
    }

    setIsDuplicating(true);
    try {
      const { collection, addDoc } = await import("firebase/firestore");
      const duplicatedData = {
        name: `${horse.name} (Copy)`,
        breed: horse.breed || "",
        age: horse.age || 0,
        gender: horse.gender || "Gelding",
        color: horse.color || "",
        photoUrl: horse.photoUrl || "",
        brandingDate: horse.brandingDate || "",
        brandingDescription: horse.brandingDescription || "",
        brandingLocation: horse.brandingLocation || "",
        brandLeft: horse.brandLeft || "",
        brandRight: horse.brandRight || "",
        ottbPassport: horse.ottbPassport || "",
        lastShoeingDate: horse.lastShoeingDate || "",
        shoeingIntervalWeeks: horse.shoeingIntervalWeeks || 6,
        lastVetDate: horse.lastVetDate || "",
        lastVetNotes: horse.lastVetNotes || "",
        nextVetDueDate: horse.nextVetDueDate || "",
        lastDewormingDate: horse.lastDewormingDate || "",
        lastDentalDate: horse.lastDentalDate || "",
        raceName: horse.raceName || "",
        microchipNumber: horse.microchipNumber || "",
        heightHands: horse.heightHands || "",
        weightLbs: horse.weightLbs || "",
        ownerName: horse.ownerName || "",
        ownerPhone: horse.ownerPhone || "",
        feedRequirements: horse.feedRequirements || "",
        activeMedications: horse.activeMedications || "",
        temperament: horse.temperament || "5",
        stableNumber: horse.stableNumber || "",
        useClassification: horse.useClassification || "Therapy",
        tags: horse.tags || [],
        agistedHorse: horse.agistedHorse ?? false,
        dob: horse.dob || "",
        farmName: horse.farmName || currentUser?.farmName || "Ruabon Farm & Herd Center",
        farmId: horse.farmId || currentUser?.farmId || (currentUser?.farmName ? currentUser.farmName.toLowerCase().replace(/[^a-z0-9]+/g, "_") : "ruabon_farm"),
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString().split('T')[0],
      };

      await addDoc(collection(db, "horses"), duplicatedData);
      
      if (currentUser) {
        await logAuditAction(
          currentUser.name,
          currentUser.role,
          "modify",
          `Duplicated horse profile "${horse.name}" to create "${duplicatedData.name}"`
        );
      }

      alert(`Successfully duplicated horse profile as "${duplicatedData.name}"!`);
      onClose();
    } catch (e) {
      console.error("Error duplicating horse:", e);
      alert("Failed to duplicate horse profile.");
    } finally {
      setIsDuplicating(false);
    }
  };

  // Sync profileForm state if parent horse changes
  useEffect(() => {
    setProfileForm({
      name: horse.name,
      breed: horse.breed,
      age: horse.age.toString(),
      gender: horse.gender,
      color: horse.color,
      brandingDescription: horse.brandingDescription || "",
      brandingLocation: horse.brandingLocation || "",
      brandingDate: horse.brandingDate || "",
      shoeingIntervalWeeks: (horse.shoeingIntervalWeeks || 6).toString(),
      nextVetDueDate: horse.nextVetDueDate || "",
      brandLeft: horse.brandLeft || "",
      brandRight: horse.brandRight || "",
      ottbPassport: horse.ottbPassport || "",
      raceName: (horse as any).raceName || "",
      weightLbs: horse.weightLbs || "",
      heightHands: horse.heightHands || "",
      microchipNumber: horse.microchipNumber || "",
      ownerName: horse.ownerName || "",
      ownerPhone: horse.ownerPhone || "",
      feedRequirements: horse.feedRequirements || "",
      activeMedications: horse.activeMedications || "",
      allergies: (horse as any).allergies || "",
      temperament: horse.temperament || "5",
      stableNumber: horse.stableNumber || "",
      useClassification: horse.useClassification || "Therapy",
      agistedHorse: !!horse.agistedHorse,
      dob: horse.dob || "",
    });
    setTags(horse.tags || []);
  }, [horse]);

  // Realtime subscription to the horse's maintenance logs
  useEffect(() => {
    const q = query(
      collection(db, "horses", horse.id, "logs"),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: MaintenanceLog[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as MaintenanceLog);
      });
      setLogs(list);
    });

    return () => unsubscribe();
  }, [horse.id]);

  // Realtime subscription to the horse's profile comments
  useEffect(() => {
    const q = query(
      collection(db, "horses", horse.id, "comments"),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: ProfileComment[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as ProfileComment);
      });
      setProfileComments(list);
    }, (err) => {
      console.warn("Comments subscription error:", err);
    });

    return () => unsubscribe();
  }, [horse.id]);

  // Realtime subscription to the horse's profile documents
  useEffect(() => {
    const q = query(
      collection(db, "horses", horse.id, "documents"),
      orderBy("uploadedAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: HorseDocument[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as HorseDocument);
      });
      setDocuments(list);
    }, (err) => {
      console.warn("Documents subscription error:", err);
    });

    return () => unsubscribe();
  }, [horse.id]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      const compositeDescription = profileForm.brandingDescription || 
        (profileForm.brandLeft || profileForm.brandRight ? 
          `Left: ${profileForm.brandLeft || 'None'} | Right: ${profileForm.brandRight || 'None'}` : "");

      const finalTags = [...tags];
      if (profileForm.agistedHorse && !finalTags.includes("aggistor horse")) {
        finalTags.push("aggistor horse");
      }

      const updates: Partial<Horse> = {
        name: profileForm.name,
        breed: profileForm.breed,
        age: Number(profileForm.age) || 0,
        gender: profileForm.gender as "Mare" | "Gelding" | "Stallion",
        color: profileForm.color,
        brandingDescription: compositeDescription,
        brandingLocation: profileForm.brandingLocation || "N/A",
        brandLeft: profileForm.brandLeft || undefined,
        brandRight: profileForm.brandRight || undefined,
        ottbPassport: profileForm.ottbPassport || undefined,
        raceName: profileForm.raceName || undefined,
        brandingDate: profileForm.brandingDate || undefined,
        shoeingIntervalWeeks: Number(profileForm.shoeingIntervalWeeks) || 6,
        nextVetDueDate: profileForm.nextVetDueDate || undefined,
        weightLbs: profileForm.weightLbs || undefined,
        heightHands: profileForm.heightHands || undefined,
        microchipNumber: profileForm.microchipNumber || undefined,
        ownerName: profileForm.ownerName || undefined,
        ownerPhone: profileForm.ownerPhone || undefined,
        feedRequirements: profileForm.feedRequirements || undefined,
        activeMedications: profileForm.activeMedications || undefined,
        allergies: profileForm.allergies || undefined,
        temperament: profileForm.temperament || undefined,
        stableNumber: profileForm.stableNumber || undefined,
        useClassification: profileForm.useClassification || undefined,
        tags: finalTags,
        agistedHorse: profileForm.agistedHorse,
        dob: profileForm.dob || undefined,
        updatedAt: todayStr,
      } as any;

      await updateDoc(doc(db, "horses", horse.id), updates);
      if (currentUser) {
        logAuditAction(currentUser.name, currentUser.role, "modify", `Modified details of horse: ${horse.name}`);
      }
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating horse profile:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteLog = async (logId: string) => {
    if (!window.confirm("Are you sure you want to delete this maintenance record from history?")) return;
    try {
      await deleteDoc(doc(db, "horses", horse.id, "logs", logId));
      if (currentUser) {
        logAuditAction(currentUser.name, currentUser.role, "modify", `Deleted a maintenance record from horse: ${horse.name}`);
      }
    } catch (error) {
      console.error("Error deleting log entry:", error);
    }
  };

  const revertDailyCheck = async (checkId: string, checkDate: string) => {
    if (!window.confirm(`Are you sure you want to revert/delete the daily check logged on ${checkDate}?`)) return;
    try {
      const history = horse.dailyChecksHistory || [];
      const filteredHistory = history.filter((c: any) => c.id !== checkId);
      
      const updates: any = {
        dailyChecksHistory: filteredHistory
      };
      
      if (horse.lastCheckedDate === checkDate) {
        if (filteredHistory.length > 0) {
          const nextCheck = filteredHistory[0];
          updates.lastCheckedDate = nextCheck.date;
          updates.lastCheckedBy = nextCheck.checkedBy;
          updates.lastCheckedStatus = nextCheck.status || "OK";
        } else {
          updates.lastCheckedDate = "";
          updates.lastCheckedBy = "";
          updates.lastCheckedStatus = "";
        }
      }
      
      await updateDoc(doc(db, "horses", horse.id), updates);
      
      if (currentUser) {
        await logAuditAction(currentUser.name, currentUser.role, "modify", `Reverted/deleted daily check logged on ${checkDate} for horse: ${horse.name}`);
      }
      alert("✓ Daily check reverted successfully.");
    } catch (error) {
      console.error("Error reverting daily check:", error);
      alert("Failed to revert daily check.");
    }
  };

  const handleQuickLog = async (presetType: "trim" | "vaccine" | "deworm" | "check") => {
    setIsLoggingQuick(true);
    setQuickLogSuccess(null);
    try {
      let type: any = "shoeing";
      let performedBy = "Farrier";
      let cost = 0;
      let notes = "";
      let nextDueDate = "";

      if (presetType === "trim") {
        type = "shoeing";
        performedBy = "Farrier";
        cost = 80;
        notes = "Routine hoof trim and balance.";
        const intervalWeeks = horse.shoeingIntervalWeeks || 6;
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() + (intervalWeeks * 7));
        nextDueDate = baseDate.toISOString().split("T")[0];
      } else if (presetType === "vaccine") {
        type = "vet";
        performedBy = "Veterinarian";
        cost = 45;
        notes = "Routine Vaccine Booster administered.";
      } else if (presetType === "deworm") {
        type = "deworming";
        performedBy = "Herd Manager";
        cost = 20;
        notes = "Broad-spectrum deworming treatment paste.";
      } else if (presetType === "check") {
        const checkerName = currentUser?.name || "Staff";
        const { collection, getDocs, query, where } = await import("firebase/firestore");
        const q = query(collection(db, "horses"), where("lastCheckedDate", "==", todayStr), where("lastCheckedBy", "==", checkerName));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          alert(`You (${checkerName}) have already logged a health check today. Only 1 health check a day can be logged per person.`);
          setIsLoggingQuick(false);
          return;
        }

        type = "vet";
        performedBy = currentUser?.name || "Herd Manager";
        cost = 0;
        notes = "Health Status Check: Checked this horse and they were OK.";
      }

      const logPayload = {
        horseId: horse.id,
        horseName: horse.name,
        type,
        date: todayStr,
        performedBy,
        cost,
        notes,
        createdAt: todayStr,
        loggedBy: currentUser?.name || "System",
      };

      if (nextDueDate) {
        (logPayload as any).nextDueDate = nextDueDate;
      }

      const { collection, addDoc } = await import("firebase/firestore");
      await addDoc(collection(db, `horses/${horse.id}/logs`), logPayload);

      // Prepare parent updates
      const horseUpdates: Partial<Horse> = {
        updatedAt: todayStr,
      };

      if (type === "shoeing") {
        horseUpdates.lastShoeingDate = todayStr;
      } else if (type === "vet") {
        horseUpdates.lastVetDate = todayStr;
        if (notes) horseUpdates.lastVetNotes = notes;
        if (nextDueDate) horseUpdates.nextVetDueDate = nextDueDate;
      } else if (type === "deworming") {
        horseUpdates.lastDewormingDate = todayStr;
      }

      if (presetType === "check") {
        horseUpdates.lastCheckedDate = todayStr;
        horseUpdates.lastCheckedBy = currentUser?.name || "Staff";
        horseUpdates.lastCheckedStatus = "OK";
      }

      await updateDoc(doc(db, "horses", horse.id), horseUpdates);

      if (currentUser) {
        await logAuditAction(
          currentUser.name,
          currentUser.role,
          "modify",
          `Logged quick-care: ${notes} for horse: ${horse.name}`
        );
      }

      setQuickLogSuccess(`Successfully logged: ${notes}`);
      setTimeout(() => setQuickLogSuccess(null), 4000);
    } catch (err) {
      console.error("Error writing quick log:", err);
      alert("Failed to write quick log. Please try again.");
    } finally {
      setIsLoggingQuick(false);
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case "shoeing": return <Hammer size={15} className="text-teal-600" />;
      case "vet": return <Stethoscope size={15} className="text-rose-800" />;
      case "deworming": return <Heart size={15} className="text-sky-800" />;
      case "branding": return <Award size={15} className="text-teal-800" />;
      case "medication": return <Pill size={15} className="text-amber-600" />;
      default: return <ShieldAlert size={15} className="text-stone-800" />;
    }
  };

  const getChartData = () => {
    const dataList = [];
    const now = new Date(todayStr || "2026-07-01");
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleString("default", { month: "short" });
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      dataList.push({
        key: monthKey,
        name: monthName,
        Cost: 0,
        Frequency: 0,
      });
    }

    logs.forEach((log) => {
      const logMonthKey = log.date.substring(0, 7);
      const match = dataList.find((m) => m.key === logMonthKey);
      if (match) {
        match.Cost += Number(log.cost) || 0;
        match.Frequency += 1;
      }
    });

    return dataList;
  };

  const get12MonthTrendData = () => {
    const dataList = [];
    const now = new Date(todayStr || "2026-07-01");
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = d.toLocaleString("default", { month: "short" });
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      dataList.push({
        key: monthKey,
        name: monthName,
        Vet: 0,
        Shoeing: 0,
      });
    }

    logs.forEach((log) => {
      const logMonthKey = log.date.substring(0, 7);
      const match = dataList.find((m) => m.key === logMonthKey);
      if (match) {
        if (log.type === "vet") {
          match.Vet += 1;
        } else if (log.type === "shoeing") {
          match.Shoeing += 1;
        }
      }
    });

    return dataList;
  };

  const chartData = getChartData();
  const hasChartData = chartData.some((d) => d.Cost > 0 || d.Frequency > 0);

  const totalCost = logs.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs overflow-y-auto cursor-pointer text-left" 
      id="horse-detail-backdrop"
      onClick={onClose}
    >
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 15, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 350, delay: 0.05 }}
        id="horse-detail-container"
        className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-2xl overflow-hidden my-8 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Block */}
        <div className="p-6 border-b border-stone-100 bg-stone-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-14 h-14 bg-teal-600/10 rounded-2xl border border-teal-600/20 text-teal-800 flex items-center justify-center font-bold text-xl uppercase shadow-xs">
              {horse.name.substring(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-stone-900">{horse.name}</h2>
                <span className="text-xxs font-bold bg-stone-200 text-stone-800 border border-stone-300 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {horse.gender}
                </span>
                {horse.raceName && (
                  <span className="text-xxs font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    Racing: "{horse.raceName}"
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 font-medium">
                {horse.breed} • {horse.color} • {horse.age} years old
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
            {userRole !== "visitor" && !isPeter && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-xs font-semibold bg-white text-stone-700 hover:text-stone-950 border border-stone-200 hover:border-stone-400 rounded-xl px-3.5 py-2 cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Edit size={14} /> {isEditing ? "View Mode" : "Edit Profile"}
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-1.5 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Dynamic Edit Form or View Panel */}
        {isEditing ? (
          <form onSubmit={handleUpdateProfile} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <h3 className="text-sm font-bold text-stone-700 pb-1 border-b border-stone-100 uppercase tracking-wide">Edit Horse Specifications</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Horse Name</label>
                <input
                  type="text"
                  required
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Registered Race Name</label>
                <input
                  type="text"
                  value={profileForm.raceName}
                  onChange={(e) => setProfileForm({ ...profileForm, raceName: e.target.value })}
                  placeholder="e.g. Black Caviar"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold text-stone-850"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Breed</label>
                <input
                  type="text"
                  value={profileForm.breed}
                  onChange={(e) => setProfileForm({ ...profileForm, breed: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Age</label>
                <input
                  type="number"
                  value={profileForm.age}
                  onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Date of Birth (DOB)</label>
                <input
                  type="date"
                  value={profileForm.dob}
                  onChange={(e) => setProfileForm({ ...profileForm, dob: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Agisted Horse</label>
                <select
                  value={profileForm.agistedHorse ? "yes" : "no"}
                  onChange={(e) => setProfileForm({ ...profileForm, agistedHorse: e.target.value === "yes" })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 bg-stone-50"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes (Is Agister Horse)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Color / Coat</label>
                <input
                  type="text"
                  value={profileForm.color}
                  onChange={(e) => setProfileForm({ ...profileForm, color: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Gender</label>
                <select
                  value={profileForm.gender}
                  onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value as any })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                >
                  <option value="Mare">Mare</option>
                  <option value="Gelding">Gelding</option>
                  <option value="Stallion">Stallion</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Shoeing Schedule (Weeks)</label>
                <input
                  type="number"
                  value={profileForm.shoeingIntervalWeeks}
                  onChange={(e) => setProfileForm({ ...profileForm, shoeingIntervalWeeks: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>
            </div>

            <h3 className="text-sm font-bold text-stone-700 pt-3 pb-1 border-b border-stone-100 uppercase tracking-wide">Brand & Identity Registry</h3>
            
            {/* Near Side / Off Side Note */}
            <div className="bg-amber-50/70 border border-amber-200/50 rounded-xl px-3.5 py-2 flex items-start gap-2.5 my-2 col-span-2">
              <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-[10px] text-amber-900 font-semibold leading-relaxed">
                <span className="font-bold block text-amber-950 uppercase tracking-wider mb-0.5">Anatomical Side Conventions</span>
                The horse's <span className="underline">LEFT SIDE is the NEAR SIDE</span>, and the <span className="underline">RIGHT SIDE is the OFF SIDE</span>.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Brand on Left Side / Near Side</label>
                <input
                  type="text"
                  value={profileForm.brandLeft}
                  onChange={(e) => setProfileForm({ ...profileForm, brandLeft: e.target.value })}
                  placeholder="e.g. Lazy Double J, Left Hip"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Brand on Right Side / Off Side</label>
                <input
                  type="text"
                  value={profileForm.brandRight}
                  onChange={(e) => setProfileForm({ ...profileForm, brandRight: e.target.value })}
                  placeholder="e.g. Chevron under Bar, Right Shoulder"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Microchip Number</label>
                <input
                  type="text"
                  value={profileForm.microchipNumber}
                  onChange={(e) => setProfileForm({ ...profileForm, microchipNumber: e.target.value })}
                  placeholder="e.g. 981021002341232"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold text-stone-850"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Off the Track Passport No. (OTTB)</label>
                <input
                  type="text"
                  value={profileForm.ottbPassport}
                  onChange={(e) => setProfileForm({ ...profileForm, ottbPassport: e.target.value })}
                  placeholder="e.g. OTTB-2015-84"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold text-stone-850"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Brand Description (Legacy / Combined)</label>
                <input
                  type="text"
                  value={profileForm.brandingDescription}
                  onChange={(e) => setProfileForm({ ...profileForm, brandingDescription: e.target.value })}
                  placeholder="e.g. Double Bar Lazy J, Chest Tattoo"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Brand Location on Horse</label>
                <input
                  type="text"
                  value={profileForm.brandingLocation}
                  onChange={(e) => setProfileForm({ ...profileForm, brandingLocation: e.target.value })}
                  placeholder="e.g. Left Hip, Right Shoulder"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Branded Date</label>
                <input
                  type="date"
                  value={profileForm.brandingDate}
                  onChange={(e) => setProfileForm({ ...profileForm, brandingDate: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Next Veterinary Due Date</label>
                <input
                  type="date"
                  value={profileForm.nextVetDueDate}
                  onChange={(e) => setProfileForm({ ...profileForm, nextVetDueDate: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600"
                />
              </div>
            </div>

            <h3 className="text-sm font-bold text-stone-700 pt-3 pb-1 border-b border-stone-100 uppercase tracking-wide">Clinical Biometrics & Care Protocols</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Weight (Lbs)</label>
                <input
                  type="text"
                  value={profileForm.weightLbs}
                  onChange={(e) => setProfileForm({ ...profileForm, weightLbs: e.target.value })}
                  placeholder="e.g. 1100"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Height (Hands)</label>
                <input
                  type="text"
                  value={profileForm.heightHands}
                  onChange={(e) => setProfileForm({ ...profileForm, heightHands: e.target.value })}
                  placeholder="e.g. 15.2"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Stable / Stall Location</label>
                <input
                  type="text"
                  list="paddock-edit-suggestions"
                  value={profileForm.stableNumber}
                  onChange={(e) => setProfileForm({ ...profileForm, stableNumber: e.target.value })}
                  placeholder="e.g. Barn A, Stall 4"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold"
                />
                <datalist id="paddock-edit-suggestions">
                  {(existingPaddocks || []).map(p => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Microchip Number</label>
                <input
                  type="text"
                  value={profileForm.microchipNumber}
                  onChange={(e) => setProfileForm({ ...profileForm, microchipNumber: e.target.value })}
                  placeholder="e.g. 981021002341232"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Use Classification</label>
                <select
                  value={profileForm.useClassification}
                  onChange={(e) => setProfileForm({ ...profileForm, useClassification: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold"
                >
                  <option value="Therapy">Therapy Work</option>
                  <option value="Lesson">Lesson Riding</option>
                  <option value="Training">Active Training</option>
                  <option value="Retired">Retired / Pasture</option>
                  <option value="Trail">Trail Riding</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Temperament Rating (1-10)</label>
                <select
                  value={profileForm.temperament}
                  onChange={(e) => setProfileForm({ ...profileForm, temperament: e.target.value })}
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold"
                >
                  {[...Array(10)].map((_, idx) => (
                    <option key={idx + 1} value={(idx + 1).toString()}>
                      {idx + 1} - {idx + 1 <= 3 ? "Very Calm" : idx + 1 <= 7 ? "Moderate" : "Highly Sensitive"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-stone-600 mb-1">Feed Requirements / Dietary Protocols</label>
                <div className="relative">
                  <textarea
                    value={profileForm.feedRequirements}
                    onChange={(e) => setProfileForm({ ...profileForm, feedRequirements: e.target.value })}
                    placeholder="e.g. Morning: 1 scoop active pellets + lucerne. Evening: 2 scoops oaten chaff..."
                    className="w-full border border-stone-200 rounded-xl p-2.5 pr-10 text-sm focus:ring-1 focus:ring-teal-600 h-20 font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => (isListening && activeDictationField === "feed") ? stopListening() : startListening("feed")}
                    className={`absolute right-2.5 bottom-2.5 p-1.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      (isListening && activeDictationField === "feed")
                        ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse"
                        : "bg-teal-50 hover:bg-teal-100 text-teal-700"
                    }`}
                    title={(isListening && activeDictationField === "feed") ? "Stop voice dictation" : "Dictate feed requirements"}
                  >
                    {(isListening && activeDictationField === "feed") ? <MicOff size={14} /> : <Mic size={14} />}
                  </button>
                </div>
                {(isListening && activeDictationField === "feed") && (
                  <p className="text-[10px] text-teal-600 font-bold animate-pulse flex items-center gap-1 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-ping" />
                    Listening... Speak now, text will append. Click red mic to stop.
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-stone-600 mb-1">Active Medications / Supplements</label>
                <div className="relative">
                  <textarea
                    value={profileForm.activeMedications}
                    onChange={(e) => setProfileForm({ ...profileForm, activeMedications: e.target.value })}
                    placeholder="e.g. 10mg Equioxx daily with morning feed, joint paste..."
                    className="w-full border border-stone-200 rounded-xl p-2.5 pr-10 text-sm focus:ring-1 focus:ring-teal-600 h-20 font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => (isListening && activeDictationField === "meds") ? stopListening() : startListening("meds")}
                    className={`absolute right-2.5 bottom-2.5 p-1.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      (isListening && activeDictationField === "meds")
                        ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse"
                        : "bg-teal-50 hover:bg-teal-100 text-teal-700"
                    }`}
                    title={(isListening && activeDictationField === "meds") ? "Stop voice dictation" : "Dictate medications/supplements"}
                  >
                    {(isListening && activeDictationField === "meds") ? <MicOff size={14} /> : <Mic size={14} />}
                  </button>
                </div>
                {(isListening && activeDictationField === "meds") && (
                  <p className="text-[10px] text-teal-600 font-bold animate-pulse flex items-center gap-1 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-ping" />
                    Listening... Speak now, text will append. Click red mic to stop.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Owner Contact Name</label>
                <input
                  type="text"
                  value={profileForm.ownerName}
                  onChange={(e) => setProfileForm({ ...profileForm, ownerName: e.target.value })}
                  placeholder="e.g. Jane Wright"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Owner Contact Phone</label>
                <input
                  type="text"
                  value={profileForm.ownerPhone}
                  onChange={(e) => setProfileForm({ ...profileForm, ownerPhone: e.target.value })}
                  placeholder="e.g. +61 411 222 333"
                  className="w-full border border-stone-200 rounded-xl p-2.5 text-sm focus:ring-1 focus:ring-teal-600 font-semibold"
                />
              </div>

              {/* Profile Tags Section */}
              <div className="col-span-1 md:col-span-2 pt-2 border-t border-stone-100 mt-2">
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

            <div className="pt-4 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs font-semibold text-stone-500 hover:text-stone-800 bg-white border border-stone-200 rounded-xl px-4 py-2 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdating}
                className="text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 py-2 cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save size={14} />
                {isUpdating ? "Saving..." : "Save Modifications"}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Tabs Selector */}
            {!isPeter && (
              <div className="flex border-b border-stone-100 bg-stone-50/50 px-6 gap-2 overflow-x-auto scrollbar-none">
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`py-3 text-xs font-semibold tracking-wider uppercase border-b-2 px-3 focus:outline-hidden cursor-pointer transition-colors shrink-0 ${
                    activeTab === "timeline" ? "border-teal-600 text-teal-800 font-bold" : "border-transparent text-stone-500 hover:text-stone-800"
                  }`}
                >
                  Timeline & History
                </button>
                <button
                  onClick={() => setActiveTab("profile")}
                  className={`py-3 text-xs font-semibold tracking-wider uppercase border-b-2 px-3 focus:outline-hidden cursor-pointer transition-colors shrink-0 ${
                    activeTab === "profile" ? "border-teal-600 text-teal-800 font-bold" : "border-transparent text-stone-500 hover:text-stone-800"
                  }`}
                >
                  Farm Brand & Spec Sheet
                </button>
                <button
                  onClick={() => setActiveTab("settings")}
                  className={`py-3 text-xs font-semibold tracking-wider uppercase border-b-2 px-3 focus:outline-hidden cursor-pointer transition-colors flex items-center gap-1.5 shrink-0 ${
                    activeTab === "settings" ? "border-teal-600 text-teal-800 font-bold" : "border-transparent text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Settings size={13} /> Settings & Clinicals
                </button>
                <button
                  onClick={() => setActiveTab("documents")}
                  className={`py-3 text-xs font-semibold tracking-wider uppercase border-b-2 px-3 focus:outline-hidden cursor-pointer transition-colors flex items-center gap-1.5 shrink-0 ${
                    activeTab === "documents" ? "border-teal-600 text-teal-800 font-bold" : "border-transparent text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Upload size={13} /> Documents ({documents.length})
                </button>
              </div>
            )}

            {/* Tab Panels */}
            <div className="p-6 max-h-[60vh] overflow-y-auto" id="detail-panel-content">
              {/* Critical Medical Alerts Section */}
              {((!!horse.activeMedications && horse.activeMedications.trim().length > 0) || (!!(horse as any).allergies && (horse as any).allergies.trim().length > 0)) && (
                <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl flex items-start gap-4 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-3 opacity-5 pointer-events-none">
                    <ShieldAlert size={120} className="text-red-900" />
                  </div>
                  
                  <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm">
                    <ShieldAlert size={22} className="text-white animate-pulse" />
                  </div>
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-red-950 uppercase tracking-widest block">
                        Critical Medical Alerts
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-widest bg-red-600 text-white px-2.5 py-0.5 rounded-full border border-red-700">
                        Immediate Visibility
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {!!horse.activeMedications && horse.activeMedications.trim().length > 0 && (
                        <div className="bg-white/80 border border-red-100 p-3 rounded-xl shadow-4xs">
                          <span className="text-[9px] font-black text-rose-800 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                            <Pill size={11} className="text-rose-600" /> Active Medications / Treatment
                          </span>
                          <p className="text-xs font-bold text-stone-800 leading-relaxed">
                            {horse.activeMedications}
                          </p>
                        </div>
                      )}
                      
                      {!!(horse as any).allergies && (horse as any).allergies.trim().length > 0 && (
                        <div className="bg-white/80 border border-red-100 p-3 rounded-xl shadow-4xs">
                          <span className="text-[9px] font-black text-rose-800 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                            <AlertCircle size={11} className="text-rose-600" /> Known Allergies / Intolerances
                          </span>
                          <p className="text-xs font-bold text-stone-800 leading-relaxed">
                            {(horse as any).allergies}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 1: Maintenance Timeline */}
              {activeTab === "timeline" && (
                <div className="space-y-4">
                  
                  {/* Quick Log Menu Removed as requested */}

                  <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                    <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Historical Logs ({logs.length})</span>
                    <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full flex items-center gap-1">
                      <DollarSign size={13} /> Total Invested: ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* 6-Month Maintenance Analytics Panel */}
                  <div className="bg-stone-50 border border-stone-200/60 rounded-2xl p-4 mb-5" id="maintenance-analytics">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-xs font-black text-stone-900 uppercase tracking-wide">6-Month Maintenance Trend</h4>
                        <p className="text-[9px] text-stone-500 font-bold uppercase tracking-wider mt-0.5">
                          Last 6 Months (Care History)
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-wider">
                        <span className="flex items-center gap-1 text-teal-700">
                          <span className="w-2 h-2 rounded-xs bg-teal-600 inline-block" /> Cost ($)
                        </span>
                        <span className="flex items-center gap-1 text-stone-500">
                          <span className="w-2 h-2 rounded-xs bg-stone-500 inline-block" /> Frequency
                        </span>
                      </div>
                    </div>

                    {hasChartData ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-[120px]">
                        {/* Cost Sparkline */}
                        <div className="bg-white border border-stone-150 p-2.5 rounded-xl flex flex-col justify-between h-full relative shadow-4xs">
                          <span className="text-[9px] font-black text-stone-450 uppercase tracking-widest absolute top-2.5 left-3">
                            Accumulated Expense ($)
                          </span>
                          <div className="w-full h-[65px] mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={chartData} margin={{ top: 2, right: 5, left: 5, bottom: 2 }}>
                                <defs>
                                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.25}/>
                                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <XAxis 
                                  dataKey="name" 
                                  tickLine={false} 
                                  axisLine={false} 
                                  tick={{ fontSize: 9, fontWeight: 'bold', fill: '#78716c' }} 
                                />
                                <Tooltip 
                                  contentStyle={{ background: '#1c1917', borderRadius: '8px', border: 'none', color: '#fff' }}
                                  labelStyle={{ fontSize: 9, fontWeight: 'bold', color: '#a8a29e' }}
                                  itemStyle={{ fontSize: 10, fontWeight: 'bold', color: '#5eead4' }}
                                  formatter={(value: any) => [`$${value}`, "Cost"]}
                                />
                                <Area type="monotone" dataKey="Cost" stroke="#0d9488" strokeWidth={1.5} fillOpacity={1} fill="url(#colorCost)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Frequency Sparkline */}
                        <div className="bg-white border border-stone-150 p-2.5 rounded-xl flex flex-col justify-between h-full relative shadow-4xs">
                          <span className="text-[9px] font-black text-stone-450 uppercase tracking-widest absolute top-2.5 left-3">
                            Care Operation Logs
                          </span>
                          <div className="w-full h-[65px] mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} margin={{ top: 2, right: 5, left: 5, bottom: 2 }}>
                                <XAxis 
                                  dataKey="name" 
                                  tickLine={false} 
                                  axisLine={false} 
                                  tick={{ fontSize: 9, fontWeight: 'bold', fill: '#78716c' }} 
                                />
                                <Tooltip 
                                  contentStyle={{ background: '#1c1917', borderRadius: '8px', border: 'none', color: '#fff' }}
                                  labelStyle={{ fontSize: 9, fontWeight: 'bold', color: '#a8a29e' }}
                                  itemStyle={{ fontSize: 10, fontWeight: 'bold', color: '#a8a29e' }}
                                  formatter={(value: any) => [value, "Logs"]}
                                />
                                <Bar dataKey="Frequency" fill="#78716c" radius={[3, 3, 0, 0]} barSize={10} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border border-stone-150 rounded-xl py-5 px-4 text-center shadow-4xs flex flex-col items-center justify-center">
                        <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">No Care Logged in Last 6 Months</span>
                        <p className="text-[8px] text-stone-400 mt-1 uppercase font-semibold">New logs will build your real-time spend &amp; activity timelines.</p>
                      </div>
                    )}
                  </div>

                  {logs.length === 0 ? (
                    <div className="text-center py-10 text-stone-400">
                      <Calendar className="mx-auto text-stone-300 mb-2" size={36} />
                      <p className="text-sm font-medium">No maintenance logged yet.</p>
                      <p className="text-xs text-stone-400 mt-1">Use 'Log Maintenance' on the dashboard to register care events.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 relative before:absolute before:left-5 before:top-4 before:bottom-4 before:w-0.5 before:bg-stone-100">
                      {logs.map((log) => (
                        <div key={log.id} className="flex gap-4 items-start relative" id={`log-item-${log.id}`}>
                          {/* Circle Icon Badge */}
                          <div className="w-10 h-10 rounded-full border border-stone-200 bg-white flex items-center justify-center shadow-xs shrink-0 z-10">
                            {getLogIcon(log.type)}
                          </div>

                          {/* Detail Card */}
                          <div className="flex-1 bg-stone-50/70 border border-stone-100 rounded-2xl p-4 transition-all hover:bg-stone-50 hover:shadow-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                                  {log.type.replace("_", " ")}
                                </span>
                                <div className="flex items-center gap-3 text-stone-500 text-xxs mt-0.5 font-medium flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Calendar size={11} /> {log.date}
                                  </span>
                                  <span 
                                    onClick={() => setSelectedMaintainer(log.performedBy)}
                                    className="flex items-center gap-1 cursor-pointer hover:text-teal-600 underline font-bold transition-colors"
                                    title={`View ${log.performedBy}'s credentials`}
                                  >
                                    <User size={11} /> {log.performedBy}
                                  </span>
                                  {log.loggedBy && (
                                    <span 
                                      onClick={() => setSelectedMaintainer(log.loggedBy)}
                                      className="flex items-center gap-1 bg-stone-50 text-stone-650 border border-stone-200/60 px-1.5 py-0.2 rounded text-[9px] font-bold cursor-pointer hover:text-teal-600 hover:border-teal-300 transition-colors"
                                      title={`View ${log.loggedBy}'s credentials`}
                                    >
                                      Logged by: {log.loggedBy}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-stone-800 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-lg">
                                  ${log.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                {(currentUser?.role === "owner" || currentUser?.role === "admin" || currentUser?.name?.toLowerCase() === "system administrator") && (
                                  <button
                                    onClick={() => deleteLog(log.id)}
                                    className="text-stone-400 hover:text-rose-700 p-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Delete entry"
                                  >
                                    <Trash size={13} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {log.notes && (
                              <p className="text-sm text-stone-600 mt-2 italic leading-relaxed">
                                "{log.notes}"
                              </p>
                            )}

                            {(log as any).voiceMemo && (
                              <div className="mt-2.5 pt-2 border-t border-stone-150 flex items-center gap-2">
                                <span className="text-[10px] text-teal-700 font-extrabold uppercase tracking-wider flex items-center gap-1">
                                  <Mic size={12} className="text-teal-600" />
                                  Voice Memo ({(log as any).voiceMemo.durationSeconds}s)
                                </span>
                                <button
                                  onClick={() => {
                                    if ((log as any).voiceMemo.audioBase64) {
                                      const audio = new Audio((log as any).voiceMemo.audioBase64);
                                      audio.play().catch(e => console.error("Playback error:", e));
                                    }
                                  }}
                                  className="text-xxs font-black text-white bg-teal-600 hover:bg-teal-700 px-2 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                                >
                                  <Play size={9} className="fill-current" /> Play memo
                                </button>
                              </div>
                            )}

                            {log.nextDueDate && (
                              <div className="mt-2.5 pt-2 border-t border-stone-200/55 flex items-center gap-1.5 text-xxs text-teal-700 font-bold">
                                <Clock size={11} /> Next schedule: {log.nextDueDate}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {userRole !== "visitor" && onDeleteHorse && (
                    <div className="mt-4">
                      {showCustomConfirmDelete ? (
                        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 animate-fade-in text-left">
                          <h5 className="font-bold text-rose-900 text-xs uppercase tracking-wider">Confirm Permanent Deletion</h5>
                          <p className="text-stone-600 text-xs mt-1">
                            Are you absolutely sure you want to delete {horse.name} and all associated maintenance logs? This action is irreversible.
                          </p>
                          <div className="flex gap-2.5 mt-3.5 justify-end">
                            <button
                              type="button"
                              onClick={() => setShowCustomConfirmDelete(false)}
                              className="text-xs font-semibold text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteHorse(horse.id);
                                setShowCustomConfirmDelete(false);
                                onClose();
                              }}
                              className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl transition-all cursor-pointer"
                            >
                              Yes, Delete permanently
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-6 border-t border-stone-200 flex justify-end gap-2.5">
                          {userRole === "owner" && (
                            <button
                              type="button"
                              disabled={isDuplicating}
                              onClick={handleDuplicateHorse}
                              className="text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <Award size={14} /> {isDuplicating ? "Duplicating..." : "Duplicate Profile"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowCustomConfirmDelete(true)}
                            className="text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Trash size={14} /> Delete Horse Profile
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}

                  {/* Tab 2: Profile & Branding Info */}
                  {activeTab === "profile" && (
                    <div className="space-y-6">
                      {/* Thoroughbred & Identity Registry Display */}
                      {((horse as any).raceName || horse.microchipNumber || horse.ottbPassport) && (
                        <div className="p-4 bg-amber-50/40 border border-amber-600/15 rounded-2xl space-y-3.5 animate-fade-in">
                          <div className="flex items-center space-x-2.5">
                            <Award className="text-amber-700 shrink-0" size={20} />
                            <h4 className="font-bold text-amber-800 text-xs uppercase tracking-wider">Thoroughbred & Identity Registry</h4>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {(horse as any).raceName && (
                              <div>
                                <span className="text-xxs font-bold text-stone-400 uppercase tracking-wider block">Registered Race Name</span>
                                <span className="text-sm font-black text-stone-800 mt-0.5 block font-serif">"{(horse as any).raceName}"</span>
                              </div>
                            )}
                            {horse.microchipNumber && (
                              <div>
                                <span className="text-xxs font-bold text-stone-400 uppercase tracking-wider block">Microchip ID</span>
                                <span className="text-sm font-mono font-bold text-stone-800 mt-0.5 block">{horse.microchipNumber}</span>
                              </div>
                            )}
                            {horse.ottbPassport && (
                              <div>
                                <span className="text-xxs font-bold text-amber-850 uppercase tracking-wider block">Off the Track Passport</span>
                                <span className="text-sm font-bold text-amber-950 mt-0.5 block">{horse.ottbPassport}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Branding marks display */}
                      <div 
                        onClick={() => setIsBrandModalOpen(true)}
                        className="p-4 bg-teal-50/20 border border-teal-600/15 rounded-2xl cursor-pointer hover:bg-teal-50/45 transition-all group"
                        title="Click to generate interactive 3D model of this brand"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center space-x-2.5">
                            <Award className="text-teal-700 shrink-0" size={20} />
                            <h4 className="font-bold text-teal-800 text-sm uppercase tracking-wide">Farm Brand Certificate</h4>
                          </div>
                          <span className="text-[9px] font-bold text-teal-700 bg-teal-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider group-hover:scale-105 transition-all flex items-center gap-1">
                            <Sparkles size={10} className="text-teal-600 animate-pulse" /> 3D AI Model
                          </span>
                        </div>
                        <p className="text-[10px] text-teal-650 font-bold mb-3 uppercase tracking-wider">Convention: Left side is near side, right side is off side. Click anywhere here to generate a 3D model.</p>
    
                        {horse.brandingDescription || horse.brandLeft || horse.brandRight ? (
                          <div className="space-y-3.5 text-stone-700">
                            <div className="grid grid-cols-2 gap-4">
                              {horse.brandLeft && (
                                <div>
                                  <span className="text-xxs font-bold text-stone-400 uppercase tracking-wider block">Brand on Left Side (Near Side)</span>
                                  <span className="text-sm font-bold text-teal-900 mt-0.5 block">{horse.brandLeft}</span>
                                </div>
                              )}
                              {horse.brandRight && (
                                <div>
                                  <span className="text-xxs font-bold text-stone-400 uppercase tracking-wider block">Brand on Right Side (Off Side)</span>
                                  <span className="text-sm font-bold text-teal-900 mt-0.5 block">{horse.brandRight}</span>
                                </div>
                              )}
                          {horse.brandingDescription && (
                            <div className="col-span-2">
                              <span className="text-xxs font-bold text-stone-400 uppercase tracking-wider block">Symbol Marks / Details</span>
                              <span className="text-sm font-semibold text-stone-800 mt-0.5 block">{horse.brandingDescription}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-xxs font-bold text-stone-400 uppercase tracking-wider block">Placement Location</span>
                            <span className="text-sm font-semibold text-stone-800 mt-0.5 block">{horse.brandingLocation || "Not registered"}</span>
                          </div>
                          {horse.brandingDate && (
                            <div>
                              <span className="text-xxs font-bold text-stone-400 uppercase tracking-wider block">Date Registered/Branded</span>
                              <span className="text-sm font-semibold text-stone-800 mt-0.5 block">{horse.brandingDate}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-stone-500 py-3 text-xs italic">
                        No official farm brand marks have been registered for this horse. Use the "Edit Profile" option in the header to register branding details.
                      </div>
                    )}
                  </div>

                  {horse.ottbPassport && (
                    <div className="p-4 bg-amber-50/50 border border-amber-500/25 rounded-2xl flex items-center justify-between animate-fade-in">
                      <div>
                        <span className="text-xxs font-bold text-amber-800 uppercase tracking-wider block">Off the Track Passport (OTTB)</span>
                        <span className="text-sm font-extrabold text-amber-950 mt-0.5 block">{horse.ottbPassport}</span>
                      </div>
                      <span className="text-xxs bg-amber-700 text-white font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-xs">
                        OTTB Verified
                      </span>
                    </div>
                  )}

                  {/* Standard Horse Bio */}
                  <div>
                    <h4 className="font-bold text-stone-800 text-xs uppercase tracking-wider mb-3">Coat & Characteristics</h4>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 bg-stone-50/60 p-4 rounded-2xl border border-stone-100">
                      <div>
                        <span className="text-xxs text-stone-400 font-bold uppercase tracking-wider block">Breed</span>
                        <span className="text-sm font-bold text-stone-800 block mt-0.5">{horse.breed}</span>
                      </div>
                      <div>
                        <span className="text-xxs text-stone-400 font-bold uppercase tracking-wider block">Color</span>
                        <span className="text-sm font-bold text-stone-800 block mt-0.5">{horse.color}</span>
                      </div>
                      <div>
                        <span className="text-xxs text-stone-400 font-bold uppercase tracking-wider block">Age</span>
                        <span className="text-sm font-bold text-stone-800 block mt-0.5">{horse.age} yrs</span>
                      </div>
                      <div>
                        <span className="text-xxs text-stone-400 font-bold uppercase tracking-wider block">DOB</span>
                        <span className="text-sm font-bold text-stone-800 block mt-0.5">{horse.dob || "Unknown"}</span>
                      </div>
                      <div>
                        <span className="text-xxs text-stone-400 font-bold uppercase tracking-wider block">Gender</span>
                        <span className="text-sm font-bold text-stone-800 block mt-0.5">{horse.gender}</span>
                      </div>
                      <div>
                        <span className="text-xxs text-stone-400 font-bold uppercase tracking-wider block">Agisted</span>
                        <span className={`text-sm font-bold block mt-0.5 ${horse.agistedHorse ? "text-amber-700" : "text-stone-850"}`}>
                          {horse.agistedHorse ? "Yes (Agister)" : "No"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Settings Overview */}
                  <div>
                    <h4 className="font-bold text-stone-800 text-xs uppercase tracking-wider mb-3">Care Parameters</h4>
                    <ul className="space-y-2.5 text-xs font-semibold text-stone-600">
                      <li className="flex justify-between p-2.5 border-b border-stone-100">
                        <span>Hoof Shoeing Interval Weeks</span>
                        <span className="text-stone-900 font-bold">{horse.shoeingIntervalWeeks || 6} weeks</span>
                      </li>
                      <li className="flex justify-between p-2.5 border-b border-stone-100">
                        <span>Last Recorded Shoeing Date</span>
                        <span className="text-stone-900 font-bold">{horse.lastShoeingDate || "None registered"}</span>
                      </li>
                      <li className="flex justify-between p-2.5 border-b border-stone-100">
                        <span>Next Scheduled Vet Visit</span>
                        <span className="text-stone-900 font-bold">{horse.nextVetDueDate || "No date set"}</span>
                      </li>
                      <li className="flex justify-between p-2.5 border-b border-stone-100">
                        <span>Last Deworming Date</span>
                        <span className="text-stone-900 font-bold">{horse.lastDewormingDate || "None registered"}</span>
                      </li>
                      <li className="flex justify-between p-2.5 border-b border-stone-100">
                        <span>Last Dental Float Date</span>
                        <span className="text-stone-900 font-bold">{horse.lastDentalDate || "None registered"}</span>
                      </li>
                    </ul>
                  </div>

                  {/* Horse Profile Comments / Discussion Board */}
                  <div className="pt-5 border-t border-stone-150 space-y-3.5">
                    <h4 className="font-bold text-stone-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare size={14} className="text-teal-600" /> Staff Discussion & Mobilization Comments
                    </h4>
                    
                    {/* Add Comment Form */}
                    <form onSubmit={handleSaveComment} className="space-y-3 p-4 bg-teal-50/15 border border-teal-600/15 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-teal-800 uppercase tracking-widest">
                          Add Staff Comment on {horse.name}
                        </span>
                      </div>
                      <div className="relative">
                        <textarea
                          placeholder="Dictate or type comments, exercise notes, or urgent profile observations..."
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          rows={2}
                          required
                          className="w-full bg-white border border-stone-200 rounded-xl p-3 pr-10 text-xs font-semibold focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => (isListening && activeDictationField === "comment") ? stopListening() : startListening("comment")}
                          className={`absolute right-2.5 bottom-2.5 p-1.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                            (isListening && activeDictationField === "comment")
                              ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse"
                              : "bg-teal-50 hover:bg-teal-100 text-teal-700"
                          }`}
                          title={(isListening && activeDictationField === "comment") ? "Stop voice recognition" : "Dictate profile comment"}
                        >
                          {(isListening && activeDictationField === "comment") ? <MicOff size={14} /> : <Mic size={14} />}
                        </button>
                      </div>
                      {isListening && activeDictationField === "comment" && (
                        <p className="text-[10px] text-teal-650 font-bold animate-pulse flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-ping" />
                          Listening... Speak now, text will append. Click red mic to stop.
                        </p>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={isSavingComment || !newCommentText.trim()}
                          className="bg-stone-900 hover:bg-stone-850 text-white font-bold text-xxs px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                        >
                          <Plus size={11} /> Post Comment
                        </button>
                      </div>
                    </form>

                    {/* Comments List */}
                    {profileComments.length === 0 ? (
                      <div className="p-6 bg-stone-50/40 border border-stone-100 rounded-2xl text-center text-stone-500 text-xs">
                        <MessageSquare size={20} className="mx-auto text-stone-300 mb-1.5" />
                        <p className="font-bold text-stone-700 uppercase tracking-wider text-[10px]">No staff comments yet</p>
                        <p className="text-xxs text-stone-400 mt-0.5">Perfect for notes dictated while on the move in the yard.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                        {profileComments.map((comment) => (
                          <div key={comment.id} className="p-3 bg-stone-50 border border-stone-150 rounded-xl space-y-1 relative group">
                            <div className="flex justify-between items-center">
                              <span className="text-xxs font-black text-stone-700 uppercase tracking-wider block">
                                {comment.author}
                              </span>
                              <span className="text-[9px] text-stone-400 font-bold">
                                {comment.createdAt}
                              </span>
                            </div>
                            <p className="text-xs text-stone-850 font-medium whitespace-pre-wrap leading-relaxed pr-6">
                              {comment.text}
                            </p>
                             {(userRole === "admin" || userRole === "owner" || comment.author === currentUser?.name) && (
                              <button
                                onClick={() => handleDeleteComment(comment.id)}
                                className="absolute top-2 right-2 text-stone-400 hover:text-rose-600 transition-colors opacity-60 hover:opacity-100 group-hover:opacity-100 p-1 cursor-pointer"
                                title="Delete comment"
                              >
                                <Trash size={11} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Settings & Clinicals Display */}
              {activeTab === "settings" && (
                <div className="space-y-6 animate-fade-in">
                  {/* Clinical Biometrics Grid */}
                  <div>
                    <h4 className="font-bold text-stone-800 text-xs uppercase tracking-wider mb-3">Clinical Biometrics</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Weight and Height */}
                      <div className="bg-stone-50/60 p-4 rounded-2xl border border-stone-100 space-y-3.5">
                        <div className="flex justify-between items-center pb-2.5 border-b border-stone-100">
                          <span className="text-xs text-stone-550 font-bold">Weight (Lbs)</span>
                          <span className={`text-sm font-extrabold ${horse.weightLbs ? 'text-stone-900' : 'text-amber-600 italic'}`}>
                            {horse.weightLbs ? `${horse.weightLbs} lbs` : "Not recorded"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pb-2.5 border-b border-stone-100">
                          <span className="text-xs text-stone-550 font-bold">Height (Hands)</span>
                          <span className={`text-sm font-extrabold ${horse.heightHands ? 'text-stone-900' : 'text-amber-600 italic'}`}>
                            {horse.heightHands ? `${horse.heightHands} hh` : "Not recorded"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pb-2.5 border-b border-stone-100">
                          <div>
                            <span className="text-xs text-stone-550 font-bold block">Paddock / Stall Location</span>
                            {isChangingPaddock ? (
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="text"
                                  value={newPaddock}
                                  onChange={(e) => setNewPaddock(e.target.value)}
                                  placeholder="e.g. Back Paddock"
                                  className="border border-stone-200 rounded-lg p-1.5 text-xs focus:ring-1 focus:ring-teal-600 focus:outline-hidden font-semibold"
                                />
                                <button
                                  onClick={handleSavePaddock}
                                  className="bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setIsChangingPaddock(false)}
                                  className="text-stone-500 text-[10px] font-bold px-2 py-1"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span className="text-sm font-extrabold text-stone-900 block mt-0.5">
                                {horse.stableNumber || "Not assigned"}
                              </span>
                            )}
                          </div>
                          {!isChangingPaddock && !isPeter && (
                            <button
                              onClick={() => {
                                setNewPaddock(horse.stableNumber || "");
                                setIsChangingPaddock(true);
                              }}
                              className="text-xxs bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all"
                            >
                              Change Paddock
                            </button>
                          )}
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-stone-550 font-bold">Microchip ID Number</span>
                          <span className="text-xs font-mono font-bold text-stone-850">
                            {horse.microchipNumber || "No chip registered"}
                          </span>
                        </div>
                      </div>

                      {/* Temperament & Use Classification */}
                      <div className="bg-stone-50/60 p-4 rounded-2xl border border-stone-100 space-y-3.5">
                        <div className="flex justify-between items-center pb-2.5 border-b border-stone-100">
                          <span className="text-xs text-stone-550 font-bold">Use Classification</span>
                          <span className="text-xs bg-teal-50 border border-teal-200 text-teal-900 font-extrabold px-2.5 py-0.5 rounded-md uppercase tracking-wide">
                            {horse.useClassification || "Therapy"}
                          </span>
                        </div>
                        <div className="pb-2.5 border-b border-stone-100">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-stone-550 font-bold">Temperament Rating</span>
                            <span className="text-xs font-bold text-stone-900">{horse.temperament || "5"}/10</span>
                          </div>
                          {/* Custom visual progress bar */}
                          <div className="w-full bg-stone-200 rounded-full h-2 mt-1.5 overflow-hidden">
                            <div 
                              className="bg-teal-600 h-2 rounded-full transition-all" 
                              style={{ width: `${(Number(horse.temperament) || 5) * 10}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-stone-400 font-semibold block mt-1.5">
                            Rating guide: 1 (Very calm) • 10 (Highly sensitive)
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-stone-550 font-bold">Safety Level</span>
                          <span className={`text-xxs font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                            (Number(horse.temperament) || 5) >= 8 ? "bg-rose-50 text-rose-800 border border-rose-200" :
                            (Number(horse.temperament) || 5) >= 5 ? "bg-amber-50 text-amber-800 border border-amber-250" :
                            "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          }`}>
                            {(Number(horse.temperament) || 5) >= 8 ? "Requires experienced handler" : "Standard care handler"}
                          </span>
                        </div>
                      </div>

                      {/* Horse Profile Tags Display */}
                      {horse.tags && horse.tags.length > 0 && (
                        <div className="bg-stone-50/60 p-4 rounded-2xl border border-stone-100 space-y-2">
                          <span className="text-xs text-stone-550 font-bold block uppercase tracking-wider">Assigned Profile Tags</span>
                          <div className="flex flex-wrap gap-1.5">
                            {horse.tags.map(t => (
                              <span
                                key={t}
                                className="inline-flex items-center px-2.5 py-1 text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200/50 rounded-lg shadow-5xs"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Feeding Protocols */}
                  <div className="p-4 bg-teal-50/10 border border-teal-600/10 rounded-2xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Award className="text-teal-700 shrink-0" size={16} />
                      <h4 className="font-bold text-stone-855 text-xs uppercase tracking-wider">Feed Protocols & Dietary</h4>
                    </div>
                    <p className="text-sm text-stone-700 font-semibold bg-white p-3 rounded-xl border border-stone-150/80 min-h-[60px]">
                      {horse.feedRequirements || "No special dietary rules specified. Standard pasture feeding."}
                    </p>
                  </div>

                  {/* Ownership & Private Contact */}
                  <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80">
                    <h4 className="font-bold text-stone-855 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <User size={14} className="text-teal-600" /> Private Owner Information
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                      <div>
                        <span className="text-xxs text-stone-450 font-bold uppercase tracking-wider block">Registered Owner</span>
                        <span className="text-sm font-bold text-stone-800 block mt-0.5">{horse.ownerName || "Farm Proprietary Herd"}</span>
                      </div>
                      <div>
                        <span className="text-xxs text-stone-450 font-bold uppercase tracking-wider block">Owner Phone Number</span>
                        <span className="text-sm font-bold text-stone-800 block mt-0.5">{horse.ownerPhone || "N/A"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Daily Checks History (7-Day Rolling) */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                    <h4 className="font-bold text-stone-855 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Clock size={14} className="text-teal-600" /> Daily Check History (7-Day Rolling)
                    </h4>
                    {horse.dailyChecksHistory && horse.dailyChecksHistory.length > 0 ? (
                      <div className="space-y-2 mt-2">
                        {horse.dailyChecksHistory.map((check: any, idx: number) => (
                          <div key={check.id || idx} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-stone-150 text-xs shadow-4xs">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-stone-800">{check.date}</span>
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded uppercase">
                                {check.status || "OK"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-stone-400 font-semibold uppercase text-[9px]">
                                Checked By: {check.checkedBy}
                              </span>
                              {(currentUser?.role === "owner" || currentUser?.role === "admin" || currentUser?.name?.toLowerCase() === "system administrator") && (
                                <button
                                  onClick={() => revertDailyCheck(check.id, check.date)}
                                  className="text-stone-400 hover:text-rose-700 p-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="Revert daily check"
                                >
                                  <RotateCw size={11} className="hover:rotate-180 transition-transform duration-500 text-stone-400 hover:text-rose-600" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 italic mt-1 leading-normal">
                        No daily status check records logged in the last 7 days.
                      </p>
                    )}
                  </div>

                  {userRole !== "visitor" && onDeleteHorse && (
                    <div className="mt-4">
                      {showCustomConfirmDelete ? (
                        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 animate-fade-in text-left">
                          <h5 className="font-bold text-rose-900 text-xs uppercase tracking-wider">Confirm Permanent Deletion</h5>
                          <p className="text-stone-600 text-xs mt-1">
                            Are you absolutely sure you want to delete {horse.name} and all associated maintenance logs? This action is irreversible.
                          </p>
                          <div className="flex gap-2.5 mt-3.5 justify-end">
                            <button
                              type="button"
                              onClick={() => setShowCustomConfirmDelete(false)}
                              className="text-xs font-semibold text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteHorse(horse.id);
                                setShowCustomConfirmDelete(false);
                                onClose();
                              }}
                              className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl transition-all cursor-pointer"
                            >
                              Yes, Delete permanently
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-6 border-t border-stone-200 flex justify-end gap-2.5 mt-4">
                          {userRole === "owner" && (
                            <button
                              type="button"
                              disabled={isDuplicating}
                              onClick={handleDuplicateHorse}
                              className="text-xs font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <Award size={14} /> {isDuplicating ? "Duplicating..." : "Duplicate Profile"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowCustomConfirmDelete(true)}
                            className="text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Trash size={14} /> Delete Horse Profile
                          </button>
                        </div>
                  )}
                </div>
              )}
            </div>
          )}

              {/* Tab 4: Documents & Attachments Display */}
              {activeTab === "documents" && (
                <div className="space-y-6 animate-fade-in text-left">
                  <div>
                    <h4 className="font-bold text-stone-855 text-xs uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <FileText size={14} className="text-teal-600" /> Horse Document Registry
                    </h4>
                    <p className="text-xxs text-stone-400 font-bold uppercase tracking-wider leading-relaxed mb-4">
                      Upload vet reports, farrier specs, registration certificates, or pedigree charts for {horse.name}.
                    </p>

                    {/* Drag & Drop Upload Zone */}
                    {userRole !== "visitor" ? (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => !isUploadingDoc && document.getElementById("horse-doc-file-input")?.click()}
                        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5 ${
                          isDragging
                            ? "border-teal-500 bg-teal-500/10 text-teal-850"
                            : "border-stone-250 bg-stone-50/50 text-stone-600 hover:bg-stone-50 hover:border-stone-400"
                        } ${isUploadingDoc ? "pointer-events-none opacity-80" : ""}`}
                      >
                        <input
                          type="file"
                          id="horse-doc-file-input"
                          className="hidden"
                          onChange={handleFileChange}
                          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif"
                          disabled={isUploadingDoc}
                        />
                        <Upload size={32} className={`transition-transform duration-300 ${isUploadingDoc ? "animate-bounce text-teal-600" : "text-stone-400"}`} />
                        <div className="w-full">
                          <span className="text-xs font-extrabold text-stone-800 block">
                            {isUploadingDoc ? `Uploading Document (${uploadProgress}%)...` : "Drag & Drop document here, or click to browse"}
                          </span>
                          {isUploadingDoc && (
                            <div className="w-56 h-2 bg-stone-200 rounded-full mt-2.5 mx-auto overflow-hidden border border-stone-300/40">
                              <div 
                                className="h-full bg-teal-600 transition-all duration-300 rounded-full" 
                                style={{ width: `${uploadProgress}%` }}
                              />
                            </div>
                          )}
                          <span className="text-[10px] text-stone-400 font-semibold block mt-1">
                            Supports PDFs, Images, and Word files up to 800 KB
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-stone-100 rounded-2xl border border-stone-200 text-center text-xs text-stone-400 font-bold uppercase tracking-wider">
                        Visitor mode: Document upload is read-only
                      </div>
                    )}

                    {/* Document Outbox List */}
                    <div className="mt-6 space-y-3">
                      <span className="block text-[10px] font-black uppercase text-stone-400 tracking-wider">
                        Stored Documents ({documents.length})
                      </span>

                      {documents.length === 0 ? (
                        <div className="text-center p-8 bg-stone-50/40 border border-stone-150 rounded-2xl">
                          <FileText size={24} className="mx-auto text-stone-300 mb-2" />
                          <span className="text-xs text-stone-500 font-bold block uppercase tracking-wider">
                            No documents attached yet
                          </span>
                          <p className="text-xxs text-stone-400 mt-1">
                            Uploaded medical charts, dental sheets, and receipts will appear here.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                          {documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="p-3 bg-white border border-stone-150 hover:border-teal-500 rounded-xl transition-all shadow-4xs flex items-center justify-between"
                            >
                              <div 
                                onClick={() => doc.dataUrl && setPreviewingDoc(doc)}
                                className="flex items-center gap-3 min-w-0 flex-1 pr-2 cursor-pointer group/doc"
                              >
                                <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0 group-hover/doc:bg-teal-100/60 group-hover/doc:text-teal-800 transition-all">
                                  <FileText size={18} />
                                </div>
                                <div className="space-y-0.5 min-w-0 text-left">
                                  <span className="block text-xs font-bold text-stone-850 group-hover/doc:text-teal-900 group-hover/doc:underline truncate" title={doc.name}>
                                    {doc.name}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-wide">
                                    <span>{doc.size}</span>
                                    <span>•</span>
                                    <span>{doc.uploadedAt}</span>
                                    <span>•</span>
                                    <span className="truncate text-teal-700 font-extrabold">By: {doc.uploadedBy}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {doc.dataUrl && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setPreviewingDoc(doc)}
                                      className="p-1.5 rounded-lg bg-stone-50 hover:bg-teal-50 text-teal-650 hover:text-teal-900 border border-stone-200 hover:border-teal-300 transition-all flex items-center gap-1 text-[10px] font-black uppercase cursor-pointer shadow-5xs"
                                      title="Preview Document"
                                    >
                                      <Eye size={13} />
                                      <span>View</span>
                                    </button>
                                    {downloadingDocId === doc.id ? (
                                      <div className="flex flex-col items-center justify-center gap-1 px-2.5 py-1.5 bg-teal-50 border border-teal-150 rounded-lg min-w-[75px]">
                                        <span className="text-[9px] font-black text-teal-700 uppercase tracking-widest leading-none">
                                          {downloadProgress}%
                                        </span>
                                        <div className="w-12 h-1 bg-stone-200 rounded-full overflow-hidden">
                                          <div 
                                            className="h-full bg-teal-600 transition-all duration-150"
                                            style={{ width: `${downloadProgress}%` }}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => downloadDocument(doc)}
                                        className="p-1.5 rounded-lg bg-stone-50 hover:bg-teal-100 text-stone-600 hover:text-teal-850 border border-stone-200 hover:border-teal-300 transition-all flex items-center gap-1 text-[10px] font-black uppercase cursor-pointer shadow-5xs"
                                        title="Download / View document"
                                      >
                                        <Download size={13} />
                                        <span>Get</span>
                                      </button>
                                    )}
                                  </>
                                )}
                                {userRole !== "visitor" && (
                                  <button
                                    type="button"
                                    onClick={() => deleteDocument(doc.id, doc.name)}
                                    className="p-1.5 rounded-lg bg-stone-50 hover:bg-rose-100 text-stone-400 hover:text-rose-700 border border-stone-200 hover:border-rose-300 transition-all cursor-pointer shadow-5xs"
                                    title="Delete document"
                                  >
                                    <Trash size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="p-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
          <span className="text-xxs text-stone-400 font-medium">Created: {horse.createdAt}</span>
          <button
            onClick={onClose}
            className="text-xs font-semibold text-stone-600 hover:text-stone-900 border border-stone-200 hover:border-stone-400 bg-white px-4 py-2 rounded-xl transition-all cursor-pointer shadow-xs"
          >
            Close Profile
          </button>
        </div>
      </motion.div>

      {/* Maintainer Details Lookup Modal */}
      <AnimatePresence>
        {selectedMaintainer && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-stone-950/65 backdrop-blur-xs z-[150] flex items-center justify-center p-4 overflow-y-auto cursor-pointer text-left"
            onClick={() => setSelectedMaintainer(null)}
          >
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 350, delay: 0.05 }}
              className="bg-white border border-stone-200 shadow-2xl rounded-3xl max-w-md w-full p-6 space-y-5 cursor-default text-left"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex justify-between items-start pb-3 border-b border-stone-150">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-50 border border-teal-150 rounded-xl flex items-center justify-center text-teal-700 font-black text-sm">
                  {selectedMaintainer.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="text-sm font-black text-stone-900 uppercase tracking-wide">
                    {selectedMaintainer}
                  </h4>
                  <span className="text-[10px] text-teal-650 font-extrabold uppercase tracking-widest mt-0.5 block">
                    {(() => {
                      const nameLower = selectedMaintainer.toLowerCase();
                      if (nameLower.includes("cooper")) return "Farm Co-Owner & IT Administrator";
                      if (nameLower.includes("claire")) return "Farm Co-Owner & Vet Liaison";
                      if (nameLower.includes("mark")) return "Lead Stable Manager & Trainer";
                      if (nameLower.includes("peter")) return "Assistant Stable Hand";
                      if (nameLower.includes("davey") || nameLower.includes("lee")) return "Certified Farrier Specialist";
                      return "Farm Care Technician";
                    })()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedMaintainer(null)}
                className="text-stone-400 hover:text-stone-850 p-1 rounded-lg hover:bg-stone-100 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Biography & Credentials */}
            <div className="bg-stone-50 border border-stone-200/60 rounded-2xl p-4 space-y-2">
              <span className="text-[9px] text-stone-400 font-black uppercase tracking-widest block">
                Professional Bio & Roles
              </span>
              <p className="text-xs font-semibold text-stone-650 leading-relaxed">
                {(() => {
                  const nameLower = selectedMaintainer.toLowerCase();
                  if (nameLower.includes("cooper")) {
                    return "Cooper manages the farm's digital infrastructure, credential access gates, security audits, and financial ledgers. He oversees technical safety logs and firewall blacklists.";
                  }
                  if (nameLower.includes("claire")) {
                    return "Claire coordinates direct veterinary communication, scheduling, and medication auditing. She acts as the primary health overseer for all active paddock herds.";
                  }
                  if (nameLower.includes("mark")) {
                    return "Mark leads stable hand supervision, exercise training regimes, and direct pasture rotations. He is responsible for daily paddock safety and task dispatching.";
                  }
                  if (nameLower.includes("peter")) {
                    return "Peter performs daily physical checks, paddock repairs, feeding schedules, and logs real-time observations of herd temperaments.";
                  }
                  if (nameLower.includes("davey") || nameLower.includes("lee")) {
                    return "Davey Lee is Ruabon Farm's contracted Master Farrier, providing high-precision hoof trim routines, shoe hot-fittings, and therapeutic alignment reports.";
                  }
                  return "Authorized crew member trained in herd husbandry, logging safety, and direct feed compliance.";
                })()}
              </p>
            </div>

            {/* Performance metrics for THIS horse */}
            <div className="grid grid-cols-2 gap-3.5">
              <div className="border border-stone-150 rounded-xl p-3 bg-stone-50/40 text-center">
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block leading-none">
                  Completed Logs
                </span>
                <span className="text-lg font-black text-stone-850 block mt-1.5 leading-none">
                  {logs.filter(l => l.performedBy === selectedMaintainer || l.loggedBy === selectedMaintainer).length}
                </span>
                <span className="text-[8px] text-stone-450 font-bold uppercase tracking-wider block mt-1">
                  On {horse.name}
                </span>
              </div>

              <div className="border border-stone-150 rounded-xl p-3 bg-stone-50/40 text-center">
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block leading-none">
                  Total Budget handled
                </span>
                <span className="text-lg font-black text-stone-850 block mt-1.5 leading-none">
                  ${logs.filter(l => l.performedBy === selectedMaintainer).reduce((sum, l) => sum + Number(l.cost || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="text-[8px] text-stone-450 font-bold uppercase tracking-wider block mt-1">
                  On {horse.name}
                </span>
              </div>
            </div>

            {/* Recent Log History with them */}
            <div className="space-y-2">
              <span className="text-[9px] text-stone-400 font-black uppercase tracking-widest block">
                Care entries recorded by {selectedMaintainer}
              </span>
              <div className="max-h-[140px] overflow-y-auto divide-y divide-stone-150 border border-stone-150 rounded-xl bg-stone-50/20">
                {logs.filter(l => l.performedBy === selectedMaintainer || l.loggedBy === selectedMaintainer).length === 0 ? (
                  <div className="p-4 text-center text-stone-400 text-xxs font-bold uppercase tracking-widest">
                    No matching logs logged for this horse
                  </div>
                ) : (
                  logs.filter(l => l.performedBy === selectedMaintainer || l.loggedBy === selectedMaintainer).map(l => (
                    <div key={l.id} className="p-2.5 hover:bg-stone-50 flex justify-between items-center text-xs">
                      <div className="truncate">
                        <span className="font-extrabold text-stone-800 uppercase text-[10px] block leading-tight">{l.type}</span>
                        <span className="text-[9px] text-stone-400 font-bold block mt-0.5 leading-none">{l.date}</span>
                      </div>
                      <span className="font-mono font-bold text-stone-900 text-xxs bg-white border border-stone-200 px-1.5 py-0.5 rounded shadow-5xs shrink-0">
                        ${l.cost}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-stone-100">
              <button
                onClick={() => setSelectedMaintainer(null)}
                className="bg-stone-900 hover:bg-stone-800 text-white font-black text-xxs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Close Details
              </button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File Preview Modal */}
      <AnimatePresence>
        {previewingDoc && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-stone-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 cursor-pointer text-left"
            onClick={() => setPreviewingDoc(null)}
          >
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 350, delay: 0.05 }}
              className="bg-white w-full max-w-3xl rounded-3xl border border-stone-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] cursor-default text-left"
              onClick={(e) => e.stopPropagation()}
            >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-stone-50 border-b border-stone-150 flex justify-between items-center shrink-0">
              <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                <FileText className="text-teal-600 shrink-0" size={18} />
                <div className="min-w-0">
                  <h3 className="font-black text-stone-900 text-xs uppercase tracking-wide truncate" title={previewingDoc.name}>
                    {previewingDoc.name}
                  </h3>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mt-0.5">
                    {previewingDoc.size} • Uploaded by {previewingDoc.uploadedBy} on {previewingDoc.uploadedAt}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => downloadDocument(previewingDoc)}
                  className="p-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 hover:text-teal-900 transition-all flex items-center gap-1.5 text-xxs font-extrabold uppercase tracking-wider cursor-pointer"
                  title="Download File"
                >
                  <Download size={13} />
                  <span>Get File</span>
                </button>
                {userRole !== "visitor" && (
                  <button
                    onClick={() => deleteDocument(previewingDoc.id, previewingDoc.name)}
                    className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 transition-all flex items-center gap-1.5 text-xxs font-extrabold uppercase tracking-wider cursor-pointer"
                    title="Delete File"
                  >
                    <Trash size={13} />
                    <span>Delete</span>
                  </button>
                )}
                <button
                  onClick={() => setPreviewingDoc(null)}
                  className="p-1.5 hover:bg-stone-150 text-stone-400 hover:text-stone-700 rounded-full transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content / Preview Canvas */}
            <div className="p-6 bg-stone-100 flex-1 overflow-y-auto flex items-center justify-center min-h-[40vh]">
              {previewingDoc.dataUrl ? (
                (() => {
                  const dataUrl = previewingDoc.dataUrl;
                  const isImage = dataUrl.startsWith("data:image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(previewingDoc.name);
                  const isPdf = dataUrl.startsWith("data:application/pdf") || /\.pdf$/i.test(previewingDoc.name);

                  if (isImage) {
                    return (
                      <div className="max-w-full max-h-[65vh] flex items-center justify-center bg-white p-2.5 rounded-2xl shadow-xs border border-stone-200">
                        <img
                          src={dataUrl}
                          alt={previewingDoc.name}
                          className="max-h-[60vh] max-w-full object-contain rounded-lg"
                        />
                      </div>
                    );
                  }

                  if (isPdf) {
                    return (
                      <div className="w-full h-[65vh] bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
                        <iframe
                          src={dataUrl}
                          className="w-full h-full"
                          title={previewingDoc.name}
                        />
                      </div>
                    );
                  }

                  // Text file preview if it looks like raw text
                  if (dataUrl.startsWith("data:text/") || /\.txt$/i.test(previewingDoc.name)) {
                    try {
                      // Attempt to extract base64 text
                      const base64Content = dataUrl.split(",")[1];
                      const decodedText = atob(base64Content);
                      return (
                        <div className="w-full max-h-[65vh] bg-white rounded-2xl p-6 overflow-y-auto text-left font-mono text-xs text-stone-800 border border-stone-200 whitespace-pre-wrap leading-relaxed">
                          {decodedText}
                        </div>
                      );
                    } catch (e) {
                      // Fallback if decode fails
                    }
                  }

                  return (
                    <div className="text-center p-8 bg-white border border-stone-200 rounded-2xl max-w-sm shadow-xs">
                      <FileText size={48} className="mx-auto text-stone-300 mb-4 animate-pulse" />
                      <span className="text-xs font-black text-stone-800 uppercase block tracking-wider">
                        Direct Preview Unavailable
                      </span>
                      <p className="text-[11px] text-stone-500 font-semibold mt-1.5 leading-relaxed">
                        This file format ({previewingDoc.name.split(".").pop()?.toUpperCase()}) cannot be directly previewed inside the browser. Please use the Get File button to download and view it locally.
                      </p>
                      <button
                        onClick={() => downloadDocument(previewingDoc)}
                        className="mt-5 w-full bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs py-3 rounded-xl transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5 uppercase"
                      >
                        <Download size={14} /> Download Document
                      </button>
                    </div>
                  );
                })()
              ) : (
                <div className="text-center p-8 bg-white border border-stone-200 rounded-2xl max-w-sm shadow-xs">
                  <AlertCircle size={32} className="mx-auto text-rose-500 mb-3" />
                  <span className="text-xs font-black text-stone-850 uppercase block">
                    No Document Data Available
                  </span>
                </div>
              )}
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isBrandModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] bg-stone-950/85 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer text-left"
            onClick={() => setIsBrandModalOpen(false)}
          >
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 350, delay: 0.05 }}
              className="bg-stone-900 border border-stone-800 text-stone-100 rounded-3xl p-6 w-full max-w-lg shadow-2xl text-left cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="text-teal-400 animate-pulse" size={16} />
                <h3 className="text-xs font-black uppercase tracking-wider">AI Generated 3D Brand Model</h3>
              </div>
              <button 
                onClick={() => setIsBrandModalOpen(false)}
                className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Rotating 3D Viewport container */}
              <div className="relative h-64 bg-stone-950 rounded-2xl border border-stone-800 flex flex-col items-center justify-center overflow-hidden group">
                <div className="absolute top-3 left-3 bg-teal-950/80 border border-teal-800/50 text-teal-300 font-mono text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
                  Real-time 3D Render
                </div>

                {/* Rotating 3D Object */}
                <div 
                  className="w-40 h-40 rounded-full bg-gradient-to-tr from-stone-800 via-stone-700 to-stone-800 border-2 border-stone-600 flex flex-col items-center justify-center shadow-2xl transition-all duration-700 hover:scale-105"
                  style={{
                    perspective: "1000px",
                    transformStyle: "preserve-3d",
                    animation: "spin-slow 15s linear infinite"
                  }}
                >
                  <style>{`
                    @keyframes spin-slow {
                      0% { transform: rotateY(0deg) rotateX(10deg); }
                      100% { transform: rotateY(360deg) rotateX(10deg); }
                    }
                  `}</style>
                  
                  {/* Brand Content */}
                  <div className="text-center space-y-2 select-none" style={{ transform: "translateZ(30px)" }}>
                    <div className="text-stone-400 font-mono text-[9px] uppercase tracking-wider">Left Brand</div>
                    <div className="text-3xl font-serif font-black text-amber-100 tracking-widest drop-shadow-md">
                      {horse.brandLeft || "—"}
                    </div>
                    <div className="w-12 h-px bg-stone-600 mx-auto" />
                    <div className="text-3xl font-serif font-black text-teal-200 tracking-widest drop-shadow-md">
                      {horse.brandRight || "—"}
                    </div>
                    <div className="text-stone-400 font-mono text-[9px] uppercase tracking-wider">Right Brand</div>
                  </div>
                </div>

                <div className="absolute bottom-3 text-stone-500 font-mono text-[9px] uppercase tracking-wider flex items-center gap-1">
                  <RotateCw size={10} className="animate-spin" style={{ animationDuration: "3s" }} />
                  Drag / Hover to inspect model perspective
                </div>
              </div>

              {/* Information */}
              <div className="grid grid-cols-2 gap-4 text-left font-mono">
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/50">
                  <span className="text-stone-500 text-[8px] uppercase tracking-widest block mb-1">Left Shoulder Brand</span>
                  <span className="text-xs text-amber-100 font-black">{horse.brandLeft || "None Registered"}</span>
                </div>
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/50">
                  <span className="text-stone-500 text-[8px] uppercase tracking-widest block mb-1">Right Shoulder Brand</span>
                  <span className="text-xs text-teal-300 font-black">{horse.brandRight || "None Registered"}</span>
                </div>
              </div>

              {horse.brandingDescription && (
                <div className="bg-stone-950 p-4 rounded-xl border border-stone-800/50 text-left">
                  <span className="text-stone-500 text-[8px] uppercase tracking-widest font-mono block mb-1.5">Branding Description &amp; Distinguishing Marks</span>
                  <p className="text-xxs text-stone-300 font-medium leading-relaxed">{horse.brandingDescription}</p>
                </div>
              )}
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
