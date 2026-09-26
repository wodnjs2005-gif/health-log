// 기록 내려받기 점검용: 앱의 src/lib/exportXlsx.ts 를 그대로 불러 가상의 데이터로 엑셀 파일을 만든다.
// 사용법: node scripts/export-test.mjs <출력 폴더>
// (같은 이름 두 명, 기록 없는 이용자, 휴강·보강, 대상에서 빠진 이용자를 일부러 넣었다)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'export-test'));
mkdirSync(out, { recursive: true });

const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const { buildExport } = await server.ssrLoadModule('/src/lib/exportXlsx.ts');
const { exportFileName } = await server.ssrLoadModule('/src/lib/exportInfo.ts');
const { mealNutri, toMealFood } = await server.ssrLoadModule('/src/lib/nutrition.ts');
const FOODS = (await server.ssrLoadModule('/src/data/foods.json')).default.foods
  .map(([name, size, unit, kcal, carb, prot, fat, na]) => ({ name, size, unit, kcal, carb, prot, fat, na }));

const TODAY = '2026-09-25';
const add = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const members = [
  { id: 'm1', name: '김순자', age: null, birth: '1948-03-15', code: '', tags: ['오전반', '무릎조심'], act: 0.75 },
  { id: 'm2', name: '박영호', age: null, birth: '1954-11-02', code: '', tags: ['오전반'], act: 0.85 },
  { id: 'm3', name: '이말순', age: null, birth: '1945-06-20', code: '', tags: ['오후반'], act: 0.45 },
  { id: 'm4', name: '김순자', age: null, birth: '1951-01-09', code: '', tags: ['오후반'], act: 0.5 }, // 같은 이름
  { id: 'm5', name: '정복남', age: 74, birth: null, code: '', tags: [], act: 0 }, // 기록 없음, 예전처럼 나이만
];
const ex = [], meals = [], views = [];
const KINDS = [['걷기', [30, 40]], ['체조', [20, 30]], ['근력운동', [20]]];
for (let d = '2026-08-20'; d <= TODAY; d = add(d, 1)) for (const m of members) {
  if (rnd() < m.act) { const [k, mins] = pick(KINDS); ex.push({ id: 'e' + ex.length, mid: m.id, date: d, kind: k, min: pick(mins), level: pick(['가볍게', '보통', '힘들게']), memo: rnd() < 0.2 ? '공원 한 바퀴' : '' }); }
  if (rnd() < m.act * 0.3) ex.push({ id: 'e' + ex.length, mid: m.id, date: d, kind: '스트레칭', min: 10, level: '보통', memo: '영상 따라하기 · 무릎 스트레칭', pid: 'p1' });
  for (const meal of ['아침', '점심', '저녁', '간식']) if (rnd() < (meal === '간식' ? 0.2 : 0.7) * (m.act ? 1 : 0)) {
    const amount = pick(['적게', '보통', '많이']);
    if (d < '2026-09-10') {
      // 예전 기록: 메뉴 글만 (영양소 없음)
      meals.push({ id: 'f' + meals.length, mid: m.id, date: d, meal, menu: pick(['잡곡밥, 된장국', '비빔밥', '죽']), amount, memo: '', foods: [], nutri: null });
    } else {
      const foods = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(FOODS)))].map(toMealFood);
      if (rnd() < 0.15) foods.push({ n: '직접 쓴 반찬' }); // 목록에 없는 음식
      meals.push({ id: 'f' + meals.length, mid: m.id, date: d, meal, menu: foods.map((x) => x.n).join(', '), amount, memo: '', foods, nutri: mealNutri(foods, amount) });
    }
  }
}
const lessons = [
  { id: 'l1', name: '오전 체조', days: [1, 3, 5], createdAt: '2026-08-24', roster: [
    { mid: 'm1', since: '2026-08-24' }, { mid: 'm2', since: '2026-08-24' }, { mid: 'm5', since: '2026-09-14' }, // m5 는 중간에 들어옴
  ] },
  { id: 'l2', name: '오후 걷기반', days: [2, 4], createdAt: '2026-09-01', roster: [{ mid: 'm3', since: '2026-09-01' }, { mid: 'm4', since: '2026-09-01' }] },
];
const attendance = [];
for (const l of lessons) for (const r of l.roster) for (let d = r.since; d <= TODAY; d = add(d, 1)) {
  const wd = new Date(d + 'T00:00:00Z').getUTCDay();
  if (l.days.includes(wd) && rnd() < 0.7) attendance.push({ lid: l.id, mid: r.mid, date: d });
}
attendance.push({ lid: 'l1', mid: 'm1', date: '2026-09-13' }); // 일요일 보강
attendance.push({ lid: 'l1', mid: 'm3', date: '2026-09-02' }); // 대상에서 빠진 이용자의 지난 기록 (출석부에 나오지 않아야 함)
const offdays = [{ lid: 'l1', date: '2026-09-25' }, { lid: 'l2', date: '2026-09-24' }];
const data = { members, ex, meals, programs: [], views, lessons, attendance, offdays };

const cases = [
  { mids: members.map((m) => m.id), single: false, from: '2026-09-01', to: TODAY },
  { mids: ['m1'], single: true, from: '2026-09-01', to: TODAY },
  { mids: ['m5'], single: true, from: '2026-09-01', to: '2026-09-10' }, // 기록도 수업일도 없는 기간
  { mids: members.map((m) => m.id), single: false, from: '2026-08-20', to: '2026-08-31' }, // 수업 만들기 전 기간 포함
];
for (const c of cases) {
  const o = { data, today: TODAY, ...c };
  const blob = await buildExport(o);
  const name = exportFileName(o);
  writeFileSync(join(out, name), Buffer.from(await blob.arrayBuffer()));
  console.log('✓', name);
}
await server.close();
