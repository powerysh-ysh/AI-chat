type Input = {
  team?: string;
  problem?: string;
  solution?: string;
  tone?: string;
  selectedName?: string;
  revisionMode?: boolean;
  discovery?: {
    customer?: string;
    situation?: string;
    rootCauses?: string[];
    problemStatement?: string;
    validationQuestions?: string[];
  } | null;
  currentDraft?: Partial<CoachResult> | null;
};

type CoachResult = {
  serviceNames: string[];
  slogan: string;
  customer: string;
  problemInsight: string;
  solution: string;
  differentiator: string;
  revenueModel: string;
  localImpact: string;
  firstExperiment: string;
  pitch: string;
  qa: { question: string; answer: string }[];
  researchSummary?: string;
  evidence?: { claim: string; sourceTitle: string; url: string }[];
  assumptions?: string[];
  risks?: string[];
  demo?: boolean;
};

function localFallback(input: Input, reason: string): CoachResult {
  const draft = input.currentDraft ?? {};
  const customer = draft.customer?.trim()
    || input.discovery?.customer?.trim()
    || "이 문제를 가장 절실하게 겪는 지역 주민 또는 방문객";
  const problemInsight = draft.problemInsight?.trim()
    || input.discovery?.problemStatement?.trim()
    || input.problem?.trim()
    || "지역에서 해결이 필요한 불편이 있다.";
  const solution = draft.solution?.trim() || input.solution?.trim() || "팀이 제안한 해결 서비스를 작은 규모로 시험한다.";
  const serviceNames = draft.serviceNames?.filter(Boolean).length
    ? draft.serviceNames.filter(Boolean) as string[]
    : [input.selectedName?.trim() || `${input.team?.trim() || "우리 팀"} 온`, "지역한걸음", "함께해결"];
  const slogan = draft.slogan?.trim() || "지역의 불편을 발견하고, 함께 새로운 길을 만듭니다.";
  const differentiator = draft.differentiator?.trim()
    || "일반적인 정보 제공에 그치지 않고, 실제 문제 상황에서 필요한 도움을 지역의 사람·기관과 연결해 작은 현장 실험으로 검증합니다.";
  const revenueModel = draft.revenueModel?.trim()
    || "초기에는 무료 체험으로 이용 의사를 확인합니다. 이후 직접 이용자 또는 협력 기관이 체험·운영 단위로 비용을 지불하는지 소액 결제로 검증합니다.";
  const localImpact = draft.localImpact?.trim()
    || "이용자의 불편을 줄이고 지역의 기존 자원과 사람을 연결해 지속 가능한 해결 구조를 만듭니다.";
  const firstExperiment = draft.firstExperiment?.trim()
    || "이번 주 안에 핵심 고객 5명 이하에게 종이 시안이나 설명 화면을 보여주고 이용 의사와 개선 의견을 기록합니다.";
  const pitch = draft.pitch?.trim() || `안녕하세요. 저희는 ${input.team} 팀입니다.

저희가 발견한 문제는 ${problemInsight}

이 문제를 해결하기 위해 ${solution}

우리 서비스의 차별점은 ${differentiator}

초기에는 ${revenueModel}

가장 먼저 ${firstExperiment}

저희는 이 작은 실험을 통해 실제 고객에게 필요한 서비스인지 확인하고, 지역 파트너와 함께 보완해 나가겠습니다. 감사합니다.`;

  return {
    serviceNames,
    slogan,
    customer,
    problemInsight,
    solution,
    differentiator,
    revenueModel,
    localImpact,
    firstExperiment,
    pitch,
    qa: draft.qa?.length ? draft.qa : [
      { question: "고객이 실제로 비용을 지불할까요?", answer: "무료 체험 후 소액 결제 의사를 묻고 실제 결제까지 확인하겠습니다." },
      { question: "기존 방법과 무엇이 다른가요?", answer: "정보 제공만 하는 대신 문제 상황에서 필요한 행동과 지역 자원을 연결해 현장에서 검증합니다." },
      { question: "가장 먼저 무엇을 시험하나요?", answer: firstExperiment },
      { question: "실행할 때 가장 큰 위험은 무엇인가요?", answer: "고객의 실제 필요와 운영 부담을 먼저 확인하고 작은 범위에서 보완하겠습니다." },
    ],
    researchSummary: `AI 연결이 원활하지 않아 팀이 입력하고 직접 수정한 내용을 우선 보존해 기본 사업안을 만들었습니다. ${reason}`,
    evidence: [],
    assumptions: draft.assumptions?.length ? draft.assumptions : ["고객이 이 문제를 중요하게 느낀다.", "제안한 해결 방식을 실제로 이용할 의사가 있다.", "지역 파트너와 협력할 수 있다."],
    risks: draft.risks?.length ? draft.risks : ["고객 수요가 예상보다 낮을 수 있음", "운영 인력과 비용이 늘어날 수 있음", "지역 파트너 확보가 늦어질 수 있음"],
    demo: true,
  };
}

