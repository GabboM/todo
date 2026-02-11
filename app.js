// --- Supabase Config ---
// Replace these with your actual Supabase project values
const SUPABASE_URL = "https://qoachpijtlbsxeyabdpl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-vYudRVg3UUVYGEHV55_Pw_bJEfiW1c";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let allAssignees = [];
let allTasks = [];

// --- Auth ---

const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const setpwSection = document.getElementById("setpw-section");
const setpwForm = document.getElementById("setpw-form");
const setpwError = document.getElementById("setpw-error");

function showSetPasswordForm() {
  document.body.classList.remove("logged-out", "logged-in");
  document.getElementById("login-section").classList.add("hidden");
  document.getElementById("app-section").classList.add("hidden");
  setpwSection.classList.remove("hidden");
}

function showApp() {
  document.body.classList.remove("logged-out");
  document.body.classList.add("logged-in");
  setpwSection.classList.add("hidden");
  loadBoard();
}

async function handleAuthSession(session) {
  try {
    const { data: profile, error } = await sb
      .from("profiles")
      .select("username")
      .eq("id", session.user.id)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      // Profile check failed, but user IS authenticated — show app anyway
      showApp();
      return;
    }

    if (!profile || !profile.username) {
      showSetPasswordForm();
    } else {
      showApp();
    }
  } catch (err) {
    console.error("Unexpected error in auth flow:", err);
    showApp();
  }
}

sb.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    showSetPasswordForm();
    return;
  }

  if (session) {
    handleAuthSession(session);
  } else {
    document.body.classList.remove("logged-in");
    document.body.classList.add("logged-out");
    setpwSection.classList.add("hidden");
  }
});

setpwForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setpwError.classList.add("hidden");

  const displayName = document.getElementById("setpw-name").value.trim();
  const pw = document.getElementById("setpw-password").value;
  const confirm = document.getElementById("setpw-confirm").value;

  if (pw !== confirm) {
    setpwError.textContent = "Le password non coincidono.";
    setpwError.classList.remove("hidden");
    return;
  }

  const { error } = await sb.auth.updateUser({ password: pw });

  if (error) {
    setpwError.textContent = error.message;
    setpwError.classList.remove("hidden");
    return;
  }

  // Update username in profiles
  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const { error: profileError } = await sb.from("profiles")
      .update({ username: displayName })
      .eq("id", user.id);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      setpwError.textContent = "Errore nel salvataggio del profilo. Riprova.";
      setpwError.classList.remove("hidden");
      return;
    }
  }

  setpwSection.classList.add("hidden");
  document.body.classList.remove("logged-out");
  document.body.classList.add("logged-in");
  loadBoard();
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    loginError.textContent = error.message;
    loginError.classList.remove("hidden");
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await sb.auth.signOut();
});

// --- View toggle (Board / Archive) ---

let currentView = "board"; // "board" or "archive"
const boardEl = document.querySelector(".board");
const filterBar = document.querySelector(".filter-bar");
const archiveSection = document.getElementById("archive-section");
const archiveList = document.getElementById("archive-list");
const archiveEmpty = document.getElementById("archive-empty");
const btnArchiveView = document.getElementById("btn-archive-view");
const btnAdd = document.getElementById("btn-add");

btnArchiveView.addEventListener("click", () => {
  if (currentView === "board") {
    currentView = "archive";
    btnArchiveView.textContent = "Board";
    boardEl.classList.add("hidden");
    filterBar.classList.add("hidden");
    btnAdd.classList.add("hidden");
    archiveSection.classList.remove("hidden");
    renderArchive();
  } else {
    currentView = "board";
    btnArchiveView.textContent = "Archivio";
    archiveSection.classList.add("hidden");
    boardEl.classList.remove("hidden");
    filterBar.classList.remove("hidden");
    btnAdd.classList.remove("hidden");
    renderTasks(allTasks);
  }
});

// --- Filter ---

const filterAssignee = document.getElementById("filter-assignee");

filterAssignee.addEventListener("change", () => {
  renderTasks(allTasks);
});

// --- Fetch & Render ---

async function loadBoard() {
  const [tasksRes, profilesRes] = await Promise.all([
    sb.from("tasks").select("*, assignee:profiles(id, username)"),
    sb.from("profiles").select("id, username"),
  ]);

  if (tasksRes.error) {
    console.error("Error loading tasks:", tasksRes.error);
    return;
  }
  if (profilesRes.error) {
    console.error("Error loading profiles:", profilesRes.error);
    return;
  }

  allAssignees = profilesRes.data.filter((p) => p.username);
  allTasks = tasksRes.data || [];

  // Update filter dropdown (keep current selection)
  const currentFilter = filterAssignee.value;
  filterAssignee.innerHTML = '<option value="">Tutti</option>' +
    allAssignees.map((a) => `<option value="${a.id}">${esc(a.username)}</option>`).join("");
  filterAssignee.value = currentFilter;

  renderTasks(allTasks);
}

