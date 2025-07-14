/**
 * PDF Chat Example with Mastra
 * 
 * This example demonstrates how to:
 * 1. Process a PDF file
 * 2. Query its content using RAG
 */

import { mastra } from '../index';
import path from 'path';

// Path to the PDF file - replace with your actual PDF file
const PDF_PATH = path.resolve(process.cwd(), 'src/mastra/data/pdf/sample.pdf');

/**
 * Process a PDF document
 */
async function processPdf() {
  console.log(`Processing PDF: ${PDF_PATH}`);
  
  try {
    // Get the PDF Chat Agent
    const pdfChatAgent = mastra.getAgent('pdfChatAgent');
    
    if (!pdfChatAgent) {
      throw new Error('PDF Chat agent not found');
    }
    
    // Process the PDF by sending a message to the agent
    console.log('Sending PDF processing request to the agent...');
    
    const response = await pdfChatAgent.stream([
      {
        role: 'user',
        content: `Please process this PDF file: ${PDF_PATH}. Title: Sample Document. Author: Mastra Team. Description: A sample document to test the PDF chat functionality.`
      }
    ]);
    
    console.log('Agent response:');
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');
    
    return true;
  } catch (error) {
    console.error('Error processing PDF:', error);
    return false;
  }
}

/**
 * Query the PDF content
 */
async function queryPdf(query: string) {
  console.log(`Querying PDF content: "${query}"`);
  
  try {
    // Get the PDF Chat Agent
    const pdfChatAgent = mastra.getAgent('pdfChatAgent');
    
    if (!pdfChatAgent) {
      throw new Error('PDF Chat agent not found');
    }
    
    // Query the PDF by sending a message to the agent
    console.log('Sending query to the agent...');
    
    const response = await pdfChatAgent.stream([
      {
        role: 'user',
        content: query
      }
    ]);
    
    console.log('Agent response:');
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');
    
    return true;
  } catch (error) {
    console.error('Error querying PDF:', error);
    return false;
  }
}

/**
 * Main function to run the example
 */
async function main() {
  // First, process the PDF
  const pdfProcessed = await processPdf();
  
  if (!pdfProcessed) {
    console.error('Failed to process PDF, exiting');
    return;
  }
  
  // Wait a moment for processing to complete
  console.log('Waiting for PDF processing to complete...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Then, query the PDF content
  const sampleQueries = [
    'What is the main topic of the document?',
    'Can you summarize the key points of the document?',
    'What are the important concepts discussed in the document?'
  ];
  
  for (const query of sampleQueries) {
    await queryPdf(query);
    // Small delay between queries
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Run the example if this script is executed directly
if (require.main === module) {
  main().catch(console.error);
}
