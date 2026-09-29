import { useState } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { ChatScreen } from '../../components/Chat';
import cs from '../../components/Chat.module.css';
import { DateNav } from '../../components/DateNav';
import { useUserChat } from '../../hooks/useChat';
import { cx } from '../../lib/cx';
import { Layout } from '../../components/Layout';
import { MeasureSection } from '../../components/Measures';
import { EditableAvatar, PhotoSheet } from '../../components/PhotoSheet';
import { TabIcon } from '../../components/TabIcon';
import { TestSection } from '../../components/Tests';
import { WeekChart } from '../../components/WeekChart';
import { useConfirm } from '../../hooks/useConfirm';
import ui from '../../styles/ui.module.css';
import { HomeTab } from './HomeTab';
import { ExTab, MealTab } from './LogTabs';
import { RecordSheet, type SheetState } from './RecordSheet';
import { VideoTab } from './VideoTab';
import s from './user.module.css';
import { useBack } from '../../hooks/useBack';

type Tab = 'home' | 'ex' | 'meal' | 'video' | 'stats';
const TABS: [Tab, string][] = [
  ['home', '오늘'],
  ['ex', '운동'],
  ['meal', '식단'],
  ['video', '영상'],
  ['stats', '기록'],
];

export function UserApp() {
  const { data, me, today, goEntry } = useApp();
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [myPhoto, setMyPhoto] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chat = useUserChat(chatOpen);
  const confirm = useConfirm();

  const member = data.members.find((m) => m.id === me)!;

  const goTab = (t: Tab) => {
    confirm.reset();
    setPlaying(null);
    setTab(t);
    scrollTop();
  };
  const moveDate = (d: string) => {
    confirm.reset();
    setDate(d > today ? today : d);
  };
  // 「뒤로」: 영상 보던 중이면 영상 닫기, 다른 탭이면 오늘 탭으로
  useBack(tab !== 'home', () => goTab('home'));
  useBack(playing !== null, () => setPlaying(null));

  const dateRow = <DateNav date={date} today={today} onChange={moveDate} />;

  const tabbar = (
    <nav className={s.tabbar} aria-label="메뉴">
      {TABS.map(([k, label]) => (
        <button key={k} type="button" className={s.tab} aria-label={label} aria-current={tab === k ? 'page' : undefined} onClick={() => goTab(k)}>
          <TabIcon name={k} />
          <span className={s.tabLabel}>{label}</span>
        </button>
      ))}
      {/* 대화는 탭이 아니라 화면 전체 대화방을 연다 */}
      <button type="button" className={s.tab} aria-label={chat.unread > 0 ? `대화, 안 읽은 메시지 ${chat.unread}개` : '대화'} aria-haspopup="dialog" onClick={() => setChatOpen(true)}>
        <span className={s.tabIconWrap}>
          <TabIcon name="chat" />
          {chat.unread > 0 && (
            <span className={cx(cs.badge, s.tabBadge)} aria-hidden="true">
              {chat.unread > 99 ? '99+' : chat.unread}
            </span>
          )}
        </span>
        <span className={s.tabLabel}>대화</span>
      </button>
    </nav>
  );

  return (
    // 영상은 날짜와 상관없어 날짜 줄을 숨긴다
    <Layout
      title={`${member.name} 님`}
      onBack={goEntry}
      avatar={<EditableAvatar id={member.id} name={member.name} size="md" tone="green" onEdit={() => setMyPhoto(true)} />}
      headerExtra={tab === 'video' ? undefined : dateRow}
      bottom={tabbar}
    >
      {tab === 'home' && (
        <HomeTab
          date={date}
          onOpenSheet={setSheet}
          onGoVideo={() => goTab('video')}
        />
      )}
      {tab === 'ex' && <ExTab date={date} confirm={confirm} onAdd={() => setSheet({ kind: 'ex' })} />}
      {tab === 'meal' && <MealTab date={date} confirm={confirm} onAdd={(meal) => setSheet({ kind: 'meal', meal })} />}
      {tab === 'video' && (
        <VideoTab
          playing={playing}
          onPlay={(id) => {
            setPlaying(id);
            scrollTop();
          }}
          onClose={() => {
            setPlaying(null);
            scrollTop();
          }}
        />
      )}
      {tab === 'stats' && (
        <>
          <div className={ui.row}>
            <h2 className={ui.h2}>최근 7일</h2>
          </div>
          <WeekChart
            mid={member.id}
            end={date}
            ex={data.ex}
            meals={data.meals}
            onGo={(d) => {
              moveDate(d);
              goTab('home');
            }}
          />
          <MeasureSection mid={member.id} mode="user" />
          <TestSection mid={member.id} name={member.name} mode="view" />
        </>
      )}
      {chatOpen && (
        <ChatScreen mid={member.id} name={member.name} mode="user" ring={chat.ring} trainer={chat.loaded ? chat.trainer : undefined} onClose={() => setChatOpen(false)} />
      )}
      {myPhoto && <PhotoSheet target={{ kind: 'user' }} name={member.name} title="내 사진" tone="green" onClose={() => setMyPhoto(false)} />}
      {sheet && <RecordSheet state={sheet} date={date} onClose={() => setSheet(null)} />}
    </Layout>
  );
}
