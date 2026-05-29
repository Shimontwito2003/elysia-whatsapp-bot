let CURRENT_USER = null;
let CURRENT_CHAT = null;
let CUSTOMERS = [];
let CURRENT_FILTER = "all";

const API = "";

async function login() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    const data = await res.json();

    if (!data.success) {
      document.getElementById("loginError").innerText =
        data.message || "שגיאת התחברות";
      return;
    }

    CURRENT_USER = data.user;

    localStorage.setItem(
      "elysia_user",
      JSON.stringify(data.user)
    );

    document.getElementById("currentUser").innerText =
      `${data.user.full_name}`;

    document.getElementById("loginScreen")
      .classList.add("hidden");

    document.getElementById("appScreen")
      .classList.remove("hidden");

    loadCustomers();

  } catch (err) {
    console.error(err);
    document.getElementById("loginError").innerText =
      "שגיאת שרת";
  }
}

function logout() {
  localStorage.removeItem("elysia_user");
  location.reload();
}

window.addEventListener("load", () => {
  const savedUser =
    localStorage.getItem("elysia_user");

  if (!savedUser) return;

  CURRENT_USER = JSON.parse(savedUser);

  document.getElementById("currentUser").innerText =
    CURRENT_USER.full_name;

  document.getElementById("loginScreen")
    .classList.add("hidden");

  document.getElementById("appScreen")
    .classList.remove("hidden");

  loadCustomers();
});

function setFilter(filter) {
  CURRENT_FILTER = filter;

  document
    .querySelectorAll(".tab")
    .forEach(btn => btn.classList.remove("active"));

  const activeBtn =
    document.querySelector(
      `[data-filter="${filter}"]`
    );

  if (activeBtn)
    activeBtn.classList.add("active");

  loadCustomers();
}

async function loadCustomers() {

  try {

    const search =
      document.getElementById("searchInput")
      ?.value || "";

    const res = await fetch(
      `/api/customers?filter=${CURRENT_FILTER}&search=${encodeURIComponent(search)}`
    );

    const data = await res.json();

    CUSTOMERS = data || [];

    const list =
      document.getElementById("chatList");

    list.innerHTML = "";

    CUSTOMERS.forEach(customer => {

      const div =
        document.createElement("div");

      div.className = "chat-item";

      if (
        CURRENT_CHAT &&
        CURRENT_CHAT.id === customer.id
      ) {
        div.classList.add("active");
      }

      div.onclick = () =>
        openChat(customer);

      div.innerHTML = `
        <div class="chat-name">
          ${customer.name || customer.phone}
        </div>

        <div class="chat-last">
          ${customer.last_message || ""}
        </div>
      `;

      list.appendChild(div);
    });

  } catch (err) {
    console.error(err);
  }
}
async function openChat(customer) {
  CURRENT_CHAT = customer;

  document.getElementById("chatTitle").innerText =
    customer.customer_name || customer.name || customer.phone;

  document.getElementById("chatSubtitle").innerText =
    `עודכן: ${customer.updated_at_il || ""}`;

  document.getElementById("customerName").value =
    customer.customer_name || customer.name || "";

  document.getElementById("customerPhone").value =
    customer.phone || "";

  document.getElementById("customerStatus").value =
    customer.status || "חדש";

  document.getElementById("customerPriority").value =
    customer.priority || "normal";

  document.getElementById("customerTags").value =
    customer.tags || "";

  document.getElementById("customerNote").value =
    customer.note || "";

  document.getElementById("createdAt").innerText =
    customer.created_at_il || "";

  document.getElementById("updatedAt").innerText =
    customer.updated_at_il || "";

  document.getElementById("chatMode").innerText =
    customer.chat_mode || "bot";

  document
    .querySelectorAll(".chat-item")
    .forEach(item => item.classList.remove("active"));

  loadMessages(customer.phone);
  markViewed(customer.phone);
}

async function loadMessages(phone) {
  const box = document.getElementById("messagesBox");

  box.innerHTML = "";

  try {
    const res = await fetch(
      `/api/customers/${phone}/messages`
    );

    const messages = await res.json();

    if (!messages.length) {
      box.innerHTML =
        `<div class="empty-state">אין הודעות להצגה</div>`;
      return;
    }

    messages.forEach(msg => {
      if (msg.deleted) return;

      const div = document.createElement("div");

      div.className =
        msg.sender === "customer"
          ? "message customer"
          : "message agent";

      div.innerHTML = `
        <div>${escapeHtml(msg.message || "")}</div>
        <div class="message-time">
          ${msg.created_at_il || ""}
        </div>
      `;

      box.appendChild(div);
    });

    box.scrollTop = box.scrollHeight;

  } catch (err) {
    console.error(err);
    box.innerHTML =
      `<div class="empty-state">שגיאה בטעינת הודעות</div>`;
  }
}

