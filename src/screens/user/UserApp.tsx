import { useState } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { DateNav } from '../../components/DateNav';
import { Layout } from '../../components/Layout';
import { WeekChart } from '../../components/WeekChart';
import { useConfirm } from '../../hooks/useConfirm';
import ui from '../../styles/ui.module.css';
import { HomeTab } from './HomeTab';
import { ExTab, MealTab } from './LogTabs';
import { RecordSheet, type SheetState } from './RecordSheet';
import { VideoTab } from './VideoTab';
import s from './user.module.css';

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

  const dateRow = <DateNav date={date} today={today} onChange={moveDate} />;

  const tabbar = (
    <nav className={s.tabbar} aria-label="메뉴">
      {TABS.map(([k, label]) => (
        <button key={k} type="button" className={s.tab} aria-current={tab === k ? 'page' : undefined} onClick={() => goTab(k)}>
          {label}
        </button>
      ))}
    </nav>
  );

  return (
    <Layout title={`${member.name} 님`} onBack={goEntry} headerExtra={dateRow} bottom={tabbar}>
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
        </>
      )}
      {sheet && <RecordSheet state={sheet} date={date} onClose={() => setSheet(null)} />}
    </Layout>
  );
}
