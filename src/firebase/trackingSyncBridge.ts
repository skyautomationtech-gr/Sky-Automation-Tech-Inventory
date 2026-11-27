import type { CompanySettings } from '../types';
import type { PreOrderActor } from './preOrderDb';

export type PublicTrackingSyncHandler = (
  preOrderId: string,
  options?: {
    companySettings?: CompanySettings | null;
    actor?: PreOrderActor;
    logAudit?: boolean;
  }
) => Promise<{ ok: boolean; error?: string }>;

let registeredSyncer: PublicTrackingSyncHandler | null = null;

export function registerPublicTrackingSyncer(handler: PublicTrackingSyncHandler): void {
  registeredSyncer = handler;
}

export async function triggerPublicTrackingSync(
  preOrderId: string,
  options?: {
    companySettings?: CompanySettings | null;
    actor?: PreOrderActor;
    logAudit?: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!registeredSyncer) {
    return { ok: false, error: 'Tracking syncer not yet registered' };
  }
  return registeredSyncer(preOrderId, options);
}
