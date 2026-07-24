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

export async function callGeminiJson({ prompt, images = [], useSearch = false }: GeminiOptions) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY가 없습니다.");

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const parts: GeminiPart[] = [
    { text: prompt },
    ...images.map(parseDataUrl),
  ];
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.35,
    },
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
    const error = new Error(
      response.status === 429
        ? "Gemini 사용 한도를 확인해 주세요."
        : response.status === 400
          ? "Gemini 모델명 또는 요청 설정을 확인해 주세요."
          : response.status === 403
            ? "Gemini API 키 권한을 확인해 주세요."
            : "Gemini 호출에 실패했습니다.",
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return parseAiJson(extractGeminiText(await response.json()));
}
