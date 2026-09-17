import { useTranslation } from 'react-i18next';

export default function TourActionHint() {
  const { t } = useTranslation('tours');
  return (
    <div className="tour-action-hint" role="status">
      <span className="tour-action-hint-icon" aria-hidden="true">{'\u261D'}</span>
      <span>{t('narrator.usePanel')}</span>
    </div>
  );
}
