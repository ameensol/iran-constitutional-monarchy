import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { activeLocale, partyDisplayName, TechnicalText } from '../i18n/simulatorFormat';

interface Props {
  proofHash: string;
  nullifierHash: string;
  party: string;
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return hash.slice(0, 8) + '...' + hash.slice(-4);
}

export default function BallotReceipt({ proofHash, nullifierHash, party }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const checks = ['recorded', 'private', 'single', 'auditable'] as const;
  const [verifyOpen, setVerifyOpen] = useState(false);

  return (
    <div className="ballot-receipt">
      <div className="ballot-receipt-header">
        <div className="ballot-receipt-title">{t('receipt.title')}</div>
        <div className="ballot-receipt-seal" aria-hidden="true">{'\u{1F981}'}</div>
      </div>

      <div className="ballot-receipt-hashes">
        <div className="ballot-receipt-hash">
          <span className="ballot-receipt-hash-label">{t('receipt.proof')}</span>
          <span className="ballot-receipt-hash-value"><TechnicalText>{truncateHash(proofHash)}</TechnicalText></span>
        </div>
        <div className="ballot-receipt-hash">
          <span className="ballot-receipt-hash-label">{t('receipt.nullifier')}</span>
          <span className="ballot-receipt-hash-value"><TechnicalText>{truncateHash(nullifierHash)}</TechnicalText></span>
        </div>
      </div>

      <div className="ballot-receipt-privacy">
        {t('receipt.privacy', { party: partyDisplayName(party, locale, t) })}
      </div>

      <div className="ballot-receipt-verify" onClick={() => setVerifyOpen(!verifyOpen)}>
        <div className="ballot-receipt-verify-header">
          <span className={`ballot-receipt-verify-arrow${verifyOpen ? ' open' : ''}`}>{'\u25B6'}</span>
          <span>{t('receipt.verify')}</span>
        </div>
        {verifyOpen && (
          <div className="ballot-receipt-checks">
            {checks.map((check, i) => (
              <div key={i} className="ballot-receipt-check">
                <span className="ballot-receipt-check-icon">{'\u2713'}</span>
                <span>{t(`receipt.checks.${check}`)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
