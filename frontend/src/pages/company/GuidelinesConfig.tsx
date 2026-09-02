import React, { useEffect, useState, useRef } from 'react';
import { companyApi } from '../../api/company';
import { documentsApi } from '../../api/documents';
import { storageUtil } from '../../utils/storage';
import {
  FileText,
  Upload,
  Save,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  FileCode,
  CheckCircle,
  Edit2,
  X,
  FolderInput
} from 'lucide-react';

type Tab = 'guidelines' | 'blueprint';

interface ParsedRule {
  raw: string;
  category: string;
  requirement: string;
  required: boolean;
  active: boolean;
}

const TOKENS = `
  .dv-scope {
    font-family: 'Public Sans', ui-sans-serif, system-ui, sans-serif;
    color: var(--ink);
  }
  .dv-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

  /* Perforated Manifest Tickets */
  .dv-ticket {
    position: relative;
    display: grid;
    grid-template-columns: 48px 1px 1fr;
    align-items: stretch;
    background: var(--paper-2);
    border: 1px solid var(--line);
    transition: border-color 150ms ease, background 150ms ease;
    cursor: pointer;
    text-align: left;
    border-radius: 2px;
    overflow: hidden;
    width: 100%;
  }
  .dv-ticket:hover:not(:disabled) { border-color: var(--line-strong); }
  .dv-ticket[data-active="true"] {
    border-color: var(--verify);
    background: var(--verify-soft);
  }
  .dv-ticket-perf {
    background-image: radial-gradient(circle, var(--paper) 3px, transparent 3.5px);
    background-size: 8px 12px;
    background-position: center;
    background-repeat: repeat-y;
    width: 8px;
    position: relative;
    left: -4px;
  }
  .dv-ticket[data-active="true"] .dv-ticket-perf {
    background-image: radial-gradient(circle, var(--verify-soft) 3px, transparent 3.5px);
  }

  /* Viewfinder Scanner Motif */
  .dv-scan-zone {
    position: relative;
    border: 1px dashed var(--line-strong);
    background: #fff;
    border-radius: 2px;
    overflow: hidden;
    transition: border-color 150ms ease, background 150ms ease;
  }
  .dv-scan-zone[data-drag="true"] { border-color: var(--verify); border-style: solid; background: var(--verify-soft); }
  .dv-bracket { position: absolute; width: 14px; height: 14px; border-color: var(--ink); opacity: 0.5; }
  .dv-scan-zone[data-drag="true"] .dv-bracket { border-color: var(--verify); opacity: 1; }
  .dv-bracket.tl { top: 8px; left: 8px; border-top: 2px solid; border-left: 2px solid; }
  .dv-bracket.tr { top: 8px; right: 8px; border-top: 2px solid; border-right: 2px solid; }
  .dv-bracket.bl { bottom: 8px; left: 8px; border-bottom: 2px solid; border-left: 2px solid; }
  .dv-bracket.br { bottom: 8px; right: 8px; border-bottom: 2px solid; border-right: 2px solid; }

  .dv-scanline {
    position: absolute; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, var(--verify), transparent);
    box-shadow: 0 0 6px var(--verify);
    animation: dv-sweep 1.8s linear infinite;
    opacity: 0;
  }
  .dv-scan-zone[data-drag="true"] .dv-scanline { opacity: 1; }
  @keyframes dv-sweep { 0% { top: 6%; } 100% { top: 94%; } }

  /* Rule Cards */
  .dv-rule-card {
    position: relative;
    padding: 16px;
    padding-left: 54px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 2px;
    transition: all 120ms ease;
  }
  .dv-rule-card:hover {
    border-color: var(--line-strong);
  }
  .dv-rule-card[data-active="false"] {
    background: var(--paper);
    opacity: 0.85;
  }

  .dv-ledger-code {
    position: absolute; left: 16px; top: 16px; width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center; font-size: 10px;
    border: 1px solid var(--line-strong); color: var(--ink);
    border-radius: 2px;
    font-weight: 600;
    background: var(--paper-2);
  }

  /* Active Stamp indicator */
  .dv-active-square {
    width: 11px; height: 11px; border-radius: 2px; display: inline-flex; align-items: center; justify-content: center; transition: all 120ms ease;
  }
  .dv-active-square[data-active="true"] {
    background: var(--verify);
    border: 1px solid var(--verify);
  }
  .dv-active-square[data-active="false"] {
    background: transparent;
    border: 1px solid var(--line-strong);
  }

  /* Button styles */
  .dv-btn-flat {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    color: var(--ink-soft);
    font-size: 11px;
    font-weight: 600;
    padding: 6px 12px;
    transition: all 120ms ease;
    border-radius: 2px;
  }
  .dv-btn-flat:hover {
    border-color: var(--ink);
    color: var(--ink);
    background: var(--paper-2);
  }
  .dv-btn-flat-rose {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    color: var(--uncleared);
    font-size: 11px;
    font-weight: 600;
    padding: 6px 12px;
    transition: all 120ms ease;
    border-radius: 2px;
  }
  .dv-btn-flat-rose:hover {
    border-color: var(--uncleared);
    background: var(--uncleared-soft);
  }
  .dv-btn-solid {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--ink);
    color: var(--paper);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 10px 20px;
    border: 1px solid transparent;
    border-radius: 2px;
    transition: background 120ms ease;
  }
  .dv-btn-solid:hover:not(:disabled) {
    background: #2b313b;
  }
  .dv-btn-outline {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--paper-2);
    border: 1px solid var(--line-strong);
    color: var(--ink);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 10px 20px;
    border-radius: 2px;
    transition: all 120ms ease;
  }
  .dv-btn-outline:hover:not(:disabled) {
    background: var(--paper-2);
    border-color: var(--ink);
  }

  .dv-field-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    color: var(--ink);
    border-radius: 2px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 500;
  }
`;

