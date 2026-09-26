// 기록 내려받기: 엑셀 파일 하나에 시트 5개 (요약 · 운동 기록 · 식사 기록 · 영양(일별) · 출석).
// 요약의 숫자는 다른 시트를 세는 엑셀 수식이고, 계산한 값도 함께 넣어 미리보기 앱에서도 숫자가 보인다.
// exceljs 가 커서 이 파일은 내려받기 버튼을 눌렀을 때만 불러온다 (ExportSheet 의 import()).
import ExcelJS from 'exceljs';
import { ageOf } from './age';
import { AMOUNT_FACTOR } from './nutrition';
import { FOOD_SOURCE } from './nutritionSource';
import type { Member } from './backend';
import { MEALS } from './constants';
import { addDays, parseYmd, WD } from './date';
import { daysLabel, isLessonDay, sessionDays } from './lessons';
import type { ExportOptions } from './exportInfo';

const FONT = '맑은 고딕';
const C = {
  green: 'FF2E6A4E', greenSoft: 'FFE3EEE7', orange: 'FFB4541F', navy: 'FF3D4F7A', navySoft: 'FFE3E7F0',
  gray: 'FFF4F1EA', line: 'FFCFC8BA', ink: 'FF1E2320', ink3: 'FF5A625D', ink4: 'FF8A918C', red: 'FFB0473A', white: 'FFFFFFFF',
};
const SHEET = { sum: '요약', ex: '운동 기록', meal: '식사 기록', day: '영양(일별)', att: '출석' };
/** 영양소 열: 식사 기록·영양(일별)·요약에서 같은 순서 */
const NUT = [
  { key: 'kcal', head: '칼로리(kcal)', fmt: '#,##0' },
  { key: 'carb', head: '탄수화물(g)', fmt: '0.0' },
  { key: 'prot', head: '단백질(g)', fmt: '0.0' },
  { key: 'fat', head: '지방(g)', fmt: '0.0' },
  { key: 'na', head: '나트륨(mg)', fmt: '#,##0' },
] as const;
const VIDEO = '영상 따라하기';

const thin = { style: 'thin' as const, color: { argb: C.line } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const font = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 11, ...o });

