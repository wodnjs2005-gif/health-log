import { useState } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { ConfirmButton } from '../../components/ConfirmButton';
import { Layout } from '../../components/Layout';
import { useConfirm } from '../../hooks/useConfirm';
import { ageOf, birthLabel, parseBirth } from '../../lib/age';
import type { Member } from '../../lib/backend';
import { cx } from '../../lib/cx';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';
import { MemberFilter, TagList, useMemberFilter } from '../staff/MemberFilter';
import { EMPTY_TAG_DRAFT, TagEditor, tagsToSave } from '../staff/TagEditor';
import { TagSheet } from '../staff/TagSheet';
import { VideoManage } from '../staff/VideoManage';
import st from '../staff/staff.module.css';
import { BirthInput, BirthSheet, EMPTY_BIRTH } from './BirthInput';
import { IssuedCard } from './IssuedCard';
import { PasswordSheet } from './PasswordSheet';
import { TrainerManage } from './TrainerManage';

type ATab = 'members' | 'trainers' | 'videos';

/** 방금 발급한 번호 안내 카드. new = 새로 등록(두 번호 모두), code = 새 개인 번호, guardian = 새 보호자 번호 */
interface Issued {
  id: string;
  name: string;
  kind: 'new' | 'code' | 'guardian';
  code: string;
  guardianCode?: string;
}

const ISSUED_TEXT: Record<Issued['kind'], { title: string; label: string; tell: string }> = {
  new: { title: '등록했어요', label: '개인 번호', tell: '이 번호를 이용자에게 알려주세요.' },
  code: { title: '새 번호를 발급했어요', label: '개인 번호', tell: '이 번호를 이용자에게 알려주세요.' },
  guardian: { title: '새 보호자 번호를 발급했어요', label: '보호자 번호', tell: '이 번호를 보호자에게 알려주세요.' },
};

