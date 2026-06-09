import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
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

const progressCharacters = {
  proud: {
    src: "character-proud.png",
    alt: "뿌듯한 캐릭터",
    label: "뿌듯해요",
  },
  tired: {
    src: "character-tired.png",
    alt: "지친 캐릭터",
    label: "아직 괜찮아요",
  },
  sad: {
    src: "character-sad.png",
    alt: "슬픈 캐릭터",
    label: "조금 늦었어요",
  },
  warning: {
    src: "character-warning.png",
    alt: "경고하는 캐릭터",
    label: "서둘러야 해요",
  },
  panic: {
    src: "character-panic.png",
    alt: "당황한 캐릭터",
    label: "많이 밀렸어요",
  },
  angry: {
    src: "character-angry.png",
    alt: "화난 캐릭터",
    label: "너무 오래 방치됐어요",
  },
};

const DEFAULT_LIST_ICON = "📋";
const LIST_ICONS = [DEFAULT_LIST_ICON, "📌", "💼", "📚", "🛒", "🏠", "💡", "🎯", "❤️", "⭐"];
const LOCAL_STORAGE_KEY = "todo-dashboard-local-cache";
const LOCAL_FEEDBACK_KEY = "todo-dashboard-feedback";
const LOCAL_DEVELOPER_KEY = "todo-dashboard-developer";
const CHARACTER_REFRESH_INTERVAL_MS = 60 * 1000;
const CHARACTER_OVERDUE_GRACE_HOURS = 1;
const DEVELOPER_PASSWORD = "6767";
const GEMINI_ENDPOINT = "/api/gemini";

const defaultData = {
  currentListName: "기본",
  lists: [{ name: "기본", icon: DEFAULT_LIST_ICON, visible: true, sortBy: "manual", todos: [] }],
};

let state = structuredClone(defaultData);
let auth = null;
let db = null;
let currentUser = null;
let activeView = "all";
let activeMenu = null;
let activeListMenu = null;
let profileMenuOpen = false;
let isBoardLoading = false;
const recentlyCompleted = new Set();
const completionTimers = new Map();
const expandedCompletedLists = new Set();
let deletedSnapshot = null;
let undoTimer = null;
let editingTask = null;
let quickAddListName = null;
let feedbackItems = [];
let isFeedbackLoading = false;
let isCurrentDeveloper = false;

const elements = {
  userAvatar: document.querySelector("#user-avatar"),
  userInitial: document.querySelector("#user-initial"),
  authMessage: document.querySelector("#auth-message"),
  loginButton: document.querySelector("#login-button"),
  profileWrap: document.querySelector("#profile-wrap"),
  profileButton: document.querySelector("#profile-button"),
  profileMenu: document.querySelector("#profile-menu"),
  profileName: document.querySelector("#profile-name"),
  profileEmail: document.querySelector("#profile-email"),
  profileSync: document.querySelector("#profile-sync"),
  welcomeMessage: document.querySelector("#welcome-message"),
  logoutButton: document.querySelector("#logout-button"),
  createTaskButton: document.querySelector("#create-task-button"),
  allViewButton: document.querySelector("#all-view-button"),
  starredViewButton: document.querySelector("#starred-view-button"),
  aboutViewButton: document.querySelector("#about-view-button"),
  developerViewButton: document.querySelector("#developer-view-button"),
  listForm: document.querySelector("#list-form"),
  listName: document.querySelector("#list-name"),
  listNav: document.querySelector("#list-nav"),
  boardArea: document.querySelector(".board-area"),
  boardEyebrow: document.querySelector("#board-eyebrow"),
  boardTitle: document.querySelector("#board-title"),
  boardSummary: document.querySelector("#board-summary"),
  aiMotivationText: document.querySelector("#ai-motivation-text"),
  aiCoachButton: document.querySelector("#ai-coach-button"),
  characterStatus: document.querySelector("#character-status"),
  characterMood: document.querySelector("#character-mood"),
  characterCopy: document.querySelector("#character-copy"),
  progressCharacter: document.querySelector("#progress-character"),
  columns: document.querySelector("#columns"),
  undoToast: document.querySelector("#undo-toast"),
  undoMessage: document.querySelector("#undo-message"),
  undoButton: document.querySelector("#undo-button"),
  feedbackModal: document.querySelector("#feedback-modal"),
  feedbackModalForm: document.querySelector("#feedback-modal-form"),
  feedbackModalClose: document.querySelector("#feedback-modal-close"),
  feedbackTitle: document.querySelector("#feedback-title"),
  feedbackContent: document.querySelector("#feedback-content"),
  feedbackSubmitButton: document.querySelector("#feedback-submit-button"),
  taskModal: document.querySelector("#task-modal"),
  taskModalForm: document.querySelector("#task-modal-form"),
  taskModalClose: document.querySelector("#task-modal-close"),
  taskModalTitle: document.querySelector("#task-modal-title"),
  taskModalDate: document.querySelector("#task-modal-date"),
  taskModalTime: document.querySelector("#task-modal-time"),
  taskModalAllDay: document.querySelector("#task-modal-all-day"),
  taskModalRepeat: document.querySelector("#task-modal-repeat"),
  taskModalDescription: document.querySelector("#task-modal-description"),
  taskModalList: document.querySelector("#task-modal-list"),
  taskModalSave: document.querySelector("#task-modal-save"),
};

document.addEventListener("click", (event) => {
  if (!event.target.closest(".menu-wrap") && activeMenu) {
    activeMenu = null;
    render();
  }
  if (!event.target.closest(".list-menu-wrap") && activeListMenu) {
    activeListMenu = null;
    renderBoard();
  }
  if (!event.target.closest(".profile-wrap")) {
    setProfileMenuOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.taskModal.hidden) {
    closeTaskModal();
  }
  if (event.key === "Escape" && !elements.feedbackModal.hidden) {
    closeFeedbackModal();
  }
});

elements.userAvatar.addEventListener("error", () => {
  elements.userAvatar.hidden = true;
  elements.userInitial.hidden = false;
});

elements.loginButton.addEventListener("click", async () => {
  if (!auth) {
    setAuthMessage("Firebase 설정을 먼저 입력하세요.");
    return;
  }

  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    console.error(error);
    setAuthMessage("Google 로그인에 실패했습니다. Firebase 설정과 허용 도메인을 확인하세요.");
  }
});

elements.profileButton.addEventListener("click", () => {
  setProfileMenuOpen(!profileMenuOpen);
});

elements.logoutButton.addEventListener("click", async () => {
  if (auth) {
    await signOut(auth);
  }
});

elements.undoButton.addEventListener("click", undoLastDelete);
elements.feedbackModalClose.addEventListener("click", closeFeedbackModal);
elements.feedbackModal.addEventListener("click", (event) => {
  if (event.target === elements.feedbackModal) {
    closeFeedbackModal();
  }
});
elements.feedbackTitle.addEventListener("input", updateFeedbackSubmitState);
elements.feedbackContent.addEventListener("input", updateFeedbackSubmitState);
elements.feedbackModalForm.addEventListener("submit", submitFeedback);

elements.createTaskButton.addEventListener("click", () => {
  openTaskModal(state.currentListName);
});

elements.taskModalClose.addEventListener("click", closeTaskModal);
elements.taskModal.addEventListener("click", (event) => {
  if (event.target === elements.taskModal) {
    closeTaskModal();
  }
});
elements.taskModalTitle.addEventListener("input", updateTaskModalSaveState);
elements.taskModalAllDay.addEventListener("change", updateTaskModalTimeState);
elements.taskModalForm.addEventListener("submit", saveTaskModal);
elements.aiCoachButton?.addEventListener("click", () => generateDailyCoach());

elements.allViewButton.addEventListener("click", () => {
  activeView = "all";
  render();
});

elements.starredViewButton.addEventListener("click", () => {
  activeView = "starred";
  render();
});

elements.aboutViewButton.addEventListener("click", () => {
  activeView = "about";
  activeMenu = null;
  activeListMenu = null;
  render();
});

elements.developerViewButton.addEventListener("click", async () => {
  activeView = "developer";
  activeMenu = null;
  activeListMenu = null;
  await loadFeedbackItems();
  render();
});

elements.listForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = elements.listName.value.trim();
  if (!name || state.lists.some((list) => list.name === name)) {
    return;
  }

  state.lists.push({ name, icon: DEFAULT_LIST_ICON, visible: true, sortBy: "manual", todos: [] });
  state.currentListName = name;
  activeView = "all";
  elements.listName.value = "";
  await saveAndRender();
});

setInterval(() => {
  if (!isBoardLoading && activeView === "all") {
    renderProgressCharacterStatus(allTodos());
  }
}, CHARACTER_REFRESH_INTERVAL_MS);

