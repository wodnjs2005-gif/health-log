import { useState } from 'react';
import { useApp } from '../AppContext';
import { useConfirm } from '../hooks/useConfirm';
import { guardianPhotoId, type PhotoKind } from '../lib/backend';
import { cx } from '../lib/cx';
import { toProfilePhoto } from '../lib/photo';
import ui from '../styles/ui.module.css';
import { Avatar, type AvatarSize } from './Avatar';
import av from './Avatar.module.css';
import { ConfirmButton } from './ConfirmButton';
import { Sheet } from './Layout';

type Tone = 'green' | 'orange' | 'navy' | 'plum';

/**
 * 누구의 사진을 바꾸나.
 * member = 직원이 이용자 사진을, trainer·admin = 로그인한 직원 본인 사진을,
 * user = 이용자 본인이, guardian = 보호자 본인이 (돌보는 모든 분에게 같은 사진).
 */
export type PhotoTarget = { kind: PhotoKind; id: string } | { kind: 'user' } | { kind: 'guardian'; mid: string };

const NOTE: Record<PhotoTarget['kind'], string> = {
  member: '본인에게 사진을 써도 되는지 먼저 물어봐 주세요.',
  trainer: '이용자·보호자 화면에도 보여요.',
  admin: '',
  user: '담당 트레이너도 볼 수 있어요.',
  guardian: '트레이너·관리자가 보호자를 알아볼 수 있게 보여요.',
};

/** 사진 고르기·지우기 (창 안의 내용). 저장하면 onSaved */
export function PhotoEditor({ target, name, tone = 'orange', onSaved }: { target: PhotoTarget; name: string; tone?: Tone; onSaved?: () => void }) {
  const { be, staffToken, userCode, me, guardians, photoOf, setPhotoLocal, toast, fail } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = useConfirm();
  const id = target.kind === 'user' ? (me ?? '') : target.kind === 'guardian' ? guardianPhotoId(target.mid) : target.id;
  const has = !!photoOf(id);
  const btn = tone === 'navy' ? ui.navy : tone === 'green' ? ui.green : tone === 'plum' ? ui.plum : ui.orange;

  /** 저장하고 [사진 id, 새 버전] 들을 돌려준다 */
  const put = async (data: string | null): Promise<[string, string | null][]> => {
    if (target.kind === 'user') return [[id, await be.userSetPhoto(userCode, data)]];
    if (target.kind === 'guardian')
      return Promise.all(guardians.map(async (g): Promise<[string, string | null]> => [guardianPhotoId(g.mid), await be.guardianSetPhoto(g.code, data)]));
    return [[id, await be.staffSetPhoto(staffToken, target.kind, target.id, data)]];
  };

  const pick = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    let data: string;
    try {
      data = await toProfilePhoto(file);
    } catch {
      setBusy(false);
      return setError('사진을 열지 못했어요. 다른 사진으로 해주세요.');
    }
    try {
      for (const [k, v] of await put(data)) setPhotoLocal(k, v, data);
      toast('사진을 저장했어요');
      setBusy(false);
      onSaved?.();
    } catch (e) {
      setBusy(false);
      fail(e);
    }
  };

  const remove = () =>
    confirm.tap('del', async () => {
      try {
        for (const [k] of await put(null)) setPhotoLocal(k, null, null);
      } catch (e) {
        return fail(e);
      }
      toast('사진을 지웠어요');
      onSaved?.();
    });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Avatar id={id} name={name} size="xl" tone={tone} />
      </div>
      <div className={ui.note}>사진은 정사각형으로 잘리고 작게 줄여서 저장돼요. {NOTE[target.kind]}</div>
      {error && (
        <div role="alert" className={ui.error}>
          {error}
        </div>
      )}
      <label className={cx(ui.btn, ui.btnSave, btn)} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} aria-disabled={busy}>
        <input
          type="file"
          accept="image/*"
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          disabled={busy}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {busy ? '저장하는 중…' : has ? '사진 바꾸기 (찍기·고르기)' : '사진 찍기·고르기'}
      </label>
      {has && <ConfirmButton armed={confirm.pending === 'del'} onClick={remove} label="사진 지우기" confirmLabel="한 번 더 누르면 지워요" wide />}
    </>
  );
}

/** 프로필 사진 올리기·바꾸기·지우기. 사진은 작게 줄여서 올린다 */
export function PhotoSheet({ target, name, title, tone = 'orange', onClose }: { target: PhotoTarget; name: string; title?: string; tone?: Tone; onClose: () => void }) {
  return (
    <Sheet title={title ?? `${name} 사진`} onClose={onClose}>
      <PhotoEditor target={target} name={name} tone={tone} onSaved={onClose} />
    </Sheet>
  );
}

/** 누르면 사진 창이 열리는 사진 */
export function EditableAvatar({ id, name, size = 'lg', tone = 'orange', onEdit }: { id: string; name: string; size?: AvatarSize; tone?: Tone; onEdit: () => void }) {
  return (
    <button type="button" className={av.editBtn} onClick={onEdit} aria-label={`${name} 사진 바꾸기`}>
      <Avatar id={id} name={name} size={size} tone={tone} />
      <span className={av.editBadge} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      </span>
    </button>
  );
}
