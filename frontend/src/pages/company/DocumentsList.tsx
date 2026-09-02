import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { storageUtil, getLabelFromId } from '../../utils/storage';
import type { StoredDocument } from '../../utils/storage';
import {
  Search,
  Eye,
  Trash2,
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  FileCode,
  RefreshCw
} from 'lucide-react';

export const DocumentsList: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    setDocuments(storageUtil.getDocuments());
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this document from history?')) {
      const updated = storageUtil.deleteDocument(id);
      setDocuments(updated);
    }
  };

  const getStatusBadge = (status: StoredDocument['status']) => {
    const base = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase border";
    switch (status) {
      case 'PROCESSED':
        return `${base} bg-cyan-500/10 text-cyan-500 border-cyan-500/20`;
      case 'ACTION_REQUIRED':
        return `${base} bg-amber-500/10 text-amber-500 border-amber-500/20`;
      case 'QUALITY_FAILED':
        return `${base} bg-rose-500/10 text-rose-500 border-rose-500/20`;
      case 'REJECTED':
        return `${base} bg-rose-500/10 text-rose-500 border-rose-500/20`;
      case 'PROCESSING':
      case 'PENDING':
        return `${base} bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse`;
      default:
        return `${base} bg-muted text-muted-foreground border-border`;
    }
  };

  const getStatusIcon = (status: StoredDocument['status']) => {
    switch (status) {
      case 'PROCESSED':
        return <CheckCircle className="h-3.5 w-3.5" />;
      case 'ACTION_REQUIRED':
        return <AlertCircle className="h-3.5 w-3.5" />;
      case 'QUALITY_FAILED':
      case 'REJECTED':
        return <XCircle className="h-3.5 w-3.5" />;
      default:
        return <RefreshCw className="h-3.5 w-3.5 animate-spin" />;
    }
  };

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = 
      doc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.requestId && doc.requestId.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesType = typeFilter === 'ALL' || getLabelFromId(doc.id, doc.label).toUpperCase() === typeFilter;
    
    let matchesStatus = true;
    if (statusFilter !== 'ALL') {
      matchesStatus = doc.status === statusFilter;
    }

    return matchesSearch && matchesType && matchesStatus;
  });

  const documentTypes = Array.from(new Set(documents.map(d => getLabelFromId(d.id, d.label))));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Onboarded Documents</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Manage candidate verification files, quality checklists, and AI compliance audit reports.
          </p>
        </div>
        <button
          onClick={() => navigate('/company/upload')}
          className="inline-flex items-center justify-center gap-2 h-11 px-5 border border-transparent rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 shadow-md transition-all"
        >
          + Upload Document
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-center transition-colors">
        {/* Search */}
        <div className="md:col-span-2 relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <input
            type="text"
            placeholder="Search by Document ID, Filename, Request ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-4 py-2.5 border border-border rounded-xl bg-background focus:outline-none text-sm placeholder:text-muted-foreground text-foreground"
          />
        </div>

        {/* Document Type Filter */}
        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="block w-full py-2.5 pl-4 pr-10 border border-border bg-card text-foreground rounded-xl focus:outline-none text-sm font-medium"
          >
            <option value="ALL">All Document Types</option>
            {documentTypes.map(t => (
              <option key={t} value={t.toUpperCase()}>{t}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full py-2.5 pl-4 pr-10 border border-border bg-card text-foreground rounded-xl focus:outline-none text-sm font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="PROCESSED">Processed / Cleared</option>
            <option value="ACTION_REQUIRED">Action Required</option>
            <option value="QUALITY_FAILED">Quality Check Failed</option>
            <option value="REJECTED">Rejected</option>
            <option value="PROCESSING">Processing</option>
          </select>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden transition-colors">
        {filteredDocs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-muted text-muted-foreground text-xs font-bold uppercase tracking-wider sticky top-0 backdrop-blur-xl">
                <tr>
                  <th className="px-6 py-4">Document ID</th>
                  <th className="px-6 py-4">File Source</th>
                  <th className="px-6 py-4">Label</th>
                  <th className="px-6 py-4">Compliance Status</th>
                  <th className="px-6 py-4">Pages</th>
                  <th className="px-6 py-4">Processed Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDocs.map((doc) => (
                  <tr
                    key={doc.id}
                    onClick={() => navigate(`/company/documents/${doc.id}`)}
                    className="hover:bg-primary/5 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-mono text-xs font-bold select-all text-foreground">
                      {doc.id}
                    </td>
                    <td className="px-6 py-4 max-w-[200px] truncate">
                      <div className="font-semibold text-foreground truncate">{doc.filename}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                        REQ: {doc.requestId}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-foreground">{getLabelFromId(doc.id, doc.label)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={getStatusBadge(doc.status)}>
                        {getStatusIcon(doc.status)}
                        {doc.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-foreground">
                      {doc.pages}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {new Date(doc.uploadedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => navigate(`/company/documents/${doc.id}`)}
                          title="View Compliance Details"
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-muted rounded-xl transition-all"
                        >
                          <Eye className="h-4.5 w-4.5" />
                        </button>
                        <button
                          onClick={() => navigate(`/company/documents/${doc.id}?view=json`)}
                          title="View Raw JSON response"
                          className="p-2 text-muted-foreground hover:text-cyan-500 hover:bg-muted rounded-xl transition-all"
                        >
                          <FileCode className="h-4.5 w-4.5" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(doc.id, e)}
                          title="Remove Record"
                          className="p-2 text-muted-foreground hover:text-red-500 hover:bg-muted rounded-xl transition-all"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-20 px-6 space-y-4">
            <div className="inline-flex p-4 bg-muted border border-border rounded-full text-muted-foreground">
              <FileText className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">No onboarding documents found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchQuery || typeFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'No documents match the configured search filter parameters.'
                  : 'Start the workflow by uploading and auditing employee/candidate documents.'}
              </p>
            </div>
            {(searchQuery || typeFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('ALL');
                  setStatusFilter('ALL');
                }}
                className="text-xs font-semibold text-primary hover:text-primary/80"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
