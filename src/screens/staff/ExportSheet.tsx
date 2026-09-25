import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import { ageOf } from '../../lib/age';
import { cx } from '../../lib/cx';
import { exportCounts, exportFileName, rangePresets, type ExportOptions, type Range } from '../../lib/exportInfo';
import { monthStart } from '../../lib/lessons';
import ui from '../../styles/ui.module.css';
import { MemberFilter, TagList, useMemberFilter } from './MemberFilter';
import type { StaffColor } from './ProgramSheet';
import s from './staff.module.css';

interface Props {
  onClose: () => void;
  color?: StaffColor;
  /** 이용자 상세·카드에서 열면 그 이용자를 미리 고른다 */
  initialMid?: string;
}

/** 파일 저장: 링크를 만들어 눌러준다 (휴대폰 크롬·사파리 모두 '다운로드'로 저장) */
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** 기록 내려받기 (관리자·트레이너): 기간 + 전체 또는 한 명 → 엑셀 파일 */
export function ExportSheet({ onClose, color = 'orange', initialMid }: Props) {
  const { data, today, toast } = useApp();
  const [scope, setScope] = useState<'all' | 'one'>(initialMid ? 'one' : 'all');
  const [mid, setMid] = useState<string | null>(initialMid ?? null);
  const [range, setRange] = useState<Range>({ from: monthStart(today), to: today });
  const { filter, setFilter, shown } = useMemberFilter(data.members);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const choice = color === 'navy' ? ui.choiceNavy : ui.choiceOrange;

  const picked = mid ? data.members.find((m) => m.id === mid) : undefined;
  const mids = scope === 'all' ? data.members.map((m) => m.id) : picked ? [picked.id] : [];
  const valid = !!range.from && !!range.to && range.from <= range.to;
  const counts = valid ? exportCounts(data, mids, range.from, range.to) : null;

  const set = (r: Partial<Range>) => {
    setRange((v) => ({ ...v, ...r }));
    setError('');
  };

  const run = async () => {
    if (!range.from || !range.to) return setError('기간을 입력해주세요.');
    if (range.from > range.to) return setError('시작일이 종료일보다 늦어요.');
    if (range.to > today) return setError('종료일은 오늘까지 고를 수 있어요.');
    if (!mids.length) return setError(scope === 'one' ? '이용자를 골라주세요.' : '등록된 이용자가 없어요.');
    if (busy) return;
    setBusy(true);
    const opts: ExportOptions = { data, mids, single: scope === 'one', from: range.from, to: range.to, today };
    try {
      // 엑셀 라이브러리는 이때 처음 불러온다
      const { buildExport } = await import('../../lib/exportXlsx');
      saveFile(await buildExport(opts), exportFileName(opts));
      toast('엑셀 파일을 내려받았어요');
      onClose();
    } catch {
      setBusy(false);
      setError('파일을 만들지 못했어요. 인터넷 연결을 확인하고 다시 눌러주세요.');
    }
  };

  return (
    <Sheet title="기록 내려받기" onClose={onClose}>
      <div className={ui.field}>
        <div className={ui.label}>대상</div>
        <div className={ui.grid2}>
          <button type="button" className={cx(ui.choice, choice)} aria-pressed={scope === 'all'} onClick={() => { setScope('all'); setError(''); }}>
            전체 이용자
          </button>
          <button type="button" className={cx(ui.choice, choice)} aria-pressed={scope === 'one'} onClick={() => { setScope('one'); setError(''); }}>
            한 명 고르기
          </button>
        </div>
      </div>

      {scope === 'one' && (
        <div className={cx(s.filter, color === 'navy' && s.navyAccent)}>
          <MemberFilter members={data.members} value={filter} onChange={setFilter} />
          {shown.length === 0 ? (
            <div className={s.resultNote}>찾는 이용자가 없어요.</div>
          ) : (
            <div className={s.pickList} role="radiogroup" aria-label="이용자">
              {shown.map((m) => {
                const on = m.id === mid;
                const age = ageOf(m, today);
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={s.pickRow}
                    onClick={() => {
                      setMid(m.id);
                      setError('');
                    }}
                  >
                    <span className={s.box} aria-hidden="true">
                      {on ? '✓' : ''}
                    </span>
                    <span className={s.pickMain}>
                      <span className={s.pickName}>
                        {m.name}
                        {age !== null && <span className={s.resultNote}> · {age}세</span>}
                      </span>
                      <TagList tags={m.tags} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={ui.field}>
        <div className={ui.label}>기간</div>
        <div className={ui.choices}>
          {rangePresets(today).map((p) => (
            <button
              key={p.label}
              type="button"
              className={cx(ui.choice, choice, ui.pill)}
              aria-pressed={p.range.from === range.from && p.range.to === range.to}
              onClick={() => set(p.range)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className={s.rangeRow}>
          <label className={s.rangeField}>
            <span className={ui.small}>시작일</span>
            <input type="date" className={ui.input} value={range.from} max={today} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label className={s.rangeField}>
            <span className={ui.small}>종료일</span>
            <input type="date" className={ui.input} value={range.to} max={today} onChange={(e) => set({ to: e.target.value })} />
          </label>
        </div>
      </div>

      {counts && mids.length > 0 && (
        <div className={ui.note}>
          {scope === 'one' && picked ? `${picked.name} 님` : `전체 ${mids.length}명`} · 운동 {counts.ex}건 · 식사 {counts.meals}건 · 수업 {counts.lessons}개
        </div>
      )}

      {error && (
        <div role="alert" className={ui.error}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnSave, color === 'navy' ? ui.navy : ui.orange)} disabled={busy} onClick={() => void run()}>
        {busy ? '파일 만드는 중…' : '엑셀 파일 내려받기'}
      </button>
    </Sheet>
  );
}
