const fs = require('fs');
const content = fs.readFileSync('src/components/OrderManagement.tsx', 'utf8');

const startStr = '{wizardStep === 3 && (';
const endStr = '{/* STEP 4: PAYMENT OPTIONS */}';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  // We need to keep '{wizardStep === 3 && (' and replace the content inside, but maybe just replace the whole block up to ')}' before step 4.
  // The structure is:
  // {wizardStep === 3 && (
  //   <div className="space-y-4">
  //     ...
  //   </div>
  // )}
  // {/* STEP 4: PAYMENT OPTIONS */}
  
  const endBlockIndex = content.lastIndexOf(')}', endIndex);
  if (endBlockIndex !== -1 && endBlockIndex > startIndex) {
    const newCode = `{wizardStep === 3 && (
                <div className="space-y-4">
                  <CatalogItemSelection 
                    products={products}
                    orderItems={orderItems}
                    setOrderItems={setOrderItems}
                    onNext={() => setWizardStep(4)}
                  />
                </div>
              )}`;
    
    // Actually wait, there is a Next/Back button block AT THE END of all steps.
    // So CatalogItemSelection shouldn't duplicate Next button. But wait! The prompt said:
    // "Whether the operator used "Buy Now" ... or built a full cart via "Add to Cart" ... A "Proceed to Checkout" button in the cart view moves forward to the next step"
    // So the cart has a "Proceed to Checkout" button.
    // The standard Next button at the bottom of the wizard will also be there. But maybe we can hide it for Step 3?
    
    // Let's replace the whole step 3 block.
    
    const result = content.substring(0, startIndex) + newCode + '\n              ' + content.substring(endIndex);
    fs.writeFileSync('src/components/OrderManagement.tsx', result);
    console.log('Replaced Step 3 successfully.');
  }
} else {
  console.log('Could not find boundaries.');
}