function renderTasks(tasks) {
  document.querySelectorAll(".card-list").forEach((list) => {
    list.innerHTML = "";
  });

  const filter = filterAssignee.value;

  tasks.forEach((task) => {
    if (task.status === "archived") return;

    if (filter && task.assignee_id !== filter) return;

    const list = document.querySelector(
      `.card-list[data-status="${task.status}"]`
    );
    if (!list) return;
    list.appendChild(createCard(task));
  });
}

function renderArchive() {
  archiveList.innerHTML = "";
  const archived = allTasks.filter((t) => t.status === "archived");

  if (archived.length === 0) {
    archiveEmpty.classList.remove("hidden");
  } else {
    archiveEmpty.classList.add("hidden");
    archived.forEach((task) => {
      const row = document.createElement("div");
      row.className = "archive-row";

      const assigneeName = task.assignee ? task.assignee.username : "";
      const badgeHtml = assigneeName ? `<span class="badge">${esc(assigneeName)}</span>` : "";
      const dueHtml = task.due_date ? `<span class="due-date">${task.due_date}</span>` : "";

      row.innerHTML = `
        <div class="archive-info">
          <span class="archive-title">${esc(task.title)}</span>
          <div class="card-meta">${badgeHtml}${dueHtml}</div>
        </div>
        <button class="btn-restore" title="Ripristina">Ripristina</button>
      `;

      row.querySelector(".btn-restore").addEventListener("click", async () => {
        const { error } = await sb
          .from("tasks")
          .update({ status: "backlog" })
          .eq("id", task.id);
        if (error) console.error("Error restoring task:", error);
        await loadBoard();
        renderArchive();
      });

      archiveList.appendChild(row);
    });
  }
}

function createCard(task) {
  const card = document.createElement("div");
  card.className = "card";
  card.draggable = true;
  card.dataset.id = task.id;

  const dueDate = task.due_date || "";
  const isOverdue =
    dueDate && new Date(dueDate) < new Date().setHours(0, 0, 0, 0) &&
    task.status !== "done";

  if (isOverdue) card.classList.add("overdue");

  const nextMap = {
    backlog: { status: "todo", icon: "&#x279C;", cls: "advance-blue" },
    todo: { status: "inprogress", icon: "&#x23F3;", cls: "advance-yellow" },
    inprogress: { status: "done", icon: "&#x2714;", cls: "advance-green" },
  };

  const assigneeName = task.assignee ? task.assignee.username : "";
  const badgeHtml = assigneeName ? `<span class="badge">${esc(assigneeName)}</span>` : "";

  let dueDateHtml = "";
  if (dueDate) {
    const cls = isOverdue ? "due-date overdue" : "due-date";
    dueDateHtml = `<span class="${cls}">${dueDate}</span>`;
  }

  const next = nextMap[task.status];
  const advanceHtml = next
    ? `<button class="btn-advance ${next.cls}" data-next="${next.status}">${next.icon}</button>`
    : "";

  const archiveBtnHtml = task.status === "done"
    ? `<button class="btn-advance advance-archive" title="Archivia">&#x1F4E6;</button>`
    : "";

  card.innerHTML = `
    ${advanceHtml}${archiveBtnHtml}
    <div class="card-title">${esc(task.title)}</div>
    <div class="card-meta">${badgeHtml}${dueDateHtml}</div>
  `;

  // Advance button click
  const advanceBtn = card.querySelector(".btn-advance:not(.advance-archive)");
  if (advanceBtn) {
    advanceBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const { error } = await sb
        .from("tasks")
        .update({ status: advanceBtn.dataset.next })
        .eq("id", task.id);
      if (error) console.error("Error advancing task:", error);
      loadBoard();
    });
  }

  // Archive button click (done column only)
  const archiveBtn = card.querySelector(".advance-archive");
  if (archiveBtn) {
    archiveBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const { error } = await sb
        .from("tasks")
        .update({ status: "archived" })
        .eq("id", task.id);
      if (error) console.error("Error archiving task:", error);
      loadBoard();
    });
  }

  // Desktop drag events
  card.addEventListener("dragstart", (e) => {
    card.classList.add("dragging");
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
  });

  // Click to edit
  card.addEventListener("click", () => openModal(task));

  return card;
}

