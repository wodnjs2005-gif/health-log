// dist/ 를 파일 하나짜리 HTML 로 합친다. 더블클릭(file://)으로 바로 열 수 있다.
// 사용법: npm run build:html  →  ../나의 건강일지.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = resolve(root, '..', '나의 건강일지.html');

// 체험 모드가 없으므로 Supabase 주소·키 없이 만들면 '서버 연결 설정이 필요해요' 화면만 나온다
const env = loadEnv('production', root, 'VITE_');
if (!env.VITE_SUPABASE_URL?.trim() || !env.VITE_SUPABASE_KEY?.trim()) {
  console.error('✗ .env 에 VITE_SUPABASE_URL, VITE_SUPABASE_KEY 를 넣은 뒤 다시 실행하세요. (README 3. 환경변수)');
  process.exit(1);
}

const read = (p) => readFileSync(join(dist, p.replace(/^\//, '')), 'utf8');
let html = read('index.html');

// JS: 외부 module 스크립트는 file:// 에서 막히므로 본문에 넣는다
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => {
  const js = read(src).replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});

// CSS
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/, (_, href) => `<style>\n${read(href)}\n</style>`);

// 아이콘은 data URI 로, manifest 는 file:// 에서 못 읽으므로 뺀다
const icon = 'data:image/svg+xml;base64,' + Buffer.from(read('icon.svg')).toString('base64');
html = html
  .replace(/href="\/icon\.svg"/g, `href="${icon}"`)
  .replace(/\s*<link rel="manifest"[^>]*>/, '');

if (/src="\/assets|href="\/assets/.test(html)) throw new Error('합치지 못한 파일이 남아 있어요');

writeFileSync(out, html);
console.log(`✓ ${out} (${Math.round(html.length / 1024)} KB)`);
