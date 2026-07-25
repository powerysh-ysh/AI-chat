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
      restoreProjectCode?: string;
      restoreProject?: {
        problem?: string;
        solution?: string;
        selectedName?: string;
        discovery?: unknown;
        solutionCandidates?: unknown;
        result?: {
          serviceNames?: string[];
          slogan?: string;
          customer?: string;
          problemInsight?: string;
          solution?: string;
          differentiator?: string;
          revenueModel?: string;
          localImpact?: string;
          firstExperiment?: string;
          pitch?: string;
          qa?: unknown[];
        };
      };
    };
    const db = getAdminDb();

    const restoreProjectCode = typeof payload.restoreProjectCode === "string" ? payload.restoreProjectCode.trim() : "";
    if (restoreProjectCode) {
      const restore = payload.restoreProject;
      const problem = String(restore?.problem ?? "").trim().slice(0, 2000);
      const solution = String(restore?.solution ?? "").trim().slice(0, 2000);
      const selectedName = String(restore?.selectedName ?? restore?.result?.serviceNames?.[0] ?? "").trim().slice(0, 100);
      if (!problem || !solution || !selectedName) {
        return Response.json({ error: "복구하려면 M1 문제, M2 해결 아이디어, 서비스명이 모두 필요합니다." }, { status: 400 });
      }

      const ref = db.collection("projects").doc(restoreProjectCode);
      const snapshot = await ref.get();
      if (!snapshot.exists) {
        return Response.json({ error: "결과물을 복구할 팀을 찾을 수 없습니다." }, { status: 404 });
      }

      const result = restore?.result ?? {};
      const serviceNames = Array.isArray(result.serviceNames)
        ? [...new Set(result.serviceNames.map(value => String(value).trim()).filter(Boolean))].slice(0, 3)
        : [];
      if (!serviceNames.includes(selectedName)) serviceNames.unshift(selectedName);

      const customer = String(result.customer ?? "").trim().slice(0, 1000);
      const resultSolution = String(result.solution ?? solution).trim().slice(0, 2000);
      const restoredResult = {
        serviceNames: serviceNames.slice(0, 3),
        slogan: String(result.slogan ?? "").trim().slice(0, 500),
        customer,
        problemInsight: String(result.problemInsight ?? problem).trim().slice(0, 2000),
        solution: resultSolution,
        differentiator: String(result.differentiator ?? "").trim().slice(0, 2000),
        revenueModel: String(result.revenueModel ?? "").trim().slice(0, 2000),
        localImpact: String(result.localImpact ?? "").trim().slice(0, 2000),
        firstExperiment: String(result.firstExperiment ?? "").trim().slice(0, 2000),
        pitch: String(result.pitch ?? "").trim().slice(0, 8000),
        qa: Array.isArray(result.qa) ? result.qa.slice(0, 10) : [],
      };

      await ref.set({
        problem,
        solution,
        discovery: restore?.discovery ?? {
          customer: customer || "핵심 고객을 현장에서 확인합니다.",
          situation: problem,
          rootCauses: [problem],
          problemStatement: problem,
          validationQuestions: [
            "이 문제를 실제로 자주 겪는 고객은 누구인가요?",
            "현재 고객은 어떤 방법으로 문제를 해결하고 있나요?",
            "이 해결책을 이용하거나 비용을 지불할 의사가 있나요?",
          ],
        },
        solutionCandidates: restore?.solutionCandidates ?? [{
          title: selectedName,
          type: "PPT 결과물 복구",
          description: solution,
          value: restoredResult.differentiator || resultSolution,
          feasibility: restoredResult.firstExperiment || "소규모 현장 실험으로 검증합니다.",
        }],
        selectedCandidate: 0,
        result: restoredResult,
        selectedName,
        workshopImport: {
          problem,
          solution,
          extractedNotes: ["완성된 PPT 결과물에서 운영자가 복원했습니다."],
          warnings: ["최초 활동지의 원문과 표현이 다를 수 있으므로 팀이 최종 확인해 주세요."],
        },
        step: 6,
        status: "사업화 완료",
        updatedAt: Timestamp.now(),
      }, { merge: true });
      return Response.json({ ok: true, team: snapshot.data()?.team ?? "", selectedName });
    }

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
