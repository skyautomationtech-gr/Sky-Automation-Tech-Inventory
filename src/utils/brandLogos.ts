import { CompanySettings, SubBrandDetails } from '../types';

export const BRAND_LOGOS: Record<string, string> = {
  SAT: '/Sky Automation Tech Logo.jpeg',
  GZ: '/gadgetzu-logo-1768544471034.jpeg',
  RTX: '/RTX Gadget logo.jpeg'
};

export const BRAND_NAMES: Record<string, string> = {
  SAT: 'Sky Automation Tech',
  GZ: 'GadgetZu',
  RTX: 'RTX Gadget'
};

export function getBrandLogo(subBrand?: string, defaultLogoUrl?: string): string {
  if (!subBrand || subBrand === 'SAT') {
    return defaultLogoUrl || BRAND_LOGOS.SAT || '/Sky Automation Tech Logo.jpeg';
  }
  return BRAND_LOGOS[subBrand] || defaultLogoUrl || BRAND_LOGOS.SAT || '/Sky Automation Tech Logo.jpeg';
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
  const brandKey = (subBrand || 'SAT').toUpperCase() as 'SAT' | 'GZ' | 'RTX';
  const custom = companySettings?.subBrandDetails?.[brandKey];

  const defaultName = BRAND_NAMES[brandKey] || companySettings?.companyName || 'Sky Automation Tech';
  const defaultLogo = BRAND_LOGOS[brandKey] || companySettings?.logoUrl || '/Sky Automation Tech Logo.jpeg';
  const defaultPhone = custom?.phone || companySettings?.phone || '01577351518';

  return {
    companyName: custom?.companyName || (brandKey === 'SAT' && companySettings?.companyName ? companySettings.companyName : defaultName),
    address: custom?.address || companySettings?.address || 'House #12, Road #3, Block-A, Banasree, Dhaka',
    phone: defaultPhone,
    email: custom?.email || companySettings?.email || 'skyautomationtech@gmail.com',
    logoUrl: custom?.logoUrl || defaultLogo,
    invoiceTerms: custom?.invoiceTerms || companySettings?.invoiceTerms || 'Goods once sold will not be taken back. Please make payment within the due date.',
    tagline: custom?.tagline || companySettings?.footerTagline || 'Smart solutions, better future',
    bkashNagadPhone: companySettings?.paymentMethodsInfo?.bkashNagad || defaultPhone,
    bankDetails: companySettings?.paymentMethodsInfo?.bankInfo || 'DBBL - 105.***.***.18',
    whatsappContact: companySettings?.paymentMethodsInfo?.whatsappContact || defaultPhone
  };
}
