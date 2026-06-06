/**
 * @file JournalTodoList.tsx
 * @description In-line todo-list component for the Cozy Journal workspace.
 * Renders lists of tasks with interactive checkbox completion states and edit text handlers,
 * reporting state mutations back up to the parent save orchestrator.
 */

'use client';
import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

interface Props {
  todos: TodoItem[];
  onChange: (todos: TodoItem[]) => void;
}

export default function JournalTodoList({ todos, onChange }: Props) {
  const [newText, setNewText] = useState('');

  const handleToggle = (id: string) => {
    const updated = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
    onChange(updated);
  };

  const handleTextChange = (id: string, text: string) => {
    const updated = todos.map(t => t.id === id ? { ...t, text } : t);
    onChange(updated);
  };

  const handleAdd = () => {
    if (!newText.trim()) return;
    const newItem: TodoItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
      text: newText.trim(),
      done: false,
    };
    onChange([...todos, newItem]);
    setNewText('');
  };

  const handleDelete = (id: string) => {
    onChange(todos.filter(t => t.id !== id));
  };

  return (
    <div className="journal-todo-container">
      <div className="journal-todo-list">
        {todos.map(t => (
          <div key={t.id} className={`journal-todo-item ${t.done ? 'done' : ''}`}>
            <label className="journal-todo-checkbox-wrapper">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => handleToggle(t.id)}
                className="journal-todo-checkbox-hidden"
              />
              <span className="journal-todo-checkbox-custom" />
            </label>
            <input
              type="text"
              className="journal-todo-text-input"
              value={t.text}
              onChange={e => handleTextChange(t.id, e.target.value)}
              placeholder="Task..."
            />
            <button
              type="button"
              className="journal-todo-delete-btn"
              onClick={() => handleDelete(t.id)}
              title="Delete task"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {todos.length === 0 && (
          <div className="journal-todo-empty">
            No tasks for today. Add one below!
          </div>
        )}
      </div>

      <div className="journal-todo-add-form">
        <input
          type="text"
          className="journal-todo-add-input"
          placeholder="Add a new task..."
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button
          type="button"
          className="journal-todo-add-btn"
          onClick={handleAdd}
          title="Add task"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
