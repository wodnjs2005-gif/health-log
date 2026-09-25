(function(){
const CH='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode=()=>{const a=new Uint32Array(6);crypto.getRandomValues(a);return Array.from(a,n=>CH[n%CH.length]).join('');};
const norm=c=>String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const uid=()=>Math.random().toString(36).slice(2,10);
const KEY='healthlog.v1';
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const addDays=(n)=>{const d=new Date();d.setDate(d.getDate()+n);return ymd(d);};
const authErr=()=>{const e=new Error('auth');e.auth=true;return e;};

const idbOpen=()=>new Promise((res,rej)=>{const r=indexedDB.open('healthlog-media',1);r.onupgradeneeded=()=>r.result.createObjectStore('videos');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const idbDo=async(mode,fn)=>{const db=await idbOpen();return new Promise((res,rej)=>{const tx=db.transaction('videos',mode);const req=fn(tx.objectStore('videos'));tx.oncomplete=()=>res(req.result);tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);});};

function seed(){
  const E=(mid,o,kind,min,level,memo='')=>({id:uid(),mid,date:addDays(o),kind,min,level,memo});
  const M=(mid,o,meal,menu,amount='보통',memo='')=>({id:uid(),mid,date:addDays(o),meal,menu,amount,memo});
  return {members:[{id:'m1',name:'김순자',age:78,code:genCode()},{id:'m2',name:'박영호',age:72,code:genCode()},{id:'m3',name:'이말순',age:81,code:genCode()}],
    ex:[E('m1',-1,'걷기',30,'보통','공원 한 바퀴'),E('m1',-2,'스트레칭',15,'가볍게'),E('m1',-3,'걷기',40,'보통'),E('m1',-5,'체조',20,'가볍게','복지관 건강체조'),
      E('m2',0,'걷기',40,'보통'),E('m2',-1,'근력운동',20,'힘들게','밴드 운동'),E('m2',-2,'걷기',45,'보통'),E('m3',-2,'체조',15,'가볍게')],
    meals:[M('m1',-1,'아침','잡곡밥, 미역국'),M('m1',-1,'점심','비빔국수','적게'),M('m1',0,'아침','두유, 삶은 달걀, 사과'),M('m2',0,'점심','콩국수','많이'),M('m3',-1,'점심','죽','적게','입맛 없음')],
    programs:[],views:[]};
}

function local(cfg){
  const staffPw=cfg.localStaffPassword||'1234';
  const load=()=>{
    let d=null;try{d=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){}
    if(!d||!d.members){d=seed();save(d);return d;}
    ['ex','meals','programs','views'].forEach(k=>d[k]=d[k]||[]);
    let dirty=false;
    d.members.forEach(m=>{if(!m.code){let c;do{c=genCode();}while(d.members.some(x=>x.code===c));m.code=c;dirty=true;}});
    if(dirty)save(d);
    return d;
  };
  const save=d=>{const {members,ex,meals,programs,views}=d;localStorage.setItem(KEY,JSON.stringify({members,ex,meals,programs,views}));};
  const who=(d,code)=>{const m=d.members.find(x=>x.code===norm(code));if(!m)throw authErr();return m;};
  const staff=pw=>{if(pw!==staffPw)throw authErr();return load();};
  const userData=(d,m)=>({member:m,ex:d.ex.filter(x=>x.mid===m.id),meals:d.meals.filter(x=>x.mid===m.id),
    programs:d.programs.filter(p=>p.mids.includes(m.id)).map(p=>({...p,mids:[m.id]})),views:d.views.filter(v=>v.mid===m.id)});
  return {
    mode:'local',
    async demoHint(){const d=load();const m=d.members[0];return m?`${m.name} 님 번호: ${m.code}`:'';},
    async userGet(code){const d=load();const m=d.members.find(x=>x.code===norm(code));return m?userData(d,m):null;},
    async userAddEx(code,r){const d=load(),m=who(d,code),rec={id:uid(),mid:m.id,date:r.date,kind:r.kind,min:r.min,level:r.level,memo:r.memo||''};d.ex.push(rec);save(d);return rec;},
    async userAddMeal(code,r){const d=load(),m=who(d,code),rec={id:uid(),mid:m.id,date:r.date,meal:r.meal,menu:r.menu,amount:r.amount,memo:r.memo||''};d.meals.push(rec);save(d);return rec;},
    async userDelEx(code,id){const d=load(),m=who(d,code);d.ex=d.ex.filter(x=>!(x.id===id&&x.mid===m.id));save(d);},
    async userDelMeal(code,id){const d=load(),m=who(d,code);d.meals=d.meals.filter(x=>!(x.id===id&&x.mid===m.id));save(d);},
    async userAddView(code,pid,date){
      const d=load(),m=who(d,code),p=d.programs.find(x=>x.id===pid&&x.mids.includes(m.id));if(!p)throw authErr();
      const view={id:uid(),pid,mid:m.id,date},ex={id:uid(),mid:m.id,date,kind:p.kind,min:p.min,level:'보통',memo:`영상 따라하기 · ${p.title}`,pid};
      d.views.push(view);d.ex.push(ex);save(d);return {view,ex};
    },
    async staffGet(pw){if(pw!==staffPw)return null;const {members,ex,meals,programs,views}=load();return {members,ex,meals,programs,views};},
    async staffAddMember(pw,name,age){const d=staff(pw);let c;do{c=genCode();}while(d.members.some(x=>x.code===c));const m={id:'m'+uid(),name,age:age||null,code:c};d.members.push(m);save(d);return m;},
    async staffDelMember(pw,id){const d=staff(pw);d.members=d.members.filter(m=>m.id!==id);d.ex=d.ex.filter(e=>e.mid!==id);d.meals=d.meals.filter(e=>e.mid!==id);d.views=d.views.filter(v=>v.mid!==id);d.programs.forEach(p=>p.mids=p.mids.filter(x=>x!==id));save(d);},
    async staffNewCode(pw,id){const d=staff(pw),m=d.members.find(x=>x.id===id);if(!m)throw authErr();let c;do{c=genCode();}while(d.members.some(x=>x.code===c));m.code=c;save(d);return c;},
    async staffAddProgram(pw,p,file){
      const d=staff(pw),id='p'+uid();
      const rec={id,title:p.title,type:p.type,mids:p.mids,kind:p.kind,min:p.min,memo:p.memo||'',date:ymd(new Date()),
        src:file?'file':'yt',ytId:file?null:p.ytId,videoKey:file?id:null,videoName:file?file.name:'유튜브 영상'};
      if(file)await idbDo('readwrite',st=>st.put(file,id));
      d.programs.unshift(rec);save(d);return rec;
    },
    async staffDelProgram(pw,id){const d=staff(pw),p=d.programs.find(x=>x.id===id);if(p&&p.videoKey)idbDo('readwrite',st=>st.delete(p.videoKey)).catch(()=>{});d.programs=d.programs.filter(x=>x.id!==id);d.views=d.views.filter(v=>v.pid!==id);save(d);},
    async videoUrl(p){if(p.videoUrl)return {url:p.videoUrl};const blob=await idbDo('readonly',st=>st.get(p.videoKey||p.id));return blob?{url:URL.createObjectURL(blob),revoke:true}:null;}
  };
}

function supabase(cfg){
  const base=cfg.supabaseUrl.replace(/\/+$/,''),key=cfg.supabaseKey;
  const H=(ct='application/json')=>{const h={apikey:key,'Content-Type':ct};if(/^eyJ/.test(key))h.Authorization='Bearer '+key;return h;};
  const rpc=async(fn,args)=>{
    const r=await fetch(`${base}/rest/v1/rpc/${fn}`,{method:'POST',headers:H(),body:JSON.stringify(args)});
    const t=await r.text();
    if(!r.ok){const e=new Error(t||r.statusText);if(/invalid code|not allowed|invalid password/.test(t))e.auth=true;throw e;}
    return t?JSON.parse(t):null;
  };
  return {
    mode:'server',
    async demoHint(){return '';},
    userGet:code=>rpc('user_get',{p_code:norm(code)}),
    userAddEx:(code,r)=>rpc('user_add_ex',{p_code:norm(code),p_date:r.date,p_kind:r.kind,p_min:r.min,p_level:r.level,p_memo:r.memo||''}),
    userAddMeal:(code,r)=>rpc('user_add_meal',{p_code:norm(code),p_date:r.date,p_meal:r.meal,p_menu:r.menu,p_amount:r.amount,p_memo:r.memo||''}),
    userDelEx:(code,id)=>rpc('user_del_ex',{p_code:norm(code),p_id:id}),
    userDelMeal:(code,id)=>rpc('user_del_meal',{p_code:norm(code),p_id:id}),
    userAddView:(code,pid,date)=>rpc('user_add_view',{p_code:norm(code),p_program:pid,p_date:date}),
    staffGet:pw=>rpc('staff_get',{p_pw:pw}),
    staffAddMember:(pw,name,age)=>rpc('staff_add_member',{p_pw:pw,p_name:name,p_age:age||null}),
    staffDelMember:(pw,id)=>rpc('staff_del_member',{p_pw:pw,p_id:id}),
    staffNewCode:(pw,id)=>rpc('staff_new_code',{p_pw:pw,p_id:id}),
    async staffAddProgram(pw,p,file){
      let url=null,name='유튜브 영상';
      if(file){
        if(!(await rpc('staff_login',{p_pw:pw})))throw authErr();
        const ext=((file.name.split('.').pop()||'mp4').toLowerCase().replace(/[^a-z0-9]/g,''))||'mp4';
        const path=`${Date.now()}-${uid()}.${ext}`;
        const r=await fetch(`${base}/storage/v1/object/videos/${path}`,{method:'POST',headers:H(file.type||'video/mp4'),body:file});
        if(!r.ok)throw new Error('upload '+r.status);
        url=`${base}/storage/v1/object/public/videos/${path}`;name=file.name;
      }
      return rpc('staff_add_program',{p_pw:pw,p_title:p.title,p_type:p.type,p_kind:p.kind,p_min:p.min,p_memo:p.memo||'',
        p_src:file?'url':'yt',p_yt_id:file?null:p.ytId,p_video_url:url,p_video_name:name,p_mids:p.mids});
    },
    staffDelProgram:(pw,id)=>rpc('staff_del_program',{p_pw:pw,p_id:id}),
    async videoUrl(p){return p.videoUrl?{url:p.videoUrl}:null;}
  };
}

window.HealthBackend={create(cfg){cfg=cfg||{};return cfg.supabaseUrl&&cfg.supabaseKey?supabase(cfg):local(cfg);},norm};
})();
