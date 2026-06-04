// ─── Load our helper packages ────────────────────────────────────────────────
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const crypto = require("crypto");
const path = require("path");

// ─── Activate dotenv ─────────────────────────────────────────────────────────
dotenv.config();

// ─── Set up Africa's Talking SMS ─────────────────────────────────────────────
const AfricasTalking = require("africastalking");
const africastalking = AfricasTalking({
  username: process.env.AT_USERNAME,
  apiKey: process.env.AT_API_KEY,
});
const sms = africastalking.SMS;

// ─── Create the Express app ───────────────────────────────────────────────────
const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());

// Parse incoming data — skip webhook route (needs raw body)
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook/paystack") {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// ─── Test Route ───────────────────────────────────────────────────────────────
app.get("/api/ping", (req, res) => {
  res.json({ message: "Backend is alive! 🚀" });
});

// ─── Paystack Webhook ─────────────────────────────────────────────────────────
app.post(
  "/webhook/paystack",
  express.raw({ type: "application/json" }),
  async (req, res) => {

    // Verify request came from Paystack
    const paystackSignature = req.headers["x-paystack-signature"];
    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(req.body)
      .digest("hex");

    if (hash !== paystackSignature) {
      console.log("❌ Invalid webhook signature.");
      return res.status(401).send("Unauthorized");
    }

    // Read the event
    const event = JSON.parse(req.body);
    console.log("✅ Webhook received:", event.event);

    // Only act on successful payments
    if (event.event === "charge.success") {
      const customerPhone = event.data.metadata.phone;
      const customerName = event.data.metadata.fullName;
      const amount = event.data.amount / 100;

      console.log(`📦 Payment confirmed for ${customerName} — KES ${amount}`);

      // Send SMS
      try {
        const result = await sms.send({
          to: [customerPhone],
          message: `Hi ${customerName}! 🎉 Your order of KES ${amount} has been confirmed. Thank you for shopping with us!`,
          from: "SHOP",
        });
        console.log("📱 SMS sent:", JSON.stringify(result));
      } catch (smsError) {
        console.error("❌ SMS failed:", smsError);
      }
    }

    res.sendStatus(200);
  }
);

// ─── Start the Server ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});// ─── Error handling middleware ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});