function initializeFirebase() {
  if (!isFirebaseConfigured()) {
    state = loadLocalState();
    renderSignedOut("Firebase 설정 전입니다. 현재 데이터는 이 브라우저에만 저장됩니다.");
    setAppEnabled(true);
    render();
    return;
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  isBoardLoading = true;
  setAppEnabled(false);
  setAuthMessage("로그인 상태를 확인하는 중입니다.");
  render();

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) {
      state = loadLocalState();
      feedbackItems = loadLocalFeedback();
      isCurrentDeveloper = false;
      isBoardLoading = false;
      renderSignedOut();
      render();
      return;
    }

    isCurrentDeveloper = await loadDeveloperStatus(user);
    renderSignedIn(user);
    setAuthMessage("할 일 목록을 불러오는 중입니다.");
    state = await loadUserState(user.uid);
    if (isDeveloperUser()) {
      await loadFeedbackItems();
    } else {
      feedbackItems = loadLocalFeedback();
    }
    isBoardLoading = false;
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
    if (snapshot.exists()) {
      const cloudState = normalizeState(snapshot.data());
      const localState = loadLocalState();
      if (hasUserContent(localState) && !statesEqual(localState, cloudState)) {
        const shouldMerge = confirm("이 브라우저의 로컬 캐시를 Google 계정 데이터와 병합할까요?");
        if (shouldMerge) {
          const mergedState = mergeStates(cloudState, localState);
          await setDoc(userTodoDoc(uid), {
            currentListName: mergedState.currentListName,
            lists: mergedState.lists,
            updatedAt: serverTimestamp(),
          });
          setAuthMessage("로컬 캐시를 Google 계정 데이터와 병합했습니다.");
          return mergedState;
        }
      }
      return cloudState;
    }

    const localState = loadLocalState();
    if (hasUserContent(localState)) {
      await setDoc(userTodoDoc(uid), {
        currentListName: localState.currentListName,
        lists: localState.lists,
        updatedAt: serverTimestamp(),
      });
      setAuthMessage("로컬 캐시를 Google 계정에 저장했습니다.");
      return localState;
    }

    return structuredClone(defaultData);
  } catch (error) {
    console.error(error);
    setAuthMessage("데이터를 불러오지 못했습니다. 네트워크와 Firestore 권한을 확인하세요.");
    return loadLocalState();
  }
}

async function saveAndRender() {
  applyConfiguredSorts();
  render();
  if (!currentUser || !db) {
    saveLocalState();
    setAuthMessage("로컬 캐시에 저장되었습니다. 여러 기기 연동과 안정적인 백업은 Google 로그인을 권장합니다.");
    return;
  }

  try {
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
  }
}

function applyConfiguredSorts() {
  state.lists.forEach((list) => {
    if (list.sortBy && list.sortBy !== "manual") {
      sortTodos(list);
    }
  });
}

function userTodoDoc(uid) {
  return doc(db, "users", uid, "todoData", "main");
}

function loadLocalState() {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved ? normalizeState(JSON.parse(saved)) : structuredClone(defaultData);
  } catch {
    return structuredClone(defaultData);
  }
}

function saveLocalState() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
    currentListName: state.currentListName,
    lists: state.lists,
  }));
}

function hasUserContent(data) {
  return Array.isArray(data?.lists) && data.lists.some((list) => list.todos.length > 0 || list.name !== "기본");
}

function statesEqual(left, right) {
  return JSON.stringify({
    currentListName: left.currentListName,
    lists: left.lists,
  }) === JSON.stringify({
    currentListName: right.currentListName,
    lists: right.lists,
  });
}

function mergeStates(cloudState, localState) {
  const merged = structuredClone(cloudState);
  localState.lists.forEach((localList) => {
    let targetList = merged.lists.find((list) => list.name === localList.name);
    if (!targetList) {
      merged.lists.push(structuredClone(localList));
      return;
    }

    targetList.icon = localList.icon;
    targetList.visible = localList.visible;
    const signatures = new Set(targetList.todos.map(todoSignature));
    localList.todos.forEach((localTodo) => {
      if (signatures.has(todoSignature(localTodo))) {
        return;
      }
      targetList.todos.push({
        ...structuredClone(localTodo),
        id: nextTodoId(targetList),
      });
    });
  });
  merged.currentListName = localState.currentListName || merged.currentListName;
  return merged;
}

function todoSignature(todo) {
  return [
    todo.title,
    todo.description,
    todo.dueAt,
    todo.repeat,
    todo.completed,
    todo.starred,
  ].join("\u001f");
}

function normalizeState(data) {
  if (!data || !Array.isArray(data.lists) || data.lists.length === 0) {
    return structuredClone(defaultData);
  }

  const lists = data.lists.map((list) => ({
    name: String(list.name || "기본"),
    icon: LIST_ICONS.includes(list.icon) ? list.icon : DEFAULT_LIST_ICON,
    visible: list.visible !== false,
    sortBy: ["manual", "created", "due", "recent-starred", "title"].includes(list.sortBy) ? list.sortBy : "manual",
    todos: Array.isArray(list.todos)
      ? list.todos.map((todo) => ({
          id: Number(todo.id),
          title: String(todo.title || ""),
          description: String(todo.description || ""),
          dueAt: String(todo.dueAt || ""),
          createdAt: String(todo.createdAt || ""),
          completedAt: String(todo.completedAt || ""),
          repeat: repeatLabels[todo.repeat] ? todo.repeat : "none",
          completed: Boolean(todo.completed),
          starred: Boolean(todo.starred),
          starredAt: String(todo.starredAt || ""),
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
    elements.createTaskButton,
    elements.allViewButton,
    elements.starredViewButton,
    elements.aboutViewButton,
    elements.developerViewButton,
    elements.listName,
    elements.listForm.querySelector("button"),
  ].forEach((element) => {
    element.disabled = !enabled;
  });
}

function renderSignedIn(user) {
  const displayName = user.displayName || "Google 사용자";
  elements.userAvatar.src = user.photoURL || "";
  elements.userAvatar.hidden = !user.photoURL;
  elements.userInitial.textContent = displayName.charAt(0).toUpperCase();
  elements.userInitial.hidden = Boolean(user.photoURL);
  elements.loginButton.hidden = true;
  elements.profileWrap.hidden = false;
  elements.welcomeMessage.hidden = false;
  elements.welcomeMessage.textContent = `${displayName} 님! 안녕하세요.`;
  elements.profileName.textContent = displayName;
  elements.profileEmail.textContent = user.email || "이메일 정보 없음";
  elements.profileButton.setAttribute("aria-label", `${displayName} 계정 옵션 열기`);
  elements.developerViewButton.hidden = !isDeveloperUser();
  if (!isDeveloperUser() && activeView === "developer") {
    activeView = "all";
  }
  setAppEnabled(false);
}

function renderSignedOut(message = "여러 기기 연동과 안정적인 백업을 위해 Google 로그인을 권장합니다.") {
  elements.userAvatar.removeAttribute("src");
  elements.userAvatar.hidden = true;
  elements.userInitial.textContent = "?";
  elements.userInitial.hidden = false;
  elements.loginButton.hidden = false;
  elements.profileWrap.hidden = true;
  elements.welcomeMessage.hidden = true;
  elements.developerViewButton.hidden = true;
  if (activeView === "developer") {
    activeView = "all";
  }
  setProfileMenuOpen(false);
  setAuthMessage(message);
  setAppEnabled(true);
}

function setAuthMessage(message) {
  elements.authMessage.textContent = message;
  elements.profileSync.dataset.status = message.includes("실패") || message.includes("못했습니다")
    ? "error"
    : message.includes("저장 중") || message.includes("불러오는 중") || message.includes("확인하는 중")
      ? "pending"
      : "success";
}

function setProfileMenuOpen(open) {
  profileMenuOpen = open && Boolean(currentUser);
  elements.profileMenu.hidden = !profileMenuOpen;
  elements.profileButton.setAttribute("aria-expanded", String(profileMenuOpen));
  elements.profileButton.setAttribute("aria-label", `${elements.profileName.textContent} 계정 옵션 ${profileMenuOpen ? "닫기" : "열기"}`);
}

function render() {
  renderViewButtons();
  renderLists();
  renderBoard();
}

function renderViewButtons() {
  elements.allViewButton.classList.toggle("active", activeView === "all");
  elements.starredViewButton.classList.toggle("active", activeView === "starred");
  elements.aboutViewButton.classList.toggle("active", activeView === "about");
  elements.developerViewButton.classList.toggle("active", activeView === "developer");
}

function renderLists() {
  elements.listNav.replaceChildren();

  state.lists.forEach((list) => {
    const item = document.createElement("div");
    item.className = "list-nav-item";

    const visibilityCell = document.createElement("label");
    visibilityCell.className = "list-visibility-cell";
    visibilityCell.setAttribute("title", `${list.name} 목록 ${list.visible ? "숨기기" : "표시하기"}`);

    const visibilityToggle = document.createElement("input");
    visibilityToggle.type = "checkbox";
    visibilityToggle.className = "list-visibility-toggle";
    visibilityToggle.checked = list.visible;
    visibilityToggle.setAttribute("aria-label", `${list.name} 목록 ${list.visible ? "숨기기" : "표시하기"}`);
    visibilityToggle.addEventListener("change", async () => {
      await setListVisibility(list, visibilityToggle.checked);
    });
    visibilityCell.append(visibilityToggle);

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = `list-select-button ${list.visible ? "active" : ""}`;
    selectButton.innerHTML = `
      <span class="list-name">
        <span class="list-icon">${escapeHtml(list.icon)}</span>
        <span class="list-title">${escapeHtml(list.name)}</span>
      </span>
      <span class="list-count">${activeTodos(list).length}</span>
    `;
    selectButton.addEventListener("click", async () => {
      activeListMenu = null;
      await setListVisibility(list, !list.visible);
    });

    item.append(visibilityCell, selectButton);
    elements.listNav.append(item);
  });
}

function createListMenu(list) {
  const menu = document.createElement("div");
  menu.className = "list-menu";
  const isDefaultList = list.name === "기본";
  const canMoveFirst = state.lists.findIndex((item) => item.name === list.name) > 0;
  const completedCount = list.todos.filter((todo) => todo.completed).length;
  const oldCount = oldTodos(list).length;
  const sortOptions = [
    ["manual", "내가 정렬한 대로"],
    ["created", "날짜"],
    ["due", "기한"],
    ["recent-starred", "최근 별표표시한 항목"],
    ["title", "제목"],
  ];
  menu.innerHTML = `
    <div class="menu-section">
      <div class="menu-label">정렬 기준</div>
      ${sortOptions.map(([value, label]) => `
        <button class="list-menu-action sort-action ${list.sortBy === value ? "active" : ""}" type="button" data-sort="${value}">
          <span class="sort-check">${list.sortBy === value ? "✓" : ""}</span>
          <span>${label}</span>
        </button>
      `).join("")}
    </div>
    <div class="menu-separator"></div>
    <div class="menu-section">
      <button class="list-menu-action" type="button" data-action="rename">목록 이름 변경</button>
      <button class="list-menu-action" type="button" data-action="delete" ${isDefaultList ? "disabled" : ""}>목록 삭제</button>
      ${isDefaultList ? '<div class="menu-help">기본 목록은 삭제할 수 없음</div>' : ""}
      <button class="list-menu-action" type="button" data-action="move-first" ${canMoveFirst ? "" : "disabled"}>첫 번째 위치로 목록 이동</button>
    </div>
    <div class="menu-separator"></div>
    <div class="menu-section">
      <button class="list-menu-action" type="button" data-action="delete-completed" ${completedCount > 0 ? "" : "disabled"}>완료된 할 일 모두 삭제</button>
      <button class="list-menu-action" type="button" data-action="cleanup-old" ${oldCount > 0 ? "" : "disabled"}>오래된 할 일 정리</button>
    </div>
  `;

  menu.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => sortList(list.name, button.dataset.sort));
  });
  menu.querySelector('[data-action="rename"]').addEventListener("click", () => renameList(list.name));
  menu.querySelector('[data-action="delete"]').addEventListener("click", () => deleteList(list.name));
  menu.querySelector('[data-action="move-first"]').addEventListener("click", () => moveListFirst(list.name));
  menu.querySelector('[data-action="delete-completed"]').addEventListener("click", () => deleteCompletedTodos(list.name));
  menu.querySelector('[data-action="cleanup-old"]').addEventListener("click", () => cleanupOldTodos(list.name));
  menu.querySelectorAll("button:disabled").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });

  return menu;
}

