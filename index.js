const express = require("express");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "elysia_verify_token";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

const SITE_URL = "https://elysia-jewellery.com";

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
    const message =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;

    if (message.type === "text") {
      const text = message.text?.body?.trim().toLowerCase();

      if (
        ["היי", "hi", "hello", "start", "menu", "תפריט"].includes(text)
      ) {
        await sendMainMenu(from);
      }

      return res.sendStatus(200);
    }

    if (message.type === "interactive") {
      const buttonId = message.interactive?.button_reply?.id;
      const listId = message.interactive?.list_reply?.id;

      const selectedId = buttonId || listId;

      await handleSelection(from, selectedId);

      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    return res.sendStatus(200);
  }
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
      return sendText(
        to,
        `💍 טבעות Elysia

${SITE_URL}/rings`
      );

    case "necklaces":
      return sendText(
        to,
        `✨ שרשראות Elysia

${SITE_URL}/necklaces`
      );

    case "earrings":
      return sendText(
        to,
        `🤍 עגילים Elysia

${SITE_URL}/earrings`
      );

    case "bracelets":
      return sendText(
        to,
        `✨ צמידים Elysia

${SITE_URL}/bracelets`
      );

    case "all_collection":
      return sendText(
        to,
        `לצפייה במבחר המלא:

${SITE_URL}/search`
      );

    case "gifts":
      return sendText(
        to,
        `🎁 מתנות תכשיטים

${SITE_URL}/gifts`
      );

    case "size_guide":
      return sendText(
        to,
        `📏 מדריך מידות

${SITE_URL}/size-guide`
      );

    case "personal_service":
      return sendText(
        to,
        `🤍 ייעוץ אישי

שלח/י:
1. סוג תכשיט
2. תקציב
3. צבע מועדף
4. האם זו מתנה`
      );

    case "shipping":
      return sendText(
        to,
        `🚚 משלוחים והזמנות

לבדיקת הזמנה שלח/י מספר הזמנה.`
      );

    case "returns":
      return sendText(
        to,
        `החלפות והחזרות

${SITE_URL}/terms`
      );

    case "human":
      return sendText(
        to,
        `🤍 נציג אנושי יחזור אליך בהקדם.`
      );

    case "about":
      return sendText(
        to,
        `Elysia Jewellery

${SITE_URL}/about`
      );

    case "main_menu":
      return sendMainMenu(to);

    default:
      return sendMainMenu(to);
  }
}

async function sendMainMenu(to) {
  await fetch(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
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
            text: "✨ ברוכים הבאים ל־Elysia Jewellery\nאיך אפשר לעזור?",
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "menu_collections",
                  title: "קולקציות",
                },
              },
              {
                type: "reply",
                reply: {
                  id: "menu_service",
                  title: "שירות",
                },
              },
              {
                type: "reply",
                reply: {
                  id: "menu_help_choose",
                  title: "ייעוץ אישי",
                },
              },
            ],
          },
        },
      }),
    }
  );
}

async function sendCollectionsMenu(to) {
  await fetch(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
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
            text: "בחר/י קטגוריה:",
          },
          action: {
            button: "פתיחת תפריט",
            sections: [
              {
                title: "קולקציות",
                rows: [
                  {
                    id: "all_collection",
                    title: "כל הקולקציה",
                  },
                  {
                    id: "rings",
                    title: "טבעות",
                  },
                  {
                    id: "necklaces",
                    title: "שרשראות",
                  },
                  {
                    id: "earrings",
                    title: "עגילים",
                  },
                  {
                    id: "bracelets",
                    title: "צמידים",
                  },
                  {
                    id: "gifts",
                    title: "מתנות",
                  },
                ],
              },
              {
                title: "ניווט",
                rows: [
                  {
                    id: "main_menu",
                    title: "חזרה לתפריט הראשי",
                  },
                ],
              },
            ],
          },
        },
      }),
    }
  );
}

async function sendServiceMenu(to) {
  await fetch(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
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
                title: "שירות",
                rows: [
                  {
                    id: "personal_service",
                    title: "שירות אישי",
                  },
                  {
                    id: "size_guide",
                    title: "מדריך מידות",
                  },
                  {
                    id: "shipping",
                    title: "משלוחים",
                  },
                  {
                    id: "returns",
                    title: "החלפות והחזרות",
                  },
                  {
                    id: "human",
                    title: "נציג אנושי",
                  },
                  {
                    id: "about",
                    title: "אודות",
                  },
                ],
              },
              {
                title: "ניווט",
                rows: [
                  {
                    id: "main_menu",
                    title: "חזרה לתפריט הראשי",
                  },
                ],
              },
            ],
          },
        },
      }),
    }
  );
}

async function sendChooseHelp(to) {
  await sendText(
    to,
    `🤍 ייעוץ אישי לבחירת תכשיט

שלח/י:
1. סוג תכשיט
2. תקציב
3. צבע מועדף
4. האם זו מתנה`
  );
}

async function sendText(to, text) {
  await fetch(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
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
    }
  );
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

 