# 產生 App 圖示（PIL）：綠色漸層底 + 白色啞鈴 + 「帳」字
from PIL import Image, ImageDraw, ImageFont
import os
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
out = os.path.join(os.path.dirname(__file__), '..', 'icons')

def make(size, pad=0.0):
    S = 1024
    img = Image.new('RGB', (S, S))
    top, bot = (46, 170, 110), (18, 110, 72)
    d = ImageDraw.Draw(img)
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=tuple(int(top[i] * (1 - t) + bot[i] * t) for i in range(3)))
    k = 1 - pad * 2
    cx, cy = S / 2, S / 2
    def R(x0, y0, x1, y1, r):
        d.rounded_rectangle([cx + (x0 - 512) * k, cy + (y0 - 512) * k, cx + (x1 - 512) * k, cy + (y1 - 512) * k], radius=r * k, fill='white')
    # 啞鈴（上方）
    R(250, 300, 300, 470, 18); R(310, 260, 380, 510, 22); R(380, 360, 644, 410, 12); R(644, 260, 714, 510, 22); R(724, 300, 774, 470, 18)
    f = ImageFont.truetype(FONT, int(330 * k), index=3)
    d.text((cx, cy + 205 * k), '帳本', font=f, fill='white', anchor='mm')
    return img.resize((size, size), Image.LANCZOS)

make(180).save(os.path.join(out, 'apple-touch-icon.png'))
make(192).save(os.path.join(out, 'icon-192.png'))
make(512).save(os.path.join(out, 'icon-512.png'))
make(512, pad=0.1).save(os.path.join(out, 'icon-maskable-512.png'))
make(32).save(os.path.join(out, 'favicon-32.png'))
print('ok')
