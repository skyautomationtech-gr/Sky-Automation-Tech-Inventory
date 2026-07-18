import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

interface BarcodePrintItem {
  value: string;
  label: string;
  subLabel?: string;
}

/**
 * Generates an A4 PDF containing a grid of barcode labels (3 columns x 8 rows = 24 labels per page).
 * Sized nicely for common adhesive sticker sheets (~60mm x 33mm each).
 */
export async function generateBarcodePDF(
  items: BarcodePrintItem[],
  title: string = "Barcode_Labels"
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // A4 dimensions: 210 x 297 mm
  const pageWidth = 210;
  const pageHeight = 297;
  
  // Grid configuration: 3 columns x 8 rows = 24 labels per page
  const cols = 3;
  const rows = 8;
  const marginX = 8;
  const marginY = 12;
  const gapX = 4;
  const gapY = 4;
  
  const labelWidth = (pageWidth - (marginX * 2) - (gapX * (cols - 1))) / cols; // ~62mm
  const labelHeight = (pageHeight - (marginY * 2) - (gapY * (rows - 1))) / rows; // ~31mm

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

    // Draw a subtle border around the label as a cutting/alignment guide
    doc.setDrawColor(220, 225, 230);
    doc.setLineWidth(0.1);
    doc.rect(x, y, labelWidth, labelHeight);

    // Render barcode to an in-memory canvas to get base64 JPEG image
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, item.value, {
        format: 'CODE128',
        width: 2.5,
        height: 70,
        displayValue: false, // We render the human-readable text manually for perfect control
        margin: 0,
        background: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      // Draw product display name on the sticker
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42); // Slate 900
      
      // Truncate name if it's too long
      let displayName = item.label;
      if (displayName.length > 32) {
        displayName = displayName.substring(0, 30) + '...';
      }
      doc.text(displayName, x + 3, y + 4.5);

      // Draw sub-label (Variant properties like Color & Model)
      if (item.subLabel) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139); // Slate 500
        let displaySub = item.subLabel;
        if (displaySub.length > 38) {
          displaySub = displaySub.substring(0, 35) + '...';
        }
        doc.text(displaySub, x + 3, y + 7.5);
      }

      // Draw Barcode Image
      const barcodeY = y + (item.subLabel ? 9 : 6);
      const barcodeHeight = labelHeight - (item.subLabel ? 14.5 : 11.5);
      doc.addImage(imgData, 'JPEG', x + 3, barcodeY, labelWidth - 6, barcodeHeight);

      // Draw Human-readable SKU/Barcode text at the very bottom
      doc.setFont('Courier', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59); // Slate 800
      doc.text(item.value, x + labelWidth / 2, y + labelHeight - 1.5, { align: 'center' });
      
    } catch (err) {
      console.error('Error generating barcode for PDF:', err);
    }

    currentIndex++;
  }

  const sanitizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
  doc.save(`${sanitizedTitle}_barcodes.pdf`);
}
