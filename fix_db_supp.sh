#!/bin/bash
sed -i -e '/dbCache.users = null;/a\
    dbCache.suppliers = null;' src/firebase/db.ts
sed -i -e '/users: null as any\[\] | null,/a\
  suppliers: null as any[] | null,' src/firebase/db.ts
sed -i -e '/export async function getSuppliers(): Promise<Supplier\[\]> {/a\
  if (dbCache.suppliers) return dbCache.suppliers;' src/firebase/db.ts
sed -i -e '/return suppliers;/i\
    dbCache.suppliers = suppliers;' src/firebase/db.ts
sed -i -e '/export async function addSupplier(/a\
  dbCache.suppliers = null;' src/firebase/db.ts
sed -i -e '/export async function updateSupplier(/a\
  dbCache.suppliers = null;' src/firebase/db.ts
sed -i -e '/export async function deleteSupplier(/a\
  dbCache.suppliers = null;' src/firebase/db.ts
sed -i -e '/export async function recordSupplierPurchase(/a\
  dbCache.suppliers = null;' src/firebase/db.ts
