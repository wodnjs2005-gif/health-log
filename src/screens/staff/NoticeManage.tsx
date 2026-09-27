import { useState } from 'react';
import { useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Sheet } from '../../components/Layout';
import { useConfirm } from '../../hooks/useConfirm';
import { cx } from '../../lib/cx';
import { addDays, md } from '../../lib/date';
import ui from '../../styles/ui.module.css';
import cs from '../../components/cards.module.css';
import type { StaffColor } from './ProgramSheet';

const NOTICE_MAX = 300;
/** 보여줄 기간: 오늘부터 며칠 뒤까지 (null = 지울 때까지) */
const PERIODS: { label: string; days: number | null }[] = [
  { label: '오늘만', days: 0 },
  { label: '1주일', days: 6 },
  { label: '한 달', days: 29 },
  { label: '지울 때까지', days: null },
];

/** 공지사항 올리기·지우기 (트레이너·관리자). 올린 공지는 모든 이용자·보호자 화면 위에 보인다 */
export function NoticeManage({ onClose, color = 'orange' }: { onClose: () => void; color?: StaffColor }) {
  const { be, data, setData, staffToken, today, toast, fail } = useApp();
  const [text, setText] = useState('');
  const [period, setPeriod] = useState(1);
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const choice = color === 'navy' ? ui.choiceNavy : ui.choiceOrange;
  const list = [...data.notices].sort((a, b) => b.date.localeCompare(a.date));
  const ended = (until: string | null) => !!until && until < today;

  const save = async () => {
    const t = text.trim();
    if (!t || saving) return;
    const days = PERIODS[period].days;
    setSaving(true);
    try {
      const n = await be.staffAddNotice(staffToken, t, days === null ? null : addDays(today, days));
      setData((d) => ({ ...d, notices: [n, ...d.notices] }));
      setText('');
      toast('공지를 올렸어요');
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const del = (id: string) =>
    confirm.tap('nt' + id, async () => {
      try {
        await be.staffDelNotice(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({ ...d, notices: d.notices.filter((x) => x.id !== id) }));
      toast('공지를 지웠어요');
    });

  return (
    <Sheet title="공지사항" onClose={onClose}>
      <div className={ui.small}>올린 공지는 모든 이용자와 보호자 화면 맨 위에 보여요.</div>
      <label className={ui.field}>
        <span className={ui.label}>공지 내용</span>
        <textarea
          className={ui.textarea}
          rows={4}
          value={text}
          maxLength={NOTICE_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 다음 주 수요일은 복지관 행사로 오전 체조를 쉬어요."
        />
        <span className={cs.counter}>
          {text.length}/{NOTICE_MAX}
        </span>
      </label>
      <div className={ui.field}>
        <span className={ui.label}>보여줄 기간</span>
        <div className={ui.grid2}>
          {PERIODS.map((p, i) => (
            <button key={p.label} type="button" className={cx(ui.choice, choice)} aria-pressed={period === i} onClick={() => setPeriod(i)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className={ui.small}>
          {PERIODS[period].days === null ? '직접 지울 때까지 보여요.' : `${md(addDays(today, PERIODS[period].days!))}까지 보여요.`}
        </span>
      </div>
      <button type="button" className={cx(ui.btn, ui.btnSave, color === 'navy' ? ui.navy : ui.orange)} disabled={!text.trim() || saving} onClick={() => void save()}>
        {saving ? '올리는 중…' : '공지 올리기'}
      </button>

      <div className={cx(ui.divided, ui.sectionHead)} style={{ gap: '0.75rem' }}>
        <span className={ui.label}>올린 공지 {list.length > 0 && `${list.length}개`}</span>
        {list.length === 0 && <div className={ui.muted}>올린 공지가 없어요.</div>}
        {list.map((n) => (
          <div key={n.id} className={cs.notice} style={ended(n.until) ? { opacity: 0.65 } : undefined}>
            <div className={cs.noticeHead}>
              <span className={cx(ui.badge, ended(n.until) ? ui.badgeMuted : cs.noticeTag)}>{ended(n.until) ? '끝남' : '보이는 중'}</span>
              <span className={cs.byline}>
                {md(n.date)} · {n.by}
              </span>
            </div>
            <div className={cs.noticeText}>{n.text}</div>
            <div className={cs.noteFoot}>
              <span className={cs.byline}>{n.until ? `${md(n.until)}까지` : '지울 때까지'}</span>
              <ConfirmButton armed={confirm.pending === 'nt' + n.id} onClick={() => del(n.id)} label="지우기" confirmLabel="한 번 더 누르면 지워요" />
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
