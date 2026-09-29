-- 맞춤 건강관리 · 운동 영상: 관리자는 올리기만, 트레이너는 담당 이용자에게 공유
-- 20261015000000_trainer_scope.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 관리자는 운동 영상을 올리고 지우기만 합니다 (대상 이용자를 고르지 않습니다).
-- ■ 트레이너가 담당 이용자에게 공유합니다. 영상 여러 개를 이용자 여러 명에게 한 번에 공유하거나 끌 수 있고,
--   이용자 상세 화면에서 그분이 볼 영상을 하나씩 켜고 끌 수도 있습니다. 담당이 아닌 이용자는 건드리지 않습니다.
-- ■ 예전에 관리자가 골라 둔 대상 이용자는 그대로 둡니다 (담당 트레이너가 이어서 켜고 끕니다).

-- 올리기 (관리자). 대상 이용자는 받지 않는다 (인자는 예전 앱과 맞추려고 남겨 둔다)
create or replace function staff_add_program(p_token text,p_title text,p_kind text,p_min int,p_memo text,
  p_src text,p_yt_id text,p_video_url text,p_video_name text,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare r programs;
begin
  perform _need_admin(p_token);
  insert into programs(title,kind,min,memo,src,yt_id,video_url,video_name)
    values(p_title,p_kind,p_min,coalesce(p_memo,''),p_src,p_yt_id,p_video_url,p_video_name) returning * into r;
  return _j_prog(r,null);
end $$;

-- 한 영상의 대상 바꾸기: 트레이너만, 자기 담당 이용자 몫만
create or replace function staff_set_program_members(p_token text,p_id uuid,p_mids uuid[]) returns json
language plpgsql security definer set search_path=public as $$
declare tid uuid:=_need_trainer(p_token); want uuid[]:=coalesce(p_mids,'{}');
begin
  if not exists(select 1 from programs where id=p_id) then raise exception 'program not found'; end if;
  delete from program_members pm using members m
    where pm.program_id=p_id and m.id=pm.member_id and m.trainer_id=tid and pm.member_id <> all(want);
  insert into program_members(program_id,member_id)
    select p_id, m.id from members m where m.id = any(want) and m.trainer_id=tid on conflict do nothing;
  return coalesce((select json_agg(member_id) from program_members where program_id=p_id),'[]'::json);
end $$;

-- 여러 영상 × 여러 이용자를 한 번에 켜거나(p_on) 끈다. 담당 이용자만 바뀐다.
-- 바뀐 영상마다 지금 대상 목록을 돌려준다: {영상 id: [이용자 id…]}
create or replace function trainer_share_programs(p_token text,p_programs uuid[],p_members uuid[],p_on boolean) returns json
language plpgsql security definer set search_path=public as $$
declare tid uuid:=_need_trainer(p_token); ps uuid[]; ms uuid[];
begin
  select coalesce(array_agg(id),'{}') into ps from programs where id = any(coalesce(p_programs,'{}'));
  select coalesce(array_agg(id),'{}') into ms from members where id = any(coalesce(p_members,'{}')) and trainer_id=tid;
  if p_on then
    insert into program_members(program_id,member_id)
      select p, m from unnest(ps) p cross join unnest(ms) m on conflict do nothing;
  else
    delete from program_members where program_id = any(ps) and member_id = any(ms);
  end if;
  return coalesce((select json_object_agg(p.id, coalesce((select json_agg(pm.member_id) from program_members pm where pm.program_id=p.id),'[]'::json))
    from programs p where p.id = any(ps)),'{}'::json);
end $$;
