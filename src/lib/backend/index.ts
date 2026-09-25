import { createDevBackend } from './dev';
import { createSupabaseBackend } from './supabase';
import type { Backend } from './types';

export * from './types';

const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const key = (import.meta.env.VITE_SUPABASE_KEY || '').trim();

/**
 * Supabase 주소·키가 있으면 서버에 연결한다.
 * 없을 때: 개발(npm run dev)에서는 개발용 가짜 서버, 배포용 빌드에서는 null → '서버 연결 설정이 필요해요' 화면.
 * (import.meta.env.DEV 가 배포용 빌드에서 false 로 바뀌어 가짜 서버 코드는 빌드 결과에서 빠진다)
 */
export const backend: Backend | null =
  url && key ? createSupabaseBackend(url, key) : import.meta.env.DEV ? createDevBackend() : null;
