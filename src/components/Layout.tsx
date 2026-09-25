import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../AppContext';
import { FONT_SIZES } from '../hooks/useFontSize';
import { cx } from '../lib/cx';
import s from './Layout.module.css';
import ui from '../styles/ui.module.css';

interface LayoutProps {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  /** 헤더 아래 줄 (이용자 화면의 날짜 이동) */
  headerExtra?: ReactNode;
  /** 화면 아래 고정 영역 (이용자 탭바) */
  bottom?: ReactNode;
  children: ReactNode;
}

export function Layout({ title, onBack, backLabel = '처음', headerExtra, bottom, children }: LayoutProps) {
  return (
    <div className={cx(s.shell, bottom ? s.withTabs : undefined)}>
      <header className={s.header}>
        <HeaderTop title={title} onBack={onBack} backLabel={backLabel} />
        {headerExtra}
      </header>
      <main className={s.main}>{children}</main>
      {bottom}
    </div>
  );
}

function HeaderTop({ title, onBack, backLabel }: { title: string; onBack?: () => void; backLabel: string }) {
  const { fs, setFs } = useApp();
  const rowRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);

  // 글자 크기 버튼이 다음 줄로 넘어갔는지 확인
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const check = () => {
      const [a, b] = Array.from(row.children) as HTMLElement[];
      if (a && b) setStacked(b.offsetTop > a.offsetTop + 4);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(row);
    return () => ro.disconnect();
  }, [fs, title]);

  return (
    <div ref={rowRef} className={s.top} data-stacked={stacked}>
      <div className={s.titleGroup}>
        {onBack && (
          <button type="button" className={s.back} onClick={onBack}>
            ‹ {backLabel}
          </button>
        )}
        <h1 className={s.title}>
          {title}
        </h1>
      </div>
      <div className={s.fsGroup}>
        <div className={s.fsLabel} aria-hidden="true">
          글자 크기
        </div>
        <div role="group" aria-label="글자 크기" className={s.fsButtons}>
          {FONT_SIZES.map((o, i) => (
            <button
              key={o.pct}
              type="button"
              className={s.fsBtn}
              style={{ fontSize: o.size }}
              aria-label={o.aria}
              aria-pressed={fs === i}
              onClick={() => setFs(i)}
            >
              가
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Loading({ text = '불러오는 중…' }: { text?: string }) {
  return <div className={s.loading}>{text}</div>;
}

export function Toast({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div role="status" aria-live="polite" className={s.toast}>
      {text}
    </div>
  );
}

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** 아래에서 올라오는 창. 바깥을 누르거나 닫기·Esc 로 닫힌다. */
export function Sheet({ title, onClose, children }: SheetProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className={s.scrim} onClick={onClose}>
      <div
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.sheetHead}>
          <h2 className={s.sheetTitle}>
            {title}
          </h2>
          <button type="button" className={ui.btnSmall} onClick={onClose}>
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
