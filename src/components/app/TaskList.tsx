"use client";

import { useState } from "react";

export type TaskItem = {
  id: string;
  agentName: string;
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  dueLabel: string;
  status: "open" | "done";
};

export function TaskList({ tasks, showAgent = true, emptyText }: { tasks: TaskItem[]; showAgent?: boolean; emptyText: string }) {
  const [items, setItems] = useState(tasks);
  const [error, setError] = useState("");

  async function toggle(task: TaskItem) {
    const status = task.status === "done" ? "open" : "done";
    setError("");
    setItems((list) => list.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error();
    } catch {
      setItems((list) => list.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)));
      setError("Couldn't update that task. Try again.");
    }
  }

  if (items.length === 0) return <p className="empty">{emptyText}</p>;

  return (
    <>
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
      <ul className="tasks">
        {items.map((t) => (
          <li key={t.id} className={t.status === "done" ? "is-done" : ""}>
            <label className="task-check">
              <input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t)} />
              <span className="sr-only">Mark “{t.title}” as {t.status === "done" ? "not done" : "done"}</span>
            </label>
            <div className="task-body">
              <p className="task-title">{t.title}</p>
              {t.detail && <p className="task-detail">{t.detail}</p>}
              <p className="task-meta mono">
                <span className={`prio-tag prio-${t.priority}`}>{t.priority}</span>
                {showAgent && <span>{t.agentName}</span>}
                <span>{t.dueLabel}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
