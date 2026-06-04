use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use axum::http::{header, HeaderValue};
use axum::response::IntoResponse;
use super::models::*;
use crate::{
    infrastructure::{auth::AuthUser, validation::ValidatedJson},
    errors::{AppError, Result},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/me", get(me))
        .route("/reset", post(reset_password))
}

async fn register(
    State(state): State<AppState>,
    ValidatedJson(req): ValidatedJson<RegisterRequest>,
) -> Result<impl IntoResponse> {
    let (user, token, recovery_code) = state.auth_service.register(req).await?;

    let cookie = format!(
        "cc_token={}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax",
        token
    );

    let body = serde_json::json!({
        "user": {
            "id": user.id,
            "username": user.username,
            "displayName": user.display_name,
        },
        "recoveryCode": recovery_code
    });

    Ok((
        axum::http::StatusCode::CREATED,
        [(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap())],
        Json(body),
    ))
}

async fn login(
    State(state): State<AppState>,
    ValidatedJson(req): ValidatedJson<LoginRequest>,
) -> Result<impl IntoResponse> {
    let (user, token) = state.auth_service.login(req).await?;

    let cookie = format!(
        "cc_token={}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax",
        token
    );

    let body = serde_json::json!({
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name,
    });

    Ok((
        axum::http::StatusCode::OK,
        [(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap())],
        Json(body),
    ))
}

async fn logout() -> impl IntoResponse {
    let cookie = "cc_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
    (
        [(header::SET_COOKIE, HeaderValue::from_str(cookie).unwrap())],
        Json(serde_json::json!({ "success": true })),
    )
}

async fn me(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>> {
    let uid: uuid::Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;

    let user = state.auth_service.me(uid).await?;

    Ok(Json(serde_json::json!({
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name,
    })))
}

async fn reset_password(
    State(state): State<AppState>,
    ValidatedJson(req): ValidatedJson<ResetPasswordRequest>,
) -> Result<Json<serde_json::Value>> {
    state.auth_service.reset_password(req).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}
