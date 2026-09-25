export const WD = ['일', '월', '화', '수', '목', '금', '토'];

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (s: string, n: number) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export const todayYmd = () => ymd(new Date());

/** 9월 24일 (수) */
export const md = (s: string) => {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
};

/** { md: '9월 25일', wd: '목요일' } */
export const dayParts = (s: string) => {
  const d = parseYmd(s);
  return { md: `${d.getMonth() + 1}월 ${d.getDate()}일`, wd: `${WD[d.getDay()]}요일` };
};

/** 9월 25일 목요일 */
export const longLabel = (s: string) => {
  const p = dayParts(s);
  return `${p.md} ${p.wd}`;
};

/** 그 주 월요일 */
export const mondayOf = (s: string) => addDays(s, -((parseYmd(s).getDay() + 6) % 7));
