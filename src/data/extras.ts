import type { ServiceBundle, SymptomCategory } from '../lib/types'

/** Built-in one-tap service bundles; parts a model doesn't have are skipped */
export const BUILTIN_BUNDLES: ServiceBundle[] = [
  { id: 'oil', name: 'سرویس روغن', partIds: ['engine-oil', 'oil-filter'] },
  { id: 'oil-full', name: 'روغن + فیلترها', partIds: ['engine-oil', 'oil-filter', 'air-filter', 'cabin-filter'] },
  { id: 'major', name: 'سرویس ۲۰ هزار', partIds: ['engine-oil', 'oil-filter', 'air-filter', 'cabin-filter', 'fuel-filter', 'spark-plugs'] },
  { id: 'timing', name: 'سرویس تسمه تایم', partIds: ['timing-kit', 'water-pump', 'accessory-belt'] },
  { id: 'brakes-front', name: 'ترمز جلو', partIds: ['front-pads', 'front-discs'] },
  { id: 'fluids', name: 'مایعات', partIds: ['brake-fluid', 'coolant'] },
  { id: 'tires', name: 'تنظیم و جابجایی لاستیک', partIds: ['wheel-alignment', 'tire-rotation'] },
]

export interface SeasonalTip {
  id: string
  /** Jalali month and day the reminder fires */
  jm: number
  jd: number
  title: string
  items: string[]
  /** Parts worth checking — linked from the tip */
  partIds?: string[]
}

export const SEASONAL_TIPS: SeasonalTip[] = [
  {
    id: 'winter',
    jm: 8,
    jd: 20,
    title: 'آماده‌سازی برای زمستان',
    items: ['غلظت ضدیخ را با ضدیخ‌سنج بسنج (تا ۲۰- درجه کافی است)', 'باتری را تست کن؛ سرما باتری ضعیف را از کار می‌اندازد', 'تیغه‌های برف‌پاک‌کن و مایع شیشه‌شور ضدیخ', 'بخاری و فن را امتحان کن', 'آج لاستیک‌ها؛ برای سفر کوهستانی زنجیر چرخ'],
    partIds: ['coolant', 'battery', 'wipers'],
  },
  {
    id: 'nowruz',
    jm: 12,
    jd: 10,
    title: 'چک قبل از سفر نوروزی',
    items: ['سرویس‌هایی که نزدیک موعدند را قبل از سفر انجام بده', 'اعتبار بیمه و معاینه فنی', 'لاستیک زاپاس، جک و آچار چرخ', 'لنت و روغن ترمز', 'چراغ‌ها و بوق'],
    partIds: ['front-pads', 'brake-fluid', 'tires'],
  },
  {
    id: 'summer',
    jm: 2,
    jd: 20,
    title: 'آماده‌سازی برای گرمای تابستان',
    items: ['سرویس کولر و شارژ گاز', 'فیلتر کابین را عوض یا تمیز کن', 'فن رادیاتور و ترموستات را امتحان کن', 'سطح آب رادیاتور و شیلنگ‌ها', 'باد لاستیک‌ها در گرما بالا می‌رود؛ سرد اندازه بگیر'],
    partIds: ['ac-service', 'cabin-filter', 'coolant', 'thermostat'],
  },
  {
    id: 'autumn',
    jm: 7,
    jd: 5,
    title: 'بعد از تابستان',
    items: ['فیلتر هوا پس از گرد و خاک تابستان', 'شستشوی رادیاتور و کندانسور از حشرات و خاک', 'باتری (گرمای تابستان عمرش را کم کرده)'],
    partIds: ['air-filter', 'battery'],
  },
]

/** Which parts are worth looking at for a symptom, by keyword first, then category */
export const SYMPTOM_PART_HINTS: { match: RegExp; parts: string[] }[] = [
  { match: /ترمز|جیرجیر|قژ/, parts: ['front-pads', 'rear-pads', 'rear-shoes', 'front-discs', 'brake-fluid'] },
  { match: /تسمه|جیغ|کولر روشن/, parts: ['accessory-belt', 'timing-kit'] },
  { match: /دنده|گیربکس|ضربه/, parts: ['atf', 'atf-filter', 'gearbox-oil', 'clutch-kit', 'engine-mounts'] },
  { match: /لرزش.*(درجا|توقف|D)|کپ|بد کار/, parts: ['spark-plugs', 'ignition-coil', 'plug-wires', 'throttle-clean', 'engine-mounts'] },
  { match: /فرمان|سیبک|تق/, parts: ['control-arm', 'front-shocks', 'wheel-alignment', 'ps-fluid'] },
  { match: /ضدیخ|رادیاتور|جوش|شیرین|دمای/, parts: ['coolant', 'water-pump', 'thermostat'] },
  { match: /روغن|تیک|دود آبی/, parts: ['engine-oil', 'oil-filter'] },
  { match: /استارت|باتری|دیر روشن/, parts: ['battery', 'spark-plugs'] },
  { match: /مصرف|دود سیاه|چک موتور/, parts: ['air-filter', 'spark-plugs', 'o2-sensor', 'fuel-filter'] },
]

export const CATEGORY_PART_HINTS: Partial<Record<SymptomCategory, string[]>> = {
  brake: ['front-pads', 'rear-pads', 'rear-shoes', 'front-discs', 'brake-fluid'],
  steering: ['control-arm', 'wheel-alignment', 'ps-fluid', 'front-shocks'],
  vibration: ['wheel-alignment', 'engine-mounts', 'spark-plugs', 'front-discs'],
  leak: ['coolant', 'engine-oil', 'atf', 'gearbox-oil', 'water-pump'],
  electrical: ['battery', 'accessory-belt'],
  ac: ['ac-service', 'cabin-filter'],
  smoke: ['engine-oil', 'coolant', 'air-filter', 'spark-plugs'],
  smell: ['coolant', 'clutch-kit', 'front-pads'],
  sound: ['accessory-belt', 'control-arm', 'front-shocks', 'front-pads'],
}

export const TRIP_ITEMS: { group: string; items: string[] }[] = [
  { group: 'زیر کاپوت', items: ['سطح روغن موتور', 'آب رادیاتور / ضدیخ', 'روغن ترمز', 'آب شیشه‌شور'] },
  { group: 'لاستیک و ترمز', items: ['باد چهار لاستیک (سرد)', 'باد و سلامت زاپاس', 'آج و ترک لاستیک‌ها', 'ترمز و ترمز دستی'] },
  { group: 'چراغ و دید', items: ['چراغ‌های جلو، ترمز و راهنما', 'تیغه‌ی برف‌پاک‌کن', 'آینه‌ها'] },
  { group: 'تجهیزات', items: ['جک و آچار چرخ', 'مثلث خطر', 'کپسول آتش‌نشانی', 'جعبه کمک‌های اولیه', 'کابل باتری به باتری', 'چراغ‌قوه', 'فیوز و لامپ یدک', 'آب آشامیدنی', 'شارژر موبایل'] },
  { group: 'مدارک', items: ['کارت ماشین و گواهینامه', 'بیمه‌نامه (یا عکسش)', 'کارت سوخت'] },
]
