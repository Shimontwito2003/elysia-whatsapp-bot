const express = require("express");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "elysia_verify_token";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

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
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const from = message?.from;

  if (from) {
    await sendMenu(from);
  }

  res.sendStatus(200);
});

async function sendMenu(to) {
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
            {
              type: "reply",
              reply: {
                id: "collection",
                title: "קולקציה",
              },
            },
            {
              type: "reply",
              reply: {
                id: "rings",
                title: "טבעות",
              },
            },
            {
              type: "reply",
              reply: {
                id: "support",
                title: "שירות",
              },
            },
          ],
        },
      },
    }),
  });
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});