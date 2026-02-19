
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, Prospect, Opportunity, ModulePermissions, OpportunityStage } from '../types';
import { getCloudData, saveCloudData, addArrayItem, db } from '../services/database';
import { doc, onSnapshot } from "firebase/firestore";
import { 
  Briefcase, Plus, Search, Filter, Edit3, Trash2, ArrowRightCircle, 
  Phone, Mail, MapPin, Calendar, CheckCircle2, XCircle, LayoutList, 
  Kanban, Loader2, X, Save, Target, TrendingUp, Users, RefreshCcw,
  Building2, ChevronRight, UserPlus, PhoneCall, ExternalLink, AlertTriangle,
  Radar, Map as MapIcon, Crosshair, ZoomIn, ZoomOut, Locate, Navigation
} from 'lucide-react';
import { SALES_AGENTS, PRODUCT_OFFERS } from '../constants';

interface B2BProspectAppProps {
  user: User;
  salesAgents?: string[];
}

const STAGES: OpportunityStage[] = ['Lancée', 'En cours', 'Facturée', 'Annulée'];

const STAGE_COLORS: Record<OpportunityStage, string> = {
  'Lancée': 'bg-blue-50 text-blue-600 border-blue-200',
  'En cours': 'bg-amber-50 text-amber-600 border-amber-200',
  'Facturée': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'Annulée': 'bg-rose-50 text-rose-600 border-rose-200',
};

const PROSPECT_TYPES = ['Commerce', 'BTOC', 'Association', 'Entreprise', 'Autre'];
const PROSPECT_STATUSES = ['Nouveau Client', 'Ancien Client', 'Recommandation'];

