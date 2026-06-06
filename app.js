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
const CHARACTER_REFRESH_INTERVAL_MS = 60 * 1000;

const defaultData = {
  currentListName: "기본",
  lists: [{ name: "기본", icon: DEFAULT_LIST_ICON, visible: true, todos: [] }],
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
let deletedListSnapshot = null;
let undoTimer = null;
let editingTask = null;
let quickAddListName = null;

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
  listForm: document.querySelector("#list-form"),
  listName: document.querySelector("#list-name"),
  listNav: document.querySelector("#list-nav"),
  boardArea: document.querySelector(".board-area"),
  boardEyebrow: document.querySelector("#board-eyebrow"),
  boardTitle: document.querySelector("#board-title"),
  boardSummary: document.querySelector("#board-summary"),
  characterStatus: document.querySelector("#character-status"),
  characterMood: document.querySelector("#character-mood"),
  characterCopy: document.querySelector("#character-copy"),
  progressCharacter: document.querySelector("#progress-character"),
  columns: document.querySelector("#columns"),
  undoToast: document.querySelector("#undo-toast"),
  undoMessage: document.querySelector("#undo-message"),
  undoButton: document.querySelector("#undo-button"),
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
    renderLists();
  }
  if (!event.target.closest(".profile-wrap")) {
    setProfileMenuOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.taskModal.hidden) {
    closeTaskModal();
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

elements.undoButton.addEventListener("click", undoDeleteList);

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

elements.allViewButton.addEventListener("click", () => {
  activeView = "all";
  render();
});

elements.starredViewButton.addEventListener("click", () => {
  activeView = "starred";
  render();
});

elements.listForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = elements.listName.value.trim();
  if (!name || state.lists.some((list) => list.name === name)) {
    return;
  }

  state.lists.push({ name, icon: DEFAULT_LIST_ICON, visible: true, todos: [] });
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
      isBoardLoading = false;
      renderSignedOut();
      render();
      return;
    }

    renderSignedIn(user);
    setAuthMessage("할 일 목록을 불러오는 중입니다.");
    state = await loadUserState(user.uid);
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
    todos: Array.isArray(list.todos)
      ? list.todos.map((todo) => ({
          id: Number(todo.id),
          title: String(todo.title || ""),
          description: String(todo.description || ""),
          dueAt: String(todo.dueAt || ""),
          repeat: repeatLabels[todo.repeat] ? todo.repeat : "none",
          completed: Boolean(todo.completed),
          starred: Boolean(todo.starred),
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
}

function renderLists() {
  elements.listNav.replaceChildren();

  state.lists.forEach((list) => {
    const item = document.createElement("div");
    item.className = "list-nav-item";

    const visibilityToggle = document.createElement("input");
    visibilityToggle.type = "checkbox";
    visibilityToggle.className = "list-visibility-toggle";
    visibilityToggle.checked = list.visible;
    visibilityToggle.setAttribute("aria-label", `${list.name} 목록 ${list.visible ? "숨기기" : "표시하기"}`);
    visibilityToggle.addEventListener("change", async () => {
      list.visible = visibilityToggle.checked;
      if (!list.visible && state.currentListName === list.name) {
        state.currentListName = state.lists.find((item) => item.visible)?.name || list.name;
      }
      await saveAndRender();
    });

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = `list-select-button ${list.name === state.currentListName ? "active" : ""}`;
    selectButton.innerHTML = `
      <span class="list-name">
        <span class="list-icon">${escapeHtml(list.icon)}</span>
        <span class="list-title">${escapeHtml(list.name)}</span>
      </span>
      <span class="list-count">${activeTodos(list).length}</span>
    `;
    selectButton.addEventListener("click", async () => {
      state.currentListName = list.name;
      activeView = "all";
      activeListMenu = null;
      await saveAndRender();
    });

    const menuWrap = document.createElement("span");
    menuWrap.className = "list-menu-wrap";
    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = `list-edit-button ${activeListMenu === list.name ? "active" : ""}`;
    menuButton.setAttribute("aria-label", `${list.name} 목록 편집`);
    menuButton.textContent = "⋮";
    menuButton.addEventListener("click", (event) => {
      event.stopPropagation();
      activeMenu = null;
      activeListMenu = activeListMenu === list.name ? null : list.name;
      renderLists();
      renderBoard();
    });
    menuWrap.append(menuButton);

    if (activeListMenu === list.name) {
      menuWrap.append(createListMenu(list));
    }

    item.append(visibilityToggle, selectButton, menuWrap);
    elements.listNav.append(item);
  });
}

function createListMenu(list) {
  const menu = document.createElement("form");
  menu.className = "list-menu";
  menu.innerHTML = `
    <div class="menu-label">목록 아이콘</div>
    <div class="list-icon-options">
      ${LIST_ICONS.map((icon) => `
        <button class="list-icon-option ${icon === list.icon ? "active" : ""}" type="button" data-icon="${escapeHtml(icon)}" aria-label="${escapeHtml(icon)} 아이콘 선택">${escapeHtml(icon)}</button>
      `).join("")}
    </div>
    <label class="list-name-field">
      목록 이름
      <input type="text" value="${escapeHtml(list.name)}" autocomplete="off" />
    </label>
    <button class="list-save-button" type="submit">저장</button>
    <button class="list-delete-button" type="button">목록 삭제</button>
  `;

  let selectedIcon = list.icon;
  menu.querySelectorAll("[data-icon]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedIcon = button.dataset.icon;
      menu.querySelectorAll("[data-icon]").forEach((option) => {
        option.classList.toggle("active", option === button);
      });
    });
  });

  menu.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = menu.querySelector("input").value.trim();
    await updateList(list.name, name, selectedIcon);
  });
  menu.querySelector(".list-delete-button").addEventListener("click", () => deleteList(list.name));

  return menu;
}

