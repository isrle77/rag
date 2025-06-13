import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// פונקציה לעיבוד תמונה עם OCR
async function processImage(base64Image) {
  try {
    console.log("Starting OCR processing..."); // לוג לפני עיבוד
    const buffer = Buffer.from(base64Image, "base64");
    const result = await Tesseract.recognize(buffer, "heb"); // תומך בעברית
    console.log("OCR result:", result.data.text); // לוג לאחר עיבוד
    return result.data.text;
  } catch (error) {
    console.error("Error during OCR processing:", error); // לוג לחריגות
    throw error;
  }
}

async function processPDF(question) {
  try {
    const answersURL =
      "https://sroogle.s3.eu-north-1.amazonaws.com/answers.pdf";
    const localPdfPath = "./answers.pdf";

    // הורדת ה-PDF ושמירה
    const response = await fetch(answersURL);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPdfPath, buffer);
    console.log("PDF downloaded successfully.");

    // קריאת ה-PDF
    const pdfData = new Uint8Array(fs.readFileSync(localPdfPath));
    const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
    console.log("PDF loaded successfully.");

    let extractedText = "";

    // לולאה דרך כל הדפים והפקת הטקסט
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();

      // צירוף הטקסט מהדף
      textContent.items.forEach((item) => {
        extractedText += item.str + " ";
      });
    }

    console.log("Extracted text:", extractedText);

    // בדיקת התאמה לשאלה
    if (extractedText.includes(question)) {
      return `נמצא מידע תואם במסמך: ${question}`;
    } else {
      return "לא נמצא מידע במסמך התואם לשאלתך.";
    }
  } catch (error) {
    console.error("Error processing PDF:", error);
    throw error;
  }
}

// פונקציה לעיבוד PDF עם LangChain
// async function processPDF(question) {
//   try {
//     const answersURL =
//       "https://sroogle.s3.eu-north-1.amazonaws.com/answers.pdf";
//     const localPdfPath = "./answers.pdf";

//     // הורדת PDF
//     // הורדת PDF
//     const response = await fetch(answersURL);
//     if (!response.ok) {
//       throw new Error(`Failed to download PDF: ${response.statusText}`);
//     }
//     const buffer = Buffer.from(await response.arrayBuffer());
//     fs.writeFileSync(localPdfPath, buffer);
//     console.log("PDF downloaded successfully.");

//     // קריאת המסמך עם fs
//     const pdfBuffer = fs.readFileSync(localPdfPath);

//     // עיבוד המסמך עם pdf-parse
//     const pdfData = await pdf(pdfBuffer);
//     console.log("PDF text extracted successfully.");

//     // חילוץ הטקסט
//     const pdfText = pdfData.text;
//     console.log("Extracted text:", pdfText);

//     // חיפוש הטקסט במסמך
//     if (pdfText.includes(question)) {
//       return `נמצא מידע תואם במסמך: ${question}`;
//     } else {
//       return "לא נמצא מידע במסמך התואם לשאלתך.";
//     }

//     // פיצול המסמך
//     const textSplitter = new RecursiveCharacterTextSplitter({
//       chunkSize: 1000,
//       chunkOverlap: 200,
//     });
//     const splits = await textSplitter.splitDocuments(docs);
//     console.log("Documents split successfully:", splits);

//     // יצירת VectorStore
//     const vectorstore = await MemoryVectorStore.fromDocuments(
//       splits,
//       new OpenAIEmbeddings()
//     );
//     console.log("VectorStore created successfully.");

//     // הגדרת PromptTemplate
//     const template = `
//     אתה נציג תמיכה שמטרתך לעזור לשאלות הלקוח על סמך המידע הבא מתוך מסמך PDF.
//     אם המידע לא מספיק, אמור "לא מצאתי מידע במסמך, נסה לשאול משהו אחר".
//     המידע לשימושך:
//     {context}

//     השאלה: {question}

//     ענה בצורה ברורה וקצרה.
//     `;
//     const prompt = new PromptTemplate({
//       template: template,
//       inputVariables: ["context", "question"],
//     });

//     // יצירת LLM Chain
//     const llm = new ChatOpenAI({
//       model: "gpt-4",
//       openaiApiKey: process.env.OPENAI_API_KEY,
//     });
//     const llmChain = new LLMChain({
//       llm: llm,
//       prompt: prompt,
//     });

//     // יצירת RetrievalQAChain
//     const retriever = vectorstore.asRetriever();
//     const qaChain = new RetrievalQAChain({
//       retriever,
//       combineDocumentsChain: llmChain,
//     });

//     // הרצת השרשרת
//     const results = await qaChain.call({ query: question });
//     console.log("RAG Chain results:", results);
//     return results.text || "לא הצלחתי למצוא תשובה במסמך.";
//   } catch (error) {
//     console.error("Error processing PDF:", error);
//     throw error; // החזר את החריגה החוצה
//   }
// } // כאן נסגרת הפונקציה processPDF

app.post("/ask", async (req, res) => {
  const { question, image } = req.body;
  console.log("Request received:", { question, image }); // לוג ראשוני

  try {
    let combinedQuestion = question;

    if (image) {
      console.log("Processing image..."); // לוג לפני עיבוד תמונה
      const extractedText = await processImage(image);
      console.log("Extracted text from image:", extractedText); // לוג לאחר עיבוד תמונה
      if (extractedText) {
        combinedQuestion += ` ${extractedText}`;
      }
    }

    console.log("Final question to processPDF:", combinedQuestion); // לוג לשאלה הסופית

    const answer = await processPDF(combinedQuestion);
    console.log("Answer from processPDF:", answer); // לוג לתשובה

    if (!answer || answer.trim() === "") {
      res.json({
        answer: "לא מצאתי תשובה לשאלתך. נסה לשאול שאלה אחרת או הוסף מידע נוסף.",
      });
    } else {
      res.json({ answer });
    }
  } catch (error) {
    console.error("Error processing request:", error); // לוג לחריגות
    res
      .status(500)
      .json({ error: "An error occurred while processing your question." });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
