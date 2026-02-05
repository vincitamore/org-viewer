use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;

use crate::server::{log_to_file, AppState};

// --- Types ---

#[derive(Serialize)]
pub struct Project {
    name: String,
    #[serde(rename = "hasReadme")]
    has_readme: bool,
    #[serde(rename = "hasClaude")]
    has_claude: bool,
}

#[derive(Serialize)]
pub struct TreeEntry {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<TreeEntry>>,
}

#[derive(Serialize)]
pub struct ProjectFile {
    path: String,
    content: String,
    language: Option<String>,
    size: u64,
}

// --- Exclusion Logic ---

/// Directories to skip when building file trees
const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".obsidian",
    "dist",
    "build",
    "target",
    "__pycache__",
    ".next",
    ".turbo",
    ".cargo",
    ".cache",
    ".parcel-cache",
    "coverage",
    ".svelte-kit",
    ".nuxt",
    ".output",
    "vendor",
    ".vercel",
];

/// Files to skip
const EXCLUDED_FILES: &[&str] = &[
    ".DS_Store",
    "Thumbs.db",
    ".env",
    ".env.local",
];

fn should_exclude_entry(name: &str, is_dir: bool) -> bool {
    if is_dir {
        EXCLUDED_DIRS.contains(&name)
    } else {
        EXCLUDED_FILES.contains(&name)
    }
}

/// Detect language from file extension
fn detect_language(filename: &str) -> Option<String> {
    let ext = filename.rsplit('.').next()?;
    match ext {
        "rs" => Some("rust".to_string()),
        "ts" => Some("typescript".to_string()),
        "tsx" => Some("typescriptJsx".to_string()),
        "js" => Some("javascript".to_string()),
        "jsx" => Some("javascriptJsx".to_string()),
        "py" => Some("python".to_string()),
        "json" => Some("json".to_string()),
        "md" | "markdown" => Some("markdown".to_string()),
        "css" => Some("css".to_string()),
        "scss" | "sass" => Some("css".to_string()),
        "html" | "htm" => Some("html".to_string()),
        "toml" => Some("toml".to_string()),
        "yaml" | "yml" => Some("yaml".to_string()),
        "sql" => Some("sql".to_string()),
        "sh" | "bash" | "zsh" => Some("shell".to_string()),
        "ps1" => Some("powershell".to_string()),
        "xml" | "svg" => Some("xml".to_string()),
        "go" => Some("go".to_string()),
        "java" => Some("java".to_string()),
        "c" | "h" => Some("c".to_string()),
        "cpp" | "cc" | "cxx" | "hpp" => Some("cpp".to_string()),
        "lua" => Some("lua".to_string()),
        "rb" => Some("ruby".to_string()),
        "php" => Some("php".to_string()),
        "swift" => Some("swift".to_string()),
        "kt" | "kts" => Some("kotlin".to_string()),
        "dart" => Some("dart".to_string()),
        "lock" => Some("json".to_string()), // package-lock, Cargo.lock etc.
        _ => None,
    }
}

/// Check if a file is likely binary based on extension
fn is_binary_extension(filename: &str) -> bool {
    let ext = match filename.rsplit('.').next() {
        Some(e) => e,
        None => return false,
    };
    matches!(ext,
        "png" | "jpg" | "jpeg" | "gif" | "ico" | "bmp" | "webp" | "svg" |
        "woff" | "woff2" | "ttf" | "otf" | "eot" |
        "zip" | "tar" | "gz" | "bz2" | "xz" | "7z" |
        "exe" | "dll" | "so" | "dylib" |
        "pdf" | "doc" | "docx" | "xls" | "xlsx" |
        "mp3" | "mp4" | "wav" | "avi" | "mkv" | "flac" |
        "db" | "sqlite" | "sqlite3" |
        "wasm" | "map"
    )
}

// --- Handlers ---

/// GET /api/projects - List all projects
pub async fn list_projects(
    State(state): State<Arc<AppState>>,
) -> Json<Vec<Project>> {
    let projects_dir = state.org_root.join("projects");

    let mut projects = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let name = entry.file_name().to_string_lossy().to_string();

                // Skip hidden directories
                if name.starts_with('.') {
                    continue;
                }

                let dir_path = entry.path();
                let has_readme = dir_path.join("README.md").exists();
                let has_claude = dir_path.join("CLAUDE.md").exists();

                projects.push(Project {
                    name,
                    has_readme,
                    has_claude,
                });
            }
        }
    }

    projects.sort_by(|a, b| a.name.cmp(&b.name));
    Json(projects)
}

