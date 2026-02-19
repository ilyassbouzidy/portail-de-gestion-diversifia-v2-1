
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, FieldSession, FieldZone, FieldAlert, ModulePermissions } from '../types';
import { getCloudData, saveCloudData } from '../services/database';
import { SALES_AGENTS } from '../constants';
import { 
  MapPin, Navigation, Camera, LogOut, CheckCircle2, AlertOctagon, 
  History, Users, Settings, Target, Battery, Signal, Info, Loader2,
  Calendar, Search, ChevronRight, X, Play, Square, Map, LayoutDashboard, Clock
} from 'lucide-react';

interface FieldCommandAppProps { user: User; }

// Zones prédéfinies pour le démarrage (Casablanca)
const INITIAL_ZONES: FieldZone[] = [
  { id: 'zone_maarif', name: 'Maârif Extension', city: 'Casablanca', centerLat: 33.5855, centerLng: -7.6335, radiusKm: 2 },
  { id: 'zone_sidi_maarouf', name: 'Sidi Maârouf', city: 'Casablanca', centerLat: 33.5385, centerLng: -7.6535, radiusKm: 3 },
  { id: 'zone_bernoussi', name: 'Bernoussi', city: 'Casablanca', centerLat: 33.6085, centerLng: -7.5335, radiusKm: 2.5 },
  { id: 'zone_hay_mohammadi', name: 'Hay Mohammadi', city: 'Casablanca', centerLat: 33.5955, centerLng: -7.5735, radiusKm: 2 },
];

