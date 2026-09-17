export interface Choice {
  label: string;
  sub: string;
  nextFrame: string;
}
import { useTranslation } from 'react-i18next';
import { activeLocale } from '../i18n/simulatorFormat';
import { localizeTourChoice } from '../i18n/tourCopy';

interface DecisionButtonsProps {
  choices: Choice[];
  onChoose: (nextFrame: string) => void;
}

export default function DecisionButtons({ choices, onChoose }: DecisionButtonsProps) {
  const { i18n } = useTranslation();
  const locale = activeLocale(i18n.language);
  return (
    <div className="decisions">
      {choices.map((choice) => (
        <button
          key={choice.nextFrame}
          className="decision-btn"
          onClick={() => onChoose(choice.nextFrame)}
        >
          {localizeTourChoice(choice.label, locale)}
          {choice.sub && <div className="decision-sub">{localizeTourChoice(choice.sub, locale)}</div>}
        </button>
      ))}
    </div>
  );
}
