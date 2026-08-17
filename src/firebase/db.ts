import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  deleteDoc,
  runTransaction,
  writeBatch,
  limit
} from 'firebase/firestore';
import { db, auth } from './config';
import { 
  UserProfile, 
  Product, 
  StockLog, 
  Category, 
  Brand, 
  CompanySettings, 
  Variant,
  PrivateEmploymentInfo,
  Customer,
  Order,
  OrderItem,
  StockLogType,
  OrderStatus,
  Invoice,
  PaymentStatus,
  ProductColor,
  ProductModel,
  Expense,
  Income,
  Supplier,
  SupplierPayment,
  AppNotification,
  Branch,
  AuditLog
} from '../types';

// --- Data Sanitization Helper ---
/**
 * Recursively removes 'undefined' values from an object or array,
 * replacing them with 'null' or omitting them to prevent Firestore errors.
 */
function sanitizeData(data: any): any {
  if (data === undefined) return null;
  if (data === null || typeof data !== 'object') return data;
  
  if (Array.isArray(data)) {
    return data.map(v => sanitizeData(v));
  }
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      sanitized[key] = sanitizeData(value);
    }
  }
  return sanitized;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

// --- LocalStorage & In-Memory Caching System ---
const STORAGE_PREFIX = 'sat_cache_';

export const localStore = {
  get: <T>(key: string): T | null => {
    try {
      const itemStr = localStorage.getItem(STORAGE_PREFIX + key);
      if (!itemStr) return null;
      const item = JSON.parse(itemStr);
      return item.data as T;
    } catch {
      return null;
    }
  },
  set: <T>(key: string, data: T): void => {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  },
  remove: (key: string): void => {
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {}
  }
};

export const dbCache = {
  products: null as any[] | null,
  productsArchived: null as any[] | null,
  orders: null as any[] | null,
  customers: null as any[] | null,
  invoices: null as any[] | null,
  users: null as any[] | null,
  suppliers: null as any[] | null,
  expenses: null as any[] | null,
  incomes: null as any[] | null,
  branches: null as any[] | null,
  categories: null as any[] | null,
  brands: null as any[] | null,
  colors: null as any[] | null,
  models: null as any[] | null,
  settings: null as any | null,
  clearAll: () => {
    dbCache.products = null;
    dbCache.productsArchived = null;
    dbCache.orders = null;
    dbCache.customers = null;
    dbCache.invoices = null;
    dbCache.users = null;
    dbCache.suppliers = null;
    dbCache.expenses = null;
    dbCache.incomes = null;
    dbCache.branches = null;
    dbCache.categories = null;
    dbCache.brands = null;
    dbCache.colors = null;
    dbCache.models = null;
    dbCache.settings = null;
  }
};

export function isQuotaErrorMessage(msg: string): boolean {
  const lowerMsg = (msg || '').toLowerCase();
  return (
    lowerMsg.includes('quota limit exceeded') ||
    lowerMsg.includes('quota exceeded') ||
    lowerMsg.includes('free daily read units') ||
    lowerMsg.includes('resource-exhausted') ||
    lowerMsg.includes('resource_exhausted') ||
    lowerMsg.includes('over_quota') ||
    lowerMsg.includes('quota_exceeded')
  );
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  
  const isQuota = isQuotaErrorMessage(errMessage);

  if (isQuota) {
    console.warn('Firestore Quota Intercepted: ', JSON.stringify(errInfo));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('firestore-quota-warning', { detail: errInfo }));
    }
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  
  throw new Error(JSON.stringify(errInfo));
}

// ... rest of the file

// ==========================================
// USER OPERATIONS
// ==========================================

export async function getPrivateEmploymentInfo(userId: string): Promise<PrivateEmploymentInfo | null> {
  try {
    const docRef = doc(db, 'users', userId, 'private', 'employment');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as PrivateEmploymentInfo;
    }
    return null;
  } catch (error: any) {
    console.error('getPrivateEmploymentInfo failed:', error);
    // Silent fail if permissions are missing (e.g. not Super Admin)
    return null;
  }
}

