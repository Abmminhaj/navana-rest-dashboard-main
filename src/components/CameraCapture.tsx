import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, X, Check } from "lucide-react";
import { buttonGhost, buttonPrimary } from "@/components/ui-kit";

interface CameraCaptureProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}

// Downscale + compress the captured frame the same way uploaded files are
// compressed (see compressImage in booking.tsx), so photos taken via camera
// behave consistently with photos taken via file upload.
function captureFrame(video: HTMLVideoElement, maxDimension = 1000, quality = 0.75) {
  let width = video.videoWidth;
  let height = video.videoHeight;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function CameraCapture({ open, title, onClose, onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setCaptured(null);
    setError("");

    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access failed:", err);
        setError(
          "ক্যামেরা চালু করা যায়নি। ব্রাউজারে ক্যামেরা পারমিশন দেওয়া আছে কিনা দেখো, অথবা ফাইল আপলোড ব্যবহার করো।"
        );
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  function handleClose() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose();
  }

  function handleCapture() {
    if (!videoRef.current) return;
    try {
      setCaptured(captureFrame(videoRef.current));
    } catch (err) {
      console.error("Frame capture failed:", err);
      setError("ছবি তোলা যায়নি, আবার চেষ্টা করো।");
    }
  }

  function handleUsePhoto() {
    if (!captured) return;
    onCapture(captured);
    handleClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
              {captured ? (
                <img src={captured} alt="Captured" className="h-full w-full object-cover" />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          {!error && captured && (
            <button
              type="button"
              onClick={() => setCaptured(null)}
              className={buttonGhost}
            >
              <RotateCcw className="h-4 w-4" /> আবার তোলো
            </button>
          )}
          {!error && !captured && (
            <button type="button" onClick={handleClose} className={buttonGhost}>
              বাতিল
            </button>
          )}
          {!error && !captured && (
            <button type="button" onClick={handleCapture} className={buttonPrimary}>
              <Camera className="h-4 w-4" /> ছবি তোলো
            </button>
          )}
          {!error && captured && (
            <button type="button" onClick={handleUsePhoto} className={buttonPrimary}>
              <Check className="h-4 w-4" /> এই ছবিটি ব্যবহার করো
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
