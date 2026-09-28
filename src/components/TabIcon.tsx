export type TabIconName = 'home' | 'ex' | 'meal' | 'video' | 'stats' | 'chat';

/** 아래 탭 그림 (글자와 함께 보여준다) */
export function TabIcon({ name }: { name: TabIconName }) {
  return (
    <svg viewBox="0 0 24 24" width="1.625em" height="1.625em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'home' && (
        <>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v9.5h13V10" />
          <path d="M10 19.5v-5h4v5" />
        </>
      )}
      {name === 'ex' && (
        <>
          <circle cx="13.5" cy="4.5" r="2" />
          <path d="M9 21l3-6 3 2v4" />
          <path d="M7 12l3-4.5h4l2.5 4 3 1" />
          <path d="M12 15l-1.5-4" />
        </>
      )}
      {name === 'chat' && (
        <>
          <path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z" />
          <path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01" />
        </>
      )}
      {name === 'meal' && (
        <>
          <path d="M3 12h18a9 9 0 0 1-18 0z" />
          <path d="M8 8c0-1.5 1-2 1-3.5M12 8c0-1.5 1-2 1-3.5M16 8c0-1.5 1-2 1-3.5" />
        </>
      )}
      {name === 'video' && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" />
        </>
      )}
      {name === 'stats' && (
        <>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </>
      )}
    </svg>
  );
}
