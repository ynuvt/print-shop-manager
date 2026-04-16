import { Router } from "express";
import * as webhookController from "../controllers/webhookController.js";

const router = Router();

//  Verify Webhook for WhatsApp
router.get("/whatsapp", webhookController.verifyWhatsAppWebhook);

//  Receive Messages From WhatsApp
router.post("/whatsapp", webhookController.handleWhatsAppWebhook);

export default router;
