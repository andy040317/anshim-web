"""
공공데이터 CSV → 웹에서 쓰는 JSON 변환 스크립트 (데이터 담당용)

하는 일
  1. cp949(EUC-KR)로 저장된 CSV를 읽는다
  2. 대구 범위를 벗어난 좌표(입력 오류)를 걸러낸다  ← FR-13 결측·오류 처리
  3. 웹에서 빨리 읽을 수 있게 꼭 필요한 열만 JSON으로 저장한다

실행 방법 (프로젝트 최상위 폴더에서)
  python scripts/prepare_data.py CCTV정보_대구광역시.csv 안전비상벨위치정보_대구광역시.csv "소방청 119안전센터 주소 및 전화번호20260701.csv"

결과
  public/data/cctv.json, public/data/bells.json, public/data/fire119.json
  (실제 서비스에서는 이 데이터가 PostgreSQL에 들어가고 GET /facilities 로 조회됨)
"""
import csv
import json
import os
import sys

# 대구 전체(군위군 포함)를 감싸는 대략적인 범위
LAT_MIN, LAT_MAX = 35.55, 36.35
LNG_MIN, LNG_MAX = 128.30, 129.00

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")


def read_csv(path):
    """cp949로 먼저 읽고, 안 되면 utf-8로 다시 시도"""
    for enc in ("cp949", "utf-8-sig"):
        try:
            with open(path, encoding=enc) as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    raise ValueError(f"인코딩을 알 수 없어요: {path}")


def in_daegu(lat, lng):
    return LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def prepare_points(rows, count=None):
    """위도·경도가 있고 대구 안에 있는 행만 [위도, 경도, 개수] 로 정리
    같은 좌표가 여러 번 나오면(한 기둥에 목적별로 따로 등록된 경우 등) 한 점으로 합치고 개수를 더함"""
    merged, missing, outside = {}, 0, 0
    for r in rows:
        lat, lng = to_float(r.get("WGS84위도")), to_float(r.get("WGS84경도"))
        if lat is None or lng is None:
            missing += 1
            continue
        if not in_daegu(lat, lng):
            outside += 1
            continue
        key = (round(lat, 6), round(lng, 6))
        n = count(r) if count else 1
        if key in merged:
            merged[key][2] += n
        else:
            merged[key] = [key[0], key[1], n]
    return list(merged.values()), missing, outside


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    cctv_path, bell_path, fire_path = sys.argv[1:]
    os.makedirs(OUT_DIR, exist_ok=True)

    # 1) CCTV: [위도, 경도, 카메라대수]
    cctv_rows = read_csv(cctv_path)
    cctv, miss, out = prepare_points(cctv_rows, count=lambda r: int(to_float(r.get("카메라대수")) or 1))
    print(f"CCTV  원본 {len(cctv_rows)}건 → 설치 지점 {len(cctv)}곳, 카메라 {sum(c[2] for c in cctv)}대 (좌표 없음 {miss}, 대구 밖 {out})")

    # 2) 안전비상벨: [위도, 경도, 개수]
    bell_rows = read_csv(bell_path)
    bells, miss, out = prepare_points(bell_rows)
    print(f"비상벨 원본 {len(bell_rows)}건 → 설치 지점 {len(bells)}곳 (좌표 없음 {miss}, 대구 밖 {out})")

    # 3) 119안전센터: 좌표가 없어서 이름·주소만 저장 (브라우저에서 카카오 주소검색으로 좌표 변환)
    fire_rows = read_csv(fire_path)
    fire = [
        {"name": r["119안전센터명"].strip(), "station": r["소방서명"].strip(), "addr": r["주소"].strip(), "tel": r["전화번호"].strip()}
        for r in fire_rows
        if "대구" in r.get("시도본부", "")
    ]
    print(f"119   전국 {len(fire_rows)}건 → 대구 {len(fire)}건")

    for name, data in (("cctv.json", cctv), ("bells.json", bells), ("fire119.json", fire)):
        with open(os.path.join(OUT_DIR, name), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("저장 완료:", os.path.abspath(OUT_DIR))


if __name__ == "__main__":
    main()
