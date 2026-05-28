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
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext.jsx';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card.jsx';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { loanApi } from '@/api/loan.api.js';
import { bankApi } from '@/api/bank.api.js';

export default function BankAdminDashboard() {
  const { user, logout, getRoleLabel } = useAuth();
  const navigate = useNavigate();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal Review States
  const [selectedApp, setSelectedApp] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [transitionNotes, setTransitionNotes] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [missingDocs, setMissingDocs] = useState([]);
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [expandedLogs, setExpandedLogs] = useState(false);

  // Confidential guidelines states
  const [policies, setPolicies] = useState([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [auditAppId, setAuditAppId] = useState('');
  const [viewingConfidentialDoc, setViewingConfidentialDoc] = useState(null);

  // Policy upload form states
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadingPolicy, setUploadingPolicy] = useState(false);
  const [uploadPolicyError, setUploadPolicyError] = useState('');
  const [showUploadPolicyForm, setShowUploadPolicyForm] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState(null);
  const [uploadContent, setUploadContent] = useState('');
  const [isModalEditing, setIsModalEditing] = useState(false);

  const auditedApp = applications.find((app) => app._id === auditAppId);

  // PDF Preview State
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewType, setPreviewType] = useState('');

  // Fetch applications matching the underwriter's bank
  const fetchApplications = async () => {
    try {
      setLoading(true);
      const { data } = await loanApi.getAll();
      setApplications(data.data);
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

  useEffect(() => {
    fetchApplications();
    fetchPolicies();
  }, []);

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

  const handleOpenReview = (app) => {
    setSelectedApp(app);
    setNextStatus('');
    setTransitionNotes('');
    setMissingDocs([]);
    setStatusError('');
    setExpandedLogs(false);
    loadHistoryLogs(app._id);
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

      // Update selected app state
      setSelectedApp(data.data);
      // Reload full table
      await fetchApplications();
      // Reload history logs
      await loadHistoryLogs(selectedApp._id);

      // Reset transition inputs
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

  // Metrics calculations (safeguard drafts)
  const nonDraftApps = applications.filter((app) => app.status !== 'draft');
  const inboxCount = nonDraftApps.filter((app) =>
    ['submitted', 'eligibility_check', 'agent_review', 'missing_info'].includes(app.status)
  ).length;
  const approvedCount = nonDraftApps.filter((app) => app.status === 'approved').length;
  const rejectedCount = nonDraftApps.filter((app) => app.status === 'rejected').length;

  const avgRiskScore = nonDraftApps.length > 0
    ? Math.round(nonDraftApps.reduce((sum, app) => sum + (app.risk_score || 600), 0) / nonDraftApps.length)
    : 'N/A';

  // Badges helper
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

  // Valid next statuses helper
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

  // Trigger PDF/Image Viewer Modal
  const openPreview = (doc) => {
    if (!doc?.url) return;
    setPreviewUrl(doc.url);
    setPreviewTitle(doc.filename);
    setPreviewType(doc.mimetype);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      {/* Top Navbar */}
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

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 relative z-10">
        
        {/* Welcome banner */}
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

        {/* Metrics cards */}
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

        {/* Grid for Branch Details & Credit Policy Guidelines */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex">
            {/* Bank Branch and Officer Info */}
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
            {/* Confidential Credit Rules & Policy Guidelines */}
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
                  
                  {/* Left Panel: Confidential Policy Documents */}
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
                                Saving...
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

                  {/* Right Panel: Live Underwriting Policy Auditor */}
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

                          {/* Rule Checks */}
                          <div className="space-y-2 text-[11px]">
                            {/* Rule 1: Turnover */}
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

                            {/* Rule 2: Risk Rating */}
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

                            {/* Rule 3: Collateral Requirement */}
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

                            {/* Rule 4: Mandatory Documents */}
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

                          {/* Summary Recommendation */}
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

        {/* Incoming Applications Queue */}
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

      </main>

      {/* =================================================================== */}
      {/* CASE REVIEW MODAL */}
      {/* =================================================================== */}
      {selectedApp && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl animate-scale-up my-8 max-h-[90vh] flex flex-col justify-between">
            
            {/* Modal Header */}
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

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              
              {/* STATUS TIMELINE */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  Status Progression Timeline
                </h4>
                
                {/* Horizontal Timeline Tracker */}
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

                    // Determine step styling
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

              {/* Grid detail blocks */}
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Column 1: Financial & Parameters */}
                <div className="space-y-4">
                  {/* Loan Parameters */}
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

                  {/* Business & Promoter details */}
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

                {/* Column 2: Uploads Audit & Behavioural */}
                <div className="space-y-4">
                  {/* Documents Audit list */}
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

                  {/* Behavioural evaluation */}
                  <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl space-y-2">
                    <h5 className="font-bold text-slate-300 border-b border-white/5 pb-1">Behavioural evaluation</h5>
                    <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
                      <div>
                        <span className="text-slate-300 block text-[9px] uppercase tracking-wider">Q1: Challenges</span>
                        <p className="text-white leading-normal italic text-[11px]">"{selectedApp.behavioural_questions?.business_challenges}"</p>
                      </div>
                      <div>
                        <span className="text-slate-300 block text-[9px] uppercase tracking-wider">Q2: Repayment flow</span>
                        <p className="text-white leading-normal italic text-[11px]">"{selectedApp.behavioural_questions?.repayment_plan}"</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* STATUS CHANGE FORM SECTION */}
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
                      {/* Target status */}
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

                      {/* Notes / Comment */}
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

                    {/* Missing Document Selectors (Conditional) */}
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

              {/* STATUS HISTORY ACTIVITY LOG */}
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
                    {isModalEditing ? 'EDIT MODE' : doc.is_system_default ? 'CONFIDENTIAL // BANK INTERNAL USE ONLY' : 'BANK INTERNAL USE ONLY // CUSTOM POLICY'}
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

              {/* Modal Content */}
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
                          Saving...
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
