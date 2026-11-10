# AuraMess project prompt

Use this prompt to continue building the current project without replacing its stack or existing authentication:

```text
Act as a senior full-stack engineer and product designer. Continue the existing AuraMess college dining portal in this repository.

## Existing project and constraints

- `frontend/` is a React + Vite application styled with Tailwind CSS and project CSS.
- `backend/` is a Node.js + Express API backed by MongoDB Atlas through Mongoose.
- The app already has Student and Staff registration/login. Students may sign in with a campus email or a student ID such as B423071. Staff registration requires a server-side invite code.
- Preserve the existing folders, auth, environment variables, and running Atlas setup. Do not replace this with a single HTML file, Alpine.js, CDN Tailwind, or a frontend-only demo.
- Keep Atlas credentials, JWT secrets, and staff registration codes in `backend/.env`; never expose or log them.

## Product and visual direction

Create separate, role-protected Student and Staff workspaces. Use a dark obsidian foundation with the provided palette: aqua `#b4d3d4`, sky `#96c3d4`, slate blue `#86a1bf`, periwinkle `#7682b0`, and indigo `#5b6492`. Apply these colors consistently to highlights, actions, cards, scanner states, and data visualizations. Use clear typography, responsive layouts, accessible controls, and restrained transitions. Include loading, empty, error, and success states.

## Student workspace

### Semester mess allowance

- Each student receives a fixed ₹17,000 mess allowance for each semester, representing the fee paid for that semester.
- Credit ₹17,000 once per student per semester and record a MongoDB ledger transaction. The semester key must make duplicate credits impossible.
- Deduct every food purchase from this balance using the current menu price. The server, never the browser, is the source of truth.
- Check and deduct the balance atomically with token creation so concurrent requests cannot overspend or charge twice.
- Show the remaining balance, original ₹17,000 allowance, semester, and purchase history. Do not offer a simulated wallet top-up or suggest real payments are supported.
- Use the configured semester key and campus time zone. On rollover, renew the allowance once and reset unused funds; unused balance does not carry forward.

### Meals and QR pass

- Show Breakfast (₹40), Lunch (₹70), Snacks (₹30), and Dinner (₹70) at their default prices; staff menu price changes apply to new token requests.
- Default campus meal windows: Breakfast 7:30–9:00 AM, Lunch 12:30–2:30 PM, Snacks 4:30–5:30 PM, Dinner 7:30–9:00 PM. Use `CAMPUS_TIME_ZONE` (default Asia/Kolkata).
- Allow a student to request a token only during its active meal window and only when the server confirms sufficient balance.
- Generate a random opaque token ID on the server. Save the student, meal, dish, amount, issue time, expiry, and status in MongoDB. Render its QR in React; put no password, personal details, or payment data in the QR.
- Expire the pass at the end of the meal window. Show a countdown, status, and history, but always validate expiry on the server.

### Weekly menu

- Show the complete seven-day menu for every meal, today's date, active meal window, and meal prices.
- Provide ordering shortcuts for the active meal and indicate when other windows are closed.

## Staff workspace

### Scanner and redemption

- Provide a responsive camera scanner where supported and a manual token-ID fallback.
- Verify and redeem tokens using a staff-only API. Reject unknown, expired, inactive, or already redeemed tokens.
- Make redemption atomic so the same token cannot be accepted twice, even under concurrent requests.
- Show a clear approved or rejected result, including the student identifier and meal when approved.

### Analytics and menu editor

- Show today's redeemed meal counts by Breakfast, Lunch, Snacks, and Dinner, plus the value of redeemed meals.
- Clearly label that value as simulated meal value; AuraMess does not process payments.
- Let staff edit each day's dishes and prices with backend validation, then persist the edits in MongoDB so student menus refresh promptly.

## Backend and data

- Extend the existing Mongoose backend with validated menu, wallet-ledger, and meal-token data as needed.
- Enforce role checks on the server for every staff action and student wallet/token action.
- Keep wallet updates and token creation atomic using MongoDB transactions (Atlas replica set).
- Add appropriate indexes, safe errors, and rate limits. Do not trust role, price, balance, token validity, or meal status supplied by the browser.
- Preserve `.env` configuration and keep `backend/.env.example` limited to variable names and safe placeholders.

## Delivery

Implement changes in the existing `frontend/` and `backend/` folders. Update `README.md` and this prompt file if behavior or configuration changes. Summarize files changed and any remaining setup needed. Do not delete working authentication or replace the architecture.
```
