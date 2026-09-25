import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext, scrollTop, type AppCtx } from './AppContext';
import { Layout, Loading, Toast } from './components/Layout';
import { useFontSize } from './hooks/useFontSize';
import { useToast } from './hooks/useToast';
import {
  backend,
  isAuthError,
  type Backend,
  type DataSet,
  type GuardianData,
  type StaffData,
  type StaffSession,
  type Trainer,
} from './lib/backend';
import { CODE_LEN, normCode, TRAINER_CODE_LEN } from './lib/code';
import { todayYmd } from './lib/date';
import { mergeGuardianData, readGuardianCodes, saveGuardianCodes, type GuardianLink } from './lib/guardian';
import { LS, lsDel, lsGet, lsSet } from './lib/storage';
import { AdminLogin } from './screens/AdminLogin';
import { CodeLogin } from './screens/CodeLogin';
import { Entry } from './screens/Entry';
import { SetupNeeded } from './screens/SetupNeeded';
import { AdminApp } from './screens/admin/AdminApp';
import { GuardianApp } from './screens/guardian/GuardianApp';
import { TrainerApp } from './screens/trainer/TrainerApp';
import { UserApp } from './screens/user/UserApp';

export type Role = 'user' | 'guardian' | 'trainer' | 'admin';
/** code = 이용자 번호, gcode = 보호자 번호, tcode = 트레이너 번호, admin = 관리자 아이디·비밀번호 입력 */
type Auth = null | 'loading' | 'code' | 'gcode' | 'tcode' | 'admin';

const EMPTY: DataSet = { members: [], ex: [], meals: [], programs: [], views: [] };
const NET_ERR = '연결되지 않아요. 인터넷을 확인하고 다시 눌러주세요.';
const SERVER_ERR = '서버에서 처리하지 못했어요. 잠시 뒤 다시 눌러주세요. 계속되면 관리자에게 알려주세요.';
/** fetch 자체가 실패하면(인터넷 끊김) TypeError, 서버가 오류로 답하면 그 밖의 오류 */
const errText = (e: unknown) => (e instanceof TypeError ? NET_ERR : SERVER_ERR);
const BAD_CODE = '번호가 맞지 않아요. 다시 확인해주세요.';
const GUARDIAN_CHANGED = '번호가 바뀐 분이 있어요. 새 보호자 번호를 입력해주세요.';
const ROLE_TITLE: Record<Role, string> = { user: '이용자', guardian: '보호자', trainer: '트레이너', admin: '관리자' };
const SAVED_KEY: Record<Role, string> = { user: LS.code, guardian: LS.guardian, trainer: LS.trainer, admin: LS.admin };
const LOGIN_AUTH: Record<Role, Auth> = { user: 'code', guardian: 'gcode', trainer: 'tcode', admin: 'admin' };
const EXPIRED_MSG: Record<Role, string> = {
  user: '번호가 바뀌었어요. 새 번호를 입력해주세요.',
  guardian: GUARDIAN_CHANGED,
  trainer: '로그인이 끝났어요. 트레이너 번호를 다시 입력해주세요.',
  admin: '로그인이 끝났어요. 다시 로그인해주세요.',
};

type GuardianEntry = { code: string; d: GuardianData };

const shortCode = (len: number) => `${len}자리 번호를 모두 입력해주세요.`;

/** 잠긴 시각을 '오후 3:25' 처럼 */
const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
};

export default function App() {
  // 배포용 빌드인데 Supabase 주소·키가 없으면 앱을 쓸 수 없다
  return backend ? <Main be={backend} /> : <SetupNeeded />;
}

