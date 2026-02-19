import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StockItem, StockMovement, User, StockUnit, StockAgent, ModulePermissions } from '../types';
import { saveCloudData, getCloudData } from '../services/database';
import { GoogleGenerativeAI as GoogleGenAI } from "@google/generative-ai";
import { 
  Package, ArrowUpRight, ArrowDownLeft, Search, Plus, 
  History, AlertCircle, LayoutGrid, X, Save, TrendingUp,
  Download, Filter, ChevronRight, CheckCircle2, BarChart3, 
  Printer, Calendar, Trash2, Tag, ListFilter, User as UserIcon,
  SearchCode, Info, Edit2, PieChart as PieIcon, Activity, FileSpreadsheet,
  Scan, Camera, Zap, UserPlus, Users, RefreshCcw, RotateCcw, AlertTriangle,
  ChevronLeft, ShoppingCart, Clock, ClipboardList, Coins, Banknote,
  Settings2, UserCog, Layers, ShieldAlert, Loader2, MoreVertical,
  ChevronDown, Check, Sparkles, FileText, ArrowUpDown, BellRing,
  Send, Bot, MessageSquare, BrainCircuit, ListChecks, FileInput, 
  FilterX, FileUp, FileDown
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';

interface StockManagementProps { user: User; }
type StockTab = 'inventory' | 'movements' | 'traceability' | 'analytics' | 'sellers' | 'ai';

const COLORS = ['#ff7900', '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6', '#f59e0b', '#64748b'];

const BarcodeScanner: React.FC<{ onScan: (code: string) => void; onClose: () => void }> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) videoRef.current.srcObject = stream;

        if ('BarcodeDetector' in window) {
          const barcodeDetector = new (window as any).BarcodeDetector({ formats: ['code_128', 'ean_13', 'qr_code', 'code_39'] });
          const interval = setInterval(async () => {
            if (videoRef.current && videoRef.current.readyState === 4) {
              try {
                const barcodes = await barcodeDetector.detect(videoRef.current);
                if (barcodes.length > 0) {
                  onScan(barcodes[0].rawValue);
                  if (navigator.vibrate) navigator.vibrate(100);
                }
              } catch (e) { }
            }
          }, 500);
          return () => clearInterval(interval);
        } else {
          setError("Lecteur API non supporté.");
        }
      } catch (err) {
        setError("Erreur caméra: Vérifiez les permissions.");
      }
    };
    startCamera();
    return () => { if (stream) stream.getTracks().forEach(track => track.stop()); };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-6">
      <div className="relative w-full max-md aspect-square bg-slate-900 rounded-3xl overflow-hidden border-4 border-orange-500 shadow-2xl">
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none">
          <div className="w-full h-full border-2 border-orange-500/50 animate-pulse relative">
             <div className="absolute top-1/2 left-0 w-full h-0.5 bg-orange-500 shadow-[0_0_15px_rgba(255,121,0,0.8)] animate-bounce"></div>
          </div>
        </div>
      </div>
      <p className="text-white mt-8 text-xs font-black uppercase tracking-widest text-center px-8">{error ? error : "Scan Orange en cours..."}</p>
      <button onClick={onClose} className="mt-8 px-10 py-4 bg-white/10 text-white rounded-2xl font-black uppercase text-xs hover:bg-white/20 transition-all">Fermer</button>
    </div>
  );
};

