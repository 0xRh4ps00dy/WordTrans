import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  Download, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  Languages, 
  RefreshCw, 
  Cpu, 
  Key, 
  FileDown, 
  Clock, 
  HelpCircle,
  Server,
  Zap,
  Globe,
  Database,
  ShieldCheck,
  Trash2,
  Play
} from 'lucide-react';
import { translateDocxFile } from './services/docxProcessor';
import { checkOllamaStatus, getOllamaModels } from './services/translator';

const LANGUAGES = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'Inglés' },
  { code: 'ca', name: 'Catalán' },
  { code: 'eu', name: 'Euskera' },
  { code: 'gl', name: 'Gallego' },
  { code: 'fr', name: 'Francés' },
  { code: 'de', name: 'Alemán' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Portugués' },
  { code: 'zh', name: 'Chino' },
  { code: 'ja', name: 'Japonés' },
  { code: 'ru', name: 'Ruso' },
  { code: 'ar', name: 'Árabe' }
];

const PROVIDERS = [
  { id: 'ollama', name: 'Ollama (GPU Local)', desc: 'Recomendado. Calidad superior usando tu GPU local. Sin coste ni claves.', local: true, needsOllama: true },
  { id: 'local', name: 'Web AI (M2M100 Local)', desc: '100% en navegador (CPU/WebAssembly). Sin configurar nada.', local: true },
  { id: 'google', name: 'Google Translate (Gratuito)', desc: 'Rápido, en la nube. Sin claves de API.', local: false },
  { id: 'gemini', name: 'Google Gemini Pro', desc: 'Traducción inteligente. Requiere API Key.', local: false, needsKey: true },
  { id: 'openai', name: 'OpenAI GPT-4o-mini', desc: 'Traducción inteligente. Requiere API Key.', local: false, needsKey: true },
  { id: 'deepl', name: 'DeepL Translate', desc: 'Traducción natural. Requiere API Key.', local: false, needsKey: true }
];

