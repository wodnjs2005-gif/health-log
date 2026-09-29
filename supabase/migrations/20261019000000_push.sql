-- 맞춤 건강관리 · 휴대폰 알림 (앱이 닫혀 있어도)
-- 20261018000000_note_seen.sql 다음에 실행하세요. (SQL Editor 에 붙여넣고 Run, 또는 supabase db push)
--
-- ■ 알림을 보내는 때
--   · 대화: 트레이너가 보내면 이용자에게, 이용자가 보내면 담당 트레이너에게
--   · 트레이너 한마디: 이용자와 보호자에게
--   · 공지사항: 이용자와 보호자에게
--   · 저녁 7시: 「기록 알림」을 켠 이용자 중 오늘 운동·식사 기록이 없는 분에게
-- ■ 흐름: 보낼 내용과 받을 휴대폰을 push_queue 에 넣고, pg_net 으로 Vercel 의 /api/push 에 그 줄의 번호(uuid)만 알린다.
--   /api/push 가 push_take 로 내용을 받아 휴대폰에 보내고, 없어진 휴대폰은 push_done 으로 지운다.
--   번호는 추측할 수 없고 한 번만 꺼낼 수 있어 따로 비밀 키가 필요 없다. 알림 서명 키(VAPID)는 Vercel 환경 변수에만 둔다.
-- ■ 개인 번호·보호자 번호·트레이너 번호를 새로 발급하거나 지우면 그 번호로 켠 알림도 함께 지운다 (잃어버린 휴대폰에 가지 않게).

do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net 을 켜지 못했어요: %', sqlerrm; end $$;
do $$ begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron 을 켜지 못했어요: %', sqlerrm; end $$;

-- 알림을 켠 휴대폰 (kind: member = 이용자 · guardian = 보호자(돌보는 이용자 id) · trainer = 트레이너)
create table if not exists push_subs(
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('member','guardian','trainer')),
  owner uuid not null,
  endpoint text not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  -- 저녁 7시 기록 알림 (이용자만)
  remind boolean not null default false,
  created_at timestamptz not null default now(),
  unique(endpoint, kind, owner));
create index if not exists push_subs_owner on push_subs(kind, owner);
alter table push_subs enable row level security;

-- 보낼 알림 (보내면 지운다. 하루 지난 것도 지운다)
create table if not exists push_queue(
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  subs uuid[] not null,
  created_at timestamptz not null default now(),
  taken_at timestamptz);
alter table push_queue enable row level security;

insert into settings(key,value) values('push_url','https://health-log-sand.vercel.app/api/push') on conflict (key) do nothing;

-- 내부 도우미 ---------------------------------------------------------------------
create or replace function _push_subs(p_kind text, p_owner uuid) returns uuid[] language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(id),'{}') from push_subs where kind=p_kind and owner=p_owner $$;

-- 알림 한 건을 줄에 넣고 /api/push 를 깨운다. 실패해도 원래 일(메시지 저장 등)은 그대로 된다
create or replace function _push(p_subs uuid[], p_title text, p_body text, p_tag text, p_url text) returns void
language plpgsql security definer set search_path=public as $$
declare q uuid; u text;
begin
  if coalesce(array_length(p_subs,1),0)=0 then return; end if;
  select value into u from settings where key='push_url';
  if coalesce(u,'')='' then return; end if;
  begin
    insert into push_queue(payload,subs)
      values(jsonb_build_object('title',left(p_title,60),'body',left(coalesce(p_body,''),120),'tag',p_tag,'url',coalesce(p_url,'/')), p_subs)
      returning id into q;
    perform net.http_post(url:=u, body:=jsonb_build_object('id',q), headers:='{"Content-Type":"application/json"}'::jsonb);
  exception when others then null;
  end;
end $$;

-- 켜기·끄기 (같은 휴대폰으로 다시 켜면 키만 새로 고친다). 한 사람당 휴대폰 10대까지
create or replace function _push_set(p_kind text,p_owner uuid,p_endpoint text,p_p256dh text,p_auth text,p_on boolean,p_remind boolean) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  if p_on then
    insert into push_subs(kind,owner,endpoint,p256dh,auth,remind)
      values(p_kind,p_owner,p_endpoint,p_p256dh,p_auth,coalesce(p_remind,false))
      on conflict (endpoint,kind,owner) do update set p256dh=excluded.p256dh, auth=excluded.auth, remind=excluded.remind;
    delete from push_subs where id in (select id from push_subs where kind=p_kind and owner=p_owner order by created_at desc offset 10);
  else
    delete from push_subs where kind=p_kind and owner=p_owner and endpoint=p_endpoint;
  end if;
  return coalesce(p_on,false);
end $$;

-- 켜기·끄기 (이용자·보호자는 번호가 틀리면 null) ---------------------------------------
create or replace function user_push_set(p_code text,p_endpoint text,p_p256dh text,p_auth text,p_on boolean,p_remind boolean) returns boolean
language plpgsql security definer set search_path=public as $$
declare m uuid:=_mid(p_code);
begin
  if m is null then return null; end if;
  return _push_set('member',m,p_endpoint,p_p256dh,p_auth,p_on,p_remind);
end $$;

create or replace function guardian_push_set(p_code text,p_endpoint text,p_p256dh text,p_auth text,p_on boolean) returns boolean
language plpgsql security definer set search_path=public as $$
declare m uuid:=_gid(p_code);
begin
  if m is null then return null; end if;
  return _push_set('guardian',m,p_endpoint,p_p256dh,p_auth,p_on,false);
end $$;

