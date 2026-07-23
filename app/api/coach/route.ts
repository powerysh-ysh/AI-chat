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
  demo?: boolean;
};

function fallback(input: Input): CoachResult {
  const customer = input.problem?.split(/이 |가 |은 |는 /)[0]?.trim() || "지역 주민";
  const core = input.solution?.replace(/^우리 팀은.*?위해\s*/, "").replace(/을 제안합니다.*$/, "").trim() || "지역 문제 해결 서비스";
  return {
    serviceNames: ["동네한걸음", "로컬톡톡", "함께잇다"],
    slogan: "지역의 불편을 발견하고, 함께 새로운 길을 만듭니다",
    customer,
    problemInsight: input.problem || "지역의 일상에서 반복되는 불편을 겪고 있습니다.",
    solution: input.solution || "누구나 쉽게 이용할 수 있는 지역 맞춤 서비스를 제안합니다.",
    differentiator: "지역 주민과 상인의 실제 경험을 반영하고, 처음 쓰는 사람도 질문 세 번 안에 필요한 도움을 받을 수 있습니다.",
    revenueModel: "초기에는 무료 체험으로 고객 반응을 확인하고, 이후 제휴 수수료·기관 협력비·상점 홍보비로 운영합니다.",
    localImpact: "방문객의 만족도를 높이고 지역 상권과 주민의 연결을 늘려 지역 안에서 소비와 관계가 이어지게 합니다.",
    firstExperiment: `이번 주 ${customer} 5명에게 ${core} 아이디어를 보여주고, 가장 필요한 기능과 이용 의향을 인터뷰합니다.`,
    pitch: `안녕하세요. 저희는 ${input.team || "로컬 히어로"} 팀입니다.

여러분도 지역에서 작지만 반복되는 불편을 경험한 적 있으신가요? 저희가 발견한 문제는 다음과 같습니다. ${input.problem}

그래서 저희는 ${input.solution} 이름하여 ‘동네한걸음’입니다.

이 서비스의 특별한 점은 복잡한 설명 없이 누구나 쉽게 이용하고, 지역의 실제 목소리를 계속 반영한다는 것입니다. 초기에는 고객 5명을 직접 만나 작은 실험부터 시작하겠습니다. 이후 제휴 수수료와 기관 협력으로 지속 가능한 운영 구조를 만들겠습니다.

저희가 만들고 싶은 것은 단순한 서비스 하나가 아닙니다. 지역의 불편이 새로운 기회가 되고, 주민과 상인이 더 잘 연결되는 변화입니다.

저희 ${input.team || "로컬 히어로"} 팀의 첫걸음에 투자해 주세요. 감사합니다!`,
    qa: [
      { question: "정말 이 서비스를 필요로 하는 사람이 있나요?", answer: "행사 후 핵심 고객 5명을 직접 만나 문제와 이용 의향을 확인하겠습니다." },
      { question: "기존 서비스와 무엇이 다른가요?", answer: "지역의 실제 경험을 반영하고, 처음 이용하는 사람도 쉽게 쓸 수 있도록 단계를 줄인 점이 다릅니다." },
      { question: "어떻게 돈을 벌고 계속 운영하나요?", answer: "작은 무료 실험으로 수요를 확인한 뒤 제휴 수수료, 기관 협력비, 홍보비를 단계적으로 검증하겠습니다." },
    ],
    demo: true,
  };
}

function extractText(payload: unknown): string {
  const data = payload as { output_text?: string; output?: { content?: { text?: string }[] }[] };
  if (data.output_text) return data.output_text;
  return data.output?.flatMap(x => x.content ?? []).map(x => x.text ?? "").join("") ?? "";
}

export async function POST(request: Request) {
  const input = (await request.json()) as Input;
  if (!input.team?.trim() || !input.problem?.trim() || !input.solution?.trim()) {
    return Response.json({ error: "팀명, 문제 문장, 해결 문장이 필요합니다." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json(fallback(input));

  const prompt = `당신은 지역문제 해결형 창업 워크숍의 친절한 AI 창업 코치입니다.
참가자는 창업을 처음 배우는 일반인입니다. 어려운 전문용어, 과장된 시장규모, 근거 없는 수치는 쓰지 마세요.
입력:
- 팀명: ${input.team}
- 문제 문장: ${input.problem}
- 해결 문장: ${input.solution}
- 원하는 말투: ${input.tone}

두 문장의 의도를 바꾸지 말고 구체화하세요. 핵심 고객은 한 집단으로 좁히고, 수익모델은 초보자도 이해할 수 있게 하세요.
첫 실험은 1주일 안에 5명 이하로 할 수 있어야 합니다. 3분 발표문은 문제-고객-해결책-차별점-운영/수익-지역효과-투자요청 순서로 자연스럽게 작성하세요.
반드시 아래 키를 가진 JSON 하나만 출력하세요:
{"serviceNames":["짧은 한글 이름 3개"],"slogan":"한 문장","customer":"한 문장","problemInsight":"한 문장","solution":"두 문장 이내","differentiator":"두 문장 이내","revenueModel":"두 문장 이내","localImpact":"한 문장","firstExperiment":"한 문장","pitch":"약 700~900자 발표문","qa":[{"question":"질문","answer":"답변"}]}
qa는 3개를 만드세요.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: prompt,
        temperature: 0.7,
      }),
    });
    if (!response.ok) return Response.json(fallback(input));
    const raw = extractText(await response.json()).replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(raw) as CoachResult;
    return Response.json(parsed);
  } catch {
    return Response.json(fallback(input));
  }
}
