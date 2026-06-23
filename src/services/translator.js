/**
 * Translation Service for Docx Translator
 */
import { pipeline, env } from '@xenova/transformers';

// Configure transformers to not look for local model files
env.allowLocalModels = false;

// Helper to chunk an array into smaller arrays
export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Singleton instances for local pipelines
let localTranslatorInstance = null;
let currentModelName = '';

/**
 * Initialize and load local translation model (transformers.js browser)
 */
export async function loadLocalModel(modelName = 'Xenova/m2m100_418M', onProgress) {
  if (localTranslatorInstance && currentModelName === modelName) {
    return localTranslatorInstance;
  }

  localTranslatorInstance = await pipeline('translation', modelName, {
    progress_callback: (data) => {
      if (onProgress) {
        onProgress(data);
      }
    }
  });
  currentModelName = modelName;
  return localTranslatorInstance;
}

/**
 * Check if local Ollama server is running
 */
export async function checkOllamaStatus(url = 'http://localhost:11434') {
  try {
    const response = await fetch(`${url}/api/tags`);
    return response.ok;
  } catch (e) {
    return false;
  }
}

/**
 * Fetch available models from local Ollama
 */
export async function getOllamaModels(url = 'http://localhost:11434') {
  try {
    const response = await fetch(`${url}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.models || [];
  } catch (e) {
    console.error('Failed to fetch Ollama models:', e);
    return [];
  }
}

/**
 * Translate using Ollama API (batch mode)
 */
async function translateOllamaBatch(texts, src, tgt, modelName, url = 'http://localhost:11434') {
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

  // Split into chunks of 15 to preserve context window and make progress updates smooth
  const chunks = chunkArray(itemsToTranslate, 15);
  
  for (const chunk of chunks) {
    const chunkTexts = chunk.map(item => item.text);
    
    try {
      const response = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'system',
              content: `You are a professional translator. Translate the input JSON array of strings from "${src}" to "${tgt}".
Return ONLY a valid JSON object containing the translations as a JSON array of strings under the key "translations".
Do not write explanations, greetings, or markdown code block formatting. Only output the raw JSON object.

Example output:
{
  "translations": ["translated text 1", "translated text 2"]
}`
            },
            {
              role: 'user',
              content: JSON.stringify(chunkTexts)
            }
          ],
          format: 'json',
          stream: false,
          options: {
            temperature: 0.1 // Keep translations consistent
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errText}`);
      }

      const resData = await response.json();
      const content = resData.message?.content;
      if (!content) throw new Error('Empty response from Ollama model');

      const parsed = JSON.parse(content);
      const translatedChunk = parsed.translations;

      if (!Array.isArray(translatedChunk)) {
        throw new Error('Ollama model did not return a valid "translations" array');
      }

      chunk.forEach((item, idx) => {
        resultTemplate[item.index] = translatedChunk[idx] || item.text;
      });
    } catch (error) {
      console.error('Ollama chunk translation failed:', error);
      throw error;
    }
  }

  return resultTemplate;
}

/**
 * Free Google Translate API
 */
async function translateGoogleFree(text, src, tgt) {
  if (!text || !text.trim()) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${tgt}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google Translate error: ${response.statusText}`);
    const data = await response.json();
    if (data && data[0]) {
      return data[0].map(item => item[0]).join('');
    }
    return text;
  } catch (error) {
    console.error('Google Translate Free Error:', error);
    throw error;
  }
}

/**
 * Translate using Gemini API (batch mode)
 */
async function translateGeminiBatch(texts, src, tgt, apiKey) {
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

  const chunks = chunkArray(itemsToTranslate, 30);
  
  for (const chunk of chunks) {
    const chunkTexts = chunk.map(item => item.text);
    const prompt = `Translate the following JSON array of strings from language code "${src}" to language code "${tgt}".
Return ONLY a valid JSON array containing the translated strings in the exact same order.
Do not wrap your response in markdown code blocks like \`\`\`json. Return only raw JSON.

JSON array to translate:
${JSON.stringify(chunkTexts)}`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errText}`);
      }

      const resData = await response.json();
      const textResponse = resData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error('Empty response from Gemini API');

      let translatedChunk;
      try {
        translatedChunk = JSON.parse(textResponse.trim());
      } catch (parseErr) {
        const cleanText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        translatedChunk = JSON.parse(cleanText);
      }

      if (!Array.isArray(translatedChunk)) {
        throw new Error('Gemini did not return an array as requested');
      }

      chunk.forEach((item, idx) => {
        resultTemplate[item.index] = translatedChunk[idx] || item.text;
      });
    } catch (error) {
      console.error('Gemini chunk translation failed:', error);
      throw error;
    }
  }

  return resultTemplate;
}

/**
 * Translate using OpenAI API (batch mode)
 */
async function translateOpenAIBatch(texts, src, tgt, apiKey, model = 'gpt-4o-mini') {
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

  const chunks = chunkArray(itemsToTranslate, 30);
  
  for (const chunk of chunks) {
    const chunkTexts = chunk.map(item => item.text);
    const messages = [
      {
        role: 'system',
        content: `You are a professional translator. Translate the input JSON array of strings from "${src}" to "${tgt}". Return ONLY a JSON array of strings in the exact same order. Do not write explanations.`
      },
      {
        role: 'user',
        content: JSON.stringify(chunkTexts)
      }
    ];

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
      }

      const resData = await response.json();
      const content = resData.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty response from OpenAI API');

      const parsed = JSON.parse(content);
      const translatedChunk = Array.isArray(parsed) ? parsed : Object.values(parsed)[0];

      if (!Array.isArray(translatedChunk)) {
        throw new Error('OpenAI did not return an array');
      }

      chunk.forEach((item, idx) => {
        resultTemplate[item.index] = translatedChunk[idx] || item.text;
      });
    } catch (error) {
      console.error('OpenAI chunk translation failed:', error);
      throw error;
    }
  }

  return resultTemplate;
}

/**
 * Translate using DeepL API
 */
async function translateDeepL(texts, src, tgt, apiKey) {
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

  const isFreeKey = apiKey.endsWith(':fx');
  const baseUrl = isFreeKey 
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const chunks = chunkArray(itemsToTranslate, 50);

  for (const chunk of chunks) {
    const params = new URLSearchParams();
    params.append('target_lang', tgt.toUpperCase());
    if (src && src !== 'auto') {
      params.append('source_lang', src.toUpperCase());
    }
    chunk.forEach(item => {
      params.append('text', item.text);
    });

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepL API error: ${response.status} - ${errText}`);
      }

      const resData = await response.json();
      if (!resData.translations) throw new Error('Invalid response from DeepL');

      chunk.forEach((item, idx) => {
        resultTemplate[item.index] = resData.translations[idx]?.text || item.text;
      });
    } catch (error) {
      console.error('DeepL translation failed:', error);
      throw error;
    }
  }

  return resultTemplate;
}

