from pydantic import BaseModel


class CredentialCreate(BaseModel):
    provider: str = "upbit"
    access_key: str
    secret_key: str


class CredentialResponse(BaseModel):
    provider: str
    created_at: str
    updated_at: str
