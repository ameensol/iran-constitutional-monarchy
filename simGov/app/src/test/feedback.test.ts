import { describe, expect, it } from 'vitest';
import { previewFeedbackAdapter, readFeedbackDraft, type FeedbackPayload } from '../feedback/adapter';

describe('feedback preview adapter', () => {
  it('saves an unsent local draft and reports preview status', async () => {
    const payload: FeedbackPayload = { locale: 'en', category: 'usability', message: 'Clearer labels, please.', page: '/en/community', consent: true };
    await expect(previewFeedbackAdapter.submit(payload)).resolves.toEqual({ status: 'preview' });
    expect(readFeedbackDraft()).toMatchObject(payload);
  });
});
