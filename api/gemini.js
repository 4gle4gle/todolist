const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";

function sendJson(response, statusCode, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(statusCode).json(body);
}

function fallbackMessage(todoTitle) {
  return `"${todoTitle}" 작업을 시작했어요. 작은 시작이 큰 변화를 만듭니다.`;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const todoTitle = String(request.body?.todoTitle || "").trim().slice(0, 120);

  if (!todoTitle) {
    sendJson(response, 400, { error: "TODO_TITLE_REQUIRED" });
    return;
  }

  if (!apiKey) {
    sendJson(response, 200, { text: fallbackMessage(todoTitle), fallback: true });
    return;
  }

  try {
    const geminiResponse = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `할 일 "${todoTitle}"에 맞는 짧은 동기부여 문구를 한국어로 한 문장만 만들어줘. 과장하지 말고 35자 안팎으로 작성해줘.`,
              },
            ],
          },
        ],
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error", geminiResponse.status, errorText);
      sendJson(response, 200, { text: fallbackMessage(todoTitle), fallback: true });
      return;
    }

    const data = await geminiResponse.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    sendJson(response, 200, {
      text: text || fallbackMessage(todoTitle),
      fallback: !text,
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 200, { text: fallbackMessage(todoTitle), fallback: true });
  }
};
