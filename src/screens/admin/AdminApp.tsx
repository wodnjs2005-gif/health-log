import { useEffect, useState, type CSSProperties } from 'react';
import { scrollTop, useApp } from '../../AppContext';
import { Avatar } from '../../components/Avatar';
import { ConfirmButton } from '../../components/ConfirmButton';
import { CopyCode } from '../../components/CopyCode';
import { Layout, Sheet } from '../../components/Layout';
import { ChatScreen } from '../../components/Chat';
import { EditableAvatar, PhotoSheet } from '../../components/PhotoSheet';
import { useStaffChat } from '../../hooks/useChat';
import { ChatList } from '../staff/ChatList';
import { AssignSheet } from './AssignSheet';
import { trainerTitle } from '../../lib/rank';
import { NutriLine } from '../../components/Nutri';
import { useConfirm } from '../../hooks/useConfirm';
import { activityOf, sortByActivity, STALE_DAYS, staleText } from '../../lib/activity';
import { ageOf, birthLabel, parseBirth } from '../../lib/age';
import type { Meal, Member } from '../../lib/backend';
import { cx } from '../../lib/cx';
import { md } from '../../lib/date';
import { sumMeals } from '../../lib/nutrition';
import ui from '../../styles/ui.module.css';
import s from './admin.module.css';
import { MemberFilter, TagList, useMemberFilter } from '../staff/MemberFilter';
import { ExportSheet } from '../staff/ExportSheet';
import { EMPTY_TAG_DRAFT, TagEditor, tagsToSave } from '../staff/TagEditor';
import { LessonManage } from '../staff/LessonManage';
import { NoticeManage } from '../staff/NoticeManage';
import { StaffMemberView } from '../staff/StaffMemberView';
import { TagSheet } from '../staff/TagSheet';
import { VideoManage } from '../staff/VideoManage';
import st from '../staff/staff.module.css';
import { BirthInput, BirthSheet, EMPTY_BIRTH } from './BirthInput';
import { FoodManage } from './FoodManage';
import { IssuedCard } from './IssuedCard';
import { PasswordSheet } from './PasswordSheet';
import { TestItemManage } from './TestItemManage';
import { TrainerManage } from './TrainerManage';
import { StatsCard } from './Stats';
import { useBack } from '../../hooks/useBack';
import { useViewMode } from '../../hooks/useViewMode';
import { ViewToggle } from '../staff/ViewToggle';

