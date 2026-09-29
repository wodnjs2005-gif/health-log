import { useState } from 'react';
import { useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Sheet } from '../../components/Layout';
import type { useConfirm } from '../../hooks/useConfirm';
import { useViewMode } from '../../hooks/useViewMode';
import type { Program } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { md } from '../../lib/date';
import { ytThumb } from '../../lib/youtube';
import ui from '../../styles/ui.module.css';
import { ProgramSheet, type StaffColor } from './ProgramSheet';
import { ShareSheet } from './ShareSheet';
import s from './staff.module.css';
import { TargetSheet } from './TargetSheet';
import { ViewToggle } from './ViewToggle';

interface Props {
  confirm: ReturnType<typeof useConfirm>;
  /** 트레이너=주황, 관리자=남색 */
  color?: StaffColor;
}

/**
 * 운동 영상. 관리자: 올리기·지우기만 (공유 현황은 보기만).
 * 트레이너: 올라온 영상을 체크박스로 여러 개 골라 담당 이용자에게 한 번에 공유하거나 끈다.
 * 영상마다 내 담당 이용자 중 누구에게 공유했는지와 따라한 횟수가 보인다.
 * 목록(자세히) / 격자(미리보기·제목만, 「자세히」 창) 로 볼 수 있다.
 */
