import { useState } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { Avatar } from '../../components/Avatar';
import { InstallCard } from '../../components/InstallCard';
import { EditableAvatar, PhotoSheet } from '../../components/PhotoSheet';
import { Layout } from '../../components/Layout';
import cs from '../../components/Chat.module.css';
import { useStaffChat } from '../../hooks/useChat';
import { ChatList } from '../staff/ChatList';
import { useConfirm } from '../../hooks/useConfirm';
import { activityOf, sortByActivity, STALE_DAYS, staleText } from '../../lib/activity';
import type { Member } from '../../lib/backend';
import { MAIN3, WEEK_GOAL } from '../../lib/constants';
import { cx } from '../../lib/cx';
import { md, mondayOf } from '../../lib/date';
import { fmt, sumMeals } from '../../lib/nutrition';
import { trainerTitle } from '../../lib/rank';
import { LS, lsGet, lsSet } from '../../lib/storage';
import type { MemberFilterValue } from '../../lib/tags';
import ui from '../../styles/ui.module.css';
import { MemberFilter, TagList, useMemberFilter } from '../staff/MemberFilter';
import { ExportSheet } from '../staff/ExportSheet';
import { LessonManage } from '../staff/LessonManage';
import { NoticeManage } from '../staff/NoticeManage';
import { StaffMemberView } from '../staff/StaffMemberView';
import { VideoManage } from '../staff/VideoManage';
import s from '../staff/staff.module.css';
import { useBack } from '../../hooks/useBack';
import { useViewMode } from '../../hooks/useViewMode';
import { ViewToggle } from '../staff/ViewToggle';

type TTab = 'members' | 'chat' | 'lessons' | 'videos';

