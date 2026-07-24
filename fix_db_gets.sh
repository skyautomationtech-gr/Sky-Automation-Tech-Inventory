#!/bin/bash
sed -i -e '/export async function getCustomers(): Promise<Customer\[\]> {/a\
  if (dbCache.customers) return dbCache.customers;' src/firebase/db.ts
sed -i -e '/return customers;/i\
    dbCache.customers = customers;' src/firebase/db.ts

sed -i -e '/export async function getInvoices(): Promise<Invoice\[\]> {/a\
  if (dbCache.invoices) return dbCache.invoices;' src/firebase/db.ts
sed -i -e '/return list;/i\
    dbCache.invoices = list;' src/firebase/db.ts

sed -i -e '/export async function getAllUsers(): Promise<UserProfile\[\]> {/a\
  if (dbCache.users) return dbCache.users;' src/firebase/db.ts
sed -i -e '/return users;/i\
    dbCache.users = users;' src/firebase/db.ts
