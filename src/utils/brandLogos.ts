import { CompanySettings, SubBrand, SubBrandDetails } from '../types';
import {
  DEFAULT_PARENT_CREDIT_LINE,
  PARENT_COMPANY_ID,
  PARENT_COMPANY_NAME,
  getRegistrySubBrandsSync,
  isLegacySatCode,
  normalizeSubBrandCode,
  resolveSubBrandMeta,
  sanitizeHexColor,
} from './subBrands';

export const BRAND_LOGOS: Record<string, string> = {
  SAT: '/sat_logo.jpg',
  GZ: '/gz_logo.jpg',
  RTX: '/rtx_logo.jpg',
};

export const BRAND_NAMES: Record<string, string> = {
  SAT: 'Sky Automation Tech',
  GZ: 'GadgetZu',
  RTX: 'RTX Gadget',
};

export function getBrandLogo(
  subBrand?: string,
  defaultLogoUrl?: string,
  subBrands?: SubBrand[] | null
): string {
  const key = normalizeSubBrandCode(subBrand || PARENT_COMPANY_ID);
  if (isLegacySatCode(key)) {
    return defaultLogoUrl || BRAND_LOGOS.SAT;
  }
  const found = resolveSubBrandMeta(key, subBrands);
  if (found?.logoUrl && found.logoUrl.trim()) {
    return found.logoUrl.trim();
  }
  if (key === 'GZ' || key === 'GADGETZU') {
    return defaultLogoUrl || BRAND_LOGOS.GZ;
  }
  if (key === 'RTX' || key === 'RTXGADGET') {
    return defaultLogoUrl || BRAND_LOGOS.RTX;
  }
  return defaultLogoUrl || BRAND_LOGOS.SAT;
}

export function getBrandDisplayName(
  subBrand?: string,
  subBrands?: SubBrand[] | null,
  companySettings?: CompanySettings | null
): string {
  if (!subBrand) return PARENT_COMPANY_NAME;
  const key = normalizeSubBrandCode(subBrand);
  if (isLegacySatCode(key)) {
    return companySettings?.companyName || PARENT_COMPANY_NAME;
  }
  const found = resolveSubBrandMeta(key, subBrands, companySettings);
  if (found?.name) return found.name;
  const custom = companySettings?.subBrandDetails?.[key];
  if (custom?.companyName) return custom.companyName;
  return BRAND_NAMES[key] || subBrand;
}