create or replace function trainer_push_set(p_token text,p_endpoint text,p_p256dh text,p_auth text,p_on boolean) returns boolean
language plpgsql security definer set search_path=public as $$
declare t uuid:=_need_trainer(p_token);
begin
  return _push_set('trainer',t,p_endpoint,p_p256dh,p_auth,p_on,false);
end $$;

-- /api/push 가 부른다: 한 번만 꺼낼 수 있고 10분이 지나면 못 꺼낸다 ----------------------------
create or replace function push_take(p_id uuid) returns json language plpgsql security definer set search_path=public as $$
declare q push_queue;
begin
  delete from push_queue where created_at < now()-interval '1 day';
  update push_queue set taken_at=now() where id=p_id and taken_at is null and created_at > now()-interval '10 minutes' returning * into q;
  if q.id is null then return null; end if;
  return json_build_object('payload',q.payload,
    'subs',coalesce((select json_agg(json_build_object('endpoint',endpoint,'p256dh',p256dh,'auth',auth)) from push_subs where id=any(q.subs)),'[]'::json));
end $$;

-- 보낸 뒤: 없어진 휴대폰(그 알림을 받을 휴대폰 중에서만)을 지우고 줄을 지운다
create or replace function push_done(p_id uuid,p_gone text[]) returns void language plpgsql security definer set search_path=public as $$
declare q push_queue;
begin
  select * into q from push_queue where id=p_id and taken_at is not null;
  if q.id is null then return; end if;
  delete from push_subs where id=any(q.subs) and endpoint=any(coalesce(p_gone,'{}'));
  delete from push_queue where id=p_id;
end $$;

-- 알림을 보내는 때 ------------------------------------------------------------------
create or replace function _push_chat() returns trigger language plpgsql security definer set search_path=public as $$
declare m members;
begin
  select * into m from members where id=new.member_id;
  if new.sender='trainer' then
    perform _push(_push_subs('member',m.id), coalesce(nullif(new.author,''),'트레이너')||' · 새 메시지', new.body, 'chat', '/?go=chat');
  elsif m.trainer_id is not null then
    perform _push(_push_subs('trainer',m.trainer_id), m.name||' 님 · 새 메시지', new.body, 'chat-'||m.id, '/?go=chat');
  end if;
  return new;
end $$;
drop trigger if exists chat_push on chat_messages;
create trigger chat_push after insert on chat_messages for each row execute function _push_chat();

create or replace function _push_note() returns trigger language plpgsql security definer set search_path=public as $$
declare nm text;
begin
  select name into nm from members where id=new.member_id;
  perform _push(_push_subs('member',new.member_id), '트레이너 한마디', coalesce(nullif(new.author,''),'트레이너')||': '||new.body, 'note', '/');
  perform _push(_push_subs('guardian',new.member_id), nm||' 님께 트레이너 한마디', coalesce(nullif(new.author,''),'트레이너')||': '||new.body, 'note-'||new.member_id, '/');
  return new;
end $$;
drop trigger if exists note_push on member_notes;
create trigger note_push after insert on member_notes for each row execute function _push_note();

create or replace function _push_notice() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform _push(array(select id from push_subs where kind in ('member','guardian')), '새 공지사항', new.body, 'notice', '/');
  return new;
end $$;
drop trigger if exists notice_push on notices;
create trigger notice_push after insert on notices for each row execute function _push_notice();

-- 저녁 7시 (한국 시각): 기록 알림을 켠 이용자 중 오늘 운동·식사 기록이 하나도 없는 분
create or replace function push_daily_remind() returns void language plpgsql security definer set search_path=public as $$
declare d date:=_kst_today();
begin
  perform _push(array(select s.id from push_subs s where s.kind='member' and s.remind
      and not exists(select 1 from exercises e where e.member_id=s.owner and e.date=d)
      and not exists(select 1 from meals x where x.member_id=s.owner and x.date=d)),
    '오늘 기록을 남겨 주세요', '오늘 한 운동과 먹은 식사를 적어 주세요. 누르면 바로 열려요.', 'remind', '/');
end $$;

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname='healthlog-remind';
  perform cron.schedule('healthlog-remind','0 10 * * *','select public.push_daily_remind()');
exception when others then raise notice '저녁 기록 알림 예약을 하지 못했어요 (pg_cron): %', sqlerrm;
end $$;

-- 번호를 새로 발급하거나 지우면 그 번호로 켠 알림도 지운다 --------------------------------------
create or replace function _push_cut_member() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    delete from push_subs where kind in ('member','guardian') and owner=old.id;
    return old;
  end if;
  if new.code is distinct from old.code then delete from push_subs where kind='member' and owner=new.id; end if;
  if new.guardian_code is distinct from old.guardian_code then delete from push_subs where kind='guardian' and owner=new.id; end if;
  return new;
end $$;
drop trigger if exists push_cut on members;
create trigger push_cut after update of code, guardian_code or delete on members for each row execute function _push_cut_member();

create or replace function _push_cut_trainer() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    delete from push_subs where kind='trainer' and owner=old.id;
    return old;
  end if;
  if new.code is distinct from old.code then delete from push_subs where kind='trainer' and owner=new.id; end if;
  return new;
end $$;
drop trigger if exists push_cut on trainers;
create trigger push_cut after update of code or delete on trainers for each row execute function _push_cut_trainer();

revoke execute on function _push_subs(text,uuid), _push(uuid[],text,text,text,text),
  _push_set(text,uuid,text,text,text,boolean,boolean), _push_chat(), _push_note(), _push_notice(),
  _push_cut_member(), _push_cut_trainer(), push_daily_remind()
  from public, anon, authenticated;
