const express = require("express");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "elysia_verify_token";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const SITE_URL = "https://elysia-jewellery.com";
const conversations = {};

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

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body || "";
    const buttonId = message.interactive?.button_reply?.id;
    const listId = message.interactive?.list_reply?.id;
    const selectedId = buttonId || listId;

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
  const customers = Object.keys(conversations);

  const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Elysia Admin</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #111;
      color: #fff;
      padding: 16px;
      margin: 0;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 16px;
    }
    .customer {
      background: #1c1c1c;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .phone {
      font-weight: bold;
      color: #d6b56d;
      margin-bottom: 10px;
    }
    .msg {
      background: #2a2a2a;
      padding: 10px;
      border-radius: 8px;
      margin: 6px 0;
      font-size: 14px;
    }
    .customer-msg {
      border-right: 4px solid #d6b56d;
    }
    .business-msg {
      border-right: 4px solid #7da7ff;
    }
    textarea {
      width: 100%;
      min-height: 70px;
      border-radius: 8px;
      border: none;
      padding: 10px;
      margin-top: 10px;
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
    .empty {
      color: #aaa;
      background: #1c1c1c;
      padding: 14px;
      border-radius: 12px;
    }
  </style>
</head>
<body>
  <h1>פאנל ניהול Elysia</h1>

  ${
    customers.length === 0
      ? `<div class="empty">עדיין אין הודעות מלקוחות.</div>`
      : customers
          .map((phone) => {
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
                <div class="phone">${phone}</div>
                ${messages}
                <form method="POST" action="/admin/reply">
                  <input type="hidden" name="to" value="${phone}" />
                  <textarea name="message" placeholder="כתוב תשובה ללקוח"></textarea>
                  <button type="submit">שלח תשובה</button>
                </form>
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
    await sendText(to, message);
    saveMessage(to, message, "business");
  }

  res.redirect("/admin");
});

function saveMessage(phone, text, sender) {
  if (!conversations[phone]) {
    conversations[phone] = [];
  }

  conversations[phone].push({
    text,
    sender,
    time: new Date().toLocaleString("he-IL"),
  });
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

 

 