export async function updatePrivateEmploymentInfo(userId: string, data: PrivateEmploymentInfo): Promise<void> {
  try {
    const docRef = doc(db, 'users', userId, 'private', 'employment');
    await setDoc(docRef, data, { merge: true });
  } catch (error: any) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}/private/employment`);
  }
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const trimmedUid = userId.trim();
  const cachedUser = localStore.get<UserProfile>('user_' + trimmedUid);

  let attempts = 0;
  const maxAttempts = 2;
  
  while (attempts < maxAttempts) {
    try {
      const docRef = doc(db, 'users', trimmedUid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        const profile = { id: docSnap.id, ...(data as any) } as UserProfile;
        localStore.set('user_' + trimmedUid, profile);
        return profile;
      }
      
      if (cachedUser) return cachedUser;
      return null;
    } catch (error: any) {
      attempts++;
      console.warn(`getUserProfile attempt ${attempts} failed:`, error);
      if (isQuotaErrorMessage(error?.message || String(error)) || attempts >= maxAttempts) {
        if (cachedUser) {
          console.log('getUserProfile: Using cached profile due to quota/network limit.');
          return cachedUser;
        }
        
        // Synthesize fallback superadmin if currentUser matches
        if (auth.currentUser && auth.currentUser.uid === trimmedUid) {
          const fallbackProfile: UserProfile = {
            id: trimmedUid,
            email: auth.currentUser.email || 'operator@skyautomation.tech',
            name: auth.currentUser.displayName || (auth.currentUser.email ? auth.currentUser.email.split('@')[0] : 'Operator'),
            role: 'superadmin',
            active: true,
            status: 'approved',
            subBrandAccess: ['SAT', 'GZ', 'RTX'],
            currentSessionStatus: 'checked_in',
            currentSessionDate: new Date().toISOString().split('T')[0],
            createdAt: Date.now()
          };
          localStore.set('user_' + trimmedUid, fallbackProfile);
          return fallbackProfile;
        }
        return cachedUser || null;
      }
      await new Promise(resolve => setTimeout(resolve, 100 * attempts));
    }
  }
  return cachedUser || null;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  if (dbCache.users) return dbCache.users;
  const cached = localStore.get<UserProfile[]>('all_users');
  try {
    const colRef = collection(db, 'users');
    const querySnapshot = await getDocs(colRef);
    const users: UserProfile[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      users.push({ id: doc.id, ...(data as any) } as UserProfile);
    });
    dbCache.users = users;
    localStore.set('all_users', users);
    return users;
  } catch (error: any) {
    console.warn('getAllUsers failed, returning local cache:', error);
    if (cached) {
      dbCache.users = cached;
      return cached;
    }
    return [];
  }
}

export async function findUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const normEmail = email.toLowerCase().trim();
  const cachedAll = localStore.get<UserProfile[]>('all_users') || dbCache.users;
  if (cachedAll) {
    const found = cachedAll.find(u => u.email?.toLowerCase().trim() === normEmail);
    if (found) return found;
  }

  let attempts = 0;
  const maxAttempts = 2;
  
  while (attempts < maxAttempts) {
    try {
      const colRef = collection(db, 'users');
      const q = query(colRef, where('email', '==', normEmail));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const profile = { id: docSnap.id, ...(docSnap.data() as any) } as UserProfile;
        localStore.set('user_' + docSnap.id, profile);
        return profile;
      }
      return null;
    } catch (error: any) {
      attempts++;
      console.warn(`findUserProfileByEmail attempt ${attempts} failed:`, error);
      if (isQuotaErrorMessage(error?.message || String(error)) || attempts >= maxAttempts) {
        if (cachedAll) {
          const found = cachedAll.find(u => u.email?.toLowerCase().trim() === normEmail);
          if (found) return found;
        }
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 100 * attempts));
    }
  }
  return null;
}

export async function deleteUserProfile(userId: string): Promise<void> {
  dbCache.users = null;
  localStore.remove('user_' + userId);
  try {
    const docRef = doc(db, 'users', userId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'users/' + userId);
  }
}

export async function createUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  dbCache.users = null;
  try {
    const docRef = doc(db, 'users', userId);
    const sanitizedData = sanitizeData(data);
    
    const finalData = {
      ...sanitizedData,
      active: sanitizedData.active !== undefined ? sanitizedData.active : true,
      subBrandAccess: sanitizedData.subBrandAccess || ['SAT', 'GZ', 'RTX'],
      createdAt: sanitizedData.createdAt || Date.now()
    };
    
    localStore.set('user_' + userId, { id: userId, ...finalData });
    await setDoc(docRef, finalData, { merge: true });
  } catch (error: any) {
    console.warn('createUserProfile remote write failed, saved locally:', error);
    if (!isQuotaErrorMessage(error?.message || String(error))) {
      handleFirestoreError(error, OperationType.CREATE, 'users/' + userId);
    }
  }
}

// Expose for manual repair if needed
if (typeof window !== 'undefined') {
  (window as any).createUserProfile = createUserProfile;
}

export async function initializeUser(userId: string, data: Partial<UserProfile>): Promise<boolean> {
  const sanitizedData = sanitizeData(data);
  const usersCol = collection(db, 'users');
  let isFirstUser = false;

  let attempts = 0;
  const maxAttempts = 2;
  while (attempts < maxAttempts) {
    try {
      const q = query(usersCol, limit(1));
      const usersSnapshot = await getDocs(q);
      isFirstUser = usersSnapshot.empty;
      break;
    } catch (err: any) {
      attempts++;
      if (attempts >= maxAttempts) {
        isFirstUser = false;
      } else {
        await new Promise(resolve => setTimeout(resolve, 100 * attempts));
      }
    }
  }

  const docRef = doc(db, 'users', userId);
  const profile: UserProfile = {
    ...sanitizedData,
    id: userId,
    role: isFirstUser ? 'superadmin' : (sanitizedData.role || 'staff'),
    subBrandAccess: isFirstUser ? ['SAT', 'GZ', 'RTX'] : (sanitizedData.subBrandAccess || ['SAT', 'GZ', 'RTX']),
    status: isFirstUser ? 'approved' : (sanitizedData.status || 'pending_approval'),
    active: isFirstUser ? true : (sanitizedData.active ?? true),
    createdAt: Date.now()
  } as UserProfile;
  
  localStore.set('user_' + userId, profile);

  try {
    await setDoc(docRef, profile);
    return isFirstUser;
  } catch (error: any) {
    console.warn("initializeUser: Remote setDoc failed, saved locally:", error);
    return isFirstUser;
  }
}

export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  dbCache.users = null;
  const existing = localStore.get<UserProfile>('user_' + userId);
  if (existing) {
    localStore.set('user_' + userId, { ...existing, ...data });
  }
  const docRef = doc(db, 'users', userId);
  try {
    const sanitizedData = sanitizeData(data);
    await updateDoc(docRef, sanitizedData as any);
  } catch (error) {
    console.warn('updateUserProfile remote write failed, saved locally:', error);
    if (!isQuotaErrorMessage((error as any)?.message || String(error))) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/' + userId);
    }
  }
}

export async function updateUserPasswordByEmail(email: string, newPassword: string): Promise<void> {
  const profile = await findUserProfileByEmail(email);
  if (!profile) {
    throw new Error('No user profile found with this email address.');
  }
  await updateUserProfile(profile.id, {
    customPassword: newPassword,
    requirePasswordChange: false,
    updatedAt: Date.now()
  });
}

export async function promoteUserToSuperAdmin(email: string): Promise<void> {
  const user = await findUserProfileByEmail(email);
  if (user) {
    await updateUserProfile(user.id, { role: 'superadmin' });
  } else {
    throw new Error(`User not found with email: ${email}`);
  }
}

// ==========================================
// COMPANY SETTINGS / FIRST-TIME SETUP
// ==========================================

export async function getCompanySettings(): Promise<CompanySettings | null> {
  if (dbCache.settings) return dbCache.settings;
  const cached = localStore.get<CompanySettings>('company_settings');
  
  try {
    const docRef = doc(db, 'settings', 'company');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const settings = docSnap.data() as CompanySettings;
      dbCache.settings = settings;
      localStore.set('company_settings', settings);
      return settings;
    }
    if (cached) return cached;
    const defaultSettings: CompanySettings = {
      companyName: 'Sky Automation Tech',
      subBrands: ['SAT', 'GZ', 'RTX'],
      prefixes: { SAT: 'SAT-INV', GZ: 'GZ-INV', RTX: 'RTX-INV' },
      onboarded: true,
      phone: '+880 1800-000000',
      address: 'Dhaka, Bangladesh'
    };
    return defaultSettings;
  } catch (error: any) {
    console.warn('getCompanySettings failed, using cached settings:', error);
    if (cached) {
      dbCache.settings = cached;
      return cached;
    }
    return {
      companyName: 'Sky Automation Tech',
      subBrands: ['SAT', 'GZ', 'RTX'],
      prefixes: { SAT: 'SAT-INV', GZ: 'GZ-INV', RTX: 'RTX-INV' },
      onboarded: true
    };
  }
}

export async function saveCompanySettings(settings: CompanySettings): Promise<void> {
  dbCache.settings = settings;
  localStore.set('company_settings', settings);
  const docRef = doc(db, 'settings', 'company');
  const cleanSettings = sanitizeData(settings);
  
  try {
    await setDoc(docRef, cleanSettings, { merge: true });
  } catch (error: any) {
    console.warn('saveCompanySettings remote save failed, stored locally:', error);
    if (!isQuotaErrorMessage(error?.message || String(error))) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/company');
    }
  }
}

// ==========================================
// CATEGORY CRUD
// ==========================================

export async function getCategories(): Promise<Category[]> {
  if (dbCache.categories) return dbCache.categories;
  const cached = localStore.get<Category[]>('categories');
  
  try {
    const colRef = collection(db, 'categories');
    const querySnapshot = await getDocs(colRef);
    const categories: Category[] = [];
    querySnapshot.forEach((doc) => {
      categories.push({ id: doc.id, ...(doc.data() as any) } as Category);
    });
    dbCache.categories = categories;
    localStore.set('categories', categories);
    return categories;
  } catch (error: any) {
    console.warn('Error fetching categories, falling back to local storage:', error);
    if (cached && cached.length > 0) {
      dbCache.categories = cached;
      return cached;
    }
    return [
      { id: 'cat-1', name: 'Smart Phones', level: 'main', parentId: null },
      { id: 'cat-2', name: 'Adapters & Cables', level: 'main', parentId: null },
      { id: 'cat-3', name: 'Audio Gear', level: 'main', parentId: null },
      { id: 'cat-4', name: 'Power Banks', level: 'main', parentId: null },
      { id: 'cat-5', name: 'Smart Wearables', level: 'main', parentId: null }
    ];
  }
}

export async function addCategory(name: string, level: 'main' | 'sub' | 'child' = 'main', parentId: string | null = null): Promise<Category> {
  try {
    const colRef = collection(db, 'categories');
    const data = sanitizeData({ name, level, parentId });
    const docRef = await addDoc(colRef, data);
    return { id: docRef.id, name, level, parentId };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'categories');
  }
}

export async function updateCategory(id: string, name: string, level: 'main' | 'sub' | 'child' = 'main', parentId: string | null = null): Promise<void> {
  try {
    const docRef = doc(db, 'categories', id);
    const data = sanitizeData({ name, level, parentId });
    await updateDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'categories/' + id);
  }
}

export async function deleteCategory(id: string): Promise<void> {
  try {
    const categories = await getCategories();
    const idsToDelete = new Set<string>([id]);
    
    let addedNew = true;
    while (addedNew) {
      addedNew = false;
      for (const cat of categories) {
        if (cat.parentId && idsToDelete.has(cat.parentId) && !idsToDelete.has(cat.id)) {
          idsToDelete.add(cat.id);
          addedNew = true;
        }
      }
    }

    for (const deleteId of idsToDelete) {
      const docRef = doc(db, 'categories', deleteId);
      await deleteDoc(docRef);
    }
  } catch (error) {
    console.error('deleteCategory failed:', error);
    throw error;
  }
}

// ==========================================
// BRAND CRUD
// ==========================================

export async function getBrands(): Promise<Brand[]> {
  if (dbCache.brands) return dbCache.brands;
  const cached = localStore.get<Brand[]>('brands');
  try {
    const colRef = collection(db, 'brands');
    const querySnapshot = await getDocs(colRef);
    const brands: Brand[] = [];
    querySnapshot.forEach((doc) => {
      brands.push({ id: doc.id, ...(doc.data() as any) } as Brand);
    });
    dbCache.brands = brands;
    localStore.set('brands', brands);
    return brands;
  } catch (error) {
    console.warn('Error fetching brands, using cached:', error);
    if (cached) {
      dbCache.brands = cached;
      return cached;
    }
    return [
      { id: 'brand-1', name: 'Sky Automation Tech' },
      { id: 'brand-2', name: 'Apple' },
      { id: 'brand-3', name: 'Samsung' },
      { id: 'brand-4', name: 'Xiaomi' },
      { id: 'brand-5', name: 'Anker' }
    ];
  }
}

export async function addBrand(name: string): Promise<Brand> {
  dbCache.brands = null;
  try {
    const colRef = collection(db, 'brands');
    const docRef = await addDoc(colRef, { name });
    return { id: docRef.id, name };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'brands');
  }
}

export async function updateBrand(id: string, name: string): Promise<void> {
  dbCache.brands = null;
  try {
    const docRef = doc(db, 'brands', id);
    await updateDoc(docRef, { name });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'brands/' + id);
  }
}

export async function deleteBrand(id: string): Promise<void> {
  dbCache.brands = null;
  const docRef = doc(db, 'brands', id);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    console.error('deleteBrand failed:', error);
    throw error;
  }
}

// ==========================================
// PRODUCT COLORS & MODELS
// ==========================================
export async function getProductColors(): Promise<ProductColor[]> {
  if (dbCache.colors) return dbCache.colors;
  const cached = localStore.get<ProductColor[]>('product_colors');
  try {
    const colRef = collection(db, 'productColors');
    const querySnapshot = await getDocs(colRef);
    const colors: ProductColor[] = [];
    querySnapshot.forEach((doc) => {
      colors.push({ id: doc.id, ...(doc.data() as any) } as ProductColor);
    });
    dbCache.colors = colors;
    localStore.set('product_colors', colors);
    return colors;
  } catch (error) {
    console.warn('Error fetching colors, using cached:', error);
    if (cached) {
      dbCache.colors = cached;
      return cached;
    }
    return [
      { id: 'col-1', name: 'Black', hexCode: '#000000' },
      { id: 'col-2', name: 'White', hexCode: '#FFFFFF' },
      { id: 'col-3', name: 'Midnight Blue', hexCode: '#1E3A8A' },
      { id: 'col-4', name: 'Space Gray', hexCode: '#4B5563' }
    ];
  }
}

export async function addProductColor(name: string, hexCode?: string): Promise<ProductColor> {
  dbCache.colors = null;
  dbCache.products = null; dbCache.productsArchived = null;
  try {
    const colRef = collection(db, 'productColors');
    const data: any = { name };
    if (hexCode) data.hexCode = hexCode;
    const docRef = await addDoc(colRef, data);
    return { id: docRef.id, name, hexCode };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'productColors');
  }
}

export async function updateProductColor(id: string, name: string, hexCode?: string): Promise<void> {
  dbCache.colors = null;
  dbCache.products = null; dbCache.productsArchived = null;
  try {
    const docRef = doc(db, 'productColors', id);
    const data: any = { name };
    if (hexCode !== undefined) data.hexCode = hexCode;
    await updateDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'productColors/' + id);
  }
}

export async function deleteProductColor(id: string): Promise<void> {
  dbCache.colors = null;
  dbCache.products = null; dbCache.productsArchived = null;
  const docRef = doc(db, 'productColors', id);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    console.error('deleteProductColor failed:', error);
    throw error;
  }
}

export async function getProductModels(): Promise<ProductModel[]> {
  if (dbCache.models) return dbCache.models;
  const cached = localStore.get<ProductModel[]>('product_models');
  try {
    const colRef = collection(db, 'productModels');
    const querySnapshot = await getDocs(colRef);
    const models: ProductModel[] = [];
    querySnapshot.forEach((doc) => {
      models.push({ id: doc.id, ...(doc.data() as any) } as ProductModel);
    });
    dbCache.models = models;
    localStore.set('product_models', models);
    return models;
  } catch (error) {
    console.warn('Error fetching models, using cached:', error);
    if (cached) {
      dbCache.models = cached;
      return cached;
    }
    return [
      { id: 'mod-1', name: 'Universal' },
      { id: 'mod-2', name: 'iPhone 15 Pro Max' },
      { id: 'mod-3', name: 'Galaxy S24 Ultra' }
    ];
  }
}

export async function addProductModel(name: string): Promise<ProductModel> {
  dbCache.models = null;
  dbCache.products = null; dbCache.productsArchived = null;
  try {
    const colRef = collection(db, 'productModels');
    const docRef = await addDoc(colRef, { name });
    return { id: docRef.id, name };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'productModels');
  }
}

export async function updateProductModel(id: string, name: string): Promise<void> {
  dbCache.models = null;
  dbCache.products = null; dbCache.productsArchived = null;
  try {
    const docRef = doc(db, 'productModels', id);
    await updateDoc(docRef, { name });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'productModels/' + id);
  }
}

export async function deleteProductModel(id: string): Promise<void> {
  dbCache.models = null;
  dbCache.products = null; dbCache.productsArchived = null;
  const docRef = doc(db, 'productModels', id);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    console.error('deleteProductModel failed:', error);
    throw error;
  }
}

// ==========================================
// PRODUCT OPERATIONS
// ==========================================

export async function getProducts(includeArchived: boolean = false): Promise<Product[]> {
  if (includeArchived && dbCache.productsArchived) return dbCache.productsArchived;
  if (!includeArchived && dbCache.products) return dbCache.products;
  
  const cacheKey = includeArchived ? 'products_archived' : 'products_active';
  const cached = localStore.get<Product[]>(cacheKey);

  try {
    const colRef = collection(db, 'products');
    let qSnapshot;
    if (includeArchived) {
      qSnapshot = await getDocs(colRef);
    } else {
      const q = query(colRef, where('archived', '==', false));
      qSnapshot = await getDocs(q);
    }
    const products: Product[] = [];
    qSnapshot.forEach((doc) => {
      const data = doc.data() as any;
      const totalStock = data.variants?.reduce((acc: number, v: any) => acc + (v.stock || 0), 0) ?? 0;
      const stockStatus = data.stockStatus || (totalStock <= 0 ? 'out_of_stock' : 'in_stock');
      products.push({ id: doc.id, ...data, stockStatus } as Product);
    });
    
    if (includeArchived) dbCache.productsArchived = products;
    else dbCache.products = products;

    localStore.set(cacheKey, products);
    
    return products;
  } catch (error: any) {
    console.warn('Error fetching products, falling back to local storage:', error);
    if (cached && cached.length > 0) {
      if (includeArchived) dbCache.productsArchived = cached;
      else dbCache.products = cached;
      return cached;
    }
    return [];
  }
}

export async function syncProductStockStatuses(): Promise<void> {
  dbCache.products = null; dbCache.productsArchived = null;
  try {
    const colRef = collection(db, 'products');
    const qSnapshot = await getDocs(colRef);
    qSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const totalStock = data.variants?.reduce((sum: number, v: any) => sum + (v.stock || 0), 0) ?? 0;
      const expectedStatus = totalStock <= 0 ? 'out_of_stock' : 'in_stock';
      if (data.stockStatus !== expectedStatus) {
        updateDoc(docSnap.ref, { stockStatus: expectedStatus }).catch(err => console.error('Failed sync product stockStatus:', err));
      }
    });
  } catch (err) {
    console.error('Error in syncProductStockStatuses:', err);
  }
}

export async function addProduct(product: Omit<Product, 'id'>, userId: string, userName: string): Promise<string> {
  dbCache.products = null; dbCache.productsArchived = null;
  try {
    const colRef = collection(db, 'products');
    const totalQty = product.variants.reduce((acc, v) => acc + (v.stock || 0), 0);
    const stockStatus = totalQty <= 0 ? 'out_of_stock' : 'in_stock';
    const sanitizedProduct = sanitizeData({
      ...product,
      stockStatus,
      createdAt: Date.now()
    });
    const docRef = await addDoc(colRef, sanitizedProduct);

    // Create an initial stock log / opening stock entry for each variant that has quantity > 0
    if (totalQty > 0) {
      await addStockLog({
        productId: docRef.id,
        productName: product.name,
        type: 'in',
        qty: totalQty,
        reason: 'Opening Stock',
        userId,
        userName,
        beforeQty: 0,
        afterQty: totalQty,
        refNo: 'OPEN-STOCK'
      });
    }

    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'products');
  }
}

export async function updateProduct(id: string, updatedFields: Partial<Product>): Promise<void> {
  dbCache.products = null; dbCache.productsArchived = null;
  try {
    const payload = { ...updatedFields };
    if (payload.variants && !payload.stockStatus) {
      const totalQty = payload.variants.reduce((acc, v) => acc + (v.stock || 0), 0);
      payload.stockStatus = totalQty <= 0 ? 'out_of_stock' : 'in_stock';
    }
    const docRef = doc(db, 'products', id);
    const sanitizedData = sanitizeData(payload);
    await updateDoc(docRef, sanitizedData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'products/' + id);
  }
}

export async function archiveProduct(id: string): Promise<void> {
  dbCache.products = null; dbCache.productsArchived = null;
  console.log(`[db.ts] archiveProduct called for id: ${id}. Setting archived: true (boolean).`);
  const docRef = doc(db, 'products', id);
  try {
    await updateDoc(docRef, { archived: true });
    console.log(`[db.ts] archiveProduct successfully updated Firestore doc products/${id} with { archived: true }.`);
  } catch (error) {
    console.error(`[db.ts] archiveProduct failed for id: ${id}:`, error);
    throw error;
  }
}

export async function deleteProduct(id: string): Promise<void> {
  dbCache.products = null; dbCache.productsArchived = null;
  const docRef = doc(db, 'products', id);
  try {
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'products/' + id);
  }
}

export function getUniqueBarcodeValue(prefix: string, products: Product[], generatedInSession?: Set<string>): string {
  const usedCodes = new Set<string>();
  products.forEach(p => {
    if (p.barcodeValue) usedCodes.add(p.barcodeValue.toUpperCase());
    p.variants?.forEach(v => {
      if (v.barcodeValue) usedCodes.add(v.barcodeValue.toUpperCase());
    });
  });
  if (generatedInSession) {
    generatedInSession.forEach(code => usedCodes.add(code.toUpperCase()));
  }

  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  const safePrefix = (prefix || 'PRD').substring(0, 4).toUpperCase();
  do {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `${safePrefix}-${suffix}`;
  } while (usedCodes.has(code));

  return code;
}

export async function migrateProductBarcodes(): Promise<{ updated: number, total: number }> {
  try {
    console.log('migrateProductBarcodes: Starting migration check...');
    const products = await getProducts(true);
    const generatedInSession = new Set<string>();
    
    const needsMigration = (val: string | undefined, originalSku?: string): boolean => {
      if (!val) return true;
      if (originalSku && val === originalSku) return true;
      if (val.includes('-') && val.length > 10) return true;
      if (!val.includes('-')) return true;
      return false;
    };

    let updatedCount = 0;
    for (const p of products) {
      let productChanged = false;
      let newProductBarcode = p.barcodeValue;

      if (needsMigration(p.barcodeValue, p.sku)) {
        newProductBarcode = getUniqueBarcodeValue(p.subBrand || 'PRD', products, generatedInSession);
        generatedInSession.add(newProductBarcode);
        productChanged = true;
      }

      const updatedVariants = p.variants.map(v => {
        const cleanColor = v.color.trim();
        const cleanModel = v.model.trim();
        const vColorCode = cleanColor.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
        const vModelCode = cleanModel.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
        const oldLongBarcodeValue = `${p.sku}-${vColorCode}-${vModelCode}`;

        if (needsMigration(v.barcodeValue, oldLongBarcodeValue) || needsMigration(v.barcodeValue, p.sku)) {
          const newVariantBarcode = getUniqueBarcodeValue(p.subBrand || 'PRD', products, generatedInSession);
          generatedInSession.add(newVariantBarcode);
          productChanged = true;
          return {
            ...v,
            barcodeValue: newVariantBarcode
          };
        }
        return v;
      });

      if (productChanged) {
        console.log(`migrateProductBarcodes: Migrating product "${p.name}" [SKU: ${p.sku}] with new barcodes.`);
        await updateProduct(p.id, {
          barcodeValue: newProductBarcode,
          variants: updatedVariants
        });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`migrateProductBarcodes: Successfully migrated ${updatedCount} products.`);
    } else {
      console.log('migrateProductBarcodes: All products up-to-date. No migration needed.');
    }

    return { updated: updatedCount, total: products.length };
  } catch (error) {
    console.error('migrateProductBarcodes: Migration failed:', error);
    return { updated: 0, total: 0 };
  }
}

// ==========================================
// STOCK LOG OPERATIONS
// ==========================================

export async function getStockLogs(productId?: string): Promise<StockLog[]> {
  try {
    const colRef = collection(db, 'stockLogs');
    let q;
    if (productId) {
      q = query(colRef, where('productId', '==', productId), orderBy('timestamp', 'desc'));
    } else {
      q = query(colRef, orderBy('timestamp', 'desc'));
    }
    const querySnapshot = await getDocs(q);
    const logs: StockLog[] = [];
    querySnapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...(doc.data() as any) } as StockLog);
    });
    return logs;
  } catch (error) {
    console.error('Error fetching stock logs:', error);
    // Fallback: If index is not yet built, query all and sort in memory
    try {
      const colRef = collection(db, 'stockLogs');
      const querySnapshot = await getDocs(colRef);
      const logs: StockLog[] = [];
      querySnapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...(doc.data() as any) } as StockLog);
      });
      // Filter & sort
      const filtered = productId ? logs.filter(l => l.productId === productId) : logs;
      return filtered.sort((a, b) => b.timestamp - a.timestamp);
    } catch (innerError) {
      console.error('Fallback fetching logs failed:', innerError);
      return [];
    }
  }
}

/**
 * Adds a stock log and updates the corresponding product's variants stock counts in Firestore.
 */
export async function addStockLog(log: Omit<StockLog, 'id' | 'timestamp'>): Promise<void> {
  try {
    const logColRef = collection(db, 'stockLogs');
    const sanitizedData = sanitizeData({
      ...log,
      timestamp: Date.now()
    });
    await addDoc(logColRef, sanitizedData);
  } catch (error) {
    console.error('Error logging stock transaction:', error);
    handleFirestoreError(error, OperationType.CREATE, 'stockLogs');
  }
}

// ==========================================
// SEEDING HELPER (Runs if collections are empty)
// ==========================================

export async function seedInitialDataIfEmpty(): Promise<void> {
  try {
    const rolePermsRef = doc(db, 'settings', 'rolePermissions');
    const rolePermsSnap = await getDoc(rolePermsRef);
    if (!rolePermsSnap.exists()) {
      await setDoc(rolePermsRef, {
        admin: {
          addProduct: true,
          editProduct: true,
          deleteProduct: true,
          manageCategories: true,
          stockIn: true,
          stockOut: true,
          stockAdjustment: true,
          manageOrders: true,
          voidInvoice: false
        },
        staff: {
          addProduct: false,
          editProduct: false,
          deleteProduct: false,
          manageCategories: false,
          stockIn: true,
          stockOut: true,
          stockAdjustment: false,
          manageOrders: false,
          voidInvoice: false
        }
      });
      console.log('Seeded rolePermissions default settings.');
    }

    const categories = await getCategories();
    if (categories.length === 0) {
      const defaults = [
        {
          main: "Audio",
          subs: [
            { sub: "Earbuds", children: ["TWS", "Wired", "Gaming Earbuds"] },
            { sub: "Headphones", children: ["Over-Ear", "On-Ear", "Wireless ANC"] },
            { sub: "Speakers", children: ["Bluetooth", "Soundbars", "Smart Speakers"] }
          ]
        },
        {
          main: "Power & Charging",
          subs: [
            { sub: "GaN Chargers", children: ["65W USB-C", "100W Dual-Port", "Desktop Chargers"] },
            { sub: "Cables", children: ["Type-C to Type-C", "Lightning MFi", "Multi-Cables 3-in-1"] },
            { sub: "Power Banks", children: ["20000mAh Power Delivery", "Wireless MagSafe", "Pocket Chargers"] }
          ]
        },
        {
          main: "Mobile Accessories",
          subs: [
            { sub: "Protective Cases", children: ["Silicon Back Cover", "Premium Rugged Armor", "Leather Wallet Case"] },
            { sub: "Screen Protectors", children: ["Tempered Glass 9D", "Matte Gaming Film", "Privacy Protectors"] },
            { sub: "Mounts & Stands", children: ["Car MagSafe Mount", "Desktop Stand", "Ring Holders"] }
          ]
        }
      ];

      for (const item of defaults) {
        const mainCat = await addCategory(item.main, "main", null);
        for (const subItem of item.subs) {
          const subCat = await addCategory(subItem.sub, "sub", mainCat.id);
          for (const childName of subItem.children) {
            await addCategory(childName, "child", subCat.id);
          }
        }
      }
    }

    const brands = await getBrands();
    if (brands.length === 0) {
      const defaults = ['Apple', 'Samsung', 'Xiaomi', 'Anker', 'Baseus', 'Joyroom', 'Hoco', 'Ugreen', 'Realme', 'OnePlus'];
      for (const brand of defaults) {
        await addBrand(brand);
      }
    }
  } catch (e) {
    console.error('Seeding default collections error:', e);
  }
}

export async function clearSampleData(): Promise<void> {
  console.log('Attempting to clear sample/demo data...');
  const collections = ['categories', 'brands', 'products', 'stockLogs', 'expenses', 'incomes'];
  for (const colName of collections) {
    try {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      let batch = writeBatch(db);
      let count = 0;
      for (const docSnap of snapshot.docs) {
        batch.delete(doc(db, colName, docSnap.id));
        count++;
        if (count === 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
      console.log(`Cleared all documents in ${colName} collection.`);
    } catch (e) {
      console.error(`Error clearing ${colName}:`, e);
      throw e;
    }
  }
  dbCache.clearAll();
  localStore.remove('products');
  localStore.remove('categories');
  localStore.remove('brands');
  localStore.remove('expenses');
  localStore.remove('incomes');
  console.log('Finished clearing sample data.');
}

export async function clearAllExpenses(): Promise<void> {
  dbCache.expenses = null;
  localStore.remove('expenses');
  try {
    const colRef = collection(db, 'expenses');
    const snapshot = await getDocs(colRef);
    let batch = writeBatch(db);
    let count = 0;
    for (const docSnap of snapshot.docs) {
      batch.delete(doc(db, 'expenses', docSnap.id));
      count++;
      if (count === 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (e) {
    console.warn('clearAllExpenses remote error:', e);
  }
}

export async function clearAllIncomes(): Promise<void> {
  dbCache.incomes = null;
  localStore.remove('incomes');
  try {
    const colRef = collection(db, 'incomes');
    const snapshot = await getDocs(colRef);
    let batch = writeBatch(db);
    let count = 0;
    for (const docSnap of snapshot.docs) {
      batch.delete(doc(db, 'incomes', docSnap.id));
      count++;
      if (count === 400) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (e) {
    console.warn('clearAllIncomes remote error:', e);
  }
}

export async function clearDemoFinancials(): Promise<{ deletedExpenses: number; deletedIncomes: number }> {
  dbCache.expenses = null;
  dbCache.incomes = null;
  
  const demoExpenseRefs = new Set([
    'BANK-LC-88412', 'BK-TRX-19482', 'UPAY-TX-77319', 'SALARY-2026-AUG', 
    'RENT-REC-08', 'NG-TRX-55102', 'RK-TRX-33190', 'GZ-INV-2026-99', 
    'CB-9942', 'ADS-AUG-01', 'PAYROLL-08', 'RENT-AUG-2026', 'ST-INV-4410', 'CARGO-7721'
  ]);
  const demoExpenseSuppliers = new Set([
    'Guangzhou Baseus Direct Co', 'Chawkbazar Poly & Bubble Store', 'Meta Ads BD Agency',
    'Store Staff & Dispatch Team', 'Motijheel Commercial Complex', 'Steadfast Courier Line',
    'Airport Cargo Pickup Transport'
  ]);

  const demoIncomeRefs = new Set([
    'COD-SETTLE-8831', 'BK-TRX-948123', 'NG-REB-20419', 'BANK-TRF-55201'
  ]);
  const demoIncomeCustomers = new Set([
    'Steadfast Courier COD Settlement', 'Ahmed Tanvir', 'Supplier Partial Rebate', 'Dhaka Recyclers Ltd'
  ]);

  const isDemoExpense = (data: Partial<Expense>) => {
    if (!data) return false;
    const ref = (data.reference || '').trim();
    const inv = (data.invoiceNo || '').trim();
    const sup = (data.supplierName || '').trim();
    const notes = (data.notes || '').toLowerCase();
    return (
      (ref && demoExpenseRefs.has(ref)) ||
      (inv && demoExpenseRefs.has(inv)) ||
      (sup && demoExpenseSuppliers.has(sup)) ||
      notes.includes('sample') ||
      notes.includes('demo') ||
      sup.includes('guangzhou baseus') ||
      sup.includes('chawkbazar') ||
      sup.includes('meta ads bd') ||
      sup.includes('motijheel commercial')
    );
  };

  const isDemoIncome = (data: Partial<Income>) => {
    if (!data) return false;
    const ref = (data.reference || '').trim();
    const cust = (data.customerName || '').trim();
    const notes = (data.notes || '').toLowerCase();
    return (
      (ref && demoIncomeRefs.has(ref)) ||
      (cust && demoIncomeCustomers.has(cust)) ||
      notes.includes('sample') ||
      notes.includes('demo') ||
      cust.includes('dhaka recyclers') ||
      cust.includes('steadfast courier cod settlement') ||
      cust.includes('supplier partial rebate')
    );
  };

  let deletedExpenses = 0;
  let deletedIncomes = 0;

  // Clear demo expenses
  try {
    const expSnap = await getDocs(collection(db, 'expenses'));
    let batch = writeBatch(db);
    let count = 0;
    for (const docSnap of expSnap.docs) {
      const data = docSnap.data() as Expense;
      if (isDemoExpense(data)) {
        batch.delete(doc(db, 'expenses', docSnap.id));
        deletedExpenses++;
        count++;
        if (count === 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (e) {
    console.warn('Error deleting remote demo expenses:', e);
  }

  // Clear demo incomes
  try {
    const incSnap = await getDocs(collection(db, 'incomes'));
    let batch = writeBatch(db);
    let count = 0;
    for (const docSnap of incSnap.docs) {
      const data = docSnap.data() as Income;
      if (isDemoIncome(data)) {
        batch.delete(doc(db, 'incomes', docSnap.id));
        deletedIncomes++;
        count++;
        if (count === 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (e) {
    console.warn('Error deleting remote demo incomes:', e);
  }

  // Clean local caches
  const cachedExp = localStore.get<Expense[]>('expenses') || [];
  const filteredExp = cachedExp.filter(e => !isDemoExpense(e));
  localStore.set('expenses', filteredExp);

  const cachedInc = localStore.get<Income[]>('incomes') || [];
  const filteredInc = cachedInc.filter(i => !isDemoIncome(i));
  localStore.set('incomes', filteredInc);

  return { deletedExpenses, deletedIncomes };
}

// ==========================================
// ATTENDANCE LOGIC
// ==========================================

export async function checkInUser(userId: string, userName: string, role: string, subBrand: string): Promise<string> {
  const colRef = collection(db, 'attendance');
  const now = Date.now();
  const dateStr = new Date(now).toISOString().split('T')[0];

  // 1. Safety Check: Check if user already has an open session
  // We query for ALL open sessions for this user to be sure
  const qOpen = query(
    colRef, 
    where('userId', '==', userId), 
    where('checkOutTime', '==', null)
  );
  
  const openSnap = await getDocs(qOpen);
  
  // If multiple open sessions exist, we need to handle them
  if (!openSnap.empty) {
    console.warn('User already has open session(s), cleaning up and re-using latest.');
    
    // Sort in memory just in case
    const sessions = openSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    sessions.sort((a, b) => b.checkInTime - a.checkInTime);
    
    const latestSessionId = sessions[0].id;
    const latestDate = sessions[0].date;

    // Close other "orphan" sessions if there are more than 1
    if (sessions.length > 1) {
      for (let i = 1; i < sessions.length; i++) {
        await updateDoc(doc(db, 'attendance', sessions[i].id), {
          checkOutTime: sessions[i].checkInTime + 60000, // +1 min dummy
          durationMinutes: 1,
          cleanupFlag: 'auto-closed-on-checkin'
        });
      }
    }
    
    // Ensure user profile is synced
    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
      currentSessionStatus: 'checked_in',
      currentSessionId: latestSessionId,
      currentSessionDate: latestDate
    });
    
    return latestSessionId;
  }

  const docRef = await addDoc(colRef, {
    userId,
    userName,
    role,
    subBrand,
    checkInTime: now,
    checkOutTime: null,
    date: dateStr,
    durationMinutes: null
  });

  const userDocRef = doc(db, 'users', userId);
  await updateDoc(userDocRef, {
    currentSessionStatus: 'checked_in',
    currentSessionId: docRef.id,
    currentSessionDate: dateStr
  });

  return docRef.id;
}

export async function checkInOnBehalf(
  targetUserId: string,
  targetUser: UserProfile,
  adminUserId: string,
  adminName: string,
  customTime?: number
): Promise<string> {
  const colRef = collection(db, 'attendance');
  const checkInTime = customTime || Date.now();
  const dateStr = new Date(checkInTime).toISOString().split('T')[0];

  try {
    // 1. Check for existing open session
    const qOpen = query(
      colRef,
      where('userId', '==', targetUserId),
      where('checkOutTime', '==', null)
    );
    const openSnap = await getDocs(qOpen);
    if (!openSnap.empty) {
      throw new Error('User already has an open session. Please check out first.');
    }

    // 2. Create attendance record
    const subBrand = targetUser.subBrandAccess?.[0] || 'SAT';
    const docRef = await addDoc(colRef, {
      userId: targetUserId,
      userName: targetUser.name,
      role: targetUser.role,
      subBrand,
      checkInTime,
      checkOutTime: null,
      date: dateStr,
      durationMinutes: null,
      isManualEntry: true,
      checkedInBy: adminName
    });

    // 3. Update user profile
    const userDocRef = doc(db, 'users', targetUserId);
    await updateDoc(userDocRef, {
      currentSessionStatus: 'checked_in',
      currentSessionId: docRef.id,
      currentSessionDate: dateStr
    });

    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `attendance/behalf_checkin/${targetUserId}`);
  }
}

export async function checkOutOnBehalf(
  targetUserId: string,
  targetUser: UserProfile,
  adminUserId: string,
  adminName: string,
  customTime?: number
): Promise<void> {
  const checkOutTime = customTime || Date.now();
  const colRef = collection(db, 'attendance');

  try {
    // 1. Try to find open session
    const qOpen = query(
      colRef,
      where('userId', '==', targetUserId),
      where('checkOutTime', '==', null)
    );
    const openSnap = await getDocs(qOpen);

    if (openSnap.empty) {
      // If no open session found, just reset the status to be safe
      const userDocRef = doc(db, 'users', targetUserId);
      await updateDoc(userDocRef, {
        currentSessionStatus: 'checked_out',
        currentSessionId: null,
        currentSessionDate: null
      });
      return;
    }

    // Close all open sessions (usually there's only 1)
    for (const d of openSnap.docs) {
      const checkInTime = d.data().checkInTime;
      const durationMinutes = Math.max(1, Math.round((checkOutTime - checkInTime) / (1000 * 60)));
      await updateDoc(doc(db, 'attendance', d.id), {
        checkOutTime,
        durationMinutes,
        isManualEntry: true,
        checkedOutBy: adminName
      });
    }

    // Reset user profile status
    const userDocRef = doc(db, 'users', targetUserId);
    await updateDoc(userDocRef, {
      currentSessionStatus: 'checked_out',
      currentSessionId: null,
      currentSessionDate: null
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `attendance/behalf_checkout/${targetUserId}`);
  }
}

export async function checkOutUser(userId: string, sessionId: string | null): Promise<void> {
  const now = Date.now();
  const colRef = collection(db, 'attendance');

  // If sessionId is provided, try to close it specifically first
  if (sessionId) {
    try {
      const docRef = doc(db, 'attendance', sessionId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const checkInTime = data.checkInTime;
        const durationMinutes = Math.round((now - checkInTime) / (1000 * 60));

        await updateDoc(docRef, {
          checkOutTime: now,
          durationMinutes
        });
      }
    } catch (e) {
      console.error('Failed to close specific session:', sessionId, e);
    }
  }

  // Safety: Find and close ANY other open sessions for this user
  const qOpen = query(
    colRef, 
    where('userId', '==', userId), 
    where('checkOutTime', '==', null)
  );
  const openSnap = await getDocs(qOpen);
  
  if (!openSnap.empty) {
    for (const d of openSnap.docs) {
      const checkInTime = d.data().checkInTime;
      const durationMinutes = Math.round((now - checkInTime) / (1000 * 60));
      await updateDoc(doc(db, 'attendance', d.id), {
        checkOutTime: now,
        durationMinutes: durationMinutes > 0 ? durationMinutes : 1
      });
    }
  }

  // Always reset user profile status
  const userDocRef = doc(db, 'users', userId);
  await updateDoc(userDocRef, {
    currentSessionStatus: 'checked_out',
    currentSessionId: null,
    currentSessionDate: null
  });
}

export async function getTodayAttendance(userId: string): Promise<any[]> {
  const colRef = collection(db, 'attendance');
  const dateStr = new Date().toISOString().split('T')[0];
  const q = query(colRef, where('userId', '==', userId), where('date', '==', dateStr), orderBy('checkInTime', 'desc'));
  
  const querySnapshot = await getDocs(q);
  const records: any[] = [];
  querySnapshot.forEach((doc) => {
    records.push({ id: doc.id, ...doc.data() });
  });
  return records;
}

export async function deleteAttendanceRecord(id: string): Promise<void> {
  const docRef = doc(db, 'attendance', id);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    const userId = data.userId;
    
    // Delete the record
    await deleteDoc(docRef);
    
    // If this was the user's active session, reset their profile status
    const userDocRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.currentSessionId === id) {
        await updateDoc(userDocRef, {
          currentSessionStatus: 'checked_out',
          currentSessionId: null,
          currentSessionDate: null
        });
      }
    }
  }
}

/**
 * One-time cleanup for duplicate open sessions.
 * Closes sessions that were left open when a newer one was started.
 */
export async function cleanupDuplicateSessions(): Promise<number> {
  console.log('Starting cleanup of duplicate open sessions...');
  const colRef = collection(db, 'attendance');
  // Simple query to avoid composite index errors
  const q = query(colRef, where('checkOutTime', '==', null));
  const snap = await getDocs(q);
  
  const userOpenSessions: Record<string, any[]> = {};
  snap.docs.forEach(doc => {
    const data = doc.data();
    if (!userOpenSessions[data.userId]) userOpenSessions[data.userId] = [];
    userOpenSessions[data.userId].push({ id: doc.id, ...data });
  });

  let closedCount = 0;
  for (const userId in userOpenSessions) {
    const sessions = userOpenSessions[userId];
    if (sessions.length > 1) {
      // Sort in memory by checkInTime
      sessions.sort((a, b) => a.checkInTime - b.checkInTime);
      
      const userDoc = await getDoc(doc(db, 'users', userId));
      const activeId = userDoc.exists() ? userDoc.data().currentSessionId : null;
      
      for (const session of sessions) {
        // Close sessions that are NOT the one currently active in the user profile
        // OR if none is active, close everything except the very latest one
        if (session.id !== activeId) {
          const checkOutTime = session.checkInTime + (5 * 60 * 1000); // Default 5 mins
          await updateDoc(doc(db, 'attendance', session.id), {
            checkOutTime,
            durationMinutes: 5,
            cleanupFlag: 'auto-closed-duplicate'
          });
          closedCount++;
        }
      }
    }
  }
  
  console.log(`Cleanup finished. Closed ${closedCount} orphan sessions.`);
  return closedCount;
}

export async function getAllAttendanceRecords(dateFilter?: string, userIdFilter?: string): Promise<any[]> {
  const colRef = collection(db, 'attendance');
  let q = query(colRef, orderBy('checkInTime', 'desc'));
  
  // Note: we might need composite indexes if filtering by both date and userId
  if (dateFilter && !userIdFilter) {
    q = query(colRef, where('date', '==', dateFilter), orderBy('checkInTime', 'desc'));
  } else if (!dateFilter && userIdFilter) {
    q = query(colRef, where('userId', '==', userIdFilter), orderBy('checkInTime', 'desc'));
  } else if (dateFilter && userIdFilter) {
    q = query(colRef, where('date', '==', dateFilter), where('userId', '==', userIdFilter), orderBy('checkInTime', 'desc'));
  }
  
  try {
    const querySnapshot = await getDocs(q);
    const records: any[] = [];
    querySnapshot.forEach((doc) => {
      records.push({ id: doc.id, ...doc.data() });
    });
    return records;
  } catch (error) {
    console.error('Error fetching attendance logs, falling back to client-side filtering:', error);
    // Fallback if composite index is missing
    const fallbackQuery = query(colRef, orderBy('checkInTime', 'desc'));
    const querySnapshot = await getDocs(fallbackQuery);
    let records: any[] = [];
    querySnapshot.forEach((doc) => {
      records.push({ id: doc.id, ...doc.data() });
    });
    if (dateFilter) records = records.filter(r => r.date === dateFilter);
    if (userIdFilter) records = records.filter(r => r.userId === userIdFilter);
    return records;
  }
}

export async function deleteSokolDemoData(): Promise<void> {
  console.log('Attempting to delete Sokol demo data...');
  const collections = ['categories', 'brands', 'products'];
  for (const colName of collections) {
    const colRef = collection(db, colName);
    const snapshot = await getDocs(colRef);
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (JSON.stringify(data).includes('Sokol')) {
        console.log('Deleting Sokol data from', colName, ':', docSnap.id);
        await deleteDoc(doc(db, colName, docSnap.id));
      }
    }
  }
  console.log('Finished deleting Sokol demo data.');
}

export interface ProductAttributes {
  colors: string[];
  sizes: string[];
}

export async function getProductAttributes(): Promise<ProductAttributes | null> {
  try {
    const docRef = doc(db, 'settings', 'productAttributes');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as ProductAttributes;
    }
    return null;
  } catch (error) {
    console.error('Error fetching product attributes:', error);
    return null;
  }
}

export async function saveProductAttributes(attributes: ProductAttributes): Promise<void> {
  const docRef = doc(db, 'settings', 'productAttributes');
  try {
    await setDoc(docRef, sanitizeData(attributes), { merge: true });
  } catch (error) {
    console.error('saveProductAttributes failed:', error);
  }
}

// ==========================================
// CUSTOMER & ORDER OPERATIONS
// ==========================================

export async function getNextCustomerId(txn?: any): Promise<string> {
  const counterRef = doc(db, 'settings', 'customerCounter');
  if (txn) {
    const snap = await txn.get(counterRef);
    let currentCount = 0;
    if (snap.exists()) {
      currentCount = snap.data().count || 0;
    }
    const nextCount = currentCount + 1;
    txn.set(counterRef, { count: nextCount }, { merge: true });
    return `CUS-${String(nextCount).padStart(4, '0')}`;
  } else {
    let nextNum = 1;
    await runTransaction(db, async (t) => {
      const snap = await t.get(counterRef);
      let currentCount = 0;
      if (snap.exists()) {
        currentCount = snap.data().count || 0;
      }
      nextNum = currentCount + 1;
      t.set(counterRef, { count: nextNum }, { merge: true });
    });
    return `CUS-${String(nextNum).padStart(4, '0')}`;
  }
}

export async function getCustomers(): Promise<Customer[]> {
  if (dbCache.customers) return dbCache.customers;
  const cached = localStore.get<Customer[]>('customers');
  try {
    const colRef = collection(db, 'customers');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const list: Customer[] = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() } as Customer);
    });
    dbCache.customers = list;
    localStore.set('customers', list);
    return list;
  } catch (error) {
    console.warn('Error fetching customers, returning local cache:', error);
    if (cached) {
      dbCache.customers = cached;
      return cached;
    }
    return [];
  }
}

export async function addCustomer(customerData: Omit<Customer, 'id'>): Promise<string> {
  dbCache.customers = null;
  const colRef = collection(db, 'customers');
  let cid = customerData.customerId;
  if (!cid) {
    try {
      cid = await getNextCustomerId();
    } catch {
      cid = `CUS-${Math.floor(1000 + Math.random() * 9000)}`;
    }
  }
  const payload = {
    ...customerData,
    customerId: cid,
    createdAt: customerData.createdAt || Date.now()
  };
  const sanitized = sanitizeData(payload);

  try {
    const docRef = await addDoc(colRef, sanitized);
    const currentCached = localStore.get<Customer[]>('customers') || [];
    localStore.set('customers', [{ id: docRef.id, ...sanitized } as Customer, ...currentCached]);
    return docRef.id;
  } catch (error) {
    console.warn('addCustomer remote write failed, saved locally:', error);
    const localId = `local_cust_${Date.now()}`;
    const currentCached = localStore.get<Customer[]>('customers') || [];
    localStore.set('customers', [{ id: localId, ...sanitized } as Customer, ...currentCached]);
    return localId;
  }
}

export async function migrateExistingCustomerIds(): Promise<{ totalMigrated: number; nextCounter: number }> {
  try {
    const colRef = collection(db, 'customers');
    const snapshot = await getDocs(colRef);
    const allCustomers = snapshot.docs.map(d => ({
      docId: d.id,
      data: d.data() as Customer
    }));

    // Find customers missing customerId
    const missing = allCustomers.filter(c => !c.data.customerId);

    // Get current counter
    const counterRef = doc(db, 'settings', 'customerCounter');
    const counterSnap = await getDoc(counterRef);
    let currentCount = counterSnap.exists() ? (counterSnap.data().count || 0) : 0;

    if (missing.length === 0) {
      return { totalMigrated: 0, nextCounter: currentCount };
    }

    // Sort missing by createdAt ascending (oldest first)
    missing.sort((a, b) => (a.data.createdAt || 0) - (b.data.createdAt || 0));

    const batch = writeBatch(db);
    let count = currentCount;

    for (const item of missing) {
      count++;
      const generatedId = `CUS-${String(count).padStart(4, '0')}`;
      const custRef = doc(db, 'customers', item.docId);
      batch.update(custRef, { customerId: generatedId });
    }

    batch.set(counterRef, { count }, { merge: true });
    await batch.commit();

    return { totalMigrated: missing.length, nextCounter: count };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'customers/migrateCustomerIds');
  }
}

export async function updateCustomer(id: string, customerData: Partial<Customer>): Promise<void> {
  dbCache.customers = null;
  try {
    const docRef = doc(db, 'customers', id);
    const sanitized = sanitizeData(customerData);
    await updateDoc(docRef, sanitized);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'customers/' + id);
  }
}

export async function getOrders(): Promise<Order[]> {
  if (dbCache.orders) return dbCache.orders;
  const cached = localStore.get<Order[]>('orders');
  try {
    const colRef = collection(db, 'orders');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const list: Order[] = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() } as Order);
    });
    dbCache.orders = list;
    dbCache.invoices = list;
    localStore.set('orders', list);
    return list;
  } catch (error) {
    console.warn('Error fetching orders, returning cached:', error);
    if (cached) {
      dbCache.orders = cached;
      dbCache.invoices = cached;
      return cached;
    }
    return [];
  }
}

export async function addOrder(orderData: Omit<Order, 'id'>): Promise<string> {
  dbCache.orders = null;
  const sanitized = sanitizeData({
    ...orderData,
    createdAt: orderData.createdAt || Date.now()
  });

  try {
    const colRef = collection(db, 'orders');
    const docRef = await addDoc(colRef, sanitized);
    const cached = localStore.get<Order[]>('orders') || [];
    localStore.set('orders', [{ id: docRef.id, ...sanitized } as Order, ...cached]);
    return docRef.id;
  } catch (error) {
    console.warn('addOrder remote save failed, stored locally:', error);
    const localId = `local_ord_${Date.now()}`;
    const cached = localStore.get<Order[]>('orders') || [];
    localStore.set('orders', [{ id: localId, ...sanitized } as Order, ...cached]);
    return localId;
  }
}

export async function deleteOrder(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'orders', id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'orders/' + id);
  }
}

export async function recalculateCustomerStats(customerId: string): Promise<void> {
  try {
    const ordersCol = collection(db, 'orders');
    const q = query(ordersCol, where('customerId', '==', customerId));
    const snapshot = await getDocs(q);
    
    let totalOrders = 0;
    let lifetimeValue = 0;
    
    snapshot.forEach(docSnap => {
      const order = docSnap.data() as Order;
      totalOrders++;
      if (order.status !== 'Returned/Cancelled') {
        lifetimeValue += order.totalAmount;
      }
    });
    
    const customerRef = doc(db, 'customers', customerId);
    await updateDoc(customerRef, {
      totalOrders,
      lifetimeValue
    });
  } catch (err) {
    console.error('recalculateCustomerStats failed:', err);
  }
}

// Order Status machine & Stock sync helper
export async function updateOrderAndHandleStock(
  orderId: string,
  updatedOrder: Order,
  oldStatus: OrderStatus,
  userId: string,
  userName: string
): Promise<void> {
  try {
    const orderDocRef = doc(db, 'orders', orderId);
    
    await runTransaction(db, async (transaction) => {
      const newStatus = updatedOrder.status;
      const isStockDeducted = (status: OrderStatus) => ['Confirmed', 'Packed', 'Shipped', 'Delivered'].includes(status);
      
      const shouldDeduct = !isStockDeducted(oldStatus) && isStockDeducted(newStatus);
      const shouldRestore = isStockDeducted(oldStatus) && (newStatus === 'Returned/Cancelled');
      
      // --- ALL READS MUST GO HERE ---
      // 1. Read products
      const productSnaps = new Map<string, any>();
      if (shouldDeduct || shouldRestore) {
        // Collect unique product IDs to minimize reads
        const productIds = Array.from(new Set(updatedOrder.items.map(item => item.productId)));
        for (const pid of productIds) {
          const productRef = doc(db, 'products', pid);
          const snap = await transaction.get(productRef);
          productSnaps.set(pid, snap);
        }
      }
      
      // 2. Read settings, counters, and customer if auto-generating invoice
      const isAutoInvoice = newStatus === 'Confirmed' && oldStatus !== 'Confirmed' && !updatedOrder.invoiceId;
      let companySettingsSnap = null;
      let countersSnap = null;
      let custSnapForInvoice = null;
      const companySettingsRef = doc(db, 'settings', 'company');
      const countersRef = doc(db, 'settings', 'invoiceCounters');
      
      if (isAutoInvoice) {
        companySettingsSnap = await transaction.get(companySettingsRef);
        countersSnap = await transaction.get(countersRef);
        if (updatedOrder.customerId) {
          custSnapForInvoice = await transaction.get(doc(db, 'customers', updatedOrder.customerId));
        }
      }
      
      // --- ALL WRITES MUST GO HERE ---
      // 1. Handle stock updates and stock logs
      if (shouldDeduct) {
        console.log(`Deducting stock for order ${orderId} during status change: ${oldStatus} -> ${newStatus}`);
        for (const item of updatedOrder.items) {
          const productSnap = productSnaps.get(item.productId);
          if (productSnap && productSnap.exists()) {
            const productData = productSnap.data() as Product;
            const updatedVariants = productData.variants.map((v: Variant) => {
              if (v.id === item.variantId) {
                const beforeQty = v.stock;
                const afterQty = Math.max(0, beforeQty - item.qty);
                
                const logRef = doc(collection(db, 'stockLogs'));
                const stockLog: Omit<StockLog, 'id'> = {
                  productId: item.productId,
                  productName: productData.name,
                  type: 'sale',
                  qty: -item.qty,
                  reason: 'Sale',
                  userId,
                  userName,
                  timestamp: Date.now(),
                  beforeQty,
                  afterQty,
                  orderId,
                  refNo: `ORDER-${orderId}`
                };
                transaction.set(logRef, sanitizeData(stockLog));
                
                return { ...v, stock: afterQty };
              }
              return v;
            });
            const productRef = doc(db, 'products', item.productId);
            const deductTotalStock = updatedVariants.reduce((sum: number, v: Variant) => sum + (v.stock || 0), 0);
            const deductStockStatus = deductTotalStock <= 0 ? 'out_of_stock' : 'in_stock';
            transaction.update(productRef, { variants: updatedVariants, stockStatus: deductStockStatus });
          }
        }
      } else if (shouldRestore) {
        console.log(`Restoring stock for order ${orderId} during status change: ${oldStatus} -> ${newStatus}`);
        for (const item of updatedOrder.items) {
          const productSnap = productSnaps.get(item.productId);
          if (productSnap && productSnap.exists()) {
            const productData = productSnap.data() as Product;
            const updatedVariants = productData.variants.map((v: Variant) => {
              if (v.id === item.variantId) {
                const beforeQty = v.stock;
                const afterQty = beforeQty + item.qty;
                
                const typeStr: StockLogType = newStatus === 'Returned/Cancelled' ? 'return_restock' : 'cancellation_restock';
                const reasonStr = newStatus === 'Returned/Cancelled' ? 'Return Restock' : 'Cancellation Restock';
                
                const logRef = doc(collection(db, 'stockLogs'));
                const stockLog: Omit<StockLog, 'id'> = {
                  productId: item.productId,
                  productName: productData.name,
                  type: typeStr,
                  qty: item.qty,
                  reason: reasonStr,
                  userId,
                  userName,
                  timestamp: Date.now(),
                  beforeQty,
                  afterQty,
                  orderId,
                  refNo: `ORDER-RESTORE-${orderId}`
                };
                transaction.set(logRef, sanitizeData(stockLog));
                
                return { ...v, stock: afterQty };
              }
              return v;
            });
            const productRef = doc(db, 'products', item.productId);
            const restoreTotalStock = updatedVariants.reduce((sum: number, v: Variant) => sum + (v.stock || 0), 0);
            const restoreStockStatus = restoreTotalStock <= 0 ? 'out_of_stock' : 'in_stock';
            transaction.update(productRef, { variants: updatedVariants, stockStatus: restoreStockStatus });
          }
        }
      }
      
      // 2. Handle auto-invoice writes
      if (isAutoInvoice) {
        console.log(`Auto-generating invoice for order ${orderId} on confirmation...`);
        const prefixes = companySettingsSnap && companySettingsSnap.exists() 
          ? companySettingsSnap.data().prefixes 
          : { SAT: 'SAT-INV', GZ: 'GZ-INV', RTX: 'RTX-INV' };
        
        let satCounter = 0;
        let gzCounter = 0;
        let rtxCounter = 0;
        if (countersSnap && countersSnap.exists()) {
          const cData = countersSnap.data();
          satCounter = cData.satCounter || 0;
          gzCounter = cData.gzCounter || 0;
          rtxCounter = cData.rtxCounter || 0;
        }
        
        let prefix = 'INV';
        let nextNum = 1;
        const sub = updatedOrder.subBrand || 'SAT';
        if (sub === 'SAT') {
          prefix = prefixes?.SAT || 'SAT-INV';
          satCounter++;
          nextNum = satCounter;
        } else if (sub === 'GZ') {
          prefix = prefixes?.GZ || 'GZ-INV';
          gzCounter++;
          nextNum = gzCounter;
        } else if (sub === 'RTX') {
          prefix = prefixes?.RTX || 'RTX-INV';
          rtxCounter++;
          nextNum = rtxCounter;
        }
        
        transaction.set(countersRef, {
          satCounter,
          gzCounter,
          rtxCounter
        }, { merge: true });
        
        const invoiceNum = `${prefix}-${String(nextNum).padStart(4, '0')}`;
        const invoiceId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const invoiceDocRef = doc(db, 'invoices', invoiceId);
        
        const invoiceCustId = custSnapForInvoice && custSnapForInvoice.exists() ? (custSnapForInvoice.data().customerId || '') : '';

        const invoiceData = {
          id: invoiceId,
          orderId: orderId,
          invoiceNumber: invoiceNum,
          subBrand: updatedOrder.subBrand,
          subBrandPrefix: prefix,
          customerId: invoiceCustId,
          customerName: updatedOrder.customerName,
          customerPhone: updatedOrder.customerPhone,
          items: updatedOrder.items,
          discountAmount: updatedOrder.discountAmount || 0,
          shippingCharge: updatedOrder.shippingCharge || 0,
          totalAmount: updatedOrder.totalAmount,
          amountPaid: updatedOrder.amountPaid,
          amountDue: updatedOrder.amountDue,
          paymentStatus: updatedOrder.paymentStatus,
          courier: updatedOrder.courier,
          courierTrackingNumber: updatedOrder.courierTrackingNumber || '',
          generatedAt: Date.now(),
          generatedBy: userId,
          voided: false
        };
        
        transaction.set(invoiceDocRef, sanitizeData(invoiceData));
        updatedOrder.invoiceId = invoiceId;
      }
      
      // 3. Update the order itself
      const sanitizedOrder = sanitizeData(updatedOrder);
      delete sanitizedOrder.id;
      transaction.update(orderDocRef, sanitizedOrder);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'orders/' + orderId);
  }
}

// Full Order Edit helper with stock delta management & invoice sync
export async function updateOrderFullDetails(
  orderId: string,
  updatedOrderData: Partial<Order> & { items: OrderItem[] },
  userId: string,
  userName: string
): Promise<Order> {
  try {
    const orderDocRef = doc(db, 'orders', orderId);
    let resultOrder: Order | null = null;

    await runTransaction(db, async (transaction) => {
      const orderSnap = await transaction.get(orderDocRef);
      if (!orderSnap.exists()) {
        throw new Error(`Order ${orderId} not found`);
      }

      const existingOrder = orderSnap.data() as Order;
      const isStockDeducted = ['Confirmed', 'Packed', 'Shipped', 'Delivered'].includes(existingOrder.status);

      // 1. Calculate stock differences if this order already had its stock deducted
      const oldQtyMap = new Map<string, { productId: string; variantId: string; qty: number }>();
      (existingOrder.items || []).forEach(item => {
        const key = `${item.productId}__${item.variantId}`;
        const curr = oldQtyMap.get(key) || { productId: item.productId, variantId: item.variantId, qty: 0 };
        curr.qty += (item.qty || 0);
        oldQtyMap.set(key, curr);
      });

      const newQtyMap = new Map<string, { productId: string; variantId: string; qty: number; productName: string }>();
      (updatedOrderData.items || []).forEach(item => {
        const key = `${item.productId}__${item.variantId}`;
        const curr = newQtyMap.get(key) || { productId: item.productId, variantId: item.variantId, qty: 0, productName: item.productName };
        curr.qty += (item.qty || 0);
        newQtyMap.set(key, curr);
      });

      const allVariantKeys = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
      const uniqueProductIds = new Set<string>();

      if (isStockDeducted) {
        allVariantKeys.forEach(k => {
          const pid = k.split('__')[0];
          uniqueProductIds.add(pid);
        });
      }

      // --- ALL READS FIRST ---
      const productSnaps = new Map<string, any>();
      if (isStockDeducted) {
        for (const pid of Array.from(uniqueProductIds)) {
          const pRef = doc(db, 'products', pid);
          const pSnap = await transaction.get(pRef);
          productSnaps.set(pid, pSnap);
        }
      }

      let invoiceSnap = null;
      if (existingOrder.invoiceId) {
        const invoiceRef = doc(db, 'invoices', existingOrder.invoiceId);
        invoiceSnap = await transaction.get(invoiceRef);
      }

      // --- ALL WRITES ---
      // 1. Handle stock adjustments (delta)
      if (isStockDeducted) {
        for (const key of Array.from(allVariantKeys)) {
          const oldEntry = oldQtyMap.get(key);
          const newEntry = newQtyMap.get(key);
          const oldQty = oldEntry?.qty || 0;
          const newQty = newEntry?.qty || 0;
          const delta = newQty - oldQty; // If delta > 0: need to deduct more; if delta < 0: restore stock

          if (delta !== 0) {
            const productId = key.split('__')[0];
            const variantId = key.split('__')[1];
            const pSnap = productSnaps.get(productId);

            if (pSnap && pSnap.exists()) {
              const productData = pSnap.data() as Product;
              const updatedVariants = productData.variants.map((v: Variant) => {
                if (v.id === variantId) {
                  const beforeQty = v.stock;
                  const afterQty = Math.max(0, beforeQty - delta);

                  const logRef = doc(collection(db, 'stockLogs'));
                  const stockLog: Omit<StockLog, 'id'> = {
                    productId,
                    productName: productData.name,
                    type: delta > 0 ? 'sale' : 'adjustment',
                    qty: -delta,
                    reason: delta > 0 ? `Order Edit (#${orderId.substring(0, 8)}) - Increased Qty` : `Order Edit (#${orderId.substring(0, 8)}) - Decreased Qty / Restock`,
                    userId,
                    userName,
                    timestamp: Date.now(),
                    beforeQty,
                    afterQty,
                    orderId,
                    refNo: `ORDER-EDIT-${orderId}`
                  };
                  transaction.set(logRef, sanitizeData(stockLog));

                  return { ...v, stock: afterQty };
                }
                return v;
              });

              const productRef = doc(db, 'products', productId);
              const totalStock = updatedVariants.reduce((sum: number, v: Variant) => sum + (v.stock || 0), 0);
              const stockStatus = totalStock <= 0 ? 'out_of_stock' : 'in_stock';
              transaction.update(productRef, { variants: updatedVariants, stockStatus });
            }
          }
        }
      }

      // 2. Build updated order payload
      const sanitizedOrderPayload = sanitizeData({
        ...existingOrder,
        ...updatedOrderData,
        updatedAt: Date.now(),
        updatedBy: userName
      });
      delete sanitizedOrderPayload.id;

      transaction.update(orderDocRef, sanitizedOrderPayload);

      resultOrder = {
        ...existingOrder,
        ...updatedOrderData,
        id: orderId,
        updatedAt: Date.now(),
        updatedBy: userName
      } as Order;

      // 3. Update Invoice if linked and not voided
      if (invoiceSnap && invoiceSnap.exists() && !invoiceSnap.data().voided) {
        const invRef = doc(db, 'invoices', existingOrder.invoiceId!);
        transaction.update(invRef, sanitizeData({
          customerName: updatedOrderData.customerName || existingOrder.customerName,
          customerPhone: updatedOrderData.customerPhone || existingOrder.customerPhone,
          items: updatedOrderData.items,
          discountAmount: updatedOrderData.discountAmount ?? existingOrder.discountAmount ?? 0,
          shippingCharge: updatedOrderData.shippingCharge ?? existingOrder.shippingCharge ?? 0,
          totalAmount: updatedOrderData.totalAmount,
          amountPaid: updatedOrderData.amountPaid ?? existingOrder.amountPaid,
          amountDue: updatedOrderData.amountDue,
          paymentStatus: updatedOrderData.paymentStatus,
          courier: updatedOrderData.courier || existingOrder.courier,
          courierTrackingNumber: updatedOrderData.courierTrackingNumber ?? existingOrder.courierTrackingNumber ?? '',
          subBrand: updatedOrderData.subBrand || existingOrder.subBrand,
          updatedAt: Date.now()
        }));
      }
    });

    // Invalidate caches
    dbCache.orders = null;
    dbCache.invoices = null;
    dbCache.products = null;

    return resultOrder!;
  } catch (error: any) {
    handleFirestoreError(error, OperationType.UPDATE, 'orders/' + orderId);
    throw error;
  }
}

