import { useState } from 'react';
import { useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Sheet } from '../../components/Layout';
import { useConfirm } from '../../hooks/useConfirm';
import type { NewTestItem, TestCategory, TestItem } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { BETTER_LABEL, groupByCategory } from '../../lib/tests';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';

type Example = Pick<NewTestItem, 'name' | 'unit' | 'better' | 'kind'>;
const N = (name: string, unit: string, better: NewTestItem['better']): Example => ({ name, unit, better, kind: 'number' });
const T = (name: string): Example => ({ name, unit: '', better: 'none', kind: 'text' });

/** 기본 분류마다 누르면 입력칸에 채워지는 예시 (분류 이름의 앞부분으로 찾는다) */
const EXAMPLES: [string, Example[]][] = [
  ['신체징후', [N('수축기 혈압', 'mmHg', 'none'), N('이완기 혈압', 'mmHg', 'none'), N('안정시 심박수', 'bpm', 'none'), N('산소포화도', '%', 'high'), N('체온', '℃', 'none')]],
  ['신체구성', [N('체중', 'kg', 'none'), N('체지방률', '%', 'low'), N('골격근량', 'kg', 'high'), N('BMI', '', 'none'), N('허리둘레', 'cm', 'low'), N('기초대사량', 'kcal', 'none')]],
  ['자율신경', [N('HRV(SDNN)', 'ms', 'high'), N('RMSSD', 'ms', 'high'), N('스트레스 지수', '', 'low'), N('혈관 나이', '세', 'low'), N('맥파전달속도(PWV)', 'm/s', 'low')]],
  ['관절가동성', [N('어깨 굽힘(오른쪽)', '°', 'high'), N('어깨 굽힘(왼쪽)', '°', 'high'), N('고관절 굽힘', '°', 'high'), N('무릎 굽힘', '°', 'high'), N('목 돌리기', '°', 'high')]],
  ['기초·기능', [N('악력', 'kg', 'high'), N('30초 의자 일어서기', '회', 'high'), N('2분 제자리 걷기', '회', 'high'), N('앉아 윗몸 앞으로 굽히기', 'cm', 'high'), N('일어나 걷기(TUG)', '초', 'low'), N('한 발 서기', '초', 'high')]],
  ['체형분석', [N('어깨 높이 차이', 'cm', 'low'), N('골반 기울기', '°', 'none'), T('체형 소견')]],
  ['보행평가', [N('보행 속도', 'm/s', 'high'), N('보폭', 'cm', 'high'), N('10m 걷기', '초', 'low'), N('8자 보행', '초', 'low'), T('보행 소견')]],
];
const examplesFor = (cat: TestCategory | undefined) => (cat ? (EXAMPLES.find(([k]) => cat.name.startsWith(k))?.[1] ?? []) : []);

type View = { kind: 'list' } | { kind: 'item'; id: string | null; draft: NewTestItem } | { kind: 'cat'; id: string | null; name: string };

