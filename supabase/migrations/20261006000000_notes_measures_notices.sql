-- 나의 건강일지 · 트레이너 한마디 · 건강 수치 · 공지사항 · 한꺼번에 출석
-- 20261005000000_custom_foods.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 한마디: 트레이너·관리자가 이용자에게 남기는 짧은 글. 이용자 본인과 보호자 화면에 보인다.
-- ■ 건강 수치: 체중·혈압·혈당. 이용자 본인이나 트레이너·관리자가 적는다. 보호자는 보기만 한다.
--   이용자는 자기가 적은 수치만 지울 수 있다.
-- ■ 공지사항: 트레이너·관리자가 올리면 모든 이용자·보호자 화면 위에 보인다. 정한 날까지만 보인다.
-- ■ 출석: 수업의 여러 이용자를 한 번에 출석으로 체크한다 (「남은 분 모두 출석」).

-- 표 --------------------------------------------------------------------------
create table if not exists member_notes(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  body text not null,
  -- 남긴 사람 (예: '김코치 팀장'). 계정을 지워도 이름은 남는다
  author text not null default '',
  created_at timestamptz not null default now());
create index if not exists member_notes_member on member_notes(member_id, created_at);

create table if not exists measures(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  date date not null,
  weight numeric(5,1),
  sbp smallint,
  dbp smallint,
  glucose smallint,
  -- '' = 이용자 본인이 적음, 아니면 적은 직원 이름
  author text not null default '',
  created_at timestamptz not null default now());
create index if not exists measures_member on measures(member_id, date);

create table if not exists notices(
  id uuid primary key default gen_random_uuid(),
  body text not null,
  author text not null default '',
  -- 이 날까지 보인다. null 이면 지울 때까지
  until date,
  created_at timestamptz not null default now());

alter table member_notes enable row level security;
alter table measures enable row level security;
alter table notices enable row level security;

-- 내부 도우미 ---------------------------------------------------------------------
-- 로그인한 직원의 이름. 트레이너는 직급까지 ('김코치 팀장', 직급이 없으면 '김코치 트레이너')
create or replace function _staff_label(p_token text) returns text language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; n text;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='admin' then
    select name into n from admins where id=s.subject;
  else
    select name||' '||coalesce(nullif(rank,''),'트레이너') into n from trainers where id=s.subject;
  end if;
  if n is null then raise exception 'invalid session'; end if;
  return n;
end $$;

create or replace function _j_note(n member_notes) returns json language sql stable as $$
  select json_build_object('id',n.id,'mid',n.member_id,'text',n.body,'by',n.author,
    'date',to_char(n.created_at at time zone 'Asia/Seoul','YYYY-MM-DD')) $$;

create or replace function _j_measure(x measures) returns json language sql stable as $$
  select json_build_object('id',x.id,'mid',x.member_id,'date',to_char(x.date,'YYYY-MM-DD'),
    'weight',x.weight,'sbp',x.sbp,'dbp',x.dbp,'glu',x.glucose,'by',x.author) $$;

create or replace function _j_notice(x notices) returns json language sql stable as $$
  select json_build_object('id',x.id,'text',x.body,'by',x.author,
    'date',to_char(x.created_at at time zone 'Asia/Seoul','YYYY-MM-DD'),'until',to_char(x.until,'YYYY-MM-DD')) $$;

-- 수치 검사 (앱의 lib/measures.ts 와 같은 범위). 혈압은 수축기·이완기를 함께 적는다
create or replace function _check_measure(p_date date,p_weight numeric,p_sbp int,p_dbp int,p_glu int) returns void language plpgsql stable as $$
begin
  if p_date is null or p_date>_kst_today() or p_date<_kst_today()-3650 then raise exception 'invalid date'; end if;
  if p_weight is null and p_sbp is null and p_dbp is null and p_glu is null then raise exception 'no values'; end if;
  if p_weight is not null and (p_weight<20 or p_weight>300) then raise exception 'invalid weight'; end if;
  if (p_sbp is null) <> (p_dbp is null) then raise exception 'invalid bp'; end if;
  if p_sbp is not null and (p_sbp<50 or p_sbp>300 or p_dbp<30 or p_dbp>200 or p_dbp>=p_sbp) then raise exception 'invalid bp'; end if;
  if p_glu is not null and (p_glu<20 or p_glu>800) then raise exception 'invalid glucose'; end if;
end $$;

-- 한마디·건강 수치·공지 묶음. p_mid 가 null 이면 전체(직원용: 끝난 공지도 30일까지 보여준다)
create or replace function _extra_data(p_mid uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'notes',coalesce((select json_agg(_j_note(n) order by n.created_at) from member_notes n
        where p_mid is null or n.member_id=p_mid),'[]'::json),
    'measures',coalesce((select json_agg(_j_measure(x) order by x.date, x.created_at) from measures x
        where p_mid is null or x.member_id=p_mid),'[]'::json),
    'notices',coalesce((select json_agg(_j_notice(x) order by x.created_at desc) from notices x
        where x.until is null or x.until >= _kst_today() - case when p_mid is null then 30 else 0 end),'[]'::json)) $$;

-- 기존 조회 함수에 묶음을 덧붙인다 ------------------------------------------------------
create or replace function user_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return (jsonb_build_object(
    'member',(select _j_member(x) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json))
    || _lesson_data(m) || _extra_data(m))::json;
end $$;

