
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, ADVOrder, ADVValidationStatus, ADVSiStatus } from '../types';
import { getCloudData, saveCloudData } from '../services/database';
import { SALES_AGENTS, PRODUCT_OFFERS, PRESTATAIRES } from '../constants';
import { GoogleGenerativeAI as GoogleGenAI } from "@google/generative-ai";
import { 
  Search, Plus, Filter, CheckCircle2, AlertTriangle, 
  Clock, XCircle, RotateCcw, Save, X, Edit3, Trash2, 
  Bot, Send, Sparkles, Loader2,
  Calendar, LayoutList,
  Archive, FilterX, RefreshCcw,
  BarChart2, ChevronDown, Check, Server, CloudDownload,
  Timer, Gauge, ListFilter
} from 'lucide-react';

interface ADVAppProps {
  user: User;
  salesAgents?: string[];
}

const STATUS_COLORS: Record<string, string> = {
  'VALIDE': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'EN ATTENTE': 'bg-amber-50 text-amber-600 border-amber-200',
  'BLOQUÉ': 'bg-orange-50 text-orange-600 border-orange-200',
  'ANNULÉ': 'bg-rose-50 text-rose-600 border-rose-200',
  'SUPPRIMÉ': 'bg-slate-100 text-slate-500 border-slate-200',
};

const SI_STATUS_COLORS: Record<string, string> = {
  'Facturé': 'bg-cyan-50 text-cyan-600 border-cyan-200',
  'Installé non Facturé': 'bg-blue-50 text-blue-600 border-blue-200',
  'En GO': 'bg-indigo-50 text-indigo-600 border-indigo-200',
  'En Etudes': 'bg-purple-50 text-purple-600 border-purple-200',
  'A traiter': 'bg-slate-100 text-slate-600 border-slate-200',
  'Bloqué': 'bg-orange-50 text-orange-600 border-orange-200',
  'Annulé': 'bg-rose-50 text-rose-600 border-rose-200',
};

const ADV_REASONS = [
  "Injoignable", "Document non conforme", "Demande en double", 
  "Client BtoC", "Client Indisponible", "Client Douteux", 
  "Non elligible", "Probléme de passage", "Dossier Refusé"
];

// Nouveaux motifs pour le blocage Activation (SI)
const ACTIVATION_REASONS = [
  "Injoignable pour RDV",
  "Refus Client",
  "Adresse Incorrecte / Incomplète",
  "Blocage Technique (Poteau/Façade)",
  "Non Eligible Fibre",
  "Instance (Attente Travaux)",
  "Client Absent RDV",
  "Annulation par Client",
  "Déjà Installé (Concurrent)",
  "Problème Syyndic/Autorisation",
  "Autre"
];

