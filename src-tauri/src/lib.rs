use serde::Deserialize;
use serde_json::Value;
use std::{
  env,
  io::{BufRead, BufReader, Read},
  path::{Path, PathBuf},
  process::{Command, Stdio},
};
use tauri::{AppHandle, Emitter, Manager, Window};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DownloadPayload {
  download_id: Option<String>,
  url: String,
  output_dir: String,
  quality: Option<String>,
  referer: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapturedMediaDownloadPayload {
  url: String,
  output_dir: String,
  referer: Option<String>,
}

fn project_root() -> PathBuf {
  Path::new(env!("CARGO_MANIFEST_DIR"))
    .parent()
    .expect("src-tauri must live inside the project root")
    .to_path_buf()
}

fn packaged_backend(handle: &AppHandle) -> Option<PathBuf> {
  let name = if cfg!(windows) { "downloader.exe" } else { "downloader" };
  let path = handle.path().resource_dir().ok()?.join("backend").join(name);

  path.exists().then_some(path)
}

fn python() -> Result<(String, Vec<String>), String> {
  let root = project_root();
  let mut candidates: Vec<(String, Vec<String>)> = Vec::new();

  if let Ok(path) = env::var("PYTHON_PATH") {
    if !path.trim().is_empty() {
      candidates.push((path, Vec::new()));
    }
  }

  for dir in ["venv", ".venv"] {
    let exe = root
      .join(dir)
      .join(if cfg!(windows) { "Scripts" } else { "bin" })
      .join(if cfg!(windows) { "python.exe" } else { "python" });

    if exe.exists() {
      candidates.push((exe.to_string_lossy().into_owned(), Vec::new()));
    }
  }

  if cfg!(windows) {
    candidates.extend([
      ("py".to_string(), vec!["-3".to_string()]),
      ("python".to_string(), Vec::new()),
    ]);
  } else {
    candidates.extend([
      ("python3".to_string(), Vec::new()),
      ("python".to_string(), Vec::new()),
    ]);
  }

  candidates
    .into_iter()
    .find(|(command, args)| {
      Command::new(command)
        .args(args)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
    })
    .ok_or_else(|| "Python 3 was not found. Install python3 or set PYTHON_PATH.".to_string())
}

fn backend_command(handle: &AppHandle) -> Result<Command, String> {
  if let Some(path) = packaged_backend(handle) {
    return Ok(Command::new(path));
  }

  let (command, mut args) = python()?;
  args.push(
    project_root()
      .join("backend")
      .join("downloader.py")
      .to_string_lossy()
      .into_owned(),
  );

  let mut process = Command::new(command);
  process.args(args);
  Ok(process)
}

fn non_empty(value: &str, message: &str) -> Result<String, String> {
  match value.trim() {
    "" => Err(message.to_string()),
    text => Ok(text.to_string()),
  }
}

fn run_backend(
  handle: &AppHandle,
  window: Option<&Window>,
  args: Vec<String>,
  download_id: Option<&str>,
) -> Result<Value, String> {
  let mut child = backend_command(handle)?
    .args(args)
    .current_dir(project_root())
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|error| format!("Could not start downloader backend: {error}"))?;

  let stdout = child.stdout.take().ok_or("Could not read downloader output.")?;
  let stderr = child.stderr.take().ok_or("Could not read downloader errors.")?;
  let stderr_handle = std::thread::spawn(move || {
    let mut output = String::new();
    let _ = BufReader::new(stderr).read_to_string(&mut output);
    output
  });

  let mut result = None;
  let mut last_bad_line = None;

  for line in BufReader::new(stdout).lines() {
    let line = line.map_err(|error| format!("Could not read downloader output: {error}"))?;
    let Ok(message) = serde_json::from_str::<Value>(line.trim()) else {
      last_bad_line = Some(line);
      continue;
    };

    match message.get("type").and_then(Value::as_str) {
      Some("progress") => {
        let Some(mut progress) = message.get("data").cloned() else {
          continue;
        };

        if let (Some(id), Value::Object(object)) = (download_id, &mut progress) {
          object.insert("downloadId".to_string(), Value::String(id.to_string()));
        }

        if let Some(window) = window {
          let _ = window.emit("download-progress", progress);
        }
      }
      Some("error") => {
        return Err(message
          .get("error")
          .and_then(Value::as_str)
          .unwrap_or("Downloader failed.")
          .to_string());
      }
      Some("info" | "search" | "complete") => result = message.get("data").cloned(),
      _ => {}
    }
  }

  let status = child
    .wait()
    .map_err(|error| format!("Could not wait for downloader backend: {error}"))?;
  let stderr = stderr_handle.join().unwrap_or_default();

  if !status.success() {
    let message = stderr.trim();
    return Err(if message.is_empty() {
      format!("Downloader process exited with code {:?}.", status.code())
    } else {
      message.to_string()
    });
  }

  result.ok_or_else(|| last_bad_line.unwrap_or_else(|| "Downloader did not return a result.".to_string()))
}

async fn run_backend_async(
  handle: AppHandle,
  window: Option<Window>,
  args: Vec<String>,
  download_id: Option<String>,
) -> Result<Value, String> {
  tauri::async_runtime::spawn_blocking(move || {
    run_backend(&handle, window.as_ref(), args, download_id.as_deref())
  })
  .await
  .map_err(|error| format!("Downloader task failed: {error}"))?
}

#[tauri::command]
async fn fetch_video_info(handle: AppHandle, url: String) -> Result<Value, String> {
  run_backend_async(
    handle,
    None,
    vec!["info".to_string(), non_empty(&url, "A video URL is required.")?],
    None,
  )
  .await
}

#[tauri::command]
async fn search_videos(handle: AppHandle, query: String) -> Result<Value, String> {
  run_backend_async(
    handle,
    None,
    vec!["search".to_string(), non_empty(&query, "A search term is required.")?],
    None,
  )
  .await
}

#[tauri::command]
async fn inspect_media_url(handle: AppHandle, url: String) -> Result<Value, String> {
  run_backend_async(
    handle,
    None,
    vec!["inspect-media".to_string(), non_empty(&url, "A URL is required.")?],
    None,
  )
  .await
}

#[tauri::command]
async fn download_video(handle: AppHandle, window: Window, payload: DownloadPayload) -> Result<Value, String> {
  let download_id = payload
    .download_id
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(ToOwned::to_owned);

  let mut result = run_backend_async(
    handle,
    Some(window),
    vec![
      "download".to_string(),
      non_empty(&payload.url, "A video URL is required.")?,
      non_empty(&payload.output_dir, "Choose a download folder first.")?,
      payload.quality.unwrap_or_else(|| "best".to_string()),
      payload.referer.unwrap_or_default(),
    ],
    download_id.clone(),
  )
  .await?;

  if let (Some(id), Value::Object(object)) = (download_id, &mut result) {
    object.insert("downloadId".to_string(), Value::String(id));
  }

  Ok(result)
}

#[tauri::command]
async fn download_captured_media(
  handle: AppHandle,
  window: Window,
  payload: CapturedMediaDownloadPayload,
) -> Result<Value, String> {
  run_backend_async(
    handle,
    Some(window),
    vec![
      "download".to_string(),
      non_empty(&payload.url, "A media URL is required.")?,
      non_empty(&payload.output_dir, "Choose a download folder first.")?,
      "best".to_string(),
      payload.referer.unwrap_or_default(),
    ],
    None,
  )
  .await
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      fetch_video_info,
      search_videos,
      inspect_media_url,
      download_video,
      download_captured_media
    ])
    .run(tauri::generate_context!())
    .expect("error while running DexuX Downloader");
}
