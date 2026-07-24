#!/bin/bash
sed -i -e '/match \/customers/i\
      allow delete: if isSuperAdmin();\
    }' firestore.rules