const FieldCommandApp: React.FC<FieldCommandAppProps> = ({ user, salesAgents = SALES_AGENTS }) => {
  const isAdmin = user.role === 'admin';
  const hasPerm = (action: keyof ModulePermissions) => isAdmin || !!user.permissions?.fieldCommand?.[action];

  const [activeTab, setActiveTab] = useState<'agent' | 'cockpit' | 'zones' | 'history'>('agent');
  const [isLoading, setIsLoading] = useState(true);
  const [sessions, setSessions] = useState<FieldSession[]>([]);
  const [zones, setZones] = useState<FieldZone[]>(INITIAL_ZONES);
  
  // State Agent
  const [currentSession, setCurrentSession] = useState<FieldSession | null>(null);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // State Manager
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [cockpitView, setCockpitView] = useState<'map' | 'list'>('list');

  // Load Data
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [sData, zData] = await Promise.all([
        getCloudData('field_sessions'),
        getCloudData('field_zones')
      ]);
      
      const loadedZones = zData || INITIAL_ZONES;
      setZones(loadedZones);
      const loadedSessions = sData || [];
      setSessions(loadedSessions);

      // Si agent, chercher sa session active du jour
      const today = new Date().toISOString().split('T')[0];
      const mySession = loadedSessions.find((s: FieldSession) => 
        s.agentName === user.associatedAgentName && 
        s.date === today
      );
      if (mySession) {
        setCurrentSession(mySession);
        setSelectedZone(mySession.zoneId);
      } else {
        // Reset pour nouvelle journée
        setCurrentSession(null);
        setSelectedZone('');
        setPhotoPreview(null);
      }

      // Admin default view
      if (isAdmin) setActiveTab('cockpit');
      
      setIsLoading(false);
    };
    load();
  }, [user, isAdmin]);

  // --- LOGIC AGENT ---

  const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    const d = R * c; // Distance in km
    return d;
  };

  const deg2rad = (deg: number) => deg * (Math.PI / 180);

  const handleSelfieUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleCheckIn = async () => {
    if (!selectedZone) return alert("Veuillez sélectionner une zone.");
    if (!photoPreview) return alert("Le selfie de départ est obligatoire.");
    if (!navigator.geolocation) return alert("GPS non supporté.");

    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const targetZone = zones.find(z => z.id === selectedZone);
        
        let alerts: FieldAlert[] = [];
        let distance = 0;

        // Vérification Distance Zone (Tolérance 500m + rayon)
        if (targetZone) {
           distance = getDistanceKm(latitude, longitude, targetZone.centerLat, targetZone.centerLng);
           if (distance > (targetZone.radiusKm + 0.5)) {
              if(!confirm(`⚠️ ATTENTION : Vous semblez être à ${(distance).toFixed(1)}km du centre de la zone ${targetZone.name}. Confirmer le démarrage hors zone ?`)) {
                 setIsLocating(false);
                 return;
              }
              alerts.push({
                 id: Math.random().toString(36).substr(2),
                 type: 'zone_exit',
                 severity: 'medium',
                 time: new Date().toISOString(),
                 message: `Démarrage à ${distance.toFixed(1)}km du centre zone`,
                 resolved: false
              });
           }
        }

        const newSession: FieldSession = {
          id: Math.random().toString(36).substr(2, 9),
          agentName: user.associatedAgentName || user.username,
          date: new Date().toISOString().split('T')[0],
          status: 'active',
          zoneId: selectedZone,
          supervisor: 'N/A', // À connecter au user profile si dispo
          checkInTime: new Date().toISOString(),
          checkInLat: latitude,
          checkInLng: longitude,
          checkInSelfie: photoPreview,
          alerts: alerts
        };

        const updatedSessions = [...sessions, newSession];
        setSessions(updatedSessions);
        setCurrentSession(newSession);
        await saveCloudData('field_sessions', updatedSessions);
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        setGpsError("Impossible de récupérer la position GPS. Vérifiez vos paramètres.");
      },
      { enableHighAccuracy: true }
    );
  };

  const handleCheckOut = async () => {
    if (!currentSession) return;
    if (!confirm("Confirmer la fin de journée ?")) return;

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const updatedSession: FieldSession = {
                ...currentSession,
                status: 'completed',
                checkOutTime: new Date().toISOString(),
                checkOutLat: pos.coords.latitude,
                checkOutLng: pos.coords.longitude
            };
            
            const updatedList = sessions.map(s => s.id === currentSession.id ? updatedSession : s);
            setSessions(updatedList);
            setCurrentSession(updatedSession); // Update local state but it will be "completed"
            await saveCloudData('field_sessions', updatedList);
            setIsLocating(false);
        },
        () => {
            alert("Erreur GPS lors du Check-out. Fin de journée forcée sans position.");
            const updatedSession: FieldSession = {
                ...currentSession,
                status: 'completed',
                checkOutTime: new Date().toISOString()
            };
            const updatedList = sessions.map(s => s.id === currentSession.id ? updatedSession : s);
            setSessions(updatedList);
            setCurrentSession(updatedSession);
            saveCloudData('field_sessions', updatedList);
            setIsLocating(false);
        }
    );
  };

  // --- VIEW RENDERERS ---

  const renderAgentView = () => {
    const today = new Date().toISOString().split('T')[0];
    const isWorking = currentSession && currentSession.status === 'active';
    const isCompleted = currentSession && currentSession.status === 'completed';

    if (isCompleted) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6">
                <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mb-4 animate-in zoom-in">
                    <CheckCircle2 className="w-12 h-12" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 uppercase italic">Journée Terminée</h2>
                <p className="text-slate-500 font-medium">Bon repos ! Votre rapport a été transmis.</p>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 w-full max-w-sm">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-400 uppercase">Début</span>
                        <span className="font-mono font-black">{new Date(currentSession.checkInTime).toLocaleTimeString().slice(0,5)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase">Fin</span>
                        <span className="font-mono font-black">{currentSession.checkOutTime ? new Date(currentSession.checkOutTime).toLocaleTimeString().slice(0,5) : '--:--'}</span>
                    </div>
                </div>
            </div>
        );
    }

    if (isWorking) {
        const zone = zones.find(z => z.id === currentSession.zoneId);
        return (
            <div className="flex flex-col h-full bg-slate-900 text-white rounded-[2rem] overflow-hidden relative">
                {/* Simulated Map Background */}
                <div className="absolute inset-0 opacity-20 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/ec/World_map_blank_without_borders.svg')] bg-cover bg-center"></div>
                
                <div className="relative z-10 p-8 flex flex-col h-full justify-between">
                    <div>
                        <div className="flex items-center space-x-2 mb-2">
                            <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></span>
                            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">En Ligne • Tracking Actif</span>
                        </div>
                        <h2 className="text-3xl font-black uppercase italic tracking-tighter">Terrain En Cours</h2>
                        <div className="mt-6 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zone Assignée</p>
                            <div className="flex items-center mt-1">
                                <MapPin className="w-5 h-5 text-orange-500 mr-2" />
                                <span className="text-xl font-bold">{zone?.name || 'Zone Inconnue'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-center">
                            <div className="bg-slate-800/80 backdrop-blur rounded-full px-6 py-3 flex items-center space-x-4 border border-white/10">
                                <div className="flex items-center text-xs font-bold text-slate-300">
                                    <Clock className="w-4 h-4 mr-2 text-blue-400" />
                                    Dep. {new Date(currentSession.checkInTime).toLocaleTimeString().slice(0,5)}
                                </div>
                                <div className="w-px h-4 bg-white/20"></div>
                                <div className="flex items-center text-xs font-bold text-slate-300">
                                    <Navigation className="w-4 h-4 mr-2 text-orange-400" />
                                    GPS OK
                                </div>
                            </div>
                        </div>

                        <button 
                            onClick={handleCheckOut}
                            className="w-full py-5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl shadow-rose-900/20 flex items-center justify-center transition-all active:scale-95"
                        >
                            <LogOut className="w-5 h-5 mr-3" /> Fin de journée
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full p-4 space-y-6">
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 text-center">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Navigation className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Démarrage Terrain</h2>
                <p className="text-xs text-slate-500 font-medium mt-1">Préparez votre départ en sélectionnant votre zone.</p>
            </div>

            <div className="space-y-4 flex-1">
                <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">1. Votre Zone</label>
                    <select 
                        value={selectedZone} 
                        onChange={(e) => setSelectedZone(e.target.value)}
                        className="w-full p-4 rounded-2xl bg-white border border-slate-200 font-bold text-slate-700 appearance-none shadow-sm focus:ring-2 focus:ring-orange-500/20 outline-none"
                    >
                        <option value="">-- Sélectionner --</option>
                        {zones.map(z => <option key={z.id} value={z.id}>{z.name} ({z.city})</option>)}
                    </select>
                </div>

                <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">2. Selfie de départ</label>
                    <label className={`flex flex-col items-center justify-center w-full aspect-video rounded-2xl border-2 border-dashed cursor-pointer transition-all ${photoPreview ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                        {photoPreview ? (
                            <img src={photoPreview} className="h-full object-contain rounded-xl" alt="Selfie" />
                        ) : (
                            <div className="flex flex-col items-center text-slate-400">
                                <Camera className="w-8 h-8 mb-2" />
                                <span className="text-xs font-bold uppercase">Prendre photo</span>
                            </div>
                        )}
                        <input type="file" accept="image/*" capture="user" onChange={handleSelfieUpload} className="hidden" />
                    </label>
                </div>
            </div>

            {gpsError && <div className="p-4 bg-rose-50 text-rose-600 text-xs font-bold rounded-xl border border-rose-100">{gpsError}</div>}

            <button 
                onClick={handleCheckIn}
                disabled={isLocating}
                className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl flex items-center justify-center disabled:opacity-70 transition-all active:scale-95"
            >
                {isLocating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Play className="w-5 h-5 mr-3 fill-current" /> Démarrer la journée</>}
            </button>
        </div>
    );
  };

  const renderManagerView = () => {
    // Filter sessions for the selected date
    const daySessions = sessions.filter(s => s.date === filterDate);
    
    // Construction de la liste complète des agents avec leur statut
    // On croise la liste statique salesAgents avec les sessions actives
    const fullCockpitList = salesAgents.map(agentName => {
        // Recherche insensible à la casse
        const session = daySessions.find(s => s.agentName.toLowerCase() === agentName.toLowerCase());
        const zone = session ? zones.find(z => z.id === session.zoneId) : null;
        
        return {
            agentName,
            hasSession: !!session,
            session,
            zoneName: zone ? zone.name : '-',
            status: session ? session.status : 'pending', // 'pending' = Non démarré
            checkIn: session ? session.checkInTime : null,
            alerts: session ? session.alerts : []
        };
    }).sort((a, b) => {
        // Tri : Actifs en premier, puis Terminés, puis Non démarrés
        const score = (s: string) => s === 'active' ? 3 : s === 'completed' ? 2 : 1;
        return score(b.status) - score(a.status);
    });

    const activeCount = fullCockpitList.filter(a => a.status === 'active').length;
    const completedCount = fullCockpitList.filter(a => a.status === 'completed').length;
    const pendingCount = fullCockpitList.filter(a => a.status === 'pending').length;
    const alertCount = daySessions.reduce((acc, s) => acc + (s.alerts?.length || 0), 0);
    
    // Pour la carte, on ne garde que ceux qui ont une session (position connue)
    const mapAgents = fullCockpitList
        .filter(a => a.hasSession && a.session)
        .map(a => {
             const s = a.session!;
             const zone = zones.find(z => z.id === s.zoneId);
             return {
                 ...s,
                 displayLat: s.checkInLat || (zone ? zone.centerLat : 33.5),
                 displayLng: s.checkInLng || (zone ? zone.centerLng : -7.6),
                 zoneName: zone?.name || 'Inconnue'
             };
        });

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl"><Target className="w-6 h-6" /></div>
                    <div>
                        <h3 className="text-lg font-black uppercase italic tracking-tighter text-slate-900">Cockpit Terrain</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Supervision Temps Réel</p>
                    </div>
                </div>
                <div className="flex items-center space-x-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                    <button onClick={() => setCockpitView('list')} className={`p-2 rounded-xl transition-all ${cockpitView === 'list' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}><LayoutDashboard className="w-5 h-5" /></button>
                    <button onClick={() => setCockpitView('map')} className={`p-2 rounded-xl transition-all ${cockpitView === 'map' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}><Map className="w-5 h-5" /></button>
                </div>
                <div className="flex items-center bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                    <Calendar className="w-4 h-4 text-slate-400 mr-2" />
                    <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="bg-transparent border-none text-xs font-bold text-slate-700 outline-none" />
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 text-white p-5 rounded-[2rem] shadow-lg">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">En Mission</p>
                    <p className="text-3xl font-black mt-1">{activeCount}</p>
                </div>
                <div className="bg-white text-slate-900 p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Terminés</p>
                    <p className="text-3xl font-black mt-1">{completedCount}</p>
                </div>
                <div className="bg-slate-50 text-slate-500 p-5 rounded-[2rem] border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Non Démarré</p>
                    <p className="text-3xl font-black mt-1">{pendingCount}</p>
                </div>
                <div className="bg-orange-50 text-orange-900 p-5 rounded-[2rem] border border-orange-100 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Alertes Zone</p>
                    <p className="text-3xl font-black mt-1">{alertCount}</p>
                </div>
            </div>

            {cockpitView === 'list' ? (
                <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex-1">
                    <div className="overflow-y-auto h-full custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4">Agent</th>
                                    <th className="px-6 py-4">Zone</th>
                                    <th className="px-6 py-4">Heure Départ</th>
                                    <th className="px-6 py-4 text-center">Statut</th>
                                    <th className="px-6 py-4 text-right">Alertes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {fullCockpitList.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center space-x-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden border border-slate-200">
                                                    {item.session?.checkInSelfie ? (
                                                        <img src={item.session.checkInSelfie} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Users className={`w-full h-full p-2 ${item.status === 'pending' ? 'text-slate-300' : 'text-slate-500'}`} />
                                                    )}
                                                </div>
                                                <span className={`font-bold text-sm ${item.status === 'pending' ? 'text-slate-400' : 'text-slate-700'}`}>{item.agentName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {item.zoneName !== '-' ? (
                                                <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase border border-indigo-100">
                                                    {item.zoneName}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 text-[10px] font-bold uppercase">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs font-bold text-slate-500">
                                            {item.checkIn ? new Date(item.checkIn).toLocaleTimeString().slice(0,5) : '--:--'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {item.status === 'active' ? (
                                                <span className="inline-flex items-center text-[10px] font-black uppercase text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full animate-pulse">
                                                    <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span> En Cours
                                                </span>
                                            ) : item.status === 'completed' ? (
                                                <span className="inline-flex items-center text-[10px] font-black uppercase text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                                                    Terminé
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center text-[10px] font-black uppercase text-slate-300 bg-slate-50 px-2 py-1 rounded-full border border-slate-100">
                                                    Non Démarré
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {item.alerts && item.alerts.length > 0 ? (
                                                <div className="flex justify-end gap-1">
                                                    {item.alerts.map((a, i) => (
                                                        <div key={i} className="w-2 h-2 rounded-full bg-rose-500" title={a.message}></div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 text-[10px] font-bold uppercase">RAS</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-slate-900 rounded-[2.5rem] overflow-hidden flex-1 relative border border-slate-800 shadow-inner">
                    {/* Simulated Map */}
                    <div className="absolute inset-0 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/ec/World_map_blank_without_borders.svg')] bg-cover bg-center opacity-30"></div>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <p className="text-slate-500 text-xs font-black uppercase tracking-[0.5em]">Mode Radar Activé</p>
                    </div>
                    
                    {/* Agents Dots Simulated */}
                    <div className="absolute inset-0 p-12">
                        {mapAgents.map((agent, i) => (
                            <div 
                                key={agent.id} 
                                className="absolute flex flex-col items-center transform hover:scale-110 transition-transform cursor-pointer group"
                                style={{ 
                                    top: `${30 + (i * 15) % 60}%`, 
                                    left: `${20 + (i * 20) % 70}%` 
                                }}
                            >
                                <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.5)] relative z-10 bg-slate-800">
                                    {agent.checkInSelfie ? <img src={agent.checkInSelfie} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-700"></div>}
                                </div>
                                <div className="bg-black/80 backdrop-blur text-white text-[9px] font-bold uppercase px-2 py-1 rounded mt-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                                    {agent.agentName} • {agent.zoneName}
                                </div>
                                {/* Ripple Effect */}
                                <div className="absolute top-0 left-0 w-12 h-12 bg-emerald-500/30 rounded-full animate-ping -z-0"></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-[#f8fafc]">
      {/* Mobile-first Tab Bar */}
      <div className="md:hidden flex justify-around bg-white border-b border-slate-100 p-2">
         <button onClick={() => setActiveTab('agent')} className={`p-3 rounded-2xl flex flex-col items-center ${activeTab === 'agent' ? 'text-orange-600 bg-orange-50' : 'text-slate-400'}`}>
            <Navigation className="w-6 h-6" />
            <span className="text-[9px] font-black uppercase mt-1">Terrain</span>
         </button>
         {isAdmin && (
             <button onClick={() => setActiveTab('cockpit')} className={`p-3 rounded-2xl flex flex-col items-center ${activeTab === 'cockpit' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>
                <LayoutDashboard className="w-6 h-6" />
                <span className="text-[9px] font-black uppercase mt-1">Supervision</span>
             </button>
         )}
      </div>

      <div className="flex-1 overflow-hidden p-4 md:p-8">
         <div className="max-w-7xl mx-auto h-full">
            {activeTab === 'agent' ? renderAgentView() : renderManagerView()}
         </div>
      </div>
    </div>
  );
};

export default FieldCommandApp;
