import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { Backend, DataSet, StaffRole, Trainer } from './lib/backend';
import type { GuardianLink } from './lib/guardian';

export interface AppCtx {
  be: Backend;
  today: string;
  data: DataSet;
  setData: Dispatch<SetStateAction<DataSet>>;
  /** 로그인한 이용자의 번호와 member id (이용자 화면에서만) */
  userCode: string;
  me: string | null;
  /** 로그인 표 (트레이너·관리자 화면에서만). 모든 직원 기능에 넘긴다 */
  staffToken: string;
  /** 로그인한 트레이너·관리자 이름 */
  staffName: string;
  /** 트레이너 직급 (없으면 '') */
  staffRank: string;
  /** 직원 화면: 'admin' / 'trainer' (이용자·보호자 화면에서는 null) */
  staffRole: StaffRole | null;
  /** 로그인한 트레이너 id (자기 사진) */
  staffId: string;
  /** 이용자·트레이너 사진 (data URL). 없거나 아직 못 받았으면 undefined */
  photoOf: (id: string | null | undefined) => string | undefined;
  /** 사진을 올리거나 지운 뒤 화면에 바로 반영 (version·data 가 null 이면 지움) */
  setPhotoLocal: (id: string, version: string | null, data: string | null) => void;
  /** 트레이너 목록 (관리자 화면에서만) */
  trainers: Trainer[];
  setTrainers: Dispatch<SetStateAction<Trainer[]>>;
  /** 보호자가 보고 있는 사람들 (보호자 화면에서만) */
  guardians: GuardianLink[];
  /** 보호자 번호로 한 사람 더 추가. 성공하면 그 사람의 id, 실패하면 오류 문구 */
  addGuardian: (code: string) => Promise<{ mid: string } | { error: string }>;
  removeGuardian: (mid: string) => void;
  toast: (msg: string) => void;
  /** 번호가 무효이거나 로그인이 끝났으면 로그인 화면으로, 아니면 '저장하지 못했어요' 토스트 */
  fail: (e: unknown) => void;
  refresh: () => Promise<void>;
  logout: () => void;
  /** ‹ 처음: 불러온 데이터는 비우고, 저장된 로그인 정보는 남긴다 */
  goEntry: () => void;
  fs: number;
  setFs: (i: number) => void;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp() {
  const v = useContext(AppContext);
  if (!v) throw new Error('AppContext 밖에서 사용');
  return v;
}

export const scrollTop = () => {
  try {
    window.scrollTo(0, 0);
  } catch {
    /* 무시 */
  }
};
