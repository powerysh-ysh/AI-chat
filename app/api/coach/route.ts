type Input = {
  team?: string;
  problem?: string;
  solution?: string;
  tone?: string;
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

  const openAiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!openAiKey && !geminiKey) {
    return Response.json({ error: "Vercel에 GEMINI_API_KEY 또는 OPENAI_API_KEY를 등록해 주세요.", code: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  const prompt = `당신은 지역문제 해결형 창업 워크숍의 시니어 창업전략가이자 리서처입니다.
참가자는 창업을 처음 배우는 일반인입니다. 어려운 전문용어, 과장된 시장규모, 근거 없는 수치는 쓰지 마세요.
입력:
- 팀명: ${input.team}
- 문제 문장: ${input.problem}
- 해결 문장: ${input.solution}
- 원하는 말투: ${input.tone}

웹 검색으로 해당 지역·고객·문제·유사 서비스에 관한 최신 자료를 확인하세요. 검색 결과가 아이디어와 직접 관련 없으면 억지로 사용하지 마세요.
확인된 사실, 합리적 해석, 아직 검증하지 않은 가정을 엄격히 구분하세요. 출처 없는 숫자를 만들지 마세요.
두 문장의 의도를 바꾸지 말고 구체화하되, 고객은 가장 절실한 한 집단으로 좁히세요.
차별점은 "지역 맞춤", "쉽게 사용" 같은 추상어가 아니라 기존 대안과 비교해 행동·과정·비용·접근성 중 무엇이 어떻게 다른지 쓰세요.
수익모델은 지불 고객, 지불 이유, 과금 단위, 첫 매출 실험을 포함하세요.
첫 실험은 1주일 안에 5명 이하로 할 수 있어야 합니다. 3분 발표문은 문제 근거-고객-현재 대안의 한계-해결책-차별점-수익-검증계획-요청 순서로 작성하세요.
반드시 아래 키를 가진 JSON 하나만 출력하세요:
{"serviceNames":["짧은 한글 이름 3개"],"slogan":"한 문장","customer":"완전한 한 문장","problemInsight":"근거를 반영한 두 문장","solution":"두 문장 이내","differentiator":"비교 기준이 드러나는 두 문장","revenueModel":"지불고객·과금단위·첫매출 실험을 포함한 세 문장","localImpact":"한 문장","firstExperiment":"측정 기준이 있는 한 문장","researchSummary":"검색으로 확인한 핵심 사실 3~4문장","evidence":[{"claim":"이 아이템을 뒷받침하는 사실","sourceTitle":"출처 제목","url":"https URL"}],"assumptions":["아직 확인하지 않은 핵심 가정 3개"],"risks":["실행 시 가장 큰 위험 3개"],"pitch":"약 800~1000자 발표문","qa":[{"question":"날카로운 질문","answer":"근거와 검증 계획을 포함한 답변"}]}
evidence는 실제로 검색한 신뢰 가능한 출처 2~4개, qa는 4개를 만드세요.`;

  try {
    if (geminiKey) {
      try {
        const parsed = await callGeminiJson({ prompt, useSearch: true }) as CoachResult;
        return Response.json(parsed);
      } catch (error) {
        console.error("Gemini startup coaching failed", error);
        if (!openAiKey) throw error;
      }
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
        tools: [{ type: "web_search" }],
        input: prompt,
        reasoning: { effort: "low" },
        text: { verbosity: "medium" },
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return Response.json({ error: "AI 검색·분석에 실패했습니다.", detail: detail.slice(0, 500) }, { status: 502 });
    }
    const parsed = parseJson(extractText(await response.json())) as CoachResult;
    return Response.json(parsed);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "AI 분석 오류" }, { status: 500 });
  }
}
import { callGeminiJson } from "@/lib/gemini";
