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
  StockLogType,
  OrderStatus,
  Invoice,
  PaymentStatus,
  ProductColor,
  ProductModel,
  Expense,
  Supplier,
  SupplierPayment,
  AppNotification
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
  
  const lowerMsg = errMessage.toLowerCase();
  const isQuota = 
    lowerMsg.includes('quota limit exceeded') ||
    lowerMsg.includes('quota exceeded') ||
    lowerMsg.includes('free daily read units') ||
    lowerMsg.includes('resource-exhausted') ||
    lowerMsg.includes('resource_exhausted') ||
    lowerMsg.includes('over_quota') ||
    lowerMsg.includes('quota_exceeded');

  if (isQuota) {
    console.warn('Firestore Quota Intercepted: ', JSON.stringify(errInfo));
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
  console.log("AUTH UID:", JSON.stringify(trimmedUid));
  console.log("AUTH UID LENGTH:", trimmedUid.length);
  console.log("AUTH UID CHAR CODES:", [...trimmedUid].map(c => c.charCodeAt(0)).join(','));
  console.log("QUERYING PATH: users/" + trimmedUid);
  
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      const docRef = doc(db, 'users', trimmedUid);
      const docSnap = await getDoc(docRef);
      console.log("QUERY RESULT:", JSON.stringify(docSnap.exists() ? docSnap.data() : "NO DOCUMENT FOUND"));
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('getUserProfile: Found profile for UID:', trimmedUid);
        return { id: docSnap.id, ...(data as any) } as UserProfile;
      }
      
      console.warn('getUserProfile: No document found at path:', docRef.path);
      return null;
    } catch (error: any) {
      attempts++;
      console.warn(`getUserProfile attempt ${attempts} failed:`, error);
      if (attempts >= maxAttempts) {
        if (error.code === 'unavailable' || (error.message && error.message.toLowerCase().includes('offline'))) {
          console.warn('User profile fetch failed: client offline.');
          return null;
        }
        handleFirestoreError(error, OperationType.GET, 'users/' + userId);
      }
      // Wait before retrying to allow token sync
      await new Promise(resolve => setTimeout(resolve, 150 * attempts));
    }
  }
  return null;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  if (dbCache.users) return dbCache.users;
  console.log('getAllUsers: Fetching from "users" in database:', (db as any)._databaseId?.database || 'default');
  try {
    const colRef = collection(db, 'users');
    const querySnapshot = await getDocs(colRef);
    const users: UserProfile[] = [];
    console.log(`getAllUsers: Successfully fetched ${querySnapshot.size} user documents.`);
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`getAllUsers: User [${doc.id}]:`, data);
      users.push({ id: doc.id, ...(data as any) } as UserProfile);
    });
    dbCache.users = users;
    return users;
  } catch (error) {
    console.error('getAllUsers: FAILED:', error);
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function findUserProfileByEmail(email: string): Promise<UserProfile | null> {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      const colRef = collection(db, 'users');
      const q = query(colRef, where('email', '==', email.toLowerCase().trim()));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        return { id: docSnap.id, ...(docSnap.data() as any) } as UserProfile;
      }
      return null;
    } catch (error: any) {
      attempts++;
      console.warn(`findUserProfileByEmail attempt ${attempts} failed:`, error);
      if (attempts >= maxAttempts) {
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
      await new Promise(resolve => setTimeout(resolve, 150 * attempts));
    }
  }
  return null;
}

export async function deleteUserProfile(userId: string): Promise<void> {
  dbCache.users = null;
    dbCache.suppliers = null;
    dbCache.expenses = null;
  try {
    const docRef = doc(db, 'users', userId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'users/' + userId);
  }
}

export async function createUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  dbCache.users = null;
    dbCache.suppliers = null;
    dbCache.expenses = null;
  console.log('createUserProfile: STARTING write for UID:', userId, 'Data:', data);
  try {
    const docRef = doc(db, 'users', userId);
    const sanitizedData = sanitizeData(data);
    
    const finalData = {
      ...sanitizedData,
      active: sanitizedData.active !== undefined ? sanitizedData.active : true,
      subBrandAccess: sanitizedData.subBrandAccess || ['SAT', 'GZ', 'RTX'],
      createdAt: sanitizedData.createdAt || Date.now()
    };
    
    console.log('createUserProfile: Executing setDoc with merged data:', finalData);
    await setDoc(docRef, finalData, { merge: true });
    console.log('createUserProfile: SUCCESS for UID:', userId);
  } catch (error: any) {
    console.error('createUserProfile: FAILED for UID:', userId, 'Error:', error);
    handleFirestoreError(error, OperationType.CREATE, 'users/' + userId);
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
  const maxAttempts = 3;
  while (attempts < maxAttempts) {
    try {
      const q = query(usersCol, limit(1));
      const usersSnapshot = await getDocs(q);
      isFirstUser = usersSnapshot.empty;
      break;
    } catch (err: any) {
      attempts++;
      console.warn(`initializeUser: Failed checking first user (attempt ${attempts}):`, err);
      if (attempts >= maxAttempts) {
        console.warn("initializeUser: Defaulting isFirstUser to false due to persistent error.");
        isFirstUser = false;
      } else {
        await new Promise(resolve => setTimeout(resolve, 150 * attempts));
      }
    }
  }

  const docRef = doc(db, 'users', userId);
  const profile: UserProfile = {
    ...sanitizedData,
    id: userId,
    role: isFirstUser ? 'superadmin' : null as any,
    subBrandAccess: isFirstUser ? ['SAT', 'GZ', 'RTX'] : (sanitizedData.subBrandAccess || []),
    status: isFirstUser ? 'approved' : (sanitizedData.status || 'pending_approval'),
    active: isFirstUser ? true : (sanitizedData.active ?? false),
    createdAt: Date.now()
  } as UserProfile;
  
  try {
    await setDoc(docRef, profile);
    console.log("initializeUser: Successfully created user profile for UID:", userId);
    return isFirstUser;
  } catch (error: any) {
    console.error("initializeUser: Failed to setDoc profile for UID:", userId, error);
    handleFirestoreError(error, OperationType.CREATE, 'users/' + userId);
    return isFirstUser;
  }
}

