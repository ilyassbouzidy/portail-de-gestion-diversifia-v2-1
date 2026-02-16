
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, HRSettings, RawAttendanceRecord, AuthorizedAbsence, AttendanceAnalysis, ModulePermissions } from '../types';
import { saveCloudData, getCloudData } from '../services/database';
import { GoogleGenerativeAI as GoogleGenAI } from "@google/generative-ai";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line, ComposedChart
} from 'recharts';
import { 
  FileUp, Settings, BarChart3, Users, AlertCircle, CheckCircle2, 
  Clock, Calendar, Download, Search, ChevronRight,
  Activity, UserX, FileSpreadsheet, Info, Save,
  FilterX, UserCheck, Timer, LayoutList, Loader2, Printer,
  FileText, TrendingUp, AlertTriangle, Trash2, ToggleRight,
  UserRoundCheck, Filter, ChevronDown, ListFilter, CalendarX, Plus, ArrowRight,
  Banknote, History, ShieldAlert, ArrowDownWideNarrow, Briefcase, Mail, Send, X,
  Clock3, Scissors, Eraser, Sparkles, Bot, MessageSquare, RotateCcw, BrainCircuit, RefreshCcw
} from 'lucide-react';

interface HRAttendanceProps { user: User; }
type HRTab = 'dashboard' | 'imports' | 'absences' | 'analysis' | 'recap' | 'config' | 'ai';

const COLORS = ['#6366f1', '#f43f5e', '#fbbf24', '#10b981', '#8b5cf6', '#ff7900', '#3b82f6'];

