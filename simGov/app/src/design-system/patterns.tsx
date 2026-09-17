import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';
import { Badge, Button, Card, Select, Toast } from './index';
import { httpFeedbackAdapter, readFeedbackDraft, type FeedbackCategory, type FeedbackPayload } from '../feedback/adapter';
import type { Locale } from '../i18n/resources';

export function EvidenceStrip({ items }: { items: { value: string; label: string }[] }) {
  return <div className="pattern-evidence" aria-label="Project evidence">{items.map((item) => <div key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}</div>;
}

export function InstitutionHealthCard({ name, description, status, icon, children }: { name: string; description: string; status: 'stable' | 'active' | 'attention'; icon: ReactNode; children?: ReactNode }) {
  return <Card className="pattern-health" interactive><span className="pattern-health__icon" aria-hidden="true">{icon}</span><div><Badge tone={status === 'stable' ? 'success' : status === 'active' ? 'info' : 'warning'}>{status}</Badge><h3>{name}</h3><p>{description}</p>{children}</div></Card>;
}

export interface TimelineStep { id: string; title: string; detail?: string; status: 'complete' | 'current' | 'upcoming' | 'error' }
export function ProcessTimeline({ steps }: { steps: TimelineStep[] }) {
  return <ol className="pattern-timeline">{steps.map((step, index) => <li key={step.id} data-status={step.status}><span className="pattern-timeline__marker">{step.status === 'complete' ? '✓' : index + 1}</span><div><strong>{step.title}</strong>{step.detail && <p>{step.detail}</p>}</div></li>)}</ol>;
}

export function TechnicalTransactionPanel({ actor, call, status, hash, before, after, events }: { actor: string; call: string; status: string; hash?: string; before: string; after: string; events?: string[] }) {
  const { t } = useTranslation('chain');
  return <Card className="pattern-transaction"><div className="pattern-transaction__head"><Badge tone={status === 'Confirmed' || status === t('confirmed') ? 'success' : 'info'}>{status}</Badge><span>{actor}</span></div><code dir="ltr">{call}</code>{hash && <code className="pattern-hash" dir="ltr">{hash}</code>}<div className="pattern-state"><div><span>{t('before')}</span><b>{before}</b></div><span aria-hidden="true">→</span><div><span>{t('after')}</span><b>{after}</b></div></div>{events?.map((event) => <code key={event} dir="ltr">↳ {event}</code>)}</Card>;
}

export function ArticleNavigator({ previous, next }: { previous?: ReactNode; next?: ReactNode }) {
  return <nav className="pattern-article-nav" aria-label="Article navigation"><div>{previous}</div><div>{next}</div></nav>;
}

export function FeedbackForm() {
  const { t } = useTranslation(['feedback', 'community']);
  const { locale = 'en' } = useParams();
  const location = useLocation();
  const draft = readFeedbackDraft();
  const [name, setName] = useState(draft?.name ?? '');
  const [email, setEmail] = useState(draft?.email ?? '');
  const [category, setCategory] = useState<FeedbackCategory>(draft?.category ?? 'usability');
  const [message, setMessage] = useState(draft?.message ?? '');
  const [consent, setConsent] = useState(draft?.consent ?? false);
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'error' | 'saved'>('idle');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || !consent || honeypot) { setStatus('error'); return; }
    setSubmitting(true);
    const payload: FeedbackPayload = { name: name.trim() || undefined, email: email.trim() || undefined, locale: locale as Locale, category, message: message.trim(), page: location.pathname, consent: true };
    await httpFeedbackAdapter.submit(payload);
    setSubmitting(false);
    setStatus('saved');
  }

  return (
    <form className="pattern-feedback" onSubmit={onSubmit} noValidate>
      <div className="pattern-feedback__grid">
        <label><span>{t('feedback:name')}</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
        <label><span>{t('feedback:email')}</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
      </div>
      <Select label={t('feedback:category')} value={category} onChange={(event) => setCategory(event.target.value as FeedbackCategory)}>
        {(['usability', 'content', 'constitution', 'technical', 'other'] as const).map((item) => <option key={item} value={item}>{t(`feedback:categories.${item}`)}</option>)}
      </Select>
      <label><span>{t('feedback:message')}</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={6} required /></label>
      <label className="pattern-feedback__honeypot" aria-hidden="true">Website<input value={honeypot} onChange={(event) => setHoneypot(event.target.value)} tabIndex={-1} autoComplete="off" /></label>
      <label className="pattern-feedback__consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>{t('feedback:consent')}</span></label>
      <Button type="submit" disabled={submitting}>{t('feedback:submit')}</Button>
      {status === 'error' && <Toast tone="danger">{t('feedback:required')}</Toast>}
      {status === 'saved' && <Toast tone="success">{t('feedback:saved')}</Toast>}
    </form>
  );
}
