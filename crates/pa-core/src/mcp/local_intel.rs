//! Optional local intel MCP servers (context-mode, codemap, codebase-memory).
//!
//! They are not catalog services. A settings flag admits one only when its
//! binary resolves, and an existing `mcpServers` entry of the same name wins.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::McpServerConfig;
use crate::settings::{BundledMcpsSettings, Settings};

pub struct LocalIntelPreset {
    pub server: &'static str,
    pub label: &'static str,
    pub setting_key: &'static str,
    pub command_candidates: &'static [&'static str],
    pub script_candidates: &'static [&'static str],
    pub env_command: &'static str,
}

pub const LOCAL_INTEL_PRESETS: &[LocalIntelPreset] = &[
    LocalIntelPreset {
        server: "context-mode",
        label: "Context Mode",
        setting_key: "contextMode",
        command_candidates: &["context-mode-mcp"],
        script_candidates: &[],
        env_command: "CONTEXT_MODE_MCP",
    },
    LocalIntelPreset {
        server: "codemap",
        label: "Codemap",
        setting_key: "codemap",
        command_candidates: &["codemap"],
        script_candidates: &["PycharmProjects/the-library/tools/codemap/server.mjs"],
        env_command: "CODEMAP_MCP",
    },
    LocalIntelPreset {
        server: "codebase-memory",
        label: "Codebase Memory",
        setting_key: "codebaseMemory",
        command_candidates: &["codebase-memory-mcp"],
        script_candidates: &[],
        env_command: "CODEBASE_MEMORY_MCP",
    },
];

pub fn preset_for(name: &str) -> Option<&'static LocalIntelPreset> {
    LOCAL_INTEL_PRESETS
        .iter()
        .find(|preset| preset.server == name)
}

pub fn missing_local_intel_message(preset: &LocalIntelPreset) -> String {
    format!(
        "Optional MCP \"{}\" is not installed. Install {} so {} is on PATH, or set {} to the executable or .mjs server path.",
        preset.server,
        preset.label,
        preset.command_candidates.join(" or "),
        preset.env_command
    )
}

pub fn bundled_mcp_enabled(settings: Option<&BundledMcpsSettings>, key: &str) -> bool {
    let Some(settings) = settings else {
        return false;
    };
    match key {
        "contextMode" => settings.context_mode == Some(true),
        "codemap" => settings.codemap == Some(true),
        "codebaseMemory" => settings.codebase_memory == Some(true),
        _ => false,
    }
}

/// User `mcpServers` plus enabled local intel servers whose binaries resolve.
/// A declared server of the same name is left alone.
pub fn user_mcp_servers(settings: &Settings) -> HashMap<String, McpServerConfig> {
    let mut servers = settings
        .mcp_servers
        .clone()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(server, config)| {
            serde_json::from_value(config)
                .ok()
                .map(|parsed| (server, parsed))
        })
        .collect::<HashMap<_, _>>();
    let env = std::env::vars().collect::<HashMap<_, _>>();
    for preset in LOCAL_INTEL_PRESETS {
        if servers.contains_key(preset.server)
            || !bundled_mcp_enabled(settings.bundled_mcps.as_ref(), preset.setting_key)
        {
            continue;
        }
        if let Some(config) =
            resolve_local_intel_config_with(preset, &env, path_is_file, path_is_executable)
        {
            servers.insert(preset.server.to_string(), config);
        }
    }
    servers
}

pub fn resolve_local_intel_config(preset: &LocalIntelPreset) -> Option<McpServerConfig> {
    let env = std::env::vars().collect::<HashMap<_, _>>();
    resolve_local_intel_config_with(preset, &env, path_is_file, path_is_executable)
}

fn resolve_local_intel_config_with(
    preset: &LocalIntelPreset,
    env: &HashMap<String, String>,
    is_file: impl Fn(&Path) -> bool,
    is_executable: impl Fn(&Path) -> bool,
) -> Option<McpServerConfig> {
    if let Some(override_path) = env
        .get(preset.env_command)
        .map(|value| value.trim().to_string())
    {
        if override_path.is_empty() {
            return None;
        }
        return resolve_command_spec(&override_path, env, &is_file, &is_executable);
    }
    for candidate in preset.command_candidates {
        if let Some(resolved) = find_executable(candidate, env, &is_executable) {
            return Some(stdio_config(resolved, None));
        }
    }
    for script in script_candidate_paths(preset, env) {
        if let Some(resolved) = resolve_command_spec(&script, env, &is_file, &is_executable) {
            return Some(resolved);
        }
    }
    None
}

fn script_candidate_paths(preset: &LocalIntelPreset, env: &HashMap<String, String>) -> Vec<String> {
    let mut paths = Vec::new();
    if preset.server == "codemap" {
        if let Some(hub) = env
            .get("LIBRARY_HUB")
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
        {
            paths.push(
                Path::new(hub)
                    .join("tools/codemap/server.mjs")
                    .to_string_lossy()
                    .into_owned(),
            );
        }
    }
    let home = env
        .get("HOME")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    for candidate in preset.script_candidates {
        if Path::new(candidate).is_absolute() {
            paths.push((*candidate).to_string());
        } else if let Some(home) = home {
            paths.push(
                Path::new(home)
                    .join(candidate)
                    .to_string_lossy()
                    .into_owned(),
            );
        } else {
            paths.push((*candidate).to_string());
        }
    }
    paths
}

