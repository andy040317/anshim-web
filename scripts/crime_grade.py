"""
생활안전지도 '범죄주의구간(전체)' WMS 그림 → 대구 범죄주의 등급 격자 데이터 만들기 (데이터 담당용)

왜 필요한가
  범죄주의구간 API는 숫자가 아니라 '지도 그림(PNG)'만 줌.
  그림은 연노랑(1등급) ~ 진빨강(9~10등급) 정해진 색으로만 칠해져 있으므로,
  색을 읽어서 등급 숫자로 바꾸면 경로 위험도 계산에 쓸 수 있음.

하는 일
  1) 대구 전체를 작은 칸(타일)으로 나눠 그림을 차례로 받음 (1초에 1장 정도로 천천히)
     → crime_tiles/ 폴더에 저장. 중간에 끊겨도 다시 실행하면 받은 것은 건너뜀
  2) 각 그림을 약 28m 크기 격자로 나누고, 격자 안의 색을 등급(1~10)으로 바꿈
  3) 등급이 있는 격자만 CSV로 저장: 위도, 경도(격자 중심), 등급

준비
  - 프로젝트 최상위 폴더의 .env 파일에 아래 한 줄 추가 (VITE_ 를 붙이지 않아야 웹페이지에 노출되지 않음)
      SAFEMAP_KEY=생활안전지도_인증키
  - 새 라이브러리 설치는 필요 없음 (파이썬 기본 기능만 사용)
    단, Pillow가 설치되어 있으면 그림 해석이 훨씬 빨라짐 (선택: pip install pillow)

실행 (프로젝트 최상위 폴더에서)
  python scripts/crime_grade.py --test   ← 먼저 중앙로역 주변 4장만 받아서 확인 (1분 이내)
  python scripts/crime_grade.py          ← 대구 전체 (약 1,300장, 30분 이상 걸림)

결과
  범죄주의등급_테스트.csv  또는  대구_범죄주의등급_격자.csv
"""
import csv
import os
import struct
import sys
import time
import urllib.parse
import urllib.request
import zlib
from collections import Counter

# ── 설정 ──────────────────────────────────────────────
WMS_URL = "http://safemap.go.kr/openapi2/IF_0087_WMS"
LAYER = "A2SM_CRMNLHSPOT_TOT"          # 범죄주의구간(전체)
STYLE = "A2SM_CrmnlHspot_Tot_Tot"

# 대구 전체(군위군 포함) 범위. CCTV·편의점·보안등 좌표 범위에 여유를 둔 값
LNG_MIN, LNG_MAX = 128.33, 128.89
LAT_MIN, LAT_MAX = 35.60, 36.33
# 테스트용: 중앙로역 주변 (타일 2×2장)
TEST_BOX = (128.585, 35.858, 128.625, 35.890)

TILE_LNG, TILE_LAT = 0.020, 0.016  # 타일 한 장 크기(도). 가로·세로 약 1.8km
TILE_PX = 512                      # 타일 한 장 픽셀 수 (1픽셀 ≈ 3.5m)
CELL_PX = 8                        # 격자 한 칸 = 8픽셀 ≈ 28m
STEP_PX = 2                        # 격자 안에서 2픽셀 간격으로 색 확인 (속도)
DELAY_SEC = 1.0                    # 요청 간격 (서버 부담 줄이기)
TILE_DIR = "crime_tiles"

# 등급별 색 (보내준 그림에서 확인한 9단계 + 10단계는 추정값)
GRADE_COLORS = [
    (1, (255, 255, 178)),
    (2, (253, 232, 138)),
    (3, (253, 208, 102)),
    (4, (253, 183, 82)),
    (5, (253, 155, 67)),
    (6, (250, 122, 53)),
    (7, (243, 87, 42)),
    (8, (233, 52, 32)),
    (9, (212, 27, 35)),
    (10, (189, 0, 38)),   # 추정. 실제 색이 다르면 실행 결과의 '모르는 색' 목록을 보고 고치기
]
MIN_ALPHA = 100        # 이보다 투명한 픽셀은 선 가장자리 번짐이라 무시
MAX_COLOR_DIST = 35    # 등급 색과 이 거리 안이면 같은 색으로 봄


