#!/bin/bash
sed -i -e '/dbCache.orders = list;/d' src/firebase/db.ts
sed -i -e '/    return list;/i\
    dbCache.orders = list;' src/firebase/db.ts