fn resolve_command_spec(
    raw: &str,
    env: &HashMap<String, String>,
    is_file: &impl Fn(&Path) -> bool,
    is_executable: &impl Fn(&Path) -> bool,
) -> Option<McpServerConfig> {
    let path = PathBuf::from(raw);
    if is_file(&path) {
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if matches!(extension.as_str(), "js" | "mjs" | "cjs") && !is_executable(&path) {
            let node = find_executable("node", env, is_executable)?;
            return Some(stdio_config(node, Some(vec![raw.to_string()])));
        }
        return Some(stdio_config(raw.to_string(), None));
    }
    find_executable(raw, env, is_executable).map(|resolved| stdio_config(resolved, None))
}

fn find_executable(
    name: &str,
    env: &HashMap<String, String>,
    is_executable: &impl Fn(&Path) -> bool,
) -> Option<String> {
    if name.contains('/') || name.contains('\\') {
        return is_executable(Path::new(name)).then(|| name.to_string());
    }
    let path_value = env.get("PATH")?;
    let candidates: Vec<String> = if cfg!(windows) {
        vec![
            name.to_string(),
            format!("{name}.exe"),
            format!("{name}.cmd"),
        ]
    } else {
        vec![name.to_string()]
    };
    for dir in std::env::split_paths(path_value) {
        if dir.as_os_str().is_empty() {
            continue;
        }
        for candidate in &candidates {
            let full = dir.join(candidate);
            if is_executable(&full) {
                return Some(full.to_string_lossy().into_owned());
            }
        }
    }
    None
}

fn stdio_config(command: String, args: Option<Vec<String>>) -> McpServerConfig {
    McpServerConfig::Stdio {
        command,
        args,
        cwd: None,
        env: None,
        enabled: None,
        enabled_tools: None,
        disabled_tools: None,
        startup_timeout_ms: None,
        call_timeout_ms: None,
    }
}

fn path_is_file(path: &Path) -> bool {
    std::fs::metadata(path).is_ok_and(|meta| meta.is_file())
}

fn path_is_executable(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return meta.permissions().mode() & 0o111 != 0;
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect()
    }

    #[test]
    fn enabled_binary_is_admitted_and_declared_name_wins() {
        let preset = preset_for("context-mode").unwrap();
        let environment = env(&[("PATH", "/opt/bin")]);
        let resolved = resolve_local_intel_config_with(
            preset,
            &environment,
            |_| false,
            |path| path == Path::new("/opt/bin/context-mode-mcp"),
        );
        assert!(matches!(
            &resolved,
            Some(McpServerConfig::Stdio { command, args: None, .. }) if command == "/opt/bin/context-mode-mcp"
        ));

        let settings = Settings {
            mcp_servers: Some(
                serde_json::json!({
                    "context-mode": { "type": "stdio", "command": "already" }
                })
                .as_object()
                .unwrap()
                .clone(),
            ),
            bundled_mcps: Some(BundledMcpsSettings {
                context_mode: Some(true),
                ..BundledMcpsSettings::default()
            }),
            ..Settings::default()
        };
        let merged = user_mcp_servers_with(&settings, &environment, |_| false, |_| false);
        assert_eq!(
            merged.get("context-mode").and_then(|config| match config {
                McpServerConfig::Stdio { command, .. } => Some(command.as_str()),
                _ => None,
            }),
            Some("already")
        );
    }

    #[test]
    fn script_override_launches_through_node() {
        let preset = preset_for("codemap").unwrap();
        let environment = env(&[("PATH", "/usr/bin"), ("CODEMAP_MCP", "/tmp/server.mjs")]);
        let resolved = resolve_local_intel_config_with(
            preset,
            &environment,
            |path| path == Path::new("/tmp/server.mjs"),
            |path| path == Path::new("/usr/bin/node"),
        )
        .expect("node launch");
        match resolved {
            McpServerConfig::Stdio { command, args, .. } => {
                assert_eq!(command, "/usr/bin/node");
                assert_eq!(args, Some(vec!["/tmp/server.mjs".to_string()]));
            }
            other => panic!("expected stdio, got {other:?}"),
        }
    }

    fn user_mcp_servers_with(
        settings: &Settings,
        env: &HashMap<String, String>,
        is_file: impl Fn(&Path) -> bool,
        is_executable: impl Fn(&Path) -> bool,
    ) -> HashMap<String, McpServerConfig> {
        let mut servers = settings
            .mcp_servers
            .clone()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|(server, config)| {
                serde_json::from_value(config)
                    .ok()
                    .map(|parsed| (server, parsed))
            })
            .collect::<HashMap<_, _>>();
        for preset in LOCAL_INTEL_PRESETS {
            if servers.contains_key(preset.server)
                || !bundled_mcp_enabled(settings.bundled_mcps.as_ref(), preset.setting_key)
            {
                continue;
            }
            if let Some(config) =
                resolve_local_intel_config_with(preset, env, &is_file, &is_executable)
            {
                servers.insert(preset.server.to_string(), config);
            }
        }
        servers
    }
}