const B2BProspectApp: React.FC<B2BProspectAppProps> = ({ user, salesAgents = SALES_AGENTS }) => {

// Palette de couleurs par agent
const AGENT_COLORS = [
  '#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
];

// Limites géographiques de l'image de la carte du Maroc (Calibration)
// Basé sur la projection Equirectangulaire de "Morocco_location_map.svg"
const MAP_BOUNDS = {
  north: 36.0, // Latitude Nord (Tanger)
  south: 20.8, // Latitude Sud (Lagouira)
  west: -17.3, // Longitude Ouest (Océan)
  east: -0.8   // Longitude Est (Frontière Algérie)
};

  const isAdmin = user.role === 'admin';
  const hasPerm = (action: keyof ModulePermissions) => isAdmin || !!user.permissions?.b2bProspect?.[action];

  const [activeTab, setActiveTab] = useState<'prospects' | 'pipeline' | 'map'>('prospects');
  const [isLoading, setIsLoading] = useState(true);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  
  const pendingProspects = useRef<Prospect[]>([]);
  const pendingOpportunities = useRef<Opportunity[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAgent, setFilterAgent] = useState('all');
  
  // Filtres de date
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');

  // Zoom & Pan State pour la carte
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const [showModal, setShowModal] = useState<'prospect' | 'opportunity' | 'delete_confirm' | null>(null);
  const [prospectToDelete, setProspectToDelete] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [prospectForm, setProspectForm] = useState<Partial<Prospect>>({});
  
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);
  const [oppForm, setOppForm] = useState<Partial<Opportunity>>({});
  
  const [prospectSearchQuery, setProspectSearchQuery] = useState('');
  const [isProspectListOpen, setIsProspectListOpen] = useState(false);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
        const [p, o] = await Promise.all([
            getCloudData('b2b_prospects'),
            getCloudData('b2b_opportunities')
        ]);
        if (p) setProspects(p);
        if (o) setOpportunities(o);
    } catch (e) {
        console.error("Erreur rafraîchissement manuel", e);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadLocal = async () => {
      const [p, o] = await Promise.all([
        getCloudData('b2b_prospects'),
        getCloudData('b2b_opportunities')
      ]);
      if (p) setProspects(p);
      if (o) setOpportunities(o);
      setIsLoading(false);
    };
    loadLocal();

    if (db) {
      const unsubProspects = onSnapshot(doc(db, "diversifia_store", "b2b_prospects"), (docSnap) => {
        if (docSnap.exists()) {
          const cloudData = docSnap.data();
          let serverList = cloudData?.payload || [];
          if (pendingProspects.current.length > 0) {
             pendingProspects.current = pendingProspects.current.filter(local => 
                !serverList.some((server: Prospect) => server.id === local.id)
             );
             const merged = [...pendingProspects.current, ...serverList];
             const uniqueList = Array.from(new Map(merged.map(item => [item.id, item])).values());
             serverList = uniqueList;
          }
          setProspects(serverList);
          try { localStorage.setItem('diversifia_db_b2b_prospects', JSON.stringify(cloudData)); } catch(e) {}
        }
      });

      const unsubOpportunities = onSnapshot(doc(db, "diversifia_store", "b2b_opportunities"), (docSnap) => {
        if (docSnap.exists()) {
          const cloudData = docSnap.data();
          let serverList = cloudData?.payload || [];
          if (pendingOpportunities.current.length > 0) {
             pendingOpportunities.current = pendingOpportunities.current.filter(local => 
                !serverList.some((server: Opportunity) => server.id === local.id)
             );
             const merged = [...pendingOpportunities.current, ...serverList];
             const uniqueList = Array.from(new Map(merged.map(item => [item.id, item])).values());
             serverList = uniqueList;
          }
          setOpportunities(serverList);
          try { localStorage.setItem('diversifia_db_b2b_opportunities', JSON.stringify(cloudData)); } catch(e) {}
        }
      });

      return () => {
        unsubProspects();
        unsubOpportunities();
      };
    } else {
      const interval = setInterval(loadLocal, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  const filteredProspects = useMemo(() => {
    const list = prospects.filter(p => {
      // Sécurité : Filtrage par agent assigné si non admin
      const visibilityFilter = isAdmin || p.assignedTo === user.associatedAgentName;
      if (!visibilityFilter) return false;

      const matchSearch = p.companyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (p.phone || '').includes(searchTerm);
      const matchAgent = filterAgent === 'all' || p.assignedTo === filterAgent;
      
      // Filtre Date
      let matchDate = true;
      if (filterDateStart || filterDateEnd) {
        const pDate = new Date(p.createdAt).getTime();
        if (filterDateStart && pDate < new Date(filterDateStart).getTime()) matchDate = false;
        if (filterDateEnd) {
            const endDate = new Date(filterDateEnd);
            endDate.setHours(23, 59, 59);
            if (pDate > endDate.getTime()) matchDate = false;
        }
      }

      return matchSearch && matchAgent && matchDate;
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [prospects, searchTerm, filterAgent, filterDateStart, filterDateEnd, isAdmin, user.associatedAgentName]);

  const filteredOpportunities = useMemo(() => {
    const list = opportunities.filter(o => {
        // Sécurité : Filtrage par agent assigné si non admin
        const visibilityFilter = isAdmin || o.assignedTo === user.associatedAgentName;
        if (!visibilityFilter) return false;

        const p = prospects.find(p => p.id === o.prospectId);
        const matchSearch = o.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (p?.companyName || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchAgent = filterAgent === 'all' || o.assignedTo === filterAgent;
        return matchSearch && matchAgent;
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [opportunities, prospects, searchTerm, filterAgent, isAdmin, user.associatedAgentName]);

  const stats = useMemo(() => {
    const visibleProspects = prospects.filter(p => isAdmin || p.assignedTo === user.associatedAgentName);
    const visibleOpps = opportunities.filter(o => isAdmin || o.assignedTo === user.associatedAgentName);

    const totalProspects = visibleProspects.length;
    const activeOpps = visibleOpps.filter(o => o.stage === 'En cours' || o.stage === 'Lancée').length;
    const wonOpps = visibleOpps.filter(o => o.stage === 'Facturée').length;
    const conversionRate = visibleOpps.length > 0 ? Math.round((wonOpps / visibleOpps.length) * 100) : 0;
    return { totalProspects, activeOpps, conversionRate, wonOpps };
  }, [prospects, opportunities, isAdmin, user.associatedAgentName]);

  // --- LOGIC CARTE MAROC ---
  const mapData = useMemo(() => {
    // Filtrer les prospects avec géolocalisation
    const geotagged = filteredProspects.filter(p => p.latitude && p.longitude);
    
    const latRange = MAP_BOUNDS.north - MAP_BOUNDS.south;
    const lngRange = MAP_BOUNDS.east - MAP_BOUNDS.west;

    const points = geotagged.map(p => {
        if (!p.latitude || !p.longitude) return null;
        
        // Exclure les points hors de la carte
        if (p.latitude > MAP_BOUNDS.north || p.latitude < MAP_BOUNDS.south) return null;
        if (p.longitude > MAP_BOUNDS.east || p.longitude < MAP_BOUNDS.west) return null;

        // Projection Latitude (0% = Nord, 100% = Sud)
        const top = ((MAP_BOUNDS.north - p.latitude) / latRange) * 100;
        // Projection Longitude (0% = Ouest, 100% = Est)
        const left = ((p.longitude - MAP_BOUNDS.west) / lngRange) * 100;
        
        // Couleur par agent
        const agentIndex = salesAgents.indexOf(p.assignedTo);
        const color = agentIndex >= 0 ? AGENT_COLORS[agentIndex % AGENT_COLORS.length] : '#94a3b8';

        return { ...p, top, left, color };
    }).filter(Boolean); // Retirer les nuls

    return { points };
  }, [filteredProspects]);

  // Gestion du Drag de la carte
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - panX, y: e.clientY - panY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const x = e.clientX - dragStart.current.x;
    const y = e.clientY - dragStart.current.y;
    setPanX(x);
    setPanY(y);
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleGetLocation = () => {
    if (!navigator.geolocation) return alert("La géolocalisation n'est pas supportée.");
    navigator.geolocation.getCurrentPosition(
      (pos) => setProspectForm(prev => ({ ...prev, latitude: pos.coords.latitude, longitude: pos.coords.longitude })),
      (err) => alert("Erreur GPS : " + err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSaveProspect = async () => {
    if (!hasPerm('create') && !editingProspect) return;
    if (!hasPerm('update') && editingProspect) return;
    if (!prospectForm.companyName) return alert("Nom de l'entreprise requis");
    
    // VALIDATION : Localisation recommandée mais pas bloquante pour l'UX
    if (!prospectForm.assignedTo) return alert("Le choix de l'agent assigné (vendeur) est obligatoire.");

    setIsSaving(true);
    try {
        const now = new Date().toISOString();
        const newProspect: Prospect = {
          ...prospectForm as Prospect,
          id: editingProspect?.id || Math.random().toString(36).substr(2, 9),
          createdAt: editingProspect?.createdAt || now,
          updatedAt: now,
          lastAction: now,
          interest: prospectForm.interest || [],
          assignedTo: prospectForm.assignedTo || user.associatedAgentName || 'Non assigné',
          status: prospectForm.status || 'Nouveau Client',
          type: prospectForm.type || 'Entreprise'
        };
        if (editingProspect) {
          const latestData = await getCloudData('b2b_prospects') || [];
          let updatedList = latestData.map((p: Prospect) => p.id === editingProspect.id ? newProspect : p);
          await saveCloudData('b2b_prospects', updatedList);
          setProspects(updatedList);
        } else {
          pendingProspects.current.push(newProspect);
          setProspects(prev => [newProspect, ...prev]); 
          await addArrayItem('b2b_prospects', newProspect);
        }
        setShowModal(null); setEditingProspect(null); setProspectForm({});
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const handleDeleteProspect = (id: string) => {
    if (!hasPerm('delete')) return;
    setProspectToDelete(id);
    setShowModal('delete_confirm');
  };

  const confirmDeleteProspect = async () => {
    if (!prospectToDelete) return;
    setIsSaving(true);
    try {
        const latestProspects = await getCloudData('b2b_prospects') || prospects;
        const latestOpps = await getCloudData('b2b_opportunities') || opportunities;
        const updatedProspects = latestProspects.filter((p: Prospect) => p.id !== prospectToDelete);
        const updatedOpps = latestOpps.filter((o: Opportunity) => o.prospectId !== prospectToDelete);
        setProspects(updatedProspects); setOpportunities(updatedOpps);
        await Promise.all([saveCloudData('b2b_prospects', updatedProspects), saveCloudData('b2b_opportunities', updatedOpps)]);
    } catch (e) { console.error(e); } finally {
        setIsSaving(false);
        setShowModal(null);
        setProspectToDelete(null);
    }
  };

  const handleSaveOpp = async () => {
    if (!hasPerm('create') && !editingOpp) return;
    if (!hasPerm('update') && editingOpp) return;
    if (!oppForm.title || !oppForm.prospectId) return alert("Offre et Prospect requis");
    setIsSaving(true);
    try {
        const now = new Date().toISOString();
        const newOpp: Opportunity = {
          ...oppForm as Opportunity,
          id: editingOpp?.id || Math.random().toString(36).substr(2, 9),
          createdAt: editingOpp?.createdAt || now,
          updatedAt: now,
          stage: oppForm.stage || 'Lancée',
          assignedTo: oppForm.assignedTo || user.associatedAgentName || 'Non assigné',
          expectedCloseDate: oppForm.expectedCloseDate || '',
          value: 0
        };
        if (editingOpp) {
          const latestOpps = await getCloudData('b2b_opportunities') || [];
          let updatedList = latestOpps.map((o: Opportunity) => o.id === editingOpp.id ? newOpp : o);
          await saveCloudData('b2b_opportunities', updatedList);
          setOpportunities(updatedList);
        } else {
          pendingOpportunities.current.push(newOpp);
          setOpportunities(prev => [newOpp, ...prev]);
          await addArrayItem('b2b_opportunities', newOpp);
        }
        setShowModal(null); setEditingOpp(null); setOppForm({});
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const handleDeleteOpp = async (id: string) => {
    if (!hasPerm('delete')) return;
    if (!confirm("Supprimer cette opportunité ?")) return;
    try {
        const latestOpps = await getCloudData('b2b_opportunities') || opportunities;
        const updatedList = latestOpps.filter((o: Opportunity) => o.id !== id);
        setOpportunities(updatedList);
        await saveCloudData('b2b_opportunities', updatedList);
    } catch (e) { console.error(e); }
  };

  const moveOppStage = async (opp: Opportunity, direction: 'next' | 'prev') => {
    if (!hasPerm('update')) return;
    const currentIndex = STAGES.indexOf(opp.stage);
    if (currentIndex === -1) return;
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0 || newIndex >= STAGES.length) return;
    const newStage = STAGES[newIndex];
    const updatedOpp = { ...opp, stage: newStage, updatedAt: new Date().toISOString() };
    setOpportunities(opportunities.map(o => o.id === opp.id ? updatedOpp : o));
    try {
        const latestOpps = await getCloudData('b2b_opportunities') || opportunities;
        const finalUpdatedList = latestOpps.map((o: Opportunity) => o.id === opp.id ? updatedOpp : o);
        await saveCloudData('b2b_opportunities', finalUpdatedList);
    } catch(e) { handleRefresh(); }
  };

  const openProspectModal = (prospect?: Prospect) => {
    if (prospect) { setEditingProspect(prospect); setProspectForm(prospect); }
    else { setEditingProspect(null); setProspectForm({ assignedTo: user.associatedAgentName, status: 'Nouveau Client', type: 'Entreprise', interest: [] }); }
    setShowModal('prospect');
  };

  const openOppModal = (opp?: Opportunity, prospectId?: string) => {
    setProspectSearchQuery('');
    setIsProspectListOpen(false);
    if (opp) { 
        setEditingOpp(opp); 
        setOppForm(opp); 
        const p = prospects.find(p => p.id === opp.prospectId);
        if(p) setProspectSearchQuery(p.companyName);
    }
    else { 
        setEditingOpp(null); 
        setOppForm({ prospectId: prospectId || '', assignedTo: user.associatedAgentName, stage: 'Lancée', value: 0, expectedCloseDate: new Date().toISOString().split('T')[0] }); 
        if(prospectId) {
            const p = prospects.find(p => p.id === prospectId);
            if(p) setProspectSearchQuery(p.companyName);
        }
    }
    setShowModal('opportunity');
  };

  const prospectSearchResults = useMemo(() => {
    if (!prospectSearchQuery.trim()) return [];
    return prospects.filter(p => 
        (isAdmin || p.assignedTo === user.associatedAgentName) && 
        (p.companyName.toLowerCase().includes(prospectSearchQuery.toLowerCase()) ||
        (p.phone || '').includes(prospectSearchQuery))
    ).slice(0, 5);
  }, [prospects, prospectSearchQuery, isAdmin, user.associatedAgentName]);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 md:mb-8 gap-4 md:gap-6">
        <div className="text-center md:text-left w-full md:w-auto">
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase italic">B2B Prospecting</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestion Pipeline Entreprises</p>
        </div>
        <div className="flex w-full md:w-auto bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
           <button onClick={() => setActiveTab('prospects')} className={`flex-1 md:flex-none flex items-center justify-center px-4 md:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'prospects' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>
              <LayoutList className="w-4 h-4 mr-2" /> Prospects
           </button>
           <button onClick={() => setActiveTab('pipeline')} className={`flex-1 md:flex-none flex items-center justify-center px-4 md:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'pipeline' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>
              <Kanban className="w-4 h-4 mr-2" /> Pipeline
           </button>
           <button onClick={() => setActiveTab('map')} className={`flex-1 md:flex-none flex items-center justify-center px-4 md:px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'map' ? 'bg-[#ff7900] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>
              <MapIcon className="w-4 h-4 mr-2" /> Carte Maroc
           </button>
        </div>
      </div>

      {/* Stats Cards - Adaptive Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
         {[
           { label: 'Base', val: stats.totalProspects, icon: Users, bg: 'bg-blue-50', color: 'text-blue-600' },
           { label: 'Actif', val: stats.activeOpps, icon: Target, bg: 'bg-amber-50', color: 'text-amber-600' },
           { label: 'Signés', val: stats.wonOpps, icon: CheckCircle2, bg: 'bg-emerald-50', color: 'text-emerald-600' },
           { label: 'Conv.', val: stats.conversionRate + '%', icon: TrendingUp, bg: 'bg-orange-50', color: 'text-orange-500' }
         ].map((s, i) => (
           <div key={i} className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center md:items-center space-y-2 md:space-y-0 md:space-x-4">
              <div className={`p-2.5 md:p-3 ${s.bg} rounded-xl md:rounded-2xl ${s.color}`}><s.icon className="w-5 h-5 md:w-6 md:h-6" /></div>
              <div className="text-center md:text-left">
                <p className="text-[8px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest">{s.label}</p>
                <p className="text-lg md:text-2xl font-black text-slate-900 leading-none mt-1">{s.val}</p>
              </div>
           </div>
         ))}
      </div>

      {/* Toolbar - Adaptive Wrapping */}
      <div className="bg-white p-3 md:p-4 rounded-2xl md:rounded-[2.5rem] shadow-sm border border-slate-100 mb-6 flex flex-wrap items-center gap-3 md:gap-4">
         <div className="relative flex-grow min-w-full md:min-w-[200px] order-1 md:order-none">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Rechercher prospect ou tel..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 md:py-3 rounded-xl md:rounded-2xl bg-slate-50 border-none text-xs font-bold focus:ring-2 focus:ring-indigo-500/20"
            />
         </div>
         {/* Filtres Dates */}
         <div className="flex items-center gap-2 order-2">
            <input 
              type="date" 
              value={filterDateStart} 
              onChange={e => setFilterDateStart(e.target.value)} 
              className="p-3 rounded-xl md:rounded-2xl bg-slate-50 border-none text-[10px] font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500/20"
              title="Date début"
            />
            <span className="text-slate-300 font-black">-</span>
            <input 
              type="date" 
              value={filterDateEnd} 
              onChange={e => setFilterDateEnd(e.target.value)} 
              className="p-3 rounded-xl md:rounded-2xl bg-slate-50 border-none text-[10px] font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500/20"
              title="Date fin"
            />
         </div>
         {isAdmin && (
            <div className="flex-grow md:flex-none w-[calc(60%-6px)] md:w-48 order-2 md:order-none">
               <select 
                 value={filterAgent} 
                 onChange={e => setFilterAgent(e.target.value)}
                 className="w-full p-3.5 md:p-3 rounded-xl md:rounded-2xl bg-slate-50 border-none text-xs font-bold text-slate-600 appearance-none cursor-pointer"
               >
                  <option value="all">Tous agents</option>
                  {salesAgents.map(agent => <option key={agent} value={agent}>{agent}</option>)}
               </select>
            </div>
         )}
         <button onClick={handleRefresh} className="p-3.5 md:p-3 bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-xl md:rounded-2xl transition-all shadow-sm order-3 md:order-none">
            <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
         </button>
         <div className="w-full md:w-auto order-4 md:order-none">
           {hasPerm('create') && (
              <button 
                  onClick={() => activeTab === 'prospects' ? openProspectModal() : openOppModal()} 
                  className="w-full px-6 py-4 md:py-3 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:opacity-90 transition-all flex items-center justify-center"
              >
                 <Plus className="w-4 h-4 mr-2" /> 
                 {activeTab === 'prospects' ? 'Nouveau Prospect' : 'Nouvelle Opportunité'}
              </button>
           )}
         </div>
      </div>

      {isLoading ? <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-indigo-600 animate-spin" /></div> : (
         <>
           {activeTab === 'prospects' && (
             <div className="space-y-4 md:space-y-0">
               {/* Desktop View Table */}
               <div className="hidden md:block bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                 <table className="w-full text-left">
                   <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest"><tr><th className="px-8 py-5">Entreprise</th><th className="px-8 py-5">Téléphone</th><th className="px-8 py-5">Date Création</th><th className="px-8 py-5">Statut</th><th className="px-8 py-5">Agent</th><th className="px-8 py-5 text-right">Actions</th></tr></thead>
                   <tbody className="divide-y divide-slate-50">{filteredProspects.map(p => (
                     <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                       <td className="px-8 py-5"><p className="font-black text-slate-900 text-xs uppercase">{p.companyName}</p><div className="flex items-center gap-2 mt-1"><span className="text-[8px] font-bold text-slate-500 bg-slate-100 px-1.5 rounded border border-slate-200">{p.type || 'Entreprise'}</span></div></td>
                       <td className="px-8 py-5"><p className="text-xs font-mono font-bold text-slate-600">{p.phone || '-'}</p></td>
                       <td className="px-8 py-5"><span className="text-[10px] font-bold text-slate-500">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</span></td>
                       <td className="px-8 py-5"><span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${p.status === 'Nouveau' || p.status === 'Nouveau Client' ? 'bg-blue-50 text-blue-600' : p.status === 'Ancien Client' ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'}`}>{p.status}</span></td>
                       <td className="px-8 py-5"><span className="text-[10px] font-bold text-slate-500 uppercase">{p.assignedTo}</span></td>
                       <td className="px-8 py-5 text-right">
                         <div className="flex items-center justify-end gap-2 group-hover:opacity-100 transition-opacity">
                            {p.latitude && p.longitude && (<button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`, '_blank')} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 min-w-[36px] min-h-[36px] flex items-center justify-center"><MapPin className="w-4 h-4" /></button>)}
                            {hasPerm('create') && (
                              <button onClick={() => openOppModal(undefined, p.id)} className="p-2 bg-[#ff7900] text-white rounded-xl hover:bg-slate-900 min-w-[36px] min-h-[36px] flex items-center justify-center shadow-md transition-all active:scale-95"><Plus className="w-4 h-4" /></button>
                            )}
                            {hasPerm('update') && (<button onClick={() => openProspectModal(p)} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 min-w-[36px] min-h-[36px] flex items-center justify-center"><Edit3 className="w-4 h-4" /></button>)}
                            {hasPerm('delete') && (<button onClick={() => handleDeleteProspect(p.id)} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-rose-50 hover:text-rose-600 min-w-[36px] min-h-[36px] flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>)}
                         </div>
                       </td>
                     </tr>
                   ))}</tbody>
                 </table>
               </div>

               {/* Mobile View - Card List */}
               <div className="md:hidden space-y-4">
                  {filteredProspects.map(p => (
                    <div key={p.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 relative overflow-hidden">
                       {/* Background highlight for status */}
                       <div className={`absolute top-0 left-0 w-1.5 h-full ${p.status.includes('Ancien') ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                       
                       <div className="flex justify-between items-start mb-3">
                          <div>
                             <h3 className="font-black text-slate-900 uppercase italic text-sm leading-tight">{p.companyName}</h3>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{p.type || 'Entreprise'}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${p.status.includes('Nouveau') ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                             {p.status}
                          </span>
                       </div>

                       <div className="flex items-center gap-4 mb-5">
                          {p.phone && (
                            <a href={`tel:${p.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs">
                               <PhoneCall className="w-3.5 h-3.5" /> {p.phone}
                            </a>
                          )}
                          <div className="flex items-center text-[10px] text-slate-400 font-bold">
                             <Calendar className="w-3 h-3 mr-1" /> {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                          </div>
                       </div>

                       <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                          <div className="flex items-center gap-1.5">
                             <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-black text-slate-500 border border-slate-200 uppercase">
                                {p.assignedTo?.charAt(0)}
                             </div>
                             <span className="text-[10px] font-black text-slate-500 uppercase">{p.assignedTo?.split(' ')[0]}</span>
                          </div>

                          <div className="flex items-center gap-2">
                             {p.latitude && p.longitude && (
                               <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`, '_blank')} className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                                  <MapPin className="w-5 h-5" />
                               </button>
                             )}
                             {hasPerm('create') && (
                               <button onClick={() => openOppModal(undefined, p.id)} className="w-10 h-10 bg-[#ff7900] text-white rounded-xl flex items-center justify-center shadow-md active:scale-95">
                                  <Briefcase className="w-5 h-5" />
                               </button>
                             )}
                             <button onClick={() => openProspectModal(p)} className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
                                <Edit3 className="w-5 h-5" />
                             </button>
                             {hasPerm('delete') && (
                               <button onClick={() => handleDeleteProspect(p.id)} className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
                                  <Trash2 className="w-5 h-5" />
                               </button>
                             )}
                          </div>
                       </div>
                    </div>
                  ))}
                  {filteredProspects.length === 0 && (
                    <div className="py-12 text-center text-slate-300 font-bold uppercase text-xs">Aucun prospect</div>
                  )}
               </div>
             </div>
           )}

           {activeTab === 'pipeline' && (
             <div className="flex gap-4 md:gap-6 overflow-x-auto pb-6 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
                {STAGES.map(stage => {
                   const stageOpps = filteredOpportunities.filter(o => o.stage === stage);
                   return (
                     <div key={stage} className="flex-none w-[85vw] md:w-80 flex flex-col h-[550px] md:h-[600px] bg-slate-50/50 rounded-3xl md:rounded-[2rem] border border-slate-100">
                        <div className={`p-4 border-b ${STAGE_COLORS[stage]} bg-opacity-20 rounded-t-3xl md:rounded-t-[2rem]`}>
                           <h3 className="font-black uppercase text-xs tracking-widest flex justify-between">
                              {stage} <span className="bg-white/40 px-2 py-0.5 rounded-lg">{stageOpps.length}</span>
                           </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                              {stageOpps.map(opp => {
                                  const prospect = prospects.find(p => p.id === opp.prospectId);
                                  return (
                                    <div key={opp.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 group active:scale-[0.98] transition-transform">
                                      <div className="flex justify-between items-start mb-2">
                                          <div className="flex items-center space-x-1.5"><div className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-[9px] font-black border border-indigo-100">{opp.assignedTo ? opp.assignedTo.charAt(0) : '?'}</div><span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight truncate max-w-[100px]">{opp.assignedTo || 'Non assigné'}</span></div>
                                          <div className="flex space-x-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            {hasPerm('update') && <button onClick={() => openOppModal(opp)} className="text-slate-400 hover:text-indigo-500 p-1"><Edit3 className="w-3.5 h-3.5" /></button>}
                                            {hasPerm('delete') && <button onClick={() => handleDeleteOpp(opp.id)} className="text-slate-400 hover:text-rose-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>}
                                          </div>
                                      </div>
                                      <h4 className="font-black text-slate-800 text-xs mb-1 truncate">{opp.title}</h4>
                                      <p className="text-[9px] text-slate-500 font-bold uppercase truncate mb-2">{prospect?.companyName || 'Prospect inconnu'}</p>
                                      <div className="flex justify-between items-center mb-2"><p className="text-[8px] text-slate-400 font-bold">{new Date(opp.createdAt).toLocaleDateString('fr-FR')}</p>{opp.expectedCloseDate && (<div className="flex items-center text-[8px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100"><Calendar className="w-2.5 h-2.5 mr-1" />{new Date(opp.expectedCloseDate).toLocaleDateString('fr-FR')}</div>)}</div>
                                      <div className="flex justify-between items-end border-t border-slate-50 pt-2"><div className="flex space-x-1 ml-auto">{stage !== 'Lancée' && hasPerm('update') && <button onClick={() => moveOppStage(opp, 'prev')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><ArrowRightCircle className="w-5 h-5 rotate-180" /></button>}{stage !== 'Annulée' && hasPerm('update') && <button onClick={() => moveOppStage(opp, 'next')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><ArrowRightCircle className="w-5 h-5" /></button>}</div></div>
                                    </div>
                                  );
                              })}
                        </div>
                     </div>
                   );
                })}
             </div>
           )}

           {activeTab === 'map' && (
             <div className="h-[75vh] w-full bg-blue-50 rounded-[2.5rem] border border-blue-100 relative overflow-hidden shadow-inner flex flex-col group">
                {/* Header Carte */}
                <div className="absolute top-0 left-0 w-full p-6 z-20 flex justify-between items-start pointer-events-none">
                   <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter drop-shadow-sm">Carte Maroc</h3>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 bg-white/80 px-2 py-1 rounded-lg backdrop-blur inline-block shadow-sm">
                         {mapData.points.length} Zones Identifiées
                         {filterAgent !== 'all' && ` • ${filterAgent}`}
                      </p>
                   </div>
                   <div className="flex flex-col gap-2 pointer-events-auto">
                      <div className="bg-white/90 backdrop-blur-md p-2 rounded-xl border border-slate-200 flex flex-col gap-1 shadow-lg">
                         {salesAgents.filter(a => mapData.points.some(p => p.assignedTo === a)).slice(0, 8).map((agent, i) => (
                            <div key={agent} className="flex items-center gap-2">
                               <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: AGENT_COLORS[salesAgents.indexOf(agent) % AGENT_COLORS.length] }}></div>
                               <span className="text-[8px] font-black text-slate-700 uppercase">{agent.split(' ')[0]}</span>
                            </div>
                         ))}
                         {salesAgents.filter(a => mapData.points.some(p => p.assignedTo === a)).length > 8 && (
                            <span className="text-[8px] text-slate-400 text-center">+ autres...</span>
                         )}
                      </div>
                   </div>
                </div>

                {/* Conteneur de la carte avec Pan & Zoom */}
                <div 
                  className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing bg-[#e0f7fa]" 
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                   <div 
                      className="absolute inset-0 flex items-center justify-center transform-gpu transition-transform duration-75 origin-center" 
                      style={{ 
                        transform: `scale(${zoomLevel}) translate(${panX / zoomLevel}px, ${panY / zoomLevel}px)` 
                      }}
                   >
                       {/* Map Aspect Ratio Container: ensures the map image is visible and not cropped */}
                       <div className="relative shadow-2xl" style={{ height: '90%', aspectRatio: '0.85' }}>
                           {/* Image Carte Maroc (Projection Equirectangulaire) */}
                           <img 
                              src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Morocco_location_map.svg/866px-Morocco_location_map.svg.png" 
                              alt="Carte du Maroc" 
                              className="w-full h-full object-fill opacity-100 bg-white"
                              draggable={false}
                           />
                           
                           {/* Points (Markers) - Positioned relative to the image */}
                           <div className="absolute inset-0">
                               {mapData.points.map((p) => (
                                  <div 
                                     key={p.id}
                                     className="absolute transform -translate-x-1/2 -translate-y-full hover:z-50 cursor-pointer"
                                     style={{ top: `${p.top}%`, left: `${p.left}%` }}
                                  >
                                     <div className="relative group/pin">
                                        {/* Pin Icon */}
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-md hover:scale-125 transition-transform duration-200">
                                           <path d="M12 0C7.58 0 4 3.58 4 8C4 13.54 12 24 12 24C12 24 20 13.54 20 8C20 3.58 16.42 0 12 0Z" fill={p.color} stroke="white" strokeWidth="1.5" />
                                           <circle cx="12" cy="8" r="3" fill="white"/>
                                        </svg>
                                        
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white text-slate-900 px-3 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap opacity-0 group-hover/pin:opacity-100 transition-opacity shadow-xl pointer-events-none flex flex-col items-center z-50 min-w-[100px] border border-slate-100">
                                           <span className="text-xs">{p.companyName}</span>
                                           <span className="text-[8px] text-slate-400 font-bold">{p.assignedTo}</span>
                                           <span className="text-[7px] text-slate-300 mt-0.5">{p.status}</span>
                                           <div className="w-2 h-2 bg-white rotate-45 absolute -bottom-1 border-r border-b border-slate-100"></div>
                                        </div>
                                     </div>
                                  </div>
                               ))}
                           </div>
                       </div>
                   </div>
                </div>

                {/* Contrôles Zoom */}
                <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2">
                   <button onClick={() => setZoomLevel(z => Math.min(z + 0.5, 12))} className="p-3 bg-white text-slate-700 rounded-xl shadow-lg border border-slate-100 hover:bg-slate-50 active:scale-95 transition-all">
                      <ZoomIn className="w-5 h-5" />
                   </button>
                   <button onClick={() => { setZoomLevel(1); setPanX(0); setPanY(0); }} className="p-3 bg-white text-slate-700 rounded-xl shadow-lg border border-slate-100 hover:bg-slate-50 active:scale-95 transition-all" title="Réinitialiser">
                      <Locate className="w-5 h-5" />
                   </button>
                   <button onClick={() => setZoomLevel(z => Math.max(z - 0.5, 1))} className="p-3 bg-white text-slate-700 rounded-xl shadow-lg border border-slate-100 hover:bg-slate-50 active:scale-95 transition-all">
                      <ZoomOut className="w-5 h-5" />
                   </button>
                </div>
                
                {/* Légende Zoom */}
                <div className="absolute bottom-6 left-6 z-20 bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-200 text-[9px] font-black text-slate-500 shadow-sm">
                   ZOOM: {zoomLevel.toFixed(1)}x
                </div>
             </div>
           )}
         </>
      )}

      {/* Modals - Optimized for mobile tap targets */}
      {showModal === 'prospect' && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-950/80 backdrop-blur-sm">
           <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-[2.5rem] shadow-2xl overflow-hidden p-6 animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">{editingProspect ? 'Modifier Prospect' : 'Nouveau Prospect'}</h3>
                 <button onClick={() => setShowModal(null)} className="p-2 bg-slate-50 rounded-full"><X className="w-6 h-6 text-slate-300" /></button>
              </div>
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar pb-6">
                 <div><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Entreprise *</label><input type="text" value={prospectForm.companyName || ''} onChange={e => setProspectForm({...prospectForm, companyName: e.target.value})} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold text-sm shadow-inner" placeholder="Nom de l'entreprise" /></div>
                 <div><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Type</label><select value={prospectForm.type || 'Entreprise'} onChange={e => setProspectForm({...prospectForm, type: e.target.value as any})} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold text-sm appearance-none shadow-inner">{PROSPECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                 <div><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Téléphone</label><input type="tel" value={prospectForm.phone || ''} onChange={e => setProspectForm({...prospectForm, phone: e.target.value})} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold text-sm shadow-inner" placeholder="06XXXXXXXX" /></div>
                 <div><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">État</label><select value={prospectForm.status || 'Nouveau Client'} onChange={e => setProspectForm({...prospectForm, status: e.target.value as any})} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold text-sm appearance-none shadow-inner">{PROSPECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                 <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100"><div className="flex items-center space-x-3"><div className={`p-3 rounded-xl ${prospectForm.latitude ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}><MapPin className="w-6 h-6" /></div><div><p className="text-[10px] font-black uppercase text-slate-400">Position GPS *</p><p className="text-xs font-bold text-slate-700">{prospectForm.latitude ? `${prospectForm.latitude.toFixed(4)}, ${prospectForm.longitude?.toFixed(4)}` : 'Non défini (Requis)'}</p></div></div><button onClick={handleGetLocation} type="button" className="px-5 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all shadow-sm active:scale-95">Localiser</button></div>
                 <div><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Agent Assigné *</label><select value={prospectForm.assignedTo || ''} onChange={e => setProspectForm({...prospectForm, assignedTo: e.target.value})} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold text-sm appearance-none shadow-inner"><option value="">Sélectionner un agent...</option>{salesAgents.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
              </div>
              <button onClick={handleSaveProspect} disabled={isSaving} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-sm shadow-xl active:scale-95 transition-transform mt-4">{isSaving ? 'Enregistrement...' : 'Valider Prospect'}</button>
           </div>
        </div>
      )}

      {showModal === 'opportunity' && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-950/80 backdrop-blur-sm">
           <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-[2.5rem] shadow-2xl overflow-hidden p-6 animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-300">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">{editingOpp ? 'Modifier Deal' : 'Nouveau Deal'}</h3>
                 <button onClick={() => setShowModal(null)} className="p-2 bg-slate-50 rounded-full"><X className="w-6 h-6 text-slate-300" /></button>
              </div>
              <div className="space-y-4 pb-6">
                 <div className="relative">
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Prospect / Client</label>
                    <div className="relative group mt-1">
                        <Building2 className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${oppForm.prospectId ? 'text-emerald-500' : 'text-slate-300'}`} />
                        <input 
                            type="text" 
                            placeholder="Chercher client..." 
                            value={prospectSearchQuery}
                            onChange={(e) => {
                                setProspectSearchQuery(e.target.value);
                                setIsProspectListOpen(true);
                                if (oppForm.prospectId) setOppForm({...oppForm, prospectId: ''});
                            }}
                            onFocus={() => setIsProspectListOpen(true)}
                            className={`w-full pl-11 pr-4 py-4 rounded-2xl border-none font-black text-sm shadow-inner transition-all ${oppForm.prospectId ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50'}`}
                        />
                        {oppForm.prospectId && <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />}
                    </div>

                    {isProspectListOpen && prospectSearchQuery.length > 0 && !oppForm.prospectId && (
                        <div className="absolute z-[110] w-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-60 overflow-y-auto">
                            {prospectSearchResults.length > 0 ? (
                                <div className="p-1">
                                    {prospectSearchResults.map(p => (
                                        <button 
                                            key={p.id}
                                            onClick={() => {
                                                setOppForm({...oppForm, prospectId: p.id});
                                                setProspectSearchQuery(p.companyName);
                                                setIsProspectListOpen(false);
                                            }}
                                            className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-indigo-50 transition-colors text-left"
                                        >
                                            <div>
                                                <p className="text-xs font-black text-slate-900 uppercase italic tracking-tight">{p.companyName}</p>
                                                <p className="text-[9px] text-slate-400 font-bold uppercase">{p.phone || 'Sans tel'}</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-slate-200" />
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-6 text-center">
                                    <p className="text-xs font-bold text-slate-400 italic mb-3">Client non trouvé</p>
                                    <button 
                                        onClick={() => { setShowModal('prospect'); setProspectForm({companyName: prospectSearchQuery}); }}
                                        className="inline-flex items-center px-4 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg"
                                    >
                                        <UserPlus className="w-4 h-4 mr-2" /> Créer Fiche Client
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                 </div>

                 <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Offre Orange Pro</label>
                    <select value={oppForm.title || ''} onChange={e => setOppForm({...oppForm, title: e.target.value})} className="w-full p-4 mt-1 rounded-2xl bg-slate-50 border-none font-black text-sm appearance-none cursor-pointer shadow-inner"><option value="">Sélectionner offre...</option>{PRODUCT_OFFERS.map(o => <option key={o.id} value={o.label}>{o.label}</option>)}</select>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Date Cible</label>
                        <input type="date" value={oppForm.expectedCloseDate || ''} onChange={e => setOppForm({...oppForm, expectedCloseDate: e.target.value})} className="w-full p-4 mt-1 rounded-2xl bg-slate-50 border-none font-black text-sm shadow-inner" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Étape</label>
                        <select value={oppForm.stage || 'Lancée'} onChange={e => setOppForm({...oppForm, stage: e.target.value as any})} className="w-full p-4 mt-1 rounded-2xl bg-slate-50 border-none font-black text-sm appearance-none shadow-inner">{STAGES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                    </div>
                 </div>

                 <button onClick={handleSaveOpp} disabled={isSaving || !oppForm.prospectId} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-sm shadow-xl active:scale-95 transition-transform disabled:opacity-30 mt-4">{isSaving ? 'Envoi...' : 'Enregistrer le Deal'}</button>
              </div>
           </div>
        </div>
      )}

      {showModal === 'delete_confirm' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
           <div className="bg-white w-full max-md rounded-[2.5rem] shadow-2xl overflow-hidden p-8 text-center border-4 border-rose-500 animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-6 text-rose-500 shadow-inner">
                 <AlertTriangle className="w-10 h-10 animate-pulse" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter mb-2">Confirmer la suppression ?</h3>
              <p className="text-sm text-slate-500 font-bold leading-relaxed mb-8">
                 Cette action est irréversible. Toutes les données liées à ce prospect ainsi que l'historique des actions seront définitivement supprimés de la base Orange B2B.
              </p>
              <div className="flex flex-col gap-3">
                 <button 
                    onClick={confirmDeleteProspect} 
                    disabled={isSaving}
                    className="w-full py-5 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-rose-100 hover:bg-rose-700 transition-all flex items-center justify-center"
                 >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Supprimer définitivement
                 </button>
                 <button 
                    onClick={() => { setShowModal(null); setProspectToDelete(null); }}
                    className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all"
                 >
                    Annuler
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default B2BProspectApp;
