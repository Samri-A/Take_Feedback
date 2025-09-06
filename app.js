require('dotenv').config()
const {McpServer} = require("@modelcontextprotocol/sdk/server/mcp.js")
const { z } = require("zod");
const {StdioServerTransport} = require("@modelcontextprotocol/sdk/server/stdio.js")
const {Pool} = require('pg');
const {createReactAgent} = require('@langchain/langgraph/prebuilt');
const  {ChatOpenAI} = require( '@langchain/openai');
const {loadMcpTools} = require( '@langchain/mcp-adapters');
const { BufferMemory } = require ("langchain/memory");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { initializeAgentExecutorWithOptions } = require("langchain/agents");

const express = require("express");
const app = express()
app.use(express.json());

let tools;
let agent;
const memory = new BufferMemory({
  memoryKey: "chat_history",
   inputKey: "input",         
  returnMessages: true,      
});


const PORT = process.env.PORT || 3001;

const DBClient = new Pool({
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
});

const server = new McpServer({
    name : "Database",
    version: "1.0.0",
    capabilities: {
    resources: {},
  },
})

server.tool("store_feedback", {
    description: "Stores customer feedback about service quality and suggestions for improvement in the database.",
    inputSchema: z.object({
        service_quality_feedback: z.string().describe("Feedback on the quality of the service."),
        improvement_suggestions: z.string().describe("Suggestions from the customer on how to improve services."),
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
                message: "Feedback stored successfully!"
            };
        } catch (err) {
            console.error("DB Insert Error:", err);
            return {
                success: false,
                message: "Error storing feedback: " + err.message
            };
        }
    }
});



async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("MCP server connected");
  const mcpClient = new Client({ name: "BackendAgent" ,   version: "1.0.0",});
  await mcpClient.connect(new StdioClientTransport(
   { 
  command: "node",
  args: ["app.js"],
  stderr: "pipe"
}
  ));
  tools = await loadMcpTools("Database", mcpClient);
  tools = tools.map(tool => {
  if (tool.name === "store_feedback") {
    tool.description = "Stores customer feedback about service quality and suggestions for improvement in the database.";
    tool.schema = 
        z.object({
        service_quality_feedback: z.string().describe("Feedback on the quality of the service."),
        improvement_suggestions: z.string().describe("Suggestions from the customer on how to improve services."),
    });
  }
  return tool
})
  console.log(tools);
  const assistant = new ChatOpenAI({
    configuration: {
      apiKey: process.env.api_key,
      baseURL: 'https://openrouter.ai/api/v1'
    },
    model: "mistralai/mistral-small-3.2-24b-instruct:free"
  });
   agent = await initializeAgentExecutorWithOptions(
  tools,  
  assistant,    
  {
    agentType: "chat-conversational-react-description",
    memory,
    verbose: true,
  }
);

  app.listen(PORT, () => {
  console.log(`Backend proxy running on port ${PORT}`);
});
}

startServer().catch(console.error);


app.post("/api/store_feedback", async(req , res) => {
    
  const feedback_agent = await agent.invoke({
    input:   `You are "FeedbackBot", a professional AI assistant for BrightWave Solutions. 
       Your task is simple: ask the user **only these two questions**:
       
       1. "Please provide your feedback on the quality of our service."
       2. "Do you have suggestions on how we can improve our service?"
       
       Do not add extra commentary, explanations, or repeated clarifications.  
       
       Once the user answers both, immediately call the MCP tool to save the response
       
       After storing, respond only with: "Thank you, your feedback has been recorded."
       
       User Input: ${JSON.stringify(req.body)}
       `

   
       
  });
  const Message = feedback_agent.output 
  return res.status(200).send(Message);

}
);


