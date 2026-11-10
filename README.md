# AuraMess

AuraMess is a college dining portal with separate student and staff workspaces. The frontend uses React, Vite, and Tailwind CSS. The API uses Node.js, Express, and MongoDB Atlas through Mongoose.

## Run locally

1. Install Node.js 20 or newer, then run `npm install` at the project root.
2. Keep the Atlas connection string and secrets in `backend/.env` (copy `backend/.env.example` if you need a template).
3. Set `MONGODB_URI`, a private `JWT_SECRET` of at least 32 characters, and a `STAFF_REGISTRATION_CODE` in `backend/.env`.
4. Run `npm run dev` from the project root. The app opens at http://localhost:5173 and the API at http://localhost:4000.

## Semester mess allowance

Every student receives a fixed ₹17,000 allowance for the current semester. Meal tokens deduct the current menu price from the balance on the server, inside a MongoDB transaction. There is no top-up or real payment flow. At semester rollover, the balance is reset to ₹17,000 for the next semester; unused balance does not carry forward.

By default, the server uses two calendar semesters in `Asia/Kolkata`: January–June (`S1`) and July–December (`S2`). To use your institution's semester dates, set `MESS_SEMESTER_KEY` to a new unique value at the beginning of each semester. The first authenticated request during a new key credits that student once. Set `CAMPUS_TIME_ZONE` to change the time zone used for meal windows and daily staff analytics.

## Student workspace

- Register with a name, campus email, and optional student ID such as `B423071`; students can sign in with their email or student ID.
- View the semester balance, today's meals, and the weekly menu.
- Request a QR meal token during the active meal window. The server checks the balance and atomically records the deduction, token, and transaction.
- View wallet and token history. The QR contains an opaque, random token ID and expires at the end of its meal window.

Default meal windows are Breakfast 7:30–9:00 AM, Lunch 12:30–2:30 PM, Snacks 4:30–5:30 PM, and Dinner 7:30–9:00 PM. Default prices are ₹40, ₹70, ₹30, and ₹70. Staff may update dishes and prices.

## Staff workspace

Staff registration requires the invite code in `STAFF_REGISTRATION_CODE`. Staff can verify tokens using the camera scanner where the browser supports `BarcodeDetector`, or enter a token ID manually. Verification and redemption happen on the server and reject expired or previously redeemed tokens. Staff can also edit the weekly menu and view daily redemption counts. Analytics show simulated meal value based on redeemed tokens; AuraMess does not collect payments.

## Atlas and security

Atlas must have a database user and an IP access-list entry for the machine running the API. MongoDB transactions require an Atlas replica set, which is available on Atlas clusters. Keep `backend/.env` private and never place database credentials in frontend environment variables or commit `.env` files. Staff registration codes are shared access credentials; change them if they are exposed.
