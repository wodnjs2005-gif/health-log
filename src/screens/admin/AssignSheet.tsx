import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Avatar } from '../../components/Avatar';
import { Sheet } from '../../components/Layout';
import type { Member } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { trainerTitle } from '../../lib/rank';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';

/** 담당 트레이너 정하기: 여러 명을 골라 저장한다. 담당 트레이너들만 이 분과 대화할 수 있다 */
export function AssignSheet({ member, onClose }: { member: Member; onClose: () => void }) {
  const { be, data, setData, staffToken, trainers, toast, fail } = useApp();
  const [picked, setPicked] = useState<string[]>(() => (data.assigns[member.id] ?? []).filter((id) => trainers.some((t) => t.id === id)));
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    let saved: string[];
    try {
      saved = await be.adminSetMemberTrainers(staffToken, member.id, picked);
    } catch (e) {
      setBusy(false);
      return fail(e);
    }
    setData((d) => {
      const assigns = { ...d.assigns };
      if (saved.length) assigns[member.id] = saved;
      else delete assigns[member.id];
      return { ...d, assigns };
    });
    const first = trainers.find((x) => x.id === saved[0]);
    const who = first ? trainerTitle(first.name, first.rank) : '';
    toast(!first ? `${member.name} 님 담당을 비웠어요` : `${member.name} 님 담당: ${who}${saved.length > 1 ? ` 외 ${saved.length - 1}명` : ''}`);
    onClose();
  };

  return (
    <Sheet title={`${member.name} 님 담당 트레이너`} onClose={onClose}>
      <div className={ui.note}>
        여러 명을 고를 수 있어요. 고른 트레이너 모두 이 분과 같은 대화방에서 대화하고, 출석 체크와 영상 공유를 하고, 새 메시지 알림을 받아요. 새로 넣은 트레이너도 지난 대화를 볼 수 있어요.
      </div>
      {trainers.length === 0 && <div className={ui.empty}>먼저 트레이너 관리에서 트레이너를 등록해 주세요.</div>}
      <div className={s.assignList} role="group" aria-label="담당 트레이너 고르기">
        {trainers.map((t) => {
          const on = picked.includes(t.id);
          return (
            <button key={t.id} type="button" className={cx(ui.choice, ui.choiceNavy, s.assignBtn)} aria-pressed={on} disabled={busy} onClick={() => toggle(t.id)}>
              <span className={s.assignCheck} aria-hidden="true">
                {on ? '✓' : ''}
              </span>
              <Avatar id={t.id} name={t.name} size="sm" tone="navy" />
              <span className={s.assignName}>{trainerTitle(t.name, t.rank)}</span>
              <span className={s.assignCount}>담당 {Object.values(data.assigns).filter((x) => x.includes(t.id)).length}명</span>
            </button>
          );
        })}
      </div>
      {trainers.length > 0 && (
        <button type="button" className={cx(ui.btn, ui.btnSave, ui.navy)} disabled={busy} onClick={() => void save()}>
          {busy ? '저장하는 중…' : picked.length ? `${picked.length}명으로 저장하기` : '담당 없음으로 저장하기'}
        </button>
      )}
    </Sheet>
  );
}