export function VideoManage({ confirm, color = 'orange' }: Props) {
  const { be, data, staffToken, staffRole, staffId, setData, toast, fail } = useApp();
  const isAdmin = staffRole === 'admin';
  const [tile, setTile] = useViewMode('videos');
  const [adding, setAdding] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const fixingProgram = fixing ? data.programs.find((p) => p.id === fixing) : undefined;
  const [editing, setEditing] = useState<string | null>(null);
  /** 격자에서 연 영상 (자세히 창) */
  const [info, setInfo] = useState<string | null>(null);
  const infoProgram = info ? data.programs.find((p) => p.id === info) : undefined;
  const [picked, setPicked] = useState<string[]>([]);
  const [sharing, setSharing] = useState<boolean | null>(null);
  const editingProgram = editing ? data.programs.find((p) => p.id === editing) : undefined;
  const myMembers = data.members.filter((m) => data.assign[m.id] === staffId);
  const canPick = !isAdmin && myMembers.length > 0;
  // 지워진 영상은 고른 목록에서 뺀다
  const pickedPrograms = data.programs.filter((p) => picked.includes(p.id));
  const allPicked = data.programs.length > 0 && pickedPrograms.length === data.programs.length;
  const togglePick = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  // 트레이너는 자기 담당 이용자만 보인다
  const sharedOf = (p: Program) => (isAdmin ? p.mids : p.mids.filter((mid) => data.assign[mid] === staffId));

  const del = (id: string) =>
    confirm.tap(id, async () => {
      try {
        await be.staffDelProgram(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({ ...d, programs: d.programs.filter((x) => x.id !== id), views: d.views.filter((v) => v.pid !== id) }));
      setInfo((x) => (x === id ? null : x));
      toast('영상을 삭제했어요');
    });

  const actions = (p: Program) => (
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
  );

  return (
    <>
      <div className={ui.row} style={{ padding: '0.25rem', alignItems: 'center' }}>
        <h2 className={ui.h2}>운동 영상</h2>
        <div className={s.headSide}>
          {canPick && data.programs.length > 1 && (
            <button type="button" className={ui.btnSmall} onClick={() => setPicked(allPicked ? [] : data.programs.map((p) => p.id))}>
              {allPicked ? '선택 해제' : '모두 선택'}
            </button>
          )}
          {data.programs.length > 0 && <ViewToggle tile={tile} onChange={setTile} color={color} />}
        </div>
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

      {tile && data.programs.length > 0 && (
        <div className={cx(s.tiles, s.tiles2)}>
          {data.programs.map((p) => {
            const on = picked.includes(p.id);
            const shown = sharedOf(p);
            return (
              <div key={p.id} className={cx(ui.card, s.vTile, on && s.progPicked)}>
                {/* 트레이너: 칸을 누르면 고르기, 「자세히」로 공유 현황. 관리자: 칸을 누르면 자세히 */}
                <button
                  type="button"
                  className={s.vTileMain}
                  onClick={canPick ? () => togglePick(p.id) : () => setInfo(p.id)}
                  {...(canPick ? { role: 'checkbox', 'aria-checked': on } : { 'aria-haspopup': 'dialog' as const })}
                >
                  <VideoThumb p={p} />
                  {canPick && (
                    <span className={s.vCheck} aria-hidden="true">
                      <span className={cx(s.box, on && s.boxOn)}>{on ? '✓' : ''}</span>
                    </span>
                  )}
                  <span className={s.vTitle}>{p.title}</span>
                  <span className={s.vMeta}>
                    {p.kind} · {p.min}분
                  </span>
                  <span className={s.vMeta}>{isAdmin ? `공유 ${p.mids.length}명` : shown.length ? `담당 ${shown.length}명 공유` : '공유 안 함'}</span>
                </button>
                {canPick && (
                  <button type="button" className={cx(ui.btnSmall, s.vMore)} onClick={() => setInfo(p.id)} aria-haspopup="dialog">
                    자세히
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!tile &&
        data.programs.map((p) => {
          const on = picked.includes(p.id);
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
                  <ProgramHead p={p} />
                </div>
              </div>
              <ProgramShares p={p} shown={sharedOf(p)} />
              {actions(p)}
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
      {infoProgram && (
        <Sheet title="영상 자세히" onClose={() => setInfo(null)}>
          <VideoThumb p={infoProgram} />
          <ProgramHead p={infoProgram} />
          {infoProgram.memo && <div className={ui.note}>{infoProgram.memo}</div>}
          <ProgramShares p={infoProgram} shown={sharedOf(infoProgram)} />
          {actions(infoProgram)}
        </Sheet>
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

/** 등록일 · 제목 · 종류 · 시간 · 영상 이름 */
function ProgramHead({ p }: { p: Program }) {
  return (
    <div>
      <div className={ui.small}>{md(p.date)} 등록</div>
      <div className={s.progTitle}>{p.title}</div>
      <div className={s.progMeta}>
        {p.kind} · {p.min}분 · {p.videoName}
      </div>
    </div>
  );
}

/** 공유된 이용자와 따라한 횟수 */
function ProgramShares({ p, shown }: { p: Program; shown: string[] }) {
  const { data, staffRole } = useApp();
  const isAdmin = staffRole === 'admin';
  const nameOf = (mid: string) => data.members.find((m) => m.id === mid)?.name || '삭제된 이용자';
  const count = (mid: string) => data.views.filter((v) => v.pid === p.id && v.mid === mid).length;
  return (
    <div className={cx(ui.sectionHead, ui.divided)} style={{ gap: '0.375rem' }}>
      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-3)' }}>
        {isAdmin ? `공유된 이용자 ${p.mids.length}명` : shown.length ? `담당 이용자 중 ${shown.length}명에게 공유` : '아직 담당 이용자에게 공유하지 않았어요'}
        {shown.length > 0 && ' · 따라한 횟수'}
      </div>
      {shown.map((mid) => (
        <div key={mid} className={s.countRow}>
          <span style={{ fontWeight: 700 }}>{nameOf(mid)}</span>
          <span className={s.countVal}>{count(mid)}회</span>
        </div>
      ))}
    </div>
  );
}

/** 유튜브 영상은 미리보기 그림, 올린 영상 파일은 ▶ 모양 */
function VideoThumb({ p }: { p: Program }) {
  return (
    <span className={s.vThumb} aria-hidden="true" style={p.ytId ? { backgroundImage: `url(${ytThumb(p.ytId)})` } : undefined}>
      {!p.ytId && (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      )}
    </span>
  );
}
