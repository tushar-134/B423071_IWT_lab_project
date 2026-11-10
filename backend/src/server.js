import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 4000);
const TIME_ZONE = process.env.CAMPUS_TIME_ZONE || 'Asia/Kolkata';
const ALLOWANCE = 17000;
const CURRENT_SEMESTER = process.env.MESS_SEMESTER_KEY || (() => {
  const month = Number(new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, month: 'numeric' }).format(new Date()));
  return `${new Intl.DateTimeFormat('en', { timeZone: TIME_ZONE, year: 'numeric' }).format(new Date())}-${month <= 6 ? 'S1' : 'S2'}`;
})();
const MEALS = {
  breakfast: { label: 'Breakfast', start: '07:30', end: '09:00', defaultPrice: 40 },
  lunch: { label: 'Lunch', start: '12:30', end: '14:30', defaultPrice: 70 },
  snacks: { label: 'Snacks', start: '16:30', end: '17:30', defaultPrice: 30 },
  dinner: { label: 'Dinner', start: '19:30', end: '21:00', defaultPrice: 70 },
};
const DEFAULT_DISHES = {
  breakfast: ['Masala dosa · coconut chutney', 'Poha · chai', 'Idli sambar · fruit', 'Aloo paratha · curd', 'Upma · banana', 'Chole kulche', 'Pav bhaji'],
  lunch: ['Dal tadka · jeera rice · roti', 'Rajma · steamed rice · salad', 'Paneer curry · pulao · roti', 'Chole · rice · salad', 'Veg korma · roti · rice', 'Dal makhani · rice · roti', 'Kadhi pakora · rice'],
  snacks: ['Samosa · mint chutney', 'Veg sandwich · lemonade', 'Bhel puri · chai', 'Paneer roll · juice', 'Corn chaat · chai', 'Dhokla · green chutney', 'Aloo tikki · lassi'],
  dinner: ['Shahi paneer · rice · roti', 'Mix veg · dal · roti', 'Kadai paneer · pulao · roti', 'Veg biryani · raita', 'Palak paneer · rice · roti', 'Malai kofta · rice · roti', 'Dal fry · seasonal veg · roti'],
};

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  studentId: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  role: { type: String, enum: ['student', 'staff'], required: true },
  passwordHash: { type: String, required: true },
  walletBalance: { type: Number, default: 0, min: 0 },
  semesterKey: { type: String, default: '' },
}, { timestamps: true });
const User = mongoose.models.User || mongoose.model('User', userSchema);
const menuSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  meal: { type: String, enum: Object.keys(MEALS), required: true },
  dish: { type: String, required: true, trim: true, maxlength: 180 },
  price: { type: Number, required: true, min: 1, max: 5000 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
menuSchema.index({ dayOfWeek: 1, meal: 1 }, { unique: true });
const MenuItem = mongoose.models.MenuItem || mongoose.model('MenuItem', menuSchema);
const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['semester-credit', 'meal-purchase'], required: true },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  semesterKey: { type: String, required: true },
  meal: { type: String, enum: Object.keys(MEALS) },
  dish: { type: String },
  tokenId: { type: String },
}, { timestamps: true });
const WalletTransaction = mongoose.models.WalletTransaction || mongoose.model('WalletTransaction', transactionSchema);
const tokenSchema = new mongoose.Schema({
  tokenId: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: String },
  studentName: { type: String, required: true },
  meal: { type: String, enum: Object.keys(MEALS), required: true },
  dish: { type: String, required: true },
  amount: { type: Number, required: true },
  issuedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['active', 'redeemed', 'expired'], default: 'active', index: true },
  redeemedAt: { type: Date },
  redeemedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
