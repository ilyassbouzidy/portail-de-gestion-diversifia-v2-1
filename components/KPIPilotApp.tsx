
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, ADVOrder, SalesData, Prospect, Opportunity } from '../types';
import { getCloudData, saveCloudData, safeJSON } from '../services/database';
import { SALES_AGENTS } from '../constants'; // Import pour la liste complète des agents disponibles
import { GoogleGenerativeAI as GoogleGenAI } from "@google/generative-ai";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, Legend, Line, ComposedChart
} from 'recharts';
import { 
  Activity, Target, TrendingUp, Users, AlertTriangle, 
  BrainCircuit, Sparkles, Send, Bot, RotateCcw, 
  Calendar, ArrowUpRight, ArrowDownRight, Zap,
  BarChart3, PieChart as PieIcon, ShieldCheck,
  Trophy, UserCheck, AlertOctagon, XCircle,
  MessageSquare, Edit3, Save, X, Settings, UserPlus, Trash2, Crown, BadgeCheck, Check,
  ChevronDown, ChevronUp, Layers, Router, Smartphone, Wifi, Share2, Box, Timer,
  Mic, Sunrise, CheckCircle2, History, Percent, Mail, PhoneOff, MapPin, FileCheck,
  Briefcase, Presentation
} from 'lucide-react';

interface KPIPilotAppProps { user: User; }

const COLORS = ['#ff7900', '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6', '#f59e0b', '#64748b'];

// Catégories alignées avec la demande : FTTH, Partage, Mobile, Box, TDLTE, ADSL
const PRODUCT_CATS = ["FTTH", "Partage", "MOBILE", "BOX/SIM", "TDLTE+", "ADSL"];
// Nouveaux objectifs qualitatifs (KPIs)
const KPI_CATS = ["TAUX INJOIG %"];

// Structure d'une équipe
interface TeamStructure {
  id: string;
  name: string;
  supervisor: string;
  members: string[];
  color?: string;
}

// Interfaces for Team Performance Data
interface TeamAgentPerformance {
  name: string;
  obj: number;
  objInjoig: number;
  sold: number;
  cancelled: number;
  unreachable: number;
  injoigRate: number;
  s1?: number;
  s2?: number;
  s3?: number;
  s4?: number;
  tro: number;
  cancelRate: number;
  productsDetail: Record<string, any>;
}

interface TeamPerformance {
  meta: TeamStructure;
  agents: TeamAgentPerformance[];
  products: Record<string, any>;
  totalSold: number;
  totalCancelled: number;
  totalUnreachable: number;
  objTotal: number;
  objUnreachableRate: number;
}

// Configuration par défaut initiale (Migration)
const INITIAL_TEAMS: TeamStructure[] = [
  {
    id: 'team_mehdi',
    name: "Team Mehdi",
    supervisor: "Mehdi El Yaouissi",
    members: ["Mehdi El Yaouissi", "Youssef Houass", "Ilyas Hassi Rahou", "Tarik El Harradi", "Sabir Arsaoui", "Ismail bahbouhi"],
    color: 'bg-orange-500'
  },
  {
    id: 'team_adnane',
    name: "Team Force",
    supervisor: "Hamza Cherradi", 
    members: ["Adnane Lommuni", "Ayoub Zahir", "Hamza Cherradi", "Oussama Enacri", "Said Serrar", "Hamza Sitel", "Khalid Zaoug", "Zakaria Haroual"],
    color: 'bg-blue-600'
  }
];

// Types pour les objectifs détaillés : Mois -> Agent -> Produit -> Quantité
type ObjectivesStore = Record<string, Record<string, Record<string, number>>>; 

// Type pour les prévisions journalières (Rituel Matinal)
type DailyForecastStore = Record<string, Record<string, { 
  forecasts: Record<string, number>, 
  note: string,
  forecast?: number 
}>>;

