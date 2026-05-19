import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from pathlib import Path


DATA_FILE = Path("todos.json")
DATE_FORMAT = "%Y-%m-%d %H:%M"
REPEAT_OPTIONS = {"none", "daily", "weekly", "monthly"}


@dataclass
class Subtask:
    id: int
    title: str
    completed: bool = False


@dataclass
class Todo:
    id: int
    title: str
    description: str = ""
    due_at: str = ""
    repeat: str = "none"
    completed: bool = False
    subtasks: list[Subtask] = field(default_factory=list)


@dataclass
class TodoList:
    name: str
    todos: list[Todo] = field(default_factory=list)


class TodoRepository:
    def __init__(self, path: Path = DATA_FILE):
        self.path = path

    def load(self) -> list[TodoList]:
        if not self.path.exists():
            return [TodoList(name="기본")]

        with self.path.open("r", encoding="utf-8") as file:
            raw_data = json.load(file)

        if isinstance(raw_data, list):
            return [TodoList(name="기본", todos=[self._todo_from_dict(item) for item in raw_data])]

        return [
            TodoList(
                name=list_item["name"],
                todos=[self._todo_from_dict(todo) for todo in list_item.get("todos", [])],
            )
            for list_item in raw_data.get("lists", [])
        ] or [TodoList(name="기본")]

    def save(self, todo_lists: list[TodoList]) -> None:
        payload = {"lists": [asdict(todo_list) for todo_list in todo_lists]}
        with self.path.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)

    def _todo_from_dict(self, item: dict) -> Todo:
        return Todo(
            id=item["id"],
            title=item["title"],
            description=item.get("description", ""),
            due_at=item.get("due_at", ""),
            repeat=item.get("repeat", "none"),
            completed=item.get("completed", False),
            subtasks=[
                Subtask(
                    id=subtask["id"],
                    title=subtask["title"],
                    completed=subtask.get("completed", False),
                )
                for subtask in item.get("subtasks", [])
            ],
        )


class TodoService:
    def __init__(self, repository: TodoRepository):
        self.repository = repository
        self.todo_lists = repository.load()
        self.current_list_name = self.todo_lists[0].name

    def list_names(self) -> list[str]:
        return [todo_list.name for todo_list in self.todo_lists]

    def current_list(self) -> TodoList:
        for todo_list in self.todo_lists:
            if todo_list.name == self.current_list_name:
                return todo_list
        raise ValueError("현재 목록을 찾을 수 없습니다.")

    def create_list(self, name: str) -> TodoList:
        name = name.strip()
        if self._find_list(name):
            raise ValueError("이미 존재하는 목록입니다.")

        todo_list = TodoList(name=name)
        self.todo_lists.append(todo_list)
        self.current_list_name = name
        self.repository.save(self.todo_lists)
        return todo_list

    def switch_list(self, name: str) -> TodoList:
        todo_list = self._find_list(name.strip())
        if todo_list is None:
            raise ValueError("해당 이름의 목록을 찾을 수 없습니다.")

        self.current_list_name = todo_list.name
        return todo_list

    def list_todos(self) -> list[Todo]:
        return self.current_list().todos

    def add_todo(self, title: str, description: str = "", due_at: str = "", repeat: str = "none") -> Todo:
        todos = self.list_todos()
        next_id = max((todo.id for todo in todos), default=0) + 1
        todo = Todo(
            id=next_id,
            title=title.strip(),
            description=description.strip(),
            due_at=due_at,
            repeat=repeat,
        )
        todos.append(todo)
        self.repository.save(self.todo_lists)
        return todo

    def update_todo(
        self,
        todo_id: int,
        title: str,
        description: str,
        due_at: str,
        repeat: str,
    ) -> Todo:
        todo = self._find_todo(todo_id)
        todo.title = title.strip()
        todo.description = description.strip()
        todo.due_at = due_at
        todo.repeat = repeat
        self.repository.save(self.todo_lists)
        return todo

    def delete_todo(self, todo_id: int) -> Todo:
        todo = self._find_todo(todo_id)
        self.list_todos().remove(todo)
        self.repository.save(self.todo_lists)
        return todo

    def toggle_completed(self, todo_id: int) -> Todo:
        todo = self._find_todo(todo_id)
        if todo.repeat != "none" and not todo.completed and todo.due_at:
            todo.due_at = next_due_at(todo.due_at, todo.repeat)
            todo.completed = False
        else:
            todo.completed = not todo.completed
        self.repository.save(self.todo_lists)
        return todo

    def add_subtask(self, todo_id: int, title: str) -> Subtask:
        todo = self._find_todo(todo_id)
        next_id = max((subtask.id for subtask in todo.subtasks), default=0) + 1
        subtask = Subtask(id=next_id, title=title.strip())
        todo.subtasks.append(subtask)
        self.repository.save(self.todo_lists)
        return subtask

    def toggle_subtask(self, todo_id: int, subtask_id: int) -> Subtask:
        subtask = self._find_subtask(todo_id, subtask_id)
        subtask.completed = not subtask.completed
        self.repository.save(self.todo_lists)
        return subtask

    def delete_subtask(self, todo_id: int, subtask_id: int) -> Subtask:
        todo = self._find_todo(todo_id)
        subtask = self._find_subtask(todo_id, subtask_id)
        todo.subtasks.remove(subtask)
        self.repository.save(self.todo_lists)
        return subtask

    def _find_list(self, name: str) -> TodoList | None:
        for todo_list in self.todo_lists:
            if todo_list.name == name:
                return todo_list
        return None

    def _find_todo(self, todo_id: int) -> Todo:
        for todo in self.list_todos():
            if todo.id == todo_id:
                return todo
        raise ValueError(f"ID {todo_id}에 해당하는 할 일을 찾을 수 없습니다.")

    def _find_subtask(self, todo_id: int, subtask_id: int) -> Subtask:
        todo = self._find_todo(todo_id)
        for subtask in todo.subtasks:
            if subtask.id == subtask_id:
                return subtask
        raise ValueError(f"ID {subtask_id}에 해당하는 하위 작업을 찾을 수 없습니다.")


