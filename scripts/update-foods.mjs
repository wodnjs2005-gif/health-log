// 식약처 음식 자료가 새로 나왔는지 확인하고 음식 목록(src/data/foods.json)을 다시 만든다.
//
//   npm run update:foods            새 자료를 받아 무엇이 달라지는지만 보여준다 (파일은 그대로)
//   npm run update:foods -- --write 확인한 뒤 실제로 음식 목록을 바꾼다
//
// 받는 자료 (공공데이터포털, 식품의약품안전처) — 합쳐서 약 25MB, food-data/ 폴더에 저장 (git 에 올라가지 않음)
//   · 전국통합식품영양성분정보(음식)표준데이터        https://www.data.go.kr/data/15100070/standard.do
//   · 전국통합식품영양성분정보(원재료성식품)표준데이터  https://www.data.go.kr/data/15100065/standard.do
// 목록을 바꾼 뒤에는 커밋하고 push 하면 배포된 앱에 반영된다. (관리자가 앱에서 추가한 음식은 서버에 따로 있어 그대로다)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFoods, FOODS_JSON, root, writeFoods } from './build-foods.mjs';

const DATASETS = [
  { pk: '15100070', name: '음식' },
  { pk: '15100065', name: '원재료성식품' },
];
const write = process.argv.includes('--write');
const dir = join(root, 'food-data');
mkdirSync(dir, { recursive: true });

const headers = (pk) => ({ 'User-Agent': 'Mozilla/5.0', Referer: `https://www.data.go.kr/data/${pk}/standard.do` });
async function getJson(url, pk) {
  const r = await fetch(url, { headers: headers(pk) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// 1) 내려받기 (공공데이터포털 화면의 「다운로드」 버튼과 같은 방법)
const all = [];
for (const ds of DATASETS) {
  const head = await getJson(`https://www.data.go.kr/download/columList.json?pk=${ds.pk}&ext=CSV`, ds.pk);
  const per = 10000;
  const pages = Math.ceil(head.totalCount / per);
  const rows = [];
  for (let page = 1; page <= pages; page++) {
    const qs = new URLSearchParams({ publicDataPk: ds.pk, totalCount: String(head.totalCount), svcTableNm: head.tableVO.svcTableNm, perPage: String(per), page: String(page) });
    for (const c of head.tableVO.colNmList) qs.append('colNmList', c);
    rows.push(...(await getJson(`https://www.data.go.kr/download/standard.json?${qs}`, ds.pk)));
    process.stdout.write(`\r${ds.name}: ${rows.length} / ${head.totalCount}건`);
  }
  process.stdout.write('\n');
  if (rows.length !== head.totalCount) throw new Error(`${ds.name} 자료를 다 받지 못했어요 (${rows.length}/${head.totalCount}). 잠시 뒤 다시 해주세요.`);
  writeFileSync(join(dir, `${ds.pk}.json`), JSON.stringify(rows));
  all.push(...rows);
}

// 2) 새 목록 만들기 → 지금 목록과 비교
const next = buildFoods(all);
const cur = existsSync(FOODS_JSON) ? JSON.parse(readFileSync(FOODS_JSON, 'utf8')) : { date: '', foods: [] };
const byName = (list) => new Map(list.map((f) => [f[0], f]));
const a = byName(cur.foods);
const b = byName(next.foods);
const added = [...b.keys()].filter((n) => !a.has(n));
const removed = [...a.keys()].filter((n) => !b.has(n));
const changed = [...b.keys()].filter((n) => a.has(n) && JSON.stringify(a.get(n)) !== JSON.stringify(b.get(n)));
const show = (label, list, fmt = (n) => n) =>
  console.log(`${label} ${list.length}가지${list.length ? ': ' + list.slice(0, 15).map(fmt).join(', ') + (list.length > 15 ? ' …' : '') : ''}`);

console.log(`\n자료 기준일: 지금 ${cur.date || '-'} → 새 자료 ${next.date}`);
console.log(`음식 목록: 지금 ${cur.foods.length}가지 → ${next.foods.length}가지 (음식 ${next.dishes} + 원재료 ${next.raws})`);
show('· 새로 생긴 음식', added);
show('· 없어진 음식', removed);
show('· 값이 바뀐 음식', changed, (n) => `${n}(${a.get(n)[3]}→${b.get(n)[3]}kcal)`);

if (!added.length && !removed.length && !changed.length) {
  console.log('\n✓ 바뀐 것이 없어요. 음식 목록은 그대로 둡니다.');
} else if (write) {
  writeFoods(next);
  console.log(`\n✓ ${FOODS_JSON} 를 바꿨어요. 커밋하고 push 하면 앱에 반영됩니다.`);
} else {
  console.log('\n이대로 바꾸려면:  npm run update:foods -- --write');
}
