/**
 * Deterministic voice-safe answer + screen-action mapping for the Voice Copilot.
 *
 * VOICE IS AN INTERFACE, NOT AN INTELLIGENCE ENGINE. These functions never
 * invent facts: every number or phrase is derived from fields that the
 * backend investigation pipeline actually returned. No LLM is involved here
 * and no unsupported conclusion can be spoken.
 */

export type VoiceActionName =
  | 'OPEN_CASES'
  | 'OPEN_NETWORK'
  | 'OPEN_FINANCIAL_TRAIL'
  | 'OPEN_EVIDENCE_GRAPH'
  | 'OPEN_ANALYTICS'
  | 'OPEN_PATTERNS'
  | 'OPEN_FORECAST'
  | 'OPEN_OFFENDERS'
  | 'OPEN_ALERTS'
  | 'OPEN_NEXT_ACTIONS'
  | 'NONE';

export interface VoiceAction {
  action: VoiceActionName;
  label: string;
  route: string;
}

/** Strict whitelist: only known application destinations, no free-form routing. */
const ACTION_ROUTES: Record<Exclude<VoiceActionName, 'NONE'>, { label: string; route: string }> = {
  OPEN_CASES: { label: 'Open Case Explorer', route: '/cases' },
  OPEN_NETWORK: { label: 'Open Network Analysis', route: '/network' },
  OPEN_FINANCIAL_TRAIL: { label: 'Open Financial Trail', route: '/financial-trail' },
  OPEN_EVIDENCE_GRAPH: { label: 'Open Evidence Graph', route: '/ask' },
  OPEN_ANALYTICS: { label: 'Open Crime Analytics', route: '/analytics' },
  OPEN_PATTERNS: { label: 'Open Pattern Analytics', route: '/pattern-analytics' },
  OPEN_FORECAST: { label: 'Open Crime Forecast', route: '/forecast' },
  OPEN_OFFENDERS: { label: 'Open Offender Profiles', route: '/offenders' },
  OPEN_ALERTS: { label: 'Open Prevention Alerts', route: '/alerts' },
  OPEN_NEXT_ACTIONS: { label: 'Open Next Actions', route: '/ask' },
};

function toAction(name: VoiceActionName): VoiceAction | null {
  if (name === 'NONE') return null;
  const target = ACTION_ROUTES[name];
  return { action: name, label: target.label, route: target.route };
}

/** Maps the returned intent/engines to at most two whitelisted destinations. */
export function mapResponseToActions(data: any): VoiceAction[] {
  if (!data) return [];
  const intent: string = data.intent_detected || data.investigation?.intent_detected || '';
  const engines: string[] =
    (data.investigation?.plan?.engines as string[] | undefined) || [];
  const hasEvidenceGraph =
    Boolean(data.graph_data?.nodes?.length) ||
    Boolean(data.investigation?.combined_evidence_graph?.nodes?.length);

  const byIntent: Partial<Record<string, VoiceActionName>> = {
    criminal_network: 'OPEN_NETWORK',
    financial_intelligence: 'OPEN_FINANCIAL_TRAIL',
    case_similarity: 'OPEN_CASES',
    narrative_similarity: 'OPEN_CASES',
    narrative_rag: 'OPEN_CASES',
    pattern_detection: 'OPEN_PATTERNS',
    trend_analysis: 'OPEN_ANALYTICS',
    forecasting: 'OPEN_FORECAST',
    risk_analysis: 'OPEN_OFFENDERS',
    behaviour_analysis: 'OPEN_OFFENDERS',
    exact_case_lookup: 'OPEN_CASES',
    case_search: 'OPEN_CASES',
    case_lookup: 'OPEN_CASES',
    prevention_alert: 'OPEN_ALERTS',
    next_best_action: 'OPEN_NEXT_ACTIONS',
  };

  const primary = byIntent[intent] || (engines.includes('criminal_network') ? 'OPEN_NETWORK' : undefined);

  const actions: VoiceAction[] = [];
  const pushed = new Set<VoiceActionName>();
  const push = (name: VoiceActionName) => {
    const action = toAction(name);
    if (action && !pushed.has(name)) {
      actions.push(action);
      pushed.add(name);
    }
  };

  if (primary) push(primary);
  if (hasEvidenceGraph) push('OPEN_EVIDENCE_GRAPH');
  // Case evidence always offers the Case Explorer as a secondary destination.
  if (data.investigation?.evidence_inventory?.has_case_evidence && actions.length < 2) {
    push('OPEN_CASES');
  }
  return actions.slice(0, 2);
}