/// GET /api/projects/:name/tree - File tree for a project
pub async fn get_tree(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<Vec<TreeEntry>>, StatusCode> {
    let project_dir = state.org_root.join("projects").join(&name);

    // Validate project exists
    if !project_dir.is_dir() {
        return Err(StatusCode::NOT_FOUND);
    }

    // Validate no path traversal
    let canonical_projects = state.org_root.join("projects")
        .canonicalize()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let canonical_project = project_dir
        .canonicalize()
        .map_err(|_| StatusCode::NOT_FOUND)?;
    if !canonical_project.starts_with(&canonical_projects) {
        return Err(StatusCode::FORBIDDEN);
    }

    let tree = build_tree(&project_dir, &project_dir);
    Ok(Json(tree))
}

/// Build a file tree recursively
fn build_tree(dir: &PathBuf, project_root: &PathBuf) -> Vec<TreeEntry> {
    let mut entries = Vec::new();

    let mut dir_entries: Vec<_> = match std::fs::read_dir(dir) {
        Ok(reader) => reader.flatten().collect(),
        Err(_) => return entries,
    };

    // Sort: directories first, then alphabetically
    dir_entries.sort_by(|a, b| {
        let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    for entry in dir_entries {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);

        // Skip excluded entries
        if should_exclude_entry(&name, is_dir) {
            continue;
        }

        // Skip hidden files/dirs
        if name.starts_with('.') {
            continue;
        }

        let relative_path = entry.path()
            .strip_prefix(project_root)
            .unwrap_or(entry.path().as_ref())
            .to_string_lossy()
            .replace('\\', "/");

        if is_dir {
            let children = build_tree(&entry.path().to_path_buf(), project_root);
            // Skip empty directories
            if children.is_empty() {
                continue;
            }
            entries.push(TreeEntry {
                name,
                path: relative_path,
                is_dir: true,
                size: None,
                language: None,
                children: Some(children),
            });
        } else {
            // Skip binary files
            if is_binary_extension(&name) {
                continue;
            }

            let size = entry.metadata().map(|m| m.len()).ok();
            let language = detect_language(&name);

            entries.push(TreeEntry {
                name,
                path: relative_path,
                is_dir: false,
                size,
                language,
                children: None,
            });
        }
    }

    entries
}

/// GET /api/projects/:name/file/*path - Read a project file
pub async fn get_file(
    State(state): State<Arc<AppState>>,
    Path((name, file_path)): Path<(String, String)>,
) -> Result<Json<ProjectFile>, StatusCode> {
    let full_path = state.org_root.join("projects").join(&name).join(&file_path);

    // Validate no path traversal
    let canonical_projects = state.org_root.join("projects")
        .canonicalize()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let canonical_path = full_path
        .canonicalize()
        .map_err(|_| StatusCode::NOT_FOUND)?;
    if !canonical_path.starts_with(&canonical_projects) {
        return Err(StatusCode::FORBIDDEN);
    }

    // Check it's a file
    if !canonical_path.is_file() {
        return Err(StatusCode::NOT_FOUND);
    }

    // Read content
    let content = tokio::fs::read_to_string(&canonical_path)
        .await
        .map_err(|e| {
            log_to_file(&format!("[projects] Failed to read file: {}", e));
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let filename = canonical_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let size = tokio::fs::metadata(&canonical_path)
        .await
        .map(|m| m.len())
        .unwrap_or(0);

    let language = detect_language(&filename);

    Ok(Json(ProjectFile {
        path: file_path,
        content,
        language,
        size,
    }))
}

/// PUT /api/projects/:name/file/*path - Write a project file
#[derive(serde::Deserialize)]
pub struct PutProjectFileRequest {
    content: String,
}

pub async fn put_file(
    State(state): State<Arc<AppState>>,
    Path((name, file_path)): Path<(String, String)>,
    Json(payload): Json<PutProjectFileRequest>,
) -> Result<StatusCode, StatusCode> {
    log_to_file(&format!("[projects] PUT /api/projects/{}/file/{}", name, file_path));

    let full_path = state.org_root.join("projects").join(&name).join(&file_path);

    // Validate no path traversal
    let canonical_projects = state.org_root.join("projects")
        .canonicalize()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // For PUT, the file might not exist yet if we ever support creation
    // But for now we require it to exist
    let canonical_path = full_path
        .canonicalize()
        .map_err(|_| StatusCode::NOT_FOUND)?;

    if !canonical_path.starts_with(&canonical_projects) {
        log_to_file(&format!("[projects] PUT rejected - path traversal: {}", file_path));
        return Err(StatusCode::FORBIDDEN);
    }

    // Write content
    if let Err(e) = tokio::fs::write(&canonical_path, &payload.content).await {
        log_to_file(&format!("[projects] PUT failed to write: {}", e));
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    log_to_file(&format!("[projects] PUT success: {}/{}", name, file_path));
    Ok(StatusCode::OK)
}
