import { useState } from 'react';
import { useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Sheet } from '../../components/Layout';
import { useConfirm } from '../../hooks/useConfirm';
import type { NewTestItem, TestItem } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { BETTER_LABEL } from '../../lib/tests';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';

const EMPTY: NewTestItem = { name: '', unit: '', better: 'high' };
/** 누르면 입력칸에 채워지는 예시 (어르신 체력검사에서 많이 쓰는 항목) */
const EXAMPLES: NewTestItem[] = [
  { name: '악력', unit: 'kg', better: 'high' },
  { name: '30초 의자 일어서기', unit: '회', better: 'high' },
  { name: '앉아 윗몸 앞으로 굽히기', unit: 'cm', better: 'high' },
  { name: '2분 제자리 걷기', unit: '회', better: 'high' },
  { name: '일어나 걷기(TUG)', unit: '초', better: 'low' },
  { name: '8자 보행', unit: '초', better: 'low' },
  { name: '체지방률', unit: '%', better: 'low' },
  { name: '허리둘레', unit: 'cm', better: 'low' },
];

/** 관리자 · 체력 측정 항목 만들기·고치기·지우기. 결과는 트레이너가 이용자 화면에서 적는다 */
export function TestItemManage({ onClose }: { onClose: () => void }) {
  const { be, data, setData, staffToken, toast, fail } = useApp();
  const [draft, setDraft] = useState<NewTestItem | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const items = data.testItems;
  const count = (id: string) => data.tests.filter((t) => t.item === id).length;

  const open = (it?: TestItem) => {
    setEditing(it?.id ?? null);
    setDraft(it ? { name: it.name, unit: it.unit, better: it.better } : EMPTY);
    setError('');
  };

  const save = async () => {
    if (!draft || saving) return;
    const it = { name: draft.name.trim(), unit: draft.unit.trim(), better: draft.better };
    if (!it.name) return setError('항목 이름을 입력해주세요.');
    if (items.some((x) => x.name === it.name && x.id !== editing)) return setError('같은 이름의 항목이 이미 있어요.');
    setSaving(true);
    try {
      const rec = editing ? await be.adminUpdateTestItem(staffToken, editing, it) : await be.adminAddTestItem(staffToken, it);
      setData((d) => ({ ...d, testItems: editing ? d.testItems.map((x) => (x.id === editing ? rec : x)) : [...d.testItems, rec] }));
      toast(editing ? '항목을 고쳤어요' : '항목을 만들었어요');
      setDraft(null);
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const del = (id: string) =>
    confirm.tap('ti' + id, async () => {
      try {
        await be.adminDelTestItem(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({ ...d, testItems: d.testItems.filter((x) => x.id !== id), tests: d.tests.filter((t) => t.item !== id) }));
      toast('항목을 지웠어요');
    });

  if (draft) {
    const set = (k: keyof NewTestItem, v: string) => {
      setDraft((d) => (d ? { ...d, [k]: v } : d));
      setError('');
    };
    return (
      <Sheet title={editing ? '측정 항목 고치기' : '측정 항목 만들기'} onClose={() => setDraft(null)}>
        {!editing && (
          <div className={ui.field}>
            <span className={ui.label}>
              예시에서 고르기 <span className={ui.labelSub}>(선택)</span>
            </span>
            <div className={ui.choices}>
              {EXAMPLES.filter((x) => !items.some((i) => i.name === x.name)).map((x) => (
                <button key={x.name} type="button" className={cx(ui.choice, ui.choiceNavy, ui.pill)} style={{ fontSize: '0.9375rem', minHeight: '2.75rem' }} onClick={() => setDraft({ ...x })}>
                  {x.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className={ui.field}>
          <span className={ui.label}>항목 이름</span>
          <input className={ui.input} value={draft.name} onChange={(e) => set('name', e.target.value.slice(0, 30))} placeholder="예: 악력" autoComplete="off" />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>
            단위 <span className={ui.labelSub}>(선택)</span>
          </span>
          <input className={ui.input} value={draft.unit} onChange={(e) => set('unit', e.target.value.slice(0, 10))} placeholder="예: kg, 회, 초, cm" autoComplete="off" />
        </label>
        <div className={ui.field}>
          <span className={ui.label}>결과 비교</span>
          <div className={s.moreList}>
            {(['high', 'low', 'none'] as const).map((b) => (
              <button key={b} type="button" className={cx(ui.choice, ui.choiceNavy)} aria-pressed={draft.better === b} onClick={() => set('better', b)}>
                {BETTER_LABEL[b]}
              </button>
            ))}
          </div>
          <span className={ui.small}>지난번보다 좋아졌는지 이용자 화면에 알려줄 때 써요. (예: 악력은 높을수록, 걷기 시간은 낮을수록)</span>
        </div>
        {error && (
          <div role="alert" className={ui.error}>
            {error}
          </div>
        )}
        <button type="button" className={cx(ui.btn, ui.btnSave, ui.navy)} disabled={saving} onClick={() => void save()}>
          {saving ? '저장하는 중…' : '저장하기'}
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="측정 항목 관리" onClose={onClose}>
      <div className={ui.small}>만든 항목은 트레이너가 이용자 기록 화면의 체력 측정 칸에서 적어요. 이용자와 보호자는 결과를 볼 수 있어요.</div>
      {items.length === 0 && <div className={ui.empty}>만든 항목이 없어요.</div>}
      {items.map((it) => (
        <div key={it.id} className={s.foodRow}>
          <span className={s.foodMain}>
            <span className={s.foodName}>
              {it.name}
              {it.unit && ` (${it.unit})`}
            </span>
            <span className={ui.small}>
              {BETTER_LABEL[it.better]} · 결과 {count(it.id)}개
            </span>
          </span>
          <span className={s.foodActions}>
            <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => open(it)}>
              고치기
            </button>
            <ConfirmButton
              armed={confirm.pending === 'ti' + it.id}
              onClick={() => del(it.id)}
              label="지우기"
              confirmLabel={count(it.id) ? `결과 ${count(it.id)}개도 지워져요` : '한 번 더 누르면 지워요'}
            />
          </span>
        </div>
      ))}
      <button type="button" className={cx(ui.btn, ui.navy)} onClick={() => open()}>
        + 측정 항목 만들기
      </button>
    </Sheet>
  );
}