async function setListVisibility(list, visible) {
  list.visible = visible;
  if (visible) {
    state.currentListName = list.name;
    activeView = "all";
  } else if (state.currentListName === list.name) {
    state.currentListName = state.lists.find((item) => item.visible)?.name || list.name;
  }
  await saveAndRender();
}

async function renameList(listName) {
  const list = findList(listName);
  if (!list) {
    return;
  }
  const nextName = prompt("새 목록 이름을 입력하세요.", list.name);
  if (nextName === null) {
    return;
  }
  await updateList(list.name, nextName.trim(), list.icon);
}

async function sortList(listName, sortBy) {
  const list = findList(listName);
  if (!list) {
    return;
  }
  list.sortBy = sortBy;
  if (sortBy !== "manual") {
    sortTodos(list);
  }
  activeListMenu = null;
  await saveAndRender();
}

function sortTodos(list) {
  const dateValue = (value) => {
    const time = value ? new Date(value).getTime() : Number.NaN;
    return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
  };
  const newestValue = (value) => {
    const time = value ? new Date(value).getTime() : Number.NaN;
    return Number.isNaN(time) ? 0 : time;
  };

  if (list.sortBy === "created") {
    list.todos.sort((left, right) => newestValue(right.createdAt) - newestValue(left.createdAt));
  } else if (list.sortBy === "due") {
    list.todos.sort((left, right) => dateValue(left.dueAt) - dateValue(right.dueAt));
  } else if (list.sortBy === "recent-starred") {
    list.todos.sort((left, right) => {
      if (left.starred !== right.starred) {
        return left.starred ? -1 : 1;
      }
      return newestValue(right.starredAt) - newestValue(left.starredAt);
    });
  } else if (list.sortBy === "title") {
    list.todos.sort((left, right) => left.title.localeCompare(right.title, "ko-KR"));
  }
}

async function moveListFirst(listName) {
  const index = state.lists.findIndex((list) => list.name === listName);
  if (index <= 0) {
    return;
  }
  const [list] = state.lists.splice(index, 1);
  state.lists.unshift(list);
  state.currentListName = list.name;
  activeListMenu = null;
  activeView = "all";
  await saveAndRender();
}

async function deleteCompletedTodos(listName) {
  const list = findList(listName);
  if (!list) {
    return;
  }
  const removed = list.todos
    .map((todo, index) => ({ todo: structuredClone(todo), index }))
    .filter(({ todo }) => todo.completed);
  if (removed.length === 0) {
    return;
  }
  await deleteTodoBatch(list, removed, "완료된 할 일을 삭제했습니다.");
}

async function cleanupOldTodos(listName) {
  const list = findList(listName);
  if (!list) {
    return;
  }
  const removed = oldTodos(list).map(({ todo, index }) => ({ todo: structuredClone(todo), index }));
  if (removed.length === 0) {
    return;
  }
  await deleteTodoBatch(list, removed, "오래된 할 일을 정리했습니다.");
}

async function deleteTodoBatch(list, removed, message) {
  clearTimeout(undoTimer);
  deletedSnapshot = {
    type: "tasks",
    listName: list.name,
    todos: removed,
    previousCurrentListName: state.currentListName,
    previousActiveView: activeView,
  };
  const removedIds = new Set(removed.map(({ todo }) => todo.id));
  list.todos = list.todos.filter((todo) => !removedIds.has(todo.id));
  activeListMenu = null;
  activeMenu = null;
  showUndoToast(message);
  await saveAndRender();
}

function renderBoard() {
  elements.boardArea.classList.toggle("starred-view", activeView === "starred" && !isBoardLoading);
  if (isBoardLoading) {
    elements.boardEyebrow.textContent = "데이터 확인 중";
    elements.boardTitle.textContent = "작업 보드";
    elements.boardSummary.textContent = "";
    elements.characterStatus.hidden = true;
    elements.columns.innerHTML = Array.from({ length: 3 }, (_, index) => `
      <article class="column loading-column" aria-label="할 일 목록을 불러오는 중">
        <div class="loading-column-header">
          <span class="loading-shimmer loading-title"></span>
          <span class="loading-shimmer loading-count"></span>
        </div>
        <div class="loading-shimmer loading-add"></div>
        <div class="loading-task-stack">
          ${Array.from({ length: index === 1 ? 4 : 3 }, () => `
            <div class="loading-task-card">
              <span class="loading-shimmer loading-circle"></span>
              <span class="loading-task-lines">
                <span class="loading-shimmer loading-line"></span>
                <span class="loading-shimmer loading-line short"></span>
              </span>
            </div>
          `).join("")}
        </div>
      </article>
    `).join("");
    return;
  }

  if (activeView === "starred") {
    renderStarredBoard();
    return;
  }

  if (activeView === "about") {
    renderAboutBoard();
    return;
  }

  if (activeView === "developer") {
    renderDeveloperBoard();
    return;
  }

  const columns = visibleColumns();
  const total = state.lists.reduce((sum, list) => sum + list.todos.length, 0);

  elements.boardEyebrow.textContent = "모든 할 일";
  elements.boardTitle.textContent = "작업 보드";
  elements.boardSummary.textContent = `전체 ${total}개, 완료 ${completedTodosCount()}개`;
  renderProgressCharacterStatus(allTodos());

  elements.columns.replaceChildren();
  if (columns.length === 0) {
    const empty = document.createElement("div");
    empty.className = "column";
    empty.innerHTML = '<div class="empty-state">표시할 목록이나 작업이 없습니다.</div>';
    elements.columns.append(empty);
    return;
  }

  columns.forEach((list) => {
    const column = document.createElement("article");
    column.className = "column";
    const todos = list.todos;
    const active = todos.filter((todo) => !todo.completed || recentlyCompleted.has(todoKey(list.name, todo.id)));
    const completed = todos.filter((todo) => todo.completed && !recentlyCompleted.has(todoKey(list.name, todo.id)));
    const completedExpanded = expandedCompletedLists.has(list.name);
    column.innerHTML = `
      <div class="column-header">
        <h3><span class="column-icon">${escapeHtml(list.icon)}</span>${escapeHtml(list.name)}</h3>
        <div class="column-actions">
          <span class="column-count">완료됨 ${list.todos.filter((todo) => todo.completed).length}</span>
          <span class="list-menu-wrap">
            <button class="list-edit-button ${activeListMenu === list.name ? "active" : ""}" type="button" aria-label="${escapeHtml(list.name)} 목록 메뉴">⋮</button>
          </span>
        </div>
      </div>
      <button class="add-task-button" type="button">
        <span>+</span>
        할 일 추가
      </button>
      <div class="quick-add-slot"></div>
      <div class="task-list"></div>
      <div class="completed-section" ${completed.length === 0 ? "hidden" : ""}>
        <button class="completed-heading" type="button" aria-expanded="${completedExpanded}">
          <span><span class="completed-chevron">${completedExpanded ? "⌄" : "›"}</span>완료된 항목</span>
          <span>${completed.length}</span>
        </button>
        <div class="completed-list" ${completedExpanded ? "" : "hidden"}></div>
      </div>
    `;

    column.querySelector(".add-task-button").addEventListener("click", () => {
      quickAddListName = list.name;
      renderBoard();
    });
    const menuButton = column.querySelector(".list-edit-button");
    const menuWrap = column.querySelector(".list-menu-wrap");
    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      activeMenu = null;
      activeListMenu = activeListMenu === list.name ? null : list.name;
      renderBoard();
    });
    if (activeListMenu === list.name) {
      menuWrap.append(createListMenu(list));
    }
    if (quickAddListName === list.name) {
      column.querySelector(".quick-add-slot").append(createQuickAddForm(list));
    }
    const taskList = column.querySelector(".task-list");
    if (active.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "진행 중인 할 일이 없습니다.";
      taskList.append(empty);
    } else {
      active.forEach((todo) => taskList.append(createTaskCard(list, todo)));
    }
    const completedList = column.querySelector(".completed-list");
    completed.forEach((todo) => completedList.append(createTaskCard(list, todo)));
    column.querySelector(".completed-heading")?.addEventListener("click", () => {
      if (expandedCompletedLists.has(list.name)) {
        expandedCompletedLists.delete(list.name);
      } else {
        expandedCompletedLists.add(list.name);
      }
      renderBoard();
    });
    elements.columns.append(column);
  });
}

