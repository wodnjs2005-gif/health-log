export const LS = {
  fs: 'healthlog.fs',
  code: 'healthlog.code',
  /** 보호자 번호 목록 (JSON 배열) */
  guardian: 'healthlog.guardian',
  /** 관리자·트레이너 로그인 표 (비밀번호·번호는 저장하지 않는다) */
  admin: 'healthlog.admin',
  trainer: 'healthlog.trainer',
  /** 「바탕화면에 추가하기」 안내를 닫았음 */
  installHide: 'healthlog.installHide',
  /** 트레이너 이용자 목록 보기: 'tile' 이면 타일 (없으면 목록) */
  memberView: 'healthlog.memberView',
  /** 목록·격자 보기 (뒤에 화면 이름을 붙인다: videos · lessons · trainers · members · chat). 'tile' 이면 격자 */
  view: 'healthlog.view.',
  /** 트레이너 「내 담당」만 보기: 'on' / 'off' (없으면 담당이 있을 때 켬) */
  mineOnly: 'healthlog.mineOnly',
  /** 예전 공용 비밀번호·체험 모드 데이터 (앱을 열 때 지운다) */
  legacy: ['healthlog.staff', 'healthlog.v1'],
} as const;

export const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 저장 공간이 막힌 브라우저 */
  }
};

export const lsDel = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* 무시 */
  }
};
