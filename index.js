const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/admin-static", express.static(path.join(__dirname, "public")));
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "elysia_verify_token";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SITE_URL = "https://elysia-jewellery.com";

function sbHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: sbHeaders(options.headers || {}),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("Supabase error:", text);
    throw new Error(text);
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status) {
  if (status === "active") return "בטיפול";
  if (status === "waiting") return "ממתין";
  if (status === "done") return "טופל";
  return "חדש";
}

async function ensureCustomer(phone, lastMessage = "") {
  await sb("customers?on_conflict=phone", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      phone,
      status: "חדש",
      priority: "רגיל",
      archived: false,
      last_message: lastMessage,
      updated_at: nowIso(),
    }),
  });
}

async function saveMessage(phone, text, sender) {
  await ensureCustomer(phone, text);

  await sb("messages", {
    method: "POST",
    body: JSON.stringify({
      customer_phone: phone,
      sender,
      message: text,
    }),
  });

  await sb(`customers?phone=eq.${phone}`, {
    method: "PATCH",
    body: JSON.stringify({
      last_message: text,
      updated_at: nowIso(),
      archived: false,
    }),
  });
}

async function getCustomers() {
  return sb("customers?select=*&order=updated_at.desc");
}

async function getMessages(phone) {
  return sb(`messages?select=*&customer_phone=eq.${phone}&order=created_at.asc`);
}

app.get("/", (req, res) => {
  res.status(200).send("WhatsApp bot is running");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!mode && !token && !challenge) {
    return res.status(200).send("Webhook endpoint is running");
  }

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send("Forbidden");
});

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body || "";
    const buttonId = message.interactive?.button_reply?.id;
    const listId = message.interactive?.list_reply?.id;
    const selectedId = buttonId || listId;

    await saveMessage(from, text || selectedId || "interactive message", "customer");

    if (message.type === "text") {
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    if (message.type === "interactive") {
      await handleSelection(from, selectedId);
      return res.sendStatus(200);
    }

    await sendMainMenu(from);
    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    return res.sendStatus(200);
  }
});