function renderAboutBoard() {
  elements.boardEyebrow.textContent = "소개";
  elements.boardTitle.textContent = "Todo Dashboard";
  elements.boardSummary.textContent = "프로젝트 정보와 업데이트 내역";
  elements.characterStatus.hidden = true;
  elements.columns.replaceChildren();

  const panel = document.createElement("section");
  panel.className = "about-panel";
  panel.innerHTML = `
    <section class="about-hero">
      <div class="about-hero-mark">✓</div>
      <div>
        <h3>할 일</h3>
        <div class="about-badges">
          <span>v1.0.0</span>
          <span>Productivity Beta</span>
        </div>
      </div>
    </section>

    <section class="about-card">
      <div class="about-card-heading">
        <span class="about-icon amber">◎</span>
        <div>
          <h3>프로젝트 취지</h3>
          <p>Vision & Mission</p>
        </div>
      </div>
      <div class="about-highlight">
        여러 목록에 흩어진 할 일을 한 화면에서 정리하고, 중요한 작업과 마감일을 놓치지 않도록 돕는 생산성 관리 앱입니다.
      </div>
      <p class="about-copy">
        학업, 독서, 쇼핑처럼 성격이 다른 일을 목록으로 나누어 관리하고, 중요 표시와 하위 할 일을 통해 큰 작업을 작은 단위로 추적할 수 있습니다.
      </p>
    </section>

    <section class="about-card">
      <div class="about-card-heading">
        <span class="about-icon blue">☻</span>
        <div>
          <h3>만든 사람들</h3>
          <p>Contributors</p>
        </div>
      </div>
      <div class="about-grid">
        ${[
          ["박경학", "Google 계정 로그인 기능"],
          ["고근호", "모바일 인터페이스용 PWA 구현"],
          ["김주원", "진행도별 캐릭터 표정 변화 기능"],
          ["김수현", "Gemini API 연동"],
        ].map(([role, name]) => `
          <article class="about-mini-card">
            <strong>${role}</strong>
            <span>${name}</span>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="about-card">
      <div class="about-card-heading">
        <span class="about-icon green">↻</span>
        <div>
          <h3>업데이트 로그</h3>
          <p>Product History</p>
        </div>
      </div>
      <div class="about-timeline">
        <article>
          <div class="about-version">
            <strong>v1.0.0</strong>
            <span>Latest</span>
          </div>
          <p>목록별 할 일 보기, 중요 표시, 마감일 설정, 하위 할 일 추가 기능을 한 화면에서 사용할 수 있도록 정리했습니다.</p>
        </article>
        <article>
          <div class="about-version">
            <strong>v0.9.0</strong>
          </div>
          <p>왼쪽 목록 탐색과 오른쪽 칼럼형 작업 영역을 분리해 여러 카테고리를 빠르게 훑어볼 수 있게 만들었습니다.</p>
        </article>
      </div>
    </section>

    <section class="about-card">
      <div class="about-card-heading">
        <span class="about-icon teal">!</span>
        <div>
          <h3>공지사항</h3>
          <p>Notices</p>
        </div>
      </div>
      <div class="about-notices">
        <p>현재 화면은 데모 데이터와 사용자 계정 데이터를 함께 지원합니다.</p>
        <p>Google 로그인 후 여러 기기에서 같은 할 일 목록을 불러올 수 있습니다.</p>
      </div>
    </section>

    <section class="about-card">
      <div class="about-card-heading">
        <span class="about-icon purple">§</span>
        <div>
          <h3>오픈소스 라이선스</h3>
          <p>Legal Notices</p>
        </div>
      </div>
      <div class="about-grid">
        ${[
          ["Firebase", "Google 인증과 Firestore 저장"],
          ["Vanilla JavaScript", "앱 상태와 화면 렌더링"],
          ["CSS", "반응형 레이아웃과 시각 스타일"],
          ["Vercel", "정적 웹 배포 환경"],
        ].map(([name, desc]) => `
          <article class="about-mini-card">
            <strong>${name}</strong>
            <span>${desc}</span>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="about-card developer-auth-card">
      <div class="about-card-heading">
        <span class="about-icon slate">⌘</span>
        <div>
          <h3>개발자 인증</h3>
          <p>Developer Access</p>
        </div>
      </div>
      ${currentUser ? isDeveloperUser() ? `
        <div class="developer-auth-status success">
          <strong>개발자 계정으로 인증되었습니다.</strong>
          <span>${escapeHtml(currentUser.email || "이메일 정보 없음")}</span>
        </div>
        <button class="developer-revoke-button" type="button">개발자 권한 해지</button>
      ` : `
        <p class="developer-auth-copy">비밀번호를 입력하면 현재 로그인 계정을 개발자로 등록합니다.</p>
        <form class="developer-auth-form">
          <input type="password" name="password" placeholder="개발자 비밀번호" autocomplete="off" />
          <button type="submit">인증</button>
        </form>
      ` : `
        <div class="developer-auth-status">
          <strong>로그인이 필요합니다.</strong>
          <span>Google 로그인 후 개발자 인증을 진행할 수 있습니다.</span>
        </div>
      `}
    </section>

    <button class="about-feedback-button" type="button">
      <span>⚑</span>
      문제 제보하기
    </button>
    <p class="about-footer">© 2026 Todo Dashboard. All rights reserved.</p>
  `;

  panel.querySelector(".about-feedback-button").addEventListener("click", openFeedbackModal);
  panel.querySelector(".developer-auth-form")?.addEventListener("submit", registerDeveloper);
  panel.querySelector(".developer-revoke-button")?.addEventListener("click", revokeDeveloper);
  elements.columns.append(panel);
}

function renderDeveloperBoard() {
  if (!isDeveloperUser()) {
    activeView = "all";
    render();
    return;
  }

  elements.boardEyebrow.textContent = "개발자";
  elements.boardTitle.textContent = "문제 제보 검토";
  elements.boardSummary.textContent = isFeedbackLoading
    ? "제보를 불러오는 중입니다."
    : `접수된 제보 ${feedbackItems.length}건`;
  elements.characterStatus.hidden = true;
  elements.columns.replaceChildren();

  const panel = document.createElement("section");
  panel.className = "developer-panel";
  panel.innerHTML = `
    <div class="developer-panel-header">
      <div>
        <h3>사용자 제보</h3>
        <p>일반 사용자가 소개 화면에서 제출한 문제를 검토합니다.</p>
      </div>
      <button class="developer-refresh-button" type="button">새로고침</button>
    </div>
    <div class="feedback-list"></div>
  `;
  panel.querySelector(".developer-refresh-button").addEventListener("click", async () => {
    await loadFeedbackItems();
    render();
  });

  const list = panel.querySelector(".feedback-list");
  if (isFeedbackLoading) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "제보를 불러오는 중입니다.";
    list.append(empty);
  } else if (feedbackItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "아직 접수된 제보가 없습니다.";
    list.append(empty);
  } else {
    feedbackItems.forEach((item) => list.append(createFeedbackCard(item)));
  }

  elements.columns.append(panel);
}

function createFeedbackCard(item) {
  const card = document.createElement("article");
  card.className = `feedback-card ${item.status === "reviewed" ? "reviewed" : ""}`;
  card.innerHTML = `
    <div class="feedback-card-header">
      <div>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.reporterName || "익명")} · ${escapeHtml(item.reporterEmail || "이메일 없음")} · ${escapeHtml(formatFeedbackDate(item.createdAt))}</p>
      </div>
      <span>${item.status === "reviewed" ? "검토 완료" : "대기 중"}</span>
    </div>
    <p class="feedback-card-content">${escapeHtml(item.content)}</p>
    <button class="feedback-review-button" type="button" ${item.status === "reviewed" ? "disabled" : ""}>검토 완료</button>
  `;
  card.querySelector(".feedback-review-button").addEventListener("click", () => markFeedbackReviewed(item.id));
  return card;
}

function renderStarredBoard() {
  const starredLists = state.lists
    .map((list) => ({ ...list, todos: list.todos.filter((todo) => todo.starred) }))
    .filter((list) => list.todos.length > 0);
  const starredCount = starredLists.reduce((sum, list) => sum + list.todos.length, 0);

  elements.boardEyebrow.textContent = "중요 표시됨";
  elements.boardTitle.textContent = "중요 표시됨";
  elements.boardSummary.textContent = `중요 작업 ${starredCount}개`;
  elements.characterStatus.hidden = true;
  elements.columns.replaceChildren();

  const panel = document.createElement("section");
  panel.className = "starred-panel";
  panel.innerHTML = `
    <div class="starred-panel-header">
      <h3>중요 표시됨</h3>
    </div>
    <button class="starred-add-button" type="button">
      <span>✓+</span>
      중요 표시된 할 일 추가
    </button>
    <div class="starred-groups"></div>
  `;
  panel.querySelector(".starred-add-button").addEventListener("click", () => {
    openTaskModal(state.currentListName, null, { starred: true });
  });

  const groups = panel.querySelector(".starred-groups");
  if (starredLists.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state starred-empty";
    empty.textContent = "중요 표시된 할 일이 없습니다.";
    groups.append(empty);
  } else {
    starredLists.forEach((list) => {
      const active = list.todos.filter((todo) => !todo.completed || recentlyCompleted.has(todoKey(list.name, todo.id)));
      const completed = list.todos.filter((todo) => todo.completed && !recentlyCompleted.has(todoKey(list.name, todo.id)));
      const completedKey = `starred:${list.name}`;
      const completedExpanded = expandedCompletedLists.has(completedKey);
      const group = document.createElement("section");
      group.className = "starred-group";
      group.innerHTML = `
        <h4>${escapeHtml(list.icon)} ${escapeHtml(list.name)}</h4>
        <div class="starred-task-list"></div>
        <div class="completed-section" ${completed.length === 0 ? "hidden" : ""}>
          <button class="completed-heading" type="button" aria-expanded="${completedExpanded}">
            <span><span class="completed-chevron">${completedExpanded ? "⌄" : "›"}</span>완료된 항목</span>
            <span>${completed.length}</span>
          </button>
          <div class="completed-list" ${completedExpanded ? "" : "hidden"}></div>
        </div>
      `;
      const taskList = group.querySelector(".starred-task-list");
      if (active.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "진행 중인 중요 할 일이 없습니다.";
        taskList.append(empty);
      } else {
        active.forEach((todo) => taskList.append(createTaskCard(list, todo)));
      }
      const completedList = group.querySelector(".completed-list");
      completed.forEach((todo) => completedList.append(createTaskCard(list, todo)));
      group.querySelector(".completed-heading")?.addEventListener("click", () => {
        if (expandedCompletedLists.has(completedKey)) {
          expandedCompletedLists.delete(completedKey);
        } else {
          expandedCompletedLists.add(completedKey);
        }
        renderStarredBoard();
      });
      groups.append(group);
    });
  }

  elements.columns.append(panel);
}

function createTaskCard(list, todo) {
  const card = document.createElement("div");
  const menuId = `${list.name}:${todo.id}`;
  card.className = `task-card ${todo.completed ? "completed" : ""}`;
  card.innerHTML = `
    <div class="task-main">
      <div class="task-left">
        <button class="complete-button" type="button" aria-label="완료 변경"></button>
        <div class="task-text">
          <div class="task-title">${escapeHtml(todo.title)}</div>
          ${todo.description ? `<div class="task-description">${escapeHtml(todo.description)}</div>` : ""}
          <div class="task-meta"></div>
        </div>
      </div>
      <div class="task-actions ${todo.starred ? "has-starred" : ""}">
        <button class="icon-button ${todo.starred ? "starred" : ""}" data-action="star" type="button" title="중요 표시">★</button>
        <span class="menu-wrap">
          <button class="icon-button ${activeMenu === menuId ? "active" : ""}" data-action="menu" type="button" title="옵션">⋮</button>
        </span>
      </div>
    </div>
    <div class="subtasks"></div>
  `;

  card.querySelector(".complete-button").addEventListener("click", () => toggleTodo(list.name, todo.id));
  card.querySelector('[data-action="star"]').addEventListener("click", () => toggleStar(list.name, todo.id));
  card.querySelector('[data-action="menu"]').addEventListener("click", (event) => {
    event.stopPropagation();
    activeListMenu = null;
    activeMenu = activeMenu === menuId ? null : menuId;
    render();
  });

  renderTaskMeta(card.querySelector(".task-meta"), todo);
  renderSubtasks(card.querySelector(".subtasks"), list.name, todo);

  if (activeMenu === menuId) {
    card.querySelector(".menu-wrap").append(createTaskMenu(list, todo));
  }

  return card;
}

function createQuickAddForm(list) {
  const form = document.createElement("form");
  form.className = "quick-add-form";
  form.innerHTML = `
    <div class="quick-add-title-row">
      <span class="quick-add-circle" aria-hidden="true"></span>
      <input class="quick-add-title" type="text" placeholder="제목" autocomplete="off" />
    </div>
    <button class="quick-add-details" type="button">☰ <span>세부정보</span></button>
    <div class="quick-add-options">
      <button type="button" data-action="today">오늘</button>
      <button type="button" data-action="tomorrow">내일</button>
      <label class="quick-add-time" title="시간 설정">
        <span>◷</span>
        <input type="time" />
      </label>
      <button class="quick-add-repeat" type="button" data-action="repeat" title="반복 설정">↔</button>
    </div>
  `;

  const titleInput = form.querySelector(".quick-add-title");
  const timeInput = form.querySelector('input[type="time"]');
  let dueDate = "";
  let repeat = "none";
  let isSavingQuickTask = false;
  let isOpeningDetails = false;

  const setDate = (date, button) => {
    dueDate = toDateInputValue(date);
    form.querySelectorAll('[data-action="today"], [data-action="tomorrow"]').forEach((option) => {
      option.classList.toggle("active", option === button);
    });
  };

  form.querySelector('[data-action="today"]').addEventListener("click", (event) => {
    setDate(new Date(), event.currentTarget);
  });
  form.querySelector('[data-action="tomorrow"]').addEventListener("click", (event) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(tomorrow, event.currentTarget);
  });
  timeInput.addEventListener("change", () => {
    if (!dueDate) {
      setDate(new Date(), form.querySelector('[data-action="today"]'));
    }
  });
  form.querySelector('[data-action="repeat"]').addEventListener("click", (event) => {
    const repeats = ["none", "daily", "weekly", "monthly"];
    repeat = repeats[(repeats.indexOf(repeat) + 1) % repeats.length];
    event.currentTarget.classList.toggle("active", repeat !== "none");
    event.currentTarget.title = repeatLabels[repeat];
  });
  form.querySelector(".quick-add-details").addEventListener("click", () => {
    isOpeningDetails = true;
    const title = titleInput.value.trim();
    quickAddListName = null;
    openTaskModal(list.name, null, {
      title,
      dueAt: dueDate ? `${dueDate}T${timeInput.value || "09:00"}` : "",
      repeat,
    });
  });

  const saveQuickTask = async () => {
    if (isSavingQuickTask) {
      return;
    }
    const title = titleInput.value.trim();
    if (!title) {
      return;
    }
    isSavingQuickTask = true;
    list.todos.push({
      id: nextTodoId(list),
      title,
      description: "",
      dueAt: dueDate ? `${dueDate}T${timeInput.value || "09:00"}` : "",
      createdAt: toDatetimeLocalValue(new Date()),
      repeat,
      completed: false,
      completedAt: "",
      starred: false,
      starredAt: "",
      subtasks: [],
    });
    quickAddListName = null;
    state.currentListName = list.name;
    activeView = "all";
    await saveAndRender();
    await generateMotivation(title);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveQuickTask();
  });

  form.addEventListener("focusout", (event) => {
    if (isOpeningDetails) {
      return;
    }
    const nextTarget = event.relatedTarget;
    if (nextTarget && form.contains(nextTarget)) {
      return;
    }
    queueMicrotask(() => {
      if (!form.contains(document.activeElement)) {
        saveQuickTask();
      }
    });
  });

  queueMicrotask(() => titleInput.focus());
  return form;
}

