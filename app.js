require("dotenv").config();
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");
const { Pool } = require("pg");
const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 3001;

const DBClient = new Pool({
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});


const server = new McpServer({
  name: "Database",
  version: "1.0.0",
  capabilities: { resources: {} },
});


server.tool("store_feedback", {
  description:
    "Stores customer feedback about service quality and suggestions for improvement in the database.",
  inputSchema: z.object({
    service_quality_feedback: z
      .string()
      .describe("Feedback on the quality of the service."),
    improvement_suggestions: z
      .string()
      .describe("Suggestions from the customer on how to improve services."),
  }),
  handler: async (input) => {
    const { service_quality_feedback, improvement_suggestions } = input;

    try {
      await DBClient.query(
        `INSERT INTO feedback (service_quality_feedback, improvement_suggestions)
         VALUES ($1, $2)`,
        [service_quality_feedback, improvement_suggestions]
      );

      return {
        success: true,
        message: "Feedback stored successfully!",
      };
    } catch (err) {
      console.error("DB Insert Error:", err);
      return {
        success: false,
        message: "Error storing feedback: " + err.message,
      };
    }
  },
});


const app = express();
app.use(cors());
app.use(express.json());


app.post("/tool/:name", async (req, res) => {
  const toolName = req.params.name;
  const input = req.body;

  try {
    const tool = server.getTool(toolName);
    if (!tool) {
      return res.status(404).json({ error: `Tool '${toolName}' not found.` });
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const result = await tool.handler(input);

    res.write(JSON.stringify({ event: "result", data: result }) + "\n");
    res.end();
  } catch (err) {
    console.error("Tool execution error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/", (req, res) => {
  res.send("MCP HTTP server is running 🚀");
});

app.listen(PORT, () => {
  console.log(`Backend proxy running on port ${PORT}`);
});
