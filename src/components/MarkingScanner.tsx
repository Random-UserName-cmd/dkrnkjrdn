import React, { useState, useRef, useEffect } from "react";
import { Horse } from "../types";
import { Camera, Upload, X, Sparkles, RefreshCw, AlertTriangle, ShieldCheck, Image as ImageIcon, SplitSquareVertical } from "lucide-react";
import { db } from "../firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "motion/react";

interface MarkingScannerProps {
  horses: Horse[];
  onClose: () => void;
  onSelectHorse: (horseId: string) => void;
  isVisitor?: boolean;
  visitorName?: string;
}

export default function MarkingScanner({ horses, onClose, onSelectHorse, isVisitor, visitorName }: MarkingScannerProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedLeft, setCapturedLeft] = useState<string | null>(null);
  const [capturedRight, setCapturedRight] = useState<string | null>(null);
  const [scanStep, setScanStep] = useState<"left" | "right" | "ready" | "partial">("left");
  const [isPartialMode, setIsPartialMode] = useState(false);
  const [partialSide, setPartialSide] = useState<"left" | "right">("left");
  const [capturedPartial, setCapturedPartial] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    matchedHorseId: string | null;
    confidence: number;
    reasoning: string;
    isPartial?: boolean;
    partialSide?: string;
  } | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const partialFileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-start camera when scanner is opened
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setError(null);
    setCapturedLeft(null);
    setCapturedRight(null);
    setCapturedPartial(null);
    setScanStep(isPartialMode ? "partial" : "left");
    setScanResult(null);
    try {
      if (stream) {
        stopCamera();
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // Prioritize back camera for scanning
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn("Camera access denied or unavailable, falling back to gallery upload:", err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        // Set canvas to match video resolution
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw current frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64 jpeg
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        
        if (isPartialMode) {
          setCapturedPartial(dataUrl);
          setScanStep("ready");
          stopCamera();
          analyzePartialImage(dataUrl, partialSide);
        } else if (scanStep === "left") {
          setCapturedLeft(dataUrl);
          setScanStep("right");
          // Keep stream running so they can capture the right side next!
        } else if (scanStep === "right") {
          setCapturedRight(dataUrl);
          setScanStep("ready");
          stopCamera();
          // Run AI analysis with both photos
          analyzeImages(capturedLeft!, dataUrl);
        }
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (isPartialMode) {
          setCapturedPartial(base64);
          setScanStep("ready");
          stopCamera();
          analyzePartialImage(base64, partialSide);
        } else if (scanStep === "left") {
          setCapturedLeft(base64);
          setScanStep("right");
        } else if (scanStep === "right") {
          setCapturedRight(base64);
          setScanStep("ready");
          stopCamera();
          analyzeImages(capturedLeft!, base64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzePartialImage = async (imgBase64: string, side: "left" | "right") => {
    setIsScanning(true);
    setError(null);
    setScanResult(null);

    try {
      const response = await fetch("/api/scan-marking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imgBase64,
          isPartial: true,
          partialSide: side,
          horses: horses,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to analyze partial horse image.");
      }

      const data = await response.json();
      // Enforce strict accuracy cap: max 50% for partial scans
      const cappedConfidence = Math.min(Number(data.confidence) || 0, 50);
      setScanResult({
        ...data,
        confidence: cappedConfidence,
        isPartial: true,
        partialSide: side,
      });

      if (isVisitor && visitorName && data.matchedHorseId) {
        handleVisitorRecord(data.matchedHorseId);
      }
    } catch (err: any) {
      console.error("Partial scanning error:", err);
      setError(err.message || "An unexpected error occurred during partial AI analysis.");
    } finally {
      setIsScanning(false);
    }
  };

  const analyzeImages = async (leftBase64: string, rightBase64: string) => {
    setIsScanning(true);
    setError(null);
    setScanResult(null);

    try {
      const response = await fetch("/api/scan-marking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageLeft: leftBase64,
          imageRight: rightBase64,
          isPartial: false,
          horses: horses,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to analyze horse image.");
      }

      const data = await response.json();
      // Full scans capped at 99% max (never 100%)
      const cappedConfidence = Math.min(Number(data.confidence) || 0, 99);
      setScanResult({
        ...data,
        confidence: cappedConfidence,
        isPartial: false,
      });

      if (isVisitor && visitorName && data.matchedHorseId) {
        handleVisitorRecord(data.matchedHorseId);
      }
    } catch (err: any) {
      console.error("Scanning error:", err);
      setError(err.message || "An unexpected error occurred during AI analysis.");
    } finally {
      setIsScanning(false);
    }
  };

  const handleVisitorRecord = async (horseId: string) => {
    const matched = horses.find(h => h.id === horseId);
    if (!matched || !visitorName) return;
    try {
      const docRefId = `${visitorName}_${matched.id}`.replace(/\s+/g, "_");
      const existingDocRef = doc(db, "visitor_scanned_horses", docRefId);
      const existingDocSnap = await getDoc(existingDocRef);
      
      let statusToSet = "scanned";
      let docTypesToSet: string[] = [];
      let messageToSet = "Horse scanned successfully. Submit a formal request to access medical or breeding documents.";
      
      if (existingDocSnap.exists()) {
        const existingData = existingDocSnap.data();
        if (existingData.status === "denied" || existingData.status === "pending" || existingData.status === "granted") {
          statusToSet = existingData.status;
          docTypesToSet = existingData.documentTypes || [];
          messageToSet = existingData.message || "";
        }
      }

      await setDoc(existingDocRef, {
        visitorName: visitorName,
        horseId: matched.id,
        horseName: matched.name,
        scanDate: new Date().toLocaleDateString(),
        scannedAt: new Date().toISOString(),
        status: statusToSet,
        documentTypes: docTypesToSet,
        message: messageToSet
      }, { merge: true });
      
      setShowCelebration(true);
    } catch (err) {
      console.error("Error saving visitor scan:", err);
    }
  };

  const getMatchedHorse = () => {
    if (!scanResult || !scanResult.matchedHorseId) return null;
    return horses.find((h) => h.id === scanResult.matchedHorseId) || null;
  };

  const matchedHorse = getMatchedHorse();

  return (
    <div className="fixed inset-0 bg-stone-900/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl border border-stone-200 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        
        {/* Scanner Header */}
        <div className="px-5 py-4 bg-stone-50 border-b border-stone-100 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Sparkles className="text-teal-600 animate-pulse" size={18} />
            <div>
              <h2 className="font-black text-stone-900 text-sm uppercase tracking-wide">Two-Side Brand Scanner</h2>
              <span className="text-[10px] font-bold text-teal-700 uppercase tracking-widest block font-mono">Dual-Angle Nova AI</span>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 hover:bg-stone-100 text-stone-400 hover:text-stone-700 rounded-full transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Box */}
        <div className="p-6 flex-1 overflow-y-auto flex flex-col items-center">
          
          {/* Mode Switcher / Banner */}
          <div className="w-full mb-4 p-2 bg-stone-100 rounded-2xl flex items-center justify-between gap-2 border border-stone-200">
            <button
              type="button"
              onClick={() => {
                setIsPartialMode(false);
                setScanStep("left");
                setCapturedPartial(null);
                setScanResult(null);
                startCamera();
              }}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                !isPartialMode 
                  ? "bg-teal-600 text-white shadow-xs" 
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Full Dual-Angle (Up to 99%)
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPartialMode(true);
                setScanStep("partial");
                setCapturedLeft(null);
                setCapturedRight(null);
                setScanResult(null);
                startCamera();
              }}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                isPartialMode 
                  ? "bg-amber-600 text-white shadow-xs" 
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Partial Scan (Max 50%)
            </button>
          </div>

          {/* Partial Side Selector */}
          {isPartialMode ? (
            <div className="w-full mb-4 p-3 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                  <SplitSquareVertical size={13} /> Select Partial Scan Side
                </span>
                <span className="text-[9px] font-bold text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-full">
                  Max 50% Accuracy Limit
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPartialSide("left");
                    if (capturedPartial) {
                      analyzePartialImage(capturedPartial, "left");
                    }
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer border ${
                    partialSide === "left"
                      ? "bg-amber-600 text-white border-amber-700 shadow-2xs"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  Left Side Partial
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPartialSide("right");
                    if (capturedPartial) {
                      analyzePartialImage(capturedPartial, "right");
                    }
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer border ${
                    partialSide === "right"
                      ? "bg-amber-600 text-white border-amber-700 shadow-2xs"
                      : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  Right Side Partial
                </button>
              </div>
            </div>
          ) : (
            /* Dual-Angle Step Progress Bar */
            <div className="w-full grid grid-cols-2 gap-3 mb-5">
              <div className={`p-2.5 rounded-xl border text-center transition-all ${
                scanStep === "left" 
                  ? "bg-teal-50 border-teal-300 ring-1 ring-teal-300" 
                  : capturedLeft 
                    ? "bg-emerald-50/50 border-emerald-200 text-emerald-800" 
                    : "bg-stone-50 border-stone-200 text-stone-400"
              }`}>
                <div className="text-[10px] font-black uppercase tracking-wider">Step 1</div>
                <div className="text-xs font-bold mt-0.5 truncate flex items-center justify-center gap-1">
                  {capturedLeft ? "Left Side Captured" : <span className="flex items-center gap-1"><Camera size={13} className="text-teal-600" /> Capture Left Side</span>}
                </div>
              </div>

              <div className={`p-2.5 rounded-xl border text-center transition-all ${
                scanStep === "right" 
                  ? "bg-teal-50 border-teal-300 ring-1 ring-teal-300" 
                  : capturedRight 
                    ? "bg-emerald-50/50 border-emerald-200 text-emerald-800" 
                    : "bg-stone-50 border-stone-200 text-stone-400"
              }`}>
                <div className="text-[10px] font-black uppercase tracking-wider">Step 2</div>
                <div className="text-xs font-bold mt-0.5 truncate flex items-center justify-center gap-1">
                  {capturedRight ? "Right Side Captured" : <span className="flex items-center gap-1"><Camera size={13} className="text-teal-600" /> Capture Right Side</span>}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="w-full bg-rose-50 border border-rose-100 text-rose-800 p-4 rounded-2xl text-xs font-semibold flex items-start gap-2.5 mb-5">
              <AlertTriangle className="shrink-0 text-rose-600 mt-0.5" size={15} />
              <div>
                <p className="font-bold">Scanning Failed</p>
                <p className="text-rose-700/90 mt-0.5">{error}</p>
                <button
                  onClick={startCamera}
                  className="mt-2 text-rose-800 font-bold underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={11} /> Try Again
                </button>
              </div>
            </div>
          )}

          {/* Camera Frame / Active Capture */}
          <div className="relative w-full aspect-video bg-stone-950 rounded-2xl border border-stone-800 overflow-hidden shadow-inner flex items-center justify-center">
            {isScanning && (
              /* Moving laser line scanning effect */
              <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-teal-500/0 via-teal-400 to-teal-500/0 top-0 animate-scan-laser shadow-[0_0_10px_2px_rgba(20,184,166,0.6)] z-10" />
            )}

            {isPartialMode && capturedPartial ? (
              <div className="relative w-full h-full">
                <img src={capturedPartial} alt="Partial Scan" className="w-full h-full object-cover" />
                <span className="absolute bottom-2 left-2 text-[9px] font-bold bg-amber-900/80 text-white px-2 py-0.5 rounded uppercase tracking-wider backdrop-blur-xs">
                  {partialSide.toUpperCase()} Side (Partial Scan)
                </span>
              </div>
            ) : scanStep === "ready" && capturedLeft && capturedRight ? (
              /* Side-by-Side Review */
              <div className="grid grid-cols-2 gap-1 w-full h-full">
                <div className="relative">
                  <img src={capturedLeft} alt="Left Side" className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 left-2 text-[9px] font-bold bg-teal-900/80 text-white px-2 py-0.5 rounded uppercase tracking-wider backdrop-blur-xs">Left Side</span>
                </div>
                <div className="relative">
                  <img src={capturedRight} alt="Right Side" className="w-full h-full object-cover" />
                  <span className="absolute bottom-2 left-2 text-[9px] font-bold bg-teal-900/80 text-white px-2 py-0.5 rounded uppercase tracking-wider backdrop-blur-xs">Right Side</span>
                </div>
              </div>
            ) : stream ? (
              /* Live video stream */
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Visual reticle overlay */}
                <div className="absolute inset-6 border-2 border-dashed border-teal-400/40 rounded-xl pointer-events-none flex items-center justify-center">
                  <div className="text-[10px] font-bold text-teal-300 uppercase tracking-widest bg-stone-950/80 px-2.5 py-1 rounded-md border border-teal-500/20 backdrop-blur-xs text-center">
                    Align {isPartialMode ? partialSide.toUpperCase() : (scanStep === "left" ? "LEFT" : "RIGHT")} side branding or markings here
                  </div>
                </div>

                {/* Left Side Thumbnail Overlay when on Right side capture */}
                {!isPartialMode && scanStep === "right" && capturedLeft && (
                  <div className="absolute bottom-3 left-3 w-16 aspect-video bg-black rounded-lg overflow-hidden border border-white/50 shadow-md">
                    <img src={capturedLeft} alt="Left Side Thumbnail" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-teal-900/20 flex items-center justify-center">
                      <span className="text-[7px] text-white font-extrabold uppercase px-1 py-0.5 bg-black/40 rounded">LEFT OK</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Default/Fallback upload state depending on which step we are on */
              <div className="flex flex-col items-center justify-center text-center p-6 text-stone-500">
                <ImageIcon size={32} className="text-stone-700 mb-2" />
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                  {isPartialMode 
                    ? `Upload ${partialSide.toUpperCase()} Side Partial Photo` 
                    : (scanStep === "left" ? "Upload Left Side Photo" : "Upload Right Side Photo")}
                </p>
                <p className="text-[10px] text-stone-500 mt-1 max-w-xs leading-relaxed">
                  Provide camera permissions or upload the photo.
                </p>
              </div>
            )}
          </div>

          {/* Hidden Canvas for capture & File Input for uploads */}
          <canvas ref={canvasRef} className="hidden" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Actions & Controls */}
          <div className="mt-5 flex flex-wrap gap-2.5 w-full justify-center">
            {scanStep !== "ready" && stream && (
              <button
                onClick={handleCapture}
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <Camera size={14} /> 
                {isPartialMode 
                  ? `Capture ${partialSide.toUpperCase()} Partial` 
                  : `Capture ${scanStep === "left" ? "Left Side" : "Right Side"}`}
              </button>
            )}

            {scanStep !== "ready" && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs"
              >
                <Upload size={14} className="text-teal-600" />
                {isPartialMode ? `Upload ${partialSide.toUpperCase()} Photo` : "Upload Photo"}
              </button>
            )}

            {/* Use as Partial Scan Button */}
            {!isPartialMode && (
              <button
                onClick={() => {
                  setIsPartialMode(true);
                  setScanStep("partial");
                  setCapturedLeft(null);
                  setCapturedRight(null);
                  setScanResult(null);
                }}
                className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <SplitSquareVertical size={14} className="text-amber-600" />
                Use this image as a partial scan
              </button>
            )}

            {(capturedLeft || capturedRight || capturedPartial) && !isScanning && (
              <button
                onClick={() => {
                  setCapturedLeft(null);
                  setCapturedRight(null);
                  setCapturedPartial(null);
                  setScanStep(isPartialMode ? "partial" : "left");
                  setScanResult(null);
                  setError(null);
                  startCamera();
                }}
                className="bg-stone-50 hover:bg-stone-100 text-stone-700 border border-stone-200 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw size={13} className="text-teal-600" /> Start Over
              </button>
            )}
          </div>

          {/* AI Scanning Status Loading */}
          {isScanning && (
            <div className="w-full mt-6 py-5 bg-teal-50/20 border border-teal-500/15 rounded-2xl flex flex-col items-center justify-center text-center">
              <div className="w-8 h-8 border-3 border-teal-600/20 border-t-teal-600 rounded-full animate-spin mb-3" />
              <span className="text-xs font-bold text-teal-900 uppercase tracking-wider animate-pulse">
                {isPartialMode ? `Analyzing ${partialSide.toUpperCase()} Partial Marking with Nova AI...` : "Comparing Left & Right Brands with Nova AI..."}
              </span>
              <span className="text-[10px] text-teal-700 font-semibold mt-1">
                {isPartialMode ? "Partial scan accuracy capped at 50% max" : "Analyzing photo pair against pasture specifications (up to 99% accuracy)"}
              </span>
            </div>
          )}

          {/* Results Panel */}
          {scanResult && !isScanning && (
            <div className="w-full mt-6 space-y-4 animate-fade-in">
              {scanResult.matchedHorseId && matchedHorse ? (
                /* Successful Match */
                isVisitor ? (
                  <div className="border border-pink-200 bg-pink-50/15 rounded-2xl p-5 shadow-xs w-full">
                    <div className="flex items-center space-x-2.5 mb-4">
                      <ShieldCheck className="text-pink-600 shrink-0" size={18} />
                      <span className="text-xs font-black text-pink-800 uppercase tracking-wider">
                        Visitor Bio Card {scanResult.isPartial && "(Partial Scan - Max 50%)"}
                      </span>
                    </div>

                    <div className="space-y-4 text-left">
                      <div className="bg-white border border-stone-150 p-4 rounded-xl shadow-3xs">
                        <span className="text-[10px] text-stone-400 font-extrabold uppercase tracking-widest block">Horse Name</span>
                        <span className="text-lg font-black text-stone-900">{matchedHorse.name}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white border border-stone-150 p-4 rounded-xl shadow-3xs">
                          <span className="text-[10px] text-stone-400 font-extrabold uppercase tracking-widest block">Coated Colour</span>
                          <span className="text-sm font-bold text-stone-800">{matchedHorse.color || "Not specified"}</span>
                        </div>
                        <div className="bg-white border border-stone-150 p-4 rounded-xl shadow-3xs">
                          <span className="text-[10px] text-stone-400 font-extrabold uppercase tracking-widest block">Current Age</span>
                          <span className="text-sm font-bold text-stone-800">{matchedHorse.age ? `${matchedHorse.age} years` : "Not specified"}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        stopCamera();
                        onClose();
                      }}
                      className="w-full mt-5 bg-stone-950 hover:bg-stone-800 text-white font-bold text-xs py-3.5 rounded-xl transition-all cursor-pointer shadow-xs text-center block uppercase tracking-wider font-mono"
                    >
                      Done Scanning
                    </button>
                  </div>
                ) : (
                  <div className="border border-teal-200 bg-teal-50/15 rounded-2xl p-5 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-2.5">
                        <ShieldCheck className="text-teal-600 shrink-0" size={18} />
                        <span className="text-xs font-black text-teal-800 uppercase tracking-wider">
                          Match Identified!
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {scanResult.isPartial && (
                          <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                            {scanResult.partialSide?.toUpperCase()} PARTIAL (50% MAX)
                          </span>
                        )}
                        <span className="text-xxs font-black text-teal-700 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20 font-mono">
                          {scanResult.confidence}% CONFIDENCE
                        </span>
                      </div>
                    </div>

                    {/* Micro matched card */}
                    <div className="flex items-center space-x-3.5 bg-white border border-stone-100 p-3.5 rounded-xl mb-4">
                      <div className="w-12 h-12 bg-teal-600/10 rounded-xl border border-teal-600/20 text-teal-800 flex items-center justify-center font-bold text-md uppercase">
                        {matchedHorse.name.substring(0, 2)}
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <span className="font-bold text-stone-900 block truncate text-sm">
                          {matchedHorse.name}
                        </span>
                        <span className="text-xxs text-stone-400 font-bold block uppercase tracking-wider">
                          {matchedHorse.breed} • {matchedHorse.color}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs font-medium text-stone-600 bg-white/70 border border-stone-200/40 rounded-xl p-3 text-left leading-relaxed">
                      {scanResult.reasoning}
                    </p>

                    <button
                      onClick={() => {
                        onSelectHorse(matchedHorse.id);
                        onClose();
                      }}
                      className="w-full mt-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-3 rounded-xl transition-all cursor-pointer shadow-xs text-center block uppercase tracking-wider font-mono"
                    >
                      View Full Profile & Timeline
                    </button>
                  </div>
                )
              ) : (
                /* Unsuccessful Match */
                <div className="border border-stone-200 bg-stone-50 rounded-2xl p-5 text-center">
                  <AlertTriangle className="text-stone-400 mx-auto mb-2.5" size={24} />
                  <p className="text-xs font-black text-stone-700 uppercase tracking-wider">
                    No Matching Horse Found
                  </p>
                  <p className="text-xs text-stone-500 font-medium mt-1.5 max-w-sm mx-auto">
                    {scanResult.reasoning || "We couldn't confidently identify any matching horse from these images."}
                  </p>
                  <div className="mt-4 pt-3.5 border-t border-stone-200/50 flex flex-col gap-2">
                    <p className="text-[10px] text-stone-400 font-semibold uppercase">Suggestions:</p>
                    <ul className="text-[10px] text-stone-500 list-disc list-inside space-y-1 text-left leading-relaxed">
                      <li>Ensure proper daylight or well-lit conditions.</li>
                      <li>Hold camera level and focus clearly on Left Shoulder/Hip then Right Shoulder/Hip brands.</li>
                      <li>Make sure Left Side and Right Side brand descriptions match in the horses' files.</li>
                      <li>For partial scans, accuracy is capped at 50% max. Use full dual-angle scan for up to 99% accuracy.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCelebration && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-stone-900/95 z-50 flex flex-col items-center justify-center p-6 text-center"
          >
            {/* Confetti particles / rotating background glow */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
              className="absolute w-72 h-72 rounded-full bg-gradient-to-tr from-teal-550/20 via-emerald-500/15 to-transparent blur-2xl opacity-80"
            />
            
            <div className="relative z-10 max-w-sm space-y-6">
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 10, stiffness: 100 }}
                className="w-20 h-20 bg-gradient-to-tr from-emerald-500 to-teal-600 rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20"
              >
                <ShieldCheck size={44} className="text-white" />
              </motion.div>
              
              <div className="space-y-2">
                <motion.h3 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-lg font-black text-white uppercase tracking-wider"
                >
                  Horse Scanned!
                </motion.h3>
                
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-stone-300 text-xs leading-relaxed"
                >
                  Successfully matched <strong className="text-emerald-400">{matchedHorse?.name}</strong>! 
                  They are now registered in your dashboard history. You can view their basic details there, or submit a request for their official document packages.
                </motion.p>
              </div>

              {/* Staggered mini particles */}
              <div className="flex justify-center gap-1.5 py-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0, y: 10 }}
                    animate={{ scale: [0, 1.2, 1], y: [10, -5, 0] }}
                    transition={{ delay: 0.4 + i * 0.08, duration: 0.6 }}
                    className="text-teal-400"
                  >
                    <Sparkles size={14} className="animate-pulse" />
                  </motion.span>
                ))}
              </div>

              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <button
                  onClick={() => {
                    setShowCelebration(false);
                    stopCamera();
                    onClose();
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-black uppercase py-3.5 px-6 rounded-2xl transition-all shadow-md cursor-pointer hover:scale-102"
                >
                  Return to Dashboard
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
