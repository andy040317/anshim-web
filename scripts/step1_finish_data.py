"""
1단계: 데이터 마무리 스크립트 (데이터 담당용)

하는 일 (세 부분, 따로 실행 가능)
  --lamps       보안등 '좌표없음_변환실패' 1,240건 재시도
                "범어동 479-40" → "범어동 479" 처럼 본번으로 다시 찾기 (근사 좌표로 표시)
                → data/대구광역시_보안등_최종.csv          ※ 카카오 REST 키 필요
  --nightlife   상가정보에서 심야 유흥업소(일반 유흥 주점 + 무도 유흥 주점) 추출
                → data/대구_유흥주점.csv
  --population  서비스인구(행정동 이름) + 행정동 경계 지도 → 시간대별 인구 밀도 지도
                → data/대구_행정동_서비스인구.geojson

  옵션 없이 실행하면 세 가지 모두 실행

필요한 파일 (data 폴더)
  대구광역시_보안등_통합_좌표보완.csv      (geocode.py 결과)
  소상공인시장진흥공단_상가_상권_정보_대구_202609.csv
  서비스인구 통계_202512.xlsx
  대구_행정동_경계_ver20251231.geojson     (함께 전달한 파일)

필요한 라이브러리
  geopandas (설치함), --population 에는 엑셀을 읽는 openpyxl 도 필요
  (py -m pip install openpyxl) — 이미 만들어 둔 결과 파일을 쓰면 실행하지 않아도 됨

실행 (프로젝트 최상위 폴더에서)
  py scripts/step1_finish_data.py --lamps
"""
import csv
import glob
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
sys.path.insert(0, HERE)  # 같은 폴더의 geocode.py 를 불러오기 위해


def find(pattern):
    hits = glob.glob(os.path.join(DATA, pattern))
    if not hits:
        print(f"data 폴더에 '{pattern}' 파일이 없어요.")
        sys.exit(1)
    return hits[0]


def read_csv(path):
    for enc in ("utf-8-sig", "cp949"):
        try:
            with open(path, encoding=enc) as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    raise ValueError(path)


def write_csv(path, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


# ── ① 보안등 재시도 ───────────────────────────────────
def main_lamps():
    from geocode import Geocoder, read_key  # 카카오 주소 검색 (결과 기억 기능 포함)

    path = find("대구광역시_보안등_통합_좌표보완.csv")
    rows = read_csv(path)
    todo = [r for r in rows if r["좌표상태"] == "좌표없음_변환실패"]
    print(f"보안등 재시도 {len(todo)}건")
    geo = Geocoder(read_key())
    try:
        for r in todo:
            jibun = r["소재지지번주소"].strip()
            # 부번 제거: '479-40' → '479', '산23-23' → '산23'
            main_no = re.sub(r"(\d+)-\d+$", r"\1", jibun)
            p = geo.first(main_no) if main_no != jibun else None
            if p:
                r["위도"], r["경도"], r["좌표상태"] = p[0], p[1], "본번으로변환_근사"
            else:
                r["좌표상태"] = "변환불가_제외"
    finally:
        geo.save()
    out = os.path.join(DATA, "대구광역시_보안등_최종.csv")
    write_csv(out, rows)
    c = Counter(r["좌표상태"] for r in todo)
    print(f"결과: {dict(c)}")
    print(f"전체 좌표상태: {dict(Counter(r['좌표상태'] for r in rows))}")
    print(f"저장: {out}")


# ── ② 심야 유흥업소 ───────────────────────────────────
NIGHT_CODES = {"I21101": "일반 유흥 주점", "I21102": "무도 유흥 주점"}  # 단란주점은 '일반 유흥 주점'에 포함됨


def main_nightlife():
    rows = read_csv(find("*상가*상권*.csv"))
    seen, out = set(), []
    for r in rows:
        if r["상권업종소분류코드"] not in NIGHT_CODES or "유흥 주점" not in r["표준산업분류명"]:
            continue  # 업종 코드와 표준산업분류가 모두 유흥주점인 것만
        key = (r["상호명"].strip(), (r["도로명주소"] or r["지번주소"]).strip())
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "상가업소번호": r["상가업소번호"], "상호명": r["상호명"], "업종": NIGHT_CODES[r["상권업종소분류코드"]],
            "시군구명": r["시군구명"], "행정동명": r["행정동명"], "도로명주소": r["도로명주소"],
            "위도": r["위도"], "경도": r["경도"], "데이터기준": "2026-09",
        })
    path = os.path.join(DATA, "대구_유흥주점.csv")
    write_csv(path, out)
    print(f"유흥주점 {len(out)}곳 → {path}")
    print("업종:", dict(Counter(o["업종"] for o in out)))
    print("구군:", dict(Counter(o["시군구명"] for o in out).most_common()))


