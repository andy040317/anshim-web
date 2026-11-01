"""
4단계: 구간별·시간대별 위험도 계산 (규칙 기반, 데이터 담당용)

입력 (data 폴더)
  대구_구간특성.gpkg               3단계 결과
  대구_행정동_서비스인구.geojson   1단계 결과 (시간대별 인구 밀도)
설정
  scripts/config_risk.json         가중치·기준값 (숫자만 바꾸고 다시 실행)
출력
  data/대구_구간위험도.gpkg        구간 + r00 ~ r23 (각 시간대 위험도 0~100, 클수록 위험)

위험도 계산식 (시간대 h 마다)
  위험도 = 30 × 범죄주의
         + 20 × 사람 적음
         + 20 × 안전시설 부족
         + 10 × 대피 거점 멂
         + 10 × 유흥주점 밀집 (심야 22~04시에만)
         + 10 × 골목 (어두운 18~06시에만. 큰길 0, 중간 길 0.5, 골목 1. 읍·면 큰길은 0.5)
  · 자동차전용도로(motorroad=yes)는 걸으면 안 되는 길이라 모든 시간 100
  · 각 항목은 0(안전) ~ 1(위험)로 맞춘 값, 가중치는 config_risk.json
  · 인구 자료가 없는 군위군은 비슷한 농촌 지역(달성군 면 지역) 평균 인구 점수를 대신 씀
    (처음엔 인구 항목을 빼고 계산하려 했지만, 그러면 범죄 자료가 거의 없는 군위군이
     대구에서 가장 안전한 곳으로 나와서 바꿈)
  · 위험도는 경로끼리 비교하기 위한 상대 지표이며 실제 범죄 확률이 아님

실행 (프로젝트 최상위 폴더에서)
  py scripts/step4_risk_score.py     → 1~2분
"""
import json
import os
import time

import geopandas as gpd
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
IN_SEG = os.path.join(DATA, "대구_구간특성.gpkg")
IN_POP = os.path.join(DATA, "대구_행정동_서비스인구.geojson")
OUT = os.path.join(DATA, "대구_구간위험도.gpkg")
HOURS = list(range(24))


def load_config():
    with open(os.path.join(HERE, "config_risk.json"), encoding="utf-8") as f:
        return json.load(f)


def pct_rank(values):
    """값들을 0~1 순위 점수로 (가장 작은 값 0, 가장 큰 값 1). 결측은 그대로 결측"""
    s = pd.Series(values, dtype=float)
    return s.rank(pct=True, method="average").to_numpy()


def people_table(cfg):
    """행정동 × 시간대 '거리에 사람이 있는 정도'(0~1) 표를 만듦

    서비스인구는 집 안에 있는 사람도 세기 때문에, 그대로 쓰면 새벽 주택가가 '붐비는 곳'이 됨.
    그래서 두 가지를 섞음
      A × T : 인구가 많은 동인가(A, 순위 0~1) × 지금 도시 전체가 움직이는 시간인가(T, 0~1)
              T = 새벽 4시와 비교한 대구 전체 인구 이동량. 새벽엔 0에 가깝고 낮에 1
      B     : 새벽 4시보다 늘어난 인구 밀도 = 밖에서 들어온 활동 인구 (번화가는 밤에도 높음)
    """
    pc = cfg["people"]
    bh = pc["baseline_hour"]
    pop = gpd.read_file(IN_POP)
    cols = [f"d{h:02d}" for h in HOURS]
    dens = pop[cols].to_numpy(dtype=float)                     # (동 수, 24) 1km²당 인구
    ok = ~np.isnan(dens).any(axis=1)                           # 인구 자료가 있는 동 (군위군 제외)

    # T: 대구 전체 활동량 곡선 (동마다 '새벽 4시와 다른 인구 수'를 모두 더한 값)
    count = dens[ok] * pop.loc[ok, "면적_km2"].to_numpy()[:, None]
    move = np.abs(count - count[:, [bh]]).sum(axis=0)
    T = move / move.max()

    A = np.full(dens.shape, np.nan)
    A[ok] = pct_rank(np.log1p(dens[ok]).ravel()).reshape(dens[ok].shape)  # 로그: 동 사이 차이 완화
    excess = np.clip(dens - dens[:, [bh]], 0, None)
    p95 = np.nanpercentile(excess[ok][excess[ok] > 0], 95)    # 상위 5% 번화가 수준이면 만점
    B = np.clip(excess / p95, 0, 1)

    r = pc["density_ratio"]
    score = r * A * T[None, :] + (1 - r) * B

    # 인구 자료가 없는 동(군위군): 비슷한 농촌 지역(달성군 면 지역) 평균값을 빌려 씀
    names = pop["동"].tolist()
    ref = [names.index(n) for n in pc["fallback_dongs"] if n in names]
    fallback = np.nanmean(score[ref], axis=0)
    score[~ok] = fallback
    print("대구 활동량 곡선 T:", " ".join(f"{h}시 {T[h]:.2f}" for h in (2, 6, 9, 14, 18, 21, 23)))
    print(f"인구 자료 없는 동 {int((~ok).sum())}곳은 {pc['fallback_dongs']} 평균으로 대신함")
    return pd.DataFrame(score, index=pop["adm_cd"].astype(str), columns=HOURS)


