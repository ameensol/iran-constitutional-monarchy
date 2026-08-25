interface BadgeProps {
  label: string;
  variant?: 'gold' | 'emerald' | 'rose' | 'turquoise' | 'none';
}

const variantStyles: Record<string, { bg: string; color: string; border: string }> = {
  gold:      { bg: 'rgba(201,168,76,0.15)',  color: 'var(--gold)',      border: 'rgba(201,168,76,0.3)' },
  emerald:   { bg: 'rgba(45,107,79,0.15)',   color: 'var(--emerald)',   border: 'rgba(45,107,79,0.3)' },
  rose:      { bg: 'rgba(139,58,74,0.15)',    color: 'var(--rose)',      border: 'rgba(139,58,74,0.3)' },
  turquoise: { bg: 'rgba(26,122,122,0.15)',   color: 'var(--turquoise)', border: 'rgba(26,122,122,0.3)' },
  none:      { bg: 'rgba(26,33,64,0.5)',      color: 'var(--pale-gold)', border: 'var(--lapis)' },
};

export default function Badge({ label, variant = 'gold' }: BadgeProps) {
  const s = variantStyles[variant];
  return (
    <span
      style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: 3,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {label}
    </span>
  );
}
