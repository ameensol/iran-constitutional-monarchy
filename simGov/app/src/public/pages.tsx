import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import constitutionData from '../content/generated/constitution.json';
import { Badge, Button, Card, EmptyState, Select, Toast } from '../design-system';
import { EvidenceStrip, FeedbackForm } from '../design-system/patterns';
import type { Locale } from '../i18n/resources';

const scenarioItems = [
  { id: 'genesis', tour: 'genesis', art: 'persepolis-relief.svg' },
  { id: 'law', tour: 'bill-lifecycle', art: 'king-and-courtier.svg' },
  { id: 'government', tour: 'pm-formation', art: 'three-courtiers.svg' },
  { id: 'election', tour: 'election-day', art: 'offering-bearer.svg' },
  { id: 'amendment', tour: 'rewriting-rules', art: 'rosette.svg' },
  { id: 'crisis', tour: 'system-breaks', art: 'lamassu.svg' },
] as const;

const learnTopics = ['separation', 'law', 'confidence', 'elections', 'court', 'resilience'] as const;

function ShareButton({ title }: { title: string }) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);
  async function share() {
    if (navigator.share) await navigator.share({ title, url: window.location.href });
    else { await navigator.clipboard.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  }
  return <div className="share-control"><Button tone="quiet" onClick={() => void share()}>{t('actions.share')} <span aria-hidden="true">↗</span></Button>{copied && <Toast tone="success">{t('actions.copied')}</Toast>}</div>;
}

export function LandingPage() {
  const { t } = useTranslation(['landing', 'common']);
  const { locale = 'en' } = useParams();
  const format = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US');
  const formatTwoDigit = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', { minimumIntegerDigits: 2, useGrouping: false });
  const evidence = [
    { value: format.format(66), label: t('landing:evidence.articles') },
    { value: format.format(10), label: t('landing:evidence.contracts') },
    { value: format.format(963), label: t('landing:evidence.tests') },
    { value: format.format(31), label: t('landing:evidence.provinces') },
    { value: format.format(8), label: t('landing:evidence.tours') },
  ];
  const institutions = ['crown', 'majlis', 'senate', 'court', 'executive'] as const;
  return (
    <div className="public-page">
      <section className="public-container landing-hero">
        <div className="landing-hero__copy">
          <p className="public-eyebrow">{t('landing:eyebrow')}</p>
          <h1>{t('landing:title')}</h1>
          <p className="landing-hero__lead">{t('landing:intro')}</p>
          <div className="landing-hero__actions">
            <Link to={`/${locale}/simulate/tours/genesis`}><Button>{t('common:actions.startTour')} <span aria-hidden="true">→</span></Button></Link>
            <Link to={`/${locale}/simulate`}><Button tone="secondary">{t('common:actions.sandbox')}</Button></Link>
          </div>
          <p className="landing-hero__note">{t('common:disclosure')}</p>
        </div>
        <div className="constellation" aria-label={t('landing:constellationLabel')}>
          <img className="constellation__art" src="/assets/simorgh.svg" alt="" />
          {institutions.map((institution) => <Link className="constellation__node" key={institution} to={`/${locale}/learn/separation`}>{t(`landing:institutions.${institution}`)}</Link>)}
          <div className="constellation__core">{t('landing:institutions.people')}</div>
        </div>
      </section>
      <EvidenceStrip items={evidence} />

      <section className="public-section public-section--paper">
        <div className="public-container">
          <div className="public-section__head"><p className="public-eyebrow">{t('landing:stepsEyebrow')}</p><h2>{t('landing:stepsTitle')}</h2></div>
          <div className="step-grid">
            {(['read', 'decide', 'observe'] as const).map((step, index) => <article className="step-card" key={step}><span className="step-card__number">{formatTwoDigit.format(index + 1)}</span><h3>{t(`landing:steps.${step}.title`)}</h3><p>{t(`landing:steps.${step}.text`)}</p></article>)}
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container">
          <div className="public-section__head"><p className="public-eyebrow">{t('landing:scenariosEyebrow')}</p><h2>{t('landing:scenariosTitle')}</h2></div>
          <div className="scenario-grid">
            {scenarioItems.map((scenario, index) => <Link className="ds-card ds-card--interactive scenario-card" key={scenario.id} to={`/${locale}/simulate/tours/${scenario.tour}`}><div className="scenario-card__top"><Badge tone="neutral">{formatTwoDigit.format(index + 1)}</Badge><span className="scenario-card__arrow" aria-hidden="true">↗</span></div><h3>{t(`landing:scenarios.${scenario.id}.title`)}</h3><p>{t(`landing:scenarios.${scenario.id}.text`)}</p><img src={`/assets/${scenario.art}`} alt="" /></Link>)}
          </div>
        </div>
      </section>

      <section className="public-section public-section--paper">
        <div className="public-container feature-split">
          <div className="feature-copy"><p className="public-eyebrow">{t('landing:constitutionEyebrow')}</p><h2>{t('landing:constitutionTitle')}</h2><p>{t('landing:constitutionText')}</p><Link to={`/${locale}/constitution`}><Button tone="secondary">{t('common:nav.constitution')} <span aria-hidden="true">→</span></Button></Link></div>
          <div className="article-preview"><div className="article-preview__paper"><span className="article-preview__part">{locale === 'fa' ? 'بخش یکم · اصل I.4' : 'PART I · ARTICLE I.4'}</span><div className="article-preview__rule" /><h3>{locale === 'fa' ? 'تفکیک و تخصیص قوا' : 'Separation and Allocation of Powers'}</h3><p>{locale === 'fa' ? 'هر نهاد فقط آن اختیاراتی را اعمال خواهد کرد که این قانون اساسی به وی تفویض نموده باشد.' : 'Each institution shall exercise only those powers conferred upon it by this Constitution.'}</p></div></div>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container feature-split feature-split--reverse">
          <div className="feature-copy"><p className="public-eyebrow">{t('landing:transparencyEyebrow')}</p><h2>{t('landing:transparencyTitle')}</h2><p>{t('landing:transparencyText')}</p><Link to={`/${locale}/transparency`}><Button tone="secondary">{t('common:nav.transparency')} <span aria-hidden="true">→</span></Button></Link></div>
          <div className="transparency-visual" aria-hidden="true"><div className="transparency-visual__layers"><div><b>{t('landing:technicalLayers.constitution')}</b><small>{t('landing:technicalLayers.articles')}</small></div><div><b>{t('landing:technicalLayers.simulator')}</b><small>{t('landing:technicalLayers.model')}</small></div><div><b>{t('landing:technicalLayers.contracts')}</b><small>{t('landing:technicalLayers.tested')}</small></div></div></div>
        </div>
      </section>

      <section className="public-section public-section--paper"><div className="public-container community-panel"><div><p className="public-eyebrow">{t('landing:communityEyebrow')}</p><h2>{t('landing:communityTitle')}</h2><p>{t('landing:communityText')}</p></div><Link to={`/${locale}/community`}><Button>{t('common:nav.community')} <span aria-hidden="true">→</span></Button></Link></div></section>
    </div>
  );
}

