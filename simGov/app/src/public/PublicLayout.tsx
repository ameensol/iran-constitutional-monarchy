import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { IconButton } from '../design-system';
import { applyDocumentLocale } from '../i18n';
import LanguageSwitcher from '../shared/LanguageSwitcher';
import './public.css';

const navigation = [
  { key: 'learn', path: 'learn' },
  { key: 'constitution', path: 'constitution' },
  { key: 'transparency', path: 'transparency' },
  { key: 'about', path: 'about' },
  { key: 'community', path: 'community' },
] as const;

export function LocaleGate() {
  const { locale } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (locale === 'en' || locale === 'fa') applyDocumentLocale(locale);
    else navigate('/en', { replace: true });
  }, [locale, navigate]);

  if (locale !== 'en' && locale !== 'fa') return null;
  return <Outlet />;
}

export function PublicLayout() {
  const { locale = 'en' } = useParams();
  const { t } = useTranslation(['common', 'accessibility']);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="public-theme">
      <a className="site-skip" href="#main-content">{t('accessibility:skip')}</a>
      <header className="site-header">
        <Link to={`/${locale}`} className="site-brand" aria-label={t('brand')}>
          <span className="site-brand__mark"><img src="/assets/rosette.svg" alt="" /></span>
          <span><b>{t('brand')}</b><small>{t('tagline')}</small></span>
        </Link>
        <nav className={menuOpen ? 'site-nav is-open' : 'site-nav'} aria-label={t('accessibility:primaryNavigation')}>
          {navigation.map((item) => <NavLink key={item.key} to={`/${locale}/${item.path}`} onClick={() => setMenuOpen(false)}>{t(`nav.${item.key}`)}</NavLink>)}
          <NavLink className="site-nav__simulate" to={`/${locale}/simulate`} onClick={() => setMenuOpen(false)}>{t('nav.simulate')} <span aria-hidden="true">↗</span></NavLink>
        </nav>
        <div className="site-header__tools">
          <LanguageSwitcher />
          <IconButton className="site-menu" label={t(menuOpen ? 'accessibility:closeMenu' : 'accessibility:menu')} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? '×' : '☰'}</IconButton>
        </div>
      </header>
      <main id="main-content"><Outlet /></main>
      <footer className="site-footer">
        <div className="site-footer__mark"><img src="/assets/lamassu.svg" alt="" /><div><strong>{t('brand')}</strong><p>{t('footer.statement')}</p></div></div>
        <div className="site-footer__links">
          <a href="https://github.com/ameensol/iran-constitutional-monarchy" target="_blank" rel="noreferrer">{t('footer.source')} ↗</a>
          <Link to={`/${locale}/transparency`}>{t('nav.transparency')}</Link>
          <Link to={`/${locale}/community`}>{t('nav.community')}</Link>
        </div>
        <p className="site-footer__disclosure">{t('disclosure')}</p>
      </footer>
    </div>
  );
}
