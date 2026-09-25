-- 나의 건강일지 · 이미 등록한 영상의 대상 이용자 바꾸기
-- 20260929000000_tags_programs.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 대상에서 뺀 이용자는 더 이상 그 영상을 볼 수 없습니다. 이미 따라한 기록(운동일지·횟수)은 지우지 않습니다.

create or replace function staff_set_program_members(p_pw text,p_id uuid,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  -- 다른 직원이 먼저 지운 영상 ('not allowed' 는 앱에서 로그인 만료로 처리하므로 쓰지 않는다)
  if not exists(select 1 from programs where id=p_id) then raise exception 'program not found'; end if;
  delete from program_members where program_id=p_id and member_id <> all(p_mids);
  insert into program_members(program_id,member_id)
    select p_id, m.id from members m where m.id = any(p_mids) on conflict do nothing;
  return coalesce((select json_agg(member_id) from program_members where program_id=p_id),'[]'::json);
end $$;
