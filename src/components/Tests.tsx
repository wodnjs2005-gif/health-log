import { useState } from 'react';
import { useApp } from '../AppContext';
import { useConfirm } from '../hooks/useConfirm';
import { cx } from '../lib/cx';
import { dayParts, md } from '../lib/date';
import { BETTER_LABEL, numText, testDays, testTrends } from '../lib/tests';
import ui from '../styles/ui.module.css';
import { ConfirmButton } from './ConfirmButton';
import { DateNav } from './DateNav';
import { Sheet } from './Layout';
import s from './Tests.module.css';

/** trainer = 기록·고치기 (트레이너만), view = 보기만 (이용자·보호자·관리자) */
export type TestMode = 'trainer' | 'view';

/** 한 이용자의 체력 측정: 항목별 최근 결과와 지난번 비교, 날짜별 기록 */
export function TestSection({ mid, name, mode }: { mid: string; name: string; mode: TestMode }) {
  const { be, data, setData, staffToken, toast, fail } = useApp();
  const [sheet, setSheet] = useState<{ date?: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const confirm = useConfirm();
  const items = data.testItems;
  const trends = testTrends(items, data.tests, mid);
  const days = testDays(data.tests, mid);
  if (mode === 'view' && !days.length) return null; // 이용자·보호자: 측정한 적이 없으면 보여주지 않는다

  const del = (date: string) =>
    confirm.tap('t' + date, async () => {
      try {
        await be.trainerDelTests(staffToken, mid, date);
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({ ...d, tests: d.tests.filter((t) => !(t.mid === mid && t.date === date)) }));
      toast('측정 기록을 지웠어요');
    });

  const shownDays = showAll ? days : days.slice(0, 2);

  return (
    <section className={ui.card} style={{ gap: '0.875rem' }}>
      <div className={s.head}>
        <h3 className={ui.h3}>체력 측정</h3>
        {days.length > 0 && <span className={ui.small}>최근 {md(days[0].date)}</span>}
      </div>

      {items.length === 0 && mode === 'trainer' && <div className={ui.muted}>관리자가 측정 항목을 먼저 만들어야 기록할 수 있어요.</div>}
      {items.length > 0 && days.length === 0 && <div className={ui.muted}>아직 측정한 기록이 없어요.</div>}

      {trends.length > 0 && (
        <div className={s.trends}>
          {trends.map((t) => (
            <div key={t.item.id} className={s.trend}>
              <div className={s.trendTop}>
                <span className={s.itemName}>{t.item.name}</span>
                <span className={s.value}>
                  {numText(t.last.value)}
                  <span className={s.unit}>{t.item.unit}</span>
                </span>
              </div>
              <div className={s.trendSub}>
                {t.diff !== null && t.diff !== 0 && (
                  <span className={cx(s.change, t.good === true ? s.good : t.good === false ? s.bad : s.flat)}>
                    {t.diff > 0 ? '▲' : '▼'} {numText(Math.abs(t.diff))}
                    {t.item.unit}
                    {t.good === true ? ' 좋아졌어요' : t.good === false ? ' 조금 떨어졌어요' : ''}
                  </span>
                )}
                {t.diff === 0 && <span className={cx(s.change, s.flat)}>지난번과 같아요</span>}
                <span className={ui.small}>
                  {t.prev ? `지난번 ${numText(t.prev.value)}${t.item.unit} (${dayParts(t.prev.date).md})` : `${dayParts(t.last.date).md} 첫 측정`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {days.length > 0 && (
        <div className={cx(ui.divided, s.days)}>
          <span className={ui.small}>날짜별 기록</span>
          {shownDays.map((d) => (
            <div key={d.date} className={s.day}>
              <div className={s.dayHead}>
                <span className={s.dayDate}>{md(d.date)}</span>
                <span className={ui.small}>{[...d.values.values()][0]?.by}</span>
              </div>
              <div className={s.dayValues}>
                {items
                  .filter((i) => d.values.has(i.id))
                  .map((i) => (
                    <span key={i.id} className={s.dayValue}>
                      {i.name} <b>{numText(d.values.get(i.id)!.value)}{i.unit}</b>
                    </span>
                  ))}
              </div>
              {mode === 'trainer' && (
                <div className={s.dayActions}>
                  <button type="button" className={cx(ui.btnSmall)} onClick={() => setSheet({ date: d.date })}>
                    고치기
                  </button>
                  <ConfirmButton armed={confirm.pending === 't' + d.date} onClick={() => del(d.date)} label="지우기" confirmLabel="한 번 더 누르면 지워요" />
                </div>
              )}
            </div>
          ))}
          {days.length > 2 && (
            <button type="button" className={ui.btnSmall} style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? '접기' : `모두 보기 (${days.length}번)`}
            </button>
          )}
        </div>
      )}

      {mode === 'trainer' && items.length > 0 && (
        <button type="button" className={cx(ui.btn, ui.orange)} onClick={() => setSheet({})}>
          + 측정 기록하기
        </button>
      )}
      {sheet && <TestSheet mid={mid} name={name} initialDate={sheet.date} onClose={() => setSheet(null)} />}
    </section>
  );
}

/** 트레이너: 그 날 잰 값을 한 번에 적는다. 이미 적은 날을 고르면 그 값이 채워진다 */
function TestSheet({ mid, name, initialDate, onClose }: { mid: string; name: string; initialDate?: string; onClose: () => void }) {
  const { be, data, setData, staffToken, today, toast, fail } = useApp();
  const items = data.testItems;
  const valuesOf = (date: string) =>
    Object.fromEntries(items.map((i) => [i.id, String(data.tests.find((t) => t.mid === mid && t.date === date && t.item === i.id)?.value ?? '')]));
  const [date, setDate] = useState(initialDate ?? today);
  const [vals, setVals] = useState<Record<string, string>>(() => valuesOf(initialDate ?? today));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const had = data.tests.some((t) => t.mid === mid && t.date === date);

  const moveDate = (d: string) => {
    setDate(d);
    setVals(valuesOf(d));
    setError('');
  };

  const save = async () => {
    if (saving) return;
    const values: { item: string; value: number }[] = [];
    for (const i of items) {
      const raw = (vals[i.id] ?? '').trim().replace(',', '.');
      if (!raw) continue;
      const v = Number(raw);
      if (!Number.isFinite(v) || Math.abs(v) > 100000) return setError(`${i.name} 값을 숫자로 입력해주세요.`);
      values.push({ item: i.id, value: v });
    }
    if (!values.length) return setError('측정한 값을 하나 이상 입력해주세요.');
    setSaving(true);
    try {
      const saved = await be.trainerSaveTests(staffToken, mid, date, values);
      setData((d) => ({ ...d, tests: [...d.tests.filter((t) => !(t.mid === mid && t.date === date)), ...saved] }));
      toast('측정 기록을 저장했어요');
      onClose();
    } catch (e) {
      setSaving(false);
      fail(e);
    }
  };

  return (
    <Sheet title={`${name} 님 체력 측정`} onClose={onClose}>
      <DateNav date={date} today={today} onChange={moveDate} />
      <div className={ui.note}>{had ? '이 날 적은 값이에요. 고친 뒤 저장하세요.' : '잰 항목만 적으면 돼요.'}</div>
      {items.map((i) => (
        <label key={i.id} className={ui.field} style={{ gap: '0.375rem' }}>
          <span className={s.inputLabel}>
            <span className={ui.label}>{i.name}</span>
            {i.better !== 'none' && <span className={ui.small}>{BETTER_LABEL[i.better]}</span>}
          </span>
          <span className={s.withUnit}>
            <input
              className={ui.input}
              inputMode="decimal"
              value={vals[i.id] ?? ''}
              onChange={(e) => {
                setVals((v) => ({ ...v, [i.id]: e.target.value.replace(/[^0-9.,-]/g, '').slice(0, 9) }));
                setError('');
              }}
              autoComplete="off"
            />
            {i.unit && <span className={s.unitText}>{i.unit}</span>}
          </span>
        </label>
      ))}
      {error && (
        <div role="alert" className={ui.error}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnSave, ui.orange)} disabled={saving} onClick={() => void save()}>
        {saving ? '저장하는 중…' : '저장하기'}
      </button>
    </Sheet>
  );
}
