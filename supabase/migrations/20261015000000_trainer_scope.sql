-- 맞춤 건강관리 · 트레이너는 담당 이용자만 (출석 체크 · 영상 공유)
-- 20261014000000_chat_read.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 출석: 트레이너는 담당 이용자만 출석·결석을 체크합니다. 관리자는 모두 체크합니다.
-- ■ 운동 영상: 관리자만 영상을 올리고 지웁니다 (올릴 때 대상 이용자는 골라도 되고 비워 둬도 됩니다).
--   트레이너는 올라온 영상을 보고 담당 이용자에게 공유하거나 공유를 끕니다. 다른 트레이너의 담당 이용자 공유는 건드리지 않습니다.

-- 로그인 표 (없으면 'invalid session')
create or replace function _staff_session(p_token text) returns staff_sessions language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  return s;
end $$;

-- 출석 ---------------------------------------------------------------------------
create or replace function staff_set_attendance(p_token text,p_lesson uuid,p_member uuid,p_date date,p_present boolean) returns void
language plpgsql security definer set search_path=public as $$
declare s staff_sessions:=_staff_session(p_token);
begin
  if s.role='trainer' then perform _need_assigned(s.subject,p_member); end if;
  if not exists(select 1 from lessons where id=p_lesson) then raise exception 'lesson not found'; end if;
  if p_date is null or p_date>_kst_today() then raise exception 'invalid date'; end if;
  if p_present then
    if not exists(select 1 from lesson_members where lesson_id=p_lesson and member_id=p_member) then raise exception 'not in lesson'; end if;
    insert into attendance(lesson_id,member_id,date) values(p_lesson,p_member,p_date) on conflict do nothing;
  else
    delete from attendance where lesson_id=p_lesson and member_id=p_member and date=p_date;
  end if;
end $$;

-- 한 번에 출석: 트레이너는 담당 이용자만 체크된다
create or replace function staff_set_attendance_many(p_token text,p_lesson uuid,p_date date,p_members uuid[]) returns int
language plpgsql security definer set search_path=public as $$
declare s staff_sessions:=_staff_session(p_token); n int;
begin
  if not exists(select 1 from lessons where id=p_lesson) then raise exception 'lesson not found'; end if;
  if p_date is null or p_date>_kst_today() then raise exception 'invalid date'; end if;
  insert into attendance(lesson_id,member_id,date)
    select p_lesson, lm.member_id, p_date from lesson_members lm join members m on m.id=lm.member_id
    where lm.lesson_id=p_lesson and lm.member_id = any(coalesce(p_members,'{}'))
      and (s.role='admin' or m.trainer_id=s.subject)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- 운동 영상 ------------------------------------------------------------------------
-- 올리기·지우기는 관리자만. 대상 이용자는 비워 둬도 된다
create or replace function staff_add_program(p_token text,p_title text,p_kind text,p_min int,p_memo text,
  p_src text,p_yt_id text,p_video_url text,p_video_name text,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r programs;
begin
  perform _need_admin(p_token);
  insert into programs(title,kind,min,memo,src,yt_id,video_url,video_name)
    values(p_title,p_kind,p_min,coalesce(p_memo,''),p_src,p_yt_id,p_video_url,p_video_name) returning * into r;
  insert into program_members(program_id,member_id)
    select r.id, m.id from members m where m.id = any(coalesce(p_mids,'{}')) on conflict do nothing;
  return _j_prog(r,null);
end $$;

create or replace function staff_del_program(p_token text,p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform _need_admin(p_token); delete from programs where id=p_id; end $$;

-- 대상 이용자 바꾸기. 관리자는 목록 전체를 바꾸고,
-- 트레이너는 자기 담당 이용자 몫만 바꾼다 (p_mids 중 담당 이용자만 켜고, 목록에 없는 담당 이용자는 끈다)
create or replace function staff_set_program_members(p_token text,p_id uuid,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare s staff_sessions:=_staff_session(p_token); want uuid[]:=coalesce(p_mids,'{}');
begin
  if not exists(select 1 from programs where id=p_id) then raise exception 'program not found'; end if;
  if s.role='admin' then
    delete from program_members where program_id=p_id and member_id <> all(want);
    insert into program_members(program_id,member_id)
      select p_id, m.id from members m where m.id = any(want) on conflict do nothing;
  else
    delete from program_members pm using members m
      where pm.program_id=p_id and m.id=pm.member_id and m.trainer_id=s.subject and pm.member_id <> all(want);
    insert into program_members(program_id,member_id)
      select p_id, m.id from members m where m.id = any(want) and m.trainer_id=s.subject on conflict do nothing;
  end if;
  return coalesce((select json_agg(member_id) from program_members where program_id=p_id),'[]'::json);
end $$;

revoke execute on function _staff_session(text) from public, anon, authenticated;