/**
 * Main Translate Router
 */
export async function translateTexts({
  texts,
  src,
  tgt,
  provider,
  apiKey,
  ollamaModel, // Model name selected for Ollama (e.g. qwen2.5:7b)
  onProgress,
  onModelProgress
}) {
  if (!texts || texts.length === 0) return [];

  // Ollama translation
  if (provider === 'ollama') {
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

    const chunks = chunkArray(itemsToTranslate, 10); // small chunks for responsive progress updates
    let doneCount = texts.length - itemsToTranslate.length;
    if (onProgress) onProgress(doneCount, texts.length);

    for (const chunk of chunks) {
      const chunkTexts = chunk.map(i => i.text);
      const translated = await translateOllamaBatch(chunkTexts, src, tgt, ollamaModel || 'qwen2.5:7b');
      chunk.forEach((item, idx) => {
        resultTemplate[item.index] = translated[idx];
      });
      doneCount += chunk.length;
      if (onProgress) onProgress(doneCount, texts.length);
    }
    return resultTemplate;
  }

  // Local model execution (browser WASM)
  if (provider === 'local') {
    const translator = await loadLocalModel('Xenova/m2m100_418M', onModelProgress);

    const result = [];
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text || !text.trim()) {
        result.push(text);
      } else {
        try {
          const res = await translator(text, {
            src_lang: src === 'auto' ? 'en' : src,
            tgt_lang: tgt
          });
          result.push(res[0].translation_text);
        } catch (err) {
          console.error('Error in local translation for item:', text, err);
          result.push(text);
        }
      }

      if (onProgress) {
        onProgress(i + 1, texts.length);
      }
    }
    return result;
  }

  // Google Free
  if (provider === 'google') {
    const result = [];
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text || !text.trim()) {
        result.push(text);
      } else {
        try {
          const trans = await translateGoogleFree(text, src, tgt);
          result.push(trans);
        } catch (e) {
          result.push(text);
        }
      }
      if (onProgress) {
        onProgress(i + 1, texts.length);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return result;
  }

  // Gemini
  if (provider === 'gemini') {
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

    const chunks = chunkArray(itemsToTranslate, 20);
    let doneCount = texts.length - itemsToTranslate.length;
    if (onProgress) onProgress(doneCount, texts.length);

    for (const chunk of chunks) {
      const chunkTexts = chunk.map(i => i.text);
      const translated = await translateGeminiBatch(chunkTexts, src, tgt, apiKey);
      chunk.forEach((item, idx) => {
        resultTemplate[item.index] = translated[idx];
      });
      doneCount += chunk.length;
      if (onProgress) onProgress(doneCount, texts.length);
    }
    return resultTemplate;
  }

  // OpenAI
  if (provider === 'openai') {
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

    const chunks = chunkArray(itemsToTranslate, 20);
    let doneCount = texts.length - itemsToTranslate.length;
    if (onProgress) onProgress(doneCount, texts.length);

    for (const chunk of chunks) {
      const chunkTexts = chunk.map(i => i.text);
      const translated = await translateOpenAIBatch(chunkTexts, src, tgt, apiKey);
      chunk.forEach((item, idx) => {
        resultTemplate[item.index] = translated[idx];
      });
      doneCount += chunk.length;
      if (onProgress) onProgress(doneCount, texts.length);
    }
    return resultTemplate;
  }

  // DeepL
  if (provider === 'deepl') {
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

    const chunks = chunkArray(itemsToTranslate, 30);
    let doneCount = texts.length - itemsToTranslate.length;
    if (onProgress) onProgress(doneCount, texts.length);

    for (const chunk of chunks) {
      const translated = await translateDeepL(chunk.map(i => i.text), src, tgt, apiKey);
      chunk.forEach((item, idx) => {
        resultTemplate[item.index] = translated[idx];
      });
      doneCount += chunk.length;
      if (onProgress) onProgress(doneCount, texts.length);
    }
    return resultTemplate;
  }

  throw new Error(`Unknown translation provider: ${provider}`);
}
