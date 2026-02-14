from pydantic import BaseModel


class CredentialCreate(BaseModel):
    provider: str  # "srt" or "korail"
    login_id: str
    password: str


class CredentialResponse(BaseModel):
    provider: str
    created_at: str
    updated_at: str