def next_due_at(due_at: str, repeat: str) -> str:
    due_date = datetime.strptime(due_at, DATE_FORMAT)
    if repeat == "daily":
        due_date += timedelta(days=1)
    elif repeat == "weekly":
        due_date += timedelta(weeks=1)
    elif repeat == "monthly":
        month = due_date.month + 1
        year = due_date.year
        if month == 13:
            month = 1
            year += 1
        day = min(due_date.day, days_in_month(year, month))
        due_date = due_date.replace(year=year, month=month, day=day)
    return due_date.strftime(DATE_FORMAT)


def days_in_month(year: int, month: int) -> int:
    if month == 12:
        next_month = datetime(year + 1, 1, 1)
    else:
        next_month = datetime(year, month + 1, 1)
    return (next_month - timedelta(days=1)).day


def print_menu(current_list_name: str) -> None:
    print(f"\n=== To Do List v2.0 ({current_list_name}) ===")
    print("1. 목록 보기")
    print("2. 할 일 추가")
    print("3. 할 일 수정")
    print("4. 할 일 삭제")
    print("5. 완료/미완료 변경")
    print("6. 하위 작업 추가")
    print("7. 하위 작업 완료/미완료 변경")
    print("8. 하위 작업 삭제")
    print("9. 작업 목록 관리")
    print("10. 저장")
    print("0. 종료")


def print_todos(todos: list[Todo]) -> None:
    if not todos:
        print("\n등록된 할 일이 없습니다.")
        return

    print("\n[할 일 목록]")
    for todo in todos:
        status = "완료" if todo.completed else "진행중"
        due_at = f" / 마감: {todo.due_at}" if todo.due_at else ""
        repeat = f" / 반복: {format_repeat(todo.repeat)}" if todo.repeat != "none" else ""
        print(f"{todo.id}. [{status}] {todo.title}{due_at}{repeat}")
        if todo.description:
            print(f"   설명: {todo.description}")
        for subtask in todo.subtasks:
            sub_status = "완료" if subtask.completed else "진행중"
            print(f"   - {subtask.id}. [{sub_status}] {subtask.title}")


def print_lists(service: TodoService) -> None:
    print("\n[작업 목록]")
    for name in service.list_names():
        marker = "*" if name == service.current_list_name else " "
        print(f"{marker} {name}")


def format_repeat(repeat: str) -> str:
    labels = {
        "none": "없음",
        "daily": "매일",
        "weekly": "매주",
        "monthly": "매월",
    }
    return labels.get(repeat, repeat)


def read_required_text(prompt: str) -> str:
    while True:
        value = input(prompt).strip()
        if value:
            return value
        print("빈 값은 입력할 수 없습니다.")


def read_optional_text(prompt: str, default: str = "") -> str:
    value = input(prompt).strip()
    return value if value else default


def read_due_at(default: str = "") -> str:
    while True:
        prompt = "마감일(YYYY-MM-DD HH:MM, 비우면 없음): "
        if default:
            prompt = f"마감일(YYYY-MM-DD HH:MM, Enter=기존값 {default}, '-'=삭제): "
        value = input(prompt).strip()

        if not value:
            return default
        if value == "-":
            return ""

        try:
            datetime.strptime(value, DATE_FORMAT)
            return value
        except ValueError:
            print("마감일 형식은 YYYY-MM-DD HH:MM 으로 입력해 주세요.")


