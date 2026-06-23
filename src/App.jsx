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
  ShieldCheck
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
  // File states
  const [file, setFile] = useState(null);
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

  // Processing states
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressDetails, setProgressDetails] = useState('');
  const [translatedBlob, setTranslatedBlob] = useState(null);
  const [downloadName, setDownloadName] = useState('');

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

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.docx')) {
        setFile(droppedFile);
        setErrorMsg('');
      } else {
        setErrorMsg('Por favor, selecciona un documento de Word válido (.docx)');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.docx')) {
        setFile(selectedFile);
        setErrorMsg('');
      } else {
        setErrorMsg('Por favor, selecciona un documento de Word válido (.docx)');
      }
    }
  };

  const handleSwapLanguages = () => {
    if (srcLang === 'auto') return;
    const temp = srcLang;
    setSrcLang(tgtLang);
    setTgtLang(temp);
  };

  // Run translation
  const handleTranslate = async () => {
    if (!file) return;

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

    setStatus('preparing');
    setProgressPercent(0);
    setProgressDetails('Preparando archivo y analizando estructura XML...');
    setErrorMsg('');
    setModelFiles({});

    try {
      const resultBlob = await translateDocxFile({
        file,
        src: srcLang,
        tgt: tgtLang,
        provider,
        apiKey: apiKeys[provider],
        ollamaModel: selectedOllamaModel,
        onProgress: (current, total) => {
          setStatus('translating');
          const percent = Math.round((current / total) * 100);
          setProgressPercent(percent);
          setProgressDetails(`Traduciendo fragmentos de texto: ${current} de ${total} (${percent}%)`);
        },
        onModelProgress: (data) => {
          setStatus('model_loading');
          if (data.status === 'progress') {
            setModelFiles(prev => ({
              ...prev,
              [data.file]: {
                progress: data.progress,
                loaded: data.loaded,
                total: data.total
              }
            }));
          } else if (data.status === 'ready') {
            setProgressDetails('Modelo Web cargado. Iniciando traducción...');
          }
        }
      });

      setTranslatedBlob(resultBlob);
      const nameParts = file.name.split('.');
      const ext = nameParts.pop();
      const newName = `${nameParts.join('.')}_[${tgtLang.toUpperCase()}].${ext}`;
      setDownloadName(newName);
      setStatus('completed');

      // Add to history
      const newHistoryItem = {
        id: Date.now(),
        fileName: file.name,
        translatedName: newName,
        srcLang,
        tgtLang,
        provider: provider === 'ollama' ? `Ollama (${selectedOllamaModel})` : selectedProvider.name,
        date: new Date().toLocaleDateString()
      };
      const updatedHistory = [newHistoryItem, ...history.slice(0, 4)];
      setHistory(updatedHistory);
      localStorage.setItem('docx_translator_history', JSON.stringify(updatedHistory));

    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'Ocurrió un error inesperado durante la traducción.');
    }
  };

  const triggerDownload = () => {
    if (!translatedBlob) return;
    const url = URL.createObjectURL(translatedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFile(null);
    setStatus('idle');
    setTranslatedBlob(null);
    setErrorMsg('');
    setProgressPercent(0);
    setProgressDetails('');
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

            {/* Drag Zone */}
            <div className={`workspace-container ${isDragActive ? 'drag-active' : ''}`}>
              {status === 'idle' && (
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
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="docx-file-input-main" className="contents" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                    <div className="icon-wrapper-large">
                      <Upload size={28} />
                    </div>
                    {file ? (
                      <div style={{ textAlign: 'center' }}>
                        <span className="file-pill">
                          <FileText size={16} />
                          {file.name}
                        </span>
                        <div className="dropzone-subtitle" style={{ marginTop: '8px' }}>
                          {(file.size / (1024*1024)).toFixed(2)} MB
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span className="dropzone-title">Arrastra tu documento de Word aquí</span>
                        <span className="dropzone-subtitle">o haz clic para explorar tus archivos (formato .docx)</span>
                      </div>
                    )}
                  </label>
                </div>
              )}

              {/* Progress Stepper */}
              {(status === 'preparing' || status === 'model_loading' || status === 'translating') && (
                <div className="progress-section">
                  <div className="progress-icon animate-pulse">
                    <Cpu size={24} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div className="progress-title">
                      {status === 'model_loading' ? 'Inicializando Modelo...' : 'Traduciendo Documento'}
                    </div>
                    <div className="progress-desc" style={{ marginTop: '4px' }}>{progressDetails}</div>
                  </div>

                  <div className="progress-bar-wrapper">
                    <div className="progress-track">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${status === 'model_loading' ? modelStats.percent : progressPercent}%` }}
                      ></div>
                    </div>
                    <div className="progress-percentage">
                      {status === 'model_loading' ? `${modelStats.percent}%` : `${progressPercent}%`}
                    </div>
                  </div>

                  {status === 'model_loading' && (
                    <div className="info-box" style={{ width: '100%', fontSize: '0.7rem', padding: '10px' }}>
                      <strong style={{color: '#a78bfa'}}>{modelStats.text}</strong>
                      <p style={{marginTop: '4px', fontSize: '0.65rem', color: '#64748b'}}>
                        Esto solo ocurre la primera vez y almacena el modelo localmente en el navegador.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Completed Screen */}
              {status === 'completed' && (
                <div className="success-screen">
                  <div className="success-icon">
                    <CheckCircle2 size={32} />
                  </div>
                  <div>
                    <h3 className="success-title">¡Traducción completada!</h3>
                    <p className="success-subtitle" style={{ marginTop: '4px' }}>
                      Se ha generado la versión traducida del documento respetando el diseño original.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                      <span className="file-result-badge">{downloadName}</span>
                    </div>
                  </div>

                  <div className="btn-row">
                    <button onClick={triggerDownload} className="btn-download">
                      <Download size={14} />
                      Descargar archivo
                    </button>
                    <button onClick={handleReset} className="btn-reset">
                      Traducir otro
                    </button>
                  </div>
                </div>
              )}

              {/* Error Screen */}
              {status === 'error' && (
                <div className="success-screen" style={{ gap: '16px' }}>
                  <div className="success-icon" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>
                    <AlertCircle size={32} />
                  </div>
                  <div>
                    <h3 className="success-title" style={{ color: '#ef4444' }}>Ocurrió un error</h3>
                    <p className="success-subtitle" style={{ marginTop: '4px' }}>{errorMsg}</p>
                  </div>
                  <button onClick={handleReset} className="btn-reset">
                    Reintentar
                  </button>
                </div>
              )}
            </div>

            {/* Error config messages */}
            {errorMsg && status === 'idle' && (
              <div className="alert-box alert-danger">
                <AlertCircle size={14} style={{ marginTop: '2px' }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Translate Button */}
            {status === 'idle' && (
              <button
                onClick={handleTranslate}
                disabled={!file}
                className="btn-translate glow-primary"
              >
                <Cpu size={16} />
                Comenzar Traducción
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
