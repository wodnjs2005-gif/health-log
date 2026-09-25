-- 나의 건강일지 · 관리자 로그인(아이디+비밀번호), 트레이너 번호 발급
-- 20260930000000_program_members.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 바뀌는 점
--   · 트레이너·관리자 '공용 비밀번호'를 없앱니다. 예전 비밀번호로는 더 이상 들어갈 수 없습니다.
--   · 관리자: 아이디 + 비밀번호 로그인. 5번 틀리면 10분 동안 잠깁니다.
--   · 트레이너: 관리자가 발급한 8자리 트레이너 번호로 로그인합니다.
--   · 로그인하면 비밀번호·번호 대신 기간이 정해진 '로그인 표(세션)'만 휴대폰에 남습니다.
--     (관리자 12시간, 트레이너 30일. 번호를 새로 발급하거나 트레이너를 지우면 바로 끝납니다)
--
-- ■ 실행한 뒤 반드시: 첫 관리자 계정 만들기 (SQL Editor 에서, 아이디·비밀번호를 바꿔서)
--     select admin_create('admin', '여기에-8자-이상-비밀번호', '관리자');
--   같은 명령을 다시 실행하면 그 아이디의 비밀번호를 새로 정합니다(비밀번호를 잊었을 때).

create extension if not exists pgcrypto with schema extensions;

-- 표 --------------------------------------------------------------------------
create table if not exists admins(
  id uuid primary key default gen_random_uuid(),
  login_id text unique not null,
  name text not null default '관리자',
  pw_hash text not null,
  failed int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now());

create table if not exists trainers(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  created_at timestamptz not null default now());

-- 로그인 표는 원문 대신 sha256 해시만 저장한다
create table if not exists staff_sessions(
  token_hash text primary key,
  role text not null check (role in ('admin','trainer')),
  subject uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now());
create index if not exists staff_sessions_subject on staff_sessions(subject);

alter table admins enable row level security;
alter table trainers enable row level security;
alter table staff_sessions enable row level security;

-- 공용 비밀번호 방식 없애기 ------------------------------------------------------------
drop function if exists staff_login(text);
drop function if exists staff_get(text);
drop function if exists staff_add_member(text,text,int);
drop function if exists staff_add_member(text,text,date);
drop function if exists staff_del_member(text,uuid);
drop function if exists staff_new_code(text,uuid);
drop function if exists staff_new_guardian_code(text,uuid);
drop function if exists staff_set_birth(text,uuid,date);
drop function if exists staff_set_tags(text,uuid,text[]);
drop function if exists staff_add_program(text,text,text,text,int,text,text,text,text,text,uuid[]);
drop function if exists staff_add_program(text,text,text,int,text,text,text,text,text,uuid[]);
drop function if exists staff_del_program(text,uuid);
drop function if exists staff_set_program_members(text,uuid,uuid[]);
drop function if exists _staff_ok(text);
delete from settings where key='staff_password';

-- 내부 도우미 ---------------------------------------------------------------------
create or replace function _token_hash(p_token text) returns text language sql immutable set search_path=public, extensions as $$
  select encode(digest(coalesce(p_token,''),'sha256'),'hex') $$;

-- 유효한 로그인 표의 역할 ('admin' / 'trainer'), 없거나 끝났으면 null
create or replace function _role(p_token text) returns text language sql stable security definer set search_path=public as $$
  select role from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now() $$;

create or replace function _need_staff(p_token text) returns text language plpgsql stable security definer set search_path=public as $$
declare r text:=_role(p_token);
begin
  if r is null then raise exception 'invalid session'; end if;
  return r;
end $$;

create or replace function _need_admin(p_token text) returns void language plpgsql stable security definer set search_path=public as $$
begin
  if _role(p_token) is distinct from 'admin' then raise exception 'invalid session'; end if;
end $$;

create or replace function _new_session(p_role text,p_subject uuid,p_hours int) returns text language plpgsql volatile security definer set search_path=public, extensions as $$
declare t text:=encode(gen_random_bytes(32),'hex');
begin
  delete from staff_sessions where expires_at<now();
  insert into staff_sessions(token_hash,role,subject,expires_at)
    values(_token_hash(t),p_role,p_subject,now()+make_interval(hours=>p_hours));
  return t;
end $$;

-- 트레이너 번호: 8자리, 헷갈리는 0·O·1·I·L 제외
create or replace function _new_trainer_code() returns text language plpgsql volatile security definer set search_path=public, extensions as $$
declare ch text:='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; b bytea; i int;
begin
  loop
    b:=gen_random_bytes(8); c:='';
    for i in 0..7 loop c:=c||substr(ch,(get_byte(b,i)%length(ch))+1,1); end loop;
    exit when not exists(select 1 from trainers where code=c);
  end loop;
  return c;
end $$;

create or replace function _j_member_trainer(m members) returns json language sql stable as $$
  select json_build_object('id',m.id,'name',m.name,'age',m.age,'birth',to_char(m.birth,'YYYY-MM-DD'),'tags',to_json(m.tags)) $$;

