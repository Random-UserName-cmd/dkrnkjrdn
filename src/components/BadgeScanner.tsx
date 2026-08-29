import React, { useState, useRef, useEffect } from "react";
import { SystemUser } from "../types";
import { Camera, Upload, X, ShieldAlert, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";

interface BadgeScannerProps {
  onClose: () => void;
  onScanSuccess: (user: SystemUser) => void;
  crewList: SystemUser[];
  visitorList?: any[];
}

export default function BadgeScanner({ onClose, onScanSuccess, crewList, visitorList = [] }: BadgeScannerProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setError(null);
    setCapturedImage(null);
    try {
      if (stream) {
        stopCamera();
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" }, // Front camera is usually better for selfie badge scanning
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn("Front camera access unavailable, falling back to upload:", err);
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
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setCapturedImage(dataUrl);
        stopCamera();
        analyzeBadge(dataUrl);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setCapturedImage(base64);
        stopCamera();
        analyzeBadge(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeBadge = async (base64Photo: string) => {
    setIsScanning(true);
    setError(null);

    try {
      const response = await fetch("/api/scan-badge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Photo,
          crewList,
          visitorList,
        }),
      });

      if (!response.ok) {
        throw new Error("Server badge verification failed.");
      }

      const data = await response.json();
      
      if (data.identified && data.name) {
        // Match with crew List
        const matchedUser = crewList.find(
          (u) => u.name.toLowerCase() === data.name.toLowerCase()
        );
        if (matchedUser) {
          onScanSuccess(matchedUser);
          onClose();
          return;
        }

        // Match with visitor List
        const matchedVisitor = visitorList.find(
          (v) => v.name.toLowerCase() === data.name.toLowerCase()
        );
        if (matchedVisitor) {
          const visitorUser: SystemUser = {
            name: matchedVisitor.name,
            pin: matchedVisitor.pin || "0000",
            role: "visitor",
            avatarColor: matchedVisitor.isAgistorRider ? "bg-emerald-500/10 text-emerald-800 border-emerald-500/20" : "bg-pink-500/10 text-pink-800 border-pink-500/20",
            title: matchedVisitor.title || (matchedVisitor.isAgistorRider ? "Agistor / Rider" : "Pre-Authorized Guest"),
            isAgistorRider: !!matchedVisitor.isAgistorRider,
            canLogMaintenance: !!matchedVisitor.canLogMaintenance,
            canLogDailyChecks: !!matchedVisitor.canLogDailyChecks,
          };
          onScanSuccess(visitorUser);
          onClose();
          return;
        }

        throw new Error(`User '${data.name}' read from badge is not in this facility's authorized personnel or visitor roster.`);
      } else {
        throw new Error(data.reasoning || "Could not read employee/visitor ID badge. Ensure it is clearly visible.");
      }
    } catch (err: any) {
      console.error("Badge scan error:", err);
      setError(err.message || "An error occurred while validating the badge photo.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-stone-900 w-full max-w-md rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-all">
        
        {/* Header */}
        <div className="px-5 py-4 bg-stone-50 dark:bg-stone-850 border-b border-stone-150 dark:border-stone-800 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Sparkles className="text-teal-600 dark:text-teal-400 animate-pulse" size={18} />
            <div>
              <h2 className="font-black text-stone-900 dark:text-white text-xs uppercase tracking-wide">Crew Badge Scanner</h2>
              <span className="text-[9px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-widest block font-mono">Gemini QR Login Station</span>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 rounded-full cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto flex flex-col items-center">
          {error && (
            <div className="w-full bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-800 dark:text-rose-400 p-4 rounded-2xl text-xs font-semibold flex items-start gap-2.5 mb-4">
              <AlertTriangle className="shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" size={15} />
              <div>
                <p className="font-bold">Badge Scan Failed</p>
                <p className="text-rose-700 dark:text-rose-450/90 mt-0.5">{error}</p>
                <button
                  onClick={startCamera}
                  className="mt-2 text-rose-800 dark:text-teal-400 font-bold underline flex items-center gap-1 cursor-pointer text-[10px] uppercase tracking-wider"
                >
                  <RefreshCw size={11} /> Try Again
                </button>
              </div>
            </div>
          )}

          <div className="relative w-full aspect-square max-w-[280px] bg-stone-950 rounded-2xl border border-stone-800 overflow-hidden shadow-inner flex items-center justify-center">
            {isScanning && (
              <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-teal-500/0 via-teal-400 to-teal-500/0 top-0 animate-scan-laser shadow-[0_0_10px_2px_rgba(20,184,166,0.6)] z-10" />
            )}

            {capturedImage ? (
              <img src={capturedImage} alt="Captured Badge" className="w-full h-full object-cover" />
            ) : stream ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-8 border-2 border-dashed border-teal-400/40 rounded-xl pointer-events-none flex items-center justify-center">
                  <div className="text-[9px] font-bold text-teal-300 uppercase tracking-widest bg-stone-950/80 px-2.5 py-1.5 rounded border border-teal-500/20 backdrop-blur-xs text-center max-w-[180px]">
                    Hold employee card QR badge in this frame
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-6 text-stone-500">
                <ShieldAlert size={32} className="text-stone-700 mb-2" />
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Upload Badge Photo</p>
                <p className="text-[10px] text-stone-500 mt-1 max-w-[180px] leading-relaxed">
                  Provide camera access or upload your crew card badge photo.
                </p>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="mt-5 flex gap-2.5 w-full justify-center">
            {!capturedImage && stream && (
              <button
                onClick={handleCapture}
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-5 py-3 rounded-2xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <Camera size={14} /> Scan Badge Photo
              </button>
            )}

            {!capturedImage && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-750 text-stone-700 dark:text-stone-250 border border-stone-200 dark:border-stone-700 font-bold text-xs px-4 py-3 rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer shadow-3xs"
              >
                <Upload size={14} className="text-teal-600 dark:text-teal-400" /> Upload File
              </button>
            )}

            {capturedImage && !isScanning && (
              <button
                onClick={startCamera}
                className="bg-stone-50 dark:bg-stone-850 hover:bg-stone-100 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-750 font-bold text-xs px-4 py-3 rounded-2xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RefreshCw size={13} className="text-teal-600 dark:text-teal-400" /> Scan Again
              </button>
            )}
          </div>

          {isScanning && (
            <div className="w-full mt-6 py-5 bg-teal-50/20 border border-teal-500/15 rounded-2xl flex flex-col items-center justify-center text-center">
              <div className="w-6 h-6 border-2 border-teal-600/20 border-t-teal-600 rounded-full animate-spin mb-2" />
              <span className="text-[10px] font-black text-teal-900 dark:text-teal-400 uppercase tracking-wider animate-pulse">
                Verifying ID Credentials...
              </span>
              <span className="text-[8px] text-teal-700 dark:text-teal-500 font-bold mt-0.5">
                Gemini Vision scanning card text and QR grid
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
