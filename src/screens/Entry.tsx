import type { Role } from '../App';
import { Layout } from '../components/Layout';
import { RoleIcon } from '../components/RoleIcon';
import s from './screens.module.css';

const ROLES: { role: Role; label: string; desc: string; color: string }[] = [
  { role: 'user', label: '이용자', desc: '받은 번호로 들어가 내 운동과 식사를 기록해요', color: 'var(--green)' },
  { role: 'guardian', label: '보호자', desc: '가족의 식사와 운동 기록을 볼 수 있어요', color: 'var(--plum)' },
  { role: 'trainer', label: '트레이너', desc: '받은 트레이너 번호로 들어가 이용자 기록을 확인해요', color: 'var(--orange)' },
  { role: 'admin', label: '관리자', desc: '이용자와 트레이너를 등록하고 번호를 발급해요', color: 'var(--navy)' },
];

/** dev: 개발용 가짜 서버로 띄웠을 때만 true (배포에서는 항상 false) */
export function Entry({ dev, onPick }: { dev: boolean; onPick: (r: Role) => void }) {
  return (
    <Layout title="나의 건강일지">
      <div className={s.hero}>
        <h2 className={s.heroTitle}>어떻게 들어오시나요?</h2>
        <div className={s.heroSub}>해당하는 버튼을 눌러주세요.</div>
      </div>
      {ROLES.map((r) => (
        <button
          key={r.role}
          type="button"
          className={s.role}
          style={{ '--c': r.color } as React.CSSProperties}
          onClick={() => onPick(r.role)}
        >
          <div className={s.roleIcon}>
            <RoleIcon role={r.role} />
          </div>
          <div className={s.roleText}>
            <div className={s.roleLabel}>{r.label}</div>
            <div className={s.roleDesc}>{r.desc}</div>
          </div>
          <div className={s.roleChev} aria-hidden="true">
            ›
          </div>
        </button>
      ))}
      {dev && (
        <div className={s.demoNote}>
          <b>개발용 가짜 서버</b> · npm run dev 에서만 보이는 화면이에요. 데이터는 이 브라우저에만 저장돼요.
        </div>
      )}
    </Layout>
  );
}