/** 엑셀 날짜 칸: 시간대 때문에 하루 밀리지 않게 UTC 자정으로 */
const xlDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const wd = (s: string) => WD[parseYmd(s).getDay()];
/** 2026년 9월 1일(화) */
const longDate = (s: string) => {
  const d = parseYmd(s);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일(${wd(s)})`;
};

/** 요약의 SUMIF 가 이름으로 찾으므로 같은 이름은 '김순자(1948)' 처럼 구분한다 */
function nameLabels(members: Member[]) {
  const labels = new Map<string, string>();
  const byName = new Map<string, Member[]>();
  for (const m of members) byName.set(m.name, [...(byName.get(m.name) ?? []), m]);
  for (const [name, list] of byName) {
    if (list.length === 1) labels.set(list[0].id, name);
    else list.forEach((m, i) => labels.set(m.id, `${name}(${m.birth ? m.birth.slice(0, 4) : i + 1})`));
  }
  // 생년이 같아 또 겹치면 번호를 붙인다
  const seen = new Map<string, number>();
  for (const [id, l] of labels) {
    const n = (seen.get(l) ?? 0) + 1;
    seen.set(l, n);
    if (n > 1) labels.set(id, `${l}-${n}`);
  }
  return labels;
}

export async function buildExport(o: ExportOptions): Promise<Blob> {
  const { data, from, to, today } = o;
  const set = new Set(o.mids);
  const members = data.members.filter((m) => set.has(m.id)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const label = nameLabels(members);
  const inRange = (d: string) => d >= from && d <= to;
  const byName = (a: { mid: string }, b: { mid: string }) => (label.get(a.mid) ?? '').localeCompare(label.get(b.mid) ?? '', 'ko');
  const ex = data.ex.filter((e) => set.has(e.mid) && inRange(e.date)).sort((a, b) => a.date.localeCompare(b.date) || byName(a, b));
  const meals = data.meals
    .filter((e) => set.has(e.mid) && inRange(e.date))
    .sort((a, b) => a.date.localeCompare(b.date) || byName(a, b) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
  const lessons = data.lessons.filter((l) => l.roster.some((r) => set.has(r.mid)));

  const one = o.single ? members[0] : undefined;
  const scope = one ? `${one.name} 님` : `전체 ${members.length}명`;
  const period = `기간: ${longDate(from)} ~ ${longDate(to)}  ·  대상: ${scope}  ·  만든 날: ${today}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = '나의 건강일지';
  wb.created = new Date();
  // 엑셀로 열 때 모든 수식을 다시 계산 (넣어 둔 값은 미리보기 앱용)
  wb.calcProperties.fullCalcOnLoad = true;

  const sheet = (name: string, tab: string, widths: number[], headerRow: number) => {
    const ws = wb.addWorksheet(name, {
      properties: { tabColor: { argb: tab } },
      views: [{ state: 'frozen', ySplit: headerRow, showGridLines: false }],
      pageSetup: {
        paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
        printTitlesRow: `${headerRow}:${headerRow}`,
      },
      headerFooter: { oddFooter: `&C&9${name} · &P / &N 쪽` },
    });
    ws.columns = widths.map((width) => ({ width }));
    return ws;
  };
  const title = (ws: ExcelJS.Worksheet, text: string, sub: string, span: number) => {
    ws.mergeCells(1, 1, 1, span);
    ws.mergeCells(2, 1, 2, span);
    Object.assign(ws.getCell(1, 1), { value: text, font: font({ size: 16, bold: true, color: { argb: C.ink } }) });
    Object.assign(ws.getCell(2, 1), { value: sub, font: font({ size: 10, color: { argb: C.ink3 } }) });
    ws.getRow(1).height = 28;
    ws.getRow(2).height = 18;
  };
  const header = (ws: ExcelJS.Worksheet, r: number, labels: string[], color: string) => {
    labels.forEach((t, i) =>
      Object.assign(ws.getCell(r, i + 1), {
        value: t, font: font({ bold: true, color: { argb: C.white } }), fill: fill(color), border: box,
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      }),
    );
    ws.getRow(r).height = 30;
  };
  interface BodyOpts { font?: Partial<ExcelJS.Font>; align?: 'left' | 'center' | 'right'; wrap?: boolean; numFmt?: string; fill?: string }
  const body = (ws: ExcelJS.Worksheet, r: number, c: number, value: ExcelJS.CellValue, b: BodyOpts = {}) => {
    const cell = ws.getCell(r, c);
    cell.value = value;
    cell.font = font(b.font);
    cell.border = box;
    cell.alignment = { vertical: 'middle', horizontal: b.align ?? 'left', wrapText: !!b.wrap };
    if (b.numFmt) cell.numFmt = b.numFmt;
    if (b.fill) cell.fill = fill(b.fill);
    return cell;
  };
  const note = (ws: ExcelJS.Worksheet, r: number, span: number, text: string) => {
    ws.mergeCells(r, 1, r, span);
    Object.assign(ws.getCell(r, 1), { value: text, font: font({ size: 10, color: { argb: C.ink4 } }) });
  };
  const q = (s: string) => `'${s}'`; // 띄어쓰기가 있는 시트 이름

  // ① 요약은 맨 앞 시트라 먼저 만들고, 다른 시트를 다 채운 뒤 내용을 넣는다
  const S = [
    ['이름', 12], ['나이', 6], ['해시태그', 18], ['운동 횟수', 9], ['운동 시간(분)', 11], ['영상 따라하기(회)', 11],
    ['식사 기록(끼)', 10], ...MEALS.map((m) => [m, 7] as const), ['수업 출석(회)', 10], ['수업일(회)', 9], ['출석률', 8],
    ...NUT.map((n) => [`하루 평균
${n.head}`, 11] as const),
  ] as const;
  const wsS = sheet(SHEET.sum, C.green, S.map((x) => x[1]), 4);

  // ② 운동 기록 ---------------------------------------------------------------
  const E = [['날짜', 11], ['요일', 6], ['이름', 12], ['운동', 12], ['시간(분)', 9], ['강도', 9], ['메모', 28], ['구분', 14]] as const;
  const wsE = sheet(SHEET.ex, C.green, E.map((x) => x[1]), 4);
  title(wsE, one ? `${one.name} 님 · 운동 기록` : '운동 기록', `${period}  ·  ${ex.length}건`, E.length);
  header(wsE, 4, E.map((x) => x[0]), C.green);
  ex.forEach((e, i) => {
    const r = 5 + i;
    const z = i % 2 ? C.gray : undefined;
    const video = !!e.pid;
    body(wsE, r, 1, xlDate(e.date), { numFmt: 'yyyy-mm-dd', align: 'center', fill: z });
    body(wsE, r, 2, wd(e.date), { align: 'center', fill: z });
    body(wsE, r, 3, label.get(e.mid) ?? '', { fill: z });
    body(wsE, r, 4, e.kind, { fill: z });
    body(wsE, r, 5, e.min, { align: 'right', fill: z });
    body(wsE, r, 6, e.level, { align: 'center', fill: z });
    body(wsE, r, 7, e.memo, { fill: z, wrap: true });
    body(wsE, r, 8, video ? VIDEO : '직접 기록', {
      align: 'center', fill: video ? C.navySoft : z, font: video ? { bold: true, color: { argb: C.navy } } : undefined,
    });
  });
  if (ex.length) wsE.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + ex.length, column: E.length } };
  else note(wsE, 5, E.length, '이 기간에 운동 기록이 없어요.');

  // ③ 식사 기록 ---------------------------------------------------------------
  const Mc = [['날짜', 11], ['요일', 6], ['이름', 12], ['끼니', 8], ['메뉴', 30], ['양', 8], ...NUT.map((n) => [n.head, 10] as const), ['메모', 20]] as const;
  const nutCol0 = 7; // 칼로리가 들어가는 열 (G)
  const wsM = sheet(SHEET.meal, C.orange, Mc.map((x) => x[1]), 4);
  title(wsM, one ? `${one.name} 님 · 식사 기록` : '식사 기록', `${period}  ·  ${meals.length}건`, Mc.length);
  header(wsM, 4, Mc.map((x) => x[0]), C.orange);
  meals.forEach((e, i) => {
    const r = 5 + i;
    const z = i % 2 ? C.gray : undefined;
    body(wsM, r, 1, xlDate(e.date), { numFmt: 'yyyy-mm-dd', align: 'center', fill: z });
    body(wsM, r, 2, wd(e.date), { align: 'center', fill: z });
    body(wsM, r, 3, label.get(e.mid) ?? '', { fill: z });
    body(wsM, r, 4, e.meal, { align: 'center', fill: z });
    body(wsM, r, 5, e.menu, { fill: z, wrap: true });
    body(wsM, r, 6, e.amount, { align: 'center', fill: z });
    // 음식을 목록에서 고르지 않은 식사는 빈칸 (영양(일별)의 계산에서 빠진다)
    NUT.forEach((n, j) => body(wsM, r, nutCol0 + j, e.nutri ? e.nutri[n.key] : null, { align: 'right', fill: z, numFmt: n.fmt }));
    body(wsM, r, nutCol0 + NUT.length, e.memo, { fill: z, wrap: true });
  });
  if (meals.length) wsM.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + meals.length, column: Mc.length } };
  else note(wsM, 5, Mc.length, '이 기간에 식사 기록이 없어요.');

  // ④ 영양(일별): 이용자·날짜마다 하루 합계 (식사 기록을 더하는 수식) --------------------------
  const days = new Map<string, { mid: string; date: string; n: Record<string, number>; count: number }>();
  for (const e of meals) {
    if (!e.nutri) continue;
    const k = e.mid + e.date;
    const d = days.get(k) ?? { mid: e.mid, date: e.date, n: { kcal: 0, carb: 0, prot: 0, fat: 0, na: 0 }, count: 0 };
    d.count++;
    for (const n of NUT) d.n[n.key] += e.nutri[n.key];
    days.set(k, d);
  }
  const dayRows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || byName(a, b));
  const D = [['날짜', 11], ['요일', 6], ['이름', 12], ['계산한 식사(끼)', 10], ...NUT.map((n) => [n.head, 11] as const)] as const;
  const wsD = sheet(SHEET.day, C.orange, D.map((x) => x[1]), 4);
  title(wsD, one ? `${one.name} 님 · 하루 영양소` : '하루 영양소', `${period}  ·  음식을 목록에서 고른 식사만 계산`, D.length);
  header(wsD, 4, D.map((x) => x[0]), C.orange);
  const M = q(SHEET.meal);
  dayRows.forEach((d, i) => {
    const r = 5 + i;
    const z = i % 2 ? C.gray : undefined;
    const crit = `${M}!$C:$C,$C${r},${M}!$A:$A,$A${r}`;
    body(wsD, r, 1, xlDate(d.date), { numFmt: 'yyyy-mm-dd', align: 'center', fill: z });
    body(wsD, r, 2, wd(d.date), { align: 'center', fill: z });
    body(wsD, r, 3, label.get(d.mid) ?? '', { fill: z });
    body(wsD, r, 4, { formula: `COUNTIFS(${crit},${M}!$G:$G,">=0")`, result: d.count }, { align: 'right', fill: z });
    NUT.forEach((n, j) => {
      const c = wsM.getColumn(nutCol0 + j).letter;
      body(wsD, r, 5 + j, { formula: `SUMIFS(${M}!${c}:${c},${crit})`, result: d.n[n.key] }, { align: 'right', fill: z, numFmt: n.fmt });
    });
  });
  if (dayRows.length) wsD.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + dayRows.length, column: D.length } };
  else note(wsD, 5, D.length, '이 기간에 영양소를 계산한 식사가 없어요. (음식을 목록에서 골라 기록한 식사만 계산돼요)');

  // ⑤ 출석 — 수업마다 한 덩어리: 이름 | 출석 | 수업일 | 출석률 | 날짜들 ----------------------
  const blocks = lessons.map((l) => {
    const mids = l.roster.map((r) => r.mid).filter((mid) => set.has(mid) && label.has(mid)).sort((a, b) => byName({ mid: a }, { mid: b }));
    const off = new Set(data.offdays.filter((x) => x.lid === l.id && inRange(x.date)).map((x) => x.date));
    const cols = new Set<string>(off);
    const start = from > l.createdAt ? from : l.createdAt;
    for (let d = start; d <= to; d = addDays(d, 1)) if (isLessonDay(l, d)) cols.add(d);
    for (const a of data.attendance) if (a.lid === l.id && set.has(a.mid) && inRange(a.date)) cols.add(a.date);
    const dates = [...cols].sort();
    const rows = mids.map((mid) => {
      const days = new Map(sessionDays(l, mid, data.attendance, data.offdays, from, to).map((x) => [x.date, x.present]));
      return { mid, days, present: [...days.values()].filter(Boolean).length, held: days.size };
    });
    return { l, dates, off, rows };
  });
  const maxDates = Math.max(0, ...blocks.map((b) => b.dates.length));
  const wsA = sheet(SHEET.att, C.navy, [12, 7, 7, 8, ...Array.from({ length: maxDates }, () => 7.5)], 4);
  title(wsA, one ? `${one.name} 님 · 수업 출석` : '수업 출석부', `${period}  ·  ○ 출석  × 결석  (휴강한 날은 출석률에서 빠짐)`, Math.max(8, 4 + maxDates));
  let r = 4;
  if (!blocks.length) note(wsA, r, 8, '이 기간에 다닌 수업이 없어요.');
  for (const b of blocks) {
    wsA.mergeCells(r, 1, r, Math.max(4, 4 + b.dates.length));
    Object.assign(wsA.getCell(r, 1), {
      value: `${b.l.name}  (${daysLabel(b.l.days)})  ·  대상 ${b.rows.length}명`,
      font: font({ size: 12, bold: true, color: { argb: C.navy } }),
    });
    wsA.getRow(r).height = 22;
    r++;
    header(wsA, r, ['이름', '출석', '수업일', '출석률', ...b.dates.map((d) => {
      const tag = b.off.has(d) ? '\n휴강' : isLessonDay(b.l, d) ? '' : '\n보강';
      const [, m, dd] = d.split('-').map(Number);
      return `${m}/${dd}\n${wd(d)}${tag}`;
    })], C.navy);
    wsA.getRow(r).height = 44;
    b.dates.forEach((d, j) => {
      if (b.off.has(d)) wsA.getCell(r, 5 + j).fill = fill(C.ink4);
    });
    r++;
    const endCol = b.dates.length ? wsA.getColumn(4 + b.dates.length).letter : '';
    for (const row of b.rows) {
      body(wsA, r, 1, label.get(row.mid) ?? '', { font: { bold: true } });
      if (endCol) {
        const rng = `E${r}:${endCol}${r}`;
        body(wsA, r, 2, { formula: `COUNTIF(${rng},"○")`, result: row.present }, { align: 'center' });
        body(wsA, r, 3, { formula: `COUNTIF(${rng},"○")+COUNTIF(${rng},"×")`, result: row.held }, { align: 'center' });
      } else {
        body(wsA, r, 2, 0, { align: 'center' });
        body(wsA, r, 3, 0, { align: 'center' });
      }
      body(wsA, r, 4, { formula: `IF(C${r}=0,"-",B${r}/C${r})`, result: row.held ? row.present / row.held : '-' }, {
        align: 'center', numFmt: '0%', font: { bold: true },
      });
      b.dates.forEach((d, j) => {
        const off = b.off.has(d);
        const here = row.days.get(d);
        body(wsA, r, 5 + j, off ? '휴강' : here === undefined ? '' : here ? '○' : '×', {
          align: 'center',
          fill: off ? C.gray : here ? C.greenSoft : undefined,
          font: off ? { size: 9, color: { argb: C.ink4 } } : here ? { bold: true, color: { argb: C.green } } : { color: { argb: C.red } },
        });
      });
      r++;
    }
    r++;
  }

  // ① 요약 채우기 ----------------------------------------------------------
  title(wsS, one ? `${one.name} 님 · 건강 기록` : '나의 건강일지 · 기간 기록', period, S.length);
  header(wsS, 4, S.map((x) => x[0]), C.green);
  wsS.getRow(4).height = 36;
  const col = (n: number) => wsS.getColumn(n).letter;
  const mealCol0 = 8; // 아침이 들어가는 열 (H)
  const attCol = mealCol0 + MEALS.length; // 수업 출석(회)
  const nutAvgCol = attCol + 3; // 하루 평균 칼로리
  members.forEach((m, i) => {
    const row = 5 + i;
    const z = i % 2 ? C.gray : undefined;
    const mine = ex.filter((e) => e.mid === m.id);
    const myMeals = meals.filter((e) => e.mid === m.id);
    const att = blocks.flatMap((b) => b.rows.filter((x) => x.mid === m.id));
    const pres = att.reduce((a, x) => a + x.present, 0);
    const held = att.reduce((a, x) => a + x.held, 0);
    const A = `$A${row}`;
    const F = (c: number, formula: string, result: number | string, b: BodyOpts = {}) => body(wsS, row, c, { formula, result }, { align: 'right', fill: z, ...b });
    body(wsS, row, 1, label.get(m.id) ?? m.name, { font: { bold: true }, fill: z });
    body(wsS, row, 2, ageOf(m, today) ?? '', { align: 'right', fill: z });
    body(wsS, row, 3, (m.tags ?? []).map((t) => '#' + t).join(' '), { fill: z, font: { color: { argb: C.navy } } });
    F(4, `COUNTIF(${q(SHEET.ex)}!$C:$C,${A})`, mine.length);
    F(5, `SUMIF(${q(SHEET.ex)}!$C:$C,${A},${q(SHEET.ex)}!$E:$E)`, mine.reduce((a, e) => a + e.min, 0), { numFmt: '#,##0' });
    F(6, `COUNTIFS(${q(SHEET.ex)}!$C:$C,${A},${q(SHEET.ex)}!$H:$H,"${VIDEO}")`, mine.filter((e) => e.pid).length);
    F(7, `COUNTIF(${q(SHEET.meal)}!$C:$C,${A})`, myMeals.length);
    MEALS.forEach((k, j) => {
      const c = mealCol0 + j;
      F(c, `COUNTIFS(${q(SHEET.meal)}!$C:$C,${A},${q(SHEET.meal)}!$D:$D,${col(c)}$4)`, myMeals.filter((e) => e.meal === k).length);
    });
    F(attCol, `SUMIF(${SHEET.att}!$A:$A,${A},${SHEET.att}!$B:$B)`, pres);
    F(attCol + 1, `SUMIF(${SHEET.att}!$A:$A,${A},${SHEET.att}!$C:$C)`, held);
    F(attCol + 2, `IF(${col(attCol + 1)}${row}=0,"-",${col(attCol)}${row}/${col(attCol + 1)}${row})`, held ? pres / held : '-', { numFmt: '0%' });
    // 하루 평균 = 영양(일별)에서 이 사람 날들의 평균 (계산한 날이 없으면 -)
    const myDays = dayRows.filter((d) => d.mid === m.id);
    NUT.forEach((n, j) => {
      const dc = wsD.getColumn(5 + j).letter;
      const avg = myDays.length ? myDays.reduce((a, d) => a + d.n[n.key], 0) / myDays.length : '-';
      F(nutAvgCol + j, `IFERROR(AVERAGEIF(${q(SHEET.day)}!$C:$C,${A},${q(SHEET.day)}!${dc}:${dc}),"-")`, avg, { numFmt: n.fmt });
    });
  });
  const last = 4 + members.length;
  const tr = last + 1;
  if (members.length > 1) {
    body(wsS, tr, 1, '합계', { font: { bold: true }, fill: C.greenSoft });
    body(wsS, tr, 2, '', { fill: C.greenSoft });
    body(wsS, tr, 3, '', { fill: C.greenSoft });
    for (let c = 4; c <= attCol + 1; c++) {
      let sum = 0;
      for (let rr = 5; rr <= last; rr++) sum += Number((wsS.getCell(rr, c).value as { result: number }).result) || 0;
      body(wsS, tr, c, { formula: `SUM(${col(c)}5:${col(c)}${last})`, result: sum }, {
        align: 'right', font: { bold: true }, fill: C.greenSoft, numFmt: '#,##0',
      });
    }
    const P = Number((wsS.getCell(tr, attCol).value as { result: number }).result);
    const H = Number((wsS.getCell(tr, attCol + 1).value as { result: number }).result);
    body(wsS, tr, attCol + 2, { formula: `IF(${col(attCol + 1)}${tr}=0,"-",${col(attCol)}${tr}/${col(attCol + 1)}${tr})`, result: H ? P / H : '-' }, {
      align: 'right', font: { bold: true }, fill: C.greenSoft, numFmt: '0%',
    });
    NUT.forEach((_, j) => body(wsS, tr, nutAvgCol + j, '', { fill: C.greenSoft }));
  }
  const notesAt = members.length > 1 ? tr + 2 : tr + 1;
  [
    '· 요약의 숫자는 「운동 기록」「식사 기록」「출석」 시트에서 자동으로 계산됩니다. 기록 시트를 고치면 요약도 바뀝니다.',
    '· 출석률 = 수업 출석 ÷ 수업일. 수업일은 수업 요일 중 대상에 들어간 날부터 세며, 휴강한 날은 빠집니다.',
    `· 영양소는 음식을 목록에서 골라 기록한 식사만 계산합니다. 1인분 기준 × 양(${Object.entries(AMOUNT_FACTOR).map(([k, v]) => `${k} ${v}`).join(' · ')}). 하루 평균은 계산한 식사가 있는 날 기준입니다.`,
    `· 영양 정보 출처: ${FOOD_SOURCE}`,
  ].forEach((t, i) => note(wsS, notesAt + i, S.length, t));

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
