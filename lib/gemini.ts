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

function createGeminiError(status: number, detail: string, model: string) {
  const providerMessage = upstreamMessage(detail);
  const highDemand = /high demand|overloaded|temporarily unavailable/i.test(detail);
  const message = highDemand || status === 503
    ? "Gemini가 혼잡하여 다른 AI 모델로 자동 전환하고 있습니다."
    : status === 429
      ? "Gemini 사용 한도 또는 결제 상태를 확인해 주세요."
      : status === 400
        ? `Gemini 요청 설정 오류입니다.${providerMessage ? ` ${providerMessage}` : ""}`
        : status === 401 || status === 403
          ? "Gemini API 키가 올바르지 않거나 프로젝트 사용 권한이 없습니다."
          : status === 404
            ? `Gemini 모델 '${model}'을 찾을 수 없습니다.`
            : `Gemini 호출에 실패했습니다.${providerMessage ? ` ${providerMessage}` : ""}`;
  const error = new Error(message) as Error & { status?: number; retryable?: boolean };
  error.status = status;
  error.retryable = [400, 404, 429, 500, 502, 503, 504].includes(status);
  return error;
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
  const primaryModel = !configuredModel || retiredModels.has(configuredModel)
    ? "gemini-3.5-flash"
    : configuredModel;
  const models = [...new Set([
    primaryModel,
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
  ])];

  let lastError: Error | null = null;
  // 무료 등급에서 Google Search가 막히면 같은 요청을 검색 없이 한 번 더 수행합니다.
  const searchModes = useSearch ? [true, false] : [false];

  for (const searchEnabled of searchModes) {
    const fallbackNotice = useSearch && !searchEnabled
      ? `\n\n중요: 지금은 실시간 웹 검색 도구를 사용할 수 없습니다. 일반 지식과 사용자가 제공한 내용만으로 초안을 작성하세요. 확인하지 않은 수치·통계·출처·URL을 만들지 마세요. evidence 필드가 있다면 빈 배열로 두고, researchSummary에는 "실시간 검색 없이 작성한 초안으로 현장 확인이 필요합니다."라고 적으세요.`
      : "";
    const parts: GeminiPart[] = [
      { text: prompt + fallbackNotice },
      ...images.map(parseDataUrl),
    ];
    const generationConfig: Record<string, unknown> = {};
    if (!searchEnabled) generationConfig.responseMimeType = "application/json";

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts }],
      generationConfig,
    };
    if (searchEnabled) body.tools = [{ google_search: {} }];

    for (const model of models) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (response.ok) {
        try {
          const parsed = parseAiJson(extractGeminiText(await response.json())) as Record<string, unknown>;
          if (useSearch && !searchEnabled) {
            if ("evidence" in parsed) parsed.evidence = [];
            if ("researchSummary" in parsed) {
              parsed.researchSummary = "실시간 검색 없이 팀 입력을 바탕으로 작성한 초안입니다. 현장 확인이 필요합니다.";
            }
            parsed.searchFallback = true;
          }
          return parsed;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error("Gemini 응답을 정리하지 못했습니다.");
          console.error("Gemini response parsing failed", model, searchEnabled, lastError.message);
          continue;
        }
      }

      const detail = await response.text();
      console.error("Gemini request failed", model, searchEnabled, response.status, detail.slice(0, 700));
      const error = createGeminiError(response.status, detail, model);
      lastError = error;
      if (!error.retryable && !searchEnabled) throw error;
      if (!error.retryable && searchEnabled) break;
    }
  }

  throw lastError ?? new Error("모든 Gemini 모델 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.");
}
