"""
주소 → 좌표 변환 스크립트 (카카오 로컬 API 사용, 데이터 담당용)

대상
  1) 119안전센터 (소방청 파일, 대구만)        → 대구_119안전센터_좌표.csv
  2) 지구대·파출소 (경찰청 파일, 대구청만)    → 대구_지구대파출소_좌표.csv
  3) 보안등 통합본 중 '좌표없음' 4,535건      → 대구광역시_보안등_통합_좌표보완.csv
     (수성구 일부, 군위군 전체)

준비
  1) .env 에 KAKAO_REST_KEY=카카오_REST_API_키  (이미 넣었다면 그대로)
  2) 프로젝트 최상위 폴더에 data 폴더를 만들고 아래 3개 파일을 넣기
       소방청 119안전센터 주소 및 전화번호20260701.csv
       경찰청_전국 지구대 파출소 주소 현황_20251231.csv
       대구광역시_보안등_통합.csv
     (파일 이름이 조금 달라도 '119', '파출소', '보안등' 이 들어 있으면 찾아냄)
  3) 새 라이브러리 설치 필요 없음

실행 (프로젝트 최상위 폴더에서)
  py scripts/geocode.py

결과는 data 폴더에 저장. 변환 결과는 data/geocode_cache.json 에 기억해 두므로
중간에 끊겨도 다시 실행하면 이미 바꾼 주소는 건너뜀 (카카오 사용량 절약)
"""
import csv
import glob
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")
CACHE_FILE = os.path.join(DATA, "geocode_cache.json")
API = "https://dapi.kakao.com/v2/local/search/address.json"
DELAY_SEC = 0.05  # 요청 간격 (하루 무료 10만 건이라 넉넉함)

# 대구 범위: 변환 결과가 이 밖이면 잘못 찾은 것으로 보고 버림
LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX = 35.55, 36.35, 128.30, 129.00


