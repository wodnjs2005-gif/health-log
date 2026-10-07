// 개발용 가짜 서버: `npm run dev` 에서 Supabase 설정이 없을 때만 쓴다. 배포용 빌드에는 들어가지 않는다 (index.ts).
// 서버(supabase/migrations)와 같은 규칙으로 동작한다: 로그인 표, 관리자 잠금, 관리자 전용 기능, 트레이너 번호.
// 데이터는 이 브라우저의 localStorage, 영상 파일은 IndexedDB 에만 저장된다.
import { CODE_CHARS, genCode, normCode } from '../code';
import { addDays, todayYmd } from '../date';
import { validMeasure } from '../measures';
import { mealNutri, roundNutri } from '../nutrition';
import { normRank, trainerTitle } from '../rank';
import { normTags, TAGS_PER_MEMBER } from '../tags';
import {
  AuthError,
  guardianPhotoId,
  LimitError,
  type Backend,
  type DataSet,
  type ChatMessage,
  type ChatRange,
  type CustomFood,
  type Exercise,
  type Lesson,
  type Meal,
  type Measure,
  type Member,
  type NewMeasure,
  type Note,
  type Notice,
  type TestCategory,
  type TestItem,
  type TestResult,
  type Program,
  type PublicMember,
  type StaffRole,
  type Trainer,
  type UserData,
  type View,
} from './types';

const KEY = 'healthlog.dev';
const DEV_ADMIN = { loginId: 'admin', pw: 'admin1234' };
const LOCK_AFTER = 5;
const LOCK_MIN = 10;
const HOURS = { admin: 12, trainer: 24 * 30 } as const;

interface DevAdmin {
  id: string;
  loginId: string;
  name: string;
  pw: string;
  failed: number;
  lockedUntil: string | null;
}

interface DevSession {
  token: string;
  role: StaffRole;
  subject: string;
  expires: string;
}

interface DevDB extends DataSet {
  customFoods: CustomFood[];
  chat: ChatMessage[];
  /** 이용자가 대화를 마지막으로 본 때 (mid → ISO) */
  chatSeen: Record<string, string>;
  /** 트레이너가 이용자 대화를 마지막으로 본 때 ('tid|mid' → ISO) */
  chatReads: Record<string, string>;
  /** 사진 자체 (DataSet.photos 는 버전만) */
  photoData: Record<string, string>;
  admins: DevAdmin[];
  trainers: Trainer[];
  sessions: DevSession[];
}

const uid = (n = 10) => {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(36)).join('').slice(0, n);
};

const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

const genTrainerCode = () => {
  const a = new Uint32Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
};

