// @ts-nocheck
import { useEffect } from 'react';
import { X } from 'lucide-react';

export const FONT_DISPLAY = "'Fraunces', Georgia, serif";
export const FONT_BODY = "'DM Sans', -apple-system, sans-serif";

export function ThemeStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600&display=swap');

      :root {
        --c-bg: #131915;
        --c-surface: #1b231d;
        --c-surface-2: #232d25;
        --c-surface-3: #2b372e;
        --c-border: #2d362f;
        --c-border-soft: #232d25;
        --c-text: #ebe7df;
        --c-text-dim: #b8b6ac;
        --c-text-muted: #919286;
        --c-text-faint: #5d6259;
        --c-accent: #dbb673;
        --c-accent-hover: #e8c485;
        --c-accent-strong: #c9a665;
        --c-accent-text: #131915;
        --c-accent-tint: rgba(219, 182, 115, 0.1);
        --c-accent-tint-strong: rgba(219, 182, 115, 0.18);
        --c-accent-border: rgba(219, 182, 115, 0.35);
        --c-success: #8db876;
        --c-success-strong: #a3c889;
        --c-success-bg: rgba(141, 184, 118, 0.15);
        --c-success-bg-soft: rgba(141, 184, 118, 0.08);
        --c-success-border: rgba(141, 184, 118, 0.45);
        --c-danger: #cc7878;
        --c-danger-strong: #df8b8b;
        --c-danger-bg: rgba(204, 120, 120, 0.18);
        --c-danger-border: rgba(204, 120, 120, 0.45);
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background-color: var(--c-bg); }
      textarea, input { font-family: inherit; }
      .scroll-hidden::-webkit-scrollbar { display: none; }
      .scroll-hidden { scrollbar-width: none; }
      .narrative-textarea { line-height: 1.7; }
      .chat-message-content { line-height: 1.6; }

      @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      .fade-in { animation: fadeIn 0.25s ease-out; }

      .bg-base { background-color: var(--c-bg); }
      .bg-surface { background-color: var(--c-surface); }
      .bg-surface-soft { background-color: rgba(27, 35, 29, 0.5); }
      .bg-surface-2 { background-color: var(--c-surface-2); }
      .bg-surface-3 { background-color: var(--c-surface-3); }

      .text-cream { color: var(--c-text); }
      .text-dim { color: var(--c-text-dim); }
      .text-muted { color: var(--c-text-muted); }
      .text-faint { color: var(--c-text-faint); }

      .text-accent { color: var(--c-accent); }
      .text-accent-strong { color: var(--c-accent-strong); }
      .text-success { color: var(--c-success); }
      .text-success-strong { color: var(--c-success-strong); }
      .text-danger { color: var(--c-danger); }
      .text-danger-strong { color: var(--c-danger-strong); }

      .border-default { border-color: var(--c-border); }
      .border-soft { border-color: var(--c-border-soft); }
      .border-accent { border-color: var(--c-accent-border); }
      .border-success { border-color: var(--c-success-border); }
      .border-danger { border-color: var(--c-danger-border); }

      .bg-accent-tint { background-color: var(--c-accent-tint); }
      .bg-accent-tint-strong { background-color: var(--c-accent-tint-strong); }
      .bg-success-tint { background-color: var(--c-success-bg); }
      .bg-success-tint-soft { background-color: var(--c-success-bg-soft); }
      .bg-danger-tint { background-color: var(--c-danger-bg); }

      .placeholder-faint::placeholder { color: var(--c-text-faint); }
      .focus-border-accent:focus { border-color: var(--c-accent); }

      .hover-text-accent:hover { color: var(--c-accent); }
      .hover-text-cream:hover { color: var(--c-text); }
      .hover-text-danger:hover { color: var(--c-danger-strong); }
      .hover-bg-surface:hover { background-color: var(--c-surface); }
      .hover-bg-surface-2:hover { background-color: var(--c-surface-2); }
      .hover-bg-surface-soft:hover { background-color: rgba(27, 35, 29, 0.7); }

      .icon-flag-fill { color: var(--c-danger-strong); fill: var(--c-danger-strong); }

      .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 500; border-radius: 6px; transition: background-color 0.15s, color 0.15s, border-color 0.15s; }
      .btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn-primary { background-color: var(--c-accent); color: var(--c-accent-text); }
      .btn-primary:hover:not(:disabled) { background-color: var(--c-accent-hover); }
      .btn-ghost { background-color: transparent; color: var(--c-text-dim); }
      .btn-ghost:hover:not(:disabled) { background-color: var(--c-surface); color: var(--c-text); }
      .btn-outline { background-color: transparent; color: var(--c-text); border: 1px solid var(--c-border); }
      .btn-outline:hover:not(:disabled) { background-color: var(--c-surface); }
      .btn-danger { background-color: var(--c-danger-bg); color: var(--c-danger-strong); border: 1px solid var(--c-danger-border); }
      .btn-danger:hover:not(:disabled) { background-color: rgba(204, 120, 120, 0.28); }
      .btn-subtle { background-color: var(--c-surface-2); color: var(--c-text); }
      .btn-subtle:hover:not(:disabled) { background-color: var(--c-surface-3); }

      .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 6px; color: var(--c-text-muted); transition: color 0.15s, background-color 0.15s; }
      .icon-btn:hover { color: var(--c-text); background-color: var(--c-surface); }

      .fab-shadow { box-shadow: 0 18px 28px -8px rgba(219, 182, 115, 0.25), 0 6px 12px -4px rgba(219, 182, 115, 0.15); }

      .toast-bg { background-color: var(--c-text); color: var(--c-bg); }
    `}</style>
  );
}

export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, className = '', type = 'button', ...rest }) {
  const sizeCls = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-5 py-3 text-base' : 'px-4 py-2 text-sm';
  const variantCls = `btn btn-${variant}`;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${variantCls} ${sizeCls} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({ children, onClick, className = '', title, ...rest }) {
  return (
    <button onClick={onClick} title={title} className={`icon-btn ${className}`} {...rest}>{children}</button>
  );
}

export function Modal({ open, onClose, children, title, maxWidth = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center fade-in" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div
        className={`bg-surface border border-default w-full md:rounded-lg md:shadow-2xl md:my-6 ${maxWidth} md:max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-default">
          <h2 className="text-lg font-medium text-cream" style={{ fontFamily: FONT_DISPLAY }}>{title}</h2>
          <IconButton onClick={onClose} title="Close"><X size={18} /></IconButton>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 toast-bg px-4 py-2 rounded-md shadow-lg text-sm fade-in">
      {message}
    </div>
  );
}
