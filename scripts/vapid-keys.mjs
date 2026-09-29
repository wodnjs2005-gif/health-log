// 휴대폰 알림 서명 키(VAPID) 만들기. 한 번만 만들면 된다 (바꾸면 켜 둔 알림을 모두 다시 켜야 한다).
// 실행: node scripts/vapid-keys.mjs  → vapid-keys.local 파일에 저장 (git 에 올라가지 않는다)
// 두 값을 Vercel → Settings → Environment Variables 에 VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY 로 넣고 다시 배포한다.
import { existsSync, writeFileSync } from 'node:fs';
import webpush from 'web-push';

const out = 'vapid-keys.local';
if (existsSync(out) && !process.argv.includes('--force')) {
  console.log(`${out} 파일이 이미 있어요. 새로 만들려면 --force 를 붙이세요 (켜 둔 알림이 모두 꺼져요).`);
  process.exit(0);
}
const k = webpush.generateVAPIDKeys();
writeFileSync(
  out,
  `# Vercel → Settings → Environment Variables 에 아래 두 줄을 그대로 넣으세요 (Name = 왼쪽, Value = 오른쪽)\n` +
    `# VAPID_PRIVATE_KEY 는 비밀이에요. 다른 곳에 올리거나 보내지 마세요.\n` +
    `VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\n`,
);
console.log(`✓ ${out} 에 저장했어요.`);