type ATab = 'members' | 'trainers' | 'lessons' | 'videos';

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
  const { be, data, staffToken, staffId, staffName, setData, toast, fail, goEntry, logout, refresh, today } = useApp();
  const [myPhoto, setMyPhoto] = useState(false);
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
  /** 기록 내려받기 창: 'all' = 전체로 열기, 이용자 id = 그 사람을 골라 열기 */
  const [exporting, setExporting] = useState<string | null>(null);
  const [foodOpen, setFoodOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [testItemsOpen, setTestItemsOpen] = useState(false);
  /** 사진 창을 연 이용자 */
  const [photoMember, setPhotoMember] = useState<Member | null>(null);
  /** 이용자 등록 칸 펼침 (평소에는 접어 두어 목록이 먼저 보이게) */
  const [regOpen, setRegOpen] = useState(false);
  /** 더보기 창을 연 이용자 */
  const [more, setMore] = useState<Member | null>(null);
  const [assigning, setAssigning] = useState<Member | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWith, setChatWith] = useState<Member | null>(null);
  // 관리자는 대화 기록을 열었을 때만 연결한다
  const adminChat = useStaffChat(chatOpen || !!chatWith);
  /** 기록을 보고 있는 이용자 */
  const [viewing, setViewing] = useState<string | null>(null);
  /** 이용자가 직접 적은 음식 중 아직 영양 정보를 넣지 않은 것의 수 */
  const [foodRequests, setFoodRequests] = useState(0);

  useEffect(() => {
    let alive = true;
    be.adminFoodRequests(staffToken)
      .then((r) => alive && setFoodRequests(r.length))
      .catch(() => {}); // 알림용이라 실패해도 조용히
    return () => {
      alive = false;
    };
  }, [be, staffToken]);
  const { filter, setFilter, shown } = useMemberFilter(data.members);
  const confirm = useConfirm();
  // 이용자 목록: 목록(자세히) / 격자(사진·이름·해시태그·개인 번호, 누르면 더보기 창)
  const [tile, setTile] = useViewMode('members');
  const openRecord = (id: string) => {
    confirm.reset();
    setViewing(id);
    scrollTop();
  };

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
      setRegOpen(false);
      setIssued({ id: m.id, name: m.name, kind: 'new', code: m.code, guardianCode: m.guardianCode });
      scrollTop();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  // 아래 세 가지는 더보기 창에서 두 번 눌러 확인한 뒤 부른다
  const newCode = async (id: string) => {
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
  };

  const newGuardianCode = async (id: string) => {
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
  };

  const delMember = async (id: string) => {
    try {
      await be.staffDelMember(staffToken, id);
    } catch (e) {
      return fail(e);
    }
    setData((d) => ({
      ...d,
      lessons: d.lessons.map((l) => ({ ...l, roster: l.roster.filter((r) => r.mid !== id) })),
      attendance: d.attendance.filter((a) => a.mid !== id),
      members: d.members.filter((m) => m.id !== id),
      ex: d.ex.filter((e) => e.mid !== id),
      meals: d.meals.filter((e) => e.mid !== id),
      views: d.views.filter((v) => v.mid !== id),
      programs: d.programs.map((p) => ({ ...p, mids: p.mids.filter((x) => x !== id) })),
      notes: d.notes.filter((n) => n.mid !== id),
      measures: d.measures.filter((x) => x.mid !== id),
      tests: d.tests.filter((x) => x.mid !== id),
    }));
    setIssued((j) => (j && j.id === id ? null : j));
    toast('이용자를 삭제했어요');
  };

  // 「뒤로」: 다른 메뉴에 있으면 이용자 관리로
  useBack(aTab !== 'members', () => setATab('members'));

  const viewed = viewing ? data.members.find((m) => m.id === viewing) : undefined;
  if (viewed) {
    return (
      <StaffMemberView
        member={viewed}
        title="관리자"
        color="navy"
        onBack={() => {
          setViewing(null);
          scrollTop();
          void refresh();
        }}
      />
    );
  }

  const sorted = sortByActivity(shown, data, today);
  const staleCount = shown.filter((m) => activityOf(data, m.id, today).stale).length;

  const editingMember = editingBirth ? data.members.find((m) => m.id === editingBirth) : undefined;

  return (
    <Layout
      title="관리자"
      onBack={goEntry}
      avatar={staffId ? <EditableAvatar id={staffId} name={staffName} size="md" tone="navy" onEdit={() => setMyPhoto(true)} /> : undefined}
    >
      <div role="tablist" aria-label="관리자 메뉴" className={cx(st.switch, st.switchNavy)}>
        {(
          [
            ['members', '이용자 관리'],
            ['trainers', '트레이너 관리'],
            ['lessons', '출석'],
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

      {aTab === 'lessons' ? (
        <LessonManage confirm={confirm} color="navy" />
      ) : aTab === 'videos' ? (
        <VideoManage confirm={confirm} color="navy" />
      ) : aTab === 'trainers' ? (
        <TrainerManage confirm={confirm} />
      ) : (
        <>
          <StatsCard />
          {foodRequests > 0 && (
            <div className={cx(ui.note, s.foodNotice)}>
              <span>이용자가 목록에 없는 음식을 적었어요 ({foodRequests}가지)</span>
              <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => setFoodOpen(true)}>
                영양 정보 넣기
              </button>
            </div>
          )}
          {!regOpen ? (
            <button type="button" className={cx(ui.btn, ui.navy)} onClick={() => setRegOpen(true)} aria-expanded={false}>
              + 이용자 등록
            </button>
          ) : (
            <section className={cx(ui.card, s.regCard)}>
              <div className={ui.row} style={{ alignItems: 'center', flexWrap: 'nowrap' }}>
                <h2 className={ui.h3} style={{ fontSize: '1.1875rem', fontWeight: 800 }}>
                  이용자 등록
                </h2>
                <button
                  type="button"
                  className={ui.btnSmall}
                  onClick={() => {
                    setRegOpen(false);
                    setError('');
                  }}
                >
                  접기
                </button>
              </div>
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
          )}

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

          <div className={ui.row} style={{ padding: '0.25rem', alignItems: 'center' }}>
            <h2 className={ui.h2}>
              이용자 목록 <span className={ui.muted}>{data.members.length}명</span>
            </h2>
            {data.members.length > 0 && (
              <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => setExporting('all')}>
                엑셀 내려받기
              </button>
            )}
          </div>
          {data.members.length === 0 ? (
            <div className={ui.empty}>등록된 이용자가 없어요.</div>
          ) : (
            <MemberFilter
              members={data.members}
              value={filter}
              onChange={setFilter}
              shown={shown.length}
              side={<ViewToggle tile={tile} onChange={setTile} color="navy" />}
            />
          )}
          {data.members.length > 0 && shown.length === 0 && <div className={ui.empty}>찾는 이용자가 없어요.</div>}
          {staleCount > 0 && (
            <div className={st.staleNote} role="status">
              {STALE_DAYS}일 이상 기록이 없는 분이 <b>{staleCount}명</b> 있어요. 맨 위에 모았어요.
            </div>
          )}
          {tile && sorted.length > 0 && (
            <div className={st.tiles}>
              {sorted.map((m) => (
                <div
                  key={m.id}
                  className={cx(ui.card, st.tile, st.tileWithCode, activityOf(data, m.id, today).stale && st.memberStale)}
                  style={{ '--n': m.code.length } as CSSProperties}
                >
                  <button type="button" className={st.tileOpen} onClick={() => setMore(m)} aria-haspopup="dialog">
                    <Avatar id={m.id} name={m.name} size="lg" tone="navy" />
                    <span className={st.tileName}>{m.name}</span>
                  </button>
                  <TagList tags={m.tags} className={st.tileTags} />
                  <CopyCode code={m.code} label="개인 번호" className={cx(s.code, st.tileCode)} />
                </div>
              ))}
            </div>
          )}
          {!tile && sorted.map((m) => {
            const age = ageOf(m, today);
            const act = activityOf(data, m.id, today);
            const warn = staleText(act);
            return (
              <div key={m.id} className={cx(ui.card, s.memberCard, act.stale && st.memberStale)}>
                <div className={ui.row} style={{ gap: '0.25rem 0.75rem', alignItems: 'center' }}>
                  <span className={s.nameRank}>
                    <Avatar id={m.id} name={m.name} tone="navy" />
                    <span className={s.name}>{m.name}</span>
                  </span>
                  {(m.birth || age !== null) && (
                    <span className={ui.muted} style={{ whiteSpace: 'nowrap' }}>
                      {m.birth && `${birthLabel(m.birth)} · `}
                      {age !== null && `${age}세`}
                    </span>
                  )}
                </div>
                {warn && <span className={cx(ui.badge, act.stale ? st.staleBadge : ui.badgeMuted)}>{warn}</span>}
                <TagList tags={m.tags} />
                <AssignRow mid={m.id} onPick={() => setAssigning(m)} />
                <div className={s.codeRow}>
                  <span className={cx(ui.small, s.codeLabel)}>개인 번호</span>
                  <CopyCode code={m.code} label="개인 번호" className={s.code} />
                </div>
                <div className={s.codeRow}>
                  <span className={cx(ui.small, s.codeLabel)}>보호자 번호</span>
                  <CopyCode code={m.guardianCode ?? ''} label="보호자 번호" className={cx(s.code, s.codeGuardian)} />
                </div>
                <div style={{ fontSize: '0.9375rem', color: 'var(--ink-2)' }}>
                  운동 기록 {data.ex.filter((e) => e.mid === m.id).length}건 · 식사 기록 {data.meals.filter((e) => e.mid === m.id).length}건
                  {act.last && ` · 최근 ${act.last === today ? '오늘' : md(act.last)}`}
                </div>
                <TodayNutri meals={data.meals.filter((e) => e.mid === m.id && e.date === today)} />
                <div className={s.cardActions}>
                  <button type="button" className={cx(ui.btnSmall, s.viewBtn)} onClick={() => openRecord(m.id)}>
                    기록 보기 · 한마디
                  </button>
                  <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline)} onClick={() => setMore(m)} aria-haspopup="dialog">
                    더보기
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className={s.accountRow}>
        <button type="button" className={ui.btnGhost} onClick={() => setNoticeOpen(true)}>
          {data.notices.length > 0 ? `공지사항 (${data.notices.length})` : '공지사항 올리기'}
        </button>
        <button type="button" className={ui.btnGhost} onClick={() => setChatOpen(true)}>
          대화 기록 보기
        </button>
        <button type="button" className={ui.btnGhost} onClick={() => setTestItemsOpen(true)}>
          체력 측정 항목 관리{data.testItems.length > 0 && ` (${data.testItems.length})`}
        </button>
        <button type="button" className={ui.btnGhost} onClick={() => setFoodOpen(true)}>
          음식 목록 관리{foodRequests > 0 && ` (새 음식 ${foodRequests})`}
        </button>
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
      {foodOpen && <FoodManage onClose={() => setFoodOpen(false)} onChanged={setFoodRequests} />}
      {noticeOpen && <NoticeManage color="navy" onClose={() => setNoticeOpen(false)} />}
      {testItemsOpen && <TestItemManage onClose={() => setTestItemsOpen(false)} />}
      {myPhoto && staffId && <PhotoSheet target={{ kind: 'admin', id: staffId }} name={staffName} title="내 사진" tone="navy" onClose={() => setMyPhoto(false)} />}
      {photoMember && <PhotoSheet target={{ kind: 'member', id: photoMember.id }} name={`${photoMember.name} 님`} tone="navy" onClose={() => setPhotoMember(null)} />}
      {assigning && <AssignSheet member={assigning} onClose={() => setAssigning(null)} />}
      {chatOpen && (
        <Sheet title="대화 기록" onClose={() => setChatOpen(false)}>
          <ChatList mode="admin" chat={adminChat} heading={false} />
        </Sheet>
      )}
      {chatWith && <ChatScreen mid={chatWith.id} name={chatWith.name} mode="admin" ring={adminChat.ring} onClose={() => setChatWith(null)} />}
      {more && (
        <MoreSheet
          member={more}
          full={tile}
          onView={() => openRecord(more.id)}
          onAssign={() => setAssigning(more)}
          onChat={() => setChatWith(more)}
          onClose={() => setMore(null)}
          onBirth={() => setEditingBirth(more.id)}
          onPhoto={() => setPhotoMember(more)}
          onTags={() => setTagging(more)}
          onExport={() => setExporting(more.id)}
          onNewCode={() => void newCode(more.id)}
          onNewGuardianCode={() => void newGuardianCode(more.id)}
          onDelete={() => void delMember(more.id)}
        />
      )}
      {exporting && (
        <ExportSheet color="navy" initialMid={exporting === 'all' ? undefined : exporting} onClose={() => setExporting(null)} />
      )}
    </Layout>
  );
}

interface MoreProps {
  member: Member;
  /** 격자에서 열었을 때: 목록 카드에 있던 기록 보기·담당·번호·기록 수도 보여준다 */
  full?: boolean;
  onView: () => void;
  onAssign: () => void;
  onClose: () => void;
  onBirth: () => void;
  onPhoto: () => void;
  onChat: () => void;
  onTags: () => void;
  onExport: () => void;
  onNewCode: () => void;
  onNewGuardianCode: () => void;
  onDelete: () => void;
}

/** 이용자 카드의 「더보기」: 자주 쓰지 않는 기능과 되돌릴 수 없는 기능 (번호 새로 발급·삭제는 두 번 눌러야 실행) */
function MoreSheet({ member, full, onView, onAssign, onClose, onBirth, onPhoto, onChat, onTags, onExport, onNewCode, onNewGuardianCode, onDelete }: MoreProps) {
  const confirm = useConfirm();
  const then = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const twice = (key: string, fn: () => void) => () => confirm.tap(key, then(fn));
  return (
    <Sheet title={`${member.name} 님`} onClose={onClose}>
      {full && <MemberSummary member={member} onView={then(onView)} onAssign={then(onAssign)} />}
      <div className={cx(s.moreList, full && ui.divided)}>
        <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline, s.moreBtn)} onClick={then(onPhoto)}>
          사진 등록·바꾸기
        </button>
        <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline, s.moreBtn)} onClick={then(onChat)}>
          대화 기록 보기
        </button>
        <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline, s.moreBtn)} onClick={then(onBirth)}>
          {member.birth ? '생년월일 수정' : '생년월일 입력'}
        </button>
        <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline, s.moreBtn)} onClick={then(onTags)}>
          # 해시태그 편집
        </button>
        <button type="button" className={cx(ui.btnSmall, ui.btnNavyOutline, s.moreBtn)} onClick={then(onExport)}>
          기록 내려받기 (엑셀)
        </button>
      </div>
      <div className={cx(ui.divided, s.moreList)}>
        <span className={ui.small}>번호를 새로 발급하면 예전 번호로는 들어올 수 없어요.</span>
        <ConfirmButton armed={confirm.pending === 'c'} onClick={twice('c', onNewCode)} label="새 개인 번호 발급" confirmLabel="한 번 더 누르면 새 번호" wide />
        <ConfirmButton armed={confirm.pending === 'g'} onClick={twice('g', onNewGuardianCode)} label="새 보호자 번호 발급" confirmLabel="한 번 더 누르면 새 번호" wide />
      </div>
      <div className={cx(ui.divided, s.moreList)}>
        <span className={ui.small}>삭제하면 이 분의 기록이 모두 지워지고 되돌릴 수 없어요.</span>
        <ConfirmButton armed={confirm.pending === 'd'} onClick={twice('d', onDelete)} label="이용자 삭제" danger wide />
      </div>
    </Sheet>
  );
}

