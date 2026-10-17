import { proxyToBe } from "../../server/beProxy.js";

export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  return proxyToBe(req, res);
}
