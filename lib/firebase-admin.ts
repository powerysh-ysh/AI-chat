import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function firstJsonObject(value: string) {
  const text = value.trim().replace(/^\uFEFF/, "");

  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  } catch {
    // Vercel 값 뒤에 파일명이나 설명이 함께 붙은 경우 첫 JSON 객체만 찾습니다.
  }

  const start = text.indexOf("{");
  if (start < 0) throw new Error("Firebase 서비스 계정 JSON이 없습니다.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error("Firebase 서비스 계정 JSON의 끝을 찾지 못했습니다.");
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 필요합니다.");
  const serviceAccount = firstJsonObject(raw);
  if (!serviceAccount?.project_id || !serviceAccount?.private_key || !serviceAccount?.client_email) {
    throw new Error("Firebase 서비스 계정 키의 필수 항목이 없습니다.");
  }
  return initializeApp({ credential: cert(serviceAccount) });
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
