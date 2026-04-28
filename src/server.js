import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./utils/swagger.js";
import routes from "./routes/index.js";
import authRoutes from "./routes/authRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import userRoutes from "./routes/userRoutes.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Global rate limit — all routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

// Strict rate limit — public live API only
const liveLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests to live API, please slow down" },
});

app.use(express.json());
app.use(globalLimiter);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/content/live", liveLimiter);
app.use("/content", contentRoutes);
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/", routes);

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "File too large. Max size is 10MB" });
  }
  if (err.message === "Invalid file type") {
    return res.status(400).json({ message: "Invalid file type. Only JPG, PNG, GIF allowed" });
  }
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});