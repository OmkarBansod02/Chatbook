/**
 * PDF Initialization Utility
 * 
 * This module provides functionality to ensure the PDF is properly processed
 * at application startup and the agent has access to its content.
 */
import fs from 'fs';
import path from 'path';
import { google } from '@ai-sdk/google';
import { RAGProcessor } from './rag-processor';
import { setLastProcessedPdfPath } from './pdf-storage';

// Default PDF path to process on startup
const DEFAULT_PDF_PATH = 'D:/Mastra-Book/mastra-chatbook/src/mastra/data/pdf/Principles2.pdf';

/**
 * Initialize PDF processing at application startup
 * Ensures PDF is processed, indexed, and available for the agent
 */
export async function initializePdf() {
  try {
    console.log('Initializing PDF processing...');
    const pdfPath = DEFAULT_PDF_PATH;
    
    if (!pdfPath) {
      console.warn('No default PDF found, skipping initialization.');
      return;
    }
    
    // First, check if the default PDF file actually exists.
    if (!fs.existsSync(pdfPath)) {
      console.error(`Error: Default PDF not found at the specified path: ${pdfPath}`);
      console.error('Please update the DEFAULT_PDF_PATH in src/mastra/tools/initialize-pdf.ts');
      return; // Stop initialization if the file doesn't exist.
    }

    console.log(`Found target PDF: ${pdfPath}`);
    
    // Create a processor instance with explicit index name
    const processor = new RAGProcessor({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
      indexName: 'pdf_documents'
    });

    // Clean up any old data before processing
    await processor.cleanup();
    
    console.log('Processing default PDF...');
    // Process the PDF using the Google embedding model.
    const embedder = google.embedding('embedding-001');
    const result = await processor.processPDF(pdfPath, embedder);
    
    console.log(`PDF processed successfully! Created ${result.chunks} chunks.`);
    
    // Update storage with the processed PDF path
    setLastProcessedPdfPath(DEFAULT_PDF_PATH);
    console.log(`Set default PDF path in storage: ${DEFAULT_PDF_PATH}`);
    
    // Verify search functionality
    console.log('Verifying search functionality...');
    const searchResults = await processor.searchContent('transformer', 1);
    
    if (searchResults.length > 0) {
      console.log(`Search verification successful! Score: ${searchResults[0].score}`);
      console.log(`Top result metadata:`, JSON.stringify(searchResults[0].metadata, null, 2));
      console.log('The agent is ready for queries about the PDF.');
      return true;
    } else {
      console.warn('Search verification failed. No results found for test query.');
      return false;
    }
  } catch (error) {
    console.error('Error initializing PDF:', error);
    return false;
  }
}