function createTaskMenu(list, todo) {
  const menu = document.createElement("div");
  menu.className = "task-menu";
  menu.innerHTML = `
    <label>
      마감일 설정
      <input type="date" value="${todo.dueAt ? todo.dueAt.slice(0, 10) : ""}" />
    </label>
    <button type="button" data-action="subtask">하위 할 일 추가</button>
    <button type="button" data-action="ai-subtasks">AI 하위 작업 추천</button>
    <button type="button" data-action="edit">내용 수정</button>
    <button type="button" data-action="delete">삭제</button>
    <div class="menu-label">이동할 목록...</div>
  `;

  menu.querySelector("input").addEventListener("change", async (event) => {
    todo.dueAt = event.target.value ? `${event.target.value}T09:00` : "";
    activeMenu = null;
    await saveAndRender();
  });
  menu.querySelector('[data-action="subtask"]').addEventListener("click", () => addSubtask(list.name, todo.id));
  menu.querySelector('[data-action="ai-subtasks"]').addEventListener("click", () => suggestSubtasks(list.name, todo.id));
  menu.querySelector('[data-action="edit"]').addEventListener("click", () => editTask(list.name, todo.id));
  menu.querySelector('[data-action="delete"]').addEventListener("click", () => deleteTask(list.name, todo.id));

  state.lists
    .filter((target) => target.name !== list.name)
    .forEach((target) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = target.name;
      button.addEventListener("click", () => moveTask(list.name, target.name, todo.id));
      menu.append(button);
    });

  return menu;
}

