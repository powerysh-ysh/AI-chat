type Input = {
  mode?: "analyze" | "solutions";
  team?: string;
  problem?: string;
  discovery?: {
    customer?: string;
    situation?: string;
    rootCauses?: string[];
    problemStatement?: string;
  };
};

type Analysis = {
  customer: string;
  situation: string;
  rootCauses: string[];
  problemStatement: string;
  validationQuestions: string[];
  demo?: boolean;
};

type SolutionCandidate = {
  title: string;
  type: string;
  description: string;
  value: string;
  feasibility: string;
};

function fallbackAnalysis(input: Input): Analysis {
  const original = input.problem?.trim() || "지역에서 반복되는 불편";
  return {
    customer: "이 불편을 가장 자주 겪는 지역 주민 또는 방문객",
    situation: "정보나 도움을 바로 찾기 어려운 순간",
    rootCauses: [
      "필요한 정보가 여러 곳에 흩어져 있습니다.",
      "처음 이용하는 사람에게 과정이 복잡합니다.",
      "현장의 실제 목소리가 기존 해결책에 충분히 반영되지 않았습니다.",
    ],
    problemStatement: `${original} 이 문제는 필요한 사람에게 알맞은 정보와 도움을 제때 연결하지 못해 반복됩니다.`,
    validationQuestions: [
      "이 불편을 최근 언제, 어디에서 겪었나요?",
      "현재는 어떤 방법으로 해결하며 무엇이 가장 불편한가요?",
      "해결된다면 시간이나 비용을 얼마나 아낄 수 있나요?",
    ],
    demo: true,
  };
}

function fallbackSolutions(input: Input) {
  const customer = input.discovery?.customer || "핵심 고객";
  const problem = input.discovery?.problemStatement || input.problem || "지역 문제";
  const candidates: SolutionCandidate[] = [
    {
      title: "한 번에 연결 서비스",
      type: "디지털 서비스",
      description: `${customer}이 질문 몇 번만으로 ${problem}에 필요한 정보와 지역 자원을 연결받는 간단한 안내 서비스`,
      value: "정보 탐색 시간을 줄이고 처음 이용하는 사람도 쉽게 시작합니다.",
      feasibility: "종이 안내판이나 간단한 챗봇으로 5명에게 먼저 시험할 수 있습니다.",
    },
    {
      title: "로컬 도우미 매칭",
      type: "사람 연결 서비스",
      description: `${customer}을 문제를 잘 아는 지역 상인·주민·활동가와 짧게 연결하는 도움 요청 서비스`,
      value: "기계적인 정보보다 현장에 맞는 실제 도움을 받을 수 있습니다.",
      feasibility: "도우미 2명과 고객 3명을 수기로 연결하며 수요를 확인할 수 있습니다.",
    },
    {
      title: "찾아가는 체험 키트",
      type: "오프라인 체험",
      description: `${problem}을 직접 이해하고 해결 방법을 연습할 수 있는 이동형 체험·교육 프로그램`,
      value: "디지털 사용이 어려운 사람도 재미있게 배우며 문제를 해결합니다.",
      feasibility: "A4 활동지와 샘플 도구만으로 30분 체험을 운영할 수 있습니다.",
    },
  ];
  return { candidates, recommendation: 0, demo: true };
}

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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json(mode === "analyze" ? fallbackAnalysis(input) : fallbackSolutions(input));

  const prompt = mode === "analyze"
    ? `당신은 창업을 처음 배우는 일반인을 돕는 지역문제 발견 코치입니다.
팀명: ${input.team}
참가자가 적은 불편: ${input.problem}
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
서로 복제한 아이디어가 아니라 ①디지털/도구 ②사람/연결 ③체험/공간처럼 접근 방식이 다른 해결안 3개를 제안하세요.
초보 참가자가 이해할 수 있는 말로 쓰고, 1주일 안에 5명 이하에게 시험 가능한 방법을 포함하세요. recommendation은 가장 공감도·실행성·차별성이 균형 잡힌 후보의 0부터 시작하는 번호입니다.
반드시 JSON 하나만 출력:
{"candidates":[{"title":"이름","type":"방식","description":"누구의 어떤 문제를 어떻게 해결하는지","value":"고객이 얻는 변화","feasibility":"작은 시험 방법"}],"recommendation":0}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", input: prompt, temperature: 0.75 }),
    });
    if (!response.ok) throw new Error();
    const raw = extractText(await response.json()).replace(/^```json\s*|\s*```$/g, "");
    return Response.json(JSON.parse(raw));
  } catch {
    return Response.json(mode === "analyze" ? fallbackAnalysis(input) : fallbackSolutions(input));
  }
}
