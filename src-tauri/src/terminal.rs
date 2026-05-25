use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use once_cell::sync::Lazy;
use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

static SESSIONS: Lazy<Mutex<HashMap<String, Arc<Mutex<Session>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum TerminalError {
    Spawn(String),
    Io(String),
    NotFound,
}

fn shell_program() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

#[tauri::command]
pub fn terminal_open(
    app: AppHandle,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<String, TerminalError> {
    let system = NativePtySystem::default();
    let pair = system
        .openpty(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| TerminalError::Spawn(format!("openpty: {e}")))?;

    let mut cmd = CommandBuilder::new(shell_program());
    let path = PathBuf::from(&cwd);
    if path.is_dir() {
        cmd.cwd(path);
    } else if let Some(home) = std::env::var_os("HOME") {
        cmd.cwd(PathBuf::from(home));
    }
    for (k, v) in std::env::vars_os() {
        cmd.env(k, v);
    }
    cmd.env("TERM", "xterm-256color");
    if std::env::var_os("LANG").is_none() {
        cmd.env("LANG", "en_US.UTF-8");
    }
    if std::env::var_os("LC_ALL").is_none() && std::env::var_os("LC_CTYPE").is_none() {
        cmd.env("LC_CTYPE", "UTF-8");
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| TerminalError::Spawn(format!("spawn: {e}")))?;
    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| TerminalError::Io(format!("take_writer: {e}")))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| TerminalError::Io(format!("clone_reader: {e}")))?;

    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed).to_string();

    let session = Arc::new(Mutex::new(Session {
        master: pair.master,
        writer,
        child,
    }));
    SESSIONS
        .lock()
        .unwrap()
        .insert(id.clone(), Arc::clone(&session));

    let id_for_thread = id.clone();
    let app_for_thread = app.clone();
    thread::spawn(move || {
        let output_event = format!("terminal://output/{id_for_thread}");
        let exit_event = format!("terminal://exit/{id_for_thread}");
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = app_for_thread.emit(&output_event, chunk);
                }
                Err(_) => break,
            }
        }
        let _ = app_for_thread.emit(&exit_event, ());
        SESSIONS.lock().unwrap().remove(&id_for_thread);
    });

    Ok(id)
}

#[tauri::command]
pub fn terminal_write(session_id: String, data: String) -> Result<(), TerminalError> {
    let session = {
        let map = SESSIONS.lock().unwrap();
        map.get(&session_id).map(Arc::clone)
    }
    .ok_or(TerminalError::NotFound)?;
    let mut guard = session.lock().unwrap();
    guard
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| TerminalError::Io(format!("write: {e}")))?;
    guard
        .writer
        .flush()
        .map_err(|e| TerminalError::Io(format!("flush: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), TerminalError> {
    let session = {
        let map = SESSIONS.lock().unwrap();
        map.get(&session_id).map(Arc::clone)
    }
    .ok_or(TerminalError::NotFound)?;
    let guard = session.lock().unwrap();
    guard
        .master
        .resize(PtySize {
            rows: rows.max(1),
            cols: cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| TerminalError::Io(format!("resize: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn terminal_close(session_id: String) -> Result<(), TerminalError> {
    let removed = SESSIONS.lock().unwrap().remove(&session_id);
    if let Some(session) = removed {
        let mut guard = session.lock().unwrap();
        let _ = guard.child.kill();
        let _ = guard.child.wait();
    }
    Ok(())
}
