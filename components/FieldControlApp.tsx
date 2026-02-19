
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, FieldControl, Prospect, Opportunity, ADVOrder, ModulePermissions } from '../types';
import { getCloudData, saveCloudData, addArrayItem } from '../services/database';
import { SALES_AGENTS } from '../constants';
import { 
  ClipboardCheck, MapPin, UserX, Shirt, Save, 
  Loader2, History, ChevronRight, CheckCircle2, XCircle, 
  Map, UserCheck, AlertTriangle, Target, RefreshCcw, LayoutList,
  BarChart3, FileDown, Printer, PieChart as PieIcon, X, Users, Trash2, Edit3,
  TrendingUp, Award, Activity, User as UserIcon, ShieldCheck, PhoneCall, Search,
  AlertOctagon, ShieldAlert, Banknote
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, ComposedChart, Line, Radar, RadarChart, PolarGrid, 
  PolarAngleAxis, PolarRadiusAxis, Treemap
} from 'recharts';

interface FieldControlAppProps {
  user: User;
  salesAgents?: string[];
}

const COLORS = ['#0d9488', '#f43f5e', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1'];

// Interface locale pour les vérifications clients
interface ClientVerification {
  id: string;
  orderId: string;
  clientName: string;
  sellerName: string;
  controllerName: string;
  date: string;
  method: 'Phone' | 'Visit';
  status: 'valid' | 'fake_client' | 'identity_theft' | 'wrong_address' | 'no_order';
  comment: string;
}

// Custom Content for Treemap
const CustomizedTreemapContent = (props: any) => {
  const { root, depth, x, y, width, height, index, name, value, conformity } = props;
  
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill: conformity > 80 ? '#10b981' : conformity > 50 ? '#f59e0b' : '#f43f5e',
          stroke: '#fff',
          strokeWidth: 2 / (depth + 1e-10),
          strokeOpacity: 1 / (depth + 1e-10),
        }}
      />
      {width > 50 && height > 30 && (
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="bold">
          {name}
        </text>
      )}
      {width > 50 && height > 50 && (
        <text x={x + width / 2} y={y + height / 2 + 12} textAnchor="middle" fill="#fff" fontSize={8}>
          {value} ctrls
        </text>
      )}
    </g>
  );
};

