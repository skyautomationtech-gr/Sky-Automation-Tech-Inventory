#!/bin/bash
sed -i -e '/export async function createUserProfile/a\
  dbCache.users = null;' src/firebase/db.ts
sed -i -e '/export async function updateUserProfile/a\
  dbCache.users = null;' src/firebase/db.ts
sed -i -e '/export async function deleteUserProfile/a\
  dbCache.users = null;' src/firebase/db.ts
