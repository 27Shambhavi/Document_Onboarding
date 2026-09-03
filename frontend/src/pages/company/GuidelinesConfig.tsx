import React, { useState } from 'react';

export const GuidelinesConfig: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'file' | 'json' | 'text'>('file');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Form States
  const [file, setFile] = useState<File | null>(null);
  const [jsonInput, setJsonInput] = useState('');
  const [textInput, setTextInput] = useState('');

  // Backend API URL (matches your FastAPI port)
  const API_BASE = 'http://localhost:8567';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      let endpoint = '';
      let options: RequestInit = {};

      const token = localStorage.getItem('token') || '';
      const headers: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      if (activeTab === 'file' && file) {
        endpoint = `${API_BASE}/company/guidelines/upload-policy`;
        const formData = new FormData();
        formData.append('file', file);
        options = {
          method: 'POST',
          headers,
          body: formData,
        };
      } else if (activeTab === 'json') {
        endpoint = `${API_BASE}/company/guidelines`;
        headers['Content-Type'] = 'application/json';
        options = {
          method: 'POST',
          headers,
          body: jsonInput,
        };
      } else if (activeTab === 'text') {
        endpoint = `${API_BASE}/company/guidelines`;
        headers['Content-Type'] = 'application/json';
        const wrappedData = {
          guidelines: {
            'Custom Rules': [textInput],
          },
        };
        options = {
          method: 'POST',
          headers,
          body: JSON.stringify(wrappedData),
        };
      }

      const response = await fetch(endpoint, options);
      const data = await response.json();

      if (response.ok) {
        setMessage('✅ Guidelines successfully registered and activated!');
      } else {
        setMessage(`❌ Error: ${data.detail || 'Something went wrong'}`);
      }
    } catch (error) {
      setMessage('❌ Failed to connect to the backend server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Guideline Configuration</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure compliance guidelines using a policy document, raw JSON, or plain text.
        </p>
      </div>

      {/* Tabs Selection */}
      <div className="flex gap-2 mb-6 border-b border-border pb-2">
        {(['file', 'json', 'text'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-semibold capitalize transition-all rounded-t-lg ${
              activeTab === tab
                ? 'text-primary border-b-2 border-primary bg-card-elevated shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'file' ? 'Upload Policy Document' : tab === 'json' ? 'JSON Input' : 'Text Input'}
          </button>
        ))}
      </div>

      {/* Form Container */}
      <div className="app-card p-6 bg-card border border-border rounded-lg shadow-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {activeTab === 'file' && (
            <div>
              <label className="block mb-2 text-sm font-medium text-foreground">
                Upload Policy Document (.pdf, .docx, .txt)
              </label>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
                required
              />
              <p className="text-xs text-muted-foreground mt-2">
                Our AI model will automatically parse and convert your policy document into discrete compliance rules.
              </p>
            </div>
          )}

          {activeTab === 'json' && (
            <div>
              <label className="block mb-2 text-sm font-medium text-foreground">
                Paste JSON Blueprint
              </label>
              <textarea
                rows={8}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={'{\n  "guidelines": {\n    "Verification Rules": ["Rule 1", "Rule 2"]\n  }\n}'}
                className="w-full p-3 font-mono text-sm rounded-lg border border-input bg-card text-foreground"
                required
              />
            </div>
          )}

          {activeTab === 'text' && (
            <div>
              <label className="block mb-2 text-sm font-medium text-foreground">
                Type Custom Rules (Plain Text)
              </label>
              <textarea
                rows={8}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Enter compliance and onboarding criteria description here..."
                className="w-full p-3 text-sm rounded-lg border border-input bg-card text-foreground"
                required
              />
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="app-button-primary px-6 py-2.5 rounded-lg font-semibold text-primary-foreground bg-primary hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Processing & Parsing...' : 'Save & Activate Guidelines'}
            </button>
          </div>
        </form>

        {message && (
          <div className="mt-5 p-4 rounded-lg bg-muted text-foreground border border-border text-sm">
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default GuidelinesConfig;