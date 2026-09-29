-- 맞춤 건강관리 · 등록한 운동 영상 고치기
-- 20261016000000_video_share.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 관리자가 이미 올린 영상의 제목·운동 종류·시간·안내 메모·유튜브 링크를 고칩니다.
--   공유된 이용자와 따라한 기록은 그대로 둡니다. 유튜브 링크를 비워 보내면 영상은 그대로 둡니다.

create or replace function admin_update_program(p_token text,p_id uuid,p_title text,p_kind text,p_min int,p_memo text,p_yt_id text) returns json
language plpgsql security definer set search_path=public as $$
declare r programs;
begin
  perform _need_admin(p_token);
  if coalesce(trim(p_title),'')='' then raise exception 'no title'; end if;
  if coalesce(trim(p_kind),'')='' then raise exception 'no kind'; end if;
  if p_min is null or p_min<1 or p_min>600 then raise exception 'invalid min'; end if;
  if p_yt_id is not null and p_yt_id !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'invalid video'; end if;
  update programs set title=left(trim(p_title),100), kind=left(trim(p_kind),30), min=p_min, memo=left(coalesce(p_memo,''),500),
    src=case when p_yt_id is null then src else 'yt' end,
    yt_id=coalesce(p_yt_id,yt_id),
    video_url=case when p_yt_id is null then video_url end,
    video_name=case when p_yt_id is null then video_name else '유튜브 영상' end
  where id=p_id returning * into r;
  if r.id is null then raise exception 'program not found'; end if;
  return _j_prog(r,null);
end $$;
