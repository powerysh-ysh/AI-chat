import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { createHash } from "node:crypto";

type Payload = {
  code?: string;
  pin?: string;
  form?: { team?: string; members?: string; problem?: string; solution?: string; tone?: string };
  discovery?: unknown;
  solutionCandidates?: unknown;
  selectedCandidate?: number;
  result?: unknown;
  selectedName?: string;
  step?: number;
};

function cleanCode(value?: string) {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 40);
}

function teamKey(value?: string) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function codeFromTeam(value: string) {
  return `TEAM${createHash("sha256").update(teamKey(value)).digest("hex").slice(0, 16).toUpperCase()}`;
}

function cleanPin(value?: string) {
  return (value ?? "").replace(/\D/g, "").slice(0, 4);
}

function pinHash(team: string, pin: string) {
  return createHash("sha256").update(`local-hero:${teamKey(team)}:${pin}`).digest("hex");
}

function toDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : value ?? null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedTeam = (url.searchParams.get("team") ?? "").trim();
    const requestedPin = cleanPin(url.searchParams.get("pin") ?? "");
    if (!requestedTeam) {
      return Response.json({ error: "등록했던 팀 이름을 입력해 주세요." }, { status: 400 });
    }
    if (requestedTeam && requestedPin.length !== 4) {
      return Response.json({ error: "팀 비밀번호 숫자 4자리를 입력해 주세요." }, { status: 400 });
    }
    const db = getAdminDb();
    const key = teamKey(requestedTeam);
    let matches = await db.collection("projects").where("teamKey", "==", key).limit(2).get();
    if (matches.empty) {
      matches = await db.collection("projects").where("team", "==", requestedTeam).limit(2).get();
    }
    if (matches.empty) return Response.json({ error: "팀 이름 또는 팀 비밀번호가 올바르지 않습니다." }, { status: 401 });
    if (matches.size > 1) return Response.json({ error: "같은 팀 이름이 2개 이상입니다. 운영자에게 팀 이름 변경을 요청해 주세요." }, { status: 409 });
    const snapshot = matches.docs[0];
    const code = snapshot.id;
    if (!snapshot.exists) return Response.json({ error: "해당 팀을 찾을 수 없습니다." }, { status: 404 });
    const row = snapshot.data()!;
    const lockedUntil = row.pinLockedUntil instanceof Timestamp ? row.pinLockedUntil.toMillis() : 0;
    if (lockedUntil > Date.now()) {
      const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
      return Response.json({ error: `비밀번호 입력 횟수를 초과했습니다. ${minutes}분 뒤 다시 시도해 주세요.` }, { status: 429 });
    }
    if (!row.pinHash) {
      return Response.json({ error: "이 팀은 이전 방식으로 저장되었습니다. 현재 사용하던 기기에서 팀 비밀번호를 먼저 등록해 주세요." }, { status: 409 });
    }
    if (row.pinHash !== pinHash(row.team, requestedPin)) {
      const attempts = (Number(row.failedPinAttempts) || 0) + 1;
      await snapshot.ref.set({
        failedPinAttempts: attempts >= 5 ? 0 : attempts,
        pinLockedUntil: attempts >= 5 ? Timestamp.fromMillis(Date.now() + 15 * 60 * 1000) : null,
      }, { merge: true });
      return Response.json({
        error: attempts >= 5
          ? "비밀번호를 5회 잘못 입력하여 15분 동안 잠겼습니다."
          : `팀 이름 또는 팀 비밀번호가 올바르지 않습니다. (${attempts}/5)`,
      }, { status: attempts >= 5 ? 429 : 401 });
    }
    if (row.failedPinAttempts || row.pinLockedUntil) {
      await snapshot.ref.set({ failedPinAttempts: 0, pinLockedUntil: null }, { merge: true });
    }
    return Response.json({ project: {
      code,
      form: { team: row.team, members: row.members, problem: row.problem, solution: row.solution, tone: row.tone },
      discovery: row.discovery ?? null, solutionCandidates: row.solutionCandidates ?? [],
      selectedCandidate: row.selectedCandidate ?? -1,
      result: row.result ?? null, selectedName: row.selectedName ?? "", step: row.step ?? 0,
      presentationOrder: row.presentationOrder ?? null,
      status: row.status ?? "팀 등록", updatedAt: toDate(row.updatedAt),
    }});
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "DB 연결 오류" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Payload;
    const form = payload.form;
    if (!form?.team?.trim()) return Response.json({ error: "팀 이름이 필요합니다." }, { status: 400 });
    const pin = cleanPin(payload.pin);
    if (pin.length !== 4) return Response.json({ error: "팀 비밀번호 숫자 4자리가 필요합니다." }, { status: 400 });
    const code = cleanCode(payload.code) || codeFromTeam(form.team);
    const ref = getAdminDb().collection("projects").doc(code);
    const old = await ref.get();
    if (old.exists && old.data()?.pinHash && old.data()?.pinHash !== pinHash(old.data()?.team ?? form.team, pin)) {
      return Response.json({ error: "이미 등록된 팀 이름이거나 팀 비밀번호가 다릅니다." }, { status: 401 });
    }
    const step = Math.max(0, Math.min(6, Number(payload.step) || 0));
    await ref.set({
      code, team: form.team.trim().slice(0, 80), teamKey: teamKey(form.team), pinHash: pinHash(form.team, pin), members: (form.members ?? "").trim().slice(0, 300),
      problem: (form.problem ?? "").trim().slice(0, 2000), solution: (form.solution ?? "").trim().slice(0, 2000),
      tone: (form.tone ?? "재미있고 유쾌하게").slice(0, 60), result: payload.result ?? null,
      discovery: payload.discovery ?? null, solutionCandidates: payload.solutionCandidates ?? [],
      selectedCandidate: Number.isInteger(payload.selectedCandidate) ? payload.selectedCandidate : -1,
      selectedName: (payload.selectedName ?? "").slice(0, 100), step,
      status: payload.result ? "사업화 완료" : form.solution ? "해결책 작성" : form.problem ? "문제 작성" : "팀 등록",
      createdAt: old.exists ? old.data()?.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return Response.json({ ok: true, code });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "DB 연결 오류" }, { status: 500 });
  }
}