// --- HELPER CALCUL SLA ---
const calculateSLA = (startDate: string, endDate?: string) => {
  if (!startDate) return "-";
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return "-";
  
  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return "0m";
  
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 60) return `${diffMins}m`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}j ${diffHours % 24}h`;
};

// --- COMPOSANT MULTI-SELECT ---
interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  colorClass?: string;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, selected, onChange, colorClass = "text-slate-400" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className={`text-[9px] font-black uppercase ${colorClass} ml-1 block mb-1 tracking-widest`}>{label}</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-600 flex justify-between items-center text-left hover:bg-slate-100 transition-colors shadow-inner"
      >
        <span className="truncate block">
          {selected.length === 0 
            ? "-- Tous --" 
            : selected.length === 1 
              ? selected[0] 
              : `${selected.length} sélectionnés`}
        </span>
        <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-2xl border border-slate-100 max-h-60 overflow-y-auto custom-scrollbar p-1 animate-in fade-in zoom-in-95 duration-200">
          <div 
            onClick={() => { onChange([]); setIsOpen(false); }}
            className={`p-2 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-50 ${selected.length === 0 ? 'bg-indigo-50 text-indigo-800' : 'text-slate-500'}`}
          >
            -- Tous --
          </div>
          {options.map((opt) => (
            <div
              key={opt}
              onClick={() => toggleOption(opt)}
              className="flex items-center p-2 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <div className={`w-3.5 h-3.5 rounded border mr-2 flex items-center justify-center transition-colors ${selected.includes(opt) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                {selected.includes(opt) && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className={`text-xs font-bold truncate ${selected.includes(opt) ? 'text-indigo-700' : 'text-slate-600'}`}>
                {opt}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper function to clean reference fields and prevent sync conflicts
const cleanReference = (ref: string): string => {
  return (ref || '').trim().replace(/\s+/g, ' ');
};

const getCategoryFromOffer = (offre: string) => {
  const off = (offre || '').toUpperCase();
  if (off.includes('PARTAGE')) return 'Partage';
  if (off.includes('FTTH') || off.includes('FIBRE')) return 'Fibre';
  if (off.includes('ADSL')) return 'ADSL';
  if (off.includes('TDLTE')) return 'TDLTE'; // Nouvelle catégorie dissociée
  if (off.includes('BOX') || off.includes('SIM')) return 'BOX';
  if (off.includes('MOBILE') || off.includes('FORFAIT') || off.includes('FF') || off.includes('ILLIMITE') || off.includes('PRO CONNECT')) return 'Mobile';
  return 'Autre';
};

const ADVApp: React.FC<ADVAppProps> = ({ user, salesAgents = SALES_AGENTS }) => {
  const isAdmin = user.role === 'admin';
  const hasWritePerm = isAdmin || user.permissions?.adv?.create || user.permissions?.adv?.update;
  const canDelete = isAdmin || user.permissions?.adv?.delete;
  
  const [orders, setOrders] = useState<ADVOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeView, setActiveView] = useState<'all' | 'adv' | 'activation' | 'archives' | 'deleted'>('adv'); 
  
  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [syncProgress, setSyncProgress] = useState<string>('');

  const [filterStatusAdv, setFilterStatusAdv] = useState<string[]>([]);
  const [filterStatusSi, setFilterStatusSi] = useState<string[]>([]);
  const [filterCommercial, setFilterCommercial] = useState<string[]>([]);
  const [filterPrestataire, setFilterPrestataire] = useState<string[]>([]);
  const [filterProduit, setFilterProduit] = useState<string[]>([]);
  const [filterSousEtatAdv, setFilterSousEtatAdv] = useState<string[]>([]);
  const [filterSousEtatSi, setFilterSousEtatSi] = useState<string[]>([]);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  
  // AI Assistant State
  const [aiChat, setAiChat] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showSlaSummary, setShowSlaSummary] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ADVOrder | null>(null);
  const [formOrder, setFormOrder] = useState<Partial<ADVOrder>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [serialStatus, setSerialStatus] = useState<{status?: string, owner?: string, exists: boolean} | null>(null);

  // 🔒 Operation lock to prevent concurrent read-modify-write conflicts
  const isBusy = useRef(false);

  // Helper: generate collision-safe unique IDs
  const generateId = (prefix = '') => {
    const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;
    return prefix ? `${prefix}-${uuid}` : uuid;
  };

  const updateFormOrder = (updates: Partial<ADVOrder>) => {
    setFormOrder(prev => ({ ...prev, ...updates }));
  };

  useEffect(() => {
    loadData(); 
  }, []);

  const loadData = async () => {
    // Prevent data reload when modal is open or another operation is running
    if (showModal) {
      console.log('🔒 Data reload prevented - modal is open');
      return;
    }
    if (isBusy.current) {
      console.log('🔒 Data reload prevented - another operation is in progress');
      return;
    }
    
    setIsLoading(true);
    try {
      const data = await getCloudData('adv_orders');
      if (data) {
        // Nettoyer les références EN MÉMOIRE SEULEMENT (pas de réécriture destructrice)
        const cleanedData = data.map((o: ADVOrder) => ({
          ...o,
          refContrat: cleanReference(o.refContrat || ''),
          doliRef: o.doliRef ? cleanReference(o.doliRef) : o.doliRef,
          raisonSociale: cleanReference(o.raisonSociale || ''),
          telephone: cleanReference(o.telephone || ''),
          nFixe: o.nFixe ? cleanReference(o.nFixe) : o.nFixe,
          nSerie: o.nSerie ? cleanReference(o.nSerie) : o.nSerie,
        }));

        // Dédupliquer EN MÉMOIRE SEULEMENT pour l'affichage
        // IMPORTANT: Les commandes manuelles et celles modifiées par l'utilisateur sont TOUJOURS prioritaires
        const refMap = new Map<string, ADVOrder>();
        for (const order of cleanedData) {
          const key = cleanReference(order.refContrat || '');
          if (!key) continue; // Pas de refContrat, garder tel quel
          
          const existing = refMap.get(key);
          if (!existing) {
            refMap.set(key, order);
          } else {
            // PRIORITÉ 1: Commandes manuelles toujours prioritaires
            if (order.isManuallyCreated && !existing.isManuallyCreated) {
              refMap.set(key, order);
            } else if (existing.isManuallyCreated && !order.isManuallyCreated) {
              // garder l'existante
            } else {
              // PRIORITÉ 2: Commande avec lastEditedAt (modifiée par utilisateur) est prioritaire
              const existingEdited = existing.lastEditedAt || '';
              const newEdited = order.lastEditedAt || '';
              if (newEdited && !existingEdited) {
                refMap.set(key, order);
              } else if (existingEdited && !newEdited) {
                // garder l'existante
              } else {
                // PRIORITÉ 3: Garder la version avec un statut modifié
                const isExistingModified = existing.isManuallyCreated || existing.isConfirmed || existing.validation !== 'EN ATTENTE' || existing.statutSi !== 'En Etudes';
                const isNewModified = order.isManuallyCreated || order.isConfirmed || order.validation !== 'EN ATTENTE' || order.statutSi !== 'En Etudes';
                
                if (isNewModified && !isExistingModified) {
                  refMap.set(key, order);
                } else if (!isExistingModified && !isNewModified) {
                  // Les deux non modifiées, garder la plus récente
                  const existingDate = new Date(existing.dateTraitement || 0).getTime();
                  const newDate = new Date(order.dateTraitement || 0).getTime();
                  if (newDate > existingDate) refMap.set(key, order);
                }
              }
            }
          }
        }

        const ordersWithoutRef = cleanedData.filter((o: ADVOrder) => !cleanReference(o.refContrat || ''));
        const deduplicatedOrders = [...ordersWithoutRef, ...Array.from(refMap.values())];
        
        const duplicatesRemoved = cleanedData.length - deduplicatedOrders.length;
        if (duplicatesRemoved > 0) {
          console.log(`🧹 ${duplicatesRemoved} doublons détectés en mémoire (affichage nettoyé, base non modifiée)`);
        }

        setOrders(deduplicatedOrders);
        
        // ⚠️ ON NE RÉÉCRIT PLUS LA BASE AU CHARGEMENT
        // L'ancien code sauvegardait automatiquement après nettoyage/déduplication,
        // ce qui causait des pertes de données silencieuses.
        // Le nettoyage ne se fait plus qu'en mémoire pour l'affichage.
      }
    } catch (e) {
      console.error("Error loading ADV data", e);
    } finally {
      setIsLoading(false);
    }
  };
    // Helper function to get current local time in ISO format
  const getNowLocal = () => {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  };
 // Full Dolibarr synchronization function - OPTIMIZED: Only fetch missing orders
  const runFullSync = async (withConfirm: boolean = true) => {
    if (withConfirm && !confirm("Voulez-vous synchroniser les commandes Dolibarr maintenant ?")) return;
    if (isBusy.current) {
      alert("⏳ Une opération est en cours, veuillez patienter.");
      return;
    }
    
    isBusy.current = true;
    setIsSyncing(true);
    setSyncProgress('🔍 Vérification des nouvelles commandes...');
    try {
      const apiHeaders = { 
        'Accept': 'application/json',
        'DOLAPIKEY': 'ec6dd9c77b198b15ff31fc72b664a80dd07adb87'
      };

      // 1. Get current Firebase data (don't clear it!)
      console.log('📊 Loading current Firebase data...');
      const existingOrders = await getCloudData('adv_orders') || [];
      // Inclure tous les ordres existants (y compris les supprimés) pour éviter de les re-synchroniser
      const existingRefs = new Set(existingOrders.map((o: ADVOrder) => cleanReference(o.refContrat || o.doliRef || '')));
      // Garder trace des ordres supprimés manuellement (soft delete) pour ne pas les toucher
      const softDeletedRefs = new Set(
        existingOrders
          .filter((o: ADVOrder) => o.validation === 'SUPPRIMÉ')
          .map((o: ADVOrder) => cleanReference(o.refContrat || o.doliRef || ''))
      );
      console.log(`📊 Found ${existingOrders.length} existing orders in Firebase (${softDeletedRefs.size} soft-deleted)`);

      // 2. Fetch ONLY order IDs/refs from Dolibarr (lightweight check)
      console.log('🔍 Fetching Dolibarr order references...');
      setSyncProgress('🔍 Vérification des références Dolibarr...');
      
      let allDolibarrRefs: any[] = [];
      let page = 0;
      const pageSize = 100; // Réduire à 100 pour une pagination plus fiable
      let hasMoreOrders = true;
      
      while (hasMoreOrders) {
        console.log(`🔍 Fetching Dolibarr orders page ${page} (limit: ${pageSize})...`);
        const ordersResponse = await fetch(`https://www.diversifia.ma/crm/api/index.php/orders?sortfield=t.rowid&sortorder=ASC&limit=${pageSize}&page=${page}&sqlfilters=(t.fk_statut:=:0)`, {
          method: 'GET',
          headers: apiHeaders
        });

        if (!ordersResponse.ok) {
          throw new Error(`Erreur API Dolibarr Orders: ${ordersResponse.status}`);
        }

        const pageOrders = await ordersResponse.json();
        console.log(`🔍 Retrieved ${pageOrders.length} orders from Dolibarr (page ${page})`);
        
        if (pageOrders.length === 0) {
          hasMoreOrders = false;
        } else {
          const lightOrders = pageOrders.map((o: any) => ({
            ref: o.ref,
            refContrat: o.array_options?.options_val_cont || o.ref,
            id: o.id,
            rowid: o.rowid
          }));
          allDolibarrRefs.push(...lightOrders);
          
          // Continuer si on a reçu exactement pageSize résultats (il y en a peut-être plus)
          if (pageOrders.length < pageSize) {
            hasMoreOrders = false;
          }
        }
        
        page++;
        if (page > 100) break; // Sécurité pour éviter boucle infinie
      }
      
      console.log(`🔍 Found ${allDolibarrRefs.length} orders in Dolibarr`);

      // 3. Check for deleted orders (but PRESERVE ALL - don't auto-delete when removed from Dolibarr)
      const dolibarrRefSet = new Set([
        ...allDolibarrRefs.map(o => cleanReference(o.refContrat)),
        ...allDolibarrRefs.map(o => cleanReference(o.ref))
      ]);
      
      // **MODIFICATION IMPORTANTE**: Ne plus supprimer automatiquement les commandes absentes de Dolibarr
      // Cela évite la suppression accidentelle des commandes lors de problèmes de synchronisation CRM
      const ordersToDelete: ADVOrder[] = []; // Array vide - aucune suppression automatique
      
      // Identifier les commandes qui ne sont plus dans Dolibarr (pour information seulement)
      const orphanedOrders = existingOrders.filter((fbOrder: ADVOrder) => 
        fbOrder.validation !== 'SUPPRIMÉ' && // Exclure les soft-deleted
        !fbOrder.isManuallyCreated && // Exclure les dossiers créés manuellement
        !dolibarrRefSet.has(cleanReference(fbOrder.refContrat || '')) && 
        !dolibarrRefSet.has(cleanReference(fbOrder.doliRef || ''))
      );
      
      console.log(`🗑️ Found ${orphanedOrders.length} orders no longer in Dolibarr (PRESERVED - no auto-deletion)`);
      console.log(`🛡️ Protecting ALL existing orders from automatic deletion`);

      // Compter les dossiers créés manuellement (pour info)
      const manualOrdersCount = existingOrders.filter((fbOrder: ADVOrder) => fbOrder.isManuallyCreated).length;
      console.log(`📝 Preserving ${manualOrdersCount} manually created orders`);

      // 4. Find missing orders
      const missingRefs = allDolibarrRefs.filter(doliOrder => 
        !existingRefs.has(cleanReference(doliOrder.refContrat)) && !existingRefs.has(cleanReference(doliOrder.ref))
      );
      
      console.log(`🆕 Found ${missingRefs.length} new orders to sync`);
      setSyncProgress(`🔄 ${missingRefs.length} nouvelles commandes, ${orphanedOrders.length} orphelines préservées, ${manualOrdersCount} manuelles`);
      
      if (missingRefs.length === 0) {
        console.log('✅ No new orders to sync - all existing orders preserved');
        setSyncProgress('✅ Aucune nouvelle commande - toutes les existantes préservées');
        setTimeout(() => setSyncProgress(''), 2000);
        return 0;
      }

      // **PLUS DE SUPPRESSION AUTOMATIQUE** - On garde tous les ordres existants
      let updatedOrders = existingOrders;

      // Pas de suppressions à effectuer, on passe directement à l'ajout des nouvelles commandes

      // 5. Fetch full details for missing orders
      setSyncProgress(`📦 Récupération de ${missingRefs.length} commandes manquantes...`);
      
      const newDolibarrOrders = [];
      const orderBatchSize = 10;
      
      for (let i = 0; i < missingRefs.length; i += orderBatchSize) {
        const batch = missingRefs.slice(i, i + orderBatchSize);
        setSyncProgress(`📦 Lot ${Math.floor(i/orderBatchSize) + 1}/${Math.ceil(missingRefs.length/orderBatchSize)}...`);
        
        const batchPromises = batch.map(async (refInfo: any) => {
          try {
            const orderResponse = await fetch(`https://www.diversifia.ma/crm/api/index.php/orders/${refInfo.id}`, {
              method: 'GET',
              headers: apiHeaders
            });
            if (orderResponse.ok) {
              return await orderResponse.json();
            }
          } catch (error) {
            console.error(`Error fetching order ${refInfo.ref}:`, error);
          }
          return null;
        });
        
        const batchResults = await Promise.all(batchPromises);
        newDolibarrOrders.push(...batchResults.filter(Boolean));
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (newDolibarrOrders.length === 0) {
        return 0;
      }
      
      // 6. Get unique thirdparty IDs
      const uniqueSocids = [...new Set(newDolibarrOrders.map((o: any) => o.socid?.toString()).filter(Boolean))];

      // 7. Fetch users (with caching)
      setSyncProgress('👤 Récupération des utilisateurs...');
      const userMap = new Map<string, string>();
      
      let cachedUsers = sessionStorage.getItem('dolibarr_users_cache');
      let cacheExpiry = sessionStorage.getItem('dolibarr_users_cache_expiry');
      
      if (cachedUsers && cacheExpiry && Date.now() < parseInt(cacheExpiry)) {
        const dolibarrUsers = JSON.parse(cachedUsers);
        for (const user of dolibarrUsers) {
          const fullName = `${user.firstname || ''} ${user.lastname || ''}`.trim();
          if (user.id) userMap.set(user.id.toString(), fullName || `User ${user.id}`);
          if (user.rowid) userMap.set(user.rowid.toString(), fullName || `User ${user.rowid}`);
        }
      } else {
        const usersResponse = await fetch('https://www.diversifia.ma/crm/api/index.php/users?sortfield=t.rowid&sortorder=ASC&limit=1000', {
          method: 'GET',
          headers: apiHeaders
        });

        if (usersResponse.ok) {
          const allUsers = await usersResponse.json();
          sessionStorage.setItem('dolibarr_users_cache', JSON.stringify(allUsers));
          sessionStorage.setItem('dolibarr_users_cache_expiry', (Date.now() + 10 * 60 * 1000).toString());
          
          for (const user of allUsers) {
            const fullName = `${user.firstname || ''} ${user.lastname || ''}`.trim();
            if (user.id) userMap.set(user.id.toString(), fullName || `User ${user.id}`);
            if (user.rowid) userMap.set(user.rowid.toString(), fullName || `User ${user.rowid}`);
          }
        }
      }

      // 8. Fetch thirdparties
      setSyncProgress('🏢 Récupération des tiers...');
      const thirdpartyMap = new Map<string, any>();
      
      const thirdpartyBatchSize = 15;
      const batches = [];
      for (let i = 0; i < uniqueSocids.length; i += thirdpartyBatchSize) {
        batches.push(uniqueSocids.slice(i, i + thirdpartyBatchSize));
      }
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        setSyncProgress(`🏢 Tiers ${batchIndex + 1}/${batches.length}...`);
        
        const batchPromises = batch.map(async (socid) => {
          try {
            const tpResponse = await fetch(`https://www.diversifia.ma/crm/api/index.php/thirdparties/${socid}`, {
              method: 'GET',
              headers: apiHeaders
            });
            
            if (!tpResponse.ok) return;
            
            const thirdparty = await tpResponse.json();
            
            let commercialName = '';
            try {
              const repsResponse = await fetch(`https://www.diversifia.ma/crm/api/index.php/thirdparties/${socid}/representatives`, {
                method: 'GET',
                headers: apiHeaders
              });
              
              if (repsResponse.ok) {
                const representatives = await repsResponse.json();
                if (Array.isArray(representatives) && representatives.length > 0) {
                  const mainRep = representatives[0];
                  commercialName = `${mainRep.firstname || ''} ${mainRep.lastname || ''}`.trim();
                }
              }
            } catch (repError) {}
            
            thirdpartyMap.set(socid as string, {
              name: thirdparty.name || thirdparty.nom || '',
              phone: thirdparty.phone || '',
              town: thirdparty.town || thirdparty.ville || '',
              state: thirdparty.state || thirdparty.departement || '',
              commercialName: commercialName
            });
            
          } catch (error) {
            console.error(`Error fetching thirdparty ${socid}:`, error);
          }
        });
        
        await Promise.all(batchPromises);
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // 9. Products cache
      const productMap = new Map<string, any>();
      let cachedProducts = sessionStorage.getItem('dolibarr_products_cache');
      let productCacheExpiry = sessionStorage.getItem('dolibarr_products_cache_expiry');
      
      if (cachedProducts && productCacheExpiry && Date.now() < parseInt(productCacheExpiry)) {
        const dolibarrProducts = JSON.parse(cachedProducts);
        for (const product of dolibarrProducts) {
          productMap.set(product.id?.toString(), {
            label: product.label || product.ref || '',
            ref: product.ref || ''
          });
        }
      } else {
        const productsResponse = await fetch('https://www.diversifia.ma/crm/api/index.php/products?sortfield=t.ref&sortorder=ASC&limit=1000', {
          method: 'GET',
          headers: apiHeaders
        });
        
        if (productsResponse.ok) {
          const dolibarrProducts = await productsResponse.json();
          sessionStorage.setItem('dolibarr_products_cache', JSON.stringify(dolibarrProducts));
          sessionStorage.setItem('dolibarr_products_cache_expiry', (Date.now() + 60 * 60 * 1000).toString());
          
          for (const product of dolibarrProducts) {
            productMap.set(product.id?.toString(), {
              label: product.label || product.ref || '',
              ref: product.ref || ''
            });
          }
        }
      }

      // Offre Orange mapping
      const offreMap: { [key: number]: string } = {
        1: "BUSINESS BOX FIXE 249 AE", 2: "TDLTE", 3: "FIBRE 20M ESE", 4: "FIBRE 50M ESE", 5: "FIBRE 100M ESE", 6: "FIBRE 200M ESE",
        7: "FF Orange Pro 6H+6Go ST", 8: "Forfait Orange Pro 15H+15Go ST", 10: "Forfait illimité national + ST", 11: "FF illimité pro national ST",
        12: "FF illimité Pro Silver ST", 31: "FF illimité Pro Premium ST", 13: "FF illimité Pro Gold ST", 32: "Forfait Pro Connect 15 ST",
        33: "FORFAIT PRO CONNECT 30 ST", 34: "Forfait Pro CONNECT 70Go ST", 35: "Forfait Pro Connect 40 ST", 14: "Wifi Pro Pack Connect",
        15: "Wifi Pro Connect +", 16: "Smart-fax limité 29dh", 17: "BUSINESS BOX 4G 249", 18: "BUSINESS BOX 4G + 349", 23: "SIM Only BBOX FIXE 249",
        24: "SIM ONLY – BUSINESS BOX 4G+", 25: "SIM ONLY – BUSINESS BOX 4G Premium", 26: "Pack Forfait Orange Pro 6H", 27: "Pack Forfait Pro Connect 15",
        28: "BUSINESS BOX FIXE+ 349 AE", 29: "SIM Only BBOX FIXE+ 349", 30: "ADSL", 19: "BUSINESS BOX FIXE 249 SE", 20: "FF Orange Pro 25H+25Go ST",
        21: "Smart-fax limité 99dh", 40: "Partage FIBRE 20M ESE", 41: "Partage FIBRE 50M ESE", 42: "Partage FIBRE 100M ESE", 43: "Partage FIBRE 200M ESE",
        60: "Forfait Orange Pro 40H ST", 61: "Forfait Orange Pro 50H ST", 62: "Forfait Pro CONNECT 100Go ST", 63: "Internet Mobile Pro 35 Go",
        64: "Internet Mobile Pro 80 Go", 65: "Internet Mobile Pro 100 Go", 66: "Internet Mobile Pro 150 Go", 50: "BUSINESS BOX 5G"
      };

      // 10. Transform new orders
      setSyncProgress(`🔄 Transformation de ${newDolibarrOrders.length} nouvelles commandes...`);
      
      const newTransformedOrders: ADVOrder[] = [];

      for (let index = 0; index < newDolibarrOrders.length; index++) {
        const doliOrder = newDolibarrOrders[index];
        
        if ((index + 1) % 10 === 0 || index === newDolibarrOrders.length - 1) {
          setSyncProgress(`🔄 Traitement: ${index + 1}/${newDolibarrOrders.length} nouvelles commandes...`);
        }
        
        const ref = doliOrder.ref;
        const extraFields = doliOrder.array_options || {};
        
        const thirdpartyId = doliOrder.socid?.toString();
        const thirdpartyInfo = thirdpartyId ? thirdpartyMap.get(thirdpartyId) : null;
        
        const userId = doliOrder.user_author_id || doliOrder.fk_user_author;
        let authorName = userMap.get(userId?.toString());
        
        if (!authorName && userId) {
          try {
            const userResponse = await fetch(`https://www.diversifia.ma/crm/api/index.php/users/${userId}`, {
              method: 'GET',
              headers: apiHeaders
            });
            if (userResponse.ok) {
              const userData = await userResponse.json();
              authorName = `${userData.firstname || ''} ${userData.lastname || ''}`.trim();
              userMap.set(userId.toString(), authorName);
            }
          } catch (e) {}
        }
        authorName = authorName || `ID:${userId}`;
        
        const lineExtraFields = doliOrder.lines?.[0]?.array_options || {};
        const offreCode = parseInt(lineExtraFields.options_vad_vel || '0');
        const offreOrange = offreMap[offreCode] || 'À qualifier';
        const villeAdr = lineExtraFields.options_vad_adr || thirdpartyInfo?.town || '';
        
        const refContrat = cleanReference(extraFields.options_val_cont || ref);
        
        const newOrder: ADVOrder = {
          id: generateId('DOLI'),
          refContrat: refContrat,
          dateDepot: new Date(doliOrder.date_creation * 1000).toISOString().slice(0, 16),
          dateSaisi: getNowLocal(),
          commercial: cleanReference(authorName),
          raisonSociale: cleanReference(thirdpartyInfo?.name || 'Client Inconnu'),
          telephone: cleanReference(thirdpartyInfo?.phone || ''),
          offre: cleanReference(offreOrange),
          ville: cleanReference(villeAdr),
          validation: 'EN ATTENTE',
          etape: 'ÉTUDE',
          statutSi: 'En Etudes',
          isConfirmed: false,
          dateTraitement: getNowLocal(),
          prestataire: '',
          nFixe: cleanReference(extraFields.options_ndelignefixe || ''),
          nSerie: cleanReference(extraFields.options_esnicc || ''),
          doliRef: cleanReference(ref),
          // Marquer comme importé de Dolibarr (pas créé manuellement)
          isManuallyCreated: false
        };
        
        newTransformedOrders.push(newOrder);
      }
      
      // 11. CRITICAL FIX: Re-read Firebase RIGHT BEFORE merge to avoid overwriting concurrent user saves
      setSyncProgress('💾 Fusion des données...');
      
      const freshOrders = await getCloudData('adv_orders') || [];
      const freshRefs = new Set(freshOrders.map((o: ADVOrder) => cleanReference(o.refContrat || o.doliRef || '')));
      
      // Only add orders that are truly new (not added by a user during the sync window)
      const trulyNewOrders = newTransformedOrders.filter(o => 
        !freshRefs.has(cleanReference(o.refContrat || '')) && !freshRefs.has(cleanReference(o.doliRef || ''))
      );
      
      const finalOrders = [...freshOrders, ...trulyNewOrders];
      
      const saved = await saveCloudData('adv_orders', finalOrders);
      if (!saved) {
        console.error('❌ Échec de la sauvegarde cloud après sync!');
        setSyncProgress('❌ Erreur de sauvegarde - les données n\'ont peut-être pas été enregistrées');
        setTimeout(() => setSyncProgress(''), 5000);
        return 0;
      }
      setOrders(finalOrders);
      
      console.log(`✅ Sync complete: +${trulyNewOrders.length} new orders added (total: ${finalOrders.length}) - NO AUTO-DELETIONS`);
      const successMsg = `✅ +${trulyNewOrders.length} nouvelles commandes ajoutées (total: ${finalOrders.length})`;
      setSyncProgress(successMsg);
      
      setTimeout(() => setSyncProgress(''), 3000);
      return trulyNewOrders.length;
      
    } catch (error: any) {
      console.error("Erreur Sync:", error);
      setSyncProgress('❌ Erreur: ' + (error.message || 'Sync échouée'));
      setTimeout(() => setSyncProgress(''), 5000);
      throw error;
    } finally {
      setIsSyncing(false);
      isBusy.current = false;
      // ⚠️ Ne PAS effacer syncProgress ici — le setTimeout ci-dessus s'en charge
    }
  };

 const handleSyncDolibarr = async () => {
    // Prevent sync when modal is open to avoid interrupting user work
    if (showModal) {
      alert("⚠️ Impossible de synchroniser pendant la saisie d'un dossier. Fermez d'abord le formulaire.");
      return;
    }
    
    try {
      await runFullSync(true);
      alert("✅ Synchronisation Dolibarr terminée !");
    } catch (error: any) {
      console.error("Erreur synchronisation Dolibarr:", error);
      alert("❌ Erreur lors de la synchronisation : " + error.message);
    }
  };

  const handleSaveOrder = async () => {
    if (!formOrder.raisonSociale || !formOrder.offre) return alert("Raison sociale et Offre requises.");
    if (isBusy.current) return alert("⏳ Une opération est en cours, veuillez patienter.");
    
    isBusy.current = true;
    setIsSaving(true);
    const now = new Date().toISOString();
    
    try {
      let finalDateValidation = formOrder.dateValidation;
      if (formOrder.validation === 'VALIDE' && !finalDateValidation) {
          finalDateValidation = now;
      }

      const newOrder: ADVOrder = {
        ...formOrder as ADVOrder,
        id: editingOrder ? editingOrder.id : generateId('ADV'),
        dateSaisi: editingOrder ? editingOrder.dateSaisi : now,
        dateTraitement: now,
        dateValidation: finalDateValidation,
        commercial: formOrder.commercial || user.associatedAgentName || 'Inconnu',
        validation: formOrder.validation || 'EN ATTENTE',
        etape: formOrder.etape || 'ÉTUDE',
        statutSi: formOrder.statutSi || 'En Etudes',
        isManuallyCreated: editingOrder ? editingOrder.isManuallyCreated : true,
        lastEditedAt: now, // Track user edit timestamp for safe deduplication
        refContrat: cleanReference(formOrder.refContrat || ''),
        dateDepot: formOrder.dateDepot || now.split('T')[0],
        telephone: cleanReference(formOrder.telephone || ''),
        ville: cleanReference(formOrder.ville || ''),
        offre: cleanReference(formOrder.offre || ''),
        raisonSociale: cleanReference(formOrder.raisonSociale || ''),
        prestataire: formOrder.prestataire || '',
        nFixe: cleanReference(formOrder.nFixe || ''),
        nSerie: cleanReference(formOrder.nSerie || ''),
        nSerieVerifie: cleanReference(formOrder.nSerieVerifie || ''),
        dateSerieVerifie: formOrder.dateSerieVerifie || '',
        isConfirmed: formOrder.isConfirmed || false,
        dateGo: formOrder.dateGo,
        linkCrm: formOrder.linkCrm || '', 
        raisonBlocage: formOrder.raisonBlocage || '',
        raisonBlocageSi: formOrder.raisonBlocageSi || ''
      };

      // CRITICAL FIX: Read fresh data from Firebase before merge (not stale React state)
      const freshOrders: ADVOrder[] = await getCloudData('adv_orders') || [];
      
      let updatedOrders: ADVOrder[];
      if (editingOrder) {
        updatedOrders = freshOrders.map(o => o.id === editingOrder.id ? newOrder : o);
      } else {
        updatedOrders = [newOrder, ...freshOrders];
      }

      // --- UPDATE STOCK STATUS IF SERIAL IS VERIFIED AND NOT DEPOSITED BEFORE ---
      if (formOrder.nSerieVerifie && !editingOrder?.nSerieVerifie) {
        try {
          const stockUnits = await getCloudData('stock_units') || [];
          const updatedUnits = stockUnits.map((unit: any) => {
            if (unit.serialNumber === formOrder.nSerieVerifie && unit.status !== 'deposited') {
              return { ...unit, status: 'deposited', lastMovementDate: now.split('T')[0] };
            }
            return unit;
          });
          if (updatedUnits.some((u: any) => u.serialNumber === formOrder.nSerieVerifie)) {
            const stockSaved = await saveCloudData('stock_units', updatedUnits);
            if (!stockSaved) console.warn('⚠️ Stock status update may have failed');
          }
        } catch (error) {
          console.error('Error updating stock status:', error);
          alert('⚠️ La commande a été sauvegardée mais la mise à jour du stock a échoué.');
        }
      }

      // Save to cloud FIRST, then update UI
      const saved = await saveCloudData('adv_orders', updatedOrders);
      if (!saved) {
        alert('❌ Erreur de sauvegarde cloud. Vos modifications n\'ont peut-être pas été enregistrées. Vérifiez votre connexion et réessayez.');
        return;
      }
      
      setOrders(updatedOrders);
      setShowModal(false);
      setEditingOrder(null);
      setFormOrder({});
    } catch (error) {
      console.error('Error saving order:', error);
      alert('❌ Erreur lors de la sauvegarde : ' + (error instanceof Error ? error.message : 'Erreur inconnue'));
    } finally {
      setIsSaving(false);
      isBusy.current = false;
    }
  };

  const handleDeleteOrder = async (id: string) => {
    if (!canDelete) return alert("Permission refusée.");
    if (isBusy.current) return alert("⏳ Une opération est en cours, veuillez patienter.");
    if (confirm("Supprimer ce dossier ?")) {
      isBusy.current = true;
      try {
        // CRITICAL FIX: Read fresh data from Firebase (not stale React state)
        const freshOrders: ADVOrder[] = await getCloudData('adv_orders') || [];
        const updatedOrders = freshOrders.map(o => 
          o.id === id ? { ...o, validation: 'SUPPRIMÉ' as ADVValidationStatus, lastEditedAt: new Date().toISOString() } : o
        );
        const saved = await saveCloudData('adv_orders', updatedOrders);
        if (!saved) {
          alert('❌ Erreur de sauvegarde. La suppression n\'a peut-être pas été enregistrée.');
          return;
        }
        setOrders(updatedOrders);
      } catch (error) {
        console.error('Error deleting order:', error);
        alert('❌ Erreur lors de la suppression.');
      } finally {
        isBusy.current = false;
      }
    }
  };

  const handleRestoreOrder = async (id: string) => {
    if (!canDelete) return alert("Permission refusée.");
    if (isBusy.current) return alert("⏳ Une opération est en cours, veuillez patienter.");
    if (confirm("Restaurer ce dossier ?")) {
      isBusy.current = true;
      try {
        // CRITICAL FIX: Read fresh data from Firebase (not stale React state)
        const freshOrders: ADVOrder[] = await getCloudData('adv_orders') || [];
        const updatedOrders = freshOrders.map(o => 
          o.id === id ? { ...o, validation: 'EN ATTENTE' as ADVValidationStatus, lastEditedAt: new Date().toISOString() } : o
        );
        const saved = await saveCloudData('adv_orders', updatedOrders);
        if (!saved) {
          alert('❌ Erreur de sauvegarde. La restauration n\'a peut-être pas été enregistrée.');
          return;
        }
        setOrders(updatedOrders);
      } catch (error) {
        console.error('Error restoring order:', error);
        alert('❌ Erreur lors de la restauration.');
      } finally {
        isBusy.current = false;
      }
    }
  };

  const openModal = (order?: ADVOrder) => {
    if (order) {
      setEditingOrder(order);
      setFormOrder(order);
      // Check serial status if editing existing order
      if (order.nSerieVerifie) {
        checkSerialStatus(order.nSerieVerifie);
      }
    } else {
      setEditingOrder(null);
      setFormOrder({
        dateDepot: new Date().toISOString().split('T')[0],
        validation: 'EN ATTENTE',
        etape: 'ÉTUDE',
        statutSi: 'En Etudes',
        commercial: user.associatedAgentName,
        isConfirmed: false
      });
      setSerialStatus(null);
    }
    setShowModal(true);
  };

  const counts = useMemo(() => {
    const activeOrders = orders.filter(o => o.validation !== 'SUPPRIMÉ');
    return {
      all: activeOrders.length,
      adv: activeOrders.filter(o => o.validation === 'EN ATTENTE' || o.validation === 'BLOQUÉ').length,
      activation: activeOrders.filter(o => o.validation === 'VALIDE' && o.statutSi !== 'Facturé' && o.statutSi !== 'Annulé').length,
      archives: activeOrders.filter(o => o.validation === 'ANNULÉ' || (o.validation === 'VALIDE' && (o.statutSi === 'Facturé' || o.statutSi === 'Annulé'))).length,
      deleted: orders.filter(o => o.validation === 'SUPPRIMÉ').length
    };
  }, [orders]);
  
  const waitingActivCount = useMemo(() => orders.filter(o => o.statutSi === 'A traiter' && o.validation === 'VALIDE').length, [orders]);
  
  const uniqueSousEtatSi = useMemo(() => {
    const s = new Set<string>();
    orders.forEach(o => { if (o.raisonBlocageSi) s.add(o.raisonBlocageSi); });
    return Array.from(s).sort();
  }, [orders]);

  const uniqueProduits = useMemo(() => {
    const s = new Set<string>();
    orders.forEach(o => { if (o.offre) s.add(o.offre); });
    return Array.from(s).sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return orders.filter(o => {
      const matchSearch = (o.refContrat || '').toLowerCase().includes(s) || (o.raisonSociale || '').toLowerCase().includes(s) || (o.telephone || '').includes(s) || (o.commercial || '').toLowerCase().includes(s) || (o.offre || '').toLowerCase().includes(s);
      let matchDate = true;
      if (filterDateStart) matchDate = matchDate && new Date(o.dateDepot) >= new Date(filterDateStart);
      if (filterDateEnd) { const end = new Date(filterDateEnd); end.setHours(23, 59, 59); matchDate = matchDate && new Date(o.dateDepot) <= end; }
      if (filterStatusAdv.length > 0 && !filterStatusAdv.includes(o.validation)) return false;
      if (filterStatusSi.length > 0 && !filterStatusSi.includes(o.statutSi || '')) return false;
      if (filterCommercial.length > 0 && !filterCommercial.includes(o.commercial)) return false;
      if (filterPrestataire.length > 0 && !filterPrestataire.includes(o.prestataire || '')) return false;
      if (filterProduit.length > 0 && !filterProduit.includes(o.offre)) return false;
      if (filterSousEtatAdv.length > 0 && !filterSousEtatAdv.includes(o.raisonBlocage || '')) return false;
      if (filterSousEtatSi.length > 0 && !filterSousEtatSi.includes(o.raisonBlocageSi || '')) return false;
      if (filterCategory) { if (getCategoryFromOffer(o.offre) !== filterCategory) return false; }
      let matchView = false;
      if (activeView === 'deleted') matchView = o.validation === 'SUPPRIMÉ';
      else if (activeView === 'all') matchView = o.validation !== 'SUPPRIMÉ';
      else if (activeView === 'adv') matchView = o.validation === 'EN ATTENTE' || o.validation === 'BLOQUÉ';
      else if (activeView === 'activation') matchView = o.validation === 'VALIDE' && o.statutSi !== 'Facturé' && o.statutSi !== 'Annulé';
      // Fix: Removed redundant '&& o.validation !== 'SUPPRIMÉ'' check on line 748 which caused TypeScript error
      else if (activeView === 'archives') matchView = (o.validation === 'ANNULÉ' || (o.validation === 'VALIDE' && (o.statutSi === 'Facturé' || o.statutSi === 'Annulé')));
      return matchSearch && matchDate && matchView;
    }).sort((a, b) => new Date(b.dateDepot || 0).getTime() - new Date(a.dateDepot || 0).getTime());
  }, [orders, searchTerm, activeView, filterDateStart, filterDateEnd, filterStatusAdv, filterStatusSi, filterCommercial, filterPrestataire, filterProduit, filterSousEtatAdv, filterSousEtatSi, filterCategory]);

  const slaByProduct = useMemo(() => {
    const stats: Record<string, { countAdv: number, sumAdv: number, countAct: number, sumAct: number }> = {};
    orders.forEach(o => {
      const p = o.offre || 'Autre';
      if (!stats[p]) stats[p] = { countAdv: 0, sumAdv: 0, countAct: 0, sumAct: 0 };
      if (o.dateDepot && o.dateValidation) {
        const diff = new Date(o.dateValidation).getTime() - new Date(o.dateDepot).getTime();
        if (diff > 0) { stats[p].countAdv++; stats[p].sumAdv += diff; }
      }
      if (o.dateValidation && o.dateActivationEnd) {
        const diff = new Date(o.dateActivationEnd).getTime() - new Date(o.dateValidation).getTime();
        if (diff > 0) { stats[p].countAct++; stats[p].sumAct += diff; }
      }
    });
    return Object.entries(stats).map(([name, s]) => ({
      name,
      avgAdv: s.countAdv > 0 ? Math.round(s.sumAdv / s.countAdv / 3600000) : 0,
      avgAct: s.countAct > 0 ? Math.round(s.sumAct / s.countAct / 86400000) : 0
    })).filter(x => x.avgAdv > 0 || x.avgAct > 0).sort((a,b) => b.avgAdv - a.avgAdv);
  }, [orders]);

  const resetFilters = () => { setSearchTerm(''); setFilterDateStart(''); setFilterDateEnd(''); setFilterStatusAdv([]); setFilterStatusSi([]); setFilterCommercial([]); setFilterPrestataire([]); setFilterProduit([]); setFilterSousEtatAdv([]); setFilterSousEtatSi([]); setFilterCategory(null); };

  const checkSerialStatus = async (serialNumber: string) => {
    if (!serialNumber || serialNumber.length < 3) {
      setSerialStatus(null);
      return;
    }
    
    try {
      const stockUnits = await getCloudData('stock_units') || [];
      const unit = stockUnits.find((u: any) => u.serialNumber === serialNumber);
      
      if (unit) {
        setSerialStatus({
          status: unit.status,
          owner: unit.currentOwner,
          exists: true
        });
      } else {
        setSerialStatus({ exists: false });
      }
    } catch (error) {
      console.error('Error checking serial status:', error);
      setSerialStatus(null);
    }
  };

  const getSerialStatusColor = () => {
    if (!serialStatus?.exists) return 'text-slate-400';
    
    switch (serialStatus.status) {
      case 'available': return 'text-emerald-600';
      case 'assigned': return 'text-blue-600'; 
      case 'deposited': return 'text-red-600';
      case 'sold': return 'text-purple-600';
      case 'pending_payment': return 'text-orange-600';
      case 'defective': return 'text-rose-600';
      case 'lost': return 'text-gray-600';
      default: return 'text-slate-600';
    }
  };

  const getSerialStatusText = () => {
    if (!serialStatus) return '';
    if (!serialStatus.exists) return 'Non trouvé dans le stock';
    
    const statusLabels = {
      'available': 'Disponible',
      'assigned': 'Assigné', 
      'deposited': 'Déposé',
      'sold': 'Vendu',
      'pending_payment': 'Paiement en attente',
      'defective': 'Défectueux',
      'lost': 'Perdu'
    };
    
    const statusText = statusLabels[serialStatus.status as keyof typeof statusLabels] || serialStatus.status;
    return `${statusText} - ${serialStatus.owner}`;
  };

  const askGemini = async () => {
    if (!aiInput.trim()) return;
    setIsAiThinking(true);
    setAiChat(prev => [...prev, { role: 'user', content: aiInput }]);
    setAiInput('');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: `Assistant ADV. Stats: ${filteredOrders.length} dossiers. Question: ${aiInput}` });
      setAiChat(prev => [...prev, { role: 'assistant', content: response.text || "Erreur." }]);
    } catch (e) { setAiChat(prev => [...prev, { role: 'assistant', content: "Erreur connexion." }]); } finally { setIsAiThinking(false); }
  };

  const SidebarItem = ({ id, label, icon: Icon, count, color }: any) => (
    <button onClick={() => { setActiveView(id); resetFilters(); }} className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-300 mb-2 group ${activeView === id ? `bg-slate-900 text-white shadow-lg` : 'bg-white text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-200'}`}>
      <div className="flex items-center gap-3"><div className={`p-2 rounded-xl ${activeView === id ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-white'}`}><Icon className={`w-5 h-5 ${activeView === id ? 'text-white' : color}`} /></div><span className="text-xs font-black uppercase tracking-wider">{label}</span></div>
      {count !== undefined && <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${activeView === id ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-400'}`}>{count}</span>}
    </button>
  );

  return (
    <div className="w-full px-6 py-6 h-[calc(100vh-80px)] flex gap-6 items-start">
      
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-2 overflow-y-auto custom-scrollbar pb-4 h-full">
        <div className="mb-4 px-2"><h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Portail ADV</h2><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Workflow Commandes</p></div>
        
        <div className="grid grid-cols-2 gap-2 mb-4 px-1">
           <div onClick={() => { resetFilters(); setActiveView('adv'); }} className="bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 group transition-all"><span className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1 group-hover:text-slate-600">Attente ADV</span><span className="text-xl font-black text-rose-600 leading-none">{counts.adv}</span></div>
           <div onClick={() => { setActiveView('activation'); setFilterStatusSi(['A traiter']); }} className="bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 group transition-all"><span className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1 group-hover:text-slate-600">SI À Traiter</span><span className="text-xl font-black text-rose-600 leading-none">{waitingActivCount}</span></div>
        </div>

        <SidebarItem id="all" label="Vue Globale" icon={LayoutList} color="text-slate-400" count={counts.all} />
        <div className="h-px bg-slate-200 my-2 mx-4"></div>
        <SidebarItem id="adv" label="A Valider (ADV)" icon={Clock} color="text-amber-500" count={counts.adv} />
        <SidebarItem id="activation" label="Suivi Activation" icon={CheckCircle2} color="text-emerald-500" count={counts.activation} />
        <SidebarItem id="archives" label="Archives / Rejet" icon={Archive} color="text-rose-500" count={counts.archives} />
        <SidebarItem id="deleted" label="Corbeille" icon={Trash2} color="text-slate-400" count={counts.deleted} />
        
        <div className="mt-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-4">
           <div className="flex justify-between items-center border-b border-slate-50 pb-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center"><ListFilter className="w-3.5 h-3.5 mr-1.5" /> Filtres Avancés</p>
              {(filterStatusAdv.length > 0 || filterStatusSi.length > 0 || filterCommercial.length > 0 || filterPrestataire.length > 0 || filterProduit.length > 0) && (
                <button onClick={resetFilters} title="Effacer filtres" className="text-rose-500 hover:text-rose-700 transition-colors"><FilterX className="w-3.5 h-3.5" /></button>
              )}
           </div>
           <MultiSelect label="Statut ADV" options={['EN ATTENTE', 'VALIDE', 'BLOQUÉ', 'ANNULÉ']} selected={filterStatusAdv} onChange={setFilterStatusAdv} colorClass="text-orange-500" />
           <MultiSelect label="Statut Activation" options={Object.keys(SI_STATUS_COLORS)} selected={filterStatusSi} onChange={setFilterStatusSi} colorClass="text-blue-500" />
           <MultiSelect label="Vendeur" options={salesAgents} selected={filterCommercial} onChange={setFilterCommercial} colorClass="text-slate-500" />
           <MultiSelect label="Prestataire" options={PRESTATAIRES} selected={filterPrestataire} onChange={setFilterPrestataire} colorClass="text-slate-500" />
        </div>

        <div className="mt-auto bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
           <div className="flex justify-between items-center mb-2"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5" /> Période</p>{(filterDateStart || filterDateEnd) && <button onClick={() => { setFilterDateStart(''); setFilterDateEnd(''); }} className="text-rose-500 hover:text-rose-700"><XCircle className="w-3.5 h-3.5" /></button>}</div>
           <div className="space-y-2">
             <div className="relative"><label className="text-[8px] font-black uppercase text-slate-400 ml-2 absolute -top-1.5 left-2 bg-white px-1">Du</label><input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-600 shadow-inner" /></div>
             <div className="relative"><label className="text-[8px] font-black uppercase text-slate-400 ml-2 absolute -top-1.5 left-2 bg-white px-1">Au</label><input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-600 shadow-inner" /></div>
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-0">
        {/* TOP BAR / SEARCH */}
        <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-slate-100 mb-6 flex flex-wrap items-center gap-3">
           <div className="relative flex-grow min-w-[200px] group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-[#ff7900] transition-colors" />
              <input type="text" placeholder="Rechercher (Client, Réf, Tel, Produit...)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-50 border-none text-xs font-bold shadow-inner focus:ring-2 focus:ring-[#ff7900]/20 transition-all" />
           </div>
           
           <div className="flex items-center gap-2">
              <button onClick={() => setShowSlaSummary(!showSlaSummary)} className={`p-3.5 rounded-2xl transition-all shadow-sm border ${showSlaSummary ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`} title="Performance SLA par Offre">
                 <Timer className="w-5 h-5" />
              </button>
              <button onClick={() => setShowAiPanel(!showAiPanel)} className={`p-3.5 rounded-2xl transition-all shadow-sm border ${showAiPanel ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-100 text-slate-400 hover:bg-slate-50'}`}>
                 <Sparkles className="w-5 h-5" />
              </button>
              <div className="w-px h-8 bg-slate-100 mx-1"></div>
              {hasWritePerm && (
                <>
                  <button onClick={loadData} disabled={isSyncing || showModal} className={`p-3.5 rounded-2xl transition-all shadow-sm border ${showModal ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-200'}`} title={showModal ? "Impossible pendant la saisie" : "Actualiser les données"}>
                    <RefreshCcw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                  </button>
                  <button onClick={handleSyncDolibarr} disabled={isSyncing || showModal} className={`hidden sm:flex px-5 py-3.5 border rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all items-center shadow-sm ${showModal ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`} title={showModal ? "Impossible pendant la saisie" : "Synchroniser avec Dolibarr"}>
                     <CloudDownload className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-bounce' : ''}`} />
                     Sync Doli
                  </button>
                  <button onClick={() => openModal()} className="px-7 py-3.5 bg-[#ff7900] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-slate-900 transition-all flex items-center">
                    <Plus className="w-4 h-4 mr-2" /> Nouveau
                  </button>
                </>
              )}
           </div>
        </div>

        {/* TABLE CONTAINER */}
        <div className="flex-1 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
           {/* HEADER TABLEAU AVEC TOTAL FILTRÉ */}
           <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/40">
              <div className="flex items-center gap-4">
                 <h3 className="text-sm font-black uppercase text-slate-800 tracking-widest flex items-center">
                   {activeView === 'adv' && <><Clock className="w-4 h-4 mr-2 text-amber-500" /> Validation ADV</>}
                   {activeView === 'activation' && <><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" /> Suivi Activation</>}
                   {activeView === 'archives' && <><Archive className="w-4 h-4 mr-2 text-rose-500" /> Archives / Historique</>}
                   {activeView === 'all' && <><LayoutList className="w-4 h-4 mr-2 text-slate-500" /> Vue Globale</>}
                   {activeView === 'deleted' && <><Trash2 className="w-4 h-4 mr-2 text-slate-400" /> Corbeille</>}
                 </h3>
                 <div className="bg-white border border-slate-200 rounded-full px-3 py-1 flex items-center shadow-sm">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse mr-2"></div>
                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">{filteredOrders.length} dossiers filtrés</span>
                 </div>
              </div>
              
              <div className="flex items-center gap-2">
                 <div className="flex gap-1.5 hidden xl:flex mr-4">
                    {Object.entries(filteredOrders.reduce((acc: any, o) => {
                       const cat = getCategoryFromOffer(o.offre);
                       acc[cat] = (acc[cat] || 0) + 1;
                       return acc;
                    }, {})).sort((a: any, b: any) => b[1] - a[1]).map(([cat, count]: [any, any]) => (
                       <button 
                         key={cat} 
                         onClick={() => setFilterCategory(filterCategory === cat ? null : cat)}
                         className={`text-[9px] font-black px-2.5 py-1.5 rounded-lg border whitespace-nowrap transition-all shadow-sm ${filterCategory === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'text-indigo-600 bg-white border-indigo-100 hover:bg-indigo-50'}`}
                       >
                          {cat} ({count})
                       </button>
                    ))}
                 </div>
              </div>
           </div>
           
           {/* TABLE DATA */}
           <div className="flex-1 overflow-auto custom-scrollbar p-2">
              <table className="w-full text-left border-collapse">
                 <thead className="bg-white text-[9px] font-black uppercase text-slate-400 sticky top-0 z-10 shadow-sm">
                    <tr>
                       <th className="p-4 w-[16%]">Client / Réf</th>
                       <th className="p-4 w-[10%]">Téléphone</th>
                       <th className="p-4 w-[9%]">Offre</th>
                       <th className="p-4 w-[11%] text-center">Validation</th>
                       <th className="p-4 w-[9%] text-center bg-orange-50/20 text-orange-600">SLA ADV</th>
                       <th className="p-4 w-[11%] text-center">Statut SI</th>
                       <th className="p-4 w-[9%] text-center bg-blue-50/20 text-blue-600">SLA ACTIV.</th>
                       <th className="p-4 w-[7%] text-center">Date GO</th>
                       <th className="p-4 w-[7%]">Commercial</th>
                       <th className="p-4 text-right w-[11%]">Action</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredOrders.map(order => (
                       <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="p-4">
                             <div className="font-black text-slate-800 text-xs truncate max-w-[150px] uppercase italic tracking-tight">{order.raisonSociale}</div>
                             <div className="flex items-center mt-1 space-x-2">
                               <span className="text-[9px] font-bold text-slate-400 font-mono bg-slate-100 px-1.5 rounded border border-slate-200">{order.refContrat}</span>
                               <span className="text-[9px] text-slate-400 flex items-center font-bold tracking-tight"><Calendar className="w-2.5 h-2.5 mr-1" /> {new Date(order.dateDepot).toLocaleDateString()} {new Date(order.dateDepot).toLocaleTimeString()}</span>

                             </div>
                          </td>
                          <td className="p-4">
                             <span className="text-[9px] font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200 font-mono truncate max-w-[120px] block">
                               {order.telephone || '-'}
                             </span>
                          </td>
                          <td className="p-4">
                             <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 truncate max-w-[100px] block uppercase tracking-tight" title={order.offre}>
                               {order.offre}
                             </span>
                          </td>
                          <td className="p-4 text-center">
                             <div className="flex flex-col items-center">
                               <span className={`text-[8px] font-black uppercase px-2 py-1 rounded border mb-1 shadow-sm ${STATUS_COLORS[order.validation] || 'bg-slate-100 text-slate-500'}`}>
                                  {order.validation}
                               </span>
                               <span className="text-[8px] text-slate-400 italic leading-tight max-w-[100px] truncate font-medium">{order.raisonBlocage || '-'}</span>
                             </div>
                          </td>
                          <td className="p-4 text-center bg-orange-50/10 font-black text-[10px] text-orange-600 italic">
                             {calculateSLA(order.dateDepot, order.dateValidation || undefined)}
                          </td>
                          <td className="p-4 text-center">
                             <div className="flex flex-col items-center">
                               <span className={`text-[8px] font-black px-2 py-1 rounded border mb-1 shadow-sm ${SI_STATUS_COLORS[order.statutSi || ''] || 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                  {order.statutSi || '-'}
                               </span>
                               <span className="text-[8px] text-slate-400 italic leading-tight max-w-[100px] truncate font-medium">{order.raisonBlocageSi || '-'}</span>
                             </div>
                          </td>
                          <td className="p-4 text-center bg-blue-50/10 font-black text-[10px] text-blue-600 italic">
                             {order.dateValidation ? calculateSLA(order.dateValidation, order.dateActivationEnd || undefined) : "-"}
                          </td>
                          <td className="p-4 text-center">
                             {order.dateGo ? (
                               <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-600 text-[9px] font-black border border-indigo-100 whitespace-nowrap shadow-sm">{new Date(order.dateGo).toLocaleDateString()}</span>
                             ) : (
                               <span className="text-slate-300 text-[9px] font-black">-</span>
                             )}
                          </td>
                          <td className="p-4">
                             <div className="flex items-center space-x-2">
                                <div className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[9px] font-black border border-slate-700 shadow-sm">{order.commercial?.charAt(0)}</div>
                                <span className="text-[10px] font-black text-slate-700 truncate max-w-[100px] uppercase tracking-tighter">{order.commercial}</span>

                             </div>
                          </td>
                          <td className="p-4 text-right">
                             <div className="flex items-center justify-end gap-2">
                                {activeView === 'deleted' ? (
                                  <>
                                    <button onClick={() => openModal(order)} className="bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center transition-all shadow-sm"><Edit3 className="w-3.5 h-3.5" /></button>
                                    {canDelete && <button onClick={() => handleRestoreOrder(order.id)} className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-600 hover:bg-emerald-100 transition-colors text-[9px] font-black uppercase flex items-center gap-1 shadow-sm"><RotateCcw className="w-3.5 h-3.5" /> Restaurer</button>}
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => openModal(order)} className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase flex items-center transition-all shadow-sm ${activeView === 'adv' ? 'bg-slate-900 text-white hover:bg-[#ff7900] shadow-md border border-slate-700' : 'bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-100'}`}>
                                       {activeView === 'adv' ? 'Traiter' : <Edit3 className="w-3.5 h-3.5" />}
                                    </button>
                                    {canDelete && <button onClick={() => handleDeleteOrder(order.id)} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-300 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button>}
                                  </>
                                )}
                             </div>
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
              {filteredOrders.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-slate-300">
                   <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
                      <Search className="w-10 h-10 text-slate-100" />
                   </div>
                   <p className="font-black uppercase text-xs tracking-[0.2em] text-slate-400">Aucun dossier trouvé pour ces critères</p>
                </div>
              )}
           </div>
        </div>
      </div>

      {/* SLA SUMMARY OVERLAY */}
      {showSlaSummary && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-300 border border-slate-100">
              <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
                 <div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">Cockpit Performance SLA</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Délais moyens par catégorie d'offre</p>
                 </div>
                 <button onClick={() => setShowSlaSummary(false)} className="p-2 bg-white rounded-full border border-slate-100 shadow-sm hover:bg-slate-50"><X className="w-6 h-6 text-slate-300 hover:text-slate-600" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                 <table className="w-full text-left">
                    <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                       <tr><th className="p-4 rounded-tl-xl">Offre</th><th className="p-4 text-center">ADV (Moy. Heures)</th><th className="p-4 text-center rounded-tr-xl">Activation (Moy. Jours)</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {slaByProduct.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                             <td className="p-4 font-black text-xs text-slate-700 uppercase tracking-tighter">{p.name}</td>
                             <td className="p-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                   <span className={`px-3 py-1 rounded-lg font-black text-[10px] shadow-sm border ${p.avgAdv > 24 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                      {p.avgAdv}h
                                   </span>
                                </div>
                             </td>
                             <td className="p-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                   <span className={`px-3 py-1 rounded-lg font-black text-[10px] shadow-sm border ${p.avgAct > 7 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                      {p.avgAct}j
                                   </span>
                                </div>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
              <div className="p-8 bg-slate-50 border-t flex justify-end">
                 <button onClick={() => setShowSlaSummary(false)} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-[#ff7900] transition-all">Fermer l'analyse</button>
              </div>
           </div>
        </div>
      )}

      {/* AI PANEL, MODALS (Formulaire), etc - Reste inchangé pour préserver le code */}
      {showAiPanel && (
         <div className="absolute top-24 bottom-6 right-6 w-80 bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-right-10 z-50">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center"><div className="flex items-center gap-2"><Bot className="w-5 h-5 text-[#ff7900]" /><span className="text-xs font-black uppercase tracking-widest">Assistant ADV</span></div><button onClick={() => setShowAiPanel(false)} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">{aiChat.map((msg, i) => (<div key={i} className={`p-3 rounded-2xl text-xs font-medium leading-relaxed ${msg.role === 'user' ? 'bg-[#ff7900] text-white ml-8 rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 mr-8 rounded-tl-none'}`}>{msg.content}</div>))}{isAiThinking && <div className="flex justify-start"><Loader2 className="w-5 h-5 text-[#ff7900] animate-spin" /></div>}<div ref={chatEndRef}></div></div>
            <div className="p-3 border-t border-slate-100 bg-white"><div className="flex gap-2"><input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && askGemini()} placeholder="Poser une question..." className="flex-1 bg-slate-50 border-none rounded-xl text-xs font-bold px-3 py-2 focus:ring-2 focus:ring-[#ff7900]/20" /><button onClick={askGemini} disabled={isAiThinking} className="p-2 bg-slate-900 text-white rounded-xl hover:bg-[#ff7900] transition-colors"><Send className="w-4 h-4" /></button></div></div>
         </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter">{editingOrder ? 'Traitement Dossier' : 'Nouveau Dossier'}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{editingOrder?.id || 'Création manuelle'}</p>
                 </div>
                 <button onClick={() => setShowModal(false)}><X className="w-6 h-6 text-slate-400 hover:text-slate-600" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Raison Sociale *</label><input type="text" value={formOrder.raisonSociale || ''} onChange={e => updateFormOrder({ raisonSociale: e.target.value })} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-sm focus:ring-2 focus:ring-[#ff7900]/20 shadow-inner" placeholder="Nom du Client" /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Réf Contrat</label><input type="text" value={formOrder.refContrat || ''} onChange={e => updateFormOrder({ refContrat: e.target.value })} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-sm focus:ring-2 focus:ring-[#ff7900]/20 shadow-inner" placeholder="Référence Orange..." /></div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">N° Fixe</label><input type="tel" value={formOrder.nFixe || ''} onChange={e => updateFormOrder({ nFixe: e.target.value })} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-sm focus:ring-2 focus:ring-[#ff7900]/20 shadow-inner" placeholder="0522000000" /></div>
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Téléphone</label><input type="tel" value={formOrder.telephone || ''} onChange={e => updateFormOrder({ telephone: e.target.value })} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-sm focus:ring-2 focus:ring-[#ff7900]/20 shadow-inner" placeholder="0600000000" /></div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Offre *</label><select value={formOrder.offre || ''} onChange={e => updateFormOrder({ offre: e.target.value })} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-sm appearance-none cursor-pointer shadow-inner"><option value="">Sélectionner une offre...</option>{PRODUCT_OFFERS.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}</select></div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Date Dépôt</label>
                       <input 
                          type="date" 
                          value={formOrder.dateDepot ? new Date(formOrder.dateDepot).toISOString().split('T')[0] : ''} 
                          onChange={e => updateFormOrder({ dateDepot: e.target.value })} 
                          className={`w-full p-4 rounded-xl border-none font-black text-sm text-rose-600 shadow-inner ${!isAdmin ? 'bg-slate-100 cursor-not-allowed' : 'bg-slate-50'}`}
                          disabled={!isAdmin}
                       />
                    </div>
                 </div>
                 <div className="p-6 bg-slate-100/50 rounded-3xl border border-slate-200 grid grid-cols-2 gap-6 relative shadow-sm">
                    <div className="absolute top-3 right-3">
                       <label className="flex items-center cursor-pointer group">
                          <input type="checkbox" checked={formOrder.isConfirmed || false} onChange={e => updateFormOrder({ isConfirmed: e.target.checked })} className="hidden peer" />
                          <div className="px-4 py-1.5 bg-white border border-slate-200 rounded-xl text-[9px] font-black uppercase text-slate-400 peer-checked:bg-emerald-50 peer-checked:text-emerald-600 peer-checked:border-emerald-200 transition-all flex items-center shadow-sm group-hover:border-indigo-200">
                             <Check className="w-3.5 h-3.5 mr-1.5" /> Confirmé Tél.
                          </div>
                       </label>
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-amber-600 ml-2 flex items-center tracking-widest"><Clock className="w-3.5 h-3.5 mr-1.5" /> Statut ADV (Validation)</label>
                       <select value={formOrder.validation || 'EN ATTENTE'} onChange={e => {
                          const nextValidation = e.target.value as ADVValidationStatus;
                          const today = new Date().toISOString().split('T')[0];
                          setFormOrder(prev => ({
                            ...prev,
                            validation: nextValidation,
                            raisonBlocage: (nextValidation === 'BLOQUÉ' || nextValidation === 'ANNULÉ') ? prev.raisonBlocage : '',
                            dateValidation: nextValidation === 'VALIDE' ? (prev.dateValidation || today) : ''
                          }));
                        }} className={`w-full p-3.5 rounded-2xl border-none font-black text-sm uppercase shadow-inner ${formOrder.validation === 'VALIDE' ? 'bg-emerald-100 text-emerald-700' : formOrder.validation === 'BLOQUÉ' ? 'bg-orange-100 text-orange-700' : 'bg-white text-slate-700'}`}>
                          <option value="EN ATTENTE">En Attente</option><option value="VALIDE">Validé (Passer à Activation)</option><option value="BLOQUÉ">Bloqué (Dossier Incomplet)</option><option value="ANNULÉ">Annulé (Rejet définitif)</option>
                       </select>
                       {(formOrder.validation === 'BLOQUÉ' || formOrder.validation === 'ANNULÉ') && (<select value={formOrder.raisonBlocage || ''} onChange={e => updateFormOrder({ raisonBlocage: e.target.value })} className="w-full p-3.5 rounded-2xl bg-orange-50 border-orange-200 border text-orange-800 text-xs font-bold mt-2 appearance-none cursor-pointer shadow-sm"><option value="">-- Motif de blocage --</option>{ADV_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>)}
                       {formOrder.validation === 'VALIDE' && (<div className="mt-2 space-y-1"><label className="text-[9px] font-black uppercase text-emerald-600 ml-2">Date Validation ADV</label><input type="date" value={formOrder.dateValidation || ''} onChange={e => updateFormOrder({ dateValidation: e.target.value })} className="w-full p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-black text-emerald-800 shadow-inner" /></div>)}
                       
                       <div className="mt-4 space-y-1">
                          <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Sériel Vérifié</label>
                          <input 
                            type="text" 
                            value={formOrder.nSerieVerifie || ''} 
                            onChange={e => {
                              updateFormOrder({ nSerieVerifie: e.target.value });
                              checkSerialStatus(e.target.value);
                            }} 
                            className="w-full p-3 rounded-xl bg-white border-none font-bold text-sm shadow-inner" 
                            placeholder="SN ou référence..." 
                          />
                          {serialStatus && (
                            <p className={`text-[8px] font-black ml-2 mt-1 ${getSerialStatusColor()}`}>
                              📍 {getSerialStatusText()}
                            </p>
                          )}
                          <p className="text-[8px] text-slate-500 ml-2 mt-1">
                             💡 Le statut du stock sera automatiquement mis à "déposé" lors de la sauvegarde
                          </p>
                       </div>
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black uppercase text-emerald-600 ml-2 flex items-center tracking-widest"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Statut SI / Activation</label>
                       <select value={formOrder.statutSi || 'En Etudes'} onChange={e => { const newStatus = e.target.value as ADVSiStatus; const today = new Date().toISOString().split('T')[0]; updateFormOrder({ statutSi: newStatus, dateStatutSi: today }); }} className="w-full p-3.5 rounded-2xl bg-white border-none font-black text-sm text-slate-700 shadow-inner">
                          <option value="En Etudes">En Etudes</option><option value="A traiter">A traiter (Validé ADV)</option><option value="En GO">En GO raccordable</option><option value="Installé non Facturé">Installé</option><option value="Facturé">Facturé (Cycle Terminé)</option><option value="Bloqué">Bloqué Technique</option><option value="Annulé">Annulé Technique</option>
                       </select>
                       {(formOrder.statutSi === 'Bloqué' || formOrder.statutSi === 'Annulé') && (
                          <select value={formOrder.raisonBlocageSi || ''} onChange={e => updateFormOrder({ raisonBlocageSi: e.target.value })} className="w-full p-3.5 rounded-2xl bg-rose-50 border-rose-200 border text-rose-800 text-xs font-bold mt-2 shadow-sm cursor-pointer appearance-none">
                             <option value="">-- Motif Blocage Activation --</option>
                             {ACTIVATION_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                       )}
                       <div className="mt-2 space-y-1"><label className="text-[9px] font-black uppercase text-emerald-600 ml-2">Date Changement Statut SI</label><input type="date" value={formOrder.dateStatutSi || ''} onChange={e => updateFormOrder({ dateStatutSi: e.target.value })} className="w-full p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-black text-emerald-800 shadow-inner" /></div>
                       <div className="mt-2 space-y-1"><label className="text-[9px] font-black uppercase text-slate-500 ml-2">Lien CRM / Commande</label><input type="text" value={formOrder.linkCrm || ''} onChange={e => updateFormOrder({ linkCrm: e.target.value })} className="w-full p-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-indigo-600 shadow-inner" placeholder="https://..." /></div>
                    </div>
                 </div>
                 <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-sm">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4 flex items-center"><Server className="w-3.5 h-3.5 mr-2" /> Détails Techniques & Logistique</h4>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Prestataire Assigné</label><select value={formOrder.prestataire || ''} onChange={e => updateFormOrder({ prestataire: e.target.value })} className="w-full p-3 rounded-xl bg-white border-none font-bold text-sm appearance-none shadow-inner"><option value="">-- Non défini --</option>{PRESTATAIRES.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                       <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Date Passage en GO</label><input type="date" value={formOrder.dateGo || ''} onChange={e => updateFormOrder({ dateGo: e.target.value })} className="w-full p-3 rounded-xl bg-white border-none font-bold text-sm shadow-inner" /></div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 mt-4">
                       <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Date Vérification</label><input type="date" value={formOrder.dateSerieVerifie || ''} onChange={e => updateFormOrder({ dateSerieVerifie: e.target.value })} className="w-full p-3 rounded-xl bg-white border-none font-bold text-sm shadow-inner" /></div>
                    </div>
                 </div>
                 <div className="space-y-1"><label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Commercial en charge</label><select value={formOrder.commercial || ''} onChange={e => updateFormOrder({ commercial: e.target.value })} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-sm appearance-none cursor-pointer shadow-inner"><option value="">Sélectionner un agent...</option>{salesAgents.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
              </div>
              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                 <button onClick={() => setShowModal(false)} className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-xs hover:bg-slate-100 transition-colors shadow-sm">Annuler</button>
                 <button onClick={handleSaveOrder} disabled={isSaving} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs shadow-xl hover:bg-[#ff7900] transition-all disabled:opacity-70 flex justify-center items-center">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer les modifications'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ADVApp;
