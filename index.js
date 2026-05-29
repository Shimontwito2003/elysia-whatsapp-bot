const express = require("express");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "elysia_verify_token";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const SITE_URL = "https://elysia-jewellery.com";
const conversations = {};
const customerMeta = {};

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

    ensureCustomer(from);
    saveMessage(from, text || selectedId || "interactive message", "customer");

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

app.get("/admin", (req, res) => {
  const search = (req.query.search || "").trim();
  const status = req.query.status || "all";

  let customers = Object.keys(conversations);

  if (search) {
    customers = customers.filter((phone) => phone.includes(search));
  }

  if (status !== "all") {
    customers = customers.filter((phone) => customerMeta[phone]?.status === status);
  }

  const total = Object.keys(conversations).length;
  const newCount = Object.keys(customerMeta).filter((p) => customerMeta[p].status === "new").length;
  const activeCount = Object.keys(customerMeta).filter((p) => customerMeta[p].status === "active").length;
  const doneCount = Object.keys(customerMeta).filter((p) => customerMeta[p].status === "done").length;

  const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Elysia CRM</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #111;
      color: #fff;
      padding: 14px;
      margin: 0;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 12px;
      color: #d6b56d;
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
      border-radius: 12px;
      padding: 12px;
      text-align: center;
    }
    .stat strong {
      display: block;
      color: #d6b56d;
      font-size: 22px;
      margin-bottom: 4px;
    }
    .filters {
      background: #1c1c1c;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 14px;
    }
    input, select, textarea {
      width: 100%;
      border-radius: 8px;
      border: none;
      padding: 10px;
      margin-top: 8px;
      box-sizing: border-box;
      font-family: Arial, sans-serif;
    }
    button {
      width: 100%;
      margin-top: 8px;
      padding: 12px;
      background: #d6b56d;
      color: #111;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
    }
    .customer {
      background: #1c1c1c;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
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
    }
    .badge {
      background: #333;
      padding: 5px 8px;
      border-radius: 20px;
      font-size: 12px;
    }
    .important {
      color: #ffd76a;
      font-size: 20px;
    }
    .msg {
      background: #2a2a2a;
      padding: 10px;
      border-radius: 8px;
      margin: 6px 0;
      font-size: 14px;
      line-height: 1.45;
    }
    .customer-msg {
      border-right: 4px solid #d6b56d;
    }
    .business-msg {
      border-right: 4px solid #7da7ff;
    }
    small {
      color: #aaa;
    }
    .note {
      background: #161616;
      border: 1px dashed #555;
      padding: 10px;
      border-radius: 8px;
      margin-top: 8px;
      color: #ddd;
      white-space: pre-wrap;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }
    .empty {
      color: #aaa;
      background: #1c1c1c;
      padding: 14px;
      border-radius: 12px;
    }
    a {
      color: #d6b56d;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <h1>Elysia WhatsApp CRM</h1>

  <div class="stats">
    <div class="stat"><strong>${total}</strong>לקוחות</div>
    <div class="stat"><strong>${newCount}</strong>חדשים</div>
    <div class="stat"><strong>${activeCount}</strong>בטיפול</div>
    <div class="stat"><strong>${doneCount}</strong>טופלו</div>
  </div>

  <div class="filters">
    <form method="GET" action="/admin">
      <input name="search" placeholder="חיפוש לפי מספר טלפון" value="${escapeHtml(search)}" />
      <select name="status">
        <option value="all" ${status === "all" ? "selected" : ""}>כל הלקוחות</option>
        <option value="new" ${status === "new" ? "selected" : ""}>חדש</option>
        <option value="active" ${status === "active" ? "selected" : ""}>בטיפול</option>
        <option value="done" ${status === "done" ? "selected" : ""}>טופל</option>
      </select>
      <button type="submit">סנן</button>
    </form>
    <form method="GET" action="/admin">
      <button type="submit">רענון</button>
    </form>
  </div>

  ${
    customers.length === 0
      ? `<div class="empty">אין לקוחות להצגה.</div>`
      : customers
          .map((phone) => {
            const meta = customerMeta[phone] || {};
            const messages = conversations[phone]
              .map(
                (m) => `
                  <div class="msg ${m.sender === "customer" ? "customer-msg" : "business-msg"}">
                    <div>${m.sender === "customer" ? "לקוח" : "עסק"}: ${escapeHtml(m.text)}</div>
                    <small>${m.time}</small>
                  </div>
                `
              )
              .join("");

            return `
              <div class="customer">
                <div class="top">
                  <div>
                    <div class="phone">${phone}</div>
                    <small>עדכון אחרון: ${meta.updatedAt || ""}</small>
                  </div>
                  <div>
                    ${meta.important ? `<span class="important">★</span>` : ""}
                    <span class="badge">${statusLabel(meta.status)}</span>
                  </div>
                </div>

                ${messages}

                ${
                  meta.note
                    ? `<div class="note"><strong>הערה פנימית:</strong><br>${escapeHtml(meta.note)}</div>`
                    : ""
                }

                <form method="POST" action="/admin/reply">
                  <input type="hidden" name="to" value="${phone}" />
                  <textarea name="message" placeholder="כתוב תשובה ללקוח"></textarea>
                  <button type="submit">שלח תשובה</button>
                </form>

                <form method="POST" action="/admin/status">
                  <input type="hidden" name="phone" value="${phone}" />
                  <select name="status">
                    <option value="new" ${meta.status === "new" ? "selected" : ""}>חדש</option>
                    <option value="active" ${meta.status === "active" ? "selected" : ""}>בטיפול</option>
                    <option value="done" ${meta.status === "done" ? "selected" : ""}>טופל</option>
                  </select>
                  <button type="submit">עדכן סטטוס</button>
                </form>

                <form method="POST" action="/admin/note">
                  <input type="hidden" name="phone" value="${phone}" />
                  <textarea name="note" placeholder="הערה פנימית">${escapeHtml(meta.note || "")}</textarea>
                  <button type="submit">שמור הערה</button>
                </form>

                <div class="actions">
                  <form method="POST" action="/admin/important">
                    <input type="hidden" name="phone" value="${phone}" />
                    <button type="submit">${meta.important ? "הסר כוכב" : "סמן חשוב"}</button>
                  </form>

                  <form method="POST" action="/admin/delete" onsubmit="return confirm('למחוק לקוח מהפאנל?')">
                    <input type="hidden" name="phone" value="${phone}" />
                    <button type="submit">מחק</button>
                  </form>
                </div>
              </div>
            `;
          })
          .join("")
  }
</body>
</html>
`;

  res.send(html);
});

app.post("/admin/reply", async (req, res) => {
  const to = req.body.to;
  const message = req.body.message;

  if (to && message) {
    ensureCustomer(to);
    await sendText(to, message);
    saveMessage(to, message, "business");
  }

  res.redirect("/admin");
});

app.post("/admin/status", (req, res) => {
  const phone = req.body.phone;
  const status = req.body.status;

  if (phone && customerMeta[phone]) {
    customerMeta[phone].status = status;
    customerMeta[phone].updatedAt = now();
  }

  res.redirect("/admin");
});

app.post("/admin/note", (req, res) => {
  const phone = req.body.phone;
  const note = req.body.note || "";

  if (phone && customerMeta[phone]) {
    customerMeta[phone].note = note;
    customerMeta[phone].updatedAt = now();
  }

  res.redirect("/admin");
});

app.post("/admin/important", (req, res) => {
  const phone = req.body.phone;

  if (phone && customerMeta[phone]) {
    customerMeta[phone].important = !customerMeta[phone].important;
    customerMeta[phone].updatedAt = now();
  }

  res.redirect("/admin");
});

app.post("/admin/delete", (req, res) => {
  const phone = req.body.phone;

  if (phone) {
    delete conversations[phone];
    delete customerMeta[phone];
  }

  res.redirect("/admin");
});

function ensureCustomer(phone) {
  if (!conversations[phone]) conversations[phone] = [];

  if (!customerMeta[phone]) {
    customerMeta[phone] = {
      status: "new",
      important: false,
      note: "",
      createdAt: now(),
      updatedAt: now(),
    };
  }
}

function saveMessage(phone, text, sender) {
  ensureCustomer(phone);

  conversations[phone].push({
    text,
    sender,
    time: now(),
  });

  customerMeta[phone].updatedAt = now();

  if (sender === "customer" && customerMeta[phone].status === "done") {
    customerMeta[phone].status = "new";
  }
}

function statusLabel(status) {
  if (status === "active") return "בטיפול";
  if (status === "done") return "טופל";
  return "חדש";
}

function now() {
  return new Date().toLocaleString("he-IL");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function handleSelection(to, selectedId) {
  switch (selectedId) {
    case "menu_collections":
      return sendCollectionsMenu(to);

    case "menu_service":
      return sendServiceMenu(to);

    case "menu_help_choose":
      return sendChooseHelp(to);

    case "rings":
      return sendText(to, `טבעות Elysia 💍
${SITE_URL}/rings`);

    case "necklaces":
      return sendText(to, `שרשראות Elysia ✨
${SITE_URL}/necklaces`);

    case "earrings":
      return sendText(to, `עגילים Elysia 🤍
${SITE_URL}/earrings`);

    case "bracelets":
      return sendText(to, `צמידים Elysia
${SITE_URL}/bracelets`);

    case "all_collection":
      return sendText(to, `לצפייה במבחר המלא:
${SITE_URL}/search`);

    case "gifts":
      return sendText(to, `מתנות תכשיטים 🎁
נשמח לעזור לבחור לפי אירוע, סגנון וטווח מחיר.
${SITE_URL}/gifts`);

    case "size_guide":
      return sendText(to, `מדריך מידות 📏
${SITE_URL}/size-guide`);

    case "personal_service":
      return sendText(to, `ייעוץ אישי 🤍
שלח/י לנו:
1. למי התכשיט מיועד
2. תקציב משוער
3. סגנון מועדף
4. האם זו מתנה או קנייה אישית`);

    case "shipping":
      return sendText(to, `משלוחים והזמנות 🚚
לשאלה על הזמנה קיימת, שלח/י מספר הזמנה ונבדוק עבורך.`);

    case "returns":
      return sendText(to, `החלפות והחזרות
${SITE_URL}/terms`);

    case "human":
      return sendText(to, `נציג אנושי יחזור אליך בהקדם 🤍
אפשר לכתוב כאן את השאלה.`);

    case "about":
      return sendText(to, `אודות Elysia
${SITE_URL}/about`);

    case "main_menu":
      return sendMainMenu(to);

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
        body: { text: "בחר/י קטגוריה מתוך הקולקציה:" },
        action: {
          button: "פתיחת תפריט",
          sections: [
            {
              title: "הקולקציה",
              rows: [
                { id: "all_collection", title: "כל הקולקציה", description: "צפייה במבחר המלא" },
                { id: "rings", title: "טבעות", description: "טבעות בקו נקי ועדין" },
                { id: "necklaces", title: "שרשראות", description: "שרשראות ליום ולערב" },
                { id: "earrings", title: "עגילים", description: "עגילים אלגנטיים" },
                { id: "bracelets", title: "צמידים", description: "צמידים עדינים" },
                { id: "gifts", title: "מתנות", description: "בחירה לפי אירוע ותקציב" },
              ],
            },
            {
              title: "ניווט",
              rows: [{ id: "main_menu", title: "חזרה לתפריט הראשי" }],
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
        body: { text: "בחר/י נושא שירות:" },
        action: {
          button: "פתיחת תפריט",
          sections: [
            {
              title: "שירות והזמנה",
              rows: [
                { id: "personal_service", title: "שירות אישי", description: "עזרה לפני הזמנה" },
                { id: "size_guide", title: "מדריך מידות", description: "התאמת מידה לפני רכישה" },
                { id: "shipping", title: "משלוחים", description: "שאלה על הזמנה או מסירה" },
                { id: "returns", title: "החלפות והחזרות", description: "מידע ותמיכה לאחר רכישה" },
                { id: "human", title: "נציג אנושי", description: "מעבר לשיחה עם נציג" },
                { id: "about", title: "אודות Elysia", description: "מידע על המותג" },
              ],
            },
            {
              title: "ניווט",
              rows: [{ id: "main_menu", title: "חזרה לתפריט הראשי" }],
            },
          ],
        },
      },
    }),
  });
}

async function sendChooseHelp(to) {
  await sendText(to, `ייעוץ אישי לבחירת תכשיט 🤍

כדי לדייק לך בחירה, שלח/י לנו:
1. למי התכשיט מיועד
2. סוג תכשיט: טבעת, שרשרת, עגילים או צמיד
3. צבע מועדף: זהב, כסף או זהב ורוד
4. תקציב משוער
5. האם זו מתנה או קנייה אישית

נציג יחזור עם המלצה מתאימה.`);
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
      text: { body: text },
    }),
  });
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

 

 