import layout from '../components/Layout.module.css';
import ui from '../styles/ui.module.css';

/**
 * 배포용 빌드에 Supabase 주소·키(VITE_SUPABASE_URL, VITE_SUPABASE_KEY)가 없을 때.
 * 체험 모드가 없으므로 앱을 쓸 수 없다는 것만 알린다. (README 3. 환경변수)
 */
export function SetupNeeded() {
  return (
    <div className={layout.shell}>
      <header className={layout.header}>
        <h1 className={layout.title}>나의 건강일지</h1>
      </header>
      <main className={layout.main}>
        <div className={ui.pageHead}>
          <h2 className={ui.h1}>서버 연결 설정이 필요해요</h2>
          <div className={ui.lead}>관리자에게 알려주세요.</div>
        </div>
        <div className={ui.note} style={{ textAlign: 'left', overflowWrap: 'anywhere' }}>
          배포할 때 VITE_SUPABASE_URL 과 VITE_SUPABASE_KEY 를 넣고 다시 빌드해야 해요. (README 3. 환경변수)
        </div>
      </main>
    </div>
  );
}
