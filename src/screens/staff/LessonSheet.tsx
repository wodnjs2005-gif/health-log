import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import { isAuthError, type Lesson } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { WD } from '../../lib/date';
import { DAY_ORDER } from '../../lib/lessons';
import ui from '../../styles/ui.module.css';
import l from './lesson.module.css';
import { MemberPicker } from './MemberPicker';
import type { StaffColor } from './ProgramSheet';

interface Props {
  /** 있으면 수정, 없으면 새 수업 */
  lesson?: Lesson;
  color?: StaffColor;
  onClose: () => void;
  onSaved?: (l: Lesson) => void;
}

/** 수업 만들기·고치기: 이름, 요일, 대상 이용자 */
export function LessonSheet({ lesson, color = 'orange', onClose, onSaved }: Props) {
  const { be, data, staffToken, setData, toast, fail, refresh } = useApp();
  const [name, setName] = useState(lesson?.name ?? '');
  const [days, setDays] = useState<number[]>(lesson?.days ?? []);
  // 그사이 삭제된 이용자는 처음부터 빼 둔다
  const [mids, setMids] = useState(() => (lesson?.roster ?? []).map((r) => r.mid).filter((mid) => data.members.some((m) => m.id === mid)));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const choice = color === 'navy' ? ui.choiceNavy : ui.choiceOrange;

  const save = async () => {
    const n = name.trim();
    if (!n) return setError('수업 이름을 입력해주세요.');
    if (!days.length) return setError('요일을 골라주세요.');
    if (!mids.length) return setError('대상 이용자를 골라주세요.');
    if (saving) return;
    setSaving(true);
    try {
      const input = { name: n, days, mids };
      const saved = lesson ? await be.staffUpdateLesson(staffToken, lesson.id, input) : await be.staffAddLesson(staffToken, input);
      setData((d) => ({
        ...d,
        lessons: lesson ? d.lessons.map((x) => (x.id === saved.id ? saved : x)) : [...d.lessons, saved],
      }));
      toast(lesson ? '수업을 고쳤어요' : '수업을 만들었어요');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setSaving(false);
      if (isAuthError(e)) return fail(e);
      setError('저장하지 못했어요. 잠시 뒤 다시 해주세요.');
      void refresh();
    }
  };

  return (
    <Sheet title={lesson ? '수업 고치기' : '수업 만들기'} onClose={onClose}>
      <label className={ui.field}>
        <span className={ui.label}>수업 이름</span>
        <input
          className={ui.input}
          value={name}
          onChange={(e) => {
            setName(e.target.value.slice(0, 30));
            setError('');
          }}
          placeholder="예: 오전 체조"
          autoComplete="off"
        />
      </label>

      <div className={ui.field}>
        <div className={ui.label}>요일</div>
        <div className={l.dayGrid}>
          {DAY_ORDER.map((d) => (
            <button
              key={d}
              type="button"
              className={cx(ui.choice, choice)}
              aria-pressed={days.includes(d)}
              aria-label={`${WD[d]}요일`}
              onClick={() => {
                setDays((v) => (v.includes(d) ? v.filter((x) => x !== d) : [...v, d]));
                setError('');
              }}
            >
              {WD[d]}
            </button>
          ))}
        </div>
      </div>

      <div className={ui.field}>
        <div className={ui.label}>대상 이용자</div>
        <MemberPicker
          members={data.members}
          selected={mids}
          onChange={(v) => {
            setMids(v);
            setError('');
          }}
          color={color}
        />
      </div>

      {error && (
        <div role="alert" className={ui.error}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnSave, color === 'navy' ? ui.navy : ui.orange)} disabled={saving} onClick={() => void save()}>
        {saving ? '저장하는 중…' : '저장하기'}
      </button>
    </Sheet>
  );
}
