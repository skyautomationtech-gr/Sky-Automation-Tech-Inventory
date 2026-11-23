import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { ReportColumnMeta } from './reports';

export interface ReportExportPermissions {
  canViewProfit: boolean;
  canViewSupplier: boolean;
}

export function filterPermittedReportColumns(
  columns: ReportColumnMeta[],
  permissions: ReportExportPermissions
): ReportColumnMeta[] {
  return columns.filter((col) => {
    if (col.requiresProfit && !permissions.canViewProfit) return false;
    if (col.requiresSupplier && !permissions.canViewSupplier) return false;
    return true;
  });
}

function sanitizeCellValue(raw: unknown, isNumeric?: boolean): string | number {
  if (raw === null || raw === undefined || raw === '') return isNumeric ? 0 : '';
  if (isNumeric) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  const str = String(raw);
  // Neutralize spreadsheet formula prefix characters on text cells
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

function formatDisplayCell(raw: unknown, col: ReportColumnMeta): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (col.numeric) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }
  return String(raw);
}

function escapeHtmlText(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function exportReportToExcel(params: {
  title: string;
  filename: string;
  subBrandLabel: string;
  filterSummary: string;
  columns: ReportColumnMeta[];
  rows: Array<Record<string, any>>;
  permissions: ReportExportPermissions;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const { title, filename, subBrandLabel, filterSummary, columns, rows, permissions, onProgress } = params;
  const permittedCols = filterPermittedReportColumns(columns, permissions);
  if (permittedCols.length === 0) {
    throw new Error('No permitted columns available to export.');
  }

  onProgress?.(10);

  const generatedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const aoa: Array<Array<string | number>> = [
    [title],
    [`Sub-Brand: ${subBrandLabel} | Exported: ${generatedAt}`],
    [`Active Filters: ${filterSummary || 'All Records'}`],
    [],
    permittedCols.map((c) => c.header),
  ];

  const headerRowIndex = 4; // 0-indexed -> Row 5 in Excel
  const CHUNK_SIZE = 400;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    for (const row of chunk) {
      aoa.push(permittedCols.map((col) => sanitizeCellValue(row[col.key], col.numeric)));
    }
    const pct = 10 + Math.round(((i + chunk.length) / Math.max(1, rows.length)) * 75);
    onProgress?.(Math.min(85, pct));
    // Yield thread for large datasets so UI remains smooth
    if (rows.length > CHUNK_SIZE) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = permittedCols.map((c) => ({ wch: c.width || Math.max(14, c.header.length + 4) }));
  // Freeze title + filter metadata + header row
  (ws as any)['!views'] = [{ state: 'frozen', ySplit: headerRowIndex + 1 }];

  const wb = XLSX.utils.book_new();
  const safeSheetName = title.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Report';
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);

  onProgress?.(95);
  const finalName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, finalName);
  onProgress?.(100);
}

/**
 * Exports clean strictly black-and-white hex-only A4 PDF (zero oklch CSS variables).
 * Slices rows cleanly per page so table rows never split mid-line across page breaks.
 */
