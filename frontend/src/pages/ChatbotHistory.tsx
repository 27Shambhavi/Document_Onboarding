import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Sparkles,
  Bot,
  User,
  Trash2,
  FileText,
  Plus,
  Search,
  CheckCircle2,
  RefreshCw,
  Clock,
  ChevronRight,
  Database,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api/client';
import { PageHeaderActions } from '../components/PageHeaderActions';

interface SourceReference {
  table: string;
  id: number;
  file_name?: string;
  document_name?: string;
  document_type?: string;
}

interface ChatMessageItem {
  id: number | string;
  session_id: string;
  sender: 'user' | 'assistant';
  message_text: string;
  sources?: SourceReference[];
  records_found?: number;
  created_at: string;
}

interface ChatSessionSummary {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  latest_message?: string;
}

export const ChatbotHistory: React.FC = () => {
  // Session list state
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = useState('');
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Active session messages state
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryInput, setQueryInput] = useState('');

  // Suggestions & feedback
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Load sessions and suggestions on mount
  useEffect(() => {
    loadSessions();
    loadSuggestions();
  }, []);

  // When active session changes, load its message history
  useEffect(() => {
    if (activeSessionId) {
      loadSessionHistory(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isQuerying]);

  const loadSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const data = await api.getChatSessions(50);
      setSessions(data || []);
      if (data && data.length > 0 && !activeSessionId) {
        setActiveSessionId(data[0].session_id);
      }
    } catch (err: any) {
      console.warn('Failed to load chat sessions:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadSuggestions = async () => {
    try {
      const data = await api.getChatbotSuggestions();
      if (data?.suggestions && data.suggestions.length > 0) {
        setSuggestions(data.suggestions);
      } else {
        setSuggestions([
          'What candidate documents are in the system?',
          'What is the document quality of the latest upload?',
          'Check active guideline compliance policies',
        ]);
      }
    } catch {
      setSuggestions([
        'What candidate documents are in the system?',
        'What is the document quality of the latest upload?',
        'Check active guideline compliance policies',
      ]);
    }
  };

  const loadSessionHistory = async (sessionId: string) => {
    setIsLoadingMessages(true);
    setErrorNotice(null);
    try {
      const data = await api.getChatSessionHistory(sessionId);
      if (data?.messages) {
        setMessages(
          data.messages.map((m) => ({
            id: m.id,
            session_id: m.session_id,
            sender: m.sender,
            message_text: m.message_text,
            sources: m.sources,
            records_found: m.records_found,
            created_at: m.created_at,
          }))
        );
      }
    } catch (err: any) {
      setErrorNotice('Failed to load session history.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleCreateNewSession = () => {
    setActiveSessionId(null);
    setMessages([]);
    setQueryInput('');
    inputRef.current?.focus();
  };

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || queryInput).trim();
    if (!prompt || isQuerying) return;

    setErrorNotice(null);
    const tempUserId = `user-temp-${Date.now()}`;
    const userMsg: ChatMessageItem = {
      id: tempUserId,
      session_id: activeSessionId || 'new',
      sender: 'user',
      message_text: prompt,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQueryInput('');
    setIsQuerying(true);

    try {
      const res = await api.queryChatbot(prompt, activeSessionId || undefined);

      const botMsg: ChatMessageItem = {
        id: `bot-${Date.now()}`,
        session_id: res.session_id,
        sender: 'assistant',
        message_text: res.answer,
        sources: res.sources,
        records_found: res.records_found,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, botMsg]);

      // If this was a new session, set the activeSessionId and refresh list
      if (!activeSessionId || activeSessionId !== res.session_id) {
        setActiveSessionId(res.session_id);
      }
      loadSessions();
    } catch (err: any) {
      const errDetail =
        err?.response?.data?.detail ||
        err?.message ||
        'Error retrieving RAG document answer.';
      setErrorNotice(errDetail);

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          session_id: activeSessionId || 'err',
          sender: 'assistant',
          message_text: `⚠️ Query Failed: ${errDetail}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this conversation session and all its messages?')) {
      return;
    }

    try {
      await api.deleteChatSession(sessionId);
      setSuccessNotice('Session deleted.');
      setTimeout(() => setSuccessNotice(null), 3000);

      const updated = sessions.filter((s) => s.session_id !== sessionId);
      setSessions(updated);
      if (activeSessionId === sessionId) {
        if (updated.length > 0) {
          setActiveSessionId(updated[0].session_id);
        } else {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
    } catch {
      setErrorNotice('Failed to delete session.');
    }
  };

  const handleClearAllHistory = async () => {
    if (!window.confirm('Are you sure you want to permanently clear ALL conversation history?')) {
      return;
    }

    try {
      await api.clearChatHistory();
      setSessions([]);
      setActiveSessionId(null);
      setMessages([]);
      setSuccessNotice('All chat history cleared from PostgreSQL.');
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch {
      setErrorNotice('Failed to clear chat history.');
    }
  };

  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(sessionSearch.toLowerCase()) ||
      (s.latest_message && s.latest_message.toLowerCase().includes(sessionSearch.toLowerCase()))
  );

  const activeSession = sessions.find((s) => s.session_id === activeSessionId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* TOP HEADER ACTIONS */}
      <PageHeaderActions>
        <span className="hidden sm:inline-flex text-[11px] px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border dark:border-indigo-500/20 font-bold uppercase tracking-wider">
          PostgreSQL Grounded
        </span>
        <button
          onClick={handleCreateNewSession}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Conversation</span>
        </button>
        {sessions.length > 0 && (
          <button
            onClick={handleClearAllHistory}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-semibold transition-all cursor-pointer shadow-sm"
            title="Clear all stored chat history"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden sm:inline">Clear History</span>
          </button>
        )}
      </PageHeaderActions>

      {/* Notifications */}
      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorNotice}</span>
          </div>
          <button onClick={() => setErrorNotice(null)} className="text-rose-600 hover:text-rose-950 font-bold text-base leading-none cursor-pointer">
            &times;
          </button>
        </div>
      )}

      {successNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)} className="text-emerald-600 hover:text-emerald-950 font-bold text-base leading-none cursor-pointer">
            &times;
          </button>
        </div>
      )}

      {/* Main Two-Column Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Sessions Sidebar (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col h-[650px]">
          {/* Header & Search */}
          <div className="pb-3 mb-3 border-b border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Conversation Sessions</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                {sessions.length} Saved
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {isLoadingSessions ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                <span>Loading sessions...</span>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No sessions found</p>
                <p className="text-[11px] mt-0.5">Start a new query to initiate history tracking.</p>
              </div>
            ) : (
              filteredSessions.map((session) => {
                const isActive = session.session_id === activeSessionId;
                return (
                  <div
                    key={session.session_id}
                    onClick={() => setActiveSessionId(session.session_id)}
                    className={`group p-3 rounded-xl border text-xs transition-all cursor-pointer flex items-start justify-between gap-2 ${
                      isActive
                        ? 'bg-indigo-50/70 border-indigo-200 shadow-sm'
                        : 'bg-white hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <MessageSquare
                          className={`w-3.5 h-3.5 flex-shrink-0 ${
                            isActive ? 'text-indigo-600' : 'text-slate-400'
                          }`}
                        />
                        <span
                          className={`font-semibold truncate ${
                            isActive ? 'text-indigo-900' : 'text-slate-800'
                          }`}
                        >
                          {session.title || 'Untitled Query'}
                        </span>
                      </div>
                      {session.latest_message && (
                        <p className="text-[11px] text-slate-500 truncate mb-1">
                          {session.latest_message}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span>{new Date(session.updated_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{session.message_count} messages</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSession(e, session.session_id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-all cursor-pointer"
                      title="Delete this session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Active Chat Panel (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[650px] overflow-hidden">
          {/* Chat Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center font-bold text-xs">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  {activeSession ? activeSession.title : 'New RAG Assistant Inquiry'}
                </h3>
                <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <Database className="w-3 h-3 text-emerald-600" />
                  <span>Tenant Isolation Active (Company PostgreSQL Store)</span>
                </p>
              </div>
            </div>

            {activeSessionId && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                ID: {activeSessionId}
              </span>
            )}
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40">
            {isLoadingMessages ? (
              <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                <span>Retrieving conversation history from database...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="py-16 text-center max-w-md mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">Ask Your Document Knowledge Base</h4>
                <p className="text-xs text-slate-500 mt-1 mb-5">
                  Pose questions about candidate qualifications, 10th/12th marks, PAN/Aadhaar entities, or blueprint compliance directly to the AI.
                </p>

                {/* Quick suggestions */}
                <div className="text-left space-y-2">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Suggested Queries:
                  </div>
                  {suggestions.map((sug, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(sug)}
                      className="w-full text-left p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-200 text-xs text-slate-700 transition-all flex items-center justify-between cursor-pointer"
                    >
                      <span className="truncate">{sug}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={msg.id || index}
                  className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.sender === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center flex-shrink-0 mt-1">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-xl rounded-xl p-4 text-xs shadow-sm ${
                      msg.sender === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="leading-relaxed whitespace-pre-wrap font-sans">
                      {msg.message_text}
                    </div>

                    {/* Sources citation panel for assistant responses */}
                    {msg.sender === 'assistant' && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100">
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-indigo-600" />
                          <span>Grounded Document Sources ({msg.sources.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((src, sIdx) => (
                            <span
                              key={sIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] text-slate-700 font-mono"
                            >
                              <Layers className="w-2.5 h-2.5 text-slate-400" />
                              <span className="font-semibold">{src.file_name || src.document_name || 'Doc'}</span>
                              <span className="text-slate-400">({src.table} #{src.id})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div
                      className={`text-[9px] mt-2 ${
                        msg.sender === 'user' ? 'text-indigo-200 text-right' : 'text-slate-400 text-left'
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {msg.sender === 'user' && (
                    <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))
            )}

            {isQuerying && (
              <div className="flex gap-3 justify-start items-center">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm text-xs text-slate-500 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  <span>Searching PostgreSQL documents & synthesizing answer...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Dynamic Suggestion Pills */}
          {suggestions.length > 0 && messages.length > 0 && (
            <div className="px-5 py-2 border-t border-slate-200 bg-white flex items-center gap-2 overflow-x-auto text-[11px] text-slate-600">
              <span className="text-[10px] text-slate-400 font-bold uppercase flex-shrink-0">Suggestions:</span>
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(sug)}
                  disabled={isQuerying}
                  className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50"
                >
                  {sug}
                </button>
              ))}
            </div>
          )}

          {/* Input Bar */}
          <div className="p-3.5 border-t border-slate-200 bg-white flex items-center gap-2.5">
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about candidate marks, certificates, dates, or compliance..."
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isQuerying}
              className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm disabled:opacity-50"
            />

            <button
              onClick={() => handleSendMessage()}
              disabled={!queryInput.trim() || isQuerying}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isQuerying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatbotHistory;
