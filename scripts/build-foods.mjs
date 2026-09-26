// 식단 영양 계산용 음식 목록 만들기
// 원본: 공공데이터포털 (식품의약품안전처, JSON 으로 내려받은 파일들)
//   · 「전국통합식품영양성분정보(음식)표준데이터」     https://www.data.go.kr/data/15100070/standard.do
//   · 「전국통합식품영양성분정보(원재료성식품)표준데이터」 https://www.data.go.kr/data/15100065/standard.do
// 사용법: node scripts/build-foods.mjs <원본1.json> [원본2.json ...]  →  src/data/foods.json
//   (음식·원재료성식품 파일을 섞어 넣어도 된다. 1인분 중량(FOOD_SIZE) 칸이 있으면 음식으로 본다)
//
// ■ 음식(요리)
// · 프랜차이즈·업체 제품과 간편조리세트는 빼고 일반 음식만 남긴다.
// · 같은 이름이 여러 곳에 있으면 실제 1인분 중량이 있는 자료를 먼저, 그다음 아래 순서로 하나만 고른다.
//   (학교급식 중에서는 어르신 식사량에 가까운 초등학교 급식을 먼저)
// · 100g(ml)당 함량 × 1인분 중량 ÷ 100 = 1인분 영양소
//
// ■ 원재료성식품 (과일·우유·달걀·감자 등): 자료에 1인분 중량이 없어서
//   「2020 한국인 영양소 섭취기준」의 식품군별 1인 1회 분량 에너지 기준으로 1회 분량을 정한다.
//     1회 분량(g) = 식품군 기준 에너지 ÷ 100g당 에너지 × 100  (5g 단위로 반올림)
//     과일 50kcal · 우유 125kcal · 달걀·콩·견과 100kcal · 채소·버섯 15kcal
//     감자·고구마·옥수수 등(곡류 1회 300kcal 의 0.3) 100kcal
//   날 생선·고기(산지·월별 자료), 가공 전 곡물, 기름·가루·추출물 등은 뺀다.
//   음식 목록과 이름이 겹치면 음식을 남기되, 그 음식에 실제 1인분 중량이 없으면(100g 기준값뿐) 원재료의 1회 분량을 쓴다.
//
// 다른 스크립트에서 쓸 때: import { buildFoods, writeFoods } from './build-foods.mjs'  (update-foods.mjs)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FOODS_JSON = join(root, 'src', 'data', 'foods.json');
export const SOURCE = '식품의약품안전처 식품영양성분DB (공공데이터포털 전국통합식품영양성분정보 음식·원재료성식품)';

/** 원본 자료(음식·원재료성식품 섞여도 됨) → { foods, date, dishes, raws } */
export function buildFoods(all) {
const rows = all.filter((r) => 'FOOD_SIZE' in r);
const raws = all.filter((r) => !('FOOD_SIZE' in r));

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

/** '비빔밥_묵_양념장' → '비빔밥(묵·양념장)', 원재료의 '생것' 은 뺀다 ('사과_부사_생것' → '사과(부사)') */
const display = (nm, raw = false) => {
  const [head, ...rest] = nm.split('_').map((x) => x.trim()).filter((x) => x && !(raw && x === '생것'));
  return rest.length ? `${head}(${rest.join('·')})` : head;
};
const r1 = (v) => Math.round(v * 10) / 10;

// 원재료성식품: 식품군 기준 에너지로 1회 분량 (맨 뒤 1 = 「1회」 분량 표시)
const GROUP_KCAL = { 과일류: 50, 우유류: 125, 난류: 100, 두류: 100, '견과 및 종실류': 100, '감자 및 전분류': 100, 곡류: 100, 채소류: 15, 버섯류: 15 };
const SKIP = /분말|가루|추출|농축|기름|씨유|원액|말린것을|엑기스|전분|녹말|페이스트|퓨레|통조림|절임|시럽/;
const rawOk = (r) =>
  GROUP_KCAL[r.FOOD_LV3_NM] && num(r.ENERC) > 0 && !SKIP.test(r.FOOD_NM) &&
  (r.FOOD_LV3_NM !== '곡류' || /삶은것|찐것|구운것|볶은것/.test(r.FOOD_NM)); // 쌀·가루처럼 그대로 먹지 않는 곡물은 뺀다
const rawNames = new Set(raws.filter(rawOk).map((r) => display(r.FOOD_NM, true)));

const seen = new Set();
const foods = [];
for (const r of best.values()) {
  const name = display(r.FOOD_NM);
  if (seen.has(name)) continue;
  if (num(r.FOOD_SIZE) === num(r.NUT_CON_SRTR_QUA) && rawNames.has(name)) continue; // 100g 기준값뿐이면 원재료 1회 분량으로
  seen.add(name);
  const f = num(r.FOOD_SIZE) / num(r.NUT_CON_SRTR_QUA);
  const unit = r.NUT_CON_SRTR_QUA.replace(/[0-9.]/g, '') || 'g';
  // [이름, 1인분 중량, 단위, 칼로리(kcal), 탄수화물(g), 단백질(g), 지방(g), 나트륨(mg)]
  foods.push([name, Math.round(num(r.FOOD_SIZE)), unit, Math.round(num(r.ENERC) * f), r1(num(r.CHOCDF) * f), r1(num(r.PROT) * f), r1(num(r.FATCE) * f), Math.round(num(r.NAT) * f)]);
}
let rawCount = 0;
for (const r of raws) {
  if (!rawOk(r)) continue;
  const kcalBase = GROUP_KCAL[r.FOOD_LV3_NM];
  const per100 = num(r.ENERC);
  const name = display(r.FOOD_NM, true);
  if (seen.has(name)) continue;
  seen.add(name);
  const size = Math.max(5, Math.round(((kcalBase / per100) * 100) / 5) * 5);
  const f = size / num(r.NUT_CON_SRTR_QUA);
  const unit = r.NUT_CON_SRTR_QUA.replace(/[0-9.]/g, '') || 'g';
  foods.push([name, size, unit, Math.round(per100 * f), r1(num(r.CHOCDF) * f), r1(num(r.PROT) * f), r1(num(r.FATCE) * f), Math.round(num(r.NAT) * f), 1]);
  rawCount++;
}
foods.sort((a, b) => a[0].localeCompare(b[0], 'ko'));

const dates = all.map((r) => r.CRTR_YMD).filter(Boolean).sort();
return { foods, date: dates.at(-1) ?? '', dishes: foods.length - rawCount, raws: rawCount };
}

export function writeFoods(built) {
  mkdirSync(dirname(FOODS_JSON), { recursive: true });
  writeFileSync(FOODS_JSON, JSON.stringify({ source: SOURCE, date: built.date, foods: built.foods }));
}

// 명령줄에서 직접 실행했을 때
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('✗ 원본 JSON 파일 경로를 넣어주세요. (scripts/build-foods.mjs 맨 위 설명)');
    process.exit(1);
  }
  const all = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
  const built = buildFoods(all);
  writeFoods(built);
  console.log(`✓ ${FOODS_JSON}  ${built.foods.length}개 = 음식 ${built.dishes} + 원재료 ${built.raws} (원본 ${all.length}건, 기준일 ${built.date})`);
}
