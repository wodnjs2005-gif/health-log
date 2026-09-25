import { useState } from 'react';
import { useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import type { useConfirm } from '../../hooks/useConfirm';
import { cx } from '../../lib/cx';
import { md } from '../../lib/date';
import ui from '../../styles/ui.module.css';
import { ProgramSheet, type StaffColor } from './ProgramSheet';
import s from './staff.module.css';
import { TargetSheet } from './TargetSheet';

interface Props {
  confirm: ReturnType<typeof useConfirm>;
  /** 트레이너=주황, 관리자=남색 */
  color?: StaffColor;
}

/** 운동 영상 목록·등록·삭제 (트레이너·관리자 공용) */
export function VideoManage({ confirm, color = 'orange' }: Props) {
  const { be, data, staffToken, setData, toast, fail } = useApp();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const editingProgram = editing ? data.programs.find((p) => p.id === editing) : undefined;
  const nameOf = (mid: string) => data.members.find((m) => m.id === mid)?.name || '삭제된 이용자';
  const count = (pid: string, mid: string) => data.views.filter((v) => v.pid === pid && v.mid === mid).length;

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
      <h2 className={ui.h2} style={{ padding: '0.25rem' }}>
        운동 영상
      </h2>
      <button type="button" className={cx(ui.btn, color === 'navy' ? ui.navy : ui.orange)} onClick={() => setAdding(true)}>
        + 운동 영상 등록
      </button>
      {data.programs.length === 0 && <div className={ui.empty}>아직 등록한 영상이 없어요.</div>}
      {data.programs.map((p) => (
        <div key={p.id} className={cx(ui.card, s.progCard)}>
          <div className={ui.small}>{md(p.date)} 등록</div>
          <div className={s.progTitle}>{p.title}</div>
          <div className={s.progMeta}>
            {p.kind} · {p.min}분 · {p.videoName}
          </div>
          <div className={cx(ui.sectionHead, ui.divided)} style={{ gap: '0.375rem' }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-3)' }}>
              대상 {p.mids.length}명 · 따라한 횟수
            </div>
            {p.mids.map((mid) => (
              <div key={mid} className={s.countRow}>
                <span style={{ fontWeight: 700 }}>{nameOf(mid)}</span>
                <span className={s.countVal}>{count(p.id, mid)}회</span>
              </div>
            ))}
          </div>
          <div className={s.actions}>
            <button
              type="button"
              className={cx(ui.btnSmall, ui.btnNavyOutline)}
              onClick={() => {
                confirm.reset();
                setEditing(p.id);
              }}
            >
              대상 이용자 수정
            </button>
            <ConfirmButton armed={confirm.pending === p.id} onClick={() => del(p.id)} label="영상 삭제" />
          </div>
        </div>
      ))}
      {adding && <ProgramSheet color={color} onClose={() => setAdding(false)} />}
      {editingProgram && <TargetSheet program={editingProgram} color={color} onClose={() => setEditing(null)} />}
    </>
  );
}