// ==========================================
// INVOICE OPERATIONS
// ==========================================

export async function getInvoices(): Promise<Invoice[]> {
  if (dbCache.invoices) return dbCache.invoices;
  try {
    const colRef = collection(db, 'invoices');
    // Fetch all docs without orderBy to avoid excluding documents missing generatedAt field
    const snapshot = await getDocs(colRef);
    const list: Invoice[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      list.push({ 
        id: docSnap.id, 
        invoiceNumber: data.invoiceNumber || `INV-${docSnap.id.substring(0, 8)}`,
        generatedAt: data.generatedAt || data.createdAt || Date.now(),
        voided: data.voided ?? false,
        discountAmount: data.discountAmount || 0,
        shippingCharge: data.shippingCharge || 0,
        totalAmount: data.totalAmount || 0,
        amountPaid: data.amountPaid || 0,
        amountDue: data.amountDue || 0,
        paymentStatus: data.paymentStatus || 'Paid',
        orderId: data.orderId || '',
        customerName: data.customerName || 'Walk-in Customer',
        customerPhone: data.customerPhone || '',
        items: data.items || [],
        ...data 
      } as Invoice);
    });
    // Sort in memory by generatedAt desc
    list.sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0));
    dbCache.invoices = list;
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'invoices');
  }
}

