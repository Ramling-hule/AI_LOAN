import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  Landmark,
  Clock,
  AlertCircle,
  TrendingUp,
  CheckCircle,
  ShieldAlert,
  Eye,
  FileText,
  MessageSquare,
  ArrowRight,
  Loader2,
  Calendar,
  Layers,
  History,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Database
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card.jsx';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { loanApi } from '@/api/loan.api.js';
import { bankApi } from '@/api/bank.api.js';
import { underwritingApi } from '@/api/underwriting.api.js';
import { extractionApi } from '@/api/extraction.api.js';
import { auditLogApi } from '@/api/auditLog.api.js';

export default function BankAdminDashboard() {
  const { user, logout, getRoleLabel } = useAuth();
  const navigate = useNavigate();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  
  const [selectedApp, setSelectedApp] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [transitionNotes, setTransitionNotes] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [missingDocs, setMissingDocs] = useState([]);
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [expandedLogs, setExpandedLogs] = useState(false);
  const [underwritingAssessment, setUnderwritingAssessment] = useState(null);
  const [loadingAssessment, setLoadingAssessment] = useState(false);
  const [assessingLoan, setAssessingLoan] = useState(false);
  const [assessmentError, setAssessmentError] = useState('');
  const [activeReviewTab, setActiveReviewTab] = useState('parameters');
  const [reevaluatingLoan, setReevaluatingLoan] = useState(false);
  const [agentTraceIndex, setAgentTraceIndex] = useState(0);

  const AGENT_TRACE_LOGS = [
    "Initializing RAG Vectorization Pipeline...",
    "Agent [Identity]: Extracting PAN, GSTIN, CIN...",
    "Agent [Financial]: Computing Annual Turnover & Net Profit...",
    "Agent [Bank]: Analyzing average monthly balances...",
    "Agent [Loan]: Auditing outstanding loan balances...",
    "Agent [Promoter]: Verifying director and shareholder records...",
    "Agent [Collateral]: Evaluating property and security assets...",
    "Agent [Verifier]: Performing secondary confidence checks...",
    "Agent [Underwriter]: Auditing against bank policy directives...",
    "Finalizing AI Risk Score and generating report..."
  ];

  useEffect(() => {
    let interval;
    if (reevaluatingLoan || assessingLoan) {
      setAgentTraceIndex(0);
      interval = setInterval(() => {
        setAgentTraceIndex((prev) => (prev < AGENT_TRACE_LOGS.length - 1 ? prev + 1 : prev));
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [reevaluatingLoan, assessingLoan]);

  
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [chatRetryAfter, setChatRetryAfter] = useState(0);
  const messagesEndRef = React.useRef(null);

  useEffect(() => {
    let timer;
    if (chatRetryAfter > 0) {
      timer = setInterval(() => {
        setChatRetryAfter(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [chatRetryAfter]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !selectedApp || chatRetryAfter > 0) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setIsChatting(true);
    try {
      const res = await loanApi.chatWithLoan(selectedApp._id, msg);
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.data.answer, sources: res.data.sources }]);
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfter = err.response.data?.retry_after || 30;
        setChatRetryAfter(Math.ceil(retryAfter));
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `⏳ I am currently processing too many requests (API Free Tier Quota exceeded).\n\nPlease wait ${Math.ceil(retryAfter)} seconds and try asking your question again.` 
        }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.response?.data?.message || err.message}` }]);
      }
    } finally {
      setIsChatting(false);
    }
  };

  useEffect(() => {
    if (activeReviewTab === 'chat' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeReviewTab]);

  
  const [extractionResult, setExtractionResult] = useState(null);
  const [loadingExtraction, setLoadingExtraction] = useState(false);
  const [triggeringExtraction, setTriggeringExtraction] = useState(false);
  const [extractionError, setExtractionError] = useState('');

  
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditSearchTerm, setAuditSearchTerm] = useState('');
  const [auditStatusFilter, setAuditStatusFilter] = useState('all');
  const [expandedAuditLogs, setExpandedAuditLogs] = useState({});

  
  const [dashboardView, setDashboardView] = useState('loans');

  
  const [policies, setPolicies] = useState([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [ruleInventory, setRuleInventory] = useState([]);
  const [loadingRuleInventory, setLoadingRuleInventory] = useState(false);
  const [underwritingAuditLogs, setUnderwritingAuditLogs] = useState([]);
  const [auditAppId, setAuditAppId] = useState('');
  const [viewingConfidentialDoc, setViewingConfidentialDoc] = useState(null);

  
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadingPolicy, setUploadingPolicy] = useState(false);
  const [uploadPolicyError, setUploadPolicyError] = useState('');
  const [showUploadPolicyForm, setShowUploadPolicyForm] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState(null);
  const [uploadContent, setUploadContent] = useState('');
  const [isModalEditing, setIsModalEditing] = useState(false);
  const [sendingPolicyNotification, setSendingPolicyNotification] = useState({});

  const auditedApp = applications.find((app) => app._id === auditAppId);

  
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewType, setPreviewType] = useState('');

  
  const fetchApplications = async () => {
    try {
      setLoading(true);
      const { data } = await loanApi.getAll({
        page: currentPage,
        limit: pageSize,
        status: statusFilter,
        search: searchTerm,
      });
      if (data.data && data.data.docs) {
        setApplications(data.data.docs);
        setTotalPages(data.data.totalPages || 1);
        setTotalItems(data.data.totalDocs || 0);
      } else {
        setApplications(data.data || []);
        setTotalPages(1);
        setTotalItems(data.data?.length || 0);
      }
    } catch (err) {
      console.error('Failed to load applications for bank:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPolicies = async () => {
    try {
      setLoadingPolicies(true);
      const { data } = await bankApi.getPolicies();
      setPolicies(data.data);
    } catch (err) {
      console.error('Failed to load bank policies:', err);
    } finally {
      setLoadingPolicies(false);
    }
  };

  const fetchRuleInventory = async () => {
    if (!user?.bank_name) return;
    try {
      setLoadingRuleInventory(true);
      const { data } = await underwritingApi.getRuleInventory(user.bank_name);
      setRuleInventory(data.data);
    } catch (err) {
      console.error('Failed to load rule inventory:', err);
    } finally {
      setLoadingRuleInventory(false);
    }
  };

  const loadExtractionResult = async (loanId) => {
    setLoadingExtraction(true);
    setExtractionError('');
    setExtractionResult(null);
    try {
      const { data } = await extractionApi.getExtractionResult(loanId);
      setExtractionResult(data.data);
    } catch (err) {
      setExtractionError(err.response?.data?.message || 'Failed to retrieve AI extraction result.');
    } finally {
      setLoadingExtraction(false);
    }
  };

  const pollQueueJob = async (jobId, actionName) => {
    let isDone = false;
    let errorMsg = '';
    let attempts = 0;
    const MAX_ATTEMPTS = 36; 
    while (!isDone && attempts < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 5000));
      attempts++;
      try {
        const res = await underwritingApi.getQueueStatus(jobId);
        const jobStatus = res.data?.data;
        if (jobStatus?.status === 'completed') {
          isDone = true;
        } else if (jobStatus?.status === 'failed') {
          isDone = true;
          errorMsg = jobStatus.error_message || jobStatus.error || `${actionName} failed.`;
        } else if (!jobStatus) {
          isDone = true;
          errorMsg = 'Lost connection to async job.';
        }
      } catch (err) {
        
        isDone = true;
        if (err.response?.status === 404) {
          errorMsg = 'Job not found in queue.';
        } else {
          errorMsg = `${actionName}: server error (${err.response?.status || 'network'}).`;
        }
      }
    }
    if (!isDone) {
      errorMsg = `${actionName} timed out after 3 minutes.`;
    }
    if (errorMsg) throw new Error(errorMsg);
  };

  const handleTriggerExtraction = async (loanId, force = false) => {
    setTriggeringExtraction(true);
    setExtractionError('');
    try {
      let data;
      if (force) {
        const res = await extractionApi.reExtractLoan(loanId);
        data = res.data;
      } else {
        const res = await extractionApi.triggerExtraction(loanId);
        data = res.data;
      }
      
      const payload = data.data;
      if (payload?.status === 'queued' && payload?.job_id) {
        await pollQueueJob(payload.job_id, 'Parameter extraction');
      }

      await loadExtractionResult(loanId);
      await fetchApplications();
    } catch (err) {
      setExtractionError(err.message || err.response?.data?.message || 'Failed to execute parameter extraction pipeline.');
    } finally {
      setTriggeringExtraction(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      const params = {
        page: auditPage,
        limit: 15,
      };
      if (auditSearchTerm) params.search = auditSearchTerm;
      if (auditStatusFilter !== 'all') params.status = auditStatusFilter;
      
      const { data } = await auditLogApi.getLogs(params);
      if (data.data && data.data.docs) {
        setAuditLogs(data.data.docs);
        setAuditTotalPages(data.data.totalPages || 1);
      } else {
        setAuditLogs([]);
        setAuditTotalPages(1);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [currentPage, statusFilter]);

  useEffect(() => {
    if (dashboardView === 'audits') {
      fetchAuditLogs();
    }
  }, [auditPage, auditStatusFilter, dashboardView]);

  useEffect(() => {
    if (user?.bank_name) {
      fetchPolicies();
      fetchRuleInventory();
    }
  }, [user?.bank_name]);

  const handleUploadPolicySubmit = async (e) => {
    e.preventDefault();
    if (!uploadTitle.trim()) {
      setUploadPolicyError('Policy title is required');
      return;
    }

    const selectedPolicy = policies.find((p) => (p._id || p.id) === editingPolicyId);
    if (!editingPolicyId && !uploadFile) {
      setUploadPolicyError('Please select a PDF document file');
      return;
    }

    if (uploadFile && !uploadFile.name.toLowerCase().endsWith('.pdf')) {
      setUploadPolicyError('Only PDF documents are allowed');
      return;
    }

    setUploadingPolicy(true);
    setUploadPolicyError('');
    try {
      if (editingPolicyId) {
        await bankApi.updatePolicy(
          editingPolicyId,
          uploadTitle.trim(),
          uploadDesc.trim(),
          uploadFile || undefined,
          selectedPolicy?.is_system_default ? uploadContent : undefined
        );
      } else {
        await bankApi.uploadPolicy(uploadTitle.trim(), uploadDesc.trim(), uploadFile);
      }
      
      setUploadTitle('');
      setUploadDesc('');
      setUploadFile(null);
      setUploadContent('');
      setEditingPolicyId(null);
      setShowUploadPolicyForm(false);
      await fetchPolicies();
    } catch (err) {
      console.error(err);
      setUploadPolicyError(err.response?.data?.message || 'Failed to process policy document');
    } finally {
      setUploadingPolicy(false);
    }
  };

  const handleStartEditPolicy = (doc) => {
    setEditingPolicyId(doc._id || doc.id);
    setUploadTitle(doc.title);
    setUploadDesc(doc.description || '');
    setUploadContent(doc.content || '');
    setUploadFile(null);
    setUploadPolicyError('');
    setShowUploadPolicyForm(true);
  };

  const handleDeletePolicy = async (id) => {
    if (!window.confirm('Are you sure you want to delete this policy document?')) return;
    try {
      await bankApi.deletePolicy(id);
      await fetchPolicies();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete policy document');
    }
  };

  const handleExtractRules = async (id) => {
    try {
      await bankApi.extractPolicyRules(id);
      alert('Extraction job submitted successfully. The rules will appear in the inventory shortly.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to extract policy rules');
    }
  };

  const handleOpenPolicyDoc = (doc) => {
    setViewingConfidentialDoc(doc._id || doc.id);
    setIsModalEditing(false);
  };

  const handleStartEditFromModal = (doc) => {
    setUploadTitle(doc.title);
    setUploadDesc(doc.description || '');
    setUploadContent(doc.content || '');
    setUploadFile(null);
    setUploadPolicyError('');
    setIsModalEditing(true);
  };

  const handleCancelEditFromModal = () => {
    setIsModalEditing(false);
    setUploadTitle('');
    setUploadDesc('');
    setUploadFile(null);
    setUploadContent('');
    setUploadPolicyError('');
  };

  const handleSaveEditFromModal = async (e) => {
    e.preventDefault();
    if (!uploadTitle.trim()) {
      setUploadPolicyError('Policy title is required');
      return;
    }

    if (uploadFile && !uploadFile.name.toLowerCase().endsWith('.pdf')) {
      setUploadPolicyError('Only PDF documents are allowed');
      return;
    }

    const selectedPolicy = policies.find((p) => (p._id || p.id) === viewingConfidentialDoc);
    setUploadingPolicy(true);
    setUploadPolicyError('');
    try {
      await bankApi.updatePolicy(
        viewingConfidentialDoc,
        uploadTitle.trim(),
        uploadDesc.trim(),
        uploadFile || undefined,
        selectedPolicy?.is_system_default ? uploadContent : undefined
      );
      
      setUploadTitle('');
      setUploadDesc('');
      setUploadFile(null);
      setUploadContent('');
      setIsModalEditing(false);
      await fetchPolicies();
    } catch (err) {
      console.error(err);
      setUploadPolicyError(err.response?.data?.message || 'Failed to update policy document');
    } finally {
      setUploadingPolicy(false);
    }
  };

  const loadHistoryLogs = async (appId) => {
    try {
      setLoadingHistory(true);
      const { data } = await loanApi.getHistory(appId);
      setHistoryLogs(data.data);
    } catch (err) {
      console.error('Failed to fetch history logs:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const parseAssessment = (payload) => {
    if (typeof payload === 'string') {
      try { return JSON.parse(payload); } catch(e) { return payload; }
    }
    return payload;
  };

  const loadUnderwritingReport = async (loanId) => {
    setLoadingAssessment(true);
    setAssessmentError('');
    setUnderwritingAssessment(null);
    try {
      const { data } = await underwritingApi.getReport(loanId);
      setUnderwritingAssessment(parseAssessment(data.data?.assessment || data.data));
    } catch (err) {
      if (err.response?.status === 404) {
        setUnderwritingAssessment(null);
      } else {
        setAssessmentError(err.response?.data?.message || 'Failed to fetch AI underwriting report.');
      }
    } finally {
      setLoadingAssessment(false);
    }
  };

  const handleAssessLoan = async (loanId) => {
    setAssessingLoan(true);
    setAssessmentError('');
    try {
      const { data } = await underwritingApi.assessLoan(loanId);
      const payload = data.data?.assessment || data.data;
      if (payload?.status === 'queued' && payload?.job_id) {
        await pollQueueJob(payload.job_id, 'Underwriting assessment');
        await loadUnderwritingReport(loanId);
      } else {
        setUnderwritingAssessment(parseAssessment(payload));
      }
      await fetchApplications();
    } catch (err) {
      setAssessmentError(err.message || err.response?.data?.message || 'AI Underwriting evaluation failed.');
    } finally {
      setAssessingLoan(false);
    }
  };

  const handleReevaluateLoan = async (loanId) => {
    setReevaluatingLoan(true);
    setAssessmentError('');
    try {
      const { data } = await underwritingApi.reevaluateLoan(loanId);
      const payload = data.data?.assessment || data.data;
      if (payload?.status === 'queued' && payload?.job_id) {
        await pollQueueJob(payload.job_id, 'Re-evaluation pipeline');
        await loadUnderwritingReport(loanId);
      } else {
        setUnderwritingAssessment(parseAssessment(payload));
      }
      await loadExtractionResult(loanId);
      await fetchApplications();
    } catch (err) {
      setAssessmentError(err.message || err.response?.data?.message || 'AI Credit re-evaluation workflow failed.');
    } finally {
      setReevaluatingLoan(false);
    }
  };

  const handleNotifyPolicyIssue = async (policyTitle, details) => {
    if (!selectedApp?._id) return;
    setSendingPolicyNotification(prev => ({ ...prev, [policyTitle]: true }));
    try {
      await underwritingApi.notifyPolicyIssue(selectedApp._id, policyTitle, details);
      alert(`Policy compliance issue notification sent to user for "${policyTitle}". Application status transitioned to Missing Info.`);
      await fetchApplications();
      setSelectedApp(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send policy issue notification');
    } finally {
      setSendingPolicyNotification(prev => ({ ...prev, [policyTitle]: false }));
    }
  };

  const handleBypassPolicyApprove = async (policyTitle, details) => {
    if (!selectedApp?._id) return;
    if (!window.confirm(`Are you sure you want to bypass policy "${policyTitle}" and approve this loan application? This action will be recorded in the audit trail.`)) {
      return;
    }
    try {
      await loanApi.changeStatus(
        selectedApp._id,
        'approved',
        `Bypassed compliance policy "${policyTitle}": ${details}. Underwriter manually approved.`
      );
      alert(`Loan application approved and policy "${policyTitle}" bypassed.`);
      await fetchApplications();
      setSelectedApp(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to bypass and approve loan');
    }
  };

  const loadUnderwritingAuditLogs = async (loanId) => {
    try {
      const { data } = await underwritingApi.getUnderwritingAuditLogs(loanId);
      const flattenedLogs = data.data?.flatMap((dbLog) => {
        return (dbLog.rule_evaluations || []).map((evalItem, idx) => ({
          ...evalItem,
          id: `${dbLog.id}-${idx}`,
          created_at: dbLog.created_at,
          result: evalItem.status,
          engine: evalItem.engine || 'System',
          policy_id: evalItem.policy_id,
          rule_name: evalItem.rule_name || evalItem.policy_name,
          rule_id: evalItem.rule_id,
          metadata: {
            reason: evalItem.reason,
            applicant_value: evalItem.applicant_value,
            ...evalItem.metadata
          }
        }));
      }) || [];
      setUnderwritingAuditLogs(flattenedLogs);
    } catch (err) {
      console.error('Failed to fetch underwriting audit logs:', err);
    }
  };

  const handleOpenReview = (app) => {
    setSelectedApp(app);
    setNextStatus('');
    setTransitionNotes('');
    setMissingDocs([]);
    setStatusError('');
    setExpandedLogs(false);
    setActiveReviewTab('parameters');
    setUnderwritingAssessment(null);
    setLoadingAssessment(false);
    setAssessingLoan(false);
    setReevaluatingLoan(false);
    setAssessmentError('');
    loadHistoryLogs(app._id);
    loadUnderwritingAuditLogs(app._id);
  };

  const handleStatusChangeSubmit = async (e) => {
    e.preventDefault();
    if (!nextStatus) {
      setStatusError('Please select a target status');
      return;
    }
    if (!transitionNotes.trim()) {
      setStatusError('Administrative notes are required for status transitions');
      return;
    }
    if (nextStatus === 'missing_info' && missingDocs.length === 0) {
      setStatusError('Please select at least one missing document');
      return;
    }

    setSubmittingStatus(true);
    setStatusError('');
    try {
      const { data } = await loanApi.changeStatus(
        selectedApp._id,
        nextStatus,
        transitionNotes,
        missingDocs
      );

      
      setSelectedApp(data.data);
      
      await fetchApplications();
      
      await loadHistoryLogs(selectedApp._id);

      
      setNextStatus('');
      setTransitionNotes('');
      setMissingDocs([]);
    } catch (err) {
      console.error(err);
      setStatusError(err.response?.data?.message || 'Failed to update status transition');
    } finally {
      setSubmittingStatus(false);
    }
  };

  const toggleMissingDocCheckbox = (docType) => {
    setMissingDocs((prev) =>
      prev.includes(docType) ? prev.filter((d) => d !== docType) : [...prev, docType]
    );
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  
  const nonDraftApps = applications.filter((app) => app.status !== 'draft');
  const inboxCount = nonDraftApps.filter((app) =>
    ['submitted', 'eligibility_check', 'agent_review', 'missing_info'].includes(app.status)
  ).length;
  const approvedCount = nonDraftApps.filter((app) => app.status === 'approved').length;
  const rejectedCount = nonDraftApps.filter((app) => app.status === 'rejected').length;

  const avgRiskScore = nonDraftApps.length > 0
    ? Math.round(nonDraftApps.reduce((sum, app) => sum + (app.risk_score || 600), 0) / nonDraftApps.length)
    : 'N/A';

  
  const getStatusBadge = (status) => {
    const configs = {
      draft: { style: 'bg-slate-500/10 text-slate-400 border-slate-500/20', label: 'Draft' },
      submitted: { style: 'bg-blue-500/10 text-blue-400 border-blue-500/20', label: 'Submitted' },
      eligibility_check: { style: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', label: 'Eligibility Check' },
      agent_review: { style: 'bg-purple-500/10 text-purple-400 border-purple-500/20', label: 'Agent Review' },
      missing_info: { style: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Missing Info' },
      approved: { style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Approved' },
      rejected: { style: 'bg-rose-500/10 text-rose-400 border-rose-500/20', label: 'Rejected' },
      disbursed: { style: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', label: 'Disbursed' },
    };
    const c = configs[status] || { style: 'bg-slate-500/10 text-slate-400 border-slate-500/20', label: status };
    return <Badge className={`${c.style} capitalize`}>{c.label}</Badge>;
  };

  
  const getValidNextStatuses = (status) => {
    const VALID_TRANSITIONS = {
      submitted: [
        { value: 'eligibility_check', label: 'Under Eligibility Check' },
        { value: 'rejected', label: 'Reject Application' },
      ],
      eligibility_check: [
        { value: 'agent_review', label: 'Under Agent Review' },
        { value: 'missing_info', label: 'Flag Missing Information' },
        { value: 'rejected', label: 'Reject Application' },
      ],
      missing_info: [
        { value: 'rejected', label: 'Reject Application' },
      ],
      agent_review: [
        { value: 'approved', label: 'Approve Application' },
        { value: 'missing_info', label: 'Flag Missing Information' },
        { value: 'rejected', label: 'Reject Application' },
      ],
      approved: [
        { value: 'disbursed', label: 'Disburse Funds' },
        { value: 'rejected', label: 'Reject Application' },
      ],
    };
    return VALID_TRANSITIONS[status] || [];
  };

  
  const openPreview = (doc) => {
    if (!doc?.url) return;
    setPreviewUrl(doc.url);
    setPreviewTitle(doc.filename);
    setPreviewType(doc.mimetype);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
      {}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      {}
      <header className="border-b border-white/5 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-white tracking-tight text-sm">CapitalScale</span>
              <span className="text-[10px] block text-slate-300 leading-none">Underwriter Command</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-semibold text-white">
                {user?.admin_name}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full mt-0.5">
                {getRoleLabel()}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/5 hover:border-red-500/30 hover:bg-red-500/5 text-slate-400 hover:text-red-400 text-xs transition-all font-semibold"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 relative z-10">
        
        {}
        <div className="bg-gradient-to-r from-emerald-600/10 via-teal-600/5 to-transparent border border-white/5 rounded-3xl p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Underwriter Command Center</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Active Evaluation Queue</h1>
            <p className="text-slate-400 text-xs max-w-lg font-medium leading-relaxed">
              Analyze applicant profiles, audit submitted tax balance sheets, log transition notes, and flag missing records.
            </p>
          </div>
        </div>

        {}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <span className="text-[10px] text-slate-300 font-bold tracking-wider uppercase">Active Pipeline</span>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{inboxCount}</span>
              <span className="text-[9px] text-amber-400 font-bold uppercase bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Active</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <span className="text-[10px] text-slate-300 font-bold tracking-wider uppercase">Approvals (Total)</span>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{approvedCount}</span>
              <span className="text-[9px] text-emerald-400 font-bold uppercase bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">Approved</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <span className="text-[10px] text-slate-300 font-bold tracking-wider uppercase">Rejected (Total)</span>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{rejectedCount}</span>
              <span className="text-[9px] text-red-400 font-bold uppercase bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">Declined</span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <span className="text-[10px] text-slate-300 font-bold tracking-wider uppercase">Avg Credit Rating</span>
            </CardHeader>
            <CardContent className="p-4 pt-0 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{avgRiskScore}</span>
              <span className="text-[9px] text-blue-400 font-bold uppercase bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">AI Scored</span>
            </CardContent>
          </Card>
        </div>

        {}
        <div className="flex items-center gap-2 p-1 bg-slate-900/60 border border-white/5 rounded-2xl w-fit relative z-10">
          <button
            onClick={() => setDashboardView('loans')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              dashboardView === 'loans'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            Loan Vetting Pipeline
          </button>
          <button
            onClick={() => {
              setDashboardView('audits');
              fetchAuditLogs();
            }}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              dashboardView === 'audits'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4.5 h-4.5" />
            Security Audit Trail
          </button>
        </div>

        {dashboardView === 'loans' ? (
          <>
            {}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex">
            {}
            <Card className="w-full flex flex-col justify-between">
              <CardHeader className="pb-3 border-b border-white/5 py-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-emerald-400" />
                  Partner Branch Office Details
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-xs p-5 flex-1 align-middle">
                <div>
                  <span className="text-slate-300 block text-[10px] uppercase tracking-wider font-semibold">Officer In-Charge</span>
                  <span className="text-slate-200 font-semibold">{user?.admin_name}</span>
                </div>
                <div>
                  <span className="text-slate-300 block text-[10px] uppercase tracking-wider font-semibold">Bank Entity</span>
                  <span className="text-slate-200 font-semibold">{user?.bank_name}</span>
                </div>
                <div className="col-span-2 border-t border-white/5 pt-2">
                  <span className="text-slate-300 block text-[10px] uppercase tracking-wider font-semibold">Branch Office</span>
                  <span className="text-slate-200">{user?.branch_name}</span>
                </div>
                <div className="col-span-2 border-t border-white/5 pt-2">
                  <span className="text-slate-300 block text-[10px] uppercase tracking-wider font-semibold">Branch IFSC</span>
                  <span className="text-slate-200 font-mono text-[10px]">{user?.ifsc_code}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            {}
            <Card className="h-full">
              <CardHeader className="pb-3 border-b border-white/5 flex flex-row items-center justify-between py-4">
                <div>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldAlert className="w-4.5 h-4.5 text-amber-500" />
                    Confidential Credit Rules & Policies
                  </CardTitle>
                  <CardDescription className="text-[10px] text-red-400 uppercase tracking-widest font-bold mt-0.5">
                    Bank Internal Restrictive Directives
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                  
                  {}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-white/5 pb-1">
                      <h5 className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">
                        Confidential Policy Documents
                      </h5>
                      {!showUploadPolicyForm && (
                        <button
                          onClick={() => {
                            setShowUploadPolicyForm(true);
                            setUploadPolicyError('');
                          }}
                          className="text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider transition-colors"
                        >
                          + Upload Policy
                        </button>
                      )}
                    </div>

                    {showUploadPolicyForm ? (
                      <form onSubmit={handleUploadPolicySubmit} className="bg-slate-950 p-4 border border-white/5 rounded-xl space-y-3">
                        <span className="block font-bold text-slate-200 text-[10px] uppercase tracking-wider">
                          {editingPolicyId ? 'Edit Underwriting Guidelines' : 'Upload Underwriting Guidelines'}
                        </span>
                        
                        {uploadPolicyError && (
                          <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded-lg">
                            {uploadPolicyError}
                          </div>
                        )}

                        <div className="space-y-1">
                          <label className="block text-[9px] text-slate-400 uppercase tracking-wider">Policy Title</label>
                          <input
                            type="text"
                            value={uploadTitle}
                            onChange={(e) => setUploadTitle(e.target.value)}
                            placeholder="e.g. Real Estate Risk Limits"
                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[9px] text-slate-400 uppercase tracking-wider">Description (Optional)</label>
                          <input
                            type="text"
                            value={uploadDesc}
                            onChange={(e) => setUploadDesc(e.target.value)}
                            placeholder="Brief purpose of document"
                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[9px] text-slate-400 uppercase tracking-wider">
                            {editingPolicyId ? 'Replacement File (Optional - PDF format only)' : 'Document File (PDF format only)'}
                          </label>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => setUploadFile(e.target.files[0])}
                            className="w-full text-slate-300 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-white/15 file:text-white file:text-xs file:font-semibold hover:file:bg-white/25 cursor-pointer file:cursor-pointer"
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowUploadPolicyForm(false);
                              setUploadTitle('');
                              setUploadDesc('');
                              setUploadFile(null);
                              setUploadContent('');
                              setEditingPolicyId(null);
                            }}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs font-semibold"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={uploadingPolicy}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                          >
                            {uploadingPolicy ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Processing policy embeddings...
                              </>
                            ) : (
                              editingPolicyId ? 'Save Changes' : 'Upload'
                            )}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                        {loadingPolicies ? (
                          <div className="flex justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                          </div>
                        ) : policies.length > 0 ? (
                          policies.map((doc) => (
                            <div 
                              key={doc._id || doc.id} 
                              onClick={() => handleOpenPolicyDoc(doc)}
                              className="bg-slate-950 p-4 border border-white/5 hover:border-white/10 rounded-xl space-y-1.5 flex flex-col justify-between cursor-pointer hover:bg-white/[0.01] transition-all group"
                            >
                              <div>
                                <div className="flex justify-between items-start gap-2">
                                  <span className="font-semibold text-slate-200 leading-snug group-hover:text-blue-400 transition-colors">{doc.title}</span>
                                  <Badge className={doc.is_system_default ? "bg-red-500/10 text-red-400 border-red-500/20 text-[8px] uppercase tracking-wider font-bold flex-shrink-0" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[8px] uppercase tracking-wider font-bold flex-shrink-0"}>
                                    {doc.is_system_default ? 'Restricted' : 'Custom'}
                                  </Badge>
                                </div>
                                <span className="text-[9px] text-slate-400 block font-mono">
                                  {doc.is_system_default ? (doc._id === 'sme_underwriting_policy' ? 'Ref: SME-CR-2026-v4' : doc._id === 'risk_appetite_limits' ? 'Ref: BOARD-RA-2026' : 'Ref: KYC-COMP-2026') : `Uploaded by: ${doc.uploaded_by_name}`}
                                </span>
                                {doc.description && (
                                  <p className="text-[11px] text-slate-300 leading-normal mt-1">{doc.description}</p>
                                )}
                              </div>
                              <div className="flex justify-between items-center mt-2 border-t border-white/5 pt-1.5">
                                <span className="text-blue-400 group-hover:text-blue-300 font-semibold flex items-center gap-1 text-[11px] transition-colors">
                                  {doc.is_system_default ? 'Open Document Reader' : 'Open PDF File'}
                                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                </span>
                                <div className="flex gap-3 items-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleExtractRules(doc._id || doc.id);
                                    }}
                                    className="text-purple-400 hover:text-purple-300 font-semibold text-[11px] transition-colors"
                                  >
                                    Extract Rules
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartEditPolicy(doc);
                                    }}
                                    className="text-amber-400 hover:text-amber-300 font-semibold text-[11px] transition-colors"
                                  >
                                    Edit
                                  </button>
                                  {!doc.is_system_default && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeletePolicy(doc._id || doc.id);
                                      }}
                                      className="text-red-400 hover:text-red-300 font-semibold text-[11px] transition-colors"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-6 text-slate-400 italic">No policy documents configured.</div>
                        )}
                      </div>
                    )}
                  </div>

                  {}
                  <div className="space-y-4 md:border-l md:border-white/5 md:pl-6">
                    <h5 className="font-bold text-slate-300 border-b border-white/5 pb-1 uppercase tracking-wider text-[10px] flex justify-between">
                      <span>Live Policy Auditor Widget</span>
                      <span className="text-[9px] text-emerald-400 font-normal">Automated Checks</span>
                    </h5>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="block text-[10px] text-slate-300 uppercase tracking-wider">Select Case File to Audit</label>
                        <select
                          value={auditAppId}
                          onChange={(e) => setAuditAppId(e.target.value)}
                          className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                        >
                          <option value="">Select active application...</option>
                          {nonDraftApps.map((app) => (
                            <option key={app._id} value={app._id}>
                              {app.sme_id?.business_name || 'SME Applicant'} (₹{(app.amount / 100000).toFixed(1)}L)
                            </option>
                          ))}
                        </select>
                      </div>

                      {auditedApp ? (
                        <div className="bg-slate-950 p-4 border border-white/5 rounded-2xl space-y-3">
                          <div className="flex justify-between items-center pb-2 border-b border-white/5">
                            <span className="font-bold text-slate-200 truncate">{auditedApp.sme_id?.business_name}</span>
                            <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px]">Score: {auditedApp.risk_score}</Badge>
                          </div>

                          {}
                          <div className="space-y-2 text-[11px]">
                            {}
                            <div className="flex justify-between items-start">
                              <div className="pr-2">
                                <span className="text-slate-300 block font-medium">1. Annual Turnover (Min ₹50L)</span>
                                <span className="text-[10px] text-slate-400 block">Actual: ₹{auditedApp.financial_info?.annual_turnover ? auditedApp.financial_info.annual_turnover.toLocaleString() : '0'}</span>
                              </div>
                              <span>
                                {auditedApp.financial_info?.annual_turnover >= 5000000 ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-bold">PASS</Badge>
                                ) : (
                                  <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] font-bold">FAIL</Badge>
                                )}
                              </span>
                            </div>

                            {}
                            <div className="flex justify-between items-start">
                              <div className="pr-2">
                                <span className="text-slate-300 block font-medium">2. Credit Risk Score (Min 650)</span>
                                <span className="text-[10px] text-slate-400 block">Actual: {auditedApp.risk_score || 'N/A'}</span>
                              </div>
                              <span>
                                {auditedApp.risk_score >= 650 ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-bold">PASS</Badge>
                                ) : (
                                  <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] font-bold">FAIL</Badge>
                                )}
                              </span>
                            </div>

                            {}
                            <div className="flex justify-between items-start">
                              <div className="pr-2">
                                <span className="text-slate-300 block font-medium">3. Collateral Check (&gt;₹25L)</span>
                                <span className="text-[10px] text-slate-400 block truncate max-w-[150px]">Amt: ₹{auditedApp.amount?.toLocaleString()} ({auditedApp.documents?.loan_documents ? 'Uploaded' : 'Missing'})</span>
                              </div>
                              <span>
                                {auditedApp.amount < 2500000 ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-bold">EXEMPT</Badge>
                                ) : auditedApp.documents?.loan_documents ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-bold">PASS</Badge>
                                ) : (
                                  <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] font-bold">FAIL</Badge>
                                )}
                              </span>
                            </div>

                            {}
                            <div className="flex justify-between items-start">
                              <div className="pr-2">
                                <span className="text-slate-300 block font-medium">4. Core KYC Documents</span>
                                <span className="text-[10px] text-slate-400 block">PAN, AADHAAR, GST, Bank Statements</span>
                              </div>
                              <span>
                                {auditedApp.documents?.pan && auditedApp.documents?.aadhaar && auditedApp.documents?.gst_certificate && auditedApp.documents?.bank_statements ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-bold">PASS</Badge>
                                ) : (
                                  <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] font-bold">FAIL</Badge>
                                )}
                              </span>
                            </div>
                          </div>

                          {}
                          <div className={`mt-3 p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 ${
                            auditedApp.financial_info?.annual_turnover >= 5000000 &&
                            auditedApp.risk_score >= 650 &&
                            (auditedApp.amount < 2500000 || auditedApp.documents?.loan_documents) &&
                            (auditedApp.documents?.pan && auditedApp.documents?.aadhaar && auditedApp.documents?.gst_certificate && auditedApp.documents?.bank_statements)
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/10 border-red-500/20 text-red-400'
                          }`}>
                            <span className="font-extrabold uppercase text-[10px] tracking-wider">Audit Result</span>
                            <span className="text-[11px] font-semibold leading-snug">
                              {auditedApp.financial_info?.annual_turnover >= 5000000 &&
                              auditedApp.risk_score >= 650 &&
                              (auditedApp.amount < 2500000 || auditedApp.documents?.loan_documents) &&
                              (auditedApp.documents?.pan && auditedApp.documents?.aadhaar && auditedApp.documents?.gst_certificate && auditedApp.documents?.bank_statements)
                                ? '🟢 RECOMMEND APPROVAL (Eligible)'
                                : '🔴 MANUAL VERIFY / DEFEAT RECOMMENDED'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-950 p-6 border border-white/5 border-dashed rounded-2xl text-center text-slate-400 leading-normal">
                          Select an active loan case to run eligibility criteria checklist.
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bank Policy Rule Inventory Viewer */}
        <div className="mt-6">
          <Card className="w-full">
            <CardHeader className="pb-3 border-b border-white/5 py-4 flex flex-row justify-between items-center">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="w-4.5 h-4.5 text-blue-400" />
                  Bank Extracted Rule Inventory
                </CardTitle>
                <CardDescription className="text-[10px] text-slate-400 mt-1">
                  Database of automated checks derived from uploaded policy documents
                </CardDescription>
              </div>
              {loadingRuleInventory && (
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[300px] overflow-y-auto">
                <Table className="w-full text-xs">
                  <TableHeader className="bg-slate-900/50 sticky top-0 z-10">
                    <TableRow className="border-white/5 hover:bg-transparent">
                      <TableHead className="text-[9px] font-bold uppercase tracking-wider text-slate-400 h-8">Rule ID</TableHead>
                      <TableHead className="text-[9px] font-bold uppercase tracking-wider text-slate-400 h-8">Rule Name</TableHead>
                      <TableHead className="text-[9px] font-bold uppercase tracking-wider text-slate-400 h-8">Type</TableHead>
                      <TableHead className="text-[9px] font-bold uppercase tracking-wider text-slate-400 h-8">Parameters</TableHead>
                      <TableHead className="text-[9px] font-bold uppercase tracking-wider text-slate-400 h-8">Condition</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ruleInventory.length > 0 ? (
                      ruleInventory.map((rule) => (
                        <TableRow key={rule.id || rule.rule_id} className="border-white/5 hover:bg-white/[0.02]">
                          <TableCell className="font-mono text-[9px] text-slate-500">{(rule.rule_id || rule.id || '').substring(0, 8)}</TableCell>
                          <TableCell className="font-medium text-slate-300">{rule.parameter || rule.rule_name || <span className="text-slate-600 italic">—</span>}</TableCell>
                          <TableCell>
                            <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[8px] uppercase">
                              {rule.rule_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {rule.parameter ? (
                              <div className="text-[9px]">
                                <span className="font-mono text-emerald-400">{rule.category || 'General'}</span>
                                {rule.policy_section && (
                                  <div className="text-slate-500 mt-0.5">§ {rule.policy_section}</div>
                                )}
                                {rule.policy_page != null && (
                                  <div className="text-slate-500 mt-0.5">Page {rule.policy_page}</div>
                                )}
                              </div>
                            ) : (
                              Object.entries(rule.parameters || {}).map(([key, val]) => (
                                <div key={key} className="flex gap-2 text-[9px]">
                                  <span className="font-mono text-emerald-400">{key}:</span>
                                  <span>{val}</span>
                                </div>
                              ))
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-[9px] text-slate-500 bg-slate-950 p-2 rounded truncate max-w-[200px]">
                            {rule.description || rule.condition_expression}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-slate-500 italic">
                          No automated rules extracted. Upload policy documents and run extraction.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {}
        <div className="flex flex-col sm:flex-row gap-4 bg-slate-900/60 border border-white/5 p-4 rounded-2xl relative z-10">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              setCurrentPage(1);
              fetchApplications();
            }} 
            className="flex-1 flex gap-2"
          >
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search applicant's business name, promoter, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-4 pr-4 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center"
            >
              Search
            </button>
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                  loanApi.getAll({
                    page: 1,
                    limit: pageSize,
                    status: statusFilter,
                    search: '',
                  }).then(({ data }) => {
                    if (data.data && data.data.docs) {
                      setApplications(data.data.docs);
                      setTotalPages(data.data.totalPages || 1);
                      setTotalItems(data.data.totalDocs || 0);
                    }
                  });
                }}
                className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-bold text-xs transition-all flex items-center justify-center"
              >
                Clear
              </button>
            )}
          </form>
          <div className="w-full sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all cursor-pointer font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="eligibility_check">Eligibility Check</option>
              <option value="agent_review">Agent Review</option>
              <option value="missing_info">Missing Info</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="disbursed">Disbursed</option>
            </select>
          </div>
        </div>

        {}
        <Card>
          <CardHeader className="border-b border-white/5 flex flex-row items-center justify-between py-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="w-4.5 h-4.5 text-emerald-400" />
              Underwriting Evaluation Queue
            </CardTitle>
            <span className="text-[10px] text-slate-300 font-bold tracking-wider uppercase animate-pulse">Auto-refreshing</span>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">SME Applicant</TableHead>
                  <TableHead>Principal Amount</TableHead>
                  <TableHead>Risk Rating</TableHead>
                  <TableHead>Submission Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nonDraftApps.length > 0 ? (
                  nonDraftApps.map((app) => (
                    <TableRow key={app._id} className="hover:bg-white/[0.01] transition-colors">
                      <TableCell className="pl-6 font-medium text-white">
                        <div>
                          <p className="font-semibold text-slate-200">{app.sme_id?.business_name || 'SME Applicant'}</p>
                          <p className="text-[10px] text-slate-300 font-normal">By: {app.sme_id?.full_name || 'User'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-200">
                        ₹{app.amount ? app.amount.toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>
                        {app.risk_score ? (
                          app.risk_score >= 700 ? (
                            <Badge variant="success">{app.risk_score} - Low Risk</Badge>
                          ) : app.risk_score >= 600 ? (
                            <Badge variant="warning">{app.risk_score} - Med Risk</Badge>
                          ) : (
                            <Badge variant="destructive">{app.risk_score} - High Risk</Badge>
                          )
                        ) : (
                          <Badge variant="secondary">Scoring...</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {app.created_at ? new Date(app.created_at).toISOString().split('T')[0] : 'N/A'}
                      </TableCell>
                      <TableCell>{getStatusBadge(app.status)}</TableCell>
                      <TableCell className="text-right pr-6">
                        <button
                          onClick={() => handleOpenReview(app)}
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl transition-all flex items-center gap-1 ml-auto"
                        >
                          Review Case
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-slate-300 text-xs">
                      No loan requests currently in the queue.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border border-white/5 px-6 py-4 bg-slate-900/20 rounded-2xl relative z-10">
            <span className="text-xs text-slate-400">
              Showing Page <span className="font-semibold text-white">{currentPage}</span> of <span className="font-semibold text-white">{totalPages}</span> (Total Applications: <span className="font-semibold text-white">{totalItems}</span>)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3.5 py-1.5 bg-slate-900 border border-white/5 hover:border-white/10 hover:bg-white/[0.02] disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-300 rounded-xl text-xs font-semibold transition-all"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3.5 py-1.5 bg-slate-900 border border-white/5 hover:border-white/10 hover:bg-white/[0.02] disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-300 rounded-xl text-xs font-semibold transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </>
    ) : (
      
      <div className="space-y-6 relative z-10 animate-fade-in">
        {}
        <div className="flex flex-col sm:flex-row gap-4 bg-slate-900/60 border border-white/5 p-4 rounded-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAuditPage(1);
              fetchAuditLogs();
            }}
            className="flex-1 flex gap-2"
          >
            <input
              type="text"
              placeholder="Search audit logs by actor email, action, resource ID..."
              value={auditSearchTerm}
              onChange={(e) => setAuditSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-xs transition-all"
            >
              Search
            </button>
            {auditSearchTerm && (
              <button
                type="button"
                onClick={() => {
                  setAuditSearchTerm('');
                  setAuditPage(1);
                  auditLogApi.getLogs({
                    page: 1,
                    limit: 15,
                    status: auditStatusFilter,
                    search: '',
                  }).then(({ data }) => {
                    if (data.data && data.data.docs) {
                      setAuditLogs(data.data.docs);
                      setAuditTotalPages(data.data.totalPages || 1);
                    }
                  });
                }}
                className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-bold text-xs transition-all flex items-center justify-center"
              >
                Clear
              </button>
            )}
          </form>
          <div className="w-full sm:w-48">
            <select
              value={auditStatusFilter}
              onChange={(e) => {
                setAuditStatusFilter(e.target.value);
                setAuditPage(1);
              }}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all font-semibold cursor-pointer"
            >
              <option value="all">All Outcomes</option>
              <option value="success">Success Only</option>
              <option value="failure">Failure Only</option>
            </select>
          </div>
        </div>

        {}
        <Card>
          <CardHeader className="border-b border-white/5 py-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4.5 h-4.5 text-emerald-400" />
              Immutable Compliance Audit Logs
            </CardTitle>
            <CardDescription className="text-[10px] text-slate-400 font-mono">
              Click any log entry row to expand full JSON payload and request metadata.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>HTTP Route</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAudit ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
                      <span className="block mt-2 text-xs">Loading activity logs...</span>
                    </TableCell>
                  </TableRow>
                ) : auditLogs.length > 0 ? (
                  auditLogs.map((log) => {
                    const isExpanded = !!expandedAuditLogs[log._id];
                    return (
                      <React.Fragment key={log._id}>
                        <TableRow
                          onClick={() => setExpandedAuditLogs(prev => ({ ...prev, [log._id]: !isExpanded }))}
                          className="hover:bg-white/[0.01] transition-colors cursor-pointer select-none"
                        >
                          <TableCell className="pl-6 font-mono text-[10px] text-slate-400">
                            {new Date(log.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-semibold text-slate-200">
                            {log.actor_email || log.actor_id}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-slate-900 border-white/5 text-[9px] font-mono font-bold uppercase text-slate-300">
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-[10px] text-slate-300">
                            <span className="text-blue-400 font-bold mr-1">{log.method}</span>
                            {log.resource_path}
                          </TableCell>
                          <TableCell>
                            {log.status === 'success' ? (
                              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]">
                                SUCCESS ({log.status_code})
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px]">
                                FAILED ({log.status_code || 'ERR'})
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-slate-950/45 hover:bg-slate-950/45">
                            <TableCell colSpan={5} className="p-4 border-t border-white/5">
                              <div className="grid md:grid-cols-2 gap-4 text-[10px] text-slate-300 font-medium">
                                <div>
                                  <span className="block text-slate-400 uppercase tracking-wider mb-1 font-bold">Request Context</span>
                                  <div className="bg-slate-950 p-3 border border-white/5 rounded-xl space-y-1.5">
                                    <p><span className="text-slate-500 font-bold">IP Address:</span> <span className="font-mono text-white">{log.ip_address || '—'}</span></p>
                                    <p><span className="text-slate-500 font-bold">User Agent:</span> <span className="text-white truncate block max-w-sm">{log.user_agent || '—'}</span></p>
                                    <p><span className="text-slate-500 font-bold">Resource Reference:</span> <span className="text-white">{log.resource_model} (ID: {log.resource_id})</span></p>
                                  </div>
                                </div>
                                <div>
                                  <span className="block text-slate-400 uppercase tracking-wider mb-1 font-bold">State Payload / Errors</span>
                                  <div className="bg-slate-950 p-3 border border-white/5 rounded-xl space-y-1.5">
                                    {log.error_message && (
                                      <p><span className="text-red-400 font-semibold font-bold">Error Logged:</span> <span className="text-red-300 font-mono">{log.error_message}</span></p>
                                    )}
                                    {log.previous_state && (
                                      <div>
                                        <span className="text-slate-500 font-bold block mb-0.5">Previous State:</span>
                                        <pre className="text-white bg-slate-900 p-2 rounded text-[9px] overflow-x-auto font-mono max-h-24">{JSON.stringify(log.previous_state, null, 2)}</pre>
                                      </div>
                                    )}
                                    {log.new_state && (
                                      <div className="mt-1.5">
                                        <span className="text-slate-500 font-bold block mb-0.5">New State:</span>
                                        <pre className="text-white bg-slate-900 p-2 rounded text-[9px] overflow-x-auto font-mono max-h-24">{JSON.stringify(log.new_state, null, 2)}</pre>
                                      </div>
                                    )}
                                    {!log.error_message && !log.previous_state && !log.new_state && (
                                      <p className="italic text-slate-500">No extra state payload logged for this transaction</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-slate-400">
                      No matching audit log records found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {}
        {auditTotalPages > 1 && (
          <div className="flex items-center justify-between border border-white/5 px-6 py-4 bg-slate-900/20 rounded-2xl">
            <span className="text-xs text-slate-400">
              Showing Page <span className="font-semibold text-white">{auditPage}</span> of <span className="font-semibold text-white">{auditTotalPages}</span>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setAuditPage(prev => Math.max(prev - 1, 1))}
                disabled={auditPage === 1}
                className="px-3.5 py-1.5 bg-slate-900 border border-white/5 hover:border-white/10 hover:bg-white/[0.02] disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-300 rounded-xl text-xs font-semibold transition-all"
              >
                Previous
              </button>
              <button
                onClick={() => setAuditPage(prev => Math.min(prev + 1, auditTotalPages))}
                disabled={auditPage === auditTotalPages}
                className="px-3.5 py-1.5 bg-slate-900 border border-white/5 hover:border-white/10 hover:bg-white/[0.02] disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-300 rounded-xl text-xs font-semibold transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    )}

      </main>

      {}
      {}
      {}
      {selectedApp && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl animate-scale-up my-8 max-h-[90vh] flex flex-col justify-between">
            
            {}
            <div className="p-5 border-b border-white/5 flex items-center justify-between bg-slate-950/50">
              <div>
                <span className="text-[10px] font-bold tracking-wider text-slate-300 uppercase">Case Evaluation File: {selectedApp.appId}</span>
                <h3 className="text-base font-bold text-white flex items-center gap-2.5 mt-0.5">
                  {selectedApp.sme_id?.business_name}
                  {getStatusBadge(selectedApp.status)}
                </h3>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-xs font-semibold transition-all"
              >
                Close Case
              </button>
            </div>

            {}
            <div className="px-6 bg-slate-900 border-b border-white/5 flex gap-4 text-xs">
              <button
                onClick={() => setActiveReviewTab('parameters')}
                className={`py-3 font-semibold border-b-2 transition-all ${
                  activeReviewTab === 'parameters'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                General Parameters & Audit
              </button>
              <button
                onClick={() => {
                  setActiveReviewTab('extraction');
                  loadExtractionResult(selectedApp._id);
                }}
                className={`py-3 font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeReviewTab === 'extraction'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                AI Extracted Summary
              </button>
              <button
                onClick={() => {
                  setActiveReviewTab('underwriting');
                  loadUnderwritingReport(selectedApp._id);
                }}
                className={`py-3 font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeReviewTab === 'underwriting'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI Underwriting Vetting Report
              </button>
              <button
                onClick={() => setActiveReviewTab('chat')}
                className={`py-3 font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeReviewTab === 'chat'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat with Documents
              </button>
            </div>

            {}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {activeReviewTab === 'parameters' ? (
                <>
                  {}
                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                      Status Progression Timeline
                    </h4>
                    
                    {}
                    <div className="bg-slate-950 p-4 border border-white/5 rounded-2xl flex justify-between items-center relative overflow-x-auto min-w-[500px]">
                      {[
                        { key: 'submitted', label: 'Submitted' },
                        { key: 'eligibility_check', label: 'Eligibility Check' },
                        { key: 'agent_review', label: 'Agent Review' },
                        { key: 'missing_info', label: 'Missing Info', isAlert: true },
                        { key: 'approved', label: 'Approved' },
                      ].map((step, idx, arr) => {
                        const statusesOrdered = ['submitted', 'eligibility_check', 'agent_review', 'missing_info', 'approved', 'rejected', 'disbursed'];
                        const currentIdx = statusesOrdered.indexOf(selectedApp.status);
                        const stepIdx = statusesOrdered.indexOf(step.key);

                        
                        let isCompleted = stepIdx < currentIdx && selectedApp.status !== 'rejected';
                        let isActive = selectedApp.status === step.key;
                        let isAlert = step.isAlert && selectedApp.status === 'missing_info';
                        let isMuted = !isCompleted && !isActive;

                        if (selectedApp.status === 'rejected' && step.key === 'approved') {
                          step.label = 'Rejected';
                          isActive = true;
                          isAlert = true;
                          isMuted = false;
                        }

                        return (
                          <div key={step.key} className="flex items-center gap-2 relative z-10">
                            <div className={`w-6 h-6 rounded-full border flex items-center justify-center font-bold text-[10px] transition-all duration-300 ${
                              isAlert ? 'bg-red-500/10 border-red-500/30 text-red-400 animate-pulse' :
                              isActive ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                              isCompleted ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                              'bg-slate-900 border-white/5 text-slate-400'
                            }`}>
                              {isCompleted ? <CheckCircle className="w-3.5 h-3.5" /> : idx + 1}
                            </div>
                            <div className="flex flex-col">
                              <span className={`font-semibold tracking-tight ${
                                isAlert ? 'text-red-400' :
                                isActive ? 'text-amber-400 font-bold' :
                                isCompleted ? 'text-emerald-400' :
                                'text-slate-400'
                              }`}>{step.label}</span>
                            </div>
                            {idx < arr.length - 1 && (
                              <div className={`h-0.5 w-6 bg-white/5`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {}
                    <div className="space-y-4">
                      {}
                      <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl space-y-2">
                        <h5 className="font-bold text-slate-300 border-b border-white/5 pb-1 flex justify-between">
                          <span>Loan parameters</span>
                          <span className="text-[10px] font-mono text-slate-300">Risk Score: {selectedApp.risk_score}</span>
                        </h5>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <span className="text-slate-300 block text-[10px]">Requested</span>
                            <span className="text-white font-semibold font-mono">₹{selectedApp.amount?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-slate-300 block text-[10px]">Tenure</span>
                            <span className="text-white font-semibold">{selectedApp.tenure} Months</span>
                          </div>
                          <div>
                            <span className="text-slate-300 block text-[10px]">Purpose</span>
                            <span className="text-white font-semibold capitalize">{selectedApp.purpose?.replace('_', ' ')}</span>
                          </div>
                          <div>
                            <span className="text-slate-300 block text-[10px]">Monthly Turnover</span>
                            <span className="text-white font-semibold font-mono">₹{selectedApp.revenue?.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {}
                      <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl space-y-2">
                        <h5 className="font-bold text-slate-300 border-b border-white/5 pb-1">Entity structure</h5>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <span className="text-slate-300 block text-[10px]">Legal Name</span>
                            <span className="text-white font-semibold">{selectedApp.business_info?.legal_name}</span>
                          </div>
                          <div>
                            <span className="text-slate-300 block text-[10px]">Structure</span>
                            <span className="text-white capitalize">{selectedApp.business_info?.registration_type?.replace('_', ' ')}</span>
                          </div>
                          <div>
                            <span className="text-slate-300 block text-[10px]">GSTIN</span>
                            <span className="text-white font-mono font-semibold">{selectedApp.business_info?.gstin}</span>
                          </div>
                          <div>
                            <span className="text-slate-300 block text-[10px]">Industry</span>
                            <span className="text-white">{selectedApp.business_info?.industry_type}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-300 block text-[10px]">Promoter Email</span>
                            <span className="text-slate-300">{selectedApp.sme_id?.email}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {}
                    <div className="space-y-4">
                      {}
                      <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl space-y-2">
                        <h5 className="font-bold text-slate-300 border-b border-white/5 pb-1">Uploaded Credential Audit</h5>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {selectedApp.documents && Object.entries(selectedApp.documents).map(([key, doc]) => (
                            <div key={key} className="flex justify-between items-center bg-slate-950 p-2 rounded-xl border border-white/5">
                              <span className="text-slate-400 capitalize truncate max-w-[130px]">{key.replace('_', ' ')}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] text-slate-300 font-mono">{(doc.size / (1024 * 1024)).toFixed(2)} MB</span>
                                <button
                                  onClick={() => openPreview(doc)}
                                  className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5"
                                >
                                  Open <Eye className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {}
                      <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl space-y-3">
                        <h5 className="font-bold text-slate-200 border-b border-white/5 pb-1 uppercase tracking-wider text-[10px]">
                          Applicant Loan Motive & User Reasoning
                        </h5>
                        <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Stated Purpose of Loan</span>
                            <p className="text-white font-medium text-xs capitalize mt-0.5">{selectedApp.purpose?.replace('_', ' ')}</p>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Q1: Primary Operational or Inventory Challenges</span>
                            <p className="text-slate-200 leading-relaxed italic text-[11px] mt-0.5">
                              "{selectedApp.behavioural_questions?.business_challenges || 'No response provided'}"
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Q2: Cash Flow & Target Repayment Flow</span>
                            <p className="text-slate-200 leading-relaxed italic text-[11px] mt-0.5">
                              "{selectedApp.behavioural_questions?.repayment_plan || 'No response provided'}"
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[9px] uppercase tracking-wider font-semibold">Q3: Commercial Expansion Goals (12-24 Months)</span>
                            <p className="text-slate-200 leading-relaxed italic text-[11px] mt-0.5">
                              "{selectedApp.behavioural_questions?.future_goals || 'No response provided'}"
                            </p>
                          </div>
                          <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-white/5">
                            <span className="text-slate-400 text-[10px] font-semibold">Promoter Integrity Declaration Signed</span>
                            <Badge className={selectedApp.behavioural_questions?.integrity_check ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]" : "bg-red-500/10 text-red-400 border-red-500/20 text-[9px]"}>
                              {selectedApp.behavioural_questions?.integrity_check ? "YES" : "NO"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {}
                  {!['approved', 'rejected', 'disbursed'].includes(selectedApp.status) ? (
                    <div className="bg-blue-600/[0.02] border border-blue-500/10 rounded-2xl p-5 space-y-4">
                      <h4 className="font-bold text-white flex items-center gap-2 border-b border-white/5 pb-2 text-[11px] uppercase tracking-wider">
                        <MessageSquare className="w-4 h-4 text-blue-400" />
                        Transition Status & Log Notes
                      </h4>

                      {statusError && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          <span>{statusError}</span>
                        </div>
                      )}

                      <form onSubmit={handleStatusChangeSubmit} className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                          {}
                          <div className="space-y-1.5">
                            <label className="block font-semibold text-slate-300">Target status</label>
                            <select
                              value={nextStatus}
                              onChange={(e) => {
                                setNextStatus(e.target.value);
                                setStatusError('');
                              }}
                              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                            >
                              <option value="">Choose status...</option>
                              {getValidNextStatuses(selectedApp.status).map((st) => (
                                <option key={st.value} value={st.value}>
                                  {st.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {}
                          <div className="space-y-1.5">
                            <label className="block font-semibold text-slate-300">Administrative Transition Notes</label>
                            <input
                              type="text"
                              value={transitionNotes}
                              onChange={(e) => setTransitionNotes(e.target.value)}
                              placeholder="Type reason or notes..."
                              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                            />
                          </div>
                        </div>

                        {}
                        {nextStatus === 'missing_info' && (
                          <div className="space-y-2 border-t border-white/5 pt-3 animate-fade-in">
                            <span className="block font-semibold text-slate-300 text-[10px] uppercase tracking-wider flex items-center gap-1.5 text-red-400">
                              <AlertTriangle className="w-4 h-4" />
                              Select Missing/Corrupted Document Uploads
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {[
                                { key: 'pan', label: 'PAN Card' },
                                { key: 'aadhaar', label: 'Aadhaar Card' },
                                { key: 'gst_certificate', label: 'GST Certificate' },
                                { key: 'bank_statements', label: 'Bank Statements' },
                                { key: 'itr', label: 'ITR Returns' },
                                { key: 'balance_sheets', label: 'Balance Sheet' },
                                { key: 'profit_loss', label: 'Profit & Loss' },
                                { key: 'loan_documents', label: 'Sanction Letters' },
                              ].map((doc) => (
                                <div
                                  key={doc.key}
                                  onClick={() => toggleMissingDocCheckbox(doc.key)}
                                  className={`p-2 border rounded-xl cursor-pointer text-center select-none transition-all ${
                                    missingDocs.includes(doc.key)
                                      ? 'bg-red-500/10 border-red-500/30 text-red-400 font-semibold'
                                      : 'bg-slate-950 border-white/5 text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {doc.label}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end pt-2 border-t border-white/5">
                          <button
                            type="submit"
                            disabled={submittingStatus}
                            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-semibold rounded-xl text-xs transition-all flex items-center gap-1"
                          >
                            {submittingStatus ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Transitioning...
                              </>
                            ) : (
                              <>
                                Save Transition
                                <ArrowRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="bg-slate-950 border border-white/5 p-4 rounded-2xl flex items-center gap-2.5 text-slate-300">
                      <CheckCircle className="w-5 h-5 text-slate-400" />
                      <span className="font-medium italic">This application file is closed. No further transitions are available.</span>
                    </div>
                  )}

                  {}
                  <div className="border border-white/5 rounded-2xl overflow-hidden">
                    <div
                      onClick={() => setExpandedLogs(!expandedLogs)}
                      className="bg-white/[0.01] hover:bg-white/[0.02] p-4 flex justify-between items-center cursor-pointer select-none transition-colors border-b border-white/5"
                    >
                      <span className="font-bold text-slate-300 flex items-center gap-2 text-[10px] uppercase tracking-wider">
                        <History className="w-4 h-4 text-blue-400" />
                        Expand Activity History Log ({historyLogs.length})
                      </span>
                      <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${expandedLogs ? 'rotate-90' : ''}`} />
                    </div>

                    {expandedLogs && (
                      <CardContent className="p-4 bg-slate-950/40 space-y-3.5 divide-y divide-white/5 max-h-60 overflow-y-auto">
                        {loadingHistory ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                          </div>
                        ) : historyLogs.length > 0 ? (
                          historyLogs.map((log, idx) => (
                            <div key={log._id} className={`pt-3 first:pt-0 space-y-1.5`}>
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-slate-300 font-mono">
                                  {new Date(log.created_at).toLocaleString()}
                                </span>
                                <span className="text-slate-300 font-semibold">
                                  By: {log.changed_by_name} ({log.changed_by_model === 'SMEUser' ? 'Applicant' : 'Officer'})
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs">
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
                                  <span className="text-[9px] text-red-400 font-semibold uppercase">Missing files flagged:</span>
                                  {log.missing_docs.map((doc) => (
                                    <Badge key={doc} variant="destructive" className="text-[8px] uppercase">{doc.replace('_', ' ')}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-center text-xs text-slate-400 py-4">No audit logs found for this case.</p>
                        )}
                      </CardContent>
                    )}
                  </div>
                </>
              ) : activeReviewTab === 'extraction' ? (
                <div className="space-y-6 animate-fade-in text-xs">
                  {loadingExtraction ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      <p className="text-slate-400 font-medium">Retrieving AI parameter extraction result...</p>
                    </div>
                  ) : triggeringExtraction ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                      <p className="text-emerald-400 font-bold animate-pulse text-center">
                        Running AI Parameter Extraction Pipeline...
                      </p>
                    </div>
                  ) : extractionError ? (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-5 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        <span>Extraction Pipeline Error</span>
                      </div>
                      <p className="leading-normal">{extractionError}</p>
                      <button
                        onClick={() => handleTriggerExtraction(selectedApp._id)}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-white font-bold rounded-xl transition-all"
                      >
                        Run Extraction
                      </button>
                    </div>
                  ) : !extractionResult ? (
                    <div className="bg-slate-950/40 border border-white/5 p-8 rounded-3xl text-center space-y-4 flex flex-col items-center max-w-xl mx-auto">
                      <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white">Extraction Pending</h4>
                        <p className="text-[11px] text-slate-400 leading-normal max-w-sm text-center">
                          AI Parameter Extraction has not been executed on this file yet.
                        </p>
                      </div>
                      <button
                        onClick={() => handleTriggerExtraction(selectedApp._id)}
                        className="px-4.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all flex items-center gap-1.5"
                      >
                        <Sparkles className="w-4 h-4" />
                        Run AI Parameter Extraction
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid sm:grid-cols-3 gap-4">
                        <div className="bg-slate-950 p-4 border border-white/5 rounded-2xl flex flex-col justify-between min-h-[90px]">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Overall AI Confidence</span>
                          <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-3xl font-extrabold font-mono text-emerald-400">
                              {extractionResult.overall_confidence != null 
                                ? `${Math.round(extractionResult.overall_confidence * 100)}%`
                                : 'N/A'}
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-300">Extraction algorithm scoring</span>
                        </div>

                        <div className="bg-slate-950 p-4 border border-white/5 rounded-2xl flex flex-col justify-between min-h-[90px]">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Missing Documents/Fields</span>
                          <div className="mt-2">
                            {extractionResult.missing_fields && extractionResult.missing_fields.length > 0 ? (
                              <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px] font-bold">
                                {extractionResult.missing_fields.length} ITEMS MISSING
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-bold">
                                CLEAN FILE
                              </Badge>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-300">Parameters required by policy</span>
                        </div>

                        <div className="bg-slate-950 p-4 border border-white/5 rounded-2xl flex flex-col justify-between min-h-[90px]">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Extraction ID</span>
                          <div className="mt-2 text-[10px] font-mono text-slate-300 truncate">
                            {extractionResult.extraction_id || extractionResult.id || 'N/A'}
                          </div>
                          <span className="text-[9px] text-slate-300">PostgreSQL reference trace</span>
                        </div>
                      </div>

                      {extractionResult.missing_fields && extractionResult.missing_fields.length > 0 && (
                        <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl space-y-2">
                          <span className="font-bold text-red-400 text-[10px] uppercase tracking-wider block">
                            Flagged Missing Parameters
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {extractionResult.missing_fields.map((field) => (
                              <Badge key={field} variant="destructive" className="text-[9px] uppercase font-semibold">
                                {field.replace('_', ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-white/[0.01] border border-white/5 p-5 rounded-2xl space-y-4">
                          <h5 className="font-bold text-slate-200 border-b border-white/5 pb-2 uppercase tracking-wider text-[10px]">
                            Identity Credentials (PAN/GSTIN/CIN)
                          </h5>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-slate-400 block text-[10px]">GSTIN</span>
                              <span className="text-white font-mono font-semibold">{extractionResult.parameters?.gstin || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">PAN</span>
                              <span className="text-white font-mono font-semibold">{extractionResult.parameters?.pan || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">CIN</span>
                              <span className="text-white font-mono font-semibold">{extractionResult.parameters?.cin || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">LLPIN</span>
                              <span className="text-white font-mono font-semibold">{extractionResult.parameters?.llpin || 'N/A'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white/[0.01] border border-white/5 p-5 rounded-2xl space-y-4">
                          <h5 className="font-bold text-slate-200 border-b border-white/5 pb-2 uppercase tracking-wider text-[10px]">
                            Financial parameters
                          </h5>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Annual Turnover</span>
                              <span className="text-white font-semibold font-mono">
                                {extractionResult.parameters?.annual_turnover != null
                                  ? `₹${extractionResult.parameters.annual_turnover.toLocaleString()}`
                                  : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Net Profit</span>
                              <span className="text-white font-semibold font-mono">
                                {extractionResult.parameters?.net_profit != null
                                  ? `₹${extractionResult.parameters.net_profit.toLocaleString()}`
                                  : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Total Liabilities</span>
                              <span className="text-white font-semibold font-mono">
                                {extractionResult.parameters?.total_liabilities != null
                                  ? `₹${extractionResult.parameters.total_liabilities.toLocaleString()}`
                                  : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Avg Monthly Balance</span>
                              <span className="text-white font-semibold font-mono">
                                {extractionResult.parameters?.avg_monthly_balance != null
                                  ? `₹${extractionResult.parameters.avg_monthly_balance.toLocaleString()}`
                                  : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white/[0.01] border border-white/5 p-5 rounded-2xl space-y-4">
                          <h5 className="font-bold text-slate-200 border-b border-white/5 pb-2 uppercase tracking-wider text-[10px]">
                            Promoter & Director details
                          </h5>
                          {extractionResult.parameters?.promoter_details && extractionResult.parameters.promoter_details.length > 0 ? (
                            <div className="space-y-2">
                              {extractionResult.parameters.promoter_details.map((promoter, idx) => (
                                <div key={idx} className="bg-slate-950 p-2 border border-white/5 rounded-xl text-[11px]">
                                  <span className="font-bold text-white block">{promoter.name || 'Unknown'}</span>
                                  <div className="grid grid-cols-2 text-[10px] text-slate-400 mt-1">
                                    <span>DIN: {promoter.din || 'N/A'}</span>
                                    <span>Shareholding: {promoter.shareholding != null ? `${promoter.shareholding}%` : 'N/A'}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No promoter details extracted</span>
                          )}
                        </div>

                        <div className="bg-white/[0.01] border border-white/5 p-5 rounded-2xl space-y-4">
                          <h5 className="font-bold text-slate-200 border-b border-white/5 pb-2 uppercase tracking-wider text-[10px]">
                            Behavioural Risk & Debt Records
                          </h5>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Cheque Bounce Count</span>
                              <span className="text-white font-semibold font-mono">
                                {extractionResult.parameters?.cheque_bounce_count ?? 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Collateral details</span>
                              <span className="text-white font-semibold truncate block max-w-[150px]">
                                {extractionResult.parameters?.collateral_details && extractionResult.parameters.collateral_details.length > 0
                                  ? extractionResult.parameters.collateral_details.map(c => c.type || c.description).join(', ')
                                  : 'None'}
                              </span>
                            </div>
                          </div>

                          <div className="border-t border-white/5 pt-2">
                            <span className="text-slate-400 block text-[10px] mb-1">Existing Loan Balances</span>
                            {extractionResult.parameters?.loan_balances && extractionResult.parameters.loan_balances.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {extractionResult.parameters.loan_balances.map((loan, idx) => (
                                  <Badge key={idx} className="bg-slate-900 border-white/5 text-[9px]">
                                    {loan.bank || 'Bank'}: ₹{loan.amount?.toLocaleString()}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic block text-[11px]">No active external loans detected</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end pt-4 border-t border-white/5 gap-2">
                        <button
                          onClick={() => handleTriggerExtraction(selectedApp._id, true)}
                          disabled={triggeringExtraction}
                          className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5"
                        >
                          <Sparkles className="w-4 h-4 text-emerald-400" />
                          Force Re-run Parameter Extraction
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : activeReviewTab === 'chat' ? (
                <div className="flex flex-col h-[600px] animate-fade-in text-xs border border-slate-700/50 rounded-xl overflow-hidden bg-slate-900/50">
                  <div className="bg-slate-800/80 border-b border-slate-700/50 p-4 shrink-0 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-blue-400" />
                        AI Document Q&A
                      </h3>
                      <p className="text-slate-400 mt-1">Ask questions about {selectedApp.business_info?.legal_name}'s extracted documents</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {chatMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                        <MessageSquare className="w-8 h-8 opacity-20" />
                        <p>No messages yet. Ask a question about the loan documents.</p>
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'}`}>
                            <p className="whitespace-pre-wrap leading-relaxed text-[13px]">{msg.content}</p>
                            {msg.sources && msg.sources.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-slate-700/50 flex flex-wrap gap-2">
                                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Sources:</span>
                                {msg.sources.map((src, i) => (
                                  <span key={i} className="text-[10px] bg-slate-900/50 px-2 py-1 rounded text-slate-300 border border-slate-700/50">{src}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                    {isChatting && (
                      <div className="flex justify-start">
                        <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-none p-4 flex items-center gap-2 text-slate-400">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                          <span>AI is analyzing documents...</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="p-4 bg-slate-800/80 border-t border-slate-700/50 shrink-0">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder={chatRetryAfter > 0 ? `Please wait ${chatRetryAfter}s...` : "e.g. What is the net profit in the last year?"}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                        disabled={isChatting || chatRetryAfter > 0}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={isChatting || !chatInput.trim() || chatRetryAfter > 0}
                        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 rounded-xl font-bold flex items-center justify-center transition-all"
                      >
                        {chatRetryAfter > 0 ? chatRetryAfter : "Send"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 animate-fade-in text-xs">
                  {loadingAssessment ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      <p className="text-slate-400 font-medium">Retrieving stored AI credit assessment...</p>
                    </div>
                  ) : assessingLoan ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                      <p className="text-emerald-400 font-bold animate-pulse text-center">
                        Running AI Credit Underwriting Engine...
                      </p>
                      <p className="text-[12px] text-slate-300 max-w-sm text-center font-mono bg-slate-900 border border-emerald-500/20 px-4 py-2 rounded-lg mt-2">
                        {AGENT_TRACE_LOGS[agentTraceIndex]}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-2">This process takes up to 60 seconds.</p>
                    </div>
                  ) : reevaluatingLoan ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-teal-400 animate-duration-1000" />
                      <p className="text-teal-400 font-bold animate-pulse text-center">
                        Re-running Agentic Underwriting Workflow...
                      </p>
                      <p className="text-[12px] text-slate-300 max-w-sm text-center font-mono bg-slate-900 border border-teal-500/20 px-4 py-2 rounded-lg mt-2">
                        {AGENT_TRACE_LOGS[agentTraceIndex]}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-2">This process takes up to 60 seconds.</p>
                    </div>
                  ) : assessmentError ? (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-5 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        <span>Credit Audit Error</span>
                      </div>
                      <p className="leading-normal">{assessmentError}</p>
                      <button
                        onClick={() => handleAssessLoan(selectedApp._id)}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-white font-bold rounded-xl transition-all"
                      >
                        Retry Underwriting Assessment
                      </button>
                    </div>
                  ) : !underwritingAssessment ? (
                    <div className="bg-slate-950/40 border border-white/5 p-8 rounded-3xl text-center space-y-4 flex flex-col items-center max-w-xl mx-auto">
                      <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center animate-bounce animate-duration-1000">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white">Assessment Report Pending</h4>
                        <p className="text-[11px] text-slate-400 leading-normal max-w-sm text-center">
                          This loan application has not undergone AI Credit Underwriting. Run policy checks and risk rating calculations.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-center gap-3">
                        <button
                          onClick={() => handleAssessLoan(selectedApp._id)}
                          className="px-4.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all flex items-center gap-1.5"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          Run AI Underwriting Assessment
                        </button>
                        <button
                          onClick={() => handleReevaluateLoan(selectedApp._id)}
                          className="px-4.5 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all flex items-center gap-1.5 border border-white/5"
                        >
                          <Sparkles className="w-4 h-4 text-emerald-400" />
                          Re-evaluate End-to-End
                        </button>
                      </div>
                    </div>
                  ) : (
                    // ASSESSMENT REPORT LOADED
                    <div className="space-y-6">
                      {/* Metric cards row */}
                      <div className="grid sm:grid-cols-3 gap-4">
                        <div className="bg-slate-950 p-4 border border-white/5 rounded-2xl flex flex-col justify-between min-h-[90px]">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Credit Score</span>
                          <div className="flex items-baseline gap-2 mt-2">
                            <span className={`text-3xl font-extrabold font-mono ${
                              underwritingAssessment.risk_level === 'LOW' ? 'text-emerald-400' :
                              underwritingAssessment.risk_level === 'MEDIUM' ? 'text-amber-400' :
                              'text-amber-400'
                            }`}>
                              {underwritingAssessment.risk_score}
                            </span>
                            <span className="text-slate-300 font-medium">/ 850</span>
                          </div>
                          <span className={`text-[10px] font-bold mt-1 uppercase ${
                            underwritingAssessment.risk_level === 'LOW' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
                            underwritingAssessment.risk_level === 'MEDIUM' ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' :
                            'text-amber-500 bg-amber-500/10 border-amber-500/20'
                          } border px-2 py-0.5 rounded-full w-fit`}>
                            {underwritingAssessment.risk_level || 'EVALUATED'} RISK
                          </span>
                        </div>
                      </div>

                      {/* AI Underwriting Reasoning */}
                      <div className="space-y-3 pt-4">
                        <h4 className="font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                          <MessageSquare className="w-4 h-4 text-blue-400" />
                          AI Underwriting Decision
                        </h4>

                        <div className="grid sm:grid-cols-1 lg:grid-cols-3 gap-3.5">
                          <div className="bg-slate-950 p-4 border border-white/5 rounded-2xl flex flex-col gap-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              Decision
                            </span>
                            <div className="flex items-center gap-2">
                              {underwritingAssessment.underwriting_decision === 'APPROVE' ? (
                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                              ) : underwritingAssessment.underwriting_decision === 'REJECT' ? (
                                <AlertCircle className="w-5 h-5 text-red-500" />
                              ) : (
                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                              )}
                              <span className={`text-sm font-extrabold ${
                                underwritingAssessment.underwriting_decision === 'APPROVE' ? 'text-emerald-400' :
                                underwritingAssessment.underwriting_decision === 'REJECT' ? 'text-red-400' : 'text-amber-400'
                              }`}>
                                {underwritingAssessment.underwriting_decision || 'MANUAL_REVIEW'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="bg-slate-950 p-4 border border-white/5 rounded-2xl flex flex-col gap-3 lg:col-span-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              Decision Summary
                            </span>
                            <p className="text-slate-200 text-[11.5px] leading-relaxed whitespace-pre-wrap">
                              {underwritingAssessment.summary || 'No summary provided.'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* AI Policy Evaluations Grouped */}
                      {underwritingAssessment.policies_evaluation && underwritingAssessment.policies_evaluation.length > 0 && (
                        <div className="space-y-4 pt-4 border-t border-white/5">
                          <h4 className="font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            Multi-Engine Policy Adherence
                          </h4>
                          
                          <div className="space-y-6">
                            {['Hard', 'Derived', 'Exception', 'Semantic'].map((engineType) => {
                              const engineRules = underwritingAssessment.policies_evaluation.filter(r => r.rule_type === engineType);
                              if (engineRules.length === 0) return null;
                              
                              return (
                                <div key={engineType} className="space-y-2">
                                  <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-1">
                                    {engineType} Engine Rules
                                  </h5>
                                  <div className="flex flex-col gap-2">
                                    {engineRules.map((policy, idx) => (
                                      <div key={idx} className={`p-3 border rounded-xl flex flex-col gap-2 ${
                                        policy.status.includes('PASS') 
                                          ? 'bg-emerald-500/5 border-emerald-500/20' 
                                          : 'bg-red-500/5 border-red-500/20'
                                      }`}>
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="flex items-start gap-2 max-w-[80%]">
                                            {policy.status.includes('PASS') ? (
                                              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                            ) : (
                                              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                            )}
                                            <span className="text-xs font-semibold text-slate-200">
                                              {policy.rule_name || policy.policy_name}
                                            </span>
                                          </div>
                                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${
                                            policy.status.includes('PASS') ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'
                                          }`}>
                                            {policy.status}
                                          </span>
                                        </div>
                                        <p className="text-slate-400 text-[11px] leading-relaxed ml-6">
                                          {policy.reason}
                                        </p>
                                        {policy.applicant_value && (
                                          <p className="text-slate-500 text-[10px] ml-6 font-mono">
                                            Value: {policy.applicant_value}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Underwriting Audit Logs */}
                      <div className="space-y-4 pt-4 border-t border-white/5">
                        <h4 className="font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                          <Database className="w-4 h-4 text-purple-400" />
                          System Underwriting Audit Logs
                        </h4>
                        
                        <div className="bg-slate-950 border border-white/5 rounded-2xl overflow-hidden">
                          <Table className="w-full text-xs">
                            <TableHeader className="bg-slate-900/50">
                              <TableRow className="border-white/5 hover:bg-transparent">
                                <TableHead className="text-[9px] font-bold uppercase tracking-wider text-slate-400 h-8">Timestamp</TableHead>
                                <TableHead className="text-[9px] font-bold uppercase tracking-wider text-slate-400 h-8">Engine / Policy</TableHead>
                                <TableHead className="text-[9px] font-bold uppercase tracking-wider text-slate-400 h-8">Rule</TableHead>
                                <TableHead className="text-[9px] font-bold uppercase tracking-wider text-slate-400 h-8">Result</TableHead>
                                <TableHead className="text-[9px] font-bold uppercase tracking-wider text-slate-400 h-8">Metadata</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {underwritingAuditLogs && underwritingAuditLogs.length > 0 ? (
                                underwritingAuditLogs.map((log) => (
                                  <TableRow key={log.id} className="border-white/5 hover:bg-white/[0.02]">
                                    <TableCell className="font-mono text-[9px] text-slate-500">
                                      {new Date(log.created_at).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-slate-300">
                                      <div className="flex flex-col gap-1">
                                        <span className="font-medium">{log.engine || 'System'}</span>
                                        {log.policy_id && (
                                          <span className="text-[9px] text-slate-500 font-mono">Policy: {log.policy_id.substring(0, 8)}</span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-col gap-1">
                                        {log.rule_name && <span className="font-medium text-slate-300">{log.rule_name}</span>}
                                        {log.rule_id && <span className="text-[9px] text-slate-500 font-mono">ID: {log.rule_id.substring(0, 8)}</span>}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge className={`text-[8px] uppercase ${
                                        log.result === 'PASS' || log.result === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                        log.result === 'FAIL' || log.result === 'REJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                        'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                      }`}>
                                        {log.result}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-[9px] text-slate-500 truncate max-w-[150px]" title={JSON.stringify(log.metadata)}>
                                      {log.metadata ? JSON.stringify(log.metadata) : '-'}
                                    </TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={5} className="text-center py-6 text-slate-500 italic">
                                    No audit logs recorded for this assessment.
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex justify-end pt-4 border-t border-white/5 gap-3">
                        <button
                          onClick={() => handleAssessLoan(selectedApp._id)}
                          disabled={assessingLoan || reevaluatingLoan}
                          className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 border border-white/5"
                        >
                          <Sparkles className="w-4.5 h-4.5 text-blue-400" />
                          Re-run Underwriting Assessment
                        </button>
                        <button
                          onClick={() => handleReevaluateLoan(selectedApp._id)}
                          disabled={assessingLoan || reevaluatingLoan}
                          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5"
                        >
                          <Sparkles className="w-4.5 h-4.5 text-emerald-400 animate-pulse" />
                          Re-evaluate End-to-End (Rerun Agentic Workflow)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF / Image Preview Overlay Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs font-semibold text-white truncate max-w-[80%]">{previewTitle}</span>
              <button
                onClick={() => {
                  setPreviewUrl('');
                  setPreviewTitle('');
                  setPreviewType('');
                }}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg text-xs font-bold transition-all"
              >
                Close Preview
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 bg-slate-950/50 flex justify-center">
              {previewType.includes('pdf') ? (
                <iframe src={previewUrl} className="w-full h-[70vh] rounded-xl border border-white/5" title="PDF preview frame" />
              ) : (
                <img src={previewUrl} className="max-h-[70vh] object-contain rounded-xl" alt="Document Preview representation" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* CONFIDENTIAL DOCUMENT READER MODAL */}
      {/* =================================================================== */}
      {viewingConfidentialDoc && (() => {
        const doc = policies.find((p) => (p._id || p.id) === viewingConfidentialDoc);
        if (!doc) return null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
            <div className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl animate-scale-up my-8 max-h-[90vh] flex flex-col justify-between">
              
              {/* Modal Header */}
              <div className="p-5 border-b border-white/5 flex items-center justify-between bg-red-950/10">
                <div>
                  <span className="text-[10px] font-bold tracking-widest text-red-400 uppercase flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                    {isModalEditing ? 'EDIT MODE' : doc.is_system_default ? 'CONFIDENTIAL POLICY' : 'CUSTOM POLICY'}
                  </span>
                  <h3 className="text-base font-extrabold text-white mt-1">
                    {isModalEditing ? `Edit: ${doc.title}` : doc.title}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {!isModalEditing && (
                    <button
                      onClick={() => handleStartEditFromModal(doc)}
                      className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 rounded-xl text-xs font-semibold transition-all border border-amber-500/20"
                    >
                      Edit Policy
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setViewingConfidentialDoc(null);
                      setIsModalEditing(false);
                    }}
                    className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all"
                  >
                    Close Reader
                  </button>
                </div>
              </div>

              {}
              {isModalEditing ? (
                <form onSubmit={handleSaveEditFromModal} className="flex-1 overflow-y-auto p-6 space-y-4">
                  {uploadPolicyError && (
                    <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                      {uploadPolicyError}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Policy Title</label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="e.g. Real Estate Risk Limits"
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Description (Optional)</label>
                    <input
                      type="text"
                      value={uploadDesc}
                      onChange={(e) => setUploadDesc(e.target.value)}
                      placeholder="Brief purpose of document"
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      Replacement File (Optional - PDF format only)
                    </label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setUploadFile(e.target.files[0])}
                      className="w-full text-slate-300 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-white/15 file:text-white file:text-xs file:font-semibold hover:file:bg-white/25 cursor-pointer file:cursor-pointer"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={handleCancelEditFromModal}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-semibold transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={uploadingPolicy}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                    >
                      {uploadingPolicy ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Processing policy embeddings...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-300 text-xs leading-relaxed">
                  {doc.description && (
                    <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl text-slate-300 italic text-[11px]">
                      {doc.description}
                    </div>
                  )}

                  {(!doc.is_system_default || (doc.public_id && !doc.public_id.startsWith('capitalscale_bank_policies/default_policy_'))) && doc.url ? (
                    <div className="flex justify-center bg-slate-950/40 p-2 rounded-2xl border border-white/5 w-full">
                      {doc.url.toLowerCase().endsWith('.pdf') || doc.mimetype?.includes('pdf') ? (
                        <iframe src={doc.url} className="w-full h-[55vh] rounded-xl border border-white/5" title="PDF preview frame" />
                      ) : (
                        <img src={doc.url} className="max-h-[55vh] object-contain rounded-xl" alt="Document Preview representation" />
                      )}
                    </div>
                  ) : doc.content ? (
                    <div className="animate-fade-in text-slate-300 animate-duration-300" dangerouslySetInnerHTML={{ __html: doc.content }} />
                  ) : (
                    <div className="text-center py-8 text-slate-400 italic">
                      No guideline rules file configured for this document. Please click "Edit Policy" at the top to upload a PDF guidelines file.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
