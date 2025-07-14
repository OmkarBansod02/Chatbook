import fs from 'fs';
import path from 'path';
import { QdrantVector } from '@mastra/qdrant';
import { google } from '@ai-sdk/google';
import { embedMany } from 'ai';
import { randomUUID } from 'crypto';

/**
 * PDF Processing utilities to handle PDF parsing, embedding generation, and vector storage
 */
export class PDFProcessor {
  private vectorDB: QdrantVector;
  private collection: string;
  
  constructor(options: { 
    url: string; 
    apiKey?: string;
    collectionName?: string;
  }) {
    // Initialize the Qdrant vector DB connection
    this.vectorDB = new QdrantVector({
      url: options.url,
      apiKey: options.apiKey
    });
    this.collection = options.collectionName || 'pdf_documents';
  }
  
  /**
   * Split text into manageable chunks for embedding and retrieval
   * @param text Full text to split
   * @param chunkSize Target size for each chunk
   * @returns Array of text chunks
   */
  /**
   * Deletes and recreates the collection to ensure a clean state.
   */
  async cleanup(): Promise<void> {
    console.log(`Cleaning up collection: ${this.collection}`);
    try {
      await this.vectorDB.deleteIndex({ indexName: this.collection });
      console.log(`Collection '${this.collection}' deleted.`);
    } catch (error: any) {
      // It's okay if the collection didn't exist
      if (error.message.includes('not found')) {
        console.log(`Collection '${this.collection}' did not exist, no need to delete.`);
      } else {
        throw error; // Re-throw other errors
      }
    }
  }

  splitTextIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    
    // Split by paragraphs first to maintain coherence
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
    
