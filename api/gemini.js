const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-1.5-flash";
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function fallbackTaskGuide(taskTitle) {
  return {
    task_title: taskTitle,
    preparation: {
      items: ["작업에 필요한 자료나 앱을 미리 열기", "방해받지 않을 15분 확보하기"],
      tip: "처음부터 완성하려 하지 말고 바로 시작할 수 있는 가장 작은 단계만 정하세요.",
    },
    nudges: {
      obstacle: "시작 기준을 크게 잡으면 준비만 하다가 미루기 쉽습니다.",
      action_trigger: "지금 타이머 10분을 켜고 첫 단계만 끝내세요.",
    },
  };
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

async function requestGeminiOnce(apiKey, model, prompt) {
  const geminiResponse = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    const retryable = RETRYABLE_STATUS_CODES.has(geminiResponse.status);
    const log = retryable ? console.warn : console.error;
    log("Gemini API unavailable", { model, status: geminiResponse.status, retryable, body: errorText });
    return { text: "", model, status: geminiResponse.status, retryable };
  }

  const data = await geminiResponse.json();
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "", model, status: 200, retryable: false };
}

async function requestGemini(apiKey, model, prompt) {
  const models = [model, FALLBACK_MODEL].filter((item, index, items) => item && items.indexOf(item) === index);
  const attempts = [];
  let lastResult = { text: "", model, status: 0, retryable: false, attempts };

  for (const candidateModel of models) {
    const retryDelays = candidateModel === model ? [0, 800, 1600] : [0];
    for (const [index, delay] of retryDelays.entries()) {
      if (delay > 0) {
        await wait(delay);
      }
      lastResult = await requestGeminiOnce(apiKey, candidateModel, prompt);
      attempts.push({
        model: candidateModel,
        retry: index,
        status: lastResult.status,
        retryable: lastResult.retryable,
        success: Boolean(lastResult.text),
      });
      if (lastResult.text) {
        return { ...lastResult, attempts };
      }
      if (!lastResult.retryable) {
        break;
      }
    }
  }

  return { ...lastResult, attempts };
}

function parseGuide(text, taskTitle) {
  try {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      task_title: String(parsed.task_title || taskTitle),
      preparation: {
        items: Array.isArray(parsed.preparation?.items)
          ? parsed.preparation.items.slice(0, 4).map((item) => String(item)).filter(Boolean)
          : fallbackTaskGuide(taskTitle).preparation.items,
        tip: String(parsed.preparation?.tip || fallbackTaskGuide(taskTitle).preparation.tip),
      },
      nudges: {
        obstacle: String(parsed.nudges?.obstacle || fallbackTaskGuide(taskTitle).nudges.obstacle),
        action_trigger: String(parsed.nudges?.action_trigger || fallbackTaskGuide(taskTitle).nudges.action_trigger),
      },
    };
  } catch {
    return null;
  }
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
  const taskTitle = String(request.body?.task_title || "").trim().slice(0, 120);

  if (!["daily-coach", "task-guide"].includes(type)) {
    sendJson(response, 400, { error: "UNSUPPORTED_TYPE" });
    return;
  }

  if (type === "task-guide" && !taskTitle) {
    sendJson(response, 400, { error: "TASK_TITLE_REQUIRED" });
    return;
  }

  if (!apiKey) {
    if (type === "task-guide") {
      sendJson(response, 200, { guide: fallbackTaskGuide(taskTitle), fallback: true, source: "fallback" });
      return;
    }
    sendJson(response, 200, { text: fallbackCoach(todos), fallback: true, source: "fallback" });
    return;
  }

  try {
    if (type === "task-guide") {
      const prompt = `# 역할
너는 사용자의 생산성을 극대화하는 'AI 투두 어시스턴트'이다. 사용자가 등록한 [할 일 제목] 하나만 보고, 그 일을 미루지 않고 완벽하게 실행할 수 있도록 실질적인 가이드를 제공해야 한다.

# 할 일 제목
${JSON.stringify(taskTitle)}

# 지시 사항
1. [준비물 및 참고 자료 선제시]:
- 해당 일을 시작하기 전에 반드시 챙겨야 할 물건이나 미리 알고 있으면 좋은 구체적인 꿀팁/정보를 제공하라.
- 뜬구름 잡는 소리가 아닌, 당장 손에 쥘 수 있거나 검색할 수 있는 구체적인 내용이어야 한다.

2. [예상되는 장애물 경고 및 동기부여]:
- 인간이 이 일을 하려고 할 때 왜 미루게 되는지, 중간에 어떤 방해 요소가 생기는지 심리적/물리적 장애물을 정확히 짚어라.
- 그 장애물을 즉시 차단할 수 있는 행동 지침을 강력하고 명확하게 한 문장으로 제시하라.

# 출력 형식
반드시 다음 JSON 구조만 응답하라. 다른 부연 설명이나 텍스트는 절대로 포함하지 마라.
{
  "task_title": ${JSON.stringify(taskTitle)},
  "preparation": {
    "items": ["준비물/참고자료 항목 1", "준비물/참고자료 항목 2"],
    "tip": "미리 알면 좋은 핵심 꿀팁 정보"
  },
  "nudges": {
    "obstacle": "사용자가 겪을 확률이 높은 구체적인 방해 요소나 미루는 이유",
    "action_trigger": "장애물을 깨부수고 당장 행동하게 만드는 한 문장 가이드"
      }
}`;
      const result = await requestGemini(apiKey, model, prompt);
      const parsedGuide = parseGuide(result.text, taskTitle);
      const guide = parsedGuide || fallbackTaskGuide(taskTitle);
      sendJson(response, 200, {
        guide,
        fallback: !parsedGuide,
        source: parsedGuide ? "gemini" : "fallback",
        model: parsedGuide ? result.model : null,
        status: result.status,
        attempts: result.attempts,
      });
      return;
    }

    const prompt = `다음 할 일 목록을 보고 오늘의 할 일 제안을 한국어로 한 문장만 작성해줘.
조건:
- 방어기제처럼 들리는 말투는 피하기
- 명령하거나 압박하지 않기
- 가볍고 담백한 말투
- 실행 제안 1개와 짧은 격려를 자연스럽게 이어 붙이기
- 65자 안팎
할 일 목록:
${JSON.stringify(todos)}`;
    const result = await requestGemini(apiKey, model, prompt);
    sendJson(response, 200, {
      text: result.text || fallbackCoach(todos),
      fallback: !result.text,
      source: result.text ? "gemini" : "fallback",
      model: result.text ? result.model : null,
      status: result.status,
      attempts: result.attempts,
    });
  } catch (error) {
    console.error(error);
    if (type === "task-guide") {
      sendJson(response, 200, { guide: fallbackTaskGuide(taskTitle), fallback: true, source: "fallback" });
      return;
    }
    sendJson(response, 200, { text: fallbackCoach(todos), fallback: true, source: "fallback" });
  }
};
