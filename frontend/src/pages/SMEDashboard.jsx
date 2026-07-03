import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Landmark,
  FileText,
  Clock,
  Briefcase,
  Bell,
  Trash2,
  Download,
  PlusCircle,
  ArrowRight,
  ShieldCheck,
  Search,
  Sparkles,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Coins,
  ChevronRight,
  LogOut,
  ExternalLink,
  Loader2,
  History,
  Send,
  Bot,
  MessageSquare,
  X,
  User,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext.jsx';
import ReactMarkdown from 'react-markdown';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Progress } from '@/components/ui/progress.jsx';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table.jsx';
import { Upload } from '@/components/ui/upload.jsx';
import { cn } from '@/lib/utils.js';
import { loanApi } from '@/api/loan.api.js';
import { bankApi } from '@/api/bank.api.js';

export default function SMEDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  
  const [partnerBanks, setPartnerBanks] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAppId, setSelectedAppId] = useState('');

  
  const [activeAppHistory, setActiveAppHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [uploadingMissingDocs, setUploadingMissingDocs] = useState({});
  const [selectedUploadAppId, setSelectedUploadAppId] = useState('');
  const [selectedUploadDocType, setSelectedUploadDocType] = useState('bank_statements');
  const [isUploadingDocCenter, setIsUploadingDocCenter] = useState(false);
  const [vectorizingDocs, setVectorizingDocs] = useState({});

  
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [isLinking, setIsLinking] = useState(false);
  const [linkStep, setLinkStep] = useState(1);
  const [linkingBank, setLinkingBank] = useState(null);
  const [linkMode, setLinkMode] = useState('existing');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('current');
  const [ifscCode, setIfscCode] = useState('');
  const [contactDetail, setContactDetail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpTimer, setOtpTimer] = useState(120);
  const [otpCodePreview, setOtpCodePreview] = useState('');
  const [loadingLink, setLoadingLink] = useState(false);
  const [linkError, setLinkError] = useState('');

  // Policy Chatbot States
  const [isPolicyChatOpen, setIsPolicyChatOpen] = useState(false);
  const [selectedChatBank, setSelectedChatBank] = useState(null);
  const [policyDocs, setPolicyDocs] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingPolicies, setLoadingPolicies] = useState(false);

  const handleOpenPolicyChat = async (bank) => {
    setSelectedChatBank(bank);
    setIsPolicyChatOpen(true);
    setLoadingPolicies(true);
    setChatMessages([
      {
        role: 'bot',
        content: `Hello! I am your AI policy assistant for ${bank.name}. Ask me any questions about the credit guidelines, underwriting requirements, or policy criteria for this bank.`,
      },
    ]);
    try {
      const res = await bankApi.getBankPolicies(bank.name);
      setPolicyDocs(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch policies for bank:', err);
    } finally {
      setLoadingPolicies(false);
    }
  };

  const handleSendPolicyQuery = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || sendingMessage) return;

    const userMsg = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatInput('');
    setSendingMessage(true);

    try {
      const res = await bankApi.chatWithPolicy(selectedChatBank.name, userMsg);
      const data = res.data;
      if (data.success) {
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'bot',
            content: data.answer,
            sources: data.sources || [],
          },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'bot',
            content: data.message || 'Sorry, I encountered an error answering your question.',
          },
        ]);
      }
    } catch (err) {
      console.error('Policy chat failed:', err);
      const errMsg = err.response?.data?.message || 'Failed to connect to the AI policy assistant.';
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          content: errMsg,
        },
      ]);
    } finally {
      setSendingMessage(false);
    }
  };


  const fetchAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const { data } = await bankApi.getLinkedAccounts();
      setLinkedAccounts(data.data);
    } catch (err) {
      console.error('Failed to fetch linked bank accounts:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [banksRes, appsRes] = await Promise.all([
          loanApi.getPartnerBanks(),
          loanApi.getAll(),
        ]);
        setPartnerBanks(banksRes.data.data);
        const apps = appsRes.data.data?.docs ?? appsRes.data.data ?? [];
        setApplications(Array.isArray(apps) ? apps : []);
        const nonDrafts = apps.filter((a) => a.status !== 'draft');
        if (nonDrafts.length > 0) {
          setSelectedAppId(nonDrafts[0].appId || nonDrafts[0].app_id);
        } else if (apps.length > 0) {
          setSelectedAppId(apps[0].appId || apps[0].app_id);
        }
        if (apps.length > 0) {
          setSelectedUploadAppId(apps[0]._id || apps[0].id);
        }
        await fetchAccounts();
      } catch (err) {
        console.error('Failed to load dashboard data:', err);

      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  
  useEffect(() => {
    let interval = null;
    if (isLinking && linkStep === 3 && otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => prev - 1);
      }, 1000);
    } else if (otpTimer === 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isLinking, linkStep, otpTimer]);

  const filteredBanks = partnerBanks.filter(
    (b) =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.branch.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const nonDraftApps = applications.filter((a) => a.status !== 'draft');
  const activeApp = nonDraftApps.find((a) => (a.appId || a.app_id) === selectedAppId) || nonDraftApps[0] || null;

  const outstandingFunding = applications
    .filter((a) => ['approved', 'disbursed'].includes(a.status))
    .reduce((sum, a) => sum + (a.amount || 0), 0);

  const activeRequestsCount = applications
    .filter((a) => ['submitted', 'eligibility_check', 'agent_review', 'missing_info'].includes(a.status))
    .length;

  
  const loadActiveAppHistory = async (appId) => {
    if (!appId) return;
    try {
      setLoadingHistory(true);
      const app = applications.find((a) => (a.appId || a.app_id) === appId);
      if (!app) return;
      
      const { data } = await loanApi.getHistory(app.id || app._id);
      setActiveAppHistory(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      console.error('Failed to fetch loan history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (selectedAppId) {
      loadActiveAppHistory(selectedAppId);
    }
  }, [selectedAppId, applications]);

  const DOC_LABELS = {
    pan: 'PAN Card',
    aadhaar: 'Aadhaar Card',
    gst_certificate: 'GST Certificate',
    bank_statements: 'Bank Statements',
    itr: 'ITR Returns',
    balance_sheets: 'Balance Sheet',
    profit_loss: 'Profit & Loss',
    loan_documents: 'Sanction Letters',
  };

  const getLatestMissingDocs = () => {
    if (!activeAppHistory || activeAppHistory.length === 0) {
      if (activeApp && activeApp.status === 'missing_info') {
        const requiredDocs = ['pan', 'aadhaar', 'gst_certificate', 'bank_statements', 'itr', 'balance_sheets', 'profit_loss', 'loan_documents'];
        return requiredDocs.filter(key => !activeApp.documents?.[key]?.url);
      }
      return [];
    }
    const reversed = [...activeAppHistory].reverse();
    const missingInfoLog = reversed.find((log) => log.to_status === 'missing_info');
    if (missingInfoLog && missingInfoLog.missing_docs && missingInfoLog.missing_docs.length > 0) {
      return missingInfoLog.missing_docs;
    }
    if (activeApp && activeApp.status === 'missing_info') {
      const requiredDocs = ['pan', 'aadhaar', 'gst_certificate', 'bank_statements', 'itr', 'balance_sheets', 'profit_loss', 'loan_documents'];
      return requiredDocs.filter(key => !activeApp.documents?.[key]?.url);
    }
    return [];
  };

  const handleMissingDocUpload = async (docType, file) => {
    if (!file || !activeApp) return;
    setUploadingMissingDocs((prev) => ({ ...prev, [docType]: true }));
    try {
      const res = await loanApi.uploadDocument(activeApp._id, docType, file);
      const uploadedDoc = res.data?.data;
      const jobId = uploadedDoc?.ocr_job_id;

      
      const appsRes = await loanApi.getAll();
      setApplications(appsRes.data.data);

      if (jobId) {
        setVectorizingDocs((prev) => ({ ...prev, [docType]: 'Processing OCR & AI Vectorization...' }));
        
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await loanApi.getOcrJobStatus(jobId);
            const jobStatus = statusRes.data?.data;
            
            if (jobStatus?.is_vectorized) {
              clearInterval(interval);
              setVectorizingDocs((prev) => {
                const copy = { ...prev };
                delete copy[docType];
                return copy;
              });
              
              const finalApps = await loanApi.getAll();
              setApplications(finalApps.data.data);
            } else if (jobStatus?.status === 'failed' || jobStatus?.vectorization_error || attempts > 60) {
              clearInterval(interval);
              setVectorizingDocs((prev) => ({
                ...prev,
                [docType]: `Failed: ${jobStatus?.error_message || jobStatus?.vectorization_error || 'OCR/Vectorization failed'}`,
              }));
            }
          } catch (pollErr) {
            console.error('Error polling OCR status:', pollErr);
            if (attempts > 60) clearInterval(interval);
          }
        }, 3000);
      } else {
        alert(`Successfully uploaded missing ${DOC_LABELS[docType] || docType}.`);
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || `Failed to upload ${DOC_LABELS[docType] || docType}`);
    } finally {
      setUploadingMissingDocs((prev) => ({ ...prev, [docType]: false }));
    }
  };

  const getTimelineSteps = () => {
    if (!activeApp) return [];
    
    const status = activeApp.status;
    const isSubmittedCompleted = status !== 'draft';
    
    
    const isEligActive = status === 'eligibility_check';
    const isEligCompleted = ['agent_review', 'approved', 'rejected', 'disbursed'].includes(status);
    
    
    const isReviewActive = status === 'agent_review';
    const isReviewCompleted = ['approved', 'disbursed'].includes(status);
    
    
    const isOutcomeActive = ['approved', 'rejected', 'disbursed'].includes(status);
    
    return [
      {
        title: '1. Application Submitted',
        description: 'Your loan application draft has been finalized and submitted to the underwriting queue.',
        status: isSubmittedCompleted ? 'completed' : 'pending',
        date: activeApp.created_at ? new Date(activeApp.created_at).toLocaleDateString() : null,
      },
      {
        title: '2. Under Eligibility Check',
        description: 'Lending officers are validating primary registration variables, GST tax records, and credit benchmarks.',
        status: isEligCompleted ? 'completed' : isEligActive ? 'active' : 'pending',
      },
      {
        title: '3. Under Agent Review',
        description: 'A credit agent is conducting detailed assessment on promoter profiles, net margins, and collateral.',
        status: isReviewCompleted ? 'completed' : isReviewActive ? 'active' : 'pending',
      },
      {
        title: status === 'rejected' ? '4. Case Rejected' : status === 'disbursed' ? '4. Approved & Signed' : '4. Final Approval',
        description: status === 'rejected' 
          ? 'The credit committee declined this application. Refer to logs below for reasons.' 
          : 'Lender generated sanction letters and final agreement terms.',
        status: isOutcomeActive ? (status === 'rejected' ? 'rejected' : 'completed') : 'pending',
      },
      {
        title: '5. Funds Disbursed',
        description: 'Approved capital has been cleared and wired into your verified corporate bank account.',
        status: status === 'disbursed' ? 'completed' : 'pending',
      }
    ];
  };



  
  const [documents, setDocuments] = useState([]);

  
  const getRealDocumentsList = () => {
    const list = [];
    applications.forEach((app) => {
      if (app.documents) {
        Object.entries(app.documents).forEach(([docType, docMetadata]) => {
          if (docMetadata && docMetadata.url) {
            list.push({
              id: `${app._id}_${docType}`,
              appId: app.appId,
              loanId: app._id,
              docType: docType,
              name: docMetadata.filename || `${docType.toUpperCase()}_Document`,
              size: docMetadata.size ? `${(docMetadata.size / (1024 * 1024)).toFixed(2)} MB` : '—',
              date: docMetadata.uploaded_at ? new Date(docMetadata.uploaded_at).toISOString().split('T')[0] : '—',
              type: docType.replace('_', ' ').toUpperCase(),
              status: app.status === 'missing_info' ? 'Under Review' : 'Active',
              url: docMetadata.url,
              isReal: true,
            });
          }
        });
      }
    });
    return list;
  };

  const getMergedDocuments = () => {
    const realDocs = getRealDocumentsList();
    return [...realDocs, ...documents];
  };

  const handleRealFileUpload = async (file) => {
    const targetAppId = selectedUploadAppId || (applications.length > 0 ? applications[0]._id : null);
    if (!targetAppId) {
      alert('Please select or initialize a target application first.');
      return;
    }
    setIsUploadingDocCenter(true);
    try {
      await loanApi.uploadDocument(targetAppId, selectedUploadDocType, file);
      
      const appsRes = await loanApi.getAll();
      setApplications(appsRes.data.data);
      alert(`Successfully uploaded and linked ${DOC_LABELS[selectedUploadDocType]} to application.`);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || `Failed to upload ${DOC_LABELS[selectedUploadDocType]}`);
    } finally {
      setIsUploadingDocCenter(false);
    }
  };

  const handleFileUpload = (newFile) => {
    const newDoc = {
      id: `d${Date.now()}`,
      name: newFile.name,
      size: `${(newFile.size / (1024 * 1024)).toFixed(1)} MB`,
      date: new Date().toISOString().split('T')[0],
      type: newFile.name.endsWith('.xlsx') || newFile.name.endsWith('.xls') ? 'Bank Statement' : 'Business Proof',
      status: 'pending',
      isReal: false,
    };
    setDocuments((prev) => [newDoc, ...prev]);
  };

  const handleDeleteDoc = async (doc) => {
    if (doc.isReal) {
      if (!window.confirm(`Are you sure you want to delete ${doc.name}?`)) return;
      try {
        await loanApi.deleteDocument(doc.loanId, doc.docType);
        
        const appsRes = await loanApi.getAll();
        setApplications(appsRes.data.data);
        alert('Document deleted successfully.');
      } catch (err) {
        console.error(err);
        alert(err.response?.data?.message || 'Failed to delete document');
      }
    } else {
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    }
  };

  
  const [notifications, setNotifications] = useState([]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const deleteNotification = (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleTrackCase = (appId) => {
    setSelectedAppId(appId);
    setActiveTab('tracker');
  };

  const handleSelectBank = (bank) => {
    setLinkingBank(bank);
    setIfscCode(bank.ifsc);
    
    setAccountNumber('1209' + Math.floor(10000000 + Math.random() * 90000000).toString());
    setLinkStep(2);
  };

  const handleSendOtp = async () => {
    if (!contactDetail) {
      setLinkError('Please enter a linked email or phone number');
      return;
    }
    setLoadingLink(true);
    setLinkError('');
    try {
      const res = await bankApi.sendOtp(contactDetail);
      setOtpCodePreview(res.data.data.code_preview);
      setOtpTimer(120);
      setLinkStep(3);
    } catch (err) {
      console.error(err);
      setLinkError(err.response?.data?.message || 'Failed to send OTP code. Please try again.');
    } finally {
      setLoadingLink(false);
    }
  };

  const handleVerifyAndLink = async () => {
    if (!otpCode) {
      setLinkError('Please enter the 6-digit OTP code');
      return;
    }
    setLoadingLink(true);
    setLinkError('');
    try {
      await bankApi.verifyOtpAndLink({
        bank_name: linkingBank.name,
        account_number: accountNumber,
        account_type: accountType,
        linked_contact: contactDetail,
        ifsc_code: ifscCode,
        code: otpCode,
      });
      setLinkStep(4);
      await fetchAccounts();
    } catch (err) {
      console.error(err);
      setLinkError(err.response?.data?.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setLoadingLink(false);
    }
  };

  const handleUnlinkAccount = async (accountId) => {
    if (!window.confirm('Are you sure you want to unlink this corporate bank account?')) return;
    try {
      await bankApi.unlinkAccount(accountId);
      await fetchAccounts();
    } catch (err) {
      console.error('Failed to unlink bank account:', err);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  
  const getStatusBadge = (status) => {
    const configs = {
      underwriting: { variant: 'warning', label: 'Underwriting Review' },
      approved: { variant: 'success', label: 'Approved' },
      disbursed: { variant: 'info', label: 'Funds Disbursed' },
      rejected: { variant: 'destructive', label: 'Rejected' },
      pending: { variant: 'secondary', label: 'Pending Review' },
      verified: { variant: 'success', label: 'Verified' },
    };
    const c = configs[status] || { variant: 'default', label: status };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col sm:flex-row">
      {}
      <aside className="w-full sm:w-64 bg-slate-900 border-r border-white/5 flex flex-col justify-between flex-shrink-0">
        <div>
          {}
          <div className="h-16 px-6 border-b border-white/5 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-white tracking-tight text-sm">CapitalScale</span>
              <span className="text-[10px] block text-slate-300 leading-none">SME Portal</span>
            </div>
          </div>

          {}
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                activeTab === 'overview'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              )}
            >
              <LayoutDashboard className="w-4.5 h-4.5" />
              Overview
            </button>

            <button
              onClick={() => setActiveTab('banks')}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                activeTab === 'banks'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              )}
            >
              <Landmark className="w-4.5 h-4.5" />
              Search Partner Banks
            </button>

            <button
              onClick={() => setActiveTab('applications')}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                activeTab === 'applications'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              )}
            >
              <Briefcase className="w-4.5 h-4.5" />
              My Applications
            </button>

            <button
              onClick={() => setActiveTab('tracker')}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                activeTab === 'tracker'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              )}
            >
              <Clock className="w-4.5 h-4.5" />
              Application Tracker
            </button>

            <button
              onClick={() => setActiveTab('documents')}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                activeTab === 'documents'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              )}
            >
              <FileText className="w-4.5 h-4.5" />
              Document Center
            </button>

            <button
              onClick={() => {
                setActiveTab('bank_accounts');
                setIsLinking(false);
              }}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                activeTab === 'bank_accounts'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              )}
            >
              <Landmark className="w-4.5 h-4.5" />
              Bank Accounts
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                activeTab === 'notifications'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              )}
            >
              <span className="flex items-center gap-3">
                <Bell className="w-4.5 h-4.5" />
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {}
        <div className="p-4 border-t border-white/5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-semibold text-sm">
              {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.full_name}</p>
              <p className="text-[10px] text-slate-300 truncate">{user?.business_name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-white/5 hover:border-red-500/30 hover:bg-red-500/5 text-slate-400 hover:text-red-400 text-xs transition-all font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout Securely
          </button>
        </div>
      </aside>

      {}
      <main className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
        
        {}
        {}
        {}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {}
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Overview</h1>
              <p className="text-slate-400 text-xs">Financial stats, tracker overview, and quick shortcuts.</p>
            </div>

            {}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-xs">Outstanding Funding</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <h3 className="text-2xl font-bold text-white">₹{outstandingFunding.toLocaleString()}</h3>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-xs">Active Requests</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <h3 className="text-2xl font-bold text-white">{activeRequestsCount}</h3>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-xs">Uploaded Documents</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <h3 className="text-2xl font-bold text-white">{getRealDocumentsList().length}</h3>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardDescription className="text-xs">Unread Alerts</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <h3 className="text-2xl font-bold text-white">{unreadCount}</h3>
                </CardContent>
              </Card>
            </div>

            {}
            <div className="grid md:grid-cols-3 gap-6">
              {}
              <Card className="md:col-span-1">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-blue-400" />
                    Business Entity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-slate-300 block">Registered Name</span>
                    <span className="text-white font-medium">{user?.business_name || 'Sharma Enterprises'}</span>
                  </div>
                  <div>
                    <span className="text-slate-300 block">Applicant Profile</span>
                    <span className="text-white font-medium">{user?.full_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-300 block">Authorized Phone</span>
                    <span className="text-slate-300">{user?.phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-300 block">Corporate Address</span>
                    <span className="text-slate-300">Plot 12, Sector 5, Bandra West, Mumbai, 400050</span>
                  </div>
                </CardContent>
              </Card>

              {}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Capital Actions</CardTitle>
                  <CardDescription className="text-xs">Initiate a new loan request or upload financials to start auto-scoring.</CardDescription>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => setActiveTab('banks')}
                    className="group border border-white/5 rounded-xl p-4 bg-white/[0.01] hover:border-blue-500/30 hover:bg-blue-500/[0.01] cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div>
                      <Landmark className="w-7 h-7 text-blue-400 mb-3 group-hover:scale-105 transition-transform" />
                      <h4 className="text-sm font-semibold text-white mb-1">Search Partner Banks</h4>
                      <p className="text-[11px] text-slate-400 leading-normal">
                        Browse registered banks, rates, and limits to apply.
                      </p>
                    </div>
                    <span className="text-[10px] text-blue-400 font-semibold flex items-center gap-1 mt-4">
                      Explore Banks <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>

                  <div
                    onClick={() => navigate('/loan/apply')}
                    className="group border border-white/5 rounded-xl p-4 bg-white/[0.01] hover:border-blue-500/30 hover:bg-blue-500/[0.01] cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div>
                      <PlusCircle className="w-7 h-7 text-blue-400 mb-3 group-hover:scale-105 transition-transform" />
                      <h4 className="text-sm font-semibold text-white mb-1">Create Funding Request</h4>
                      <p className="text-[11px] text-slate-400 leading-normal">
                        Fill out requirements and run pre-assessments instantly.
                      </p>
                    </div>
                    <span className="text-[10px] text-blue-400 font-semibold flex items-center gap-1 mt-4">
                      Initiate Application <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {}
            {activeApp ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-base">Active Application Tracker</CardTitle>
                      <CardDescription className="text-xs">Current status for case: <span className="font-semibold text-blue-400">{activeApp.appId}</span> ({activeApp.bank_name})</CardDescription>
                    </div>
                    <button
                      onClick={() => handleTrackCase(activeApp.appId)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5"
                    >
                      Full Tracker <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Progress value={activeApp.progress} className="h-2" />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span className="capitalize">Status: {activeApp.status}</span>
                    <span>{activeApp.progress}% Completed</span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 text-center text-slate-300">
                  <p className="text-xs">No active applications. Start by searching for a partner bank below or applying directly.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {}
        {}
        {}
        {activeTab === 'banks' && (
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Search Partner Banks</h1>
              <p className="text-slate-400 text-xs">Search and compare commercial lending partners.</p>
            </div>

            {}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="text"
                placeholder="Search by bank name, location, or branch..."
                className="w-full bg-slate-900 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Lender Bank</TableHead>
                      <TableHead>Branch Office</TableHead>
                      <TableHead>IFSC Code</TableHead>
                      <TableHead>Interest Range</TableHead>
                      <TableHead>Max Loan Limit</TableHead>
                      <TableHead>Est. Processing</TableHead>
                      <TableHead>Latest Policy</TableHead>
                      <TableHead className="text-right pr-6">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBanks.length > 0 ? (
                      filteredBanks.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="pl-6 font-semibold text-white flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                              {b.name[0]}
                            </div>
                            {b.name}
                          </TableCell>
                          <TableCell>{b.branch}</TableCell>
                          <TableCell className="font-mono text-xs text-slate-400">{b.ifsc}</TableCell>
                          <TableCell className="text-emerald-400 font-semibold">{b.rate}</TableCell>
                          <TableCell className="text-white font-medium">{b.limit}</TableCell>
                          <TableCell className="text-slate-400">{b.time}</TableCell>
                          <TableCell>
                            {b.latest_policy ? (
                              <a
                                href={b.latest_policy.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`View: ${b.latest_policy.title}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-full text-[10px] font-semibold transition-all"
                              >
                                <FileText className="w-3 h-3 flex-shrink-0" />
                                <span className="max-w-[120px] truncate">{b.latest_policy.title}</span>
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">No policy yet</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenPolicyChat(b)}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-white/5 text-slate-200 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1"
                              >
                                Policy Chat
                                <Sparkles className="w-3 h-3 text-blue-400" />
                              </button>
                              <button
                                onClick={() => navigate('/loan/apply', { state: { bankName: b.name } })}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1"
                              >
                                Apply
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-slate-300">
                          No partner banks found matching your search.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {}
        {}
        {}
        {activeTab === 'applications' && (
          <div className="space-y-6 animate-fade-in">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">My Applications</h1>
              <p className="text-slate-400 text-xs">Track current status, approve offers, or view rejections.</p>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Application ID</TableHead>
                      <TableHead>Lender Bank</TableHead>
                      <TableHead>Principal Amount</TableHead>
                      <TableHead>Submission Date</TableHead>
                      <TableHead>Status Code</TableHead>
                      <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {applications.length > 0 ? (
                      applications.map((app) => (
                        <TableRow key={app.appId}>
                          <TableCell className="pl-6 font-mono text-xs font-semibold text-blue-400">
                            {app.appId}
                          </TableCell>
                          <TableCell className="font-semibold text-white">{app.bank_name}</TableCell>
                          <TableCell className="font-medium text-slate-200">
                            {app.amount ? `₹${app.amount.toLocaleString()}` : '— (Draft)'}
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {app.created_at ? new Date(app.created_at).toISOString().split('T')[0] : ''}
                          </TableCell>
                          <TableCell>{getStatusBadge(app.status)}</TableCell>
                          <TableCell className="text-right pr-6 space-x-2">
                            {app.status === 'draft' ? (
                              <button
                                onClick={() => navigate('/loan/apply', { state: { draftId: app._id } })}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition-colors inline-flex items-center gap-1"
                              >
                                Resume Draft
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleTrackCase(app.appId)}
                                className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white font-medium text-xs rounded-lg transition-colors inline-flex items-center gap-1"
                              >
                                Track Case
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-slate-300">
                          No applications found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {}
        {}
        {}
        {activeTab === 'tracker' && (
          <div className="space-y-6 animate-fade-in text-xs">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Application Tracker</h1>
              <p className="text-slate-400 text-xs">Dynamic stepper progress checker for your selected funding case.</p>
            </div>

            {}
            {nonDraftApps.length > 0 ? (
              <>
                <div className="flex gap-2 flex-wrap">
                  {nonDraftApps.map((a) => (
                    <button
                      key={a.appId}
                      onClick={() => setSelectedAppId(a.appId)}
                      className={cn(
                        'px-4 py-2 rounded-xl text-xs font-semibold border transition-all',
                        selectedAppId === a.appId
                          ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                          : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
                      )}
                    >
                      {a.appId} ({a.bank_name})
                    </button>
                  ))}
                </div>

                {}
                {activeApp && activeApp.status === 'missing_info' && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-red-400">Action Required: Flagged Missing Information</h4>
                        <p className="text-xs text-slate-400 leading-normal">
                          The underwriting agent has requested additional clarification or replacement files.
                          Please upload the requested documents below to resume application processing automatically.
                        </p>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
                      {getLatestMissingDocs().map((docKey) => {
                        const isUploaded = !!activeApp.documents?.[docKey]?.url;
                        const isUploading = !!uploadingMissingDocs[docKey];
                        return (
                          <div key={docKey} className="bg-slate-950 p-4 border border-white/5 rounded-xl flex flex-col justify-between gap-3">
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <span className="text-xs font-semibold text-white block capitalize">
                                  {docKey.replace('_', ' ')}
                                </span>
                                <span className="text-[10px] text-slate-300 mt-0.5 block">
                                  {isUploaded ? 'File Ready (Will replace current)' : 'File Required'}
                                </span>
                              </div>
                              {isUploaded ? (
                                <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] uppercase font-bold">Uploaded</Badge>
                              ) : (
                                <Badge className="bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] uppercase font-bold">Missing</Badge>
                              )}
                            </div>

                            <div className="relative">
                              {isUploading ? (
                                <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-blue-400">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span>Uploading...</span>
                                </div>
                              ) : vectorizingDocs[docKey] ? (
                                <div className="flex flex-col items-center justify-center gap-1 py-1 text-[10px] text-emerald-400 font-medium">
                                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                                  <span className="text-center">{vectorizingDocs[docKey]}</span>
                                </div>
                              ) : (
                                <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-all text-center">
                                  <span>Choose File</span>
                                  <input
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        handleMissingDocUpload(docKey, file);
                                      }
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-white/5 pt-4 mt-2">
                      <p className="text-[11px] text-slate-400">
                        Uploaded everything? If the status has not updated automatically, trigger a manual recheck or resubmit the application.
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            const res = await loanApi.changeStatus(activeApp.id || activeApp._id, 'submitted', 'Manual resubmission trigger by applicant.');
                            const appsRes = await loanApi.getAll();
                            const apps = appsRes.data.data?.docs ?? appsRes.data.data ?? [];
                            setApplications(Array.isArray(apps) ? apps : []);
                            alert('Application resubmitted successfully. The extraction pipeline has been queued.');
                          } catch (err) {
                            alert(err.response?.data?.message || 'Failed to resubmit application.');
                          }
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 self-end sm:self-auto"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Resubmit Application
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-3 gap-6">
                  {}
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="w-4.5 h-4.5 text-blue-400" />
                        Case Pipeline: {activeApp.appId}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Lender: {activeApp.bank_name} · Amount: ₹{activeApp.amount?.toLocaleString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 relative">
                      
                      {}
                      <div className="relative pl-8 space-y-8 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/5">
                        
                        {getTimelineSteps().map((step, idx) => {
                          let iconClass = 'bg-slate-900 border-white/5 text-slate-300';
                          if (step.status === 'completed') {
                            iconClass = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
                          } else if (step.status === 'active') {
                            iconClass = 'bg-blue-500/10 border-blue-500/30 text-blue-400';
                          } else if (step.status === 'rejected') {
                            iconClass = 'bg-red-500/10 border-red-500/30 text-red-400';
                          }

                          return (
                            <div key={idx} className="relative">
                              <div className={cn(
                                'absolute -left-8 top-0.5 w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs border transition-all duration-300',
                                iconClass
                              )}>
                                {step.status === 'completed' ? (
                                  <CheckCircle className="w-4 h-4" />
                                ) : step.status === 'rejected' ? (
                                  <AlertCircle className="w-4 h-4" />
                                ) : (
                                  <Clock className="w-4 h-4" />
                                )}
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                                  {step.title}
                                  {step.status === 'completed' && <Badge variant="success">Completed</Badge>}
                                  {step.status === 'active' && <Badge variant="warning">Active</Badge>}
                                  {step.status === 'rejected' && <Badge variant="destructive">Declined</Badge>}
                                </h4>
                                <p className="text-xs text-slate-400 mt-1">
                                  {step.description}
                                </p>
                                {step.date && (
                                  <span className="text-[10px] text-slate-300 block mt-1">Date: {step.date}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                      </div>
                    </CardContent>
                  </Card>

                  {}
                  <Card className="md:col-span-1 h-fit text-xs">
                    <CardHeader>
                      <CardTitle className="text-sm">Assistance & Support</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/10 rounded-xl p-3">
                        <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                        <p className="text-slate-400 leading-normal text-[11px]">
                          Case analysis is secure. If documents require re-upload, you will receive an alert in your notification box.
                        </p>
                      </div>
                      <div className="border-t border-white/5 pt-4 space-y-2">
                        <span className="text-slate-300 block">Assigned Credit Specialist</span>
                        <span className="text-white font-medium block">Nikhil Sen (SBI Underwriting)</span>
                        <span className="text-slate-400 block">nikhil.sen@sbi.co.in</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {}
                <div className="border border-white/5 rounded-2xl overflow-hidden mt-6">
                  <div
                    onClick={() => setExpandedHistory(!expandedHistory)}
                    className="bg-white/[0.01] hover:bg-white/[0.02] p-4 flex justify-between items-center cursor-pointer select-none transition-colors border-b border-white/5"
                  >
                    <span className="font-bold text-slate-300 flex items-center gap-2 text-[10px] uppercase tracking-wider">
                      <History className="w-4 h-4 text-blue-400" />
                      Application Activity & History Log ({activeAppHistory.length})
                    </span>
                    <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${expandedHistory ? 'rotate-90' : ''}`} />
                  </div>

                  {expandedHistory && (
                    <div className="p-4 bg-slate-950/40 space-y-4 divide-y divide-white/5 max-h-80 overflow-y-auto">
                      {loadingHistory ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                        </div>
                      ) : activeAppHistory.length > 0 ? (
                        activeAppHistory.map((log, logIdx) => (
                          <div key={log.id || log._id || logIdx} className="pt-4 first:pt-0 space-y-2">
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="text-slate-300 font-mono">
                                {new Date(log.created_at).toLocaleString()}
                              </span>
                              <span className="text-slate-300 font-semibold">
                                By: {log.changed_by_name} ({log.changed_by_model === 'SMEUser' ? 'Applicant' : 'Officer'})
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className="bg-slate-900 border border-white/5 px-2 py-0.5 rounded text-[10px] capitalize text-slate-400">{log.from_status}</span>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              <span className="bg-blue-600/10 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] capitalize text-blue-400 font-semibold">{log.to_status}</span>
                            </div>

                            {log.notes && (
                              <p className="text-slate-300 text-[11px] leading-normal bg-white/[0.005] border border-white/5 p-2 rounded-xl">
                                <span className="text-slate-300 font-bold mr-1">Notes:</span>
                                {log.notes}
                              </p>
                            )}

                            {log.missing_docs && log.missing_docs.length > 0 && (
                              <div className="flex flex-wrap gap-1 items-center">
                                <span className="text-[9px] text-red-400 font-semibold uppercase">Missing files requested:</span>
                                {log.missing_docs.map((doc) => (
                                  <Badge key={doc} className="bg-red-500/10 text-red-400 border border-red-500/20 text-[8px] uppercase">{doc.replace('_', ' ')}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-xs text-slate-400 py-4">No audit logs found for this case.</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-slate-300">
                  <p className="text-xs">No active applications found. Submitting an application will create a pipeline to track here.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {}
        {}
        {}
        {activeTab === 'documents' && (
          <div className="space-y-6 animate-fade-in text-xs">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Document Center</h1>
              <p className="text-slate-400 text-xs">Upload and audit your corporate tax, business, and bank credentials.</p>
            </div>

            {}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  Upload & Associate Documents
                </CardTitle>
                <CardDescription className="text-xs">
                  Select a target loan application to upload and verify official documents.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {applications.length > 0 ? (
                  <div className="grid sm:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1.5">
                      <label className="block font-semibold text-slate-300">Target Application</label>
                      <select
                        value={selectedUploadAppId}
                        onChange={(e) => setSelectedUploadAppId(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      >
                        {applications.map((app) => (
                          <option key={app._id} value={app._id}>
                            {app.appId} ({app.bank_name} - {app.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-semibold text-slate-300">Document Type</label>
                      <select
                        value={selectedUploadDocType}
                        onChange={(e) => setSelectedUploadDocType(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      >
                        {Object.entries(DOC_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-950 p-4 border border-white/5 rounded-xl text-center text-slate-300 text-xs">
                    No active applications found. Please initialize a loan application draft to enable uploader options.
                  </div>
                )}

                {isUploadingDocCenter ? (
                  <div className="border border-white/5 rounded-xl p-6 bg-slate-950/50 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <span className="text-xs text-blue-400 font-semibold">Uploading to Cloudinary & parsing details...</span>
                  </div>
                ) : (
                  <Upload
                    onFileSelect={handleRealFileUpload}
                    className={applications.length === 0 ? 'pointer-events-none opacity-40' : ''}
                  />
                )}
              </CardContent>
            </Card>

            {}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Uploaded Files</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">File Name</TableHead>
                      <TableHead>Associated Case</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Date Uploaded</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right pr-6">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getMergedDocuments().map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="pl-6 font-medium text-white flex items-center gap-2.5 truncate max-w-[200px]">
                          <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          {d.name}
                        </TableCell>
                        <TableCell className="font-mono text-slate-300">
                          {d.isReal ? d.appId : 'Seeded Demo'}
                        </TableCell>
                        <TableCell>{d.type}</TableCell>
                        <TableCell className="text-slate-400">{d.size}</TableCell>
                        <TableCell className="text-slate-400">{d.date}</TableCell>
                        <TableCell>{getStatusBadge(d.status)}</TableCell>
                        <TableCell className="text-right pr-6 font-semibold">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                if (d.isReal) {
                                  window.open(d.url, '_blank');
                                } else {
                                  alert('Downloading seeded mock document: ' + d.name);
                                }
                              }}
                              title="Download document"
                              className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDoc(d)}
                              title="Delete document"
                              className="p-1.5 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {}
        {}
        {}
        {activeTab === 'notifications' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Notifications</h1>
                <p className="text-slate-400 text-xs">Alerts from lenders, document updates, and action tasks.</p>
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 bg-blue-500/5 px-3 py-1.5 rounded-lg border border-blue-500/10 transition-colors"
                >
                  Mark all as read
                </button>
              )}
            </div>

            {}
            <div className="space-y-3">
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'border rounded-xl p-4 transition-all flex items-start gap-3.5 justify-between relative overflow-hidden',
                      n.read ? 'bg-white/[0.01] border-white/5' : 'bg-blue-500/[0.02] border-blue-500/20'
                    )}
                  >
                    {}
                    {!n.read && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                    )}

                    <div className="flex items-start gap-3">
                      {n.type === 'success' ? (
                        <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <CheckCircle className="w-4 h-4" />
                        </div>
                      ) : n.type === 'warning' ? (
                        <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <AlertCircle className="w-4 h-4" />
                        </div>
                      ) : n.type === 'error' ? (
                        <div className="w-7 h-7 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <AlertCircle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bell className="w-4 h-4" />
                        </div>
                      )}

                      <div>
                        <p className={cn('text-xs leading-relaxed', n.read ? 'text-slate-300' : 'text-white font-medium')}>
                          {n.text}
                        </p>
                        <span className="text-[10px] text-slate-300 mt-1 block">{n.date}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => deleteNotification(n.id)}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-slate-300 transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-slate-300 space-y-2">
                    <Bell className="w-8 h-8 mx-auto text-slate-400" />
                    <p className="text-xs">Your notification inbox is currently clean.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {}
        {}
        {}
        {activeTab === 'bank_accounts' && (
          <div className="space-y-6 animate-fade-in">
            {!isLinking ? (
              
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Bank Accounts</h1>
                    <p className="text-slate-400 text-xs">Verify your corporate banking profiles to automate credit decisions.</p>
                  </div>
                  <button
                    onClick={() => {
                      setIsLinking(true);
                      setLinkStep(1);
                      setLinkError('');
                      setContactDetail('');
                      setOtpCode('');
                      setOtpTimer(120);
                      setOtpCodePreview('');
                    }}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
                  >
                    <PlusCircle className="w-4.5 h-4.5" />
                    Link Bank Account
                  </button>
                </div>

                {loadingAccounts ? (
                  <div className="flex justify-center items-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  </div>
                ) : linkedAccounts.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {linkedAccounts.map((acc) => (
                      <Card key={acc._id} className="relative overflow-hidden group">
                        <CardHeader className="pb-3 flex flex-row justify-between items-start">
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Landmark className="w-4.5 h-4.5 text-blue-400" />
                              {acc.bank_name}
                            </CardTitle>
                            <CardDescription className="text-xs capitalize">{acc.account_type} Account</CardDescription>
                          </div>
                          <button
                            onClick={() => handleUnlinkAccount(acc._id)}
                            className="text-xs text-red-500 hover:text-red-400 transition-colors p-1 bg-red-500/5 hover:bg-red-500/10 rounded-lg"
                            title="Unlink Account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </CardHeader>
                        <CardContent className="space-y-3 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-300">Account Number</span>
                            <span className="text-white font-mono font-medium">
                              {'•••• •••• ' + acc.account_number.slice(-4)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-300">IFSC Code</span>
                            <span className="text-white font-mono">{acc.ifsc_code}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-300">Linked Contact</span>
                            <span className="text-slate-300">{acc.linked_contact}</span>
                          </div>
                          <div className="border-t border-white/5 pt-2 flex justify-between items-center text-[10px]">
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Verified
                            </span>
                            <span className="text-slate-300">Linked: {acc.created_at ? new Date(acc.created_at).toISOString().split('T')[0] : 'N/A'}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center text-slate-300 space-y-3">
                      <Landmark className="w-10 h-10 mx-auto text-slate-400 animate-pulse" />
                      <h3 className="text-sm font-semibold text-white">No Corporate Bank Accounts Linked</h3>
                      <p className="text-xs max-w-sm mx-auto text-slate-400 leading-relaxed">
                        Link your corporate bank account to verify turnover and sales variables. Real-time bank assessment speeds up underwriting decisions.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              
              <Card className="max-w-xl mx-auto">
                <CardHeader className="border-b border-white/5 pb-4">
                  {}
                  <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-300 mb-2">
                    <span className={linkStep >= 1 ? 'text-blue-400' : ''}>1. SELECT BANK</span>
                    <div className="h-0.5 w-6 bg-white/5" />
                    <span className={linkStep >= 2 ? 'text-blue-400' : ''}>2. DETAILS</span>
                    <div className="h-0.5 w-6 bg-white/5" />
                    <span className={linkStep >= 3 ? 'text-blue-400' : ''}>3. OTP VERIFICATION</span>
                    <div className="h-0.5 w-6 bg-white/5" />
                    <span className={linkStep >= 4 ? 'text-blue-400' : ''}>4. LINKED</span>
                  </div>
                  <CardTitle className="text-lg">Link Corporate Bank Account</CardTitle>
                </CardHeader>

                <CardContent className="pt-6">
                  {linkError && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3.5 rounded-xl flex items-center gap-2 mb-4">
                      <AlertCircle className="w-4.5 h-4.5 flex-shrink-0" />
                      <span>{linkError}</span>
                    </div>
                  )}

                  {}
                  {linkStep === 1 && (
                    <div className="space-y-4">
                      <p className="text-xs text-slate-400">Search and select your banking institution from our partner network.</p>
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                        <input
                          type="text"
                          placeholder="Search registered banks by name..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-slate-900 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
                        />
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-2 pr-1 border border-white/5 p-2 rounded-xl bg-slate-950/50">
                        {filteredBanks.length > 0 ? (
                          filteredBanks.map((b) => (
                            <div
                              key={b.id}
                              onClick={() => handleSelectBank(b)}
                              className="p-3 bg-white/[0.01] border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/[0.02] cursor-pointer rounded-xl transition-all flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs group-hover:scale-105 transition-transform">
                                  {b.name[0]}
                                </div>
                                <div>
                                  <h4 className="text-sm font-semibold text-white">{b.name}</h4>
                                  <p className="text-[10px] text-slate-300">{b.branch} · {b.ifsc}</p>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                            </div>
                          ))
                        ) : (
                          <p className="text-center text-xs text-slate-400 py-6">No partner banks found matching your search</p>
                        )}
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => setIsLinking(false)}
                          className="px-4 py-2 border border-white/5 hover:border-white/10 text-slate-400 hover:text-white rounded-xl text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {}
                  {linkStep === 2 && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-extrabold text-sm">
                          {linkingBank.name[0]}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{linkingBank.name}</h3>
                          <p className="text-[10px] text-slate-300">IFSC: {ifscCode} · Limit: {linkingBank.limit}</p>
                        </div>
                      </div>

                      {}
                      <div className="grid grid-cols-2 gap-3">
                        <div
                          onClick={() => setLinkMode('existing')}
                          className={cn(
                            'p-3 border rounded-xl cursor-pointer transition-all text-center space-y-1',
                            linkMode === 'existing'
                              ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                              : 'bg-white/[0.01] border-white/5 text-slate-400 hover:text-white'
                          )}
                        >
                          <h4 className="text-xs font-semibold">Link Existing Account</h4>
                          <p className="text-[9px] text-slate-300 leading-normal">Link already active corporate account</p>
                        </div>
                        <div
                          onClick={() => {
                            setLinkMode('create');
                            
                            if (!accountNumber) {
                              setAccountNumber('1209' + Math.floor(10000000 + Math.random() * 90000000).toString());
                            }
                          }}
                          className={cn(
                            'p-3 border rounded-xl cursor-pointer transition-all text-center space-y-1',
                            linkMode === 'create'
                              ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                              : 'bg-white/[0.01] border-white/5 text-slate-400 hover:text-white'
                          )}
                        >
                          <h4 className="text-xs font-semibold">Open Corporate Account</h4>
                          <p className="text-[9px] text-slate-300 leading-normal">Simulate opening a new bank account</p>
                        </div>
                      </div>

                      {}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-300">
                          {linkMode === 'create' ? 'Simulated Account Number' : 'Corporate Account Number'}
                        </label>
                        <input
                          type="text"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          disabled={linkMode === 'create'}
                          placeholder="e.g. 12098492810"
                          className="w-full bg-slate-900 border border-white/5 rounded-xl px-3.5 py-2.5 text-white disabled:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all font-mono"
                        />
                      </div>

                      {}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-300">IFSC Code</label>
                        <input
                          type="text"
                          value={ifscCode}
                          onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                          placeholder="e.g. SBIN0000300"
                          className="w-full bg-slate-900 border border-white/5 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all font-mono uppercase"
                        />
                      </div>

                      {}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-300">Account Type</label>
                        <select
                          value={accountType}
                          onChange={(e) => setAccountType(e.target.value)}
                          className="w-full bg-slate-900 border border-white/5 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                        >
                          <option value="current">Current Account (Recommended for Business)</option>
                          <option value="savings">Savings Account</option>
                        </select>
                      </div>

                      {}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-300">Registered Email or Mobile (for OTP)</label>
                        <input
                          type="text"
                          value={contactDetail}
                          onChange={(e) => setContactDetail(e.target.value)}
                          placeholder="e.g. contact@sharma.in or +919876543210"
                          className="w-full bg-slate-900 border border-white/5 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                        />
                      </div>

                      {}
                      <div className="flex justify-between pt-2">
                        <button
                          onClick={() => setLinkStep(1)}
                          className="px-4 py-2 border border-white/5 hover:border-white/10 text-slate-400 hover:text-white rounded-xl text-xs transition-colors flex items-center gap-1"
                        >
                          <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                          Back
                        </button>
                        <button
                          onClick={handleSendOtp}
                          disabled={loadingLink}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold rounded-xl text-xs transition-all flex items-center gap-1"
                        >
                          {loadingLink ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              Send Verification OTP
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {}
                  {linkStep === 3 && (
                    <div className="space-y-5 text-center">
                      <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                        <Clock className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-white">Enter Verification Code</h4>
                        <p className="text-xs text-slate-400">
                          A 6-digit security OTP code was sent to <span className="font-semibold text-slate-300">{contactDetail}</span>.
                        </p>
                      </div>

                      {}
                      {otpCodePreview && (
                        <div className="bg-blue-500/5 border border-blue-500/20 text-blue-400 text-xs p-3 rounded-xl max-w-sm mx-auto text-left space-y-1 font-mono">
                          <span className="font-bold text-[10px] block text-blue-300">🔧 DEV MODE AUTO-SCOUT OTP:</span>
                          <p className="text-center font-extrabold text-sm tracking-widest">{otpCodePreview}</p>
                        </div>
                      )}

                      <div className="max-w-xs mx-auto space-y-3">
                        <input
                          type="text"
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="0 0 0 0 0 0"
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-center text-white text-lg tracking-[0.75em] pl-7 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all font-mono"
                        />

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-300">
                            {otpTimer > 0 ? (
                              `Expires in: ${Math.floor(otpTimer / 60)}:${('0' + (otpTimer % 60)).slice(-2)}`
                            ) : (
                              <span className="text-red-400">Code expired</span>
                            )}
                          </span>

                          <button
                            onClick={handleSendOtp}
                            disabled={otpTimer > 0 || loadingLink}
                            className="text-blue-400 hover:text-blue-300 disabled:text-slate-400 font-semibold disabled:cursor-not-allowed transition-colors"
                          >
                            Resend Code
                          </button>
                        </div>
                      </div>

                      <div className="flex justify-between pt-4 border-t border-white/5">
                        <button
                          onClick={() => {
                            setLinkStep(2);
                            setOtpCode('');
                            setLinkError('');
                          }}
                          className="px-4 py-2 border border-white/5 hover:border-white/10 text-slate-400 hover:text-white rounded-xl text-xs transition-colors"
                        >
                          Back to Details
                        </button>
                        <button
                          onClick={handleVerifyAndLink}
                          disabled={otpCode.length !== 6 || loadingLink}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold rounded-xl text-xs transition-all flex items-center gap-1"
                        >
                          {loadingLink ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Verifying...
                            </>
                          ) : (
                            <>
                              Verify & Link Account
                              <CheckCircle className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {}
                  {linkStep === 4 && (
                    <div className="text-center space-y-5 py-4">
                      <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                        <CheckCircle className="w-10 h-10 animate-bounce" />
                      </div>

                      <div className="space-y-1">
                        <h3 className="text-lg font-bold text-white">Bank Account Linked Successfully</h3>
                        <p className="text-xs text-slate-400">
                          Your profile for {linkingBank.name} has been synced.
                        </p>
                      </div>

                      <div className="bg-slate-900 border border-white/5 rounded-xl p-4 max-w-sm mx-auto text-left text-xs space-y-2">
                        <div className="flex justify-between">
                          <span className="text-slate-300">Bank</span>
                          <span className="text-white font-semibold">{linkingBank.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">Account Number</span>
                          <span className="text-white font-mono">
                            {'•••• •••• ' + accountNumber.slice(-4)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-300">Account Type</span>
                          <span className="text-slate-300 capitalize">{accountType}</span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          onClick={() => {
                            setIsLinking(false);
                            setLinkStep(1);
                          }}
                          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-colors"
                        >
                          Return to Bank Accounts
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

      </main>

      {/* Policy Chatbot Drawer */}
      {isPolicyChatOpen && selectedChatBank && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-slate-900 border-l border-white/5 shadow-2xl flex flex-col z-50 animate-slide-in">
          {/* Header */}
          <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              <div>
                <h3 className="font-bold text-white text-sm">{selectedChatBank.name}</h3>
                <span className="text-[10px] text-slate-400">Policy Assistant Chatbot</span>
              </div>
            </div>
            <button
              onClick={() => setIsPolicyChatOpen(false)}
              className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Policy Docs List Section */}
          <div className="px-6 py-3 border-b border-white/5 bg-slate-950/20">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Policy Documents
            </span>
            {loadingPolicies ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading active policy list...</span>
              </div>
            ) : policyDocs.length > 0 ? (
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {policyDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.01] border border-white/5 hover:border-white/10 text-xs">
                    <div className="flex items-center gap-2 truncate mr-2">
                      <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      <span className="text-white truncate font-medium">{doc.title}</span>
                    </div>
                    {doc.url && (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5 flex-shrink-0"
                      >
                        View PDF
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-slate-400 italic">No policy documents uploaded for this bank.</span>
            )}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={cn("flex gap-3 max-w-[85%] mb-2", msg.role === 'user' ? "ml-auto flex-row-reverse" : "")}>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border",
                  msg.role === 'user'
                    ? "bg-blue-600/10 border-blue-500/20 text-blue-400"
                    : "bg-slate-800 border-white/5 text-slate-300"
                )}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className="space-y-1.5 min-w-0">
                  <div className={cn(
                    "p-3 rounded-2xl text-xs leading-relaxed break-words",
                    msg.role === 'user'
                      ? "bg-blue-600 text-white rounded-tr-none"
                      : "bg-slate-800 text-slate-200 border border-white/5 rounded-tl-none prose prose-invert prose-xs max-w-none prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:border prose-pre:border-white/10"
                  )}>
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    )}
                  </div>
                  {/* Sources Badges */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 pl-1">
                      <span className="text-[9px] text-slate-400 mr-1 flex items-center">Citations:</span>
                      {msg.sources.map((src, sIdx) => (
                        <span key={sIdx} className="bg-blue-500/10 border border-blue-500/20 text-[9px] text-blue-400 font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <FileText className="w-2.5 h-2.5" />
                          {src}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sendingMessage && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/5 text-slate-300 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 animate-pulse" />
                </div>
                <div className="bg-slate-800 border border-white/5 text-slate-400 p-3 rounded-2xl rounded-tl-none text-xs flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analyzing policies...
                </div>
              </div>
            )}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSendPolicyQuery} className="p-4 border-t border-white/5 bg-slate-950/40 flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask about credit criteria, required documents..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={sendingMessage}
              className="flex-1 bg-slate-950 border border-white/5 rounded-xl px-4 py-2.5 text-white placeholder-slate-400 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all disabled:opacity-55"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || sendingMessage}
              className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white rounded-xl transition-all flex items-center justify-center flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

