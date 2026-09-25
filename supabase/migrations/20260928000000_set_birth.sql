-- 나의 건강일지 · 기존 이용자 생년월일 입력
-- 20260927000000_birthdate.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 관리자가 이미 등록된 이용자의 생년월일을 넣거나 고칠 수 있습니다. 나이는 앱에서 생년월일로 계산합니다.

create or replace function staff_set_birth(p_pw text,p_id uuid,p_birth date) returns void language plpgsql security definer set search_path=public as $$
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  if p_birth is null or p_birth > current_date or p_birth < date '1900-01-01' then raise exception 'invalid birth'; end if;
  update members set birth=p_birth where id=p_id;
end $$;