function firstSentences(text: string, maxChars = 340): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastPeriod = cut.lastIndexOf('. ');
  return lastPeriod > 60 ? cut.slice(0, lastPeriod + 1) : cut + '.';
}

/**
 * Builds a short, spoken-safe answer from the structured investigation
 * response. Every claim is grounded in a field the backend actually returned.
 */
export function buildVoiceAnswer(data: any): string {
  if (!data || typeof data !== 'object') {
    return "I couldn't complete that investigation. Please try again.";
  }

  const intent: string = data.intent_detected || data.investigation?.intent_detected || '';
  const scope = data.lookup_scope || data.investigation?.plan?.resolved_scope || null;
  const inventory = data.investigation?.evidence_inventory || null;

  // Deterministic scope failure — never a broad fallback answer.
  if (scope && (scope.status === 'failed' || scope.status === 'partial')) {
    return "I couldn't resolve the scope of that request. Please check the crime or location and try again.";
  }

  // Exact-case answers are deterministic record facts — speak them directly.
  if (intent === 'exact_case_lookup' && data.answer) {
    return firstSentences(data.answer);
  }

  // Context-required intents with no entities must not be broadened.
  const plan = data.investigation?.plan || {};
  if (plan.requires_context || (intent && intent.includes('context'))) {
    return 'I need a case or investigation context before I can show that trail.';
  }

  // Honest no-evidence state.
  if (inventory) {
    const hasAny =
      inventory.has_case_evidence ||
      inventory.has_pattern_evidence ||
      inventory.has_accused_evidence ||
      inventory.has_financial_evidence ||
      inventory.has_rag_evidence;
    if (!hasAny) {
      return "I couldn't find sufficient evidence to establish that conclusion.";
    }
  }

  // Grounded summary from actual counts returned by the pipeline.
  if (inventory) {
    const parts: string[] = [];
    if (intent === 'financial_intelligence' || data.investigation?.plan?.engines?.includes('financial_intelligence')) {
      const txns = Number(inventory.total_financial_transactions) || 0;
      const links = Number(inventory.total_cross_case_links) || 0;
      if (txns > 0) {
        parts.push(`I found ${txns} transactions`);
        if (links > 0) parts.push(`${links} cross-case links`);
      }
      if (parts.length > 0) {
        return firstSentences(parts.join(' and ') + '. I have opened the financial trail.');
      }
    }
    const cases = Number(inventory.total_cases) || 0;
    if (cases > 0) {
      const district = scope?.district || scope?.district_name_resolved || '';
      parts.push(`I found ${cases} cases${district ? ` in ${district}` : ''}`);
    }
    const patterns = Number(inventory.total_patterns) || 0;
    if (patterns > 0) parts.push(`${patterns} recurring patterns`);
    const accused = Array.isArray(inventory.accused_ids) ? inventory.accused_ids.length : 0;
    if (accused > 0) parts.push(`${accused} accused profiles`);
    if (parts.length > 0) {
      return firstSentences(
        parts.join(', ') + '. I have displayed them on screen.'
      );
    }
  }

  // Structured response card finding (already evidence-grounded by the backend).
  const card = data.investigation?.response_card;
  if (card?.finding) {
    return firstSentences(card.finding);
  }

  // Last resort: the backend's own answer text, trimmed for speech.
  if (data.answer) {
    return firstSentences(data.answer);
  }

  return "I couldn't find sufficient evidence for that request.";
}