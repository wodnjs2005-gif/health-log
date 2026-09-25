import type { Role } from '../App';

/**
 * 첫 화면 역할 버튼의 아이콘 (흰 선, 24×24).
 * 이용자=운동하는 사람, 보호자=하트가 든 방패, 트레이너=아령, 관리자=체크한 서류판
 */
export function RoleIcon({ role }: { role: Role }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="2rem"
      height="2rem"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {role === 'user' && (
        <>
          <circle cx="12" cy="4.5" r="2" />
          <path d="M5 9.5l7 1.5 7-1.5" />
          <path d="M12 11v4.5" />
          <path d="M8 21.5l4-6 4 6" />
        </>
      )}
      {role === 'guardian' && (
        <>
          <path d="M12 21.5s7.5-3.5 7.5-9.5V5.5L12 2.5 4.5 5.5V12c0 6 7.5 9.5 7.5 9.5z" />
          <path d="M12 16s-3.5-2.1-3.5-4.5a1.9 1.9 0 0 1 3.5-1 1.9 1.9 0 0 1 3.5 1c0 2.4-3.5 4.5-3.5 4.5z" />
        </>
      )}
      {role === 'trainer' && (
        <>
          <rect x="1.5" y="9" width="2.5" height="6" rx="1" />
          <rect x="4" y="6" width="3.5" height="12" rx="1" />
          <path d="M7.5 12h9" />
          <rect x="16.5" y="6" width="3.5" height="12" rx="1" />
          <rect x="20" y="9" width="2.5" height="6" rx="1" />
        </>
      )}
      {role === 'admin' && (
        <>
          <rect x="5" y="4" width="14" height="18" rx="2" />
          <path d="M9 2.5h6v3H9z" />
          <path d="M9 13l2 2 4-4.5" />
        </>
      )}
    </svg>
  );
}
