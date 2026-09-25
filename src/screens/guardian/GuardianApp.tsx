import { useState } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import { DateNav } from '../../components/DateNav';
import { Layout, Loading, Sheet } from '../../components/Layout';
import { useConfirm } from '../../hooks/useConfirm';
import type { PublicMember } from '../../lib/backend';
import { CODE_LEN } from '../../lib/code';
import { MAIN3, MEALS, WEEK_GOAL } from '../../lib/constants';
import { cx } from '../../lib/cx';
import { md, mondayOf } from '../../lib/date';
import ui from '../../styles/ui.module.css';
import { CodeInput } from '../CodeLogin';
import { MemberDetail } from '../staff/MemberDetail';
import s from './guardian.module.css';

/** 보호자 화면: 가족의 식사·운동 기록을 보기만 한다 (추가·삭제 없음). 날짜를 넘겨 지난 기록도 본다. */
export function GuardianApp() {
  const { data, guardians, removeGuardian, goEntry, logout, toast, today } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();

  const people = guardians
    .map((g) => data.members.find((m) => m.id === g.mid))
    .filter((m): m is NonNullable<typeof m> => !!m);
  const member = people.find((m) => m.id === selected) ?? people[0];

  if (!member) {
    return (
      <Layout title="보호자" onBack={goEntry}>
        <Loading />
      </Layout>
    );
  }

  // 사람을 바꿔도 보던 날짜는 그대로 둔다
  const pick = (id: string) => {
    confirm.reset();
    setSelected(id);
    scrollTop();
  };
  const moveDate = (d: string) => {
    confirm.reset();
    setDate(d);
  };

  return (
    <Layout title="보호자" onBack={goEntry} headerExtra={<DateNav date={date} today={today} onChange={moveDate} />}>
      <div className={s.people} role="tablist" aria-label="보는 사람">
        {people.length > 1 &&
          people.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={m.id === member.id}
              className={s.person}
              onClick={() => pick(m.id)}
            >
              {m.name}
            </button>
          ))}
        <button type="button" className={s.addPerson} onClick={() => setAdding(true)}>
          + 다른 분 추가
        </button>
      </div>

      <MemberDetail
        member={member}
        end={date}
        onGo={(d) => {
          moveDate(d);
          scrollTop();
        }}
        summary={<DaySummary member={member} date={date} />}
      />

      <div className={s.footer}>
        {people.length > 1 && (
          <ConfirmButton
            armed={confirm.pending === member.id}
            label={`${member.name} 님 목록에서 빼기`}
            confirmLabel="한 번 더 누르면 빼기"
            onClick={() =>
              confirm.tap(member.id, () => {
                removeGuardian(member.id);
                setSelected(null);
                toast('목록에서 뺐어요');
              })
            }
          />
        )}
        <button type="button" className={ui.btnGhost} onClick={logout}>
          로그아웃
        </button>
      </div>

      {adding && (
        <AddSheet
          onClose={() => setAdding(false)}
          onAdded={(mid) => {
            setAdding(false);
            pick(mid);
            toast('추가했어요');
          }}
        />
      )}
    </Layout>
  );
}

/** 고른 날 한눈에: 운동 분, 그 주 누적, 끼니별로 먹은 것 */
function DaySummary({ member, date }: { member: PublicMember; date: string }) {
  const { data, today } = useApp();
  const isToday = date === today;
  const dayEx = data.ex.filter((e) => e.mid === member.id && e.date === date);
  const dayMin = dayEx.reduce((a, e) => a + e.min, 0);
  const mon = mondayOf(date);
  const weekLabel = mon === mondayOf(today) ? '이번 주' : '그 주';
  const weekMin = data.ex.filter((e) => e.mid === member.id && e.date >= mon && e.date <= date).reduce((a, e) => a + e.min, 0);
  const weekPct = Math.min(100, Math.round((weekMin / WEEK_GOAL) * 100));
  const dayMeals = data.meals.filter((m) => m.mid === member.id && m.date === date);
  const mainDone = MAIN3.filter((m) => dayMeals.some((x) => x.meal === m)).length;
  // 간식은 먹은 날에만 줄을 보여준다
  const mealRows = dayMeals.some((x) => x.meal === '간식') ? MEALS : MAIN3;

  return (
    <section className={cx(ui.card, s.summary)}>
      <h3 className={cx(ui.h3, s.summaryTitle)}>{isToday ? '오늘' : md(date)} 한눈에</h3>
      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statLabel}>운동</span>
          <span className={cx(s.statValue, s.green)}>
            {dayMin}
            <span className={s.statUnit}>분</span>
          </span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>식사 (세 끼 중)</span>
          <span className={cx(s.statValue, s.orange)}>
            {mainDone}
            <span className={s.statUnit}>끼</span>
          </span>
        </div>
      </div>
      <div className={ui.sectionHead} style={{ gap: '0.5rem' }}>
        <div
          className={ui.bar}
          role="progressbar"
          aria-label={`${weekLabel} 운동 목표`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={weekPct}
        >
          <div className={ui.barFill} style={{ width: `${weekPct}%` }} />
        </div>
        <div style={{ fontSize: '1rem', color: 'var(--ink-2)' }}>
          {weekLabel} <b>{weekMin}분</b> / 목표 {WEEK_GOAL}분
        </div>
      </div>
      <div className={cx(s.todayMeals, ui.divided)}>
        {mealRows.map((meal) => {
          const items = dayMeals.filter((x) => x.meal === meal);
          return (
            <div key={meal} className={s.todayMeal}>
              <span className={cx(ui.badge, items.length ? ui.badgeOrange : ui.badgeMuted)} style={{ flex: 'none' }}>
                {meal}
              </span>
              {items.length ? (
                <span className={s.todayMealText}>{items.map((x) => x.menu).join(' / ')}</span>
              ) : (
                <span className={cx(s.todayMealText, s.noMeal)}>{isToday ? '아직 기록 없음' : '기록 없음'}</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AddSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (mid: string) => void }) {
  const { addGuardian } = useApp();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (code = value) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const r = await addGuardian(code);
    setBusy(false);
    if ('error' in r) return setError(r.error);
    onAdded(r.mid); // 새로 추가한 분을 바로 보여준다
  };

  return (
    <Sheet title="다른 분 추가" onClose={onClose}>
      <div className={ui.lead}>그분의 보호자 번호 6자리를 입력하세요.</div>
      <CodeInput
        value={value}
        color="plum"
        invalid={!!error}
        autoFocus
        onChange={(v) => {
          setValue(v);
          setError('');
          if (v.length === CODE_LEN) void submit(v);
        }}
        onSubmit={() => void submit()}
      />
      {error && (
        <div role="alert" className={ui.error} style={{ textAlign: 'center' }}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnSave, ui.plum)} disabled={busy} onClick={() => void submit()}>
        {busy ? '확인하는 중…' : '추가하기'}
      </button>
    </Sheet>
  );
}
