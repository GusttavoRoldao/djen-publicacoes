use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{sqlite::SqliteConnectOptions, Connection, SqliteConnection};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_sql::{Migration, MigrationKind};

const TRAY_ID: &str = "monitoring";

#[derive(Default)]
struct RuntimeState {
    monitoring: AtomicBool,
}

#[derive(Deserialize)]
struct SqlOperation {
    query: String,
    #[serde(default)]
    values: Vec<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SqlOperationResult {
    rows_affected: u64,
    last_insert_id: i64,
}

#[derive(Debug, PartialEq)]
enum CloseAction {
    Exit,
    Hide,
}

#[derive(Debug, PartialEq)]
enum AutostartAction {
    Keep,
    Enable,
    Disable,
}

fn close_action(monitoring: bool) -> CloseAction {
    if monitoring {
        CloseAction::Hide
    } else {
        CloseAction::Exit
    }
}

fn autostart_action(enabled: bool, current: bool) -> AutostartAction {
    match (enabled, current) {
        (true, false) => AutostartAction::Enable,
        (false, true) => AutostartAction::Disable,
        _ => AutostartAction::Keep,
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn configure_monitoring(
    app: AppHandle,
    state: State<RuntimeState>,
    enabled: bool,
) -> Result<(), String> {
    let previous = state.monitoring.load(Ordering::Relaxed);
    let tray = app.tray_by_id(TRAY_ID);
    if let Some(tray) = &tray {
        tray.set_visible(enabled)
            .map_err(|error| error.to_string())?;
    }

    let autostart = app.autolaunch();
    let result = autostart
        .is_enabled()
        .and_then(|current| match autostart_action(enabled, current) {
            AutostartAction::Keep => Ok(()),
            AutostartAction::Enable => autostart.enable(),
            AutostartAction::Disable => autostart.disable(),
        })
        .map_err(|error| error.to_string());

    if let Err(error) = result {
        if let Some(tray) = tray {
            let _ = tray.set_visible(previous);
        }
        return Err(error);
    }
    state.monitoring.store(enabled, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn exit_completely(app: AppHandle) {
    app.exit(0);
}

const KEYRING_SERVICE: &str = "br.com.djenpublicacoes.desktop";

/// O segredo de um provedor vive no cofre do sistema, nunca no SQLite nem no WebView.
fn secret_entry(provider: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, provider).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_provider_secret(provider: String, secret: String) -> Result<(), String> {
    secret_entry(&provider)?
        .set_password(&secret)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_provider_secret(provider: String) -> Result<(), String> {
    match secret_entry(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn has_provider_secret(provider: String) -> Result<bool, String> {
    match secret_entry(&provider)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestRequest {
    provider: String,
    url: String,
    method: String,
    #[serde(default)]
    headers: Vec<(String, String)>,
    /// none, header-key, query-key ou bearer.
    auth_mode: String,
    #[serde(default)]
    auth_name: Option<String>,
    timeout_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RestResponse {
    status: u16,
    body: String,
    retry_after: Option<u64>,
}

/// Remove o segredo de qualquer texto que possa chegar à interface ou a um log.
fn redact(message: String, secret: Option<&str>) -> String {
    match secret {
        Some(value) if !value.is_empty() => message.replace(value, "[chave protegida]"),
        _ => message,
    }
}

/// A requisição sai do processo nativo: a chave nunca entra no WebView.
#[tauri::command]
async fn rest_request(request: RestRequest) -> Result<RestResponse, String> {
    let secret = match request.auth_mode.as_str() {
        "none" => None,
        _ => Some(
            secret_entry(&request.provider)?
                .get_password()
                .map_err(|_| {
                    "A chave desta fonte não foi encontrada no cofre do sistema.".to_string()
                })?,
        ),
    };

    let mut url = reqwest::Url::parse(&request.url)
        .map_err(|_| "Endereço inválido para a fonte.".to_string())?;
    if url.scheme() != "https"
        && url.host_str() != Some("127.0.0.1")
        && url.host_str() != Some("localhost")
    {
        return Err("A fonte precisa usar HTTPS.".to_string());
    }
    if request.auth_mode == "query-key" {
        let name = request
            .auth_name
            .clone()
            .unwrap_or_else(|| "api_key".to_string());
        url.query_pairs_mut()
            .append_pair(&name, secret.as_deref().unwrap_or_default());
    }

    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|_| "Método HTTP inválido.".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(request.timeout_ms))
        .build()
        .map_err(|error| redact(error.to_string(), secret.as_deref()))?;

    let mut builder = client
        .request(method, url)
        .header("Accept", "application/json");
    for (name, value) in &request.headers {
        builder = builder.header(name, value);
    }
    match request.auth_mode.as_str() {
        "bearer" => {
            builder = builder.bearer_auth(secret.as_deref().unwrap_or_default());
        }
        "header-key" => {
            let name = request
                .auth_name
                .clone()
                .unwrap_or_else(|| "X-Api-Key".to_string());
            builder = builder.header(name, secret.as_deref().unwrap_or_default());
        }
        _ => {}
    }

    let response = builder
        .send()
        .await
        .map_err(|error| redact(error.to_string(), secret.as_deref()))?;
    let status = response.status().as_u16();
    let retry_after = response
        .headers()
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok());
    let body = response
        .text()
        .await
        .map_err(|error| redact(error.to_string(), secret.as_deref()))?;

    Ok(RestResponse {
        status,
        body: redact(body, secret.as_deref()),
        retry_after,
    })
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("djen-publicacoes.db"))
}

/// Grava o arquivo escolhido pelo usuário na janela de salvamento do sistema.
/// O BOM permite que o Excel reconheça os acentos sem configuração.
#[tauri::command]
fn write_export(path: String, contents: String) -> Result<(), String> {
    let mut bytes = Vec::with_capacity(contents.len() + 3);
    bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    bytes.extend_from_slice(contents.as_bytes());
    std::fs::write(PathBuf::from(path), bytes).map_err(|error| error.to_string())
}

/// Grava um arquivo binário, como a planilha do Excel.
/// O conteúdo chega em base64 porque a ponte com a interface transporta texto.
#[tauri::command]
fn write_export_binary(path: String, contents: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents)
        .map_err(|_| "O conteúdo do arquivo chegou corrompido.".to_string())?;
    std::fs::write(PathBuf::from(path), bytes).map_err(|error| error.to_string())
}

/// Soma o arquivo principal e os auxiliares do WAL, que também ocupam espaço em disco.
#[tauri::command]
fn database_size(app: AppHandle) -> Result<u64, String> {
    let base = database_path(&app)?;
    let mut total = 0;
    for suffix in ["", "-wal", "-shm"] {
        let mut name = base.clone().into_os_string();
        name.push(suffix);
        if let Ok(metadata) = std::fs::metadata(PathBuf::from(name)) {
            total += metadata.len();
        }
    }
    Ok(total)
}

/// `VACUUM` não roda dentro de transação, por isso usa uma conexão própria.
#[tauri::command]
async fn compact_database(app: AppHandle) -> Result<u64, String> {
    let options = SqliteConnectOptions::new().filename(database_path(&app)?);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| error.to_string())?;
    let result = sqlx::query("VACUUM").execute(&mut connection).await;
    let _ = connection.close().await;
    result.map_err(|error| error.to_string())?;
    database_size(app)
}

#[tauri::command]
async fn execute_transaction(
    app: AppHandle,
    operations: Vec<SqlOperation>,
) -> Result<Vec<SqlOperationResult>, String> {
    let options = SqliteConnectOptions::new()
        .filename(database_path(&app)?)
        .foreign_keys(true);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| error.to_string())?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| error.to_string())?;
    let mut results = Vec::with_capacity(operations.len());

    for operation in operations {
        let mut query = sqlx::query(&operation.query);
        for value in operation.values {
            query = match value {
                Value::Null => query.bind(None::<String>),
                Value::String(value) => query.bind(value),
                Value::Number(value) => query.bind(value.as_f64().unwrap_or_default()),
                value => query.bind(value.to_string()),
            };
        }
        let result = query
            .execute(&mut *transaction)
            .await
            .map_err(|error| error.to_string())?;
        results.push(SqlOperationResult {
            rows_affected: result.rows_affected(),
            last_insert_id: result.last_insert_rowid(),
        });
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(results)
}

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_app_settings",
            sql: include_str!("../migrations/1_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_attorney_profiles",
            sql: include_str!("../migrations/2_attorney_profiles.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_manual_searches",
            sql: include_str!("../migrations/3_manual_searches.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_monitoring_schedule",
            sql: include_str!("../migrations/4_monitoring.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_publication_reviews",
            sql: include_str!("../migrations/5_publication_review.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_storage_limit",
            sql: include_str!("../migrations/6_storage.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_providers",
            sql: include_str!("../migrations/7_providers.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main_window(app);
        }))
        .manage(RuntimeState::default())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:djen-publicacoes.db", migrations())
                .build(),
        )
        .setup(|app| {
            app.handle().plugin(tauri_plugin_autostart::init(
                MacosLauncher::LaunchAgent,
                Some(vec!["--minimized"]),
            ))?;

            let open = MenuItem::with_id(app, "open", "Abrir", true, None::<&str>)?;
            let search_now =
                MenuItem::with_id(app, "search_now", "Pesquisar agora", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Pausar", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "exit", "Sair completamente", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &search_now, &pause, &exit])?;

            let tray = TrayIconBuilder::with_id(TRAY_ID)
                .icon(
                    app.default_window_icon()
                        .expect("ícone do aplicativo")
                        .clone(),
                )
                .tooltip("DJEN Publicações")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "search_now" => {
                        let _ = app.emit("monitor-search-now", ());
                    }
                    "pause" => {
                        let _ = app.emit("monitor-pause", ());
                    }
                    "exit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            tray.set_visible(false)?;

            if std::env::args().any(|argument| argument == "--minimized") {
                if let Some(window) = app.get_webview_window("main") {
                    window.hide()?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            configure_monitoring,
            exit_completely,
            execute_transaction,
            database_size,
            compact_database,
            save_provider_secret,
            delete_provider_secret,
            has_provider_secret,
            rest_request,
            write_export,
            write_export_binary
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<RuntimeState>();
                if close_action(state.monitoring.load(Ordering::Relaxed)) == CloseAction::Hide {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("falha ao executar o aplicativo");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_exits_when_monitoring_is_disabled() {
        assert_eq!(close_action(false), CloseAction::Exit);
    }

    #[test]
    fn close_hides_when_monitoring_is_enabled() {
        assert_eq!(close_action(true), CloseAction::Hide);
    }

    #[test]
    fn missing_autostart_stays_disabled_without_removal() {
        assert_eq!(autostart_action(false, false), AutostartAction::Keep);
    }
}
