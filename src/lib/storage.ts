export const LS = {
  fs: 'healthlog.fs',
  code: 'healthlog.code',
  /** 보호자 번호 목록 (JSON 배열) */
  guardian: 'healthlog.guardian',
  /** 관리자·트레이너 로그인 표 (비밀번호·번호는 저장하지 않는다) */
  admin: 'healthlog.admin',
  trainer: 'healthlog.trainer',
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
