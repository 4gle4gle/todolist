import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBbFev0N1eTUho_4d8XXsraORwGzQI1fIE",
  authDomain: "todolist-48036.firebaseapp.com",
  projectId: "todolist-48036",
  storageBucket: "todolist-48036.firebasestorage.app",
  messagingSenderId: "846233876514",
  appId: "1:846233876514:web:74202d88724671de27727b",
  measurementId: "G-FS5TMK6GYX",
};

const repeatLabels = {
  none: "반복 없음",
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
};

const defaultData = {
  currentListName: "기본",
  lists: [
    {
      name: "기본",
      todos: [],
    },
  ],
};

let state = structuredClone(defaultData);
let auth = null;
let db = null;
let currentUser = null;
let isSaving = false;

const elements = {
  authUser: document.querySelector("#auth-user"),
  userAvatar: document.querySelector("#user-avatar"),
  userName: document.querySelector("#user-name"),
  userEmail: document.querySelector("#user-email"),
  authMessage: document.querySelector("#auth-message"),
  loginButton: document.querySelector("#login-button"),
  logoutButton: document.querySelector("#logout-button"),
  listForm: document.querySelector("#list-form"),
  listName: document.querySelector("#list-name"),
  listNav: document.querySelector("#list-nav"),
  currentListTitle: document.querySelector("#current-list-title"),
  taskForm: document.querySelector("#task-form"),
  formTitle: document.querySelector("#form-title"),
  editingId: document.querySelector("#editing-id"),
  taskTitle: document.querySelector("#task-title"),
  taskDescription: document.querySelector("#task-description"),
  taskDue: document.querySelector("#task-due"),
  taskRepeat: document.querySelector("#task-repeat"),
  cancelEdit: document.querySelector("#cancel-edit"),
  tasks: document.querySelector("#tasks"),
  taskTemplate: document.querySelector("#task-template"),
  filterSelect: document.querySelector("#filter-select"),
  progressRing: document.querySelector("#progress-ring"),
  progressValue: document.querySelector("#progress-value"),
  progressCopy: document.querySelector("#progress-copy"),
  totalCount: document.querySelector("#total-count"),
  activeCount: document.querySelector("#active-count"),
  overdueCount: document.querySelector("#overdue-count"),
  dueChart: document.querySelector("#due-chart"),
  visualSummary: document.querySelector("#visual-summary"),
  listProgress: document.querySelector("#list-progress"),
  seedButton: document.querySelector("#seed-button"),
  resetButton: document.querySelector("#reset-button"),
};

elements.loginButton.addEventListener("click", async () => {
  if (!auth) {
    setAuthMessage("Firebase 설정을 먼저 입력하세요.");
    return;
  }

  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    setAuthMessage("Google 로그인에 실패했습니다. Firebase 설정과 허용 도메인을 확인하세요.");
  }
});

elements.logoutButton.addEventListener("click", async () => {
  if (!auth) {
    return;
  }
  await signOut(auth);
});

elements.listForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = elements.listName.value.trim();
  if (!name || state.lists.some((list) => list.name === name)) {
    return;
  }

  state.lists.push({ name, todos: [] });
  state.currentListName = name;
  elements.listName.value = "";
  await saveAndRender();
});

elements.taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = elements.taskTitle.value.trim();
  if (!title) {
    return;
  }

  const list = currentList();
  const editingId = Number(elements.editingId.value);
  const payload = {
    title,
    description: elements.taskDescription.value.trim(),
    dueAt: elements.taskDue.value,
    repeat: elements.taskRepeat.value,
  };

  if (editingId) {
    const todo = list.todos.find((item) => item.id === editingId);
    Object.assign(todo, payload);
  } else {
    list.todos.push({
      id: nextTodoId(list),
      completed: false,
      subtasks: [],
      ...payload,
    });
  }

  resetTaskForm();
  await saveAndRender();
});

elements.cancelEdit.addEventListener("click", resetTaskForm);
elements.filterSelect.addEventListener("change", render);
elements.seedButton.addEventListener("click", seedData);
elements.resetButton.addEventListener("click", async () => {
  if (!confirm("저장된 웹 데이터를 초기화할까요?")) {
    return;
  }
  state = structuredClone(defaultData);
  await saveAndRender();
});

