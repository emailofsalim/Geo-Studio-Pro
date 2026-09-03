import { aiStatus } from '../../src/server/aiService';
import { applySecurityHeaders, VercelLikeRequest, VercelLikeResponse } from '../_shared';

export default function handler(_req: VercelLikeRequest, res: VercelLikeResponse) {
  applySecurityHeaders(res);
  res.status(200).json(aiStatus(process.env));
}
