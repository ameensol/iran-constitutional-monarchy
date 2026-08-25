interface BillFlowchartProps {
  activePath: string | null;
}

const paths: { key: string; label: string; steps: string[] }[] = [
  { key: 'sign',                        label: 'Signed',              steps: ['Submit', 'Majlis', 'Senate', 'Crown', 'Signed', 'Enacted'] },
  { key: 'reject',                      label: 'Rejected',            steps: ['Submit', 'Majlis', 'Rejected'] },
  { key: 'return-readopt-sign',         label: 'Return \u2192 Sign',        steps: ['Submit', 'Majlis', 'Senate', 'Crown', 'Returned', 'Revote', 'Crown', 'Signed'] },
  { key: 'return-drop',                 label: 'Return \u2192 Drop',        steps: ['Submit', 'Majlis', 'Senate', 'Crown', 'Returned', 'Dropped'] },
  { key: 'return-readopt-refer-uphold', label: 'Return \u2192 Upheld',      steps: ['Submit', 'Majlis', 'Senate', 'Crown', 'Returned', 'Revote', 'Crown', 'Court', 'Upheld'] },
  { key: 'return-readopt-refer-strike', label: 'Return \u2192 Vetoed',      steps: ['Submit', 'Majlis', 'Senate', 'Crown', 'Returned', 'Revote', 'Crown', 'Court', 'Vetoed'] },
  { key: 'senate-object',               label: 'Senate Override',     steps: ['Submit', 'Majlis', 'Senate', 'Objection', 'Override', 'Crown', '...'] },
];

export default function BillFlowchart({ activePath }: BillFlowchartProps) {
  return (
    <div className="flowchart">
      {paths.map((path) => {
        const isActive = path.key === activePath;
        return (
          <div
            key={path.key}
            className={`flowchart-path ${isActive ? 'flowchart-path-active' : ''}`}
          >
            <div className="flowchart-label">{path.label}</div>
            <div className="flowchart-steps">
              {path.steps.map((step, i) => (
                <span key={i} className="flowchart-step">
                  {step}
                  {i < path.steps.length - 1 && <span className="flowchart-arrow">{'\u2192'}</span>}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