tokenSchema.index({ user: 1, issuedAt: -1 });
const MealToken = mongoose.models.MealToken || mongoose.model('MealToken', tokenSchema);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));
app.use('/api/tokens', rateLimit({ windowMs: 60 * 1000, limit: 20 }));

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, studentId: user.studentId || null, role: user.role };
}
function money(value) { return Math.round(Number(value) || 0); }
function currentLocalParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}
function localTimeToUtc(parts, time) {
  const [hour, minute] = time.split(':').map(Number);
  const desired = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, minute);
  let guess = desired;
  for (let i = 0; i < 3; i += 1) {
    const local = currentLocalParts(new Date(guess));
    const represented = Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute), Number(local.second));
    guess += desired - represented;
  }
  return new Date(guess);
}
function todayWindow(meal, now = new Date()) {
  const parts = currentLocalParts(now);
  const start = localTimeToUtc(parts, MEALS[meal].start);
  const end = localTimeToUtc(parts, MEALS[meal].end);
  return { parts, start, end, active: now >= start && now < end };
}
function dayNumber(weekday) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday); }
function serializeToken(token) {
  return { id: token.id, tokenId: token.tokenId, meal: token.meal, mealLabel: MEALS[token.meal].label, dish: token.dish, amount: token.amount, issuedAt: token.issuedAt, expiresAt: token.expiresAt, status: token.status, redeemedAt: token.redeemedAt, studentId: token.studentId, studentName: token.studentName };
}
async function ensureSemesterAllowance(user) {
  if (user.role !== 'student' || user.semesterKey === CURRENT_SEMESTER) return user;
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      updated = await User.findOneAndUpdate(
        { _id: user._id, semesterKey: { $ne: CURRENT_SEMESTER } },
        { $set: { walletBalance: ALLOWANCE, semesterKey: CURRENT_SEMESTER } },
        { new: true, session },
      );
      if (updated) await WalletTransaction.create([{ user: updated._id, type: 'semester-credit', amount: ALLOWANCE, balanceAfter: ALLOWANCE, semesterKey: CURRENT_SEMESTER }], { session });
    });
    return updated || User.findById(user._id);
  } finally { await session.endSession(); }
}
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Please sign in again.' });
    const claims = jwt.verify(token, process.env.JWT_SECRET);
    let user = await User.findById(claims.sub);
    if (!user || user.role !== claims.role) return res.status(401).json({ message: 'Please sign in again.' });
    user = await ensureSemesterAllowance(user);
    req.auth = claims;
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') return res.status(401).json({ message: 'Please sign in again.' });
    next(error);
  }
}
function requireRole(role) {
  return (req, res, next) => req.user?.role === role ? next() : res.status(403).json({ message: 'You do not have access to this area.' });
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, password, role, staffCode, studentId } = req.body || {};
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || !['student', 'staff'].includes(role)) return res.status(400).json({ message: 'Enter your name, a valid email, and an account type.' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) return res.status(400).json({ message: 'Password must be between 8 and 72 characters.' });
    const normalizedStudentId = String(studentId || '').trim().toUpperCase();
    if (role === 'student' && normalizedStudentId && !/^B\d{6}$/.test(normalizedStudentId)) return res.status(400).json({ message: 'Student ID should look like B423071.' });
    if (role === 'staff' && (!process.env.STAFF_REGISTRATION_CODE || staffCode !== process.env.STAFF_REGISTRATION_CODE)) return res.status(403).json({ message: 'A valid staff registration code is required.' });
    const normalizedEmail = email.trim().toLowerCase();
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ message: 'An account with that email already exists.' });
    let user;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        [user] = await User.create([{ name: name.trim(), email: normalizedEmail, studentId: role === 'student' ? normalizedStudentId || undefined : undefined, role, passwordHash: await bcrypt.hash(password, 12), walletBalance: role === 'student' ? ALLOWANCE : 0, semesterKey: role === 'student' ? CURRENT_SEMESTER : '' }], { session });
        if (role === 'student') await WalletTransaction.create([{ user: user._id, type: 'semester-credit', amount: ALLOWANCE, balanceAfter: ALLOWANCE, semesterKey: CURRENT_SEMESTER }], { session });
      });
    } finally { await session.endSession(); }
    res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'That email or student ID is already registered.' });
    next(error);
  }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, identifier, password, role } = req.body || {};
    const loginId = String(identifier || email || '').trim();
    const query = role === 'student' && /^B\d{6}$/i.test(loginId) ? { studentId: loginId.toUpperCase() } : { email: loginId.toLowerCase() };
    const user = await User.findOne(query);
    if (!user || !['student', 'staff'].includes(role) || user.role !== role || !await bcrypt.compare(password || '', user.passwordHash)) return res.status(401).json({ message: 'ID/email or password is incorrect for this account type.' });
    const currentUser = await ensureSemesterAllowance(user);
    res.json({ token: issueToken(currentUser), user: publicUser(currentUser) });
  } catch (error) { next(error); }
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get('/api/wallet', requireAuth, requireRole('student'), (req, res) => res.json({ balance: req.user.walletBalance, allowance: ALLOWANCE, semester: CURRENT_SEMESTER, semesterKey: CURRENT_SEMESTER, timeZone: TIME_ZONE }));
app.get('/api/wallet/transactions', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const transactions = await WalletTransaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ transactions });
  } catch (error) { next(error); }
});

