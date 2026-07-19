import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

interface BarcodePrintItem {
  value: string;
  label: string;
  subLabel?: string;
}

/**
 * Generates an A4 PDF containing a grid of barcode labels (4 columns x 9 rows = 36 labels per page).
 * Each individual label is sized exactly to 1.5 inches x 1 inch (38.1mm x 25.4mm).
 * Sized perfectly for standard small sticker label printing at 100% scale.
 */
export async function generateBarcodePDF(
  items: BarcodePrintItem[],
  title: string = "Barcode_Labels"
) {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  });

  // A4 dimensions: 210 x 297 mm
  // 1.5 inches = 38.1 mm
  // 1.0 inch = 25.4 mm
  const labelWidth = 38.1;
  const labelHeight = 25.4;

  // Grid configuration: 4 columns x 9 rows = 36 labels per page
  const cols = 4;
  const rows = 9;

  // Margin and Gaps calculated to perfectly center the 4x9 grid on A4 (210 x 297 mm)
  // Total width: 4 * 38.1 + 3 * 9.2 = 152.4 + 27.6 = 180 mm -> marginX = 15 mm (Total 210 mm)
  // Total height: 9 * 25.4 + 8 * 3.55 = 228.6 + 28.4 = 257 mm -> marginY = 20 mm (Total 297 mm)
  const marginX = 15;
  const marginY = 20;
  const gapX = 9.2;
  const gapY = 3.55;

  let currentIndex = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Calculate page and positions
    const pageIndex = Math.floor(currentIndex / (cols * rows));
    const positionInPage = currentIndex % (cols * rows);
    const colIndex = positionInPage % cols;
    const rowIndex = Math.floor(positionInPage / cols);

    if (currentIndex > 0 && positionInPage === 0) {
      doc.addPage();
    }

    // Coordinates for this label
    const x = marginX + colIndex * (labelWidth + gapX);
    const y = marginY + rowIndex * (labelHeight + gapY);

    // Draw a very subtle border around the label as an alignment/cut guide for the sticker sheet
    doc.setDrawColor(230, 235, 240);
    doc.setLineWidth(0.08);
    doc.rect(x, y, labelWidth, labelHeight);

    // Render barcode to an in-memory canvas to get base64 JPEG image
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, item.value, {
        format: 'CODE128',
        width: 3.5, // Thicker bars for maximum scannability
        height: 100,
        displayValue: false, // Rendered manually for perfect sizing/control
        margin: 0,
        background: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      // 1. Draw product display name on the sticker (centered, bold, small)
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42); // Slate 900
      
      // Truncate name if it's too long to fit one line
      let displayName = item.label;
      if (displayName.length > 25) {
        displayName = displayName.substring(0, 23) + '...';
      }
      const titleWidth = doc.getTextWidth(displayName);
      doc.text(displayName, x + (labelWidth - titleWidth) / 2, y + 3.8);

      // 2. Draw sub-label (Variant properties like Color / Model)
      if (item.subLabel) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(5.0);
        doc.setTextColor(100, 116, 139); // Slate 500
        let displaySub = item.subLabel;
        if (displaySub.length > 30) {
          displaySub = displaySub.substring(0, 27) + '...';
        }
        const subWidth = doc.getTextWidth(displaySub);
        doc.text(displaySub, x + (labelWidth - subWidth) / 2, y + 6.2);
      }

      // 3. Draw Barcode Image (take majority of the middle area, wide, tall enough)
      const barcodeY = y + (item.subLabel ? 7.5 : 5.2);
      const barcodeHeight = 14.0;
      doc.addImage(imgData, 'JPEG', x + 2.0, barcodeY, labelWidth - 4.0, barcodeHeight, undefined, 'FAST', 0);

      // 4. Draw Human-readable SKU/Barcode text below the bars (standard barcode convention)
      doc.setFont('Courier', 'bold');
      doc.setFontSize(6.0);
      doc.setTextColor(30, 41, 59); // Slate 800
      const codeWidth = doc.getTextWidth(item.value);
      doc.text(item.value, x + (labelWidth - codeWidth) / 2, y + labelHeight - 1.6);
      
    } catch (err) {
      console.error('Error generating barcode for PDF:', err);
    }

    currentIndex++;
  }

  const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
  doc.save(`${sanitizedTitle}_barcodes_1_5x1_in.pdf`);
}