# ── 준비 ──────────────────────────────────────────────
def read_key():
    if os.environ.get("KAKAO_REST_KEY"):
        return os.environ["KAKAO_REST_KEY"].strip()
    env = os.path.join(ROOT, ".env")
    if os.path.exists(env):
        with open(env, encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("KAKAO_REST_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    print(".env 에 KAKAO_REST_KEY=카카오_REST_API_키 를 추가해 주세요.")
    sys.exit(1)


def find_file(word):
    """data 폴더에서 이름에 word가 들어간 csv 찾기"""
    hits = [p for p in glob.glob(os.path.join(DATA, "*.csv")) if word in os.path.basename(p) and "좌표" not in os.path.basename(p)]
    if not hits:
        print(f"data 폴더에 '{word}'가 이름에 들어간 csv 파일이 없어요. 파일을 넣고 다시 실행해 주세요.")
        sys.exit(1)
    return hits[0]


def read_csv(path):
    """공공데이터는 cp949(EUC-KR)인 경우가 많아서 두 가지 모두 시도"""
    for enc in ("utf-8-sig", "cp949"):
        try:
            with open(path, encoding=enc) as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    raise ValueError(f"인코딩을 알 수 없어요: {path}")


def write_csv(path, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def clean(addr):
    """'(송정동)' 같은 괄호 부분과 겹친 띄어쓰기 정리"""
    addr = re.sub(r"\(.*?\)", " ", addr or "")
    return re.sub(r"\s+", " ", addr).strip()


# ── 카카오 주소 검색 ──────────────────────────────────
class Geocoder:
    def __init__(self, key):
        self.key = key
        self.cache = {}
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, encoding="utf-8") as f:
                self.cache = json.load(f)
        self.calls = 0

    def save(self):
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(self.cache, f, ensure_ascii=False)

    def lookup(self, addr):
        """주소 → (위도, 경도) 또는 None"""
        addr = clean(addr)
        if not addr:
            return None
        if addr in self.cache:
            return tuple(self.cache[addr]) if self.cache[addr] else None
        req = urllib.request.Request(API + "?" + urllib.parse.urlencode({"query": addr}),
                                     headers={"Authorization": "KakaoAK " + self.key})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=15) as res:
                    docs = json.load(res).get("documents", [])
                break
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", "replace")[:300]
                if e.code in (401, 403):
                    print(f"\n카카오가 요청을 거절했어요 ({e.code}). REST API 키와 '카카오맵 사용 설정 ON'을 확인해 주세요.\n{body}")
                    self.save()
                    sys.exit(1)
                if e.code == 429:
                    print("\n오늘 사용량을 다 썼어요. 내일 다시 실행하면 이어서 해요.")
                    self.save()
                    sys.exit(1)
                time.sleep(3 * (attempt + 1))
            except OSError:
                time.sleep(3 * (attempt + 1))
        else:
            print(f"  연결 오류로 건너뜀: {addr}")
            return None  # 캐시에 남기지 않아서 다음 실행 때 다시 시도
        self.calls += 1
        time.sleep(DELAY_SEC)
        result = None
        if docs:
            lat, lng = float(docs[0]["y"]), float(docs[0]["x"])  # 카카오는 y=위도, x=경도
            if LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX:
                result = (round(lat, 7), round(lng, 7))
        self.cache[addr] = result
        if self.calls % 200 == 0:
            self.save()
        return result

    def first(self, *addrs):
        """여러 주소 후보 중 처음으로 찾아지는 것 (도로명 → 지번 순서)"""
        for a in addrs:
            r = self.lookup(a)
            if r:
                return r
        return None


# ── 데이터별 처리 ─────────────────────────────────────
def do_fire(geo):
    rows = [r for r in read_csv(find_file("119")) if "대구" in r.get("시도본부", "")]
    out = []
    for r in rows:
        p = geo.first(r["주소"])
        out.append({"이름": r["119안전센터명"].strip(), "소방서": r["소방서명"].strip(), "주소": clean(r["주소"]),
                    "전화번호": r["전화번호"].strip(), "위도": p[0] if p else "", "경도": p[1] if p else "",
                    "좌표상태": "변환성공" if p else "변환실패"})
    write_csv(os.path.join(DATA, "대구_119안전센터_좌표.csv"), out)
    return "119안전센터", out


def do_police(geo):
    # '대구'로만 거르면 부산 해운대구가 섞이므로 시도청으로 거름
    rows = [r for r in read_csv(find_file("파출소")) if r.get("시도청", "").strip() == "대구청"]
    out = []
    for r in rows:
        p = geo.first(r["주소"])
        out.append({"이름": r["관서명"].strip() + r["구분"].strip(), "구분": r["구분"].strip(), "경찰서": r["경찰서"].strip(),
                    "주소": clean(r["주소"]), "위도": p[0] if p else "", "경도": p[1] if p else "",
                    "좌표상태": "변환성공" if p else "변환실패"})
    write_csv(os.path.join(DATA, "대구_지구대파출소_좌표.csv"), out)
    return "지구대·파출소", out


def do_lamps(geo):
    rows = read_csv(find_file("보안등"))
    todo = [r for r in rows if r.get("좌표상태") == "좌표없음"]
    print(f"  보안등 좌표 없는 행 {len(todo)}건 변환 중 (몇 분 걸려요)")
    for n, r in enumerate(todo, 1):
        p = geo.first(r["소재지도로명주소"], r["소재지지번주소"])
        if p:
            r["위도"], r["경도"], r["좌표상태"] = p[0], p[1], "주소로변환"
        else:
            r["좌표상태"] = "좌표없음_변환실패"
        if n % 500 == 0:
            print(f"    {n}/{len(todo)}")
    write_csv(os.path.join(DATA, "대구광역시_보안등_통합_좌표보완.csv"), rows)
    return "보안등(좌표없던 행)", todo


def main():
    os.makedirs(DATA, exist_ok=True)
    geo = Geocoder(read_key())
    results = []
    try:
        for job in (do_fire, do_police, do_lamps):
            name, rows = job(geo)
            results.append((name, rows))
            print(f"  {name} 완료")
    finally:
        geo.save()
    print(f"\n카카오 호출 {geo.calls}건 (나머지는 저장해 둔 결과 사용)")
    for name, rows in results:
        c = Counter(r["좌표상태"] for r in rows)
        print(f"{name}: {len(rows)}건 → {dict(c)}")
    print("결과 파일은 data 폴더에 저장했어요.")


if __name__ == "__main__":
    main()
