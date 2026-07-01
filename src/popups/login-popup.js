// Login / player-profile popup (create, switch, delete, clear local players).
//
// Profile persistence comes straight from player-progress; everything that
// touches live engine state (the active profile, session heartbeat, activating
// a switched profile, closing sibling popups) is injected via `ctx` so this
// module stays a pure "view".
import {
  getProfileList,
  saveProfile,
  switchStoredProfile,
  createStoredProfile,
  resetStoredProfile,
} from "../player-progress.js";

export function closeLoginPopup() {
  const existing = document.getElementById("loginOverlay");
  if (existing) existing.remove();
}

function downloadTextFile(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ctx: { getProgressProfile, getActiveProfileName, formatProfileUpdatedAt,
//        createBackupCode, getBackupFileName, restoreBackupCode,
//        copyTextToClipboard, heartbeatActiveSession, activateProfile,
//        deleteProfile, onProfileChanged, closeOtherPopups }
export function buildLoginPopup(ctx) {
  const {
    getProgressProfile,
    getActiveProfileName,
    formatProfileUpdatedAt,
    createBackupCode,
    getBackupFileName,
    restoreBackupCode,
    copyTextToClipboard,
    heartbeatActiveSession,
    activateProfile,
    deleteProfile,
    onProfileChanged,
    closeOtherPopups,
  } = ctx;

  closeOtherPopups();
  closeLoginPopup();

  const overlay = document.createElement("div");
  overlay.className = "overlay login-overlay";
  overlay.id = "loginOverlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Select player");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeLoginPopup();
  });

  const card = document.createElement("div");
  card.className = "card login-card";

  const header = document.createElement("div");
  header.className = "login-header";
  const title = document.createElement("h2");
  title.textContent = "Players";
  const active = document.createElement("div");
  active.className = "login-active";
  active.textContent = `Current: ${getActiveProfileName()}`;
  header.appendChild(title);
  header.appendChild(active);
  card.appendChild(header);

  const list = document.createElement("div");
  list.className = "login-list";
  const profiles = getProfileList();
  profiles.forEach((profile) => {
    const row = document.createElement("div");
    row.className = "login-profile-row";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "login-profile-btn";
    btn.classList.toggle("active", profile.active);
    btn.setAttribute("aria-pressed", profile.active ? "true" : "false");
    btn.addEventListener("click", () => {
      heartbeatActiveSession();
      saveProfile(getProgressProfile());
      const selected = switchStoredProfile(profile.id);
      activateProfile(selected);
      closeLoginPopup();
      onProfileChanged?.();
    });

    const name = document.createElement("span");
    name.className = "login-profile-name";
    name.textContent = profile.name;
    const meta = document.createElement("span");
    meta.className = "login-profile-meta";
    meta.textContent = profile.active ? "Active" : formatProfileUpdatedAt(profile.updatedAt);
    btn.appendChild(name);
    btn.appendChild(meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "login-profile-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", `Delete ${profile.name}`);
    deleteBtn.title = `Delete ${profile.name}`;
    deleteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const ok = window.confirm(`Delete ${profile.name} and all their progress? This can't be undone.`);
      if (!ok) return;
      heartbeatActiveSession();
      saveProfile(getProgressProfile());
      const selected = deleteProfile(profile.id);
      activateProfile(selected);
      closeLoginPopup();
      onProfileChanged?.();
    });

    row.appendChild(btn);
    row.appendChild(deleteBtn);
    list.appendChild(row);
  });
  card.appendChild(list);

  const form = document.createElement("form");
  form.className = "login-create";
  const label = document.createElement("label");
  label.setAttribute("for", "profileNameInput");
  label.textContent = "Create player";
  const row = document.createElement("div");
  row.className = "login-create-row";
  const input = document.createElement("input");
  input.id = "profileNameInput";
  input.type = "text";
  input.maxLength = 40;
  input.autocomplete = "off";
  input.placeholder = "Name";
  const createBtn = document.createElement("button");
  createBtn.type = "submit";
  createBtn.className = "primary";
  createBtn.textContent = "Create";
  const error = document.createElement("div");
  error.className = "login-error";
  error.setAttribute("role", "alert");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      error.textContent = "Enter a player name.";
      input.focus();
      return;
    }
    heartbeatActiveSession();
    saveProfile(getProgressProfile());
    const created = createStoredProfile(name);
    activateProfile(created);
    closeLoginPopup();
    onProfileChanged?.();
  });

  row.appendChild(input);
  row.appendChild(createBtn);
  form.appendChild(label);
  form.appendChild(row);
  form.appendChild(error);
  card.appendChild(form);

  const backup = document.createElement("section");
  backup.className = "login-backup";
  const backupTitle = document.createElement("h3");
  backupTitle.textContent = "Backup / Restore";
  const backupHelp = document.createElement("p");
  backupHelp.textContent = "Save this player's progress as a code or file, then restore it later on this device or another one.";

  const backupActions = document.createElement("div");
  backupActions.className = "login-backup-actions";
  const makeBackupBtn = document.createElement("button");
  makeBackupBtn.type = "button";
  makeBackupBtn.textContent = "Create Backup";
  const copyBackupBtn = document.createElement("button");
  copyBackupBtn.type = "button";
  copyBackupBtn.textContent = "Copy Code";
  copyBackupBtn.disabled = true;
  const downloadBackupBtn = document.createElement("button");
  downloadBackupBtn.type = "button";
  downloadBackupBtn.textContent = "Download";
  downloadBackupBtn.disabled = true;
  backupActions.append(makeBackupBtn, copyBackupBtn, downloadBackupBtn);

  const backupOutput = document.createElement("textarea");
  backupOutput.id = "profileBackupCode";
  backupOutput.className = "login-backup-code";
  backupOutput.readOnly = true;
  backupOutput.rows = 3;
  backupOutput.placeholder = "Backup code appears here.";

  const restoreLabel = document.createElement("label");
  restoreLabel.setAttribute("for", "profileRestoreCode");
  restoreLabel.textContent = "Restore from code or file";
  const restoreInput = document.createElement("textarea");
  restoreInput.id = "profileRestoreCode";
  restoreInput.className = "login-restore-code";
  restoreInput.rows = 3;
  restoreInput.placeholder = "Paste a Rain Math backup code.";
  const restoreRow = document.createElement("div");
  restoreRow.className = "login-restore-row";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".txt,text/plain";
  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.className = "primary";
  restoreBtn.textContent = "Restore";
  restoreRow.append(fileInput, restoreBtn);

  const backupStatus = document.createElement("div");
  backupStatus.className = "login-backup-status";
  backupStatus.setAttribute("role", "status");
  backupStatus.setAttribute("aria-live", "polite");

  makeBackupBtn.addEventListener("click", async () => {
    backupStatus.textContent = "Creating backup...";
    try {
      const code = await createBackupCode();
      backupOutput.value = code;
      copyBackupBtn.disabled = false;
      downloadBackupBtn.disabled = false;
      backupStatus.textContent = "Backup ready.";
    } catch {
      backupStatus.textContent = "Backup failed. Try again.";
    }
  });

  copyBackupBtn.addEventListener("click", () => {
    copyTextToClipboard(backupOutput.value, backupStatus, "Backup code copied.");
  });

  downloadBackupBtn.addEventListener("click", () => {
    if (!backupOutput.value) return;
    downloadTextFile(getBackupFileName(), backupOutput.value);
    backupStatus.textContent = "Backup file downloaded.";
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    restoreInput.value = await file.text();
    backupStatus.textContent = "Backup file loaded.";
  });

  restoreBtn.addEventListener("click", async () => {
    const code = restoreInput.value.trim();
    if (!code) {
      backupStatus.textContent = "Paste a backup code or choose a file.";
      restoreInput.focus();
      return;
    }
    backupStatus.textContent = "Checking backup...";
    const result = await restoreBackupCode(code, { confirmReplace: true });
    if (!result.ok) {
      backupStatus.textContent = result.message || "Restore failed.";
      return;
    }
    closeLoginPopup();
    onProfileChanged?.();
  });

  backup.append(
    backupTitle,
    backupHelp,
    backupActions,
    backupOutput,
    restoreLabel,
    restoreInput,
    restoreRow,
    backupStatus
  );
  card.appendChild(backup);

  const actions = document.createElement("div");
  actions.className = "login-actions";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "login-clear";
  clearBtn.textContent = "Clear Current Stats";
  clearBtn.addEventListener("click", () => {
    heartbeatActiveSession();
    const resetProfile = resetStoredProfile();
    activateProfile(resetProfile);
    closeLoginPopup();
    onProfileChanged?.();
  });

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "login-close";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", closeLoginPopup);

  actions.appendChild(clearBtn);
  actions.appendChild(closeBtn);
  card.appendChild(actions);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  input.focus();
}
