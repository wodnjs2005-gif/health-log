import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import { isAuthError, type Program } from '../../lib/backend';
import { KINDS } from '../../lib/constants';
import { cx } from '../../lib/cx';
import { ytIdOf, ytThumb } from '../../lib/youtube';
import ui from '../../styles/ui.module.css';

const PMIN_STEP = 5;
const PMIN_MAX = 180;

export type StaffColor = 'orange' | 'navy';

/**
 * 운동 영상 등록·고치기 시트 (관리자만). 대상 이용자는 고르지 않고, 트레이너가 담당 이용자에게 공유한다.
 * program 을 주면 고치기: 공유된 이용자와 따라한 기록은 그대로 둔다.
 * 영상은 유튜브 링크로만 올린다 (파일 저장소는 보안상 닫아 두었다. 예전에 올린 파일은 계속 재생된다).
 */
export function ProgramSheet({ onClose, color = 'orange', program }: { onClose: () => void; color?: StaffColor; program?: Program }) {
  const { be, staffToken, setData, toast, fail } = useApp();
  const editing = !!program;
  // 예전에 파일로 올린 영상은 링크 칸을 비워 두면 그 영상을 그대로 쓴다
  const fileVideo = editing && program.src !== 'yt';
  const [title, setTitle] = useState(program?.title ?? '');
  const [kind, setKind] = useState(program?.kind ?? '');
  const [min, setMin] = useState(program?.min ?? 20);
  const [url, setUrl] = useState(program?.src === 'yt' && program.ytId ? `https://youtu.be/${program.ytId}` : '');
  const [memo, setMemo] = useState(program?.memo ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const edit = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setError('');
  };

  const ytId = ytIdOf(url);

  const save = async () => {
    const t = title.trim();
    if (!t) return setError('제목을 입력해주세요.');
    if (!kind) return setError('운동 종류를 골라주세요.');
    if (!ytId && !(fileVideo && !url.trim())) return setError('유튜브 링크를 확인해주세요.');
    if (saving) return;
    setSaving(true);
    try {
      if (program) {
        const rec = await be.adminUpdateProgram(staffToken, program.id, { title: t, kind, min, memo: memo.trim(), ytId });
        // 공유된 이용자는 화면에 있던 목록을 그대로 쓴다
        setData((d) => ({ ...d, programs: d.programs.map((p) => (p.id === program.id ? { ...rec, mids: p.mids } : p)) }));
        toast('영상을 고쳤어요');
      } else {
        const rec = await be.staffAddProgram(staffToken, { title: t, mids: [], kind, min, memo: memo.trim(), ytId }, null);
        setData((d) => ({ ...d, programs: [rec, ...d.programs] }));
        toast('영상을 등록했어요');
      }
      onClose();
    } catch (e) {
      setSaving(false);
      if (isAuthError(e)) return fail(e);
      setError('저장하지 못했어요. 인터넷을 확인해주세요.');
    }
  };

  const chip = (pill = false) => cx(ui.choice, color === 'navy' ? ui.choiceNavy : ui.choiceOrange, pill && ui.pill);
  const accent = { '--c': `var(--${color})` } as React.CSSProperties;

  return (
    <Sheet title={editing ? '운동 영상 고치기' : '운동 영상 등록'} onClose={onClose}>
      <label className={ui.field}>
        <span className={ui.label}>제목</span>
        <input className={ui.input} value={title} onChange={(e) => edit(setTitle)(e.target.value)} placeholder="예: 의자 스쿼트 따라하기" />
      </label>

      <div className={ui.note}>
        {editing ? '고쳐도 공유된 이용자와 따라한 기록은 그대로예요.' : '올린 영상은 트레이너가 확인하고 담당 이용자에게 공유해요.'}
      </div>

      <div className={ui.field}>
        <div className={ui.label}>운동 종류</div>
        <div className={ui.choices}>
          {(program && !KINDS.includes(program.kind) ? [...KINDS, program.kind] : KINDS).map((k) => (
            <button key={k} type="button" className={chip(true)} aria-pressed={kind === k} onClick={() => edit(setKind)(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className={ui.field}>
        <div className={ui.label}>
          1회 운동 시간
        </div>
        <div className={ui.stepper} style={accent}>
          <button type="button" className={ui.stepBtn} aria-label="5분 줄이기" onClick={() => setMin(Math.max(PMIN_STEP, min - PMIN_STEP))}>
            −
          </button>
          <div className={ui.stepValue} style={{ fontSize: '2.25rem' }} aria-live="polite">
            {min}
            <span className={ui.unit}>분</span>
          </div>
          <button type="button" className={cx(ui.stepBtn, ui.stepBtnFill)} aria-label="5분 늘리기" onClick={() => setMin(Math.min(PMIN_MAX, min + PMIN_STEP))}>
            +
          </button>
        </div>
      </div>

      <div className={ui.field}>
        <div className={ui.label}>유튜브 링크</div>
        <input
          className={ui.input}
          value={url}
          onChange={(e) => edit(setUrl)(e.target.value)}
          placeholder={fileVideo ? '비워 두면 지금 영상을 그대로 써요' : '유튜브 주소를 붙여넣으세요'}
          inputMode="url"
          aria-label="유튜브 주소"
        />
        {ytId && <div role="img" aria-label="영상 미리보기" className={ui.thumb} style={{ backgroundImage: `url(${ytThumb(ytId)})` }} />}
      </div>

      <label className={ui.field}>
        <span className={ui.label}>
          안내 메모 <span className={ui.labelSub}>(선택)</span>
        </span>
        <textarea className={ui.textarea} rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 무릎이 아프면 절반만 앉으세요" />
      </label>

      {error && (
        <div role="alert" className={ui.error}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnSave, color === 'navy' ? ui.navy : ui.orange)} disabled={saving} onClick={save}>
        {saving ? '저장하는 중…' : editing ? '저장하기' : '등록하기'}
      </button>
    </Sheet>
  );
}
