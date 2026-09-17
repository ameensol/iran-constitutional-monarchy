import { describe, expect, it } from 'vitest';
import { resources } from '../i18n/resources';
import { shahEn, shahFa, simulatorEn, simulatorFa, toursEn, toursFa } from '../i18n/simulatorResources';
import { formatNumber, partyDisplayName, personDisplayName, provinceDisplayName } from '../i18n/simulatorFormat';
import { generateLocalizedHeadline, localizedEventSearchText } from '../i18n/eventLocalization';
import { createInitialState } from '../simulation/initialState';
import i18n from '../i18n';

i18n.addResourceBundle('en', 'simulator', simulatorEn, true, true);
i18n.addResourceBundle('fa', 'simulator', simulatorFa, true, true);

function flatten(value: unknown, prefix = '', result: Record<string, string> = {}) {
  if (typeof value === 'string') result[prefix] = value;
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, result);
  }
  return result;
}

function parameters(value: string) {
  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)].map((match) => match[1]).sort();
}

describe('Persian simulator localization', () => {
  const catalogs = {
    public: [resources.en, resources.fa], simulator: [simulatorEn, simulatorFa], tours: [toursEn, toursFa], shah: [shahEn, shahFa],
  } as const;
  it.each(Object.entries(catalogs))('%s has matching English and Persian keys and interpolation parameters', (_namespace, pair) => {
    const en = flatten(pair[0]);
    const fa = flatten(pair[1]);
    expect(Object.keys(fa).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) expect(parameters(fa[key])).toEqual(parameters(en[key]));
  });

  it('uses Persian digits and Persian-script generated entities', () => {
    const state = createInitialState();
    const person = state.people.find((item) => item.firstNameFa && item.lastNameFa)!;
    expect(formatNumber(1404, 'fa')).toBe('۱٬۴۰۴');
    expect(personDisplayName(person, 'fa')).toMatch(/[\u0600-\u06ff]/);
    expect(provinceDisplayName(state.provinces[0], 'fa')).toBe('تهران');
    expect(partyDisplayName('Azadi', 'fa', i18n.getFixedT('fa', 'simulator'))).toBe('آزادی');
  });

  it('renders and searches a governance event without exposing its English sentence', () => {
    const event = { day: 3, marker: 'parl' as const, description: 'Civil Rights Bill passed the Majlis (130-20)', call: 'Parliament.resolveMajlisVote(1)' };
    const headline = generateLocalizedHeadline(event, 'fa');
    expect(headline.text).toContain('مجلس');
    expect(headline.subtext).toContain('۱۳۰');
    expect(localizedEventSearchText(event, 'fa')).not.toContain('passed the majlis');
  });
});
