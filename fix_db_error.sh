#!/bin/bash
sed -i -e '/dbCache.orders = null;/d' src/firebase/db.ts
