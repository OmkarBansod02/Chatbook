import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
// Import the PDF storage utility
import { getLastProcessedPdfPath, setLastProcessedPdfPath } from '../tools/pdf-storage';

// Define a unified schema for PDF operations
const pdfOperationSchema = z.object({
  // Common fields
  operation: z.enum(['process', 'query']), // Type of operation to perform
  
  // Process-specific fields
  filePath: z.string().optional(), // Required for process, optional for query 
  title: z.string().optional(),
  author: z.string().optional(),
  description: z.string().optional(),
  
  // Query-specific fields
  query: z.string().optional(), // Required for query
});



// Default PDF path
const DEFAULT_PDF_PATH = 'D:/Mastra-Book/mastra-chatbook/src/mastra/data/pdf/Attention-is-all-you-need-Paper.pdf';

// Create the core PDF operation step that handles both processing and querying
const pdfOperationStep = createStep({
  id: 'pdf-operation',
  description: 'Process or query a PDF file',
  inputSchema: pdfOperationSchema,
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    fileName: z.string().optional(),
    answer: z.string().optional(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    // Get the PDF chat agent
    const agent = mastra?.getAgent('pdfChatAgent');
    if (!agent) {
      throw new Error('PDF Chat agent not found');
    }

    const { operation } = inputData;

    // Handle PDF processing
    if (operation === 'process') {
      const { filePath, title, author, description } = inputData;
      
      if (!filePath) {
        return {
          success: false,
          message: 'File path is required for PDF processing',
          fileName: '',
        };
      }

      // Store the path persistently for future queries
      setLastProcessedPdfPath(filePath);

      // Verify file exists
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          message: `File not found: ${filePath}`,
          fileName: path.basename(filePath),
        };
      }

      // Use the agent to process the PDF
      console.log(`Processing PDF: ${filePath}`);
      const response = await agent.stream([
        {
          role: 'user',
          content: `Please process this PDF file: ${filePath}. ${title ? `Title: ${title}.` : ''} ${author ? `Author: ${author}.` : ''} ${description ? `Description: ${description}.` : ''}`
        }
      ]);

      let message = '';
      for await (const chunk of response.textStream) {
        message += chunk;
      }

      return {
        success: true,
        message: `PDF processed successfully: ${message}`,
        fileName: path.basename(filePath),
      };
    }
    
    // Handle PDF querying
    else if (operation === 'query') {
      const { query, filePath } = inputData;
      
      if (!query) {
        return {
          success: false,
          message: 'Query is required for PDF querying',
          fileName: path.basename(filePath || getLastProcessedPdfPath() || DEFAULT_PDF_PATH),
        };
      }

      // Always fetch the latest path from storage to ensure we're querying the correct document.
      const targetPdfPath = filePath || await getLastProcessedPdfPath();

      if (!targetPdfPath) {
        return {
          success: false,
          message: 'Error: No PDF has been processed. Please check the startup logs to ensure the default PDF was processed correctly.',
          fileName: '',
        };
      }

      console.log(`Querying PDF: ${targetPdfPath} with query: ${query}`);

      // Use the agent to query the PDF
      const response = await agent.stream([
        {
          role: 'user',
          content: `Based on the PDF document at ${targetPdfPath}, please answer this question: ${query}`
        }
      ]);

      let answer = '';
      for await (const chunk of response.textStream) {
        answer += chunk;
      }

      return {
        success: true,
        message: 'Query executed successfully',
        fileName: path.basename(targetPdfPath),
        answer: answer,
      };
    }
    
    // Handle invalid operation
    else {
      return {
        success: false,
        message: `Invalid operation: ${operation}`,
        fileName: '',
      };
    }
  },
});

// Unified PDF workflow that handles both processing and querying
export const pdfWorkflow = createWorkflow({
  id: 'pdf-workflow',
  description: 'Unified workflow for processing and querying PDFs',
  inputSchema: pdfOperationSchema,
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    fileName: z.string().optional(),
    answer: z.string().optional(),
  }),
}).then(pdfOperationStep);

