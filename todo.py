import json
from dataclasses import asdict, dataclass
from pathlib import Path


DATA_FILE = Path("todos.json")


@dataclass
class Todo:
    id: int
    title: str
    completed: bool = False


class TodoRepository:
    def __init__(self, path: Path = DATA_FILE):
        self.path = path

    def load(self) -> list[Todo]:
        if not self.path.exists():
            return []

        with self.path.open("r", encoding="utf-8") as file:
            raw_items = json.load(file)

        return [
            Todo(
                id=item["id"],
                title=item["title"],
                completed=item.get("completed", False),
            )
            for item in raw_items
        ]

    def save(self, todos: list[Todo]) -> None:
        with self.path.open("w", encoding="utf-8") as file:
            json.dump([asdict(todo) for todo in todos], file, ensure_ascii=False, indent=2)


class TodoService:
    def __init__(self, repository: TodoRepository):
        self.repository = repository
        self.todos = repository.load()

    def list_todos(self) -> list[Todo]:
        return self.todos

    def add_todo(self, title: str) -> Todo:
        next_id = max((todo.id for todo in self.todos), default=0) + 1
        todo = Todo(id=next_id, title=title.strip())
        self.todos.append(todo)
        self.repository.save(self.todos)
        return todo

    def update_todo(self, todo_id: int, title: str) -> Todo:
        todo = self._find_todo(todo_id)
        todo.title = title.strip()
        self.repository.save(self.todos)
        return todo

    def delete_todo(self, todo_id: int) -> Todo:
        todo = self._find_todo(todo_id)
        self.todos.remove(todo)
        self.repository.save(self.todos)
        return todo

    def toggle_completed(self, todo_id: int) -> Todo:
        todo = self._find_todo(todo_id)
        todo.completed = not todo.completed
        self.repository.save(self.todos)
        return todo

    def _find_todo(self, todo_id: int) -> Todo:
        for todo in self.todos:
            if todo.id == todo_id:
                return todo
        raise ValueError(f"ID {todo_id}에 해당하는 할 일을 찾을 수 없습니다.")


def print_menu() -> None:
    print("\n=== To Do List v1.0 ===")
    print("1. 목록 보기")
    print("2. 추가")
    print("3. 수정")
    print("4. 삭제")
    print("5. 완료/미완료 변경")
    print("6. 저장")
    print("0. 종료")


def print_todos(todos: list[Todo]) -> None:
    if not todos:
        print("\n등록된 할 일이 없습니다.")
        return

    print("\n[할 일 목록]")
    for todo in todos:
        status = "완료" if todo.completed else "진행중"
        print(f"{todo.id}. [{status}] {todo.title}")


def read_required_text(prompt: str) -> str:
    while True:
        value = input(prompt).strip()
        if value:
            return value
        print("빈 값은 입력할 수 없습니다.")


def read_todo_id() -> int | None:
    value = input("할 일 ID: ").strip()
    if not value.isdigit():
        print("ID는 숫자로 입력해 주세요.")
        return None
    return int(value)


def run_app() -> None:
    service = TodoService(TodoRepository())

    while True:
        print_menu()
        choice = input("메뉴 선택: ").strip()

        try:
            if choice == "1":
                print_todos(service.list_todos())
            elif choice == "2":
                title = read_required_text("추가할 내용: ")
                todo = service.add_todo(title)
                print(f"추가 완료: {todo.title}")
            elif choice == "3":
                todo_id = read_todo_id()
                if todo_id is None:
                    continue
                title = read_required_text("수정할 내용: ")
                todo = service.update_todo(todo_id, title)
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
                service.repository.save(service.list_todos())
                print("저장 완료")
            elif choice == "0":
                service.repository.save(service.list_todos())
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
