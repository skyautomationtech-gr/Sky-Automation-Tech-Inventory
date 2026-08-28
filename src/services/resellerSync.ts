import { Product } from '../types';

export interface ResellerSyncConfig {
  enabled: boolean;
  secondaryProjectId: string;
  secondaryApiKey?: string;
  secondaryCollectionName: string; // default 'products'
  webhookUrl?: string;
  syncPrices: boolean;
  syncStock: boolean;
  autoSyncOnAdd: boolean;
  autoSyncOnUpdate: boolean;
  lastSyncedAt?: number;
}

const DEFAULT_CONFIG: ResellerSyncConfig = {
  enabled: false,
  secondaryProjectId: '',
  secondaryApiKey: '',
  secondaryCollectionName: 'products',
  webhookUrl: '',
  syncPrices: true,
  syncStock: true,
  autoSyncOnAdd: true,
  autoSyncOnUpdate: true
};

export function getResellerSyncConfig(): ResellerSyncConfig {
  try {
    const raw = localStorage.getItem('sat_reseller_sync_config');
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.warn('[ResellerSync] Failed to read config from localStorage:', err);
  }
  return DEFAULT_CONFIG;
}

export function saveResellerSyncConfig(config: ResellerSyncConfig): void {
  try {
    localStorage.setItem('sat_reseller_sync_config', JSON.stringify(config));
  } catch (err) {
    console.error('[ResellerSync] Failed to save config:', err);
  }
}

/**
 * Clean product payload sent to Sky Reseller app.
 * STRICTLY ONLY PRODUCT DATA - NO ORDERS, NO CUSTOMERS, NO FINANCIAL RECORDS.
 */
export function buildResellerProductPayload(product: Product, config: ResellerSyncConfig) {
  return {
    id: product.id,
    sku: product.sku || '',
    name: product.name,
    category: product.category || product.mainCategory || 'General',
    brand: product.brand || '',
    subBrand: product.subBrand || 'SAT',
    sellingPrice: config.syncPrices ? (product.sellingPrice || 0) : undefined,
    wholesalePrice: config.syncPrices ? ((product as any).wholesalePrice || product.sellingPrice || 0) : undefined,
    costPrice: product.costPrice || 0,
    images: product.images || [],
    description: (product as any).description || '',
    variants: (product.variants || []).map(v => ({
      id: v.id,
      color: v.color || '',
      model: v.model || '',
      stock: config.syncStock ? (v.stock || 0) : 0,
      barcodeValue: v.barcodeValue || ''
    })),
    stockStatus: product.stockStatus || 'in_stock',
    archived: product.archived || false,
    syncedFromInventory: true,
    lastSyncedAt: Date.now()
  };
}

/**
 * Pushes product data to secondary Reseller Firebase Firestore via REST API or Webhook
 */
export async function pushProductToReseller(
  product: Product, 
  action: 'add' | 'update' | 'delete' = 'add'
): Promise<{ success: boolean; message: string }> {
  const config = getResellerSyncConfig();

  if (!config.enabled) {
    return { success: false, message: 'Sky Reseller sync is currently disabled.' };
  }

  const payload = buildResellerProductPayload(product, config);

  // Method A: Direct Webhook Endpoint
  if (config.webhookUrl && config.webhookUrl.trim() !== '') {
    try {
      const response = await fetch(config.webhookUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Action': action
        },
        body: JSON.stringify({ action, product: payload })
      });

      if (response.ok) {
        return { success: true, message: `Product ${product.name} synced via Webhook.` };
      } else {
        const errText = await response.text();
        console.warn('[ResellerSync] Webhook response error:', errText);
      }
    } catch (webhookErr: any) {
      console.warn('[ResellerSync] Webhook push failed:', webhookErr);
    }
  }

  // Method B: Secondary Firebase Firestore REST API
  if (config.secondaryProjectId && config.secondaryProjectId.trim() !== '') {
    const projId = config.secondaryProjectId.trim();
    const colName = config.secondaryCollectionName || 'products';
    const docId = product.id;

    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projId}/databases/(default)/documents/${colName}/${docId}`;

    try {
      if (action === 'delete') {
        const delRes = await fetch(firestoreUrl, { method: 'DELETE' });
        if (delRes.ok) {
          return { success: true, message: `Product ${product.name} removed from Reseller DB.` };
        }
      }

      // Format payload for Firestore REST API
      const fields: Record<string, any> = {
        name: { stringValue: payload.name },
        sku: { stringValue: payload.sku },
        category: { stringValue: payload.category },
        brand: { stringValue: payload.brand },
        subBrand: { stringValue: payload.subBrand },
        sellingPrice: { doubleValue: Number(payload.sellingPrice || 0) },
        costPrice: { doubleValue: Number(payload.costPrice || 0) },
        stockStatus: { stringValue: payload.stockStatus },
        archived: { booleanValue: payload.archived },
        syncedFromInventory: { booleanValue: true },
        lastSyncedAt: { integerValue: payload.lastSyncedAt.toString() }
      };

      if (payload.images && payload.images.length > 0) {
        fields.images = {
          arrayValue: {
            values: payload.images.map(img => ({ stringValue: img }))
          }
        };
      }

      if (payload.variants && payload.variants.length > 0) {
        fields.variantsJson = {
          stringValue: JSON.stringify(payload.variants)
        };
      }

      const patchRes = await fetch(`${firestoreUrl}?currentDocument.exists=true`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      });

      if (!patchRes.ok) {
        // Fallback write if document doesn't exist yet
        await fetch(firestoreUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields })
        });
      }

      return { success: true, message: `Product ${product.name} synced to Reseller Firebase Project (${projId}).` };
    } catch (err: any) {
      console.error('[ResellerSync] Firestore REST sync error:', err);
      return { success: false, message: `Firestore REST sync failed: ${err.message}` };
    }
  }

  return { 
    success: false, 
    message: 'Please configure Secondary Firebase Project ID or Webhook URL in Reseller Sync settings.' 
  };
}

/**
 * Bulk sync all products to Sky Reseller App
 */
export async function bulkSyncAllProductsToReseller(
  products: Product[],
  onProgress?: (current: number, total: number) => void
): Promise<{ syncedCount: number; errorsCount: number }> {
  const config = getResellerSyncConfig();
  if (!config.enabled) return { syncedCount: 0, errorsCount: 0 };

  let synced = 0;
  let errors = 0;
  const approved = products.filter(p => !p.archived && p.status !== 'pending_review' && p.status !== 'rejected');

  for (let i = 0; i < approved.length; i++) {
    const p = approved[i];
    const res = await pushProductToReseller(p, 'add');
    if (res.success) {
      synced++;
    } else {
      errors++;
    }
    if (onProgress) {
      onProgress(i + 1, approved.length);
    }
  }

  // Update last synced timestamp
  config.lastSyncedAt = Date.now();
  saveResellerSyncConfig(config);

  return { syncedCount: synced, errorsCount: errors };
}
