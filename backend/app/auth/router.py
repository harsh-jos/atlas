"""Auth endpoints: register, log in, identify the caller."""

from fastapi import APIRouter, HTTPException, status

from app.auth.deps import CurrentUser, SessionDep
from app.auth.schemas import Credentials, SocketTicket, TokenResponse, UserResponse
from app.auth.service import AuthService, EmailTaken, InvalidCredentials
from app.core.config import get_settings
from app.core.security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(credentials: Credentials, session: SessionDep) -> UserResponse:
    try:
        user = AuthService(session).register(credentials.email, credentials.password)
    except EmailTaken:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered") from None
    return UserResponse.model_validate(user)


@router.post("/login", response_model=TokenResponse)
def login(credentials: Credentials, session: SessionDep) -> TokenResponse:
    service = AuthService(session)
    try:
        user = service.authenticate(credentials.email, credentials.password)
    except InvalidCredentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password") from None
    return TokenResponse(access_token=service.issue_token(user))


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)


@router.post("/socket-ticket", response_model=SocketTicket)
def socket_ticket(user: CurrentUser) -> SocketTicket:
    """Mint a brief token for opening a WebSocket, so the session cookie stays out of the browser."""
    minutes = get_settings().socket_ticket_ttl_minutes
    return SocketTicket(
        ticket=create_access_token(user.id, ttl_minutes=minutes), expires_in=minutes * 60
    )
