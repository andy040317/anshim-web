"""SOS 테스트 (FR-12, IDR-06, 규격서 3장 4절 예외 처리)"""
from app.db import SessionLocal
from app.models import SosEvent, to_ms

from .conftest import add_guardian, join

POS = {"lat": 35.8714, "lng": 128.6014}


def test_보호자가_없어도_SOS는_진행(client):
    h = join(client)
    r = client.post("/sos", json={"pos": POS}, headers=h)
    assert r.status_code == 201
    assert r.json()["shareStatus"] == "no_guardian" and r.json()["share"] is None
    assert client.post(f"/sos/{r.json()['id']}/end", headers=h).status_code == 204


def test_SOS_긴급_공유는_만료_없이_상황_종료까지(client):
    h = join(client)
    add_guardian(client, h)
    add_guardian(client, h, "엄마", "010-2222-3333")
    sos = client.post("/sos", json={"pos": POS, "locatedAt": 1700000000000, "stale": True}, headers=h).json()
    share = sos["share"]
    assert sos["shareStatus"] == "shared" and share["type"] == "sos" and share["expiresAt"] is None
    assert len(share["guardianIds"]) == 2 and share["token"]
    assert client.get("/shares/" + share["token"]).json()["type"] == "sos"

    with SessionLocal() as db:  # 기록: 사용한 위치와 확인 시각, '마지막 위치' 여부
        ev = db.get(SosEvent, sos["id"])
        assert (ev.lat, ev.location_stale, ev.share_status, ev.report_ready) == (POS["lat"], True, "shared", True)
        assert to_ms(ev.located_at) == 1700000000000

    assert client.post(f"/sos/{sos['id']}/end", headers=h).status_code == 204
    r = client.get("/shares/" + share["token"])
    assert r.status_code == 410 and r.json()["reason"] == "sos"


def test_일반_공유_중이면_같은_링크가_긴급_공유로_바뀜(client):
    h = join(client)
    gid = add_guardian(client, h)
    normal = client.post("/shares", json={"type": "normal", "guardianIds": [gid], "pos": POS}, headers=h).json()
    sos = client.post("/sos", json={"pos": POS}, headers=h).json()
    assert sos["share"]["id"] == normal["id"] and sos["share"]["token"] is None  # 토큰은 처음 만들 때만 알려줌
    v = client.get("/shares/" + normal["token"]).json()  # 보호자가 이미 받은 링크 그대로
    assert v["type"] == "sos" and v["expiresAt"] is None


def test_위치를_모르면_위치_없이_기록(client):
    h = join(client)
    sos = client.post("/sos", json={}, headers=h).json()
    with SessionLocal() as db:
        ev = db.get(SosEvent, sos["id"])
        assert ev.lat is None and ev.located_at is None


def test_다른_사용자의_SOS는_종료할_수_없음(client):
    mine = join(client, "user1")
    other = join(client, "user2")
    sos = client.post("/sos", json={"pos": POS}, headers=mine).json()
    assert client.post(f"/sos/{sos['id']}/end", headers=other).status_code == 404
