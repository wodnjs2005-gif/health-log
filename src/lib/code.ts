/** 헷갈리는 0·O·1·I·L 을 뺀 글자 집합 */
export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** 이용자 개인 번호·보호자 번호 */
export const CODE_LEN = 6;
/** 트레이너 번호: 직원 화면에 들어가므로 더 길게 (추측하기 어렵게) */
export const TRAINER_CODE_LEN = 8;

export const genCode = () => {
  const a = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
};

/** 대문자로 바꾸고 영문·숫자 외 글자는 지운다 */
export const normCode = (c: unknown) =>
  String(c ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
