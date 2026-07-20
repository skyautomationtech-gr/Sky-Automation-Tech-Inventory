import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Image, AlertCircle, Zap, ZapOff, Scan, ChevronRight, Barcode as BarcodeIcon } from 'lucide-react';
import { getProducts } from '../firebase/db';
import { Product } from '../types';

interface Props {
  onScan: (decodedText: string) => void;
  onCancel: () => void;
}

interface RecentScan {
  code: string;
  productName?: string;
  timestamp: number;
}

export const BarcodeScanner: React.FC<Props> = ({ onScan, onCancel }) => {
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [scanMode, setScanMode] = useState<'barcode' | 'qr'>('barcode');
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [productsCache, setProductsCache] = useState<Product[]>([]);
  
  const isMounted = useRef(true);

  // Load recent scans from session storage (simple persistence) and fetch products for mapping
  useEffect(() => {
    isMounted.current = true;
    
    try {
      const stored = sessionStorage.getItem('recent_scans');
      if (stored) {
        setRecentScans(JSON.parse(stored));
      }
    } catch (e) { }

    // Fetch products quietly to match names
    getProducts(true).then(products => {
      if (isMounted.current) setProductsCache(products);
    }).catch(() => {});

    return () => {
      isMounted.current = false;
    };
  }, []);

  const addRecentScan = useCallback((code: string) => {
    setRecentScans(prev => {
      let matchedName = undefined;
      // Try to find product match
      const p = productsCache.find(prod => prod.barcodeValue === code || prod.sku === code || prod.variants.some(v => v.barcodeValue === code));
      if (p) matchedName = p.name;
      
      const newScan: RecentScan = { code, productName: matchedName, timestamp: Date.now() };
      const filtered = prev.filter(s => s.code !== code);
      const updated = [newScan, ...filtered].slice(0, 3); // Keep last 3
      sessionStorage.setItem('recent_scans', JSON.stringify(updated));
      return updated;
    });
  }, [productsCache]);

  const stopCamera = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
        if (html5QrCodeRef.current.clear) html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn("Info: Error stopping scanner:", err);
      }
    }
  };

  const startCamera = useCallback(async () => {
    try {
      await stopCamera();
      setIsCameraActive(false);
      setFlashOn(false);
      setFlashSupported(false);

      const formats = scanMode === 'barcode' 
        ? [Html5QrcodeSupportedFormats.CODE_128] 
        : [Html5QrcodeSupportedFormats.QR_CODE];

      const scannerConfig = {
        formatsToSupport: formats,
        verbose: false
      };
      
      const html5QrCode = new Html5Qrcode("reader", scannerConfig);
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { 
          facingMode: "environment",
          // Request high resolution to prevent mobile browsers from aggressively center-cropping (zooming)
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        {
          fps: 10,
          // 70% width, 40% height of the actual video stream
          qrbox: (videoWidth, videoHeight) => {
            const w = Math.round(videoWidth * 0.7);
            const h = Math.round(videoHeight * 0.4);
            return { width: w, height: h };
          }
        },
        (decodedText) => {
          if (isMounted.current) {
            addRecentScan(decodedText);
            html5QrCode.stop().then(() => {
              onScan(decodedText);
            }).catch(() => {
              onScan(decodedText);
            });
          }
        },
        () => {
          // Ignore frame errors
        }
      );

      if (isMounted.current) {
        setIsCameraActive(true);
        // Check for torch capability
        try {
          const track = html5QrCode.getRunningTrackCameraCapabilities();
          if (track && track.torchFeature().isSupported()) {
            setFlashSupported(true);
          }
        } catch (e) {
          // capability check failed or not supported
        }
      }
    } catch (err) {
      console.error("Camera start error:", err);
      if (isMounted.current) {
        setError("Failed to access camera. Please check permissions or try 'Scan an image file'.");
      }
    }
  }, [scanMode, onScan, addRecentScan]);

  // Restart camera when scanMode changes
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera]);

  const toggleFlash = async () => {
    if (!html5QrCodeRef.current || !isCameraActive || !flashSupported) return;
    try {
      const newFlashState = !flashOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: newFlashState } as any]
      });
      setFlashOn(newFlashState);
    } catch (err) {
      console.warn("Could not toggle flash", err);
    }
  };

  const handleManualScan = () => {
    // This is purely a UI visual nudge button, the continuous scanner is already running.
    // In a real app we might capture the current frame, but html5-qrcode doesn't expose it easily.
    // We provide visual feedback by briefly flashing the viewfinder box.
    const reader = document.getElementById("reader-overlay");
    if (reader) {
      reader.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
      setTimeout(() => {
        if (reader) reader.style.backgroundColor = "transparent";
      }, 150);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      await stopCamera();
      setIsCameraActive(false);

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
      addRecentScan(decodedText);
      onScan(decodedText);
    } catch (err) {
      console.error("File scanning error:", err);
      setError("Failed to scan barcode from the selected image. Please try another one.");
    }
  };

  const handleCancelClick = async () => {
    await stopCamera();
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#16161a] overflow-y-auto flex flex-col font-sans text-white">
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
        #reader {
          width: 100% !important;
          height: auto !important;
        }
        #reader video {
          width: 100% !important;
          height: auto !important;
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
        
        .bg-stripes {
          background-image: repeating-linear-gradient(
            -45deg,
            rgba(255, 255, 255, 0.02),
            rgba(255, 255, 255, 0.02) 10px,
            transparent 10px,
            transparent 20px
          );
        }
      `}</style>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />

      <div className="flex-1 w-full max-w-md mx-auto flex flex-col p-5 pb-8 min-h-screen">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-xl text-white">Scanner</h2>
          <button 
            onClick={handleCancelClick}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setScanMode('barcode')}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
              scanMode === 'barcode' 
                ? 'bg-[#E5B55C] text-slate-950 shadow-md' 
                : 'bg-transparent border border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Barcode
          </button>
          <button
            onClick={() => setScanMode('qr')}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
              scanMode === 'qr' 
                ? 'bg-[#E5B55C] text-slate-950 shadow-md' 
                : 'bg-transparent border border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            QR code
          </button>
        </div>

        {/* Viewfinder Area */}
        {/* Removed min-h and fixed heights so it perfectly shrink-wraps the video, fixing alignment */}
        <div className="relative w-full bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800 mb-8">
          
          {/* Subtle striped background for the camera box behind the feed */}
          <div className="absolute inset-0 bg-stripes pointer-events-none opacity-30"></div>

          {/* The target div for html5-qrcode */}
          <div id="reader" className="w-full relative z-10"></div>
          
          {/* Status Pill */}
          {isCameraActive && (
            <div className="absolute top-4 left-4 z-20 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-sm font-medium text-white tracking-wide">scanning</span>
            </div>
          )}

          {/* Overlay UI */}
          {isCameraActive && (
            <div id="reader-overlay" className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 transition-colors duration-150">
              {/* Target box matching the qrbox config exactly (70% width, 40% height) */}
              <div className="relative" style={{ width: '70%', height: '40%' }}>
                
                {/* Top Left */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-[#E5B55C] rounded-tl-lg" />
                {/* Top Right */}
                <div className="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-[#E5B55C] rounded-tr-lg" />
                {/* Bottom Left */}
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-[#E5B55C] rounded-bl-lg" />
                {/* Bottom Right */}
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-[#E5B55C] rounded-br-lg" />
                
                {/* Laser line */}
                <div className="absolute left-0 w-full h-[2px] bg-[#E5B55C] scan-laser shadow-[0_0_8px_#E5B55C]" />
              </div>
              
              <div className="absolute bottom-6 left-0 w-full text-center">
                <p className="text-sm text-slate-300 font-medium">Place code within the frame to scan</p>
              </div>
            </div>
          )}

          {!isCameraActive && !error && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-900/50 backdrop-blur-sm">
              <div className="w-6 h-6 border-2 border-[#E5B55C] border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-30 bg-red-950/80 backdrop-blur-md border border-red-500/30 text-red-300 p-4 rounded-2xl text-sm flex flex-col items-center text-center gap-2 shadow-xl">
              <AlertCircle size={20} className="text-red-400" />
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        {/* Actions Row */}
        <div className="flex items-center justify-center gap-6 mb-10">
          <button
            onClick={toggleFlash}
            disabled={!flashSupported}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              flashSupported 
                ? flashOn 
                  ? 'bg-slate-100 text-slate-900' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-900/50 text-slate-600 cursor-not-allowed border border-slate-800/50'
            }`}
            aria-label="Toggle Flash"
          >
            {flashOn ? <Zap size={22} /> : <ZapOff size={22} />}
          </button>
          
          <button
            onClick={handleManualScan}
            className="w-20 h-20 rounded-full bg-[#E5B55C] text-slate-950 flex items-center justify-center shadow-[0_0_20px_rgba(229,181,92,0.3)] hover:scale-105 active:scale-95 transition-all"
            aria-label="Scan Now"
          >
            <Scan size={28} strokeWidth={2.5} />
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-14 h-14 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700 transition-all"
            aria-label="Upload from Gallery"
          >
            <Image size={22} />
          </button>
        </div>

        {/* Recent Scans */}
        <div className="mt-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-base">Recent scans</h3>
            {recentScans.length > 0 && (
              <button className="text-[#E5B55C] text-sm font-semibold hover:underline">
                View all
              </button>
            )}
          </div>
          
          <div className="space-y-3">
            {recentScans.length === 0 ? (
              <div className="bg-[#1c1c22] rounded-2xl p-6 text-center border border-slate-800/50">
                <p className="text-slate-500 text-sm">No recent scans</p>
              </div>
            ) : (
              recentScans.map((scan, idx) => (
                <div key={`${scan.code}-${idx}`} className="bg-[#1c1c22] border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex items-center justify-between group transition-colors cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-[#E5B55C] border border-slate-800 group-hover:border-[#E5B55C]/30 transition-colors">
                      <BarcodeIcon size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-200 text-sm mb-0.5">{scan.code}</p>
                      <p className="text-sm text-slate-500 truncate max-w-[180px]">
                        {scan.productName || 'Unknown Product'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

