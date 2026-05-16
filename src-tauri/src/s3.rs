use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use walkdir::WalkDir;

use aws_credential_types::Credentials;
use aws_sdk_s3::config::{BehaviorVersion, Region};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::{Client, Config};
use filetime::FileTime;

use crate::chat::{load_config, save_config, AppConfig, S3WorkspaceConfig};
use crate::fs::{s3_cache_root, FsError};

const MTIME_TOLERANCE_SECS: i64 = 2;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub pulled: usize,
    pub pushed: usize,
    pub skipped: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

fn normalize_prefix(prefix: &str) -> String {
    let trimmed = prefix.trim().trim_matches('/');
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{trimmed}/")
    }
}

fn build_client(s3: &S3WorkspaceConfig) -> Client {
    let creds = Credentials::new(
        s3.access_key.clone(),
        s3.secret_key.clone(),
        None,
        None,
        "thebooks-static",
    );
    let region = Region::new(s3.region.clone());
    let cfg = Config::builder()
        .behavior_version(BehaviorVersion::latest())
        .region(region)
        .credentials_provider(creds)
        .build();
    Client::from_conf(cfg)
}

fn local_mtime_secs(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn set_local_mtime(path: &Path, secs: i64) {
    let ft = FileTime::from_unix_time(secs, 0);
    let _ = filetime::set_file_mtime(path, ft);
}

fn key_to_rel(key: &str, prefix: &str) -> Option<String> {
    let rel = key.strip_prefix(prefix)?;
    if rel.is_empty() || rel.ends_with('/') {
        return None;
    }
    Some(rel.to_string())
}

fn rel_to_key(rel: &str, prefix: &str) -> String {
    format!("{prefix}{rel}")
}

fn walk_local(root: &Path) -> Vec<(String, i64)> {
    let mut out = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if name.starts_with('.') {
            continue;
        }
        if let Ok(rel) = path.strip_prefix(root) {
            let rel_str = rel
                .components()
                .filter_map(|c| c.as_os_str().to_str())
                .collect::<Vec<_>>()
                .join("/");
            if rel_str.is_empty() {
                continue;
            }
            out.push((rel_str, local_mtime_secs(path)));
        }
    }
    out
}

async fn list_s3(client: &Client, bucket: &str, prefix: &str) -> Result<Vec<(String, i64)>, String> {
    let mut out = Vec::new();
    let mut continuation: Option<String> = None;
    loop {
        let mut req = client.list_objects_v2().bucket(bucket).prefix(prefix);
        if let Some(token) = continuation.as_ref() {
            req = req.continuation_token(token);
        }
        let resp = req.send().await.map_err(|e| format!("list_objects_v2: {e}"))?;
        for obj in resp.contents() {
            if let (Some(key), Some(modified)) = (obj.key(), obj.last_modified()) {
                out.push((key.to_string(), modified.secs()));
            }
        }
        if resp.is_truncated().unwrap_or(false) {
            continuation = resp.next_continuation_token().map(|s| s.to_string());
            if continuation.is_none() {
                break;
            }
        } else {
            break;
        }
    }
    Ok(out)
}

async fn pull_one(
    client: &Client,
    bucket: &str,
    key: &str,
    local_path: &Path,
    s3_mtime_secs: i64,
) -> Result<(), String> {
    if let Some(parent) = local_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let resp = client
        .get_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|e| format!("get_object {key}: {e}"))?;
    let bytes = resp
        .body
        .collect()
        .await
        .map_err(|e| format!("body collect {key}: {e}"))?
        .into_bytes();
    fs::write(local_path, &bytes).map_err(|e| format!("write {key}: {e}"))?;
    set_local_mtime(local_path, s3_mtime_secs);
    Ok(())
}

async fn push_one(
    client: &Client,
    bucket: &str,
    key: &str,
    local_path: &Path,
) -> Result<i64, String> {
    let body = ByteStream::from_path(local_path)
        .await
        .map_err(|e| format!("read {key}: {e}"))?;
    client
        .put_object()
        .bucket(bucket)
        .key(key)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("put_object {key}: {e}"))?;
    let head = client
        .head_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .map_err(|e| format!("head_object {key}: {e}"))?;
    let s3_mtime = head.last_modified().map(|d| d.secs()).unwrap_or_else(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    });
    set_local_mtime(local_path, s3_mtime);
    Ok(s3_mtime)
}

