import { useRef, useState } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import { DateNav } from '../../components/DateNav';
import type { useConfirm } from '../../hooks/useConfirm';
import { isAuthError, type Lesson } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { daysLabel, isLessonDay, isOff, isPresent, monthRate, sortLessons } from '../../lib/lessons';
import ui from '../../styles/ui.module.css';
import l from './lesson.module.css';
import { LessonSheet } from './LessonSheet';
import type { StaffColor } from './ProgramSheet';
import s from './staff.module.css';

interface Props {
  confirm: ReturnType<typeof useConfirm>;
  /** 트레이너=주황, 관리자=남색 */
  color?: StaffColor;
}

/** 수업 목록 → 수업을 누르면 날짜별 출석부 (트레이너·관리자 공용) */
export function LessonManage({ confirm, color = 'orange' }: Props) {
  const { data, today } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const open = openId ? data.lessons.find((x) => x.id === openId) : undefined;

  if (open) {
    return (
      <LessonDetail
        key={open.id}
        lesson={open}
        confirm={confirm}
        color={color}
        onBack={() => {
          confirm.reset();
          setOpenId(null);
          scrollTop();
        }}
      />
    );
  }

  const lessons = sortLessons(data.lessons, data.offdays, today);
  const btnColor = color === 'navy' ? ui.navy : ui.orange;

  return (
    <>
      <div className={ui.row} style={{ padding: '0.25rem' }}>
        <h2 className={ui.h2}>수업</h2>
        <div className={ui.muted}>{lessons.length}개</div>
      </div>
      <button type="button" className={cx(ui.btn, btnColor)} onClick={() => setAdding(true)}>
        + 수업 만들기
      </button>
      {lessons.length === 0 && <div className={ui.empty}>만든 수업이 없어요.</div>}
      {lessons.map((x) => {
        const mids = activeMids(x, data.members);
        const todayOn = isLessonDay(x, today) && !isOff(data.offdays, x.id, today);
        const here = mids.filter((mid) => isPresent(data.attendance, x.id, mid, today)).length;
        return (
          <button
            key={x.id}
            type="button"
            className={cx(ui.card, l.lessonCard)}
            onClick={() => {
              confirm.reset();
              setOpenId(x.id);
              scrollTop();
            }}
          >
            <span className={l.lessonHead}>
              <span className={l.lessonName}>{x.name}</span>
              {todayOn && <span className={cx(ui.badge, ui.badgeGreen)}>오늘 수업</span>}
            </span>
            <span className={l.lessonMeta}>
              <span>
                {daysLabel(x.days)} · {mids.length}명
              </span>
              {(todayOn || here > 0) && (
                <span>
                  오늘 출석 {here}/{mids.length}명
                </span>
              )}
            </span>
          </button>
        );
      })}
      {adding && (
        <LessonSheet
          color={color}
          onClose={() => setAdding(false)}
          onSaved={(saved) => {
            setOpenId(saved.id);
            scrollTop();
          }}
        />
      )}
    </>
  );
}

/** 지금 대상인 이용자 (삭제된 이용자는 뺀다), 이름순 */
const activeMids = (x: Lesson, members: { id: string; name: string }[]) =>
  x.roster
    .map((r) => members.find((m) => m.id === r.mid))
    .filter((m): m is { id: string; name: string } => !!m)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map((m) => m.id);

interface DetailProps extends Props {
  lesson: Lesson;
  onBack: () => void;
}

