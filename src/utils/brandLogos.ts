import { CompanySettings, SubBrandDetails } from '../types';

export const BRAND_LOGOS: Record<string, string> = {
  SAT: '/sat_logo.jpg',
  GZ: '/gz_logo.jpg',
  RTX: '/rtx_logo.jpg'
};

export const BRAND_NAMES: Record<string, string> = {
  SAT: 'Sky Automation Tech',
  GZ: 'GadgetZu',
  RTX: 'RTX Gadget'
};

export function getBrandLogo(subBrand?: string, defaultLogoUrl?: string): string {
  const key = (subBrand || 'SAT').toUpperCase();
  if (key === 'GZ' || key === 'GADGETZU') {
    return defaultLogoUrl || BRAND_LOGOS.GZ;
  }
  if (key === 'RTX' || key === 'RTX GADGET') {
    return defaultLogoUrl || BRAND_LOGOS.RTX;
  }
  return defaultLogoUrl || BRAND_LOGOS.SAT;
}

export function getSubBrandCompanyInfo(
  subBrand: string = 'SAT', 
  companySettings?: CompanySettings | null
): SubBrandDetails & { 
  companyName: string; 
  address: string; 
  phone: string; 
  email: string; 
  logoUrl: string; 
  invoiceTerms: string;
  tagline: string;
  bkashNagadPhone: string;
  bankDetails: string;
  whatsappContact: string;
} {
  const key = (subBrand || 'SAT').toUpperCase();
  const brandKey = (key === 'GZ' || key === 'GADGETZU') ? 'GZ' : (key === 'RTX' || key === 'RTX GADGET') ? 'RTX' : 'SAT';
  const custom = companySettings?.subBrandDetails?.[brandKey];

  const defaultName = BRAND_NAMES[brandKey] || companySettings?.companyName || 'Sky Automation Tech';
  const defaultLogo = BRAND_LOGOS[brandKey] || '/sat_logo.jpg';
  const defaultPhone = custom?.phone || companySettings?.phone || '01577351518';

  const defaultEmails: Record<string, string> = {
    SAT: 'skyautomationtech@gmail.com',
    GZ: 'gadgetzubd@gmail.com',
    RTX: 'rtxgadget@gmail.com'
  };

  let rawCandidate = custom?.logoUrl && custom.logoUrl.trim() !== '' 
    ? custom.logoUrl.trim() 
    : (brandKey === 'SAT' && companySettings?.logoUrl && companySettings.logoUrl.trim() !== '' ? companySettings.logoUrl.trim() : defaultLogo);

  // Normalize backslashes and local path strings
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

  const logoCandidate = rawCandidate;

  return {
    companyName: custom?.companyName || (brandKey === 'SAT' && companySettings?.companyName ? companySettings.companyName : defaultName),
    address: custom?.address || companySettings?.address || 'House #12, Road #3, Block-A, Banasree, Dhaka',
    phone: defaultPhone,
    email: custom?.email || defaultEmails[brandKey] || companySettings?.email || 'skyautomationtech@gmail.com',
    logoUrl: logoCandidate,
    invoiceTerms: custom?.invoiceTerms || companySettings?.invoiceTerms || 'Goods once sold are non-refundable. Please verify items upon delivery.',
    tagline: custom?.tagline || companySettings?.footerTagline || 'Smart solutions, better future',
    bkashNagadPhone: companySettings?.paymentMethodsInfo?.bkashNagad || defaultPhone,
    bankDetails: companySettings?.paymentMethodsInfo?.bankInfo || 'DBBL - 105.***.***.18',
    whatsappContact: companySettings?.paymentMethodsInfo?.whatsappContact || defaultPhone
  };
}