export function TrainerApp() {
  const { data, goEntry, refresh, logout, staffName, staffRank, staffId } = useApp();
  const [myPhoto, setMyPhoto] = useState(false);
  const title = staffName ? trainerTitle(staffName, staffRank) : '트레이너';
  const [tTab, setTTab] = useState<TTab>('members');
  const [tView, setTView] = useState<string | null>(null);
  // 상세 화면에 갔다 와도 찾던 조건은 그대로 둔다
  const { filter, setFilter, shown: found } = useMemberFilter(data.members);
  // 「내 담당」: 담당 이용자가 있으면 처음에는 켜 두고, 고른 것은 기억한다
  const myCount = data.members.filter((m) => data.assign[m.id] === staffId).length;
  const [mineSaved, setMineSaved] = useState(() => lsGet(LS.mineOnly));
  const mineOn = myCount > 0 && mineSaved !== 'off';
  const shown = mineOn ? found.filter((m) => data.assign[m.id] === staffId) : found;
  const toggleMine = () => {
    const v = mineOn ? 'off' : 'on';
    setMineSaved(v);
    lsSet(LS.mineOnly, v);
  };
  const [exportingAll, setExportingAll] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const confirm = useConfirm();
  // 대화: 트레이너 화면이 열려 있는 동안 초인종을 듣고 안 읽은 수를 탭에 보여준다
  const chat = useStaffChat();
  // 「뒤로」: 다른 메뉴에 있으면 이용자 기록으로
  useBack(tTab !== 'members', () => setTTab('members'));

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
    <Layout
      title={title}
      onBack={goEntry}
      avatar={staffId ? <EditableAvatar id={staffId} name={staffName} size="md" onEdit={() => setMyPhoto(true)} /> : undefined}
    >
      <div role="tablist" aria-label="트레이너 메뉴" className={s.switch}>
        {(
          [
            ['members', '이용자 기록'],
            ['chat', '대화'],
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
            {k === 'chat' && chat.unread > 0 && (
              <span className={cx(cs.badge, s.switchBadge)} aria-label={`안 읽은 메시지 ${chat.unread}개`}>
                {chat.unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {tTab === 'chat' ? (
        <ChatList mode="trainer" chat={chat} />
      ) : tTab === 'lessons' ? (
        <LessonManage confirm={confirm} />
      ) : tTab === 'members' ? (
        <MemberList
          filter={filter}
          onFilter={setFilter}
          shown={shown}
          mine={myCount > 0 ? { on: mineOn, count: myCount, onToggle: toggleMine } : undefined}
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
      {myPhoto && staffId && <PhotoSheet target={{ kind: 'trainer', id: staffId }} name={staffName} title="내 사진" onClose={() => setMyPhoto(false)} />}
    </Layout>
  );
}

interface ListProps {
  onExport: () => void;
  filter: MemberFilterValue;
  shown: Member[];
  onFilter: (f: MemberFilterValue) => void;
  onOpen: (id: string) => void;
  mine?: { on: boolean; count: number; onToggle: () => void };
}

function MemberList({ filter, onFilter, shown, onOpen, onExport, mine }: ListProps) {
  const { data, today } = useApp();
  const mon = mondayOf(today);
  // 기록이 끊긴 분을 맨 위로
  const sorted = sortByActivity(shown, data, today);
  const staleCount = shown.filter((m) => activityOf(data, m.id, today).stale).length;
  // 목록(자세히) / 타일(사진·이름만, 세 칸씩). 고른 것은 기기에 기억한다
  const [tile, pickView] = useViewMode(LS.memberView);

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
        <MemberFilter
          members={data.members}
          value={filter}
          onChange={onFilter}
          shown={shown.length}
          mine={mine}
          side={<ViewToggle tile={tile} onChange={pickView} />}
        />
      )}
      {data.members.length > 0 && shown.length === 0 && <div className={ui.empty}>찾는 이용자가 없어요.</div>}
      {staleCount > 0 && (
        <div className={s.staleNote} role="status">
          {STALE_DAYS}일 이상 기록이 없는 분이 <b>{staleCount}명</b> 있어요. 맨 위에 모았어요.
        </div>
      )}
      {tile && (
        <div className={s.tiles}>
          {sorted.map((m) => {
            const week = data.ex.filter((e) => e.mid === m.id && e.date >= mon && e.date <= today).reduce((a, e) => a + e.min, 0);
            const mealsToday = MAIN3.filter((x) => data.meals.some((e) => e.mid === m.id && e.date === today && e.meal === x)).length;
            const act = activityOf(data, m.id, today);
            return (
              <button key={m.id} type="button" className={cx(ui.card, s.tile, act.stale && s.memberStale)} onClick={() => onOpen(m.id)}>
                <Avatar id={m.id} name={m.name} size="lg" tone="orange" />
                <span className={s.tileName}>{m.name}</span>
                <span className={s.tileInfo} title="이번 주 운동">
                  운동 <b className={s.tileMin}>{week}분</b>
                </span>
                <span className={s.tileInfo} title="오늘 식사">
                  식사 {mealsToday}/3
                </span>
                {act.stale && <span className={cx(ui.badge, s.staleBadge, s.tileBadge)}>{act.last ? '기록 끊김' : '기록 없음'}</span>}
              </button>
            );
          })}
        </div>
      )}
      {!tile && sorted.map((m) => {
        const week = data.ex.filter((e) => e.mid === m.id && e.date >= mon && e.date <= today).reduce((a, e) => a + e.min, 0);
        const pct = Math.min(100, Math.round((week / WEEK_GOAL) * 100));
        const mealsToday = MAIN3.filter((x) => data.meals.some((e) => e.mid === m.id && e.date === today && e.meal === x)).length;
        const nutriToday = sumMeals(data.meals.filter((e) => e.mid === m.id && e.date === today));
        const act = activityOf(data, m.id, today);
        const last = act.last;
        const warn = staleText(act);
        return (
          <button key={m.id} type="button" className={cx(ui.card, s.memberCard, act.stale && s.memberStale)} onClick={() => onOpen(m.id)}>
            <div className={s.memberHead}>
              <Avatar id={m.id} name={m.name} tone="orange" />
              <span className={s.memberName} style={{ flex: '1 0 auto' }}>
                {m.name}
              </span>
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