// Legacy compatibility workflows using proper step definitions

// Step for process PDF workflow (legacy)
const processPdfLegacyStep = createStep({
  id: 'process-pdf-legacy',
  description: 'Process a PDF file (legacy adapter)',
  inputSchema: z.object({
    filePath: z.string(),
    title: z.string().optional(),
    author: z.string().optional(),
    description: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    fileName: z.string(),
    chunks: z.number(),
    message: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    try {
      // Use the agent directly for simplicity
      const agent = mastra?.getAgent('pdfChatAgent');
      if (!agent) {
        throw new Error('PDF Chat agent not found');
      }
      
      // Process the PDF using the agent
      const response = await agent.stream([
        {
          role: 'user',
          content: `Please process this PDF file: ${inputData.filePath}. ${inputData.title ? `Title: ${inputData.title}.` : ''} ${inputData.author ? `Author: ${inputData.author}.` : ''} ${inputData.description ? `Description: ${inputData.description}.` : ''}`
        }
      ]);
      
      // Collect streaming response
      let responseText = '';
      for await (const chunk of response.textStream) {
        responseText += chunk;
      }
      
      return {
        success: true,
        fileName: path.basename(inputData.filePath),
        chunks: 0, // Not tracking chunks in this implementation
        message: responseText || 'PDF processed successfully'
      };
    } catch (error) {
      console.error('Error in processPdfLegacyStep:', error);
      // Return fallback result on error
      return {
        success: false,
        fileName: path.basename(inputData.filePath || ''),
        chunks: 0,
        message: `Error processing PDF: ${error?.message || String(error)}`
      };
    }
  },
});

// Step for query PDF workflow (legacy)
const queryPdfLegacyStep = createStep({
  id: 'query-pdf-legacy',
  description: 'Query a PDF file (legacy adapter)',
  inputSchema: z.object({
    query: z.string(),
    documentTitle: z.string().optional(),
  }),
  outputSchema: z.object({
    answer: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    try {
      // Use the agent directly for simplicity
      const agent = mastra?.getAgent('pdfChatAgent');
      if (!agent) {
        throw new Error('PDF Chat agent not found');
      }
      
      // Query using the specified PDF document or use the last processed PDF
      const pdfPath = getLastProcessedPdfPath() || DEFAULT_PDF_PATH;
      const documentContext = inputData.documentTitle ? 
        `Using document ${inputData.documentTitle}` : 
        `Using the last processed PDF document`;
      
      // Query the PDF using the agent
      const response = await agent.stream([
        {
          role: 'user',
          content: `${documentContext}, please answer this question: ${inputData.query}`
        }
      ]);
      
      // Collect streaming response
      let responseText = '';
      for await (const chunk of response.textStream) {
        responseText += chunk;
      }
      
      return {
        answer: responseText || 'No answer found'
      };
    } catch (error) {
      console.error('Error in queryPdfLegacyStep:', error);
      // Return fallback result on error
      return {
        answer: `Error getting answer: ${error?.message || String(error)}`
      };
    }
  },
});

// Create legacy workflows
export const processPdfWorkflow = createWorkflow({
  id: 'process-pdf-workflow',
  description: 'Process a PDF file (legacy)',
  inputSchema: z.object({
    filePath: z.string(),
    title: z.string().optional(),
    author: z.string().optional(),
    description: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    fileName: z.string(),
    chunks: z.number(),
    message: z.string(),
  }),
}).then(processPdfLegacyStep);

export const queryPdfWorkflow = createWorkflow({
  id: 'query-pdf-workflow',
  description: 'Query a PDF file (legacy)',
  inputSchema: z.object({
    query: z.string(),
    documentTitle: z.string().optional(),
  }),
  outputSchema: z.object({
    answer: z.string(),
  }),
}).then(queryPdfLegacyStep);

// Commit workflows
pdfWorkflow.commit();
processPdfWorkflow.commit();
queryPdfWorkflow.commit();
