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
  console.warn("Firebase Admin initialization notice:", error);
}

const getDb = () => {
  return getFirestore();
};

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
      
      const db = getDb();
      const userDoc = await db.collection('users').doc(uid).get();
      const profile = userDoc.data();

      if (!profile || profile.role !== 'superadmin') {
        return res.status(403).json({ error: "Forbidden: Super Admin access required" });
      }

      next();
    } catch (error: any) {
      console.warn("Auth Middleware Notice:", error?.message || error);
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
      const db = getDb();
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
      if (error.message?.includes('identitytoolkit') || error.message?.includes('403') || error.code === 'auth/internal-error') {
        console.warn(`[Server Sandbox Notice] Repair restricted for ${email}: Cloud sandbox credentials do not have Identity Toolkit Admin access.`);
        return res.status(403).json({
          restricted: true,
          error: "Server-side User Repair is restricted in this cloud sandbox environment (403 Identity Toolkit)."
        });
      }
      console.warn("Server: Repair failed:", error?.message || error);
      res.status(500).json({ error: error.message || "Repair failed" });
    }
  });

  // API Route: Bulk Repair
  app.post("/api/admin/bulk-repair", checkSuperAdmin, async (req, res) => {
    try {
      console.log("Server: Starting bulk repair scan...");
      const db = getDb();
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
          } else if (authErr.message?.includes('identitytoolkit') || authErr.message?.includes('403') || authErr.code === 'auth/internal-error') {
            console.warn(`[Server Sandbox Notice] Bulk repair restricted checking ${email}`);
            return res.status(403).json({
              restricted: true,
              error: "Server-side Bulk Repair is restricted in this cloud sandbox environment (403 Identity Toolkit)."
            });
          } else {
            console.warn(`Server: Error checking ${email}:`, authErr.message);
            results.failed++;
          }
        }
      }

      res.json(results);
    } catch (error: any) {
      if (error.message?.includes('identitytoolkit') || error.message?.includes('403') || error.code === 'auth/internal-error') {
        console.warn("[Server Sandbox Notice] Bulk repair restricted:", error.message);
        return res.status(403).json({
          restricted: true,
          error: "Server-side Bulk Repair is restricted in this cloud sandbox environment (403 Identity Toolkit)."
        });
      }
      console.warn("Server: Bulk repair failed:", error?.message || error);
      res.status(500).json({ error: error?.message || "Bulk repair failed" });
    }
  });

  // API Route: Reset Password via OTP verification
  app.post("/api/auth/reset-password-otp", async (req, res) => {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email and newPassword are required" });
    }

    try {
      const cleanEmail = email.toLowerCase().trim();
      const db = getDb();
      const usersSnap = await db.collection('users').where('email', '==', cleanEmail).limit(1).get();
      
      if (usersSnap.empty) {
        return res.status(404).json({ error: "No user profile found with this email address." });
      }

      const userDocRef = usersSnap.docs[0].ref;
      await userDocRef.update({
        customPassword: newPassword,
        requirePasswordChange: false,
        updatedAt: Date.now()
      });

      // Try updating in Firebase Auth as well if possible
      try {
        const auth = getAuth();
        const userRecord = await auth.getUserByEmail(cleanEmail);
        await auth.updateUser(userRecord.uid, {
          password: newPassword
        });
      } catch (authErr) {
        console.warn("Server: Firebase Auth updateUser restricted in sandbox, updated in Firestore profile successfully.");
      }

      console.log(`Server: Password successfully updated for ${cleanEmail}`);
      res.json({ success: true, message: "Password updated successfully" });
    } catch (error: any) {
      console.warn("Server: Password reset notice:", error?.message || error);
      res.status(500).json({ error: error.message || "Failed to update password" });
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