function Main({ be }: { be: Backend }) {
  const { fs, setFs } = useFontSize();
  const { toast, showToast } = useToast();

  const [ready, setReady] = useState(false);
  const [devHints, setDevHints] = useState<Awaited<ReturnType<Backend['devHints']>>>(null);
  const [today, setToday] = useState(todayYmd);

  const [role, setRole] = useState<Role | null>(null);
  const [auth, setAuth] = useState<Auth>(null);
  const [userCode, setUserCode] = useState('');
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [data, setData] = useState<DataSet>(EMPTY);
  const [guardianEntries, setGuardianEntries] = useState<GuardianEntry[]>([]);

  const [codeInput, setCodeInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // 역할을 바꾸거나 처음으로 돌아가면 값이 바뀐다. 늦게 도착한 응답은 버린다.
  const session = useRef(0);
  const cur = useRef({ role, auth, userCode, staff, guardianEntries });
  cur.current = { role, auth, userCode, staff, guardianEntries };

  useEffect(() => {
    let alive = true;
    be.devHints()
      .catch(() => null)
      .then((h) => {
        if (!alive) return;
        setDevHints(h);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [be]);

  const clearSession = useCallback(() => {
    session.current++;
    setData(EMPTY);
    setMe(null);
    setUserCode('');
    setStaff(null);
    setTrainers([]);
    setGuardianEntries([]);
    setLoggingIn(false);
  }, []);

  /** 로그인 화면으로 (저장된 번호·로그인 표는 지운다) */
  const toLogin = useCallback((r: Role, message: string) => {
    lsDel(SAVED_KEY[r]);
    setAuth(LOGIN_AUTH[r]);
    setLoginError(message);
    setLoggingIn(false);
  }, []);

  // --- 이용자 -------------------------------------------------------------------
  const loginUser = useCallback(
    async (raw: string, silent = false) => {
      const code = normCode(raw);
      if (code.length !== CODE_LEN) return setLoginError(shortCode(CODE_LEN));
      const sid = session.current;
      setLoggingIn(true);
      setLoginError('');
      let d;
      try {
        d = await be.userGet(code);
      } catch (e) {
        if (sid !== session.current) return;
        setLoggingIn(false);
        setAuth('code');
        setCodeInput(code);
        setLoginError(errText(e));
        return;
      }
      if (sid !== session.current) return;
      setLoggingIn(false);
      if (!d) {
        setCodeInput(silent ? '' : code);
        return toLogin('user', silent ? '' : BAD_CODE);
      }
      lsSet(LS.code, code);
      setUserCode(code);
      setMe(d.member.id);
      setData({ members: [d.member], ex: d.ex || [], meals: d.meals || [], programs: d.programs || [], views: d.views || [] });
      setAuth(null);
    },
    [be, toLogin],
  );

  // --- 보호자 -------------------------------------------------------------------
  /** 보호자 번호 여러 개를 한꺼번에 확인. 연결이 안 되면 throw */
  const fetchGuardians = useCallback(
    async (codes: string[]) => {
      const res = await Promise.all(codes.map((c) => be.guardianGet(c)));
      return codes.map((code, i) => ({ code, d: res[i] })).filter((x): x is GuardianEntry => !!x.d);
    },
    [be],
  );

  /** 보호자가 보는 사람 목록을 바꾸면 데이터·저장된 번호도 함께 바꾼다 */
  const applyGuardians = useCallback((list: GuardianEntry[]) => {
    setGuardianEntries(list);
    setData(mergeGuardianData(list.map((x) => x.d)));
    saveGuardianCodes(list.map((x) => x.code));
  }, []);

  /** 저장된 보호자 번호들로 들어가기. 무효가 된 번호는 빼고, 남은 게 없으면 번호 입력 화면으로 */
  const loginGuardianSaved = useCallback(
    async (codes: string[]) => {
      const sid = session.current;
      let ok: GuardianEntry[];
      try {
        ok = await fetchGuardians(codes);
      } catch (e) {
        if (sid !== session.current) return;
        setAuth('gcode');
        setLoginError(errText(e));
        return;
      }
      if (sid !== session.current) return;
      if (!ok.length) return toLogin('guardian', GUARDIAN_CHANGED);
      applyGuardians(ok);
      setAuth(null);
      if (ok.length < codes.length) showToast(GUARDIAN_CHANGED);
    },
    [fetchGuardians, applyGuardians, showToast, toLogin],
  );

  /** 보호자 번호 하나 확인. 오류 문구 또는 받은 데이터 */
  const checkGuardianCode = useCallback(
    async (raw: string): Promise<{ error: string } | { entry: GuardianEntry }> => {
      const code = normCode(raw);
      if (code.length !== CODE_LEN) return { error: shortCode(CODE_LEN) };
      if (cur.current.guardianEntries.some((x) => x.code === code)) return { error: '이미 추가한 분이에요.' };
      try {
        const d = await be.guardianGet(code);
        return d ? { entry: { code, d } } : { error: BAD_CODE };
      } catch (e) {
        return { error: errText(e) };
      }
    },
    [be],
  );

  const loginGuardian = useCallback(
    async (raw: string) => {
      const sid = session.current;
      setLoggingIn(true);
      setLoginError('');
      const r = await checkGuardianCode(raw);
      if (sid !== session.current) return;
      setLoggingIn(false);
      if ('error' in r) {
        setCodeInput(normCode(raw));
        return setLoginError(r.error);
      }
      applyGuardians([r.entry]);
      setAuth(null);
    },
    [checkGuardianCode, applyGuardians],
  );

  const addGuardian = useCallback(
    async (raw: string): Promise<{ mid: string } | { error: string }> => {
      const sid = session.current;
      const r = await checkGuardianCode(raw);
      if (sid !== session.current) return { error: '' };
      if ('error' in r) return r;
      const list = cur.current.guardianEntries;
      const mid = r.entry.d.member.id;
      if (list.some((x) => x.d.member.id === mid)) return { error: '이미 추가한 분이에요.' };
      applyGuardians([...list, r.entry]);
      return { mid };
    },
    [checkGuardianCode, applyGuardians],
  );

  const removeGuardian = useCallback(
    (mid: string) => applyGuardians(cur.current.guardianEntries.filter((x) => x.d.member.id !== mid)),
    [applyGuardians],
  );

  // --- 트레이너·관리자 ------------------------------------------------------------
  const applyStaff = useCallback((token: string, d: StaffData) => {
    setStaff({ token, role: d.me.role, name: d.me.name });
    setTrainers(d.trainers ?? []);
    setData({ members: d.members || [], ex: d.ex || [], meals: d.meals || [], programs: d.programs || [], views: d.views || [] });
  }, []);

  /** 로그인 표로 직원 데이터 받기. 표가 끝났으면 로그인 화면으로 */
  const enterStaff = useCallback(
    async (r: 'trainer' | 'admin', token: string, silent: boolean) => {
      const sid = session.current;
      let d: StaffData | null;
      try {
        d = await be.staffGet(token);
      } catch (e) {
        if (sid !== session.current) return;
        setAuth(LOGIN_AUTH[r]);
        setLoggingIn(false);
        setLoginError(errText(e));
        return;
      }
      if (sid !== session.current) return;
      // 트레이너 표로 관리자 화면에 들어오는 일은 없게
      if (!d || d.me.role !== r) return toLogin(r, silent ? '' : EXPIRED_MSG[r]);
      lsSet(SAVED_KEY[r], token);
      applyStaff(token, d);
      setLoggingIn(false);
      setAuth(null);
    },
    [be, toLogin, applyStaff],
  );

  const loginTrainer = useCallback(
    async (raw: string) => {
      const code = normCode(raw);
      if (code.length !== TRAINER_CODE_LEN) return setLoginError(shortCode(TRAINER_CODE_LEN));
      const sid = session.current;
      setLoggingIn(true);
      setLoginError('');
      let s: StaffSession | null;
      try {
        s = await be.trainerLogin(code);
      } catch (e) {
        if (sid !== session.current) return;
        setLoggingIn(false);
        setCodeInput(code);
        return setLoginError(errText(e));
      }
      if (sid !== session.current) return;
      if (!s) {
        setLoggingIn(false);
        setCodeInput(code);
        return setLoginError(BAD_CODE);
      }
      await enterStaff('trainer', s.token, false);
    },
    [be, enterStaff],
  );

  const loginAdmin = useCallback(
    async (loginId: string, pw: string) => {
      if (!loginId.trim() || !pw) return setLoginError('아이디와 비밀번호를 모두 입력해주세요.');
      const sid = session.current;
      setLoggingIn(true);
      setLoginError('');
      let r;
      try {
        r = await be.adminLogin(loginId, pw);
      } catch (e) {
        if (sid !== session.current) return;
        setLoggingIn(false);
        return setLoginError(errText(e));
      }
      if (sid !== session.current) return;
      if (!r.ok) {
        setLoggingIn(false);
        if (r.error === 'locked') {
          const t = timeLabel(r.until);
          return setLoginError(`비밀번호를 여러 번 틀려서 잠겼어요. ${t ? `${t} 이후에` : '10분 뒤에'} 다시 해주세요.`);
        }
        return setLoginError(
          r.left !== undefined && r.left <= 2
            ? `아이디 또는 비밀번호가 맞지 않아요. ${r.left}번 더 틀리면 10분 동안 잠겨요.`
            : '아이디 또는 비밀번호가 맞지 않아요.',
        );
      }
      await enterStaff('admin', r.session.token, false);
    },
    [be, enterStaff],
  );

  // --- 역할 고르기·로그아웃 -----------------------------------------------------------
  const startRole = useCallback(
    (r: Role) => {
      clearSession();
      setRole(r);
      setCodeInput('');
      setLoginError('');
      scrollTop();
      // 개발용 안내는 번호가 새로 발급됐을 수 있으니 들어갈 때마다 다시 받는다 (서버 모드에서는 null)
      if (be.mode === 'dev') void be.devHints().then(setDevHints, () => {});
      if (r === 'guardian') {
        const codes = readGuardianCodes();
        setAuth(codes.length ? 'loading' : 'gcode');
        if (codes.length) void loginGuardianSaved(codes);
        return;
      }
      const saved = lsGet(SAVED_KEY[r]);
      setAuth(saved ? 'loading' : LOGIN_AUTH[r]);
      if (!saved) return;
      if (r === 'user') void loginUser(saved, true);
      else void enterStaff(r, saved, true);
    },
    [be, clearSession, loginUser, loginGuardianSaved, enterStaff],
  );

  /** 번호가 무효가 됐거나 로그인이 끝났을 때 */
  const expired = useCallback(() => {
    const r = cur.current.role;
    if (!r) return;
    clearSession();
    setCodeInput('');
    toLogin(r, EXPIRED_MSG[r]);
    scrollTop();
  }, [clearSession, toLogin]);

  const fail = useCallback(
    (e: unknown) => {
      if (isAuthError(e)) return expired();
      showToast(e instanceof TypeError ? '저장하지 못했어요. 인터넷을 확인해주세요' : '저장하지 못했어요. 잠시 뒤 다시 해주세요');
    },
    [expired, showToast],
  );

  const refresh = useCallback(async () => {
    const s = cur.current;
    if (s.auth || !s.role) return;
    const sid = session.current;
    try {
      if (s.role === 'user' && s.userCode) {
        const d = await be.userGet(s.userCode);
        if (sid !== session.current) return;
        if (!d) return expired();
        setData({ members: [d.member], ex: d.ex || [], meals: d.meals || [], programs: d.programs || [], views: d.views || [] });
      } else if (s.role === 'guardian') {
        const codes = s.guardianEntries.map((x) => x.code);
        if (!codes.length) return;
        const ok = await fetchGuardians(codes);
        if (sid !== session.current) return;
        if (!ok.length) return expired();
        applyGuardians(ok);
        if (ok.length < codes.length) showToast(GUARDIAN_CHANGED);
      } else if (s.staff) {
        const d = await be.staffGet(s.staff.token);
        if (sid !== session.current) return;
        if (!d) return expired();
        applyStaff(s.staff.token, d);
      }
    } catch {
      /* 연결이 안 되면 지금 화면을 그대로 둔다 */
    }
  }, [be, expired, fetchGuardians, applyGuardians, applyStaff, showToast]);

  // 앱이 다시 화면에 나타나면 새로 받는다
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      setToday(todayYmd());
      void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  /** ‹ 처음: 불러온 데이터는 비우고, 저장된 번호·로그인 표는 남긴다 */
  const goEntry = useCallback(() => {
    clearSession();
    setRole(null);
    setAuth(null);
    setLoginError('');
    scrollTop();
  }, [clearSession]);

  const logout = useCallback(() => {
    const { role: r, staff: s } = cur.current;
    if (r) lsDel(SAVED_KEY[r]);
    // 서버의 로그인 표도 끝낸다 (실패해도 기기에서는 이미 지웠다)
    if (s) void be.staffLogout(s.token).catch(() => {});
    goEntry();
    showToast('로그아웃했어요');
  }, [be, goEntry, showToast]);

  const guardians: GuardianLink[] = useMemo(
    () => guardianEntries.map((x) => ({ code: x.code, mid: x.d.member.id })),
    [guardianEntries],
  );

  const ctx: AppCtx = useMemo(
    () => ({
      be, today, data, setData, userCode, me, guardians, addGuardian, removeGuardian,
      staffToken: staff?.token ?? '', staffName: staff?.name ?? '', trainers, setTrainers,
      toast: showToast, fail, refresh, logout, goEntry, fs, setFs,
    }),
    [be, today, data, userCode, me, guardians, addGuardian, removeGuardian, staff, trainers, showToast, fail, refresh, logout, goEntry, fs, setFs],
  );

  const onCodeChange = (v: string, len: number, submit: (v: string) => void) => {
    setCodeInput(v);
    setLoginError('');
    if (v.length === len && !loggingIn) submit(v);
  };

  let screen;
  if (!ready || auth === 'loading') {
    screen = (
      <Layout title={role ? ROLE_TITLE[role] : '나의 건강일지'} onBack={role ? goEntry : undefined}>
        <Loading />
      </Layout>
    );
  } else if (!role) {
    screen = <Entry dev={be.mode === 'dev'} onPick={startRole} />;
  } else if (auth === 'code') {
    screen = (
      <CodeLogin
        title="이용자"
        heading="개인 번호를 입력하세요"
        desc="트레이너나 관리자에게 받은 6자리 번호예요."
        value={codeInput}
        error={loginError}
        busy={loggingIn}
        devHint={devHints?.user}
        onChange={(v) => onCodeChange(v, CODE_LEN, (c) => void loginUser(c))}
        onSubmit={() => void loginUser(codeInput)}
      />
    );
  } else if (auth === 'gcode') {
    screen = (
      <CodeLogin
        title="보호자"
        heading="보호자 번호를 입력하세요"
        desc="관리자에게 받은 보호자용 6자리 번호예요. 이용자의 개인 번호와 달라요."
        value={codeInput}
        error={loginError}
        busy={loggingIn}
        devHint={devHints?.guardian}
        color="plum"
        onChange={(v) => onCodeChange(v, CODE_LEN, (c) => void loginGuardian(c))}
        onSubmit={() => void loginGuardian(codeInput)}
      />
    );
  } else if (auth === 'tcode') {
    screen = (
      <CodeLogin
        title="트레이너"
        heading="트레이너 번호를 입력하세요"
        desc="관리자에게 받은 8자리 번호예요."
        value={codeInput}
        error={loginError}
        busy={loggingIn}
        devHint={devHints?.trainer}
        color="orange"
        length={TRAINER_CODE_LEN}
        onChange={(v) => onCodeChange(v, TRAINER_CODE_LEN, (c) => void loginTrainer(c))}
        onSubmit={() => void loginTrainer(codeInput)}
      />
    );
  } else if (auth === 'admin') {
    screen = (
      <AdminLogin
        error={loginError}
        busy={loggingIn}
        devHint={devHints?.admin}
        onEdit={() => setLoginError('')}
        onSubmit={(id, pw) => void loginAdmin(id, pw)}
      />
    );
  } else if (role === 'user') {
    screen =
      me && data.members.some((m) => m.id === me) ? (
        <UserApp />
      ) : (
        <Layout title="이용자" onBack={goEntry}>
          <Loading />
        </Layout>
      );
  } else if (role === 'guardian') {
    screen = <GuardianApp />;
  } else if (role === 'trainer') {
    screen = <TrainerApp />;
  } else {
    screen = <AdminApp />;
  }

  return (
    <AppContext.Provider value={ctx}>
      {screen}
      <Toast text={toast} />
    </AppContext.Provider>
  );
}
