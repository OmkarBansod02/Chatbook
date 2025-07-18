# Chatbook: A Conversational AI for Your PDFs

Chatbook is a sophisticated RAG (Retrieval-Augmented Generation) application that transforms any PDF document into a conversational partner. Powered by Mastra, Google Generative AI, and Qdrant, it allows you to "chat" with your books and documents in a natural, intuitive way.

This project features a "Digital Librarian" AI agent that has read the document and is ready to discuss its contents, answer questions, and help you find the information you need.

## Key Features

-   **Conversational Interface:** Chat with your PDFs in natural language.
-   **Intelligent "Digital Librarian" Agent:** An AI persona that understands context and provides synthesized, human-like answers.
-   **Automatic PDF Processing:** The application automatically ingests, chunks, and creates vector embeddings for a specified PDF on startup.
-   **High-Performance Vector Search:** Utilizes Qdrant for fast and accurate semantic search across the document's content.
-   **Powered by Mastra:** Built on the powerful Mastra agent framework for robust tool use and workflow management.

## Tech Stack

-   **Framework:** [Mastra](https://mastra.ai/)
-   **Language:** TypeScript
-   **LLM:** Google Generative AI (Gemini)
-   **Vector Database:** Qdrant
-   **PDF Parsing:** `pdfjs-dist`

## Prerequisites

-   Node.js (v20.9.0 or higher)
-   Qdrant instance (can be run locally via Docker)
-   Google Generative AI API Key

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/OmkarBansod02/Chatbook.git
cd Chatbook
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Now, open the `.env` file and add your credentials. It should look like this:

```
# Google Generative AI API Key
GOOGLE_GENERATIVE_AI_API_KEY="YOUR_API_KEY_HERE"

# Qdrant Configuration
QDRANT_URL="http://localhost:6333"
QDRANT_API_KEY="YOUR_QDRANT_KEY_HERE" # Optional, if required by your instance
```

### 4. Launch Qdrant

If you are running Qdrant locally, you can start it with Docker:

```bash
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

## Usage

### 1. Start the Application

Run the development server:

```bash
npm run dev
```

The application will automatically process the default PDF specified in `src/mastra/tools/initialize-pdf.ts`.

### 2. Chat with Your PDF

Once the server is running, you can start asking questions. The agent will use its knowledge of the processed PDF to answer.

**Example Questions:**

-   "Who is the author of this book?"
-   "Can you give me a summary of the first chapter?"
-   "What does the book say about AI agents?"
-   "According to the author, what is the most important principle?"

### 3. Changing the Default PDF

To chat with a different book, simply change the `defaultPdfPath` variable in `src/mastra/tools/initialize-pdf.ts` to the absolute path of your desired PDF file and restart the application.

## How It Works

This project uses a RAG architecture:

1. **Ingestion:** The text from the PDF is extracted, split into smaller chunks, and converted into vector embeddings using the Google Generative AI API.
2. **Storage:** These embeddings are stored in a Qdrant vector database.
3. **Retrieval:** When you ask a question, your query is also converted into an embedding. The application then searches the Qdrant database for the most similar (i.e., most relevant) text chunks from the document.
4. **Generation:** The retrieved text chunks are passed to the Google Generative AI model along with your original question. The model then generates a natural, conversational answer based on the provided context.

## License

MIT