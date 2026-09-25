import { useState } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Sheet } from '../../components/Layout';
import type { useConfirm } from '../../hooks/useConfirm';
import { cx } from '../../lib/cx';
import type { Trainer } from '../../lib/backend';
import { md } from '../../lib/date';
import { normRank, RANK_MAX_LEN, trainerTitle } from '../../lib/rank';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';
import { IssuedCard } from './IssuedCard';

interface Issued {
  id: string;
  name: string;
  rank?: string;
  code: string;
  renewed?: boolean;
}

/** 관리자 · 트레이너 관리: 등록하면 8자리 트레이너 번호가 발급된다 */
export function TrainerManage({ confirm }: { confirm: ReturnType<typeof useConfirm> }) {
  const { be, staffToken, trainers, setTrainers, toast, fail } = useApp();
  const [name, setName] = useState('');
  const [rank, setRank] = useState('');
  const [editingRank, setEditingRank] = useState<Trainer | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);

  const add = async () => {
    const n = name.trim();
    if (!n) return setError('이름을 입력해주세요.');
    if (saving) return;
    setSaving(true);
    try {
      const t = await be.adminAddTrainer(staffToken, n, normRank(rank));
      setTrainers((list) => [...list, t]);
      setName('');
      setRank('');
      setError('');
      setIssued({ id: t.id, name: t.name, rank: t.rank, code: t.code });
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
      setIssued(t ? { id, name: t.name, rank: t.rank, code, renewed: true } : null);
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
        <RankInput value={rank} onChange={setRank} onEnter={() => void add()} />
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
          heading={`${trainerTitle(issued.name, issued.rank)} · ${issued.renewed ? '새 번호를 발급했어요' : '등록했어요'}`}
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
            <span className={s.nameRank}>
              <span className={s.name}>{t.name}</span>
              {t.rank && <span className={cx(ui.badge, ui.badgeNavy)}>{t.rank}</span>}
            </span>
            <span className={ui.muted} style={{ whiteSpace: 'nowrap' }}>
              {md(t.createdAt)} 등록
            </span>
          </div>
          <div className={s.codeRow}>
            <span className={cx(ui.small, s.codeLabel)}>트레이너 번호</span>
            <span className={cx(s.code, s.codeTrainer)}>{t.code}</span>
          </div>
          <div className={s.actions}>
            <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => setEditingRank(t)}>
              {t.rank ? '직급 수정' : '직급 입력'}
            </button>
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
      {editingRank && <RankSheet trainer={editingRank} onClose={() => setEditingRank(null)} />}
    </>
  );
}

const RANK_PRESETS = ['팀장', '선임 트레이너', '트레이너'];

/** 직급 입력칸 + 자주 쓰는 직급 고르기 (이미 쓰고 있는 직급도 함께 보여준다) */
function RankInput({ value, onChange, onEnter, autoFocus }: { value: string; onChange: (v: string) => void; onEnter: () => void; autoFocus?: boolean }) {
  const { trainers } = useApp();
  const picks = [...new Set([...RANK_PRESETS, ...trainers.map((t) => normRank(t.rank)).filter(Boolean)])];
  const cur = normRank(value);
  return (
    <div className={ui.field}>
      <label className={ui.field}>
        <span className={ui.label}>
          직급 <span className={ui.labelSub}>(선택)</span>
        </span>
        <input
          className={ui.input}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, RANK_MAX_LEN))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter();
          }}
          placeholder="예: 팀장"
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </label>
      <div className={ui.choices}>
        {picks.map((p) => (
          <button
            key={p}
            type="button"
            className={cx(ui.choice, ui.choiceNavy, ui.pill)}
            aria-pressed={cur === p}
            onClick={() => onChange(cur === p ? '' : p)}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 등록된 트레이너의 직급 바꾸기. 비워서 저장하면 직급이 지워진다 */
function RankSheet({ trainer, onClose }: { trainer: Trainer; onClose: () => void }) {
  const { be, staffToken, setTrainers, toast, fail } = useApp();
  const [value, setValue] = useState(trainer.rank ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const rank = await be.adminSetTrainerRank(staffToken, trainer.id, normRank(value));
      setTrainers((list) => list.map((x) => (x.id === trainer.id ? { ...x, rank } : x)));
      toast(rank ? '직급을 저장했어요' : '직급을 지웠어요');
      onClose();
    } catch (e) {
      setSaving(false);
      fail(e);
    }
  };

  return (
    <Sheet title={`${trainer.name} 직급`} onClose={onClose}>
      <RankInput value={value} onChange={setValue} onEnter={() => void save()} autoFocus />
      <button type="button" className={cx(ui.btn, ui.btnSave, ui.navy)} disabled={saving} onClick={() => void save()}>
        {saving ? '저장하는 중…' : '저장하기'}
      </button>
    </Sheet>
  );
}
