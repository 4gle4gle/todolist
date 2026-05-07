class Task:
    def __init__(self, title, due_date):
        self.title = title
        self.due_date = due_date
        self.postpone_count = 0

    def postpone(self):
        self.postpone_count =+ 1
