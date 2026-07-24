import { callGeminiJson } from "@/lib/gemini";

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

function localFallback(input: Input, mode: "analyze" | "solutions") {
  const problem = input.problem?.trim() || "지역에서 발견한 불편";
  const seed = input.solutionSeed?.trim();

  if (mode === "analyze") {
    return {
      customer: "이 불편을 가장 자주 겪는 지역 주민 또는 방문객",
      situation: "해당 지역의 서비스나 시설을 실제로 이용하려는 순간",
      rootCauses: [
        "필요한 정보가 이용자에게 이해하기 쉽게 전달되지 않음",
        "기존 이용 과정이 처음 이용하는 사람의 관점에서 설계되지 않음",
        "문제가 생겼을 때 도움을 받거나 해결 방법을 찾기 어려움",
      ],
      problemStatement: `지역 주민 또는 방문객이 서비스를 이용하는 상황에서 정보와 안내가 부족하여 ‘${problem}’라는 불편을 겪는다.`,
      validationQuestions: [
        "이 불편을 최근 직접 겪은 사람은 누구이며 언제 발생했나요?",
        "현재는 어떤 방법으로 문제를 해결하고 있나요?",
        "이 문제가 해결된다면 가장 먼저 달라져야 할 것은 무엇인가요?",
      ],
      offlineFallback: true,
      notice: "AI가 일시적으로 혼잡하여 입력 내용을 바탕으로 기본 분석을 만들었습니다. 팀원 경험에 맞게 문장을 수정해 주세요.",
    };
  }

  const customer = input.discovery?.customer || "이 문제를 겪는 지역 주민 또는 방문객";
  const statement = input.discovery?.problemStatement || problem;
  const original = seed || "필요한 정보와 도움을 한 번에 제공하는 간단한 안내 서비스";
  return {
    candidates: [
      {
        title: `${input.team?.trim() || "우리 팀"} 현장 해결안`,
        type: "M2 원안 구체화",
        description: `${customer}을 위해 ‘${statement}’ 문제를 해결하는 ${original}를 제안합니다.`,
        value: "이용자가 필요한 정보와 도움을 더 빠르고 쉽게 얻을 수 있습니다.",
        feasibility: "이번 주에 대상 고객 5명에게 종이 안내지나 화면 시안으로 설명하고 반응을 기록합니다.",
      },
      {
        title: "먼저 써보는 작은 체험판",
        type: "현장 실험",
        description: `${original}의 핵심 기능 한 가지만 선택해 실제 현장에서 짧게 체험하게 합니다.`,
        value: "큰 비용을 들이기 전에 고객이 정말 필요로 하는지 확인할 수 있습니다.",
        feasibility: "한 장소에서 1시간 동안 시범 운영하고 이용 전후의 불편 정도를 물어봅니다.",
      },
      {
        title: "지역 파트너 연결형 서비스",
        type: "협력 모델",
        description: "지역 상인·기관·주민과 협력해 정보 제공과 문제 해결을 함께 운영합니다.",
        value: "팀 혼자 해결하기 어려운 문제를 지역의 기존 자원과 연결해 지속적으로 운영할 수 있습니다.",
        feasibility: "협력 가능성이 높은 상인이나 기관 한 곳에 제안서를 보여주고 참여 조건을 확인합니다.",
      },
    ],
    recommendation: 0,
    offlineFallback: true,
    notice: "AI가 일시적으로 혼잡하여 M1·M2 입력을 바탕으로 기본 후보를 만들었습니다. 팀에 맞게 수정해 주세요.",
  };
}

export async function POST(request: Request) {
  const input = (await request.json()) as Input;
  if (!input.problem?.trim()) {
    return Response.json({ error: "먼저 지역에서 발견한 불편을 적어 주세요." }, { status: 400 });
  }

  const mode = input.mode === "solutions" ? "solutions" : "analyze";
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

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) {
    console.warn("GEMINI_API_KEY is missing; using workshop-safe local fallback");
    return Response.json(localFallback(input, mode));
  }

  try {
    return Response.json(await callGeminiJson({ prompt, useSearch: false }));
  } catch (error) {
    console.error("Gemini ideation failed; using workshop-safe local fallback", error);
    return Response.json(localFallback(input, mode));
  }
}
