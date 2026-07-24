import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../../../lib/firebase-admin";

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
    const payload = (await request.json()) as { order?: string[] };
    const codes = Array.isArray(payload.order) ? payload.order.filter(x => typeof x === "string").slice(0, 300) : [];
    const db = getAdminDb();
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
    const payload = (await request.json()) as { code?: string; codes?: string[]; deleteAll?: boolean };
    const db = getAdminDb();

    if (payload.deleteAll === true) {
      let deleted = 0;

      while (true) {
        const snapshot = await db.collection("projects").limit(400).get();
        if (snapshot.empty) break;

        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += snapshot.size;
      }

      return Response.json({ ok: true, deleted });
    }

    const codes = Array.isArray(payload.codes)
      ? [...new Set(payload.codes.filter(code => typeof code === "string").map(code => code.trim()).filter(Boolean))].slice(0, 300)
      : [];

    if (codes.length > 0) {
      const batch = db.batch();
      codes.forEach(code => batch.delete(db.collection("projects").doc(code)));
      await batch.commit();
      return Response.json({ ok: true, deleted: codes.length });
    }

    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    if (!code) {
      return Response.json({ error: "삭제할 팀 정보가 없습니다." }, { status: 400 });
    }

    await db.collection("projects").doc(code).delete();
    return Response.json({ ok: true, deleted: 1 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "팀 삭제 오류" }, { status: 500 });
  }
}
