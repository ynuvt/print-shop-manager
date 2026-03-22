# Cloudflare Turnstile CAPTCHA Setup Guide

## Overview

Turnstile is a CAPTCHA service provided by Cloudflare that protects your upload form from spam and abuse. It's already integrated into PrintOwl to prevent multiple unverified upload requests.

## Step 1: Get Cloudflare Turnstile Credentials

### 1.1 Create a Cloudflare Account (if you don't have one)

- Go to [https://dash.cloudflare.com/](https://dash.cloudflare.com/)
- Sign up for a **free** Cloudflare account or log in

### 1.2 Navigate to Turnstile

1. In the Cloudflare Dashboard, look for **Turnstile** in the left sidebar
   - If you don't see it, search for "Turnstile" in the dashboard search bar
2. Click on **Turnstile**

### 1.3 Create a New Site

1. Click **Create Site** button
2. Fill in the form:
   - **Site Name**: `PrintOwl` (or your project name)
   - **Domain(s)**:
     - For **Development**: `localhost:5173` (Vite default port for web app)
     - For **Production**: Your actual domain (e.g., `printowl.com`)
     - You can add multiple domains separated by commas
   - **Mode**: Select **"Managed"** (recommended - Cloudflare decides if a challenge is needed)
   - **Bot Fight Mode**: Optional, can be enabled for additional protection
3. Click **Create**

### 1.4 Copy Your Keys

After creation, you'll see two keys:

- **Site Key**: Public key (safe to expose in frontend code)
- **Secret Key**: Private key (MUST keep secret in backend only)

---

## Step 2: Configure Frontend

### 2.1 Update `.env.local` in `apps/web/`

Create or edit `.env.local`:

```bash
VITE_API_ORIGIN=http://localhost:4000
VITE_TURNSTILE_SITE_KEY=your_site_key_here
```

Replace `your_site_key_here` with the **Site Key** from step 1.4

### 2.2 Verify Installation

- The CAPTCHA widget will automatically appear below the summary card before the "Confirm and Print" button
- It will show a Cloudflare Turnstile badge

---

## Step 3: Configure Backend

### 3.1 Update `.env` in `apps/api/`

Edit the existing `.env` file and add:

```bash
TURNSTILE_SECRET_KEY=your_turnstile_secret_key_here
```

Replace `your_turnstile_secret_key_here` with the **Secret Key** from step 1.4

### 3.2 Restart API Server

The backend will verify CAPTCHA tokens automatically when users submit uploads.

---

## Step 4: Test the Integration

### 4.1 Development Testing

1. Start the web app: `npm run dev` in `apps/web/`
2. Start the API: `npm run dev` in `apps/api/`
3. Upload a file in the web app
4. You should see the Turnstile CAPTCHA widget appear
5. Complete the CAPTCHA challenge
6. Click "Confirm and Print"

### 4.2 Expected Behavior

- **Without CAPTCHA completed**: Submit button is disabled with message "Please complete the CAPTCHA verification"
- **CAPTCHA error**: You'll see an error message "CAPTCHA verification failed"
- **Success**: Job is created and you get the verification code

---

## Security Notes

⚠️ **Important Security Practices:**

1. **Never expose Secret Key**: The `TURNSTILE_SECRET_KEY` should only be in backend `.env`
   - Never commit it to version control
   - Never expose it in frontend code, networks requests, or logs

2. **Site Key is Public**: The `VITE_TURNSTILE_SITE_KEY` is safe to expose in frontend code
   - It's specifically designed for public use
   - Always starts with `0x`

3. **CAPTCHA Resets**:
   - CAPTCHA automatically resets if:
     - User submits a file upload
     - An error occurs
     - User completes the challenge (token expires after ~300 seconds)

4. **Rate Limiting**:
   - Combine with IP-based rate limiting on backend for extra protection
   - Turnstile prevents automated attacks, not rate limiting

---

## Troubleshooting

### Issue: CAPTCHA widget not showing

**Solution:**

1. Verify `VITE_TURNSTILE_SITE_KEY` is set in `apps/web/.env.local`
2. Check browser console for errors
3. Ensure Turnstile domain includes your current domain

### Issue: "CAPTCHA verification failed" error

**Solution:**

1. Verify `TURNSTILE_SECRET_KEY` is set in `apps/api/.env`
2. Check API logs for verification error details
3. Ensure both keys match the same Turnstile site in Cloudflare dashboard

### Issue: CAPTCHA can't reach Cloudflare's verification API

**Solution:**

1. Ensure backend has internet connection to `https://challenges.cloudflare.com`
2. Check firewall/proxy settings aren't blocking Cloudflare
3. Verify no VPN is interfering with the connection

---

## Additional Resources

- [Cloudflare Turnstile Docs](https://developers.cloudflare.com/turnstile/)
- [Turnstile Widget Documentation](https://developers.cloudflare.com/turnstile/get-started/)
- [React Turnstile Component](https://github.com/marsidev/react-turnstile)

---

## Implementation Details

### Frontend Flow

1. User uploads files and fills options
2. Turns on the summary section
3. Turnstile widget loads and requests verification
4. User completes CAPTCHA challenge
5. Token is stored in state and enables submit button
6. Token is sent with form data to backend

### Backend Flow

1. Receives CAPTCHA token in FormData
2. Calls Turnstile verification API
3. If valid: proceeds with file upload
4. If invalid: returns 400 error with message

### Files Modified

- `apps/web/src/pages/HomePage.tsx` - Added Turnstile widget
- `apps/web/src/api/api.ts` - Updated to send CAPTCHA token
- `apps/api/src/routes/jobRoutes.ts` - Added token verification
- `apps/api/src/utils/turnstileVerification.ts` - New verification utility
