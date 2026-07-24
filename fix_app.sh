#!/bin/bash
sed -i -e 's/const res = await migrateExistingCustomerIds,.*exportAllData();/const res = await migrateExistingCustomerIds();/' src/App.tsx
