import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function formatPrivateKey(key) {
  if (!key) return "";
  let clean = key.trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1);
  }
  return clean.replace(/\\n/g, "\n").replace(/\r/g, "");
}

function getAdminApp() {
  const existing = getApps().find((app) => app.name === "diablo-server");
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  try {
    const hasServiceAccount = Boolean(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
    return initializeApp(
      {
        projectId,
        credential: hasServiceAccount
          ? cert({
              projectId,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
              privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
            })
          : applicationDefault(),
      },
      "diablo-server"
    );
  } catch (err) {
    console.error("[Firebase Admin] Initialization error:", err.message);
    return null;
  }
}

export function getDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app);
}

export function isFirebaseConfigured() {
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}