export async function migrateExistingInvoices(): Promise<{ totalMigrated: number }> {
  try {
    const colRef = collection(db, 'invoices');
    const snapshot = await getDocs(colRef);
    let migratedCount = 0;
    const batch = writeBatch(db);

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      const updates: Record<string, any> = {};
      let needsUpdate = false;

      if (data.generatedAt === undefined || data.generatedAt === null) {
        updates.generatedAt = data.createdAt || Date.now();
        needsUpdate = true;
      }
      if (data.voided === undefined || data.voided === null) {
        updates.voided = false;
        needsUpdate = true;
      }
      if (data.discountAmount === undefined) {
        updates.discountAmount = 0;
        needsUpdate = true;
      }
      if (data.shippingCharge === undefined) {
        updates.shippingCharge = 0;
        needsUpdate = true;
      }
      if (!data.invoiceNumber) {
        updates.invoiceNumber = `INV-${docSnap.id.substring(0, 8)}`;
        needsUpdate = true;
      }

      if (needsUpdate) {
        batch.update(doc(db, 'invoices', docSnap.id), updates);
        migratedCount++;
      }
    });

    if (migratedCount > 0) {
      await batch.commit();
      dbCache.invoices = null;
    }
    return { totalMigrated: migratedCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'invoices/migrateInvoices');
  }
}

