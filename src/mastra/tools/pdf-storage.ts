import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module compatible path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File to store PDF processing state
const STATE_FILE = path.join(__dirname, '..', 'data', 'pdf-state.json');

// Initialize the state with default values
const defaultState = {
  lastProcessedPdfPath: null,
  processingTimestamp: null,
  metadata: {}
};

/**
 * Gets current PDF processing state
 * @returns The current state object
 */
export function getPdfState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading PDF state file:', error);
  }
  
  return defaultState;
}

/**
 * Saves PDF processing state
 * @param state The state object to save
 */
export function savePdfState(state: any) {
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error writing PDF state file:', error);
  }
}

/**
 * Gets the last processed PDF path
 * @returns The path to the last processed PDF or null
 */
export function getLastProcessedPdfPath() {
  const state = getPdfState();
  return state.lastProcessedPdfPath;
}

/**
 * Sets the last processed PDF path
 * @param pdfPath The path to the last processed PDF
 */
export function setLastProcessedPdfPath(pdfPath: string) {
  const state = getPdfState();
  state.lastProcessedPdfPath = pdfPath;
  state.processingTimestamp = new Date().toISOString();
  savePdfState(state);
  console.log(`PDF state updated: ${pdfPath}`);
}
