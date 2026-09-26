import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Sheet } from '../../components/Layout';
import { useConfirm } from '../../hooks/useConfirm';
import { isAuthError, type CustomFood, type FoodRequest, type Nutri } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { md } from '../../lib/date';
import { findBaseFood, fmt, NUTRI_KEYS, NUTRI_LABEL, NUTRI_UNIT } from '../../lib/nutrition';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';

type Draft = { name: string; size: string; unit: 'g' | 'ml' } & Record<keyof Nutri, string>;
const EMPTY: Draft = { name: '', size: '', unit: 'g', kcal: '', carb: '', prot: '', fat: '', na: '' };
const toDraft = (f: Omit<CustomFood, 'updatedAt'>): Draft => ({
  name: f.name, size: String(f.size), unit: f.unit,
  kcal: String(f.kcal), carb: String(f.carb), prot: String(f.prot), fat: String(f.fat), na: String(f.na),
});

/**
 * 관리자 · 음식 목록 관리
 * 이용자가 목록에 없어 직접 적은 음식을 모아 보여주고, 영양 정보를 넣으면 모두의 음식 찾기에 나온다.
 */
export function FoodManage({ onClose, onChanged }: { onClose: () => void; onChanged: (requests: number) => void }) {
  const { be, staffToken, toast, fail, refresh } = useApp();
  const [requests, setRequests] = useState<FoodRequest[] | null>(null);
  const [customs, setCustoms] = useState<CustomFood[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false); // 이미 추가한 음식 고치기
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([be.adminFoodRequests(staffToken), be.customFoodsGet()]);
      setRequests(r);
      setCustoms(c);
      setLoadError(false);
      onChanged(r.length);
    } catch (e) {
      if (isAuthError(e)) return fail(e);
      setLoadError(true);
    }
  }, [be, staffToken, fail, onChanged]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (name: string, existing?: CustomFood) => {
    setError('');
    setNote('');
    setEditing(!!existing);
    if (existing) return setDraft(toDraft(existing));
    // 기본 목록에 같은 이름이 있으면 그 값을 채워 준다
    const base = name ? await findBaseFood(name).catch(() => undefined) : undefined;
    if (base) {
      setDraft(toDraft({ ...base, unit: base.unit === 'ml' ? 'ml' : 'g' }));
      setNote('기본 음식 목록에 같은 이름이 있어 그 값을 채웠어요.');
    } else setDraft({ ...EMPTY, name });
  };

  const save = async () => {
    if (!draft || saving) return;
    const name = draft.name.trim();
    const size = Number(draft.size);
    const nums = NUTRI_KEYS.map((k) => Number(draft[k]));
    if (!name) return setError('음식 이름을 입력해주세요.');
    if (!(size > 0 && size <= 5000)) return setError('1회 분량을 입력해주세요. (예: 190)');
    if (NUTRI_KEYS.some((k) => draft[k].trim() === '') || nums.some((v) => !(v >= 0))) return setError('영양소 다섯 가지를 모두 숫자로 입력해주세요.');
    setSaving(true);
    try {
      const n = Object.fromEntries(NUTRI_KEYS.map((k, i) => [k, nums[i]])) as unknown as Nutri;
      const r = await be.adminSaveFood(staffToken, { name, size, unit: draft.unit, ...n });
      toast(r.updated ? `저장했어요 · 지난 식사 ${r.updated}끼를 다시 계산했어요` : '저장했어요');
      setDraft(null);
      await load();
      if (r.updated) void refresh();
    } catch (e) {
      if (isAuthError(e)) return fail(e);
      setError('저장하지 못했어요. 잠시 뒤 다시 해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const del = (name: string) =>
    confirm.tap('fd' + name, async () => {
      try {
        await be.adminDelFood(staffToken, name);
      } catch (e) {
        return fail(e);
      }
      toast('음식을 지웠어요');
      await load();
    });

  const set = (k: keyof Draft, v: string) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
    setError('');
  };

  if (draft) {
    return (
      <Sheet title={editing ? '음식 고치기' : '음식 추가'} onClose={() => setDraft(null)}>
        <label className={ui.field}>
          <span className={ui.label}>음식 이름</span>
          <input className={ui.input} value={draft.name} onChange={(e) => set('name', e.target.value.slice(0, 40))} readOnly={editing} placeholder="예: 두유" autoComplete="off" />
        </label>
        <div className={ui.field}>
          <span className={ui.label}>1회 분량</span>
          <div className={s.sizeRow}>
            <input className={ui.input} inputMode="decimal" value={draft.size} onChange={(e) => set('size', e.target.value)} placeholder="예: 190" aria-label="1회 분량" />
            <div className={ui.grid2} style={{ flex: 'none', width: '8.5rem' }}>
              {(['g', 'ml'] as const).map((u) => (
                <button key={u} type="button" className={cx(ui.choice, ui.choiceNavy)} aria-pressed={draft.unit === u} onClick={() => set('unit', u)}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={ui.field}>
          <span className={ui.label}>1회 분량의 영양소</span>
          <div className={s.nutriForm}>
            {NUTRI_KEYS.map((k) => (
              <label key={k} className={s.nutriField}>
                <span className={ui.small}>
                  {NUTRI_LABEL[k]} ({NUTRI_UNIT[k]})
                </span>
                <input className={ui.input} inputMode="decimal" value={draft[k]} onChange={(e) => set(k, e.target.value)} />
              </label>
            ))}
          </div>
          <div className={ui.small}>제품 포장의 영양성분표나 식품안전나라 영양성분 DB에서 찾아 넣으세요.</div>
        </div>
        {note && <div className={ui.note}>{note}</div>}
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
    <Sheet title="음식 목록 관리" onClose={onClose}>
      {loadError && <div className={ui.error}>불러오지 못했어요. 인터넷을 확인하고 다시 열어주세요.</div>}
      {!requests && !loadError && <div className={ui.muted}>불러오는 중…</div>}

      {requests && (
        <section className={ui.field}>
          <div className={ui.label}>이용자가 직접 적은 음식 {requests.length > 0 && `${requests.length}가지`}</div>
          {requests.length === 0 ? (
            <div className={ui.empty}>새로 적은 음식이 없어요.</div>
          ) : (
            requests.map((r) => (
              <div key={r.name} className={s.foodRow}>
                <span className={s.foodMain}>
                  <span className={s.foodName}>{r.name}</span>
                  <span className={ui.small}>
                    {r.count}번 · {r.members}명 · 최근 {md(r.last)}
                  </span>
                </span>
                <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => void open(r.name)}>
                  영양 정보 넣기
                </button>
              </div>
            ))
          )}
        </section>
      )}

      {requests && (
        <section className={ui.field}>
          <div className={ui.label}>추가한 음식 {customs.length > 0 && `${customs.length}가지`}</div>
          {customs.length === 0 && <div className={ui.empty}>추가한 음식이 없어요.</div>}
          {customs.map((c) => (
            <div key={c.name} className={s.foodRow}>
              <span className={s.foodMain}>
                <span className={s.foodName}>{c.name}</span>
                <span className={ui.small}>
                  1회 {c.size}
                  {c.unit} · {fmt('kcal', c.kcal)}
                </span>
              </span>
              <span className={s.foodActions}>
                <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => void open(c.name, c)}>
                  고치기
                </button>
                <ConfirmButton armed={confirm.pending === 'fd' + c.name} onClick={() => del(c.name)} label="지우기" confirmLabel="한 번 더 누르면 지워요" />
              </span>
            </div>
          ))}
        </section>
      )}

      <button type="button" className={cx(ui.btn, ui.navy)} onClick={() => void open('')}>
        + 새 음식 추가
      </button>
    </Sheet>
  );
}