// --- Desktop Drag & Drop ---

document.querySelectorAll(".card-list").forEach((list) => {
  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    list.classList.add("drag-over");
  });

  list.addEventListener("dragleave", () => {
    list.classList.remove("drag-over");
  });

  list.addEventListener("drop", async (e) => {
    e.preventDefault();
    list.classList.remove("drag-over");
    const taskId = e.dataTransfer.getData("text/plain");
    const newStatus = list.dataset.status;

    // Optimistic: update local state and re-render card in new column
    const task = allTasks.find((t) => t.id === taskId);
    if (task) {
      task.status = newStatus;
      const oldCard = document.querySelector(`.card[data-id="${taskId}"]`);
      if (oldCard) oldCard.remove();
      list.appendChild(createCard(task));
    }

    // Sync with server
    const { error } = await sb
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId);

    if (error) {
      console.error("Error updating task status:", error);
      loadBoard();
    }
  });
});

// --- Modal ---

const overlay = document.getElementById("modal-overlay");
const form = document.getElementById("task-form");
const formId = document.getElementById("form-id");
const formTitle = document.getElementById("form-title");
const formStatus = document.getElementById("form-status");
const formDue = document.getElementById("form-due");
const formAssignee = document.getElementById("form-assignee");
const modalTitle = document.getElementById("modal-title");
const btnDelete = document.getElementById("btn-delete");
const btnArchive = document.getElementById("btn-archive");

document.getElementById("btn-add").addEventListener("click", () => openModal());
document.getElementById("btn-cancel").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});

function openModal(task = null) {
  form.reset();
  formId.value = "";

  // Build assignee dropdown
  formAssignee.innerHTML = '<option value="">-- Nessuno --</option>' +
    allAssignees.map((a) => `<option value="${a.id}">${esc(a.username)}</option>`).join("");

  if (task) {
    modalTitle.textContent = "Modifica Task";
    formId.value = task.id;
    formTitle.value = task.title;
    formStatus.value = task.status;
    formDue.value = task.due_date || "";
    formAssignee.value = task.assignee_id || "";
    btnDelete.classList.remove("hidden");
    btnArchive.classList.remove("hidden");
  } else {
    modalTitle.textContent = "Nuova Task";
    btnDelete.classList.add("hidden");
    btnArchive.classList.add("hidden");
  }

  overlay.classList.remove("hidden");
  formTitle.focus();
}

function closeModal() {
  overlay.classList.add("hidden");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    title: formTitle.value.trim(),
    status: formStatus.value,
    assignee_id: formAssignee.value || null,
    due_date: formDue.value,
  };

  if (formId.value) {
    const { error } = await sb
      .from("tasks")
      .update(payload)
      .eq("id", formId.value);
    if (error) console.error("Error updating task:", error);
  } else {
    const { error } = await sb.from("tasks").insert(payload);
    if (error) console.error("Error creating task:", error);
  }

  closeModal();
  loadBoard();
});

btnDelete.addEventListener("click", async () => {
  if (!formId.value) return;
  if (!confirm("Eliminare questa task?")) return;

  const { error } = await sb
    .from("tasks")
    .delete()
    .eq("id", formId.value);

  if (error) console.error("Error deleting task:", error);
  closeModal();
  loadBoard();
});

btnArchive.addEventListener("click", async () => {
  if (!formId.value) return;

  const { error } = await sb
    .from("tasks")
    .update({ status: "archived" })
    .eq("id", formId.value);

  if (error) console.error("Error archiving task:", error);
  closeModal();
  loadBoard();
});

// --- Helpers ---

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// --- Offline detection ---

const offlineBanner = document.getElementById("offline-banner");

function updateOnlineStatus() {
  if (navigator.onLine) {
    offlineBanner.classList.add("hidden");
  } else {
    offlineBanner.classList.remove("hidden");
  }
}

window.addEventListener("online", () => {
  updateOnlineStatus();
  loadBoard();
});
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

// --- Gestione errori auth da URL (link scaduti/invalidi) ---

(function checkAuthError() {
  const params = new URLSearchParams(window.location.hash.substring(1));
  const error = params.get("error");
  const errorDesc = params.get("error_description");

  if (error) {
    if (error === "access_denied" && errorDesc && errorDesc.includes("expired")) {
      loginError.textContent = "Il link di invito è scaduto o già utilizzato. Chiedi un nuovo invito.";
    } else {
      loginError.textContent = errorDesc || "Errore di accesso.";
    }
    loginError.classList.remove("hidden");
    history.replaceState(null, "", window.location.pathname);
  }
})();
