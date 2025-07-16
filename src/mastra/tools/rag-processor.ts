import fs from 'fs';
import path from 'path';

import { MDocument } from '@mastra/rag';
import { QdrantVector } from '@mastra/qdrant';
import { google } from '@ai-sdk/google';
import { embedMany } from 'ai';
import { randomUUID } from 'crypto';

/**
 * Define interface for search results
 */
interface QdrantSearchResult {
  score: number;
  metadata: any;
  text?: string;
}

/**
 * RAG Processor for handling PDF documents using Mastra's RAG capabilities
 */
export class RAGProcessor {
  private vectorDB: QdrantVector;
  private indexName: string;
  
  constructor(options: {
    url: string;
    apiKey?: string;
    indexName: string;
  }) {
    // Initialize the Qdrant vector DB connection - simple initialization like in the original code
    this.vectorDB = new QdrantVector({
      url: options.url,
      apiKey: options.apiKey
    });
    this.indexName = options.indexName;
    console.log(`Initialized Qdrant client for collection: ${this.indexName}`);
  }

  /**
   * Test the connection to Qdrant
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test if Qdrant is accessible
      await this.vectorDB.listIndexes();
      console.log('Qdrant connection test successful');
      return true;
    } catch (error: any) {
      console.error(`Qdrant connection test failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate safe IDs for vector points
   */
  private generateSafeIds(count: number): string[] {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(randomUUID());
    }
    return ids;
  }

  /**
   * Initialize or reset the Qdrant index
   */
  async cleanup(): Promise<void> {
    console.log(`Cleaning up index: ${this.indexName}`);

    try {
      // Try to delete the existing collection first
      try {
        await this.vectorDB.deleteIndex({ indexName: this.indexName });
        console.log(`Collection '${this.indexName}' deleted.`);
      } catch (error: any) {
        // It's okay if the collection didn't exist
        if (error.message?.includes('not found')) {
          console.log(`Collection '${this.indexName}' did not exist, no need to delete.`);
        } else {
          console.warn(`Error deleting index '${this.indexName}':`, error);
        }
      }
    } catch (error: any) {
      console.error(`Error in cleanup for index '${this.indexName}':`, error);
    }
  }

  /**
   * Process a PDF file and store its content as embeddings in Qdrant
   */
  async processPDF(filePath: string, embedder: any): Promise<{ chunks: number; fileName: string }> {
    console.log(`Processing PDF file: ${filePath}`);
    const startTime = Date.now();

    try {
      // Read the PDF file
      const fileBuffer = fs.readFileSync(filePath);
      const uint8Array = new Uint8Array(fileBuffer);
      const fileName = path.basename(filePath);

      // Prepare document metadata
      const pdfTitle = fileName.replace('.pdf', '');

      // Dynamically import the Node.js build of pdf.js
      const pdfjsLib = (await import('pdfjs-dist/legacy/build/pdf.js')).default;

      // Extract full text from PDF
      console.log('Extracting text from PDF...');

      // Set up the worker for Node.js environment
      const CMAP_URL = './node_modules/pdfjs-dist/cmaps/';

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        cMapUrl: CMAP_URL,
        cMapPacked: true,
      });

      const pdfDocument = await loadingTask.promise;
      console.log(`PDF loaded with ${pdfDocument.numPages} pages`);

      // Extract text from each page
      let fullText = '';
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item: any) => item.str);
        const pageText = strings.join(' ');
        fullText += pageText + '\n\n';
      }

      // 1. Initialize document
      const doc = MDocument.fromText(fullText);

      // 2. Create chunks
      const chunks = await doc.chunk({
        strategy: "recursive",
        size: 1000,
        overlap: 200,
      });
      
      console.log(`Split text into ${chunks.length} chunks`);

      // Clean up existing collection before processing
      await this.cleanup();

      const BATCH_SIZE = 100; // Max batch size for Google's embedding API
      let isIndexCreated = false;

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batchChunks = chunks.slice(i, i + BATCH_SIZE);
        const textsToEmbed = batchChunks.map(chunk => chunk.text);
        
        console.log(`Processing batch ${i / BATCH_SIZE + 1}: ${batchChunks.length} chunks`);

        // Generate embeddings for the current batch
        const { embeddings } = await embedMany({
          values: textsToEmbed,
          model: embedder,
        });

        // Create the index on the first batch, if it hasn't been created yet
        if (!isIndexCreated && embeddings.length > 0) {
          await this.vectorDB.createIndex({
            indexName: this.indexName,
            dimension: embeddings[0].length
          });
          console.log(`Created index: ${this.indexName} with dimension: ${embeddings[0].length}`);
          isIndexCreated = true;
        }

        // Prepare metadata and IDs for the batch
        const chunkMetadataArray = batchChunks.map((chunk, j) => ({
          text: chunk.text,
          title: pdfTitle,
          fileName: fileName,
          chunkIndex: i + j,
          totalChunks: chunks.length,
        }));
        const ids = this.generateSafeIds(batchChunks.length);

        // Upsert the batch to Qdrant
        await this.vectorDB.upsert({
          indexName: this.indexName,
          vectors: embeddings,
          metadata: chunkMetadataArray,
          ids: ids
        });
        console.log(`Successfully stored batch ${i / BATCH_SIZE + 1} in index: ${this.indexName}`);
      }
      
      const processingTime = (Date.now() - startTime) / 1000;
      console.log(`PDF processed in ${processingTime.toFixed(2)} seconds`);
      
      return {
        chunks: chunks.length,
        fileName
      };
    } catch (error: any) {
      console.error(`Error processing PDF: ${error.message}`);      
      if (error.cause) {
        console.error('Caused by:', error.cause.message);
      }
      throw error;
    }
  }



  /**
   * Search for content using a query string
   */
  async searchContent(query: string, topK: number = 5): Promise<Array<{ text: string; score: number; metadata: any }>> {
    try {
      console.log(`Searching for query: "${query}" in index: ${this.indexName}`);
      
      // Generate embedding for the query
      const { embeddings } = await embedMany({
        values: [query],
        model: google.embedding("embedding-001"),
      });
      
      if (!embeddings || embeddings.length === 0) {
        throw new Error('Failed to generate query embedding');
      }

      console.log(`Generated query embedding with dimension: ${embeddings[0].length}`);
      
      // Search for similar content using the standard client
      const results = await this.vectorDB.query({
        indexName: this.indexName,
        queryVector: embeddings[0],
        topK
      });
      
      console.log(`Search returned ${results.length} results`);
      
      // Log result details for debugging
      if (results.length > 0) {
        console.log(`Top result score: ${results[0].score}`);
        console.log(`Top result metadata:`, JSON.stringify(results[0].metadata, null, 2));
      } else {
        console.log('No results found in vector search');
      }
      
      return results.map(result => {
        const metadata = result.metadata || {};
        return {
          score: result.score,
          metadata: metadata,
          text: metadata.text || ''
        };
      });
    } catch (error: any) {
      console.error(`Error searching content: ${error.message}`);
      return [];
    }
  }
}
