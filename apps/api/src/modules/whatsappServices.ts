interface WhatsAppButton {
  type: "reply";
  reply: {
    id: string;
    title: string;
  };
}

interface SendWhatsAppButtonMessageArgs {
  to: string;
  phoneNumberId: string;
  body: string;
  buttons: WhatsAppButton[];
}

export async function sendWhatsAppButtonMessage(
  args: SendWhatsAppButtonMessageArgs,
): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured.");
  }

  const response = await fetch(
    `${WHATSAPP_API_BASE}/${args.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: args.to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: args.body },
          action: {
            buttons: args.buttons,
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to send WhatsApp button message: ${response.status} ${errorText}`,
    );
  }
}
const WHATSAPP_API_BASE = "https://graph.facebook.com/v20.0";

interface SendWhatsAppStickerArgs {
  to: string;
  phoneNumberId: string;
  filePath: string;
  mimeType?: string;
}

interface SendWhatsAppTextMessageArgs {
  to: string;
  message: string;
  phoneNumberId: string;
}

export async function sendWhatsAppTextMessage(
  args: SendWhatsAppTextMessageArgs,
): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured.");
  }

  const response = await fetch(
    `${WHATSAPP_API_BASE}/${args.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: args.to,
        type: "text",
        text: {
          body: args.message,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to send WhatsApp message: ${response.status} ${errorText}`,
    );
  }
}

export async function sendWhatsAppStickerFromFile(
  args: SendWhatsAppStickerArgs,
): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured.");
  }

  const { readFile } = await import("node:fs/promises");
  const buffer = await readFile(args.filePath);
  const mimeType = args.mimeType ?? "image/webp";

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([buffer], { type: mimeType }), "sticker.webp");

  const uploadResponse = await fetch(
    `${WHATSAPP_API_BASE}/${args.phoneNumberId}/media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    },
  );

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(
      `Failed to upload WhatsApp sticker: ${uploadResponse.status} ${errorText}`,
    );
  }

  const uploadData = (await uploadResponse.json()) as { id?: string };
  if (!uploadData.id) {
    throw new Error("WhatsApp media upload did not return an id.");
  }

  const messageResponse = await fetch(
    `${WHATSAPP_API_BASE}/${args.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: args.to,
        type: "sticker",
        sticker: {
          id: uploadData.id,
        },
      }),
    },
  );

  if (!messageResponse.ok) {
    const errorText = await messageResponse.text();
    throw new Error(
      `Failed to send WhatsApp sticker: ${messageResponse.status} ${errorText}`,
    );
  }
}