const KPIPilotApp: React.FC<KPIPilotAppProps> = ({ user }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [advOrders, setAdvOrders] = useState<ADVOrder[]>([]);
  
  // Nouveaux états pour B2B
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  
  // Dynamic sales agents from User Management Panel
  const [salesAgents, setSalesAgents] = useState<string[]>(SALES_AGENTS);

  const [activeTab, setActiveTab] = useState<'overview' | 'teams' | 'supervision' | 'meeting' | 'ai'>('overview');
  
  // --- GESTION STRUCTURE DYNAMIQUE ---
  const [projectManager, setProjectManager] = useState("Adnane Lommuni");
  const [teamsConfig, setTeamsConfig] = useState<TeamStructure[]>(INITIAL_TEAMS);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamStructure | null>(null); // Pour l'édition dans la modale
  
  // --- GESTION OBJECTIFS ---
  const [objectivesStore, setObjectivesStore] = useState<ObjectivesStore>({});
  const [showObjModal, setShowObjModal] = useState(false);
  const [currentObjMonth, setCurrentObjMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  // Temp state structure: AgentName -> { ProductCat: Number }
  const [tempObjectives, setTempObjectives] = useState<Record<string, Record<string, number>>>({});
  const [expandedTeamObj, setExpandedTeamObj] = useState<string | null>(null);
  
  // --- GESTION RITUEL MATINAL ---
  const [dailyForecasts, setDailyForecasts] = useState<DailyForecastStore>({});
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
  const [isSavingForecast, setIsSavingForecast] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  // --- GESTION AFFICHAGE VENDEUR ---
  const [expandedAgentRow, setExpandedAgentRow] = useState<string | null>(null);

  // AI State
  const [aiInput, setAiInput] = useState('');
  const [aiChat, setAiChat] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Filtres globaux
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [adv, objs, config, forecasts, pros, opps, users] = await Promise.all([
          getCloudData('adv_orders'),
          getCloudData('kpi_objectives_detail'),
          getCloudData('kpi_teams_config'),
          getCloudData('kpi_daily_forecasts'),
          getCloudData('b2b_prospects'),
          getCloudData('b2b_opportunities'),
          getCloudData('users')
        ]);
        setAdvOrders(adv || []);
        setObjectivesStore(objs || {});
        setDailyForecasts(forecasts || {});
        setProspects(pros || []);
        setOpportunities(opps || []);
        
        // Merge hardcoded SALES_AGENTS with users from User Management Panel
        const dynamicAgents = new Set(SALES_AGENTS);
        if (users && Array.isArray(users)) {
          users.forEach((u: any) => {
            if (u.role === 'agent' && u.associatedAgentName && 
                u.associatedAgentName.toLowerCase() !== 'administration') {
              dynamicAgents.add(u.associatedAgentName);
            }
          });
        }
        setSalesAgents(Array.from(dynamicAgents).sort((a, b) => a.localeCompare(b)));
        
        if (config) {
          setProjectManager(config.projectManager || "Adnane Lommuni");
          setTeamsConfig(config.teams || INITIAL_TEAMS);
        }
      } catch (e) {
        console.error("KPI Load Error", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiChat]);

  // Helpers
  const getWeekNumber = (dateStr: string) => {
    let d: Date;
    if (dateStr && dateStr.includes('/') && dateStr.length === 10) {
       const [day, month, year] = dateStr.split('/');
       d = new Date(`${year}-${month}-${day}`);
    } else {
       d = new Date(dateStr);
    }
    
    if (isNaN(d.getTime())) return 1;

    const day = d.getDate();
    if (day <= 7) return 1;
    if (day <= 14) return 2;
    if (day <= 21) return 3;
    return 4;
  };

  const getPreviousDay = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    // Skip Dimanche (0) -> Samedi (6)
    if (date.getDay() === 0) date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  };

  const getProductCategory = (offre: string) => {
    const o = (offre || '').toUpperCase();
    if(o.includes('TDLTE')) return 'TDLTE+';
    if(o.includes('PARTAGE')) return 'Partage';
    if(o.includes('FTTH') || o.includes('FIBRE')) return 'FTTH';
    if(o.includes('BOX') || o.includes('5G') || o.includes('SIM')) return 'BOX/SIM';
    // CORRECTIF: Ajout de 'FF' et 'PRO CONNECT' pour bien capturer tous les forfaits mobiles
    if(o.includes('FORFAIT') || o.includes('ILLIMITE') || o.includes('MOBILE') || o.includes('FF') || o.includes('PRO CONNECT')) return 'MOBILE';
    if(o.includes('ADSL')) return 'ADSL';
    return 'AUTRE';
  };

  const normalizeStr = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

  const normalizeDate = (dateStr: string) => {
      if (!dateStr) return '';
      let d = dateStr;
      if (d.includes('T')) d = d.split('T')[0];
      if (d.includes('/')) {
          const parts = d.split('/');
          if (parts.length === 3) {
              d = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
      }
      return d;
  };

  const isAgentMatch = (orderComm: string, targetAgent: string) => {
      const o = normalizeStr(orderComm);
      const t = normalizeStr(targetAgent);
      if (!o || !t) return false;
      if (o === t) return true;
      if (t.includes(o)) return true; 
      if (o.includes(t)) return true;
      if (t.includes("adnane") && o.includes("adnane")) return true;
      return false;
  };

  // --- SAUVEGARDE CONFIGURATION EQUIPES ---
  const handleSaveConfig = async () => {
    const payload = {
      projectManager,
      teams: teamsConfig
    };
    await saveCloudData('kpi_teams_config', payload);
    setShowConfigModal(false);
  };

  const handleUpdateTeam = (updatedTeam: TeamStructure) => {
    const exists = teamsConfig.find(t => t.id === updatedTeam.id);
    if (exists) {
      setTeamsConfig(teamsConfig.map(t => t.id === updatedTeam.id ? updatedTeam : t));
    } else {
      setTeamsConfig([...teamsConfig, updatedTeam]);
    }
    setEditingTeam(null);
  };

  const handleDeleteTeam = (id: string) => {
    if (confirm("Supprimer cette équipe ?")) {
      setTeamsConfig(teamsConfig.filter(t => t.id !== id));
    }
  };

  // --- SAUVEGARDE OBJECTIFS ---
  const handleSaveObjectives = async () => {
    const updatedStore = { ...objectivesStore, [currentObjMonth]: tempObjectives };
    setObjectivesStore(updatedStore);
    await saveCloudData('kpi_objectives_detail', updatedStore);
    setShowObjModal(false);
  };

  // --- GESTION RITUEL MATINAL ---
  const handleForecastDetailChange = (agentName: string, productCat: string, value: number) => {
    setDailyForecasts(prev => {
        const dayData = prev[meetingDate] || {};
        const agentData = dayData[agentName] || { forecasts: {}, note: '' };
        
        return {
            ...prev,
            [meetingDate]: {
                ...dayData,
                [agentName]: {
                    ...agentData,
                    forecasts: {
                        ...(agentData.forecasts || {}),
                        [productCat]: value
                    }
                }
            }
        };
    });
  };

  const handleForecastNoteChange = (agentName: string, note: string) => {
    setDailyForecasts(prev => ({
        ...prev,
        [meetingDate]: {
            ...(prev[meetingDate] || {}),
            [agentName]: {
                ...(prev[meetingDate]?.[agentName] || { forecasts: {}, note: '' }),
                note
            }
        }
    }));
  };

  const handleSaveForecasts = async () => {
    setIsSavingForecast(true);
    await saveCloudData('kpi_daily_forecasts', dailyForecasts);
    setTimeout(() => setIsSavingForecast(false), 500);
  };

  const handleClearDailyForecasts = () => {
    setShowClearConfirmModal(true);
  };

  const confirmClearDailyForecasts = async () => {
    setIsSavingForecast(true);
    const updated = { ...dailyForecasts };
    if (updated[meetingDate]) {
        delete updated[meetingDate];
        setDailyForecasts(updated);
        await saveCloudData('kpi_daily_forecasts', updated);
    }
    setIsSavingForecast(false);
    setShowClearConfirmModal(false);
  };

  const getRealizedStats = (agentName: string, dateStr: string) => {
    const stats: Record<string, number> = {};
    PRODUCT_CATS.forEach(c => stats[c] = 0);
    
    const dayOrders = advOrders.filter(o => {
        const d = normalizeDate(o.dateDepot || '');
        if (d !== dateStr) return false;

        const valNorm = normalizeStr(o.validation || '');
        const siNorm = normalizeStr(o.statutSi || '');

        if (valNorm.includes('supprime')) return false;
        if (valNorm.includes('annule') || siNorm.includes('annule')) return false;

        const orderComm = o.commercial || '';
        return isAgentMatch(orderComm, agentName);
    });

    dayOrders.forEach(o => {
        const cat = getProductCategory(o.offre);
        if (stats[cat] !== undefined) stats[cat]++;
    });

    return stats;
  };

  const handleSendEmailReport = async () => {
    const prevDay = getPreviousDay(meetingDate);
    const dateStr = new Date(prevDay).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    
    let htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b;">
        <h2 style="color: #ff7900; border-bottom: 2px solid #ff7900; padding-bottom: 10px;">
          Rapport Réunion Matinale - Réalisations du ${dateStr}
        </h2>
        <p style="margin-bottom: 20px;">Bonjour à tous,<br>Voici le point sur les engagements d'hier versus les réalisations validées (ADV).</p>
    `;

    teamsConfig.forEach(team => {
      htmlContent += `
        <h3 style="background-color: #f1f5f9; padding: 10px; border-radius: 5px; color: #0f172a; margin-top: 25px;">
          ${team.name} <span style="font-size: 0.8em; font-weight: normal;">(Sup: ${team.supervisor})</span>
        </h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 14px;">
          <thead>
            <tr style="background-color: #ff7900; color: white;">
              <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Collaborateur</th>
              <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Prévision</th>
              <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Réalisé (ADV)</th>
              <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Écart</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Note</th>
            </tr>
          </thead>
          <tbody>
      `;

      team.members.forEach(agent => {
        const prevData = dailyForecasts[prevDay]?.[agent] || { forecasts: {}, note: '' };
        
        let totalPrevForecast = 0;
        if (prevData.forecast !== undefined) {
            totalPrevForecast = prevData.forecast;
        } else {
            totalPrevForecast = (Object.values(prevData.forecasts || {}) as number[]).reduce((a: number, b: number) => a + b, 0);
        }

        const realizedStats = getRealizedStats(agent, prevDay);
        const totalRealized = (Object.values(realizedStats) as number[]).reduce((a: number, b: number) => a + b, 0);
        
        const gap = totalRealized - totalPrevForecast;
        const gapColor = gap >= 0 ? '#10b981' : '#f43f5e'; 
        const gapSign = gap > 0 ? '+' : '';

        const detailReal = PRODUCT_CATS
          .filter(cat => realizedStats[cat] > 0)
          .map(cat => `${cat}: ${realizedStats[cat]}`)
          .join(', ');

        htmlContent += `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${agent}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #ddd; color: #64748b;">${totalPrevForecast}</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #ddd; font-weight: bold;">
              ${totalRealized}
              <br><span style="font-size: 10px; color: #64748b; font-weight: normal;">${detailReal}</span>
            </td>
            <td style="padding: 8px; text-align: center; border: 1px solid #ddd; color: ${gapColor}; font-weight: bold;">${gapSign}${gap}</td>
            <td style="padding: 8px; border: 1px solid #ddd; font-style: italic; color: #475569;">${prevData.note || ''}</td>
          </tr>
        `;
      });

      htmlContent += `</tbody></table>`;
    });

    htmlContent += `
        <p style="margin-top: 30px; font-size: 12px; color: #94a3b8;">Généré automatiquement par DIVERSIFIA KPI Pilot.</p>
      </div>
    `;

    try {
      const blobHtml = new Blob([htmlContent], { type: "text/html" });
      const blobText = new Blob([`Rapport Réunion Matinale - ${dateStr}\n(Veuillez coller le contenu HTML)`], { type: "text/plain" });
      const data = [new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText })];
      await navigator.clipboard.write(data);
      const subject = encodeURIComponent(`Rapport Réunion Matinale - ${dateStr}`);
      const body = encodeURIComponent(`(Le tableau a été copié dans votre presse-papier. Faites Ctrl+V ici pour l'afficher.)\n\n`);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
      alert("✅ Rapport copié !\n\nLe tableau de performance a été copié dans votre presse-papier.\n\n1. Votre client mail va s'ouvrir.\n2. Faites 'Coller' (Ctrl+V) dans le corps du mail pour afficher le tableau.");
    } catch (err) {
      console.error("Erreur copie presse-papier:", err);
      alert("Erreur lors de la copie du rapport. Vérifiez les permissions du navigateur.");
    }
  };

  const openObjModal = () => {
    const existingMonthData = objectivesStore[currentObjMonth] || {};
    const allAgents = teamsConfig.flatMap(t => t.members);
    const defaults: Record<string, Record<string, number>> = {};
    const allCats = [...PRODUCT_CATS, ...KPI_CATS];
    
    allAgents.forEach(agent => {
      defaults[agent] = {};
      allCats.forEach(cat => {
        defaults[agent][cat] = existingMonthData[agent]?.[cat] || 0;
      });
    });
    
    setTempObjectives(defaults);
    if (teamsConfig.length > 0) setExpandedTeamObj(teamsConfig[0].id);
    setShowObjModal(true);
  };

  const updateTempObjective = (agent: string, product: string, value: number) => {
    setTempObjectives(prev => ({
      ...prev,
      [agent]: {
        ...prev[agent],
        [product]: value
      }
    }));
  };

  const facturedMixStats = useMemo(() => {
    const activeOrders = advOrders.filter(o => {
      const d = normalizeDate(o.dateDepot || '');
      const isMonthMatch = d.startsWith(selectedMonth);
      const s = normalizeStr(o.statutSi || '').toUpperCase();
      const isFacture = s.includes('FACTURE');
      const isInstalle = s.includes('INSTALLE') && !s.includes('ANNULE');
      return isMonthMatch && (isFacture || isInstalle);
    });

    const stats = { partage: 0, ftth: 0, tdlte: 0, mobile: 0, box: 0, adsl: 0, totalGlobal: 0 };

    activeOrders.forEach(o => {
      const offer = (o.offre || '').toUpperCase();
      let counted = false;
      if (offer.includes('PARTAGE')) { stats.partage++; counted = true; }
      else if (offer.includes('FTTH') || offer.includes('FIBRE')) { stats.ftth++; counted = true; }
      else if (offer.includes('TDLTE')) { stats.tdlte++; counted = true; }
      else if (offer.includes('BOX') || offer.includes('5G') || offer.includes('SIM')) { stats.box++; counted = true; }
      else if (offer.includes('ADSL')) { stats.adsl++; counted = true; }
      else if (offer.includes('FORFAIT') || offer.includes('ILLIMITE') || offer.includes('WIFI') || offer.includes('MOBILE')) { stats.mobile++; counted = true; }
      else { stats.mobile++; counted = true; }
      if (counted) stats.totalGlobal++;
    });
    return stats;
  }, [advOrders, selectedMonth]);

  const globalStats = useMemo(() => {
    const currentOrders = advOrders.filter(o => {
        const d = normalizeDate(o.dateDepot || '');
        return d.startsWith(selectedMonth);
    });

    const totalOrders = currentOrders.length;
    const validatedOrders = currentOrders.filter(o => o.validation === 'VALIDE').length;
    const validationRate = totalOrders > 0 ? (validatedOrders / totalOrders) * 100 : 0;
    
    let totalDurationAdv = 0;
    let countDurationAdv = 0;
    let totalDurationActiv = 0;
    let countDurationActiv = 0;

    currentOrders.forEach(o => {
      if (o.dateDepot && o.dateValidation) {
        const d1 = new Date(normalizeDate(o.dateDepot));
        const d2 = new Date(o.dateValidation);
        if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
            const diff = d2.getTime() - d1.getTime();
            if (diff > 0) { totalDurationAdv += diff; countDurationAdv++; }
        }
      }
      if (o.dateValidation && o.dateActivationEnd) {
        const dVal = new Date(o.dateValidation);
        const dAct = new Date(o.dateActivationEnd);
        if (!isNaN(dVal.getTime()) && !isNaN(dAct.getTime())) {
            const diff = dAct.getTime() - dVal.getTime();
            if (diff > 0) { totalDurationActiv += diff; countDurationActiv++; }
        }
      }
    });

    const avgValidationHours = countDurationAdv > 0 ? (totalDurationAdv / countDurationAdv) / (1000 * 60 * 60) : 0;
    const avgActivationHours = countDurationActiv > 0 ? (totalDurationActiv / countDurationActiv) / (1000 * 60 * 60) : 0;

    const salesByProduct = currentOrders.reduce((acc: any, o) => {
        const p = o.offre || 'Autre';
        acc[p] = (acc[p] || 0) + 1;
        return acc;
    }, {});
    const topProduct = Object.entries(salesByProduct).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '-';
    const activeOrders = facturedMixStats.totalGlobal;
    const activationRate = validatedOrders > 0 ? (activeOrders / validatedOrders) * 100 : 0;

    return { validationRate: validationRate.toFixed(1), avgValidationHours: avgValidationHours.toFixed(1), avgActivationHours: avgActivationHours.toFixed(1), topProduct, activationRate: activationRate.toFixed(1), totalOrders, activeOrders };
  }, [advOrders, selectedMonth, facturedMixStats]);

  const chartData = useMemo(() => {
    const statusCounts = advOrders.reduce((acc: any, o) => { const s = o.validation || 'EN ATTENTE'; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
    const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
    const trendMap: Record<string, number> = {};
    advOrders.forEach(o => { const date = normalizeDate(o.dateDepot || ''); if (date) trendMap[date] = (trendMap[date] || 0) + 1; });
    const areaData = Object.entries(trendMap).sort((a,b) => a[0].localeCompare(b[0])).slice(-30).map(([date, count]) => ({ date, count }));
    const sellerMap: Record<string, { total: number, valid: number }> = {};
    advOrders.filter(o => { const d = normalizeDate(o.dateDepot || ''); return d.startsWith(selectedMonth); }).forEach(o => { if (!o.commercial) return; if (!sellerMap[o.commercial]) sellerMap[o.commercial] = { total: 0, valid: 0 }; sellerMap[o.commercial].total++; if (o.validation === 'VALIDE') sellerMap[o.commercial].valid++; });
    const barData = Object.entries(sellerMap).map(([name, stats]) => ({ name: name.split(' ')[0], total: stats.total, valid: stats.valid, rate: Math.round((stats.valid/stats.total)*100) })).sort((a,b) => b.total - a.total).slice(0, 10);
    return { pieData, areaData, barData };
  }, [advOrders, selectedMonth]);

  const teamData = useMemo<Record<string, TeamPerformance>>(() => {
    const data: Record<string, TeamPerformance> = {};
    const currentMonthObjectives = objectivesStore[selectedMonth] || {};
    
    teamsConfig.forEach(team => {
      data[team.name] = { meta: team, agents: [], products: {}, totalSold: 0, totalCancelled: 0, totalUnreachable: 0, objTotal: 0, objUnreachableRate: 0 };
      PRODUCT_CATS.forEach(cat => { data[team.name].products[cat] = { obj: 0, sold: 0, cancelled: 0, s1:0, s2:0, s3:0, s4:0 }; });
    });

    teamsConfig.forEach((team) => {
      let teamUnreachableObjSum = 0;
      let teamAgentCount = 0;

      team.members.forEach(agentName => {
        const agentOrders = advOrders.filter(o => {
            const d = normalizeDate(o.dateDepot || '');
            const isDateMatch = d.startsWith(selectedMonth);
            if (!isDateMatch) return false;
            if (o.validation === 'SUPPRIMÉ') return false;
            return isAgentMatch(o.commercial || '', agentName);
        });
        
        const agentObjectives = currentMonthObjectives[agentName] || {};
        const objTotalAgent = PRODUCT_CATS.reduce((sum, cat) => sum + (agentObjectives[cat] || 0), 0);
        const objInjoigRate = agentObjectives["TAUX INJOIG %"] || 0;
        if (objInjoigRate > 0) { teamUnreachableObjSum += objInjoigRate; teamAgentCount++; }

        const totalDeposited = agentOrders.length;
        const cancelled = agentOrders.filter(o => {
            const valNorm = normalizeStr(o.validation || '');
            const siNorm = normalizeStr(o.statutSi || '');
            return valNorm.includes('annule') || siNorm.includes('annule');
        }).length;
        
        const sold = totalDeposited - cancelled;
        const unreachableCount = agentOrders.filter(o => {
            const rAdv = (o.raisonBlocage || '').toLowerCase();
            const rSi = (o.raisonBlocageSi || '').toLowerCase();
            return rAdv.includes('injoignable') || rSi.includes('injoignable');
        }).length;

        const productsDetail: Record<string, any> = {};
        PRODUCT_CATS.forEach(cat => { productsDetail[cat] = { obj: agentObjectives[cat] || 0, sold: 0, cancelled: 0, s1: 0, s2: 0, s3: 0, s4: 0 }; });

        agentOrders.forEach(o => {
           const cat = getProductCategory(o.offre || '');
           const w = getWeekNumber(o.dateDepot);
           const valNorm = normalizeStr(o.validation || '');
           const siNorm = normalizeStr(o.statutSi || '');
           const isCancelled = valNorm.includes('annule') || siNorm.includes('annule');

           if (productsDetail[cat]) {
             if (!isCancelled) {
                 productsDetail[cat].sold++;
                 if(w === 1) productsDetail[cat].s1++;
                 if(w === 2) productsDetail[cat].s2++;
                 if(w === 3) productsDetail[cat].s3++;
                 if(w === 4) productsDetail[cat].s4++;
             } else { productsDetail[cat].cancelled++; }
           }

           if (data[team.name].products[cat]) {
             if (!isCancelled) {
                 data[team.name].products[cat].sold++;
                 if(w === 1) data[team.name].products[cat].s1++;
                 if(w === 2) data[team.name].products[cat].s2++;
                 if(w === 3) data[team.name].products[cat].s3++;
                 if(w === 4) data[team.name].products[cat].s4++;
             } else { data[team.name].products[cat].cancelled++; }
           }
        });

        Object.entries(agentObjectives).forEach(([prodCat, val]) => { if (data[team.name].products[prodCat]) { data[team.name].products[prodCat].obj += val; } });

        data[team.name].agents.push({
          name: agentName, obj: objTotalAgent, objInjoig: objInjoigRate, sold, cancelled, unreachable: unreachableCount,
          injoigRate: totalDeposited > 0 ? Math.round((unreachableCount / totalDeposited) * 100) : 0,
          s1: productsDetail["FTTH"]?.s1 || 0,
          tro: objTotalAgent > 0 ? Math.round((sold / objTotalAgent) * 100) : 0,
          cancelRate: totalDeposited > 0 ? Math.round((cancelled / totalDeposited) * 100) : 0,
          productsDetail
        });

        data[team.name].totalSold += sold;
        data[team.name].totalCancelled += cancelled;
        data[team.name].totalUnreachable += unreachableCount;
        data[team.name].objTotal += objTotalAgent;
      });

      if (teamAgentCount > 0) { data[team.name].objUnreachableRate = Math.round(teamUnreachableObjSum / teamAgentCount); }
    });

    return data;
  }, [advOrders, selectedMonth, objectivesStore, teamsConfig]);

  const projectManagerStats = useMemo(() => {
    let globalObj = 0; let globalSold = 0; let globalCancelled = 0; let globalUnreachable = 0; let globalUnreachableObjSum = 0; let teamCount = 0;

    Object.values(teamData).forEach((td: TeamPerformance) => {
      globalObj += td.objTotal; globalSold += td.totalSold; globalCancelled += td.totalCancelled; globalUnreachable += td.totalUnreachable;
      if (td.objUnreachableRate > 0) { globalUnreachableObjSum += td.objUnreachableRate; teamCount++; }
    });

    const isPmInTeams = teamsConfig.some(t => t.members.includes(projectManager));
    if (!isPmInTeams) {
        const currentMonthObjectives = objectivesStore[selectedMonth] || {};
        const pmAgentObjectives = currentMonthObjectives[projectManager] || {};
        const pmObjTotal = PRODUCT_CATS.reduce((sum, cat) => sum + (pmAgentObjectives[cat] || 0), 0);
        globalObj += pmObjTotal;

        const pmOrders = advOrders.filter(o => {
            const d = normalizeDate(o.dateDepot || '');
            if (!d.startsWith(selectedMonth)) return false;
            if (o.validation === 'SUPPRIMÉ') return false;
            return isAgentMatch(o.commercial || '', projectManager);
        });

        const pmCancelledCount = pmOrders.filter(o => {
            const valNorm = normalizeStr(o.validation || '');
            const siNorm = normalizeStr(o.statutSi || '');
            return valNorm.includes('annule') || siNorm.includes('annule');
        }).length;
        
        const pmSold = pmOrders.length - pmCancelledCount;
        const pmUnreachable = pmOrders.filter(o => {
            const rAdv = (o.raisonBlocage || '').toLowerCase();
            const rSi = (o.raisonBlocageSi || '').toLowerCase();
            return rAdv.includes('injoignable') || rSi.includes('injoignable');
        }).length;

        globalSold += pmSold; globalCancelled += pmCancelledCount; globalUnreachable += pmUnreachable;
    }

    const totalDepositedGlobal = globalSold + globalCancelled;

    return {
      name: projectManager, objective: globalObj, sold: globalSold, cancelled: globalCancelled,
      tro: globalObj > 0 ? Math.round((globalSold / globalObj) * 100) : 0,
      cancelRate: totalDepositedGlobal > 0 ? Math.round((globalCancelled / totalDepositedGlobal) * 100) : 0,
      unreachableRate: totalDepositedGlobal > 0 ? Math.round((globalUnreachable / totalDepositedGlobal) * 100) : 0,
      objUnreachableRate: teamCount > 0 ? Math.round(globalUnreachableObjSum / teamCount) : 0
    };
  }, [teamData, projectManager, advOrders, selectedMonth, teamsConfig, objectivesStore]);

  const meetingStats = useMemo(() => {
    const prevDay = getPreviousDay(meetingDate);
    const today = meetingDate;
    const allAgents = teamsConfig.flatMap(t => t.members);
    let totalForecastToday = 0; let totalForecastYesterday = 0; let totalRealizedYesterday = 0;
    let prospectsVisitedYesterday = 0; let opportunitiesCreatedYesterday = 0;
    const realizedByProduct: Record<string, number> = {};
    PRODUCT_CATS.forEach(cat => realizedByProduct[cat] = 0);

    allAgents.forEach(agent => {
      const todayData = dailyForecasts[today]?.[agent];
      const prevData = dailyForecasts[prevDay]?.[agent];
      const forecastsToday: Record<string, number> = todayData?.forecasts || {};
      totalForecastToday += (Object.values(forecastsToday) as number[]).reduce((a: number, b: number) => a + b, 0);
      if (Object.keys(forecastsToday).length === 0 && todayData?.forecast) { totalForecastToday += Number(todayData.forecast); }

      const forecastsYesterday: Record<string, number> = prevData?.forecasts || {};
      totalForecastYesterday += (Object.values(forecastsYesterday) as number[]).reduce((a: number, b: number) => a + b, 0);
      if (Object.keys(forecastsYesterday).length === 0 && prevData?.forecast) { totalForecastYesterday += Number(prevData.forecast); }

      const realizedStats = getRealizedStats(agent, prevDay);
      totalRealizedYesterday += (Object.values(realizedStats) as number[]).reduce((a: number, b: number) => a + b, 0);
      Object.entries(realizedStats).forEach(([cat, count]) => { if (realizedByProduct[cat] !== undefined) { realizedByProduct[cat] += count; } });
    });

    prospectsVisitedYesterday = prospects.filter(p => { const pDate = p.createdAt.split('T')[0]; return pDate === prevDay && allAgents.includes(p.assignedTo); }).length;
    opportunitiesCreatedYesterday = opportunities.filter(o => { const oDate = o.createdAt.split('T')[0]; return oDate === prevDay && allAgents.includes(o.assignedTo); }).length;

    return { forecastToday: totalForecastToday, forecastYesterday: totalForecastYesterday, realizedYesterday: totalRealizedYesterday, gapYesterday: totalRealizedYesterday - totalForecastYesterday, prospectsVisitedYesterday, opportunitiesCreatedYesterday, realizedByProduct };
  }, [dailyForecasts, meetingDate, teamsConfig, advOrders, prospects, opportunities]);

  // --- NOUVEAU CALCUL : DÉPÔTS DU JOUR PAR PRODUIT ---
  const dailyDepositStats = useMemo(() => {
    const stats: Record<string, number> = {};
    PRODUCT_CATS.forEach(cat => stats[cat] = 0);

    advOrders.forEach(o => {
        const d = normalizeDate(o.dateDepot || '');
        // On compare avec la date sélectionnée dans le filtre "Réunion Matinale"
        if (d === meetingDate) {
            const cat = getProductCategory(o.offre || '');
            if (stats[cat] !== undefined) {
                stats[cat]++;
            }
        }
    });
    return stats;
  }, [advOrders, meetingDate]);

  const askGemini = async (customPrompt?: string) => {
    const prompt = customPrompt || aiInput;
    if (!prompt.trim()) return;
    setIsAiThinking(true);
    if (!customPrompt) { setAiChat(prev => [...prev, { role: 'user', content: prompt }]); setAiInput(''); }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const context = { kpis: globalStats, month: selectedMonth, teamPerformance: teamData, projectManager: projectManagerStats, meetingStats: meetingStats };
      const systemInstruction = `Tu es le Directeur de la Stratégie de DIVERSIFIA. Données du mois ${selectedMonth} : ${safeJSON(context)}. Rôle : Analyser les performances des équipes sous la direction de ${projectManager}. Identifier les vendeurs en difficulté (TRO < 50%) et les produits qui performent bien. Pour la réunion matinale, analyse les écarts entre prévisions et réalisations. Donne des conseils managériaux.`;
      const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt, config: { systemInstruction } });
      const text = response.text || "Analyse indisponible.";
      setAiChat(prev => [...prev, { role: 'assistant', content: text }]);
    } catch (e) { setAiChat(prev => [...prev, { role: 'assistant', content: "⚠️ Erreur IA." }]); } finally { setIsAiThinking(false); }
  };

  const getTROColor = (tro: number) => { if (tro >= 100) return 'bg-[#10b981] text-white'; if (tro >= 70) return 'bg-[#f59e0b] text-white'; if (tro >= 50) return 'bg-[#3b82f6] text-white'; return 'bg-[#ef4444] text-white'; };
  const getCancelRateColor = (rate: number) => { if (rate <= 10) return 'text-emerald-600 bg-emerald-50'; if (rate <= 20) return 'text-orange-600 bg-orange-50'; return 'text-rose-600 bg-rose-50'; };
  const getInjoigColor = (rate: number, obj: number) => { if (obj > 0 && rate <= obj) return 'text-emerald-600 bg-emerald-50'; return 'text-rose-600 bg-rose-50'; };

  if (isLoading) { return <div className="flex flex-col items-center justify-center h-screen bg-slate-50"><div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div><p className="text-sm font-black text-slate-400 uppercase tracking-widest">Chargement du Cockpit...</p></div>; }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      <div className="bg-slate-900 text-white pt-10 pb-24 px-6 md:px-12 rounded-b-[4rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-10"><Activity className="w-64 h-64 text-white" /></div>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
          <div>
            <div className="flex items-center space-x-3 mb-2"><div className="px-3 py-1 bg-cyan-500 text-slate-900 rounded-full text-[10px] font-black uppercase tracking-widest">v3.0 Live</div><p className="text-cyan-400 font-bold text-xs uppercase tracking-widest flex items-center"><Sparkles className="w-3 h-3 mr-1" /> AI Powered</p></div>
            <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-2">KPI Pilot</h1>
            <p className="text-slate-400 text-sm font-medium max-w-md leading-relaxed">Interface de supervision stratégique unifiée. Analyse croisée ADV, Ventes et Performance pour la direction.</p>
          </div>
          <div className="flex bg-white/10 p-1 rounded-2xl backdrop-blur-md overflow-x-auto">
            <button onClick={() => setActiveTab('overview')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'overview' ? 'bg-cyan-500 text-slate-900 shadow-lg' : 'text-white hover:bg-white/10'}`}>Vue Globale</button>
            <button onClick={() => setActiveTab('teams')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'teams' ? 'bg-cyan-500 text-slate-900 shadow-lg' : 'text-white hover:bg-white/10'}`}>Performance Équipes</button>
            <button onClick={() => setActiveTab('supervision')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'supervision' ? 'bg-cyan-500 text-slate-900 shadow-lg' : 'text-white hover:bg-white/10'}`}>Supervision</button>
            <button onClick={() => setActiveTab('meeting')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'meeting' ? 'bg-cyan-500 text-slate-900 shadow-lg' : 'text-white hover:bg-white/10'}`}>Réunion Matinale</button>
            <button onClick={() => setActiveTab('ai')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'ai' ? 'bg-cyan-500 text-slate-900 shadow-lg' : 'text-white hover:bg-white/10'}`}>Analyste IA</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 -mt-16 relative z-20">
        
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {[ { label: 'Taux Validation ADV', value: `${globalStats.validationRate}%`, icon: Target, color: 'text-indigo-600', bg: 'bg-indigo-50' }, { label: 'Délai ADV', value: `${globalStats.avgValidationHours}h`, icon: Zap, color: 'text-orange-600', bg: 'bg-orange-50' }, { label: 'Taux Activation', value: `${globalStats.activationRate}%`, icon: ShieldCheck, color: 'text-cyan-600', bg: 'bg-cyan-50' }, { label: 'Délai Activation', value: `${globalStats.avgActivationHours}h`, icon: Timer, color: 'text-blue-600', bg: 'bg-blue-50' }, { label: 'Top Produit', value: globalStats.topProduct, icon: TrendingUp, color: 'text-rose-600', bg: 'bg-rose-50' } ].map((kpi, i) => (
                <div key={i} className="bg-white p-6 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col justify-between h-40">
                  <div className="flex justify-between items-start"><div className={`p-3 rounded-2xl ${kpi.bg} ${kpi.color}`}><kpi.icon className="w-6 h-6" /></div></div>
                  <div><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{kpi.label}</p><h3 className="text-3xl font-black text-slate-900 truncate">{kpi.value}</h3></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-8"><div><h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Dynamique des Ventes</h3><p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Volume quotidien de dossiers déposés</p></div><div className="p-3 bg-slate-50 rounded-2xl"><BarChart3 className="w-6 h-6 text-slate-400" /></div></div>
                <div className="h-80 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData.areaData}><defs><linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/><stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false} /><YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} /><Area type="monotone" dataKey="count" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" /></AreaChart></ResponsiveContainer></div>
              </div>
              <div className="space-y-8">
                <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100"><h3 className="text-sm font-black text-slate-900 uppercase italic tracking-tighter mb-6 flex items-center"><Users className="w-4 h-4 mr-2 text-indigo-500" /> Top Performers</h3><div className="h-60"><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={chartData.barData} margin={{ left: 10 }}><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} /><Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px'}} /><Bar dataKey="total" fill="#e2e8f0" radius={[0, 4, 4, 0]} barSize={10} /><Bar dataKey="valid" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={10} /></BarChart></ResponsiveContainer></div></div>
                <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100"><h3 className="text-sm font-black text-slate-900 uppercase italic tracking-tighter mb-6 flex items-center"><PieIcon className="w-4 h-4 mr-2 text-orange-500" /> État du Pipeline</h3><div className="h-60"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData.pieData} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">{chartData.pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip /><Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} wrapperStyle={{fontSize: '10px'}} /></PieChart></ResponsiveContainer></div></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'meeting' && (
          <div className="space-y-8 animate-in fade-in duration-500 pb-20">
             <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center space-x-4"><div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600"><Mic className="w-6 h-6" /></div><div><h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Réunion Matinale</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Briefing & Engagements journaliers</p></div></div>
                <div className="flex items-center space-x-4 bg-slate-50 p-2 rounded-2xl border border-slate-100"><Calendar className="w-5 h-5 text-slate-400 ml-2" /><input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="bg-transparent border-none text-slate-900 font-black text-sm focus:ring-0" /></div>
                <div className="flex items-center space-x-3">
                  <button onClick={handleSendEmailReport} className="px-6 py-4 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-sm transition-all flex items-center"><Mail className="w-4 h-4 mr-2" /> Rapport Mail</button>
                  <button onClick={handleClearDailyForecasts} className="px-6 py-4 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-sm transition-all flex items-center"><Trash2 className="w-4 h-4 mr-2" /> Vider</button>
                  <button onClick={handleSaveForecasts} disabled={isSavingForecast} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-indigo-600 transition-all flex items-center">{isSavingForecast ? 'Sauvegarde...' : <><Save className="w-4 h-4 mr-2" /> Enregistrer</>}</button>
                </div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[ { label: "Prévision Aujourd'hui", val: meetingStats.forecastToday, color: 'text-slate-900', icon: Sunrise, bg: 'bg-blue-50 text-blue-600' }, { label: "Prévu Hier", val: meetingStats.forecastYesterday, color: 'text-slate-900', icon: History, bg: 'bg-slate-100 text-slate-500' }, { label: "Réalisé Hier (ADV)", val: meetingStats.realizedYesterday, color: 'text-emerald-600', icon: CheckCircle2, bg: 'bg-emerald-50 text-emerald-600' }, { label: "Ecart Hier", val: meetingStats.gapYesterday, color: meetingStats.gapYesterday >= 0 ? 'text-emerald-600' : 'text-rose-600', icon: meetingStats.gapYesterday >= 0 ? ArrowUpRight : ArrowDownRight, bg: meetingStats.gapYesterday >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600' }, { label: "Visites Hier", val: meetingStats.prospectsVisitedYesterday, color: 'text-indigo-600', icon: MapPin, bg: 'bg-indigo-50 text-indigo-600' }, { label: "Deals Créés", val: meetingStats.opportunitiesCreatedYesterday, color: 'text-purple-600', icon: FileCheck, bg: 'bg-purple-50 text-purple-600' } ].map((k, i) => (
                  <div key={i} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex items-center space-x-4"><div className={`p-3 rounded-xl ${k.bg}`}><k.icon className="w-6 h-6" /></div><div><p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{k.label}</p><p className={`text-2xl font-black ${k.color}`}>{k.val}</p></div></div>
                ))}
             </div>

             {/* NOUVEAU: Cartes de dépôts par produit (Journalier) */}
             <div className="mt-2 mb-2 animate-in slide-in-from-bottom-4">
               <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4 ml-2 flex items-center"><Layers className="w-4 h-4 mr-2" /> Production du Jour (Dépôts)</h4>
               <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {PRODUCT_CATS.map((cat) => {
                     const count = dailyDepositStats[cat] || 0;
                     let icon = Target;
                     let color = 'text-slate-600';
                     let bg = 'bg-slate-50';

                     if (cat === 'FTTH') { icon = Zap; color = 'text-orange-500'; bg = 'bg-orange-50'; }
                     else if (cat === 'TDLTE+') { icon = Router; color = 'text-blue-500'; bg = 'bg-blue-50'; }
                     else if (cat === 'MOBILE') { icon = Smartphone; color = 'text-indigo-500'; bg = 'bg-indigo-50'; }
                     else if (cat === 'BOX/SIM') { icon = Box; color = 'text-purple-500'; bg = 'bg-purple-50'; }
                     else if (cat === 'Partage') { icon = Share2; color = 'text-emerald-500'; bg = 'bg-emerald-50'; }
                     else if (cat === 'ADSL') { icon = Activity; color = 'text-slate-500'; bg = 'bg-slate-100'; }

                     const IconComponent = icon;

                     return (
                        <div key={cat} className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group hover:scale-[1.02] transition-transform">
                           <div className="flex items-center space-x-3">
                              <div className={`p-2.5 rounded-xl ${bg} ${color}`}>
                                 <IconComponent className="w-5 h-5" />
                              </div>
                              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{cat}</span>
                           </div>
                           <span className={`text-2xl font-black ${color}`}>{count}</span>
                        </div>
                     )
                  })}
               </div>
             </div>

             <div className="grid grid-cols-1 gap-8">
                {teamsConfig.map(team => (
                   <div key={team.id} className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                      <div className="p-6 bg-slate-900 flex justify-between items-center text-white"><div className="flex items-center space-x-3"><div className="w-2 h-8 bg-orange-500 rounded-full"></div><h3 className="text-lg font-black uppercase italic tracking-tighter">{team.name}</h3></div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sup: {team.supervisor}</p></div>
                      <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100"><tr><th className="px-6 py-4 w-[25%]">Collaborateur</th><th className="px-6 py-4 text-center border-r border-slate-100 w-[20%] bg-slate-50/50">Performance Hier (Total)</th><th className="px-6 py-4 w-[20%] bg-orange-50/30 text-orange-800 text-center">Prévision Jour (Total)</th><th className="px-6 py-4 w-[25%]">Note</th><th className="px-6 py-4 w-[10%] text-right">Détail</th></tr></thead><tbody className="divide-y divide-slate-50">{team.members.map(agent => {
                          const prevDate = getPreviousDay(meetingDate); 
                          const agentTodayData = dailyForecasts[meetingDate]?.[agent] || { forecasts: {} as Record<string, number>, note: '' }; 
                          const agentPrevData = dailyForecasts[prevDate]?.[agent] || { forecasts: {} as Record<string, number>, note: '' };
                          const prevRealizedStats = getRealizedStats(agent, prevDate); const totalPrevRealized = Object.values(prevRealizedStats).reduce((a,b)=>a+b, 0);
                          let totalPrevForecast = 0; if (agentPrevData.forecast !== undefined) { totalPrevForecast = agentPrevData.forecast; } else { totalPrevForecast = (Object.values(agentPrevData.forecasts || {}) as number[]).reduce((a: number, b: number) => a + b, 0); }
                          const isHit = totalPrevRealized >= totalPrevForecast; let totalTodayForecast = 0; if (agentTodayData.forecast !== undefined) { totalTodayForecast = agentTodayData.forecast; } else { totalTodayForecast = (Object.values(agentTodayData.forecasts || {}) as number[]).reduce((a: number, b: number) => a + b, 0); }
                          const isExpanded = expandedAgentRow === agent;
                          return (<React.Fragment key={agent}><tr className={`transition-colors group cursor-pointer ${isExpanded ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`} onClick={() => setExpandedAgentRow(isExpanded ? null : agent)}><td className="px-6 py-4"><div className="flex items-center space-x-3"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${isExpanded ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{agent.charAt(0)}</div><span className="font-bold text-sm text-slate-700">{agent}</span></div></td><td className="px-6 py-4 text-center border-r border-slate-100"><div className="flex items-center justify-center space-x-2"><span className="text-slate-400 font-bold text-xs">{totalPrevForecast}</span><span className="text-slate-300">/</span><span className={`font-black text-sm ${isHit ? 'text-emerald-600' : 'text-rose-500'}`}>{totalPrevRealized}</span>{isHit ? <Check className="w-3 h-3 text-emerald-500" /> : <X className="w-3 h-3 text-rose-400" />}</div></td><td className="px-6 py-4 bg-orange-50/10 text-center"><span className="font-black text-lg text-orange-600">{totalTodayForecast}</span></td><td className="px-6 py-4"><input type="text" value={agentTodayData.note || ''} onChange={(e) => handleForecastNoteChange(agent, e.target.value)} onClick={(e) => e.stopPropagation()} className="w-full bg-slate-50 border-none rounded-xl text-xs font-medium text-slate-600 py-2 px-4 focus:ring-2 focus:ring-indigo-500/20 placeholder-slate-300" placeholder="Note..." /></td><td className="px-6 py-4 text-right">{isExpanded ? <ChevronUp className="w-4 h-4 text-indigo-500 inline" /> : <ChevronDown className="w-4 h-4 text-slate-400 inline" />}</td></tr>{isExpanded && (<tr className="bg-indigo-50/20 animate-in fade-in slide-in-from-top-2"><td colSpan={5} className="p-4"><div className="bg-white rounded-2xl border border-indigo-100 p-4 shadow-sm"><table className="w-full text-center text-xs"><thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400"><tr><th className="py-2 px-4 text-left">Catégorie</th><th className="py-2 px-4 border-r border-slate-200">Hier (Prévu)</th><th className="py-2 px-4 border-r border-slate-200">Hier (Réalisé)</th><th className="py-2 px-4 bg-orange-50 text-orange-700">Aujourd'hui (Prévision)</th></tr></thead><tbody className="divide-y divide-slate-50">{PRODUCT_CATS.map(cat => { const prevForecastVal: number = agentPrevData.forecasts?.[cat] || 0; const prevRealVal: number = prevRealizedStats[cat] || 0; const todayForecastVal: number = agentTodayData.forecasts?.[cat] || 0; return (<tr key={cat}><td className="py-3 px-4 text-left font-bold text-slate-600">{cat}</td><td className="py-3 px-4 text-slate-400 border-r border-slate-100">{prevForecastVal}</td><td className={`py-3 px-4 font-black border-r border-slate-100 ${prevRealVal >= prevForecastVal && prevForecastVal > 0 ? 'text-emerald-600' : prevRealVal < prevForecastVal ? 'text-rose-500' : 'text-slate-700'}`}>{prevRealVal}</td><td className="py-2 px-4 bg-orange-50/20"><div className="flex items-center justify-center"><button onClick={(e) => { e.stopPropagation(); handleForecastDetailChange(agent, cat, Math.max(0, todayForecastVal - 1)); }} className="w-6 h-6 rounded bg-white text-slate-400 hover:text-rose-500 border border-slate-200 flex items-center justify-center font-bold text-sm">-</button><span className="w-8 text-center font-black text-orange-600 text-sm">{todayForecastVal}</span><button onClick={(e) => { e.stopPropagation(); handleForecastDetailChange(agent, cat, todayForecastVal + 1); }} className="w-6 h-6 rounded bg-slate-900 text-white hover:bg-orange-500 flex items-center justify-center font-bold text-sm shadow-sm">+</button></div></td></tr>); })}</tbody></table></div></td></tr>)}</React.Fragment>);})}</tbody></table></div>
                   </div>
                ))}
             </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="space-y-12 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-center bg-slate-900 p-6 rounded-[2.5rem] shadow-2xl border border-slate-800">
               <div className="flex items-center space-x-4 mb-4 md:mb-0"><div className="p-3 bg-orange-500 rounded-xl text-white"><Trophy className="w-6 h-6" /></div><div><h3 className="text-xl font-black uppercase italic tracking-tighter text-white">Réalisation & Objectifs</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Suivi hiérarchique : Chef Projet &gt; Superviseurs</p></div></div>
               <div className="flex items-center space-x-4">
                  <div className="bg-slate-800 p-2 rounded-xl flex items-center border border-slate-700"><Calendar className="w-4 h-4 text-slate-400 mr-2 ml-2" /><input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-transparent border-none text-white font-bold text-sm focus:ring-0" /></div>
                  <button onClick={() => setShowConfigModal(true)} className="px-6 py-3 bg-indigo-600 hover:bg-white hover:text-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center"><Settings className="w-4 h-4 mr-2" /> Configuration</button>
                  <button onClick={openObjModal} className="px-6 py-3 bg-orange-500 hover:bg-white hover:text-orange-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center"><Edit3 className="w-4 h-4 mr-2" /> Objectifs</button>
               </div>
            </div>

            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-8 rounded-[3rem] shadow-2xl border border-slate-700 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5"><Crown className="w-64 h-64 text-white" /></div>
              <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
                 <div><div className="flex items-center space-x-2 mb-2"><Crown className="w-5 h-5 text-yellow-400" /><span className="text-[10px] font-black uppercase tracking-widest text-yellow-400">Chef de Projet</span></div><h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">{projectManagerStats.name}</h2></div>
                 <div className="flex items-center space-x-6 mt-4 md:mt-0"><div className="text-right"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Objectif Global</p><p className="text-3xl font-black text-white">{projectManagerStats.objective}</p></div><div className="h-10 w-px bg-slate-700"></div><div className="text-right"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Réalisé</p><p className="text-3xl font-black text-[#ff7900]">{projectManagerStats.sold}</p></div><div className={`px-4 py-2 rounded-xl text-lg font-black ${getTROColor(projectManagerStats.tro)}`}>TRO {projectManagerStats.tro}%</div></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm"><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Validé ADV</p><p className="text-2xl font-black text-emerald-400 mt-1">{advOrders.filter(o => o.validation === 'VALIDE' && (o.dateDepot || '').startsWith(selectedMonth)).length}</p></div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm"><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Facturé / Installé</p><p className="text-2xl font-black text-cyan-400 mt-1">{facturedMixStats.totalGlobal}</p></div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm"><div className="flex justify-between items-start"><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Taux Injoignable</p><span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${getInjoigColor(projectManagerStats.unreachableRate, projectManagerStats.objUnreachableRate)}`}>Obj: {projectManagerStats.objUnreachableRate}%</span></div><div className="flex items-end space-x-2 mt-1"><p className="text-2xl font-black text-orange-400">{projectManagerStats.unreachableRate}%</p><PhoneOff className="w-4 h-4 text-orange-400 mb-1.5" /></div></div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm"><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Taux Annulation</p><p className="text-2xl font-black text-rose-400 mt-1">{projectManagerStats.cancelRate}%</p></div>
              </div>
              <div className="mt-8 pt-6 border-t border-white/10 relative z-10">
                 <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4 flex items-center"><Layers className="w-4 h-4 mr-2" /> Mix Produit Facturé (Global)</h4>
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex flex-col items-center justify-center text-center"><Share2 className="w-5 h-5 text-emerald-400 mb-2" /><span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Partage</span><span className="text-xl font-black text-white mt-1">{facturedMixStats.partage}</span></div>
                    <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl flex flex-col items-center justify-center text-center"><Zap className="w-5 h-5 text-orange-400 mb-2" /><span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">FTTH</span><span className="text-xl font-black text-white mt-1">{facturedMixStats.ftth}</span></div>
                    <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex flex-col items-center justify-center text-center"><Router className="w-5 h-5 text-blue-400 mb-2" /><span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">TDLTE</span><span className="text-xl font-black text-white mt-1">{facturedMixStats.tdlte}</span></div>
                    <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl flex flex-col items-center justify-center text-center"><Smartphone className="w-5 h-5 text-indigo-400 mb-2" /><span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mobile</span><span className="text-xl font-black text-white mt-1">{facturedMixStats.mobile}</span></div>
                    <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-2xl flex flex-col items-center justify-center text-center"><Box className="w-5 h-5 text-purple-400 mb-2" /><span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">B. Box</span><span className="text-xl font-black text-white mt-1">{facturedMixStats.box}</span></div>
                    <div className="bg-slate-700/50 border border-slate-600/50 p-4 rounded-2xl flex flex-col items-center justify-center text-center"><Activity className="w-5 h-5 text-slate-400 mb-2" /><span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">ADSL</span><span className="text-xl font-black text-white mt-1">{facturedMixStats.adsl}</span></div>
                 </div>
              </div>
            </div>

            {Object.entries(teamData).map(([teamName, data]: [string, TeamPerformance]) => (
              <div key={teamName} className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between px-4">
                  <div className="flex items-center space-x-4"><div className="h-10 w-1.5 bg-[#ff7900] rounded-full"></div><div><h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">{teamName}</h3><div className="flex items-center text-xs font-bold text-slate-500"><BadgeCheck className="w-4 h-4 mr-1 text-indigo-500" /> Superviseur: <span className="text-indigo-600 ml-1 uppercase">{data.meta?.supervisor || 'Non assigné'}</span></div></div></div>
                  <div className="flex items-center space-x-4"><div className="flex items-center space-x-2 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100"><PhoneOff className="w-4 h-4 text-orange-500" /><span className="text-[10px] font-bold text-orange-800 uppercase tracking-widest">Obj Injoig: {data.objUnreachableRate}%</span></div><div className="flex items-center space-x-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Obj Équipe:</span><span className="text-xl font-black text-slate-900">{data.objTotal}</span></div></div>
                </div>
                <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                    <div className="bg-slate-900 p-4 flex justify-between items-center"><span className="font-black text-white uppercase text-xs tracking-[0.2em]">Performance {teamName}</span><span className="text-[10px] font-bold text-slate-400">Période: {selectedMonth}</span></div>
                    <table className="w-full text-center text-xs"><thead className="bg-slate-100 text-slate-500 font-black uppercase text-[9px] border-b border-slate-200"><tr><th className="py-4 text-left pl-6 w-48">Vendeur / Produit</th><th className="py-4 bg-orange-100 text-orange-800 border-x border-white">Obj M</th><th className="py-4 border-r border-slate-200">S1</th><th className="py-4 border-r border-slate-200">S2</th><th className="py-4 border-r border-slate-200">S3</th><th className="py-4 border-r border-slate-200">S4+</th><th className="py-4 bg-orange-500 text-white font-bold">Total</th><th className="py-4 bg-slate-200 text-slate-700 font-bold">TRO %</th><th className="py-4 bg-orange-50 text-orange-700 font-bold border-l border-white">Injoignable</th><th className="py-4 bg-rose-50 text-rose-600">Annulé</th><th className="py-4 bg-rose-100 text-rose-800">% AN</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 font-bold text-slate-700 text-xs">
                         {(Object.values(teamData) as TeamPerformance[]).map((data, idx) => {
                            const sold = Number(data.totalSold || 0);
                            const cancelled = Number(data.totalCancelled || 0);
                            const unreachable = Number(data.totalUnreachable || 0);
                            const obj = Number(data.objTotal || 0);
                            const objUnreachableRate = Number(data.objUnreachableRate || 0);

                            const gap = obj - sold;
                            const tro = obj > 0 ? Math.round((sold / obj) * 100) : 0;
                            const totalDeposited = sold + cancelled;
                            const cancelRate = totalDeposited > 0 ? Math.round((cancelled / totalDeposited) * 100) : 0;
                            const injoigRate = totalDeposited > 0 ? Math.round((unreachable / totalDeposited) * 100) : 0;
                            
                            // Since we are iterating on teamData values which represent TeamPerformance
                            // but inside the outer map we iterate on teamsConfig.map((teamName, data))
                            // This code block seems to be inside the inner loop logic but the provided code
                            // iterates on team.members. Wait, the structure in the provided code was:
                            // {data.agents.map((agent: any, idx: number) => ...
                            
                            // Let me correct this based on the existing structure in the file.
                            // The provided code snippet in the user request was from the 'supervision' tab table logic.
                            // However, here inside 'teams' tab, we iterate on `data.agents`.
                            
                            return null; // Placeholder as this block is structurally incorrect for 'teams' tab.
                         })}
                         {/* Correct implementation for 'teams' tab body based on original code structure */}
                         {data.agents.map((agent: any, idx: number) => (<React.Fragment key={idx}><tr className={`transition-colors cursor-pointer ${expandedAgentRow === agent.name ? 'bg-indigo-50 border-b border-indigo-200' : 'hover:bg-slate-50'}`} onClick={() => setExpandedAgentRow(expandedAgentRow === agent.name ? null : agent.name)}><td className="py-3 text-left pl-6 uppercase text-[10px] flex items-center">{expandedAgentRow === agent.name ? <ChevronUp className="w-3 h-3 mr-2 text-indigo-500" /> : <ChevronDown className="w-3 h-3 mr-2 text-slate-400" />}{agent.name}</td><td className="py-3 bg-orange-50 text-orange-700 font-black">{agent.obj}</td><td className="py-3 text-slate-400">{agent.s1 || '-'}</td><td className="py-3 text-slate-400">{agent.s2 || '-'}</td><td className="py-3 text-slate-400">{agent.s3 || '-'}</td><td className="py-3 text-slate-400">{agent.s4 || '-'}</td><td className="py-3 font-black bg-orange-50">{agent.sold}</td><td className={`py-3 text-white text-[10px] ${getTROColor(agent.tro)}`}>{agent.tro}%</td><td className="py-3 bg-orange-50/30 border-l border-slate-100"><div className="flex flex-col items-center justify-center"><span className={`text-[10px] font-black ${getInjoigColor(agent.injoigRate, agent.objInjoig)}`}>{agent.injoigRate}%</span><span className="text-[8px] text-slate-400 font-medium">Obj: {agent.objInjoig}%</span></div></td><td className="py-3 text-rose-500 font-bold">{agent.cancelled}</td><td className={`py-3 text-[10px] ${getCancelRateColor(agent.cancelRate)}`}>{agent.cancelRate}%</td></tr>{expandedAgentRow === agent.name && (<tr className="bg-indigo-50/30 animate-in fade-in slide-in-from-top-2"><td colSpan={11} className="p-4"><div className="bg-white rounded-xl border border-indigo-100 overflow-hidden shadow-sm"><table className="w-full text-center text-xs"><thead className="bg-indigo-50 text-indigo-800 text-[9px] font-black uppercase"><tr><th className="py-2 text-left pl-6">Détail Produit</th><th className="py-2">Obj Prod</th><th className="py-2">S1</th><th className="py-2">S2</th><th className="py-2">S3</th><th className="py-2">S4+</th><th className="py-2">Vendu</th><th className="py-2 text-rose-600">Annulé</th><th className="py-2 text-rose-600">% AN</th></tr></thead><tbody className="divide-y divide-indigo-50 text-slate-600">{Object.entries(agent.productsDetail).map(([prodName, stats]: [string, any]) => { if (stats.sold === 0 && stats.obj === 0 && stats.cancelled === 0) return null; const totalProdDeposited = stats.sold + stats.cancelled; const prodAnRate = totalProdDeposited > 0 ? Math.round((stats.cancelled / totalProdDeposited) * 100) : 0; return (<tr key={prodName}><td className="py-2 text-left pl-6 font-bold text-[10px]">{prodName}</td><td className="py-2 text-orange-600 bg-orange-50/50">{stats.obj}</td><td className="py-2">{stats.s1 || '-'}</td><td className="py-2">{stats.s2 || '-'}</td><td className="py-2">{stats.s3 || '-'}</td><td className="py-2">{stats.s4 || '-'}</td><td className="py-2 font-black text-indigo-600">{stats.sold}</td><td className="py-2 text-rose-500 font-bold">{stats.cancelled}</td><td className={`py-2 ${getCancelRateColor(prodAnRate)}`}>{prodAnRate}%</td></tr>); })}</tbody></table></div></td></tr>)}</React.Fragment>))}
                        <tr className="bg-slate-900 text-white font-black border-t-4 border-double border-slate-200"><td className="py-4 text-left pl-6 uppercase tracking-widest text-[10px]">TOTAL {teamName}</td><td className="py-4 text-orange-400">{data.objTotal}</td><td className="py-4 text-slate-400">{data.agents.reduce((a:number,c:any)=>a+Number(c.s1 || 0),0)}</td><td className="py-4 text-slate-400">{data.agents.reduce((a:number,c:any)=>a+Number(c.s2 || 0),0)}</td><td className="py-4 text-slate-400">{data.agents.reduce((a:number,c:any)=>a+Number(c.s3 || 0),0)}</td><td className="py-4 text-slate-400">{data.agents.reduce((a:number,c:any)=>a+Number(c.s4 || 0),0)}</td><td className="py-4 text-lg text-orange-500">{data.totalSold}</td><td className={`py-4 ${getTROColor(data.objTotal > 0 ? Math.round((data.totalSold/data.objTotal)*100) : 0)}`}>{data.objTotal > 0 ? Math.round((data.totalSold/data.objTotal)*100) : 0}%</td><td className="py-4 border-l border-slate-700 bg-slate-800"><div className="flex flex-col items-center"><span className={`${getInjoigColor(data.totalSold + data.totalCancelled > 0 ? Math.round((data.totalUnreachable/(data.totalSold + data.totalCancelled))*100) : 0, data.objUnreachableRate)} px-2 py-0.5 rounded text-[10px]`}>{data.totalSold + data.totalCancelled > 0 ? Math.round((data.totalUnreachable/(data.totalSold + data.totalCancelled))*100) : 0}%</span></div></td><td className="py-4 text-rose-400">{data.totalCancelled}</td><td className="py-4 text-rose-300">{data.totalSold + data.totalCancelled > 0 ? Math.round((data.totalCancelled/(data.totalSold + data.totalCancelled))*100) : 0}%</td></tr>
                      </tbody></table>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'supervision' && (
          <div className="space-y-8 animate-in fade-in duration-500">
             <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                <div className="flex items-center space-x-4 mb-8">
                   <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><Presentation className="w-6 h-6" /></div>
                   <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Performance Superviseurs</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vue consolidée pour réunion commerciale</p>
                   </div>
                </div>

                <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-200">
                         <tr>
                            <th className="py-5 pl-6">Superviseur</th>
                            <th className="py-5">Équipe</th>
                            <th className="py-5 text-center">Effectif</th>
                            <th className="py-5 text-center bg-orange-50 text-orange-800">Objectif</th>
                            <th className="py-5 text-center bg-indigo-50 text-indigo-800">Réalisé</th>
                            <th className="py-5 text-center">Gap</th>
                            <th className="py-5 text-center">TRO</th>
                            <th className="py-5 text-center">Annulation</th>
                            <th className="py-5 text-center">Injoignable</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-bold text-slate-700 text-xs">
                         {(Object.values(teamData) as TeamPerformance[]).map((data, idx) => {
                            const sold = Number(data.totalSold || 0);
                            const cancelled = Number(data.totalCancelled || 0);
                            const unreachable = Number(data.totalUnreachable || 0);
                            const obj = Number(data.objTotal || 0);
                            const objUnreachableRate = Number(data.objUnreachableRate || 0);

                            const gap = obj - sold;
                            const tro = obj > 0 ? Math.round((sold / obj) * 100) : 0;
                            const totalDeposited = sold + cancelled;
                            const cancelRate = totalDeposited > 0 ? Math.round((cancelled / totalDeposited) * 100) : 0;
                            const injoigRate = totalDeposited > 0 ? Math.round((unreachable / totalDeposited) * 100) : 0;
                            
                            return (
                               <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                  <td className="py-4 pl-6">
                                     <div className="flex items-center space-x-3">
                                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-black text-[10px]">{data.meta.supervisor.charAt(0)}</div>
                                        <span className="uppercase">{data.meta.supervisor}</span>
                                     </div>
                                  </td>
                                  <td className="py-4"><span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded text-slate-500 uppercase">{data.meta.name}</span></td>
                                  <td className="py-4 text-center text-slate-400">{data.agents.length}</td>
                                  <td className="py-4 text-center bg-orange-50/30 text-orange-700 font-black text-sm">{obj}</td>
                                  <td className="py-4 text-center bg-indigo-50/30 text-indigo-700 font-black text-sm">{sold}</td>
                                  <td className="py-4 text-center text-slate-400">{gap > 0 ? `-${gap}` : `+${Math.abs(gap)}`}</td>
                                  <td className="py-4 text-center">
                                     <div className="flex items-center justify-center space-x-2">
                                        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                                           <div className={`h-full rounded-full ${tro >= 100 ? 'bg-emerald-500' : tro >= 50 ? 'bg-orange-500' : 'bg-rose-500'}`} style={{width: `${Math.min(tro, 100)}%`}}></div>
                                        </div>
                                        <span className={`text-[10px] font-black ${tro >= 100 ? 'text-emerald-500' : tro >= 50 ? 'text-orange-500' : 'text-rose-500'}`}>{tro}%</span>
                                     </div>
                                  </td>
                                  <td className={`py-4 text-center ${cancelRate > 20 ? 'text-rose-500' : 'text-slate-500'}`}>{cancelRate}%</td>
                                  <td className={`py-4 text-center ${injoigRate > objUnreachableRate ? 'text-rose-500' : 'text-emerald-500'}`}>{injoigRate}%</td>
                               </tr>
                            );
                         })}
                         {/* Total Row */}
                         <tr className="bg-slate-900 text-white font-black uppercase text-xs border-t-4 border-double border-slate-200">
                            <td className="py-5 pl-6" colSpan={3}>Total Force de Vente</td>
                            <td className="py-5 text-center text-orange-400">{(Object.values(teamData) as TeamPerformance[]).reduce((a, b) => a + (b.objTotal || 0), 0)}</td>
                            <td className="py-5 text-center text-cyan-400">{(Object.values(teamData) as TeamPerformance[]).reduce((a, b) => a + (b.totalSold || 0), 0)}</td>
                            <td className="py-5 text-center text-slate-400">-</td>
                            <td className="py-5 text-center">
                               {(() => {
                                  const totalObj = (Object.values(teamData) as TeamPerformance[]).reduce((a, b) => a + (b.objTotal || 0), 0);
                                  const totalSold = (Object.values(teamData) as TeamPerformance[]).reduce((a, b) => a + (b.totalSold || 0), 0);
                                  const totalTro = totalObj > 0 ? Math.round((totalSold/totalObj)*100) : 0;
                                  return <span className={totalTro >= 100 ? 'text-emerald-400' : 'text-orange-400'}>{totalTro}%</span>;
                               })()}
                            </td>
                            <td className="py-5 text-center">-</td>
                            <td className="py-5 text-center">-</td>
                         </tr>
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[600px] animate-in fade-in duration-500">
            <div className="lg:col-span-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 border-t-8 border-t-cyan-500">
                <div className="flex items-center space-x-3 mb-6"><BrainCircuit className="w-6 h-6 text-cyan-500" /><h3 className="font-black uppercase italic tracking-tighter text-slate-900">Analyses Stratégiques</h3></div>
                <div className="space-y-3">
                  <button onClick={() => askGemini("Fais-moi un résumé exécutif des performances du mois pour le CODIR.")} className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-cyan-200 transition-all group"><p className="text-[10px] font-black text-slate-900 uppercase tracking-widest group-hover:text-cyan-600 transition-colors">Résumé Exécutif</p><p className="text-[9px] text-slate-400 font-bold">Synthèse globale.</p></button>
                  <button onClick={() => askGemini("Quels sont les produits qui sous-performent par rapport aux objectifs et pourquoi ?")} className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-cyan-200 transition-all group"><p className="text-[10px] font-black text-slate-900 uppercase tracking-widest group-hover:text-cyan-600 transition-colors">Analyse Produits</p><p className="text-[9px] text-slate-400 font-bold">Identifier les faiblesses.</p></button>
                  <button onClick={() => askGemini("Donne-moi 3 recommandations tactiques pour améliorer le TRO de l'équipe Mehdi.")} className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-cyan-200 transition-all group"><p className="text-[10px] font-black text-slate-900 uppercase tracking-widest group-hover:text-cyan-600 transition-colors">Plan d'Action</p><p className="text-[9px] text-slate-400 font-bold">Conseils ciblés.</p></button>
                </div>
              </div>
            </div>
            <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col overflow-hidden relative">
              <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between"><div className="flex items-center space-x-3"><div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg"><Bot className="w-5 h-5" /></div><div><p className="text-xs font-black uppercase italic tracking-tight">Stratège Virtuel</p><p className="text-[8px] font-black uppercase text-cyan-500 tracking-widest">Connecté</p></div></div><button onClick={() => setAiChat([])} className="text-slate-300 hover:text-rose-500 transition-colors" title="Effacer conversation"><RotateCcw className="w-4 h-4" /></button></div>
              <div className="flex-grow p-8 overflow-y-auto space-y-6 custom-scrollbar bg-slate-50/30">{aiChat.length === 0 ? (<div className="h-full flex flex-col items-center justify-center text-center py-20"><div className="w-16 h-16 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center mb-6"><MessageSquare className="w-8 h-8 text-slate-200" /></div><h4 className="text-slate-900 font-black uppercase italic tracking-tighter">Prêt à analyser</h4><p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2">Posez une question stratégique.</p></div>) : (aiChat.map((msg, i) => (<div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}><div className={`max-w-[92%] p-6 rounded-[2rem] text-sm leading-relaxed shadow-md whitespace-pre-wrap ${msg.role === 'user' ? 'bg-cyan-600 text-white rounded-tr-none font-bold' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none font-medium'}`}>{msg.content}</div></div>)))} {isAiThinking && (<div className="flex justify-start animate-pulse"><div className="bg-slate-100 p-4 rounded-2xl flex items-center space-x-2"><div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.4s]"></div></div></div>)}<div ref={chatEndRef} /></div>
              <div className="p-6 bg-white border-t flex items-center space-x-4"><input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && askGemini()} placeholder="Interroger les données..." className="flex-grow p-4 rounded-2xl bg-slate-50 border-none font-bold text-slate-900 focus:ring-2 focus:ring-cyan-500/20" /><button disabled={isAiThinking || !aiInput.trim()} onClick={() => askGemini()} className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl hover:bg-cyan-600 transition-all disabled:opacity-30"><Send className="w-5 h-5" /></button></div>
            </div>
          </div>
        )}

      </div>

      {/* Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
           <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Configuration Structure</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Équipes & Hiérarchie</p>
                 </div>
                 <button onClick={() => setShowConfigModal(false)}><X className="w-6 h-6 text-slate-400 hover:text-slate-600" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
                 <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Chef de Projet</label>
                    <select value={projectManager} onChange={e => setProjectManager(e.target.value)} className="w-full p-4 rounded-xl bg-slate-50 border-none font-bold text-sm appearance-none cursor-pointer">
                       {salesAgents.map(agent => <option key={agent} value={agent}>{agent}</option>)}
                    </select>
                 </div>
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                       <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center"><Users className="w-4 h-4 mr-2" /> Équipes ({teamsConfig.length})</h4>
                       <button onClick={() => setEditingTeam({ id: Math.random().toString(36).substr(2, 9), name: '', supervisor: '', members: [], color: 'bg-slate-500' })} className="text-[9px] font-black text-indigo-600 uppercase bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">+ Ajouter</button>
                    </div>
                    {teamsConfig.map(team => (
                       <div key={team.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="flex justify-between items-start mb-4">
                             <div>
                                <h5 className="font-black text-slate-800">{team.name}</h5>
                                <p className="text-[10px] text-slate-500 font-bold uppercase">Sup: {team.supervisor}</p>
                             </div>
                             <div className="flex space-x-2">
                                <button onClick={() => setEditingTeam(team)} className="p-2 bg-white rounded-lg text-slate-400 hover:text-indigo-600 shadow-sm"><Edit3 className="w-4 h-4" /></button>
                                <button onClick={() => handleDeleteTeam(team.id)} className="p-2 bg-white rounded-lg text-slate-400 hover:text-rose-600 shadow-sm"><Trash2 className="w-4 h-4" /></button>
                             </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                             {team.members.map(m => (<span key={m} className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-600">{m}</span>))}
                          </div>
                       </div>
                    ))}
                 </div>
                 {editingTeam && (
                    <div className="bg-white p-6 rounded-3xl border-2 border-indigo-100 shadow-xl space-y-4 animate-in slide-in-from-bottom-4">
                       <h4 className="text-sm font-black text-indigo-900 uppercase tracking-widest mb-2">{teamsConfig.find(t => t.id === editingTeam.id) ? 'Modifier Équipe' : 'Nouvelle Équipe'}</h4>
                       <div><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Nom Équipe</label><input type="text" value={editingTeam.name} onChange={e => setEditingTeam({...editingTeam, name: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border-none font-bold text-sm" placeholder="ex: Team Force" /></div>
                       <div><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Superviseur</label><select value={editingTeam.supervisor} onChange={e => setEditingTeam({...editingTeam, supervisor: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border-none font-bold text-sm appearance-none cursor-pointer"><option value="">Sélectionner...</option>{salesAgents.map(agent => <option key={agent} value={agent}>{agent}</option>)}</select></div>
                       <div><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Membres</label><div className="bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-40 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-2">{salesAgents.map(agent => (<label key={agent} className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${editingTeam.members.includes(agent) ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200'}`}><input type="checkbox" checked={editingTeam.members.includes(agent)} onChange={e => { if (e.target.checked) setEditingTeam({...editingTeam, members: [...editingTeam.members, agent]}); else setEditingTeam({...editingTeam, members: editingTeam.members.filter(m => m !== agent)}); }} className="hidden" /><span className="text-[10px] font-bold uppercase">{agent}</span></label>))}</div></div>
                       <div className="flex gap-2 pt-2"><button onClick={() => setEditingTeam(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[10px]">Annuler</button><button onClick={() => handleUpdateTeam(editingTeam)} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg">Valider</button></div>
                    </div>
                 )}
              </div>
              <div className="p-6 bg-white border-t border-slate-100 flex justify-end"><button onClick={handleSaveConfig} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-indigo-600 transition-all flex items-center"><Save className="w-4 h-4 mr-2" /> Enregistrer Configuration</button></div>
           </div>
        </div>
      )}

      {/* Objectives Modal */}
      {showObjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm">
          <div className="bg-white w-full max-w-6xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center space-x-4">
                 <div className="p-3 bg-orange-50 rounded-xl text-orange-600"><Target className="w-6 h-6" /></div>
                 <div>
                   <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Définition Objectifs</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mois cible : {currentObjMonth}</p>
                 </div>
              </div>
              <div className="flex items-center space-x-4">
                 <input type="month" value={currentObjMonth} onChange={e => setCurrentObjMonth(e.target.value)} className="p-2 rounded-xl border border-slate-200 text-sm font-bold" />
                 <button onClick={() => setShowObjModal(false)}><X className="w-6 h-6 text-slate-400 hover:text-slate-600" /></button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
               {teamsConfig.map(team => (
                 <div key={team.id} className="bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden">
                    <div 
                      className="p-4 bg-white border-b border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedTeamObj(expandedTeamObj === team.id ? null : team.id)}
                    >
                       <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded-full ${team.color || 'bg-slate-400'}`}></div>
                          <span className="font-black text-slate-900 uppercase text-sm">{team.name}</span>
                       </div>
                       {expandedTeamObj === team.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                    
                    {expandedTeamObj === team.id && (
                      <div className="p-4 overflow-x-auto">
                         <table className="w-full text-center">
                            <thead>
                               <tr>
                                  <th className="p-2 text-left text-[10px] font-black uppercase text-slate-400">Agent</th>
                                  {[...PRODUCT_CATS, ...KPI_CATS].map(cat => (
                                     <th key={cat} className="p-2 text-[9px] font-black uppercase text-slate-500 whitespace-nowrap">{cat}</th>
                                  ))}
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                               {team.members.map(agent => (
                                  <tr key={agent}>
                                     <td className="p-3 text-left font-bold text-xs text-slate-700 whitespace-nowrap">{agent}</td>
                                     {[...PRODUCT_CATS, ...KPI_CATS].map(cat => (
                                        <td key={cat} className="p-2">
                                           <input 
                                             type="number" 
                                             value={tempObjectives[agent]?.[cat] || 0}
                                             onChange={(e) => updateTempObjective(agent, cat, parseInt(e.target.value) || 0)}
                                             className="w-16 p-2 rounded-lg border border-slate-200 text-center font-bold text-xs focus:ring-2 focus:ring-orange-500/20"
                                           />
                                        </td>
                                     ))}
                                  </tr>
                               ))}
                            </tbody>
                         </table>
                      </div>
                    )}
                 </div>
               ))}
            </div>

            <div className="p-6 bg-white border-t border-slate-100 flex justify-end space-x-4">
               <button onClick={() => setShowObjModal(false)} className="px-6 py-3 rounded-xl border border-slate-200 text-slate-500 font-black uppercase text-xs">Annuler</button>
               <button onClick={handleSaveObjectives} className="px-8 py-3 rounded-xl bg-orange-500 text-white font-black uppercase text-xs shadow-lg hover:bg-orange-600">Enregistrer les Objectifs</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
           <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-8 text-center animate-in zoom-in-95">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-500"><AlertTriangle className="w-8 h-8" /></div>
              <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter mb-2">Vider la journée ?</h3>
              <p className="text-xs text-slate-500 font-medium mb-6">Toutes les prévisions et notes de la date sélectionnée seront supprimées.</p>
              <div className="flex gap-3">
                 <button onClick={() => setShowClearConfirmModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[10px]">Annuler</button>
                 <button onClick={confirmClearDailyForecasts} className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-black uppercase text-[10px] shadow-lg">Confirmer</button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default KPIPilotApp;
