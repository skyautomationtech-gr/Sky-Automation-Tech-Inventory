#!/bin/bash
sed -i -e '/dbCache.users = null;/a\
    dbCache.expenses = null;' src/firebase/db.ts
sed -i -e '/users: null as any\[\] | null,/a\
  expenses: null as any[] | null,' src/firebase/db.ts
sed -i -e '/export async function getExpenses(): Promise<Expense\[\]> {/a\
  if (dbCache.expenses) return dbCache.expenses;' src/firebase/db.ts
sed -i -e '/return expenses;/i\
    dbCache.expenses = expenses;' src/firebase/db.ts
sed -i -e '/export async function addExpense/a\
  dbCache.expenses = null;' src/firebase/db.ts
sed -i -e '/export async function updateExpense/a\
  dbCache.expenses = null;' src/firebase/db.ts
sed -i -e '/export async function deleteExpense/a\
  dbCache.expenses = null;' src/firebase/db.ts
