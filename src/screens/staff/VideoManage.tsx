import { useState } from 'react';
import { useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import type { useConfirm } from '../../hooks/useConfirm';
import { cx } from '../../lib/cx';
import { md } from '../../lib/date';
import ui from '../../styles/ui.module.css';
import { ProgramSheet, type StaffColor } from './ProgramSheet';
import { ShareSheet } from './ShareSheet';
import s from './staff.module.css';
import { TargetSheet } from './TargetSheet';

interface Props {
  confirm: ReturnType<typeof useConfirm>;
  /** 트레이너=주황, 관리자=남색 */
  color?: StaffColor;
}

/**
 * 운동 영상. 관리자: 올리기·지우기만 (공유 현황은 보기만).
 * 트레이너: 올라온 영상을 체크박스로 여러 개 골라 담당 이용자에게 한 번에 공유하거나 끈다.
 * 영상마다 내 담당 이용자 중 누구에게 공유했는지와 따라한 횟수가 보인다.
 */
export function VideoManage({ confirm, color = 'orange' }: Props) {
  const { be, data, staffToken, staffRole, staffId, setData, toast, fail } = useApp();
  const isAdmin = staffRole === 'admin';
  const [adding, setAdding] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const fixingProgram = fixing ? data.programs.find((p) => p.id === fixing) : undefined;
  const [editing, setEditing] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [sharing, setSharing] = useState<boolean | null>(null);
  const editingProgram = editing ? data.programs.find((p) => p.id === editing) : undefined;
  const nameOf = (mid: string) => data.members.find((m) => m.id === mid)?.name || '삭제된 이용자';
  const count = (pid: string, mid: string) => data.views.filter((v) => v.pid === pid && v.mid === mid).length;
  const myMembers = data.members.filter((m) => data.assign[m.id] === staffId);
  // 지워진 영상은 고른 목록에서 뺀다
  const pickedPrograms = data.programs.filter((p) => picked.includes(p.id));
  const allPicked = data.programs.length > 0 && pickedPrograms.length === data.programs.length;
  const togglePick = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  const del = (id: string) =>
    confirm.tap(id, async () => {
      try {
        await be.staffDelProgram(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({ ...d, programs: d.programs.filter((x) => x.id !== id), views: d.views.filter((v) => v.pid !== id) }));
      toast('영상을 삭제했어요');
    });

  return (
    <>
      <div className={ui.row} style={{ padding: '0.25rem', alignItems: 'center' }}>
        <h2 className={ui.h2}>운동 영상</h2>
        {!isAdmin && data.programs.length > 1 && myMembers.length > 0 && (
          <button type="button" className={ui.btnSmall} onClick={() => setPicked(allPicked ? [] : data.programs.map((p) => p.id))}>
            {allPicked ? '선택 해제' : '모두 선택'}
          </button>
        )}
      </div>
      {isAdmin ? (
        <>
          <button type="button" className={cx(ui.btn, color === 'navy' ? ui.navy : ui.orange)} onClick={() => setAdding(true)}>
            + 운동 영상 등록
          </button>
          <div className={ui.muted}>올린 영상은 트레이너가 담당 이용자에게 공유해요.</div>
        </>
      ) : (
        <div className={ui.note}>
          {myMembers.length === 0
            ? '담당 이용자가 없어 공유할 수 없어요. 관리자에게 담당을 정해 달라고 해 주세요.'
            : '공유할 영상을 체크하고 아래 「공유하기」를 누르세요. 여러 개를 한 번에 고를 수 있어요.'}
        </div>
      )}
      {data.programs.length === 0 && <div className={ui.empty}>{isAdmin ? '아직 등록한 영상이 없어요.' : '아직 올라온 영상이 없어요.'}</div>}
      {data.programs.map((p) => {
        // 트레이너는 자기 담당 이용자만 보인다
        const shown = isAdmin ? p.mids : p.mids.filter((mid) => data.assign[mid] === staffId);
        const on = picked.includes(p.id);
        const canPick = !isAdmin && myMembers.length > 0;
        return (
          <div key={p.id} className={cx(ui.card, s.progCard, on && s.progPicked)}>
            <div className={s.progHead}>
              {canPick && (
                <button type="button" role="checkbox" aria-checked={on} aria-label={`${p.title} 고르기`} className={s.progBox} onClick={() => togglePick(p.id)}>
                  <span className={s.box} aria-hidden="true">
                    {on ? '✓' : ''}
                  </span>
                </button>
              )}
              <div className={s.progHeadText} onClick={canPick ? () => togglePick(p.id) : undefined}>
                <div className={ui.small}>{md(p.date)} 등록</div>
                <div className={s.progTitle}>{p.title}</div>
                <div className={s.progMeta}>
                  {p.kind} · {p.min}분 · {p.videoName}
                </div>
              </div>
            </div>
            <div className={cx(ui.sectionHead, ui.divided)} style={{ gap: '0.375rem' }}>
              <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-3)' }}>
                {isAdmin ? `공유된 이용자 ${p.mids.length}명` : shown.length ? `담당 이용자 중 ${shown.length}명에게 공유` : '아직 담당 이용자에게 공유하지 않았어요'}
                {shown.length > 0 && ' · 따라한 횟수'}
              </div>
              {shown.map((mid) => (
                <div key={mid} className={s.countRow}>
                  <span style={{ fontWeight: 700 }}>{nameOf(mid)}</span>
                  <span className={s.countVal}>{count(p.id, mid)}회</span>
                </div>
              ))}
            </div>
            <div className={s.actions}>
              {canPick && (
                <button
                  type="button"
                  className={cx(ui.btnSmall, s.shareBtn)}
                  onClick={() => {
                    confirm.reset();
                    setEditing(p.id);
                  }}
                >
                  이 영상 공유 대상 바꾸기
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  className={cx(ui.btnSmall, ui.btnNavyOutline)}
                  onClick={() => {
                    confirm.reset();
                    setFixing(p.id);
                  }}
                >
                  영상 고치기
                </button>
              )}
              {isAdmin && <ConfirmButton armed={confirm.pending === p.id} onClick={() => del(p.id)} label="영상 삭제" />}
            </div>
          </div>
        );
      })}
      {pickedPrograms.length > 0 && (
        <div className={s.shareBar} role="region" aria-label="고른 영상 공유">
          <span className={s.shareCount}>영상 {pickedPrograms.length}개 고름</span>
          <button type="button" className={cx(ui.btnSmall, s.shareOff)} onClick={() => setSharing(false)}>
            공유 끄기
          </button>
          <button type="button" className={cx(ui.btnSmall, s.shareOn)} onClick={() => setSharing(true)}>
            공유하기
          </button>
        </div>
      )}
      {adding && <ProgramSheet color={color} onClose={() => setAdding(false)} />}
      {fixingProgram && <ProgramSheet key={fixingProgram.id} program={fixingProgram} color={color} onClose={() => setFixing(null)} />}
      {editingProgram && <TargetSheet program={editingProgram} color={color} members={myMembers} onClose={() => setEditing(null)} />}
      {sharing !== null && pickedPrograms.length > 0 && (
        <ShareSheet programs={pickedPrograms} on={sharing} onClose={() => setSharing(null)} onDone={() => setPicked([])} />
      )}
    </>
  );
}
