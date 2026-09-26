// 식단 영양 계산용 음식 목록 만들기
// 원본: 공공데이터포털 「전국통합식품영양성분정보(음식)표준데이터」 (식품의약품안전처)
//   https://www.data.go.kr/data/15100070/standard.do  (JSON 으로 내려받은 파일들)
// 사용법: node scripts/build-foods.mjs <원본1.json> [원본2.json ...]  →  src/data/foods.json
//
// · 프랜차이즈·업체 제품과 간편조리세트는 빼고 일반 음식만 남긴다.
// · 같은 이름이 여러 곳에 있으면 실제 1인분 중량이 있는 자료를 먼저, 그다음 아래 순서로 하나만 고른다.
//   (학교급식 중에서는 어르신 식사량에 가까운 초등학교 급식을 먼저)
// · 100g(ml)당 함량 × 1인분 중량 ÷ 100 = 1인분 영양소
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);
if (!files.length) {
  console.error('✗ 원본 JSON 파일 경로를 넣어주세요. (scripts/build-foods.mjs 맨 위 설명)');
  process.exit(1);
}
const rows = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));

const ORDER = ['가정식(분석', '외식(재료량', '산업체급식', '외식(분석', '초등학교', '중고등학교'];
const num = (v) => parseFloat(v) || 0;
const rank = (r) => {
  const base = num(r.NUT_CON_SRTR_QUA);
  const size = num(r.FOOD_SIZE);
  const i = ORDER.findIndex((p) => r.FOOD_ORIGIN_NM.startsWith(p));
  return (size !== base ? 0 : 10) + (i < 0 ? 9 : i);
};

const best = new Map();
for (const r of rows) {
  if (/프랜차이즈/.test(r.FOOD_ORIGIN_NM) || /간편조리세트/.test(r.FOOD_NM)) continue;
  if (!(num(r.FOOD_SIZE) > 0) || !(num(r.NUT_CON_SRTR_QUA) > 0)) continue; // 1인분 중량이 없으면 계산할 수 없다
  const cur = best.get(r.FOOD_NM);
  if (!cur || rank(r) < rank(cur)) best.set(r.FOOD_NM, r);
}

/** '비빔밥_묵_양념장' → '비빔밥(묵·양념장)' */
const display = (nm) => {
  const [head, ...rest] = nm.split('_').map((x) => x.trim()).filter(Boolean);
  return rest.length ? `${head}(${rest.join('·')})` : head;
};
const r1 = (v) => Math.round(v * 10) / 10;

const seen = new Set();
const foods = [];
for (const r of best.values()) {
  const name = display(r.FOOD_NM);
  if (seen.has(name)) continue;
  seen.add(name);
  const f = num(r.FOOD_SIZE) / num(r.NUT_CON_SRTR_QUA);
  const unit = r.NUT_CON_SRTR_QUA.replace(/[0-9.]/g, '') || 'g';
  // [이름, 1인분 중량, 단위, 칼로리(kcal), 탄수화물(g), 단백질(g), 지방(g), 나트륨(mg)]
  foods.push([name, Math.round(num(r.FOOD_SIZE)), unit, Math.round(num(r.ENERC) * f), r1(num(r.CHOCDF) * f), r1(num(r.PROT) * f), r1(num(r.FATCE) * f), Math.round(num(r.NAT) * f)]);
}
foods.sort((a, b) => a[0].localeCompare(b[0], 'ko'));

const dates = rows.map((r) => r.CRTR_YMD).filter(Boolean).sort();
const out = join(root, 'src', 'data', 'foods.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ source: '식품의약품안전처 식품영양성분DB (공공데이터포털 전국통합식품영양성분정보 음식)', date: dates.at(-1) ?? '', foods }));
console.log(`✓ ${out}  음식 ${foods.length}개 (원본 ${rows.length}건, 기준일 ${dates.at(-1)})`);
