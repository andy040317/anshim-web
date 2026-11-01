"""
3단계: 도보 구간마다 데이터 붙이기 (데이터 담당용)

입력 (data 폴더)
  대구_도보구간.gpkg                  2단계 결과 (구간 약 21만 개)
  대구_범죄주의등급_격자.csv          범죄주의 등급 (28m 격자)
  CCTV정보_대구광역시.csv             원본 (카메라 대수 포함)
  안전비상벨위치정보_대구광역시.csv   원본
  대구광역시_보안등_최종.csv          1단계 결과 (없으면 _통합_좌표보완.csv 사용)
  대구_지구대파출소_좌표.csv / 대구_119안전센터_좌표.csv / 대구_편의점_정리.csv / 대구_유흥주점.csv
  대구_행정동_서비스인구.geojson      1단계 결과

출력
  data/대구_구간특성.gpkg  (구간 + 아래 열들)

구간마다 붙이는 값 (거리 기준은 아래 설정에서 바꿀 수 있음)
  crime_max, crime_mean   구간 20m 안 범죄주의 격자의 최고·평균 등급 (0 = 범죄주의구간 아님)
  cctv_cam                50m 안 CCTV 카메라 대수
  bell_cnt                50m 안 안전비상벨 수
  lamp_cnt                25m 안 보안등 수  → lamp_cnt ≥ 1 이면 '보안등 설치 구간'
  bar_cnt                 100m 안 유흥주점 수 (심야 가산용)
  dist_police / dist_fire / dist_store   가장 가까운 지구대·파출소 / 119안전센터 / 편의점까지 거리(m, 최대 5000)
  adm_cd, dong            구간 가운데 점이 속한 행정동 (시간대별 인구는 4단계에서 이 코드로 연결)

실행 (프로젝트 최상위 폴더에서)
  py scripts/step3_attach_features.py     → 몇 분 걸림
"""
import glob
import os
import sys
import time

import geopandas as gpd
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(DATA, "대구_구간특성.gpkg")
M = 5179  # 미터 단위 한국 좌표계

# 거리 기준 (m)
R_CRIME, R_CCTV, R_BELL, R_LAMP, R_BAR = 20, 50, 50, 25, 100
MAX_DIST = 5000
# 대구 범위 (CCTV·비상벨 원본에 섞인 잘못된 좌표 제거용)
LAT = (35.55, 36.35)
LNG = (128.30, 129.00)
# 보안등 중 계산에 쓰는 좌표상태 (대표점 좌표 '같은좌표_다른주소'와 변환 실패는 제외)
LAMP_OK = {"정상", "같은좌표_같은주소", "주소로변환", "본번으로변환_근사"}


def path(pattern, required=True):
    hits = sorted(glob.glob(os.path.join(DATA, pattern)))
    if not hits and required:
        print(f"data 폴더에 '{pattern}' 파일이 없어요.")
        sys.exit(1)
    return hits[0] if hits else None


def read_csv(p):
    for enc in ("utf-8-sig", "cp949"):
        try:
            return pd.read_csv(p, encoding=enc, low_memory=False)
        except UnicodeDecodeError:
            continue
    raise ValueError(p)


def points(df, lat="위도", lng="경도"):
    """표(위도·경도 열) → 미터 좌표계 점 지도. 대구 범위 밖·빈 좌표는 버림"""
    df = df.copy()
    df[lat] = pd.to_numeric(df[lat], errors="coerce")
    df[lng] = pd.to_numeric(df[lng], errors="coerce")
    df = df[df[lat].between(*LAT) & df[lng].between(*LNG)]
    return gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df[lng], df[lat]), crs=4326).to_crs(M)


def count_within(seg, pts, radius, weight=None):
    """구간마다 radius(m) 안에 있는 점 수 (weight 열이 있으면 그 값을 더함)"""
    buf = gpd.GeoDataFrame({"seg_id": seg["seg_id"]}, geometry=seg.geometry.buffer(radius), crs=M)
    j = gpd.sjoin(pts[[weight, "geometry"]] if weight else pts[["geometry"]], buf, predicate="within")
    s = j.groupby("seg_id")[weight].sum() if weight else j.groupby("seg_id").size()
    return seg["seg_id"].map(s).fillna(0).astype(int)


def nearest_dist(mid, pts):
    """구간 가운데 점에서 가장 가까운 점까지 거리(m), 최대 MAX_DIST"""
    j = gpd.sjoin_nearest(mid, pts[["geometry"]], max_distance=MAX_DIST, distance_col="d")
    d = j.groupby("seg_id")["d"].min()
    return mid["seg_id"].map(d).fillna(MAX_DIST).round(0).astype(int)