function LessonDetail({ lesson, confirm, color = 'orange', onBack }: DetailProps) {
  const { be, data, staffToken, setData, today, toast, fail, refresh } = useApp();
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState(false);
  const [offBusy, setOffBusy] = useState(false);
  // 저장 중인 줄은 다시 눌러도 무시 (빠르게 두 번 눌러 순서가 뒤바뀌지 않게)
  const pending = useRef(new Set<string>());

  const mids = activeMids(lesson, data.members);
  const nameOf = (mid: string) => data.members.find((m) => m.id === mid)?.name ?? '';
  const off = isOff(data.offdays, lesson.id, date);
  const lessonDay = isLessonDay(lesson, date);
  const presentCount = mids.filter((mid) => isPresent(data.attendance, lesson.id, mid, date)).length;

  const onError = (e: unknown) => {
    if (isAuthError(e)) return fail(e);
    toast('저장하지 못했어요. 다시 눌러주세요');
    void refresh();
  };

  const toggle = async (mid: string) => {
    const key = mid + date;
    if (pending.current.has(key)) return;
    const present = !isPresent(data.attendance, lesson.id, mid, date);
    const rec = { lid: lesson.id, mid, date };
    const apply = (on: boolean) =>
      setData((d) => ({
        ...d,
        attendance: on
          ? [...d.attendance.filter((a) => !(a.lid === rec.lid && a.mid === mid && a.date === date)), rec]
          : d.attendance.filter((a) => !(a.lid === rec.lid && a.mid === mid && a.date === date)),
      }));
    pending.current.add(key);
    apply(present); // 먼저 화면에 반영하고, 실패하면 되돌린다
    try {
      await be.staffSetAttendance(staffToken, lesson.id, mid, date, present);
    } catch (e) {
      apply(!present);
      onError(e);
    } finally {
      pending.current.delete(key);
    }
  };

  const setOff = async (v: boolean) => {
    if (offBusy) return;
    setOffBusy(true);
    try {
      await be.staffSetOffday(staffToken, lesson.id, date, v);
      setData((d) => ({
        ...d,
        offdays: v ? [...d.offdays, { lid: lesson.id, date }] : d.offdays.filter((o) => !(o.lid === lesson.id && o.date === date)),
      }));
      toast(v ? '휴강으로 표시했어요' : '휴강을 취소했어요');
    } catch (e) {
      onError(e);
    } finally {
      setOffBusy(false);
    }
  };

  const del = () =>
    confirm.tap('ld' + lesson.id, async () => {
      try {
        await be.staffDelLesson(staffToken, lesson.id);
      } catch (e) {
        return onError(e);
      }
      setData((d) => ({
        ...d,
        lessons: d.lessons.filter((x) => x.id !== lesson.id),
        attendance: d.attendance.filter((a) => a.lid !== lesson.id),
        offdays: d.offdays.filter((o) => o.lid !== lesson.id),
      }));
      toast('수업을 삭제했어요');
      onBack();
    });

  return (
    <>
      <div>
        <button type="button" className={ui.btnSmall} onClick={onBack}>
          ‹ 수업 목록
        </button>
      </div>
      <div className={l.detailHead}>
        <h2 className={ui.h2}>{lesson.name}</h2>
        <div className={ui.muted}>
          {daysLabel(lesson.days)} · {mids.length}명
        </div>
      </div>

      <DateNav date={date} today={today} onChange={setDate} />

      {off ? (
        <div className={cx(ui.note, l.offNote)}>
          <span>휴강한 날이에요.</span>
          <button type="button" className={ui.btnSmall} disabled={offBusy} onClick={() => void setOff(false)}>
            휴강 취소
          </button>
        </div>
      ) : (
        <div className={l.tally}>
          <span>
            출석 <span className={l.tallyNum}>{presentCount}</span> / {mids.length}명
          </span>
          {!lessonDay && <span className={ui.muted}>수업 요일이 아니에요</span>}
        </div>
      )}

      {mids.length === 0 ? (
        <div className={ui.empty}>대상 이용자가 없어요.</div>
      ) : (
        <div className={l.roster}>
          {mids.map((mid) => {
            const here = isPresent(data.attendance, lesson.id, mid, date);
            const rate = monthRate(lesson, mid, data.attendance, data.offdays, today);
            return (
              <button
                key={mid}
                type="button"
                className={l.rosterRow}
                aria-pressed={here}
                disabled={off}
                onClick={() => void toggle(mid)}
              >
                <span className={l.rosterMain}>
                  <span className={l.rosterName}>{nameOf(mid)}</span>
                  <span className={l.rosterSub}>
                    이번 달 {rate.present}/{rate.total}회
                  </span>
                </span>
                <span className={l.mark}>{here ? '출석 ✓' : lessonDay ? '결석' : '체크'}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className={s.actions}>
        {!off && lessonDay && presentCount === 0 && (
          <button type="button" className={ui.btnSmall} disabled={offBusy} onClick={() => void setOff(true)}>
            이 날 휴강
          </button>
        )}
        <button type="button" className={cx(ui.btnSmall, color === 'navy' && ui.btnNavyOutline)} onClick={() => setEditing(true)}>
          수업 고치기
        </button>
        <ConfirmButton armed={confirm.pending === 'ld' + lesson.id} onClick={del} label="수업 삭제" />
      </div>

      {editing && <LessonSheet lesson={lesson} color={color} onClose={() => setEditing(false)} />}
    </>
  );
}