function extractText(payload: unknown): string {
  const data = payload as { output_text?: string; output?: { content?: { text?: string }[] }[] };
  if (data.output_text) return data.output_text;
  return data.output?.flatMap(x => x.content ?? []).map(x => x.text ?? "").join("") ?? "";
}

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI 응답 형식 오류");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function POST(request: Request) {
  const input = (await request.json()) as Input;
  if (!input.team?.trim() || !input.problem?.trim() || !input.solution?.trim()) {
    return Response.json({ error: "팀명, 문제 문장, 해결 문장이 필요합니다." }, { status: 400 });
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!openAiKey && !geminiKey) {
    return Response.json(localFallback(input, "AI API 설정을 확인한 뒤 다시 실행하면 새로운 맞춤 결과를 만들 수 있습니다."));
  }

  const prompt = `당신은 지역문제 해결형 창업 워크숍의 시니어 창업전략가이자 리서처입니다.
참가자는 창업을 처음 배우는 일반인입니다. 어려운 전문용어, 과장된 시장규모, 근거 없는 수치는 쓰지 마세요.
입력:
- 팀명: ${input.team}
- 문제 문장: ${input.problem}
- 해결 문장: ${input.solution}
- 원하는 말투: ${input.tone}
- 팀이 선택한 서비스명: ${input.selectedName || "아직 선택하지 않음"}

팀이 직접 검토·수정한 문제 분석:
${input.discovery ? JSON.stringify(input.discovery) : "없음"}

팀이 직접 고치거나 추가 조사 내용을 반영한 현재 사업 초안:
${input.currentDraft ? JSON.stringify(input.currentDraft) : "없음"}

외부 검색을 새로 수행하지 마세요. 참가자가 직접 입력한 경험과 추가 조사 내용을 가장 우선하여 사용하세요.
참가자가 수정한 문장은 '확정된 사실과 의도'입니다. 재실행하더라도 삭제하거나 반대 의미로 바꾸지 말고, 팀의 말투를 유지하면서 구조·구체성·설득력만 보완하세요.
예를 들어 "안내표지판이 없다", "엘리베이터 위치를 몰랐다"고 적었다면 "표지판이 많아 복잡했다"처럼 다른 사실로 바꾸면 안 됩니다.
현재 사업 초안이 있다면 새 문서로 갈아엎지 말고, 그 초안을 기준으로 빠진 연결과 실행 방법만 보완하세요. 팀이 선택한 서비스명이 있으면 serviceNames의 첫 번째 항목으로 유지하세요.
확인된 사실, 합리적 해석, 아직 검증하지 않은 가정을 엄격히 구분하세요. 출처 없는 숫자를 만들지 마세요.
두 문장의 의도를 바꾸지 말고 구체화하되, 고객은 가장 절실한 한 집단으로 좁히세요.
차별점은 "지역 맞춤", "쉽게 사용" 같은 추상어가 아니라 기존 대안과 비교해 행동·과정·비용·접근성 중 무엇이 어떻게 다른지 쓰세요.
수익모델은 지불 고객, 지불 이유, 과금 단위, 첫 매출 실험을 포함하세요.
첫 실험은 1주일 안에 5명 이하로 할 수 있어야 합니다. 3분 발표문은 문제 근거-고객-현재 대안의 한계-해결책-차별점-수익-검증계획-요청 순서로 작성하세요.
반드시 아래 키를 가진 JSON 하나만 출력하세요:
{"serviceNames":["짧은 한글 이름 3개"],"slogan":"한 문장","customer":"완전한 한 문장","problemInsight":"근거를 반영한 두 문장","solution":"두 문장 이내","differentiator":"비교 기준이 드러나는 두 문장","revenueModel":"지불고객·과금단위·첫매출 실험을 포함한 세 문장","localImpact":"한 문장","firstExperiment":"측정 기준이 있는 한 문장","researchSummary":"참가자 입력과 조사에서 확인한 핵심 사실 3~4문장","evidence":[{"claim":"이 아이템을 뒷받침하는 사실","sourceTitle":"출처 제목","url":"https URL"}],"assumptions":["아직 확인하지 않은 핵심 가정 3개"],"risks":["실행 시 가장 큰 위험 3개"],"pitch":"약 800~1000자 발표문","qa":[{"question":"날카로운 질문","answer":"근거와 검증 계획을 포함한 답변"}]}
evidence는 반드시 빈 배열로 두고, qa는 4개를 만드세요.`;

  let geminiError = "";
  try {
    if (geminiKey) {
      try {
        const parsed = await callGeminiJson({ prompt, useSearch: false, timeoutMs: 12000 }) as CoachResult;
        return Response.json(parsed);
      } catch (error) {
        console.error("Gemini startup coaching failed", error);
        geminiError = error instanceof Error ? error.message : "Gemini 사업화 분석에 실패했습니다.";
        if (!openAiKey) throw error;
      }
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${openAiKey}` },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
        tools: [],
        input: prompt,
        reasoning: { effort: "low" },
        text: { verbosity: "medium" },
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("OpenAI startup coaching failed", response.status, detail.slice(0, 500));
      const fallbackMessage = response.status === 429
        ? "OpenAI 사용 한도 또는 결제 상태를 확인해 주세요."
        : "OpenAI 사업화 분석에도 실패했습니다.";
      return Response.json(localFallback(input, geminiError || fallbackMessage));
    }
    const parsed = parseJson(extractText(await response.json())) as CoachResult;
    return Response.json(parsed);
  } catch (error) {
    return Response.json(localFallback(input, error instanceof Error ? error.message : "AI 분석 오류"));
  }
}
import { callGeminiJson } from "@/lib/gemini";
