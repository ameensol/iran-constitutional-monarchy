import type { GovEvent, Headline, HeadlineCategory } from '../simulation/types';
import { generateHeadline } from '../dashboard/headlines';
import { formatNumber, type AppLocale } from './simulatorFormat';
import { simulatorEn, simulatorFa } from './simulatorResources';

interface FaRule {
  pattern: RegExp;
  render: (match: RegExpMatchArray) => { text: string; subtext?: string };
  category: HeadlineCategory;
  breaking?: boolean;
}

const n = (value: string) => formatNumber(Number(value), 'fa');

function translateKnownEntities(value: string | undefined): string | undefined {
  if (!value) return value;
  let translated = value;
  for (const key of Object.keys(simulatorEn.namedEntities) as Array<keyof typeof simulatorEn.namedEntities>) {
    translated = translated.replaceAll(`the ${simulatorEn.namedEntities[key]}`, simulatorFa.namedEntities[key]);
    translated = translated.replaceAll(simulatorEn.namedEntities[key], simulatorFa.namedEntities[key]);
  }
  return translated;
}

const faRules: FaRule[] = [
  { pattern: /^DISASTER: (.+)$/, render: (m) => ({ text: `بحران شبیه‌سازی‌شده: ${m[1]}`, subtext: 'سازوکارهای قانون اساسی فعال شدند' }), category: 'CRISIS', breaking: true },
  { pattern: /^The Crown signed (.+) into law$/, render: (m) => ({ text: `لایحهٔ «${m[1]}» لازم‌الاجرا شد`, subtext: 'توشیح پادشاه انجام شد' }), category: 'LEGISLATION' },
  { pattern: /^The Crown returned (.+) to the Majlis/, render: (m) => ({ text: `تاج لایحهٔ «${m[1]}» را به مجلس بازگرداند`, subtext: 'ایرادهای تاج برای بازنگری اعلام شد' }), category: 'CROWN' },
  { pattern: /^(?:Crown deadline expired|Anyone enforced the Crown deadline) for (.+); enacted automatically$/, render: (m) => ({ text: `لایحهٔ «${m[1]}» خودکار لازم‌الاجرا شد`, subtext: 'تاج در مهلت ۳۰روزه اقدام نکرد' }), category: 'LEGISLATION' },
  { pattern: /^Crown referred (.+) to Supreme Court/, render: (m) => ({ text: `تاج لایحهٔ «${m[1]}» را به دیوان عالی ارجاع داد`, subtext: 'رسیدگی قانون اساسی درخواست شد' }), category: 'JUDICIARY' },
  { pattern: /^Crown powers suspended$/, render: () => ({ text: 'اختیارات تاج تعلیق شد', subtext: 'سنا وظیفهٔ اضطراری را بر عهده می‌گیرد' }), category: 'CRISIS', breaking: true },
  { pattern: /^Crown powers resumed$/, render: () => ({ text: 'اختیارات تاج از سر گرفته شد', subtext: 'نظم قانون اساسی بازگشت' }), category: 'CROWN', breaking: true },
  { pattern: /^Crown resumed: (.+) crowned as new monarch$/, render: (m) => ({ text: `${m[1]} به پادشاهی رسید`, subtext: 'اختیارات تاج از سر گرفته شد' }), category: 'CROWN', breaking: true },
  { pattern: /^(.+) abdicated; (.+) crowned as successor$/, render: (m) => ({ text: `${m[1]} از تاج‌وتخت کناره‌گیری کرد`, subtext: `${m[2]} جانشین او شد` }), category: 'CROWN', breaking: true },
  { pattern: /^(.+) abdicated; no heir available/, render: (m) => ({ text: `${m[1]} کناره‌گیری کرد و جانشینی وجود ندارد`, subtext: 'اختیارات تاج تعلیق شد' }), category: 'CRISIS', breaking: true },
  { pattern: /^Crown nominated (.+) for Prime Minister$/, render: (m) => ({ text: `تاج ${m[1]} را نامزد نخست‌وزیری کرد` }), category: 'EXECUTIVE' },
  { pattern: /^Crown appointed (.+) as Senator/, render: (m) => ({ text: `${m[1]} با حکم تاج به سنا منصوب شد` }), category: 'CROWN' },
  { pattern: /^No heirs available; Crown suspended$/, render: () => ({ text: 'جانشینی برای تاج وجود ندارد', subtext: 'اختیارات تاج تعلیق شد' }), category: 'CRISIS', breaking: true },
  { pattern: /^Succession list updated/, render: () => ({ text: 'ترتیب جانشینی تاج به‌روز شد' }), category: 'CROWN' },
  { pattern: /^Monarch (.+) has died$/, render: (m) => ({ text: 'پادشاه درگذشت', subtext: `${m[1]} درگذشته است` }), category: 'CRISIS', breaking: true },
  { pattern: /^Monarch (.+) has resigned$/, render: (m) => ({ text: `پادشاه ${m[1]} استعفا داد` }), category: 'CROWN', breaking: true },
  { pattern: /^Monarch (.+) has been incapacitated$/, render: (m) => ({ text: `پادشاه ${m[1]} از انجام وظیفه ناتوان شد`, subtext: 'فرایند جانشینی فعال شد' }), category: 'CRISIS', breaking: true },
  { pattern: /^(.+) crowned as (?:new monarch|sovereign)$/, render: (m) => ({ text: `${m[1]} به پادشاهی رسید` }), category: 'CROWN', breaking: true },
  { pattern: /^(.+) passed the Majlis \((\d+)-(\d+)\)$/, render: (m) => ({ text: `مجلس لایحهٔ «${m[1]}» را تصویب کرد`, subtext: `${n(m[2])} موافق و ${n(m[3])} مخالف` }), category: 'LEGISLATION' },
  { pattern: /^(.+) rejected by the Majlis \((\d+)-(\d+)\)$/, render: (m) => ({ text: `لایحهٔ «${m[1]}» در مجلس رأی نیاورد`, subtext: `${n(m[2])} موافق و ${n(m[3])} مخالف` }), category: 'LEGISLATION' },
  { pattern: /^Senate approved (.+) \((\d+)-(\d+)\)$/, render: (m) => ({ text: `سنا لایحهٔ «${m[1]}» را تصویب کرد`, subtext: `${n(m[2])} موافق و ${n(m[3])} مخالف؛ لایحه به تاج می‌رود` }), category: 'LEGISLATION' },
  { pattern: /^Senate approved (.+); sent to the Crown$/, render: (m) => ({ text: `سنا لایحهٔ «${m[1]}» را تصویب کرد`, subtext: 'لایحه به تاج فرستاده شد' }), category: 'LEGISLATION' },
  { pattern: /^Senate objected to (.+)/, render: (m) => ({ text: `سنا به لایحهٔ «${m[1]}» اعتراض کرد`, subtext: 'لایحه به مجلس بازگشت' }), category: 'LEGISLATION' },
  { pattern: /^(.+) submitted to the Majlis$/, render: (m) => ({ text: `لایحهٔ تازه: «${m[1]}»`, subtext: 'به مجلس ارائه شد' }), category: 'LEGISLATION' },
  { pattern: /^(.+) placed on Majlis agenda for voting$/, render: (m) => ({ text: `لایحهٔ «${m[1]}» در دستور رأی‌گیری مجلس قرار گرفت` }), category: 'LEGISLATION' },
  { pattern: /^Majlis overrode Senate objection on (.+)/, render: (m) => ({ text: `مجلس از اعتراض سنا به «${m[1]}» عبور کرد`, subtext: 'اکثریت مطلق به دست آمد' }), category: 'LEGISLATION' },
  { pattern: /^Majlis failed to override Senate objection on (.+)/, render: (m) => ({ text: `عبور مجلس از اعتراض سنا به «${m[1]}» ناموفق بود` }), category: 'LEGISLATION' },
  { pattern: /^Majlis begins revote on (.+)/, render: (m) => ({ text: `رأی‌گیری دوباره دربارهٔ «${m[1]}» آغاز شد` }), category: 'LEGISLATION' },
  { pattern: /^Majlis re-adopted (.+)/, render: (m) => ({ text: `مجلس «${m[1]}» را دوباره تصویب کرد`, subtext: 'لایحه بار دیگر به تاج فرستاده شد' }), category: 'LEGISLATION' },
  { pattern: /^Majlis dropped (.+) after Crown return/, render: (m) => ({ text: `مجلس لایحهٔ «${m[1]}» را پس از بازگشت کنار گذاشت` }), category: 'LEGISLATION' },
  { pattern: /^(?:Formation exhausted; )?Parliament dissolved/, render: () => ({ text: 'پارلمان منحل شد', subtext: 'انتخابات تازه باید برگزار شود' }), category: 'CRISIS', breaking: true },
  { pattern: /^(.+) confirmed as Prime Minister/, render: (m) => ({ text: `${m[1]} نخست‌وزیر شد` }), category: 'EXECUTIVE', breaking: true },
  { pattern: /^Prime Minister seated after confidence vote$/, render: () => ({ text: 'نخست‌وزیر پس از رأی اعتماد در مقام قرار گرفت', subtext: 'تشکیل دولت به پایان رسید' }), category: 'EXECUTIVE', breaking: true },
  { pattern: /^No-confidence passed.*: (.+) removed from office$/, render: (m) => ({ text: `${m[1]} از نخست‌وزیری برکنار شد`, subtext: 'رأی سلب اعتماد تصویب شد' }), category: 'EXECUTIVE', breaking: true },
  { pattern: /^No-confidence motion failed/, render: () => ({ text: 'رأی سلب اعتماد شکست خورد', subtext: 'نخست‌وزیر اعتماد مجلس را حفظ کرد' }), category: 'EXECUTIVE' },
  { pattern: /^No-confidence motion filed/, render: () => ({ text: 'درخواست سلب اعتماد ثبت شد', subtext: 'مجلس رأی‌گیری خواهد کرد' }), category: 'EXECUTIVE' },
  { pattern: /^Parliament denied confidence/, render: () => ({ text: 'پارلمان رأی اعتماد نداد', subtext: 'فرایند تشکیل دولت ادامه دارد' }), category: 'EXECUTIVE' },
  { pattern: /^Prime Minister (.+) has (died|resigned|been incapacitated)$/, render: (m) => ({ text: m[2] === 'died' ? `نخست‌وزیر ${m[1]} درگذشت` : m[2] === 'resigned' ? `نخست‌وزیر ${m[1]} استعفا داد` : `نخست‌وزیر ${m[1]} از انجام وظیفه ناتوان شد` }), category: 'CRISIS', breaking: true },
  { pattern: /^Deputy PM (.+) serving as caretaker$/, render: (m) => ({ text: `${m[1]} سرپرستی دولت را بر عهده گرفت` }), category: 'EXECUTIVE' },
  { pattern: /^PM designated (.+) as Deputy Prime Minister$/, render: (m) => ({ text: `${m[1]} معاون نخست‌وزیر شد` }), category: 'EXECUTIVE' },
  { pattern: /^Majlis presented candidate list/, render: () => ({ text: 'مجلس فهرست نامزدهای نخست‌وزیری را ارائه کرد', subtext: 'تاج یک نفر را انتخاب می‌کند' }), category: 'EXECUTIVE' },
  { pattern: /^(Senate|Crown) picked (.+) from the Majlis list as Prime Minister$/, render: (m) => ({ text: `${m[2]} از فهرست مجلس نخست‌وزیر شد`, subtext: m[1] === 'Senate' ? 'انتخاب سنا' : 'انتخاب تاج' }), category: 'EXECUTIVE', breaking: true },
  { pattern: /^Senate initiated PM formation/, render: () => ({ text: 'سنا فرایند تشکیل دولت را آغاز کرد', subtext: 'اختیارات تاج تعلیق است' }), category: 'EXECUTIVE', breaking: true },
  { pattern: /nomination deadline expired/, render: () => ({ text: 'مهلت نامزدی نخست‌وزیر پایان یافت' }), category: 'EXECUTIVE' },
  { pattern: /confidence vote expired/, render: () => ({ text: 'مهلت رأی اعتماد پایان یافت' }), category: 'EXECUTIVE' },
  { pattern: /Majlis list deadline expired/, render: () => ({ text: 'مهلت فهرست نامزدهای مجلس پایان یافت' }), category: 'EXECUTIVE' },
  { pattern: /^Supreme Court upheld (.+); enacted into law$/, render: (m) => ({ text: `دیوان عالی لایحهٔ «${m[1]}» را تأیید کرد`, subtext: 'لایحه با قانون اساسی سازگار و لازم‌الاجرا شد' }), category: 'JUDICIARY' },
  { pattern: /^Supreme Court struck down (.+) as unconstitutional$/, render: (m) => ({ text: `دیوان عالی «${m[1]}» را خلاف قانون اساسی دانست` }), category: 'JUDICIARY' },
  { pattern: /^Supreme Court lost quorum/, render: () => ({ text: 'دیوان عالی حد نصاب را از دست داد' }), category: 'CRISIS', breaking: true },
  { pattern: /^Supreme Court quorum restored/, render: () => ({ text: 'حد نصاب دیوان عالی برقرار شد' }), category: 'JUDICIARY' },
  { pattern: /^Constitutional review filed for Bill #(\d+)$/, render: (m) => ({ text: `رسیدگی قانون اساسی برای لایحهٔ شمارهٔ ${n(m[1])} ثبت شد` }), category: 'JUDICIARY' },
  { pattern: /^Supreme Court resolved dispute in favor of (.+)$/, render: (m) => ({ text: `دیوان عالی به سود ${m[1]} رأی داد`, subtext: 'اختلاف نهادی حل شد' }), category: 'JUDICIARY' },
  { pattern: /^Justice Seat (\d+): (.+)$/, render: (m) => ({ text: `کرسی ${n(m[1])} دیوان عالی: ${m[2]}` }), category: 'JUDICIARY' },
  { pattern: /^(.+) election started$/, render: (m) => ({ text: `انتخابات ${m[1]} آغاز شد` }), category: 'ELECTIONS' },
  { pattern: /^(.+) voting has begun$/, render: (m) => ({ text: `رأی‌گیری ${m[1]} آغاز شد` }), category: 'ELECTIONS' },
  { pattern: /^(.+) votes tallied$/, render: (m) => ({ text: `آرای ${m[1]} شمارش شد` }), category: 'ELECTIONS' },
  { pattern: /^Majlis general election tallied, (\d+) seats filled$/, render: (m) => ({ text: 'آرای انتخابات سراسری مجلس شمارش شد', subtext: `${n(m[1])} کرسی پر شد` }), category: 'ELECTIONS' },
  { pattern: /^(.+) winners seated$/, render: (m) => ({ text: `برگزیدگان ${m[1]} بر کرسی نشستند` }), category: 'ELECTIONS' },
  { pattern: /^Scheduled election has begun$/, render: () => ({ text: 'انتخابات برنامه‌ریزی‌شده آغاز شد' }), category: 'ELECTIONS' },
  { pattern: /^General election opened/, render: () => ({ text: 'انتخابات سراسری آغاز شد', subtext: 'رأی‌گیری در همهٔ استان‌ها' }), category: 'ELECTIONS', breaking: true },
  { pattern: /by-election\(s?\) completed/, render: () => ({ text: 'انتخابات میان‌دوره‌ای پایان یافت' }), category: 'ELECTIONS' },
  { pattern: /^Elections held:/, render: () => ({ text: 'انتخابات ملی برگزار شد', subtext: 'شوراها، مجلس و سنا انتخاب شدند' }), category: 'ELECTIONS', breaking: true },
  { pattern: /^Provincial council election opened in (.+)$/, render: (m) => ({ text: `انتخابات شورای استان ${m[1]} آغاز شد` }), category: 'ELECTIONS' },
  { pattern: /^Referendum (?:approved|passed):.*"(.+)" enacted/, render: (m) => ({ text: `مردم تصمیم گرفتند: اصلاحیهٔ «${m[1]}» تصویب شد`, subtext: 'همه‌پرسی با رأی موافق پایان یافت' }), category: 'CONSTITUTIONAL', breaking: true },
  { pattern: /^Referendum (?:rejected|failed): .*"(.+)"$/, render: (m) => ({ text: `اصلاحیهٔ «${m[1]}» در همه‌پرسی رد شد` }), category: 'CONSTITUTIONAL', breaking: true },
  { pattern: /^Amendment proposed: "(.+)"/, render: (m) => ({ text: `اصلاحیهٔ پیشنهادی: «${m[1]}»` }), category: 'CONSTITUTIONAL' },
  { pattern: /^Emergency amendment "(.+)" enacted by Parliament$/, render: (m) => ({ text: `اصلاحیهٔ اضطراری «${m[1]}» در پارلمان تصویب شد` }), category: 'CONSTITUTIONAL', breaking: true },
  { pattern: /^Amendment "(.+)" approved by Parliament; referendum called$/, render: (m) => ({ text: `همه‌پرسی دربارهٔ «${m[1]}» برگزار می‌شود` }), category: 'CONSTITUTIONAL' },
  { pattern: /^Amendment "(.+)" rejected by Parliament$/, render: (m) => ({ text: `پارلمان اصلاحیهٔ «${m[1]}» را رد کرد` }), category: 'CONSTITUTIONAL' },
  { pattern: /^Amendment "(.+)" placed before Parliament/, render: (m) => ({ text: `اصلاحیهٔ «${m[1]}» پیش روی پارلمان است` }), category: 'CONSTITUTIONAL' },
  { pattern: /^PM proposed FY (\d+) budget \((\d+) units\)$/, render: (m) => ({ text: `بودجهٔ سال مالی ${n(m[1])} پیشنهاد شد`, subtext: `${n(m[2])} واحد؛ در انتظار تصمیم پارلمان` }), category: 'BUDGET' },
  { pattern: /^Parliament approved FY (\d+) budget$/, render: (m) => ({ text: `بودجهٔ سال مالی ${n(m[1])} تصویب شد` }), category: 'BUDGET' },
  { pattern: /^Parliament rejected FY (\d+) budget/, render: (m) => ({ text: `بودجهٔ سال مالی ${n(m[1])} رد شد` }), category: 'BUDGET' },
  { pattern: /^FY (\d+) budget activated$/, render: (m) => ({ text: `بودجهٔ سال مالی ${n(m[1])} فعال شد` }), category: 'BUDGET' },
  { pattern: /^Fiscal year (\d+) begins/, render: (m) => ({ text: `سال مالی ${n(m[1])} آغاز شد` }), category: 'BUDGET' },
  { pattern: /^Fiscal year (\d+) budget enacted$/, render: (m) => ({ text: `بودجهٔ سال مالی ${n(m[1])} لازم‌الاجرا شد` }), category: 'BUDGET' },
  { pattern: /^No budget proposed.*prior year budget continues/, render: () => ({ text: 'مهلت بودجه از دست رفت', subtext: 'بودجهٔ سال پیش ادامه می‌یابد' }), category: 'BUDGET' },
  { pattern: /^Parliament continued prior year budget/, render: () => ({ text: 'پارلمان ادامهٔ بودجهٔ سال پیش را تصویب کرد' }), category: 'BUDGET' },
  { pattern: /^Parliament approved supplementary budget/, render: () => ({ text: 'بودجهٔ تکمیلی تصویب شد' }), category: 'BUDGET' },
  { pattern: /^Audit Head submitted.*: (clean|issues found)$/, render: (m) => ({ text: m[1] === 'clean' ? 'گزارش حسابرسی بدون ایراد بود' : 'گزارش حسابرسی ایرادهایی یافت' }), category: 'BUDGET' },
  { pattern: /^Parliament appointed (.+) as Audit Head/, render: (m) => ({ text: `${m[1]} رئیس حسابرسی شد` }), category: 'BUDGET' },
  { pattern: /^Audit Head term expired/, render: () => ({ text: 'دورهٔ رئیس حسابرسی پایان یافت' }), category: 'BUDGET' },
  { pattern: /^Executive allocated (\d+)% of budget/, render: (m) => ({ text: `${n(m[1])}٪ بودجه تخصیص یافت` }), category: 'BUDGET' },
  { pattern: /^Collective petition created: "(.+)"/, render: (m) => ({ text: `دادخواست جمعی «${m[1]}» آغاز شد` }), category: 'CONSTITUTIONAL' },
  { pattern: /petition "(.+)" reached .+ signatures/, render: (m) => ({ text: `دادخواست «${m[1]}» به حد نصاب رسید` }), category: 'CONSTITUTIONAL' },
  { pattern: /^Passport issued to (.+) in (.+)$/, render: (m) => ({ text: `گذرنامهٔ مدنی برای ${m[1]} صادر شد`, subtext: `استان ${m[2]}` }), category: 'ELECTIONS' },
  { pattern: /^(.+) cast their ballot$/, render: (m) => ({ text: `${m[1]} رأی خود را ثبت کرد`, subtext: 'رأی با موفقیت ثبت شد' }), category: 'ELECTIONS' },
  { pattern: /^Constitution deployed/, render: () => ({ text: 'قانون اساسی روی زنجیره مستقر شد', subtext: 'دوره‌ای تازه آغاز می‌شود' }), category: 'CONSTITUTIONAL', breaking: true },
  { pattern: /^First Parliament convened/, render: () => ({ text: 'نخستین پارلمان تشکیل شد' }), category: 'LEGISLATION', breaking: true },
  { pattern: /^Supreme Court seated/, render: () => ({ text: 'قاضیان دیوان عالی بر کرسی نشستند' }), category: 'JUDICIARY', breaking: true },
  { pattern: /Provincial council rebuilt in (.+)/, render: (m) => ({ text: `شورای استان ${m[1]} بازسازی شد` }), category: 'ELECTIONS' },
];

const fallbackByMarker: Record<GovEvent['marker'], string> = {
  crown: 'گزارش تازه‌ای از تاج ثبت شد', parl: 'گزارش تازه‌ای از پارلمان ثبت شد', exec: 'گزارش تازه‌ای از دولت ثبت شد',
  court: 'گزارش تازه‌ای از دیوان عالی ثبت شد', election: 'گزارش تازه‌ای از انتخابات ثبت شد', budget: 'گزارش تازه‌ای از بودجه ثبت شد',
};

export function generateLocalizedHeadline(event: GovEvent, locale: AppLocale): Headline {
  if (locale === 'en') return generateHeadline(event);
  for (const rule of faRules) {
    const match = event.description.match(rule.pattern);
    if (match) {
      const rendered = rule.render(match);
      return { text: translateKnownEntities(rendered.text) ?? rendered.text, subtext: translateKnownEntities(rendered.subtext), category: rule.category, breaking: rule.breaking ?? false };
    }
  }
  const english = generateHeadline(event);
  return { text: fallbackByMarker[event.marker], category: english.category, breaking: english.breaking };
}

export function localizedEventSearchText(event: GovEvent, locale: AppLocale): string {
  const headline = generateLocalizedHeadline(event, locale);
  return `${headline.text} ${headline.subtext ?? ''} ${locale === 'en' ? event.description : ''}`.toLocaleLowerCase(locale === 'fa' ? 'fa-IR' : 'en-US');
}
