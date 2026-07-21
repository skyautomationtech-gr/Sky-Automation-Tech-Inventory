import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface Props {
  onScan: (text: string) => void;
  onCancel: () => void;
}

export const BarcodeScanner: React.FC<Props> = ({ onScan, onCancel }) => {
  const [isScannerInitialized, setIsScannerInitialized] = useState(false);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    
    // Slight delay to ensure the div is rendered before initializing
    const timer = setTimeout(() => {
      scanner = new Html5QrcodeScanner(
        "reader",
        { 
          fps: 10, 
          qrbox: 250,
          formatsToSupport: [Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.QR_CODE]
        },
        false
      );
      
      scanner.render(
        (decodedText) => {
          if (scanner) {
            scanner.clear();
          }
          onScan(decodedText);
        },
        (error) => {
          // Ignored to avoid console spam during normal scanning
        }
      );
      
      setIsScannerInitialized(true);
    }, 100);

    return () => { 
      clearTimeout(timer);
      if (scanner) {
        scanner.clear().catch(() => {}); 
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex justify-between items-center p-4 bg-gray-900 text-white">
        <h2 className="text-lg font-semibold">Scan Barcode / QR</h2>
        <button onClick={onCancel} className="p-2 hover:bg-gray-800 rounded-lg text-red-400">
          Cancel
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center bg-white">
        {/* The library requires an element with an ID of "reader" */}
        <div id="reader" className="w-full max-w-md"></div>
        {!isScannerInitialized && (
          <p className="mt-4 text-gray-500">Initializing scanner...</p>
        )}
      </div>
    </div>
  );
};
