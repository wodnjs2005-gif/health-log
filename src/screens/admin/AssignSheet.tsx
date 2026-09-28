import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Avatar } from '../../components/Avatar';
import { Sheet } from '../../components/Layout';
import type { Member } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { trainerTitle } from '../../lib/rank';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';

/** 담당 트레이너 정하기: 누르면 바로 저장. 대화는 담당 트레이너와만 할 수 있다 */
export function AssignSheet({ member, onClose }: { member: Member; onClose: () => void }) {
  const { be, data, setData, staffToken, trainers, toast, fail } = useApp();
  const [busy, setBusy] = useState(false);
  const cur = data.assign[member.id] ?? null;

  const pick = async (tid: string | null) => {
    if (busy) return;
    if (tid === cur) return onClose();
    setBusy(true);
    try {
      await be.adminSetMemberTrainer(staffToken, member.id, tid);
    } catch (e) {
      setBusy(false);
      return fail(e);
    }
    setData((d) => {
      const assign = { ...d.assign };
      if (tid) assign[member.id] = tid;
      else delete assign[member.id];
      return { ...d, assign };
    });
    const t = trainers.find((x) => x.id === tid);
    toast(t ? `${member.name} 님 담당: ${trainerTitle(t.name, t.rank)}` : `${member.name} 님 담당을 비웠어요`);
    onClose();
  };

  return (
    <Sheet title={`${member.name} 님 담당 트레이너`} onClose={onClose}>
      <div className={ui.note}>담당 트레이너만 이 분과 대화하고 새 메시지 알림을 받아요. 담당을 바꾸면 새 담당이 지난 대화도 이어서 봐요.</div>
      {trainers.length === 0 && <div className={ui.empty}>먼저 트레이너 관리에서 트레이너를 등록해 주세요.</div>}
      <div className={s.assignList} role="group" aria-label="담당 트레이너 고르기">
        {trainers.map((t) => (
          <button key={t.id} type="button" className={cx(ui.choice, ui.choiceNavy, s.assignBtn)} aria-pressed={cur === t.id} disabled={busy} onClick={() => void pick(t.id)}>
            <Avatar id={t.id} name={t.name} size="sm" tone="navy" />
            <span className={s.assignName}>{trainerTitle(t.name, t.rank)}</span>
            <span className={s.assignCount}>담당 {Object.values(data.assign).filter((x) => x === t.id).length}명</span>
          </button>
        ))}
        {cur && (
          <button type="button" className={cx(ui.btnSmall, s.assignNone)} disabled={busy} onClick={() => void pick(null)}>
            담당 없음으로 하기
          </button>
        )}
      </div>
    </Sheet>
  );
}
