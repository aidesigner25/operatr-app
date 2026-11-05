# Phase 5: Google Workspace connection setup

This enables Google Workspace connection and manual export of saved chat responses to newly created Docs and Sheets. The Workspace connection is separate from the Google Gemini API key. No Google credentials should be sent in chat or committed to git.

## Google Cloud

1. In [Google Cloud Console](https://console.cloud.google.com/), select or create a project for Operatr testing.
2. Enable **Google Docs API**, **Google Sheets API**, and **Google Drive API** in APIs & Services → Library.
3. Under Google Auth Platform, configure the OAuth consent screen/branding and audience. Choose External for a personal Google account, leave publishing status in Testing, and add each Google account you want to use as a test user. A managed Workspace account may have additional administrator restrictions.
4. Under Data Access, add `https://www.googleapis.com/auth/drive.file`. This allows access to files the app creates or files explicitly opened/shared with the app, not all Drive files. The current connection flow does not yet include a file picker.
5. Under Clients, create an OAuth client of type **Web application**. Add this exact authorized redirect URI:

   `http://localhost:3000/api/google-workspace/callback`

   Save the client ID and client secret privately. The URI must match the address used to open Operatr; `localhost` and `127.0.0.1` are not interchangeable.

## Local app and database

1. Apply `supabase/migrations/202611040001_google_workspace.sql` to the same Supabase project used by the app. You can paste its contents into the Supabase SQL Editor and run it. It creates an owner-scoped table; it does not change your existing credentials.
2. Add or update these entries in your existing `.env.local` (keep your other entries):

   ```dotenv
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   OPERATR_ENABLE_GOOGLE_WORKSPACE=true
   GOOGLE_OAUTH_CLIENT_ID=your-client-id
   GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google-workspace/callback
   ```

   Leave the existing `OPERATR_KEY_ENCRYPTION_SECRET` in place. Never put OAuth secrets in a `NEXT_PUBLIC_` variable.
3. Restart the Next.js development server. Sign in to Operatr, open **Integrations**, and select **Connect Google**. Complete Google consent using an authorized test account. Back in Integrations, the status should say **Authorization saved**. This confirms storage, not a live Docs or Sheets operation. Open a saved, completed response in chat and use its Google Doc or Google Sheet export button to test file creation.
4. To test disconnect, use **Disconnect Google** and confirm the status changes. Google revokes the project's grants for that Google account; use a separate project if the same Google Cloud project is shared with other apps. Disconnect can also be managed in the Google account's third-party access settings.

## Known limits

- The flow is not a Google sign-in mechanism for Operatr. The existing Supabase sign-in remains unchanged.
- Google testing-mode authorizations and refresh tokens for an external app can expire after seven days; reconnect when necessary. Google may show an unverified-app warning during testing.
- Each export creates a new file after the user presses an export button. Docs are created by converting formatted HTML and include headings, links, list markers, and editable tables. Google may interpret some spacing or styling differently during conversion. Sheets style headings and table cells, wrap text, and merge narrative rows; all cell values are literal strings. Very long merged rows can require manual resizing. Existing file editing and appending are not implemented.
- If authorization expires, use Reconnect Google with the same Google account. If switching accounts, disconnect first; otherwise the old account's grant may remain in its Google account settings.
- A live test is necessary to verify the Google project configuration, Supabase migration, browser cookies, consent, and revocation together. Automated tests do not replace that test.
- In production use HTTPS, set the app URL and redirect URI to the same deployed origin, register the exact redirect in Google, and review Google's publishing/verification requirements before inviting users.
