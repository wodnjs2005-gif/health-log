import type { Notice } from '../lib/backend';
import { cx } from '../lib/cx';
import { md } from '../lib/date';
import ui from '../styles/ui.module.css';
import s from './cards.module.css';

/** 지금 보이는 공지 (끝나는 날이 지나지 않은 것), 최근 것 먼저 */
export const activeNotices = (list: Notice[], today: string) =>
  list.filter((n) => !n.until || n.until >= today).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

/** 이용자·보호자 화면 맨 위의 공지사항 (최근 3개를 카드 하나에) */
export function NoticeList({ notices, today }: { notices: Notice[]; today: string }) {
  const list = activeNotices(notices, today).slice(0, 3);
  if (!list.length) return null;
  return (
    <section className={s.notice} aria-label="공지사항">
      <div className={s.noticeHead}>
        <span className={cx(ui.badge, s.noticeTag)}>공지</span>
        {list.length > 1 && <span className={s.byline}>{list.length}개</span>}
      </div>
      {list.map((n) => (
        <div key={n.id} className={s.noticeItem}>
          <div className={s.noticeText}>{n.text}</div>
          <span className={s.byline}>
            {md(n.date)} · {n.by}
          </span>
        </div>
      ))}
    </section>
  );
}
