/** 'yt' = 유튜브, 'file' = 개발용 가짜 서버가 브라우저에 저장한 파일, 'url' = 서버(Storage)에 올린 파일 */
export type ProgramSrc = 'yt' | 'file' | 'url';

export interface Member {
  id: string;
  name: string;
  /** 예전에 나이만 입력해 둔 이용자용. 새 이용자는 birth 로 나이를 계산한다 (lib/age.ts) */
  age: number | null;
  /** 생년월일 YYYY-MM-DD */
  birth?: string | null;
  code: string;
  /** 보호자 번호. 관리자 화면에만 내려온다 */
  guardianCode?: string;
  /** 해시태그 (# 없이 저장). 직원 화면에만 내려온다 */
  tags?: string[];
}

/** 보호자에게 보내는 이용자 정보 (개인 번호 없음) */
export type PublicMember = Pick<Member, 'id' | 'name' | 'age' | 'birth'>;

export interface Exercise {
  id: string;
  mid: string;
  date: string;
  kind: string;
  min: number;
  level: string;
  memo: string;
  pid?: string | null;
}

/** 칼로리(kcal)·탄수화물(g)·단백질(g)·지방(g)·나트륨(mg) */
export interface Nutri {
  kcal: number;
  carb: number;
  prot: number;
  fat: number;
  na: number;
}

/** 식사에 고른 음식. 목록에서 고르면 1인분 영양소가 있고, 직접 쓴 음식은 이름만 있다 */
export type MealFood = { n: string } & Partial<Nutri>;

export interface Meal {
  id: string;
  mid: string;
  date: string;
  meal: string;
  /** 음식 이름들 (예전 기록은 직접 쓴 글) */
  menu: string;
  amount: string;
  memo: string;
  foods?: MealFood[];
  /** 이 식사의 합계 (양 반영). 음식을 목록에서 고르지 않은 기록은 없음 */
  nutri?: Nutri | null;
}

export interface Program {
  id: string;
  title: string;
  /** 예전 '진행 방식(1:1/그룹)'. 지금은 쓰지 않고 대상 이용자(mids)로만 구분한다 */
  type?: string | null;
  kind: string;
  min: number;
  memo: string;
  date: string;
  src: ProgramSrc;
  ytId: string | null;
  videoKey?: string | null;
  videoUrl?: string | null;
  videoName: string;
  mids: string[];
}

export interface View {
  id: string;
  pid: string;
  mid: string;
  date: string;
}

/** 수업 (예: 오전 체조). 요일마다 출석을 체크한다 */
export interface Lesson {
  id: string;
  name: string;
  /** 0=일 1=월 … 6=토 (Date.getDay 와 같음) */
  days: number[];
  createdAt: string;
  /** 대상 이용자와 넣은 날짜. 이용자·보호자에게는 본인 것만 온다 */
  roster: { mid: string; since: string }[];
}

/** 출석한 날 (체크가 없으면 결석) */
export interface Attendance {
  lid: string;
  mid: string;
  date: string;
}

/** 휴강한 날 (출석률 계산에서 빠진다) */
export interface OffDay {
  lid: string;
  date: string;
}

export interface NewLesson {
  name: string;
  days: number[];
  mids: string[];
}

export interface DataSet {
  members: Member[];
  ex: Exercise[];
  meals: Meal[];
  programs: Program[];
  views: View[];
  lessons: Lesson[];
  attendance: Attendance[];
  offdays: OffDay[];
}

/**
 * 서버에서 받은 묶음을 화면용 DataSet 으로. 빠진 목록은 빈 목록으로 채운다
 * (새 SQL 을 아직 실행하지 않은 서버는 수업·출석을 보내지 않는다).
 */
export const toDataSet = (members: Member[], d: Partial<Omit<DataSet, 'members'>>): DataSet => ({
  members,
  ex: d.ex || [],
  meals: d.meals || [],
  programs: d.programs || [],
  views: d.views || [],
  lessons: d.lessons || [],
  attendance: d.attendance || [],
  offdays: d.offdays || [],
});

export interface UserData extends Omit<DataSet, 'members'> {
  member: Member;
}

/** 보호자가 받는 읽기 전용 데이터 */
export interface GuardianData extends Omit<DataSet, 'members'> {
  member: PublicMember;
}

export interface NewExercise {
  date: string;
  kind: string;
  min: number;
  level: string;
  memo: string;
}

export interface NewMeal {
  date: string;
  meal: string;
  menu: string;
  amount: string;
  memo: string;
  foods: MealFood[];
  nutri: Nutri | null;
}

export interface NewProgram {
  title: string;
  mids: string[];
  kind: string;
  min: number;
  memo: string;
  ytId: string | null;
}

export type StaffRole = 'admin' | 'trainer';

/** 트레이너 (관리자 화면에만 번호가 내려온다) */
export interface Trainer {
  id: string;
  name: string;
  /** 직급 (예: 팀장). 보여주기용이며 권한과는 상관없다. 없으면 '' */
  rank?: string;
  code: string;
  createdAt: string;
}

