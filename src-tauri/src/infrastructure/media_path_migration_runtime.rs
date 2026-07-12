use chrono::Utc;
use std::collections::{HashSet, VecDeque};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use tauri::{AppHandle, Emitter};

use crate::domain::models::{
    MediaPathMigrationQueueJob, MediaPathMigrationQueueRecentResult, MediaPathMigrationQueueStatus,
};
use crate::infrastructure::{desktop_runtime, workspace_repository};

pub const MEDIA_PATH_MIGRATION_QUEUE_CHANGED_EVENT: &str =
    "runtime://media-path-migration-queue-changed";
const RECENT_LIMIT: usize = 80;

#[derive(Clone)]
struct QueuedJob {
    job_id: String,
    source_id: String,
    provider: String,
    handle: String,
    source_path: String,
    target_base_path: String,
    target_path: String,
    queued_at: String,
    started_at: Option<String>,
    files_total: u64,
    bytes_total: u64,
}
#[derive(Default)]
struct State {
    queue: VecDeque<QueuedJob>,
    ids: HashSet<String>,
    active: Option<QueuedJob>,
    worker: bool,
    completed: u32,
    failed: u32,
    recent: VecDeque<MediaPathMigrationQueueRecentResult>,
}
type Shared = Arc<Mutex<State>>;
fn state() -> &'static Shared {
    static VALUE: OnceLock<Shared> = OnceLock::new();
    VALUE.get_or_init(|| Arc::new(Mutex::new(State::default())))
}

pub fn is_source_migrating(source_id: &str) -> bool {
    state().lock().ok().is_some_and(|value| {
        value.ids.contains(source_id)
            || value
                .active
                .as_ref()
                .is_some_and(|job| job.source_id == source_id)
    })
}

pub fn enqueue(
    app: &AppHandle,
    source_ids: Vec<String>,
    target_base_path: String,
) -> Result<MediaPathMigrationQueueStatus, String> {
    let target_base_path = target_base_path.trim().to_string();
    if target_base_path.is_empty() {
        return Err("The new save path is required.".to_string());
    }
    let mut added = false;
    {
        let mut value = state()
            .lock()
            .map_err(|_| "Media migration queue lock is poisoned.".to_string())?;
        for source_id in source_ids {
            if value.ids.contains(&source_id)
                || value
                    .active
                    .as_ref()
                    .is_some_and(|job| job.source_id == source_id)
            {
                continue;
            }
            let (provider, handle, source_path) =
                workspace_repository::media_path_migration_seed(source_id.clone())?;
            let job_id = uuid::Uuid::new_v4().to_string();
            let queued_at = Utc::now().to_rfc3339();
            let target_path = std::path::Path::new(&target_base_path)
                .join(handle.trim_start_matches('@'))
                .display()
                .to_string();
            workspace_repository::persist_media_path_migration_job(
                &job_id,
                &source_id,
                &target_base_path,
                &queued_at,
            )?;
            value.ids.insert(source_id.clone());
            value.queue.push_back(QueuedJob {
                job_id,
                source_id,
                provider,
                handle,
                source_path,
                target_base_path: target_base_path.clone(),
                target_path,
                queued_at,
                started_at: None,
                files_total: 0,
                bytes_total: 0,
            });
            added = true;
        }
        if added && !value.worker {
            value.worker = true;
            spawn(app.clone());
        }
    }
    publish(app);
    status()
}

pub fn restore_persisted_queue(app: &AppHandle) {
    let Ok(rows) = workspace_repository::load_media_path_migration_jobs() else {
        return;
    };
    if rows.is_empty() {
        return;
    }
    let mut value = match state().lock() {
        Ok(value) => value,
        Err(_) => return,
    };
    for (job_id, source_id, target_base_path, queued_at) in rows {
        if value.ids.contains(&source_id) {
            continue;
        }
        let Ok((provider, handle, source_path)) =
            workspace_repository::media_path_migration_seed(source_id.clone())
        else {
            let _ = workspace_repository::remove_media_path_migration_job(&job_id);
            continue;
        };
        let target_path = std::path::Path::new(&target_base_path)
            .join(handle.trim_start_matches('@'))
            .display()
            .to_string();
        value.ids.insert(source_id.clone());
        value.queue.push_back(QueuedJob {
            job_id,
            source_id,
            provider,
            handle,
            source_path,
            target_base_path,
            target_path,
            queued_at,
            started_at: None,
            files_total: 0,
            bytes_total: 0,
        });
    }
    if !value.queue.is_empty() && !value.worker {
        value.worker = true;
        spawn(app.clone());
    }
    drop(value);
    publish(app);
}

pub fn status() -> Result<MediaPathMigrationQueueStatus, String> {
    let value = state()
        .lock()
        .map_err(|_| "Media migration queue lock is poisoned.".to_string())?;
    Ok(build(&value))
}

