import { useRef, useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import { isAuthError } from '../../lib/backend';
import { KINDS } from '../../lib/constants';
import { cx } from '../../lib/cx';
import { ytIdOf, ytThumb } from '../../lib/youtube';
import ui from '../../styles/ui.module.css';
import { MemberPicker } from './MemberPicker';
import s from './staff.module.css';

const PMIN_STEP = 5;
const PMIN_MAX = 180;

export type StaffColor = 'orange' | 'navy';

/** 운동 영상 등록 시트 (트레이너=주황, 관리자=남색). 고른 이용자들만 이 영상을 볼 수 있다. */
export function ProgramSheet({ onClose, color = 'orange' }: { onClose: () => void; color?: StaffColor }) {
  const { be, data, staffToken, setData, toast, fail } = useApp();
  const [title, setTitle] = useState('');
  const [mids, setMids] = useState<string[]>([]);
  const [kind, setKind] = useState('');
  const [min, setMin] = useState(20);
  const [src, setSrc] = useState<'file' | 'yt'>('file');
  const [url, setUrl] = useState('');
  const [memo, setMemo] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<File | null>(null);

  const edit = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setError('');
  };

  const ytId = ytIdOf(url);

  const save = async () => {
    const t = title.trim();
    if (!t) return setError('제목을 입력해주세요.');
    if (!mids.length) return setError('대상 이용자를 골라주세요.');
    if (!kind) return setError('운동 종류를 골라주세요.');
    if (src === 'yt' && !ytId) return setError('유튜브 링크를 확인해주세요.');
    if (src === 'file' && !fileRef.current) return setError('영상 파일을 골라주세요.');
    if (saving) return;
    setSaving(true);
    try {
      const rec = await be.staffAddProgram(
        staffToken,
        { title: t, mids, kind, min, memo: memo.trim(), ytId: src === 'yt' ? ytId : null },
        src === 'yt' ? null : fileRef.current,
      );
      setData((d) => ({ ...d, programs: [rec, ...d.programs] }));
      toast('영상을 등록했어요');
      onClose();
    } catch (e) {
      setSaving(false);
      if (isAuthError(e)) return fail(e);
      setError(
        src === 'yt'
          ? '저장하지 못했어요. 인터넷을 확인해주세요.'
          : '영상을 올리지 못했어요. 인터넷을 확인하거나 더 짧은 영상을 올려주세요.',
      );
    }
  };

  const chip = (pill = false) => cx(ui.choice, color === 'navy' ? ui.choiceNavy : ui.choiceOrange, pill && ui.pill);
  const accent = { '--c': `var(--${color})` } as React.CSSProperties;

  return (
    <Sheet title="운동 영상 등록" onClose={onClose}>
      <label className={ui.field}>
        <span className={ui.label}>제목</span>
        <input className={ui.input} value={title} onChange={(e) => edit(setTitle)(e.target.value)} placeholder="예: 의자 스쿼트 따라하기" />
      </label>

      <div className={ui.field}>
        <div className={ui.label}>
          대상 이용자
        </div>
        {data.members.length === 0 ? (
          <div className={ui.muted}>먼저 관리자 화면에서 이용자를 등록해주세요.</div>
        ) : (
          <MemberPicker members={data.members} selected={mids} onChange={edit(setMids)} color={color} />
        )}
      </div>

      <div className={ui.field}>
        <div className={ui.label}>운동 종류</div>
        <div className={ui.choices}>
          {KINDS.map((k) => (
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
        <div className={ui.label}>영상 등록 방법</div>
        <div className={ui.grid2}>
          {(
            [
              ['file', '영상 파일'],
              ['yt', '유튜브 링크'],
            ] as ['file' | 'yt', string][]
          ).map(([v, l]) => (
            <button key={v} type="button" className={chip()} aria-pressed={src === v} onClick={() => edit(setSrc)(v)}>
              {l}
            </button>
          ))}
        </div>
        {src === 'file' ? (
          <label className={s.filePick} data-picked={!!fileName}>
            <input
              type="file"
              accept="video/*"
              className={s.srOnly}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                fileRef.current = f;
                setFileName(f ? f.name : '');
                setError('');
              }}
            />
            <span>{fileName ? `✓ ${fileName}` : '영상 파일 고르기'}</span>
          </label>
        ) : (
          <>
            <input
              className={ui.input}
              value={url}
              onChange={(e) => edit(setUrl)(e.target.value)}
              placeholder="유튜브 주소를 붙여넣으세요"
              inputMode="url"
              aria-label="유튜브 주소"
            />
            {ytId && <div role="img" aria-label="영상 미리보기" className={ui.thumb} style={{ backgroundImage: `url(${ytThumb(ytId)})` }} />}
          </>
        )}
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
        {saving ? '저장하는 중…' : '등록하기'}
      </button>
    </Sheet>
  );
}