function renderBoard() {
  elements.boardArea.classList.toggle("starred-view", activeView === "starred" && !isBoardLoading);
  if (isBoardLoading) {
    elements.boardEyebrow.textContent = "데이터 확인 중";
    elements.boardTitle.textContent = "작업 보드";
    elements.boardSummary.textContent = "";
    elements.characterStatus.hidden = true;
    elements.columns.innerHTML = '<div class="column loading-column"><div class="empty-state loading-state">로딩 중이에요..</div></div>';
    return;
  }

  if (activeView === "starred") {
    renderStarredBoard();
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
        <span class="column-count">완료됨 ${list.todos.filter((todo) => todo.completed).length}</span>
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

function renderStarredBoard() {
  const starredLists = state.lists
    .map((list) => ({ ...list, todos: list.todos.filter((todo) => todo.starred) }))
    .filter((list) => list.todos.length > 0);
  const starredCount = starredLists.reduce((sum, list) => sum + list.todos.length, 0);

  elements.boardEyebrow.textContent = "중요 표시됨";
  elements.boardTitle.textContent = "별표 표시된 할 일";
  elements.boardSummary.textContent = `중요 작업 ${starredCount}개`;
  elements.characterStatus.hidden = true;
  elements.columns.replaceChildren();

  const panel = document.createElement("section");
  panel.className = "starred-panel";
  panel.innerHTML = `
    <div class="starred-panel-header">
      <h3>별표 표시된 할 일</h3>
    </div>
    <button class="starred-add-button" type="button">
      <span>✓+</span>
      별표 표시된 할 일 추가
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
    empty.textContent = "별표 표시된 할 일이 없습니다.";
    groups.append(empty);
  } else {
    starredLists.forEach((list) => {
      const group = document.createElement("section");
      group.className = "starred-group";
      group.innerHTML = `<h4>${escapeHtml(list.icon)} ${escapeHtml(list.name)}</h4><div class="starred-task-list"></div>`;
      const taskList = group.querySelector(".starred-task-list");
      list.todos.forEach((todo) => taskList.append(createTaskCard(list, todo)));
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
    const title = titleInput.value.trim();
    quickAddListName = null;
    openTaskModal(list.name, null, {
      title,
      dueAt: dueDate ? `${dueDate}T${timeInput.value || "09:00"}` : "",
      repeat,
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      return;
    }
    list.todos.push({
      id: nextTodoId(list),
      title,
      description: "",
      dueAt: dueDate ? `${dueDate}T${timeInput.value || "09:00"}` : "",
      repeat,
      completed: false,
      starred: false,
      subtasks: [],
    });
    quickAddListName = null;
    state.currentListName = list.name;
    activeView = "all";
    await saveAndRender();
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

  const overdueTodos = active.filter(isOverdue);
  if (overdueTodos.length === 0) {
    return {
      mood: "tired",
      copy: `진행 중 ${active.length}개가 마감 전입니다.`,
    };
  }

  const longestOverdueHours = Math.max(
    ...overdueTodos.map((todo) => hoursSinceDue(todo.dueAt, now)),
  );
  const mood = getOverdueMood(longestOverdueHours);

  return {
    mood,
    copy: `기한 지난 할 일 ${overdueTodos.length}개, 최대 ${formatOverdueDuration(longestOverdueHours)} 지났어요.`,
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
  if (state.lists.length === 1) {
    alert("마지막 목록은 삭제할 수 없습니다.");
    return;
  }

  const index = state.lists.findIndex((list) => list.name === listName);
  if (index < 0) {
    return;
  }

  clearTimeout(undoTimer);
  deletedListSnapshot = {
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

async function undoDeleteList() {
  if (!deletedListSnapshot) {
    return;
  }

  const { index, list, previousCurrentListName } = deletedListSnapshot;
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

function showUndoToast(message) {
  elements.undoMessage.textContent = message;
  elements.undoToast.hidden = false;
  undoTimer = setTimeout(clearUndoToast, 6000);
}

function clearUndoToast() {
  clearTimeout(undoTimer);
  undoTimer = null;
  deletedListSnapshot = null;
  elements.undoToast.hidden = true;
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
      completed: false,
      starred: elements.taskModal.dataset.starred === "true",
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

async function toggleTodo(listName, todoId) {
  const todo = findTodo(listName, todoId);
  if (!todo) {
    return;
  }

  if (!todo.completed && todo.repeat !== "none" && todo.dueAt) {
    todo.dueAt = nextDueDate(todo.dueAt, todo.repeat);
  } else {
    todo.completed = !todo.completed;
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
  await saveAndRender();
}

async function deleteTask(listName, todoId) {
  const list = findList(listName);
  if (!list || !confirm("이 할 일을 삭제할까요?")) {
    return;
  }
  list.todos = list.todos.filter((todo) => todo.id !== todoId);
  activeMenu = null;
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

initializeFirebase();