function renderTaskMeta(container, todo) {
  container.replaceChildren();
  if (todo.dueAt) {
    container.append(createBadge(`📅 ${formatDate(todo.dueAt)}`, isOverdue(todo) ? "overdue" : ""));
  }
  if (todo.repeat !== "none") {
    container.append(createBadge(repeatLabels[todo.repeat]));
  }
  if (todo.subtasks.length > 0) {
    const completed = todo.subtasks.filter((subtask) => subtask.completed).length;
    container.append(createBadge(`하위 ${completed}/${todo.subtasks.length}`));
  }
}

function renderSubtasks(container, listName, todo) {
  container.replaceChildren();
  todo.subtasks.forEach((subtask) => {
    const row = document.createElement("label");
    row.className = `subtask ${subtask.completed ? "completed" : ""}`;
    row.innerHTML = `
      <input type="checkbox" ${subtask.completed ? "checked" : ""} />
      <span>${escapeHtml(subtask.title)}</span>
    `;
    row.querySelector("input").addEventListener("change", async () => {
      subtask.completed = !subtask.completed;
      await saveAndRender();
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

function visibleColumns() {
  const visibleLists = state.lists.filter((list) => list.visible);
  if (activeView === "starred") {
    return visibleLists
      .map((list) => ({ ...list, todos: list.todos.filter((todo) => todo.starred) }))
      .filter((list) => list.todos.length > 0);
  }
  return visibleLists;
}

function currentList() {
  return state.lists.find((list) => list.name === state.currentListName) || state.lists[0];
}

function activeTodos(list) {
  return list.todos.filter((todo) => !todo.completed);
}

function allTodos() {
  return state.lists.flatMap((list) => list.todos);
}

function oldTodos(list) {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - 30);
  return list.todos
    .map((todo, index) => ({ todo, index }))
    .filter(({ todo }) => {
      const baseDate = todo.completedAt || todo.dueAt || todo.createdAt;
      if (!baseDate) {
        return false;
      }
      const date = new Date(baseDate);
      return !Number.isNaN(date.getTime()) && date < threshold;
    });
}

function completedTodosCount() {
  return state.lists.reduce((sum, list) => sum + list.todos.filter((todo) => todo.completed).length, 0);
}

function renderProgressCharacterStatus(todos) {
  const status = getProgressCharacterStatus(todos);
  const character = progressCharacters[status.mood];
  elements.characterStatus.hidden = false;
  elements.characterStatus.dataset.mood = status.mood;
  elements.characterMood.textContent = character.label;
  elements.characterCopy.textContent = status.copy;
  elements.progressCharacter.src = character.src;
  elements.progressCharacter.alt = character.alt;
}

function getProgressCharacterStatus(todos, now = new Date()) {
  const total = todos.length;
  const active = todos.filter((todo) => !todo.completed);

  if (total === 0) {
    return {
      mood: "tired",
      copy: "아직 할 일이 없어요. 새 작업을 만들면 표정이 바뀝니다.",
    };
  }

  if (active.length === 0) {
    return {
      mood: "proud",
      copy: "모든 할 일을 완료했어요.",
    };
  }

  const characterOverdueTodos = active.filter((todo) => isCharacterOverdue(todo, now));
  if (characterOverdueTodos.length === 0) {
    const createdTodayCount = active.filter((todo) => isCreatedToday(todo, now)).length;
    return {
      mood: "tired",
      copy: createdTodayCount > 0
        ? `오늘 추가한 할 일 ${createdTodayCount}개가 있어요.`
        : `진행 중 ${active.length}개가 아직 마감 전이거나 유예 시간 안입니다.`,
    };
  }

  const longestOverdueHours = Math.max(
    ...characterOverdueTodos.map((todo) => hoursSinceDue(todo.dueAt, now)),
  );
  const mood = getOverdueMood(longestOverdueHours);

  return {
    mood,
    copy: `기한 지난 할 일 ${characterOverdueTodos.length}개, 최대 ${formatOverdueDuration(longestOverdueHours)} 지났어요.`,
  };
}

function getOverdueMood(hours) {
  if (hours >= 72) {
    return "angry";
  }
  if (hours >= 24) {
    return "panic";
  }
  if (hours >= 6) {
    return "warning";
  }
  if (hours >= 1) {
    return "sad";
  }
  return "tired";
}

function hoursSinceDue(value, now = new Date()) {
  return Math.max(0, (now - new Date(value)) / (1000 * 60 * 60));
}

function formatOverdueDuration(hours) {
  if (hours >= 24) {
    return `${Math.floor(hours / 24)}일`;
  }
  if (hours >= 1) {
    return `${Math.floor(hours)}시간`;
  }
  return `${Math.max(1, Math.floor(hours * 60))}분`;
}

function findList(listName) {
  return state.lists.find((list) => list.name === listName);
}

function findTodo(listName, todoId) {
  return findList(listName)?.todos.find((todo) => todo.id === todoId);
}

function todoKey(listName, todoId) {
  return `${listName}:${todoId}`;
}

async function updateList(previousName, nextName, icon) {
  const list = findList(previousName);
  if (!list || !nextName) {
    return;
  }
  if (nextName !== previousName && state.lists.some((item) => item.name === nextName)) {
    alert("같은 이름의 목록이 이미 있습니다.");
    return;
  }

  list.name = nextName;
  list.icon = LIST_ICONS.includes(icon) ? icon : DEFAULT_LIST_ICON;
  if (previousName !== nextName && expandedCompletedLists.delete(previousName)) {
    expandedCompletedLists.add(nextName);
  }
  if (state.currentListName === previousName) {
    state.currentListName = nextName;
  }
  activeListMenu = null;
  activeMenu = null;
  await saveAndRender();
}

async function deleteList(listName) {
  if (listName === "기본") {
    showUndoToast("기본 목록은 삭제할 수 없습니다.");
    return;
  }
  if (state.lists.length === 1) {
    alert("마지막 목록은 삭제할 수 없습니다.");
    return;
  }

  const index = state.lists.findIndex((list) => list.name === listName);
  if (index < 0) {
    return;
  }

  clearTimeout(undoTimer);
  deletedSnapshot = {
    type: "list",
    index,
    list: structuredClone(state.lists[index]),
    previousCurrentListName: state.currentListName,
  };
  state.lists.splice(index, 1);
  expandedCompletedLists.delete(listName);
  if (state.currentListName === listName) {
    state.currentListName = state.lists.find((list) => list.visible)?.name || state.lists[0].name;
  }
  activeListMenu = null;
  activeMenu = null;
  showUndoToast(`${listName} 목록을 삭제했습니다.`);
  await saveAndRender();
}

async function undoLastDelete() {
  if (!deletedSnapshot) {
    return;
  }

  if (deletedSnapshot.type === "list") {
    await undoDeleteList(deletedSnapshot);
    return;
  }

  if (deletedSnapshot.type === "task") {
    await undoDeleteTask(deletedSnapshot);
    return;
  }

  if (deletedSnapshot.type === "tasks") {
    await undoDeleteTasks(deletedSnapshot);
  }
}

async function undoDeleteList(snapshot) {
  const { index, list, previousCurrentListName } = snapshot;
  if (state.lists.some((item) => item.name === list.name)) {
    alert("같은 이름의 목록이 있어 복원할 수 없습니다.");
    clearUndoToast();
    return;
  }
  state.lists.splice(Math.min(index, state.lists.length), 0, list);
  state.currentListName = previousCurrentListName;
  clearUndoToast();
  await saveAndRender();
}

async function undoDeleteTask(snapshot) {
  const list = findList(snapshot.listName);
  if (!list) {
    clearUndoToast();
    return;
  }

  const restoredTask = structuredClone(snapshot.todo);
  if (list.todos.some((todo) => todo.id === restoredTask.id)) {
    restoredTask.id = nextTodoId(list);
  }
  list.todos.splice(Math.min(snapshot.index, list.todos.length), 0, restoredTask);
  state.currentListName = snapshot.previousCurrentListName;
  activeView = snapshot.previousActiveView;
  clearUndoToast();
  await saveAndRender();
}

async function undoDeleteTasks(snapshot) {
  const list = findList(snapshot.listName);
  if (!list) {
    clearUndoToast();
    return;
  }

  snapshot.todos
    .slice()
    .sort((left, right) => left.index - right.index)
    .forEach(({ todo, index }) => {
      const restoredTask = structuredClone(todo);
      if (list.todos.some((item) => item.id === restoredTask.id)) {
        restoredTask.id = nextTodoId(list);
      }
      list.todos.splice(Math.min(index, list.todos.length), 0, restoredTask);
    });
  state.currentListName = snapshot.previousCurrentListName;
  activeView = snapshot.previousActiveView;
  clearUndoToast();
  await saveAndRender();
}

function showUndoToast(message) {
  elements.undoMessage.textContent = message;
  elements.undoToast.hidden = false;
  undoTimer = setTimeout(clearUndoToast, 6000);
}

function clearUndoToast() {
  clearTimeout(undoTimer);
  undoTimer = null;
  deletedSnapshot = null;
  elements.undoToast.hidden = true;
}

function openFeedbackModal() {
  elements.feedbackModal.hidden = false;
  elements.feedbackTitle.focus();
  updateFeedbackSubmitState();
}

function closeFeedbackModal() {
  elements.feedbackModal.hidden = true;
  elements.feedbackModalForm.reset();
  updateFeedbackSubmitState();
}

function updateFeedbackSubmitState() {
  elements.feedbackSubmitButton.disabled = !elements.feedbackTitle.value.trim() || !elements.feedbackContent.value.trim();
}

async function submitFeedback(event) {
  event.preventDefault();
  const title = elements.feedbackTitle.value.trim();
  const content = elements.feedbackContent.value.trim();
  if (!title || !content) {
    return;
  }
  if (db && !currentUser) {
    showUndoToast("Google 로그인 후 문제를 제보할 수 있습니다.");
    return;
  }

  const now = new Date().toISOString();
  const feedback = {
    id: `feedback-${Date.now()}`,
    title,
    content,
    status: "open",
    reporterName: currentUser?.displayName || "익명 사용자",
    reporterEmail: currentUser?.email || "",
    createdAt: now,
  };

  try {
    if (db) {
      const feedbackRef = doc(collection(db, "feedback"));
      feedback.id = feedbackRef.id;
      await setDoc(feedbackRef, {
        ...feedback,
        createdAt: serverTimestamp(),
      });
    } else {
      saveLocalFeedbackItem(feedback);
    }
    showUndoToast("문제 제보가 접수되었습니다.");
  } catch (error) {
    console.error(error);
    saveLocalFeedbackItem(feedback);
    showUndoToast("네트워크 문제로 이 브라우저에 임시 저장했습니다.");
  }

  if (isDeveloperUser()) {
    await loadFeedbackItems();
  }
  closeFeedbackModal();
  if (activeView === "developer") {
    render();
  }
}

async function loadFeedbackItems() {
  if (!isDeveloperUser()) {
    feedbackItems = [];
    return;
  }

  isFeedbackLoading = true;
  try {
    feedbackItems = await fetchFeedbackItems();
  } catch (error) {
    console.error(error);
    feedbackItems = loadLocalFeedback();
    showUndoToast("제보 목록을 불러오지 못해 로컬 제보만 표시합니다.");
  } finally {
    isFeedbackLoading = false;
  }
}

async function fetchFeedbackItems() {
  if (!db) {
    return loadLocalFeedback();
  }

  const snapshot = await getDocs(query(collection(db, "feedback"), orderBy("createdAt", "desc")));
  return snapshot.docs.map((item) => normalizeFeedback(item.id, item.data()));
}

function normalizeFeedback(id, data) {
  return {
    id,
    title: String(data.title || "제목 없음"),
    content: String(data.content || ""),
    status: data.status === "reviewed" ? "reviewed" : "open",
    reporterName: String(data.reporterName || "익명 사용자"),
    reporterEmail: String(data.reporterEmail || ""),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : String(data.createdAt || ""),
  };
}

function loadLocalFeedback() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_FEEDBACK_KEY) || "[]");
    return Array.isArray(saved) ? saved.map((item) => normalizeFeedback(item.id || `local-${Date.now()}`, item)) : [];
  } catch {
    return [];
  }
}