#[tauri::command]
pub async fn sync_workspace(app: AppHandle) -> Result<SyncResult, FsError> {
    let cfg: AppConfig =
        load_config(&app).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    let s3 = cfg
        .s3_workspace
        .as_ref()
        .ok_or_else(|| FsError::NoWorkspace)?
        .clone();
    let root: PathBuf = s3_cache_root(&app, &s3)?;
    let prefix = normalize_prefix(&s3.prefix);

    let client = build_client(&s3);

    let remote = match list_s3(&client, &s3.bucket, &prefix).await {
        Ok(v) => v,
        Err(e) => return Err(FsError::Io(format!("S3 list 실패: {e}"))),
    };
    let local = walk_local(&root);

    let mut local_map: std::collections::HashMap<String, i64> = local.into_iter().collect();
    let mut remote_map: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    for (key, m) in &remote {
        if let Some(rel) = key_to_rel(key, &prefix) {
            remote_map.insert(rel, *m);
        }
    }

    let mut result = SyncResult {
        pulled: 0,
        pushed: 0,
        skipped: 0,
        failed: 0,
        errors: Vec::new(),
    };

    let mut all_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
    for k in local_map.keys() {
        all_keys.insert(k.clone());
    }
    for k in remote_map.keys() {
        all_keys.insert(k.clone());
    }

    for rel in all_keys {
        let local_path = root.join(&rel);
        let key = rel_to_key(&rel, &prefix);
        let local_m = local_map.remove(&rel);
        let remote_m = remote_map.get(&rel).copied();

        match (local_m, remote_m) {
            (None, Some(s3_m)) => match pull_one(&client, &s3.bucket, &key, &local_path, s3_m).await {
                Ok(()) => result.pulled += 1,
                Err(e) => {
                    result.failed += 1;
                    result.errors.push(e);
                }
            },
            (Some(_), None) => match push_one(&client, &s3.bucket, &key, &local_path).await {
                Ok(_) => result.pushed += 1,
                Err(e) => {
                    result.failed += 1;
                    result.errors.push(e);
                }
            },
            (Some(l), Some(r)) => {
                if r > l + MTIME_TOLERANCE_SECS {
                    match pull_one(&client, &s3.bucket, &key, &local_path, r).await {
                        Ok(()) => result.pulled += 1,
                        Err(e) => {
                            result.failed += 1;
                            result.errors.push(e);
                        }
                    }
                } else if l > r + MTIME_TOLERANCE_SECS {
                    match push_one(&client, &s3.bucket, &key, &local_path).await {
                        Ok(_) => result.pushed += 1,
                        Err(e) => {
                            result.failed += 1;
                            result.errors.push(e);
                        }
                    }
                } else {
                    result.skipped += 1;
                }
            }
            (None, None) => {}
        }
    }

    Ok(result)
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetS3Args {
    pub bucket: String,
    #[serde(default)]
    pub prefix: String,
    pub region: String,
    pub access_key: String,
    pub secret_key: String,
}

#[tauri::command]
pub fn set_s3_workspace(app: AppHandle, args: SetS3Args) -> Result<(), FsError> {
    let mut cfg = load_config(&app).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    let bucket = args.bucket.trim().to_string();
    if bucket.is_empty() {
        return Err(FsError::InvalidPath("bucket가 비어있습니다".into()));
    }
    if args.region.trim().is_empty() {
        return Err(FsError::InvalidPath("region이 비어있습니다".into()));
    }
    if args.access_key.trim().is_empty() || args.secret_key.trim().is_empty() {
        return Err(FsError::InvalidPath("access key/secret이 비어있습니다".into()));
    }
    cfg.s3_workspace = Some(S3WorkspaceConfig {
        bucket,
        prefix: args.prefix.trim().to_string(),
        region: args.region.trim().to_string(),
        access_key: args.access_key,
        secret_key: args.secret_key,
    });
    cfg.workspace = None;
    save_config(&app, &cfg).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct S3WorkspaceInfo {
    pub bucket: String,
    pub prefix: String,
    pub region: String,
}

#[tauri::command]
pub fn get_s3_workspace(app: AppHandle) -> Result<Option<S3WorkspaceInfo>, FsError> {
    let cfg = load_config(&app).map_err(|e| FsError::Io(format!("config: {:?}", e)))?;
    Ok(cfg.s3_workspace.map(|s| S3WorkspaceInfo {
        bucket: s.bucket,
        prefix: s.prefix,
        region: s.region,
    }))
}
