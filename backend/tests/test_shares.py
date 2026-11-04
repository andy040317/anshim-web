"""위치공유 테스트 (FR-10·11, SR-03)
규격서 보안 확인 항목: 공유 중인 토큰 / 임의 토큰 / 만료 토큰 / 종료 토큰을 각각 시험
"""
from datetime import timedelta

from app.db import SessionLocal
from app.models import Share, now_utc

from .conftest import add_guardian, join

POS = {"lat": 35.8714, "lng": 128.6014}


def start(client, h, gid, **extra):
    r = client.post("/shares", json={"type": "normal", "guardianIds": [gid], "pos": POS, **extra}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_공유_중인_토큰은_위치를_볼_수_있음(client):
    h = join(client)
    gid = add_guardian(client, h)
    s = start(client, h, gid, dest={"name": "집", "lat": 35.86, "lng": 128.61}, route=[[35.87, 128.60], [35.86, 128.61]])
    assert len(s["token"]) >= 32 and s["status"] == "active" and s["guardianIds"] == [gid]
    assert s["expiresAt"] - s["startedAt"] == 60 * 60 * 1000  # 일반 공유: 60분

    r = client.get("/shares/" + s["token"])  # 보호자: 로그인 없이
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-store"
    v = r.json()
    assert v["name"] == "김안심" and v["last"]["lat"] == POS["lat"] and v["dest"]["name"] == "집" and len(v["route"]) == 2
    assert "phone" not in r.text  # 보호자 연락처는 보여주지 않음

    # 5초마다 위치 전송 → 보호자 화면에 반영
    assert client.post(f"/shares/{s['id']}/locations", json={"lat": 35.87, "lng": 128.602, "accuracy": 8}, headers=h).status_code == 204
    last = client.get("/shares/" + s["token"]).json()["last"]
    assert (last["lat"], last["lng"], last["accuracy"]) == (35.87, 128.602, 8)


def test_임의_토큰은_차단(client):
    r = client.get("/shares/" + "x" * 32)
    assert r.status_code == 404 and r.json()["code"] == "INVALID_LINK"


def test_종료_토큰은_차단되고_위치가_지워짐(client):
    h = join(client)
    gid = add_guardian(client, h)
    s = start(client, h, gid)
    assert client.delete(f"/shares/{s['id']}", params={"reason": "arrived"}, headers=h).status_code == 204

    r = client.get("/shares/" + s["token"])
    assert r.status_code == 410
    assert r.json() == {"code": "LINK_CLOSED", "message": "김안심님이 목적지에 도착해서 공유가 끝났어요.", "status": "ended", "reason": "arrived"}
    with SessionLocal() as db:
        row = db.get(Share, s["id"])
        assert row.last_lat is None and row.route is None  # 목적이 끝난 위치정보는 삭제
    r = client.post(f"/shares/{s['id']}/locations", json=POS, headers=h)
    assert r.status_code == 410 and r.json()["code"] == "SHARE_CLOSED"


def test_만료_토큰은_차단(client):
    h = join(client)
    gid = add_guardian(client, h)
    s = start(client, h, gid)
    with SessionLocal() as db:  # 만료 시각을 지난 것으로 바꿔서 시험
        db.get(Share, s["id"]).expires_at = now_utc() - timedelta(seconds=1)
        db.commit()
    r = client.get("/shares/" + s["token"])
    assert r.status_code == 410 and r.json()["status"] == "expired"
    assert r.json()["message"] == "공유 시간이 지나서 더 이상 위치를 볼 수 없어요."


def test_새_공유를_시작하면_이전_링크는_끝남(client):
    h = join(client)
    gid = add_guardian(client, h)
    first = start(client, h, gid)
    second = start(client, h, gid)
    assert client.get("/shares/" + first["token"]).status_code == 410
    assert client.get("/shares/" + second["token"]).status_code == 200


def test_공유_시작_조건(client):
    h = join(client, consent=False)
    gid = add_guardian(client, h)
    r = client.post("/shares", json={"type": "normal", "guardianIds": [gid]}, headers=h)
    assert r.status_code == 403 and r.json()["code"] == "CONSENT_REQUIRED"  # 위치 동의 없이 일반 공유 불가
    client.put("/users/me/consents", json={"location": True}, headers=h)
    r = client.post("/shares", json={"type": "normal", "guardianIds": []}, headers=h)
    assert r.status_code == 400 and r.json()["code"] == "NO_GUARDIAN"


def test_다른_사용자의_보호자나_공유는_건드릴_수_없음(client):
    mine = join(client, "user1")
    other = join(client, "user2")
    my_gid = add_guardian(client, mine)
    other_gid = add_guardian(client, other)
    r = client.post("/shares", json={"type": "normal", "guardianIds": [other_gid]}, headers=mine)
    assert r.status_code == 404  # 남의 보호자에게 공유 불가
    s = start(client, mine, my_gid)
    assert client.delete(f"/shares/{s['id']}", headers=other).status_code == 404
    assert client.post(f"/shares/{s['id']}/locations", json=POS, headers=other).status_code == 404
    assert client.get("/shares/" + s["token"]).status_code == 200  # 그대로 진행 중


def test_위치_동의를_거두면_공유도_끝남(client):
    h = join(client)
    gid = add_guardian(client, h)
    s = start(client, h, gid)
    client.put("/users/me/consents", json={"location": False}, headers=h)
    assert client.get("/shares/" + s["token"]).status_code == 410


def test_좌표_범위_검사(client):
    h = join(client)
    gid = add_guardian(client, h)
    s = start(client, h, gid)
    r = client.post(f"/shares/{s['id']}/locations", json={"lat": 135, "lng": 128.6}, headers=h)
    assert r.status_code == 422 and r.json()["message"] == "위치 좌표가 올바르지 않아요."
