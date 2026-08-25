export interface Choice {
  label: string;
  sub: string;
  nextFrame: string;
}

interface DecisionButtonsProps {
  choices: Choice[];
  onChoose: (nextFrame: string) => void;
}

export default function DecisionButtons({ choices, onChoose }: DecisionButtonsProps) {
  return (
    <div className="decisions">
      {choices.map((choice) => (
        <button
          key={choice.nextFrame}
          className="decision-btn"
          onClick={() => onChoose(choice.nextFrame)}
        >
          {choice.label}
          {choice.sub && <div className="decision-sub">{choice.sub}</div>}
        </button>
      ))}
    </div>
  );
}
