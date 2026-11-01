"""
지도 레이어용 데이터 만들기 (데이터 담당용)

data 폴더의 정리된 파일 → 웹 지도에 올릴 작은 JSON 파일 (public/data/)
  police.json   지구대·파출소 66곳   [{name, kind, addr, lat, lng}]
  fire119.json  119안전센터 51곳     [{name, station, addr, tel, lat, lng}]   (좌표 변환까지 끝난 버전)
  stores.json   편의점 (대피 우선순위 '높음'만) [[위도, 경도, 상호명, 브랜드]]
  lamps.json    보안등 설치 지점      [[위도, 경도, 설치개수]]  (같은 좌표는 합침, 대표점 좌표·변환 실패 제외)
  ※ 유흥주점은 지도에 표시하지 않음 (위험도 계산과 경로 카드 근거에만 사용)
  ※ cctv.json, bells.json 은 prepare_data.py 가 만든 것을 그대로 사용

실행 (프로젝트 최상위 폴더에서)
  py scripts/prepare_map_layers.py
"""
import csv
import json
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT = os.path.join(HERE, "..", "public", "data")
LAMP_OK = {"정상", "같은좌표_같은주소", "주소로변환", "본번으로변환_근사"}


def read(name):
    for enc in ("utf-8-sig", "cp949"):
        try:
            with open(os.path.join(DATA, name), encoding=enc) as f:
                return list(csv.DictReader(f))
        except UnicodeDecodeError:
            continue
    raise ValueError(name)


def num(v):
    try:
        return round(float(v), 6)
    except (TypeError, ValueError):
        return None


def save(name, data):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {name:13} {len(data):>6,}개 · {os.path.getsize(path) / 1e3:,.0f}KB")


def main():
    os.makedirs(OUT, exist_ok=True)
    print("저장 위치:", os.path.abspath(OUT))

    police = [{"name": r["이름"], "kind": r["구분"], "addr": r["주소"], "lat": num(r["위도"]), "lng": num(r["경도"])}
              for r in read("대구_지구대파출소_좌표.csv") if num(r["위도"])]
    save("police.json", police)

    fire = [{"name": r["이름"], "station": r["소방서"], "addr": r["주소"], "tel": r["전화번호"],
             "lat": num(r["위도"]), "lng": num(r["경도"])}
            for r in read("대구_119안전센터_좌표.csv") if num(r["위도"])]
    save("fire119.json", fire)

    stores = [[num(r["위도"]), num(r["경도"]), (r["상호명"] + " " + r["지점명"]).strip(), r["브랜드"]]
              for r in read("대구_편의점_정리.csv") if r["대피우선순위"] == "높음" and num(r["위도"])]
    save("stores.json", stores)

    lamps = defaultdict(int)
    for r in read("대구광역시_보안등_최종.csv"):
        if r["좌표상태"] not in LAMP_OK:
            continue
        la, lo = num(r["위도"]), num(r["경도"])
        if la is None or lo is None:
            continue
        try:
            n = int(float(r["설치개수"] or 1))
        except ValueError:
            n = 1
        lamps[(round(la, 5), round(lo, 5))] += n
    save("lamps.json", [[la, lo, n] for (la, lo), n in lamps.items()])


if __name__ == "__main__":
    main()
