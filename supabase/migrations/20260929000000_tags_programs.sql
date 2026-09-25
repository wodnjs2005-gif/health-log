-- 나의 건강일지 · 해시태그, 영상 진행 방식 없애기
-- 20260928000000_set_birth.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 1) 이용자에게 해시태그(#오전반, #무릎 …)를 달아 구분합니다. 직원(관리자·트레이너) 화면에만 보이고,
--    이용자·보호자에게는 보내지 않습니다 (user_get·guardian_get 은 그대로).
-- 2) 운동 영상의 '진행 방식(1:1/그룹)'을 없애고, 대상 이용자를 직접 골라 등록합니다.
-- 다시 실행해도 기존 데이터는 바뀌지 않습니다.

-- 해시태그 ---------------------------------------------------------------------
alter table members add column if not exists tags text[] not null default '{}';

create or replace function _j_member_staff(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'birth',to_char(m.birth,'YYYY-MM-DD'),
    'code',m.code,'guardianCode',m.guardian_code,'tags',to_json(m.tags)) $$;

-- 띄어쓰기를 먼저 지운 뒤 앞의 #을 지우고 20자까지. 빈 태그·중복은 뺀다. 한 사람에 10개까지.
create or replace function staff_set_tags(p_pw text,p_id uuid,p_tags text[]) returns json language plpgsql security definer set search_path=public as $$
declare t text[];
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  select coalesce(array_agg(x order by ord),'{}') into t from (
    select distinct on (x) x, ord from (
      select left(regexp_replace(regexp_replace(v,'\s+','','g'),'^#+',''),20) x, ord
      from unnest(coalesce(p_tags,'{}')) with ordinality u(v,ord)) a
    where x<>'' order by x, ord) b;
  if array_length(t,1)>10 then raise exception 'too many tags'; end if;
  update members set tags=t where id=p_id;
  return to_json(t);
end $$;

-- 영상: 진행 방식 없이 등록 -------------------------------------------------------
alter table programs alter column type drop not null;

drop function if exists staff_add_program(text,text,text,text,int,text,text,text,text,text,uuid[]);
create or replace function staff_add_program(p_pw text,p_title text,p_kind text,p_min int,p_memo text,
  p_src text,p_yt_id text,p_video_url text,p_video_name text,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r programs;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  insert into programs(title,kind,min,memo,src,yt_id,video_url,video_name)
    values(p_title,p_kind,p_min,coalesce(p_memo,''),p_src,p_yt_id,p_video_url,p_video_name) returning * into r;
  insert into program_members(program_id,member_id) select r.id, unnest(p_mids) on conflict do nothing;
  return _j_prog(r,null);
end $$;
