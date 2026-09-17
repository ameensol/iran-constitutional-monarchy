interface ShahDialogueProps {
  text: string;
  context?: string;
}
import { useTranslation } from 'react-i18next';
import { activeLocale } from '../i18n/simulatorFormat';
import { localizeTourNarration } from '../i18n/tourCopy';

export default function ShahDialogue({ text, context }: ShahDialogueProps) {
  const { i18n } = useTranslation();
  const localized = localizeTourNarration(text, context, activeLocale(i18n.language));
  return (
    <div className="shah-dialogue">
      <div className="shah-avatar">
        <img src="/assets/king-and-noble.svg" className="persian-art" alt="" />
      </div>
      <div className="shah-text">
        &ldquo;{localized}&rdquo;
      </div>
    </div>
  );
}
