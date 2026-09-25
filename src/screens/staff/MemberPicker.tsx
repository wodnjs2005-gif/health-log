import { useApp } from '../../AppContext';
import { ageOf } from '../../lib/age';
import type { Member } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { MemberFilter, TagList, useMemberFilter } from './MemberFilter';
import type { StaffColor } from './ProgramSheet';
import s from './staff.module.css';

interface Props {
  members: Member[];
  selected: string[];
  onChange: (mids: string[]) => void;
  color?: StaffColor;
}

/**
 * 영상을 볼 이용자 고르기: 이름·초성·#해시태그로 찾고, 눌러서 고른다.
 * 해시태그를 누른 뒤 '모두 고르기'로 반 전체를 한 번에 고를 수 있다.
 */
export function MemberPicker({ members, selected, onChange, color = 'orange' }: Props) {
  const { today } = useApp();
  const { filter, setFilter, shown } = useMemberFilter(members);
  const picked = members.filter((m) => selected.includes(m.id));
  const allShownPicked = shown.length > 0 && shown.every((m) => selected.includes(m.id));
  const searching = !!filter.q.trim() || !!filter.tag;
  const allLabel = allShownPicked
    ? searching ? '찾은 분들 빼기' : '모두 빼기'
    : searching ? '찾은 분들 모두 고르기' : '모두 고르기';

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const toggleShown = () => {
    const ids = shown.map((m) => m.id);
    onChange(allShownPicked ? selected.filter((x) => !ids.includes(x)) : [...new Set([...selected, ...ids])]);
  };

  return (
    <div className={cx(s.filter, color === 'navy' && s.navyAccent)}>
      {picked.length > 0 && (
        <div className={s.picked} aria-label="고른 이용자">
          {picked.map((m) => (
            <button key={m.id} type="button" className={s.pickedChip} aria-label={`${m.name} 빼기`} onClick={() => toggle(m.id)}>
              {m.name}
              <span className={s.x} aria-hidden="true">
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      <MemberFilter members={members} value={filter} onChange={setFilter} />

      <div className={s.pickBar}>
        <span className={s.resultNote} role="status">
          {searching ? `찾은 이용자 ${shown.length}명 · ` : ''}
          {selected.length}명 고름
        </span>
        {shown.length > 0 && (
          <button type="button" className={s.pickAll} onClick={toggleShown}>
            {allLabel}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className={s.resultNote}>찾는 이용자가 없어요.</div>
      ) : (
        <div className={s.pickList}>
          {shown.map((m) => {
            const on = selected.includes(m.id);
            const age = ageOf(m, today);
            return (
              <button key={m.id} type="button" role="checkbox" aria-checked={on} className={s.pickRow} onClick={() => toggle(m.id)}>
                <span className={s.box} aria-hidden="true">
                  {on ? '✓' : ''}
                </span>
                <span className={s.pickMain}>
                  <span className={s.pickName}>
                    {m.name}
                    {age !== null && <span className={s.resultNote}> · {age}세</span>}
                  </span>
                  <TagList tags={m.tags} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
