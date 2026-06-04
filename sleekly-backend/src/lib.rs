pub mod db;
pub mod errors;
pub mod routes;
pub mod state;
pub mod domain;
pub mod infrastructure;

use axum::{Router, http::Method};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use std::net::SocketAddr;
use state::AppState;

pub async fn init_app_state(
    database_url: &str,
    jwt_secret: String,
    media_dir: String,
) -> anyhow::Result<AppState> {
    // Connect to database
    let db_pool = db::create_pool(database_url).await?;
    db::run_migrations(&db_pool).await?;

    // Build app state
    let state = AppState::new(db_pool, jwt_secret, media_dir);
    Ok(state)
}

pub async fn start_axum_server(state: AppState) -> anyhow::Result<()> {
    // CORS configuration for both local web development and native Tauri app origins
    let origins = [
        "http://localhost:3000".parse::<axum::http::HeaderValue>().unwrap(),
        "tauri://localhost".parse::<axum::http::HeaderValue>().unwrap(),
        "http://tauri.localhost".parse::<axum::http::HeaderValue>().unwrap(),
    ];

    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            axum::http::header::CONTENT_TYPE,
            axum::http::header::AUTHORIZATION,
            axum::http::header::ACCEPT,
        ])
        .allow_credentials(true);

    // Routes
    let app = Router::new()
        .nest("/api", routes::api_router())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(axum::extract::DefaultBodyLimit::disable())
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!("Sleekly backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