function saveLocalFeedback(items) {
  localStorage.setItem(LOCAL_FEEDBACK_KEY, JSON.stringify(items));
}

function saveLocalFeedbackItem(feedback) {
  const items = [feedback, ...loadLocalFeedback()];
  saveLocalFeedback(items);
  feedbackItems = items;
}

async function markFeedbackReviewed(id) {
  const item = feedbackItems.find((feedback) => feedback.id === id);
  if (!item) {
    return;
  }

  item.status = "reviewed";
  if (db && !id.startsWith("feedback-") && !id.startsWith("local-")) {
    try {
      await updateDoc(doc(db, "feedback", id), {
        status: "reviewed",
        reviewedAt: serverTimestamp(),
        reviewedBy: currentUser?.email || "",
      });
    } catch (error) {
      console.error(error);
      showUndoToast("검토 상태 저장에 실패했습니다.");
    }
  } else {
    saveLocalFeedback(feedbackItems);
  }
  render();
}

async function loadDeveloperStatus(user = currentUser) {
  if (!user) {
    return false;
  }
  if (!db) {
    return loadLocalDeveloperIds().includes(user.uid);
  }

  try {
    const snapshot = await getDoc(developerDoc(user.uid));
    return snapshot.exists();
  } catch (error) {
    console.error(error);
    return loadLocalDeveloperIds().includes(user.uid);
  }
}

function developerDoc(uid) {
  return doc(db, "developers", uid);
}

async function registerDeveloper(event) {
  event.preventDefault();
  if (!currentUser) {
    showUndoToast("Google 로그인 후 개발자 인증을 진행하세요.");
    return;
  }

  const form = event.currentTarget;
  const password = form.password.value.trim();
  if (password !== DEVELOPER_PASSWORD) {
    showUndoToast("개발자 비밀번호가 일치하지 않습니다.");
    form.password.select();
    return;
  }

  try {
    if (db) {
      await setDoc(developerDoc(currentUser.uid), {
        uid: currentUser.uid,
        email: currentUser.email || "",
        displayName: currentUser.displayName || "",
        createdAt: serverTimestamp(),
      });
    } else {
      saveLocalDeveloperId(currentUser.uid);
    }
    isCurrentDeveloper = true;
    elements.developerViewButton.hidden = false;
    showUndoToast("개발자 계정으로 등록되었습니다.");
    render();
  } catch (error) {
    console.error(error);
    showUndoToast("개발자 등록에 실패했습니다. Firestore 권한을 확인하세요.");
  }
}

async function revokeDeveloper() {
  if (!currentUser || !confirm("현재 계정의 개발자 권한을 해지할까요?")) {
    return;
  }

  try {
    if (db) {
      await deleteDoc(developerDoc(currentUser.uid));
    } else {
      removeLocalDeveloperId(currentUser.uid);
    }
    isCurrentDeveloper = false;
    feedbackItems = [];
    elements.developerViewButton.hidden = true;
    if (activeView === "developer") {
      activeView = "about";
    }
    showUndoToast("개발자 권한을 해지했습니다.");
    render();
  } catch (error) {
    console.error(error);
    showUndoToast("개발자 권한 해지에 실패했습니다.");
  }
}

function loadLocalDeveloperIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_DEVELOPER_KEY) || "[]");
    return Array.isArray(saved) ? saved.map(String) : [];
  } catch {
    return [];
  }
}

function saveLocalDeveloperId(uid) {
  const ids = new Set(loadLocalDeveloperIds());
  ids.add(uid);
  localStorage.setItem(LOCAL_DEVELOPER_KEY, JSON.stringify([...ids]));
}

function removeLocalDeveloperId(uid) {
  const ids = loadLocalDeveloperIds().filter((id) => id !== uid);
  localStorage.setItem(LOCAL_DEVELOPER_KEY, JSON.stringify(ids));
}

function isDeveloperUser() {
  return Boolean(currentUser && isCurrentDeveloper);
}

function formatFeedbackDate(value) {
  if (!value) {
    return "날짜 없음";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "날짜 없음";
  }
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nextTodoId(list) {
  return Math.max(0, ...list.todos.map((todo) => todo.id)) + 1;
}

function nextSubtaskId(todo) {
  return Math.max(0, ...todo.subtasks.map((subtask) => subtask.id)) + 1;
}

function openTaskModal(listName, todoId = null, draft = null) {
  const list = findList(listName) || currentList();
  const todo = todoId === null ? null : findTodo(list.name, todoId);
  const defaultDueAt = toDatetimeLocalValue(new Date());
  const source = todo || draft;
  editingTask = todo ? { listName: list.name, todoId: todo.id } : null;
  elements.taskModal.dataset.starred = String(Boolean(!todo && draft?.starred));

  elements.taskModalList.replaceChildren(
    ...state.lists.map((item) => {
      const option = document.createElement("option");
      option.value = item.name;
      option.textContent = `${item.icon} ${item.name}`;
      return option;
    }),
  );
  elements.taskModalList.value = list.name;
  populateTaskModalTimes();
  elements.taskModalTitle.value = source?.title || "";
  elements.taskModalDescription.value = source?.description || "";
  elements.taskModalRepeat.value = source?.repeat || "none";
  elements.taskModalDate.value = source?.dueAt ? source.dueAt.slice(0, 10) : defaultDueAt.slice(0, 10);
  elements.taskModalTime.value = nearestHalfHour(source?.dueAt ? source.dueAt.slice(11, 16) : defaultDueAt.slice(11, 16));
  elements.taskModalAllDay.checked = Boolean(source?.dueAt && source.dueAt.endsWith("T00:00"));
  updateTaskModalTimeState();
  updateTaskModalSaveState();
  elements.taskModal.hidden = false;
  elements.taskModalTitle.focus();
}

function closeTaskModal() {
  editingTask = null;
  delete elements.taskModal.dataset.starred;
  elements.taskModal.hidden = true;
  elements.taskModalForm.reset();
}

function updateTaskModalSaveState() {
  elements.taskModalSave.disabled = !elements.taskModalTitle.value.trim();
}

function updateTaskModalTimeState() {
  elements.taskModalTime.disabled = elements.taskModalAllDay.checked;
}

function populateTaskModalTimes() {
  if (elements.taskModalTime.options.length > 0) {
    return;
  }
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const option = document.createElement("option");
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    option.value = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    option.textContent = formatTimeOption(hours, mins);
    elements.taskModalTime.append(option);
  }
}

