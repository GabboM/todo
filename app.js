// --- Supabase Config ---
// Replace these with your actual Supabase project values
const SUPABASE_URL = "https://qoachpijtlbsxeyabdpl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-vYudRVg3UUVYGEHV55_Pw_bJEfiW1c";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let allAssignees = [];

// --- Auth ---

const loginSection = document.getElementById("login-section");
const appSection = document.getElementById("app-section");
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
  renderTasks(tasksRes.data || []);
}

function renderTasks(tasks) {
  document.querySelectorAll(".card-list").forEach((list) => {
    list.innerHTML = "";
  });

  tasks.forEach((task) => {
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

  const badges = (task.assignees || [])
    .map((a) => `<span class="badge">${esc(a)}</span>`)
    .join("");

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
    <div class="card-meta">${badges}${dueDateHtml}</div>
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

  // Drag events
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

// --- Drag & Drop ---

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

// --- Modal ---

const overlay = document.getElementById("modal-overlay");
const form = document.getElementById("task-form");
const formId = document.getElementById("form-id");
const formTitle = document.getElementById("form-title");
const formStatus = document.getElementById("form-status");
const formDue = document.getElementById("form-due");
const formAssignees = document.getElementById("form-assignees");
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

  // Build assignee checkboxes
  formAssignees.innerHTML = allAssignees
    .map(
      (a) => `
    <label>
      <input type="checkbox" value="${esc(a)}" ${
        task && task.assignees.includes(a) ? "checked" : ""
      }>
      ${esc(a)}
    </label>`
    )
    .join("");

  if (task) {
    modalTitle.textContent = "Modifica Task";
    formId.value = task.id;
    formTitle.value = task.title;
    formStatus.value = task.status;
    formDue.value = task.due_date || "";
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
  const selectedAssignees = [
    ...formAssignees.querySelectorAll("input:checked"),
  ].map((cb) => cb.value);

  const payload = {
    title: formTitle.value.trim(),
    status: formStatus.value,
    assignees: selectedAssignees,
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