def read_repeat(default: str = "none") -> str:
    while True:
        value = input("반복(none/daily/weekly/monthly, 비우면 없음): ").strip() or default
        if value in REPEAT_OPTIONS:
            return value
        print("반복은 none, daily, weekly, monthly 중 하나로 입력해 주세요.")


def read_todo_id() -> int | None:
    value = input("할 일 ID: ").strip()
    if not value.isdigit():
        print("ID는 숫자로 입력해 주세요.")
        return None
    return int(value)


def read_subtask_id() -> int | None:
    value = input("하위 작업 ID: ").strip()
    if not value.isdigit():
        print("ID는 숫자로 입력해 주세요.")
        return None
    return int(value)


def manage_lists(service: TodoService) -> None:
    while True:
        print_lists(service)
        print("\n1. 목록 만들기")
        print("2. 목록 전환")
        print("0. 돌아가기")
        choice = input("메뉴 선택: ").strip()

        if choice == "1":
            name = read_required_text("새 목록 이름: ")
            todo_list = service.create_list(name)
            print(f"목록 생성 및 전환 완료: {todo_list.name}")
        elif choice == "2":
            name = read_required_text("전환할 목록 이름: ")
            todo_list = service.switch_list(name)
            print(f"목록 전환 완료: {todo_list.name}")
        elif choice == "0":
            return
        else:
            print("올바른 메뉴 번호를 선택해 주세요.")


def run_app() -> None:
    service = TodoService(TodoRepository())

    while True:
        print_menu(service.current_list_name)
        choice = input("메뉴 선택: ").strip()

        try:
            if choice == "1":
                print_todos(service.list_todos())
            elif choice == "2":
                title = read_required_text("추가할 내용: ")
                description = read_optional_text("설명(선택): ")
                due_at = read_due_at()
                repeat = read_repeat()
                todo = service.add_todo(title, description, due_at, repeat)
                print(f"추가 완료: {todo.title}")
            elif choice == "3":
                todo_id = read_todo_id()
                if todo_id is None:
                    continue
                old_todo = service._find_todo(todo_id)
                title = read_optional_text(f"수정할 내용(Enter=기존값 {old_todo.title}): ", old_todo.title)
                description = read_optional_text("설명(비우면 기존값 유지): ", old_todo.description)
                due_at = read_due_at(old_todo.due_at)
                repeat = read_repeat(old_todo.repeat)
                todo = service.update_todo(todo_id, title, description, due_at, repeat)
                print(f"수정 완료: {todo.title}")
            elif choice == "4":
                todo_id = read_todo_id()
                if todo_id is None:
                    continue
                todo = service.delete_todo(todo_id)
                print(f"삭제 완료: {todo.title}")
            elif choice == "5":
                todo_id = read_todo_id()
                if todo_id is None:
                    continue
                todo = service.toggle_completed(todo_id)
                status = "완료" if todo.completed else "미완료"
                print(f"상태 변경: {todo.title} -> {status}")
            elif choice == "6":
                todo_id = read_todo_id()
                if todo_id is None:
                    continue
                title = read_required_text("하위 작업 내용: ")
                subtask = service.add_subtask(todo_id, title)
                print(f"하위 작업 추가 완료: {subtask.title}")
            elif choice == "7":
                todo_id = read_todo_id()
                subtask_id = read_subtask_id()
                if todo_id is None or subtask_id is None:
                    continue
                subtask = service.toggle_subtask(todo_id, subtask_id)
                status = "완료" if subtask.completed else "미완료"
                print(f"하위 작업 상태 변경: {subtask.title} -> {status}")
            elif choice == "8":
                todo_id = read_todo_id()
                subtask_id = read_subtask_id()
                if todo_id is None or subtask_id is None:
                    continue
                subtask = service.delete_subtask(todo_id, subtask_id)
                print(f"하위 작업 삭제 완료: {subtask.title}")
            elif choice == "9":
                manage_lists(service)
            elif choice == "10":
                service.repository.save(service.todo_lists)
                print("저장 완료")
            elif choice == "0":
                service.repository.save(service.todo_lists)
                print("종료합니다.")
                break
            else:
                print("올바른 메뉴 번호를 선택해 주세요.")
        except ValueError as error:
            print(error)
        except json.JSONDecodeError:
            print("저장 파일을 읽을 수 없습니다. todos.json 형식을 확인해 주세요.")


if __name__ == "__main__":
    run_app()
