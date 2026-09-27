import { useState } from 'react';
import { useApp } from '../AppContext';
import { cx } from '../lib/cx';
import { platform, useInstall } from '../lib/install';
import { LS, lsGet, lsSet } from '../lib/storage';
import ui from '../styles/ui.module.css';
import s from './cards.module.css';

/** 방법 안내 (브라우저마다 메뉴 위치가 다르다) */
function Steps() {
  const p = platform();
  if (p === 'kakao')
    return (
      <ol className={s.steps}>
        <li>
          카카오톡 화면 오른쪽 아래(또는 위)의 <b>⋮</b> 또는 <b>공유</b> 버튼을 누르세요.
        </li>
        <li>
          <b>다른 브라우저로 열기</b>를 누르세요.
        </li>
        <li>열린 인터넷 창에서 이 안내를 다시 따라 하세요.</li>
      </ol>
    );
  if (p === 'ios')
    return (
      <ol className={s.steps}>
        <li>
          사파리 화면 아래의 <b>공유 버튼(네모에 위쪽 화살표)</b>을 누르세요.
        </li>
        <li>
          목록을 올려 <b>홈 화면에 추가</b>를 누르세요.
        </li>
        <li>
          오른쪽 위 <b>추가</b>를 누르면 바탕화면에 「맞춤 건강관리」 아이콘이 생겨요.
        </li>
      </ol>
    );
  if (p === 'samsung')
    return (
      <ol className={s.steps}>
        <li>
          화면 아래의 <b>≡ (메뉴)</b> 버튼을 누르세요.
        </li>
        <li>
          <b>현재 페이지 추가</b> → <b>홈 화면</b>을 누르세요.
        </li>
      </ol>
    );
  return (
    <ol className={s.steps}>
      <li>
        화면 오른쪽 위의 <b>⋮ (점 세 개)</b> 버튼을 누르세요.
      </li>
      <li>
        <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 누르세요.
      </li>
    </ol>
  );
}

/**
 * 「휴대폰 바탕화면에 추가하기」 안내. 이미 아이콘으로 열었거나 「다음에 할게요」를 누르면 보이지 않는다.
 * 크롬에서는 버튼 하나로 설치 창을 띄우고, 다른 브라우저는 메뉴 위치를 알려준다.
 */
export function InstallCard({ color = 'green' }: { color?: 'green' | 'orange' }) {
  const { toast } = useApp();
  const { canPrompt, installed, prompt } = useInstall();
  const [hidden, setHidden] = useState(() => lsGet(LS.installHide) === '1');
  const [showSteps, setShowSteps] = useState(false);
  if (installed || hidden) return null;

  const hide = () => {
    lsSet(LS.installHide, '1');
    setHidden(true);
  };

  const install = async () => {
    if (!canPrompt) return setShowSteps(true);
    if (await prompt()) toast('바탕화면에 추가했어요');
  };

  return (
    <section className={s.install} style={color === 'orange' ? { borderColor: 'var(--orange)' } : undefined} aria-label="바탕화면에 추가하기">
      <div className={s.installHead}>
        <img className={s.installIcon} src="/icon-192.png" alt="" />
        <div className={ui.sectionHead} style={{ gap: '0.125rem', minWidth: 0 }}>
          <h2 className={s.installTitle}>휴대폰 바탕화면에 추가하기</h2>
          <span className={ui.small}>다음부터 아이콘만 누르면 바로 열려요.</span>
        </div>
      </div>
      {(showSteps || !canPrompt) && <Steps />}
      <div className={s.installActions}>
        {canPrompt && (
          <button type="button" className={cx(ui.btn, color === 'orange' ? ui.orange : ui.green)} onClick={() => void install()}>
            바탕화면에 추가
          </button>
        )}
        <button type="button" className={ui.btnGhost} onClick={hide}>
          {canPrompt ? '다음에 할게요' : '다 했어요 · 닫기'}
        </button>
      </div>
    </section>
  );
}