def road_scores(seg, rc):
    """길 종류 → 골목 점수(0~1), 자동차전용도로 여부(True/False)"""
    table, default = rc["scores"], rc["default"]

    def one(hw):
        # 길이 합쳐지면서 'residential,service'처럼 여러 종류가 적힌 경우 → 평균
        kinds = [k for k in str(hw).split(",") if k]
        return float(np.mean([table.get(k, default) for k in kinds])) if kinds else default

    alley = seg["highway"].map(one).to_numpy()
    # 읍·면(농촌)의 큰길은 보도가 없을 수 있어 큰길 우대를 하지 않음
    rural = seg["dong"].fillna("").str.endswith(("읍", "면")).to_numpy() | (seg["dong"].fillna("") == "").to_numpy()
    alley = np.where(rural & (alley < rc["rural_major_score"]), rc["rural_major_score"], alley)
    # 예전 도로망으로 만든 파일에는 motorroad 열이 없을 수 있음 → 없으면 모두 False
    mr = seg["motorroad"].fillna("").astype(str) if "motorroad" in seg else pd.Series("", index=seg.index)
    return alley, mr.str.contains("yes").to_numpy()


def main():
    t0 = time.time()
    cfg = load_config()
    w = cfg["weights"]
    seg = gpd.read_file(IN_SEG)
    n = len(seg)
    print(f"구간 {n:,}개 · 가중치 {dict((k, v) for k, v in w.items() if not k.startswith('_'))}")

    # ── 시간과 관계없는 항목 ──
    c = cfg["crime"]
    k = c["use_max_ratio"]
    crime = np.clip((k * seg["crime_max"] + (1 - k) * seg["crime_mean"]) / c["max_grade"], 0, 1).to_numpy()

    f = cfg["facility"]
    cctv = np.clip(seg["cctv_cam"] / f["cctv_cap"], 0, 1).to_numpy()
    bell = np.clip(seg["bell_cnt"] / f["bell_cap"], 0, 1).to_numpy()
    lamp = np.clip(seg["lamp_cnt"] / f["lamp_cap"], 0, 1).to_numpy()
    mx = f["mix"]
    fac_dark = mx["cctv"] * cctv + mx["bell"] * bell + mx["lamp"] * lamp
    fac_light = mx["cctv"] * cctv + mx["bell"] * bell + mx["lamp"] * 1.0  # 밝은 시간에는 햇빛이 조명 역할 → 보안등 몫은 만점

    s = cfg["shelter"]
    near = lambda col, reach: np.clip(1 - seg[col].to_numpy() / reach, 0, 1)
    sm = s["mix"]
    shelter = (sm["store"] * near("dist_store", s["store_reach"])
               + sm["police"] * near("dist_police", s["police_reach"])
               + sm["fire"] * near("dist_fire", s["fire_reach"]))

    bars = np.clip(seg["bar_cnt"] / cfg["nightlife"]["cap"], 0, 1).to_numpy()
    alley, motorroad = road_scores(seg, cfg["road"])

    # ── 시간대별 인구 ──
    ppl = people_table(cfg)
    adm = seg["adm_cd"].astype(str)
    pop_src = gpd.read_file(IN_POP)[["adm_cd", "인구출처"]].astype(str).set_index("adm_cd")["인구출처"]
    # 대구 경계 밖 여유 구간(행정동 없음)은 대구 전체 시간대 평균값 사용
    city_mean = ppl.mean(axis=0)

    night, dark = set(cfg["night_hours"]), set(cfg["dark_hours"])
    for h in HOURS:
        people = adm.map(ppl[h]).fillna(city_mean[h]).to_numpy(dtype=float)
        fac = fac_dark if h in dark else fac_light
        risk = (w["crime"] * crime
                + w["few_people"] * (1 - people)
                + w["no_facility"] * (1 - fac)
                + w["far_shelter"] * (1 - shelter))
        if h in night:
            risk = risk + w["nightlife"] * bars
        if h in dark:
            risk = risk + w["alley"] * alley
        risk = np.where(motorroad, cfg["road"]["motorroad_risk"], risk)
        seg[f"r{h:02d}"] = np.clip(np.round(risk), 0, 100).astype(np.uint8)

    seg["alley"] = alley.round(2)

    # 인구 값의 출처 (원본 / 합쳐진동 / 인접동추정 / 자료없음→농촌평균 / 대구밖)
    seg["pop_data"] = adm.map(pop_src).fillna("대구밖").str.replace("자료없음", "농촌평균대체")
    seg.to_file(OUT, layer="segments", driver="GPKG")
    print(f"저장 완료: {OUT} ({(time.time() - t0) / 60:.1f}분)")
    report(seg)


def report(seg):
    print("\n시간대별 평균 위험도 (구간 길이 가중)")
    L = seg["length_m"]
    wavg = lambda df, c: (df[c] * df["length_m"]).sum() / df["length_m"].sum()
    print("  " + " ".join(f"{h}시 {wavg(seg, f'r{h:02d}'):.0f}" for h in (2, 6, 10, 14, 18, 20, 22, 23)))
    print("23시 위험도 분포:", np.percentile(seg["r23"], [10, 50, 90]).round(0).tolist(), "(10%·50%·90% 지점)")
    urban = ~seg["dong"].fillna("").str.endswith(("읍", "면")) & (seg["dong"].fillna("") != "")
    big, small = urban & (seg["alley"] == 0), urban & (seg["alley"] == 1)
    print(f"도시 지역 23시 평균: 큰길 {wavg(seg[big], 'r23'):.0f} · 골목 {wavg(seg[small], 'r23'):.0f}"
          f"  (14시: 큰길 {wavg(seg[big], 'r14'):.0f} · 골목 {wavg(seg[small], 'r14'):.0f})")
    print("자동차전용도로로 표시된 구간:", int((seg["r14"] == 100).sum()), "개")


if __name__ == "__main__":
    main()
