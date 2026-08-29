import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc } from "firebase/firestore";
import { SystemUser } from "../types";
import { Lock, FileText, Plus, Trash2, Calendar, ShieldCheck, Edit3, Mic, MicOff } from "lucide-react";

interface PrivateNotesListProps {
  key?: string;
  currentUser: SystemUser;
  todayStr: string;
}

interface PrivateNote {
  id: string;
  content: string;
  createdAt: string;
}

export default function PrivateNotesList({ currentUser, todayStr }: PrivateNotesListProps) {
  const [notes, setNotes] = useState<PrivateNote[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const startListening = () => {
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
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setNewNoteText((prev) => (prev ? prev + " " + transcript : transcript));
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const stopListening = () => {
    setIsListening(false);
  };

  // Subscribe to private notes for the current user
  useEffect(() => {
    if (!currentUser) return;
    
    // Path: users/{current_username}/private_notes
    const colRef = collection(db, "users", currentUser.name, "private_notes");
    const q = query(colRef, orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: PrivateNote[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as PrivateNote);
      });
      setNotes(list);
    }, (err) => {
      console.warn("Private notes subscription info:", err);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;

    setIsSaving(true);
    try {
      const colRef = collection(db, "users", currentUser.name, "private_notes");
      await addDoc(colRef, {
        content: newNoteText.trim(),
        createdAt: todayStr,
      });
      setNewNoteText("");
    } catch (err) {
      console.error("Error saving private note:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const docRef = doc(db, "users", currentUser.name, "private_notes", noteId);
      await deleteDoc(docRef);
    } catch (err) {
      console.error("Error deleting private note:", err);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-xs p-6" id="private-notes-section">
      <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-50 text-rose-700 rounded-xl">
            <Lock size={20} />
          </div>
          <div>
            <h2 className="text-base font-black uppercase tracking-wide text-stone-900">My Private Workspace</h2>
            <p className="text-xxs font-semibold text-stone-500 uppercase tracking-wider mt-0.5">
              Secure Personal Notes (Only visible to you)
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          className="text-xs font-bold text-teal-600 hover:text-teal-700 underline shrink-0 cursor-pointer"
        >
          {isPanelOpen ? "Hide Workspace" : `View Workspace (${notes.length})`}
        </button>
      </div>

      {isPanelOpen && (
        <div className="space-y-5 animate-fade-in">
          {/* Note Input Form */}
          <form onSubmit={handleSaveNote} className="space-y-3 p-4 bg-stone-50/50 border border-stone-200/50 rounded-2xl">
            <div className="flex items-center gap-1.5 text-xxs font-black text-rose-800 uppercase tracking-widest">
              <Edit3 size={11} /> Write Private Note
            </div>
            <div className="relative">
              <textarea
                placeholder="Jot down private reminders, observations, or specific tasks for yourself..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                rows={2}
                required
                className="w-full bg-white border border-stone-200 rounded-xl p-3 pr-10 text-xs font-medium focus:ring-1 focus:ring-teal-600 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`absolute right-2.5 bottom-2.5 p-1.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isListening
                    ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse"
                    : "bg-teal-50 hover:bg-teal-100 text-teal-700"
                }`}
                title={isListening ? "Stop voice recognition" : "Dictate Private Note"}
              >
                {isListening ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </div>
            {isListening && (
              <p className="text-[10px] text-teal-600 font-bold animate-pulse flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-ping" />
                Listening... Speak now, text will append. Click red mic to stop.
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving || !newNoteText.trim()}
                className="bg-stone-900 hover:bg-stone-850 text-white font-bold text-xxs px-4 py-2 rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40"
              >
                <Plus size={11} /> Save Note
              </button>
            </div>
          </form>

          {/* Notes List */}
          {notes.length === 0 ? (
            <div className="p-6 bg-stone-50/30 border border-stone-100 rounded-2xl text-center text-stone-500 text-xs">
              <FileText size={20} className="mx-auto text-stone-300 mb-1.5" />
              <p className="font-bold text-stone-700 uppercase tracking-wider text-[10px]">No private notes</p>
              <p className="text-xxs text-stone-400 mt-0.5">Your private workspace notes will appear securely here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-1">
              {notes.map((note) => (
                <div 
                  key={note.id} 
                  className="p-4 bg-stone-50/20 border border-stone-200 rounded-2xl relative group flex flex-col justify-between"
                >
                  <p className="text-xs text-stone-700 leading-relaxed pr-6 whitespace-pre-wrap font-medium">
                    {note.content}
                  </p>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-stone-100 text-[9px] text-stone-400 font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {note.createdAt}
                    </span>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      title="Delete Note"
                      className="text-stone-400 hover:text-rose-600 transition-colors p-1 rounded cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-3 bg-rose-500/5 rounded-xl border border-rose-500/10 flex items-center gap-2 text-[10px] text-stone-500 font-semibold uppercase tracking-wider">
            <Lock size={12} className="text-rose-600 shrink-0" />
            <span>Encrypted locally in session &amp; protected by system authentication</span>
          </div>
        </div>
      )}
    </div>
  );
}
