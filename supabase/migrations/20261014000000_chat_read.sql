-- 맞춤 건강관리 · 대화 읽음 표시
-- 20261013000000_assign_trainer.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 대화방에서 내가 보낸 메시지를 상대가 읽었는지 보여주도록, 양쪽이 마지막으로 읽은 때를 알려줍니다.
-- ■ 상대가 새 메시지를 읽으면 초인종(내용 없는 신호)을 울려 보낸 쪽 화면의 읽음 표시가 바로 바뀝니다.
--   읽을 새 메시지가 있을 때만 울리므로 양쪽이 대화방을 열어 두어도 신호가 끝없이 오가지 않습니다.

-- 초인종 한 번 (실시간이 없거나 실패해도 그대로 진행)
create or replace function _chat_ring_to(p_topic text) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_topic is null then return; end if;
  begin
    perform realtime.send('{}'::jsonb,'ring',p_topic,false);
  exception when others then null;
  end;
end $$;

-- 양쪽이 마지막으로 읽은 때: member = 이용자, trainer = 트레이너(누구든 가장 늦게 읽은 때)
create or replace function _chat_seen(p_mid uuid) returns json language sql stable security definer set search_path=public as $$
  select json_build_object(
    'member',(select _chat_at(chat_read_at) from members where id=p_mid),
    'trainer',(select _chat_at(max(read_at)) from chat_reads where member_id=p_mid)) $$;

-- 이용자 ----------------------------------------------------------------------
create or replace function user_chat_seen(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return _chat_seen(m);
end $$;

-- 대화 보기 (보면 읽은 것으로). 안 읽은 트레이너 메시지가 있었으면 담당 트레이너에게 알린다
create or replace function user_chat_get(p_code text,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_mid(p_code); x members; tk text;
begin
  if m is null then return null; end if;
  if p_before is null then
    select * into x from members where id=m;
    if exists(select 1 from chat_messages c where c.member_id=m and c.sender='trainer' and c.created_at>coalesce(x.chat_read_at,'-infinity')) then
      update members set chat_read_at=now() where id=m;
      select chat_key into tk from trainers where id=x.trainer_id;
      perform _chat_ring_to('hl-tr-'||tk);
    end if;
  end if;
  return _chat_page(m,p_after,p_before);
end $$;

-- 트레이너·관리자 -------------------------------------------------------------------
create or replace function staff_chat_seen(p_token text,p_member uuid) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='trainer' then
    perform _need_assigned(s.subject,p_member);
  elsif not exists(select 1 from members where id=p_member) then
    raise exception 'member not found';
  end if;
  return _chat_seen(p_member);
end $$;

-- 대화 보기. 트레이너가 보면 읽은 것으로 하고, 안 읽은 이용자 메시지가 있었으면 그 이용자에게 알린다
create or replace function staff_chat_get(p_token text,p_member uuid,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare s staff_sessions; prev timestamptz; mk text;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if s.role='trainer' then
    perform _need_assigned(s.subject,p_member);
    if p_before is null then
      select read_at into prev from chat_reads where trainer_id=s.subject and member_id=p_member;
      if prev is null or exists(select 1 from chat_messages c where c.member_id=p_member and c.sender='member' and c.created_at>prev) then
        insert into chat_reads(trainer_id,member_id,read_at) values(s.subject,p_member,now())
          on conflict(trainer_id,member_id) do update set read_at=excluded.read_at;
        if exists(select 1 from chat_messages c where c.member_id=p_member and c.sender='member' and c.created_at>coalesce(prev,'-infinity')) then
          select chat_key into mk from members where id=p_member;
          perform _chat_ring_to('hl-chat-'||mk);
        end if;
      end if;
    end if;
  elsif not exists(select 1 from members where id=p_member) then
    raise exception 'member not found';
  end if;
  return _chat_page(p_member,p_after,p_before);
end $$;

revoke execute on function _chat_ring_to(text), _chat_seen(uuid) from public, anon, authenticated;
