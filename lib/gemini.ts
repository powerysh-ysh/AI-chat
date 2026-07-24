type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiOptions = {
  prompt: string;
  images?: string[];
  useSearch?: boolean;
};

function parseDataUrl(image: string): GeminiPart {
  const match = image.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!match) throw new Error("지원하지 않는 이미지 형식입니다.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

function extractGeminiText(payload: unknown): string {
  const data = payload as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    const reason = data.promptFeedback?.blockReason;
    throw new Error(reason ? `Gemini 응답 차단: ${reason}` : "Gemini가 결과를 만들지 못했습니다.");
  }
  return text;
}

export function parseAiJson(text: string) {
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI 응답을 JSON으로 정리하지 못했습니다.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function upstreamMessage(detail: string) {
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } };
    return parsed.error?.message?.replace(/API key[^.]*\.?/gi, "API 키 ").slice(0, 240) ?? "";
  } catch {
    return "";
  }
}

export async function callGeminiJson({ prompt, images = [], useSearch = false }: GeminiOptions) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");

  const configuredModel = process.env.GEMINI_MODEL?.trim();
  const retiredModels = new Set([
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.5-flash",
  ]);
  // 2026년 7월 기준 운영용 안정 모델. Vercel에 과거 모델명이 남아 있어도 자동 전환합니다.
  const model = !configuredModel || retiredModels.has(configuredModel)
    ? "gemini-3.5-flash"
    : configuredModel;
  const parts: GeminiPart[] = [
    { text: prompt },
    ...images.map(parseDataUrl),
  ];
  const generationConfig: Record<string, unknown> = {};
  // Google Search 도구와 JSON MIME 강제 설정은 일부 Gemini 모델에서 충돌합니다.
  if (!useSearch) generationConfig.responseMimeType = "application/json";

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig,
  };
  if (useSearch) body.tools = [{ google_search: {} }];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    console.error("Gemini request failed", response.status, detail.slice(0, 700));
    const providerMessage = upstreamMessage(detail);
    const message = response.status === 429
      ? "Gemini 무료 사용 한도 또는 결제 상태를 확인해 주세요."
      : response.status === 400
        ? `Gemini 요청 설정 오류입니다.${providerMessage ? ` ${providerMessage}` : ""}`
        : response.status === 401 || response.status === 403
          ? "Gemini API 키가 올바르지 않거나 프로젝트 사용 권한이 없습니다."
          : response.status === 404
            ? `Gemini 모델 '${model}'을 찾을 수 없습니다. GEMINI_MODEL 값을 확인해 주세요.`
            : `Gemini 호출에 실패했습니다.${providerMessage ? ` ${providerMessage}` : ""}`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return parseAiJson(extractGeminiText(await response.json()));
}
