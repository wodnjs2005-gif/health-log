-- 나의 건강일지 · 생년월일
-- 20260926000000_guardian.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 이용자를 등록할 때 나이 대신 생년월일을 저장하고, 나이는 앱에서 오늘 날짜 기준 만 나이로 계산합니다.
-- 예전에 나이만 입력한 이용자는 age 값이 그대로 남아 그 나이로 보입니다.
-- 다시 실행해도 기존 데이터는 바뀌지 않습니다.

alter table members add column if not exists birth date;

create or replace function _j_member(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'birth',to_char(m.birth,'YYYY-MM-DD'),'code',m.code) $$;

create or replace function _j_member_staff(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'birth',to_char(m.birth,'YYYY-MM-DD'),
    'code',m.code,'guardianCode',m.guardian_code) $$;

-- 나이(p_age) 대신 생년월일(p_birth)을 받는다
drop function if exists staff_add_member(text,text,int);
create or replace function staff_add_member(p_pw text,p_name text,p_birth date) returns json language plpgsql security definer set search_path=public as $$
declare r members; c text; g text;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  if p_birth is null or p_birth > current_date or p_birth < date '1900-01-01' then raise exception 'invalid birth'; end if;
  c:=_new_code();
  loop g:=_new_code(); exit when g<>c; end loop;
  insert into members(code,guardian_code,name,birth) values(c,g,p_name,p_birth) returning * into r;
  return _j_member_staff(r);
end $$;

-- 보호자에게도 생년월일(나이 계산용)을 보낸다. 개인 번호는 여전히 보내지 않는다.
create or replace function guardian_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return json_build_object(
    'member',(select json_build_object('id',x.id,'name',x.name,'age',x.age,'birth',to_char(x.birth,'YYYY-MM-DD')) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json));
end $$;