create or replace function _j_trainer(t trainers) returns json language sql stable as $$
  select json_build_object('id',t.id,'name',t.name,'code',t.code,'createdAt',to_char(t.created_at,'YYYY-MM-DD')) $$;

-- 관리자 계정 만들기·비밀번호 다시 정하기 (SQL Editor 전용, 앱에서는 호출 불가)
create or replace function admin_create(p_login_id text,p_pw text,p_name text default '관리자') returns text
language plpgsql volatile security definer set search_path=public, extensions as $$
declare lid text:=lower(trim(coalesce(p_login_id,'')));
begin
  if length(lid)<3 then raise exception '아이디는 3자 이상이어야 해요'; end if;
  if length(coalesce(p_pw,''))<8 then raise exception '비밀번호는 8자 이상이어야 해요'; end if;
  insert into admins(login_id,name,pw_hash) values(lid,coalesce(nullif(trim(p_name),''),'관리자'),crypt(p_pw,gen_salt('bf',10)))
  on conflict(login_id) do update set pw_hash=excluded.pw_hash, name=excluded.name, failed=0, locked_until=null;
  delete from staff_sessions where subject=(select id from admins where login_id=lid);
  return '관리자 계정 '||lid||' 을(를) 저장했어요';
end $$;

-- 로그인 ------------------------------------------------------------------------
-- 실패해도 오류를 던지지 않고 {error} 를 돌려준다 (오류를 던지면 틀린 횟수 기록까지 되돌려지기 때문)
create or replace function admin_login(p_login_id text,p_pw text) returns json
language plpgsql volatile security definer set search_path=public, extensions as $$
declare a admins; n int;
begin
  select * into a from admins where login_id=lower(trim(coalesce(p_login_id,'')));
  if a.id is null then
    perform crypt(coalesce(p_pw,''),gen_salt('bf',10)); -- 걸리는 시간으로 아이디가 있는지 드러나지 않게
    return json_build_object('error','invalid');
  end if;
  if a.locked_until is not null and a.locked_until>now() then
    return json_build_object('error','locked','until',a.locked_until);
  end if;
  if a.pw_hash<>crypt(coalesce(p_pw,''),a.pw_hash) then
    n:=a.failed+1;
    if n>=5 then
      update admins set failed=0, locked_until=now()+interval '10 minutes' where id=a.id;
      return json_build_object('error','locked','until',now()+interval '10 minutes');
    end if;
    update admins set failed=n, locked_until=null where id=a.id;
    return json_build_object('error','invalid','left',5-n);
  end if;
  update admins set failed=0, locked_until=null where id=a.id;
  return json_build_object('token',_new_session('admin',a.id,12),'role','admin','name',a.name);
end $$;

create or replace function trainer_login(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare t trainers;
begin
  select * into t from trainers where code=upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g'));
  if t.id is null then return null; end if;
  return json_build_object('token',_new_session('trainer',t.id,24*30),'role','trainer','name',t.name);
end $$;

create or replace function staff_logout(p_token text) returns void language sql volatile security definer set search_path=public as $$
  delete from staff_sessions where token_hash=_token_hash(p_token) $$;

-- 영상 파일을 올리기 전에 로그인 표 확인
create or replace function staff_check(p_token text) returns boolean language sql stable security definer set search_path=public as $$
  select _role(p_token) is not null $$;

create or replace function admin_change_password(p_token text,p_old text,p_new text) returns json
language plpgsql volatile security definer set search_path=public, extensions as $$
declare s staff_sessions; a admins;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and role='admin' and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  select * into a from admins where id=s.subject;
  if a.pw_hash<>crypt(coalesce(p_old,''),a.pw_hash) then return json_build_object('error','wrong'); end if;
  if length(coalesce(p_new,''))<8 then return json_build_object('error','short'); end if;
  update admins set pw_hash=crypt(p_new,gen_salt('bf',10)) where id=a.id;
  -- 다른 기기의 로그인은 모두 끝낸다
  delete from staff_sessions where subject=a.id and token_hash<>s.token_hash;
  return json_build_object('ok',true);
end $$;

-- 직원 데이터 -----------------------------------------------------------------------
-- 관리자에게만 개인·보호자 번호와 트레이너 목록을 보낸다
create or replace function staff_get(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; me text;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then return null; end if;
  me:=case when s.role='admin' then (select name from admins where id=s.subject) else (select name from trainers where id=s.subject) end;
  if me is null then return null; end if; -- 지워진 계정
  return json_build_object(
    'me',json_build_object('role',s.role,'name',me),
    'members',coalesce((select json_agg(case when s.role='admin' then _j_member_staff(x) else _j_member_trainer(x) end order by x.created_at) from members x),'[]'::json),
    'trainers',case when s.role='admin' then coalesce((select json_agg(_j_trainer(t) order by t.created_at) from trainers t),'[]'::json) end,
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,null) order by p.created_at desc) from programs p),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json));
end $$;

