"""
2단계: 대구 도보 도로망 받기 + 50m 구간으로 나누기 (데이터 담당용)

하는 일
  1) 행정동 경계 지도로 '대구 전체 모양'을 만들고, 그 안의 걸을 수 있는 길을
     OpenStreetMap(OSRM이 쓰는 것과 같은 지도)에서 받음  → data/대구_도보도로망.graphml
     (처음 한 번만 받음. 파일이 있으면 다시 받지 않음)
  2) 길(교차로~교차로)을 최대 50m 구간으로 잘게 나눔
     → data/대구_도보구간.gpkg   (구간 하나 = 위험도를 매기는 단위)

구간마다 저장하는 정보
  seg_id     구간 번호
  u, v, key  원래 길(교차로 u → 교차로 v)의 번호  ※ 나중에 경로와 맞춰볼 때 사용
  part       그 길에서 몇 번째 조각인지
  length_m   구간 길이(m)
  highway    길 종류 (primary=큰길, residential=주택가 길, footway=보행로, ...)
  name       길 이름 (있으면)
  lit        가로등 있음 여부 (OpenStreetMap에 적힌 경우만. 대부분 비어 있음)
  sidewalk   보도 여부 (적힌 경우만)
  motorroad  자동차전용도로 여부 ('yes'면 사람이 걸으면 안 되는 길 → 4단계에서 위험도 최고점)

필요한 라이브러리: osmnx, geopandas (설치함)
필요한 파일: data/대구_행정동_경계_ver20251231.geojson

실행 (프로젝트 최상위 폴더에서, 인터넷 필요)
  py scripts/step2_road_network.py
  → 도로망 받기에 10~30분 걸릴 수 있어요 (OpenStreetMap 서버 상황에 따라 다름)
"""
import glob
import os
import sys
import time

import geopandas as gpd
import osmnx as ox
from shapely.ops import substring

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
GRAPH_FILE = os.path.join(DATA, "대구_도보도로망.graphml")
OUT_FILE = os.path.join(DATA, "대구_도보구간.gpkg")
MAX_SEG_M = 50     # 구간 최대 길이(m)
BUFFER_M = 300     # 대구 경계 밖으로 300m 여유 (경계 근처 길이 끊기지 않게)
METER_CRS = 5179   # 미터 단위 한국 좌표계 (길이 계산용)

# OpenStreetMap 길 정보 중 가로등(lit)·보도(sidewalk)·자동차전용도로(motorroad)도 함께 받기
EXTRA_TAGS = ["lit", "sidewalk", "motorroad"]
ox.settings.useful_tags_way = list(ox.settings.useful_tags_way) + EXTRA_TAGS
ox.settings.log_console = False
ox.settings.requests_timeout = 300  # 큰 지역이라 서버 응답 대기 시간을 넉넉히


def daegu_area():
    """행정동 150개를 합쳐 대구 전체 모양(+300m 여유)을 만듦"""
    hits = glob.glob(os.path.join(DATA, "대구_행정동_경계*.geojson"))
    if not hits:
        print("data 폴더에 대구_행정동_경계_ver20251231.geojson 이 없어요.")
        sys.exit(1)
    gdf = gpd.read_file(hits[0])
    gdf = gdf[gdf["sidonm"] == "대구광역시"]
    shape = gdf.to_crs(METER_CRS).union_all().buffer(BUFFER_M)
    return gpd.GeoSeries([shape], crs=METER_CRS).to_crs(4326).iloc[0]


def get_graph():
    if os.path.exists(GRAPH_FILE):
        G = ox.load_graphml(GRAPH_FILE)
        saved = str(G.graph.get("anshim_tags", "")).split(",")
        if all(t in saved for t in EXTRA_TAGS):
            print("저장해 둔 도로망을 불러와요:", GRAPH_FILE)
            return G
        # 예전에 받은 도로망에는 자동차전용도로 정보가 없어서 새로 받음
        print("저장된 도로망에 자동차전용도로 정보가 없어서 새로 받아요.")
    print("OpenStreetMap에서 대구 도보 도로망을 받는 중… (10~30분, 중간에 멈춘 것처럼 보여도 기다려 주세요)")
    t = time.time()
    G = ox.graph_from_polygon(daegu_area(), network_type="walk", simplify=True, retain_all=False)
    G.graph["anshim_tags"] = ",".join(EXTRA_TAGS)  # 어떤 정보를 함께 받았는지 표시
    ox.save_graphml(G, GRAPH_FILE)
    print(f"받기 완료: 교차로 {G.number_of_nodes():,}개, 길 {G.number_of_edges():,}개 ({(time.time() - t) / 60:.0f}분)")
    return G


def to_text(v):
    """OpenStreetMap 값이 목록으로 올 때가 있어 글자로 통일 (예: ['residential','service'])"""
    if isinstance(v, list):
        return ",".join(str(x) for x in v)
    return "" if v is None or (isinstance(v, float) and v != v) else str(v)


def split_edges(edges, max_len=MAX_SEG_M):
    """길(LineString)을 max_len 이하 구간들로 똑같이 나눔. edges 는 미터 좌표계여야 함"""
    rows = []
    for e in edges.itertuples(index=False):
        line = e.geometry
        n = max(1, int(-(-line.length // max_len)))  # 올림: 120m → 3조각(40m씩)
        step = line.length / n
        for i in range(n):
            piece = substring(line, i * step, (i + 1) * step) if n > 1 else line
            rows.append({
                "u": e.u, "v": e.v, "key": e.key, "part": i,
                "length_m": round(piece.length, 1),
                "highway": to_text(getattr(e, "highway", None)),
                "name": to_text(getattr(e, "name", None)),
                "lit": to_text(getattr(e, "lit", None)),
                "sidewalk": to_text(getattr(e, "sidewalk", None)),
                "motorroad": to_text(getattr(e, "motorroad", None)),
                "geometry": piece,
            })
    seg = gpd.GeoDataFrame(rows, geometry="geometry", crs=edges.crs)
    seg.insert(0, "seg_id", range(len(seg)))
    return seg


def main():
    G = get_graph()
    # 걷는 길은 양방향이라 한 방향만 남김 (같은 길이 두 번 세지지 않게)
    Gu = ox.convert.to_undirected(G)
    edges = ox.graph_to_gdfs(Gu, nodes=False).reset_index()  # u, v, key 열이 생김
    edges = edges.to_crs(METER_CRS)
    print(f"길 {len(edges):,}개 → {MAX_SEG_M}m 이하 구간으로 나누는 중…")
    seg = split_edges(edges).to_crs(4326)
    seg.to_file(OUT_FILE, layer="segments", driver="GPKG")

    total_km = seg["length_m"].sum() / 1000
    print(f"\n저장 완료: {OUT_FILE}")
    print(f"구간 {len(seg):,}개 · 총 길이 {total_km:,.0f}km · 평균 {seg['length_m'].mean():.0f}m")
    print("길 종류 상위:", seg["highway"].value_counts().head(8).to_dict())
    print("lit(가로등) 정보가 있는 구간:", int((seg["lit"] != "").sum()), "개")
    print("자동차전용도로(motorroad=yes) 구간:", int(seg["motorroad"].str.contains("yes").sum()), "개")


if __name__ == "__main__":
    main()