app.get("/admin", async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const status = req.query.status || "all";
    const archive = req.query.archive === "1";

    let customers = await getCustomers();

    customers = customers.filter((c) => Boolean(c.archived) === archive);

    if (search) {
      customers = customers.filter((c) =>
        [c.phone, c.name, c.last_message, c.tags]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    }

    if (status !== "all") {
      customers = customers.filter((c) => c.status === status);
    }

    const allCustomers = await getCustomers();
    const total = allCustomers.filter((c) => !c.archived).length;
    const archived = allCustomers.filter((c) => c.archived).length;
    const newCount = allCustomers.filter((c) => !c.archived && c.status === "חדש").length;
    const activeCount = allCustomers.filter((c) => !c.archived && c.status === "active").length;

    const customerCards = await Promise.all(
      customers.map(async (c) => {
        const messages = await getMessages(c.phone);

        return `
          <div class="customer">
            <div class="top">
              <div>
                <div class="phone">${escapeHtml(c.phone)}</div>
                <small>עדכון אחרון: ${new Date(c.updated_at).toLocaleString("he-IL")}</small>
              </div>
              <div>
                <span class="badge">${statusLabel(c.status)}</span>
                <span class="badge">${escapeHtml(c.priority || "רגיל")}</span>
              </div>
            </div>

            <form method="POST" action="/admin/profile">
              <input type="hidden" name="phone" value="${escapeHtml(c.phone)}" />
              <input name="name" placeholder="שם לקוח" value="${escapeHtml(c.name || "")}" />
              <input name="tags" placeholder="תגים, לדוגמה: טבעת, מתנה, VIP" value="${escapeHtml(c.tags || "")}" />
              <button type="submit">שמור פרטי לקוח</button>
            </form>

            ${messages
              .map(
                (m) => `
                  <div class="msg ${m.sender === "customer" ? "customer-msg" : "business-msg"}">
                    <div>${m.sender === "customer" ? "לקוח" : "עסק"}: ${escapeHtml(m.message)}</div>
                    <small>${new Date(m.created_at).toLocaleString("he-IL")}</small>
                  </div>
                `
              )
              .join("")}

            ${
              c.note
                ? `<div class="note"><strong>הערה פנימית:</strong><br>${escapeHtml(c.note)}</div>`
                : ""
            }

            <form method="POST" action="/admin/reply">
              <input type="hidden" name="to" value="${escapeHtml(c.phone)}" />
              <textarea name="message" placeholder="כתוב תשובה ללקוח"></textarea>
              <button type="submit">שלח תשובה</button>
            </form>

            <form method="POST" action="/admin/quick-reply">
              <input type="hidden" name="to" value="${escapeHtml(c.phone)}" />
              <select name="message">
                <option value="">בחר תשובה מהירה</option>
                <option value="שלום וברוכים הבאים ל-Elysia Jewellery. איך אפשר לעזור?">ברכה כללית</option>
                <option value="נציג אנושי יחזור אליך בהקדם. ניתן לכתוב כאן את השאלה.">נציג יחזור</option>
                <option value="נשמח לעזור בבחירת תכשיט. שלח/י סוג תכשיט, תקציב וסגנון מועדף.">עזרה בבחירה</option>
                <option value="לשאלה על הזמנה קיימת, שלח/י מספר הזמנה ונבדוק עבורך.">בדיקת הזמנה</option>
                <option value="תודה שפנית אלינו. הטיפול נסגר, ונשמח לעזור שוב בכל עת.">סיום טיפול</option>
              </select>
              <button type="submit">שלח תשובה מהירה</button>
            </form>

            <form method="POST" action="/admin/status">
              <input type="hidden" name="phone" value="${escapeHtml(c.phone)}" />
              <select name="status">
                <option value="חדש" ${c.status === "חדש" ? "selected" : ""}>חדש</option>
                <option value="active" ${c.status === "active" ? "selected" : ""}>בטיפול</option>
                <option value="waiting" ${c.status === "waiting" ? "selected" : ""}>ממתין ללקוח</option>
                <option value="done" ${c.status === "done" ? "selected" : ""}>טופל</option>
              </select>
              <select name="priority">
                <option value="רגיל" ${c.priority === "רגיל" ? "selected" : ""}>רגיל</option>
                <option value="חשוב" ${c.priority === "חשוב" ? "selected" : ""}>חשוב</option>
                <option value="דחוף" ${c.priority === "דחוף" ? "selected" : ""}>דחוף</option>
                <option value="VIP" ${c.priority === "VIP" ? "selected" : ""}>VIP</option>
              </select>
              <button type="submit">עדכן סטטוס ועדיפות</button>
            </form>

            <form method="POST" action="/admin/note">
              <input type="hidden" name="phone" value="${escapeHtml(c.phone)}" />
              <textarea name="note" placeholder="הערה פנימית">${escapeHtml(c.note || "")}</textarea>
              <button type="submit">שמור הערה</button>
            </form>

            <div class="actions">
              <form method="POST" action="/admin/archive">
                <input type="hidden" name="phone" value="${escapeHtml(c.phone)}" />
                <input type="hidden" name="archive" value="${archive ? "0" : "1"}" />
                <button type="submit">${archive ? "החזר מארכיון" : "העבר לארכיון"}</button>
              </form>

              <a class="wa" href="https://wa.me/${escapeHtml(c.phone)}" target="_blank">פתח WhatsApp</a>
            </div>
          </div>
        `;
      })
    );

    res.send(`
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Elysia WhatsApp CRM</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #111;
      color: #fff;
      padding: 14px;
      margin: 0;
    }
    h1 {
      color: #d6b56d;
      font-size: 26px;
      text-align: center;
      margin-bottom: 16px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }
    .stat {
      background: #1c1c1c;
      border: 1px solid #333;
      border-radius: 14px;
      padding: 14px;
      text-align: center;
    }
    .stat strong {
      display: block;
      color: #d6b56d;
      font-size: 24px;
    }
    .filters,
    .customer {
      background: #1c1c1c;
      border: 1px solid #333;
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 14px;
    }
    input,
    select,
    textarea {
      width: 100%;
      border-radius: 10px;
      border: none;
      padding: 12px;
      margin-top: 8px;
      box-sizing: border-box;
      font-family: Arial, sans-serif;
      font-size: 15px;
    }
    button,
    .wa {
      display: block;
      width: 100%;
      box-sizing: border-box;
      margin-top: 8px;
      padding: 12px;
      background: #d6b56d;
      color: #111;
      border: none;
      border-radius: 10px;
      font-weight: bold;
      text-align: center;
      text-decoration: none;
      font-size: 15px;
    }
    .top {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
    }
    .phone {
      font-weight: bold;
      color: #d6b56d;
      direction: ltr;
      font-size: 20px;
    }
    .badge {
      background: #333;
      padding: 6px 10px;
      border-radius: 20px;
      font-size: 12px;
      display: inline-block;
      margin: 2px;
    }
    .msg {
      background: #2a2a2a;
      padding: 10px;
      border-radius: 10px;
      margin: 7px 0;
      line-height: 1.5;
    }
    .customer-msg {
      border-right: 4px solid #d6b56d;
    }
    .business-msg {
      border-right: 4px solid #7da7ff;
    }
    .note {
      background: #161616;
      border: 1px dashed #555;
      padding: 10px;
      border-radius: 10px;
      margin-top: 8px;
      white-space: pre-wrap;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    small {
      color: #aaa;
    }
  </style>
</head>
<body>
  <h1>Elysia WhatsApp CRM</h1>

  <div class="stats">
    <div class="stat"><strong>${total}</strong>לקוחות פעילים</div>
    <div class="stat"><strong>${newCount}</strong>חדשים</div>
    <div class="stat"><strong>${activeCount}</strong>בטיפול</div>
    <div class="stat"><strong>${archived}</strong>ארכיון</div>
  </div>

  <div class="filters">
    <form method="GET" action="/admin">
      <input name="search" placeholder="חיפוש לפי מספר, שם, הודעה או תג" value="${escapeHtml(search)}" />
      <select name="status">
        <option value="all" ${status === "all" ? "selected" : ""}>כל הסטטוסים</option>
        <option value="חדש" ${status === "חדש" ? "selected" : ""}>חדש</option>
        <option value="active" ${status === "active" ? "selected" : ""}>בטיפול</option>
        <option value="waiting" ${status === "waiting" ? "selected" : ""}>ממתין</option>
        <option value="done" ${status === "done" ? "selected" : ""}>טופל</option>
      </select>
      <input type="hidden" name="archive" value="${archive ? "1" : "0"}" />
      <button type="submit">סנן</button>
    </form>

    <form method="GET" action="/admin">
      <input type="hidden" name="archive" value="${archive ? "0" : "1"}" />
      <button type="submit">${archive ? "הצג לקוחות פעילים" : "פתח ארכיון"}</button>
    </form>

    <form method="GET" action="/admin">
      <button type="submit">רענון</button>
    </form>
  </div>

  ${customerCards.length ? customerCards.join("") : `<div class="customer">אין לקוחות להצגה.</div>`}
</body>
</html>
    `);
  } catch (error) {
    console.error("Admin error:", error);
    res.status(500).send("Admin error. Check Render logs.");
  }
});