function initializeFirebase() {
  if (!isFirebaseConfigured()) {
    setAuthMessage("app.js의 firebaseConfig 값을 Firebase Console 설정으로 교체하세요.");
    setAppEnabled(false);
    render();
    return;
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  setAppEnabled(false);
  setAuthMessage("로그인 상태를 확인하는 중입니다.");

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) {
      state = structuredClone(defaultData);
      renderSignedOut();
      render();
      return;
    }

    renderSignedIn(user);
    setAuthMessage("할 일 목록을 불러오는 중입니다.");
    state = await loadUserState(user.uid);
    setAuthMessage("Google 계정에 저장됩니다.");
    setAppEnabled(true);
    render();
  });
}

function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((value) => value && !value.startsWith("YOUR_"));
}

async function loadUserState(uid) {
  try {
    const snapshot = await getDoc(userTodoDoc(uid));
    if (!snapshot.exists()) {
      return structuredClone(defaultData);
    }
    return normalizeState(snapshot.data());
  } catch (error) {
    console.error(error);
    setAuthMessage("데이터를 불러오지 못했습니다. 네트워크와 Firestore 권한을 확인하세요.");
    return structuredClone(defaultData);
  }
}

async function saveAndRender() {
  render();
  if (!currentUser || !db) {
    setAuthMessage("로그인 후 저장할 수 있습니다.");
    return;
  }

  try {
    isSaving = true;
    setAuthMessage("저장 중입니다.");
    await setDoc(userTodoDoc(currentUser.uid), {
      currentListName: state.currentListName,
      lists: state.lists,
      updatedAt: serverTimestamp(),
    });
    setAuthMessage("저장되었습니다.");
  } catch (error) {
    console.error(error);
    setAuthMessage("저장에 실패했습니다. Firestore 권한과 네트워크를 확인하세요.");
  } finally {
    isSaving = false;
  }
}

function userTodoDoc(uid) {
  return doc(db, "users", uid, "todoData", "main");
}

function normalizeState(data) {
  if (!data || !Array.isArray(data.lists) || data.lists.length === 0) {
    return structuredClone(defaultData);
  }

  const lists = data.lists.map((list) => ({
    name: String(list.name || "기본"),
    todos: Array.isArray(list.todos)
      ? list.todos.map((todo) => ({
          id: Number(todo.id),
          title: String(todo.title || ""),
          description: String(todo.description || ""),
          dueAt: String(todo.dueAt || ""),
          repeat: repeatLabels[todo.repeat] ? todo.repeat : "none",
          completed: Boolean(todo.completed),
          subtasks: Array.isArray(todo.subtasks)
            ? todo.subtasks.map((subtask) => ({
                id: Number(subtask.id),
                title: String(subtask.title || ""),
                completed: Boolean(subtask.completed),
              }))
            : [],
        }))
      : [],
  }));

  const currentListName = lists.some((list) => list.name === data.currentListName)
    ? data.currentListName
    : lists[0].name;

  return { currentListName, lists };
}

function setAppEnabled(enabled) {
  [
    elements.listName,
    elements.listForm.querySelector("button"),
    elements.taskTitle,
    elements.taskDescription,
    elements.taskDue,
    elements.taskRepeat,
    elements.taskForm.querySelector(".primary-button"),
    elements.cancelEdit,
    elements.filterSelect,
    elements.seedButton,
    elements.resetButton,
  ].forEach((element) => {
    element.disabled = !enabled;
  });
}

function renderSignedIn(user) {
  const displayName = user.displayName || "Google 사용자";
  elements.userAvatar.textContent = displayName.charAt(0).toUpperCase();
  elements.userName.textContent = displayName;
  elements.userEmail.textContent = user.email || "이메일 정보 없음";
  elements.loginButton.hidden = true;
  elements.logoutButton.hidden = false;
  setAppEnabled(false);
}

function renderSignedOut() {
  elements.userAvatar.textContent = "?";
  elements.userName.textContent = "로그인이 필요합니다";
  elements.userEmail.textContent = "Google 계정으로 동기화";
  elements.loginButton.hidden = false;
  elements.logoutButton.hidden = true;
  setAuthMessage("로그인하면 계정별 할 일 목록을 저장하고 불러옵니다.");
  setAppEnabled(false);
}

function setAuthMessage(message) {
  elements.authMessage.textContent = message;
}

function currentList() {
  return state.lists.find((list) => list.name === state.currentListName) || state.lists[0];
}

function nextTodoId(list) {
  return Math.max(0, ...list.todos.map((todo) => todo.id)) + 1;
}

function nextSubtaskId(todo) {
  return Math.max(0, ...todo.subtasks.map((subtask) => subtask.id)) + 1;
}

function render() {
  renderLists();
  renderMetrics();
  renderCharts();
  renderTasks();
}

