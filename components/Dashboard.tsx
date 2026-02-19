
import React, { useState, useEffect, useMemo } from 'react';
import { User, SalaryData, SalesData, initialSalaryData, initialSalesData, CalculationResult, ADVOrder } from '../types';
import { SALES_AGENTS, COMMISSION_RATES, INCIDENT_CATALOG } from '../constants';
import { getCloudData, saveCloudData } from '../services/database';
import InputGroup from './InputGroup';
import SalesPanel from './SalesPanel';
import IncidentManager from './IncidentManager';
import SummaryCard from './SummaryCard';
import AnalyticsDashboard from './AnalyticsDashboard';
import PayslipTemplate from './PayslipTemplate';
import GlobalReportTemplate from './GlobalReportTemplate';
import { Calculator, BarChart3, History, Save, Printer, User as UserIcon, Loader2, AlertTriangle, Banknote, DownloadCloud } from 'lucide-react';

interface DashboardProps {
  currentUser: User;
  salesAgents?: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ currentUser, salesAgents = SALES_AGENTS }) => {
  const isAdmin = currentUser.role === 'admin';
  const [activeTab, setActiveTab] = useState<'calculator' | 'analytics' | 'history'>('calculator');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const [selectedAgent, setSelectedAgent] = useState<string>(
    isAdmin ? salesAgents[0] : (currentUser.associatedAgentName || '')
  );
  
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));

  const [salaryData, setSalaryData] = useState<SalaryData>(initialSalaryData);
  const [salesData, setSalesData] = useState<SalesData>(initialSalesData);
  
  const [allAgentsData, setAllAgentsData] = useState<{name: string, salary: SalaryData, sales: SalesData}[]>([]);

  useEffect(() => {
    loadData();
  }, [selectedAgent, selectedMonth]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const dataKey = `commissions_${selectedMonth}_${selectedAgent}`;
      const savedData = await getCloudData(dataKey);
      
      if (savedData) {
        setSalaryData(savedData.salary || initialSalaryData);
        setSalesData(savedData.sales || initialSalesData);
      } else {
        setSalaryData({ ...initialSalaryData, agentName: selectedAgent });
        setSalesData(initialSalesData);
      }

      if (isAdmin && activeTab === 'analytics') {
        const allData = [];
        for (const agent of salesAgents) {
           const key = `commissions_${selectedMonth}_${agent}`;
           const d = await getCloudData(key);
           if (d) {
             allData.push({ name: agent, salary: d.salary, sales: d.sales });
           } else {
             allData.push({ name: agent, salary: { ...initialSalaryData, agentName: agent }, sales: initialSalesData });
           }
        }
        setAllAgentsData(allData);
      }

    } catch (e) {
      console.error("Error loading data", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportFromADV = async () => {
    let confirmMessage = `Voulez-vous importer les ventes FACTURÉES de ${selectedAgent} pour ${selectedMonth} ?\nCela écrasera les quantités actuelles.`;
    
    if (isAdmin) {
      confirmMessage = `MODE ADMINISTRATEUR :\nVoulez-vous lancer l'importation automatique pour TOUS LES VENDEURS (${salesAgents.length}) sur le mois de ${selectedMonth} ?\n\nCette action mettra à jour les fiches commissions de toute l'équipe avec les données facturées.`;
    }

    if (!confirm(confirmMessage)) return;
    
    setIsImporting(true);
    try {
      const advData = await getCloudData('adv_orders') as ADVOrder[];
      if (!advData) {
        alert("Aucune donnée ADV trouvée.");
        setIsImporting(false);
        return;
      }

      // Helper pour normaliser (Supprime accents, majuscules, espaces superflus)
      const normalize = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase() : "";

      // Liste des agents à traiter (Tous si Admin, sinon juste le sélectionné)
      const agentsToProcess = isAdmin ? salesAgents : [selectedAgent];
      
      let globalCount = 0;
      let processedAgentsCount = 0;

      // Lecture en parallèle des données existantes pour ne pas écraser les salaires de base, etc.
      const existingDataPromises = agentsToProcess.map(agent => getCloudData(`commissions_${selectedMonth}_${agent}`));
      const existingDataList = await Promise.all(existingDataPromises);

      const savePromises = [];

      for (let i = 0; i < agentsToProcess.length; i++) {
        const agentName = agentsToProcess[i];
        const existingData = existingDataList[i];
        const targetAgentNorm = normalize(agentName);

        // Reset counts pour cet agent
        const newSales = { ...initialSalesData };
        let agentCount = 0;

        advData.forEach(order => {
          // 1. Filtre par Commercial (Robuste)
          if (normalize(order.commercial) !== targetAgentNorm) return;

          // 2. Filtre par Date (Mois sélectionné)
          const orderDate = order.dateDepot || '';
          let dateStr = orderDate;
          
          if (orderDate.includes('T')) {
              dateStr = orderDate.split('T')[0];
          } else if (orderDate.includes('/') && orderDate.split('/').length === 3) {
             const parts = orderDate.split(' ')[0].split('/'); 
             if (parts.length === 3) dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
          
          if (!dateStr.startsWith(selectedMonth)) return;

          // 3. Filtre par Statut SI (UNIQUEMENT FACTURÉ)
          const statusSI = normalize(order.statutSi || '');
          const isFacture = statusSI.includes('FACTURE') && !statusSI.includes('NON');

          if (isFacture) {
            const offer = normalize(order.offre || '');
            agentCount++;
            globalCount++;

            if (offer.includes('TDLTE')) newSales.tdlte++;
            else if (offer.includes('20M') && (offer.includes('FTTH') || offer.includes('FIBRE'))) newSales.ftth20++;
            else if (offer.includes('50M') && (offer.includes('FTTH') || offer.includes('FIBRE'))) newSales.ftth50++;
            else if (offer.includes('100M') && (offer.includes('FTTH') || offer.includes('FIBRE'))) newSales.ftth100++;
            else if (offer.includes('200M') && (offer.includes('FTTH') || offer.includes('FIBRE'))) newSales.ftth200++;
            else if (offer.includes('500M') && (offer.includes('FTTH') || offer.includes('FIBRE'))) newSales.ftth500++;
            else if (offer.includes('ADSL')) newSales.adsl++;
            else if (offer.includes('BOX') && offer.includes('249')) newSales.box249++;
            else if (offer.includes('BOX') && offer.includes('349')) newSales.box349++;
            else if (offer.includes('BOX') || offer.includes('5G')) newSales.box5g++;
            else if (offer.includes('6H')) newSales.forf6h++;
            else if (offer.includes('15H')) newSales.forf15h++;
            else if (offer.includes('22H')) newSales.forf22h++;
            else if (offer.includes('34H')) newSales.forf34h++;
            else if (offer.includes('ILLIMITE')) newSales.illimiteNat++;
            else if (offer.includes('PARTAGE') && offer.includes('20')) newSales.partage20++;
            else if (offer.includes('PARTAGE') && offer.includes('50')) newSales.partage50++;
            else if (offer.includes('PARTAGE') && offer.includes('100')) newSales.partage100++;
            else if (offer.includes('PARTAGE') && offer.includes('200')) newSales.partage200++;
          }
        });

        // Préparation de la sauvegarde pour cet agent
        const salary = existingData?.salary || { ...initialSalaryData, agentName };
        
        // Recalcul automatique de la commission en fonction des nouvelles quantités importées
        let commission = 0;
        Object.entries(newSales).forEach(([k, qty]) => {
           commission += (qty as number) * (COMMISSION_RATES[k as keyof SalesData] || 0);
        });
        salary.commission = commission;

        const dataKey = `commissions_${selectedMonth}_${agentName}`;
        savePromises.push(saveCloudData(dataKey, { salary, sales: newSales }));
        
        // Mise à jour de l'affichage si c'est l'agent courant
        if (agentName === selectedAgent) {
           setSalesData(newSales);
           setSalaryData(salary);
        }
        processedAgentsCount++;
      }

      await Promise.all(savePromises);
      
      // Si Admin, on recharge aussi les données globales si l'onglet Analytics est ouvert
      if (isAdmin && activeTab === 'analytics') {
         await loadData();
      }

      if (isAdmin) {
        alert(`IMPORT GLOBAL TERMINÉ :\n${globalCount} dossiers facturés importés pour ${processedAgentsCount} commerciaux.`);
      } else {
        alert(`Import terminé : ${globalCount} dossiers FACTURÉS récupérés.`);
      }

    } catch (e) {
      console.error("Erreur import ADV", e);
      alert("Erreur lors de l'importation.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const dataKey = `commissions_${selectedMonth}_${selectedAgent}`;
    await saveCloudData(dataKey, { salary: salaryData, sales: salesData });
    setIsSaving(false);
    alert('Données sauvegardées avec succès !');
  };

  // Sauvegarde silencieuse sans alerte (pour changement d'onglet/vendeur)
  const saveCurrentStateSilently = async () => {
    if (isLoading) return; // Ne pas sauvegarder si on est en train de charger
    const dataKey = `commissions_${selectedMonth}_${selectedAgent}`;
    await saveCloudData(dataKey, { salary: salaryData, sales: salesData });
  };

  const handleIncidentChange = (id: string, amount: number, delta: number) => {
    setSalaryData(prev => {
      const currentCount = (prev.incidentsList?.[id] as number) || 0;
      const newCount = Math.max(0, currentCount + delta);
      
      const newList = { ...prev.incidentsList, [id]: newCount };
      if (newCount === 0) delete newList[id];
      
      const totalIncidents = Object.entries(newList).reduce((acc: number, [incId, count]) => {
        const meta = INCIDENT_CATALOG.find(i => i.id === incId);
        return acc + (count as number) * (meta?.amount || 0);
      }, 0);

      return { ...prev, incidentsList: newList, hrIncidents: totalIncidents };
    });
  };

  useEffect(() => {
    let calculatedCommission = 0;
    Object.entries(salesData).forEach(([key, qty]) => {
       calculatedCommission += (qty as number) * (COMMISSION_RATES[key as keyof SalesData] || 0);
    });
    if (calculatedCommission !== salaryData.commission) {
      setSalaryData(prev => ({ ...prev, commission: calculatedCommission }));
    }
  }, [salesData]);

  const calculateResult = useMemo((): CalculationResult => {
    const totalCommission = salaryData.commission;
    const bonuses = salaryData.seniorityBonus + salaryData.prime20HD + salaryData.prime100 + salaryData.bonusCA + salaryData.p4 + salaryData.bonusOther;
    const totalGross = salaryData.baseSalary + totalCommission + bonuses;
    
    const deductions = salaryData.routerMalus + salaryData.salaryConditionMalus + 
                       salaryData.clawbackResiliation + salaryData.clawbackDiversifia + 
                       salaryData.lateness + salaryData.absences + salaryData.advance + 
                       salaryData.otherDeductions + salaryData.cnss + salaryData.hrIncidents;

    return {
      totalGross,
      totalDeductions: deductions,
      netSalary: totalGross - deductions
    };
  }, [salaryData]);

  if (activeTab === 'analytics' && isAdmin && allAgentsData.length === 0 && !isLoading) {
      loadData();
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100">
         <div className="flex items-center space-x-4">
            <div className="bg-orange-50 p-3 rounded-xl text-[#ff7900]">
               <Calculator className="w-6 h-6" />
            </div>
            <div>
               <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Simulateur Commissions</h2>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Calcul Salaire & Primes</p>
            </div>
         </div>

         <div className="flex items-center gap-3">
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={async (e) => {
                const newVal = e.target.value;
                await saveCurrentStateSilently(); // Sauvegarde auto avant changement
                setSelectedMonth(newVal);
              }} 
              className="p-3 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-700 focus:ring-2 focus:ring-[#ff7900]/20"
            />
            {isAdmin && (
              <div className="relative">
                 <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                 <select 
                   value={selectedAgent} 
                   onChange={async (e) => {
                     const newVal = e.target.value;
                     await saveCurrentStateSilently(); // Sauvegarde auto avant changement de vendeur
                     setSelectedAgent(newVal);
                   }}
                   className="pl-10 pr-8 py-3 bg-slate-50 border-none rounded-xl font-bold text-sm text-slate-700 appearance-none cursor-pointer focus:ring-2 focus:ring-[#ff7900]/20"
                 >
                    {salesAgents.map(agent => <option key={agent} value={agent}>{agent}</option>)}
                 </select>
              </div>
            )}
         </div>
      </div>

      <div className="flex justify-center mb-8">
         <div className="bg-white p-1.5 rounded-[1.5rem] shadow-sm border border-slate-200 flex">
            <button onClick={async () => { await saveCurrentStateSilently(); setActiveTab('calculator'); }} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${activeTab === 'calculator' ? 'bg-[#ff7900] text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>
               <Calculator className="w-3.5 h-3.5 mr-2" /> Calculatrice
            </button>
            {isAdmin && (
              <button onClick={async () => { await saveCurrentStateSilently(); setActiveTab('analytics'); loadData(); }} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${activeTab === 'analytics' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>
                 <BarChart3 className="w-3.5 h-3.5 mr-2" /> Analytics
              </button>
            )}
            <button onClick={async () => { await saveCurrentStateSilently(); setActiveTab('history'); }} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center ${activeTab === 'history' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}>
               <History className="w-3.5 h-3.5 mr-2" /> Bulletin
            </button>
         </div>
      </div>

      {isLoading ? (
         <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-[#ff7900] animate-spin mb-4" />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Chargement des données...</p>
         </div>
      ) : (
         <>
           {activeTab === 'calculator' && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                   <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-black text-slate-900 uppercase italic tracking-tighter flex items-center">
                          <Banknote className="w-5 h-5 mr-2 text-green-600" /> Détail des Ventes
                      </h3>
                      <button 
                        onClick={handleImportFromADV}
                        disabled={isImporting}
                        className={`flex items-center px-4 py-2 ${isAdmin ? 'bg-slate-900 text-white hover:bg-[#ff7900]' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'} rounded-xl text-[10px] font-black uppercase tracking-widest transition-all`}
                        title={isAdmin ? "Importer les facturés pour TOUTE l'équipe" : "Importer mes ventes facturées"}
                      >
                        {isImporting ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <DownloadCloud className="w-3.5 h-3.5 mr-2" />}
                        {isAdmin ? 'Import Global (Tous)' : 'Importer Facturés'}
                      </button>
                   </div>
                   <SalesPanel 
                      data={salesData} 
                      onChange={(k, v) => setSalesData(prev => ({...prev, [k]: v}))} 
                      readOnly={!isAdmin} 
                   />
                   
                   <InputGroup 
                      title="Salaire & Primes" 
                      icon={<Banknote className="w-5 h-5" />} 
                      colorClass="text-green-600 bg-green-50 rounded-lg p-2"
                      data={salaryData} 
                      onChange={(k, v) => setSalaryData(prev => ({...prev, [k]: v}))}
                      readOnly={!isAdmin}
                      fields={[
                        { key: 'baseSalary', label: 'Salaire de Base' },
                        { key: 'commission', label: 'Commissions (Auto)', readOnly: true },
                        { key: 'seniorityBonus', label: 'Prime Ancienneté' },
                        { key: 'prime20HD', label: 'Prime 20 HD' },
                        { key: 'prime100', label: 'Prime 100%' },
                        { key: 'bonusCA', label: 'Bonus CA' },
                        { key: 'p4', label: 'Prime P4' },
                        { key: 'bonusOther', label: 'Autres Bonus' },
                      ]}
                   />

                   <InputGroup 
                      title="Déductions & Retenues" 
                      icon={<AlertTriangle className="w-5 h-5" />} 
                      colorClass="text-red-600 bg-red-50 rounded-lg p-2"
                      data={salaryData} 
                      onChange={(k, v) => setSalaryData(prev => ({...prev, [k]: v}))}
                      readOnly={!isAdmin}
                      fields={[
                        { key: 'advance', label: 'Avance sur Salaire' },
                        { key: 'cnss', label: 'Cotisation CNSS' },
                        { key: 'routerMalus', label: 'Malus Routeur' },
                        { key: 'salaryConditionMalus', label: 'Condition Salaire' },
                        { key: 'clawbackResiliation', label: 'Clawback Résiliation' },
                        { key: 'clawbackDiversifia', label: 'Clawback Diversifia' },
                        { key: 'lateness', label: 'Retards (Montant)' },
                        { key: 'absences', label: 'Absences (Montant)' },
                        { key: 'otherDeductions', label: 'Autres' },
                      ]}
                   />

                   <IncidentManager 
                      selectedIncidents={salaryData.incidentsList || {}} 
                      onToggleIncident={handleIncidentChange} 
                      readOnly={!isAdmin}
                   />
                </div>

                <div className="lg:col-span-1 space-y-6">
                   <SummaryCard result={calculateResult} />
                   <button 
                     onClick={handleSave} 
                     disabled={isSaving}
                     className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-[#ff7900] transition-all flex items-center justify-center"
                   >
                     {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                     Enregistrer les calculs
                   </button>
                </div>
             </div>
           )}

           {activeTab === 'analytics' && isAdmin && (
             <div>
                <AnalyticsDashboard allAgentsData={allAgentsData} />
                <div className="mt-8 text-center">
                   <button onClick={() => window.print()} className="px-6 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl font-black uppercase text-[10px] tracking-widest hover:text-slate-900 transition-all flex items-center mx-auto">
                      <Printer className="w-4 h-4 mr-2" /> Imprimer Rapport Global
                   </button>
                   <GlobalReportTemplate data={allAgentsData} month={selectedMonth} />
                </div>
             </div>
           )}

           {activeTab === 'history' && (
             <div className="flex flex-col items-center">
                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 max-w-4xl w-full">
                   <PayslipTemplate 
                      salaryData={salaryData} 
                      salesData={salesData} 
                      result={calculateResult} 
                      month={selectedMonth} 
                   />
                </div>
                <button onClick={() => window.print()} className="mt-6 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-slate-900 transition-all flex items-center">
                   <Printer className="w-4 h-4 mr-2" /> Imprimer Bulletin
                </button>
             </div>
           )}
         </>
      )}
    </div>
  );
};

export default Dashboard;
