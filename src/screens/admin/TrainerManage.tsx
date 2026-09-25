import { useState } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import type { useConfirm } from '../../hooks/useConfirm';
import { cx } from '../../lib/cx';
import { md } from '../../lib/date';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';
import { IssuedCard } from './IssuedCard';

interface Issued {
  id: string;
  name: string;
  code: string;
  renewed?: boolean;
}

/** 관리자 · 트레이너 관리: 등록하면 8자리 트레이너 번호가 발급된다 */
export function TrainerManage({ confirm }: { confirm: ReturnType<typeof useConfirm> }) {
  const { be, staffToken, trainers, setTrainers, toast, fail } = useApp();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);

  const add = async () => {
    const n = name.trim();
    if (!n) return setError('이름을 입력해주세요.');
    if (saving) return;
    setSaving(true);
    try {
      const t = await be.adminAddTrainer(staffToken, n);
      setTrainers((list) => [...list, t]);
      setName('');
      setError('');
      setIssued({ id: t.id, name: t.name, code: t.code });
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const newCode = (id: string) =>
    confirm.tap('tc' + id, async () => {
      let code: string;
      try {
        code = await be.adminNewTrainerCode(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      const t = trainers.find((x) => x.id === id);
      setTrainers((list) => list.map((x) => (x.id === id ? { ...x, code } : x)));
      setIssued(t ? { id, name: t.name, code, renewed: true } : null);
      scrollTop();
    });

  const del = (id: string) =>
    confirm.tap('td' + id, async () => {
      try {
        await be.adminDelTrainer(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      setTrainers((list) => list.filter((x) => x.id !== id));
      setIssued((j) => (j && j.id === id ? null : j));
      toast('트레이너를 삭제했어요');
    });

  return (
    <>
      <section className={cx(ui.card, s.regCard)}>
        <h2 className={ui.h3} style={{ fontSize: '1.1875rem', fontWeight: 800 }}>
          트레이너 등록
        </h2>
        <label className={ui.field}>
          <span className={ui.label}>이름</span>
          <input
            className={ui.input}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
            placeholder="예: 김코치"
            autoComplete="off"
          />
        </label>
        {error && (
          <div role="alert" className={ui.error}>
            {error}
          </div>
        )}
        <button type="button" className={cx(ui.btn, ui.navy)} disabled={saving} onClick={() => void add()}>
          {saving ? '등록하는 중…' : '등록하기'}
        </button>
      </section>

      {issued && (
        <IssuedCard
          heading={`${issued.name} 트레이너 · ${issued.renewed ? '새 번호를 발급했어요' : '등록했어요'}`}
          label="트레이너 번호"
          code={issued.code}
          tell="이 번호를 트레이너에게 알려주세요."
          onClose={() => setIssued(null)}
        />
      )}

      <div className={ui.row} style={{ padding: '0.25rem' }}>
        <h2 className={ui.h2}>트레이너 목록</h2>
        <div className={ui.muted}>{trainers.length}명</div>
      </div>
      {trainers.length === 0 && <div className={ui.empty}>등록된 트레이너가 없어요.</div>}
      {trainers.map((t) => (
        <div key={t.id} className={cx(ui.card, s.memberCard)}>
          <div className={ui.row} style={{ gap: '0.25rem 0.75rem' }}>
            <span className={s.name}>{t.name}</span>
            <span className={ui.muted} style={{ whiteSpace: 'nowrap' }}>
              {md(t.createdAt)} 등록
            </span>
          </div>
          <div className={s.codeRow}>
            <span className={cx(ui.small, s.codeLabel)}>트레이너 번호</span>
            <span className={cx(s.code, s.codeTrainer)}>{t.code}</span>
          </div>
          <div className={s.actions}>
            <ConfirmButton
              armed={confirm.pending === 'tc' + t.id}
              onClick={() => newCode(t.id)}
              label="새 번호 발급"
              confirmLabel="한 번 더 누르면 새 번호"
            />
            <ConfirmButton armed={confirm.pending === 'td' + t.id} onClick={() => del(t.id)} label="트레이너 삭제" />
          </div>
        </div>
      ))}
    </>
  );
}
