import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 필요합니다.");
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
