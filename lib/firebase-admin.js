import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getConfig } from "./bundled-config.js";

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

  const projectId = getConfig("FIREBASE_PROJECT_ID") || getConfig("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!projectId) return null;

  try {
    const clientEmail = getConfig("FIREBASE_CLIENT_EMAIL");
    const rawPrivateKey = getConfig("FIREBASE_PRIVATE_KEY");
    const hasServiceAccount = Boolean(clientEmail && rawPrivateKey);

    return initializeApp(
      {
        projectId,
        credential: hasServiceAccount
          ? cert({
              projectId,
              clientEmail: clientEmail.trim(),
              privateKey: formatPrivateKey(rawPrivateKey),
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
  return Boolean(
    getConfig("FIREBASE_PROJECT_ID") &&
    getConfig("FIREBASE_CLIENT_EMAIL") &&
    getConfig("FIREBASE_PRIVATE_KEY")
  );
}
