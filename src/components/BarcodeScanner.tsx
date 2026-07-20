import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Image, AlertCircle } from 'lucide-react';

interface Props {
  onScan: (decodedText: string) => void;
  onCancel: () => void;
}

export const BarcodeScanner: React.FC<Props> = ({ onScan, onCancel }) => {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    
    const startCamera = async () => {
      try {
        const scannerConfig = {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE
          ],
          verbose: false
        };
        const html5QrCode = new Html5Qrcode("reader", scannerConfig);
        html5QrCodeRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // 70% width, 40% height of the actual video stream
            qrbox: (videoWidth, videoHeight) => {
              return {
                width: Math.round(videoWidth * 0.7),
                height: Math.round(videoHeight * 0.4)
              };
            }
          },
          (decodedText) => {
            if (isMounted) {
              // Successfully decoded
              html5QrCode.stop().then(() => {
                onScan(decodedText);
              }).catch(() => {
                onScan(decodedText);
              });
            }
          },
          () => {
            // Ignore scan failures on individual frames
          }
        );

        if (isMounted) {
          setIsCameraActive(true);
        }
      } catch (err) {
        console.error("Camera start error:", err);
        if (isMounted) {
          setError("Failed to access camera. Please check permissions or try 'Scan an image file'.");
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, [onScan]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
        setIsCameraActive(false);
      }

      const scannerConfig = {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false
      };
      const scanner = new Html5Qrcode("reader", scannerConfig);
      html5QrCodeRef.current = scanner;

      const decodedText = await scanner.scanFile(file, true);
      onScan(decodedText);
    } catch (err) {
      console.error("File scanning error:", err);
      setError("Failed to scan barcode from the selected image. Please try another one.");
    }
  };

  const handleCancelClick = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.warn("Info: Error stopping scanner on cancel:", err);
      }
    }
    onCancel();
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
        /* Ensure the video naturally scales inside its container without distortion */
        #reader video {
          width: 100% !important;
          height: auto !important;
          object-fit: contain !important;
          display: block;
        }
        /* Completely hide any default UI (shaded regions, corner brackets) injected by html5-qrcode */
        #reader > div {
          display: none !important;
        }
        /* Keep the canvas if it's there but hide it if it's not the video overlay */
        #reader canvas:not(.html5-qrcode-video) {
          display: none !important;
        }
      `}</style>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Header */}
      <div className="w-full max-w-md bg-[#16161b] rounded-2xl px-5 py-4 flex items-center justify-between border border-slate-800 shadow-lg mt-4">
        <span className="font-bold tracking-tight text-sm uppercase text-slate-200">
          Scan Barcode
        </span>
        <button 
          onClick={handleCancelClick}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Viewfinder Container */}
      <div className="relative w-full max-w-sm flex flex-col items-center justify-center my-8 rounded-2xl overflow-hidden bg-black shadow-2xl border border-slate-800">
        
        {/* The target div for html5-qrcode */}
        <div id="reader" className="w-full relative"></div>
        
        {/* Our exact 70% x 40% UI overlay placed over the video feed */}
        {isCameraActive && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            {/* Target box matching the qrbox config exactly (70% width, 40% height) */}
            <div className="relative" style={{ width: '70%', height: '40%' }}>
              
              {/* Top Left */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#D4AF37]" />
              {/* Top Right */}
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#D4AF37]" />
              {/* Bottom Left */}
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#D4AF37]" />
              {/* Bottom Right */}
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#D4AF37]" />
              
              {/* Laser line */}
              <div className="absolute left-0 w-full h-[2px] bg-[#D4AF37] scan-laser shadow-[0_0_8px_#D4AF37]" />
            </div>
          </div>
        )}
      </div>

      {/* Helper text */}
      <div className="text-center mb-6">
        <p className="text-sm font-semibold text-slate-200 mb-1">
          Align barcode within the frame
        </p>
        <p className="text-xs text-slate-500">
          Hold steady to scan automatically
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="w-full max-w-sm mb-6 bg-red-950/40 border border-red-500/20 text-red-300 p-3 rounded-2xl text-xs flex items-center gap-2.5 shadow-sm">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="font-medium leading-relaxed">{error}</p>
        </div>
      )}

      {/* Bottom Actions */}
      <div className="w-full max-w-md bg-[#16161b] rounded-3xl p-5 flex flex-col gap-3 border border-slate-800 shadow-xl mb-4">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 bg-[#D4AF37] text-slate-950 font-bold py-3 px-4 rounded-xl hover:bg-amber-500 transition-all text-sm shadow-md"
        >
          <Image size={18} />
          Scan an image file
        </button>
        <button
          onClick={handleCancelClick}
          className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold py-3 px-4 rounded-xl transition-all text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
