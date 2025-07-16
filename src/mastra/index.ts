import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { pdfChatAgent } from './agents/pdf-chat-agent';
import path from 'path';
import fs from 'fs';
// Import our PDF initialization utility - importing at the top to avoid loading issues
import { initializePdf } from './tools/initialize-pdf';

// PDF path configuration - using absolute path to avoid resolution issues
const TARGET_PDF = 'D:/Mastra-Book/mastra-chatbook/src/mastra/data/pdf/Attention-is-all-you-need-Paper.pdf';

// Create Mastra instance
export const mastra = new Mastra({
  agents: { 
    pdfChatAgent
  },
  storage: new LibSQLStore({
    // For persistence, using file-based storage
    url: "file:../mastra.db",
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',  
  }),
});

// PDF initialization is imported at the top of the file

// Auto-process the PDF at startup
(async function initializeWithPDF() {
  try {
    console.log('Starting PDF initialization process...');
    const success = await initializePdf();
    
    if (success) {
      console.log('PDF initialization completed successfully.');
    } else {
      console.warn('PDF initialization completed with warnings or errors.');
    }
  } catch (error) {
    console.error('Error during PDF initialization:', error);
  }
})();
