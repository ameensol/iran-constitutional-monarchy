interface ShahDialogueProps {
  text: string;
}

export default function ShahDialogue({ text }: ShahDialogueProps) {
  return (
    <div className="shah-dialogue">
      <div className="shah-avatar">
        <img src="/assets/king-and-noble.svg" className="persian-art" alt="" />
      </div>
      <div className="shah-text">
        &ldquo;{text}&rdquo;
      </div>
    </div>
  );
}
