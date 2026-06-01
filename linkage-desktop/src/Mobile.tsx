import { useState, useEffect, useRef } from 'react';
import io, { Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { Power, CornerDownLeft, Delete, Space, X, Upload, Download, File as FileIcon, Smartphone } from 'lucide-react';

// --- Helper Functions ---
const getDeviceId = () => {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = uuidv4();
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
};

const API_BASE_URL = `http://${window.location.hostname}:3000`;

// --- Main Component ---
function Mobile() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [status, setStatus] = useState('connecting');
  
  // State for PIN screen
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // State for main UI
  const [text, setText] = useState('');
  const [clipboard, setClipboard] = useState('');
  const [sharedFiles, setSharedFiles] = useState<string[]>([]);
  
  const textInputRef = useRef<HTMLInputElement>(null);

  // --- Socket & State Management ---
  useEffect(() => {
    const newSocket = io(API_BASE_URL);

    newSocket.on('connect', () => {
      setStatus('connected');
      newSocket.emit('authenticate', { device_id: getDeviceId() });
    });

    newSocket.on('authenticated', () => {
      setIsAuthenticated(true);
      setStatus('authenticated');
      fetchSharedFiles();
      textInputRef.current?.focus();
    });

    newSocket.on('require-pin', () => setStatus('require-pin'));
    
    newSocket.on('pin-error', () => {
      setPinError('Wrong PIN. Please try again.');
      setPin('');
    });
    
    newSocket.on('clipboard-updated', (newClipboardContent) => {
      setClipboard(newClipboardContent);
    });

    newSocket.on('disconnect', () => {
      setStatus('disconnected');
      setIsAuthenticated(false);
    });

    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, []);

  // --- API & Event Handlers ---
  const fetchSharedFiles = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/files`);
      const data = await response.json();
      setSharedFiles(data.files || []);
    } catch (error) {
      console.error("Failed to fetch shared files:", error);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket && pin.length === 4) {
      setPinError('');
      socket.emit('verify-pin', { device_id: getDeviceId(), pin });
    }
  };
  
  const handleTextInput = (newText: string) => {
    if (!socket) return;

    const oldText = text;
    
    if (newText.length > oldText.length) {
      const addedText = newText.substring(oldText.length);
      socket.emit('text-input', { text: addedText });
    } else if (newText.length < oldText.length) {
      const removedCount = oldText.length - newText.length;
      socket.emit('special-key', { key: 'BACKSPACE', count: removedCount });
    }
    
    setText(newText);
  };

  const clearText = () => {
    setText('');
  };

  const handleSpecialKey = (key: string) => {
    socket?.emit('special-key', { key, count: 1 });
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        await fetch(`${API_BASE_URL}/upload`, {
          method: 'POST',
          headers: { 'x-client-type': 'phone' },
          body: formData,
        });
        setTimeout(fetchSharedFiles, 500);
      } catch (error) {
        console.error("File upload failed:", error);
      }
    }
  };

  const handleClipboardSend = () => {
    socket?.emit('clipboard-update', { content: clipboard });
  };
  
  const handleClipboardGet = () => {
    socket?.emit('clipboard-get');
  };

  // --- Render Logic ---
  if (!isAuthenticated) {
    return <PinScreen pin={pin} setPin={setPin} error={pinError} status={status} onSubmit={handlePinSubmit} />;
  }

  return <MainControlPanel 
            text={text} 
            onTextChange={handleTextInput}
            clearText={clearText}
            clipboard={clipboard}
            setClipboard={setClipboard}
            sharedFiles={sharedFiles}
            status={status}
            textInputRef={textInputRef}
            handleSpecialKey={handleSpecialKey}
            handleFileChange={handleFileChange}
            handleClipboardSend={handleClipboardSend}
            handleClipboardGet={handleClipboardGet}
            fetchSharedFiles={fetchSharedFiles}
          />;
}

// --- Sub-components ---
const PinScreen = ({ pin, setPin, error, status, onSubmit }: any) => (
  <div className="h-screen bg-slate-100 text-slate-900 flex flex-col items-center justify-center p-4 font-sans">
    <div className="flex items-center gap-3 mb-8">
      <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white"><Smartphone className="w-6 h-6" /></div>
      <h1 className="text-xl font-bold tracking-tight">Linkage Mobile</h1>
    </div>
    <div className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-sm">
      <h2 className="text-lg font-bold text-center mb-2">Enter PIN</h2>
      <p className="text-slate-500 text-sm text-center mb-6">Find the PIN on your Linkage Desktop app.</p>
      <form onSubmit={onSubmit} className="flex flex-col items-center">
        <input
          type="tel"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="bg-slate-100 text-slate-900 text-center text-5xl font-mono tracking-[0.3em] w-full p-4 rounded-xl border-2 border-slate-200 focus:border-indigo-500 focus:outline-none"
          autoFocus
        />
        {error && <p className="text-red-500 mt-4 text-sm">{error}</p>}
        <button type="submit" disabled={pin.length !== 4} className="mt-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white font-bold py-3 px-8 rounded-xl transition-all w-full">Connect</button>
      </form>
    </div>
    <div className="absolute top-4 right-4 flex items-center gap-2 text-xs text-slate-500">
      <Power className={`w-4 h-4 ${status === 'connected' ? 'text-green-500' : 'text-red-500'}`} />
      <span>{status}</span>
    </div>
  </div>
);

const MainControlPanel = ({ text, onTextChange, clearText, clipboard, setClipboard, sharedFiles, status, textInputRef, handleSpecialKey, handleFileChange, handleClipboardSend, handleClipboardGet, fetchSharedFiles }: any) => (
<div className="min-h-screen bg-slate-100 text-slate-900 p-4 font-sans flex flex-col gap-4">
    <header className="flex items-center justify-between shrink-0">
    <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><Smartphone className="w-5 h-5" /></div>
        <h1 className="text-lg font-bold tracking-tight">Linkage</h1>
    </div>
    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />{status}
    </div>
    </header>

    <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200">
    <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">Remote Control</h2>
    <div className="relative flex items-center gap-2 mb-2">
        <input
        ref={textInputRef}
        type="text"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        className="w-full bg-slate-100 rounded-xl py-3 pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder="Type in real-time..."
        autoComplete="off" autoCorrect="off" autoCapitalize="off"
        />
        {text && <button onClick={clearText} className="absolute right-2 p-2 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>}
    </div>
    <div className="grid grid-cols-3 gap-2">
        <button onClick={() => handleSpecialKey('ENTER')} className="bg-slate-100 text-slate-700 rounded-xl py-3 flex items-center justify-center hover:bg-slate-200"><CornerDownLeft className="w-5 h-5 mr-1" /> Enter</button>
        <button onClick={() => handleSpecialKey('BACKSPACE')} className="bg-slate-100 text-slate-700 rounded-xl py-3 flex items-center justify-center hover:bg-slate-200"><Delete className="w-5 h-5 mr-1" /> Back</button>
        <button onClick={() => handleSpecialKey('SPACE')} className="bg-slate-100 text-slate-700 rounded-xl py-3 flex items-center justify-center hover:bg-slate-200"><Space className="w-5 h-5 mr-1" /> Space</button>
    </div>
    </div>

    <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200">
      <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 px-2">Shared Clipboard</h2>
      <textarea
        value={clipboard}
        onChange={(e) => setClipboard(e.target.value)}
        className="w-full bg-slate-100 rounded-xl p-3 h-24 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2"
        placeholder="Clipboard content appears here..."
      />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={handleClipboardGet} className="bg-slate-100 text-slate-700 rounded-xl py-3 flex items-center justify-center hover:bg-slate-200"><Download className="w-5 h-5 mr-1" /> Get from PC</button>
        <button onClick={handleClipboardSend} className="bg-slate-100 text-slate-700 rounded-xl py-3 flex items-center justify-center hover:bg-slate-200"><Upload className="w-5 h-5 mr-1" /> Send to PC</button>
      </div>
    </div>

    <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex-grow flex flex-col">
      <div className="flex justify-between items-center mb-3 px-2">
         <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Shared Files</h2>
         <button onClick={fetchSharedFiles} className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold">Refresh</button>
      </div>
      <div className="flex-grow overflow-y-auto bg-slate-500 rounded-xl p-2 min-h-[80px]">
        {sharedFiles.length > 0 ? (
          <ul className="space-y-1">{sharedFiles.map((file: string) => (<li key={file}><a href={`${API_BASE_URL}/download/${file}`} download className="flex items-center gap-3 p-2 text-slate-700 hover:bg-slate-200 rounded-lg"><FileIcon className="w-5 h-5 text-slate-500 shrink-0" /><span className="truncate text-sm">{file}</span></a></li>))}</ul>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">No shared files.</div>
        )}
      </div>
       <label className="mt-2 w-full bg-indigo-600 text-white rounded-xl py-3 flex items-center justify-center hover:bg-indigo-500 cursor-pointer transition-colors">
          <Upload className="w-5 h-5 mr-2" />
          <span>Send File to PC</span>
          <input type="file" onChange={handleFileChange} className="hidden" />
      </label>
    </div>
</div>
);

export default Mobile;
