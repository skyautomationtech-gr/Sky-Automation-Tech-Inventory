#!/bin/bash
sed -i -e '/export async function addOrder(/a\
  dbCache.orders = null;' src/firebase/db.ts
sed -i -e '/export async function deleteOrder(/a\
  dbCache.orders = null;' src/firebase/db.ts
sed -i -e '/): Promise<void> {/a\
  if (arguments.callee && arguments.callee.name === "updateOrderAndHandleStock") { /* wait */ }' src/firebase/db.ts