-- 이용자 관리 (관리자) ------------------------------------------------------------------
create or replace function staff_add_member(p_token text,p_name text,p_birth date) returns json language plpgsql security definer set search_path=public as $$
declare r members; c text; g text;
begin
  perform _need_admin(p_token);
  if p_birth is null or p_birth>current_date or p_birth<date '1900-01-01' then raise exception 'invalid birth'; end if;
  c:=_new_code();
  loop g:=_new_code(); exit when g<>c; end loop;
  insert into members(code,guardian_code,name,birth) values(c,g,p_name,p_birth) returning * into r;
  return _j_member_staff(r);
end $$;

create or replace function staff_del_member(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_admin(p_token); delete from members where id=p_id; end $$;

create or replace function staff_new_code(p_token text,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  perform _need_admin(p_token);
  update members set code=_new_code() where id=p_id returning code into c;
  return c;
end $$;

create or replace function staff_new_guardian_code(p_token text,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  perform _need_admin(p_token);
  update members set guardian_code=_new_code() where id=p_id returning guardian_code into c;
  return c;
end $$;

create or replace function staff_set_birth(p_token text,p_id uuid,p_birth date) returns void language plpgsql security definer set search_path=public as $$
begin
  perform _need_admin(p_token);
  if p_birth is null or p_birth>current_date or p_birth<date '1900-01-01' then raise exception 'invalid birth'; end if;
  update members set birth=p_birth where id=p_id;
end $$;

-- 해시태그 (관리자·트레이너) ----------------------------------------------------------
create or replace function staff_set_tags(p_token text,p_id uuid,p_tags text[]) returns json language plpgsql security definer set search_path=public as $$
declare t text[];
begin
  perform _need_staff(p_token);
  select coalesce(array_agg(x order by ord),'{}') into t from (
    select distinct on (x) x, ord from (
      select left(regexp_replace(regexp_replace(v,'\s+','','g'),'^#+',''),20) x, ord
      from unnest(coalesce(p_tags,'{}')) with ordinality u(v,ord)) a
    where x<>'' order by x, ord) b;
  if array_length(t,1)>10 then raise exception 'too many tags'; end if;
  update members set tags=t where id=p_id;
  return to_json(t);
end $$;

-- 운동 영상 (관리자·트레이너) ----------------------------------------------------------
create or replace function staff_add_program(p_token text,p_title text,p_kind text,p_min int,p_memo text,
  p_src text,p_yt_id text,p_video_url text,p_video_name text,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r programs;
begin
  perform _need_staff(p_token);
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  insert into programs(title,kind,min,memo,src,yt_id,video_url,video_name)
    values(p_title,p_kind,p_min,coalesce(p_memo,''),p_src,p_yt_id,p_video_url,p_video_name) returning * into r;
  insert into program_members(program_id,member_id) select r.id, unnest(p_mids) on conflict do nothing;
  return _j_prog(r,null);
end $$;

create or replace function staff_del_program(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_staff(p_token); delete from programs where id=p_id; end $$;

create or replace function staff_set_program_members(p_token text,p_id uuid,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
begin
  perform _need_staff(p_token);
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  if not exists(select 1 from programs where id=p_id) then raise exception 'program not found'; end if;
  delete from program_members where program_id=p_id and member_id <> all(p_mids);
  insert into program_members(program_id,member_id)
    select p_id, m.id from members m where m.id = any(p_mids) on conflict do nothing;
  return coalesce((select json_agg(member_id) from program_members where program_id=p_id),'[]'::json);
end $$;

-- 트레이너 관리 (관리자) ----------------------------------------------------------------
create or replace function admin_add_trainer(p_token text,p_name text) returns json language plpgsql security definer set search_path=public as $$
declare r trainers;
begin
  perform _need_admin(p_token);
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  insert into trainers(name,code) values(trim(p_name),_new_trainer_code()) returning * into r;
  return _j_trainer(r);
end $$;

-- 새 번호를 발급하면 그 트레이너의 로그인은 모두 끝난다
create or replace function admin_new_trainer_code(p_token text,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare c text;
begin
  perform _need_admin(p_token);
  update trainers set code=_new_trainer_code() where id=p_id returning code into c;
  delete from staff_sessions where subject=p_id and role='trainer';
  return c;
end $$;

create or replace function admin_del_trainer(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform _need_admin(p_token);
  delete from staff_sessions where subject=p_id and role='trainer';
  delete from trainers where id=p_id;
end $$;

-- 도우미·계정 만들기는 앱(anon)에서 직접 부를 수 없게 --------------------------------------
revoke execute on function _token_hash(text), _role(text), _need_staff(text), _need_admin(text),
  _new_session(text,uuid,int), _new_trainer_code(), _j_member_trainer(members), _j_trainer(trainers),
  admin_create(text,text,text)
  from public, anon, authenticated;