/** 관리자 · 체력 측정 분류와 항목 만들기·고치기·지우기. 결과는 트레이너가 이용자 화면에서 적는다 */
export function TestItemManage({ onClose }: { onClose: () => void }) {
  const { be, data, setData, staffToken, toast, fail } = useApp();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const cats = [...data.testCategories].sort((a, b) => a.sort - b.sort);
  const items = data.testItems;
  const count = (id: string) => data.tests.filter((t) => t.item === id).length;
  const go = (v: View) => {
    setView(v);
    setError('');
    confirm.reset();
  };

  const saveItem = async (id: string | null, draft: NewTestItem) => {
    if (saving) return;
    const it: NewTestItem = { ...draft, name: draft.name.trim(), unit: draft.kind === 'text' ? '' : draft.unit.trim(), better: draft.kind === 'text' ? 'none' : draft.better };
    if (!it.name) return setError('항목 이름을 입력해주세요.');
    if (items.some((x) => x.name === it.name && x.category === it.category && x.id !== id)) return setError('이 분류에 같은 이름의 항목이 이미 있어요.');
    setSaving(true);
    try {
      const rec = id ? await be.adminUpdateTestItem(staffToken, id, it) : await be.adminAddTestItem(staffToken, it);
      setData((d) => ({ ...d, testItems: id ? d.testItems.map((x) => (x.id === id ? rec : x)) : [...d.testItems, rec] }));
      toast(id ? '항목을 고쳤어요' : '항목을 만들었어요');
      go({ kind: 'list' });
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const saveCat = async (id: string | null, name: string) => {
    if (saving) return;
    const n = name.trim();
    if (!n) return setError('분류 이름을 입력해주세요.');
    setSaving(true);
    try {
      const rec = id ? await be.adminUpdateTestCategory(staffToken, id, n) : await be.adminAddTestCategory(staffToken, n);
      setData((d) => ({ ...d, testCategories: id ? d.testCategories.map((x) => (x.id === id ? rec : x)) : [...d.testCategories, rec] }));
      toast(id ? '분류 이름을 고쳤어요' : '분류를 만들었어요');
      go({ kind: 'list' });
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const delItem = (id: string) =>
    confirm.tap('ti' + id, async () => {
      try {
        await be.adminDelTestItem(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({ ...d, testItems: d.testItems.filter((x) => x.id !== id), tests: d.tests.filter((t) => t.item !== id) }));
      toast('항목을 지웠어요');
    });

  const delCat = (id: string) =>
    confirm.tap('tc' + id, async () => {
      try {
        await be.adminDelTestCategory(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({ ...d, testCategories: d.testCategories.filter((x) => x.id !== id) }));
      toast('분류를 지웠어요');
    });

  const errorBox = error && (
    <div role="alert" className={ui.error}>
      {error}
    </div>
  );

  // --- 분류 이름 ------------------------------------------------------------
  if (view.kind === 'cat') {
    return (
      <Sheet title={view.id ? '분류 이름 고치기' : '분류 만들기'} onClose={() => go({ kind: 'list' })}>
        <label className={ui.field}>
          <span className={ui.label}>분류 이름</span>
          <input
            className={ui.input}
            value={view.name}
            onChange={(e) => {
              setView({ ...view, name: e.target.value.slice(0, 40) });
              setError('');
            }}
            placeholder="예: 심폐지구력"
            autoComplete="off"
          />
        </label>
        {errorBox}
        <button type="button" className={cx(ui.btn, ui.btnSave, ui.navy)} disabled={saving} onClick={() => void saveCat(view.id, view.name)}>
          {saving ? '저장하는 중…' : '저장하기'}
        </button>
      </Sheet>
    );
  }

  // --- 항목 ----------------------------------------------------------------
  if (view.kind === 'item') {
    const { draft, id } = view;
    const set = (patch: Partial<NewTestItem>) => {
      setView({ ...view, draft: { ...draft, ...patch } });
      setError('');
    };
    const cat = cats.find((c) => c.id === draft.category);
    const examples = id ? [] : examplesFor(cat).filter((x) => !items.some((i) => i.name === x.name && i.category === draft.category));
    return (
      <Sheet title={id ? '측정 항목 고치기' : '측정 항목 만들기'} onClose={() => go({ kind: 'list' })}>
        <div className={ui.field}>
          <span className={ui.label}>분류</span>
          <div className={ui.choices}>
            {cats.map((c) => (
              <button key={c.id} type="button" className={cx(ui.choice, ui.choiceNavy, ui.pill, s.smallChip)} aria-pressed={draft.category === c.id} onClick={() => set({ category: c.id })}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
        {examples.length > 0 && (
          <div className={ui.field}>
            <span className={ui.label}>
              예시에서 고르기 <span className={ui.labelSub}>(선택)</span>
            </span>
            <div className={ui.choices}>
              {examples.map((x) => (
                <button key={x.name} type="button" className={cx(ui.choice, ui.pill, s.smallChip)} onClick={() => set(x)}>
                  {x.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={ui.field}>
          <span className={ui.label}>적는 방법</span>
          <div className={ui.grid2}>
            {(
              [
                ['number', '숫자 (예: 22.5kg)'],
                ['text', '글 (예: 소견)'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className={cx(ui.choice, ui.choiceNavy)} aria-pressed={draft.kind === k} disabled={!!id} onClick={() => set({ kind: k })}>
                {l}
              </button>
            ))}
          </div>
          {id && <span className={ui.small}>이미 적은 결과가 있을 수 있어 적는 방법은 바꿀 수 없어요.</span>}
        </div>
        <label className={ui.field}>
          <span className={ui.label}>항목 이름</span>
          <input className={ui.input} value={draft.name} onChange={(e) => set({ name: e.target.value.slice(0, 30) })} placeholder={draft.kind === 'text' ? '예: 체형 소견' : '예: 악력'} autoComplete="off" />
        </label>
        {draft.kind === 'number' && (
          <>
            <label className={ui.field}>
              <span className={ui.label}>
                단위 <span className={ui.labelSub}>(선택)</span>
              </span>
              <input className={ui.input} value={draft.unit} onChange={(e) => set({ unit: e.target.value.slice(0, 10) })} placeholder="예: kg, 회, 초, cm, °" autoComplete="off" />
            </label>
            <div className={ui.field}>
              <span className={ui.label}>결과 비교</span>
              <div className={s.moreList}>
                {(['high', 'low', 'none'] as const).map((b) => (
                  <button key={b} type="button" className={cx(ui.choice, ui.choiceNavy)} aria-pressed={draft.better === b} onClick={() => set({ better: b })}>
                    {BETTER_LABEL[b]}
                  </button>
                ))}
              </div>
              <span className={ui.small}>지난번보다 좋아졌는지 이용자 화면에 알려줄 때 써요. 혈압처럼 좋고 나쁨을 나누기 어려우면 「비교 안 함」.</span>
            </div>
          </>
        )}
        {errorBox}
        <button type="button" className={cx(ui.btn, ui.btnSave, ui.navy)} disabled={saving} onClick={() => void saveItem(id, draft)}>
          {saving ? '저장하는 중…' : '저장하기'}
        </button>
      </Sheet>
    );
  }

  // --- 목록 ----------------------------------------------------------------
  const newItem = (category: string | null) => go({ kind: 'item', id: null, draft: { name: '', unit: '', better: 'high', category, kind: 'number' } });
  const editItem = (it: TestItem) => go({ kind: 'item', id: it.id, draft: { name: it.name, unit: it.unit, better: it.better, category: it.category, kind: it.kind } });

  return (
    <Sheet title="체력 측정 항목 관리" onClose={onClose}>
      <div className={ui.small}>분류마다 항목을 만들면 트레이너가 이용자 기록 화면의 체력 측정 칸에서 적어요. 이용자와 보호자는 결과를 볼 수 있어요.</div>
      {groupByCategory(cats, items, true).map((g) => (
        <section key={g.category?.id ?? 'none'} className={s.catBlock}>
          <div className={s.catHead}>
            <h3 className={s.catName}>{g.name}</h3>
            <span className={ui.small}>{g.items.length}개</span>
          </div>
          {g.items.length === 0 && <div className={ui.muted}>아직 항목이 없어요.</div>}
          {g.items.map((it) => (
            <div key={it.id} className={s.foodRow}>
              <span className={s.foodMain}>
                <span className={s.foodName}>
                  {it.name}
                  {it.unit && ` (${it.unit})`}
                </span>
                <span className={ui.small}>
                  {it.kind === 'text' ? '글로 적기' : BETTER_LABEL[it.better]} · 결과 {count(it.id)}개
                </span>
              </span>
              <span className={s.foodActions}>
                <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => editItem(it)}>
                  고치기
                </button>
                <ConfirmButton
                  armed={confirm.pending === 'ti' + it.id}
                  onClick={() => delItem(it.id)}
                  label="지우기"
                  confirmLabel={count(it.id) ? `결과 ${count(it.id)}개도 지워져요` : '한 번 더 누르면 지워요'}
                />
              </span>
            </div>
          ))}
          <div className={s.catActions}>
            {g.category && (
              <>
                <button type="button" className={ui.btnSmall} onClick={() => go({ kind: 'cat', id: g.category!.id, name: g.category!.name })}>
                  분류 이름 고치기
                </button>
                {g.items.length === 0 && (
                  <ConfirmButton armed={confirm.pending === 'tc' + g.category.id} onClick={() => delCat(g.category!.id)} label="분류 지우기" confirmLabel="한 번 더 누르면 지워요" />
                )}
              </>
            )}
            <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => newItem(g.category?.id ?? null)}>
              + 항목 추가
            </button>
          </div>
        </section>
      ))}
      <button type="button" className={cx(ui.btn, ui.navy)} onClick={() => go({ kind: 'cat', id: null, name: '' })}>
        + 분류 만들기
      </button>
    </Sheet>
  );
}
