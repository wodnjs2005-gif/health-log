"""맞춤 건강관리 앱 아이콘: 초록 바탕 + 흰 하트(건강) + 주황 맥박선(운동) + 연두 새싹 잎(식사).
같은 도형으로 SVG 와 PNG 를 만든다 (PNG 는 4배로 그린 뒤 줄여 가장자리를 매끄럽게).
실행: python scripts/build-icons.py  (Pillow 필요) → public/ 의 아이콘 5개를 다시 만든다."""
import os, re, sys
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else 'public'
BG = '#2E6A4E'
HEART = '#FFFFFF'
PULSE = '#C9611F'
LEAF = '#A9D8A0'
VEIN = '#2E6A4E'
DY = 14  # 전체를 조금 아래로 (잎이 위에 붙으므로)

HEART_D = 'M256 416 C176 362 98 302 98 214 C98 158 140 122 190 122 C222 122 245 138 256 160 C267 138 290 122 322 122 C372 122 414 158 414 214 C414 302 336 362 256 416 Z'
LEAF_D = 'M266 150 C262 104 292 70 348 60 C352 112 322 146 266 150 Z'
VEIN_D = [(272, 142), (330, 80)]
PULSE_PTS = [(146, 262), (200, 262), (224, 214), (256, 318), (286, 234), (306, 262), (366, 262)]
PULSE_W = 28
ART = 1.08  # 둥근 아이콘 안에서 그림 크기
VEIN_W = 7


def shift_d(d):
    nums = iter(re.findall(r'-?\d+(?:\.\d+)?', d))
    out = []
    for tok in re.findall(r'[MCLZ]|-?\d+(?:\.\d+)?', d):
        out.append(tok)
    # 짝수 번째 숫자 = x, 홀수 번째 = y 로 보고 y 에 DY 를 더한다
    res, i = [], 0
    for tok in out:
        if tok in 'MCLZ':
            res.append(tok)
        else:
            v = float(tok)
            if i % 2 == 1:
                v += DY
            res.append(('%g' % v))
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
        if cmd == 'M' or cmd == 'L':
            cur = (float(toks[i]), float(toks[i + 1]))
            pts.append(cur)
            i += 2
        elif cmd == 'C':
            p1 = (float(toks[i]), float(toks[i + 1]))
            p2 = (float(toks[i + 2]), float(toks[i + 3]))
            p3 = (float(toks[i + 4]), float(toks[i + 5]))
            for k in range(1, 61):
                u = k / 60
                a = (1 - u) ** 3
                b = 3 * (1 - u) ** 2 * u
                c = 3 * (1 - u) * u * u
                e = u ** 3
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


def render(size, rounded, inset=0.0):
    """inset: 도형을 가운데로 줄이는 비율 (maskable 안전 영역)"""
    S = 4
    big = size * S
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=round(big * 14 / 64), fill=BG)
    else:
        d.rectangle([0, 0, big, big], fill=BG)
    art = Image.new('RGBA', (512 * S, 512 * S), (0, 0, 0, 0))
    a = ImageDraw.Draw(art)
    a.polygon(sample(shift_d(LEAF_D), S), fill=LEAF)
    polyline(a, VEIN_D, VEIN_W, VEIN, S)
    a.polygon(sample(shift_d(HEART_D), S), fill=HEART)
    polyline(a, PULSE_PTS, PULSE_W, PULSE, S)
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
        f'<rect width="512" height="512" rx="112" fill="{BG}"/>'
        f'<g transform="translate(256 256) scale({ART}) translate(-256 -256)">'
        f'<path d="{shift_d(LEAF_D)}" fill="{LEAF}"/>'
        f'<polyline points="{vein}" fill="none" stroke="{VEIN}" stroke-width="{VEIN_W}" stroke-linecap="round"/>'
        f'<path d="{shift_d(HEART_D)}" fill="{HEART}"/>'
        f'<polyline points="{pts}" fill="none" stroke="{PULSE}" stroke-width="{PULSE_W}" stroke-linecap="round" stroke-linejoin="round"/></g>'
        '</svg>\n'
    )


os.makedirs(OUT, exist_ok=True)
render(192, True).save(os.path.join(OUT, 'icon-192.png'), optimize=True)
render(512, True).save(os.path.join(OUT, 'icon-512.png'), optimize=True)
render(512, False, inset=0.14).save(os.path.join(OUT, 'icon-maskable-512.png'), optimize=True)
render(180, False, inset=0.06).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'), optimize=True)
open(os.path.join(OUT, 'icon.svg'), 'w', encoding='utf-8', newline='\n').write(svg())
print('ok')