export async function generateInvoiceForOrder(orderId: string, userId: string): Promise<string> {
  try {
    const orderDocRef = doc(db, 'orders', orderId);
    let invoiceIdResult = '';
    
    await runTransaction(db, async (transaction) => {
      const orderSnap = await transaction.get(orderDocRef);
      if (!orderSnap.exists()) {
        throw new Error('Order not found');
      }
      
      const order = orderSnap.data() as Order;
      if (order.invoiceId) {
        invoiceIdResult = order.invoiceId;
        return; // already has one
      }

      // Fetch customer details if available
      let custIdVal = '';
      if (order.customerId) {
        const custSnap = await transaction.get(doc(db, 'customers', order.customerId));
        if (custSnap.exists()) {
          custIdVal = custSnap.data().customerId || '';
        }
      }
      
      // Fetch prefixes
      const companySettingsRef = doc(db, 'settings', 'company');
      const companySettingsSnap = await transaction.get(companySettingsRef);
      const prefixes = companySettingsSnap.exists() ? companySettingsSnap.data().prefixes : { SAT: 'SAT-INV', GZ: 'GZ-INV', RTX: 'RTX-INV' };
      
      // Fetch counters
      const countersRef = doc(db, 'settings', 'invoiceCounters');
      const countersSnap = await transaction.get(countersRef);
      let satCounter = 0;
      let gzCounter = 0;
      let rtxCounter = 0;
      if (countersSnap.exists()) {
        const cData = countersSnap.data();
        satCounter = cData.satCounter || 0;
        gzCounter = cData.gzCounter || 0;
        rtxCounter = cData.rtxCounter || 0;
      }
      
      let prefix = 'INV';
      let nextNum = 1;
      const sub = order.subBrand || 'SAT';
      if (sub === 'SAT') {
        prefix = prefixes?.SAT || 'SAT-INV';
        satCounter++;
        nextNum = satCounter;
      } else if (sub === 'GZ') {
        prefix = prefixes?.GZ || 'GZ-INV';
        gzCounter++;
        nextNum = gzCounter;
      } else if (sub === 'RTX') {
        prefix = prefixes?.RTX || 'RTX-INV';
        rtxCounter++;
        nextNum = rtxCounter;
      }
      
      // Save counters
      transaction.set(countersRef, {
        satCounter,
        gzCounter,
        rtxCounter
      }, { merge: true });
      
      const invoiceNum = `${prefix}-${String(nextNum).padStart(4, '0')}`;
      const invoiceId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const invoiceDocRef = doc(db, 'invoices', invoiceId);
      
      const invoiceData = {
        id: invoiceId,
        orderId: orderId,
        invoiceNumber: invoiceNum,
        subBrand: order.subBrand,
        subBrandPrefix: prefix,
        customerId: custIdVal,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        items: order.items,
        discountAmount: order.discountAmount || 0,
        shippingCharge: order.shippingCharge || 0,
        totalAmount: order.totalAmount,
        amountPaid: order.amountPaid,
        amountDue: order.amountDue,
        paymentStatus: order.paymentStatus,
        courier: order.courier,
        courierTrackingNumber: order.courierTrackingNumber || '',
        generatedAt: Date.now(),
        generatedBy: userId,
        voided: false
      };
      
      transaction.set(invoiceDocRef, sanitizeData(invoiceData));
      transaction.update(orderDocRef, { invoiceId: invoiceId });
      
      invoiceIdResult = invoiceId;
    });
    
    return invoiceIdResult;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}/generateInvoice`);
  }
}

export async function voidInvoiceRecord(
  invoiceId: string, 
  voidedReason: string, 
  userId: string, 
  userName: string
): Promise<void> {
  try {
    const invoiceRef = doc(db, 'invoices', invoiceId);
    await runTransaction(db, async (transaction) => {
      const invoiceSnap = await transaction.get(invoiceRef);
      if (!invoiceSnap.exists()) {
        throw new Error('Invoice not found');
      }
      
      const invoice = invoiceSnap.data() as Invoice;
      if (invoice.voided) {
        throw new Error('Invoice is already voided');
      }
      
      // Perform reads first
      const orderRef = doc(db, 'orders', invoice.orderId);
      const orderSnap = await transaction.get(orderRef);
      
      // Update invoice
      transaction.update(invoiceRef, {
        voided: true,
        voidedReason,
        voidedBy: userName,
        voidedAt: Date.now()
      });
      
      // Update order - remove the invoiceId link
      if (orderSnap.exists()) {
        transaction.update(orderRef, { invoiceId: '' });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `invoices/${invoiceId}/void`);
  }
}

export async function recordOrderPayment(
  orderId: string,
  amount: number,
  method: string,
  userId: string,
  userName: string
): Promise<void> {
  try {
    const orderRef = doc(db, 'orders', orderId);
    await runTransaction(db, async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        throw new Error('Order not found');
      }
      
      const order = orderSnap.data() as Order;
      
      // Perform all reads first!
      let invoiceSnap = null;
      if (order.invoiceId) {
        const invoiceRef = doc(db, 'invoices', order.invoiceId);
        invoiceSnap = await transaction.get(invoiceRef);
      }
      
      // Now perform all calculations and writes
      const paymentHistory = order.paymentHistory || [];
      const newHistoryEntry = {
        amount,
        method,
        date: Date.now(),
        recordedBy: userName
      };
      
      const updatedHistory = [...paymentHistory, newHistoryEntry];
      const newAmountPaid = (order.amountPaid || 0) + amount;
      const newAmountDue = Math.max(0, order.totalAmount - newAmountPaid);
      
      let newPaymentStatus: PaymentStatus = 'Partial';
      if (newAmountDue <= 0) {
        newPaymentStatus = 'Paid';
      } else if (newAmountPaid === 0) {
        newPaymentStatus = 'Due';
      }
      
      transaction.update(orderRef, {
        paymentHistory: updatedHistory,
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        paymentStatus: newPaymentStatus
      });
      
      // Update active invoice if exists
      if (invoiceSnap && invoiceSnap.exists() && !invoiceSnap.data().voided) {
        const invoiceRef = doc(db, 'invoices', order.invoiceId);
        transaction.update(invoiceRef, {
          amountPaid: newAmountPaid,
          amountDue: newAmountDue,
          paymentStatus: newPaymentStatus
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}/recordPayment`);
  }
}

