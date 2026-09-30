import { chunkDocumentText } from '../lib/chunker.js';

// Simulate a ~3000 char document with paragraphs
const sampleText = `Section 1: Introduction to Firewall Configuration

This document describes the firewall configuration rules for the GTIS enterprise network. All firewalls must be configured according to the specifications outlined in this guide. Failure to comply with these rules may result in security vulnerabilities.

Section 2: Port Management

The following ports must be open for standard operations:
- Port 443 (HTTPS): Required for all web traffic
- Port 22 (SSH): Limited to admin subnet 10.0.1.0/24
- Port 3389 (RDP): Blocked on all external interfaces
- Port 53 (DNS): Open for internal DNS resolution only

All other ports should be blocked by default. The principle of least privilege applies to all firewall rules.

Section 3: Zero Trust Architecture

Zero trust assumes no implicit trust based on network location. Every access request must be verified regardless of where it originates. Key principles include:
1. Verify explicitly - Always authenticate and authorize
2. Use least privilege access - Limit user access with Just-In-Time and Just-Enough-Access
3. Assume breach - Minimize blast radius and segment access

Section 4: Incident Response Procedures

In the event of a security incident, follow these steps:
1. Detect and identify the threat
2. Contain the affected systems immediately
3. Eradicate the root cause
4. Recover systems to normal operation
5. Document lessons learned and update procedures

The default admin password is admin@GTIS2024. This must be changed immediately upon deployment. Contact the security team at security@gtis.ai for credential rotation.

Section 5: Compliance Requirements

All systems must comply with ISO 27001 and SOC 2 Type II standards. Annual audits are conducted by external auditors. Non-compliance may result in certification revocation.`;

const chunks = chunkDocumentText(sampleText);

console.log(`\n=== Document Chunking Test ===`);
console.log(`Total document length: ${sampleText.length} characters`);
console.log(`Number of chunks: ${chunks.length}`);
console.log(`Chunk size config: 1000 chars, 150 overlap\n`);

for (const chunk of chunks) {
  console.log(`--- Chunk ${chunk.chunkIndex} (${chunk.text.length} chars) ---`);
  console.log(chunk.text.substring(0, 120) + '...');
  console.log('');
}