function renderLists() {
  elements.currentListTitle.textContent = currentList().name;
  elements.listNav.replaceChildren();

  state.lists.forEach((list) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = list.name === currentList().name ? "active" : "";
    button.innerHTML = `<strong>${escapeHtml(list.name)}</strong><span>${list.todos.length}</span>`;
    button.addEventListener("click", async () => {
      state.currentListName = list.name;
      await saveAndRender();
    });
    elements.listNav.append(button);
  });
}

function renderMetrics() {
  const todos = currentList().todos;
  const total = todos.length;
  const completed = todos.filter((todo) => todo.completed).length;
  const active = total - completed;
  const overdue = todos.filter(isOverdue).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  elements.progressRing.style.setProperty("--progress", `${percent}%`);
  elements.progressValue.textContent = `${percent}%`;
  elements.progressCopy.textContent = total ? `${completed}개 완료, ${active}개 진행중` : "진행할 작업이 없습니다.";
  elements.totalCount.textContent = total;
  elements.activeCount.textContent = active;
  elements.overdueCount.textContent = overdue;
}

function renderCharts() {
  const todos = currentList().todos;
  const buckets = [
    { label: "오늘", value: todos.filter(isDueToday).length },
    { label: "예정", value: todos.filter(isUpcoming).length },
    { label: "마감 없음", value: todos.filter((todo) => !todo.dueAt).length },
    { label: "기한 지남", value: todos.filter(isOverdue).length },
  ];
  const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.value));

  elements.dueChart.replaceChildren(
    ...buckets.map((bucket) => {
      const item = document.createElement("div");
      item.className = "bar-item";
      const height = Math.max(6, Math.round((bucket.value / maxValue) * 100));
      item.innerHTML = `
        <div class="bar-track"><div class="bar-fill" style="height: ${height}%"></div></div>
        <div class="bar-value">${bucket.value}</div>
        <div class="bar-label">${bucket.label}</div>
      `;
      return item;
    }),
  );

  elements.visualSummary.textContent = todos.length
    ? `${currentList().name} 목록의 마감 상태입니다.`
    : "작업을 추가하면 분포가 표시됩니다.";

  elements.listProgress.replaceChildren(
    ...state.lists.map((list) => {
      const total = list.todos.length;
      const completed = list.todos.filter((todo) => todo.completed).length;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      const row = document.createElement("div");
      row.className = "progress-row";
      row.innerHTML = `
        <span>${escapeHtml(list.name)}</span>
        <div class="progress-track"><div class="progress-fill" style="width: ${percent}%"></div></div>
        <strong>${percent}%</strong>
      `;
      return row;
    }),
  );
}

function renderTasks() {
  const filteredTodos = filterTodos(currentList().todos);
  elements.tasks.replaceChildren();

  if (filteredTodos.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "표시할 작업이 없습니다.";
    elements.tasks.append(empty);
    return;
  }

  filteredTodos.forEach((todo) => {
    const item = elements.taskTemplate.content.firstElementChild.cloneNode(true);
    item.classList.toggle("completed", todo.completed);
    item.querySelector("h4").textContent = todo.title;
    item.querySelector(".description").textContent = todo.description;
    item.querySelector(".description").hidden = !todo.description;

    item.querySelector(".check-button").addEventListener("click", () => toggleTodo(todo.id));
    renderTaskMeta(item.querySelector(".task-meta"), todo);
    renderSubtasks(item.querySelector(".subtasks"), todo);

    item.querySelector(".subtask-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = event.currentTarget.querySelector("input");
      const title = input.value.trim();
      if (!title) {
        return;
      }
      todo.subtasks.push({ id: nextSubtaskId(todo), title, completed: false });
      input.value = "";
      await saveAndRender();
    });

    item.querySelector('[data-action="edit"]').addEventListener("click", () => startEdit(todo));
    item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteTodo(todo.id));

    elements.tasks.append(item);
  });
}

function renderTaskMeta(container, todo) {
  container.replaceChildren();
  if (todo.dueAt) {
    const dueBadge = createBadge(formatDate(todo.dueAt), isOverdue(todo) ? "overdue" : "");
    container.append(dueBadge);
  }
  if (todo.repeat !== "none") {
    container.append(createBadge(repeatLabels[todo.repeat]));
  }
  if (todo.subtasks.length > 0) {
    const completed = todo.subtasks.filter((subtask) => subtask.completed).length;
    container.append(createBadge(`하위 ${completed}/${todo.subtasks.length}`));
  }
}

