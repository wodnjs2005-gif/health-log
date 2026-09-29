import { useState } from 'react';
import { useApp } from '../../AppContext';
import { Sheet } from '../../components/Layout';
import { isAuthError, type Program } from '../../lib/backend';
import { cx } from '../../lib/cx';
import ui from '../../styles/ui.module.css';
import { MemberPicker } from './MemberPicker';
import s from './staff.module.css';

interface Props {
  /** 고른 영상들 */
  programs: Program[];
  /** 처음 모드: true = 공유하기, false = 공유 끄기 */
  on: boolean;
  onClose: () => void;
  /** 저장하면 (고른 영상 선택을 풀도록) */
  onDone: () => void;
}

/** 트레이너: 고른 영상 여러 개를 담당 이용자 여러 명에게 한 번에 공유하거나 끈다 */
export function ShareSheet({ programs, on: initialOn, onClose, onDone }: Props) {
  const { be, data, staffToken, staffId, setData, toast, fail } = useApp();
  const [on, setOn] = useState(initialOn);
  const [mids, setMids] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const mine = data.members.filter((m) => data.assign[m.id] === staffId);

  const save = async () => {
    if (!mids.length) return setError(on ? '공유할 이용자를 골라주세요.' : '공유를 끌 이용자를 골라주세요.');
    if (saving) return;
    setSaving(true);
    try {
      const res = await be.trainerSharePrograms(
        staffToken,
        programs.map((p) => p.id),
        mids,
        on,
      );
      setData((d) => ({ ...d, programs: d.programs.map((p) => (res[p.id] ? { ...p, mids: res[p.id] } : p)) }));
      toast(on ? `영상 ${programs.length}개를 ${mids.length}명에게 공유했어요` : `${mids.length}명의 영상 ${programs.length}개 공유를 껐어요`);
      onDone();
      onClose();
    } catch (e) {
      setSaving(false);
      if (isAuthError(e)) return fail(e);
      setError('저장하지 못했어요. 인터넷을 확인해주세요.');
    }
  };

  return (
    <Sheet title={`영상 ${programs.length}개 ${on ? '공유하기' : '공유 끄기'}`} onClose={onClose}>
      <div className={s.shareTitles}>
        {programs.map((p) => (
          <span key={p.id} className={s.shareTitle}>
            {p.title}
          </span>
        ))}
      </div>
      <div role="tablist" aria-label="공유하기 또는 끄기" className={cx(s.switch, s.shareMode)}>
        <button type="button" role="tab" aria-selected={on} className={s.switchBtn} onClick={() => setOn(true)}>
          공유하기
        </button>
        <button type="button" role="tab" aria-selected={!on} className={s.switchBtn} onClick={() => setOn(false)}>
          공유 끄기
        </button>
      </div>
      <div className={ui.note}>
        {on ? '고른 담당 이용자의 「영상」 탭에 이 영상들이 보여요.' : '고른 담당 이용자의 「영상」 탭에서 이 영상들이 빠져요. 따라한 기록은 남아요.'}
      </div>
      {mine.length === 0 ? (
        <div className={ui.empty}>담당 이용자가 없어요. 관리자에게 담당을 정해 달라고 해 주세요.</div>
      ) : (
        <MemberPicker
          members={mine}
          selected={mids}
          onChange={(v) => {
            setMids(v);
            setError('');
          }}
        />
      )}
      {error && (
        <div role="alert" className={ui.error}>
          {error}
        </div>
      )}
      <button type="button" className={cx(ui.btn, ui.btnSave, ui.orange)} disabled={saving || mine.length === 0} onClick={() => void save()}>
        {saving ? '저장하는 중…' : on ? `${mids.length || ''}${mids.length ? '명에게 ' : ''}공유하기` : `${mids.length || ''}${mids.length ? '명 ' : ''}공유 끄기`}
      </button>
    </Sheet>
  );
}
