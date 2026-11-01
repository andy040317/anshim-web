"""
5단계(웹 연결): 구간 위험도를 웹 프로토타입이 읽을 수 있는 작은 파일들로 나누기 (데이터 담당용)

왜 필요한가
  대구_구간위험도.gpkg 는 70MB 라서 브라우저가 한 번에 못 읽음.
  대구를 약 1km 칸(타일)으로 나눠 칸마다 작은 JSON 파일로 저장하면,
  웹은 경로가 지나는 칸 몇 개만 불러와서 바로 계산할 수 있음.
  (실제 서비스에서는 이 역할을 FastAPI + PostgreSQL 이 맡음)

입력  data/대구_구간위험도.gpkg  (4단계 결과)
출력  public/data/risk/meta.json          칸 크기·기준점·시간대 정보·설정 요약
      public/data/risk/t_{x}_{y}.json     칸 하나의 구간들

칸 파일 형식 (구간 N개를 열 단위로 저장해서 용량을 줄임)
  lat, lng  구간 가운데 점 좌표 × 100000 (정수)
  len       구간 길이(m)
  lamp      보안등 설치 구간이면 1
  alley     골목 점수 × 10 (0 = 큰길, 5 = 중간 길, 10 = 골목)
  crime     범죄주의 최고 등급 (0~9)
  bar       100m 안 유흥주점 수 (최대 9) — 지도에는 안 보이고, 심야 경로 카드 근거로만 사용
  risk      24시간 위험도를 한 글자열로: 구간마다 2글자(16진수) × 24시간

실행 (프로젝트 최상위 폴더에서)
  py scripts/step5_export_web.py     → 1~2분
"""
import json
import os
import shutil
import time

import geopandas as gpd
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
IN = os.path.join(ROOT, "data", "대구_구간위험도.gpkg")
OUT_DIR = os.path.join(ROOT, "public", "data", "risk")

LAT0, LNG0 = 35.55, 128.30       # 칸 번호의 기준점 (대구 남서쪽 바깥)
TILE_LAT, TILE_LNG = 0.01, 0.0125  # 칸 크기 (약 1.1km × 1.1km)


def main():
    t0 = time.time()
    seg = gpd.read_file(IN)
    cfg = json.load(open(os.path.join(HERE, "config_risk.json"), encoding="utf-8"))
    # 구간 가운데 점 (위도·경도)
    mid = seg.geometry.to_crs(5179).interpolate(0.5, normalized=True).to_crs(4326)
    lat, lng = mid.y.to_numpy(), mid.x.to_numpy()
    tx = np.floor((lng - LNG0) / TILE_LNG).astype(int)
    ty = np.floor((lat - LAT0) / TILE_LAT).astype(int)

    risk = seg[[f"r{h:02d}" for h in range(24)]].to_numpy(dtype=np.uint8)
    cols = {
        "lat": np.round(lat * 1e5).astype(int),
        "lng": np.round(lng * 1e5).astype(int),
        "len": np.round(seg["length_m"]).astype(int).to_numpy(),
        "lamp": (seg["lamp_cnt"] > 0).astype(int).to_numpy(),
        "alley": np.round(seg["alley"] * 10).astype(int).to_numpy(),
        "crime": seg["crime_max"].astype(int).to_numpy(),
        "bar": np.clip(seg["bar_cnt"], 0, 9).astype(int).to_numpy(),
    }

    if os.path.exists(OUT_DIR):
        shutil.rmtree(OUT_DIR)  # 예전 칸 파일 지우고 새로 만듦
    os.makedirs(OUT_DIR)

    order = np.lexsort((ty, tx))
    keys = np.stack([tx[order], ty[order]], axis=1)
    cut = np.flatnonzero(np.any(np.diff(keys, axis=0) != 0, axis=1)) + 1
    tiles, total_bytes = [], 0
    for idx in np.split(order, cut):
        x, y = int(tx[idx[0]]), int(ty[idx[0]])
        data = {k: v[idx].tolist() for k, v in cols.items()}
        data["risk"] = risk[idx].tobytes().hex()  # 구간마다 48글자
        name = f"t_{x}_{y}.json"
        with open(os.path.join(OUT_DIR, name), "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
        total_bytes += os.path.getsize(os.path.join(OUT_DIR, name))
        tiles.append(f"{x}_{y}")

    # 시간대별 대구 평균 (경로 근처에 구간이 없을 때 대신 쓰는 값)
    L = seg["length_m"].to_numpy()
    hour_mean = [round(float((risk[:, h] * L).sum() / L.sum()), 1) for h in range(24)]
    meta = {
        "version": time.strftime("%Y-%m-%d %H:%M"),
        "lat0": LAT0, "lng0": LNG0, "tileLat": TILE_LAT, "tileLng": TILE_LNG,
        "tiles": tiles,
        "hourMean": hour_mean,
        "nightHours": cfg["night_hours"], "darkHours": cfg["dark_hours"],
        "weights": {k: v for k, v in cfg["weights"].items() if not k.startswith("_")},
        "segments": int(len(seg)),
    }
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))

    sizes = [os.path.getsize(os.path.join(OUT_DIR, f"t_{t}.json")) for t in tiles]
    print(f"저장 완료: {OUT_DIR}")
    print(f"칸 {len(tiles)}개 · 구간 {len(seg):,}개 · 전체 {total_bytes / 1e6:.1f}MB · 칸 평균 {np.mean(sizes) / 1e3:.0f}KB · 가장 큰 칸 {max(sizes) / 1e3:.0f}KB")
    print(f"({time.time() - t0:.0f}초)")


if __name__ == "__main__":
    main()
