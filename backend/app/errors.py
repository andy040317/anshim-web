"""오류 응답 형식 통일
모든 오류를 {"code": "...", "message": "..."} 모양으로 돌려줌.
프론트(App.jsx)의 가짜 API가 쓰던 { status, code, message } 와 같은 모양이라 화면 코드를 그대로 쓸 수 있음
"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    """http_status: 응답 번호(401, 404 등), code: 오류 이름, message: 화면에 보여줄 문구, extra: 응답에 덧붙일 값"""
    def __init__(self, http_status, code, message, **extra):
        self.http_status, self.code, self.message, self.extra = http_status, code, message, extra


# 입력값 검사에서 걸렸을 때, 칸 이름별 안내 문구 (schemas.py 의 검사기가 직접 문구를 줄 때는 그 문구를 씀)
FIELD_MSG = {
    "id": "아이디를 확인해 주세요.",
    "pw": "비밀번호를 확인해 주세요.",
    "name": "이름을 확인해 주세요.",
    "phone": "휴대폰 번호를 확인해 주세요.",
    "lat": "위치 좌표가 올바르지 않아요.",
    "lng": "위치 좌표가 올바르지 않아요.",
}


def install(app: FastAPI):
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, e: ApiError):
        return JSONResponse({"code": e.code, "message": e.message, **e.extra}, status_code=e.http_status)

    @app.exception_handler(RequestValidationError)
    async def _invalid(request: Request, e: RequestValidationError):
        err = e.errors()[0] if e.errors() else {}
        msg = str(err.get("msg", ""))
        if err.get("type") == "value_error":           # 우리가 만든 검사기의 한국어 문구 ("Value error, " 앞부분 제거)
            msg = msg.split(", ", 1)[-1]
        else:
            field = next((str(x) for x in reversed(err.get("loc", ())) if isinstance(x, str)), "")
            msg = FIELD_MSG.get(field, "입력값을 확인해 주세요.")
        return JSONResponse({"code": "INVALID_INPUT", "message": msg}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, e: StarletteHTTPException):
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(e.status_code, "HTTP_ERROR")
        msg = {404: "요청한 주소가 없어요.", 405: "지원하지 않는 요청 방식이에요."}.get(e.status_code, str(e.detail))
        return JSONResponse({"code": code, "message": msg}, status_code=e.status_code)