const FeedbackPopup: React.FC<{ 
  title: string; 
  message: string; 
  onClose: () => void;
  type?: 'success' | 'info' | 'warning'
}> = ({ title, message, onClose, type = 'success' }) => (
  <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md print:hidden">
    <div className="bg-white w-full max-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-4 border-slate-900">
      <div className="p-8 text-center">
        <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-6 shadow-lg ${
          type === 'success' ? 'bg-emerald-50 text-white' : 
          type === 'warning' ? 'bg-rose-500 text-white' : 
          'bg-orange-50 text-white'
        }`}>
          {type === 'success' ? <CheckCircle2 className="w-10 h-10" /> : <AlertCircle className="w-10 h-10" />}
        </div>
        <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter mb-2">{title}</h3>
        <p className="text-slate-500 text-sm font-bold leading-relaxed">{message}</p>
      </div>
      <div className="p-6 bg-slate-50 border-t border-slate-100 flex">
        <button 
          onClick={onClose} 
          className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-[#ff7900] transition-all shadow-xl"
        >
          Continuer
        </button>
      </div>
    </div>
  </div>
);

const StockManagement: React.FC<StockManagementProps> = ({ user }) => {
  const isAdmin = user.role === 'admin';
  
  const hasPerm = (action: keyof ModulePermissions) => {
    if (isAdmin) return true;
    return !!user.permissions?.stock?.[action];
  };

  const [activeTab, setActiveTab] = useState<StockTab>('inventory');
  const [items, setItems] = useState<StockItem[]>([]);
  const [units, setUnits] = useState<StockUnit[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [sellers, setSellers] = useState<StockAgent[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterItem, setFilterItem] = useState<string>('all');
  
  // --- NOUVEAUX ÉTATS FILTRES HISTORIQUE ---
  const [historyFilterStart, setHistoryFilterStart] = useState<string>('');
  const [historyFilterEnd, setHistoryFilterEnd] = useState<string>('');
  const [historyFilterItem, setHistoryFilterItem] = useState<string>('all');
  const [historyFilterAgent, setHistoryFilterAgent] = useState<string>('all');

  const [reportDateStart, setReportDateStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [reportDateEnd, setReportDateEnd] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reportType, setReportType] = useState<string>('all');
  const [reportAgent, setReportAgent] = useState<string>('all');

  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState<'item' | 'movement' | 'seller' | 'unit_price' | 'unit_status' | 'unit_owner' | 'unit_delete' | 'seller_delete' | 'item_delete' | null>(null);
  const [showScanner, setShowScanner] = useState<'article' | 'serial' | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<boolean>(false);
  
  const [opFeedback, setOpFeedback] = useState<{ title: string; message: string; type: 'success' | 'warning' } | null>(null);

  const [modalSNSearch, setModalSNSearch] = useState('');

  const [itemForm, setItemForm] = useState<Partial<StockItem>>({ category: 'Fixe', minThreshold: 5, unit: 'Unités', warehouseSerials: [], basePrice: 0 });
  const [sellerForm, setSellerForm] = useState<Partial<StockAgent>>({ name: '', phone: '' });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [deletingSellerId, setDeletingSellerId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [moveForm, setMoveForm] = useState<Partial<StockMovement>>({ type: 'OUT', quantity: 1, date: new Date().toISOString().split('T')[0], selectedSerials: [] });
  const [rawSerialsInput, setRawSerialsInput] = useState(''); 
  const [isBulkEntry, setIsBulkEntry] = useState(false);

  const [editingUnitSN, setEditingUnitSN] = useState<string | null>(null);
  const [unitPriceInput, setUnitPriceInput] = useState<number>(0);

  const [aiInput, setAiInput] = useState('');
  const [aiChat, setAiChat] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- SELECTION MULTIPLE ---
  const [selectedSNs, setSelectedSNs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      const [storedItems, storedUnits, storedMoves, storedSellers, storedUsers] = await Promise.all([
        getCloudData('stock_items'), getCloudData('stock_units'), 
        getCloudData('stock_movements'), getCloudData('stock_sellers'),
        getCloudData('users')
      ]);
      
      // Merge sellers from stock_sellers and users with associatedAgentName
      const existingSellers = storedSellers || [];
      const users = storedUsers || [];
      const existingSellerNames = new Set(existingSellers.map((s: StockAgent) => s.name.toLowerCase()));
      
      // Add users who are agents (not admins) and not already in sellers list
      const userSellers = users
        .filter((u: User) => u.role === 'agent' && u.associatedAgentName && 
                u.associatedAgentName.toLowerCase() !== 'administration' &&
                !existingSellerNames.has(u.associatedAgentName.toLowerCase()))
        .map((u: User) => ({
          id: Math.random().toString(36).substr(2, 9),
          name: u.associatedAgentName!,
          phone: ''
        }));
      
      const mergedSellers = [...existingSellers, ...userSellers]
        .sort((a: StockAgent, b: StockAgent) => a.name.localeCompare(b.name));
      
      setItems(storedItems || []); setUnits(storedUnits || []); setMovements(storedMoves || []); setSellers(mergedSellers);
      setIsLoading(false);
    };
    loadData();
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiChat]);

  const stats = useMemo(() => {
    const alertedItems = items.filter(i => (i.warehouseSerials?.length || 0) <= i.minThreshold);
    const alerts = alertedItems.length;
    const totalInDepot = units.filter(u => u.currentOwner === 'Dépôt').length;
    const totalWithAgents = units.filter(u => u.currentOwner !== 'Dépôt' && (u.status === 'assigned' || u.status === 'pending_payment')).length;
    const totalSold = units.filter(u => u.status === 'sold').length;
    return { alerts, alertedItems, totalInDepot, totalWithAgents, totalSold };
  }, [items, units]);

  const traceabilityList = useMemo(() => {
    return units.filter(u => {
      const matchSearch = u.serialNumber.toLowerCase().includes(searchTerm.toLowerCase());
      const matchOwner = filterOwner === 'all' || u.currentOwner === filterOwner;
      const matchStatus = filterStatus === 'all' || u.status === filterStatus;
      const matchItem = filterItem === 'all' || u.itemId === filterItem;
      return matchSearch && matchOwner && matchStatus && matchItem;
    }).sort((a,b) => b.lastMovementDate.localeCompare(a.lastMovementDate));
  }, [units, searchTerm, filterOwner, filterStatus, filterItem]);

  const reportMovements = useMemo(() => {
    return movements.filter(m => {
      const d = new Date(m.date);
      const matchDate = d >= new Date(reportDateStart) && d <= new Date(reportDateEnd);
      const matchType = reportType === 'all' || (reportType === 'IN' ? m.type === 'IN' : m.type !== 'IN');
      const matchAgent = reportAgent === 'all' || m.agentName === reportAgent;
      const matchItem = filterItem === 'all' || m.itemId === filterItem;
      return matchDate && matchType && matchAgent && matchItem;
    }).sort((a,b) => b.date.localeCompare(a.date));
  }, [movements, reportDateStart, reportDateEnd, reportType, reportAgent, filterItem]);

  const analyticsData = useMemo(() => {
    const productsMap: Record<string, { name: string, in: number, out: number, net: number }> = {};
    items.forEach(i => productsMap[i.id] = { name: i.name, in: 0, out: 0, net: 0 });

    movements.forEach(m => {
      if (!productsMap[m.itemId]) return;
      if (filterItem !== 'all' && m.itemId !== filterItem) return;

      if (m.type === 'IN') {
        productsMap[m.itemId].in += m.quantity;
      } else {
        productsMap[m.itemId].out += m.quantity;
      }
      productsMap[m.itemId].net = productsMap[m.itemId].in - productsMap[m.itemId].out;
    });

    return Object.values(productsMap).filter(p => p.in > 0 || p.out > 0);
  }, [movements, items, filterItem]);

  const filteredHistory = useMemo(() => {
    return movements.filter(m => {
      const d = m.date;
      const matchStart = !historyFilterStart || d >= historyFilterStart;
      const matchEnd = !historyFilterEnd || d <= historyFilterEnd;
      const matchItem = historyFilterItem === 'all' || m.itemId === historyFilterItem;
      const matchAgent = historyFilterAgent === 'all' || m.agentName === historyFilterAgent;
      return matchStart && matchEnd && matchItem && matchAgent;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movements, historyFilterStart, historyFilterEnd, historyFilterItem, historyFilterAgent]);

  // ... (Export/Import logic unchanged) ...
  const handleExportStockCSV = () => {
    if (traceabilityList.length === 0) return alert("Aucune donnée à exporter.");
    const headers = ['Référence (SN)', 'Article', 'Détenteur', 'Statut', 'Prix (DH)', 'Dernier Mouvement'];
    const csvContent = [headers.join(';'), ...traceabilityList.map(u => {
        const item = items.find(i => i.id === u.itemId);
        return [u.serialNumber, item ? item.name : u.itemId, u.currentOwner, u.status, u.price || 0, u.lastMovementDate].map(v => `"${v}"`).join(';');
      })].join('\n');
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Stock_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportStockCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasPerm('create')) return alert("Permission requise.");
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length <= 1) return;
        const separator = lines[0].includes(';') ? ';' : ',';
        const newUnits: StockUnit[] = [];
        const now = new Date().toISOString().split('T')[0];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length < 2) continue;
          const sn = cols[0];
          const itemId = cols[1]; 
          let item = items.find(it => it.id === itemId || it.name.toLowerCase() === itemId.toLowerCase());
          if (!item && items.length > 0) item = items[0]; 
          if (!item) continue;
          newUnits.push({
            serialNumber: sn, itemId: item.id, currentOwner: cols[2] || 'Dépôt', status: (cols[3] as any) || 'available', price: parseFloat(cols[4] || '0'), lastMovementDate: now
          });
        }
        const updatedUnits = [...units];
        const existingSNs = new Set(units.map(u => u.serialNumber));
        newUnits.forEach(nu => {
           if (existingSNs.has(nu.serialNumber)) {
              const idx = updatedUnits.findIndex(u => u.serialNumber === nu.serialNumber);
              updatedUnits[idx] = nu;
           } else {
              updatedUnits.push(nu);
           }
        });
        const updatedItems = items.map(it => {
           const itemSNs = updatedUnits.filter(u => u.itemId === it.id && u.currentOwner === 'Dépôt' && u.status === 'available').map(u => u.serialNumber);
           return { ...it, warehouseSerials: itemSNs };
        });
        setUnits(updatedUnits); setItems(updatedItems);
        await Promise.all([saveCloudData('stock_units', updatedUnits), saveCloudData('stock_items', updatedItems)]);
        alert(`${newUnits.length} unités importées/mises à jour.`);
      } catch (err) { console.error(err); alert("Erreur format CSV."); } finally { e.target.value = ''; }
    };
    reader.readAsText(file);
  };

  const handleBulkDelete = async () => {
    if (!hasPerm('delete')) return alert("Permission requise.");
    if (selectedSNs.size === 0) return;
    if (!confirm(`Supprimer définitivement ${selectedSNs.size} unités du stock ?`)) return;
    const updatedUnits = units.filter(u => !selectedSNs.has(u.serialNumber));
    const updatedItems = items.map(it => ({ ...it, warehouseSerials: it.warehouseSerials.filter(sn => !selectedSNs.has(sn)) }));
    setUnits(updatedUnits); setItems(updatedItems); setSelectedSNs(new Set());
    await Promise.all([saveCloudData('stock_units', updatedUnits), saveCloudData('stock_items', updatedItems)]);
    setOpFeedback({ title: 'Suppression en masse', message: 'Unités supprimées avec succès.', type: 'success' });
  };

  const toggleSelectSN = (sn: string) => {
    const newSet = new Set(selectedSNs);
    if (newSet.has(sn)) newSet.delete(sn); else newSet.add(sn);
    setSelectedSNs(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedSNs.size === traceabilityList.length) setSelectedSNs(new Set());
    else setSelectedSNs(new Set(traceabilityList.map(u => u.serialNumber)));
  };

  const handleSaveItem = async () => {
    if (!hasPerm('create')) return setOpFeedback({ title: 'Accès Refusé', message: "Action non autorisée. Contactez l'administrateur.", type: 'warning' });
    if (!itemForm.name || !itemForm.name.trim()) return setOpFeedback({ title: 'Champ requis', message: "Veuillez saisir le nom de l'article Orange.", type: 'warning' });
    const normalizedName = itemForm.name.trim().toLowerCase();
    const isDuplicate = items.some(i => i.name.trim().toLowerCase() === normalizedName && i.id !== editingItemId);
    if (isDuplicate) return setOpFeedback({ title: 'Doublon détecté', message: `L'article "${itemForm.name}" existe déjà dans votre catalogue.`, type: 'warning' });
    let updatedItems = editingItemId ? items.map(i => i.id === editingItemId ? { ...i, ...itemForm } as StockItem : i) : [...items, { ...itemForm as StockItem, id: Math.random().toString(36).substr(2, 9), warehouseSerials: [], basePrice: itemForm.basePrice || 0 }];
    setItems(updatedItems); await saveCloudData('stock_items', updatedItems);
    setOpFeedback({ title: editingItemId ? 'Produit Mis à Jour' : 'Nouvel Article', message: `Le produit "${itemForm.name}" a été enregistré avec succès.`, type: 'success' });
    setShowModal(null); setEditingItemId(null);
  };

  const handleConfirmDeleteItem = async () => {
    if (!hasPerm('delete')) return;
    const updatedItems = items.filter(i => i.id !== deletingProductId);
    setItems(updatedItems); await saveCloudData('stock_items', updatedItems);
    setOpFeedback({ title: 'Produit Supprimé', message: "L'article a été retiré du catalogue Orange Maroc.", type: 'success' });
    setShowModal(null); setDeletingProductId(null);
  };

  const handleSaveSeller = async () => {
    if (!hasPerm('create')) return;
    if (!sellerForm.name) return;
    const updated = [...sellers, { id: Math.random().toString(36).substr(2, 9), ...sellerForm } as StockAgent].sort((a,b) => a.name.localeCompare(b.name));
    setSellers(updated); await saveCloudData('stock_sellers', updated);
    setOpFeedback({ title: 'Vendeur Ajouté', message: `${sellerForm.name} fait désormais partie de l'équipe de vente.`, type: 'success' });
    setShowModal(null); setSellerForm({ name: '', phone: '' });
  };

  const handleConfirmDeleteSeller = async () => {
    if (!hasPerm('delete')) return;
    const updated = sellers.filter(s => s.id !== deletingSellerId);
    setSellers(updated); await saveCloudData('stock_sellers', updated);
    setOpFeedback({ title: 'Vendeur Supprimé', message: "Le collaborateur a été retiré de la base de données.", type: 'success' });
    setShowModal(null); setDeletingSellerId(null);
  };

  const handleUpdateUnitPrice = async () => {
    if (!hasPerm('update')) return;
    const updatedUnits = units.map(u => u.serialNumber === editingUnitSN ? { ...u, price: unitPriceInput } : u);
    setUnits(updatedUnits); await saveCloudData('stock_units', updatedUnits);
    setOpFeedback({ title: 'Prix Actualisé', message: `Nouveau tarif appliqué au Sériel ${editingUnitSN}.`, type: 'success' });
    setShowModal(null); setEditingUnitSN(null);
  };

  const handleUpdateUnitOwner = async (newOwner: string) => {
    if (!hasPerm('update')) return;
    const unit = units.find(u => u.serialNumber === editingUnitSN);
    if (!unit) return;
    const now = new Date().toISOString().split('T')[0];
    const isMovingToDepot = newOwner === 'Dépôt';
    const updatedUnits = units.map(u => u.serialNumber === editingUnitSN ? { ...u, currentOwner: newOwner, status: isMovingToDepot ? 'available' : 'assigned' as any, lastMovementDate: now } : u);
    let updatedItems = items.map(i => {
       if (i.id === unit.itemId) {
         let sns = isMovingToDepot ? [...i.warehouseSerials, editingUnitSN!] : i.warehouseSerials.filter(s => s !== editingUnitSN);
         return { ...i, warehouseSerials: Array.from(new Set(sns)) };
       }
       return i;
    });
    setUnits(updatedUnits); setItems(updatedItems);
    await Promise.all([saveCloudData('stock_units', updatedUnits), saveCloudData('stock_items', updatedItems)]);
    setOpFeedback({ title: 'Transfert Réussi', message: `L'unité ${editingUnitSN} est maintenant détenue par ${newOwner}.`, type: 'success' });
    setShowModal(null);
  };

  const handleUpdateUnitStatus = async (newStatus: StockUnit['status']) => {
    if (!hasPerm('update')) return;
    const unit = units.find(u => u.serialNumber === editingUnitSN);
    if (!unit) return;
    const now = new Date().toISOString().split('T')[0];
    const updatedUnits = units.map(u => u.serialNumber === editingUnitSN ? { ...u, status: newStatus, lastMovementDate: now } : u);
    const updatedItems = items.map(i => {
      if (i.id === unit.itemId) {
        if (newStatus === 'available') {
          return { ...i, warehouseSerials: Array.from(new Set([...i.warehouseSerials, editingUnitSN!])) };
        } else {
          return { ...i, warehouseSerials: i.warehouseSerials.filter(s => s !== editingUnitSN) };
        }
      }
      return i;
    });
    setUnits(updatedUnits); setItems(updatedItems);
    await Promise.all([saveCloudData('stock_units', updatedUnits), saveCloudData('stock_items', updatedItems)]);
    setOpFeedback({ title: 'Statut Modifié', message: `Le Sériel ${editingUnitSN} est désormais marqué comme : ${newStatus}.`, type: 'success' });
    setShowModal(null); setEditingUnitSN(null);
  };

  const handleConfirmDeleteUnit = async () => {
    if (!hasPerm('delete')) return;
    const unit = units.find(u => u.serialNumber === editingUnitSN);
    if (!unit) return;
    const updatedUnits = units.filter(u => u.serialNumber !== editingUnitSN);
    const updatedItems = items.map(i => {
      if (i.id === unit.itemId) return { ...i, warehouseSerials: i.warehouseSerials.filter(s => s !== editingUnitSN) };
      return i;
    });
    setUnits(updatedUnits); setItems(updatedItems);
    await Promise.all([saveCloudData('stock_units', updatedUnits), saveCloudData('stock_items', updatedItems)]);
    setOpFeedback({ title: 'Sériel Supprimé', message: "L'unité a été retirée définitivement de l'inventaire Orange.", type: 'success' });
    setShowModal(null); setEditingUnitSN(null);
  };

  const handleAddMovement = async () => {
    if (!hasPerm('create')) return;
    const item = items.find(i => i.id === moveForm.itemId);
    if (!item) return;
    
    let finalSerials: string[] = [];
    if (moveForm.type === 'IN' || isBulkEntry) {
       finalSerials = rawSerialsInput.split(/[\n,;\t ]+/).map(s => s.trim()).filter(s => s !== "");
    } else {
       finalSerials = moveForm.selectedSerials || [];
    }

    if (finalSerials.length === 0) return setOpFeedback({ title: 'Erreur Sériels', message: "Veuillez scanner ou saisir au moins un numéro de série.", type: 'warning' });
    
    if (moveForm.type === 'IN') {
       const internalDuplicates = finalSerials.filter((sn, index) => finalSerials.indexOf(sn) !== index);
       if (internalDuplicates.length > 0) return setOpFeedback({ title: 'Doublons détectés', message: `Votre saisie contient des doublons : ${Array.from(new Set(internalDuplicates)).join(', ')}.`, type: 'warning' });
       const existingSNs = units.map(u => u.serialNumber);
       const conflicts = finalSerials.filter(sn => existingSNs.includes(sn));
       if (conflicts.length > 0) return setOpFeedback({ title: 'Référence déjà existante', message: `Le SN ${conflicts[0]} existe déjà.`, type: 'warning' });
    }

    if (moveForm.type !== 'IN' && isBulkEntry) {
       const invalidSerials = finalSerials.filter(sn => {
          const unit = units.find(u => u.serialNumber === sn);
          if (!unit || unit.itemId !== item.id) return true;
          if (moveForm.type === 'OUT') return unit.currentOwner !== 'Dépôt' || unit.status !== 'available';
          else { const requiredOwner = moveForm.agentName || 'Dépôt'; return unit.currentOwner !== requiredOwner; }
       });
       if (invalidSerials.length > 0) return setOpFeedback({ title: 'Lot Invalide', message: `${invalidSerials.length} sériels invalides.`, type: 'warning' });
    }

    if (!pendingConfirmation) { setPendingConfirmation(true); return; }
    const now = new Date().toISOString().split('T')[0];
    const newMove: StockMovement = { ...moveForm as StockMovement, id: Math.random().toString(36).substr(2, 9), quantity: finalSerials.length, selectedSerials: finalSerials, date: moveForm.date || now, validator: user.username };
    
    let updatedUnits = [...units];
    let updatedItems = [...items];

    if (moveForm.type === 'IN') {
      const news = finalSerials.map(sn => ({ serialNumber: sn, itemId: item.id, currentOwner: 'Dépôt', status: 'available' as const, lastMovementDate: now, price: item.basePrice || 0 }));
      updatedUnits = [...updatedUnits, ...news];
      updatedItems = items.map(i => i.id === item.id ? { ...i, warehouseSerials: Array.from(new Set([...i.warehouseSerials, ...finalSerials])) } : i);
    } else {
      finalSerials.forEach(sn => {
        const uIdx = updatedUnits.findIndex(u => u.serialNumber === sn);
        if (uIdx !== -1) {
          const u = updatedUnits[uIdx];
          const typeMap: Record<string, StockUnit['status']> = { OUT: 'assigned', SALE: 'sold', PENDING_SALE: 'pending_payment', LOST: 'lost', DEFECTIVE: 'defective', RETURN: 'available', DEPOSITED: 'deposited' };
          const newStatus = typeMap[moveForm.type!] || u.status;
          updatedUnits[uIdx] = { ...u, status: newStatus, currentOwner: newStatus === 'available' ? 'Dépôt' : (moveForm.agentName || u.currentOwner), lastMovementDate: now };
          
          const itIdx = updatedItems.findIndex(it => it.id === u.itemId);
          if (itIdx !== -1) {
            if (newStatus === 'available') updatedItems[itIdx].warehouseSerials = Array.from(new Set([...updatedItems[itIdx].warehouseSerials, sn]));
            else updatedItems[itIdx].warehouseSerials = updatedItems[itIdx].warehouseSerials.filter(s => s !== sn);
          }
        }
      });
    }
    setMovements([newMove, ...movements]); setUnits(updatedUnits); setItems(updatedItems);
    await Promise.all([saveCloudData('stock_movements', [newMove, ...movements]), saveCloudData('stock_units', updatedUnits), saveCloudData('stock_items', updatedItems)]);
    const verb = moveForm.type === 'IN' ? 'Entrée' : moveForm.type === 'OUT' ? 'Dispatching' : 'Opération';
    setOpFeedback({ title: 'Flux Validé', message: `${verb} de ${finalSerials.length} unité(s) effectuée.`, type: 'success' });
    setShowModal(null); setPendingConfirmation(false); setRawSerialsInput(''); setMoveForm({ type: 'OUT', quantity: 1, selectedSerials: [] });
  };

  const getContextualSerials = () => {
    if (!moveForm.itemId) return [];
    if (moveForm.type === 'OUT') return units.filter(u => u.itemId === moveForm.itemId && u.currentOwner === 'Dépôt' && u.status === 'available').map(u => u.serialNumber);
    const currentEntity = moveForm.agentName && moveForm.agentName !== 'Dépôt' ? moveForm.agentName : 'Dépôt';
    return units.filter(u => u.itemId === moveForm.itemId && u.currentOwner === currentEntity && (currentEntity === 'Dépôt' ? u.status === 'available' : true)).map(u => u.serialNumber);
  };

  const modalFilteredSNs = useMemo(() => {
    const list = getContextualSerials();
    return list.filter(sn => sn.toLowerCase().includes(modalSNSearch.toLowerCase()));
  }, [moveForm.itemId, moveForm.type, moveForm.agentName, units, modalSNSearch]);

  const resetTraceabilityFilters = () => { setSearchTerm(''); setFilterOwner('all'); setFilterStatus('all'); setFilterItem('all'); };
  const resetHistoryFilters = () => { setHistoryFilterStart(''); setHistoryFilterEnd(''); setHistoryFilterItem('all'); setHistoryFilterAgent('all'); };

  const askGemini = async (customPrompt?: string) => {
    const prompt = customPrompt || aiInput;
    if (!prompt.trim()) return;
    setIsAiThinking(true);
    if (!customPrompt) { setAiChat(prev => [...prev, { role: 'user', content: prompt }]); setAiInput(''); }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt, config: { systemInstruction: `Analyste Stock DIVERSIFIA.` } });
      setAiChat(prev => [...prev, { role: 'assistant', content: response.text || "Analyse indisponible." }]);
    } catch (e) { setAiChat(prev => [...prev, { role: 'assistant', content: "⚠️ Erreur IA." }]); } finally { setIsAiThinking(false); }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 relative">
      {opFeedback && <FeedbackPopup title={opFeedback.title} message={opFeedback.message} type={opFeedback.type} onClose={() => setOpFeedback(null)} />}
      {showScanner && <BarcodeScanner onScan={s => { if (showScanner === 'article') { const found = items.find(i => i.id === s); if (found) setMoveForm(p => ({...p, itemId: found.id})); } else { if (moveForm.type === 'IN' || isBulkEntry) setRawSerialsInput(p => p + (p ? '\n' : '') + s); else setMoveForm(p => ({...p, selectedSerials: [...(p.selectedSerials || []), s]})); } setShowScanner(null); }} onClose={() => setShowScanner(null)} />}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
        <div><h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Orange Stock Flow</h2><div className="flex items-center space-x-2 mt-1"><p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Traçabilité & Flux Temps Réel</p>{!isAdmin && (<div className="flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 text-[8px] font-black uppercase"><ShieldAlert className="w-2.5 h-2.5 mr-1" />{hasPerm('create') || hasPerm('update') ? 'Accès Édition' : 'Lecture Seule'}</div>)}</div></div>
        <div className="flex items-center space-x-4 print:hidden">{hasPerm('create') && (<button onClick={() => { setMoveForm({ type: 'OUT', agentName: '', selectedSerials: [], date: new Date().toISOString().split('T')[0] }); setShowModal('movement'); }} className="bg-[#ff7900] text-white px-6 py-4 rounded-[1.8rem] font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-slate-900 transition-all flex items-center"><Plus className="w-4 h-4 mr-2" /> Nouveau Flux</button>)}</div>
      </div>

      <div className="flex bg-white p-1.5 rounded-[2rem] shadow-sm border border-slate-200 mb-8 w-fit overflow-x-auto max-w-full print:hidden">
        {[{ id: 'inventory', label: 'Inventaire', icon: LayoutGrid }, { id: 'traceability', label: 'Traçabilité SN', icon: SearchCode }, { id: 'movements', label: 'Historique', icon: History }, { id: 'analytics', label: 'Rapports Pro', icon: BarChart3 }, { id: 'sellers', label: 'Vendeurs', icon: Users }, { id: 'ai', label: 'IA Assistant', icon: Sparkles }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as StockTab)} className={`flex items-center px-6 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}><tab.icon className="w-4 h-4 mr-2" /> {tab.label}</button>
        ))}
      </div>

      {isLoading ? <div className="py-20 flex flex-col items-center justify-center"><Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" /><p className="text-[10px] font-black uppercase text-slate-400">Sync...</p></div> : (
        <div className="animate-in fade-in duration-500">
          
          {/* ... (Other tabs kept as is) ... */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              {stats.alerts > 0 && (
                <div className="bg-rose-50 border-2 border-rose-100 p-6 rounded-[2.5rem] flex flex-col md:flex-row items-center justify-between shadow-sm animate-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center space-x-4 mb-4 md:mb-0">
                    <div className="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-lg animate-pulse">
                      <BellRing className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-rose-900 font-black uppercase italic tracking-tight">Alerte de Stock Bas</h4>
                      <p className="text-[11px] text-rose-600 font-bold leading-tight">
                        {stats.alerts === 1 
                          ? `Le produit "${stats.alertedItems[0].name}" est en dessous du seuil.`
                          : `${stats.alerts} articles sont actuellement en dessous de la limite permise.`
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex -space-x-2 overflow-hidden">
                    {stats.alertedItems.slice(0, 5).map((item, idx) => (
                      <div key={item.id} className="w-8 h-8 rounded-full border-2 border-white bg-rose-100 flex items-center justify-center text-[10px] font-black text-rose-600" title={item.name}>
                        {item.name.charAt(0)}
                      </div>
                    ))}
                    {stats.alerts > 5 && (
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-900 flex items-center justify-center text-[8px] font-black text-white">
                        +{stats.alerts - 5}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-8 border-b bg-slate-50/30 flex justify-between items-center">
                  <h3 className="font-black uppercase italic tracking-tighter">Catalogue Produits</h3>
                  {hasPerm('create') && <button onClick={() => { setEditingItemId(null); setItemForm({ category: 'Fixe', minThreshold: 5, basePrice: 0 }); setShowModal('item'); }} className="text-[#ff7900] font-black uppercase text-[10px] tracking-widest flex items-center"><Plus className="w-4 h-4 mr-1" /> Ajouter</button>}
                </div>
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest"><tr><th className="px-8 py-5">Article</th><th className="px-8 py-5 text-right">Stock Dépôt</th><th className="px-8 py-5 text-right">Prix</th><th className="px-8 py-5 text-right print:hidden">Actions</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{items.map(i => (
                      <tr key={i.id} className={`hover:bg-slate-50 group transition-all ${i.warehouseSerials.length <= i.minThreshold ? 'bg-rose-50/30' : ''}`}>
                        <td className="px-8 py-6"><p className="font-black text-slate-900">{i.name}</p><p className="text-[9px] text-slate-400">Réf: {i.id}</p></td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`text-xl font-black ${i.warehouseSerials.length <= i.minThreshold ? 'text-rose-500' : 'text-slate-900'}`}>{i.warehouseSerials.length}</span>
                            {i.warehouseSerials.length <= i.minThreshold && <span className="text-[7px] font-black uppercase text-rose-500 bg-rose-100 px-1 rounded mt-1">Seuil: {i.minThreshold}</span>}
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right font-black">{i.basePrice} DH</td>
                        <td className="px-8 py-6 text-right print:hidden">
                          <div className="flex justify-end space-x-2">
                            {hasPerm('update') && (
                                <button onClick={() => { setEditingItemId(i.id); setItemForm(i); setShowModal('item'); }} className="p-2.5 text-slate-300 hover:text-blue-500 transition-colors bg-white border border-slate-100 rounded-xl shadow-sm"><Edit2 className="w-4 h-4" /></button>
                            )}
                            {hasPerm('delete') && (
                                <button onClick={() => { setDeletingProductId(i.id); setShowModal('item_delete'); }} className="p-2.5 text-slate-300 hover:text-rose-500 transition-colors bg-white border border-slate-100 rounded-xl shadow-sm"><Trash2 className="w-4 h-4" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'traceability' && (
            <div className="space-y-6 flex flex-col h-full relative">
               <div className="sticky top-0 z-20 bg-[#f8fafc] pt-2 pb-4 px-2 -mx-2 print:hidden space-y-4">
                 <div className="flex flex-col md:flex-row flex-wrap items-center gap-3">
                    <div className="relative flex-grow min-w-[200px] w-full md:w-auto group">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                      <input 
                        type="text" 
                        placeholder="Chercher un Sériel SN..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full pl-12 pr-6 py-4 rounded-2xl bg-white border border-transparent shadow-sm font-bold focus:ring-2 focus:ring-orange-500/20 focus:border-orange-200 transition-all text-sm" 
                      />
                    </div>
                    
                    <div className="relative w-full md:w-48">
                      <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select 
                        value={filterOwner} 
                        onChange={e => setFilterOwner(e.target.value)}
                        className="w-full pl-12 pr-10 py-4 rounded-2xl bg-white border-none shadow-sm font-bold appearance-none cursor-pointer text-slate-700 focus:ring-2 focus:ring-orange-500/20 transition-all text-xs"
                      >
                        <option value="all">Détenteur: Tous</option>
                        <option value="Dépôt">Dépôt Central</option>
                        {sellers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="relative w-full md:w-48">
                      <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <select 
                        value={filterItem} 
                        onChange={e => setFilterItem(e.target.value)}
                        className="w-full pl-12 pr-10 py-4 rounded-2xl bg-white border-none shadow-sm font-bold appearance-none cursor-pointer text-slate-700 focus:ring-2 focus:ring-orange-500/20 transition-all text-xs"
                      >
                        <option value="all">Article: Tous</option>
                        {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="relative w-full md:w-48">
                      <ListFilter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select 
                        value={filterStatus} 
                        onChange={e => setFilterStatus(e.target.value)}
                        className="w-full pl-12 pr-10 py-4 rounded-2xl bg-white border-none shadow-sm font-bold appearance-none cursor-pointer text-slate-700 focus:ring-2 focus:ring-orange-500/20 transition-all text-xs"
                      >
                        <option value="all">Statut: Tous</option>
                        <option value="available">Disponible</option>
                        <option value="assigned">Affecté</option>
                        <option value="deposited">Déposé</option>
                        <option value="sold">Vendu</option>
                        <option value="pending_payment">En attente paiement</option>
                        <option value="defective">Défectueux</option>
                        <option value="lost">Perdu</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>

                    <div className="flex items-center gap-2">
                       {hasPerm('create') && (
                         <label className="p-4 bg-white text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-2xl border border-transparent hover:border-indigo-100 shadow-sm transition-all flex items-center justify-center cursor-pointer group" title="Importer CSV">
                           <input type="file" accept=".csv" onChange={handleImportStockCSV} className="hidden" />
                           <FileUp className="w-5 h-5 group-hover:scale-110 transition-transform" />
                         </label>
                       )}
                       <button onClick={handleExportStockCSV} className="p-4 bg-white text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-2xl border border-transparent hover:border-emerald-100 shadow-sm transition-all flex items-center justify-center group" title="Exporter CSV">
                          <FileDown className="w-5 h-5 group-hover:scale-110 transition-transform" />
                       </button>
                       {selectedSNs.size > 0 && hasPerm('delete') && (
                          <button onClick={handleBulkDelete} className="p-4 bg-rose-500 text-white rounded-2xl shadow-lg transition-all flex items-center justify-center group hover:bg-rose-600 animate-in fade-in zoom-in" title="Supprimer Sélection">
                             <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                          </button>
                       )}
                       <button 
                        onClick={resetTraceabilityFilters}
                        title="Réinitialiser les filtres"
                        className="p-4 bg-white text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-2xl border border-transparent hover:border-orange-100 shadow-sm transition-all flex items-center justify-center group"
                       >
                         <FilterX className="w-5 h-5 group-hover:scale-110 transition-transform" />
                       </button>

                       <div className="bg-slate-900 px-5 py-4 rounded-2xl border border-slate-800 flex items-center space-x-2 shadow-lg min-w-fit">
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                        <span className="text-[10px] font-black text-white uppercase tracking-wider whitespace-nowrap">{traceabilityList.length} Unités</span>
                      </div>
                    </div>
                 </div>
               </div>
               
               <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                 <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                   <table className="w-full text-left table-fixed">
                     <thead className="bg-slate-50 sticky top-0 z-10 text-[10px] font-black uppercase text-slate-400 tracking-widest shadow-sm">
                       <tr>
                         <th className="px-4 py-5 w-[5%] text-center">
                            <input 
                              type="checkbox" 
                              checked={selectedSNs.size > 0 && selectedSNs.size === traceabilityList.length}
                              onChange={toggleSelectAll}
                              className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                            />
                         </th>
                         <th className="px-4 py-5 w-[25%]">Sériel</th>
                         <th className="px-4 py-5 w-[25%]">Article</th>
                         <th className="px-4 py-5 text-center w-[20%]">Détenteur</th>
                         <th className="px-4 py-5 text-center w-[15%]">Statut</th>
                         <th className="px-4 py-5 text-right print:hidden w-[10%]">Actions</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                       {traceabilityList.map(u => (
                         <tr key={u.serialNumber} className={`hover:bg-slate-50 group transition-colors ${selectedSNs.has(u.serialNumber) ? 'bg-orange-50/50' : ''}`}>
                            <td className="px-4 py-4 text-center">
                               <input 
                                 type="checkbox" 
                                 checked={selectedSNs.has(u.serialNumber)}
                                 onChange={() => toggleSelectSN(u.serialNumber)}
                                 className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                               />
                            </td>
                            <td className="px-4 py-4 font-mono font-black text-xs truncate">{u.serialNumber}</td>
                            <td className="px-4 py-4 text-[10px] font-bold text-slate-400 truncate">{items.find(i => i.id === u.itemId)?.name}</td>
                            <td className="px-4 py-4 text-center text-[10px] font-black uppercase text-slate-700 truncate">{u.currentOwner}</td>
                            <td className="px-4 py-4 text-center">
                              <span className={`px-2 py-1 rounded text-[8px] font-black uppercase whitespace-nowrap ${
                                u.status === 'available' ? 'bg-emerald-50 text-emerald-600' : 
                                u.status === 'sold' ? 'bg-slate-900 text-white' : 
                                u.status === 'lost' || u.status === 'defective' ? 'bg-rose-50 text-rose-600' : 
                                u.status === 'deposited' ? 'bg-amber-50 text-amber-600' :
                                'bg-blue-50 text-blue-600'
                              }`}>
                                {u.status}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right print:hidden">
                               <div className="flex justify-end space-x-1">
                                  {hasPerm('update') && (
                                    <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-all">
                                       <button onClick={() => { setEditingUnitSN(u.serialNumber); setUnitPriceInput(u.price || 0); setShowModal('unit_price'); }} className="p-2 text-slate-300 hover:text-orange-500" title="Modifier Prix"><Coins className="w-4 h-4" /></button>
                                       <button onClick={() => { setEditingUnitSN(u.serialNumber); setShowModal('unit_status'); }} className="p-2 text-slate-300 hover:text-blue-500" title="Changer Statut"><Settings2 className="w-4 h-4" /></button>
                                       <button onClick={() => { setEditingUnitSN(u.serialNumber); setShowModal('unit_owner'); }} className="p-2 text-slate-300 hover:text-emerald-500" title="Transférer"><UserCog className="w-4 h-4" /></button>
                                    </div>
                                  )}
                                  {hasPerm('delete') && <button onClick={() => { setEditingUnitSN(u.serialNumber); setShowModal('unit_delete'); }} className="p-2 text-slate-200 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>}
                               </div>
                            </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                   {traceabilityList.length === 0 && (
                     <div className="py-24 text-center">
                        <Package className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                        <p className="text-xs font-black uppercase text-slate-300 tracking-[0.2em]">Aucun résultat pour ces critères</p>
                     </div>
                   )}
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-8 pb-12">
               {/* ... (existing analytics content) ... */}
               <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 print:hidden">
                 <div className="flex items-center space-x-3 mb-8">
                   <Filter className="w-5 h-5 text-[#ff7900]" />
                   <h3 className="font-black uppercase italic tracking-tighter text-xl text-slate-900">Configurateur de Rapport</h3>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Date de début</label>
                     <input type="date" value={reportDateStart} onChange={e => setReportDateStart(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold shadow-inner" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Date de fin</label>
                     <input type="date" value={reportDateEnd} onChange={e => setReportDateEnd(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold shadow-inner" />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Agent / Vendeur</label>
                     <select value={reportAgent} onChange={e => setReportAgent(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold shadow-inner appearance-none cursor-pointer">
                        <option value="all">Tous les vendeurs</option>
                        {sellers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                     </select>
                   </div>
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Type Flux</label>
                     <select value={reportType} onChange={e => setReportType(e.target.value)} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold shadow-inner appearance-none cursor-pointer">
                        <option value="all">Tout (E/S)</option>
                        <option value="IN">Entrées (Réception)</option>
                        <option value="OUT">Sorties (Dispatch/Vente)</option>
                     </select>
                   </div>
                 </div>
                 <div className="mt-8 flex justify-end space-x-3">
                    <button onClick={() => window.print()} className="flex items-center px-6 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 transition-all shadow-lg">
                      <Printer className="w-4 h-4 mr-2" /> Rapport PDF
                    </button>
                 </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                 {/* ... (existing KPI cards) ... */}
                 <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 border-l-8 border-l-[#ff7900]">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Flux Total Période</p>
                    <h4 className="text-3xl font-black text-slate-900 mt-2">{reportMovements.reduce((a,c) => a + c.quantity, 0)}</h4>
                    <p className="text-[9px] font-bold text-slate-400 mt-1 italic">{reportMovements.length} opérations</p>
                 </div>
                 <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 border-l-8 border-l-emerald-500">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Entrées Stock</p>
                    <h4 className="text-3xl font-black text-emerald-600 mt-2">{reportMovements.filter(m => m.type === 'IN').reduce((a,c) => a + c.quantity, 0)}</h4>
                 </div>
                 <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 border-l-8 border-l-blue-500">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sorties / Ventes</p>
                    <h4 className="text-3xl font-black text-blue-600 mt-2">{reportMovements.filter(m => m.type !== 'IN').reduce((a,c) => a + c.quantity, 0)}</h4>
                 </div>
                 <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 border-l-8 border-l-orange-500">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Net Variation</p>
                    <h4 className="text-3xl font-black text-orange-500 mt-2">
                       {reportMovements.filter(m => m.type === 'IN').reduce((a,c) => a + c.quantity, 0) - reportMovements.filter(m => m.type !== 'IN').reduce((a,c) => a + c.quantity, 0)}
                    </h4>
                 </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {/* ... (existing charts) ... */}
                 <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                    <h3 className="font-black uppercase italic tracking-tighter text-slate-900 mb-8">Performance par Produit</h3>
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analyticsData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{fontSize: 9, fontWeight: 'bold'}} />
                          <YAxis tick={{fontSize: 10}} />
                          <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                          <Legend verticalAlign="top" align="right" />
                          <Bar dataKey="in" name="Entrées" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="out" name="Sorties" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                 </div>

                 <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                    <h3 className="font-black uppercase italic tracking-tighter text-slate-900 mb-8">Mouvements Journaliers</h3>
                    <div className="h-80 w-full">
                       <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={reportMovements.reduce((acc: any[], curr) => {
                            const day = curr.date;
                            const existing = acc.find(a => a.date === day);
                            if (existing) {
                              if (curr.type === 'IN') existing.in += curr.quantity; else existing.out += curr.quantity;
                            } else {
                              acc.push({ date: day, in: curr.type === 'IN' ? curr.quantity : 0, out: curr.type !== 'IN' ? curr.quantity : 0 });
                            }
                            return acc;
                         }, []).sort((a,b) => a.date.localeCompare(b.date))}>
                           <defs>
                             <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                             <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                           <XAxis dataKey="date" tick={{fontSize: 9}} />
                           <YAxis tick={{fontSize: 10}} />
                           <Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} />
                           <Area type="monotone" dataKey="in" name="Flux Entrant" stroke="#10b981" fillOpacity={1} fill="url(#colorIn)" />
                           <Area type="monotone" dataKey="out" name="Flux Sortant" stroke="#3b82f6" fillOpacity={1} fill="url(#colorOut)" />
                         </AreaChart>
                       </ResponsiveContainer>
                    </div>
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'sellers' && (
            <div className="space-y-6">
              {/* ... (existing sellers content) ... */}
              <div className="flex justify-between items-center print:hidden">
                 <h3 className="text-xl font-black uppercase italic tracking-tighter">Équipe de Vente</h3>
                 {hasPerm('create') && (
                    <button onClick={() => setShowModal('seller')} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg flex items-center"><UserPlus className="w-4 h-4 mr-2 text-orange-400" /> Nouveau Vendeur</button>
                 )}
              </div>
              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden"><table className="w-full text-left"><thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest"><tr><th className="px-8 py-5">Collaborateur</th><th className="px-8 py-5">Contact</th><th className="px-8 py-5 text-right print:hidden">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{sellers.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 group">
                   <td className="px-8 py-6"><p className="font-black text-slate-900">{s.name}</p><p className="text-[9px] text-slate-400">ID: {s.id}</p></td>
                   <td className="px-8 py-6 font-bold text-slate-500">{s.phone || 'Non renseigné'}</td>
                   <td className="px-8 py-6 text-right print:hidden">{hasPerm('delete') && <button onClick={() => { setDeletingSellerId(s.id); setShowModal('seller_delete'); }} className="p-2 text-slate-200 hover:text-rose-500 transition-colors bg-white border border-slate-100 rounded-xl shadow-sm"><Trash2 className="w-4 h-4" /></button>}</td>
                </tr>
              ))}</tbody></table></div>
            </div>
          )}

          {activeTab === 'movements' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 print:hidden flex flex-wrap items-center gap-4">
                 <div className="flex items-center gap-2 flex-grow min-w-[200px]">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <input type="date" value={historyFilterStart} onChange={e => setHistoryFilterStart(e.target.value)} className="p-3 bg-slate-50 border-none rounded-xl text-xs font-bold w-full" placeholder="Du" />
                    <span className="text-slate-300">-</span>
                    <input type="date" value={historyFilterEnd} onChange={e => setHistoryFilterEnd(e.target.value)} className="p-3 bg-slate-50 border-none rounded-xl text-xs font-bold w-full" placeholder="Au" />
                 </div>
                 <div className="min-w-[200px]">
                    <select value={historyFilterItem} onChange={e => setHistoryFilterItem(e.target.value)} className="w-full p-3 bg-slate-50 border-none rounded-xl text-xs font-bold appearance-none cursor-pointer">
                       <option value="all">Tous les produits</option>
                       {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                 </div>
                 <div className="min-w-[200px]">
                    <select value={historyFilterAgent} onChange={e => setHistoryFilterAgent(e.target.value)} className="w-full p-3 bg-slate-50 border-none rounded-xl text-xs font-bold appearance-none cursor-pointer">
                        <option value="all">Tous les agents</option>
                        {sellers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                 </div>
                 <button onClick={resetHistoryFilters} className="p-3 bg-slate-100 text-slate-400 hover:text-rose-500 rounded-xl transition-all" title="Réinitialiser">
                    <FilterX className="w-4 h-4" />
                 </button>
              </div>

              <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="max-h-[700px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left table-fixed">
                    <thead className="bg-slate-50 sticky top-0 z-10 text-[10px] font-black uppercase text-slate-400 tracking-widest shadow-sm">
                      <tr>
                        <th className="px-8 py-5 w-[15%]">Date</th>
                        <th className="px-8 py-5 w-[20%]">Commercial</th>
                        <th className="px-8 py-5 w-[30%]">Article</th>
                        <th className="px-8 py-5 w-[25%]">Sériels (Preuve)</th>
                        <th className="px-8 py-5 text-right w-[10%]">Qté</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredHistory.filter(m => m.type === 'OUT').map(m => (
                        <tr key={m.id} className="hover:bg-slate-50 transition-all group">
                          <td className="px-8 py-6 text-xs font-bold text-slate-400 truncate">{m.date}</td>
                          <td className="px-8 py-6 uppercase font-black text-slate-700 text-[10px] tracking-widest truncate">{m.agentName || 'Non spécifié'}</td>
                          <td className="px-8 py-6 font-black text-slate-900 uppercase italic text-[10px] truncate">{items.find(i => i.id === m.itemId)?.name}</td>
                          <td className="px-8 py-6">
                             <div className="flex flex-wrap gap-1">
                               {m.selectedSerials?.map(sn => (
                                 <span key={sn} className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] font-mono font-bold text-slate-600">
                                   {sn}
                                 </span>
                               ))}
                             </div>
                          </td>
                          <td className="px-8 py-6 text-right font-black text-lg">{m.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredHistory.filter(m => m.type === 'OUT').length === 0 && (
                    <div className="py-24 text-center">
                      <History className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                      <p className="text-xs font-black uppercase text-slate-300 tracking-[0.2em]">Aucune sortie enregistrée</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-h-[70vh]">
              {/* ... (existing AI content) ... */}
              <div className="lg:col-span-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 border-t-8 border-t-[#ff7900]">
                  <div className="flex items-center space-x-3 mb-6">
                    <BrainCircuit className="w-6 h-6 text-[#ff7900]" />
                    <h3 className="font-black uppercase italic tracking-tighter text-slate-900">Analyses IA</h3>
                  </div>
                  <div className="space-y-3">
                    <button onClick={() => askGemini("Fais-moi un résumé complet de l'état actuel de mon stock Orange, les alertes et les points critiques.")} className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-orange-200 transition-all group">
                      <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest group-hover:text-orange-600 transition-colors">Résumé Inventaire</p>
                      <p className="text-[9px] text-slate-400 font-bold">Analyse globale des unités et alertes.</p>
                    </button>
                    <button onClick={() => askGemini("Identifie les produits qui vont bientôt manquer en te basant sur les seuils et les derniers mouvements.")} className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-orange-200 transition-all group">
                      <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest group-hover:text-orange-600 transition-colors">Prédiction Rupture</p>
                      <p className="text-[9px] text-slate-400 font-bold">Anticiper les besoins de réapprovisionnement.</p>
                    </button>
                    <button onClick={() => askGemini("Quels sont les agents qui détiennent le plus de matériel et quel type de matériel est le plus distribué ?")} className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-orange-200 transition-all group">
                      <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest group-hover:text-orange-600 transition-colors">Analyse Dispatch</p>
                      <p className="text-[9px] text-slate-400 font-bold">Répartition du stock terrain.</p>
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white">
                  <div className="flex items-center space-x-3 mb-4">
                    <Sparkles className="w-5 h-5 text-orange-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-400">Gemini Flash 3.0</span>
                  </div>
                  <p className="text-xs font-bold leading-relaxed text-slate-300">
                    L'IA analyse vos flux Orange en temps réel pour optimiser votre logistique Diversifia.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col overflow-hidden relative">
                <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase italic tracking-tight">Assistant Logistique</p>
                      <p className="text-[8px] font-black uppercase text-emerald-500 tracking-widest">Connecté au Stock Orange</p>
                    </div>
                  </div>
                  <button onClick={() => setAiChat([])} className="text-slate-300 hover:text-rose-500 transition-colors" title="Effacer conversation"><RotateCcw className="w-4 h-4" /></button>
                </div>

                <div className="flex-grow p-8 overflow-y-auto space-y-6 custom-scrollbar bg-slate-50/30">
                  {aiChat.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-20">
                      <div className="w-16 h-16 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center mb-6">
                        <MessageSquare className="w-8 h-8 text-slate-200" />
                      </div>
                      <h4 className="text-slate-900 font-black uppercase italic tracking-tighter">Comment puis-je vous aider ?</h4>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2">Posez une question sur vos flux Orange.</p>
                    </div>
                  ) : (
                    aiChat.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                        <div className={`max-w-[92%] p-6 rounded-[2rem] text-sm leading-relaxed shadow-md whitespace-pre-wrap ${
                          msg.role === 'user' 
                          ? 'bg-[#ff7900] text-white rounded-tr-none font-bold' 
                          : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none font-medium'
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    ))
                  )}
                  {isAiThinking && (
                    <div className="flex justify-start animate-pulse">
                      <div className="bg-slate-100 p-4 rounded-2xl flex items-center space-x-2">
                         <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce"></div>
                         <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                         <div className="w-2 h-2 bg-orange-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-6 bg-white border-t flex items-center space-x-4">
                  <input 
                    type="text" 
                    value={aiInput} 
                    onChange={e => setAiInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && askGemini()}
                    placeholder="Posez une question à l'IA..." 
                    className="flex-grow p-4 rounded-2xl bg-slate-50 border-none font-bold text-slate-900 focus:ring-2 focus:ring-orange-500/20"
                  />
                  <button 
                    disabled={isAiThinking || !aiInput.trim()}
                    onClick={() => askGemini()}
                    className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl hover:bg-[#ff7900] transition-all disabled:opacity-30"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ... (Other modals unchanged) ... */}
      {showModal === 'unit_price' && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:hidden">
          <div className="bg-white w-full max-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
               <h3 className="font-black text-slate-900 uppercase italic">Prix de Vente SN</h3>
               <button onClick={() => setShowModal(null)}><X className="w-6 h-6 text-slate-300" /></button>
            </div>
            <div className="p-8 space-y-4">
               <div><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nouveau Prix DH</label><input type="number" value={unitPriceInput} onChange={e => setUnitPriceInput(Number(e.target.value))} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold shadow-inner" /></div>
            </div>
            <div className="p-6 bg-slate-50 border-t flex space-x-3">
               <button onClick={() => setShowModal(null)} className="flex-1 py-4 rounded-2xl bg-white border border-slate-200 text-slate-400 font-black uppercase text-xs">Annuler</button>
               <button onClick={handleUpdateUnitPrice} className="flex-1 py-4 rounded-2xl bg-slate-900 text-white font-black uppercase text-xs">Valider</button>
            </div>
          </div>
        </div>
      )}

      {showModal === 'unit_status' && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:hidden">
          <div className="bg-white w-full max-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
                <h3 className="font-black text-slate-900 uppercase italic">Statut Unité</h3>
                <button onClick={() => setShowModal(null)}><X className="w-6 h-6 text-slate-300" /></button>
             </div>
             <div className="p-8 space-y-2">
                {['available', 'assigned', 'deposited', 'sold', 'pending_payment', 'defective', 'lost'].map(st => (
                  <button key={st} onClick={() => handleUpdateUnitStatus(st as any)} className="w-full text-left p-4 rounded-xl hover:bg-slate-50 font-black uppercase text-[10px] tracking-widest flex items-center justify-between"><span>{st}</span><ChevronRight className="w-4 h-4 text-slate-200" /></button>
                ))}
             </div>
          </div>
        </div>
      )}

      {showModal === 'unit_owner' && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:hidden">
          <div className="bg-white w-full max-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
                <h3 className="font-black text-slate-900 uppercase italic">Détenteur Actuel</h3>
                <button onClick={() => setShowModal(null)}><X className="w-6 h-6 text-slate-300" /></button>
             </div>
             <div className="p-8 space-y-2 max-h-[60vh] overflow-y-auto">
                <button onClick={() => handleUpdateUnitOwner('Dépôt')} className="w-full text-left p-4 rounded-xl bg-orange-50 text-orange-600 font-black uppercase text-[10px] tracking-widest border border-orange-100 flex items-center justify-between"><span>Dépôt Central</span><Layers className="w-4 h-4" /></button>
                {sellers.map(s => (
                  <button key={s.id} onClick={() => handleUpdateUnitOwner(s.name)} className="w-full text-left p-4 rounded-xl hover:bg-slate-50 font-black uppercase text-[10px] tracking-widest flex items-center justify-between border border-transparent hover:border-slate-100"><span>{s.name}</span><ChevronRight className="w-4 h-4 text-slate-200" /></button>
                ))}
             </div>
          </div>
        </div>
      )}

      {showModal === 'movement' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:hidden">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Flux Logistique Orange</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Mouvement de matériel individuel ou par lot</p>
              </div>
              <button onClick={() => setShowModal(null)}><X className="w-6 h-6 text-slate-300" /></button>
            </div>
            
            <div className="flex-grow overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-8 custom-scrollbar">
              <div className="space-y-6">
                <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                  {['IN', 'OUT', 'DEPOSITED', 'SALE', 'RETURN', 'PENDING_SALE', 'LOST', 'DEFECTIVE'].map(t => (
                    <button key={t} onClick={() => setMoveForm({...moveForm, type: t as any, selectedSerials: []})} className={`py-3 rounded-xl text-[8px] font-black uppercase tracking-tighter transition-all ${moveForm.type === t ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>{t}</button>
                  ))}
                </div>
                <div>
                   <div className="flex justify-between items-center ml-2 mb-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Article</label>
                      {moveForm.itemId && (
                        <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-orange-50 text-[#ff7900] rounded-full border border-orange-100 animate-in fade-in zoom-in duration-300">
                           <Layers className="w-2.5 h-2.5" />
                           <span className="text-[9px] font-black uppercase tracking-widest">
                             {(!moveForm.agentName || moveForm.agentName === 'Dépôt') 
                               ? `Stock Dépôt: ${items.find(i => i.id === moveForm.itemId)?.warehouseSerials.length || 0}`
                               : `Stock Agent: ${units.filter(u => u.itemId === moveForm.itemId && u.currentOwner === moveForm.agentName).length}`}
                           </span>
                        </div>
                      )}
                   </div>
                   <select value={moveForm.itemId || ''} onChange={e => setMoveForm({...moveForm, itemId: e.target.value, selectedSerials: []})} className="w-full p-5 rounded-2xl bg-slate-50 border-none font-black text-slate-900 appearance-none shadow-inner"><option value="">Sélectionner le produit...</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                </div>
                {moveForm.type !== 'IN' && (
                   <div><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Agent / Vendeur</label><select value={moveForm.agentName || ''} onChange={e => setMoveForm({...moveForm, agentName: e.target.value, selectedSerials: []})} className="w-full p-5 rounded-2xl bg-slate-50 border-none font-black text-slate-900 appearance-none shadow-inner"><option value="">Dépôt (Central)</option>{sellers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
                )}
                <div className="flex items-center space-x-4"><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Date</label><input type="date" value={moveForm.date || ''} onChange={e => setMoveForm({...moveForm, date: e.target.value})} className="flex-grow p-5 rounded-2xl bg-slate-50 border-none font-black shadow-inner" /></div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => setIsBulkEntry(false)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all flex items-center ${!isBulkEntry && moveForm.type !== 'IN' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}><ListChecks className="w-3 h-3 mr-1.5" /> Sélection</button>
                    <button onClick={() => setIsBulkEntry(true)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all flex items-center ${isBulkEntry || moveForm.type === 'IN' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}><FileInput className="w-3 h-3 mr-1.5" /> Par Lot</button>
                  </div>
                  <button onClick={() => setShowScanner('serial')} className="text-[#ff7900] font-black uppercase text-[10px] tracking-widest flex items-center bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100 hover:bg-orange-100 transition-all"><Scan className="w-4 h-4 mr-2" /> Scanner</button>
                </div>

                {!isBulkEntry && moveForm.type !== 'IN' ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                      <input type="text" placeholder="Filtrer les SN disponibles..." value={modalSNSearch} onChange={e => setModalSNSearch(e.target.value)} className="w-full pl-8 pr-4 py-2 rounded-xl bg-slate-100 border-none text-[10px] font-bold" />
                    </div>
                    <div className="h-72 overflow-y-auto bg-slate-50 rounded-2xl p-4 border-2 border-dashed border-slate-200 custom-scrollbar">
                      <div className="space-y-1">
                         {modalFilteredSNs.length === 0 ? <p className="text-[10px] text-slate-300 font-black uppercase text-center py-10">Aucun SN disponible pour cette opération</p> : modalFilteredSNs.map(sn => (
                           <label key={sn} className={`flex items-center p-3 rounded-xl border transition-all cursor-pointer ${moveForm.selectedSerials?.includes(sn) ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-transparent hover:border-slate-100'}`}><input type="checkbox" checked={moveForm.selectedSerials?.includes(sn)} onChange={() => setMoveForm(p => ({ ...p, selectedSerials: p.selectedSerials?.includes(sn) ? p.selectedSerials?.filter(s => s !== sn) : [...(p.selectedSerials || []), sn]}))} className="hidden" /><div className={`w-4 h-4 rounded border-2 flex items-center justify-center mr-3 ${moveForm.selectedSerials?.includes(sn) ? 'bg-orange-500 border-orange-500' : 'bg-white border-slate-200'}`}>{moveForm.selectedSerials?.includes(sn) && <CheckCircle2 className="w-3 h-3 text-white" />}</div><span className="font-mono text-xs font-black">{sn}</span></label>
                         ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex flex-col">
                    <div className="flex-grow">
                      <textarea 
                        placeholder="Coller ici la liste des sériels Orange (un par ligne, espace ou tabulation)..." 
                        value={rawSerialsInput} 
                        onChange={e => setRawSerialsInput(e.target.value)} 
                        className="w-full h-80 p-5 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 font-mono text-xs font-bold focus:ring-2 focus:ring-orange-500/20 resize-none shadow-inner"
                      ></textarea>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-2 italic">* Les sériels seront vérifiés avant validation du mouvement.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-8 bg-slate-50 border-t flex space-x-4"><button onClick={() => setShowModal(null)} className="flex-1 py-5 rounded-2xl bg-white border border-slate-200 text-slate-400 font-black uppercase text-xs">Annuler</button><button onClick={handleAddMovement} className={`flex-1 py-5 rounded-2xl font-black uppercase text-xs text-white transition-all shadow-xl ${pendingConfirmation ? 'bg-emerald-50' : 'bg-slate-900'}`}>{pendingConfirmation ? 'Confirmer le mouvement ?' : 'Valider l\'opération'}</button></div>
          </div>
        </div>
      )}

      {showModal === 'item' && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:hidden">
          <div className="bg-white w-full max-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-8 border-b bg-slate-50 flex items-center justify-between"><h3 className="font-black text-slate-900 uppercase italic">Fiche Produit Orange</h3><button onClick={() => setShowModal(null)}><X className="w-6 h-6 text-slate-300" /></button></div>
             <div className="p-8 space-y-4">
                <div><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Libellé Produit</label><input type="text" value={itemForm.name || ''} onChange={e => setItemForm({...itemForm, name: e.target.value})} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold shadow-inner" placeholder="ex: Router FTTH V2" /></div>
                <div><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Prix de Base DH</label><input type="number" value={itemForm.basePrice || ''} onChange={e => setItemForm({...itemForm, basePrice: Number(e.target.value)})} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold shadow-inner" /></div>
                <div><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Seuil Alerte</label><input type="number" value={itemForm.minThreshold || ''} onChange={e => setItemForm({...itemForm, minThreshold: Number(e.target.value)})} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-bold shadow-inner" /></div>
             </div>
             <div className="p-8 bg-slate-50 border-t flex space-x-3"><button onClick={() => setShowModal(null)} className="flex-1 py-4 rounded-2xl bg-white border border-slate-200 text-slate-400 font-black uppercase text-xs">Annuler</button><button onClick={handleSaveItem} className="flex-1 py-4 rounded-2xl bg-[#ff7900] text-white font-black uppercase text-xs shadow-lg">Enregistrer</button></div>
          </div>
        </div>
      )}

      {showModal === 'seller' && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:hidden">
          <div className="bg-white w-full max-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-6 border-b bg-slate-50 flex items-center justify-between"><h3 className="font-black text-slate-900 uppercase italic tracking-tighter">Nouveau Vendeur</h3><button onClick={() => setShowModal(null)}><X className="w-6 h-6 text-slate-300" /></button></div>
             <div className="p-8 space-y-4">
                <div><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Nom Complet</label><input type="text" value={sellerForm.name || ''} onChange={e => setSellerForm({...sellerForm, name: e.target.value})} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-black shadow-inner" /></div>
                <div><label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-2">Téléphone</label><input type="text" value={sellerForm.phone || ''} onChange={e => setSellerForm({...sellerForm, phone: e.target.value})} className="w-full p-4 rounded-2xl bg-slate-50 border-none font-black shadow-inner" /></div>
             </div>
             <div className="p-6 bg-slate-50 border-t flex space-x-3"><button onClick={() => setShowModal(null)} className="flex-1 py-4 rounded-2xl bg-white border border-slate-200 text-slate-400 font-black uppercase text-xs">Annuler</button><button onClick={handleSaveSeller} className="flex-1 py-4 rounded-2xl bg-slate-900 text-white font-black uppercase text-xs">Ajouter</button></div>
          </div>
        </div>
      )}

      {showModal === 'unit_delete' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md print:hidden">
          <div className="bg-white w-full max-sm rounded-[2.5rem] shadow-2xl overflow-hidden p-8 text-center space-y-6 border-4 border-rose-500 animate-in zoom-in-95">
             <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto"><AlertTriangle className="w-10 h-10 text-rose-500 animate-bounce" /></div>
             <div><h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">Supprimer SN ?</h3><p className="text-xs font-bold text-slate-400 uppercase mt-2">Cette action retirera l'unité du stock orange définitivement.</p></div>
             <div className="flex flex-col space-y-3"><button onClick={handleConfirmDeleteUnit} className="w-full py-4 rounded-2xl bg-rose-500 text-white font-black uppercase text-xs shadow-lg">Supprimer Définitivement</button><button onClick={() => setShowModal(null)} className="w-full py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-xs">Annuler</button></div>
          </div>
        </div>
      )}

      {showModal === 'item_delete' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md print:hidden">
          <div className="bg-white w-full max-sm rounded-[2.5rem] shadow-2xl overflow-hidden p-8 text-center space-y-6 border-4 border-rose-500 animate-in zoom-in-95">
             <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto"><AlertTriangle className="w-10 h-10 text-rose-500" /></div>
             <div>
               <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">Supprimer l'article ?</h3>
               <p className="text-xs font-bold text-slate-400 uppercase mt-2">Attention : Cela ne supprimera pas les mouvements passés mais l'article disparaîtra du catalogue Orange Maroc.</p>
             </div>
             <div className="flex flex-col space-y-3">
               <button onClick={handleConfirmDeleteItem} className="w-full py-4 rounded-2xl bg-rose-500 text-white font-black uppercase text-xs shadow-lg">Confirmer la suppression</button>
               <button onClick={() => setShowModal(null)} className="w-full py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-xs">Annuler</button>
             </div>
          </div>
        </div>
      )}

      {showModal === 'seller_delete' && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md print:hidden">
          <div className="bg-white w-full max-sm rounded-[2.5rem] shadow-2xl overflow-hidden p-8 text-center space-y-6 border-4 border-rose-500 animate-in zoom-in-95">
             <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto"><Trash2 className="w-10 h-10 text-rose-500" /></div>
             <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">Retirer le Vendeur ?</h3>
             <div className="flex flex-col space-y-3"><button onClick={handleConfirmDeleteSeller} className="w-full py-4 rounded-2xl bg-rose-500 text-white font-black uppercase text-xs shadow-lg">Confirmer</button><button onClick={() => setShowModal(null)} className="w-full py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-xs">Annuler</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockManagement;