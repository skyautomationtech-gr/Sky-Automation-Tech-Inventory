#!/bin/bash
sed -i -e '/dbCache.invoices = null;/d' src/firebase/db.ts
