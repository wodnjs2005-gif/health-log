import { parseYmd } from './date';

/** 생년월일(YYYY-MM-DD) 기준 만 나이. 생일이 지나야 한 살 더한다. */
export const ageFromBirth = (birth: string, today: string) => {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
};

/** 생년월일이 있으면 오늘 기준으로 계산하고, 예전에 나이만 적어 둔 이용자는 그 나이를 쓴다 */
export const ageOf = (m: { age?: number | null; birth?: string | null }, today: string): number | null =>
  m.birth ? ageFromBirth(m.birth, today) : (m.age ?? null);

/** 1947.03.15 */
export const birthLabel = (birth: string) => birth.replace(/-/g, '.');

/**
 * 년·월·일 입력을 확인해 'YYYY-MM-DD' 로 만든다.
 * 없는 날짜(2월 30일 등)나 미래 날짜, 1900년 전은 오류 문구를 돌려준다.
 */
export const parseBirth = (y: string, m: string, d: string, today: string): { birth: string } | { error: string } => {
  if (!y && !m && !d) return { error: '생년월일을 입력해주세요.' };
  if (y.length !== 4 || !m || !d) return { error: '생년월일을 모두 입력해주세요. (예: 1947년 3월 15일)' };
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  const dt = new Date(yy, mm - 1, dd);
  if (yy < 1900 || dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) {
    return { error: '없는 날짜예요. 생년월일을 확인해주세요.' };
  }
  const birth = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  if (parseYmd(birth) > parseYmd(today)) return { error: '오늘보다 뒤의 날짜예요. 생년월일을 확인해주세요.' };
  return { birth };
};
