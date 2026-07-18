import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Image, AlertCircle, RefreshCw } from 'lucide-react';

const scannerConfig = {
  formatsToSupport: [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.CODABAR,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.ITF
  ],
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true
  },
  verbose: false
};

interface Props {
  onScan: (decodedText: string) => void;
  onCancel: () => void;
}

export const BarcodeScanner: React.FC<Props> = ({ onScan, onCancel }) => {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const startCamera = async () => {
      try {
        setIsInitializing(true);
        setError(null);
        const html5QrCode = new Html5Qrcode("reader", scannerConfig as any);
        html5QrCodeRef.current = html5QrCode;

        await html5QrCode.start(
          { 
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          {
            fps: 20,
            qrbox: (width, height) => {
              // Custom scanning region box size optimized for linear/1D barcodes and QR codes
              return {
                width: Math.min(width * 0.85, 280),
                height: Math.min(height * 0.4, 110)
              };
            }
          },
          (decodedText) => {
            console.log("SCAN DETECTED:", decodedText);
            if (isMounted) {
              html5QrCode.stop().then(() => {
                onScan(decodedText);
              }).catch(() => {
                onScan(decodedText);
              });
            }
          },
          () => {
            // Noise handler
          }
        );

        if (isMounted) {
          setIsCameraActive(true);
          setIsInitializing(false);
        }
      } catch (err: any) {
        console.error("Camera start error:", err);
        if (isMounted) {
          setIsInitializing(false);
          setIsCameraActive(false);
          setError("ক্যামেরা চালু করা যায়নি। অনুগ্রহ করে পারমিশন চেক করুন অথবা ফাইল আপলোড করুন।");
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(err => console.error("Error stopping scanner on unmount:", err));
      }
    };
  }, [onScan]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      // Create or use existing scanner instance to parse file
      let scanner = html5QrCodeRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode("reader", scannerConfig as any);
        html5QrCodeRef.current = scanner;
      }

      const decodedText = await scanner.scanFile(file, true);
      console.log("SCAN FILE DETECTED:", decodedText);
      onScan(decodedText);
    } catch (err) {
      console.error("File scanning error:", err);
      setError("ছবি থেকে বারকোড স্ক্যান করা সম্ভব হয়নি। অন্য একটি ছবি চেষ্টা করুন।");
    }
  };

  const handleCancelClick = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.error("Error stopping scanner on cancel:", err);
      }
    }
    onCancel();
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0b0e]/95 backdrop-blur-md flex flex-col items-center justify-between p-4 font-sans text-white">
      <style>{`
        @keyframes scan {
          0% { top: 5%; }
          50% { top: 95%; }
          100% { top: 5%; }
        }
        .scan-laser {
          animation: scan 2.5s ease-in-out infinite;
        }
        #reader video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          border-radius: 1rem;
        }
      `}</style>

      {/* Hidden file selector */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Header Bar */}
      <div className="w-full max-w-md bg-[#16161b] rounded-2xl px-5 py-4 flex items-center justify-between border border-slate-800 shadow-lg mt-4">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 bg-[#D4AF37] rounded-full animate-ping" />
          <span className="font-bold tracking-tight text-sm uppercase text-slate-200">
            বারকোড স্ক্যানার / Scan Barcode
          </span>
        </div>
        <button 
          onClick={handleCancelClick}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors duration-200"
        >
          <X size={18} />
        </button>
      </div>

      {/* Camera Viewfinder Box */}
      <div className="relative w-full max-w-sm aspect-square bg-[#121217] rounded-3xl border border-slate-800 overflow-hidden flex flex-col items-center justify-center shadow-2xl my-8">
        {/* Actual Live Feed div */}
        <div id="reader" className="absolute inset-0 w-full h-full"></div>

        {/* Custom Visual Overlay Guides (Visible while camera is active) */}
        {isCameraActive && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
            <div className="relative w-[280px] h-[110px] flex items-center justify-center">
              {/* Gold Corner Brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-[#D4AF37] rounded-tl-xl"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-[#D4AF37] rounded-tr-xl"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-[#D4AF37] rounded-bl-xl"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-[#D4AF37] rounded-br-xl"></div>

              {/* Laser Scanning Line */}
              <div className="absolute left-0 w-full h-[2.5px] bg-[#D4AF37] shadow-[0_0_12px_#D4AF37] scan-laser"></div>
            </div>
          </div>
        )}

        {/* Loader State */}
        {isInitializing && (
          <div className="absolute inset-0 bg-[#0b0b0e]/80 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="animate-spin text-[#D4AF37]" size={28} />
            <p className="text-xs text-slate-400">ক্যামেরা চালু করা হচ্ছে...</p>
          </div>
        )}

        {/* Fallback Display if no camera active */}
        {!isCameraActive && !isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#121217]">
            <AlertCircle className="text-[#D4AF37] mb-3" size={32} />
            <p className="text-sm font-semibold mb-1">ক্যামেরা অ্যাক্সেস পাওয়া যায়নি</p>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              বারকোড স্ক্যান করতে ক্যামেরা পারমিশন প্রয়োজন। আপনি নিচে "ফাইল থেকে স্ক্যান করুন" এ ক্লিক করে ছবি নির্বাচন করতে পারেন।
            </p>
          </div>
        )}
      </div>

      {/* Helper text label */}
      {isCameraActive && (
        <p className="text-xs text-slate-400 text-center font-medium max-w-xs mb-4">
          বারকোডটি ফ্রেমের ভেতরে সোজাভাবে ধরে রাখুন
          <br />
          <span className="text-[10px] text-slate-500 font-mono mt-1 block">Align barcode within the center frame</span>
        </p>
      )}

      {/* Error state indicator */}
      {error && (
        <div className="w-full max-w-sm mb-4 bg-red-950/40 border border-red-500/20 text-red-300 p-3 rounded-2xl text-xs flex items-center gap-2.5 shadow-sm">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="font-medium leading-relaxed">{error}</p>
        </div>
      )}

      {/* Bottom Action Area */}
      <div className="w-full max-w-md bg-[#16161b] rounded-3xl p-5 flex flex-col gap-3 border border-slate-800 shadow-xl mb-4">
        {/* Upload Button fallback */}
        <button
          type="button"
          onClick={triggerFileInput}
          className="w-full flex items-center justify-center gap-2 bg-[#D4AF37] text-slate-950 font-bold py-3 px-4 rounded-xl hover:bg-amber-500 active:scale-[0.98] transition-all duration-150 text-sm"
        >
          <Image size={18} />
          ফাইল থেকে স্ক্যান করুন / Scan an image file
        </button>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={handleCancelClick}
          className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold py-2.5 px-4 rounded-xl active:scale-[0.98] transition-all duration-150 text-xs"
        >
          বাতিল করুন / Cancel
        </button>
      </div>
    </div>
  );
};
