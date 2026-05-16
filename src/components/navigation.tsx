// @ts-nocheck
export function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active ? 'bg-surface text-cream' : 'text-muted hover-text-cream hover-bg-surface-soft'}`}>
      <Icon size={16} /><span>{label}</span>
    </button>
  );
}

export function MobileTab({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 ${active ? 'text-accent' : 'text-muted'}`}>
      <Icon size={20} />
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </button>
  );
}
