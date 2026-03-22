/**
 * Turnstile CAPTCHA verification utility
 * Verifies the CAPTCHA token from Cloudflare Turnstile
 */

interface TurnstileResponse {
  success: boolean;
  challenge_ts: string;
  hostname: string;
  error_codes?: string[];
  "error-codes"?: string[];
}

export async function verifyTurnstileToken(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    console.error("TURNSTILE_SECRET_KEY is not set in environment variables");
    return {
      success: false,
      error: "CAPTCHA verification is not configured",
    };
  }

  if (!token) {
    return {
      success: false,
      error: "CAPTCHA token is missing",
    };
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret: secretKey,
          response: token,
        }),
      },
    );

    if (!response.ok) {
      console.error("Turnstile API returned status:", response.status);
      return {
        success: false,
        error: "CAPTCHA verification service error",
      };
    }

    const data = (await response.json()) as TurnstileResponse;

    if (!data.success) {
      const errorCodes = data.error_codes || data["error-codes"] || [];
      console.error("Turnstile verification failed:", errorCodes);
      return {
        success: false,
        error: "CAPTCHA verification failed",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error verifying Turnstile token:", error);
    return {
      success: false,
      error: "Failed to verify CAPTCHA",
    };
  }
}