export async function deleteOrderPayment(
  orderId: string,
  paymentIndex: number
): Promise<Order> {
  try {
    const orderRef = doc(db, 'orders', orderId);
    let updatedOrderResult: Order | null = null;

    await runTransaction(db, async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists()) {
        throw new Error('Order not found');
      }

      const order = orderSnap.data() as Order;

      let invoiceSnap = null;
      if (order.invoiceId) {
        const invoiceRef = doc(db, 'invoices', order.invoiceId);
        invoiceSnap = await transaction.get(invoiceRef);
      }

      const paymentHistory = [...(order.paymentHistory || [])];
      if (paymentIndex < 0 || paymentIndex >= paymentHistory.length) {
        throw new Error('Payment record index out of range');
      }

      // Remove payment record at paymentIndex
      paymentHistory.splice(paymentIndex, 1);

      const newAmountPaid = paymentHistory.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const newAmountDue = Math.max(0, (order.totalAmount || 0) - newAmountPaid);

      let newPaymentStatus: PaymentStatus = 'Due';
      if (newAmountDue <= 0) {
        newPaymentStatus = 'Paid';
      } else if (newAmountPaid > 0) {
        newPaymentStatus = 'Partial';
      } else {
        newPaymentStatus = 'Due';
      }

      const orderUpdates = {
        paymentHistory,
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        paymentStatus: newPaymentStatus
      };

      transaction.update(orderRef, orderUpdates);

      if (invoiceSnap && invoiceSnap.exists() && !invoiceSnap.data().voided) {
        const invoiceRef = doc(db, 'invoices', order.invoiceId);
        transaction.update(invoiceRef, {
          amountPaid: newAmountPaid,
          amountDue: newAmountDue,
          paymentStatus: newPaymentStatus
        });
      }

      updatedOrderResult = {
        ...order,
        id: orderId,
        ...orderUpdates
      };
    });

    // Update local cache
    const cached = localStore.get<Order[]>('orders') || [];
    if (updatedOrderResult) {
      localStore.set('orders', cached.map(o => o.id === orderId ? updatedOrderResult! : o));
    }

    return updatedOrderResult!;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}/deletePayment`);
    throw error;
  }
}

export async function getExpenses(): Promise<Expense[]> {
  if (dbCache.expenses) return dbCache.expenses;
  const cached = localStore.get<Expense[]>('expenses');
  try {
    const colRef = collection(db, 'expenses');
    const q = query(colRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const expenses: Expense[] = [];
    snapshot.forEach(docSnap => {
      expenses.push({ id: docSnap.id, ...docSnap.data() } as Expense);
    });
    dbCache.expenses = expenses;
    localStore.set('expenses', expenses);
    return expenses;
  } catch (error) {
    console.warn('Error fetching expenses, returning cached:', error);
    if (cached) {
      dbCache.expenses = cached;
      return cached;
    }
    return [];
  }
}

export function generateExpenseId(): string {
  const d = new Date();
  const dateStr = d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, '0') +
    d.getDate().toString().padStart(2, '0');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `EXP-${dateStr}-${randomSuffix}`;
}

export async function addExpense(expenseData: Omit<Expense, 'id'>): Promise<string> {
  dbCache.expenses = null;
  const sanitized = sanitizeData({
    ...expenseData,
    expenseId: expenseData.expenseId || generateExpenseId(),
    createdAt: expenseData.createdAt || Date.now()
  });

  try {
    const colRef = collection(db, 'expenses');
    const docRef = await addDoc(colRef, sanitized);
    const cached = localStore.get<Expense[]>('expenses') || [];
    localStore.set('expenses', [{ id: docRef.id, ...sanitized } as Expense, ...cached]);
    return docRef.id;
  } catch (error) {
    console.warn('addExpense remote save failed, stored locally:', error);
    const localId = `local_exp_${Date.now()}`;
    const cached = localStore.get<Expense[]>('expenses') || [];
    localStore.set('expenses', [{ id: localId, ...sanitized } as Expense, ...cached]);
    return localId;
  }
}

export async function updateExpense(id: string, updates: Partial<Expense>): Promise<void> {
  dbCache.expenses = null;
  const sanitized = sanitizeData(updates);
  try {
    const docRef = doc(db, 'expenses', id);
    await updateDoc(docRef, sanitized);
  } catch (error) {
    console.warn('updateExpense remote save failed, updating locally:', error);
  }
  const cached = localStore.get<Expense[]>('expenses') || [];
  const updated = cached.map(e => e.id === id ? { ...e, ...sanitized } : e);
  localStore.set('expenses', updated);
}

export async function deleteExpense(id: string, expenseId?: string): Promise<void> {
  dbCache.expenses = null;
  try {
    const docRef = doc(db, 'expenses', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('deleteExpense remote save failed by doc id, attempting query:', error);
  }

  try {
    const target = expenseId || id;
    if (target) {
      const q = query(collection(db, 'expenses'), where('expenseId', '==', target));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'expenses', d.id));
      }
    }
  } catch (e) {
    console.warn('deleteExpense query cleanup error:', e);
  }

  const cached = localStore.get<Expense[]>('expenses') || [];
  localStore.set('expenses', cached.filter(e => e.id !== id && e.expenseId !== id && (!expenseId || e.expenseId !== expenseId)));
}

// ==========================================
// INCOME OPERATIONS
// ==========================================

export async function getIncomes(): Promise<Income[]> {
  if (dbCache.incomes) return dbCache.incomes;
  const cached = localStore.get<Income[]>('incomes');
  try {
    const colRef = collection(db, 'incomes');
    const q = query(colRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const incomes: Income[] = [];
    snapshot.forEach(docSnap => {
      incomes.push({ id: docSnap.id, ...docSnap.data() } as Income);
    });
    dbCache.incomes = incomes;
    localStore.set('incomes', incomes);
    return incomes;
  } catch (error) {
    console.warn('Error fetching incomes, returning cached:', error);
    if (cached) {
      dbCache.incomes = cached;
      return cached;
    }
    return [];
  }
}

export function generateIncomeId(): string {
  const d = new Date();
  const dateStr = d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, '0') +
    d.getDate().toString().padStart(2, '0');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `INC-${dateStr}-${randomSuffix}`;
}

export async function addIncome(incomeData: Omit<Income, 'id'>): Promise<string> {
  dbCache.incomes = null;
  const incomeId = incomeData.incomeId || generateIncomeId();
  const sanitized = sanitizeData({
    ...incomeData,
    incomeId,
    createdAt: incomeData.createdAt || Date.now()
  });

  try {
    const colRef = collection(db, 'incomes');
    const docRef = await addDoc(colRef, sanitized);
    const cached = localStore.get<Income[]>('incomes') || [];
    localStore.set('incomes', [{ id: docRef.id, ...sanitized } as Income, ...cached]);
    return docRef.id;
  } catch (error) {
    console.warn('addIncome remote save failed, stored locally:', error);
    const localId = `local_inc_${Date.now()}`;
    const cached = localStore.get<Income[]>('incomes') || [];
    localStore.set('incomes', [{ id: localId, ...sanitized } as Income, ...cached]);
    return localId;
  }
}

export async function updateIncome(id: string, updates: Partial<Income>): Promise<void> {
  dbCache.incomes = null;
  const sanitized = sanitizeData(updates);
  try {
    const docRef = doc(db, 'incomes', id);
    await updateDoc(docRef, sanitized);
  } catch (error) {
    console.warn('updateIncome remote update failed, updating locally:', error);
  }
  const cached = localStore.get<Income[]>('incomes') || [];
  const updated = cached.map(i => i.id === id ? { ...i, ...sanitized } : i);
  localStore.set('incomes', updated);
}

export async function deleteIncome(id: string, incomeId?: string): Promise<void> {
  dbCache.incomes = null;
  try {
    const docRef = doc(db, 'incomes', id);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn('deleteIncome remote delete failed by doc id, attempting query:', error);
  }

  try {
    const target = incomeId || id;
    if (target) {
      const q = query(collection(db, 'incomes'), where('incomeId', '==', target));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'incomes', d.id));
      }
    }
  } catch (e) {
    console.warn('deleteIncome query cleanup error:', e);
  }

  const cached = localStore.get<Income[]>('incomes') || [];
  localStore.set('incomes', cached.filter(i => i.id !== id && i.incomeId !== id && (!incomeId || i.incomeId !== incomeId)));
}

// ==========================================
// SUPPLIER OPERATIONS
// ==========================================

export async function getNextSupplierCode(txn?: any): Promise<string> {
  const counterRef = doc(db, 'settings', 'supplierCounter');
  if (txn) {
    const snap = await txn.get(counterRef);
    let currentCount = 0;
    if (snap.exists()) {
      currentCount = snap.data().count || 0;
    }
    const nextCount = currentCount + 1;
    txn.set(counterRef, { count: nextCount }, { merge: true });
    return `SUP-${String(nextCount).padStart(4, '0')}`;
  } else {
    let nextNum = 1;
    await runTransaction(db, async (t) => {
      const snap = await t.get(counterRef);
      let currentCount = 0;
      if (snap.exists()) {
        currentCount = snap.data().count || 0;
      }
      nextNum = currentCount + 1;
      t.set(counterRef, { count: nextNum }, { merge: true });
    });
    return `SUP-${String(nextNum).padStart(4, '0')}`;
  }
}

export async function migrateExistingSupplierCodes(): Promise<{ totalMigrated: number; nextCounter: number }> {
  try {
    const colRef = collection(db, 'suppliers');
    const snapshot = await getDocs(colRef);
    const allSuppliers = snapshot.docs.map(d => ({
      docId: d.id,
      data: d.data() as Supplier
    }));

    const missing = allSuppliers.filter(s => !s.data.supplierCode);
    const counterRef = doc(db, 'settings', 'supplierCounter');
    const counterSnap = await getDoc(counterRef);
    let currentCount = counterSnap.exists() ? (counterSnap.data().count || 0) : 0;

    if (missing.length === 0) {
      return { totalMigrated: 0, nextCounter: currentCount };
    }

    missing.sort((a, b) => (a.data.createdAt || 0) - (b.data.createdAt || 0));
    const batch = writeBatch(db);
    let count = currentCount;
    for (const item of missing) {
      count++;
      const generatedCode = `SUP-${String(count).padStart(4, '0')}`;
      const suppRef = doc(db, 'suppliers', item.docId);
      const openingBal = item.data.openingBalance ?? 0;
      const totalPurch = item.data.totalPurchases || 0;
      const totalPd = item.data.totalPaid || 0;
      const currentBal = openingBal + totalPurch - totalPd;
      batch.update(suppRef, { 
        supplierCode: generatedCode,
        status: item.data.status || 'active',
        openingBalance: openingBal,
        currentBalance: currentBal,
        outstandingDue: currentBal
      });
    }
    batch.set(counterRef, { count }, { merge: true });
    await batch.commit();
    dbCache.suppliers = null;
    return { totalMigrated: missing.length, nextCounter: count };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'suppliers/migrateSupplierCodes');
    return { totalMigrated: 0, nextCounter: 0 };
  }
}

export async function getSuppliers(): Promise<Supplier[]> {
  if (dbCache.suppliers) return dbCache.suppliers;
  const cached = localStore.get<Supplier[]>('suppliers');
  try {
    const colRef = collection(db, 'suppliers');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const list: Supplier[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const openingBal = data.openingBalance ?? 0;
      const totalPurch = data.totalPurchases || 0;
      const totalPd = data.totalPaid || 0;
      const currentBal = openingBal + totalPurch - totalPd;
      list.push({ 
        id: docSnap.id, 
        supplierCode: data.supplierCode || `SUP-${docSnap.id.substring(0, 4)}`,
        name: data.name || '',
        companyName: data.companyName || '',
        contactPerson: data.contactPerson || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        supplierType: data.supplierType || 'Distributor',
        productCategory: data.productCategory || '',
        paymentMethod: data.paymentMethod || 'Cash',
        openingBalance: openingBal,
        currentBalance: currentBal,
        creditLimit: data.creditLimit || 0,
        creditDays: data.creditDays || 30,
        bankInfo: data.bankInfo || {},
        status: data.status || 'active',
        notes: data.notes || '',
        logoUrl: data.logoUrl || '',
        documentUrls: data.documentUrls || [],
        subBrand: data.subBrand || '',
        totalPurchases: totalPurch,
        totalPaid: totalPd,
        outstandingDue: currentBal,
        createdAt: data.createdAt || Date.now(),
        createdBy: data.createdBy || ''
      } as Supplier);
    });
    dbCache.suppliers = list;
    localStore.set('suppliers', list);
    return list;
  } catch (error) {
    console.warn('Error fetching suppliers, returning cached:', error);
    if (cached) {
      dbCache.suppliers = cached;
      return cached;
    }
    return [];
  }
}

export async function getActiveSuppliers(): Promise<Supplier[]> {
  const all = await getSuppliers();
  return all.filter(s => s.status !== 'inactive');
}

export async function addSupplier(supplierData: Omit<Supplier, 'id' | 'supplierCode' | 'totalPurchases' | 'totalPaid' | 'outstandingDue' | 'currentBalance' | 'createdAt'>): Promise<string> {
  dbCache.suppliers = null;
  try {
    const supplierCode = await getNextSupplierCode();
    const openingBal = supplierData.openingBalance ?? 0;
    const colRef = collection(db, 'suppliers');
    const payload: Omit<Supplier, 'id'> = {
      ...supplierData,
      supplierCode,
      openingBalance: openingBal,
      currentBalance: openingBal,
      totalPurchases: 0,
      totalPaid: 0,
      outstandingDue: openingBal,
      status: supplierData.status || 'active',
      createdAt: Date.now()
    };
    const sanitized = sanitizeData(payload);
    const docRef = await addDoc(colRef, sanitized);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'suppliers');
    return '';
  }
}

export async function updateSupplier(id: string, updates: Partial<Supplier>): Promise<void> {
  dbCache.suppliers = null;
  try {
    const docRef = doc(db, 'suppliers', id);
    // If openingBalance or totalPurchases or totalPaid changes, recompute currentBalance / outstandingDue
    const currentSnap = await getDoc(docRef);
    let computedUpdates = { ...updates };
    if (currentSnap.exists()) {
      const data = currentSnap.data() as Supplier;
      const openingBal = updates.openingBalance !== undefined ? updates.openingBalance : (data.openingBalance ?? 0);
      const totalPurch = updates.totalPurchases !== undefined ? updates.totalPurchases : (data.totalPurchases || 0);
      const totalPd = updates.totalPaid !== undefined ? updates.totalPaid : (data.totalPaid || 0);
      const currentBal = openingBal + totalPurch - totalPd;
      computedUpdates.currentBalance = currentBal;
      computedUpdates.outstandingDue = currentBal;
    }

    const sanitized = sanitizeData(computedUpdates);
    await updateDoc(docRef, sanitized);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'suppliers/' + id);
  }
}

export async function deleteSupplier(id: string): Promise<void> {
  dbCache.suppliers = null;
  try {
    const docRef = doc(db, 'suppliers', id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'suppliers/' + id);
  }
}

// Supplier Payments
export async function getSupplierPayments(supplierId?: string): Promise<SupplierPayment[]> {
  try {
    const colRef = collection(db, 'supplierPayments');
    let q = query(colRef, orderBy('createdAt', 'desc'));
    if (supplierId) {
      q = query(colRef, where('supplierId', '==', supplierId), orderBy('createdAt', 'desc'));
    }
    const snapshot = await getDocs(q);
    const list: SupplierPayment[] = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() } as SupplierPayment);
    });
    dbCache.invoices = list;
    return list;
  } catch (error) {
    // Fallback if missing index
    try {
      const colRef = collection(db, 'supplierPayments');
      const snapshot = await getDocs(colRef);
      const list: SupplierPayment[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as SupplierPayment);
      });
      const filtered = supplierId ? list.filter(p => p.supplierId === supplierId) : list;
      return filtered.sort((a, b) => b.createdAt - a.createdAt);
    } catch (inner) {
      handleFirestoreError(inner, OperationType.LIST, 'supplierPayments');
      return [];
    }
  }
}

export async function addSupplierPayment(
  paymentData: Omit<SupplierPayment, 'id' | 'createdAt'>
): Promise<string> {
  try {
    const colRef = collection(db, 'supplierPayments');
    const payload: Omit<SupplierPayment, 'id'> = {
      ...paymentData,
      createdAt: Date.now()
    };
    const sanitized = sanitizeData(payload);
    const docRef = await addDoc(colRef, sanitized);

    // Update supplier totalPaid & outstandingDue
    const supplierRef = doc(db, 'suppliers', paymentData.supplierId);
    const supplierSnap = await getDoc(supplierRef);
    if (supplierSnap.exists()) {
      const sData = supplierSnap.data() as Supplier;
      const newTotalPaid = (sData.totalPaid || 0) + paymentData.amount;
      const newDue = (sData.totalPurchases || 0) - newTotalPaid;
      await updateDoc(supplierRef, {
        totalPaid: newTotalPaid,
        outstandingDue: newDue
      });
    }

    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'supplierPayments');
  }
}

export async function recordSupplierPurchase(supplierId: string, purchaseAmount: number): Promise<void> {
  dbCache.suppliers = null;
  try {
    const supplierRef = doc(db, 'suppliers', supplierId);
    const supplierSnap = await getDoc(supplierRef);
    if (supplierSnap.exists()) {
      const sData = supplierSnap.data() as Supplier;
      const newTotalPurchases = (sData.totalPurchases || 0) + purchaseAmount;
      const newDue = newTotalPurchases - (sData.totalPaid || 0);
      await updateDoc(supplierRef, {
        totalPurchases: newTotalPurchases,
        outstandingDue: newDue
      });
    }
  } catch (err) {
    console.error('Failed to update supplier purchase stats:', err);
  }
}

// ==========================================
// NOTIFICATIONS OPERATIONS
// ==========================================

export async function getNotifications(): Promise<AppNotification[]> {
  try {
    const colRef = collection(db, 'notifications');
    const q = query(colRef, orderBy('createdAt', 'desc'), limit(50));
    const snapshot = await getDocs(q);
    const list: AppNotification[] = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() } as AppNotification);
    });
    dbCache.invoices = list;
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'notifications');
    return [];
  }
}

export async function addNotification(
  notifData: Omit<AppNotification, 'id' | 'createdAt' | 'read'>
): Promise<string> {
  try {
    const colRef = collection(db, 'notifications');
    const payload: Omit<AppNotification, 'id'> = {
      ...notifData,
      createdAt: Date.now(),
      read: false
    };
    const sanitized = sanitizeData(payload);
    const docRef = await addDoc(colRef, sanitized);
    return docRef.id;
  } catch (error) {
    console.error('Failed to add notification:', error);
    return '';
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'notifications', id);
    await updateDoc(docRef, { read: true });
  } catch (error) {
    console.error('Failed to mark notification read:', error);
  }
}

export async function dismissNotification(id: string, userId: string): Promise<void> {
  try {
    const docRef = doc(db, 'notifications', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const current = docSnap.data().dismissedBy || [];
      if (!current.includes(userId)) {
        await updateDoc(docRef, { dismissedBy: [...current, userId] });
      }
    }
  } catch (error) {
    console.error('Failed to dismiss notification:', error);
  }
}

export async function markAllNotificationsRead(notifIds: string[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const id of notifIds) {
      batch.update(doc(db, 'notifications', id), { read: true });
    }
    await batch.commit();
  } catch (error) {
    console.error('Failed to mark all notifications read:', error);
  }
}




// ==========================================
// EMPLOYEE ID & BRANCH OPERATIONS
// ==========================================

export async function getNextEmployeeId(txn?: any): Promise<string> {
  const counterRef = doc(db, 'settings', 'employeeCounter');
  if (txn) {
    const snap = await txn.get(counterRef);
    let currentCount = 0;
    if (snap.exists()) {
      currentCount = snap.data().count || 0;
    }
    const nextCount = currentCount + 1;
    txn.set(counterRef, { count: nextCount }, { merge: true });
    return `EMP-${String(nextCount).padStart(4, '0')}`;
  } else {
    let nextNum = 1;
    await runTransaction(db, async (t) => {
      const snap = await t.get(counterRef);
      let currentCount = 0;
      if (snap.exists()) {
        currentCount = snap.data().count || 0;
      }
      nextNum = currentCount + 1;
      t.set(counterRef, { count: nextNum }, { merge: true });
    });
    return `EMP-${String(nextNum).padStart(4, '0')}`;
  }
}

export async function getBranches(): Promise<Branch[]> {
  if (dbCache.branches) return dbCache.branches;
  try {
    const colRef = collection(db, 'branches');
    const snapshot = await getDocs(colRef);
    const list: Branch[] = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() } as Branch);
    });
    // Default if empty
    if (list.length === 0) {
      list.push(
        { id: 'b1', name: 'Head Office - Dhaka', address: 'Gulshan, Dhaka', active: true },
        { id: 'b2', name: 'Warehouse - Mirpur', address: 'Mirpur 10, Dhaka', active: true },
        { id: 'b3', name: 'Branch - Chattogram', address: 'Agrabad, Chattogram', active: true }
      );
    }
    dbCache.branches = list;
    return list;
  } catch (error) {
    console.error('Failed to get branches:', error);
    return [
      { id: 'b1', name: 'Head Office - Dhaka', address: 'Gulshan, Dhaka', active: true },
      { id: 'b2', name: 'Warehouse - Mirpur', address: 'Mirpur 10, Dhaka', active: true },
      { id: 'b3', name: 'Branch - Chattogram', address: 'Agrabad, Chattogram', active: true }
    ];
  }
}

export async function addBranch(branchData: Omit<Branch, 'id'>): Promise<string> {
  dbCache.branches = null;
  try {
    const colRef = collection(db, 'branches');
    const sanitized = sanitizeData(branchData);
    const docRef = await addDoc(colRef, sanitized);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'branches');
    return '';
  }
}

export async function updateBranch(id: string, updates: Partial<Branch>): Promise<void> {
  dbCache.branches = null;
  try {
    const docRef = doc(db, 'branches', id);
    const sanitized = sanitizeData(updates);
    await updateDoc(docRef, sanitized);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'branches/' + id);
  }
}

export async function deleteBranch(id: string): Promise<void> {
  dbCache.branches = null;
  try {
    const docRef = doc(db, 'branches', id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'branches/' + id);
  }
}

export async function exportAllData(): Promise<any> {
  const collections = ['products', 'orders', 'invoices', 'customers', 'suppliers', 'stockLogs', 'expenses', 'categories', 'brands', 'users', 'attendance'];
  const exportData: Record<string, any[]> = {};
  
  for (const col of collections) {
    try {
      const colRef = collection(db, col);
      const snap = await getDocs(colRef);
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      exportData[col] = list;
    } catch (error: any) {
      console.error(`Error exporting collection "${col}":`, error);
      throw new Error(`Failed to export collection "${col}": ${error.message}`);
    }
  }
  
  return exportData;
}

export async function logAuditAction(
  action: AuditLog['action'],
  targetType: AuditLog['targetType'],
  targetId: string,
  targetName: string,
  details: string,
  user: UserProfile | null
): Promise<void> {
  try {
    const colRef = collection(db, 'auditLogs');
    const logEntry: Omit<AuditLog, 'id'> = {
      action,
      targetType,
      targetId,
      targetName,
      details,
      userId: user?.id || 'system',
      userName: user?.name || 'System / Guest',
      userRole: user?.role || 'system',
      timestamp: Date.now()
    };
    await addDoc(colRef, sanitizeData(logEntry));
  } catch (error) {
    console.error('Failed to log audit action:', error);
  }
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  try {
    const colRef = collection(db, 'auditLogs');
    const q = query(colRef, orderBy('timestamp', 'desc'), limit(100));
    const snapshot = await getDocs(q);
    const logs: AuditLog[] = [];
    snapshot.forEach(docSnap => {
      logs.push({ id: docSnap.id, ...docSnap.data() } as AuditLog);
    });
    return logs;
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return [];
  }
}

