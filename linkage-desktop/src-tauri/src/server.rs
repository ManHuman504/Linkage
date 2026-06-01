use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json},
    routing::{get, post},
    Extension, Router,
};
use axum_macros::debug_handler;
use enigo::{Enigo, Key, Keyboard, Settings};
use serde::{Deserialize, Serialize};
use serde_json::json;
use socketioxide::{
    extract::{Data, SocketRef},
    SocketIo,
};
use std::{
    collections::HashSet,
    fs,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    pub pin: String,
    pub trusted_devices: HashSet<String>,
    #[serde(default = "default_true")]
    pub minimize_to_tray: bool,
}

fn default_true() -> bool {
    true
}

pub struct AppState {
    pub config: Mutex<Config>,
    pub shared_dir: PathBuf,
    pub downloads_dir: PathBuf,
    pub enigo: Mutex<Enigo>,
    pub clipboard_content: Mutex<String>,
}

pub async fn start_server(app_handle: AppHandle) {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).unwrap();
    }
    let config_path = app_dir.join("config.json");
    let shared_dir = app_dir.join("shared");
    let downloads_dir = dirs::download_dir()
        .unwrap_or_else(|| app_dir.clone())
        .join("Linkage");

    if !shared_dir.exists() {
        fs::create_dir_all(&shared_dir).unwrap();
    }
    if !downloads_dir.exists() {
        fs::create_dir_all(&downloads_dir).unwrap();
    }

    let config = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap();
        serde_json::from_str(&content).unwrap_or_else(|_| Config {
            pin: format!("{:04}", rand::random::<u16>() % 10000),
            trusted_devices: HashSet::new(),
            minimize_to_tray: true,
        })
    } else {
        let new_config = Config {
            pin: format!("{:04}", rand::random::<u16>() % 10000),
            trusted_devices: HashSet::new(),
            minimize_to_tray: true,
        };
        fs::write(
            &config_path,
            serde_json::to_string_pretty(&new_config).unwrap(),
        )
        .unwrap();
        new_config
    };

    let state = Arc::new(AppState {
        config: Mutex::new(config),
        shared_dir,
        downloads_dir,
        enigo: Mutex::new(Enigo::new(&Settings::default()).unwrap()),
        clipboard_content: Mutex::new(String::new()),
    });

    let state_fs = state.clone();
    let app_handle_fs = app_handle.clone();

    let (layer, io) = SocketIo::new_layer();

    let app_handle_for_io = app_handle.clone();
    io.ns("/", move |socket: SocketRef| {
        let state_auth = state.clone();
        let app_handle_auth = app_handle_for_io.clone();

        socket.on(
            "authenticate",
            move |socket: SocketRef, Data::<AuthData>(data)| {
                let config = state_auth.config.lock().unwrap();
                if config.trusted_devices.contains(&data.device_id) {
                    let _ = socket.join("trusted");
                    let _ = socket.emit("authenticated", &json!({ "success": true }));
                    let _ = app_handle_auth.emit(
                        "device-connected",
                        json!({ "deviceId": data.device_id }),
                    );
                } else {
                    let _ = socket.emit("require-pin", &());
                }
            },
        );

        let state_pin = state.clone();
        let app_handle_pin = app_handle_for_io.clone();
        socket.on(
            "verify-pin",
            move |socket: SocketRef, Data::<PinData>(data)| {
                let mut config = state_pin.config.lock().unwrap();
                if data.pin == config.pin {
                    config.trusted_devices.insert(data.device_id.clone());
                    let app_dir = app_handle_pin.path().app_data_dir().unwrap();
                    let config_path = app_dir.join("config.json");
                    fs::write(
                        &config_path,
                        serde_json::to_string_pretty(&*config).unwrap(),
                    )
                    .unwrap();
                    let _ = socket.join("trusted");
                    let _ = socket.emit("authenticated", &json!({ "success": true }));
                    let _ = app_handle_pin.emit(
                        "device-connected",
                        json!({ "deviceId": data.device_id }),
                    );
                } else {
                    let _ = socket.emit("pin-error", &());
                }
            },
        );

        let state_text = state.clone();
        socket.on("text-input", move |_: SocketRef, Data::<TextData>(data)| {
            let mut enigo = state_text.enigo.lock().unwrap();
            let _ = enigo.text(&data.text);
        });

        let state_key = state.clone();
        socket.on("special-key", move |_: SocketRef, Data::<KeyData>(data)| {
            let mut enigo = state_key.enigo.lock().unwrap();
            match data.key.as_str() {
                "ENTER" => {
                    let _ = enigo.key(Key::Return, enigo::Direction::Click);
                }
                "BACKSPACE" => {
                    for _ in 0..data.count.unwrap_or(1) {
                        let _ = enigo.key(Key::Backspace, enigo::Direction::Click);
                    }
                }
                "SPACE" => {
                    let _ = enigo.key(Key::Space, enigo::Direction::Click);
                }
                _ => {}
            }
        });

        let state_clipboard_update = state.clone();
        let app_handle_clip = app_handle_for_io.clone();
        socket.on(
            "clipboard-update",
            move |socket: SocketRef, Data::<ClipboardData>(data)| {
                let mut clipboard = state_clipboard_update.clipboard_content.lock().unwrap();
                *clipboard = data.content.clone();
                let _ = socket
                    .broadcast()
                    .to("trusted")
                    .emit("clipboard-updated", &(*clipboard));
                let _ = app_handle_clip.emit("clipboard-updated-on-pc", &data.content);
            },
        );

        let state_clipboard_get = state.clone();
        socket.on("clipboard-get", move |socket: SocketRef, _: Data<()>| {
            let clipboard = state_clipboard_get.clipboard_content.lock().unwrap();
            let _ = socket.emit("clipboard-updated", &(*clipboard));
        });
    });

    let frontend_dir = if cfg!(debug_assertions) {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist")
    } else {
        app_handle_fs.path().app_data_dir().unwrap().join("dist")
    };

    let app = Router::new()
        .route("/upload", post(upload_file))
        .route("/files", get(list_files))
        .nest_service("/download", ServeDir::new(state_fs.shared_dir.clone()))
        .fallback_service(
            ServeDir::new(&frontend_dir).fallback(tower_http::services::ServeFile::new(
                frontend_dir.join("index.html"),
            )),
        )
        .layer(layer)
        .layer(CorsLayer::permissive())
        .layer(Extension(app_handle_fs))
        .with_state(state_fs);

    let mut port = 3000;
    let mut listener = None;

    // Try binding to 3000, then fallback to 3001-3010 if needed
    for p in 3000..3011 {
        let addr = SocketAddr::from(([0, 0, 0, 0], p));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => {
                listener = Some(l);
                port = p;
                break;
            }
            Err(_) => continue,
        }
    }

    if let Some(listener) = listener {
        println!("🚀 Linkage Server running on http://0.0.0.0:{}", port);
        // Update state with the actual port used
        {
            let port_state = app_handle.state::<Arc<Mutex<u16>>>();
            let mut server_port = port_state.lock().unwrap();
            *server_port = port;
        }
        axum::serve(listener, app).await.unwrap();
    } else {
        eprintln!("❌ CRITICAL: Could not bind to any port in range 3000-3010. Is another instance running?");
    }
}