async function sendReply() {
  if (!CURRENT_CHAT) return;

  const textarea =
    document.getElementById("replyText");

  let message = textarea.value.trim();

  if (!message) return;

  const useSignature =
    document.getElementById("useSignature").checked;

  if (
    useSignature &&
    CURRENT_USER &&
    CURRENT_USER.signature
  ) {
    message += `\n\n${CURRENT_USER.signature}`;
  }

  try {
    const res = await fetch("/api/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone: CURRENT_CHAT.phone,
        message,
        user_id: CURRENT_USER.id
      })
    });

    const data = await res.json();

    if (!data.success) {
      alert(data.message || "שליחת ההודעה נכשלה");
      return;
    }

    textarea.value = "";

    await loadMessages(CURRENT_CHAT.phone);
    await loadCustomers();

  } catch (err) {
    console.error(err);
    alert("שגיאת שרת בשליחת הודעה");
  }
}

function applyQuickReply() {
  const select =
    document.getElementById("quickReplySelect");

  const textarea =
    document.getElementById("replyText");

  if (!select.value) return;

  textarea.value = select.value;
  select.value = "";
}

async function saveCustomer() {
  if (!CURRENT_CHAT) return;

  const body = {
    phone: CURRENT_CHAT.phone,
    customer_name:
      document.getElementById("customerName").value,
    status:
      document.getElementById("customerStatus").value,
    priority:
      document.getElementById("customerPriority").value,
    tags:
      document.getElementById("customerTags").value,
    note:
      document.getElementById("customerNote").value,
    user_id: CURRENT_USER.id
  };

  try {
    const res = await fetch("/api/customer/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!data.success) {
      alert(data.message || "שמירה נכשלה");
      return;
    }

    await loadCustomers();

  } catch (err) {
    console.error(err);
    alert("שגיאת שרת");
  }
}
async function markViewed(phone) {
  if (!CURRENT_USER) return;

  try {
    await fetch("/api/chat/view", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone,
        user_id: CURRENT_USER.id
      })
    });
  } catch (err) {
    console.error(err);
  }
}

async function pinChat() {
  if (!CURRENT_CHAT) return;

  try {
    const res = await fetch("/api/chat/pin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone: CURRENT_CHAT.phone,
        user_id: CURRENT_USER.id
      })
    });

    const data = await res.json();

    if (!data.success) {
      alert("פעולת הנעיצה נכשלה");
      return;
    }

    await loadCustomers();

  } catch (err) {
    console.error(err);
  }
}

async function startHandling() {
  if (!CURRENT_CHAT) return;

  try {
    const res = await fetch("/api/chat/start-handling", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone: CURRENT_CHAT.phone,
        user_id: CURRENT_USER.id
      })
    });

    const data = await res.json();

    if (!data.success) {
      alert("לא ניתן להתחיל טיפול");
      return;
    }

    alert("הטיפול התחיל");
    await loadCustomers();

  } catch (err) {
    console.error(err);
  }
}

async function stopHandling() {
  if (!CURRENT_CHAT) return;

  try {
    const res = await fetch("/api/chat/stop-handling", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone: CURRENT_CHAT.phone,
        user_id: CURRENT_USER.id
      })
    });

    const data = await res.json();

    if (!data.success) {
      alert("לא ניתן לסיים טיפול");
      return;
    }

    alert("הטיפול הסתיים");
    await loadCustomers();

  } catch (err) {
    console.error(err);
  }
}

async function returnToBot() {
  if (!CURRENT_CHAT) return;

  try {
    const res = await fetch("/api/chat/return-to-bot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone: CURRENT_CHAT.phone,
        user_id: CURRENT_USER.id
      })
    });

    const data = await res.json();

    if (!data.success) {
      alert("לא ניתן להחזיר לבוט");
      return;
    }

    alert("הצ'אט הוחזר לבוט");
    await loadCustomers();

  } catch (err) {
    console.error(err);
  }
}

async function archiveChat() {
  if (!CURRENT_CHAT) return;

  try {
    const res = await fetch("/api/chat/archive", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone: CURRENT_CHAT.phone,
        user_id: CURRENT_USER.id
      })
    });

    const data = await res.json();

    if (!data.success) {
      alert("לא ניתן להעביר לארכיון");
      return;
    }

    CURRENT_CHAT = null;

    document.getElementById("messagesBox").innerHTML =
      `<div class="empty-state">בחר לקוח מהרשימה כדי לפתוח צ'אט</div>`;

    await loadCustomers();

  } catch (err) {
    console.error(err);
  }
}
function previousChat() {
  if (!CURRENT_CHAT || !CUSTOMERS.length) return;

  const index = CUSTOMERS.findIndex(
    c => c.phone === CURRENT_CHAT.phone
  );

  if (index > 0) {
    openChat(CUSTOMERS[index - 1]);
  }
}

function nextChat() {
  if (!CURRENT_CHAT || !CUSTOMERS.length) return;

  const index = CUSTOMERS.findIndex(
    c => c.phone === CURRENT_CHAT.phone
  );

  if (index < CUSTOMERS.length - 1) {
    openChat(CUSTOMERS[index + 1]);
  }
}

function toggleCustomerPanel() {
  const panel =
    document.getElementById("customerPanel");

  panel.classList.toggle("hidden");
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

setInterval(() => {
  if (
    CURRENT_USER &&
    !document.getElementById("appScreen")
      .classList.contains("hidden")
  ) {
    loadCustomers();

    if (CURRENT_CHAT) {
      loadMessages(CURRENT_CHAT.phone);
    }
  }
}, 15000);