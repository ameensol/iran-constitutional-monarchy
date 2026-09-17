import { useEffect, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import './design-system.css';

type Tone = 'primary' | 'secondary' | 'quiet' | 'danger';

export function Button({ tone = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button className={`ds-button ds-button--${tone} ${className}`} {...props} />;
}

export function IconButton({ label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className={`ds-icon-button ${className}`} {...props} />;
}

export function TextLink({ children, className = '', ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a className={`ds-text-link ${className}`} {...props}>{children}</a>;
}

export function Card({ className = '', interactive = false, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={`ds-card ${interactive ? 'ds-card--interactive' : ''} ${className}`} {...props} />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  return <span className={`ds-badge ds-badge--${tone}`}>{children}</span>;
}

export function Field({ label, hint, error, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const description = `${id}-description`;
  return (
    <label className="ds-field" htmlFor={id}>
      <span className="ds-field__label">{label}</span>
      <input className={`ds-input ${error ? 'ds-input--error' : ''} ${className}`} id={id} aria-invalid={Boolean(error)} aria-describedby={hint || error ? description : undefined} {...props} />
      {(hint || error) && <span id={description} className={error ? 'ds-field__error' : 'ds-field__hint'}>{error ?? hint}</span>}
    </label>
  );
}

export function Select({ label, children, className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <label className="ds-field" htmlFor={id}>
      <span className="ds-field__label">{label}</span>
      <span className="ds-select-wrap"><select id={id} className={`ds-select ${className}`} {...props}>{children}</select></span>
    </label>
  );
}

export function Dialog({ open, title, children, onClose, footer }: { open: boolean; title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ds-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="ds-dialog" role="dialog" aria-modal="true" aria-labelledby="ds-dialog-title">
        <div className="ds-dialog__header"><h2 id="ds-dialog-title">{title}</h2><IconButton label="Close" onClick={onClose} autoFocus>×</IconButton></div>
        <div className="ds-dialog__body">{children}</div>
        {footer && <div className="ds-dialog__footer">{footer}</div>}
      </section>
    </div>
  );
}

export function Drawer({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="ds-drawer-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="ds-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ds-dialog__header"><h2>{title}</h2><IconButton label="Close" onClick={onClose}>×</IconButton></div>
        {children}
      </aside>
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="ds-tooltip" tabIndex={0}>{children}<span role="tooltip" className="ds-tooltip__bubble">{label}</span></span>;
}

export function Tabs({ label, tabs, active, onChange }: { label: string; tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return <div className="ds-tabs" role="tablist" aria-label={label}>{tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={tab.id === active} className="ds-tab" onClick={() => onChange(tab.id)}>{tab.label}</button>)}</div>;
}

export function Progress({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <div className="ds-progress"><div className="ds-progress__meta"><span>{label}</span><b>{Math.round(pct)}%</b></div><div className="ds-progress__track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}><span style={{ inlineSize: `${pct}%` }} /></div></div>;
}

export function Toast({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'danger' }) {
  return <div className={`ds-toast ds-toast--${tone}`} role="status" aria-live="polite">{children}</div>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="ds-empty"><img src="/assets/rosette.svg" alt="" /><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Skeleton({ width = '100%' }: { width?: string }) {
  return <span aria-hidden="true" className="ds-skeleton" style={{ inlineSize: width }} />;
}

export function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: ReactNode[][] }) {
  return <div className="ds-table-wrap"><table className="ds-table"><caption>{caption}</caption><thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
