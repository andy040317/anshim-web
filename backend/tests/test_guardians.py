"""보호자 관리 테스트 (FR-09, SR-02: 다른 사용자의 보호자 정보 접근 차단)"""
from .conftest import add_guardian, join


def test_보호자_등록_수정_삭제(client):
    h = join(client)
    assert client.get("/guardians", headers=h).json() == []
    gid = add_guardian(client, h)
    r = client.put(f"/guardians/{gid}", json={"name": "엄마", "phone": "010-9876-5432"}, headers=h)
    assert r.json() == {"id": gid, "name": "엄마", "phone": "010-9876-5432"}
    assert client.get("/guardians", headers=h).json() == [{"id": gid, "name": "엄마", "phone": "010-9876-5432"}]
    assert client.delete(f"/guardians/{gid}", headers=h).status_code == 204
    assert client.get("/guardians", headers=h).json() == []


def test_번호_형식_검사(client):
    h = join(client)
    r = client.post("/guardians", json={"name": "친구", "phone": "01012345678"}, headers=h)
    assert r.status_code == 422
    assert r.json()["message"] == "휴대폰 번호 형식이 아니에요. 예: 010-1234-5678"


def test_다른_사용자의_보호자는_볼_수도_고칠_수도_없음(client):
    mine = join(client, "user1")
    other = join(client, "user2")
    gid = add_guardian(client, mine)
    assert client.get("/guardians", headers=other).json() == []
    r = client.put(f"/guardians/{gid}", json={"name": "해커", "phone": "010-0000-0000"}, headers=other)
    assert r.status_code == 404 and r.json()["code"] == "GUARDIAN_NOT_FOUND"
    assert client.delete(f"/guardians/{gid}", headers=other).status_code == 404
    assert client.get("/guardians", headers=mine).json()[0]["name"] == "친구"  # 그대로 남아 있음


def test_로그인_없이는_접근_불가(client):
    assert client.get("/guardians").status_code == 401