function renderSubtasks(container, todo) {
  container.replaceChildren();
  todo.subtasks.forEach((subtask) => {
    const row = document.createElement("div");
    row.className = `subtask ${subtask.completed ? "completed" : ""}`;
    row.innerHTML = `
      <label>
        <input type="checkbox" ${subtask.completed ? "checked" : ""} />
        <span>${escapeHtml(subtask.title)}</span>
      </label>
      <button type="button">삭제</button>
    `;
    row.querySelector("input").addEventListener("change", () => {
      subtask.completed = !subtask.completed;
      saveAndRender();
    });
    row.querySelector("button").addEventListener("click", () => {
      todo.subtasks = todo.subtasks.filter((item) => item.id !== subtask.id);
      saveAndRender();
    });
    container.append(row);
  });
}

function createBadge(text, variant = "") {
  const badge = document.createElement("span");
  badge.className = `badge ${variant}`.trim();
  badge.textContent = text;
  return badge;
}

function filterTodos(todos) {
  const filter = elements.filterSelect.value;
  if (filter === "active") {
    return todos.filter((todo) => !todo.completed);
  }
  if (filter === "completed") {
    return todos.filter((todo) => todo.completed);
  }
  if (filter === "overdue") {
    return todos.filter(isOverdue);
  }
  return todos;
}

async function toggleTodo(id) {
  const todo = currentList().todos.find((item) => item.id === id);
  if (!todo) {
    return;
  }

  if (!todo.completed && todo.repeat !== "none" && todo.dueAt) {
    todo.dueAt = nextDueDate(todo.dueAt, todo.repeat);
  } else {
    todo.completed = !todo.completed;
  }
  await saveAndRender();
}

function startEdit(todo) {
  elements.formTitle.textContent = "할 일 수정";
  elements.editingId.value = todo.id;
  elements.taskTitle.value = todo.title;
  elements.taskDescription.value = todo.description;
  elements.taskDue.value = todo.dueAt;
  elements.taskRepeat.value = todo.repeat;
  elements.taskTitle.focus();
}

async function deleteTodo(id) {
  const list = currentList();
  list.todos = list.todos.filter((todo) => todo.id !== id);
  await saveAndRender();
}

function resetTaskForm() {
  elements.formTitle.textContent = "할 일 추가";
  elements.editingId.value = "";
  elements.taskForm.reset();
}

function isOverdue(todo) {
  return Boolean(todo.dueAt) && !todo.completed && new Date(todo.dueAt) < new Date();
}

function isDueToday(todo) {
  if (!todo.dueAt || todo.completed) {
    return false;
  }
  const due = new Date(todo.dueAt);
  const now = new Date();
  return due.toDateString() === now.toDateString();
}

function isUpcoming(todo) {
  if (!todo.dueAt || todo.completed || isOverdue(todo) || isDueToday(todo)) {
    return false;
  }
  return new Date(todo.dueAt) > new Date();
}

function nextDueDate(value, repeat) {
  const date = new Date(value);
  if (repeat === "daily") {
    date.setDate(date.getDate() + 1);
  } else if (repeat === "weekly") {
    date.setDate(date.getDate() + 7);
  } else if (repeat === "monthly") {
    date.setMonth(date.getMonth() + 1);
  }
  return toDatetimeLocalValue(date);
}

function toDatetimeLocalValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDate(value) {
  return value.replace("T", " ");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function seedData() {
  const now = new Date();
  const today = toDatetimeLocalValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0));
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 7);

  state = {
    currentListName: "학교",
    lists: [
      {
        name: "학교",
        todos: [
          {
            id: 1,
            title: "팀 프로젝트 화면 설계",
            description: "웹 대시보드 구성 정리",
            dueAt: today,
            repeat: "none",
            completed: false,
            subtasks: [
              { id: 1, title: "기능 목록 정리", completed: true },
              { id: 2, title: "시각화 영역 확인", completed: false },
            ],
          },
          {
            id: 2,
            title: "주간 회고 작성",
            description: "",
            dueAt: toDatetimeLocalValue(nextWeek),
            repeat: "weekly",
            completed: false,
            subtasks: [],
          },
        ],
      },
      {
        name: "개인",
        todos: [
          {
            id: 1,
            title: "운동",
            description: "30분 걷기",
            dueAt: "",
            repeat: "daily",
            completed: true,
            subtasks: [],
          },
        ],
      },
    ],
  };
  resetTaskForm();
  await saveAndRender();
}

initializeFirebase();
