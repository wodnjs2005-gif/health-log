import { useState } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { Layout } from '../../components/Layout';
import { useConfirm } from '../../hooks/useConfirm';
import type { Member } from '../../lib/backend';
import { MAIN3, WEEK_GOAL } from '../../lib/constants';
import { cx } from '../../lib/cx';
import { md, mondayOf } from '../../lib/date';
import { fmt, sumMeals } from '../../lib/nutrition';
import { trainerTitle } from '../../lib/rank';
import type { MemberFilterValue } from '../../lib/tags';
import ui from '../../styles/ui.module.css';
import { MemberDetail } from '../staff/MemberDetail';
import { MemberFilter, TagList, useMemberFilter } from '../staff/MemberFilter';
import { ExportSheet } from '../staff/ExportSheet';
import { LessonManage } from '../staff/LessonManage';
import { TagSheet } from '../staff/TagSheet';
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
  const [tagging, setTagging] = useState<Member | null>(null);
  /** 기록 내려받기 창: 'all' = 전체로 열기, 이용자 id = 그 사람을 골라 열기 */
  const [exporting, setExporting] = useState<string | null>(null);
  const exportSheet = exporting && (
    <ExportSheet initialMid={exporting === 'all' ? undefined : exporting} onClose={() => setExporting(null)} />
  );
  const confirm = useConfirm();

  const detail = tView ? data.members.find((m) => m.id === tView) : null;

  if (detail) {
    return (
      <Layout
        title={title}
        backLabel="목록"
        onBack={() => {
          setTView(null);
          scrollTop();
          void refresh();
        }}
      >
        <MemberDetail
          member={detail}
          summary={<TagRow member={detail} onEdit={() => setTagging(detail)} onExport={() => setExporting(detail.id)} />}
        />
        {tagging && <TagSheet member={tagging} onClose={() => setTagging(null)} />}
        {exportSheet}
      </Layout>
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
          onExport={() => setExporting('all')}
          onOpen={(id) => {
            confirm.reset();
            setTView(id);
            scrollTop();
          }}
        />
      ) : (
        <VideoManage confirm={confirm} />
      )}

      <button type="button" className={ui.btnGhost} onClick={logout}>
        로그아웃
      </button>
      {exportSheet}
    </Layout>
  );
}

/** 상세 화면 이름 아래: 해시태그 + 편집 버튼 */
function TagRow({ member, onEdit, onExport }: { member: Member; onEdit: () => void; onExport: () => void }) {
  return (
    <div className={ui.row} style={{ alignItems: 'center' }}>
      <TagList tags={member.tags} />
      <div className={s.actions}>
        <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={onEdit}>
          # 해시태그 편집
        </button>
        <button type="button" className={ui.btnSmall} onClick={onExport}>
          기록 내려받기
        </button>
      </div>
    </div>
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
      {shown.map((m) => {
        const week = data.ex.filter((e) => e.mid === m.id && e.date >= mon && e.date <= today).reduce((a, e) => a + e.min, 0);
        const pct = Math.min(100, Math.round((week / WEEK_GOAL) * 100));
        const mealsToday = MAIN3.filter((x) => data.meals.some((e) => e.mid === m.id && e.date === today && e.meal === x)).length;
        const nutriToday = sumMeals(data.meals.filter((e) => e.mid === m.id && e.date === today));
        const dates = [...data.ex, ...data.meals].filter((e) => e.mid === m.id).map((e) => e.date).sort();
        const last = dates[dates.length - 1];
        return (
          <button key={m.id} type="button" className={cx(ui.card, s.memberCard)} onClick={() => onOpen(m.id)}>
            <div className={ui.row} style={{ flexWrap: 'nowrap', width: '100%', gap: '0.75rem' }}>
              <span className={s.memberName}>{m.name}</span>
              <span className={s.memberMin}>{week}분</span>
            </div>
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
