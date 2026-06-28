// Login / player-profile popup (create, switch, clear local players).
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

// ctx: { getProgressProfile, getActiveProfileName, formatProfileUpdatedAt,
//        heartbeatActiveSession, activateProfile, closeOtherPopups }
export function buildLoginPopup(ctx) {
  const {
    getProgressProfile,
    getActiveProfileName,
    formatProfileUpdatedAt,
    heartbeatActiveSession,
    activateProfile,
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
    });

    const name = document.createElement("span");
    name.className = "login-profile-name";
    name.textContent = profile.name;
    const meta = document.createElement("span");
    meta.className = "login-profile-meta";
    meta.textContent = profile.active ? "Active" : formatProfileUpdatedAt(profile.updatedAt);
    btn.appendChild(name);
    btn.appendChild(meta);
    list.appendChild(btn);
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
  });

  row.appendChild(input);
  row.appendChild(createBtn);
  form.appendChild(label);
  form.appendChild(row);
  form.appendChild(error);
  card.appendChild(form);

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
