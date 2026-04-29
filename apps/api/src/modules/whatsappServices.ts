import { prisma } from "@printowl/db";

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

interface SendWhatsAppCtaUrlMessageArgs {
  to: string;
  phoneNumberId: string;
  body: string;
  buttonText: string;
  url: string;
}

/**
 * Send an interactive CTA URL button message.
 * Free within the 24h conversation window. Opens the URL directly when tapped.
 */
export async function sendWhatsAppCtaUrlMessage(
  args: SendWhatsAppCtaUrlMessageArgs,
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
          type: "cta_url",
          body: { text: args.body },
          action: {
            name: "cta_url",
            parameters: {
              display_text: args.buttonText,
              url: args.url,
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to send WhatsApp CTA URL message: ${response.status} ${errorText}`,
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

/**
 * Send a reaction emoji to an existing WhatsApp message.
 * This is the fastest way to acknowledge a user's message — it's
 * lightweight and appears instantly as a tiny emoji on their message.
 */
export async function sendWhatsAppReaction(args: {
  to: string;
  phoneNumberId: string;
  messageId: string;
  emoji: string;
}): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) return; // silently skip if not configured

  try {
    await fetch(
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
          type: "reaction",
          reaction: {
            message_id: args.messageId,
            emoji: args.emoji,
          },
        }),
      },
    );
  } catch {
    // Best-effort — don't fail the main flow for a reaction
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

interface SendWhatsAppPdfArgs {
  to: string;
  phoneNumberId: string;
  buffer: Buffer;
  fileName: string;
}

export async function sendWhatsAppPdfDocument(
  args: SendWhatsAppPdfArgs,
): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is not configured.");
  }

  const pdfBytes = new Uint8Array(args.buffer);

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append(
    "file",
    new Blob([pdfBytes], { type: "application/pdf" }),
    args.fileName,
  );

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
      `Failed to upload WhatsApp PDF: ${uploadResponse.status} ${errorText}`,
    );
  }

  const uploadData = (await uploadResponse.json()) as { id?: string };
  if (!uploadData.id) {
    throw new Error("WhatsApp PDF upload did not return an id.");
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
        type: "document",
        document: {
          id: uploadData.id,
          filename: args.fileName,
        },
      }),
    },
  );

  if (!messageResponse.ok) {
    const errorText = await messageResponse.text();
    throw new Error(
      `Failed to send WhatsApp PDF: ${messageResponse.status} ${errorText}`,
    );
  }
}

// ─── WhatsApp 24h Messaging Window ──────────────────────────────────────────

const WHATSAPP_WINDOW_HOURS = 20;

/**
 * Check if we are within the free WhatsApp messaging window.
 * Returns true only if the user messaged us within the last 20 hours.
 * Returns false if lastMessageAt is null (never messaged) or older than the window.
 */
export async function isWithinWhatsAppWindow(
  phoneNumber: string,
): Promise<boolean> {
  const waUser = await prisma.whatsAppUser.findUnique({
    where: { phoneNumber },
    select: { lastMessageAt: true },
  });

  if (!waUser?.lastMessageAt) {
    return false;
  }

  const hoursSinceLastMessage =
    (Date.now() - waUser.lastMessageAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceLastMessage <= WHATSAPP_WINDOW_HOURS;
}
