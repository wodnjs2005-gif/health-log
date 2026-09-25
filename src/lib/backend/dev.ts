// 개발용 가짜 서버: `npm run dev` 에서 Supabase 설정이 없을 때만 쓴다. 배포용 빌드에는 들어가지 않는다 (index.ts).
// 서버(supabase/migrations)와 같은 규칙으로 동작한다: 로그인 표, 관리자 잠금, 관리자 전용 기능, 트레이너 번호.
// 데이터는 이 브라우저의 localStorage, 영상 파일은 IndexedDB 에만 저장된다.
import { CODE_CHARS, genCode, normCode } from '../code';
import { addDays, todayYmd } from '../date';
import { normRank } from '../rank';
import { normTags, TAGS_PER_MEMBER } from '../tags';
import {
  AuthError,
  type Backend,
  type DataSet,
  type Exercise,
  type Meal,
  type Member,
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
  return d;
};

const toPublic = (m: Member): PublicMember => ({ id: m.id, name: m.name, age: m.age, birth: m.birth ?? null });

const who = (d: DevDB, code: string) => {
  const m = d.members.find((x) => x.code === normCode(code));
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
});

/** 유효한 로그인 표 (없거나 끝났으면 undefined) */
const sessionOf = (d: DevDB, token: string) => d.sessions.find((s) => s.token === token && s.expires > new Date().toISOString());

const newSession = (d: DevDB, role: StaffRole, subject: string) => {
  const now = new Date();
  d.sessions = d.sessions.filter((s) => s.expires > now.toISOString());
  const token = randomToken();
  d.sessions.push({ token, role, subject, expires: new Date(now.getTime() + HOURS[role] * 3600_000).toISOString() });
  return token;
};

export function createDevBackend(): Backend {
  /** 관리자·트레이너 모두 */
  const staff = (token: string) => {
    const d = load();
    const s = sessionOf(d, token);
    if (!s) throw new AuthError('invalid session');
    return { d, s };
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
      const m = d.members.find((x) => x.code === normCode(code));
      return m ? userData(d, m) : null;
    },

    async guardianGet(code) {
      const d = load();
      const m = d.members.find((x) => x.guardianCode === normCode(code));
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
      const rec: Meal = { id: uid(), mid: m.id, date: r.date, meal: r.meal, menu: r.menu, amount: r.amount, memo: r.memo || '' };
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
      const t = d.trainers.find((x) => x.code === normCode(code));
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
        me: { role: s.role, name, rank: tr?.rank ?? '' },
        // 트레이너에게는 개인·보호자 번호를 보내지 않는다
        members: isAdmin ? d.members : d.members.map(({ code: _c, guardianCode: _g, ...m }) => ({ ...m, code: '' })),
        trainers: isAdmin ? d.trainers : null,
        ex: d.ex,
        meals: d.meals,
        programs: d.programs,
        views: d.views,
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
      d.sessions = d.sessions.filter((s) => !(s.role === 'trainer' && s.subject === id));
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

    async staffAddProgram(token, p, file) {
      const { d } = staff(token);
      if (!p.mids.length) throw new Error('no members');
      const id = 'p' + uid();
      const rec: Program = {
        id, title: p.title, mids: p.mids, kind: p.kind, min: p.min, memo: p.memo || '', date: todayYmd(),
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
      const { d } = staff(token);
      const p = d.programs.find((x) => x.id === id);
      if (p?.videoKey) idbDo('readwrite', (st) => st.delete(p.videoKey!)).catch(() => {});
      d.programs = d.programs.filter((x) => x.id !== id);
      d.views = d.views.filter((v) => v.pid !== id);
      save(d);
    },

    async staffSetProgramMembers(token, id, mids) {
      const { d } = staff(token);
      const p = d.programs.find((x) => x.id === id);
      if (!p) throw new Error('program not found'); // 다른 직원이 먼저 지운 영상
      // 삭제된 이용자는 빼고 저장. 이미 따라한 기록(views·운동일지)은 그대로 둔다
      const next = [...new Set(mids)].filter((mid) => d.members.some((m) => m.id === mid));
      if (!next.length) throw new Error('no members');
      p.mids = next;
      save(d);
      return next;
    },

    async videoUrl(p) {
      if (p.videoUrl) return { url: p.videoUrl };
      const blob = await idbDo<Blob | undefined>('readonly', (st) => st.get(p.videoKey || p.id));
      return blob ? { url: URL.createObjectURL(blob), revoke: true } : null;
    },
  };
}
