export type NegotiationFeedbackState = {
  refreshError: string | null;
  actionError: string | null;
};

export type NegotiationFeedbackEvent =
  | { type: "reset" }
  | { type: "refresh_succeeded" }
  | { type: "refresh_failed"; message: string }
  | { type: "action_started" }
  | { type: "action_succeeded" }
  | { type: "action_failed"; message: string };

export const INITIAL_NEGOTIATION_FEEDBACK: NegotiationFeedbackState = {
  refreshError: null,
  actionError: null,
};

export function reduceNegotiationFeedback(
  state: NegotiationFeedbackState,
  event: NegotiationFeedbackEvent,
): NegotiationFeedbackState {
  switch (event.type) {
    case "reset":
      return INITIAL_NEGOTIATION_FEEDBACK;
    case "refresh_succeeded":
      return state.refreshError === null
        ? state
        : { ...state, refreshError: null };
    case "refresh_failed":
      return state.refreshError === event.message
        ? state
        : { ...state, refreshError: event.message };
    case "action_started":
      return state.actionError === null
        ? state
        : { ...state, actionError: null };
    case "action_succeeded":
      return state.refreshError === null && state.actionError === null
        ? state
        : INITIAL_NEGOTIATION_FEEDBACK;
    case "action_failed":
      return state.actionError === event.message
        ? state
        : { ...state, actionError: event.message };
  }
}

export type NegotiationRefreshGuard = {
  capture(): number;
  invalidate(): number;
  isCurrent(epoch: number): boolean;
};

export function createNegotiationRefreshGuard(): NegotiationRefreshGuard {
  let epoch = 0;
  return {
    capture() {
      return epoch;
    },
    invalidate() {
      epoch += 1;
      return epoch;
    },
    isCurrent(candidate) {
      return candidate === epoch;
    },
  };
}
