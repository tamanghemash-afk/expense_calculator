/**
 * Expense Calculator - Backend API
 * server.js
 *
 * REST API for managing expenses, categories, budgets, and summaries.
 * Run: npm install express uuid && node server.js
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ─── In-Memory Store (replace with DB in production) ─────────────────────────

let expenses = [];
let categories = [
  { id: uuidv4(), name: "Food & Dining", color: "#FF6B6B", icon: "🍔" },
  { id: uuidv4(), name: "Transport",     color: "#4ECDC4", icon: "🚌" },
  { id: uuidv4(), name: "Shopping",      color: "#45B7D1", icon: "🛍️" },
  { id: uuidv4(), name: "Entertainment", color: "#96CEB4", icon: "🎬" },
  { id: uuidv4(), name: "Utilities",     color: "#FFEAA7", icon: "💡" },
  { id: uuidv4(), name: "Health",        color: "#DDA0DD", icon: "🏥" },
  { id: uuidv4(), name: "Other",         color: "#B0B0B0", icon: "📦" },
];
let budgets = []; // [{ categoryId, amount, month (YYYY-MM) }]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const findById = (arr, id) => arr.find((item) => item.id === id);

const validateExpense = (body) => {
  const { title, amount, categoryId, date } = body;
  const errors = [];
  if (!title || typeof title !== "string" || title.trim() === "")
    errors.push("title is required");
  if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0)
    errors.push("amount must be a positive number");
  if (!categoryId) errors.push("categoryId is required");
  if (!date || isNaN(Date.parse(date))) errors.push("date must be a valid ISO date");
  return errors;
};

const getMonthKey = (dateStr) => dateStr.slice(0, 7); // "YYYY-MM"

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Categories ────────────────────────────────────────────────────────────────

// GET /categories — list all categories
app.get("/categories", (req, res) => {
  res.json({ success: true, data: categories });
});

// POST /categories — create a category
app.post("/categories", (req, res) => {
  const { name, color, icon } = req.body;
  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ success: false, error: "name is required" });
  }
  const category = {
    id: uuidv4(),
    name: name.trim(),
    color: color || "#888888",
    icon: icon || "📁",
  };
  categories.push(category);
  res.status(201).json({ success: true, data: category });
});

// DELETE /categories/:id — delete a category (reject if expenses exist for it)
app.delete("/categories/:id", (req, res) => {
  const idx = categories.findIndex((c) => c.id === req.params.id);
  if (idx === -1)
    return res.status(404).json({ success: false, error: "Category not found" });

  const hasExpenses = expenses.some((e) => e.categoryId === req.params.id);
  if (hasExpenses)
    return res.status(409).json({
      success: false,
      error: "Cannot delete category with existing expenses",
    });

  categories.splice(idx, 1);
  res.json({ success: true, message: "Category deleted" });
});

// ── Expenses ──────────────────────────────────────────────────────────────────

// GET /expenses — list expenses with optional filters
//   ?categoryId=&month=YYYY-MM&minAmount=&maxAmount=&sort=date|amount&order=asc|desc
app.get("/expenses", (req, res) => {
  let result = [...expenses];

  const { categoryId, month, minAmount, maxAmount, sort, order } = req.query;

  if (categoryId) result = result.filter((e) => e.categoryId === categoryId);
  if (month)      result = result.filter((e) => e.date.startsWith(month));
  if (minAmount)  result = result.filter((e) => e.amount >= Number(minAmount));
  if (maxAmount)  result = result.filter((e) => e.amount <= Number(maxAmount));

  // Sort
  const sortField = sort === "amount" ? "amount" : "date";
  const asc = order !== "desc";
  result.sort((a, b) => {
    const va = sortField === "amount" ? a.amount : new Date(a.date);
    const vb = sortField === "amount" ? b.amount : new Date(b.date);
    return asc ? (va > vb ? 1 : -1) : va < vb ? 1 : -1;
  });

  // Attach category info
  const enriched = result.map((e) => ({
    ...e,
    category: findById(categories, e.categoryId) || null,
  }));

  res.json({ success: true, count: enriched.length, data: enriched });
});

// GET /expenses/:id — get a single expense
app.get("/expenses/:id", (req, res) => {
  const expense = findById(expenses, req.params.id);
  if (!expense)
    return res.status(404).json({ success: false, error: "Expense not found" });
  res.json({
    success: true,
    data: { ...expense, category: findById(categories, expense.categoryId) },
  });
});

// POST /expenses — create an expense
app.post("/expenses", (req, res) => {
  const errors = validateExpense(req.body);
  if (errors.length)
    return res.status(400).json({ success: false, errors });

  const { title, amount, categoryId, date, note } = req.body;

  if (!findById(categories, categoryId))
    return res.status(400).json({ success: false, error: "Invalid categoryId" });

  const expense = {
    id: uuidv4(),
    title: title.trim(),
    amount: parseFloat(Number(amount).toFixed(2)),
    categoryId,
    date: new Date(date).toISOString().slice(0, 10),
    note: note ? note.trim() : "",
    createdAt: new Date().toISOString(),
  };

  expenses.push(expense);
  res.status(201).json({
    success: true,
    data: { ...expense, category: findById(categories, categoryId) },
  });
});

// PUT /expenses/:id — update an expense
app.put("/expenses/:id", (req, res) => {
  const idx = expenses.findIndex((e) => e.id === req.params.id);
  if (idx === -1)
    return res.status(404).json({ success: false, error: "Expense not found" });

  const errors = validateExpense({ ...expenses[idx], ...req.body });
  if (errors.length)
    return res.status(400).json({ success: false, errors });

  const { title, amount, categoryId, date, note } = req.body;

  if (categoryId && !findById(categories, categoryId))
    return res.status(400).json({ success: false, error: "Invalid categoryId" });

  expenses[idx] = {
    ...expenses[idx],
    ...(title      && { title: title.trim() }),
    ...(amount     && { amount: parseFloat(Number(amount).toFixed(2)) }),
    ...(categoryId && { categoryId }),
    ...(date       && { date: new Date(date).toISOString().slice(0, 10) }),
    ...(note !== undefined && { note: note.trim() }),
    updatedAt: new Date().toISOString(),
  };

  res.json({
    success: true,
    data: { ...expenses[idx], category: findById(categories, expenses[idx].categoryId) },
  });
});

// DELETE /expenses/:id — delete an expense
app.delete("/expenses/:id", (req, res) => {
  const idx = expenses.findIndex((e) => e.id === req.params.id);
  if (idx === -1)
    return res.status(404).json({ success: false, error: "Expense not found" });
  expenses.splice(idx, 1);
  res.json({ success: true, message: "Expense deleted" });
});

// ── Budgets ───────────────────────────────────────────────────────────────────

// GET /budgets?month=YYYY-MM — list budgets for a month
app.get("/budgets", (req, res) => {
  const { month } = req.query;
  const result = month ? budgets.filter((b) => b.month === month) : budgets;
  const enriched = result.map((b) => ({
    ...b,
    category: findById(categories, b.categoryId),
  }));
  res.json({ success: true, data: enriched });
});

// POST /budgets — set/update a budget for a category + month
app.post("/budgets", (req, res) => {
  const { categoryId, amount, month } = req.body;

  if (!categoryId || !findById(categories, categoryId))
    return res.status(400).json({ success: false, error: "Valid categoryId is required" });
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
    return res.status(400).json({ success: false, error: "amount must be a positive number" });
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return res.status(400).json({ success: false, error: "month must be in YYYY-MM format" });

  const existing = budgets.find(
    (b) => b.categoryId === categoryId && b.month === month
  );

  if (existing) {
    existing.amount = parseFloat(Number(amount).toFixed(2));
    return res.json({ success: true, data: existing });
  }

  const budget = { id: uuidv4(), categoryId, amount: parseFloat(Number(amount).toFixed(2)), month };
  budgets.push(budget);
  res.status(201).json({ success: true, data: budget });
});

// DELETE /budgets/:id — remove a budget
app.delete("/budgets/:id", (req, res) => {
  const idx = budgets.findIndex((b) => b.id === req.params.id);
  if (idx === -1)
    return res.status(404).json({ success: false, error: "Budget not found" });
  budgets.splice(idx, 1);
  res.json({ success: true, message: "Budget deleted" });
});

// ── Summary / Analytics ───────────────────────────────────────────────────────

// GET /summary?month=YYYY-MM — full summary for a month
app.get("/summary", (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return res.status(400).json({ success: false, error: "month (YYYY-MM) is required" });

  const monthExpenses = expenses.filter((e) => e.date.startsWith(month));

  const totalSpent = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Per-category breakdown
  const byCategory = {};
  for (const cat of categories) {
    const catExpenses = monthExpenses.filter((e) => e.categoryId === cat.id);
    const spent = catExpenses.reduce((s, e) => s + e.amount, 0);
    const budget = budgets.find((b) => b.categoryId === cat.id && b.month === month);
    byCategory[cat.id] = {
      category: cat,
      spent: parseFloat(spent.toFixed(2)),
      budget: budget ? budget.amount : null,
      remaining: budget ? parseFloat((budget.amount - spent).toFixed(2)) : null,
      percentage: budget ? parseFloat(((spent / budget.amount) * 100).toFixed(1)) : null,
      count: catExpenses.length,
    };
  }

  // Daily totals
  const dailyMap = {};
  for (const e of monthExpenses) {
    dailyMap[e.date] = (dailyMap[e.date] || 0) + e.amount;
  }
  const dailyTotals = Object.entries(dailyMap)
    .map(([date, total]) => ({ date, total: parseFloat(total.toFixed(2)) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalBudget = budgets
    .filter((b) => b.month === month)
    .reduce((s, b) => s + b.amount, 0);

  res.json({
    success: true,
    data: {
      month,
      totalSpent: parseFloat(totalSpent.toFixed(2)),
      totalBudget: parseFloat(totalBudget.toFixed(2)),
      remaining: parseFloat((totalBudget - totalSpent).toFixed(2)),
      expenseCount: monthExpenses.length,
      byCategory: Object.values(byCategory),
      dailyTotals,
    },
  });
});

// GET /summary/trends?months=6 — monthly totals for trend analysis
app.get("/summary/trends", (req, res) => {
  const count = Math.min(parseInt(req.query.months) || 6, 24);
  const now = new Date();
  const trends = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const total = expenses
      .filter((e) => e.date.startsWith(month))
      .reduce((s, e) => s + e.amount, 0);
    trends.push({ month, total: parseFloat(total.toFixed(2)) });
  }

  res.json({ success: true, data: trends });
});

// ─── 404 & Error handlers ─────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route not found: ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: "Internal Server Error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🧾 Expense Calculator API running on http://localhost:${PORT}`);
  console.log(`   Health check → GET /health\n`);
});

module.exports = app;
