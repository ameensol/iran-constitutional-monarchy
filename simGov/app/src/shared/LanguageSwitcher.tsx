import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supportedLocales, type Locale } from '../i18n/resources';

export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale = 'en' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  function switchLocale(next: Locale) {
    const segments = location.pathname.split('/');
    segments[1] = next;
    navigate(`${segments.join('/')}${location.search}${location.hash}`);
  }

  return (
    <div className={`site-language ${className}`.trim()} aria-label={t('language')}>
      {supportedLocales.map((item) => (
        <button key={item} aria-pressed={locale === item} lang={item} onClick={() => switchLocale(item)}>
          {item === 'en' ? 'EN' : 'فا'}
        </button>
      ))}
    </div>
  );
}
