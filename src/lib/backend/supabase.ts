// 서버 모드: 테이블에는 직접 접근하지 않고 supabase/migrations 의 RPC 함수로만 접근한다.
import { normCode } from '../code';
import {
  AuthError,
  type Backend,
  type CustomFood,
  type Exercise,
  type FoodRequest,
  type Lesson,
  type GuardianData,
  type Meal,
  type Member,
  type Program,
  type StaffData,
  type Trainer,
  type UserData,
  type View,
} from './types';

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
      throw new Error(t || r.statusText);
    }
    return (t ? JSON.parse(t) : null) as T;
  };

  const uid = () => {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return Array.from(a, (n) => n.toString(36)).join('').slice(0, 8);
  };

  return {
    mode: 'server',

    async devHints() {
      return null;
    },

    guardianGet: (code) => rpc<GuardianData | null>('guardian_get', { p_code: normCode(code) }),

    userGet: (code) => rpc<UserData | null>('user_get', { p_code: normCode(code) }),

    userAddEx: (code, r) =>
      rpc<Exercise>('user_add_ex', {
        p_code: normCode(code), p_date: r.date, p_kind: r.kind, p_min: r.min, p_level: r.level, p_memo: r.memo || '',
      }),

    userAddMeal: (code, r) =>
      rpc<Meal>('user_add_meal', {
        p_code: normCode(code), p_date: r.date, p_meal: r.meal, p_menu: r.menu, p_amount: r.amount, p_memo: r.memo || '',
        p_foods: r.foods, p_nutri: r.nutri,
      }),

    userDelEx: (code, id) => rpc<void>('user_del_ex', { p_code: normCode(code), p_id: id }),

    userDelMeal: (code, id) => rpc<void>('user_del_meal', { p_code: normCode(code), p_id: id }),

    userAddView: (code, pid, date) =>
      rpc<{ view: View; ex: Exercise }>('user_add_view', { p_code: normCode(code), p_program: pid, p_date: date }),

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

    staffSetOffday: (token, lid, date, off) =>
      rpc<void>('staff_set_offday', { p_token: token, p_lesson: lid, p_date: date, p_off: off }),

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

    staffSetProgramMembers: (token, id, mids) =>
      rpc<string[]>('staff_set_program_members', { p_token: token, p_id: id, p_mids: mids }),

    async videoUrl(p) {
      return p.videoUrl ? { url: p.videoUrl } : null;
    },
  };
}