/** 격자에서 연 더보기 창 위쪽: 목록 카드의 내용 (나이·담당·번호·기록 수·기록 보기) */
function MemberSummary({ member: m, onView, onAssign }: { member: Member; onView: () => void; onAssign: () => void }) {
  const { data, today } = useApp();
  const age = ageOf(m, today);
  const act = activityOf(data, m.id, today);
  const warn = staleText(act);
  return (
    <>
      {(m.birth || age !== null) && (
        <span className={ui.muted}>
          {m.birth && `${birthLabel(m.birth)} · `}
          {age !== null && `${age}세`}
        </span>
      )}
      {warn && <span className={cx(ui.badge, act.stale ? st.staleBadge : ui.badgeMuted)}>{warn}</span>}
      <AssignRow mid={m.id} onPick={onAssign} />
      <div className={s.codeRow}>
        <span className={cx(ui.small, s.codeLabel)}>개인 번호</span>
        <CopyCode code={m.code} label="개인 번호" className={s.code} />
      </div>
      <div className={s.codeRow}>
        <span className={cx(ui.small, s.codeLabel)}>보호자 번호</span>
        <CopyCode code={m.guardianCode ?? ''} label="보호자 번호" className={cx(s.code, s.codeGuardian)} />
      </div>
      <div style={{ fontSize: '0.9375rem', color: 'var(--ink-2)' }}>
        운동 기록 {data.ex.filter((e) => e.mid === m.id).length}건 · 식사 기록 {data.meals.filter((e) => e.mid === m.id).length}건
        {act.last && ` · 최근 ${act.last === today ? '오늘' : md(act.last)}`}
      </div>
      <TodayNutri meals={data.meals.filter((e) => e.mid === m.id && e.date === today)} />
      <button type="button" className={cx(ui.btn, ui.navy)} onClick={onView}>
        기록 보기 · 한마디
      </button>
    </>
  );
}

/** 이용자 카드: 담당 트레이너 (누르면 바꾸기) */
function AssignRow({ mid, onPick }: { mid: string; onPick: () => void }) {
  const { data, trainers } = useApp();
  const t = trainers.find((x) => x.id === data.assign[mid]);
  return (
    <div className={s.assignRow}>
      <span className={cx(ui.small, s.codeLabel)}>담당</span>
      <button type="button" className={cx(s.assignPick, !t && s.assignPickEmpty)} onClick={onPick} aria-haspopup="dialog">
        {t && <Avatar id={t.id} name={t.name} size="sm" tone="navy" />}
        {t ? trainerTitle(t.name, t.rank) : '담당 트레이너 정하기'}
      </button>
    </div>
  );
}

/** 이용자 카드: 오늘 먹은 영양소 (음식을 골라 기록한 식사가 있을 때만) */
function TodayNutri({ meals }: { meals: Meal[] }) {
  const n = sumMeals(meals);
  if (!n.counted) return null;
  return (
    <div className={ui.sectionHead} style={{ gap: '0.125rem' }}>
      <span className={ui.small}>오늘 먹은 영양소</span>
      <NutriLine n={n.sum} />
    </div>
  );
}
