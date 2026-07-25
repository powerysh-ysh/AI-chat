import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { createHash } from "node:crypto";

function teamKey(value?: string) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function cleanPin(value?: string) {
  return (value ?? "").replace(/\D/g, "").slice(0, 4);
}

function pinHash(team: string, pin: string) {
  return createHash("sha256").update(`local-hero:${teamKey(team)}:${pin}`).digest("hex");
}

function dateValue(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : value ?? null;
}

export async function GET(request: Request) {
  const expected = process.env.ADMIN_PIN;
  if (!expected || request.headers.get("x-admin-pin") !== expected) {
    return Response.json({ error: "운영 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  try {
    const snapshot = await getAdminDb().collection("projects").orderBy("updatedAt", "desc").limit(300).get();
    return Response.json({ projects: snapshot.docs.map((doc, index) => {
      const row = doc.data();
      return { id: index + 1, ...row, createdAt: dateValue(row.createdAt), updatedAt: dateValue(row.updatedAt) };
    })});
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "DB 연결 오류" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const expected = process.env.ADMIN_PIN;
  if (!expected || request.headers.get("x-admin-pin") !== expected) {
    return Response.json({ error: "운영 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  try {
    const payload = (await request.json()) as {
      order?: string[];
      displayCodes?: string[];
      isLiveDisplay?: boolean;
      resetPinCode?: string;
      newPin?: string;
    };
    const db = getAdminDb();

    const resetPinCode = typeof payload.resetPinCode === "string" ? payload.resetPinCode.trim() : "";
    if (resetPinCode) {
      const newPin = cleanPin(payload.newPin);
      if (newPin.length !== 4) {
        return Response.json({ error: "새 팀 비밀번호는 숫자 4자리여야 합니다." }, { status: 400 });
      }
      const ref = db.collection("projects").doc(resetPinCode);
      const snapshot = await ref.get();
      if (!snapshot.exists) {
        return Response.json({ error: "비밀번호를 재설정할 팀을 찾을 수 없습니다." }, { status: 404 });
      }
      const team = String(snapshot.data()?.team ?? "").trim();
      if (!team) {
        return Response.json({ error: "팀 이름이 없어 비밀번호를 재설정할 수 없습니다." }, { status: 409 });
      }
      await ref.set({
        pinHash: pinHash(team, newPin),
        failedPinAttempts: 0,
        pinLockedUntil: null,
        updatedAt: Timestamp.now(),
      }, { merge: true });
      return Response.json({ ok: true, team });
    }

    const displayCodes = Array.isArray(payload.displayCodes)
      ? [...new Set(payload.displayCodes.filter(code => typeof code === "string").map(code => code.trim()).filter(Boolean))].slice(0, 300)
      : [];

    if (displayCodes.length > 0) {
      const batch = db.batch();
      displayCodes.forEach(code => {
        batch.set(db.collection("projects").doc(code), { isLiveDisplay: payload.isLiveDisplay === true }, { merge: true });
      });
      await batch.commit();
      return Response.json({ ok: true, count: displayCodes.length, isLiveDisplay: payload.isLiveDisplay === true });
    }

    const codes = Array.isArray(payload.order) ? payload.order.filter(x => typeof x === "string").slice(0, 300) : [];
    const batch = db.batch();
    codes.forEach((code, index) => {
      batch.set(db.collection("projects").doc(code), { presentationOrder: index + 1 }, { merge: true });
    });
    await batch.commit();
    return Response.json({ ok: true, count: codes.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "발표 순서 저장 오류" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const expected = process.env.ADMIN_PIN;
  if (!expected || request.headers.get("x-admin-pin") !== expected) {
    return Response.json({ error: "운영 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as { codes?: string[] };
    const codes = Array.isArray(payload.codes)
      ? [...new Set(payload.codes.filter(code => typeof code === "string").map(code => code.trim()).filter(Boolean))].slice(0, 300)
      : [];

    if (codes.length === 0) {
      return Response.json({ error: "삭제할 팀을 선택해 주세요." }, { status: 400 });
    }

    const db = getAdminDb();
    const batch = db.batch();
    codes.forEach(code => batch.delete(db.collection("projects").doc(code)));
    await batch.commit();
    return Response.json({ ok: true, deleted: codes.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "선택한 팀 삭제 오류" }, { status: 500 });
  }
}