app.post("/admin/reply", async (req, res) => {
  const to = req.body.to;
  const message = req.body.message;

  if (to && message) {
    await sendText(to, message);
    await saveMessage(to, message, "business");
  }

  res.redirect("/admin");
});

app.post("/admin/quick-reply", async (req, res) => {
  const to = req.body.to;
  const message = req.body.message;

  if (to && message) {
    await sendText(to, message);
    await saveMessage(to, message, "business");
  }

  res.redirect("/admin");
});

app.post("/admin/status", async (req, res) => {
  await sb(`customers?phone=eq.${req.body.phone}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: req.body.status,
      priority: req.body.priority,
      updated_at: nowIso(),
    }),
  });

  res.redirect("/admin");
});

app.post("/admin/profile", async (req, res) => {
  await sb(`customers?phone=eq.${req.body.phone}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: req.body.name || null,
      tags: req.body.tags || null,
      updated_at: nowIso(),
    }),
  });

  res.redirect("/admin");
});

app.post("/admin/note", async (req, res) => {
  await sb(`customers?phone=eq.${req.body.phone}`, {
    method: "PATCH",
    body: JSON.stringify({
      note: req.body.note || null,
      updated_at: nowIso(),
    }),
  });

  res.redirect("/admin");
});

app.post("/admin/archive", async (req, res) => {
  const archived = req.body.archive === "1";

  await sb(`customers?phone=eq.${req.body.phone}`, {
    method: "PATCH",
    body: JSON.stringify({
      archived,
      status: archived ? "done" : "חדש",
      updated_at: nowIso(),
    }),
  });

  res.redirect(archived ? "/admin" : "/admin?archive=1");
});

