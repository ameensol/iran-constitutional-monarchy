import { useState } from 'react';

interface Props {
  proofHash: string;
  nullifierHash: string;
  party: string;
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return hash.slice(0, 8) + '...' + hash.slice(-4);
}

const CHECKS = [
  'Your proof is recorded on-chain',
  'Your identity is not linked to your ballot',
  'Your passport nullifier prevents double-voting',
  'Anyone can audit the total count',
];

export default function BallotReceipt({ proofHash, nullifierHash, party }: Props) {
  const [verifyOpen, setVerifyOpen] = useState(false);

  return (
    <div className="ballot-receipt">
      <div className="ballot-receipt-header">
        <div className="ballot-receipt-title">Ballot Receipt</div>
        <div className="ballot-receipt-seal" aria-hidden="true">{'\u{1F981}'}</div>
      </div>

      <div className="ballot-receipt-hashes">
        <div className="ballot-receipt-hash">
          <span className="ballot-receipt-hash-label">Proof Hash</span>
          <span className="ballot-receipt-hash-value">{truncateHash(proofHash)}</span>
        </div>
        <div className="ballot-receipt-hash">
          <span className="ballot-receipt-hash-label">Nullifier Hash</span>
          <span className="ballot-receipt-hash-value">{truncateHash(nullifierHash)}</span>
        </div>
      </div>

      <div className="ballot-receipt-privacy">
        This proof confirms you are an eligible citizen who voted for {party}. It reveals nothing else.
      </div>

      <div className="ballot-receipt-verify" onClick={() => setVerifyOpen(!verifyOpen)}>
        <div className="ballot-receipt-verify-header">
          <span className={`ballot-receipt-verify-arrow${verifyOpen ? ' open' : ''}`}>{'\u25B6'}</span>
          <span>Verify Your Vote</span>
        </div>
        {verifyOpen && (
          <div className="ballot-receipt-checks">
            {CHECKS.map((check, i) => (
              <div key={i} className="ballot-receipt-check">
                <span className="ballot-receipt-check-icon">{'\u2713'}</span>
                <span>{check}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
