import { useState, type ReactNode } from 'react';
import { useApp } from '../AppContext';
import { useConfirm } from '../hooks/useConfirm';
import { Avatar } from './Avatar';
import type { Note } from '../lib/backend';
import { cx } from '../lib/cx';
import { md } from '../lib/date';
import ui from '../styles/ui.module.css';
import { ConfirmButton } from './ConfirmButton';
import s from './cards.module.css';

export const NOTE_MAX = 200;
/** 자주 쓰는 말 (눌러서 입력칸에 넣고 고쳐 쓸 수 있다) */
const PHRASES = ['잘하고 계세요!', '오늘도 수고하셨어요.', '물 자주 드세요.', '무리하지 마세요.', '식사 거르지 마세요.'];

/** 최근 것 먼저 (같은 날은 나중에 쓴 것 먼저) */
const latestFirst = (list: Note[], mid: string) => {
  const mine = list.filter((n) => n.mid === mid);
  return mine.map((n, i) => ({ n, i })).sort((a, b) => b.n.date.localeCompare(a.n.date) || b.i - a.i).map((x) => x.n);
};

function Icon() {
  return (
    <svg className={s.noteIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

function NoteItem({ n, action }: { n: Note; action?: ReactNode }) {
  return (
    <div className={s.noteItem}>
      <div className={s.noteText}>{n.text}</div>
      <div className={s.noteFoot}>
        <span className={s.byline} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
          {n.byId && <Avatar id={n.byId} name={n.by} size="sm" tone="orange" />}
          {md(n.date)} · {n.by}
        </span>
        {action}
      </div>
    </div>
  );
}

/**
 * 트레이너 한마디 (한마디가 없으면 아무것도 그리지 않는다).
 * user = 이용자 오늘 화면: 아직 확인하지 않은 한마디만, 「확인했어요」를 누르면 사라진다.
 * history = 이용자 기록 탭: 지난 한마디 전체 (접었다 펼침).
 * view = 보호자 화면: 최근 1개, 「지난 한마디 더 보기」로 5개까지.
 */
export function NoteCard({ mid, mode = 'view' }: { mid: string; mode?: 'user' | 'history' | 'view' }) {
  const { be, data, setData, userCode, toast, fail } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const all = latestFirst(data.notes, mid);
  const list = mode === 'user' ? all.filter((n) => !n.seen) : all;
  if (!list.length) return null;

  if (mode === 'history') {
    const shown = list.slice(0, 20);
    return (
      <section className={cx(s.noteCard, s.noteWriter)} data-open={open}>
        <h3 className={s.noteTitle}>
          <button type="button" className={s.toggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <Icon />
            <span className={s.toggleText}>지난 트레이너 한마디</span>
            <span className={s.toggleCount}>{list.length}개</span>
            <svg className={s.chev} data-open={open} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </h3>
        {open && shown.map((n) => <NoteItem key={n.id} n={n} />)}
      </section>
    );
  }

  const seen = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ids = await be.userNoteSeen(userCode, list[0].id);
      setData((d) => ({ ...d, notes: d.notes.map((n) => (ids.includes(n.id) ? { ...n, seen: true } : n)) }));
      toast('확인했어요. 지난 한마디는 「기록」 탭에서 볼 수 있어요');
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  };

  const max = mode === 'user' ? list.length : 5;
  const shown = open ? list.slice(0, max) : list.slice(0, 1);
  return (
    <section className={s.noteCard}>
      <h2 className={s.noteTitle}>
        <Icon />
        트레이너 한마디
      </h2>
      {shown.map((n) => (
        <NoteItem key={n.id} n={n} />
      ))}
      {(list.length > 1 || mode === 'user') && (
        <div className={s.noteBottom}>
          {list.length > 1 && (
            <button type="button" className={s.more} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? '접기' : mode === 'user' ? `새 한마디 ${list.length - 1}개 더 보기` : `지난 한마디 더 보기 (${Math.min(list.length, 5) - 1}개)`}
            </button>
          )}
          {mode === 'user' && (
            // 확인: 오른쪽 아래 작은 체크 (누르는 곳은 손가락 크기)
            <button type="button" className={s.seenBtn} disabled={busy} onClick={() => void seen()} aria-label="확인했어요" title="확인했어요">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** 직원 화면: 한마디 남기기 + 남긴 한마디 목록 (지우기) */
export function NoteWriter({ mid, name, color }: { mid: string; name: string; color: 'orange' | 'navy' }) {
  const { be, data, setData, staffToken, toast, fail } = useApp();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  /** 펼침 (평소에는 접어 두어 기록이 먼저 보이게) */
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const list = latestFirst(data.notes, mid);
  const shown = showAll ? list : list.slice(0, 3);

  const save = async () => {
    const t = text.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const n = await be.staffAddNote(staffToken, mid, t);
      setData((d) => ({ ...d, notes: [...d.notes, n] }));
      setText('');
      toast(`${name} 님께 한마디를 남겼어요`);
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const del = (id: string) =>
    confirm.tap('n' + id, async () => {
      try {
        await be.staffDelNote(staffToken, id);
      } catch (e) {
        return fail(e);
      }
      setData((d) => ({ ...d, notes: d.notes.filter((x) => x.id !== id) }));
      toast('한마디를 지웠어요');
    });

  return (
    <section className={cx(s.noteCard, s.noteWriter)} data-open={open}>
      <h3 className={s.noteTitle}>
        <button type="button" className={s.toggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Icon />
          <span className={s.toggleText}>한마디 남기기</span>
          {list.length > 0 && <span className={s.toggleCount}>{list.length}개</span>}
          <svg className={s.chev} data-open={open} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </h3>
      {open && (
      <>
      <div className={ui.small}>남긴 글은 {name} 님과 보호자 화면에 보여요.</div>
      <div className={s.phrases}>
        {PHRASES.map((p) => (
          <button key={p} type="button" className={s.phrase} onClick={() => setText((v) => (v.trim() ? `${v.trim()} ${p}` : p).slice(0, NOTE_MAX))}>
            {p}
          </button>
        ))}
      </div>
      <textarea
        className={ui.textarea}
        rows={3}
        value={text}
        maxLength={NOTE_MAX}
        onChange={(e) => setText(e.target.value)}
        placeholder="예: 이번 주 걷기 잘하셨어요. 무릎 아프시면 스트레칭만 하세요."
        aria-label="한마디"
      />
      <span className={s.counter}>
        {text.length}/{NOTE_MAX}
      </span>
      <button type="button" className={cx(ui.btn, color === 'navy' ? ui.navy : ui.orange)} disabled={!text.trim() || saving} onClick={() => void save()}>
        {saving ? '남기는 중…' : '한마디 남기기'}
      </button>
      {list.length > 0 && (
        <div className={cx(ui.divided, ui.sectionHead)} style={{ gap: '0.625rem' }}>
          <span className={ui.small}>남긴 한마디 {list.length}개</span>
          {shown.map((n) => (
            <NoteItem
              key={n.id}
              n={n}
              action={
                <span className={s.noteActions}>
                  {n.seen && <span className={s.seenMark}>✓ 확인함</span>}
                  <ConfirmButton armed={confirm.pending === 'n' + n.id} onClick={() => del(n.id)} label="지우기" confirmLabel="한 번 더 누르면 지워요" />
                </span>
              }
            />
          ))}
          {list.length > 3 && (
            <button type="button" className={s.more} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? '접기' : `모두 보기 (${list.length}개)`}
            </button>
          )}
        </div>
      )}
      </>
      )}
    </section>
  );
}
