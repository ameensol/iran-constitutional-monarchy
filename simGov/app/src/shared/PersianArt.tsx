interface PersianArtProps {
  src: string;
  dim?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export default function PersianArt({ src, dim = false, style, className = '' }: PersianArtProps) {
  return (
    <img
      src={src}
      alt=""
      className={`${dim ? 'persian-art-dim' : 'persian-art'} ${className}`}
      style={style}
    />
  );
}
