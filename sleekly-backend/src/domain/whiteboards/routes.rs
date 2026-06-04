use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use uuid::Uuid;

use crate::{
    infrastructure::auth::AuthUser,
    errors::{AppError, Result},
    state::AppState,
};
use super::models::*;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/:board_id", get(get_whiteboard).put(update_whiteboard))
}

async fn get_whiteboard(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(board_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let row = state.whiteboard_service.get_whiteboard(uid, board_id).await?;

    match row {
        Some(r) => Ok(Json(serde_json::json!({
            "elements": r.elements,
            "appState": r.app_state,
        }))),
        None => Ok(Json(serde_json::json!({
            "elements": [],
            "appState": {},
        }))),
    }
}

async fn update_whiteboard(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(board_id): Path<Uuid>,
    Json(req): Json<UpdateWhiteboardRequest>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    state.whiteboard_service.update_whiteboard(uid, board_id, req).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}