/** 로그인하면 받는 표. 비밀번호·번호 대신 이것만 기기에 저장한다 */
export interface StaffSession {
  token: string;
  role: StaffRole;
  name: string;
  /** 트레이너 직급 */
  rank?: string;
}

export type AdminLoginResult =
  | { ok: true; session: StaffSession }
  | { ok: false; error: 'invalid'; left?: number }
  | { ok: false; error: 'locked'; until: string };

/** 직원(관리자·트레이너) 화면 데이터. 관리자에게만 번호와 트레이너 목록이 들어 있다 */
export interface StaffData extends DataSet {
  me: { role: StaffRole; name: string; rank?: string };
  trainers?: Trainer[] | null;
}

export interface Backend {
  /** server = Supabase, dev = 개발용 가짜 서버 (npm run dev 에서만) */
  mode: 'server' | 'dev';
  /** 개발용 가짜 서버의 로그인 안내 (서버 모드에서는 null) */
  devHints(): Promise<{ user: string; guardian: string; trainer: string; admin: string } | null>;

  /** 번호가 맞지 않으면 null */
  userGet(code: string): Promise<UserData | null>;
  userAddEx(code: string, r: NewExercise): Promise<Exercise>;
  userAddMeal(code: string, r: NewMeal): Promise<Meal>;
  userDelEx(code: string, id: string): Promise<void>;
  userDelMeal(code: string, id: string): Promise<void>;
  userAddView(code: string, pid: string, date: string): Promise<{ view: View; ex: Exercise }>;
  /** 보호자 번호로 읽기 전용 데이터. 번호가 맞지 않으면 null */
  guardianGet(code: string): Promise<GuardianData | null>;

  // 로그인 (token 은 staffGet 이하 모든 직원 함수에 넘긴다)
  adminLogin(loginId: string, pw: string): Promise<AdminLoginResult>;
  /** 번호가 맞지 않으면 null */
  trainerLogin(code: string): Promise<StaffSession | null>;
  staffLogout(token: string): Promise<void>;
  /** 성공하면 null, 실패하면 이유 */
  adminChangePassword(token: string, oldPw: string, newPw: string): Promise<null | 'wrong' | 'short'>;

  /** 로그인이 끝났거나(기간·번호 재발급·계정 삭제) 표가 틀리면 null */
  staffGet(token: string): Promise<StaffData | null>;
  // 관리자만
  /** birth: 생년월일 YYYY-MM-DD */
  staffAddMember(token: string, name: string, birth: string): Promise<Member>;
  staffDelMember(token: string, id: string): Promise<void>;
  /** 이미 등록된 이용자의 생년월일 입력·수정 (YYYY-MM-DD) */
  staffSetBirth(token: string, id: string, birth: string): Promise<void>;
  staffNewCode(token: string, id: string): Promise<string>;
  staffNewGuardianCode(token: string, id: string): Promise<string>;
  adminAddTrainer(token: string, name: string, rank: string): Promise<Trainer>;
  /** 직급 바꾸기. 정리된 직급을 돌려준다 */
  adminSetTrainerRank(token: string, id: string, rank: string): Promise<string>;
  /** 새 번호를 발급하면 그 트레이너의 로그인은 끝난다 */
  adminNewTrainerCode(token: string, id: string): Promise<string>;
  adminDelTrainer(token: string, id: string): Promise<void>;
  // 관리자·트레이너
  /** 해시태그 바꾸기. 정리된(# 뺀·중복 없는) 목록을 돌려준다 */
  staffSetTags(token: string, id: string, tags: string[]): Promise<string[]>;
  staffAddProgram(token: string, p: NewProgram, file: File | null): Promise<Program>;
  staffDelProgram(token: string, id: string): Promise<void>;
  /** 이미 등록한 영상의 대상 이용자 바꾸기. 저장된 대상 목록을 돌려준다 */
  staffSetProgramMembers(token: string, id: string, mids: string[]): Promise<string[]>;
  videoUrl(p: Program): Promise<{ url: string; revoke?: boolean } | null>;
  // 수업·출석 (관리자·트레이너)
  staffAddLesson(token: string, l: NewLesson): Promise<Lesson>;
  staffUpdateLesson(token: string, id: string, l: NewLesson): Promise<Lesson>;
  staffDelLesson(token: string, id: string): Promise<void>;
  /** present=false 면 출석 취소(결석) */
  staffSetAttendance(token: string, lid: string, mid: string, date: string, present: boolean): Promise<void>;
  /** off=true 면 그날 휴강 */
  staffSetOffday(token: string, lid: string, date: string, off: boolean): Promise<void>;
}

/** 번호가 무효이거나 로그인이 끝났을 때 던지는 오류. 화면에서는 로그인 화면으로 돌려보낸다. */
export class AuthError extends Error {
  readonly auth = true;
  constructor(message = 'auth') {
    super(message);
    this.name = 'AuthError';
  }
}

export const isAuthError = (e: unknown): boolean =>
  !!e && typeof e === 'object' && (e as { auth?: unknown }).auth === true;
