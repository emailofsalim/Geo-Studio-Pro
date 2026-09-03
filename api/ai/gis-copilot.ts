import { gisCopilot } from '../../src/server/aiService';
import { passesGuard, VercelLikeRequest, VercelLikeResponse } from '../_shared';

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (!passesGuard(req, res, process.env)) return;
  const result = await gisCopilot(req.body, process.env);
  res.status(result.status).json(result.body);
}
