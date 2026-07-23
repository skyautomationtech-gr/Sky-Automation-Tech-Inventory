const fs = require('fs');
let content = fs.readFileSync('src/components/InvoiceManagement.tsx', 'utf8');
const newBlock = fs.readFileSync('/tmp/new_invoice_block.tsx', 'utf8');

const startStr = '{/* A4 PRINT CONTAINER (STRICT BLACK AND WHITE FOR PRINTING) */}';
const endStr = '{/* Void Reason Dialog Modal */}';

const startIndex = content.indexOf(startStr);
const endDialogIndex = content.indexOf(endStr);

if (startIndex !== -1 && endDialogIndex !== -1) {
  const beforeModal = content.substring(0, endDialogIndex);
  
  // Find the exact closing elements for the modal outer structure.
  // We want to stop replacing before the </div> that closes the `<div className="fixed inset-0...` modal wrappers.
  // In the file, the modal wrappers are closed with </div>\n            </div>\n          </div>\n        </div>\n      )}
  // Just find `      )}` before `endDialogIndex`.
  const braceIndex = beforeModal.lastIndexOf('      )}');
  if (braceIndex !== -1) {
    const endOfPrintArea = beforeModal.substring(0, braceIndex);
    // Find the last `</div>` before the outer divs
    // Actually, looking at the file structure:
    //      )}
    //      {/* Void Reason Dialog Modal */}
    // The `)}` belongs to the `selectedInvoice && (` expression.
    // The original invoice-print-area div has exactly one </div> that closes it. But it's inside other divs.
    // Let's replace from `startIndex` up to `braceIndex` EXCEPT the closing divs of the modal wrapper.
    
    // The wrappers around the print area are:
    /*
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-100 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            ...
            <div className="flex-1 overflow-y-auto p-8 relative">
              <div className="max-w-[210mm] mx-auto relative group">
                ...
                {/* A4 PRINT CONTAINER ...
                <div id="invoice-print-area">
                ...
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    */
    
    // Thus, from `</div>` of the print-area to `)}`, there are exactly 4 closing `</div>` tags.
    const lastPart = beforeModal.substring(braceIndex); // "      )}\n\n      "
    
    // Instead of parsing, let's just use regex on the exact file content lines
    // We already know lines 607 to 749 contain the print area and its closing tag, but let's just count.
  }
}