fn spawn(app: AppHandle) {
    thread::spawn(move || loop {
        let job = {
            let mut value = match state().lock() {
                Ok(value) => value,
                Err(_) => return,
            };
            match value.queue.pop_front() {
                Some(mut job) => {
                    value.ids.remove(&job.source_id);
                    job.started_at = Some(Utc::now().to_rfc3339());
                    let _ = workspace_repository::set_media_path_migration_job_running(
                        &job.job_id,
                        job.started_at.as_deref().unwrap_or_default(),
                    );
                    value.active = Some(job.clone());
                    job
                }
                None => {
                    value.active = None;
                    value.worker = false;
                    drop(value);
                    publish(&app);
                    return;
                }
            }
        };
        publish(&app);
        let (files, bytes) = scan_totals(std::path::Path::new(&job.source_path));
        update_active(
            &app,
            &job.job_id,
            files,
            bytes,
            "Moving media",
            "Moving profile media and updating its save path.",
        );
        let outcome = workspace_repository::change_source_media_path_migration(
            job.source_id.clone(),
            job.target_base_path.clone(),
            &job.job_id,
        );
        let (status_value, summary, error) = match outcome {
            Ok(snapshot) => {
                let _ = desktop_runtime::publish_workspace_runtime(&app, &snapshot);
                (
                    "succeeded",
                    format!("Moved {} files ({} bytes).", files, bytes),
                    None,
                )
            }
            Err(error) => (
                "failed",
                "Media path migration failed.".to_string(),
                Some(error),
            ),
        };
        let _ = workspace_repository::remove_media_path_migration_job(&job.job_id);
        if let Ok(mut value) = state().lock() {
            if status_value == "succeeded" {
                value.completed = value.completed.saturating_add(1)
            } else {
                value.failed = value.failed.saturating_add(1)
            };
            value
                .recent
                .push_front(MediaPathMigrationQueueRecentResult {
                    job_id: job.job_id.clone(),
                    source_id: job.source_id.clone(),
                    provider: job.provider.clone(),
                    handle: job.handle.clone(),
                    source_path: job.source_path.clone(),
                    target_path: job.target_path.clone(),
                    status: status_value.to_string(),
                    summary,
                    finished_at: Utc::now().to_rfc3339(),
                    error,
                });
            while value.recent.len() > RECENT_LIMIT {
                value.recent.pop_back();
            }
            value.active = None;
        }
        publish(&app);
    });
}

fn scan_totals(path: &std::path::Path) -> (u64, u64) {
    fn walk(path: &std::path::Path, counts: &mut (u64, u64)) {
        let Ok(entries) = std::fs::read_dir(path) else {
            return;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                walk(&p, counts)
            } else if let Ok(meta) = entry.metadata() {
                counts.0 += 1;
                counts.1 += meta.len();
            }
        }
    }
    let mut counts = (0, 0);
    if path.exists() {
        walk(path, &mut counts)
    };
    counts
}
fn update_active(
    app: &AppHandle,
    job_id: &str,
    files: u64,
    bytes: u64,
    _label: &str,
    _detail: &str,
) {
    if let Ok(mut value) = state().lock() {
        if let Some(job) = value.active.as_mut() {
            if job.job_id == job_id {
                job.files_total = files;
                job.bytes_total = bytes;
            }
        }
    }
    publish(app)
}
fn model(job: &QueuedJob, state_name: &str, done: bool) -> MediaPathMigrationQueueJob {
    MediaPathMigrationQueueJob {
        job_id: job.job_id.clone(),
        source_id: job.source_id.clone(),
        provider: job.provider.clone(),
        handle: job.handle.clone(),
        source_path: job.source_path.clone(),
        target_path: job.target_path.clone(),
        state: state_name.to_string(),
        queued_at: job.queued_at.clone(),
        started_at: job.started_at.clone(),
        progress_percent: if done { Some(100) } else { Some(0) },
        progress_label: Some(if done {
            "Completed".to_string()
        } else if state_name == "running" {
            "Moving media".to_string()
        } else {
            "Queued for migration".to_string()
        }),
        progress_detail: Some(if state_name == "running" {
            "Moving files and updating the profile path.".to_string()
        } else {
            "Waiting for the media migration worker.".to_string()
        }),
        files_processed: if done { job.files_total } else { 0 },
        files_total: job.files_total,
        bytes_processed: if done { job.bytes_total } else { 0 },
        bytes_total: job.bytes_total,
    }
}
fn build(value: &State) -> MediaPathMigrationQueueStatus {
    let queued_items = value
        .queue
        .iter()
        .map(|job| model(job, "queued", false))
        .collect::<Vec<_>>();
    let running_items = value
        .active
        .as_ref()
        .map(|job| vec![model(job, "running", false)])
        .unwrap_or_default();
    let queued_count = queued_items.len() as u32;
    let running_count = running_items.len() as u32;
    MediaPathMigrationQueueStatus {
        queued_count,
        running_count,
        completed_count: value.completed,
        failed_count: value.failed,
        total_count: queued_count + running_count + value.completed + value.failed,
        queued_items,
        running_items,
        recent_results: value.recent.iter().cloned().collect(),
        updated_at: Utc::now().to_rfc3339(),
    }
}
fn publish(app: &AppHandle) {
    if let Ok(payload) = status() {
        let _ = app.emit(MEDIA_PATH_MIGRATION_QUEUE_CHANGED_EVENT, payload);
    }
}
