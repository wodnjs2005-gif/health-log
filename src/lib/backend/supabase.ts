// 서버 모드: 테이블에는 직접 접근하지 않고 supabase/migrations 의 RPC 함수로만 접근한다.
import { normCode } from '../code';
import {
  AuthError,
  LimitError,
  type Backend,
  type CustomFood,
  type Exercise,
  type FoodRequest,
  type Lesson,
  type GuardianData,
  type Meal,
  type ChatMessage,
  type ChatSeen,
  type ChatTrainer,
  type ChatRoom,
  type Measure,
  type Member,
  type NewMeasure,
  type Note,
  type Notice,
  type TestCategory,
  type TestItem,
  type TestResult,
  type Program,
  type StaffData,
  type Trainer,
  type UserData,
  type View,
} from './types';
import { listenRing } from './realtime';

/**
 * 환경변수에 넣은 주소를 https://<ref>.supabase.co 로 정리한다.
 * 끝에 /rest/v1 같은 경로를 붙였거나, 대시보드 주소(supabase.com/dashboard/project/<ref>)를 넣은 경우도 받아준다.
 */
export function supabaseBase(url: string): string {
  const raw = url.trim();
  const dash = raw.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

export function createSupabaseBackend(url: string, key: string): Backend {
  const base = supabaseBase(url);

  const headers = (contentType = 'application/json') => {
    const h: Record<string, string> = { apikey: key, 'Content-Type': contentType };
    // 예전 anon 키(JWT)는 Authorization 도 필요하다. 새 publishable 키는 apikey 만.
    if (/^eyJ/.test(key)) h.Authorization = 'Bearer ' + key;
    return h;
  };

  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
    const t = await r.text();
    if (!r.ok) {
      // 번호가 무효이거나 로그인 표가 끝남 → 로그인 화면으로
      if (/invalid code|not allowed|invalid session/.test(t)) throw new AuthError(t);
      // 번호를 여러 번 틀려 잠시 막힘
      if (/too many attempts/.test(t)) throw new LimitError();
      throw new Error(t || r.statusText);
    }
    return (t ? JSON.parse(t) : null) as T;
  };

  /** 이용자 기록 바꾸기: 번호가 틀리면 서버가 null 을 돌려준다 (틀린 횟수 기록이 취소되지 않도록 오류 대신) */
  const userRpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const r = await rpc<T | null>(fn, args);
    if (r === null) throw new AuthError('invalid code');
    return r;
  };

  const uid = () => {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return Array.from(a, (n) => n.toString(36)).join('').slice(0, 8);
  };

  const measureArgs = (m: NewMeasure) => ({ p_date: m.date, p_weight: m.weight, p_sbp: m.sbp, p_dbp: m.dbp, p_glu: m.glu });

  return {
    mode: 'server',

    async devHints() {
      return null;
    },

    guardianGet: (code) => rpc<GuardianData | null>('guardian_get', { p_code: normCode(code) }),

    userGet: (code) => rpc<UserData | null>('user_get', { p_code: normCode(code) }),

    userAddEx: (code, r) =>
      userRpc<Exercise>('user_add_ex', {
        p_code: normCode(code), p_date: r.date, p_kind: r.kind, p_min: r.min, p_level: r.level, p_memo: r.memo || '',
      }),

    userAddMeal: (code, r) =>
      userRpc<Meal>('user_add_meal', {
        p_code: normCode(code), p_date: r.date, p_meal: r.meal, p_menu: r.menu, p_amount: r.amount, p_memo: r.memo || '',
        p_foods: r.foods, p_nutri: r.nutri,
      }),

    userDelEx: (code, id) => rpc<void>('user_del_ex', { p_code: normCode(code), p_id: id }),

    userDelMeal: (code, id) => rpc<void>('user_del_meal', { p_code: normCode(code), p_id: id }),

    userAddView: (code, pid, date) =>
      userRpc<{ view: View; ex: Exercise }>('user_add_view', { p_code: normCode(code), p_program: pid, p_date: date }),

    userNoteSeen: (code, id) => userRpc<string[]>('user_note_seen', { p_code: normCode(code), p_note: id }),

    userAddMeasure: (code, m) => userRpc<Measure>('user_add_measure', { p_code: normCode(code), ...measureArgs(m) }),

    userDelMeasure: (code, id) => rpc<void>('user_del_measure', { p_code: normCode(code), p_id: id }),

    // --- 로그인 ---------------------------------------------------------------
    async adminLogin(loginId, pw) {
      const r = await rpc<{ token?: string; name?: string; error?: 'invalid' | 'locked'; left?: number; until?: string }>(
        'admin_login',
        { p_login_id: loginId, p_pw: pw },
      );
      if (r.token) return { ok: true, session: { token: r.token, role: 'admin', name: r.name ?? '관리자' } };
      if (r.error === 'locked') return { ok: false, error: 'locked', until: r.until ?? '' };
      return { ok: false, error: 'invalid', left: r.left };
    },

    async trainerLogin(code) {
      const r = await rpc<{ token: string; name: string } | null>('trainer_login', { p_code: normCode(code) });
      return r ? { token: r.token, role: 'trainer', name: r.name } : null;
    },

    staffLogout: (token) => rpc<void>('staff_logout', { p_token: token }),

    async adminChangePassword(token, oldPw, newPw) {
      const r = await rpc<{ ok?: boolean; error?: 'wrong' | 'short' }>('admin_change_password', {
        p_token: token, p_old: oldPw, p_new: newPw,
      });
      return r.ok ? null : (r.error ?? 'wrong');
    },

    // --- 직원 데이터 -----------------------------------------------------------
    staffGet: (token) => rpc<StaffData | null>('staff_get', { p_token: token }),

    staffAddMember: (token, name, birth) => rpc<Member>('staff_add_member', { p_token: token, p_name: name, p_birth: birth }),

    staffDelMember: (token, id) => rpc<void>('staff_del_member', { p_token: token, p_id: id }),

    staffSetBirth: (token, id, birth) => rpc<void>('staff_set_birth', { p_token: token, p_id: id, p_birth: birth }),

    staffNewCode: (token, id) => rpc<string>('staff_new_code', { p_token: token, p_id: id }),

    staffNewGuardianCode: (token, id) => rpc<string>('staff_new_guardian_code', { p_token: token, p_id: id }),

    adminAddTrainer: (token, name, rank) => rpc<Trainer>('admin_add_trainer', { p_token: token, p_name: name, p_rank: rank }),

    customFoodsGet: () => rpc<CustomFood[]>('custom_foods_get', {}),

    adminFoodRequests: (token) => rpc<FoodRequest[]>('admin_food_requests', { p_token: token }),

    adminSaveFood: (token, f) =>
      rpc<{ food: CustomFood; updated: number }>('admin_save_food', {
        p_token: token, p_name: f.name, p_size: f.size, p_unit: f.unit,
        p_nutri: { kcal: f.kcal, carb: f.carb, prot: f.prot, fat: f.fat, na: f.na },
      }),

    adminDelFood: (token, name) => rpc<void>('admin_del_food', { p_token: token, p_name: name }),

    staffAddLesson: (token, l) =>
      rpc<Lesson>('staff_add_lesson', { p_token: token, p_name: l.name, p_days: l.days, p_mids: l.mids }),

    staffUpdateLesson: (token, id, l) =>
      rpc<Lesson>('staff_update_lesson', { p_token: token, p_id: id, p_name: l.name, p_days: l.days, p_mids: l.mids }),

    staffDelLesson: (token, id) => rpc<void>('staff_del_lesson', { p_token: token, p_id: id }),

    staffSetAttendance: (token, lid, mid, date, present) =>
      rpc<void>('staff_set_attendance', { p_token: token, p_lesson: lid, p_member: mid, p_date: date, p_present: present }),

    staffSetAttendanceMany: (token, lid, date, mids) =>
      rpc<number>('staff_set_attendance_many', { p_token: token, p_lesson: lid, p_date: date, p_members: mids }),

    staffSetOffday: (token, lid, date, off) =>
      rpc<void>('staff_set_offday', { p_token: token, p_lesson: lid, p_date: date, p_off: off }),

    staffAddNote: (token, mid, text) => rpc<Note>('staff_add_note', { p_token: token, p_member: mid, p_text: text }),

    staffDelNote: (token, id) => rpc<void>('staff_del_note', { p_token: token, p_id: id }),

    staffAddMeasure: (token, mid, m) => rpc<Measure>('staff_add_measure', { p_token: token, p_member: mid, ...measureArgs(m) }),

    staffDelMeasure: (token, id) => rpc<void>('staff_del_measure', { p_token: token, p_id: id }),

    staffAddNotice: (token, text, until) => rpc<Notice>('staff_add_notice', { p_token: token, p_text: text, p_until: until }),

    staffDelNotice: (token, id) => rpc<void>('staff_del_notice', { p_token: token, p_id: id }),

    adminAddTestCategory: (token, name) => rpc<TestCategory>('admin_add_test_category', { p_token: token, p_name: name }),

    adminUpdateTestCategory: (token, id, name) => rpc<TestCategory>('admin_update_test_category', { p_token: token, p_id: id, p_name: name }),

    adminDelTestCategory: (token, id) => rpc<void>('admin_del_test_category', { p_token: token, p_id: id }),

    adminAddTestItem: (token, it) =>
      rpc<TestItem>('admin_add_test_item', {
        p_token: token, p_name: it.name, p_unit: it.unit, p_better: it.better, p_category: it.category, p_kind: it.kind,
      }),

    adminUpdateTestItem: (token, id, it) =>
      rpc<TestItem>('admin_update_test_item', {
        p_token: token, p_id: id, p_name: it.name, p_unit: it.unit, p_better: it.better, p_category: it.category,
      }),

    adminDelTestItem: (token, id) => rpc<void>('admin_del_test_item', { p_token: token, p_id: id }),

    trainerSaveTests: (token, mid, date, values) =>
      rpc<TestResult[]>('trainer_save_tests', { p_token: token, p_member: mid, p_date: date, p_values: values }),

    trainerDelTests: (token, mid, date) => rpc<void>('trainer_del_tests', { p_token: token, p_member: mid, p_date: date }),

    staffSetPhoto: (token, kind, id, data) => rpc<string | null>('staff_set_photo', { p_token: token, p_kind: kind, p_id: id, p_data: data }),

    staffPhotos: (token, ids) => rpc<Record<string, string>>('staff_photos', { p_token: token, p_ids: ids }),

    userPhotos: (code, ids) => userRpc<Record<string, string>>('user_photos', { p_code: normCode(code), p_ids: ids }),

    guardianPhotos: (code, ids) => userRpc<Record<string, string>>('guardian_photos', { p_code: normCode(code), p_ids: ids }),

    userSetPhoto: async (code, data) => (await userRpc<{ v: string | null }>('user_set_photo', { p_code: normCode(code), p_data: data })).v,

    guardianSetPhoto: async (code, data) => (await userRpc<{ v: string | null }>('guardian_set_photo', { p_code: normCode(code), p_data: data })).v,

    userChatStatus: async (code) => {
      const r = await userRpc<{ key: string; unread: number; trainer?: ChatTrainer | null }>('user_chat_status', { p_code: normCode(code) });
      return { ...r, trainer: r.trainer ?? null };
    },

    adminSetMemberTrainer: (token, mid, tid) => rpc<void>('admin_set_member_trainer', { p_token: token, p_member: mid, p_trainer: tid }),

    userChatGet: (code, r = {}) => userRpc<ChatMessage[]>('user_chat_get', { p_code: normCode(code), p_after: r.after ?? null, p_before: r.before ?? null }),

    userChatSend: (code, text) => userRpc<ChatMessage>('user_chat_send', { p_code: normCode(code), p_text: text }),

    userChatSeen: (code) => userRpc<ChatSeen>('user_chat_seen', { p_code: normCode(code) }),

    staffChatSeen: (token, mid) => rpc<ChatSeen>('staff_chat_seen', { p_token: token, p_member: mid }),

    trainerSharePrograms: (token, pids, mids, on) =>
      rpc<Record<string, string[]>>('trainer_share_programs', { p_token: token, p_programs: pids, p_members: mids, p_on: on }),

    staffChatList: (token) => rpc<{ key: string; rooms: ChatRoom[] }>('staff_chat_list', { p_token: token }),

    staffChatGet: (token, mid, r = {}) => rpc<ChatMessage[]>('staff_chat_get', { p_token: token, p_member: mid, p_after: r.after ?? null, p_before: r.before ?? null }),

    trainerChatSend: (token, mid, text) => rpc<ChatMessage>('trainer_chat_send', { p_token: token, p_member: mid, p_text: text }),

    chatListen: (topic, onRing) => listenRing(base, key, topic, onRing),

    guardianSetRelation: async (code, relation) =>
      (await userRpc<{ relation: string }>('guardian_set_relation', { p_code: normCode(code), p_relation: relation })).relation,

    adminSetTrainerRank: (token, id, rank) => rpc<string>('admin_set_trainer_rank', { p_token: token, p_id: id, p_rank: rank }),

    adminNewTrainerCode: (token, id) => rpc<string>('admin_new_trainer_code', { p_token: token, p_id: id }),

    adminDelTrainer: (token, id) => rpc<void>('admin_del_trainer', { p_token: token, p_id: id }),

    staffSetTags: (token, id, tags) => rpc<string[]>('staff_set_tags', { p_token: token, p_id: id, p_tags: tags }),

    async staffAddProgram(token, p, file) {
      let videoUrl: string | null = null;
      let videoName = '유튜브 영상';
      if (file) {
        // 저장소 업로드는 앱 키만 있으면 되므로, 올리기 전에 로그인 표부터 확인한다
        if (!(await rpc<boolean>('staff_check', { p_token: token }))) throw new AuthError();
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
        const path = `${Date.now()}-${uid()}.${ext}`;
        const r = await fetch(`${base}/storage/v1/object/videos/${path}`, {
          method: 'POST',
          headers: headers(file.type || 'video/mp4'),
          body: file,
        });
        if (!r.ok) throw new Error('upload ' + r.status);
        videoUrl = `${base}/storage/v1/object/public/videos/${path}`;
        videoName = file.name;
      }
      return rpc<Program>('staff_add_program', {
        p_token: token, p_title: p.title, p_kind: p.kind, p_min: p.min, p_memo: p.memo || '',
        p_src: file ? 'url' : 'yt', p_yt_id: file ? null : p.ytId, p_video_url: videoUrl, p_video_name: videoName, p_mids: p.mids,
      });
    },

    staffDelProgram: (token, id) => rpc<void>('staff_del_program', { p_token: token, p_id: id }),

    adminUpdateProgram: (token, id, p) =>
      rpc<Program>('admin_update_program', { p_token: token, p_id: id, p_title: p.title, p_kind: p.kind, p_min: p.min, p_memo: p.memo || '', p_yt_id: p.ytId }),

    staffSetProgramMembers: (token, id, mids) =>
      rpc<string[]>('staff_set_program_members', { p_token: token, p_id: id, p_mids: mids }),

    async videoUrl(p) {
      return p.videoUrl ? { url: p.videoUrl } : null;
    },
  };
}