export default function App() {
  // Queue state: array of objects representing files to be translated
  // { id, file, status, progressPercent, progressDetails, errorMsg, translatedBlob, downloadName }
  const [queue, setQueue] = useState([]);
  const [isTranslatingAll, setIsTranslatingAll] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  
  // Translation config states
  const [srcLang, setSrcLang] = useState('es');
  const [tgtLang, setTgtLang] = useState('en');
  const [provider, setProvider] = useState('ollama');
  const [apiKeys, setApiKeys] = useState({
    gemini: '',
    openai: '',
    deepl: ''
  });
  
  // Ollama-specific states
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaStatus, setOllamaStatus] = useState('checking');
  const [ollamaModels, setOllamaModels] = useState([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState('');

  // Overall status of the batch process: 'idle', 'processing', 'completed'
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Local model download tracking (for transformers.js)
  const [modelFiles, setModelFiles] = useState({});

  // History state
  const [history, setHistory] = useState([]);

  // Load API keys, history, and check Ollama status
  useEffect(() => {
    const savedKeys = localStorage.getItem('docx_translator_keys');
    if (savedKeys) {
      try { setApiKeys(JSON.parse(savedKeys)); } catch (e) { console.error(e); }
    }

    const savedHistory = localStorage.getItem('docx_translator_history');
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error(e); }
    }

    checkOllamaConnection();
  }, []);

  // Check connection to Ollama when provider changes to Ollama, or ollamaUrl changes
  useEffect(() => {
    if (provider === 'ollama') {
      checkOllamaConnection();
    }
  }, [provider, ollamaUrl]);

  const checkOllamaConnection = async () => {
    setOllamaStatus('checking');
    const isRunning = await checkOllamaStatus(ollamaUrl);
    if (isRunning) {
      setOllamaStatus('connected');
      const models = await getOllamaModels(ollamaUrl);
      setOllamaModels(models);
      
      if (models.length > 0) {
        const defaultModel = models.find(m => 
          m.name.includes('qwen') || 
          m.name.includes('llama') || 
          m.name.includes('mistral') || 
          m.name.includes('gemma')
        );
        setSelectedOllamaModel(defaultModel ? defaultModel.name : models[0].name);
      } else {
        setSelectedOllamaModel('');
      }
    } else {
      setOllamaStatus('disconnected');
      setOllamaModels([]);
      setSelectedOllamaModel('');
    }
  };

  // Save API keys to localStorage
  const handleApiKeyChange = (providerName, val) => {
    const newKeys = { ...apiKeys, [providerName]: val };
    setApiKeys(newKeys);
    localStorage.setItem('docx_translator_keys', JSON.stringify(newKeys));
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const addFilesToQueue = (fileList) => {
    const newItems = [];
    const invalidFiles = [];
    
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (f.name.endsWith('.docx')) {
        newItems.push({
          id: Date.now() + i + Math.random(),
          file: f,
          status: 'pending',
          progressPercent: 0,
          progressDetails: 'En espera...',
          errorMsg: '',
          translatedBlob: null,
          downloadName: ''
        });
      } else {
        invalidFiles.push(f.name);
      }
    }

    if (newItems.length > 0) {
      setQueue(prev => [...prev, ...newItems]);
      setStatus('idle');
      setErrorMsg('');
    }

    if (invalidFiles.length > 0) {
      setErrorMsg(`Algunos archivos no son .docx válidos: ${invalidFiles.join(', ')}`);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
    }
  };

  const handleRemoveFromQueue = (id) => {
    if (isTranslatingAll) return;
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const handleClearQueue = () => {
    if (isTranslatingAll) return;
    setQueue([]);
    setStatus('idle');
    setErrorMsg('');
  };

  const handleSwapLanguages = () => {
    if (srcLang === 'auto') return;
    const temp = srcLang;
    setSrcLang(tgtLang);
    setTgtLang(temp);
  };

  // Run translation on all pending files in the queue sequentially
  const handleTranslate = async () => {
    const pendingItems = queue.filter(item => item.status === 'pending' || item.status === 'error');
    if (pendingItems.length === 0) return;

    const selectedProvider = PROVIDERS.find(p => p.id === provider);
    if (selectedProvider.needsKey && !apiKeys[provider]) {
      setErrorMsg(`Por favor, introduce tu clave de API para ${selectedProvider.name}`);
      return;
    }

    if (provider === 'ollama') {
      if (ollamaStatus !== 'connected') {
        setErrorMsg('No se puede iniciar la traducción. El servidor Ollama está desconectado.');
        return;
      }
      if (!selectedOllamaModel) {
        setErrorMsg('Por favor, selecciona un modelo de Ollama.');
        return;
      }
    }

    setIsTranslatingAll(true);
    setStatus('processing');
    setErrorMsg('');
    setModelFiles({});

    // Loop through each pending item
    for (const item of pendingItems) {
      // Update status to preparing
      setQueue(prev => prev.map(qItem => 
        qItem.id === item.id 
          ? { ...qItem, status: 'preparing', progressPercent: 0, progressDetails: 'Preparando archivo y analizando estructura XML...' }
          : qItem
      ));

      try {
        const resultBlob = await translateDocxFile({
          file: item.file,
          src: srcLang,
          tgt: tgtLang,
          provider,
          apiKey: apiKeys[provider],
          ollamaModel: selectedOllamaModel,
          ollamaUrl,
          onProgress: (current, total) => {
            const percent = Math.round((current / total) * 100);
            setQueue(prev => prev.map(qItem => 
              qItem.id === item.id 
                ? { ...qItem, status: 'translating', progressPercent: percent, progressDetails: `Traduciendo: ${current} de ${total} (${percent}%)` }
                : qItem
            ));
          },
          onModelProgress: (data) => {
            if (data.status === 'progress') {
              setModelFiles(prev => ({
                ...prev,
                [data.file]: {
                  progress: data.progress,
                  loaded: data.loaded,
                  total: data.total
                }
              }));
              setQueue(prev => prev.map(qItem => 
                qItem.id === item.id 
                  ? { ...qItem, status: 'model_loading', progressDetails: 'Descargando modelo local en navegador...' }
                  : qItem
              ));
            } else if (data.status === 'ready') {
              setQueue(prev => prev.map(qItem => 
                qItem.id === item.id 
                  ? { ...qItem, progressDetails: 'Modelo cargado. Traduciendo...' }
                  : qItem
              ));
            }
          }
        });

        const nameParts = item.file.name.split('.');
        const ext = nameParts.pop();
        const newName = `${nameParts.join('.')}_[${tgtLang.toUpperCase()}].${ext}`;

        // Update item state to completed
        setQueue(prev => prev.map(qItem => 
          qItem.id === item.id 
            ? { ...qItem, status: 'completed', progressPercent: 100, progressDetails: 'Completado', translatedBlob: resultBlob, downloadName: newName }
            : qItem
        ));

        // Add to history
        const newHistoryItem = {
          id: Date.now() + Math.random(),
          fileName: item.file.name,
          translatedName: newName,
          srcLang,
          tgtLang,
          provider: provider === 'ollama' ? `Ollama (${selectedOllamaModel})` : selectedProvider.name,
          date: new Date().toLocaleDateString()
        };
        setHistory(prev => {
          const updated = [newHistoryItem, ...prev.slice(0, 4)];
          localStorage.setItem('docx_translator_history', JSON.stringify(updated));
          return updated;
        });

      } catch (err) {
        console.error(err);
        setQueue(prev => prev.map(qItem => 
          qItem.id === item.id 
            ? { ...qItem, status: 'error', errorMsg: err.message || 'Error inesperado durante la traducción.', progressDetails: 'Error' }
            : qItem
        ));
      }
    }

    setIsTranslatingAll(false);
    setStatus('completed');
  };

  const triggerDownloadItem = (item) => {
    if (!item.translatedBlob) return;
    const url = URL.createObjectURL(item.translatedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerDownloadAll = () => {
    queue.forEach(item => {
      if (item.status === 'completed') {
        triggerDownloadItem(item);
      }
    });
  };

  const handleReset = () => {
    setQueue([]);
    setStatus('idle');
    setErrorMsg('');
    setModelFiles({});
  };

  const getModelDownloadStats = () => {
    const files = Object.values(modelFiles);
    if (files.length === 0) return { percent: 0, text: 'Iniciando descarga del modelo local...' };
    
    let totalLoaded = 0;
    let totalSize = 0;
    
    files.forEach(f => {
      totalLoaded += f.loaded || 0;
      totalSize += f.total || 0;
    });

    if (totalSize === 0) return { percent: 0, text: 'Cargando componentes del modelo...' };
    const percent = Math.round((totalLoaded / totalSize) * 100);
    const mbLoaded = (totalLoaded / (1024 * 1024)).toFixed(1);
    const mbTotal = (totalSize / (1024 * 1024)).toFixed(1);
    
    return {
      percent,
      text: `Descargando modelo de IA en caché: ${mbLoaded}MB de ${mbTotal}MB (${percent}%)`
    };
  };

  const modelStats = getModelDownloadStats();

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-icon">
              <Languages size={22} />
            </div>
            <div className="logo-text">
              <h1>
                WordTrans <span className="badge-v2">Local GPU</span>
              </h1>
              <p>Traductor Inteligente de Archivos Word (.docx)</p>
            </div>
          </div>

          <div className="status-badge">
            <Server size={14} className={ollamaStatus === 'connected' ? 'status-connected' : 'status-disconnected'} />
            <span>Ollama: </span>
            {ollamaStatus === 'connected' ? (
              <span className="status-connected">
                <span className="status-dot"></span> Conectado
              </span>
            ) : ollamaStatus === 'checking' ? (
              <span className="status-checking" style={{color: '#f59e0b'}}>Verificando...</span>
            ) : (
              <span className="status-disconnected">
                <span className="status-dot"></span> Desconectado
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main content grid */}
      <main className="app-main">
        {/* Sidebar */}
        <section className="sidebar">
          <div className="glass-panel">
            <h2 className="panel-title">
              <Settings size={16} />
              Configuración del Motor
            </h2>

            {/* Provider Selector */}
            <div className="form-group">
              <label className="form-label">Backend de Traducción</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {PROVIDERS.map((prov) => (
                  <button
                    key={prov.id}
                    onClick={() => {
                      setProvider(prov.id);
                      setErrorMsg('');
                    }}
                    className={`option-button ${provider === prov.id ? 'active' : ''}`}
                  >
                    <div className="option-header">
                      <span style={{ display: 'flex', itemsAlign: 'center', gap: '6px' }}>
                        {prov.id === 'ollama' && <Server size={14} style={{color: '#06b6d4'}} />}
                        {prov.id === 'local' && <Cpu size={14} style={{color: '#a78bfa'}} />}
                        {prov.id === 'google' && <Globe size={14} style={{color: '#fbbf24'}} />}
                        {prov.needsKey && <Key size={14} style={{color: '#ec4899'}} />}
                        {prov.name}
                      </span>
                      {provider === prov.id && <span className="option-indicator"></span>}
                    </div>
                    <span className="option-desc">{prov.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ollama options */}
            {provider === 'ollama' && (
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255,255,255,0.03)', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#e2e8f0' }}>Ajustes de Ollama</span>
                  <button 
                    onClick={checkOllamaConnection} 
                    className="swap-btn" 
                    style={{ padding: '4px 8px', fontSize: '0.65rem' }}
                    title="Recargar conexión"
                  >
                    <RefreshCw size={10} />
                  </button>
                </div>

                <div className="form-group">
                  <label className="form-label">URL del Servidor</label>
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    className="custom-input"
                    style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
                  />
                </div>

                {ollamaStatus === 'connected' ? (
                  <div className="form-group" style={{ marginTop: '8px' }}>
                    <label className="form-label">Modelo Local (Límite 7GB VRAM)</label>
                    {ollamaModels.length > 0 ? (
                      <select
                        value={selectedOllamaModel}
                        onChange={(e) => setSelectedOllamaModel(e.target.value)}
                        className="custom-select"
                      >
                        {ollamaModels.map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.name} ({(m.size / (1024*1024*1024)).toFixed(2)} GB)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="alert-box alert-danger" style={{ fontSize: '0.65rem', lineHeight: '1.4' }}>
                        Conectado a Ollama, pero no hay modelos disponibles. Abre una consola e instala qwen2.5 usando:
                        <code className="code-badge" style={{ display: 'block', marginTop: '4px' }}>ollama pull qwen2.5:7b</code>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="alert-box alert-danger" style={{ fontSize: '0.65rem', lineHeight: '1.4' }}>
                    Ollama no responde. Ejecuta Ollama de forma local o inicia el contenedor y asegúrate de levantar la API con OLLAMA_ORIGINS="*".
                  </div>
                )}
              </div>
            )}

            {/* Cloud APIs options */}
            {PROVIDERS.find(p => p.id === provider)?.needsKey && (
              <div className="glass-panel" style={{ padding: '16px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255,255,255,0.03)', marginTop: '8px' }}>
                <div className="form-group">
                  <label className="form-label">Clave de API (API Key)</label>
                  <input
                    type="password"
                    placeholder="Introduce la API Key..."
                    value={apiKeys[provider] || ''}
                    onChange={(e) => handleApiKeyChange(provider, e.target.value)}
                    className="custom-input"
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Guidelines */}
          <div className="info-box">
            <h4>
              <Zap size={14} />
              Recomendación VRAM (7GB Máx)
            </h4>
            <p>
              Si traduces localmente con GPU mediante Ollama, los modelos recomendados para excelente calidad y que consumen menos de 7GB de VRAM son:
            </p>
            <ul style={{ listStyleType: 'none', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <li>• <span className="code-badge">qwen2.5:7b</span> (~4.7GB) - Excelente en catalán.</li>
              <li>• <span className="code-badge">llama3:8b</span> (~4.7GB) - Excelente y rápido.</li>
              <li>• <span className="code-badge">gemma2:9b</span> (~5.5GB) - Calidad extrema.</li>
            </ul>
          </div>
        </section>

        {/* Workspace */}
        <section className="workspace-area">
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px', flexGrow: 1 }}>
            
            {/* Lang Row */}
            <div className="lang-selector-row">
              <div className="lang-box">
                <span className="lang-label">Origen</span>
                <select value={srcLang} onChange={(e) => setSrcLang(e.target.value)}>
                  <option value="auto">Detectar automáticamente</option>
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>

              <button 
                onClick={handleSwapLanguages} 
                disabled={srcLang === 'auto'}
                className="swap-btn"
                style={{ opacity: srcLang === 'auto' ? 0.4 : 1, cursor: srcLang === 'auto' ? 'not-allowed' : 'pointer' }}
              >
                <RefreshCw size={14} />
              </button>

              <div className="lang-box" style={{ textAlign: 'right' }}>
                <span className="lang-label">Destino</span>
                <select value={tgtLang} onChange={(e) => setTgtLang(e.target.value)}>
                  {LANGUAGES.filter(l => l.code !== 'auto').map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Drag Zone & Queue */}
            <div className={`workspace-container ${isDragActive ? 'drag-active' : ''}`} style={{ justifyContent: queue.length > 0 ? 'flex-start' : 'center', minHeight: queue.length > 0 ? 'auto' : '360px' }}>
              {queue.length === 0 ? (
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className="dropzone-label"
                >
                  <input
                    type="file"
                    id="docx-file-input-main"
                    accept=".docx"
                    multiple
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="docx-file-input-main" className="contents" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                    <div className="icon-wrapper-large">
                      <Upload size={28} />
                    </div>
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span className="dropzone-title">Arrastra tus documentos de Word aquí</span>
                      <span className="dropzone-subtitle">o haz clic para explorar tus archivos (puedes subir varios .docx)</span>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="queue-container">
                  <div className="queue-header">
                    <span className="queue-title">Cola de Documentos</span>
                    <span className="queue-count">{queue.length} {queue.length === 1 ? 'archivo' : 'archivos'}</span>
                  </div>

                  <div className="queue-list">
                    {queue.map((item) => {
                      const isActive = item.status === 'preparing' || item.status === 'model_loading' || item.status === 'translating';
                      return (
                        <div key={item.id} className={`queue-item ${isActive ? 'active' : ''}`}>
                          <div className="queue-item-main">
                            <div className="queue-item-details">
                              <span className="queue-item-name" title={item.file.name}>{item.file.name}</span>
                              <span className="queue-item-meta">
                                {(item.file.size / (1024*1024)).toFixed(2)} MB • {item.progressDetails}
                              </span>
                            </div>

                            <div className="queue-item-actions">
                              {item.status === 'pending' && (
                                <span className="queue-badge pending">Espera</span>
                              )}
                              {isActive && (
                                <span className="queue-badge translating animate-pulse">
                                  {item.status === 'model_loading' ? 'IA' : `${item.progressPercent}%`}
                                </span>
                              )}
                              {item.status === 'completed' && (
                                <>
                                  <span className="queue-badge completed">Listo</span>
                                  <button
                                    onClick={() => triggerDownloadItem(item)}
                                    className="queue-btn-action queue-btn-download"
                                    title="Descargar archivo traducido"
                                  >
                                    <Download size={14} />
                                  </button>
                                </>
                              )}
                              {item.status === 'error' && (
                                <>
                                  <span className="queue-badge error" title={item.errorMsg}>Error</span>
                                  <div className="alert-circle-btn" title={item.errorMsg} style={{ color: 'var(--error-color)', display: 'flex', alignItems: 'center' }}>
                                    <AlertCircle size={14} />
                                  </div>
                                </>
                              )}
                              
                              <button
                                onClick={() => handleRemoveFromQueue(item.id)}
                                disabled={isTranslatingAll}
                                className="queue-btn-action queue-btn-delete"
                                title="Eliminar de la cola"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {isActive && item.status !== 'model_loading' && (
                            <div className="queue-item-progress">
                              <div className="progress-track" style={{ height: '6px' }}>
                                <div 
                                  className="progress-fill" 
                                  style={{ width: `${item.progressPercent}%` }}
                                ></div>
                              </div>
                            </div>
                          )}

                          {item.status === 'model_loading' && (
                            <div className="queue-item-progress">
                              <div className="progress-track" style={{ height: '6px' }}>
                                <div 
                                  className="progress-fill" 
                                  style={{ width: `${modelStats.percent}%` }}
                                ></div>
                              </div>
                              <span className="queue-item-progress-text">{modelStats.text}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!isTranslatingAll && (
                    <div 
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className="queue-mini-dropzone"
                    >
                      <input
                        type="file"
                        id="docx-file-input-mini"
                        accept=".docx"
                        multiple
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="docx-file-input-mini" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <Upload size={14} style={{ color: 'var(--primary-color)' }} />
                        <span>Arrastra más archivos o haz clic aquí para añadir</span>
                      </label>
                    </div>
                  )}

                  <div className="queue-actions-footer">
                    {queue.some(q => q.status === 'completed') && (
                      <button
                        onClick={triggerDownloadAll}
                        className="btn-reset"
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Download size={14} />
                        <span>Descargar todos</span>
                      </button>
                    )}
                    <button
                      onClick={handleClearQueue}
                      disabled={isTranslatingAll}
                      className="btn-reset"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Trash2 size={14} />
                      <span>Limpiar cola</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Error config messages */}
            {errorMsg && (
              <div className="alert-box alert-danger">
                <AlertCircle size={14} style={{ marginTop: '2px' }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            {queue.length > 0 && (
              <button
                onClick={handleTranslate}
                disabled={isTranslatingAll || !queue.some(q => q.status === 'pending' || q.status === 'error')}
                className="btn-translate glow-primary"
              >
                {isTranslatingAll ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Traduciendo Cola...</span>
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    <span>Comenzar Traducción de la Cola</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="glass-panel">
              <h3 className="panel-title" style={{ fontSize: '0.75rem', marginBottom: '14px' }}>
                <Clock size={14} style={{color: '#a78bfa'}} />
                Traducciones Recientes
              </h3>
              <div className="history-list">
                {history.map((item) => (
                  <div key={item.id} className="history-item">
                    <div className="history-info">
                      <span className="history-name">{item.fileName}</span>
                      <span className="history-meta">
                        {item.date} • {item.provider} • {item.srcLang.toUpperCase()} → {item.tgtLang.toUpperCase()}
                      </span>
                    </div>
                    <span className="history-badge">
                      <ShieldCheck size={12} /> Listo
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <p>© 2026 WordTrans Local. Ejecución segura, local y privada.</p>
          <div className="footer-links">
            <span>Privacidad local</span>
            <span>Modelos de IA</span>
            <span> BSC Cataluña</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
