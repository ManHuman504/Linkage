mod server;

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Manage port in state
            app.manage(Arc::new(Mutex::new(3000u16)));

            // Start the background server
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                server::start_server(app_handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app_handle = window.app_handle();
                let app_dir = app_handle.path().app_data_dir().unwrap();
                let config_path = app_dir.join("config.json");

                let minimize = if config_path.exists() {
                    let content = std::fs::read_to_string(&config_path).unwrap();
                    let config: server::Config =
                        serde_json::from_str(&content).unwrap_or_else(|_| server::Config {
                            pin: "0000".into(),
                            trusted_devices: std::collections::HashSet::new(),
                            minimize_to_tray: true,
                        });
                    config.minimize_to_tray
                } else {
                    true
                };

                if minimize {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_server_info,
            open_folder,
            get_pin,
            update_pin,
            clear_trusted_devices,
            get_settings,
            update_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn get_settings(app_handle: AppHandle) -> server::Config {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let config_path = app_dir.join("config.json");
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).unwrap();
        serde_json::from_str(&content).unwrap()
    } else {
        server::Config {
            pin: "0000".into(),
            trusted_devices: std::collections::HashSet::new(),
            minimize_to_tray: true,
        }
    }
}

#[tauri::command]
fn update_settings(app_handle: AppHandle, minimize: bool) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let config_path = app_dir.join("config.json");
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).unwrap();
        let mut config: server::Config = serde_json::from_str(&content).unwrap();
        config.minimize_to_tray = minimize;
        std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Config not found".into())
    }
}

#[tauri::command]
fn update_pin(app_handle: AppHandle, new_pin: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let config_path = app_dir.join("config.json");
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).unwrap();
        let mut config: server::Config = serde_json::from_str(&content).unwrap();
        config.pin = new_pin;
        std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Config not found".into())
    }
}

#[tauri::command]
fn clear_trusted_devices(app_handle: AppHandle) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let config_path = app_dir.join("config.json");
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).unwrap();
        let mut config: server::Config = serde_json::from_str(&content).unwrap();
        config.trusted_devices.clear();
        std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Config not found".into())
    }
}

#[tauri::command]
fn get_server_info(port_state: tauri::State<'_, Arc<Mutex<u16>>>) -> ServerInfo {
    let mut best_ip = String::new();
    if let Ok(network_interfaces) = local_ip_address::list_afinet_netifas() {
        for (name, ip) in network_interfaces {
            if ip.is_ipv4() && !ip.is_loopback() {
                let ip_str = ip.to_string();
                // Prioritize standard local networks over VPNs (like Radmin or Tailscale)
                if ip_str.starts_with("192.168.")
                    || ip_str.starts_with("10.")
                    || (ip_str.starts_with("172.") && !name.to_lowercase().contains("radmin"))
                {
                    best_ip = ip_str.clone();
                    break;
                }
                if best_ip.is_empty() {
                    best_ip = ip_str;
                }
            }
        }
    }
    if best_ip.is_empty() {
        best_ip = local_ip_address::local_ip()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|_| "127.0.0.1".into());
    }

    let actual_port = *port_state.lock().unwrap();

    ServerInfo {
        ip: best_ip,
        port: actual_port,
    }
}

#[tauri::command]
fn get_pin(app_handle: AppHandle) -> String {
    let app_dir = app_handle.path().app_data_dir().unwrap();
    let config_path = app_dir.join("config.json");
    if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).unwrap();
        let config: server::Config = serde_json::from_str(&content).unwrap();
        config.pin
    } else {
        "0000".into()
    }
}

#[tauri::command]
fn open_folder(_app_handle: AppHandle, path: String) {
    if path == "downloads" {
        let downloads_dir = dirs::download_dir().unwrap().join("Linkage");
        let _ = open::that(downloads_dir);
    } else {
        let _ = open::that(path);
    }
}

#[derive(serde::Serialize)]
struct ServerInfo {
    ip: String,
    port: u16,
}
