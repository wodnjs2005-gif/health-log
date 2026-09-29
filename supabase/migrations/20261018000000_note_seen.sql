-- 맞춤 건강관리 · 트레이너 한마디 「확인했어요」
-- 20261017000000_program_edit.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 이용자가 오늘 화면의 트레이너 한마디에서 「확인했어요」를 누르면 그 한마디(와 그 전 한마디)가 오늘 화면에서 사라집니다.
--   새 한마디가 오면 다시 나타나고, 지난 한마디는 「기록」 탭에서 볼 수 있습니다.
-- ■ 트레이너·관리자 화면에는 이용자가 확인한 한마디에 「확인함」이 붙습니다.

alter table member_notes add column if not exists seen_at timestamptz;

create or replace function _j_note(n member_notes) returns json language sql stable as $$
  select json_build_object('id',n.id,'mid',n.member_id,'text',n.body,'by',n.author,'byId',n.author_id,
    'date',to_char(n.created_at at time zone 'Asia/Seoul','YYYY-MM-DD'),'seen',n.seen_at is not null) $$;

-- 확인: 고른 한마디와 그보다 먼저 남긴 한마디를 모두 확인한 것으로. 확인한 한마디 id 들을 돌려준다 (번호가 틀리면 null)
create or replace function user_note_seen(p_code text,p_note uuid) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); t timestamptz;
begin
  if m is null then return null; end if;
  select created_at into t from member_notes where id=p_note and member_id=m;
  if t is null then return '[]'::json; end if;
  update member_notes set seen_at=now() where member_id=m and seen_at is null and created_at<=t;
  return coalesce((select json_agg(id) from member_notes where member_id=m and seen_at is not null),'[]'::json);
end $$;

revoke execute on function _j_note(member_notes) from public, anon, authenticated;
