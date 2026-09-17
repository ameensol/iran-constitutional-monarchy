/* eslint-disable react-refresh/only-export-components -- shared bidi renderer intentionally lives beside locale formatting helpers */
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import type { BillStage, FormationStage, Person, Province } from '../simulation/types';

export type AppLocale = 'en' | 'fa';

export function activeLocale(language: string): AppLocale {
  return language.toLowerCase().startsWith('fa') ? 'fa' : 'en';
}

export function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US').format(value);
}

export function formatPercent(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(locale === 'fa' ? 'fa-IR' : 'en-US', { style: 'percent', maximumFractionDigits: 1 }).format(value / 100);
}

export function personDisplayName(person: Person, locale: AppLocale): string {
  if (locale === 'fa' && person.firstNameFa && person.lastNameFa) return `${person.firstNameFa} ${person.lastNameFa}`;
  return `${person.firstName} ${person.lastName}`;
}

export function provinceDisplayName(province: Province | undefined, locale: AppLocale): string {
  if (!province) return '';
  return locale === 'fa' ? province.nameFa : province.name;
}

export function partyDisplayName(party: string, locale: AppLocale, t: TFunction): string {
  if (!party) return '—';
  return t(`parties.${party}.name`, { ns: 'simulator', defaultValue: party, lng: locale });
}

const NAMED_ENTITY_KEYS: Record<string, string> = {
  'Education Reform Act': 'educationReform',
  'Infrastructure Budget': 'infrastructureBudget',
  'Trade Agreement': 'tradeAgreement',
  'the Judicial Reform Act': 'judicialReform',
  'Judicial Reform Act': 'judicialReform',
  'New Legislative Proposal': 'newBill',
  'Constitutional Reform Proposal': 'constitutionalReform',
  'Emergency Constitutional Measure': 'emergencyMeasure',
  'Emergency Economic Measures': 'economicMeasures',
};

export function namedEntityDisplayName(name: string, locale: AppLocale, t: TFunction): string {
  const key = NAMED_ENTITY_KEYS[name];
  return key ? t(`namedEntities.${key}`, { ns: 'simulator', lng: locale }) : name;
}

export function billStageLabel(stage: BillStage, t: TFunction): string {
  return t(`billStages.${stage}`, { ns: 'simulator', defaultValue: stage });
}

export function formationStageLabel(stage: FormationStage, t: TFunction): string {
  return t(`formationStages.${stage}`, { ns: 'simulator', defaultValue: stage });
}

export function TechnicalText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <bdi dir="ltr" className={`technical-ltr ${className}`.trim()}>{children}</bdi>;
}