export function LearnPage() {
  const { t } = useTranslation('learn');
  const { locale = 'en' } = useParams();
  const formatTwoDigit = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', { minimumIntegerDigits: 2, useGrouping: false });
  return <div className="public-page"><PageHero eyebrow={t('eyebrow')} title={t('title')} intro={t('intro')} /><section className="public-section"><div className="public-container topic-grid">{learnTopics.map((topic, index) => <Link key={topic} className="ds-card ds-card--interactive topic-card" to={`/${locale}/learn/${topic}`}><span className="topic-card__index">{t('fieldGuide')} · {formatTwoDigit.format(index + 1)}</span><h2>{t(`topics.${topic}.title`)}</h2><p>{t(`topics.${topic}.text`)}</p></Link>)}</div></section></div>;
}

export function LearnTopicPage() {
  const { topic, locale = 'en' } = useParams();
  const { t } = useTranslation(['learn', 'common']);
  const validTopic = learnTopics.includes(topic as typeof learnTopics[number]) ? topic as typeof learnTopics[number] : 'separation';
  return <div className="public-page"><PageHero eyebrow={t('learn:eyebrow')} title={t(`learn:topics.${validTopic}.title`)} intro={t(`learn:topics.${validTopic}.text`)} /><article className="public-narrow topic-detail"><p>{t('learn:detail.body1')}</p><h2>{t('learn:detail.heading')}</h2><div className="topic-callout">{t('learn:detail.callout')}</div><p>{t('learn:detail.body2')}</p><Link to={`/${locale}/simulate/tours/${validTopic === 'law' ? 'bill-lifecycle' : validTopic === 'confidence' ? 'pm-formation' : validTopic === 'elections' ? 'election-day' : validTopic === 'court' ? 'guardians' : validTopic === 'resilience' ? 'system-breaks' : 'genesis'}`}><Button>{t('common:actions.explore')} <span aria-hidden="true">→</span></Button></Link><ShareButton title={t(`learn:topics.${validTopic}.title`)} /></article></div>;
}

interface ArticleSide { id: string; title: string; partId: string; partTitle: string; body: string }
interface PairedArticle { id: string; en: ArticleSide; fa: ArticleSide }
const articles = constitutionData as PairedArticle[];

function MarkdownBody({ body }: { body: string }) {
  return <>{body.split(/\n\s*\n/).filter(Boolean).map((block, index) => block.trim().startsWith('>') ? <blockquote key={index}>{block.replace(/^>\s?/gm, '').replaceAll('**', '').replace(/`([^`]+)`/g, '$1')}</blockquote> : <p key={index}>{block.replaceAll('**', '').replace(/`([^`]+)`/g, '$1')}</p>)}</>;
}

