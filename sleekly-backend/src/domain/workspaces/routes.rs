use axum::{
    extract::{Path, State},
    routing::{get, patch, post},
    Json, Router,
};
use uuid::Uuid;

use crate::{
    infrastructure::{auth::AuthUser, validation::ValidatedJson},
    errors::{AppError, Result},
    state::AppState,
};
use super::models::*;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tree", get(get_tree))
        .route("/folders", post(create_folder))
        .route("/folders/:id", patch(rename_folder).delete(delete_folder))
        .route("/boards", post(create_board))
        .route("/boards/:id", patch(rename_board).delete(delete_board))
}

async fn get_tree(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
) -> Result<Json<WorkspaceTree>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let tree = state.workspace_service.get_tree(uid).await?;
    Ok(Json(tree))
}

async fn create_folder(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    ValidatedJson(req): ValidatedJson<CreateFolderRequest>,
) -> Result<Json<Folder>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let folder = state.workspace_service.create_folder(uid, req).await?;
    Ok(Json(folder))
}

async fn rename_folder(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    ValidatedJson(req): ValidatedJson<RenameFolderRequest>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    state.workspace_service.rename_folder(uid, id, req).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn delete_folder(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    state.workspace_service.delete_folder(uid, id).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn create_board(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    ValidatedJson(req): ValidatedJson<CreateBoardRequest>,
) -> Result<Json<Board>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    let board = state.workspace_service.create_board(uid, req).await?;
    Ok(Json(board))
}

async fn rename_board(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    ValidatedJson(req): ValidatedJson<RenameBoardRequest>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    state.workspace_service.rename_board(uid, id, req).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}

async fn delete_board(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let uid: Uuid = claims.sub.parse().map_err(|_| AppError::Unauthorized)?;
    state.workspace_service.delete_board(uid, id).await?;
    Ok(Json(serde_json::json!({ "success": true })))
}