const FeedbackPopup: React.FC<{ 
  title: string; 
  message: string; 
  onClose: () => void;
  type?: 'success' | 'info' | 'warning'
}> = ({ title, message, onClose, type = 'success' }) => (
  <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md print:hidden">
    <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-4 border-slate-900">
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

const HRAttendance: React.FC<HRAttendanceProps> = ({ user }) => {
  const isAdmin = user.role === 'admin';
  
  const hasPerm = (action: keyof ModulePermissions) => {
    if (isAdmin) return true;
    return !!user.permissions?.hr?.[action];
  };

  const [activeTab, setActiveTab] = useState<HRTab>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEmployeeId, setFilterEmployeeId] = useState('all');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [selectedMailEmployee, setSelectedMailEmployee] = useState<any | null>(null);

  const resetFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterEmployeeId('all');
    setFilterDepartment('all');
    setFilterDateStart('');
    setFilterDateEnd('');
    const now = new Date();
    setFilterMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  };

  const [rawRecords, setRawRecords] = useState<RawAttendanceRecord[]>([]);
  const [absences, setAbsences] = useState<AuthorizedAbsence[]>([]);
  const [analysis, setAnalysis] = useState<AttendanceAnalysis[]>([]);
  
  // Cache local pour les résultats d'analyse fractionnés par mois (YYYY-MM)
  const [analysisCache, setAnalysisCache] = useState<Record<string, AttendanceAnalysis[]>>({});
  const [availableAnalysisMonths, setAvailableAnalysisMonths] = useState<string[]>([]);

  const [opFeedback, setOpFeedback] = useState<{ title: string; message: string; type: 'success' | 'warning' } | null>(null);

  // AI State
  const [aiInput, setAiInput] = useState('');
  const [aiChat, setAiChat] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [isPartialAbsence, setIsPartialAbsence] = useState(false);
  const [absenceForm, setAbsenceForm] = useState<{
    employeeId: string;
    dateStart: string;
    dateEnd: string;
    type: AuthorizedAbsence['type'];
    comment: string;
    startTime: string;
    endTime: string;
  }>({
    employeeId: '',
    dateStart: new Date().toISOString().split('T')[0],
    dateEnd: new Date().toISOString().split('T')[0],
    type: 'Autorisation',
    comment: '',
    startTime: '08:30',
    endTime: '10:30'
  });

  // Normalisation robuste des dates
  const normalizeDateTime = (ts: string) => {
    if (!ts) return '';
    const cleanTs = ts.trim().replace(/['"]/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '');
    const parts = cleanTs.split(/\s+/);
    let datePart = parts[0];
    let timePart = parts[1] || '00:00:00';

    if (datePart.length > 10 && !parts[1] && datePart.includes('T')) {
       const split = datePart.split('T');
       datePart = split[0];
       timePart = split[1]?.substring(0,8) || '00:00:00';
    }

    let d = datePart;
    if (datePart.includes('/')) {
      const dParts = datePart.split('/');
      if (dParts.length === 3) {
        let y = dParts[2];
        if (y.length === 2) y = '20' + y;
        // FORCE ISO FORMAT YYYY-MM-DD to avoid US/UK confusion
        d = `${y}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}`;
      }
    } else if (datePart.includes('-')) {
      const dParts = datePart.split('-');
      if (dParts.length === 3) {
        // Assume already YYYY-MM-DD or DD-MM-YYYY
        if (dParts[0].length === 4) {
           d = datePart;
        } else {
           let y = dParts[2];
           if (y.length === 2) y = '20' + y;
           d = `${y}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}`;
        }
      }
    }

    // Support for 8H50 or 8h50 formats
    timePart = timePart.replace(/[Hh]/g, ':');

    const tParts = timePart.split(':');
    if (tParts.length < 2) {
        timePart = "00:00:00";
    } else {
        timePart = `${tParts[0].padStart(2, '0')}:${tParts[1].padStart(2, '0')}:${(tParts[2] || '00').substring(0,2).padStart(2, '0')}`;
    }

    return `${d} ${timePart}`;
  };

  const getMonthKey = (dateStr: string) => {
    // Format YYYY-MM
    // Robust check for date format
    if (dateStr.length >= 7 && dateStr.includes('-')) {
       return dateStr.substring(0, 7);
    }
    return '';
  };

  useEffect(() => {
    const loadHRData = async () => {
      setIsLoading(true);
      const [s, r, a, indexData] = await Promise.all([
        getCloudData('hr_settings'),
        getCloudData('hr_raw_records'),
        getCloudData('hr_absences'),
        getCloudData('hr_analysis_index')
      ]);
      const settingsWithDefaults: HRSettings = {
        entryTime: '08:30',
        exitTime: '17:30',
        toleranceMinutes: 0, 
        penaltyThresholdMinutes: 30,
        workDays: [1, 2, 3, 4, 5, 6],
        allowSinglePointage: true,
        employeeDepartments: {},
        ...(s || {})
      };
      setSettings(settingsWithDefaults);
      if (r) setRawRecords(r);
      if (a) setAbsences(a);
      
      // Chargement intelligent des résultats d'analyse fractionnés
      if (indexData && indexData.months && Array.isArray(indexData.months)) {
          setAvailableAnalysisMonths(indexData.months);
          // Charger le mois courant du filtre par défaut
          const currentMonthKey = filterMonth;
          if (indexData.months.includes(currentMonthKey)) {
              const monthData = await getCloudData(`hr_analysis_${currentMonthKey}`);
              if (monthData) {
                  setAnalysisCache(prev => ({ ...prev, [currentMonthKey]: monthData }));
                  setAnalysis(monthData);
              }
          } else {
              // Si le mois courant n'existe pas, charger le dernier disponible
              const lastMonth = indexData.months[indexData.months.length - 1];
              if (lastMonth) {
                  setFilterMonth(lastMonth);
                  const monthData = await getCloudData(`hr_analysis_${lastMonth}`);
                  if (monthData) {
                      setAnalysisCache(prev => ({ ...prev, [lastMonth]: monthData }));
                      setAnalysis(monthData);
                  }
              }
          }
      } else {
          // Fallback legacy (si pas d'index, essayer l'ancien fichier unique)
          const legacyData = await getCloudData('hr_analysis_results');
          if (legacyData && Array.isArray(legacyData)) {
              setAnalysis(legacyData);
          }
      }
      
      setIsLoading(false);
    };
    loadHRData();
  }, []);

  // Effect pour charger les données du mois quand le filtre change
  useEffect(() => {
      const loadMonth = async () => {
          if (!filterMonth) return;
          
          // Si déjà en cache, utiliser le cache
          if (analysisCache[filterMonth]) {
              setAnalysis(analysisCache[filterMonth]);
              return;
          }

          // Si disponible dans l'index, charger depuis le cloud
          if (availableAnalysisMonths.includes(filterMonth)) {
              setIsLoading(true);
              const data = await getCloudData(`hr_analysis_${filterMonth}`);
              if (data) {
                  setAnalysisCache(prev => ({ ...prev, [filterMonth]: data }));
                  setAnalysis(data);
              } else {
                  setAnalysis([]);
              }
              setIsLoading(false);
          } else {
              // Mois non disponible ou pas encore analysé
              setAnalysis([]);
          }
      };
      loadMonth();
  }, [filterMonth, availableAnalysisMonths]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aiChat]);

  const [settings, setSettings] = useState<HRSettings>({
    entryTime: '08:30',
    exitTime: '17:30',
    toleranceMinutes: 0, 
    penaltyThresholdMinutes: 30,
    workDays: [1, 2, 3, 4, 5, 6],
    allowSinglePointage: true,
    employeeDepartments: {}
  });

  const employeeList = useMemo(() => {
    const idsMap = new Map<string, string>();
    rawRecords.forEach(r => idsMap.set(r.employeeId, r.name));
    absences.forEach(a => {
        if (!idsMap.has(a.employeeId)) idsMap.set(a.employeeId, `Collaborateur ${a.employeeId}`);
    });
    return Array.from(idsMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rawRecords, absences]);

  const handleClearRawRecords = async () => {
    if (!hasPerm('delete')) {
      return setOpFeedback({ 
        title: 'Accès Refusé', 
        message: "Vous n'avez pas le droit de supprimer la base de pointages.", 
        type: 'warning' 
      });
    }

    if (confirm("⚠️ Êtes-vous sûr de vouloir vider TOUTE la base de pointages ? Cette action est irréversible et effacera l'historique non traité.")) {
      setRawRecords([]);
      await saveCloudData('hr_raw_records', []);
      setOpFeedback({ 
        title: 'Base réinitialisée', 
        message: "Tous les pointages ont été effacés. Vous pouvez maintenant importer un nouveau fichier complet.", 
        type: 'success' 
      });
    }
  };

  const handleImportCSV = (type: 'badgeuse' | 'absences', event: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasPerm('create')) return setOpFeedback({ title: 'Accès Refusé', message: "Vous n'avez pas le droit d'ajouter des données RH.", type: 'warning' });
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const text = (e.target as FileReader).result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length <= 1) return;
        const separator = lines[0].includes(';') ? ';' : ',';

        if (type === 'badgeuse') {
          const parsedRecords: RawAttendanceRecord[] = lines.slice(1).map(line => {
            const parts = line.split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
            const rawTs = (parts[2] || '').trim();
            const normalizedTs = normalizeDateTime(rawTs);
            return { 
              employeeId: (parts[1] || '').trim(), 
              name: (parts[0] || '').trim(), 
              timestamp: normalizedTs
            };
          }).filter(r => r.employeeId && r.timestamp);
          
          // Vérification des doublons pour éviter d'ajouter les mêmes lignes si on réimporte le même fichier
          const existingKeys = new Set(rawRecords.map(r => `${r.employeeId.trim()}_${r.timestamp.trim()}`));
          const newRecords = parsedRecords.filter(r => !existingKeys.has(`${r.employeeId.trim()}_${r.timestamp.trim()}`));
          
          if (newRecords.length === 0) {
            setOpFeedback({ 
              title: 'Aucune donnée neuve', 
              message: `Le fichier contient ${parsedRecords.length} pointages, mais ils sont tous déjà enregistrés dans l'application.`, 
              type: 'info' as any 
            });
            return;
          }

          if (newRecords.length > 0) {
             const firstDate = newRecords[0].timestamp.split(' ')[0]; // YYYY-MM-DD
             const [year, month] = firstDate.split('-');
             const newFilter = `${year}-${month}`;
             if (newFilter !== filterMonth) {
                 setFilterMonth(newFilter);
             }
          }

          // FUSION : Ajout des nouveaux enregistrements aux enregistrements existants (rawRecords)
          const updated = [...rawRecords, ...newRecords];
          setRawRecords(updated);
          saveCloudData('hr_raw_records', updated);
          
          setOpFeedback({ 
            title: 'Fusion effectuée', 
            message: `${newRecords.length} pointages ajoutés avec succès aux ${rawRecords.length} déjà existants (Base totale : ${updated.length}).`, 
            type: 'success' 
          });
        } else {
          const parsedAbs: AuthorizedAbsence[] = lines.slice(1).map(line => {
            const parts = line.split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
            const rawDate = (parts[1] || '').trim();
            const normalizedDate = normalizeDateTime(rawDate).split(' ')[0];
            return { 
              employeeId: (parts[0] || '').trim(), 
              date: normalizedDate, 
              type: (parts[2] || '').trim() as any, 
              comment: (parts[3] || '').trim() 
            };
          }).filter(r => r.employeeId && r.date);
          
          const existingAbsKeys = new Set(absences.map(a => `${a.employeeId.trim()}_${a.date.trim()}`));
          const trulyNewAbs = parsedAbs.filter(a => !existingAbsKeys.has(`${a.employeeId.trim()}_${a.date.trim()}`));

          if (trulyNewAbs.length === 0) {
             setOpFeedback({ title: 'Absences', message: "Aucune nouvelle absence détectée dans ce fichier.", type: 'info' as any });
             return;
          }

          const updated = [...absences, ...trulyNewAbs];
          setAbsences(updated);
          saveCloudData('hr_absences', updated);
          setOpFeedback({ title: 'Régularisation', message: `${trulyNewAbs.length} absences ajoutées au registre.`, type: 'success' });
        }
      } catch (err) {
        setOpFeedback({ title: 'Erreur de lecture', message: "Le format du fichier est invalide ou corrompu.", type: 'warning' });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleAddAbsence = async () => {
    if (!hasPerm('create')) return setOpFeedback({ title: 'Accès Refusé', message: "Action non autorisée.", type: 'warning' });
    if (!absenceForm.employeeId || !absenceForm.dateStart || !absenceForm.dateEnd || !absenceForm.type) {
      return alert("Veuillez remplir tous les champs obligatoires.");
    }
    const start = new Date(absenceForm.dateStart);
    const end = new Date(absenceForm.dateEnd);
    if (end < start) return alert("La date de fin ne peut pas être antérieure à la date de début.");

    const newEntries: AuthorizedAbsence[] = [];
    const tempDate = new Date(start);
    while (tempDate <= end) {
      const d = String(tempDate.getDate()).padStart(2, '0');
      const m = String(tempDate.getMonth() + 1).padStart(2, '0');
      const y = tempDate.getFullYear();
      
      // ISO Format for storage YYYY-MM-DD
      const formattedDate = `${y}-${m}-${d}`;
      const exists = absences.some(a => a.employeeId === absenceForm.employeeId && a.date === formattedDate);
      
      if (!exists) {
        const newAbs: AuthorizedAbsence = {
          employeeId: absenceForm.employeeId,
          date: formattedDate,
          type: absenceForm.type,
          comment: absenceForm.comment || ''
        };
        if (isPartialAbsence) {
          newAbs.startTime = absenceForm.startTime;
          newAbs.endTime = absenceForm.endTime;
        }
        newEntries.push(newAbs);
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }

    if (newEntries.length === 0) {
      alert("Ces dates sont déjà enregistrées pour ce collaborateur.");
      return;
    }

    const updated = [...newEntries, ...absences];
    setAbsences(updated);
    await saveCloudData('hr_absences', updated);
    setOpFeedback({ 
      title: 'Période Enregistrée', 
      message: `${newEntries.length} jour(s) validé(s).`, 
      type: 'success' 
    });
    setAbsenceForm({ ...absenceForm, employeeId: '', comment: '', dateStart: new Date().toISOString().split('T')[0], dateEnd: new Date().toISOString().split('T')[0] });
    setIsPartialAbsence(false);
  };

  const handleDeleteAbsence = async (index: number) => {
    if (!hasPerm('delete')) return setOpFeedback({ title: 'Accès Refusé', message: "Vous n'avez pas le droit de supprimer des données.", type: 'warning' });
    const updated = absences.filter((_, i) => i !== index);
    setAbsences(updated);
    await saveCloudData('hr_absences', updated);
  };

  const runAnalysis = () => {
    if (!hasPerm('update')) return setOpFeedback({ title: 'Accès Refusé', message: "Droit de modification requis pour lancer l'analyse.", type: 'warning' });
    if (rawRecords.length === 0 && absences.length === 0) return;
    setIsProcessing(true);

    setTimeout(async () => {
      try {
        const results: AttendanceAnalysis[] = [];
        const groupedLogs: Record<string, Record<string, string[]>> = {};

        rawRecords.forEach((rec: RawAttendanceRecord) => {
          if (!rec.timestamp) return;
          const parts = rec.timestamp.split(' ');
          const dateKey = parts[0];
          const timePart = parts[1];
          if (!dateKey) return;
          if (!groupedLogs[rec.employeeId]) groupedLogs[rec.employeeId] = {};
          if (!groupedLogs[rec.employeeId][dateKey]) groupedLogs[rec.employeeId][dateKey] = [];
          if (timePart) groupedLogs[rec.employeeId][dateKey].push(timePart);
        });

        const allDates = Array.from(new Set([
          ...rawRecords.map(r => r.timestamp ? r.timestamp.split(' ')[0] : ''),
          ...absences.map(a => a.date)
        ])).filter(d => d && d.trim() !== '');

        const allEmpIds = Array.from(new Set([
          ...Object.keys(groupedLogs),
          ...absences.map(a => a.employeeId)
        ]));

        allEmpIds.forEach((empId: string) => {
          const empName = rawRecords.find(r => r.employeeId === empId)?.name || 
                          employeeList.find(e => e.id === empId)?.name || 
                          'Collaborateur ' + empId;
          
          const empDept = (settings.employeeDepartments || {})[empId] || 'Sales';
          const isBackOffice = empDept === 'Back office';
          const isGhizlane = empName.toUpperCase().includes('GHIZLANE');

          allDates.forEach((date: string) => {
            const logs = (groupedLogs[empId]?.[date] || []).sort();
            const dailyAuths = absences.filter(a => a.employeeId === empId && a.date === date);
            const fullDayAbsence = dailyAuths.find(a => !a.startTime && !a.endTime);

            // Force YYYY-MM-DD for consistency
            let dateIso = date;
            
            const dateObj = new Date(dateIso);
            if (isNaN(dateObj.getTime())) return;

            const dayOfWeek = dateObj.getDay();
            const isWorkDay = (settings.workDays || []).includes(dayOfWeek);

            let theoEntryStr = settings.entryTime || '08:30';
            let targetExitStr = "17:30";
            let pauseMinutes = 0;

            if (isGhizlane) {
              theoEntryStr = "08:00";
              targetExitStr = "15:00";
              pauseMinutes = 30;
            } else if (isBackOffice) {
              if (dayOfWeek === 6) {
                theoEntryStr = "09:00";
                targetExitStr = "13:00";
                pauseMinutes = 10;
              } else {
                theoEntryStr = settings.entryTime || '08:30'; 
                targetExitStr = "18:00";
                pauseMinutes = 80;
              }
            }

            let item: AttendanceAnalysis = {
              employeeId: empId,
              name: empName,
              date: date,
              status: isWorkDay ? 'absent_unauthorized' : 'weekend',
              firstLog: null,
              lastLog: null,
              latenessMinutes: 0,
              isLate: false,
              workDurationMinutes: 0,
              comments: []
            };

            if (logs.length > 0) {
              item.firstLog = logs[0];
              item.lastLog = logs.length > 1 ? logs[logs.length - 1] : null;
              
              if (logs.length >= 2) {
                item.status = 'present';
              } else if (settings.allowSinglePointage && !isBackOffice && !isGhizlane) {
                item.status = 'meeting_presence';
                item.comments.push("Réunion matinale validée");
              } else {
                item.status = 'incomplete'; 
              }
              
              const [hLog, mLog] = logs[0].split(':').map(Number);
              const entryTotalMinutes = (hLog || 0) * 60 + (mLog || 0);
              const [hTheo, mTheo] = theoEntryStr.split(':').map(Number);
              const theoEntryMinutes = (hTheo || 0) * 60 + (mTheo || 0);

              const morningAuth = dailyAuths.find(a => {
                 if (!a.startTime || !a.endTime) return false;
                 const [hS] = a.startTime.split(':').map(Number);
                 const [hE] = a.endTime.split(':').map(Number);
                 return (hS * 60 <= theoEntryMinutes) && (hE * 60 > theoEntryMinutes);
              });

              let entryLat = 0;
              if (morningAuth && morningAuth.endTime) {
                 const [hAuthE, mAuthE] = morningAuth.endTime.split(':').map(Number);
                 const authEntryMinutes = (hAuthE || 0) * 60 + (mAuthE || 0);
                 entryLat = Math.max(0, entryTotalMinutes - authEntryMinutes);
                 if (entryTotalMinutes > theoEntryMinutes) item.comments.push(`Retard autorisé jusqu'à ${morningAuth.endTime}`);
              } else {
                 entryLat = Math.max(0, entryTotalMinutes - theoEntryMinutes);
              }

              let exitLat = 0;
              if ((isBackOffice || isGhizlane) && item.lastLog) {
                const [hOut, mOut] = item.lastLog.split(':').map(Number);
                const exitTotalMinutes = (hOut || 0) * 60 + (mOut || 0);
                const [hTarget, mTarget] = targetExitStr.split(':').map(Number);
                const targetExitMinutes = (hTarget || 0) * 60 + (mTarget || 0);

                const afternoonAuth = dailyAuths.find(a => {
                  if (!a.startTime || !a.endTime) return false;
                  const [hE] = a.endTime.split(':').map(Number);
                  return (hE * 60 >= targetExitMinutes);
                });

                if (afternoonAuth && afternoonAuth.startTime) {
                   const [hAuthS, mAuthS] = afternoonAuth.startTime.split(':').map(Number);
                   const authExitMinutes = (hAuthS || 0) * 60 + (mAuthS || 0);
                   exitLat = Math.max(0, authExitMinutes - exitTotalMinutes);
                   if (exitTotalMinutes < targetExitMinutes) item.comments.push(`Sortie autorisée à partir de ${afternoonAuth.startTime}`);
                } else {
                   exitLat = Math.max(0, targetExitMinutes - exitTotalMinutes);
                }
              }

              const totalDailyLat = entryLat + exitLat;
              if (totalDailyLat > 0) {
                item.isLate = true;
                item.latenessMinutes = totalDailyLat;
                if (totalDailyLat >= settings.penaltyThresholdMinutes) {
                  let note = `Retard cumulé (+${totalDailyLat}m)`;
                  if (entryLat > 0 && exitLat > 0) note = `Entrée tardive (${entryLat}m) + Sortie anticipée (${exitLat}m)`;
                  else if (exitLat > 0) note = `Sortie anticipée (-${exitLat}m)`;
                  item.comments.push(note);
                }
              }
              
              if (item.lastLog && item.firstLog) {
                const [hOut, mOut] = item.lastLog.split(':').map(Number);
                const [hIn, mIn] = item.firstLog.split(':').map(Number);
                
                // Normalisation : Si pointage AVANT l'heure théorique, on prend l'heure théorique pour le calcul de durée
                // pour éviter de comptabiliser du temps de présence non travaillé (café, discussion...)
                const actualInMinutes = (hIn || 0) * 60 + (mIn || 0);
                const effectiveInMinutes = Math.max(actualInMinutes, theoEntryMinutes);
                
                let duration = ((hOut || 0) * 60 + (mOut || 0)) - effectiveInMinutes;
                duration = Math.max(0, duration - pauseMinutes);
                item.workDurationMinutes = duration;
              }

              if (dailyAuths.some(a => a.startTime && a.endTime) && logs.length >= 2) {
                 item.status = 'present';
              }
            } 
            
            if (fullDayAbsence) {
              item.status = 'absent_authorized';
              item.comments = [fullDayAbsence.type, ...(fullDayAbsence.comment ? [fullDayAbsence.comment] : [])];
            } else if (logs.length === 0 && isWorkDay) {
              item.status = 'absent_unauthorized';
              item.comments.push("Aucun pointage détecté");
            }

            if (item.status !== 'weekend') results.push(item);
          });
        });

        // SHARDING: Group results by month (YYYY-MM)
        const byMonth: Record<string, AttendanceAnalysis[]> = {};
        results.forEach(res => {
            const mKey = getMonthKey(res.date);
            if (mKey) {
                if (!byMonth[mKey]) byMonth[mKey] = [];
                byMonth[mKey].push(res);
            }
        });

        // Save each month chunk
        const months = Object.keys(byMonth).sort();
        const promises = months.map(m => saveCloudData(`hr_analysis_${m}`, byMonth[m]));
        
        // Save Index
        promises.push(saveCloudData('hr_analysis_index', { months }));
        
        await Promise.all(promises);

        // Update local state with the current filter month
        const currentMonthKey = filterMonth;
        if (byMonth[currentMonthKey]) {
            setAnalysis(byMonth[currentMonthKey]);
        } else {
            setAnalysis([]);
        }
        
        // Update cache and available months
        setAvailableAnalysisMonths(months);
        setAnalysisCache(prev => ({ ...prev, ...byMonth }));

        setOpFeedback({ title: 'Analyse Terminée', message: "Les calculs ont été sauvegardés (format optimisé par mois).", type: 'success' });
        setActiveTab('analysis');
      } catch (err: any) {
        console.error("Erreur critique analyse RH:", err);
        setOpFeedback({ title: 'Erreur Analyse', message: "Une erreur est survenue lors du calcul. Vérifiez les données brutes.", type: 'warning' });
      } finally {
        setIsProcessing(false);
      }
    }, 800);
  };

  const filteredAnalysis = useMemo(() => {
    return analysis.filter(a => {
      const matchSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) || a.employeeId.includes(searchTerm);
      const matchStatus = filterStatus === 'all' || a.status === filterStatus;
      const matchEmployee = filterEmployeeId === 'all' || a.employeeId === filterEmployeeId;
      const empDept = (settings.employeeDepartments || {})[a.employeeId] || 'Sales';
      const matchDept = filterDepartment === 'all' || empDept === filterDepartment;
      
      let matchMonth = true;
      let matchInterval = true;

      // Robust date extraction
      let recordDate: Date | null = null;
      if (a.date) recordDate = new Date(a.date);

      if (recordDate && !isNaN(recordDate.getTime())) {
          if (filterMonth) {
             const [y, m] = filterMonth.split('-');
             if (recordDate.getFullYear() !== parseInt(y) || (recordDate.getMonth() + 1) !== parseInt(m)) {
                 matchMonth = false;
             }
          }
          if (filterDateStart) {
             if (recordDate < new Date(filterDateStart)) matchInterval = false;
          }
          if (filterDateEnd) {
             if (recordDate > new Date(filterDateEnd)) matchInterval = false;
          }
      }

      return matchSearch && matchStatus && matchEmployee && matchDept && matchMonth && matchInterval;
    });
  }, [analysis, searchTerm, filterStatus, filterEmployeeId, filterDepartment, filterMonth, filterDateStart, filterDateEnd, settings.employeeDepartments]);

  const recapMonthly = useMemo(() => {
    const map: Record<string, any> = {};
    filteredAnalysis.forEach(a => {
      if (!map[a.employeeId]) {
        map[a.employeeId] = { id: a.employeeId, name: a.name, worked: 0, lateCumulMin: 0, absUnauth: 0, absAuth: 0, incomplete: 0, meetings: 0, absencePenalty: 0, latenessDetails: [] };
      }
      const entry = map[a.employeeId];
      if (a.status === 'present' || a.status === 'meeting_presence') entry.worked++;
      if (a.status === 'meeting_presence') entry.meetings++;
      
      if (a.isLate) {
          entry.lateCumulMin += a.latenessMinutes;
          // Stocker le détail pour l'infobulle
          const dateStr = new Date(a.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
          entry.latenessDetails.push(`${dateStr} : +${a.latenessMinutes} min`);
      }
      
      if (a.status === 'absent_unauthorized') { entry.absUnauth++; entry.absencePenalty += 150; }
      if (a.status === 'absent_authorized') entry.absAuth++;
      if (a.status === 'incomplete') { entry.incomplete++; entry.absencePenalty += 100; }
    });
    return Object.values(map).map(emp => {
      const isLateFranchised = emp.lateCumulMin <= 130;
      const lateHours = Number((emp.lateCumulMin / 60).toFixed(2));
      const latenessDeduction = isLateFranchised ? 0 : Number((lateHours * 30).toFixed(2));
      const deduction = latenessDeduction + emp.absencePenalty;
      const isGlobalementEnRegle = emp.absUnauth === 0 && emp.incomplete === 0 && isLateFranchised;
      return { ...emp, lateHours, deduction, isEnRegle: isGlobalementEnRegle, latenessDeduction };
    }).sort((a,b) => b.lateCumulMin - a.lateCumulMin);
  }, [filteredAnalysis]);

  const stats = useMemo(() => {
    if (analysis.length === 0) return null;
    const current = filteredAnalysis;
    const total = current.length;
    const present = current.filter(a => a.status === 'present' || a.status === 'meeting_presence').length;
    const late = current.filter(a => a.isLate).length;
    const absentUnauth = current.filter(a => a.status === 'absent_unauthorized').length;
    const incomplete = current.filter(a => a.status === 'incomplete').length;
    const presenceRate = total > 0 ? (present / total) * 100 : 0;
    const globalLateMinutes = recapMonthly.reduce((a,c) => a + c.lateCumulMin, 0);
    const globalDeductions = recapMonthly.reduce((a,c) => a + c.deduction, 0);
    const byDayData = Array.from(new Set(current.map(a => a.date))).slice(0, 10).reverse().map(d => ({
      date: d,
      presents: current.filter(a => a.date === d && (a.status === 'present' || a.status === 'meeting_presence')).length,
      retards: current.filter(a => a.date === d && a.isLate).length,
    }));
    return { total, present, late, absentUnauth, incomplete, presenceRate, byDayData, globalLateMinutes, globalDeductions };
  }, [filteredAnalysis, recapMonthly]);

  const askGemini = async (customPrompt?: string) => {
    const prompt = customPrompt || aiInput;
    if (!prompt.trim()) return;

    setIsAiThinking(true);
    if (!customPrompt) {
      setAiChat(prev => [...prev, { role: 'user', content: prompt }]);
      setAiInput('');
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const hrContext = {
        stats: stats,
        recap: recapMonthly.slice(0, 15),
        settings: settings,
        month: filterMonth,
        absencesCount: absences.length,
        litigesCount: recapMonthly.filter(r => !r.isEnRegle).length
      };

      const systemInstruction = `Tu es l'assistant RH intelligent de DIVERSIFIA, distributeur Orange Maroc. 
      Ton rôle est d'analyser les données de pointage, d'identifier les problèmes d'assiduité et de conseiller la direction.
      Données du mois : ${JSON.stringify(hrContext)}. 
      Réponds de manière professionnelle, analytique et humaine. Utilise des emojis RH 👔.
      Identifie les employés modèles et ceux qui ont besoin d'un suivi (retards cumulés, absences injustifiées).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { systemInstruction }
      });

      const text = response.text || "Désolé, je ne parviens pas à analyser les données RH pour le moment.";
      setAiChat(prev => [...prev, { role: 'assistant', content: text }]);
    } catch (e) {
      console.error("AI Error:", e);
      setAiChat(prev => [...prev, { role: 'assistant', content: "⚠️ Erreur de connexion avec l'IA. Vérifiez la configuration Cloud." }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const generateLatenessEmail = (emp: any) => {
    const monthName = new Date(filterMonth + "-01").toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const subject = `Notification d'assiduité - Retards cumulés - ${monthName}`;
    const body = `Bonjour ${emp.name},\n\nNous avons effectué une revue de vos pointages pour le mois de ${monthName}.\n\nÀ ce jour, votre cumul de retards s'élève à ${emp.lateCumulMin} minutes.\n\nNous vous rappelons que l'entreprise accorde une franchise mensuelle de 130 minutes pour parer aux imprévus. Cependant, votre cumul actuel dépasse ce seuil de tolérance.\n\nCordialement,\n\nLe Service RH DIVERSIFIA`;
    return { subject, body };
  };

  const sendNotificationMail = (emp: any) => {
    const { subject, body } = generateLatenessEmail(emp);
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    setSelectedMailEmployee(null);
  };

  const FilterBar = () => (
    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-wrap items-center gap-4 mb-8 print:hidden">
      <div className="flex-1 min-w-[200px]">
        <label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Recherche</label>
        <div className="relative mt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input type="text" placeholder="Nom ou Matricule..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border-none font-bold text-xs focus:ring-2 focus:ring-indigo-500/20 shadow-inner" />
        </div>
      </div>
      <div className="w-40">
        <label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Mois global</label>
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-full mt-1 p-3 rounded-xl bg-slate-50 border-none font-bold text-xs shadow-inner" />
      </div>
      <div className="w-40">
        <label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Département</label>
        <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)} className="w-full mt-1 p-3 rounded-xl bg-slate-50 border-none font-bold text-xs appearance-none shadow-inner">
          <option value="all">Tous les dép.</option><option value="Sales">Sales</option><option value="Back office">Back office</option>
        </select>
      </div>
      <div className="flex items-end gap-2">
        <div><label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Du</label><input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} className="w-full mt-1 p-3 rounded-xl bg-slate-50 border-none font-bold text-xs shadow-inner" /></div>
        <div><label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Au</label><input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} className="w-full mt-1 p-3 rounded-xl bg-slate-50 border-none font-bold text-xs shadow-inner" /></div>
      </div>
      <div className="w-48">
        <label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Collaborateur</label>
        <select value={filterEmployeeId} onChange={e => setFilterEmployeeId(e.target.value)} className="w-full mt-1 p-3 rounded-xl bg-slate-50 border-none font-bold text-xs appearance-none shadow-inner">
          <option value="all">Tous les agents</option>{employeeList.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
      </div>
      <div className="flex items-end"><button onClick={resetFilters} className="p-3 bg-slate-100 text-slate-400 hover:text-rose-500 rounded-xl transition-all border border-slate-200" title="Réinitialiser"><FilterX className="w-5 h-5" /></button></div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {opFeedback && <FeedbackPopup title={opFeedback.title} message={opFeedback.message} type={opFeedback.type} onClose={() => setOpFeedback(null)} />}

      {selectedMailEmployee && (
        <div className="fixed inset-0 z-[400] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="p-8 border-b bg-slate-50 flex items-center justify-between"><div className="flex items-center space-x-3"><div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg"><Mail className="w-5 h-5" /></div><h3 className="text-xl font-black uppercase italic tracking-tighter">Prévisualisation de l'Avertissement</h3></div><button onClick={() => setSelectedMailEmployee(null)} className="p-2 text-slate-300 hover:text-slate-600"><X className="w-6 h-6" /></button></div>
             <div className="p-8">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                   <div><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Sujet :</p><p className="font-bold text-slate-700">{generateLatenessEmail(selectedMailEmployee).subject}</p></div>
                   <div className="h-px bg-slate-200"></div>
                   <div><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Contenu :</p><p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed italic">{generateLatenessEmail(selectedMailEmployee).body}</p></div>
                </div>
             </div>
             <div className="p-8 bg-slate-50 border-t flex space-x-4"><button onClick={() => setSelectedMailEmployee(null)} className="flex-1 py-4 bg-white border border-slate-200 rounded-2xl text-slate-500 font-black uppercase text-xs">Annuler</button><button onClick={() => sendNotificationMail(selectedMailEmployee)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs flex items-center justify-center shadow-xl shadow-indigo-100"><Send className="w-4 h-4 mr-2" /> Envoyer la notification</button></div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div><h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">Assiduité & Temps</h2><div className="flex items-center space-x-2 mt-1"><p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Intelligence RH Diversifia</p>{!isAdmin && (<div className="flex items-center px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 text-[8px] font-black uppercase"><ShieldAlert className="w-2.5 h-2.5 mr-1" />{hasPerm('create') || hasPerm('update') ? 'Accès Édition' : 'Lecture Seule'}</div>)}</div></div>
        <div className="flex bg-white p-1.5 rounded-[1.8rem] shadow-sm border border-slate-200 overflow-x-auto max-w-full">
          {[{ id: 'dashboard', label: 'KPIs', icon: BarChart3 }, { id: 'imports', label: 'Pointages', icon: FileUp }, { id: 'absences', label: 'Régul/Autoris', icon: CalendarX }, { id: 'analysis', label: 'Détails', icon: Activity }, { id: 'recap', label: 'Exports Paie', icon: LayoutList }, { id: 'ai', label: 'IA Assistant', icon: Sparkles }, { id: 'config', label: 'Règles', icon: Settings }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as HRTab)} className={`flex items-center px-5 py-2.5 rounded-[1.4rem] text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}><tab.icon className="w-3.5 h-3.5 mr-2" /> {tab.label}</button>
          ))}
        </div>
      </div>

      {isLoading ? (<div className="py-32 flex flex-col items-center justify-center"><Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" /><p className="text-[10px] font-black uppercase text-slate-400">Synchronisation Cloud...</p></div>) : (
        <div className="animate-in fade-in duration-500">
          
          {activeTab === 'dashboard' && stats && (
            <div className="space-y-8">
              <FilterBar />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[ { label: 'Taux Présence', value: `${stats.presenceRate.toFixed(1)}%`, icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-50' }, { label: 'Cumul Retards', value: `${(stats.globalLateMinutes / 60).toFixed(1)}h`, icon: Clock, color: 'text-rose-500', bg: 'bg-rose-50' }, { label: 'Total Litiges', value: `${recapMonthly.filter(r => !r.isEnRegle).length}`, icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' }, { label: 'Impact Financier', value: `${stats.globalDeductions} DH`, icon: Banknote, color: 'text-slate-900', bg: 'bg-slate-100' } ].map((kpi, i) => (
                  <div key={i} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 flex items-center space-x-4 shadow-sm group hover:scale-[1.02] transition-transform"><div className={`${kpi.bg} p-4 rounded-2xl`}><kpi.icon className={`w-6 h-6 ${kpi.color}`} /></div><div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{kpi.label}</p><p className="text-2xl font-black text-slate-900">{kpi.value}</p></div></div>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100"><h3 className="text-sm font-black uppercase italic tracking-tighter flex items-center"><Banknote className="w-4 h-4 mr-2 text-rose-500" /> Prélèvements par Vendeur (DH)</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={recapMonthly.filter(r => r.deduction > 0).sort((a,b) => b.deduction - a.deduction)} margin={{ bottom: 40 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="name" tick={{fontSize: 8, fontWeight: 'bold'}} angle={-45} textAnchor="end" interval={0} height={80} /><YAxis tick={{fontSize: 9}} /><Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} /><Bar dataKey="deduction" name="DH Prélevés" fill="#f43f5e" radius={[10, 10, 0, 0]} barSize={30}>{recapMonthly.filter(r => r.deduction > 0).map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.deduction > 500 ? '#e11d48' : '#fb7185'} />))}</Bar></BarChart></ResponsiveContainer></div></div>
                <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100"><h3 className="text-sm font-black uppercase italic tracking-tighter flex items-center"><ArrowDownWideNarrow className="w-4 h-4 mr-2 text-orange-500" /> Top Retardataires (Minutes)</h3><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={recapMonthly.slice(0, 7)}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" /><XAxis type="number" tick={{fontSize: 9}} /><YAxis dataKey="name" type="category" width={100} tick={{fontSize: 9, fontWeight: 'bold'}} /><Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} /><Bar dataKey="lateCumulMin" name="Minutes Retard" fill="#fbbf24" radius={[0, 10, 10, 0]} barSize={20} /></BarChart></ResponsiveContainer></div></div>
              </div>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center space-x-3"><div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Activity className="w-5 h-5" /></div><div><h3 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Journal d'Analyse</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Données calculées ({analysis.length} entrées)</p></div></div>
                <div className="flex items-center space-x-3 w-full md:w-auto">
                   <div className="relative flex-grow md:flex-grow-0"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" /><input type="text" placeholder="Filtrer..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-3 rounded-xl bg-white border border-slate-200 text-xs font-bold w-full focus:ring-2 focus:ring-indigo-500/20" /></div>
                   {hasPerm('update') && (
                     <button onClick={runAnalysis} disabled={isProcessing} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-slate-900 transition-all flex items-center whitespace-nowrap">
                       {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCcw className="w-4 h-4 mr-2" />} Lancer Analyse
                     </button>
                   )}
                </div>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-100 text-[9px] font-black uppercase text-slate-500 tracking-widest"><tr><th className="px-8 py-4">Date</th><th className="px-8 py-4">Collaborateur</th><th className="px-8 py-4 text-center">Entrée</th><th className="px-8 py-4 text-center">Sortie</th><th className="px-8 py-4 text-center">Statut</th><th className="px-8 py-4 text-right">Retard / Note</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredAnalysis.slice(0, 100).map((item, idx) => (<tr key={idx} className="hover:bg-slate-50 transition-colors"><td className="px-8 py-4 font-bold text-xs text-slate-500">{new Date(item.date).toLocaleDateString('fr-FR')}</td><td className="px-8 py-4"><p className="font-black text-slate-900 text-xs">{item.name}</p><p className="text-[9px] text-slate-400 font-mono">{item.employeeId}</p></td><td className="px-8 py-4 text-center font-mono text-xs font-bold text-indigo-600 bg-indigo-50/50 rounded-lg">{item.firstLog || '-'}</td><td className="px-8 py-4 text-center font-mono text-xs font-bold text-slate-600">{item.lastLog || '-'}</td><td className="px-8 py-4 text-center"><span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${item.status === 'present' ? 'bg-emerald-100 text-emerald-700' : item.status === 'absent_unauthorized' ? 'bg-rose-100 text-rose-700' : item.status === 'absent_authorized' ? 'bg-blue-100 text-blue-700' : item.status === 'weekend' ? 'bg-slate-100 text-slate-400' : 'bg-amber-100 text-amber-700'}`}>{item.status.replace('_', ' ')}</span></td><td className="px-8 py-4 text-right"><div className="flex flex-col items-end">{item.latenessMinutes > 0 && <span className="text-rose-500 font-black text-xs">+{item.latenessMinutes} min</span>}{item.comments.map((c, i) => <span key={i} className="text-[8px] text-slate-400 italic">{c}</span>)}</div></td></tr>))}</tbody></table>{filteredAnalysis.length === 0 && <div className="p-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">Aucune donnée analysée</div>}</div>
            </div>
          )}

          {activeTab === 'imports' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100"><div className="flex items-center space-x-3 mb-6"><FileUp className="w-6 h-6 text-indigo-600" /><h3 className="text-lg font-black uppercase italic tracking-tighter">Import Pointages</h3></div><label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all group"><div className="flex flex-col items-center justify-center pt-5 pb-6"><Download className="w-8 h-8 text-slate-300 group-hover:text-indigo-500 mb-2 transition-colors" /><p className="mb-2 text-sm text-slate-500 font-bold"><span className="font-black text-indigo-600">Cliquez</span> pour charger le CSV</p><p className="text-[9px] text-slate-400 uppercase tracking-widest">Format: Nom, ID, Date/Heure</p></div><input type="file" className="hidden" accept=".csv" onChange={(e) => handleImportCSV('badgeuse', e)} /></label></div>
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100"><div className="flex justify-between items-center mb-6"><h3 className="text-lg font-black uppercase italic tracking-tighter">Données Brutes</h3><button onClick={handleClearRawRecords} className="text-rose-500 hover:text-rose-700 text-[10px] font-black uppercase flex items-center"><Trash2 className="w-3 h-3 mr-1" /> Vider</button></div><div className="h-64 overflow-y-auto custom-scrollbar bg-slate-50 rounded-2xl p-4 border border-slate-100"><table className="w-full text-left"><thead className="text-[8px] font-black uppercase text-slate-400 sticky top-0 bg-slate-50"><tr><th className="pb-2">ID</th><th className="pb-2">Nom</th><th className="pb-2 text-right">Horodatage</th></tr></thead><tbody className="text-xs font-bold text-slate-600">{rawRecords.slice(0, 100).map((r, i) => (<tr key={i} className="border-b border-slate-100 last:border-0"><td className="py-2 font-mono text-slate-400">{r.employeeId}</td><td className="py-2">{r.name}</td><td className="py-2 text-right font-mono">{r.timestamp}</td></tr>))}</tbody></table>{rawRecords.length === 0 && <p className="text-center text-slate-300 text-xs py-10 font-bold uppercase">Vide</p>}</div></div>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 h-full"><div className="flex items-center space-x-3 mb-6"><Users className="w-6 h-6 text-emerald-500" /><h3 className="text-lg font-black uppercase italic tracking-tighter">Effectif Détecté</h3></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto custom-scrollbar">{employeeList.map(emp => (<div key={emp.id} className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100"><div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[10px] font-black text-slate-400 shadow-sm mr-3">{emp.name.charAt(0)}</div><div><p className="text-xs font-black text-slate-700">{emp.name}</p><p className="text-[9px] text-slate-400 font-mono">MAT: {emp.id}</p></div></div>))}</div></div>
            </div>
          )}

          {activeTab === 'absences' && (
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <div className="flex flex-col lg:flex-row gap-8">
                <div className="lg:w-1/3 space-y-6">
                   <div className="flex items-center space-x-3 mb-2"><CalendarX className="w-6 h-6 text-rose-500" /><h3 className="text-xl font-black uppercase italic tracking-tighter">Saisie Absence / Autorisation</h3></div>
                   <div className="space-y-4">
                      <div><label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Collaborateur</label><select value={absenceForm.employeeId} onChange={e => setAbsenceForm({...absenceForm, employeeId: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border-none font-bold text-sm shadow-inner appearance-none"><option value="">Sélectionner...</option>{employeeList.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
                      <div className="flex gap-2">
                        <div className="flex-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Du</label><input type="date" value={absenceForm.dateStart} onChange={e => setAbsenceForm({...absenceForm, dateStart: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border-none font-bold text-sm shadow-inner" /></div>
                        <div className="flex-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Au</label><input type="date" value={absenceForm.dateEnd} onChange={e => setAbsenceForm({...absenceForm, dateEnd: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border-none font-bold text-sm shadow-inner" /></div>
                      </div>
                      <div><label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Type</label><select value={absenceForm.type} onChange={e => setAbsenceForm({...absenceForm, type: e.target.value as any})} className="w-full p-3 rounded-xl bg-slate-50 border-none font-bold text-sm shadow-inner appearance-none"><option value="Autorisation">Autorisation (Retard/Sortie)</option><option value="Congé">Congé Payé</option><option value="Maladie">Maladie</option><option value="Mission">Mission</option><option value="Férié">Férié</option><option value="Exceptionnel">Exceptionnel</option></select></div>
                      <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                         <button onClick={() => setIsPartialAbsence(!isPartialAbsence)} className={`relative w-10 h-5 transition-colors rounded-full ${isPartialAbsence ? 'bg-indigo-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isPartialAbsence ? 'left-5.5' : 'left-0.5'}`} /></button>
                         <span className="text-[10px] font-black uppercase text-slate-500">Heures spécifiques (Autorisation)</span>
                      </div>
                      {isPartialAbsence && (
                        <div className="flex gap-2 animate-in slide-in-from-top-2">
                           <div className="flex-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Début</label><input type="time" value={absenceForm.startTime} onChange={e => setAbsenceForm({...absenceForm, startTime: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border-none font-bold text-sm shadow-inner" /></div>
                           <div className="flex-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Fin</label><input type="time" value={absenceForm.endTime} onChange={e => setAbsenceForm({...absenceForm, endTime: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border-none font-bold text-sm shadow-inner" /></div>
                        </div>
                      )}
                      <div><label className="text-[9px] font-black uppercase text-slate-400 ml-2 tracking-widest">Commentaire</label><textarea value={absenceForm.comment} onChange={e => setAbsenceForm({...absenceForm, comment: e.target.value})} className="w-full p-3 rounded-xl bg-slate-50 border-none font-bold text-sm shadow-inner h-20 resize-none"></textarea></div>
                      <div className="flex gap-2">
                         <label className="flex-1 flex items-center justify-center p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-all text-[10px] font-black uppercase text-slate-500"><Download className="w-4 h-4 mr-2" /> Import CSV<input type="file" className="hidden" accept=".csv" onChange={(e) => handleImportCSV('absences', e)} /></label>
                         <button onClick={handleAddAbsence} className="flex-1 p-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-slate-900 transition-all flex items-center justify-center"><Plus className="w-4 h-4 mr-2" /> Ajouter</button>
                      </div>
                   </div>
                </div>
                <div className="lg:w-2/3 border-l border-slate-100 pl-0 lg:pl-8">
                   <h4 className="text-sm font-black text-slate-900 uppercase italic tracking-tighter mb-6">Registre des Absences ({absences.length})</h4>
                   <div className="overflow-y-auto max-h-[600px] custom-scrollbar pr-2 space-y-2">
                      {absences.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((abs, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-100 transition-all group">
                           <div className="flex items-center space-x-4">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm ${abs.type === 'Maladie' ? 'bg-rose-400' : abs.type === 'Congé' ? 'bg-emerald-400' : abs.type === 'Autorisation' ? 'bg-amber-400' : 'bg-slate-400'}`}>{abs.type.charAt(0)}</div>
                              <div>
                                 <p className="text-xs font-black text-slate-700">{employeeList.find(e => e.id === abs.employeeId)?.name || abs.employeeId}</p>
                                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide flex items-center">
                                    <Calendar className="w-3 h-3 mr-1" /> {new Date(abs.date).toLocaleDateString()} 
                                    {abs.startTime && <span className="ml-2 bg-white px-1.5 rounded border border-slate-200 text-slate-500">{abs.startTime} - {abs.endTime}</span>}
                                 </p>
                              </div>
                           </div>
                           <div className="flex items-center space-x-4">
                              <span className="text-[10px] font-bold text-slate-400 italic max-w-[150px] truncate">{abs.comment}</span>
                              {hasPerm('delete') && <button onClick={() => handleDeleteAbsence(i)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                           </div>
                        </div>
                      ))}
                      {absences.length === 0 && <div className="text-center py-20 text-slate-300 font-bold uppercase text-xs">Aucune absence enregistrée</div>}
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'recap' && (
            <div className="space-y-8">
               <FilterBar />
               <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 print:hidden"><div className="flex items-center space-x-4"><div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner"><LayoutList className="w-6 h-6" /></div><div><h3 className="text-lg font-black uppercase italic tracking-tighter">Récapitulatif de Paie</h3><p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{new Date(filterMonth + "-01").toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p></div></div><div className="flex items-center space-x-3"><button onClick={() => window.print()} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center shadow-xl hover:bg-indigo-600 transition-all"><Printer className="w-4 h-4 mr-2" /> Imprimer</button></div></div>
               <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest"><tr><th className="px-8 py-5">Collaborateur</th><th className="px-8 py-5 text-center">Présences</th><th className="px-8 py-5 text-center">Retard (min)</th><th className="px-8 py-5 text-center">Abs. Injustifiées</th><th className="px-8 py-5 text-center">1/2 Journées</th><th className="px-8 py-5 text-center bg-rose-50 text-rose-600">Prélèvement (DH)</th><th className="px-8 py-5 text-right">Actions / Statut</th></tr></thead><tbody className="divide-y divide-slate-100">{recapMonthly.map((emp, i) => (<tr key={i} className="hover:bg-slate-50 transition-colors"><td className="px-8 py-6"><p className="font-black text-slate-900 uppercase italic text-xs">{emp.name}</p><div className="flex items-center space-x-2"><p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">MAT: {emp.id}</p><span className={`text-[7px] font-black uppercase px-1.5 rounded ${ (settings.employeeDepartments || {})[emp.id] === 'Back office' ? 'bg-indigo-50 text-indigo-500 border border-indigo-100' : 'bg-orange-50 text-orange-500 border border-orange-100' }`}>{(settings.employeeDepartments || {})[emp.id] || 'Sales'}</span></div></td><td className="px-8 py-6 text-center font-black text-slate-900"><span className="px-2 py-1 bg-slate-100 rounded-lg">{emp.worked} j</span></td>
               
               <td className={`px-8 py-6 text-center font-bold cursor-help ${emp.lateCumulMin > 130 ? 'text-rose-500' : 'text-slate-400'}`} title={emp.latenessDetails.join('\n')}>
                  {emp.lateCumulMin} m
                  {emp.lateCumulMin > 0 && <span className="block text-[7px] text-slate-300 font-medium tracking-wide mt-1">(Survoler pour détail)</span>}
               </td>
               
               <td className={`px-8 py-6 text-center font-bold ${emp.absUnauth > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{emp.absUnauth} <span className="text-[7px] text-slate-400 ml-0.5">({emp.absUnauth * 150} Dh)</span></td><td className={`px-8 py-6 text-center font-bold ${emp.incomplete > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{emp.incomplete} <span className="text-[7px] text-slate-400 ml-0.5">({emp.incomplete * 100} Dh)</span></td><td className={`px-8 py-6 text-center font-black bg-rose-50/50 ${emp.deduction > 0 ? 'text-rose-600' : 'text-slate-300'}`}><div className="flex flex-col items-center justify-center">{emp.deduction > 0 ? (<div className="flex items-center gap-1"><Banknote className="w-3 h-3" />{emp.deduction} <span className="text-[8px] font-bold">DH</span></div>) : (<span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">0 DH</span>)}</div></td><td className="px-8 py-6 text-right"><div className="flex items-center justify-end space-x-3"><div className="flex flex-col items-end"><span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase ${!emp.isEnRegle ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{!emp.isEnRegle ? 'Litige' : 'En règle'}</span>{!emp.isEnRegle && emp.lateCumulMin > 130 && (<span className="text-[7px] font-bold text-rose-400 mt-1 uppercase italic">Retard &gt; 130m</span>)}</div>{hasPerm('update') && emp.lateCumulMin > 0 && (<button onClick={() => setSelectedMailEmployee(emp)} className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-indigo-600 transition-all shadow-md group" title="Notifier par mail"><Mail className="w-4 h-4 group-hover:scale-110 transition-transform" /></button>)}</div></td></tr>))}</tbody></table></div>
               <div className="bg-amber-50 border border-amber-100 p-6 rounded-[2.5rem] flex items-start space-x-4 print:hidden"><Info className="w-6 h-6 text-amber-500 flex-shrink-0 mt-1" /><div className="space-y-1"><h4 className="text-sm font-black text-amber-900 uppercase italic tracking-tight">Barème des Prélèvements & Règles Horaires Spécifiques</h4><div className="text-xs text-amber-700 leading-relaxed font-medium"><ul className="list-disc list-inside space-y-1"><li><strong>Absence injustifiée :</strong> -150 DH / jour.</li><li><strong>Demi-journée (1 seul pointage) :</strong> -100 DH / jour.</li><li><strong>Retards :</strong> Franchise mensuelle de 130 min (30 DH/h au-delà).</li><li className="text-indigo-700"><strong>Ghizlane FM (Ménage) :</strong> Horaires fixes 08:00 - 15:00. Pause de 30m déduite.</li><li className="text-indigo-700"><strong>Back Office Samedi :</strong> Horaires spécifiques 09:00 - 13:00. Pause de 10m uniquement.</li><li className="text-indigo-700"><strong>Back Office Semaine :</strong> Sortie à 18h00. Pause déjeuner de 1h20 déduite.</li></ul></div></div></div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-[600px]">
              <div className="lg:col-span-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 border-t-8 border-t-indigo-600">
                  <div className="flex items-center space-x-3 mb-6">
                    <BrainCircuit className="w-6 h-6 text-indigo-600" />
                    <h3 className="font-black uppercase italic tracking-tighter text-slate-900">Analyses RH</h3>
                  </div>
                  <div className="space-y-3">
                    <button onClick={() => askGemini("Fais-moi un rapport sur les 3 employés ayant le plus de retards ce mois-ci et propose des actions.")} className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-all group">
                      <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest group-hover:text-indigo-600 transition-colors">Top Retardataires</p>
                      <p className="text-[9px] text-slate-400 font-bold">Identifier les dérives.</p>
                    </button>
                    <button onClick={() => askGemini("Analyse l'impact financier total des absences et retards pour ce mois.")} className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-all group">
                      <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest group-hover:text-indigo-600 transition-colors">Impact Financier</p>
                      <p className="text-[9px] text-slate-400 font-bold">Coût de l'absentéisme.</p>
                    </button>
                    <button onClick={() => askGemini("Rédige un rappel à l'ordre général bienveillant concernant la ponctualité.")} className="w-full text-left p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-all group">
                      <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest group-hover:text-indigo-600 transition-colors">Communication RH</p>
                      <p className="text-[9px] text-slate-400 font-bold">Message d'équipe.</p>
                    </button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col overflow-hidden relative">
                <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg">
                      <Bot className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase italic tracking-tight">Assistant RH</p>
                      <p className="text-[8px] font-black uppercase text-indigo-500 tracking-widest">Connecté</p>
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
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2">Posez une question sur l'assiduité.</p>
                    </div>
                  ) : (
                    aiChat.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                        <div className={`max-w-[92%] p-6 rounded-[2rem] text-sm leading-relaxed shadow-md whitespace-pre-wrap ${
                          msg.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-tr-none font-bold' 
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
                         <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                         <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                         <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
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
                    placeholder="Posez une question RH..." 
                    className="flex-grow p-4 rounded-2xl bg-slate-50 border-none font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button 
                    disabled={isAiThinking || !aiInput.trim()}
                    onClick={() => askGemini()}
                    className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl hover:bg-indigo-600 transition-all disabled:opacity-30"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
               <div className="flex items-center space-x-3 mb-8"><Settings className="w-6 h-6 text-slate-400" /><h3 className="text-xl font-black uppercase italic tracking-tighter">Paramètres Généraux</h3></div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                     <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-50 pb-2">1. Horaires de référence (Sales)</h4>
                     <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-slate-600 mb-1 block">Entrée Standard</label><input type="time" value={settings.entryTime} onChange={e => setSettings({...settings, entryTime: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-slate-900 shadow-inner" /></div>
                        <div><label className="text-xs font-bold text-slate-600 mb-1 block">Sortie Standard</label><input type="time" value={settings.exitTime} onChange={e => setSettings({...settings, exitTime: e.target.value})} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-slate-900 shadow-inner" /></div>
                     </div>
                     <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100"><p className="text-[10px] text-indigo-800 font-bold leading-relaxed">Note : Les règles spécifiques pour le Back Office (Semaine/Samedi) et Ghizlane sont gérées automatiquement par le moteur de calcul.</p></div>
                  </div>
                  <div className="space-y-6">
                     <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-50 pb-2">2. Tolérances & Règles</h4>
                     <div><label className="text-xs font-bold text-slate-600 mb-1 block">Franchise Mensuelle (minutes)</label><input type="number" value={settings.penaltyThresholdMinutes} onChange={e => setSettings({...settings, penaltyThresholdMinutes: parseInt(e.target.value)})} className="w-full p-4 rounded-xl bg-slate-50 border-none font-black text-slate-900 shadow-inner" /></div>
                     <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <span className="text-xs font-bold text-slate-600">Tolérer 1 pointage (Réunion)</span>
                        <button onClick={() => setSettings({...settings, allowSinglePointage: !settings.allowSinglePointage})} className={`w-12 h-6 rounded-full relative transition-colors ${settings.allowSinglePointage ? 'bg-emerald-500' : 'bg-slate-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${settings.allowSinglePointage ? 'left-7' : 'left-1'}`}></div></button>
                     </div>
                  </div>
               </div>
               
               <div className="mt-10 pt-6 border-t border-slate-50">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">3. Affectation Départements</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto custom-scrollbar p-2 bg-slate-50 rounded-2xl border border-slate-100">
                     {employeeList.map(emp => (
                       <div key={emp.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                          <span className="text-xs font-bold text-slate-700 truncate mr-2">{emp.name}</span>
                          <select 
                            value={(settings.employeeDepartments || {})[emp.id] || 'Sales'} 
                            onChange={e => setSettings(prev => ({...prev, employeeDepartments: {...prev.employeeDepartments, [emp.id]: e.target.value as any}}))}
                            className="text-[9px] font-black uppercase bg-slate-50 border-none rounded-lg py-1 pl-2 pr-6 appearance-none cursor-pointer focus:ring-0"
                          >
                             <option value="Sales">Sales</option>
                             <option value="Back office">Back Office</option>
                          </select>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="mt-8 flex justify-end">
                  {hasPerm('update') && <button onClick={() => { saveCloudData('hr_settings', settings); setOpFeedback({ title: 'Sauvegardé', message: 'Paramètres mis à jour.', type: 'success' }); }} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-indigo-600 transition-all flex items-center"><Save className="w-4 h-4 mr-2" /> Enregistrer Configuration</button>}
               </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default HRAttendance;