export function getSubBrandCompanyInfo(
  subBrand: string = 'GZ',
  companySettings?: CompanySettings | null,
  subBrands?: SubBrand[] | null
): SubBrandDetails & {
  shortCode: string;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string;
  accentColor: string;
  invoiceTerms: string;
  invoiceFooterNote: string;
  warrantyPolicyText: string;
  tagline: string;
  website: string;
  parentCreditLine: string;
  showParentCreditLine: boolean;
  bkashNagadPhone: string;
  bankDetails: string;
  whatsappContact: string;
  isLegacySat: boolean;
} {
  const key = normalizeSubBrandCode(subBrand || PARENT_COMPANY_ID);
  const registryList = subBrands && subBrands.length > 0 ? subBrands : getRegistrySubBrandsSync(companySettings);
  const isLegacySat = isLegacySatCode(key);

  const registryEntry = !isLegacySat ? resolveSubBrandMeta(key, registryList, companySettings) : null;
  const resolvedCode = isLegacySat ? PARENT_COMPANY_ID : registryEntry?.shortCode || key || 'GZ';
  const custom = companySettings?.subBrandDetails?.[resolvedCode];

  const defaultName =
    registryEntry?.name ||
    BRAND_NAMES[resolvedCode] ||
    (isLegacySat ? companySettings?.companyName || PARENT_COMPANY_NAME : resolvedCode);

  const defaultLogo =
    registryEntry?.logoUrl ||
    BRAND_LOGOS[resolvedCode] ||
    (isLegacySat ? '/sat_logo.jpg' : '/sat_logo.jpg');

  const defaultPhone =
    registryEntry?.phone || custom?.phone || companySettings?.phone || '01577351518';

  const defaultEmails: Record<string, string> = {
    SAT: 'skyautomationtech@gmail.com',
    GZ: 'gadgetzubd@gmail.com',
    RTX: 'rtxgadget@gmail.com',
  };

  let rawCandidate =
    registryEntry?.logoUrl && registryEntry.logoUrl.trim() !== ''
      ? registryEntry.logoUrl.trim()
      : custom?.logoUrl && custom.logoUrl.trim() !== ''
      ? custom.logoUrl.trim()
      : isLegacySat && companySettings?.logoUrl && companySettings.logoUrl.trim() !== ''
      ? companySettings.logoUrl.trim()
      : defaultLogo;

  rawCandidate = rawCandidate.replace(/\\/g, '/');
  if (rawCandidate.startsWith('file://') || rawCandidate.includes('C:') || rawCandidate.includes('assets/')) {
    if (rawCandidate.toLowerCase().includes('gadgetzu') || rawCandidate.toLowerCase().includes('gz')) {
      rawCandidate = BRAND_LOGOS.GZ;
    } else if (rawCandidate.toLowerCase().includes('rtx')) {
      rawCandidate = BRAND_LOGOS.RTX;
    } else {
      rawCandidate = BRAND_LOGOS.SAT;
    }
  }

  const accentColor = isLegacySat
    ? '#475569'
    : sanitizeHexColor(registryEntry?.accentColor || custom?.accentColor, resolvedCode === 'RTX' ? '#C2410C' : '#0F766E');

  const parentCreditLine =
    (companySettings?.parentCreditLine || '').trim() || DEFAULT_PARENT_CREDIT_LINE;
  const showParentCreditLine =
    !isLegacySat && (companySettings?.showParentCreditLine ?? true);

  return {
    shortCode: resolvedCode,
    companyName:
      registryEntry?.name ||
      custom?.companyName ||
      (isLegacySat && companySettings?.companyName ? companySettings.companyName : defaultName),
    address:
      registryEntry?.address ||
      custom?.address ||
      companySettings?.address ||
      'House #12, Road #3, Block-A, Banasree, Dhaka',
    phone: defaultPhone,
    whatsapp:
      registryEntry?.whatsapp ||
      custom?.whatsapp ||
      companySettings?.paymentMethodsInfo?.whatsappContact ||
      defaultPhone,
    email:
      registryEntry?.email ||
      custom?.email ||
      defaultEmails[resolvedCode] ||
      companySettings?.email ||
      'skyautomationtech@gmail.com',
    website: registryEntry?.website || custom?.website || '',
    socialLinks: registryEntry?.socialLinks || custom?.socialLinks || {},
    logoUrl: rawCandidate,
    accentColor,
    invoiceTerms:
      registryEntry?.invoiceTerms ||
      custom?.invoiceTerms ||
      companySettings?.invoiceTerms ||
      'Goods once sold are non-refundable. Please verify items upon delivery.',
    invoiceFooterNote:
      registryEntry?.invoiceFooterNote ||
      custom?.invoiceFooterNote ||
      '',
    warrantyPolicyText:
      registryEntry?.warrantyPolicyText ||
      custom?.warrantyPolicyText ||
      '',
    tagline:
      registryEntry?.tagline ||
      custom?.tagline ||
      companySettings?.footerTagline ||
      'Smart solutions, better future',
    parentCreditLine,
    showParentCreditLine,
    bkashNagadPhone: companySettings?.paymentMethodsInfo?.bkashNagad || defaultPhone,
    bankDetails: companySettings?.paymentMethodsInfo?.bankInfo || 'DBBL - 105.***.***.18',
    whatsappContact:
      registryEntry?.whatsapp ||
      custom?.whatsapp ||
      companySettings?.paymentMethodsInfo?.whatsappContact ||
      defaultPhone,
    isLegacySat,
  };
}
