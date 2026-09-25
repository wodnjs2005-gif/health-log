/** 트레이너 직급 (예: 팀장, 선임 트레이너). 보여주기용이며 권한과는 상관없다 */
export const RANK_MAX_LEN = 20;

/** 앞뒤·연속 공백 정리, 20자까지 (서버 _norm_rank 와 같게) */
export const normRank = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').slice(0, RANK_MAX_LEN);

/** 화면 제목 등에 쓰는 이름: '김코치 팀장', 직급이 없으면 '김코치 트레이너' */
export const trainerTitle = (name: string, rank?: string) => `${name} ${normRank(rank) || '트레이너'}`;