async function seedMenu() {
  const operations = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    for (const [meal, dishes] of Object.entries(DEFAULT_DISHES)) {
      operations.push({ updateOne: { filter: { dayOfWeek, meal }, update: { $setOnInsert: { dayOfWeek, meal, dish: dishes[dayOfWeek], price: MEALS[meal].defaultPrice } }, upsert: true } });
    }
  }
  if (operations.length) await MenuItem.bulkWrite(operations);
}
app.get('/api/menu', requireAuth, async (_req, res, next) => {
  try {
    const menu = await MenuItem.find().sort({ dayOfWeek: 1 }).lean();
    const today = currentLocalParts();
    const activeMeal = Object.keys(MEALS).find((meal) => todayWindow(meal).active) || null;
    res.json({ menu, today: dayNumber(today.weekday), activeMeal, meals: MEALS, timeZone: TIME_ZONE });
  } catch (error) { next(error); }
});
app.patch('/api/menu/:day/:meal', requireAuth, requireRole('staff'), async (req, res, next) => {
  try {
    const dayOfWeek = Number(req.params.day);
    const { meal } = req.params;
    const { dish, price } = req.body || {};
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6 || !MEALS[meal]) return res.status(400).json({ message: 'Invalid day or meal.' });
    if (typeof dish !== 'string' || !dish.trim() || dish.trim().length > 180 || !Number.isInteger(price) || price < 1 || price > 5000) return res.status(400).json({ message: 'Enter a dish name and a whole number price from ₹1 to ₹5,000.' });
    const item = await MenuItem.findOneAndUpdate({ dayOfWeek, meal }, { dish: dish.trim(), price, updatedBy: req.user._id }, { new: true, upsert: true, runValidators: true });
    res.json({ item });
  } catch (error) { next(error); }
});

