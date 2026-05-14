import tkinter as tk
from tkinter import messagebox

def add_task():
    task = entry.get()
    if task != "":
        listbox.insert(tk.END, task)
        entry.delete(0, tk.起身)
    else:
        messagebox.showwarning("경고", "할 일을 입력해주세요.")

def delete_task():
    try:
        selected_task_index = listbox.curselection()[0]
        listbox.delete(selected_task_index)
    except IndexError:
        messagebox.showwarning("경고", "삭제할 항목을 선택해주세요.")

def clear_tasks():
    listbox.delete(0, tk.END)

# 메인 윈도우 설정
root = tk.Tk()
root.title("간단 투두리스트")
root.geometry("400x450")

# 입력창 및 추가 버튼 레이아웃
frame = tk.Frame(root)
frame.pack(pady=10)

entry = tk.Entry(frame, font=('NanumGothic', 12), width=24)
entry.pack(side=tk.LEFT, padx=10)

add_button = tk.Button(frame, text="추가", command=add_task, bg="#4caf50", fg="white")
add_button.pack(side=tk.LEFT)

# 할 일 목록창 (Listbox)
listbox = tk.Listbox(root, font=('NanumGothic', 12), width=40, height=15, selectmode=tk.SINGLE)
listbox.pack(pady=5, padx=20)

# 삭제 및 전체 삭제 버튼
button_frame = tk.Frame(root)
button_frame.pack(pady=10)

delete_button = tk.Button(button_frame, text="선택 삭제", command=delete_task, bg="#f44336", fg="white")
delete_button.pack(side=tk.LEFT, padx=10)

clear_button = tk.Button(button_frame, text="전체 삭제", command=clear_tasks, bg="#2196f3", fg="white")
clear_button.pack(side=tk.LEFT)

root.mainloop()