# ── .env 에서 인증키 읽기 ──────────────────────────────
def read_key():
    if os.environ.get("SAFEMAP_KEY"):
        return os.environ["SAFEMAP_KEY"].strip()
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    for name in (os.path.join(root, ".env"), ".env"):
        if os.path.exists(name):
            with open(name, encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("SAFEMAP_KEY="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
    print("인증키가 없어요. 프로젝트 최상위 폴더의 .env 파일에 SAFEMAP_KEY=인증키 를 추가해 주세요.")
    sys.exit(1)


# ── 그림(PNG) 해석: Pillow가 있으면 사용, 없으면 직접 해석 ──────
def png_to_rgba(data):
    """PNG 바이트 → (가로, 세로, RGBA 바이트)"""
    try:
        from io import BytesIO
        from PIL import Image
        im = Image.open(BytesIO(data)).convert("RGBA")
        return im.width, im.height, im.tobytes()
    except ImportError:
        return _png_to_rgba_plain(data)


def _png_to_rgba_plain(data):
    """라이브러리 없이 PNG 해석 (8비트, 비인터레이스 PNG만 지원). Pillow보다 느림"""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("PNG 그림이 아니에요")
    pos, idat, palette, trns = 8, b"", None, None
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind, chunk = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
        elif kind == b"PLTE":
            palette = [tuple(chunk[i:i + 3]) for i in range(0, len(chunk), 3)]
        elif kind == b"tRNS":
            trns = chunk
        elif kind == b"IDAT":
            idat += chunk
        elif kind == b"IEND":
            break
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    if interlace or (depth != 8 and ctype != 3) or depth > 8:
        raise ValueError("이 형식의 PNG는 지원하지 않아요. pip install pillow 후 다시 실행해 주세요.")
    stride = (w * channels * depth + 7) // 8
    bpp = max(1, channels * depth // 8)
    raw = zlib.decompress(idat)
    rows, prev, p = [], bytearray(stride), 0
    for _ in range(h):
        ft, line = raw[p], bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        for i in range(stride):  # PNG 필터 되돌리기 (0:없음 1:왼쪽 2:위 3:평균 4:Paeth)
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ft == 1:
                line[i] = (line[i] + a) & 255
            elif ft == 2:
                line[i] = (line[i] + b) & 255
            elif ft == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 255
            elif ft == 4:
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    out = bytearray(w * h * 4)
    for y, line in enumerate(rows):
        for x in range(w):
            o = (y * w + x) * 4
            if ctype == 6:
                out[o:o + 4] = line[x * 4:x * 4 + 4]
            elif ctype == 2:
                out[o:o + 4] = bytes(line[x * 3:x * 3 + 3]) + b"\xff"
            elif ctype == 3:
                if depth == 8:
                    idx = line[x]
                else:
                    per = 8 // depth
                    idx = (line[x // per] >> (8 - depth * (x % per + 1))) & ((1 << depth) - 1)
                r, g, b = palette[idx]
                a = trns[idx] if trns and idx < len(trns) else 255
                out[o:o + 4] = bytes((r, g, b, a))
            elif ctype == 0:
                out[o:o + 4] = bytes((line[x],) * 3) + b"\xff"
            else:  # ctype 4: 흑백 + 투명도
                out[o:o + 4] = bytes((line[x * 2],) * 3 + (line[x * 2 + 1],))
    return w, h, bytes(out)


# ── 색 → 등급 ──────────────────────────────────────────
_cache = {}
unknown_colors = Counter()  # 등급 표에 없는 색 (10등급 확인용)


def grade_of(r, g, b):
    key = (r, g, b)
    if key not in _cache:
        best, best_d = 0, MAX_COLOR_DIST ** 2 + 1
        for grade, (gr, gg, gb) in GRADE_COLORS:
            d = (r - gr) ** 2 + (g - gg) ** 2 + (b - gb) ** 2
            if d < best_d:
                best, best_d = grade, d
        _cache[key] = best
    return _cache[key]


def analyze_tile(data, lng0, lat0, lng1, lat1):
    """타일 그림 한 장 → [(위도, 경도, 등급), ...] (등급 있는 격자만)"""
    w, h, buf = png_to_rgba(data)
    out = []
    for cy in range(h // CELL_PX):
        for cx in range(w // CELL_PX):
            top = 0
            for py in range(cy * CELL_PX, (cy + 1) * CELL_PX, STEP_PX):
                for px in range(cx * CELL_PX, (cx + 1) * CELL_PX, STEP_PX):
                    i = (py * w + px) * 4
                    if buf[i + 3] < MIN_ALPHA:
                        continue
                    gr = grade_of(buf[i], buf[i + 1], buf[i + 2])
                    if gr == 0:
                        unknown_colors[(buf[i], buf[i + 1], buf[i + 2])] += 1
                    elif gr > top:
                        top = gr  # 격자 안에서 가장 높은 등급 (안전 서비스라 보수적으로)
            if top:
                lng = lng0 + (cx + 0.5) * CELL_PX * (lng1 - lng0) / w
                lat = lat1 - (cy + 0.5) * CELL_PX * (lat1 - lat0) / h  # 그림 위쪽 = 북쪽
                out.append((round(lat, 6), round(lng, 6), top))
    return out


# ── 그림 받기 ──────────────────────────────────────────
def fetch_tile(key, lng0, lat0, lng1, lat1):
    params = {
        "serviceKey": key, "srs": "EPSG:4326",
        "bbox": f"{lng0:.6f},{lat0:.6f},{lng1:.6f},{lat1:.6f}",  # 경도,위도 순서
        "format": "image/png", "width": TILE_PX, "height": TILE_PX, "transparent": "TRUE",
        "layers": LAYER, "styles": STYLE,
    }
    url = WMS_URL + "?" + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=30) as res:
                data = res.read()
            if data[:8] == b"\x89PNG\r\n\x1a\n":
                return data
            # 그림이 아니면 보통 인증키·승인 문제 → 내용을 보여주고 중단
            print("\n그림 대신 다른 응답이 왔어요 (인증키나 사용 승인을 확인해 주세요):")
            print(data[:400].decode("utf-8", "replace"))
            sys.exit(1)
        except OSError as e:
            wait = 5 * (attempt + 1)
            print(f"  연결 오류({e}). {wait}초 뒤 다시 시도")
            time.sleep(wait)
    raise RuntimeError("3번 시도했지만 그림을 받지 못했어요. 잠시 뒤 다시 실행하면 이어서 받아요.")


def tiles_in(box):
    lng_min, lat_min, lng_max, lat_max = box
    tiles, row = [], 0
    lat = lat_max
    while lat > lat_min + 1e-9:
        col, lng = 0, lng_min
        while lng < lng_max - 1e-9:
            tiles.append((row, col, lng, lat - TILE_LAT, lng + TILE_LNG, lat))
            col, lng = col + 1, lng + TILE_LNG
        row, lat = row + 1, lat - TILE_LAT
    return tiles


def main():
    test = "--test" in sys.argv
    box = TEST_BOX if test else (LNG_MIN, LAT_MIN, LNG_MAX, LAT_MAX)
    out_name = "범죄주의등급_테스트.csv" if test else "대구_범죄주의등급_격자.csv"
    key = read_key()
    tiles = tiles_in(box)
    folder = os.path.join(TILE_DIR, "test" if test else "daegu")
    os.makedirs(folder, exist_ok=True)
    print(f"타일 {len(tiles)}장 처리 시작 (저장 폴더: {folder})")

    cells, started = {}, time.time()
    for n, (row, col, lng0, lat0, lng1, lat1) in enumerate(tiles, 1):
        path = os.path.join(folder, f"{row:03d}_{col:03d}.png")
        if os.path.exists(path):
            with open(path, "rb") as f:
                data = f.read()
        else:
            data = fetch_tile(key, lng0, lat0, lng1, lat1)
            with open(path, "wb") as f:
                f.write(data)
            time.sleep(DELAY_SEC)
        for lat, lng, g in analyze_tile(data, lng0, lat0, lng1, lat1):
            cells[(lat, lng)] = max(g, cells.get((lat, lng), 0))
        if n % 20 == 0 or n == len(tiles):
            mins = (time.time() - started) / n * (len(tiles) - n) / 60
            print(f"  {n}/{len(tiles)}장 완료 · 남은 시간 약 {mins:.0f}분")

    with open(out_name, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["위도", "경도", "등급"])
        for (lat, lng), g in sorted(cells.items()):
            w.writerow([lat, lng, g])

    dist = Counter(cells.values())
    print(f"\n저장 완료: {out_name} (등급 있는 격자 {len(cells)}개, 격자 1칸 약 28m)")
    print("등급별 격자 수:", ", ".join(f"{g}등급 {dist[g]}" for g in sorted(dist)))
    if unknown_colors:
        print("등급 표에 없는 색 상위 5개 (10등급 색 확인용):", unknown_colors.most_common(5))


if __name__ == "__main__":
    main()
