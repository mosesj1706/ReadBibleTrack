/**
 * A bearer token for the App Store Connect API.
 *
 *   node scripts/asc-token.mjs <issuer-id> <key-id>
 *
 * Prints the token and nothing else, so it can be dropped straight into a
 * curl header. Tokens last twenty minutes at most, by Apple's rule, so this
 * mints a fresh one per invocation rather than caching anything.
 *
 * The private key is read from ~/.appstoreconnect/private_keys/AuthKey_<id>.p8,
 * which is where Apple's own tools look. Nothing secret lives in this file: the
 * issuer and key ids identify an account rather than authorising anything, and
 * the key itself never enters the repository.
 */

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [issuer, keyId] = process.argv.slice(2);
if (!issuer || !keyId) {
  console.error('usage: node scripts/asc-token.mjs <issuer-id> <key-id>');
  process.exit(1);
}

const key = readFileSync(`${process.env.HOME}/.appstoreconnect/private_keys/AuthKey_${keyId}.p8`);

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'ES256', kid: keyId, typ: 'JWT' });
const body = b64({ iss: issuer, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });

const signer = createSign('SHA256');
signer.update(`${head}.${body}`);
// JWT wants the raw r||s pair. Node defaults to DER, which Apple rejects with
// a message about the token being malformed rather than about the encoding.
const signature = signer.sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');

process.stdout.write(`${head}.${body}.${signature}`);
