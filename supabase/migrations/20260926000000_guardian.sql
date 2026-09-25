-- 나의 건강일지 · 보호자 번호
-- 20260925000000_healthlog_init.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
-- 보호자는 보호자 번호로 가족의 기록을 '보기만' 합니다. 이용자의 개인 번호는 보호자에게 보내지 않습니다.
-- 다시 실행해도 기존 데이터·번호는 바뀌지 않습니다.

alter table members add column if not exists guardian_code text unique;

-- 새 번호는 개인 번호·보호자 번호 모두와 겹치지 않게
create or replace function _new_code() returns text language plpgsql volatile security definer set search_path=public, extensions as $$
declare ch text:='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; b bytea; i int;
begin
  loop
    b:=gen_random_bytes(6); c:='';
    for i in 0..5 loop c:=c||substr(ch,(get_byte(b,i)%length(ch))+1,1); end loop;
    exit when not exists(select 1 from members where code=c or guardian_code=c);
  end loop;
  return c;
end $$;

-- 이미 등록된 이용자에게 보호자 번호 채우기 (한 명씩 해야 서로 겹치지 않음)
do $$
declare r record;
begin
  for r in select id from members where guardian_code is null loop
    update members set guardian_code=_new_code() where id=r.id;
  end loop;
end $$;
alter table members alter column guardian_code set not null;

-- 보호자 번호 → member id
create or replace function _gid(p_code text) returns uuid language sql stable security definer set search_path=public as $$
  select id from members where guardian_code=upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g')) $$;

-- 직원에게만 보호자 번호까지 보낸다 (user_get 의 _j_member 는 그대로)
create or replace function _j_member_staff(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'code',m.code,'guardianCode',m.guardian_code) $$;

create or replace function staff_get(p_pw text) returns json language plpgsql stable security definer set search_path=public as $$
begin
  if not _staff_ok(p_pw) then return null; end if;
  return json_build_object(
    'members',coalesce((select json_agg(_j_member_staff(x) order by x.created_at) from members x),'[]'::json),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,null) order by p.created_at desc) from programs p),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json));
end $$;

create or replace function staff_add_member(p_pw text,p_name text,p_age int) returns json language plpgsql security definer set search_path=public as $$
declare r members; c text; g text;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  c:=_new_code();
  loop g:=_new_code(); exit when g<>c; end loop;
  insert into members(code,guardian_code,name,age) values(c,g,p_name,p_age) returning * into r;
  return _j_member_staff(r);
end $$;

create or replace function staff_new_guardian_code(p_pw text,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  if not _staff_ok(p_pw) then raise exception 'invalid password'; end if;
  update members set guardian_code=_new_code() where id=p_id returning guardian_code into c;
  return c;
end $$;

-- 보호자: 읽기 전용. member 에는 개인 번호를 넣지 않는다.
create or replace function guardian_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return json_build_object(
    'member',(select json_build_object('id',x.id,'name',x.name,'age',x.age) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json));
end $$;

revoke execute on function _gid(text), _j_member_staff(members) from public, anon, authenticated;
