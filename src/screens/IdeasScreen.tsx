// @ts-nocheck
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, FONT_DISPLAY } from '../components/ui';

export function IdeasScreen({ backlog, onAdd, onUpdate, onDelete }) {
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  const submit = () => { if (!newText.trim()) return; onAdd(newText.trim()); setNewText(''); };
  const startEdit = (item) => { setEditingId(item.id); setEditText(item.text); };
  const saveEdit = () => { if (editText.trim()) onUpdate(editingId, editText.trim()); setEditingId(null); };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 pt-8 pb-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted mb-1">Backlog</p>
        <h1 className="text-3xl md:text-4xl font-semibold text-cream leading-tight" style={{ fontFamily: FONT_DISPLAY }}>Ideas</h1>
        <p className="text-sm text-muted mt-2">Things to come back to. Future features for this app, mid-week thoughts, anything.</p>
      </header>

      <div className="mb-6 flex gap-2">
        <input value={newText} onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="New idea..."
          className="flex-1 bg-surface-soft border border-default rounded-md px-3 py-2 text-cream placeholder-faint outline-none focus-border-accent" />
        <Button onClick={submit} disabled={!newText.trim()}><Plus size={16} /> Add</Button>
      </div>

      <div className="space-y-1">
        {backlog.length === 0 && <p className="text-sm text-muted italic text-center py-8">No ideas yet.</p>}
        {backlog.map(item => (
          <div key={item.id} className="group flex items-start gap-3 px-3 py-2 rounded hover-bg-surface-soft transition-colors">
            {editingId === item.id ? (
              <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                className="flex-1 bg-base border border-default rounded px-2 py-1 text-cream outline-none" />
            ) : (
              <>
                <span className="text-faint text-sm flex-shrink-0 mt-0.5">•</span>
                <button onClick={() => startEdit(item)} className="flex-1 text-left text-sm text-cream hover-text-accent">
                  {item.text}
                </button>
                <button onClick={() => { if (confirm('Delete this idea?')) onDelete(item.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted hover-text-danger transition-opacity">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