export const GuidelinesConfig: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('guidelines');
  const [guidelines, setGuidelines] = useState<string[]>([]);
  const [blueprintJson, setBlueprintJson] = useState<string>('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // File upload states
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyDragActive, setPolicyDragActive] = useState(false);
  const policyInputRef = useRef<HTMLInputElement>(null);

  const [blueprintFile, setBlueprintFile] = useState<File | null>(null);
  const [blueprintLoading, _setBlueprintLoading] = useState(false);
  const [blueprintDragActive, setBlueprintDragActive] = useState(false);
  const blueprintInputRef = useRef<HTMLInputElement>(null);

  // Modal and editing states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState('IDENTITY');
  const [modalRequirement, setModalRequirement] = useState('');
  const [modalRequired, setModalRequired] = useState(true);
  const [modalActive, setModalActive] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Policy upload review state
  const [reviewRules, setReviewRules] = useState<string[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);

  // Blueprint interactive editor states
  const [blueprintData, setBlueprintData] = useState<Record<string, string[]>>({});
  const [isJsonView, setIsJsonView] = useState(false);
  const [newDocType, setNewDocType] = useState('');
  const [newFields, setNewFields] = useState<Record<string, string>>({});
  
  const [, setSavingGuidelines] = useState(false);
  const [savingBlueprint, setSavingBlueprint] = useState(false);
  const [isVerifyingGuidelines, setIsVerifyingGuidelines] = useState(false);

  // Parse helper for rules
  const parseRule = (raw: string): ParsedRule => {
    let category = '';
    let required = true;
    let active = true;
    let requirement = raw;

    // 1. Parse Active/Inactive status
    if (requirement.startsWith('Do not evaluate:') || requirement.includes('[Inactive]') || requirement.includes('(Inactive)')) {
      active = false;
      requirement = requirement
        .replace('Do not evaluate:', '')
        .replace('[Inactive]', '')
        .replace('(Inactive)', '')
        .trim();
    }

    // 2. Parse Required/Optional status
    if (requirement.includes('[Optional]') || requirement.includes('(Optional)')) {
      required = false;
      requirement = requirement.replace('[Optional]', '').replace('(Optional)', '').trim();
    } else if (requirement.includes('[Required]') || requirement.includes('(Required)')) {
      required = true;
      requirement = requirement.replace('[Required]', '').replace('(Required)', '').trim();
    }

    // 3. Parse Category prefix like [CATEGORY]
    const categoryMatch = requirement.match(/^\[(.*?)\]/);
    if (categoryMatch) {
      category = categoryMatch[1].trim();
      requirement = requirement.replace(categoryMatch[0], '').trim();
    } else {
      category = getCategoryFromText(requirement);
    }

    // Clean up trailing colons or whitespace
    requirement = requirement.replace(/^:\s*/, '').trim();

    return {
      raw,
      category: category.toUpperCase(),
      requirement,
      required,
      active
    };
  };

  const getCategoryFromText = (text: string): string => {
    const t = text.toLowerCase();
    if (t.includes('cross-document') || t.includes('match the name') || (t.includes('match') && (t.includes('pan') || t.includes('aadhar') || t.includes('aadhaar')))) {
      return 'CROSS-DOCUMENT VALIDATION';
    }
    if (t.includes('pan')) {
      return 'IDENTITY VERIFICATION';
    }
    if (t.includes('aadhar') || t.includes('aadhaar') || t.includes('address')) {
      return 'ADDRESS VERIFICATION';
    }
    if (t.includes('photo') || t.includes('face')) {
      return 'VISUAL VERIFICATION';
    }
    if (t.includes('resume') || t.includes('email') || t.includes('mobile')) {
      return 'IDENTITY';
    }
    return 'GENERAL COMPLIANCE';
  };

  const serializeRule = (rule: Omit<ParsedRule, 'raw'>): string => {
    const parts: string[] = [];
    if (!rule.active) {
      parts.push('Do not evaluate:');
    }
    parts.push(`[${rule.category}]`);
    if (!rule.required) {
      parts.push('(Optional)');
    }
    parts.push(rule.requirement);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };

  const fetchConfig = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await companyApi.getGuidelines();
      setGuidelines(res.guidelines || []);

      const defaultBlueprint = {
        "Resume": [
          "resume_name",
          "resume_email",
          "resume_mobile_no",
          "resume_current_address",
          "resume_father_name",
          "Date of Birth",
          "Gender",
          "Marital Status"
        ],
        "Employee Photo": [
          "Face detected(Y/N)"
        ],
        "PAN": [
          "pan_name",
          "pan_dob",
          "pan_number",
          "pan_father_name"
        ],
        "Aadhar": [
          "aadhar_name",
          "aadhar_dob",
          "aadhar_number",
          "aadhar_father_name",
          "aadhar_address"
        ]
      };

      try {
        const bp = await companyApi.getBlueprint();
        if (bp && bp.blueprint) {
          setBlueprintData(bp.blueprint);
          setBlueprintJson(JSON.stringify(bp.blueprint, null, 2));
        } else {
          setBlueprintData(defaultBlueprint);
          setBlueprintJson(JSON.stringify(defaultBlueprint, null, 2));
        }
      } catch (bpErr) {
        console.warn('Could not load registered blueprint, using defaults.', bpErr);
        setBlueprintData(defaultBlueprint);
        setBlueprintJson(JSON.stringify(defaultBlueprint, null, 2));
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to load company verification guidelines.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  // Run backend Stage-2 verification against all documents already stored
  // in the browser after the guideline configuration has been saved.
  const runGuidelineVerification = async (): Promise<number> => {
    const payload = storageUtil.buildStage2Payload();

    if (!payload.length) {
      console.log('No processed documents found for guideline verification.');
      return 0;
    }

    setIsVerifyingGuidelines(true);

    try {
      console.log('Starting Stage-2 guideline verification...', payload);

      const response = await documentsApi.stage2VerifyGuidelines(payload);

      console.log('Stage-2 guideline verification response:', response);

      const updatedDocuments =
        storageUtil.applyGuidelineVerificationResults(response);

      console.log(
        'Guideline verification completed. Updated documents:',
        updatedDocuments
      );

      return updatedDocuments.length;
    } finally {
      setIsVerifyingGuidelines(false);
    }
  };

  // Save guidelines and immediately re-verify existing documents.
  const handleSaveGuidelines = async (updatedGuidelines = guidelines) => {
    setSavingGuidelines(true);
    setSuccessMsg(null);
    setError(null);

    try {
      // 1. Persist the new guideline configuration in the backend.
      await companyApi.saveGuidelines({ guidelines: updatedGuidelines });
      setGuidelines(updatedGuidelines);

      // 2. Re-run Stage 2 against documents that were already processed.
      const storedDocuments = storageUtil.getDocuments();

      if (storedDocuments.length > 0) {
        try {
          const updatedCount = await runGuidelineVerification();

          setSuccessMsg(
            `Verification guidelines updated and ${updatedCount} existing document${
              updatedCount === 1 ? '' : 's'
            } re-verified successfully.`
          );
        } catch (verificationError) {
          console.error(
            'Guidelines were saved, but Stage-2 verification failed:',
            verificationError
          );

          setError(
            'Guidelines were saved, but existing documents could not be re-verified. Check the backend logs and try again.'
          );
        }
      } else {
        setSuccessMsg(
          'Verification guidelines updated successfully. No processed documents were available for re-verification.'
        );
      }

      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error(err);
      setError('Failed to update guidelines.');
    } finally {
      setSavingGuidelines(false);
    }
  };

  const handleOpenAddModal = () => {
    setModalCategory('IDENTITY');
    setModalRequirement('');
    setModalRequired(true);
    setModalActive(true);
    setEditingIndex(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (idx: number) => {
    const parsed = parseRule(guidelines[idx]);
    setModalCategory(parsed.category);
    setModalRequirement(parsed.requirement);
    setModalRequired(parsed.required);
    setModalActive(parsed.active);
    setEditingIndex(idx);
    setIsModalOpen(true);
  };

  const handleSaveModalGuideline = () => {
    if (!modalRequirement.trim()) return;

    const serialized = serializeRule({
      category: modalCategory,
      requirement: modalRequirement.trim(),
      required: modalRequired,
      active: modalActive
    });

    let updated = [...guidelines];
    if (editingIndex !== null) {
      updated[editingIndex] = serialized;
    } else {
      updated.push(serialized);
    }

    setGuidelines(updated);
    setIsModalOpen(false);
    
    // Automatically save changes
    handleSaveGuidelines(updated);
  };

  const handleDeleteGuideline = (index: number) => {
    if (window.confirm('Are you sure you want to delete this guideline?')) {
      const updated = guidelines.filter((_, i) => i !== index);
      setGuidelines(updated);
      handleSaveGuidelines(updated);
    }
  };

  // Drag and drop for guidelines policy file
  const handlePolicyDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setPolicyDragActive(true);
    } else if (e.type === "dragleave") {
      setPolicyDragActive(false);
    }
  };

  const handlePolicyDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPolicyDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setPolicyFile(e.dataTransfer.files[0]);
    }
  };

  // Policy upload guidelines extraction
  const handleUploadPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyFile) return;
    setPolicyLoading(true);
    setSuccessMsg(null);
    setError(null);
    try {
      const res = await companyApi.uploadPolicyDoc(policyFile);
      setReviewRules(res.guidelines || []);
      setIsReviewing(true);
      setPolicyFile(null);
      setSuccessMsg(`Extracted ${res.total_guidelines} verification rules for review.`);
    } catch (err: any) {
      console.error(err);
      setError('Could not extract rules from document. Make sure it is text-readable.');
    } finally {
      setPolicyLoading(false);
    }
  };

  // Drag and drop for blueprint schema file
  const handleBlueprintDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setBlueprintDragActive(true);
    } else if (e.type === "dragleave") {
      setBlueprintDragActive(false);
    }
  };

  const handleBlueprintDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBlueprintDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setBlueprintFile(e.dataTransfer.files[0]);
    }
  };

  // Blueprint upload registration from document
  const handleUploadBlueprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blueprintFile) return;
    _setBlueprintLoading(true);
    setSuccessMsg(null);
    setError(null);
    try {
      await companyApi.registerBlueprintDoc(blueprintFile);
      setSuccessMsg('Blueprint registered successfully from document.');
      setBlueprintFile(null);
      await fetchConfig(); // Refresh data to show visual extraction
    } catch (err: any) {
      console.error(err);
      setError('Failed to extract document checklist blueprint from document.');
    } finally {
      _setBlueprintLoading(false);
    }
  };

  // Review screen actions
  const handleAcceptReviewRule = (idx: number) => {
    const rule = reviewRules[idx];
    const updatedGuidelines = [...guidelines, rule];
    setGuidelines(updatedGuidelines);
    setReviewRules(prev => prev.filter((_, i) => i !== idx));
    handleSaveGuidelines(updatedGuidelines);
  };

  const handleRejectReviewRule = (idx: number) => {
    setReviewRules(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAcceptAllReviewRules = () => {
    const updatedGuidelines = [...guidelines, ...reviewRules];
    setGuidelines(updatedGuidelines);
    setReviewRules([]);
    setIsReviewing(false);
    handleSaveGuidelines(updatedGuidelines);
  };

  // Blueprint Editor Handlers
  const handleSaveBlueprint = async () => {
    setSavingBlueprint(true);
    setSuccessMsg(null);
    setError(null);
    try {
      let finalData: Record<string, string[]> = {};
      if (isJsonView) {
        finalData = JSON.parse(blueprintJson);
        setBlueprintData(finalData);
      } else {
        finalData = blueprintData;
        setBlueprintJson(JSON.stringify(blueprintData, null, 2));
      }
      await companyApi.registerBlueprintJson(finalData);
      setSuccessMsg('Document requirements blueprint registered successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error(err);
      setError('Invalid blueprint JSON structure. Must match dictionary requirements schema.');
    } finally {
      setSavingBlueprint(false);
    }
  };

  const handleAddField = (docType: string) => {
    const field = newFields[docType]?.trim();
    if (!field) return;

    const updatedFields = [...(blueprintData[docType] || []), field];
    const updatedData = { ...blueprintData, [docType]: updatedFields };
    
    setBlueprintData(updatedData);
    setBlueprintJson(JSON.stringify(updatedData, null, 2));
    setNewFields(prev => ({ ...prev, [docType]: '' }));
  };

  const handleRemoveField = (docType: string, fieldIndex: number) => {
    const updatedFields = (blueprintData[docType] || []).filter((_, i) => i !== fieldIndex);
    const updatedData = { ...blueprintData, [docType]: updatedFields };

    setBlueprintData(updatedData);
    setBlueprintJson(JSON.stringify(updatedData, null, 2));
  };

  const handleAddDocType = () => {
    const docName = newDocType.trim();
    if (!docName || blueprintData[docName]) return;

    const updatedData = { ...blueprintData, [docName]: [] };
    setBlueprintData(updatedData);
    setBlueprintJson(JSON.stringify(updatedData, null, 2));
    setNewDocType('');
  };

  const handleRemoveDocType = (docType: string) => {
    if (window.confirm(`Are you sure you want to delete the configuration for "${docType}"?`)) {
      const updatedData = { ...blueprintData };
      delete updatedData[docType];
      setBlueprintData(updatedData);
      setBlueprintJson(JSON.stringify(updatedData, null, 2));
    }
  };

  // Group guidelines by Category
  const groupedRules = guidelines.map((g, index) => ({ parsed: parseRule(g), index })).reduce<Record<string, Array<{ parsed: ParsedRule; index: number }>>>((groups, item) => {
    const cat = item.parsed.category || 'GENERAL';
    if (!groups[cat]) {
      groups[cat] = [];
    }
    groups[cat].push(item);
    return groups;
  }, {});

  const formatCategoryLabel = (cat: string) => {
    if (cat === 'IDENTITY') return 'Identity';
    if (cat === 'IDENTITY VERIFICATION') return 'Identity verification';
    if (cat === 'ADDRESS VERIFICATION') return 'Address verification';
    if (cat === 'VISUAL VERIFICATION') return 'Visual verification';
    if (cat === 'CROSS-DOCUMENT VALIDATION') return 'Cross-document validation';
    if (cat === 'GENERAL COMPLIANCE') return 'General compliance';
    return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
  };

  const getDisabledReason = (idx: number) => {
    if (idx === 3) return "Disabled — superseded by G002";
    return "Disabled — administrative override";
  };

  return (
    <div className="dv-scope space-y-6">
      <style>{TOKENS}</style>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Compliance guidelines</h1>
        <p className="text-sm text-muted-foreground mt-1 leading-normal font-sans">
          Configure requirement rules and structural schemas validated by the vision pipeline.
        </p>
      </div>

      {/* Manifest-Ticket Tab Selector */}
      <section className="space-y-3">
        <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Choose a configuration profile</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <button
            data-active={activeTab === 'guidelines'}
            onClick={() => {
              setActiveTab('guidelines');
              setError(null);
              setSuccessMsg(null);
            }}
            className="dv-ticket"
          >
            <div className="flex items-center justify-center p-3">
              <FileText size={20} className={activeTab === 'guidelines' ? 'text-[var(--verify)]' : 'text-muted-foreground'} />
            </div>
            <div className="dv-ticket-perf" />
            <div className="p-4 flex flex-col justify-center">
              <p className="text-[13px] font-bold text-foreground leading-none mb-1">Verification Guidelines</p>
              <p className="text-[10px] text-muted-foreground">Define business rules, policy mandates, and validation guidelines.</p>
            </div>
          </button>

          <button
            data-active={activeTab === 'blueprint'}
            onClick={() => {
              setActiveTab('blueprint');
              setError(null);
              setSuccessMsg(null);
            }}
            className="dv-ticket"
          >
            <div className="flex items-center justify-center p-3">
              <FileCode size={20} className={activeTab === 'blueprint' ? 'text-[var(--verify)]' : 'text-muted-foreground'} />
            </div>
            <div className="dv-ticket-perf" />
            <div className="p-4 flex flex-col justify-center">
              <p className="text-[13px] font-bold text-foreground leading-none mb-1">Requirements Blueprint</p>
              <p className="text-[10px] text-muted-foreground">Configure structural document keys, checklist fields, and data schemas.</p>
            </div>
          </button>

        </div>
      </section>

      {/* Success / Verification Progress / Error Alerts */}
      {isVerifyingGuidelines && (
        <div className="p-3 bg-[var(--verify-soft)] border border-[var(--line)] text-[var(--verify)] flex items-center gap-3 text-xs font-semibold rounded">
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
          <div>
            <p>Guidelines saved. Re-verifying existing documents...</p>
            <p className="text-[10px] font-normal mt-0.5 opacity-80">
              Stage 2 is evaluating the stored OCR data against the active compliance rules.
            </p>
          </div>
        </div>
      )}

      {successMsg && !isVerifyingGuidelines && (
        <div className="p-3 bg-[var(--verify-soft)] border border-[var(--line)] text-[var(--verify)] flex items-center gap-3 text-xs font-semibold rounded">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="p-3 bg-[var(--uncleared-soft)] border border-[var(--line)] text-[var(--uncleared)] flex items-center gap-3 text-xs font-semibold rounded">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 border border-[var(--line)] bg-[var(--paper-2)] rounded">
          <Loader2 className="h-6 w-6 text-[var(--ink)] animate-spin" />
          <span className="text-xs font-semibold text-muted-foreground dv-mono">Loading compliance configuration...</span>
        </div>
      ) : activeTab === 'guidelines' ? (
        /* GUIDELINES CONFIGURATION TAB */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Guidelines List Area */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Extracted Review Banner */}
            {isReviewing && reviewRules.length > 0 && (
              <div className="bg-[var(--amber-soft)] border border-[var(--line)] p-5 space-y-4 rounded">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[var(--amber)] animate-pulse"></span>
                    <h4 className="text-[12.5px] font-bold text-foreground uppercase tracking-wide">Extracted Policy Guidelines ({reviewRules.length})</h4>
                  </div>
                  <button
                    onClick={handleAcceptAllReviewRules}
                    className="text-xs font-bold text-[var(--amber)] hover:underline"
                  >
                    Accept All
                  </button>
                </div>
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {reviewRules.map((ruleText, idx) => {
                    const parsed = parseRule(ruleText);
                    return (
                      <div key={idx} className="bg-[var(--paper-2)] border border-[var(--line)] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs rounded">
                        <div className="space-y-1 select-all">
                          <p className="text-foreground leading-normal font-medium">{parsed.requirement}</p>
                          <p className="text-[10px] text-[var(--ink-soft)] font-semibold">Category: {formatCategoryLabel(parsed.category)}</p>
                        </div>
                        <div className="flex gap-2 self-end sm:self-auto">
                          <button
                            onClick={() => handleAcceptReviewRule(idx)}
                            className="inline-flex items-center justify-center h-7 px-3 text-[10.5px] font-bold text-[var(--paper)] bg-[var(--ink)] hover:opacity-90 rounded"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleRejectReviewRule(idx)}
                            className="inline-flex items-center justify-center h-7 px-3 text-[10.5px] font-bold border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--paper-2)] rounded"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => setIsReviewing(false)}
                    className="text-xs font-semibold text-muted-foreground hover:underline"
                  >
                    Close Review Screen
                  </button>
                </div>
              </div>
            )}

            {/* List Heading */}
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-[14px] font-bold text-foreground">Active Verification Rules</h3>
              <button
                onClick={handleOpenAddModal}
                className="dv-btn-flat"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Guideline
              </button>
            </div>

            {guidelines.length > 0 ? (
              <div className="space-y-6">
                {Object.entries(groupedRules).map(([category, items]) => (
                  <div key={category} className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">{formatCategoryLabel(category)}</h3>
                    <div className="grid grid-cols-1 gap-3">
                      {items.map(({ parsed, index }) => {
                        const ruleIndex = index + 1;
                        const ruleCode = `G${String(ruleIndex).padStart(3, '0')}`;
                        return (
                          <div
                            key={index}
                            className="dv-rule-card"
                            data-active={parsed.active}
                          >
                            <span className="absolute left-4 top-4 dv-ledger-code dv-mono">{ruleCode}</span>
                            
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                              <div className="space-y-2 flex-1">
                                <p className="text-sm font-semibold leading-relaxed text-foreground select-all">{parsed.requirement}</p>
                                
                                <div className="flex flex-wrap items-center gap-3 pt-1">
                                  {/* Stamped Active state */}
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                                    <span className="dv-active-square" data-active={parsed.active} />
                                    <span>{parsed.active ? "Active" : "Disabled"}</span>
                                  </div>

                                  {/* Small bullet separator */}
                                  <span className="h-1 w-1 rounded-full bg-[var(--line-strong)]" />

                                  {/* Lightweight severity marker */}
                                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                    {parsed.required ? (
                                      <>
                                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink)] flex-shrink-0" />
                                        <span>required</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="h-1.5 w-1.5 rounded-full border border-[var(--line)] flex-shrink-0" />
                                        <span>optional</span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Custom disabled reason */}
                                {!parsed.active && (
                                  <p className="text-[11px] text-[var(--uncleared)] bg-[var(--uncleared-soft)] border border-[var(--line)] px-2 py-0.5 rounded inline-block font-medium mt-1">
                                    {getDisabledReason(index)}
                                  </p>
                                )}
                              </div>
                              
                              {/* Edit & Delete Action Buttons */}
                              <div className="flex gap-2 self-end sm:self-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-border">
                                <button
                                  onClick={() => handleOpenEditModal(index)}
                                  className="dv-btn-flat"
                                  title="Edit Guideline"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteGuideline(index)}
                                  className="dv-btn-flat-rose"
                                  title="Delete Guideline"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 border border-dashed border-[var(--line-strong)] rounded bg-[var(--paper-2)] space-y-4">
                <FileText className="h-8 w-8 mx-auto text-[var(--ink-soft)]/45" />
                <div>
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">No Compliance Guidelines Configured</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Configure your tenant guidelines checklist manually or extract them automatically from a policy document.
                  </p>
                </div>
                <button
                  onClick={handleOpenAddModal}
                  className="dv-btn-solid"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Guideline
                </button>
              </div>
            )}
          </div>

          {/* Extraction Sidebar */}
          <div className="space-y-6">
            <div className="bg-[var(--paper-2)] border border-[var(--line)] rounded p-5 space-y-4">
              <div>
                <h3 className="text-[13px] font-bold text-foreground uppercase tracking-wider">Extract Guidelines from Policy</h3>
                <p className="text-xs text-[var(--ink-soft)] mt-1 leading-relaxed">
                  Upload an organizational compliance policy document to automatically extract and populate verification rules.
                </p>
              </div>
              
              <form onSubmit={handleUploadPolicy} className="space-y-4">
                {/* Viewfinder Intake Box */}
                <div
                  className="dv-scan-zone p-8 text-center cursor-pointer min-h-[160px] flex flex-col items-center justify-center"
                  data-drag={policyDragActive}
                  onDragEnter={handlePolicyDrag}
                  onDragOver={handlePolicyDrag}
                  onDragLeave={handlePolicyDrag}
                  onDrop={handlePolicyDrop}
                  onClick={() => policyInputRef.current?.click()}
                >
                  <span className="dv-bracket tl" />
                  <span className="dv-bracket tr" />
                  <span className="dv-bracket bl" />
                  <span className="dv-bracket br" />
                  <span className="dv-scanline" />
                  
                  <FolderInput size={28} className={`mb-3 ${policyDragActive ? 'text-[var(--verify)]' : 'text-[var(--ink-soft)]'}`} />
                  
                  {policyFile ? (
                    <div>
                      <p className="text-xs font-semibold dv-mono text-foreground">{policyFile.name}</p>
                      <p className="text-[10px] text-muted-foreground dv-mono">
                        {(policyFile.size / 1024).toFixed(1)} KB • ready to extract
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-foreground">
                        Drag policy here, or <span className="underline font-semibold text-[var(--verify)]">browse files</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Accepts PDF, DOCX, TXT up to 10MB</p>
                    </div>
                  )}
                  
                  <input
                    ref={policyInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={(e) => setPolicyFile(e.target.files?.[0] || null)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!policyFile || policyLoading}
                  className="dv-btn-solid w-full justify-center"
                >
                  {policyLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Extracting Guidelines...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Extract Guidelines
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : (
        /* REQUIREMENTS BLUEPRINT CONFIGURATION TAB */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Visual Schema Editor */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="text-[14px] font-bold text-foreground">Document Checklist Blueprint</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define required information targets to extract for each document type.
                </p>
              </div>
              <button
                onClick={() => setIsJsonView(!isJsonView)}
                className="dv-btn-flat"
              >
                {isJsonView ? 'Visual Editor' : 'Advanced JSON Editor'}
              </button>
            </div>

            {isJsonView ? (
              <div className="bg-[var(--paper-2)] border border-[var(--line)] rounded p-5 space-y-4 flex flex-col">
                <textarea
                  value={blueprintJson}
                  onChange={(e) => setBlueprintJson(e.target.value)}
                  className="flex-1 min-h-[400px] font-mono text-xs p-4 bg-[var(--paper)] text-[var(--ink)] rounded border border-[var(--line)] focus:outline-none focus:border-[var(--verify)] leading-relaxed"
                />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Document Type Cards */}
                {Object.entries(blueprintData).map(([docType, fields]) => (
                  <div key={docType} className="bg-[var(--paper-2)] border border-[var(--line)] rounded p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded bg-[var(--verify)]"></span>
                        <h4 className="text-sm font-bold text-[var(--ink)] select-all">{docType}</h4>
                      </div>
                      <button
                        onClick={() => handleRemoveDocType(docType)}
                        className="text-muted-foreground hover:text-[#9C3B2E] p-1 hover:bg-rose-50/10 rounded"
                        title="Remove Document Type"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Required Information Checklist</p>
                      <div className="flex flex-wrap gap-2">
                        {fields.map((field, idx) => (
                          <div
                            key={idx}
                            className="dv-field-tag dv-mono"
                          >
                            <span className="select-all">{field}</span>
                            <button
                              onClick={() => handleRemoveField(docType, idx)}
                              className="text-muted-foreground hover:text-[#9C3B2E]"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {fields.length === 0 && (
                          <span className="text-xs text-muted-foreground italic">No fields defined. Add some fields below.</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1.5">
                      <input
                        type="text"
                        placeholder="e.g. date_of_birth"
                        value={newFields[docType] || ''}
                        onChange={(e) => setNewFields(prev => ({ ...prev, [docType]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddField(docType)}
                        className="flex-1 px-3 py-1.5 border border-[var(--line)] rounded bg-[var(--paper)] text-xs dv-mono focus:outline-none focus:border-[var(--verify)] text-[var(--ink)]"
                      />
                      <button
                        onClick={() => handleAddField(docType)}
                        className="dv-btn-flat"
                      >
                        Add Field
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add Custom Document Type Form */}
                <div className="bg-[var(--paper-2)] border border-dashed border-[var(--line-strong)] rounded p-5 space-y-4">
                  <h4 className="text-xs font-bold text-[var(--ink)] uppercase tracking-wider">Add Custom Document Type Configuration</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Diploma Marksheet"
                      value={newDocType}
                      onChange={(e) => setNewDocType(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddDocType()}
                      className="flex-1 px-4 py-2 border border-[var(--line)] rounded bg-[var(--paper)] text-xs focus:outline-none focus:border-[var(--verify)] text-[var(--ink)]"
                    />
                    <button
                      onClick={handleAddDocType}
                      className="dv-btn-flat"
                    >
                      + Add Doc Type
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-border">
              <button
                onClick={handleSaveBlueprint}
                disabled={savingBlueprint}
                className="dv-btn-solid"
              >
                {savingBlueprint ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Blueprint Checklist
              </button>
            </div>
          </div>

          {/* Blueprint File Upload Sidebar */}
          <div className="space-y-6">
            <div className="bg-[var(--paper-2)] border border-[var(--line)] rounded p-5 space-y-4">
              <div>
                <h3 className="text-[13px] font-bold text-foreground uppercase tracking-wider">Upload Checklist Blueprint</h3>
                <p className="text-xs text-[var(--ink-soft)] mt-1 leading-relaxed">
                  Upload an existing policy template, form blueprint, or schema document to automatically detect required categories and targets.
                </p>
              </div>
              
              <form onSubmit={handleUploadBlueprint} className="space-y-4">
                {/* Viewfinder Intake Box */}
                <div
                  className="dv-scan-zone p-8 text-center cursor-pointer min-h-[160px] flex flex-col items-center justify-center"
                  data-drag={blueprintDragActive}
                  onDragEnter={handleBlueprintDrag}
                  onDragOver={handleBlueprintDrag}
                  onDragLeave={handleBlueprintDrag}
                  onDrop={handleBlueprintDrop}
                  onClick={() => blueprintInputRef.current?.click()}
                >
                  <span className="dv-bracket tl" />
                  <span className="dv-bracket tr" />
                  <span className="dv-bracket bl" />
                  <span className="dv-bracket br" />
                  <span className="dv-scanline" />
                  
                  <FolderInput size={28} className={`mb-3 ${blueprintDragActive ? 'text-[var(--verify)]' : 'text-[var(--ink-soft)]'}`} />
                  
                  {blueprintFile ? (
                    <div>
                      <p className="text-xs font-semibold dv-mono text-foreground">{blueprintFile.name}</p>
                      <p className="text-[10px] text-muted-foreground dv-mono">
                        {(blueprintFile.size / 1024).toFixed(1)} KB • ready to upload
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-foreground">
                        Drag template here, or <span className="underline font-semibold text-[var(--verify)]">browse files</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Accepts PDF, DOCX, TXT up to 10MB</p>
                    </div>
                  )}
                  
                  <input
                    ref={blueprintInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={(e) => setBlueprintFile(e.target.files?.[0] || null)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!blueprintFile || blueprintLoading}
                  className="dv-btn-solid w-full justify-center"
                >
                  {blueprintLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Registering Blueprint...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Register Blueprint
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--overlay)] backdrop-blur-sm transition-all duration-200">
          <div className="relative w-full max-w-lg bg-[var(--paper-2)] border border-[var(--line)] shadow-xl p-6 space-y-5 rounded">
            
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-[var(--ink-soft)] hover:text-[var(--ink)] rounded p-1 hover:bg-[var(--paper)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div>
              <h3 className="text-lg font-bold text-foreground">
                {editingIndex !== null ? 'Edit Compliance Guideline' : 'Add Compliance Guideline'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Configure a compliance requirement rule to run during automated document audits.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Category</label>
                <select
                  value={modalCategory}
                  onChange={(e) => setModalCategory(e.target.value)}
                  className="w-full text-xs font-medium px-4 py-2 border border-[var(--line)] bg-[var(--paper)] rounded focus:outline-none focus:border-[var(--verify)] text-[var(--ink)]"
                >
                  <option value="IDENTITY">IDENTITY</option>
                  <option value="IDENTITY VERIFICATION">IDENTITY VERIFICATION</option>
                  <option value="ADDRESS VERIFICATION">ADDRESS VERIFICATION</option>
                  <option value="VISUAL VERIFICATION">VISUAL VERIFICATION</option>
                  <option value="CROSS-DOCUMENT VALIDATION">CROSS-DOCUMENT VALIDATION</option>
                  <option value="GENERAL COMPLIANCE">GENERAL COMPLIANCE</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Requirement / Rule Text</label>
                <textarea
                  placeholder="e.g. PAN Card must contain Name, Date of Birth and a valid PAN Number."
                  value={modalRequirement}
                  onChange={(e) => setModalRequirement(e.target.value)}
                  className="w-full text-xs font-semibold p-3 border border-[var(--line)] bg-[var(--paper)] rounded focus:outline-none focus:border-[var(--verify)] text-[var(--ink)] min-h-[100px] leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Requirement Severity</label>
                  <div className="flex gap-2 bg-[var(--paper-2)] p-1 border border-[var(--line)] rounded">
                    <button
                      onClick={() => setModalRequired(true)}
                      className={`flex-1 text-center py-1.5 rounded text-xs font-bold transition-all ${
                        modalRequired ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                      }`}
                    >
                      Required
                    </button>
                    <button
                      onClick={() => setModalRequired(false)}
                      className={`flex-1 text-center py-1.5 rounded text-xs font-bold transition-all ${
                        !modalRequired ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                      }`}
                    >
                      Optional
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Rule Status</label>
                  <div className="flex gap-2 bg-[var(--paper-2)] p-1 border border-[var(--line)] rounded">
                    <button
                      onClick={() => setModalActive(true)}
                      className={`flex-1 text-center py-1.5 rounded text-xs font-bold transition-all ${
                        modalActive ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                      }`}
                    >
                      Active
                    </button>
                    <button
                      onClick={() => setModalActive(false)}
                      className={`flex-1 text-center py-1.5 rounded text-xs font-bold transition-all ${
                        !modalActive ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]'
                      }`}
                    >
                      Inactive
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button
                onClick={() => setIsModalOpen(false)}
                className="dv-btn-flat"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModalGuideline}
                disabled={!modalRequirement.trim()}
                className="dv-btn-solid"
              >
                Save Guideline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
