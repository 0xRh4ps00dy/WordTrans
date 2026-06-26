import JSZip from 'jszip';
import { translateTexts } from './translator';

/**
 * Extracts, translates, and rebuilds a .docx file.
 * All formatting is preserved since we modify the XML files inside the ZIP package directly.
 */
export async function translateDocxFile({
  file,
  src,
  tgt,
  provider,
  apiKey,
  ollamaModel,
  ollamaUrl,
  onProgress,
  onModelProgress
}) {
  try {
    // 1. Load the ZIP file
    const zip = await JSZip.loadAsync(file);

    // 2. Identify the XML files containing text (main document, headers, footers, footnotes, endnotes)
    const xmlFilePaths = [];
    zip.forEach((relativePath, fileObj) => {
      if (
        relativePath === 'word/document.xml' ||
        relativePath === 'word/footnotes.xml' ||
        relativePath === 'word/endnotes.xml' ||
        relativePath.startsWith('word/header') ||
        relativePath.startsWith('word/footer')
      ) {
        if (relativePath.endsWith('.xml')) {
          xmlFilePaths.push(relativePath);
        }
      }
    });

    if (xmlFilePaths.length === 0) {
      throw new Error('No se encontró el contenido del documento en el archivo subido.');
    }

    // 3. Parse XML files and collect all <w:t> elements and their text values
    const parser = new DOMParser();
    const parsedFiles = []; // Array of { path, doc, textElements: [] }
    let totalTextElements = 0;

    for (const filePath of xmlFilePaths) {
      const content = await zip.file(filePath).async('string');
      const xmlDoc = parser.parseFromString(content, 'application/xml');
      
      // Select all <w:t> (text) tags. In OOXML, they have a namespace, but simple getElementsByTagName works or we use localName.
      // We will look for elements whose localName is 't' and namespace URI is the WordprocessingML one.
      const elements = xmlDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't');
      const textElements = [];

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        textElements.push(el);
      }

      parsedFiles.push({
        path: filePath,
        doc: xmlDoc,
        textElements
      });

      totalTextElements += textElements.length;
    }

    if (totalTextElements === 0) {
      throw new Error('No se encontró ningún texto para traducir en el documento.');
    }

    // 4. Extract text strings for translation
    // We keep track of which element corresponds to which string index
    const stringsToTranslate = [];
    const mapping = []; // array of { fileIndex, elementIndex }

    parsedFiles.forEach((fileInfo, fileIdx) => {
      fileInfo.textElements.forEach((el, elIdx) => {
        stringsToTranslate.push(el.textContent || '');
        mapping.push({ fileIdx, elIdx });
      });
    });

    // 5. Run the translation service with progress reporting
    const translatedStrings = await translateTexts({
      texts: stringsToTranslate,
      src,
      tgt,
      provider,
      apiKey,
      ollamaModel,
      ollamaUrl,
      onProgress,
      onModelProgress
    });

    // 6. Write back translated strings to the XML DOMs
    mapping.forEach((map, index) => {
      const fileInfo = parsedFiles[map.fileIdx];
      const element = fileInfo.textElements[map.elIdx];
      let translatedText = translatedStrings[index];
      
      // Fallback to original text if translation is missing or not a string
      if (typeof translatedText !== 'string') {
        translatedText = stringsToTranslate[index] || '';
      }
      
      // Preserve spaces inside Word xml using xml:space="preserve" if necessary,
      // or we can keep the existing attribute if it was present
      if (translatedText.startsWith(' ') || translatedText.endsWith(' ')) {
        element.setAttribute('xml:space', 'preserve');
      }
      element.textContent = translatedText;
    });

    // 7. Serialize XML docs and write them back into JSZip
    const serializer = new XMLSerializer();
    parsedFiles.forEach((fileInfo) => {
      const xmlString = serializer.serializeToString(fileInfo.doc);
      // To ensure valid XML output, let's prepend the XML declaration if it was removed
      const finalXmlString = xmlString.startsWith('<?xml') 
        ? xmlString 
        : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xmlString;
      zip.file(fileInfo.path, finalXmlString);
    });

    // 8. Generate new Zip file as Blob
    const outputBlob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });

    return outputBlob;
  } catch (error) {
    console.error('Error al procesar el archivo .docx:', error);
    throw error;
  }
}
