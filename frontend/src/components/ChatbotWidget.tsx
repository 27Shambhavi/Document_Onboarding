import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme, useAuth } from '../App';
import { apiClient } from '../api/client';
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Bot,
  User,
  Trash2,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';

interface SourceReference {
  table: string;
  id: number;
  file_name?: string;
  document_name?: string;
  document_type?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  sources?: SourceReference[];
}

const FALLBACK_SUGGESTIONS = [
  'What candidate documents are in the system?',
  'What is the document quality of the latest upload?',
  'Check active guideline compliance policies',
];

interface SourcesCollapsibleProps {
  sources: SourceReference[];
  isDark: boolean;
}

const SourcesCollapsible: React.FC<SourcesCollapsibleProps> = ({ sources, isDark }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-2.5 pt-2 border-t border-slate-700/40 dark:border-slate-700/40">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors cursor-pointer select-none rounded px-1.5 py-0.5 -ml-1 ${
          isDark
            ? 'text-indigo-400 hover:text-indigo-300 hover:bg-slate-700/50'
            : 'text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50'
        }`}
        aria-expanded={isOpen}
      >
        <FileText className="w-3 h-3 flex-shrink-0" />
        <span>Sources ({sources.length})</span>
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="mt-2 space-y-1 animate-in fade-in duration-150">
          <div className="flex flex-wrap gap-1">
            {sources.map((src, idx) => (
              <span
                key={idx}
                className={`text-[10px] px-2 py-0.5 rounded-md font-mono inline-flex items-center gap-1 ${
                  isDark
                    ? 'bg-slate-900/80 text-slate-300 border border-slate-700/80'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
                title={
                  src.document_name
                    ? `${src.document_name} (${src.table} #${src.id})`
                    : `${src.table} #${src.id}`
                }
              >
                <span>{src.file_name || src.document_name || `Record #${src.id}`}</span>
                {src.document_type && (
                  <span className="text-[9px] opacity-75 font-sans">
                    ({src.document_type})
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const ChatbotWidget: React.FC = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { isAuthenticated } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your DocVerify RAG Assistant. Ask me anything about your uploaded candidate records, document quality, or extracted data.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Fetch dynamic suggestions based on company's latest uploaded documents
  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;
    const fetchSuggestions = async () => {
      try {
        const res = await apiClient.get('/chatbot/suggestions');
        if (isMounted && res.data?.suggestions && res.data.suggestions.length > 0) {
          setSuggestions(res.data.suggestions);
        }
      } catch {
        // Fallback suggestions remain intact
      }
    };
    fetchSuggestions();
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, isOpen]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // If user is not logged in, do not render widget
  if (!isAuthenticated) {
    return null;
  }

  const handleSend = async (queryToSend?: string) => {
    const textToSend = (queryToSend || inputQuery).trim();
    if (!textToSend || loading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setLoading(true);

    try {
      const response = await apiClient.post('/chatbot/query', {
        question: textToSend,
        session_id: sessionId || undefined,
      });

      if (response.data?.session_id) {
        setSessionId(response.data.session_id);
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: response.data.answer || 'No response returned.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: response.data.sources || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to retrieve answer. Please try again.';

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          sender: 'assistant',
          text: `Error: ${errorMsg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSessionId(null);
    setMessages([
      {
        id: 'welcome',
        sender: 'assistant',
        text: 'Chat history cleared. How can I help you with your candidate documents today?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Simple Markdown text renderer for bold and bullet points
  const renderFormattedText = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      // Bullet items
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const bulletText = line.trim().substring(2);
        return (
          <li key={idx} className="ml-4 list-disc text-xs leading-relaxed">
            {formatBold(bulletText)}
          </li>
        );
      }
      return (
        <p key={idx} className="text-xs leading-relaxed min-h-[1.1rem]">
          {formatBold(line)}
        </p>
      );
    });
  };

  const formatBold = (str: string) => {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-indigo-400 dark:text-indigo-300">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {/* ========================================================= */}
      {/* 1. EXPANDED CHAT WINDOW */}
      {/* ========================================================= */}
      {isOpen && (
        <div
          className={`w-[370px] sm:w-[410px] max-w-[calc(100vw-32px)] h-[540px] max-h-[calc(100vh-100px)] rounded-2xl flex flex-col overflow-hidden shadow-2xl border transition-all duration-200 mb-4 animate-in fade-in slide-in-from-bottom-5 ${
            isDark
              ? 'bg-slate-900/95 backdrop-blur-xl border-slate-800 text-slate-100 shadow-slate-950/80'
              : 'bg-white/95 backdrop-blur-xl border-slate-200 text-slate-900 shadow-xl'
          }`}
        >
          {/* HEADER */}
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 text-white flex items-center justify-between shadow-md select-none">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
                <Bot className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-sm tracking-tight">DocVerify Assistant</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <span className="text-[11px] text-indigo-100/80 font-medium">
                  RAG Database Grounded
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/rag');
                }}
                title="Open Full History Page"
                className="p-1.5 rounded-lg hover:bg-white/20 text-indigo-100 hover:text-white transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              <button
                onClick={handleClear}
                title="Clear Chat History"
                className="p-1.5 rounded-lg hover:bg-white/20 text-indigo-100 hover:text-white transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Minimize Chat"
                className="p-1.5 rounded-lg hover:bg-white/20 text-indigo-100 hover:text-white transition-colors cursor-pointer"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* MESSAGE LIST BODY */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`flex items-start gap-2 max-w-[88%] ${
                    msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] ${
                      msg.sender === 'user'
                        ? 'bg-indigo-600 text-white'
                        : isDark
                        ? 'bg-slate-800 text-indigo-400 border border-slate-700'
                        : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                    }`}
                  >
                    {msg.sender === 'user' ? <User className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                  </div>

                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-xs shadow-sm ${
                      msg.sender === 'user'
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-tr-none'
                        : isDark
                        ? 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none'
                        : 'bg-slate-100 text-slate-800 border border-slate-200/80 rounded-tl-none'
                    }`}
                  >
                    <div className="space-y-1">{renderFormattedText(msg.text)}</div>

                    {/* SOURCE TRACEABILITY CITATIONS (COLLAPSED BY DEFAULT) */}
                    {msg.sources && msg.sources.length > 0 && (
                      <SourcesCollapsible sources={msg.sources} isDark={isDark} />
                    )}
                  </div>
                </div>

                <span className="text-[9px] text-slate-500 mt-1 px-8">
                  {msg.timestamp}
                </span>
              </div>
            ))}

            {/* LOADING STATE */}
            {loading && (
              <div className="flex items-start gap-2 max-w-[80%]">
                <div
                  className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] ${
                    isDark ? 'bg-slate-800 text-indigo-400 border border-slate-700' : 'bg-indigo-50 text-indigo-600'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div
                  className={`rounded-2xl rounded-tl-none px-3.5 py-2.5 text-xs flex items-center gap-2 ${
                    isDark
                      ? 'bg-slate-800/90 text-slate-300 border border-slate-700/60'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                  <span>Searching PostgreSQL records...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* QUICK SUGGESTIONS (IF ONLY WELCOME MESSAGE) */}
          {messages.length === 1 && suggestions.length > 0 && (
            <div className="px-3 pb-2 flex flex-col gap-1.5">
              <span className="text-[10px] text-slate-400 font-medium px-1">Suggested prompts:</span>
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(sug)}
                  className={`text-left text-[11px] px-2.5 py-1.5 rounded-lg transition-colors truncate border ${
                    isDark
                      ? 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {sug}
                </button>
              ))}
            </div>
          )}

          {/* INPUT BAR */}
          <div
            className={`p-3 border-t flex items-center gap-2 ${
              isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white'
            }`}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about candidates or documents..."
              className={`flex-1 px-3 py-2 rounded-xl text-xs border outline-none transition-colors ${
                isDark
                  ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-indigo-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
              }`}
            />
            <button
              onClick={() => handleSend()}
              disabled={!inputQuery.trim() || loading}
              className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 hover:from-indigo-500 hover:to-blue-400 text-white shadow-md shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              title="Send Message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. FLOATING BUBBLE BUTTON */}
      {/* ========================================================= */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group relative w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-blue-500 flex items-center justify-center text-white shadow-xl shadow-indigo-500/35 hover:shadow-indigo-500/55 hover:scale-105 active:scale-95 transition-all duration-300 border-2 border-white/20"
        title={isOpen ? 'Close Assistant' : 'Open Candidate RAG Assistant'}
      >
        {isOpen ? (
          <X className="w-6 h-6 transition-transform duration-200 group-hover:rotate-90" />
        ) : (
          <>
            <MessageSquare className="w-6 h-6 transition-transform duration-200 group-hover:scale-110" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-900 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            </span>
          </>
        )}
      </button>
    </div>
  );
};