def main():
    t0 = time.time()
    seg = gpd.read_file(path("대구_도보구간.gpkg")).to_crs(M)
    print(f"구간 {len(seg):,}개 불러옴")
    mid = gpd.GeoDataFrame({"seg_id": seg["seg_id"]}, geometry=seg.geometry.interpolate(0.5, normalized=True), crs=M)

    # 1) 범죄주의 등급: 구간 20m 안 격자 중 최고·평균
    crime = points(read_csv(path("대구_범죄주의등급_격자.csv")))
    buf = gpd.GeoDataFrame({"seg_id": seg["seg_id"]}, geometry=seg.geometry.buffer(R_CRIME), crs=M)
    j = gpd.sjoin(crime[["등급", "geometry"]], buf, predicate="within")
    g = j.groupby("seg_id")["등급"]
    seg["crime_max"] = seg["seg_id"].map(g.max()).fillna(0).astype(int)
    seg["crime_mean"] = seg["seg_id"].map(g.mean()).fillna(0).round(2)
    print("  범죄주의 등급 완료")

    # 2) CCTV(카메라 대수 합) · 비상벨
    cctv = points(read_csv(path("CCTV정보_대구광역시.csv")), "WGS84위도", "WGS84경도")
    cctv["카메라대수"] = pd.to_numeric(cctv["카메라대수"], errors="coerce").fillna(1).astype(int)
    cctv = cctv.drop_duplicates(subset=["WGS84위도", "WGS84경도", "관리번호"])
    seg["cctv_cam"] = count_within(seg, cctv, R_CCTV, "카메라대수")
    bell = points(read_csv(path("안전비상벨위치정보_대구광역시.csv")), "WGS84위도", "WGS84경도")
    seg["bell_cnt"] = count_within(seg, bell, R_BELL)
    print("  CCTV·비상벨 완료")

    # 3) 보안등 (최종본이 있으면 최종본, 없으면 좌표보완본)
    lp = path("대구광역시_보안등_최종.csv", required=False) or path("대구광역시_보안등_통합_좌표보완.csv")
    lamps = read_csv(lp)
    lamps = points(lamps[lamps["좌표상태"].isin(LAMP_OK)])
    lamps["설치개수"] = pd.to_numeric(lamps["설치개수"], errors="coerce").fillna(1).astype(int)
    seg["lamp_cnt"] = count_within(seg, lamps, R_LAMP, "설치개수")
    print(f"  보안등 완료 ({os.path.basename(lp)}, {len(lamps):,}행 사용)")

    # 4) 유흥주점 (심야 가산용)
    bars = points(read_csv(path("대구_유흥주점.csv")))
    seg["bar_cnt"] = count_within(seg, bars, R_BAR)

    # 5) 대피·도움 거점까지 거리 (편의점은 대피 우선순위 '높음'만)
    police = points(read_csv(path("대구_지구대파출소_좌표.csv")))
    fire = points(read_csv(path("대구_119안전센터_좌표.csv")))
    stores = read_csv(path("대구_편의점_정리.csv"))
    stores = points(stores[stores["대피우선순위"] == "높음"])
    seg["dist_police"] = nearest_dist(mid, police)
    seg["dist_fire"] = nearest_dist(mid, fire)
    seg["dist_store"] = nearest_dist(mid, stores)
    print("  유흥주점·거점 거리 완료")

    # 6) 행정동 (구간 가운데 점 기준)
    dong = gpd.read_file(path("대구_행정동_서비스인구.geojson")).to_crs(M)[["adm_cd", "동", "geometry"]]
    j = gpd.sjoin(mid, dong, predicate="within").drop_duplicates("seg_id").set_index("seg_id")
    seg["adm_cd"] = seg["seg_id"].map(j["adm_cd"]).fillna("")
    seg["dong"] = seg["seg_id"].map(j["동"]).fillna("")

    seg.to_crs(4326).to_file(OUT, layer="segments", driver="GPKG")
    print(f"\n저장 완료: {OUT} ({(time.time() - t0) / 60:.1f}분)")
    report(seg)


def report(seg):
    n = len(seg)
    pct = lambda s: f"{100 * s.mean():.1f}%"
    print("요약 (구간 기준)")
    print("  범죄주의구간에 걸친 구간:", pct(seg["crime_max"] > 0), "· 7등급 이상:", pct(seg["crime_max"] >= 7))
    print("  CCTV 50m 안:", pct(seg["cctv_cam"] > 0), "· 비상벨 50m 안:", pct(seg["bell_cnt"] > 0))
    print("  보안등 설치 구간(25m 안):", pct(seg["lamp_cnt"] > 0))
    print("  유흥주점 100m 안:", pct(seg["bar_cnt"] > 0))
    print("  편의점까지 중앙값:", int(np.median(seg["dist_store"])), "m · 지구대·파출소:", int(np.median(seg["dist_police"])), "m")
    print("  행정동 매칭 실패(대구 밖 여유 구간):", int((seg["adm_cd"] == "").sum()), "/", n)


if __name__ == "__main__":
    main()