export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
  dbCache.users = null;
    dbCache.suppliers = null;
    dbCache.expenses = null;
  console.log('updateUserProfile called for:', userId, 'with data:', data);
  const docRef = doc(db, 'users', userId);
  try {
    const sanitizedData = sanitizeData(data);
    console.log('updateUserProfile executing updateDoc with sanitized data:', sanitizedData);
    await updateDoc(docRef, sanitizedData as any);
    console.log('updateUserProfile updateDoc success.');
  } catch (error) {
    console.error('updateUserProfile failed:', error);
    handleFirestoreError(error, OperationType.UPDATE, 'users/' + userId);
  }
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
  console.log('getCompanySettings called.');
  try {
    const docRef = doc(db, 'settings', 'company');
    console.log('getCompanySettings executing getDoc for settings/company');
    const docSnap = await getDoc(docRef);
    console.log('getCompanySettings getDoc success, exists:', docSnap.exists());
    if (docSnap.exists()) {
      return docSnap.data() as CompanySettings;
    }
    return null;
  } catch (error) {
    console.error('Error fetching company settings:', error);
    return null;
  }
}

export async function saveCompanySettings(settings: CompanySettings): Promise<void> {
  console.log('saveCompanySettings called with:', settings);
  const docRef = doc(db, 'settings', 'company');
  const cleanSettings = sanitizeData(settings);
  
  const operation = async () => {
    try {
      console.log('saveCompanySettings executing setDoc...');
      await setDoc(docRef, cleanSettings, { merge: true });
      console.log('saveCompanySettings setDoc success.');
    } catch (error) {
      console.error('saveCompanySettings failed:', error);
      handleFirestoreError(error, OperationType.WRITE, 'settings/company');
    }
  };

  const timeout = new Promise<void>((_, reject) => 
    setTimeout(() => reject(new Error('Firestore operation timed out')), 30000)
  );

  return Promise.race([operation(), timeout]);
}

// ==========================================
// CATEGORY CRUD
// ==========================================

export async function getCategories(): Promise<Category[]> {
  try {
    const colRef = collection(db, 'categories');
    const querySnapshot = await getDocs(colRef);
    const categories: Category[] = [];
    querySnapshot.forEach((doc) => {
      categories.push({ id: doc.id, ...(doc.data() as any) } as Category);
    });
    return categories;
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
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
  try {
    const colRef = collection(db, 'brands');
    const querySnapshot = await getDocs(colRef);
    const brands: Brand[] = [];
    querySnapshot.forEach((doc) => {
      brands.push({ id: doc.id, ...(doc.data() as any) } as Brand);
    });
    return brands;
  } catch (error) {
    console.error('Error fetching brands:', error);
    return [];
  }
}

export async function addBrand(name: string): Promise<Brand> {
  try {
    const colRef = collection(db, 'brands');
    const docRef = await addDoc(colRef, { name });
    return { id: docRef.id, name };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'brands');
  }
}

export async function updateBrand(id: string, name: string): Promise<void> {
  try {
    const docRef = doc(db, 'brands', id);
    await updateDoc(docRef, { name });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'brands/' + id);
  }
}

export async function deleteBrand(id: string): Promise<void> {
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
  try {
    const colRef = collection(db, 'productColors');
    const querySnapshot = await getDocs(colRef);
    const colors: ProductColor[] = [];
    querySnapshot.forEach((doc) => {
      colors.push({ id: doc.id, ...(doc.data() as any) } as ProductColor);
    });
    return colors;
  } catch (error) {
    console.error('Error fetching colors:', error);
    return [];
  }
}

export async function addProductColor(name: string, hexCode?: string): Promise<ProductColor> {
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
  try {
    const colRef = collection(db, 'productModels');
    const querySnapshot = await getDocs(colRef);
    const models: ProductModel[] = [];
    querySnapshot.forEach((doc) => {
      models.push({ id: doc.id, ...(doc.data() as any) } as ProductModel);
    });
    return models;
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
}

export async function addProductModel(name: string): Promise<ProductModel> {
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
  dbCache.products = null; dbCache.productsArchived = null;
  try {
    const docRef = doc(db, 'productModels', id);
    await updateDoc(docRef, { name });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'productModels/' + id);
  }
}