create or replace function guardian_get(p_code text) returns json language plpgsql stable security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return (jsonb_build_object(
    'member',(select json_build_object('id',x.id,'name',x.name,'age',x.age,'birth',to_char(x.birth,'YYYY-MM-DD')) from members x where x.id=m),
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x where x.member_id=m),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x where x.member_id=m),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,m) order by p.created_at desc) from programs p
                         join program_members pm on pm.program_id=p.id and pm.member_id=m),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json))
    || _lesson_data(m) || _extra_data(m))::json;
end $$;

create or replace function staff_get(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions; me text; rk text:='';
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then return null; end if;
  if s.role='admin' then
    select name into me from admins where id=s.subject;
  else
    select name, rank into me, rk from trainers where id=s.subject;
  end if;
  if me is null then return null; end if; -- 지워진 계정
  return (jsonb_build_object(
    'me',json_build_object('role',s.role,'name',me,'rank',coalesce(rk,'')),
    'members',coalesce((select json_agg(case when s.role='admin' then _j_member_staff(x) else _j_member_trainer(x) end order by x.created_at) from members x),'[]'::json),
    'trainers',case when s.role='admin' then coalesce((select json_agg(_j_trainer(t) order by t.created_at) from trainers t),'[]'::json) end,
    'ex',coalesce((select json_agg(_j_ex(x) order by x.created_at) from exercises x),'[]'::json),
    'meals',coalesce((select json_agg(_j_meal(x) order by x.created_at) from meals x),'[]'::json),
    'programs',coalesce((select json_agg(_j_prog(p,null) order by p.created_at desc) from programs p),'[]'::json),
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json))
    || _lesson_data(null) || _extra_data(null))::json;
end $$;

-- 한마디 (관리자·트레이너) ------------------------------------------------------------
create or replace function staff_add_note(p_token text,p_member uuid,p_text text) returns json
language plpgsql security definer set search_path=public as $$
declare who text:=_staff_label(p_token); t text:=left(trim(coalesce(p_text,'')),200); r member_notes;
begin
  if t='' then raise exception 'no text'; end if;
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  insert into member_notes(member_id,body,author) values(p_member,t,who) returning * into r;
  return _j_note(r);
end $$;

create or replace function staff_del_note(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_staff(p_token); delete from member_notes where id=p_id; end $$;

-- 건강 수치 ---------------------------------------------------------------------
create or replace function user_add_measure(p_code text,p_date date,p_weight numeric,p_sbp int,p_dbp int,p_glu int) returns json
language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r measures;
begin
  if m is null then raise exception 'invalid code'; end if;
  perform _check_measure(p_date,p_weight,p_sbp,p_dbp,p_glu);
  insert into measures(member_id,date,weight,sbp,dbp,glucose) values(m,p_date,round(p_weight,1),p_sbp,p_dbp,p_glu) returning * into r;
  return _j_measure(r);
end $$;

-- 이용자는 자기가 적은 수치만 지울 수 있다
create or replace function user_del_measure(p_code text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then raise exception 'invalid code'; end if;
  delete from measures where id=p_id and member_id=m and author='';
end $$;

create or replace function staff_add_measure(p_token text,p_member uuid,p_date date,p_weight numeric,p_sbp int,p_dbp int,p_glu int) returns json
language plpgsql security definer set search_path=public as $$
declare who text:=_staff_label(p_token); r measures;
begin
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  perform _check_measure(p_date,p_weight,p_sbp,p_dbp,p_glu);
  insert into measures(member_id,date,weight,sbp,dbp,glucose,author) values(p_member,p_date,round(p_weight,1),p_sbp,p_dbp,p_glu,who) returning * into r;
  return _j_measure(r);
end $$;

create or replace function staff_del_measure(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_staff(p_token); delete from measures where id=p_id; end $$;

-- 공지사항 (관리자·트레이너) -----------------------------------------------------------
create or replace function staff_add_notice(p_token text,p_text text,p_until date) returns json
language plpgsql security definer set search_path=public as $$
declare who text:=_staff_label(p_token); t text:=left(trim(coalesce(p_text,'')),300); r notices;
begin
  if t='' then raise exception 'no text'; end if;
  if p_until is not null and p_until<_kst_today() then raise exception 'invalid date'; end if;
  insert into notices(body,author,until) values(t,who,p_until) returning * into r;
  return _j_notice(r);
end $$;

create or replace function staff_del_notice(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_staff(p_token); delete from notices where id=p_id; end $$;

-- 한꺼번에 출석 (수업 대상인 이용자만). 새로 체크한 수를 돌려준다
create or replace function staff_set_attendance_many(p_token text,p_lesson uuid,p_date date,p_members uuid[]) returns int
language plpgsql security definer set search_path=public as $$
declare n int;
begin
  perform _need_staff(p_token);
  if not exists(select 1 from lessons where id=p_lesson) then raise exception 'lesson not found'; end if;
  if p_date is null or p_date>_kst_today() then raise exception 'invalid date'; end if;
  insert into attendance(lesson_id,member_id,date)
    select p_lesson, lm.member_id, p_date from lesson_members lm
    where lm.lesson_id=p_lesson and lm.member_id = any(coalesce(p_members,'{}'))
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function _staff_label(text), _j_note(member_notes), _j_measure(measures), _j_notice(notices),
  _check_measure(date,numeric,int,int,int), _extra_data(uuid)
  from public, anon, authenticated;
