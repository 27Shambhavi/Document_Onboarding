import React, { useState, useEffect } from 'react';
import { useTheme } from '../App';
import { api, type BlueprintSchema, type GuidelineRule } from '../api/client';
import {
  FileCode,
  Upload,
  FileText,
  Sliders,
  CheckCircle,
  Code2,
  Copy,
  Check,
  Eye,
  Save,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

const INITIAL_BLUEPRINT: BlueprintSchema = {
  document_type: 'Government Passport & Work Visa Blueprint',
  required_fields: ['full_name', 'dob', 'document_number', 'expiry_date', 'nationality', 'issuing_state'],
  extraction_rules: {
    full_name: 'Strict match with fuzzy similarity score > 0.85',
    document_number: 'Alphanumeric regular expression validation',
    expiry_date: 'ISO 8601 Date check; must be > current date + 180 days',
    nationality: 'Country code lookup (ISO 3166-1 alpha-3)',
  },
  validation_strictness: 'high',
};

const INITIAL_GUIDELINES: GuidelineRule[] = [
  {
    id: 'RULE-001',
    category: 'Identity Matching',
    rule_title: 'Full Legal Name Match',
    description: 'Candidate legal name on passport must match candidate onboarding record exactly.',
    condition: 'ocr_data.full_name.toLowerCase() == candidate_name.toLowerCase()',
    mandatory: true,
  },
  {
    id: 'RULE-002',
    category: 'Document Validity',
    rule_title: 'Document Expiration Boundary',
    description: 'Passport expiry date must have at least 6 months remaining from onboarding date.',
    condition: 'ocr_data.expiry_date >= TODAY + 180_DAYS',
    mandatory: true,
  },
  {
    id: 'RULE-003',
    category: 'Security & Authenticity',
    rule_title: 'Government Seal & Stamp Check',
    description: 'Vision neural model must verify state issuer seal signature hash.',
    condition: 'ocr_data.signature_present == true && ocr_data.stamp_verified == true',
    mandatory: false,
  },
];

export const ConfigHub: React.FC = () => {
  const { isDark } = useTheme();

  // SECTION 1: OCR BLUEPRINT STATE
  const [blueprintInputMode, setBlueprintInputMode] = useState<'upload' | 'json'>('json');
  const [blueprintJsonText, setBlueprintJsonText] = useState<string>(
    JSON.stringify(INITIAL_BLUEPRINT, null, 2)
  );
  const [activeBlueprint, setActiveBlueprint] = useState<any>(INITIAL_BLUEPRINT);
  const [blueprintFile, setBlueprintFile] = useState<File | null>(null);
  const [blueprintSavedToast, setBlueprintSavedToast] = useState(false);
  const [blueprintError, setBlueprintError] = useState<string | null>(null);

  // SECTION 2: COMPLIANCE GUIDELINES STATE
  const [guidelineInputMode, setGuidelineInputMode] = useState<'text' | 'upload' | 'json'>('text');
  const [guidelinePlainText, setGuidelinePlainText] = useState<string>(
    '1. The candidate full name on the ID must match candidate_name.\n2. The document must be unexpired for at least 180 days.\n3. The document must contain an official government stamp and signature.'
  );
  const [guidelineJsonText, setGuidelineJsonText] = useState<string>(
    JSON.stringify(INITIAL_GUIDELINES, null, 2)
  );
  const [guidelinePreviewMode, setGuidelinePreviewMode] = useState<'text' | 'json'>('text');
  const [guidelinesSavedToast, setGuidelinesSavedToast] = useState(false);
  const [guidelinesSavedCount, setGuidelinesSavedCount] = useState<number | null>(null);
  const [guidelineError, setGuidelineError] = useState<string | null>(null);
  const [guidelineFile, setGuidelineFile] = useState<File | null>(null);

  // Copy state
  const [copiedBlueprint, setCopiedBlueprint] = useState(false);
  const [copiedGuidelines, setCopiedGuidelines] = useState(false);

  // Load active blueprint & guidelines from the backend on mount
  useEffect(() => {
    let isMounted = true;
    const loadActiveConfig = async () => {
      try {
        const bpRes = await api.getBlueprint();
        if (isMounted && bpRes?.blueprint) {
          setActiveBlueprint(bpRes.blueprint);
          setBlueprintJsonText(JSON.stringify(bpRes.blueprint, null, 2));
        }
      } catch (err) {
        console.warn('Backend blueprint fetch notice:', err);
      }

      try {
        const gRes = await api.getGuidelines();
        if (isMounted && gRes?.guidelines) {
          if (Array.isArray(gRes.guidelines) && typeof gRes.guidelines[0] === 'string') {
            setGuidelinePlainText(gRes.guidelines.join('\n'));
          } else if (Array.isArray(gRes.guidelines)) {
            setGuidelineJsonText(JSON.stringify(gRes.guidelines, null, 2));
          }
        }
      } catch (err) {
        console.warn('Backend guidelines fetch notice:', err);
      }
    };

    loadActiveConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  // Crash-Proof Save Blueprint Handler
  const handleSaveBlueprint = async () => {
    setBlueprintError(null);
    try {
      if (blueprintInputMode === 'json') {
        let parsed: any;
        try {
          parsed = JSON.parse(blueprintJsonText);
        } catch (jsonErr: any) {
          setBlueprintError(`Invalid JSON Syntax: ${jsonErr.message || 'Check quotes and brackets'}`);
          return;
        }
        if (!parsed || typeof parsed !== 'object') {
          setBlueprintError('JSON Schema Warning: Blueprint must be a valid JSON object or document mapping.');
          return;
        }
        setActiveBlueprint(parsed);
        await api.registerBlueprintJson(parsed);
      } else if (blueprintFile) {
        const res = await api.registerBlueprintDoc(blueprintFile);
        if (res.blueprint) {
          setActiveBlueprint(res.blueprint);
          setBlueprintJsonText(JSON.stringify(res.blueprint, null, 2));
        }
      } else {
        setBlueprintError('Please select a file to upload or switch to JSON mode.');
        return;
      }
      setBlueprintSavedToast(true);
      setTimeout(() => setBlueprintSavedToast(false), 3000);
    } catch (err: any) {
      console.error('Save Blueprint Handled Error:', err);
      const serverMsg = err?.response?.data?.detail || err?.message || 'Server connection failed';
      setBlueprintError(`Backend Notice: ${serverMsg}`);
    }
  };

  // Crash-Proof Save Guidelines Handler
  const handleSaveGuidelines = async () => {
    setGuidelineError(null);
    try {
      let payload = {};
      if (guidelineInputMode === 'json') {
        try {
          const parsed = JSON.parse(guidelineJsonText);
          payload = { json_rules: parsed };
        } catch (jsonErr: any) {
          setGuidelineError(`Invalid Guideline JSON Syntax: ${jsonErr.message}`);
          return;
        }
      } else {
        payload = { text: guidelinePlainText };
      }
      const res: any = await api.saveGuidelines(payload, guidelineFile || undefined);

      // Immediately sync state with API response (Task 1)
      if (res?.guidelines && Array.isArray(res.guidelines)) {
        if (typeof res.guidelines[0] === 'string') {
          setGuidelinePlainText(res.guidelines.join('\n'));
        }
        setGuidelineJsonText(JSON.stringify(res.guidelines, null, 2));
      }

      setGuidelinesSavedCount(
        res?.total_guidelines ?? (Array.isArray(res?.guidelines) ? res.guidelines.length : null)
      );

      if (guidelineFile) {
        setGuidelineFile(null);
      }

      setGuidelinesSavedToast(true);
      setTimeout(() => setGuidelinesSavedToast(false), 3000);
    } catch (err: any) {
      console.error('Save Guidelines Handled Error:', err);
      const serverMsg = err?.response?.data?.detail || err?.message || 'Server connection failed';
      setGuidelineError(`Backend Notice: ${serverMsg}`);
    }
  };

  // Insert Guideline Preset
  const handleInsertPreset = (preset: string) => {
    setGuidelinePlainText((prev) => prev + `\n- ${preset}`);
  };

  // Copy helpers
  const copyBlueprintToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(activeBlueprint, null, 2));
    setCopiedBlueprint(true);
    setTimeout(() => setCopiedBlueprint(false), 2000);
  };

  const copyGuidelinesToClipboard = () => {
    navigator.clipboard.writeText(
      guidelinePreviewMode === 'json' ? guidelineJsonText : guidelinePlainText
    );
    setCopiedGuidelines(true);
    setTimeout(() => setCopiedGuidelines(false), 2000);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-300">
      
      {/* HEADER BAR */}
      <div className="border-b border-slate-200/10 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sliders className="w-6 h-6 text-indigo-500" />
            Intelligence Configuration Hub
          </h2>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Define document extraction blueprints and set compliance rules evaluated during candidate audits.
          </p>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 1: OCR BLUEPRINT (SPLIT-SCREEN) */}
      {/* ================================================================ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">1. OCR Document Blueprint</h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Specify target fields, validation strictness, and OCR extraction schemas.
              </p>
            </div>
          </div>

          {blueprintSavedToast && (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30 animate-bounce">
              <CheckCircle className="w-4 h-4" />
              <span>Blueprint Saved!</span>
            </div>
          )}
        </div>

        {/* INLINE UI ERROR BANNER (PREVENTS REACT WHITE SCREEN CRASH) */}
        {blueprintError && (
          <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{blueprintError}</span>
            </div>
            <button onClick={() => setBlueprintError(null)} className="p-1 hover:text-white">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* DUAL PANE: INPUT VS PREVIEW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* LEFT PANE: INPUT CONTROLS */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div>
              {/* MODE TOGGLE SELECTOR */}
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Blueprint Source Input
                </span>
                <div className={`p-1 rounded-xl border flex space-x-1 ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}>
                  <button
                    onClick={() => { setBlueprintInputMode('json'); setBlueprintError(null); }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      blueprintInputMode === 'json'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    JSON Schema
                  </button>
                  <button
                    onClick={() => { setBlueprintInputMode('upload'); setBlueprintError(null); }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      blueprintInputMode === 'upload'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload PDF / Doc
                  </button>
                </div>
              </div>

              {/* INPUT BODY */}
              {blueprintInputMode === 'json' ? (
                <div className="space-y-3">
                  <label className={`block text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Paste / Edit Blueprint JSON Definition:
                  </label>
                  <textarea
                    rows={12}
                    value={blueprintJsonText}
                    onChange={(e) => {
                      setBlueprintJsonText(e.target.value);
                      if (blueprintError) setBlueprintError(null);
                    }}
                    className={`w-full p-4 rounded-xl font-mono text-xs border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all ${
                      isDark ? 'bg-slate-950 border-slate-800 text-emerald-400' : 'bg-slate-900 border-slate-800 text-emerald-300'
                    }`}
                    placeholder="Enter valid JSON blueprint..."
                  />
                </div>
              ) : (
                <div className="space-y-4 py-6">
                  <div className={`p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                    isDark ? 'border-slate-800 hover:border-indigo-500 bg-slate-950/50' : 'border-slate-300 hover:border-indigo-500 bg-slate-50'
                  }`}>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.json"
                      onChange={(e) => setBlueprintFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="blueprint-file-upload"
                    />
                    <label htmlFor="blueprint-file-upload" className="cursor-pointer block">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-3">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold">
                        {blueprintFile ? blueprintFile.name : 'Click to upload Blueprint Document'}
                      </p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Supports PDF, Word (.docx), or sample blueprint templates
                      </p>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* ACTION BUTTON */}
            <div className="pt-4 border-t border-slate-200/10 flex justify-end">
              <button
                onClick={handleSaveBlueprint}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save & Register Blueprint</span>
              </button>
            </div>
          </div>

          {/* RIGHT PANE: LIVE PREVIEW VIEWER */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Eye className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Live Blueprint JSON Preview
                  </span>
                </div>
                <button
                  onClick={copyBlueprintToClipboard}
                  className={`p-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1 ${
                    isDark ? 'bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {copiedBlueprint ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedBlueprint ? 'Copied!' : 'Copy JSON'}</span>
                </button>
              </div>

              {/* JSON DISPLAY BOX */}
              <div className={`p-4 rounded-xl border font-mono text-xs overflow-x-auto max-h-[340px] ${
                isDark ? 'bg-slate-950 border-slate-800 text-indigo-300' : 'bg-slate-900 border-slate-800 text-indigo-200'
              }`}>
                <pre>{JSON.stringify(activeBlueprint, null, 2)}</pre>
              </div>

              {/* REQUIRED FIELDS / DOCUMENT TYPES TAGS SUMMARY */}
              <div className="mt-4 pt-3 border-t border-slate-200/10">
                {Array.isArray(activeBlueprint?.required_fields) ? (
                  <>
                    <span className={`text-[11px] font-semibold block mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Target Extraction Fields ({activeBlueprint.required_fields.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeBlueprint.required_fields.map((field: string) => (
                        <span
                          key={field}
                          className="px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <span className={`text-[11px] font-semibold block mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Configured Document Types ({Object.keys(activeBlueprint || {}).length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {Object.entries(activeBlueprint || {}).map(([docType, fields]: [string, any]) => (
                        <span
                          key={docType}
                          className="px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                          title={Array.isArray(fields) ? fields.join(', ') : ''}
                        >
                          {docType} ({Array.isArray(fields) ? fields.length : 1} fields)
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ================================================================ */}
      {/* SECTION 2: COMPLIANCE GUIDELINES (SPLIT-SCREEN) */}
      {/* ================================================================ */}
      <div className="space-y-4 pt-4 border-t border-slate-200/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">2. Compliance Policy Guidelines</h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Define pass/fail rules evaluated by the AI engine during document verification.
              </p>
            </div>
          </div>

          {guidelinesSavedToast && (
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30 animate-bounce">
              <CheckCircle className="w-4 h-4" />
              <span>{guidelinesSavedCount !== null ? `${guidelinesSavedCount} Guidelines Activated!` : 'Guidelines Activated!'}</span>
            </div>
          )}
        </div>

        {guidelineError && (
          <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{guidelineError}</span>
            </div>
            <button onClick={() => setGuidelineError(null)} className="p-1 hover:text-white">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* DUAL PANE: INPUT VS PREVIEW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* LEFT PANE: GUIDELINES INPUT */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div>
              {/* MODE SELECTOR */}
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Guideline Input Format
                </span>
                <div className={`p-1 rounded-xl border flex space-x-1 ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}>
                  <button
                    onClick={() => { setGuidelineInputMode('text'); setGuidelineError(null); }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      guidelineInputMode === 'text'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    Plain Text
                  </button>
                  <button
                    onClick={() => { setGuidelineInputMode('json'); setGuidelineError(null); }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      guidelineInputMode === 'json'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    Structured JSON
                  </button>
                  <button
                    onClick={() => { setGuidelineInputMode('upload'); setGuidelineError(null); }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      guidelineInputMode === 'upload'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    Doc Upload
                  </button>
                </div>
              </div>

              {/* INPUT CONTENT */}
              {guidelineInputMode === 'text' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className={`block text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Compliance Rules Prompt (Natural Language):
                    </label>
                    <span className="text-[11px] text-emerald-400 font-medium">Quick Presets:</span>
                  </div>

                  {/* PRESET CHIPS */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <button
                      onClick={() => handleInsertPreset('Verify legal name matches candidate record')}
                      className="px-2 py-1 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                    >
                      + Name Match Rule
                    </button>
                    <button
                      onClick={() => handleInsertPreset('Check expiration date > 180 days')}
                      className="px-2 py-1 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                    >
                      + Expiry Boundary
                    </button>
                    <button
                      onClick={() => handleInsertPreset('Validate official state seal hologram')}
                      className="px-2 py-1 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                    >
                      + Anti-Tamper Stamp
                    </button>
                  </div>

                  <textarea
                    rows={10}
                    value={guidelinePlainText}
                    onChange={(e) => setGuidelinePlainText(e.target.value)}
                    className={`w-full p-4 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all ${
                      isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                    placeholder="Enter compliance rules in natural language..."
                  />
                </div>
              )}

              {guidelineInputMode === 'json' && (
                <div className="space-y-3">
                  <label className={`block text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Guideline Rule Matrix JSON:
                  </label>
                  <textarea
                    rows={10}
                    value={guidelineJsonText}
                    onChange={(e) => setGuidelineJsonText(e.target.value)}
                    className={`w-full p-4 rounded-xl font-mono text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                      isDark ? 'bg-slate-950 border-slate-800 text-emerald-400' : 'bg-slate-900 border-slate-800 text-emerald-300'
                    }`}
                  />
                </div>
              )}

              {guidelineInputMode === 'upload' && (
                <div className="space-y-4 py-4">
                  <div className={`p-8 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                    isDark ? 'border-slate-800 hover:border-emerald-500 bg-slate-950/50' : 'border-slate-300 hover:border-emerald-500 bg-slate-50'
                  }`}>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => setGuidelineFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="guideline-file-upload"
                    />
                    <label htmlFor="guideline-file-upload" className="cursor-pointer block">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold">
                        {guidelineFile ? guidelineFile.name : 'Upload Guidelines Document (.PDF / .DOC)'}
                      </p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Extract compliance directives directly from HR policy documents
                      </p>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* SAVE BUTTON */}
            <div className="pt-4 border-t border-slate-200/10 flex justify-end">
              <button
                onClick={handleSaveGuidelines}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save & Activate Guidelines</span>
              </button>
            </div>
          </div>

          {/* RIGHT PANE: GUIDELINES LIVE PREVIEW */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Active Guidelines Preview
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <div className={`p-0.5 rounded-lg border flex ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <button
                      onClick={() => setGuidelinePreviewMode('text')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                        guidelinePreviewMode === 'text'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Text View
                    </button>
                    <button
                      onClick={() => setGuidelinePreviewMode('json')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                        guidelinePreviewMode === 'json'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      JSON View
                    </button>
                  </div>

                  <button
                    onClick={copyGuidelinesToClipboard}
                    className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 ${
                      isDark ? 'bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    {copiedGuidelines ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* PREVIEW DISPLAY PANEL */}
              {guidelinePreviewMode === 'text' ? (
                <div className={`p-4 rounded-xl border text-xs whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto ${
                  isDark ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}>
                  {guidelinePlainText}
                </div>
              ) : (
                <div className={`p-4 rounded-xl border font-mono text-xs overflow-x-auto max-h-[300px] ${
                  isDark ? 'bg-slate-950 border-slate-800 text-emerald-300' : 'bg-slate-900 border-slate-800 text-emerald-200'
                }`}>
                  <pre>{guidelineJsonText}</pre>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200/10 flex items-center justify-between text-[11px]">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                Rule Engine Status: <strong className="text-emerald-400">Strict Enforcement On</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                3 Rules Loaded
              </span>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};

export default ConfigHub;
