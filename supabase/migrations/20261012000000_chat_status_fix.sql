-- 맞춤 건강관리 · 대화 안 읽은 수 고침
-- 20261011000000_chat.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ user_chat_status 가 번호 확인(_mid)을 이용자 수만큼 되풀이해서, 틀린 번호 한 번이 여러 번 틀린 것으로
--   세어져 곧바로 'too many attempts' 가 나던 것을 고칩니다. 번호는 한 번만 확인합니다.

create or replace function user_chat_status(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare mid uuid:=_mid(p_code); m members;
begin
  if mid is null then return null; end if;
  select * into m from members where id=mid;
  return json_build_object('key','hl-chat-'||m.chat_key,
    'unread',(select count(*) from chat_messages c where c.member_id=m.id and c.sender='trainer' and c.created_at>coalesce(m.chat_read_at,'-infinity')));
end $$;
