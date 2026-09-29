"""맞춤 건강관리 앱 아이콘: 바탕 + 하트(건강) + 맥박선(운동) + 새싹 잎(식사).
같은 도형으로 SVG 와 PNG 를 만든다 (PNG 는 4배로 그린 뒤 줄여 가장자리를 매끄럽게).
실행: python scripts/build-icons.py  (Pillow 필요) → public/ 의 아이콘 5개를 다시 만들고,
index.html · manifest · 설치 안내 카드의 아이콘 주소에 ?v=(내용 해시) 를 붙여 휴대폰이 새 아이콘을 받게 한다."""
import os, re, sys
from PIL import Image, ImageDraw

# 색: 나이 드신 분도 잘 보이도록 따뜻하고 밝은 바탕 + 진한 하트 (파랑·보라는 노안에 흐리게 보여 쓰지 않는다).
# 색약이어도 구분되도록 바탕·하트·잎·맥박선의 밝기 차이를 크게 둔다.
C = {
    'bg_top': '#FFC21A',
    'bg_bottom': '#FF9F0A',
    'heart': '#E8262D',
    'pulse': '#FFFFFF',
    'leaf': '#1F9E4A',
    'vein': '#FFC21A',
}
DY = 14  # 전체를 조금 아래로 (잎이 위에 붙으므로)

HEART_D = 'M256 416 C176 362 98 302 98 214 C98 158 140 122 190 122 C222 122 245 138 256 160 C267 138 290 122 322 122 C372 122 414 158 414 214 C414 302 336 362 256 416 Z'
LEAF_D = 'M266 150 C262 104 292 70 348 60 C352 112 322 146 266 150 Z'
VEIN_D = [(272, 142), (330, 80)]
PULSE_PTS = [(146, 262), (200, 262), (224, 214), (256, 318), (286, 234), (306, 262), (366, 262)]
PULSE_W = 30
ART = 1.08  # 둥근 아이콘 안에서 그림 크기
VEIN_W = 7


def shift_d(d):
    """경로의 y 값에 DY 를 더한다 (숫자는 x, y 순서)"""
    res, i = [], 0
    for tok in re.findall(r'[MCLZ]|-?\d+(?:\.\d+)?', d):
        if tok in 'MCLZ':
            res.append(tok)
            continue
        v = float(tok) + (DY if i % 2 else 0)
        res.append('%g' % v)
        i += 1
    return ' '.join(res)


def sample(d, scale):
    toks = re.findall(r'[MCLZ]|-?\d+(?:\.\d+)?', d)
    pts, cur, i, cmd = [], (0, 0), 0, None
    while i < len(toks):
        t = toks[i]
        if t in 'MCLZ':
            cmd = t
            i += 1
            if t == 'Z':
                continue
        if cmd in ('M', 'L'):
            cur = (float(toks[i]), float(toks[i + 1]))
            pts.append(cur)
            i += 2
        elif cmd == 'C':
            p1 = (float(toks[i]), float(toks[i + 1]))
            p2 = (float(toks[i + 2]), float(toks[i + 3]))
            p3 = (float(toks[i + 4]), float(toks[i + 5]))
            for k in range(1, 61):
                u = k / 60
                a, b, c, e = (1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3
                pts.append((a * cur[0] + b * p1[0] + c * p2[0] + e * p3[0], a * cur[1] + b * p1[1] + c * p2[1] + e * p3[1]))
            cur = p3
            i += 6
    return [(x * scale, y * scale) for x, y in pts]


def polyline(draw, pts, w, color, scale):
    pts = [(x * scale, (y + DY) * scale) for x, y in pts]
    r = w * scale / 2
    draw.line(pts, fill=color, width=round(w * scale), joint='curve')
    for x, y in pts:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def rgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def gradient(big):
    top, bot = rgb(C['bg_top']), rgb(C['bg_bottom'])
    g = Image.new('RGBA', (1, big))
    for y in range(big):
        u = y / max(1, big - 1)
        g.putpixel((0, y), tuple(round(top[k] + (bot[k] - top[k]) * u) for k in range(3)) + (255,))
    return g.resize((big, big))


def render(size, rounded, inset=0.0):
    """inset: 도형을 가운데로 줄이는 비율 (maskable 안전 영역)"""
    S = 4
    big = size * S
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    mask = Image.new('L', (big, big), 0)
    md = ImageDraw.Draw(mask)
    if rounded:
        md.rounded_rectangle([0, 0, big - 1, big - 1], radius=round(big * 14 / 64), fill=255)
    else:
        md.rectangle([0, 0, big, big], fill=255)
    img.paste(gradient(big), (0, 0), mask)
    art = Image.new('RGBA', (512 * S, 512 * S), (0, 0, 0, 0))
    a = ImageDraw.Draw(art)
    a.polygon(sample(shift_d(LEAF_D), S), fill=C['leaf'])
    polyline(a, VEIN_D, VEIN_W, C['vein'], S)
    a.polygon(sample(shift_d(HEART_D), S), fill=C['heart'])
    polyline(a, PULSE_PTS, PULSE_W, C['pulse'], S)
    k = ART * (1 - inset)
    art_size = round(big * k)
    art = art.resize((art_size, art_size), Image.LANCZOS)
    off = (big - art_size) // 2
    if off < 0:
        art = art.crop((-off, -off, -off + big, -off + big))
        off = 0
    img.alpha_composite(art, (off, off))
    return img.resize((size, size), Image.LANCZOS)


def svg():
    pts = ' '.join('%g,%g' % (x, y + DY) for x, y in PULSE_PTS)
    vein = ' '.join('%g,%g' % (x, y + DY) for x, y in VEIN_D)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        f'<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{C["bg_top"]}"/><stop offset="1" stop-color="{C["bg_bottom"]}"/></linearGradient></defs>'
        '<rect width="512" height="512" rx="112" fill="url(#b)"/>'
        f'<g transform="translate(256 256) scale({ART}) translate(-256 -256)">'
        f'<path d="{shift_d(LEAF_D)}" fill="{C["leaf"]}"/>'
        f'<polyline points="{vein}" fill="none" stroke="{C["vein"]}" stroke-width="{VEIN_W}" stroke-linecap="round"/>'
        f'<path d="{shift_d(HEART_D)}" fill="{C["heart"]}"/>'
        f'<polyline points="{pts}" fill="none" stroke="{C["pulse"]}" stroke-width="{PULSE_W}" stroke-linecap="round" stroke-linejoin="round"/></g>'
        '</svg>\n'
    )


