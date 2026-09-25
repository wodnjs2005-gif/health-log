-- 나의 건강일지 · 수업과 출석
-- 20261002000000_trainer_rank.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 수업: 이름 + 요일 + 대상 이용자. 트레이너·관리자가 만들고 날짜별로 출석을 체크합니다.
-- ■ 출석은 '출석한 날'만 저장합니다. 수업 요일인데 체크가 없으면 결석입니다.
--   휴강한 날(class_offdays)은 출석률 계산에서 빠집니다.
-- ■ 이용자·보호자는 자기(가족) 출석만 받고, 같은 수업의 다른 이용자는 알 수 없습니다.

-- 표 --------------------------------------------------------------------------
create table if not exists lessons(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- 요일: 0=일 1=월 … 6=토 (자바스크립트 getDay 와 같음)
  days smallint[] not null default '{}',
  created_at timestamptz not null default now());

create table if not exists lesson_members(
  lesson_id uuid not null references lessons(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(lesson_id, member_id));
create index if not exists lesson_members_member on lesson_members(member_id);

create table if not exists attendance(
  lesson_id uuid not null references lessons(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key(lesson_id, member_id, date));
create index if not exists attendance_member on attendance(member_id);

create table if not exists lesson_offdays(
  lesson_id uuid not null references lessons(id) on delete cascade,
  date date not null,
  primary key(lesson_id, date));

alter table lessons enable row level security;
alter table lesson_members enable row level security;
alter table attendance enable row level security;
alter table lesson_offdays enable row level security;

-- 내부 도우미 ---------------------------------------------------------------------
create or replace function _kst_today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Seoul')::date $$;

create or replace function _clean_days(p_days int[]) returns smallint[] language sql immutable as $$
  select coalesce(array_agg(distinct d::smallint order by d::smallint),'{}')
  from unnest(coalesce(p_days,'{}')) d where d between 0 and 6 $$;

-- only_mid 가 있으면 그 이용자만 roster 에 넣는다 (이용자·보호자용)
create or replace function _j_lesson(l lessons, only_mid uuid) returns json language sql stable as $$
  select json_build_object('id',l.id,'name',l.name,'days',to_json(l.days),
    'createdAt',to_char(l.created_at at time zone 'Asia/Seoul','YYYY-MM-DD'),
    'roster',coalesce((select json_agg(json_build_object('mid',lm.member_id,
                         'since',to_char(lm.added_at at time zone 'Asia/Seoul','YYYY-MM-DD')) order by lm.added_at)
                       from lesson_members lm where lm.lesson_id=l.id and (only_mid is null or lm.member_id=only_mid)),'[]'::json)) $$;

-- 수업·출석·휴강 묶음. p_mid 가 null 이면 전체(직원용)
create or replace function _lesson_data(p_mid uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'lessons',coalesce((select json_agg(_j_lesson(l,p_mid) order by l.created_at) from lessons l
        where p_mid is null or exists(select 1 from lesson_members lm where lm.lesson_id=l.id and lm.member_id=p_mid)),'[]'::json),
    'attendance',coalesce((select json_agg(json_build_object('lid',a.lesson_id,'mid',a.member_id,'date',to_char(a.date,'YYYY-MM-DD')) order by a.date)
        from attendance a where p_mid is null or a.member_id=p_mid),'[]'::json),
    'offdays',coalesce((select json_agg(json_build_object('lid',o.lesson_id,'date',to_char(o.date,'YYYY-MM-DD')) order by o.date)
        from lesson_offdays o
        where p_mid is null or exists(select 1 from lesson_members lm where lm.lesson_id=o.lesson_id and lm.member_id=p_mid)),'[]'::json)) $$;

-- 기존 조회 함수에 수업 묶음을 덧붙인다 ------------------------------------------------
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
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json)) || _lesson_data(m))::json;
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
    'views',coalesce((select json_agg(_j_view(x)) from views x where x.member_id=m),'[]'::json)) || _lesson_data(m))::json;
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
    'views',coalesce((select json_agg(_j_view(x)) from views x),'[]'::json)) || _lesson_data(null))::json;
end $$;

-- 수업 만들기·고치기·지우기 (관리자·트레이너) ------------------------------------------
create or replace function staff_add_lesson(p_token text,p_name text,p_days int[],p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r lessons; d smallint[]:=_clean_days(p_days);
begin
  perform _need_staff(p_token);
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  if coalesce(array_length(d,1),0)=0 then raise exception 'no days'; end if;
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  insert into lessons(name,days) values(left(trim(p_name),30),d) returning * into r;
  insert into lesson_members(lesson_id,member_id) select r.id, m.id from members m where m.id = any(p_mids) on conflict do nothing;
  return _j_lesson(r,null);
end $$;

-- 대상에서 뺀 이용자의 지난 출석 기록은 남겨 둔다. 계속 있는 이용자는 처음 넣은 날짜(since)를 유지한다
create or replace function staff_update_lesson(p_token text,p_id uuid,p_name text,p_days int[],p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r lessons; d smallint[]:=_clean_days(p_days);
begin
  perform _need_staff(p_token);
  if coalesce(trim(p_name),'')='' then raise exception 'no name'; end if;
  if coalesce(array_length(d,1),0)=0 then raise exception 'no days'; end if;
  if coalesce(array_length(p_mids,1),0)=0 then raise exception 'no members'; end if;
  update lessons set name=left(trim(p_name),30), days=d where id=p_id returning * into r;
  if r.id is null then raise exception 'lesson not found'; end if;
  delete from lesson_members where lesson_id=p_id and member_id <> all(p_mids);
  insert into lesson_members(lesson_id,member_id) select p_id, m.id from members m where m.id = any(p_mids) on conflict do nothing;
  return _j_lesson(r,null);
end $$;

create or replace function staff_del_lesson(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_staff(p_token); delete from lessons where id=p_id; end $$;

-- 출석 체크 (관리자·트레이너) --------------------------------------------------------
create or replace function staff_set_attendance(p_token text,p_lesson uuid,p_member uuid,p_date date,p_present boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform _need_staff(p_token);
  if not exists(select 1 from lessons where id=p_lesson) then raise exception 'lesson not found'; end if;
  if p_date is null or p_date>_kst_today() then raise exception 'invalid date'; end if;
  if p_present then
    if not exists(select 1 from lesson_members where lesson_id=p_lesson and member_id=p_member) then raise exception 'not in lesson'; end if;
    insert into attendance(lesson_id,member_id,date) values(p_lesson,p_member,p_date) on conflict do nothing;
  else
    delete from attendance where lesson_id=p_lesson and member_id=p_member and date=p_date;
  end if;
end $$;

-- 휴강 표시·취소
create or replace function staff_set_offday(p_token text,p_lesson uuid,p_date date,p_off boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform _need_staff(p_token);
  if not exists(select 1 from lessons where id=p_lesson) then raise exception 'lesson not found'; end if;
  if p_date is null then raise exception 'invalid date'; end if;
  if p_off then
    insert into lesson_offdays(lesson_id,date) values(p_lesson,p_date) on conflict do nothing;
  else
    delete from lesson_offdays where lesson_id=p_lesson and date=p_date;
  end if;
end $$;

revoke execute on function _kst_today(), _clean_days(int[]), _j_lesson(lessons,uuid), _lesson_data(uuid)
  from public, anon, authenticated;
