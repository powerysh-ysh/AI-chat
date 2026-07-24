type Input = {
  mode?: "analyze" | "solutions";
  team?: string;
  problem?: string;
  solutionSeed?: string;
  discovery?: {
    customer?: string;
    situation?: string;
    rootCauses?: string[];
    problemStatement?: string;
  };
};

function extractText(payload: unknown): string {
  const data = payload as { output_text?: string; output?: { content?: { text?: string }[] }[] };
  if (data.output_text) return data.output_text;
  return data.output?.flatMap(x => x.content ?? []).map(x => x.text ?? "").join("") ?? "";
}

export async function POST(request: Request) {
  const input = (await request.json()) as Input;
  if (!input.problem?.trim()) {
    return Response.json({ error: "먼저 지역에서 발견한 불편을 적어 주세요." }, { status: 400 });
  }

  const mode = input.mode === "solutions" ? "solutions" : "analyze";
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!openAiKey && !geminiKey) {
    return Response.json({ error: "Vercel에 GEMINI_API_KEY 또는 OPENAI_API_KEY를 등록해 주세요.", code: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  const prompt = mode === "analyze"
    ? `당신은 창업을 처음 배우는 일반인을 돕는 지역문제 발견 코치입니다.
팀명: ${input.team}
참가자가 적은 불편: ${input.problem}
M2에서 팀이 만든 해결 아이디어: ${input.solutionSeed || "아직 없음"}
불편을 과장하거나 참가자의 의도를 바꾸지 마세요. 관찰한 사실과 추측을 구분하고, 원인은 사람 탓이 아닌 구조·과정·정보 관점에서 찾으세요.
핵심 고객은 가장 절실한 한 집단으로 좁히세요. problemStatement는 "[누가] [어떤 상황에서] [무엇 때문에] [어떤 불편을 겪는다" 형식의 쉬운 한 문장으로 쓰세요.
반드시 JSON 하나만 출력:
{"customer":"구체적 고객","situation":"문제가 발생하는 구체적 순간","rootCauses":["원인1","원인2","원인3"],"problemStatement":"문제 정의 한 문장","validationQuestions":["현장 확인 질문1","질문2","질문3"]}`
    : `당신은 지역문제를 창의적이면서 실행 가능한 사업 아이템으로 바꾸는 AI 아이디어 코치입니다.
원래 불편: ${input.problem}
핵심 고객: ${input.discovery?.customer}
문제 상황: ${input.discovery?.situation}
근본 원인: ${(input.discovery?.rootCauses ?? []).join(", ")}
최종 문제 정의: ${input.discovery?.problemStatement}
M2에서 팀이 만든 원안: ${input.solutionSeed || "없음"}
M2 원안을 버리거나 엉뚱한 새 아이디어로 바꾸지 마세요. 첫 후보는 원안의 핵심 의도를 유지하며 구체화하고, 나머지는 원안을 실행 가능하게 만드는 서로 다른 사업화 방식으로 제안하세요.
팀이 제공한 문제·고객·원안을 바탕으로 제안하세요. 실시간 검색이나 외부 통계를 사용하지 말고, 확인되지 않은 숫자는 만들지 마세요.
초보 참가자가 이해할 수 있는 말로 쓰고, 1주일 안에 5명 이하에게 시험 가능한 방법을 포함하세요. recommendation은 가장 공감도·실행성·차별성이 균형 잡힌 후보의 0부터 시작하는 번호입니다.
반드시 JSON 하나만 출력:
{"candidates":[{"title":"이름","type":"방식","description":"누구의 어떤 문제를 어떻게 해결하는지","value":"고객이 얻는 변화","feasibility":"작은 시험 방법"}],"recommendation":0}`;

  let geminiError = "";
  try {
    if (geminiKey) {
      try {
        return Response.json(await callGeminiJson({
          prompt,
          useSearch: false,
        }));
      } catch (error) {
        console.error("Gemini ideation failed", error);
        geminiError = error instanceof Error ? error.message : "Gemini 분석에 실패했습니다.";
        if (!openAiKey) throw error;
      }
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${openAiKey}` },
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
      console.error("OpenAI ideation failed", response.status, detail.slice(0, 500));
      const fallbackMessage = response.status === 429
        ? "OpenAI 사용 한도 또는 결제 상태를 확인해 주세요."
        : "OpenAI 분석에도 실패했습니다.";
      return Response.json({ error: geminiError || fallbackMessage }, { status: 502 });
    }
    const raw = extractText(await response.json()).replace(/^```json\s*|\s*```$/g, "");
    return Response.json(JSON.parse(raw));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "AI 분석 오류" }, { status: 502 });
  }
}
import { callGeminiJson } from "@/lib/gemini";
