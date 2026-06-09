const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";

function sendJson(response, statusCode, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(statusCode).json(body);
}

function fallbackMessage(todoTitle) {
  return `"${todoTitle}" 작업을 시작했어요. 작은 시작이 큰 변화를 만듭니다.`;
}

function fallbackCoach(todos) {
  const activeCount = todos.filter((todo) => !todo.completed).length;
  const dueCount = todos.filter((todo) => todo.dueAt && !todo.completed).length;
  if (activeCount === 0) {
    return "오늘은 정리된 상태예요. 새 목표를 하나만 가볍게 정해보세요.";
  }
  if (dueCount > 0) {
    return `마감 있는 일 ${dueCount}개를 먼저 처리하고, 남은 일은 짧게 나눠 진행해보세요.`;
  }
  return `진행 중인 일 ${activeCount}개 중 가장 쉬운 것 하나부터 끝내보세요.`;
}

function fallbackSubtasks(todoTitle) {
  return [`${todoTitle} 준비하기`, `${todoTitle} 진행하기`, `${todoTitle} 마무리하기`];
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

function parseSubtasks(text, todoTitle) {
  const items = text
    .split(/\r?\n|,/)
    .map((item) => item.replace(/^[\s\d.)\-•]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
  return items.length > 0 ? items : fallbackSubtasks(todoTitle);
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
  const type = String(request.body?.type || "motivation");
  const todoTitle = String(request.body?.todoTitle || "").trim().slice(0, 120);
  const todos = Array.isArray(request.body?.todos) ? compactTodos(request.body.todos) : [];

  if ((type === "motivation" || type === "subtasks") && !todoTitle) {
    sendJson(response, 400, { error: "TODO_TITLE_REQUIRED" });
    return;
  }

  if (!apiKey) {
    if (type === "daily-coach") {
      sendJson(response, 200, { text: fallbackCoach(todos), fallback: true });
      return;
    }
    if (type === "subtasks") {
      sendJson(response, 200, { subtasks: fallbackSubtasks(todoTitle), fallback: true });
      return;
    }
    sendJson(response, 200, { text: fallbackMessage(todoTitle), fallback: true });
    return;
  }

  try {
    if (type === "daily-coach") {
      const prompt = `다음 할 일 목록을 보고 오늘의 실행 전략을 한국어 한 문장으로 제안해줘. 55자 안팎, 과장 없이 실용적으로.\n${JSON.stringify(todos)}`;
      const text = await requestGemini(apiKey, model, prompt);
      sendJson(response, 200, { text: text || fallbackCoach(todos), fallback: !text });
      return;
    }

    if (type === "subtasks") {
      const prompt = `할 일 "${todoTitle}"을 실행 가능한 하위 작업 3~5개로 나눠줘. 한국어로 작성하고, 각 줄에 하나씩 제목만 출력해줘.`;
      const text = await requestGemini(apiKey, model, prompt);
      const subtasks = parseSubtasks(text, todoTitle);
      sendJson(response, 200, { subtasks, fallback: !text });
      return;
    }

    const prompt = `할 일 "${todoTitle}"에 맞는 짧은 동기부여 문구를 한국어로 한 문장만 만들어줘. 과장하지 말고 35자 안팎으로 작성해줘.`;
    const text = await requestGemini(apiKey, model, prompt);
    sendJson(response, 200, {
      text: text || fallbackMessage(todoTitle),
      fallback: !text,
    });
  } catch (error) {
    console.error(error);
    if (type === "daily-coach") {
      sendJson(response, 200, { text: fallbackCoach(todos), fallback: true });
      return;
    }
    if (type === "subtasks") {
      sendJson(response, 200, { subtasks: fallbackSubtasks(todoTitle), fallback: true });
      return;
    }
    sendJson(response, 200, { text: fallbackMessage(todoTitle), fallback: true });
  }
};
