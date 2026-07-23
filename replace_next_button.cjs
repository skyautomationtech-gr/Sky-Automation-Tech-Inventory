const fs = require('fs');
let content = fs.readFileSync('src/components/OrderManagement.tsx', 'utf8');

const target = `              {wizardStep < 5 ? (
                <button
                  type="button"
                  onClick={() => {
                    // Quick validation per step`;

const replacement = `              {wizardStep === 3 ? (
                 <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Use 'Proceed to Checkout' in Cart</div>
              ) : wizardStep < 5 ? (
                <button
                  type="button"
                  onClick={() => {
                    // Quick validation per step`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/OrderManagement.tsx', content);