const FieldControlApp: React.FC<FieldControlAppProps> = ({ user, salesAgents = SALES_AGENTS }) => {
  const isAdmin = user.role === 'admin';
  const hasPerm = (action: keyof ModulePermissions) => isAdmin || !!user.permissions?.fieldControl?.[action];

  const [activeTab, setActiveTab] = useState<'audit' | 'client_check' | 'history' | 'report'>('audit');
  // Nouvel état pour filtrer l'historique
  const [historyView, setHistoryView] = useState<'individual' | 'team'>('individual');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Data Stores
  const [controls, setControls] = useState<FieldControl[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [orders, setOrders] = useState<ADVOrder[]>([]);
  const [teamsConfig, setTeamsConfig] = useState<any[]>([]); // Stocke la config des équipes
  const [verifications, setVerifications] = useState<ClientVerification[]>([]);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<'individual' | 'team'>('individual');
  const [selectedSeller, setSelectedSeller] = useState<string>(''); // Stocke aussi le nom du superviseur ou de l'équipe
  const [currentZone, setCurrentZone] = useState<string>('');
  const [gpsCoords, setGpsCoords] = useState<{lat: number, lng: number} | null>(null);
  const [comment, setComment] = useState('');
  
  // Compliance State
  const [zoneRespect, setZoneRespect] = useState(true);
  const [supervisorPresent, setSupervisorPresent] = useState(true);
  const [leftZone, setLeftZone] = useState(false);
  const [kitRespect, setKitRespect] = useState(true);

  // Report State
  const [showReportModal, setShowReportModal] = useState(false);

  // Client Check State
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [selectedOrderForCheck, setSelectedOrderForCheck] = useState<ADVOrder | null>(null);
  const [verificationForm, setVerificationForm] = useState<{status: ClientVerification['status'], method: 'Phone' | 'Visit', comment: string}>({
      status: 'valid',
      method: 'Phone',
      comment: ''
  });

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [cData, pData, oData, ordData, tData, vData] = await Promise.all([
          getCloudData('field_controls'),
          getCloudData('b2b_prospects'),
          getCloudData('b2b_opportunities'),
          getCloudData('adv_orders'),
          getCloudData('kpi_teams_config'),
          getCloudData('field_client_verifications')
        ]);
        setControls(cData || []);
        setProspects(pData || []);
        setOpportunities(oData || []);
        setOrders(ordData || []);
        setVerifications(vData || []);
        if (tData && tData.teams) {
            setTeamsConfig(tData.teams);
        }
      } catch (e) {
        console.error("Error loading field data", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // --- DATA MATCHING / KPIs TEMPS RÉEL ---
  const sellerMetrics = useMemo(() => {
    if (!selectedSeller) return { prospects: 0, opportunities: 0, contracts: 0 };

    const todayStr = new Date().toISOString().split('T')[0];
    const normalizeDate = (d: string) => d ? d.split('T')[0] : '';

    // Déterminer la liste des agents à filtrer (1 seul ou toute l'équipe)
    let agentsToFilter: string[] = [];

    if (targetType === 'team') {
        const team = teamsConfig.find(t => t.name === selectedSeller);
        if (team && team.members) {
            agentsToFilter = team.members;
        } else {
            // Fallback si c'est une équipe inconnue ou vide
            agentsToFilter = [selectedSeller];
        }
    } else {
        agentsToFilter = [selectedSeller];
    }

    const dailyProspects = prospects.filter(p => 
      agentsToFilter.includes(p.assignedTo) && normalizeDate(p.createdAt) === todayStr
    ).length;

    const dailyOpps = opportunities.filter(o => 
      agentsToFilter.includes(o.assignedTo) && normalizeDate(o.createdAt) === todayStr
    ).length;

    const dailyContracts = orders.filter(o => 
      agentsToFilter.includes(o.commercial) && normalizeDate(o.dateDepot) === todayStr
    ).length;

    return {
      prospects: dailyProspects,
      opportunities: dailyOpps,
      contracts: dailyContracts
    };
  }, [selectedSeller, targetType, teamsConfig, prospects, opportunities, orders]);

  // --- KPI FRAUDE & RISQUE ---
  const fraudMetrics = useMemo(() => {
      const total = verifications.length;
      const frauds = verifications.filter(v => v.status !== 'valid');
      const fraudCount = frauds.length;
      const fraudRate = total > 0 ? Math.round((fraudCount / total) * 100) : 0;
      
      // Répartition par type
      const breakdown = frauds.reduce((acc, curr) => {
          let label = 'Autre';
          if (curr.status === 'fake_client') label = 'Client Fictif';
          if (curr.status === 'identity_theft') label = 'Usurpation ID';
          if (curr.status === 'wrong_address') label = 'Adresse Fausse';
          if (curr.status === 'no_order') label = 'Nie la commande';
          
          acc[label] = (acc[label] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);

      const chartData = Object.entries(breakdown).map(([name, value], idx) => ({
          name, 
          value,
          fill: COLORS[idx % COLORS.length]
      }));

      return { total, fraudCount, fraudRate, chartData };
  }, [verifications]);

  // --- COMPARATIF CONTROLEURS (Adnane vs Fouad) ---
  const controllerComparisonStats = useMemo(() => {
    const targets = ['Adnane', 'Fouad'];
    return targets.map(name => {
        const agentControls = controls.filter(c => c.controllerName.toLowerCase().includes(name.toLowerCase()));
        const total = agentControls.length;
        const compliant = agentControls.filter(c => c.compliance.zoneRespect && c.compliance.supervisorPresent && !c.compliance.leftZone && c.compliance.kitRespect).length;
        const rate = total > 0 ? Math.round((compliant / total) * 100) : 0;
        
        return {
            name,
            total,
            rate,
            fill: name === 'Adnane' ? '#3b82f6' : '#f97316' // Bleu pour Adnane, Orange pour Fouad
        };
    });
  }, [controls]);

  // --- STATISTICS FOR REPORTING (ADVANCED) ---
  const teamComparisonStats = useMemo(() => {
    if (!teamsConfig.length) return [];

    return teamsConfig.map(team => {
        const members = team.members || [];
        
        // Données Commerciales (Pipeline)
        const teamProspects = prospects.filter(p => members.includes(p.assignedTo)).length;
        const teamOpps = opportunities.filter(o => members.includes(o.assignedTo)).length;
        const teamOrders = orders.filter(o => members.includes(o.commercial)).length; // Signés/Déposés
        
        // Conversion (Signés / Prospects)
        const conversionRate = teamProspects > 0 ? Math.round((teamOrders / teamProspects) * 100) : 0;

        // Données Qualité (Contrôles)
        const teamControls = controls.filter(c => members.includes(c.sellerName) || c.sellerName === team.name);
        const totalChecks = teamControls.length;
        
        // Calcul des scores moyens (0-100)
        const zoneScore = totalChecks > 0 ? (teamControls.filter(c => c.compliance.zoneRespect).length / totalChecks) * 100 : 0;
        const kitScore = totalChecks > 0 ? (teamControls.filter(c => c.compliance.kitRespect).length / totalChecks) * 100 : 0;
        const supScore = totalChecks > 0 ? (teamControls.filter(c => c.compliance.supervisorPresent).length / totalChecks) * 100 : 0;
        
        // Score Global Qualité
        const globalQuality = Math.round((zoneScore + kitScore + supScore) / 3);

        return {
            name: team.name,
            prospects: teamProspects,
            opportunities: teamOpps,
            orders: teamOrders,
            conversion: conversionRate,
            quality: globalQuality,
            radarData: [
                { subject: 'Respect Zone', A: Math.round(zoneScore), fullMark: 100 },
                { subject: 'Port du Kit', A: Math.round(kitScore), fullMark: 100 },
                { subject: 'Supervision', A: Math.round(supScore), fullMark: 100 },
                { subject: 'Discipline', A: totalChecks > 0 ? Math.round((teamControls.filter(c => !c.compliance.leftZone).length / totalChecks) * 100) : 0, fullMark: 100 },
            ]
        };
    });
  }, [teamsConfig, prospects, opportunities, orders, controls]);

  const zoneAnalysis = useMemo(() => {
      const zoneMap: Record<string, { count: number, complianceSum: number }> = {};
      
      controls.forEach(c => {
          const zoneName = c.zone || 'Inconnue';
          if (!zoneMap[zoneName]) zoneMap[zoneName] = { count: 0, complianceSum: 0 };
          
          zoneMap[zoneName].count++;
          // Un contrôle est conforme si tout est OK
          const isCompliant = c.compliance.zoneRespect && c.compliance.supervisorPresent && !c.compliance.leftZone && c.compliance.kitRespect;
          if (isCompliant) zoneMap[zoneName].complianceSum++;
      });

      // Format pour Treemap
      return Object.entries(zoneMap).map(([name, data]) => ({
          name,
          size: data.count, // Taille du carré = Volume de contrôles
          conformity: Math.round((data.complianceSum / data.count) * 100) // Couleur = Qualité
      })).sort((a, b) => b.size - a.size);
  }, [controls]);

  // --- ACTIONS ---

  const handleGetLocation = () => {
    if (!navigator.geolocation) return alert("Géolocalisation non supportée.");
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
      },
      (err) => {
        alert("Erreur GPS: " + err.message);
        setIsLocating(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const resetForm = () => {
    setEditingId(null);
    setSelectedSeller('');
    setCurrentZone('');
    setComment('');
    setGpsCoords(null);
    setZoneRespect(true);
    setSupervisorPresent(true);
    setLeftZone(false);
    setKitRespect(true);
    setTargetType('individual');
  };

  const handleSaveControl = async () => {
    if (!selectedSeller) return alert("Veuillez sélectionner une cible.");
    if (!currentZone) return alert("Veuillez indiquer la zone actuelle.");
    if (!editingId && !hasPerm('create')) return alert("Permission refusée.");
    if (editingId && !hasPerm('update')) return alert("Permission refusée.");

    setIsSaving(true);
    
    const controlData: FieldControl = {
      id: editingId || Math.random().toString(36).substr(2, 9),
      targetType: targetType,
      controllerName: user.associatedAgentName || user.username,
      sellerName: selectedSeller,
      date: new Date().toISOString(),
      zone: currentZone,
      gpsLat: gpsCoords?.lat,
      gpsLng: gpsCoords?.lng,
      compliance: {
        zoneRespect,
        supervisorPresent,
        leftZone,
        kitRespect
      },
      metricsAtControlTime: {
        prospectsCount: sellerMetrics.prospects,
        opportunitiesCount: sellerMetrics.opportunities,
        contractsCount: sellerMetrics.contracts
      },
      comment
    };

    try {
      let updatedControls;
      if (editingId) {
        updatedControls = controls.map(c => c.id === editingId ? controlData : c);
      } else {
        updatedControls = [controlData, ...controls];
      }
      
      await saveCloudData('field_controls', updatedControls);
      setControls(updatedControls);
      
      resetForm();
      setActiveTab('history');
    } catch (e) {
      console.error("Save error", e);
      alert("Erreur lors de l'enregistrement. Vérifiez votre connexion.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditControl = (ctrl: FieldControl) => {
    setEditingId(ctrl.id);
    setTargetType(ctrl.targetType || 'individual');
    setSelectedSeller(ctrl.sellerName);
    setCurrentZone(ctrl.zone);
    setComment(ctrl.comment);
    setGpsCoords(ctrl.gpsLat && ctrl.gpsLng ? { lat: ctrl.gpsLat, lng: ctrl.gpsLng } : null);
    
    setZoneRespect(ctrl.compliance.zoneRespect);
    setSupervisorPresent(ctrl.compliance.supervisorPresent);
    setLeftZone(ctrl.compliance.leftZone);
    setKitRespect(ctrl.compliance.kitRespect);
    
    setActiveTab('audit');
  };

  const handleDeleteControl = async (id: string) => {
    if (!hasPerm('delete')) return alert("Permission refusée.");
    if (!confirm("Supprimer ce contrôle définitivement ?")) return;

    const updatedControls = controls.filter(c => c.id !== id);
    setControls(updatedControls);
    await saveCloudData('field_controls', updatedControls);
  };

  // --- ACTIONS CLIENT CHECK ---
  const handleSaveClientCheck = async () => {
      if (!selectedOrderForCheck) return;
      if (!verificationForm.status) return alert("Statut requis");

      setIsSaving(true);
      try {
          const newVerification: ClientVerification = {
              id: Math.random().toString(36).substr(2, 9),
              orderId: selectedOrderForCheck.id,
              clientName: selectedOrderForCheck.raisonSociale,
              sellerName: selectedOrderForCheck.commercial,
              controllerName: user.associatedAgentName || user.username,
              date: new Date().toISOString(),
              method: verificationForm.method,
              status: verificationForm.status,
              comment: verificationForm.comment
          };

          const updatedVerifications = [newVerification, ...verifications];
          setVerifications(updatedVerifications);
          await saveCloudData('field_client_verifications', updatedVerifications);
          
          setSelectedOrderForCheck(null);
          setVerificationForm({ status: 'valid', method: 'Phone', comment: '' });
          alert("Vérification enregistrée.");
      } catch (e) {
          console.error(e);
          alert("Erreur sauvegarde.");
      } finally {
          setIsSaving(false);
      }
  };

  const filteredOrdersForCheck = useMemo(() => {
      const search = clientSearchTerm.toLowerCase();
      // FILTRE STRICT : UNIQUEMENT LES DOSSIERS ANNULÉS
      return orders.filter(o => {
          // Normalisation pour attraper "ANNULÉ", "Annulé", "Annulé Technique" etc.
          const isCancelled = o.validation === 'ANNULÉ' || (o.statutSi && o.statutSi.toLowerCase().includes('annul'));
          
          if (!isCancelled) return false;

          const matchSearch = (o.raisonSociale || '').toLowerCase().includes(search) || 
                              (o.refContrat || '').toLowerCase().includes(search) ||
                              (o.commercial || '').toLowerCase().includes(search);
          return matchSearch; 
      }).slice(0, 50); // Limite pour perf
  }, [orders, clientSearchTerm]);

  const handleExportCSV = () => {
    if (controls.length === 0) return alert("Aucune donnée.");
    const headers = ['Date', 'Type', 'Controleur', 'Cible', 'Zone', 'Conforme', 'Hors Zone', 'Sans Sup.', 'Sortie Zone', 'Sans Kit', 'Commentaire'];
    const csvContent = [
        headers.join(';'),
        ...controls.map(c => [
            new Date(c.date).toLocaleDateString(),
            c.targetType === 'team' ? 'EQUIPE' : 'INDIVIDUEL',
            c.controllerName,
            c.sellerName,
            c.zone,
            (c.compliance.zoneRespect && c.compliance.supervisorPresent && !c.compliance.leftZone && c.compliance.kitRespect) ? 'OUI' : 'NON',
            !c.compliance.zoneRespect ? 'OUI' : 'NON',
            !c.compliance.supervisorPresent ? 'OUI' : 'NON',
            c.compliance.leftZone ? 'OUI' : 'NON',
            !c.compliance.kitRespect ? 'OUI' : 'NON',
            `"${c.comment.replace(/"/g, '""')}"`
        ].join(';'))
    ].join('\n');

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Controles_Terrain_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Liste des agents qui ne sont dans aucune équipe configurée
  const unassignedAgents = useMemo(() => {
    const assigned = new Set(teamsConfig.flatMap(t => t.members));
    return salesAgents.filter(a => !assigned.has(a));
  }, [teamsConfig]);

  // --- RENDERERS ---

  const ToggleButton = ({ label, value, onChange, icon: Icon, reversed = false }: any) => {
    const isGood = reversed ? !value : value;
    return (
      <button 
        onClick={() => onChange(!value)}
        className={`w-full p-4 rounded-2xl border-2 flex items-center justify-between transition-all active:scale-95 shadow-sm ${
          isGood 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isGood ? 'bg-emerald-100' : 'bg-rose-100'}`}>
            <Icon className="w-5 h-5" />
          </div>
          <span className="font-black uppercase text-xs tracking-wide">{label}</span>
        </div>
        <div className={`text-xs font-black uppercase px-3 py-1 rounded-lg ${isGood ? 'bg-emerald-200' : 'bg-rose-200'}`}>
          {value ? 'OUI' : 'NON'}
        </div>
      </button>
    );
  };

  const filteredHistory = useMemo(() => {
    return controls
      .filter(c => historyView === 'team' ? c.targetType === 'team' : c.targetType !== 'team')
      .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [controls, historyView]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col font-['Plus_Jakarta_Sans'] pb-20 md:pb-0 md:max-w-4xl md:px-6 md:py-8">
      
      {/* HEADER */}
      <div className="bg-slate-900 text-white p-6 rounded-b-[2rem] md:rounded-[2rem] shadow-xl flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-teal-400" /> Contrôle Terrain
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Audit Qualité & Conformité</p>
        </div>
        {isAdmin && <div className="bg-white/10 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider">Admin View</div>}
      </div>

      {/* TABS */}
      <div className="px-4 md:px-0 mb-6">
        <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex overflow-x-auto">
          <button onClick={() => { setActiveTab('audit'); resetForm(); }} className={`flex-1 py-3 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'audit' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-400'}`}>
            <Target className="w-4 h-4" /> Nouveau
          </button>
          <button onClick={() => setActiveTab('client_check')} className={`flex-1 py-3 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'client_check' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-400'}`}>
            <ShieldAlert className="w-4 h-4" /> Fraude & Clients
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'history' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}>
            <History className="w-4 h-4" /> Historique
          </button>
          <button onClick={() => setShowReportModal(true)} className={`flex-1 py-3 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 whitespace-nowrap text-slate-400 hover:text-indigo-600`}>
            <BarChart3 className="w-4 h-4" /> Rapports
          </button>
        </div>
      </div>

      {activeTab === 'audit' && (
        <div className="px-4 md:px-0 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          
          {/* SELECTION & LOCATION */}
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-teal-500" /> Identification {editingId ? "(Modification)" : ""}
            </h3>
            
            <div className="flex bg-slate-100 p-1 rounded-xl mb-2">
               <button onClick={() => { setTargetType('individual'); setSelectedSeller(''); }} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${targetType === 'individual' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400'}`}>Individuel</button>
               <button onClick={() => { setTargetType('team'); setSelectedSeller(''); }} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${targetType === 'team' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>Équipe</button>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">{targetType === 'team' ? 'Équipe à évaluer' : 'Vendeur Audité'}</label>
              <select 
                value={selectedSeller} 
                onChange={e => setSelectedSeller(e.target.value)}
                className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold text-sm text-slate-700 appearance-none shadow-inner focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">-- Sélectionner --</option>
                {targetType === 'team' ? (
                    // Affichage des équipes seulement
                    teamsConfig.map(team => (
                        <option key={team.id} value={team.name}>{team.name}</option>
                    ))
                ) : (
                    // Affichage des vendeurs groupés par équipe
                    <>
                        {teamsConfig.map(team => (
                            <optgroup key={team.id} label={team.name}>
                                {team.members.map((member: string) => (
                                    <option key={member} value={member}>{member}</option>
                                ))}
                            </optgroup>
                        ))}
                        {unassignedAgents.length > 0 && (
                            <optgroup label="Sans Équipe">
                                {unassignedAgents.map(agent => (
                                    <option key={agent} value={agent}>{agent}</option>
                                ))}
                            </optgroup>
                        )}
                        {teamsConfig.length === 0 && unassignedAgents.length === 0 && (
                            // Fallback si pas de config équipe
                            salesAgents.map(agent => <option key={agent} value={agent}>{agent}</option>)
                        )}
                    </>
                )}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Zone de Travail</label>
              <input 
                type="text" 
                placeholder="Ex: Maârif, Sidi Bernoussi..." 
                value={currentZone}
                onChange={e => setCurrentZone(e.target.value)}
                className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold text-sm text-slate-700 shadow-inner"
              />
            </div>

            <button 
              onClick={handleGetLocation}
              disabled={isLocating}
              className={`w-full py-3 rounded-xl border-2 border-dashed font-black uppercase text-xs flex items-center justify-center gap-2 transition-all ${gpsCoords ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-300 text-slate-400'}`}
            >
              {isLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              {gpsCoords ? "Position GPS Verrouillée" : "Géolocaliser le contrôle"}
            </button>
          </div>

          {/* REAL-TIME DATA MATCHING */}
          {selectedSeller && (
            <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-[2rem] shadow-sm animate-in fade-in zoom-in duration-300">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-xs font-black text-indigo-900 uppercase tracking-widest flex items-center gap-2">
                   <LayoutList className="w-4 h-4" /> Activité du jour {targetType === 'team' ? '(Global Équipe)' : '(Système)'}
                 </h3>
                 <span className="bg-indigo-200 text-indigo-800 text-[9px] font-bold px-2 py-1 rounded-md">LIVE DATA</span>
               </div>
               <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white p-3 rounded-2xl text-center shadow-sm">
                     <span className="block text-2xl font-black text-indigo-600">{sellerMetrics.prospects}</span>
                     <span className="text-[9px] font-bold text-slate-400 uppercase">Prospects</span>
                  </div>
                  <div className="bg-white p-3 rounded-2xl text-center shadow-sm">
                     <span className="block text-2xl font-black text-purple-600">{sellerMetrics.opportunities}</span>
                     <span className="text-[9px] font-bold text-slate-400 uppercase">Deals</span>
                  </div>
                  <div className="bg-white p-3 rounded-2xl text-center shadow-sm">
                     <span className="block text-2xl font-black text-[#ff7900]">{sellerMetrics.contracts}</span>
                     <span className="text-[9px] font-bold text-slate-400 uppercase">Contrats</span>
                  </div>
               </div>
               <p className="text-[9px] text-indigo-400 mt-3 text-center italic">
                 Vérifiez si ces chiffres correspondent aux déclarations verbales.
               </p>
            </div>
          )}

          {/* CHECKLIST */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest ml-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" /> Conformité
            </h3>
            
            <ToggleButton label="Zone Respectée ?" value={zoneRespect} onChange={setZoneRespect} icon={Map} />
            <ToggleButton label="Présence Superviseur ?" value={supervisorPresent} onChange={setSupervisorPresent} icon={UserCheck} />
            <ToggleButton label="Sortie de Zone ?" value={leftZone} onChange={setLeftZone} icon={UserX} reversed={true} />
            <ToggleButton label="Tenue / Kit ?" value={kitRespect} onChange={setKitRespect} icon={Shirt} />
          </div>

          {/* COMMENTAIRE & SUBMIT */}
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
             <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Observations</label>
                <textarea 
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold text-sm text-slate-700 shadow-inner h-24 resize-none"
                  placeholder="Remarques sur le comportement, l'argumentaire..."
                ></textarea>
             </div>
          </div>

          <div className="pt-4 pb-8 flex gap-3">
             {editingId && (
               <button onClick={resetForm} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-sm tracking-widest shadow-sm">
                 Annuler
               </button>
             )}
             <button onClick={handleSaveControl} disabled={isSaving} className="flex-grow py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-70">
               {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
               {editingId ? "Mettre à jour" : "Valider le Contrôle"}
             </button>
          </div>
        </div>
      )}

      {activeTab === 'client_check' && (
        <div className="px-4 md:px-0 space-y-6 animate-in slide-in-from-right-4 duration-500">
            <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
               <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2 mb-4">
                  <ShieldAlert className="w-4 h-4 text-rose-500" /> Vérification Clients (Dossiers Annulés)
               </h3>
               
               {/* Recherche */}
               <div className="relative mb-4">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="text" 
                    placeholder="Chercher client annulé, contrat..."
                    value={clientSearchTerm}
                    onChange={e => setClientSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border-none font-bold text-xs text-slate-700 shadow-inner"
                  />
               </div>

               {/* Liste des commandes à vérifier */}
               <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                  {filteredOrdersForCheck.map(order => {
                      const check = verifications.find(v => v.orderId === order.id);
                      return (
                          <div 
                            key={order.id} 
                            onClick={() => setSelectedOrderForCheck(order)}
                            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${selectedOrderForCheck?.id === order.id ? 'border-rose-500 bg-rose-50' : 'border-slate-100 bg-white hover:border-rose-200'}`}
                          >
                             <div className="flex justify-between items-start">
                                <div>
                                   <p className="text-xs font-black text-slate-900 uppercase">{order.raisonSociale}</p>
                                   <p className="text-[10px] font-bold text-slate-400">{order.refContrat}</p>
                                   {order.raisonBlocageSi && <span className="text-[9px] text-rose-500 font-bold block mt-1 italic">{order.raisonBlocageSi}</span>}
                                   {order.raisonBlocage && <span className="text-[9px] text-orange-500 font-bold block mt-1 italic">{order.raisonBlocage}</span>}
                                </div>
                                {check ? (
                                    <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${check.status === 'valid' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                        {check.status === 'valid' ? 'Vérifié OK' : 'FRAUDE'}
                                    </span>
                                ) : (
                                    <span className="px-2 py-1 rounded bg-slate-100 text-slate-500 text-[8px] font-black uppercase">À vérifier</span>
                                )}
                             </div>
                             <div className="flex justify-between items-end mt-2">
                                <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{order.commercial}</span>
                                <span className="text-[9px] font-mono text-slate-400">{order.telephone}</span>
                             </div>
                          </div>
                      );
                  })}
                  {filteredOrdersForCheck.length === 0 && (
                      <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase tracking-widest">
                          Aucun dossier annulé trouvé.
                      </div>
                  )}
               </div>
            </div>

            {/* Formulaire de Vérification (Si commande sélectionnée) */}
            {selectedOrderForCheck && (
                <div className="bg-rose-50 p-5 rounded-[2rem] border border-rose-100 shadow-lg animate-in slide-in-from-bottom-10">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="text-xs font-black text-rose-900 uppercase tracking-widest">Résultat du contrôle</h4>
                        <button onClick={() => setSelectedOrderForCheck(null)} className="p-1 bg-white rounded-full text-rose-300 hover:text-rose-600"><X className="w-4 h-4" /></button>
                    </div>

                    {/* Bloc Détails Commande */}
                    <div className="bg-white p-4 rounded-xl border border-rose-100 mb-4 shadow-sm">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Client</p>
                                <p className="text-xs font-black text-slate-900 truncate">{selectedOrderForCheck.raisonSociale}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Téléphone</p>
                                <p className="text-xs font-black text-slate-900 font-mono tracking-tight">{selectedOrderForCheck.telephone}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Offre Souscrite</p>
                                <p className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded inline-block border border-indigo-100">{selectedOrderForCheck.offre}</p>
                            </div>
                             <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Vendeur</p>
                                <p className="text-xs font-bold text-slate-700">{selectedOrderForCheck.commercial}</p>
                            </div>
                             <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Réf.</p>
                                <p className="text-xs font-bold text-slate-500 font-mono">{selectedOrderForCheck.refContrat}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <div>
                            <label className="text-[9px] font-black uppercase text-rose-800 ml-2">Méthode</label>
                            <div className="flex bg-white p-1 rounded-xl border border-rose-100">
                                <button onClick={() => setVerificationForm(p => ({...p, method: 'Phone'}))} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center gap-2 ${verificationForm.method === 'Phone' ? 'bg-rose-500 text-white' : 'text-slate-400'}`}><PhoneCall className="w-3 h-3" /> Appel</button>
                                <button onClick={() => setVerificationForm(p => ({...p, method: 'Visit'}))} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center gap-2 ${verificationForm.method === 'Visit' ? 'bg-rose-500 text-white' : 'text-slate-400'}`}><MapPin className="w-3 h-3" /> Visite</button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[9px] font-black uppercase text-rose-800 ml-2">Verdict</label>
                            <select 
                                value={verificationForm.status} 
                                onChange={e => setVerificationForm(p => ({...p, status: e.target.value as any}))}
                                className="w-full p-3 rounded-xl bg-white border border-rose-100 font-bold text-xs text-slate-700"
                            >
                                <option value="valid">✅ Client Confirmé (Annulation réelle)</option>
                                <option value="identity_theft">⚠️ Usurpation d'identité</option>
                                <option value="fake_client">⛔ Client Inexistant (Faux)</option>
                                <option value="wrong_address">❌ Adresse Fausse / Incomplète</option>
                                <option value="no_order">❓ Client réel mais nie la commande</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[9px] font-black uppercase text-rose-800 ml-2">Commentaire / Preuve</label>
                            <textarea 
                                value={verificationForm.comment}
                                onChange={e => setVerificationForm(p => ({...p, comment: e.target.value}))}
                                className="w-full p-3 rounded-xl bg-white border border-rose-100 font-medium text-xs h-20 resize-none"
                                placeholder="Détails de l'appel ou de la visite..."
                            />
                        </div>

                        <button 
                            onClick={handleSaveClientCheck}
                            disabled={isSaving}
                            className="w-full py-4 bg-rose-600 text-white rounded-xl font-black uppercase text-xs shadow-lg hover:bg-rose-700 transition-all flex items-center justify-center gap-2"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertOctagon className="w-4 h-4" />}
                            Enregistrer le Contrôle
                        </button>
                    </div>
                </div>
            )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="px-4 md:px-0 space-y-4 animate-in fade-in duration-500">
           {/* VIEW SELECTOR */}
           <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm mb-4">
              <button 
                onClick={() => setHistoryView('individual')} 
                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${historyView === 'individual' ? 'bg-teal-50 text-teal-600 border border-teal-100 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                 <UserIcon className="w-4 h-4" /> Vendeurs
              </button>
              <button 
                onClick={() => setHistoryView('team')} 
                className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${historyView === 'team' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                 <Users className="w-4 h-4" /> Équipes
              </button>
           </div>

           {filteredHistory.map((ctrl) => {
             const isCompliant = ctrl.compliance.zoneRespect && ctrl.compliance.supervisorPresent && !ctrl.compliance.leftZone && ctrl.compliance.kitRespect;
             const isTeam = ctrl.targetType === 'team';
             return (
               <div key={ctrl.id} className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100 relative overflow-hidden group">
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${isCompliant ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                  
                  {/* Action Buttons (visible on hover/focus) */}
                  <div className="absolute top-4 right-4 flex space-x-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                     <button onClick={() => handleEditControl(ctrl)} className="p-2 bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-full transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                     <button onClick={() => handleDeleteControl(ctrl.id)} className="p-2 bg-slate-100 text-slate-500 hover:text-rose-600 rounded-full transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>

                  <div className="flex justify-between items-start mb-4 pl-3">
                     <div>
                        <div className="flex items-center space-x-2">
                           <h4 className="text-sm font-black text-slate-900 uppercase">{ctrl.sellerName}</h4>
                           {isTeam && <span className="bg-indigo-50 text-indigo-600 text-[8px] font-black px-1.5 py-0.5 rounded border border-indigo-100 uppercase flex items-center"><Users className="w-2.5 h-2.5 mr-1" /> Team</span>}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(ctrl.date).toLocaleDateString('fr-FR')}</p>
                     </div>
                     <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${isCompliant ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{isCompliant ? 'CONFORME' : 'NON-CONFORME'}</span>
                  </div>
                  <div className="pl-3 grid grid-cols-2 gap-4 mb-4">
                     <div className="bg-slate-50 p-3 rounded-xl"><p className="text-[9px] text-slate-400 font-bold uppercase">Zone</p><p className="text-xs font-black text-slate-700 truncate">{ctrl.zone}</p></div>
                     <div className="bg-slate-50 p-3 rounded-xl"><p className="text-[9px] text-slate-400 font-bold uppercase">Contrôleur</p><p className="text-xs font-black text-slate-700 truncate">{ctrl.controllerName}</p></div>
                  </div>
                  <div className="pl-3 flex flex-wrap gap-2 mb-4">
                     {!ctrl.compliance.zoneRespect && <span className="px-2 py-1 bg-rose-50 text-rose-600 text-[9px] font-bold rounded border border-rose-100">Hors Zone</span>}
                     {!ctrl.compliance.supervisorPresent && <span className="px-2 py-1 bg-rose-50 text-rose-600 text-[9px] font-bold rounded border border-rose-100">Sans Sup.</span>}
                     {ctrl.compliance.leftZone && <span className="px-2 py-1 bg-rose-50 text-rose-600 text-[9px] font-bold rounded border border-rose-100">Sortie Zone</span>}
                     {!ctrl.compliance.kitRespect && <span className="px-2 py-1 bg-rose-50 text-rose-600 text-[9px] font-bold rounded border border-rose-100">No Kit</span>}
                     {isCompliant && <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded border border-emerald-100 flex items-center"><CheckCircle2 className="w-3 h-3 mr-1" /> RAS</span>}
                  </div>
                  {ctrl.comment && <div className="pl-3 bg-slate-50 p-3 rounded-xl mb-4"><p className="text-xs font-medium text-slate-600 italic">"{ctrl.comment}"</p></div>}
               </div>
             )
           })}
           {filteredHistory.length === 0 && (
             <div className="text-center py-20">
                <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                   Aucun contrôle {historyView === 'team' ? 'équipe' : 'vendeur'} enregistré
                </p>
             </div>
           )}
        </div>
      )}

      {/* REPORTING MODAL - NEW DESIGN */}
      {showReportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:bg-white">
           <div className="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print:h-auto print:shadow-none print:max-w-none print:rounded-none">
              
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 print:bg-white">
                 <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><TrendingUp className="w-6 h-6" /></div>
                    <div>
                        <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Performance & Qualité</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Comparatif Équipes & Zones</p>
                    </div>
                 </div>
                 <button onClick={() => setShowReportModal(false)} className="print:hidden p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8 print:overflow-visible">
                 
                 {/* 1. KPIs ANALYTIQUES FRAUDE (NOUVEAU) */}
                 <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
                    <div className="mb-6 flex justify-between items-center">
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center">
                            <ShieldAlert className="w-4 h-4 mr-2 text-rose-500" /> Analyse Anti-Fraude & Risques
                        </h4>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* KPIs Metrics */}
                        <div className="flex flex-col gap-4">
                            <div className="bg-rose-50 p-5 rounded-2xl border border-rose-100">
                                <p className="text-[9px] font-bold uppercase text-slate-400 tracking-widest">Taux de Fraude</p>
                                <p className="text-3xl font-black text-rose-600 mt-2">{fraudMetrics.fraudRate}%</p>
                                <p className="text-[9px] font-bold text-rose-400 mt-1">{fraudMetrics.fraudCount} dossiers rejetés</p>
                            </div>
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex items-center justify-between">
                                <div>
                                    <p className="text-[9px] font-bold uppercase text-slate-400 tracking-widest">Total Vérifications</p>
                                    <p className="text-2xl font-black text-slate-900 mt-1">{fraudMetrics.total}</p>
                                </div>
                                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-slate-400 shadow-sm border border-slate-100">
                                    <Search className="w-6 h-6" />
                                </div>
                            </div>
                        </div>
                        {/* Chart Breakdown */}
                        <div className="h-48 relative">
                            {fraudMetrics.fraudCount > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie 
                                            data={fraudMetrics.chartData} 
                                            dataKey="value" 
                                            nameKey="name" 
                                            cx="50%" 
                                            cy="50%" 
                                            innerRadius={40} 
                                            outerRadius={60} 
                                            paddingAngle={5}
                                        >
                                            {fraudMetrics.chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} 
                                            itemStyle={{fontSize: '11px', fontWeight: 'bold'}}
                                        />
                                        <Legend 
                                            layout="vertical" 
                                            verticalAlign="middle" 
                                            align="right"
                                            iconType="circle"
                                            formatter={(value, entry: any) => <span className="text-[10px] font-bold text-slate-600 ml-1">{value} ({entry.payload.value})</span>} 
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <ShieldCheck className="w-10 h-10 text-emerald-200 mb-2" />
                                    <p className="text-xs font-bold text-slate-400 uppercase">Aucune fraude détectée</p>
                                </div>
                            )}
                        </div>
                    </div>
                 </div>

                 {/* 2. Top KPIs QUALITE (EXISTANT) */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-900 text-white p-6 rounded-[2rem] shadow-lg flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Qualité Globale Terrain</p>
                            <p className="text-4xl font-black mt-2">
                                {controls.length > 0 ? Math.round((controls.filter(c => c.compliance.zoneRespect && c.compliance.kitRespect).length / controls.length) * 100) : 0}%
                            </p>
                        </div>
                        <div className="p-3 bg-white/10 rounded-xl"><Award className="w-8 h-8 text-yellow-400" /></div>
                    </div>
                    <div className="bg-indigo-50 text-indigo-900 p-6 rounded-[2rem] shadow-sm border border-indigo-100 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Total Contrôles</p>
                            <p className="text-4xl font-black mt-2">{controls.length}</p>
                        </div>
                        <div className="p-3 bg-white rounded-xl"><ClipboardCheck className="w-8 h-8 text-indigo-500" /></div>
                    </div>
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Meilleure Équipe (Qualité)</p>
                            <p className="text-xl font-black text-slate-900 mt-2 truncate max-w-[150px]">
                                {[...teamComparisonStats].sort((a,b) => b.quality - a.quality)[0]?.name || '-'}
                            </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl"><Users className="w-8 h-8 text-slate-400" /></div>
                    </div>
                 </div>

                 {/* Comparatif Contrôleurs (Adnane vs Fouad) */}
                 <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
                    <div className="mb-6 flex justify-between items-center">
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center">
                            <ShieldCheck className="w-4 h-4 mr-2 text-indigo-500" /> Performance Contrôleurs (Adnane vs Fouad)
                        </h4>
                    </div>
                    <div className="flex flex-col md:flex-row gap-8 items-center">
                        {/* Cards */}
                        <div className="flex-1 w-full grid grid-cols-2 gap-4">
                            {controllerComparisonStats.map((stat) => (
                                <div key={stat.name} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black mb-2 ${stat.name === 'Adnane' ? 'bg-blue-500' : 'bg-orange-500'}`}>
                                        {stat.name.charAt(0)}
                                    </div>
                                    <span className="text-xs font-black uppercase text-slate-700">{stat.name}</span>
                                    <div className="mt-2 text-center">
                                        <span className="block text-2xl font-black text-slate-900">{stat.total}</span>
                                        <span className="text-[9px] text-slate-400 font-bold uppercase">Contrôles</span>
                                    </div>
                                    <div className="mt-2 px-3 py-1 rounded-full bg-white border border-slate-200 text-[10px] font-black">
                                        Qualité: <span className={stat.rate > 80 ? 'text-emerald-500' : 'text-rose-500'}>{stat.rate}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Chart */}
                        <div className="flex-1 h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={controllerComparisonStats} layout="vertical" margin={{ left: 0, right: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={60} tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px'}} />
                                    <Bar dataKey="total" name="Volume" radius={[0, 4, 4, 0]} barSize={20} label={{ position: 'right', fontSize: 10, fontWeight: 'bold', fill: '#64748b' }}>
                                        {controllerComparisonStats.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                 </div>

                 {/* Charts Row */}
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* 1. Comparatif Pipeline & Conversion */}
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
                        <div className="mb-6 flex justify-between items-center">
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center">
                                <BarChart3 className="w-4 h-4 mr-2 text-indigo-500" /> Comparatif Pipeline Commercial
                            </h4>
                            <span className="text-[9px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-500">Vol. vs Taux Transfo</span>
                        </div>
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={teamComparisonStats} margin={{top: 20, right: 30, left: 20, bottom: 20}}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis 
                                      dataKey="name" 
                                      tick={{fontSize: 10, fontWeight: 'bold'}} 
                                      interval={0} // Force display of all labels
                                      angle={-30} 
                                      textAnchor="end" 
                                      height={70} 
                                    />
                                    <YAxis yAxisId="left" orientation="left" stroke="#94a3b8" fontSize={10} />
                                    <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" fontSize={10} unit="%" />
                                    <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 'bold'}} />
                                    <Bar yAxisId="left" dataKey="prospects" name="Prospects" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={20} />
                                    <Bar yAxisId="left" dataKey="opportunities" name="Opportunités" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
                                    <Line yAxisId="right" type="monotone" dataKey="conversion" name="Taux Conversion" stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* 2. Radar Qualité */}
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col">
                        <div className="mb-6">
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center">
                                <Activity className="w-4 h-4 mr-2 text-rose-500" /> Radar Qualité (Top Équipes)
                            </h4>
                        </div>
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%">
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{fontSize: '10px'}} />
                                    {teamComparisonStats.slice(0, 3).map((team, idx) => (
                                        <Radar
                                            key={team.name}
                                            name={team.name}
                                            dataKey="A"
                                            data={team.radarData}
                                            stroke={COLORS[idx % COLORS.length]}
                                            fill={COLORS[idx % COLORS.length]}
                                            fillOpacity={0.1}
                                        />
                                    ))}
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                 </div>

                 {/* 3. Analyse Zones (Treemap) */}
                 <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
                    <div className="mb-6 flex items-center justify-between">
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center">
                            <MapPin className="w-4 h-4 mr-2 text-emerald-500" /> Cartographie des Zones (Volume & Conformité)
                        </h4>
                        <div className="flex gap-2 text-[9px] font-bold text-slate-500 uppercase">
                            <span className="flex items-center"><span className="w-2 h-2 bg-emerald-500 rounded-full mr-1"></span> &gt;80%</span>
                            <span className="flex items-center"><span className="w-2 h-2 bg-amber-500 rounded-full mr-1"></span> 50-80%</span>
                            <span className="flex items-center"><span className="w-2 h-2 bg-rose-500 rounded-full mr-1"></span> &lt;50%</span>
                        </div>
                    </div>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <Treemap
                                data={zoneAnalysis}
                                dataKey="size"
                                stroke="#fff"
                                fill="#8884d8"
                                content={<CustomizedTreemapContent />}
                            >
                                <Tooltip 
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white p-3 rounded-xl shadow-xl border border-slate-100 text-xs">
                                                    <p className="font-black uppercase text-slate-900">{data.name}</p>
                                                    <p className="text-slate-500">Contrôles : <span className="font-bold">{data.value}</span></p>
                                                    <p className="text-slate-500">Conformité : <span className={`font-bold ${data.conformity > 80 ? 'text-emerald-500' : 'text-rose-500'}`}>{data.conformity}%</span></p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                            </Treemap>
                        </ResponsiveContainer>
                    </div>
                 </div>

              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 print:hidden">
                 <button onClick={handleExportCSV} className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black uppercase text-xs hover:bg-slate-100 transition-colors flex items-center justify-center"><FileDown className="w-4 h-4 mr-2" /> Export Données</button>
                 <button onClick={() => window.print()} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-teal-600 transition-all flex items-center justify-center"><Printer className="w-4 h-4 mr-2" /> Imprimer Rapport</button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default FieldControlApp;