export function ConstitutionPage() {
  const { t } = useTranslation('constitution');
  const { locale = 'en' } = useParams();
  const selectedLocale = locale as Locale;
  const [search, setSearch] = useState('');
  const [part, setPart] = useState('all');
  const localized = articles.map((article) => article[selectedLocale]);
  const parts = [...new Map(localized.map((article) => [article.partId, article.partTitle])).entries()];
  const filtered = useMemo(() => localized.filter((article) => (part === 'all' || article.partId === part) && `${article.id} ${article.title} ${article.body}`.toLocaleLowerCase(selectedLocale).includes(search.toLocaleLowerCase(selectedLocale))), [localized, part, search, selectedLocale]);
  return <div className="public-page"><PageHero eyebrow={t('eyebrow')} title={t('title')} intro={t('intro')} /><div className="public-container"><Toast tone="info"><span>{t('sourceNotice')}</span></Toast><div className="constitution-tools"><label className="ds-field"><span className="ds-field__label">{t('search')}</span><input className="ds-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><Select label={t('all')} value={part} onChange={(event) => setPart(event.target.value)}><option value="all">{t('all')}</option>{parts.map(([id, title]) => <option key={id} value={id}>{id} — {title}</option>)}</Select></div><div className="constitution-list">{filtered.map((article, index) => <details className="ds-card constitution-article" key={article.id} id={`article-${article.id}`} open={filtered.length === 1 || index === 0}><summary><span className="constitution-article__id">{t('article')} {article.id}</span><h2>{article.title}</h2></summary><div className="constitution-article__body"><MarkdownBody body={article.body} /><ShareButton title={`${t('article')} ${article.id} — ${article.title}`} /></div></details>)}{filtered.length === 0 && <EmptyState title={t('empty')} text="" />}</div></div></div>;
}

export function TransparencyPage() {
  const { t } = useTranslation(['transparency', 'common']);
  const { locale = 'en' } = useParams();
  const format = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US');
  const items = ['simulator', 'chain', 'proofs', 'limits'] as const;
  const formatTwoDigit = new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', { minimumIntegerDigits: 2, useGrouping: false });
  return <div className="public-page"><PageHero eyebrow={t('transparency:eyebrow')} title={t('transparency:title')} intro={t('transparency:intro')} /><section className="public-section"><div className="public-container"><div className="transparency-grid">{items.map((item, index) => <Card className="transparency-card" key={item}><span className="transparency-card__number">{formatTwoDigit.format(index + 1)}</span><h2>{t(`transparency:${item}.title`)}</h2><p>{t(`transparency:${item}.text`)}</p></Card>)}</div><div className="transparency-proof"><div><b>{format.format(963)}</b><span>{t('transparency:metrics.foundry')}</span></div><div><b>{format.format(638)}</b><span>{t('transparency:metrics.sdk')}</span></div><div><b>{format.format(10)}</b><span>{t('transparency:metrics.contracts')}</span></div><div><b>{format.format(13)}</b><span>{t('transparency:metrics.groth16')}</span></div><div><b>{format.format(0)}</b><span>{t('transparency:metrics.deployments')}</span></div></div></div></section></div>;
}

export function AboutPage() {
  const { t } = useTranslation('about');
  return <div className="public-page"><PageHero eyebrow={t('eyebrow')} title={t('title')} /><section className="public-narrow about-prose"><p>{t('body1')}</p><p>{t('body2')}</p><h2>{t('principles')}</h2><ol className="principles">{[1, 2, 3, 4].map((item) => <li key={item}><span>0{item}</span>{t(`p${item}`)}</li>)}</ol></section></div>;
}

export function CommunityPage() {
  const { t } = useTranslation(['community', 'common']);
  return <div className="public-page"><PageHero eyebrow={t('community:eyebrow')} title={t('community:title')} intro={t('community:intro')} /><section className="public-container community-layout"><div><h2>{t('community:feedbackTitle')}</h2><p className="community-note">{t('community:feedbackNote')}</p><div className="community-links"><a href="https://github.com/ameensol/iran-constitutional-monarchy" target="_blank" rel="noreferrer"><span>{t('community:contribute')}</span><span aria-hidden="true">↗</span></a></div></div><FeedbackForm /></section></div>;
}

export function NotFoundPage() {
  const { locale = 'en' } = useParams();
  const { t } = useTranslation('common');
  return <div className="public-page"><section className="page-hero public-container"><p className="public-eyebrow">404</p><h1>{t('notFound.title')}</h1><Link to={`/${locale}`}><Button>{t('notFound.action')}</Button></Link></section></div>;
}

function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  const location = useLocation();
  return <header className="page-hero"><div className="public-container"><p className="public-eyebrow">{eyebrow}</p><h1>{title}</h1>{intro && <p>{intro}</p>}<ShareButton title={title + location.pathname} /></div></header>;
}