async function handleSelection(to, selectedId) {
  switch (selectedId) {
    case "menu_collections":
      return sendCollectionsMenu(to);

    case "menu_service":
      return sendServiceMenu(to);

    case "menu_help_choose":
      return sendChooseHelp(to);

    case "rings":
      return sendText(to, `טבעות Elysia 💍\n${SITE_URL}/rings`);

    case "necklaces":
      return sendText(to, `שרשראות Elysia ✨\n${SITE_URL}/necklaces`);

    case "earrings":
      return sendText(to, `עגילים Elysia 🤍\n${SITE_URL}/earrings`);

    case "bracelets":
      return sendText(to, `צמידים Elysia\n${SITE_URL}/bracelets`);

    case "all_collection":
      return sendText(to, `לצפייה במבחר המלא:\n${SITE_URL}/search`);

    case "gifts":
      return sendText(to, `מתנות תכשיטים 🎁\n${SITE_URL}/gifts`);

    case "size_guide":
      return sendText(to, `מדריך מידות 📏\n${SITE_URL}/size-guide`);

    case "personal_service":
      return sendText(to, "ייעוץ אישי 🤍\nשלח/י לנו למי התכשיט מיועד, תקציב, סגנון והאם זו מתנה.");

    case "shipping":
      return sendText(to, "משלוחים והזמנות 🚚\nלשאלה על הזמנה קיימת, שלח/י מספר הזמנה.");

    case "returns":
      return sendText(to, `החלפות והחזרות\n${SITE_URL}/terms`);

    case "human":
      return sendText(to, "נציג אנושי יחזור אליך בהקדם 🤍\nאפשר לכתוב כאן את השאלה.");

    case "about":
      return sendText(to, `אודות Elysia\n${SITE_URL}/about`);

    default:
      return sendMainMenu(to);
  }
}

async function sendMainMenu(to) {
  await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "ברוכים הבאים ל־Elysia Jewellery ✨\nאיך אפשר לעזור?",
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "menu_collections", title: "קולקציות" } },
            { type: "reply", reply: { id: "menu_service", title: "שירות והזמנה" } },
            { type: "reply", reply: { id: "menu_help_choose", title: "ייעוץ אישי" } },
          ],
        },
      },
    }),
  });
}

async function sendCollectionsMenu(to) {
  await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: {
          text: "בחר/י קטגוריה מתוך הקולקציה:",
        },
        action: {
          button: "פתיחת תפריט",
          sections: [
            {
              title: "הקולקציה",
              rows: [
                { id: "all_collection", title: "כל הקולקציה" },
                { id: "rings", title: "טבעות" },
                { id: "necklaces", title: "שרשראות" },
                { id: "earrings", title: "עגילים" },
                { id: "bracelets", title: "צמידים" },
                { id: "gifts", title: "מתנות" },
              ],
            },
          ],
        },
      },
    }),
  });
}

async function sendServiceMenu(to) {
  await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: {
          text: "בחר/י נושא שירות:",
        },
        action: {
          button: "פתיחת תפריט",
          sections: [
            {
              title: "שירות והזמנה",
              rows: [
                { id: "personal_service", title: "שירות אישי" },
                { id: "size_guide", title: "מדריך מידות" },
                { id: "shipping", title: "משלוחים" },
                { id: "returns", title: "החלפות והחזרות" },
                { id: "human", title: "נציג אנושי" },
                { id: "about", title: "אודות Elysia" },
              ],
            },
          ],
        },
      },
    }),
  });
}

async function sendChooseHelp(to) {
  await sendText(
    to,
    "ייעוץ אישי לבחירת תכשיט 🤍\nשלח/י סוג תכשיט, צבע, תקציב ולמי הוא מיועד."
  );
}

async function sendText(to, text) {
  await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body: text,
      },
    }),
  });
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

 

 