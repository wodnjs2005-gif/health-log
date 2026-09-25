// supabase/migrations/*.sql 을 이름 순서대로 합쳐 supabase/setup_all.sql 하나로 만든다.
// 새 Supabase 프로젝트에서는 SQL Editor 에 이 파일 하나만 붙여넣고 Run 하면 된다.
// 사용법: npm run build:sql
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const head = `-- 나의 건강일지 · 새 Supabase 프로젝트 한 번에 설정하기
-- 자동으로 만든 파일입니다. 직접 고치지 말고 supabase/migrations/ 를 고친 뒤 npm run build:sql 하세요.
-- 이미 쓰던 데이터베이스라면 이 파일 대신 아직 실행하지 않은 migrations 파일만 순서대로 실행하세요.
-- 실행한 뒤 첫 관리자 계정을 꼭 만드세요:
--   select admin_create('admin', '여기에-8자-이상-비밀번호', '관리자');
`;
// 여러 번 Run 해도 되도록 이 앱의 함수를 먼저 모두 지운다 (매개변수 이름이 바뀐 함수는 create or replace 로 덮어쓸 수 없음).
// 표와 기록은 건드리지 않는다.
const sources = files.map((f) => readFileSync(join(dir, f), 'utf8'));
const fns = [...new Set(sources.flatMap((s) => [...s.matchAll(/create or replace function\s+(\w+)\s*\(/gi)].map((m) => m[1])))].sort();
const reset = `
-- ================= 다시 실행해도 되도록: 이 앱의 함수 지우기 (표·기록은 그대로) =================

do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname = any(array[${fns.map((n) => `'${n}'`).join(',')}])
  loop
    execute 'drop function if exists ' || f.sig || ' cascade';
  end loop;
end $$;
`;
const body = reset + files.map((f) => `\n-- ================= ${f} =================\n\n${sources[files.indexOf(f)].trim()}\n`).join('');

const out = join(root, 'supabase', 'setup_all.sql');
writeFileSync(out, head + body);
console.log(`✓ ${out} (${files.length}개 파일)`);
