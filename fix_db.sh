#!/bin/bash
sed -i -e '/export async function addOrder/a\
  dbCache.orders = null;' src/firebase/db.ts
sed -i -e '/export async function deleteOrder/a\
  dbCache.orders = null;' src/firebase/db.ts
sed -i -e '/export async function updateOrderAndHandleStock/a\
  dbCache.orders = null;' src/firebase/db.ts
sed -i -e '/export async function recordOrderPayment/a\
  dbCache.orders = null;\n  dbCache.invoices = null;' src/firebase/db.ts

sed -i -e '/export async function addProduct/a\
  dbCache.products = null; dbCache.productsArchived = null;' src/firebase/db.ts
sed -i -e '/export async function updateProduct/a\
  dbCache.products = null; dbCache.productsArchived = null;' src/firebase/db.ts
sed -i -e '/export async function archiveProduct/a\
  dbCache.products = null; dbCache.productsArchived = null;' src/firebase/db.ts
sed -i -e '/export async function deleteProduct/a\
  dbCache.products = null; dbCache.productsArchived = null;' src/firebase/db.ts
sed -i -e '/export async function syncProductStockStatuses/a\
  dbCache.products = null; dbCache.productsArchived = null;' src/firebase/db.ts

sed -i -e '/export async function addCustomer/a\
  dbCache.customers = null;' src/firebase/db.ts
sed -i -e '/export async function updateCustomer/a\
  dbCache.customers = null;' src/firebase/db.ts

sed -i -e '/export async function generateInvoiceForOrder/a\
  dbCache.invoices = null;' src/firebase/db.ts
sed -i -e '/export async function voidInvoiceRecord/a\
  dbCache.invoices = null;' src/firebase/db.ts