function formatTimeOption(hours, minutes) {
  const period = hours < 12 ? "오전" : "오후";
  const displayHours = hours % 12 || 12;
  return `${period} ${displayHours}:${String(minutes).padStart(2, "0")}`;
}

function nearestHalfHour(value) {
  const [hours, minutes] = value.split(":").map(Number);
  const rounded = (hours * 60 + minutes + 15) % (24 * 60);
  const halfHour = Math.floor(rounded / 30) * 30;
  return `${String(Math.floor(halfHour / 60)).padStart(2, "0")}:${String(halfHour % 60).padStart(2, "0")}`;
}

async function saveTaskModal(event) {
  event.preventDefault();
  const title = elements.taskModalTitle.value.trim();
  const targetList = findList(elements.taskModalList.value);
  if (!title || !targetList) {
    return;
  }

  const date = elements.taskModalDate.value;
  const time = elements.taskModalAllDay.checked ? "00:00" : elements.taskModalTime.value;
  const payload = {
    title,
    description: elements.taskModalDescription.value.trim(),
    dueAt: date ? `${date}T${time || "09:00"}` : "",
    repeat: elements.taskModalRepeat.value,
  };

  if (editingTask) {
    const sourceList = findList(editingTask.listName);
    const todo = findTodo(editingTask.listName, editingTask.todoId);
    if (!sourceList || !todo) {
      closeTaskModal();
      return;
    }
    Object.assign(todo, payload);
    if (sourceList.name !== targetList.name) {
      sourceList.todos = sourceList.todos.filter((item) => item.id !== todo.id);
      targetList.todos.push({ ...todo, id: nextTodoId(targetList) });
    }
  } else {
    targetList.todos.push({
      id: nextTodoId(targetList),
      ...payload,
      createdAt: toDatetimeLocalValue(new Date()),
      completed: false,
      completedAt: "",
      starred: elements.taskModal.dataset.starred === "true",
      starredAt: elements.taskModal.dataset.starred === "true" ? toDatetimeLocalValue(new Date()) : "",
      subtasks: [],
    });
  }

  const createdAsStarred = !editingTask && elements.taskModal.dataset.starred === "true";
  state.currentListName = targetList.name;
  if (!editingTask) {
    activeView = createdAsStarred ? "starred" : "all";
  }
  activeMenu = null;
  closeTaskModal();
  await saveAndRender();
  if (!editingTask) {
    await generateMotivation(title);
  }
}

function editTask(listName, todoId) {
  openTaskModal(listName, todoId);
}

async function addSubtask(listName, todoId) {
  const todo = findTodo(listName, todoId);
  if (!todo) {
    return;
  }
  const title = prompt("하위 할 일을 입력하세요.");
  if (!title?.trim()) {
    return;
  }
  todo.subtasks.push({ id: nextSubtaskId(todo), title: title.trim(), completed: false });
  activeMenu = null;
  await saveAndRender();
}

async function suggestSubtasks(listName, todoId) {
  const todo = findTodo(listName, todoId);
  if (!todo) {
    return;
  }

  activeMenu = null;
  if (elements.aiMotivationText) {
    elements.aiMotivationText.textContent = `"${todo.title}" 하위 작업을 추천하는 중입니다...`;
  }

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "subtasks", todoTitle: todo.title }),
    });

    if (!response.ok) {
      throw new Error(`Gemini endpoint failed: ${response.status}`);
    }

    const data = await response.json();
    const existingTitles = new Set(todo.subtasks.map((subtask) => subtask.title));
    const suggestions = Array.isArray(data.subtasks)
      ? data.subtasks.map((title) => String(title).trim()).filter(Boolean)
      : [];
    const nextSuggestions = suggestions
      .filter((title) => !existingTitles.has(title))
      .slice(0, 5);

    if (nextSuggestions.length === 0) {
      if (elements.aiMotivationText) {
        elements.aiMotivationText.textContent = "이미 추가할 만한 하위 작업이 충분합니다.";
      }
      await saveAndRender();
      return;
    }

    nextSuggestions.forEach((title) => {
      todo.subtasks.push({ id: nextSubtaskId(todo), title, completed: false });
    });
    if (elements.aiMotivationText) {
      elements.aiMotivationText.textContent = `하위 작업 ${nextSuggestions.length}개를 추가했습니다.`;
    }
    await saveAndRender();
  } catch (error) {
    console.error(error);
    if (elements.aiMotivationText) {
      elements.aiMotivationText.textContent = "하위 작업 추천을 불러오지 못했습니다.";
    }
    renderBoard();
  }
}

async function toggleTodo(listName, todoId) {
  const todo = findTodo(listName, todoId);
  if (!todo) {
    return;
  }

  if (!todo.completed && todo.repeat !== "none" && todo.dueAt) {
    todo.dueAt = nextDueDate(todo.dueAt, todo.repeat);
  } else {
    todo.completed = !todo.completed;
    todo.completedAt = todo.completed ? toDatetimeLocalValue(new Date()) : "";
  }

  const key = todoKey(listName, todoId);
  if (todo.completed) {
    recentlyCompleted.add(key);
    clearTimeout(completionTimers.get(key));
    completionTimers.set(key, setTimeout(() => {
      recentlyCompleted.delete(key);
      completionTimers.delete(key);
      render();
    }, 900));
  } else {
    recentlyCompleted.delete(key);
    clearTimeout(completionTimers.get(key));
    completionTimers.delete(key);
  }
  await saveAndRender();
}

async function toggleStar(listName, todoId) {
  const todo = findTodo(listName, todoId);
  if (!todo) {
    return;
  }
  todo.starred = !todo.starred;
  todo.starredAt = todo.starred ? toDatetimeLocalValue(new Date()) : "";
  await saveAndRender();
}

async function deleteTask(listName, todoId) {
  const list = findList(listName);
  if (!list) {
    return;
  }
  const index = list.todos.findIndex((todo) => todo.id === todoId);
  if (index < 0) {
    return;
  }

  clearTimeout(undoTimer);
  deletedSnapshot = {
    type: "task",
    listName,
    index,
    todo: structuredClone(list.todos[index]),
    previousCurrentListName: state.currentListName,
    previousActiveView: activeView,
  };

  list.todos.splice(index, 1);
  recentlyCompleted.delete(todoKey(listName, todoId));
  clearTimeout(completionTimers.get(todoKey(listName, todoId)));
  completionTimers.delete(todoKey(listName, todoId));
  activeMenu = null;
  showUndoToast("할 일을 삭제했습니다.");
  await saveAndRender();
}

async function moveTask(fromListName, toListName, todoId) {
  const fromList = findList(fromListName);
  const toList = findList(toListName);
  const todo = findTodo(fromListName, todoId);
  if (!fromList || !toList || !todo) {
    return;
  }

  fromList.todos = fromList.todos.filter((item) => item.id !== todoId);
  toList.todos.push({ ...todo, id: nextTodoId(toList) });
  state.currentListName = toList.name;
  activeMenu = null;
  await saveAndRender();
}

function isOverdue(todo) {
  return Boolean(todo.dueAt) && !todo.completed && new Date(todo.dueAt) < new Date();
}

function isCharacterOverdue(todo, now = new Date()) {
  return Boolean(todo.dueAt)
    && !todo.completed
    && !isCreatedToday(todo, now)
    && hoursSinceDue(todo.dueAt, now) >= CHARACTER_OVERDUE_GRACE_HOURS;
}

function isCreatedToday(todo, now = new Date()) {
  if (!todo.createdAt) {
    return false;
  }

  const createdAt = new Date(todo.createdAt);
  return isSameCalendarDate(createdAt, now);
}

function isSameCalendarDate(left, right) {
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) {
    return false;
  }

  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
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

function toDateInputValue(date) {
  return toDatetimeLocalValue(date).slice(0, 10);
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

async function generateMotivation(todoTitle) {
  if (!elements.aiMotivationText) {
    return;
  }

  elements.aiMotivationText.textContent = "AI가 동기부여 문구를 만드는 중입니다...";

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ todoTitle }),
    });

    if (!response.ok) {
      throw new Error(`Gemini endpoint failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data.text?.trim();

    elements.aiMotivationText.textContent =
      text || `"${todoTitle}" 작업을 시작했어요. 작은 시작이 큰 변화를 만듭니다.`;
  } catch (error) {
    console.error(error);
    elements.aiMotivationText.textContent =
      `"${todoTitle}" 작업을 시작했어요. 작은 시작이 큰 변화를 만듭니다.`;
  }
}

async function generateDailyCoach() {
  if (!elements.aiMotivationText) {
    return;
  }

  elements.aiMotivationText.textContent = "오늘의 실행 전략을 정리하는 중입니다...";
  elements.aiCoachButton?.setAttribute("disabled", "");

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "daily-coach",
        todos: allTodos(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini endpoint failed: ${response.status}`);
    }

    const data = await response.json();
    elements.aiMotivationText.textContent =
      data.text?.trim() || "가장 쉬운 일 하나부터 끝내며 흐름을 만들어보세요.";
  } catch (error) {
    console.error(error);
    elements.aiMotivationText.textContent = "가장 쉬운 일 하나부터 끝내며 흐름을 만들어보세요.";
  } finally {
    elements.aiCoachButton?.removeAttribute("disabled");
  }
}
initializeFirebase();
