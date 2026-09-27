import { useState } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { InstallCard } from '../../components/InstallCard';
import { Layout } from '../../components/Layout';
import { useConfirm } from '../../hooks/useConfirm';
import { activityOf, sortByActivity, STALE_DAYS, staleText } from '../../lib/activity';
import type { Member } from '../../lib/backend';
import { MAIN3, WEEK_GOAL } from '../../lib/constants';
import { cx } from '../../lib/cx';
import { md, mondayOf } from '../../lib/date';
import { fmt, sumMeals } from '../../lib/nutrition';
import { trainerTitle } from '../../lib/rank';
import type { MemberFilterValue } from '../../lib/tags';
import ui from '../../styles/ui.module.css';
import { MemberFilter, TagList, useMemberFilter } from '../staff/MemberFilter';
import { ExportSheet } from '../staff/ExportSheet';
import { LessonManage } from '../staff/LessonManage';
import { NoticeManage } from '../staff/NoticeManage';
import { StaffMemberView } from '../staff/StaffMemberView';
import { VideoManage } from '../staff/VideoManage';
import s from '../staff/staff.module.css';

type TTab = 'members' | 'lessons' | 'videos';

export function TrainerApp() {
  const { data, goEntry, refresh, logout, staffName, staffRank } = useApp();
  const title = staffName ? trainerTitle(staffName, staffRank) : '트레이너';
  const [tTab, setTTab] = useState<TTab>('members');
  const [tView, setTView] = useState<string | null>(null);
  // 상세 화면에 갔다 와도 찾던 조건은 그대로 둔다
  const { filter, setFilter, shown } = useMemberFilter(data.members);
  const [exportingAll, setExportingAll] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const confirm = useConfirm();

  const detail = tView ? data.members.find((m) => m.id === tView) : null;

  if (detail) {
    return (
      <StaffMemberView
        member={detail}
        title={title}
        color="orange"
        onBack={() => {
          setTView(null);
          scrollTop();
          void refresh();
        }}
      />
    );
  }

  return (
    <Layout title={title} onBack={goEntry}>
      <div role="tablist" aria-label="트레이너 메뉴" className={s.switch}>
        {(
          [
            ['members', '이용자 기록'],
            ['lessons', '출석'],
            ['videos', '운동 영상'],
          ] as [TTab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tTab === k}
            className={s.switchBtn}
            onClick={() => {
              confirm.reset();
              setTTab(k);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tTab === 'lessons' ? (
        <LessonManage confirm={confirm} />
      ) : tTab === 'members' ? (
        <MemberList
          filter={filter}
          onFilter={setFilter}
          shown={shown}
          onExport={() => setExportingAll(true)}
          onOpen={(id) => {
            confirm.reset();
            setTView(id);
            scrollTop();
          }}
        />
      ) : (
        <VideoManage confirm={confirm} />
      )}

      <InstallCard color="orange" />
      <div className={s.bottomMenu}>
        <button type="button" className={ui.btnGhost} onClick={() => setNoticeOpen(true)}>
          {data.notices.length > 0 ? `공지사항 (${data.notices.length})` : '공지사항 올리기'}
        </button>
        <button type="button" className={ui.btnGhost} onClick={logout}>
          로그아웃
        </button>
      </div>
      {exportingAll && <ExportSheet onClose={() => setExportingAll(false)} />}
      {noticeOpen && <NoticeManage onClose={() => setNoticeOpen(false)} />}
    </Layout>
  );
}

interface ListProps {
  onExport: () => void;
  filter: MemberFilterValue;
  shown: Member[];
  onFilter: (f: MemberFilterValue) => void;
  onOpen: (id: string) => void;
}

function MemberList({ filter, onFilter, shown, onOpen, onExport }: ListProps) {
  const { data, today } = useApp();
  const mon = mondayOf(today);
  // 기록이 끊긴 분을 맨 위로
  const sorted = sortByActivity(shown, data, today);
  const staleCount = shown.filter((m) => activityOf(data, m.id, today).stale).length;

  return (
    <>
      <div className={ui.row} style={{ padding: '0.25rem', alignItems: 'center' }}>
        <h2 className={ui.h2}>담당 이용자</h2>
        {data.members.length > 0 && (
          <button type="button" className={ui.btnSmall} onClick={onExport}>
            엑셀 내려받기
          </button>
        )}
      </div>
      {data.members.length === 0 ? (
        <div className={ui.empty}>등록된 이용자가 없어요.</div>
      ) : (
        <MemberFilter members={data.members} value={filter} onChange={onFilter} shown={shown.length} />
      )}
      {data.members.length > 0 && shown.length === 0 && <div className={ui.empty}>찾는 이용자가 없어요.</div>}
      {staleCount > 0 && (
        <div className={s.staleNote} role="status">
          {STALE_DAYS}일 이상 기록이 없는 분이 <b>{staleCount}명</b> 있어요. 맨 위에 모았어요.
        </div>
      )}
      {sorted.map((m) => {
        const week = data.ex.filter((e) => e.mid === m.id && e.date >= mon && e.date <= today).reduce((a, e) => a + e.min, 0);
        const pct = Math.min(100, Math.round((week / WEEK_GOAL) * 100));
        const mealsToday = MAIN3.filter((x) => data.meals.some((e) => e.mid === m.id && e.date === today && e.meal === x)).length;
        const nutriToday = sumMeals(data.meals.filter((e) => e.mid === m.id && e.date === today));
        const act = activityOf(data, m.id, today);
        const last = act.last;
        const warn = staleText(act);
        return (
          <button key={m.id} type="button" className={cx(ui.card, s.memberCard, act.stale && s.memberStale)} onClick={() => onOpen(m.id)}>
            <div className={ui.row} style={{ flexWrap: 'nowrap', width: '100%', gap: '0.75rem' }}>
              <span className={s.memberName}>{m.name}</span>
              <span className={s.memberMin}>
                <span className={s.memberMinLabel}>이번 주 </span>
                {week}분
              </span>
            </div>
            {warn && <span className={cx(ui.badge, act.stale ? s.staleBadge : ui.badgeMuted)}>{warn}</span>}
            <TagList tags={m.tags} />
            <div className={cx(ui.bar, ui.barThin)} style={{ width: '100%' }} aria-hidden="true">
              <div className={ui.barFill} style={{ width: `${pct}%` }} />
            </div>
            <div className={s.memberMeta} style={{ width: '100%' }}>
              <span>
                오늘 식사 {mealsToday}/3끼{nutriToday.counted > 0 && ` · ${fmt('kcal', nutriToday.sum.kcal)}`}
              </span>
              <span>{last ? `최근 기록 ${last === today ? '오늘' : md(last)}` : '기록 없음'}</span>
            </div>
          </button>
        );
      })}
    </>
  );
}
