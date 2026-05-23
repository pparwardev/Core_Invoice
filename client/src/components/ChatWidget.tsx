import { useState, useRef, useEffect } from 'react';
import api from '../api/client';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'vendy';
  timestamp: number;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const WELCOME_MSG: Message = {
  id: 0,
  text: "Hey! 👋 Main hoon **Vendy** — tumhari vendor info girl! Vendors, POs, billing, payments — kuch bhi poocho, main bata dungi. Bolo, kya help chahiye?",
  sender: 'vendy',
  timestamp: Date.now(),
};

const QUICK_ACTIONS = [
  { label: '📋 Show all vendors', query: 'Show me all active vendors with their services' },
  { label: '🔍 Search vendor', query: 'Search vendor ' },
  { label: '📄 Recent POs', query: 'Show me recent purchase orders with their status' },
  { label: '💰 Pending payments', query: 'Show all pending payments and their amounts' },
  { label: '⏰ Expiring POs', query: 'Which POs are expiring in the next 30 days?' },
  { label: '📊 Billing summary', query: 'Give me this month billing summary' },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-teal-100 text-teal-800 px-1 rounded text-[11px]">$1</code>')
    .replace(/^### (.+)$/gm, '<h4 class="font-bold text-sm mt-2 mb-1 text-teal-800">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-bold text-base mt-2 mb-1 text-teal-800">$1</h3>')
    .replace(/^• (.+)$/gm, '<div class="flex gap-1.5 ml-1"><span class="text-teal-500 shrink-0">•</span><span>$1</span></div>')
    .replace(/^- (.+)$/gm, '<div class="flex gap-1.5 ml-1"><span class="text-gray-400 shrink-0">–</span><span>$1</span></div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="flex gap-1.5 ml-1"><span class="text-teal-600 font-medium shrink-0">$1.</span><span>$2</span></div>')
    .replace(/💡(.+)$/gm, '<div class="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800"><span>💡</span>$1</div>')
    .replace(/✅/g, '<span class="text-green-500">✅</span>')
    .replace(/❌/g, '<span class="text-red-500">❌</span>')
    .replace(/⚠️/g, '<span class="text-orange-500">⚠️</span>')
    .replace(/₹([\d,]+)/g, '<span class="font-mono font-semibold text-teal-700">₹$1</span>')
    .replace(/\n/g, '<br/>');

  // Table detection
  if (html.includes('|')) {
    html = html.replace(/((?:\|[^|<]+)+\|<br\/>)+/g, (match) => {
      const rows = match.split('<br/>').filter(r => r.trim() && r.includes('|'));
      if (rows.length < 2) return match;
      let table = '<div class="overflow-x-auto my-2 rounded-lg border border-teal-100"><table class="w-full text-[11px]">';
      rows.forEach((row, i) => {
        const cells = row.split('|').filter(c => c.trim() && !c.match(/^[\s-]+$/));
        if (cells.length === 0) return;
        if (row.match(/^[\s|:-]+$/)) return;
        const tag = i === 0 ? 'th' : 'td';
        const cls = i === 0 ? 'bg-teal-50 font-semibold text-teal-800' : 'border-t border-teal-50';
        table += `<tr>${cells.map(c => `<${tag} class="px-2 py-1.5 ${cls}">${c.trim()}</${tag}>`).join('')}</tr>`;
      });
      table += '</table></div>';
      return table;
    });
  }
  return html;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [vendyState, setVendyState] = useState<'idle' | 'greeting' | 'listening' | 'thinking' | 'found' | 'celebrating' | 'reading' | 'confused'>('idle');
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try { return JSON.parse(localStorage.getItem('vendy_sessions') || '[]'); } catch { return []; }
  });
  const [currentSessionId, setCurrentSessionId] = useState(generateId());
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (sessions.length > 0) localStorage.setItem('vendy_sessions', JSON.stringify(sessions.slice(0, 20)));
  }, [sessions]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isTyping]);
  useEffect(() => { if (isOpen) { inputRef.current?.focus(); setVendyState('greeting'); setTimeout(() => setVendyState('idle'), 3000); } }, [isOpen]);

  // Track user typing for listening state
  useEffect(() => {
    if (input.length > 0 && !isTyping) setVendyState('listening');
    else if (!isTyping && vendyState === 'listening') setVendyState('idle');
  }, [input]);

  const saveSession = () => {
    const userMsgs = messages.filter(m => m.sender === 'user');
    if (userMsgs.length === 0) return;
    const session: ChatSession = { id: currentSessionId, title: userMsgs[0].text.substring(0, 35), messages, createdAt: messages[1]?.timestamp || Date.now() };
    setSessions(prev => [session, ...prev.filter(s => s.id !== session.id)].slice(0, 20));
  };

  const startNewChat = () => { saveSession(); setMessages([WELCOME_MSG]); setCurrentSessionId(generateId()); setShowHistory(false); setShowQuickActions(true); nextId.current = 1; };
  const loadSession = (s: ChatSession) => { saveSession(); setMessages(s.messages); setCurrentSessionId(s.id); setShowHistory(false); setShowQuickActions(false); nextId.current = Math.max(...s.messages.map(m => m.id)) + 1; };
  const deleteSession = (id: string) => { setSessions(prev => prev.filter(s => s.id !== id)); if (currentSessionId === id) startNewChat(); };

  const sendMessage = async (text?: string) => {
    const msgText = text || input.trim();
    if (!msgText || isTyping) return;

    setShowQuickActions(false);
    const userMsg: Message = { id: nextId.current++, text: msgText, sender: 'user', timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setVendyState('thinking');

    try {
      const history = messages.filter(m => m.id > 0).slice(-8).map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));
      const res = await api.post('/chat', { message: msgText, history });
      setVendyState('found');
      setTimeout(() => setVendyState('reading'), 1500);
      setTimeout(() => setVendyState('idle'), 5000);
      const botMsg: Message = { id: nextId.current++, text: res.data.reply, sender: 'vendy', timestamp: Date.now() };
      setMessages(prev => [...prev, botMsg]);
      setTimeout(() => saveSession(), 500);
    } catch {
      setVendyState('confused');
      setTimeout(() => setVendyState('idle'), 4000);
      setMessages(prev => [...prev, { id: nextId.current++, text: "Oops! 😅 I couldn't process that. Can you try rephrasing?", sender: 'vendy', timestamp: Date.now() }]);
    }
    setIsTyping(false);
  };

  const getSuggestions = (): string[] => {
    const lastBot = [...messages].reverse().find(m => m.sender === 'vendy');
    if (!lastBot) return [];
    const suggestions: string[] = [];
    lastBot.text.split('\n').forEach(line => {
      const match = line.match(/💡\s*['"]?(.+?)['"]?\s*$/);
      if (match && match[1].length > 10 && match[1].length < 80) suggestions.push(match[1].replace(/['"?*]/g, '').trim());
    });
    return suggestions.slice(0, 3);
  };

  // Vendy avatar image based on state
  const getVendyImage = () => `/vendy/vendy_${vendyState}.png`;
  const getVendyAnimation = () => {
    switch (vendyState) {
      case 'idle': return 'animate-[vendyFloat_3s_ease-in-out_infinite]';
      case 'greeting': return 'animate-[vendyBounce_0.6s_ease-out]';
      case 'listening': return 'animate-[vendyLean_2s_ease-in-out_infinite]';
      case 'thinking': return 'animate-[vendyTilt_2s_ease-in-out_infinite]';
      case 'found': return 'animate-[vendyPop_0.5s_ease-out]';
      case 'celebrating': return 'animate-[vendyJump_0.8s_ease-out]';
      case 'reading': return 'animate-[vendySway_3s_ease-in-out_infinite]';
      case 'confused': return 'animate-[vendySway_2s_ease-in-out_infinite]';
      default: return '';
    }
  };
  const getVendyEmoji = () => {
    switch (vendyState) {
      case 'greeting': return '👋';
      case 'thinking': return '🤔';
      case 'found': return '✨';
      case 'celebrating': return '🎉';
      case 'reading': return '📖';
      case 'confused': return '❓';
      case 'listening': return '👂';
      default: return '💬';
    }
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-5 right-5 z-[9999] group">
        <style>{`
          @keyframes vendyFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
          @keyframes vendyBounce { 0%{transform:scale(0.8) translateY(10px)} 50%{transform:scale(1.05) translateY(-5px)} 100%{transform:scale(1) translateY(0)} }
          @keyframes vendyLean { 0%,100%{transform:rotate(0)} 50%{transform:rotate(3deg)} }
          @keyframes vendyTilt { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-5deg)} 75%{transform:rotate(5deg)} }
          @keyframes vendyPop { 0%{transform:scale(0.5)} 50%{transform:scale(1.15)} 100%{transform:scale(1)} }
          @keyframes vendyJump { 0%{transform:translateY(0)} 30%{transform:translateY(-15px)} 60%{transform:translateY(-5px)} 100%{transform:translateY(0)} }
          @keyframes vendySway { 0%,100%{transform:translateX(0)} 50%{transform:translateX(3px)} }
          @keyframes vendyPulse { 0%,100%{box-shadow:0 0 0 0 rgba(13,115,119,0.4)} 50%{box-shadow:0 0 0 8px rgba(13,115,119,0)} }
        `}</style>
        <button
          onClick={() => setIsOpen(true)}
          className="relative w-16 h-16 rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all overflow-hidden border-2 border-teal-400"
          style={{ background: 'linear-gradient(135deg, #0D7377, #14919B)', animation: 'vendyPulse 2s infinite' }}
        >
          <img src="/vendy/vendy_idle.png" alt="Vendy" className="w-full h-full object-cover" style={{ animation: 'vendyFloat 3s ease-in-out infinite' }} onError={(e) => { e.currentTarget.src = '/vendy/vendy_greeting.png'; }} />
        </button>
        <div className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-md px-3 py-1.5 text-xs text-gray-700 opacity-0 group-hover:opacity-100 transition whitespace-nowrap border border-teal-100">
          Hey! Ask me anything ✨
        </div>
      </div>
    );
  }

  const panelClass = isExpanded
    ? 'fixed inset-4 z-[9999]'
    : 'fixed bottom-5 right-5 w-[400px] h-[560px] z-[9999]';

  return (
    <div className={`${panelClass} flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-teal-200`} style={{ background: '#FFF8F0' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0" style={{ background: 'linear-gradient(135deg, #0D7377, #14919B)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-white/50 overflow-hidden bg-teal-600" style={{ animation: vendyState === 'thinking' ? 'vendyTilt 2s ease-in-out infinite' : vendyState === 'greeting' ? 'vendyBounce 0.6s ease-out' : 'vendyFloat 3s ease-in-out infinite' }}>
            <img src={getVendyImage()} alt="Vendy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = '/vendy/vendy_idle.png'; }} />
          </div>
          <div>
            <div className="text-white text-sm font-bold">Vendy</div>
            <div className="text-teal-200 text-[10px]">● Your Vendor Info Buddy {getVendyEmoji()}</div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setShowHistory(!showHistory)} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition text-sm" title="History">📋</button>
          <button onClick={startNewChat} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition text-sm" title="New Chat">✨</button>
          <button onClick={() => setIsExpanded(!isExpanded)} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition text-sm" title={isExpanded ? 'Minimize' : 'Expand'}>{isExpanded ? '⊟' : '⊞'}</button>
          <button onClick={() => { saveSession(); setIsOpen(false); setIsExpanded(false); }} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition text-sm" title="Close">✕</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* History Sidebar */}
        {showHistory && (
          <div className="w-44 border-r border-teal-100 bg-white overflow-y-auto shrink-0">
            <div className="p-2 border-b border-teal-100 bg-teal-50">
              <div className="text-[10px] text-teal-700 font-bold uppercase">Chat History</div>
            </div>
            {sessions.length === 0 ? (
              <div className="p-3 text-[11px] text-gray-400 text-center">No previous chats</div>
            ) : sessions.map(s => (
              <div key={s.id} onClick={() => loadSession(s)} className={`p-2 border-b border-gray-50 cursor-pointer hover:bg-teal-50 transition ${s.id === currentSessionId ? 'bg-teal-50 border-l-2 border-l-teal-500' : ''}`}>
                <div className="text-[11px] text-gray-700 font-medium truncate">{s.title}</div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[9px] text-gray-400">{timeAgo(s.createdAt)}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="text-[9px] text-red-400 hover:text-red-600">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
                {msg.sender === 'vendy' && (
                  <div className="w-7 h-7 rounded-full shrink-0 overflow-hidden border border-teal-200 bg-teal-100 flex items-center justify-center mt-0.5">
                    <img src="/vendy/vendy_idle.png" alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display='none'; }} />
                  </div>
                )}
                <div className={`max-w-[80%] group relative ${msg.sender === 'user'
                  ? 'bg-teal-600 text-white rounded-2xl rounded-br-sm px-3 py-2'
                  : 'bg-white text-gray-800 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm border border-teal-50'
                }`}>
                  {msg.sender === 'vendy' ? (
                    <div className="text-[12px] leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
                  ) : (
                    <div className="text-[12px]">{msg.text}</div>
                  )}
                  {msg.sender === 'vendy' && msg.id > 0 && (
                    <button onClick={() => navigator.clipboard.writeText(msg.text)} className="absolute -bottom-4 right-1 opacity-0 group-hover:opacity-100 text-[9px] text-gray-400 hover:text-teal-600 transition bg-white px-1.5 py-0.5 rounded shadow-sm border">
                      📋 Copy
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-2 items-start">
                <div className="w-7 h-7 rounded-full shrink-0 overflow-hidden border border-teal-200 bg-teal-100 flex items-center justify-center">
                  <img src="/vendy/vendy_thinking.png" alt="" className="w-full h-full object-cover" style={{animation:'vendyTilt 2s ease-in-out infinite'}} onError={(e) => { e.currentTarget.style.display='none'; }} />
                </div>
                <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-teal-50">
                  <div className="flex gap-1 items-center">
                    <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="text-[10px] text-teal-500 ml-2">Vendy is thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {showQuickActions && messages.length <= 1 && (
            <div className="px-3 pb-2">
              <div className="text-[10px] text-gray-500 mb-1.5 font-medium">Quick actions:</div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ACTIONS.map((action, i) => (
                  <button key={i} onClick={() => sendMessage(action.query)} className="text-[10px] bg-white border border-teal-200 text-teal-700 px-2.5 py-1.5 rounded-full hover:bg-teal-50 hover:border-teal-300 transition shadow-sm">
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up Suggestions */}
          {!isTyping && !showQuickActions && getSuggestions().length > 0 && (
            <div className="px-3 pb-1.5 flex flex-wrap gap-1">
              {getSuggestions().map((s, i) => (
                <button key={i} onClick={() => sendMessage(s)} className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-100 transition truncate max-w-[200px]">
                  💡 {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-teal-100 bg-white shrink-0">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask Vendy anything..."
                className="flex-1 px-3 py-2.5 text-sm border border-teal-200 rounded-xl focus:ring-2 focus:ring-teal-300 focus:border-transparent outline-none bg-gray-50"
                disabled={isTyping}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isTyping || !input.trim()}
                className="px-4 py-2.5 rounded-xl font-medium text-sm text-white hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #0D7377, #14919B)' }}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
