import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, type Locale } from './resources';

const savedLocale = localStorage.getItem('constitution-lab-locale');
const browserLocale = navigator.language.toLowerCase().startsWith('fa') ? 'fa' : 'en';
const initialLocale: Locale = savedLocale === 'fa' || savedLocale === 'en' ? savedLocale : browserLocale;

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'landing', 'learn', 'constitution', 'transparency', 'about', 'community', 'feedback', 'accessibility', 'simulator', 'tours', 'shah'],
  interpolation: { escapeValue: false },
});

export function applyDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr';
  localStorage.setItem('constitution-lab-locale', locale);
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
}

export default i18n;
