import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin
// We use the project ID from config. In AI Studio, this often works if 
// the environment has ambient credentials or if we provide the project ID.
try {
  initializeApp({
    projectId: "gen-lang-client-0634961568"
  });
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.error("Firebase Admin initialization failed:", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Middleware: Check Super Admin Role
  const checkSuperAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
      
      const db = getFirestore();
      const userDoc = await db.collection('users').doc(uid).get();
      const profile = userDoc.data();

      if (!profile || profile.role !== 'superadmin') {
        return res.status(403).json({ error: "Forbidden: Super Admin access required" });
      }

      next();
    } catch (error) {
      console.error("Auth Middleware Error:", error);
      res.status(401).json({ error: "Unauthorized: Invalid token" });
    }
  };

  // API Route: Repair User
  app.post("/api/admin/repair-user", checkSuperAdmin, async (req, res) => {
    const { email } = req.body;

    try {
      console.log(`Server: Repairing user account for ${email}...`);
      
      // 1. Get real UID from Auth
      const auth = getAuth();
      const userRecord = await auth.getUserByEmail(email.toLowerCase().trim());
      const realUid = userRecord.uid;
      console.log(`Server: Real Auth UID for ${email} is ${realUid}`);

      // 2. Access Firestore via Admin
      const db = getFirestore();
      const usersCol = db.collection('users');
      
      // 3. Search for existing profiles by email
      const snapshot = await usersCol.where('email', '==', email.toLowerCase().trim()).get();
      
      let profileData: any = null;
      let oldDocId: string | null = null;

      if (!snapshot.empty) {
        // Found at least one profile
        const doc = snapshot.docs[0];
        oldDocId = doc.id;
        profileData = doc.data();
        console.log(`Server: Found profile for ${email} at doc ID ${oldDocId}`);
      }

      if (oldDocId === realUid) {
        return res.json({ 
          status: "ok", 
          message: `Account is already correct. UID [${realUid}] matches Firestore ID.`,
          uid: realUid
        });
      }

      // 4. Migrate if mismatched
      if (profileData) {
        console.log(`Server: Migrating profile from ${oldDocId} to ${realUid}...`);
        await usersCol.doc(realUid).set({
          ...profileData,
          id: realUid,
          onboardingCompleted: true
        });
        
        if (oldDocId) {
          await usersCol.doc(oldDocId).delete();
        }

        return res.json({ 
          status: "repaired", 
          message: `Account successfully migrated from ${oldDocId} to ${realUid}.`,
          uid: realUid
        });
      } else {
        // No profile found at all, create one
        console.log(`Server: No profile found for ${email}. Creating fresh record at ${realUid}...`);
        const newProfile = {
          id: realUid,
          email: email.toLowerCase().trim(),
          name: email.split('@')[0].toUpperCase(),
          role: "admin",
          active: true,
          subBrandAccess: ["RTX"],
          createdAt: Date.now(),
          onboardingCompleted: true
        };
        await usersCol.doc(realUid).set(newProfile);
        
        return res.json({ 
          status: "created", 
          message: `Fresh profile created for ${email} at UID ${realUid}.`,
          uid: realUid
        });
      }

    } catch (error: any) {
      console.error("Server: Repair failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Bulk Repair
  app.post("/api/admin/bulk-repair", checkSuperAdmin, async (req, res) => {
    try {
      console.log("Server: Starting bulk repair scan...");
      const db = getFirestore();
      const auth = getAuth();
      const usersCol = db.collection('users');
      
      // Get all Firestore users
      const snapshot = await usersCol.get();
      const results = {
        scanned: snapshot.size,
        repaired: 0,
        failed: 0,
        logs: [] as string[]
      };

      for (const doc of snapshot.docs) {
        const profile = doc.data();
        const email = profile.email;
        const currentId = doc.id;

        if (!email) continue;

        try {
          // Check Auth
          const userRecord = await auth.getUserByEmail(email.toLowerCase().trim());
          const realUid = userRecord.uid;

          if (realUid !== currentId) {
            console.log(`Server: Mismatch detected for ${email}. Firestore: ${currentId}, Auth: ${realUid}`);
            
            // Migrate
            await usersCol.doc(realUid).set({
              ...profile,
              id: realUid,
              onboardingCompleted: true
            });
            await usersCol.doc(currentId).delete();
            
            results.repaired++;
            results.logs.push(`Migrated ${email}: ${currentId} -> ${realUid}`);
          }
        } catch (authErr: any) {
          if (authErr.code === 'auth/user-not-found') {
            // Profile exists but no Auth user? Mark as orphaned but don't delete automatically
            results.logs.push(`Orphaned Profile ${email}: No Auth user found.`);
          } else {
            console.error(`Server: Error checking ${email}:`, authErr.message);
            results.failed++;
          }
        }
      }

      res.json(results);
    } catch (error: any) {
      console.error("Server: Bulk repair failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
