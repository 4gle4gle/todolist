const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";

function sendJson(response, statusCode, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(statusCode).json(body);
}

function fallbackCoach(todos) {
  const activeCount = todos.filter((todo) => !todo.completed).length;
  const dueCount = todos.filter((todo) => todo.dueAt && !todo.completed).length;
  if (activeCount === 0) {
    return "오늘은 꽤 정리된 상태예요. 작은 목표 하나만 더해도 괜찮아요.";
  }
  if (dueCount > 0) {
    return `마감 있는 일 ${dueCount}개부터 가볍게 보면 좋아요. 하나씩 해도 충분합니다.`;
  }
  return `진행 중인 일 ${activeCount}개 중 쉬운 것 하나만 먼저 잡아봐요. 지금 흐름 괜찮아요.`;
}

function compactTodos(todos) {
  return todos.slice(0, 20).map((todo) => ({
    title: String(todo.title || "").slice(0, 80),
    dueAt: String(todo.dueAt || ""),
    completed: Boolean(todo.completed),
    starred: Boolean(todo.starred),
    subtaskCount: Array.isArray(todo.subtasks) ? todo.subtasks.length : 0,
  }));
}

async function requestGemini(apiKey, model, prompt) {
  const geminiResponse = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error("Gemini API error", geminiResponse.status, errorText);
    return "";
  }

  const data = await geminiResponse.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const type = String(request.body?.type || "daily-coach");
  const todos = Array.isArray(request.body?.todos) ? compactTodos(request.body.todos) : [];

  if (type !== "daily-coach") {
    sendJson(response, 400, { error: "UNSUPPORTED_TYPE" });
    return;
  }

  if (!apiKey) {
    sendJson(response, 200, { text: fallbackCoach(todos), fallback: true });
    return;
  }

  try {
    const prompt = `다음 할 일 목록을 보고 오늘의 할 일 제안을 한국어로 한 문장만 작성해줘.
조건:
- 방어기제처럼 들리는 말투는 피하기
- 명령하거나 압박하지 않기
- 가볍고 담백한 말투
- 실행 제안 1개와 짧은 격려를 자연스럽게 이어 붙이기
- 65자 안팎
할 일 목록:
${JSON.stringify(todos)}`;
    const text = await requestGemini(apiKey, model, prompt);
    sendJson(response, 200, { text: text || fallbackCoach(todos), fallback: !text });
  } catch (error) {
    console.error(error);
    sendJson(response, 200, { text: fallbackCoach(todos), fallback: true });
  }
};
