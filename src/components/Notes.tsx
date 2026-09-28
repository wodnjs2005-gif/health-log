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
 * 트레이너 한마디. 최근 1개를 보여주고 「지난 한마디 더 보기」로 5개까지.
 * 이용자 오늘 화면·보호자 화면에서 쓴다 (한마디가 없으면 아무것도 그리지 않는다).
 */
export function NoteCard({ mid }: { mid: string }) {
  const { data } = useApp();
  const [open, setOpen] = useState(false);
  const list = latestFirst(data.notes, mid);
  if (!list.length) return null;
  const shown = open ? list.slice(0, 5) : list.slice(0, 1);
  return (
    <section className={s.noteCard}>
      <h2 className={s.noteTitle}>
        <Icon />
        트레이너 한마디
      </h2>
      {shown.map((n) => (
        <NoteItem key={n.id} n={n} />
      ))}
      {list.length > 1 && (
        <button type="button" className={s.more} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? '접기' : `지난 한마디 더 보기 (${Math.min(list.length, 5) - 1}개)`}
        </button>
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
    <section className={s.noteCard}>
      <h3 className={s.noteTitle}>
        <Icon />
        한마디 남기기
      </h3>
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
              action={<ConfirmButton armed={confirm.pending === 'n' + n.id} onClick={() => del(n.id)} label="지우기" confirmLabel="한 번 더 누르면 지워요" />}
            />
          ))}
          {list.length > 3 && (
            <button type="button" className={s.more} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? '접기' : `모두 보기 (${list.length}개)`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