// --- IndexedDB (영상 파일) ---------------------------------------------------
const idbOpen = () =>
  new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('healthlog-media', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('videos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

const idbDo = async <T>(mode: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest<T>) => {
  const db = await idbOpen();
  return new Promise<T>((res, rej) => {
    const tx = db.transaction('videos', mode);
    const req = fn(tx.objectStore('videos'));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
};

// --- 예시 데이터 -------------------------------------------------------------
/** 개인 번호·보호자 번호 모두와 겹치지 않는 새 번호 */
const uniqueCode = (members: Member[]) => {
  let c: string;
  do c = genCode();
  while (members.some((x) => x.code === c || x.guardianCode === c));
  return c;
};

function seed(): DevDB {
  const today = todayYmd();
  const members: Member[] = [];
  const add = (id: string, name: string, birth: string, tags: string[]) => {
    const code = uniqueCode(members);
    members.push({ id, name, age: null, birth, code, guardianCode: '', tags });
    members[members.length - 1].guardianCode = uniqueCode(members);
  };
  add('m1', '김순자', '1948-03-15', ['오전반', '무릎조심']);
  add('m2', '박영호', '1954-11-02', ['오전반']);
  add('m3', '이말순', '1945-06-20', ['오후반']);
  const E = (mid: string, o: number, kind: string, min: number, level: string, memo = ''): Exercise => ({
    id: uid(), mid, date: addDays(today, o), kind, min, level, memo,
  });
  const M = (mid: string, o: number, meal: string, menu: string, amount = '보통', memo = ''): Meal => ({
    id: uid(), mid, date: addDays(today, o), meal, menu, amount, memo,
  });
  return {
    members,
    ex: [
      E('m1', -1, '걷기', 30, '보통', '공원 한 바퀴'),
      E('m1', -2, '스트레칭', 15, '가볍게'),
      E('m1', -3, '걷기', 40, '보통'),
      E('m1', -5, '체조', 20, '가볍게', '복지관 건강체조'),
      E('m2', 0, '걷기', 40, '보통'),
      E('m2', -1, '근력운동', 20, '힘들게', '밴드 운동'),
      E('m2', -2, '걷기', 45, '보통'),
      E('m3', -2, '체조', 15, '가볍게'),
    ],
    meals: [
      M('m1', -1, '아침', '잡곡밥, 미역국'),
      M('m1', -1, '점심', '비빔국수', '적게'),
      M('m1', 0, '아침', '두유, 삶은 달걀, 사과'),
      M('m2', 0, '점심', '콩국수', '많이'),
      M('m3', -1, '점심', '죽', '적게', '입맛 없음'),
    ],
    programs: [],
    views: [],
    lessons: [
      { id: 'l1', name: '오전 체조', days: [1, 3, 5], createdAt: addDays(today, -28), roster: [
        { mid: 'm1', since: addDays(today, -28) }, { mid: 'm2', since: addDays(today, -28) },
      ] },
    ],
    attendance: [-2, -5, -7, -9, -12].flatMap((o) => [
      { lid: 'l1', mid: 'm1', date: addDays(today, o) },
      ...(o % 2 ? [{ lid: 'l1', mid: 'm2', date: addDays(today, o) }] : []),
    ]),
    offdays: [],
    notes: [
      { id: uid(), mid: 'm1', text: '이번 주 걷기 잘하고 계세요! 무릎 아프시면 스트레칭만 하셔도 좋아요.', by: '김코치 팀장', date: addDays(today, -1) },
    ],
    measures: [
      ...[-60, -45, -30, -14, -1].map((o, i): Measure => ({
        id: uid(), mid: 'm1', date: addDays(today, o), weight: [61.2, 60.8, 60.1, 59.6, 59.2][i],
        sbp: [138, 135, 132, 130, 128][i], dbp: [86, 84, 84, 82, 80][i], glu: i % 2 ? null : [118, 112, 108][i / 2], by: i === 2 ? '김코치 팀장' : '',
      })),
    ],
    notices: [
      { id: uid(), text: '다음 주 수요일(10월 7일)은 복지관 행사로 오전 체조를 쉬어요.', by: '관리자', date: addDays(today, -1), until: addDays(today, 10) },
    ],
    testCategories: DEFAULT_CATEGORIES.map((name, i) => ({ id: 'tc' + (i + 1), name, sort: i + 1 })),
    testItems: [
      { id: 'ti4', name: '수축기 혈압', unit: 'mmHg', better: 'none', category: 'tc1', kind: 'number' },
      { id: 'ti5', name: '체지방률', unit: '%', better: 'low', category: 'tc2', kind: 'number' },
      { id: 'ti1', name: '악력', unit: 'kg', better: 'high', category: 'tc5', kind: 'number' },
      { id: 'ti2', name: '30초 의자 일어서기', unit: '회', better: 'high', category: 'tc5', kind: 'number' },
      { id: 'ti3', name: '일어나 걷기(TUG)', unit: '초', better: 'low', category: 'tc5', kind: 'number' },
      { id: 'ti6', name: '체형 소견', unit: '', better: 'none', category: 'tc6', kind: 'text' },
    ],
    tests: [
      ...([[-60, 20.5, 11, 9.8], [-30, 21.2, 13, 9.1], [-2, 22.0, 14, 8.6]] as const).flatMap(([o, a, b, c]) => [
        { id: uid(), mid: 'm1', item: 'ti1', date: addDays(today, o), value: a, by: '김코치 팀장' },
        { id: uid(), mid: 'm1', item: 'ti2', date: addDays(today, o), value: b, by: '김코치 팀장' },
        { id: uid(), mid: 'm1', item: 'ti3', date: addDays(today, o), value: c, by: '김코치 팀장' },
      ]),
      { id: uid(), mid: 'm1', item: 'ti6', date: addDays(today, -2), value: null, text: '오른쪽 어깨가 조금 높음, 거북목 있음', by: '김코치 팀장' },
    ],
    photos: {},
    photoData: {},
    guardians: [{ mid: 'm1', relation: '딸' }],
    assign: { m1: 't1', m2: 't1' },
    chat: [
      { id: uid(), mid: 'm1', from: 'member', tid: null, by: '', text: '어제 운동하고 무릎이 조금 뻐근해요. 오늘도 해도 될까요?', at: new Date(Date.now() - 26 * 3600e3).toISOString() },
      { id: uid(), mid: 'm1', from: 'trainer', tid: 't1', by: '김코치 팀장', text: '오늘은 걷기만 20분 가볍게 하시고, 계속 아프면 말씀해 주세요.', at: new Date(Date.now() - 25 * 3600e3).toISOString() },
      { id: uid(), mid: 'm1', from: 'member', tid: null, by: '', text: '네 알겠습니다 감사합니다', at: new Date(Date.now() - 2 * 3600e3).toISOString() },
    ],
    chatSeen: {},
    // 김코치는 첫 메시지를 읽고 답했다
    chatReads: { 't1|m1': new Date(Date.now() - 25 * 3600e3).toISOString() },
    customFoods: [],
    admins: [{ id: 'a1', loginId: DEV_ADMIN.loginId, name: '관리자', pw: DEV_ADMIN.pw, failed: 0, lockedUntil: null }],
    trainers: [{ id: 't1', name: '김코치', rank: '팀장', code: genTrainerCode(), createdAt: today }],
    sessions: [],
  };
}

const save = (d: DevDB) => localStorage.setItem(KEY, JSON.stringify(d));

const load = (): DevDB => {
  let d: DevDB | null = null;
  try {
    d = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    d = null;
  }
  if (!d || !Array.isArray(d.members) || !Array.isArray(d.admins)) {
    const s = seed();
    save(s);
    return s;
  }
  d.lessons ??= [];
  d.attendance ??= [];
  d.offdays ??= [];
  d.customFoods ??= [];
  d.notes ??= [];
  d.measures ??= [];
  d.notices ??= [];
  d.testCategories ??= DEFAULT_CATEGORIES.map((name, i) => ({ id: 'tc' + (i + 1), name, sort: i + 1 }));
  d.testItems ??= [];
  d.testItems = d.testItems.map((i) => ({ ...i, category: i.category ?? null, kind: i.kind ?? 'number' }));
  d.tests ??= [];
  d.photos ??= {};
  d.photoData ??= {};
  d.guardians ??= [];
  d.chat ??= [];
  d.chatSeen ??= {};
  d.chatReads ??= {};
  d.assign ??= {};
  return d;
};

const toPublic = (m: Member): PublicMember => ({ id: m.id, name: m.name, age: m.age, birth: m.birth ?? null });

// 번호 대입 막기 (서버 _code_blocked 와 같게: 1분 안에 15번 이상 틀리면 5분). 이 탭에서만 센다
const fails: number[] = [];
const codeGuard = () => {
  const now = Date.now();
  const blocked = fails.some((f) => f > now - 5 * 60_000 && fails.filter((g) => g > f - 60_000 && g <= f).length >= 15);
  if (blocked) throw new LimitError();
};
/** 번호로 찾기. 막혔으면 LimitError, 틀리면 횟수를 세고 undefined */
const byCode = <T,>(list: T[], pick: (x: T) => string | undefined, code: string) => {
  codeGuard();
  const found = list.find((x) => pick(x) === normCode(code));
  if (!found) fails.push(Date.now());
  return found;
};

// 대화 초인종: 같은 탭은 바로, 다른 탭은 BroadcastChannel 로 (서버의 realtime.send 흉내)
const ringers = new Map<string, Set<() => void>>();
const bus = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('healthlog.dev.chat');
const fire = (topic: string) => ringers.get(topic)?.forEach((f) => f());
bus?.addEventListener('message', (e) => fire(String(e.data)));
const ring = (topic: string) => {
  // 서버처럼 조금 늦게 (저장이 끝난 뒤) 울린다
  setTimeout(() => fire(topic), 50);
  bus?.postMessage(topic);
};
/** 개발용 알림 공개 키 (시험용 값. 이 키로는 실제 알림이 가지 않는다) */
const DEV_PUSH_KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const devPush = new Map<string, boolean>();

const STAFF_TOPIC = 'dev-staff';
const memberTopic = (mid: string) => 'dev-chat-' + mid;
const trainerTopic = (tid: string) => 'dev-tr-' + tid;

/** 경계 시각도 포함 (서버와 같게) */
const chatPage = (d: DevDB, mid: string, r: ChatRange = {}) => {
  const all = d.chat.filter((c) => c.mid === mid && (!r.after || c.at >= r.after) && (!r.before || c.at <= r.before)).sort((a, b) => a.at.localeCompare(b.at));
  return r.after ? all.slice(0, 500) : all.slice(-50);
};

/** 양쪽이 마지막으로 읽은 때 (트레이너는 누구든 가장 늦게 읽은 때) */
const chatSeenOf = (d: DevDB, mid: string) => {
  const reads = Object.entries(d.chatReads)
    .filter(([k]) => k.endsWith('|' + mid))
    .map(([, v]) => v)
    .sort();
  return { member: d.chatSeen[mid] ?? null, trainer: reads.at(-1) ?? null };
};

const chatPut = (d: DevDB, msg: Omit<ChatMessage, 'id' | 'at'>) => {
  const text = msg.text.trim().slice(0, 500);
  if (!text) throw new Error('no text');
  const c: ChatMessage = { ...msg, text, id: uid(), at: new Date().toISOString() };
  const yearAgo = new Date(Date.now() - 365 * 86400e3).toISOString();
  d.chat = d.chat.filter((x) => x.at >= yearAgo);
  d.chat.push(c);
  save(d);
  ring(memberTopic(c.mid));
  if (d.assign[c.mid]) ring(trainerTopic(d.assign[c.mid]));
  ring(STAFF_TOPIC);
  return c;
};

const who = (d: DevDB, code: string) => {
  const m = byCode(d.members, (x) => x.code, code);
  if (!m) throw new AuthError('invalid code');
  return m;
};

const userData = (d: DevDB, m: Member): UserData => ({
  member: { ...toPublic(m), code: m.code },
  ex: d.ex.filter((x) => x.mid === m.id),
  meals: d.meals.filter((x) => x.mid === m.id),
  // 다른 이용자 정보는 넘기지 않는다
  programs: d.programs.filter((p) => p.mids.includes(m.id)).map((p) => ({ ...p, mids: [m.id] })),
  views: d.views.filter((v) => v.mid === m.id),
  // 같은 수업의 다른 이용자는 알려주지 않는다
  lessons: d.lessons.filter((l) => l.roster.some((r) => r.mid === m.id)).map((l) => ({ ...l, roster: l.roster.filter((r) => r.mid === m.id) })),
  attendance: d.attendance.filter((a) => a.mid === m.id),
  offdays: d.offdays.filter((o) => d.lessons.some((l) => l.id === o.lid && l.roster.some((r) => r.mid === m.id))),
  notes: d.notes.filter((n) => n.mid === m.id),
  measures: d.measures.filter((x) => x.mid === m.id).sort(byDate),
  notices: activeNotices(d, 0),
  testCategories: d.testCategories,
  testItems: d.testItems,
  tests: d.tests.filter((t) => t.mid === m.id),
  photos: photoVersFor(d, m.id),
  guardians: d.guardians.filter((g) => g.mid === m.id),
  assign: d.assign[m.id] ? { [m.id]: d.assign[m.id] } : {},
});

/** 이용자·보호자에게는 그분·그분 보호자·트레이너 사진만 (직원은 전부) */
const canSeePhoto = (d: DevDB, id: string, mid: string | null) =>
  mid === null || id === mid || id === guardianPhotoId(mid) || d.trainers.some((t) => t.id === id);

const photoVersFor = (d: DevDB, mid: string | null) => Object.fromEntries(Object.entries(d.photos).filter(([id]) => canSeePhoto(d, id, mid)));

const photosOf = (d: DevDB, ids: string[], mid: string | null) =>
  Object.fromEntries(ids.filter((id) => d.photoData[id] && canSeePhoto(d, id, mid)).map((id) => [id, d.photoData[id]]));

/** 사진 넣기·지우기. 새 버전을 돌려준다 (지웠으면 null) */
const putPhoto = (d: DevDB, id: string, data: string | null) => {
  if (data === null) {
    delete d.photos[id];
    delete d.photoData[id];
    save(d);
    return null;
  }
  if (data.length > 120000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(data)) throw new Error('invalid photo');
  const v = String(Date.now());
  d.photos[id] = v;
  d.photoData[id] = data;
  save(d);
  return v;
};

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

/** 끝나지 않은 공지 (직원에게는 끝난 지 30일까지) */
const activeNotices = (d: DevDB, graceDays: number) => {
  const from = addDays(todayYmd(), -graceDays);
  return d.notices.filter((n) => !n.until || n.until >= from).sort((a, b) => b.date.localeCompare(a.date));
};

/** 한마디·공지·수치에 남기는 직원 이름 (서버 _staff_label 과 같게) */
const staffLabel = (d: DevDB, s: DevSession) =>
  s.role === 'admin'
    ? (d.admins.find((a) => a.id === s.subject)?.name ?? '관리자')
    : trainerTitle(d.trainers.find((t) => t.id === s.subject)?.name ?? '', d.trainers.find((t) => t.id === s.subject)?.rank);

const newMeasure = (d: DevDB, mid: string, m: NewMeasure, by: string): Measure => {
  if (!validMeasure(m, todayYmd())) throw new Error('invalid measure');
  const rec: Measure = { id: uid(), mid, date: m.date, weight: m.weight === null ? null : Math.round(m.weight * 10) / 10, sbp: m.sbp, dbp: m.dbp, glu: m.glu, by };
  d.measures.push(rec);
  return rec;
};

/** 유효한 로그인 표 (없거나 끝났으면 undefined) */
const sessionOf = (d: DevDB, token: string) => d.sessions.find((s) => s.token === token && s.expires > new Date().toISOString());

const newSession = (d: DevDB, role: StaffRole, subject: string) => {
  const now = new Date();
  d.sessions = d.sessions.filter((s) => s.expires > now.toISOString());
  const token = randomToken();
  d.sessions.push({ token, role, subject, expires: new Date(now.getTime() + HOURS[role] * 3600_000).toISOString() });
  return token;
};

/** 서버 _check_test_item 과 같은 검사·정리 */
const checkItem = (it: TestItem): TestItem => {
  const name = it.name.trim().slice(0, 30);
  if (!name) throw new Error('no name');
  if (!['high', 'low', 'none'].includes(it.better)) throw new Error('invalid better');
  const text = it.kind === 'text';
  return { id: it.id, name, unit: text ? '' : it.unit.trim().slice(0, 10), better: text ? 'none' : it.better, category: it.category, kind: text ? 'text' : 'number' };
};

/** 서버 20261009000000_test_categories.sql 의 기본 분류와 같게 */
const DEFAULT_CATEGORIES = ['신체징후(Vital Sign)', '신체구성(Body comp.)', '자율신경(HRV, 혈관건강)', '관절가동성(ROM)', '기초·기능 평가', '체형분석', '보행평가'];

/** 서버 staff_add_lesson 과 같은 검사·정리 */
const checkLesson = (d: DevDB, l: { name: string; days: number[]; mids: string[] }) => {
  const name = l.name.trim().slice(0, 30);
  const days = [...new Set(l.days)].filter((x) => x >= 0 && x <= 6).sort();
  const mids = [...new Set(l.mids)].filter((mid) => d.members.some((m) => m.id === mid));
  if (!name) throw new Error('no name');
  if (!days.length) throw new Error('no days');
  if (!mids.length) throw new Error('no members');
  return { name, days, mids };
};

export function createDevBackend(): Backend {
  /** 관리자·트레이너 모두 */
  const staff = (token: string) => {
    const d = load();
    const s = sessionOf(d, token);
    if (!s) throw new AuthError('invalid session');
    return { d, s };
  };
  /** 트레이너만 (관리자는 'trainer only') */
  const trainer = (token: string) => {
    const r = staff(token);
    if (r.s.role !== 'trainer') throw new Error('trainer only');
    return r;
  };
  /** 관리자만 */
  const admin = (token: string) => {
    const r = staff(token);
    if (r.s.role !== 'admin') throw new AuthError('invalid session');
    return r.d;
  };

  return {
    mode: 'dev',

    async devHints() {
      const d = load();
      const m = d.members[0];
      const t = d.trainers[0];
      return {
        user: m ? `${m.name} 님 번호: ${m.code}` : '',
        guardian: m ? `${m.name} 님 보호자 번호: ${m.guardianCode}` : '',
        trainer: t ? `${t.name} 트레이너 번호: ${t.code}` : '',
        admin: `아이디 ${DEV_ADMIN.loginId} · 비밀번호 ${DEV_ADMIN.pw}`,
      };
    },

    async userGet(code) {
      const d = load();
      const m = byCode(d.members, (x) => x.code, code);
      return m ? userData(d, m) : null;
    },

    async guardianGet(code) {
      const d = load();
      const m = byCode(d.members, (x) => x.guardianCode, code);
      return m ? { ...userData(d, m), member: toPublic(m) } : null;
    },

    async userAddEx(code, r) {
      const d = load();
      const m = who(d, code);
      const rec: Exercise = { id: uid(), mid: m.id, date: r.date, kind: r.kind, min: r.min, level: r.level, memo: r.memo || '' };
      d.ex.push(rec);
      save(d);
      return rec;
    },

    async userAddMeal(code, r) {
      const d = load();
      const m = who(d, code);
      const rec: Meal = {
        id: uid(), mid: m.id, date: r.date, meal: r.meal, menu: r.menu, amount: r.amount, memo: r.memo || '',
        foods: r.foods.slice(0, 20), nutri: r.foods.length ? r.nutri : null,
      };
      d.meals.push(rec);
      save(d);
      return rec;
    },

    async userDelEx(code, id) {
      const d = load();
      const m = who(d, code);
      d.ex = d.ex.filter((x) => !(x.id === id && x.mid === m.id));
      save(d);
    },

    async userDelMeal(code, id) {
      const d = load();
      const m = who(d, code);
      d.meals = d.meals.filter((x) => !(x.id === id && x.mid === m.id));
      save(d);
    },

    async userAddView(code, pid, date) {
      const d = load();
      const m = who(d, code);
      const p = d.programs.find((x) => x.id === pid && x.mids.includes(m.id));
      if (!p) throw new AuthError('not allowed');
      const view: View = { id: uid(), pid, mid: m.id, date };
      const ex: Exercise = {
        id: uid(), mid: m.id, date, kind: p.kind, min: p.min, level: '보통', memo: `영상 따라하기 · ${p.title}`, pid,
      };
      d.views.push(view);
      d.ex.push(ex);
      save(d);
      return { view, ex };
    },

    async userAddMeasure(code, m) {
      const d = load();
      const rec = newMeasure(d, who(d, code).id, m, '');
      save(d);
      return rec;
    },

    async userDelMeasure(code, id) {
      const d = load();
      const m = who(d, code);
      d.measures = d.measures.filter((x) => !(x.id === id && x.mid === m.id && x.by === ''));
      save(d);
    },

    // --- 로그인 ---------------------------------------------------------------
    async adminLogin(loginId, pw) {
      const d = load();
      const a = d.admins.find((x) => x.loginId === loginId.trim().toLowerCase());
      if (!a) return { ok: false, error: 'invalid' };
      const now = new Date();
      if (a.lockedUntil && a.lockedUntil > now.toISOString()) return { ok: false, error: 'locked', until: a.lockedUntil };
      if (a.pw !== pw) {
        const n = a.failed + 1;
        if (n >= LOCK_AFTER) {
          a.failed = 0;
          a.lockedUntil = new Date(now.getTime() + LOCK_MIN * 60_000).toISOString();
          save(d);
          return { ok: false, error: 'locked', until: a.lockedUntil };
        }
        a.failed = n;
        a.lockedUntil = null;
        save(d);
        return { ok: false, error: 'invalid', left: LOCK_AFTER - n };
      }
      a.failed = 0;
      a.lockedUntil = null;
      const token = newSession(d, 'admin', a.id);
      save(d);
      return { ok: true, session: { token, role: 'admin', name: a.name } };
    },

    async trainerLogin(code) {
      const d = load();
      const t = byCode(d.trainers, (x) => x.code, code);
      if (!t) return null;
      const token = newSession(d, 'trainer', t.id);
      save(d);
      return { token, role: 'trainer', name: t.name };
    },

    async staffLogout(token) {
      const d = load();
      d.sessions = d.sessions.filter((s) => s.token !== token);
      save(d);
    },

    async adminChangePassword(token, oldPw, newPw) {
      const { d, s } = staff(token);
      if (s.role !== 'admin') throw new AuthError('invalid session');
      const a = d.admins.find((x) => x.id === s.subject);
      if (!a || a.pw !== oldPw) return 'wrong';
      if (newPw.length < 8) return 'short';
      a.pw = newPw;
      // 다른 기기의 로그인은 모두 끝낸다
      d.sessions = d.sessions.filter((x) => x.subject !== a.id || x.token === token);
      save(d);
      return null;
    },

    // --- 직원 데이터 -----------------------------------------------------------
    async staffGet(token) {
      const d = load();
      const s = sessionOf(d, token);
      if (!s) return null;
      const tr = s.role === 'trainer' ? d.trainers.find((t) => t.id === s.subject) : undefined;
      const name = s.role === 'admin' ? d.admins.find((a) => a.id === s.subject)?.name : tr?.name;
      if (!name) return null; // 지워진 계정
      const isAdmin = s.role === 'admin';
      return {
        me: { role: s.role, name, rank: tr?.rank ?? '', id: s.subject },
        // 트레이너에게는 개인·보호자 번호를 보내지 않는다
        members: isAdmin ? d.members : d.members.map(({ code: _c, guardianCode: _g, ...m }) => ({ ...m, code: '' })),
        trainers: isAdmin ? d.trainers : null,
        ex: d.ex,
        meals: d.meals,
        programs: d.programs,
        views: d.views,
        lessons: d.lessons,
        attendance: d.attendance,
        offdays: d.offdays,
        notes: d.notes,
        measures: [...d.measures].sort(byDate),
        notices: activeNotices(d, 30),
        testCategories: d.testCategories,
        testItems: d.testItems,
        tests: d.tests,
        photos: d.photos,
        guardians: d.guardians,
        assign: d.assign,
      };
    },

    async staffAddMember(token, name, birth) {
      const d = admin(token);
      const m: Member = { id: 'm' + uid(), name, age: null, birth, code: uniqueCode(d.members), tags: [] };
      d.members.push(m);
      m.guardianCode = uniqueCode(d.members);
      save(d);
      return m;
    },

    async staffDelMember(token, id) {
      const d = admin(token);
      d.members = d.members.filter((m) => m.id !== id);
      d.ex = d.ex.filter((e) => e.mid !== id);
      d.meals = d.meals.filter((e) => e.mid !== id);
      d.views = d.views.filter((v) => v.mid !== id);
      d.programs.forEach((p) => (p.mids = p.mids.filter((x) => x !== id)));
      d.lessons.forEach((l) => (l.roster = l.roster.filter((r) => r.mid !== id)));
      d.attendance = d.attendance.filter((a) => a.mid !== id);
      d.notes = d.notes.filter((n) => n.mid !== id);
      d.measures = d.measures.filter((x) => x.mid !== id);
      d.tests = d.tests.filter((x) => x.mid !== id);
      d.guardians = d.guardians.filter((g) => g.mid !== id);
      d.chat = d.chat.filter((c) => c.mid !== id);
      delete d.assign[id];
      for (const k of [id, guardianPhotoId(id)]) {
        delete d.photos[k];
        delete d.photoData[k];
      }
      save(d);
    },

    async staffSetBirth(token, id, birth) {
      const d = admin(token);
      const m = d.members.find((x) => x.id === id);
      if (m) m.birth = birth;
      save(d);
    },

    async staffNewCode(token, id) {
      const d = admin(token);
      const m = d.members.find((x) => x.id === id);
      if (!m) throw new Error('member not found');
      m.code = uniqueCode(d.members);
      save(d);
      return m.code;
    },

    async staffNewGuardianCode(token, id) {
      const d = admin(token);
      const m = d.members.find((x) => x.id === id);
      if (!m) throw new Error('member not found');
      m.guardianCode = uniqueCode(d.members);
      // 새 보호자에게 예전 보호자의 사진·관계가 보이지 않게
      d.guardians = d.guardians.filter((g) => g.mid !== id);
      delete d.photos[guardianPhotoId(id)];
      delete d.photoData[guardianPhotoId(id)];
      save(d);
      return m.guardianCode;
    },

    async adminAddTrainer(token, name, rank) {
      const d = admin(token);
      let code: string;
      do code = genTrainerCode();
      while (d.trainers.some((t) => t.code === code));
      const t: Trainer = { id: 't' + uid(), name: name.trim(), rank: normRank(rank), code, createdAt: todayYmd() };
      d.trainers.push(t);
      save(d);
      return t;
    },

    async adminSetTrainerRank(token, id, rank) {
      const d = admin(token);
      const t = d.trainers.find((x) => x.id === id);
      if (!t) throw new Error('trainer not found');
      t.rank = normRank(rank);
      save(d);
      return t.rank;
    },

    async adminNewTrainerCode(token, id) {
      const d = admin(token);
      const t = d.trainers.find((x) => x.id === id);
      if (!t) throw new Error('trainer not found');
      let code: string;
      do code = genTrainerCode();
      while (d.trainers.some((x) => x.code === code));
      t.code = code;
      d.sessions = d.sessions.filter((s) => !(s.role === 'trainer' && s.subject === id));
      save(d);
      return code;
    },

    async adminDelTrainer(token, id) {
      const d = admin(token);
      d.trainers = d.trainers.filter((t) => t.id !== id);
      for (const [mid, tid] of Object.entries(d.assign)) if (tid === id) delete d.assign[mid];
      d.sessions = d.sessions.filter((s) => !(s.role === 'trainer' && s.subject === id));
      delete d.photos[id];
      delete d.photoData[id];
      save(d);
    },

    async staffSetTags(token, id, tags) {
      const { d } = staff(token);
      const m = d.members.find((x) => x.id === id);
      if (!m) throw new Error('member not found');
      const t = normTags(tags);
      if (t.length > TAGS_PER_MEMBER) throw new Error('too many tags');
      m.tags = t;
      save(d);
      return t;
    },

    // 영상 올리기·지우기는 관리자만 (대상 이용자는 트레이너가 공유한다)
    async staffAddProgram(token, p, file) {
      const d = admin(token);
      const id = 'p' + uid();
      const rec: Program = {
        id, title: p.title, mids: [], kind: p.kind, min: p.min, memo: p.memo || '', date: todayYmd(),
        src: file ? 'file' : 'yt',
        ytId: file ? null : p.ytId,
        videoKey: file ? id : null,
        videoName: file ? file.name : '유튜브 영상',
      };
      if (file) await idbDo('readwrite', (st) => st.put(file, id));
      d.programs.unshift(rec);
      save(d);
      return rec;
    },

    async staffDelProgram(token, id) {
      const d = admin(token);
      const p = d.programs.find((x) => x.id === id);
      if (p?.videoKey) idbDo('readwrite', (st) => st.delete(p.videoKey!)).catch(() => {});
      d.programs = d.programs.filter((x) => x.id !== id);
      d.views = d.views.filter((v) => v.pid !== id);
      save(d);
    },

    async adminUpdateProgram(token, id, e) {
      const d = admin(token);
      const p = d.programs.find((x) => x.id === id);
      if (!p) throw new Error('program not found');
      if (!e.title.trim()) throw new Error('no title');
      if (e.ytId !== null && !/^[A-Za-z0-9_-]{11}$/.test(e.ytId)) throw new Error('invalid video');
      Object.assign(p, { title: e.title.trim().slice(0, 100), kind: e.kind, min: e.min, memo: e.memo || '' });
      if (e.ytId) Object.assign(p, { src: 'yt', ytId: e.ytId, videoKey: null, videoUrl: null, videoName: '유튜브 영상' });
      save(d);
      return { ...p };
    },

    // 관리자는 모든 이용자, 트레이너는 자기 담당 이용자 몫만 바꾼다
    async staffSetProgramMembers(token, id, mids) {
      const { d, s } = staff(token);
      const p = d.programs.find((x) => x.id === id);
      if (!p) throw new Error('program not found'); // 다른 직원이 먼저 지운 영상
      // 삭제된 이용자는 빼고 저장. 이미 따라한 기록(views·운동일지)은 그대로 둔다
      const want = [...new Set(mids)].filter((mid) => d.members.some((m) => m.id === mid));
      const mine = (mid: string) => s.role === 'admin' || d.assign[mid] === s.subject;
      const next = [...p.mids.filter((mid) => !mine(mid)), ...want.filter(mine)];
      p.mids = next;
      save(d);
      return next;
    },

    async staffSharePrograms(token, pids, mids, on) {
      const { d, s } = staff(token);
      const ms = mids.filter((mid) => d.members.some((m) => m.id === mid) && (s.role === 'admin' || d.assign[mid] === s.subject));
      const out: Record<string, string[]> = {};
      for (const p of d.programs.filter((x) => pids.includes(x.id))) {
        p.mids = on ? [...new Set([...p.mids, ...ms])] : p.mids.filter((mid) => !ms.includes(mid));
        out[p.id] = p.mids;
      }
      save(d);
      return out;
    },

    // --- 이용자 기록 고치기 (관리자) ---------------------------------------------
    async adminUpdateEx(token, id, r) {
      const d = admin(token);
      const e = d.ex.find((x) => x.id === id);
      if (!e) throw new Error('record not found');
      if (!r.kind.trim()) throw new Error('no kind');
      Object.assign(e, { date: r.date, kind: r.kind.trim().slice(0, 30), min: Math.max(1, Math.min(600, r.min)), level: r.level || '보통', memo: r.memo || '' });
      save(d);
      return { ...e };
    },

    async adminUpdateMeal(token, id, r) {
      const d = admin(token);
      const m = d.meals.find((x) => x.id === id);
      if (!m) throw new Error('record not found');
      if (!r.menu.trim()) throw new Error('no menu');
      const foods = r.foods.slice(0, 20);
      Object.assign(m, { date: r.date, meal: r.meal, menu: r.menu.trim(), amount: r.amount || '보통', memo: r.memo || '', foods, nutri: foods.length ? r.nutri : null });
      save(d);
      return { ...m };
    },

    async adminDelEx(token, id) {
      const d = admin(token);
      d.ex = d.ex.filter((x) => x.id !== id);
      save(d);
    },

    async adminDelMeal(token, id) {
      const d = admin(token);
      d.meals = d.meals.filter((x) => x.id !== id);
      save(d);
    },

    // --- 추가한 음식 -------------------------------------------------------------
    async customFoodsGet() {
      return [...load().customFoods].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    },

    async adminFoodRequests(token) {
      const d = admin(token);
      const by = new Map<string, { count: number; mids: Set<string>; last: string }>();
      for (const m of d.meals)
        for (const f of m.foods ?? []) {
          if (typeof f.kcal === 'number' || d.customFoods.some((c) => c.name === f.n)) continue;
          const v = by.get(f.n) ?? { count: 0, mids: new Set<string>(), last: '' };
          v.count++;
          v.mids.add(m.mid);
          if (m.date > v.last) v.last = m.date;
          by.set(f.n, v);
        }
      return [...by.entries()]
        .map(([name, v]) => ({ name, count: v.count, members: v.mids.size, last: v.last }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
    },

    async adminSaveFood(token, f) {
      const d = admin(token);
      const name = f.name.trim().slice(0, 40);
      if (!name) throw new Error('no name');
      if (!(f.size > 0 && f.size <= 5000)) throw new Error('invalid size');
      const n = roundNutri(f);
      const food: CustomFood = { name, size: Math.round(f.size * 10) / 10, unit: f.unit === 'ml' ? 'ml' : 'g', ...n, updatedAt: todayYmd() };
      d.customFoods = [...d.customFoods.filter((x) => x.name !== name), food];
      // 이 이름이 들어 있는 식사를 다시 계산 (서버 admin_save_food 와 같게)
      let updated = 0;
      for (const m of d.meals) {
        if (!(m.foods ?? []).some((x) => x.n === name)) continue;
        m.foods = m.foods!.map((x) => (x.n === name ? { n: name, ...n } : x));
        m.nutri = mealNutri(m.foods, m.amount);
        updated++;
      }
      save(d);
      return { food, updated };
    },

    async adminDelFood(token, name) {
      const d = admin(token);
      d.customFoods = d.customFoods.filter((x) => x.name !== name);
      save(d);
    },

    // --- 수업·출석 -------------------------------------------------------------
    async staffAddLesson(token, l) {
      const { d } = staff(token);
      const v = checkLesson(d, l);
      const today = todayYmd();
      const rec: Lesson = { id: 'l' + uid(), name: v.name, days: v.days, createdAt: today, roster: v.mids.map((mid) => ({ mid, since: today })) };
      d.lessons.push(rec);
      save(d);
      return rec;
    },

    async staffUpdateLesson(token, id, l) {
      const { d } = staff(token);
      const v = checkLesson(d, l);
      const rec = d.lessons.find((x) => x.id === id);
      if (!rec) throw new Error('lesson not found');
      const today = todayYmd();
      rec.name = v.name;
      rec.days = v.days;
      // 계속 있는 이용자는 처음 넣은 날짜를 유지. 뺀 이용자의 지난 출석은 남겨 둔다
      rec.roster = v.mids.map((mid) => rec.roster.find((r) => r.mid === mid) ?? { mid, since: today });
      save(d);
      return rec;
    },

    async staffDelLesson(token, id) {
      const { d } = staff(token);
      d.lessons = d.lessons.filter((x) => x.id !== id);
      d.attendance = d.attendance.filter((a) => a.lid !== id);
      d.offdays = d.offdays.filter((o) => o.lid !== id);
      save(d);
    },

    // 트레이너는 담당 이용자만 출석 체크
    async staffSetAttendance(token, lid, mid, date, present) {
      const { d, s } = staff(token);
      if (s.role === 'trainer' && d.assign[mid] !== s.subject) throw new Error('not assigned');
      const l = d.lessons.find((x) => x.id === lid);
      if (!l) throw new Error('lesson not found');
      if (date > todayYmd()) throw new Error('invalid date');
      d.attendance = d.attendance.filter((a) => !(a.lid === lid && a.mid === mid && a.date === date));
      if (present) {
        if (!l.roster.some((r) => r.mid === mid)) throw new Error('not in lesson');
        d.attendance.push({ lid, mid, date });
      }
      save(d);
    },

    async staffSetAttendanceMany(token, lid, date, mids) {
      const { d, s } = staff(token);
      const l = d.lessons.find((x) => x.id === lid);
      if (!l) throw new Error('lesson not found');
      if (date > todayYmd()) throw new Error('invalid date');
      let n = 0;
      for (const mid of new Set(mids)) {
        if (!l.roster.some((r) => r.mid === mid) || d.attendance.some((a) => a.lid === lid && a.mid === mid && a.date === date)) continue;
        if (s.role === 'trainer' && d.assign[mid] !== s.subject) continue;
        d.attendance.push({ lid, mid, date });
        n++;
      }
      save(d);
      return n;
    },

    // --- 한마디·건강 수치·공지 ---------------------------------------------------
    async userNoteSeen(code, id) {
      const d = load();
      const m = who(d, code);
      const mine = d.notes.filter((n) => n.mid === m.id);
      const i = mine.findIndex((n) => n.id === id);
      if (i < 0) return [];
      const at = mine[i].date;
      // 그 한마디와 그 전(같은 날은 먼저 남긴) 한마디
      mine.forEach((n, j) => {
        if (n.date < at || (n.date === at && j <= i)) n.seen = true;
      });
      save(d);
      return mine.filter((n) => n.seen).map((n) => n.id);
    },

    async staffAddNote(token, mid, text) {
      const { d, s } = staff(token);
      const t = text.trim().slice(0, 200);
      if (!t) throw new Error('no text');
      if (!d.members.some((m) => m.id === mid)) throw new Error('member not found');
      const rec: Note = { id: uid(), mid, text: t, by: staffLabel(d, s), byId: s.role === 'trainer' ? s.subject : null, date: todayYmd() };
      d.notes.push(rec);
      save(d);
      return rec;
    },

    async staffDelNote(token, id) {
      const { d } = staff(token);
      d.notes = d.notes.filter((n) => n.id !== id);
      save(d);
    },

    async staffAddMeasure(token, mid, m) {
      const { d, s } = staff(token);
      if (!d.members.some((x) => x.id === mid)) throw new Error('member not found');
      const rec = newMeasure(d, mid, m, staffLabel(d, s));
      save(d);
      return rec;
    },

    async staffDelMeasure(token, id) {
      const { d } = staff(token);
      d.measures = d.measures.filter((x) => x.id !== id);
      save(d);
    },

    async staffAddNotice(token, text, until) {
      const { d, s } = staff(token);
      const t = text.trim().slice(0, 300);
      if (!t) throw new Error('no text');
      if (until && until < todayYmd()) throw new Error('invalid date');
      const rec: Notice = { id: uid(), text: t, by: staffLabel(d, s), date: todayYmd(), until };
      d.notices.push(rec);
      save(d);
      return rec;
    },

    async staffDelNotice(token, id) {
      const { d } = staff(token);
      d.notices = d.notices.filter((n) => n.id !== id);
      save(d);
    },

    // --- 체력 측정 ---------------------------------------------------------------
    async adminAddTestCategory(token, name) {
      const d = admin(token);
      const n = name.trim().slice(0, 40);
      if (!n) throw new Error('no name');
      const rec: TestCategory = { id: 'tc' + uid(), name: n, sort: Math.max(0, ...d.testCategories.map((c) => c.sort)) + 1 };
      d.testCategories.push(rec);
      save(d);
      return rec;
    },

    async adminUpdateTestCategory(token, id, name) {
      const d = admin(token);
      const c = d.testCategories.find((x) => x.id === id);
      if (!c) throw new Error('category not found');
      const n = name.trim().slice(0, 40);
      if (!n) throw new Error('no name');
      c.name = n;
      save(d);
      return c;
    },

    async adminDelTestCategory(token, id) {
      const d = admin(token);
      if (d.testItems.some((i) => i.category === id)) throw new Error('category not empty');
      d.testCategories = d.testCategories.filter((x) => x.id !== id);
      save(d);
    },

    async adminAddTestItem(token, it) {
      const d = admin(token);
      if (it.category && !d.testCategories.some((c) => c.id === it.category)) throw new Error('category not found');
      const rec = checkItem({ id: 'ti' + uid(), ...it });
      d.testItems.push(rec);
      save(d);
      return rec;
    },

    async adminUpdateTestItem(token, id, it) {
      const d = admin(token);
      const i = d.testItems.findIndex((x) => x.id === id);
      if (i < 0) throw new Error('item not found');
      if (it.category && !d.testCategories.some((c) => c.id === it.category)) throw new Error('category not found');
      d.testItems[i] = checkItem({ id, ...it, kind: d.testItems[i].kind }); // 종류는 바꾸지 않는다
      save(d);
      return d.testItems[i];
    },

    async adminDelTestItem(token, id) {
      const d = admin(token);
      d.testItems = d.testItems.filter((x) => x.id !== id);
      d.tests = d.tests.filter((x) => x.item !== id);
      save(d);
    },

    async trainerSaveTests(token, mid, date, values) {
      const { d, s } = trainer(token);
      if (!d.members.some((m) => m.id === mid)) throw new Error('member not found');
      if (date > todayYmd()) throw new Error('invalid date');
      if (values.some((v) => typeof v.value === 'number' && Math.abs(v.value) > 100000)) throw new Error('invalid value');
      d.tests = d.tests.filter((t) => !(t.mid === mid && t.date === date));
      const by = staffLabel(d, s);
      const recs: TestResult[] = [];
      for (const v of values) {
        const it = d.testItems.find((i) => i.id === v.item);
        if (!it || recs.some((r) => r.item === it.id)) continue;
        if (it.kind === 'text') {
          const t = (v.text ?? '').trim().slice(0, 200);
          if (t) recs.push({ id: uid(), mid, item: it.id, date, value: null, text: t, by });
        } else if (typeof v.value === 'number' && Number.isFinite(v.value)) {
          recs.push({ id: uid(), mid, item: it.id, date, value: Math.round(v.value * 100) / 100, by });
        }
      }
      d.tests.push(...recs);
      save(d);
      return recs;
    },

    async trainerDelTests(token, mid, date) {
      const { d } = trainer(token);
      d.tests = d.tests.filter((t) => !(t.mid === mid && t.date === date));
      save(d);
    },

    // --- 프로필 사진 --------------------------------------------------------------
    // 이용자 사진은 직원 누구나, 트레이너·관리자 사진은 로그인한 본인만
    async staffSetPhoto(token, kind, id, data) {
      const { d, s } = staff(token);
      if (kind === 'member') {
        if (!d.members.some((m) => m.id === id)) throw new Error('member not found');
      } else if (s.role !== kind || s.subject !== id) throw new Error('own photo only');
      return putPhoto(d, id, data);
    },

    async staffPhotos(token, ids) {
      const { d } = staff(token);
      return photosOf(d, ids, null);
    },

    async userPhotos(code, ids) {
      const d = load();
      return photosOf(d, ids, who(d, code).id);
    },

    async guardianPhotos(code, ids) {
      const d = load();
      const m = byCode(d.members, (x) => x.guardianCode, code);
      if (!m) throw new AuthError('invalid code');
      return photosOf(d, ids, m.id);
    },

    async userSetPhoto(code, data) {
      const d = load();
      return putPhoto(d, who(d, code).id, data);
    },

    async guardianSetPhoto(code, data) {
      const d = load();
      const m = byCode(d.members, (x) => x.guardianCode, code);
      if (!m) throw new AuthError('invalid code');
      return putPhoto(d, guardianPhotoId(m.id), data);
    },

    async guardianSetRelation(code, relation) {
      const d = load();
      const m = byCode(d.members, (x) => x.guardianCode, code);
      if (!m) throw new AuthError('invalid code');
      const r = relation.replace(/\s+/g, ' ').trim().slice(0, 20);
      d.guardians = d.guardians.filter((g) => g.mid !== m.id);
      if (r) d.guardians.push({ mid: m.id, relation: r });
      save(d);
      return r;
    },

    // --- 대화 ------------------------------------------------------------------
    async userChatStatus(code) {
      const d = load();
      const m = who(d, code);
      const seen = d.chatSeen[m.id] ?? '';
      const t = d.trainers.find((x) => x.id === d.assign[m.id]);
      return {
        key: memberTopic(m.id),
        unread: d.chat.filter((c) => c.mid === m.id && c.from === 'trainer' && c.at > seen).length,
        trainer: t ? { id: t.id, name: t.name, rank: t.rank ?? '' } : null,
      };
    },

    async userChatGet(code, r) {
      const d = load();
      const m = who(d, code);
      // 안 읽은 트레이너 메시지가 있었을 때만 읽음으로 하고 담당 트레이너에게 알린다 (서버와 같게)
      if (!r?.before && d.chat.some((c) => c.mid === m.id && c.from === 'trainer' && c.at > (d.chatSeen[m.id] ?? ''))) {
        d.chatSeen[m.id] = new Date().toISOString();
        save(d);
        if (d.assign[m.id]) ring(trainerTopic(d.assign[m.id]));
      }
      return chatPage(d, m.id, r);
    },

    async userChatSeen(code) {
      const d = load();
      return chatSeenOf(d, who(d, code).id);
    },

    async staffChatSeen(token, mid) {
      const { d, s } = staff(token);
      if (!d.members.some((m) => m.id === mid)) throw new Error('member not found');
      if (s.role === 'trainer' && d.assign[mid] !== s.subject) throw new Error('not assigned');
      return chatSeenOf(d, mid);
    },

    async userChatSend(code, text) {
      const d = load();
      const m = who(d, code);
      if (!d.trainers.some((t) => t.id === d.assign[m.id])) throw new Error('no trainer');
      const c = chatPut(d, { mid: m.id, from: 'member', tid: null, by: '', text });
      d.chatSeen[m.id] = c.at;
      save(d);
      return c;
    },

    async staffChatList(token) {
      const { d, s } = staff(token);
      const last = new Map<string, ChatMessage>();
      // 트레이너는 담당 이용자 대화만
      for (const c of [...d.chat].sort((a, b) => a.at.localeCompare(b.at))) if (s.role === 'admin' || d.assign[c.mid] === s.subject) last.set(c.mid, c);
      const rooms = [...last.values()]
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((l) => {
          const seen = d.chatReads[s.subject + '|' + l.mid] ?? '';
          return { mid: l.mid, last: l, unread: s.role === 'trainer' ? d.chat.filter((c) => c.mid === l.mid && c.from === 'member' && c.at > seen).length : 0 };
        });
      return { key: s.role === 'admin' ? STAFF_TOPIC : trainerTopic(s.subject), rooms };
    },

    async staffChatGet(token, mid, r) {
      const { d, s } = staff(token);
      if (!d.members.some((m) => m.id === mid)) throw new Error('member not found');
      if (s.role === 'trainer' && d.assign[mid] !== s.subject) throw new Error('not assigned');
      if (s.role === 'trainer' && !r?.before) {
        const prev = d.chatReads[s.subject + '|' + mid];
        const fresh = d.chat.some((c) => c.mid === mid && c.from === 'member' && c.at > (prev ?? ''));
        if (!prev || fresh) {
          d.chatReads[s.subject + '|' + mid] = new Date().toISOString();
          save(d);
          if (fresh) ring(memberTopic(mid));
        }
      }
      return chatPage(d, mid, r);
    },

    async trainerChatSend(token, mid, text) {
      const { d, s } = trainer(token);
      if (!d.members.some((m) => m.id === mid)) throw new Error('member not found');
      if (d.assign[mid] !== s.subject) throw new Error('not assigned');
      const c = chatPut(d, { mid, from: 'trainer', tid: s.subject, by: staffLabel(d, s), text });
      d.chatReads[s.subject + '|' + mid] = c.at;
      save(d);
      return c;
    },

    async adminSetMemberTrainer(token, mid, tid) {
      const d = admin(token);
      if (!d.members.some((m) => m.id === mid)) throw new Error('member not found');
      if (tid && !d.trainers.some((t) => t.id === tid)) throw new Error('trainer not found');
      if (tid) {
        d.assign[mid] = tid;
        d.chatReads[tid + '|' + mid] ??= new Date().toISOString();
      } else delete d.assign[mid];
      save(d);
    },

    chatListen(key, onRing) {
      const set = ringers.get(key) ?? new Set();
      set.add(onRing);
      ringers.set(key, set);
      return () => set.delete(onRing);
    },

    // 개발용: 켜고 끄는 화면만 시험한다 (실제로 알림을 보내지는 않는다)
    async pushKey() {
      return DEV_PUSH_KEY;
    },

    async userPushSet(code, s, on, remind) {
      const m = who(load(), code);
      devPush.set('member:' + m.id + ':' + s.endpoint, remind);
      if (!on) devPush.delete('member:' + m.id + ':' + s.endpoint);
      return on;
    },

    async guardianPushSet(code, s, on) {
      const m = byCode(load().members, (x) => x.guardianCode, code);
      if (!m) throw new AuthError('invalid code');
      if (on) devPush.set('guardian:' + m.id + ':' + s.endpoint, false);
      else devPush.delete('guardian:' + m.id + ':' + s.endpoint);
      return on;
    },

    async trainerPushSet(token, s, on) {
      const { s: ses } = trainer(token);
      if (on) devPush.set('trainer:' + ses.subject + ':' + s.endpoint, false);
      else devPush.delete('trainer:' + ses.subject + ':' + s.endpoint);
      return on;
    },

    async staffSetOffday(token, lid, date, off) {
      const { d } = staff(token);
      if (!d.lessons.some((x) => x.id === lid)) throw new Error('lesson not found');
      d.offdays = d.offdays.filter((o) => !(o.lid === lid && o.date === date));
      if (off) d.offdays.push({ lid, date });
      save(d);
    },

    async videoUrl(p) {
      if (p.videoUrl) return { url: p.videoUrl };
      const blob = await idbDo<Blob | undefined>('readonly', (st) => st.get(p.videoKey || p.id));
      return blob ? { url: URL.createObjectURL(blob), revoke: true } : null;
    },
  };
}
