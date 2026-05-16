use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const MODEL: &str = "claude-sonnet-4-6";
const MAX_TOKENS: u32 = 1024;
const ANTHROPIC_VERSION: &str = "2023-06-01";
const API_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const SYSTEM_PROMPT: &str = "당신은 한국어 글쓰기를 돕는 작가 비서입니다. 사용자가 쓰고 있는 글의 톤과 흐름을 존중하면서, 문장 다듬기·이어 쓸 내용 제안·맞춤법 점검·요약을 간결하게 도와주세요. 답변은 한국어로, 군더더기 없이 작성합니다.";

#[derive(Debug, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum ChatError {
    NoApiKey,
    Unauthorized,
    Network(String),
    Api(String),
}

impl From<reqwest::Error> for ChatError {
    fn from(e: reqwest::Error) -> Self {
        ChatError::Network(e.to_string())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct S3WorkspaceConfig {
    pub bucket: String,
    #[serde(default)]
    pub prefix: String,
    pub region: String,
    pub access_key: String,
    pub secret_key: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub anthropic_api_key: Option<String>,
    #[serde(default)]
    pub workspace: Option<PathBuf>,
    #[serde(default)]
    pub s3_workspace: Option<S3WorkspaceConfig>,
    #[serde(default)]
    pub migrated_v4_local: bool,
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, ChatError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| ChatError::Api(format!("config dir resolve: {e}")))?;
    fs::create_dir_all(&dir).map_err(|e| ChatError::Api(format!("config dir create: {e}")))?;
    Ok(dir.join("config.json"))
}

pub fn load_config(app: &AppHandle) -> Result<AppConfig, ChatError> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| ChatError::Api(format!("config read: {e}")))?;
    serde_json::from_str::<AppConfig>(&raw)
        .map_err(|e| ChatError::Api(format!("config parse: {e}")))
}

pub fn save_config(app: &AppHandle, cfg: &AppConfig) -> Result<(), ChatError> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(cfg)
        .map_err(|e| ChatError::Api(format!("config encode: {e}")))?;
    fs::write(&path, raw).map_err(|e| ChatError::Api(format!("config write: {e}")))?;
    Ok(())
}

#[tauri::command]
pub fn get_api_key(app: AppHandle) -> Result<Option<String>, ChatError> {
    Ok(load_config(&app)?.anthropic_api_key)
}

#[tauri::command]
pub fn set_api_key(app: AppHandle, key: String) -> Result<(), ChatError> {
    let trimmed = key.trim();
    let mut cfg = load_config(&app).unwrap_or_default();
    cfg.anthropic_api_key = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    };
    save_config(&app, &cfg)
}

#[derive(Serialize)]
struct AnthropicMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    system: &'a str,
    messages: Vec<AnthropicMessage<'a>>,
}

#[derive(Deserialize)]
struct AnthropicResponseBlock {
    #[serde(rename = "type")]
    block_type: String,
    #[serde(default)]
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    #[serde(default)]
    content: Vec<AnthropicResponseBlock>,
}

#[tauri::command]
pub async fn chat_complete(
    app: AppHandle,
    messages: Vec<ChatMessage>,
) -> Result<String, ChatError> {
    let api_key = load_config(&app)?
        .anthropic_api_key
        .ok_or(ChatError::NoApiKey)?;

    let body = AnthropicRequest {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: messages
            .iter()
            .map(|m| AnthropicMessage {
                role: m.role.as_str(),
                content: m.content.as_str(),
            })
            .collect(),
    };

    let client = reqwest::Client::new();
    let resp = client
        .post(API_ENDPOINT)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(ChatError::Unauthorized);
    }
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(ChatError::Api(format!("{}: {}", status, text)));
    }

    let parsed: AnthropicResponse = resp.json().await?;
    let text = parsed
        .content
        .into_iter()
        .filter(|b| b.block_type == "text")
        .filter_map(|b| b.text)
        .collect::<Vec<_>>()
        .join("\n");

    if text.is_empty() {
        Err(ChatError::Api("empty response".into()))
    } else {
        Ok(text)
    }
}
