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

export async function POST(request: Request) {
  const input = (await request.json()) as Input;
  if (!input.problem?.trim()) {
    return Response.json({ error: "먼저 지역에서 발견한 불편을 적어 주세요." }, { status: 400 });
  }

  const mode = input.mode === "solutions" ? "solutions" : "analyze";
  // 참가자의 문제 경험은 민감할 수 있어 이 단계에서는 외부 서비스로 전송하지 않습니다.
  // 행사 운영자가 명시적 동의 절차를 마련한 뒤에만 외부 AI 연동을 추가합니다.
  return Response.json(mode === "analyze" ? fallbackAnalysis(input) : fallbackSolutions(input));
}
