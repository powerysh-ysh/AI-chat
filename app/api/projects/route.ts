import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";

type Payload = {
  code?: string;
  form?: { team?: string; members?: string; problem?: string; solution?: string; tone?: string };
  discovery?: unknown;
  solutionCandidates?: unknown;
  selectedCandidate?: number;
  result?: unknown;
  selectedName?: string;
  step?: number;
};

function cleanCode(value?: string) {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function toDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : value ?? null;
}

export async function GET(request: Request) {
  try {
    const code = cleanCode(new URL(request.url).searchParams.get("code") ?? "");
    if (code.length < 6) return Response.json({ error: "6~8자리 팀 코드를 입력해 주세요." }, { status: 400 });
    const snapshot = await getAdminDb().collection("projects").doc(code).get();
    if (!snapshot.exists) return Response.json({ error: "해당 팀을 찾을 수 없습니다." }, { status: 404 });
    const row = snapshot.data()!;
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
    const code = cleanCode(payload.code);
    const form = payload.form;
    if (code.length < 6 || !form?.team?.trim()) return Response.json({ error: "팀 코드와 팀 이름이 필요합니다." }, { status: 400 });
    const ref = getAdminDb().collection("projects").doc(code);
    const old = await ref.get();
    const step = Math.max(0, Math.min(6, Number(payload.step) || 0));
    await ref.set({
      code, team: form.team.trim().slice(0, 80), members: (form.members ?? "").trim().slice(0, 300),
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
