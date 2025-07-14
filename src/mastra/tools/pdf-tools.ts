import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { PDFProcessor } from './pdf-processor';
import fs from 'fs';
import path from 'path';
// Avoid circular dependency by removing import { mastra } from '../index';

import { getLastProcessedPdfPath, setLastProcessedPdfPath } from './pdf-storage';

// Export getter and setter functions for lastProcessedPdfPath
export const getPdfPath = () => getLastProcessedPdfPath();
export const setPdfPath = (path: string) => {
  console.log(`Setting lastProcessedPdfPath to: ${path}`);
  setLastProcessedPdfPath(path);
};

/**
 * PDF Upload Tool - Process and embed a PDF document
 * 
 * This tool allows users to upload and process a PDF file, extracting text,
 * creating embeddings, and storing them in Qdrant for later retrieval.
 */
export const uploadPdfTool = createTool({
  id: 'upload-pdf',
  description: 'Upload and process a PDF document',
  inputSchema: z.object({
    filePath: z.string().describe('Absolute path to the PDF file'),
    title: z.string().optional().describe('Optional title for the document'),
    author: z.string().optional().describe('Optional author name for the document'),
    description: z.string().optional().describe('Optional description for the document'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    fileName: z.string().optional(),
    chunks: z.number().optional(),
  }),
  execute: async ({ context }) => {
    try {
      // Validate file path
      if (!context.filePath) {
        return {
          success: false,
          message: 'Please provide a valid PDF file path',
          chunks: 0,
        };
      }

      // Check if file exists
      if (!fs.existsSync(context.filePath)) {
        return {
          success: false,
          message: `File not found: ${context.filePath}`,
          chunks: 0,
        };
      }

      // Store path for future queries
      setPdfPath(context.filePath);

      // Create a new PDF processor with Qdrant config
      const processor = new PDFProcessor({
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: 'pdf_documents' // Ensure consistent collection name
      });

      // Process the PDF file
      const result = await processor.processPDF(context.filePath, {
        title: context.title,
        author: context.author,
        description: context.description,
      });

      return {
        success: true,
        message: `Successfully processed PDF: ${result.fileName} with ${result.chunks} chunks`,
        fileName: result.fileName,
        chunks: result.chunks,
      };
    } catch (error) {
      console.error('Error processing PDF:', error);
      return {
        success: false,
        message: `Error processing PDF: ${error.message}`,
        chunks: 0,
      };
    }
  },
});

/**
 * PDF Query Tool - Search for content in processed PDFs
 * 
 * This tool allows users to search for relevant content in previously processed
 * PDF files using semantic search via Qdrant vector database.
 */
export const queryPdfTool = createTool({
  id: 'query-pdf',
  description: 'Query content from processed PDFs',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    filePath: z.string().optional().describe('Optional path to PDF file (uses last processed PDF if not specified)'),
    topK: z.number().optional().default(5).describe('Number of results to return'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        text: z.string(),
        score: z.number(),
        metadata: z.any(),
      })
    ),
    query: z.string(),
    fileName: z.string().optional(),
  }),
  execute: async ({ context }) => {
    try {
      // Check if there's a valid query
      if (!context.query || context.query.trim().length === 0) {
        return {
          results: [],
          query: context.query || '',
          fileName: '',
        };
      }

      // Use provided path or fallback to last processed path
      const pdfPath = context.filePath || getPdfPath();
      
      if (!pdfPath) {
        return {
          results: [],
          query: context.query,
          fileName: '',
        };
      }

      // Log which PDF is being queried
      console.log(`Querying PDF: ${pdfPath} for query: "${context.query}"`);

      // Create a new PDF processor with Qdrant config
      const processor = new PDFProcessor({
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: 'pdf_documents' // Ensure consistent collection name
      });

      // Search for content
      console.log(`Executing query: "${context.query}" on PDF: ${pdfPath}`);
      const results = await processor.searchContent(context.query, context.topK || 5);
      
      if (results.length === 0) {
        console.log(`No results found for query: "${context.query}". Possible issue with vectors.`);
      } else {
        console.log(`Found ${results.length} matching chunks`);
      }
      
      // Format results with proper text and metadata, adapting to our simplified structure
      const formattedResults = results.map(result => {
        // Ensure we have text from metadata
        const resultText = result.metadata?.text || "No text content available for this document section";
        
        return {
          text: resultText,
          score: result.score,
          metadata: {
            fileName: path.basename(pdfPath),
            title: result.metadata?.title || path.basename(pdfPath, '.pdf'),
            source: result.metadata?.source || path.basename(pdfPath),
          }
        };
      });

      return {
        results: formattedResults,
        query: context.query,
        fileName: path.basename(pdfPath),
      };
    } catch (error) {
      console.error('Error querying PDF content:', error);
      return {
        results: [],
        query: context.query,
        fileName: '',
      };
    }
  },
});
