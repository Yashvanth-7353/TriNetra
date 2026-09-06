import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createConversation } from '../services/api';

/**
 * Shared active investigation conversation.
 *
 * AskTriNetra and the Voice Copilot both send queries through the SAME
 * conversation id so follow-ups ("who is connected to it?", "show their
 * transaction trail") resolve against one investigation context and land in
 * the same persistent chat history. There is exactly one conversation model —
 * this context only shares the id between the two input surfaces.
 *
 * One conversation per login session: `ensureConversation` is idempotent and
 * race-safe — the first caller creates the conversation, every later caller
 * (including concurrent ones) receives the SAME id for the lifetime of the
 * authenticated session. The provider lives inside AppShell, so it unmounts
 * on logout and a fresh login starts with a new conversation while the old
 * one stays persisted server-side.
 */
interface ConversationState {
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
  /** Returns the active conversation id, creating one ONLY when none exists.
   *  Never creates a second conversation while one is active, and concurrent
   *  callers share a single in-flight creation. */
  ensureConversation: () => Promise<string | null>;
  /** Bumped whenever the active conversation changes (sidebar refresh). */
  version: number;
}

const ConversationContext = createContext<ConversationState | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Latest id mirrored in a ref so the memoized ensureConversation always
  // sees the current active conversation without a stale closure.
  const conversationIdRef = useRef<string | null>(null);
  // In-flight creation promise: concurrent ensureConversation() calls share
  // ONE creation instead of racing to create several conversations.
  const pendingCreationRef = useRef<Promise<string | null> | null>(null);

  const applyConversationId = useCallback((id: string | null) => {
    conversationIdRef.current = id;
    setConversationIdState(id);
    setVersion((v) => v + 1);
  }, []);

  const setConversationId = useCallback(
    (id: string | null) => applyConversationId(id),
    [applyConversationId]
  );

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    // Reuse the active conversation — never create a second one mid-session.
    if (conversationIdRef.current) return conversationIdRef.current;
    // Race guard: a caller already creating gets that same conversation.
    if (pendingCreationRef.current) return pendingCreationRef.current;
    pendingCreationRef.current = (async () => {
      try {
        const conversation = await createConversation();
        conversationIdRef.current = conversation.conversation_id;
        setConversationIdState(conversation.conversation_id);
        setVersion((v) => v + 1);
        return conversation.conversation_id;
      } catch (err) {
        console.warn('Failed to create conversation:', err);
        return null;
      } finally {
        pendingCreationRef.current = null;
      }
    })();
    return pendingCreationRef.current;
  }, []);

  const value = useMemo(
    () => ({ conversationId, setConversationId, ensureConversation, version }),
    [conversationId, setConversationId, ensureConversation, version]
  );

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation(): ConversationState {
  const ctx = useContext(ConversationContext);
  if (!ctx) {
    throw new Error('useConversation must be used within ConversationProvider');
  }
  return ctx;
}