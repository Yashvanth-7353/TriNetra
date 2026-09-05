import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createConversation } from '../services/api';

/**
 * Shared active investigation conversation.
 *
 * AskTriNetra and the Voice Copilot both send queries through the SAME
 * conversation id so follow-ups ("who is connected to it?", "show their
 * transaction trail") resolve against one investigation context and land in
 * the same persistent chat history. There is exactly one conversation model —
 * this context only shares the id between the two input surfaces.
 */
interface ConversationState {
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
  /** Creates a conversation through the existing API when none is active. */
  ensureConversation: () => Promise<string | null>;
  /** Bumped whenever the active conversation changes (sidebar refresh). */
  version: number;
}

const ConversationContext = createContext<ConversationState | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const setConversationId = useCallback((id: string | null) => {
    setConversationIdState(id);
    setVersion((v) => v + 1);
  }, []);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    try {
      const conversation = await createConversation();
      setConversationIdState(conversation.conversation_id);
      setVersion((v) => v + 1);
      return conversation.conversation_id;
    } catch (err) {
      console.warn('Failed to create conversation:', err);
      return null;
    }
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