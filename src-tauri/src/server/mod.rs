pub mod document;
pub mod index;
pub mod projects;
pub mod routes;
pub mod static_files;
pub mod watcher;

use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use axum_server::tls_rustls::RustlsConfig;
use std::env;
use std::fs::OpenOptions;
use std::io::Write;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::{Any, CorsLayer};

use index::DocumentIndex;
use watcher::FileWatcher;

pub fn log_to_file(msg: &str) {
    let log_path = env::temp_dir().join("org-viewer.log");
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(file, "[{}] [server] {}", timestamp, msg);
    }
}

pub struct AppState {
    pub index: Arc<RwLock<DocumentIndex>>,
    pub org_root: PathBuf,
    pub start_time: std::time::Instant,
    pub ws_tx: broadcast::Sender<String>,
}

/// WebSocket upgrade handler
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    log_to_file("[ws] Client connecting...");
    ws.on_upgrade(move |socket| handle_ws_connection(socket, state))
}

/// Handle an individual WebSocket connection
async fn handle_ws_connection(mut socket: WebSocket, state: Arc<AppState>) {
    log_to_file("[ws] Client connected");
    let mut rx = state.ws_tx.subscribe();

    loop {
        tokio::select! {
            // Forward broadcast messages to this client
            msg = rx.recv() => {
                match msg {
                    Ok(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            log_to_file("[ws] Client disconnected (send failed)");
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        log_to_file(&format!("[ws] Client lagged by {} messages", n));
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        log_to_file("[ws] Broadcast channel closed");
                        break;
                    }
                }
            }
            // Handle incoming messages from client (ping/pong, close)
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => {
                        log_to_file("[ws] Client disconnected");
                        break;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    Some(Ok(_)) => {
                        // Ignore other messages
                    }
                    Some(Err(e)) => {
                        log_to_file(&format!("[ws] Client error: {}", e));
                        break;
                    }
                }
            }
        }
    }
}

pub async fn start_server(org_root: PathBuf, port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    log_to_file(&format!("start_server called with org_root={:?}, port={}", org_root, port));

    // Install rustls crypto provider (required before any TLS operations)
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let start_time = std::time::Instant::now();

    // Load index from cache or build incrementally
    log_to_file("Loading document index...");
    let mut index = DocumentIndex::new(&org_root);
    let (total, cached, parsed, removed) = index.load_or_build().await;
    log_to_file(&format!(
        "Index loaded: {} total ({} cached, {} parsed, {} removed)",
        total, cached, parsed, removed
    ));

    // Create broadcast channel for WebSocket live reload
    let (ws_tx, _) = broadcast::channel::<String>(64);

    let state = Arc::new(AppState {
        index: Arc::new(RwLock::new(index)),
        org_root: org_root.clone(),
        start_time,
        ws_tx,
    });

    // Start file watcher
    log_to_file("Starting file watcher...");
    let watcher_state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = FileWatcher::watch(watcher_state).await {
            log_to_file(&format!("File watcher error: {}", e));
        }
    });

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build router — API routes first, then static file fallback
    let app = Router::new()
        .route("/api/health", get(routes::health))
        .route("/api/status", get(routes::status))
        .route("/api/files", get(routes::list_files))
        .route("/api/files/{*path}", get(routes::get_file).put(routes::put_file))
        .route("/api/search", get(routes::search))
        .route("/api/graph", get(routes::graph))
        .route("/api/projects", get(projects::list_projects))
        .route("/api/projects/{name}/tree", get(projects::get_tree))
        .route("/api/projects/{name}/file/{*path}", get(projects::get_file).put(projects::put_file))
        .route("/api/debug-log", post(routes::debug_log))
        .route("/ws", get(ws_handler))
        // Static file serving (embedded client dist) — enables remote/Tailscale access
        .fallback(static_files::static_handler)
        .layer(cors)
        .with_state(state);

    log_to_file("File watcher spawned, now binding server...");

    // Check for TLS certificates (for Tailscale HTTPS access)
    let tls_cert = env::var("ORG_VIEWER_TLS_CERT").ok();
    let tls_key = env::var("ORG_VIEWER_TLS_KEY").ok();

    match (&tls_cert, &tls_key) {
        (Some(cert_path), Some(key_path)) => {
            // Dual-listener mode: HTTP on localhost (for Tauri WebView) + HTTPS on 0.0.0.0 (for Tailscale)
            log_to_file(&format!("TLS enabled: cert={}, key={}", cert_path, key_path));

            let config = match RustlsConfig::from_pem_file(cert_path, key_path).await {
                Ok(c) => c,
                Err(e) => {
                    log_to_file(&format!("FAILED to load TLS certs: {}", e));
                    log_to_file("Hint: Run 'tailscale cert <your-hostname>' to generate certs");
                    return Err(e.into());
                }
            };

            // Spawn HTTP listener on localhost only (for Tauri WebView IPC)
            let local_addr = SocketAddr::from(([127, 0, 0, 1], port));
            let local_app = app.clone();
            tokio::spawn(async move {
                match tokio::net::TcpListener::bind(local_addr).await {
                    Ok(listener) => {
                        log_to_file(&format!("SUCCESS: HTTP listener on http://{} (WebView)", local_addr));
                        if let Err(e) = axum::serve(listener, local_app).await {
                            log_to_file(&format!("HTTP serve error: {}", e));
                        }
                    }
                    Err(e) => {
                        log_to_file(&format!("FAILED to bind HTTP on {}: {}", local_addr, e));
                    }
                }
            });

            // HTTPS listener on 0.0.0.0 (for Tailscale/remote access)
            // Use port+1 to avoid conflict with the localhost HTTP listener
            let tls_port = port + 1;
            let tls_addr = SocketAddr::from(([0, 0, 0, 0], tls_port));
            log_to_file(&format!("SUCCESS: HTTPS listener on https://0.0.0.0:{} (Tailscale)", tls_port));

            if let Err(e) = axum_server::bind_rustls(tls_addr, config)
                .serve(app.into_make_service())
                .await
            {
                log_to_file(&format!("Axum TLS serve error: {}", e));
                return Err(e.into());
            }
        }
        _ => {
            if tls_cert.is_some() || tls_key.is_some() {
                log_to_file("WARNING: Both ORG_VIEWER_TLS_CERT and ORG_VIEWER_TLS_KEY must be set for TLS. Falling back to HTTP.");
            }

            // Single HTTP listener on 0.0.0.0 (no TLS)
            let addr = SocketAddr::from(([0, 0, 0, 0], port));
            log_to_file(&format!("Attempting to bind to http://{}", addr));

            let listener = match tokio::net::TcpListener::bind(addr).await {
                Ok(l) => {
                    log_to_file(&format!("SUCCESS: Server listening on http://{}", addr));
                    l
                }
                Err(e) => {
                    log_to_file(&format!("FAILED to bind: {}", e));
                    return Err(e.into());
                }
            };

            log_to_file("Starting axum serve loop...");
            if let Err(e) = axum::serve(listener, app).await {
                log_to_file(&format!("Axum serve error: {}", e));
                return Err(e.into());
            }
        }
    }

    log_to_file("Server shut down normally");
    Ok(())
}
