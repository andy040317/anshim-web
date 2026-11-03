"""
6단계(웹 연결): 위험도 반영 길 찾기용 '도로망 + 위험도' 파일 만들기 (데이터 담당용)

왜 필요한가
  공개 OSRM 서버는 거리만 보고 길을 만들어서, 후보 중에 안전한 길이 없으면 고를 수가 없음.
  도로망(교차점·길)과 길마다의 시간대별 위험도를 칸 파일로 내보내면,
  웹(src/lib/safepath.js)이 위험한 길을 피하는 경로를 직접 찾을 수 있음.
  (실제 서비스에서는 이 역할을 FastAPI 백엔드(networkx 또는 pgRouting)가 맡음)

입력  data/대구_구간위험도.gpkg     (4단계 결과: 구간별 u·v·위험도·보안등·CCTV 등)
      data/대구_도보도로망.graphml  (2단계 결과: 교차점 좌표)
출력  public/data/graph/meta.json       칸 크기·기준점·시간대 평균 위험도
      public/data/graph/g_{x}_{y}.json  칸 하나의 길들 (길 가운데 점이 그 칸에 있는 길)

칸 파일 형식
  nodes  { "교차점 id": [위도×100000, 경도×100000] }  (이 칸의 길 양 끝 교차점)
  edges  [[u, v, 길이m, 위험도24시간, 어두운길이m, 자동차전용]]
         위험도24시간: 시간마다 2글자(16진수) × 24 → 48글자 (구간 길이로 가중 평균)
         어두운길이m: 보안등·CCTV·비상벨이 없는 골목급(골목 점수 0.8 이상) 구간 길이의 합

추가 설치 없이 Python 기본 기능만 사용 (gpkg 는 SQLite 파일이라 sqlite3 로 읽음)

실행 (프로젝트 최상위 폴더에서)
  py scripts/step6_export_graph.py           → 1~2분
  py scripts/step6_export_graph.py 폴더경로   → data 폴더가 다른 곳에 있을 때
※ 4단계(위험도)를 다시 만들면 이 단계도 다시 실행해야 웹에 반영됨
"""
import json
import math
import os
import shutil
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "data")
SEG_FILE = os.path.join(DATA, "대구_구간위험도.gpkg")
GRAPH_FILE = os.path.join(DATA, "대구_도보도로망.graphml")
OUT_DIR = os.path.join(HERE, "..", "public", "data", "graph")

# 칸 크기: 위험도 칸(1km)의 2배 → 파일 수를 줄여서 먼 거리 경로도 빨리 불러오게
LAT0, LNG0 = 35.55, 128.3
TILE_LAT, TILE_LNG = 0.02, 0.025
DARK_ALLEY = 0.8  # 골목 점수가 이 값 이상이면 '골목급 길' (큰길·중간 길은 가로등이 있다고 봄)


def read_nodes():
    """graphml 에서 교차점 좌표만 읽기 {id: (위도, 경도)}"""
    keys, nodes = {}, {}
    ns = "{http://graphml.graphdrawing.org/xmlns}"
    for ev, el in ET.iterparse(GRAPH_FILE, events=("end",)):
        if el.tag == ns + "key" and el.get("for") == "node":
            keys[el.get("id")] = el.get("attr.name")
        elif el.tag == ns + "node":
            vals = {keys.get(d.get("key")): d.text for d in el.findall(ns + "data")}
            if vals.get("x") and vals.get("y"):
                nodes[el.get("id")] = (float(vals["y"]), float(vals["x"]))
            el.clear()
        elif el.tag == ns + "edge":
            el.clear()  # 길 정보는 gpkg 에서 읽으므로 메모리만 비움
    return nodes


def read_edges():
    """gpkg 구간들을 길(u, v, key) 단위로 합치기"""
    con = sqlite3.connect(SEG_FILE)
    hours = ",".join(f"r{h:02d}" for h in range(24))
    rows = con.execute(
        f"select u, v, key, length_m, lamp_cnt, cctv_cam, bell_cnt, alley, motorroad, {hours} from segments"
    )
    acc = defaultdict(lambda: {"len": 0.0, "risk": [0.0] * 24, "dark": 0.0, "motor": False})
    for r in rows:
        u, v, key, L, lamp, cctv, bell, alley, motor = r[:9]
        e = acc[(str(u), str(v), key)]
        L = L or 0.0
        e["len"] += L
        for h in range(24):
            e["risk"][h] += r[9 + h] * L  # 길이 가중 합 (나중에 길이로 나눔)
        if not lamp and not cctv and not bell and (alley or 0) >= DARK_ALLEY:
            e["dark"] += L
        if motor and "yes" in str(motor):
            e["motor"] = True
    con.close()
    return acc


def main():
    t0 = time.time()
    print("교차점 읽는 중…")
    nodes = read_nodes()
    print(f"  교차점 {len(nodes):,}개")
    print("길 합치는 중…")
    edges = read_edges()
    print(f"  길 {len(edges):,}개")

    tiles = defaultdict(lambda: {"nodes": {}, "edges": []})
    hour_sum, total_len = [0.0] * 24, 0.0
    skipped = 0
    for (u, v, _), e in edges.items():
        if u not in nodes or v not in nodes or e["len"] <= 0:
            skipped += 1
            continue
        L = e["len"]
        risk = [min(255, round(s / L)) for s in e["risk"]]
        for h in range(24):
            hour_sum[h] += risk[h] * L
        total_len += L
        (la1, ln1), (la2, ln2) = nodes[u], nodes[v]
        key = f"{math.floor(((ln1 + ln2) / 2 - LNG0) / TILE_LNG)}_{math.floor(((la1 + la2) / 2 - LAT0) / TILE_LAT)}"
        t = tiles[key]
        for n in (u, v):
            la, ln = nodes[n]
            t["nodes"][n] = [round(la * 1e5), round(ln * 1e5)]
        t["edges"].append([int(u), int(v), round(L), "".join(f"{x:02x}" for x in risk), round(e["dark"]), 1 if e["motor"] else 0])

    if os.path.exists(OUT_DIR):
        shutil.rmtree(OUT_DIR)  # 예전 칸 파일이 남지 않게
    os.makedirs(OUT_DIR)
    size = 0
    for key, t in tiles.items():
        p = os.path.join(OUT_DIR, f"g_{key}.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(t, f, separators=(",", ":"))
        size += os.path.getsize(p)
    meta = {
        "version": time.strftime("%Y-%m-%d %H:%M"),
        "lat0": LAT0, "lng0": LNG0, "tileLat": TILE_LAT, "tileLng": TILE_LNG,
        "tiles": sorted(tiles.keys()),
        "hourMean": [round(s / total_len, 1) for s in hour_sum],  # 시간대별 대구 평균 위험도 (길이 가중)
    }
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    print(f"저장 완료: {OUT_DIR}  칸 {len(tiles):,}개 · {size / 1e6:.1f}MB · 건너뛴 길 {skipped}개 ({time.time() - t0:.0f}초)")


if __name__ == "__main__":
    main()
