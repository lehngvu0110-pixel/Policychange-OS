// Nạp các module UMD dùng chung theo đúng thứ tự phụ thuộc; mỗi module tự gắn vào globalThis.
import "./sha256.js";
import "./policy-engine.js";
import "./policy-data.js";
import "./policy-ledger.js";
import "./semantic-discovery.js";
import "./policy-prover.js";
import "./policy-workflow.js";
import "./policy-authz.js";
import "./policy-server.js";

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
export const Engine = g.PolicyChangeEngine;
export const Data = g.PolicyChangeData;
export const Ledger = g.PolicyChangeLedger;
export const Server = g.PolicyChangeServer;
