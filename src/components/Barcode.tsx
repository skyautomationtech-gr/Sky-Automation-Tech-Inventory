import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeProps {
  value: string;
  format?: 'CODE128' | 'CODE39' | 'EAN13' | 'UPC';
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
  background?: string;
  lineColor?: string;
}

export default function Barcode({
  value,
  format = 'CODE128',
  width = 2.5,
  height = 70,
  displayValue = true,
  fontSize = 11,
  margin = 8,
  background = 'transparent',
  lineColor = '#0f172a', // Slate 900
}: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format,
          width,
          height,
          displayValue,
          fontSize,
          margin,
          background,
          lineColor,
        });
      } catch (err) {
        console.error('Failed to render barcode:', err);
      }
    }
  }, [value, format, width, height, displayValue, fontSize, margin, background, lineColor]);

  return <svg ref={svgRef} className="max-w-full h-auto" />;
}
