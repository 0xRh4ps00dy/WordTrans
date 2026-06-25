/**
 * Standalone CLI tool to translate .docx files in batch using Ollama.
 * Usage: node translate-cli.js --src <src_lang> --tgt <tgt_lang> [--model <model_name>] [--url <ollama_url>] [--input <input_dir>] [--output <output_dir>]
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// Parse command line arguments
const args = {};
process.argv.slice(2).forEach((val, index, array) => {
  if (val.startsWith('--')) {
    const key = val.slice(2);
    const nextVal = array[index + 1];
    if (nextVal && !nextVal.startsWith('--')) {
      args[key] = nextVal;
    } else {
      args[key] = true;
    }
  }
});

// Default configurations
const srcLang = args.src || 'es';
const tgtLang = args.tgt || 'en';
const modelName = args.model || 'qwen2.5:14b';
const ollamaUrl = args.url || 'http://192.168.50.216:11434';
const inputDir = args.input || './input';
const outputDir = args.output || './output';

console.log('=== TRADUCTOR DE DOCX POR LÍNEA DE COMANDOS ===');
console.log(`Idioma Origen:      ${srcLang}`);
console.log(`Idioma Destino:     ${tgtLang}`);
console.log(`Modelo Ollama:      ${modelName}`);
console.log(`Servidor Ollama:    ${ollamaUrl}`);
console.log(`Carpeta Entrada:    ${inputDir}`);
console.log(`Carpeta Salida:     ${outputDir}`);
console.log('================================================\n');

// Helper to chunk array
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Clean LLM JSON output
function cleanAndParseJSON(str) {
  let clean = str.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
  }
  try {
    return JSON.parse(clean);
  } catch (e) {
    // If simple parse fails, try basic regex cleanup or repair
    const matches = [];
    const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let match;
    while ((match = regex.exec(clean)) !== null) {
      matches.push(match[1]);
    }
    // Assume if we got matches and first is "translations", we skip it
    if (matches.length > 0 && matches[0] === 'translations') {
      return { translations: matches.slice(1) };
    }
    return matches;
  }
}

// Translate batch via Ollama
async function translateOllamaBatch(texts, src, tgt, model, url) {
  const itemsToTranslate = [];
  const resultTemplate = new Array(texts.length);

  texts.forEach((text, index) => {
    if (!text || !text.trim()) {
      resultTemplate[index] = text;
    } else {
      itemsToTranslate.push({ text, index });
    }
  });

  if (itemsToTranslate.length === 0) return resultTemplate;

  const chunks = chunkArray(itemsToTranslate, 15);
  
  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];
    const chunkTexts = chunk.map(item => item.text);
    
    // System prompt tailored for CFGS technical students
    const systemPrompt = `You are a professional translator specialized in technical education and higher vocational training (Ciclo Formativo de Grado Superior).
Translate the input JSON array of strings from "${src}" to "${tgt}".

Strict Rules:
1. TONE: Use a clear, direct, pedagogical and professional tone in Spanish. Address the student naturally (e.g., using "crea", "analiza" or neutral infinitive).
2. TECHNICAL JARGON: Keep industry-standard technical terms in English when appropriate, or add the translation alongside (e.g. "despliegue (deployment)", "enrutador (router)"). Do not translate terms that are universally used in English in the professional field.
3. FORMAT: Return ONLY a valid JSON object containing the translations as a JSON array of strings under the key "translations". Do not write explanations, greetings, or markdown formatting.

Example output:
{
  "translations": ["translated text 1", "translated text 2"]
}`;

    try {
      const response = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(chunkTexts) }
          ],
          format: 'json',
          stream: false,
          options: { temperature: 0.1 }
        })
      });

      if (!response.ok) {
        throw new Error(`Error API Ollama: ${response.status} - ${await response.text()}`);
      }

      const resData = await response.json();
      const content = resData.message?.content;
      if (!content) throw new Error('Respuesta vacía del modelo Ollama');

      const parsed = cleanAndParseJSON(content);
      const translatedChunk = Array.isArray(parsed) ? parsed : (parsed.translations || Object.values(parsed)[0]);

      if (!Array.isArray(translatedChunk)) {
        throw new Error('El modelo de Ollama no devolvió un array de traducciones válido');
      }

      chunk.forEach((item, idx) => {
        resultTemplate[item.index] = translatedChunk[idx] || item.text;
      });
    } catch (error) {
      console.error(`  -> Error traduciendo lote ${cIdx + 1}/${chunks.length}:`, error.message);
      // Fallback: keep original text for this chunk if it failed
      chunk.forEach(item => {
        resultTemplate[item.index] = item.text;
      });
    }
  }

  return resultTemplate;
}

// Process single document
async function translateDocx(filePath, outputFilePath) {
  console.log(`[PROCESANDO] Leyendo: ${path.basename(filePath)}`);
  
  const fileBuffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(fileBuffer);
  
  const xmlFilePaths = [];
  zip.forEach((relativePath) => {
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
    throw new Error('No se encontró contenido XML de texto en el documento.');
  }

  const parser = new DOMParser();
  const parsedFiles = [];
  let totalTextElements = 0;

  for (const xmlPath of xmlFilePaths) {
    const content = await zip.file(xmlPath).async('string');
    const xmlDoc = parser.parseFromString(content, 'application/xml');
    const elements = xmlDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't');
    const textElements = [];

    for (let i = 0; i < elements.length; i++) {
      textElements.push(elements[i]);
    }

    parsedFiles.push({ path: xmlPath, doc: xmlDoc, textElements });
    totalTextElements += textElements.length;
  }

  if (totalTextElements === 0) {
    console.log(`  -> [AVISO] No hay textos transcribibles en: ${path.basename(filePath)}`);
    await fs.copyFile(filePath, outputFilePath);
    return;
  }

  console.log(`  -> Encontradas ${totalTextElements} cadenas de texto para traducir.`);

  const stringsToTranslate = [];
  const mapping = [];

  parsedFiles.forEach((fileInfo, fileIdx) => {
    fileInfo.textElements.forEach((el, elIdx) => {
      stringsToTranslate.push(el.textContent || '');
      mapping.push({ fileIdx, elIdx });
    });
  });

  // Call Ollama Batch Translation
  console.log('  -> Iniciando traducción con Ollama...');
  const translatedStrings = await translateOllamaBatch(
    stringsToTranslate,
    srcLang,
    tgtLang,
    modelName,
    ollamaUrl
  );

  // Write back
  mapping.forEach((map, index) => {
    const fileInfo = parsedFiles[map.fileIdx];
    const element = fileInfo.textElements[map.elIdx];
    const translatedText = translatedStrings[index];
    
    if (translatedText.startsWith(' ') || translatedText.endsWith(' ')) {
      element.setAttribute('xml:space', 'preserve');
    }
    element.textContent = translatedText;
  });

  // Rebuild ZIP
  const serializer = new XMLSerializer();
  parsedFiles.forEach((fileInfo) => {
    const xmlString = serializer.serializeToString(fileInfo.doc);
    const finalXmlString = xmlString.startsWith('<?xml') 
      ? xmlString 
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xmlString;
    zip.file(fileInfo.path, finalXmlString);
  });

  const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(outputFilePath, outputBuffer);
  console.log(`[COMPLETADO] Guardado en: ${path.basename(outputFilePath)}\n`);
}

// Main execution flow
async function main() {
  try {
    // Ensure folders exist
    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    const files = await fs.readdir(inputDir);
    const docxFiles = files.filter(f => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'));

    if (docxFiles.length === 0) {
      console.log(`\n[AVISO] No se encontraron archivos .docx en la carpeta "${inputDir}".`);
      console.log(`Por favor, coloca tus documentos en "${path.resolve(inputDir)}" y vuelve a ejecutar.`);
      return;
    }

    console.log(`Se han detectado ${docxFiles.length} archivos para traducir.\n`);

    for (let i = 0; i < docxFiles.length; i++) {
      const file = docxFiles[i];
      const start = Date.now();
      console.log(`--- [${i + 1}/${docxFiles.length}] ---`);
      
      const inputPath = path.join(inputDir, file);
      const fileExt = path.extname(file);
      const baseName = path.basename(file, fileExt);
      const outputPath = path.join(outputDir, `${baseName}_[${tgtLang.toUpperCase()}]${fileExt}`);
      
      try {
        await translateDocx(inputPath, outputPath);
        const duration = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`Fichero completado con éxito en ${duration}s.\n`);
      } catch (err) {
        console.error(`[ERROR] Falló la traducción de ${file}:`, err);
      }
    }

    console.log('=== PROCESO TERMINADO ===');
    console.log(`Todos los archivos procesados. Revisa el directorio "${outputDir}".`);

  } catch (error) {
    console.error('Error crítico en el script CLI:', error);
  }
}

main();
