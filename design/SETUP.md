# 서버 연결 방법 (약 15분)

설정 전에는 **체험 모드**로 동작합니다 — 기록이 그 기기에만 저장되고, 직원 비밀번호는 `1234`입니다.

## 1. Supabase (데이터베이스 · 영상 저장소)
1. https://supabase.com 가입 → **New project** 생성 (지역: Northeast Asia (Seoul) 권장)
2. `supabase-setup.sql` 파일을 열어 `'1234'`를 원하는 **직원 비밀번호**로 바꿉니다.
3. Supabase 왼쪽 메뉴 **SQL Editor** → 파일 내용 전체 붙여넣기 → **Run**
4. **Project Settings → API** 에서 `Project URL`과 `anon public`(또는 publishable) 키를 복사합니다.

## 2. 앱에 연결
`server-config.js`를 열어 복사한 값을 넣습니다.
```js
window.HEALTHLOG_SERVER = {
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseKey: 'eyJ...'
};
```

## 3. 호스팅 (인터넷 주소 만들기)
1. 이 프로젝트 전체를 내려받습니다 (index.html, 건강일지.dc.html, support.js, backend.js, server-config.js).
2. https://app.netlify.com/drop 에 폴더를 끌어다 놓으면 주소가 생깁니다.
3. 그 주소를 이용자에게 알려주세요. (휴대폰에서 "홈 화면에 추가"하면 앱처럼 쓸 수 있습니다.)

## 사용 흐름
- 관리자/트레이너: 직원 비밀번호로 들어가 **이용자 등록** → 6자리 번호가 자동 발급됩니다.
- 이용자: **이용자** 버튼 → 받은 번호 입력 → 본인 기록만 보입니다. 한 번 입력하면 그 휴대폰에서는 다시 묻지 않습니다.
- 번호를 잃어버리면 관리자 화면에서 **새 번호 발급**을 누르세요 (이전 번호는 더 이상 안 됩니다).

## 참고
- 번호에는 헷갈리는 글자(0·O, 1·I·L)를 쓰지 않습니다.
- 영상 파일은 Supabase 무료 요금제 기준 파일당 50MB까지 올릴 수 있습니다. 긴 영상은 유튜브 링크를 권장합니다.
- 영상 파일 저장소는 앱 주소를 아는 사람이 업로드할 수 있게 열려 있습니다. 영상 목록 등록·삭제는 직원 비밀번호로 보호됩니다.