    for (const paragraph of paragraphs) {
      // If paragraph itself is too large, split by sentences
      if (paragraph.length > chunkSize * 1.5) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 1 <= chunkSize) {
            currentChunk += (currentChunk ? ' ' : '') + sentence;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
          }
        }
      } else {
        // Add paragraph if it fits, otherwise start a new chunk
        if (currentChunk.length + paragraph.length + 2 <= chunkSize) {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        } else {
          if (currentChunk) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = paragraph;
        }
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
  
  /**
   * Process a PDF file and store its embeddings in Qdrant
   * @param filePath Path to the PDF file
   * @param metadata Additional metadata to store with the chunks
   * @returns Information about the processed document
   */
  async processPDF(filePath: string, metadata: Record<string, any> = {}) {
    console.log(`Processing PDF file: ${filePath}`);
    
    try {
      // Read the PDF file
      const fileBuffer = fs.readFileSync(filePath);
      const uint8Array = new Uint8Array(fileBuffer);
      const fileName = path.basename(filePath);
      

      
      // Create basic metadata
      const pdfTitle = metadata.title || fileName.replace('.pdf', '');
      
      // Dynamically import the Node.js build of pdf.js and access the default export
      const pdfjsLib = (await import('pdfjs-dist/legacy/build/pdf.js')).default;

      // Extract full text from PDF using pdfjs-dist for Node.js
      console.log('Extracting full text from PDF...');
      
      // For Node.js environment, we need to set up the worker
      const CMAP_URL = './node_modules/pdfjs-dist/cmaps/';
      
      // Load PDF document with Node.js specific options
      // Use type assertion to handle Node.js specific options
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array, // Use the Uint8Array here
        disableFontFace: true,
        cMapUrl: CMAP_URL,
        cMapPacked: true
      } as any);
      
      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;
      console.log(`PDF has ${numPages} pages`);
      
      // Extract text from each page
      let fullText = '';
      for (let i = 1; i <= numPages; i++) {
        console.log(`Processing page ${i}/${numPages}...`);
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        
        // Handle both TextItem and TextMarkedContent types
        let pageText = '';
        for (const item of textContent.items) {
          if ('str' in item) {
            pageText += item.str + ' ';
          }
        }
        
        fullText += pageText + '\n\n';
      }
      
      console.log(`Extracted ${fullText.length} characters from PDF`);
      console.log(`Processed ${numPages} pages from PDF`);
      
      // Split the text into reasonably sized chunks
      const chunks = this.splitTextIntoChunks(fullText, 1000);  // ~1000 char chunks
      console.log(`Created ${chunks.length} text chunks from PDF`);
      
      // Create multiple vectors with proper chunking
      const ids: string[] = [];
      const textsToEmbed: string[] = [];
      const chunkMetadataArray: Record<string, any>[] = [];
      
      // Prepare data for embedding and storage
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const id = randomUUID();
        ids.push(id);
        textsToEmbed.push(chunk);
        
        // Create rich metadata for each chunk
        const chunkMetadata = {
          text: chunk,
          title: pdfTitle,
          fileName: fileName,
          author: metadata.author || 'Unknown',
          description: metadata.description || '',
          pageCount: pdfDocument.numPages,
          chunkIndex: i,
          totalChunks: chunks.length,
          source: filePath
        };
        
        chunkMetadataArray.push(chunkMetadata);
      }
      
      console.log(`Generating embeddings for ${textsToEmbed.length} chunks...`);
      // Generate embeddings for all chunks
      const { embeddings } = await embedMany({
        values: textsToEmbed,
        model: google.embedding("embedding-001"),
      });
      
      if (embeddings.length === 0) {
        throw new Error('Failed to generate embeddings');
      }
      
      try {
        // Delete existing collection if it exists (clean slate)
        try {
          await this.vectorDB.deleteIndex({
            indexName: this.collection
          });
          console.log(`Deleted existing collection: ${this.collection}`);
        } catch (deleteError) {
          // It's okay if the collection doesn't exist yet
        }
        
        // Create a fresh collection with known dimensions
        await this.vectorDB.createIndex({
          indexName: this.collection,
          dimension: embeddings[0].length
        });
        console.log(`Created collection: ${this.collection} with dimension: ${embeddings[0].length}`);
        
        // Add all vectors and their metadata
        await this.vectorDB.upsert({
          indexName: this.collection,
          vectors: embeddings,
          metadata: chunkMetadataArray,
          ids: ids
        });
        
        console.log(`Successfully stored ${embeddings.length} vectors in collection: ${this.collection}`);
        
        return {
          fileName,
          chunks: chunks.length,
          embeddings: embeddings.length
        };
      } catch (vectorError: any) {
        console.error(`Vector database error: ${vectorError.message}`);
        if (vectorError.cause) {
          console.error('Caused by:', vectorError.cause.message);
          if (vectorError.cause.data) {
            console.error('Response data:', JSON.stringify(vectorError.cause.data));
          }
        }
        throw vectorError;
      }
    } catch (error: any) {
      console.error(`Error processing PDF: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Search for relevant content based on a query
   * @param query The search query
   * @param topK Number of results to return
   * @returns Array of search results with metadata
   */
  async searchContent(query: string, topK: number = 5) {
    try {
      console.log(`Searching for query: "${query}" in collection: ${this.collection}`);
      
      // Generate embedding for the query
      const { embeddings } = await embedMany({
        values: [query],
        model: google.embedding("embedding-001"),
      });
      
      const embedding = embeddings[0];
      console.log(`Query embedding generated with dimension: ${embedding.length}`);
      
      // Search for similar content
      const results = await this.vectorDB.query({
        indexName: this.collection,
        queryVector: embedding,
        topK
      });
      
      console.log(`Search returned ${results.length} results`);
      
      // Log result details for debugging
      if (results.length > 0) {
        console.log(`Top result score: ${results[0].score}`);
        console.log(`Top result metadata:`, JSON.stringify(results[0].metadata, null, 2));
      } else {
        console.log('No results found. Make sure vectors are properly stored.');
      }
      
      return results;
    } catch (error: any) {
      console.error(`Error searching content: ${error.message}`);
      return [];
    }
  }
}
