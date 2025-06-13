import fs from "fs";
import fetch from "node-fetch";
import pdf from "pdf-parse";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

import { ChatGroq } from "@langchain/groq";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

dotenv.config();

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(cors());

const PDF_URL =
  "https://reactbotimage.s3.eu-north-1.amazonaws.com/AI+Mentor+Knowledge+Base.pdf";
const LOCAL_PDF_PATH = "./answers_en.pdf";

async function downloadPDF(url) {
  console.log("⏳ Starting PDF download...");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(LOCAL_PDF_PATH, buffer);
  console.log(`✅ PDF downloaded successfully. Size: ${buffer.length} bytes`);
}

async function extractTextFromPDF(filePath) {
  console.log("🔍 Checking if PDF file exists at:", filePath);
  if (!fs.existsSync(filePath)) {
    throw new Error("PDF file not found at path: " + filePath);
  }
  const dataBuffer = fs.readFileSync(filePath);
  console.log(
    `📄 PDF file read successfully. Size: ${dataBuffer.length} bytes`
  );
  const data = await pdf(dataBuffer);
  console.log("✅ PDF text extracted.");
  return data.text;
}

async function processPDF(question) {
  try {
    if (!fs.existsSync(LOCAL_PDF_PATH)) {
      await downloadPDF(PDF_URL);
    } else {
      console.log("📄 PDF already exists locally.");
    }

    const fullText = await extractTextFromPDF(LOCAL_PDF_PATH);

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await textSplitter.createDocuments([fullText]);
    console.log(`✅ Text split into ${docs.length} chunks.`);

    const vectorstore = await MemoryVectorStore.fromDocuments(
      docs,
      new OpenAIEmbeddings()
    );
    const retriever = vectorstore.asRetriever();

    const template = `You are a professional and courteous customer service representative.
Your goal is to provide accurate and helpful answers to customer inquiries based on the information provided in the supplied documents.

Use the following context to formulate your response:
{context}

If no information is available, politely update the customer and offer alternative solutions.
Maintain a polite and supportive tone, with a concise and brief answer (up to two sentences).`;

    const llm = new ChatGroq({
      model: "llama3-8b-8192",
      apiKey: process.env.GROQ_API_KEY,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", template],
      ["human", question],
    ]);

    const questionAnswerChain = await createStuffDocumentsChain({
      llm,
      prompt,
    });

    const ragChain = await createRetrievalChain({
      retriever,
      combineDocsChain: questionAnswerChain,
    });

    const results = await ragChain.invoke({ input: question });
    return results.answer;
  } catch (error) {
    console.error("❌ Error processing PDF:", error);
    throw error;
  }
}

app.post("/ask", async (req, res) => {
  const { question } = req.body;
  try {
    console.log("📥 Received question:", question);
    const answer = await processPDF(question);
    console.log("📤 Answer:", answer);
    res.json({ answer });
  } catch (error) {
    console.error("❌ Server error:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing your question." });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running at: http://localhost:${PORT}`);
});