export function AdminApp() {
  const { be, data, staffToken, setData, toast, fail, goEntry, logout, today } = useApp();
  const [newName, setNewName] = useState('');
  const [birth, setBirth] = useState(EMPTY_BIRTH);
  const [tagDraft, setTagDraft] = useState(EMPTY_TAG_DRAFT);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [editingBirth, setEditingBirth] = useState<string | null>(null);
  const [tagging, setTagging] = useState<Member | null>(null);
  const [aTab, setATab] = useState<ATab>('members');
  const [changingPw, setChangingPw] = useState(false);
  const { filter, setFilter, shown } = useMemberFilter(data.members);
  const confirm = useConfirm();

  const addMember = async () => {
    const name = newName.trim();
    if (!name) return setError('이름을 입력해주세요.');
    const parsed = parseBirth(birth.y, birth.m, birth.d, today);
    if ('error' in parsed) return setError(parsed.error);
    const tagged = tagsToSave(tagDraft);
    if ('error' in tagged) return setError(tagged.error);
    if (saving) return;
    setSaving(true);
    try {
      let m = await be.staffAddMember(staffToken, name, parsed.birth);
      if (tagged.tags.length > 0) {
        // 등록은 이미 됐으므로 해시태그만 실패하면 알려주고 번호 안내는 그대로 보여준다
        try {
          m = { ...m, tags: await be.staffSetTags(staffToken, m.id, tagged.tags) };
        } catch {
          toast('등록했지만 해시태그는 저장하지 못했어요');
        }
      }
      const added = m;
      setData((d) => ({ ...d, members: [...d.members, added] }));
      setNewName('');
      setBirth(EMPTY_BIRTH);
      setTagDraft(EMPTY_TAG_DRAFT);
      setError('');
      setIssued({ id: m.id, name: m.name, kind: 'new', code: m.code, guardianCode: m.guardianCode });
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const newCode = (id: string) =>
    confirm.tap('c' + id, async () => {
      let code: string;
      try {
        code = await be.staffNewCode(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      const m = data.members.find((x) => x.id === id);
      setData((d) => ({ ...d, members: d.members.map((x) => (x.id === id ? { ...x, code } : x)) }));
      setIssued(m ? { id, name: m.name, kind: 'code', code } : null);
      scrollTop();
    });

  const newGuardianCode = (id: string) =>
    confirm.tap('g' + id, async () => {
      let code: string;
      try {
        code = await be.staffNewGuardianCode(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      const m = data.members.find((x) => x.id === id);
      setData((d) => ({ ...d, members: d.members.map((x) => (x.id === id ? { ...x, guardianCode: code } : x)) }));
      setIssued(m ? { id, name: m.name, kind: 'guardian', code } : null);
      scrollTop();
    });

  const delMember = (id: string) =>
    confirm.tap(id, async () => {
      try {
        await be.staffDelMember(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({
        members: d.members.filter((m) => m.id !== id),
        ex: d.ex.filter((e) => e.mid !== id),
        meals: d.meals.filter((e) => e.mid !== id),
        views: d.views.filter((v) => v.mid !== id),
        programs: d.programs.map((p) => ({ ...p, mids: p.mids.filter((x) => x !== id) })),
      }));
      setIssued((j) => (j && j.id === id ? null : j));
      toast('이용자를 삭제했어요');
    });

  const editingMember = editingBirth ? data.members.find((m) => m.id === editingBirth) : undefined;

  return (
    <Layout title="관리자" onBack={goEntry}>
      <div role="tablist" aria-label="관리자 메뉴" className={cx(st.switch, st.switchNavy)}>
        {(
          [
            ['members', '이용자 관리'],
            ['trainers', '트레이너 관리'],
            ['videos', '운동 영상'],
          ] as [ATab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={aTab === k}
            className={st.switchBtn}
            onClick={() => {
              confirm.reset();
              setATab(k);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {aTab === 'videos' ? (
        <VideoManage confirm={confirm} color="navy" />
      ) : aTab === 'trainers' ? (
        <TrainerManage confirm={confirm} />
      ) : (
        <>
          <section className={cx(ui.card, s.regCard)}>
            <h2 className={ui.h3} style={{ fontSize: '1.1875rem', fontWeight: 800 }}>
              이용자 등록
            </h2>
            <label className={ui.field}>
              <span className={ui.label}>이름</span>
              <input
                className={ui.input}
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setError('');
                }}
                placeholder="예: 김순자"
                autoComplete="off"
              />
            </label>
            <BirthInput
              value={birth}
              onChange={(v) => {
                setBirth(v);
                setError('');
              }}
              onEnter={() => void addMember()}
            />
            <TagEditor
              value={tagDraft}
              onChange={setTagDraft}
              onError={setError}
              label={
                <>
                  해시태그 <span className={ui.labelSub}>(선택)</span>
                </>
              }
            />
            {error && (
              <div role="alert" className={ui.error}>
                {error}
              </div>
            )}
            <button type="button" className={cx(ui.btn, ui.navy)} disabled={saving} onClick={() => void addMember()}>
              {saving ? '등록하는 중…' : '등록하기'}
            </button>
          </section>

          {issued && (
            <IssuedCard
              heading={`${issued.name} 님 · ${ISSUED_TEXT[issued.kind].title}`}
              label={ISSUED_TEXT[issued.kind].label}
              code={issued.code}
              tell={ISSUED_TEXT[issued.kind].tell}
              sub={issued.kind === 'new' && issued.guardianCode ? { label: '보호자 번호', code: issued.guardianCode } : undefined}
              onClose={() => setIssued(null)}
            />
          )}

          <div className={ui.row} style={{ padding: '0.25rem' }}>
            <h2 className={ui.h2}>이용자 목록</h2>
            <div className={ui.muted}>{data.members.length}명</div>
          </div>
          {data.members.length === 0 ? (
            <div className={ui.empty}>등록된 이용자가 없어요.</div>
          ) : (
            <MemberFilter members={data.members} value={filter} onChange={setFilter} shown={shown.length} />
          )}
          {data.members.length > 0 && shown.length === 0 && <div className={ui.empty}>찾는 이용자가 없어요.</div>}
          {shown.map((m) => {
            const age = ageOf(m, today);
            return (
              <div key={m.id} className={cx(ui.card, s.memberCard)}>
                <div className={ui.row} style={{ gap: '0.25rem 0.75rem' }}>
                  <span className={s.name}>{m.name}</span>
                  {(m.birth || age !== null) && (
                    <span className={ui.muted} style={{ whiteSpace: 'nowrap' }}>
                      {m.birth && `${birthLabel(m.birth)} · `}
                      {age !== null && `${age}세`}
                    </span>
                  )}
                </div>
                <TagList tags={m.tags} />
                <div className={s.codeRow}>
                  <span className={cx(ui.small, s.codeLabel)}>개인 번호</span>
                  <span className={s.code}>{m.code || '—'}</span>
                </div>
                <div className={s.codeRow}>
                  <span className={cx(ui.small, s.codeLabel)}>보호자 번호</span>
                  <span className={cx(s.code, s.codeGuardian)}>{m.guardianCode || '—'}</span>
                </div>
                <div style={{ fontSize: '0.9375rem', color: 'var(--ink-2)' }}>
                  운동 기록 {data.ex.filter((e) => e.mid === m.id).length}건 · 식사 기록 {data.meals.filter((e) => e.mid === m.id).length}건
                </div>
                <div className={s.actions}>
                  <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => setEditingBirth(m.id)}>
                    {m.birth ? '생년월일 수정' : '생년월일 입력'}
                  </button>
                  <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => setTagging(m)}>
                    # 해시태그
                  </button>
                  <ConfirmButton
                    armed={confirm.pending === 'c' + m.id}
                    onClick={() => newCode(m.id)}
                    label="새 번호 발급"
                    confirmLabel="한 번 더 누르면 새 번호"
                  />
                  <ConfirmButton
                    armed={confirm.pending === 'g' + m.id}
                    onClick={() => newGuardianCode(m.id)}
                    label="새 보호자 번호"
                    confirmLabel="한 번 더 누르면 새 번호"
                  />
                  <ConfirmButton armed={confirm.pending === m.id} onClick={() => delMember(m.id)} label="이용자 삭제" />
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className={s.accountRow}>
        <button type="button" className={ui.btnGhost} onClick={() => setChangingPw(true)}>
          비밀번호 변경
        </button>
        <button type="button" className={ui.btnGhost} onClick={logout}>
          로그아웃
        </button>
      </div>
      {editingMember && <BirthSheet member={editingMember} onClose={() => setEditingBirth(null)} />}
      {tagging && <TagSheet member={tagging} onClose={() => setTagging(null)} />}
      {changingPw && <PasswordSheet onClose={() => setChangingPw(false)} />}
    </Layout>
  );
}
