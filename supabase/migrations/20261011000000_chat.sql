-- 맞춤 건강관리 · 대화 (이용자 ↔ 트레이너 글 채팅)
-- 20261010000000_profiles.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 이용자마다 대화방이 하나 있고, 트레이너 누구나 답할 수 있습니다. 관리자는 대화 내용을 보기만 합니다.
-- ■ 새 메시지가 오면 Supabase 실시간으로 "새 메시지가 왔어요" 신호(초인종)만 보냅니다. 내용은 보내지 않고,
--   앱이 번호·로그인을 확인하는 함수로 가져옵니다. 신호 채널 이름은 추측할 수 없는 무작위 값입니다.
-- ■ 메시지는 1년이 지나면 지워집니다.

-- 표 --------------------------------------------------------------------------
create table if not exists chat_messages(
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  -- member = 이용자가 보냄, trainer = 트레이너가 보냄
  sender text not null check (sender in ('member','trainer')),
  trainer_id uuid references trainers(id) on delete set null,
  author text not null default '',
  body text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now());
create index if not exists chat_messages_member on chat_messages(member_id, created_at);
create index if not exists chat_messages_created on chat_messages(created_at);
alter table chat_messages enable row level security;

-- 트레이너마다 이용자별로 어디까지 읽었나
create table if not exists chat_reads(
  trainer_id uuid not null references trainers(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (trainer_id, member_id));
alter table chat_reads enable row level security;

alter table members add column if not exists chat_read_at timestamptz;
-- 이용자 초인종 채널 이름 (무작위)
alter table members add column if not exists chat_key text not null default encode(extensions.gen_random_bytes(16),'hex');

-- 직원 초인종 채널 이름 (무작위, 한 번만 만든다)
insert into settings(key,value) values('chat_staff_key', encode(extensions.gen_random_bytes(16),'hex')) on conflict (key) do nothing;

-- 내부 도우미 ---------------------------------------------------------------------
create or replace function _chat_at(t timestamptz) returns text language sql immutable as $$
  select to_char(t at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;

create or replace function _j_chat(c chat_messages) returns json language sql stable as $$
  select json_build_object('id',c.id,'mid',c.member_id,'from',c.sender,'tid',c.trainer_id,'by',c.author,'text',c.body,'at',_chat_at(c.created_at)) $$;

create or replace function _chat_staff_key() returns text language sql stable security definer set search_path=public as $$
  select value from settings where key='chat_staff_key' $$;

-- 대화 가져오기: p_after 뒤의 새 메시지, 또는 p_before 앞의 예전 메시지 50개, 둘 다 없으면 최근 50개 (시간 순서대로).
-- 같은 시각에 저장된 메시지를 놓치지 않도록 경계 시각의 메시지도 함께 보낸다 (앱에서 id 로 겹친 것을 뺀다)
create or replace function _chat_page(p_mid uuid,p_after timestamptz,p_before timestamptz) returns json
language sql stable security definer set search_path=public as $$
  select coalesce(json_agg(_j_chat(x) order by x.created_at),'[]'::json) from (
    select * from chat_messages c where c.member_id=p_mid
      and (p_after is null or c.created_at>=p_after) and (p_before is null or c.created_at<=p_before)
    order by case when p_after is null then c.created_at end desc, c.created_at
    limit case when p_after is null then 50 else 500 end) x $$;

-- 메시지 저장 + 1년 지난 메시지 지우기
create or replace function _chat_put(p_mid uuid,p_sender text,p_tid uuid,p_author text,p_text text) returns chat_messages
language plpgsql volatile security definer set search_path=public as $$
declare t text:=left(trim(coalesce(p_text,'')),500); r chat_messages;
begin
  if t='' then raise exception 'no text'; end if;
  insert into chat_messages(member_id,sender,trainer_id,author,body) values(p_mid,p_sender,p_tid,coalesce(p_author,''),t) returning * into r;
  delete from chat_messages where created_at < now()-interval '1 year';
  return r;
end $$;

-- 초인종: 새 메시지가 생기면 그 이용자 채널과 직원 채널에 빈 신호만 보낸다.
-- 실시간이 꺼져 있거나 실패해도 메시지 저장은 그대로 된다 (앱은 가끔 직접 확인도 한다)
create or replace function _chat_ring() returns trigger language plpgsql security definer set search_path=public as $$
declare k text;
begin
  select chat_key into k from members where id=new.member_id;
  begin
    perform realtime.send('{}'::jsonb,'ring','hl-chat-'||k,false);
    perform realtime.send('{}'::jsonb,'ring','hl-staff-'||_chat_staff_key(),false);
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists chat_ring on chat_messages;
create trigger chat_ring after insert on chat_messages for each row execute function _chat_ring();

-- 이용자 ----------------------------------------------------------------------
-- 안 읽은 수와 초인종 채널 (번호가 틀리면 null)
create or replace function user_chat_status(p_code text) returns json language plpgsql volatile security definer set search_path=public as $$
declare m members;
begin
  select * into m from members where id=_mid(p_code);
  if m.id is null then return null; end if;
  return json_build_object('key','hl-chat-'||m.chat_key,
    'unread',(select count(*) from chat_messages c where c.member_id=m.id and c.sender='trainer' and c.created_at>coalesce(m.chat_read_at,'-infinity')));
end $$;

-- 대화 보기 (보면 읽은 것으로)
create or replace function user_chat_get(p_code text,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  if p_before is null then update members set chat_read_at=now() where id=m; end if;
  return _chat_page(m,p_after,p_before);
end $$;

create or replace function user_chat_send(p_code text,p_text text) returns json language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code); r chat_messages;
begin
  if m is null then return null; end if;
  r:=_chat_put(m,'member',null,'',p_text);
  update members set chat_read_at=now() where id=m;
  return _j_chat(r);
end $$;

-- 트레이너·관리자 -------------------------------------------------------------------
-- 대화방 목록: 이용자마다 마지막 메시지와 (트레이너는) 안 읽은 수. 직원 초인종 채널도 함께
create or replace function staff_chat_list(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  return json_build_object('key','hl-staff-'||_chat_staff_key(),
    'rooms',coalesce((select json_agg(json_build_object('mid',l.member_id,'last',_j_chat(l),
        'unread',case when s.role='trainer' then (select count(*) from chat_messages c where c.member_id=l.member_id and c.sender='member'
            and c.created_at>coalesce((select read_at from chat_reads r where r.trainer_id=s.subject and r.member_id=l.member_id),'-infinity')) else 0 end)
        order by l.created_at desc)
      from (select distinct on (member_id) * from chat_messages order by member_id, created_at desc) l),'[]'::json));
end $$;

-- 대화 보기. 트레이너가 보면 읽은 것으로 (관리자는 보기만)
create or replace function staff_chat_get(p_token text,p_member uuid,p_after timestamptz default null,p_before timestamptz default null) returns json
language plpgsql volatile security definer set search_path=public as $$
declare s staff_sessions;
begin
  select * into s from staff_sessions where token_hash=_token_hash(p_token) and expires_at>now();
  if s.token_hash is null then raise exception 'invalid session'; end if;
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  if s.role='trainer' and p_before is null then
    insert into chat_reads(trainer_id,member_id,read_at) values(s.subject,p_member,now())
      on conflict(trainer_id,member_id) do update set read_at=excluded.read_at;
  end if;
  return _chat_page(p_member,p_after,p_before);
end $$;

-- 보내기는 트레이너만
create or replace function trainer_chat_send(p_token text,p_member uuid,p_text text) returns json language plpgsql security definer set search_path=public as $$
declare tid uuid:=_need_trainer(p_token); r chat_messages;
begin
  if not exists(select 1 from members where id=p_member) then raise exception 'member not found'; end if;
  r:=_chat_put(p_member,'trainer',tid,_staff_label(p_token),p_text);
  insert into chat_reads(trainer_id,member_id,read_at) values(tid,p_member,now())
    on conflict(trainer_id,member_id) do update set read_at=excluded.read_at;
  return _j_chat(r);
end $$;

revoke execute on function _chat_at(timestamptz), _j_chat(chat_messages), _chat_staff_key(), _chat_page(uuid,timestamptz,timestamptz),
  _chat_put(uuid,text,uuid,text,text), _chat_ring()
  from public, anon, authenticated;
