import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";

import { ChatOpenAI } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

dotenv.config();

const PORT = process.env.PORT || 3000;

const app = express();

app.use(express.json({ limit: "50mb" })); // אם יש תמונות כבדות
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(express.json());
app.use(cors());
app.use(express.static("public"));

const answersURL =
  "https://reactbotimage.s3.eu-north-1.amazonaws.com/moked.pdf";

const answersURL1 =
  "https://reactbotimage.s3.eu-north-1.amazonaws.com/answers.pdf";

const answerPtp =
  "https://reactbotimage.s3.eu-north-1.amazonaws.com/AI+Mentor+Knowledge+Base.pdf";
const localPdfPath = "/tmp/answers_en.pdf";

async function downloadPDF(answerPtp) {
  const response = await fetch(answerPtp);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // קביעת נתיב התיקייה
  const dir = path.dirname(localPdfPath);

  // אם התיקייה לא קיימת, צור אותה
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(localPdfPath, buffer);
  console.log("PDF downloaded successfully.");
}

async function processPDF(question) {
  try {
    // הורדת הקובץ
    await downloadPDF(answerPtp);

    // טעינת המסמך
    const loader = new PDFLoader(localPdfPath); // השתמש בנתיב המקומי כאן

    const docs = await loader.load();
    console.log("PDF loaded successfully.");

    // פיצול המסמך
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const splits = await textSplitter.splitDocuments(docs);
    console.log("Documents split successfully:", splits.length);

    // יצירת VectorStore
    const vectorstore = await MemoryVectorStore.fromDocuments(
      splits,
      new OpenAIEmbeddings()
    );

    // הגדרת RAG Chain
    const retriever = vectorstore.asRetriever();

    // const template = `
    // אתה נציג שירות לקוחות מקצועי ואדיב.
    // המטרה שלך היא לספק תשובות מדויקות ומועילות לשאלות הלקוחות על סמך המידע המופיע במסמכים שסופקו.

    // השתמש בהקשר הבא כדי לנסח את התשובה שלך:
    // {context}

    // אם אין מידע זמין, עדכן את הלקוח בנימוס והצע פתרונות חלופיים.
    // שמור על טון מנומס ותומך, ותשובה קצרה ותמציתית (עד שני משפטים).
    // `;

    const template = `You are a professional and courteous customer service representative.
Your goal is to provide accurate and helpful answers to customer inquiries based on the information provided in the supplied documents.

Use the following context to formulate your response:
{context}

If no information is available, politely update the customer and offer alternative solutions.
Maintain a polite and supportive tone, with a concise and brief answer (up to two sentences).`;

    const llm = new ChatOpenAI({
      model: "gpt-4",
      openaiApiKey: process.env.OPENAI_API_KEY,
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
    console.error("Error processing PDF:", error);
    throw error;
  }
}

app.post("/ask", async (req, res) => {
  const { question } = req.body;

  try {
    console.log("Received question:", question);
    const answer = await processPDF(question);
    console.log("Answer:", answer);
    res.json({ answer });
  } catch (error) {
    res
      .status(500)
      .json({ error: "An error occurred while processing your question." });
  }
});

app.listen(PORT, () => {
  console.log(`ServerRag is running on http://localhost:${PORT}`);
});
