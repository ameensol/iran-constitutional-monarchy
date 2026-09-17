export type FeedbackCategory = 'usability' | 'content' | 'constitution' | 'technical' | 'other';

export interface FeedbackPayload {
  name?: string;
  email?: string;
  locale: 'en' | 'fa';
  category: FeedbackCategory;
  message: string;
  page: string;
  consent: true;
}
export interface FeedbackAdapter {
  submit(payload: FeedbackPayload): Promise<{ status: 'preview' | 'sent'; reference?: string }>;
}

const DRAFT_KEY = 'constitution-lab-feedback-draft';

export const previewFeedbackAdapter: FeedbackAdapter = {
  async submit(payload) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...payload, savedAt: new Date().toISOString() }));
    return { status: 'preview' };
  },
};

export const httpFeedbackAdapter: FeedbackAdapter = {
  async submit(payload) {
    const endpoint = import.meta.env.VITE_FEEDBACK_ENDPOINT;
    if (!endpoint) return previewFeedbackAdapter.submit(payload);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Feedback endpoint returned ${response.status}`);
    const body = await response.json() as { reference?: string };
    return { status: 'sent', reference: body.reference };
  },
};

export function readFeedbackDraft(): Partial<FeedbackPayload> | null {
  try {
    const value = localStorage.getItem(DRAFT_KEY);
    return value ? JSON.parse(value) as Partial<FeedbackPayload> : null;
  } catch {
    return null;
  }
}
