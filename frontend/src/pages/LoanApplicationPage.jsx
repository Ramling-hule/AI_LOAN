import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Calculator,
  ShieldCheck,
  FileText,
  Sparkles,
  Loader2,
  AlertCircle,
  UploadCloud,
  Trash2,
  Eye,
  ChevronRight,
  ChevronLeft,
  Save,
  Check,
  FileCheck2,
} from 'lucide-react';

import { useAuth } from '@/context/AuthContext.jsx';
import { loanApi } from '@/api/loan.api.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { Progress } from '@/components/ui/progress.jsx';

export default function LoanApplicationPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  
  const [currentStep, setCurrentStep] = useState(1);
  const [draftId, setDraftId] = useState(location.state?.draftId || null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [partnerBanks, setPartnerBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [autoSaveStatus, setAutoSaveStatus] = useState('');

  
  const [formData, setFormData] = useState({
    bank_name: location.state?.bankName || '',
    amount: 1000000,
    tenure: 12,
    purpose: 'working_capital',
    revenue: 500000,
    business_info: {
      legal_name: '',
      registration_type: 'pvt_ltd',
      gstin: '',
      incorporation_date: '',
      industry_type: '',
    },
    financial_info: {
      annual_turnover: '',
      net_profit: '',
      existing_loans_count: 0,
      existing_loan_emi: 0,
    },
    behavioural_questions: {
      business_challenges: '',
      repayment_plan: '',
      future_goals: '',
      integrity_check: false,
    },
  });

  
  const [uploadedDocs, setUploadedDocs] = useState({});
  const [uploadingDocs, setUploadingDocs] = useState({}); 

  
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewType, setPreviewType] = useState('');

  
  useEffect(() => {
    const initPage = async () => {
      try {
        setLoading(true);
        const { data } = await loanApi.getPartnerBanks();
        setPartnerBanks(data.data);

        if (draftId) {
          console.log(`Loading existing draft ID: ${draftId}`);
          const draftRes = await loanApi.getById(draftId);
          const draft = draftRes.data.data;
          
          setFormData({
            bank_name: draft.bank_name || '',
            amount: draft.amount || 1000000,
            tenure: draft.tenure || 12,
            purpose: draft.purpose || 'working_capital',
            revenue: draft.revenue || 500000,
            business_info: {
              legal_name: draft.business_info?.legal_name || '',
              registration_type: draft.business_info?.registration_type || 'pvt_ltd',
              gstin: draft.business_info?.gstin || '',
              incorporation_date: draft.business_info?.incorporation_date ? new Date(draft.business_info.incorporation_date).toISOString().split('T')[0] : '',
              industry_type: draft.business_info?.industry_type || '',
            },
            financial_info: {
              annual_turnover: draft.financial_info?.annual_turnover || '',
              net_profit: draft.financial_info?.net_profit || '',
              existing_loans_count: draft.financial_info?.existing_loans_count || 0,
              existing_loan_emi: draft.financial_info?.existing_loan_emi || 0,
            },
            behavioural_questions: {
              business_challenges: draft.behavioural_questions?.business_challenges || '',
              repayment_plan: draft.behavioural_questions?.repayment_plan || '',
              future_goals: draft.behavioural_questions?.future_goals || '',
              integrity_check: draft.behavioural_questions?.integrity_check || false,
            },
          });
          setUploadedDocs(draft.documents || {});
          setCurrentStep(draft.current_step || 1);
        }
      } catch (err) {
        console.error('Failed to load application data:', err);
        setErrorMsg('Failed to fetch existing draft details. Please try again.');
      } finally {
        setLoadingBanks(false);
        setLoading(false);
      }
    };
    initPage();
  }, [draftId]);

  
  const updateBusinessInfo = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      business_info: { ...prev.business_info, [field]: value },
    }));
  };

  const updateFinancialInfo = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      financial_info: { ...prev.financial_info, [field]: value },
    }));
  };

  const updateBehavioural = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      behavioural_questions: { ...prev.behavioural_questions, [field]: value },
    }));
  };

  
  const interestRate = 11.5;
  const monthlyInterest = interestRate / 12 / 100;
  const emi = formData.amount && formData.tenure
    ? Math.round(
        (formData.amount * monthlyInterest * Math.pow(1 + monthlyInterest, formData.tenure)) /
          (Math.pow(1 + monthlyInterest, formData.tenure) - 1)
      )
    : 0;

  
  const validateStep = (step) => {
    setErrorMsg('');
    switch (step) {
      case 1:
        if (!formData.bank_name) return 'Please select a Lender Bank';
        if (!formData.business_info.legal_name) return 'Legal Business Name is required';
        if (!formData.business_info.registration_type) return 'Registration Type is required';
        if (!formData.business_info.gstin) return 'GSTIN is required';
        if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.business_info.gstin.toUpperCase())) {
          return 'Please provide a valid Indian GSTIN format';
        }
        if (!formData.business_info.incorporation_date) return 'Incorporation Date is required';
        if (!formData.business_info.industry_type) return 'Industry Sector is required';
        break;
      case 2:
        if (formData.financial_info.annual_turnover === '' || isNaN(formData.financial_info.annual_turnover)) {
          return 'Annual Turnover is required';
        }
        if (formData.financial_info.net_profit === '' || isNaN(formData.financial_info.net_profit)) {
          return 'Net Profit is required';
        }
        break;
      case 3:
        if (!formData.amount || formData.amount < 100000) return 'Minimum Loan Amount is ₹100,000';
        if (!formData.tenure) return 'Please select a Loan Tenure';
        if (!formData.purpose) return 'Please select Loan Purpose';
        if (!formData.revenue || formData.revenue < 10000) return 'Monthly Turnover must be positive';
        break;
      case 4:
        
        if (!uploadedDocs.pan?.url) return 'PAN Card upload is required';
        if (!uploadedDocs.aadhaar?.url) return 'Aadhaar Card upload is required';
        if (!uploadedDocs.gst_certificate?.url) return 'GST Registration Certificate is required';
        break;
      case 5:
        
        if (!uploadedDocs.bank_statements?.url) return '6-Month Bank Statement is required';
        if (!uploadedDocs.itr?.url) return 'Income Tax Returns (ITR) is required';
        if (!uploadedDocs.balance_sheets?.url) return 'Audited Balance Sheet is required';
        if (!uploadedDocs.profit_loss?.url) return 'Profit & Loss Statement is required';
        break;
      case 6:
        
        if (!uploadedDocs.loan_documents?.url) return 'Collateral/Sanctioned Loan Documents are required';
        break;
      case 7:
        
        if (!formData.behavioural_questions.business_challenges) return 'Please answer business challenges question';
        if (!formData.behavioural_questions.repayment_plan) return 'Please answer repayment plan question';
        if (!formData.behavioural_questions.future_goals) return 'Please answer future goals question';
        if (!formData.behavioural_questions.integrity_check) return 'You must accept the truthfulness declaration';
        break;
      default:
        return '';
    }
    return '';
  };

  
  const handleSaveDraft = async (nextStep = null) => {
    setErrorMsg('');
    try {
      setAutoSaveStatus('Saving...');
      let currentId = draftId;

      if (!currentId) {
        
        const res = await loanApi.createDraft(formData.bank_name);
        currentId = res.data.data._id ?? res.data.data.id;
        setDraftId(currentId);
      }

      const savePayload = {
        ...formData,
        current_step: nextStep !== null ? nextStep : currentStep,
      };

      const res = await loanApi.saveDraft(currentId, savePayload);
      setFormData((prev) => ({
        ...prev,
        ...res.data.data,
      }));
      setAutoSaveStatus('Draft saved');
      setTimeout(() => setAutoSaveStatus(''), 2000);
      return currentId;
    } catch (err) {
      console.error('Failed to save draft:', err);
      setErrorMsg(err.response?.data?.message || 'Failed to auto-save application progress.');
      setAutoSaveStatus('Error saving');
      return null;
    }
  };

  const handleNext = async () => {
    const error = validateStep(currentStep);
    if (error) {
      setErrorMsg(error);
      return;
    }

    const savedId = await handleSaveDraft(currentStep + 1);
    if (savedId) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  
  const handleFileUpload = async (docType, file) => {
    if (!file) return;

    
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (!allowedTypes.includes(file.type)) {
      setErrorMsg('Invalid file format. Please upload PDF, PNG, JPEG, or Excel.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File size exceeds 10MB limit.');
      return;
    }

    setErrorMsg('');
    let currentId = draftId;

    try {
      if (!currentId) {
        
        if (!formData.bank_name) {
          setErrorMsg('Please select a Partner Lender bank on Step 1 before uploading files');
          return;
        }
        const res = await loanApi.createDraft(formData.bank_name);
        currentId = res.data.data._id ?? res.data.data.id;
        setDraftId(currentId);
      }

      setUploadingDocs((prev) => ({ ...prev, [docType]: 5 })); 

      const uploadRes = await loanApi.uploadDocument(currentId, docType, file, (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setUploadingDocs((prev) => ({ ...prev, [docType]: percent }));
      });

      setUploadedDocs((prev) => ({
        ...prev,
        [docType]: uploadRes.data.data,
      }));

    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.message || `Failed to upload ${docType}. Please try again.`);
    } finally {
      setUploadingDocs((prev) => {
        const next = { ...prev };
        delete next[docType];
        return next;
      });
    }
  };

  const handleFileDelete = async (docType) => {
    if (!window.confirm('Are you sure you want to remove this uploaded document?')) return;
    setErrorMsg('');
    try {
      await loanApi.deleteDocument(draftId, docType);
      setUploadedDocs((prev) => {
        const next = { ...prev };
        delete next[docType];
        return next;
      });
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.message || 'Failed to remove document.');
    }
  };

  
  const handleSubmitApplication = async () => {
    const error = validateStep(7);
    if (error) {
      setErrorMsg(error);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await loanApi.submitLoan(draftId);
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.message || 'Failed to submit loan application. Please verify all information.');
    } finally {
      setSubmitting(false);
    }
  };

  
  const openPreview = (doc) => {
    if (!doc?.url) return;
    setPreviewUrl(doc.url);
    setPreviewTitle(doc.filename);
    setPreviewType(doc.mimetype);
  };

  
  const DropZone = ({ docType, label }) => {
    const [dragging, setDragging] = useState(false);
    const existingFile = uploadedDocs[docType];
    const progress = uploadingDocs[docType];

    const onDragOver = (e) => {
      e.preventDefault();
      setDragging(true);
    };

    const onDragLeave = () => {
      setDragging(false);
    };

    const onDrop = (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileUpload(docType, file);
    };

    if (progress !== undefined) {
      return (
        <div className="border border-dashed border-blue-500/30 rounded-xl p-5 bg-blue-500/[0.02] flex flex-col items-center justify-center space-y-3 min-h-[110px]">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <div className="w-full max-w-[150px] space-y-1">
            <Progress value={progress} className="h-1.5" />
            <span className="text-[10px] text-slate-300 block text-center">Uploading... {progress}%</span>
          </div>
        </div>
      );
    }

    if (existingFile) {
      return (
        <div className="border border-white/5 bg-white/[0.01] hover:bg-white/[0.02] transition-colors rounded-xl p-3.5 flex items-center justify-between min-h-[110px]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-white truncate block">{existingFile.filename}</span>
              <span className="text-[9px] text-slate-300 block font-mono">
                {(existingFile.size / (1024 * 1024)).toFixed(2)} MB · {new Date(existingFile.uploaded_at).toISOString().split('T')[0]}
              </span>
            </div>
          </div>

          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => openPreview(existingFile)}
              className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-all"
              title="Preview Document"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleFileDelete(docType)}
              className="p-2 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-lg transition-all"
              title="Delete File"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border border-dashed rounded-xl p-5 transition-all text-center flex flex-col items-center justify-center min-h-[110px] cursor-pointer ${
          dragging
            ? 'border-blue-500 bg-blue-500/5 scale-[0.99]'
            : 'border-white/10 hover:border-blue-500/30 bg-white/[0.005] hover:bg-white/[0.01]'
        }`}
      >
        <input
          type="file"
          id={`file-input-${docType}`}
          className="hidden"
          onChange={(e) => handleFileUpload(docType, e.target.files?.[0])}
        />
        <label htmlFor={`file-input-${docType}`} className="cursor-pointer space-y-1.5 block w-full">
          <UploadCloud className="w-6 h-6 text-slate-300 mx-auto" />
          <div>
            <span className="text-xs font-semibold text-slate-300 block">{label}</span>
            <span className="text-[10px] text-slate-300 block">Drag & drop or Click to upload PDF, Image, Excel</span>
          </div>
        </label>
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            try {
              setErrorMsg('');
              const response = await fetch(`/mock-docs/${docType}.pdf`);
              if (!response.ok) throw new Error('Demo document not found');
              const blob = await response.blob();
              const file = new File([blob], `${docType}_mock.pdf`, { type: 'application/pdf' });
              await handleFileUpload(docType, file);
            } catch (err) {
              console.error('Failed to load demo document:', err);
              setErrorMsg(`Failed to load demo document for ${docType}`);
            }
          }}
          className="mt-3.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/30 text-blue-400 hover:text-blue-300 rounded-lg text-[10px] font-semibold transition-all inline-flex items-center gap-1 cursor-pointer"
        >
          <Sparkles className="w-3 h-3" /> Use Demo Document
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 animate-bounce" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white">Application Submitted</h1>
            <p className="text-slate-400 text-sm font-medium">
              Your capital application has been logged and queue routing is active.
            </p>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 text-left space-y-3">
            <h4 className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Underwriting Score Engine Run:
            </h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-300 block">Requested Amount</span>
                <span className="text-slate-300 font-semibold">₹{parseInt(formData.amount).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-300 block">Interest Rate Estimate</span>
                <span className="text-slate-300 font-semibold">{interestRate}% p.a.</span>
              </div>
              <div>
                <span className="text-slate-300 block">Monthly EMI</span>
                <span className="text-slate-300 font-semibold">₹{emi.toLocaleString()} / mo</span>
              </div>
              <div>
                <span className="text-slate-300 block">Initial Status</span>
                <span className="text-amber-400 font-medium">Underwriting Review</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-blue-500/20"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between relative overflow-hidden">
      {}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      {}
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 flex flex-col justify-center relative z-10">
        
        {}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={async () => {
              if (draftId) await handleSaveDraft();
              navigate('/dashboard');
            }}
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>

          {}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {autoSaveStatus && (
              <span className="flex items-center gap-1 text-[10px] text-blue-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                {autoSaveStatus}
              </span>
            )}
            <button
              onClick={() => handleSaveDraft()}
              className="p-1.5 border border-white/5 bg-white/[0.01] hover:border-white/10 rounded-lg flex items-center gap-1 text-[10px] text-slate-300 hover:text-white transition-all font-semibold"
            >
              <Save className="w-3.5 h-3.5" />
              Save Draft
            </button>
          </div>
        </div>

        {}
        <div className="mb-6 space-y-2">
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            <span>Step {currentStep} of 8: {
              currentStep === 1 ? 'Business Info' :
              currentStep === 2 ? 'Financial Info' :
              currentStep === 3 ? 'Loan details' :
              currentStep === 4 ? 'KYC Uploads' :
              currentStep === 5 ? 'Financial Uploads' :
              currentStep === 6 ? 'Collateral Docs' :
              currentStep === 7 ? 'Behavioural evaluation' :
              'Review & Submit'
            }</span>
            <span>{Math.round((currentStep / 8) * 100)}% Complete</span>
          </div>
          <Progress value={(currentStep / 8) * 100} className="h-1.5" />
        </div>

        {}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl grid md:grid-cols-4 min-h-[500px]">
          
          {}
          <div className="md:col-span-3 p-6 sm:p-8 space-y-6 flex flex-col justify-between">
            <div>
              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3.5 rounded-xl flex items-center gap-2 mb-4 animate-shake">
                  <AlertCircle className="w-4.5 h-4.5 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {}
              {currentStep === 1 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Building2 className="w-5.5 h-5.5 text-blue-400" />
                        1. Business Profile Details
                      </h2>
                      <p className="text-slate-400 text-xs">Enter legal registration details and associate partner lender.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          business_info: {
                            legal_name: 'TechNova Solutions Pvt Ltd',
                            registration_type: 'pvt_ltd',
                            gstin: '27AAAHA8392M1ZA',
                            incorporation_date: '2022-03-15',
                            industry_type: 'AI Software & IT Services',
                          }
                        }));
                      }}
                      className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Autofill Demo
                    </button>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    {}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300">Lender Bank</label>
                      <select
                        value={formData.bank_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      >
                        <option value="">Select Partner Bank...</option>
                        {partnerBanks.map((b) => (
                          <option key={b.id} value={b.name}>
                            {b.name} ({b.branch})
                          </option>
                        ))}
                      </select>
                    </div>

                    {}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Legal Business Name</label>
                      <input
                        type="text"
                        value={formData.business_info.legal_name}
                        onChange={(e) => updateBusinessInfo('legal_name', e.target.value)}
                        placeholder="Sharma Enterprises Ltd"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      />
                    </div>

                    {}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Entity Structure</label>
                      <select
                        value={formData.business_info.registration_type}
                        onChange={(e) => updateBusinessInfo('registration_type', e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      >
                        <option value="sole_proprietorship">Sole Proprietorship</option>
                        <option value="partnership">Partnership</option>
                        <option value="pvt_ltd">Private Limited Company</option>
                        <option value="llp">Limited Liability Partnership (LLP)</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    {}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">GSTIN Registration</label>
                      <input
                        type="text"
                        value={formData.business_info.gstin}
                        onChange={(e) => updateBusinessInfo('gstin', e.target.value.toUpperCase())}
                        placeholder="27AAAAA1111A1Z1"
                        maxLength={15}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all font-mono uppercase"
                      />
                    </div>

                    {}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Incorporation Date</label>
                      <input
                        type="date"
                        value={formData.business_info.incorporation_date}
                        onChange={(e) => updateBusinessInfo('incorporation_date', e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      />
                    </div>

                    {}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300">Industry / Manufacturing Sector</label>
                      <input
                        type="text"
                        value={formData.business_info.industry_type}
                        onChange={(e) => updateBusinessInfo('industry_type', e.target.value)}
                        placeholder="e.g. Pharmaceutical Manufacturing, Textiles, IT Services"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}

              {}
              {currentStep === 2 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Calculator className="w-5.5 h-5.5 text-blue-400" />
                        2. Corporate Financial Details
                      </h2>
                      <p className="text-slate-400 text-xs">Enter your audited financial stats for initial score check.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          financial_info: {
                            annual_turnover: 4200000,
                            net_profit: 1000000,
                            existing_loans_count: 1,
                            existing_loan_emi: 53500,
                          }
                        }));
                      }}
                      className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Autofill Demo
                    </button>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Annual Turnover (INR)</label>
                      <input
                        type="number"
                        value={formData.financial_info.annual_turnover}
                        onChange={(e) => updateFinancialInfo('annual_turnover', Number(e.target.value))}
                        placeholder="₹50,00,000"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Net Profit after Taxes (INR)</label>
                      <input
                        type="number"
                        value={formData.financial_info.net_profit}
                        onChange={(e) => updateFinancialInfo('net_profit', Number(e.target.value))}
                        placeholder="₹12,00,000"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Active Debt / Existing Loans Count</label>
                      <input
                        type="number"
                        value={formData.financial_info.existing_loans_count}
                        onChange={(e) => updateFinancialInfo('existing_loans_count', Number(e.target.value))}
                        placeholder="0"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Existing Loan Monthly EMI (Total INR)</label>
                      <input
                        type="number"
                        value={formData.financial_info.existing_loan_emi}
                        onChange={(e) => updateFinancialInfo('existing_loan_emi', Number(e.target.value))}
                        placeholder="₹45,000"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}

              {}
              {currentStep === 3 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Calculator className="w-5.5 h-5.5 text-blue-400" />
                        3. Loan Request Parameters
                      </h2>
                      <p className="text-slate-400 text-xs">Specify your funding requirements.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          amount: 1000000,
                          tenure: 12,
                          purpose: 'working_capital',
                          revenue: 350000,
                        }));
                      }}
                      className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Autofill Demo
                    </button>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Requested Principal (INR)</label>
                      <input
                        type="number"
                        value={formData.amount}
                        onChange={(e) => setFormData((prev) => ({ ...prev, amount: Number(e.target.value) }))}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Tenure (Months)</label>
                      <select
                        value={formData.tenure}
                        onChange={(e) => setFormData((prev) => ({ ...prev, tenure: Number(e.target.value) }))}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      >
                        <option value={6}>6 Months</option>
                        <option value={12}>12 Months</option>
                        <option value={24}>24 Months</option>
                        <option value={36}>36 Months</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Purpose of Loan</label>
                      <select
                        value={formData.purpose}
                        onChange={(e) => setFormData((prev) => ({ ...prev, purpose: e.target.value }))}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      >
                        <option value="working_capital">Working Capital</option>
                        <option value="equipment">Equipment Purchase</option>
                        <option value="expansion">Business Expansion</option>
                        <option value="inventory">Inventory Management</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">Average Monthly sales / Turnover (INR)</label>
                      <input
                        type="number"
                        value={formData.revenue}
                        onChange={(e) => setFormData((prev) => ({ ...prev, revenue: Number(e.target.value) }))}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}

              {}
              {currentStep === 4 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <FileText className="w-5.5 h-5.5 text-blue-400" />
                      4. KYC Identity Credentials
                    </h2>
                    <p className="text-slate-400 text-xs">Provide required ID credentials for key promoter checks.</p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <DropZone docType="pan" label="Promoter / Entity PAN Card (PDF/JPEG)" />
                    <DropZone docType="aadhaar" label="Promoter Aadhaar Card (PDF/JPEG)" />
                    <div className="sm:col-span-2">
                      <DropZone docType="gst_certificate" label="GST Registration Certificate (GST-06)" />
                    </div>
                  </div>
                </div>
              )}

              {}
              {currentStep === 5 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <FileText className="w-5.5 h-5.5 text-blue-400" />
                      5. Audit Financial Documents
                    </h2>
                    <p className="text-slate-400 text-xs">Upload accounting logs to verify turnover and sales turnover.</p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <DropZone docType="bank_statements" label="6-Months Current Account Statement" />
                    <DropZone docType="itr" label="ITR Returns Acknowledgement (ITR-V)" />
                    <DropZone docType="balance_sheets" label="Audited Balance Sheet (Latest FY)" />
                    <DropZone docType="profit_loss" label="Profit & Loss Statement (Latest FY)" />
                  </div>
                </div>
              )}

              {}
              {currentStep === 6 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <FileText className="w-5.5 h-5.5 text-blue-400" />
                      6. Collateral Credit Documents
                    </h2>
                    <p className="text-slate-400 text-xs">Upload sanction letters or property records for collateral validation.</p>
                  </div>

                  <div className="space-y-4">
                    <DropZone docType="loan_documents" label="Sanctioned Letters / Outstanding Loan Contracts" />
                  </div>
                </div>
              )}

              {}
              {currentStep === 7 && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-5.5 h-5.5 text-blue-400" />
                        7. Behavioural Underwriting Questions
                      </h2>
                      <p className="text-slate-400 text-xs">Provide business context questions to run final assessment.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          behavioural_questions: {
                            business_challenges: 'We are facing temporary working capital constraints due to longer billing cycles with corporate clients.',
                            repayment_plan: 'We will service the EMI from AWS and IT services receivables, which are settled monthly.',
                            future_goals: 'We target to scale our engineering capacity and expand operations to Bangalore next year.',
                            integrity_check: true,
                          }
                        }));
                      }}
                      className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 rounded-lg text-[10px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Autofill Demo
                    </button>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="space-y-1.5">
                      <label className="block font-semibold text-slate-300">
                        Q1: What are the primary operational or inventory challenges your business is currently facing?
                      </label>
                      <textarea
                        value={formData.behavioural_questions.business_challenges}
                        onChange={(e) => updateBehavioural('business_challenges', e.target.value)}
                        placeholder="Explain briefly..."
                        className="w-full h-20 bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all resize-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-semibold text-slate-300">
                        Q2: Detail your cash flow pipeline and target source of repayment for this principal.
                      </label>
                      <textarea
                        value={formData.behavioural_questions.repayment_plan}
                        onChange={(e) => updateBehavioural('repayment_plan', e.target.value)}
                        placeholder="Detail expected receivables..."
                        className="w-full h-20 bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all resize-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-semibold text-slate-300">
                        Q3: What are your commercial expansion goals or targets over the next 12-24 months?
                      </label>
                      <textarea
                        value={formData.behavioural_questions.future_goals}
                        onChange={(e) => updateBehavioural('future_goals', e.target.value)}
                        placeholder="Describe expansion/inventory targets..."
                        className="w-full h-20 bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all resize-none"
                      />
                    </div>

                    <div className="flex items-start gap-2 pt-2">
                      <input
                        type="checkbox"
                        id="integrity-checkbox"
                        checked={formData.behavioural_questions.integrity_check}
                        onChange={(e) => updateBehavioural('integrity_check', e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded accent-blue-500 bg-slate-950 border border-white/10"
                      />
                      <label htmlFor="integrity-checkbox" className="text-[11px] text-slate-400 select-none cursor-pointer leading-normal">
                        I confirm that all provided business and financial records are accurate, and no legal/insolvency cases are pending against the promoters.
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {}
              {currentStep === 8 && (
                <div className="space-y-4 animate-fade-in max-h-[60vh] overflow-y-auto pr-2">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <FileCheck2 className="w-5.5 h-5.5 text-emerald-400" />
                      8. Final Application Review
                    </h2>
                    <p className="text-slate-400 text-xs">Verify all details before locking submission.</p>
                  </div>

                  <div className="space-y-4 text-xs">
                    {}
                    <div className="grid sm:grid-cols-2 gap-4 bg-white/[0.01] border border-white/5 rounded-2xl p-4">
                      <div>
                        <span className="text-slate-300 block">Lender Bank</span>
                        <span className="text-white font-semibold">{formData.bank_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-300 block">Requested Amount</span>
                        <span className="text-white font-semibold font-mono">₹{formData.amount.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-300 block">Tenure Selection</span>
                        <span className="text-white font-semibold">{formData.tenure} Months</span>
                      </div>
                      <div>
                        <span className="text-slate-300 block">Monthly Sales / Turnover</span>
                        <span className="text-white font-semibold font-mono">₹{formData.revenue.toLocaleString()}</span>
                      </div>
                    </div>

                    {}
                    <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4 space-y-2">
                      <h4 className="text-slate-300 font-bold border-b border-white/5 pb-1">Business details</h4>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-300 block">Entity Name</span>
                          <span className="text-white font-medium">{formData.business_info.legal_name}</span>
                        </div>
                        <div>
                          <span className="text-slate-300 block">Structure</span>
                          <span className="text-white capitalize">{formData.business_info.registration_type?.replace('_', ' ')}</span>
                        </div>
                        <div>
                          <span className="text-slate-300 block">GSTIN</span>
                          <span className="text-white font-mono">{formData.business_info.gstin}</span>
                        </div>
                        <div>
                          <span className="text-slate-300 block">Incorporation</span>
                          <span className="text-white">{formData.business_info.incorporation_date}</span>
                        </div>
                      </div>
                    </div>

                    {}
                    <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4 space-y-2">
                      <h4 className="text-slate-300 font-bold border-b border-white/5 pb-1">Financial metrics</h4>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-300 block">Annual Turnover</span>
                          <span className="text-white font-semibold font-mono">₹{formData.financial_info.annual_turnover?.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-slate-300 block">Net Profit</span>
                          <span className="text-white font-semibold font-mono">₹{formData.financial_info.net_profit?.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {}
                    <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4 space-y-2">
                      <h4 className="text-slate-300 font-bold border-b border-white/5 pb-1.5">Uploaded Documents Audit</h4>
                      <div className="space-y-1.5">
                        {Object.entries(uploadedDocs).map(([key, doc]) => (
                          <div key={key} className="flex justify-between items-center bg-slate-950 p-2 rounded-xl border border-white/5">
                            <span className="text-slate-400 capitalize">{key.replace('_', ' ')}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-300 font-mono">{(doc.size / (1024 * 1024)).toFixed(2)} MB</span>
                              <button
                                onClick={() => openPreview(doc)}
                                className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5"
                              >
                                Preview <Eye className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {}
            <div className="flex justify-between pt-4 border-t border-white/5">
              <button
                onClick={handleBack}
                disabled={currentStep === 1}
                className="px-4 py-2 border border-white/5 hover:border-white/10 disabled:border-transparent disabled:text-slate-400 text-slate-400 hover:text-white rounded-xl text-xs transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>

              {currentStep < 8 ? (
                <button
                  onClick={handleNext}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-1 shadow-lg shadow-blue-600/10"
                >
                  Save & Continue
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleSubmitApplication}
                  disabled={submitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 animate-pulse"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Submitting Application...
                    </>
                  ) : (
                    <>
                      Final Submit Application
                      <Check className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {}
          <div className="md:col-span-1 bg-blue-600/5 border-t md:border-t-0 md:border-l border-white/10 p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-white flex items-center gap-2 border-b border-white/5 pb-2 text-xs">
                <Calculator className="w-4 h-4 text-blue-400" />
                EMI Estimator
              </h3>

              <div className="space-y-3.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Principal Requested</span>
                  <span className="text-white font-semibold">₹{formData.amount ? parseInt(formData.amount).toLocaleString() : 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Interest Rate Estimate</span>
                  <span className="text-white font-semibold">{interestRate}% p.a.</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tenure Selection</span>
                  <span className="text-white font-semibold">{formData.tenure} Months</span>
                </div>
                <div className="border-t border-white/5 pt-2 flex justify-between items-baseline">
                  <span className="text-slate-300 font-semibold">Monthly EMI</span>
                  <span className="text-blue-400 text-sm font-bold">₹{emi.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-2 text-[10px] text-slate-300 leading-normal">
                <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <span>
                  Applications are fully encrypted. Initial credit check calculations run asynchronously and do not alter credit score histories.
                </span>
              </div>
              <div className="flex items-start gap-2 text-[10px] text-slate-300 leading-normal">
                <FileText className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <span>
                  Lending partners are RBI authorized. Underwriting metrics verify sales ledger turnover details.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-scale-up">
            
            {}
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

            {}
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
    </div>
  );
}