#[derive(Deserialize)]
struct AuthData {
    device_id: String,
}
#[derive(Deserialize)]
struct PinData {
    device_id: String,
    pin: String,
}
#[derive(Deserialize)]
struct TextData {
    text: String,
}
#[derive(Deserialize)]
struct KeyData {
    key: String,
    count: Option<usize>,
}
#[derive(Deserialize)]
struct ClipboardData {
    content: String,
}

#[debug_handler]
async fn upload_file(
    State(state): State<Arc<AppState>>,
    Extension(app_handle): Extension<AppHandle>,
    headers: HeaderMap,
    mut multipart: axum::extract::Multipart,
) -> impl IntoResponse {
    let is_phone = headers.get("x-client-type").and_then(|h| h.to_str().ok()) == Some("phone");
    let target_dir = if is_phone {
        &state.downloads_dir
    } else {
        &state.shared_dir
    };

    while let Some(field) = multipart.next_field().await.unwrap() {
        if field.name().unwrap_or("") == "file" {
            let filename = field.file_name().unwrap_or("unknown_file").to_string();
            let data = field.bytes().await.unwrap();
            let path = target_dir.join(&filename);
            let mut file = File::create(path).await.unwrap();
            file.write_all(&data).await.unwrap();

            if is_phone {
                let _ = app_handle.emit("file-received", &filename);
            }
        }
    }
    StatusCode::OK
}

#[debug_handler]
async fn list_files(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let mut files = vec![];
    if let Ok(entries) = fs::read_dir(&state.shared_dir) {
        for entry in entries.flatten() {
            if let Some(filename) = entry.file_name().to_str() {
                files.push(filename.to_string());
            }
        }
    }
    Json(json!({ "files": files }))
}