export async function deleteProductModel(id: string): Promise<void> {
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
    
    return products;
  } catch (error) {
    console.error('Error fetching products:', error);
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
  const collections = ['categories', 'brands', 'products', 'stockLogs'];
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
  console.log('Finished clearing sample data.');
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
  try {
    const colRef = collection(db, 'customers');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const list: Customer[] = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() } as Customer);
    });
    dbCache.customers = list;
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'customers');
  }
}

export async function addCustomer(customerData: Omit<Customer, 'id'>): Promise<string> {
  dbCache.customers = null;
  try {
    const colRef = collection(db, 'customers');
    let cid = customerData.customerId;
    if (!cid) {
      cid = await getNextCustomerId();
    }
    const payload = {
      ...customerData,
      customerId: cid
    };
    const sanitized = sanitizeData(payload);
    const docRef = await addDoc(colRef, sanitized);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'customers');
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
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'orders');
  }
}

export async function addOrder(orderData: Omit<Order, 'id'>): Promise<string> {
  try {
    const colRef = collection(db, 'orders');
    const sanitized = sanitizeData(orderData);
    const docRef = await addDoc(colRef, sanitized);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'orders');
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

// ==========================================
// INVOICE OPERATIONS
// ==========================================

export async function getInvoices(): Promise<Invoice[]> {
  if (dbCache.invoices) return dbCache.invoices;
  try {
    const colRef = collection(db, 'invoices');
    const q = query(colRef, orderBy('generatedAt', 'desc'));
    const snapshot = await getDocs(q);
    const list: Invoice[] = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() } as Invoice);
    });
    dbCache.invoices = list;
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'invoices');
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

export async function getExpenses(): Promise<Expense[]> {
  if (dbCache.expenses) return dbCache.expenses;
  try {
    const colRef = collection(db, 'expenses');
    const q = query(colRef, orderBy('date', 'desc'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const expenses: Expense[] = [];
    snapshot.forEach(docSnap => {
      expenses.push({ id: docSnap.id, ...docSnap.data() } as Expense);
    });
    dbCache.expenses = expenses;
    return expenses;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'expenses');
    return [];
  }
}

export async function addExpense(expenseData: Omit<Expense, 'id'>): Promise<string> {
  dbCache.expenses = null;
  try {
    const colRef = collection(db, 'expenses');
    const sanitized = sanitizeData(expenseData);
    const docRef = await addDoc(colRef, sanitized);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'expenses');
  }
}

export async function updateExpense(id: string, updates: Partial<Expense>): Promise<void> {
  dbCache.expenses = null;
  try {
    const docRef = doc(db, 'expenses', id);
    const sanitized = sanitizeData(updates);
    await updateDoc(docRef, sanitized);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'expenses/' + id);
  }
}

export async function deleteExpense(id: string): Promise<void> {
  dbCache.expenses = null;
  try {
    const docRef = doc(db, 'expenses', id);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'expenses/' + id);
  }
}

// ==========================================
// SUPPLIER OPERATIONS
// ==========================================

export async function getSuppliers(): Promise<Supplier[]> {
  if (dbCache.suppliers) return dbCache.suppliers;
  try {
    const colRef = collection(db, 'suppliers');
    const q = query(colRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const list: Supplier[] = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() } as Supplier);
    });
    dbCache.invoices = list;
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'suppliers');
    return [];
  }
}

export async function addSupplier(supplierData: Omit<Supplier, 'id' | 'totalPurchases' | 'totalPaid' | 'outstandingDue' | 'createdAt'>): Promise<string> {
  dbCache.suppliers = null;
  try {
    const colRef = collection(db, 'suppliers');
    const payload: Omit<Supplier, 'id'> = {
      ...supplierData,
      totalPurchases: 0,
      totalPaid: 0,
      outstandingDue: 0,
      createdAt: Date.now()
    };
    const sanitized = sanitizeData(payload);
    const docRef = await addDoc(colRef, sanitized);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'suppliers');
  }
}

export async function updateSupplier(id: string, updates: Partial<Supplier>): Promise<void> {
  dbCache.suppliers = null;
  try {
    const docRef = doc(db, 'suppliers', id);
    const sanitized = sanitizeData(updates);
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

// --- Data Caching Layer ---
export const dbCache = {
  products: null as any[] | null,
  productsArchived: null as any[] | null,
  orders: null as any[] | null,
  customers: null as any[] | null,
  invoices: null as any[] | null,
  users: null as any[] | null,
  suppliers: null as any[] | null,
  expenses: null as any[] | null,
  clearAll: () => {
    dbCache.products = null;
    dbCache.productsArchived = null;
    dbCache.customers = null;
    dbCache.users = null;
    dbCache.suppliers = null;
    dbCache.expenses = null;
  }
};