export async function exportReportToPdf(params: {
  title: string;
  filename: string;
  subBrandLabel: string;
  filterSummary: string;
  columns: ReportColumnMeta[];
  rows: Array<Record<string, any>>;
  permissions: ReportExportPermissions;
  kpis?: Array<{ label: string; value: string; requiresProfit?: boolean; requiresSupplier?: boolean }>;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const {
    title,
    filename,
    subBrandLabel,
    filterSummary,
    columns,
    rows,
    permissions,
    kpis = [],
    onProgress,
  } = params;

  const permittedCols = filterPermittedReportColumns(columns, permissions);
  if (permittedCols.length === 0) {
    throw new Error('No permitted columns available for PDF export.');
  }

  const visibleKpis = kpis.filter((k) => {
    if (k.requiresProfit && !permissions.canViewProfit) return false;
    if (k.requiresSupplier && !permissions.canViewSupplier) return false;
    return true;
  });

  const isLandscape = permittedCols.length > 6;
  const orientation = isLandscape ? 'landscape' : 'portrait';
  const rowsPerPage = isLandscape ? 18 : 26;
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  const generatedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Strict A4 pixel canvas dimensions at 96dpi (~1122x794 landscape, 794x1122 portrait)
  const pageWidthPx = isLandscape ? 1120 : 790;
  const pageHeightPx = isLandscape ? 790 : 1120;

  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.zIndex = '-1';
  host.style.background = '#ffffff';
  host.style.color = '#0f172a';
  document.body.appendChild(host);

  try {
    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const start = pageIdx * rowsPerPage;
      const slice = rows.slice(start, start + rowsPerPage);

      const pageEl = document.createElement('div');
      pageEl.style.width = `${pageWidthPx}px`;
      pageEl.style.minHeight = `${pageHeightPx}px`;
      pageEl.style.padding = '28px 30px 24px 30px';
      pageEl.style.boxSizing = 'border-box';
      pageEl.style.backgroundColor = '#ffffff';
      pageEl.style.color = '#0f172a';
      pageEl.style.fontFamily = 'Arial, Helvetica, sans-serif';
      pageEl.style.display = 'flex';
      pageEl.style.flexDirection = 'column';
      pageEl.style.justifyContent = 'space-between';

      const kpiStripHtml =
        pageIdx === 0 && visibleKpis.length > 0
          ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
              ${visibleKpis
                .map(
                  (k) => `
                <div style="border:1px solid #cbd5e1;background:#f8fafc;padding:6px 10px;border-radius:6px;min-width:120px;">
                  <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">${escapeHtmlText(k.label)}</div>
                  <div style="font-size:13px;color:#0f172a;font-weight:700;margin-top:2px;">${escapeHtmlText(k.value)}</div>
                </div>`
                )
                .join('')}
            </div>`
          : '';

      const tableHeadersHtml = permittedCols
        .map(
          (col) => `
          <th style="padding:7px 6px;border-bottom:2px solid #0f172a;border-top:1px solid #cbd5e1;background:#f1f5f9;color:#0f172a;font-size:10px;font-weight:700;text-align:${
            col.numeric ? 'right' : 'left'
          };white-space:nowrap;">${escapeHtmlText(col.header)}</th>`
        )
        .join('');

      const tableRowsHtml =
        slice.length === 0
          ? `<tr><td colspan="${permittedCols.length}" style="padding:24px;text-align:center;font-size:11px;color:#475569;">No records match the active filters.</td></tr>`
          : slice
              .map((row, idx) => {
                const rowBg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
                return `<tr style="background:${rowBg};">
                  ${permittedCols
                    .map(
                      (col) => `
                      <td style="padding:6px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:10px;line-height:1.35;text-align:${
                        col.numeric ? 'right' : 'left'
                      };">${escapeHtmlText(formatDisplayCell(row[col.key], col))}</td>`
                    )
                    .join('')}
                </tr>`;
              })
              .join('');

      pageEl.innerHTML = `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px;">
            <div>
              <div style="font-size:16px;font-weight:800;color:#0f172a;">${escapeHtmlText(title)}</div>
              <div style="font-size:10px;color:#334155;margin-top:3px;">Brand Scope: ${escapeHtmlText(
                subBrandLabel
              )} &nbsp;|&nbsp; Filters: ${escapeHtmlText(filterSummary || 'All Records')}</div>
            </div>
            <div style="text-align:right;font-size:10px;color:#334155;">
              <div style="font-weight:700;color:#0f172a;">Generated</div>
              <div>${escapeHtmlText(generatedAt)}</div>
            </div>
          </div>

          ${kpiStripHtml}

          <table style="width:100%;border-collapse:collapse;table-layout:auto;">
            <thead>
              <tr>${tableHeadersHtml}</tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #cbd5e1;padding-top:8px;margin-top:12px;font-size:9px;color:#475569;">
          <span>Pre-Order Management System · Official Report Export</span>
          <span>Rows ${slice.length > 0 ? start + 1 : 0}–${start + slice.length} of ${rows.length} &nbsp;|&nbsp; Page ${
        pageIdx + 1
      } of ${totalPages}</span>
        </div>
      `;

      host.innerHTML = '';
      host.appendChild(pageEl);

      const canvas = await html2canvas(pageEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => {
          // Strip Tailwind v4 oklch styles from cloned document stylesheets so html2canvas never throws
          clonedDoc.querySelectorAll('style').forEach((styleEl) => {
            if (styleEl.textContent && styleEl.textContent.includes('oklch')) {
              styleEl.textContent = styleEl.textContent.replace(/oklch\([^)]*\)/g, '#0f172a');
            }
          });
        },
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdfPageW = pdf.internal.pageSize.getWidth();
      const pdfPageH = pdf.internal.pageSize.getHeight();
      if (pageIdx > 0) pdf.addPage(undefined, orientation);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfPageW, pdfPageH, undefined, 'FAST');

      onProgress?.(Math.round(((pageIdx + 1) / totalPages) * 95));
      await new Promise((r) => setTimeout(r, 0));
    }

    const finalName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(finalName);
    onProgress?.(100);
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}
