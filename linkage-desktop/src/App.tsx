import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Smartphone, Settings, Clipboard, Download, Upload, File as FileIcon, ExternalLink, Shield, Trash2, RefreshCw, Info, Monitor, HardDrive, ArrowUpCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

function App() {
  const [serverInfo, setServerInfo] = useState<{ ip: string, port: number } | null>(null);
  const [pin, setPin] = useState<string>('----');
  const [isConnected, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'setup' | 'settings'>('dashboard');
  const [clipboard, setClipboard] = useState('');
  const [receivedFiles, setReceivedFiles] = useState<string[]>([]);
  
  // Settings state
  const [newPin, setNewPin] = useState('');
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [autostart, setAutostart] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const info = await invoke<{ ip: string, port: number }>('get_server_info');
        setServerInfo(info);
        const p = await invoke<string>('get_pin');
        setPin(p);
        
        const settings = await invoke<any>('get_settings');
        setMinimizeToTray(settings.minimize_to_tray);
        
        const auto = await isEnabled();
        setAutostart(auto);

        let permission = await isPermissionGranted();
        if (!permission) {
          permission = await requestPermission() === 'granted';
        }
      } catch (e) { console.error(e); }
    };
    init();

    const unlistenConnected = listen('device-connected', () => {
      setIsAuthenticated(true);
      setActiveTab('dashboard');
      sendNotification({ title: 'Linkage', body: 'Phone connected successfully!' });
    });

    const unlistenClipboard = listen('clipboard-updated-on-pc', (event: any) => {
      setClipboard(event.payload);
      sendNotification({ title: 'Linkage: Clipboard', body: 'New clipboard content received!' });
    });

    const unlistenFile = listen('file-received', (event: any) => {
      const filename = event.payload;
      setReceivedFiles(prev => [filename, ...prev]);
      sendNotification({ 
        title: 'Linkage: File Received', 
        body: `New file: ${filename}. Click to open downloads.`,
      });
    });

    return () => {
      unlistenConnected.then(f => f());
      unlistenClipboard.then(f => f());
      unlistenFile.then(f => f());
    };
  }, []);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    try {
      const update = await check();
      if (update) {
        if (confirm(`New version ${update.version} is available! Download and install now?`)) {
          await update.downloadAndInstall();
          await relaunch();
        }
      } else {
        alert('You are using the latest version.');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to check for updates. Make sure you have an active internet connection.');
    }
    setIsCheckingUpdates(false);
  };

  const handleUpdatePin = async () => {
    if (newPin.length !== 4) return;
    setIsUpdatingPin(true);
    try {
      await invoke('update_pin', { newPin });
      setPin(newPin);
      setNewPin('');
      sendNotification({ title: 'Settings', body: 'PIN updated successfully!' });
    } catch (e) { console.error(e); }
    setIsUpdatingPin(false);
  };

  const handleToggleMinimize = async (val: boolean) => {
    setMinimizeToTray(val);
    await invoke('update_settings', { minimize: val });
  };

  const handleToggleAutostart = async (val: boolean) => {
    setAutostart(val);
    if (val) await enable();
    else await disable();
  };

  const handleClearDevices = async () => {
    if (!confirm('Are you sure you want to disconnect all devices? They will need to re-pair with the PIN.')) return;
    try {
      await invoke('clear_trusted_devices');
      setIsAuthenticated(false);
      setActiveTab('setup');
      sendNotification({ title: 'Settings', body: 'All trusted devices cleared.' });
    } catch (e) { console.error(e); }
  };

  const handleFileDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('file', file);
      try {
        await fetch(`http://localhost:3000/upload`, { method: 'POST', body: formData });
        sendNotification({ title: 'Linkage', body: 'File shared to mobile!' });
      } catch (e) { console.error(e); }
    }
  };

  const phoneUrl = serverInfo ? `http://${serverInfo.ip}:${serverInfo.port}/mobile` : '';

  if (!isConnected && activeTab === 'dashboard') {
      setActiveTab('setup');
  }

  return (
    <div className="h-screen w-screen bg-[#F8FAFC] text-slate-900 font-sans p-4 overflow-hidden flex flex-col">
      <header className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Linkage</h1>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
              <span className={`w-1.5 h-1.5 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'} rounded-full`} />
              {isConnected ? 'Connected' : 'Waiting...'}
            </div>
          </div>
        </div>
        <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-100 shadow-sm">
           {isConnected && <button onClick={() => setActiveTab('dashboard')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>Dashboard</button>}
           <button onClick={() => setActiveTab('setup')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'setup' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>Connection</button>
           <button onClick={() => setActiveTab('settings')} className={`p-1.5 rounded-md transition-colors ${activeTab === 'settings' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}><Settings className="w-4 h-4" /></button>
        </div>
      </header>

      <main className="flex-grow min-h-0 overflow-hidden">
        {activeTab === 'setup' && (
          <div className="h-full flex flex-col gap-4">
            <div className="flex-grow grid grid-cols-2 gap-4">
              {/* QR Section */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center text-center">
                <div className="w-full max-w-[180px] bg-slate-50 p-4 rounded-3xl border border-slate-100 shadow-inner mb-4">
                  {phoneUrl ? (
                    <div className="bg-white p-2 rounded-xl shadow-sm">
                      <QRCodeSVG value={phoneUrl} size={140} />
                    </div>
                  ) : (
                    <div className="w-[140px] h-[140px] flex items-center justify-center text-slate-300 italic text-[10px]">Generating...</div>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">Scan QR Code</h3>
                <p className="text-[10px] text-slate-400">Point your phone camera here</p>
              </div>

              {/* PIN & Info Section */}
              <div className="flex flex-col gap-4">
                <div className="flex-grow bg-indigo-600 rounded-2xl shadow-lg p-6 flex flex-col items-center justify-center text-center text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12" />
                  
                  <Shield className="w-8 h-8 mb-4 text-indigo-200" />
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-2">Pairing PIN</span>
                  <div className="text-5xl font-black tracking-[0.2em] mb-4">{pin}</div>
                  <p className="text-[11px] text-indigo-100/80 max-w-[160px]">Enter this code on your mobile device to pair.</p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
                   <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
                      <Monitor className="w-5 h-5" />
                   </div>
                   <div className="min-w-0">
                      <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Connection URL</label>
                      <div className="text-[11px] font-mono text-slate-600 truncate select-all">{phoneUrl}</div>
                   </div>
                </div>
              </div>
            </div>

            {/* Bottom Help/Status Bar */}
            <div className="bg-slate-900 rounded-2xl p-3 flex items-center justify-between px-6 shadow-md shrink-0">
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">Server Active</span>
                 </div>
                 <div className="h-4 w-px bg-slate-700" />
                 <div className="text-[10px] text-slate-400">
                    Network: <span className="text-slate-200 font-medium">{serverInfo?.ip || '0.0.0.0'}</span>
                 </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-indigo-300 font-bold">
                 <Info className="w-3.5 h-3.5" />
                 <span>Ensure devices are on the same Wi-Fi</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && isConnected && (
          <div className="grid grid-cols-5 gap-4 h-full">
             <div className="col-span-3 flex flex-col gap-4 min-h-0">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col shrink-0">
                  <h2 className="text-[10px] font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><Clipboard className="w-3.5 h-3.5" /> Clipboard</h2>
                  <div className="flex gap-3">
                    <div className="flex-grow p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 h-16 overflow-y-auto italic scrollbar-hide">{clipboard || 'Empty...'}</div>
                    <button onClick={() => { navigator.clipboard.writeText(clipboard); sendNotification({ title: 'Linkage', body: 'Copied to Windows!' }); }} className="bg-indigo-50 text-indigo-600 p-3 rounded-xl hover:bg-indigo-100 transition-colors"><Download className="w-5 h-5" /></button>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex-grow min-h-0 flex flex-col">
                  <h2 className="text-[10px] font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><FileIcon className="w-3.5 h-3.5" /> Received Files</h2>
                  <div className="flex-grow overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                    {receivedFiles.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-400 text-[11px] italic">No files yet...</div>
                    ) : (
                      receivedFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-indigo-200 transition-all">
                          <div className="flex items-center gap-2 overflow-hidden">
                             <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-slate-400 group-hover:text-indigo-500 shrink-0"><FileIcon className="w-3.5 h-3.5" /></div>
                             <span className="text-[11px] font-medium text-slate-700 truncate">{file}</span>
                          </div>
                          <button onClick={() => invoke('open_folder', { path: 'downloads' })} className="p-1.5 text-slate-400 hover:text-indigo-600 shrink-0"><ExternalLink className="w-3.5 h-3.5" /></button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
             </div>

             <div className="col-span-2 flex flex-col gap-4">
                <div className="bg-indigo-600 rounded-2xl p-5 text-white shadow-lg flex flex-col gap-3 shrink-0">
                  <h2 className="font-bold text-sm">Quick Share</h2>
                  <label className="w-full bg-white/10 hover:bg-white/20 border-2 border-dashed border-white/20 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
                    <Upload className="w-6 h-6 text-white" />
                    <span className="text-[10px] font-bold">Drop Files</span>
                    <input type="file" onChange={handleFileDrop} className="hidden" />
                  </label>
                </div>

                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex-grow overflow-hidden flex flex-col">
                  <h2 className="text-[10px] font-bold text-slate-400 uppercase mb-3">Status</h2>
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 shrink-0"><Smartphone className="w-4 h-4" /></div>
                    <div className="overflow-hidden">
                      <div className="text-[11px] font-bold text-slate-800 truncate">Phone Linked</div>
                      <div className="text-[9px] text-emerald-600 font-medium italic">Secure Connection</div>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="grid grid-cols-2 gap-4 h-full">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-5 overflow-y-auto scrollbar-hide">
              <h2 className="text-sm font-bold flex items-center gap-2"><Shield className="w-4 h-4 text-indigo-500" /> Application Settings</h2>
              
              <div className="space-y-5">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                   <div className="flex items-center gap-3">
                      <Monitor className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-xs font-bold">Minimize to Tray</div>
                        <div className="text-[9px] text-slate-400">Keep app running in background</div>
                      </div>
                   </div>
                   <input 
                      type="checkbox" 
                      checked={minimizeToTray}
                      onChange={(e) => handleToggleMinimize(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                   />
                </div>

                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                   <div className="flex items-center gap-3">
                      <RefreshCw className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-xs font-bold">Launch at Startup</div>
                        <div className="text-[9px] text-slate-400">Start Linkage with Windows</div>
                      </div>
                   </div>
                   <input 
                      type="checkbox" 
                      checked={autostart}
                      onChange={(e) => handleToggleAutostart(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                   />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Update Pairing PIN</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      maxLength={4}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="4 digits"
                      className="flex-grow bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button 
                      onClick={handleUpdatePin}
                      disabled={newPin.length !== 4 || isUpdatingPin}
                      className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-[10px] font-bold hover:bg-indigo-500 disabled:bg-slate-200 transition-colors shrink-0"
                    >
                      {isUpdatingPin ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Update'}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={handleClearDevices}
                    className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 border border-red-100 px-3 py-2 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Reset Trusted Devices
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex flex-col">
              <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><Info className="w-4 h-4 text-slate-500" /> About & Updates</h2>
              <div className="space-y-3 text-[11px] text-slate-600">
                <div className="flex justify-between py-2 border-b border-slate-200">
                  <span className="font-medium text-slate-400">Version</span>
                  <span className="font-bold">0.1.0 Beta</span>
                </div>
                
                {/* Update Button */}
                <div className="py-2 border-b border-slate-200">
                  <button 
                    onClick={handleCheckUpdates}
                    disabled={isCheckingUpdates}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-50 text-indigo-600 px-3 py-2.5 rounded-xl text-[10px] font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
                  >
                    {isCheckingUpdates ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                    )}
                    Check for Updates
                  </button>
                </div>

                <div className="flex justify-between py-2 border-b border-slate-200">
                  <span className="font-medium text-slate-400">Encryption</span>
                  <span className="text-indigo-600 font-bold flex items-center gap-1">
                    <Shield className="w-3 h-3" /> TLS/SSL
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200">
                  <span className="font-medium text-slate-400">Local IP</span>
                  <span className="font-mono">{serverInfo?.ip || '127.0.0.1'}</span>
                </div>
                
                <div className="mt-auto p-3 bg-white rounded-xl border border-slate-200">
                   <div className="flex items-center gap-2 text-indigo-600 font-bold mb-1">
                      <HardDrive className="w-3.5 h-3.5" />
                      <span className="text-[10px] uppercase">Storage</span>
                   </div>
                   <div className="text-[10px] text-slate-400 leading-relaxed">
                      Updates are downloaded automatically and replace the current binary upon restart.
                   </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