def badge(size):
    """안드로이드 알림 줄의 작은 아이콘: 투명 바탕에 흰 하트 (맥박선은 비워 둔다). 휴대폰이 모양만 쓴다"""
    S = 4
    art = Image.new('RGBA', (512 * S, 512 * S), (0, 0, 0, 0))
    a = ImageDraw.Draw(art)
    a.polygon(sample(shift_d(HEART_D), S), fill='#FFFFFF')
    a.polygon(sample(shift_d(LEAF_D), S), fill='#FFFFFF')
    polyline(a, PULSE_PTS, PULSE_W, (0, 0, 0, 0), S)
    return art.resize((size, size), Image.LANCZOS)


def build(out):
    os.makedirs(out, exist_ok=True)
    render(192, True).save(os.path.join(out, 'icon-192.png'), optimize=True)
    render(512, True).save(os.path.join(out, 'icon-512.png'), optimize=True)
    render(512, False, inset=0.14).save(os.path.join(out, 'icon-maskable-512.png'), optimize=True)
    render(180, False, inset=0.06).convert('RGB').save(os.path.join(out, 'apple-touch-icon.png'), optimize=True)
    badge(96).save(os.path.join(out, 'badge-96.png'), optimize=True)
    with open(os.path.join(out, 'icon.svg'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(svg())


# 주소가 같으면 휴대폰·브라우저가 예전 아이콘을 그대로 보여 주므로, 아이콘이 바뀌면 주소 끝의 ?v= 를 바꾼다
REFS = ['index.html', 'public/manifest.webmanifest', 'src/components/InstallCard.tsx']
FILES = ['icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']


def stamp(out):
    import hashlib
    h = hashlib.sha1()
    for name in FILES:
        with open(os.path.join(out, name), 'rb') as f:
            h.update(f.read())
    v = h.hexdigest()[:8]
    pat = re.compile(r'(/(?:%s))(\?v=[0-9a-f]+)?' % '|'.join(re.escape(f) for f in FILES))
    for p in REFS:
        with open(p, encoding='utf-8', newline='') as f:
            t = f.read()
        n = pat.sub(lambda m: m.group(1) + '?v=' + v, t)
        if n != t:
            with open(p, 'w', encoding='utf-8', newline='') as f:
                f.write(n)
    return v


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'public'
    build(out)
    if out == 'public':
        print('ok · 아이콘 주소 v=' + stamp(out))
    else:
        print('ok')
