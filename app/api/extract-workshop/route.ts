import { callGeminiJson } from "@/lib/gemini";

type Input = { images?: string[] };

function extractOpenAiText(payload: unknown): string {
  const data = payload as { output_text?: string; output?: { content?: { text?: string }[] }[] };
  if (data.output_text) return data.output_text;
  return data.output?.flatMap(x => x.content ?? []).map(x => x.text ?? "").join("") ?? "";
}

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("활동지 인식 결과를 정리하지 못했습니다.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function POST(request: Request) {
  const input = (await request.json()) as Input;
  const images = (input.images ?? []).slice(0, 2);
  if (!images.length || images.some(image => !image.startsWith("data:image/"))) {
    return Response.json({ error: "M1·M2 활동지 사진을 선택해 주세요." }, { status: 400 });
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!openAiKey && !geminiKey) {
    return Response.json({ error: "AI API 키가 연결되지 않았습니다. 운영자에게 알려 주세요." }, { status: 503 });
  }

  const instruction = `첨부 이미지는 지역문제 해결 창업 워크숍의 M1 문제발견 및 M2 해결 아이디어 활동지입니다.
손글씨, 포스트잇, 표 안의 글을 읽되 보이지 않는 내용을 지어내지 마세요.
여러 의견 중 최종 선택 표시가 있으면 우선하고, 확실하지 않으면 warnings에 적으세요.
개인의 전화번호·이메일·주소가 보이면 결과에 포함하지 마세요.
problem은 "[어떤 사람]이 [어떤 상황]에서 [무엇 때문에] 어떤 불편을 겪는다" 형식의 한두 문장으로 정리하세요.
solution은 참가자의 원래 아이디어를 유지해 "우리 팀은 [고객]을 위해 [문제]를 해결하는 [서비스]를 제안한다" 형식의 한두 문장으로 정리하세요.
반드시 JSON 하나만 출력하세요:
{"problem":"M1 문제 문장","solution":"M2 해결 문장","extractedNotes":["사진에서 실제로 읽힌 핵심 메모"],"warnings":["흐리거나 뜻이 불분명해 참가자가 확인할 부분"]}`;

  let geminiError = "";
  try {
    if (geminiKey) {
      try {
        return Response.json(await callGeminiJson({ prompt: instruction, images }));
      } catch (error) {
        console.error("Gemini workshop extraction failed", error);
        geminiError = error instanceof Error ? error.message : "Gemini 사진 분석에 실패했습니다.";
        if (!openAiKey) throw error;
      }
    }

    const content: ({ type: "input_text"; text: string } | { type: "input_image"; image_url: string })[] = [
      { type: "input_text", text: instruction },
      ...images.map(image_url => ({ type: "input_image" as const, image_url })),
    ];
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        input: [{ role: "user", content }],
        reasoning: { effort: "low" },
        text: { verbosity: "medium" },
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("workshop image analysis failed", response.status, detail.slice(0, 500));
      const message = response.status === 413
        ? "사진 용량이 큽니다. 한 장씩 다시 올려 주세요."
        : response.status === 429
          ? "AI 사용 한도 또는 결제 상태를 확인해 주세요."
          : geminiError || "사진 분석에 실패했습니다. 글씨가 잘 보이도록 한 장씩 다시 촬영해 주세요.";
      return Response.json({ error: message }, { status: 502 });
    }
    return Response.json(parseJson(extractOpenAiText(await response.json())));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "사진 분석 오류" }, { status: 502 });
  }
}
