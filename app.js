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

sb.auth.onAuthStateChange((event, session) => {
  if (session) {
    document.body.classList.remove("logged-out");
    document.body.classList.add("logged-in");
    loadBoard();
  } else {
    document.body.classList.remove("logged-in");
    document.body.classList.add("logged-out");
  }
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

// --- Filter ---

const filterAssignee = document.getElementById("filter-assignee");

filterAssignee.addEventListener("change", () => {
  renderTasks(allTasks);
});

// --- Fetch & Render ---

async function loadBoard() {
  const [tasksRes, assigneesRes] = await Promise.all([
    sb.from("tasks").select("*"),
    sb.from("assignees").select("name"),
  ]);

  if (tasksRes.error) {
    console.error("Error loading tasks:", tasksRes.error);
    return;
  }
  if (assigneesRes.error) {
    console.error("Error loading assignees:", assigneesRes.error);
    return;
  }

  allAssignees = assigneesRes.data.map((a) => a.name);
  allTasks = tasksRes.data || [];

  // Update filter dropdown (keep current selection)
  const currentFilter = filterAssignee.value;
  filterAssignee.innerHTML = '<option value="">Tutti</option>' +
    allAssignees.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join("");
  filterAssignee.value = currentFilter;

  renderTasks(allTasks);
}

function renderTasks(tasks) {
  document.querySelectorAll(".card-list").forEach((list) => {
    list.innerHTML = "";
  });

  const filter = filterAssignee.value;

  tasks.forEach((task) => {
    // Get the single assignee (first element of the JSONB array, or empty)
    const assignee = (task.assignees && task.assignees[0]) || "";

    if (filter && assignee !== filter) return;

    const list = document.querySelector(
      `.card-list[data-status="${task.status}"]`
    );
    if (!list) return;
    list.appendChild(createCard(task));
  });
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

  const assignee = (task.assignees && task.assignees[0]) || "";
  const badgeHtml = assignee ? `<span class="badge">${esc(assignee)}</span>` : "";

  let dueDateHtml = "";
  if (dueDate) {
    const cls = isOverdue ? "due-date overdue" : "due-date";
    dueDateHtml = `<span class="${cls}">${dueDate}</span>`;
  }

  const next = nextMap[task.status];
  const advanceHtml = next
    ? `<button class="btn-advance ${next.cls}" data-next="${next.status}">${next.icon}</button>`
    : "";

  card.innerHTML = `
    ${advanceHtml}
    <div class="card-title">${esc(task.title)}</div>
    <div class="card-meta">${badgeHtml}${dueDateHtml}</div>
  `;

  // Advance button click
  const advanceBtn = card.querySelector(".btn-advance");
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

    const { error } = await sb
      .from("tasks")
      .update({ status: newStatus })
      .eq("id", taskId);

    if (error) console.error("Error updating task status:", error);
    loadBoard();
  });
});

// --- Touch Drag & Drop (mobile) ---

let touchDragCard = null;
let touchDragId = null;
let touchClone = null;
let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

document.addEventListener("touchstart", (e) => {
  const card = e.target.closest(".card");
  if (!card || e.target.closest(".btn-advance")) return;

  touchDragCard = card;
  touchDragId = card.dataset.id;
  touchMoved = false;

  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

document.addEventListener("touchmove", (e) => {
  if (!touchDragCard) return;

  const touch = e.touches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  // Only start drag after moving 10px (avoid triggering on taps)
  if (!touchMoved && Math.abs(dx) < 10 && Math.abs(dy) < 10) return;

  if (!touchMoved) {
    touchMoved = true;
    touchDragCard.classList.add("dragging");

    // Create floating clone
    touchClone = touchDragCard.cloneNode(true);
    touchClone.classList.add("touch-clone");
    const rect = touchDragCard.getBoundingClientRect();
    touchClone.style.width = rect.width + "px";
    document.body.appendChild(touchClone);
  }

  e.preventDefault();

  touchClone.style.left = touch.clientX - touchClone.offsetWidth / 2 + "px";
  touchClone.style.top = touch.clientY - touchClone.offsetHeight / 2 + "px";

  // Highlight drop target
  document.querySelectorAll(".card-list").forEach((l) => l.classList.remove("drag-over"));
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (el) {
    const targetList = el.closest(".card-list");
    if (targetList) targetList.classList.add("drag-over");
  }
}, { passive: false });

document.addEventListener("touchend", async (e) => {
  if (!touchDragCard) return;

  if (touchMoved && touchClone) {
    touchClone.remove();
    touchClone = null;
    touchDragCard.classList.remove("dragging");

    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetList = el ? el.closest(".card-list") : null;

    document.querySelectorAll(".card-list").forEach((l) => l.classList.remove("drag-over"));

    if (targetList && touchDragId) {
      const newStatus = targetList.dataset.status;
      const { error } = await sb
        .from("tasks")
        .update({ status: newStatus })
        .eq("id", touchDragId);
      if (error) console.error("Error updating task status:", error);
      loadBoard();
    }
  } else if (!touchMoved) {
    // It was a tap, not a drag — open modal
    const taskId = touchDragCard.dataset.id;
    const task = allTasks.find((t) => t.id === taskId);
    if (task) openModal(task);
  }

  touchDragCard = null;
  touchDragId = null;
  touchMoved = false;
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
    allAssignees.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join("");

  if (task) {
    modalTitle.textContent = "Modifica Task";
    formId.value = task.id;
    formTitle.value = task.title;
    formStatus.value = task.status;
    formDue.value = task.due_date || "";
    const assignee = (task.assignees && task.assignees[0]) || "";
    formAssignee.value = assignee;
    btnDelete.classList.remove("hidden");
  } else {
    modalTitle.textContent = "Nuova Task";
    btnDelete.classList.add("hidden");
  }

  overlay.classList.remove("hidden");
  formTitle.focus();
}

function closeModal() {
  overlay.classList.add("hidden");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const assignee = formAssignee.value;

  const payload = {
    title: formTitle.value.trim(),
    status: formStatus.value,
    assignees: assignee ? [assignee] : [],
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