app.get('/api/tokens', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const tokens = await MealToken.find({ user: req.user._id }).sort({ issuedAt: -1 }).limit(30).lean();
    res.json({ tokens: tokens.map(serializeToken) });
  } catch (error) { next(error); }
});
app.post('/api/tokens', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { meal } = req.body || {};
    if (!MEALS[meal]) return res.status(400).json({ message: 'Choose a valid meal.' });
    const window = todayWindow(meal);
    if (!window.active) return res.status(409).json({ message: `${MEALS[meal].label} tokens are available ${MEALS[meal].start}–${MEALS[meal].end} (${TIME_ZONE}).` });
    const menu = await MenuItem.findOne({ dayOfWeek: dayNumber(window.parts.weekday), meal }).lean();
    if (!menu) return res.status(404).json({ message: 'There is no menu item for this meal yet.' });
    const tokenId = randomUUID();
    let token;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const student = await User.findOne({ _id: req.user._id, semesterKey: CURRENT_SEMESTER, walletBalance: { $gte: menu.price } }).session(session);
        if (!student) throw new Error('INSUFFICIENT_BALANCE');
        student.walletBalance -= menu.price;
        await student.save({ session });
        token = new MealToken({ tokenId, user: student._id, studentId: student.studentId, studentName: student.name, meal, dish: menu.dish, amount: menu.price, issuedAt: new Date(), expiresAt: window.end, status: 'active' });
        await token.save({ session });
        await WalletTransaction.create([{ user: student._id, type: 'meal-purchase', amount: -menu.price, balanceAfter: student.walletBalance, semesterKey: CURRENT_SEMESTER, meal, dish: menu.dish, tokenId }], { session });
        req.updatedBalance = student.walletBalance;
      });
    } finally { await session.endSession(); }
    res.status(201).json({ token: serializeToken(token), balance: req.updatedBalance });
  } catch (error) {
    if (error.message === 'INSUFFICIENT_BALANCE') return res.status(409).json({ message: 'Your semester mess balance is too low for this meal.' });
    next(error);
  }
});

app.post('/api/staff/tokens/verify', requireAuth, requireRole('staff'), async (req, res, next) => {
  try {
    const tokenId = String(req.body?.tokenId || '').trim();
    if (!tokenId) return res.status(400).json({ message: 'Enter or scan a token ID.' });
    const now = new Date();
    const token = await MealToken.findOneAndUpdate({ tokenId, status: 'active', expiresAt: { $gt: now } }, { $set: { status: 'redeemed', redeemedAt: now, redeemedBy: req.user._id } }, { new: true });
    if (token) return res.json({ verified: true, message: `VERIFIED: ${token.studentId || token.studentName} · ${MEALS[token.meal].label} approved`, token: serializeToken(token) });
    const existing = await MealToken.findOne({ tokenId }).lean();
    if (!existing) return res.status(404).json({ verified: false, message: 'Token not found.' });
    if (existing.status === 'redeemed') return res.status(409).json({ verified: false, message: 'This token has already been redeemed.' });
    if (existing.expiresAt <= now) {
      await MealToken.updateOne({ _id: existing._id, status: 'active' }, { $set: { status: 'expired' } });
      return res.status(410).json({ verified: false, message: 'This meal token has expired.' });
    }
    res.status(409).json({ verified: false, message: 'This token is not active.' });
  } catch (error) { next(error); }
});
app.get('/api/staff/analytics', requireAuth, requireRole('staff'), async (_req, res, next) => {
  try {
    const parts = currentLocalParts();
    const start = localTimeToUtc(parts, '00:00');
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const counts = await MealToken.aggregate([
      { $match: { status: 'redeemed', redeemedAt: { $gte: start, $lt: end } } },
      { $group: { _id: '$meal', meals: { $sum: 1 }, revenue: { $sum: '$amount' } } },
    ]);
    const byMeal = Object.fromEntries(Object.keys(MEALS).map((meal) => [meal, { meals: 0, revenue: 0 }]));
    for (const row of counts) byMeal[row._id] = { meals: row.meals, revenue: row.revenue };
    res.json({ byMeal, totalMeals: Object.values(byMeal).reduce((sum, row) => sum + row.meals, 0), totalRevenue: Object.values(byMeal).reduce((sum, row) => sum + row.revenue, 0), date: `${parts.year}-${parts.month}-${parts.day}`, timeZone: TIME_ZONE });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in backend/.env');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to at least 32 characters in backend/.env');
await mongoose.connect(process.env.MONGODB_URI);
await Promise.all([User.init(), MenuItem.init(), WalletTransaction.init(), MealToken.init()]);
await seedMenu();
app.listen(port, () => console.log(`AuraMess API listening on http://localhost:${port}`));