# ── ③ 서비스인구 + 행정동 경계 ─────────────────────────
def norm(name):
    """동 이름 비교용: '두류1.2동', '두류1,2동', '두류1·2동' → '두류12동'"""
    return re.sub(r"[·.,\s]", "", str(name))


def main_population():
    import geopandas as gpd
    import pandas as pd

    gdf = gpd.read_file(find("대구_행정동_경계*.geojson"))
    gdf = gdf[gdf["sidonm"] == "대구광역시"].copy()
    gdf["구군"] = gdf["sggnm"]
    gdf["동"] = gdf["adm_nm"].str.split().str[-1]
    gdf["key"] = gdf["동"].map(norm)
    # 면적(km²): 미터 단위 좌표계(EPSG:5179, 한국 표준)로 바꿔서 계산
    gdf["면적_km2"] = gdf.to_crs(5179).area / 1e6

    pop = pd.read_excel(find("*서비스인구*.xlsx"), sheet_name="시간대별")
    hours = [f"{h:02d}시" for h in range(24)]
    pop["key"] = pop["분석영역"].map(norm)
    pop = pop.set_index("key")

    dens = {}    # key → [시간대별 인구 밀도 24개]
    source = {}  # key → 인구출처
    # (1) 이름이 같은 동: 인구 ÷ 면적
    for _, g in gdf.iterrows():
        if g["key"] in pop.index:
            dens[g["key"]] = [pop.loc[g["key"], h] / g["면적_km2"] for h in hours]
            source[g["key"]] = "원본"
    # (2) 인구 자료는 합쳐져 있고 경계는 나뉜 동 (예: 안심3·4동 → 안심3동 + 안심4동): 합친 면적으로 밀도 계산
    for key, row in pop.iterrows():
        if key in set(gdf["key"]):
            continue
        m = re.match(r"^(.*?)(\d+)(\d)동$", key)  # '안심34동' → '안심', '3', '4'
        if not m:
            print(f"  경계와 맞지 않는 서비스인구 동: {row['분석영역']}")
            continue
        parts = [f"{m.group(1)}{m.group(2)}동", f"{m.group(1)}{m.group(3)}동"]
        members = gdf[gdf["key"].isin(parts)]
        if len(members) == 0:
            print(f"  경계와 맞지 않는 서비스인구 동: {row['분석영역']}")
            continue
        area = members["면적_km2"].sum()
        for k in members["key"]:
            dens[k] = [row[h] / area for h in hours]
            source[k] = f"합쳐진동({row['분석영역']})"
    # (3) 새로 생긴 동 등 자료가 없는 동: 경계를 가장 길게 맞댄 이웃 동의 밀도를 빌려 씀 (군위군은 이웃도 없어 결측)
    proj = gdf.to_crs(5179).set_index("key")
    for k in proj.index:
        if k in dens or proj.loc[k, "구군"] == "군위군":
            continue
        best, best_len = None, 0
        for k2 in proj.index:
            if k2 == k or k2 not in dens or source[k2].startswith("인접"):
                continue
            shared = proj.loc[k, "geometry"].boundary.intersection(proj.loc[k2, "geometry"].boundary).length
            if shared > best_len:
                best, best_len = k2, shared
        if best:
            dens[k] = list(dens[best])
            source[k] = f"인접동추정({proj.loc[best, '동']})"

    for i, h in enumerate(hours):
        gdf[f"d{h[:2]}"] = gdf["key"].map(lambda k: round(dens[k][i], 1) if k in dens else None)
    gdf["인구출처"] = gdf["key"].map(lambda k: source.get(k, "자료없음"))
    out = gdf[["adm_cd", "구군", "동", "면적_km2", "인구출처"] + [f"d{h:02d}" for h in range(24)] + ["geometry"]]
    out["면적_km2"] = out["면적_km2"].round(3)
    path = os.path.join(DATA, "대구_행정동_서비스인구.geojson")
    out.to_file(path, driver="GeoJSON")
    print(f"행정동 {len(out)}곳 → {path}  (d00~d23 = 시간대별 1km²당 인구)")
    print("인구출처:", dict(Counter(out["인구출처"].map(lambda s: s.split("(")[0]))))
    print("  추정·결측 동:", [(r["동"], r["인구출처"]) for _, r in out.iterrows() if r["인구출처"] != "원본"])


if __name__ == "__main__":
    args = set(sys.argv[1:]) or {"--lamps", "--nightlife", "--population"}
    if "--nightlife" in args:
        main_nightlife()
    if "--population" in args:
        main_population()
    if "--lamps" in args:
        main_lamps()
