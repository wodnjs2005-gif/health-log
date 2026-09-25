import { useApp } from '../../AppContext';
import { addDays, parseYmd } from '../../lib/date';
import { daysLabel, monthRate, sessionDays } from '../../lib/lessons';
import ui from '../../styles/ui.module.css';
import l from './lesson.module.css';

const RECENT = 5;
const short = (ds: string) => {
  const d = parseYmd(ds);
  return `${d.getMonth() + 1}.${d.getDate()}`;
};

/** 한 이용자의 수업 출석 (이용자·보호자·트레이너 화면). 다니는 수업이 없으면 아무것도 그리지 않는다 */
export function MemberLessons({ mid }: { mid: string }) {
  const { data, today } = useApp();
  const mine = data.lessons.filter((x) => x.roster.some((r) => r.mid === mid));
  if (!mine.length) return null;

  return (
    <section className={ui.card} style={{ padding: '1.125rem 1rem', gap: '0.75rem' }}>
      <h3 className={ui.h3}>수업 출석</h3>
      {mine.map((x) => {
        const rate = monthRate(x, mid, data.attendance, data.offdays, today);
        const recent = sessionDays(x, mid, data.attendance, data.offdays, addDays(today, -90), today).slice(0, RECENT);
        return (
          <div key={x.id} className={ui.divided} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.75rem' }}>
            <div className={l.rateRow}>
              <span className={l.lessonHead}>
                <span className={l.rosterName} style={{ fontSize: '1.125rem' }}>
                  {x.name}
                </span>
                <span className={ui.muted}>{daysLabel(x.days)}</span>
              </span>
              <span>
                이번 달 <span className={l.rateNum}>{rate.present}</span>/{rate.total}회
              </span>
            </div>
            {recent.length > 0 && (
              <div className={l.recent} aria-label="최근 수업일">
                {recent.map((d) => (
                  <span key={d.date} className={l.recentDay} data-present={d.present}>
                    {short(d.date)} {d.present ? '출석' : '결석'}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
