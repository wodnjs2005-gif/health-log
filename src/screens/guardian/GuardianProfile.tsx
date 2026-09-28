import { useState } from 'react';
import { useApp } from '../../AppContext';
import { PhotoEditor } from '../../components/PhotoSheet';
import { Sheet } from '../../components/Layout';
import type { PublicMember } from '../../lib/backend';
import { cx } from '../../lib/cx';
import ui from '../../styles/ui.module.css';
import s from './guardian.module.css';

const RELATION_MAX = 20;
const RELATIONS = ['딸', '아들', '배우자', '며느리', '사위', '손주'];

/** 보호자 이름 대신 쓰는 말: 관계를 적었으면 그 관계, 아니면 '보호자' */
export const guardianLabel = (relation: string | undefined) => relation || '보호자';

/** 보호자 본인 프로필: 사진(돌보는 모든 분에게 같은 사진) + 한 분마다 관계 */
export function GuardianProfileSheet({ people, current, onClose }: { people: PublicMember[]; current: string; onClose: () => void }) {
  const { be, data, setData, guardians, toast, fail } = useApp();
  const relOf = (mid: string) => data.guardians.find((g) => g.mid === mid)?.relation ?? '';
  const [rel, setRel] = useState<Record<string, string>>(() => Object.fromEntries(people.map((m) => [m.id, relOf(m.id)])));
  const [saving, setSaving] = useState(false);
  const changed = people.filter((m) => (rel[m.id] ?? '').trim() !== relOf(m.id));

  const save = async () => {
    if (saving || !changed.length) return;
    setSaving(true);
    try {
      const saved = await Promise.all(
        changed.map(async (m) => {
          const code = guardians.find((g) => g.mid === m.id)!.code;
          return { mid: m.id, relation: await be.guardianSetRelation(code, rel[m.id] ?? '') };
        }),
      );
      setData((d) => ({
        ...d,
        guardians: [...d.guardians.filter((g) => !saved.some((x) => x.mid === g.mid)), ...saved.filter((x) => x.relation)],
      }));
      setRel((r) => ({ ...r, ...Object.fromEntries(saved.map((x) => [x.mid, x.relation])) }));
      toast('관계를 저장했어요');
    } catch (e) {
      fail(e);
    }
    setSaving(false);
  };

  return (
    <Sheet title="내 프로필" onClose={onClose}>
      <PhotoEditor target={{ kind: 'guardian', mid: current }} name={guardianLabel(relOf(current))} tone="plum" />
      {people.length > 1 && <div className={ui.small}>사진은 목록의 모든 분에게 같이 보여요.</div>}

      <div className={cx(ui.divided, s.relations)}>
        {people.map((m) => (
          <div key={m.id} className={ui.field} style={{ gap: '0.5rem' }}>
            <label className={ui.label} htmlFor={'rel' + m.id}>
              {m.name} 님과의 관계
            </label>
            <div className={ui.choices} role="group" aria-label={`${m.name} 님과의 관계 고르기`}>
              {RELATIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={cx(ui.choice, ui.choicePlum, ui.pill, s.relChip)}
                  aria-pressed={(rel[m.id] ?? '').trim() === r}
                  onClick={() => setRel((x) => ({ ...x, [m.id]: x[m.id]?.trim() === r ? '' : r }))}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              id={'rel' + m.id}
              className={ui.input}
              value={rel[m.id] ?? ''}
              maxLength={RELATION_MAX}
              placeholder="직접 적기 (예: 큰딸, 조카)"
              autoComplete="off"
              onChange={(e) => setRel((x) => ({ ...x, [m.id]: e.target.value }))}
            />
          </div>
        ))}
        <div className={ui.small}>트레이너·관리자가 누가 보호자인지 알 수 있게 보여요.</div>
        <button type="button" className={cx(ui.btn, ui.btnSave, ui.plum)} disabled={saving || !changed.length} onClick={() => void save()}>
          {saving ? '저장하는 중…' : '관계 저장하기'}
        </button>
      </div>
    </Sheet>
  );
}
